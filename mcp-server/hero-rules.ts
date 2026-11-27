import { finishRobeTurn } from '../lib/charged-item-state'
import { complexTrapSlot, complexTrapTurnIssue } from '../lib/complex-trap-initiative'
import { cleavingActionIssue } from '../lib/cleaving-state'
import { reconcileSacredRiteAwards } from './sacred-rites'
import { sacredRiteDueAwards } from '../lib/sacred-rites-state'
import { assertCackleEventsResolved, stageCackleTurn, stageCackleStress, preflightCackleLongRest, stageCackleLongRest } from './cackle-fever'
import { endLightEffectInState } from '../lib/light-spell-state'
import { chaseDashAdmissionIssue } from '../lib/chase-state'
import { chaseActionIssue } from '../lib/chase-state'
import { preflightChaseRestRecovery,recoverChaseRest } from './chase-rest'
import { recordActualChaseDash,reconcileWildernessChaseEffects } from './chases'
import { dashMovementMultiplier,chaseWildernessSpeedMultiplier } from '../lib/chase-state'
import { xgeFallingTurnIssue } from '../lib/xge-falling-state'
import { sleepDueIssue } from '../lib/sleep-state'
import { wakeNaturalSleeper,afterSleepLongRest,assertSleepTimeAdvance } from './sleep'
import { armoredLongRestHitDiceRecovery } from '../lib/srd/xge-sleep'
import { nativeFlightFallIssue } from '../lib/native-flight-geometry'
import { actualNativeFlightLocation } from '../lib/native-flight-state'
import { startTurnFireDueIssue } from '../lib/weapon-consumable-state'
import { locomotionPhysicalIssue } from '../lib/locomotion-geometry'
import { actualLocomotionLocation } from '../lib/locomotion-state'
import { swallowTurnIssue } from '../lib/swallow-state'
import { pendingGroundGearContacts } from '../lib/ground-gear-state'
import { clearActualFootwork } from './vertical-observations'
import { jumpingDueIssue } from '../lib/jumping-state'
import { groundGearContactDueIssue } from '../lib/ground-gear-state'
import type { Condition, DiceRollResult, EntityStats, PlayerState, MonsterState } from '../lib/types'
import { heroArmorClass, type HeroEffect } from '../lib/hero-state'
import { getCharacterTemplate } from '../lib/character-registry'
import { getSpell } from '../lib/srd/spells'
import { rollDice, getAbilityModifier } from './dice'
import * as gs from './game-state'
import * as rules from './rules'
import { savingThrow, monsterSource, endEffect, expireMonsterEffects } from './monster-rules'
import { canSee } from './monster-perception'
import { reconcileMagicItems } from './magic-items'
import { exhaustionSpeed } from '../lib/exhaustion'
import { armorAdjustedSpeed } from '../lib/armor-penalties'
import { persistedConditionTarget, persistedConditionExpirations, assertPersistedConditionRemoval, finishPersistedConditionRemoval } from './persisted-conditions'
import { isSurprised } from '../lib/surprise-state'
import { assertGameTimeAdvance } from './time-preflight'
import { adjustExhaustionHpMaximum } from './exhaustion'
import { assertSurvivalEventsResolved, assertSurvivalRestWindow, afterSurvivalLongRest, suspendSurvivalForDeath } from './survival'
import { preflightSewerPlagueLongRest, sewerPlagueHitDieHealing, stageSewerPlagueLongRest, symptomaticSewerPlague } from './sewer-plague'
import type { TemporaryHpDamageContext } from '../lib/temporary-hp-state'
import { absorbTemporaryHpDamage, reconcileTemporaryHp, temporaryHpLongRest } from './temporary-hp'
import { dueKnockoutRecoveries, type KnockoutRecoveryEvent } from './nonlethal'
import { startNpcDeathSaveTurn, dueNpcDeathSaveEvents } from './npc-life'
import { breathingClockExpirations, startBreathingTurn, assertBreathingRecoveryAllowed } from './breathing'
import { duePlayerStableRecovery, type PlayerNaturalRecoveryEvent } from './player-recovery'
import { startPlayerDyingTurn } from './player-life'
import { travelDueIssue } from '../lib/travel-state'
import { weatherDueIssue } from '../lib/weather-state'
import { frigidWaterDueIssue } from '../lib/frigid-water-state'
import { reconcileFrigidWaterPresence } from './frigid-water'
import { ownedPersonalSpellbooks } from '../lib/spellbooks-state'
import { spellbookStudySources } from './spellbooks'
import { weatherClockExpirations, syncWeatherClock } from './weather'
import { castingDueIssue, concentrationRemovedDuringCasting } from '../lib/casting-state'
import { reconcileCasting, assertCastingTurnEnd } from './casting'
import { netRestraintEffectRemoved,reconcileNets } from './nets'
import { reconcilePhysicalHandling } from './physical-handling'
import { assertNoRecordedRest, validateRecordedRestCompletion, takeUninterruptedRest, type RecordedRestCompletion } from './resting'
import { assertPetrifiedSpriteHistory, assertPetrifiedSpriteTransition } from './petrified-sprite-effects'
import { assertAfflictionEvents,assertAfflictionTurnOpen,reconcileAfflictions,afflictionHealingLimit,wakeAfflictionSleeper,afterAfflictionLongRest,assertAfflictionRestWindow,assertPetrifiedAfflictionHistory,assertPetrifiedAfflictionsTransition } from './afflictions'

