import { assertGreaterBrewingIdAvailable } from './toolkit'
import { PHB_ROPES } from '../lib/srd/knots'
import { PreparePHBRopeStockSchema } from '../lib/merchant-state'
import { PreparePHBLauncherStockSchema } from '../lib/merchant-state'
import { WEAPON_PRICES } from '../lib/srd/weapon-prices'
import { getWeapon } from '../lib/srd/weapons'
import { assertAdamantineItemsPrice } from './adamantine'
import { registeredTradeGoodProfile } from '../lib/trade-goods-state'
import { assertTradeGoodAssociations } from './trade-goods'
import { RecordMerchantStockSchema,CreateTradeOfferSchema,PurchaseTradeOfferSchema,TradeItemSchema } from '../lib/merchant-state'
import { CoinsSchema,copperValue,emptyCoins } from '../lib/srd/currency'
import { groundGearPhysicalWitness,groundGearRecoveryActivityIssue } from '../lib/ground-gear-recovery-state'
import { carryingItemContext,physicalWeightKey } from '../lib/carrying-state'
import { inspectCarryingCapacity } from '../lib/carrying-state'
import { breathingActivityIssue } from '../lib/activity-preflight'
import { entityVerticalContext } from '../lib/jumping-state'
import { lightFuelRemaining } from '../lib/lighting'
import { inferRoomIdOnMap } from '../lib/adventure-map'
import { available,advanceHeroTime,now } from './hero-rules'
import { toolkitState,toolkitError,assertToolkitReach,assertToolkitPreparation } from './toolkit'
import { balance,addCoins } from './currency'
import { afterInventoryChange,freeHands } from './equipment'
import { assertGameTimeAdvance } from './time-preflight'
import { preflightRestStrenuousInterval,recordRestMeasuredActivityInterval } from './resting'
import * as gs from './game-state'
import * as rules from './rules'
export const merchantState=()=>toolkitState().merchants??={version:1 as const,stocks:{},offers:{},earnedCoins:{},receipts:{}}
function history(){if(Object.keys(merchantState().receipts).length>=2048)toolkitError('TRADE_HISTORY_LIMIT','Actual trade receipts are full before stock, money, work or items change.')}
function receipt(eventId:string,command:string){const old=gs.getState().dmTools?.merchants?.receipts[eventId];if(old&&old.command!==command)toolkitError('TRADE_EVENT_CONFLICT','Retain the exact original merchant, stock instances, offer and payment.');return old?{...structuredClone(old.result),replayed:true}:undefined}
function remember(eventId:string,command:string,result:Record<string,unknown>){merchantState().receipts[eventId]={command,at:now(),result:structuredClone(result)};return result}
function merchant(id:string,interact=false){
 const npc=gs.getNpc(id),state=gs.getState()
 if(!npc||!gs.npcOnCurrentMap(npc)||npc.isAlive===false||npc.hp&&npc.hp.current<=0||npc.conditions?.some(c=>['incapacitated','unconscious','petrified','paralyzed','stunned'].includes(c)))toolkitError('TRADE_REAL_MERCHANT_REQUIRED','Select an actual capable NPC present on this map. No merchant is created from a name, price or debit.')
 const roomId=npc!.roomId??inferRoomIdOnMap(npc!.position,state.currentMapId,state)??toolkitError('TRADE_LOCATION_REQUIRED','The actual merchant needs a real represented room at its current position.')
 if(interact){if(!npc!.visible)toolkitError('TRADE_MERCHANT_UNSEEN','Approach and perceive the real chosen merchant; no hidden actor is revealed by trade.');const vertical=entityVerticalContext(state,id);if(!vertical.known)toolkitError('PHYSICAL_HEIGHT_POINT_GEOMETRY_REQUIRED','Establish the actual merchant body support and height before a physical handoff; adjacent XY does not prove contact with an unresolved body.');assertToolkitReach({mapId:state.currentMapId!,roomId,cell:npc!.position,...vertical.known?{surfaceZFeet:vertical.zFeet!}:{}})}
 return{...npc!,roomId}
}
function fact(id:string,merchantId:string){const npc=merchant(merchantId),state=gs.getState(),value=state.worldFacts?.find(f=>f.id===id);if(!value||value.mapId!==state.currentMapId||value.roomId!==npc.roomId||value.narrativeEffect?.cell.x!==npc.position.x||value.narrativeEffect.cell.y!==npc.position.y)toolkitError('TRADE_PHYSICAL_FACT_REQUIRED','Establish the actual stock/offer/measurement fact at the existing merchant location. No text is parsed into stock or consent.');return structuredClone(value!) as unknown as Record<string,unknown>}
function currentFact(snapshot:Record<string,unknown>){const current=gs.getState().worldFacts?.find(f=>f.id===snapshot.id);if(!current||groundGearPhysicalWitness(current)!==groundGearPhysicalWitness(snapshot))toolkitError('TRADE_FACT_CHANGED','The actual recorded agreement changed or vanished; no replacement price or consent is supplied.')}
function qualifiedGoods(items:import('../lib/types').Item[],priceCp?:number){
 assertAdamantineItemsPrice(items,priceCp)
 const ropeStocks=gs.getState().dmTools?.merchants?.stocks,ropeItems=items.filter(item=>ropeStocks?.[item.id]?.initialRope)
 if(ropeItems.length){if(ropeItems.length!==items.length||ropeItems.some(item=>groundGearPhysicalWitness(item)!==groundGearPhysicalWitness(ropeStocks![item.id].item)))toolkitError('ROPE_EXACT_SOURCE_STOCK_REQUIRED','The source-priced rope offer retains the exact unchanged one50ft instance per stock, not mixed or relabeled stock.');const price=ropeItems.reduce((total,item)=>total+ropeStocks![item.id].initialRope!.priceCp,0);if(priceCp!==undefined&&priceCp!==price)toolkitError('ROPE_SOURCE_PRICE_REQUIRED','Retain the exact PHB1gp hemp or10gp silk price per actual50ft instance; no free rope, implicit discount or replacement.')}

 const state=gs.getState(),registered=items.filter(item=>state.dmTools?.tradeGoods?.lots[item.id])
 if(!registered.length)return
 const profiles=registered.map(item=>{assertTradeGoodAssociations(state,item.id);return registeredTradeGoodProfile(state,item)})
 if(registered.length!==items.length||profiles.some(p=>!p))toolkitError('TRADE_GOOD_EXACT_LOT_REQUIRED','A qualified goods offer uses only exact unchanged whole source lots; no mixed unqualified item, replacement, division or altered quantity.')
 if(priceCp!==undefined&&profiles.reduce((sum,p)=>sum+p!.priceCp,0)!==priceCp)toolkitError('TRADE_GOOD_FULL_VALUE_REQUIRED','A qualified trade-goods purchase must retain its full exact PHB source unit total, not a half price or new appraisal.')
}
export function recordMerchantStock(raw:unknown){
 const input=RecordMerchantStockSchema.parse(raw),command=JSON.stringify({operation:'merchant-stock',input}),old=receipt(input.eventId,command);if(old)return old
 assertToolkitPreparation();history();const npc=merchant(input.merchantId),state=gs.getState(),data=merchantState(),observed=fact(input.physicalFactId,npc.id)
 if(new Set(input.itemIds).size!==input.itemIds.length)toolkitError('TRADE_STOCK_DUPLICATE','Select each actual physical instance once.')
 if(Object.keys(data.stocks).length+input.itemIds.length>512)toolkitError('TRADE_STOCK_LIMIT','The retained actual stock registry is full.')
 const items=input.itemIds.map(id=>{assertGreaterBrewingIdAvailable(id);const dropped=state.droppedItems?.[id];if(data.stocks[id]||state.player.inventory.some(i=>i.id===id)||!dropped||dropped.mapId!==state.currentMapId||dropped.roomId!==npc.roomId||Math.max(Math.abs(dropped.position.x-npc.position.x),Math.abs(dropped.position.y-npc.position.y))>1)toolkitError('TRADE_EXISTING_STOCK_REQUIRED','Confide exact existing nearby ground instances to this actual seller, explicitly established as their stock. No item is created, taken from the player or restored from past sales.');if(state.dmTools?.groundGear?.stocks[id]||Object.values(state.dmTools?.groundGear?.stocks??{}).some(s=>s.containerItemId===id))toolkitError('TRADE_COUNTED_CONTAINER_UNSUPPORTED','Counted Gear contents require their full container custody procedure; this bounded trade cannot orphan or duplicate those stocks.');const light=state.dmTools?.lighting?.sources[id];if(light?.litAt!==undefined&&lightFuelRemaining(light,now())>0||state.hero?.effects.some(e=>e.kind==='burning-torch'&&e.data.itemId===id&&e.expiresAt>now())||state.dmTools?.improvised?.loads[id])toolkitError('TRADE_ACTIVE_PHYSICAL_SOURCE_UNSUPPORTED','Resolve the actual flame or loaded-host custody first. This simple-instance trade does not make a burning source or reserved projectile disappear from physical tracking.');if(dropped!.item.magical||state.dmTools?.magicItems?.[id]||state.dmTools?.spellScrolls?.[id])toolkitError('TRADE_MAGIC_ITEM_PROCEDURE_REQUIRED','Magic-item buying/selling is a separate unfinished downtime procedure, never replaced by ordinary market stock.');return TradeItemSchema.parse(dropped!.item)})
 qualifiedGoods(items)
 for(const item of items){data.stocks[item.id]={item,merchantId:npc.id,registeredAt:now(),stockEventId:input.eventId,physicalFact:observed,status:'available'};delete state.droppedItems![item.id]}
 return remember(input.eventId,command,{success:true,merchantId:npc.id,registeredItemIds:items.map(i=>i.id),itemsCreated:0,ownership:'actual existing instances now in explicitly observed merchant custody'})
}
export function createTradeOffer(raw:unknown){
 const input=CreateTradeOfferSchema.parse(raw),command=JSON.stringify({operation:'trade-offer',input}),old=receipt(input.offerId,command);if(old)return old
 available();rules.validateActionUse('player');if(gs.getState().phase==='combat')toolkitError('TRADE_OUTSIDE_COMBAT','This ordinary market procedure is outside combat, without an invented negotiation action.')
 history();merchant(input.merchantId,true);const data=merchantState(),observed=fact(input.agreementFactId,input.merchantId)
 if(Object.keys(data.offers).length>=512)toolkitError('TRADE_OFFER_LIMIT','The retained real offer history is full.')
 if(new Set(input.itemIds).size!==input.itemIds.length||input.itemIds.some(id=>data.stocks[id]?.merchantId!==input.merchantId||data.stocks[id]?.status!=='available'))toolkitError('TRADE_STOCK_UNAVAILABLE','Select exact unsold instances belonging to this actual seller; no default item or quantity is chosen.')
 qualifiedGoods(input.itemIds.map(id=>data.stocks[id].item),input.priceCp)
 if(input.expiresAt!==undefined&&input.expiresAt<=now())toolkitError('TRADE_OFFER_EXPIRED','The explicitly stated real offer is already expired.')
 data.offers[input.offerId]={id:input.offerId,input,createdAt:now(),agreementFact:observed,status:'open'}
 return remember(input.offerId,command,{success:true,offerId:input.offerId,merchantId:input.merchantId,itemIds:input.itemIds,priceCp:input.priceCp,itemsTransferred:0,paymentSpent:false,source:'Actual established agreement; PHB prices and DMG poison prices are references, not automatic seller stock or consent.'})
}
export function purchaseTradeOffer(raw:unknown){
 const input=PurchaseTradeOfferSchema.parse(raw),command=JSON.stringify({operation:'trade-purchase',input}),old=receipt(input.eventId,command);if(old)return old
 available();rules.validateActionUse('player');const state=gs.getState(),data=merchantState(),offer=data.offers[input.offerId]??toolkitError('TRADE_OFFER_REQUIRED','Choose the exact real retained offer.')
 if(state.phase==='combat')toolkitError('TRADE_OUTSIDE_COMBAT','Complete this ordinary market purchase outside combat.')
 if(offer.status==='purchased')toolkitError('TRADE_OFFER_ALREADY_PURCHASED','This real offer already transferred its instances. Retry its original event to inspect the actual receipt; another event cannot buy the same stock again.')
 if(offer.input.expiresAt!==undefined&&now()+input.workSeconds>offer.input.expiresAt)toolkitError('TRADE_OFFER_EXPIRED','The real offer expires before this explicitly chosen purchase interval completes.')
 history();merchant(offer.input.merchantId,true);currentFact(offer.agreementFact)
 if(freeHands()<1)toolkitError('TRADE_FREE_HAND_REQUIRED','Free an actual hand to receive the real purchased goods.')
 const items=offer.input.itemIds.map(id=>{const stock=data.stocks[id];if(!stock||stock.status!=='available'||stock.merchantId!==offer.input.merchantId||state.player.inventory.some(i=>i.id===id)||state.droppedItems?.[id])toolkitError('TRADE_STOCK_UNAVAILABLE','Every original offered instance must still be available from the same merchant. No replacement is selected.');return structuredClone(stock.item)})
 qualifiedGoods(items,offer.input.priceCp)
 if(copperValue(input.paid)!==offer.input.priceCp)toolkitError('TRADE_EXACT_PAYMENT_REQUIRED','Explicitly choose existing denominations equal to the real agreed total; no implicit exchange, credit or change is invented.')
 const wallet=addCoins(balance(),emptyCoins(),input.paid),earnings=addCoins(data.earnedCoins[offer.input.merchantId]??emptyCoins(),input.paid),future=structuredClone(state)
 future.player.inventory.push(...items);future.dmTools!.wallet=wallet
 if(new Set(input.itemWeights?.map(w=>w.itemId)).size!==(input.itemWeights?.length??0))toolkitError('TRADE_WEIGHT_DUPLICATE','Measure each actual offered instance at most once.')
 for(const measured of input.itemWeights??[]){const item=items.find(i=>i.id===measured.itemId);if(!item)toolkitError('TRADE_WEIGHT_TARGET_INVALID','Only actually offered instances can receive this explicit current mass fact.');const physicalFact=fact(measured.physicalFactId,offer.input.merchantId),carrying=future.dmTools!.carrying??={version:1,actors:{},weights:{},receipts:{}},key=physicalWeightKey('item',item!.id);if(!carrying.weights[key]&&Object.keys(carrying.weights).length>=512)toolkitError('PHYSICAL_WEIGHT_LIMIT','No actual measurement capacity remains before purchase.');carrying.weights[key]={targetKind:'item',targetId:item!.id,weightLb:measured.weightLb,unit:'lb_per_inventory_unit',context:carryingItemContext(future,item!),reason:'Actual offered instance measured before acquisition.',source:`Physical fact ${String(physicalFact.id)}; no poison mass inferred from another vial.`}}
 if(future.dmTools?.carrying?.actors.player?.tracking){const capacity=inspectCarryingCapacity(future);if(capacity.status==='unresolved')toolkitError('CARRYING_DATA_REQUIRED','Supply actual masses/quantities for this complete acquisition before money, time or custody changes.');if(capacity.overloaded)toolkitError('CARRYING_CAPACITY_EXCEEDED','This real purchase would exceed standard carrying capacity.')}
 const boundary=breathingActivityIssue(state,'player',input.workSeconds)??groundGearRecoveryActivityIssue(state,input.workSeconds);if(boundary)toolkitError(boundary.code,boundary.message)
 preflightRestStrenuousInterval();assertGameTimeAdvance(input.workSeconds)
 const from=now();advanceHeroTime(input.workSeconds);recordRestMeasuredActivityInterval({eventId:`trade:${input.eventId}`,from,to:now(),activity:'light',reason:input.activitySource.slice(0,600)})
 state.player.inventory.push(...items);state.dmTools!.wallet=wallet;if(future.dmTools?.carrying)state.dmTools!.carrying=future.dmTools.carrying;data.earnedCoins[offer.input.merchantId]=CoinsSchema.parse(earnings)
 for(const id of offer.input.itemIds){data.stocks[id].status='sold';data.stocks[id].soldEventId=input.eventId}
 offer.status='purchased';offer.purchaseEventId=input.eventId;offer.result={success:true,offerId:offer.id,merchantId:offer.input.merchantId,purchasedItemIds:items.map(i=>i.id),items:structuredClone(items),paid:input.paid,priceCp:offer.input.priceCp,wallet,seconds:input.workSeconds,actionSpent:false,interpretation:'Actual existing stock and agreed price; exact selected payment. Time interval is explicit MJ adjudication, no implicit purchase, change, item or vendor generated.'}
 afterInventoryChange();return remember(input.eventId,command,offer.result)
}
export function inspectTradeStock(merchantId:string){merchant(merchantId,true);const data=gs.getState().dmTools?.merchants;return{merchantId,stock:Object.values(data?.stocks??{}).filter(s=>s.merchantId===merchantId&&s.status==='available').map(s=>s.item),offers:Object.values(data?.offers??{}).filter(o=>o.input.merchantId===merchantId).map(o=>({...o.input,status:o.status})),readOnly:true,notice:'Only existing explicitly established stock. No purchase or willingness is inferred from this inspection.'}}

