import { z } from 'zod'
import type { GameState,Item } from './types'
import { AdamantineWitnessSchema,type AdamantineWitness } from './adamantine-witness'
import { AMMUNITION_TYPES } from './srd/ammunition'
import { ADAMANTINE_SOURCE,adamantineNormalPrice } from './srd/adamantine'
import { groundGearPhysicalWitness as witness } from './ground-gear-recovery-state'
const Id=z.string().min(1).max(180).refine(s=>!['constructor','prototype','__proto__'].includes(s)),Value=z.record(z.string(),z.unknown()),At=z.number().finite().nonnegative()
const Common={eventId:Id,itemId:Id,merchantId:Id,name:z.string().trim().min(1).max(80),form:z.enum(['made','coated']),physicalFactId:Id,actualInitialAdamantineStockConfirmed:z.literal(true)}
export const CreateAdamantineStockSchema=z.object({...Common,kind:z.enum(['melee_weapon','ammunition']),weaponId:Id.optional(),ammunitionType:z.enum(AMMUNITION_TYPES).optional()}).strict().superRefine((v,ctx)=>{if(v.kind==='melee_weapon'?(!v.weaponId||v.ammunitionType!==undefined):(!v.ammunitionType||v.weaponId!==undefined))ctx.addIssue({code:'custom',message:'Choose one exact canonical melee weapon OR the source ammunition type; the initial version is one weapon or ten pieces.'})})
export const AdamantineStateSchema=z.object({version:z.literal(1),origins:z.record(z.string(),z.object({input:CreateAdamantineStockSchema,item:Value,physicalFact:Value,normalPriceCp:z.number().int().positive(),fullPriceCp:z.number().int().positive(),at:At,source:Value,command:z.string().max(24000)}).strict()),
 instances:z.record(z.string(),z.object({itemId:Id,witness:AdamantineWitnessSchema,quantityAtCreation:z.number().int().positive(),kind:z.enum(['initial','recovery','unload']),sourceEventId:Id,sourceAttackId:Id.optional(),sourceItemId:Id.optional(),at:At,command:z.string().max(24000)}).strict()),
 receipts:z.record(z.string(),z.object({command:z.string(),result:Value}).strict())}).strict()
