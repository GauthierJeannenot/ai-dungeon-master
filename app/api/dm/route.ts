import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import crypto from 'crypto'
import fs from 'fs/promises'
import path from 'path'
import { callMCPTool, listMCPTools } from '@/lib/mcp-client'
import { loadSession, saveSession } from '@/lib/session-store'
import { acquireSessionLock } from '@/lib/session-lock'
import {
  ADVENTURE_ROOMS,
  centerCellForAdventureRoom,
  ENCOUNTERS,
  encounterIdForAdventureRoom,
  findAdventureRoomIdByAlias,
  findAdventureRoomIdByContextAlias,
  findNamedAdventureLocationCell,
  inferAdventureRoomId as inferMappedAdventureRoomId,
  relativeAdventureRoomIdForText,
} from '@/lib/adventure-map'
import { DMRequest, DMResponse, GameState, ConversationTurn, CombatLogEntry, MonsterState, type CanonicalPlayerActionKind, type DMDebugTurnView, type DMTurnUsage, type EngineEvent, type PlayerAffordance, type TurnTraceActionExecution, type WorldState } from '@/lib/types'
import {
  isDoorTraversalIntent,
  normalizeFrenchText,
  referencesLocalObjectInsteadOfRoom,
} from '@/lib/dm-intent'
import {
  classifyPlayerAction,
  isAnaphoricCombatAttackText,
  type GameActionConfidence,
  type GameActionIntent,
  type GameActionKind,
  type GameActionPrimitive,
} from '@/lib/game-actions'
import { buildDirectorDecision } from '@/lib/dm-director'
import {
  logAnthropicUsage,
  logAnthropicUsageSummary,
  summarizeAnthropicUsage,
  type AnthropicUsageLogEntry,
} from '@/lib/anthropic-usage'
import { logEvent, summarizeGameState } from '@/lib/server-logger'
import { buildEngineResolutionView, derivePlayerAffordances } from '@/lib/world-engine'
import { buildWorldActionInput, resolveWorldActionTargets } from '@/lib/world-target-resolver'
import { buildSceneSurface, summarizeSceneSurfaceForDebug } from '@/lib/scene-surface'
import { buildActionPlan, summarizeActionPlanForDebug, type ActionPlan } from '@/lib/action-plan'
import { resolveLocationDestination, summarizeLocationResolution, type LocationResolution } from '@/lib/location-index'
import {
  hasDestinationCue,
  hasNamedRouteMovementVerb,
  hasSpecificExplorationCue,
  isExitCurrentRoomIntent,
  isVagueExplorationMoveText,
} from '@/lib/natural-language'
import {
  detectUnsupportedNarratedWorldFacts,
} from '@/lib/narrative-world-contract'
import { normalizeLlmToolInput } from '@/lib/tool-input-normalizer'
import { actionExecution, buildTurnTrace } from '@/lib/turn-trace'
import {
  buildIntentInterpreterInputSummary,
  interpretPlayerIntentMock,
  validateIntentInterpreterOutput,
  type IntentInterpreterInputSummary,
  type IntentInterpreterOutput,
} from '@/lib/intent-interpreter'
import { buildNarrationSystemBlocks, buildSystemBlocks, type DmPromptBuildOptions } from '@/lib/dm-prompts'
import { buildWorldDebugDiff } from '@/lib/world-debug'
import {
  buildDownedPlayerFinalNarrationInstruction,
  buildEngineTruthPacket,
  formatEngineTruthPacket,
  type EngineTruthPacket,
} from '@/lib/engine-truth-packet'
import {
  buildContextualNoFallbackNarrative,
  buildDebugStateNarrative,
  buildDryadOffenseNarrative,
  buildLocationReconcileNarrative,
  buildLocationReconcileNeedsTargetNarrative,
  buildLocationReconcileSameRoomNarrative,
  buildDirectiveSceneNarrative,
  buildMcpRuleErrorNarrative,
  buildOralFallbackNarrative,
  buildPlayerDownNarrative,
  buildQuestGuidanceNarrative,
  buildSocialFallbackNarrative,
  detectDryadInformationRequest,
  detectDryadOffense,
  getCurrentRoomName,
  isSocialNarrationContext,
  looksLikeGenericSceneFallback,
  normalizeNarrativeForOralPlayback,
  resolveLocationReconcileRoomId,
  trimIncompleteTrailingSentence,
} from '@/lib/dm-narration-guards'

export const maxDuration = 60

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

const MODEL = 'claude-haiku-4-5'
const INTENT_INTERPRETER_MODEL = process.env.INTENT_INTERPRETER_MODEL || MODEL
const MAX_TOOL_ITERATIONS = 3
const MAX_TOKENS = 400
const FINAL_NARRATION_MAX_TOKENS = parsePositiveInt(process.env.LLM_FINAL_NARRATION_MAX_TOKENS, 260)
const LLM_SHORT_NARRATION_MAX_TOKENS = parsePositiveInt(process.env.LLM_SHORT_NARRATION_MAX_TOKENS, FINAL_NARRATION_MAX_TOKENS)
const LLM_RICH_NARRATION_MAX_TOKENS = parsePositiveInt(process.env.LLM_RICH_NARRATION_MAX_TOKENS, 420)
const ORAL_NARRATION_MAX_SENTENCES = parsePositiveInt(process.env.ORAL_NARRATION_MAX_SENTENCES, 8)
const ORAL_NARRATION_MAX_CHARS = parsePositiveInt(process.env.ORAL_NARRATION_MAX_CHARS, 900)
const COMBAT_LOG_TAIL = 6
const MAX_AUTO_NPC_TURNS = 8
type LlmMode = 'live' | 'mock' | 'record' | 'replay'
type NarrationMode = 'quality' | 'budget'
const INTERNAL_MCP_TOOLS = new Set(['replace_game_state', 'get_game_state', 'next_turn', 'update_hp', 'add_to_log', 'enter_combat', 'resolve_attack'])
const PRIMARY_ACTION_TOOLS = new Set([
  'resolve_player_action',
  'start_encounter',
  'resolve_player_attack',
  'pass_turn',
  'use_healing_potion',
  'roll_ability_check',
  'resolve_saving_throw',
  'roll_death_save',
  'trigger_room_event',
  'end_combat',
])
const DIRECTOR_LOCAL_FINAL_TOOLS = new Set([
  'move_token',
  'resolve_player_attack',
  'resolve_player_action',
  'use_healing_potion',
  'roll_ability_check',
  'roll_death_save',
  'pass_turn',
  'start_encounter',
  'next_turn',
  'resolve_attack',
  'end_combat',
  'world.help',
])
const LLM_MODE = parseLlmMode(process.env.LLM_MODE)
const NARRATION_MODE = parseNarrationMode(process.env.NARRATION_MODE)
const ALLOW_PAID_LLM = process.env.ALLOW_PAID_LLM !== 'false'
const INTENT_INTERPRETER_ENABLED = process.env.INTENT_INTERPRETER_ENABLED !== 'false'
const LLM_HARD_BUDGET_ENABLED = process.env.LLM_HARD_BUDGET_ENABLED === 'true'
const LLM_FINAL_NARRATION_ALWAYS = process.env.LLM_FINAL_NARRATION_ALWAYS !== 'false'
const LLM_REPLAY_FALLBACK_TO_MOCK = process.env.LLM_REPLAY_FALLBACK_TO_MOCK === 'true'
const LLM_CASSETTE_DIR = process.env.LLM_CASSETTE_DIR || path.join(process.cwd(), '.data', 'llm-cassettes')
const LLM_MAX_CALLS_PER_REQUEST = parsePositiveInt(process.env.LLM_MAX_CALLS_PER_REQUEST, 10)
const LLM_MAX_CALLS_PER_SESSION = parsePositiveInt(process.env.LLM_MAX_CALLS_PER_SESSION, 0)
const LLM_PROMPT_CACHE_ENABLED = process.env.LLM_PROMPT_CACHE_ENABLED !== 'false'
const LLM_PROMPT_CACHE_TTL = parsePromptCacheTtl(process.env.LLM_PROMPT_CACHE_TTL)
const NO_GENERIC_FALLBACK_NARRATION_INSTRUCTION = 'Interdit absolu: pas de fallback generique de salle, pas de "la piece gronde", pas de boucle d ambiance, pas de texte carte postale. Si aucun event moteur n a change l etat, reponds par une clarification naturelle fondee sur l intention interpretee et les affordances, ou par une reaction conversationnelle concrete si un PNJ est present.'

// Nombre de messages récents conservés verbatim avant compression.
// Au-delà, les plus anciens sont résumés en un paragraphe.
const HISTORY_KEEP_RECENT = 10  // 5 tours de jeu (player + dm par tour)
// Seuil en caractères déclenchant la compression des messages "old"
// (~4 chars = 1 token → 6000 chars ≈ 1500 tokens)
const HISTORY_COMPRESS_THRESHOLD_CHARS = 6000
const MODULE_CONTEXT_MAX_CHARS = parsePositiveInt(process.env.LLM_MODULE_CONTEXT_MAX_CHARS, 6500)

// ── Cache des tools MCP ───────────────────────────────────────────────────────
let cachedMcpTools: Anthropic.Tool[] | null = null
const sessionLlmCalls = new Map<string, number>()

type LlmOperation =
  | 'history.compress'
  | 'dm.intent_interpreter'
  | 'dm.iteration'
  | 'dm.final_narration'
  | 'dm.final_narration_fallback'

type MessageCreateParams = Anthropic.MessageCreateParamsNonStreaming
type LlmRoute = DMTurnUsage['llmRoute']

interface LlmCallContext {
  requestId: string
  sessionId?: string
  operation: LlmOperation
  requestCallCount: number
  llmRoute?: LlmRoute
  gameState?: GameState
  playerMessage?: string
  newCombatLogEntries?: CombatLogEntry[]
  engineTruthPacket?: unknown
  tools?: Anthropic.Tool[]
}

function parseLlmMode(value: string | undefined): LlmMode {
  const mode = (value ?? 'live').toLowerCase()
  if (mode === 'live' || mode === 'mock' || mode === 'record' || mode === 'replay') {
    return mode
  }
  throw new Error(`LLM_MODE invalide: ${value}. Valeurs attendues: live, mock, record, replay.`)
}

function parseNarrationMode(value: string | undefined): NarrationMode {
  const mode = (value ?? 'quality').toLowerCase()
  if (mode === 'quality' || mode === 'budget') return mode
  throw new Error(`NARRATION_MODE invalide: ${value}. Valeurs attendues: quality, budget.`)
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback
}

function isCanonicalWorldActionKind(kind: GameActionKind): boolean {
  return [
    'search',
    'examine',
    'read',
    'open',
    'take',
    'unlock',
    'force',
    'disarm',
    'talk',
    'ask',
    'persuade',
    'threaten',
    'show_item',
    'give_item',
    'hide',
    'help',
    'flee',
    'stabilize',
    'use_object',
    'combine_recipe',
    'improvise',
  ].includes(kind)
}

function parsePromptCacheTtl(value: string | undefined): '5m' | '1h' {
  if (!value) return '5m'
  if (value === '5m' || value === '1h') return value
  throw new Error(`LLM_PROMPT_CACHE_TTL invalide: ${value}. Valeurs attendues: 5m, 1h.`)
}

function promptCacheControl(): Anthropic.CacheControlEphemeral | undefined {
  if (!LLM_PROMPT_CACHE_ENABLED) return undefined
  return { type: 'ephemeral', ttl: LLM_PROMPT_CACHE_TTL }
}

function textBlockWithPromptCache(text: string): Anthropic.TextBlockParam {
  const cacheControl = promptCacheControl()
  return {
    type: 'text',
    text,
    ...(cacheControl ? { cache_control: cacheControl } : {}),
  }
}

function withToolPromptCache(tools: Anthropic.Tool[]): Anthropic.Tool[] {
  const cacheControl = promptCacheControl()
  if (!cacheControl || tools.length === 0) return tools
  return tools.map((tool, index) => index === tools.length - 1
    ? { ...tool, cache_control: cacheControl }
    : tool
  )
}

function nextLlmCallWouldExceedBudget(requestCallCount: number, sessionId: string | undefined): boolean {
  if (!LLM_HARD_BUDGET_ENABLED) return false
  if (requestCallCount > LLM_MAX_CALLS_PER_REQUEST) return true

  const budgetSessionId = normalizeBudgetSessionId(sessionId)
  const nextSessionCalls = (sessionLlmCalls.get(budgetSessionId) ?? 0) + 1
  return LLM_MAX_CALLS_PER_SESSION > 0 && nextSessionCalls > LLM_MAX_CALLS_PER_SESSION
}

function mergeLlmRoute(current: LlmRoute, next: LlmRoute): LlmRoute {
  if (next === 'blocked') return 'blocked'
  if (current === 'blocked') return 'blocked'
  if (current === 'rich' || next === 'rich') return 'rich'
  if (current === 'short' || next === 'short') return 'short'
  return 'none'
}

function maxTokensForLlmRoute(route: LlmRoute): number {
  return route === 'rich' ? LLM_RICH_NARRATION_MAX_TOKENS : LLM_SHORT_NARRATION_MAX_TOKENS
}

function selectIterationLlmRoute(actionIntent: GameActionIntent, requestCallCount: number, sessionId: string | undefined): LlmRoute {
  if (nextLlmCallWouldExceedBudget(requestCallCount, sessionId)) return 'blocked'
  if (
    actionIntent.kind === 'social' ||
    actionIntent.kind === 'interact' ||
    isCanonicalWorldActionKind(actionIntent.kind) ||
    actionIntent.kind === 'guidance' ||
    actionIntent.kind === 'observe'
  ) {
    return 'rich'
  }

  return 'short'
}

function selectFinalNarrationLlmRoute(
  actionIntent: GameActionIntent,
  toolsUsed: string[],
  requestCallCount: number,
  sessionId: string | undefined
): LlmRoute {
  if (nextLlmCallWouldExceedBudget(requestCallCount, sessionId)) return 'blocked'
  if (
    actionIntent.kind === 'social' ||
    actionIntent.kind === 'interact' ||
    isCanonicalWorldActionKind(actionIntent.kind) ||
    actionIntent.kind === 'guidance' ||
    actionIntent.kind === 'observe'
  ) {
    return 'rich'
  }
  if (toolsUsed.length > 0) return 'short'
  return 'short'
}

function normalizeBudgetSessionId(sessionId: string | undefined): string {
  const normalized = sessionId?.trim().replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128)
  return normalized || 'default'
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`

  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, child]) => `${JSON.stringify(key)}:${stableStringify(child)}`)
  return `{${entries.join(',')}}`
}

function cassetteKey(operation: LlmOperation, params: MessageCreateParams): string {
  return crypto
    .createHash('sha256')
    .update(stableStringify({ operation, params }))
    .digest('hex')
}

function lastUserText(messages: MessageCreateParams['messages']): string {
  const last = [...messages].reverse().find(message => message.role === 'user')
  if (!last) return ''
  if (typeof last.content === 'string') return last.content
  return last.content
    .map(block => 'text' in block && typeof block.text === 'string' ? block.text : '')
    .filter(Boolean)
    .join('\n')
}

function toolAvailable(name: string, tools: Anthropic.Tool[] | undefined): boolean {
  return Boolean(tools?.some(tool => tool.name === name))
}

function mockUsage() {
  return {
    input_tokens: 0,
    output_tokens: 0,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
  }
}

function mockTextMessage(text: string): Anthropic.Message {
  return {
    id: `msg_mock_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    type: 'message',
    role: 'assistant',
    model: MODEL,
    content: [{ type: 'text', text }],
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: mockUsage(),
  } as Anthropic.Message
}

function mockToolMessage(name: string, input: Record<string, unknown>): Anthropic.Message {
  return {
    id: `msg_mock_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    type: 'message',
    role: 'assistant',
    model: MODEL,
    content: [{
      type: 'tool_use',
      id: `toolu_mock_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name,
      input,
    }],
    stop_reason: 'tool_use',
    stop_sequence: null,
    usage: mockUsage(),
  } as Anthropic.Message
}

function createMockLlmMessage(params: MessageCreateParams, context: LlmCallContext): Anthropic.Message {
  if (context.operation === 'history.compress') {
    return mockTextMessage('Résumé mock: les échanges précédents sont conservés sous forme condensée pour les tests.')
  }

  if (context.operation === 'dm.intent_interpreter') {
    const gameState = context.gameState
    if (!gameState) {
      return mockTextMessage(JSON.stringify({
        schemaVersion: 1,
        intentKind: 'pass_through',
        confidence: 0.2,
        requiresClarification: false,
        canonicalAction: null,
        improvisation: null,
        targetHints: {},
        reasoningSummary: 'Aucun etat moteur disponible pour interpreter.',
        source: 'mock',
      }))
    }

    return mockTextMessage(JSON.stringify(interpretPlayerIntentMock({
      message: context.playerMessage || lastUserText(params.messages),
      gameState,
    })))
  }

  if (context.operation === 'dm.final_narration' || context.operation === 'dm.final_narration_fallback') {
    const prompt = lastUserText(params.messages)
    const draftMatch = prompt.match(/Brouillon non autoritaire[\s\S]*?:\n([\s\S]*?)\n\nPaquet moteur/)
    const draft = draftMatch?.[1]?.trim()
    if (draft && !/\[Mock\]/.test(draft)) {
      return mockTextMessage(draft)
    }

    const latestMechanical = context.newCombatLogEntries?.at(-1)?.mechanicalDetail
    if (latestMechanical) {
      return mockTextMessage(`L'action se résout: ${latestMechanical}. La scène reste ouverte.`)
    }

    return mockTextMessage('La scène avance; un détail concret te donne une prise pour continuer.')
  }

  const text = (context.playerMessage || lastUserText(params.messages)).toLowerCase()
  const gameState = context.gameState

  if (!gameState) return mockTextMessage('Le Dungeon Master observe la situation.')

  if (gameState.phase === 'combat' && gameState.currentTurn && gameState.currentTurn !== 'player') {
    return mockTextMessage("Les adversaires agissent avant que tu puisses reprendre l'initiative.")
  }

  if (gameState.phase === 'combat' && /passe|attend|attends|patient|ne fais rien/.test(text) && toolAvailable('resolve_player_action', context.tools)) {
    return mockToolMessage('resolve_player_action', {
      action: { kind: 'wait', reason: 'Le joueur attend.' },
    })
  }

  if (gameState.phase === 'combat' && /passe|attend|attends|patient|ne fais rien/.test(text) && toolAvailable('pass_turn', context.tools)) {
    return mockToolMessage('pass_turn', { reason: 'Le joueur attend.' })
  }

  const mockWorldAction = parseWorldActionInput(context.playerMessage || lastUserText(params.messages), gameState)
  if (mockWorldAction && toolAvailable('resolve_player_action', context.tools)) {
    return mockToolMessage('resolve_player_action', canonicalPlayerActionInput(mockWorldAction))
  }

  if (gameState.phase === 'exploration' && /gobelin|combat|debarque|perisse|fuyez|attaque|attque/.test(text) && toolAvailable('start_encounter', context.tools)) {
    return mockToolMessage('start_encounter', {
      encounterId: 'bakery_floor_goblins',
      reason: 'Le joueur provoque bruyamment les gobelins du sol de la boulangerie.',
    })
  }

  const coordinateMatch = text.match(/\(?\s*(\d{1,2})\s*[,;]\s*(\d{1,2})\s*\)?/)
  if (coordinateMatch && /va|vais|avance|bouge|déplace|deplace|marche|case/.test(text) && toolAvailable('resolve_player_action', context.tools)) {
    return mockToolMessage('resolve_player_action', {
      action: {
        kind: 'move',
        tokenId: 'player',
        toCell: { x: Number(coordinateMatch[1]), y: Number(coordinateMatch[2]) },
      },
    })
  }

  if (coordinateMatch && /va|vais|avance|bouge|déplace|deplace|marche|case/.test(text) && toolAvailable('move_token', context.tools)) {
    return mockToolMessage('move_token', {
      tokenId: 'player',
      toCell: { x: Number(coordinateMatch[1]), y: Number(coordinateMatch[2]) },
    })
  }

  if (gameState.phase === 'combat' && gameState.currentTurn === 'player' && /attaque|attque|frappe|tape|coup|charge/.test(text) && toolAvailable('resolve_player_action', context.tools)) {
    return mockToolMessage('resolve_player_action', {
      action: {
        kind: 'attack',
        targetHint: 'nearest',
        weaponOrSpell: 'longsword',
      },
    })
  }

  if (gameState.phase === 'combat' && gameState.currentTurn === 'player' && /attaque|attque|frappe|tape|coup|charge/.test(text) && toolAvailable('resolve_player_attack', context.tools)) {
    return mockToolMessage('resolve_player_attack', {
      targetHint: 'nearest',
      weaponOrSpell: 'longsword',
    })
  }

  return mockTextMessage('La scène progresse; quelque chose dans le décor répond à ton geste.')
}

async function readCassette(key: string): Promise<Anthropic.Message | null> {
  try {
    const raw = await fs.readFile(path.join(LLM_CASSETTE_DIR, `${key}.json`), 'utf-8')
    return JSON.parse(raw) as Anthropic.Message
  } catch {
    return null
  }
}

async function writeCassette(key: string, message: Anthropic.Message): Promise<void> {
  await fs.mkdir(LLM_CASSETTE_DIR, { recursive: true })
  await fs.writeFile(path.join(LLM_CASSETTE_DIR, `${key}.json`), JSON.stringify(message, null, 2), 'utf-8')
}

async function createLlmMessage(params: MessageCreateParams, context: LlmCallContext): Promise<Anthropic.Message> {
  if (LLM_HARD_BUDGET_ENABLED && context.requestCallCount > LLM_MAX_CALLS_PER_REQUEST) {
    throw new Error(`Budget LLM dépassé pour cette requête (${LLM_MAX_CALLS_PER_REQUEST} appels max).`)
  }

  const budgetSessionId = normalizeBudgetSessionId(context.sessionId)
  const nextSessionCalls = (sessionLlmCalls.get(budgetSessionId) ?? 0) + 1
  if (LLM_HARD_BUDGET_ENABLED && LLM_MAX_CALLS_PER_SESSION > 0 && nextSessionCalls > LLM_MAX_CALLS_PER_SESSION) {
    throw new Error(`Budget LLM dépassé pour cette session (${LLM_MAX_CALLS_PER_SESSION} appels max).`)
  }

  logEvent('info', 'llm.call.start', {
    requestId: context.requestId,
    sessionId: context.sessionId,
    operation: context.operation,
    mode: LLM_MODE,
    llmRoute: context.llmRoute ?? 'none',
    requestCallCount: context.requestCallCount,
    sessionCallCount: nextSessionCalls,
    hardBudgetEnabled: LLM_HARD_BUDGET_ENABLED,
    promptCacheEnabled: LLM_PROMPT_CACHE_ENABLED,
    promptCacheTtl: LLM_PROMPT_CACHE_ENABLED ? LLM_PROMPT_CACHE_TTL : null,
  })

  if (LLM_MODE === 'mock') {
    return createMockLlmMessage(params, context)
  }

  const key = cassetteKey(context.operation, params)
  if (LLM_MODE === 'replay') {
    const replayed = await readCassette(key)
    if (replayed) {
      logEvent('info', 'llm.replay.hit', { requestId: context.requestId, sessionId: context.sessionId, operation: context.operation, key })
      return replayed
    }
    logEvent('warn', 'llm.replay.miss', { requestId: context.requestId, sessionId: context.sessionId, operation: context.operation, key })
    if (LLM_REPLAY_FALLBACK_TO_MOCK) return createMockLlmMessage(params, context)
    throw new Error(`Cassette LLM introuvable pour ${context.operation}: ${key}`)
  }

  if (!ALLOW_PAID_LLM) {
    throw new Error('Appels LLM payants désactivés (ALLOW_PAID_LLM=false). Utilise LLM_MODE=mock ou replay.')
  }

  sessionLlmCalls.set(budgetSessionId, nextSessionCalls)
  const response = await anthropic.messages.create(params)

  if (LLM_MODE === 'record') {
    await writeCassette(key, response)
    logEvent('info', 'llm.record.saved', { requestId: context.requestId, sessionId: context.sessionId, operation: context.operation, key })
  }

  return response
}

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

function dmPromptBuildOptions(): DmPromptBuildOptions {
  return {
    moduleContextMaxChars: MODULE_CONTEXT_MAX_CHARS,
    serializeGameState,
    textBlockWithPromptCache,
  }
}

