import { adamantineItemWitness,adamantineFullPrice } from '../lib/adamantine-state'
import { CreateTradeGoodResaleOfferSchema,registeredTradeGoodProfile,tradeGoodProvenanceMatches,isTradeGoodPickupHistory } from '../lib/trade-goods-state'
import { assertTradeGoodAssociations } from './trade-goods'
import { CreateValuableResaleOfferSchema,registeredValuableResaleProfile,valuableResaleProvenanceMatches } from '../lib/valuable-resale-state'
import { valuableResaleSourceMatches } from './valuable-resale-source'
import { CreateResaleOfferSchema,SellToMerchantSchema,ordinaryResalePrice,merchantResaleBalance } from '../lib/merchant-resale-state'
import { TradeItemSchema } from '../lib/merchant-state'
import { CoinsSchema,copperValue,emptyCoins } from '../lib/srd/currency'
import { groundGearPhysicalWitness as witness,groundGearRecoveryActivityIssue } from '../lib/ground-gear-recovery-state'
import { breathingActivityIssue } from '../lib/activity-preflight'
import { inspectCarryingCapacity } from '../lib/carrying-state'
import { basicPoisonKey } from '../lib/basic-poison-state'
import { inspectTradeStock } from './merchant-trade'
import { toolkitState,toolkitError } from './toolkit'
import { available,advanceHeroTime,now } from './hero-rules'
import { balance,addCoins } from './currency'
import { afterInventoryChange,freeHands,currentLoadout } from './equipment'
import { assertGameTimeAdvance } from './time-preflight'
import { preflightRestStrenuousInterval,recordRestMeasuredActivityInterval } from './resting'
import * as rules from './rules'
import * as gs from './game-state'
const resales=()=>toolkitState().merchantResales??={version:1 as const,offers:{},sales:{},custody:{}}
function capable(){available();rules.validateActionUse('player');if(gs.getState().phase==='combat')toolkitError('RESALE_OUTSIDE_COMBAT','This ordinary market procedure requires an actual interval outside combat, not a free combat transaction.');if(gs.getState().hero?.pending)toolkitError('REACTION_PENDING','Resolve the actual pending result before selecting another trade.')}
function physicalFact(id:string,merchantId:string){const npc=gs.getNpc(merchantId)!,state=gs.getState(),fact=state.worldFacts?.find(f=>f.id===id);if(!fact||fact.mapId!==state.currentMapId||fact.roomId!==npc.roomId||fact.narrativeEffect?.cell.x!==npc.position.x||fact.narrativeEffect.cell.y!==npc.position.y)toolkitError('RESALE_PHYSICAL_FACT_REQUIRED','Record the actual undamaged instance and merchant acceptance at this real same merchant, not a remote claim or inferred willingness.');return structuredClone(fact!) as unknown as Record<string,unknown>}
function currentFact(saved:Record<string,unknown>){if(!gs.getState().worldFacts?.some(f=>f.id===saved.id&&witness(f)===witness(saved)))toolkitError('RESALE_FACT_CHANGED','Retain the exact original current item condition and merchant acceptance; no substitute buyer, price or condition is selected.')}
// A conservative physical-custody boundary, never a player-text parser.
// Unknown associated state is refused instead of being silently orphaned,
// copied or cleared. Historical weight observations and gross merchant receipts
// are retained; they do not constitute ongoing possession of this instance.
const prose=new Set(['description','text','source','reason','command','detail','activitySource','label','name'])
function references(value:unknown,id:string):boolean{
 if(Array.isArray(value))return value.some(v=>references(v,id))
 if(value&&typeof value==='object')return Object.entries(value).some(([key,v])=>key===id||!prose.has(key)&&references(v,id))
 return value===id
}
function transferable(id:string,valuation?:'registered_valuable_full'|'trade_goods_full'){
 const state=gs.getState(),item=state.player.inventory.find(i=>i.id===id)
 if(!item||state.droppedItems?.[id]||state.dmTools?.merchantResales?.custody[id])toolkitError('RESALE_OWNED_INSTANCE_REQUIRED','Choose the same exact actually owned unsold item, never a stock entry, nearby body, substitute or former sale.')
 const loadout=currentLoadout()
 if(loadout&&Object.values(loadout).includes(id))toolkitError('RESALE_UNEQUIP_REQUIRED','Actually remove/draw down the equipped item with its existing equipment procedure before agreeing to transfer it.')
 if(item!.magical||item!.silvered||item!.spellIds?.length||state.dmTools?.magicItems?.[id]||state.dmTools?.spellScrolls?.[id])toolkitError('RESALE_SPECIAL_ITEM_UNSUPPORTED','Magic, silver premiums, scrolls and spellbook contents require their own custody/value procedure. Ordinary resale never clears them.')
 if(state.dmTools?.basicPoison?.coatings[basicPoisonKey('weapon',id)])toolkitError('RESALE_ASSOCIATED_STATE_UNSUPPORTED','This exact source-keyed weapon retains its actual Basic Poison coating and history. Ordinary resale never erases or remaps that physical poison witness.')
 const tradeGood=valuation==='trade_goods_full'?registeredTradeGoodProfile(state,item!):undefined
 if(valuation==='trade_goods_full'){assertTradeGoodAssociations(state,id);if(!tradeGood)toolkitError('TRADE_GOOD_PROVENANCE_REQUIRED','Retain the exact qualified source whole lot, its original units and unchanged actual item. No partial lot, substitute, relabel or new price.')}
 const valuable=valuation==='registered_valuable_full'?registeredValuableResaleProfile(state,item!):undefined
 if(valuation==='registered_valuable_full'&&(!valuable||!valuableResaleSourceMatches(valuable.provenance.record,state)))toolkitError('VALUABLE_RESALE_PROVENANCE_REQUIRED','Choose an exact owned registered gem/art instance from an actually collected original hoard, retaining its canonical source identity/value/hash and unchanged material state. A name, copied ID, uncollected record or proposed price never creates or qualifies a valuable.')
 if((item!.adamantine||state.dmTools?.adamantine?.instances[id])&&!adamantineItemWitness(state,item!))toolkitError('ADAMANTINE_PROVENANCE_INVALID','Retain the true source material and this exact physical instance before resale.')
 if(item!.adamantine&&adamantineFullPrice(state,item!)===undefined)toolkitError('ADAMANTINE_SOURCE_BATCH_PRICE_REQUIRED','The source quotes one weapon or ten pieces, never an inferred partial material unit price.')
 const provenanceDomains=valuation==='trade_goods_full'?['tradeGoods']:valuation==='registered_valuable_full'?['valuables','hoards',...valuable?.provenance.record.rewardId?['adventureRewards']:[]]:[]
 for(const[domain,value]of Object.entries(state.dmTools??{}))if(!['merchants','merchantResales','carrying','wallet','adamantine','objectWeaponAttacks','spellPerception',...(item!.adamantine&&item!.ammunitionType&&item!.quantity===10?['ammunition']:[]),...provenanceDomains].includes(domain)&&references(value,id))toolkitError('RESALE_ASSOCIATED_STATE_UNSUPPORTED',`This exact item is linked to retained ${domain} state. Its physical contents/coating/provisions/reservation must keep their own transfer procedure; no state is erased by sale.`)
 if(references(state.hero,id)||references(state.monsterEffects,id)||state.worldFacts?.some(f=>f.subjectItemId===id&&(!['trade_goods_full','registered_valuable_full'].includes(valuation??'')||!isTradeGoodPickupHistory(f,id))))toolkitError('RESALE_ASSOCIATED_STATE_UNSUPPORTED','The exact item still has a retained effect, casting source or physical scene association. No effect or history is removed by ordinary resale.')
 if(tradeGood)return{item:TradeItemSchema.parse(item!),priceCp:tradeGood.priceCp,tradeGoodProvenance:tradeGood.provenance,valuableProvenance:undefined}
 if(valuable)return{item:TradeItemSchema.parse(item!),priceCp:valuable.priceCp,valuableProvenance:valuable.provenance,tradeGoodProvenance:undefined}
 const parsed=TradeItemSchema.safeParse(item),profile=parsed.success?ordinaryResalePrice(parsed.data,state):undefined
 if(!profile)toolkitError('RESALE_SOURCE_PRICE_REQUIRED','This bounded source table covers unmodified canonical weapons and armor only, with exact positive whole instance quantities. No price, premium or spellbook value is inferred.')
 if(!Number.isInteger(profile!.halfValueCp))toolkitError('RESALE_FRACTIONAL_COPPER_UNSUPPORTED','The exact source half price is not an integer copper amount for this selected lot; no rounding or extra unit is invented.')
 return{item:structuredClone(parsed.success?parsed.data:item!) as import('../lib/types').Item,priceCp:profile!.halfValueCp,valuableProvenance:undefined,tradeGoodProvenance:undefined}
}
export function createResaleOffer(raw:unknown){
 const input=CreateResaleOfferSchema.parse(raw),data=resales(),prior=data.offers[input.offerId]
 if(prior){if(witness(prior.input)!==witness(input))toolkitError('RESALE_OFFER_CONFLICT','Retain this exact accepted resale offer and observed condition.');return{success:true,offerId:input.offerId,replayed:true,status:prior.status}}
 capable();inspectTradeStock(input.merchantId);if(Object.keys(data.offers).length>=512)toolkitError('RESALE_HISTORY_LIMIT','Retained ordinary resale offers are full before any item, coin or time changes.')
 const ids=input.itemConditions.map(i=>i.itemId);if(new Set(ids).size!==ids.length)toolkitError('RESALE_DUPLICATE_INSTANCE','Choose each actual owned physical instance once.')
 const selected=ids.map(id=>transferable(id)),items=selected.map(s=>s.item),price=selected.reduce((sum,s)=>sum+s.priceCp,0)
 if(price!==input.priceCp)toolkitError('RESALE_SOURCE_HALF_PRICE_REQUIRED','Explicit agreed price must equal half the printed cost of this actual undamaged supported lot; exceptions and premiums are separate adjudication procedures.')
 const agreementFact=physicalFact(input.agreementFactId,input.merchantId),conditionFacts=input.itemConditions.map(c=>physicalFact(c.physicalFactId,input.merchantId))
 if(input.expiresAt!==undefined&&input.expiresAt<=now())toolkitError('RESALE_OFFER_EXPIRED','The actually established merchant acceptance already expired.')
 data.offers[input.offerId]={input,at:now(),mapId:gs.getState().currentMapId!,roomId:gs.getState().currentRoomId!,items,itemWitness:witness(items),conditionFacts,agreementFact,status:'open'}
 return{success:true,offerId:input.offerId,merchantId:input.merchantId,itemIds:ids,priceCp:price,itemsTransferred:0,coinsTransferred:0,source:'PHB2014 Selling Treasure: actually undamaged ordinary weapons/armor at half printed cost, actual buyer acceptance retained.'}
}

