import { inferRoomIdOnMap } from '../lib/adventure-map'
import type { AfflictionRecord } from '../lib/affliction-state'
import type { GameState, PlayerState, MonsterState } from '../lib/types'
import { isStatBackedNpc } from '../lib/npc-stat-blocks'
import { cackleStateOf } from '../lib/cackle-fever-state'
import { AFFLICTIONS } from '../lib/srd/afflictions'
import { toolkitState,toolkitError } from './toolkit'
import { addHeroEffect,removeHeroEffect,now,hero,effects,reconcileNaturalRecoveryClock } from './hero-rules'
import { limitedAfflictionHealing,noticeNpcHealingCeilingChange } from '../lib/affliction-healing'
import { conditionImmune,dealDamage,hasTrait,reactToHarm } from './monster-rules'
import { rollDice } from './dice'
import { assertSewerPlagueUninterruptedRest, sewerPlagueEvent, startSewerPlagueIncubation } from './sewer-plague'
import * as gs from './game-state'
import { persistedConditionTarget, applyPersistedRestoredCondition } from './persisted-conditions'
export function afflictions(){return toolkitState().afflictions??={sources:{},records:{},ointments:{}}}
/** A save against poison damage is not an automatic success merely because
 * the creature is immune to the poisoned condition. Condition-only source
 * poisons retain their real condition immunity; antitoxin still helps both. */
export function afflictionSavingThrowInput(templateId:AfflictionRecord['templateId'],targetId:string){
 const spec=AFFLICTIONS[templateId],target=gs.getEntity(targetId)
 if(!target)toolkitError('AFFLICTION_TARGET_INVALID','The exact real affected body must still be present for its source save.')
 const sourceAdvantage=spec.kind==='poison'&&(effects('antitoxin',targetId).length>0||effects('protection-from-poison',targetId).length>0||hasTrait(target!,'Dwarven Resilience'))
 return{entityId:targetId,ability:'con' as const,dc:spec.dc,sourceAdvantage,...spec.kind==='poison'&&!spec.damage?{againstCondition:'poisoned' as const}:{}}
}
/** Internal actual-event constructor shared by physical player doses. It does
 * not obtain a dose, choose a victim, roll or grant a scene contamination. */
export function createActualAfflictionRecord(input:{id:string;sourceId:string;sourceActorId?:string;targetId:string;templateId:AfflictionRecord['templateId'];eventId:string;creation:string;midnightAt?:number}){
 const state=gs.getState(),data=afflictions(),old=data.records[input.id]
 if(old){if(old.creation!==input.creation)toolkitError('AFFLICTION_EVENT_CONFLICT','This actual exposure identity belongs to different source arguments.');return{record:old,immune:false,deferred:old.status==='pending'&&input.midnightAt!==undefined,alreadyCreated:true}}
 if(Object.keys(data.records).length>=512)toolkitError('AFFLICTION_EVENT_LIMIT','At most512retained actual source exposures; no dose or history is discarded.')
 const target=gs.getEntity(input.targetId)
 if(!target||(input.targetId==='player'?Boolean(state.player.deathSaves?.dead):Boolean('isAlive'in target&&!target.isAlive)))toolkitError('AFFLICTION_TARGET_INVALID','Expose an actual living physical body only; no corpse is revived or given a poison save.')
 if(input.templateId==='midnight_tears'){
  if(input.midnightAt===undefined||input.midnightAt<=now()||input.midnightAt>now()+86400)toolkitError('MIDNIGHT_TIMESTAMP_REQUIRED','Select the actual next established midnight world timestamp within24hours; no fictional calendar is guessed.')
 }else if(input.midnightAt!==undefined)toolkitError('AFFLICTION_ARGUMENT_MISMATCH','Only Midnight Tears has an explicit midnight exposure timestamp.')
 const record:AfflictionRecord={id:input.id,sourceId:input.sourceId,...input.sourceActorId?{sourceActorId:input.sourceActorId}:{},targetId:input.targetId,templateId:input.templateId,eventId:input.eventId,creation:input.creation,status:'pending',appliedAt:now(),successes:0,lastTurn:state.turnCounter??0,turnContext:{phase:state.phase,combatGeneration:state.phase==='combat'?state.combatGeneration??0:undefined},unhealableDamage:0,sightPenalty:0,ointmentDoses:0,ointmentPending:false,...input.midnightAt!==undefined?{nextAt:input.midnightAt}:{}}
 data.records[record.id]=record
 const immune=Boolean(target!.conditions.includes('petrified'))
 if(immune){record.status='ended';delete record.nextAt}
 return{record,immune,deferred:!immune&&input.midnightAt!==undefined}
}
export function activeAfflictions(targetId:string,kind?:'poison'|'disease'){return Object.values(gs.getState().dmTools?.afflictions?.records??{}).filter(r=>['pending','active'].includes(r.status)&&r.targetId===targetId&&(!kind||AFFLICTIONS[r.templateId].kind===kind))}
function noticeHealingCeiling(targetId:string,at=now()){
 const target=persistedConditionTarget(targetId)
 if(target&&'isAlive'in target)noticeNpcHealingCeilingChange(gs.getState(),target,at)
}