export const strictHero = () => gs.getPlayer().ruleset === 'srd2014'
export const hero = () => gs.getState().hero!
export const now = () => gs.getState().worldTimeSeconds ?? 0
export const feature = (id: import('../lib/types').ClassFeatureId) => gs.getPlayer().features?.includes(id) ?? false
export const distance = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.max(Math.abs(a.x-b.x), Math.abs(a.y-b.y))
export function fail(code: string, message: string): never { throw new rules.RuleViolation(code, message, {}) }
export function assertHero(): void { if (!strictHero() || !gs.getState().hero) fail('SRD_PROFILE_REQUIRED', 'This tool requires a current SRD 2014 profile.') }
export function available(options: { allowComplexTrapEvent?:boolean;allowCleavingChoice?:string;allowChaseEvent?:boolean;allowCackleOnsetAt?:number; allowSewerOnsetAt?:number; allowSleepDue?:boolean; allowNativeFlightFall?:{entityId:string;locationWitness:string}; allowLocomotionFall?:{entityId:string;locationWitness:string}; allowGroundGearContactId?:string; allowJumpDue?: boolean; allowNutritionDue?: boolean; allowTravelDue?: boolean; allowCasting?: boolean; allowWeatherDue?: boolean; allowFrigidWaterDue?: boolean } = {}): void {
  assertHero()
  const trapTurn=complexTrapTurnIssue(gs.getState());if(trapTurn&&!options.allowComplexTrapEvent)fail(trapTurn.code,trapTurn.message)
  const cleaving=cleavingActionIssue(gs.getState(),options.allowCleavingChoice);if(cleaving)fail(cleaving.code,cleaving.message)
  assertCackleEventsResolved(options.allowCackleOnsetAt)
  if(!options.allowChaseEvent){const chase=chaseActionIssue(gs.getState());if(chase)fail(chase.code,chase.message)}
  const xge=xgeFallingTurnIssue(gs.getState());if(xge)fail(xge.code,xge.message)
  const sleepIssue=options.allowSleepDue?null:sleepDueIssue(gs.getState());if(sleepIssue)fail(sleepIssue.code,sleepIssue.message)
  const swallowIssue=swallowTurnIssue(gs.getState());if(swallowIssue)fail(swallowIssue.code,swallowIssue.message)
  const nativeException=options.allowNativeFlightFall,actualFlight=nativeException?actualNativeFlightLocation(gs.getState(),nativeException.entityId):undefined
  if(nativeException&&(!actualFlight||JSON.stringify(actualFlight)!==nativeException.locationWitness))fail('NATIVE_FLIGHT_FALL_CONTEXT_CHANGED','Retain the exact real falling native body and location.')
  const nativeFall=nativeFlightFallIssue(gs.getState());if(nativeFall&&(!nativeException||nativeFall.entityId!==nativeException.entityId))fail(nativeFall.code,nativeFall.message)
  const fireDue=startTurnFireDueIssue(gs.getState());if(fireDue)fail(fireDue.code,fireDue.message)
  const locomotionException=options.allowLocomotionFall,actualLocation=locomotionException?actualLocomotionLocation(gs.getState(),locomotionException.entityId):undefined
  if(locomotionException&&(!actualLocation||JSON.stringify(actualLocation)!==locomotionException.locationWitness))fail('LOCOMOTION_FALL_CONTEXT_CHANGED','Only the exact actual measured body position may complete this already established fall.')
  const physicalIssue=locomotionPhysicalIssue(gs.getState());if(physicalIssue&&!locomotionException)fail(physicalIssue.code,physicalIssue.message)
  const gear=pendingGroundGearContacts(gs.getState()),allowedGear=options.allowGroundGearContactId?gear.find(contact=>contact.id===options.allowGroundGearContactId):undefined
  if(options.allowGroundGearContactId&&!allowedGear)fail('GROUND_GEAR_CONTACT_REQUIRED','Only the exact actually pending physical gear contact may use its dedicated resolution guard.')
  if(gear.length&&!allowedGear)fail('GROUND_GEAR_CONTACT_DUE','Resolve the actual recorded ground-gear contact before another action or movement.')
  const activeJump=gs.getState().dmTools?.jumping?.activeJumpId,allowedLanding=allowedGear?.continuation?.jumpId===activeJump&&gs.getState().dmTools?.jumping?.jumps[activeJump??'']?.status==='ground_contact'
  if(!options.allowJumpDue&&!allowedLanding){const issue=jumpingDueIssue(gs.getState());if(issue)fail(issue.code,issue.message)}
  if (hero().pending) fail('REACTION_PENDING', 'Resolve or decline the pending reaction before another action.')
  if (!options.allowFrigidWaterDue) { const issue = frigidWaterDueIssue(gs.getState()); if (issue) fail(issue.code, issue.message) }
  if (!options.allowWeatherDue) { const issue = weatherDueIssue(gs.getState()); if (issue) fail(issue.code, issue.message) }
  if (!options.allowNutritionDue) assertSurvivalEventsResolved()
  if (!options.allowTravelDue) { const issue = travelDueIssue(gs.getState()); if (issue) fail(issue.code, issue.message) }
  if (!options.allowCasting) { const issue = castingDueIssue(gs.getState()); if(issue)fail(issue.code,issue.message) }
  assertAfflictionEvents('action', options.allowSewerOnsetAt); assertAfflictionTurnOpen(gs.getState().currentTurn)
}
const incomingDamage = new Map<string,number>()
const incomingHpDamage = new Map<string,number>()
export const alive = (e: PlayerState | MonsterState) => e.hp.current > 0 && !e.conditions.some(c => ['incapacitated','paralyzed','stunned','unconscious','petrified'].includes(c))
export function effects(kind: string, targetId?: string): HeroEffect[] {
  if (!gs.getState().hero) return []
  return hero().effects.filter(e => e.kind === kind && e.expiresAt > now() && (!targetId || e.targetIds.includes(targetId)))
}
export function removeHeroEffect(id: string, endedAt = now()): void {
  if (!gs.getState().hero) return
  const effect = hero().effects.find(e => e.id === id)
  if (!effect) return
  const aidBefore=effect.kind==='aid'?new Map(effect.targetIds.map(targetId=>[targetId,appliedAidBonus(targetId)])):undefined
  if(effect.kind==='light')endLightEffectInState(gs.getState(),id,endedAt)
  concentrationRemovedDuringCasting(gs.getState(),id,endedAt)
  netRestraintEffectRemoved(id)
  const condition = effect.data.condition as Condition | undefined
  if (condition) for (const targetId of effect.targetIds) assertPersistedConditionRemoval(targetId, condition, endedAt, { kind: 'hero', id })
  hero().effects = hero().effects.filter(e => e.id !== id)
  if (effect.kind === 'charm-person') {
    const fact = gs.getState().worldFacts?.find(f => f.id === effect.data.worldFactId)
    if (fact) {
      fact.source = 'cast_spell:charm-person:ended'
      fact.text = `Le Charme-personne de ${effect.data.sourceName} (${effect.sourceId}) sur ${effect.data.targetName} (${effect.targetIds[0]}) a pris fin. La cible sait que ce lanceur l’a charmée ; ce sort ne la charme plus.`
    }
  }
  if(hero().concentrationIds[effect.sourceId]===id) {
    delete hero().concentrationIds[effect.sourceId]
    for(const linked of [...hero().effects].filter(e=>e.data.groupId===id))removeHeroEffect(linked.id)
  }
  if (hero().concentrationId === id) {
    delete hero().concentrationId
    for (const linked of [...hero().effects].filter(e => e.data.groupId === id)) removeHeroEffect(linked.id)
  }
  if(aidBefore)for(const [targetId,before]of aidBefore)if(gs.getPersistedMaximumHpTarget(targetId))reconcileAidBonus(targetId,before,endedAt)
  if (condition) for (const targetId of effect.targetIds) finishPersistedConditionRemoval(targetId, condition, endedAt)
  if (effect.kind === 'grapple') reconcilePhysicalHandling()
}
export function addHeroEffect(kind: string, sourceId: string, targetIds: string[], seconds: number,
  data: Record<string, unknown> = {}, concentration = false): HeroEffect {
  assertHero()
  if(kind==='dash')for(const id of targetIds){const issue=chaseDashAdmissionIssue(gs.getState(),id);if(issue)fail(issue.code,issue.message)}
  if (concentration && hero().concentrationIds[sourceId]) removeHeroEffect(hero().concentrationIds[sourceId])
  // Identical named spell effects do not stack.
  for (const old of [...hero().effects]) if (kind!=='aid'&&old.kind === kind && old.sourceId === sourceId && old.targetIds.some(id => targetIds.includes(id))) removeHeroEffect(old.id)
  const effect = { id: `hero-${Date.now()}-${Math.random().toString(36).slice(2)}`, kind, sourceId, targetIds,
    expiresAt: now() + seconds, concentration, data }
  hero().effects.push(effect)
  if(kind==='dash')for(const targetId of targetIds)recordActualChaseDash(targetId,effect.id)
  if (concentration && sourceId === 'player') hero().concentrationId = effect.id
  if (concentration) hero().concentrationIds[sourceId]=effect.id
  if (data.condition) for (const target of targetIds) gs.applyCondition(target, data.condition as Condition)
  return effect
}
/** Aid uses one active contribution while retaining each independent duration.
 * Legacy instances are normalized only when Aid actually changes, never on load. */
