import { randomUUID } from 'node:crypto'
import type { GameState } from '../lib/types'
import { entityGroundContact,entityVerticalContext } from '../lib/jumping-state'
import { isStatBackedNpc } from '../lib/npc-stat-blocks'
import { carefulGroundPace,groundGearStoppedThisTurn,groundGearTurnKey,pendingGroundGearContacts,type GroundGearContact } from '../lib/ground-gear-state'
import { groundGearState } from './ground-gear'
import { toolkitError } from './toolkit'
import type { PhysicalContinuation } from './movement-continuation'
import * as gs from './game-state'
import { sameIceCell, slipperyIceAtBody, validShoveAsideIceStep } from '../lib/slippery-ice-state'
import { forecastOilGroundContact } from './oil-ground'
import { activeRazorvineObjects, sameRazorvineCell, sceneObjectFootprint } from '../lib/razorvine-state'
import { recordAlarmMovement } from './alarm-spell'
export type GroundGearMovementKind='walk'|'forced'|'landing'|'teleport'|'arrival'
export interface GroundGearStepWitness{entityId:string;mapId:string;fromCell:{x:number;y:number};fromZFeet:number|null;fromPlacementIds:string[];slipperyIceWalk?:true;slipperyIceShoveAside?:true;shoveAsideId?:string}
const actor=(state:GameState,id:string)=>id==='player'?state.player:state.monsters[id]??state.npcs?.[id]
const alive=(state:GameState,id:string)=>{const body=actor(state,id);return Boolean(body&&(id==='player'?!state.player.deathSaves?.dead:!('isAlive'in body)||body.isAlive!==false))}
export const activeGroundGearPlacements=(state:GameState)=>Object.values(state.dmTools?.groundGear?.placements??{}).filter(value=>value.mapId===state.currentMapId&&value.unitsRemaining>0&&(value.kind==='hunting_trap'?value.status==='armed':value.status==='laid'))
const placed=activeGroundGearPlacements
export function currentGroundGearContacts(state:GameState,entityId:string){
 const body=actor(state,entityId),placementIds:string[]=[],unknownPlacementIds:string[]=[]
 if(!body||!alive(state,entityId))return{placementIds,unknownPlacementIds}
 for(const value of placed(state))for(const cell of value.cells){const contact=entityGroundContact(state,entityId,cell,value.surfaceZFeet);if(contact.contact===true)placementIds.push(value.id);else if(contact.contact===null)unknownPlacementIds.push(value.id)}
 return{placementIds:[...new Set(placementIds)],unknownPlacementIds:[...new Set(unknownPlacementIds)]}
}
export function prepareGroundGearStep(state:GameState,entityId:string,_kind:GroundGearMovementKind,slipperyIceWalk=false,shoveAside?:{attemptId?:string}):GroundGearStepWitness|undefined{
 const body=actor(state,entityId),context=entityVerticalContext(state,entityId)
 if(!body||!state.currentMapId)return undefined
 return{entityId,mapId:state.currentMapId,fromCell:{...body.position},fromZFeet:context.known?context.zFeet:null,
  ...slipperyIceWalk?{slipperyIceWalk:true}:{},
  ...shoveAside?{slipperyIceShoveAside:true,...shoveAside.attemptId?{shoveAsideId:shoveAside.attemptId}:{}}:{},
  fromPlacementIds:placed(state).filter(value=>value.cells.some(cell=>entityGroundContact(state,entityId,cell,value.surfaceZFeet).contact===true)).map(value=>value.id)}
}
function contactsFor(state:GameState,entityId:string,kind:GroundGearMovementKind,from?:GroundGearStepWitness){
 const body=actor(state,entityId);if(!body||!alive(state,entityId))return{placementIds:[] as string[]}
 const inside=state.dmTools?.groundGear?.traversals[entityId]??[],ids:string[]=[]
 for(const value of placed(state)){
  const destination=value.cells.find(cell=>cell.x===body.position.x&&cell.y===body.position.y)
  const contact=destination?entityGroundContact(state,entityId,destination,value.surfaceZFeet):undefined
  if(contact?.contact===null)return{placementIds:ids,issue:{code:'GROUND_GEAR_CONTACT_HEIGHT_REQUIRED',message:'Resolve the real support/contact of this body and ground device before movement; no XY-only hit or immunity is inferred.'}}
  const atDestination=contact?.contact===true,fromBearing=Boolean(kind!=='teleport'&&kind!=='arrival'&&value.kind==='ball_bearings'&&from&&from.mapId===state.currentMapId&&from.fromPlacementIds.includes(value.id))
  if(!atDestination&&!fromBearing)continue
  if((value.kind==='ball_bearings'||value.kind==='caltrops')&&kind==='walk'&&carefulGroundPace(state,entityId))continue
  if(value.kind==='ball_bearings'&&(kind==='teleport'||kind==='arrival'))continue
  if(value.kind!=='hunting_trap'&&kind!=='landing'&&kind!=='teleport'&&inside.includes(value.id))continue
  if(value.kind!=='ball_bearings'&&!atDestination)continue
  ids.push(value.id)
 }
 return{placementIds:ids}
}
/** Same contact/traversal forecast used by the actual commit, without a UUID,
 * mutation, target choice or invented physical step. */
