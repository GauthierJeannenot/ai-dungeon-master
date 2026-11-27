import { chaseParticipant } from '../lib/chase-state'
import { actualLocomotionLocation } from '../lib/locomotion-state'
import { pendingGroundGearContacts } from '../lib/ground-gear-state'
import { prepareGroundGearStep,groundGearMovementIssue,recordGroundGearContact,bindGroundGearContinuation } from './ground-gear-contacts'
import { opportunityBoundary } from './opportunity-boundary'
import { monsterSource,attackProfile } from './monster-rules'
import type { VerticalBarrierReference } from '../lib/vertical-barrier-state'
import { JumpInputSchema,LowObstacleInputSchema,jumpingStateOf,actualRunningStart,actualSurfaceAt,entityVerticalContext,jumpCellKey,bodyPhysicalHeight,activeVerticalSurface,physicalHeightCombatIssue,type JumpInput,type JumpingState } from '../lib/jumping-state'
import { readPhysicalBarrier,activePhysicalBarriers } from '../lib/vertical-barriers'
import { activeMapTerrain } from '../lib/combat-round-events'
import { navigationActor,navigationGrid,navigationDiagonalsUsed,isDiagonalStep,NavigationError } from '../lib/navigation'
import { getAdventureMap,inferRoomIdOnMap } from '../lib/adventure-map'
import { activePhysicalLoad } from '../lib/physical-handling-state'
import { pendingDoorAmbush } from '../lib/encounter-awareness'
import { verticalData,clearActualFootwork } from './vertical-observations'
import { engineGeometry } from './navigation'
import { beforeHeroStep,afterHeroStep } from './hero-movement'
import { heldGrappleTargets } from './grapple-transport'
import { available,hero,now,feature,fail,reactionAvailable } from './hero-rules'
import { checkedResolution,registerCheckedResolution } from './toolkit-checks'
import { toolkitResult,toolkitError } from './toolkit'
import { assertWeatherFlameExposure } from './weather-flames'
import { oilGroundContactIssue,onOilGroundContact } from './oil-ground'
import { resolveFall } from './falling'
import * as rules from './rules'
import * as gs from './game-state'

