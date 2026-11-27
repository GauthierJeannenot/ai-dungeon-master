import { swallowedBy } from '../lib/swallow-state'
import { pendingStartTurnFire } from '../lib/weapon-consumable-state'
import { UnderwaterObservationSchema,initialUnderwaterState,underwaterStateOf,underwaterSubjectKey,underwaterAttackKey,type UnderwaterRecord,type UnderwaterSubject } from '../lib/underwater-state'
import { underwaterSubjectFrame,fullImmersionContradiction,currentUnderwaterRecord,waterAlongAttack,underwaterAttackWitness,fullyImmersedInWater,nativeUnderwaterWeaponId,underwaterWeaponContext,underwaterFireDefenseIssue,type UnderwaterAttackInput,type UnderwaterWeaponContext,UNDERWATER_SOURCE } from '../lib/underwater-rules'
import { getMapSpec,inferRoomIdOnMap } from '../lib/adventure-map'
import { locomotionStateOf } from '../lib/locomotion-state'
import { toolkitState,toolkitError,toolkitResult } from './toolkit'
import { equipmentId,selectedWeaponItem,weaponForReference,weaponItemHeld } from './equipment'
import { attackProfile,hasTrait } from './monster-rules'
import { getMonsterRecord } from '../lib/srd/monsters'
import * as gs from './game-state'
import { frigidWaterDueIssue } from '../lib/frigid-water-state'
import { assertFrigidWaterEpisodeRoom, frigidWaterQualification, reconcileFrigidWaterPresence } from './frigid-water'