export type AdamantineState=z.infer<typeof AdamantineStateSchema>
export type AdamantineOrigin=AdamantineState['origins'][string]
export const initialAdamantineState=():AdamantineState=>({version:1,origins:{},instances:{},receipts:{}})
export const adamantineStateOf=(s:Pick<GameState,'dmTools'>)=>s.dmTools?.adamantine
export const adamantineOriginCommand=(r:Omit<AdamantineOrigin,'command'>)=>witness({operation:'actual_initial_adamantine_stock',input:r.input,item:r.item,physicalFact:r.physicalFact,normalPriceCp:r.normalPriceCp,fullPriceCp:r.fullPriceCp,at:r.at,source:r.source})
export const adamantineInstanceCommand=(r:Omit<AdamantineState['instances'][string],'command'>)=>witness({operation:'actual_adamantine_instance',...r})
export function adamantineItemWitness(state:GameState,item:Item):AdamantineWitness|undefined{
 const tag=item.adamantine;if(!tag)return undefined
 const data=adamantineStateOf(state),instance=data?.instances[item.id],origin=data?.origins[tag.originEventId]
 if(!instance||!origin)return undefined
 const {command,...body}=instance
 if(witness(instance.witness)!==witness(tag)||origin.input.itemId!==tag.rootItemId||command!==adamantineInstanceCommand(body))return undefined
 if(origin.input.kind==='melee_weapon'?(item.type!=='weapon'||item.ammunitionType||item.id!==origin.input.itemId||(item.equipmentId??item.id)!==origin.input.weaponId):item.type!=='misc'||item.ammunitionType!==origin.input.ammunitionType)return undefined
 return tag
}
export function adamantineFullPrice(state:GameState,item:Item){
 if(!adamantineItemWitness(state,item)||item.magical||item.silvered||item.spellIds?.length)return undefined
 const origin=adamantineStateOf(state)!.origins[item.adamantine!.originEventId]
 // Source quotes one weapon OR ten projectiles, not partial material unit prices.
 if(origin.input.kind==='ammunition'&&item.quantity!==10||origin.input.kind==='melee_weapon'&&(item.quantity??1)!==1)return undefined
 return origin.fullPriceCp
}
export function validateAdamantineState(state:GameState){
 const data=adamantineStateOf(state),issues:string[]=[]
 const items:Item[]=[...state.player.inventory,...Object.values(state.droppedItems??{}).map(d=>d.item),...Object.values(state.dmTools?.merchants?.stocks??{}).map(s=>s.item),...Object.values(state.dmTools?.merchantResales?.custody??{}).map(c=>c.item)]
 if(!data){if(items.some(item=>item.adamantine)||Object.values(state.dmTools?.ammunition?.expenditures??{}).some(s=>s.adamantine))issues.push('Actual adamantine material needs its immutable initial source, never an unattested item flag.');return issues}
 if(!AdamantineStateSchema.safeParse(data).success)return['Invalid actual adamantine stock, provenance or receipt schema.']
 if(Object.keys(data.origins).length>256||Object.keys(data.instances).length>1024||Object.keys(data.receipts).length>512)issues.push('Retain bounded actual adamantine source and physical instance history.')
 for(const[id,origin]of Object.entries(data.origins)){
  const {command,...body}=origin,normal=adamantineNormalPrice(origin.input),stock=state.dmTools?.merchants?.stocks[origin.input.itemId]
  if(id!==origin.input.eventId||normal===undefined||origin.normalPriceCp!==normal||origin.fullPriceCp!==normal+50000||witness(origin.source)!==witness(ADAMANTINE_SOURCE)||command!==adamantineOriginCommand(body)||origin.at>(state.worldTimeSeconds??0)||origin.physicalFact.id!==origin.input.physicalFactId||!stock||stock.stockEventId!==id||stock.merchantId!==origin.input.merchantId||witness(stock.item)!==witness(origin.item)||!data.receipts[id])issues.push('Retain the exact initial already-made source stock, merchant custody, original canonical normal+500gp price and source receipt; ordinary goods cannot be relabeled.')
 }
 for(const[id,instance]of Object.entries(data.instances)){
  const {command,...body}=instance,origin=data.origins[instance.witness.originEventId]
  if(id!==instance.itemId||!origin||instance.witness.rootItemId!==origin.input.itemId||command!==adamantineInstanceCommand(body)||instance.at>(state.worldTimeSeconds??0))issues.push('Actual material belongs only to its retained original or proven derived physical instance.')
  if(instance.kind==='initial'&&(id!==origin?.input.itemId||instance.sourceEventId!==origin?.input.eventId||instance.quantityAtCreation!==(origin?.input.kind==='ammunition'?10:1)))issues.push('Initial adamantine stock is exactly one real weapon or one original batch of ten ammunition units.')
  if(instance.kind==='recovery'){
   const spent=state.dmTools?.ammunition?.expenditures[instance.sourceAttackId??''],recovery=state.dmTools?.ammunition?.recoveries?.[instance.sourceEventId]
   if(!spent?.adamantine||witness(spent.adamantine)!==witness(instance.witness)||!recovery?.adamantineUnits?.some(u=>u.itemId===id&&u.attackId===instance.sourceAttackId)||instance.quantityAtCreation!==1)issues.push('Recovered adamantine is the actual selected expended projectile, never newly coated ordinary ammunition.')
  }
 }
 const physicalItems:Item[]=[...state.player.inventory,...Object.values(state.droppedItems??{}).map(d=>d.item),...Object.values(state.dmTools?.merchantResales?.custody??{}).map(c=>c.item),...Object.values(state.dmTools?.merchants?.stocks??{}).filter(s=>s.status==='available').map(s=>s.item)]
 const slingReceipts=Object.entries(state.dmTools?.improvised?.receipts??{}).map(([eventId,r])=>({eventId,result:r.result as Record<string,unknown>}))
 for(const[id,instance]of Object.entries(data.instances)){
  if(instance.kind==='unload'){
   const receipt=slingReceipts.find(r=>r.eventId===instance.sourceEventId)?.result,item=receipt?.unloadedItem as Item|undefined,source=data.instances[instance.sourceItemId??'']
   if(receipt?.operation!=='unload'||receipt?.separate!==true||receipt.actualSourceAmmunitionItemId!==instance.sourceItemId||!item||item.id!==id||witness(item.adamantine)!==witness(instance.witness)||!source||witness(source.witness)!==witness(instance.witness)||instance.quantityAtCreation!==1)issues.push('A separated material projectile must be the exact real retained sling unload of its source unit.')
  }
  const origin=data.origins[instance.witness.originEventId]
  if(origin?.input.kind==='ammunition'){
   const spent=Object.values(state.dmTools?.ammunition?.expenditures??{}).filter(s=>s.ammunitionItemId===id&&!s.loadedHostItemId).length
   const loads=slingReceipts.filter(r=>r.result.operation==='load'&&r.result.actualSourceAmmunitionItemId===id).length
   const merged=slingReceipts.filter(r=>r.result.operation==='unload'&&r.result.actualSourceAmmunitionItemId===id&&r.result.separate!==true).length
   const expected=instance.quantityAtCreation-spent-loads+merged,live=physicalItems.filter(i=>i.id===id)
   if(expected<0||live.length>1||live.some(i=>i.quantity!==expected)||!live.length&&expected>0)issues.push('Retain the exact material-unit balance after real shots, sling transfers and recoveries; no refill, duplication or deletion of remaining source ammunition.')
  }
 }
 for(const item of items)if((item.adamantine||data.instances[item.id])&&!adamantineItemWitness(state,item))issues.push('A copied, altered, stripped or unrelated item cannot inherit or discard another instance actual adamantine source.')
 for(const load of Object.values(state.dmTools?.improvised?.loads??{}))if((load.projectile.adamantine||data.instances[load.ammunitionItemId])&&witness(load.projectile.adamantine)!==witness(data.instances[load.ammunitionItemId]?.witness))issues.push('The exact reserved projectile retains its material source while loaded.')
 for(const shot of Object.values(state.dmTools?.ammunition?.expenditures??{}))if(data.instances[shot.ammunitionItemId]&&witness(shot.adamantine)!==witness(data.instances[shot.ammunitionItemId].witness))issues.push('A material shot cannot discard its actual original material source.')
 for(const shot of Object.values(state.dmTools?.ammunition?.expenditures??{}))if(shot.adamantine){const original=data.instances[shot.ammunitionItemId];if(!original||witness(original.witness)!==witness(shot.adamantine))issues.push('The original actual shot retains its exact physical material witness before any held die or recovery.')}
 return issues
}
