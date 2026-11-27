import type { GameState } from '../lib/types'
import { inferRoomIdOnMap,getAdventureMap } from '../lib/adventure-map'
import { navigationActor,navigationGrid } from '../lib/navigation'
import { actorMovementStepCost } from '../lib/movement-modes'
import { carryingStateOf } from '../lib/carrying-state'
import { activePhysicalLoad } from '../lib/physical-handling-state'
import { actualLocomotionLocation,locomotionStateOf } from '../lib/locomotion-state'
import { entityVerticalContext } from '../lib/jumping-state'
import { actualNativeFlightLocation } from '../lib/native-flight-state'
import { swallowedBy } from '../lib/swallow-state'
import { chaseParticipant } from '../lib/chase-state'
import { carefulGroundPace } from '../lib/ground-gear-state'
import { activeAlarmWards } from '../lib/alarm-state'
import { pendingDoorAmbush } from '../lib/encounter-awareness'
import type { OverrunInput } from '../lib/dmg-overrun-state'
import * as gs from './game-state'
import { engineGeometry } from './navigation'
import { fail,effects,now,reactionAvailable,distance } from './hero-rules'
import { monsterSource } from './monster-rules'
import { opportunityAttackChoices,opportunityBoundary } from './opportunity-boundary'
import { heldGrappleTargets } from './grapple-transport'
import { prepareGroundGearStep,forecastGroundGearContact } from './ground-gear-contacts'
import { forecastOilGroundContact } from './oil-ground'
import { nativeFlightGroundMovementIssue } from './native-flight-opportunities'
import { assertWeatherMovement } from './weather-flight'
import { readDmgOverrunSource,readDmgTumbleSource } from './rules-library'

const same=(a:{x:number;y:number},b:{x:number;y:number})=>a.x===b.x&&a.y===b.y
const incapable=(conditions:readonly string[])=>conditions.some(c=>['incapacitated','unconscious','stunned','paralyzed','petrified'].includes(c))

/** A bounded source route, not a public occupancy override or a path planner.
 * Small and Medium both control one five-foot square (PHB2014 pp.191–192).
 * Its occupied middle is never an externally persisted stopping position. */
