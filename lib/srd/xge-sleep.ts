/** Exact supplied Xanathar source and pure prerequisites only. No policy,
 * sleep episode, clock, exhaustion, recovery, wake or actor is created here. */
export const XGE_SLEEP_SOURCE=Object.freeze({
 book:'xge',file:'rules/books/xge.md',sha256:'519584ec7fc7da6fea056c182a22254bc807db5d077c2fc205801bd872d761bf',sleepLine:964,
 wakingLines:Object.freeze([968,970] as const),armorLines:Object.freeze([974,976] as const),
 deprivationLines:Object.freeze([980,982,984] as const),
 whisperPassiveThreshold:20,whisperMaximumFeet:10,normalSpeechPassiveThreshold:15,
 mediumHeavySpentHitDiceDivisor:4,firstDeprivationDC:10,deprivationDCStep:5,periodSeconds:86400,
 optionalDeprivationDefault:false,
 scope:'Source and pure prerequisites only; this module registers no tool and enables no optional rule.',
})
export type SleepNoiseKind='whisper'|'normal_speech'|'sudden_loud'
export function naturalSleepNoisePrerequisite(input:{kind:SleepNoiseKind;actualAudibility:boolean|null;passiveHearingPerception:number;distanceFeet?:number;otherwiseSilent?:boolean|null}){
 if(input.actualAudibility===null)return{issue:'SLEEP_ACTUAL_AUDIBILITY_REQUIRED' as const}
 if(!input.actualAudibility)return{wakes:false,reason:'not_actually_audible' as const}
 if(!Number.isFinite(input.passiveHearingPerception))throw new RangeError('Use the actual passive hearing Perception; no source score is invented.')
 if(input.kind==='sudden_loud')return{wakes:true,reason:'actual_sudden_loud_noise' as const}
 if(input.kind==='whisper'){
  if(input.distanceFeet===undefined||!Number.isFinite(input.distanceFeet)||input.distanceFeet<0)return{issue:'SLEEP_ACTUAL_WHISPER_DISTANCE_REQUIRED' as const}
  return{wakes:input.passiveHearingPerception>=20&&input.distanceFeet<=10,reason:'source_whisper_threshold_and_range' as const}
 }
 if(input.kind==='normal_speech'){
  if(input.otherwiseSilent===undefined||input.otherwiseSilent===null)return{issue:'SLEEP_AMBIENT_SILENCE_REQUIRED' as const}
  return{wakes:input.otherwiseSilent&&input.passiveHearingPerception>=15,reason:'source_silent_environment_and_normal_speech_threshold' as const}
 }
 throw new RangeError('Choose an explicit actual source noise kind; no player text is classified.')
}
/** XGE976 uses SPENT dice, unlike the PHB total-dice half recovery. */
export function armoredLongRestHitDiceRecovery(spentHitDice:number){
 if(!Number.isSafeInteger(spentHitDice)||spentHitDice<0)throw new RangeError('Use the actual nonnegative whole spent Hit Dice pool.')
 return Math.min(spentHitDice,Math.max(1,Math.floor(spentHitDice/4)))
}
export function sleepDeprivationDC(periodIndex:number){
 if(!Number.isSafeInteger(periodIndex)||periodIndex<1||periodIndex>1000000)throw new RangeError('Use the exact actual consecutive day index, not an invented DC.')
 return 10+5*(periodIndex-1)
}
/** A proposed ledger calculation, not retroactive history or opt-in. */
export function nextSleepDeprivationBoundary(input:{enabled:boolean;anchorAt:number;resolvedPeriods:number}){
 if(!input.enabled)return undefined
 if(!Number.isSafeInteger(input.anchorAt)||input.anchorAt<0||!Number.isSafeInteger(input.resolvedPeriods)||input.resolvedPeriods<0)throw new RangeError('Use the actual current episode anchor and retained resolved periods.')
 return{at:input.anchorAt+(input.resolvedPeriods+1)*86400,periodIndex:input.resolvedPeriods+1,dc:sleepDeprivationDC(input.resolvedPeriods+1)}
}
