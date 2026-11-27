import { naturalSleepEpisode } from '../lib/sleep-state'
import type { EntityStats, AbilityCheckResult } from '../lib/types'
import type { CheckModeState, GroupCheckInput, CheckHelpInput } from '../lib/check-mode-state'
import { getSkill } from '../lib/srd/skills'
import { ARMOR_RULES, TOOL_IDS } from '../lib/srd/equipment'
import { getMonsterRecord } from '../lib/srd/monsters'
import { inferRoomIdOnMap, firstMapId } from '../lib/adventure-map'
import { armorRollDisadvantage } from '../lib/armor-penalties'
import { curseAbilityDisadvantage } from '../lib/curse-effects'
import { exhaustionDisadvantage } from '../lib/exhaustion'
import { afflictionSightPenalty } from '../lib/affliction-state'
import { visualPerceptionAt } from '../lib/lighting'
import { validateMapCell } from './rules'
import { getAbilityModifier } from './dice'
import { currentLoadout, equipmentId } from './equipment'
import { frightenedByVisibleSource } from './monster-perception'
import { available, alive, addHeroEffect, effects, now, hero, distance, strictHero, feature } from './hero-rules'
import { toolkitState, toolkitError, toolkitResult } from './toolkit'
import { checkedResolution, registerCheckedResolution } from './toolkit-checks'
import * as gs from './game-state'
import { perceptionCheckContext } from './perception-checks'
import type { PerceptionSense } from '../lib/weather-state'

type Selection = { ability: keyof EntityStats; skill?: string;perceptionSense?:PerceptionSense }
type Holder = { checkModes?: CheckModeState }
const current = () => (gs.getState().dmTools as Holder | undefined)?.checkModes
const state = () => (toolkitState() as ReturnType<typeof toolkitState> & Holder).checkModes ??= { groups: {}, help: {} }
function selection(input: Selection) {
  const skill = input.skill ? getSkill(input.skill) : undefined
  if (input.skill && !skill) toolkitError('CHECK_SKILL_UNKNOWN', 'Select a canonical skill ID.')
  if (skill && skill.ability !== input.ability) toolkitError('CHECK_ABILITY_MISMATCH', 'This resolver uses the canonical skill ability; the optional ability/skill variant is not adopted.')
  if (skill && ['persuasion', 'intimidation', 'deception'].includes(skill.id))
    toolkitError('CHECK_SOCIAL_TARGET_REQUIRED', 'Use the dedicated targeted social check; this generic mode cannot invent its target or social DC.')
  return skill
}
function actor(id: string,sourceNaturalHearing=false) {
  const entity = gs.getEntity(id)
  if (!entity) toolkitError('CHECK_ACTOR_NOT_MODELED', 'Select an existing active player/combatant with actual ability statistics; a narrative NPC alone has no invented statistics.')
  const naturalException=sourceNaturalHearing&&naturalSleepEpisode(gs.getState(),id)&&entity!.hp.current>0&&!entity!.conditions.some(c=>['paralyzed','petrified','stunned'].includes(c))
  if ((!alive(entity!)&&!naturalException) || 'isAlive' in entity! && !entity!.isAlive) toolkitError('CHECK_ACTOR_UNAVAILABLE', 'The selected participant must be alive and able to act.')
  if (entity!.conditions.includes('exhaustion') && !gs.getState().dmTools?.exhaustion?.creatures[id])
    toolkitError('EXHAUSTION_LEVEL_REQUIRED', 'An explicit exhaustion level is required before calculating this check.')
  return entity!
}
function outsideCombat() {
  available()
  if (gs.getState().phase === 'combat') toolkitError('CHECK_MODE_OUTSIDE_COMBAT', 'Use the combat Help/action resolvers in combat.')
}
function cooperative(id: string) {
  const entity = actor(id), s = gs.getState(), mapId = s.currentMapId ?? firstMapId(s)
  if (inferRoomIdOnMap(entity.position, mapId, s) !== s.currentRoomId)
    toolkitError('CHECK_ACTOR_NOT_PRESENT', 'Every participant must be in the current room of the active map.')
  if (id !== 'player') {
    const npc = gs.getNpc(id)
    if ('controller' in entity && entity.controller === 'reactive_npc' || !('hostile' in entity) || entity.hostile !== false
      || !npc || !npc.visible || npc.disposition !== 'helpful' || !gs.npcOnCurrentMap(npc))
      toolkitError('CHECK_COOPERATION_NOT_MODELED', 'Non-player cooperation requires an active nonhostile stat block and an already visible helpful NPC on this map; reactive NPC activations remain separate.')
  }
  return entity
}
/** Only a still-present helper for the immediate same-scene attempt is valid.
 * Existing combat Help effects are left to their original matcher. */
