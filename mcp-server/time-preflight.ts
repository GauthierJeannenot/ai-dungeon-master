import { encounterCadenceTimeIssue } from '../lib/encounter-cadence-state'
import { assertCackleTimeAdvance } from './cackle-fever'
import { chaseTransitionIssue } from '../lib/chase-state'
import { xgeFallingTransitionIssue } from '../lib/xge-falling-state'
import { assertSleepTimeAdvance } from './sleep'
import { swallowTurnIssue } from '../lib/swallow-state'
import { nativeFlightFallIssue } from '../lib/native-flight-geometry'
import { jumpingDueIssue } from '../lib/jumping-state'
import { locomotionPhysicalIssue } from '../lib/locomotion-geometry'
import { assertWeaponConsumableTimeAdvance } from './weapon-consumables'
import { assertSurvivalTimeAdvance } from './survival'
import { assertPetrifiedAfflictionHistory } from './afflictions'
import { assertSewerPlagueTimeAdvance } from './sewer-plague'
import { assertPetrifiedSpriteHistory } from './petrified-sprite-effects'
import { assertKnockoutTimeAdvance } from './nonlethal'
import { assertNpcLifeTimeAdvance } from './npc-life'
import { assertBreathingTimeAdvance } from './breathing'
import { assertSuffocationPlayerTimeAdvance } from './suffocation-player'
import { assertPlayerRecoveryTimeAdvance } from './player-recovery'
import { travelDueIssue } from '../lib/travel-state'
import { RuleViolation } from './rules'
import * as gs from './game-state'
import { assertPlayerLifeTimeAdvance } from './player-life'
import { assertWeatherTimeAdvance } from './weather'
import { assertFrigidWaterTimeAdvance } from './frigid-water'
import { assertOilTimeAdvance } from './oil-ground'
import { groundGearContactDueIssue } from '../lib/ground-gear-state'

/** Real fictional time only; costs and dice must follow this preflight. Combat
 * round ticks keep their separate source-driven fire tick and nutrition gate. */
export function assertGameTimeAdvance(seconds: number) {
  const cadence=encounterCadenceTimeIssue(gs.getState(),seconds);if(cadence)throw new RuleViolation(cadence.code,cadence.message,cadence)
  assertCackleTimeAdvance(seconds)
  if(seconds>0){const chase=chaseTransitionIssue(gs.getState());if(chase)throw new RuleViolation('CHASE_ACTUAL_TURNS_REQUIRED','Advance the actual chase only through its explicit source turn events, not arbitrary clock time.',{})}
  if(seconds>0){const xge=xgeFallingTransitionIssue(gs.getState());if(xge)throw new RuleViolation('XGE_FALL_ACTUAL_TURNS_REQUIRED','Only the actual source turn boundaries advance this ongoing fall; no arbitrary clock duration descends500ft.',{})}
  assertSewerPlagueTimeAdvance(seconds)
  assertSleepTimeAdvance(seconds)
  if(seconds>0){const swallowed=swallowTurnIssue(gs.getState());if(swallowed)throw new RuleViolation(swallowed.code,swallowed.message,{})}
  const nativeFall=seconds>0?nativeFlightFallIssue(gs.getState()):null;if(nativeFall)throw new RuleViolation(nativeFall.code,nativeFall.message,{entityId:nativeFall.entityId})
  const physicalIssue=seconds>0?locomotionPhysicalIssue(gs.getState()):null
  if(physicalIssue)throw new RuleViolation(physicalIssue.code,physicalIssue.message,{entityId:physicalIssue.entityId,mediumId:physicalIssue.mediumId})
  const gearIssue=seconds>0?groundGearContactDueIssue(gs.getState()):null;if(gearIssue)throw new RuleViolation(gearIssue.code,gearIssue.message,{contactIds:gearIssue.contactIds})
  const jumpIssue=seconds>0?jumpingDueIssue(gs.getState()):null;if(jumpIssue)throw new RuleViolation(jumpIssue.code,jumpIssue.message,{})
  assertOilTimeAdvance(seconds)
  assertWeatherTimeAdvance(seconds)
  assertFrigidWaterTimeAdvance(seconds)
  const travelIssue = seconds > 0 ? travelDueIssue(gs.getState()) : null
  if (travelIssue) throw new RuleViolation(travelIssue.code, travelIssue.message, { eventId: travelIssue.eventId })
  assertPetrifiedAfflictionHistory()
  assertPetrifiedSpriteHistory()
  assertKnockoutTimeAdvance(seconds)
  assertNpcLifeTimeAdvance(seconds)
  assertBreathingTimeAdvance(seconds)
  assertSuffocationPlayerTimeAdvance(seconds)
  assertPlayerRecoveryTimeAdvance(seconds)
  assertPlayerLifeTimeAdvance(seconds)
  assertWeaponConsumableTimeAdvance(seconds)
  assertSurvivalTimeAdvance(seconds)
}
