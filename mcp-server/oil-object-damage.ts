import { fullyImmersedInWater,underwaterFireDefenseIssue } from '../lib/underwater-rules'
import { randomUUID } from 'node:crypto'
import { inspectOilFireDamage } from '../lib/oil-state'
import type { ObjectDamageProfile } from '../lib/object-damage-state'
import { resolveObjectDamage,type ObjectDamageComponent } from './object-damage'
import { commitOilFireDamage } from './oil-fire'
import { toolkitError } from './toolkit'
import * as gs from './game-state'
/** One real scene-object damage instance, including its own type defenses and
 * threshold. Oil cannot turn an ineffective base fire into an ignition. */
export function resolveOiledObjectDamage(objectId:string,components:readonly ObjectDamageComponent[],profile?:ObjectDamageProfile,eventId=randomUUID()){
 const issue=components.some(part=>part.type==='fire'&&part.amount>0)?underwaterFireDefenseIssue(gs.getState(),{kind:'object',objectId}):null;if(issue)toolkitError(issue.code,issue.message)
 if(fullyImmersedInWater(gs.getState(),{kind:'object',objectId})===true)profile={reason:profile?.reason??'PHB2014 whole immersion in actual observed water',immunities:[],vulnerabilities:[],damageThreshold:0,magicalResilience:false,...profile,resistances:[...new Set([...(profile?.resistances??[]),'fire' as const])]}
 const requestWitness=JSON.stringify({objectId,components,profile})
 const inheritObjectImmunities=!gs.getState().dmTools?.objects[objectId]?.razorvine
 const base=resolveObjectDamage(components,profile,inheritObjectImmunities)
 const inspection=inspectOilFireDamage(gs.getState(),{targetKind:'object',targetId:objectId,eventId,
  components:base.components.map(part=>({type:part.type,rawAmount:part.rawDamage,damageAfterDefenses:base.thresholdMet?part.applicableDamage:0}))})
 if(inspection.issue)toolkitError(inspection.issue.code,inspection.issue.message)
 if(inspection.replay){
  if(inspection.replay.requestWitness!==requestWitness)toolkitError('OIL_FIRE_EVENT_CONFLICT','This actual object-fire event already retains different source components or defenses.')
  return inspection.replay.result as ReturnType<typeof resolveObjectDamage>&{oilFire?:unknown}
 }
 if(!inspection.plan)return base
 const combined=components.filter(part=>part.type!=='fire'),fire=components.filter(part=>part.type==='fire').reduce((sum,part)=>sum+part.amount,0)
 const result={...resolveObjectDamage([...combined,{type:'fire',amount:fire+5}],profile,inheritObjectImmunities),oilFire:inspection.plan}
 commitOilFireDamage(inspection.plan,{result,requestWitness});return result
}