export function forecastGroundGearContact(state:GameState,entityId:string,kind:GroundGearMovementKind,from?:GroundGearStepWitness){
 const found=contactsFor(state,entityId,kind,from)
 const nextTraversalIds=alive(state,entityId)?placed(state).filter(value=>value.kind!=='hunting_trap'&&!((kind==='teleport'||kind==='arrival')&&value.kind==='ball_bearings')
  &&value.cells.some(cell=>entityGroundContact(state,entityId,cell,value.surfaceZFeet).contact===true)).map(value=>value.id):[...(state.dmTools?.groundGear?.traversals[entityId]??[])]
 return{...found,nextTraversalIds}
}
function iceEntryFor(state:GameState,entityId:string,kind:GroundGearMovementKind,from?:GroundGearStepWitness){
 if(!alive(state,entityId))return {}
 const body=actor(state,entityId)!,ice=slipperyIceAtBody(state,entityId,body.position)
 if(!ice)return {}
 if(ice.unknown)return {issue:{code:'SLIPPERY_ICE_SUPPORT_REQUIRED',message:'Resolve the real height and support before this movement; projected XY is not ice contact.'}}
 const zone=ice.zone
 if(from&&from.mapId===state.currentMapId&&sameIceCell(from.fromCell,body.position)&&from.fromZFeet===zone.elevationFeet)return {}
 const forcedAside=kind==='forced'&&from?.slipperyIceShoveAside===true
 if((kind==='walk'||forcedAside)&&(state.phase!=='combat'||!state.initiativeOrder.includes(entityId)))
  return {issue:{code:'SLIPPERY_ICE_TURNS_REQUIRED',message:'Real steps onto this measured ice need active initiative with the affected body. Prepare the actual hazard before moving.'}}
 if(!(kind==='walk'&&from?.slipperyIceWalk||forcedAside&&state.currentTurn==='player'&&entityId!=='player'
   &&(from!.shoveAsideId?validShoveAsideIceStep(state,entityId,body.position,from!):Math.abs(from!.fromCell.x-body.position.x)+Math.abs(from!.fromCell.y-body.position.y)===1))
  ||!from||from.entityId!==entityId||from.mapId!==state.currentMapId||from.fromZFeet!==zone.elevationFeet
  ||Math.max(Math.abs(from.fromCell.x-body.position.x),Math.abs(from.fromCell.y-body.position.y))!==1)
  return {issue:{code:'SLIPPERY_ICE_ENTRY_UNREPRESENTED',message:'This first ice slice requires an exact ordinary unpaired move_token step. A forced, magical, landing, readied or batched entry cannot pay or commit its displacement.'}}
 if(Object.values(state.dmTools?.groundGear?.contacts??{}).some(contact=>contact.slipperyIceEntry&&contact.entityId===entityId&&contact.turnKey===groundGearTurnKey(state)))return {}
 return {entry:{zoneId:zone.input.zoneId}}
}
/** Pure forecast on C's actual projected body/support state. A trap chain is a
 * geometric restraint, never an invented restrained condition or speed0. */