// ── Compression de l'historique ───────────────────────────────────────────────
// Appel séparé à Haiku pour résumer les anciens échanges en un paragraphe court.
// Le résumé est renvoyé au client qui le stocke et le renvoie à chaque requête.
async function compressHistory(
  oldTurns: ConversationTurn[],
  existingSummary: string | undefined,
  usageLog: AnthropicUsageLogEntry[],
  requestId: string,
  sessionId: string | undefined,
  inputMode: string,
  clientRequestId: string | undefined
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

  const response = await createLlmMessage({
    model: MODEL,
    max_tokens: 300,
    messages: [{ role: 'user', content: prompt }],
  }, {
    requestId,
    sessionId,
    operation: 'history.compress',
    requestCallCount: usageLog.length + 1,
  })

  usageLog.push(logAnthropicUsage({
    requestId,
    sessionId,
    inputMode,
    clientRequestId,
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
  requestId: string,
  sessionId: string | undefined,
  inputMode: string,
  clientRequestId: string | undefined
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
  const needsCompression = oldText.length > HISTORY_COMPRESS_THRESHOLD_CHARS

  if (!needsCompression) {
    if (existingSummary) {
      logEvent('debug', 'dm.history.process.reuse_summary', {
        requestId,
        historyLength: history.length,
        oldTurns: oldTurns.length,
        recentTurns: recent.length,
        oldTextLength: oldText.length,
        thresholdChars: HISTORY_COMPRESS_THRESHOLD_CHARS,
        existingSummaryLength: existingSummary.length,
      })
      return { recent: history, newSummary: undefined }
    }

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

  const newSummary = await compressHistory(
    oldTurns,
    existingSummary,
    usageLog,
    requestId,
    sessionId,
    inputMode,
    clientRequestId
  )
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
    if (last && last.role === role) {
      if (typeof last.content === 'string') {
        last.content = `${last.content}\n\n${turn.content}`
      }
      continue
    }

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

function mcpErrorCode(result: unknown): string | null {
  return isObjectRecord(result) && typeof result.code === 'string'
    ? result.code
    : null
}

function hasCompletedCurrentAction(gameState: GameState | undefined | null): boolean {
  if (!gameState || gameState.phase !== 'combat' || !gameState.currentTurn) return false
  return Boolean(gameState.actionUsed?.[gameState.currentTurn])
}

type RequiredMechanicalAction = {
  reason: string
  suggestedTools: string[]
  actionKind?: GameActionKind
  primitive?: GameActionPrimitive
  confidence?: GameActionConfidence
}

const TOOL_INTENT_SATISFIERS: Record<string, string[]> = {
  'player-combat-attack-intent': ['resolve_player_action', 'resolve_player_attack', 'move_token'],
  'player-combat-movement-intent': ['resolve_player_action', 'move_token', 'resolve_player_attack'],
  'player-death-save-intent': ['resolve_player_action', 'roll_death_save'],
  'healing-potion-intent': ['resolve_player_action', 'use_healing_potion'],
  'ability-check-intent': ['resolve_player_action', 'roll_ability_check'],
  'state-reconcile-location': ['resolve_player_action', 'move_token'],
  'local-object-interaction-intent': ['resolve_player_action', 'trigger_room_event', 'roll_ability_check', 'start_encounter', 'use_healing_potion'],
  'exploration-movement-intent': ['resolve_player_action', 'move_token', 'trigger_room_event', 'start_encounter', 'end_combat'],
  'encounter-or-attack-intent': ['resolve_player_action', 'start_encounter', 'resolve_player_attack'],
}

const LLM_TOOL_SETS = {
  explorationAmbient: ['roll_ability_check', 'trigger_room_event', 'get_entity_stats'],
  explorationDefault: ['resolve_player_action', 'get_entity_stats'],
  explorationMovement: ['resolve_player_action', 'start_encounter', 'get_entity_stats'],
  explorationEncounter: ['resolve_player_action', 'start_encounter', 'get_entity_stats'],
  combatPlayer: ['resolve_player_action', 'end_combat', 'get_entity_stats'],
  combatNonPlayer: ['roll_ability_check', 'roll_dice', 'get_entity_stats'],
  dialogue: ['resolve_player_action', 'get_entity_stats', 'apply_condition'],
} as const

type PlayerAttackTargetHint = 'nearest' | 'right' | 'left' | 'front' | 'back' | 'wounded'
type AbilityKey = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha'
type PendingAbilityCheck = {
  ability: AbilityKey
  dc?: number
  label: string
  proficient?: boolean
  social?: boolean
}

function hasToolSatisfyingMechanicalAction(
  requiredAction: RequiredMechanicalAction,
  toolsUsed: string[]
): boolean {
  const satisfiers = TOOL_INTENT_SATISFIERS[requiredAction.reason] ?? requiredAction.suggestedTools
  const satisfierSet = new Set(satisfiers)
  return toolsUsed.some(toolName => satisfierSet.has(toolName))
}

function pickTools(allTools: Anthropic.Tool[], names: readonly string[]): Anthropic.Tool[] {
  const byName = new Map(allTools.map(tool => [tool.name, tool]))
  return names
    .map(name => byName.get(name))
    .filter((tool): tool is Anthropic.Tool => Boolean(tool))
}

function selectToolsForLlm(
  allTools: Anthropic.Tool[],
  gameState: GameState,
  actionIntent: GameActionIntent
): Anthropic.Tool[] {
  if (allTools.length === 0) return []

  if (gameState.phase === 'combat') {
    if (gameState.currentTurn !== 'player') return pickTools(allTools, LLM_TOOL_SETS.combatNonPlayer)

    if (actionIntent.kind === 'attack') return pickTools(allTools, ['resolve_player_action'])
    if (actionIntent.kind === 'move') return pickTools(allTools, ['resolve_player_action'])
    if (actionIntent.kind === 'wait') return pickTools(allTools, ['resolve_player_action'])
    if (actionIntent.kind === 'death_save') return pickTools(allTools, ['resolve_player_action'])
    if (actionIntent.kind === 'use_item') return pickTools(allTools, ['resolve_player_action'])
    if (actionIntent.kind === 'state_reconcile') return pickTools(allTools, ['resolve_player_action'])
    if (isCanonicalWorldActionKind(actionIntent.kind)) return pickTools(allTools, ['resolve_player_action', 'get_entity_stats'])
    if (actionIntent.kind === 'social') return pickTools(allTools, ['resolve_player_action', 'get_entity_stats'])
    if (actionIntent.kind === 'ability_check') return pickTools(allTools, ['resolve_player_action'])
    if (actionIntent.kind === 'unknown') return pickTools(allTools, ['resolve_player_action', 'get_entity_stats'])
    if (actionIntent.kind === 'observe' || actionIntent.kind === 'guidance' || actionIntent.kind === 'query_state') {
      return pickTools(allTools, ['get_entity_stats'])
    }

    return pickTools(allTools, LLM_TOOL_SETS.combatPlayer)
  }

  if (gameState.phase === 'dialogue') {
    return pickTools(allTools, LLM_TOOL_SETS.dialogue)
  }

  if (actionIntent.kind === 'move') {
    return pickTools(allTools, LLM_TOOL_SETS.explorationMovement)
  }

  if (actionIntent.kind === 'state_reconcile') {
    return pickTools(allTools, ['resolve_player_action'])
  }

  if (actionIntent.kind === 'attack' || actionIntent.kind === 'encounter') {
    return pickTools(allTools, LLM_TOOL_SETS.explorationEncounter)
  }

  if (actionIntent.kind === 'interact') {
    return pickTools(allTools, ['resolve_player_action', 'start_encounter', 'get_entity_stats'])
  }

  if (actionIntent.kind === 'use_item') {
    return pickTools(allTools, ['resolve_player_action'])
  }

  if (isCanonicalWorldActionKind(actionIntent.kind)) {
    return pickTools(allTools, ['resolve_player_action', 'get_entity_stats'])
  }

  if (actionIntent.kind === 'social' || actionIntent.kind === 'ability_check') {
    return pickTools(allTools, ['resolve_player_action', 'get_entity_stats'])
  }

  if (actionIntent.kind === 'unknown') return pickTools(allTools, ['resolve_player_action', 'get_entity_stats'])

  if (actionIntent.kind === 'observe' || actionIntent.kind === 'guidance' || actionIntent.kind === 'query_state') {
    return pickTools(allTools, ['get_entity_stats'])
  }

  return pickTools(allTools, LLM_TOOL_SETS.explorationDefault)
}

function aliveMonsters(gameState: GameState): MonsterState[] {
  return Object.values(gameState.monsters).filter(monster => monster.isAlive)
}

type NarrativeStateContractIssue = {
  reason: string
  matchedTriggers: string[]
  suggestedTools: string[]
}

function countAliveMonsters(gameState: GameState): number {
  return Object.values(gameState.monsters).filter(monster => monster.isAlive).length
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const GENERIC_MONSTER_TERMS = new Set(['le', 'la', 'les', 'un', 'une', 'des', 'du', 'de', 'gobelin', 'gobelins', 'garde', 'gardes', 'chef'])

function specificMonsterAliases(monster: MonsterState, gameState: GameState): string[] {
  const normalizedName = normalizeFrenchText(monster.name)
  const specificNameTerms = normalizedName
    .split(/[^a-z0-9']+/)
    .filter(term => term.length >= 4 && !GENERIC_MONSTER_TERMS.has(term))

  const aliases = [...specificNameTerms]

  const normalizedType = normalizeFrenchText(monster.type).replace(/_/g, ' ')
  const typeAliases: string[] = []
  if (normalizedType.includes('hobgoblin')) typeAliases.push('hobgobelin', 'hobgoblin')
  if (normalizedType.includes('violet fungus')) typeAliases.push('champignon violet')

  const sameTypeCount = Object.values(gameState.monsters)
    .filter(candidate => normalizeFrenchText(candidate.type).replace(/_/g, ' ') === normalizedType)
    .length

  if (sameTypeCount === 1) aliases.push(...typeAliases)

  return Array.from(new Set(aliases))
}

function textNarratesSpecificMonsterDead(text: string, monster: MonsterState, gameState: GameState): boolean {
  return specificMonsterAliases(monster, gameState).some(alias => {
    const escapedAlias = escapeRegExp(alias)
    const monsterThenDead = new RegExp(`\\b${escapedAlias}\\b.{0,100}\\b(?:meurt|s'effondre|s'ecroule|ne bouge plus|agonise|est\\s+mort(?:e)?|tombe\\s+mort(?:e)?|tombe\\s+pour\\s+de\\s+bon|abattu|inerte)\\b`)
    const deadThenMonster = new RegExp(`\\b(?:tues?|abats?|acheves?|achever|transperces?|executes?|execute)\\b.{0,100}\\b${escapedAlias}\\b`)
    return monsterThenDead.test(text) || deadThenMonster.test(text)
  })
}

function detectNarrativeStateContractIssue(
  responseText: string,
  gameState: GameState,
  toolsUsed: string[] = []
): NarrativeStateContractIssue | null {
  if (!responseText) {
    return null
  }

  const text = normalizeFrenchText(responseText)
  const aliveCount = countAliveMonsters(gameState)

  if (
    gameState.phase === 'combat' &&
    gameState.currentTurn === 'player' &&
    gameState.player.hp.current <= 0 &&
    !isPlayerDeathResolved(gameState)
  ) {
    const narratesEnemyActingNow =
      /\b(?:c'est|c est|maintenant)\s+a\s+(?:eux|elles|lui)\s+de\s+(?:frapper|jouer|agir|attaquer)\b/.test(text) ||
      /\ba\s+(?:eux|elles|lui)\s+de\s+(?:frapper|jouer|agir|attaquer)\b/.test(text) ||
      /\b(?:ils|elles|les gobelins|les ennemis|les adversaires)\s+(?:vont|peuvent|s'appretent a|se preparent a)\s+(?:frapper|attaquer|agir)\b/.test(text)
    if (narratesEnemyActingNow) {
      return {
        reason: 'enemy_turn_claim_while_player_death_save_open',
        matchedTriggers: ['enemy_acts_now_but_current_turn_player'],
        suggestedTools: ['roll_death_save'],
      }
    }
  }

  if (gameState.phase === 'combat' && aliveCount > 0 && !toolsUsed.includes('end_combat')) {
    const mentionsEnemies = /\b(gobelins?|ennemis?|monstres?|creatures?|adversaires?|gardes?|hobgobelins?|grukk|chef grukk)\b/.test(text)
    const narratesSurrenderOrEscape = /\b(se rendent?|se rend|rendent les armes|se soumettent?|soumis|soumission|s'agenouillent?|agenouille|lache(?:nt)?\s+(?:son|leur|leurs)\s+(?:arme|armes|cimeterre|cimeterres)|baissent les armes|baisse son arme|fuit|fuient|s'enfuit|s'enfuient|se sauvent?|disparaissent?|renegat|serment)\b/.test(text)
    const narratesCombatAsOver = /\b(combat cesse|combat est termine|combat termine|retrouve un silence|silence retombe|silence lourd|tu es seul|te voila seul|plus aucun danger|plus personne ne menace|armes redescendent|vivant mais victorious|victorious)\b/.test(text)
    if ((mentionsEnemies && narratesSurrenderOrEscape) || narratesCombatAsOver) {
      return {
        reason: 'enemy_resolution_without_engine_state',
        matchedTriggers: [
          ...(narratesSurrenderOrEscape ? ['enemy_surrender_or_escape_without_tool'] : []),
          ...(narratesCombatAsOver ? ['combat_over_tone_without_end_combat'] : []),
        ],
        suggestedTools: ['roll_ability_check', 'end_combat'],
      }
    }

    const aliveNamedContradictions = aliveMonsters(gameState).filter(monster =>
      textNarratesSpecificMonsterDead(text, monster, gameState)
    )
    if (aliveNamedContradictions.length > 0) {
      return {
        reason: 'named_alive_enemy_narrated_dead',
        matchedTriggers: aliveNamedContradictions.map(monster => `alive_${monster.id}_narrated_dead`),
        suggestedTools: ['resolve_player_attack', 'end_combat'],
      }
    }
  }

  if (gameState.phase !== 'exploration' || aliveCount > 0) {
    return null
  }

  const mentionsEnemies = /\b(gobelins?|ennemis?|monstres?|creatures?|silhouettes?|eclaireurs?|grukk|chef grukk)\b/.test(text) ||
    /\b(silhouettes?|formes?)\s+vertes?\b/.test(text)
  if (!mentionsEnemies) return null

  const narratesJustDefeatedEnemy = toolsUsed.includes('resolve_player_attack') &&
    /\b(meurt|mort|morte|dernier cri|s'effondre|s'ecroule|tombe|inerte|cadavre|corps|transperce|abat|abattu|sang)\b/.test(text)
  if (narratesJustDefeatedEnemy) return null

  const onlySaysNoVisibleEnemies = /\b(aucun|pas de|rien|personne)\b.{0,60}\b(gobelins?|ennemis?|monstres?|creatures?|silhouettes?|grukk)\b.{0,80}\b(visible|en vue|se montre|devant toi)\b/.test(text)
  const explicitVisibleEnemy = /\b(une?|des|deux|trois|quatre|cinq|plusieurs)\s+(gobelins?|ennemis?|monstres?|creatures?|silhouettes?|formes?)\b/.test(text) ||
    /\b(silhouettes?|formes?)\s+vertes?\b/.test(text) ||
    /\bchef grukk\b/.test(text)

  const triggerPatterns: Array<[string, RegExp]> = [
    ['enemy_visible_without_tokens', /\b(vois|voyez|apercois|apercevez|distingues?|detectes?|remarques?|visible|en vue|se montre|se tiennent?|au fond|pres de|devant toi|dans la salle|mouvement)\b/],
    ['enemy_enters_or_moves', /\b(entrent?|rentrent?|arrivent?|approchent?|surgissent?|debarquent?|emergent?|emerge|apparai(?:t|ssent)|passent?|descendent|convergent|encerclent?|se rapprochent|suivent?|poursuivent?|trainent?|se deplacent?|fuient|fuit|fuir|se sauvent?|s[' ]?enfuient|disparaissent?|filent?|detalent?)\b/],
    ['enemy_takes_action', /\b(degainent?|attaquent?|frappent?|chargent?|scrutent?|fouillent?|poussent?|se retournent?|reperent?|repere|voient?|apercoivent?|crient?|grondent?)\b/],
    ['combat_state_without_engine', /\b(combat imminent|initiative|armes? degainees?|epees? degainees?|vous etes repere|intrus)\b/],
  ]
  const matchedTriggers = triggerPatterns
    .filter(([, pattern]) => pattern.test(text))
    .map(([name]) => name)

  if (matchedTriggers.length === 0) return null
  if (onlySaysNoVisibleEnemies && !explicitVisibleEnemy && matchedTriggers.every(trigger => trigger === 'enemy_visible_without_tokens')) {
    return null
  }

  return {
    reason: 'enemy_presence_without_engine_state',
    matchedTriggers,
    suggestedTools: ['start_encounter'],
  }
}

function detectNarrativeWorldContractIssue(
  responseText: string,
  gameState: GameState,
  toolsUsed: string[] = [],
  engineEvents: EngineEvent[] = []
): NarrativeStateContractIssue | null {
  if (!responseText || !gameState.world) return null

  const text = normalizeFrenchText(responseText)
  const world = gameState.world
  const objects = Object.values(world.objects)
  const npcs = Object.values(world.npcs)
  const recentEvents = [...world.eventLog.slice(-8), ...engineEvents]
  const recentEventTypes = new Set(recentEvents.map(event => event.type))
  const unsupportedFacts = detectUnsupportedNarratedWorldFacts(responseText, gameState, recentEvents, toolsUsed)
  if (unsupportedFacts.length > 0) {
    const first = unsupportedFacts[0]
    return {
      reason: first.reason,
      matchedTriggers: unsupportedFacts.map(problem => `${problem.fact.kind}:${problem.fact.trigger}`),
      suggestedTools: first.suggestedTools,
    }
  }

  const narratesRecipeAcquired =
    /\b(trouves?|trouve|decouvres?|decouvre|ramasses?|ramasse|prends?|prend|recuperes?|recupere|empoches?|empoche)\b.{0,80}\b(recette|fragment|moitie|parchemin|papier)\b/.test(text) ||
    /\b(recette|fragment|moitie|parchemin|papier)\b.{0,80}\b(trouve|decouvert|ramasse|pris|recupere|dans ta main|dans ton sac|inventaire)\b/.test(text)
  if (narratesRecipeAcquired) {
    const recipeTaken = objects.some(object => object.tags?.includes('recipe_half') && object.taken)
    const recipeFoundEvent = recentEventTypes.has('quest.item_found') || recentEventTypes.has('object.taken')
    if (!recipeTaken && !recipeFoundEvent) {
      return {
        reason: 'recipe_found_without_engine_state',
        matchedTriggers: ['recipe_acquired_text_without_quest_item_found'],
        suggestedTools: ['resolve_player_action'],
      }
    }
  }

  const narratesDoorOpened =
    /\b(porte|battants?|serrure|verrou)\b.{0,80}\b(s'ouvre|s ouvre|ouverte|ouvert|cedent?|cede|deverrouillee?|deverrouille|franchissable)\b/.test(text) ||
    /\b(ouvres?|ouvrez|forces?|force|crochetes?|crochete)\b.{0,80}\b(porte|tiroir|coffre|armoire)\b/.test(text)
  if (narratesDoorOpened) {
    const openObjectExists = objects.some(object => ['door', 'container'].includes(object.kind) && object.opened)
    const openedEvent = recentEventTypes.has('door.opened') || recentEventTypes.has('object.opened')
    if (!openObjectExists && !openedEvent) {
      return {
        reason: 'object_opened_without_engine_state',
        matchedTriggers: ['opened_text_without_open_event'],
        suggestedTools: ['resolve_player_action'],
      }
    }
  }

  const narratesObjectDiscovered =
    /\b(decouvres?|decouvre|trouves?|trouve|revele|apparait|apercois|apercoit)\b.{0,80}\b(tiroir|coffre|armoire|indice|parchemin|fragment|recette)\b/.test(text)
  if (narratesObjectDiscovered) {
    const discoveredRelevantObject = objects.some(object =>
      object.discovered &&
      (
        object.tags?.includes('recipe_half') ||
        object.tags?.includes('recipe_cache') ||
        ['container', 'clue', 'item'].includes(object.kind)
      )
    )
    const discoveryEvent = recentEventTypes.has('room.object_discovered') || recentEventTypes.has('quest.item_found')
    if (!discoveredRelevantObject && !discoveryEvent) {
      return {
        reason: 'object_discovered_without_engine_state',
        matchedTriggers: ['discovery_text_without_object_discovered_event'],
        suggestedTools: ['resolve_player_action'],
      }
    }
  }

  const narratesNpcConvinced =
    /\b(convaincu|convaincs?|accepte|cede|te croit|t'aide|t aide|devient amical|devient allie|se rallie|cooperer|coopere)\b/.test(text) &&
    /\b(mac|grukk|dryade|druidesse|pommier|gobelin|pnj|il|elle)\b/.test(text)
  if (narratesNpcConvinced) {
    const compatibleNpcState = npcs.some(npc => npc.disposition === 'helpful' || npc.disposition === 'wary')
    const dispositionEvent = recentEventTypes.has('npc.disposition_changed') || toolsUsed.includes('roll_ability_check')
    if (!compatibleNpcState && !dispositionEvent) {
      return {
        reason: 'npc_convinced_without_engine_state',
        matchedTriggers: ['npc_convinced_text_without_disposition_event'],
        suggestedTools: ['resolve_player_action'],
      }
    }
  }

  const narratesRecipeCompleted =
    /\b(recette)\b.{0,100}\b(complete|assemblee|reconstituee|entiere|terminee|reparee)\b/.test(text) ||
    /\b(deux|2)\b.{0,80}\b(moities|fragments|morceaux)\b.{0,80}\b(ensemble|assembl(?:e|es)|reunis?|recoll(?:e|es))\b/.test(text)
  if (narratesRecipeCompleted) {
    const recipeQuest = world.quests.grammy_recipe
    const completedEvent = recentEventTypes.has('quest.completed')
    const recipeComplete = Boolean(recipeQuest?.completed && recipeQuest.progress >= recipeQuest.goal)
    if (!recipeComplete && !completedEvent) {
      return {
        reason: 'recipe_completed_without_engine_state',
        matchedTriggers: ['recipe_complete_text_without_quest_completed_event'],
        suggestedTools: ['resolve_player_action'],
      }
    }
  }

  const narratesTrapTriggered =
    /\b(piege|champignons?|couteaux?|ratelier|mecanisme)\b.{0,100}\b(declenche|active|s active|blesse|empoisonne|jaillit|attaque|se referme)\b/.test(text)
  if (narratesTrapTriggered) {
    const triggeredTrapState = objects.some(object => object.kind === 'trap' && object.used && !object.disarmed)
    const trapTriggeredEvent = recentEventTypes.has('trap.triggered')
    if (!triggeredTrapState && !trapTriggeredEvent) {
      return {
        reason: 'trap_triggered_without_engine_state',
        matchedTriggers: ['trap_trigger_text_without_trap_event'],
        suggestedTools: ['resolve_player_action'],
      }
    }
  }

  const narratesTrapDisarmed =
    /\b(piege|champignons?|couteaux?|ratelier|mecanisme)\b.{0,100}\b(desamorce|neutralise|desactive|inoffensif|sans danger)\b/.test(text)
  if (narratesTrapDisarmed) {
    const disarmedTrapState = objects.some(object => object.kind === 'trap' && object.disarmed)
    const trapDisarmedEvent = recentEventTypes.has('trap.disarmed')
    if (!disarmedTrapState && !trapDisarmedEvent) {
      return {
        reason: 'trap_disarmed_without_engine_state',
        matchedTriggers: ['trap_disarmed_text_without_trap_disarmed_event'],
        suggestedTools: ['resolve_player_action'],
      }
    }
  }

  const raisedAlarms = Object.entries(world.alarms).filter(([, alarm]) => alarm.raised && alarm.level > 0)
  const narratesNoAlarm =
    /\b(tout est calme|aucune alerte|personne n a entendu|personne ne remarque|personne ne reagit|le silence retombe|rien ne bouge)\b/.test(text)
  if (raisedAlarms.length > 0 && narratesNoAlarm && !recentEventTypes.has('alarm.raised')) {
    return {
      reason: 'alarm_ignored_by_narration',
      matchedTriggers: raisedAlarms.map(([alarmId, alarm]) => `alarm_${alarmId}_raised_level_${alarm.level}`),
      suggestedTools: ['resolve_player_action'],
    }
  }

  return null
}

function detectNarrativeRoomContractIssue(
  responseText: string,
  gameState: GameState,
  toolsUsed: string[]
): NarrativeStateContractIssue | null {
  if (!responseText || !gameState.currentRoomId) return null
  if (toolsUsed.some(toolName => toolName === 'move_token' || toolName === 'start_encounter')) {
    return null
  }

  const text = normalizeFrenchText(responseText)
  if (/\b(?:passes?|passe|tombe|descend|monte)\s+a\s+\d+\/\d+\b/.test(text)) {
    return null
  }

  const narratesTransition = /\b(tu|vous)\s+(?:te|vous)?\s*(?:approches?|approchez|avances?|avancez|entres?|entrez|passes?|passez|traverses?|traversez|arrives?|arrivez|remontes?|remontez|retournes?|retournez|descends?|descendez|montes?|montez)\b/.test(text) ||
    /\b(tu|vous)\s+(?:l[' ]?)?(?:ouvres?|ouvrez|pousses?|poussez|franchis|franchissez)\b/.test(text) ||
    /\b(?:te|vous)\s+voila\s+(?:dans|pres de|devant)\b/.test(text) ||
    /\b(?:tu|vous)\s+(?:es|etes)\s+(?:au|aux|a la|dans|pres de|devant|au fond de)\b/.test(text)

  if (!narratesTransition) return null

  const targetRoomPatterns: Array<[string, RegExp]> = [
    ['2', /\b(verger|pommiers?|pommier|arbres?)\b/],
    ['3', /\b(tas de dechets?|dechets?|champignons?|violets?)\b/],
    ['5', /\b(bureau|paperasse|registres?|classeurs?)\b/],
    ['7', /\b(quai de chargement|quai|chargement|porte laterale|chariot)\b/],
    ['8', /\b(sol(?: de la)? boulangerie|fours?|fournee|reserve|reserves|porte des reserves|plans de travail|sacs de farine|tonneaux|etageres effondrees)\b/],
    ['9', /\b(appartement|grammy|chef grukk|grukk|lit|armoire|taniere)\b/],
  ]

  const matchedRooms = targetRoomPatterns
    .filter(([roomId, pattern]) => roomId !== gameState.currentRoomId && pattern.test(text))
    .map(([roomId]) => roomId)

  if (matchedRooms.length === 0) return null

  return {
    reason: 'room_transition_without_engine_state',
    matchedTriggers: matchedRooms.map(roomId => `room_${roomId}_mentioned_without_move`),
    suggestedTools: ['move_token', 'start_encounter'],
  }
}

function buildPotionContradictionCorrection(gameState: GameState): string {
  if (gameState.player.hp.current <= 0) {
    return "La potion agit bel et bien: une chaleur breve te remonte dans la poitrine. Mais la riposte te fauche aussitot, et tu retombes a 0 PV, inconscient; la seule ouverture claire maintenant, c'est le jet de mort."
  }

  return `La potion agit bel et bien: tu remontes a ${gameState.player.hp.current}/${gameState.player.hp.max} PV. La fiole est vide parce que tu l'as bue, pas parce qu'elle etait inutile.`
}

function buildNarrativeStateCorrection(gameState: GameState, issue?: NarrativeStateContractIssue): string {
  if (issue?.reason === 'item_used_contradicted_by_narration') {
    return buildPotionContradictionCorrection(gameState)
  }
  return buildDirectiveSceneNarrative(gameState)
}

function requiredMechanicalActionFromIntent(intent: GameActionIntent): RequiredMechanicalAction | null {
  if (!intent.requiresEngine) return null

  return {
    reason: intent.reason,
    suggestedTools: intent.suggestedTools,
    actionKind: intent.kind,
    primitive: intent.primitive,
    confidence: intent.confidence,
  }
}

function detectRequiredMechanicalAction(message: string, gameState: GameState): RequiredMechanicalAction | null {
  return requiredMechanicalActionFromIntent(classifyPlayerAction(message, gameState))
}

function isPlayerAtZeroHp(gameState: GameState): boolean {
  return gameState.player.hp.current <= 0
}

function isPlayerDeathResolved(gameState: GameState): boolean {
  return Boolean(gameState.player.deathSaves?.stable || gameState.player.deathSaves?.dead)
}

function detectPlayerDownStatusQuestion(message: string): boolean {
  const text = normalizeFrenchText(message)
  return /\b(mort|mort en fait|inconscient|zero pv|0 pv|peux rien faire|peux pas|me defendre|attaquer|taper|frapper|redonner la main|rendre la main|bloque|bloquee|bloques|aucun sens|quel combat|comprends pas|comprends rien|pas clair)\b/.test(text)
}

function parseCoordinateMove(message: string, gameState: GameState): { x: number; y: number } | null {
  const text = normalizeFrenchText(message)
  if (!/\b(va|vais|aller|avance|bouge|deplace|marche|case|coordonnees?)\b/.test(text)) {
    return null
  }

  const coordinateMatch = text.match(/\(?\s*(\d{1,2})\s*[,;]\s*(\d{1,2})\s*\)?/)
  if (!coordinateMatch) return null

  const x = Number(coordinateMatch[1])
  const y = Number(coordinateMatch[2])
  if (!Number.isInteger(x) || !Number.isInteger(y)) return null
  if (x === gameState.player.position.x && y === gameState.player.position.y) return null

  return { x, y }
}

function centerCellForRoom(roomId: string): { x: number; y: number } | null {
  return centerCellForAdventureRoom(roomId)
}

function encounterIdForRoom(roomId: string | null | undefined): string | null {
  return encounterIdForAdventureRoom(roomId)
}

function roomEncounterTriggerReason(
  message: string,
  gameState: GameState,
  targetRoomId: string | null,
  encounterId: string | null
): string | null {
  if (!targetRoomId || !encounterId) return null
  if (gameState.phase !== 'exploration' || countAliveMonsters(gameState) > 0) return null

  const text = normalizeFrenchText(message)
  const hostileOrExplicit = /\b(attaque|attaquer|frappe|frapper|charge|combat|initiative|hostile|menace|provoque|provoquer|debarques?|perissez|fuyez)\b/.test(text)
  const huntsCreatures = /\b(cherches?|chercher|trouves?|trouver|traques?|traquer|pistes?|pister|suis|suivre|poursuis|poursuivre)\b(?=.{0,80}\b(gobelins?|ennemis?|monstres?|creatures?|patrouille|grukk)\b)/.test(text)

  if (targetRoomId === '9') {
    return 'Le joueur entre dans la salle finale ou provoque la garde de Grukk.'
  }

  if (targetRoomId === '3') {
    return 'Le joueur approche assez du tas de dechets pour reveiller le champignon violet.'
  }

  if (targetRoomId === '8') {
    const magicalObjectTrigger = /\b(four|fours|rouleaux?|couteaux?|enchantes?|magiques?)\b/.test(text) &&
      /\b(ouvres?|ouvrir|touches?|toucher|manipules?|manipuler|actionnes?|actionner|joues?|jouer|inspectes?|inspecter|fouilles?|fouiller)\b/.test(text)
    if (hostileOrExplicit || huntsCreatures || magicalObjectTrigger) {
      return 'Le joueur declenche les gobelins de la boulangerie par une interaction dangereuse ou hostile.'
    }
    return null
  }

  if (targetRoomId === '7') {
    const patrolTrigger = /\b(gobelins?|patrouille|bruyamment|sans discretion|je me montre|j'entre en force|j entre en force)\b/.test(text)
    if (hostileOrExplicit || huntsCreatures || patrolTrigger) {
      return 'Le joueur attire ou affronte la patrouille du quai de chargement.'
    }
    return null
  }

  return hostileOrExplicit || huntsCreatures
    ? 'Le joueur provoque explicitement une rencontre hostile.'
    : null
}

function relativeRoomIdForExplorationMove(text: string, gameState: GameState): string | null {
  const doorAction = isDoorTraversalIntent(text)
  const exploresForward = /\b(plus loin|aventure|aventurer|avance|avancer|nourriture|manger|reserve|reserves)\b/.test(text)
  const huntsEnemies = /\b(cherches?|chercher|trouves?|trouver|deniches?|denicher|traques?|traquer|pistes?|pister)\b(?=.{0,80}\b(gobelins?|ennemis?|mechants?|monstres?|creatures?|silhouettes?)\b)/.test(text)
  return relativeAdventureRoomIdForText(text, gameState.currentRoomId, {
    doorAction,
    forwardAction: exploresForward || huntsEnemies,
  })
}

function currentRoomExitIds(gameState: GameState): string[] {
  const roomId = gameState.currentRoomId
  if (!roomId || !gameState.world?.rooms?.[roomId]) return []
  return gameState.world.rooms[roomId].exits?.filter(exitId => exitId !== roomId) ?? []
}

function roomNameForChoice(gameState: GameState, roomId: string): string {
  return gameState.world?.rooms?.[roomId]?.name ??
    ADVENTURE_ROOMS.find(room => room.id === roomId)?.name ??
    `salle ${roomId}`
}

function contextualSensoryRoomIdForExplorationMove(text: string, gameState: GameState): string | null {
  const currentRoomId = gameState.currentRoomId
  if (!currentRoomId) return null

  const followsBakerySmell = /\b(origine de l odeur|source de l odeur|odeur|fumet|senteur|nourriture|pain|levain|fournee|fours?|four)\b/.test(text)
  const followsBakeryNoise = /\b(bruit|son|claquement|raclement|fracas|chant|voix|couteaux?)\b/.test(text)
  const followsStairs = /\b(escalier|etage|haut|monte|grimpes?|appartement|grammy|grukk)\b/.test(text)

  if (currentRoomId === '1' && (followsBakerySmell || followsBakeryNoise || /\b(entree|portes?|boulangerie)\b/.test(text))) {
    return '4'
  }

  if (currentRoomId === '4') {
    if (followsStairs) return '9'
    if (followsBakerySmell || followsBakeryNoise || /\b(cuisine|reserve|reserves|porte des reserves|porte vers les fours)\b/.test(text)) return '8'
  }

  if (currentRoomId === '5' && (followsBakerySmell || followsBakeryNoise || /\b(sol de la boulangerie|boulangerie)\b/.test(text))) {
    return '8'
  }

  if (currentRoomId === '7' && (followsBakerySmell || followsBakeryNoise || /\b(sol de la boulangerie|boulangerie)\b/.test(text))) {
    return '8'
  }

  if (currentRoomId === '8') {
    if (followsStairs) return '9'
    if (/\b(bureau|paperasse|registres?)\b/.test(text)) return '5'
    if (/\b(quai|chargement|laterale|dock)\b/.test(text)) return '7'
  }

  if (currentRoomId === '9' && /\b(fours?|fournee|boulangerie|reserve|reserves|descends?|descendre|bas)\b/.test(text)) {
    return '8'
  }

  return null
}

function uniqueVagueExplorationRoomId(text: string, gameState: GameState): string | null {
  if (!isVagueExplorationMoveText(text) || hasSpecificExplorationCue(text)) return null
  const exits = currentRoomExitIds(gameState)
  return exits.length === 1 ? exits[0] : null
}

function isAmbiguousExplorationMove(message: string, gameState: GameState): boolean {
  if (gameState.phase !== 'exploration') return false
  const text = normalizeFrenchText(message)
  if (!isVagueExplorationMoveText(text) || hasSpecificExplorationCue(text)) return false
  return currentRoomExitIds(gameState).length > 1
}

function buildAmbiguousExplorationMoveNarrative(gameState: GameState): string {
  const roomName = getCurrentRoomName(gameState) ?? 'la piece'
  const exits = currentRoomExitIds(gameState)
    .map(roomId => roomNameForChoice(gameState, roomId))
    .slice(0, 4)
  const exitText = exits.length > 0
    ? `Plusieurs issues restent ouvertes depuis ${roomName}: ${exits.join(', ')}.`
    : `Depuis ${roomName}, la direction n'est pas assez nette pour changer de piece.`
  return `${exitText} Donne-moi un repere concret, comme l'odeur des fours, l'escalier, le bureau ou le quai, et je te fais avancer sans tricher avec la carte.`
}

function locationChoicesForNarrative(gameState: GameState, limit = 5): string[] {
  return buildSceneSurface(gameState).exits
    .map(exit => exit.name)
    .filter(Boolean)
    .slice(0, limit)
}

function buildUnresolvedMoveNarrative(message: string, gameState: GameState, resolution: LocationResolution): string {
  const roomName = getCurrentRoomName(gameState) ?? 'la zone actuelle'
  const text = normalizeFrenchText(message)
  if (resolution.status === 'ambiguous') {
    const candidates = resolution.candidates
      .map(candidate => candidate.name)
      .filter(Boolean)
      .slice(0, 4)
    return `Je vois que tu veux te deplacer, mais plusieurs destinations peuvent correspondre: ${candidates.join(', ')}. Precise laquelle, et je te fais avancer proprement.`
  }

  if (resolution.status === 'current' && resolution.target) {
    if (isExitCurrentRoomIntent(text)) {
      const choices = locationChoicesForNarrative(gameState)
      return choices.length > 0
        ? `Tu veux quitter ${resolution.target.name}, mais il faut choisir une sortie claire: ${choices.join(', ')}.`
        : `Tu veux quitter ${resolution.target.name}, mais aucune sortie claire n'est declaree ici.`
    }
    return `Tu es deja du cote de ${resolution.target.name}. Dis-moi ce que tu fais ici: parler, fouiller, ouvrir quelque chose, ou repartir vers une autre issue.`
  }

  const choices = locationChoicesForNarrative(gameState)
  const choiceText = choices.length > 0
    ? ` Depuis ${roomName}, les destinations claires sont: ${choices.join(', ')}.`
    : ` Depuis ${roomName}, je n'ai pas de sortie claire a proposer.`
  return `Je vois une intention de deplacement, mais je n'ai pas de destination assez claire pour te faire avancer.${choiceText} Donne un repere concret, et je l'executerai sans inventer de trajet.`
}

function unresolvedEngineIntentResolution(
  message: string,
  gameState: GameState,
  actionIntent: GameActionIntent
): { code: string; narrative: string; detail: Record<string, unknown> } | null {
  if (actionIntent.kind === 'move') {
    const resolution = resolveLocationDestination(message, gameState)
    if (resolution.status === 'resolved' && resolution.canonicalAction) return null
    return {
      code: resolution.status === 'ambiguous' ? 'UNRESOLVED_MOVE_AMBIGUOUS' : 'UNRESOLVED_MOVE_TARGET',
      narrative: buildUnresolvedMoveNarrative(message, gameState, resolution),
      detail: summarizeLocationResolution(resolution),
    }
  }

  if (isCanonicalWorldActionKind(actionIntent.kind) || actionIntent.kind === 'interact') {
    const surface = buildSceneSurface(gameState)
    const targets = surface.targets
      .filter(target => target.kinds.includes(actionIntent.kind as CanonicalPlayerActionKind))
      .map(target => target.name)
      .slice(0, 5)
    return {
      code: 'UNRESOLVED_ACTION_TARGET',
      narrative: targets.length > 0
        ? `Je vois l'action, mais pas la cible exacte. Ici, les cibles possibles sont: ${targets.join(', ')}.`
        : "Je vois l'action, mais aucune cible claire ne correspond ici. Reformule avec un objet, une personne ou une issue concrete.",
      detail: {
        status: 'not_found',
        actionKind: actionIntent.kind,
        candidates: targets,
      },
    }
  }

  return null
}

function contextualRoomIdFromRecentDm(
  message: string,
  gameState: GameState,
  recentHistory: ConversationTurn[]
): string | null {
  const text = normalizeFrenchText(message)
  if (referencesLocalObjectInsteadOfRoom(text) && !isDoorTraversalIntent(text)) return null

  const anaphoricAction = /\b(investig\w*|inspect\w*|examin\w*|fouill\w*|regard\w*|ouvr\w*|entr\w*|avanc\w*|j[' ]?y vais|vas y)\b/.test(text)
  if (!anaphoricAction) return null

  const lastDmTurn = [...recentHistory].reverse().find(turn => turn.role === 'dm')
  if (!lastDmTurn) return null

  const context = normalizeFrenchText(lastDmTurn.content)
  const contextRoomId = findAdventureRoomIdByContextAlias(context, gameState.currentRoomId)
  if (contextRoomId) return contextRoomId

  if (gameState.currentRoomId === '4' && /\b(porte des reserves?|reserves?|fours?)\b/.test(context)) {
    return '8'
  }

  return null
}

function parseNamedRoomMove(message: string, gameState: GameState): { x: number; y: number } | null {
  const text = normalizeFrenchText(message)
  if (referencesLocalObjectInsteadOfRoom(text) && !isDoorTraversalIntent(text)) return null

  if (!hasNamedRouteMovementVerb(text)) return null

  const relativeRoomId = relativeRoomIdForExplorationMove(text, gameState)
  const sensoryRoomId = contextualSensoryRoomIdForExplorationMove(text, gameState)
  const uniqueVagueRoomId = uniqueVagueExplorationRoomId(text, gameState)
  const recentPortalRoomId = recentPortalFollowupRoomId(text, gameState)
  const destinationResolution = resolveLocationDestination(message, gameState)
  const hasLocationResolution = destinationResolution.status !== 'not_found'
  if (!relativeRoomId && !sensoryRoomId && !uniqueVagueRoomId && !recentPortalRoomId && !hasDestinationCue(text) && !hasLocationResolution) {
    return null
  }

  const namedLocationCell = findNamedAdventureLocationCell(text)
  if (namedLocationCell) {
    const cell = namedLocationCell
    if (cell.x === gameState.player.position.x && cell.y === gameState.player.position.y) return null
    return cell
  }

  const destinationRoomId = destinationResolution.status === 'resolved'
    ? destinationResolution.target?.roomId ?? null
    : null
  const targetRoomId = destinationRoomId ?? sensoryRoomId ?? uniqueVagueRoomId ?? recentPortalRoomId ?? relativeRoomId ?? findAdventureRoomIdByAlias(text)
  if (!targetRoomId || targetRoomId === gameState.currentRoomId) return null

  return centerCellForRoom(targetRoomId)
}

function parseContextualRoomMove(
  message: string,
  gameState: GameState,
  recentHistory: ConversationTurn[]
): { x: number; y: number } | null {
  const targetRoomId = contextualRoomIdFromRecentDm(message, gameState, recentHistory)
  return targetRoomId ? centerCellForRoom(targetRoomId) : null
}

function recentPortalFollowupRoomId(text: string, gameState: GameState): string | null {
  if (!gameState.currentRoomId || !gameState.world) return null
  const asksToFinishPortalMove =
    /\b(?:tu ne m[' ]?as pas deplace|tu m[' ]?as pas deplace|pas deplace|pas bouge|j[' ]?entre|je rentre|je franchis|je passe|j[' ]?y vais|vas y|go|dedans|interieur)\b/.test(text)
  if (!asksToFinishPortalMove) return null

  const recentPortalEvent = [...gameState.world.eventLog].reverse().find(event =>
    ['door.opened', 'object.opened', 'object.used'].includes(event.type) &&
    typeof event.targetId === 'string' &&
    Boolean(gameState.world?.objects[event.targetId]?.portal?.roomIds.includes(gameState.currentRoomId ?? ''))
  )
  if (!recentPortalEvent?.targetId) return null

  const portal = gameState.world.objects[recentPortalEvent.targetId]
  return portal.portal?.roomIds.find(roomId => roomId !== gameState.currentRoomId) ?? null
}

function cellFromToolInput(value: unknown): { x: number; y: number } | null {
  if (!isObjectRecord(value)) return null
  const { x, y } = value
  if (!Number.isInteger(x) || !Number.isInteger(y)) return null
  return { x: Number(x), y: Number(y) }
}

function validateStartEncounterToolInput(
  input: unknown,
  gameState: GameState,
  playerMessage: string
): Record<string, unknown> | null {
  if (!isObjectRecord(input)) {
    return {
      error: 'Invalid start_encounter input.',
      code: 'INVALID_TOOL_INPUT',
    }
  }

  const encounterId = typeof input.encounterId === 'string' ? input.encounterId : null
  if (!encounterId) {
    return {
      error: 'LLM-triggered encounters must use a predefined encounterId.',
      code: 'CUSTOM_ENCOUNTER_FORBIDDEN',
    }
  }

  const preset = ENCOUNTERS[encounterId]
  if (!preset) {
    return {
      error: `Unknown encounterId: ${encounterId}.`,
      code: 'UNKNOWN_ENCOUNTER',
      detail: { encounterId },
    }
  }

  const playerCell = cellFromToolInput(input.playerCell)
  const playerCellRoomId = playerCell ? inferMappedAdventureRoomId(playerCell) : null
  const allowedRoomId = playerCellRoomId ?? gameState.currentRoomId

  if (allowedRoomId && preset.roomId !== allowedRoomId) {
    return {
      error: `Encounter ${encounterId} belongs to room ${preset.roomId}, not current target room ${allowedRoomId}.`,
      code: 'ENCOUNTER_ROOM_MISMATCH',
      detail: {
        encounterId,
        encounterRoomId: preset.roomId,
        currentRoomId: gameState.currentRoomId,
        playerCell,
        playerCellRoomId,
      },
    }
  }

  const triggerReason = roomEncounterTriggerReason(playerMessage, gameState, preset.roomId, encounterId)
  if (!triggerReason) {
    return {
      error: `Encounter ${encounterId} is not triggered by the current player action.`,
      code: 'ENCOUNTER_TRIGGER_NOT_MET',
      detail: {
        encounterId,
        encounterRoomId: preset.roomId,
        currentRoomId: gameState.currentRoomId,
        playerCell,
        playerCellRoomId,
      },
    }
  }

  return null
}

function parseTargetHint(message: string): PlayerAttackTargetHint | null {
  const text = normalizeFrenchText(message)
  if (/\b(droite|a droite|sur ma droite)\b/.test(text)) return 'right'
  if (/\b(gauche|a gauche|sur ma gauche)\b/.test(text)) return 'left'
  if (/\b(devant|face|en face)\b/.test(text)) return 'front'
  if (/\b(derriere|arriere|dans mon dos)\b/.test(text)) return 'back'
  if (/\b(blesse|blessure|affaibli|agonie|chancelant)\b/.test(text)) return 'wounded'
  if (/\b(proche|plus proche|nearest|au contact)\b/.test(text)) return 'nearest'
  return null
}

function lastMonsterThatAttackedPlayer(gameState: GameState): string | null {
  const aliveIds = new Set(aliveMonsters(gameState).map(monster => monster.id))

  for (const entry of [...gameState.combatLog].reverse()) {
    if (!aliveIds.has(entry.turn)) continue
    if (!/\battaque\b/i.test(entry.action)) continue
    if (/heros|héros|player|joueur/i.test(entry.action)) return entry.turn
  }

  return null
}

const PLAYER_ACTION_KINDS = new Set<CanonicalPlayerActionKind>([
  'attack',
  'move',
  'interact',
  'examine',
  'read',
  'search',
  'open',
  'take',
  'unlock',
  'force',
  'disarm',
  'talk',
  'ask',
  'persuade',
  'threaten',
  'show_item',
  'give_item',
  'hide',
  'help',
  'flee',
  'stabilize',
  'use_object',
  'combine_recipe',
  'improvise',
  'ability_check',
  'social',
  'use_item',
  'wait',
  'death_save',
  'observe',
])

function playerActionKindFromToolUse(toolName: string, input: unknown): CanonicalPlayerActionKind | null {
  if (toolName === 'resolve_player_action') {
    if (!isObjectRecord(input) || !isObjectRecord(input.action)) return null
    const kind = input.action.kind
    return typeof kind === 'string' && PLAYER_ACTION_KINDS.has(kind as CanonicalPlayerActionKind)
      ? kind as CanonicalPlayerActionKind
      : null
  }

  if (toolName === 'resolve_player_attack') return 'attack'
  if (toolName === 'use_healing_potion') return 'use_item'
  if (toolName === 'roll_death_save') return 'death_save'
  if (toolName === 'pass_turn') return 'wait'
  if (toolName === 'roll_ability_check') return 'ability_check'
  if (toolName === 'trigger_room_event') return 'interact'
  if (toolName === 'move_token') {
    if (!isObjectRecord(input)) return 'move'
    const tokenId = typeof input.tokenId === 'string' ? input.tokenId : 'player'
    return tokenId === 'player' ? 'move' : null
  }

  return null
}

interface IntentInterpreterTurnResult {
  used: boolean
  model: string | null
  inputSummary: IntentInterpreterInputSummary | null
  output: IntentInterpreterOutput | null
  fallbackReason: string | null
}

function numericConfidenceToActionConfidence(value: number): GameActionConfidence {
  if (value >= 0.8) return 'high'
  if (value >= 0.55) return 'medium'
  return 'low'
}

function primitiveForInterpretedKind(kind: CanonicalPlayerActionKind): GameActionPrimitive {
  if (kind === 'attack') return 'resolve_attack'
  if (kind === 'move') return 'move'
  if (kind === 'use_item') return 'use_item'
  if (kind === 'ability_check' || kind === 'social' || kind === 'death_save') return 'check'
  if (kind === 'wait') return 'wait'
  if (kind === 'observe') return 'narrate'
  return 'world_action'
}

function suggestedToolsForInterpretedKind(kind: CanonicalPlayerActionKind): string[] {
  if (kind === 'attack') return ['resolve_player_action', 'resolve_player_attack']
  if (kind === 'move') return ['resolve_player_action', 'move_token']
  if (kind === 'ability_check' || kind === 'social') return ['resolve_player_action', 'roll_ability_check']
  if (kind === 'death_save') return ['resolve_player_action', 'roll_death_save']
  if (kind === 'use_item') return ['resolve_player_action', 'use_healing_potion']
  if (kind === 'wait') return ['resolve_player_action', 'pass_turn']
  if (kind === 'observe') return []
  return ['resolve_player_action']
}

function normalizeInterpreterCanonicalAction(action: Record<string, unknown>): Record<string, unknown> | null {
  const rawKind = typeof action.kind === 'string' ? action.kind : null
  if (!rawKind) return null

  if (rawKind === 'traverse') {
    const viaObjectId = typeof action.viaObjectId === 'string'
      ? action.viaObjectId
      : typeof action.targetId === 'string'
        ? action.targetId
        : undefined
    const viaObjectName = typeof action.viaObjectName === 'string'
      ? action.viaObjectName
      : typeof action.targetName === 'string'
        ? action.targetName
        : undefined
    if (viaObjectId || viaObjectName) {
      return {
        kind: 'open',
        traverse: true,
        ...(viaObjectId ? { targetId: viaObjectId } : {}),
        ...(viaObjectName ? { targetName: viaObjectName } : {}),
      }
    }

    const targetRoomId = typeof action.targetRoomId === 'string'
      ? action.targetRoomId
      : typeof action.toRoomId === 'string'
        ? action.toRoomId
        : typeof action.roomId === 'string'
          ? action.roomId
          : null
    const toCell = targetRoomId ? centerCellForRoom(targetRoomId) : null
    return toCell ? { kind: 'move', tokenId: 'player', toCell } : null
  }

  if (rawKind === 'move' && !isObjectRecord(action.toCell)) {
    const targetRoomId = typeof action.targetRoomId === 'string'
      ? action.targetRoomId
      : typeof action.toRoomId === 'string'
        ? action.toRoomId
        : typeof action.roomId === 'string'
          ? action.roomId
          : null
    const toCell = targetRoomId ? centerCellForRoom(targetRoomId) : null
    if (toCell) return { ...action, tokenId: typeof action.tokenId === 'string' ? action.tokenId : 'player', toCell }
  }

  return action
}

function interpreterCanonicalAction(output: IntentInterpreterOutput | null | undefined): Record<string, unknown> | null {
  if (!output || output.requiresClarification || !isObjectRecord(output.canonicalAction)) return null
  const normalizedAction = normalizeInterpreterCanonicalAction(output.canonicalAction)
  if (!normalizedAction) return null
  const kind = normalizedAction.kind
  if (typeof kind !== 'string') return null
  if (!PLAYER_ACTION_KINDS.has(kind as CanonicalPlayerActionKind)) return null
  return normalizedAction
}

function interpretedActionTargetsPortal(action: Record<string, unknown>, gameState: GameState): boolean {
  const kind = typeof action.kind === 'string' ? action.kind : null
  if (!kind || !['open', 'unlock', 'force', 'use_object'].includes(kind)) return false
  if (action.traverse === true) return true

  const targetId = typeof action.targetId === 'string' ? action.targetId : null
  const targetName = typeof action.targetName === 'string' ? normalizeFrenchText(action.targetName) : null
  if (!targetId && !targetName) return false

  return buildSceneSurface(gameState).objects.some(object => {
    if (!object.portal?.otherRoomIds.length) return false
    if (targetId && object.id === targetId) return true
    if (!targetName) return false
    const haystack = [object.name, ...object.aliases, ...object.tags].map(normalizeFrenchText).join(' ')
    return haystack.includes(targetName) || targetName.includes(normalizeFrenchText(object.name))
  })
}

function shouldExecuteInterpreterActionDirectly(action: Record<string, unknown>, gameState: GameState): boolean {
  const kind = action.kind
  if (typeof kind !== 'string') return false
  if (kind === 'social' || kind === 'ability_check') return false
  if (kind === 'search') return false
  if (interpretedActionTargetsPortal(action, gameState)) return false
  if (kind === 'move') return isObjectRecord(action.toCell)
  if (kind === 'attack') return gameState.phase === 'combat' && gameState.currentTurn === 'player'
  return PLAYER_ACTION_KINDS.has(kind as CanonicalPlayerActionKind)
}

function intentInterpreterFastPathReason(
  message: string,
  gameState: GameState,
  preliminaryIntent: GameActionIntent
): string | null {
  if (!INTENT_INTERPRETER_ENABLED) return 'disabled'
  if (preliminaryIntent.reason === 'debug-state-question') return 'debug-state-question'
  if (preliminaryIntent.reason === 'state-reconcile-location') return 'state-reconcile-location'
  if (preliminaryIntent.reason === 'player-death-save-intent') return 'player-death-save-intent'
  if (preliminaryIntent.reason === 'healing-potion-intent') return 'healing-potion-intent'
  if (preliminaryIntent.reason === 'player-pass-turn-intent') return 'player-pass-turn-intent'

  const text = normalizeFrenchText(message)
  const coordinateMoveIntent =
    preliminaryIntent.kind === 'move' &&
    /\(?\s*\d{1,2}\s*[,;]\s*\d{1,2}\s*\)?/.test(text) &&
    /\b(va|vais|aller|deplaces?|deplacer|avances?|avancer|bouges?|bouger|marche|case|coordonnees?)\b/.test(text)
  if (coordinateMoveIntent) return 'coordinate-move'

  if (gameState.phase === 'combat' && gameState.currentTurn && gameState.currentTurn !== 'player') {
    return 'non-player-combat-turn'
  }

  return null
}

function intentFromInterpreterOutput(
  message: string,
  output: IntentInterpreterOutput | null | undefined
): GameActionIntent | null {
  if (!output) return null
  const normalizedText = normalizeFrenchText(message)

  if (output.requiresClarification) {
    return {
      kind: 'unknown',
      primitive: 'narrate',
      reason: 'intent-interpreter-clarification',
      requiresEngine: false,
      suggestedTools: [],
      confidence: numericConfidenceToActionConfidence(output.confidence),
      normalizedText,
    }
  }

  if (output.intentKind === 'guidance') {
    return {
      kind: 'guidance',
      primitive: 'narrate',
      reason: 'intent-interpreter-guidance',
      requiresEngine: false,
      suggestedTools: [],
      confidence: numericConfidenceToActionConfidence(output.confidence),
      normalizedText,
    }
  }

  if (output.intentKind === 'query_state') {
    return {
      kind: 'query_state',
      primitive: 'query_state',
      reason: 'intent-interpreter-query-state',
      requiresEngine: false,
      suggestedTools: [],
      confidence: numericConfidenceToActionConfidence(output.confidence),
      normalizedText,
    }
  }

  if (['question', 'query', 'status_question', 'meta_question'].includes(output.intentKind)) {
    return {
      kind: 'observe',
      primitive: 'narrate',
      reason: `intent-interpreter-${output.intentKind}`,
      requiresEngine: false,
      suggestedTools: [],
      confidence: numericConfidenceToActionConfidence(output.confidence),
      normalizedText,
    }
  }

  const canonicalAction = interpreterCanonicalAction(output)
  const actionKind = canonicalAction?.kind
  if (typeof actionKind !== 'string') return null
  const kind = actionKind as CanonicalPlayerActionKind
  const primitive = primitiveForInterpretedKind(kind)
  const requiresEngine = primitive !== 'narrate'
  return {
    kind,
    primitive,
    reason: `intent-interpreter-${output.intentKind || kind}`,
    requiresEngine,
    suggestedTools: suggestedToolsForInterpretedKind(kind),
    confidence: numericConfidenceToActionConfidence(output.confidence),
    normalizedText,
  }
}

function unresolvedIntentFromInterpreter(message: string, output: IntentInterpreterOutput | null | undefined): GameActionIntent {
  return {
    kind: 'unknown',
    primitive: 'narrate',
    reason: output?.intentKind
      ? `intent-interpreter-unresolved-${output.intentKind}`
      : 'intent-interpreter-unresolved',
    requiresEngine: false,
    suggestedTools: [],
    confidence: output ? numericConfidenceToActionConfidence(output.confidence) : 'low',
    normalizedText: normalizeFrenchText(message),
  }
}

function parseJsonObjectFromLlmText(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')
    if (start >= 0 && end > start) {
      return JSON.parse(text.slice(start, end + 1))
    }
    throw new Error('Intent interpreter response did not contain a JSON object.')
  }
}

function textFromLlmMessage(message: Anthropic.Message): string {
  return message.content
    .map(block => block.type === 'text' && 'text' in block ? block.text : '')
    .filter(Boolean)
    .join('\n')
    .trim()
}

function buildIntentInterpreterPrompt(summary: IntentInterpreterInputSummary): string {
  return [
    'Retourne uniquement un objet JSON valide conforme au schema demande. Pas de prose.',
    'Tu interpretes une intention joueur pour un moteur de JDR. Tu proposes, tu ne mutes rien.',
    'Si une action creative plausible sort des actions prevues, prefere canonicalAction.kind="improvise" avec un type improvisation.',
    'Si une seule affordance, sortie, PNJ ou cible contextuelle correspond clairement, choisis-la au lieu de clarifier.',
    'Si le joueur veut franchir une porte, un seuil, un escalier ou une sortie, propose une action canonique supportee: open/force/use_object avec traverse=true, ou move avec targetRoomId.',
    'Si la cible est vraiment ambigue entre plusieurs options plausibles, requiresClarification=true et pose une question courte.',
    'Ne transforme pas une question en attaque ou en rencontre.',
    'Schema attendu: intentKind, confidence, requiresClarification, clarificationQuestion, canonicalAction, improvisation, targetHints, reasoningSummary.',
    'targetHints est un OBJET (jamais un tableau) avec des champs optionnels: targetName, targetId, targetType, targetHint, candidates (candidates est un tableau de chaines). S il y a plusieurs cibles possibles, mets-les dans targetHints.candidates.',
    'reasoningSummary est une seule phrase de 240 caracteres maximum.',
    'Si tu remplis improvisation, improvisation.type DOIT etre exactement l une de ces valeurs: create_fiction_fact, use_fiction_fact, social_transgression, environmental_change, improvised_tool_object, distraction_noise, non_mechanical_flavor. N invente aucune autre valeur. Dans le doute, utilise create_fiction_fact.',
    `Resume moteur:\n${JSON.stringify(summary, null, 2)}`,
  ].join('\n\n')
}

async function interpretIntentForTurn(params: {
  message: string
  gameState: GameState
  recentHistory: ConversationTurn[]
  preliminaryIntent: GameActionIntent
  usageLog: AnthropicUsageLogEntry[]
  requestId: string
  sessionId: string | undefined
  inputMode: string
  clientRequestId: string | undefined
}): Promise<IntentInterpreterTurnResult> {
  const {
    message,
    gameState,
    recentHistory,
    preliminaryIntent,
    usageLog,
    requestId,
    sessionId,
    inputMode,
    clientRequestId,
  } = params
  const inputSummary = buildIntentInterpreterInputSummary({ message, gameState, recentHistory })
  const fastPathReason = intentInterpreterFastPathReason(message, gameState, preliminaryIntent)
  if (fastPathReason) {
    return {
      used: false,
      model: null,
      inputSummary,
      output: null,
      fallbackReason: `fast-path:${fastPathReason}`,
    }
  }

  if (LLM_MODE === 'mock' || !ALLOW_PAID_LLM) {
    return {
      used: true,
      model: 'mock-intent-interpreter',
      inputSummary,
      output: interpretPlayerIntentMock({ message, gameState, recentHistory }),
      fallbackReason: LLM_MODE === 'mock' ? 'mock-mode' : 'paid-llm-disabled',
    }
  }

  try {
    const response = await createLlmMessage({
      model: INTENT_INTERPRETER_MODEL,
      max_tokens: 650,
      system: [
        'Tu es un Intent Interpreter strict pour un moteur de JDR.',
        'Tu comprends le francais naturel, les typos, les anaphores simples et les actions absurdes.',
        'Tu ne juges pas la legalite finale: tu proposes un plan JSON court; le moteur valide ensuite.',
        'Pas de chaine de pensee. reasoningSummary doit etre bref et non technique.',
      ].join(' '),
      messages: [{ role: 'user', content: buildIntentInterpreterPrompt(inputSummary) }],
    }, {
      requestId,
      sessionId,
      operation: 'dm.intent_interpreter',
      requestCallCount: usageLog.length + 1,
      gameState,
      playerMessage: message,
    })

    usageLog.push(logAnthropicUsage({
      requestId,
      sessionId,
      inputMode,
      clientRequestId,
      operation: 'dm.intent_interpreter',
      model: INTENT_INTERPRETER_MODEL,
      usage: response.usage,
      stopReason: response.stop_reason,
      metadata: {
        preliminaryIntent: {
          kind: preliminaryIntent.kind,
          reason: preliminaryIntent.reason,
          confidence: preliminaryIntent.confidence,
        },
      },
    }))

    const parsed = parseJsonObjectFromLlmText(textFromLlmMessage(response))
    return {
      used: true,
      model: INTENT_INTERPRETER_MODEL,
      inputSummary,
      output: validateIntentInterpreterOutput(parsed, 'llm'),
      fallbackReason: null,
    }
  } catch (err) {
    const fallbackOutput = interpretPlayerIntentMock({ message, gameState, recentHistory })
    logEvent('warn', 'dm.intent_interpreter.fallback_to_mock', {
      requestId,
      sessionId,
      err,
      preliminaryIntent,
      fallbackOutput,
    })
    return {
      used: true,
      model: 'mock-intent-interpreter',
      inputSummary,
      output: {
        ...fallbackOutput,
        source: 'fallback',
      },
      fallbackReason: err instanceof Error ? err.message : 'intent-interpreter-error',
    }
  }
}

function validateToolUseAgainstAffordances(
  toolName: string,
  input: unknown,
  gameState: GameState
): Record<string, unknown> | null {
  const actionKind = playerActionKindFromToolUse(toolName, input)
  if (!actionKind) return null

  const affordances = derivePlayerAffordances(gameState)
  if (affordances.some(action => action.kind === actionKind && action.enabled)) return null

  return {
    error: `Player action '${actionKind}' is not currently afforded by the world state.`,
    code: 'ACTION_NOT_AFFORDED',
    detail: {
      actionKind,
      toolName,
      player: {
        hp: gameState.player.hp,
        conditions: gameState.player.conditions,
        deathSaves: gameState.player.deathSaves,
      },
      phase: gameState.phase,
      currentTurn: gameState.currentTurn,
      affordances: affordances.map(action => ({
        kind: action.kind,
        enabled: action.enabled,
        reason: action.reason,
        toolName: action.toolName,
      })),
    },
  }
}

function lastPlayerAttackTarget(gameState: GameState): string | null {
  const alive = aliveMonsters(gameState)

  for (const entry of [...gameState.combatLog].reverse()) {
    if (entry.turn !== 'player') continue

    const action = normalizeFrenchText(entry.action)
    const targetText = action.match(/\battaque\s+(.+?)\s+avec\b/)?.[1]?.trim()
    if (!targetText) continue

    const target = alive.find(monster => {
      const normalizedId = normalizeFrenchText(monster.id)
      const normalizedName = normalizeFrenchText(monster.name)
      const aliases = specificMonsterAliases(monster, gameState)

      return targetText === normalizedId ||
        normalizedName.includes(targetText) ||
        targetText.includes(normalizedName) ||
        aliases.some(alias => targetText.includes(alias) || alias.includes(targetText))
    })

    if (target) return target.id
  }

  return null
}

function parseWeaponOrSpell(message: string): string {
  const text = normalizeFrenchText(message)
  if (/\b(hache|hachette)\b/.test(text)) return 'handaxe'
  if (/\b(epee|lame|longsword)\b/.test(text)) return 'longsword'
  return 'longsword'
}

function parseNamedAttackTarget(message: string, gameState: GameState): string | null {
  const text = normalizeFrenchText(message)
  if (/\bgrukk\b/.test(text)) return 'Grukk'
  if (/\bchef\b/.test(text) && Object.values(gameState.monsters).some(monster => normalizeFrenchText(monster.name).includes('chef'))) return 'chef'
  if (/\bhobgobelins?\b/.test(text)) return 'hobgobelin'
  if (/\bchampignons?\b/.test(text)) return 'champignon'
  return null
}

function parsePlayerAttackInput(
  message: string,
  gameState: GameState
): Record<string, unknown> | null {
  if (gameState.phase !== 'combat' || gameState.currentTurn !== 'player') return null
  const requiredAction = detectRequiredMechanicalAction(message, gameState)
  if (requiredAction?.reason !== 'player-combat-attack-intent') return null

  const monsters = aliveMonsters(gameState)
  if (monsters.length === 0) return null

  const text = normalizeFrenchText(message)
  const anaphoricAttack = isAnaphoricCombatAttackText(text)
  const targetId = /\b(dernier|precedent|m[' ]?a attaque|vient de m[' ]?attaquer)\b/.test(text)
    ? lastMonsterThatAttackedPlayer(gameState)
    : anaphoricAttack
      ? lastPlayerAttackTarget(gameState) ?? lastMonsterThatAttackedPlayer(gameState)
      : monsters.length === 1
        ? monsters[0].id
        : null

  const targetHint = parseTargetHint(message) ?? (targetId ? null : 'nearest')
  const targetName = targetId ? null : parseNamedAttackTarget(message, gameState)
  const input: Record<string, unknown> = {
    weaponOrSpell: parseWeaponOrSpell(message),
  }

  if (targetId) input.targetId = targetId
  else if (targetName) input.targetName = targetName
  else if (targetHint) input.targetHint = targetHint

  if (/\b(avantage|advantage)\b/.test(text)) input.advantage = true
  if (/\b(desavantage|désavantage|disadvantage)\b/.test(text)) input.disadvantage = true

  return input
}

function detectAbilityCheckAcceptance(message: string): boolean {
  const text = normalizeFrenchText(message)
  return /\b(je le tente|je tente|je tente le coup|tente|tentons|ok|oui|d'accord|d accord|vas-y|vas y|je le fais|je lance|lance|allons-y|allons y)\b/.test(text)
}

function pendingAbilityCheckFromRecentDm(recentHistory: ConversationTurn[]): PendingAbilityCheck | null {
  const lastDm = [...recentHistory].reverse().find(turn => turn.role === 'dm')?.content
  if (!lastDm) return null

  const text = normalizeFrenchText(lastDm)
  const asksForCheck = /\b(test|jet)\b/.test(text) && /\b(tentes-tu|tentes tu|tu tentes|tenter|tente)\b/.test(text)
  if (!asksForCheck) return null

  const dcMatch = text.match(/\b(?:dd|dc)\s*(\d{1,2})\b/)
  const dc = dcMatch ? Number(dcMatch[1]) : undefined
  const hasIntimidation = /\b(intimidation|intimider|menacer|menace)\b/.test(text)
  const hasPersuasion = /\b(persuasion|convain|convaincre|negoci|negocier|rallier|joindre|rejoindre|parlementer)\b/.test(text)
  if (hasIntimidation || hasPersuasion) {
    return {
      ability: 'cha',
      dc,
      label: hasIntimidation ? 'Intimidation' : 'Persuasion',
      proficient: true,
      social: true,
    }
  }

  const hasAthletics = /\b(athletisme|athletics|forcer|enfoncer|defoncer|soulever|pousser|briser)\b/.test(text)
  if (hasAthletics) {
    return { ability: 'str', dc, label: 'Athletisme', proficient: true }
  }

  const hasPerception = /\b(perception|observer|inspecter|chercher|fouiller|trouver|ecouter)\b/.test(text)
  if (hasPerception) {
    return { ability: 'wis', dc, label: 'Perception', proficient: true }
  }

  const hasStealth = /\b(discretion|stealth|furtivite|furtif|se cacher|cachette)\b/.test(text)
  if (hasStealth) {
    return { ability: 'dex', dc, label: 'Discretion', proficient: true }
  }

  return null
}

function directSocialAbilityCheckFromMessage(message: string, gameState: GameState): PendingAbilityCheck | null {
  if (gameState.phase !== 'combat' || gameState.currentTurn !== 'player' || countAliveMonsters(gameState) === 0) return null

  const text = normalizeFrenchText(message)
  const socialCombatIntent = /\b(soumet|soumission|rends toi|rendez vous|rendez-vous|reddition|je suis ton chef|votre chef|baissez les armes|baisse ton arme|rejoignez|rejoins moi|rejoins-moi|rallie|ralliez|parlemente|parlementer|negocie|negocier|convain|convaincre|intimide|intimider|menace|menacer|capitule|capitulez|arretez?|arrete|stop|paix|treve|cessez?|cesse|calmez|calme|on fait la paix|faire la paix|je me rends|me rends|pitie)\b/.test(text)
  if (!socialCombatIntent) return null

  const intimidation = /\b(soumet|rends toi|rendez vous|rendez-vous|je suis ton chef|votre chef|baissez les armes|baisse ton arme|intimide|intimider|menace|menacer|capitule|capitulez|mort|tuer|tue)\b/.test(text)
  return {
    ability: 'cha',
    dc: 14,
    label: intimidation ? 'Intimidation' : 'Persuasion',
    proficient: true,
    social: true,
  }
}

function parseEncounterRepairInput(
  message: string,
  gameState: GameState
): Record<string, unknown> | null {
  if (gameState.phase !== 'exploration' || countAliveMonsters(gameState) > 0) return null

  const encounterId = encounterIdForRoom(gameState.currentRoomId)
  if (!encounterId) return null

  const text = normalizeFrenchText(message)
  const asksForMissingEncounter = /\b(tokens?|gobelins?|monstres?|ennemis?|combat|initiative|affich|afficher|apparaitre|spawn|carte|contradiction|desynchro|bug)\b/.test(text)
  if (!asksForMissingEncounter) return null

  const triggerReason = roomEncounterTriggerReason(message, gameState, gameState.currentRoomId, encounterId)
  if (!triggerReason) return null

  return {
    encounterId,
    playerCell: gameState.player.position,
    reason: triggerReason,
  }
}

function summarizeMcpResultForNarration(toolName: string, result: unknown): string {
  if (isObjectRecord(result)) {
    if (typeof result.mechanicalSummary === 'string') return result.mechanicalSummary
    if (isObjectRecord(result.result) && typeof result.result.mechanicalSummary === 'string') return result.result.mechanicalSummary
    if (typeof result.error === 'string') return "L'action est refusee par une regle moteur; aucun fait de monde n'est invente."
    if (typeof result.reason === 'string') return result.reason
  }

  if (toolName === 'move_token') return "Tu avances, et la scene change autour de toi."
  return "L'action se resout dans la scene."
}

function extractWorldTargetName(message: string): string | undefined {
  const text = normalizeFrenchText(message)

  const targetPatterns: Array<[string, RegExp]> = [
    ['Mac', /\bmac|pommier|treant\b/],
    ['Grukk', /\bgrukk|chef\b/],
    ['druidesse du verger', /\bdryade|druidesse|fee|fees|fées|verger\b/],
    ['tiroir', /\btiroirs?\b/],
    ['armoire', /\barmoires?|placards?\b/],
    ['coffre', /\bcoffres?\b/],
    ['four enchante', /\bfours?|fournee|runes?\b/],
    ['champignons violets', /\bchampignons?|amas|violets?\b/],
    ['porte de la reserve', /\bporte\b.{0,30}\breserve|reserve\b.{0,30}\bporte\b/],
    ['double porte', /\bdouble porte|porte d entree|porte de l entree|entree\b/],
    ['recette', /\brecette|fragment|moitie|parchemin|papier|indice\b/],
  ]

  return targetPatterns.find(([, pattern]) => pattern.test(text))?.[0]
}

function extractExpandedWorldTargetName(message: string): string | undefined {
  const text = normalizeFrenchText(message)
  const targetPatterns: Array<[string, RegExp]> = [
    ['Mac', /\bmac|pommier|treant|arbre\b/],
    ['Grukk', /\bgrukk|chef|hobgobelin\b/],
    ['druidesse du verger', /\bdryade|druidesse|fee|fees|femme du verger\b/],
    ['bureau', /\bbureau|paperasse|registres?\b/],
    ['registre', /\bregistre|livre de comptes|commandes\b/],
    ['tiroir', /\btiroirs?\b/],
    ['armoire', /\barmoires?|placards?\b/],
    ['coffre', /\bcoffres?\b/],
    ['caisses', /\bcaisses?|marchandises\b/],
    ['sacs de farine', /\bsacs?|farine|tas de farine\b/],
    ['cle', /\bcles?|clefs?\b/],
    ['note', /\bnotes?|ordre|bon de livraison|papier de livraison\b/],
    ['four enchante', /\bfours?|fournee|runes?\b/],
    ['couteaux', /\bcouteaux?|ratelier|outils animes?\b/],
    ['champignons violets', /\bchampignons?|amas|violets?\b/],
    ['porte de la reserve', /\bporte\b.{0,30}\breserve|reserve\b.{0,30}\bporte\b/],
    ['double porte', /\bdouble porte|porte d entree|porte de l entree|entree\b/],
    ['recette', /\brecette|fragment|moitie|parchemin|papier|indice\b/],
  ]
  return targetPatterns.find(([, pattern]) => pattern.test(text))?.[0] ?? extractWorldTargetName(message)
}

function extractWorldNpcTargetName(message: string): string | undefined {
  const text = normalizeFrenchText(message)
  const npcPatterns: Array<[string, RegExp]> = [
    ['Mac', /\bmac|pommier|treant|arbre\b/],
    ['Grukk', /\bgrukk|chef|hobgobelin\b/],
    ['druidesse du verger', /\bdryade|druidesse|fee|fees|femme du verger\b/],
  ]
  return npcPatterns.find(([, pattern]) => pattern.test(text))?.[0]
}

function extractWorldItemName(message: string): string | undefined {
  const text = normalizeFrenchText(message)
  const itemPatterns: Array<[string, RegExp]> = [
    ['recette', /\brecette|fragment|moitie|parchemin\b/],
    ['cle', /\bcles?|clefs?\b/],
    ['note', /\bnotes?|bon|ordre|papier\b/],
    ['potion', /\bpotion\b/],
  ]
  return itemPatterns.find(([, pattern]) => pattern.test(text))?.[0]
}

function uniqueOrUndefined<T>(values: T[]): T | undefined {
  const uniqueValues = [...new Set(values)]
  return uniqueValues.length === 1 ? uniqueValues[0] : undefined
}

function hasAnaphoricObjectReference(message: string): boolean {
  const text = normalizeFrenchText(message)
  return /\b(?:l[' ]?(?:ouvre|ouvres|examines?|etudies?|empoches?|attrapes?)|le prends|la prends|le lis|la lis|ouvre[- ]?(?:le|la|ca)|lis[- ]?(?:le|la)|prends ca|ramasse ca|recupere ca|reprends ca|utilise ca|desamorce ca)\b/.test(text)
}

function hasAnaphoricNpcReference(message: string): boolean {
  const text = normalizeFrenchText(message)
  return /\b(?:lui parle|parle[- ]?lui|je lui parle|je lui demande|demande[- ]?lui|je l interroge|interroge[- ]?(?:le|la)|je lui montre|je lui donne|aide[- ]?(?:le|la)|je l aide)\b/.test(text)
}

function isAnaphoricObjectCandidateForKind(
  kind: GameActionKind,
  object: NonNullable<GameState['world']>['objects'][string],
  gameState: GameState
): boolean {
  const visibleHere = object.roomId === gameState.currentRoomId && (object.visible || object.discovered)
  const inventoryIds = new Set(gameState.player.inventory.map(item => item.id))
  const readable = Boolean(object.readableText || object.tags?.includes('readable'))
  switch (kind) {
    case 'open':
    case 'unlock':
    case 'force':
      return visibleHere && object.taken !== true && (object.kind === 'door' || object.kind === 'container' || object.opened !== undefined || object.locked !== undefined)
    case 'take':
      return visibleHere && object.taken !== true && ['item', 'clue'].includes(object.kind)
    case 'read':
      return readable && (visibleHere || inventoryIds.has(object.id))
    case 'disarm':
      return visibleHere && object.kind === 'trap' && object.disarmed !== true
    case 'use_object':
      return visibleHere && ['fixture', 'trap'].includes(object.kind)
    case 'examine':
      return visibleHere
    default:
      return false
  }
}

function objectTargetNameFromAffordance(
  affordance: PlayerAffordance,
  gameState: GameState
): string | undefined {
  const prefixes = [
    'world-open-',
    'world-unlock-',
    'world-force-',
    'world-take-',
    'world-read-',
    'world-disarm-',
    'world-use-',
  ]
  const prefix = prefixes.find(candidate => affordance.id.startsWith(candidate))
  if (!prefix) return undefined
  return gameState.world?.objects[affordance.id.slice(prefix.length)]?.name
}

function inferAnaphoricWorldTargetName(
  message: string,
  gameState: GameState,
  kind: GameActionKind
): string | undefined {
  if (!gameState.world || !hasAnaphoricObjectReference(message)) return undefined

  const recentTargetName = gameState.world.eventLog
    .slice(-8)
    .reverse()
    .map(event => typeof event.targetId === 'string' ? gameState.world?.objects[event.targetId] : undefined)
    .find(object => object && isAnaphoricObjectCandidateForKind(kind, object, gameState))
    ?.name
  if (recentTargetName) return recentTargetName

  const affordedNames = derivePlayerAffordances(gameState)
    .filter(affordance => affordance.kind === kind)
    .map(affordance => objectTargetNameFromAffordance(affordance, gameState))
    .filter((name): name is string => Boolean(name))
  return uniqueOrUndefined(affordedNames)
}

function npcTargetNameFromAffordance(
  affordance: PlayerAffordance,
  gameState: GameState
): string | undefined {
  const prefixes = [
    'world-talk-',
    'world-ask-',
    'world-persuade-',
    'world-threaten-',
    'world-show-item-',
    'world-give-item-',
  ]
  const prefix = prefixes.find(candidate => affordance.id.startsWith(candidate))
  if (!prefix) return undefined
  return gameState.world?.npcs[affordance.id.slice(prefix.length)]?.name
}

function inferAnaphoricNpcTargetName(
  message: string,
  gameState: GameState,
  kind: GameActionKind
): string | undefined {
  if (!gameState.world || !hasAnaphoricNpcReference(message)) return undefined

  const recentTargetName = gameState.world.eventLog
    .slice(-8)
    .reverse()
    .map(event => typeof event.targetId === 'string' ? gameState.world?.npcs[event.targetId] : undefined)
    .find(npc => npc && npc.roomId === gameState.currentRoomId)
    ?.name
  if (recentTargetName) return recentTargetName

  const affordedNames = derivePlayerAffordances(gameState)
    .filter(affordance => affordance.kind === kind)
    .map(affordance => npcTargetNameFromAffordance(affordance, gameState))
    .filter((name): name is string => Boolean(name))
  const uniqueAffordedName = uniqueOrUndefined(affordedNames)
  if (uniqueAffordedName) return uniqueAffordedName

  const knownNpcNames = Object.values(gameState.world.npcs)
    .filter(npc => npc.roomId === gameState.currentRoomId && npc.known)
    .map(npc => npc.name)
  return uniqueOrUndefined(knownNpcNames)
}

function parseWorldActionInput(
  message: string,
  gameState: GameState,
  actionKind?: GameActionKind
): Record<string, unknown> | null {
  const kind = actionKind ?? classifyPlayerAction(message, gameState).kind
  if (!isCanonicalWorldActionKind(kind)) return null
  return buildWorldActionInput(message, gameState, kind)
}

function buildDmTurnDebug(
  message: string,
  gameState: GameState,
  actionIntent: GameActionIntent,
  intentInterpreter?: IntentInterpreterTurnResult
): DMDebugTurnView {
  const isWorldAction = isCanonicalWorldActionKind(actionIntent.kind)
  const actionPlan = buildActionPlan(message, gameState, actionIntent.kind)
  const plannedAction = actionPlan?.steps.find(step => step.action)?.action ?? null
  const interpretedCanonicalAction = interpreterCanonicalAction(intentInterpreter?.output)
  const reconcileRoomId = actionIntent.kind === 'state_reconcile'
    ? resolveLocationReconcileRoomId(message)
    : null
  const reconcileCell = reconcileRoomId ? centerCellForRoom(reconcileRoomId) : null
  const moveLocationResolution = actionIntent.kind === 'move'
    ? resolveLocationDestination(message, gameState)
    : null
  const moveCanonicalAction = moveLocationResolution?.status === 'resolved'
    ? moveLocationResolution.canonicalAction ?? null
    : null
  const sceneSurface = buildSceneSurface(gameState)
  return {
    actionIntent: {
      kind: actionIntent.kind,
      primitive: actionIntent.primitive,
      reason: actionIntent.reason,
      confidence: actionIntent.confidence,
      requiresEngine: actionIntent.requiresEngine,
    },
    parsedAction: interpretedCanonicalAction ?? (isWorldAction
      ? plannedAction ?? buildWorldActionInput(message, gameState, actionIntent.kind)
      : actionIntent.kind === 'state_reconcile' && reconcileCell
        ? { kind: 'move', tokenId: 'player', toCell: reconcileCell }
        : moveCanonicalAction ?? plannedAction),
    targetResolution: actionIntent.kind === 'move' && moveLocationResolution
      ? summarizeLocationResolution(moveLocationResolution)
      : actionPlan?.targetResolution
      ? actionPlan.targetResolution as unknown as Record<string, unknown>
      : interpretedCanonicalAction
        ? {
            status: 'interpreted',
            targetHints: intentInterpreter?.output?.targetHints ?? {},
            reasoningSummary: intentInterpreter?.output?.reasoningSummary,
          }
      : isWorldAction
        ? resolveWorldActionTargets(message, gameState, actionIntent.kind) as unknown as Record<string, unknown>
        : actionIntent.kind === 'state_reconcile'
          ? {
              kind: 'room',
              status: reconcileRoomId ? 'resolved' : 'missing_target',
              roomId: reconcileRoomId,
              roomName: reconcileRoomId ? ADVENTURE_ROOMS.find(room => room.id === reconcileRoomId)?.name ?? null : null,
              toCell: reconcileCell,
            }
          : null,
    actionPlan: actionPlan
      ? summarizeActionPlanForDebug(actionPlan)
      : interpretedCanonicalAction
        ? {
            id: 'intent-interpreter-direct',
            source: 'intent_interpreter',
            reason: intentInterpreter?.output?.reasoningSummary ?? 'Action canonique proposee par Intent Interpreter.',
            steps: [{
              id: 'intent-interpreter-direct-step-1',
              toolName: 'resolve_player_action',
              action: interpretedCanonicalAction,
              reason: 'Execution via facade canonique resolve_player_action.',
            }],
          }
        : null,
    sceneSurface: summarizeSceneSurfaceForDebug(sceneSurface),
    intentInterpreterInputSummary: intentInterpreter?.inputSummary as unknown as Record<string, unknown> ?? null,
    intentInterpreterOutput: intentInterpreter?.output as unknown as Record<string, unknown> ?? null,
    intentInterpreterModel: intentInterpreter?.model ?? null,
    intentInterpreterUsed: intentInterpreter?.used ?? false,
    intentInterpreterFallbackReason: intentInterpreter?.fallbackReason ?? null,
  }
}

function canonicalPlayerActionInput(action: Record<string, unknown>): Record<string, unknown> {
  return { action }
}

function canonicalResultToolEquivalent(result: unknown): string | null {
  return isObjectRecord(result) && typeof result.toolEquivalent === 'string'
    ? result.toolEquivalent
    : null
}

function canonicalResultSucceeded(result: unknown): boolean {
  return isObjectRecord(result) && result.success === true
}

function toolsUsedForResolvedTool(toolName: string, result: unknown): string[] {
  const toolEquivalent = canonicalResultToolEquivalent(result)
  return toolEquivalent && toolEquivalent !== toolName
    ? [toolName, toolEquivalent]
    : [toolName]
}

type EngineFirstResolution = {
  handled: boolean
  gameState: GameState
  toolsUsed: string[]
  draftNarrative: string
  sawMcpToolError: boolean
  mcpErrorResult?: unknown
  actionExecutions: TurnTraceActionExecution[]
  refusalCode?: string | null
  skipFinalNarration?: boolean
  narratorSource?: DMTurnUsage['narrator']
}

function toolActionExecution(
  source: TurnTraceActionExecution['source'],
  toolName: string,
  input: Record<string, unknown> | undefined,
  result: unknown,
  sequence: number,
  executed = true
): TurnTraceActionExecution {
  return actionExecution({
    id: `${source}-${sequence}-${toolName}`,
    source,
    toolName,
    input,
    result,
    executed,
  })
}

function appendAutoToolExecutions(
  executions: TurnTraceActionExecution[],
  toolNames: string[],
  result: Record<string, unknown>
): void {
  for (const toolName of toolNames) {
    executions.push(actionExecution({
      id: `auto-${executions.length + 1}-${toolName}`,
      source: 'auto',
      toolName,
      result,
      executed: true,
      succeeded: true,
    }))
  }
}

function actionPlanStepSucceeded(result: unknown): boolean {
  if (isMcpErrorResult(result)) return false
  if (!isObjectRecord(result)) return false
  if (result.success === false) return false
  if (result.success === true) {
    if (isObjectRecord(result.result) && result.result.success === false) return false
    return true
  }
  if (isObjectRecord(result.result) && result.result.success === false) return false
  if (isObjectRecord(result.result) && result.result.success === true) return true
  return typeof result.mechanicalSummary === 'string'
}

async function executeActionPlan(
  plan: ActionPlan,
  gameState: GameState,
  sessionId: string | undefined,
  requestId: string,
  startedAt: number,
  actionIntent: GameActionIntent
): Promise<EngineFirstResolution> {
  let nextGameState = gameState
  let previousStepSucceeded = true
  let sawMcpToolError = false
  let mcpErrorResult: unknown
  const toolsUsed: string[] = []
  const draftNarratives: string[] = []
  const stepSummaries: Array<Record<string, unknown>> = []
  const actionExecutions: TurnTraceActionExecution[] = []

  logEvent('info', 'dm.cost.engine_first.plan.start', {
    requestId,
    sessionId,
    actionIntent,
    actionPlan: summarizeActionPlanForDebug(plan),
    gameState: summarizeGameState(gameState),
  })

  for (const step of plan.steps) {
    if (step.dependsOnPreviousSuccess && !previousStepSucceeded) {
      stepSummaries.push({
        id: step.id,
        skipped: true,
        reason: 'previous_step_failed',
      })
      logEvent('info', 'dm.cost.engine_first.plan.step.skipped', {
        requestId,
        sessionId,
        step: {
          id: step.id,
          toolName: step.toolName,
          reason: step.reason,
        },
        reason: 'previous_step_failed',
      })
      break
    }

    logEvent('info', 'dm.cost.engine_first.plan.step.start', {
      requestId,
      sessionId,
      step: {
        id: step.id,
        toolName: step.toolName,
        input: step.input,
        reason: step.reason,
      },
    })

    const result = await callMCPTool(step.toolName, step.input, sessionId)
    const stepError = isMcpErrorResult(result)
    const stepSucceeded = actionPlanStepSucceeded(result)
    previousStepSucceeded = stepSucceeded
    sawMcpToolError = sawMcpToolError || stepError
    if (stepError) mcpErrorResult = result
    toolsUsed.push(...toolsUsedForResolvedTool(step.toolName, result))
    actionExecutions.push(toolActionExecution('action_plan', step.toolName, step.input, result, actionExecutions.length + 1))

    const stepNarrative = summarizeMcpResultForNarration(step.toolName, result)
    if (stepNarrative.trim()) draftNarratives.push(stepNarrative)
    nextGameState = await callMCPTool('get_game_state', {}, sessionId) as GameState

    const stepSummary = {
      id: step.id,
      toolName: step.toolName,
      succeeded: stepSucceeded,
      errored: stepError,
      result,
    }
    stepSummaries.push(stepSummary)

    logEvent(stepError ? 'warn' : 'info', 'dm.cost.engine_first.plan.step.complete', {
      requestId,
      sessionId,
      step: {
        id: step.id,
        toolName: step.toolName,
      },
      result,
      stepSucceeded,
      gameState: summarizeGameState(nextGameState),
    })

    if (stepError) break
  }

  const draftNarrative = draftNarratives.join('\n')

  logEvent(sawMcpToolError ? 'warn' : 'info', 'dm.cost.engine_first.plan.complete', {
    requestId,
    sessionId,
    durationMs: Date.now() - startedAt,
    actionIntent,
    actionPlan: summarizeActionPlanForDebug(plan),
    stepSummaries,
    draftNarrative,
    toolsUsed,
    gameState: summarizeGameState(nextGameState),
  })

  return {
    handled: true,
    gameState: nextGameState,
    toolsUsed,
    draftNarrative,
    sawMcpToolError,
    mcpErrorResult,
    actionExecutions,
  }
}

async function resolveServerFirstAction(
  message: string,
  gameState: GameState,
  sessionId: string | undefined,
  requestId: string,
  recentHistory: ConversationTurn[],
  actionIntent: GameActionIntent,
  intentInterpreter?: IntentInterpreterTurnResult
): Promise<EngineFirstResolution> {
  const startedAt = Date.now()
  let toolName: string | null = null
  let input: Record<string, unknown> | null = null

  if (intentInterpreter?.output?.requiresClarification) {
    const draftNarrative = intentInterpreter.output.clarificationQuestion ??
      "Je vois l'intention, mais il me manque une cible claire. Precise qui ou quoi tu vises, et je l'applique proprement."
    const moveClarification = actionIntent.kind === 'move' || /move|movement|deplacement/i.test(intentInterpreter.output.intentKind)
    const refusalCode = moveClarification
      ? /ambigue|plusieurs|plusieurs issues|plusieurs destinations/i.test(`${intentInterpreter.output.clarificationQuestion ?? ''} ${intentInterpreter.output.reasoningSummary}`)
        ? 'UNRESOLVED_MOVE_AMBIGUOUS'
        : 'UNRESOLVED_MOVE_TARGET'
      : 'INTENT_CLARIFICATION_REQUIRED'
    const detail = {
      status: 'clarification_required',
      intentKind: intentInterpreter.output.intentKind,
      targetHints: intentInterpreter.output.targetHints,
      reasoningSummary: intentInterpreter.output.reasoningSummary,
    }
    logEvent('info', 'dm.cost.engine_first.intent_interpreter.clarification_required', {
      requestId,
      sessionId,
      actionIntent,
      intentInterpreter: intentInterpreter.output,
      durationMs: Date.now() - startedAt,
      draftNarrative,
      gameState: summarizeGameState(gameState),
    })
    return {
      handled: true,
      gameState,
      toolsUsed: [],
      draftNarrative,
      sawMcpToolError: false,
      actionExecutions: [
        toolActionExecution('rule', 'unresolved_intent', {
          message,
          actionIntent: {
            kind: actionIntent.kind,
            primitive: actionIntent.primitive,
            reason: actionIntent.reason,
          },
          intentInterpreter: intentInterpreter.output,
        }, {
          success: false,
          code: refusalCode,
          detail,
        }, 1, false),
      ],
      refusalCode,
      skipFinalNarration: true,
      narratorSource: 'rule',
    }
  }

  if (intentInterpreter?.used && actionIntent.reason.startsWith('intent-interpreter-unresolved')) {
    const draftNarrative = buildContextualNoFallbackNarrative(gameState, actionIntent, intentInterpreter)
    const detail = {
      status: 'unresolved_by_intent_interpreter',
      intentKind: intentInterpreter.output?.intentKind ?? null,
      targetHints: intentInterpreter.output?.targetHints ?? {},
      reasoningSummary: intentInterpreter.output?.reasoningSummary ?? null,
    }
    logEvent('info', 'dm.cost.engine_first.intent_interpreter.unresolved', {
      requestId,
      sessionId,
      actionIntent,
      intentInterpreter: intentInterpreter.output,
      durationMs: Date.now() - startedAt,
      draftNarrative,
      gameState: summarizeGameState(gameState),
    })
    return {
      handled: true,
      gameState,
      toolsUsed: [],
      draftNarrative,
      sawMcpToolError: false,
      actionExecutions: [
        toolActionExecution('rule', 'unresolved_intent', {
          message,
          actionIntent: {
            kind: actionIntent.kind,
            primitive: actionIntent.primitive,
            reason: actionIntent.reason,
          },
          intentInterpreter: intentInterpreter.output,
        }, {
          success: false,
          code: 'INTENT_INTERPRETER_UNRESOLVED',
          detail,
        }, 1, false),
      ],
      refusalCode: 'INTENT_INTERPRETER_UNRESOLVED',
      skipFinalNarration: true,
      narratorSource: 'rule',
    }
  }

  if (actionIntent.kind === 'state_reconcile') {
    const targetRoomId = resolveLocationReconcileRoomId(message)

    if (!targetRoomId) {
      const draftNarrative = buildLocationReconcileNeedsTargetNarrative()
      logEvent('info', 'dm.cost.engine_first.location_reconcile.needs_target', {
        requestId,
        sessionId,
        actionIntent,
        durationMs: Date.now() - startedAt,
        draftNarrative,
        gameState: summarizeGameState(gameState),
      })
      return {
        handled: true,
        gameState,
        toolsUsed: [],
        draftNarrative,
        sawMcpToolError: false,
        actionExecutions: [],
      }
    }

    const targetCell = centerCellForRoom(targetRoomId)
    if (!targetCell) {
      const draftNarrative = buildLocationReconcileNeedsTargetNarrative()
      logEvent('warn', 'dm.cost.engine_first.location_reconcile.invalid_target', {
        requestId,
        sessionId,
        actionIntent,
        targetRoomId,
        durationMs: Date.now() - startedAt,
        draftNarrative,
        gameState: summarizeGameState(gameState),
      })
      return {
        handled: true,
        gameState,
        toolsUsed: [],
        draftNarrative,
        sawMcpToolError: false,
        actionExecutions: [],
      }
    }

    const inferredRoomId = inferMappedAdventureRoomId(gameState.player.position)
    if (gameState.currentRoomId === targetRoomId && inferredRoomId === targetRoomId) {
      const draftNarrative = buildLocationReconcileSameRoomNarrative(gameState)
      logEvent('info', 'dm.cost.engine_first.location_reconcile.same_room', {
        requestId,
        sessionId,
        actionIntent,
        targetRoomId,
        inferredRoomId,
        durationMs: Date.now() - startedAt,
        draftNarrative,
        gameState: summarizeGameState(gameState),
      })
      return {
        handled: true,
        gameState,
        toolsUsed: [],
        draftNarrative,
        sawMcpToolError: false,
        actionExecutions: [],
      }
    }

    const reconcileInput = canonicalPlayerActionInput({
      kind: 'move',
      tokenId: 'player',
      toCell: targetCell,
    })
    logEvent('info', 'dm.cost.engine_first.location_reconcile.start', {
      requestId,
      sessionId,
      actionIntent,
      targetRoomId,
      inferredRoomId,
      input: reconcileInput,
      gameState: summarizeGameState(gameState),
    })

    const result = await callMCPTool('resolve_player_action', reconcileInput, sessionId)
    const sawMcpToolError = isMcpErrorResult(result)
    const nextGameState = await callMCPTool('get_game_state', {}, sessionId) as GameState
    const draftNarrative = sawMcpToolError
      ? summarizeMcpResultForNarration('resolve_player_action', result)
      : buildLocationReconcileNarrative(nextGameState, targetRoomId)
    const resolvedToolsUsed = toolsUsedForResolvedTool('resolve_player_action', result)

    logEvent(sawMcpToolError ? 'warn' : 'info', 'dm.cost.engine_first.location_reconcile.complete', {
      requestId,
      sessionId,
      durationMs: Date.now() - startedAt,
      actionIntent,
      targetRoomId,
      input: reconcileInput,
      result,
      draftNarrative,
      gameState: summarizeGameState(nextGameState),
    })

    return {
      handled: true,
      gameState: nextGameState,
      toolsUsed: resolvedToolsUsed,
      draftNarrative,
      sawMcpToolError,
      mcpErrorResult: sawMcpToolError ? result : undefined,
      actionExecutions: [toolActionExecution('engine_first', 'resolve_player_action', reconcileInput, result, 1)],
    }
  }

  if (actionIntent.kind === 'query_state') {
    const draftNarrative = buildDebugStateNarrative(gameState)
    logEvent('info', 'dm.cost.engine_first.debug_state', {
      requestId,
      sessionId,
      actionIntent,
      durationMs: Date.now() - startedAt,
      draftNarrative,
      gameState: summarizeGameState(gameState),
    })
    return {
      handled: true,
      gameState,
      toolsUsed: [],
      draftNarrative,
      sawMcpToolError: false,
      actionExecutions: [],
    }
  }

  if (isPlayerAtZeroHp(gameState)) {
    if (
      gameState.currentTurn === 'player' &&
      !isPlayerDeathResolved(gameState) &&
      actionIntent.kind === 'death_save'
    ) {
      toolName = 'resolve_player_action'
      input = canonicalPlayerActionInput({ kind: 'death_save' })
    } else {
      const draftNarrative = buildPlayerDownNarrative(gameState)
      logEvent('info', 'dm.cost.engine_first.player_down_guidance', {
        requestId,
        sessionId,
        actionIntent,
        durationMs: Date.now() - startedAt,
        draftNarrative,
        gameState: summarizeGameState(gameState),
      })
      return {
        handled: true,
        gameState,
        toolsUsed: [],
        draftNarrative,
        sawMcpToolError: false,
        actionExecutions: [],
      }
    }
  }

  const interpretedAction = interpreterCanonicalAction(intentInterpreter?.output)
  if (!toolName && interpretedAction && shouldExecuteInterpreterActionDirectly(interpretedAction, gameState)) {
    toolName = 'resolve_player_action'
    input = canonicalPlayerActionInput(interpretedAction)
    logEvent('info', 'dm.cost.engine_first.intent_interpreter.direct_action', {
      requestId,
      sessionId,
      actionIntent,
      intentInterpreter: intentInterpreter?.output,
      input,
      gameState: summarizeGameState(gameState),
    })
  }

  if (!toolName && detectDryadOffense(message, gameState)) {
    const draftNarrative = buildDryadOffenseNarrative()
    logEvent('info', 'dm.cost.engine_first.dryad_offense', {
      requestId,
      sessionId,
      durationMs: Date.now() - startedAt,
      draftNarrative,
      gameState: summarizeGameState(gameState),
    })
    return {
      handled: true,
      gameState,
      toolsUsed: [],
      draftNarrative,
      sawMcpToolError: false,
      actionExecutions: [],
    }
  }

  if (!toolName && detectDryadInformationRequest(message, gameState)) {
    toolName = 'resolve_player_action'
    input = canonicalPlayerActionInput({
      kind: 'ask',
      targetName: 'druidesse du verger',
      topic: message,
    })
  }

  if (!toolName && actionIntent.kind === 'guidance') {
    const draftNarrative = buildQuestGuidanceNarrative(gameState)
    logEvent('info', 'dm.cost.engine_first.quest_guidance', {
      requestId,
      sessionId,
      actionIntent,
      durationMs: Date.now() - startedAt,
      draftNarrative,
      gameState: summarizeGameState(gameState),
    })
    return {
      handled: true,
      gameState,
      toolsUsed: [],
      draftNarrative,
      sawMcpToolError: false,
      actionExecutions: [],
    }
  }

  if (!toolName && actionIntent.kind === 'use_item' && actionIntent.reason === 'healing-potion-intent') {
    toolName = 'resolve_player_action'
    input = canonicalPlayerActionInput({ kind: 'use_item', itemType: 'healing_potion' })
  }

  const directAbilityCheck = directSocialAbilityCheckFromMessage(message, gameState)
  const pendingAbilityCheck = pendingAbilityCheckFromRecentDm(recentHistory)
  const abilityCheckToResolve = directAbilityCheck ?? (
    pendingAbilityCheck && detectAbilityCheckAcceptance(message) ? pendingAbilityCheck : null
  )
  if (!toolName && abilityCheckToResolve) {
    const abilityAction: Record<string, unknown> = {
      kind: abilityCheckToResolve.social ? 'social' : 'ability_check',
      ability: abilityCheckToResolve.ability,
      label: abilityCheckToResolve.label,
      proficient: abilityCheckToResolve.proficient ?? false,
    }
    if (typeof abilityCheckToResolve.dc === 'number') abilityAction.dc = abilityCheckToResolve.dc
    const abilityInput = canonicalPlayerActionInput(abilityAction)

    logEvent('info', 'dm.cost.engine_first.ability_check.start', {
      requestId,
      sessionId,
      input: abilityInput,
      pendingAbilityCheck: abilityCheckToResolve,
      gameState: summarizeGameState(gameState),
    })

    const abilityResult = await callMCPTool('resolve_player_action', abilityInput, sessionId)
    const actionExecutions = [
      toolActionExecution('engine_first', 'resolve_player_action', abilityInput, abilityResult, 1),
    ]
    let sawMcpToolError = isMcpErrorResult(abilityResult)
    let nextGameState = await callMCPTool('get_game_state', {}, sessionId) as GameState
    const toolsUsed = toolsUsedForResolvedTool('resolve_player_action', abilityResult)
    let draftNarrative = summarizeMcpResultForNarration('resolve_player_action', abilityResult)

    if (
      !sawMcpToolError &&
      abilityCheckToResolve.social &&
      canonicalResultSucceeded(abilityResult) &&
      isObjectRecord(abilityResult) &&
      isObjectRecord(abilityResult.result) &&
      abilityResult.result.success === true &&
      nextGameState.phase === 'combat'
    ) {
      const endCombatResult = await callMCPTool('end_combat', {
        force: true,
        reason: `${abilityCheckToResolve.label} reussie: les adversaires acceptent de parlementer.`,
      }, sessionId)
      toolsUsed.push('end_combat')
      actionExecutions.push(toolActionExecution('auto', 'end_combat', {
        force: true,
        reason: `${abilityCheckToResolve.label} reussie: les adversaires acceptent de parlementer.`,
      }, endCombatResult, actionExecutions.length + 1))
      const endCombatError = isMcpErrorResult(endCombatResult)
      sawMcpToolError = sawMcpToolError || endCombatError
      if (!endCombatError) {
        nextGameState = await callMCPTool('get_game_state', {}, sessionId) as GameState
        draftNarrative = `${draftNarrative}\nLes armes redescendent: la scene bascule vers la negociation.`
      }
    }

    logEvent(sawMcpToolError ? 'warn' : 'info', 'dm.cost.engine_first.ability_check.complete', {
      requestId,
      sessionId,
      durationMs: Date.now() - startedAt,
      input: abilityInput,
      result: abilityResult,
      draftNarrative,
      toolsUsed,
      gameState: summarizeGameState(nextGameState),
    })

    return {
      handled: true,
      gameState: nextGameState,
      toolsUsed,
      draftNarrative,
      sawMcpToolError,
      mcpErrorResult: sawMcpToolError ? abilityResult : undefined,
      actionExecutions,
    }
  }

  if (!toolName) {
    const actionPlan = (isCanonicalWorldActionKind(actionIntent.kind) || actionIntent.kind === 'move')
      ? buildActionPlan(message, gameState, actionIntent.kind)
      : null
    const attackInput = parsePlayerAttackInput(message, gameState)
    const encounterRepairInput = parseEncounterRepairInput(message, gameState)
    if (actionPlan) {
      logEvent('debug', 'dm.world_action.target_resolved', {
        requestId,
        sessionId,
        actionKind: actionIntent.kind,
        targetResolution: actionPlan.targetResolution,
        actionPlan: summarizeActionPlanForDebug(actionPlan),
        enabledAffordances: derivePlayerAffordances(gameState)
          .filter(affordance => affordance.enabled)
          .map(affordance => ({ id: affordance.id, kind: affordance.kind, label: affordance.label })),
      })
      return executeActionPlan(actionPlan, gameState, sessionId, requestId, startedAt, actionIntent)
    } else if (attackInput) {
      toolName = 'resolve_player_action'
      input = canonicalPlayerActionInput({
        kind: 'attack',
        ...attackInput,
      })
    } else if (encounterRepairInput) {
      toolName = 'start_encounter'
      input = encounterRepairInput
    } else if (actionIntent.kind === 'wait') {
      toolName = 'resolve_player_action'
      input = canonicalPlayerActionInput({
        kind: 'wait',
        reason: 'Le joueur attend et passe son tour.',
      })
    } else if (actionIntent.kind === 'move') {
      if (isAmbiguousExplorationMove(message, gameState)) {
        const draftNarrative = buildAmbiguousExplorationMoveNarrative(gameState)
        const exits = currentRoomExitIds(gameState)
        const refusalCode = 'UNRESOLVED_MOVE_AMBIGUOUS'
        const detail = {
          status: 'ambiguous',
          reason: 'The player asked to leave or continue from a multi-exit room without naming a destination.',
          candidates: exits.map(roomId => ({
            roomId,
            name: roomNameForChoice(gameState, roomId),
          })),
        }
        logEvent('info', 'dm.cost.engine_first.ambiguous_move', {
          requestId,
          sessionId,
          actionIntent,
          refusalCode,
          detail,
          exits,
          durationMs: Date.now() - startedAt,
          draftNarrative,
          gameState: summarizeGameState(gameState),
        })
        return {
          handled: true,
          gameState,
          toolsUsed: [],
          draftNarrative,
          sawMcpToolError: false,
          actionExecutions: [
            toolActionExecution('rule', 'unresolved_intent', {
              message,
              actionIntent: {
                kind: actionIntent.kind,
                primitive: actionIntent.primitive,
                reason: actionIntent.reason,
              },
            }, {
              success: false,
              code: refusalCode,
              detail,
            }, 1, false),
          ],
          refusalCode,
          skipFinalNarration: true,
          narratorSource: 'rule',
        }
      }

      const toCell =
        parseCoordinateMove(message, gameState) ??
        parseNamedRoomMove(message, gameState) ??
        parseContextualRoomMove(message, gameState, recentHistory)
      if (toCell) {
        const targetRoomId = inferMappedAdventureRoomId(toCell)
        const encounterId = encounterIdForRoom(targetRoomId)
        const encounterTriggerReason = roomEncounterTriggerReason(message, gameState, targetRoomId, encounterId)
        const shouldStartEncounter =
          gameState.phase === 'exploration' &&
          countAliveMonsters(gameState) === 0 &&
          targetRoomId !== null &&
          encounterId &&
          encounterTriggerReason &&
          (
            targetRoomId !== gameState.currentRoomId ||
            !gameState.roomsVisited.includes(targetRoomId)
          )

        if (shouldStartEncounter) {
          toolName = 'start_encounter'
          input = {
            encounterId,
            playerCell: toCell,
            reason: encounterTriggerReason ?? 'Le joueur declenche une rencontre de salle.',
          }
        } else {
          toolName = 'resolve_player_action'
          input = canonicalPlayerActionInput({
            kind: 'move',
            tokenId: 'player',
            toCell,
          })
        }
      }
    }
  }

  if (!toolName || !input) {
    const unresolved = unresolvedEngineIntentResolution(message, gameState, actionIntent)
    if (unresolved) {
      logEvent('info', 'dm.cost.engine_first.unresolved_intent_blocked', {
        requestId,
        sessionId,
        actionIntent,
        refusalCode: unresolved.code,
        detail: unresolved.detail,
        draftNarrative: unresolved.narrative,
        durationMs: Date.now() - startedAt,
        gameState: summarizeGameState(gameState),
      })
      return {
        handled: true,
        gameState,
        toolsUsed: [],
        draftNarrative: unresolved.narrative,
        sawMcpToolError: false,
        actionExecutions: [
          toolActionExecution('rule', 'unresolved_intent', {
            message,
            actionIntent: {
              kind: actionIntent.kind,
              primitive: actionIntent.primitive,
              reason: actionIntent.reason,
            },
          }, {
            success: false,
            code: unresolved.code,
            detail: unresolved.detail,
          }, 1, false),
        ],
        refusalCode: unresolved.code,
        skipFinalNarration: true,
        narratorSource: 'rule',
      }
    }
    return { handled: false, gameState, toolsUsed: [], draftNarrative: '', sawMcpToolError: false, actionExecutions: [] }
  }

  logEvent('info', 'dm.cost.engine_first.start', {
    requestId,
    sessionId,
    toolName,
    actionIntent,
    input,
    gameState: summarizeGameState(gameState),
  })

  const result = await callMCPTool(toolName, input, sessionId)
  const sawMcpToolError = isMcpErrorResult(result)
  const nextGameState = await callMCPTool('get_game_state', {}, sessionId) as GameState
  const draftNarrative = summarizeMcpResultForNarration(toolName, result)
  const resolvedToolsUsed = toolsUsedForResolvedTool(toolName, result)

  logEvent(sawMcpToolError ? 'warn' : 'info', 'dm.cost.engine_first.complete', {
    requestId,
    sessionId,
    durationMs: Date.now() - startedAt,
    toolName,
    actionIntent,
    input,
    result,
    draftNarrative,
    gameState: summarizeGameState(nextGameState),
  })

  return {
    handled: true,
    gameState: nextGameState,
    toolsUsed: resolvedToolsUsed,
    draftNarrative,
    sawMcpToolError,
    mcpErrorResult: sawMcpToolError ? result : undefined,
    actionExecutions: [toolActionExecution('engine_first', toolName, input, result, 1)],
  }
}

function logRoomStateAnomaly(gameState: GameState, requestId: string, sessionId: string | undefined, stage: string): void {
  const inferredRoomId = inferMappedAdventureRoomId(gameState.player.position)
  if (!inferredRoomId) return

  if (gameState.currentRoomId !== inferredRoomId || !gameState.roomsVisited.includes(inferredRoomId)) {
    logEvent('warn', 'anomaly.room_state_mismatch', {
      requestId,
      sessionId,
      stage,
      inferredRoomId,
      currentRoomId: gameState.currentRoomId,
      roomsVisited: gameState.roomsVisited,
      playerPosition: gameState.player.position,
    })
  }
}

async function autoAdvanceCompletedTurn(
  gameState: GameState,
  sessionId: string | undefined,
  requestId: string
): Promise<{ gameState: GameState; advanced: boolean }> {
  if (!hasCompletedCurrentAction(gameState)) {
    if (gameState.phase === 'combat' && gameState.currentTurn === 'player') {
      logEvent('info', 'dm.turn.auto_advance.skipped_player_action_open', {
        requestId,
        sessionId,
        gameState: summarizeGameState(gameState),
      })
    }
    return { gameState, advanced: false }
  }

  if (gameState.currentTurn === 'player') {
    logEvent('info', 'dm.turn.auto_advance.player_action_spent', {
      requestId,
      sessionId,
      gameState: summarizeGameState(gameState),
    })
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
type GridCell = { x: number; y: number }

interface AutoNpcTurnSummary {
  actorId: string
  actorName: string
  moved?: { from: GridCell; to: GridCell }
  moveError?: unknown
  attack?: unknown
  skipped?: string
  advanceError?: unknown
  advancedTo?: string | null
}

function distanceCells(a: GridCell, b: GridCell): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y))
}

function speedCells(entity: { speed: number }): number {
  return Math.floor(entity.speed / 5)
}

function cellKey(cell: GridCell): string {
  return `${cell.x},${cell.y}`
}

function copyCell(cell: GridCell): GridCell {
  return { x: cell.x, y: cell.y }
}

function hasLivingEnemies(gameState: GameState): boolean {
  return Object.values(gameState.monsters).some(monster => monster.isAlive)
}

function monsterAttackName(monster: MonsterState): string {
  switch (monster.type) {
    case 'goblin':
    case 'goblin_minion':
    case 'goblin_boss':
    case 'bandit':
      return 'cimeterre'
    case 'hobgoblin':
    case 'hobgoblin_captain':
      return 'epee longue'
    case 'skeleton':
      return 'epee courte'
    case 'zombie':
    case 'awakened_tree':
      return 'coup'
    case 'wolf':
      return 'morsure'
    case 'violet_fungus':
      return 'touche pourrie'
    default:
      return 'attaque'
  }
}

function occupiedCells(gameState: GameState, exceptId: string): Set<string> {
  const occupied = new Set<string>()
  if (exceptId !== 'player' && !gameState.player.deathSaves?.dead) {
    occupied.add(cellKey(gameState.player.position))
  }
  for (const monster of Object.values(gameState.monsters)) {
    if (monster.id !== exceptId && monster.isAlive) {
      occupied.add(cellKey(monster.position))
    }
  }
  return occupied
}

function chooseMonsterMove(gameState: GameState, monster: MonsterState): GridCell | null {
  const remainingMovement = Math.max(0, speedCells(monster) - (gameState.movementUsed?.[monster.id] ?? 0))
  if (remainingMovement <= 0) return null

  const occupied = occupiedCells(gameState, monster.id)
  const currentDistance = distanceCells(monster.position, gameState.player.position)
  let best: { cell: GridCell; distanceToPlayer: number; movement: number } | null = null

  for (let x = Math.max(0, monster.position.x - remainingMovement); x <= monster.position.x + remainingMovement; x++) {
    for (let y = Math.max(0, monster.position.y - remainingMovement); y <= monster.position.y + remainingMovement; y++) {
      const cell = { x, y }
      const movement = distanceCells(monster.position, cell)
      if (movement === 0 || movement > remainingMovement) continue
      if (occupied.has(cellKey(cell))) continue

      const distanceToPlayer = distanceCells(cell, gameState.player.position)
      if (distanceToPlayer >= currentDistance) continue

      if (
        !best ||
        distanceToPlayer < best.distanceToPlayer ||
        (distanceToPlayer === best.distanceToPlayer && movement < best.movement)
      ) {
        best = { cell, distanceToPlayer, movement }
      }
    }
  }

  return best?.cell ?? null
}

async function loadCurrentGameState(sessionId: string | undefined): Promise<GameState> {
  return await callMCPTool('get_game_state', {}, sessionId) as GameState
}

async function autoEndCombatIfWon(
  gameState: GameState,
  sessionId: string | undefined,
  requestId: string
): Promise<{ gameState: GameState; ended: boolean }> {
  if (gameState.phase !== 'combat' || hasLivingEnemies(gameState)) {
    return { gameState, ended: false }
  }

  const startedAt = Date.now()
  logEvent('info', 'dm.combat.auto_end.start', {
    requestId,
    sessionId,
    gameState: summarizeGameState(gameState),
  })

  const result = await callMCPTool('end_combat', {
    reason: 'Tous les adversaires sont vaincus.',
  }, sessionId)
  if (isMcpErrorResult(result)) {
    logEvent('warn', 'dm.combat.auto_end.failed', {
      requestId,
      sessionId,
      result,
    })
    return { gameState, ended: false }
  }

  const nextGameState = await loadCurrentGameState(sessionId)
  logEvent('info', 'dm.combat.auto_end.ok', {
    requestId,
    sessionId,
    durationMs: Date.now() - startedAt,
    result,
    gameState: summarizeGameState(nextGameState),
  })
  return { gameState: nextGameState, ended: true }
}

async function autoEndCombatIfPlayerResolved(
  gameState: GameState,
  sessionId: string | undefined,
  requestId: string
): Promise<{ gameState: GameState; ended: boolean }> {
  if (
    gameState.phase !== 'combat' ||
    gameState.player.hp.current > 0 ||
    !isPlayerDeathResolved(gameState)
  ) {
    return { gameState, ended: false }
  }

  const deathSaves = gameState.player.deathSaves
  const reason = deathSaves?.dead
    ? 'Le héros est mort; le combat se termine par une défaite.'
    : 'Le héros est stable mais inconscient; les adversaires contrôlent la scène.'
  const startedAt = Date.now()

  logEvent('info', 'dm.combat.auto_end_player_resolved.start', {
    requestId,
    sessionId,
    reason,
    gameState: summarizeGameState(gameState),
  })

  const result = await callMCPTool('end_combat', {
    force: true,
    reason,
  }, sessionId)
  if (isMcpErrorResult(result)) {
    logEvent('warn', 'dm.combat.auto_end_player_resolved.failed', {
      requestId,
      sessionId,
      result,
    })
    return { gameState, ended: false }
  }

  const nextGameState = await loadCurrentGameState(sessionId)
  logEvent('info', 'dm.combat.auto_end_player_resolved.ok', {
    requestId,
    sessionId,
    durationMs: Date.now() - startedAt,
    result,
    gameState: summarizeGameState(nextGameState),
  })
  return { gameState: nextGameState, ended: true }
}

async function resolveNpcTurnsUntilPlayerTurn(
  gameState: GameState,
  sessionId: string | undefined,
  requestId: string
): Promise<{ gameState: GameState; resolvedTurns: number; toolsUsed: string[]; summaries: AutoNpcTurnSummary[] }> {
  let state = gameState
  let resolvedTurns = 0
  const toolsUsed: string[] = []
  const summaries: AutoNpcTurnSummary[] = []

  if (state.phase !== 'combat' || !state.currentTurn || state.currentTurn === 'player') {
    return { gameState: state, resolvedTurns, toolsUsed, summaries }
  }

  logEvent('info', 'dm.combat.auto_npc.start', {
    requestId,
    sessionId,
    currentTurn: state.currentTurn,
    gameState: summarizeGameState(state),
  })

  while (
    state.phase === 'combat' &&
    state.currentTurn &&
    state.currentTurn !== 'player' &&
    resolvedTurns < MAX_AUTO_NPC_TURNS
  ) {
    const actorId = state.currentTurn
    let monster = state.monsters[actorId]
    const summary: AutoNpcTurnSummary = {
      actorId,
      actorName: monster?.name ?? actorId,
    }

    logEvent('info', 'dm.combat.auto_npc.turn_start', {
      requestId,
      sessionId,
      actorId,
      monster,
      gameState: summarizeGameState(state),
    })

    if (state.player.deathSaves?.dead) {
      summary.skipped = 'Le joueur est mort; le PNJ ne peut plus le cibler.'
      const advance = await callMCPTool('next_turn', {
        actorId,
        skipAction: true,
        reason: summary.skipped,
      }, sessionId)
      toolsUsed.push('next_turn')
      if (isMcpErrorResult(advance)) {
        summary.advanceError = advance
        summaries.push(summary)
        logEvent('warn', 'dm.combat.auto_npc.advance_dead_player_failed', {
          requestId,
          sessionId,
          actorId,
          result: advance,
        })
        break
      }
      state = await loadCurrentGameState(sessionId)
      summary.advancedTo = state.currentTurn
      summaries.push(summary)
      resolvedTurns++
      logEvent('info', 'dm.combat.auto_npc.skip_dead_player', {
        requestId,
        sessionId,
        actorId,
        advancedTo: state.currentTurn,
        gameState: summarizeGameState(state),
      })
      continue
    }

    if (!monster || !monster.isAlive) {
      summary.skipped = 'Actor is not an active monster.'
      const advance = await callMCPTool('next_turn', {
        actorId,
        skipAction: true,
        reason: summary.skipped,
      }, sessionId)
      toolsUsed.push('next_turn')
      if (isMcpErrorResult(advance)) {
        summary.advanceError = advance
        summaries.push(summary)
        logEvent('warn', 'dm.combat.auto_npc.advance_failed', {
          requestId,
          sessionId,
          actorId,
          result: advance,
        })
        break
      }
      state = await loadCurrentGameState(sessionId)
      summary.advancedTo = state.currentTurn
      summaries.push(summary)
      resolvedTurns++
      continue
    }

    let distanceToPlayer = distanceCells(monster.position, state.player.position)
    if (distanceToPlayer > 1) {
      const destination = chooseMonsterMove(state, monster)
      if (destination) {
        const from = copyCell(monster.position)
        const move = await callMCPTool('move_token', {
          tokenId: actorId,
          toCell: destination,
        }, sessionId)
        toolsUsed.push('move_token')
        if (isMcpErrorResult(move)) {
          summary.moveError = move
          logEvent('warn', 'dm.combat.auto_npc.move_failed', {
            requestId,
            sessionId,
            actorId,
            destination,
            result: move,
          })
        } else {
          state = await loadCurrentGameState(sessionId)
          monster = state.monsters[actorId] ?? monster
          distanceToPlayer = distanceCells(monster.position, state.player.position)
          summary.moved = { from, to: copyCell(monster.position) }
          logEvent('info', 'dm.combat.auto_npc.move_ok', {
            requestId,
            sessionId,
            actorId,
            from,
            to: monster.position,
            distanceToPlayer,
          })
        }
      }
    }

    if (distanceToPlayer <= 1) {
      const attack = await callMCPTool('resolve_attack', {
        attackerId: actorId,
        targetId: 'player',
        weaponOrSpell: monsterAttackName(monster),
      }, sessionId)
      toolsUsed.push('resolve_attack')
      summary.attack = attack
      logEvent(isMcpErrorResult(attack) ? 'warn' : 'info', 'dm.combat.auto_npc.attack_result', {
        requestId,
        sessionId,
        actorId,
        result: attack,
      })
    } else {
      summary.skipped = 'Cannot reach the player this turn.'
    }

    const advanceArgs = summary.attack && !isMcpErrorResult(summary.attack)
      ? { actorId }
      : { actorId, skipAction: true, reason: summary.skipped ?? 'No legal attack available.' }

    const advance = await callMCPTool('next_turn', advanceArgs, sessionId)
    toolsUsed.push('next_turn')
    if (isMcpErrorResult(advance)) {
      summary.advanceError = advance
      summaries.push(summary)
      logEvent('warn', 'dm.combat.auto_npc.advance_failed', {
        requestId,
        sessionId,
        actorId,
        result: advance,
      })
      break
    }

    state = await loadCurrentGameState(sessionId)
    summary.advancedTo = state.currentTurn
    summaries.push(summary)
    resolvedTurns++
    logEvent('info', 'dm.combat.auto_npc.turn_complete', {
      requestId,
      sessionId,
      actorId,
      advancedTo: state.currentTurn,
      gameState: summarizeGameState(state),
    })
  }

  if (resolvedTurns >= MAX_AUTO_NPC_TURNS && state.currentTurn !== 'player') {
    logEvent('warn', 'dm.combat.auto_npc.guard_exhausted', {
      requestId,
      sessionId,
      maxAutoNpcTurns: MAX_AUTO_NPC_TURNS,
      gameState: summarizeGameState(state),
    })
  }

  logEvent('info', 'dm.combat.auto_npc.complete', {
    requestId,
    sessionId,
    resolvedTurns,
    toolsUsed,
    summaries,
    gameState: summarizeGameState(state),
  })

  return { gameState: state, resolvedTurns, toolsUsed, summaries }
}

function formatCombatLogEntries(entries: CombatLogEntry[]): string {
  if (entries.length === 0) return 'Aucun nouveau log mécanique.'
  return entries.map(entry => {
    const detail = entry.mechanicalDetail ? ` | ${entry.mechanicalDetail}` : ''
    return `- Round ${entry.round}, ${entry.turn}: ${entry.action}${detail}`
  }).join('\n')
}

function buildLocalEngineNarrative(
  gameState: GameState,
  toolsUsed: string[],
  newCombatLogEntries: CombatLogEntry[],
  newWorldEvents: EngineEvent[] = []
): string | null {
  const uniqueTools = [...new Set(toolsUsed)]
  if (!uniqueTools.includes('resolve_player_action') && uniqueTools.length !== 1) return null
  if (newCombatLogEntries.length > 1 && newWorldEvents.length === 0) return null

  const [toolName] = uniqueTools
  if (uniqueTools.includes('resolve_player_action')) {
    const engineView = buildEngineResolutionView(gameState, newCombatLogEntries, newWorldEvents)
    const eventTypes = engineView.events.map(event => event.type)
    const latestWorldEvent = newWorldEvents.at(-1)
    const latestEventOfType = (type: EngineEvent['type']) => [...newWorldEvents].reverse().find(event => event.type === type)
    if (eventTypes.includes('room.examined') || eventTypes.includes('object.examined')) return latestWorldEvent?.summary ?? 'Tu examines sans ajouter de fait cache au monde.'
    if (eventTypes.includes('clue.read')) return latestWorldEvent?.summary ?? 'Le texte lu devient un fait moteur clair.'
    if (eventTypes.includes('room.object_discovered')) return latestWorldEvent?.summary ?? 'Ta fouille revele un element concret.'
    if (eventTypes.includes('quest.completed')) return latestWorldEvent?.summary ?? 'La quete est completee dans l etat moteur.'
    if ((eventTypes.includes('object.opened') || eventTypes.includes('door.opened')) && eventTypes.includes('entity.moved')) {
      const roomName = getCurrentRoomName(gameState) ?? 'la piece suivante'
      return `${latestWorldEvent?.summary ?? 'Le passage est ouvert.'} Tu franchis le seuil et tu arrives dans ${roomName}.`
    }
    if (eventTypes.includes('object.opened') || eventTypes.includes('door.opened')) return latestWorldEvent?.summary ?? 'L ouverture est maintenant un fait moteur.'
    if (eventTypes.includes('object.taken') || eventTypes.includes('quest.item_found')) return latestWorldEvent?.summary ?? 'L objet rejoint ton inventaire.'
    if (eventTypes.includes('npc.disposition_changed')) return latestWorldEvent?.summary ?? 'La disposition du PNJ change selon le moteur.'
    if (eventTypes.includes('npc.information_revealed')) return latestWorldEvent?.summary ?? 'Le PNJ livre une information fixee par le moteur.'
    if (eventTypes.includes('item.shown')) return latestWorldEvent?.summary ?? 'L objet est montre sans quitter l inventaire.'
    if (eventTypes.includes('item.given')) return latestWorldEvent?.summary ?? 'L objet quitte ton inventaire et passe au PNJ.'
    if (eventTypes.includes('alarm.raised')) return latestWorldEvent?.summary ?? 'L alerte monte dans le monde.'
    if (eventTypes.includes('trap.disarmed')) return latestWorldEvent?.summary ?? 'Le piege est desamorce.'
    if (eventTypes.includes('trap.triggered')) return latestWorldEvent?.summary ?? 'Le piege se declenche.'
    if (eventTypes.includes('fiction.fact_created')) return latestEventOfType('fiction.fact_created')?.summary
      ? `${latestEventOfType('fiction.fact_created')?.summary}. Ce detail devient vrai dans la scene.`
      : 'Ton improvisation ajoute un fait concret et persistant a la scene.'
    if (eventTypes.includes('fiction.fact_used')) return latestEventOfType('fiction.fact_used')?.summary
      ? `${latestEventOfType('fiction.fact_used')?.summary}. Tu peux t appuyer dessus tant qu il reste coherent.`
      : 'Tu exploites un fait fictionnel deja etabli.'
    if (eventTypes.includes('improvisation.resolved')) return latestWorldEvent?.summary ?? 'Ton improvisation est acceptee comme fait moteur.'
    if (eventTypes.includes('action.blocked')) return latestWorldEvent?.summary ?? "Ton geste n'est pas possible dans l'etat actuel."
    if (eventTypes.includes('entity.moved')) return buildOralFallbackNarrative(gameState, ['move_token'])
    if (eventTypes.includes('item.used')) {
      if (gameState.player.hp.current <= 0) return buildPotionContradictionCorrection(gameState)
      const player = gameState.player
      return `La potion te remet du feu dans les veines: tu remontes a ${player.hp.current} PV sur ${player.hp.max}. Le danger n'a pas disparu, mais tu peux de nouveau peser sur la scene.`
    }
    if (eventTypes.includes('combat.death_save')) return buildPlayerDownNarrative(gameState)
    if (eventTypes.includes('combat.turn_passed')) {
      return gameState.phase === 'combat'
        ? "Tu gardes ton souffle et tu laisses passer l'ouverture. Le combat bouge autour de toi, assez pres pour que le prochain geste compte."
        : buildDirectiveSceneNarrative(gameState)
    }
    if (eventTypes.includes('check.rolled')) return newCombatLogEntries.at(-1)?.mechanicalDetail ?? null
    return null
  }

  if (toolName === 'move_token') {
    return buildOralFallbackNarrative(gameState, toolsUsed)
  }

  if (toolName === 'use_healing_potion') {
    const player = gameState.player
    return `La potion te remet du feu dans les veines: tu remontes a ${player.hp.current} PV sur ${player.hp.max}. Le danger n'a pas disparu, mais tu peux de nouveau peser sur la scene.`
  }

  if (toolName === 'roll_death_save') {
    return buildPlayerDownNarrative(gameState)
  }

  if (toolName === 'pass_turn') {
    return gameState.phase === 'combat'
      ? "Tu gardes ton souffle et tu laisses passer l'ouverture. Le combat bouge autour de toi, assez pres pour que le prochain geste compte."
      : buildDirectiveSceneNarrative(gameState)
  }

  return null
}

async function generateFinalNarration(
  params: {
    requestId: string
    sessionId: string | undefined
    inputMode: string
    clientRequestId: string | undefined
    playerMessage: string
    draftNarrative: string
    gameState: GameState
    newCombatLogEntries: CombatLogEntry[]
    engineTruthPacket: EngineTruthPacket
    summaryContext: string | undefined
    usageLog: AnthropicUsageLogEntry[]
    llmRoute: LlmRoute
  }
): Promise<string | null> {
  const startedAt = Date.now()
  const {
    requestId,
    sessionId,
    inputMode,
    clientRequestId,
    playerMessage,
    draftNarrative,
    gameState,
    newCombatLogEntries,
    engineTruthPacket,
    summaryContext,
    usageLog,
    llmRoute,
  } = params

  logEvent('info', 'dm.final_narration.start', {
    requestId,
    sessionId,
    draftNarrativeLength: draftNarrative.length,
    newCombatLogCount: newCombatLogEntries.length,
    engineTruthPacket,
    gameState: summarizeGameState(gameState),
  })

  const finalPrompt = [
    NO_GENERIC_FALLBACK_NARRATION_INSTRUCTION,
    `Action du joueur:\n${playerMessage}`,
    draftNarrative ? `Brouillon non autoritaire, a utiliser seulement s'il ne contredit pas le paquet moteur:\n${draftNarrative}` : undefined,
    `Paquet moteur faisant autorité. Tu ne peux affirmer que ces faits, les logs mécaniques, ou une conséquence sensorielle directe:\n${formatEngineTruthPacket(engineTruthPacket)}`,
    buildDownedPlayerFinalNarrationInstruction(gameState),
    `Logs mécaniques lisibles:\n${formatCombatLogEntries(newCombatLogEntries)}`,
    `Structure obligatoire: narre d'abord les events moteur canoniques du paquet, puis réaction du décor ou d'un PNJ seulement si elle est soutenue par le paquet moteur, le module ou l'historique, puis une piste ou tension jouable compatible avec les affordances enabled. Tout fait absent du paquet moteur doit rester hors champ, hypothèse, piste ou ne pas être mentionné. Ne crée pas de nouvelle menace présente si le moteur n'a pas créé l'entité ou le danger.`,
    `Écris la réponse finale au joueur en français correct, au présent, en 2-4 phrases courtes, 120 mots maximum. Elle doit être naturelle à l'oral et donner de l'élan: mouvement, réplique, menace, opportunité ou information exploitable. Tutoiement strict pour le joueur: tu/te/ton/ta/tes, jamais vous/votre/vos. Termine toujours par une ponctuation finale. Respecte strictement les résultats mécaniques. N'annonce aucune action future non résolue. Pas de Markdown, pas de liste, pas de parenthèse, pas d'excuse, pas de méta, pas de menu, pas de mention du système, du moteur, des tools, de MCP ou de l'IA. Pas de coordonnées ni d'ID technique sauf demande explicite du joueur. Ne déclare pas de fin de quête/campagne ni de conclusion alternative sauf demande explicite. Pas de time-skip: seulement la prochaine minute jouable. Si le joueur critique le style, la longueur, le système ou un bug, ne réponds pas à la critique: applique la correction silencieusement et reprends la scène en fiction.`,
  ].filter(Boolean).join('\n\n')

  try {
    const response = await createLlmMessage({
      model: MODEL,
      max_tokens: maxTokensForLlmRoute(llmRoute),
      system: buildNarrationSystemBlocks(gameState, summaryContext, dmPromptBuildOptions()),
      messages: [{ role: 'user', content: finalPrompt }],
    }, {
      requestId,
      sessionId,
      operation: 'dm.final_narration',
      requestCallCount: usageLog.length + 1,
      llmRoute,
      gameState,
      playerMessage,
      newCombatLogEntries,
      engineTruthPacket,
    })

    logEvent('info', 'dm.final_narration.response', {
      requestId,
      sessionId,
      durationMs: Date.now() - startedAt,
      stopReason: response.stop_reason,
      content: summarizeContentBlocks(response.content),
    })

    usageLog.push(logAnthropicUsage({
      requestId,
      sessionId,
      inputMode,
      clientRequestId,
      operation: 'dm.final_narration',
      model: MODEL,
      usage: response.usage,
      stopReason: response.stop_reason,
      metadata: {
        newCombatLogCount: newCombatLogEntries.length,
        draftNarrativeLength: draftNarrative.length,
        llmRoute,
      },
    }))

    const text = response.content.find(block => block.type === 'text')
    let finalNarrative = text && 'text' in text ? text.text.trim() : ''
    if (!finalNarrative) return null

    if (response.stop_reason === 'max_tokens') {
      const completeText = trimIncompleteTrailingSentence(finalNarrative)
      logEvent('warn', 'dm.final_narration.max_tokens_sanitized', {
        requestId,
        sessionId,
        originalLength: finalNarrative.length,
        sanitizedLength: completeText.text.length,
        originalNarrative: finalNarrative,
        sanitizedNarrative: completeText.text,
      })
      finalNarrative = completeText.text
      if (!finalNarrative) return null
    }

    logEvent('info', 'dm.final_narration.ok', {
      requestId,
      sessionId,
      narrativeLength: finalNarrative.length,
      narrative: finalNarrative,
    })
    return finalNarrative
  } catch (err) {
    logEvent('error', 'dm.final_narration.error', {
      requestId,
      sessionId,
      durationMs: Date.now() - startedAt,
      err,
    })
    return null
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const requestStartedAt = Date.now()
  const requestId = generateRequestId()
  let releaseSessionLock: (() => void) | null = null
  let sessionIdForLog: string | undefined
  let inputModeForLog = 'text'
  let clientRequestIdForLog: string | undefined
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
    const { message, clientRequestId, gameState, history = [], summaryContext, sessionId, clientMeta } = body
    const inputMode = clientMeta?.inputMode ?? 'text'
    sessionIdForLog = sessionId
    inputModeForLog = inputMode
    clientRequestIdForLog = clientRequestId
    logEvent('info', 'dm.request.received', {
      requestId,
      clientRequestId,
      sessionId,
      inputMode,
      clientMeta,
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
        clientRequestId,
        sessionId,
        inputMode,
        reason: 'missing-message',
        durationMs: Date.now() - requestStartedAt,
      })
      return NextResponse.json({ error: 'Message requis' }, { status: 400 })
    }

    if (clientMeta?.inputMode === 'voice') {
      logEvent('info', 'dm.voice.cost_guard', {
        requestId,
        clientRequestId,
        sessionId,
        inputMode,
        transcriptChars: clientMeta.voice?.transcriptChars,
        inputProvider: clientMeta.voice?.inputProvider,
        outputProvider: clientMeta.voice?.outputProvider,
        finalTranscriptOnly: clientMeta.voice?.finalTranscriptOnly,
        noServerAudioUpload: clientMeta.voice?.noServerAudioUpload === true,
        extraLlmCallsFromVoice: 0,
      })
    }

    releaseSessionLock = await acquireSessionLock(sessionId)
    logEvent('debug', 'dm.session_lock.acquired', { requestId, sessionId })

    const storedSession = await loadSession(sessionId)

    let currentGameState = storedSession?.gameState ?? gameState
    let requestHistory = storedSession?.history ?? history
    let requestSummaryContext = storedSession?.summaryContext ?? summaryContext
    const toolsUsed: string[] = []
    const actionExecutions: TurnTraceActionExecution[] = []
    const storedTurnTraces = storedSession?.turnTraces ?? []
    const traceId = `turn-${requestId}`
    logEvent('info', 'dm.state.resolved', {
      requestId,
      sessionId,
      stateSource: storedSession?.gameState ? 'stored-session' : gameState ? 'client-bootstrap' : 'mcp-default',
      historySource: storedSession?.history ? 'stored-session' : history.length > 0 ? 'client-bootstrap' : 'empty',
      historyLength: requestHistory.length,
      hasSummary: Boolean(requestSummaryContext),
      storedTurnTraceCount: storedTurnTraces.length,
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

    logRoomStateAnomaly(currentGameState, requestId, sessionId, 'after-mcp-sync')
    const combatLogStartLength = currentGameState.combatLog.length
    const worldEventStartLength = currentGameState.world?.eventLog.length ?? 0
    const worldDebugBeforeTurn = currentGameState.world ? structuredClone(currentGameState.world) : undefined

    if (currentGameState.phase === 'combat' && currentGameState.currentTurn && currentGameState.currentTurn !== 'player') {
      try {
        logEvent('info', 'dm.combat.pre_llm_auto_npc.start', {
          requestId,
          sessionId,
          currentTurn: currentGameState.currentTurn,
          gameState: summarizeGameState(currentGameState),
        })
        const npcTurns = await resolveNpcTurnsUntilPlayerTurn(currentGameState, sessionId, requestId)
        if (npcTurns.resolvedTurns > 0) {
          currentGameState = npcTurns.gameState
          toolsUsed.push(...npcTurns.toolsUsed)
          appendAutoToolExecutions(actionExecutions, npcTurns.toolsUsed, {
            stage: 'pre_llm_auto_npc',
            resolvedTurns: npcTurns.resolvedTurns,
            summaries: npcTurns.summaries,
          })
        }
        logEvent('info', 'dm.combat.pre_llm_auto_npc.complete', {
          requestId,
          sessionId,
          resolvedTurns: npcTurns.resolvedTurns,
          toolsUsed: npcTurns.toolsUsed,
          gameState: summarizeGameState(currentGameState),
        })
      } catch (err) {
        logEvent('error', 'dm.combat.pre_llm_auto_npc.error', {
          requestId,
          sessionId,
          err,
        })
      }
    }

    let recentHistory = requestHistory.slice(-HISTORY_KEEP_RECENT)
    const preliminaryActionIntent = classifyPlayerAction(message, currentGameState)
    const intentInterpreter = await interpretIntentForTurn({
      message,
      gameState: currentGameState,
      recentHistory,
      preliminaryIntent: preliminaryActionIntent,
      usageLog,
      requestId,
      sessionId,
      inputMode,
      clientRequestId,
    })
    const interpretedActionIntent = intentFromInterpreterOutput(message, intentInterpreter.output)
    const actionIntent = interpretedActionIntent ??
      (intentInterpreter.used ? unresolvedIntentFromInterpreter(message, intentInterpreter.output) : preliminaryActionIntent)
    const turnDebug = buildDmTurnDebug(message, currentGameState, actionIntent, intentInterpreter)
    const requiredMechanicalAction = requiredMechanicalActionFromIntent(actionIntent)
    logEvent('info', 'dm.action.intent', {
      requestId,
      clientRequestId,
      sessionId,
      inputMode,
      preliminaryActionIntent,
      actionIntent,
      requiresEngine: actionIntent.requiresEngine,
      suggestedTools: actionIntent.suggestedTools,
      intentInterpreter: {
        used: intentInterpreter.used,
        model: intentInterpreter.model,
        output: intentInterpreter.output,
        fallbackReason: intentInterpreter.fallbackReason,
      },
      gameState: summarizeGameState(currentGameState),
    })
    logEvent('debug', 'dm.turn.debug_action', {
      requestId,
      clientRequestId,
      sessionId,
      debug: turnDebug,
    })

    let newSummary: string | undefined
    let activeSummary = requestSummaryContext
    let historyProcessed = false

    const ensureHistoryReady = async (reason: string): Promise<void> => {
      if (historyProcessed) return

      const processedHistory = await processHistory(
        requestHistory,
        requestSummaryContext,
        usageLog,
        requestId,
        sessionId,
        inputMode,
        clientRequestId
      )
      recentHistory = processedHistory.recent
      newSummary = processedHistory.newSummary
      activeSummary = newSummary ?? requestSummaryContext
      historyProcessed = true

      logEvent('debug', 'dm.history.ready', {
        requestId,
        sessionId,
        reason,
        recentHistoryLength: recentHistory.length,
        activeSummaryLength: activeSummary?.length ?? 0,
        compressedThisRequest: Boolean(newSummary),
      })
    }

    let narrative = ''
    let narratorSource: DMTurnUsage['narrator'] = 'fallback'
    let llmRoute: LlmRoute = 'none'
    let iterations = 0
    let turnBoundaryReached = false
    let primaryActionToolUsed: string | null = null
    let mechanicalRetryInjected = false
    let maxTokensRetryInjected = false
    let sawMcpToolError = false
    let latestMcpErrorResult: unknown
    let engineFirstRefusalCode: string | null = null
    let lastEndTurnNarrative = ''

    const engineFirst = await resolveServerFirstAction(message, currentGameState, sessionId, requestId, recentHistory, actionIntent, intentInterpreter)
    if (engineFirst.handled) {
      currentGameState = engineFirst.gameState
      narrative = engineFirst.draftNarrative
      sawMcpToolError = engineFirst.sawMcpToolError
      latestMcpErrorResult = engineFirst.mcpErrorResult
      engineFirstRefusalCode = engineFirst.refusalCode ?? null
      if (engineFirst.narratorSource) narratorSource = engineFirst.narratorSource
      toolsUsed.push(...engineFirst.toolsUsed)
      actionExecutions.push(...engineFirst.actionExecutions)
      logRoomStateAnomaly(currentGameState, requestId, sessionId, 'after-engine-first')
    }

    const engineFirstLocalNarrationCandidate =
      engineFirst.handled &&
      !sawMcpToolError &&
      toolsUsed.length > 0 &&
      toolsUsed.every(toolName => DIRECTOR_LOCAL_FINAL_TOOLS.has(toolName)) &&
      actionIntent.kind !== 'state_reconcile' &&
      engineFirst.skipFinalNarration !== true &&
      actionIntent.kind !== 'social' &&
      actionIntent.kind !== 'interact'
    const engineFirstVisibleDraft = engineFirst.handled && Boolean(engineFirst.draftNarrative.trim())
    const needsLlmIteration = !engineFirst.handled
    const needsFinalNarrationHistory = engineFirst.handled &&
      actionIntent.kind !== 'state_reconcile' &&
      engineFirst.skipFinalNarration !== true &&
      !sawMcpToolError &&
      (
        LLM_FINAL_NARRATION_ALWAYS || NARRATION_MODE === 'quality'
          ? (toolsUsed.length > 0 || engineFirstVisibleDraft)
          : (toolsUsed.length > 0 && !engineFirstLocalNarrationCandidate)
      )
    const iterationLlmRoute = needsLlmIteration
      ? selectIterationLlmRoute(actionIntent, usageLog.length + 1, sessionId)
      : 'none'
    if (iterationLlmRoute === 'blocked') {
      llmRoute = mergeLlmRoute(llmRoute, 'blocked')
      const socialFallbackNarrative = buildSocialFallbackNarrative(currentGameState, actionIntent, toolsUsed)
      narrative = socialFallbackNarrative ?? buildDirectiveSceneNarrative(currentGameState)
      narratorSource = socialFallbackNarrative ? 'rule' : 'fallback'
      logEvent('warn', 'dm.llm_router.blocked_before_iteration', {
        requestId,
        sessionId,
        actionIntent,
        requestCallCount: usageLog.length + 1,
        socialFallbackNarrative,
      })
    } else {
      llmRoute = mergeLlmRoute(llmRoute, iterationLlmRoute)
    }
    if ((needsLlmIteration && iterationLlmRoute !== 'blocked') || needsFinalNarrationHistory) {
      await ensureHistoryReady(needsLlmIteration ? 'dm-iteration' : 'final-narration')
    } else {
      logEvent('debug', 'dm.history.skipped_before_llm', {
        requestId,
        sessionId,
        actionIntent,
        engineFirstHandled: engineFirst.handled,
        toolsUsed,
      })
    }

    // Convertit l'historique récent en messages Anthropic (alternance user/assistant)
    const historyMessages = historyToAnthropicMessages(recentHistory)

    // ── Construction des messages pour l'appel LLM ──────────────────────────
    const systemBlocks = buildSystemBlocks(currentGameState, activeSummary, dmPromptBuildOptions())
    const llmTools = withToolPromptCache(selectToolsForLlm(mcpTools, currentGameState, actionIntent))
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
      systemBlockChars: systemBlocks.map(block => block.text.length),
      rawToolsAvailable: mcpTools.length,
      toolsAvailable: llmTools.length,
      toolNames: llmTools.map(tool => tool.name),
      gameState: summarizeGameState(currentGameState),
      actionIntent,
      requiredMechanicalAction,
    })

    while (!engineFirst.handled && iterationLlmRoute !== 'blocked' && iterations < MAX_TOOL_ITERATIONS) {
      iterations++
      const iterationStartedAt = Date.now()
      logEvent('info', 'dm.anthropic.iteration.start', {
        requestId,
        sessionId,
        iteration: iterations,
        model: MODEL,
        maxTokens: MAX_TOKENS,
        messageCount: messages.length,
        toolsAvailable: llmTools.length,
        toolNames: llmTools.map(tool => tool.name),
      })

      const response = await createLlmMessage({
        model: MODEL,
        max_tokens: iterationLlmRoute === 'rich' ? LLM_RICH_NARRATION_MAX_TOKENS : MAX_TOKENS,
        system: systemBlocks,
        tools: llmTools.length > 0 ? llmTools : undefined,
        messages,
      }, {
        requestId,
        sessionId,
        operation: 'dm.iteration',
        requestCallCount: usageLog.length + 1,
        llmRoute: iterationLlmRoute,
        gameState: currentGameState,
        playerMessage: message,
        tools: llmTools,
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
        sessionId,
        inputMode,
        clientRequestId,
        operation: 'dm.iteration',
        model: MODEL,
        usage: response.usage,
        stopReason: response.stop_reason,
        metadata: {
          iteration: iterations,
          toolsAvailable: llmTools.length,
          rawToolsAvailable: mcpTools.length,
          llmRoute: iterationLlmRoute,
        },
      }))

      const responseText = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === 'text')
        .map(block => block.text)
        .join('\n\n')
      const narrativeBeforeResponse = narrative
      if (responseText && response.stop_reason !== 'tool_use') {
        narrative += (narrative ? '\n\n' : '') + responseText
        narratorSource = 'llm'
      } else if (responseText) {
        logEvent('debug', 'dm.narrative.discarded_pre_tool_text', {
          requestId,
          sessionId,
          iteration: iterations,
          textLength: responseText.length,
          text: responseText,
        })
      }
      logEvent('debug', 'dm.narrative.updated', {
        requestId,
        sessionId,
        iteration: iterations,
        narrativeLength: narrative.length,
        narrative,
      })

      if (response.stop_reason === 'end_turn') {
        lastEndTurnNarrative = responseText
        if (
          requiredMechanicalAction &&
          !hasToolSatisfyingMechanicalAction(requiredMechanicalAction, toolsUsed) &&
          !mechanicalRetryInjected &&
          iterations < MAX_TOOL_ITERATIONS
        ) {
          mechanicalRetryInjected = true
          narrative = narrativeBeforeResponse
          lastEndTurnNarrative = ''
          logEvent('warn', 'anomaly.intent_without_required_tool', {
            requestId,
            sessionId,
            iteration: iterations,
            reason: requiredMechanicalAction.reason,
            actionKind: requiredMechanicalAction.actionKind,
            primitive: requiredMechanicalAction.primitive,
            confidence: requiredMechanicalAction.confidence,
            suggestedTools: requiredMechanicalAction.suggestedTools,
            toolsUsed,
            message,
            gameState: summarizeGameState(currentGameState),
          })
          messages.push({ role: 'assistant', content: response.content })
          messages.push({
            role: 'user',
            content: `SYSTEM INTERNE, a ne jamais citer au joueur: Le dernier message du joueur demande une action mecanique (${requiredMechanicalAction.actionKind ?? 'unknown'} -> ${requiredMechanicalAction.primitive ?? requiredMechanicalAction.reason}). Les tools deja utilises (${toolsUsed.length > 0 ? toolsUsed.join(', ') : 'aucun'}) ne mutent pas l'etat attendu. Tu dois appeler au moins un tool MCP adapte (${requiredMechanicalAction.suggestedTools.join(', ')}) ou, si aucune mutation de l'etat n'est legale, repondre en fiction en une phrase courte. Un simple roll_dice ne suffit pas pour un deplacement, une entree de salle, une attaque ou une potion de soin. Ne narre pas une action mecanique sans tool pertinent. La reponse visible doit rester orale, sans meta, sans liste, sans Markdown et sans mention d'outil.`,
          })
          continue
        }

        const narrativeStateIssue =
          detectNarrativeWorldContractIssue(responseText, currentGameState, toolsUsed) ??
          detectNarrativeStateContractIssue(responseText, currentGameState, toolsUsed) ??
          detectNarrativeRoomContractIssue(responseText, currentGameState, toolsUsed)
        if (narrativeStateIssue) {
          narrative = narrativeBeforeResponse
          lastEndTurnNarrative = buildNarrativeStateCorrection(currentGameState, narrativeStateIssue)
          narrative = narrative
            ? `${narrative}\n\n${lastEndTurnNarrative}`
            : lastEndTurnNarrative
          logEvent('warn', 'anomaly.narrative_state_contract', {
            requestId,
            sessionId,
            iteration: iterations,
            issue: narrativeStateIssue,
            toolsUsed,
            message,
            responseText,
            serverCorrection: lastEndTurnNarrative,
            gameState: summarizeGameState(currentGameState),
          })
          break
        }

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
            actionExecutions.push(toolActionExecution(
              'llm_tool_blocked',
              toolUse.name,
              isObjectRecord(toolUse.input) ? toolUse.input : { rawInput: toolUse.input },
              result,
              actionExecutions.length + 1,
              false
            ))
            toolResults.push({
              type: 'tool_result',
              tool_use_id: toolUse.id,
              content: JSON.stringify(result),
              is_error: true,
            })
            continue
          }

          if (PRIMARY_ACTION_TOOLS.has(toolUse.name) && primaryActionToolUsed) {
            const result = {
              error: 'A primary game action has already been resolved for this player message.',
              code: 'PRIMARY_ACTION_ALREADY_RESOLVED',
              detail: {
                firstTool: primaryActionToolUsed,
                blockedTool: toolUse.name,
              },
            }
            sawMcpToolError = true
            logEvent('warn', 'dm.tool_use.blocked_extra_primary_action', {
              requestId,
              sessionId,
              iteration: iterations,
              toolUseId: toolUse.id,
              toolName: toolUse.name,
              primaryActionToolUsed,
              result,
            })
            actionExecutions.push(toolActionExecution(
              'llm_tool_blocked',
              toolUse.name,
              isObjectRecord(toolUse.input) ? toolUse.input : { rawInput: toolUse.input },
              result,
              actionExecutions.length + 1,
              false
            ))
            toolResults.push({
              type: 'tool_result',
              tool_use_id: toolUse.id,
              content: JSON.stringify(result),
              is_error: true,
            })
            continue
          }

          const normalizedToolInput = normalizeLlmToolInput(toolUse.name, toolUse.input)
          if (normalizedToolInput.error || !normalizedToolInput.input) {
            const result = normalizedToolInput.error ?? {
              error: 'Invalid tool input.',
              code: 'INVALID_TOOL_INPUT',
            }
            sawMcpToolError = true
            latestMcpErrorResult = result
            logEvent('warn', 'dm.tool_use.invalid_input', {
              requestId,
              sessionId,
              iteration: iterations,
              toolUseId: toolUse.id,
              toolName: toolUse.name,
              input: toolUse.input,
              result,
            })
            actionExecutions.push(toolActionExecution(
              'llm_tool_blocked',
              toolUse.name,
              isObjectRecord(toolUse.input) ? toolUse.input : { rawInput: toolUse.input },
              result,
              actionExecutions.length + 1,
              false
            ))
            toolResults.push({
              type: 'tool_result',
              tool_use_id: toolUse.id,
              content: JSON.stringify(result),
              is_error: true,
            })
            continue
          }

          const toolInput = normalizedToolInput.input
          if (normalizedToolInput.changed) {
            logEvent('info', 'dm.tool_use.input_normalized', {
              requestId,
              sessionId,
              iteration: iterations,
              toolUseId: toolUse.id,
              toolName: toolUse.name,
              corrections: normalizedToolInput.corrections,
              originalInput: toolUse.input,
              normalizedInput: toolInput,
            })
          }

          const affordanceValidationError = validateToolUseAgainstAffordances(toolUse.name, toolInput, currentGameState)
          if (affordanceValidationError) {
            sawMcpToolError = true
            latestMcpErrorResult = affordanceValidationError
            logEvent('warn', 'dm.tool_use.blocked_by_affordance', {
              requestId,
              sessionId,
              iteration: iterations,
              toolUseId: toolUse.id,
              toolName: toolUse.name,
              input: toolInput,
              result: affordanceValidationError,
              gameState: summarizeGameState(currentGameState),
            })
            actionExecutions.push(toolActionExecution(
              'llm_tool_blocked',
              toolUse.name,
              toolInput,
              affordanceValidationError,
              actionExecutions.length + 1,
              false
            ))
            toolResults.push({
              type: 'tool_result',
              tool_use_id: toolUse.id,
              content: JSON.stringify(affordanceValidationError),
              is_error: true,
            })
            continue
          }

          if (toolUse.name === 'start_encounter') {
            const validationError = validateStartEncounterToolInput(toolInput, currentGameState, message)
            if (validationError) {
              sawMcpToolError = true
              logEvent('warn', 'dm.tool_use.blocked_start_encounter_mismatch', {
                requestId,
                sessionId,
                iteration: iterations,
                toolUseId: toolUse.id,
                toolName: toolUse.name,
                input: toolInput,
                result: validationError,
                gameState: summarizeGameState(currentGameState),
              })
              actionExecutions.push(toolActionExecution(
                'llm_tool_blocked',
                toolUse.name,
                toolInput,
                validationError,
                actionExecutions.length + 1,
                false
              ))
              toolResults.push({
                type: 'tool_result',
                tool_use_id: toolUse.id,
                content: JSON.stringify(validationError),
                is_error: true,
              })
              continue
            }
          }

          toolsUsed.push(toolUse.name)
          logEvent('info', 'dm.tool_use.start', {
            requestId,
            sessionId,
            iteration: iterations,
            toolUseId: toolUse.id,
            toolName: toolUse.name,
            input: toolInput,
          })
          try {
            const result = await callMCPTool(toolUse.name, toolInput, sessionId)
            const mcpResultIsError = isMcpErrorResult(result)
            actionExecutions.push(toolActionExecution('llm_tool', toolUse.name, toolInput, result, actionExecutions.length + 1))
            logEvent('info', 'dm.tool_use.ok', {
              requestId,
              sessionId,
              iteration: iterations,
              toolUseId: toolUse.id,
              toolName: toolUse.name,
              result,
            })
            if (mcpResultIsError) {
              sawMcpToolError = true
              latestMcpErrorResult = result
              logEvent('warn', 'dm.tool_use.rule_error', {
                requestId,
                sessionId,
                iteration: iterations,
                toolUseId: toolUse.id,
                toolName: toolUse.name,
                result,
              })
            }
            if (!mcpResultIsError) {
              for (const resolvedToolName of toolsUsedForResolvedTool(toolUse.name, result)) {
                if (!toolsUsed.includes(resolvedToolName)) toolsUsed.push(resolvedToolName)
              }
            }
            if (toolUse.name === 'next_turn' && !mcpResultIsError) {
              turnBoundaryReached = true
              logEvent('info', 'dm.turn.boundary_reached', {
                requestId,
                sessionId,
                iteration: iterations,
                toolUseId: toolUse.id,
                result,
              })
            }
            if (PRIMARY_ACTION_TOOLS.has(toolUse.name) && !mcpResultIsError) {
              primaryActionToolUsed = toolUse.name
            }
            toolResults.push({
              type: 'tool_result',
              tool_use_id: toolUse.id,
              content: JSON.stringify(result),
              is_error: mcpResultIsError,
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
            actionExecutions.push(toolActionExecution(
              'llm_tool',
              toolUse.name,
              toolInput,
              { error: errMsg },
              actionExecutions.length + 1
            ))
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

      if (response.stop_reason === 'max_tokens' && !maxTokensRetryInjected && iterations < MAX_TOOL_ITERATIONS) {
        maxTokensRetryInjected = true
        const discardedNarrativeLength = narrative.length - narrativeBeforeResponse.length
        narrative = narrativeBeforeResponse
        lastEndTurnNarrative = ''
        logEvent('warn', 'dm.anthropic.max_tokens_retry', {
          requestId,
          sessionId,
          iteration: iterations,
          narrativeLength: narrative.length,
          discardedNarrativeLength,
        })
        messages.push({ role: 'assistant', content: response.content })
        messages.push({
          role: 'user',
          content: 'SYSTEM INTERNE, a ne jamais citer au joueur: Ta reponse a ete tronquee. Reponds en 2-5 phrases courtes, ou appelle exactement un tool MCP si une mutation mecanique est necessaire. Ne repete pas le brouillon tronque. La reponse visible doit rester orale, vivante, sans meta, sans liste, sans Markdown et sans mention d outil.',
        })
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

    if (!narrative && iterations >= MAX_TOOL_ITERATIONS && toolsUsed.length > 0) {
      logEvent('warn', 'dm.final_fallback.skipped_after_tools', {
        requestId,
        sessionId,
        iterations,
        toolsUsed: [...new Set(toolsUsed)],
      })
    } else if (!narrative && iterations >= MAX_TOOL_ITERATIONS) {
      const fallbackLlmRoute = selectFinalNarrationLlmRoute(actionIntent, toolsUsed, usageLog.length + 1, sessionId)
      if (fallbackLlmRoute === 'blocked') {
        llmRoute = mergeLlmRoute(llmRoute, 'blocked')
        const socialFallbackNarrative = buildSocialFallbackNarrative(currentGameState, actionIntent, toolsUsed)
        narrative = socialFallbackNarrative ?? buildDirectiveSceneNarrative(currentGameState)
        narratorSource = socialFallbackNarrative ? 'rule' : 'fallback'
        logEvent('warn', 'dm.final_fallback.blocked_by_budget', {
          requestId,
          sessionId,
          iterations,
          requestCallCount: usageLog.length + 1,
          socialFallbackNarrative,
        })
      } else {
        llmRoute = mergeLlmRoute(llmRoute, fallbackLlmRoute)
        const fallbackStartedAt = Date.now()
        logEvent('warn', 'dm.final_fallback.start', {
          requestId,
          sessionId,
          iterations,
          llmRoute: fallbackLlmRoute,
        })
        const finalResponse = await createLlmMessage({
          model: MODEL,
          max_tokens: maxTokensForLlmRoute(fallbackLlmRoute),
          system: buildNarrationSystemBlocks(currentGameState!, activeSummary, dmPromptBuildOptions()),
          messages: [{ role: 'user', content: message }],
        }, {
          requestId,
          sessionId,
          operation: 'dm.final_narration_fallback',
          requestCallCount: usageLog.length + 1,
          llmRoute: fallbackLlmRoute,
          gameState: currentGameState!,
          playerMessage: message,
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
          sessionId,
          inputMode,
          clientRequestId,
          operation: 'dm.final_narration_fallback',
          model: MODEL,
          usage: finalResponse.usage,
          stopReason: finalResponse.stop_reason,
          metadata: {
            iterations,
            llmRoute: fallbackLlmRoute,
          },
        }))

        for (const block of finalResponse.content) {
          if (block.type === 'text') narrative += block.text
        }
        if (narrative) narratorSource = 'llm'
        logEvent('warn', 'dm.final_fallback.narrative_ready', {
          requestId,
          sessionId,
          narrativeLength: narrative.length,
          narrative,
        })
      }
    }

    try {
      currentGameState = await callMCPTool('get_game_state', {}, sessionId) as GameState
      logRoomStateAnomaly(currentGameState, requestId, sessionId, 'after-llm-tools')
      logEvent('debug', 'dm.final_state.loaded', {
        requestId,
        sessionId,
        gameState: summarizeGameState(currentGameState),
      })
    } catch { /* garde l'état qu'on avait */ }

    try {
      const autoEnd = await autoEndCombatIfWon(currentGameState, sessionId, requestId)
      if (autoEnd.ended) {
        currentGameState = autoEnd.gameState
        toolsUsed.push('end_combat')
        appendAutoToolExecutions(actionExecutions, ['end_combat'], { stage: 'auto_end_combat_if_won' })
      }
    } catch (err) {
      logEvent('error', 'dm.combat.auto_end.error', {
        requestId,
        sessionId,
        err,
      })
    }

    try {
      const autoEndPlayer = await autoEndCombatIfPlayerResolved(currentGameState, sessionId, requestId)
      if (autoEndPlayer.ended) {
        currentGameState = autoEndPlayer.gameState
        toolsUsed.push('end_combat')
        appendAutoToolExecutions(actionExecutions, ['end_combat'], { stage: 'auto_end_combat_if_player_resolved' })
      }
    } catch (err) {
      logEvent('error', 'dm.combat.auto_end_player_resolved.error', {
        requestId,
        sessionId,
        err,
      })
    }

    if (!turnBoundaryReached) {
      try {
        const autoAdvance = await autoAdvanceCompletedTurn(currentGameState, sessionId, requestId)
        if (autoAdvance.advanced) {
          currentGameState = autoAdvance.gameState
          toolsUsed.push('next_turn')
          appendAutoToolExecutions(actionExecutions, ['next_turn'], { stage: 'auto_advance_completed_turn' })
        }
      } catch (err) {
        logEvent('error', 'dm.turn.auto_advance.error', {
          requestId,
          sessionId,
          err,
        })
      }
    }

    try {
      const npcTurns = await resolveNpcTurnsUntilPlayerTurn(currentGameState, sessionId, requestId)
      if (npcTurns.resolvedTurns > 0) {
        currentGameState = npcTurns.gameState
        toolsUsed.push(...npcTurns.toolsUsed)
        appendAutoToolExecutions(actionExecutions, npcTurns.toolsUsed, {
          stage: 'auto_npc',
          resolvedTurns: npcTurns.resolvedTurns,
          summaries: npcTurns.summaries,
        })
      }
    } catch (err) {
      logEvent('error', 'dm.combat.auto_npc.error', {
        requestId,
        sessionId,
        err,
      })
    }

    try {
      const autoEndPlayer = await autoEndCombatIfPlayerResolved(currentGameState, sessionId, requestId)
      if (autoEndPlayer.ended) {
        currentGameState = autoEndPlayer.gameState
        toolsUsed.push('end_combat')
        appendAutoToolExecutions(actionExecutions, ['end_combat'], { stage: 'auto_end_player_resolved_after_npc' })
      }
    } catch (err) {
      logEvent('error', 'dm.combat.auto_end_player_resolved_after_npc.error', {
        requestId,
        sessionId,
        err,
      })
    }

    try {
      const autoEnd = await autoEndCombatIfWon(currentGameState, sessionId, requestId)
      if (autoEnd.ended) {
        currentGameState = autoEnd.gameState
        toolsUsed.push('end_combat')
        appendAutoToolExecutions(actionExecutions, ['end_combat'], { stage: 'auto_end_after_npc' })
      }
    } catch (err) {
      logEvent('error', 'dm.combat.auto_end_after_npc.error', {
        requestId,
        sessionId,
        err,
      })
    }

    const newCombatLogEntries = currentGameState.combatLog.slice(combatLogStartLength)
    let newWorldEvents = currentGameState.world?.eventLog.slice(worldEventStartLength) ?? []
    if (sawMcpToolError && currentGameState.world && !newWorldEvents.some(event => event.type === 'action.blocked')) {
      const code = mcpErrorCode(latestMcpErrorResult) ?? 'MCP_RULE_ERROR'
      const summary = isObjectRecord(latestMcpErrorResult) && typeof latestMcpErrorResult.error === 'string'
        ? latestMcpErrorResult.error
        : 'Action refusee par une regle moteur.'
      const blockedEvent: EngineEvent = {
        id: `route-blocked-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        type: 'action.blocked',
        summary,
        actorId: 'player',
        outcome: 'blocked',
        visibleToPlayer: true,
        metadata: {
          code,
          reflectedByRoute: true,
          actionKind: actionIntent.kind,
        },
      }
      currentGameState = {
        ...currentGameState,
        world: {
          ...currentGameState.world,
          eventLog: [...currentGameState.world.eventLog, blockedEvent],
        },
      }
      newWorldEvents = [...newWorldEvents, blockedEvent]
    }

    if (sawMcpToolError) {
      const ruleNarrative = buildMcpRuleErrorNarrative(latestMcpErrorResult, currentGameState, toolsUsed)
      logEvent('warn', 'dm.narrative.mcp_rule_error_deterministic', {
        requestId,
        sessionId,
        toolsUsed: [...new Set(toolsUsed)],
        latestMcpErrorResult,
        previousNarrative: narrative,
        ruleNarrative,
        gameState: summarizeGameState(currentGameState),
      })
      narrative = ruleNarrative
      narratorSource = 'rule'
    }

    const directorDecision = !sawMcpToolError && actionIntent.kind !== 'state_reconcile' && engineFirst.skipFinalNarration !== true
      ? buildDirectorDecision({
        playerMessage: message,
        actionIntent,
        gameState: currentGameState,
        toolsUsed,
        newCombatLogEntries,
      })
      : null
    if (directorDecision) {
      currentGameState = {
        ...currentGameState,
        sceneMemory: directorDecision.sceneMemory,
      }
      logEvent('info', 'dm.director.decision', {
        requestId,
        sessionId,
        reason: directorDecision.reason,
        shouldUseLlmNarrator: directorDecision.shouldUseLlmNarrator,
        hasLocalNarrative: Boolean(directorDecision.narrative),
        beats: directorDecision.beats,
        sceneMemory: directorDecision.sceneMemory,
      })
    }

    const engineTruthPacket = buildEngineTruthPacket(actionIntent, toolsUsed, currentGameState, newCombatLogEntries, newWorldEvents, intentInterpreter)
    if (toolsUsed.length > 0 && !sawMcpToolError) {
      logEvent('info', 'dm.engine.truth_packet', {
        requestId,
        sessionId,
        engineTruthPacket,
      })
    }

    const localEngineNarrative = !sawMcpToolError && actionIntent.kind !== 'state_reconcile' && engineFirst.skipFinalNarration !== true
      ? buildLocalEngineNarrative(currentGameState, toolsUsed, newCombatLogEntries, newWorldEvents)
      : null
    const directorNarrative = directorDecision?.narrative ?? null
    const draftNarrative = directorNarrative || localEngineNarrative || narrative || ''
    const hasPlayerVisibleDraft = Boolean(draftNarrative.trim())
    const shouldPolishEngineFirstDraft = engineFirst.handled && hasPlayerVisibleDraft && narratorSource !== 'llm'
    const shouldTryFinalLlmNarration = !sawMcpToolError && actionIntent.kind !== 'state_reconcile' && engineFirst.skipFinalNarration !== true && (
      LLM_FINAL_NARRATION_ALWAYS || NARRATION_MODE === 'quality'
        ? (toolsUsed.length > 0 || shouldPolishEngineFirstDraft)
        : (toolsUsed.length > 0 && !directorNarrative && !localEngineNarrative && directorDecision?.shouldUseLlmNarrator !== false)
    )

    if (shouldTryFinalLlmNarration) {
      const finalLlmRoute = selectFinalNarrationLlmRoute(actionIntent, toolsUsed, usageLog.length + 1, sessionId)
      if (finalLlmRoute === 'blocked') {
        llmRoute = mergeLlmRoute(llmRoute, 'blocked')
        const socialFallbackNarrative = buildSocialFallbackNarrative(currentGameState, actionIntent, toolsUsed, newWorldEvents)
        const fallbackNarrative = draftNarrative || socialFallbackNarrative || buildOralFallbackNarrative(currentGameState, toolsUsed)
        logEvent('warn', 'dm.final_narration.blocked_by_budget', {
          requestId,
          sessionId,
          narrationMode: NARRATION_MODE,
          toolsUsed: [...new Set(toolsUsed)],
          discardedDraftNarrative: narrative,
          fallbackNarrative,
          socialFallbackNarrative,
        })
        narrative = fallbackNarrative
        narratorSource = (socialFallbackNarrative || isSocialNarrationContext(actionIntent, toolsUsed, newWorldEvents)) ? 'local' : 'fallback'
      } else {
        llmRoute = mergeLlmRoute(llmRoute, finalLlmRoute)
        const finalNarrative = await generateFinalNarration({
          requestId,
          sessionId,
          inputMode,
          clientRequestId,
          playerMessage: message,
          draftNarrative,
          gameState: currentGameState,
          newCombatLogEntries,
          engineTruthPacket,
          summaryContext: activeSummary,
          usageLog,
          llmRoute: finalLlmRoute,
        })
        if (finalNarrative) {
          narrative = finalNarrative
          narratorSource = 'llm'
        } else {
          const socialFallbackNarrative = buildSocialFallbackNarrative(currentGameState, actionIntent, toolsUsed, newWorldEvents)
          const fallbackNarrative = draftNarrative || socialFallbackNarrative || buildOralFallbackNarrative(currentGameState, toolsUsed)
          logEvent('warn', 'dm.final_narration.fallback_after_tool_mutation', {
            requestId,
            sessionId,
            narrationMode: NARRATION_MODE,
            toolsUsed: [...new Set(toolsUsed)],
            discardedDraftNarrative: narrative,
            fallbackNarrative,
            socialFallbackNarrative,
          })
          narrative = fallbackNarrative
          narratorSource = (socialFallbackNarrative || isSocialNarrationContext(actionIntent, toolsUsed, newWorldEvents)) ? 'local' : 'fallback'
        }
      }
    } else if (directorNarrative) {
      narrative = directorNarrative
      narratorSource = 'director'
      logEvent('info', 'dm.final_narration.director_local', {
        requestId,
        sessionId,
        narrationMode: NARRATION_MODE,
        reason: directorDecision?.reason,
        beats: directorDecision?.beats ?? [],
        toolsUsed: [...new Set(toolsUsed)],
        newCombatLogCount: newCombatLogEntries.length,
        narrativeLength: narrative.length,
      })
    } else if (localEngineNarrative) {
      narrative = localEngineNarrative
      narratorSource = 'local'
      logEvent('info', 'dm.final_narration.local_engine', {
        requestId,
        sessionId,
        narrationMode: NARRATION_MODE,
        toolsUsed: [...new Set(toolsUsed)],
        newCombatLogCount: newCombatLogEntries.length,
        narrativeLength: narrative.length,
      })
    } else if (toolsUsed.length > 0 && !sawMcpToolError) {
      const socialFallbackNarrative = buildSocialFallbackNarrative(currentGameState, actionIntent, toolsUsed, newWorldEvents)
      const fallbackNarrative = draftNarrative || socialFallbackNarrative || buildOralFallbackNarrative(currentGameState, toolsUsed)
      logEvent('warn', 'dm.final_narration.director_fallback_without_llm', {
        requestId,
        sessionId,
        narrationMode: NARRATION_MODE,
        reason: directorDecision?.reason,
        toolsUsed: [...new Set(toolsUsed)],
        discardedDraftNarrative: narrative,
        fallbackNarrative,
        socialFallbackNarrative,
      })
      narrative = fallbackNarrative
      narratorSource = (socialFallbackNarrative || isSocialNarrationContext(actionIntent, toolsUsed, newWorldEvents)) ? 'local' : 'fallback'
    }

    if (looksLikeGenericSceneFallback(narrative)) {
      const replacementNarrative = buildContextualNoFallbackNarrative(currentGameState, actionIntent, intentInterpreter)
      logEvent('warn', 'dm.narrative.generic_fallback_rejected', {
        requestId,
        sessionId,
        originalNarrative: narrative,
        replacementNarrative,
        actionIntent,
        intentInterpreter: intentInterpreter.output,
        toolsUsed: [...new Set(toolsUsed)],
      })
      narrative = replacementNarrative
      narratorSource = 'rule'
    }

    const oralNarrative = normalizeNarrativeForOralPlayback(narrative, currentGameState, toolsUsed, { maxSentences: ORAL_NARRATION_MAX_SENTENCES, maxChars: ORAL_NARRATION_MAX_CHARS })
    if (oralNarrative.changed) {
      logEvent(oralNarrative.fallbackUsed ? 'warn' : 'info', 'dm.narrative.oral_guard.applied', {
        requestId,
        sessionId,
        reasons: oralNarrative.reasons,
        removedLineCount: oralNarrative.removedLineCount,
        fallbackUsed: oralNarrative.fallbackUsed,
        originalLength: oralNarrative.originalLength,
        finalLength: oralNarrative.finalLength,
        originalNarrative: narrative,
        oralNarrative: oralNarrative.narrative,
      })
      narrative = oralNarrative.narrative
    }

    const finalNarrativeStateIssue =
      detectNarrativeWorldContractIssue(narrative, currentGameState, toolsUsed, engineTruthPacket.events) ??
      detectNarrativeStateContractIssue(narrative, currentGameState, toolsUsed) ??
      detectNarrativeRoomContractIssue(narrative, currentGameState, toolsUsed)
    if (finalNarrativeStateIssue) {
      const serverCorrection = buildNarrativeStateCorrection(currentGameState, finalNarrativeStateIssue)
      logEvent('warn', 'anomaly.final_narrative_state_contract', {
        requestId,
        sessionId,
        issue: finalNarrativeStateIssue,
        toolsUsed,
        message,
        originalNarrative: narrative,
        serverCorrection,
        gameState: summarizeGameState(currentGameState),
      })
      narrative = serverCorrection
    }

    const refusalCode = engineFirstRefusalCode ?? mcpErrorCode(latestMcpErrorResult)
    const worldDiff = buildWorldDebugDiff(worldDebugBeforeTurn, currentGameState.world, newWorldEvents)

    const turnUsage: DMTurnUsage = {
      llm: summarizeAnthropicUsage(usageLog),
      operations: usageLog.map(entry => entry.operation),
      narrator: narratorSource,
      llmRoute,
    }

    const turnTrace = buildTurnTrace({
      traceId,
      requestId,
      clientRequestId,
      sessionId,
      startedAt: new Date(requestStartedAt),
      completedAt: new Date(),
      playerMessage: message,
      inputMode,
      debug: {
        ...turnDebug,
        refusalCode,
        worldDiff,
      },
      actions: actionExecutions,
      toolsUsed: [...new Set(toolsUsed)],
      gameState: currentGameState,
      engineEvents: engineTruthPacket.events,
      affordances: engineTruthPacket.affordances,
      worldDiff,
      newCombatLogEntries,
      finalNarration: narrative || 'Le Dungeon Master reflechit...',
      narrator: turnUsage.narrator,
      llmRoute: turnUsage.llmRoute,
      refusalCode,
    })

    logEvent(turnTrace.contradictions.length > 0 ? 'warn' : 'info', 'dm.turn.trace', {
      requestId,
      clientRequestId,
      sessionId,
      traceId: turnTrace.traceId,
      turnTrace,
    })

    const persistedHistory = [
      ...(activeSummary ? recentHistory.slice(-HISTORY_KEEP_RECENT) : requestHistory),
      { role: 'player', content: message } satisfies ConversationTurn,
      { role: 'dm', content: narrative || 'Le Dungeon Master réfléchit...' } satisfies ConversationTurn,
    ]

    try {
      await saveSession(sessionId, {
        gameState: currentGameState,
        history: persistedHistory,
        summaryContext: activeSummary,
        turnTraces: [...storedTurnTraces, turnTrace],
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
      engine: {
        events: engineTruthPacket.events,
        affordances: engineTruthPacket.affordances,
      },
      debug: {
        ...turnDebug,
        refusalCode,
        worldDiff,
      },
      turnTrace,
      usage: turnUsage,
      // Renvoie le nouveau résumé au client seulement si une compression a eu lieu
      summaryContext: newSummary,
    }

    logAnthropicUsageSummary(requestId, usageLog, {
      inputMode,
      voice: clientMeta?.voice,
      iterations,
      toolsUsed: [...new Set(toolsUsed)],
      compressedHistory: Boolean(newSummary),
    }, {
      sessionId,
      inputMode,
      clientRequestId,
    })

    const estimatedCostUsd = Number(
      usageLog.reduce((sum, entry) => sum + entry.estimatedCostUsd, 0).toFixed(8)
    )
    logEvent('info', 'dm.pipeline.summary', {
      requestId,
      clientRequestId,
      sessionId,
      durationMs: Date.now() - requestStartedAt,
      inputMode,
      narrationMode: NARRATION_MODE,
      actionIntent: {
        kind: actionIntent.kind,
        primitive: actionIntent.primitive,
        reason: actionIntent.reason,
        confidence: actionIntent.confidence,
        requiresEngine: actionIntent.requiresEngine,
      },
      engineFirstHandled: engineFirst.handled,
      iterations,
      llmCalls: usageLog.length,
      estimatedCostUsd,
      narrator: turnUsage.narrator,
      llmRoute: turnUsage.llmRoute,
      cacheCreationInputTokens: turnUsage.llm.cacheCreationInputTokens,
      cacheReadInputTokens: turnUsage.llm.cacheReadInputTokens,
      toolsUsed: [...new Set(toolsUsed)],
      engineEventTypes: engineTruthPacket.events.map(event => event.type),
      traceId: turnTrace.traceId,
      turnTraceActionCount: turnTrace.actions.length,
      turnTraceContradictions: turnTrace.contradictions.map(issue => issue.reason),
      playerAffordances: engineTruthPacket.affordances.map(action => ({
        kind: action.kind,
        enabled: action.enabled,
        toolName: action.toolName,
      })),
      compressedHistory: Boolean(newSummary),
      historyProcessed,
      narrativeLength: dmResponse.narrative.length,
      gameState: summarizeGameState(dmResponse.newGameState),
    })

    logEvent('info', 'dm.request.complete', {
      requestId,
      clientRequestId,
      sessionId,
      durationMs: Date.now() - requestStartedAt,
      inputMode,
      narrationMode: NARRATION_MODE,
      voice: clientMeta?.voice,
      iterations,
      toolsUsed: [...new Set(toolsUsed)],
      traceId: turnTrace.traceId,
      turnTraceActionCount: turnTrace.actions.length,
      turnTraceContradictionCount: turnTrace.contradictions.length,
      narrativeLength: dmResponse.narrative.length,
      narrative: dmResponse.narrative,
      compressedHistory: Boolean(newSummary),
      newGameState: summarizeGameState(dmResponse.newGameState),
    })

    return NextResponse.json(dmResponse)
  } catch (err) {
    logEvent('error', 'dm.request.error', {
      requestId,
      clientRequestId: clientRequestIdForLog,
      sessionId: sessionIdForLog,
      inputMode: inputModeForLog,
      durationMs: Date.now() - requestStartedAt,
      err,
    })
    const message = err instanceof Error ? err.message : 'Erreur interne du serveur'
    return NextResponse.json({ error: message }, { status: 500 })
  } finally {
    if (releaseSessionLock) {
      releaseSessionLock()
      logEvent('debug', 'dm.session_lock.released', {
        requestId,
        clientRequestId: clientRequestIdForLog,
        sessionId: sessionIdForLog,
        inputMode: inputModeForLog,
      })
    }
  }
}
