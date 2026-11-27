import { z } from 'zod'
import type { GameState,Item,WorldFact } from './types'
import { TradeItemSchema } from './merchant-state'
import { TRADE_GOODS,TRADE_GOOD_IDS } from './srd/trade-goods'
import { groundGearPhysicalWitness as witness } from './ground-gear-recovery-state'
const Id=z.string().min(1).max(180).refine(id=>!['constructor','prototype','__proto__'].includes(id)),Value=z.record(z.string(),z.unknown())
export const RecordTradeGoodSchema=z.object({eventId:Id,itemId:Id,commodityId:z.enum(TRADE_GOOD_IDS),sourceUnits:z.number().int().positive().max(1000000),physicalFactId:Id,actualWholeLotIdentityQuantityAndUnchangedStateConfirmed:z.literal(true)}).strict()
export const TradeGoodRecordSchema=z.object({input:RecordTradeGoodSchema,command:z.string().min(1).max(24000),item:TradeItemSchema,physicalFact:Value,at:z.number().int().nonnegative(),source:z.object({book:z.literal('phb-2014'),tableId:z.string(),sha256:z.string(),startLine:z.number().int(),endLine:z.number().int()}).strict()}).strict()
export const TradeGoodsStateSchema=z.object({version:z.literal(1),lots:z.record(z.string(),TradeGoodRecordSchema)}).strict()
export type TradeGoodsState=z.infer<typeof TradeGoodsStateSchema>
export const CreateTradeGoodResaleOfferSchema=z.object({offerId:Id,merchantId:Id,tradeGoods:z.array(z.object({itemId:Id,physicalFactId:Id,actualWholeLotUnchangedConfirmed:z.literal(true)}).strict()).min(1).max(32),priceCp:z.number().int().positive().max(1000000000),agreementFactId:Id,actualMerchantAcceptanceConfirmed:z.literal(true),expiresAt:z.number().int().nonnegative().optional()}).strict()
export function registeredTradeGoodProfile(state:GameState,item:Item){
 const record=state.dmTools?.tradeGoods?.lots[item.id]
 if(!record||witness(record.item)!==witness(item)||item.equipmentId!=='raw_crafting_materials'||item.type!=='misc'||(item.quantity??1)!==1||item.magical||item.silvered||item.spellIds?.length||item.damage!==undefined||item.acBonus!==undefined||item.ammunitionType)return undefined
 const definition=TRADE_GOODS[record.input.commodityId],priceCp=definition.priceCp*record.input.sourceUnits
 return Number.isSafeInteger(priceCp)&&priceCp<=1000000000?{priceCp,provenance:structuredClone(record)}:undefined
}
export function tradeGoodProvenanceMatches(state:GameState,item:Item,record:z.infer<typeof TradeGoodRecordSchema>){return witness(registeredTradeGoodProfile(state,item)?.provenance)===witness(record)}
const prose=new Set(['description','text','source','reason','command','detail','activitySource','label','name'])
function references(value:unknown,id:string):boolean{if(Array.isArray(value))return value.some(v=>references(v,id));if(value&&typeof value==='object')return Object.entries(value).some(([k,v])=>k===id||!prose.has(k)&&references(v,id));return value===id}
/** Exact history shapes emitted ONLY after inventory-tools' real pickup.
 * Text is never interpreted. Water/clue/foreign fields are not pickup history;
 * actual doses, resources, conditions and effects are checked independently. */
export function isTradeGoodPickupHistory(fact:WorldFact,id:string):boolean{
 const allowed=new Set(['id','text','source','subjectItemId','mapId','roomId','expires','basis','narrativeEffect'])
 if(fact.source!=='pick_up_item'||fact.subjectItemId!==id||!fact.id||!fact.mapId||!['room','map'].includes(fact.expires)||fact.expires==='room'&&!fact.roomId||Object.keys(fact).some(key=>!allowed.has(key)))return false
 if(fact.basis===undefined&&fact.narrativeEffect===undefined)return true
 const effect=fact.narrativeEffect
 return fact.basis==='ai_interpretation'&&Boolean(effect&&typeof effect.description==='string'&&effect.description.trim()&&Object.keys(effect).every(key=>['description','cell'].includes(key))&&effect.cell&&Object.keys(effect.cell).every(key=>['x','y'].includes(key))&&Number.isInteger(effect.cell.x)&&effect.cell.x>=0&&Number.isInteger(effect.cell.y)&&effect.cell.y>=0)
}
export function tradeGoodAssociation(state:GameState,id:string){
 for(const[domain,value]of Object.entries(state.dmTools??{}))if(!['merchants','merchantResales','tradeGoods','carrying','wallet'].includes(domain)&&references(value,id))return domain
 if(references(state.hero,id)||references(state.monsterEffects,id)||state.worldFacts?.some(f=>f.subjectItemId===id&&!isTradeGoodPickupHistory(f,id)))return 'actual_effect_or_scene_association'
 return undefined
}
export function validateTradeGoodsState(state:GameState){
 const data=state.dmTools?.tradeGoods;if(!data)return[]
 if(!TradeGoodsStateSchema.safeParse(data).success)return['Invalid retained whole-lot trade-goods schema.']
 const issues:string[]=[]
 if(Object.keys(data.lots).length>512)issues.push('Trade-goods whole-lot history limit exceeded.')
 for(const[id,record]of Object.entries(data.lots))if(record.command!==witness({operation:'record_trade_good',input:record.input})||id!==record.input.itemId||id!==record.item.id||record.at>(state.worldTimeSeconds??0)||record.physicalFact.id!==record.input.physicalFactId||!registeredTradeGoodProfile(state,record.item))issues.push('Trade goods require their same exact whole existing lot, explicit source commodity/quantity and original qualification; no name classification or quantity reset.')
 for(const offer of Object.values(state.dmTools?.merchants?.offers??{})){
  const stocks=offer.input.itemIds.map(id=>state.dmTools?.merchants?.stocks[id]),registered=stocks.filter(stock=>stock&&data.lots[stock.item.id]&&data.lots[stock.item.id].at<=offer.createdAt)
  if(registered.length&&(registered.length!==stocks.length||registered.some(stock=>!registeredTradeGoodProfile(state,stock!.item))||registered.reduce((sum,stock)=>sum+(registeredTradeGoodProfile(state,stock!.item)?.priceCp??0),0)!==offer.input.priceCp))issues.push('Qualified whole-lot source purchases retain exact original units and full PHB reference total on restoration.')
 }
 return issues
}
