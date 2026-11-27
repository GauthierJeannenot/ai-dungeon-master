import { dashMovementMultiplier } from '../lib/chase-state'
import { actualLocomotionLocation } from '../lib/locomotion-state'
import type { GridCell } from '../lib/adventure-map'
import { inferRoomIdOnMap } from '../lib/adventure-map'
import { navigationActor } from '../lib/navigation'
import { carryingStateOf,physicalWeightKey,physicalTargetOf,inspectCarryingCapacity } from '../lib/carrying-state'
import { activePhysicalLoad,physicalHandlingStateOf,distanceFromLoad,type PhysicalLoad,type PhysicalHandlingState,type LoadFootprint } from '../lib/physical-handling-state'
import { playerHandOccupancy } from '../lib/hand-occupancy'
import { assessHandlingLoad } from './carrying'
import { planPairedLoadPath,physicalLoadReach } from './paired-load-path'
import { engineGeometry } from './navigation'
import { heldGrappleTargets } from './grapple-transport'
import { available,addHeroEffect,removeHeroEffect,hero } from './hero-rules'
import { spendAttack } from './combat-actions'
import { spendObjectInteraction } from './equipment'
import { conditionImmune } from './monster-rules'
import { toolkitState,toolkitError } from './toolkit'
import * as rules from './rules'
import * as gs from './game-state'

