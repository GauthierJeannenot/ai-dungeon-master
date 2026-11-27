import { activeXgeFall,xgeFallingStateOf } from '../lib/xge-falling-state'
import { currentFallingDamage,projectedXgeFallLanding } from '../lib/xge-falling-geometry'
import { actualNativeFlightLocation } from '../lib/native-flight-state'
import { projectNativeFlightFall } from '../lib/native-flight-geometry'
import { actualLocomotionLocation } from '../lib/locomotion-state'
import { projectLocomotionFall } from '../lib/locomotion-geometry'
import { jumpingStateOf } from '../lib/jumping-state'
import { prepareGroundGearStep,groundGearMovementIssue,recordGroundGearContact } from './ground-gear-contacts'
import { oilGroundContactIssue,onOilGroundContact } from './oil-ground'
import * as gs from './game-state'
import { available } from './hero-rules'
import { rollDice } from './dice'
import { dealDamage } from './monster-rules'
import { assertKnockoutDamageSupported } from './nonlethal'
import { assertPetrifiedSpriteHistory } from './petrified-sprite-effects'
import { toolkitError, toolkitState } from './toolkit'
import { assertWeatherFall,completeWeatherFall } from './weather-flight'

export interface FallInput {
  eventId: string; entityId: string; distanceFeet: number; reason: string
}

/** The MJ establishes the completed fall. This does not invent an altitude,
 * move a creature, or decide that walking/flying caused a fall. */
