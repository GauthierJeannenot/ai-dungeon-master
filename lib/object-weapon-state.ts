import { z } from 'zod'
import type { GameState } from './types'
import { groundGearPhysicalWitness as witness } from './ground-gear-recovery-state'
const Id=z.string().min(1).max(180),Value=z.record(z.string(),z.unknown())
export const ObjectWeaponAttackSchema=z.object({eventId:Id,objectId:Id,weaponId:Id,attackMode:z.enum(['melee','thrown']).optional(),ammunitionItemId:Id.optional(),weaponHands:z.union([z.literal(1),z.literal(2)]).optional(),weaponAbility:z.enum(['str','dex']).optional(),targetCell:z.object({x:z.number().int().nonnegative(),y:z.number().int().nonnegative()}).strict().optional(),newAttackAction:z.boolean().optional()}).strict()
export const ObjectWeaponAttackStateSchema=z.object({version:z.literal(1),attacks:z.record(z.string(),z.object({input:ObjectWeaponAttackSchema,command:z.string(),context:Value,contextCommand:z.string(),originalRoll:Value,rollCommand:z.string(),status:z.enum(['held','completed']),at:z.number().nonnegative(),result:Value.optional()}).strict())}).strict()
export type ObjectWeaponAttackInput=z.infer<typeof ObjectWeaponAttackSchema>
export const initialObjectWeaponAttackState=()=>({version:1 as const,attacks:{}} as z.infer<typeof ObjectWeaponAttackStateSchema>)
export function validateObjectWeaponAttacks(state:GameState){
 const data=state.dmTools?.objectWeaponAttacks;if(!data)return[];const issues:string[]=[]
 if(!ObjectWeaponAttackStateSchema.safeParse(data).success)return['Invalid original actual object weapon attack schema.']
 if(Object.keys(data.attacks).length>1024)issues.push('Retain bounded original object attacks; no event is silently replayed or evicted.')
 for(const[id,record]of Object.entries(data.attacks)){
  if(id!==record.input.eventId||record.command!==witness(record.input)||record.contextCommand!==witness(record.context)||record.rollCommand!==witness(record.originalRoll)||record.at>(state.worldTimeSeconds??0)||(record.status==='completed')!==Boolean(record.result))issues.push('Retain the exact first object attack input, source context and original d20 before any actual critical or repeated cost.')
  if(record.status==='held'){
   const pending=state.hero?.pending
   if(pending?.command.type!=='toolkit_attack'||pending.command.domain!=='object-weapon'||witness(pending.command.input)!==witness(record.input)||witness(pending.command.context)!==record.contextCommand||witness(pending.roll)!==record.rollCommand)issues.push('An actual object attack holds its original source ray, selected weapon/projectile and original d20; no fresh observation or changed outcome may retrofit it.')
  }
 }
 return issues
}