// The initial-adamantine stock authoring procedure reuses these exact real NPC/fact gates.
export { merchant as requireActualMerchant, fact as merchantPhysicalFact }

export function preparePHBLauncherStock(raw:unknown){
 const input=PreparePHBLauncherStockSchema.parse(raw),command=groundGearPhysicalWitness({operation:'prepare_phb_launcher_stock',input}),old=receipt(input.eventId,command);if(old)return old
 assertToolkitPreparation();history();const npc=merchant(input.merchantId),observed=fact(input.physicalFactId,npc.id),state=gs.getState(),data=merchantState(),id=input.itemId
 assertGreaterBrewingIdAvailable(id)
 if(data.stocks[id]||state.player.inventory.some(i=>i.id===id)||state.droppedItems?.[id]||gs.getEntity(id)||gs.getNpc(id)||state.dmTools?.objects[id]||state.dmTools?.magicItems?.[id]||state.dmTools?.spellScrolls?.[id]||state.dmTools?.ammunition?.prepared[id]||state.dmTools?.adamantine?.instances[id]||state.dmTools?.merchantResales?.custody[id])toolkitError('LAUNCHER_INITIAL_INSTANCE_REQUIRED','Only one genuinely NEW seller-owned ordinary launcher may start this source stock. Never replace an existing item, history, source or ownership.')
 if(Object.keys(data.stocks).length>=512)toolkitError('TRADE_STOCK_LIMIT','Retain every actual stock identity before adding another.')
 const weapon=getWeapon(input.weaponId)!,item={id,name:input.name,type:'weapon' as const,equipmentId:weapon.id,quantity:1},priceCp=WEAPON_PRICES[weapon.id],sourceWeightLb=weapon.weightLb??null
 const body={operation:'prepare_phb_launcher_stock',input,item,physicalFact:observed,priceCp,sourceWeightLb}
 data.stocks[id]={item,initialLauncher:{input,priceCp,sourceWeightLb,command:groundGearPhysicalWitness(body)},merchantId:npc.id,registeredAt:now(),stockEventId:input.eventId,physicalFact:observed,status:'available'}
 return remember(input.eventId,command,{success:true,eventId:input.eventId,itemId:id,merchantId:npc.id,item,priceCp,sourceWeightLb,ownership:'actual_initial_merchant_stock',itemsAcquired:0,source:'PHB2014 actual ammunition launchers and canonical printed weapon price/weight. A printed weight dash remains unknown.'})
}

