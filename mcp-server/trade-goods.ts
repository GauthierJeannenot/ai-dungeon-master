import type { GameState } from '../lib/types'
import { RecordTradeGoodSchema,registeredTradeGoodProfile,tradeGoodAssociation } from '../lib/trade-goods-state'
import { TradeItemSchema } from '../lib/merchant-state'
import { groundGearPhysicalWitness as witness } from '../lib/ground-gear-recovery-state'
import { assertToolkitPreparation,assertToolkitReach,toolkitError } from './toolkit'
import { readTradeGoodsSource } from './rules-library'
import { basicPoisonKey } from '../lib/basic-poison-state'
import * as gs from './game-state'
export function assertTradeGoodAssociations(state:GameState,id:string){
 const association=tradeGoodAssociation(state,id)
 if(association||state.dmTools?.basicPoison?.coatings[basicPoisonKey('weapon',id)])toolkitError('TRADE_GOOD_ASSOCIATED_STATE_UNSUPPORTED','Retain the actual lot contents, consumption, poison/nutrition/effect or other linked history through its dedicated custody procedure; qualification or sale never purifies, duplicates, resets or deletes it.')
}
export function validateTradeGoodsSources(state:GameState){
 const source=state.dmTools?.tradeGoods&&readTradeGoodsSource().source
 return Object.values(state.dmTools?.tradeGoods?.lots??{}).some(r=>witness(r.source)!==witness(source))?['Trade goods retain their original canonical PHB table/hash/units and cannot be repriced or reclassified on restoration.']:[]
}
export function recordTradeGood(raw:unknown){
 const input=RecordTradeGoodSchema.parse(raw),state=gs.getState(),previous=state.dmTools?.tradeGoods?.lots[input.itemId]
 if(previous){if(witness(previous.input)!==witness(input))toolkitError('TRADE_GOOD_IDENTITY_IMMUTABLE','Retain the original exact lot, source identity, units and qualification event; no relabel, top-up, reset or second source receipt.');return{success:true,itemId:input.itemId,replayed:true,record:structuredClone(previous)}}
 assertToolkitPreparation()
 if(Object.values(state.dmTools?.tradeGoods?.lots??{}).some(r=>r.input.eventId===input.eventId))toolkitError('TRADE_GOOD_EVENT_CONFLICT','One source qualification event identifies one exact whole lot.')
 const owned=state.player.inventory.find(i=>i.id===input.itemId),ground=state.droppedItems?.[input.itemId],stock=state.dmTools?.merchants?.stocks[input.itemId]
 const item=owned??ground?.item
 if(!item||stock||state.dmTools?.merchantResales?.custody[input.itemId])toolkitError('TRADE_GOOD_EXISTING_LOT_REQUIRED','Explicitly qualify an existing actually owned or reachable ground lot before putting it into merchant stock; no item or ownership is created.')
 const parsed=TradeItemSchema.safeParse(item)
 if(!parsed.success||item!.equipmentId!=='raw_crafting_materials'||item!.type!=='misc'||(item!.quantity??1)!==1||item!.magical||item!.silvered||item!.spellIds?.length||item!.damage!==undefined||item!.acBonus!==undefined||item!.ammunitionType)toolkitError('TRADE_GOOD_SIMPLE_WHOLE_LOT_REQUIRED','Only an actual unmodified individual raw-material lot is qualified, never a ration, portion, creature, counted container or narrative name.')
 const mapId=owned?state.currentMapId:ground!.mapId,roomId=owned?state.currentRoomId:ground!.roomId,cell=owned?state.player.position:ground!.position
 assertToolkitReach({mapId:mapId!,roomId:roomId!,cell})
 const fact=state.worldFacts?.find(f=>f.id===input.physicalFactId)
 if(!fact||fact.mapId!==mapId||fact.roomId!==roomId||fact.narrativeEffect?.cell.x!==cell.x||fact.narrativeEffect.cell.y!==cell.y)toolkitError('TRADE_GOOD_PHYSICAL_FACT_REQUIRED','Establish exact current commodity identity, actual whole-lot source units and unchanged state at this existing lot, not from its name or past price.')
 assertTradeGoodAssociations(state,input.itemId)
 if(Object.keys(state.dmTools?.tradeGoods?.lots??{}).length>=512)toolkitError('TRADE_GOOD_HISTORY_LIMIT','Whole-lot source qualification history is full before mutation.')
 const record={input,command:witness({operation:'record_trade_good',input}),item:structuredClone(parsed.data!),physicalFact:structuredClone(fact) as unknown as Record<string,unknown>,at:state.worldTimeSeconds??0,source:readTradeGoodsSource().source}
 const preview=structuredClone(state);preview.dmTools!.tradeGoods??={version:1,lots:{}};preview.dmTools!.tradeGoods.lots[input.itemId]=record
 if(!registeredTradeGoodProfile(preview,record.item))toolkitError('TRADE_GOOD_VALUE_LIMIT','The exact whole-lot source value exceeds this bounded integer-copper procedure.')
 state.dmTools!.tradeGoods??={version:1,lots:{}};state.dmTools!.tradeGoods.lots[input.itemId]=record
 return{success:true,itemId:input.itemId,record,itemsCreated:0,coinsTransferred:0,notice:'Existing whole lot qualified only. Source lb/square-yard quantity is not packaging, purity, a new food portion or invented cloth mass. No division, barter or currency granted.'}
}
