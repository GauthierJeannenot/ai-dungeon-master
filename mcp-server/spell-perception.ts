import { spellComponentConstraints } from './spell-components'
import { inferRoomIdOnMap } from '../lib/adventure-map'
import { randomUUID } from 'node:crypto'
import type { GameState,PlayerState,MonsterState } from '../lib/types'
import { SpellObserversSchema,interruptSpellPerceptionInState,spellPerceptionCommand,spellPerceptionView,type SpellPerceptionOriginal,type SpellPerceptionRecord } from '../lib/spell-perception-state'
import { groundGearPhysicalWitness as witness } from '../lib/ground-gear-recovery-state'
import { entityVerticalContext } from '../lib/jumping-state'
import { swallowedBy } from '../lib/swallow-state'
import { creaturePerception } from './senses'
import { toolkitError,toolkitState } from './toolkit'
import * as gs from './game-state'
export interface SpellObservationInput {spellId?:string;casterId?:string;materialItemId?:string;focusItemId?:string;magicItemId?:string;scrollItemId?:string;spellObservers?:unknown;spellPerceptionEventId?:string;readiedRelease?:boolean}
const frame=(state:GameState,actor:PlayerState|MonsterState)=>({entityId:actor.id,position:{...actor.position},conditions:[...actor.conditions],hp:actor.hp.current,mapId:state.currentMapId,roomId:inferRoomIdOnMap(actor.position,state.currentMapId,state),...actor.id==='player'?{loadout:structuredClone(state.dmTools?.loadout??{})}:{}})
export function planSpellPerception(input:SpellObservationInput,proof:Record<string,unknown>,projectedState?:GameState):SpellPerceptionOriginal|undefined{
 if(input.readiedRelease)return undefined
 const state=projectedState??gs.getState(),existing=input.spellPerceptionEventId&&state.dmTools?.spellPerception?.records[input.spellPerceptionEventId]
 if(existing){if(existing.original.casterId!==(input.casterId??'player')||existing.original.spellId!==input.spellId)toolkitError('SPELL_PERCEPTION_ORIGINAL_CAST_REQUIRED','Keep this exact actual original casting producer.');return existing.original}
 if(input.spellPerceptionEventId)toolkitError('SPELL_PERCEPTION_ORIGINAL_CAST_REQUIRED','A retained internal cast marker cannot invent an observation or another cast.')
 if(input.spellObservers===undefined)return undefined
 const actor=(id:string)=>{const actual=gs.getEntity(id);if(!projectedState)return actual;return actual?(id==='player'?state.player:state.monsters[id]??(state.npcs?.[id]&&'stats'in state.npcs[id]?state.npcs[id] as MonsterState:undefined)):undefined}
 const selections=SpellObserversSchema.parse(input.spellObservers),caster=actor(input.casterId??'player')
 if(!caster||!state.currentMapId||!state.currentRoomId)toolkitError('SPELL_PERCEPTION_CAST_SOURCE_REQUIRED','Select a real source caster on the current established map before its actual cast.')
 if(Object.keys(state.dmTools?.spellPerception?.records??{}).length>=512)toolkitError('SPELL_PERCEPTION_HISTORY_LIMIT','Retain the original observation history before another watched cast; no actual source is evicted.')
 const components=(proof.exemption?[]:proof.components) as Array<'V'|'S'|'M'>
 if(proof.valid!==true||!Array.isArray(components))toolkitError('SPELL_PERCEPTION_COMPONENT_SOURCE_REQUIRED','The actual existing component preflight must certify this exact casting producer.')
 const observers=selections.map(selection=>{
  const observer=actor(selection.observerId)
  if(!observer||observer.id===caster!.id)toolkitError('SPELL_PERCEPTION_OBSERVER_REQUIRED','Choose another existing real observer body, not a profile, yourself or an inferred spectator.')
  const capable=observer!.hp.current>0&&!observer!.conditions.some(c=>['unconscious','petrified'].includes(c)),external=Boolean(swallowedBy(state,caster!.id)||swallowedBy(state,observer!.id))
  const observerSilenced=spellComponentConstraints(state,observer!.id).some(c=>c.kind==='silenced')||state.hero?.effects.some(e=>e.kind==='silence'&&e.targetIds.includes(observer!.id)&&e.expiresAt>(state.worldTimeSeconds??0))
  if(external&&components.length&&capable)toolkitError('SPELL_PERCEPTION_CONTAINMENT_UNSUPPORTED','This first casting observation has no represented interior/exterior hand, mouth or acoustic geometry; no host-derived XY grants perception.')
  const hearingCandidate=!observerSilenced&&selection.channels.includes('hearing')&&components.includes('V')&&capable&&!observer!.conditions.includes('deafened')&&!external
  const sightCandidate=selection.channels.includes('sight')&&components.length>0&&capable&&!observer!.conditions.includes('blinded')&&!external
  if(hearingCandidate||sightCandidate){
   const contexts=[entityVerticalContext(state,caster!.id),entityVerticalContext(state,observer!.id)]
   if(contexts.some(v=>!v.known||v.airborne||v.zFeet!==0))toolkitError('SPELL_PERCEPTION_GEOMETRY_REQUIRED','This actual observation requires measured coplanar external source/observer geometry; no three-dimensional mouth/hand/ray or interior acoustics are inferred.')
  }
  let fact:Record<string,unknown>|undefined
  if(selection.verbalAudibility&&!selection.channels.includes('hearing'))toolkitError('SPELL_PERCEPTION_AUDIBILITY_ARGUMENT','An actual verbal audibility fact belongs only to a selected hearing channel.')
  if(hearingCandidate){
   const qualification=selection.verbalAudibility
   if(!qualification)toolkitError('SPELL_PERCEPTION_AUDIBILITY_REQUIRED','Explicitly qualify this actual source voice reaching this exact observer with its real scene fact and reason; no universal sound radius is invented.')
   const actual=state.worldFacts?.find(f=>f.id===qualification!.factId),cell=actual?.narrativeEffect?.cell
   if(!actual||actual.mapId!==state.currentMapId||!cell||cell.x!==caster!.position.x||cell.y!==caster!.position.y)toolkitError('SPELL_PERCEPTION_AUDIBILITY_FACT_REQUIRED','Keep the actual qualified source voice fact at the current real caster cell, not another scene, voice or retroactive event.')
   fact=structuredClone(actual) as unknown as Record<string,unknown>
  }
  const hidden=state.hero?.effects.some(e=>e.kind==='hidden'&&e.targetIds.includes(caster!.id)&&e.expiresAt>(state.worldTimeSeconds??0))
  const sense=sightCandidate?creaturePerception(observer!,caster!,projectedState):undefined
  // Blindsight is not silently promoted into detailed visual component/gesture
  // recognition. Its current source may perceive a body; this first slice does
  // not invent visible fingers, colors or material details for that sense.
  if(sense?.canSee&&sense.mode==='blindsight')toolkitError('SPELL_PERCEPTION_SENSE_UNSUPPORTED','Detailed visual component recognition through this nonsight mode needs its own source/physical qualification; no new sense detail is granted.')
  const sight=Boolean(sense?.canSee&&!hidden),hearing=Boolean(hearingCandidate)
  return{selection,observerFrame:{...frame(state,observer!),soundSuppressed:Boolean(observerSilenced),auditoryConstraintIds:spellComponentConstraints(state,observer!.id).filter(c=>c.kind==='silenced').map(c=>c.id)},sight,hearing,perceivedComponents:components.filter(c=>c==='V'?hearing:sight),...fact?{fact}:{},...sense?{sense:sense as unknown as Record<string,unknown>}:{}}
 })
 const command={...input};delete command.spellPerceptionEventId
 const plan:SpellPerceptionOriginal={id:`spell-observation-${randomUUID()}`,casterId:caster!.id,spellId:input.spellId!,mapId:state.currentMapId!,roomId:inferRoomIdOnMap(caster!.position,state.currentMapId,state)!,at:state.worldTimeSeconds??0,sourceFrame:{...frame(state,caster!),componentItems:[input.materialItemId,input.focusItemId].filter(Boolean).map(id=>structuredClone(state.player.inventory.find(item=>item.id===id)!)),...input.magicItemId?{magicItemSource:structuredClone(state.dmTools?.magicItems?.[input.magicItemId])}:{},...input.scrollItemId?{scrollSource:structuredClone(state.dmTools?.spellScrolls?.[input.scrollItemId])}:{}},componentProof:structuredClone(proof),effectiveComponents:components,observers,command:witness(command)}
 if(plan.command.length>50000||spellPerceptionCommand(plan).length>100000)toolkitError('SPELL_PERCEPTION_WITNESS_LIMIT','Retain a bounded original sensory/component witness before any watched cast cost; no history is truncated or source erased.')
 return plan
}
export function commitSpellPerception(original:SpellPerceptionOriginal|undefined,phase:SpellPerceptionRecord['phase'],castingId?:string){
 if(!original)return
 const state=toolkitState().spellPerception??={version:1,records:{}},prior=state.records[original.id]
 if(prior){if(prior.originalCommand!==spellPerceptionCommand(original))toolkitError('SPELL_PERCEPTION_ORIGINAL_CHANGED','The original actual cast observation cannot be replaced after its first source component.');if(prior.phase===phase)return;if(prior.phase==='cast'||prior.phase==='interrupted')toolkitError('SPELL_PERCEPTION_ALREADY_RESOLVED','The same actual incantation cannot emit a second cast or refresh its observation.');prior.phase=phase;prior.transitions.push({phase,at:gs.getState().worldTimeSeconds??0,reason:phase==='cast'?'original_cast_costs_committed':'actual_incantation_progress'});if(castingId)prior.castingId=castingId;return}
 state.records[original.id]={original:structuredClone(original),originalCommand:spellPerceptionCommand(original),phase,transitions:[{phase,at:gs.getState().worldTimeSeconds??0,reason:phase==='incanting'?'actual_long_cast_started':phase==='begun'?'actual_cast_reaction_window':'actual_cast_costs_committed'}],...castingId?{castingId}:{}}
}
export function interruptSpellPerception(castingId:string,reason:string,at:number){
 interruptSpellPerceptionInState(gs.getState(),castingId,reason,at)
}
export function inspectSpellPerception(eventId:string,observerId:string){
 const records=gs.getState().dmTools?.spellPerception?.records,record=records&&Object.hasOwn(records,eventId)?records[eventId]:undefined
 if(!record)toolkitError('SPELL_PERCEPTION_EVENT_REQUIRED','Choose an actual retained cast observation, never a narrated effect, expected spell or invented past event.')
 const view=spellPerceptionView(record!,observerId)
 if(!view)toolkitError('SPELL_PERCEPTION_OBSERVER_NOT_RECORDED','This exact observer was not selected at the actual original cast. Current sight cannot retrofit a past observation.')
 return view!
}
export function spellPerceptionEnvelope(id:string|undefined){const record=id&&gs.getState().dmTools?.spellPerception?.records[id];return record?{spellPerceptionEventId:id,observerPerceptions:record.original.observers.map(o=>spellPerceptionView(record,o.selection.observerId))}:{}}
