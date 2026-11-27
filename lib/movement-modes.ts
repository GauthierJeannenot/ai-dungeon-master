import { dashMovementMultiplier,chaseWildernessSpeedMultiplier } from './chase-state'
import { activeXgeFall } from './xge-falling-state'
import { groundGearWalkingPenalty,groundGearStoppedThisTurn } from './ground-gear-state'
import type { GameState } from './types'
import { armorAdjustedSpeed } from './armor-penalties'
import { exhaustionSpeed } from './exhaustion'

/** PHB2014 pp.182,190–192; all values here are costs, never chosen destinations. */
export const MOVEMENT_MODES_SOURCE = { book: 'phb-2014', sections: ['Climbing, Swimming, and Crawling', 'Being Prone', 'Dash'] } as const

export class MovementModeError extends Error {
  constructor(public code: string, message: string) { super(message) }
}
const fail = (code: string, message: string): never => { throw new MovementModeError(code, message) }

/** The caller supplies the already resolved 5/10-foot diagonal distance. Extra
 * costs add per foot: crawling through difficult terrain costs three, not four. */
export function movementStepCostBreakdown(distanceCells: number, facts: { difficult?: boolean; crawling?: boolean; specialMode?:boolean;nativeModeSpeed?:boolean } = {}) {
  if (!Number.isFinite(distanceCells) || distanceCells < 0) fail('MOVEMENT_DISTANCE_INVALID', 'Movement distance must be a finite nonnegative number of five-foot cost units.')
  const difficultExtraCells = facts.difficult ? distanceCells : 0
  const crawlingExtraCells = facts.crawling ? distanceCells : 0
  const specialExtraCells=facts.specialMode&&!facts.nativeModeSpeed?distanceCells:0
  return { distanceCells, difficultExtraCells, crawlingExtraCells,...(facts.specialMode?{specialExtraCells}:{}),
    totalCells: distanceCells + difficultExtraCells + crawlingExtraCells+specialExtraCells }
}

export function actorMovementStepCost(state: GameState, actorId: string, distanceCells: number,
  difficult = false, options: { ignoreActorEffects?: boolean } = {}) {
  const actor = actorId === 'player' ? state.player : state.monsters[actorId]
  // Scripted reactive NPCs have no creature posture; do not invent one.
  return movementStepCostBreakdown(distanceCells, {
    difficult, crawling: !options.ignoreActorEffects && Boolean(actor?.conditions.includes('prone')),
  })
}

/** Speed and movement allowance are deliberately distinct. Dash increases the
 * allowance by the modified speed; it does not double standing-up's price. */
export function movementSpeedProfile(state: GameState, actorId: string, baseSpeed?: number) {
  const actor = actorId === 'player' ? state.player : state.monsters[actorId]
  if (!actor) fail('ENTITY_NOT_FOUND', 'Choose an existing creature with a real movement profile.')
  if (actor!.conditions.includes('exhaustion') && !state.dmTools?.exhaustion?.creatures[actorId])
    fail('EXHAUSTION_LEVEL_REQUIRED', 'Supply the authoritative level of legacy exhaustion before movement.')
  const effects = state.hero?.effects.filter(effect => effect.targetIds.includes(actorId)
    && effect.expiresAt > (state.worldTimeSeconds ?? 0)) ?? []
  const dashActive = effects.some(effect => effect.kind === 'dash')
  const sourceSpeed = baseSpeed ?? actor!.speed
  if (!Number.isFinite(sourceSpeed) || sourceSpeed < 0) fail('MOVEMENT_SPEED_INVALID', 'A nonnegative finite source speed is required.')
  const immobile = actor!.hp.current <= 0 || actor!.conditions.some(condition =>
    ['grappled', 'restrained', 'incapacitated', 'paralyzed', 'petrified', 'stunned', 'unconscious'].includes(condition))
    || effects.some(effect => effect.data.speedZero === true || effect.kind === 'bear-trap')
  const slowed = Math.max(0, sourceSpeed - (effects.some(effect => effect.kind === 'ray-of-frost') ? 10 : 0) - (baseSpeed===undefined?groundGearWalkingPenalty(state,actorId):0))
  const speedFeet = immobile ? 0 : exhaustionSpeed(state, actorId, armorAdjustedSpeed(state, actorId, slowed)) * chaseWildernessSpeedMultiplier(state,actorId)
  return { speedFeet, budgetFeet: speedFeet * dashMovementMultiplier(state,actorId), dashActive }
}

/** Whole-cell engine policy rounds the half-speed debit up and allowance down.
 * At speed 15 ft., the 7.5-ft. cost therefore occupies two 5-ft. cost cells. */
export function standingMovementCostCells(speedFeet: number) {
  if (!Number.isFinite(speedFeet) || speedFeet < 0) fail('MOVEMENT_SPEED_INVALID', 'A nonnegative finite speed is required.')
  return Math.ceil(speedFeet / 10)
}

/** Read-only preflight. Public action/timing validation remains with the caller;
 * commit both movement debit and prone removal only after this returns. */
export function assertStandingMovement(state: GameState, actorId: string) {
  if(activeXgeFall(state,actorId))fail('XGE_FALL_RECOVERY_REQUIRED','An actual falling body cannot stand on a phantom floor; use the adopted source midair recovery if really eligible.')
  if(groundGearStoppedThisTurn(state,actorId))fail('CALTROPS_MOVEMENT_STOPPED','The actual source stop lasts through this global turn; standing does not grant a new movement decision.')
  const actor = actorId === 'player' ? state.player : state.monsters[actorId]
  if (!actor) fail('ENTITY_NOT_FOUND', 'Choose an existing creature.')
  if (!actor!.conditions.includes('prone')) fail('NOT_PRONE', 'The creature is not prone.')
  const profile = movementSpeedProfile(state, actorId)
  if (!profile.speedFeet) fail('SPEED_ZERO', 'A creature with zero speed cannot stand up.')
  const costCells = standingMovementCostCells(profile.speedFeet)
  const remainingCells = Math.max(0, Math.floor(profile.budgetFeet / 5) - (state.movementUsed[actorId] ?? 0))
  if (remainingCells < costCells) fail('MOVEMENT_EXCEEDED', 'Standing needs half the modified speed worth of remaining movement.')
  return { actorId, ...profile, costCells, remainingCells }
}