/** Read-only history gate. Never invent the onset/removal of an old stone state
 * when hydrating a snapshot; its saved pause must match the actual actor. */
export function validatePetrifiedAfflictionHistory(state:GameState) {
 const actors:Record<string,PlayerState|MonsterState>={}
 const floors=state.sceneMemory?.floorMonsters as Record<string,Record<string,MonsterState>>|undefined
 for(const [mapId,monsters]of Object.entries(floors??{}))if(mapId!==state.currentMapId)Object.assign(actors,monsters)
 Object.assign(actors,state.sceneMemory?.retiredMonsters as Record<string,MonsterState>|undefined,state.monsters,{player:state.player})
 const unresolvedRecordIds:string[]=[],errors:Array<{recordId:string;code:string;message:string}>=[]
 for(const record of Object.values(state.dmTools?.afflictions?.records??{})){
  if(!['pending','active'].includes(record.status))continue
  const actor=actors[record.targetId]
  if(!actor)continue // An unloaded/absent actor is not activated by an affliction.
  const stone=actor.conditions.includes('petrified'),pause=record.petrificationPause
  if(stone&&!pause)unresolvedRecordIds.push(record.id)
  if(pause&&(!stone||pause.pausedAt>(state.worldTimeSeconds??0)))errors.push({recordId:record.id,code:'PETRIFIED_AFFLICTION_STATE_MISMATCH',message:'The saved affliction pause must match the actual petrified actor and an elapsed timestamp.'})
  if(pause?.effects.some(original=>state.hero?.effects.some(effect=>effect.id===original.id)))errors.push({recordId:record.id,code:'PETRIFIED_AFFLICTION_EFFECT_CONFLICT',message:'A saved suspended effect cannot also be active.'})
 }
 return {valid:errors.length===0,unresolvedRecordIds,errors}
}
export function assertPetrifiedAfflictionHistory() {
 const validation=validatePetrifiedAfflictionHistory(gs.getState())
 if(validation.errors.length)toolkitError(validation.errors[0].code,validation.errors[0].message)
 if(validation.unresolvedRecordIds.length)toolkitError('PETRIFIED_AFFLICTION_HISTORY_REQUIRED','The existing petrified actor has an unanchored poison/disease. Its past onset is unknown; no duration is guessed.')
}

