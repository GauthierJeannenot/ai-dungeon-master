import type { Item } from '../lib/types'
import type { WeaponSpec } from '../lib/srd/weapons'
import { activePlayerPoison,validPlayerPoisonWitness,PlayerPoisonAttackContextSchema,playerPoisonStateOf,type PlayerPoisonAttackContext } from '../lib/player-poison-state'
import { basicPoisonKey } from '../lib/basic-poison-state'
import type { AmmunitionAttackPlan } from './ammunition'
import { preflightActualPoisonExposure,startActualPlayerPoisonDelivery } from './player-poison-exposure'
import { playerPoisons } from './player-poison-core'
import { toolkitError,toolkitResult } from './toolkit'
import * as gs from './game-state'
/** Source jaws/other registered physical wounding procedures, never a free attack. */
export function playerPoisonSurfaceContext(input:{surfaceKey:string;attackId:string;targetId:string;damageType:'piercing'|'slashing';held?:boolean;context?:unknown}):PlayerPoisonAttackContext|undefined{
 const state=gs.getState()
 const parsed=input.held?PlayerPoisonAttackContextSchema.safeParse(input.context):undefined
 if(input.held&&input.context===undefined)return undefined
 const witness=input.held&&parsed?.success?parsed.data.witness:activePlayerPoison(state,input.surfaceKey)
 if(input.held&&(!parsed?.success||parsed.data.attackId!==input.attackId||parsed.data.targetId!==input.targetId||parsed.data.damageType!==input.damageType||parsed.data.at>(state.worldTimeSeconds??0)))toolkitError('PLAYER_POISON_HELD_ATTACK_INVALID','Retain the exact actual source jaw wound and original poison witness before its held save/check.')
 if(!witness)return undefined
 if(!validPlayerPoisonWitness(state,witness))toolkitError('PLAYER_POISON_WITNESS_INVALID','The source physical component needs its original real consumed dose.')
 const prep=playerPoisonStateOf(state)!.preparations[witness.preparationId]
 if(prep.status!=='active'||prep.delivery!=='injury'){if(input.held)toolkitError('PLAYER_POISON_HELD_ATTACK_INVALID','The original source jaw cannot acquire an already consumed or washed dose.');return undefined}
 preflightActualPoisonExposure(witness.templateId,input.targetId)
 return input.held&&parsed?.success?parsed.data:{attackId:input.attackId,targetId:input.targetId,at:state.worldTimeSeconds??0,damageType:input.damageType,witness}
}
export function playerPoisonAttackContext(input:{attackId:string;targetId:string;weapon:WeaponSpec;item?:Item;ammunition?:AmmunitionAttackPlan;held?:boolean;context?:unknown}):PlayerPoisonAttackContext|undefined{
 const state=gs.getState()
 if(input.held){
  if(input.context===undefined)return undefined // Never retrofit an old held d20.
  const parsed=PlayerPoisonAttackContextSchema.safeParse(input.context),context=parsed.success?parsed.data:undefined
  if(!context||context.attackId!==input.attackId||context.targetId!==input.targetId||context.at>(state.worldTimeSeconds??0)||!validPlayerPoisonWitness(state,context.witness)||context.damageType!==input.weapon.damageType)
   toolkitError('PLAYER_POISON_HELD_ATTACK_INVALID','Retain the exact original attack, body, physical dose and source piercing/slashing profile before any reaction die or cost.')
  const preparation=playerPoisonStateOf(state)?.preparations[context.witness.preparationId]
  if(preparation?.status!=='active')toolkitError('PLAYER_POISON_HELD_ATTACK_INVALID','The original held attack cannot acquire a consumed or washed poison application.')
  preflightActualPoisonExposure(context.witness.templateId,input.targetId);return context
 }
 if(!input.item||!['piercing','slashing'].includes(input.weapon.damageType??''))return undefined
 const key=input.ammunition?basicPoisonKey('ammunition',input.ammunition.ammunitionItemId):basicPoisonKey('weapon',input.item.id,input.weapon.improvised?.targetKind??'item')
 const witness=input.ammunition?.playerPoison??activePlayerPoison(state,key)
 if(!witness)return undefined
 if(!validPlayerPoisonWitness(state,witness))toolkitError('PLAYER_POISON_WITNESS_INVALID','This actual unit needs its retained real consumed dose; no weapon label or current poison state rewrites the original shot.')
 const preparation=playerPoisonStateOf(state)!.preparations[witness.preparationId]
 if(preparation.status!=='active'||preparation.delivery!=='injury')return undefined
 preflightActualPoisonExposure(witness.templateId,input.targetId)
 return{attackId:input.attackId,targetId:input.targetId,at:state.worldTimeSeconds??0,damageType:input.weapon.damageType as'piercing'|'slashing',witness}
}
export function preflightPlayerPoisonSequence(contexts:readonly(PlayerPoisonAttackContext|undefined)[]){
 const count=new Set(contexts.filter((context):context is PlayerPoisonAttackContext=>Boolean(context)).map(context=>context.witness.preparationId)).size,state=gs.getState()
 if(Object.keys(playerPoisonStateOf(state)?.deliveries??{}).length+count>1024||Object.keys(state.dmTools?.afflictions?.records??{}).length+count>512)
  toolkitError('PLAYER_POISON_SEQUENCE_LIMIT','Reserve every distinct possible real injury dose in this whole chosen attack sequence before its first die or action.')
}
export function resolvePlayerPoisonWound(context:PlayerPoisonAttackContext|undefined,baseAttack:Record<string,unknown>){
 if(!context||baseAttack.hit!==true||Number(baseAttack.damageDealt??0)<=0)return toolkitResult(baseAttack)
 const packet=baseAttack.damageResolution as{damageType?:string}|undefined,type=packet?.damageType??baseAttack.damageType
 if(type!=='piercing'&&type!=='slashing')return toolkitResult(baseAttack)
 const prior=playerPoisonStateOf(gs.getState())?.deliveries[context.attackId]
 if(prior?.status==='resolved')return toolkitResult({...prior.result,poisonReplayed:true})
 const preparation=playerPoisons().preparations[context.witness.preparationId]
 if(!preparation||!validPlayerPoisonWitness(gs.getState(),context.witness))toolkitError('PLAYER_POISON_WOUND_CONTEXT_INVALID','The actual committed wound must retain its original consumed dose and physical unit.')
 const command=JSON.stringify({operation:'actual_injury_wound',attackId:context.attackId,targetId:context.targetId,witness:context.witness,at:context.at,damageType:type,damageDealt:baseAttack.damageDealt})
 if(!prior){
  if(preparation.status!=='active')return toolkitResult(baseAttack) // Another real wound already delivered this single coating.
  preparation.status='delivered';preparation.deliveryEventId=context.attackId
 }
 return startActualPlayerPoisonDelivery({id:context.attackId,command,templateId:context.witness.templateId,targetId:context.targetId,preparationId:preparation.id,baseAttack})
}
