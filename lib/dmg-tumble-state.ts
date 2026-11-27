import { z } from 'zod'
import type { GameState } from './types'
import { overrunContext,overrunBudget,overrunTurnKey,overrunWitness as witness,effectiveOverrunGrant,pendingIsOverrun } from './dmg-overrun-state'

export const TUMBLE_SOURCE = 'dmg-2014:Tumble:fa75462a6ef96ef0f86fbfd2d433c624ce926ff630a43d1fcaea6a2c1249b0d1:9193-9195,9232-9234'
const Cell = z.object({x:z.number().int().nonnegative(),y:z.number().int().nonnegative()}).strict()
const Value = z.record(z.string(),z.unknown())
export const TumbleInputSchema = z.object({targetId:z.string().min(1),cost:z.enum(['action','bonus_action']),path:z.tuple([Cell,Cell,Cell])}).strict()
const Budget = z.object({credits:z.number().int().min(0).max(2),actionUsed:z.boolean(),bonusUsed:z.boolean(),attackAction:z.unknown()}).strict()
const Attempt = z.object({
  id:z.string(),source:z.literal(TUMBLE_SOURCE),input:TumbleInputSchema,inputWitness:z.string(),
  turnKey:z.string(),mapId:z.string(),at:z.number().nonnegative(),contextWitness:z.string(),
  sizesWitness:z.string(),plan:Value,planWitness:z.string(),
  sizes:z.object({mover:z.enum(['Small','Medium']),target:z.enum(['Small','Medium']),advantage:z.boolean(),disadvantage:z.boolean(),playerFact:Value}).strict(),
  status:z.enum(['rolling','held_check','ready','reaction','stopped','failed','complete']),
  firstCheck:Value.optional(),firstCheckWitness:z.string().optional(),opposition:Value.optional(),oppositionWitness:z.string().optional(),
  pendingCheckWitness:z.string().optional(),paid:z.boolean(),payment:z.object({before:Budget,after:Budget}).strict().optional(),paymentWitness:z.string().optional(),
  reactionResults:z.array(Value).optional(),reactionResultsWitness:z.string().optional(),used:z.boolean(),windows:z.record(z.string(),z.string()),result:Value.optional(),resultWitness:z.string().optional(),
}).strict()
export const TumbleStateSchema = z.object({version:z.literal(1),attempts:z.record(z.string(),Attempt).refine(a=>Object.keys(a).length<=256)}).strict()
export type TumbleAttempt = z.infer<typeof Attempt>
export type TumbleInput = z.infer<typeof TumbleInputSchema>
export const tumbleWitness = witness
export const tumbleTurnKey=overrunTurnKey
export const tumbleBudget=overrunBudget
export const tumbleContext=overrunContext

