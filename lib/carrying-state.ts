import { activeKnotCarriedItems } from './knot-state'
import { z } from 'zod'
import type { GameState,Item } from './types'
import { getMonsterRecord } from './srd/monsters'
import { EQUIPMENT_WEIGHTS_LB,COUNTED_AMMUNITION_WEIGHTS } from './srd/weights'
import { coinCount,emptyCoins,type Coins } from './srd/currency'
import type { ValuableRecord } from './hoard-state'
import { activePhysicalLoad } from './physical-handling-state'

const Id=z.string().min(1).max(180).refine(value=>!['constructor','prototype','__proto__'].includes(value))
export const CarryingSizeSchema=z.enum(['Tiny','Small','Medium','Large','Huge','Gargantuan'])
export const PhysicalTargetKindSchema=z.enum(['item','object','creature'])
export const PhysicalWeightSchema=z.object({targetKind:PhysicalTargetKindSchema,targetId:Id,
  weightLb:z.number().finite().nonnegative(),unit:z.enum(['lb_per_inventory_unit','lb_total']),
  reason:z.string().trim().min(1).max(1000),source:z.string().trim().min(1).max(1000),context:z.string().optional(),includesCarriedEquipment:z.boolean().optional(),
}).strict().superRefine((record,ctx)=>{
  if((record.targetKind==='item')!==(record.unit==='lb_per_inventory_unit'))ctx.addIssue({code:'custom',message:'Items use actual inventory-unit mass; objects and bodies use whole-target mass.'})
})
export const CarryingStateSchema=z.object({version:z.literal(1),
  actors:z.record(z.string(),z.object({entityId:z.literal('player'),size:CarryingSizeSchema,reason:z.string().trim().min(1).max(1000),source:z.string().trim().min(1).max(1000),tracking:z.literal(true)}).strict()),
  weights:z.record(z.string(),PhysicalWeightSchema),
  receipts:z.record(z.string(),z.object({command:z.string(),result:z.record(z.string(),z.unknown())}).strict()),
}).strict().superRefine((state,ctx)=>{
  if(Object.keys(state.actors).length>128||Object.keys(state.weights).length>512||Object.keys(state.receipts).length>512)
    ctx.addIssue({code:'custom',message:'Carrying records are bounded and cannot evict source receipts.'})
  for(const [id,actor] of Object.entries(state.actors))if(id!==actor.entityId)ctx.addIssue({code:'custom',message:'Carrying actor IDs must match their record keys.'})
  for(const [key,weight] of Object.entries(state.weights))if(key!==`${weight.targetKind}:${weight.targetId}`)ctx.addIssue({code:'custom',message:'Physical mass keys must retain exact target identity and kind.'})
})
export type CarryingState=z.infer<typeof CarryingStateSchema>
export type CarryingSize=z.infer<typeof CarryingSizeSchema>
export type PhysicalWeight=z.infer<typeof PhysicalWeightSchema>
type Holder={carrying?:CarryingState}
export const carryingStateOf=(state:GameState)=>(state.dmTools as Holder|undefined)?.carrying
export const physicalWeightKey=(kind:PhysicalWeight['targetKind'],id:string)=>`${kind}:${id}`
const factors:Record<CarryingSize,number>={Tiny:0.5,Small:1,Medium:1,Large:2,Huge:4,Gargantuan:8}
// Decimal source masses must not acquire binary rounding noise at an exact
// capacity boundary (e.g. 19 arrows of 0.05 lb). Preserve declared decimals.
function decimalMass(value:number){
  const [coefficient,exponent='0']=value.toString().split('e'),[whole,fraction='']=coefficient.split('.')
  const places=fraction.length-Number(exponent),digits=BigInt(whole+fraction)
  return {units:places<0?digits*BigInt(10)**BigInt(-places):digits,places:Math.max(0,places)}
}
function massNumber(units:bigint,places:number){
  const digits=units.toString().padStart(places+1,'0')
  return Number(places?`${digits.slice(0,-places)}.${digits.slice(-places)}`:digits)
}
function massTimes(value:number,count:number){const mass=decimalMass(value);return massNumber(mass.units*BigInt(count),mass.places)}
function massSum(values:number[]){
  const parts=values.map(decimalMass),places=Math.max(0,...parts.map(part=>part.places))
  return massNumber(parts.reduce((total,part)=>total+part.units*BigInt(10)**BigInt(places-part.places),BigInt(0)),places)
}
export function carryingLimits(strength:number,size:CarryingSize){
  if(!Number.isSafeInteger(strength)||strength<0)throw new Error('Carrying requires an actual nonnegative integer Strength score.')
  return {carryingCapacityLb:strength*15*factors[size],pushDragLiftLimitLb:strength*30*factors[size],sizeMultiplier:factors[size]}
}
export function carryingItemContext(state:GameState,item:Item){
  return JSON.stringify({equipmentId:item.equipmentId??item.id,ammunitionType:item.ammunitionType??null,
    provision:state.dmTools?.survival?.provisions[item.id]??null,
    ...(state.dmTools?.foraging?.foods[item.id]?{foragedFood:state.dmTools.foraging.foods[item.id]}:{}),
    ...(state.dmTools?.spellbooks?.materials[item.id]?{copyMaterialsRemainingCp:state.dmTools.spellbooks.materials[item.id].remainingValueCp}:{}),
    ...(state.dmTools?.ordinaryCrafting?.materials[item.id]?{craftMaterialsRemainingCp:state.dmTools.ordinaryCrafting.materials[item.id].remainingValueCp}:{}),
    ...(state.dmTools?.groundGear?.stocks[item.id]?{groundGearStock:{kind:state.dmTools.groundGear.stocks[item.id].kind,units:state.dmTools.groundGear.stocks[item.id].units,containerItemId:state.dmTools.groundGear.stocks[item.id].containerItemId}}:{}),
    ...(state.dmTools?.foraging?.containers[item.id]?{waterContainer:state.dmTools.foraging.containers[item.id]}:{})})
}
export function physicalTargetOf(state:GameState,kind:PhysicalWeight['targetKind'],id:string,includesCarriedEquipment=false){
  if(kind==='item'){
    const value=state.dmTools?.valuables?.[id],hoard=value?.hoardId?state.dmTools?.hoards?.[value.hoardId]:undefined
    const prepared=value&&hoard&&!hoard.collected&&hoard.valuableIds.includes(id)?valuablePhysicalItem(value):undefined
    const dropped=state.droppedItems?.[id],owned=state.player.inventory.find(item=>item.id===id),item=owned??dropped?.item??prepared
    if(!item)return undefined
    return {item,position:owned?state.player.position:dropped?.position??hoard!.cell,mapId:owned?state.currentMapId:dropped?.mapId??hoard!.mapId,context:carryingItemContext(state,item)}
  }
  if(kind==='object'){
    const object=state.dmTools?.objects[id];if(!object||object.state==='destroyed')return undefined
    const coinContents=Object.values(state.dmTools?.treasures??{}).filter(value=>value.containerId===id).map(value=>({id:value.id,collected:value.collected})).sort((a,b)=>a.id.localeCompare(b.id))
    const hoardContents=Object.values(state.dmTools?.hoards??{}).filter(value=>value.containerId===id).map(value=>({id:value.id,collected:value.collected})).sort((a,b)=>a.id.localeCompare(b.id))
    const waterSource=state.dmTools?.waterSources?.sources[id]
    return {object,position:object.cell,mapId:object.mapId,context:JSON.stringify({creation:object.creation,contentsReleased:object.contentsReleased,
      ...(coinContents.length?{coinContents}:{}),...(hoardContents.length?{hoardContents}:{}),
      ...(waterSource?{waterSource:{kind:waterSource.kind,remainingQuarterPints:waterSource.remainingQuarterPints,waterWeightLbPerPint:waterSource.waterWeightLbPerPint}}:{})})}
  }
  const creature=id==='player'?state.player:state.monsters[id]??state.npcs?.[id];if(!creature)return undefined
  return {creature,position:creature.position,mapId:'mapId'in creature?creature.mapId:state.currentMapId,
    context:JSON.stringify({petrified:Boolean('conditions'in creature&&creature.conditions?.includes('petrified')),
      ...(includesCarriedEquipment?{includesCarriedEquipment:true,inventory:id==='player'?state.player.inventory.map(item=>({id:item.id,quantity:item.quantity??null,context:carryingItemContext(state,item)})):null}:{})})}
}
function carryingDryItemWeight(state:GameState,item:Item){
  const equipmentId=item.equipmentId??item.id,quantity=item.quantity,
    counted=Boolean(item.ammunitionType)||COUNTED_AMMUNITION_WEIGHTS.has(equipmentId)
  if((counted&&quantity===undefined)||quantity!==undefined&&(!Number.isSafeInteger(quantity)||quantity<0))
    return {itemId:item.id,weightLb:null,missing:'actual_quantity_required' as const}
  const count=quantity??1,declared=carryingStateOf(state)?.weights[physicalWeightKey('item',item.id)]
  const food=state.dmTools?.foraging?.foods[item.id],container=state.dmTools?.foraging?.containers[item.id]
  if(food||container){
    if(count!==1)return {itemId:item.id,weightLb:null,missing:'provisions_stack_contents_required' as const}
    if(food)return {itemId:item.id,weightLb:food.remainingHalfPounds*0.5,quantity:count,source:'actual_foraged_food_ledger' as const}
    const mass=decimalMass(container!.waterWeightLbPerPint),water=massNumber(mass.units*BigInt(container!.contentsQuarterPints)*BigInt(25),mass.places+2)
    return {itemId:item.id,weightLb:massSum([container!.dryWeightLb,water]),quantity:count,source:'actual_water_container_ledger' as const}
  }
  if(declared){
    if(declared.context!==carryingItemContext(state,item))return {itemId:item.id,weightLb:null,missing:'physical_content_changed' as const}
    return {itemId:item.id,weightLb:massTimes(declared.weightLb,count),quantity:count,source:'declared_instance' as const}
  }
  const stock=state.dmTools?.groundGear?.stocks[item.id]
  if(stock)return stock.measuredWeightLb===undefined?{itemId:item.id,weightLb:null,missing:'actual_recovered_gear_mass_required' as const}:{itemId:item.id,weightLb:massTimes(stock.measuredWeightLb,count),quantity:count,source:'actual_measured_ground_gear_stock' as const}
  const craftMaterials=state.dmTools?.ordinaryCrafting?.materials[item.id]
  if(craftMaterials&&craftMaterials.remainingValueCp<craftMaterials.initialValueCp)return{itemId:item.id,weightLb:null,missing:'actual_remaining_craft_material_mass_required' as const}
  const copyMaterials=state.dmTools?.spellbooks?.materials[item.id]
  if(copyMaterials&&copyMaterials.remainingValueCp<copyMaterials.initialValueCp)
    return {itemId:item.id,weightLb:null,missing:'actual_remaining_copy_material_mass_required' as const}
  if(equipmentId==='ration_1_day'){
    const ledger=state.dmTools?.survival?.provisions[item.id]
    if(count!==1)return {itemId:item.id,weightLb:null,missing:'provisions_stack_contents_required' as const}
    if(ledger?.kind==='ration_1_day')return {itemId:item.id,weightLb:ledger.remainingUnits*0.5*count,quantity:count,source:'actual_provisions_ledger' as const}
    return {itemId:item.id,weightLb:null,missing:'actual_contents_required' as const}
  }
  if(equipmentId==='waterskin_full'||equipmentId==='waterskin_empty')
    return {itemId:item.id,weightLb:null,missing:'actual_container_and_contents_mass_required' as const}
  const unitWeightLb=EQUIPMENT_WEIGHTS_LB[equipmentId]
  return unitWeightLb===undefined ? {itemId:item.id,weightLb:null,missing:'physical_mass_required' as const}
    : {itemId:item.id,weightLb:massTimes(unitWeightLb,count),quantity:count,source:'phb_equipment_numeric_weight' as const}
}
export function carryingItemWeight(state:GameState,item:Item){
  const dry=carryingDryItemWeight(state,item),loads=state.dmTools?.improvised?.loads,loaded=loads&&Object.hasOwn(loads,item.id)?loads[item.id]:undefined
  return !loaded||dry.weightLb===null?dry:{...dry,weightLb:massSum([dry.weightLb,1.5/20]),source:'actual_loaded_projectile_plus_host' as const}
}
export function inspectCarryingCapacity(state:GameState,entityId='player',additionalItems:readonly Item[]=[],walletAfter?:Coins){
  const actor=entityId==='player'?state.player:state.monsters[entityId],declared=carryingStateOf(state)?.actors[entityId]
  const source=entityId!=='player'&&actor&&'srd'in actor&&actor.srd?.ruleset==='2014'
    &&getMonsterRecord(actor.type)?.source.index===actor.srd.index ? getMonsterRecord(actor.type)?.source : undefined
  const native=CarryingSizeSchema.safeParse(source?.size),size=declared?.size??(native.success?native.data:undefined)
  const missing:Array<{code:string;itemId?:string}>=[]
  if(!actor)missing.push({code:'actual_actor_required'})
  if(!size)missing.push({code:'actual_actor_size_required'})
  const strength=actor?.stats.str,validStrength=typeof strength==='number'&&Number.isSafeInteger(strength)&&strength>=0
  if(!validStrength)missing.push({code:'actual_strength_required'})
  const limits=size&&validStrength?carryingLimits(strength!,size):undefined
  const items=entityId==='player'?[...state.player.inventory,...additionalItems,...activeKnotCarriedItems(state)].map(item=>carryingItemWeight(state,item)):[]
  for(const item of items)if(item.weightLb===null)missing.push({code:item.missing!,itemId:item.itemId})
  if(entityId!=='player')missing.push({code:'creature_inventory_not_modeled'})
  const coinWeightLb=entityId==='player'?massTimes(0.02,coinCount(walletAfter??state.dmTools?.wallet??emptyCoins())):null
  const physicalLoad=entityId==='player'?activePhysicalLoad(state):undefined
  const heldRecord=physicalLoad?carryingStateOf(state)?.weights[physicalWeightKey(physicalLoad.targetKind,physicalLoad.targetId)]:undefined
  const heldTarget=physicalLoad?physicalTargetOf(state,physicalLoad.targetKind,physicalLoad.targetId,heldRecord?.includesCarriedEquipment):undefined
  const payloadMass=!physicalLoad?null:heldRecord&&heldTarget&&heldRecord.context===heldTarget.context
    &&(physicalLoad.targetKind!=='creature'||heldRecord.includesCarriedEquipment===true)?heldRecord.weightLb:null
  const heldMass=physicalLoad?.operation==='carry'?payloadMass:0
  if(heldMass===null)missing.push({code:'held_whole_payload_mass_required'})
  const knownLoadLb=massSum([...items.filter(item=>item.weightLb!==null).map(item=>item.weightLb!),...(coinWeightLb===null?[]:[coinWeightLb]),...(heldMass===null?[]:[heldMass])])
  const loadResolved=entityId==='player'&&items.every(item=>item.weightLb!==null)&&heldMass!==null,carriedWeightLb=loadResolved?knownLoadLb:null
  return {entityId,rule:'standard2014' as const,tracking:declared?.tracking===true?'active' as const:'untracked' as const,
    status:missing.length?'unresolved' as const:'resolved' as const,strength:validStrength?strength:null,size:size??null,
    sizeSource:declared?'explicit_mj_physical_fact':native.success?'identified_srd_stat_block':null,...limits,
    items,coinWeightLb,knownLoadLb,carriedWeightLb,missing,...(physicalLoad?{handledLoad:{id:physicalLoad.id,operation:physicalLoad.operation,payloadWeightLb:payloadMass,includedInCarriedWeight:physicalLoad.operation==='carry'}}:{}),
    overloaded:carriedWeightLb!==null&&limits?carriedWeightLb>limits.carryingCapacityLb:null}
}
export interface CarryingAcquisition {additionalItems?:readonly Item[];walletAfter?:Coins}
export function inspectCarryingAcquisition(state:GameState,input:CarryingAcquisition){
  return inspectCarryingCapacity(state,'player',input.additionalItems??[],input.walletAfter)
}
/** Projection of an already prepared physical source record, never ownership.
 * Kept identical before/after collection so a real mass can be declared first. */
export function valuablePhysicalItem(value:ValuableRecord):Item{
  return {id:value.id,equipmentId:'valuable',type:'misc',name:value.name,
    description:`${value.kind==='gem'?'Pierre précieuse':value.kind==='collection'?'Collection de livres':'Objet d’art'} ; valeur de référence ${value.hoardId?'DMG':'du chapitre'} : ${value.valueGp} po. Aucune propriété magique ou conversion en pièces.`}
}
export function carryingMovementIssue(state:GameState,entityId:string){
  if(!carryingStateOf(state)?.actors[entityId]?.tracking)return null
  const snapshot=inspectCarryingCapacity(state,entityId)
  if(snapshot.status==='unresolved')return {code:'CARRYING_DATA_REQUIRED',message:'Active carrying tracking requires actual size, item masses and quantities before movement.',detail:{missing:snapshot.missing}}
  if(snapshot.overloaded)return {code:'CARRYING_CAPACITY_EXCEEDED',message:'The actual carried load exceeds standard carrying capacity; drop an explicitly chosen item first.',detail:{carriedWeightLb:snapshot.carriedWeightLb,carryingCapacityLb:snapshot.carryingCapacityLb}}
  return null
}
