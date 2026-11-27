import { z } from 'zod'
import { DeclareNpcPartySchema,ReleaseNpcPartySchema,PartyMoveSchema,PartyArrivalSchema,activeNpcPartyRegistration,npcPartyRegistrationId,npcPartyBodySource,npcPartyPhysicalWitness,npcPartyEventKey,
 type NpcPartyState } from '../lib/npc-party-state'
import { getAdventureMap,firstMapId,inferRoomIdOnMap,getMapSpec,type GridCell } from '../lib/adventure-map'
import { groundGearPhysicalWitness as witness } from '../lib/ground-gear-recovery-state'
import { isStatBackedNpc } from '../lib/npc-stat-blocks'
import { navigationActor,navigationGrid,savedDoorState,geometricDistanceCells } from '../lib/navigation'
import { entityVerticalContext,actualSurfaceAt } from '../lib/jumping-state'
import { available,now } from './hero-rules'
import { toolkitState,toolkitError } from './toolkit'
import { executeNavigation } from './navigation'
import * as gs from './game-state'
const data=():NpcPartyState=>toolkitState().npcParty??={version:1,registrations:{},releases:{},movements:{},arrivals:{},transfers:{}}
function sealPartyEvent(id:string,key:string,value:unknown){const n=gs.getNpc(id)!;(n.partyEvents??={})[key]=witness(value)}
function sourceNpc(id:string){const npc=gs.getNpc(id);if(!isStatBackedNpc(npc)||!npc.visible||!npc.isAlive||!gs.npcOnCurrentMap(npc))toolkitError('NPC_PARTY_ACTUAL_BODY_REQUIRED','Choose a real visible living sourced NPC on this current map.');return npc!}
function capable(id:string){const npc=sourceNpc(id);if(npc.hp.current<1||npc.conditions.some(c=>['unconscious','incapacitated','paralyzed','petrified','stunned','restrained','grappled'].includes(c)))toolkitError('NPC_PARTY_BODY_UNABLE','This exact body cannot accompany the party by ordinary walking; resolve its actual state or use a supported physical transport.');return npc}
function nearby(id:string){const n=capable(id),s=gs.getState();if(n.roomId!==s.currentRoomId||geometricDistanceCells(n.position,s.player.position)>1)toolkitError('NPC_PARTY_OUT_OF_REACH','Approach the actual NPC in the current room.');return n}
function durableFact(id:string,npcId:string){const s=gs.getState(),n=sourceNpc(npcId),f=s.worldFacts?.find(f=>f.id===id&&f.mapId===s.currentMapId&&f.expires==='never'&&f.narrativeEffect?.cell.x===n.position.x&&f.narrativeEffect?.cell.y===n.position.y);if(!f)toolkitError('NPC_PARTY_FACT_REQUIRED','Retain the exact durable local MJ fact at this real body.');return f!}
export function declareNpcParty(raw:unknown){
 const input=DeclareNpcPartySchema.parse(raw),command=witness(input),old=gs.getState().dmTools?.npcParty?.registrations[input.eventId]
 if(old){if(old.command!==command)toolkitError('NPC_PARTY_EVENT_CONFLICT','Retain the original party-role command.');return{success:true,replayed:true,registration:old}}
 available();const s=gs.getState(),npc=nearby(input.npcId)
 if(s.phase==='combat'||npc.disposition!=='helpful'||activeNpcPartyRegistration(s,npc.id))toolkitError('NPC_PARTY_AGREEMENT_REQUIRED','Declare one new actual voluntary helpful NPC role outside combat.')
 if(input.role==='ally'&&npc.group)toolkitError('NPC_PARTY_GROUP_COMBAT_UNSUPPORTED','This authored shared-HP group is a civilian escort, not an individual recruited combatant.')
 const spec=getAdventureMap(s).npcs.find(n=>n.id===npc.id)?.party
 if((spec?.releaseDoorId&&spec.releaseDoorId!==input.releaseDoorId)||(input.releaseDoorId&&(savedDoorState(s,input.releaseDoorId)!=='open'||!getAdventureMap(s).doors?.find(d=>d.id===input.releaseDoorId)?.sides.some(side=>side.roomId===npc.roomId))))toolkitError('NPC_PARTY_RELEASE_REQUIRED','Open the exact authored cell gate before enrolling its occupants; declaration never unlocks it.')
 const fact=durableFact(input.agreementFactId,npc.id)
 if(Object.keys(s.dmTools?.npcParty?.registrations??{}).length>=128)toolkitError('NPC_PARTY_HISTORY_LIMIT','Retain the bounded declarations; do not erase past roles.')
 const record={input,command,at:now(),mapId:s.currentMapId??firstMapId(s),roomId:npc.roomId!,cell:{...npc.position},bodySourceWitness:npcPartyBodySource(s,npc.id),
  agreementWitness:witness(fact),memberIds:npc.group?.members.map(m=>m.id)??[npc.id],...(npc.controller?{originalController:npc.controller}:{})}
 data().registrations[input.eventId]=record;(npc.partyHistory??=[]).push(input.eventId);npc.controller='reactive_npc';npc.hostile=false
 return{success:true,replayed:false,registration:record,hitPointsUnchanged:true,actionsGranted:false,seconds:0}
}
export function releaseNpcParty(raw:unknown){
 const input=ReleaseNpcPartySchema.parse(raw),command=witness(input),old=gs.getState().dmTools?.npcParty?.releases[input.eventId]
 if(old){if(old.command!==command)toolkitError('NPC_PARTY_RELEASE_CONFLICT','Retain the exact original release.');return{success:true,replayed:true,release:old}}
 available();const s=gs.getState(),npc=nearby(input.npcId),r=activeNpcPartyRegistration(s,npc.id)
 if(s.phase==='combat'||!r)toolkitError('NPC_PARTY_RELEASE_OUTSIDE_COMBAT','Release only an actual currently declared adjacent party NPC outside combat.')
 if(Object.keys(data().releases).length>=128)toolkitError('NPC_PARTY_RELEASE_LIMIT','Retain actual release history.')
 const fact=durableFact(input.decisionFactId,npc.id),release={input,command,at:now(),registrationId:r!.input.eventId,decisionWitness:witness(fact)}
 r!.endedAt=now();r!.releasedByEventId=input.eventId;data().releases[input.eventId]=release
 if(r!.originalController)npc.controller=r!.originalController;else delete npc.controller
 return{success:true,replayed:false,release,bodyMoved:false,hitPointsUnchanged:true,resourcesGranted:false}
}
export function movePartyNpc(raw:unknown){
 const input=PartyMoveSchema.parse(raw),command=witness(input),old=gs.getState().dmTools?.npcParty?.movements[input.eventId]
 if(old){if(old.command!==command)toolkitError('NPC_PARTY_MOVE_CONFLICT','Retain the original movement.');return{success:true,replayed:true,...old.result}}
 available();const s=gs.getState(),npc=capable(input.npcId),registrationId=npcPartyRegistrationId(s,npc.id)
 if(!registrationId||s.phase==='combat')toolkitError('NPC_PARTY_EXPLORATION_MOVE_REQUIRED','Outside combat choose a declared actual escort; in combat use its own npc_action activation.')
 if(Object.keys(data().movements).length>=512)toolkitError('NPC_PARTY_MOVE_HISTORY_LIMIT','Retain actual movement history.')
 const from={...npc.position},result=executeNavigation(npc.id,{kind:'cell',cell:input.toCell},false,input.acknowledgeEventIds??[])
 data().movements[input.eventId]={input,command,registrationId:registrationId!,mapId:s.currentMapId??firstMapId(s),at:now(),from,to:{...npc.position},
  path:result.path,costFeet:result.costCells*5,bodyWitness:npcPartyPhysicalWitness(s,npc.id),result:result as unknown as Record<string,unknown>}
 sealPartyEvent(npc.id,npcPartyEventKey('move',input.eventId),data().movements[input.eventId])
 return{success:true,replayed:false,...result}
}
export function attestPartyArrival(raw:unknown){
 const input=PartyArrivalSchema.parse(raw),command=witness(input),old=gs.getState().dmTools?.npcParty?.arrivals[input.eventId]
 if(old){if(old.command!==command)toolkitError('NPC_PARTY_ARRIVAL_CONFLICT','Retain the original arrival.');return{success:true,replayed:true,arrival:old}}
 available();const s=gs.getState(),npc=nearby(input.npcId),r=activeNpcPartyRegistration(s,npc.id),spec=getAdventureMap(s).npcs.find(n=>n.id===npc.id)?.party
 if(s.phase==='combat'||!r||!spec?.safeRoomIds.includes(npc.roomId!))toolkitError('NPC_PARTY_SAFE_DESTINATION_REQUIRED','Reach an authored safe destination with the real recruited body before recording an escort arrival.')
 if(npc.group&&(npc.group.remainingCount!==npc.group.initialCount||npc.hp.current!==npc.hp.max))toolkitError('NPC_PARTY_GROUP_IDENTITIES_UNKNOWN','The existing attrition model cannot identify which named members are safe after group harm; no named rescue is invented.')
 const moved=Object.values(s.dmTools?.npcParty?.movements??{}).some(m=>m.registrationId===r!.input.eventId&&m.path.length>1)
  ||Object.values(s.dmTools?.npcParty?.transfers??{}).some(t=>t.bodies.some(b=>b.registrationId===r!.input.eventId))
 if(!moved)toolkitError('NPC_PARTY_ACTUAL_JOURNEY_REQUIRED','A helpful disposition or safety declaration alone is not a real escort journey.')
 if(Object.values(s.monsters).some(m=>m.isAlive&&m.hostile!==false&&inferRoomIdOnMap(m.position,s.currentMapId,s)===npc.roomId))toolkitError('NPC_PARTY_DESTINATION_HOSTILE','Resolve actual hostile occupants of the selected destination first.')
 const journeyEventKeys=Object.keys(npc.partyEvents??{}).filter(key=>key.startsWith('npc-party:move:')||key.startsWith('npc-party:transfer:'))
 const fact=durableFact(input.safetyFactId,npc.id),arrival={input,command,registrationId:r!.input.eventId,npcId:npc.id,memberIds:r!.memberIds,
  mapId:s.currentMapId??firstMapId(s),roomId:npc.roomId!,cell:{...npc.position},at:now(),...(r!.input.releaseDoorId?{releaseDoorId:r!.input.releaseDoorId}:{}),bodyWitness:npcPartyPhysicalWitness(s,npc.id),safetyWitness:witness(fact),journeyEventKeys}
 if(Object.keys(data().arrivals).length>=128)toolkitError('NPC_PARTY_ARRIVAL_HISTORY_LIMIT','Retain actual arrivals.')
 data().arrivals[input.eventId]=arrival;sealPartyEvent(npc.id,npcPartyEventKey('arrival',input.eventId),arrival);return{success:true,replayed:false,arrival,questNotAutomaticallyGranted:true}
}
export function inspectNpcParty(){const s=gs.getState();return{registrations:s.dmTools?.npcParty?.registrations??{},arrivals:s.dmTools?.npcParty?.arrivals??{},
 bodies:Object.values(s.npcs??{}).filter(n=>activeNpcPartyRegistration(s,n.id)).map(n=>({id:n.id,mapId:n.mapId,position:n.position,hp:n.hp,conditions:n.conditions,
  role:activeNpcPartyRegistration(s,n.id)!.input.role,memberIds:activeNpcPartyRegistration(s,n.id)!.memberIds})),source:'DMG2014 NPC Party Members 3538–3542; authored escort geography; explicit user role convention.'}}

