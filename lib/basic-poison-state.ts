import { z } from 'zod'
import type { GameState } from './types'
import { PlayerPoisonAttackContextSchema } from './player-poison-state'
const Id=z.string().min(1).max(180),Time=z.number().nonnegative()
export const BasicPoisonWitnessSchema=z.object({applicationId:Id,targetKey:z.string().min(1).max(300),appliedAt:Time,expiresAt:Time}).strict()
  .refine(value=>value.expiresAt===value.appliedAt+60,'Basic Poison remains potent for exactly one real minute.')
export type BasicPoisonWitness=z.infer<typeof BasicPoisonWitnessSchema>
export const BasicPoisonAttackContextSchema=z.object({version:z.literal(1),attackId:Id,at:Time,targetId:Id,
  surfaceKey:z.string().min(1).max(300),poison:BasicPoisonWitnessSchema.nullable(),playerPoison:PlayerPoisonAttackContextSchema.optional()}).strict()
export type BasicPoisonAttackContext=z.infer<typeof BasicPoisonAttackContextSchema>
export const BasicPoisonStateSchema=z.object({version:z.literal(1),
  coatings:z.record(z.string(),BasicPoisonWitnessSchema),
  applications:z.record(z.string(),z.object({command:z.string().max(20000),vialItemId:Id,appliedAt:Time,expiresAt:Time,
    targets:z.array(BasicPoisonWitnessSchema).min(1).max(3),result:z.record(z.string(),z.unknown())}).strict()),
  hits:z.record(z.string(),z.object({command:z.string().max(6000),witness:BasicPoisonWitnessSchema,sourceId:Id,targetId:Id,
    baseAttack:z.record(z.string(),z.unknown()),status:z.enum(['pending','resolved']),result:z.record(z.string(),z.unknown()).optional()}).strict()),
}).strict()
export type BasicPoisonState=z.infer<typeof BasicPoisonStateSchema>
export const basicPoisonKey=(kind:'weapon'|'ammunition'|'loaded_projectile',id:string,physicalKind='item')=>JSON.stringify([kind,physicalKind,id])
export function activeBasicPoison(state:Pick<GameState,'dmTools'|'worldTimeSeconds'>,key:string):BasicPoisonWitness|undefined{
  const map=state.dmTools?.basicPoison?.coatings,value=map&&Object.hasOwn(map,key)?map[key]:undefined
  return value&&value.appliedAt<=(state.worldTimeSeconds??0)&&value.expiresAt>(state.worldTimeSeconds??0)?value:undefined
}
export function validBasicPoisonWitness(state:Pick<GameState,'dmTools'>,raw:unknown):raw is BasicPoisonWitness{
  const parsed=BasicPoisonWitnessSchema.safeParse(raw);if(!parsed.success)return false
  const map=state.dmTools?.basicPoison?.applications,record=map&&Object.hasOwn(map,parsed.data.applicationId)?map[parsed.data.applicationId]:undefined
  return Boolean(record&&record.appliedAt===parsed.data.appliedAt&&record.expiresAt===parsed.data.expiresAt
    &&record.targets.some(target=>target.applicationId===parsed.data.applicationId&&target.targetKey===parsed.data.targetKey
      &&target.appliedAt===parsed.data.appliedAt&&target.expiresAt===parsed.data.expiresAt))
}
export function validateBasicPoisonState(state:GameState):string[]{
  const value=state.dmTools?.basicPoison;if(!value)return []
  if(!BasicPoisonStateSchema.safeParse(value).success)return ['Invalid Basic Poison dose/coating/hit schema.']
  const errors:string[]=[],time=state.worldTimeSeconds??0,usedDoses=new Set<string>()
  if(Object.keys(value.applications).length>128||Object.keys(value.hits).length>512||Object.keys(value.coatings).length>512)errors.push('Basic Poison retained history capacity exceeded.')
  for(const [id,application] of Object.entries(value.applications)){
    if(usedDoses.has(application.vialItemId))errors.push('One physical vial cannot supply two consumed doses.')
    usedDoses.add(application.vialItemId)
    if(application.appliedAt>time||application.expiresAt!==application.appliedAt+60||application.result.consumedDose!==true
      ||application.targets.some(target=>target.applicationId!==id||target.appliedAt!==application.appliedAt||target.expiresAt!==application.expiresAt))errors.push('Basic Poison application source identity or chronology mismatch.')
  }
  // A current physical surface may inherit an original unit's coating through
  // a real load/unload transfer; its witness still names that original dose.
  for(const witness of Object.values(value.coatings))if(!validBasicPoisonWitness(state,witness))errors.push('A coating needs its actual retained application witness.')
  for(const [id,hit] of Object.entries(value.hits)){
    if(!validBasicPoisonWitness(state,hit.witness)||hit.status==='resolved'&&!hit.result)errors.push('A poison hit needs its retained dose and complete resolved receipt.')
    if(hit.status==='pending'){
      const pending=state.hero?.pending,resolution=pending?.command.toolkitResolution as {domain?:string;command?:{attackId?:string}}|undefined
      if(resolution?.domain!=='basic-poison-hit'||resolution.command?.attackId!==id)errors.push('A pending poison hit needs its actual held source save.')
    }
  }
  for(const load of Object.values(state.dmTools?.improvised?.loads??{}))if(load.projectile.basicPoison&&!validBasicPoisonWitness(state,load.projectile.basicPoison))errors.push('A reserved loaded unit needs its real poison application history.')
  return errors
}