function normalizeAidInstances(){
 if(hero().aidModelVersion===1)return
 for(const e of hero().effects.filter(e=>e.kind==='aid')){e.data.aidOverlapVersion=1;e.data.aidAppliedBonus=Number(e.data.hpBonus);e.data.aidOrigin='legacy'}
 hero().aidModelVersion=1
}
export function appliedAidBonus(targetId:string):number{
 return hero().effects.filter(e=>e.kind==='aid'&&e.targetIds.includes(targetId))
  .reduce((sum,e)=>sum+Number(e.data.aidAppliedBonus??e.data.hpBonus),0)
}
function reconcileAidBonus(targetId:string,before:number,at=now()):number{
 normalizeAidInstances()
 const all=hero().effects.filter(e=>e.kind==='aid'&&e.targetIds.includes(targetId))
 const live=all.filter(e=>e.expiresAt>at),strongest=live.reduce<HeroEffect|undefined>((best,e)=>!best||Number(e.data.hpBonus)>Number(best.data.hpBonus)?e:best,undefined)
 const after=Number(strongest?.data.hpBonus??0)
 for(const e of all)e.data.aidAppliedBonus=e===strongest?after:0
 if(after!==before)adjustExhaustionHpMaximum(targetId,after-before,1)
 return after
}
export function addAidSpell(sourceId:string,targetId:string,seconds:number,hpBonus:number,slotLevel:number){
 const target=gs.getPersistedMaximumHpTarget(targetId)!,hpBefore=target.hp.current,before=appliedAidBonus(targetId)
 normalizeAidInstances()
 const effect=addHeroEffect('aid',sourceId,[targetId],seconds,{spellId:'aid',slotLevel,hpBonus,aidOverlapVersion:1,aidAppliedBonus:0,aidOrigin:'cast'})
 const after=reconcileAidBonus(targetId,before),grant=Math.max(0,after-before)
 // User adjudication: only a new stronger application grants its positive
 // potency delta. Equal/weaker casts and reactivation grant no current HP.
 if(grant){if(targetId==='player')gs.updatePlayerHP(grant);else gs.updateMonsterHP(targetId,grant)}
 effect.data.aidHealingGranted=target.hp.current-hpBefore
 return{effectId:effect.id,targetId,hpBefore,hpAfter:target.hp.current,hpBonus,activeHpBonus:after,currentHpDelta:target.hp.current-hpBefore}
}
/** Combat uses the same source chronology after its separately guarded tick. */
export type NaturalRecoveryEvent=KnockoutRecoveryEvent|PlayerNaturalRecoveryEvent
export function reconcileNaturalRecoveryClock():NaturalRecoveryEvent[] {
  const events:NaturalRecoveryEvent[]=[]
  const state=gs.getState(), finalTime=now()
  const initialNpcRecoveries=dueKnockoutRecoveries(finalTime),scheduled=new Set(initialNpcRecoveries.map(event=>event.key))
  const recoveries=[...initialNpcRecoveries,...duePlayerStableRecovery(finalTime)].map(event=>({at:event.at,run:()=>{const recovered=event.recover();if(recovered)events.push(recovered)}}))
    .sort((a,b)=>a.at-b.at)
  try {
    while (true) {
      const expiration=persistedConditionExpirations(finalTime)[0],recovery=recoveries[0],breathing=breathingClockExpirations(finalTime)[0],weather=weatherClockExpirations(finalTime)[0]
      const rite=sacredRiteDueAwards(state,finalTime)[0]
      if(rite&&rite.at<=Math.min(expiration?.at??Infinity,recovery?.at??Infinity,breathing?.at??Infinity,weather?.at??Infinity)){
        state.worldTimeSeconds=rite.at;reconcileSacredRiteAwards()
      } else if(weather&&(!expiration||weather.at<expiration.at)&&(!recovery||weather.at<recovery.at)&&(!breathing||weather.at<breathing.at)){
        state.worldTimeSeconds=weather.at;weather.run()
      } else if(breathing&&(!expiration||breathing.at<expiration.at)&&(!recovery||breathing.at<=recovery.at)){
        state.worldTimeSeconds=breathing.at;breathing.run()
      } else if (expiration && (!recovery || expiration.at<=recovery.at)) {
        state.worldTimeSeconds=expiration.at
        if(expiration.kind==='hero')removeHeroEffect(expiration.id,expiration.at)
        else endEffect(expiration.id)
        // A real expiration can release a previously observed healing ceiling.
        // Pick its persisted release timestamp up within this same time jump.
        for(const event of dueKnockoutRecoveries(finalTime))if(!scheduled.has(event.key)){
          scheduled.add(event.key);recoveries.push({at:event.at,run:()=>{const recovered=event.recover();if(recovered)events.push(recovered)}})
        }
        recoveries.sort((a,b)=>a.at-b.at)
      } else if (recovery) {
        state.worldTimeSeconds=recovery.at;recoveries.shift();recovery.run()
      } else break
    }
  } finally { state.worldTimeSeconds=finalTime;syncWeatherClock(finalTime) }
  return events
}

