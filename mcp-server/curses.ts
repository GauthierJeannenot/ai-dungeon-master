import type { SavingThrowResult } from '../lib/types'
import { CurseSelectionSchema, activeCurses, type CurseSelection } from '../lib/curse-effects'
import { addHeroEffect, removeHeroEffect, now, fail } from './hero-rules'
import { savedResolution, registerCheckedResolution } from './toolkit-checks'
import { toolkitResult } from './toolkit'
import * as gs from './game-state'

export function validateCurseArguments(spellId:string,selection:CurseSelection|undefined,level:number){
  if(spellId==='bestow-curse'){
    if(!CurseSelectionSchema.safeParse(selection).success)fail('CURSE_VARIANT_REQUIRED','Choose an implemented curse: one exact ability, or attacks against its caster. Other variants are not modeled.')
    if(level!==3&&level!==4)fail('CURSE_SLOT_UNSUPPORTED','Bestow Curse currently supports levels 3 and 4, with source concentration and one/ten minute duration.')
  }else if(selection!==undefined)fail('SPELL_EFFECT_MISMATCH','Only Bestow Curse accepts a curse choice.')
}

export function registerCurseResolution(){
  registerCheckedResolution('bestow-curse',(command,checked)=>{
    const save=checked as SavingThrowResult,casterId=String(command.casterId),targetId=String(command.targetId)
    const groupId=String(command.groupId),selection=command.curse as CurseSelection
    const group=gs.getState().hero?.effects.find(e=>e.id===groupId&&e.expiresAt>now())
    const failed=!save.success&&Boolean(group)
    let effect
    if(failed)effect=addHeroEffect('bestow-curse',casterId,[targetId],group!.expiresAt-now(),{
      spellId:'bestow-curse',slotLevel:Number(command.level),groupId,
      curseKind:selection.kind,...(selection.kind==='ability'?{ability:selection.ability}: {}),
    })
    else removeHeroEffect(groupId)
    const mechanicalSummary=failed?`Malédiction appliquée à ${targetId} : ${selection.kind==='ability'?`désavantage aux tests et sauvegardes de ${selection.ability}`:`désavantage aux attaques contre ${casterId}`}, concentration jusqu’à ${group!.expiresAt} s.`
      :`Malédiction sans effet sur ${targetId} : ${save.success?'sauvegarde de Sagesse réussie':'concentration interrompue'}.`
    gs.addLogEntry({round:gs.getState().round,turn:casterId,action:'Malédiction',mechanicalDetail:mechanicalSummary})
    return toolkitResult({spell:'bestow-curse',targetId,cursed:failed,save,effect,slotLevel:command.level,mechanicalSummary,
      ...(command.scrollUse?{spellScrollUse:command.scrollUse,spellSlotSpent:false}: {})})
  })
}

export function resolveBestowCurse(input:{casterId:string;targetId:string;level:number;dc:number;curse:CurseSelection;groupId:string;scrollUse?:unknown}){
  return savedResolution({entityId:input.targetId,ability:'wis',dc:input.dc,magical:true},
    {domain:'bestow-curse',command:{...input}})
}

export function resolveRemoveCurse(targetId:string){
  const removed=activeCurses(gs.getState(),targetId)
  for(const effect of removed){
    removeHeroEffect(effect.id)
    if(typeof effect.data.groupId==='string'){
      const remaining=gs.getState().hero?.effects.some(e=>e.data.groupId===effect.data.groupId)
      if(!remaining)removeHeroEffect(effect.data.groupId)
    }
  }
  return {targetId,removedCurseIds:removed.map(e=>e.id),removedCount:removed.length,
    notice:'Only tracked Bestow Curse effects are ended. No cursed magic item catalog or arbitrary narrative curse is implemented.'}
}
