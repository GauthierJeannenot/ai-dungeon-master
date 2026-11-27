import { z } from 'zod'

const Id=z.string().min(1).max(180).regex(/^[a-zA-Z0-9][a-zA-Z0-9_:.-]*$/),Text=z.string().trim().min(1).max(1200)
const Cell=z.object({x:z.number().int().nonnegative(),y:z.number().int().nonnegative()}).strict()
const Dc=z.number().int().min(1).max(30)
export const HiddenDoorDefinitionSchema=z.object({
 kind:z.enum(['secret','concealed']),sourceDescription:Text,
 detectionDc:Dc.optional(),
 signs:z.object({dc:Dc,description:Text}).strict().optional(),
 concealment:z.object({description:Text,stepId:Id,stepDescription:Text,operation:z.enum(['look','move_cover'])}).strict().optional(),
 mechanism:z.object({investigationDc:Dc,instruction:Text}).strict().optional(),
 forceDc:Dc.optional(),
}).strict().superRefine((value,ctx)=>{
 const fail=(message:string)=>ctx.addIssue({code:'custom',message})
 if(value.kind==='secret'&&(value.detectionDc===undefined||value.concealment||value.signs))fail('Secret doors require an explicit detection DC, without a concealed-door cover or signs-only check.')
 if(value.kind==='concealed'&&(!value.concealment||value.detectionDc!==undefined||value.mechanism))fail('Concealed doors require the actual cover and revealing step; finding them normally requires no ability check.')
})
export const ConfigureHiddenDoorSchema=z.object({eventId:Id,doorId:Id,definition:HiddenDoorDefinitionSchema}).strict()
export const ResolveDoorDiscoverySchema=z.object({eventId:Id,doorId:Id,cell:Cell,
 method:z.enum(['passive','search','reveal','investigate']),revealStepId:Id.optional(),
}).strict()
const Witness=z.object({eventId:Id,at:z.number().nonnegative()}).strict()
const RecordSchema=z.object({mapId:Id,doorId:Id,createdAt:z.number().nonnegative(),creationEventId:Id,creation:z.string(),
 definition:HiddenDoorDefinitionSchema,sides:z.array(z.object({roomId:Id,cell:Cell}).strict()).length(2),
 discovered:Witness.optional(),signsNoticed:Witness.optional(),mechanismUnderstood:Witness.optional(),
}).strict()
const Anchor=z.object({mapId:Id,roomId:Id,position:Cell,phase:z.enum(['exploration','combat','dialogue']),
 turnCounter:z.number().int().nonnegative(),currentTurn:z.string().nullable(),actionCredits:z.number().int().nonnegative().optional(),actionUsed:z.boolean(),
}).strict()
export const DoorDiscoveryStateSchema=z.object({version:z.literal(1),records:z.record(z.string(),RecordSchema),
 receipts:z.record(z.string(),z.object({command:z.string(),mapId:Id,doorId:Id,at:z.number().nonnegative(),
  status:z.enum(['pending','resolved']),anchor:Anchor.optional(),result:z.record(z.string(),z.unknown()).optional(),
 }).strict()),
}).strict()
export type HiddenDoorDefinition=z.infer<typeof HiddenDoorDefinitionSchema>
export type ConfigureHiddenDoorInput=z.infer<typeof ConfigureHiddenDoorSchema>
export type ResolveDoorDiscoveryInput=z.infer<typeof ResolveDoorDiscoverySchema>
export type DoorDiscoveryState=z.infer<typeof DoorDiscoveryStateSchema>
export type HiddenDoorRecord=z.infer<typeof RecordSchema>

export const doorDiscoveryKey=(mapId:string,doorId:string)=>JSON.stringify([mapId,doorId])
export function doorCommand(value:unknown):string{
 if(Array.isArray(value))return`[${value.map(doorCommand).join(',')}]`
 if(value&&typeof value==='object')return`{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${doorCommand((value as Record<string,unknown>)[key])}`).join(',')}}`
 return JSON.stringify(value)??'null'
}
