import { z } from 'zod'
import { PURPLE_WORM_SWALLOW_SOURCE } from './srd/purple-worm-swallow'
const Id=z.string().min(1).max(180).refine(value=>!['constructor','prototype','__proto__'].includes(value))
export const SwallowTurnIdentitySchema=z.object({combatGeneration:z.number().int().nonnegative(),turnCounter:z.number().int().nonnegative(),actorId:Id}).strict()
export type SwallowTurnIdentity=z.infer<typeof SwallowTurnIdentitySchema>
/** Mechanics common to either future containment representation. This is an
 * internal actual-damage witness, not a scene-fact route to invent an attack. */
export const SwallowInternalDamageWitnessSchema=z.object({eventId:Id,episodeId:Id,sourceId:Id,insideActorId:Id,
 turn:SwallowTurnIdentitySchema,damageReceived:z.number().int().nonnegative(),at:z.number().finite().nonnegative(),
}).strict().superRefine((event,ctx)=>{
 if(event.sourceId===event.insideActorId)ctx.addIssue({code:'custom',message:'A creature is not swallowed by itself.'})
})
export type SwallowInternalDamageWitness=z.infer<typeof SwallowInternalDamageWitnessSchema>
export const SwallowSourceEventSchema=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('source_turn_acid'),sourceId:Id,turn:SwallowTurnIdentitySchema,
  episodeIds:z.array(Id).min(1).max(128)}).strict().refine(event=>event.turn.actorId===event.sourceId&&new Set(event.episodeIds).size===event.episodeIds.length,'Source acid belongs to its actual start turn and each real swallowed body occurs once.'),
 z.object({kind:z.literal('inside_damage_regurgitation'),sourceId:Id,turn:SwallowTurnIdentitySchema,
  qualifyingInsideActorId:Id,damageEventIds:z.array(Id).min(1).max(1024)}).strict().refine(event=>event.sourceId!==event.qualifyingInsideActorId&&new Set(event.damageEventIds).size===event.damageEventIds.length,'One actual inside attacker and original distinct damage events must witness the source threshold.'),
])
const sameTurn=(a:SwallowTurnIdentity,b:SwallowTurnIdentity)=>a.actorId===b.actorId&&a.turnCounter===b.turnCounter&&a.combatGeneration===b.combatGeneration
/** Pure prerequisite calculation. Never rolls, mutates state, chooses an exit,
 * interprets prose or grants that any declared actor is physically inside. The
 * future engine must first bind each witness to its real containment episode. */
export function qualifyingSwallowDamage(witnesses:readonly SwallowInternalDamageWitness[],selection:{sourceId:string;insideActorId:string;turn:SwallowTurnIdentity}){
 const unique=new Map<string,SwallowInternalDamageWitness>()
 for(const raw of witnesses){
  const event=SwallowInternalDamageWitnessSchema.parse(raw),old=unique.get(event.eventId)
  if(old&&JSON.stringify(old)!==JSON.stringify(event))throw new Error('SWALLOW_DAMAGE_EVENT_CONFLICT')
  unique.set(event.eventId,event)
 }
 const events=[...unique.values()].filter(event=>event.sourceId===selection.sourceId&&event.insideActorId===selection.insideActorId&&sameTurn(event.turn,selection.turn))
 const damageReceived=events.reduce((sum,event)=>sum+event.damageReceived,0)
 if(!Number.isSafeInteger(damageReceived))throw new Error('SWALLOW_DAMAGE_TOTAL_INVALID')
 return{sourceId:selection.sourceId,insideActorId:selection.insideActorId,turn:{...selection.turn},damageReceived,
  qualifying:damageReceived>=PURPLE_WORM_SWALLOW_SOURCE.regurgitation.thresholdDamageReceived,eventIds:events.map(event=>event.eventId)}
}
