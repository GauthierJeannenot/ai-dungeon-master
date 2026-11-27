import { swallowedBy,activeSwallowEpisode } from './swallow-state'
import type { GameState } from './types'
import { entityVerticalContext,bodyPhysicalHeight,physicalBodyPosture } from './jumping-state'
import { locomotionStateOf,actualLocomotionLocation } from './locomotion-state'
import { underwaterStateOf,underwaterSubjectKey,underwaterAttackKey,type UnderwaterSubject,type UnderwaterObservation } from './underwater-state'
import { getMonsterRecord } from './srd/monsters'
import { readPhysicalBarrier } from './vertical-barriers'

export const UNDERWATER_SOURCE='PHB2014 Underwater Combat, rules/books/phb-2014.md:6151–6159'
const MELEE_EXCEPTIONS=new Set(['dagger','javelin','shortsword','spear','trident'])
const RANGED_EXCEPTIONS=new Set(['light-crossbow','heavy-crossbow','hand-crossbow','net','javelin','spear','trident','dart'])
/** Curated bindings to the actual published action records already present in
 * this SRD catalog. This never parses an actor/item/player narrative name. */
const NATIVE_WEAPON_IDS:Readonly<Record<string,Readonly<Record<string,string>>>>={
 skeleton:{Shortsword:'shortsword'},satyr:{Shortsword:'shortsword'},veteran:{Shortsword:'shortsword','Heavy Crossbow':'heavy-crossbow'},
 mage:{Dagger:'dagger'},archmage:{Dagger:'dagger'},cult_fanatic:{Dagger:'dagger'},
 bandit:{'Light Crossbow':'light-crossbow'},thug:{'Heavy Crossbow':'heavy-crossbow'},knight:{'Heavy Crossbow':'heavy-crossbow'},
}
export const nativeUnderwaterWeaponId=(type:string,exactSourceActionName:string)=>NATIVE_WEAPON_IDS[type]?.[exactSourceActionName]
const same=(a:{x:number;y:number},b:{x:number;y:number})=>a.x===b.x&&a.y===b.y
export function underwaterSubjectFrame(state:GameState,subject:UnderwaterSubject,planned?:UnderwaterObservation['forPosition']){
 if(subject.kind==='object'){
  const object=state.dmTools?.objects[subject.objectId]
  if(!object||object.state==='destroyed')return undefined
  const cell=planned?.cell??object.cell
  return{subject,mapId:object.mapId,cell:{...cell},witness:JSON.stringify({kind:'object',id:object.id,creation:object.creation,mapId:object.mapId,cell,size:object.size}),
   body:undefined,object,zFeet:null as number|null,heightFeet:null as number|null,known:false}
 }
 const id=subject.entityId,body=id==='player'?state.player:state.monsters[id]??state.npcs?.[id]
 if(!body)return undefined
 const mapId='mapId'in body&&typeof body.mapId==='string'&&body.mapId?body.mapId:state.currentMapId
 if(!mapId)return undefined
 const scoped:GameState=mapId===state.currentMapId?state:{...state,currentMapId:mapId},vertical=entityVerticalContext(scoped,id),posture=planned?.posture??physicalBodyPosture(scoped,id),cell=planned?.cell??body.position
 let height=bodyPhysicalHeight(scoped,id)
 if(planned?.posture&&planned.posture!==physicalBodyPosture(scoped,id)){const measured=state.dmTools?.jumping?.bodies[id],support=state.dmTools?.jumping?.supports[id];height=measured?.posture===planned.posture?measured.heightFeet:support?.bodyHeightPosture===planned.posture?support.bodyHeightFeet??null:null}
 const zFeet=planned?planned.zFeet:vertical.known?vertical.zFeet:null,known=zFeet!==null
 return{subject,mapId,cell:{...cell},body,object:undefined,zFeet,heightFeet:height,known,
  witness:JSON.stringify({kind:'creature',id,mapId,cell,type:'type'in body?body.type:undefined,characterId:'characterId'in body?body.characterId:undefined,
   posture,heightFeet:height,vertical:{known,zFeet},containment:activeSwallowEpisode(scoped,id)?{episodeId:activeSwallowEpisode(scoped,id)!.id,hostId:activeSwallowEpisode(scoped,id)!.sourceId,status:activeSwallowEpisode(scoped,id)!.status}:undefined})}
}
export function observedWaterMedia(state:GameState,mapId:string){return Object.values(locomotionStateOf(state)?.media??{}).filter(medium=>medium.mode==='swim'&&medium.mapId===mapId)}
export function subjectWaterMedia(state:GameState,subject:UnderwaterSubject){if(subject.kind==='creature'&&swallowedBy(state,subject.entityId))return[];const frame=underwaterSubjectFrame(state,subject);return frame?observedWaterMedia(state,frame.mapId).filter(medium=>medium.cells.some(cell=>same(cell,frame.cell))):[]}
export function currentUnderwaterRecord(state:GameState,subject:UnderwaterSubject){
 if(subject.kind==='creature'&&swallowedBy(state,subject.entityId))return undefined
 const data=underwaterStateOf(state),frame=underwaterSubjectFrame(state,subject)
 if(!frame)return undefined
 const candidates=[data?.subjects[underwaterSubjectKey(subject)],...Object.values(data?.arrivals??{}).filter(record=>underwaterSubjectKey(record.subject)===underwaterSubjectKey(subject))]
 return candidates.find(record=>{if(!record||record.mapId!==frame.mapId||record.subjectWitness!==frame.witness)return false;const water=locomotionStateOf(state)?.media[record.waterMediumId];return water&&record.waterWitness===JSON.stringify(water)})
}
/** Numeric measurements can contradict a claimed full immersion, but unknown
 * body height never becomes a fabricated anatomical dimension. */