export interface BeginPhysicalHandling {
  loadId:string;actorId:string;targetKind:'creature'|'object';targetId:string;operation:'carry'|'push'|'drag';
  control:'grapple'|'incapacitated_grapple'|'willing'|'inanimate';hands:1|2;reason:string;source:string;
  grappleEffectId?:string;willing?:true;mobilityConfirmed?:true;interactionCost?:'interaction'|'action';objectFootprint?:LoadFootprint;
}
export interface PhysicalTransportInput {loadId:string;targetId:string;targetToCell:GridCell}
const incapacitated=(conditions:readonly string[])=>conditions.some(condition=>['incapacitated','unconscious','petrified','stunned','paralyzed'].includes(condition))
const store=()=>((toolkitState() as ReturnType<typeof toolkitState>&{physicalHandling?:PhysicalHandlingState}).physicalHandling??={version:1,loads:{}})
const sizes=['Tiny','Small','Medium','Large','Huge','Gargantuan']
export function currentPhysicalLoad(loadId:string){
  const load=activePhysicalLoad(gs.getState())
  if(!load||load.id!==loadId)toolkitError('PHYSICAL_LOAD_NOT_HELD','Choose the exact currently held physical load ID; an old receipt cannot resume a released grip.')
  return load!
}
function targetFor(load:Pick<PhysicalLoad,'targetKind'|'targetId'>){
  const target=load.targetKind==='object'?gs.getState().dmTools?.objects[load.targetId]:gs.getMonster(load.targetId)
  if(!target||'state'in target&&target.state==='destroyed')toolkitError('PHYSICAL_LOAD_TARGET_REQUIRED','Select an actual intact object or active modeled body; no narrative NPC or archive is activated.')
  const position='cell'in target!?target!.cell:target!.position
  const mapId='mapId'in target!?target!.mapId:gs.getState().currentMapId
  if(mapId!==gs.getState().currentMapId)toolkitError('PHYSICAL_LOAD_WRONG_MAP','The exact load must already be on the active map.')
  if(load.targetKind==='object'){
    const object=gs.getState().dmTools!.objects[load.targetId]
    if(object.razorvine)toolkitError('RAZORVINE_ROOTED_HEDGE','This sourced rooted hedge is not a portable object or detachable payload.')
    const attached=[...Object.values(gs.getState().dmTools?.treasures??{}),...Object.values(gs.getState().dmTools?.hoards??{})].filter(value=>value.containerId===object.id&&!value.collected)
    const traps=Object.values(gs.getState().dmTools?.traps??{}).filter(value=>value.objectId===object.id)
    if([...attached,...traps].some(value=>value.mapId!==object.mapId||value.cell.x!==object.cell.x||value.cell.y!==object.cell.y))toolkitError('PHYSICAL_ATTACHMENT_STATE_MISMATCH','Actual container attachments must agree with the load source location before any grip cost.')
  }
  return {target:target!,position}
}
function wholePayload(load:Pick<PhysicalLoad,'targetKind'|'targetId'>){
  const state=gs.getState(),record=carryingStateOf(state)?.weights[physicalWeightKey(load.targetKind,load.targetId)]
  const actual=physicalTargetOf(state,load.targetKind,load.targetId,record?.includesCarriedEquipment)
  if(!record||!actual||record.unit!=='lb_total'||record.context!==actual.context)
    toolkitError('PHYSICAL_PAYLOAD_MASS_REQUIRED','Declare the current real whole payload mass before handling it; unknown contents are not zero.')
  if(load.targetKind==='creature'&&record!.includesCarriedEquipment!==true)
    toolkitError('PHYSICAL_PAYLOAD_GEAR_REQUIRED','The actual measured creature payload must explicitly include all transported equipment; no empty NPC inventory is invented.')
  return record!.weightLb
}
export function beginPhysicalHandling(input:BeginPhysicalHandling){
  available()
  if(input.actorId!=='player')toolkitError('PHYSICAL_CARRIER_NOT_MODELED','This physical transport requires the player inventory and hand model; other carriers need actual hand and carried-equipment data.')
  const state=gs.getState(),creation=JSON.stringify(input),old=physicalHandlingStateOf(state)?.loads[input.loadId]
  if(actualLocomotionLocation(state,'player')||input.targetKind==='creature'&&actualLocomotionLocation(state,input.targetId))toolkitError('LOCOMOTION_PAYLOAD_UNSUPPORTED','This swimming/suspended body needs its actual support or source vertical rescue geometry; this old ground-only grip cannot flatten it or create paired vertical transport.')
  if(old){if(old.creation!==creation)toolkitError('PHYSICAL_LOAD_ID_CONFLICT','This retained load ID has another immutable handling definition.');return {success:true,replayed:true,load:old,active:old.status==='active'}}
  if(activePhysicalLoad(state))toolkitError('PHYSICAL_LOAD_ALREADY_HELD','Release the current physical load explicitly; no second target or third body is moved.')
  if(Object.keys(physicalHandlingStateOf(state)?.loads??{}).length>=128)toolkitError('PHYSICAL_LOAD_HISTORY_LIMIT','The retained handling history is full; no receipt is erased to permit another grip.')
  if(state.phase==='combat')rules.validateFreeCombatAction('player');else rules.validateActionUse('player')
  navigationActor(state,'player')
  const {target,position}=targetFor(input),body=input.targetKind==='creature'?gs.getMonster(input.targetId):undefined
  const life=body?(body.isAlive?'living':'dead'):'object'
  let footprint:LoadFootprint
  if(input.targetKind==='creature'){
    if(input.objectFootprint)toolkitError('PHYSICAL_FOOTPRINT_NOT_APPLICABLE','Active body tokens use their existing one-cell projection; no larger global token footprint is invented here.')
    footprint={widthCells:1,heightCells:1,source:'Existing active single-cell body-token projection; no altitude or expanded creature footprint.'}
  }else{
    const object=state.dmTools!.objects[input.targetId],known=object.kind==='obstacle'?(object.size==='large'?2:1):undefined
    footprint=input.objectFootprint??(known?{widthCells:known,heightCells:known,source:'Actual prepared obstacle footprint already used by navigation.'}:undefined)!
    if(!footprint)toolkitError('PHYSICAL_LOAD_FOOTPRINT_REQUIRED','A container/lever needs its actual sourced grid footprint, not a shape inferred from its name or HP size.')
    if(known&&(footprint.widthCells!==known||footprint.heightCells!==known))toolkitError('PHYSICAL_LOAD_FOOTPRINT_CONFLICT','The chosen shape contradicts this obstacle actual navigation footprint.')
    if(object.linkedDoorId)toolkitError('PHYSICAL_LOAD_ATTACHED','This lever is attached to an authored door; no detachment is resolved by carrying it.')
  }
  if(distanceFromLoad(state.player.position,position,footprint)!==1)toolkitError('PHYSICAL_LOAD_OUT_OF_REACH','Approach an actual adjacent edge of the load without overlapping it.')
  if(!physicalLoadReach(state,'player',input.targetId,input.targetKind,position,footprint,engineGeometry()))toolkitError('PHYSICAL_LOAD_REACH_BLOCKED','An actual wall, closed door or blocked corner prevents this physical grip.')
  if(body&&conditionImmune(body,'grappled'))toolkitError('PHYSICAL_BODY_FORM_UNSUPPORTED','This source cannot be held by an ordinary physical grapple; no corporeal body or grip is invented from its token.')
  const mass=wholePayload(input),capacity=inspectCarryingCapacity(state)
  if(capacity.status!=='resolved')toolkitError('CARRYING_DATA_REQUIRED','Establish the player actual size, carried item masses and quantities before physical transport.')
  const assessment=assessHandlingLoad({entityId:'player',targetKind:input.targetKind,targetId:input.targetId,operation:input.operation})
  if(assessment.capacityPermits!==true)toolkitError('CARRYING_CAPACITY_EXCEEDED','The actual whole payload exceeds the selected standard carrying or pushing/dragging limit.')
  if(body&&state.hero?.effects.some(effect=>effect.targetIds.includes(body.id)&&effect.expiresAt>(state.worldTimeSeconds??0)&&effect.data.speedZero===true))toolkitError('PHYSICAL_LOAD_ANCHORED','Resolve the actual anchored trap before transporting this body.')
  const held=heldGrappleTargets(state,'player')
  if(body&&(heldGrappleTargets(state,body.id).length||state.hero?.effects.some(effect=>effect.kind==='grapple'&&effect.sourceId!=='player'&&effect.targetIds.includes(body.id)&&effect.expiresAt>(state.worldTimeSeconds??0))
    ||state.monsterEffects?.some(effect=>effect.kind==='grapple'&&effect.sourceId!=='player'&&effect.targetId===body.id&&(effect.expiresAt===undefined||effect.expiresAt>(state.worldTimeSeconds??0)))))
    toolkitError('PHYSICAL_THIRD_BODY_UNSUPPORTED','Resolve the other actual holder or held creature first; this pair cannot silently move a third body.')
  let grappleEffectId:string|undefined
  if(input.control==='grapple'){
    const effect=state.hero?.effects.find(effect=>effect.id===input.grappleEffectId&&effect.kind==='grapple'&&effect.sourceId==='player'&&effect.targetIds.includes(input.targetId)&&effect.expiresAt>(state.worldTimeSeconds??0))
    if(life!=='living'||!effect||!body!.conditions.includes('grappled'))toolkitError('PHYSICAL_SOURCE_GRAPPLE_REQUIRED','Choose the exact actual active player grapple effect on this living target; no contest or success is invented.')
    grappleEffectId=effect!.id
  }else if(input.grappleEffectId)toolkitError('PHYSICAL_GRAPPLE_ARGUMENT_INVALID','A preexisting source effect ID belongs only to control=grapple.')
  if(held.some(id=>id!==input.targetId)||held.length&&input.control!=='grapple')toolkitError('PHYSICAL_OTHER_HOLD_REQUIRED','Release other actual holds first; a paired move cannot transport a third body.')
  if(life==='living'){
    if(input.operation==='push')toolkitError('PHYSICAL_LIVING_PUSH_REQUIRED','Use the real Shove resolver for pushing a living creature; this tool cannot bypass its attack/contest.')
    if(input.control==='inanimate')toolkitError('PHYSICAL_LIVING_CONTROL_REQUIRED','A living body needs an actual grapple or explicit current willingness.')
    if(input.control==='incapacitated_grapple'&&(!incapacitated(body!.conditions)||conditionImmune(body!,'grappled')))toolkitError('PHYSICAL_INCAPACITATED_GRAPPLE_REQUIRED','The living target must actually be incapacitated and susceptible to grappled.')
    if(input.control==='willing'&&(input.willing!==true||body!.hp.current<=0||incapacitated(body!.conditions)||body!.conditions.includes('grappled')))
      toolkitError('PHYSICAL_CURRENT_CONSENT_REQUIRED','A capable living target needs explicit established willingness; hostility, silence or incapacity never imply consent.')
    const targetSize=inspectCarryingCapacity(state,body!.id).size
    if(!targetSize||!capacity.size)toolkitError('PHYSICAL_BODY_SIZE_REQUIRED','Actual sourced sizes are required for a living-body grip.')
    if(input.control!=='willing'&&sizes.indexOf(targetSize)>sizes.indexOf(capacity.size)+1)toolkitError('TARGET_TOO_LARGE','This creature is more than one actual size larger than its grappler.')
  }else if(input.control!=='inanimate'||input.mobilityConfirmed!==true||!input.interactionCost)
    toolkitError('PHYSICAL_INANIMATE_CONTROL_REQUIRED','Confirm actual mobility and the MJ interaction/action cost for this inanimate load; a corpse is not an automatic living grapple.')
  if(life==='living'&&(input.mobilityConfirmed!==undefined||input.interactionCost!==undefined)||input.control!=='willing'&&input.willing!==undefined)
    toolkitError('PHYSICAL_CONTROL_ARGUMENT_INVALID','Use only the control facts applicable to this actual load.')
  const hands=playerHandOccupancy(state),needed=input.hands-(grappleEffectId?1:0)
  if(hands.invalid||hands.bound||hands.free<needed)toolkitError('FREE_HAND_REQUIRED','Explicitly free the actual required hands before acquiring this physical grip.')
  const actionCreditsBefore=state.hero?.actionCredits
  if(input.control==='incapacitated_grapple'){
    if(state.phase==='combat'&&!(hero().attackAction?.remaining??0))rules.validateActionUse('player')
  }else if(input.control==='willing'||input.interactionCost==='action')rules.validateActionUse('player')
  // All identities, masses, consent, shape, reach, hand and action preflights
  // precede the real cost. This automatic source grapple consumes no d20.
  if(input.control==='incapacitated_grapple'){
    if(state.phase==='combat')spendAttack();else rules.recordAction('player')
    grappleEffectId=addHeroEffect('grapple','player',[input.targetId],1e12,{condition:'grappled'}).id
  }else if(input.control==='willing'||input.interactionCost==='action')rules.recordAction('player')
  else if(input.control==='inanimate')spendObjectInteraction()
  const load:PhysicalLoad={id:input.loadId,actorId:'player',targetKind:input.targetKind,targetId:input.targetId,operation:input.operation,control:input.control,
    hands:input.hands,mapId:state.currentMapId!,footprint,targetLife:life,grappleEffectId,reason:input.reason,source:input.source,creation,
    startedAt:state.worldTimeSeconds??0,status:'active',lastActorCell:{...state.player.position},lastTargetCell:{...position}}
  const data=store();data.loads[load.id]=load;data.activeId=load.id
  return {success:true,load,payloadWeightLb:mass,actionResolved:input.control!=='grapple',movementResolved:false,
    actionSpent:state.phase==='combat'&&actionCreditsBefore!==undefined&&state.hero!.actionCredits<actionCreditsBefore,attackSpent:input.control==='incapacitated_grapple',
    adjudication:input.control==='willing'||input.control==='inanimate'?'Explicit MJ physical-control ruling under PHB Other Activity/Improvising an Action; not a universal printed pickup rule.':undefined}
}
export function releasePhysicalHandling(loadId?:string,reason='Explicit release'){
  const state=gs.getState(),load=activePhysicalLoad(state)
  if(!load){const previous=loadId?physicalHandlingStateOf(state)?.loads[loadId]:undefined;if(previous?.status==='released')return {success:true,replayed:true,load:previous};return {success:true,released:false}}
  if(loadId&&load.id!==loadId)toolkitError('PHYSICAL_LOAD_NOT_HELD','Choose the exact actual held load ID.')
  const data=store();delete data.activeId;load.status='released';load.endedAt=state.worldTimeSeconds??0
  if(load.grappleEffectId&&state.hero?.effects.some(effect=>effect.id===load.grappleEffectId))removeHeroEffect(load.grappleEffectId)
  return {success:true,released:true,load,reason,actionSpent:false,movementResolved:false}
}
export function reconcilePhysicalHandling(){
  const state=gs.getState(),load=activePhysicalLoad(state);if(!load)return
  const body=load.targetKind==='creature'?state.monsters[load.targetId]:undefined,object=load.targetKind==='object'?state.dmTools?.objects[load.targetId]:undefined
  const target=body??object,position=body?.position??object?.cell
  const sourceActive=!load.grappleEffectId||state.hero?.effects.some(effect=>effect.id===load.grappleEffectId&&effect.expiresAt>(state.worldTimeSeconds??0))
  if(!target||!position||state.currentMapId!==load.mapId||object&&(object.mapId!==load.mapId||object.state==='destroyed')
    ||state.player.hp.current<=0||incapacitated(state.player.conditions)||!sourceActive||body&&((load.targetLife==='dead')!==(!body.isAlive))
    ||distanceFromLoad(state.player.position,position,load.footprint)!==1){releasePhysicalHandling(load.id,'Actual grip/source/life/position ended');return}
  load.lastActorCell={...state.player.position};load.lastTargetCell={...position}
}
export function inspectPhysicalTransport(actorId:string,transport:PhysicalTransportInput){
  const state=gs.getState(),load=currentPhysicalLoad(transport.loadId)
  if(actorId!==load.actorId||transport.targetId!==load.targetId)toolkitError('PHYSICAL_LOAD_SELECTION_CONFLICT','The explicit actor/target must match the actual held load.')
  const {target,position}=targetFor(load),mass=wholePayload(load),capacity=inspectCarryingCapacity(state)
  if(capacity.status!=='resolved')toolkitError('CARRYING_DATA_REQUIRED','Resolve the real carried inventory and whole-payload masses before moving.')
  if(capacity.overloaded||load.operation!=='carry'&&mass>capacity.pushDragLiftLimitLb!)toolkitError('CARRYING_CAPACITY_EXCEEDED','The actual held load exceeds this current standard capacity.')
  if(distanceFromLoad(state.player.position,position,load.footprint)!==1)toolkitError('PHYSICAL_LOAD_OUT_OF_REACH','The actual grip has no adjacent target; it cannot teleport back into reach.')
  const hands=playerHandOccupancy(state)
  if(hands.bound||hands.invalid)toolkitError('PHYSICAL_HANDS_BOUND','The actual bound or inconsistent hand state cannot move this physical load.')
  if(load.targetKind==='creature'&&(heldGrappleTargets(state,load.targetId).length||state.hero?.effects.some(effect=>effect.kind==='grapple'&&effect.sourceId!=='player'&&effect.targetIds.includes(load.targetId)&&effect.expiresAt>(state.worldTimeSeconds??0))
    ||state.monsterEffects?.some(effect=>effect.kind==='grapple'&&effect.sourceId!=='player'&&effect.targetId===load.targetId&&(effect.expiresAt===undefined||effect.expiresAt>(state.worldTimeSeconds??0)))))
    toolkitError('PHYSICAL_THIRD_BODY_UNSUPPORTED','Resolve the new actual third-body hold before moving this pair.')
  if(load.grappleEffectId&&!heldGrappleTargets(state,actorId).includes(load.targetId))toolkitError('PHYSICAL_SOURCE_GRAPPLE_REQUIRED','The actual source grapple ended; no carried creature is silently reacquired.')
  const dash=dashMovementMultiplier(state,actorId)
  const actorSpeed=navigationActor(state,actorId).speed/dash
  const targetSize=load.targetKind==='creature'?inspectCarryingCapacity(state,load.targetId).size:null
  const divisor=load.grappleEffectId&&(!targetSize||sizes.indexOf(capacity.size!)-sizes.indexOf(targetSize)<2)?2:1
  const speed=Math.min(Math.floor(actorSpeed/divisor),load.operation!=='carry'&&mass>capacity.carryingCapacityLb!?5:Infinity)*dash
  return {actorId,targetId:load.targetId,loadId:load.id,speed,speedDivisor:divisor,payloadWeightLb:mass,footprint:load.footprint,
    targetKind:load.targetKind,targetLife:load.targetLife,operation:load.operation,targetPosition:position,
    targetIsLiving:load.targetKind==='creature'&&'isAlive'in target&&target.isAlive}
}
export function planPhysicalTransportPath(actorId:string,toCell:GridCell,transport:PhysicalTransportInput,geometry?:import('../lib/battlemap-geometry').BattlemapGeometry){
  const info=inspectPhysicalTransport(actorId,transport)
  const joint=planPairedLoadPath(gs.getState(),actorId,toCell,info.targetId,info.targetKind,info.targetPosition,transport.targetToCell,info.footprint,geometry)
  if(info.targetKind==='object'&&joint.targetPath.some(cell=>!inferRoomIdOnMap(cell,gs.getState().currentMapId,gs.getState())))toolkitError('PHYSICAL_OBJECT_ROOM_REQUIRED','The object needs a real room anchor throughout this path; no room or map is invented.')
  return {...info,...joint}
}
