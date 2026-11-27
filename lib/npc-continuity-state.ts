import { z } from 'zod'
import type { GameState } from './types'
import { firstMapId } from './adventure-map'
const Id=z.string().min(1).max(120).refine(id=>!['constructor','prototype','__proto__'].includes(id)),At=z.number().int().nonnegative()
export const DeclareNpcSeparationSchema=z.object({eventId:Id,npcId:Id,transitionId:Id,decisionFactId:Id,actualSeparationConfirmed:z.literal(true)}).strict()
export const NpcContinuityStateSchema=z.object({version:z.literal(1),separations:z.record(z.string(),z.object({
 input:DeclareNpcSeparationSchema,command:z.string(),preparedAt:At,fromMapId:Id,toMapId:Id,bodyWitness:z.string(),decisionWitness:z.string(),
 status:z.enum(['prepared','departed','rejoined']),departedAt:At.optional(),arrivedAt:At.optional(),rejoinedAt:At.optional(),
 afflictionIds:z.array(Id),
}).strict())}).strict()
export const npcContinuityOf=(s:GameState)=>s.dmTools?.npcContinuity
/** Only an actual committed, reciprocally retained separation authorizes an
 * unobserved interval. It never creates a remote actor or pauses its disease. */
export function npcExplicitlyOffMap(s:GameState,id:string){
 const npc=s.npcs?.[id],map=npc?.mapId??firstMapId(s)
 if(!npc||map===s.currentMapId)return false
 return(npc.continuityHistory??[]).some(key=>{const r=npcContinuityOf(s)?.separations[key];return r?.status==='departed'&&r.input.npcId===id&&r.fromMapId===map})
}
export function validateNpcContinuityState(s:GameState){
 const errors:string[]=[],data=npcContinuityOf(s),at=s.worldTimeSeconds??0
 for(const[id,r]of Object.entries(data?.separations??{})){
  const npc=s.npcs?.[r.input.npcId]
  if(id!==r.input.eventId||r.command!==JSON.stringify(r.input)||r.preparedAt>at||!npc||r.fromMapId===r.toMapId)errors.push('A separation keeps its exact real NPC, explicit map transition and original command.')
  if(r.status==='prepared'){if(r.departedAt!==undefined||r.arrivedAt!==undefined||r.rejoinedAt!==undefined)errors.push('A prepared separation is not a map departure.')}
  else{
   if(r.departedAt===undefined||r.arrivedAt===undefined||r.departedAt<r.preparedAt||r.arrivedAt<r.departedAt||r.arrivedAt>at||!npc?.continuityHistory?.includes(id))errors.push('Each actual separation keeps reciprocal NPC history and true departure/arrival clocks.')
   if(r.status==='departed'&&((npc?.mapId??firstMapId(s))!==r.fromMapId||r.rejoinedAt!==undefined))errors.push('A separated NPC stays on its real original map without a fabricated move.')
   if(r.status==='rejoined'&&(r.rejoinedAt===undefined||r.rejoinedAt<r.arrivedAt!||r.rejoinedAt>at))errors.push('A reunion needs its actual subsequent return clock.')
  }
  for(const afflictionId of r.afflictionIds)if(s.dmTools?.afflictions?.records[afflictionId]?.targetId!==r.input.npcId)errors.push('Separation cannot erase or replace a retained source infection.')
 }
 for(const npc of Object.values(s.npcs??{}))for(const id of npc.continuityHistory??[]){const r=data?.separations[id];if(!r||r.input.npcId!==npc.id||r.status==='prepared')errors.push('A real NPC separation marker must retain its reciprocal history, even if the domain is removed.')}
 return errors
}