const data=()=>((toolkitState() as{underwater?:ReturnType<typeof initialUnderwaterState>}).underwater??=initialUnderwaterState())
export function knownUnderwaterBreathingSource(entityId:string){
 const state=gs.getState(),body=gs.getPhysicalCreature(entityId)
 return Boolean(body&&(hasTrait(body,'Amphibious')||hasTrait(body,'Water Breathing'))||state.dmTools?.weather?.profiles[entityId]?.breathes===false)
}
export function underwaterAirRestorationIssue(entityId:string){
 if(swallowedBy(gs.getState(),entityId))return{code:'UNDERWATER_CONTAINED_AIR_CONTEXT_REQUIRED',message:'An actual contained interior has no established exterior breathable air. Inherited host XYZ does not restore air or erase any real existing breathing debt.'}
 const state=gs.getState(),subject={kind:'creature' as const,entityId}
 if(knownUnderwaterBreathingSource(entityId))return null
 const immersed=fullyImmersedInWater(state,subject)
 return immersed!==false?{code:'UNDERWATER_AIR_CONTEXT_REQUIRED',message:'This body is still wholly immersed, or its airway/immersion is unresolved in actual observed water. Establish its real emergence or supported breathable-water physiology before closing an episode as air; a nonce grants no new breath.'}:null
}
export function exactUnderwaterAttackInputs(actorId:string,target:UnderwaterSubject,reference:string,attackMode?:string):Pick<UnderwaterAttackInput,'actorId'|'target'|'weaponReference'|'canonicalWeaponId'|'attackMode'>{
 if(actorId==='player'){
  const flask=gs.getPlayer().inventory.find(item=>item.id===reference)
  if(flask&&['acid_vial','holy_water_flask','alchemists_fire_flask','oil_flask'].includes(equipmentId(flask))){if(!['throw','splash'].includes(attackMode??''))toolkitError('UNDERWATER_FLASK_MODE_REQUIRED','Retain the actual throw or splash mode of this exact owned flask.');return{actorId,target,weaponReference:flask.id,canonicalWeaponId:'improvised-flask',attackMode}}
  const weapon=weaponForReference(reference),item=selectedWeaponItem(reference)
  if(!weapon||weapon.id!=='unarmed'&&!item)toolkitError('UNDERWATER_WEAPON_REQUIRED','Choose the exact real weapon instance or unarmed profile whose attack is physically being qualified.')
  if(item&&!weaponItemHeld(item))toolkitError('UNDERWATER_WEAPON_NOT_HELD','Select the actual held weapon before qualifying its current physical attack; observation does not draw it.')
  return{actorId,target,weaponReference:weapon!.id==='unarmed'?'unarmed':item!.id,canonicalWeaponId:weapon!.improvised?.profileId??weapon!.id,attackMode}
 }
 const body=gs.getPhysicalCreature(actorId)
 if(!body||!('type'in body))toolkitError('UNDERWATER_ATTACK_SOURCE_REQUIRED','Choose an actual sourced creature and its exact published attack.')
 const profile=attackProfile(body as import('../lib/types').MonsterState,reference)
 return{actorId,target,weaponReference:profile.name,canonicalWeaponId:nativeUnderwaterWeaponId((body as import('../lib/types').MonsterState).type,profile.name),attackMode}
}
export function recordUnderwaterContext(raw:unknown){
 const input=UnderwaterObservationSchema.parse(raw),command=JSON.stringify(input),old=underwaterStateOf(gs.getState())?.receipts[input.eventId]
 if(old){if(old.command!==command)toolkitError('UNDERWATER_EVENT_CONFLICT','This immutable actual observation has different arguments.');return{...structuredClone(old.result),replayed:true}}
 const state=gs.getState(),frame=underwaterSubjectFrame(state,input.subject,input.forPosition),actualFrame=underwaterSubjectFrame(state,input.subject),water=locomotionStateOf(state)?.media[input.waterMediumId],fact=state.worldFacts?.find(f=>f.id===input.factId)
 if(!frame||frame.mapId!==state.currentMapId||!water||water.mode!=='swim'||water.mapId!==frame.mapId||!fact||fact.mapId!==frame.mapId)toolkitError('UNDERWATER_PHYSICAL_SOURCE_REQUIRED','Choose an actually present subject, observed real water and existing current-map physical fact. No actor, object, water, position or power is created.')
 if(input.subject.kind==='creature'&&swallowedBy(state,input.subject.entityId))toolkitError('UNDERWATER_CONTAINED_EXPOSURE_UNSUPPORTED','The real contained body is not exposed automatically to exterior water. No immersion, airway, source attack or water resistance is inferred from its host projection.')
 const pending=state.hero?.pending
 if(pending&&pending.command.type!=='movement')toolkitError('REACTION_PENDING','Retain the actual environment of the already rolled attack/save/check; complete that held resolution before replacing its physical observations.')
 const prospective=Boolean(input.forPosition&&actualFrame?.witness!==frame?.witness)
 const affectsPlayerImmersion = input.subject.kind === 'creature' && input.subject.entityId === 'player' && !prospective
 if (affectsPlayerImmersion) {
  const due = frigidWaterDueIssue(state)
  if (due) toolkitError(due.code, due.message)
  if (input.fullyImmersed && frigidWaterQualification(state, input.waterMediumId)) assertFrigidWaterEpisodeRoom()
 }
 if(input.forPosition){const map=getMapSpec(frame?.mapId,state);if(input.forPosition.cell.x>=map.grid.cols||input.forPosition.cell.y>=map.grid.rows||!inferRoomIdOnMap(input.forPosition.cell,frame!.mapId,state))toolkitError('UNDERWATER_DESTINATION_GEOMETRY_REQUIRED','The qualified future point must belong to an actual current-map room; no destination, path or support is created.');if(input.subject.kind==='object'&&input.forPosition.zFeet!==null)toolkitError('UNDERWATER_OBJECT_HEIGHT_UNKNOWN','The generic scene object has no represented base altitude; retain null rather than inventing a numeric object position.')}
 if(input.fullyImmersed&&fullImmersionContradiction(state,input.subject,input.waterMediumId,prospective?input.forPosition:undefined))toolkitError('UNDERWATER_MEASUREMENT_CONTRADICTION','Whole immersion contradicts an actual known body/object extent or water bounds. Resolve its real posture/position/water before observing another qualification.')
 const atSubject=water!.cells.some(cell=>cell.x===frame!.cell.x&&cell.y===frame!.cell.y)
 let attackInputs:ReturnType<typeof exactUnderwaterAttackInputs>|undefined,attackWitness:string|undefined
 if(input.weaponAttack){
  if(input.subject.kind!=='creature')toolkitError('UNDERWATER_ATTACK_CREATURE_REQUIRED','Only an actual creature makes this qualified weapon attack.')
  if(pending&&(input.subject.entityId!==pending.sourceId||input.weaponAttack.target.kind!=='creature'||input.weaponAttack.target.entityId!==pending.targetId))toolkitError('UNDERWATER_PENDING_ATTACK_MISMATCH','Before the initial opportunity die, qualify only its exact explicitly offered actor/target and selected weapon; no other pending attack is changed.')
  const targetFrame=underwaterSubjectFrame(state,input.weaponAttack.target)
  if(!targetFrame||targetFrame.mapId!==frame!.mapId)toolkitError('UNDERWATER_ATTACK_TARGET_REQUIRED','Choose the actual present target of this physical attack observation.')
  attackInputs=exactUnderwaterAttackInputs(input.subject.entityId,input.weaponAttack.target,input.weaponAttack.weaponReference,input.weaponAttack.attackMode)
  if(!waterAlongAttack(state,input.subject.entityId,input.weaponAttack.target).some(medium=>medium.mediumId===input.waterMediumId))toolkitError('UNDERWATER_ATTACK_MEDIUM_REQUIRED','The actual chosen water medium must intersect the selected weapon attack projection; no remote water penalty is granted.')
  if(input.fullyImmersed&&!input.weaponAttack.madeUnderwater)toolkitError('UNDERWATER_ATTACK_CONTRADICTION','The actual attacker is entirely underwater; this observation cannot give its weapon an air-origin exemption.')
  attackWitness=underwaterAttackWitness(state,attackInputs)
 }else if(!atSubject)toolkitError('UNDERWATER_SUBJECT_MEDIUM_REQUIRED','The actual selected subject must occupy its observed water region; a remote water body grants no resistance.')
 if(input.subject.kind==='creature'){
  const record=state.dmTools?.breathing?.creatures[input.subject.entityId],episode=record?.episode,body=gs.getPhysicalCreature(input.subject.entityId)
  const dead=input.subject.entityId==='player'?Boolean(state.player.deathSaves?.dead):body&&'isAlive'in body&&body.isAlive===false
  if(input.breathingEpisodeId&&episode?.id!==input.breathingEpisodeId)toolkitError('UNDERWATER_BREATHING_EVENT_REQUIRED','Keep the actual current breathing episode; no old or invented air budget is substituted.')
  if(input.fullyImmersed&&!dead&&!knownUnderwaterBreathingSource(input.subject.entityId)&&(!episode||input.breathingEpisodeId!==episode.id))toolkitError('UNDERWATER_BREATHING_CONTEXT_REQUIRED','First explicitly establish the actual holding/choking episode or source ability to breathe this water. Whole immersion supplies no free air or retrospective breath history.')
 }
 const arrivalKey=JSON.stringify([underwaterSubjectKey(input.subject),frame!.witness,input.waterMediumId]),previous=prospective?underwaterStateOf(state)?.arrivals[arrivalKey]:currentUnderwaterRecord(state,input.subject)??underwaterStateOf(state)?.subjects[underwaterSubjectKey(input.subject)],waterWitness=JSON.stringify(water)
 if(previous&&previous.fullyImmersed!==input.fullyImmersed&&previous.subjectWitness===frame!.witness&&previous.waterWitness===waterWitness)toolkitError('UNDERWATER_PHYSICAL_CHANGE_REQUIRED','This same actual body/object, posture and water have not changed. A new observation nonce cannot immerse or emerge it for free.')
 const stored=data(),subjectKey=underwaterSubjectKey(input.subject),attackKey=attackInputs?underwaterAttackKey(attackInputs.actorId,attackInputs.target,attackInputs.weaponReference,attackInputs.attackMode):undefined
 if(Object.keys(stored.receipts).length>=2048||prospective&&!stored.arrivals[arrivalKey]&&Object.keys(stored.arrivals).length>=512||!prospective&&!stored.subjects[subjectKey]&&Object.keys(stored.subjects).length>=512||attackKey&&!stored.attacks[attackKey]&&Object.keys(stored.attacks).length>=1024)toolkitError('UNDERWATER_HISTORY_LIMIT','The retained actual underwater observation history is full before any mutation or die.')
 const record:UnderwaterRecord={...input,...attackInputs&&input.weaponAttack?{weaponAttack:{...input.weaponAttack,weaponReference:attackInputs.weaponReference}}:{},mapId:frame!.mapId,subjectWitness:frame!.witness,waterWitness,at:state.worldTimeSeconds??0,revision:(previous?.revision??0)+1,...attackWitness?{attackWitness}:{}}
 const result={confidential:true,success:true,record:structuredClone(record),bodyMoved:false,airGranted:false,swimmingSpeedGranted:false,source:UNDERWATER_SOURCE}
 if(prospective)stored.arrivals[arrivalKey]=record;else stored.subjects[subjectKey]=record;if(attackKey)stored.attacks[attackKey]=record;stored.receipts[input.eventId]={command,result:structuredClone(result)}
 if (affectsPlayerImmersion) reconcileFrigidWaterPresence()
 return result
}
export function inspectUnderwaterContext(subject?:UnderwaterSubject){
 const state=gs.getState(),stored=underwaterStateOf(state)
 return{confidential:true,pendingStartTurnFire:pendingStartTurnFire(state)??null,subjects:subject?[{subject,current:currentUnderwaterRecord(state,subject)??null,fullyImmersed:fullyImmersedInWater(state,subject)}]:stored?.subjects??{},attacks:stored?.attacks??{},prospectiveQualifications:stored?.arrivals??{},source:UNDERWATER_SOURCE,diceRolled:false,positionChanged:false,breathingGranted:false}
}
export function assertHeldUnderwaterContext(context:UnderwaterWeaponContext){
 if(context.source!==UNDERWATER_SOURCE||!context.actorId||!context.weaponReference||!Array.isArray(context.waterWitnesses)||!Number.isFinite(context.nativeSwimmingSpeedFeet)||context.nativeSwimmingSpeedFeet<0||typeof context.disadvantage!=='boolean'||typeof context.automaticMiss!=='boolean'||context.madeUnderwater!==null&&typeof context.madeUnderwater!=='boolean'||context.automaticMiss&&context.madeUnderwater!==true)
  toolkitError('UNDERWATER_HELD_CONTEXT_INVALID','The held original weapon attack retains its exact actual water qualification, source profile and range result before another die or cost.')
}

export function captureUnderwaterWeaponContext(input:UnderwaterAttackInput,held?:UnderwaterWeaponContext){
 if(held){assertHeldUnderwaterContext(held);if(held.actorId!==input.actorId||held.weaponReference!==input.weaponReference||JSON.stringify(held.target)!==JSON.stringify(input.target))toolkitError('UNDERWATER_HELD_CONTEXT_INVALID','Keep the exact original underwater attack actor, target and physical weapon.');return held}
 const result=underwaterWeaponContext(gs.getState(),input);if(result.issue)toolkitError(result.issue.code,result.issue.message);return result.context!
}
export function automaticUnderwaterMiss(){return{notation:'automatic-failure',rolls:[] as number[],modifier:0,total:0,detail:'PHB2014 Underwater Combat: automatic miss beyond normal weapon range; no attack die rolled.'}}
