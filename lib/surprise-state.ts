import { z } from 'zod'
import type { GameState } from './types'
import { firstMapId } from './adventure-map'

export const CombatSurpriseInputSchema = z.object({
  surprisedIds: z.array(z.string().min(1).max(180)).max(128),
  reason: z.string().trim().min(1).max(1000),
}).strict()
export type CombatSurpriseInput = z.infer<typeof CombatSurpriseInputSchema>

/** Encounter roster indices identify participants before real IDs are spawned.
 * This is a decision supplied by the MJ, never a stealth/perception roll. */
export const EncounterSurpriseInputSchema = z.object({
  playerSurprised: z.boolean(),
  surprisedMonsterIndices: z.array(z.number().int().nonnegative()).max(128),
  reason: z.string().trim().min(1).max(1000),
}).strict().refine(input => input.surprisedMonsterIndices.length + Number(input.playerSurprised) <= 128,
  'At most 128 selected surprised participants, including the player.')
export type EncounterSurpriseInput = z.infer<typeof EncounterSurpriseInputSchema>

export const SurpriseStateSchema = z.object({
  combatGeneration: z.number().int().positive(),
  mapId: z.string().min(1),
  reason: z.string().trim().min(1).max(1000),
  actors: z.record(z.string(), z.object({ firstTurnEnded: z.boolean() }).strict()),
}).strict()
export type SurpriseState = z.infer<typeof SurpriseStateSchema>

/** Surprise ends on this actor's first completed turn, never on a clock tick,
 * the first actor's turn, or the beginning of the surprised actor's turn. */
export function isSurprised(state: GameState, actorId: string): boolean {
  const surprise = state.dmTools?.surprise
  return Boolean(state.phase === 'combat' && surprise
    && surprise.combatGeneration === state.combatGeneration
    && surprise.mapId === (state.currentMapId ?? firstMapId(state))
    && Object.hasOwn(surprise.actors, actorId) && !surprise.actors[actorId].firstTurnEnded)
}

/** A saved decision belongs to its original encounter. Do not rebase it onto
 * another combat/map, or silently manufacture first-turn completion on load. */
export function validateSurpriseState(state: GameState): { valid: boolean; errors: string[] } {
  const surprise = state.dmTools?.surprise, errors: string[] = []
  if (!surprise) return { valid: true, errors }
  if (state.phase !== 'combat' || surprise.combatGeneration !== state.combatGeneration
    || surprise.mapId !== (state.currentMapId ?? firstMapId(state)))
    errors.push('The saved surprise decision must match its actual combat generation and map.')
  for (const actorId of Object.keys(surprise.actors)) {
    if (actorId !== 'player' && !state.monsters[actorId])
      errors.push(`The surprised actor ${actorId} must remain in the saved combat state.`)
    const legitimatelyRemoved = actorId === 'player'
      ? Boolean(state.player.deathSaves?.dead || state.player.deathSaves?.stable)
      : state.monsters[actorId]?.isAlive === false
    if (!state.initiativeOrder.includes(actorId) && !legitimatelyRemoved)
      errors.push(`The surprised actor ${actorId} must belong to the saved initiative roster.`)
  }
  return { valid: !errors.length, errors }
}