export function createValuableResaleOffer(raw:unknown){
 const input=CreateValuableResaleOfferSchema.parse(raw),data=resales(),prior=data.offers[input.offerId]
 if(prior){if(prior.valuation!=='registered_valuable_full'||witness(prior.input)!==witness(input))toolkitError('RESALE_OFFER_CONFLICT','Retain this exact full-value registered valuable offer and original qualification.');return{success:true,offerId:input.offerId,replayed:true,status:prior.status}}
 capable();inspectTradeStock(input.merchantId);if(Object.keys(data.offers).length>=512)toolkitError('RESALE_HISTORY_LIMIT','Retained resale offers are full before any item, coin or time changes.')
 const ids=input.valuables.map(i=>i.itemId);if(new Set(ids).size!==ids.length)toolkitError('RESALE_DUPLICATE_INSTANCE','Choose each actual existing valuable instance once.')
 const selected=ids.map(id=>transferable(id,'registered_valuable_full')),items=selected.map(s=>s.item),price=selected.reduce((sum,s)=>sum+s.priceCp,0)
 if(selected.some((s,index)=>s.valuableProvenance?.record.kind!==input.valuables[index].registeredKind))toolkitError('VALUABLE_RESALE_KIND_MISMATCH','Use the original structured registered kind, never a classification from the display name or player wording.')
 if(price!==input.priceCp)toolkitError('VALUABLE_RESALE_FULL_VALUE_REQUIRED','The explicitly agreed total must equal the full already-registered true source value of these exact instances, not equipment half price or an invented appraisal.')
 const agreementFact=physicalFact(input.agreementFactId,input.merchantId),conditionFacts=input.valuables.map(c=>physicalFact(c.physicalFactId,input.merchantId))
 if(input.expiresAt!==undefined&&input.expiresAt<=now())toolkitError('RESALE_OFFER_EXPIRED','The actual accepted full-value offer already expired.')
 data.offers[input.offerId]={input,valuation:'registered_valuable_full',valuableProvenance:selected.map(s=>s.valuableProvenance!),at:now(),mapId:gs.getState().currentMapId!,roomId:gs.getState().currentRoomId!,items,itemWitness:witness(items),conditionFacts,agreementFact,status:'open'}
 return{success:true,offerId:input.offerId,merchantId:input.merchantId,itemIds:ids,priceCp:price,valuation:'registered_valuable_full',itemsTransferred:0,coinsTransferred:0,source:selected.some(s=>s.valuableProvenance?.record.rewardId!==undefined)?'Original chapter property value; collections require the explicitly qualified discerning buyer. No automatic sale/payment/stock.':'PHB2014 Selling Treasure3913: exact already-registered collected source gem/art instances retain full value; no valuable, purity, mass, source value or buyer is created.'}
}

