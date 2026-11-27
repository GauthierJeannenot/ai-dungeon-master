import type { GameState } from './types'
import { activeNpcPartyRegistration } from './npc-party-state'
import { firstMapId,inferRoomIdOnMap } from './adventure-map'
import { isStatBackedNpc } from './npc-stat-blocks'
import type { CyclePartyMember } from './adventuring-cycle-state'
export class CyclePartyObservationError extends Error {constructor(public code:string,message:string){super(message)}}
/** Current real P3 bodies only. Historical presence is never reconstructed by
 * this projection: the cycle start binds its already explicit qualification. */
export function observeCycleParty(s:GameState,mapId=s.currentMapId??firstMapId(s),roomId=s.currentRoomId){
 const members:CyclePartyMember[]=[],deceasedNpcIds:string[]=[]
 for(const npc of Object.values(s.npcs??{}).sort((a,b)=>a.id.localeCompare(b.id))){
  const registration=activeNpcPartyRegistration(s,npc.id);if(!registration)continue
  if(!isStatBackedNpc(npc))throw new CyclePartyObservationError('ADVENTURING_CYCLE_PARTY_BODY_REQUIRED','The registered party needs its actual sourced body, not an invented character level or HP.')
  const actualMap=npc.mapId??firstMapId(s),actualRoom=inferRoomIdOnMap(npc.position,actualMap,s)
  // Shared-HP attrition does not attest that the named group representative
  // died. Its local zero-active-body identities require another real procedure.
  if(npc.group&&(!npc.isAlive||npc.group.remainingCount<1)){
   if(actualMap===mapId&&actualRoom===roomId)throw new CyclePartyObservationError('ADVENTURING_CYCLE_GROUP_IDENTITIES_UNAVAILABLE','The local shared-HP group has zero active units and unknown named outcomes; no death or XP recipient is invented.')
   continue
  }
  if(!npc.isAlive){deceasedNpcIds.push(npc.id);continue}
  if(!actualRoom)throw new CyclePartyObservationError('ADVENTURING_CYCLE_PARTY_LOCATION_REQUIRED','Retain the real party body on an actual authored or installed scene cell.')
  const units=npc.group?.remainingCount??1,unknown=Boolean(npc.group&&npc.group.remainingCount!==npc.group.initialCount)
  if(units<1||units>32)throw new CyclePartyObservationError('ADVENTURING_CYCLE_PARTY_COUNT_REQUIRED','Retain the actual bounded individual/group headcount before an estimate.')
  const names=unknown?undefined:npc.group?.members.map(m=>m.id)??[npc.id]
  members.push({npcId:npc.id,registrationId:registration.input.eventId,role:registration.input.role,scope:actualMap===mapId&&actualRoom===roomId?'present':'off_scene',mapId:actualMap,roomId:actualRoom,
   shareUnits:units,...names?{namedMemberIds:names}:{},survivingIdentitiesIndeterminate:unknown,body:structuredClone({...npc,mapId:actualMap,roomId:actualRoom}) as unknown as Record<string,unknown>})
 }
 return{members,deceasedNpcIds}
}