export function preparePHBRopeStock(raw:unknown){
 const input=PreparePHBRopeStockSchema.parse(raw),command=groundGearPhysicalWitness({operation:'prepare_phb_rope_stock',input}),old=receipt(input.eventId,command);if(old)return old
 assertToolkitPreparation();history();const npc=merchant(input.merchantId),observed=fact(input.physicalFactId,npc.id),state=gs.getState(),data=merchantState(),id=input.itemId
 assertGreaterBrewingIdAvailable(id)
 if(data.stocks[id]||state.player.inventory.some(item=>item.id===id)||state.droppedItems?.[id]||gs.getEntity(id)||gs.getNpc(id)||state.dmTools?.objects[id]||state.dmTools?.magicItems?.[id]||state.dmTools?.spellScrolls?.[id]||state.dmTools?.ammunition?.prepared[id]||state.dmTools?.adamantine?.instances[id]||state.dmTools?.merchantResales?.custody[id])toolkitError('ROPE_INITIAL_INSTANCE_REQUIRED','Only a genuinely NEW ordinary seller-owned rope may start this source stock. Existing owned, dropped, spent, previously registered or legacy rope cannot be overwritten or renamed.')
 if(Object.values(data.stocks).some(stock=>stock.initialRope?.input.physicalFactId===input.physicalFactId))toolkitError('ROPE_INITIAL_FACT_ALREADY_USED','The exact original physical rope source fact already identifies its one real instance; another nonce cannot duplicate it.')
 if(Object.keys(data.stocks).length>=512)toolkitError('TRADE_STOCK_LIMIT','Retain every actual stock identity before adding another.')
 const profile=PHB_ROPES[input.ropeId],item={id,name:input.name,type:'misc' as const,equipmentId:input.ropeId,quantity:1},priceCp=profile.priceCp,sourceWeightLb=profile.weightLb,lengthFeet=profile.lengthFeet
 const body={operation:'prepare_phb_rope_stock',input,item,physicalFact:observed,priceCp,sourceWeightLb,lengthFeet}
 data.stocks[id]={item,initialRope:{input,priceCp,sourceWeightLb,lengthFeet,command:groundGearPhysicalWitness(body)},merchantId:npc.id,registeredAt:now(),stockEventId:input.eventId,physicalFact:observed,status:'available'}
 return remember(input.eventId,command,{success:true,eventId:input.eventId,itemId:id,merchantId:npc.id,item,priceCp,sourceWeightLb,lengthFeet,ownership:'actual_initial_merchant_stock',itemsAcquired:0,source:'PHB2014 Adventuring Gear4226-4227,4319-4321. One ordinary50ft physical rope, no knot, condition, damage, inventory, action or time granted.'})
}
