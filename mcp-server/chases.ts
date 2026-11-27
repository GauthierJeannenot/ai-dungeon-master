import { hasPersistedConditionProvider } from './persisted-conditions'
import { readWildernessChaseSource } from './rules-library'
import { randomUUID } from 'node:crypto'
import { getMapSpec, inferRoomIdOnMap } from '../lib/adventure-map'
import { navigationGrid } from '../lib/navigation'
import { entityVerticalContext } from '../lib/jumping-state'
import { swallowedBy } from '../lib/swallow-state'
import { getMonsterRecord } from '../lib/srd/monsters'
import { OBJECT_MATERIAL_AC } from '../lib/object-damage-state'
import { exhaustionLevel } from '../lib/exhaustion'
import { ChaseStateSchema, BeginChaseSchema, ChaseDashSchema, ChaseTurnSchema, QualifyChaseComplicationSchema, ResolveChaseComplicationSchema, ResolveChaseEscapeSchema, StopChaseSchema, activeChase, chaseStateOf, chaseParticipant, chaseTurnKey, chaseTurnIssue, chaseFatigue,chaseWitness,chaseActionIssue,activeChaseGuard,chaseDashAdmissionIssue,chaseWardSequenceIssue, type ChaseState, type ChaseEpisode, type ChaseTurn } from '../lib/chase-state'
import { CHASE_SOURCE, URBAN_CHASE_COMPLICATIONS, chaseFreeDashThreshold,chaseExcessDashCount, urbanChaseComplication, wildernessChaseComplication } from '../lib/chase-source'
import type { AbilityCheckResult, SavingThrowResult, DiceRollResult, DamageType } from '../lib/types'
import * as gs from './game-state'
import * as rules from './rules'
import { available, assertHero, hero, now, addHeroEffect, removeHeroEffect, alive, distance } from './hero-rules'
import { checkedResolution, savedResolution, registerCheckedResolution } from './toolkit-checks'
import { toolkitState, toolkitError, toolkitResult, toolkitLocation } from './toolkit'
import { engineGeometry } from './navigation'
import { rollDice, getAbilityModifier } from './dice'
import { passivePerceptionScore, canSee } from './monster-perception'
import { dealDamage, dealDamageComponents, conditionImmune } from './monster-rules'
import { changeExhaustion } from './exhaustion'

const plain=chaseWitness
function data():ChaseState{return (toolkitState() as ReturnType<typeof toolkitState>&{chases?:ChaseState}).chases??=(( {episodes:{},receipts:{},fatigue:{},guardRoles:{},restRulings:{}} ))}
function body(id:string){const b=gs.getEntity(id);if(!b)toolkitError('CHASE_BODY_REQUIRED','Choose an actual existing current-map creature.');return b!}
function living(id:string){const b=body(id);if(!alive(b)||id!=='player'&&gs.getMonster(id)?.controller==='reactive_npc')toolkitError('CHASE_PARTICIPANT_UNAVAILABLE','First tranche requires capable existing player/manual creatures; no reactive controller activation is invented.');return b}
function ground(id:string){const p=entityVerticalContext(gs.getState(),id);if(!p.known||p.zFeet!==0||swallowedBy(gs.getState(),id)||gs.getState().dmTools?.jumping?.activeJumpId)toolkitError('CHASE_GROUND_REPRESENTATION_REQUIRED','This first urban chase requires actual exterior supported coplanar ground on the current map. No flying/interior/unknown support is projected into a road.');return p}
function episode(id:string){const e=data().episodes[id];if(!e||e.status!=='active'||data().activeId!==id)toolkitError('CHASE_ACTIVE_REQUIRED','Choose the actual still-active chase.');return e!}
function receipt(eventId:string,operation:string,input:unknown){const command=plain({operation,input}),old=chaseStateOf(gs.getState())?.receipts[eventId];if(old){if(old.command!==command)toolkitError('CHASE_EVENT_CONFLICT','Retain this event id and its exact original structured command.');return{command,old:structuredClone(old.result)}}return{command}}
function store(eventId:string,command:string,result:Record<string,unknown>){if(Object.keys(data().receipts).length>=4096)toolkitError('CHASE_RECEIPT_LIMIT','Chase receipt history is full; no held result or source receipt is evicted.');data().receipts[eventId]={command,result:structuredClone(result),at:now()};return result}
function room(){if(Object.keys(data().receipts).length>=4080)toolkitError('CHASE_RECEIPT_LIMIT','Preserve enough real receipt capacity before another chase event or die.');}
function pending(){if(gs.getState().hero?.pending)toolkitError('REACTION_PENDING','Finish the held original die/reaction before another chase choice.');}
function context(){assertHero();pending();available({allowChaseEvent:true});room()}
function participants(e:ChaseEpisode){return Object.values(e.participants).filter(p=>p.status==='active'&&Boolean(gs.getEntity(p.id)?.hp.current)&&exhaustionLevel(gs.getState(),p.id)<5)}
function nextParticipant(e:ChaseEpisode,actorId:string){const order=gs.getState().initiativeOrder,index=order.indexOf(actorId);return [...order.slice(index+1),...order.slice(0,index+1)].find(id=>e.participants[id]?.status==='active'&&id!==actorId)}
function endIfOneSide(e:ChaseEpisode){for(const p of Object.values(e.participants).filter(p=>p.status==='active')){const actual=gs.getEntity(p.id);if(!actual||actual.hp.current<=0)p.status='incapable';else if(exhaustionLevel(gs.getState(),p.id)>=5)p.status='exhausted'}const active=participants(e);if(!active.some(p=>p.role==='quarry')||!active.some(p=>p.role==='pursuer')){e.status='ended';e.endedReason='One side explicitly stopped, escaped, became incapable or reached exhaustion5.';delete data().activeId;for(const t of Object.values(e.turns))if(t.d20===9&&!t.guardTriggered)t.effectExpired=true}}
function turn(id:string,chaseId:string){const e=episode(chaseId),t=e.turns[id];if(!t)toolkitError('CHASE_TURN_EVENT_REQUIRED','Choose the exact already rolled source turn-event id.');return{e,t:t!}}
function actualFact(id:string){const fact=gs.getState().worldFacts?.find(f=>f.id===id&&f.mapId===gs.getState().currentMapId&&(!f.roomId||f.roomId===gs.getState().currentRoomId));if(!fact)toolkitError('CHASE_PHYSICAL_FACT_REQUIRED','Record/select the actual current-map fact via record_scene_fact; no narrative text is parsed to produce geometry or an actor.');return structuredClone(fact!)}
function complication(e:ChaseEpisode,d20:number){return e.input.table==='wilderness'?wildernessChaseComplication(d20):urbanChaseComplication(d20)}
function resultTurn(e:ChaseEpisode,t:ChaseTurn){return {...e.input.table==='wilderness'?{table:'wilderness',tableSource:e.tableSource,deferredRow:t.d20!==undefined&&t.d20<=10&&'deferred'in complication(e,t.d20)!}: {},chaseId:e.id,turnEventId:t.id,actorId:t.actorId,status:t.status,checks:t.checks,tableRoll:t.tableRoll??null,nextParticipantId:t.nextParticipantId??null,qualificationRequired:t.status==='qualification',source:CHASE_SOURCE}}

