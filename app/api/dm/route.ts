import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { loadContextFiles } from '@/lib/context-loader'
import { callMCPTool, listMCPTools } from '@/lib/mcp-client'
import { DMRequest, DMResponse, GameState, ConversationTurn } from '@/lib/types'

export const maxDuration = 60

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

const MODEL = 'claude-haiku-4-5'
const MAX_TOOL_ITERATIONS = 3
const MAX_TOKENS = 400
const COMBAT_LOG_TAIL = 6

// Nombre de messages récents conservés verbatim avant compression.
// Au-delà, les plus anciens sont résumés en un paragraphe.
const HISTORY_KEEP_RECENT = 10  // 5 tours de jeu (player + dm par tour)
// Seuil en caractères déclenchant la compression des messages "old"
// (~4 chars = 1 token → 6000 chars ≈ 1500 tokens)
const HISTORY_COMPRESS_THRESHOLD_CHARS = 6000

// ── Cache des tools MCP ───────────────────────────────────────────────────────
let cachedMcpTools: Anthropic.Tool[] | null = null

async function getMcpTools(): Promise<Anthropic.Tool[]> {
  if (cachedMcpTools) return cachedMcpTools
  const raw = await listMCPTools()
  cachedMcpTools = raw.map(t => ({
    name: t.name,
    description: t.description,
    input_schema: t.inputSchema as Anthropic.Tool['input_schema'],
  }))
  return cachedMcpTools
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
  existingSummary: string | undefined
): Promise<string> {
  const exchangeText = oldTurns
    .map(t => `${t.role === 'player' ? 'Joueur' : 'DM'}: ${t.content}`)
    .join('\n')

  const prompt = existingSummary
    ? `Voici le résumé de la session jusqu'ici :\n${existingSummary}\n\nVoici les échanges suivants à intégrer au résumé :\n${exchangeText}\n\nÉcris un résumé mis à jour en 3-5 phrases : ce qui s'est passé, où en est le joueur, les éléments importants à retenir.`
    : `Résume ces échanges de jeu de rôle D&D en 3-5 phrases. Garde l'essentiel : actions, découvertes, état de la situation.\n\n${exchangeText}`

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 300,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = response.content.find(b => b.type === 'text')
  return text && 'text' in text ? text.text : existingSummary ?? ''
}