export function planOverrunRoute(input:OverrunInput){return planOccupiedCrossingRoute(input,'overrun')}
export function planTumbleRoute(input:OverrunInput){return planOccupiedCrossingRoute(input,'tumble')}
function planOccupiedCrossingRoute(input:OverrunInput,mode:'overrun'|'tumble'){
  if(mode==='overrun')readDmgOverrunSource();else readDmgTumbleSource()
  const problem=(suffix:string,message:string):never=>fail(`${mode==='overrun'?'OVERRUN':'TUMBLE'}_${suffix}`,message)
  const state=gs.getState(),mover=state.player,target=gs.getMonster(input.targetId),path=structuredClone(input.path)
  if(state.phase!=='combat'||state.currentTurn!=='player'||!state.initiativeOrder.includes('player'))problem('PLAYER_TURN_REQUIRED','Choose this actual player combat turn; no initiative or reaction movement is created.')
  if(!target||target.id==='player'||target.hp.current<=0||!target.isAlive||!state.initiativeOrder.includes(target.id)||target.hostile===false||target.group)
    problem('HOSTILE_BODY_REQUIRED','Select one actual living hostile enrolled body, not a group or a nonhostile occupant.')
  if(incapable(mover.conditions)||incapable(target!.conditions))problem('CAPABLE_CONTEST_REQUIRED','This first source tranche requires two bodies capable of the actual contested checks.')
  const fact=carryingStateOf(state)?.actors.player
  if(!fact||fact.entityId!=='player'||!['Small','Medium'].includes(fact.size))problem('MOVER_SIZE_REQUIRED','Use the actual existing set_carrying_context size qualification. This first crossing represents only actual Small/Medium five-foot spaces; class or image never supplies size.')
  const targetSize=String(monsterSource(target!)?.size??'')
  if(!['Small','Medium'].includes(targetSize))problem('SPACE_UNREPRESENTED','The defender requires a sourced Small/Medium five-foot space. Tiny subcells and larger multi-cell footprints remain unsupported before any die or cost.')
  const moverSize=fact!.size as 'Small'|'Medium',defenderSize=targetSize as 'Small'|'Medium'
  const [from,through,to]=path,dx=through.x-from.x,dy=through.y-from.y
  if(!same(mover.position,from)||!same(target!.position,through)||Math.abs(dx)+Math.abs(dy)!==1||to.x!==through.x+dx||to.y!==through.y+dy)
    problem('EXACT_ROUTE_REQUIRED','Choose the actual start, hostile square and free straight cardinal exit: exactly two five-foot steps, without an inferred detour.')
  const rooms=path.map(cell=>inferRoomIdOnMap(cell,state.currentMapId,state))
  if(!rooms[0]||rooms.some(room=>room!==rooms[0]))problem('ROOM_BOUNDARY_UNREPRESENTED','This first crossing stays within one actual existing room; no room/event/door arrival is chosen.')
  const room=getAdventureMap(state).rooms.find(room=>room.id===rooms[0])
  if(room?.navigationEvent&&!state.roomsVisited.includes(room.id))problem('EVENT_BOUNDARY_UNREPRESENTED','Resolve this actual unacknowledged room boundary before an occupied crossing; no event acknowledgement is invented.')
  if(activePhysicalLoad(state)||heldGrappleTargets(state,'player').length||['player',target!.id].some(id=>swallowedBy(state,id)||actualLocomotionLocation(state,id)))
    problem('PHYSICAL_CONTEXT_REQUIRED','Resolve real containment, held transport or climbing/swimming before this unpaired ground crossing.')
  const verticals=['player',target!.id].map(id=>entityVerticalContext(state,id))
  if(verticals.some(v=>!v.known||v.airborne||v.aboveSupportFeet!==0)||verticals[0].zFeet!==verticals[1].zFeet)
    problem('GROUND_PLANE_REQUIRED','Both actual bodies need known coplanar ground support; this source route never flattens flight, suspension or measured levels.')
  if(Object.values(locomotionStateOf(state)?.media??{}).some(m=>m.mode==='swim'&&m.mapId===state.currentMapId&&m.cells.some(cell=>path.some(p=>same(p,cell)))))
    problem('DRY_GROUND_REQUIRED','This first route does not resolve water, wading or underwater occupation.')
  if(chaseParticipant(state,'player'))problem('CHASE_ROUTE_UNREPRESENTED','The adopted chase has its own real distance/guard boundaries. This first occupied crossing cannot skip them.')
  const actor=navigationActor(state,'player'),grid=navigationGrid(state,'player',engineGeometry(),{ignoreOccupantIds:[target!.id]})
  if(!grid.step(from,through)||!grid.step(through,to)||!grid.free(to))problem('PATH_BLOCKED','Both chosen edges and the free exit must be physically legal after ignoring only the exact winning defender for transit.')
  const flight=nativeFlightGroundMovementIssue(state,'player',path);if(flight)fail(flight.code,flight.message)
  assertWeatherMovement('player',path,'walk',path)
  for(const effect of state.monsterEffects??[]){
    const source=gs.getEntity(effect.sourceId)
    if(effect.targetId==='player'&&effect.conditions.includes('frightened')&&source&&mover.conditions.includes('frightened')&&path.some(cell=>distance(cell,source.position)<distance(from,source.position)))
      fail('FRIGHTENED_APPROACH_FORBIDDEN','This exact voluntary route would move closer to the actual source of fear.')
  }
  const at=state.worldTimeSeconds??0
  if(state.hero?.effects.some(e=>e.expiresAt>at&&['readied-action','readied-spell','readied-movement'].includes(e.kind)))
    problem('READIED_WINDOW_UNREPRESENTED','An existing readied trigger has no represented occupied-cell window in this tranche. It is not interpreted from prose or silently skipped.')

  // Before choosing any contest die or action, prove that entry cannot stop or
  // hold the mover in the hostile square. Exit-side effects can use their real
  // existing procedures because that final square is free.
  const middle=gs.assertPhysicalDisplacementsInState(state,[{id:'player',cell:through,kind:'walk'}])
  gs.assertPhysicalDisplacementsInState(middle,[{id:'player',cell:to,kind:'walk'}])
  const departure=prepareGroundGearStep(state,'player','walk'),gear=forecastGroundGearContact(middle,'player','walk',departure)
  if(gear.placementIds.length||forecastOilGroundContact(middle,'player').damageNeeded)
    problem('OCCUPIED_CONTACT_UNREPRESENTED','A real contact/save/damage boundary would occur inside the occupied square. No first move, contest die or cost has committed.')
  if(pendingDoorAmbush(structuredClone(state))||pendingDoorAmbush(middle,through,from))problem('AMBUSH_BOUNDARY_UNREPRESENTED','The actual entry ambush cannot suspend this crossing inside another body’s space.')
  if(activeAlarmWards(state).some(ward=>ward.placement.mapId===state.currentMapId&&!ward.selection.exemptCreatureIds.includes('player')&&(ward.placement.kind==='ground_cube'?same(ward.placement.cell,through):ward.placement.sides.some(side=>same(side.cell,from))&&ward.placement.sides.some(side=>same(side.cell,through)))))
    problem('OCCUPIED_SIGNAL_UNREPRESENTED','Resolve or avoid the actual alarm-trigger boundary rather than inventing an intermediate response window inside the occupied square.')
  for(const guardian of state.hero?.effects??[]){
    const source=gs.getEntity(guardian.sourceId),cell=guardian.data.cell as{x:number;y:number}|undefined
    if(guardian.kind==='guardian-of-faith'&&guardian.expiresAt>at&&guardian.data.mapId===state.currentMapId&&source&&source.id!=='player'&&'hostile'in source&&source.hostile!==false&&cell&&Math.min(...[0,1].flatMap(x=>[0,1].map(y=>distance(through,{x:cell.x+x,y:cell.y+y}))))<=2)
      problem('OCCUPIED_GUARDIAN_UNREPRESENTED','A real guardian save/damage can stop the mover in the occupied square; this route refuses before the contest.')
  }
  if(!effects('disengage','player').length)for(const source of Object.values(state.monsters)){
    if(source.hp.current<=0||source.hostile===false||incapable(source.conditions)||!reactionAvailable(source.id))continue
    const choices=opportunityAttackChoices(source);if(!choices.length)continue
    const reach=Math.max(...choices.map(c=>c.reachCells)),near=Math.min(distance(source.position,through),distance(source.position,from),distance(source.position,to))<=reach
    const height=entityVerticalContext(state,source.id)
    if(near&&(!height.known||height.airborne||height.zFeet!==verticals[0].zFeet||actualNativeFlightLocation(state,source.id)?.airborne))
      problem('REACTOR_PLANE_UNREPRESENTED','A nearby actual reacting body needs an unrepresented spatial boundary for this occupied crossing; no three-dimensional reach is flattened.')
    const entry=opportunityBoundary(source,'player',from,through),exit=opportunityBoundary(source,'player',through,to)
    if((entry||exit)&&!state.initiativeOrder.includes(source.id))problem('REACTOR_NOT_ENROLLED','This actual reacting body must already belong to the real initiative; no participant or turn is enrolled implicitly.')
    if(exit)problem('OCCUPIED_REACTION_UNREPRESENTED','The second edge can provoke a real reaction while the mover is in the hostile square. Choose another route or an actual source prevention; current visibility is not guessed.')
  }
  const occupiedMinimum=actorMovementStepCost(state,'player',1,true).totalCells*(carefulGroundPace(state,'player')?2:1)
  const stepCosts:[number,number]=[Math.max(grid.stepCost(through,from),occupiedMinimum),grid.stepCost(to,through)]
  const totalCost=stepCosts[0]+stepCosts[1],remaining=Math.max(0,Math.floor(actor.speed/5)-gs.getMovementUsed('player'))
  if(totalCost>remaining)fail('MOVEMENT_EXCEEDED','The actual source crossing must fit both steps, including the hostile difficult square, before dice or cost. It cannot stop voluntarily inside.')
  return {path,stepCosts,totalCost,remaining,mapId:state.currentMapId!,roomId:rooms[0]!,baseFeet:[5,5],
    sizes:{mover:moverSize,target:defenderSize,advantage:mode==='overrun'&&moverSize==='Medium'&&defenderSize==='Small',disadvantage:mode==='overrun'&&moverSize==='Small'&&defenderSize==='Medium',playerFact:structuredClone(fact!) as unknown as Record<string,unknown>}}
}
