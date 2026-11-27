import { z } from 'zod'
const Id=z.string().min(1).max(160).refine(value=>!['constructor','prototype','__proto__'].includes(value))
const EventId=z.string().min(1).max(80).regex(/^[a-zA-Z0-9][a-zA-Z0-9_:.-]*$/).refine(value=>!['constructor','prototype','__proto__'].includes(value))
const Source=z.string().trim().min(1).max(1000)
export const ForagingAbundanceSchema=z.enum(['abundant','limited','very_little'])
export const FORAGING_DC={abundant:10,limited:15,very_little:20} as const
export const CONTAINER_CAPACITY_QUARTER_PINTS={barrel:1280,bottle:6,bucket:96,flask:4,tankard:4,jug:32,pitcher:32,iron_pot:32,vial:1,waterskin:16} as const
export const ContainerTypeSchema=z.enum(['barrel','bottle','bucket','flask','tankard','jug','pitcher','iron_pot','vial','waterskin'])
export const ForageInputSchema=z.object({eventId:EventId,journeyId:Id,travelEventIds:z.array(Id).min(1).max(32),
  abundance:ForagingAbundanceSchema,source:Source,hazardFactIds:z.array(Id).max(16).default([])}).strict()
export const WaterContainerInputSchema=z.object({eventId:EventId,itemId:Id,containerType:ContainerTypeSchema,
  actualContainerConfirmed:z.literal(true),contentsQuarterPints:z.number().int().min(0).max(1280),
  dryWeightLb:z.number().finite().nonnegative().max(100000),waterWeightLbPerPint:z.number().finite().positive().max(1000),
  source:Source,hazardFactIds:z.array(Id).max(16).default([])}).strict()
export const CollectForageInputSchema=z.object({eventId:EventId,attemptId:Id,foodHalfPounds:z.number().int().min(0).max(32).default(0),
  waterTransfers:z.array(z.object({itemId:Id,quarterPints:z.number().int().min(1).max(512)}).strict()).max(16).default([])}).strict()
const Roll=z.object({notation:z.string(),rolls:z.array(z.number().int()),modifier:z.number(),total:z.number(),detail:z.string()}).strict()
const Point=z.object({mapId:z.string().min(1),cell:z.object({x:z.number().int(),y:z.number().int()}).strict(),
  walkingSeconds:z.number().int().nonnegative()}).strict()
