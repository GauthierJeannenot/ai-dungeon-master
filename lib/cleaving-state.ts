import { z } from 'zod'
import type { GameState } from './types'
import { shoveAsideContext,shoveAsideWitness as witness } from './dmg-shove-aside-state'
export const CLEAVING_SOURCE='dmg-2014:Cleaving Through Creatures:fa75462a6ef96ef0f86fbfd2d433c624ce926ff630a43d1fcaea6a2c1249b0d1:9242-9246'
export const CLEAVING_CONVENTION='user-2026-11-07:explicit-activation-target-and-stop-each-stage-even-if-valid-targets-remain'
const Value=z.record(z.string(),z.unknown()),Count=z.number().int().nonnegative(),Cell=z.object({x:z.number().int(),y:z.number().int()}).strict()
export const CleavingChoiceSchema=z.object({cleaveId:z.string().min(1),stepId:z.string().min(1).max(100).refine(x=>!['constructor','prototype','__proto__'].includes(x)),choice:z.enum(['carry','stop']),targetId:z.string().min(1).optional()}).strict()
const Budget=z.object({credits:Count,actionUsed:z.boolean(),attackAction:z.unknown()}).strict()
const Initial=z.object({attackEventId:z.string(),attackActionId:z.string(),targetId:z.string(),weaponReference:z.string(),weaponId:z.string(),itemId:z.string().optional(),damageType:z.enum(['bludgeoning','piercing','slashing']),silvered:z.boolean(),newAttackAction:z.boolean(),extraAttack:z.boolean(),improvedCritical:z.boolean(),originSnapshot:Value,actorSizeFact:Value,originHp:z.object({current:Count,max:Count}).strict(),actorCell:Cell,budget:Budget}).strict()
const Step=z.object({input:CleavingChoiceSchema,inputWitness:z.string(),incoming:Count,outgoing:Count,discarded:Count,attackRollWitness:z.string(),target:Value.optional(),targetWitness:z.string().optional(),targetAC:z.number().optional(),hit:z.boolean().optional(),damage:Value.optional(),damageWitness:z.string().optional(),reason:z.string(),result:Value,resultWitness:z.string()}).strict()
const LifeWitness=z.object({at:z.number().nonnegative(),hp:z.object({current:Count,max:Count}).strict(),conditions:z.array(z.string()),dead:z.boolean()}).strict()
const Event=z.object({id:z.string(),source:z.literal(CLEAVING_SOURCE),convention:z.literal(CLEAVING_CONVENTION),turnKey:z.string(),mapId:z.string(),at:z.number().nonnegative(),input:Initial,inputWitness:z.string(),status:z.enum(['preparing','held_attack','awaiting_choice','closed']),pendingWitness:z.string().optional(),heldFrame:z.string().optional(),original:Value.optional(),originalWitness:z.string().optional(),attackRollWitness:z.string().optional(),naturalCritical:z.boolean().optional(),budgetAfter:Budget.optional(),remaining:Count,discarded:Count,steps:z.record(z.string(),Step),order:z.array(z.string()).max(32),closeReason:z.string().optional(),blockedReason:z.literal('unexpected_damage_context_requires_explicit_stop').optional(),lifeWitness:LifeWitness.optional(),lifeWitnessHash:z.string().optional()}).strict()
export const CleavingStateSchema=z.object({version:z.literal(1),events:z.record(z.string(),Event).refine(x=>Object.keys(x).length<=256)}).strict()
export type CleavingEvent=z.infer<typeof Event>
export type CleavingInitial=z.infer<typeof Initial>
export type CleavingChoice=z.infer<typeof CleavingChoiceSchema>
export const cleavingWitness=witness
export const cleavingTurnKey=(s:GameState)=>`${s.combatGeneration??0}:${s.turnCounter??0}:${s.round}:${s.currentTurn??''}`
export const cleavingBudget=(s:GameState)=>({credits:s.hero?.actionCredits??0,actionUsed:Boolean(s.actionUsed.player),attackAction:structuredClone(s.hero?.attackAction??null)})
export const cleavingFrame=(s:GameState,targetId:string)=>shoveAsideContext(s,targetId)
type Pending=NonNullable<GameState['hero']>['pending']
export function cleavingPendingId(p:Pending){return typeof p?.command.cleaveId==='string'?p.command.cleaveId:undefined}
export function pendingIsCleaving(p:Pending){return p?.command.cleaving===true||Boolean(p&&Object.hasOwn(p.command,'cleaveId'))}
export function recordCleavingHeldWindow(state:GameState){
 const p=state.hero?.pending,id=cleavingPendingId(p),a=id?state.dmTools?.cleaving?.events[id]:undefined
 if(!a||!p)return
 a.status='held_attack';a.pendingWitness=witness(p);a.heldFrame=cleavingFrame(state,a.input.targetId)
}
export function cleavingHeldBodyMutationBlocked(s:GameState,id:string){return Object.values(s.dmTools?.cleaving?.events??{}).some(a=>a.status==='held_attack'&&(id==='player'||id===a.input.targetId))}
export function currentCleavingChoice(s:GameState){return Object.values(s.dmTools?.cleaving?.events??{}).find(a=>a.status==='awaiting_choice')}
export function cleavingActionIssue(s:GameState,allowId?:string){const a=currentCleavingChoice(s);return a&&a.id!==allowId?{code:'CLEAVING_CHOICE_REQUIRED',message:'Choose the exact retained cleaving carry target or explicit stop before another action, movement, time or turn. No further target or stop is inferred.',cleaveId:a.id}:null}
export function cleavingTransitionIssue(s:GameState){return Object.values(s.dmTools?.cleaving?.events??{}).some(a=>a.status!=='closed')?{code:'CLEAVING_PENDING',message:'Resolve the exact original held attack or explicit cleaving carry/stop before leaving its actual turn, combat or map.'}:null}
/** Actual lifecycle termination, never a fabricated player stop or new attack. */
export function reconcileCleavingActorLife(s:GameState){
 const a=currentCleavingChoice(s);if(!a||s.player.hp.current>0&&!s.player.deathSaves?.dead&&!s.player.conditions.some(c=>['incapacitated','unconscious','paralyzed','petrified','stunned'].includes(c)))return
 a.lifeWitness={at:s.worldTimeSeconds??0,hp:structuredClone(s.player.hp),conditions:[...s.player.conditions],dead:Boolean(s.player.deathSaves?.dead)};a.lifeWitnessHash=witness(a.lifeWitness);a.discarded+=a.remaining;a.remaining=0;a.status='closed';a.closeReason='actual_actor_unavailable'
}
const rec=(x:unknown)=>x&&typeof x==='object'?x as Record<string,unknown>:undefined
export function cleavingInitialRemainder(a:CleavingEvent){
 const r=a.original,d=rec(r?.damageResolution)
 if(!r?.hit||!d||a.input.originHp.current!==a.input.originHp.max||Number(d.hpAfter)!==0)return 0
 return Math.max(0,Number(d.hpDamage)-Number(d.hpLost))
}
export function validateCleavingState(s:GameState):string[]{
 const data=s.dmTools?.cleaving,p=s.hero?.pending,link=cleavingPendingId(p)
 if(!data)return pendingIsCleaving(p)?['A pending cleaving attack cannot lose its original source register.']:[]
 if(!CleavingStateSchema.safeParse(data).success)return['Retain the exact bounded cleaving source/choice schema.']
 const issues:string[]=[];let active=0
 for(const[id,a]of Object.entries(data.events)){
  if(id!==a.id||a.inputWitness!==witness(a.input)||a.input.originHp.current<=0||a.input.originHp.current!==a.input.originHp.max||a.input.originSnapshot.id!==a.input.targetId||witness(a.input.originSnapshot.hp)!==witness(a.input.originHp)||!['Small','Medium'].includes(String(a.input.originSnapshot.size))||!['Small','Medium'].includes(String(a.input.actorSizeFact.size)))issues.push('A cleaving origin is its exact real positive full-HP melee attack, not a fabricated source or prior wound history.')
  if(a.status!=='closed')active++
  if(a.originalWitness!==(a.original?witness(a.original):undefined))issues.push('Retain the exact one original committed attack/damage result.')
  if(a.status==='preparing')issues.push('An unrolled transient cleaving preparation cannot be imported as a live completed source.')
  if(a.status==='held_attack'){
   if(!p||link!==id||a.pendingWitness!==witness(p)||a.heldFrame!==cleavingFrame(s,a.input.targetId)||a.turnKey!==cleavingTurnKey(s)||a.mapId!==s.currentMapId||a.original)issues.push('A held cleaving origin retains the same actual d20/body/weapon/turn/source before another bonus or cost.')
   continue
  }
  if(a.status==='preparing')continue
  const r=a.original,d=rec(r?.damageResolution),roll=rec(r?.attackRoll),before=a.input.budget,after=a.budgetAfter,b=rec(before.attackAction),n=rec(after?.attackAction)
  if(!r||r.attackerId!=='player'||r.attackMode!=='melee'||r.meleeReachCells!==1||r.nonlethal===true||r.targetId!==a.input.targetId||r.primaryAttackId!==a.input.attackEventId||r.weaponOrSpell!==a.input.weaponReference||!roll||a.attackRollWitness!==witness(roll)||a.naturalCritical===undefined||!after||!n)issues.push('Every cleaving result retains its one original player melee attack, actual chosen d20 and one real Attack economy.')
  if(r&&roll&&(a.naturalCritical!==(r.naturalRoll===20||a.input.improvedCritical&&r.naturalRoll===19)||Number((roll.rolls as number[]|undefined)?.[0])!==r.naturalRoll))issues.push('Natural/improved-critical hit logic comes from the original chosen d20, never a criticalHit caused by the first target condition.')
  if(after&&n){
   const starting=a.input.newAttackAction||!b||Number(b.remaining)===0,used=starting?1:Number(b?.used)+1,credits=before.credits-(starting?1:0)
   if(credits<0||after.credits!==credits||after.actionUsed!==(credits===0)||n.used!==used||n.remaining!==Math.max(0,(a.input.extraAttack?2:1)-used)||n.id!==a.input.attackActionId)issues.push('Only the original attack spends its actual one Attack credit/Extra Attack; carries never repeat or reset it.')
  }
  if(d&&(d.hpBefore!==a.input.originHp.current||d.hpMax!==a.input.originHp.max))issues.push('Original damage retains real full HP before the hit and its current source maximum, never the catalogue average.')
  let remaining=cleavingInitialRemainder(a),terminal=remaining===0,lifecycleDiscard=0
  const adjustments=d?.damageAdjustment,temp=rec(d?.temporaryHp),expectedBlocked=remaining>0&&(Number(temp?.absorbed??0)!==0||Array.isArray(adjustments)&&adjustments.length>0||Boolean(d?.fortitude))?'unexpected_damage_context_requires_explicit_stop':undefined
  if(a.blockedReason!==expectedBlocked)issues.push('An unexpected original damage defense retains its explicit carry limitation; deleting that limit cannot invent transparent damage.')
  let terminalReason=terminal?(!r?.hit?'origin_missed':Number(d?.hpAfter)>0?'origin_survived':'no_remaining_damage'):undefined
  let discarded=0;const seen=new Set([a.input.targetId]);if(new Set(a.order).size!==a.order.length||a.order.length!==Object.keys(a.steps).length)issues.push('Each explicit source choice has one exact ordered nonce and receipt.')
  for(const key of a.order){
   const step=a.steps[key];if(step)discarded+=step.discarded;if(!step){issues.push('Retain every original ordered cleaving choice.');continue}
   if(terminal||step.input.stepId!==key||step.input.cleaveId!==id||step.inputWitness!==witness(step.input)||step.incoming!==remaining||step.attackRollWitness!==a.attackRollWitness||step.resultWitness!==witness(step.result))issues.push('A carry or stop is one explicit original choice using the same source d20 and remaining damage.')
   if(step.targetWitness!==(step.target?witness(step.target):undefined)||step.damageWitness!==(step.damage?witness(step.damage):undefined))issues.push('Every selected body and applied numeric damage retain their exact source witnesses.')
   if(step.input.choice==='stop'){
    if(step.input.targetId!==undefined||step.outgoing!==0||step.discarded!==remaining||step.reason!=='explicit_user_stop')issues.push('Explicit voluntary stop discards only unspent remaining damage under the recorded user convention.')
    remaining=0;terminal=true;terminalReason='explicit_user_stop';continue
   }
   const t=step.target,damage=step.damage,rr=rec(r?.attackRoll),natural=Number(r?.naturalRoll),canHit=Boolean(a.naturalCritical||natural!==1&&Number(rr?.total)>=Number(step.targetAC))
   if(!t||!step.input.targetId||seen.has(step.input.targetId)||step.targetWitness!==witness(t)||t.id!==step.input.targetId||step.hit!==canHit)issues.push('Each real legal secondary is explicitly selected once, in attacker reach, against its actual AC with the same original attack roll.')
   if(step.input.targetId)seen.add(step.input.targetId)
   if(!canHit){if(damage||step.outgoing!==0||step.discarded!==remaining||step.reason!=='original_roll_missed')issues.push('An admissible missed secondary TERMINATES the chain, not a retry preflight error.');remaining=0;terminal=true;terminalReason='original_roll_missed';continue}
   if(!damage||step.damageWitness!==witness(damage)||damage.rawDamage!==remaining||damage.hpBefore!==Number(rec(t?.hp)?.current)||damage.hpMax!==Number(rec(t?.hp)?.max))issues.push('A successful carry applies its exact remaining numeric damage once, without fresh dice or modifiers.')
   const next=Math.max(0,remaining-Number(damage?.hpLost)),full=Number(rec(t?.hp)?.current)===Number(rec(t?.hp)?.max),continues=full&&Number(damage?.hpAfter)===0&&next>0
   if(step.outgoing!==(continues?next:0)||step.discarded!==(continues?0:next))issues.push('Only an undamaged secondary reduced to zero repeats; a wounded target may take damage then ends the chain.')
   remaining=continues?next:0;terminal=!continues;terminalReason=continues?undefined:!full?'secondary_already_damaged':Number(damage?.hpAfter)>0?'secondary_survived':'remaining_exhausted'
   if(step.reason!==(terminalReason??'next_choice_available'))issues.push('The actual hit/full-HP/zero-HP result determines its printed continuation or stop reason.')
  }
  if(a.lifeWitness){lifecycleDiscard=remaining;const lifeHp=rec(a.lifeWitness.hp),conditions=a.lifeWitness.conditions,unavailable=Number(lifeHp?.current)<=0||a.lifeWitness.dead===true||Array.isArray(conditions)&&conditions.some(c=>['incapacitated','unconscious','stunned','paralyzed','petrified'].includes(String(c)));if(!unavailable)issues.push('A historical lifecycle termination must actually attest HP0/death/incapacity, not a healthy body or a current recovery state.');if(a.lifeWitnessHash!==witness(a.lifeWitness)||a.closeReason!=='actual_actor_unavailable'||a.status!=='closed'||a.remaining!==0||a.discarded!==discarded+remaining)issues.push('Actual actor death/incapacity stops the real retained chain without rollback or fabricated player choice.');remaining=0;terminal=true;terminalReason='actual_actor_unavailable'}
  else if(a.lifeWitnessHash!==undefined)issues.push('Retain actual lifecycle termination provenance.')
  if(a.discarded!==discarded+lifecycleDiscard)issues.push('Only the exact unspent numeric remainder is discarded, never actual prior damage or costs.')
  if(a.status==='closed'&&a.closeReason!==terminalReason||a.status==='awaiting_choice'&&a.closeReason!==undefined)issues.push('Retain the actual printed/user/lifecycle reason for closure, not a hidden stop.')
  if(a.status==='awaiting_choice'&&(s.player.hp.current<=0||s.player.deathSaves?.dead||s.player.conditions.some(c=>['incapacitated','unconscious','stunned','paralyzed','petrified'].includes(c))))issues.push('Actual actor unavailability requires its retained lifecycle termination, not an imported open choice with no witness.')
  if(a.remaining!==remaining||a.status==='awaiting_choice'&&(terminal||a.turnKey!==cleavingTurnKey(s)||a.mapId!==s.currentMapId||s.phase!=='combat'||s.currentTurn!=='player')||a.status==='closed'&&!terminal)issues.push('The exact retained remainder and actual source turn determine a live explicit choice or a terminal receipt.')
 }
 if(active>1||pendingIsCleaving(p)&&(!link||!data.events[link]||data.events[link].status!=='held_attack'))issues.push('Exactly one live cleaving source owns its original held attack or pending choice; no orphan/terminal link is accepted.')
 return issues
}
