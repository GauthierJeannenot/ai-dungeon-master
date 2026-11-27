import { assertGreaterBrewingIdAvailable } from './toolkit'
import { CreateAdamantineStockSchema,initialAdamantineState,adamantineOriginCommand,adamantineInstanceCommand,adamantineItemWitness,adamantineFullPrice } from '../lib/adamantine-state'
import type { Item } from '../lib/types'
import { ADAMANTINE_SOURCE,adamantineNormalPrice } from '../lib/srd/adamantine'
import { getWeapon } from '../lib/srd/weapons'
import { AMMUNITION } from '../lib/srd/ammunition'
import { groundGearPhysicalWitness as witness } from '../lib/ground-gear-recovery-state'
import { merchantState,requireActualMerchant,merchantPhysicalFact } from './merchant-trade'
import { ammunitionState } from './ammunition'
import { toolkitState,toolkitError,assertToolkitPreparation } from './toolkit'
import * as gs from './game-state'
const data=()=>toolkitState().adamantine??=initialAdamantineState()
export function prepareAdamantineStock(raw:unknown){
 const input=CreateAdamantineStockSchema.parse(raw),state=gs.getState(),command=witness({operation:'initial_adamantine_stock',input}),prior=state.dmTools?.adamantine?.receipts[input.eventId]
 if(prior){if(prior.command!==command)toolkitError('ADAMANTINE_EVENT_CONFLICT','Retain this exact original already-made physical stock, never a second material assignment.');return{...structuredClone(prior.result),replayed:true}}
 assertToolkitPreparation();const npc=requireActualMerchant(input.merchantId),fact=merchantPhysicalFact(input.physicalFactId,npc.id),normal=adamantineNormalPrice(input)
 if(normal===undefined||!Number.isInteger(normal))toolkitError('ADAMANTINE_SOURCE_PROFILE_REQUIRED','Choose a canonical source melee weapon or exactly ten source ammunition pieces, never armor, an improvised price, magic or an ammunition launcher.')
 const id=input.itemId;assertGreaterBrewingIdAvailable(id);const stock=merchantState()
 if(state.player.inventory.some(i=>i.id===id)||state.droppedItems?.[id]||stock.stocks[id]||Object.values(stock.offers).some(o=>o.input.itemIds.includes(id))||gs.getEntity(id)||gs.getNpc(id)||state.dmTools?.objects[id]||state.dmTools?.magicItems?.[id]||state.dmTools?.spellScrolls?.[id]||state.dmTools?.ammunition?.prepared[id]||data().instances[id]||state.dmTools?.merchantResales?.custody[id])toolkitError('ADAMANTINE_INITIAL_INSTANCE_REQUIRED','Only a NEW actual seller-owned source instance may start adamantine. Existing ordinary property, prior stock, spent or recovered units cannot change through a fact, alias or nonce.')
 if(stock.receipts[input.eventId]||Object.keys(stock.receipts).length>=2048||Object.keys(stock.stocks).length>=512||Object.keys(data().origins).length>=256||Object.keys(data().receipts).length>=512)toolkitError('ADAMANTINE_HISTORY_LIMIT','Retain all real stock/material/payment history before preparing another instance.')
 if(input.kind==='ammunition'&&Object.keys(state.dmTools?.ammunition?.prepared??{}).length>=128)toolkitError('AMMUNITION_STACK_LIMIT','Retain all real ammunition source identities before preparing another batch.')
 const tag={originEventId:input.eventId,rootItemId:id},item:Item=input.kind==='melee_weapon'
  ?{id,name:input.name,type:'weapon',equipmentId:getWeapon(input.weaponId!)!.id,quantity:1,adamantine:tag}
  :{id,name:input.name,type:'misc',equipmentId:AMMUNITION[input.ammunitionType!].equipmentId,ammunitionType:input.ammunitionType,quantity:10,adamantine:tag}
 const at=state.worldTimeSeconds??0,body={input,item:{...item} as unknown as Record<string,unknown>,physicalFact:fact,normalPriceCp:normal!,fullPriceCp:normal!+50000,at,source:{...ADAMANTINE_SOURCE}}
 data().origins[input.eventId]={...body,command:adamantineOriginCommand(body)}
 const instance={itemId:id,witness:tag,quantityAtCreation:input.kind==='ammunition'?10:1,kind:'initial' as const,sourceEventId:input.eventId,at}
 data().instances[id]={...instance,command:adamantineInstanceCommand(instance)}
 stock.stocks[id]={item,merchantId:npc.id,registeredAt:at,stockEventId:input.eventId,physicalFact:fact,status:'available'}
 if(input.kind==='ammunition')ammunitionState().prepared[id]={itemId:id,creation:witness({operation:'actual_initial_adamantine_stock',eventId:input.eventId,item,quantity:10})}
 const result={success:true,eventId:input.eventId,itemId:id,merchantId:npc.id,item,normalPriceCp:normal!,priceCp:normal!+50000,surchargeCp:50000,ownership:'actual_initial_merchant_stock',itemsAcquired:0,materialTransformation:false,magicalPropertyGranted:false,source:ADAMANTINE_SOURCE}
 data().receipts[input.eventId]={command,result:structuredClone(result)};stock.receipts[input.eventId]={command,at,result:structuredClone(result)}
 return result
}
export function assertAdamantineItemsPrice(items:Item[],priceCp?:number){
 const state=gs.getState(),stocks=state.dmTools?.merchants?.stocks
 if(!items.some(i=>i.adamantine||stocks?.[i.id]?.initialLauncher))return
 const prices=items.map(item=>item.adamantine?adamantineFullPrice(state,item):stocks?.[item.id]?.initialLauncher?.priceCp)
 if(prices.some(p=>p===undefined))toolkitError('ADAMANTINE_SOURCE_BATCH_PRICE_REQUIRED','Source-priced versions use exact whole initial stock: one unmodified melee version, a batch of ten, or its actual ordinary launcher. No partial unit premium or mixed unrelated appraisal is invented.')
 if(priceCp!==undefined&&prices.reduce<number>((sum,p)=>sum+p!,0)!==priceCp)toolkitError('ADAMANTINE_SOURCE_PRICE_REQUIRED','Retain the exact normal launcher price and normal version+500gp per weapon or ten-piece version; no free material, partial premium or replacement price.')
}
export function inspectAdamantine(){return{readOnly:true,state:gs.getState().dmTools?.adamantine??null,source:ADAMANTINE_SOURCE,limitation:'Only already-manufactured exact initial merchant stock and actual purchase; no owned ordinary item transformation, service, magic or partial material pricing.'}}
export function requireAdamantineItem(item:Item){const tag=adamantineItemWitness(gs.getState(),item);if((item.adamantine||gs.getState().dmTools?.adamantine?.instances[item.id])&&!tag)toolkitError('ADAMANTINE_PROVENANCE_INVALID','Keep this exact actual material origin and instance before dice/costs.');return tag}

export function registerDerivedAdamantine(item:Item,kind:'recovery'|'unload',eventId:string,sourceAttackId?:string,sourceItemId?:string){
 if(!item.adamantine)return
 const state=gs.getState(),tag=item.adamantine
 if(!state.dmTools?.adamantine?.origins[tag.originEventId]||data().instances[item.id])toolkitError('ADAMANTINE_DERIVED_INSTANCE_INVALID','A real retained material source and new single physical identity are required.')
 const body={itemId:item.id,witness:tag,quantityAtCreation:item.quantity??1,kind,sourceEventId:eventId,...sourceAttackId?{sourceAttackId}:{},...sourceItemId?{sourceItemId}:{},at:state.worldTimeSeconds??0}
 data().instances[item.id]={...body,command:adamantineInstanceCommand(body)}
}
