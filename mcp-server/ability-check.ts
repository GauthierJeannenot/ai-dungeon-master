import { gamblingCheckInput, openGamblingWeek } from '../lib/xge-gambling-state'
import { openPitWeek, PIT_CHECKS } from '../lib/xge-pit-fighting-state'
import { openServiceWeek, SERVICE_CHECKS } from '../lib/xge-religious-service-state'
import { openCarousingWeek, CAROUSING_CHECK } from '../lib/xge-carousing-state'
import { activeChase } from '../lib/chase-state'
import type { AbilityCheckResult, EntityStats, PlayerState, RoleplayBonus } from '../lib/types'
import { getSkill } from '../lib/srd/skills'
import { getAbilityModifier } from './dice'
import { rollRuleD20, ruleRollAdvantage, ruleRollDisadvantage } from './roll-rules'
import * as gs from './game-state'
import * as rules from './rules'
import { feature, strictHero, effects, removeHeroEffect } from './hero-rules'
import { currentLoadout, equipmentId } from './equipment'
import { ARMOR_RULES } from '../lib/srd/equipment'
import { getMonsterRecord } from '../lib/srd/monsters'
import { frightenedByVisibleSource } from './monster-perception'
import { validateRoleplayBonus, roleplayBonusDetail } from './roleplay-bonus'
import { socialCheckContext } from './social'
import { curseAbilityDisadvantage } from '../lib/curse-effects'
import { afflictionSightPenalty } from '../lib/affliction-state'
import { matchingCheckHelp } from './check-modes'
import { perceptionCheckContext } from './perception-checks'
import type { PerceptionSense } from '../lib/weather-state'

export interface AbilityCheckInput extends RoleplayBonus {
  sourceSkillAbility?: 'xge-knot-intelligence' // Engine-only optional XGE source, never a public general ability override.
  socialProcedure?:{helpSourceIds:string[]} // Engine-only actual positive conversation contributors, never inferred from prose.
  perceptionSense?:PerceptionSense
  sourceModifier?: { kind: 'wilderness_navigation_pace'; value: -5 | 0 | 5 } // Engine-only published navigation pace; never a public generic check argument.
  sightBased?:boolean // Engine-only: explicitly visual resolver, never inferred from prose.
  toolId?: string // Engine-only: an owned tool validated by resolve_tool_check.
  targetId?: string
  sourceChaseTask?:boolean
  sourceGamblingCheck?: boolean // Only the currently qualified source workweek check.
  sourcePitConBonus?: { weekId: string; value: number } // Engine-only exact largest-HD source roll, no Hit Die spent.
  sourceCarousingCheck?: boolean // Engine-only original actual Carousing Persuasion total.
  sourceReligiousServiceCheck?: boolean // Engine-only exact current temple service check, not social influence.
  internalHold?:boolean
  passiveContest?: boolean // Engine-only: a contest/opposed check has no separate turn/action cost.
  entityId?: string
  ability: keyof EntityStats
  dc?: number
  skill?: string
  proficient?: boolean
  expertise?: boolean
  label?: string
  advantage?: boolean
  disadvantage?: boolean
  advantageReason?: string
}

