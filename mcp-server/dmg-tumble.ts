import { effectiveOverrunGrant } from '../lib/dmg-overrun-state'
import { NavigationError } from '../lib/navigation'
import { randomUUID } from 'node:crypto'
import type { AbilityCheckResult,SavingThrowResult } from '../lib/types'
import { TUMBLE_SOURCE,TumbleInputSchema,tumbleBudget,tumbleContext,tumblePendingLink,pendingIsTumble,
  tumbleTurnKey,tumbleWitness as witness,effectiveTumbleGrant,validateTumbleState,type TumbleInput,type TumbleAttempt } from '../lib/dmg-tumble-state'
import { checkedResolution,registerCheckedResolution } from './toolkit-checks'
import { registerPhysicalContinuation } from './movement-continuation'
import { toolkitState,toolkitResult } from './toolkit'
import { available,fail,hero,spendHeroAction } from './hero-rules'
import { planTumbleRoute } from './overrun-geometry'
import { beforeHeroStep,afterHeroStep } from './hero-movement'
import { readDmgTumbleSource } from './rules-library'
import { recordActualFootsteps,clearActualFootwork } from './vertical-observations'
import * as gs from './game-state'
import * as rules from './rules'

const attempt=(id:string)=>gs.getState().dmTools?.tumble?.attempts[id]
const setResult=(a:TumbleAttempt,value:Record<string,unknown>)=>{a.result=structuredClone(value);a.resultWitness=witness(value);return toolkitResult(value)}
const same=(a:{x:number;y:number},b:{x:number;y:number})=>a.x===b.x&&a.y===b.y
function assertCost(cost:TumbleInput['cost']){
  rules.validateFreeCombatAction('player')
  if(cost==='action')rules.validateActionUse('player');else rules.validateBonusActionUse('player')
}
function sourceResult(a:TumbleAttempt){return {tumbleId:a.id,source:a.source,targetId:a.input.targetId,costChoice:a.input.cost,costPaid:a.paid,used:a.used,
  contest:{check:a.firstCheck,opposition:a.opposition},actualReactions:a.reactionResults??[],status:a.status}}

export function beginTumble(raw:unknown){
  const input=TumbleInputSchema.parse(raw);available();assertCost(input.cost)
  const state=gs.getState(),plan=planTumbleRoute(input),stored=state.dmTools?.tumble
  if(Object.keys(stored?.attempts??{}).length>=256)fail('TUMBLE_HISTORY_LIMIT','The retained source contest history is full before another check, cost or step.')
  if(Object.values(stored?.attempts??{}).some(a=>a.turnKey===tumbleTurnKey(state)&&a.input.targetId===input.targetId))
    fail('TUMBLE_REPEAT_TRANCHE_UNREPRESENTED','This first tranche represents one attempt per selected opponent and actual turn. Repeated action/bonus attempts against that same target are deferred, not declared a general RAW prohibition; no new die or cost is spent.')
  if(Object.values(state.dmTools?.overrun?.attempts??{}).some(a=>effectiveOverrunGrant(state,a)))fail('TUMBLE_OTHER_PERMISSION_REQUIRED','The original won unused Overrun permission remains visible. Complete it or let its real turn expire before another source crossing; a failed Overrun does not block Tumble.')
  if(Object.values(stored?.attempts??{}).some(a=>effectiveTumbleGrant(state,a)))fail('TUMBLE_CONTINUATION_REQUIRED','Finish or let the original unused crossing expire before another occupied crossing; no grant is silently replaced.')
  const id=`tumble-${randomUUID()}`,data=toolkitState().tumble??={version:1,attempts:{}}
  data.attempts[id]={id,source:TUMBLE_SOURCE,input:structuredClone(input),inputWitness:witness(input),turnKey:tumbleTurnKey(state),mapId:state.currentMapId!,at:state.worldTimeSeconds??0,
    contextWitness:tumbleContext(state,input.targetId),sizes:plan.sizes,sizesWitness:witness(plan.sizes),plan:structuredClone(plan),planWitness:witness(plan),status:'rolling',paid:false,used:false,windows:{}}
  return checkedResolution({ability:'dex',skill:'acrobatics',label:'DMG Tumble: Dexterity (Acrobatics)'},
    {domain:'dmg-tumble-contest',command:{tumbleId:id,stage:'first'}})
}

export function validateHeldTumble(){
  const state=gs.getState();if(!pendingIsTumble(state.hero?.pending))return
  const issues=validateTumbleState(state);if(issues.length)fail('TUMBLE_HELD_MISMATCH',issues.join(' '))
  readDmgTumbleSource()
  const a=attempt(String(tumblePendingLink(state.hero?.pending)))!
  // A nested real opportunity attack/save must finish even if its consequences
  // now prevent walking. The whole route is revalidated AFTER that reaction,
  // before occupied entry; the original checks revalidate before their bonus.
  if(a.status==='held_check')planTumbleRoute(a.input)
}

