import { socialActors } from '../lib/social'
import * as gs from './game-state'
import { getMapSpec } from '../lib/adventure-map'
import { RuleViolation } from './rules'
import { playerSeesCell } from '../lib/scene-perception'

export function requireSocialTarget(targetId: string) {
  const state = gs.getState(), actor = socialActors(state).find(actor => actor.targetId === targetId)
  if (!actor) throw new RuleViolation('SOCIAL_TARGET_UNKNOWN', 'Choose an exact social targetId from the local reference.', { targetId })
  if (!actor.alive) throw new RuleViolation('SOCIAL_TARGET_DEAD', 'Cannot influence a dead creature.', { targetId })
  if (actor.mapId !== getMapSpec(state.currentMapId, state).id
    || actor.roomId !== null && actor.roomId !== state.currentRoomId && !playerSeesCell(state, actor.position)) {
    throw new RuleViolation('SOCIAL_TARGET_UNREACHABLE', 'The target must be in the current room or in direct line of sight on the current map.', { targetId })
  }
  if (!actor.profile.influenceable) throw new RuleViolation('SOCIAL_TARGET_UNINFLUENCEABLE',
    actor.profile.refusalReason ?? 'Campaign rule: this creature cannot be socially influenced.', { targetId })
  return actor
}

export function socialCheckContext(targetId: string, baseDc: number) {
  requireSocialTarget(targetId)
  return { targetId, baseDc, dcModifier: 0, policy: 'standard2014' as const }
}
