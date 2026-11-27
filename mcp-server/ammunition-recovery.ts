import { assertGreaterBrewingIdAvailable } from './toolkit'
import { registerDerivedAdamantine } from './adamantine'
import type { AmmunitionType } from '../lib/srd/ammunition'
import { AMMUNITION, AMMUNITION_SOURCE, AMMUNITION_TYPES } from '../lib/srd/ammunition'
import type { AmmunitionRecovery } from '../lib/ammunition-state'
import type { Item } from '../lib/types'
import { inferRoomIdOnMap } from '../lib/adventure-map'
import { ammunitionState } from './ammunition'
import { advanceHeroTime } from './hero-rules'
import { assertAmmunitionSearchActor, completedAmmunitionSearch, AMMUNITION_SEARCH_INTERPRETATION } from './ammunition-search'
import { assertGameTimeAdvance } from './time-preflight'
import { assertCarryingAcquisition } from './carrying'
import { playerPoisonStateOf,validPlayerPoisonWitness,movePlayerPoisonSurface } from '../lib/player-poison-state'
import { basicPoisonKey } from '../lib/basic-poison-state'
import { breathingActivityIssue } from '../lib/activity-preflight'
import { toolkitError } from './toolkit'
import * as gs from './game-state'

export interface AmmunitionRecoveryInput {
  recoveryId:string; combatGeneration:number; ammunitionType?:AmmunitionType;
  recoveredCounts?:{ammunitionType:AmmunitionType;quantity:number}[];
  recoveredSilveredCounts?:{ammunitionType:AmmunitionType;quantity:number}[];
  searchId?:string;
  recoveredPoisonedAttackIds?:string[];
  recoveredAdamantineAttackIds?:string[];
}
export const MIXED_AMMUNITION_INTERPRETATION='PHB 2014 fixes half the total expended ammunition but does not specify a mixed-type composition. This exact physical distribution is explicitly declared by the MJ, bounded by actual expenditure and the total half; it is not an official clarification, price preference or engine-selected conversion.'
/** PHB2014 Ammunition: one minute after the battle, half the actual total.
 * This first supported search covers one real room containing the complete
 * recorded battlefield. Multi-room routes are deliberately not fabricated. */
