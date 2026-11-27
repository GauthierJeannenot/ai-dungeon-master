import { heldPitMeasurementsAllowed } from './pit-migration-scope'
import { chaseParticipant } from '../lib/chase-state'
import { xgeFallingStateOf,activeXgeFall } from '../lib/xge-falling-state'
import { MovementMediumInputSchema,SpecialMovementInputSchema,initialLocomotionState,locomotionStateOf,actualLocomotionLocation,type LocomotionState,type SpecialMovementInput } from '../lib/locomotion-state'
import { readMovementMedium,locomotionSpeed,projectLocomotionStep,projectLocomotionFall,sameLocomotionPoint } from '../lib/locomotion-geometry'
import { entityVerticalContext,jumpingStateOf,activeVerticalSurface } from '../lib/jumping-state'
import { readPhysicalBarrier } from '../lib/vertical-barriers'
import { getMapSpec,getAdventureMap,inferRoomIdOnMap,firstMapId } from '../lib/adventure-map'
import { navigationActor,navigationGrid,navigationDiagonalsUsed,isDiagonalStep } from '../lib/navigation'
import { monsterSource,attackProfile } from './monster-rules'
import { currentLoadout,weaponForReference,weaponAttackRangeCells } from './equipment'
import { activeMapTerrain } from '../lib/combat-round-events'
import { movementStepCostBreakdown } from '../lib/movement-modes'
import { groundGearStoppedThisTurn,pendingGroundGearContacts } from '../lib/ground-gear-state'
import { activePhysicalLoad } from '../lib/physical-handling-state'
import { playerHandOccupancy } from '../lib/hand-occupancy'
import { verticalData,clearActualFootwork } from './vertical-observations'
import { beforeHeroStep,afterHeroStep } from './hero-movement'
import { checkedResolution,registerCheckedResolution } from './toolkit-checks'
import { assertFrigidWaterEpisodeRoom, frigidWaterQualification } from './frigid-water'
import { bindGroundGearContinuation,prepareGroundGearStep,groundGearMovementIssue,recordGroundGearContact } from './ground-gear-contacts'
import { oilGroundContactIssue,onOilGroundContact } from './oil-ground'
import { assertWeatherFlameExposure } from './weather-flames'
import { registerPhysicalContinuation } from './movement-continuation'
import { heldGrappleTargets } from './grapple-transport'
import { available,now,effects,hero,fail } from './hero-rules'
import { preflightRestStrenuousInterval,recordRestStrenuousInterval } from './resting'
import { resolveFall } from './falling'
import { toolkitResult } from './toolkit'
import * as gs from './game-state'
import * as rules from './rules'

