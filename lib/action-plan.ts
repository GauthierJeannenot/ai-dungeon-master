import { centerCellForAdventureRoom } from './adventure-map'
import type { GameActionKind } from './game-actions'
import {
  buildSceneSurface,
  findSceneTargetsByText,
  type SceneSurfaceObject,
} from './scene-surface'
import type { CanonicalPlayerActionKind, GameState } from './types'
import {
  buildPortalTraversalActionInput,
  buildWorldActionInput,
  resolveWorldActionTargets,
  type WorldActionTargetResolution,
} from './world-target-resolver'
import { normalizeFrenchText } from './dm-intent'

export type ActionPlanSource = 'world_action' | 'portal_traversal'
export type ActionPlanToolName = 'resolve_player_action' | 'start_encounter'

export interface ActionPlanStep {
  id: string
  toolName: ActionPlanToolName
  input: Record<string, unknown>
  action?: Record<string, unknown>
  reason: string
  dependsOnPreviousSuccess?: boolean
  targetResolution?: WorldActionTargetResolution
}

export interface ActionPlanBlocked {
  code: string
  reason: string
  candidates?: string[]
}

export interface ActionPlan {
  id: string
  source: ActionPlanSource
  reason: string
  steps: ActionPlanStep[]
  targetResolution?: WorldActionTargetResolution | null
  blocked?: ActionPlanBlocked
}

const TRAVERSAL_ACTION_KINDS = new Set(['open', 'unlock', 'force'])

function canonicalPlayerActionInput(action: Record<string, unknown>): Record<string, unknown> {
  return { action }
}

function wantsPortalTraversal(message: string): boolean {
  const text = normalizeFrenchText(message)
  return /\b(pousses?|pousser|rentres?|rentrer|entres?|entrer|franchis|franchir|passes?|passer|traverses?|traverser|dedans|interieur|a l interieur|dans le batiment|boulangerie)\b/.test(text)
}

function withoutTraverse(action: Record<string, unknown>): Record<string, unknown> {
  const copy = { ...action }
  delete copy.traverse
  return copy
}

function actionKind(action: Record<string, unknown>): string | null {
  return typeof action.kind === 'string' ? action.kind : null
}

function normalizedObjectHaystack(object: Pick<SceneSurfaceObject, 'id' | 'name' | 'aliases' | 'tags'>): string {
  return [object.id, object.name, ...(object.aliases ?? []), ...(object.tags ?? [])]
    .map(normalizeFrenchText)
    .join(' ')
}

function objectMatchesTargetName(object: SceneSurfaceObject, targetName: string): boolean {
  const target = normalizeFrenchText(targetName)
  const haystack = normalizedObjectHaystack(object)
  return haystack.includes(target) || target.includes(normalizeFrenchText(object.name))
}

function uniquePortalObject(
  message: string,
  gameState: GameState,
  kind: GameActionKind,
  action: Record<string, unknown>
): { object?: SceneSurfaceObject; ambiguous?: SceneSurfaceObject[] } {
  const surface = buildSceneSurface(gameState)
  const targetName = typeof action.targetName === 'string' ? action.targetName : undefined
  const portalObjects = surface.objects.filter(object => object.portal?.otherRoomIds.length)
  const targetKind = (TRAVERSAL_ACTION_KINDS.has(kind) ? kind : 'open') as CanonicalPlayerActionKind

  const byTargetName = targetName
    ? portalObjects.filter(object => objectMatchesTargetName(object, targetName))
    : []
  if (byTargetName.length === 1) return { object: byTargetName[0] }
  if (byTargetName.length > 1) return { ambiguous: byTargetName }

  const directIds = new Set(
    findSceneTargetsByText(surface, targetName ?? message, 'object', targetKind)
      .map(target => target.id)
  )
  const byText = portalObjects.filter(object => directIds.has(object.id))
  if (byText.length === 1) return { object: byText[0] }
  if (byText.length > 1) return { ambiguous: byText }

  const affordedPortalObjects = portalObjects.filter(object =>
    object.actionKinds.includes(targetKind) ||
    (targetKind !== 'open' && object.actionKinds.includes('open'))
  )
  if (affordedPortalObjects.length === 1) return { object: affordedPortalObjects[0] }
  if (affordedPortalObjects.length > 1) return { ambiguous: affordedPortalObjects }

  if (portalObjects.length === 1) return { object: portalObjects[0] }
  if (portalObjects.length > 1) return { ambiguous: portalObjects }

  return {}
}

function portalDestinationRoomId(object: SceneSurfaceObject): string | null {
  return object.portal?.otherRoomIds.length === 1 ? object.portal.otherRoomIds[0] : null
}

