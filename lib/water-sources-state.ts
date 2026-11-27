import { z } from 'zod'
const Id=z.string().min(1).max(160).refine(value=>!['constructor','prototype','__proto__'].includes(value))
const EventId=z.string().min(1).max(80).regex(/^[a-zA-Z0-9][a-zA-Z0-9_:.-]*$/).refine(value=>!['constructor','prototype','__proto__'].includes(value))
const Source=z.string().trim().min(1).max(1000)
export const EstablishWaterSourceSchema=z.object({eventId:EventId,objectId:Id,establishedFactId:Id,
  actualWaterSourceConfirmed:z.literal(true),kind:z.enum(['finite','permanent']),quantityQuarterPints:z.number().int().min(0).max(100000000).optional(),
  permanenceConfirmed:z.literal(true).optional(),waterWeightLbPerPint:z.number().finite().positive().max(1000),
  hazardFactIds:z.array(Id).max(16).default([]),source:Source}).strict().superRefine((input,ctx)=>{
  if(input.kind==='finite'&&(input.quantityQuarterPints===undefined||input.permanenceConfirmed!==undefined)
    ||input.kind==='permanent'&&(input.quantityQuarterPints!==undefined||!input.permanenceConfirmed))
    ctx.addIssue({code:'custom',message:'A finite source requires its actual quantity; permanence requires explicit confirmation and never an arbitrary finite refill value.'})
})
const Operation={eventId:EventId,quarterPints:z.number().int().positive().max(1280),seconds:z.number().int().min(0).max(3600),
  cost:z.enum(['interaction','action']),handsRequired:z.union([z.literal(1),z.literal(2)]),
  objectsManipulated:z.union([z.literal(1),z.literal(2)]),
  restActivity:z.enum(['light','strenuous']),adjudication:Source}
export const FillWaterContainerSchema=z.object({...Operation,objectId:Id,targetItemId:Id}).strict()
export const TransferWaterSchema=z.object({...Operation,sourceItemId:Id,targetItemId:Id,poisonPortionAdjudicationId:Id.optional()}).strict()
export const WaterSourcesStateSchema=z.object({version:z.literal(1),sources:z.record(z.string(),z.object({
  objectId:Id,objectCreation:z.string().min(1),establishedFactId:Id,kind:z.enum(['finite','permanent']),
  initialQuarterPints:z.number().int().nonnegative().max(100000000).optional(),remainingQuarterPints:z.number().int().nonnegative().max(100000000).optional(),
  waterWeightLbPerPint:z.number().finite().positive(),mapId:z.string().min(1),roomId:z.string().min(1),
  cell:z.object({x:z.number().int(),y:z.number().int()}).strict(),hazardFactIds:z.array(Id).max(16),
  establishedFact:z.record(z.string(),z.unknown()),hazardFacts:z.array(z.record(z.string(),z.unknown())),source:Source,establishedAt:z.number().nonnegative(),
}).strict()),receipts:z.record(z.string(),z.object({command:z.string(),result:z.record(z.string(),z.unknown())}).strict())}).strict().superRefine((state,ctx)=>{
  if(Object.keys(state.sources).length>128||Object.keys(state.receipts).length>1024)ctx.addIssue({code:'custom',message:'Water-source identities, finite stocks and operation receipts are bounded and never evicted.'})
  const facts=new Set<string>()
  for(const[id,source]of Object.entries(state.sources)){
    if(id!==source.objectId||facts.has(source.establishedFactId))ctx.addIssue({code:'custom',message:'One actual source object and established resource fact have one canonical identity; new aliases never refill water.'})
    facts.add(source.establishedFactId)
    if(source.kind==='finite'){
      const drawn=Object.values(state.receipts).filter(receipt=>receipt.result.sourceObjectId===id).reduce((sum,receipt)=>sum+Number(receipt.result.transferredQuarterPints??0),0)
      if(source.initialQuarterPints===undefined||source.remainingQuarterPints===undefined||source.remainingQuarterPints>source.initialQuarterPints
        ||drawn+source.remainingQuarterPints!==source.initialQuarterPints)
        ctx.addIssue({code:'custom',message:'Actual finite water drawn and remaining stock must conserve its initial established quantity.'})
    }else if(source.initialQuarterPints!==undefined||source.remainingQuarterPints!==undefined)ctx.addIssue({code:'custom',message:'A permanent source is not a nonce-based finite refill ledger.'})
  }
})
export type WaterSourcesState=z.infer<typeof WaterSourcesStateSchema>
export type EstablishWaterSourceInput=z.infer<typeof EstablishWaterSourceSchema>
export type FillWaterContainerInput=z.infer<typeof FillWaterContainerSchema>
export type TransferWaterInput=z.infer<typeof TransferWaterSchema>