type Move=LocomotionState['moves'][string]
const data=()=>verticalData().locomotion??=initialLocomotionState()
const sameCell=(a:{x:number;y:number},b:{x:number;y:number})=>a.x===b.x&&a.y===b.y
const source='PHB2014 Climbing, Swimming, and Crawling; Using Different Speeds (5282â€“5285;5699â€“5703).'
function capacity(){if(Object.keys(locomotionStateOf(gs.getState())?.receipts??{}).length>=2048)fail('LOCOMOTION_HISTORY_LIMIT','The actual physical movement history is full; no prior receipt is evicted.')}
function receipt(id:string,command:string,result:Record<string,unknown>){data().receipts[id]={command,result:structuredClone(result)};return result}
function oldReceipt(id:string,command:string){const old=locomotionStateOf(gs.getState())?.receipts[id];if(old&&old.command!==command)fail('LOCOMOTION_EVENT_CONFLICT','This immutable event already records another real observation or route.');return old?{...structuredClone(old.result),replayed:true}:undefined}
function actualActor(id:string){const state=gs.getState(),body=gs.getEntity(id);if(!body||id!=='player'&&!state.monsters[id])fail('LOCOMOTION_ACTUAL_BODY_REQUIRED','Choose an actual active creature, not an archive or an unmodeled reactive NPC.');return body!}
function capable(id:string){
  const state=gs.getState(),body=actualActor(id)
  if(body.hp.current<=0||body.conditions.some(c=>['grappled','restrained','incapacitated','paralyzed','petrified','stunned','unconscious'].includes(c)))fail('LOCOMOTION_ACTOR_IMMOBILE','This actual body cannot perform voluntary climbing/swimming in its real condition.')
  if(body.conditions.includes('prone'))fail('LOCOMOTION_POSTURE_REQUIRED','Resolve the actual prone posture before this supported climbing/swimming procedure; no automatic stand or unreviewed prone swim is granted.')
  if(state.phase==='combat'&&(state.currentTurn!==id||!state.initiativeOrder.includes(id)))fail('NOT_CURRENT_TURN','Use this real creature turn and its own remaining movement.')
  if(groundGearStoppedThisTurn(state,id))fail('CALTROPS_MOVEMENT_STOPPED','The true caltrops stop applies to every new voluntary movement mode this global turn.')
  if(activePhysicalLoad(state)||heldGrappleTargets(state,id).length)fail('LOCOMOTION_PAYLOAD_UNSUPPORTED','Release the real held load or grapple; this climbing/swimming procedure does not grant unrepresented paired transport.')
  // Existing armor, exhaustion, capability and carrying guards remain shared.
  navigationActor(state,id,'walk',{allowLocomotion:true})
  return body
}
function hands(id:string,required:number){
  if(!required)return
  if(id!=='player')fail('LOCOMOTION_HAND_CONTEXT_REQUIRED','This source operation requires real hands; this non-player inventory/hand state is not represented.')
  if(playerHandOccupancy(gs.getState(),{ignoreLocomotion:true}).free<required)fail('LOCOMOTION_HANDS_OCCUPIED','Free the actual explicitly adjudicated number of hands before climbing/swimming; no weapon, shield or held load is dropped automatically.')
}
export function recordMovementMedium(raw:unknown){
  const input=MovementMediumInputSchema.parse(raw),command=JSON.stringify({kind:'movement-medium',input}),old=oldReceipt(input.eventId,command);if(old)return old
  if(gs.getState().hero?.pending&&!heldPitMeasurementsAllowed(gs.getState()))fail('REACTION_PENDING','Complete the original held reaction before changing its physical observation.');capacity();const state=gs.getState(),map=getMapSpec(state.currentMapId,state),fact=state.worldFacts?.find(f=>f.id===input.factId)
  if(input.mapId!==state.currentMapId||!getAdventureMap(state).rooms.some(r=>r.id===input.roomId&&(r.mapId??firstMapId(state))===input.mapId)||!fact||fact.mapId!==input.mapId)fail('LOCOMOTION_PHYSICAL_FACT_REQUIRED','Choose a real existing room and physical fact on the current map; no water, wall or room is inferred or generated.')
  if(input.cells.some(cell=>cell.x>=map.grid.cols||cell.y>=map.grid.rows||inferRoomIdOnMap(cell,input.mapId,state)!==input.roomId))fail('LOCOMOTION_MEDIUM_CELLS_REQUIRED','The actual medium cells must be inside their real map room.')
  const previous=data().media[input.mediumId]
  if(!previous&&Object.keys(data().media).length>=256)fail('LOCOMOTION_MEDIUM_LIMIT','The retained actual-medium registry is full.')
  let barrierWitness:string|undefined
  if(input.mode==='climb'){
    const read=readPhysicalBarrier(state,input.barrierId!)
    if(!read.active||read.issue||!read.barrier||read.barrier.mapId!==input.mapId||input.bottomZFeet<read.barrier.bottomZFeet||input.topZFeet>read.barrier.topZFeet)fail('LOCOMOTION_CLIMBING_FACE_REQUIRED','The selected climbing interval needs an actual measured intact wall/face and stays inside its real vertical bounds.')
    const reference=read.barrier!.reference
    if(reference.kind==='surface')fail('LOCOMOTION_VERTICAL_FACE_REQUIRED','A horizontal support is not automatically a climbing face.')
    const bounds=read.actual!
    const adjacent=(cell:{x:number;y:number})=>bounds.edge?[bounds.edge.from,bounds.edge.to].some(end=>sameCell(end,cell)):bounds.boxes.some(box=>cell.x*5>=box.minXFeet-5&&cell.x*5<=box.maxXFeet+5&&cell.y*5>=box.minYFeet-5&&cell.y*5<=box.maxYFeet+5)
    if(input.cells.some(cell=>!adjacent(cell)))fail('LOCOMOTION_FACE_CELL_REQUIRED','Each explicitly confirmed climbing cell must actually border the selected physical face; no remote handhold is created.')
    barrierWitness=JSON.stringify(read.barrier)
  }
  const physicalKey=(value:typeof input)=>JSON.stringify({mode:value.mode,mapId:value.mapId,cells:[...value.cells].sort((a,b)=>a.x-b.x||a.y-b.y),bottomZFeet:value.bottomZFeet,topZFeet:value.topZFeet,surfaceZFeet:value.surfaceZFeet,barrierId:value.barrierId})
  if(previous){
    let before:{provenance?:{referenceWitness?:string}},after:typeof before
    try{before=JSON.parse(previous.barrierWitness??'null');after=JSON.parse(barrierWitness??'null')}catch{fail('LOCOMOTION_REOBSERVATION_REQUIRED','Retain the original actual physical reference.')}
    if(!input.reobserveChangedPhysicalReferenceConfirmed||input.mode!=='climb'||previous.mode!=='climb'||physicalKey(previous)!==physicalKey(input)||!before!?.provenance?.referenceWitness||!after!?.provenance?.referenceWitness||before!.provenance.referenceWitness===after!.provenance.referenceWitness||Object.values(data().moves).some(move=>move.input.mediumId===input.mediumId&&move.status!=='completed'))fail('LOCOMOTION_MEDIUM_ALREADY_RECORDED','Only a real changed physical reference that has actually been remeasured may refresh this same face. Bounds, cells, old movement and receipts are retained; a nonce alone cannot reset the context.')
  }else if(input.reobserveChangedPhysicalReferenceConfirmed)fail('LOCOMOTION_REOBSERVATION_REQUIRED','Choose the actual existing observed face before refreshing it.')
  if(Object.values(data().media).some(value=>value.mediumId!==input.mediumId&&physicalKey(value)===physicalKey(input)))fail('LOCOMOTION_MEDIUM_IDENTITY_REQUIRED','This same real face/water interval already has a retained identity. Choose it instead of creating another context or retry ledger.')
  const medium={...input,at:now(),...(barrierWitness?{barrierWitness}:{})};data().media[input.mediumId]=medium
  return receipt(input.eventId,command,{success:true,medium:structuredClone(medium),positionChanged:false,speedGranted:false,notice:'Hands, optional Athletics DC and actual clearance are explicit MJ physical adjudications, not universal printed requirements.'})
}
function finish(move:Move,extra:Record<string,unknown>={}){
  move.status='completed';const result={success:true,eventId:move.input.eventId,entityId:move.input.entityId,mediumId:move.input.mediumId,mode:data().media[move.input.mediumId].mode,
    costFeet:move.spentFeet,costCells:move.spentFeet/5,actualPoint:{...move.input.path[move.cursor]},goalReached:move.cursor===move.input.path.length-1,nativeModeSpeed:move.nativeSpeed,source,...(move.check?{athletics:move.check}:{}),...extra}
  move.result=result;receipt(move.input.eventId,move.command,result);return toolkitResult(result)
}
function context(move:Move){
  const state=gs.getState(),read=readMovementMedium(state,move.input.mediumId),body=actualActor(move.input.entityId),point=move.input.path[move.cursor]
  if(read.issue)fail(read.issue.code,read.issue.message)
  if(JSON.stringify(read.medium)!==move.mediumWitness||move.mapId!==state.currentMapId||move.at!==now()||move.turnCounter!==(state.turnCounter??0)||move.combatGeneration!==(state.combatGeneration??0)||!sameCell(body.position,point))fail('LOCOMOTION_CONTINUATION_CHANGED','The original physical medium, map, time, turn and body cursor must still match this exact route; no old path is reconstructed.')
  return read.medium!
}
function preflight(input:SpecialMovementInput){
 if(chaseParticipant(gs.getState(),input.entityId))fail('CHASE_MOVEMENT_MODE_UNREPRESENTED','Explicitly stop this first ground-map chase before unsupported flight, climbing, swimming or jump movement; no position/cost is committed.')
 if(activeXgeFall(gs.getState(),input.entityId))fail('XGE_FALL_RECOVERY_REQUIRED','An ongoing source fall owns this actual body position; no new climbing/swimming route implicitly arrests it.')
  const state=gs.getState(),body=capable(input.entityId),read=readMovementMedium(state,input.mediumId);if(read.issue)fail(read.issue.code,read.issue.message)
  const medium=read.medium!,height=entityVerticalContext(state,input.entityId),first=input.path[0]
  if (input.entityId === 'player' && frigidWaterQualification(state, input.mediumId)) assertFrigidWaterEpisodeRoom()
  if(!height.known||height.airborne||!sameCell(first,body.position)||first.zFeet!==height.zFeet)fail('LOCOMOTION_START_CONTEXT_REQUIRED','The actual starting body cell and known local height must match; observing a medium never teleports or lands a creature.')
  hands(input.entityId,medium.handsRequired);if(input.entityId==='player')preflightRestStrenuousInterval()
  const current=actualLocomotionLocation(state,input.entityId)
  if(current&&current.mediumId!==input.mediumId)fail('LOCOMOTION_MEDIUM_TRANSITION_REQUIRED','Reach a real support before switching these separately observed physical media; no unrepresented boundary is crossed for free.')
  const speed=locomotionSpeed(state,input.entityId,medium.mode),stepFeet:number[]=[],grid=navigationGrid(state,input.entityId,getMapSpec(state.currentMapId,state).geometry,{ignoreActorEffects:true})
  let projected=state,diagonals=navigationDiagonalsUsed(state,input.entityId)
  for(let index=1;index<input.path.length;index++){
    const from=input.path[index-1],to=input.path[index],horizontal=!sameCell(from,to),dz=Math.abs(to.zFeet-from.zFeet)
    if(horizontal&&dz||!horizontal&&!dz||horizontal&&Math.max(Math.abs(to.x-from.x),Math.abs(to.y-from.y))!==1||!horizontal&&dz>5)fail('LOCOMOTION_SEGMENT_GEOMETRY_REQUIRED','Choose actual adjacent horizontal grid steps or vertical segments up to five feet, separately; no new compound3D distance formula or trajectory is invented.')
    if(medium.mode==='swim'&&(dz||!input.surfaceSwimmingConfirmed||from.zFeet>medium.surfaceZFeet!||to.zFeet>medium.surfaceZFeet!))fail('LOCOMOTION_SURFACE_SWIM_ONLY','This explicit procedure swims on the observed actual water surface. It grants no underwater breathing, submerged route or bottom walking.')
    if(horizontal&&!grid.step(from,to))fail('LOCOMOTION_BLOCKED','The chosen real route cannot pass a wall, closed door, occupied cell or blocked corner.')
    if(!grid.free(to))fail('LOCOMOTION_BLOCKED','The chosen actual cell is blocked or occupied.')
    const baseFeet=horizontal?(isDiagonalStep(from,to)&&diagonals%2===1?10:5):dz
    if(horizontal&&isDiagonalStep(from,to))diagonals++
    const difficult=medium.difficult||activeMapTerrain(state).some(terrain=>terrain.kind==='difficult'&&terrain.cells.some(cell=>sameCell(cell,to)))
    stepFeet.push(movementStepCostBreakdown(baseFeet/5,{difficult,specialMode:true,nativeModeSpeed:speed.nativeSpeed}).totalCells*5)
    const last=index===input.path.length-1,landing=last?input.landingSurfaceId:undefined,fromWitness=prepareGroundGearStep(projected,input.entityId,landing?'landing':'forced'),projection=projectLocomotionStep(projected,input.entityId,input.mediumId,to,landing)
    if(projection.issue)fail(projection.issue.code,projection.issue.message)
    projected=projection.state
    const issue=oilGroundContactIssue(projected,input.entityId)??groundGearMovementIssue(projected,input.entityId,landing?'landing':'forced',fromWitness);if(issue)fail(issue.code,issue.message)
    if(input.entityId==='player')assertWeatherFlameExposure({playerPosition:to},projected)
  }
  const vertical=input.path.some(point=>point.zFeet!==first.zFeet),allies=(id:string)=>id==='player'||state.monsters[id]?.hostile===false
  if(state.phase==='combat'&&!effects('disengage',input.entityId).length){
    for(const other of [state.player,...Object.values(state.monsters)]){
      if(other.id===input.entityId||other.hp.current<=0||allies(other.id)===allies(input.entityId))continue
      let reach=1
      if(other.id==='player'){
        const loadout=currentLoadout()
        for(const itemId of [loadout.mainHandId,loadout.offHandId]){const weapon=itemId?weaponForReference(itemId):undefined;if(weapon&&!weapon.properties.includes('ranged'))reach=Math.max(reach,weaponAttackRangeCells(weapon))}
      }else for(const action of monsterSource(other)?.actions??[]){
        if(action.attack_bonus===undefined)continue
        try{const profile=attackProfile(other as import('../lib/types').MonsterState,action.name);if(profile.melee)reach=Math.max(reach,profile.rangeCells)}catch(error){if(!(error instanceof rules.RuleViolation))throw error}
      }
      const height=entityVerticalContext(state,other.id),nearby=input.path.some(point=>Math.max(Math.abs(point.x-other.position.x),Math.abs(point.y-other.position.y))<=reach)
      if(nearby&&(vertical||!height.known||height.zFeet!==first.zFeet))fail('LOCOMOTION_VERTICAL_OPPORTUNITY_CONTEXT_REQUIRED','A real enemy with its actual source reach may cross an unrepresented vertical boundary. Resolve that source geometry before this route, without silently skipping a reaction or consuming Athletics first.')
    }
  }
  const spatialHeight=vertical||first.zFeet!==0
  if(spatialHeight&&hero().effects.some(effect=>{
    if(effect.kind!=='guardian-of-faith'||effect.expiresAt<=now()||effect.data.mapId!==state.currentMapId||allies(effect.sourceId)===allies(input.entityId))return false
    const cell=effect.data.cell as{x:number;y:number}|undefined
    return Boolean(cell&&input.path.some(point=>[0,1].some(x=>[0,1].some(y=>Math.max(Math.abs(point.x-cell.x-x),Math.abs(point.y-cell.y-y))<=2))))
  }))fail('LOCOMOTION_VERTICAL_EFFECT_CONTEXT_REQUIRED','This actual route may enter the real nearby hostile guardian volume, whose old XY trigger has no represented vertical bounds. Resolve its source geometry before cost or dice.')
  const remaining=state.phase==='combat'?Math.max(0,speed.budgetFeet-gs.getMovementUsed(input.entityId)*5):Infinity
  if(input.entityId==='player'&&state.dmTools?.rests?.active){let allowance=remaining,count=medium.athletics?1:0;for(const cost of stepFeet){if(cost>allowance)break;allowance-=cost;count++}if(state.dmTools.rests.active.segments.length+count>512)fail('REST_ACTIVITY_LIMIT','The entire actual reachable movement/check prefix exceeds retained rest activity capacity before its first die or step.')}
  if(stepFeet.reduce((a,b)=>a+b,0)>remaining&&!input.allowPartial)fail('MOVEMENT_EXCEEDED','The complete real route exceeds this mode remaining speed after all prior movement; no movement, skill die or cost has committed.')
  if(!speed.speedFeet||stepFeet[0]>remaining)fail('MOVEMENT_EXCEEDED','This actual mode has insufficient speed for even its first true step.')
  return{medium,speed,stepFeet}
}
export function startSpecialMovement(raw:unknown){
  const input=SpecialMovementInputSchema.parse(raw),command=JSON.stringify({kind:'special-movement',input}),old=oldReceipt(input.eventId,command);if(old)return toolkitResult(old)
  const existing=locomotionStateOf(gs.getState())?.moves[input.eventId];if(existing){if(existing.command!==command)fail('LOCOMOTION_EVENT_CONFLICT','Keep the original actual route and event identity.');return resumeSpecialMovement(input.eventId)}
  available();capacity();const planned=preflight(input)
  if(Object.keys(data().moves).length>=512)fail('LOCOMOTION_MOVE_LIMIT','The retained real-route history is full.')
  const physicalKey=(value:SpecialMovementInput)=>JSON.stringify({entityId:value.entityId,mediumId:value.mediumId,path:value.path,landingSurfaceId:value.landingSurfaceId})
  const repeated=Object.values(data().moves).find(move=>move.mediumWitness===JSON.stringify(planned.medium)&&move.at===now()&&move.turnCounter===(gs.getState().turnCounter??0)&&move.combatGeneration===(gs.getState().combatGeneration??0)&&physicalKey(move.input)===physicalKey(input))
  if(repeated)return repeated.result?toolkitResult({...repeated.result,replayed:true,samePhysicalAttempt:true}):resumeSpecialMovement(repeated.input.eventId)
  const move:Move={input,command,mapId:gs.getState().currentMapId!,mediumWitness:JSON.stringify(planned.medium),turnCounter:gs.getState().turnCounter??0,combatGeneration:gs.getState().combatGeneration??0,at:now(),cursor:0,stepFeet:planned.stepFeet,spentFeet:0,nativeSpeed:planned.speed.nativeSpeed,sourceSpeedFeet:planned.speed.speedFeet,status:'moving'}
  data().moves[input.eventId]=move
  if(planned.medium.athletics){move.status='check';return checkedResolution({entityId:input.entityId,ability:'str',skill:'athletics',dc:planned.medium.athletics.dc,label:`DÃ©placement rÃ©el ${planned.medium.mode} â€” dÃ©cision MJ ${planned.medium.athletics.reason}`},{domain:'special-movement-check',command:{eventId:input.eventId}})}
  return resumeSpecialMovement(input.eventId)
}
export function resumeSpecialMovement(eventId:string,ignored:string[]=[],_attack?:unknown){
  const move=data().moves[eventId];if(!move)fail('LOCOMOTION_MOVE_REQUIRED','Choose the exact retained movement event.')
  if(move!.result)return toolkitResult({...move!.result,replayed:true})
  if(move!.status==='check')fail('LOCOMOTION_CHECK_PENDING','Resolve the original held Athletics check; no new die is rolled by a continuation.')
  if(move!.status==='ground_contact'){
    if(move!.groundGearContactIds?.some(id=>gs.getState().dmTools?.groundGear?.contacts[id]?.status!=='resolved'))fail('GROUND_GEAR_CONTACT_DUE','Resolve all actual contacts from this same real arrival first.')
    return finish(move!,{physicalArrivalAlreadyCommitted:true})
  }
  available();const medium=context(move!),actor=actualActor(move!.input.entityId)
  if(actor.hp.current<=0||actor.conditions.some(c=>['prone','grappled','restrained','incapacitated','unconscious','paralyzed','petrified','stunned'].includes(c)))return finish(move!,{movementStopped:true,actualPhysicalPositionPreserved:true})
  capable(actor.id);hands(actor.id,medium.handsRequired);move!.status='moving'
  while(move!.cursor<move!.input.path.length-1){
    const from=move!.input.path[move!.cursor],to=move!.input.path[move!.cursor+1],speed=locomotionSpeed(gs.getState(),actor.id,medium.mode),cost=move!.stepFeet[move!.cursor],last=move!.cursor+1===move!.input.path.length-1
    if(gs.getState().phase==='combat'&&cost>speed.budgetFeet-gs.getMovementUsed(actor.id)*5)return finish(move!,{movementStopped:true,reason:'actual_remaining_movement',partial:true})
    if(sameCell(from,to)===false&&beforeHeroStep(actor.id,from,to,{kind:'cell',cell:move!.input.path.at(-1)!},false,[],ignored,false,undefined,'walk',undefined,eventId)){move!.status='opportunity';return toolkitResult({eventId,pendingReaction:hero().pending,costFeet:move!.spentFeet})}
    const contactsBefore=new Set(pendingGroundGearContacts(gs.getState()).map(contact=>contact.id)),landing=last?move!.input.landingSurfaceId:undefined
    gs.commitLocomotionDisplacement(actor.id,to,medium.mediumId,eventId,landing)
    if(gs.getState().phase==='combat')gs.addMovementUsed(actor.id,cost/5)
    if(isDiagonalStep(from,to)){gs.getState().diagonalMovementUsed??={};gs.getState().diagonalMovementUsed![actor.id]=(gs.getState().diagonalMovementUsed![actor.id]??0)+1}
    move!.cursor++;move!.spentFeet+=cost
    gs.addLogEntry({round:gs.getState().round,turn:actor.id,action:'Actual climbing/swimming step',mechanicalDetail:`${eventId}:${move!.cursor} | ${medium.mode} | (${from.x},${from.y},${from.zFeet}) -> (${to.x},${to.y},${to.zFeet}) | ${cost} ft paid movement`})
    if(actor.id==='player')recordRestStrenuousInterval({eventId:`locomotion-step:${eventId}:${move!.cursor}`,from:now(),to:now(),reason:'Actual climbing/swimming movement, without invented elapsed seconds.'})
    clearActualFootwork(actor.id);afterHeroStep(actor.id)
    const contacts=pendingGroundGearContacts(gs.getState()).filter(contact=>!contactsBefore.has(contact.id))
    if(contacts.length){move!.status='ground_contact';move!.groundGearContactIds=contacts.map(contact=>contact.id);bindGroundGearContinuation(move!.groundGearContactIds,{type:'engine-effect',domain:'special-movement',command:{eventId}});return toolkitResult({eventId,status:move!.status,groundGearContactIds:move!.groundGearContactIds,costFeet:move!.spentFeet})}
    if(actor.hp.current<=0)return finish(move!,{movementStopped:true,actualPhysicalPositionPreserved:true})
  }
  return finish(move!)
}
export function completeLocomotionFall(input:{eventId:string;entityId:string;landingSurfaceId:string;reason:string}){
 const command=JSON.stringify({kind:'locomotion-fall',input}),old=oldReceipt(input.eventId,command);if(old)return old
 const plan=projectLocomotionFall(gs.getState(),input.entityId,input.landingSurfaceId);if(plan.issue)fail(plan.issue.code,plan.issue.message)
 if(xgeFallingStateOf(gs.getState())?.policy?.input.rate500&&plan.distanceFeet!>500)fail('XGE_FALL_ONGOING_REQUIRED','The adopted source rate cannot be bypassed by a completed fall over500ft, including corpse branches; choose its actual ongoing fall procedure before displacement.')
 available({allowLocomotionFall:{entityId:input.entityId,locationWitness:plan.locationWitness!}});capacity()
 const state=gs.getState(),body=actualActor(input.entityId),dead=input.entityId==='player'?Boolean(state.player.deathSaves?.dead):'isAlive'in body&&body.isAlive===false
 if(dead){
   const from=prepareGroundGearStep(state,input.entityId,'landing'),issue=groundGearMovementIssue(plan.state!,input.entityId,'landing',from)??oilGroundContactIssue(plan.state!,input.entityId);if(issue)fail(issue.code,issue.message)
   const actual=verticalData(),planned=plan.state!.dmTools!.jumping!;delete actual.locomotion!.locations[input.entityId];actual.supports[input.entityId]=planned.supports[input.entityId]
   onOilGroundContact(input.entityId);recordGroundGearContact(input.entityId,'landing',from)
   gs.addLogEntry({round:state.round,turn:input.entityId,action:'Actual completed corpse fall',mechanicalDetail:`${plan.distanceFeet} ft to ${input.landingSurfaceId}; existing dead state unchanged, no creature damage/save/action.`})
   return receipt(input.eventId,command,{eventId:input.eventId,entityId:input.entityId,distanceFeet:plan.distanceFeet,landingSurfaceId:input.landingSurfaceId,corpse:true,damageRolled:false,creatureFallDamageApplied:false,objectDamageUnresolved:true,actualPhysicalPosition:entityVerticalContext(state,input.entityId)})
 }
 const result=resolveFall({eventId:input.eventId,entityId:input.entityId,distanceFeet:plan.distanceFeet!,reason:input.reason},undefined,input.landingSurfaceId)
 return receipt(input.eventId,command,{...result,landingSurfaceId:input.landingSurfaceId,actualPhysicalPosition:entityVerticalContext(gs.getState(),input.entityId)})
}
export function inspectSpecialMovement(){const state=gs.getState();return{locomotion:locomotionStateOf(state)??null,playerContext:entityVerticalContext(state,'player'),source,diceRolled:false,positionChanged:false,notice:'Surface swimming and measured climbing only; no underwater breathing, paired transport or unrepresented vertical opportunity/effect geometry is granted.'}}
export function validateHeldSpecialMovement(command:Record<string,unknown>){
 const resolution=command.toolkitResolution as{domain?:string;command?:{eventId?:string}}|undefined
 if(resolution?.domain!=='special-movement-check')return
 const move=data().moves[resolution.command?.eventId??''];if(!move||move.status!=='check')fail('LOCOMOTION_CHECK_CONTEXT_CHANGED','Keep the one true source Athletics check before spending a held bonus die.')
 context(move!);preflight(move!.input)
}
export function registerSpecialMovementResolutions(){
  registerCheckedResolution('special-movement-check',(command,result)=>{
    const move=data().moves[String(command.eventId)];if(!move||move.status!=='check')fail('LOCOMOTION_CHECK_CONTEXT_CHANGED','Keep the exact original physical route and held check.')
    context(move!);move!.check=structuredClone(result) as unknown as Record<string,unknown>
    if(move!.input.entityId==='player')recordRestStrenuousInterval({eventId:`locomotion-athletics:${move!.input.eventId}`,from:now(),to:now(),reason:'Actual source-circumstance climbing/swimming Athletics effort, without invented elapsed seconds.'})
    if(!result.success)return finish(move!,{athletics:result,movementStopped:true,reason:'actual_failed_athletics',fallInvented:false})
    move!.status='moving';return resumeSpecialMovement(move!.input.eventId)
  })
  registerPhysicalContinuation('special-movement',(command,stopped)=>{
    const move=data().moves[String(command.eventId)];if(!move)fail('LOCOMOTION_MOVE_REQUIRED','Keep the exact original special-movement continuation.')
    if(stopped&&move!.status!=='ground_contact')return finish(move!,{movementStopped:true,actualPhysicalPositionPreserved:true})
    return resumeSpecialMovement(move!.input.eventId,Array.isArray(command.ignored)?command.ignored.filter((value):value is string=>typeof value==='string'):[])
  })
}