// Shared by standalone checks and atomic stealth movement: one source of dice,
// character proficiency, validation and logging.
export function resolveAbilityCheck({ entityId, ability, dc, skill, toolId, proficient, expertise, label, targetId,
  advantage, disadvantage, advantageReason, roleplayBonus, roleplayReason, internalHold, passiveContest, sightBased, sourceModifier,perceptionSense,socialProcedure,sourceSkillAbility,sourceChaseTask,sourceGamblingCheck,sourcePitConBonus,sourceReligiousServiceCheck,sourceCarousingCheck }: AbilityCheckInput): AbilityCheckResult {
  const resolvedEntityId = entityId ?? 'player'
  if(sourceChaseTask&&!Object.values(activeChase(gs.getState())?.turns??{}).some(t=>t.status==='consequence'&&[7,8].includes(t.d20??0)&&t.nextParticipantId===resolvedEntityId&&t.qualification?.choice==='intimidation'&&ability==='cha'&&skill==='intimidation'))throw new rules.RuleViolation('CHASE_CHECK_SOURCE_REQUIRED','The internal non-social Intimidation exception belongs only to the actually qualified printed chase brawl/beggar check.',{})
  if(sourceSkillAbility&&(sourceSkillAbility!=='xge-knot-intelligence'||resolvedEntityId!=='player'||ability!=='int'||skill!=='sleight-of-hand'||!gs.getState().dmTools?.knots?.policy?.input.enabled))throw new rules.RuleViolation('CHECK_SOURCE_ABILITY_INVALID','The internal INT(Sleight) exception applies only to the explicitly adopted XGE player knot resolver, never a native DEX total or public general variant.',{})
  if (!passiveContest) rules.validateAbilityCheck(resolvedEntityId)
  else {
    const actor = gs.getEntity(resolvedEntityId)
    if (!actor || actor.hp.current <= 0) throw new rules.RuleViolation('ENTITY_DEAD', 'The contested check requires a living actor.', {})
  }
  const entity = gs.getEntity(resolvedEntityId)!
  if (sourcePitConBonus) {
    const week = openPitWeek(gs.getState()), resolution = week?.resolution
    if (!resolution || week!.start.input.eventId !== sourcePitConBonus.weekId || resolution.checks.length !== 2
      || resolvedEntityId !== 'player' || ability !== 'con' || skill !== undefined || toolId !== undefined
      || label !== PIT_CHECKS[2].label || dc !== resolution.dcs[2].total || sourcePitConBonus.value !== resolution.conBonus.total)
      throw new rules.RuleViolation('XGE_PIT_CON_BONUS_SOURCE_REQUIRED', 'Only the exact current pit Constitution check receives its one original largest-Hit-Die roll.')
  }
  if (sourceCarousingCheck) {
    const resolution = openCarousingWeek(gs.getState())?.resolution
    if (!resolution || resolution.check || resolvedEntityId !== 'player' || dc !== undefined || toolId !== undefined || targetId !== undefined
      || ability !== 'cha' || skill !== 'persuasion' || label !== CAROUSING_CHECK.label)
      throw new rules.RuleViolation('XGE_CAROUSING_CHECK_SOURCE_REQUIRED', 'Only the exact original actual Carousing check may use this source total without social influence.')
  }
  if (sourceReligiousServiceCheck) {
    const resolution = openServiceWeek(gs.getState())?.resolution, expected = resolution && SERVICE_CHECKS[resolution.input.skill]
    if (!resolution || !expected || resolution.check || resolvedEntityId !== 'player' || dc !== undefined || toolId !== undefined || targetId !== undefined
      || ability !== expected.ability || skill !== expected.skill || label !== expected.label)
      throw new rules.RuleViolation('XGE_SERVICE_CHECK_SOURCE_REQUIRED', 'Only the exact original temple-service check may use this source total without social influence.')
  }
  if (sourceGamblingCheck) {
    const resolution = openGamblingWeek(gs.getState())?.resolution
    const expected = resolution && gamblingCheckInput(resolution.input, resolution.checks.length)
    if (!resolution || !expected || resolvedEntityId !== 'player' || ability !== expected.ability || skill !== expected.skill || toolId !== expected.toolId
      || dc !== resolution.dcs[resolution.checks.length].total || label !== expected.label)
      throw new rules.RuleViolation('XGE_GAMBLING_CHECK_SOURCE_REQUIRED', 'Only the original current gambling check can use its source procedure.', {})
  }
  const perception=perceptionCheckContext({skill,perceptionSense,sightBased},resolvedEntityId)
  sightBased=perception.sightBased
  let social: AbilityCheckResult['social']
  if (!sourceChaseTask && !sourceGamblingCheck && !sourceReligiousServiceCheck && !sourceCarousingCheck && resolvedEntityId === 'player' && ['persuasion', 'intimidation', 'deception'].includes(skill ?? '') && !targetId)
    throw new rules.RuleViolation('SOCIAL_TARGET_REQUIRED', 'Choose the exact creature targetId for a social influence check.', {})
  if (targetId !== undefined) {
    const socialSkill=['persuasion','intimidation','deception'].includes(skill??'')
    if ((!socialProcedure&&resolvedEntityId!=='player')||(!socialSkill&&!(socialProcedure&&skill===undefined))||!Number.isInteger(dc)||socialProcedure&&ability!=='cha')
      throw new rules.RuleViolation('SOCIAL_CHECK_ARGUMENTS', 'A targeted social check requires the player, a canonical social skill and an integer base dc.', {})
    social = socialCheckContext(targetId, dc!)
  }
  const rp = { roleplayBonus, roleplayReason: roleplayReason?.trim() }
  const rpBonus = validateRoleplayBonus(rp)
  if (sourceModifier && (sourceModifier.kind !== 'wilderness_navigation_pace' || ![-5, 0, 5].includes(sourceModifier.value)
    || resolvedEntityId !== 'player' || ability !== 'wis' || skill !== 'survival'))
    throw new rules.RuleViolation('CHECK_SOURCE_MODIFIER_INVALID', 'The internal wilderness-navigation modifier applies only to the actual player Wisdom(Survival) check and must be -5,0,+5.', {})
  const reason = advantageReason?.trim()
  if ((advantage || disadvantage) && !reason) {
    throw new rules.RuleViolation('ADVANTAGE_REASON_REQUIRED', 'advantage/disadvantage requires advantageReason.', {})
  }
  // Maîtrise décidée par le MOTEUR si un skill canonique est fourni pour le
  // joueur : on dérive de la fiche et on ignore les flags déclarés (anti-triche).
  // Sinon comportement historique (flags proficient/expertise).
  let effAbility = ability as keyof EntityStats
  let isProficient = Boolean(proficient)
  let isExpertise = Boolean(expertise)
  let resolvedLabel = label
  const skillSpec = skill ? getSkill(skill) : undefined
  if (skillSpec && 'skillProficiencies' in entity) {
    const player = entity as PlayerState
    effAbility = sourceSkillAbility==='xge-knot-intelligence'?'int':skillSpec.ability
    isProficient = Boolean(player.skillProficiencies?.includes(skillSpec.id))
    isExpertise = Boolean(player.expertise?.includes(skillSpec.id))
    resolvedLabel = resolvedLabel ?? skillSpec.label
  }
  if (toolId && 'toolProficiencies' in entity) {
    // Never add tool and skill proficiency twice. Tool checks keep the ability
    // explicitly chosen by the MJ, and skill expertise only if actually held.
    effAbility = ability
    isProficient = isProficient || Boolean((entity as PlayerState).toolProficiencies?.includes(toolId))
  }

  const abilityMod = getAbilityModifier(entity.stats[effAbility])
  const proficiencyBonus = 'proficiencyBonus' in entity ? entity.proficiencyBonus : 2
  const halfProficiency = resolvedEntityId === 'player' && strictHero() && feature('remarkable_athlete') && ['str','dex','con'].includes(effAbility)
    ? Math.ceil(proficiencyBonus/2)
    : 'features' in entity && entity.features?.includes('jack_of_all_trades') ? Math.floor(proficiencyBonus / 2) : 0
  const proficiencyMod = isExpertise ? proficiencyBonus * 2 : isProficient ? proficiencyBonus : halfProficiency
  const sourceSkills = 'type' in entity ? getMonsterRecord(entity.type)?.source.proficiencies as Array<{ value: number; proficiency: { index: string } }> | undefined : undefined
  const nativeBonus = skillSpec ? sourceSkills?.find(entry => entry.proficiency.index === `skill-${skillSpec.id}`)?.value : undefined
  const totalMod = (nativeBonus ?? abilityMod + proficiencyMod) + rpBonus + (sourceModifier?.value ?? 0) + (sourcePitConBonus?.value ?? 0) - (sightBased?afflictionSightPenalty(gs.getState(),resolvedEntityId):0)
  const armor = resolvedEntityId === 'player' ? gs.getPlayer().inventory.find(item => item.id === currentLoadout().armorId) : undefined
  const armorDisadvantage=resolvedEntityId==='player'&&strictHero()&&skillSpec?.id==='stealth'&&Boolean(armor && ARMOR_RULES[equipmentId(armor)]?.stealth)
  const effectiveDisadvantage=ruleRollDisadvantage(resolvedEntityId,'check',Boolean(disadvantage||perception.weatherDisadvantage||armorDisadvantage||curseAbilityDisadvantage(gs.getState(),resolvedEntityId,effAbility)||strictHero()&&(entity.conditions.includes('poisoned')||frightenedByVisibleSource(resolvedEntityId))),effAbility)
  const helpers = effects('help-check', resolvedEntityId)
    .filter(effect => effect.data.checkMode !== true && (!sourceSkillAbility||effect.data.ability===undefined||effect.data.ability===effAbility) && effect.data.skill === skillSpec?.id&&effect.data.perceptionSense===perception.perceptionSense)
    .concat(matchingCheckHelp(resolvedEntityId, effAbility, skillSpec?.id,perception.perceptionSense))
    .filter(effect=>!socialProcedure||socialProcedure.helpSourceIds.includes(effect.sourceId))
  const effectiveAdvantage = ruleRollAdvantage(resolvedEntityId,'check',Boolean(advantage || helpers.length))
  const roll = perception.automaticFailure?{notation:'automatic-failure',rolls:[],modifier:0,total:0,detail:'Échec automatique : le sens explicitement sélectionné ne peut percevoir dans ces conditions réelles.'}
    :rollRuleD20(resolvedEntityId,'check',totalMod, effectiveAdvantage, effectiveDisadvantage, effAbility)
  if(!perception.automaticFailure)for (const helper of helpers) removeHeroEffect(helper.id)
  if (helpers.length&&!perception.automaticFailure) roll.detail += ' | Aide confirmée, avantage consommé sur ce jet'
  roll.detail += roleplayBonusDetail(rp)
  if (sourceModifier) roll.detail += ` | DMG2014 allure de navigation ${sourceModifier.value >= 0 ? '+' : ''}${sourceModifier.value}`
  if (sourcePitConBonus) roll.detail += ` | XGE Pit Fighting bonus du plus grand dé de vie +${sourcePitConBonus.value}, aucun dé de vie dépensé`
  if(perception.weatherDisadvantage)roll.detail+=` | Météo réelle : désavantage Perception (${perception.perceptionSense}), sans empilement.`
  const success = perception.automaticFailure?false:typeof dc === 'number' ? roll.total >= dc : undefined
  const checkLabel = resolvedLabel?.trim() || `Test ${effAbility.toUpperCase()}`
  const advantageNote = reason && Boolean(advantage) !== Boolean(disadvantage)
    ? ` | ${advantage ? 'AVANTAGE' : 'DESAVANTAGE'}: ${reason}`
    : ''
  const socialNote = social ? ` | Interaction D&D2014 : DD ${social.baseDc}.` : ''
  const mechanicalSummary = `${checkLabel}: ${roll.detail}${typeof dc === 'number' ? ` vs DD ${dc} -> ${success ? 'SUCCES' : 'ECHEC'}` : ''}${advantageNote}${socialNote}`

  const result: AbilityCheckResult = {
    ...(social ? { social } : {}),
    ...(perception.perceptionSense?{perceptionSense:perception.perceptionSense,weatherDisadvantage:perception.weatherDisadvantage,automaticFailure:perception.automaticFailure}:{}),
    ...(perception.automaticFailure?{automaticFailure:true}:{}),
    entityId: resolvedEntityId,
    ability: effAbility,
    label: checkLabel,
    dc,
    proficient: isProficient,
    expertise: isExpertise,
    advantage: effectiveAdvantage,
    disadvantage: effectiveDisadvantage,
    advantageReason: reason || undefined,
    ...rp,
    roll,
    success,
    mechanicalSummary,
  }

  if(internalHold)return {...result,success:undefined,mechanicalSummary:`${checkLabel}: ${roll.detail} ; résultat en attente d’un choix de dé.`}
  gs.addLogEntry({
    round: gs.getState().round,
    turn: gs.getState().currentTurn ?? resolvedEntityId,
    action: `${entity.name} - ${checkLabel}`,
    mechanicalDetail: mechanicalSummary,
  })
  if (gs.getState().phase === 'combat' && gs.getState().currentTurn === resolvedEntityId) {
    rules.recordAction(resolvedEntityId)
  }


  return result
}
