import { cleavingActionIssue } from '../lib/cleaving-state'
import { RuleViolation as CleavingRuleViolation } from './rules'
import { alarmPingCount, alarmPingsSince } from '../lib/alarm-state'
import { groundGearTurnKey, pendingGroundGearContacts } from '../lib/ground-gear-state'
import { slipperyIceAtBody } from '../lib/slippery-ice-state'
import { activeChaseGuard,chaseActionIssue,chaseParticipant } from '../lib/chase-state'
import { preflightChaseRoute,noteChaseActualStep } from './chase-guard'
import { activeXgeFall,xgeFallingTurnIssue } from '../lib/xge-falling-state'
import { nativeFlightGroundMovementIssue } from './native-flight-opportunities'
import { bindGroundGearContinuation } from './ground-gear-contacts'
import { jumpingDueIssue } from '../lib/jumping-state'
import { recordActualFootsteps,clearActualFootwork } from './vertical-observations'
import { assertSurvivalEventsResolved } from './survival'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { getAdventureMap, getMapSpec, inferRoomIdOnMap } from '../lib/adventure-map'
import { GeometrySchema, geometryMetadata } from '../lib/battlemap-geometry'
import { isDiagonalStep, findNavigationPath, navigationActor, navigationGrid, navigationPathCost, navigationDiagonalsUsed, NavigationError, type NavigationGoal, type NavigationMovementMode } from '../lib/navigation'
import * as gs from './game-state'
import { beforeHeroStep,afterHeroStep } from './hero-movement'
import { RuleViolation,assertWeatherEventsResolved as rulesAssertWeatherEventsResolved } from './rules'
import { encounterAwareness, pendingDoorAmbush } from '../lib/encounter-awareness'
import { assertAfflictionEvents,assertAfflictionTurnOpen } from './afflictions'
import { heldGrappleTargets, inspectGrappleTransport, planGrappleTransportPath, type GrappleTransportInput } from './grapple-transport'
import { assertSurpriseCanAct } from './surprise'
import { activePhysicalLoad,physicalHandlingStateOf } from '../lib/physical-handling-state'
import { inspectPhysicalTransport,planPhysicalTransportPath } from './physical-handling'
import { carryingStateOf } from '../lib/carrying-state'
import { castingDueIssue } from '../lib/casting-state'
import { assertWeatherMovement,noteWeatherFlightMovement } from './weather-flight'

