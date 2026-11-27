import { z } from 'zod'

const Id=z.string().min(1).max(180).regex(/^[a-zA-Z0-9][a-zA-Z0-9_:.-]*$/).refine(id=>!['constructor','prototype','__proto__'].includes(id))
const Feet=z.number().finite().min(-100000).max(100000)
const Cell=z.object({x:z.number().int().nonnegative(),y:z.number().int().nonnegative()}).strict()
export const BarrierFootprintSchema=z.object({minXFeet:Feet,maxXFeet:Feet,minYFeet:Feet,maxYFeet:Feet}).strict().superRefine((value,ctx)=>{
 if(value.minXFeet>=value.maxXFeet||value.minYFeet>=value.maxYFeet)ctx.addIssue({code:'custom',message:'A measured physical footprint must have positive extent on both map axes.'})
})
export const VerticalBarrierReferenceSchema=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('edge'),from:Cell,to:Cell}).strict(),
 z.object({kind:z.literal('cell'),cell:Cell}).strict(),
 z.object({kind:z.literal('surface'),surfaceId:Id}).strict(),
 z.object({kind:z.literal('object'),objectId:Id,footprint:BarrierFootprintSchema}).strict(),
 z.object({kind:z.literal('cover'),coverId:Id,footprint:BarrierFootprintSchema}).strict(),
])
export const DeclareVerticalBarrierSchema=z.object({eventId:Id,barrierId:Id,mapId:Id,reference:VerticalBarrierReferenceSchema,
 bottomZFeet:Feet,topZFeet:Feet,actualMeasuredBarrierConfirmed:z.literal(true),source:z.string().trim().min(1).max(1200),
 blocksSight:z.boolean().optional(),
}).strict().superRefine((value,ctx)=>{
 if(value.bottomZFeet>=value.topZFeet)ctx.addIssue({code:'custom',message:'The measured total-cover physical barrier needs a real bottom and a strictly higher top; no infinite height is inferred.'})
 if(value.reference.kind==='edge'&&Math.abs(value.reference.from.x-value.reference.to.x)+Math.abs(value.reference.from.y-value.reference.to.y)!==1)
  ctx.addIssue({code:'custom',message:'A physical map edge joins the two actual orthogonally adjacent cells.'})
})
export const VerticalBarrierSchema=z.object({id:Id,mapId:Id,reference:VerticalBarrierReferenceSchema,bottomZFeet:Feet,topZFeet:Feet,
 blocksSight:z.boolean().optional(),
 provenance:z.object({eventId:Id,at:z.number().nonnegative(),source:z.string().trim().min(1).max(1200),referenceWitness:z.string().min(1)}).strict(),
 revision:z.number().int().positive(),
}).strict().superRefine((value,ctx)=>{
 if(value.bottomZFeet>=value.topZFeet)ctx.addIssue({code:'custom',message:'A retained physical barrier must keep a finite nonempty vertical interval.'})
 if(value.reference.kind==='edge'&&Math.abs(value.reference.from.x-value.reference.to.x)+Math.abs(value.reference.from.y-value.reference.to.y)!==1)
  ctx.addIssue({code:'custom',message:'Retained wall edges must preserve their actual adjacent cells.'})
})
export const RemoveVerticalBarrierSchema=z.object({eventId:Id,barrierId:Id,source:z.string().trim().min(1).max(1200)}).strict()
export type VerticalBarrier=z.infer<typeof VerticalBarrierSchema>
export type VerticalBarrierReference=z.infer<typeof VerticalBarrierReferenceSchema>
export type DeclareVerticalBarrierInput=z.infer<typeof DeclareVerticalBarrierSchema>
