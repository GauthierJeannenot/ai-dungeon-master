import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { loadContextFiles } from '@/lib/context-loader'
import { callMCPTool, listMCPTools } from '@/lib/mcp-client'
import { loadSession, saveSession } from '@/lib/session-store'
import { DMRequest, DMResponse, GameState, ConversationTurn } from '@/lib/types'
import {
  logAnthropicUsage,
  logAnthropicUsageSummary,
  type AnthropicUsageLogEntry,
} from '@/lib/anthropic-usage'
import { logEvent, summarizeGameState } from '@/lib/server-logger'

export const maxDuration = 60

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

const MODEL = 'claude-haiku-4-5'
const MAX_TOOL_ITERATIONS = 3
const MAX_TOKENS = 400
const COMBAT_LOG_TAIL = 6
const INTERNAL_MCP_TOOLS = new Set(['replace_game_state'])

// Nombre de messages récents conservés verbatim avant compression.
// Au-delà, les plus anciens sont résumés en un paragraphe.
const HISTORY_KEEP_RECENT = 10  // 5 tours de jeu (player + dm par tour)
// Seuil en caractères déclenchant la compression des messages "old"
// (~4 chars = 1 token → 6000 chars ≈ 1500 tokens)
const HISTORY_COMPRESS_THRESHOLD_CHARS = 6000

// ── Cache des tools MCP ───────────────────────────────────────────────────────
let cachedMcpTools: Anthropic.Tool[] | null = null

async function getMcpTools(sessionId: string | undefined): Promise<Anthropic.Tool[]> {
  if (cachedMcpTools) {
    logEvent('debug', 'dm.mcp_tools.cache_hit', {
      sessionId,
      toolCount: cachedMcpTools.length,
      toolNames: cachedMcpTools.map(tool => tool.name),
    })
    return cachedMcpTools
  }
  logEvent('debug', 'dm.mcp_tools.load.start', { sessionId })
  const raw = await listMCPTools(sessionId)
  cachedMcpTools = raw
    .filter(t => !INTERNAL_MCP_TOOLS.has(t.name))
    .map(t => ({
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema as Anthropic.Tool['input_schema'],
    }))
  logEvent('info', 'dm.mcp_tools.load.ok', {
    sessionId,
    rawToolCount: raw.length,
    exposedToolCount: cachedMcpTools.length,
    exposedToolNames: cachedMcpTools.map(tool => tool.name),
  })
  return cachedMcpTools
}

function generateRequestId(): string {
  return `dm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function summarizeContentBlocks(blocks: Anthropic.ContentBlock[]): Array<Record<string, unknown>> {
  return blocks.map(block => {
    if (block.type === 'text') {
      return { type: 'text', textLength: block.text.length, text: block.text }
    }
    if (block.type === 'tool_use') {
      return { type: 'tool_use', id: block.id, name: block.name, input: block.input }
    }
    return { type: block.type }
  })
}

// ── Sérialisation compacte du game state ─────────────────────────────────────
function serializeGameState(gameState: GameState): string {
  const compact = {
    ...gameState,
    monsters: Object.fromEntries(
      Object.entries(gameState.monsters).filter(([, m]) => m.isAlive)
    ),
    combatLog: gameState.combatLog.slice(-COMBAT_LOG_TAIL),
  }
  return JSON.stringify(compact)
}

// ── Compression de l'historique ───────────────────────────────────────────────
// Appel séparé à Haiku pour résumer les anciens échanges en un paragraphe court.
// Le résumé est renvoyé au client qui le stocke et le renvoie à chaque requête.
async function compressHistory(
  oldTurns: ConversationTurn[],
  existingSummary: string | undefined,
  usageLog: AnthropicUsageLogEntry[],
  requestId: string
): Promise<string> {
  const startedAt = Date.now()
  const exchangeText = oldTurns
    .map(t => `${t.role === 'player' ? 'Joueur' : 'DM'}: ${t.content}`)
    .join('\n')

  logEvent('info', 'dm.history.compress.start', {
    requestId,
    oldTurns: oldTurns.length,
    exchangeTextLength: exchangeText.length,
    hasExistingSummary: Boolean(existingSummary),
    existingSummaryLength: existingSummary?.length ?? 0,
  })

  const prompt = existingSummary
    ? `Voici le résumé de la session jusqu'ici :\n${existingSummary}\n\nVoici les échanges suivants à intégrer au résumé :\n${exchangeText}\n\nÉcris un résumé mis à jour en 3-5 phrases : ce qui s'est passé, où en est le joueur, les éléments importants à retenir.`
    : `Résume ces échanges de jeu de rôle D&D en 3-5 phrases. Garde l'essentiel : actions, découvertes, état de la situation.\n\n${exchangeText}`

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 300,
    messages: [{ role: 'user', content: prompt }],
  })

  usageLog.push(logAnthropicUsage({
    requestId,
    operation: 'history.compress',
    model: MODEL,
    usage: response.usage,
    stopReason: response.stop_reason,
    metadata: {
      oldTurns: oldTurns.length,
      hasExistingSummary: Boolean(existingSummary),
    },
  }))

  const text = response.content.find(b => b.type === 'text')
  const summary = text && 'text' in text ? text.text : existingSummary ?? ''
  logEvent('info', 'dm.history.compress.ok', {
    requestId,
    durationMs: Date.now() - startedAt,
    summaryLength: summary.length,
    summary,
  })
  return summary
}

