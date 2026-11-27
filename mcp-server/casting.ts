import { interruptSpellPerception } from './spell-perception'
import { randomUUID } from 'node:crypto'
import type { CastingRecord } from '../lib/casting-state'
import { activeCasting, castingDueIssue } from '../lib/casting-state'
import { armorSpellcastingBlocked } from '../lib/armor-penalties'
import { toolkitState } from './toolkit'
import * as gs from './game-state'
import * as rules from './rules'
import { available,hero,now,fail,addHeroEffect,removeHeroEffect,spendHeroAction,advanceHeroTime } from './hero-rules'
import { inspectSpellComponents } from './spell-components'
import { assertMagicTouch } from './magic-items'
import { endInvisibility } from './monster-rules'
import { assertGameTimeAdvance } from './time-preflight'
import { cast5eSpell,type HeroSpellInput } from './hero-spells'
import { getSpell } from '../lib/srd/spells'

let workingId:string|undefined
const turnKey=()=>`${gs.getState().combatGeneration??0}:${hero().turnStarted.player??0}`
const inputOf=(cast:CastingRecord)=>cast.input as HeroSpellInput
const record=(id:string)=>gs.getState().dmTools?.casting?.records[id]??fail('CASTING_NOT_FOUND','Choose an exact recorded incantation ID.')
function interrupt(cast:CastingRecord,reason:string,at=now()) {
  cast.status='interrupted';cast.interruption={reason,at}
  interruptSpellPerception(cast.id,reason,at)
  removeHeroEffect(cast.concentrationEffectId,at)
}
function physicalIssue(cast:CastingRecord):string|undefined {
  const state=gs.getState(),player=gs.getPlayer(),input=inputOf(cast)
  if(player.hp.current<=0||player.deathSaves?.dead||player.conditions.some(c=>['incapacitated','paralyzed','stunned','unconscious','petrified'].includes(c)))return 'caster_incapacitated'
  if(state.currentMapId!==cast.mapId)return 'map_changed'
  if(armorSpellcastingBlocked(state,'player'))return 'armor_prevents_casting'
  const components=inspectSpellComponents(state,{spellId:cast.spellId,casterId:'player',materialItemId:input.materialItemId,focusItemId:input.focusItemId})
  if(!components.valid)return components.issues[0].code
  if(cast.spellId==='identify')try{assertMagicTouch(input.itemId!)}catch{return 'identify_touch_lost'}
  return undefined
}
/** No elapsed waiting, travel or rest becomes casting work. Zero-time state
 * changes still test the actual hands, voice, touch and concentration. */
