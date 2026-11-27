import { adamantineFullPrice } from './adamantine-state'
import { WEAPON_PRICES as PRICES } from './srd/weapon-prices'
import { CreateTradeGoodResaleOfferSchema,TradeGoodRecordSchema,registeredTradeGoodProfile,tradeGoodProvenanceMatches } from './trade-goods-state'
import { CreateValuableResaleOfferSchema,ValuableResaleProvenanceSchema,registeredValuableResaleProfile,valuableResaleProvenanceMatches } from './valuable-resale-state'
import { z } from 'zod'
import type { GameState } from './types'
import { TradeItemSchema } from './merchant-state'
import { COIN_IDS,CoinsSchema,emptyCoins,copperValue,type Coins } from './srd/currency'
import { groundGearPhysicalWitness as witness } from './ground-gear-recovery-state'

// Targeted PHB2014 Selling Treasure3905–3915, Armor3923–3944,
// Weapons4025–4069. No narrative lookup, magical premium or mass inferred.

const ARMOR_PRICES:Readonly<Record<string,number>>={padded_armor:500,leather_armor:1000,leather:1000,studded_leather:4500,hide_armor:1000,chain_shirt:5000,scale_mail:5000,
 breastplate:40000,half_plate:75000,ring_mail:3000,chain_mail:7500,splint:20000,plate:150000,shield:1000,
}
export function ordinaryResalePrice(item:z.infer<typeof TradeItemSchema>,state?:GameState){
 if(item.adamantine){const price=state?adamantineFullPrice(state,item):undefined;return price===undefined?undefined:{equipmentId:item.equipmentId??item.id,units:item.quantity??1,unitMarketValueCp:price,fullValueCp:price,halfValueCp:price/2}}
 const equipmentId=item.equipmentId??item.id,priceCp=PRICES[equipmentId]??ARMOR_PRICES[equipmentId],units=item.quantity??1
 if(item.type!==(ARMOR_PRICES[equipmentId]!==undefined?'armor':'weapon'))return undefined
 if(priceCp===undefined||!Number.isSafeInteger(units)||units<1||item.magical||item.silvered||item.spellIds?.length)return undefined
 const fullValueCp=priceCp*units
 return Number.isSafeInteger(fullValueCp)&&fullValueCp<=2000000000?{equipmentId,units,unitMarketValueCp:priceCp,fullValueCp,halfValueCp:fullValueCp/2}:undefined
}
const Id=z.string().min(1).max(180).refine(id=>!['constructor','prototype','__proto__'].includes(id)),Value=z.record(z.string(),z.unknown()),Time=z.number().int().nonnegative()
export const CreateResaleOfferSchema=z.object({offerId:Id,merchantId:Id,itemConditions:z.array(z.object({itemId:Id,physicalFactId:Id,actualUndamagedConfirmed:z.literal(true)}).strict()).min(1).max(32),priceCp:z.number().int().positive().max(1000000000),agreementFactId:Id,actualMerchantAcceptanceConfirmed:z.literal(true),expiresAt:Time.optional()}).strict()
export const SellToMerchantSchema=z.object({eventId:Id,offerId:Id,received:CoinsSchema,workSeconds:z.number().int().positive().max(3600),activitySource:z.string().trim().min(1).max(1000)}).strict()
const Offer=z.object({input:z.union([CreateResaleOfferSchema,CreateValuableResaleOfferSchema,CreateTradeGoodResaleOfferSchema]),valuation:z.enum(['registered_valuable_full','trade_goods_full']).optional(),tradeGoodProvenance:z.array(TradeGoodRecordSchema).max(32).optional(),valuableProvenance:z.array(ValuableResaleProvenanceSchema).max(32).optional(),at:Time,mapId:Id,roomId:Id,items:z.array(TradeItemSchema).min(1).max(32),itemWitness:z.string(),conditionFacts:z.array(Value),agreementFact:Value,status:z.enum(['open','sold']),saleEventId:Id.optional()}).strict()
const Sale=z.object({input:SellToMerchantSchema,command:z.string(),at:Time,sequence:z.number().int().positive(),merchantId:Id,earnedCoinsAtSale:CoinsSchema,merchantBefore:CoinsSchema,merchantAfter:CoinsSchema,walletBefore:CoinsSchema,walletAfter:CoinsSchema,result:Value}).strict()
export const MerchantResaleStateSchema=z.object({version:z.literal(1),offers:z.record(z.string(),Offer),sales:z.record(z.string(),Sale),custody:z.record(z.string(),z.object({item:TradeItemSchema,merchantId:Id,offerId:Id,saleEventId:Id,at:Time,tradeGoodProvenance:TradeGoodRecordSchema.optional(),valuableProvenance:ValuableResaleProvenanceSchema.optional()}).strict())}).strict()
export type MerchantResaleState=z.infer<typeof MerchantResaleStateSchema>
export function merchantResaleSpent(state:GameState,merchantId:string){const spent=emptyCoins();for(const sale of Object.values(state.dmTools?.merchantResales?.sales??{}))if(sale.merchantId===merchantId)for(const coin of COIN_IDS)spent[coin]+=sale.input.received[coin];return spent}
export function merchantResaleBalance(state:GameState,merchantId:string){const earned=state.dmTools?.merchants?.earnedCoins[merchantId]??emptyCoins(),spent=merchantResaleSpent(state,merchantId),available=emptyCoins();for(const coin of COIN_IDS)available[coin]=earned[coin]-spent[coin];return available}
const same=(a:unknown,b:unknown)=>witness(a)===witness(b)
export function validateMerchantResaleState(state:GameState){
 const data=state.dmTools?.merchantResales;if(!data)return[]
 if(!MerchantResaleStateSchema.safeParse(data).success)return['Invalid retained accepted-resale schema.']
 const errors:string[]=[],at=state.worldTimeSeconds??0,spent:Record<string,Coins>={},sold=new Set<string>()
 if(Object.keys(data.offers).length>512||Object.keys(data.sales).length>512||Object.keys(data.custody).length>512)errors.push('Resale history capacity exceeded.')
 for(const[id,offer]of Object.entries(data.offers)){
  const isValuable=offer.valuation==='registered_valuable_full',isTradeGood=offer.valuation==='trade_goods_full',selection='tradeGoods'in offer.input?offer.input.tradeGoods:'valuables'in offer.input?offer.input.valuables:offer.input.itemConditions,ids=selection.map(i=>i.itemId),profiles=offer.items.map(item=>ordinaryResalePrice(item,state))
  const prices=isTradeGood?offer.items.map(item=>registeredTradeGoodProfile(state,item)?.priceCp):isValuable?offer.items.map(item=>registeredValuableResaleProfile(state,item)?.priceCp):profiles.map(p=>p?.halfValueCp)
  if(isTradeGood!==('tradeGoods'in offer.input)||isTradeGood&&(offer.tradeGoodProvenance?.length!==ids.length||offer.items.some((item,index)=>!offer.tradeGoodProvenance?.[index]||!tradeGoodProvenanceMatches(state,item,offer.tradeGoodProvenance[index])))||!isTradeGood&&offer.tradeGoodProvenance)errors.push('Retain exact whole-lot trade-goods source, units and full-value provenance.')
  if(isValuable!==('valuables'in offer.input)||isValuable&&(offer.valuableProvenance?.length!==ids.length||offer.items.some((item,index)=>!offer.valuableProvenance?.[index]||!valuableResaleProvenanceMatches(state,item,offer.valuableProvenance[index])))||!isValuable&&offer.valuableProvenance)errors.push('Retain the exact explicit valuation procedure and original existing valuable/hoard provenance.')
  if(id!==offer.input.offerId||offer.at>at||new Set(ids).size!==ids.length||!same(ids,offer.items.map(i=>i.id))||offer.itemWitness!==witness(offer.items)||offer.conditionFacts.length!==ids.length||prices.some(price=>price===undefined||!Number.isInteger(price))||prices.reduce<number>((sum,price)=>sum+(price??0),0)!==offer.input.priceCp)errors.push('An offer needs exact instances and the explicitly retained ordinary-half or registered-valuable-full source prices.')
  if(offer.agreementFact.id!==offer.input.agreementFactId||offer.conditionFacts.some((fact,index)=>fact.id!==selection[index]?.physicalFactId))errors.push('Retain exact actual condition and acceptance observations.')
  if(offer.status==='sold'&&(!offer.saleEventId||data.sales[offer.saleEventId]?.input.offerId!==id)||offer.status==='open'&&offer.saleEventId)errors.push('A sold offer needs its one real sale; an open offer grants nothing.')
 }
 const sales=Object.entries(data.sales).sort(([,a],[,b])=>a.sequence-b.sequence)
 for(let index=0;index<sales.length;index++){
  const[id,sale]=sales[index],offer=data.offers[sale.input.offerId],prior=spent[sale.merchantId]??=emptyCoins(),earned=emptyCoins()
  for(const purchase of Object.values(state.dmTools?.merchants?.offers??{}))if(purchase.status==='purchased'&&purchase.input.merchantId===sale.merchantId){const receipt=state.dmTools!.merchants!.receipts[purchase.purchaseEventId!];if(receipt?.at<=sale.at){const paid=CoinsSchema.safeParse(purchase.result?.paid);if(paid.success)for(const coin of COIN_IDS)earned[coin]+=paid.data[coin]}}
  if(id!==sale.input.eventId||sale.sequence!==index+1||sale.at>at||!offer||offer.status!=='sold'||offer.saleEventId!==id||offer.input.merchantId!==sale.merchantId||sale.command!==JSON.stringify(sale.input)||copperValue(sale.input.received)!==offer.input.priceCp||!same(earned,sale.earnedCoinsAtSale))errors.push('A sale needs the original accepted offer, actual earlier merchant earnings and exact immutable selected payout.')
  for(const coin of COIN_IDS){if(sale.merchantBefore[coin]!==earned[coin]-prior[coin]||sale.merchantAfter[coin]!==sale.merchantBefore[coin]-sale.input.received[coin]||sale.merchantAfter[coin]<0||sale.walletAfter[coin]!==sale.walletBefore[coin]+sale.input.received[coin])errors.push('Actual denomination conservation forbids initial merchant money, credit, change or repeated payout.');prior[coin]+=sale.input.received[coin]}
  for(const item of offer?.items??[]){const custody=data.custody[item.id],provenance=offer?.valuableProvenance?.[offer.items.findIndex(i=>i.id===item.id)];if(offer?.valuation==='registered_valuable_full'&&(!provenance||!same(custody?.valuableProvenance,provenance))||offer?.valuation!=='registered_valuable_full'&&custody?.valuableProvenance)errors.push('Sold valuable custody retains the exact registered full-value provenance, never ordinary half-price classification.');if(sold.has(item.id)||!custody||custody.saleEventId!==id||custody.offerId!==offer.input.offerId||custody.merchantId!==sale.merchantId||!same(custody.item,item)||offer?.valuation==='trade_goods_full'&&!same(custody.tradeGoodProvenance,offer.tradeGoodProvenance?.[offer.items.findIndex(i=>i.id===item.id)])||offer?.valuation!=='trade_goods_full'&&custody.tradeGoodProvenance!==undefined||state.player.inventory.some(i=>i.id===item.id)||state.droppedItems?.[item.id])errors.push('One exact sold instance stays in one real merchant custody, never duplicated or returned by hydration.');sold.add(item.id)}
 }
 if(Object.keys(data.custody).some(id=>!sold.has(id)))errors.push('Merchant resale custody requires an actual completed purchase from the player.')
 return errors
}
