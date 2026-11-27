import { initialDmToolState } from '../lib/dm-tool-state'
import { firstMapId } from '../lib/adventure-map'
import { CombatSurpriseInputSchema, EncounterSurpriseInputSchema, isSurprised, validateSurpriseState, type CombatSurpriseInput, type EncounterSurpriseInput } from '../lib/surprise-state'
import * as gs from './game-state'
import { RuleViolation } from './rules'
import { isKnockedOut } from '../lib/nonlethal-state'

/** Pure validation against the exact selected preset roster, before spawning
 * or generating IDs. No absent index is completed or replaced. */
export function validateEncounterSurprise(monsterCount: number, input?: EncounterSurpriseInput): void {
  if(input===undefined)return
  if(!EncounterSurpriseInputSchema.safeParse(input).success)
    throw new RuleViolation('SURPRISE_SELECTION_INVALID','Supply playerSurprised, exact surprisedMonsterIndices and an established reason.',{})
  if(new Set(input.surprisedMonsterIndices).size!==input.surprisedMonsterIndices.length)
    throw new RuleViolation('DUPLICATE_SURPRISED_ACTOR','Each encounter monster index must be selected once.',{})
  for(const monsterIndex of input.surprisedMonsterIndices)if(monsterIndex>=monsterCount)
    throw new RuleViolation('SURPRISED_ACTOR_NOT_IN_COMBAT','Choose an exact zero-based index from the inspected encounter roster.',{monsterIndex,monsterCount})
}

/** Deterministic identity mapping of the already validated MJ choices. */
export function encounterCombatSurprise(spawnedIds: string[], input?: EncounterSurpriseInput): CombatSurpriseInput | undefined {
  if(!input)return undefined
  validateEncounterSurprise(spawnedIds.length,input)
  return {surprisedIds:[...(input.playerSurprised?['player']:[]),...input.surprisedMonsterIndices.map(index=>spawnedIds[index])],reason:input.reason.trim()}
}

/** Pure preflight for enter_combat: call before phase, initiative dice or any
 * other mutation. The AI/MJ makes the explicit surprise decision. */
export function validateCombatSurprise(combatants: string[], input?: CombatSurpriseInput): void {
  if (gs.getState().hero?.pending)
    throw new RuleViolation('REACTION_PENDING', 'Resolve the held roll before starting combat.', {})
  if (input === undefined) return
  if (!CombatSurpriseInputSchema.safeParse(input).success)
    throw new RuleViolation('SURPRISE_SELECTION_INVALID', 'Choose explicit surprisedIds and an established reason.', {})
  if (new Set(input.surprisedIds).size !== input.surprisedIds.length)
    throw new RuleViolation('DUPLICATE_SURPRISED_ACTOR', 'Each surprised participant must be selected once.', {})
  for (const actorId of input.surprisedIds) if (!combatants.includes(actorId) || !gs.getEntity(actorId))
    throw new RuleViolation('SURPRISED_ACTOR_NOT_IN_COMBAT', 'Only an exact participant in this new combat may be surprised.', { actorId })
}

/** Install after initiative dice and immediately before setInitiativeOrder,
 * whose generation increment precedes every start-of-turn hook. The preflight
 * must already have succeeded. No action, resource or reaction is spent. */
export function initializeCombatSurprise(input?: CombatSurpriseInput): void {
  const state = gs.getState()
  if (!input) { clearCombatSurprise(); return }
  state.dmTools ??= initialDmToolState()
  state.dmTools.surprise = {
    combatGeneration: (state.combatGeneration ?? 0) + 1,
    mapId: state.currentMapId ?? firstMapId(state), reason: input.reason.trim(),
    actors: Object.fromEntries(input.surprisedIds.map(id => [id, { firstTurnEnded: false }])),
  }
}

export function assertSurpriseCanAct(actorId: string): void {
  const validation = validateSurpriseState(gs.getState())
  if (!validation.valid)
    throw new RuleViolation('SURPRISE_STATE_MISMATCH', validation.errors[0], {})
  if (isSurprised(gs.getState(), actorId))
    throw new RuleViolation('ACTOR_SURPRISED', 'A surprised participant cannot move, take actions or bonus actions, or react until its first turn ends.', { actorId })
}

/** Commit only after the actual current actor's first turn-ending events.
 * It never resets reaction expenditure: availability uses the normal budget. */
export function completeSurpriseTurn(actorId: string): void {
  const state = gs.getState()
  if (state.hero?.pending || state.currentTurn !== actorId || !isSurprised(state, actorId)) return
  state.dmTools!.surprise!.actors[actorId].firstTurnEnded = true
}

/** A living KO keeps its initiative slot but its empty turn is skipped. Call
 * only while actually traversing that slot, never on heal, preview or load.
 * This acknowledges the first turn's end without creating any turn effects. */
export function completeSkippedKnockoutSurpriseTurn(actorId: string): void {
  const state = gs.getState(), monster = gs.getMonster(actorId)
  if (state.hero?.pending || !monster || !isKnockedOut(monster) || !isSurprised(state, actorId)) return
  state.dmTools!.surprise!.actors[actorId].firstTurnEnded = true
}

export function clearCombatSurprise(): void {
  if (gs.getState().dmTools) delete gs.getState().dmTools!.surprise
}

export function removeSurpriseActor(actorId: string): void {
  const surprise = gs.getState().dmTools?.surprise
  if (surprise) delete surprise.actors[actorId]
}
