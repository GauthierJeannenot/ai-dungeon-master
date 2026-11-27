import { EncounterCadenceCheckLinkSchema } from './encounter-cadence-state'
import { z } from 'zod'
import type { GameState } from './types'

const Id=z.string().min(1).max(180).refine(id=>!['__proto__','prototype','constructor'].includes(id))
export const EncounterCheckMethodSchema=z.enum(['d20','dm_occurrence','dm_no_occurrence'])
const Roll=z.object({notation:z.string(),rolls:z.array(z.number().int().positive()).min(1).max(4),
  modifier:z.number().int(),total:z.number().int().positive(),detail:z.string()}).strict()
const Check=z.object({id:Id,method:EncounterCheckMethodSchema,reason:z.string().min(1).max(1000),command:z.string(),
  adventureId:Id,mapId:Id,roomId:Id,at:z.number().nonnegative(),occurs:z.boolean(),roll:Roll.optional(),cadence:EncounterCadenceCheckLinkSchema.optional(),latestDrawId:Id.optional(),
}).strict().superRefine((check,ctx)=>{
  const rolled=check.method==='d20'
  if(rolled?(!check.roll||check.roll.modifier!==0||check.roll.notation!=='1d20'||check.roll.rolls.length!==1||check.roll.total!==check.roll.rolls[0]
    ||check.roll.total>20||check.occurs!==(check.roll.total>=18)):check.roll!==undefined||check.occurs!==(check.method==='dm_occurrence'))
    ctx.addIssue({code:'custom',message:'A chance check retains its one real unmodified d20 and source18+ threshold; an explicit MJ decision has no die.'})
  if(check.latestDrawId&&!check.occurs)ctx.addIssue({code:'custom',message:'A no-encounter result cannot acquire a table draw.'})
  if(check.command!==JSON.stringify([check.method,check.reason,...check.cadence?[check.cadence.id]:[]]))ctx.addIssue({code:'custom',message:'A check retains its exact original method and reason.'})
})
const Draw=z.object({id:Id,checkId:Id,command:z.string(),at:z.number().nonnegative(),sequence:z.number().int().positive(),
  previousDrawId:Id.optional(),rerollReason:z.string().min(1).max(1000).optional(),result:z.record(z.string(),z.unknown()),
}).strict()
export const RandomEncounterStateSchema=z.object({version:z.literal(1),checks:z.record(z.string(),Check),draws:z.record(z.string(),Draw),
}).strict().superRefine((state,ctx)=>{
  if(Object.keys(state.checks).length>512||Object.keys(state.draws).length>1024)
    ctx.addIssue({code:'custom',message:'Actual encounter check/draw history is bounded and retained, never evicted to reroll.'})
  for(const[id,check]of Object.entries(state.checks)){
    const latest=check.latestDrawId?state.draws[check.latestDrawId]:undefined
    const own=Object.values(state.draws).filter(draw=>draw.checkId===id)
    if(id!==check.id||check.latestDrawId&&(!latest||latest.checkId!==id))
      ctx.addIssue({code:'custom',message:'The latest actual draw must belong to its original encounter check.'})
    if(own.length?(!latest||latest.sequence!==own.length||new Set(own.map(draw=>draw.sequence)).size!==own.length):check.latestDrawId!==undefined)
      ctx.addIssue({code:'custom',message:'Retain the complete single actual draw sequence; hydration cannot erase its latest result to obtain a free reroll.'})
  }
  for(const[id,draw]of Object.entries(state.draws)){
    const check=state.checks[draw.checkId],prior=draw.previousDrawId?state.draws[draw.previousDrawId]:undefined
    if(id!==draw.id||draw.result.checkId!==draw.checkId||draw.result.drawId!==id||draw.result.sequence!==draw.sequence||!check?.occurs||draw.at<check.at
      ||draw.sequence===1&&(draw.previousDrawId!==undefined||draw.rerollReason!==undefined)
      ||draw.sequence>1&&(!prior||prior.checkId!==draw.checkId||prior.sequence+1!==draw.sequence||!draw.rerollReason))
      ctx.addIssue({code:'custom',message:'Every actual contextual reroll retains its prior same-check draw, reason and increasing sequence.'})
  }
})
export type RandomEncounterState=z.infer<typeof RandomEncounterStateSchema>
export function randomEncounterStateIssues(state:GameState,expectedAdventureId:string){
  const data=state.dmTools?.randomEncounters;if(!data)return[]
  if(!RandomEncounterStateSchema.safeParse(data).success)return['Invalid actual encounter check/draw history.']
  const at=state.worldTimeSeconds??0
  return Object.values(data.checks).some(check=>check.at>at||check.adventureId!==expectedAdventureId)
    ||Object.values(data.draws).some(draw=>draw.at>at)?['An encounter record cannot come from a future clock or another adventure.']:[]
}