export function engineGeometry() {
  const state = gs.getState(), data = getAdventureMap(state), map = getMapSpec(state.currentMapId, state)
  if (!map.geometry) return undefined
  const geometry = GeometrySchema.parse(map.geometry)
  if ('kind' in geometry.source && geometry.source.kind === 'procedural') return geometry
  if (!('image' in geometry.source)) throw new RuleViolation('GEOMETRY_STALE', 'Unsupported geometry source.', {})
  const hash = (input: string | Buffer) => createHash('sha256').update(input).digest('hex')
  let imageHash: string
  try { imageHash = hash(readFileSync(resolve(process.cwd(), 'public', geometry.source.image.replace(/^\//, '')))) }
  catch { throw new RuleViolation('GEOMETRY_STALE', 'Geometry image is unavailable.', {}) }
  if (imageHash !== geometry.source.sha256 || hash(geometryMetadata(data, map.id)) !== geometry.source.metadataSha256
    || geometry.mapId !== map.id || JSON.stringify(geometry.grid) !== JSON.stringify(map.grid))
    throw new RuleViolation('GEOMETRY_STALE', 'Re-extract or review geometry after image/metadata changes.', {})
  if (geometry.review !== 'approved') throw new RuleViolation('GEOMETRY_UNREVIEWED', 'Review the extracted geometry before using it mechanically.', {})
  return geometry
}

export interface SlipperyIceWalk { retainedPath?: import('../lib/adventure-map').GridCell[] }

export function planNavigation(actorId: string, goal: NavigationGoal, allowPartial = false, acknowledgeEventIds: string[] = [], reactionMovement = false, transport?: GrappleTransportInput, movementMode: NavigationMovementMode = 'walk', iceWalk?: SlipperyIceWalk) {
  try {
    const ending=xgeFallingTurnIssue(gs.getState());if(ending)throw new RuleViolation(ending.code,ending.message,{})
    if(activeXgeFall(gs.getState(),actorId))throw new RuleViolation('XGE_FALL_RECOVERY_REQUIRED','This actual source fall owns its vertical position; no ground route or reaction movement pays costs before a real source recovery.',{})
    if(pendingGroundGearContacts(gs.getState()).length)throw new RuleViolation('GROUND_GEAR_CONTACT_DUE','Resolve the actual contact before a new movement plan, stealth die or position mutation.',{})
    const jumpIssue=jumpingDueIssue(gs.getState());if(jumpIssue)throw new RuleViolation(jumpIssue.code,jumpIssue.message,{})
    assertSurpriseCanAct(actorId)
    assertSurvivalEventsResolved()
    rulesAssertWeatherEventsResolved()
    assertAfflictionEvents();assertAfflictionTurnOpen(actorId)
    if(chaseParticipant(gs.getState(),actorId)&&movementMode!=='walk')throw new RuleViolation('CHASE_MOVEMENT_MODE_UNREPRESENTED','This adopted first chase uses actual ground walking; stop explicitly before a different movement mode, without cost or position inferred.',{})
    const chaseIssue=chaseActionIssue(gs.getState());if(chaseIssue)throw new RuleViolation(chaseIssue.code,chaseIssue.message,{})
    if(gs.getState().hero?.pending)throw new RuleViolation('REACTION_PENDING','Resolve the held reaction before moving.',{})
    if (movementMode === 'fly' && (reactionMovement || transport)) throw new RuleViolation('HOVER_FLIGHT_COMBINATION_UNSUPPORTED', 'Readied flight and paired grapple flight have no modeled contract; no cost was spent.', {})
    const state = gs.getState(), actor = navigationActor(state, actorId, movementMode)
    if (actor.speed <= 0) throw new RuleViolation('ACTOR_IMMOBILE', 'The actor effective movement speed is zero; no voluntary movement is available.', { actorId })
    const geometry = engineGeometry()
    if ((actorId === 'player' || transport?.targetId === 'player') && pendingDoorAmbush(state))
      throw new RuleViolation('AMBUSH_RESOLUTION_REQUIRED', 'Resolve the prepared doorway ambush with start_encounter and explicit ambush arguments before moving farther.', {})
    if (state.phase === 'combat' && (!reactionMovement && state.currentTurn !== actorId || !state.initiativeOrder.includes(actorId)))
      throw new RuleViolation('NOT_CURRENT_TURN', 'Movement must occur on the actor turn.', {})
    const readiedBudget = reactionMovement ? state.hero?.effects.find(effect => effect.kind === 'readied-movement' && effect.targetIds.includes(actorId) && effect.expiresAt > (state.worldTimeSeconds ?? 0)) : undefined
    if (reactionMovement && !readiedBudget) throw new RuleViolation('READIED_MOVEMENT_REQUIRED', 'A private readied movement budget is required.', {})
    const physical=transport?.loadId?{loadId:transport.loadId,targetId:transport.targetId,targetToCell:transport.targetToCell}:undefined
    if(transport&&!physical&&carryingStateOf(state)?.actors[actorId]?.tracking)
      throw new RuleViolation('PHYSICAL_TRANSPORT_REQUIRED','Tracked physical carrying needs an explicit carry/drag mode and measured whole payload: begin_handling_load with the actual source grapple, then move_handled_load.',{})
    const transportInfo = physical?inspectPhysicalTransport(actorId,physical):transport ? inspectGrappleTransport(state, actorId, transport.targetId) : undefined
    const speed = transportInfo?.speed ?? actor.speed
    if (speed <= 0) throw new RuleViolation('ACTOR_IMMOBILE', 'No movement remains at the effective transport speed.', {})
    if (transport && reactionMovement) throw new RuleViolation('READIED_GRAPPLE_TRANSPORT_UNSUPPORTED', 'Readied movement does not contain a declared paired transport.', {})
    const remaining = state.phase === 'combat' ? reactionMovement ? Number(readiedBudget!.data.remainingCells)
      : Math.max(0, Math.floor(speed / 5) - gs.getMovementUsed(actorId)) : null
    let targetPath: import('../lib/adventure-map').GridCell[] | undefined
    let path, stopReason = 'goal_reached', stopDoorId: string | undefined
    let stopEvent: { id: string; label: string; roomId: string } | undefined
    try {
      if (transport) {
        if (goal.kind !== 'cell') throw new RuleViolation('GRAPPLE_TRANSPORT_DESTINATION', 'Paired transport requires two explicit final cells.', {})
        const joint = physical?planPhysicalTransportPath(actorId,goal.cell,physical,geometry):planGrappleTransportPath(state, actorId, goal.cell, transport, geometry)
        path = joint.path; targetPath = joint.targetPath
      } else path = findNavigationPath(state, actorId, goal, { geometry, movementMode })
    }
    catch (err) {
      // Plan through closed thresholds solely to select the earliest decision point.
      // Never mutate a door or substitute a different goal.
      if (transport || !(err instanceof NavigationError) || err.code !== 'NO_PATH' || goal.kind === 'door') throw err
      const hypothetical = findNavigationPath(state, actorId, goal, { geometry, ignoreClosed: true, movementMode })
      const grid = navigationGrid(state, actorId, geometry, { movementMode })
      const stop = hypothetical.findIndex((cell, i) => i > 0 && !grid.step(hypothetical[i-1], cell))
      if (stop < 1) throw err
      path = hypothetical.slice(0, stop)
      stopReason = 'closed_door'
      const a = hypothetical[stop-1], b = hypothetical[stop]
      stopDoorId = getAdventureMap(state).doors?.find(d => d.sides.some(s => s.cell.x === a.x && s.cell.y === a.y)
        && d.sides.some(s => s.cell.x === b.x && s.cell.y === b.y))?.id
    }
    // Authored decision boundaries do not execute room events or encounters.
    const data = getAdventureMap(state)
    const eventIndex = path.findIndex((cell, i) => {
      if (i === 0) return false
      const bodies = [cell, ...(transport?.targetId === 'player' && targetPath ? [targetPath[i]] : [])]
      for (const body of bodies) {
        const room = data.rooms.find(r => r.id === inferRoomIdOnMap(body, state.currentMapId, state))
        if (!room?.navigationEvent || state.roomsVisited.includes(room.id) || acknowledgeEventIds.includes(room.navigationEvent.id)) continue
        stopEvent = { ...room.navigationEvent, roomId: room.id }
        return true
      }
      return false
    })
    if (eventIndex > 0) { path = path.slice(0, eventIndex); targetPath = targetPath?.slice(0, eventIndex); stopReason = 'event_decision'; stopDoorId = undefined }
    const plannedCostCells = navigationPathCost(state, path, actorId, movementMode)
    if(plannedCostCells>0&&activePhysicalLoad(state)&&!physical)
      throw new RuleViolation('PHYSICAL_TRANSPORT_REQUIRED','Choose move_handled_load with its exact held ID and both final cells, or explicitly release it; ordinary movement cannot leave a held load behind.',{})
    if (plannedCostCells > 0 && !transport && heldGrappleTargets(state, actorId).length)
      throw new RuleViolation('GRAPPLE_TRANSPORT_REQUIRED', 'Choose move_grappled_creature with the exact held target and both final cells, or release the grapple explicitly.', {})
    if (remaining !== null && plannedCostCells > remaining) {
      if (!allowPartial) throw new RuleViolation('MOVEMENT_EXCEEDED', 'The legal path exceeds remaining movement; no mutation.', { costCells: plannedCostCells, remaining })
      let end = 1
      while (end < path.length && navigationPathCost(state, path.slice(0, end + 1), actorId, movementMode) <= remaining) end++
      path = path.slice(0, end); targetPath = targetPath?.slice(0, end); stopReason = 'movement_budget'
      stopDoorId = undefined; stopEvent = undefined
    }
    const retainedPath=iceWalk?.retainedPath
    if(retainedPath&&(path.length>retainedPath.length||path.some((cell,index)=>cell.x!==retainedPath[index].x||cell.y!==retainedPath[index].y)))
      throw new RuleViolation('SLIPPERY_ICE_RETAINED_ROUTE_CHANGED','The remaining original ice route is no longer the current legal route. No detour or new destination is chosen.',{})
    const flightIssue=nativeFlightGroundMovementIssue(state,actorId,path);if(flightIssue)throw new RuleViolation(flightIssue.code,flightIssue.message,{})
    const finalPosition = path[path.length-1], costCells = navigationPathCost(state, path, actorId, movementMode)
    if(movementMode==='walk'){
      const guard=iceWalk&&!transport&&!reactionMovement&&state.currentTurn===actorId?activeChaseGuard(state,actorId):undefined
      let guardFeet=guard?.t.movedFeet??0, guardDiagonals=navigationDiagonalsUsed(state,actorId)
      let iceChecked=Boolean(guard&&Object.values(state.dmTools?.groundGear?.contacts??{}).some(contact=>
        contact.slipperyIceEntry&&contact.entityId===actorId&&contact.turnKey===groundGearTurnKey(state)))
      let projected=state
      for(const[index,cell]of path.slice(1).entries()){
        const target=transport&&targetPath?projected.monsters[transport.targetId]??(transport.targetId==='player'?projected.player:projected.npcs?.[transport.targetId]):undefined
        projected=gs.assertPhysicalDisplacementsInState(projected,[{id:actorId,cell,kind:'walk',slipperyIceWalk:Boolean(iceWalk&&!transport&&!reactionMovement)},...(target&&targetPath?[{id:transport!.targetId,cell:targetPath[index+1],kind:'forced' as const}]:[])])
        if(guard&&guardFeet<20){
          const diagonal=isDiagonalStep(path[index],cell)
          guardFeet+=diagonal&&guardDiagonals%2?10:5
          guardDiagonals+=Number(diagonal)
          if(!iceChecked&&slipperyIceAtBody(projected,actorId,cell)?.zone){
            if(guardFeet>=20)throw new RuleViolation('SLIPPERY_ICE_CHASE_GUARD_ORDER_UNREPRESENTED',
              'This same actual step would open both the first ice check and the 20-foot chase guard reaction. No resolution order or movement is invented.',{})
            iceChecked=true
          }
        }
      }
    }
    assertWeatherMovement(actorId,path,movementMode,actorId==='player'?path:transport?.targetId==='player'?targetPath:undefined)
    for (const effect of state.monsterEffects ?? []) {
      const source = gs.getEntity(effect.sourceId), entity = gs.getEntity(actorId)
      if (effect.targetId === actorId && effect.conditions.includes('frightened') && source && entity?.conditions.includes('frightened')) {
        const initialDistance = Math.max(Math.abs(actor.position.x - source.position.x), Math.abs(actor.position.y - source.position.y))
        if (path.some(cell => Math.max(Math.abs(cell.x - source.position.x), Math.abs(cell.y - source.position.y)) < initialDistance))
          throw new RuleViolation('FRIGHTENED_APPROACH_FORBIDDEN', 'A frightened actor cannot willingly move closer to the source.', { sourceId: source.id })
      }
    }
    return { path, costCells, distance: costCells, plannedCostCells, remaining: remaining === null ? null : remaining-costCells,
      finalPosition, finalRoomId: inferRoomIdOnMap(finalPosition, state.currentMapId, state),
      ...(transport && targetPath ? { transport: { ...transportInfo!, targetPath, targetFinalPosition: targetPath.at(-1)! } } : {}),
      ...(movementMode === 'fly' ? { movementMode, movementScope: 'native_hover_horizontal_projection' as const } : {}),
      goalReached: stopReason === 'goal_reached', stopReason, stopDoorId, stopEvent,
      geometryStatus: geometry ? 'reviewed' : 'legacy_unverified', units: movementMode === 'fly' ? 'cells (5 feet), diagonals alternate 1/2 across the turn; native horizontal hover ignores terrestrial difficult terrain only' : 'cells (5 feet), diagonals alternate 1/2 across the turn, difficult terrain adds its walking cost' }
  } catch (err) {
    if (err instanceof NavigationError) throw new RuleViolation(err.code, err.message, err.detail)
    throw err
  }
}

export function executeNavigation(actorId: string, goal: NavigationGoal, allowPartial = false, acknowledgeEventIds: string[] = [], ignoredReactionSources:string[] = [], reactionMovement = false, transport?: GrappleTransportInput, movementMode: NavigationMovementMode = 'walk', iceWalk?: SlipperyIceWalk) {
  const cleaving=cleavingActionIssue(gs.getState());if(cleaving)throw new CleavingRuleViolation(cleaving.code,cleaving.message,{})
  if(actorId==='player'&&!reactionMovement){const issue=castingDueIssue(gs.getState());if(issue)throw new RuleViolation(issue.code,issue.message,{})}
  const beforePings = alarmPingCount(gs.getState())
  const result = planNavigation(actorId, goal, allowPartial, acknowledgeEventIds, reactionMovement, transport, movementMode, iceWalk) // Always revalidate against live state.
  let chaseDiagonals=navigationDiagonalsUsed(gs.getState(),actorId);const chaseFeet=result.path.slice(1).map((cell,index)=>{const diagonal=isDiagonalStep(result.path[index],cell),feet=diagonal&&chaseDiagonals%2?10:5;chaseDiagonals+=Number(diagonal);return feet});preflightChaseRoute(gs.getState(),actorId,result.path,chaseFeet)
  const recordCost = (cost: number) => {
    if(actorId==='player'&&movementMode==='walk'&&taken.length>1&&!gs.getPlayer().conditions.some(c=>['prone','unconscious','incapacitated','paralyzed','stunned','petrified'].includes(c))){let diagonalCount=navigationDiagonalsUsed(gs.getState(),actorId);const feet=taken.slice(1).map((cell,index)=>{const diagonal=isDiagonalStep(taken[index],cell),value=diagonal&&diagonalCount%2?10:5;diagonalCount+=Number(diagonal);return value});recordActualFootsteps(taken,feet)}
    if(actorId==='player'&&gs.getPlayer().conditions.some(c=>['prone','unconscious','incapacitated','paralyzed','stunned','petrified'].includes(c)))clearActualFootwork()
    if (gs.getState().phase !== 'combat') return
    const state = gs.getState()
    state.diagonalMovementUsed ??= {}
    state.diagonalMovementUsed[actorId] = (state.diagonalMovementUsed[actorId] ?? 0)
      + taken.slice(1).filter((cell, i) => isDiagonalStep(taken[i], cell)).length
    if (reactionMovement) {
      const budget = gs.getState().hero!.effects.find(effect => effect.kind === 'readied-movement' && effect.targetIds.includes(actorId))!
      budget.data.remainingCells = Math.max(0, Number(budget.data.remainingCells) - cost)
    } else gs.addMovementUsed(actorId, cost)
  }
  const taken=[result.path[0]]
  let actualCostCells=0,actualDiagonals=navigationDiagonalsUsed(gs.getState(),actorId)
  const targetPosition=()=>{
    if(!transport?.loadId)return gs.getEntity(transport!.targetId)!.position
    const load=physicalHandlingStateOf(gs.getState())!.loads[transport.loadId]
    return (load.targetKind==='object'?gs.getState().dmTools?.objects[transport.targetId]?.cell:gs.getMonster(transport.targetId)?.position)??load.lastTargetCell
  }
  const committedObservations = () => ({
    ...(result.transport && transport ? { transport: { ...result.transport,
      targetPath: result.transport.targetPath.slice(0, taken.length), targetFinalPosition: { ...targetPosition() } } } : {}),
    ...alarmPingsSince(gs.getState(), beforePings),
  })
  if(actorId==='player'&&gs.getState().hero&&!gs.getState().hero!.movementTrail.length)gs.getState().hero!.movementTrail.push({...result.path[0]})
  for (const cell of result.path.slice(1)) {
    if(beforeHeroStep(actorId,taken.at(-1)!,cell,goal,allowPartial,acknowledgeEventIds,
      transport ? [...ignoredReactionSources, transport.targetId] : ignoredReactionSources,reactionMovement,transport,movementMode,undefined,undefined,
      iceWalk?.retainedPath?{retainedPath:result.path.slice(taken.length-1)}:iceWalk)){
      const final=taken.at(-1)!
      const costCells = actualCostCells
      recordCost(costCells)
      return {...result,...committedObservations(),path:taken,costCells,remaining:result.remaining === null ? null : result.remaining + result.costCells - costCells,finalPosition:final,finalRoomId:inferRoomIdOnMap(final,gs.getState().currentMapId,gs.getState()),goalReached:false,stopReason:'reaction_decision'}
    }
    const stepCost=navigationGrid(gs.getState(),actorId,engineGeometry(),{movementMode}).stepCost(cell,taken.at(-1)!,actualDiagonals)
    if(gs.getState().phase==='combat'&&actualCostCells+stepCost>result.costCells+(result.remaining??0)){recordCost(actualCostCells);return{...result,...committedObservations(),path:taken,costCells:actualCostCells,finalPosition:taken.at(-1)!,goalReached:false,stopReason:'movement_budget_after_effect'}}
    const proneBeforeStep=gs.getPhysicalCreature(actorId)?.conditions.includes('prone')??false
    const gearBefore=new Set(pendingGroundGearContacts(gs.getState()).map(contact=>contact.id))
    const playerBeforeCell = { ...gs.getPlayer().position }
    if (transport && result.transport) {
      // Positions commit as one movement step; only the grappler's voluntary
      // departure can provoke an opportunity attack.
      const targetCell = result.transport.targetPath[taken.length]
      if(transport.loadId)gs.movePhysicalLoadPair(transport.loadId,actorId,cell,transport.targetId,targetCell,true)
      else gs.moveGrappledPair(actorId, cell, transport.targetId, targetCell,true)
    } else gs.moveToken(actorId, cell.x, cell.y,{voluntaryFootstep:movementMode==='walk',airborneFlight:movementMode==='fly',slipperyIceWalk:Boolean(iceWalk&&!reactionMovement)})
    actualCostCells+=stepCost;actualDiagonals+=Number(isDiagonalStep(taken.at(-1)!,cell))
    taken.push(cell)
    if(movementMode!=='fly')noteWeatherFlightMovement(actorId,movementMode)
    if(transport?.targetId==='player')noteWeatherFlightMovement('player','walk')
    if(actorId==='player'&&gs.getState().hero){gs.getState().hero!.movementTrail.push({...cell});gs.getState().hero!.movementTrail=gs.getState().hero!.movementTrail.slice(-6)}
    const chaseGuardDue=noteChaseActualStep(gs.getState(),actorId,chaseFeet[taken.length-2]??5)
    afterHeroStep(actorId)
    if (transport&&(!transport.loadId||gs.getMonster(transport.targetId)?.isAlive===true)) afterHeroStep(transport.targetId)
    const gearContacts=pendingGroundGearContacts(gs.getState()).filter(contact=>!gearBefore.has(contact.id))
    if(gearContacts.length){
      const actor=gs.getEntity(actorId),stillControlled=!transport||(transport.loadId?activePhysicalLoad(gs.getState())?.id===transport.loadId:heldGrappleTargets(gs.getState(),actorId).includes(transport.targetId))
      const iceContact=gearContacts.find(contact=>contact.slipperyIceEntry)
      if(actor&&actor.hp.current>0&&!actor.conditions.some(condition=>['unconscious','incapacitated','paralyzed','petrified','stunned'].includes(condition))&&(!actor.conditions.includes('prone')||proneBeforeStep)&&stillControlled)
        bindGroundGearContinuation(gearContacts.map(contact=>contact.id),{type:'movement',actorId,goal,allowPartial,acknowledgeEventIds,ignored:ignoredReactionSources,reactionMovement,...transport?{transport}:{},movementMode,
          ...iceWalk?{iceWalk:iceContact||iceWalk.retainedPath?{retainedPath:result.path.slice(taken.length-1)}:iceWalk}:{}})
      recordCost(actualCostCells)
      return{...result,...committedObservations(),path:taken,costCells:actualCostCells,finalPosition:cell,goalReached:false,stopReason:iceContact?'slippery_ice_entry':'ground_gear_contact',groundGearContactIds:gearContacts.map(contact=>contact.id),
        ...(iceContact?{slipperyIceContactId:iceContact.id,remaining:result.remaining===null?null:result.remaining+result.costCells-actualCostCells,
          finalRoomId:inferRoomIdOnMap(cell,gs.getState().currentMapId,gs.getState())}:{}),continuationStored:Boolean(gearContacts[0].continuation)}
    }
    const ambushId = actorId === 'player' || transport?.targetId === 'player'
      ? pendingDoorAmbush(gs.getState(), gs.getPlayer().position, playerBeforeCell) : undefined
    if (ambushId) {
      encounterAwareness(gs.getState())[ambushId].entryPending = true
      const costCells = actualCostCells
      recordCost(costCells)
      return { ...result, ...committedObservations(), path: taken, costCells, remaining: result.remaining === null ? null : result.remaining + result.costCells - costCells,
        finalPosition: cell, finalRoomId: gs.getState().currentRoomId, goalReached: false, stopReason: 'encounter_ambush',
        encounterId: ambushId }
    }
    if(chaseGuardDue){recordCost(actualCostCells);return{...result,...committedObservations(),path:taken,costCells:actualCostCells,finalPosition:cell,remaining:result.remaining===null?null:result.remaining+result.costCells-actualCostCells,goalReached:false,stopReason:'chase_guard_due',chaseGuardEvent:activeChaseGuard(gs.getState(),actorId)?.t.id}}
    if((gs.getEntity(actorId)?.hp.current??0)<=0)break
    if(transport && (transport.loadId?activePhysicalLoad(gs.getState())?.id!==transport.loadId:!heldGrappleTargets(gs.getState(), actorId).includes(transport.targetId))) {
      const costCells = actualCostCells
      recordCost(costCells)
      return { ...result, ...committedObservations(), path: taken, costCells,
        remaining: result.remaining === null ? null : result.remaining + result.costCells - costCells,
        finalPosition: cell, finalRoomId: inferRoomIdOnMap(cell, gs.getState().currentMapId, gs.getState()), goalReached: false, stopReason: 'grapple_ended' }
    }
  }
  const costCells = actualCostCells
  recordCost(costCells)
  if (reactionMovement) gs.getState().hero!.effects = gs.getState().hero!.effects.filter(effect => effect.kind !== 'readied-movement' || !effect.targetIds.includes(actorId))
  if(taken.length!==result.path.length)return {...result,...committedObservations(),path:taken,costCells,remaining:result.remaining === null ? null : result.remaining + result.costCells - costCells,finalPosition:taken.at(-1)!,goalReached:false,stopReason:'actor_down'}
  return {...result,costCells,remaining:result.remaining===null?null:result.remaining+result.costCells-costCells,...alarmPingsSince(gs.getState(),beforePings)}
}
