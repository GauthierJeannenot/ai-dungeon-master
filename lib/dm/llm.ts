import Anthropic from '@anthropic-ai/sdk'
import { logEvent } from '@/lib/server-logger'
import { logAnthropicUsage, type AnthropicUsage, type AnthropicUsageLogEntry } from '@/lib/anthropic-usage'
import type { GameState } from '@/lib/types'

// ─────────────────────────────────────────────────────────────────────────────
// Client LLM du Dungeon Master : configuration des modèles, appel Anthropic
// avec comptage d'usage, et mock déterministe pour les tests sans coût.
// ─────────────────────────────────────────────────────────────────────────────

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

export const MODEL = process.env.DM_MODEL || 'claude-sonnet-4-6'
// Modèle du classifieur d'intention (pré-passe légère). Haiku : rapide et bon marché.
export const PLANNER_MODEL = process.env.DM_PLANNER_MODEL || 'claude-haiku-4-5'
// Compression d'historique : tâche simple (résumé factuel) → Haiku suffit et coûte
// ~3× moins cher que Sonnet. Surchargeable via DM_COMPRESS_MODEL.
export const COMPRESS_MODEL = process.env.DM_COMPRESS_MODEL || PLANNER_MODEL

// Effort de réflexion du DM (paramètre GA). 'medium' = bon compromis coût/qualité :
// moins d'itérations et de préambule que 'high' (défaut API), pour une qualité de
// narration ~équivalente. Surchargeable via DM_EFFORT. On ne l'envoie QUE pour les
// modèles qui le supportent (Sonnet 4.6, Opus 4.5/4.6/4.7) ; Haiku 4.5 et Sonnet 4.5
// renverraient un 400.
type EffortLevel = 'low' | 'medium' | 'high' | 'xhigh' | 'max'
const DM_EFFORT = (process.env.DM_EFFORT || 'medium') as EffortLevel
export function effortFor(model: string): { output_config?: { effort: EffortLevel } } {
  const supportsEffort = /claude-(sonnet-4-6|opus-4-(5|6|7))/.test(model)
  return supportsEffort ? { output_config: { effort: DM_EFFORT } } : {}
}

export function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

// Plafond de sortie PAR appel API. Une narration immersive (2-4 phrases) tourne
// autour de 250-500 tokens ; un tool call est négligeable. 1024 laisse ~2× de marge
// sans gaspiller tout en bornant le coût. Pire cas par message joueur en sortie =
// MAX_TOKENS × MAX_TOOL_ITERATIONS (≈ 10k tokens, ~0,15 $ sur Sonnet 4.6) ; un tour
// typique = 1-2 appels ≈ 0,02 $. Surchargeable via LLM_MAX_TOKENS.
export const MAX_TOKENS = parsePositiveInt(process.env.LLM_MAX_TOKENS, 1024)

// 'mock' permet aux tests de tourner sans appel payant. 'live' appelle l'API.
const LLM_MODE = (process.env.LLM_MODE === 'mock' ? 'mock' : 'live') as 'mock' | 'live'
const ALLOW_PAID_LLM = process.env.ALLOW_PAID_LLM !== 'false'

export interface LlmCallContext {
  requestId: string
  sessionId?: string
  clientRequestId?: string
  inputMode: string
  operation: string
  model?: string
  usageLog: AnthropicUsageLogEntry[]
  playerMessage?: string
  gameState?: GameState
  tools?: Anthropic.Tool[]
}

function lastUserText(messages: Anthropic.MessageParam[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]
    if (message.role !== 'user') continue
    if (typeof message.content === 'string') return message.content
  }
  return ''
}

function mockMessage(content: Anthropic.ContentBlock[], stopReason: Anthropic.Message['stop_reason']): Anthropic.Message {
  return {
    id: `msg_mock_${Math.random().toString(36).slice(2, 10)}`,
    type: 'message',
    role: 'assistant',
    model: MODEL,
    content,
    stop_reason: stopReason,
    stop_sequence: null,
    container: null,
    stop_details: null,
    usage: {
      input_tokens: 0,
      output_tokens: 0,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    } as Anthropic.Usage,
  }
}

function mockTextMessage(text: string): Anthropic.Message {
  return mockMessage([{ type: 'text', text, citations: null } as Anthropic.TextBlock], 'end_turn')
}

function mockToolMessage(name: string, input: Record<string, unknown>): Anthropic.Message {
  return mockMessage(
    [{ type: 'tool_use', id: `toolu_mock_${Math.random().toString(36).slice(2, 10)}`, name, input } as Anthropic.ToolUseBlock],
    'tool_use'
  )
}

function toolAvailable(name: string, tools?: Anthropic.Tool[]): boolean {
  return Boolean(tools?.some(tool => tool.name === name))
}

function firstAliveMonsterId(gameState: GameState): string | null {
  const entry = Object.entries(gameState.monsters).find(([, monster]) => monster.isAlive)
  return entry ? entry[0] : null
}