export function createTradeGoodResaleOffer(raw:unknown){
 const input=CreateTradeGoodResaleOfferSchema.parse(raw),data=resales(),prior=data.offers[input.offerId]
 if(prior){if(prior.valuation!=='trade_goods_full'||witness(prior.input)!==witness(input))toolkitError('RESALE_OFFER_CONFLICT','Retain the exact accepted whole-lot trade-goods offer.');return{success:true,offerId:input.offerId,replayed:true,status:prior.status}}
 capable();inspectTradeStock(input.merchantId);if(Object.keys(data.offers).length>=512)toolkitError('RESALE_HISTORY_LIMIT','Actual resale offer history is full.')
 const ids=input.tradeGoods.map(i=>i.itemId);if(new Set(ids).size!==ids.length)toolkitError('RESALE_DUPLICATE_INSTANCE','Choose each actual whole lot once.')
 const selected=ids.map(id=>transferable(id,'trade_goods_full')),items=selected.map(s=>s.item),price=selected.reduce((sum,s)=>sum+s.priceCp,0)
 if(price!==input.priceCp)toolkitError('TRADE_GOOD_FULL_VALUE_REQUIRED','Use the exact full retained PHB unit value of the unchanged whole lots; no half price, appraisal, division or automatic change.')
 const agreementFact=physicalFact(input.agreementFactId,input.merchantId),conditionFacts=input.tradeGoods.map(c=>physicalFact(c.physicalFactId,input.merchantId))
 if(input.expiresAt!==undefined&&input.expiresAt<=now())toolkitError('RESALE_OFFER_EXPIRED','The actual accepted offer already expired.')
 data.offers[input.offerId]={input,valuation:'trade_goods_full',tradeGoodProvenance:selected.map(s=>s.tradeGoodProvenance!),at:now(),mapId:gs.getState().currentMapId!,roomId:gs.getState().currentRoomId!,items,itemWitness:witness(items),conditionFacts,agreementFact,status:'open'}
 return{success:true,offerId:input.offerId,merchantId:input.merchantId,itemIds:ids,priceCp:price,valuation:'trade_goods_full',itemsTransferred:0,coinsTransferred:0,source:'PHB2014 Selling Treasure3915 and Trade Goods4519–4535: whole explicitly qualified existing lots retain full source unit value.'}
}

