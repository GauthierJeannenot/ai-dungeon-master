import { toolkitState } from './toolkit'
import { randomUUID } from 'node:crypto'
import { activePhysicalLoad } from '../lib/physical-handling-state'
import { actualLocomotionLocation,locomotionStateOf } from '../lib/locomotion-state'
import { entityVerticalContext } from '../lib/jumping-state'
import { swallowedBy } from '../lib/swallow-state'
import { SHOVE_ASIDE_SOURCE,activeShoveAside,shoveAsideContext,shoveAsidePendingCommand,shoveAsideWitness,validateShoveAsideState } from '../lib/dmg-shove-aside-state'
import { navigationGrid } from '../lib/navigation'
import * as gs from './game-state'
import { engineGeometry } from './navigation'
import { visibleCell } from './monster-perception'
import { fail } from './hero-rules'
import { readDmgShoveAsideSource } from './rules-library'
type AsideInput={targetId:string;toCell:{x:number;y:number};defenseSkill:'athletics'|'acrobatics';shove:'aside'}
export function assertShoveAsideGeometry(input:AsideInput){
  readDmgShoveAsideSource()
  const state=gs.getState(),player=state.player,target=gs.getEntity(input.targetId),cell=input.toCell
  if(state.phase!=='combat'||state.currentTurn!=='player'||!target||target.id==='player'||target.hp.current<=0||!state.initiativeOrder.includes(target.id))fail('SHOVE_ASIDE_BODY_REQUIRED','Choose the actual capable target of this player combat turn.')
  if([player,target!].some(body=>body.conditions.some(condition=>['incapacitated','paralyzed','petrified','stunned','unconscious'].includes(condition))))fail('SHOVE_ASIDE_CAPABLE_CONTEST_REQUIRED','This initial optional procedure requires two actual bodies capable of the contested checks; no automatic source result is invented.')
  const origin=player.position,from=target!.position,reach=(a:{x:number;y:number},b:{x:number;y:number})=>Math.max(Math.abs(a.x-b.x),Math.abs(a.y-b.y))
  if(!visibleCell(player,from))fail('SHOVE_ASIDE_TARGET_UNREACHABLE','Retain actual unobstructed visible melee reach to the original target before the held contest continues.')
  if(reach(origin,from)>1||Math.abs(from.x-cell.x)+Math.abs(from.y-cell.y)!==1||reach(origin,cell)>1||reach(origin,cell)===0)fail('SHOVE_ASIDE_DESTINATION_REQUIRED','Choose an explicit cardinal five-foot displacement to a different unoccupied cell still within the player’s represented five-foot reach.')
  if(activePhysicalLoad(state)||['player',target!.id].some(id=>swallowedBy(state,id)||actualLocomotionLocation(state,id)))fail('SHOVE_ASIDE_PHYSICAL_CONTEXT_REQUIRED','Release the real load or resolve the actual containment/swimming/climbing context before this bounded ground contest.')
  const contexts=['player',target!.id].map(id=>entityVerticalContext(state,id))
  if(contexts.some(context=>!context.known||context.airborne||context.aboveSupportFeet!==0)||contexts[0].zFeet!==contexts[1].zFeet)fail('SHOVE_ASIDE_GROUND_PLANE_REQUIRED','Both real bodies must occupy the same known supporting plane; no airborne, cross-level or suspended displacement is inferred.')
  const water=Object.values(locomotionStateOf(state)?.media??{}).some(medium=>medium.mode==='swim'&&medium.mapId===state.currentMapId&&medium.cells.some(point=>[origin,from,cell].some(p=>p.x===point.x&&p.y===point.y)))
  if(water)fail('SHOVE_ASIDE_DRY_GROUND_REQUIRED','This first tranche requires a real dry ground route; no swimming, wading or underwater displacement is manufactured.')
  if(!navigationGrid(state,target!.id,engineGeometry(),{ignoreActorEffects:true}).step(from,cell))fail('SHOVE_ASIDE_PATH_BLOCKED','The exact side displacement cannot pass through a wall, closed door or occupied cell.')
  if(!navigationGrid(state,'player',engineGeometry(),{ignoreActorEffects:true,ignoreDoorKnowledge:true}).step(origin,cell,false,false))fail('SHOVE_ASIDE_REACH_BLOCKED','The side destination must remain in actual bodily reach without a wall, closed door or solid obstacle cutting its represented ground reach.')
  // Same physical projection and source hazards as the existing forced push.
  // This is deliberately before both d20s and before the attack replacement.
  gs.assertGroundMovementPath(target!.id,[cell],'forced',true)
}
export function beginShoveAside(input:AsideInput){
  assertShoveAsideGeometry(input)
  const state=gs.getState(),existing=state.dmTools?.shoveAside
  if(activeShoveAside(state)||Object.keys(existing?.attempts??{}).length>=256)fail('SHOVE_ASIDE_ATTEMPT_LIMIT','Resolve the retained source contest, or retain fewer than 256 completed attempts, before another die or cost.')
  const id=`shove-aside-${randomUUID()}`
  const data=toolkitState().shoveAside??={version:1,attempts:{}}
  data.attempts[id]={id,source:SHOVE_ASIDE_SOURCE,input:structuredClone(input),inputWitness:shoveAsideWitness(input),contextWitness:shoveAsideContext(state,input.targetId),status:'rolling'}
  return{id,source:SHOVE_ASIDE_SOURCE}
}
export function validateHeldShoveAside(){
  if(!shoveAsidePendingCommand(gs.getState().hero?.pending))return
  const issues=validateShoveAsideState(gs.getState());if(issues.length)fail('SHOVE_ASIDE_HELD_MISMATCH',issues.join(' '))
  assertShoveAsideGeometry(activeShoveAside(gs.getState())!.input)
}
export function resumeShoveAside(command:Record<string,unknown>){
  if(command.shove!=='aside')return
  const state=gs.getState(),attempt=state.dmTools?.shoveAside?.attempts[String(command.shoveAsideId)]
  if(!attempt||attempt.status==='resolved'||command.source!==SHOVE_ASIDE_SOURCE||attempt.contextWitness!==shoveAsideContext(state,attempt.input.targetId)||command.targetId!==attempt.input.targetId||command.defenseSkill!==attempt.input.defenseSkill||shoveAsideWitness(command.toCell)!==shoveAsideWitness(attempt.input.toCell)||command.stage==='second'&&attempt.firstCheckWitness!==shoveAsideWitness(command.firstCheck))fail('SHOVE_ASIDE_HELD_MISMATCH','Retain the original source contest, checks, actual body context and chosen side cell before further dice, bonus or cost.')
  assertShoveAsideGeometry(attempt!.input)
  attempt!.status='rolling';delete attempt!.pendingWitness
}
export function retainShoveAsideFirst(command:Record<string,unknown>,check:unknown){if(command.shove==='aside')gs.getState().dmTools!.shoveAside!.attempts[String(command.shoveAsideId)].firstCheckWitness=shoveAsideWitness(check)}
export function finishShoveAside(command:Record<string,unknown>,result:Record<string,unknown>){
  if(command.shove!=='aside')return
  const attempt=gs.getState().dmTools!.shoveAside!.attempts[String(command.shoveAsideId)]
  const contact=Object.values(gs.getState().dmTools?.groundGear?.contacts??{}).find(contact=>contact.slipperyIceEntry&&contact.stepWitness?.shoveAsideId===attempt.id)
  if(contact){
    result.slipperyIceContactId=contact.id
    contact.slipperyIceEntry!.shoveAside={attemptId:attempt.id,resultWitness:shoveAsideWitness(result)}
  }
  attempt.status='resolved';delete attempt.pendingWitness;attempt.result=structuredClone(result);attempt.resultWitness=shoveAsideWitness(result)
}
