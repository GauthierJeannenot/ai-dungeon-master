import { z } from 'zod'
import type { GameState } from './types'
import { groundGearPhysicalWitness as witness } from './ground-gear-recovery-state'

const Id=z.string().min(1).max(120).refine(s=>!['__proto__','prototype','constructor'].includes(s))
const Cell=z.object({x:z.number().int().nonnegative(),y:z.number().int().nonnegative()}).strict()
export const DeclareNpcPartySchema=z.object({eventId:Id,npcId:Id,role:z.enum(['civilian','ally']),agreementFactId:Id,
 releaseDoorId:Id.optional(),actualAgreementConfirmed:z.literal(true)}).strict()
export const ReleaseNpcPartySchema=z.object({eventId:Id,npcId:Id,decisionFactId:Id,actualReleaseConfirmed:z.literal(true)}).strict()
export const PartyMoveSchema=z.object({eventId:Id,npcId:Id,toCell:Cell,acknowledgeEventIds:z.array(Id).max(32).optional()}).strict()
export const PartyArrivalSchema=z.object({eventId:Id,npcId:Id,safetyFactId:Id,actualSafetyConfirmed:z.literal(true)}).strict()
export const PartyTravelSelectionSchema=z.object({npcId:Id,arrivalCell:Cell}).strict()
const Registration=z.object({input:DeclareNpcPartySchema,command:z.string(),at:z.number().int().nonnegative(),mapId:Id,
 roomId:Id,cell:Cell,bodySourceWitness:z.string(),agreementWitness:z.string(),memberIds:z.array(Id).min(1).max(32),
 originalController:z.literal('reactive_npc').optional(),releasedByEventId:Id.optional(),endedAt:z.number().int().nonnegative().optional()}).strict()
export const NpcPartyStateSchema=z.object({version:z.literal(1),registrations:z.record(z.string(),Registration),
 releases:z.record(z.string(),z.object({input:ReleaseNpcPartySchema,command:z.string(),at:z.number().int().nonnegative(),registrationId:Id,decisionWitness:z.string()}).strict()),
 movements:z.record(z.string(),z.object({input:PartyMoveSchema,command:z.string(),registrationId:Id,mapId:Id,at:z.number().int().nonnegative(),
  from:Cell,to:Cell,path:z.array(Cell),costFeet:z.number().nonnegative(),bodyWitness:z.string(),result:z.record(z.string(),z.unknown())}).strict()),
 arrivals:z.record(z.string(),z.object({input:PartyArrivalSchema,command:z.string(),registrationId:Id,npcId:Id,memberIds:z.array(Id).min(1),
  mapId:Id,roomId:Id,cell:Cell,at:z.number().int().nonnegative(),releaseDoorId:Id.optional(),bodyWitness:z.string(),safetyWitness:z.string(),journeyEventKeys:z.array(z.string()).min(1).max(640)}).strict()),
 transfers:z.record(z.string(),z.object({transitionId:Id,fromMapId:Id,toMapId:Id,at:z.number().int().nonnegative(),
  bodies:z.array(z.object({npcId:Id,registrationId:Id,from:Cell,to:Cell,bodyWitness:z.string()}).strict()).min(1).max(16)}).strict()),
}).strict()
export type NpcPartyState=z.infer<typeof NpcPartyStateSchema>
export function npcPartyPhysicalWitness(s:GameState,id:string){const n=s.npcs?.[id];return witness(n&&{id:n.id,type:n.type,hp:n.hp,conditions:n.conditions,position:n.position,mapId:n.mapId,roomId:n.roomId,group:n.group})}
export const npcPartyEventKey=(kind:'move'|'arrival'|'transfer',id:string)=>'npc-party:'+kind+':'+encodeURIComponent(id)
export function npcPartyBodySource(s:GameState,id:string){const n=s.npcs?.[id];return witness(n&&{id:n.id,type:n.type,statBlock:n.statBlock,
 group:n.group&&{rule:n.group.rule,members:n.group.members,initialCount:n.group.initialCount,memberMaxHp:n.group.memberMaxHp}})}
export function activeNpcPartyRegistration(s:GameState,id:string){
 const history=s.npcs?.[id]?.partyHistory??[],records=s.dmTools?.npcParty?.registrations
 for(const key of [...history].reverse()){const r=records?.[key];if(r&&r.endedAt===undefined)return r}
}
export function npcPartyRegistrationId(s:GameState,id:string){const r=activeNpcPartyRegistration(s,id);return r?.input.eventId}
/** Only an actual enrolled, sourced, nonhostile party body is not opposition.
 * A generic nonhostile actor or an old released role keeps existing behavior. */
