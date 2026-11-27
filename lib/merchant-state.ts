import { PHB_ROPES } from './srd/knots'
import { WEAPON_PRICES } from './srd/weapon-prices'
import { getWeapon } from './srd/weapons'
import { AdamantineWitnessSchema } from './adamantine-witness'
import { z } from 'zod'
import type { GameState } from './types'
import { CoinsSchema,emptyCoins,copperValue } from './srd/currency'
import { AmmunitionTypeSchema } from './ammunition-state'
import { groundGearPhysicalWitness } from './ground-gear-recovery-state'
const Id=z.string().min(1).max(180).refine(id=>!['constructor','prototype','__proto__'].includes(id))
const Cell=z.object({x:z.number().int().nonnegative(),y:z.number().int().nonnegative()}).strict(),Value=z.record(z.string(),z.unknown())
export const TradeItemSchema=z.object({adventureRewardId:Id.optional(),id:Id,name:z.string().min(1),type:z.enum(['weapon','armor','potion','misc']),equipmentId:z.string().optional(),quantity:z.number().int().nonnegative().optional(),ammunitionType:AmmunitionTypeSchema.optional(),spellIds:z.array(z.string()).optional(),damage:z.string().optional(),acBonus:z.number().optional(),description:z.string().optional(),magical:z.boolean().optional(),silvered:z.boolean().optional(),adamantine:AdamantineWitnessSchema.optional()}).strict()
export const PHB_LAUNCHERS=['light-crossbow','shortbow','sling','blowgun','hand-crossbow','heavy-crossbow','longbow'] as const
export const PreparePHBLauncherStockSchema=z.object({eventId:Id,itemId:Id,merchantId:Id,weaponId:z.enum(PHB_LAUNCHERS),name:z.string().trim().min(1).max(80),physicalFactId:Id,actualInitialStockConfirmed:z.literal(true)}).strict()
const InitialLauncher=z.object({input:PreparePHBLauncherStockSchema,priceCp:z.number().int().positive(),sourceWeightLb:z.number().finite().nonnegative().nullable(),command:z.string().max(24000)}).strict()
export const PreparePHBRopeStockSchema=z.object({eventId:Id,itemId:Id,merchantId:Id,ropeId:z.enum(['hempen_rope_50_feet','silk_rope_50_feet']),name:z.string().trim().min(1).max(80),physicalFactId:Id,actualInitialStockConfirmed:z.literal(true)}).strict()
const InitialRope=z.object({input:PreparePHBRopeStockSchema,priceCp:z.number().int().positive(),sourceWeightLb:z.number().finite().positive(),lengthFeet:z.literal(50),command:z.string().max(24000)}).strict()
export const RecordMerchantStockSchema=z.object({eventId:Id,merchantId:Id,itemIds:z.array(Id).min(1).max(64),physicalFactId:Id,actualStockConfirmed:z.literal(true)}).strict()
export const CreateTradeOfferSchema=z.object({offerId:Id,merchantId:Id,itemIds:z.array(Id).min(1).max(64),priceCp:z.number().int().positive().max(1000000000),agreementFactId:Id,actualAgreementConfirmed:z.literal(true),expiresAt:z.number().nonnegative().optional()}).strict()
export const PurchaseTradeOfferSchema=z.object({eventId:Id,offerId:Id,paid:CoinsSchema,workSeconds:z.number().int().positive().max(3600),activitySource:z.string().trim().min(1).max(1000),itemWeights:z.array(z.object({itemId:Id,weightLb:z.number().finite().nonnegative(),physicalFactId:Id}).strict()).max(64).optional()}).strict()
export const MerchantStateSchema=z.object({version:z.literal(1),stocks:z.record(z.string(),z.object({item:TradeItemSchema,initialLauncher:InitialLauncher.optional(),initialRope:InitialRope.optional(),merchantId:Id,registeredAt:z.number().nonnegative(),stockEventId:Id,physicalFact:Value,status:z.enum(['available','sold']),soldEventId:Id.optional()}).strict()),
 offers:z.record(z.string(),z.object({id:Id,input:CreateTradeOfferSchema,createdAt:z.number().nonnegative(),agreementFact:Value,status:z.enum(['open','purchased']),purchaseEventId:Id.optional(),result:Value.optional()}).strict()),
 earnedCoins:z.record(z.string(),CoinsSchema),receipts:z.record(z.string(),z.object({command:z.string().max(24000),at:z.number().nonnegative(),result:Value}).strict()),
}).strict()
export type MerchantState=z.infer<typeof MerchantStateSchema>
export function validateMerchantState(state:GameState){
 const data=state.dmTools?.merchants;if(!data)return[]
 if(!MerchantStateSchema.safeParse(data).success)return['Invalid actual merchant stock, offer or purchase schema.']
 const issues:string[]=[],at=state.worldTimeSeconds??0,earned:Record<string,ReturnType<typeof emptyCoins>>={}
 if(Object.keys(data.stocks).length>512||Object.keys(data.offers).length>512||Object.keys(data.receipts).length>2048)issues.push('Merchant history exceeds retained real-instance bounds.')
 for(const[id,stock]of Object.entries(data.stocks)){
  if(stock.initialLauncher){const initial=stock.initialLauncher,weapon=getWeapon(initial.input.weaponId),body={operation:'prepare_phb_launcher_stock',input:initial.input,item:stock.item,physicalFact:stock.physicalFact,priceCp:initial.priceCp,sourceWeightLb:initial.sourceWeightLb};if(initial.input.itemId!==id||initial.input.eventId!==stock.stockEventId||initial.input.merchantId!==stock.merchantId||stock.item.type!=='weapon'||stock.item.equipmentId!==initial.input.weaponId||stock.item.quantity!==1||stock.item.adamantine||stock.item.magical||stock.item.silvered||stock.item.spellIds?.length||initial.priceCp!==WEAPON_PRICES[initial.input.weaponId]||initial.sourceWeightLb!==(weapon?.weightLb??null)||initial.command!==groundGearPhysicalWitness(body))issues.push('An initial PHB launcher retains its exact ordinary canonical profile, printed price/known mass and first actual merchant source; no metal, magic, custom dice or rewritten stock.')}

  if(stock.initialRope){const initial=stock.initialRope,profile=PHB_ROPES[initial.input.ropeId],body={operation:'prepare_phb_rope_stock',input:initial.input,item:stock.item,physicalFact:stock.physicalFact,priceCp:initial.priceCp,sourceWeightLb:initial.sourceWeightLb,lengthFeet:initial.lengthFeet};if(initial.input.itemId!==id||initial.input.eventId!==stock.stockEventId||initial.input.merchantId!==stock.merchantId||stock.item.type!=='misc'||stock.item.equipmentId!==initial.input.ropeId||stock.item.quantity!==1||stock.item.adamantine||stock.item.magical||stock.item.silvered||stock.item.spellIds?.length||stock.initialLauncher||initial.priceCp!==profile.priceCp||initial.sourceWeightLb!==profile.weightLb||initial.lengthFeet!==profile.lengthFeet||initial.command!==groundGearPhysicalWitness(body)||data.receipts[stock.stockEventId]?.command!==groundGearPhysicalWitness({operation:'prepare_phb_rope_stock',input:initial.input}))issues.push('An initial PHB rope retains its one actual50ft instance, canonical hemp/silk price and mass, source fact and original merchant command; no legacy rope relabel or free stock.');if(Object.values(data.stocks).filter(other=>other.initialRope?.input.physicalFactId===initial.input.physicalFactId).length!==1)issues.push('One actual initial physical rope fact cannot mint another source instance under a fresh ID.')}
  if(id!==stock.item.id||stock.registeredAt>at||!data.receipts[stock.stockEventId]||stock.status==='available'&&(state.player.inventory.some(i=>i.id===id)||state.droppedItems?.[id])||stock.status==='sold'&&(!stock.soldEventId||!data.receipts[stock.soldEventId]))issues.push('Merchant custody needs one actual registered instance and its physical sale receipt; an available item cannot also be owned or on the ground.')
 }
 for(const[id,offer]of Object.entries(data.offers)){
  if(id!==offer.id||offer.input.offerId!==id||offer.createdAt>at||!data.receipts[id]||new Set(offer.input.itemIds).size!==offer.input.itemIds.length||offer.input.itemIds.some(itemId=>!data.stocks[itemId]||data.stocks[itemId].merchantId!==offer.input.merchantId))issues.push('A trade offer needs exact actual registered stock, merchant and immutable agreement.')
  if(offer.status==='purchased'){
   const receipt=offer.purchaseEventId?data.receipts[offer.purchaseEventId]:undefined
   if(!receipt||!offer.result||groundGearPhysicalWitness(receipt.result)!==groundGearPhysicalWitness(offer.result)||offer.input.itemIds.some(itemId=>data.stocks[itemId].soldEventId!==offer.purchaseEventId))issues.push('A purchase needs its one actual full transfer/payment receipt.')
   const paid=offer.result?.paid as ReturnType<typeof emptyCoins>|undefined
   if(paid&&CoinsSchema.safeParse(paid).success){if(copperValue(paid)!==offer.input.priceCp)issues.push('Actual selected payment must equal the retained agreed price.');const coins=earned[offer.input.merchantId]??=emptyCoins();for(const denomination of Object.keys(coins) as Array<keyof typeof coins>)coins[denomination]+=paid[denomination]}
   else issues.push('A purchase must retain its actual paid denominations.')
  }else if(offer.purchaseEventId||offer.result)issues.push('An open offer cannot carry a completed purchase.')
 }
 if(groundGearPhysicalWitness(earned)!==groundGearPhysicalWitness(data.earnedCoins))issues.push('Merchant earned money must equal actual completed purchase receipts, never a free initial purse.')
 return issues
}
