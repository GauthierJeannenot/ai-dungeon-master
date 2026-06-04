import type {
  CombatLogEntry,
  DMDebugTurnView,
  DMTurnUsage,
  EngineEvent,
  GameState,
  PlayerAffordance,
  TurnTrace,
  TurnTraceActionExecution,
} from './types'
import {
  detectUnsupportedNarratedWorldFacts,
  extractNarratedWorldFacts,
} from './narrative-world-contract'

export const TURN_TRACE_SCHEMA_VERSION = 1

export interface BuildTurnTraceInput {
  traceId: string
  requestId: string
  clientRequestId?: string
  sessionId?: string
  startedAt: Date
  completedAt?: Date
  playerMessage: string
  inputMode?: string
  status?: TurnTrace['status']
  debug: DMDebugTurnView
  actions: TurnTraceActionExecution[]
  toolsUsed: string[]
  gameState: GameState
  engineEvents: EngineEvent[]
  affordances: PlayerAffordance[]
  worldDiff?: DMDebugTurnView['worldDiff']
  newCombatLogEntries?: CombatLogEntry[]
  finalNarration: string
  narrator: DMTurnUsage['narrator']
  llmRoute: DMTurnUsage['llmRoute']
  refusalCode?: string | null
}

export function actionExecution(
  fields: Omit<TurnTraceActionExecution, 'id' | 'executed' | 'succeeded'> & {
    id?: string
    executed?: boolean
    succeeded?: boolean
  }
): TurnTraceActionExecution {
  const result = fields.result
  const errorCode = fields.errorCode ?? errorCodeFromResult(result)
  const executed = fields.executed ?? fields.source !== 'llm_tool_blocked'
  const succeeded = fields.succeeded ?? (executed && !errorCode && !resultLooksFailed(result))
  return {
    id: fields.id ?? `${fields.source}-${fields.toolName}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    source: fields.source,
    toolName: fields.toolName,
    input: fields.input,
    result,
    executed,
    succeeded,
    errorCode,
  }
}

export function errorCodeFromResult(result: unknown): string | null {
  if (!result || typeof result !== 'object') return null
  const record = result as Record<string, unknown>
  if (typeof record.code === 'string') return record.code
  if (typeof record.errorCode === 'string') return record.errorCode
  if (record.result && typeof record.result === 'object') {
    const inner = record.result as Record<string, unknown>
    if (typeof inner.code === 'string') return inner.code
    if (typeof inner.errorCode === 'string') return inner.errorCode
  }
  return null
}

function resultLooksFailed(result: unknown): boolean {
  if (!result || typeof result !== 'object') return false
  const record = result as Record<string, unknown>
  if (record.success === false || record.isError === true || typeof record.error === 'string') return true
  if (record.result && typeof record.result === 'object') {
    const inner = record.result as Record<string, unknown>
    return inner.success === false || inner.isError === true || typeof inner.error === 'string'
  }
  return false
}

function enemyReactionsFromTurn(
  events: EngineEvent[],
  combatLogEntries: CombatLogEntry[] = []
): Array<Record<string, unknown>> {
  const eventReactions = events
    .filter(event => event.actorId && event.actorId !== 'player')
    .map(event => ({
      source: 'engine_event',
      actorId: event.actorId,
      type: event.type,
      targetId: event.targetId,
      outcome: event.outcome,
      summary: event.summary,
    }))

  const combatReactions = combatLogEntries
    .filter(entry => entry.turn && entry.turn !== 'player')
    .map(entry => ({
      source: 'combat_log',
      round: entry.round,
      actorId: entry.turn,
      action: entry.action,
      mechanicalDetail: entry.mechanicalDetail,
    }))

  return [...eventReactions, ...combatReactions]
}

export function buildTurnTrace(input: BuildTurnTraceInput): TurnTrace {
  const narrativeFacts = extractNarratedWorldFacts(input.finalNarration)
  const contradictions = detectUnsupportedNarratedWorldFacts(
    input.finalNarration,
    input.gameState,
    input.engineEvents,
    input.toolsUsed
  ).map(issue => ({
    reason: issue.reason,
    fact: issue.fact as unknown as Record<string, unknown>,
    suggestedTools: issue.suggestedTools,
  }))

  return {
    schemaVersion: TURN_TRACE_SCHEMA_VERSION,
    traceId: input.traceId,
    requestId: input.requestId,
    clientRequestId: input.clientRequestId,
    sessionId: input.sessionId,
    startedAt: input.startedAt.toISOString(),
    completedAt: (input.completedAt ?? new Date()).toISOString(),
    status: input.status ?? 'completed',
    input: {
      raw: input.playerMessage,
      inputMode: input.inputMode,
    },
    intent: input.debug.actionIntent,
    parsedAction: input.debug.parsedAction ?? null,
    targetResolution: input.debug.targetResolution ?? null,
    actionPlan: input.debug.actionPlan ?? null,
    sceneSurface: input.debug.sceneSurface ?? null,
    intentInterpreterInputSummary: input.debug.intentInterpreterInputSummary ?? null,
    intentInterpreterOutput: input.debug.intentInterpreterOutput ?? null,
    intentInterpreterModel: input.debug.intentInterpreterModel ?? null,
    intentInterpreterUsed: input.debug.intentInterpreterUsed ?? false,
    intentInterpreterFallbackReason: input.debug.intentInterpreterFallbackReason ?? null,
    actions: input.actions,
    toolsUsed: [...new Set(input.toolsUsed)],
    engineEvents: input.engineEvents,
    affordances: input.affordances,
    worldDiff: input.worldDiff,
    enemyReactions: enemyReactionsFromTurn(input.engineEvents, input.newCombatLogEntries),
    narrativeFacts,
    contradictions,
    finalNarration: input.finalNarration,
    narrator: input.narrator,
    llmRoute: input.llmRoute,
    refusalCode: input.refusalCode ?? null,
  }
}