/** Call before either actual condition transition, before changing conditions. */
export function assertPetrifiedAfflictionsTransition(targetId:string,endedAt=now()) {
 if(hero()?.pending)toolkitError('REACTION_PENDING','Resolve the held roll before changing petrification or its suspended poison/disease.')
 const stone=persistedConditionTarget(targetId)?.conditions.includes('petrified')
 if(!stone&&Object.values(cackleStateOf(gs.getState())?.events??{}).some(event=>event.targetId===targetId&&!event.result))
  toolkitError('CACKLE_EVENT_REQUIRED','Resolve the already witnessed disease consequence before establishing a new petrification; no held source event is stranded.')
 const restoringIds=new Set<string>()
 for(const record of activeAfflictions(targetId)){
  if(!stone&&record.templateId==='cackle_fever'&&record.nextAt!==undefined&&record.nextAt<=now())
   toolkitError('CACKLE_EVENT_REQUIRED','Resolve the already due actual symptom onset before establishing a new petrification.')
  if(stone&&!record.petrificationPause)toolkitError('PETRIFIED_AFFLICTION_HISTORY_REQUIRED','No past onset is inferred for a legacy petrification.')
  if(!stone&&record.petrificationPause)toolkitError('PETRIFIED_AFFLICTION_STATE_MISMATCH','Resume only through the actual saved condition transition.')
  if(record.petrificationPause){
   if(record.petrificationPause.pausedAt>endedAt||endedAt>now())toolkitError('PETRIFIED_AFFLICTION_STATE_MISMATCH','The real end must follow the saved start and cannot be in the future.')
   for(const original of record.petrificationPause.effects){
    if(restoringIds.has(original.id)||hero().effects.some(effect=>effect.id===original.id))
     toolkitError('PETRIFIED_AFFLICTION_EFFECT_CONFLICT','A suspended effect ID is already active or duplicated; no condition or effect is changed.')
    restoringIds.add(original.id)
   }
  }else if((hero()?.effects.filter(effect=>effect.data.afflictionId===record.id).length??0)>16)
   toolkitError('PETRIFIED_AFFLICTION_EFFECT_LIMIT','The source has too many linked effects to suspend; none is discarded.')
  if(!record.petrificationPause){
   if(record.expiresAt!==undefined&&record.expiresAt<=now())toolkitError('AFFLICTION_RECONCILIATION_REQUIRED','Reconcile the already expired source before establishing a new petrification; no retroactive pause.')
   const due=dueAfflictionEvent(record)
   if(due&&(due!=='end'||gs.getState().phase!=='combat'))toolkitError('AFFLICTION_EVENT_REQUIRED','Resolve the already due source event before a new petrification; no held event is skipped.')
  }
 }
}

/** Call immediately after a genuine entry into petrified, never from restore. */
export function suspendPetrifiedAfflictions(targetId:string) {
 if(!gs.getEntity(targetId)?.conditions.includes('petrified'))return
 const records=activeAfflictions(targetId).filter(record=>!record.petrificationPause)
 const sources=records.map(record=>({record,linked:hero()?.effects.filter(effect=>effect.data.afflictionId===record.id)??[]}))
 if(sources.some(source=>source.linked.length>16))toolkitError('PETRIFIED_AFFLICTION_EFFECT_LIMIT','The exact source has too many linked effects to suspend; none is discarded.')
 // Establish every pause before removing symptoms: condition reconciliation
 // must never observe a partially anchored petrified actor.
 for(const {record,linked}of sources)record.petrificationPause={pausedAt:now(),effects:structuredClone(linked)}
 noticeHealingCeiling(targetId)
 for(const {linked}of sources)for(const effect of linked)removeHeroEffect(effect.id)
}

/** Call immediately after a genuine removal. Copy original effect IDs so a
 * save/continuation cannot be replaced by a fresh poison exposure or duration. */
export function resumePetrifiedAfflictions(targetId:string,endedAt=now()) {
 if(persistedConditionTarget(targetId)?.conditions.includes('petrified'))return
 const paused=activeAfflictions(targetId).filter(record=>record.petrificationPause)
 const ids=new Set<string>()
 for(const record of paused){
  const pause=record.petrificationPause!
  if(endedAt<pause.pausedAt||endedAt>now())toolkitError('PETRIFIED_AFFLICTION_STATE_MISMATCH','The real end must be between the pause start and current time.')
  for(const original of pause.effects){
   if(ids.has(original.id)||hero().effects.some(effect=>effect.id===original.id))toolkitError('PETRIFIED_AFFLICTION_EFFECT_CONFLICT','A suspended effect ID is already active or duplicated; do not partially resume.')
   ids.add(original.id)
  }
 }
 const restore:Array<{record:AfflictionRecord;effect:import('../lib/hero-state').HeroEffect}>=[]
 // All source metadata is resumed before any condition can reconcile the actor.
 for(const record of paused){
  const pause=record.petrificationPause!,elapsed=endedAt-pause.pausedAt
  if(record.cackleFever){const illness=record.cackleFever,crisis=illness.crisis,incubationActive=record.nextAt!==undefined
   ;(illness.suspensions??=[]).push({from:pause.pausedAt,to:endedAt,incubationActive,...crisis&&!crisis.endedAt&&crisis.endsAt>pause.pausedAt?{crisisId:crisis.id}:{},pauseWitness:JSON.stringify(pause)})
   if(incubationActive)illness.incubationSuspendedSeconds=(illness.incubationSuspendedSeconds??0)+elapsed
  }
  if(record.nextAt!==undefined)record.nextAt+=elapsed
  if(record.expiresAt!==undefined)record.expiresAt+=elapsed
  const crisis=record.cackleFever?.crisis
  if(crisis&&!crisis.endedAt&&crisis.endsAt>pause.pausedAt){crisis.endsAt+=elapsed;crisis.suspendedSeconds=(crisis.suspendedSeconds??0)+elapsed}
  delete record.petrificationPause
  if(record.expiresAt!==undefined&&record.expiresAt<=now()){endAffliction(record);continue}
  for(const original of pause.effects){
   const effect={...structuredClone(original),expiresAt:original.expiresAt+elapsed}
   if(effect.expiresAt>now())restore.push({record,effect})
  }
 }
 for(const {effect}of restore)hero().effects.push(effect)
 for(const {effect}of restore)if(effect.data.condition)
  applyPersistedRestoredCondition(targetId,effect.data.condition as import('../lib/types').Condition)
 noticeHealingCeiling(targetId,endedAt)
}