export const ForagingStateSchema=z.object({version:z.literal(1),pendingAttemptId:Id.optional(),
  attempts:z.record(z.string(),z.object({input:ForageInputSchema,command:z.string(),dc:z.number().int(),wisdomModifier:z.number().int(),
    intervals:z.array(z.object({eventId:Id,from:z.number().nonnegative(),to:z.number().nonnegative()}).strict()).min(1).max(32),
    at:z.number().nonnegative(),point:Point,hazardFacts:z.array(z.record(z.string(),z.unknown())),
    result:z.record(z.string(),z.unknown()).optional(),foodRoll:Roll.optional(),waterRoll:Roll.optional(),
    foundFoodHalfPounds:z.number().int().min(0).max(32).optional(),foundWaterQuarterPints:z.number().int().min(0).max(512).optional(),
    remainingFoodHalfPounds:z.number().int().min(0).max(32).optional(),remainingWaterQuarterPints:z.number().int().min(0).max(512).optional(),
  }).strict()),
  foods:z.record(z.string(),z.object({itemId:Id,attemptId:Id,originalHalfPounds:z.number().int().positive().max(32),
    remainingHalfPounds:z.number().int().nonnegative().max(32),hazardFactIds:z.array(Id).max(16),collectedAt:z.number().nonnegative()}).strict()),
  containers:z.record(z.string(),z.object({itemId:Id,containerType:ContainerTypeSchema,capacityQuarterPints:z.number().int().positive(),
    contentsQuarterPints:z.number().int().nonnegative(),dryWeightLb:z.number().finite().nonnegative(),waterWeightLbPerPint:z.number().finite().positive(),
    source:Source,hazardFactIds:z.array(Id).max(32),declaredAt:z.number().nonnegative(),
    legacyProvisions:z.object({kind:z.literal('waterskin_full'),remainingUnits:z.number().int().min(0).max(4)}).strict().optional()}).strict()),
  receipts:z.record(z.string(),z.object({command:z.string(),result:z.record(z.string(),z.unknown())}).strict()),
}).strict().superRefine((state,ctx)=>{
  if(Object.keys(state.attempts).length>512||Object.keys(state.foods).length>512||Object.keys(state.containers).length>256||Object.keys(state.receipts).length>1024)
    ctx.addIssue({code:'custom',message:'Foraging histories are bounded and never evict real rolls, yields, contents or receipts.'})
  const consumed=new Set<string>()
  for(const [id,attempt]of Object.entries(state.attempts)){
    if(id!==attempt.input.eventId||attempt.dc!==FORAGING_DC[attempt.input.abundance]||attempt.intervals.length!==attempt.input.travelEventIds.length)
      ctx.addIssue({code:'custom',message:'A foraging attempt requires the actual source abundance and complete selected intervals.'})
    for(const interval of attempt.intervals){
      if(consumed.has(interval.eventId)||interval.to<=interval.from)ctx.addIssue({code:'custom',message:'A real foraging interval cannot be rerolled under another attempt ID.'})
      consumed.add(interval.eventId)
    }
    if(!attempt.result&&state.pendingAttemptId!==id)ctx.addIssue({code:'custom',message:'An unresolved forage check must retain its actual held attempt.'})
    if(attempt.result&&((attempt.remainingFoodHalfPounds??0)>(attempt.foundFoodHalfPounds??0)||(attempt.remainingWaterQuarterPints??0)>(attempt.foundWaterQuarterPints??0)))
      ctx.addIssue({code:'custom',message:'Collection cannot refill or exceed a real foraging yield.'})
    if(attempt.result){
      const success=attempt.result.foragingSucceeded===true
      for(const roll of [attempt.foodRoll,attempt.waterRoll])if(success&&(!roll||roll.rolls.length!==1||roll.rolls[0]<1||roll.rolls[0]>6
        ||roll.modifier!==attempt.wisdomModifier||roll.total!==roll.rolls[0]+roll.modifier)||!success&&roll)
        ctx.addIssue({code:'custom',message:'Food and water quantities require two distinct actual final-success1d6+Wisdom source rolls.'})
      if(attempt.foundFoodHalfPounds!==Math.max(0,attempt.foodRoll?.total??0)*2
        ||attempt.foundWaterQuarterPints!==Math.max(0,attempt.waterRoll?.total??0)*32)
        ctx.addIssue({code:'custom',message:'Stored food pounds and water gallons must preserve their exact actual source yields.'})
      const collectedFood=Object.values(state.foods).filter(food=>food.attemptId===id).reduce((sum,food)=>sum+food.originalHalfPounds,0)
      const collectedWater=Object.values(state.receipts).filter(receipt=>receipt.result.attemptId===id).reduce((sum,receipt)=>sum+Number(receipt.result.collectedWaterQuarterPints??0),0)
      if(collectedFood+(attempt.remainingFoodHalfPounds??0)!==attempt.foundFoodHalfPounds
        ||collectedWater+(attempt.remainingWaterQuarterPints??0)!==attempt.foundWaterQuarterPints)
        ctx.addIssue({code:'custom',message:'Actual collected-resource receipts and remaining stock must conserve the earned yield.'})
    }
  }
  if(state.pendingAttemptId&&(!state.attempts[state.pendingAttemptId]||state.attempts[state.pendingAttemptId].result))
    ctx.addIssue({code:'custom',message:'Pending forage requires exactly its unresolved source check.'})
  for(const [id,food]of Object.entries(state.foods))if(id!==food.itemId||!state.attempts[food.attemptId]?.result||food.remainingHalfPounds>food.originalHalfPounds)
    ctx.addIssue({code:'custom',message:'Physical food requires an actual resolved forage source and remaining quantified contents.'})
  for(const [id,container]of Object.entries(state.containers))if(id!==container.itemId||container.capacityQuarterPints!==CONTAINER_CAPACITY_QUARTER_PINTS[container.containerType]
    ||container.contentsQuarterPints>container.capacityQuarterPints)
    ctx.addIssue({code:'custom',message:'Water must stay inside the actual published capacity of its declared real container.'})
})
export type ForagingState=z.infer<typeof ForagingStateSchema>
export type ForageInput=z.infer<typeof ForageInputSchema>
export type WaterContainerInput=z.infer<typeof WaterContainerInputSchema>
export type CollectForageInput=z.infer<typeof CollectForageInputSchema>
