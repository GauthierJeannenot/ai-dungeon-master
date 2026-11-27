import { captureUnderwaterWeaponContext } from './underwater'
import { randomUUID } from 'node:crypto'
import type { DamageType,GameState } from '../lib/types'
import { CLEAVING_SOURCE,CLEAVING_CONVENTION,CleavingChoiceSchema,cleavingWitness as witness,cleavingBudget,cleavingFrame,cleavingTurnKey,cleavingPendingId,pendingIsCleaving,validateCleavingState,cleavingInitialRemainder,type CleavingEvent } from '../lib/cleaving-state'
import { carryingStateOf } from '../lib/carrying-state'
import { temporaryHpFor } from '../lib/temporary-hp-state'
import { entityVerticalContext } from '../lib/jumping-state'
import { actualLocomotionLocation,locomotionStateOf } from '../lib/locomotion-state'
import { swallowedBy } from '../lib/swallow-state'
import { cackleDiseaseActive } from '../lib/cackle-fever-state'
import { readDmgCleavingSource } from './rules-library'
import { adjustedDamage,dealDamage,monsterSource,hasTrait,reactToHarm } from './monster-rules'
import { canSee,visibleCell } from './monster-perception'
import { assertDirectCoverTarget,coverArmorClass } from './cover'
import { weaponForReference,selectedWeaponItem,weaponItemHeld } from './equipment'
import { magicWeaponBonus } from './magic-items'
import { available,fail,feature,hero,effectiveAC,distance,now } from './hero-rules'
import { toolkitState,toolkitResult } from './toolkit'
import * as gs from './game-state'
import * as rules from './rules'

type Intent={attackerId:string;targetId:string;weaponOrSpell:string;cleaving?:boolean;cleaveId?:string;reaction?:boolean;twoWeapon?:unknown;deferAction?:boolean;nonlethal?:boolean;newAttackAction?:boolean}
export interface CleavingWeaponSource{attackEventId:string;attackActionId?:string;weaponId:string;itemId?:string;damageType:DamageType;magical:boolean;silvered:boolean;melee:boolean;rangeCells?:number;improvised:boolean;poisoned:boolean;water:boolean}
const event=(id:string)=>{const events=gs.getState().dmTools?.cleaving?.events;return events&&Object.hasOwn(events,id)?events[id]:undefined}
const same=(a:{x:number;y:number},b:{x:number;y:number})=>a.x===b.x&&a.y===b.y
const record=(v:unknown)=>v&&typeof v==='object'?v as Record<string,unknown>:undefined
const plainTypes=['bludgeoning','piercing','slashing'] as const