// Mock déterministe pour les tests : pilote les tools classiques.
function createMockLlmMessage(params: Anthropic.MessageCreateParamsNonStreaming, context: LlmCallContext): Anthropic.Message {
  if (context.operation === 'history.compress') {
    return mockTextMessage('Résumé mock: les échanges précédents sont conservés sous forme condensée pour les tests.')
  }

  // Le classifieur d'intention est un no-op déterministe en mock : aucune directive,
  // le DM mock garde son comportement habituel.
  if (context.operation === 'dm.plan') {
    return mockToolMessage('decide_action', {
      requiresMechanic: false,
      confidence: 'low',
      reason: 'mock planner: no-op',
    })
  }

  const text = (context.playerMessage || lastUserText(params.messages)).toLowerCase()
  const gameState = context.gameState
  if (!gameState) return mockTextMessage('Le Dungeon Master observe la situation.')

  // Tour d'un monstre : on résout d'un coup tous les tours non-joueur via run_monster_turns.
  if (gameState.phase === 'combat' && gameState.currentTurn && gameState.currentTurn !== 'player') {
    if (toolAvailable('run_monster_turns', context.tools) && Object.values(gameState.monsters).some(monster => monster.isAlive)) {
      return mockToolMessage('run_monster_turns', {})
    }
    return mockTextMessage("Les adversaires agissent avant que tu puisses reprendre l'initiative.")
  }

  const coordinateMatch = text.match(/\(?\s*(\d{1,2})\s*[,;]\s*(\d{1,2})\s*\)?/)
  const movementVerb = /va|vais|avance|bouge|déplace|deplace|marche|case|aller/.test(text)
  if (coordinateMatch && movementVerb && toolAvailable('move_token', context.tools)) {
    return mockToolMessage('move_token', {
      tokenId: 'player',
      toCell: { x: Number(coordinateMatch[1]), y: Number(coordinateMatch[2]) },
    })
  }

  if (
    gameState.phase === 'combat' &&
    gameState.currentTurn === 'player' &&
    /attaque|attque|frappe|tape|coup|charge/.test(text) &&
    toolAvailable('resolve_attack', context.tools)
  ) {
    const targetId = firstAliveMonsterId(gameState)
    if (targetId) {
      return mockToolMessage('resolve_attack', {
        attackerId: 'player',
        targetId,
        weaponOrSpell: 'longsword',
      })
    }
  }

  // Sort (personnages incantateurs) : le nom du sort est passé tel quel, le
  // moteur (resolveSpell) le résout par inclusion. Vocabulaire GÉNÉRIQUE
  // uniquement (pas de nom propre de module — verrou no-module-leaks). On évite
  // le token « sort » nu (« sortie »…) : on exige « lance … » ou un nom de sort.
  if (
    /lance (un |le |la )?(sort|projectile|éclair|eclair|flamme|rayon|soin|lumière|lumiere)|incante|projectile magique|mains brûlantes|rayon de givre|flamme sacrée|création d'eau|creation d'eau/.test(text) &&
    toolAvailable('cast_spell', context.tools)
  ) {
    return mockToolMessage('cast_spell', { spellName: context.playerMessage ?? text })
  }

  // Capacité de classe (action bonus) : second souffle, ou ruse (se cacher).
  if (/second souffle/.test(text) && toolAvailable('use_class_feature', context.tools)) {
    return mockToolMessage('use_class_feature', { featureId: 'second_wind' })
  }
  if (/(ruse|je me cache|me cacher)/.test(text) && toolAvailable('use_class_feature', context.tools)) {
    return mockToolMessage('use_class_feature', { featureId: 'cunning_action', option: 'hide' })
  }

  if (/passe|attend|attends|patient|ne fais rien/.test(text) && toolAvailable('pass_turn', context.tools)) {
    return mockToolMessage('pass_turn', { reason: 'Le joueur attend.' })
  }

  // Changement de map (modules multi-maps) : intention explicite de franchir
  // le passage vers la carte suivante. Vocabulaire générique uniquement (le
  // verrou no-module-leaks interdit tout nom propre de module ici).
  if (/franchis|franchir|portail|carte suivante|map suivante|quitte (cette |la )?(carte|map|zone)/.test(text) && toolAvailable('travel_to_map', context.tools)) {
    return mockToolMessage('travel_to_map', { reason: context.playerMessage ?? text })
  }

  return mockTextMessage('La scène progresse; quelque chose dans le décor répond à ton geste.')
}

function recordUsage(message: Anthropic.Message, context: LlmCallContext, stopReason?: string | null): void {
  const usage = (message.usage ?? {}) as AnthropicUsage
  const entry = logAnthropicUsage({
    requestId: context.requestId,
    sessionId: context.sessionId,
    inputMode: context.inputMode,
    clientRequestId: context.clientRequestId,
    operation: context.operation,
    model: context.model ?? MODEL,
    usage,
    stopReason: stopReason ?? message.stop_reason,
  })
  context.usageLog.push(entry)
}

export async function createLlmMessage(
  params: Anthropic.MessageCreateParamsNonStreaming,
  context: LlmCallContext
): Promise<Anthropic.Message> {
  logEvent('info', 'llm.call.start', {
    requestId: context.requestId,
    sessionId: context.sessionId,
    operation: context.operation,
    mode: LLM_MODE,
  })

  if (LLM_MODE === 'mock') {
    const message = createMockLlmMessage(params, context)
    recordUsage(message, context)
    return message
  }

  if (!ALLOW_PAID_LLM) {
    throw new Error('Appels LLM payants désactivés (ALLOW_PAID_LLM=false). Utilise LLM_MODE=mock.')
  }

  const message = await anthropic.messages.create(params)
  recordUsage(message, context)
  return message
}
