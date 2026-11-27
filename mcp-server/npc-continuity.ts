import { DeclareNpcSeparationSchema,npcContinuityOf } from '../lib/npc-continuity-state'
import { firstMapId,resolveMapTransition } from '../lib/adventure-map'
import { isStatBackedNpc } from '../lib/npc-stat-blocks'
import { groundGearPhysicalWitness as witness } from '../lib/ground-gear-recovery-state'
import { cackleIncubationBoundary } from '../lib/cackle-fever-state'
import { toolkitState,toolkitError } from './toolkit'
import { available,now } from './hero-rules'
import * as gs from './game-state'
const data=()=>toolkitState().npcContinuity??={version:1 as const,separations:{}}
function bodyWitness(id:string){return witness(gs.getNpc(id))}
export function declareNpcSeparation(raw:unknown){
 const input=DeclareNpcSeparationSchema.parse(raw),command=JSON.stringify(input),old=npcContinuityOf(gs.getState())?.separations[input.eventId]
 if(old){if(old.command!==command)toolkitError('NPC_SEPARATION_EVENT_CONFLICT','Keep the exact original body, passage and declaration.');return{success:true,replayed:true,separation:old,seconds:0}}
 available();const s=gs.getState(),npc=gs.getNpc(input.npcId)
 if(s.phase==='combat'||!isStatBackedNpc(npc)||!npc.visible||!npc.isAlive||!gs.npcOnCurrentMap(npc)||npc.roomId!==s.currentRoomId||Math.max(Math.abs(npc.position.x-s.player.position.x),Math.abs(npc.position.y-s.player.position.y))>1)
  toolkitError('NPC_SEPARATION_ACTUAL_BODY_REQUIRED','Declare only one actual adjacent visible living sourced NPC staying on this map, outside combat.')
 const transition=resolveMapTransition({fromMapId:s.currentMapId!,transitionId:input.transitionId},s)
 if(!transition||!transition.id)toolkitError('NPC_SEPARATION_TRANSITION_REQUIRED','Choose an actual explicit transition leaving this current map.')
 const fact=s.worldFacts?.find(f=>f.id===input.decisionFactId&&f.mapId===s.currentMapId&&f.expires==='never'&&f.narrativeEffect?.cell.x===npc!.position.x&&f.narrativeEffect?.cell.y===npc!.position.y)
 if(!fact)toolkitError('NPC_SEPARATION_FACT_REQUIRED','Retain the durable actual local decision that this body stays here, never an automatic behavior or remote activity.')
 if(Object.values(s.dmTools?.npcRests?.records??{}).some(r=>r.status==='active'&&r.input.npcId===input.npcId))toolkitError('NPC_REST_DEPARTURE_REQUIRED','Finish or abandon this actually observed NPC rest before leaving observation.')
 if(Object.keys(npcContinuityOf(s)?.separations??{}).length>=128)toolkitError('NPC_SEPARATION_LIMIT','Retain the bounded actual separation history.')
 const separation={input,command,preparedAt:now(),fromMapId:s.currentMapId!,toMapId:transition!.toMapId,bodyWitness:bodyWitness(input.npcId),decisionWitness:witness(fact),status:'prepared' as const,
 afflictionIds:Object.values(s.dmTools?.afflictions?.records??{}).filter(r=>r.targetId===input.npcId&&['active','pending'].includes(r.status)).map(r=>r.id)}
 data().separations[input.eventId]=separation;return{success:true,replayed:false,separation,seconds:0,activityInvented:false}
}
export function preparedNpcSeparation(npcId:string,transitionId:string){const s=gs.getState();return Object.values(npcContinuityOf(s)?.separations??{}).find(r=>r.status==='prepared'&&r.input.npcId===npcId&&r.input.transitionId===transitionId&&r.fromMapId===s.currentMapId&&r.bodyWitness===bodyWitness(npcId)&&s.worldFacts?.some(f=>f.id===r.input.decisionFactId&&witness(f)===r.decisionWitness))}
export function prepareNpcMapDepartures(transitionId:string,moved:readonly string[]){
 const s=gs.getState(),selected:string[]=[],seen=new Set<string>()
 for(const r of Object.values(npcContinuityOf(s)?.separations??{}).reverse())if(!seen.has(r.input.npcId)&&!moved.includes(r.input.npcId)&&preparedNpcSeparation(r.input.npcId,transitionId)?.input.eventId===r.input.eventId){
  const crisis=Object.values(s.dmTools?.afflictions?.records??{}).find(a=>a.targetId===r.input.npcId&&a.cackleFever?.crisis&&a.cackleFever.crisis.endedAt===undefined&&a.cackleFever.crisis.endsAt>(s.worldTimeSeconds??0))
  if(crisis)toolkitError('NPC_SEPARATION_ACTIVE_CRISIS','Resolve the actual current laughing crisis before losing its physical observation; no off-map crisis turns are invented.')
  selected.push(r.input.eventId);seen.add(r.input.npcId)
 }
 return selected
}
export function assertNpcRestMapDeparture(){if(Object.values(gs.getState().dmTools?.npcRests?.records??{}).some(r=>r.status==='active'))toolkitError('NPC_REST_DEPARTURE_REQUIRED','Finish or explicitly abandon each actual observed NPC rest before a map departure; no remote sleep is credited.')}
export function returningSeparatedNpcIds(toMapId:string){const s=gs.getState();return[...new Set(Object.values(npcContinuityOf(s)?.separations??{}).filter(r=>{const npc=s.npcs?.[r.input.npcId];return r.status==='departed'&&r.fromMapId===toMapId&&isStatBackedNpc(npc)&&npc.isAlive&&(npc.mapId??firstMapId(s))===toMapId&&npc.continuityHistory?.includes(r.input.eventId)}).map(r=>r.input.npcId))]}
export function npcArrivalOnsets(ids:readonly string[]){const s=gs.getState(),tools=s.dmTools,afflictions=tools?.afflictions;if(!tools||!afflictions)return[];return Object.values(afflictions.records).filter(r=>ids.includes(r.targetId)).flatMap(record=>{
 const view={...s,dmTools:{...tools,afflictions:{...afflictions,records:{[record.id]:record}}}},due=cackleIncubationBoundary(view,now())
 return due?[{kind:'onset',afflictionId:due.id,creatureId:due.targetId,at:due.nextAt}]:[]
})}
/** Called only after the engine committed the explicit map transition. */
export function commitNpcContinuityMapChange(fromMapId:string,toMapId:string,transitionId:string,moved:readonly string[],departedAt:number,selected:readonly string[]){
 const s=gs.getState()
 for(const r of Object.values(npcContinuityOf(s)?.separations??{})){
  if(selected.includes(r.input.eventId)&&r.status==='prepared'&&r.fromMapId===fromMapId&&r.toMapId===toMapId&&r.input.transitionId===transitionId&&!moved.includes(r.input.npcId)){
   const npc=s.npcs?.[r.input.npcId];if(npc&&(npc.mapId??firstMapId(s))===fromMapId){r.status='departed';r.departedAt=departedAt;r.arrivedAt=now();(npc.continuityHistory??=[]).push(r.input.eventId)}
  }
  if(r.status==='departed'&&r.fromMapId===toMapId){r.status='rejoined';r.rejoinedAt=now()}
 }
}