export function recoverAmmunition(input:AmmunitionRecoveryInput) {
  assertAmmunitionSearchActor()
  const state=gs.getState(),data=state.dmTools?.ammunition
  const creation=JSON.stringify({recoveryId:input.recoveryId,combatGeneration:input.combatGeneration,
    ...(input.ammunitionType?{ammunitionType:input.ammunitionType}:{}),
    ...(input.recoveredCounts?{recoveredCounts:[...input.recoveredCounts].sort((a,b)=>AMMUNITION_TYPES.indexOf(a.ammunitionType)-AMMUNITION_TYPES.indexOf(b.ammunitionType))}:{}),
    ...(input.searchId?{searchId:input.searchId}:{}),
    ...(input.recoveredAdamantineAttackIds?{recoveredAdamantineAttackIds:input.recoveredAdamantineAttackIds}:{}),
    ...(input.recoveredPoisonedAttackIds?{recoveredPoisonedAttackIds:input.recoveredPoisonedAttackIds}:{}),
    ...(input.recoveredSilveredCounts?{recoveredSilveredCounts:[...input.recoveredSilveredCounts].sort((a,b)=>AMMUNITION_TYPES.indexOf(a.ammunitionType)-AMMUNITION_TYPES.indexOf(b.ammunitionType))}:{})})
  const existing=data?.recoveries&&Object.hasOwn(data.recoveries,input.recoveryId)?data.recoveries[input.recoveryId]:undefined
  if(existing) {
    if(existing.creation!==creation)toolkitError('AMMUNITION_RECOVERY_ID_CONFLICT','This recovery ID belongs to another immutable search definition.')
    return {success:true,replayed:true,recovery:existing,seconds:0,notice:'The actual previous search is returned; no second time, projectile or refill.'}
  }
  if(Object.values(data?.recoveries??{}).some(record=>record.combatGeneration===input.combatGeneration))
    toolkitError('AMMUNITION_BATTLE_ALREADY_SEARCHED','This complete battle has already been searched; another recovery ID or ammunition type cannot grant a second half.')
  if(input.combatGeneration<=0)toolkitError('AMMUNITION_BATTLE_REQUIRED','Recovery requires a real positive combat generation, not exploration shots or an unwitnessed legacy battle.')
  const battleExpenditures=Object.values(data?.expenditures??{}).filter(record=>record.inCombat===true&&record.combatGeneration===input.combatGeneration)
  const expenditures=battleExpenditures
  if(!expenditures.length)toolkitError('AMMUNITION_NO_EXPENDITURE','No actual recorded combat expenditure exists for this exact battle.')
  const actualTypes=AMMUNITION_TYPES.filter(type=>expenditures.some(record=>record.ammunitionType===type))
  if(input.ammunitionType&&input.recoveredCounts)toolkitError('AMMUNITION_RECOVERY_ARGUMENTS_INVALID','Use the singular ammunitionType or the complete explicit recoveredCounts, not both.')
  if(input.ammunitionType&&actualTypes.length>1)
    toolkitError('AMMUNITION_MIXED_TYPES_SEARCH_REQUIRED','Declare recoveredCounts for every actual type in this mixed battle; the complete search costs one minute, never a minute per type.')
  if(input.ammunitionType&&input.ammunitionType!==actualTypes[0])toolkitError('AMMUNITION_NO_EXPENDITURE','The declared singular ammunition type was not expended in this battle.')
  if(!input.ammunitionType&&!input.recoveredCounts)toolkitError('AMMUNITION_RECOVERY_COUNTS_REQUIRED','Choose the singular actual type or explicitly declare the complete recoveredCounts distribution.')
  const expendedQuantity=expenditures.length,recoveredQuantity=Math.floor(expendedQuantity/2)
  for(const spent of expenditures)if(spent.playerPoison&&!validPlayerPoisonWitness(state,spent.playerPoison))toolkitError('PLAYER_POISON_WITNESS_INVALID','Retain the real original dose witness on every expended projectile before searching; no free coating is inferred.')
  const potent=expenditures.filter(spent=>spent.playerPoison&&playerPoisonStateOf(state)?.preparations[spent.playerPoison.preparationId]?.status==='active'),potentIds=new Set(potent.map(spent=>spent.attackId))
  if(potent.length&&recoveredQuantity>0&&input.recoveredPoisonedAttackIds===undefined)toolkitError('AMMUNITION_POISON_RECOVERY_SELECTION_REQUIRED','Explicitly select the actual still-potent coated shot IDs recovered (or an empty array). Their original doses cannot disappear, duplicate or spread over an ordinary recovered stack.')
  const selectedIds=input.recoveredPoisonedAttackIds??[]
  if(new Set(selectedIds).size!==selectedIds.length||selectedIds.length>recoveredQuantity||selectedIds.some(id=>!potentIds.has(id)))toolkitError('AMMUNITION_POISON_RECOVERY_SELECTION_INVALID','Select each actual still-potent shot at most once, within the total recovered half; no delivered, unspent or foreign projectile is recreated.')
  const material=expenditures.filter(spent=>spent.adamantine),materialIds=new Set(material.map(s=>s.attackId)),chosenMaterial=input.recoveredAdamantineAttackIds
  if(material.length&&chosenMaterial===undefined)toolkitError('ADAMANTINE_RECOVERY_SELECTION_REQUIRED','Explicitly select actual adamantine shot IDs recovered, or[]for none; no material or conversion is chosen by the engine.')
  if(chosenMaterial&&(new Set(chosenMaterial).size!==chosenMaterial.length||chosenMaterial.some(id=>!materialIds.has(id))))toolkitError('ADAMANTINE_RECOVERY_SOURCE_INVALID','Select distinct actual material shots from this completed battle only.')
  const materialChosen=new Set(chosenMaterial??[])
  if(expenditures.some(s=>materialIds.has(s.attackId)&&potentIds.has(s.attackId)&&materialChosen.has(s.attackId)!==selectedIds.includes(s.attackId)))toolkitError('ADAMANTINE_RECOVERY_COMPOSITION_INVALID','The same material+poison unit must be selected consistently in both source choices; neither material nor dose disappears.')
  const selected=[...new Set([...selectedIds,...chosenMaterial??[]])].map(id=>expenditures.find(spent=>spent.attackId===id)!)
  const declared=input.recoveredCounts??[{ammunitionType:actualTypes[0],quantity:recoveredQuantity}]
  if(new Set(declared.map(entry=>entry.ammunitionType)).size!==declared.length)
    toolkitError('AMMUNITION_RECOVERY_TYPE_DUPLICATE','Declare each actually expended ammunition type exactly once, including an explicit zero when none of it was recovered.')
  if(declared.length!==actualTypes.length||actualTypes.some(type=>!declared.some(entry=>entry.ammunitionType===type)))
    toolkitError('AMMUNITION_RECOVERY_TYPES_INCOMPLETE','The explicit distribution must cover every actually expended type once, with no invented type.')
  for(const entry of declared)if(entry.quantity>expenditures.filter(record=>record.ammunitionType===entry.ammunitionType).length)
    toolkitError('AMMUNITION_RECOVERY_TYPE_EXCESS','A recovered type cannot exceed the actual count expended of that exact type; projectiles are never converted.')
  if(declared.reduce((sum,entry)=>sum+entry.quantity,0)!==recoveredQuantity)
    toolkitError('AMMUNITION_RECOVERY_TOTAL_INVALID',`Declare exactly ${recoveredQuantity} recovered projectiles in total: half of the whole battle expenditure, rounded down once.`)
  if(input.combatGeneration>(state.combatGeneration??0))toolkitError('AMMUNITION_BATTLE_NOT_ENDED','The selected battle does not have an established completed generation.')
  const mapId=state.currentMapId,roomId=state.currentRoomId
  if(!mapId||!roomId||inferRoomIdOnMap(state.player.position,mapId,state)!==roomId)
    toolkitError('AMMUNITION_BATTLEFIELD_REQUIRED','The player must be in the actual established battlefield map and room.')
  if(expenditures.some(record=>record.mapId!==mapId))
    toolkitError('AMMUNITION_BATTLEFIELD_REQUIRED','Return to the actual battlefield map before searching for these projectiles.')
  const rooms=new Set(expenditures.flatMap(record=>[record.roomId,
    inferRoomIdOnMap(record.shooterCell,mapId,state),inferRoomIdOnMap(record.targetCell,mapId,state)]))
  const performedSearch=input.searchId?completedAmmunitionSearch(input.searchId,input.combatGeneration):undefined
  if(!performedSearch&&rooms.size!==1)
    toolkitError('BATTLEFIELD_SEARCH_ROUTE_REQUIRED','This complete battle crosses rooms or is elsewhere. A real search route is required; this tool only searches the full battlefield within one current room.')
  if(!rooms.has(roomId))toolkitError('AMMUNITION_BATTLEFIELD_REQUIRED','Return to the actual single-room battlefield before searching its projectiles.')
  const allocations=actualTypes.map(ammunitionType=>{
    const count=declared.find(entry=>entry.ammunitionType===ammunitionType)!.quantity
    const spent=expenditures.filter(record=>record.ammunitionType===ammunitionType),chosen=selected.filter(record=>record.ammunitionType===ammunitionType),plain=spent.filter(record=>!potentIds.has(record.attackId)&&!materialIds.has(record.attackId)),remaining=count-chosen.length,chosenSilver=chosen.filter(record=>record.silvered).length,plainSilver=plain.filter(record=>record.silvered).length
    if(remaining<0||remaining>plain.length)toolkitError('AMMUNITION_POISON_RECOVERY_COMPOSITION_INVALID','The declared recovered type count must preserve the exact selected coated units and actual available uncoated remainder; no omitted potent dose becomes ordinary ammunition.')
    const minimum=chosenSilver+Math.max(0,remaining-(plain.length-plainSilver)),maximum=chosenSilver+Math.min(remaining,plainSilver)
    const choice=input.recoveredSilveredCounts?.find(entry=>entry.ammunitionType===ammunitionType)
    if(!choice&&minimum!==maximum)toolkitError('AMMUNITION_RECOVERY_SILVER_COMPOSITION_REQUIRED','Declare the actual recovered silvered count for each ambiguous mixed-coated type; the engine never selects valuable projectiles or creates silver.')
    const silveredQuantity=choice?.quantity??minimum
    if(silveredQuantity<minimum||silveredQuantity>maximum)toolkitError('AMMUNITION_RECOVERY_SILVER_EXCESS','The recovered coating distribution must fit the actual expended silvered and ordinary counts.')
    const itemId=count?(actualTypes.length===1?`ammo-recovered:${input.recoveryId}`:`ammo:${input.recoveryId}:${ammunitionType}`):undefined
    return {ammunitionType,expendedQuantity:expenditures.filter(record=>record.ammunitionType===ammunitionType).length,recoveredQuantity:count,
      ...(itemId?{itemId}:{}),...(silveredQuantity?{silveredQuantity,silveredItemId:silveredQuantity===count?itemId:`${itemId}:silver`}:{})}
  })
  if(input.recoveredSilveredCounts&&(new Set(input.recoveredSilveredCounts.map(x=>x.ammunitionType)).size!==input.recoveredSilveredCounts.length||input.recoveredSilveredCounts.some(x=>!actualTypes.includes(x.ammunitionType))))
    toolkitError('AMMUNITION_RECOVERY_SILVER_TYPES_INVALID','Declare each chosen coating count once for an actually expended type only.')
  const poisoned=selected.map((spent,index)=>({spent,item:{id:`ammo-poison:${input.recoveryId}:${index}`,equipmentId:AMMUNITION[spent.ammunitionType].equipmentId,name:`${AMMUNITION[spent.ammunitionType].label} — unité réellement retrouvée`,description:'Même projectile réellement recherché ; matière et sources réelles conservées.',type:'misc' as const,ammunitionType:spent.ammunitionType,quantity:1,...spent.adamantine?{adamantine:spent.adamantine}:{},...spent.silvered?{silvered:true}:{}}}))
  for(const allocation of allocations){const chosen=selected.filter(spent=>spent.ammunitionType===allocation.ammunitionType),chosenSilver=chosen.filter(spent=>spent.silvered).length,ordinary=allocation.recoveredQuantity-(allocation.silveredQuantity??0)-(chosen.length-chosenSilver),silver=(allocation.silveredQuantity??0)-chosenSilver;if(!ordinary)allocation.itemId=silver?allocation.silveredItemId:undefined;if(!silver)allocation.silveredItemId=undefined}
  const futureIds=[...allocations.flatMap(allocation=>[allocation.itemId,allocation.silveredItemId]),...poisoned.map(value=>value.item.id)]
  for(const itemId of new Set(futureIds))if(itemId)assertGreaterBrewingIdAvailable(itemId)
  for(const itemId of new Set(futureIds))if(itemId&&(state.player.inventory.some(item=>item.id===itemId)||Object.hasOwn(state.droppedItems??{},itemId)
    ||Object.hasOwn(state.dmTools?.magicItems??{},itemId)||Object.hasOwn(state.dmTools?.spellScrolls??{},itemId)
    ||Object.hasOwn(data?.prepared??{},itemId)||gs.getAllEntities().some(actor=>actor.id===itemId)||Object.hasOwn(state.npcs??{},itemId)))
    toolkitError('AMMUNITION_RECOVERED_ITEM_CONFLICT','The recovered physical item ID already belongs to another actual object or actor.')
  const recoveredItems:Item[]=allocations.flatMap(allocation=>{
    const chosen=selected.filter(spent=>spent.ammunitionType===allocation.ammunitionType),chosenSilver=chosen.filter(spent=>spent.silvered).length,silver=(allocation.silveredQuantity??0)-chosenSilver,
      ordinary=allocation.recoveredQuantity-(allocation.silveredQuantity??0)-(chosen.length-chosenSilver),base={equipmentId:AMMUNITION[allocation.ammunitionType].equipmentId,
      name:`${AMMUNITION[allocation.ammunitionType].label} — récupération`,description:'Projectiles réellement retrouvés ; chaque revêtement reste borné par les dépenses effectives.',type:'misc' as const,ammunitionType:allocation.ammunitionType}
    return [...(ordinary?[{...base,id:allocation.itemId!,quantity:ordinary}]:[]),...(silver?[{...base,id:allocation.silveredItemId!,quantity:silver,silvered:true}]:[])]
  })
  recoveredItems.push(...poisoned.map(value=>value.item))
  if(Object.keys(data?.prepared??{}).length+recoveredItems.length>128)toolkitError('AMMUNITION_AUTHORING_LIMIT','No retained physical identity slot remains for these actually recovered stacks.')
  if(Object.keys(state.dmTools?.adamantine?.instances??{}).length+poisoned.filter(v=>v.spent.adamantine).length>1024)toolkitError('ADAMANTINE_HISTORY_LIMIT','Retain each selected material projectile before time or acquisition.')
  assertCarryingAcquisition({additionalItems:recoveredItems})
  // Every refusal above and every unresolved clock boundary below precedes
  // fictional time, mutation and any natural clock reconciliation.
  const seconds=performedSearch?0:60
  const activity=breathingActivityIssue(state,'player',seconds);if(activity)toolkitError(activity.code,activity.message)
  assertGameTimeAdvance(seconds)
  const startedAt=performedSearch?.startedAt??state.worldTimeSeconds??0
  if(seconds)advanceHeroTime(seconds)
  const recovery:AmmunitionRecovery={recoveryId:input.recoveryId,creation,combatGeneration:input.combatGeneration,
    ...(actualTypes.length===1?{ammunitionType:actualTypes[0],...(allocations[0].itemId?{itemId:allocations[0].itemId}:{})}:{}),
    mapId:mapId!,roomId:roomId!,attackIds:expenditures.map(record=>record.attackId),expendedQuantity,recoveredQuantity,startedAt,completedAt:state.worldTimeSeconds??0,
    allocations,composition:actualTypes.length===1?'single_type_deterministic':'explicit_mj_allocation',
    ...(poisoned.some(v=>potentIds.has(v.spent.attackId))?{poisonedUnits:poisoned.filter(v=>potentIds.has(v.spent.attackId)).map(({spent,item})=>({attackId:spent.attackId,itemId:item.id,preparationId:spent.playerPoison!.preparationId}))}:{}),
    ...(poisoned.some(v=>v.spent.adamantine)?{adamantineUnits:poisoned.filter(v=>v.spent.adamantine).map(v=>({attackId:v.spent.attackId,itemId:v.item.id}))}:{}),
    ...(performedSearch?{searchId:performedSearch.searchId,searchSeconds:60,searchInterpretation:AMMUNITION_SEARCH_INTERPRETATION}:{}),
    ...(actualTypes.length>1?{interpretation:MIXED_AMMUNITION_INTERPRETATION}:{})}
  state.player.inventory.push(...recoveredItems)
  const current=ammunitionState();current.recoveries??={};current.recoveries[input.recoveryId]=recovery
  for(const item of recoveredItems)current.prepared[item.id]={itemId:item.id,creation:JSON.stringify({operation:'actual_battle_recovery',recoveryId:input.recoveryId,quantity:item.quantity,silvered:Boolean(item.silvered),ammunitionType:item.ammunitionType})}
  for(const {spent,item}of poisoned){if(item.adamantine)registerDerivedAdamantine(item,'recovery',input.recoveryId,spent.attackId,spent.ammunitionItemId);if(potentIds.has(spent.attackId))movePlayerPoisonSurface(state,spent.playerPoison!,{kind:'item',id:item.id,key:basicPoisonKey('ammunition',item.id)})}
  if(performedSearch){performedSearch.status='completed';performedSearch.completedByRecoveryId=input.recoveryId}
  return {success:true,replayed:false,recovery,seconds,source:AMMUNITION_SOURCE,
    ...(performedSearch?{searchSeconds:60,searchInterpretation:AMMUNITION_SEARCH_INTERPRETATION}:{}),
    ...(recovery.interpretation?{interpretation:recovery.interpretation}:{}),
    notice:'Half the total actually expended ammunition for the complete searched battle was recovered once; performed checkpoint time is never charged a second time.'}
}
