import { z } from 'zod'
import type { GameState } from './types'
import { shoveAsideContext, shoveAsideWitness as witness } from './dmg-shove-aside-state'

export const OVERRUN_SOURCE = 'dmg-2014:Overrun:fa75462a6ef96ef0f86fbfd2d433c624ce926ff630a43d1fcaea6a2c1249b0d1:9193-9195,9224-9226'
const Cell = z.object({x:z.number().int().nonnegative(),y:z.number().int().nonnegative()}).strict()
const Value = z.record(z.string(),z.unknown())
export const OverrunInputSchema = z.object({targetId:z.string().min(1),cost:z.enum(['action','bonus_action']),path:z.tuple([Cell,Cell,Cell])}).strict()
const Budget = z.object({credits:z.number().int().min(0).max(2),actionUsed:z.boolean(),bonusUsed:z.boolean(),attackAction:z.unknown()}).strict()
const Attempt = z.object({
  id:z.string(),source:z.literal(OVERRUN_SOURCE),input:OverrunInputSchema,inputWitness:z.string(),
  turnKey:z.string(),mapId:z.string(),at:z.number().nonnegative(),contextWitness:z.string(),
  sizesWitness:z.string(),plan:Value,planWitness:z.string(),
  sizes:z.object({mover:z.enum(['Small','Medium']),target:z.enum(['Small','Medium']),advantage:z.boolean(),disadvantage:z.boolean(),playerFact:Value}).strict(),
  status:z.enum(['rolling','held_check','ready','reaction','stopped','failed','complete']),
  firstCheck:Value.optional(),firstCheckWitness:z.string().optional(),opposition:Value.optional(),oppositionWitness:z.string().optional(),
  pendingCheckWitness:z.string().optional(),paid:z.boolean(),payment:z.object({before:Budget,after:Budget}).strict().optional(),paymentWitness:z.string().optional(),
  reactionResults:z.array(Value).optional(),reactionResultsWitness:z.string().optional(),used:z.boolean(),windows:z.record(z.string(),z.string()),result:Value.optional(),resultWitness:z.string().optional(),
}).strict()
export const OverrunStateSchema = z.object({version:z.literal(1),attempts:z.record(z.string(),Attempt).refine(a=>Object.keys(a).length<=256)}).strict()
export type OverrunAttempt = z.infer<typeof Attempt>
export type OverrunInput = z.infer<typeof OverrunInputSchema>
export const overrunWitness = witness
export const overrunTurnKey = (state:GameState)=>`${state.combatGeneration??0}:${state.turnCounter??0}:${state.round}:${state.currentTurn??''}`
export function overrunBudget(state:GameState){return {credits:state.hero?.actionCredits??0,actionUsed:Boolean(state.actionUsed.player),bonusUsed:Boolean(state.bonusActionUsed?.player),attackAction:state.hero?.attackAction??null}}
export function overrunContext(state:GameState,targetId:string){return witness({
  bodyAndGeometry:shoveAsideContext(state,targetId),speed:state.player.speed,bonusUsed:state.bonusActionUsed?.player,
  sizing:state.dmTools?.carrying?.actors.player,
  otherBodies:Object.values(state.monsters).map(body=>({id:body.id,position:body.position,hp:body.hp,conditions:body.conditions,type:body.type,statBlock:body.statBlock,hostile:body.hostile})),
})}
type Pending = NonNullable<GameState['hero']>['pending']
export function overrunPendingLink(pending:Pending):string|undefined{
  const r=pending?.command.toolkitResolution as {domain?:string;command?:{overrunId?:string}}|undefined
  if(r?.domain==='dmg-overrun-contest')return r.command?.overrunId
  if(pending?.command.type==='movement'&&typeof pending.command.overrunId==='string')return pending.command.overrunId
  const c=pending?.continuation
  if(c?.type==='movement'&&typeof c.overrunId==='string')return c.overrunId
  if(c?.type==='engine-effect'&&c.domain==='dmg-overrun')return (c.command as {eventId?:string}|undefined)?.eventId
}
export function pendingIsOverrun(pending:Pending){const r=pending?.command.toolkitResolution as{domain?:string}|undefined,c=pending?.continuation;return r?.domain==='dmg-overrun-contest'||overrunPendingLink(pending)!==undefined||pending?.command.type==='movement'&&Object.hasOwn(pending.command,'overrunId')||c?.type==='movement'&&Object.hasOwn(c,'overrunId')||c?.type==='engine-effect'&&c.domain==='dmg-overrun'}
const windowWitness=(pending:Pending)=>pending?witness({id:pending.id,kind:pending.kind,sourceId:pending.sourceId,targetId:pending.targetId,options:pending.options,command:pending.command,roll:pending.roll,damageRoll:pending.damageRoll,continuation:pending.continuation}):''
export function effectiveOverrunGrant(state:GameState,attempt:OverrunAttempt){return attempt.paid&&!attempt.used&&['ready','reaction','stopped'].includes(attempt.status)&&state.phase==='combat'&&state.currentTurn==='player'&&attempt.turnKey===overrunTurnKey(state)&&attempt.mapId===state.currentMapId&&!state.player.deathSaves?.dead}
export function recordOverrunHeldWindow(state:GameState){
  const pending=state.hero?.pending;if(!pending)return
  const id=overrunPendingLink(pending),r=pending.command.toolkitResolution as{domain?:string}|undefined
  const attempt=id?state.dmTools?.overrun?.attempts[id]:Object.values(state.dmTools?.overrun?.attempts??{}).find(a=>a.status==='reaction'&&effectiveOverrunGrant(state,a))
  if(!attempt)return
  if(r?.domain==='dmg-overrun-contest'){attempt.status='held_check';attempt.pendingCheckWitness=windowWitness(pending)}
  else{attempt.status='reaction';attempt.windows[pending.id]=windowWitness(pending)}
}
export function overrunCheckBodyLocked(state:GameState,id:string){return Object.values(state.dmTools?.overrun?.attempts??{}).some(a=>a.status==='held_check'&&(id==='player'||id===a.input.targetId))}
export function overrunCheckTransitionIssue(state:GameState){return Object.values(state.dmTools?.overrun?.attempts??{}).some(a=>['rolling','held_check','reaction'].includes(a.status))?{code:'OVERRUN_PENDING',message:'Resolve the exact Overrun check or actual pre-entry reaction before leaving this turn, combat or map.'}:null}
export function validateOverrunState(state:GameState):string[]{
  const data=state.dmTools?.overrun,link=overrunPendingLink(state.hero?.pending)
  if(!data)return pendingIsOverrun(state.hero?.pending)?['A pending Overrun cannot lose its original source register.']:[]
  if(!OverrunStateSchema.safeParse(data).success)return ['Retain the exact bounded Overrun source schema.']
  const issues:string[]=[];let unresolved=0
  if(pendingIsOverrun(state.hero?.pending)&&!link)issues.push('The original pending Overrun requires its exact source event ID before any bonus or die.')
  for(const [id,a]of Object.entries(data.attempts)){
    if(id!==a.id||a.source!==OVERRUN_SOURCE||a.inputWitness!==witness(a.input)||a.sizesWitness!==witness(a.sizes)||a.planWitness!==witness(a.plan))issues.push('Retain the exact original Overrun source, target, cost choice and three-cell route.')
    const difference=a.sizes.mover==='Medium'&&a.sizes.target==='Small'?1:a.sizes.mover==='Small'&&a.sizes.target==='Medium'?-1:0
    if(a.sizes.advantage!==(difference>0)||a.sizes.disadvantage!==(difference<0)||a.sizes.playerFact.size!==a.sizes.mover)issues.push('The exact actual size qualification determines source advantage or disadvantage.')
    if(a.firstCheckWitness!==(a.firstCheck?witness(a.firstCheck):undefined)||a.oppositionWitness!==(a.opposition?witness(a.opposition):undefined))issues.push('Retain each actual opposed Athletics check and its original d20.')
    if(a.reactionResultsWitness!==(a.reactionResults?witness(a.reactionResults):undefined))issues.push('Retain each actually resolved pre-entry reaction and its original consequences.')
    if(a.resultWitness!==(a.result?witness(a.result):undefined))issues.push('An Overrun result is its retained actual result, never a new crossing or cost.')
    if(['rolling','held_check'].includes(a.status)){
      unresolved++
      if(a.status!=='held_check'||a.paid||a.used||link!==id||a.pendingCheckWitness!==windowWitness(state.hero?.pending)||a.contextWitness!==overrunContext(state,a.input.targetId)||a.turnKey!==overrunTurnKey(state)||a.mapId!==state.currentMapId)issues.push('A held Overrun retains its unspent original check, actual bodies, sizes, route and turn through SQL.')
    }else{
      if(!a.paid||!a.firstCheck||!a.opposition||!a.payment||a.paymentWitness!==witness(a.payment))issues.push('The completed contest retains both checks and its one original action or bonus payment.')
      else{
        const {before,after}=a.payment
        if(witness(before.attackAction)!==witness(after.attackAction)||a.input.cost==='action'&&(before.credits<=0||after.credits!==before.credits-1||after.actionUsed!==(after.credits===0)||after.bonusUsed!==before.bonusUsed)||a.input.cost==='bonus_action'&&(before.bonusUsed||!after.bonusUsed||after.credits!==before.credits||after.actionUsed!==before.actionUsed))issues.push('Overrun spends one whole selected action or bonus, never an Extra Attack or a second payment.')
        const won=Number((a.firstCheck.roll as {total?:number})?.total)>Number((a.opposition.roll as {total?:number})?.total)
        if(won===(a.status==='failed')||a.used!==(a.status==='complete'))issues.push('Only a won source contest grants its one actually completed traversal; ties preserve the prior position.')
      }
      if(a.status==='reaction'){
        unresolved++
        if(!effectiveOverrunGrant(state,a)||link!==id||!state.hero?.pending||a.windows[state.hero.pending.id]!==windowWitness(state.hero.pending))issues.push('The actual reaction remains before occupied entry, linked to its exact original crossing and retained dice.')
      }
    }
  }
  if(pendingIsOverrun(state.hero?.pending)){const owner=typeof link==='string'?data.attempts[link]:undefined;if(!owner||!['held_check','reaction'].includes(owner.status))issues.push('A current Overrun pending belongs to one live original check or reaction, never a terminal or inactive paid event.')}
  if(unresolved>1||link&&!data.attempts[link])issues.push('Only one exact live Overrun continuation owns the current window.')
  return issues
}
