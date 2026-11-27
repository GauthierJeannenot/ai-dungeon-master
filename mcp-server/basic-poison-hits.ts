import { BasicPoisonAttackContextSchema,activeBasicPoison,basicPoisonKey,validBasicPoisonWitness,
  type BasicPoisonAttackContext } from '../lib/basic-poison-state'
import type { Item,SavingThrowResult } from '../lib/types'
import type { WeaponSpec } from '../lib/srd/weapons'
import type { AmmunitionAttackPlan } from './ammunition'
import { hero,now,effects } from './hero-rules'
import { inspectExhaustion } from './exhaustion'
import { savedResolution,registerCheckedResolution } from './toolkit-checks'
import { savingThrow,dealDamage,hasTrait } from './monster-rules'
import { rollDice } from './dice'
import { toolkitState,toolkitError,toolkitResult } from './toolkit'
import * as gs from './game-state'
import { weaponForReference,selectedWeaponItem } from './equipment'
import { playerPoisonAttackContext,resolvePlayerPoisonWound } from './player-poison-injury'
const data=()=>toolkitState().basicPoison??={version:1 as const,coatings:{},applications:{},hits:{}}
const entry=<T>(map:Record<string,T>|undefined,id:string)=>map&&Object.hasOwn(map,id)?map[id]:undefined
export function basicPoisonAttackContext(input:{attackId:string;targetId:string;weapon:WeaponSpec;item?:Item;ammunition?:AmmunitionAttackPlan;held?:boolean;context?:unknown}):BasicPoisonAttackContext|undefined{
  // An old held d20 without this witness is never retroactively coated.
  if(input.held&&input.context===undefined)return undefined
  if(!input.item)return undefined
  const key=input.ammunition?(input.ammunition.basicPoison?.targetKey??basicPoisonKey('ammunition',input.ammunition.ammunitionItemId))
    :basicPoisonKey('weapon',input.item.id,input.weapon.improvised?.targetKind??'item')
  if(input.held){
    const parsed=BasicPoisonAttackContextSchema.safeParse(input.context)
    if(!parsed.success||parsed.data.attackId!==input.attackId||parsed.data.targetId!==input.targetId||parsed.data.surfaceKey!==key||parsed.data.at>now()
      ||parsed.data.poison&&(!validBasicPoisonWitness(gs.getState(),parsed.data.poison)||parsed.data.poison.targetKey!==key
        ||parsed.data.at<parsed.data.poison.appliedAt||parsed.data.at>=parsed.data.poison.expiresAt))
      toolkitError('BASIC_POISON_HELD_CONTEXT_INVALID','Retain the actual original attack, surface/projectile, target, time and source potency before a reaction die or cost.')
    playerPoisonAttackContext({...input,held:true,context:parsed.data.playerPoison})
    return parsed.data
  }
  const poison=input.ammunition?.basicPoison??(!input.ammunition?activeBasicPoison(gs.getState(),key):undefined)
  if(poison){
    if(!validBasicPoisonWitness(gs.getState(),poison))toolkitError('BASIC_POISON_WITNESS_INVALID','This coating has no real retained vial application; no dose is inferred.')
    if(poison.appliedAt>now()||poison.expiresAt<=now())toolkitError('BASIC_POISON_WITNESS_INVALID','The actual source unit must be coated and still potent before this original d20.')
    inspectExhaustion(input.targetId) // Preflight the possible future CON save before the attack d20.
    if(Object.keys(gs.getState().dmTools?.basicPoison?.hits??{}).length>=512)toolkitError('BASIC_POISON_HIT_LIMIT','512 retained hit events reached before any attack die or cost.')
  }
  const playerPoison=playerPoisonAttackContext({...input,context:undefined})
  return {version:1,attackId:input.attackId,at:now(),targetId:input.targetId,surfaceKey:key,poison:poison??null,...playerPoison?{playerPoison}:{}}
}
export function validateHeldBasicPoisonSave(command:Record<string,unknown>){
  const resolution=command.toolkitResolution as {domain?:string;command?:Record<string,unknown>}|undefined
  if(resolution?.domain!=='basic-poison-hit')return
  const id=String(resolution.command?.attackId),hit=entry(gs.getState().dmTools?.basicPoison?.hits,id),target=hit?gs.getEntity(hit.targetId):undefined
  if(!hit||hit.status!=='pending'||!validBasicPoisonWitness(gs.getState(),hit.witness)||!target||'isAlive'in target&&!target.isAlive)
    toolkitError('BASIC_POISON_SAVE_CONTEXT_INVALID','This held poison save must retain its actual committed hit, living target and source dose before Inspiration.')
}
export function validateHeldBasicPoisonAttack(command:Record<string,unknown>){
  if(command.type!=='attack'||command.attackerId!=='player'||command.basicPoisonContext===undefined)return
  const weapon=weaponForReference(String(command.weaponOrSpell)),item=selectedWeaponItem(String(command.weaponOrSpell))
  if(!weapon||!item||!command.attackEventId)toolkitError('BASIC_POISON_HELD_CONTEXT_INVALID','The original physical weapon and attack identity must still exist before a reaction die.')
  const receipt=entry(gs.getState().dmTools?.ammunition?.expenditures,String(command.attackEventId))
  const ammunition=receipt?{...receipt,loading:Boolean(weapon!.properties.includes('loading'))}:undefined
  basicPoisonAttackContext({attackId:String(command.attackEventId),targetId:String(command.targetId),weapon:weapon!,item,ammunition,held:true,context:command.basicPoisonContext})
}
function finishPoisonSave(attackId:string,saved:SavingThrowResult){
  const hit=entry(gs.getState().dmTools?.basicPoison?.hits,attackId)
  if(!hit)toolkitError('BASIC_POISON_HIT_REQUIRED','The source physical hit must already be committed exactly once.')
  if(hit!.status==='resolved')return toolkitResult({...hit!.result,poisonReplayed:true})
  if(saved.entityId!==hit!.targetId||saved.ability!=='con'||saved.dc!==10)toolkitError('BASIC_POISON_SAVE_CONTEXT_INVALID','Keep this exact source CONDC10 save and target; no saving throw is substituted.')
  const target=gs.getEntity(hit!.targetId)
  if(!target)toolkitError('BASIC_POISON_TARGET_REQUIRED','The actual hit target must still exist on this map.')
  const damageRoll=saved.success?undefined:rollDice('1d4')
  const damageResolution=damageRoll?dealDamage(hit!.targetId,damageRoll.total,'poison',{sourceId:hit!.sourceId,weaponAttack:false}):undefined
  const currentTarget=gs.getEntity(hit!.targetId)??target!
  const poisonDamageDealt=damageResolution?.damageDealt??0
  const targetDied=currentTarget.id==='player'?Boolean(gs.getPlayer().deathSaves?.dead):'isAlive'in currentTarget ? !currentTarget.isAlive : false
  const result={...hit!.baseAttack,basicPoison:{application:hit!.witness,save:saved,damageRoll,damageResolution,damageDealt:poisonDamageDealt,
    source:'PHB2014 Poison Basic:CONDC10 or1d4poison; no poisoned condition, no critical doubling, potency not consumed by a hit.'},
    weaponDamageDealt:Number(hit!.baseAttack.damageDealt??0),poisonDamageDealt,damageDealt:Number(hit!.baseAttack.damageDealt??0)+poisonDamageDealt,
    targetHpAfter:damageResolution?.hpAfter??currentTarget.hp.current,targetDied,targetKnockedOut:'isAlive'in currentTarget&&Boolean(currentTarget.knockout),
    mechanicalSummary:`${String(hit!.baseAttack.mechanicalSummary??'Frappe résolue.')} Poison courant : ${saved.roll.detail} contre CONDD10 ; ${saved.success?'aucun dégât de poison':`${poisonDamageDealt} dégât(s) de poison effectifs`}.`}
  hit!.status='resolved';hit!.result=structuredClone(result)
  const bonus=hit!.baseAttack.twoWeapon as {attackId?:string}|undefined
  if(bonus?.attackId){const receipt=entry(gs.getState().dmTools?.twoWeapon?.receipts,bonus.attackId);if(receipt){receipt.status='resolved';receipt.result=structuredClone(result)}}
  gs.addLogEntry({round:gs.getState().round,turn:hit!.sourceId,action:'Poison courant sur frappe réelle',mechanicalDetail:result.mechanicalSummary})
  return toolkitResult(result)
}
export function resolveBasicPoisonHit(context:BasicPoisonAttackContext|undefined,baseAttack:Record<string,unknown>){
  if(context?.playerPoison)return resolvePlayerPoisonWound(context.playerPoison,baseAttack)
  if(!context?.poison||baseAttack.hit!==true)return toolkitResult(baseAttack)
  const prior=entry(gs.getState().dmTools?.basicPoison?.hits,context.attackId)
  if(prior){
    if(prior.status==='resolved')return toolkitResult({...prior.result,poisonReplayed:true})
    return toolkitResult({attack:prior.baseAttack,pendingReaction:gs.getState().hero?.pending})
  }
  const target=gs.getEntity(context.targetId)
  if(!validBasicPoisonWitness(gs.getState(),context.poison)||context.at<context.poison.appliedAt||context.at>=context.poison.expiresAt)
    toolkitError('BASIC_POISON_WITNESS_INVALID','This actual hit must have occurred while its retained real application was potent.')
  const sourceId=String(baseAttack.attackerId??'player'),command=JSON.stringify({attackId:context.attackId,targetId:context.targetId,witness:context.poison,at:context.at})
  const hit={command,witness:context.poison,sourceId,targetId:context.targetId,baseAttack:structuredClone(baseAttack),status:'pending' as 'pending'|'resolved',result:undefined as Record<string,unknown>|undefined}
  data().hits[context.attackId]=hit
  // A creature already killed by the physical hit is not resurrected or given
  // a new turn/save merely to apply an irrelevant poison effect.
  if(!target||'isAlive'in target&&!target.isAlive||target.id==='player'&&gs.getPlayer().deathSaves?.dead){
    const result={...baseAttack,basicPoison:{application:context.poison,skipped:'target_already_dead_after_physical_hit'}}
    hit.status='resolved';hit.result=structuredClone(result);return toolkitResult(result)
  }
  const bonus=baseAttack.twoWeapon as {attackId?:string}|undefined
  if(bonus?.attackId){const receipt=entry(gs.getState().dmTools?.twoWeapon?.receipts,bonus.attackId);if(receipt)receipt.status='pending'}
  const sourceAdvantage=effects('antitoxin',target.id).length>0||effects('protection-from-poison',target.id).length>0||hasTrait(target,'Dwarven Resilience')
  // This is a damage-poison save, not a save against acquiring poisoned.
  // Condition immunity alone therefore cannot grant an automatic success.
  if(gs.getState().hero&&gs.getPlayer().ruleset==='srd2014')return savedResolution({entityId:target.id,ability:'con',dc:10,sourceAdvantage},
    {domain:'basic-poison-hit',command:{attackId:context.attackId}})
  return finishPoisonSave(context.attackId,savingThrow(target.id,'con',10,false,undefined,undefined,false,false,sourceAdvantage))
}
export function registerBasicPoisonResolutions(){registerCheckedResolution('basic-poison-hit',(command,result)=>finishPoisonSave(String(command.attackId),result as SavingThrowResult))}