export function fullImmersionContradiction(state:GameState,subject:UnderwaterSubject,waterMediumId:string,planned?:UnderwaterObservation['forPosition']){
 const frame=underwaterSubjectFrame(state,subject,planned),water=locomotionStateOf(state)?.media[waterMediumId]
 if(!frame||!water||water.mode!=='swim'||water.mapId!==frame.mapId||!water.cells.some(cell=>same(cell,frame.cell)))return true
 if(frame.known&&(frame.zFeet!<water.bottomZFeet||frame.zFeet!>water.surfaceZFeet!||frame.heightFeet!==null&&frame.zFeet!+frame.heightFeet>water.surfaceZFeet!))return true
 if(subject.kind==='object'&&!planned)for(const barrier of Object.values(state.dmTools?.jumping?.barriers??{})){
  if(barrier.reference.kind!=='object'||barrier.reference.objectId!==subject.objectId)continue
  const read=readPhysicalBarrier({...state,currentMapId:frame.mapId},barrier.id)
  if(read.active&&(barrier.bottomZFeet<water.bottomZFeet||barrier.topZFeet>water.surfaceZFeet!))return true
 }
 return false
}
export function fullyImmersedInWater(state:GameState,subject:UnderwaterSubject):boolean|null{
 const frame=underwaterSubjectFrame(state,subject);if(!frame)return false
 const waters=subjectWaterMedia(state,subject)
 if(!waters.length)return false
 const record=currentUnderwaterRecord(state,subject)
 if(record)return record.fullyImmersed
 // A measured part above the water surface proves that the WHOLE subject is
 // not immersed. Being vertically inside does not prove its unmodeled width.
 if(frame.known&&waters.every(water=>frame.zFeet!>water.surfaceZFeet!||frame.heightFeet!==null&&frame.zFeet!+frame.heightFeet>water.surfaceZFeet!))return false
 if(subject.kind==='creature'){
  const scoped=frame.mapId===state.currentMapId?state:{...state,currentMapId:frame.mapId},location=actualLocomotionLocation(scoped,subject.entityId),move=location?locomotionStateOf(state)?.moves[location.sourceEventId]:undefined
  const conditions=(frame.body as{conditions?:string[]}|undefined)?.conditions??[]
  if(move?.input.surfaceSwimmingConfirmed&&!conditions.some(c=>['prone','unconscious','incapacitated','paralyzed','petrified','stunned'].includes(c))&&(frame.body?.hp?.current??0)>0)return false
 }
 return null
}
function alreadyFireDefended(state:GameState,subject:UnderwaterSubject){
 if(subject.kind==='object'){const profile=state.dmTools?.objects[subject.objectId]?.damageProfile;return Boolean(profile?.magicalResilience||profile?.immunities.includes('fire')||profile?.resistances.includes('fire'))}
 const body=subject.entityId==='player'?state.player:state.monsters[subject.entityId]??state.npcs?.[subject.entityId]
 if(!body)return false
 const source='type'in body?getMonsterRecord(body.type):undefined,raw=(source?.reference??source?.source) as{damage_immunities?:string[];damage_resistances?:string[]}|undefined
 return Boolean(('conditions'in body&&body.conditions?.includes('petrified'))||raw?.damage_immunities?.includes('fire')||raw?.damage_resistances?.includes('fire'))
}
export function underwaterFireDefenseIssue(state:GameState,subject:UnderwaterSubject){
 if(alreadyFireDefended(state,subject))return null
 return fullyImmersedInWater(state,subject)===null?{code:'UNDERWATER_FIRE_CONTEXT_REQUIRED',message:'The actual selected subject is in observed real water, but whether its whole body/object is immersed is unresolved and changes this fire packet. Record the compatible physical observation before attack/save/damage dice or costs.'}:null
}
function lineCells(from:{x:number;y:number},to:{x:number;y:number}){const count=Math.max(Math.abs(to.x-from.x),Math.abs(to.y-from.y));return Array.from({length:count+1},(_,i)=>({x:Math.round(from.x+(to.x-from.x)*(count?i/count:0)),y:Math.round(from.y+(to.y-from.y)*(count?i/count:0))}))}
export function waterAlongAttack(state:GameState,actorId:string,target:UnderwaterSubject){
 if(swallowedBy(state,actorId)||target.kind==='creature'&&swallowedBy(state,target.entityId))return[]
 const actor=underwaterSubjectFrame(state,{kind:'creature',entityId:actorId}),other=underwaterSubjectFrame(state,target);if(!actor||!other||actor.mapId!==other.mapId)return[]
 const path=lineCells(actor.cell,other.cell)
 return observedWaterMedia(state,actor.mapId).filter(water=>water.cells.some(cell=>path.some(point=>same(cell,point)))
  &&!(actor.known&&other.known&&actor.zFeet!>water.surfaceZFeet!&&other.zFeet!>water.surfaceZFeet!))
}
export interface UnderwaterAttackInput{actorId:string;target:UnderwaterSubject;weaponReference:string;canonicalWeaponId?:string;attackMode?:string;melee:boolean;weaponAttack:boolean;normalRangeCells?:number;distanceCells:number}
export interface UnderwaterWeaponContext{source:typeof UNDERWATER_SOURCE;actorId:string;target:UnderwaterSubject;weaponReference:string;canonicalWeaponId?:string;
 madeUnderwater:boolean|null;disadvantage:boolean;automaticMiss:boolean;nativeSwimmingSpeedFeet:number;observationEventId?:string;actorWitness?:string;targetWitness?:string;waterWitnesses:string[]}
