import { z } from 'zod'

export const IlluminationSchema = z.enum(['bright', 'dim', 'darkness'])
export type Illumination = z.infer<typeof IlluminationSchema>
export const LIGHT_ITEM_KINDS = ['torch', 'candle', 'lamp', 'bullseye_lantern', 'hooded_lantern'] as const
export type PhysicalLightKind = typeof LIGHT_ITEM_KINDS[number]
export const isPhysicalLightKind = (id: string): id is PhysicalLightKind => LIGHT_ITEM_KINDS.some(kind => kind === id)
export const LightDirectionSchema = z.object({x:z.number().int().min(-1).max(1),y:z.number().int().min(-1).max(1)}).strict()
  .refine(direction => direction.x !== 0 || direction.y !== 0, 'Choose a nonzero grid direction.')
export type LightDirection = z.infer<typeof LightDirectionSchema>
// SRD 5.1 (2014), Adventuring Gear / Vision and Light; CC BY 4.0.
export const LIGHT_TEMPLATES = {
  torch: { seconds: 3600, brightFeet: 20, dimAdditionalFeet: 20 },
  candle: { seconds: 3600, brightFeet: 5, dimAdditionalFeet: 5 },
  lamp: { seconds: 21600, brightFeet: 15, dimAdditionalFeet: 30 },
  bullseye_lantern: { seconds: 21600, brightFeet: 60, dimAdditionalFeet: 60 },
  hooded_lantern: { seconds: 21600, brightFeet: 30, dimAdditionalFeet: 30 },
} as const
export const LightSourceSchema = z.object({
  itemId: z.string().min(1).max(100), kind: z.enum(LIGHT_ITEM_KINDS),
  remainingSeconds: z.number().min(0).max(21600),
  litAt: z.number().nonnegative().optional(),
  hood: z.enum(['raised','lowered']).optional(),
  direction: LightDirectionSchema.optional(),
  includeOrigin: z.boolean().optional(),
}).strict().superRefine((source,ctx) => {
  if(source.remainingSeconds>LIGHT_TEMPLATES[source.kind].seconds)
    ctx.addIssue({code:'custom',path:['remainingSeconds'],message:'Fuel exceeds this physical source capacity.'})
  if(source.hood!==undefined&&source.kind!=='hooded_lantern')
    ctx.addIssue({code:'custom',path:['hood'],message:'Only a hooded lantern has a hood.'})
  if((source.direction!==undefined||source.includeOrigin!==undefined)&&source.kind!=='bullseye_lantern')
    ctx.addIssue({code:'custom',path:['direction'],message:'Only a bullseye lantern has an aimed cone.'})
  if(source.kind==='bullseye_lantern'&&source.litAt!==undefined&&!source.direction)
    ctx.addIssue({code:'custom',path:['direction'],message:'A lit bullseye lantern requires an explicit direction.'})
})
export type LightSource = z.infer<typeof LightSourceSchema>

const ProtectionId=z.string().min(1).max(100).regex(/^[a-zA-Z0-9][a-zA-Z0-9_:.-]*$/).refine(value=>!['constructor','prototype','__proto__'].includes(value))
export const LightWeatherProtectionInputSchema=z.object({eventId:ProtectionId,itemId:ProtectionId,protection:z.enum(['open','enclosed']),
  factId:z.string().min(1).max(180),source:z.string().trim().min(1).max(1000)}).strict()
export const LightWeatherProtectionSchema=z.object({records:z.record(z.string(),z.object({input:LightWeatherProtectionInputSchema,
  at:z.number().nonnegative(),fact:z.record(z.string(),z.unknown())}).strict()),
  receipts:z.record(z.string(),z.object({command:z.string(),result:z.record(z.string(),z.unknown())}).strict()),
}).strict().superRefine((value,ctx)=>{
  if(Object.keys(value.records).length>128||Object.keys(value.receipts).length>512)ctx.addIssue({code:'custom',message:'Lamp source facts and receipts are bounded and never evicted.'})
  for(const[key,record]of Object.entries(value.records))if(key!==record.input.itemId||record.fact.id!==record.input.factId
    ||!Object.hasOwn(value.receipts,record.input.eventId))ctx.addIssue({code:'custom',message:'A physical lamp protection fact needs its actual item, fact and retained event receipt.'})
})
export type LightWeatherProtectionInput=z.infer<typeof LightWeatherProtectionInputSchema>
const FlameCell=z.object({x:z.number().int().nonnegative(),y:z.number().int().nonnegative()}).strict()
export const WeatherThrownFlamePlanSchema=z.object({version:z.literal(1),attackEventId:z.string().min(1).max(500).refine(value=>!['constructor','prototype','__proto__'].includes(value)),itemId:z.string().min(1),mapId:z.string().min(1),
  capturedAt:z.number().nonnegative(),rayCells:z.array(FlameCell).min(1).max(4096),protection:z.enum(['open','enclosed','unresolved']),extinguish:z.boolean(),
  source:z.object({kind:z.enum(['tracked','legacy_torch']),physicalKind:z.enum(LIGHT_ITEM_KINDS),litAt:z.number().nonnegative().optional(),
    remainingSeconds:z.number().nonnegative().optional(),effectId:z.string().optional(),expiresAt:z.number().nonnegative().optional()}).strict(),
  weather:z.array(z.object({mapId:z.string(),roomId:z.string(),revision:z.number().int().positive(),strongWind:z.boolean(),
    precipitation:z.enum(['none','heavy_rain','heavy_snow'])}).strict()).max(512),
}).strict().superRefine((plan,ctx)=>{
  if(plan.extinguish!==(plan.protection==='open'&&plan.weather.length>0)||plan.protection==='unresolved'&&plan.weather.length>0
    ||plan.weather.some(context=>!context.strongWind&&context.precipitation!=='heavy_rain')
    ||plan.source.kind==='tracked'&&(plan.source.litAt===undefined||plan.source.remainingSeconds===undefined||plan.source.remainingSeconds<=0||plan.source.litAt>plan.capturedAt)
    ||plan.source.kind==='legacy_torch'&&(!plan.source.effectId||plan.source.expiresAt===undefined||plan.source.expiresAt<=plan.capturedAt||plan.source.physicalKind!=='torch'))
      ctx.addIssue({code:'custom',message:'A thrown-flame plan retains its actual burning source and explicitly observed adverse-weather decision.'})
})
export const WeatherFlameExtinctionSchema=z.object({plan:WeatherThrownFlamePlanSchema,committedAt:z.number().nonnegative(),extinguished:z.boolean(),
  reason:z.enum(['applied','not_required','not_burning','stale_source']),remainingSeconds:z.number().nonnegative().optional()}).strict()
export type WeatherThrownFlamePlan=z.infer<typeof WeatherThrownFlamePlanSchema>
export type WeatherFlameExtinction=z.infer<typeof WeatherFlameExtinctionSchema>
export const LightingStateSchema = z.object({
  ambient: z.record(z.string(), z.record(z.string(), IlluminationSchema)),
  sources: z.record(z.string(), LightSourceSchema),
  weatherProtection:LightWeatherProtectionSchema.optional(),
  weatherExtinctions:z.record(z.string(),WeatherFlameExtinctionSchema).optional(),
}).strict()
export type LightingState = z.infer<typeof LightingStateSchema>

export const LIGHTING_SOURCE = 'https://media.wizards.com/2023/downloads/dnd/SRD_CC_v5.1.pdf'