export type PartyTransferPlan={transitionId:string;fromMapId:string;toMapId:string;bodies:Array<{npcId:string;registrationId:string;from:GridCell;to:GridCell;bodyWitness:string}>;physical?:ReturnType<typeof gs.prepareNpcPartyPhysicalArrival>}
export function preparePartyTransfer(transitionId:string,toMapId:string,arrivalRoomId:string,selections:readonly {npcId:string;arrivalCell:GridCell}[],departureCell:GridCell,playerArrivalCell:GridCell):PartyTransferPlan{
 const s=gs.getState(),seen=new Set<string>(),to=getMapSpec(toMapId,s),floors=s.sceneMemory?.floorMonsters as Record<string,typeof s.monsters>|undefined
 if(Object.keys(s.dmTools?.npcParty?.transfers??{}).length>=128&&selections.length)toolkitError('NPC_PARTY_TRANSFER_HISTORY_LIMIT','Retain actual party transfers.')
 const dest={...s,currentMapId:toMapId,player:{...s.player,position:playerArrivalCell},monsters:floors?.[toMapId]??{}},occupied=new Set<string>(),bodies:PartyTransferPlan['bodies']=[]
 for(const selection of selections){const n=capable(selection.npcId),r=activeNpcPartyRegistration(s,n.id),v=entityVerticalContext(s,n.id)
  if(seen.has(n.id)||!r||geometricDistanceCells(n.position,departureCell)>1||n.roomId!==s.currentRoomId||!v.known||v.airborne||v.zFeet!==0||geometricDistanceCells(n.position,departureCell)>0&&!navigationGrid(s,n.id,getMapSpec(s.currentMapId,s).geometry).step(n.position,departureCell,false,false))
   toolkitError('NPC_PARTY_TRANSFER_DEPARTURE_REQUIRED','Choose each real declared walking companion once, adjacent to the actual departure on supported ground.')
  if(navigationActor(s,n.id).speed<=0)toolkitError('NPC_PARTY_TRANSFER_IMMOBILE','The actual companion has no effective walking speed; map travel never bypasses a speed-zero source.')
  if(s.hero?.effects.some(e=>e.kind==='grapple'&&(e.sourceId===n.id||e.targetIds.includes(n.id))&&e.expiresAt>(s.worldTimeSeconds??0))
   ||s.monsterEffects?.some(e=>e.kind==='grapple'&&(e.sourceId===n.id||e.targetId===n.id)&&(e.expiresAt===undefined||e.expiresAt>(s.worldTimeSeconds??0))))
   toolkitError('NPC_PARTY_TRANSFER_GRAPPLE_UNSUPPORTED','Release the actual companion grapple before changing maps; a party transfer never carries its other body implicitly.')
  if(selection.arrivalCell.x===playerArrivalCell.x&&selection.arrivalCell.y===playerArrivalCell.y)toolkitError('NPC_PARTY_PLAYER_ARRIVAL_OCCUPIED','A companion cannot occupy the actual player destination.')
  const key=selection.arrivalCell.x+','+selection.arrivalCell.y
  if(occupied.has(key)||inferRoomIdOnMap(selection.arrivalCell,toMapId,s)!==arrivalRoomId||!navigationGrid(dest,n.id,to.geometry).free(selection.arrivalCell))
   toolkitError('NPC_PARTY_TRANSFER_ARRIVAL_REQUIRED','Choose explicit distinct free cells in the real destination room; no destination is invented.')
  const surfaces=actualSurfaceAt(dest,selection.arrivalCell),floor=surfaces.some(f=>f.kind==='support'&&f.elevationFeet===0)
  const water=Object.values(s.dmTools?.jumping?.locomotion?.media??{}).some(m=>m.mapId===toMapId&&m.mode==='swim'&&m.cells.some(c=>c.x===selection.arrivalCell.x&&c.y===selection.arrivalCell.y))
  if(!floor&&(water||surfaces.some(f=>f.kind==='gap'||f.elevationFeet!==0)))toolkitError('NPC_PARTY_TRANSFER_SUPPORT_REQUIRED','This actual arrival needs its measured supporting floor; party travel cannot grant a landing or water walking.')
  seen.add(n.id);occupied.add(key);bodies.push({npcId:n.id,registrationId:r!.input.eventId,from:{...n.position},to:{...selection.arrivalCell},bodyWitness:npcPartyPhysicalWitness(s,n.id)})
 }
 const physical=bodies.length?gs.prepareNpcPartyPhysicalArrival(bodies.map(b=>({id:b.npcId,cell:b.to,kind:'arrival' as const})),toMapId):undefined
 return{transitionId,fromMapId:s.currentMapId??firstMapId(s),toMapId,bodies,physical}
}
export function commitPartyTransfer(plan:PartyTransferPlan){
 if(!plan.bodies.length)return
 const s=gs.getState();if(s.currentMapId!==plan.toMapId)toolkitError('NPC_PARTY_TRANSFER_COMMIT_REQUIRED','Commit only after the same actual player transition.')
 for(const b of plan.bodies){const n=s.npcs![b.npcId];n.mapId=plan.toMapId;n.roomId=inferRoomIdOnMap(b.to,plan.toMapId,s);n.position={...b.to}
  delete s.monsters[b.npcId]
  for(const floor of Object.values((s.sceneMemory?.floorMonsters??{}) as Record<string,Record<string,unknown>>))delete floor[b.npcId]
 }
 const key=`party-transfer:${plan.transitionId}:${now()}:${Object.keys(data().transfers).length}`
 if(Object.keys(data().transfers).length>=128)toolkitError('NPC_PARTY_TRANSFER_HISTORY_LIMIT','Retain actual party transfers.')
 data().transfers[key]={transitionId:plan.transitionId,fromMapId:plan.fromMapId,toMapId:plan.toMapId,bodies:plan.bodies,at:now()}
 for(const b of plan.bodies)sealPartyEvent(b.npcId,npcPartyEventKey('transfer',key)+':'+encodeURIComponent(b.npcId),data().transfers[key])
 if(plan.physical)gs.commitNpcPartyPhysicalArrival(plan.physical)
}
