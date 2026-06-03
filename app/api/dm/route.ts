import { NextRequest, NextResponse } from 'next/server'
import { loadContextFiles, extractCurrentRoom } from '@/lib/context-loader'
import { callMCPTool, listMCPTools } from '@/lib/mcp-client'
import { DMRequest, DMResponse, GameState, ConversationTurn } from '@/lib/types'

export const maxDuration = 300

// ── Configuration Ollama ──────────────────────────────────────────────────────
// OLLAMA_BASE_URL : URL de ton serveur Ollama (ex: http://1.2.3.4:11434)
// OLLAMA_MODEL    : modèle à utiliser (ex: qwen2.5:7b)
// OLLAMA_API_KEY  : optionnel — si tu protèges Ollama avec un reverse proxy auth
const OLLAMA_BASE_URL = (process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434').replace(/\/$/, '')
const MODEL           = process.env.OLLAMA_MODEL ?? 'qwen2.5:3b'
// trim() + || undefined : une chaîne vide dans Railway est traitée comme "pas de clé"
const OLLAMA_API_KEY  = process.env.OLLAMA_API_KEY?.trim() || undefined

const MAX_TOOL_ITERATIONS = 3
const MAX_TOKENS          = 600   // un peu plus généreux qu'avec Claude — les modèles open ≥ verbose
const COMBAT_LOG_TAIL     = 6
const HISTORY_KEEP_RECENT = 10
const HISTORY_COMPRESS_THRESHOLD_CHARS = 6000

// ── Types OpenAI-compatible (utilisés par Ollama /v1/chat/completions) ────────

interface OllamaUserMessage    { role: 'user';      content: string }
interface OllamaSystemMessage  { role: 'system';    content: string }
interface OllamaAssistantMessage {
  role: 'assistant'
  content: string | null
  tool_calls?: Array<{
    id: string
    type: 'function'
    function: { name: string; arguments: string }
  }>
}
interface OllamaToolMessage {
  role: 'tool'
  tool_call_id: string
  content: string
}

type OllamaMessage =
  | OllamaSystemMessage
  | OllamaUserMessage
  | OllamaAssistantMessage
  | OllamaToolMessage

interface OllamaTool {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: unknown
  }
}

interface OllamaResponse {
  choices: Array<{
    message: OllamaAssistantMessage
    finish_reason: 'stop' | 'tool_calls' | 'length' | null
  }>
  error?: { message: string }
}

// ── Cache des tools MCP ───────────────────────────────────────────────────────
let cachedTools: OllamaTool[] | null = null

async function getMcpTools(): Promise<OllamaTool[]> {
  if (cachedTools) return cachedTools
  const raw = await listMCPTools()
  // Conversion format Anthropic input_schema → format OpenAI parameters
  cachedTools = raw.map(t => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.inputSchema ?? { type: 'object', properties: {} },
    },
  }))
  return cachedTools
}

