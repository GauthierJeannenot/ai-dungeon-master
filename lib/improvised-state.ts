import { AdamantineWitnessSchema } from './adamantine-witness'
import { z } from 'zod'
import type { GameState } from './types'
import { getWeapon,type WeaponSpec } from './srd/weapons'
import { BasicPoisonWitnessSchema } from './basic-poison-state'
import { PlayerPoisonWitnessSchema } from './player-poison-state'
const Id=z.string().min(1).max(80).regex(/^[a-zA-Z0-9][a-zA-Z0-9_:.-]*$/).refine(id=>!['constructor','prototype','__proto__'].includes(id)),Text=z.string().trim().min(1).max(600)
export const ImprovisedRulingFields=z.object({
  referenceId:Id,targetKind:z.enum(['item','object','corpse']),targetId:Id,
  mode:z.enum(['melee','thrown','similar']),profileId:Id.optional(),allowProficiency:z.boolean(),
  damageType:z.enum(['acid','bludgeoning','cold','fire','force','lightning','necrotic','piercing','poison','psychic','radiant','slashing','thunder']).optional(),
  physicalFactId:z.string().min(1).max(180).optional(),physicalFactWitness:z.string().min(1).max(6000).optional(),
  hands:z.union([z.literal(1),z.literal(2)]),
  landingCell:z.object({x:z.number().int().nonnegative(),y:z.number().int().nonnegative()}).strict().optional(),
  source:Text,reason:Text,physicalContext:z.string().min(1).max(12000),at:z.number().nonnegative(),
}).strict()
export const ImprovisedRulingSchema=ImprovisedRulingFields.superRefine((v,ctx)=>{
  if(v.mode==='similar'?(!v.profileId||v.damageType!==undefined):(!v.damageType||v.profileId!==undefined||v.allowProficiency))
    ctx.addIssue({code:'custom',message:'Similarity needs an exact published profile; generic improvisation needs its explicit physical damage type and grants no proficiency.'})
  if(Boolean(v.physicalFactId)!==Boolean(v.physicalFactWitness)||v.damageType&&!['bludgeoning','piercing','slashing'].includes(v.damageType)&&!v.physicalFactId)
    ctx.addIssue({code:'custom',message:'A nonstandard physical damage type requires its actual exact-instance fact and retained witness.'})
})
export type ImprovisedRuling=z.infer<typeof ImprovisedRulingSchema>
export const ImprovisedStateSchema=z.object({version:z.literal(1),rulings:z.record(z.string(),ImprovisedRulingSchema),
  loads:z.record(z.string(),z.object({hostItemId:Id,ammunitionItemId:Id,projectile:z.object({ammunitionType:z.literal('sling-bullet'),silvered:z.boolean().optional(),adamantine:AdamantineWitnessSchema.optional(),basicPoison:BasicPoisonWitnessSchema.optional(),playerPoison:PlayerPoisonWitnessSchema.optional()}).strict(),loadedAt:z.number().nonnegative()}).strict()),
  receipts:z.record(z.string(),z.object({command:z.string().max(6000),result:z.unknown()}).strict()),
}).strict()
export type ImprovisedState=z.infer<typeof ImprovisedStateSchema>
export function improvisedPhysicalContext(state:Pick<GameState,'player'|'monsters'|'dmTools'>,kind:ImprovisedRuling['targetKind'],id:string){
  if(kind==='item'){
    const item=state.player.inventory.find(item=>item.id===id)
    return item?JSON.stringify({kind,id,type:item.type,equipmentId:item.equipmentId??null,quantity:item.quantity??null}):undefined
  }
  if(kind==='object'){
    const object=state.dmTools?.objects[id]
    return object&&object.state!=='destroyed'?JSON.stringify({kind,id,creation:object.creation??null}):undefined
  }
  const body=state.monsters[id]
  return body&&!body.isAlive?JSON.stringify({kind,id,type:body.type}):undefined
}
export function improvisedRuling(state:Pick<GameState,'dmTools'>,reference:string){
  const rulings=state.dmTools?.improvised?.rulings
  return rulings&&Object.hasOwn(rulings,reference)?rulings[reference]:undefined
}
/** A reference is an explicitly chosen immutable MJ adjudication, never an
 * intent/name parser and never a new physical item or granted proficiency. */
export function improvisedProfile(state:Pick<GameState,'dmTools'|'player'>,reference:string):WeaponSpec|undefined {
  const ruling=improvisedRuling(state,reference);if(!ruling)return undefined
  const physical=state.player?.inventory?.find(item=>item.id===ruling.targetId)
  const original=physical?getWeapon(physical.equipmentId??physical.id):undefined
  const base=ruling.mode==='similar'?getWeapon(ruling.profileId!):undefined
  if(ruling.mode==='similar'&&!base)return undefined
  return {...(base??{category:'improvised' as const,label:'Arme improvisée',damageDie:'1d4',damageType:ruling.damageType!,rangeCells:ruling.mode==='thrown'?4:1,
    ...(ruling.mode==='thrown'?{normalRangeCells:4,longRangeCells:12}:{}),properties:[...(ruling.mode==='thrown'?['ranged','thrown'] as const:[]),
      ...(ruling.hands===2?['twoHanded'] as const:[]),...(original?.properties.includes('heavy')?['heavy'] as const:[])]}),
    id:reference,improvised:{referenceId:reference,targetId:ruling.targetId,targetKind:ruling.targetKind,allowProficiency:ruling.allowProficiency,profileId:ruling.profileId},
    ...(base?{properties:[...new Set([...base.properties,...(ruling.hands===2?['twoHanded'] as const:[]),...(original?.properties.includes('heavy')?['heavy'] as const:[])])]}:{}),
  }
}
export function validateImprovisedState(state:GameState):string[]{
  const data=state.dmTools?.improvised;if(!data)return []
  if(!ImprovisedStateSchema.safeParse(data).success)return ['Invalid improvised physical state schema.']
  const errors:string[]=[]
  if(Object.keys(data.rulings).length>128||Object.keys(data.receipts).length>512)errors.push('Improvised state capacity exceeded.')
  for(const [id,ruling] of Object.entries(data.rulings))if(id!==ruling.referenceId||ruling.at>(state.worldTimeSeconds??0)||ruling.mode==='similar'&&(!getWeapon(ruling.profileId!)||ruling.profileId==='unarmed'))errors.push('Improvised ruling identity, published profile or chronology mismatch.')
  for(const [id,load] of Object.entries(data.loads)){
    const host=state.player.inventory.find(item=>item.id===id)??state.droppedItems?.[id]?.item
    if(id!==load.hostItemId||!host||(host.equipmentId??host.id)!=='sling'||load.loadedAt>(state.worldTimeSeconds??0))errors.push('Loaded sling needs its actual same physical host and chronology.')
  }
  return errors
}