export function groundGearMovementIssue(state:GameState,entityId:string,kind:GroundGearMovementKind,from?:GroundGearStepWitness){
 if(pendingGroundGearContacts(state).length)return{code:'GROUND_GEAR_CONTACT_DUE',message:'Resolve the actual stopped gear contact before another movement or position mutation.'}
 if(kind==='walk'&&groundGearStoppedThisTurn(state,entityId))return{code:'CALTROPS_MOVEMENT_STOPPED',message:'The actual failed caltrops save stopped voluntary movement for this real global turn; an extra action does not reset it.'}
 const body=actor(state,entityId)
 if(body){
  const hedge=activeRazorvineObjects(state).find(value=>sceneObjectFootprint(value).some(cell=>sameRazorvineCell(cell,body.position)))
  if(hedge){const vertical=entityVerticalContext(state,entityId)
   if(!vertical.known||vertical.zFeet!<hedge.razorvine!.baseZFeet+10)return{code:'RAZORVINE_VOLUME_BLOCKED',message:'This actual destination is inside the rooted thorn footprint or lacks proven vertical clearance; no traversal or contact is granted.'}}
 }
 if(body&&kind!=='teleport')for(const trap of Object.values(state.dmTools?.groundGear?.placements??{}).filter(value=>value.kind==='hunting_trap'&&value.victimId===entityId&&value.status==='sprung')){
  const anchor=trap.anchor,object=anchor?state.dmTools?.objects[anchor.objectId]:undefined
  if(!anchor||!object||object.state==='destroyed'||object.mapId!==trap.mapId||object.cell.x!==anchor.cell.x||object.cell.y!==anchor.cell.y)
   return{code:'HUNTING_TRAP_ANCHOR_CHANGED',message:'The actual immobile anchor has changed. Resolve the real attachment/body outcome explicitly; no intact chain or automatic freedom is invented.'}
  const vertical=entityVerticalContext(state,entityId)
  if(state.currentMapId!==trap.mapId||!vertical.known)return{code:'HUNTING_TRAP_CHAIN_GEOMETRY_REQUIRED',message:'This actual attached chain needs its real map/support context before translating the body; no unsupported teleport or height is flattened.'}
  if(Math.hypot((body.position.x-anchor.cell.x)*5,(body.position.y-anchor.cell.y)*5,vertical.zFeet!-(anchor.zFeet??trap.surfaceZFeet))>anchor.chainLengthFeet)
   return{code:'HUNTING_TRAP_CHAIN_LIMIT',message:'This real destination exceeds the actual anchored chain length. Free the body by its source procedure before this movement.'}
 }
 const ice=iceEntryFor(state,entityId,kind,from);if(ice.issue)return ice.issue
 const contact=contactsFor(state,entityId,kind,from);if(contact.issue)return contact.issue
 if(ice.entry&&(contact.placementIds.length||forecastOilGroundContact(state,entityId).damageNeeded))return{code:'SLIPPERY_ICE_SIMULTANEOUS_CONTACT_UNREPRESENTED',message:'This step would touch actual gear or burning oil and require the first ice check at once. No relative resolution order or paid entry is invented.'}
 if(!contact.placementIds.length&&!ice.entry)return null
 if(entityId!=='player'&&!state.monsters[entityId]&&!isStatBackedNpc(state.npcs?.[entityId]))return{code:'GROUND_GEAR_BODY_PROFILE_REQUIRED',message:'The actually contacting body needs its real published profile before source DEX/STR or damage; no generic statistic or HP is invented.'}
 if(contact.placementIds.length>32)return{code:'GROUND_GEAR_SIMULTANEOUS_LIMIT',message:'More than32actual devices share this same contact; resolve the physical overlap before movement, choices, dice or costs.'}
 if(contact.placementIds.some(id=>state.dmTools!.groundGear!.placements[id].kind==='caltrops')&&(state.phase!=='combat'||!state.initiativeOrder.includes(entityId)))
  return{code:'GROUND_GEAR_TURNS_REQUIRED',message:'This possible caltrops entry can stop movement for a real turn. Explicitly prepare initiative with the actual affected actors and real hazard before contact; no enemy or tick is invented.'}
 if(Object.keys(state.dmTools?.groundGear?.contacts??{}).length>=512)return{code:'GROUND_GEAR_CONTACT_LIMIT',message:'Retained real gear-contact events are full before movement, dice or action costs.'}
 return null
}
export function groundGearMovementGroupIssue(state:GameState,steps:readonly{entityId:string;kind:GroundGearMovementKind;from?:GroundGearStepWitness}[]){
 for(const step of steps){const issue=groundGearMovementIssue(state,step.entityId,step.kind,step.from);if(issue)return issue}
 const needed=steps.filter(step=>contactsFor(state,step.entityId,step.kind,step.from).placementIds.length>0||iceEntryFor(state,step.entityId,step.kind,step.from).entry).length
 return Object.keys(state.dmTools?.groundGear?.contacts??{}).length+needed>512?{code:'GROUND_GEAR_CONTACT_LIMIT',message:'This whole real paired movement exceeds retained contact capacity; no first body or position has committed.'}:null
}
/** Only called AFTER an actual committed step/contact. It does not roll,
 * choose an effect order, move a body or manufacture an MCP invocation. */
