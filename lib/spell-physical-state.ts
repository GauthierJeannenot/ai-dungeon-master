import { z } from 'zod'
const Id=z.string().min(1).max(180).refine(id=>!['constructor','prototype','__proto__'].includes(id))
const Cell=z.object({x:z.number().int().nonnegative(),y:z.number().int().nonnegative()}).strict()
export const TeleportCompanionFields={companionToCell:Cell.optional(),companionWillingConfirmed:z.literal(true).optional()}
const Arrival={spellId:z.enum(['misty-step','dimension-door']),toCell:Cell,companionId:Id.optional(),...TeleportCompanionFields}
/** A selected possible approach only. It never executes or promises a cast. */
export const MagicHazardApproachSchema=z.discriminatedUnion('source',[
 z.object({source:z.literal('spell'),...Arrival,slotLevel:z.number().int().min(1).max(4).optional()}).strict(),
 z.object({source:z.literal('scroll'),...Arrival,scrollItemId:Id}).strict(),
])
export type MagicHazardApproach=z.infer<typeof MagicHazardApproachSchema>
export const SpellPushStateSchema=z.object({version:z.literal(1),spellId:z.literal('thunderwave'),casterId:Id,
 paths:z.record(z.string(),z.array(Cell).min(1).max(3)),cursor:z.number().int().min(0).max(2),completed:z.boolean(),
}).strict().superRefine((value,ctx)=>{
 if(Object.keys(value.paths).length>256)ctx.addIssue({code:'custom',message:'At most256actual forced bodies in one retained sourced spell.'})
 for(const path of Object.values(value.paths))for(let i=1;i<path.length;i++)if(Math.max(Math.abs(path[i].x-path[i-1].x),Math.abs(path[i].y-path[i-1].y))!==1)ctx.addIssue({code:'custom',message:'Retain only actual adjacent five-foot steps, never an invented route.'})
})
export type SpellPushState=z.infer<typeof SpellPushStateSchema>
