import type { AbilityCheckResult,GameState } from '../lib/types'
import type { ConfigureHiddenDoorInput,ResolveDoorDiscoveryInput,DoorDiscoveryState,HiddenDoorRecord } from '../lib/door-discovery-state'
import { doorCommand,doorDiscoveryKey } from '../lib/door-discovery-state'
import { hiddenDoorRecord } from '../lib/door-discovery'
import { firstMapId,getAdventureMap,inferRoomIdOnMap } from '../lib/adventure-map'
import { visualPerceptionAt } from '../lib/lighting'
import { assertToolkitPreparation,assertToolkitReach,toolkitState,toolkitError,toolkitResult } from './toolkit'
import { available,hero,now,alive } from './hero-rules'
import { checkedResolution } from './toolkit-checks'
import { resolvePassiveCheck } from './check-modes'
import { freeHands } from './equipment'
import * as gs from './game-state'
import * as rules from './rules'

const data=():DoorDiscoveryState=>toolkitState().doorDiscovery??={version:1,records:{},receipts:{}}
const mapId=()=>gs.getState().currentMapId??firstMapId(gs.getState())
const saved=()=>gs.getState().dmTools?.doorDiscovery
const own=<T>(records:Record<string,T>|undefined,key:string):T|undefined=>records&&Object.hasOwn(records,key)?records[key]:undefined
function eventUnused(eventId:string){
 if(Object.values(saved()?.records??{}).some(record=>record.creationEventId===eventId)||own(saved()?.receipts,eventId))
  toolkitError('DOOR_DISCOVERY_EVENT_CONFLICT','This eventId already records another immutable doorway preparation or attempt.')
}
export function configureHiddenDoor(input:ConfigureHiddenDoorInput){
 const old=hiddenDoorRecord(gs.getState(),input.doorId),command=doorCommand(input)
 if(old){if(old.creation!==command)toolkitError('HIDDEN_DOOR_DEFINITION_IMMUTABLE','This actual door already has another immutable hidden-door definition.');return{confidential:true,alreadyConfigured:true,record:old}}
 eventUnused(input.eventId);assertToolkitPreparation()
 const state=gs.getState(),map=getAdventureMap(state),door=map.doors?.find(door=>door.id===input.doorId)
 if(!door||door.opening||door.sides.some(side=>(map.rooms.find(room=>room.id===side.roomId)?.mapId??firstMapId(state))!==mapId()))
  toolkitError('HIDDEN_DOOR_EXISTING_PANEL_REQUIRED','Choose an actual authored door panel on this map; this never adds a doorway, room, exit or geometry.')
 const doorState=(state.sceneMemory?.doorStates as Record<string,string>|undefined)?.[input.doorId]??door!.initialState
 if(doorState!=='closed')toolkitError('HIDDEN_DOOR_CLOSED_SOURCE_REQUIRED','Establish this concealment only on an actual closed door before its discovery; no open/broken door or state is rewritten.')
 if(Object.keys(saved()?.records??{}).length>=256)toolkitError('HIDDEN_DOOR_LIMIT','256 retained prepared hidden doors reached; no original definition is evicted.')
 const record:HiddenDoorRecord={mapId:mapId(),doorId:input.doorId,createdAt:now(),creationEventId:input.eventId,creation:command,
  definition:structuredClone(input.definition),sides:door!.sides.map(({roomId,cell})=>({roomId,cell:{...cell}}))}
 data().records[doorDiscoveryKey(mapId(),input.doorId)]=record
 return{confidential:true,configured:true,record,notice:'MJ scene fact only. No discovery, opening, lock change, trap change, movement or player action.'}
}
export function inspectHiddenDoors(doorId?:string){
 return{confidential:true,records:Object.values(saved()?.records??{}).filter(record=>record.mapId===mapId()&&(!doorId||record.doorId===doorId)),
  source:'DMG2014 Secret Doors / Concealed Doors, supplied dmg-2014.md:4090-4102',
  notice:'Reference for the MJ only. Secret-door passive/search detects the door. Concealed-door passive notices only the prepared signs; the specified revealing step normally needs no check. Finding never opens/unlocks/disarms.'}
}
function location(input:ResolveDoorDiscoveryInput,record:HiddenDoorRecord){
 const state=gs.getState(),side=record.sides.find(side=>side.roomId===state.currentRoomId&&doorCommand(side.cell)===doorCommand(input.cell))
 if(record.mapId!==mapId()||!side||inferRoomIdOnMap(state.player.position,mapId(),state)!==side.roomId)toolkitError('DOOR_DISCOVERY_LOCATION_REQUIRED','Select the exact existing doorway location on this side of the current room/map; no remote room search is inferred.')
 const actor=gs.getPlayer()
 if(!alive(actor)||actor.deathSaves?.dead)toolkitError('DOOR_DISCOVERY_ACTOR_UNAVAILABLE','The actual player must be living and capable of this observation/search.')
 if(input.method!=='passive')assertToolkitReach({mapId:record.mapId,roomId:side!.roomId,cell:side!.cell})
 const visual=visualPerceptionAt(state,actor,input.cell)
 const needsSight=input.method!=='reveal'||record.definition.concealment?.operation==='look'
 if(needsSight&&!visual.canSee)toolkitError('DOOR_DISCOVERY_SIGHT_REQUIRED','This established visual doorway/sign/mechanism cannot be inspected from the actual position and sight conditions.')
 if(input.method!=='reveal'&&input.revealStepId!==undefined)toolkitError('DOOR_REVEAL_STEP_NOT_APPLICABLE','Only the actual concealed-door revealing step takes revealStepId.')
 return{side:side!,visual}
}
function finish(input:ResolveDoorDiscoveryInput,check?:AbilityCheckResult|Record<string,unknown>){
 const receipt=own(saved()?.receipts,input.eventId),record=hiddenDoorRecord(gs.getState(),input.doorId)
 if(!record||!receipt||receipt.status!=='pending'||receipt.command!==doorCommand(input))toolkitError('DOOR_DISCOVERY_CONTINUATION_MISMATCH','The original pending attempt and exact existing door must still match; no fresh check/action is substituted.')
 location(input,record!)
 if(input.method!=='passive')rules.validateActionUse('player')
 const succeeded=input.method==='reveal'||check?.success===true
 if(succeeded){
  const witness={eventId:input.eventId,at:receipt!.at}
  if(input.method==='investigate')record!.mechanismUnderstood??=witness
  else if(input.method==='passive'&&record!.definition.kind==='concealed')record!.signsNoticed??=witness
  else record!.discovered??=witness
 }
 if(input.method!=='passive'&&gs.getState().phase==='combat')rules.recordAction('player')
 const found=succeeded&&!(input.method==='passive'&&record!.definition.kind==='concealed')&&input.method!=='investigate'
 const result={confidential:true,eventId:input.eventId,doorId:input.doorId,mapId:record!.mapId,method:input.method,at:receipt!.at,
  success:succeeded,discovered:Boolean(record!.discovered),clueNoticed:Boolean(record!.signsNoticed),
  mechanismKnown:Boolean(record!.discovered&&(!record!.definition.mechanism||record!.mechanismUnderstood)),
  actionSpent:input.method!=='passive'&&gs.getState().phase==='combat',check,
  playerResult:found?'Une porte est repérée à l’endroit examiné.':succeeded&&input.method==='investigate'?'Le fonctionnement du mécanisme est compris.':succeeded?'Des traces sont remarquées ; elles ne révèlent pas encore de porte.':'Cette tentative ne révèle rien de nouveau.',
  ...(succeeded&&input.method==='passive'&&record!.definition.kind==='concealed'?{noticedSigns:record!.definition.signs!.description}:{}),
  ...(succeeded&&input.method==='investigate'?{openingInstruction:record!.definition.mechanism!.instruction}:{}),
  doorStateUnchanged:true,locksUnchanged:true,trapsUnchanged:true}
 receipt!.status='resolved';receipt!.result=result;delete receipt!.anchor
 return toolkitResult(result)
}
export function finishDoorDiscovery(command:Record<string,unknown>,checked:AbilityCheckResult){
 const receipt=own(saved()?.receipts,String(command.eventId))
 if(!receipt)toolkitError('DOOR_DISCOVERY_CONTINUATION_MISMATCH','The held doorway attempt no longer exists.')
 return finish(JSON.parse(receipt!.command) as ResolveDoorDiscoveryInput,checked)
}
export function resolveDoorDiscovery(input:ResolveDoorDiscoveryInput){
 const old=own(saved()?.receipts,input.eventId)
 if(old){
  if(old.command!==doorCommand(input))toolkitError('DOOR_DISCOVERY_EVENT_CONFLICT','This immutable attempt event has different arguments.')
  if(old.status==='resolved')return toolkitResult({...old.result,replayed:true})
  const pending=hero()?.pending,resolution=pending?.command.toolkitResolution as {domain?:string;command?:Record<string,unknown>}|undefined
  if(resolution?.domain==='door-discovery'&&resolution.command?.eventId===input.eventId)return toolkitResult({confidential:true,alreadyPending:true,pendingReaction:pending})
  toolkitError('DOOR_DISCOVERY_PENDING_MISSING','The pending doorway attempt has no matching held original roll.')
 }
 eventUnused(input.eventId);available()
 const record=hiddenDoorRecord(gs.getState(),input.doorId)
 if(!record)toolkitError('HIDDEN_DOOR_SOURCE_REQUIRED','This resolver requires an actual previously established hidden-door source; a player description or generic check creates none.')
 const {visual}=location(input,record!)
 if(input.method==='investigate'&&(!record!.discovered||!record!.definition.mechanism))toolkitError('DOOR_MECHANISM_SOURCE_REQUIRED','First detect this actual door; an additional Investigation check exists only for its explicitly prepared non-obvious mechanism and DC.')
 if(input.method==='search'&&record!.definition.kind!=='secret')toolkitError('CONCEALED_DOOR_REVEAL_STEP_REQUIRED','A concealed door normally needs the actual specified revealing step, without an invented ability DC.')
 if(input.method==='reveal'&&(record!.definition.kind!=='concealed'||record!.definition.concealment?.stepId!==input.revealStepId))toolkitError('DOOR_REVEAL_STEP_REQUIRED','Choose the actual established concealed-door revealing step, not an inferred manipulation.')
 if(input.method==='reveal'&&record!.definition.concealment!.operation==='move_cover'&&freeHands()<1)toolkitError('DOOR_COVER_FREE_HAND_REQUIRED','Free an actual hand before moving the established mundane cover.')
 if(input.method==='passive'&&record!.definition.kind==='concealed'&&!record!.definition.signs)toolkitError('DOOR_PASSIVE_SIGNS_SOURCE_REQUIRED','No tracks/disturbed-cover clue or DC has been established here; none is invented.')
 if(input.method!=='passive')rules.validateActionUse('player')
 if(Object.keys(saved()?.receipts??{}).length>=512)toolkitError('DOOR_DISCOVERY_RECEIPT_LIMIT','512 retained attempts reached; no original result is discarded and no die/action is spent.')
 const state=gs.getState()
 data().receipts[input.eventId]={command:doorCommand(input),mapId:record!.mapId,doorId:record!.doorId,at:now(),status:'pending',
  ...(input.method==='search'||input.method==='investigate'?{anchor:{mapId:mapId(),roomId:state.currentRoomId!,position:{...state.player.position},phase:state.phase,
   turnCounter:state.turnCounter??0,currentTurn:state.currentTurn,actionCredits:state.hero?.actionCredits,actionUsed:Boolean(state.actionUsed.player)}}:{})}
 if(input.method==='reveal')return finish(input)
 const dc=input.method==='investigate'?record!.definition.mechanism!.investigationDc:record!.definition.kind==='secret'?record!.definition.detectionDc!:record!.definition.signs!.dc
 if(input.method==='passive')return finish(input,resolvePassiveCheck({entityId:'player',ability:'wis',skill:'perception',perceptionSense:'sight',dc,sightBased:true,targetCell:input.cell},{allowCombat:true}))
 return checkedResolution({entityId:'player',ability:input.method==='investigate'?'int':'wis',skill:input.method==='investigate'?'investigation':'perception',dc,
  sightBased:true,...(input.method==='search'?{perceptionSense:'sight' as const}:{}),disadvantage:input.method==='search'&&visual.visualDisadvantage,
  ...(input.method==='search'&&visual.visualDisadvantage?{advantageReason:'Perception visuelle de cette porte dans une lumière faible effective.'}:{}),
  label:input.method==='investigate'?'Comprendre le mécanisme de la porte détectée':'Chercher à cet emplacement précis'},
  {domain:'door-discovery',command:{eventId:input.eventId}})
}