export function matchingCheckHelp(entityId: string, ability: keyof EntityStats, skill?: string,perceptionSense?:PerceptionSense) {
  return effects('help-check', entityId).filter(effect => {
    if (effect.data.checkMode !== true || effect.data.ability !== ability || (effect.data.skill ?? null) !== (skill ?? null)
      || effect.data.grantedAt !== now() || effect.data.mapId !== gs.getState().currentMapId
      || effect.data.roomId !== gs.getState().currentRoomId||effect.data.perceptionSense!==perceptionSense) return false
    try {
      const source = cooperative(effect.sourceId), target = cooperative(entityId)
      return distance(source.position, target.position) <= 1
    } catch { return false }
  })
}
function profile(id: string, input: Selection, sightBased?:boolean,sourceNaturalHearing=false) {
  const spec = selection(input), entity = actor(id,sourceNaturalHearing), s = gs.getState()
  const perception=perceptionCheckContext({...input,sightBased},id,s)
  sightBased=perception.sightBased
  const abilityMod = getAbilityModifier(entity.stats[input.ability])
  const proficient = Boolean(spec && 'skillProficiencies' in entity && entity.skillProficiencies?.includes(spec.id))
  const expertise = Boolean(spec && 'expertise' in entity && entity.expertise?.includes(spec.id))
  const proficiencyBonus = 'proficiencyBonus' in entity ? entity.proficiencyBonus : 2
  const half = id === 'player' && strictHero() && feature('remarkable_athlete') && ['str', 'dex', 'con'].includes(input.ability)
    ? Math.ceil(proficiencyBonus / 2) : 'features' in entity && entity.features?.includes('jack_of_all_trades') ? Math.floor(proficiencyBonus / 2) : 0
  const native = 'type' in entity ? getMonsterRecord(entity.type)?.source.proficiencies as Array<{ proficiency: { index: string }; value: number }> | undefined : undefined
  const nativeBonus = spec ? native?.find(p => p.proficiency.index === `skill-${spec.id}`)?.value : undefined
  const modifier = (nativeBonus ?? abilityMod + (expertise ? proficiencyBonus * 2 : proficient ? proficiencyBonus : half))
    - (sightBased ? afflictionSightPenalty(s, id) : 0)
  const armor = id === 'player' ? gs.getPlayer().inventory.find(item => item.id === currentLoadout().armorId) : undefined
  const disadvantage = Boolean(exhaustionDisadvantage(s, id, 'check') || curseAbilityDisadvantage(s, id, input.ability)
    || armorRollDisadvantage(s, id, input.ability) || spec?.id === 'stealth' && armor && ARMOR_RULES[equipmentId(armor)]?.stealth
    ||perception.weatherDisadvantage|| strictHero() && (entity.conditions.includes('poisoned') || frightenedByVisibleSource(id)))
  const advantage = matchingCheckHelp(id, input.ability, spec?.id,perception.perceptionSense).length > 0
  return { modifier, proficient, expertise, advantage, disadvantage,...perception, automaticFailure:perception.automaticFailure||Boolean(sightBased&&entity.conditions.includes('blinded')) }
}
export function naturalSleepPassiveHearing(id:string){
 if(!naturalSleepEpisode(gs.getState(),id))toolkitError('NATURAL_SLEEP_EPISODE_REQUIRED','The source-specific hearing exception requires its actual natural sleeper.')
 const p=profile(id,{ability:'wis',skill:'perception',perceptionSense:'hearing'},false,true),adjustment=p.advantage===p.disadvantage?0:p.advantage?5:-5
 return{...p,adjustment,score:p.automaticFailure?null:10+p.modifier+adjustment}
}
export function resolvePassiveCheck(input: Selection & { entityId: string; dc?: number; sightBased?: boolean; targetCell?: { x: number; y: number }; advantage?: boolean; disadvantage?: boolean; advantageReason?: string },internal:{allowCombat?:boolean}={}) {
  if(internal.allowCombat)available();else outsideCombat()
  const p = profile(input.entityId, input, input.sightBased)
  if (Boolean(p.sightBased) !== Boolean(input.targetCell)) toolkitError('CHECK_VISUAL_CELL_REQUIRED', 'A sight-based passive check requires its exact target cell; a nonvisual check has no visual target cell.')
  if (input.targetCell) validateMapCell(input.targetCell)
  const visual = input.targetCell ? visualPerceptionAt(gs.getState(), actor(input.entityId), input.targetCell) : undefined
  if ((input.advantage || input.disadvantage) && !input.advantageReason?.trim()) toolkitError('ADVANTAGE_REASON_REQUIRED', 'Explain the explicit situational advantage/disadvantage.')
  const advantage = Boolean(input.advantage || p.advantage), disadvantage = Boolean(input.disadvantage || p.disadvantage || input.skill === 'perception' && visual?.visualDisadvantage)
  const adjustment = advantage === disadvantage ? 0 : advantage ? 5 : -5
  const automaticFailure = p.automaticFailure || Boolean(visual && !visual.canSee)
  const score = automaticFailure ? null : 10 + p.modifier + adjustment
  return { entityId: input.entityId, ability: input.ability, skill: input.skill, ...p, automaticFailure, ...(visual ? { visual } : {}), advantage, disadvantage, adjustment, score,
    ...(input.dc === undefined ? {} : { dc: input.dc, success: score !== null && score >= input.dc }),
    mechanicalSummary: score === null ? 'Test passif impossible avec le sens explicitement choisi dans les conditions présentes.' : `Test passif : 10 + ${p.modifier} + (${adjustment}) = ${score}. Aucun dé ni ressource dépensé.` }
}
export function provideCheckHelp(input: CheckHelpInput) {
  const old = current()?.help[input.eventId]
  if (old) {
    if (JSON.stringify(old.input) !== JSON.stringify(input)) toolkitError('CHECK_EVENT_CONFLICT', 'This immutable help event has different arguments.')
    return { success: true, replayed: true, receipt: old, active: matchingCheckHelp(input.beneficiaryId, input.ability, input.skill,input.perceptionSense).some(e => e.id === old.effectId) }
  }
  outsideCombat(); selection(input)
  if (input.helperId === input.beneficiaryId) toolkitError('CHECK_HELP_SELF', 'A creature cannot help itself.')
  const helper = cooperative(input.helperId), beneficiary = cooperative(input.beneficiaryId)
  if(profile(input.helperId,input).automaticFailure)toolkitError('CHECK_HELP_SENSE_UNAVAILABLE','The helper cannot attempt this explicitly sensory task alone in its actual conditions; no advantage, receipt or die is created.')
  if (distance(helper.position, beneficiary.position) > 1) toolkitError('CHECK_HELP_OUT_OF_REACH', 'Approach the beneficiary for this shared immediate task.')
  if (input.requiredToolId) {
    if (!(TOOL_IDS as readonly string[]).includes(input.requiredToolId)) toolkitError('CHECK_TOOL_UNKNOWN', 'Select a published tool ID.')
    if (input.helperId !== 'player') toolkitError('CHECK_HELP_TOOL_PROFICIENCY_UNMODELED', 'NPC tool ownership/proficiency is not modeled; do not invent it.')
    if (!gs.getPlayer().toolProficiencies?.includes(input.requiredToolId)
      || !gs.getPlayer().inventory.some(item => equipmentId(item) === input.requiredToolId))
      toolkitError('CHECK_HELP_TOOL_REQUIRED', 'The helper must actually own and be proficient with the required tools.')
  }
  if (Object.keys(current()?.help ?? {}).length >= 256) toolkitError('CHECK_HISTORY_LIMIT', 'Keep existing receipts; the help history limit is reached.')
  const effect = addHeroEffect('help-check', input.helperId, [input.beneficiaryId], 1e12,
    { checkMode: true, ability: input.ability, skill: input.skill, grantedAt: now(), mapId: gs.getState().currentMapId,
      roomId: gs.getState().currentRoomId, eventId: input.eventId, reason: input.reason,perceptionSense:input.perceptionSense })
  const receipt = { input, effectId: effect.id }; state().help[input.eventId] = receipt
  return { success: true, receipt, mechanicalSummary: 'Entraide accordée au prochain test correspondant de cette tentative immédiate, dans cette scène ; aucun jet ni action de combat dépensé.' }
}
function groupOutput(eventId: string, replayed = false) {
  const receipt = current()!.groups[eventId], successes = receipt.results.filter(result => result.success).length
  return toolkitResult({ eventId, replayed, complete: receipt.complete, receipt, successes,
    requiredSuccesses: Math.ceil(receipt.input.participants.length / 2),
    ...(receipt.complete ? { success: successes >= Math.ceil(receipt.input.participants.length / 2) } : { pendingReaction: hero().pending }),
    mechanicalSummary: receipt.complete ? `Test de groupe : ${successes}/${receipt.input.participants.length} réussites ; au moins la moitié requise.` : 'Test de groupe suspendu sur le jet déjà lancé ; résoudre la réaction avant la suite.' })
}
function nextGroup(eventId: string): ReturnType<typeof toolkitResult> {
  const receipt = current()!.groups[eventId], index = receipt.results.length
  if (index === receipt.input.participants.length) { receipt.complete = true; return groupOutput(eventId) }
  const { participants, ability, skill, dc,perceptionSense } = receipt.input
  return checkedResolution({ entityId: participants[index], ability, skill, dc,perceptionSense }, { domain: 'group-check', command: { eventId, index } })
}
export function registerGroupCheckContinuation() {
  registerCheckedResolution('group-check', (command, checked) => {
    const eventId = String(command.eventId), receipt = current()?.groups[eventId], index = Number(command.index)
    if (!receipt || receipt.complete || receipt.results.length !== index || checked.entityId !== receipt.input.participants[index] || !('proficient' in checked))
      toolkitError('CHECK_CONTINUATION_INVALID', 'The held group result must match the next unresolved participant exactly.')
    const result = checked as AbilityCheckResult
    receipt!.results.push({ entityId: result.entityId, ability: result.ability, roll: result.roll, success: result.roll.notation!=='automatic-failure'&&result.roll.total >= receipt!.input.dc,
      ...(result.perceptionSense?{perceptionSense:result.perceptionSense,weatherDisadvantage:result.weatherDisadvantage,automaticFailure:result.automaticFailure}:{}),
      ...(result.automaticFailure?{automaticFailure:true}:{}) })
    return nextGroup(eventId)
  })
}
export function resolveGroupCheck(input: GroupCheckInput) {
  const old = current()?.groups[input.eventId]
  if (old) {
    if (JSON.stringify(old.input) !== JSON.stringify(input)) toolkitError('CHECK_EVENT_CONFLICT', 'This immutable group event has different arguments.')
    return groupOutput(input.eventId, true)
  }
  outsideCombat(); selection(input)
  if (new Set(input.participants).size !== input.participants.length) toolkitError('CHECK_GROUP_DUPLICATE', 'Every participant must occur exactly once.')
  if (!input.participants.includes('player')) toolkitError('CHECK_GROUP_PLAYER_REQUIRED', 'This session has one player; the group must include that actual player.')
  // Validate the entire group, including exhaustion/native statistics, before
  // the first RNG draw, inspiration consumption, help removal or receipt.
  for (const id of input.participants) { cooperative(id); profile(id, input) }
  if (Object.keys(current()?.groups ?? {}).length >= 128) toolkitError('CHECK_HISTORY_LIMIT', 'Keep existing receipts; the group history limit is reached.')
  state().groups[input.eventId] = { input, results: [], complete: false }
  return nextGroup(input.eventId)
}