export function resolveFall(input: FallInput, internalJumpId?:string,internalLocomotionSurfaceId?:string,internalNativeFlightSurfaceId?:string,internalXgeEpisodeId?:string) {
  const state = gs.getState()
  const receipts = state.dmTools?.falls?.receipts
  const previous = receipts && Object.hasOwn(receipts, input.eventId) ? receipts[input.eventId] : undefined
  if (previous) {
    if (previous.entityId !== input.entityId || previous.distanceFeet !== input.distanceFeet || previous.reason !== input.reason)
      toolkitError('FALL_EVENT_CONFLICT', 'This fall event already has a different immutable definition.')
    return { ...previous.result, alreadyApplied: true }
  }
  if(internalJumpId&&jumpingStateOf(state)?.activeJumpId!==internalJumpId)toolkitError('JUMP_FALL_CONTEXT_CHANGED','The actual interrupted jump must still match before its completed fall.')
  if(activeXgeFall(state,input.entityId)&&!internalXgeEpisodeId)toolkitError('XGE_FALL_ONGOING_REQUIRED','The actual source cursor owns this fall; a second completed-fall declaration cannot apply damage or skip its remaining descent.')
  const xge=internalXgeEpisodeId?activeXgeFall(state,input.entityId):undefined
  if(internalXgeEpisodeId&&(!xge||xge.input.eventId!==internalXgeEpisodeId||input.distanceFeet!==xge.initialPoint.zFeet-xge.landingZFeet))toolkitError('XGE_FALL_IMPACT_CONTEXT_CHANGED','Keep the exact actual source episode and full measured fall for its one impact.')
  if(!internalXgeEpisodeId&&xgeFallingStateOf(state)?.policy?.input.rate500&&input.distanceFeet>500)toolkitError('XGE_FALL_ONGOING_REQUIRED','The explicitly adopted rate requires begin_xge_fall and actual later turns for a fall over500ft; this completed-fall tool cannot skip them.')
  const locomotion=actualLocomotionLocation(state,input.entityId),locomotionFall=internalLocomotionSurfaceId?projectLocomotionFall(state,input.entityId,internalLocomotionSurfaceId):undefined
  if(locomotionFall?.issue)toolkitError(locomotionFall.issue.code,locomotionFall.issue.message)
  const nativeLocation=actualNativeFlightLocation(state,input.entityId),nativeFall=internalNativeFlightSurfaceId?projectNativeFlightFall(state,input.entityId,internalNativeFlightSurfaceId):undefined
  if(nativeLocation?.airborne&&!nativeFall)toolkitError('NATIVE_FLIGHT_FALL_SUPPORT_REQUIRED','Choose complete_native_flight_fall with its exact real lower supporting surface; this generic fall cannot invent a landing.')
  if(nativeFall?.issue)toolkitError(nativeFall.issue.code,nativeFall.issue.message)
  if(nativeFall&&nativeFall.distanceFeet!==input.distanceFeet)toolkitError('NATIVE_FLIGHT_FALL_DISTANCE_CHANGED','Retain the actual descent to the exact selected real support.')
  available({...(nativeFall?.locationWitness?{allowNativeFlightFall:{entityId:input.entityId,locationWitness:nativeFall.locationWitness}}:{}),allowJumpDue:Boolean(internalJumpId),...(locomotionFall?.locationWitness?{allowLocomotionFall:{entityId:input.entityId,locationWitness:locomotionFall.locationWitness}}:{})})
  if(!nativeFall)assertWeatherFall(input.entityId,input.distanceFeet)
  const target = gs.getEntity(input.entityId)
  if (!target) toolkitError('ENTITY_NOT_FOUND', 'Choose an actual creature on the active map.')
  if ('isAlive' in target! ? !target!.isAlive : target!.deathSaves?.dead)
    toolkitError('FALL_TARGET_DEAD', 'A corpse has no living-creature fall resolution.')
  if (Object.keys(state.dmTools?.falls?.receipts ?? {}).length >= 512)
    toolkitError('FALL_EVENT_LIMIT', 'This session has reached its fall receipt capacity.')
  if(locomotion&&(!locomotionFall||locomotionFall.issue))toolkitError('LOCOMOTION_FALL_SUPPORT_REQUIRED','Use complete_locomotion_fall with the actual existing lower support; an old XY fall cannot invent a landing for this real swimming/suspended body.')
  if(locomotionFall&&locomotionFall.distanceFeet!==input.distanceFeet)toolkitError('LOCOMOTION_FALL_DISTANCE_CHANGED','The completed fall must retain the actual measured descent to its chosen support.')
  const landingWitness=!internalJumpId?prepareGroundGearStep(state,input.entityId,'landing'):undefined
  const projected=nativeFall?.state??locomotionFall?.state??(xge?projectedXgeFallLanding(state,input.entityId,xge.input.landingSurfaceId):structuredClone(state)),flight=projected.dmTools?.weather?.flights[input.entityId];if(flight?.airborne){flight.airborne=false;flight.heightFeet=0}const oilIssue=oilGroundContactIssue(projected,input.entityId)??(!internalJumpId?groundGearMovementIssue(projected,input.entityId,'landing',landingWitness):null);if(oilIssue)toolkitError(oilIssue.code,oilIssue.message)
  const optionalProfile=currentFallingDamage(state,input.entityId,input.distanceFeet,xge?.flyingCreatureOption??xgeFallingStateOf(state)?.policy?.input.flyingCreatureOption??false)
  const diceCount = optionalProfile.diceCount
  if (diceCount > 0) {
    assertPetrifiedSpriteHistory()
    assertKnockoutDamageSupported(target!, diceCount * 6)
  }
  const roll = diceCount ? rollDice(`${diceCount}d6`) : undefined
  const damageResolution = roll ? dealDamage(input.entityId, roll.total, 'bludgeoning') : undefined
  const tookDamage = (damageResolution?.damageDealt ?? 0) > 0
  const prone = tookDamage ? gs.applyCondition(input.entityId, 'prone', { deferReconcile: true }) : undefined
  const result = { groundGearContactIds:[] as string[], eventId: input.eventId, entityId: input.entityId, distanceFeet: input.distanceFeet,
    diceCount, optionalProfile, roll, damageResolution, landedProne: target!.conditions.includes('prone'),
    proneApplied: prone?.applied ?? false,
    source: 'PHB 2014 Falling; rules/books/phb-2014.md:5360',
    notice: 'Completed established fall only. No movement, elapsed time, action, altitude or optional falling rule was inferred.' }
  const falls = toolkitState().falls ??= { receipts: {} }
  falls.receipts[input.eventId] = { ...input, mapId: state.currentMapId ?? '', at: state.worldTimeSeconds ?? 0, result }
  if(locomotionFall?.state){const actual=state.dmTools!.jumping!,planned=locomotionFall.state.dmTools!.jumping!;delete actual.locomotion!.locations[input.entityId];actual.supports[input.entityId]=planned.supports[input.entityId]}
  if(xge)gs.commitXgeFallLanding(input.entityId,xge.input.landingSurfaceId,xge.input.eventId)
  if(nativeFall)gs.commitNativeFlightFallLanding(input.entityId,internalNativeFlightSurfaceId!,input.eventId)
  completeWeatherFall(input.entityId)
  if(!internalJumpId){onOilGroundContact(input.entityId);const contact=recordGroundGearContact(input.entityId,'landing',landingWitness);if(contact)result.groundGearContactIds=[contact.id]}
  gs.addLogEntry({ round: state.round, turn: input.entityId, action: 'Chute Ã©tablie',
    mechanicalDetail: `${input.reason} | ${input.distanceFeet} ft | ${roll?.detail ?? '0 dÃ©gÃ¢ts'} | ${damageResolution?.damageDealt ?? 0} dÃ©gÃ¢ts contondants` })
  return result
}