export function endAffliction(record:AfflictionRecord,status:'ended'|'cured'='ended'){
 record.status=status;delete record.nextAt;delete record.expiresAt;delete record.petrificationPause
 for(const e of [...hero().effects])if(e.data.afflictionId===record.id)removeHeroEffect(e.id)
 noticeHealingCeiling(record.targetId)
}
export function neutralizeAfflictions(targetId:string,kind:'poison'|'disease',afflictionId?:string){
 const records=activeAfflictions(targetId,kind)
 if(!afflictionId&&records.length)toolkitError('AFFLICTION_CHOICE_REQUIRED','Choose one exact afflictionId; a cure must not silently choose among poisons or diseases.')
 if(!afflictionId)return []
 const record=records.find(r=>r.id===afflictionId)
 if(!record)toolkitError('AFFLICTION_NOT_ACTIVE','The selected affliction is not present on that target with this kind.')
 endAffliction(record!,'cured');reconcileNaturalRecoveryClock();return [record!.id]
}
function setCondition(record:AfflictionRecord,condition:'poisoned'|'paralyzed'|'unconscious'|'blinded'|'incapacitated'){
 if(conditionImmune(gs.getEntity(record.targetId)!,condition))return
 addHeroEffect(`affliction:${record.id}:${condition}`,record.targetId,[record.targetId],record.expiresAt===undefined?1e12:Math.max(0,record.expiresAt-now()),{afflictionId:record.id,condition})
}
export function applyAfflictionSave(record:AfflictionRecord,save:{success:boolean;roll:{total:number}},event:'initial'|'repeat'){
 if(record.petrificationPause)toolkitError('AFFLICTION_SUSPENDED','The poison/disease is suspended by petrification; no held save is newly applied.')
 const spec=AFFLICTIONS[record.templateId],initial=event==='initial'
 let damageRoll,damageResolution
 let incubationRoll: ReturnType<typeof rollDice> | undefined
 if(spec.damage&&(!save.success||spec.half)){
  damageRoll=rollDice(record.templateId==='burnt_othur_fumes'&&!initial?'1d6':spec.damage)
  damageResolution=dealDamage(record.targetId,save.success?Math.floor(damageRoll.total/2):damageRoll.total,'poison',{sourceId:record.sourceActorId})
  if(record.templateId==='pale_tincture'&&!record.relaxationHealingRelease)record.unhealableDamage+=Math.max(0,damageResolution.hpBefore-damageResolution.hpAfter)
 }
 const harmSaves=initial&&!damageResolution&&record.sourceActorId?reactToHarm(record.sourceActorId,record.targetId):damageResolution?.harmSaves??[]
 if(initial){
  if(save.success){endAffliction(record);return {save,damageRoll,damageResolution,harmSaves,affliction:record}}
  record.status='active'
  if(spec.seconds)record.expiresAt=now()+spec.seconds
  if(record.templateId==='torpor')record.expiresAt=now()+rollDice('4d6').total*3600
  if(record.templateId==='sight_rot')record.nextAt=now()+86400
  if(record.templateId==='sewer_plague')incubationRoll=startSewerPlagueIncubation(record)
  if(record.templateId==='pale_tincture')record.nextAt=now()+86400
  if(spec.repeat==='start'||spec.repeat==='end')record.nextAt=now()+6
  if(record.templateId==='midnight_tears'||!spec.conditions&&!spec.repeat&&spec.kind!=='disease')endAffliction(record)
  else if(!conditionImmune(gs.getEntity(record.targetId)!,'poisoned')||spec.kind==='disease'){
   for(const condition of spec.conditions??[])setCondition(record,condition)
   if(record.templateId==='drow_poison'&&save.roll.total<=spec.dc-5)setCondition(record,'unconscious')
   if(record.templateId==='truth_serum')addHeroEffect(`affliction:${record.id}:truth`,record.targetId,[record.targetId],3600,{afflictionId:record.id,cannotKnowinglyLie:true})
  }else if(spec.conditions)endAffliction(record)
 }else{
  if(save.success)record.successes++
  if(record.successes>=(spec.successes??1))endAffliction(record)
  else if(spec.repeat==='daily')record.nextAt!+=86400
  else if(spec.repeat==='start'||spec.repeat==='end')record.nextAt=(gs.getState().phase==='combat'?now():record.nextAt??now())+6
 }
 record.lastTurn=(gs.getState().turnCounter??0)-(initial&&spec.repeat==='end'?1:0)
 record.turnContext={phase:gs.getState().phase,combatGeneration:gs.getState().phase==='combat'?gs.getState().combatGeneration??0:undefined}
 return {save,damageRoll,damageResolution,harmSaves,affliction:record,...incubationRoll?{incubationRoll}:{}}
}
export function reconcileAfflictions(){
 assertPetrifiedAfflictionHistory()
 for(const r of Object.values(gs.getState().dmTools?.afflictions?.records??{})){
  if(r.status!=='active'||r.petrificationPause)continue
  if(r.expiresAt!==undefined&&now()>=r.expiresAt){endAffliction(r);continue}
  if(r.templateId==='sight_rot'&&r.nextAt!==undefined&&now()>=r.nextAt){r.sightPenalty=1;delete r.nextAt}
 }
}
export function dueAfflictionEvent(record:AfflictionRecord):'midnight'|'daily'|'start'|'end'|'sewer_onset'|'sewer_rest'|undefined{
 if(!['pending','active'].includes(record.status)||record.petrificationPause)return
 const target=gs.getPhysicalCreature(record.targetId)
 if(!target||record.targetId==='player'&&gs.getPlayer().deathSaves?.dead||record.targetId!=='player'&&'isAlive'in target&&!target.isAlive)return
 if (record.templateId === 'sewer_plague') {
  const event = sewerPlagueEvent(gs.getState())
  return event?.afflictionId === record.id ? event.kind : undefined
 }
 if(record.templateId==='midnight_tears'&&record.nextAt!==undefined&&now()>=record.nextAt)return 'midnight'
 const spec=AFFLICTIONS[record.templateId]
 if((spec.repeat==='start'||spec.repeat==='end')&&gs.getState().phase!=='combat'&&record.nextAt!==undefined&&now()>=record.nextAt)return spec.repeat
 if(spec.repeat==='daily'&&record.nextAt!==undefined&&now()>=record.nextAt)return 'daily'
 if((spec.repeat==='start'||spec.repeat==='end')&&gs.getState().phase==='combat'&&gs.getState().currentTurn===record.targetId&&(record.lastTurn!==(gs.getState().turnCounter??0)||record.turnContext!==undefined&&(record.turnContext.phase!=='combat'||record.turnContext.combatGeneration!==(gs.getState().combatGeneration??0))))return spec.repeat
}
export function assertAfflictionEvents(phase:'action'|'end'='action', allowSewerOnsetAt?: number){
 assertPetrifiedAfflictionHistory()
 const due=Object.values(gs.getState().dmTools?.afflictions?.records??{}).filter(r=>{const event=dueAfflictionEvent(r);return event&&(event!=='end'||phase==='end')&&!(event==='sewer_onset'&&allowSewerOnsetAt!==undefined&&r.nextAt===allowSewerOnsetAt)})
 if(due.length)toolkitError('AFFLICTION_EVENT_REQUIRED',`Resolve the due source event explicitly with resolve_affliction_event: ${due.map(r=>r.id).join(', ')}.`)
}
export function assertAfflictionTurnOpen(id:string|undefined|null){
 if(id&&gs.getState().phase==='combat'&&gs.getState().currentTurn===id&&hero()?.effects.some(e=>e.kind==='affliction-turn-ending'&&e.targetIds.includes(id)))toolkitError('AFFLICTION_TURN_ENDING','The end-of-turn save was explicitly requested; no more actions or movement. Resolve remaining end events, then explicitly end the turn.')
}
export function commitAfflictionTurnEnd(id:string){
 if(gs.getState().phase!=='combat')return
 addHeroEffect('affliction-turn-ending',id,[id],1e12,{untilStartOf:id})
 gs.markActionUsed(id)
 if(id==='player'){hero().actionCredits=0;delete hero().attackAction}
}
export function afflictionHealingLimit(targetId:string,delta:number){
 const target=persistedConditionTarget(targetId)
 return target?limitedAfflictionHealing(gs.getState(),target,delta):0
}
export function assertAfflictionRestWindow(seconds:number){
 assertSewerPlagueUninterruptedRest(seconds)
 assertPetrifiedAfflictionHistory()
 const due=activeAfflictions('player','poison').filter(r=>!r.petrificationPause&&r.nextAt!==undefined&&r.nextAt<=now()+seconds)
 if(due.length)toolkitError('REST_AFFLICTION_EVENT_PENDING',`A poison event falls inside this rest. Advance explicitly to the event and resolve it before requesting rest again; no rest benefits or partial rest granted: ${due.map(r=>r.id).join(', ')}.`)
}
export function wakeAfflictionSleeper(targetId:string,byDamage:boolean){
 for(const r of activeAfflictions(targetId,'poison')){
  if(r.petrificationPause)continue
  const wake=AFFLICTIONS[r.templateId].wake
  if(!wake||!byDamage&&wake!=='action')continue
  for(const e of [...hero().effects])if(e.data.afflictionId===r.id&&e.data.condition==='unconscious')removeHeroEffect(e.id)
 }
}
export function afterAfflictionLongRest(targetId:string){
 for(const r of activeAfflictions(targetId,'disease'))if(!r.petrificationPause&&r.templateId==='sight_rot'){
  if(r.ointmentPending){r.ointmentPending=false;r.ointmentDoses++;if(r.ointmentDoses>=3){endAffliction(r,'cured');continue}}
  else if(r.sightPenalty)r.sightPenalty=Math.min(5,r.sightPenalty+1)
  if(r.sightPenalty===5&&!hero().effects.some(e=>e.data.afflictionId===r.id&&e.data.condition==='blinded'))setCondition(r,'blinded')
 }
}

