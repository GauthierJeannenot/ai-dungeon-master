import { ADVENTURE_ROOMS, centerCellForAdventureRoom } from './adventure-map'
import { buildActionPlan, summarizeActionPlanForDebug } from './action-plan'
import { resolveLocationDestination, summarizeLocationResolution } from './location-index'
import { buildSceneSurface, summarizeSceneSurfaceForDebug } from './scene-surface'
import { resolveLocationReconcileRoomId } from './dm-narration-guards'
import { buildWorldActionInput, resolveWorldActionTargets } from './world-target-resolver'
import { isCanonicalWorldActionKind } from './turn-pipeline'
import { interpreterCanonicalAction, type IntentInterpreterTurnResult } from './turn-intent-action'
import type { DMDebugTurnView, GameState } from './types'
import type { GameActionIntent } from './game-actions'

export function buildTurnDebugStage(
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

function centerCellForRoom(roomId: string): { x: number; y: number } | null {
  return centerCellForAdventureRoom(roomId)
}