export function sellToMerchant(raw:unknown){
 const input=SellToMerchantSchema.parse(raw),command=JSON.stringify(input),data=resales(),prior=data.sales[input.eventId]
 if(prior){if(prior.command!==command)toolkitError('RESALE_EVENT_CONFLICT','Retain the exact original completed sale and selected denominations.');return{...structuredClone(prior.result),replayed:true}}
 capable();const state=gs.getState(),offer=data.offers[input.offerId]??toolkitError('RESALE_OFFER_REQUIRED','Choose an actual retained current accepted resale offer.')
 if(offer.status!=='open')toolkitError('RESALE_ALREADY_SOLD','These actual instances already left the player; inspect the original event without another payout.')
 if(Object.keys(data.sales).length>=512||Object.keys(data.custody).length+offer.items.length>512)toolkitError('RESALE_HISTORY_LIMIT','Actual resale receipts/custody are full before any transfer.')
 inspectTradeStock(offer.input.merchantId)
 if(state.currentMapId!==offer.mapId||state.currentRoomId!==offer.roomId)toolkitError('RESALE_LOCATION_CHANGED','Complete this real exchange in its original market scene; no remote buyer or delivery is selected.')
 currentFact(offer.agreementFact);offer.conditionFacts.forEach(currentFact)
 const items=offer.items.map((i,index)=>{const selected=transferable(i.id,offer.valuation);if(offer.valuation==='trade_goods_full'&&(!offer.tradeGoodProvenance?.[index]||!tradeGoodProvenanceMatches(state,selected.item,offer.tradeGoodProvenance[index])))toolkitError('TRADE_GOOD_PROVENANCE_CHANGED','Retain the exact qualified whole-lot source, units and item; no replacement or subdivision.');if(offer.valuation==='registered_valuable_full'&&(!offer.valuableProvenance?.[index]||!valuableResaleProvenanceMatches(state,selected.item,offer.valuableProvenance[index])))toolkitError('VALUABLE_RESALE_PROVENANCE_CHANGED','The exact retained canonical valuable/hoard identity or value changed after acceptance; no new appraisal or replacement is selected.');return selected.item})
 if(witness(items)!==offer.itemWitness)toolkitError('RESALE_INSTANCE_CHANGED','The exact offered instances/quantities changed; no replacement item or restated condition is inferred.')
 if(offer.input.expiresAt!==undefined&&now()+input.workSeconds>offer.input.expiresAt)toolkitError('RESALE_OFFER_EXPIRED','The accepted offer expires before this actual selected exchange interval completes.')
 if(freeHands()<1)toolkitError('RESALE_FREE_HAND_REQUIRED','Free a real hand for the actual item and coin exchange.')
 if(copperValue(input.received)!==offer.input.priceCp)toolkitError('RESALE_EXACT_PAYOUT_REQUIRED','Choose exact real denominations equalling the agreed offer price; no credit, automatic change or exchange is granted.')
 const merchantBefore=merchantResaleBalance(state,offer.input.merchantId),merchantAfter=addCoins(merchantBefore,emptyCoins(),input.received),walletBefore=balance(),walletAfter=addCoins(walletBefore,input.received),future=structuredClone(state),ids=new Set(items.map(i=>i.id))
 future.player.inventory=future.player.inventory.filter(i=>!ids.has(i.id));future.dmTools!.wallet=walletAfter
 if(future.dmTools?.carrying?.actors.player?.tracking){const capacity=inspectCarryingCapacity(future);if(capacity.status==='unresolved')toolkitError('CARRYING_DATA_REQUIRED','Establish real remaining inventory and coin payload masses before receiving this actual payout. No object mass is inferred from its price.');if(capacity.overloaded)toolkitError('CARRYING_CAPACITY_EXCEEDED','The actual selected coins would exceed standard carrying capacity after the real items leave.')}
 const boundary=breathingActivityIssue(state,'player',input.workSeconds)??groundGearRecoveryActivityIssue(state,input.workSeconds);if(boundary)toolkitError(boundary.code,boundary.message)
 preflightRestStrenuousInterval();assertGameTimeAdvance(input.workSeconds)
 const from=now();advanceHeroTime(input.workSeconds);inspectTradeStock(offer.input.merchantId);recordRestMeasuredActivityInterval({eventId:`resale:${input.eventId}`,from,to:now(),activity:'light',reason:input.activitySource.slice(0,600)})
 state.player.inventory=state.player.inventory.filter(i=>!ids.has(i.id));state.dmTools!.wallet=walletAfter
 for(const item of items){const valuableProvenance=offer.valuableProvenance?.[items.findIndex(i=>i.id===item.id)];data.custody[item.id]={item,merchantId:offer.input.merchantId,offerId:input.offerId,saleEventId:input.eventId,at:now(),...(valuableProvenance?{valuableProvenance}:{}),...(offer.tradeGoodProvenance?.[items.findIndex(i=>i.id===item.id)]?{tradeGoodProvenance:offer.tradeGoodProvenance[items.findIndex(i=>i.id===item.id)]}:{})}}
 offer.status='sold';offer.saleEventId=input.eventId
 const result={success:true,eventId:input.eventId,offerId:input.offerId,merchantId:offer.input.merchantId,soldItemIds:[...ids],priceCp:offer.input.priceCp,valuation:offer.valuation??'ordinary_half',received:input.received,wallet:walletAfter,merchantBalance:merchantAfter,seconds:input.workSeconds,actionSpent:false,interpretation:(offer.valuation==='trade_goods_full'?'Exact whole-lot trade-goods resale at full retained PHB source unit value and real acceptance. ':offer.valuation==='registered_valuable_full'?'Exact physical registered-valuable resale at full retained source value and real acceptance. ':'Exact physical ordinary resale at source half price and real acceptance. ')+'Only coins previously actually paid to this merchant fund payout; no initial purse, automatic change, purchase-back stock or transfer of associated tool state is supplied.'}
 data.sales[input.eventId]={input,command,at:now(),sequence:Object.keys(data.sales).length+1,merchantId:offer.input.merchantId,earnedCoinsAtSale:CoinsSchema.parse(state.dmTools!.merchants?.earnedCoins[offer.input.merchantId]??emptyCoins()),merchantBefore,merchantAfter,walletBefore,walletAfter,result}
 afterInventoryChange();return result
}
export function inspectMerchantResales(merchantId:string){inspectTradeStock(merchantId);const state=gs.getState(),data=state.dmTools?.merchantResales;return{readOnly:true,merchantId,availableCoins:merchantResaleBalance(state,merchantId),funding:'Only actual purchase receipts paid by the player, minus retained actual resale payouts. No initial or external merchant purse supplied.',offers:Object.values(data?.offers??{}).filter(o=>o.input.merchantId===merchantId).map(o=>({...o.input,status:o.status})),custody:Object.values(data?.custody??{}).filter(c=>c.merchantId===merchantId),notice:'Resale custody preserves the same instances and prior purchase tombstones; purchase-back listing is a separate unsupported procedure.'}}
