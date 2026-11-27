import { z } from 'zod'
import { npcExplicitlyOffMap } from './npc-continuity-state'
import type { GameState } from './types'
import { groundGearPhysicalWitness as witness } from './ground-gear-recovery-state'
const Id = z.string().min(1).max(180)
const Time = z.number().int().nonnegative()
const Value = z.record(z.string(), z.unknown())
export const CACKLE_SOURCE = 'DMG2014 Cackle Fever, rules/books/dmg-2014.md:8418–8428'
export const QualifyCackleHostSchema = z.object({ eventId: Id, creatureId: Id, factId: Id,
  actualHumanoidConfirmed: z.literal(true), actualGnome: z.boolean() }).strict()
export const SeedCackleCaseSchema = z.object({ eventId: Id, creatureId: Id, factId: Id,
  actualNewNpcInfectionConfirmed: z.literal(true) }).strict()
export const RecordCackleStressSchema = z.object({ eventId: Id, creatureId: Id, factId: Id,
  reason: z.string().trim().min(1).max(600), actualGreatStressConfirmed: z.literal(true) }).strict()
export const ResolveCackleEventSchema = z.object({ eventId: Id, endTurn: z.literal(true).optional(),attemptSave:z.boolean().optional() }).strict()
export const CackleDiseaseSchema = z.object({ incubationHours: z.number().int().min(1).max(4),
  incubationSuspendedSeconds:Time.optional(),
  suspensions:z.array(z.object({from:Time,to:Time,incubationActive:z.boolean(),crisisId:Id.optional(),pauseWitness:z.string()}).strict()).max(128).optional(),
  dc: z.number().int().min(0).max(13), recoveryFailures: z.number().int().nonnegative(),
  onset: z.object({ at: Time, exhaustionEventId: Id, npcRestId:Id.optional() }).strict().optional(),
  crisis: z.object({ id: Id, dc: z.number().int().min(1).max(13), startedAt: Time, endsAt: Time,
    endedAt: Time.optional(), suspendedSeconds:Time.optional(),effectId: Id }).strict().optional(),
}).strict()
const Event = z.object({ id: Id, kind: z.enum(['stress','contagion','repeat','rest']), targetId: Id,
  afflictionId: Id.optional(), sourceId: Id.optional(), sourceAfflictionId: Id.optional(),
  at: Time, dc: z.number().int().min(1).max(13), turnKey: z.string().optional(),
  source: Value, sourceWitness: z.string(), input: Value.optional(), command: z.string().optional(),
  heldWitness: z.string().optional(), result: Value.optional(), resultWitness: z.string().optional(),
}).strict()
export const CackleFeverStateSchema = z.object({ version: z.literal(1),source:Value.optional(),
  hosts: z.record(z.string(),z.object({ input:QualifyCackleHostSchema, at:Time, bodyType:Id, fact:Value, command:z.string() }).strict()),
  seeds: z.record(z.string(),z.object({ input:SeedCackleCaseSchema, at:Time, afflictionId:Id, incubation:Value, fact:Value, command:z.string() }).strict()),
  events:z.record(z.string(),Event),
  stressFacts:z.record(z.string(),z.object({ input:RecordCackleStressSchema,at:Time,eventId:Id,command:z.string() }).strict()),
  madness:z.record(z.string(),z.object({ afflictionId:Id,targetId:Id,at:Time,roll:Value,range:z.tuple([z.number(),z.number()]),text:z.string(),source:Id,sourceMetadata:Value }).strict()),
}).strict()
export type CackleEvent = z.infer<typeof Event>
export type CackleData = z.infer<typeof CackleFeverStateSchema>
export const initialCackleFever = (): CackleData => ({ version:1,hosts:{},seeds:{},events:{},stressFacts:{},madness:{} })
export const cackleStateOf = (state:GameState) => state.dmTools?.cackleFever
export const cackleWitness = witness
export function cackleRecords(state:GameState) {
  return Object.values(state.dmTools?.afflictions?.records??{}).filter(record=>record.templateId==='cackle_fever')
}
export function cackleBodyAlive(state:GameState,id:string){const actor=id==='player'?state.player:state.monsters[id]??state.npcs?.[id];return Boolean(actor?.hp&&(id==='player'?!state.player.deathSaves?.dead:('isAlive'in actor&&actor.isAlive!==false)))}
export function cackleDiseaseActive(state:GameState,id:string) {
  if(!cackleBodyAlive(state,id))return undefined
  return cackleRecords(state).find(record=>record.targetId===id&&record.status==='active'&&!record.petrificationPause)
}
export function cackleExhaustionFloor(state:GameState,id:string) {
  return cackleBodyAlive(state,id)&&cackleRecords(state).some(record=>record.targetId===id&&record.status==='active'&&record.cackleFever?.onset) ? 1 : 0
}
export function cackleIncubationBoundary(state:GameState,until:number,departing:ReadonlySet<string>=new Set()) {
  return cackleRecords(state).filter(record=>record.status==='active'&&cackleBodyAlive(state,record.targetId)&&!npcExplicitlyOffMap(state,record.targetId)&&!departing.has(record.targetId)&&record.nextAt!==undefined).map(record=>{
   if(!record.petrificationPause)return record
   const providers=[...(state.hero?.effects??[]).filter(effect=>effect.targetIds.includes(record.targetId)&&effect.data.condition==='petrified'),
    ...(state.monsterEffects??[]).filter(effect=>effect.targetId===record.targetId&&effect.conditions.includes('petrified'))]
   if(!providers.length||providers.some(effect=>effect.expiresAt===undefined))return undefined
   const endsAt=Math.max(...providers.map(effect=>effect.expiresAt!))
   return endsAt<=until?{...record,nextAt:record.nextAt!+endsAt-record.petrificationPause.pausedAt}:undefined
  }).filter(record=>record!==undefined&&record.nextAt!<=until).sort((a,b)=>a!.nextAt!-b!.nextAt!)[0]
}
export function cackleLaughter(state:GameState,id:string) {
  const record=cackleDiseaseActive(state,id),crisis=record?.cackleFever?.crisis
  const actor=id==='player'?state.player:state.monsters[id]??state.npcs?.[id]
  return record&&actor?.hp&&actor.hp.current>0&&!actor.conditions?.includes('unconscious')&&crisis&&!crisis.endedAt&&crisis.endsAt>(state.worldTimeSeconds??0)?{record,crisis}:undefined
}


/** Conservative batch bound: a currently incubating case can become symptomatic
 * during an original multi-turn/batch request. No first cost is spent. */
export function cackleBatchIssue(state:GameState,ids:readonly string[]) {
 return cackleRecords(state).some(record=>record.status==='active'&&cackleBodyAlive(state,record.targetId)&&ids.includes(record.targetId))
  ?{code:'CACKLE_ATTACK_BATCH_UNSUPPORTED',message:'This bounded disease implementation requires individual explicitly chosen attacks/turns while a selected body has an active infection, including incubation. No batch die or action has been spent.'}:null
}

export function cackleCarrierImmune(state:GameState,targetId:string,sourceId:string,at=state.worldTimeSeconds??0){
 return Object.values(cackleStateOf(state)?.events??{}).some(event=>event.kind==='contagion'&&event.targetId===targetId&&event.sourceId===sourceId
  &&(event.result?.save as {success?:boolean}|undefined)?.success===true&&event.result?.immuneUntil===event.at+86400&&event.at+86400>at)
}