export function beginChase(raw:unknown){
 const input=BeginChaseSchema.parse(raw),r=receipt(input.eventId,'begin-chase',input);if(r.old)return{...r.old,replayed:true};context()
 const state=gs.getState();if(state.phase!=='combat'||!state.currentTurn)toolkitError('CHASE_INITIATIVE_REQUIRED','Explicitly enter combat with the real bodies before beginning this chase; no encounter or time is fabricated.')
 if(activeChase(state))toolkitError('CHASE_ALREADY_ACTIVE','This first tranche resolves one actual chase; split/parallel pursuits are not represented.')
 if(data().episodes[input.chaseId])toolkitError('CHASE_ID_REUSED','A retained chase id is never reused.')
 const tableSource=input.table==='wilderness'?readWildernessChaseSource():undefined
 if(input.table==='urban'&&!input.guardIds.length)toolkitError('CHASE_GUARD_PREREQUISITE_REQUIRED','The urban table requires its real pre-entry guards; wilderness does not fabricate them.')
 if(input.table==='wilderness'&&input.guardIds.length)toolkitError('CHASE_WILDERNESS_GUARD_NOT_APPLICABLE','The wilderness table cannot adopt urban guard roles or attacks.')
 const ids=[input.quarryId,...input.pursuerIds];if(new Set(ids).size!==ids.length||input.guardIds.some(id=>ids.includes(id)))toolkitError('CHASE_ROSTER_INVALID','Choose distinct actual quarry/pursuers and external guard bodies.')
 for(const id of ids){living(id);ground(id);if(exhaustionLevel(state,id)>=5)toolkitError('CHASE_SPEED_ZERO','A creature at exhaustion5 cannot enter a moving chase.');if(body(id).conditions.includes('exhaustion')&&!state.dmTools?.exhaustion?.creatures[id])toolkitError('EXHAUSTION_LEVEL_REQUIRED','Qualify actual exhaustion before adopting chase counters.')}
 for(const id of input.guardIds){const guard=living(id),record='type'in guard?getMonsterRecord(guard.type):undefined;if(!data().guardRoles[id]||!record||!state.initiativeOrder.includes(id))toolkitError('CHASE_GUARD_PREREQUISITE_REQUIRED','Before combat, explicitly qualify the actual existing body/guard role/exact held spear via qualify_chase_guard, then enroll it in initiative as an external body. No Guard MM profile or future actor is fabricated.');ground(id)}
 const absent=ids.filter(id=>!state.initiativeOrder.includes(id));gs.validateInitiativeInput(absent.length?absent:ids,input.tieOrder?{tieOrder:input.tieOrder.filter(id=>absent.includes(id))}:{})
 if(input.tieOrder?.some(id=>![...state.initiativeOrder,...absent].includes(id)))toolkitError('CHASE_INITIATIVE_TIE_INVALID','Tie choices name only actually enrolled or newly enrolling bodies.')
 if(absent.length)gs.enlistNpcCombatants(absent)
 const newInitiatives=absent.length?gs.rollInitiatives(absent,{tieOrder:input.tieOrder?.filter(id=>absent.includes(id))}):[]
 if(absent.length){
  const old=[...state.initiativeOrder],rank=[...input.tieOrder??[],...old,...absent].filter((id,i,a)=>a.indexOf(id)===i),order=[...old]
  for(const entry of newInitiatives){const at=order.findIndex(id=>body(id).initiative!<entry.initiative||body(id).initiative===entry.initiative&&rank.indexOf(entry.id)<rank.indexOf(id));order.splice(at<0?order.length:at,0,entry.id)}
  state.initiativeOrder=order // Preserve generation, current actual turn, all budgets and every old actor's relative order.
 }
 const e:ChaseEpisode={id:input.chaseId,input,command:plain(input),at:now(),mapId:getMapSpec(state.currentMapId,state).id,combatGeneration:state.combatGeneration??0,firstEscapeRound:state.round+(state.currentTurn===state.initiativeOrder[0]?0:1),status:'active',participants:Object.fromEntries(ids.map(id=>[id,{id,role:id===input.quarryId?'quarry':'pursuer',status:'active',dashIds:[],initialConstitution:body(id).stats.con}])),turns:{},escapes:{},newInitiatives:newInitiatives.map(v=>({...v})),...tableSource?{tableSource}:{},initialDistances:Object.fromEntries(input.pursuerIds.map(id=>[id,distance(body(id).position,body(input.quarryId).position)*5]))}
 data().episodes[e.id]=e;data().activeId=e.id
 return store(input.eventId,r.command,{chaseId:e.id,adopted:true,table:input.table,...tableSource?{tableSource}:{},initialDistances:e.initialDistances,newInitiatives,initiativeOrder:[...state.initiativeOrder],currentTurn:state.currentTurn,source:CHASE_SOURCE,limitation:'Single supported ground-map chase, one quarry. Real guard bodies prepared before combat. Player-only actual rest recovery; NPC fatigue remains until a real NPC rest procedure exists.'})
}
/** Sole hook for all already-implemented actual Dash effects, including combat_action. */
export function recordActualChaseDash(actorId:string,effectId:string,eventId=randomUUID()){
 const e=activeChase(gs.getState()),p=e?.participants[actorId];if(!e||!p||p.status!=='active')return
 if(gs.getState().currentTurn!==actorId)toolkitError('CHASE_DASH_TURN_REQUIRED','A chase Dash belongs to this creature actual turn.')
 if(Object.values(e.turns).some(t=>t.key===chaseTurnKey(gs.getState())))toolkitError('CHASE_TURN_ALREADY_ENDING','The end-turn source event is already chosen; no additional action or Dash is added after its retained checks.')
 room();const input={chaseId:e.id,actorId,effectId,turnKey:chaseTurnKey(gs.getState()),turnCounter:gs.getState().turnCounter??0,round:gs.getState().round},command=plain({operation:'actual-chase-dash',input});if(data().receipts[eventId])toolkitError('CHASE_DASH_ID_REUSED','A new actual Dash cannot reuse an earlier source event.')
 p.dashIds.push(eventId);store(eventId,command,{operation:'chase-dash',...input,index:p.dashIds.length,freeThreshold:chaseFreeDashThreshold(getAbilityModifier(body(actorId).stats.con))})
}
export function chaseDash(raw:unknown){const input=ChaseDashSchema.parse(raw),r=receipt(input.eventId,'chase-dash-choice',input);if(r.old)return{...r.old,replayed:true};context();const e=episode(input.chaseId);const ending=chaseActionIssue(gs.getState());if(ending)toolkitError(ending.code,ending.message);if(!chaseParticipant(gs.getState(),input.actorId)||!e.participants[input.actorId])toolkitError('CHASE_PARTICIPANT_REQUIRED','Choose an actual active enrolled chase participant.');living(input.actorId);ground(input.actorId);const admission=chaseDashAdmissionIssue(gs.getState(),input.actorId);if(admission)toolkitError(admission.code,admission.message);rules.validateActionUse(input.actorId);rules.recordAction(input.actorId);const effect=addHeroEffect('dash',input.actorId,[input.actorId],12,{untilStartOf:input.actorId});return store(input.eventId,r.command,{success:true,chaseId:e.id,actorId:input.actorId,effectId:effect.id,actionSpent:true,totalDashes:e.participants[input.actorId].dashIds.length})}
function completeTurn(e:ChaseEpisode,t:ChaseTurn){if(e.input.table==='wilderness')t.consequenceWitness=plain(t.consequence??null);t.status='complete';t.result={...resultTurn(e,t),consequence:t.consequence??null};endIfOneSide(e);return toolkitResult(t.result)}
function continueTurn(e:ChaseEpisode,t:ChaseTurn):ReturnType<typeof toolkitResult>{
 if(t.checks.length<t.checksDue&&body(t.actorId).hp.current<=0){while(t.checks.length<t.checksDue)t.checks.push({notRolled:true,reason:'Actual body no longer living after the already resolved earlier source consequence; no corpse ability check or extra exhaustion is invented.'});e.participants[t.actorId].status='incapable'}
 if(t.checks.length<t.checksDue){
  const ward=chaseWardSequenceIssue(gs.getState(),t.actorId,{checks:t.checksDue-t.checks.length});if(ward)toolkitError(ward.code,ward.message)
  t.status='checks';const index=t.checks.length
  return checkedResolution({entityId:t.actorId,ability:'con',dc:10,label:'DMG chase excess Dash Constitution check'},{domain:'chase',command:{stage:'dash-check',chaseId:e.id,turnEventId:t.id,index}})
 }
 if(e.input.table==='wilderness')readWildernessChaseSource()
 if(t.d20===undefined){const roll=rollDice('1d20');t.d20=roll.total;t.tableRoll={...roll};t.nextParticipantId=nextParticipant(e,t.actorId)}
 if(t.d20>10||!t.nextParticipantId){t.consequence={noComplication:t.d20>10,noOtherActiveParticipant:!t.nextParticipantId};endIfOneSide(e);return completeTurn(e,t)}
 t.status='qualification';return toolkitResult(resultTurn(e,t))
}
export function resolveChaseTurn(raw:unknown){const input=ChaseTurnSchema.parse(raw),r=receipt(input.eventId,'resolve-chase-turn',input);if(r.old){const e=data().episodes[input.chaseId],t=e?.turns[input.eventId];return toolkitResult(t?{...t.result??resultTurn(e,t),replayed:true}:{...r.old,replayed:true})}context();if(activeChaseGuard(gs.getState())?.t.guardTriggered)toolkitError('CHASE_GUARD_ATTACK_DUE','Resolve the actual already-triggered guard event before choosing this end-turn cursor.');const e=episode(input.chaseId),state=gs.getState(),actorId=state.currentTurn;if(!actorId||!chaseParticipant(state,actorId))toolkitError('CHASE_END_TURN_NOT_DUE','Choose this actual participating actor end-turn, not a synthetic turn.')
 const other=Object.values(e.turns).find(t=>t.key===chaseTurnKey(state));if(other)toolkitError('CHASE_END_TURN_ALREADY_CHOSEN','Continue the exact original event id; no new nonce rerolls this end-turn.')
 const p=e.participants[actorId],dashIds=p.dashIds.filter(id=>data().receipts[id].result.turnKey===chaseTurnKey(state)),threshold=chaseFreeDashThreshold(getAbilityModifier(body(actorId).stats.con)),prior=p.dashIds.length-dashIds.length,checksDue=chaseExcessDashCount(prior,dashIds.length,getAbilityModifier(body(actorId).stats.con))
 const t:ChaseTurn={id:input.eventId,key:chaseTurnKey(state),actorId,round:state.round,turnCounter:state.turnCounter??0,dashIds,constitutionAtEnd:body(actorId).stats.con,checksDue,checks:[],status:'checks'};e.turns[t.id]=t;store(input.eventId,r.command,{chaseId:e.id,turnEventId:t.id,adoptedEndTurn:true});return continueTurn(e,t)
}
export function registerChaseResolutions(){registerCheckedResolution('chase',(command,checked)=>{
 const stage=String(command.stage)
 if(stage==='escape')return finishEscape(episode(String(command.chaseId)),command,checked as AbilityCheckResult)
 const {e,t}=turn(String(command.turnEventId),String(command.chaseId))
 if(t.key!==chaseTurnKey(gs.getState()))toolkitError('CHASE_HELD_TURN_CHANGED','The original chase turn remains authoritative through its held die.')
 if(stage==='dash-check'){
  if(command.index!==t.checks.length||t.checks.length>=t.checksDue)toolkitError('CHASE_HELD_CHECK_CHANGED','Retain the exact original excess-Dash check index.')
  t.checks.push(structuredClone(checked) as unknown as Record<string,unknown>)
  if(!checked.success&&!conditionImmune(body(t.actorId),'exhaustion'))changeExhaustion({eventId:`\u0000chase:${t.id}:${t.checks.length}`,targetId:t.actorId,operation:'add',levels:1,reason:'DMG2014 chase: failed excess-Dash Constitution ability check.'},{chaseSourceId:e.id})
  if(exhaustionLevel(gs.getState(),t.actorId)>=5)e.participants[t.actorId].status='exhausted'
  return continueTurn(e,t)
 }
 if(stage==='complication')return finishComplication(e,t,checked)
 toolkitError('CHASE_CHECK_STAGE_INVALID','Retain the exact original source check stage.')
})}
function qualificationWitness(t:ChaseTurn){const q=t.qualification!;return plain({fact:actualFact(q.factId),target:body(t.nextParticipantId!),position:body(t.nextParticipantId!).position,barrier:q.barrier?gs.getState().dmTools?.objects[q.barrier.objectId]:undefined,guard:q.guardId?body(q.guardId):undefined})}
export function qualifyChaseComplication(raw:unknown){
 const input=QualifyChaseComplicationSchema.parse(raw),r=receipt(input.eventId,'qualify-chase-complication',input);if(r.old)return{...r.old,replayed:true};context();const {e,t}=turn(input.turnEventId,input.chaseId)
 if(t.status!=='qualification'||t.d20===undefined||t.d20>10)toolkitError('CHASE_QUALIFICATION_NOT_DUE','Only the already rolled official complication may be physically qualified.')
 if(t.qualification)toolkitError('CHASE_QUALIFICATION_RETAINED','This complication already retains its exact selected geometry/source; no replacement erases its result.')
 const affected=body(t.nextParticipantId!);ground(affected.id);actualFact(input.factId)
 if(input.path[0].x!==affected.position.x||input.path[0].y!==affected.position.y)toolkitError('CHASE_ROUTE_START_REQUIRED','Choose a path from the affected body actual current position, never a fabricated approach.')
 for(const cell of input.path)toolkitLocation(cell)
 const grid=navigationGrid(gs.getState(),affected.id,engineGeometry())
 for(let i=1;i<input.path.length;i++)if(!grid.step(input.path[i-1],input.path[i]))toolkitError('CHASE_ROUTE_INVALID','The explicitly chosen actual route cannot cross an existing wall, closed door or occupied cell.')
 const entry=complication(e,t.d20)!
 if('deferred'in entry)toolkitError('CHASE_WILDERNESS_ROW_DEFERRED','The actual official wilderness result remains retained. This row requires a separately represented swarm, landing, net, razorvine avoidance or new pursuer; no actor, destination, cost or replacement roll is invented.')
 if('failureTerrainFeet'in entry&&input.path.length<entry.failureTerrainFeet/5+1)toolkitError('CHASE_TERRAIN_GEOMETRY_REQUIRED','Supply enough actual forward route cells for the printed difficult-terrain length.')
 if('choices'in entry&&(!input.choice||!(entry.choices as readonly string[]).includes(input.choice)))toolkitError('CHASE_CHECK_CHOICE_REQUIRED','Explicitly choose one skill/ability printed in this exact official row.')
 if(!('choices'in entry)&&input.choice)toolkitError('CHASE_CHECK_CHOICE_NOT_APPLICABLE','This printed row does not select a skill/ability alternative.')
 if(e.input.table==='wilderness'){
  const fact=actualFact(input.factId),cell=fact.narrativeEffect?.cell
  if(!cell||!input.path.some(step=>step.x===cell.x&&step.y===cell.y))toolkitError('CHASE_WILDERNESS_EVENT_LOCATION_REQUIRED','The actual environmental observation must be anchored on this selected physical route.')
  if(new Set(input.path.map(cell=>`${cell.x},${cell.y}`)).size!==input.path.length||input.path.some((cell,i)=>i>0&&Math.abs(cell.x-input.path[i-1].x)+Math.abs(cell.y-input.path[i-1].y)!==1))toolkitError('CHASE_WILDERNESS_ROUTE_MEASURE_REQUIRED','This first wilderness tranche needs a simple cardinal route with exact five-foot steps, no repeated cells or diagonal length guessed as five feet.')
  if(t.d20===5&&affected.conditions.includes('blinded')&&!hasPersistedConditionProvider(affected.id,'blinded'))toolkitError('CHASE_BLINDNESS_HISTORY_REQUIRED','Retain or qualify the real pre-existing blindness source before adding another end-of-turn provider; no unrelated condition is erased.')
  const allowed=({1:['brush'],2:['uneven-ground'],4:['stream','ravine','rock-bed'],5:['blowing-particles'],8:['stampede']} as Record<number,string[]>)[t.d20]
  if(!input.wilderness||!allowed?.includes(input.wilderness.kind))toolkitError('CHASE_WILDERNESS_PHYSICAL_EVENT_REQUIRED','Explicitly qualify the actual printed environmental event on this real selected route.')
  if(input.coin||input.guardId||input.barrier)toolkitError('CHASE_URBAN_ARGUMENT_NOT_APPLICABLE','A wilderness result does not select a beggar coin, urban guard or new glass barrier.')
 }else if(input.wilderness)toolkitError('CHASE_WILDERNESS_ARGUMENT_NOT_APPLICABLE','This actual episode selected the urban table.')
 if(input.coin&&(e.input.table!=='urban'||t.d20!==8))toolkitError('CHASE_COIN_NOT_APPLICABLE','A real selected coin bypass applies only to the beggar row.')
 if(e.input.table==='urban'&&t.d20===9){if(!input.guardId||!e.input.guardIds.includes(input.guardId))toolkitError('CHASE_GUARD_PREREQUISITE_REQUIRED','Select one exact actual external guard prepared before entry.');ground(input.guardId);if(input.path.length<2)toolkitError('CHASE_GUARD_ROUTE_REQUIRED','Choose the actual intended route; the guard attacks only after actual movement reaches20ft.')}
 else if(input.guardId)toolkitError('CHASE_GUARD_NOT_APPLICABLE','Only the guard row selects a real external guard.')
 if(e.input.table==='urban'&&t.d20===3){
  if(!input.barrier||input.path.length<2||input.path[1].x!==input.barrier.cell.x||input.path[1].y!==input.barrier.cell.y)toolkitError('CHASE_GLASS_BARRIER_REQUIRED','Explicitly qualify the actual glass barrier id/size/cell on the selected route. This first producer does not invent other material statistics.')
  const b=input.barrier!;if(gs.getState().dmTools?.objects[b.objectId])toolkitError('CHASE_BARRIER_ID_CONFLICT','This explicit new physical barrier cannot overwrite an existing object.');const loc=toolkitLocation(b.cell),hp=({small:3,medium:4,large:5}as const)[b.size]
  const span=b.size==='large'?2:1,state=gs.getState(),footprintGrid=navigationGrid(state,affected.id,engineGeometry(),{ignoreActorEffects:true}),physicalBodies=[state.player,...Object.values(state.monsters),...Object.values(state.npcs??{}).filter(npc=>npc.mapId===state.currentMapId)]
  const footprint=(x:number,y:number)=>({x:b.cell.x+x,y:b.cell.y+y})
  // navigationGrid excludes its own affected actor from occupied: keep that
  // actual body explicitly, and preflight EVERY cell before checking edges.
  for(let y=0;y<span;y++)for(let x=0;x<span;x++){
   const cell=footprint(x,y);toolkitLocation(cell)
   if(!footprintGrid.free(cell)||physicalBodies.some(body=>body.position.x===cell.x&&body.position.y===cell.y))toolkitError('CHASE_BARRIER_FOOTPRINT_INVALID','Every actual barrier footprint cell must be clear of map obstacles and all current physical bodies, including the affected actor; no object, receipt or source die changes.')
  }
  for(let y=0;y<span;y++)for(let x=0;x<span;x++){
   const cell=footprint(x,y)
   if(x&&!footprintGrid.step(footprint(x-1,y),cell,false,false)||y&&!footprintGrid.step(footprint(x,y-1),cell,false,false))toolkitError('CHASE_BARRIER_FOOTPRINT_INVALID','The whole measured barrier cannot straddle an actual wall/closed door or unrepresented internal edge; no source event is replaced.')
  }
  toolkitState().objects[b.objectId]={id:b.objectId,name:b.name,description:b.description,...loc,cell:b.cell,kind:'obstacle',blocksSight:!b.transparent,material:'glass',size:b.size,resilience:'fragile',ac:OBJECT_MATERIAL_AC.glass,hp:{current:hp,max:hp},state:'intact',locked:false,creation:plain({source:'dmg-urban-chase-3',chaseId:e.id,turnEventId:t.id,input:b,fact:actualFact(input.factId)}),contents:[],contentsReleased:false}
 }else if(input.barrier)toolkitError('CHASE_BARRIER_NOT_APPLICABLE','Only the drawn glass-barrier row can explicitly register this consequence object.')
 t.qualification=input;t.qualificationWitness={fingerprint:qualificationWitness(t)};t.status='consequence';return store(input.eventId,r.command,{chaseId:e.id,turnEventId:t.id,qualified:true,row:t.d20,affectedId:affected.id,path:input.path,barrierObjectId:input.barrier?.objectId??null})
}
function finishComplication(e:ChaseEpisode,t:ChaseTurn,checked:AbilityCheckResult|SavingThrowResult){
 if(!t.qualification||t.qualificationWitness?.fingerprint!==qualificationWitness(t))toolkitError('CHASE_HELD_QUALIFICATION_CHANGED','Retain the actual original body/qualification before resuming the held die. No roll or action is discarded or repeated.')
 const row=t.d20!,q=t.qualification,entry=complication(e,row)!,targetId=t.nextParticipantId!,result:Record<string,unknown>={row,affectedId:targetId,check:checked}
 if(!checked.success){
  if('failureTerrainFeet'in entry)result.difficultTerrain={feet:entry.failureTerrainFeet,cells:q.path.slice(1,entry.failureTerrainFeet/5+1)}
  if('failureProne'in entry){if(!conditionImmune(body(targetId),'prone'))gs.applyCondition(targetId,'prone');result.conditions=[...body(targetId).conditions]}
  if('failureBlindSpeedHalf'in entry&&!conditionImmune(body(targetId),'blinded')){
   const effect=addHeroEffect('chase-wilderness-blind',`chase:${e.id}:${t.id}`,[targetId],Number.MAX_SAFE_INTEGER-now(),{condition:'blinded',untilEndOf:targetId,endTurnCount:(hero().turnStarted[targetId]??0)+1,chaseId:e.id,turnEventId:t.id})
   result.blindedEffectId=effect.id;result.speedHalvedWhileBlinded=true;result.untilActualEndOfTurn=targetId
  }
  if('failureDamageComponents'in entry){
   const rolls=entry.failureDamageComponents.map(part=>({roll:rollDice(part.dice),type:part.type}))
   result.damageRolls=rolls;result.damage=dealDamageComponents(targetId,rolls.map(part=>({amount:part.roll.total,type:part.type})),{sourceId:`chase:${e.id}:${t.id}`,damageEventId:`chase:${t.id}:damage`})
  }
  if('failureDamage'in entry){const roll=rollDice(entry.failureDamage);result.damageRoll=roll;result.damage=dealDamage(targetId,roll.total,entry.damageType as DamageType,{sourceId:`chase:${e.id}:${t.id}`,damageEventId:`chase:${t.id}:damage`})}
 }else if(e.input.table==='urban'&&row===3){const object=toolkitState().objects[q.barrier!.objectId];object.hp.current=0;object.state='destroyed';result.destroyedObjectId=object.id}
 t.consequence=result;return completeTurn(e,t)
}
export function resolveChaseComplication(raw:unknown){
 const input=ResolveChaseComplicationSchema.parse(raw),r=receipt(input.eventId,'resolve-chase-complication',input);if(r.old)return toolkitResult({...r.old,replayed:true});context();const {e,t}=turn(input.turnEventId,input.chaseId)
 if((t.status!=='consequence'||!t.qualification)&&!(e.input.table==='wilderness'&&t.status==='qualification'&&input.choice==='negate')||!t.d20)toolkitError('CHASE_CONSEQUENCE_NOT_DUE','Qualify the actual retained complication before selecting its consequence.')
 if(t.qualification&&t.qualificationWitness?.fingerprint!==qualificationWitness(t))toolkitError('CHASE_QUALIFICATION_CHANGED','The exact original physical qualification changed; no die/cost is taken.')
 if(input.choice==='negate'){
  if(input.inspirationHolderId!=='player'||!['player'].some(id=>id===t.actorId||id===t.nextParticipantId)||!gs.getState().dmTools?.dmInspiration?.held||gs.getState().dmTools?.dmInspiration?.prepared)toolkitError('CHASE_INSPIRATION_NOT_HELD','Only an actual held Inspiration token of the roller OR affected participant may negate this complication; no NPC token is invented.')
  const inspiration=toolkitState().dmInspiration!;inspiration.held=false;inspiration.spends[input.eventId]={kind:'chase_complication',status:'consumed',consumedAt:now()};t.consequence={negatedBy:'player',inspirationSpent:true,rollRetained:t.tableRoll};store(input.eventId,r.command,t.consequence);return completeTurn(e,t)
 }
 if(input.inspirationHolderId)toolkitError('CHASE_INSPIRATION_NOT_APPLICABLE','Choose holder only for explicit source negation.')
 if(e.input.table==='wilderness')readWildernessChaseSource()
 const entry=complication(e,t.d20)!,targetId=t.nextParticipantId!,q=t.qualification!
 if(e.input.table==='urban'&&t.d20===9){t.consequence={guardId:q.guardId,triggerMovementFeet:20,requiresActualMovement:true};t.movedFeet=0;store(input.eventId,r.command,{chaseId:e.id,turnEventId:t.id,guardPendingActualMovement:true});return completeTurn(e,t)}
 if(e.input.table==='urban'&&t.d20===8&&q.coin){const wallet=toolkitState().wallet;if(!wallet||wallet[q.coin]<1)toolkitError('CHASE_COIN_NOT_HELD','Choose one actual possessed coin; no money or implicit change is created.');wallet[q.coin]--;t.consequence={row:8,success:true,coinTossed:{denomination:q.coin,count:1,atCell:q.path[1]??q.path[0]},checkNotRolled:true};store(input.eventId,r.command,t.consequence);return completeTurn(e,t)}
 store(input.eventId,r.command,{chaseId:e.id,turnEventId:t.id,originalConsequenceChosen:true})
 if('roll'in entry&&entry.roll==='save')return savedResolution({entityId:targetId,ability:entry.ability,dc:entry.dc},{domain:'chase',command:{stage:'complication',chaseId:e.id,turnEventId:t.id}})
 const choice=q.choice!;return checkedResolution({entityId:targetId,ability:choice==='athletics'?'str':choice==='intimidation'?'cha':choice==='int'?'int':'dex',...(choice==='int'?{}:{skill:choice}),...(choice==='intimidation'?{sourceChaseTask:true}:{}),dc:'dc'in entry?entry.dc:undefined,label:`DMG ${e.input.table} chase complication`},{domain:'chase',command:{stage:'complication',chaseId:e.id,turnEventId:t.id}})
}
function finishEscape(e:ChaseEpisode,command:Record<string,unknown>,checked:AbilityCheckResult){
 const input=ResolveChaseEscapeSchema.parse(command.input),round=String(command.round);if(e.escapes[round])toolkitError('CHASE_ESCAPE_ALREADY_RESOLVED','The round already retains its one original quarry escape result.')
 const result={chaseId:e.id,round:Number(round),check:checked,passives:command.passives,leaderId:input.leaderId,continuousSight:false,escaped:Boolean(checked.success),source:CHASE_SOURCE}
 e.escapes[round]={...result,input,command:plain(input)};if(checked.success)e.participants[e.input.quarryId].status='escaped';endIfOneSide(e);store(input.eventId,String(command.receiptCommand),result);return toolkitResult(result)
}
export function resolveChaseEscape(raw:unknown){
 const input=ResolveChaseEscapeSchema.parse(raw),r=receipt(input.eventId,'resolve-chase-escape',input);if(r.old)return toolkitResult({...r.old,replayed:true});context();const e=episode(input.chaseId),state=gs.getState(),due=chaseTurnIssue(state);if(due?.code!=='CHASE_ESCAPE_DUE')toolkitError('CHASE_ESCAPE_NOT_DUE','Escape is checked at the actual round end after every participating turn, not after only the quarry/lead turn.')
 const quarry=body(e.input.quarryId),pursuers=participants(e).filter(p=>p.role==='pursuer').map(p=>body(p.id)),distances=pursuers.map(p=>({id:p.id,feet:distance(p.position,quarry.position)*5})),minimum=Math.min(...distances.map(d=>d.feet));if(!distances.some(d=>d.id===input.leaderId&&d.feet===minimum))toolkitError('CHASE_LEADER_REQUIRED','Select an actually closest active pursuer; exact distance ties require the explicit MJ choice, never an engine-selected target.')
 actualFact(input.sightFactId);if(Object.keys(input.senseByPursuer).length!==pursuers.length||pursuers.some(p=>!input.senseByPursuer[p.id]))toolkitError('CHASE_PERCEPTION_SENSE_REQUIRED','Choose the actual Perception sense separately for every active pursuer.')
 const passives=pursuers.map(p=>({id:p.id,score:passivePerceptionScore(p,state,false,false,input.senseByPursuer[p.id])}));if(passives.some(p=>p.score===null))toolkitError('CHASE_PERCEPTION_UNREPRESENTED','Qualify an actually applicable perception sense for each pursuer; no unseen passive contest is invented.')
 if(input.continuousSight){if(!canSee(body(input.leaderId),quarry))toolkitError('CHASE_CONTINUOUS_SIGHT_INVALID','The leader cannot have continuous sight while the actual source sight cannot currently perceive the quarry.');const result={chaseId:e.id,round:state.round,automaticFailure:true,dieRolled:false,escaped:false,passives,leaderId:input.leaderId,input,command:plain(input)};e.escapes[String(state.round)]=result;return toolkitResult(store(input.eventId,r.command,result))}
 const lead=body(input.leaderId),leadSkill='type'in lead?getMonsterRecord(lead.type)?.source.proficiencies as Array<{proficiency:{index:string}}> | undefined:undefined,rangerOrSurvival=input.leaderId==='player'?gs.getPlayer().class==='ranger'||gs.getPlayer().skillProficiencies?.includes('survival'):leadSkill?.some(p=>p.proficiency.index==='skill-survival')
 const advantage=input.hide==='many'||input.area==='crowded_noisy',disadvantage=input.hide==='few'||input.area==='quiet_uncrowded'||Boolean(rangerOrSurvival),dc=Math.max(...passives.map(p=>p.score!))+1
 return checkedResolution({entityId:quarry.id,ability:'dex',skill:'stealth',dc,advantage,disadvantage,advantageReason:'DMG2014 Escape Factors, actual qualified round circumstances',label:'DMG chase escape at round end'},{domain:'chase',command:{stage:'escape',chaseId:e.id,turnEventId:Object.values(e.turns).at(-1)!.id,input,round:state.round,passives,receiptCommand:r.command}})
}
export function stopChase(raw:unknown){const input=StopChaseSchema.parse(raw),r=receipt(input.eventId,'stop-chase',input);if(r.old)return{...r.old,replayed:true};assertHero();pending();const e=episode(input.chaseId);if(activeChaseGuard(gs.getState())?.t.guardTriggered)toolkitError('CHASE_GUARD_ATTACK_DUE','Stopping cannot erase the real guard consequence after20ft actual movement.');const currentKey=chaseTurnKey(gs.getState()),unsettledDash=Object.values(e.participants).some(p=>p.dashIds.some(id=>data().receipts[id]?.result.turnKey===currentKey)&&!Object.values(e.turns).some(t=>t.key===currentKey&&t.status==='complete'));if(unsettledDash)toolkitError('CHASE_DASH_END_REQUIRED','Finish this actual turn source event before dropping out; an already taken Dash cannot lose its real end-turn checks or complication through stop/new nonce.');if(Object.values(e.turns).some(t=>t.status!=='complete'))toolkitError('CHASE_EVENT_DUE','Finish the retained original die/complication before dropping out; stopping cannot erase the result.');for(const id of input.participantIds)if(!e.participants[id]||e.participants[id].status!=='active')toolkitError('CHASE_PARTICIPANT_REQUIRED','Choose actual active enrolled participants to stop.');for(const id of input.participantIds)e.participants[id].status='stopped';endIfOneSide(e);return store(input.eventId,r.command,{chaseId:e.id,stopped:input.participantIds,status:e.status,fatigueRetained:true,actionSpent:false})}
export function inspectChase(){return {confidential:true,readOnly:true,state:chaseStateOf(gs.getState())??null,dueEvent:chaseTurnIssue(gs.getState()),source:CHASE_SOURCE,limitation:'Official urban table and partial wilderness rows1/2/4/5/8; other wilderness rows retain their result pending a separately represented procedure; one ground quarry/current map, actual manual actors and guards. Player actual rest only; no NPC rest inferred, no new MM powers or authored reactive control.'}}

/** This turn-bound dust condition has no invented outside-combat duration. */
export function reconcileWildernessChaseEffects(){
 for(const effect of [...hero().effects].filter(effect=>effect.kind==='chase-wilderness-blind')){
  const id=effect.targetIds[0],target=gs.getPhysicalCreature(id)
  if(!target||(id==='player'?gs.getPlayer().deathSaves?.dead:'isAlive'in target&&!target.isAlive)){
   const episode=chaseStateOf(gs.getState())?.episodes[String(effect.data.chaseId)],turn=episode?.turns[String(effect.data.turnEventId)]
   if(turn)turn.effectExpired=true
   removeHeroEffect(effect.id)
  }
 }
}