function finishTumbleCheck(command:Record<string,unknown>,check:AbilityCheckResult|SavingThrowResult):ReturnType<typeof toolkitResult>{
  const a=attempt(String(command.tumbleId)),state=gs.getState()
  if(!a||!['rolling','held_check'].includes(a.status)||a.paid||a.used||a.contextWitness!==tumbleContext(state,a.input.targetId)||a.turnKey!==tumbleTurnKey(state))
    fail('TUMBLE_HELD_MISMATCH','Retain the original cost-free source contest, exact bodies/sizes/route and actual turn before another die or payment.')
  const plan=planTumbleRoute(a!.input)
  if(witness(plan.sizes)!==a!.sizesWitness)fail('TUMBLE_SIZE_CHANGED','The actual original size qualification cannot be replaced before the original opposed checks finish.')
  a!.status='rolling';delete a!.pendingCheckWitness
  if(command.stage==='first'){
    a!.firstCheck=structuredClone(check) as unknown as Record<string,unknown>;a!.firstCheckWitness=witness(a!.firstCheck)
    return checkedResolution({entityId:a!.input.targetId,ability:'dex',skill:'acrobatics',label:'DMG Tumble: opposed Dexterity (Acrobatics)'},
      {domain:'dmg-tumble-contest',command:{tumbleId:a!.id,stage:'second',firstCheck:check}})
  }
  if(command.stage!=='second'||witness(command.firstCheck)!==a!.firstCheckWitness||!a!.firstCheck)fail('TUMBLE_HELD_MISMATCH','The defender opposes the original retained first check, never another die.')
  a!.opposition=structuredClone(check) as unknown as Record<string,unknown>;a!.oppositionWitness=witness(a!.opposition)
  assertCost(a!.input.cost)
  const before=tumbleBudget(state)
  if(a!.input.cost==='action')spendHeroAction();else gs.markBonusActionUsed('player')
  a!.paid=true;a!.payment={before,after:tumbleBudget(state)};a!.paymentWitness=witness(a!.payment)
  const won=Number((a!.firstCheck.roll as {total:number}).total)>check.roll.total
  if(!won){a!.status='failed';return setResult(a!,{...sourceResult(a!),success:false,movement:{path:[a!.input.path[0]],costCells:0,distanceFeet:0},mechanicalSummary:'Tumble opposed check failed or tied: the selected whole action/bonus is spent, position and movement budget remain unchanged.'})}
  a!.status='ready'
  return resumeTumbleTraversal(a!.id)
}

function stopped(id:string,reason:string,message:string){
  const a=attempt(id)!;a.status='stopped'
  return setResult(a,{...sourceResult(a),success:true,tumbleWon:true,movementStopped:true,stopReason:reason,currentPosition:{...gs.getPlayer().position},movement:{path:[{...gs.getPlayer().position}],costCells:0,distanceFeet:0},mechanicalSummary:message})
}
/** Continues the same requested source route. No source check, cost or target
 * is reselected. A new explicit retry may use move_token+tumbleId only while
 * this still-unused permission belongs to the same real player turn. */