function buildMoveStep(destinationRoomId: string, dependsOnPreviousSuccess: boolean): ActionPlanStep | null {
  const toCell = centerCellForAdventureRoom(destinationRoomId)
  if (!toCell) return null
  const action = {
    kind: 'move',
    tokenId: 'player',
    toCell,
  }
  return {
    id: `move-to-room-${destinationRoomId}`,
    toolName: 'resolve_player_action',
    action,
    input: canonicalPlayerActionInput(action),
    reason: dependsOnPreviousSuccess
      ? `Franchir le portail vers la salle ${destinationRoomId} apres reussite de l'etape precedente.`
      : `Franchir le portail deja ouvert vers la salle ${destinationRoomId}.`,
    ...(dependsOnPreviousSuccess ? { dependsOnPreviousSuccess: true } : {}),
  }
}

function buildSingleStepPlan(
  id: string,
  source: ActionPlanSource,
  reason: string,
  action: Record<string, unknown>,
  targetResolution?: WorldActionTargetResolution | null,
  blocked?: ActionPlanBlocked
): ActionPlan {
  return {
    id,
    source,
    reason,
    steps: [{
      id: `${id}-step-1`,
      toolName: 'resolve_player_action',
      action,
      input: canonicalPlayerActionInput(action),
      reason,
      ...(targetResolution ? { targetResolution } : {}),
    }],
    targetResolution,
    ...(blocked ? { blocked } : {}),
  }
}

function buildTraversalPlan(
  message: string,
  gameState: GameState,
  kind: GameActionKind,
  rawAction: Record<string, unknown>,
  targetResolution?: WorldActionTargetResolution | null
): ActionPlan {
  const firstAction = withoutTraverse(rawAction)
  const firstKind = actionKind(firstAction) ?? 'open'
  const portalTarget = uniquePortalObject(message, gameState, kind, rawAction)
  const candidates = portalTarget.ambiguous?.map(object => object.name)
  const blocked = candidates?.length
    ? {
        code: 'ACTION_PLAN_TARGET_AMBIGUOUS',
        reason: 'Plusieurs portails visibles peuvent correspondre a cette intention.',
        candidates,
      }
    : undefined

  const firstStep: ActionPlanStep = {
    id: `${firstKind}-portal`,
    toolName: 'resolve_player_action',
    action: firstAction,
    input: canonicalPlayerActionInput(firstAction),
    reason: 'Resoudre la manipulation du portail comme mutation moteur canonique.',
    ...(targetResolution ? { targetResolution } : {}),
  }

  const destinationRoomId = portalTarget.object ? portalDestinationRoomId(portalTarget.object) : null
  const portalAlreadyTraversable = portalTarget.object?.opened === true && portalTarget.object.locked !== true
  const moveStep = destinationRoomId ? buildMoveStep(destinationRoomId, !portalAlreadyTraversable) : null
  const steps = moveStep
    ? portalAlreadyTraversable
      ? [moveStep]
      : [firstStep, moveStep]
    : [firstStep]

  return {
    id: moveStep
      ? portalAlreadyTraversable
        ? 'move-through-open-portal'
        : `${firstKind}-then-move`
      : `${firstKind}-portal-blocked`,
    source: 'portal_traversal',
    reason: moveStep
      ? portalAlreadyTraversable
        ? 'Intention de franchissement: le portail est deja ouvert, le plan devient un deplacement canonique.'
        : 'Intention composite: manipuler un portail puis le franchir seulement si la mutation reussit.'
      : 'Intention de franchissement sans destination unique; le moteur doit refuser ou demander une cible.',
    steps,
    targetResolution,
    ...(blocked ? { blocked } : {}),
  }
}

export function buildActionPlan(
  message: string,
  gameState: GameState,
  kind: GameActionKind
): ActionPlan | null {
  if (kind === 'move') {
    const portalAction = buildPortalTraversalActionInput(message, gameState) ??
      (wantsPortalTraversal(message) ? { kind: 'open', traverse: true } : null)
    if (!portalAction) return null
    const targetResolution = resolveWorldActionTargets(message, gameState, 'open')
    return buildTraversalPlan(message, gameState, 'open', portalAction, targetResolution)
  }

  const worldAction = buildWorldActionInput(message, gameState, kind)
  if (!worldAction) return null

  const targetResolution = resolveWorldActionTargets(message, gameState, kind)
  if (worldAction.traverse === true && TRAVERSAL_ACTION_KINDS.has(actionKind(worldAction) ?? '')) {
    return buildTraversalPlan(message, gameState, kind, worldAction, targetResolution)
  }

  return buildSingleStepPlan(
    `${actionKind(worldAction) ?? 'world'}-single`,
    'world_action',
    'Action monde canonique resolue en une etape moteur.',
    worldAction,
    targetResolution
  )
}

export function summarizeActionPlanForDebug(plan: ActionPlan): Record<string, unknown> {
  return {
    id: plan.id,
    source: plan.source,
    reason: plan.reason,
    blocked: plan.blocked,
    targetResolution: plan.targetResolution,
    steps: plan.steps.map(step => ({
      id: step.id,
      toolName: step.toolName,
      action: step.action,
      targetResolution: step.targetResolution,
      dependsOnPreviousSuccess: Boolean(step.dependsOnPreviousSuccess),
      reason: step.reason,
    })),
  }
}