export function underwaterWeaponContext(state:GameState,input:UnderwaterAttackInput){
 const actor=underwaterSubjectFrame(state,{kind:'creature',entityId:input.actorId}),target=underwaterSubjectFrame(state,input.target),waters=waterAlongAttack(state,input.actorId,input.target)
 const body=actor?.body,native=body&&'type'in body?getMonsterRecord(body.type)?.engine.movementModes?.swim:undefined
 const base:UnderwaterWeaponContext={source:UNDERWATER_SOURCE,actorId:input.actorId,target:input.target,weaponReference:input.weaponReference,canonicalWeaponId:input.canonicalWeaponId,madeUnderwater:false,disadvantage:false,automaticMiss:false,nativeSwimmingSpeedFeet:native??0,waterWitnesses:[]}
 if(!input.weaponAttack||!waters.length)return{context:base}
 const saved=underwaterStateOf(state)?.attacks[underwaterAttackKey(input.actorId,input.target,input.weaponReference,input.attackMode)]
 const full=currentUnderwaterRecord(state,{kind:'creature',entityId:input.actorId})
 const expectedWitness=underwaterAttackWitness(state,input)
 const savedWater=saved&&locomotionStateOf(state)?.media[saved.waterMediumId]
 const record=saved?.attackWitness===expectedWitness&&savedWater&&saved.waterWitness===JSON.stringify(savedWater)?saved:undefined
 const ownWaters=subjectWaterMedia(state,{kind:'creature',entityId:input.actorId}).filter(water=>!actor?.known||actor.zFeet!<=water.surfaceZFeet!)
 if(!record&&!full?.fullyImmersed&&!ownWaters.length)return{context:base}
 const immaterial=input.melee?Boolean(native&&native>0)||MELEE_EXCEPTIONS.has(input.canonicalWeaponId??''):RANGED_EXCEPTIONS.has(input.canonicalWeaponId??'')&&input.normalRangeCells!==undefined&&input.distanceCells<=input.normalRangeCells
 if(!record&&!full?.fullyImmersed&&immaterial)return{context:{...base,madeUnderwater:null,waterWitnesses:waters.map(water=>JSON.stringify(water))}}
 if(!record&&!full?.fullyImmersed)return{issue:{code:'UNDERWATER_ATTACK_CONTEXT_REQUIRED',message:'The actual chosen weapon attack crosses observed real water, and whether it is made underwater is decisive but unresolved. Record the compatible physical qualification for this exact actor, weapon/mode and target before any die or cost.'}}
 const madeUnderwater=record?.weaponAttack?.madeUnderwater??true
 const context:UnderwaterWeaponContext={...base,madeUnderwater,observationEventId:(record??full)!.eventId,actorWitness:actor?.witness,targetWitness:target?.witness,waterWitnesses:waters.map(water=>JSON.stringify(water))}
 if(madeUnderwater){
  context.disadvantage=input.melee?!(native&&native>0)&&!MELEE_EXCEPTIONS.has(input.canonicalWeaponId??''):!RANGED_EXCEPTIONS.has(input.canonicalWeaponId??'')
  context.automaticMiss=!input.melee&&input.normalRangeCells!==undefined&&input.distanceCells>input.normalRangeCells
 }
 return{context}
}
export function underwaterAttackWitness(state:GameState,input:Pick<UnderwaterAttackInput,'actorId'|'target'|'weaponReference'|'canonicalWeaponId'|'attackMode'>){return JSON.stringify({actor:underwaterSubjectFrame(state,{kind:'creature',entityId:input.actorId})?.witness,target:underwaterSubjectFrame(state,input.target)?.witness,weaponReference:input.weaponReference,canonicalWeaponId:input.canonicalWeaponId,attackMode:input.attackMode??'melee'})}
export function validateUnderwaterState(state:GameState){
 const data=underwaterStateOf(state);if(!data)return[]
 const issues:string[]=[]
 for(const [key,record]of Object.entries(data.subjects))if(key!==underwaterSubjectKey(record.subject)||record.at>(state.worldTimeSeconds??0)||!data.receipts[record.eventId])issues.push('An underwater physical qualification requires its original real subject, observation time and receipt.')
 for(const record of [...Object.values(data.subjects),...Object.values(data.attacks),...Object.values(data.arrivals)]){
  const receipt=data.receipts[record.eventId]
  if(!receipt||JSON.stringify(receipt.result.record)!==JSON.stringify(record))issues.push('An underwater physical observation must retain its exact original source receipt.')
 }
 return issues
}
