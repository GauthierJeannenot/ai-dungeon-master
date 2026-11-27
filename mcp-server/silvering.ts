import { assertGreaterBrewingIdAvailable } from './toolkit'
import { SilveringServiceInputSchema } from '../lib/silvering-state'
import { copperValue,emptyCoins,type Coins } from '../lib/srd/currency'
import { AMMUNITION } from '../lib/srd/ammunition'
import { getWeapon } from '../lib/srd/weapons'
import { inferRoomIdOnMap } from '../lib/adventure-map'
import { available,now,advanceHeroTime,distance } from './hero-rules'
import { assertGameTimeAdvance } from './time-preflight'
import { assertCarryingAcquisition } from './carrying'
import { addCoins,balance } from './currency'
import { ammunitionState } from './ammunition'
import { visibleCell } from './monster-perception'
import { toolkitState,toolkitError } from './toolkit'
import type { z } from 'zod'
import type { Item } from '../lib/types'
import * as gs from './game-state'
import * as rules from './rules'
const store=()=>toolkitState().silvering??={version:1 as const,services:{},receipts:{}}
const entry=<T>(map:Record<string,T>|undefined,id:string)=>map&&Object.hasOwn(map,id)?map[id]:undefined
function artisan(id:string){
  const state=gs.getState(),npc=state.npcs?.[id],entity=gs.getEntity(id)
  const found=entity??npc,position=found?.position,mapId=npc?.mapId??state.currentMapId
  if(id==='player'||!found||!position||mapId!==state.currentMapId||npc&&(!npc.visible||npc.disposition==='hostile'||npc.hp?.current===0||npc.conditions?.some(c=>['incapacitated','paralyzed','petrified','stunned','unconscious'].includes(c)))
    ||entity&&(entity.hp.current<=0||'isAlive'in entity&&!entity.isAlive||entity.conditions.some(c=>['incapacitated','paralyzed','petrified','stunned','unconscious'].includes(c))))
    toolkitError('SILVERING_ARTISAN_UNAVAILABLE','An actual present, capable and accessible artisan is required; no professional or willingness is inferred from a name.')
  if(distance(state.player.position,position!)>1||!visibleCell({...state.player,conditions:state.player.conditions.filter(c=>c!=='blinded')},position!))
    toolkitError('SILVERING_ARTISAN_OUT_OF_REACH','Approach the actual artisan with an unobstructed physical access before beginning the service.')
  return position!
}
export function establishSilveringService(input:z.infer<typeof SilveringServiceInputSchema>){
  available();if(gs.getState().phase==='combat')toolkitError('SILVERING_EXPLORATION_REQUIRED','Establish the actual service outside combat.')
  const position=artisan(input.artisanId),state=gs.getState(),mapId=state.currentMapId,roomId=mapId?inferRoomIdOnMap(position,mapId,state):undefined
  if(!mapId||!roomId)toolkitError('SILVERING_LOCATION_REQUIRED','The actual artisan needs an established current map and room.')
  const prior=entry(state.dmTools?.silvering?.services,input.serviceId)
  if(prior){if(JSON.stringify({...prior,mapId:undefined,roomId:undefined,at:undefined})!==JSON.stringify(input))toolkitError('SILVERING_SERVICE_CONFLICT','This immutable service has different source facts.');return{success:true,service:prior,replayed:true}}
  if(Object.keys(state.dmTools?.silvering?.services??{}).length>=128)toolkitError('SILVERING_SERVICE_LIMIT','The retained service capacity is full.')
  const service={...input,mapId:mapId!,roomId:roomId!,at:now()};store().services[input.serviceId]=service
  return {success:true,service,interpretation:'PHB2014 fixes100gp for one weapon or ten ammunition pieces, including materials/time/expertise, but gives no duration. This actual artisan availability and positive work duration are explicit MJ adjudications, not a published universal crafting time.'}
}
export interface SilveringInput{eventId:string;serviceId:string;paid:Coins;weaponItemId?:string;ammunition?:{itemId:string;quantity:number}[]}
export function silverEquipment(input:SilveringInput){
  const state=gs.getState(),command=JSON.stringify(input),previous=entry(state.dmTools?.silvering?.receipts,input.eventId)
  if(previous){if(previous.command!==command)toolkitError('SILVERING_EVENT_CONFLICT','This event already records other exact service/payment/items.');return{...previous.result,replayed:true}}
  available();if(state.phase==='combat')toolkitError('SILVERING_EXPLORATION_REQUIRED','The real service requires capable exploration, not an instantaneous combat coating.')
  rules.validateActionUse('player')
  const service=entry(state.dmTools?.silvering?.services,input.serviceId)
  if(!service)toolkitError('SILVERING_SERVICE_REQUIRED','Choose an explicitly established real silvering service and its positive adjudicated work time.')
  const position=artisan(service!.artisanId)
  if(service!.mapId!==state.currentMapId||inferRoomIdOnMap(position,state.currentMapId,state)!==service!.roomId)
    toolkitError('SILVERING_SERVICE_CONTEXT_CHANGED','Return to the actual established artisan service; no remote work is completed.')
  if(Boolean(input.weaponItemId)===Boolean(input.ammunition))toolkitError('SILVERING_SELECTION_REQUIRED','Choose exactly one actual weapon OR exactly ten actual ammunition pieces, never both.')
  if(copperValue(input.paid)!==10000)toolkitError('SILVERING_PAYMENT_EXACT','Pay exactly100gp using explicit available canonical denominations; change is not inferred.')
  const walletAfter=addCoins(balance(),emptyCoins(),input.paid)
  if(Object.keys(state.dmTools?.silvering?.receipts??{}).length>=512)toolkitError('SILVERING_HISTORY_LIMIT','The retained service receipt capacity is full before payment/time.')
  const weapon=input.weaponItemId?state.player.inventory.find(item=>item.id===input.weaponItemId):undefined
  const stacks:Item[]=[],derived:Item[]=[]
  if(input.weaponItemId){
    const adjudicated=Object.values(state.dmTools?.improvised?.rulings??{}).some(r=>r.targetKind==='item'&&r.targetId===input.weaponItemId)
    if(!weapon||weapon.ammunitionType||!getWeapon(weapon.equipmentId??weapon.id)&&!adjudicated||weapon.quantity!==undefined&&weapon.quantity!==1)
      toolkitError('SILVERING_WEAPON_REQUIRED','Choose one actual owned physical weapon or explicitly adjudicated wieldable item; an ammunition bundle is not one weapon.')
    if(weapon!.silvered)toolkitError('SILVERING_ALREADY_SILVERED','This exact physical weapon is already silvered; no second service is needed.')
  }else{
    if(input.ammunition!.reduce((sum,x)=>sum+x.quantity,0)!==10||new Set(input.ammunition!.map(x=>x.itemId)).size!==input.ammunition!.length)
      toolkitError('SILVERING_TEN_AMMUNITION_REQUIRED','Select exactly ten positive actual units across distinct owned stacks.')
    if(Object.keys(state.dmTools?.ammunition?.prepared??{}).length+input.ammunition!.length>128)toolkitError('AMMUNITION_AUTHORING_LIMIT','No free retained identity slot remains for the separated coated stock.')
    for(const [index,choice] of input.ammunition!.entries()){
      const item=state.player.inventory.find(item=>item.id===choice.itemId)
      if(!item||!item.ammunitionType||!AMMUNITION[item.ammunitionType]||!Number.isSafeInteger(item.quantity)||item.quantity!<choice.quantity||item.silvered)
        toolkitError('SILVERING_ACTUAL_STOCK_REQUIRED','Choose sufficient actual unsilvered counted ammunition; no stock, transmutation or duplicate loaded unit is granted.')
        if(item!.adamantine||state.dmTools?.adamantine?.instances[item!.id])toolkitError('ADAMANTINE_PROJECTILE_SPLIT_UNSUPPORTED','This coating procedure cannot split the exact retained material batch into new identities; no action, dose, payment or source material is changed. Existing one-unit coating procedures that preserve identity are separate; this procedure cannot split material.');
      const id=`silver:${input.eventId}:${index}`
      assertGreaterBrewingIdAvailable(id)
      if(state.player.inventory.some(i=>i.id===id)||state.droppedItems?.[id]||Object.hasOwn(state.dmTools?.ammunition?.prepared??{},id)
        ||gs.getEntity(id)||gs.getNpc(id)||Object.hasOwn(state.dmTools?.objects??{},id)||Object.hasOwn(state.dmTools?.magicItems??{},id)||Object.hasOwn(state.dmTools?.spellScrolls??{},id))toolkitError('SILVERING_DERIVED_ID_CONFLICT','This derived physical identity already exists or has been used.')
      stacks.push(item!);derived.push({...item!,id,quantity:choice.quantity,silvered:true})
    }
  }
  assertCarryingAcquisition({walletAfter})
  assertGameTimeAdvance(service!.workSeconds)
  const startedAt=now();advanceHeroTime(service!.workSeconds)
  toolkitState().wallet=walletAfter
  if(weapon)weapon.silvered=true
  else for(const [index,choice] of input.ammunition!.entries()){
    stacks[index].quantity!-=choice.quantity;state.player.inventory.push(derived[index])
    ammunitionState().prepared[derived[index].id]={itemId:derived[index].id,creation:JSON.stringify({operation:'actual_silvering_service',eventId:input.eventId,sourceItemId:stacks[index].id,quantity:choice.quantity})}
  }
  const result={success:true,replayed:false,eventId:input.eventId,serviceId:input.serviceId,paid:input.paid,walletAfter,
    ...(weapon?{weaponItemId:weapon.id}:{ammunition:derived}),startedAt,completedAt:now(),seconds:service!.workSeconds,
    source:'PHB2014 Silvered Weapons supplied lines4115–4117',interpretation:'100gp exact for one weapon or ten real ammunition units. Work duration/access explicitly adjudicated; silver is not magic. On an ammunition attack, only the actual projectile coating affects a source silver-sensitive defense, never the bow coating.'}
  store().receipts[input.eventId]={command,result:structuredClone(result)};return result
}
