import { ResolveImprovisedHazardSchema,IMPROVISED_HAZARD_SOURCE,hazardWitness,improvisedHazardBodyWitness,unclaimedHazardFact,validateImprovisedHazards,hazardPending,type ImprovisedHazardEvent } from '../lib/improvised-hazard-state'
import type { SavingThrowResult } from '../lib/types'
import { cackleDiseaseActive,cackleStateOf } from '../lib/cackle-fever-state'
import { entityVerticalContext } from '../lib/jumping-state'
import { swallowedBy } from '../lib/swallow-state'
import { inspectOilFireDamage } from '../lib/oil-state'
import { groundDamageIssue } from './ground-damage-preflight'
import { coverSavingThrowBonus } from './cover'
import { adjustedDamage,dealDamage } from './monster-rules'
import { available,hero } from './hero-rules'
import { readDmgImprovisedHazardSource } from './rules-library'
import { savedResolution,registerCheckedResolution } from './toolkit-checks'
import { toolkitState,toolkitError,toolkitLocation,toolkitResult } from './toolkit'
import { rollDice } from './dice'
import * as gs from './game-state'
const data=()=>toolkitState().improvisedHazards??={version:1 as const,events:{}}
const sourceEvent=(id:string)=>'improvised-hazard:'+id
function preflight(input:ReturnType<typeof ResolveImprovisedHazardSchema.parse>){
 const s=gs.getState(),body=gs.getEntity(input.targetId),loc=toolkitLocation(input.cell),height=entityVerticalContext(s,input.targetId)
 if(!body||input.targetId==='player'&&s.player.deathSaves?.dead||input.targetId!=='player'&&'isAlive'in body&&!body.isAlive||'group'in body&&body.group
  ||body.position.x!==input.cell.x||body.position.y!==input.cell.y||loc.roomId!==s.currentRoomId||!height.known||height.airborne||height.zFeet!==0||swallowedBy(s,input.targetId))
  toolkitError('IMPROVISED_HAZARD_LOCAL_BODY_REQUIRED','Choose one actual local sourced individual already exposed at this current-room ground cell. No body, remote hit, area, airborne/contained exposure or displacement is inferred.')
 const issue=groundDamageIssue(s,input.targetId,input.diceCount*10+5);if(issue)toolkitError(issue.code,issue.message)
 // The canonical HP hook can stage actual disease stress. Forecast its existing
 // finite histories now, before the environmental save/damage or held bonus.
 const disease=cackleDiseaseActive(s,input.targetId)?.cackleFever,cackle=cackleStateOf(s)
 if(disease?.onset&&disease.dc>0){
  if(Object.keys(cackle?.events??{}).length>=2048)toolkitError('CACKLE_EVENT_LIMIT','Retain the original disease stress history before this possible damage packet or source save.')
  if(Object.keys(cackle?.madness??{}).length>=128)toolkitError('CACKLE_MADNESS_LIMIT','Retain the original disease madness history before this possible damage packet or source save.')
 }
 for(const raw of [0,input.diceCount*10]){const oil=inspectOilFireDamage(s,{targetKind:'creature',targetId:input.targetId,eventId:sourceEvent(input.eventId),components:[{type:input.damageType,rawAmount:raw,damageAfterDefenses:adjustedDamage(body!,raw,input.damageType,input.magical).damage}]});if(oil.issue)toolkitError(oil.issue.code,oil.issue.message)}
 if(input.save)coverSavingThrowBonus(input.cell,input.targetId,input.save.ability)
 return{body:body!,location:loc}
}
function finish(eventId:string,save?:SavingThrowResult){
 const state=gs.getState(),event=state.dmTools?.improvisedHazards?.events[eventId]
 if(!event||event.status!=='held')toolkitError('IMPROVISED_HAZARD_EVENT_REQUIRED','Retain the original unresolved actual event.')
 if(event!.bodyWitness!==improvisedHazardBodyWitness(state,event!.input.targetId))toolkitError('IMPROVISED_HAZARD_CONTEXT_CHANGED','Resolve the exact original body/context; no held die can be moved onto another event.')
 const input=event!.input;preflight(input)
 const avoided=Boolean(save?.success&&input.save?.onSuccess==='no_damage'),rawRoll=avoided?undefined:rollDice(input.diceCount+'d10'),rawDamage=rawRoll?(save?.success?Math.floor(rawRoll.total/2):rawRoll.total):0
 const concentrationBefore=structuredClone(hero().concentrationIds)
 const damage=rawDamage?dealDamage(input.targetId,rawDamage,input.damageType,{magical:input.magical,damageEventId:sourceEvent(eventId)}):undefined
 const result={success:true,eventId,targetId:input.targetId,source:event!.source,save,rawRoll,rawDamage,damageResolution:damage,
  concentrationBefore,concentrationAfter:structuredClone(hero().concentrationIds),actorCost:'none',elapsedSeconds:0,consequence:'damage_only',notice:'One explicitly qualified instantaneous external occurrence. DMG dice are suggestions selected by the MJ; no universal DC, duration, action, attack, spell, movement or condition was invented.'}
 event!.status='resolved';event!.result=structuredClone(result) as unknown as Record<string,unknown>;event!.resultWitness=hazardWitness({command:event!.command,result:event!.result})
 const fact=(state.worldFacts??[]).find(f=>f.id===input.factId)!;fact.improvisedHazardResultWitness=event!.resultWitness
 return toolkitResult(result)
}
export function resolveImprovisedHazard(raw:unknown){
 const input=ResolveImprovisedHazardSchema.parse(raw),command=hazardWitness(input),old=gs.getState().dmTools?.improvisedHazards?.events[input.eventId]
 if(old){if(old.command!==command)toolkitError('IMPROVISED_HAZARD_EVENT_CONFLICT','Retain the exact original occurrence, target, dice, defenses and save policy.');if(old.status==='resolved')return toolkitResult({...old.result,replayed:true});toolkitError('IMPROVISED_HAZARD_SAVE_REQUIRED','Resolve this same original pending save with resolve_reaction; no nonce rerolls it.')}
 available();readDmgImprovisedHazardSource();const state=gs.getState(),fact=(state.worldFacts??[]).find(f=>f.id===input.factId)
 if(!fact||fact.source!=='record_scene_fact'||fact.expires!=='never'||fact.mapId!==state.currentMapId||fact.roomId!==state.currentRoomId||fact.clueId||fact.subjectItemId||fact.waterEffect
  ||fact.narrativeEffect?.cell.x!==input.cell.x||fact.narrativeEffect?.cell.y!==input.cell.y)
  toolkitError('IMPROVISED_HAZARD_ACTUAL_FACT_REQUIRED','Select a durable current local actual occurrence recorded by the MJ, not a clue/item/water grant, parsed text or an unrepresented action.')
 if(fact!.improvisedHazardEventId!==undefined||fact!.improvisedHazardResultWitness!==undefined)toolkitError('IMPROVISED_HAZARD_FACT_USED','This exact physical occurrence already owns its one event. Another nonce cannot repeat damage or select a second victim.')
 if(Object.keys(state.dmTools?.improvisedHazards?.events??{}).length>=128)toolkitError('IMPROVISED_HAZARD_HISTORY_LIMIT','Retain all original one-shot results; no receipt is evicted to repeat an occurrence.')
 const context=preflight(input)
 const event:ImprovisedHazardEvent={input,command,at:state.worldTimeSeconds??0,mapId:state.currentMapId!,roomId:context.location.roomId,
  source:{...IMPROVISED_HAZARD_SOURCE},fact:structuredClone(unclaimedHazardFact(fact!)) as unknown as Record<string,unknown>,bodyWitness:improvisedHazardBodyWitness(state,input.targetId),status:'held'}
 data().events[input.eventId]=event;fact!.improvisedHazardEventId=input.eventId
 if(!input.save)return finish(input.eventId)
 const result=savedResolution({entityId:input.targetId,ability:input.save.ability,dc:input.save.dc,magical:input.magical,origin:input.cell},{domain:'improvised-hazard',command:{eventId:input.eventId}})
 if(gs.getState().hero?.pending)event.heldWitness=hazardWitness(hero().pending)
 return result
}
export function registerImprovisedHazardResolutions(){registerCheckedResolution('improvised-hazard',(command,save)=>finish(String(command.eventId),save as SavingThrowResult))}
export function assertImprovisedHazardHeldWindow(){
 const state=gs.getState(),errors=validateImprovisedHazards(state)
 if(errors.length)toolkitError('IMPROVISED_HAZARD_STATE_MISMATCH',errors.join(' '))
 const held=hazardPending(state)
 if(held){readDmgImprovisedHazardSource();preflight(state.dmTools!.improvisedHazards!.events[String(held.command?.eventId)].input)}
}
export function assertImprovisedHazardBodyMutation(id:string){const held=hazardPending(gs.getState()),event=held?gs.getState().dmTools?.improvisedHazards?.events[String(held.command?.eventId)]:undefined;if(held&&event?.input.targetId===id)toolkitError('IMPROVISED_HAZARD_SAVE_REQUIRED','Resolve the original actual hazard save before a separate mutation of its body.')}
export function inspectImprovisedHazards(eventId?:string){return{readOnly:true,source:readDmgImprovisedHazardSource(),diceSuggestions:[1,2,4,10,18,24].map(n=>n+'d10'),tablesAreSuggestions:true,universalDcOrTimeGranted:false,events:eventId?{[eventId]:gs.getState().dmTools?.improvisedHazards?.events[eventId]??null}:gs.getState().dmTools?.improvisedHazards?.events??{},diceRolled:false}}