type Pending = NonNullable<GameState['hero']>['pending']
export function tumblePendingLink(pending:Pending):string|undefined{
  const r=pending?.command.toolkitResolution as {domain?:string;command?:{tumbleId?:string}}|undefined
  if(r?.domain==='dmg-tumble-contest')return r.command?.tumbleId
  if(pending?.command.type==='movement'&&typeof pending.command.tumbleId==='string')return pending.command.tumbleId
  const c=pending?.continuation
  if(c?.type==='movement'&&typeof c.tumbleId==='string')return c.tumbleId
  if(c?.type==='engine-effect'&&c.domain==='dmg-tumble')return (c.command as {eventId?:string}|undefined)?.eventId
}
export function pendingIsTumble(pending:Pending){const r=pending?.command.toolkitResolution as{domain?:string}|undefined,c=pending?.continuation;return r?.domain==='dmg-tumble-contest'||tumblePendingLink(pending)!==undefined||pending?.command.type==='movement'&&Object.hasOwn(pending.command,'tumbleId')||c?.type==='movement'&&Object.hasOwn(c,'tumbleId')||c?.type==='engine-effect'&&c.domain==='dmg-tumble'}
const windowWitness=(pending:Pending)=>pending?witness({id:pending.id,kind:pending.kind,sourceId:pending.sourceId,targetId:pending.targetId,options:pending.options,command:pending.command,roll:pending.roll,damageRoll:pending.damageRoll,continuation:pending.continuation}):''
export function effectiveTumbleGrant(state:GameState,attempt:TumbleAttempt){return attempt.paid&&!attempt.used&&['ready','reaction','stopped'].includes(attempt.status)&&state.phase==='combat'&&state.currentTurn==='player'&&attempt.turnKey===tumbleTurnKey(state)&&attempt.mapId===state.currentMapId&&!state.player.deathSaves?.dead}
export function recordTumbleHeldWindow(state:GameState){
  const pending=state.hero?.pending;if(!pending)return
  const id=tumblePendingLink(pending),r=pending.command.toolkitResolution as{domain?:string}|undefined
  const attempt=id?state.dmTools?.tumble?.attempts[id]:Object.values(state.dmTools?.tumble?.attempts??{}).find(a=>a.status==='reaction'&&effectiveTumbleGrant(state,a))
  if(!attempt)return
  if(r?.domain==='dmg-tumble-contest'){attempt.status='held_check';attempt.pendingCheckWitness=windowWitness(pending)}
  else{attempt.status='reaction';attempt.windows[pending.id]=windowWitness(pending)}
}
export function tumbleCheckBodyLocked(state:GameState,id:string){return Object.values(state.dmTools?.tumble?.attempts??{}).some(a=>a.status==='held_check'&&(id==='player'||id===a.input.targetId))}
export function tumbleCheckTransitionIssue(state:GameState){return Object.values(state.dmTools?.tumble?.attempts??{}).some(a=>['rolling','held_check','reaction'].includes(a.status))?{code:'TUMBLE_PENDING',message:'Resolve the exact Tumble check or actual pre-entry reaction before leaving this turn, combat or map.'}:null}
export function crossingPermissionConflict(state:GameState){
  const tumbles=Object.values(state.dmTools?.tumble?.attempts??{}),overruns=Object.values(state.dmTools?.overrun?.attempts??{}),turn=tumbleTurnKey(state)
  const currentCheck=(a:{status:string;turnKey:string;mapId:string})=>['rolling','held_check','reaction'].includes(a.status)&&a.turnKey===turn&&a.mapId===state.currentMapId
  const tumbleGrant=tumbles.some(a=>effectiveTumbleGrant(state,a)),overrunGrant=overruns.some(a=>effectiveOverrunGrant(state,a))
  return tumbleGrant&&(overrunGrant||overruns.some(currentCheck))||overrunGrant&&tumbles.some(currentCheck)
}
export function validateTumbleState(state:GameState):string[]{
  const data=state.dmTools?.tumble,link=tumblePendingLink(state.hero?.pending)
  if(!data)return pendingIsTumble(state.hero?.pending)?['A pending Tumble cannot lose its original source register.']:[]
  if(!TumbleStateSchema.safeParse(data).success)return ['Retain the exact bounded Tumble source schema.']
  const issues:string[]=[];let unresolved=0
  if(pendingIsTumble(state.hero?.pending)&&!link)issues.push('The original pending Tumble requires its exact source event ID before any bonus or die.')
  for(const [id,a]of Object.entries(data.attempts)){
    if(id!==a.id||a.source!==TUMBLE_SOURCE||a.inputWitness!==witness(a.input)||a.sizesWitness!==witness(a.sizes)||a.planWitness!==witness(a.plan))issues.push('Retain the exact original Tumble source, target, cost choice and three-cell route.')
    if(a.sizes.advantage||a.sizes.disadvantage||a.sizes.playerFact.size!==a.sizes.mover)issues.push('Tumble grants no size advantage or disadvantage; actual Small/Medium sizing remains only the represented physical footprint.')
    if(a.firstCheck&&a.firstCheck.ability!=='dex'||a.opposition&&a.opposition.ability!=='dex')issues.push('Both retained Tumble source checks use Dexterity; no Strength opposition is substituted.')
    if(a.firstCheckWitness!==(a.firstCheck?witness(a.firstCheck):undefined)||a.oppositionWitness!==(a.opposition?witness(a.opposition):undefined))issues.push('Retain each actual opposed Athletics check and its original d20.')
    if(a.reactionResultsWitness!==(a.reactionResults?witness(a.reactionResults):undefined))issues.push('Retain each actually resolved pre-entry reaction and its original consequences.')
    if(a.resultWitness!==(a.result?witness(a.result):undefined))issues.push('An Tumble result is its retained actual result, never a new crossing or cost.')
    if(['rolling','held_check'].includes(a.status)){
      unresolved++
      if(a.status!=='held_check'||a.paid||a.used||link!==id||a.pendingCheckWitness!==windowWitness(state.hero?.pending)||a.contextWitness!==tumbleContext(state,a.input.targetId)||a.turnKey!==tumbleTurnKey(state)||a.mapId!==state.currentMapId)issues.push('A held Tumble retains its unspent original check, actual bodies, sizes, route and turn through SQL.')
    }else{
      if(!a.paid||!a.firstCheck||!a.opposition||!a.payment||a.paymentWitness!==witness(a.payment))issues.push('The completed contest retains both checks and its one original action or bonus payment.')
      else{
        const {before,after}=a.payment
        if(witness(before.attackAction)!==witness(after.attackAction)||a.input.cost==='action'&&(before.credits<=0||after.credits!==before.credits-1||after.actionUsed!==(after.credits===0)||after.bonusUsed!==before.bonusUsed)||a.input.cost==='bonus_action'&&(before.bonusUsed||!after.bonusUsed||after.credits!==before.credits||after.actionUsed!==before.actionUsed))issues.push('Tumble spends one whole selected action or bonus, never an Extra Attack or a second payment.')
        const won=Number((a.firstCheck.roll as {total?:number})?.total)>Number((a.opposition.roll as {total?:number})?.total)
        if(won===(a.status==='failed')||a.used!==(a.status==='complete'))issues.push('Only a won source contest grants its one actually completed traversal; ties preserve the prior position.')
      }
      if(a.status==='reaction'){
        unresolved++
        if(!effectiveTumbleGrant(state,a)||link!==id||!state.hero?.pending||a.windows[state.hero.pending.id]!==windowWitness(state.hero.pending))issues.push('The actual reaction remains before occupied entry, linked to its exact original crossing and retained dice.')
      }
    }
  }
  if(pendingIsTumble(state.hero?.pending)){const owner=typeof link==='string'?data.attempts[link]:undefined;if(!owner||!['held_check','reaction'].includes(owner.status))issues.push('A current Tumble pending belongs to one live original check or reaction, never a terminal or inactive paid event.')}
  if(pendingIsTumble(state.hero?.pending)&&pendingIsOverrun(state.hero?.pending))issues.push('One current movement continuation cannot claim both source modes.')
  if(crossingPermissionConflict(state))issues.push('A won unused crossing permission cannot be hidden by the other mode grant or an unpaid live check; retain or explicitly continue the original permission.')
  if(unresolved>1||link&&!data.attempts[link])issues.push('Only one exact live Tumble continuation owns the current window.')
  return issues
}