type Cell={x:number;y:number}
type Jump=JumpingState['jumps'][string]
const same=(a:Cell,b:Cell)=>a.x===b.x&&a.y===b.y
const source='PHB2014 Jumping, rules/books/phb-2014.md:5289–5301'
function retained(id:string){const data=jumpingStateOf(gs.getState()),jump=data?.jumps[id];if(!jump)fail('JUMP_EVENT_REQUIRED','Choose the exact previously requested jump.');return jump!}
function supportFor(cell:Cell,id:string|undefined,z:number){
 const state=gs.getState(),surfaces=actualSurfaceAt(state,cell),surface=id?jumpingStateOf(state)?.surfaces[id]:surfaces.find(value=>value.kind==='support'&&value.elevationFeet===z)
 if(id&&(!surface||!activeVerticalSurface(state,surface.surfaceId)||surface.kind!=='support'||surface.mapId!==state.currentMapId||!surface.cells.some(value=>same(value,cell))))fail('JUMP_SUPPORT_REQUIRED','The exact real takeoff/landing surface must contain this body cell on this map.')
 if(!surface&&surfaces.some(value=>value.kind==='gap'||value.elevationFeet!==z))fail('JUMP_SUPPORT_REQUIRED','A real measured support is required at this relief/gap; no floor or landing is inferred.')
 return surface
}
function directPath(from:Cell,to:Cell){
 const length=Math.max(Math.abs(to.x-from.x),Math.abs(to.y-from.y)),path:Cell[]=[{...from}]
 if(length>255)fail('JUMP_PATH_LIMIT','This exact leap exceeds the bounded map path.')
 for(let i=1;i<=length;i++)path.push({x:Math.round(from.x+(to.x-from.x)*i/length),y:Math.round(from.y+(to.y-from.y)*i/length)})
 return path
}
function projectedLanding(state:ReturnType<typeof gs.getState>,cell:Cell,surfaceId?:string){
 const next=structuredClone(state);next.player.position={...cell}
 const data=next.dmTools?.jumping;if(data){delete data.activeJumpId;if(surfaceId){const surface=data.surfaces[surfaceId];data.supports.player={entityId:'player',mapId:next.currentMapId!,surfaceId,elevationFeet:surface.elevationFeet,observedAt:next.worldTimeSeconds??0,source,revision:(data.supports.player?.revision??0)+1}}else delete data.supports.player}
 return next
}
function preflightLanding(cell:Cell,surfaceId?:string){const next=projectedLanding(gs.getState(),cell,surfaceId),issue=oilGroundContactIssue(next,'player')??groundGearMovementIssue(next,'player','landing',prepareGroundGearStep(gs.getState(),'player','landing'));if(issue)fail(issue.code,issue.message);assertWeatherFlameExposure({playerPosition:cell},next)}
function setSupport(id:string|undefined){const data=verticalData();if(!id){delete data.supports.player;return}const surface=data.surfaces[id],old=data.supports.player;data.supports.player={entityId:'player',mapId:gs.getState().currentMapId!,surfaceId:id,elevationFeet:surface.elevationFeet,observedAt:now(),source,revision:(old?.revision??0)+1}}
function finish(jump:Jump,extra:Record<string,unknown>={}){
 jump.status='completed';const result={success:true,eventId:jump.input.eventId,kind:jump.input.kind,from:jump.from,toCell:{...gs.getPlayer().position},runningStart:jump.running,maximumFeet:jump.maximumFeet,costFeet:jump.spentFeet,costCells:jump.spentFeet/5,heightFeet:jump.input.heightFeet??null,fromElevationFeet:jump.fromElevationFeet,toElevationFeet:jump.toElevationFeet,obstacleChecks:jump.obstacleChecks,reachFeet:jump.input.kind==='high'&&bodyPhysicalHeight(gs.getState(),'player')!==null?(jump.input.heightFeet??0)+1.5*bodyPhysicalHeight(gs.getState(),'player')!:null,source,...(jump.input.combinedTrajectory?{trajectoryAdjudication:jump.input.combinedTrajectory,notice:'This combined trajectory cost is the explicit MJ adjudication for this physical route, not a printed PHB3D formula.'}:{}),...extra}
 jump.result=result;delete verticalData().activeJumpId;verticalData().receipts[jump.input.eventId]={command:jump.command,result:structuredClone(result)};return toolkitResult(result)
}
function spend(jump:Jump,feet:number,diagonal=false){if(feet<=0)return;if(gs.getState().phase==='combat'){gs.addMovementUsed('player',feet/5);if(diagonal){gs.getState().diagonalMovementUsed??={};gs.getState().diagonalMovementUsed!.player=(gs.getState().diagonalMovementUsed!.player??0)+1}}jump.spentFeet+=feet}
function check(jump:Jump,stage:'obstacle_check'|'higher_check'|'landing_check',dc:number){jump.status=stage;return checkedResolution({entityId:'player',ability:stage==='landing_check'?'dex':'str',skill:stage==='landing_check'?'acrobatics':'athletics',dc,label:stage==='landing_check'?'Réception de saut en terrain difficile':'Saut réel (Athlétisme)'},{domain:'actual-jump-check',command:{jumpId:jump.input.eventId,stage,obstacleIndex:jump.nextObstacle}})}
function fallRequired(jump:Jump){jump.status='fall_required';clearActualFootwork();return toolkitResult({eventId:jump.input.eventId,fallRequired:true,actualCell:{...gs.getPlayer().position},notice:'The actual airborne leap was interrupted. Explicitly complete_jump_fall with its real landing surface and measured fall distance. No platform, landing or new die was invented.'})}
function finishActualLanding(jump:Jump,extra:Record<string,unknown>={}){
 jump.status='landing_check'
 if(gs.getPlayer().hp.current>0&&!gs.getPlayer().conditions.includes('prone')&&jump.landingDifficult)return check(jump,'landing_check',10)
 return finish(jump,{...jump.landingContext,...extra,landedProne:gs.getPlayer().conditions.includes('prone')})
}
function land(jump:Jump,surfaceId:string|undefined,extra:Record<string,unknown>={}){
 const witness=prepareGroundGearStep(gs.getState(),'player','landing')
 setSupport(surfaceId);jump.status='landing_check';onOilGroundContact('player');afterHeroStep('player')
 const contact=recordGroundGearContact('player','landing',witness)
 if(contact){jump.landingContext=structuredClone(extra);jump.status='ground_contact';bindGroundGearContinuation([contact.id],{type:'movement',jumpId:jump.input.eventId,actorId:'player',goal:{kind:'cell',cell:jump.input.toCell},allowPartial:false,acknowledgeEventIds:jump.input.acknowledgeEventIds,ignored:[]});return toolkitResult({eventId:jump.input.eventId,status:jump.status,costFeet:jump.spentFeet,groundGearContactIds:[contact.id],landed:true,continuationRequired:true,...extra})}
 return finishActualLanding(jump,extra)
}
export function recordJumpObstacle(raw:unknown){
 const input=LowObstacleInputSchema.parse(raw),command=JSON.stringify({kind:'low-jump-obstacle',input}),data=verticalData(),old=data.receipts[input.eventId]
 if(old){if(old.command!==command)fail('VERTICAL_EVENT_CONFLICT','This retained event already records another exact fact.');return{...old.result,replayed:true}}
 if(hero().pending||data.activeJumpId)fail('JUMP_CONTINUATION_REQUIRED','Resolve the current held physical movement before changing its obstacle context.')
 const barrier=readPhysicalBarrier(gs.getState(),input.barrierId),collision=data.surfaces[input.collisionSurfaceId]
 if(barrier.issue)fail(barrier.issue.code,barrier.issue.message)
 if(!barrier.active||barrier.barrier!.mapId!==gs.getState().currentMapId||!collision||collision.kind!=='support'||collision.mapId!==gs.getState().currentMapId)fail('JUMP_OBSTACLE_REQUIRED','Choose an active measured real barrier and existing collision support on this map.')
 if(data.obstacles[input.obstacleId])fail('JUMP_OBSTACLE_ALREADY_REGISTERED','This exact obstacle profile retains its physical provenance; a nonce cannot replace it.')
 if(Object.keys(data.obstacles).length>=256||Object.keys(data.receipts).length>=2048)fail('VERTICAL_HISTORY_LIMIT','The retained physical observation history is full.')
 data.obstacles[input.obstacleId]={input,mapId:gs.getState().currentMapId!,at:now()};const result={success:true,obstacle:structuredClone(data.obstacles[input.obstacleId])};data.receipts[input.eventId]={command,result};return result
}
function barrierStep(path:Cell[],read:ReturnType<typeof readPhysicalBarrier>){
 const actual=read.actual;if(!actual)return-1
 if(path.length===1&&actual.boxes.some(box=>path[0].x*5>=box.minXFeet&&path[0].x*5<=box.maxXFeet&&path[0].y*5>=box.minYFeet&&path[0].y*5<=box.maxYFeet))return 0
 if(actual.edge)return path.findIndex((cell,i)=>i>0&&(same(path[i-1],actual.edge!.from)&&same(cell,actual.edge!.to)||same(path[i-1],actual.edge!.to)&&same(cell,actual.edge!.from)))
 return path.findIndex((cell,i)=>i>0&&actual.boxes.some(box=>cell.x*5>=box.minXFeet&&cell.x*5<=box.maxXFeet&&cell.y*5>=box.minYFeet&&cell.y*5<=box.maxYFeet))
}
export function startActualJump(raw:unknown){
 if(chaseParticipant(gs.getState(),'player'))fail('CHASE_MOVEMENT_MODE_UNREPRESENTED','Explicitly stop this first ground-map chase before unsupported flight, climbing, swimming or jump movement; no position/cost is committed.')
 const input=JumpInputSchema.parse(raw),command=JSON.stringify(input),prior=jumpingStateOf(gs.getState())?.jumps[input.eventId]
 if(prior){if(prior.command!==command)fail('JUMP_EVENT_CONFLICT','This jump ID retains another exact request.');if(prior.result)return toolkitResult({...prior.result,replayed:true});return toolkitResult({eventId:input.eventId,status:prior.status,pendingReaction:hero().pending??null,continuationRequired:true})}
 available();if(actualLocomotionLocation(gs.getState(),'player'))fail('LOCOMOTION_JUMP_TAKEOFF_REQUIRED','The actual swimming/suspended body has no established standing takeoff. Reach a real support before this supported Jumping procedure.');const state=gs.getState(),p=gs.getPlayer()
 if(activePhysicalLoad(state)||heldGrappleTargets(state,'player').length)fail('PHYSICAL_VERTICAL_TRANSPORT_UNSUPPORTED','Release the exact held body/load before this unsupported paired jump; no payload is left behind.')
 if(pendingDoorAmbush(state))fail('AMBUSH_RESOLUTION_REQUIRED','Resolve the actual prepared doorway ambush before a jump.')
 if(p.conditions.includes('prone'))fail('JUMP_STANDING_REQUIRED','Stand through the real movement procedure before a jump; crawling is not a free running start.')
 let speed:number;try{speed=navigationActor(state,'player').speed}catch(e){if(e instanceof NavigationError)fail(e.code,e.message);throw e}
 if(speed!<=0)fail('ACTOR_IMMOBILE','No effective movement speed is available.')
 if(state.phase==='combat')rules.validateFreeCombatAction('player')
 const from={...p.position},context=entityVerticalContext(state,'player')
 if(context.airborne||!context.known)fail('JUMP_TAKEOFF_SUPPORT_REQUIRED','The actor needs a known actual grounded takeoff support, not an airborne observation or inferred floor.')
 const fromZ=context.zFeet!,takeoff=supportFor(from,input.takeoffSurfaceId??context.surfaceId,fromZ),landing=supportFor(input.toCell,input.landingSurfaceId,fromZ),toZ=landing?.elevationFeet??fromZ
 const running=actualRunningStart(state),mod=Math.floor((p.stats.str-10)/2),maximum=input.kind==='long'?(running?p.stats.str+(feature('remarkable_athlete')?mod:0):p.stats.str/2):Math.max(0,3+mod)*(running?1:.5)
 const path=directPath(from,input.toCell),initial=navigationDiagonalsUsed(state,'player');let diagonals=initial
 const steps=path.slice(1).map((cell,i)=>{const diagonal=isDiagonalStep(path[i],cell),feet=diagonal&&diagonals%2?10:5;diagonals+=Number(diagonal);return feet}),horizontal=steps.reduce((a,b)=>a+b,0)
 if(input.kind==='long'&&horizontal===0)fail('JUMP_DISTANCE_REQUIRED','Choose an actual nonzero horizontal long jump; a high jump has its own procedure.')
 if(input.kind==='long'&&horizontal>maximum)fail('JUMP_DISTANCE_EXCEEDED',`The printed ${running?'running':'standing'} long-jump limit is ${maximum} feet.`)
 if(input.kind==='high'&&input.heightFeet===undefined)fail('JUMP_HEIGHT_REQUIRED','Choose the actual high-jump height explicitly.')
 if(input.kind==='long'&&input.heightFeet!==undefined)fail('JUMP_HEIGHT_ARGUMENT_MISMATCH','heightFeet selects the real high jump; a long jump needs its actual horizontal distance and separate explicit compound trajectory when relief matters.')
 const high=input.heightFeet??0,higher=input.higherJump
 if(input.kind==='long'&&higher)fail('JUMP_HIGHER_CHECK_MISMATCH','The optional higher-jump circumstance belongs to a real high jump, not an increased long-jump distance.')
 if(input.kind==='high'&&high>maximum&&(!higher||high>higher.allowedHeightFeet||higher.failureHeightFeet>maximum))fail('JUMP_DISTANCE_EXCEEDED',`The ordinary high-jump limit is ${maximum} feet; a genuinely adjudicated higher circumstance needs its explicit Athletics DC and outcomes.`)
 if(input.kind==='high'&&toZ-fromZ>high)fail('JUMP_LEDGE_TOO_HIGH','The actual landing ledge exceeds this jump height.')
 if(input.kind==='long'&&toZ!==fromZ||input.kind==='high'&&horizontal>0){
  if(!input.combinedTrajectory||!input.clearanceConfirmed||!landing)fail('JUMP_COMBINED_TRAJECTORY_REQUIRED','A real horizontal/vertical ledge route needs its measured landing, clearance and explicit one-leap MJ trajectory/cost adjudication; the PHB provides separate ordinary jump formulas.')
  if(input.combinedTrajectory.apexHeightFeet<Math.max(0,toZ-fromZ)||input.combinedTrajectory.apexHeightFeet>(input.kind==='high'?high:Math.max(0,3+mod)*(running?1:.5)))fail('JUMP_TRAJECTORY_HEIGHT_INVALID','The adjudicated apex must reach the ledge and stay within the real available high-jump limit.')
 }
 const total=input.combinedTrajectory?.totalFeet??(input.kind==='high'?high:horizontal)
 if(total<horizontal+Math.max(0,toZ-fromZ)||input.kind==='high'&&total<high)fail('JUMP_TRAJECTORY_COST_INVALID','The actual combined movement cannot cost less than its established horizontal path plus real ascent, or the chosen jump height.')
 if(state.phase==='combat'&&total>speed!-(state.movementUsed.player??0)*5)fail('MOVEMENT_EXCEEDED','The complete real jump exceeds remaining effective movement; no partial leap, die or cost was committed.')
 const geometry=engineGeometry(),projection=structuredClone(state),projectedGeometry=geometry?structuredClone(geometry):undefined,plans:Jump['obstaclePlans']=[],clearances:VerticalBarrierReference[]=[]
 const obstacleIds=new Set(input.obstacleIds)
 if(obstacleIds.size!==input.obstacleIds.length)fail('JUMP_OBSTACLE_DUPLICATE','Each exact physical obstacle appears once.')
 for(const id of obstacleIds){
  const profile=jumpingStateOf(state)?.obstacles[id],read=profile?readPhysicalBarrier(state,profile.input.barrierId):undefined
  if(!profile||profile.mapId!==state.currentMapId||!read)fail('JUMP_OBSTACLE_REQUIRED','Choose a real already observed low-obstacle profile of this map.')
  if(read!.issue)fail(read!.issue.code,read!.issue.message)
  const step=barrierStep(path,read!),height=read!.barrier!.topZFeet-fromZ
  if(!read!.active||step<1||height<0||height>horizontal/4||read!.barrier!.bottomZFeet>fromZ||input.kind!=='long')fail('JUMP_LOW_OBSTACLE_LIMIT','The actual crossed obstacle must be no higher than one-quarter of this real long-jump distance; no extra jump height is invented.')
  const collision=jumpingStateOf(state)!.surfaces[profile!.input.collisionSurfaceId]
  if(!collision?.cells.some(cell=>same(cell,path[step-1]))||collision.elevationFeet!==fromZ)fail('JUMP_COLLISION_SUPPORT_REQUIRED','A failed obstacle check must have its real immediately preceding collision/landing support at the takeoff elevation before any die or movement.')
  preflightLanding(path[step-1],collision.surfaceId)
  plans.push({id,step,collisionSurfaceId:collision.surfaceId})
  clearances.push(read!.barrier!.reference)
 }
 for(const read of activePhysicalBarriers(state)){
  const step=barrierStep(path,read);if(step<0)continue
  if(read.issue)fail(read.issue.code,read.issue.message)
  if(read.active&&!input.obstacleIds.some(id=>jumpingStateOf(state)?.obstacles[id]?.input.barrierId===read.barrier!.id)&&read.barrier!.bottomZFeet>fromZ){
   const extent=bodyPhysicalHeight(state,'player');if(extent===null)fail('JUMP_BODY_HEIGHT_REQUIRED','This real overhead barrier makes the actual measured body extent necessary; no anatomy is guessed.')
   const peak=input.kind==='high'?high:input.combinedTrajectory?.apexHeightFeet
   if(peak===undefined)fail('JUMP_CLEARANCE_REQUIRED','This overhead physical barrier makes the actual jump trajectory height decisive; the ordinary height-irrelevant long-jump assumption cannot decide it.')
   if(fromZ+peak+extent!>read.barrier!.bottomZFeet)fail('JUMP_CEILING_BLOCKED','The actual jump/body extent intersects the measured overhead barrier.')
  }
 }
 const grid=navigationGrid(projection,'player',projectedGeometry,{jumpClearance:clearances})
 for(let i=1;i<path.length;i++){
  if(!grid.step(path[i-1],path[i]))fail('JUMP_PATH_BLOCKED','The exact direct leap crosses a real unresolved blocker, wall, threshold, occupied square or corner; no walking detour is substituted.')
  const room=getAdventureMap(state).rooms.find(room=>room.id===inferRoomIdOnMap(path[i],state.currentMapId,state))
  if(room?.navigationEvent&&!state.roomsVisited.includes(room.id)&&!input.acknowledgeEventIds.includes(room.navigationEvent.id))fail('JUMP_EVENT_ACKNOWLEDGEMENT_REQUIRED','Explicitly acknowledge this actual authored room decision before committing an indivisible leap.')
 }
 for(const effect of state.monsterEffects??[]){const enemy=gs.getEntity(effect.sourceId);if(effect.targetId==='player'&&effect.conditions.includes('frightened')&&enemy&&p.conditions.includes('frightened')&&path.some(cell=>Math.max(Math.abs(cell.x-enemy.position.x),Math.abs(cell.y-enemy.position.y))<Math.max(Math.abs(from.x-enemy.position.x),Math.abs(from.y-enemy.position.y))))fail('FRIGHTENED_APPROACH_FORBIDDEN','This actual leap willingly approaches the real fear source.')}
 const heightMatters=input.kind==='high'||toZ!==fromZ
 if(state.phase==='combat'&&!hero().effects.some(effect=>effect.kind==='disengage'&&effect.targetIds.includes('player')&&effect.expiresAt>now())){
  for(const enemy of Object.values(state.monsters).filter(enemy=>enemy.hostile!==false&&enemy.hp.current>0&&reactionAvailable(enemy.id))){
   const departure=path.slice(1).some((cell,index)=>opportunityBoundary(enemy,'player',path[index],cell))
   if(departure){const geometryIssue=physicalHeightCombatIssue(state,[enemy.id,'player']);if(geometryIssue)fail(geometryIssue.code,geometryIssue.message);if(heightMatters)fail('JUMP_OPPORTUNITY_HEIGHT_REQUIRED','This actual compound/vertical leap would cross a real hostile melee departure edge. Its3D opportunity trajectory is not represented; establish that source procedure before takeoff, costs or any optional jump check.')}
   if(!heightMatters)continue
   const enemyZ=entityVerticalContext(state,enemy.id),peak=input.kind==='high'?high:input.combinedTrajectory?.apexHeightFeet??0
   for(const action of monsterSource(enemy)?.actions??[]){if(action.attack_bonus===undefined)continue;const profile=attackProfile(enemy,action.name);if(!profile.melee)continue;const near=Math.max(Math.abs(from.x-enemy.position.x),Math.abs(from.y-enemy.position.y))<=profile.rangeCells;if(near&&(!enemyZ.known||Math.max(Math.abs(fromZ-enemyZ.zFeet!),Math.abs(fromZ+peak-enemyZ.zFeet!))>profile.rangeCells*5))fail('JUMP_OPPORTUNITY_HEIGHT_REQUIRED','The real leap may leave an actual native melee reach vertically. This source boundary needs its represented3D opportunity procedure before a die, takeoff or cost; no reaction is skipped.')}
  }
 }
 if(hero().effects.some(effect=>effect.kind==='guardian-of-faith'&&effect.expiresAt>now()&&effect.data.mapId===state.currentMapId&&path.some(cell=>{const point=effect.data.cell as Cell;return Math.min(...[0,1].flatMap(x=>[0,1].map(y=>Math.max(Math.abs(cell.x-point.x-x),Math.abs(cell.y-point.y-y)))))<=2})))fail('JUMP_GUARDIAN_TRAJECTORY_REQUIRED','This actual jump approaches an active Guardian of Faith volume. Its real airborne trajectory/3D entry is not represented; no height or source damage is silently flattened, and no jump cost or die was spent.')
 preflightLanding(input.toCell,landing?.surfaceId)
 if(input.kind==='high'&&higher)preflightLanding(from,takeoff?.surfaceId)
 if(Object.keys(jumpingStateOf(state)?.jumps??{}).length>=512||Object.keys(jumpingStateOf(state)?.receipts??{}).length>=2048)fail('VERTICAL_HISTORY_LIMIT','The retained physical jump history is full.')
 const stepFeet=steps.map(value=>value*total/(horizontal||1));if(!horizontal)stepFeet.push(total);else stepFeet[stepFeet.length-1]=total-stepFeet.slice(0,-1).reduce((sum,feet)=>sum+feet,0)
 const jump:Jump={input,command,mapId:state.currentMapId!,from,path,cursor:0,stepFeet,obstaclePlans:plans.sort((a,b)=>a.step-b.step),fromElevationFeet:fromZ,toElevationFeet:toZ,maximumFeet:maximum,running,totalFeet:total,spentFeet:0,initialDiagonals:initial,turnCounter:state.turnCounter??0,at:now(),status:'moving',obstacleChecks:[],nextObstacle:0,heightMatters:input.kind==='high'||toZ!==fromZ,landingDifficult:activeMapTerrain(state).some(terrain=>terrain.kind==='difficult'&&terrain.cells.some(cell=>same(cell,input.toCell)))}
 verticalData().jumps[input.eventId]=jump;verticalData().activeJumpId=input.eventId;clearActualFootwork()
 if(input.kind==='high'&&high>maximum)return check(jump,'higher_check',higher!.dc)
 return resumeActualJump(input.eventId)
}
function finishTrajectory(jump:Jump,surfaceId:string|undefined,attack?:unknown){
 const peak=jump.input.kind==='high'?jump.input.heightFeet:jump.input.combinedTrajectory?.apexHeightFeet
 const descent=peak===undefined?0:peak-(jump.toElevationFeet-jump.fromElevationFeet)
 if(descent>=10){jump.fallHeightFeet=descent;jump.fallSupportSurfaceId=surfaceId;return fallRequired(jump)}
 return land(jump,surfaceId,{attack})
}
export function resumeActualJump(id:string,ignored:string[]=[],attack?:unknown):ReturnType<typeof toolkitResult>{
 const jump=retained(id);if(jump.result)return toolkitResult({...jump.result,replayed:true})
 if(hero().pending)fail('REACTION_PENDING','Resolve the exact held reaction/check before continuing this leap.')
 if(jump.status==='ground_contact'){if(pendingGroundGearContacts(gs.getState()).length)fail('GROUND_GEAR_CONTACT_DUE','Resolve all real landing contacts before finishing this same jump.');return finishActualLanding(jump,{groundContactResolved:true,attack})}
 if(jump.status==='fall_required')return toolkitResult({eventId:id,fallRequired:true})
 if(jump.status==='landing_check')fail('JUMP_LANDING_CHECK_REQUIRED','The actual landing check must retain its one original held die.')
 const player=gs.getPlayer()
 if(jump.mapId!==gs.getState().currentMapId||jump.turnCounter!==(gs.getState().turnCounter??0)||!same(player.position,jump.path[jump.cursor]))fail('JUMP_PHYSICAL_CURSOR_CHANGED','Retain the exact actual source map, turn and current airborne path cell; no jump is resumed after a teleport or new turn.')
 preflightLanding(jump.input.toCell,jump.input.landingSurfaceId)
 const clearances:VerticalBarrierReference[]=[]
 for(const plan of jump.obstaclePlans){const profile=verticalData().obstacles[plan.id],read=readPhysicalBarrier(gs.getState(),profile.input.barrierId);if(read.issue)fail(read.issue.code,read.issue.message);clearances.push(read.barrier!.reference)}
 const grid=navigationGrid(gs.getState(),'player',engineGeometry(),{jumpClearance:clearances});for(let i=jump.cursor+1;i<jump.path.length;i++)if(!grid.step(jump.path[i-1],jump.path[i]))fail('JUMP_PATH_CHANGED','The original exact remaining direct leap is now blocked; no substituted detour, die or free landing is allowed.')
 if(player.hp.current<=0||player.conditions.some(condition=>['prone','unconscious','paralyzed','restrained','grappled','stunned','incapacitated','petrified'].includes(condition)))return jump.cursor>0?fallRequired(jump):finish(jump,{success:false,stopReason:'actor_unavailable_before_takeoff',attack})
 jump.status='moving'
 if(jump.path.length===1){spend(jump,jump.totalFeet-jump.spentFeet);return finishTrajectory(jump,jump.input.landingSurfaceId??jumpingStateOf(gs.getState())?.supports.player?.surfaceId,attack)}
 while(jump.cursor<jump.path.length-1){
  const nextIndex=jump.cursor+1,obstacle=jump.obstaclePlans[jump.nextObstacle]
  if(obstacle?.step===nextIndex){const profile=verticalData().obstacles[obstacle.id];if(profile.input.athleticsCheckRequired)return check(jump,'obstacle_check',10);jump.obstacleChecks.push({obstacleId:obstacle.id,checkRequired:false,cleared:true});jump.nextObstacle++}
  const from=jump.path[jump.cursor],to=jump.path[nextIndex]
  if(beforeHeroStep('player',from,to,{kind:'cell',cell:jump.input.toCell},false,jump.input.acknowledgeEventIds,ignored,false,undefined,'walk',id)){jump.status='opportunity';return toolkitResult({eventId:id,pendingReaction:hero().pending,costFeet:jump.spentFeet,attack})}
  jump.cursor=nextIndex;gs.moveToken('player',to.x,to.y,{airborneJump:true});spend(jump,jump.stepFeet[nextIndex-1],isDiagonalStep(from,to));afterHeroStep('player')
  if(player.hp.current<=0||player.conditions.some(condition=>['prone','unconscious','paralyzed','grappled','restrained','stunned','incapacitated','petrified'].includes(condition)))return fallRequired(jump)
 }
 return finishTrajectory(jump,jump.input.landingSurfaceId??supportFor(jump.input.toCell,undefined,jump.toElevationFeet)?.surfaceId,attack)
}
export function continueActualJump(input:{jumpId:string}){const jump=retained(input.jumpId);if(jump.status==='opportunity'&&hero().pending)return toolkitResult({pendingReaction:hero().pending,eventId:input.jumpId});return resumeActualJump(input.jumpId)}
export function registerActualJumpResolutions(){registerCheckedResolution('actual-jump-check',(command,checked)=>{
 const jump=retained(String(command.jumpId));if(jump.result||jump.status!==command.stage||command.obstacleIndex!==jump.nextObstacle)fail('JUMP_CHECK_CONTEXT_CHANGED','The one actual jump/check cursor no longer matches its original continuation.')
 const success=Boolean(checked.success)
 if(command.stage==='landing_check'){if(!success)gs.applyCondition('player','prone');return finish(jump,{...jump.landingContext,landingCheck:checked,landedProne:gs.getPlayer().conditions.includes('prone')})}
 if(command.stage==='higher_check'){
  jump.obstacleChecks.push({kind:'higher_jump',check:checked});if(!success){spend(jump,Math.min(jump.totalFeet,jump.input.higherJump!.failureHeightFeet));return land(jump,jumpingStateOf(gs.getState())?.supports.player?.surfaceId,{success:false,higherJumpCheck:checked,actualHeightFeet:jump.input.higherJump!.failureHeightFeet})}
 }else{
  const obstacle=jump.obstaclePlans[jump.nextObstacle];jump.obstacleChecks.push({obstacleId:obstacle.id,check:checked,cleared:success});jump.nextObstacle++
  if(!success){jump.landingDifficult=false;return land(jump,obstacle.collisionSurfaceId,{success:false,stopReason:'hit_low_obstacle',hitObstacleId:obstacle.id})}
 }
 return resumeActualJump(jump.input.eventId)
})}
export function completeActualJumpFall(input:{eventId:string;jumpId:string;landingSurfaceId:string;distanceFeet:number;actualCompletedFallConfirmed:true;source:string}){
 const jump=retained(input.jumpId),command=JSON.stringify(input),old=verticalData().receipts[input.eventId]
 if(old){if(old.command!==command)fail('VERTICAL_EVENT_CONFLICT','This retained fall completion has another exact definition.');return toolkitResult({...jump.result??old.result,replayed:true})}
 if(jump.status!=='fall_required'||hero().pending)fail('JUMP_FALL_NOT_DUE','Only the exact interrupted actual airborne jump may complete its real measured fall.')
 const surface=supportFor(gs.getPlayer().position,input.landingSurfaceId,jump.fromElevationFeet)
 if(!surface||input.distanceFeet<0||jump.fallHeightFeet!==undefined&&jump.fallHeightFeet!==input.distanceFeet)fail('JUMP_FALL_DISTANCE_CONFLICT','The completed real fall must agree with its actual measured landing surface and retained height.')
 preflightLanding(gs.getPlayer().position,surface.surfaceId)
 const fall=resolveFall({eventId:input.eventId,entityId:'player',distanceFeet:input.distanceFeet,reason:input.source},input.jumpId)
 const resolved=land(jump,surface.surfaceId,{success:false,stopReason:'actual_interrupted_fall',fall})
 const result=JSON.parse(resolved.content[0].text) as Record<string,unknown>;verticalData().receipts[input.eventId]={command,result};return resolved
}