export function advanceHeroTime(seconds = 0): NaturalRecoveryEvent[] {
  if (!seconds) reconcileFrigidWaterPresence()
  assertSleepTimeAdvance(seconds)
  assertPetrifiedAfflictionHistory()
  assertPetrifiedSpriteHistory()
  suspendSurvivalForDeath()
  assertGameTimeAdvance(seconds)
  if (!gs.getState().hero) {
    if(seconds)gs.getState().worldTimeSeconds=now()+seconds
    return reconcileNaturalRecoveryClock()
  }
  if (seconds) gs.getState().worldTimeSeconds = now() + seconds
  return reconcileHeroAtCurrentTime(seconds)
}
/** Internal arrival commit only: the owning map transition already admitted
 * its clock interval. Reconcile the new physical configuration at that exact
 * instant without admitting another action or bypassing a due event for play. */
export function reconcileHeroAfterPhysicalArrival(): NaturalRecoveryEvent[] {
  reconcileFrigidWaterPresence()
  if(!gs.getState().hero)return reconcileNaturalRecoveryClock()
  return reconcileHeroAtCurrentTime(0)
}
function reconcileHeroAtCurrentTime(seconds:number): NaturalRecoveryEvent[] {
  reconcileWildernessChaseEffects()
  reconcileTemporaryHp()
  reconcileMagicItems()
  // Resolve actual stone expirations in chronological order before resuming
  // their suspended poisons; a large time jump must not grant extra duration.
  const naturalRecoveries=reconcileNaturalRecoveryClock()
  reconcileAfflictions()
  if(seconds>6)hero().movementTrail=[]
  expireMonsterEffects()
  for (const e of [...hero().effects]) {
    const source = gs.getEntity(e.sourceId)
    if (e.kind === 'grapple' && (!source || !alive(source) || e.targetIds.some(id => {
      const target = gs.getEntity(id)
      return !target || (id==='player' ? Boolean(gs.getPlayer().deathSaves?.dead) : !(target as MonsterState).isAlive) || distance(source.position, target.position) > 1
    }))) { removeHeroEffect(e.id); continue }
    if (e.expiresAt <= now()) removeHeroEffect(e.id, e.expiresAt)
    else if (e.concentration && (!persistedConditionTarget(e.sourceId) || !alive(persistedConditionTarget(e.sourceId)!))
      || e.kind === 'countercharm' && (!source || !alive(source) || source.conditions.includes('deafened') && e.data.silenced === true)) removeHeroEffect(e.id)
  }
  reconcileAfflictions()
  hero().inspiration = hero().inspiration.filter(e => e.expiresAt > now())
  reconcileCasting()
  reconcileNets()
  return naturalRecoveries
}
export function startHeroTurn(id: string | null): void {
  if (!id || complexTrapSlot(gs.getState(),id)) return
  advanceHeroTime()
  startBreathingTurn(id)
  startPlayerDyingTurn(id)
  startNpcDeathSaveTurn(id)
  if (!gs.getState().hero) return
  hero().reactionsUsed[id] = false
  hero().turnStarted[id] = (hero().turnStarted[id] ?? 0) + 1
  for (const e of [...hero().effects]) if (e.data.untilStartOf === id) removeHeroEffect(e.id)
  if (id === 'player') {
    clearActualFootwork()
    hero().actionCredits=1
    delete hero().attackAction
    hero().bonusSpellCast = false
    hero().actionSpellCast = false
  }
  stageCackleTurn(id)
}
export function spendHeroAction():void {
  if(gs.getState().phase!=='combat')return
  if(hero().actionCredits<=0)fail('ACTION_ALREADY_USED','No action remains this turn.')
  hero().actionCredits--
  if(hero().actionCredits===0)gs.markActionUsed('player');else gs.resetActionUsed('player')
}
export function endHeroTurn(id: string): void {
  if (!gs.getState().hero) return
  assertCastingTurnEnd(id)
  for(const e of [...effects('blindness-deafness',id)])if(savingThrow(id,'con',Number(e.data.dc),true).success)removeHeroEffect(e.id)
  for (const e of [...hero().effects]) if (e.data.untilEndOf === id && Number(e.data.endTurnCount) <= (hero().turnStarted[id] ?? 0)) removeHeroEffect(e.id)
  finishRobeTurn(gs.getState(),id)
}
export function heroBeforeHPChange(id: string, delta: number, context?: TemporaryHpDamageContext): number {
  const received = context?.damageReceived ?? Math.max(0,-delta)
  if (received > 0) {
    if (!context?.temporaryHpResolved) delta = -absorbTemporaryHpDamage(id,received).hpDamage
    incomingDamage.set(id,received)
    incomingHpDamage.set(id,Math.max(0,-delta))
  }
  if (!gs.getState().hero) return delta
  delta=afflictionHealingLimit(id,delta)
  const entity = gs.getEntity(id)
  if (entity && delta < 0 && entity.hp.current > 0 && entity.hp.current + delta <= 0) {
    const ward = effects('death-ward', id)[0]
    if (ward) { removeHeroEffect(ward.id); return 1 - entity.hp.current }
  }
  return delta
}
export function heroAfterHPChange(id: string, hpBefore: number, delta: number): void {
  const amount=incomingDamage.get(id)??(delta<0?-delta:0), hpDamage=incomingHpDamage.get(id)??(delta<0?-delta:0)
  incomingDamage.delete(id);incomingHpDamage.delete(id)
  if (!gs.getState().hero) return
  const entity = gs.getEntity(id)
  if (!entity) return
  if (id!=='player'&&entity.hp.current <= 0 && hpBefore > 0 && !(entity as MonsterState).isAlive) gs.recordActualDeath(id)
  if (entity.hp.current > 0) delete hero().corpseTimes[id]
  if (amount > 0) {
    wakeNaturalSleeper(id,'damage')
    wakeAfflictionSleeper(id,true)
    if(id==='player'&&entity.hp.current===0&&hpDamage>0&&hpDamage-hpBefore>=entity.hp.max){gs.getPlayer().deathSaves??={successes:0,failures:0};gs.getPlayer().deathSaves!.dead=true;gs.recordActualDeath(id)}
    for (const e of [...effects('turned', id)]) removeHeroEffect(e.id)
    const concentrationId=hero().concentrationIds[id]
    if (concentrationId) {
      if (!alive(entity)) removeHeroEffect(concentrationId)
      else if (!savingThrow(id, 'con', Math.max(10, Math.floor(amount / 2))).success) removeHeroEffect(concentrationId)
    }
  }
  if(entity.hp.current<=0)wakeNaturalSleeper(id,'superseded_by_zero_hp')
  const actuallyDead = id==='player' ? Boolean(gs.getPlayer().deathSaves?.dead) : !(entity as MonsterState).isAlive
  if (entity.conditions.includes('unconscious') || id === 'player' && entity.hp.current <= 0) gs.enterUnconscious(id)
  for (const effect of [...hero().effects]) if (effect.kind === 'grapple'
    && (effect.sourceId === id && !alive(entity) || effect.targetIds.includes(id) && actuallyDead)) removeHeroEffect(effect.id)
  if (id === 'player' && gs.getPlayer().deathSaves?.dead) { suspendSurvivalForDeath(); reconcileMagicItems() }
  if(actuallyDead)reconcileWildernessChaseEffects()
  if(amount>0)stageCackleStress(id,{kind:'actual-damage',damageReceived:amount,hpBefore,hpAfter:entity.hp.current,at:now()})
}
export function healingRoll(notation: string, targetId: string): DiceRollResult {
  assertBreathingRecoveryAllowed(targetId)
  if (!effects('beacon-of-hope', targetId).length) return rollDice(notation)
  const m = /^(\d+)d(\d+)([+-]\d+)?$/.exec(notation)
  if (!m) return rollDice(notation)
  const rolls = Array(Number(m[1])).fill(Number(m[2])), modifier = Number(m[3] ?? 0)
  return { notation, rolls, modifier, total: rolls.reduce((a,b)=>a+b,0)+modifier, detail: `${notation} maximisé par Lueur d’espoir` }
}
export function healCreature(targetId: string, amount: number) {
  if(amount>0)assertBreathingRecoveryAllowed(targetId)
  const target = gs.getEntity(targetId) ?? fail('ENTITY_NOT_FOUND', 'Healing target is absent.')
  if('isAlive'in target&&!target.isAlive)fail('ENTITY_DEAD','Healing does not resurrect a dead creature.')
  if ('isAlive' in target && monsterSource(target) && ['undead', 'construct'].includes(monsterSource(target)!.type))
    fail('HEALING_TARGET_INVALID', 'This healing does not affect undead or constructs.')
  const before = target.hp.current
  if (targetId === 'player') gs.updatePlayerHP(amount)
  else gs.updateMonsterHP(targetId, amount)
  return { targetId, hpBefore: before, hpAfter: target.hp.current, healing: target.hp.current - before }
}
export function bonusOnRoll(kind: 'attack' | 'save', targetId: string): number {
  return effects('bless', targetId).length ? rollDice('1d4').total : 0
}
export function saveAdvantage(id: string, ability: keyof EntityStats, condition?: Condition): boolean {
  if (!gs.getState().hero) return false
  if(condition==='poisoned'&&(effects('protection-from-poison',id).length||effects('antitoxin',id).length))return true
  const actor=gs.getEntity(id)
  if(ability==='dex'&&actor&&alive(actor)&&actor.speed>0&&!actor.conditions.some(c=>['grappled','restrained'].includes(c))&&effects('dodge',id).length)return true
  if (ability === 'wis' && effects('beacon-of-hope', id).length) return true
  if (condition !== 'charmed' && condition !== 'frightened') return false
  const target = gs.getEntity(id)
  if (!target || target.conditions.includes('deafened')) return false
  return hero().effects.some(e => e.kind === 'countercharm' && e.expiresAt > now() && (() => {
    const bard = gs.getEntity(e.sourceId)
    return bard && alive(bard) && distance(bard.position, target.position) <= 6 &&
      (id === bard.id || ('hostile' in target && target.hostile === false))
  })())
}
export function effectiveAC(id: string): number {
  const entity = gs.getEntity(id)!
  return heroArmorClass(entity,gs.getState().hero,now())
}
export function effectiveSpeed(id: string, base: number): number {
  if (gs.getEntity(id)?.conditions.includes('exhaustion') && !gs.getState().dmTools?.exhaustion?.creatures[id])
    fail('EXHAUSTION_LEVEL_REQUIRED', 'This legacy exhaustion condition has no level; supply an explicit authoritative level before movement.')
  const normal = Math.max(0, base - (effects('ray-of-frost', id).length ? 10 : 0))
  return exhaustionSpeed(gs.getState(),id,armorAdjustedSpeed(gs.getState(),id,normal)) * chaseWildernessSpeedMultiplier(gs.getState(),id) * dashMovementMultiplier(gs.getState(),id)
}
export function reactionAvailable(id = 'player'): boolean {
  const actor = gs.getEntity(id)
  return Boolean(gs.getState().hero && actor && alive(actor) && !isSurprised(gs.getState(), id) && !hero().reactionsUsed[id] && !effects('turned', id).length)
}
export function spendReaction(id = 'player') { if (!reactionAvailable(id)) fail('REACTION_ALREADY_USED', 'Reaction unavailable until the start of the actor next turn.'); hero().reactionsUsed[id] = true }
export function canCutWords(sourceId: string): boolean {
  const source = gs.getEntity(sourceId), bard = gs.getPlayer()
  return Boolean(feature('cutting_words') && reactionAvailable() && bard.resources?.bardic_inspiration?.current
    && source && source.id !== bard.id && distance(source.position, bard.position) <= 12 && canSee(bard, source)
    && !source.conditions.includes('deafened') && !monsterSource(source)?.condition_immunities.some(c => c.index === 'charmed'))
}
export function consumeInspiration(): void { if (!gs.consumeResource('bardic_inspiration')) fail('RESOURCE_EXHAUSTED', 'No Bardic Inspiration uses remain.') }
export function shortRest(input: { hitDice?: number; arcaneRecovery?: number[]; songOfRest?: boolean }, completion?: RecordedRestCompletion, preflightOnly = false): Record<string, unknown> {
  if (!completion && !preflightOnly) return takeUninterruptedRest({ kind: 'short', ...input })
  if (completion) validateRecordedRestCompletion(completion, 'short'); else assertNoRecordedRest()
  const seconds = completion ? 0 : 3600
  available()
  if(input.hitDice)assertBreathingRecoveryAllowed('player')
  assertGameTimeAdvance(seconds)
  assertSurvivalRestWindow(seconds)
  assertAfflictionRestWindow(seconds)
  const recordedActor = !gs.getPlayer().deathSaves?.dead && !gs.getPlayer().conditions.includes('petrified') && (gs.getPlayer().hp.current > 0 || gs.getPlayer().deathSaves?.stable)
  if (gs.getState().phase === 'combat' || !(recordedActor || alive(gs.getPlayer()))) fail('REST_UNAVAILABLE', 'Rest requires a living supported hero outside combat.')
  const count = input.hitDice ?? 0, pools = gs.getPlayer().spellSlots
  if (!Number.isInteger(count) || count < 0 || count > hero().hitDice.current) fail('HIT_DICE_INVALID', 'Select available hit dice.')
  const recovery = input.arcaneRecovery ?? []
  if (recovery.length) {
    if(!ownedPersonalSpellbooks(gs.getState()).length)fail('SPELLBOOK_REQUIRED','Arcane Recovery requires studying an actual owned personal spellbook; a lost global list is insufficient.')
    if (!feature('arcane_recovery') || hero().arcaneRecoveryDay === Math.floor(now()/86400)) fail('ARCANE_RECOVERY_UNAVAILABLE', 'Arcane Recovery is available once per day on a short rest.')
    if (recovery.some(l => !Number.isInteger(l) || l < 1 || l > 4) || recovery.reduce((a,b)=>a+b,0) > Math.ceil(gs.getPlayer().level / 2))
      fail('ARCANE_RECOVERY_BUDGET', 'Recovered slot levels cannot exceed half the wizard level, rounded up.')
    for (const level of new Set(recovery)) {
      const pool = pools?.[`level${level as 1|2|3|4}`]
      if (!pool || recovery.filter(l=>l===level).length > pool.max-pool.current) fail('ARCANE_RECOVERY_POOL', 'Cannot recover more slots than expended.')
    }
  }
  if (input.songOfRest && !feature('song_of_rest')) fail('FEATURE_NOT_AVAILABLE', 'Song of Rest is absent.')
  if(input.songOfRest&&gs.getPlayer().conditions.includes('deafened'))fail('SONG_CANNOT_BE_HEARD','The bard cannot benefit from an unheard performance.')
  if(completion)preflightChaseRestRecovery(completion)
  if (preflightOnly) return { rest: 'short', eligible: true, benefitsGranted: false }
  const chaseRecovery=completion?recoverChaseRest(completion):undefined
  const rolls: DiceRollResult[] = []
  const naturalRecoveries=advanceHeroTime(seconds)
  const hpBeforeHitDice=gs.getPlayer().hp.current
  for (let i=0;i<count;i++) {
    const con = getAbilityModifier(gs.getPlayer().stats.con), roll = healingRoll(`1d${hero().hitDice.die}${con >= 0 ? '+' : ''}${con}`, 'player')
    rolls.push(roll); gs.updatePlayerHP(sewerPlagueHitDieHealing(roll.total))
  }
  hero().hitDice.current -= count
  if (count && input.songOfRest && gs.getPlayer().hp.current>hpBeforeHitDice) { const roll=healingRoll('1d6','player'); rolls.push(roll); gs.updatePlayerHP(roll.total) }
  for (const id of ['second_wind','action_surge','channel_divinity', ...(feature('font_of_inspiration') ? ['bardic_inspiration'] : [])]) {
    const pool = gs.getPlayer().resources?.[id]; if (pool) pool.current=pool.max
  }
  for (const level of recovery) pools![`level${level as 1|2|3|4}`]!.current++
  if (recovery.length) hero().arcaneRecoveryDay = Math.floor(now()/86400)
  hero().reactionsUsed = {}
  return { rest: 'short',chaseRecovery, seconds, rolls, hp: gs.getPlayer().hp, hitDice: hero().hitDice, spellSlots: pools, naturalRecoveries, npcDeathSaveEvents:dueNpcDeathSaveEvents() }
}
export function longRest(completion?: RecordedRestCompletion, preflightOnly = false): Record<string, unknown> {
  if (!completion && !preflightOnly) return takeUninterruptedRest({ kind: 'long' })
  if (completion) validateRecordedRestCompletion(completion, 'long'); else assertNoRecordedRest()
  const seconds = completion ? 0 : 28800
  available({allowSleepDue:Boolean(completion)})
  assertBreathingRecoveryAllowed('player')
  assertGameTimeAdvance(seconds)
  assertSurvivalRestWindow(seconds, true)
  assertAfflictionRestWindow(seconds)
  const recordedActor = !gs.getPlayer().deathSaves?.dead && !gs.getPlayer().conditions.includes('petrified')
    && (completion ? completion.hpAtStart > 0 : gs.getPlayer().hp.current > 0)
  if (gs.getState().phase === 'combat' || !(recordedActor || alive(gs.getPlayer()))) fail('REST_UNAVAILABLE', 'Long rest needs at least one HP at its start, outside combat.')
  if (hero().lastLongRestAt !== undefined && now()+seconds-hero().lastLongRestAt! < 86400) fail('LONG_REST_TOO_SOON', 'Only one long-rest benefit per 24 hours.')
  const chasePlan = completion ? preflightChaseRestRecovery(completion) : undefined
  const armoredSleep=Boolean(completion?.armoredSleep)
  const plague = completion && chasePlan ? preflightSewerPlagueLongRest(completion.restId, armoredSleep, chasePlan) : undefined
  preflightCackleLongRest()
  const hpBlockedBySewerPlague = symptomaticSewerPlague()
  if (preflightOnly) return { rest: 'long', eligible: true, benefitsGranted: false }
  const chaseRecovery=completion?recoverChaseRest(completion):undefined
  const naturalRecoveries=advanceHeroTime(seconds)
  const player=gs.getPlayer()
  for(const effect of [...gs.getState().monsterEffects??[]])if(effect.targetId==='player'&&effect.kind==='life-drain'){
    adjustExhaustionHpMaximum('player',effect.hpMaxReduction??0);endEffect(effect.id)
  }
  const exhaustionRecovery=afterSurvivalLongRest(`long:${now()}`,armoredSleep)
  if (!hpBlockedBySewerPlague && player.hp.current < player.hp.max) gs.updatePlayerHP(player.hp.max-player.hp.current)
  if (player.hp.current > 0) player.deathSaves={successes:0,failures:0}
  for(const pool of Object.values(player.resources ?? {})) pool.current=pool.max
  for(const pool of Object.values(player.spellSlots ?? {})) pool.current=pool.max
  const spentHitDice=hero().hitDice.max-hero().hitDice.current,hitDiceRecovered=armoredSleep?armoredLongRestHitDiceRecovery(spentHitDice):Math.max(1,Math.floor(player.level/2))
  hero().hitDice.current=Math.min(hero().hitDice.max,hero().hitDice.current+hitDiceRecovered)
  hero().reactionsUsed={}; hero().lastLongRestAt=now(); hero().preparedAtRest=true
  if(completion)afterSleepLongRest(completion.restId)
  afterAfflictionLongRest('player')
  if(gs.getState().sceneMemory)delete gs.getState().sceneMemory!['divination-since-rest']
  if(gs.getState().sceneMemory)delete gs.getState().sceneMemory!['augury-since-rest']
  delete hero().concentrationId; for(const e of [...hero().effects]) if(e.concentration)removeHeroEffect(e.id)
  const cackleFeverEvent=completion?stageCackleLongRest(completion.restId):undefined
  const sewerPlagueEvent = plague && completion ? stageSewerPlagueLongRest(plague, completion.restId) : undefined
  return {rest:'long',chaseRecovery,seconds,...cackleFeverEvent?{cackleFeverEvent}:{},...sewerPlagueEvent?{sewerPlagueEvent,hpBlockedBySewerPlague}:{},hp:player.hp,hitDice:hero().hitDice,spellSlots:player.spellSlots,exhaustionRecovery,temporaryHpExpiration:temporaryHpLongRest('player'),naturalRecoveries,npcDeathSaveEvents:dueNpcDeathSaveEvents()}
}
export function prepareSpells(spellIds: string[],bookIds?:string[]) {
  available()
  if (!hero().preparedAtRest || gs.getState().phase === 'combat') fail('PREPARATION_REQUIRES_REST', 'Prepare spells after a long rest, outside combat.')
  const player=gs.getPlayer(), tpl=getCharacterTemplate(player.characterId,player.level)
  const books=player.spellbook?spellbookStudySources(bookIds):undefined
  const bookSpells=books?new Set(books.flatMap(book=>book.spellIds)):undefined
  if(!player.spellbook&&bookIds!==undefined)fail('SPELLBOOK_NOT_APPLICABLE','Only a wizard preparing from real personal books may choose book IDs.')
  if (!['wizard','cleric'].includes(player.characterId ?? '')) fail('CLASS_CANNOT_PREPARE', 'Bards know their spells; they cannot exchange them at rest.')
  const limit = player.level === 3 ? tpl.spellcasting!.knownSpells.length : player.level + getAbilityModifier(player.stats[player.spellcastingAbility!])
  if (new Set(spellIds).size!==spellIds.length || spellIds.length>limit) fail('PREPARED_SPELL_LIMIT','Too many prepared spells or duplicate choices.')
  for(const id of spellIds) {
    const spell=getSpell(id)
    if(!spell || spell.level===0 || spell.level>Math.ceil(player.level/2) || (bookSpells ? !bookSpells.has(id) : ![...tpl.spellcasting!.knownSpells,...player.domainSpells??[]].includes(id))) fail('SPELL_CANNOT_PREPARE','Select supported class spells or spells present in the explicitly selected real personal books.')
  }
  const preparationSeconds=Math.max(60,spellIds.reduce((sum,id)=>sum+getSpell(id)!.level*60,0))
  assertGameTimeAdvance(preparationSeconds)
  const cantrips=player.knownSpells!.filter(id=>getSpell(id)?.level===0)
  player.knownSpells=[...new Set([...cantrips,...spellIds,...player.domainSpells??[]])]
  advanceHeroTime(preparationSeconds)
  hero().preparedAtRest=false
  return {knownSpells:player.knownSpells}
}