function qualifyActor(a?:CleavingEvent){
 const s=gs.getState(),p=s.player,fact=carryingStateOf(s)?.actors.player,v=entityVerticalContext(s,'player')
 if(s.phase!=='combat'||s.currentTurn!=='player'||!s.initiativeOrder.includes('player')||p.hp.current<=0||p.deathSaves?.dead||p.conditions.some(c=>['incapacitated','unconscious','stunned','paralyzed','petrified'].includes(c)))fail('CLEAVING_PLAYER_TURN_REQUIRED','Use one capable actual player Attack turn; no reaction, initiative or new attacker is inferred.')
 if(!fact||!['Small','Medium'].includes(fact.size)||!v.known||v.airborne||v.aboveSupportFeet!==0||actualLocomotionLocation(s,'player')||swallowedBy(s,'player'))fail('CLEAVING_BODY_SCOPE_REQUIRED','The first slice needs an explicitly qualified Small/Medium body on known dry ground; no footprint, contained or 3D melee is flattened.')
 if(cackleDiseaseActive(s,'player'))fail('CLEAVING_REACTIVE_DISEASE_UNREPRESENTED','The attack source currently has a disease stress continuation outside this plain cleaving slice; refuse before its die/cost.')
 if(a&&(a.turnKey!==cleavingTurnKey(s)||a.mapId!==s.currentMapId||!same(p.position,a.input.actorCell)))fail('CLEAVING_SOURCE_FRAME_CHANGED','The retained attack belongs to its original actual turn, map and physical attacker cell. Earlier damage is retained; choose explicit stop rather than a new attack origin.')
 return v
}
function qualifyTarget(id:string,type:DamageType,silvered:boolean,fullOrigin=false){
 const s=gs.getState(),p=s.player,target=gs.getMonster(id),actorHeight=qualifyActor()
 if(!target||id==='player'||!target.isAlive||target.hp.current<=0||!s.initiativeOrder.includes(id)||target.hostile===false||target.group)fail('CLEAVING_INDIVIDUAL_TARGET_REQUIRED','Choose one exact positive-HP living hostile enrolled individual; no shared group member, corpse or implied creature is selected.')
 rules.validateHostileTarget('player',id)
 const size=String(monsterSource(target!)?.size??''),v=entityVerticalContext(s,id)
 if(!['Small','Medium'].includes(size)||!v.known||v.airborne||v.aboveSupportFeet!==0||v.zFeet!==actorHeight.zFeet||actualLocomotionLocation(s,id)||swallowedBy(s,id)||distance(p.position,target!.position)>1)fail('CLEAVING_TARGET_GEOMETRY_REQUIRED','Each chosen individual needs represented Small/Medium dry coplanar ground within the original attacker five-foot reach, not range from the previous victim.')
 if(Object.values(locomotionStateOf(s)?.media??{}).some(m=>m.mode==='swim'&&m.mapId===s.currentMapId&&m.cells.some(c=>same(c,p.position)||same(c,target!.position))))fail('CLEAVING_DRY_GROUND_REQUIRED','This first damage chain does not flatten a measured water medium into dry melee.')
 if(!canSee(p,target!)||!visibleCell(p,target!.position))fail('CLEAVING_TARGET_NOT_VISIBLE','Select an actually visible unobstructed body, not an inferred location or hidden candidate.')
 assertDirectCoverTarget('player',id)
 if(fullOrigin&&target!.hp.current!==target!.hp.max)fail('CLEAVING_ORIGIN_DAMAGED','Optional cleaving requires the real positive full-HP origin before the actual attack; no source-average HP or never-wounded history is invented.')
 const probe=adjustedDamage(target!,100,type,false,silvered,true)
 if(temporaryHpFor(s,id)>0||probe.damage!==100||probe.adjustments.length||hasTrait(target!,'Undead Fortitude')||target!.monsterRuntime?.invisibleConcentration||Boolean(s.hero?.concentrationIds[id])||cackleDiseaseActive(s,id)||s.monsterEffects?.some(e=>e.targetId===id&&e.kind==='fey-charm')||s.hero?.effects.some(e=>e.kind==='death-ward'&&e.expiresAt>now()&&e.targetIds.includes(id)))fail('CLEAVING_DAMAGE_CONTEXT_UNREPRESENTED','Temporary HP, defenses, reactive Fortitude/concentration/charm/disease or zero-HP rescue need damage procedures outside this transparent first slice. No damage or source die is created.')
 return{target:target!,snapshot:{id,position:{...target!.position},hp:{...target!.hp},conditions:[...target!.conditions],type:target!.type,size,mapId:s.currentMapId,groundZFeet:v.zFeet}}
}
function assertOriginalWeapon(a:CleavingEvent){
 const w=weaponForReference(a.input.weaponReference),item=selectedWeaponItem(a.input.weaponReference)
 if(!w||w.id!==a.input.weaponId||w.id!=='unarmed'&&(!item||item.id!==a.input.itemId||!weaponItemHeld(item))||item?.magical||magicWeaponBonus(item?.id)!==0||w.improvised)fail('CLEAVING_ORIGINAL_WEAPON_REQUIRED','The retained ordinary melee source weapon must still be the actual held original item; no new weapon, damage modifier or attack is selected. Explicit stop remains available.')
}
/** Called after normal attack preflight and before its original d20/cost. */
export function prepareCleavingOrigin(input:Intent,source:CleavingWeaponSource,held=false):string|undefined{
 if(!input.cleaving&&!input.cleaveId)return
 readDmgCleavingSource()
 if(input.cleaving!==true||input.attackerId!=='player'||input.reaction||input.twoWeapon||input.deferAction||input.nonlethal||!source.melee||source.rangeCells!==1||source.improvised||source.magical||source.poisoned||source.water||!plainTypes.includes(source.damageType as typeof plainTypes[number])||!source.attackActionId)fail('CLEAVING_ATTACK_SCOPE_UNREPRESENTED','Explicit optional cleaving currently supports one ordinary lethal physical primary melee/unarmed player attack. No spell, thrown/ranged, poison, rider, nonlethal, Ready/reaction or multiattack adoption is inferred; no original die/cost spent.')
 qualifyActor();const origin=qualifyTarget(input.targetId,source.damageType,source.silvered,true)
 const s=gs.getState()
 if(held){
  const a=input.cleaveId?event(input.cleaveId):undefined
  if(!a||a.status!=='held_attack'||a.input.attackEventId!==source.attackEventId||a.input.attackActionId!==source.attackActionId||a.input.targetId!==input.targetId||a.input.weaponReference!==input.weaponOrSpell||a.heldFrame!==cleavingFrame(s,input.targetId))fail('CLEAVING_HELD_MISMATCH','Retain the same original cost-free held attack, actual origin HP, weapon and d20 before another consequence.')
  a!.status='preparing';delete a!.pendingWitness;delete a!.heldFrame;return a!.id
 }
 if(input.cleaveId)fail('CLEAVING_SOURCE_NOT_PUBLIC','A new attack cannot claim another retained cleaving attack ID.')
 const existing=s.dmTools?.cleaving
 if(Object.values(existing?.events??{}).some(a=>a.status!=='closed'))fail('CLEAVING_CHOICE_REQUIRED','Finish the original source before adopting another cleaving attack.')
 if(Object.keys(existing?.events??{}).length>=256)fail('CLEAVING_HISTORY_LIMIT','Reserve the actual original source history before another attack die or cost.')
 const id=`cleave-${randomUUID()}`,data=toolkitState().cleaving??={version:1,events:{}},initial={attackEventId:source.attackEventId,attackActionId:source.attackActionId!,targetId:input.targetId,weaponReference:input.weaponOrSpell,weaponId:source.weaponId,...source.itemId?{itemId:source.itemId}:{},damageType:source.damageType as typeof plainTypes[number],silvered:source.silvered,newAttackAction:Boolean(input.newAttackAction),extraAttack:Boolean(feature('extra_attack')),improvedCritical:Boolean(feature('improved_critical')),originSnapshot:structuredClone(origin.snapshot),actorSizeFact:structuredClone(carryingStateOf(s)!.actors.player) as unknown as Record<string,unknown>,originHp:origin.snapshot.hp,actorCell:{...s.player.position},budget:cleavingBudget(s)}
 data.events[id]={id,source:CLEAVING_SOURCE,convention:CLEAVING_CONVENTION,turnKey:cleavingTurnKey(s),mapId:s.currentMapId!,at:now(),input:structuredClone(initial),inputWitness:witness(initial),status:'preparing',remaining:0,discarded:0,steps:{},order:[]}
 return id
}
export function validateHeldCleavingAttack(){
 const s=gs.getState();if(!pendingIsCleaving(s.hero?.pending))return
 const issues=validateCleavingState(s);if(issues.length)fail('CLEAVING_HELD_MISMATCH',issues.join(' '));readDmgCleavingSource()
 const a=event(String(cleavingPendingId(s.hero?.pending)))!;qualifyTarget(a.input.targetId,a.input.damageType,a.input.silvered,true);assertOriginalWeapon(a)
}
const cursor=(a:CleavingEvent)=>({cleaveId:a.id,source:a.source,convention:a.convention,status:a.status,remainingDamage:a.remaining,discardedDamage:a.discarded,closeReason:a.closeReason,blockedReason:a.blockedReason,explicitNextChoiceRequired:a.status==='awaiting_choice',originalAttackRoll:a.original?.attackRoll,originalDamageRoll:a.original?.damageRoll,originalAttackEventId:a.input.attackEventId,stepOrder:[...a.order]})
export function finishCleavingOrigin(id:string|undefined,result:Record<string,unknown>,naturalCritical:boolean){
 if(!id)return
 const a=event(id);if(!a||a.status!=='preparing')fail('CLEAVING_ORIGIN_SOURCE_REQUIRED','Only the exact actual original melee attack can establish this damage cursor.')
 a!.original=structuredClone(result);a!.originalWitness=witness(a!.original);a!.attackRollWitness=witness(result.attackRoll);a!.naturalCritical=naturalCritical;a!.budgetAfter=cleavingBudget(gs.getState());a!.remaining=cleavingInitialRemainder(a!)
 delete a!.pendingWitness;delete a!.heldFrame
 const d=record(result.damageResolution),temp=record(d?.temporaryHp)
 if(a!.remaining>0){
  a!.status='awaiting_choice'
  if(Number(temp?.absorbed??0)!==0||Array.isArray(d?.damageAdjustment)&&d.damageAdjustment.length||d?.fortitude)a!.blockedReason='unexpected_damage_context_requires_explicit_stop'
 }else{a!.status='closed';a!.closeReason=!result.hit?'origin_missed':Number(d?.hpAfter)>0?'origin_survived':'no_remaining_damage'}
 return cursor(a!)
}
export function resolveCleavingChoice(raw:unknown){
 const input=CleavingChoiceSchema.parse(raw),a=event(input.cleaveId)
 if(!a)fail('CLEAVING_SOURCE_REQUIRED','Choose the actual retained original attack cursor, never a narrated hit or arbitrary damage.')
 const issues=validateCleavingState(gs.getState());if(issues.length)fail('CLEAVING_STATE_MISMATCH',issues.join(' '))
 const previous=Object.hasOwn(a!.steps,input.stepId)?a!.steps[input.stepId]:undefined
 if(previous){if(previous.inputWitness!==witness(input))fail('CLEAVING_STEP_REUSED','An original step nonce retains its exact target/stop choice.');return toolkitResult({...structuredClone(previous.result),replayed:true,currentCursor:cursor(a!)})}
 if(a!.status==='held_attack'||a!.status==='preparing')fail('CLEAVING_ORIGIN_REACTION_REQUIRED','Finish the original actual held attack before choosing remaining-damage carry or stop; this does not cancel or refund that attack.')
 if(a!.status!=='awaiting_choice')fail('CLEAVING_CURSOR_CLOSED','The original chain is terminal; a new nonce grants no retry, damage, die or action.')
 readDmgCleavingSource()
 if(input.choice==='stop'&&input.targetId!==undefined||input.choice==='carry'&&!input.targetId)fail('CLEAVING_CHOICE_REQUIRED','Choose explicit stop with no victim, or explicit carry with exactly one actual targetId.')
 if(a!.order.length>=32||input.choice==='carry'&&a!.order.length>=31)fail('CLEAVING_STEP_LIMIT','Retain a slot for explicit stop; no additional carry damage is committed beyond this first slice history bound.')
 const incoming=a!.remaining
 if(input.choice==='stop'){
  const result={success:true,cleaveId:a!.id,stepId:input.stepId,choice:'stop',source:a!.source,convention:a!.convention,status:'closed',remainingBefore:incoming,remainingAfter:0,discardedDamage:incoming,originalAttackRetained:true,mechanicalSummary:'Explicit attacker stop under the recorded user convention; prior HP, dice and Attack/Extra Attack costs remain committed, even if other eligible creatures remain.'}
  a!.steps[input.stepId]={input:structuredClone(input),inputWitness:witness(input),incoming,outgoing:0,discarded:incoming,attackRollWitness:a!.attackRollWitness!,reason:'explicit_user_stop',result:structuredClone(result),resultWitness:witness(result)};a!.order.push(input.stepId);a!.remaining=0;a!.discarded+=incoming;a!.status='closed';a!.closeReason='explicit_user_stop';return toolkitResult(result)
 }
 available({allowCleavingChoice:a!.id});qualifyActor(a!);assertOriginalWeapon(a!)
 if(a!.blockedReason)fail('CLEAVING_DAMAGE_CONTEXT_UNREPRESENTED','The retained first attack stays committed but its unrepresented damage context cannot be converted; explicitly stop rather than invent carry damage.')
 if(input.targetId===a!.input.targetId||a!.order.some(key=>a!.steps[key].input.targetId===input.targetId))fail('CLEAVING_TARGET_ALREADY_USED','Select another actual individual, not the origin or any earlier chosen victim of this same attack.')
 const body=qualifyTarget(input.targetId!,a!.input.damageType,a!.input.silvered)
 const water=captureUnderwaterWeaponContext({actorId:'player',target:{kind:'creature',entityId:input.targetId!},weaponReference:a!.input.itemId??'unarmed',canonicalWeaponId:a!.input.weaponId,attackMode:'melee',melee:true,weaponAttack:true,distanceCells:distance(gs.getPlayer().position,body.target.position)})
 if(water.waterWitnesses.length)fail('CLEAVING_DRY_GROUND_REQUIRED','This selected carry has an actual canonical water context outside the initial dry-ground slice. Earlier damage and the source cursor remain; choose another target or explicit stop.')
 const ac=coverArmorClass('player',input.targetId!,effectiveAC(input.targetId!)),roll=record(a!.original?.attackRoll)!,natural=Number(a!.original?.naturalRoll)
 // An admissible target's AC comparison is an actual terminal miss, NEVER an
 // invalid-target preflight refusal allowing a free choice of another victim.
 const hit=Boolean(a!.naturalCritical||natural!==1&&Number(roll.total)>=ac)
 const damage=hit?dealDamage(input.targetId!,incoming,a!.input.damageType,{weaponAttack:true,magical:false,silvered:a!.input.silvered,sourceId:'player',critical:Boolean(a!.original?.criticalHit),damageEventId:`${a!.input.attackEventId}:cleave:${input.stepId}`}):undefined
 const harm=hit?[]:reactToHarm('player',input.targetId!)
 const mathematicalRemainder=hit?Math.max(0,incoming-damage!.hpLost):incoming,wasFull=body.snapshot.hp.current===body.snapshot.hp.max,continues=hit&&wasFull&&damage!.hpAfter===0&&mathematicalRemainder>0
 const reason=!hit?'original_roll_missed':!wasFull?'secondary_already_damaged':damage!.hpAfter>0?'secondary_survived':mathematicalRemainder===0?'remaining_exhausted':'next_choice_available',outgoing=continues?mathematicalRemainder:0,discarded=continues?0:mathematicalRemainder
 const result={success:true,cleaveId:a!.id,stepId:input.stepId,choice:'carry',source:a!.source,convention:a!.convention,targetId:input.targetId,hit,targetAC:ac,originalAttackRoll:structuredClone(roll),originalDamageRoll:structuredClone(a!.original?.damageRoll),newAttackOrDamageDiceRolled:false,extraAttackSpent:false,remainingBefore:incoming,damageResolution:damage,harmSaves:harm,remainingAfter:outgoing,discardedDamage:discarded,targetWasUndamaged:wasFull,targetHpAfter:damage?.hpAfter??body.snapshot.hp.current,status:continues?'awaiting_choice':'closed',stopReason:continues?undefined:reason,mechanicalSummary:!hit?'The same original attack roll misses this admissible selected creature: the chain ENDS; no other target retry or new die.':`The selected creature receives ${incoming} remaining damage from the original attack; ${reason}. No new d20, damage die, modifier, action or elapsed time.`}
 a!.steps[input.stepId]={input:structuredClone(input),inputWitness:witness(input),incoming,outgoing,discarded,attackRollWitness:a!.attackRollWitness!,target:structuredClone(body.snapshot),targetWitness:witness(body.snapshot),targetAC:ac,hit,...damage?{damage:structuredClone(damage) as unknown as Record<string,unknown>,damageWitness:witness(damage)}:{},reason,result:structuredClone(result),resultWitness:witness(result)};a!.order.push(input.stepId);a!.remaining=outgoing;a!.discarded+=discarded;a!.status=continues?'awaiting_choice':'closed';if(!continues)a!.closeReason=reason
 gs.addLogEntry({round:gs.getState().round,turn:'player',action:'DMG cleaving step',mechanicalDetail:result.mechanicalSummary})
 return toolkitResult(result)
}
