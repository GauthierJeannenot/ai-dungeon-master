import type { DamageType } from '../lib/types'
import { ObjectDamageProfileSchema, ObjectDamageTypeSchema, type ObjectDamageProfile } from '../lib/object-damage-state'

export interface ObjectDamageComponent { type:DamageType; amount:number }
/** One attack/effect, with each damage type combined before resistance. DMG
 * does not explicitly order thresholds versus resistance. This engine compares
 * the threshold to damage after PHB resistance/vulnerability (damage the object
 * would actually take), then applies the whole qualifying amount, never a tax.
 * Source: DMG Objects pp.246–247; Magic Item Resilience p.141; PHB p.197. */
export function resolveObjectDamage(components: readonly ObjectDamageComponent[], savedProfile?: ObjectDamageProfile, inheritObjectImmunities = true) {
  const profile=savedProfile ? ObjectDamageProfileSchema.parse(savedProfile) : undefined
  const combined=new Map<DamageType,number>()
  for(const component of components){
    ObjectDamageTypeSchema.parse(component.type)
    if(!Number.isSafeInteger(component.amount)||component.amount<0)throw new Error('Object damage must be a nonnegative safe integer.')
    const total=(combined.get(component.type)??0)+component.amount
    if(!Number.isSafeInteger(total))throw new Error('Combined object damage exceeds the safe integer range.')
    combined.set(component.type,total)
  }
  const typed=Array.from(combined,([type,rawDamage])=>{
    const immune=inheritObjectImmunities&&(type==='poison'||type==='psychic')||Boolean(profile?.immunities.includes(type))
    const resistant=Boolean(profile?.magicalResilience||profile?.resistances.includes(type))
    const vulnerable=Boolean(profile?.vulnerabilities.includes(type))
    let applicableDamage=immune ? 0 : rawDamage
    if(!immune&&resistant)applicableDamage=Math.floor(applicableDamage/2)
    if(!immune&&vulnerable)applicableDamage*=2
    return {type,rawDamage,immune,resistant,vulnerable,applicableDamage}
  })
  const rawDamage=typed.reduce((total,part)=>total+part.rawDamage,0)
  const applicableDamage=typed.reduce((total,part)=>total+part.applicableDamage,0)
  const damageThreshold=profile?.damageThreshold??0,thresholdMet=applicableDamage>=damageThreshold
  return {components:typed,rawDamage,applicableDamage,damageThreshold,thresholdMet,
    damageDealt:thresholdMet?applicableDamage:0,
    thresholdPolicy:'after_resistance_and_vulnerability' as const,
    thresholdPolicyBasis:'engine_interpretation' as const}
}