// ── Appel HTTP vers Ollama ────────────────────────────────────────────────────
async function ollamaChat(
  messages: OllamaMessage[],
  tools: OllamaTool[]
): Promise<OllamaResponse> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (OLLAMA_API_KEY) headers['Authorization'] = `Bearer ${OLLAMA_API_KEY}`

  const body = {
    model: MODEL,
    messages,
    tools: tools.length > 0 ? tools : undefined,
    stream: false,
    tool_choice: tools.length > 0 ? 'auto' : undefined,
    // num_ctx au niveau racine — Ollama /v1 respecte ce champ, pas options.num_ctx
    num_ctx: 32768,          // 43GB modèle + ~20GB KV cache = ~63GB / 80GB VRAM A100
    options: {
      temperature: 0.2,
      num_predict: MAX_TOKENS,
    },
  }

  const res = await fetch(`${OLLAMA_BASE_URL}/v1/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(280_000), // 280s — en dessous du maxDuration de 300s
  })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`Ollama HTTP ${res.status}: ${text}`)
  }

  return res.json() as Promise<OllamaResponse>
}

// ── Sérialisation compacte du game state ─────────────────────────────────────
function serializeGameState(gs: GameState): string {
  return JSON.stringify({
    ...gs,
    monsters: Object.fromEntries(
      Object.entries(gs.monsters).filter(([, m]) => m.isAlive)
    ),
    combatLog: gs.combatLog.slice(-COMBAT_LOG_TAIL),
  })
}

// ── System prompt optimisé pour llama3.3:70b ─────────────────────────────────
// Principes d'optimisation :
// 1. XML tags → llama3.3 suit mieux les sections structurées
// 2. Stats joueur inlinées depuis game state → pas de duplication avec player-character.md
// 3. Salle courante seulement → -80% de tokens sur le module (~3000 → ~400)
// 4. Règles DM ultra-compressées → llama3.3 connaît D&D 5e, inutile de tout ré-expliquer
// 5. Instructions tool calling en tête + très explicites
// Résultat : ~6000 tokens → ~1200 tokens par requête
function buildSystemPrompt(gs: GameState, summaryContext: string | undefined): string {
  const ctx = loadContextFiles()
  const p = gs.player
  const aliveMonsters = Object.values(gs.monsters).filter(m => m.isAlive)
  const activeConditions = p.conditions.length > 0 ? p.conditions.join(', ') : 'aucune'

  // Module complet — le DM a connaissance de toutes les salles
  const moduleContext = ctx.adventureModule

  return `<system>
<rules>
Tu es un Dungeon Master D&D 5e. Narre en français, au présent, 2-3 phrases max.

UNE ACTION PAR MESSAGE. Pas d'anticipation, pas d'enchaînement.
Interdit : "un ami crie" → NE PAS le faire entrer. "j'avance vers X" → NE PAS entrer dans X.

FUNCTION CALLING OBLIGATOIRE :
Appelle les tools via l'API (function_call). JAMAIS dans le texte de ta réponse.
- Déplacement → move_token PUIS narration.
- Entrée salle → trigger_room_event.
- Combat → spawn_monster + enter_combat, STOP.
- Attaque joueur → resolve_attack + next_turn, STOP.
- Tour monstre → resolve_attack + next_turn, STOP.
- HP monstres : vigoureux / légèrement blessé / gravement blessé / à l'agonie.
</rules>

<player>
${p.name} — Guerrier Niv.${p.level} | HP ${p.hp.current}/${p.hp.max} | CA ${p.ac} | Pos (${p.position.x},${p.position.y})
Conditions : ${activeConditions} | Vitesse : ${p.speed} pieds
Attaque : 1d20+5 | Épée longue : 1d8+3 (Sap) | Hache de main : 1d6+3 (Lent)
Action bonus : Second Souffle 1d10+${p.level} PV (1×/repos court)
Inventaire : ${p.inventory.map(i => i.name).join(', ')}
Background : ex-mercenaire en quête de rédemption, méfiant envers la magie
</player>
${aliveMonsters.length > 0 ? `
<combat>
Phase : ${gs.phase} | Round : ${gs.round} | Tour : ${gs.currentTurn ?? '—'}
Monstres : ${aliveMonsters.map(m => `${m.name}(${m.id}) HP${m.hp.current}/${m.hp.max} CA${m.ac}`).join(' | ')}
Initiative : ${gs.initiativeOrder.join(' → ')}
</combat>` : `<phase>${gs.phase}</phase>`}

<adventure>
${moduleContext}
</adventure>

<state>
Salle : ${gs.currentRoomId ?? 'extérieur'} | Visitées : ${gs.roomsVisited.join(', ') || 'aucune'}
${gs.combatLog.length > 0 ? `Dernières actions : ${gs.combatLog.slice(-2).map(e => e.mechanicalDetail ?? e.action).join(' | ')}` : ''}
${summaryContext ? `Résumé session : ${summaryContext}` : ''}
</state>

<dm_rules>
DCs : Facile 10, Moyen 15, Difficile 20. DC créature = 8+mod+maîtrise.
Raté de 1-2 → offrir succès à un coût narratif.
Tous les combats sont évitables : CHA/SAG DD 13 + plan crédible.
</dm_rules>
</system>`
}

// ── Compression de l'historique ───────────────────────────────────────────────
async function compressHistory(
  oldTurns: ConversationTurn[],
  existingSummary: string | undefined
): Promise<string> {
  const exchangeText = oldTurns
    .map(t => `${t.role === 'player' ? 'Joueur' : 'DM'}: ${t.content}`)
    .join('\n')

  const prompt = existingSummary
    ? `Résumé précédent:\n${existingSummary}\n\nNouveaux échanges:\n${exchangeText}\n\nMets à jour le résumé en 3-5 phrases.`
    : `Résume ces échanges D&D en 3-5 phrases (actions, découvertes, état):\n\n${exchangeText}`

  const res = await ollamaChat(
    [
      { role: 'system', content: 'Tu es un assistant qui résume des sessions de jeu de rôle en quelques phrases.' },
      { role: 'user', content: prompt },
    ],
    [] // pas de tools pour la compression
  )

  return res.choices[0]?.message?.content ?? existingSummary ?? ''
}

// ── Gestion de l'historique ───────────────────────────────────────────────────
async function processHistory(
  history: ConversationTurn[],
  existingSummary: string | undefined
): Promise<{ recent: ConversationTurn[]; newSummary: string | undefined }> {
  if (history.length <= HISTORY_KEEP_RECENT) {
    return { recent: history, newSummary: undefined }
  }

  const oldTurns = history.slice(0, history.length - HISTORY_KEEP_RECENT)
  const recent   = history.slice(-HISTORY_KEEP_RECENT)
  const oldText  = oldTurns.map(t => t.content).join(' ')

  if (oldText.length <= HISTORY_COMPRESS_THRESHOLD_CHARS && !existingSummary) {
    return { recent: history, newSummary: undefined }
  }

  const newSummary = await compressHistory(oldTurns, existingSummary)
  return { recent, newSummary }
}

// ── Conversion historique → messages OpenAI ──────────────────────────────────
function historyToMessages(turns: ConversationTurn[]): Array<OllamaUserMessage | OllamaAssistantMessage> {
  const msgs: Array<OllamaUserMessage | OllamaAssistantMessage> = []

  for (const turn of turns) {
    const role = turn.role === 'player' ? 'user' : 'assistant'
    const last = msgs[msgs.length - 1]
    if (last && last.role === role) continue  // évite les doublons consécutifs
    if (role === 'user') {
      msgs.push({ role: 'user', content: turn.content })
    } else {
      msgs.push({ role: 'assistant', content: turn.content })
    }
  }

  // S'assure que l'historique finit par 'assistant' (le message courant sera 'user')
  if (msgs.length > 0 && msgs[msgs.length - 1].role === 'user') {
    msgs.pop()
  }

  return msgs
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

    // Charge les tools (cache en mémoire)
    let mcpTools: OllamaTool[] = []
    try {
      mcpTools = await getMcpTools()
    } catch (err) {
      console.error('Failed to load MCP tools:', err)
    }

    // Game state initial
    if (!currentGameState) {
      try {
        currentGameState = await callMCPTool('get_game_state', {}) as GameState
      } catch {
        return NextResponse.json({ error: 'Serveur MCP non disponible.' }, { status: 503 })
      }
    }

    // Sync positions frontend → MCP
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

    // Compression de l'historique si nécessaire
    const { recent: recentHistory, newSummary } = await processHistory(history, summaryContext)
    const activeSummary = newSummary ?? summaryContext

    // Construction des messages
    const systemMsg: OllamaSystemMessage = {
      role: 'system',
      content: buildSystemPrompt(currentGameState, activeSummary),
    }

    const messages: OllamaMessage[] = [
      systemMsg,
      ...historyToMessages(recentHistory),
      { role: 'user', content: message },
    ]

    let narrative = ''
    let iterations = 0

    // ── Boucle tool-use ───────────────────────────────────────────────────────
    while (iterations < MAX_TOOL_ITERATIONS) {
      iterations++

      const response = await ollamaChat(messages, mcpTools)
      const choice   = response.choices[0]

      if (!choice) break

      const msg = choice.message

      // Accumule la narration textuelle
      if (msg.content) {
        narrative += (narrative ? '\n\n' : '') + msg.content
      }

      // Fin de la réponse — pas de tool call
      if (choice.finish_reason === 'stop' || !msg.tool_calls?.length) break

      // ── Traitement des tool calls ─────────────────────────────────────────
      if (msg.tool_calls?.length) {
        // Ajoute le message assistant avec les tool calls à l'historique
        messages.push({
          role: 'assistant',
          content: msg.content ?? null,
          tool_calls: msg.tool_calls,
        })

        // Exécute chaque tool call via le MCP server
        for (const tc of msg.tool_calls) {
          const toolName = tc.function.name
          toolsUsed.push(toolName)

          let resultContent: string
          try {
            const args = JSON.parse(tc.function.arguments) as Record<string, unknown>
            const result = await callMCPTool(toolName, args)
            resultContent = JSON.stringify(result)
          } catch (err) {
            resultContent = JSON.stringify({ error: err instanceof Error ? err.message : 'Tool error' })
          }

          messages.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: resultContent,
          })
        }

        continue // relance la boucle pour que le LLM traite les résultats
      }

      break
    }

    // Fallback si aucune narration après la limite d'itérations
    if (!narrative) {
      const fallback = await ollamaChat(
        [
          { role: 'system', content: buildSystemPrompt(currentGameState!, activeSummary) + '\n\nNarre uniquement, sans appeler de tools.' },
          { role: 'user', content: message },
        ],
        []
      )
      narrative = fallback.choices[0]?.message?.content ?? ''
    }

    // Récupère l'état final depuis le MCP (source de vérité)
    try {
      currentGameState = await callMCPTool('get_game_state', {}) as GameState
    } catch { /* garde l'état courant */ }

    const dmResponse: DMResponse = {
      narrative: narrative || 'Le Dungeon Master réfléchit...',
      newGameState: currentGameState,
      toolsUsed: [...new Set(toolsUsed)],
      summaryContext: newSummary,
    }

    return NextResponse.json(dmResponse)
  } catch (err) {
    console.error('DM API error:', err)
    const msg = err instanceof Error ? err.message : 'Erreur interne'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
