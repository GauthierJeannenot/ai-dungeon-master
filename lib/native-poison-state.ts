import { z } from 'zod'
import type { GameState } from './types'
const Id=z.string().min(1).max(180)
export const NativePoisonContextSchema=z.object({attackId:Id,attackerId:Id,targetId:Id,creatureType:z.string(),actionName:z.string(),templateId:z.enum(['carrion_crawler_mucus','purple_worm_poison','serpent_venom','wyvern_poison']),at:z.number().finite().nonnegative()}).strict()
export type NativePoisonContext=z.infer<typeof NativePoisonContextSchema>
export const NativePoisonStateSchema=z.object({version:z.literal(1),hits:z.record(z.string(),z.object({context:NativePoisonContextSchema,primaryAttack:z.record(z.string(),z.unknown()),status:z.enum(['pending','resolved']),result:z.record(z.string(),z.unknown()).optional()}).strict())}).strict()
export type NativePoisonState=z.infer<typeof NativePoisonStateSchema>
export const nativePoisonStateOf=(state:Pick<GameState,'dmTools'>)=>(state.dmTools as {nativePoison?:NativePoisonState}|undefined)?.nativePoison
export function nativePoisonTemplate(type:string,actionName:string):NativePoisonContext['templateId']|undefined{
 const action=actionName.toLowerCase().replace(/\s/g,'')
 return type==='carrion_crawler'&&action==='tentacles'?'carrion_crawler_mucus':type==='purple_worm'&&action==='tailstinger'?'purple_worm_poison':type==='wyvern'&&action==='stinger'?'wyvern_poison':type==='giant_poisonous_snake'&&action==='bite'?'serpent_venom':undefined
}
export function validateNativePoisonState(state:GameState){
 const data=nativePoisonStateOf(state);if(!data)return[]
 if(!NativePoisonStateSchema.safeParse(data).success)return['Invalid native source-poison hit schema.']
 const issues:string[]=[]
 if(Object.keys(data.hits).length>1024)issues.push('Native source poison hit capacity exceeded; no source history is discarded.')
 for(const[id,hit]of Object.entries(data.hits)){
  const c=hit.context,delivery=state.dmTools?.playerPoisons?.deliveries[id]
  if(id!==c.attackId||c.at>(state.worldTimeSeconds??0)||nativePoisonTemplate(c.creatureType,c.actionName)!==c.templateId||hit.primaryAttack.attackerId!==c.attackerId||hit.primaryAttack.targetId!==c.targetId||hit.primaryAttack.hit!==true)issues.push('A native poison retains its original actual sourced hit, target and attack identity.')
  if(!delivery||delivery.nativeAttackId!==id||delivery.targetId!==c.targetId||delivery.templateId!==c.templateId||delivery.status!==hit.status||hit.status==='resolved'&&!hit.result)issues.push('A native poison hit and its actual single delivery must retain the same original source and completion.')
 }
 return issues
}
