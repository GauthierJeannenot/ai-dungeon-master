import { swallowedBy,swallowStateOf } from '../lib/swallow-state'
import { NativePoisonContextSchema,nativePoisonTemplate,nativePoisonStateOf,type NativePoisonContext } from '../lib/native-poison-state'
import { preflightActualPoisonExposure,startActualPlayerPoisonDelivery,registerPlayerPoisonContinuation,registerPlayerPoisonSaveResolutions } from './player-poison-exposure'
import { toolkitError,toolkitState,toolkitResult } from './toolkit'
import * as gs from './game-state'
/** Internal witness captured before any attack die; never a player-chosen exposure. */
export function nativePoisonAttackContext(attackerId:string,targetId:string,actionName:string,attackId:string,held=false,raw?:unknown):NativePoisonContext|undefined{
 const attacker=gs.getMonster(attackerId),templateId=attacker?nativePoisonTemplate(attacker.type,actionName):undefined
 if(!templateId)return undefined
 if(swallowedBy(gs.getState(),attackerId)===targetId&&Object.keys(swallowStateOf(gs.getState())?.damage??{}).length+(templateId==='carrion_crawler_mucus'?1:2)>4096)toolkitError('SWALLOW_DAMAGE_HISTORY_LIMIT','Reserve both actual primary and separately saved native venom damage witnesses before the first attack die.')
 if(attacker?.group)toolkitError('NATIVE_POISON_INDIVIDUAL_REQUIRED','Native venom requires one actual individual source; group scaling cannot create multiple exposures or venom dice.')
 if(held){
  const parsed=NativePoisonContextSchema.safeParse(raw)
  if(!parsed.success||parsed.data.attackId!==attackId||parsed.data.attackerId!==attackerId||parsed.data.targetId!==targetId||parsed.data.creatureType!==attacker!.type||parsed.data.templateId!==templateId||parsed.data.actionName.toLowerCase().replace(/\s/g,'')!==actionName.toLowerCase().replace(/\s/g,'')||parsed.data.at>(gs.getState().worldTimeSeconds??0))toolkitError('NATIVE_POISON_HELD_CONTEXT_REQUIRED','Keep the actual original natural attack and source body before any held reaction die; no old attack is retrofitted with venom.')
  preflightActualPoisonExposure(templateId,targetId);return parsed.data
 }
 if(Object.keys(nativePoisonStateOf(gs.getState())?.hits??{}).length>=1024)toolkitError('NATIVE_POISON_HIT_LIMIT','Retain every native hit before the next attack die or action; no original hit history is discarded.')
 preflightActualPoisonExposure(templateId,targetId)
 return{attackId,attackerId,targetId,creatureType:attacker!.type,actionName,templateId,at:gs.getState().worldTimeSeconds??0}
}
export function preflightNativePoisonSequence(contexts:readonly(NativePoisonContext|undefined)[]){
 const count=contexts.filter(Boolean).length,state=gs.getState()
 if(Object.keys(nativePoisonStateOf(state)?.hits??{}).length+count>1024||Object.keys(state.dmTools?.playerPoisons?.deliveries??{}).length+count>1024||Object.keys(state.dmTools?.afflictions?.records??{}).length+count>512)toolkitError('NATIVE_POISON_SEQUENCE_LIMIT','Reserve the whole explicitly selected sequence source poison history before any attack die or paid action.')
}
export function resolveNativePoisonHit(context:NativePoisonContext|undefined,baseAttack:Record<string,unknown>){
 if(!context||baseAttack.hit!==true)return toolkitResult(baseAttack)
 const data=toolkitState().nativePoison??={version:1 as const,hits:{}}
 const old=data.hits[context.attackId]
 if(old?.status==='resolved')return toolkitResult({...old.result,nativePoisonReplayed:true})
 if(!old)data.hits[context.attackId]={context:structuredClone(context),primaryAttack:structuredClone(baseAttack),status:'pending'}
 registerNativePoisonResolution()
 return startActualPlayerPoisonDelivery({id:context.attackId,command:JSON.stringify(context),templateId:context.templateId,targetId:context.targetId,sourceActorId:context.attackerId,nativeAttackId:context.attackId,
  baseAttack:{...baseAttack,nativePoison:context,playerPoisonContinuation:{domain:'native-poison'}}})
}
export function registerNativePoisonResolution(){
 registerPlayerPoisonSaveResolutions()
 registerPlayerPoisonContinuation('native-poison',id=>{
  const hit=nativePoisonStateOf(gs.getState())?.hits[id],delivery=gs.getState().dmTools?.playerPoisons?.deliveries[id]
  if(!hit||!delivery?.result)toolkitError('NATIVE_POISON_HIT_REQUIRED','Retain the original actual native hit and finished source save.')
  hit!.status='resolved';hit!.result=structuredClone(delivery!.result)
  return toolkitResult(delivery!.result)
 })
}

export function validateHeldNativePoisonAttack(command:Record<string,unknown>){
 if(command.type!=='attack'||command.attackerId==='player')return
 const actor=gs.getMonster(String(command.attackerId)),name=String(command.weaponOrSpell)
 if(actor&&nativePoisonTemplate(actor.type,name))nativePoisonAttackContext(actor.id,String(command.targetId),name,String(command.attackEventId),true,command.nativePoisonContext)
}