export function isEnrolledNonhostileNpcCombatant(s:GameState,id:string):boolean{
 const npc=s.npcs?.[id],actor=s.monsters[id]
 return Boolean(actor&&npc&&'stats'in npc&&actor.hostile===false&&npc.hostile===false&&activeNpcPartyRegistration(s,id))
}
export function validateNpcPartyState(s:GameState):string[]{
 const errors:string[]=[],data=s.dmTools?.npcParty,at=s.worldTimeSeconds??0,expected=new Map<string,{npcId:string;value:unknown}>()
 for(const[id,m]of Object.entries(data?.movements??{}))expected.set(npcPartyEventKey('move',id),{npcId:m.input.npcId,value:m})
 for(const[id,a]of Object.entries(data?.arrivals??{}))expected.set(npcPartyEventKey('arrival',id),{npcId:a.npcId,value:a})
 for(const[id,t]of Object.entries(data?.transfers??{}))for(const b of t.bodies)expected.set(npcPartyEventKey('transfer',id)+':'+encodeURIComponent(b.npcId),{npcId:b.npcId,value:t})
 for(const[key,e]of expected)if(s.npcs?.[e.npcId]?.partyEvents?.[key]!==witness(e.value))errors.push('Each actual party event keeps its reciprocal immutable body marker.')
 for(const npc of Object.values(s.npcs??{}))for(const[key,value]of Object.entries(npc.partyEvents??{}))if(expected.get(key)?.npcId!==npc.id||witness(expected.get(key)?.value)!==value)errors.push('An actual party event marker cannot lose its movement, transfer or arrival record.')
 for(const[id,r]of Object.entries(data?.registrations??{})){
  const npc=s.npcs?.[r.input.npcId]
  if(id!==r.input.eventId||r.command!==witness(r.input)||r.at>at||!npc||!npc.partyHistory?.includes(id)
   ||r.bodySourceWitness!==npcPartyBodySource(s,r.input.npcId))errors.push('Retain the reciprocal actual NPC party declaration and its immutable sourced body.')
  if(r.endedAt!==undefined&&(!r.releasedByEventId||data?.releases[r.releasedByEventId]?.registrationId!==id||data.releases[r.releasedByEventId].at!==r.endedAt||r.endedAt<r.at||r.endedAt>at))errors.push('Retain the real dated party release.')
  if(r.input.role==='ally'&&npc?.group)errors.push('An authored shared-HP group cannot become an individual combat ally.')
 }
 for(const[id,r]of Object.entries(data?.releases??{}))if(id!==r.input.eventId||r.command!==witness(r.input)||data?.registrations[r.registrationId]?.releasedByEventId!==id||data.registrations[r.registrationId]?.input.npcId!==r.input.npcId||r.at>at)errors.push('Keep the original explicit NPC party release and its declaration.')
 for(const npc of Object.values(s.npcs??{})){
  const history=npc.partyHistory??[]
  if(new Set(history).size!==history.length||history.some(id=>data?.registrations[id]?.input.npcId!==npc.id))errors.push('Every NPC party marker retains its original declaration.')
  if(history.filter(id=>data?.registrations[id]?.endedAt===undefined).length>1)errors.push('One body cannot have multiple active party roles.')
 }
 for(const[id,m]of Object.entries(data?.movements??{}))if(id!==m.input.eventId||m.command!==witness(m.input)
  ||data?.registrations[m.registrationId]?.input.npcId!==m.input.npcId||m.at>at)errors.push('Keep each actual party movement and its original owner.')
 for(const[id,a]of Object.entries(data?.arrivals??{}))if(id!==a.input.eventId||a.command!==witness(a.input)||a.input.npcId!==a.npcId
  ||data?.registrations[a.registrationId]?.input.npcId!==a.npcId||a.at>at||a.journeyEventKeys.some(key=>expected.get(key)?.npcId!==a.npcId||key.startsWith('npc-party:arrival:')))errors.push('A rescue arrival keeps its actual body, member identities and party declaration.')
 for(const t of Object.values(data?.transfers??{}))if(t.at>at||t.fromMapId===t.toMapId||t.bodies.some(b=>data?.registrations[b.registrationId]?.input.npcId!==b.npcId))errors.push('Retain the real explicit cross-map party transport.')
 return errors
}