export function reconcileCasting() {
  const state=gs.getState(),cast=activeCasting(state)
  if(!cast)return
  if(state.hero?.concentrationIds.player!==cast.concentrationEffectId){interrupt(cast,'concentration_lost');return}
  const issue=physicalIssue(cast)
  if(issue){interrupt(cast,issue);return}
  if(cast.lastPhase==='exploration'&&workingId!==cast.id&&now()>cast.lastWorkedAt){interrupt(cast,'noncasting_time_elapsed',cast.lastWorkedAt);return}
  if(state.phase==='combat')cast.lastWorkedAt=now()
  cast.lastPhase=state.phase==='combat'?'combat':'exploration'
  if(cast.activeSeconds>=cast.durationSeconds&&now()-cast.startedAt>=cast.durationSeconds)cast.status='ready'
}
export function assertCastingTurnEnd(actorId:string) {
  reconcileCasting()
  const cast=activeCasting(gs.getState())
  if(!cast)return
  const due=castingDueIssue(gs.getState())
  if(due)fail(due.code,due.message)
  if(actorId==='player'&&!cast.turnKeys.includes(turnKey()))interrupt(cast,'required_turn_action_missing')
}
function spendCastingAction(cast:CastingRecord) {
  const key=turnKey()
  if(cast.turnKeys.includes(key))fail('CASTING_ACTION_ALREADY_USED','This turn already contributed its one casting action; Action Surge cannot accelerate the incantation.')
  rules.validateActionUse('player')
  if(hero().bonusSpellCast)fail('BONUS_SPELL_RESTRICTION','A long casting action is not a cantrip with a casting time of one action.')
  spendHeroAction();delete hero().attackAction
  // Even a long cantrip is not the one-action cantrip exception.
  hero().actionSpellCast=true
  cast.turnKeys.push(key);cast.activeSeconds=Math.min(cast.durationSeconds,cast.activeSeconds+6)
  cast.lastWorkedAt=now()
}
export function beginCasting(input:HeroSpellInput,durationSeconds:number) {
  if(activeCasting(gs.getState()))fail('CASTING_ALREADY_ACTIVE','Finish or cancel the actual incantation before starting another long cast.')
  if((input.casterId??'player')!=='player'||input.magicItemId||input.scrollItemId)fail('LONG_CAST_ACTOR_UNSUPPORTED','The current catalogue only registers long casting for the player’s normal spells.')
  if(!gs.getState().currentMapId)fail('CASTING_MAP_REQUIRED','Long casting requires an established current map, not an invented legacy location.')
  const records=gs.getState().dmTools?.casting?.records??{}
  if(Object.keys(records).length>=128)fail('CASTING_RECORD_LIMIT','The incantation record limit was reached before any cost.')
  // Validate again before ending any previous concentration or committing work.
  if(gs.getState().phase==='combat'){
    rules.validateActionUse('player')
    if(hero().bonusSpellCast)fail('BONUS_SPELL_RESTRICTION','A bonus-action spell cannot accompany this long casting action.')
  }
  const id=`casting-${randomUUID()}`,startedAt=now()
  const effect=addHeroEffect('casting-in-progress','player',['player'],Number.MAX_SAFE_INTEGER/2,{castingId:id,spellId:input.spellId},true)
  const cast:CastingRecord={id,casterId:'player',spellId:input.spellId!,input:structuredClone(input) as Record<string,unknown>,durationSeconds,
    activeSeconds:0,startedAt,lastWorkedAt:startedAt,lastPhase:gs.getState().phase==='combat'?'combat':'exploration',mapId:gs.getState().currentMapId!,
    concentrationEffectId:effect.id,status:'active',turnKeys:[],events:{}}
  const data=toolkitState().casting??={version:1,records:{}}
  data.records[id]=cast
  if(gs.getState().phase==='combat')spendCastingAction(cast)
  endInvisibility('player')
  return castingSnapshot(cast)
}
export function castingSnapshot(cast:CastingRecord) {
  return {success:true,castingId:cast.id,spell:cast.spellId,status:cast.status,durationSeconds:cast.durationSeconds,
    activeSeconds:cast.activeSeconds,elapsedSeconds:now()-cast.startedAt,remainingWorkSeconds:Math.max(0,cast.durationSeconds-cast.activeSeconds),
    remainingTimeSeconds:Math.max(0,cast.durationSeconds-(now()-cast.startedAt)),
    interruption:cast.interruption,slotSpent:cast.status==='completed'&&!cast.input.ritual&&(getSpell(cast.spellId)?.level??0)>0,requiresConcentration:cast.status==='active'||cast.status==='ready',
    mechanicalSummary:'Incantation suivie : seul le travail explicite compte. En combat, une action par tour et la durée réelle sont requises ; aucune résolution ni dépense de slot avant finish_casting.'}
}
export function continueCasting(input:{castingId:string;eventId:string;seconds?:number}) {
  available({allowCasting:true})
  const cast=record(input.castingId)
  const prior=Object.hasOwn(cast.events,input.eventId)?cast.events[input.eventId]:undefined
  const seconds=gs.getState().phase==='combat'?6:input.seconds
  if(prior){if(input.seconds!==undefined&&prior.seconds!==input.seconds)fail('CASTING_EVENT_CONFLICT','This event already records another duration.');return{...castingSnapshot(cast),repeated:true}}
  if(cast.status!=='active')fail('CASTING_NOT_ACTIVE','Only a still-active incantation can receive work; finish a ready one or start over after interruption.')
  if(Object.keys(cast.events).length>=2000)fail('CASTING_EVENT_LIMIT','The casting work receipt limit was reached.')
  const issue=physicalIssue(cast);if(issue)fail('CASTING_PREREQUISITE_LOST',issue)
  if(hero().concentrationIds.player!==cast.concentrationEffectId)fail('CASTING_CONCENTRATION_LOST','The actual casting concentration is absent; old progress cannot be reused.')
  if(gs.getState().phase==='combat'){
    if(input.seconds!==undefined)fail('CASTING_COMBAT_SECONDS_INVALID','Combat casting uses one real action this turn, never declared seconds.')
    spendCastingAction(cast)
  }else{
    const remaining=Math.max(cast.durationSeconds-cast.activeSeconds,cast.durationSeconds-(now()-cast.startedAt))
    if(!seconds||!Number.isInteger(seconds)||seconds<1||seconds>remaining)fail('CASTING_DURATION_INVALID','Choose positive whole seconds no larger than the remaining casting work or source time.')
    if(now()!==cast.lastWorkedAt)fail('CASTING_WORK_GAP','Unrecorded time cannot become continuous casting work; cancel and start over.')
    rules.validateActionUse('player');assertGameTimeAdvance(seconds)
    workingId=cast.id
    try{advanceHeroTime(seconds)}finally{workingId=undefined}
    // Timed source effects can actually interrupt during this activity.
    if(!cast.interruption){cast.activeSeconds=Math.min(cast.durationSeconds,cast.activeSeconds+seconds);cast.lastWorkedAt=now()}
  }
  cast.events[input.eventId]={seconds:seconds!,creditedSeconds:cast.interruption?0:seconds!,at:now(),phase:gs.getState().phase==='combat'?'combat':'exploration',...(gs.getState().phase==='combat'?{turnKey:turnKey()}:{})}
  reconcileCasting()
  return castingSnapshot(cast)
}
export interface CastingTargetChoice {targetId?:string;targetIds?:string[];toCell?:{x:number;y:number};direction?:{x:number;y:number}}
export function finishCasting(input:{castingId:string}&CastingTargetChoice) {
  available({allowCasting:true})
  const cast=record(input.castingId),choice={...input};delete (choice as {castingId?:string}).castingId
  const completion=JSON.stringify(choice)
  if(cast.status==='completed'){
    if(cast.completion!==completion)fail('CASTING_COMPLETION_CONFLICT','This incantation already finished with another explicit target choice.')
    return cast.result
  }
  if(cast.status!=='ready'||cast.activeSeconds<cast.durationSeconds||now()-cast.startedAt<cast.durationSeconds)fail('CASTING_NOT_READY','Both the actual casting work and the source duration must be completed first.')
  const physical=physicalIssue(cast);if(physical)fail('CASTING_PREREQUISITE_LOST',physical)
  if(hero().concentrationIds.player!==cast.concentrationEffectId)fail('CASTING_CONCENTRATION_LOST','The original concentration is not active.')
  const fixed=structuredClone(inputOf(cast))
  if(Object.keys(choice).length){
    if(cast.spellId==='identify')fail('IDENTIFY_TARGET_FIXED','Identify must retain the same touched physical item throughout casting.')
    if(cast.spellId==='alarm')fail('ALARM_TARGET_FIXED','Retain the original chosen Alarm door, signal mode and exemptions through completion.')
    delete fixed.targetId;delete fixed.targetIds;delete fixed.toCell;delete fixed.direction
    Object.assign(fixed,choice)
  }
  if(cast.spellId==='alarm')fixed.alarmCastingId=cast.id
  // Full current target/component/resource preflight, before the concentration
  // marker, slot or any die changes. The original selected level stays fixed.
  cast5eSpell(fixed,false,false,true,'complete')
  cast.status='completed';cast.completedAt=now();cast.completion=completion
  removeHeroEffect(cast.concentrationEffectId)
  const response=cast5eSpell(fixed,false,false,false,'complete')
  const result=JSON.parse(response.content[0].text)
  cast.result={...result,castingId:cast.id,castingCompleted:true,activeSeconds:cast.activeSeconds,elapsedSeconds:now()-cast.startedAt}
  return cast.result
}
export function cancelCasting(id:string) {
  available({allowCasting:true})
  const cast=record(id)
  if(cast.status==='completed')fail('CASTING_ALREADY_COMPLETED','A resolved spell is not an in-progress incantation.')
  if(cast.status==='active'||cast.status==='ready')interrupt(cast,'cancelled')
  return {...castingSnapshot(cast),cancelled:true}
}
