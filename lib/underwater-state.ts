import { z } from 'zod'
import type { GameState } from './types'
const Id=z.string().min(1).max(180).refine(id=>!['constructor','prototype','__proto__'].includes(id))
const Source=z.string().trim().min(1).max(1000)
export const UnderwaterSubjectSchema=z.discriminatedUnion('kind',[
  z.object({kind:z.literal('creature'),entityId:Id}).strict(),
  z.object({kind:z.literal('object'),objectId:Id}).strict(),
])
export const UnderwaterObservationSchema=z.object({eventId:Id,subject:UnderwaterSubjectSchema,waterMediumId:Id,
  fullyImmersed:z.boolean(),factId:Id,actualPhysicalObservationConfirmed:z.literal(true),source:Source,
  weaponAttack:z.object({target:UnderwaterSubjectSchema,weaponReference:Id,attackMode:z.enum(['melee','thrown','throw','splash']).optional(),madeUnderwater:z.boolean()}).strict().optional(),
  breathingEpisodeId:Id.optional(),
  forPosition:z.object({cell:z.object({x:z.number().int().nonnegative(),y:z.number().int().nonnegative()}).strict(),zFeet:z.number().finite().nullable(),posture:z.enum(['upright','prone']).optional(),actualDestinationGeometryConfirmed:z.literal(true)}).strict().optional(),
}).strict().superRefine((value,ctx)=>{
  if(value.forPosition&&value.weaponAttack)ctx.addIssue({code:'custom',message:'A prospective body/space qualification does not preselect a future attack. Qualify an actual attack at its real point.'})
  if(value.subject.kind==='object'&&(value.weaponAttack||value.breathingEpisodeId))ctx.addIssue({code:'custom',message:'A real scene object has no creature attack or breathing episode.'})
})
const Record=UnderwaterObservationSchema.safeExtend({mapId:Id,subjectWitness:z.string().min(1).max(16000),waterWitness:z.string().min(1).max(16000),attackWitness:z.string().min(1).max(32000).optional(),at:z.number().nonnegative(),revision:z.number().int().positive()})
export const UnderwaterStateSchema=z.object({version:z.literal(1),subjects:z.record(z.string(),Record),arrivals:z.record(z.string(),Record),
  attacks:z.record(z.string(),Record),receipts:z.record(z.string(),z.object({command:z.string(),result:z.record(z.string(),z.unknown())}).strict()),
}).strict().superRefine((value,ctx)=>{
  if(Object.keys(value.subjects).length>512||Object.keys(value.arrivals).length>512||Object.keys(value.attacks).length>1024||Object.keys(value.receipts).length>2048)ctx.addIssue({code:'custom',message:'Actual underwater subjects, attack qualifications and source receipts are bounded and retained.'})
})
export type UnderwaterSubject=z.infer<typeof UnderwaterSubjectSchema>
export type UnderwaterObservation=z.infer<typeof UnderwaterObservationSchema>
export type UnderwaterRecord=z.infer<typeof Record>
export type UnderwaterState=z.infer<typeof UnderwaterStateSchema>
export const initialUnderwaterState=():UnderwaterState=>({version:1,subjects:{},arrivals:{},attacks:{},receipts:{}})
export const underwaterStateOf=(state:GameState)=>(state.dmTools as{underwater?:UnderwaterState}|undefined)?.underwater
export const underwaterSubjectKey=(subject:UnderwaterSubject)=>JSON.stringify(subject.kind==='creature'?['creature',subject.entityId]:['object',subject.objectId])
export const underwaterAttackKey=(actorId:string,target:UnderwaterSubject,weaponReference:string,attackMode?:string)=>JSON.stringify([actorId,underwaterSubjectKey(target),weaponReference,attackMode??'melee'])