// ── Gestion de l'historique ───────────────────────────────────────────────────
// Retourne l'historique prêt à l'emploi + un éventuel nouveau résumé.
// La compression est déclenchée quand les messages "anciens" (au-delà de
// HISTORY_KEEP_RECENT) dépassent HISTORY_COMPRESS_THRESHOLD_CHARS.
async function processHistory(
  history: ConversationTurn[],
  existingSummary: string | undefined
): Promise<{ recent: ConversationTurn[]; newSummary: string | undefined }> {
  // Pas assez de messages pour avoir une partie "ancienne"
  if (history.length <= HISTORY_KEEP_RECENT) {
    return { recent: history, newSummary: undefined }
  }

  const oldTurns = history.slice(0, history.length - HISTORY_KEEP_RECENT)
  const recent  = history.slice(-HISTORY_KEEP_RECENT)

  // Vérifie si la partie ancienne est suffisamment longue pour mériter la compression
  const oldText = oldTurns.map(t => t.content).join(' ')
  const needsCompression = oldText.length > HISTORY_COMPRESS_THRESHOLD_CHARS || !!existingSummary

  if (!needsCompression) {
    // Pas encore au seuil : on renvoie tout sans compresser
    return { recent: history, newSummary: undefined }
  }

  const newSummary = await compressHistory(oldTurns, existingSummary)
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
- Déplacement explicite du joueur → move_token AVANT de narrer.
- Début de combat → spawn_monster puis enter_combat (2 tools max), narre, STOP.
- Tour joueur en combat → resolve_attack ou saving_throw, puis next_turn, STOP.
- Tour monstre → resolve_attack du monstre, puis next_turn, STOP.
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

// ── Handler principal ─────────────────────────────────────────────────────────
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body: DMRequest = await req.json()
    const { message, gameState, history = [], summaryContext } = body

    if (!message?.trim()) {
      return NextResponse.json({ error: 'Message requis' }, { status: 400 })
    }

    let currentGameState = gameState
    const toolsUsed: string[] = []

    let mcpTools: Anthropic.Tool[] = []
    try {
      mcpTools = await getMcpTools()
    } catch (err) {
      console.error('Failed to load MCP tools:', err)
    }

    if (!currentGameState) {
      try {
        currentGameState = await callMCPTool('get_game_state', {}) as GameState
      } catch {
        return NextResponse.json({ error: 'Serveur MCP non disponible.' }, { status: 503 })
      }
    }

    // Sync MCP server avec l'état frontend
    try {
      await callMCPTool('move_token', {
        tokenId: 'player',
        x: currentGameState.player.position.x,
        y: currentGameState.player.position.y,
      })
      for (const [id, monster] of Object.entries(currentGameState.monsters)) {
        if (monster.isAlive) {
          await callMCPTool('move_token', { tokenId: id, x: monster.position.x, y: monster.position.y })
        }
      }
    } catch { /* non bloquant */ }

    // ── Traitement de l'historique ──────────────────────────────────────────
    const { recent: recentHistory, newSummary } = await processHistory(history, summaryContext)
    const activeSummary = newSummary ?? summaryContext

    // Convertit l'historique récent en messages Anthropic (alternance user/assistant)
    const historyMessages = historyToAnthropicMessages(recentHistory)

    // ── Construction des messages pour l'appel LLM ──────────────────────────
    const systemBlocks = buildSystemBlocks(currentGameState, activeSummary)
    const messages: Anthropic.MessageParam[] = [
      ...historyMessages,
      { role: 'user', content: message },
    ]

    let narrative = ''
    let iterations = 0

    while (iterations < MAX_TOOL_ITERATIONS) {
      iterations++

      const response = await anthropic.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: systemBlocks,
        tools: mcpTools.length > 0 ? mcpTools : undefined,
        messages,
      })

      for (const block of response.content) {
        if (block.type === 'text') {
          narrative += (narrative ? '\n\n' : '') + block.text
        }
      }

      if (response.stop_reason === 'end_turn') break

      if (response.stop_reason === 'tool_use') {
        const toolUseBlocks = response.content.filter(
          (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use'
        )
        if (toolUseBlocks.length === 0) break

        messages.push({ role: 'assistant', content: response.content })

        const toolResults: Anthropic.ToolResultBlockParam[] = []
        for (const toolUse of toolUseBlocks) {
          toolsUsed.push(toolUse.name)
          try {
            const result = await callMCPTool(toolUse.name, toolUse.input as Record<string, unknown>)
            toolResults.push({
              type: 'tool_result',
              tool_use_id: toolUse.id,
              content: JSON.stringify(result),
            })
          } catch (err) {
            const errMsg = err instanceof Error ? err.message : 'Unknown error'
            toolResults.push({
              type: 'tool_result',
              tool_use_id: toolUse.id,
              content: JSON.stringify({ error: errMsg }),
              is_error: true,
            })
          }
        }
        messages.push({ role: 'user', content: toolResults })
        continue
      }

      break
    }

    if (!narrative && iterations >= MAX_TOOL_ITERATIONS) {
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
      for (const block of finalResponse.content) {
        if (block.type === 'text') narrative += block.text
      }
    }

    try {
      currentGameState = await callMCPTool('get_game_state', {}) as GameState
    } catch { /* garde l'état qu'on avait */ }

    const dmResponse: DMResponse = {
      narrative: narrative || 'Le Dungeon Master réfléchit...',
      newGameState: currentGameState,
      toolsUsed: [...new Set(toolsUsed)],
      // Renvoie le nouveau résumé au client seulement si une compression a eu lieu
      summaryContext: newSummary,
    }

    return NextResponse.json(dmResponse)
  } catch (err) {
    console.error('DM API error:', err)
    const message = err instanceof Error ? err.message : 'Erreur interne du serveur'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