/** Only actual bodies present in the active scene need explicitly chosen source turns.
 * Archives/distant actors are intentionally not given invented turns or history. */
export function afflictionRequiresInitiativeTurn(state:GameState,id:string){
 const body=id==='player'?state.player:state.monsters[id]??(isStatBackedNpc(state.npcs?.[id])&&state.npcs[id].mapId===state.currentMapId&&state.npcs[id].roomId===state.currentRoomId?state.npcs[id]:undefined)
 if(!body||(id==='player'?state.player.deathSaves?.dead:'isAlive'in body&&!body.isAlive))return false
 if(id!=='player'&&!(state.phase==='combat'&&state.initiativeOrder.includes(id))&&inferRoomIdOnMap(body.position,state.currentMapId!,state)!==state.currentRoomId)return false
 return Object.values(state.dmTools?.afflictions?.records??{}).some(record=>record.targetId===id&&record.status==='active'&&!record.petrificationPause&&(record.expiresAt===undefined||record.expiresAt>(state.worldTimeSeconds??0))&&['start','end'].includes(AFFLICTIONS[record.templateId].repeat??''))
}
export function assertAfflictionCombatRoster(combatants:readonly string[]){
 const state=gs.getState(),ids=new Set(['player',...Object.keys(state.monsters),...Object.keys(state.npcs??{})])
 for(const id of ids)if(afflictionRequiresInitiativeTurn(state,id)&&!combatants.includes(id))toolkitError('AFFLICTION_COMBAT_ROSTER_REQUIRED','Explicitly include each actual present body needing a source start/end poison save before initiative. No hidden body is revealed, enlisted or given a fabricated turn automatically.')
}
