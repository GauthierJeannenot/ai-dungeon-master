import { OilFirePlanSchema,type OilFirePlan } from '../lib/oil-state'
import { toolkitError,toolkitState } from './toolkit'
import * as gs from './game-state'
export function oilState(){return toolkitState().oil??={version:1 as const,coatings:{},patches:{},damageTurns:{},fireReceipts:{},receipts:{}}}
/** Commit the same already-resolved simultaneous packet; never calls damage. */
export function commitOilFireDamage(plan:OilFirePlan,packet:Record<string,unknown>){
  OilFirePlanSchema.parse(plan)
  const state=gs.getState(),oil=state.dmTools?.oil,receipt=oil?.receipts[plan.useId]
  if(!receipt||plan.at>(state.worldTimeSeconds??0))toolkitError('OIL_FIRE_SOURCE_REQUIRED','The five additional fire damage need their actual retained oil application and damage event.')
  const prior=oil!.fireReceipts[plan.eventId]
  if(prior){if(JSON.stringify(prior.plan)!==JSON.stringify(plan))toolkitError('OIL_FIRE_EVENT_CONFLICT','This oil-fire event already has a different physical source.');return}
  oil!.fireReceipts[plan.eventId]={plan:structuredClone(plan),packet:structuredClone(packet)}
}
