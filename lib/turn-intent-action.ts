import { centerCellForAdventureRoom } from './adventure-map'
import { normalizeFrenchText } from './dm-intent'
import {
  buildImproviseOutput,
  improvisationTypeForText,
  type IntentInterpreterInputSummary,
  type IntentInterpreterOutput,
} from './intent-interpreter'
import { buildSceneSurface } from './scene-surface'
import type {
  GameActionConfidence,
  GameActionIntent,
  GameActionPrimitive,
} from './game-actions'
import type { CanonicalPlayerActionKind, GameState } from './types'

export interface IntentInterpreterTurnResult {
  used: boolean
  model: string | null
  inputSummary: IntentInterpreterInputSummary | null
  output: IntentInterpreterOutput | null
  fallbackReason: string | null
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

const META_INTERPRETER_INTENT_KINDS = new Set<string>([
  'guidance',
  'query_state',
  'query',
  'question',
  'status_question',
  'meta_question',
])

const MOVEMENT_INTERPRETER_INTENT_KINDS = new Set<string>(['move', 'movement', 'traverse'])
const MOVEMENT_INTERPRETER_ACTION_KINDS = new Set<string>([
  'move',
  'traverse',
  'open',
  'unlock',
  'force',
  'use_object',
])

export function numericConfidenceToActionConfidence(value: number): GameActionConfidence {
  if (value >= 0.8) return 'high'
  if (value >= 0.55) return 'medium'
  return 'low'
}

export function primitiveForInterpretedKind(kind: CanonicalPlayerActionKind): GameActionPrimitive {
  if (kind === 'attack') return 'resolve_attack'
  if (kind === 'move') return 'move'
  if (kind === 'use_item') return 'use_item'
  if (kind === 'ability_check' || kind === 'social' || kind === 'death_save') return 'check'
  if (kind === 'wait') return 'wait'
  if (kind === 'observe') return 'narrate'
  return 'world_action'
}

export function suggestedToolsForInterpretedKind(kind: CanonicalPlayerActionKind): string[] {
  if (kind === 'attack') return ['resolve_player_action', 'resolve_player_attack']
  if (kind === 'move') return ['resolve_player_action', 'move_token']
  if (kind === 'ability_check' || kind === 'social') return ['resolve_player_action', 'roll_ability_check']
  if (kind === 'death_save') return ['resolve_player_action', 'roll_death_save']
  if (kind === 'use_item') return ['resolve_player_action', 'use_healing_potion']
  if (kind === 'wait') return ['resolve_player_action', 'pass_turn']
  if (kind === 'observe') return []
  return ['resolve_player_action']
}

export function normalizeInterpreterCanonicalAction(action: Record<string, unknown>): Record<string, unknown> | null {
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

    const targetRoomId = roomIdFromInterpreterAction(action)
    const toCell = targetRoomId ? centerCellForRoom(targetRoomId) : null
    return toCell ? { kind: 'move', tokenId: 'player', toCell } : null
  }

  if (rawKind === 'move' && !isObjectRecord(action.toCell)) {
    const targetRoomId = roomIdFromInterpreterAction(action)
    const toCell = targetRoomId ? centerCellForRoom(targetRoomId) : null
    if (toCell) return { ...action, tokenId: typeof action.tokenId === 'string' ? action.tokenId : 'player', toCell }
  }

  return action
}

export function interpreterCanonicalAction(output: IntentInterpreterOutput | null | undefined): Record<string, unknown> | null {
  if (!output || output.requiresClarification || !isObjectRecord(output.canonicalAction)) return null
  const normalizedAction = normalizeInterpreterCanonicalAction(output.canonicalAction)
  if (!normalizedAction) return null
  const kind = normalizedAction.kind
  if (typeof kind !== 'string') return null
  if (!PLAYER_ACTION_KINDS.has(kind as CanonicalPlayerActionKind)) return null
  return normalizedAction
}

export function interpretedActionTargetsPortal(action: Record<string, unknown>, gameState: GameState): boolean {
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

export function shouldExecuteInterpreterActionDirectly(action: Record<string, unknown>, gameState: GameState): boolean {
  const kind = action.kind
  if (typeof kind !== 'string') return false
  if (kind === 'social' || kind === 'ability_check') return false
  if (kind === 'search') return false
  if (interpretedActionTargetsPortal(action, gameState)) return false
  if (kind === 'move') return isObjectRecord(action.toCell)
  if (kind === 'attack') return gameState.phase === 'combat' && gameState.currentTurn === 'player'
  return PLAYER_ACTION_KINDS.has(kind as CanonicalPlayerActionKind)
}

export function intentFromInterpreterOutput(
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

export function unresolvedIntentFromInterpreter(
  message: string,
  output: IntentInterpreterOutput | null | undefined
): GameActionIntent {
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

export function isMovementInterpreterOutput(output: IntentInterpreterOutput): boolean {
  const intentKind = typeof output.intentKind === 'string' ? output.intentKind.toLowerCase() : ''
  if (MOVEMENT_INTERPRETER_INTENT_KINDS.has(intentKind)) return true
  const action = isObjectRecord(output.canonicalAction) ? output.canonicalAction : null
  const kind = action && typeof action.kind === 'string' ? action.kind : null
  return Boolean(kind && MOVEMENT_INTERPRETER_ACTION_KINDS.has(kind))
}

export function ensureFlexibleInterpreterOutput(
  output: IntentInterpreterOutput | null,
  message: string,
  gameState: GameState
): IntentInterpreterOutput | null {
  if (!output) return output
  const intentKind = typeof output.intentKind === 'string' ? output.intentKind.toLowerCase() : ''
  if (META_INTERPRETER_INTENT_KINDS.has(intentKind)) return output
  if (isMovementInterpreterOutput(output)) return output
  if (interpreterCanonicalAction(output)) return output

  const improviseType = improvisationTypeForText(normalizeFrenchText(message))
  return {
    ...buildImproviseOutput(message, gameState, improviseType),
    source: output.source,
  }
}

function roomIdFromInterpreterAction(action: Record<string, unknown>): string | null {
  return typeof action.targetRoomId === 'string'
    ? action.targetRoomId
    : typeof action.toRoomId === 'string'
      ? action.toRoomId
      : typeof action.roomId === 'string'
        ? action.roomId
        : null
}

function centerCellForRoom(roomId: string): { x: number; y: number } | null {
  return centerCellForAdventureRoom(roomId)
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}