// ── Gestion de l'historique ───────────────────────────────────────────────────
// Retourne l'historique prêt à l'emploi + un éventuel nouveau résumé.
// La compression est déclenchée quand les messages "anciens" (au-delà de
// HISTORY_KEEP_RECENT) dépassent HISTORY_COMPRESS_THRESHOLD_CHARS.
async function processHistory(
  history: ConversationTurn[],
  existingSummary: string | undefined,
  usageLog: AnthropicUsageLogEntry[],
  requestId: string
): Promise<{ recent: ConversationTurn[]; newSummary: string | undefined }> {
  // Pas assez de messages pour avoir une partie "ancienne"
  if (history.length <= HISTORY_KEEP_RECENT) {
    logEvent('debug', 'dm.history.process.keep_all', {
      requestId,
      historyLength: history.length,
      keepRecent: HISTORY_KEEP_RECENT,
    })
    return { recent: history, newSummary: undefined }
  }

  const oldTurns = history.slice(0, history.length - HISTORY_KEEP_RECENT)
  const recent  = history.slice(-HISTORY_KEEP_RECENT)

  // Vérifie si la partie ancienne est suffisamment longue pour mériter la compression
  const oldText = oldTurns.map(t => t.content).join(' ')
  const needsCompression = oldText.length > HISTORY_COMPRESS_THRESHOLD_CHARS || !!existingSummary

  if (!needsCompression) {
    // Pas encore au seuil : on renvoie tout sans compresser
    logEvent('debug', 'dm.history.process.no_compression', {
      requestId,
      historyLength: history.length,
      oldTurns: oldTurns.length,
      recentTurns: recent.length,
      oldTextLength: oldText.length,
      thresholdChars: HISTORY_COMPRESS_THRESHOLD_CHARS,
    })
    return { recent: history, newSummary: undefined }
  }

  const newSummary = await compressHistory(oldTurns, existingSummary, usageLog, requestId)
  logEvent('info', 'dm.history.process.compressed', {
    requestId,
    historyLength: history.length,
    oldTurns: oldTurns.length,
    recentTurns: recent.length,
    oldTextLength: oldText.length,
    newSummaryLength: newSummary.length,
  })
  return { recent, newSummary }
}