export function resumeTumbleTraversal(id:string,ignored:string[]=[],completedEffect?:unknown):ReturnType<typeof toolkitResult>{
  const original=attempt(id)
  if(!original)fail('TUMBLE_SOURCE_REQUIRED','Select the actual original retained Tumble permission.')
  if(original!.used)return toolkitResult({...structuredClone(original!.result),replayed:true,currentPosition:{...gs.getPlayer().position}})
  if(completedEffect&&typeof completedEffect==='object'){original!.reactionResults??=[];original!.reactionResults.push(structuredClone(completedEffect) as Record<string,unknown>);original!.reactionResultsWitness=witness(original!.reactionResults)}
  if(original!.status==='reaction'&&!effectiveTumbleGrant(gs.getState(),original!))return stopped(id,'actual_reaction_ended_permission','The actual pre-entry reaction and its original consequences remain committed at the free departure square; no occupied entry or new die occurs.')
  if(!effectiveTumbleGrant(gs.getState(),original!))fail('TUMBLE_PERMISSION_EXPIRED','The original source permission belongs to one actual turn and one successful contest; it grants no new action or crossing.')
  let plan:ReturnType<typeof planTumbleRoute>
  try{
    available();plan=planTumbleRoute(original!.input)
    if(witness(plan.sizes)!==original!.sizesWitness)fail('TUMBLE_SIZE_CHANGED','This retained route still needs its actual original five-foot bodies and size qualification.')
  }catch(error){
    if(error instanceof rules.RuleViolation||error instanceof NavigationError)return stopped(id,error.code,'The already-paid contest/reaction remains committed; movement stopped before occupied entry. Resolve the real blocker and explicitly continue this same unused route within the same turn, or let it expire.')
    throw error
  }
  original!.status='ready'
  const [from,through,to]=plan!.path
  if(beforeHeroStep('player',from,through,{kind:'cell',cell:to},false,[],ignored,false,undefined,'walk',undefined,undefined,undefined,undefined,id))
    return toolkitResult({...sourceResult(original!),success:true,tumbleWon:true,movement:{path:[from],costCells:0,distanceFeet:0},pendingReaction:hero().pending,mechanicalSummary:'The original paid Tumble waits on an actual reaction BEFORE entering the hostile square.'})

  // No await occurs in this two-step source crossing. Preflight excludes every
  // represented middle-cell stop/window; an unexpected structural refusal
  // restores only this uncommitted crossing, preserving the paid contest and
  // all actual pre-entry attack/damage/reaction progress.
  const checkpoint=structuredClone(gs.getState())
  try{
    gs.moveToken('player',through.x,through.y,{voluntaryFootstep:true})
    gs.addMovementUsed('player',plan!.stepCosts[0]);hero().movementTrail.push({...through});afterHeroStep('player')
    if(hero().pending||gs.getPlayer().hp.current<=0)throw new rules.RuleViolation('TUMBLE_OCCUPIED_STOP_UNREPRESENTED','This uncommitted occupied crossing exposed a stop not represented by its preflight.',{})
    gs.addMovementUsed('player',plan!.stepCosts[1]);original!.used=true;original!.status='complete'
    gs.moveToken('player',to.x,to.y,{voluntaryFootstep:true});hero().movementTrail.push({...to});hero().movementTrail=hero().movementTrail.slice(-6);afterHeroStep('player')
  }catch(error){
    const live=gs.getState();for(const key of Object.keys(live))delete (live as unknown as Record<string,unknown>)[key];Object.assign(live,checkpoint)
    if(error instanceof rules.RuleViolation||error instanceof NavigationError)return stopped(id,error.code,'The unsupported crossing did not commit either occupied step; its already paid contest and actual pre-entry reactions remain retained. No new destination, movement or die is selected.')
    throw error
  }
  if(!same(gs.getPlayer().position,to))throw new Error('Completed Tumble must end at its exact chosen free exit.')
  if(gs.getPlayer().conditions.some(c=>['prone','unconscious','incapacitated','paralyzed','petrified','stunned'].includes(c)))clearActualFootwork()
  else recordActualFootsteps(plan!.path,[5,5])
  const a=attempt(id)!
  return setResult(a,{...sourceResult(a),success:true,tumbleWon:true,movement:{path:structuredClone(plan!.path),stepCosts:plan!.stepCosts,costCells:plan!.totalCost,distanceFeet:10,remainingCells:Math.max(0,plan!.remaining-plan!.totalCost),finalPosition:{...to}},targetPosition:{...gs.getMonster(a.input.targetId)!.position},actorDown:gs.getPlayer().hp.current<=0,
    mechanicalSummary:`Tumble completed two actual five-foot steps through the exact hostile square; ${plan!.totalCost*5} feet of movement and one selected ${a.input.cost} spent. Defender position unchanged; no Extra Attack replaced.`})
}

export function continueTumbleMovement(input:{tokenId:string;toCell?:{x:number;y:number};tumbleId:string;movementMode?:string;allowPartial?:boolean;stealth?:boolean;roomId?:string;doorId?:string;targetEntityId?:string;acknowledgeEventIds?:string[]}){
  const a=attempt(input.tumbleId)
  if(input.tokenId!=='player'||!a||!input.toCell||!same(input.toCell,a.input.path[2])||input.movementMode&&input.movementMode!=='walk'||input.allowPartial||input.stealth||input.roomId||input.doorId||input.targetEntityId||input.acknowledgeEventIds?.length)
    fail('TUMBLE_ORIGINAL_ROUTE_REQUIRED','Choose only the original player, exact free exit and retained tumbleId; no alternative goal, partial route, stealth or movement mode is inferred.')
  return resumeTumbleTraversal(a!.id)
}
export function registerTumbleResolutions(){
  registerCheckedResolution('dmg-tumble-contest',finishTumbleCheck)
  registerPhysicalContinuation('dmg-tumble',(command,movementStopped,completedEffect)=>movementStopped?stopped(String(command.eventId),'actual_reaction_stop','The actual pre-entry reaction stopped movement on its real free side; original cost and check remain retained.'):
    resumeTumbleTraversal(String(command.eventId),Array.isArray(command.ignored)?command.ignored as string[]:[],completedEffect))
}
