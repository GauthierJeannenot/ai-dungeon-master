import { z } from 'zod'
import { chaseStateOf,chaseFatigue,chaseWitness } from '../lib/chase-state'
import { inspectRestPeriod } from '../lib/rest-state'
import * as gs from './game-state'
import { available, now } from './hero-rules'
import { toolkitError,toolkitState } from './toolkit'
import { changeExhaustion } from './exhaustion'
import { validateRecordedRestCompletion,type RecordedRestCompletion } from './resting'

const Id=z.string().min(1).max(100)
export const AdjudicateChaseRestSchema=z.object({eventId:Id,restId:Id,choice:z.enum(['chase_recovery_applies','armor_prevents_chase_recovery']),reason:z.string().trim().min(1).max(1000)}).strict()
function conflict(period:import('../lib/rest-state').RestSession){return period.kind==='long'&&chaseFatigue(gs.getState(),'player')>0&&gs.getState().dmTools?.sleep?.policy?.armorRecovery===true&&period.segments.some(s=>s.to>s.from&&s.activity==='sleep'&&['medium','heavy'].includes(s.sleepArmor?.category??'none'))}
export function adjudicateChaseRest(raw:unknown){
 const input=AdjudicateChaseRestSchema.parse(raw),data=chaseStateOf(gs.getState()),command=chaseWitness({operation:'adjudicate-chase-rest',input}),old=data?.receipts[input.eventId]
 if(old){if(old.command!==command)toolkitError('CHASE_REST_EVENT_CONFLICT','Retain the exact original explicit ruling.');return{...old.result,replayed:true}}
 available({allowSleepDue:true});const period=gs.getState().dmTools?.rests?.active
 if(!data||!period||period.restId!==input.restId||!inspectRestPeriod(period).eligible||period.creditedUntil!==now()||!conflict(period))toolkitError('CHASE_REST_CONFLICT_NOT_PRESENT','This ruling is only for an actual eligible player long-rest period with recorded medium/heavy armored sleep, explicitly adopted XGE armor recovery and actual remaining chase fatigue.')
 if(data!.restRulings[input.restId]?.periodWitness===chaseWitness(period))toolkitError('CHASE_REST_RULING_RETAINED','The exact actual period already has its immutable structured conflict decision.')
 if(Object.keys(data!.receipts).length>=4096)toolkitError('CHASE_RECEIPT_LIMIT','Retain source ruling receipt capacity before adoption.')
 const result={operation:'chase-rest-ruling',restId:input.restId,choice:input.choice,reason:input.reason,input,periodSnapshot:structuredClone(period!),periodWitness:chaseWitness(period),benefitsGranted:false,timeAdvanced:0,globalPolicyChanged:false}
 data!.restRulings[input.restId]={input,command:chaseWitness(input),periodWitness:chaseWitness(period),periodSnapshot:structuredClone(period!),at:now()};data!.receipts[input.eventId]={command,result,at:now()};return result
}
export function preflightChaseRestRecovery(completion:RecordedRestCompletion){
 validateRecordedRestCompletion(completion,completion.kind)
 const period=gs.getState().dmTools!.rests!.active!,data=chaseStateOf(gs.getState()),levels=chaseFatigue(gs.getState(),'player')
 if(!levels)return{levels:0,recover:false}
 if(conflict(period)){
  const ruling=data?.restRulings[period.restId]
  if(!ruling||ruling.periodWitness!==chaseWitness(period))toolkitError('CHASE_ARMOR_REST_ADJUDICATION_REQUIRED','DMG chase recovery and explicitly adopted XGE armored-sleep recovery conflict for this actual period. Choose adjudicate_chase_rest_recovery before finish_rest; no priority is invented.')
  if(ruling!.input.choice==='armor_prevents_chase_recovery')return{levels,recover:false,ruling:ruling!.input}
 }
 if(Object.keys(gs.getState().dmTools?.exhaustion?.receipts??{}).length>=2048)toolkitError('EXHAUSTION_RECEIPT_LIMIT','The actual rest must have capacity for its source-specific fatigue removal before any benefit or die.')
 return{levels,recover:true}
}
export function recoverChaseRest(completion:RecordedRestCompletion){
 const prepared=preflightChaseRestRecovery(completion);if(!prepared.recover)return{...prepared,source:'DMG2014 chase; explicit actual rest only'}
 const result=changeExhaustion({eventId:`\u0000chase-rest:${completion.restId}`,targetId:'player',operation:'remove',levels:prepared.levels,reason:'DMG2014 chase: actual recorded short/long rest removes only remaining chase-source exhaustion.'},{removalSource:'chase'})
 return{...prepared,result,source:'DMG2014 chase; explicit actual rest only',npcFatigueRecovered:false}
}