// ── Conversion historique → messages Anthropic ────────────────────────────────
// Garantit l'alternance user/assistant requise par l'API.
// Les messages mécaniques (rôle 'mechanical') sont ignorés — déjà dans le game state.
function historyToAnthropicMessages(turns: ConversationTurn[]): Anthropic.MessageParam[] {
  const msgs: Anthropic.MessageParam[] = []

  for (const turn of turns) {
    const role: 'user' | 'assistant' = turn.role === 'player' ? 'user' : 'assistant'

    // Évite deux messages consécutifs du même rôle (invalide pour l'API Anthropic)
    const last = msgs[msgs.length - 1]
    if (last && last.role === role) continue

    msgs.push({ role, content: turn.content })
  }

  // L'historique doit finir par 'assistant' pour que le message actuel du joueur
  // soit le dernier 'user'. Si ça finit par 'user', on retire ce message
  // (il sera de toute façon ajouté comme message courant).
  if (msgs.length > 0 && msgs[msgs.length - 1].role === 'user') {
    msgs.pop()
  }

  return msgs
}

// ── System prompts ────────────────────────────────────────────────────────────
function buildStaticPrompt(): string {
  const ctx = loadContextFiles()

  return `# CONTRAINTE ABSOLUE — LIS CECI EN PREMIER

Tu résous EXACTEMENT et UNIQUEMENT l'action écrite par le joueur dans CE message.
PAS d'anticipation. PAS d'enchaînement. PAS de "et ensuite logiquement...".

Exemples INTERDITS :
- "un ami crie à la porte" → NE PAS le faire entrer, NE PAS le déplacer, NE PAS explorer.
- "j'avance vers la porte" → NE PAS ouvrir la porte, NE PAS entrer dans la pièce.
- "j'attaque le gobelin" → NE PAS résoudre le tour du monstre ensuite.

Après ta réponse : STOP total. Tu attends le prochain message du joueur.

---

Tu es un Dungeon Master de D&D 5e. Tu narre en français, au présent, de façon concise (1-3 phrases max).

PERSONNAGE:
${ctx.playerCharacter}

RÈGLES JOUEUR:
${ctx.playerRules}

RÈGLES DM:
${ctx.dmRules}

MODULE:
${ctx.adventureModule}

RÈGLES MÉCANIQUES:
- Tout calcul (attaque, dégâts, déplacement, HP, sauvegarde) → tools MCP obligatoires.
- Les tools MCP refusent les actions illégales (mauvais tour, cible morte, hors portée, déplacement trop long). Si un tool renvoie une erreur, narre sobrement pourquoi l'action échoue ou demande une action valide.
- Déplacement explicite du joueur → move_token AVANT de narrer.
- Début de combat → spawn_monster puis enter_combat (2 tools max), narre, STOP.
- Tour joueur en combat → resolve_attack ou saving_throw, puis next_turn, STOP.
- Tour monstre → resolve_attack du monstre, puis next_turn, STOP.
- Fin de combat avec adversaires encore actifs → end_combat avec force=true seulement si fuite, reddition ou accord narratif crédible.
- HP monstres : vigoureux / légèrement blessé / gravement blessé / à l'agonie.`
}

function buildDynamicPrompt(gameState: GameState, summaryContext: string | undefined): string {
  const parts: string[] = [`ÉTAT DU JEU: ${serializeGameState(gameState)}`]
  if (summaryContext) {
    parts.push(`RÉSUMÉ DE LA SESSION (échanges précédents compressés):\n${summaryContext}`)
  }
  return parts.join('\n\n')
}

function buildSystemBlocks(
  gameState: GameState,
  summaryContext: string | undefined
): Anthropic.TextBlockParam[] {
  return [
    {
      type: 'text',
      text: buildStaticPrompt(),
      cache_control: { type: 'ephemeral' },
    },
    {
      type: 'text',
      text: buildDynamicPrompt(gameState, summaryContext),
    },
  ]
}

