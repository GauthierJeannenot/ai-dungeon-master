import { z } from 'zod'

const id=z.string().min(1).max(100).regex(/^[a-zA-Z0-9][a-zA-Z0-9_:.-]*$/).refine(value=>!['constructor','prototype','__proto__'].includes(value),'Reserved identifier.')
export const WeaponAttackModeSchema=z.enum(['melee','thrown'])
export type WeaponAttackMode=z.infer<typeof WeaponAttackModeSchema>
export const TwoWeaponWitnessSchema=z.object({
  turnKey:z.string().min(1).max(100),primaryItemId:id,primaryHand:z.enum(['mainHandId','offHandId']),
  otherItemId:id,attackMode:WeaponAttackModeSchema,
  primaryWeaponReference:id.optional(),otherWeaponReferences:z.array(id).min(1).max(128).optional(),
}).strict().refine(value=>value.primaryItemId!==value.otherItemId,'Two different physical weapons are required.')
export type TwoWeaponWitness=z.infer<typeof TwoWeaponWitnessSchema>
export const TwoWeaponStateSchema=z.object({
  witnesses:z.record(id,TwoWeaponWitnessSchema).refine(values=>Object.keys(values).length<=512,'At most 512 current-turn attack witnesses.'),
  receipts:z.record(id,z.object({command:z.string().min(1).max(3000),turnKey:z.string().min(1).max(100),
    primaryAttackId:id,weaponItemId:id,status:z.enum(['pending','resolved']),result:z.record(z.string(),z.unknown()).optional(),
  }).strict()).refine(values=>Object.keys(values).length<=256,'At most 256 bonus-attack receipts.'),
}).strict()
export type TwoWeaponState=z.infer<typeof TwoWeaponStateSchema>