export function recordGroundGearContact(entityId:string,kind:GroundGearMovementKind,from?:GroundGearStepWitness){
 const state=gs.getState(),body=actor(state,entityId);if(!body)return undefined
 const vertical=entityVerticalContext(state,entityId)
 for(const trap of Object.values(state.dmTools?.groundGear?.placements??{}).filter(value=>value.kind==='hunting_trap'&&value.victimId===entityId&&value.status==='sprung')){
  if(kind==='teleport'&&from&&(from.mapId!==state.currentMapId||from.fromCell.x!==body.position.x||from.fromCell.y!==body.position.y||vertical.known&&from.fromZFeet!==vertical.zFeet)){
   delete trap.victimId
   gs.addLogEntry({round:state.round,turn:entityId,action:'Téléportation hors du piège externe',mechanicalDetail:`Le corps réellement téléporté quitte ${trap.id}, qui reste fermé à sa vraie position ; aucun piège/chaîne n’est transporté ni ouvert. Adjudication explicite du moteur.`})
  }else if(kind!=='teleport'){
   if(trap.anchor&&trap.anchor.zFeet===undefined)trap.anchor.zFeet=trap.surfaceZFeet
   trap.cells=[{...body.position}];if(vertical.known)trap.surfaceZFeet=vertical.zFeet!
  }
 }
 if(!alive(state,entityId))return undefined
 const found=forecastGroundGearContact(state,entityId,kind,from);if(found.issue)toolkitError(found.issue.code,found.issue.message)
 const forecastIce=iceEntryFor(state,entityId,kind,from)
 if(forecastIce.issue)toolkitError(forecastIce.issue.code,forecastIce.issue.message)
 const ice=forecastIce.entry
 if(ice&&kind==='forced'&&(!from?.shoveAsideId||!validShoveAsideIceStep(state,entityId,body.position,from)))
  toolkitError('SLIPPERY_ICE_FORCED_SOURCE_REQUIRED','Only the actual committed Shove Aside can create a forced ice entry; a projection cannot manufacture one.')
 if((found.placementIds.length||ice)&&Object.keys(state.dmTools?.groundGear?.contacts??{}).length>=512)toolkitError('GROUND_GEAR_CONTACT_LIMIT','Preflight the actual whole movement before the retained contact limit.')
 recordAlarmMovement(entityId,kind,from)
 const inside=found.nextTraversalIds
 if(!found.placementIds.length&&!ice){if(state.dmTools?.groundGear)state.dmTools.groundGear.traversals[entityId]=inside;return undefined}
 const id=randomUUID(),contact:GroundGearContact={id,entityId,mapId:state.currentMapId!,cell:{...body.position},at:state.worldTimeSeconds??0,turnKey:groundGearTurnKey(state),placementIds:found.placementIds,...ice?{slipperyIceEntry:ice}:{},kind,status:'waiting',cursor:0,results:[],stopMovement:false,...from?{stepWitness:ice?structuredClone(from):{entityId:from.entityId,mapId:from.mapId,fromCell:{...from.fromCell},fromZFeet:from.fromZFeet,fromPlacementIds:[...from.fromPlacementIds]}}:{}}
 const data=groundGearState();data.traversals[entityId]=inside;data.contacts[id]=contact;return contact
}
export function bindGroundGearContinuation(contactIds:readonly string[],command:PhysicalContinuation){
 const data=gs.getState().dmTools?.groundGear;if(!data||!contactIds.length)return
 const groupId=randomUUID()
 for(const id of contactIds){const contact=data.contacts[id];if(!contact||contact.status==='resolved')toolkitError('GROUND_GEAR_CONTACT_REQUIRED','Bind only the actual unresolved contact produced by this same committed movement.');contact.continuation={...structuredClone(command),groundGearGroupId:groupId,groundGearContactIds:[...contactIds]}}
}