async function syncMCPState(gameState: GameState, sessionId: string | undefined): Promise<GameState> {
  const startedAt = Date.now()
  logEvent('debug', 'dm.mcp_sync.start', {
    sessionId,
    gameState: summarizeGameState(gameState),
  })

  try {
    const synced = await callMCPTool('replace_game_state', { gameState }, sessionId) as GameState
    logEvent('debug', 'dm.mcp_sync.replace_ok', {
      sessionId,
      durationMs: Date.now() - startedAt,
      gameState: summarizeGameState(synced),
    })
    return synced
  } catch (err) {
    logEvent('warn', 'dm.mcp_sync.replace_failed', {
      sessionId,
      durationMs: Date.now() - startedAt,
      err,
    })
  }

  await callMCPTool('move_token', {
    tokenId: 'player',
    toCell: gameState.player.position,
  }, sessionId)

  for (const [id, monster] of Object.entries(gameState.monsters)) {
    if (monster.isAlive) {
      await callMCPTool('move_token', {
        tokenId: id,
        toCell: monster.position,
      }, sessionId)
    }
  }

  logEvent('warn', 'dm.mcp_sync.token_fallback_ok', {
    sessionId,
    durationMs: Date.now() - startedAt,
    monsterCount: Object.values(gameState.monsters).filter(monster => monster.isAlive).length,
  })
  return gameState
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isMcpErrorResult(result: unknown): boolean {
  return isObjectRecord(result) && typeof result.error === 'string'
}

function hasCompletedCurrentAction(gameState: GameState | undefined | null): boolean {
  if (!gameState || gameState.phase !== 'combat' || !gameState.currentTurn) return false
  return Boolean(gameState.actionUsed?.[gameState.currentTurn])
}

async function autoAdvanceCompletedTurn(
  gameState: GameState,
  sessionId: string | undefined,
  requestId: string
): Promise<{ gameState: GameState; advanced: boolean }> {
  if (!hasCompletedCurrentAction(gameState)) {
    return { gameState, advanced: false }
  }

  const actorId = gameState.currentTurn!
  const startedAt = Date.now()
  logEvent('info', 'dm.turn.auto_advance.start', {
    requestId,
    sessionId,
    actorId,
    gameState: summarizeGameState(gameState),
  })

  const result = await callMCPTool('next_turn', { actorId }, sessionId)
  if (isMcpErrorResult(result)) {
    logEvent('warn', 'dm.turn.auto_advance.failed', {
      requestId,
      sessionId,
      actorId,
      result,
    })
    return { gameState, advanced: false }
  }

  const nextGameState = await callMCPTool('get_game_state', {}, sessionId) as GameState
  logEvent('info', 'dm.turn.auto_advance.ok', {
    requestId,
    sessionId,
    actorId,
    durationMs: Date.now() - startedAt,
    result,
    gameState: summarizeGameState(nextGameState),
  })
  return { gameState: nextGameState, advanced: true }
}

// ── Handler principal ─────────────────────────────────────────────────────────
export async function POST(req: NextRequest): Promise<NextResponse> {
  const requestStartedAt = Date.now()
  const requestId = generateRequestId()
  try {
    const usageLog: AnthropicUsageLogEntry[] = []
    logEvent('info', 'dm.request.start', {
      requestId,
      method: req.method,
      url: req.url,
      userAgent: req.headers.get('user-agent'),
      referer: req.headers.get('referer'),
      forwardedFor: req.headers.get('x-forwarded-for'),
    })

    const body: DMRequest = await req.json()
    const { message, gameState, history = [], summaryContext, sessionId } = body
    logEvent('info', 'dm.request.received', {
      requestId,
      sessionId,
      messageLength: message?.length ?? 0,
      message,
      historyLength: history.length,
      summaryContextLength: summaryContext?.length ?? 0,
      hasClientGameState: Boolean(gameState),
      clientGameState: summarizeGameState(gameState),
    })

    if (!message?.trim()) {
      logEvent('warn', 'dm.request.invalid', {
        requestId,
        sessionId,
        reason: 'missing-message',
        durationMs: Date.now() - requestStartedAt,
      })
      return NextResponse.json({ error: 'Message requis' }, { status: 400 })
    }

    const storedSession = await loadSession(sessionId)

    let currentGameState = gameState ?? storedSession?.gameState
    let requestHistory = history.length > 0 ? history : storedSession?.history ?? []
    let requestSummaryContext = summaryContext ?? storedSession?.summaryContext
    const toolsUsed: string[] = []
    logEvent('info', 'dm.state.resolved', {
      requestId,
      sessionId,
      stateSource: gameState ? 'client' : storedSession?.gameState ? 'stored-session' : 'mcp-default',
      historySource: history.length > 0 ? 'client' : storedSession?.history ? 'stored-session' : 'empty',
      historyLength: requestHistory.length,
      hasSummary: Boolean(requestSummaryContext),
      gameState: summarizeGameState(currentGameState),
    })

    let mcpTools: Anthropic.Tool[] = []
    try {
      mcpTools = await getMcpTools(sessionId)
    } catch (err) {
      logEvent('error', 'dm.mcp_tools.load.error', { requestId, sessionId, err })
    }

    if (currentGameState) {
      try {
        currentGameState = await syncMCPState(currentGameState, sessionId)
      } catch (err) {
        logEvent('error', 'dm.mcp_sync.unavailable', {
          requestId,
          sessionId,
          durationMs: Date.now() - requestStartedAt,
          err,
        })
        return NextResponse.json({ error: 'Serveur MCP non disponible.' }, { status: 503 })
      }
    } else {
      try {
        currentGameState = await callMCPTool('get_game_state', {}, sessionId) as GameState
        logEvent('debug', 'dm.state.loaded_from_mcp', {
          requestId,
          sessionId,
          gameState: summarizeGameState(currentGameState),
        })
      } catch (err) {
        logEvent('error', 'dm.mcp_default_state.unavailable', {
          requestId,
          sessionId,
          durationMs: Date.now() - requestStartedAt,
          err,
        })
        return NextResponse.json({ error: 'Serveur MCP non disponible.' }, { status: 503 })
      }
    }

    // ── Traitement de l'historique ──────────────────────────────────────────
    const { recent: recentHistory, newSummary } = await processHistory(
      requestHistory,
      requestSummaryContext,
      usageLog,
      requestId
    )
    const activeSummary = newSummary ?? requestSummaryContext
    logEvent('debug', 'dm.history.ready', {
      requestId,
      sessionId,
      recentHistoryLength: recentHistory.length,
      activeSummaryLength: activeSummary?.length ?? 0,
      compressedThisRequest: Boolean(newSummary),
    })

    // Convertit l'historique récent en messages Anthropic (alternance user/assistant)
    const historyMessages = historyToAnthropicMessages(recentHistory)

    // ── Construction des messages pour l'appel LLM ──────────────────────────
    const systemBlocks = buildSystemBlocks(currentGameState, activeSummary)
    const messages: Anthropic.MessageParam[] = [
      ...historyMessages,
      { role: 'user', content: message },
    ]
    logEvent('debug', 'dm.anthropic.messages.ready', {
      requestId,
      sessionId,
      messageCount: messages.length,
      historyMessageCount: historyMessages.length,
      systemBlockCount: systemBlocks.length,
      toolsAvailable: mcpTools.length,
      toolNames: mcpTools.map(tool => tool.name),
      gameState: summarizeGameState(currentGameState),
    })

    let narrative = ''
    let iterations = 0
    let turnBoundaryReached = false

    while (iterations < MAX_TOOL_ITERATIONS) {
      iterations++
      const iterationStartedAt = Date.now()
      logEvent('info', 'dm.anthropic.iteration.start', {
        requestId,
        sessionId,
        iteration: iterations,
        model: MODEL,
        maxTokens: MAX_TOKENS,
        messageCount: messages.length,
        toolsAvailable: mcpTools.length,
      })

      const response = await anthropic.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: systemBlocks,
        tools: mcpTools.length > 0 ? mcpTools : undefined,
        messages,
      })
      logEvent('info', 'dm.anthropic.iteration.response', {
        requestId,
        sessionId,
        iteration: iterations,
        durationMs: Date.now() - iterationStartedAt,
        stopReason: response.stop_reason,
        content: summarizeContentBlocks(response.content),
      })

      usageLog.push(logAnthropicUsage({
        requestId,
        operation: 'dm.iteration',
        model: MODEL,
        usage: response.usage,
        stopReason: response.stop_reason,
        metadata: {
          iteration: iterations,
          toolsAvailable: mcpTools.length,
        },
      }))

      for (const block of response.content) {
        if (block.type === 'text') {
          narrative += (narrative ? '\n\n' : '') + block.text
        }
      }
      logEvent('debug', 'dm.narrative.updated', {
        requestId,
        sessionId,
        iteration: iterations,
        narrativeLength: narrative.length,
        narrative,
      })

      if (response.stop_reason === 'end_turn') {
        logEvent('info', 'dm.anthropic.end_turn', {
          requestId,
          sessionId,
          iteration: iterations,
          narrativeLength: narrative.length,
        })
        break
      }

      if (response.stop_reason === 'tool_use') {
        const toolUseBlocks = response.content.filter(
          (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use'
        )
        if (toolUseBlocks.length === 0) {
          logEvent('warn', 'dm.tool_use.empty', { requestId, sessionId, iteration: iterations })
          break
        }

        messages.push({ role: 'assistant', content: response.content })

        const toolResults: Anthropic.ToolResultBlockParam[] = []
        for (const toolUse of toolUseBlocks) {
          if (turnBoundaryReached) {
            const result = {
              error: 'Turn boundary already reached in this request. Wait for the next player message before resolving another actor.',
              code: 'TURN_BOUNDARY_REACHED',
              detail: { toolName: toolUse.name },
            }
            logEvent('warn', 'dm.tool_use.blocked_after_turn_boundary', {
              requestId,
              sessionId,
              iteration: iterations,
              toolUseId: toolUse.id,
              toolName: toolUse.name,
              result,
            })
            toolResults.push({
              type: 'tool_result',
              tool_use_id: toolUse.id,
              content: JSON.stringify(result),
              is_error: true,
            })
            continue
          }

          toolsUsed.push(toolUse.name)
          logEvent('info', 'dm.tool_use.start', {
            requestId,
            sessionId,
            iteration: iterations,
            toolUseId: toolUse.id,
            toolName: toolUse.name,
            input: toolUse.input,
          })
          try {
            const result = await callMCPTool(toolUse.name, toolUse.input as Record<string, unknown>, sessionId)
            logEvent('info', 'dm.tool_use.ok', {
              requestId,
              sessionId,
              iteration: iterations,
              toolUseId: toolUse.id,
              toolName: toolUse.name,
              result,
            })
            if (toolUse.name === 'next_turn' && !isMcpErrorResult(result)) {
              turnBoundaryReached = true
              logEvent('info', 'dm.turn.boundary_reached', {
                requestId,
                sessionId,
                iteration: iterations,
                toolUseId: toolUse.id,
                result,
              })
            }
            toolResults.push({
              type: 'tool_result',
              tool_use_id: toolUse.id,
              content: JSON.stringify(result),
            })
          } catch (err) {
            const errMsg = err instanceof Error ? err.message : 'Unknown error'
            logEvent('error', 'dm.tool_use.error', {
              requestId,
              sessionId,
              iteration: iterations,
              toolUseId: toolUse.id,
              toolName: toolUse.name,
              err,
            })
            toolResults.push({
              type: 'tool_result',
              tool_use_id: toolUse.id,
              content: JSON.stringify({ error: errMsg }),
              is_error: true,
            })
          }
        }
        messages.push({ role: 'user', content: toolResults })
        logEvent('debug', 'dm.tool_results.queued', {
          requestId,
          sessionId,
          iteration: iterations,
          toolResultCount: toolResults.length,
          turnBoundaryReached,
        })
        if (turnBoundaryReached) break
        continue
      }

      logEvent('warn', 'dm.anthropic.unhandled_stop_reason', {
        requestId,
        sessionId,
        iteration: iterations,
        stopReason: response.stop_reason,
      })
      break
    }

    if (!narrative && iterations >= MAX_TOOL_ITERATIONS) {
      const fallbackStartedAt = Date.now()
      logEvent('warn', 'dm.final_fallback.start', {
        requestId,
        sessionId,
        iterations,
      })
      const finalResponse = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 300,
        system: [
          {
            type: 'text',
            text: buildStaticPrompt() + '\n\nNarre uniquement, sans appeler de tools.',
            cache_control: { type: 'ephemeral' },
          },
          { type: 'text', text: buildDynamicPrompt(currentGameState!, activeSummary) },
        ],
        messages: [{ role: 'user', content: message }],
      })
      logEvent('warn', 'dm.final_fallback.response', {
        requestId,
        sessionId,
        durationMs: Date.now() - fallbackStartedAt,
        stopReason: finalResponse.stop_reason,
        content: summarizeContentBlocks(finalResponse.content),
      })

      usageLog.push(logAnthropicUsage({
        requestId,
        operation: 'dm.final_narration_fallback',
        model: MODEL,
        usage: finalResponse.usage,
        stopReason: finalResponse.stop_reason,
        metadata: {
          iterations,
        },
      }))

      for (const block of finalResponse.content) {
        if (block.type === 'text') narrative += block.text
      }
      logEvent('warn', 'dm.final_fallback.narrative_ready', {
        requestId,
        sessionId,
        narrativeLength: narrative.length,
        narrative,
      })
    }

    try {
      currentGameState = await callMCPTool('get_game_state', {}, sessionId) as GameState
      logEvent('debug', 'dm.final_state.loaded', {
        requestId,
        sessionId,
        gameState: summarizeGameState(currentGameState),
      })
    } catch { /* garde l'état qu'on avait */ }

    if (!turnBoundaryReached) {
      try {
        const autoAdvance = await autoAdvanceCompletedTurn(currentGameState, sessionId, requestId)
        if (autoAdvance.advanced) {
          currentGameState = autoAdvance.gameState
          toolsUsed.push('next_turn')
        }
      } catch (err) {
        logEvent('error', 'dm.turn.auto_advance.error', {
          requestId,
          sessionId,
          err,
        })
      }
    }

    const persistedHistory = [
      ...(newSummary ? recentHistory : requestHistory),
      { role: 'player', content: message } satisfies ConversationTurn,
      { role: 'dm', content: narrative || 'Le Dungeon Master réfléchit...' } satisfies ConversationTurn,
    ]

    try {
      await saveSession(sessionId, {
        gameState: currentGameState,
        history: persistedHistory,
        summaryContext: activeSummary,
      })
    } catch (err) {
      logEvent('error', 'dm.session.persist.error', {
        requestId,
        sessionId,
        historyLength: persistedHistory.length,
        err,
      })
    }

    const dmResponse: DMResponse = {
      narrative: narrative || 'Le Dungeon Master réfléchit...',
      newGameState: currentGameState,
      toolsUsed: [...new Set(toolsUsed)],
      // Renvoie le nouveau résumé au client seulement si une compression a eu lieu
      summaryContext: newSummary,
    }

    logAnthropicUsageSummary(requestId, usageLog, {
      iterations,
      toolsUsed: [...new Set(toolsUsed)],
      compressedHistory: Boolean(newSummary),
    })

    logEvent('info', 'dm.request.complete', {
      requestId,
      sessionId,
      durationMs: Date.now() - requestStartedAt,
      iterations,
      toolsUsed: [...new Set(toolsUsed)],
      narrativeLength: dmResponse.narrative.length,
      narrative: dmResponse.narrative,
      compressedHistory: Boolean(newSummary),
      newGameState: summarizeGameState(dmResponse.newGameState),
    })

    return NextResponse.json(dmResponse)
  } catch (err) {
    logEvent('error', 'dm.request.error', {
      requestId,
      durationMs: Date.now() - requestStartedAt,
      err,
    })
    const message = err instanceof Error ? err.message : 'Erreur interne du serveur'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
