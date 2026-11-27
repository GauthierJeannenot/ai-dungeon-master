import { complexTrapTurnDue, inspectComplexTrapTurn } from '../../lib/complex-trap-initiative'
import { cackleBatchIssue } from '../../lib/cackle-fever-state'
import { LightObjectSelectionSchema } from '../../lib/light-spell-state'
import { AlarmWardSelectionSchema, type AlarmWardSelection } from '../../lib/alarm-state'
import { sewerPlagueEvent } from '../sewer-plague'
import { dueFrigidWaterSave } from '../../lib/frigid-water-state'
import { assertFrigidWaterTimeAdvance } from '../frigid-water'
import { chaseParticipant,chaseTurnIssue,activeChase } from '../../lib/chase-state'
import { SpellObserversSchema } from '../../lib/spell-perception-state'
import { activeXgeFall,dueXgeFallDescent,xgeFallingTransitionIssue } from '../../lib/xge-falling-state'
import { captureSwallowBite,resolveSwallowBite,registerSwallowResolutions } from '../swallow'
import type { SwallowBiteContext } from '../../lib/swallow-state'
import type { NativePoisonContext } from '../../lib/native-poison-state'
import { nativePoisonAttackContext,resolveNativePoisonHit,preflightNativePoisonSequence,registerNativePoisonResolution } from '../native-poison'
import { actualNativeFlightLocation } from '../../lib/native-flight-state'
import { captureSpatialWeaponContext } from '../spatial-weapon'
import { withSpatialWeaponResolution,spatialWeaponResolution } from '../../lib/spatial-weapon-resolution'
import { fireDamageContextIssue } from '../fire-damage-preflight'
import { nativeUnderwaterWeaponId,type UnderwaterWeaponContext } from '../../lib/underwater-rules'
import { captureUnderwaterWeaponContext,automaticUnderwaterMiss } from '../underwater'
import { harvestCreatureActionIssue } from '../../lib/srd/harvest-creatures'
import { SpellAreaSelectionSchema } from '../../lib/spell-area-state'
import { TeleportCompanionFields } from '../../lib/spell-physical-state'
import { isSurvivalDayDue } from '../survival'
import { assertBreathingRecoveryAllowed } from '../breathing'
import { engineGeometry, executeNavigation } from '../navigation'
import { navigationGrid } from '../../lib/navigation'
import { completedRoundEvents } from '../../lib/combat-round-events'
import { strictHero, hero, effects, bonusOnRoll } from '../hero-rules'
import { heroAttack, continueAttackSequence, continuePlayerAttackSequence } from '../hero-combat'
import { weaponForReference, selectedWeaponItem, weaponItemHeld, weaponAttackRangeCells, resolvePlayerWeaponUse,afterInventoryChange,assertCanDrop } from '../equipment'
import { cast5eSpell } from '../hero-spells'
import { bindGroundGearContinuation } from '../ground-gear-contacts'
import { useHeroFeature } from './hero-tools'
import { turnedMovement } from '../hero-movement'
import { heroAbilityCheck, heroSavingThrow } from '../hero-checks'
import { inferRoomIdOnMap } from '../../lib/adventure-map'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { magicSaveBonus } from '../magic-items'
import { CurseSelectionSchema, type CurseSelection } from '../../lib/curse-effects'
import { rollDice, getAbilityModifier } from '../dice'
import { rollRuleD20, ruleRollAdvantage, ruleRollDisadvantage } from '../roll-rules'
import { inspectExhaustion } from '../exhaustion'
import { assertDirectCoverTarget } from '../cover'
import { WeaponAttackModeSchema, type WeaponAttackMode } from '../../lib/two-weapon-state'
import { randomUUID } from 'node:crypto'
import { knockoutFromAttack, validateNonlethalAttack, assertKnockoutTimeAdvance } from '../nonlethal'
import { isActiveMonster } from '../../lib/nonlethal-state'
import { resolveNpcDeathSave } from './npc-life-tools'
import { replayedPlayerDeathSave,preparePlayerDeathSave,completePlayerDeathSave } from '../player-life'
import { dueNpcDeathSaveEvents, npcDeathSaveEvent } from '../npc-life'
import { toolkitTransaction,toolkitResult } from '../toolkit'
import { isSurprised } from '../../lib/surprise-state'
import * as gs from '../game-state'
import * as rules from '../rules'
import { EntityStats, AttackResult, SavingThrowResult, Condition, PlayerState, MonsterState, RoleplayBonus } from '../../lib/types'
import { findWeapon, resolveWeapon, attackAbilityFor } from '../../lib/srd/weapons'
import { weaponProficiencyBonus } from '../../lib/weapon-proficiency'
import { preflightWeaponAmmunition, preflightAmmunitionSequence, commitWeaponAmmunition, type AmmunitionAttackPlan } from '../ammunition'
import { improvisedAttackContext,captureThrownFlame,commitPhysicalThrow } from '../weapon-transfer'
import { basicPoisonAttackContext,resolveBasicPoisonHit } from '../basic-poison-hits'
import { preflightPlayerPoisonSequence } from '../player-poison-injury'
import type { PlayerPoisonAttackContext } from '../../lib/player-poison-state'
import { oilFireCapacityIssue,activeOilCoating } from '../../lib/oil-state'
import { playerHeavyWeaponContext, playerLanceWeaponContext,playerFinesseWeaponContext,rollWeaponDamage,type HeavyWeaponContext,type LanceWeaponContext } from '../weapon-properties'
import { preflightNetAttack } from '../nets'
import { weatherHeightCombatIssue,weatherHeightPointIssue } from '../../lib/weather-state'
import { physicalHeightCombatIssue } from '../../lib/jumping-state'
import { resolveSpell, spellAtLevel, type SpellSpec } from '../../lib/srd/spells'
import { resolveAbilityCheck } from '../ability-check'
import { WaterEffectSchema, validateWaterEffect, recordWaterEffect } from '../water-effect'
import type { WaterEffect } from '../../lib/types'
import { attackProfile, sourceAction, monsterSource, hasTrait, allyAdjacentTo, dealDamage,
  savingThrow, applyAttackRiders, endInvisibility, startMonsterTurn, multiattackPlans, reactToHarm } from '../monster-rules'
import { frightenedByVisibleSource } from '../monster-perception'
import { roleplayBonusFields, validateRoleplayBonus, roleplayBonusDetail } from '../roleplay-bonus'
import { rangedWeaponContext, type RangedWeaponContext } from '../ranged-weapon-rules'

// Dé de l'arme explicitement choisie (source de vérité : registre SRD).
function getWeaponDamage(weaponOrSpell: string): string {
  return resolveWeapon(weaponOrSpell).damageDie
}

// Notation de dégâts avec modificateur d'aptitude correctement formaté :
// « 1d8+3 », « 1d6-1 » ou « 1d4 » (mod nul). Évite le « 1d6+-1 » invalide
// (possible depuis que l'aptitude d'attaque peut être négative — magicien).
function withDamageMod(die: string, mod: number): string {
  if (mod === 0) return die
  return mod > 0 ? `${die}+${mod}` : `${die}${mod}`
}

function doubleDiceNotation(notation: string): string {
  return notation.replace(/^(\d*)d(\d+)/i, (_match, count, sides) => {
    const diceCount = count === '' ? 1 : Number(count)
    return `${diceCount * 2}d${sides}`
  })
}

export type TargetHint = 'nearest' | 'right' | 'left' | 'front' | 'back' | 'wounded'

function normalizeTargetText(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[’‘`´]/g, "'")
}

function distanceCells(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y))
}

function monsterMatchesTargetName(monster: { name: string; type: string }, targetName: string): boolean {
  const query = normalizeTargetText(targetName).trim()
  if (!query) return false

  const normalizedName = normalizeTargetText(monster.name)
  const normalizedType = normalizeTargetText(monster.type)
  const translatedType = normalizedType
    .replace(/hobgoblin/g, 'hobgobelin')
    .replace(/goblin/g, 'gobelin')
    .replace(/violet_fungus/g, 'champignon violet')
    .replace(/_/g, ' ')

  return normalizedName === query || normalizedType === query || translatedType === query
}

export function selectPlayerTarget(
  targetId: string | undefined,
  targetName: string | undefined,
  targetHint: TargetHint | undefined
): string {
  if (targetId) return targetId
  if (!targetName && !targetHint) {
    throw new rules.RuleViolation('TARGET_REQUIRED', 'The agent must explicitly select targetId, exact targetName or targetHint.', {})
  }

  const state = gs.getState()
  const player = state.player
  if (targetName) {
    const namedCandidates = Object.values(state.monsters).filter(monster => monsterMatchesTargetName(monster, targetName))
    const livingNamedCandidates = namedCandidates.filter(monster => monster.isAlive)

    if (livingNamedCandidates.length === 1) return livingNamedCandidates[0].id
    if (namedCandidates.length === 1) return namedCandidates[0].id
    if (livingNamedCandidates.length > 1 || namedCandidates.length > 1) {
      throw new rules.RuleViolation('TARGET_AMBIGUOUS', 'More than one monster matches the player attack target name.', {
        targetName,
        candidateIds: (livingNamedCandidates.length > 1 ? livingNamedCandidates : namedCandidates).map(monster => monster.id),
      })
    }

    throw new rules.RuleViolation('TARGET_NOT_FOUND', 'No monster matches the player attack target name.', {
      targetName,
      livingMonsterIds: Object.values(state.monsters).filter(monster => monster.isAlive).map(monster => monster.id),
    })
  }

  let candidates = Object.values(state.monsters).filter(monster => monster.isAlive)

  if (targetHint === 'right') candidates = candidates.filter(monster => monster.position.x > player.position.x)
  if (targetHint === 'left') candidates = candidates.filter(monster => monster.position.x < player.position.x)
  if (targetHint === 'front') candidates = candidates.filter(monster => monster.position.y < player.position.y)
  if (targetHint === 'back') candidates = candidates.filter(monster => monster.position.y > player.position.y)
  if (targetHint === 'wounded') candidates = candidates.filter(monster => monster.hp.current < monster.hp.max)

  if (candidates.length === 0) {
    throw new rules.RuleViolation('TARGET_NOT_FOUND', 'No living monster matches the player attack target hint.', {
      targetHint,
      playerPosition: player.position,
    })
  }

  candidates.sort((a, b) => {
    const distanceDelta = distanceCells(a.position, player.position) - distanceCells(b.position, player.position)
    if (distanceDelta !== 0) return distanceDelta
    return a.id.localeCompare(b.id)
  })

  const nearestDistance = distanceCells(candidates[0].position, player.position)
  const tied = candidates.filter(candidate => distanceCells(candidate.position, player.position) === nearestDistance)
  if (tied.length > 1) throw new rules.RuleViolation('TARGET_AMBIGUOUS', 'The selected hint matches multiple equally close targets; choose an exact ID.', { targetHint, candidateIds: tied.map(candidate => candidate.id) })
  return candidates[0].id
}

export function resolveAttack(...args:Parameters<typeof resolveAttackCore>):ReturnType<typeof resolveAttackCore>{
 try{const context=captureSpatialWeaponContext(args[0],args[1],args[2],args[8]?.attackMode);return withSpatialWeaponResolution(gs.getState(),context,()=>resolveAttackCore(...args))}catch(error){return rules.ruleErrorResult(error)}
}
function resolveAttackCore(
  attackerId: string,
  targetId: string,
  weaponOrSpell: string,
  advantage?: boolean,
  disadvantage?: boolean,
  customDamageDice?: string,
  rangeCells?: number,
  advantageReason?: string,
  options?: RoleplayBonus & { cleaving?:boolean;spentNativePowerContactId?:string; deferAction?: boolean; damageOption?: number; reaction?: boolean; attackMode?:WeaponAttackMode; nonlethal?:boolean; weaponHands?:1|2;weaponAbility?:'str'|'dex'; ammunitionItemId?:string; newAttackAction?:boolean; attackActionId?:string; attackEventId?:string }
) {
  const rp = { roleplayBonus: options?.roleplayBonus, roleplayReason: options?.roleplayReason?.trim() }
  let rpBonus: number
  try { rpBonus = validateRoleplayBonus(rp) } catch (err) { return rules.ruleErrorResult(err) }
  if (strictHero()) {
    try {
      if (customDamageDice !== undefined || rangeCells !== undefined) throw new rules.RuleViolation('SRD_OVERRIDE_FORBIDDEN', 'Damage and reach come from the selected rules profile.', {})
      return heroAttack({ attackerId, targetId, weaponOrSpell, advantage, disadvantage,cleaving:options?.cleaving, ...rp, deferAction: options?.deferAction,spentNativePowerContactId:options?.spentNativePowerContactId, damageOption: options?.damageOption, reaction: options?.reaction,attackMode:options?.attackMode,nonlethal:options?.nonlethal,weaponHands:options?.weaponHands,weaponAbility:options?.weaponAbility,ammunitionItemId:options?.ammunitionItemId,newAttackAction:options?.newAttackAction,attackActionId:options?.attackActionId,attackEventId:options?.attackEventId })
    } catch (err) { return rules.ruleErrorResult(err) }
  }
  if(options?.cleaving)return rules.ruleErrorResult(new rules.RuleViolation('SRD_PROFILE_REQUIRED','Explicit cleaving requires a real SRD player melee source; no legacy damage profile is invented.',{}))
  if(options?.weaponHands!==undefined)return rules.ruleErrorResult(new rules.RuleViolation('SRD_PROFILE_REQUIRED','An explicit attack grip requires the SRD equipment profile.',{}))
  if(options?.weaponAbility!==undefined)return rules.ruleErrorResult(new rules.RuleViolation('SRD_PROFILE_REQUIRED','An explicit finesse ability requires the current SRD profile; no legacy ability choice is invented.',{}))
  if(options?.attackMode)return rules.ruleErrorResult(new rules.RuleViolation('SRD_PROFILE_REQUIRED','Explicit melee/thrown modes require the SRD2014 equipment profile.',{}))
  if(options?.newAttackAction!==undefined)return rules.ruleErrorResult(new rules.RuleViolation('SRD_PROFILE_REQUIRED','An explicit additional Attack action requires the SRD equipment/action profile.',{}))
  if(options?.ammunitionItemId!==undefined&&attackerId!=='player')return rules.ruleErrorResult(new rules.RuleViolation('AMMUNITION_PLAYER_ONLY','Source creature attacks do not use the player ammunition stock.',{}))
  const attacker = gs.getEntity(attackerId)
  const target = gs.getEntity(targetId)

  if (!attacker) {
    return rules.ruleErrorResult(new rules.RuleViolation('ENTITY_NOT_FOUND', `Entity not found: ${attackerId}`, {
      entityId: attackerId,
    }))
  }
  if (!target) {
    return rules.ruleErrorResult(new rules.RuleViolation('ENTITY_NOT_FOUND', `Entity not found: ${targetId}`, {
      entityId: targetId,
    }))
  }
  const heightIssue=physicalHeightCombatIssue(gs.getState(),[attackerId,targetId])??weatherHeightCombatIssue(gs.getState(),[attackerId,targetId]);if(heightIssue)return rules.ruleErrorResult(new rules.RuleViolation(heightIssue.code,heightIssue.message,{}))

  let swallowBiteContext:SwallowBiteContext|undefined
  let nativePoisonContext:NativePoisonContext|undefined
  let profile: ReturnType<typeof attackProfile> | undefined
  const attackEventId=options?.attackEventId??randomUUID()
  let ammunitionPlan:AmmunitionAttackPlan|undefined
  let heavyContext:HeavyWeaponContext|undefined
  let lanceContext:LanceWeaponContext|undefined
  let legacyFlame:ReturnType<typeof captureThrownFlame>
  try {
    if('type'in attacker){const missing=harvestCreatureActionIssue(attacker.type,weaponOrSpell);if(missing)throw new rules.RuleViolation('MONSTER_ACTION_REFERENCE_ONLY',missing,{})
      nativePoisonContext=nativePoisonAttackContext(attackerId,targetId,weaponOrSpell,attackEventId);swallowBiteContext=captureSwallowBite(attackerId,targetId,weaponOrSpell,attackEventId)}
    if ('srd' in attacker && attacker.srd) {
      profile = attackProfile(attacker, weaponOrSpell, options?.damageOption)
      if (customDamageDice !== undefined || (rangeCells !== undefined && rangeCells !== profile.rangeCells))
        throw new rules.RuleViolation('MONSTER_OVERRIDE_FORBIDDEN', 'SRD monster damage and range come from the selected source action.', {})
      if (profile.name === 'Bite' && gs.getState().monsterEffects?.some(effect => effect.kind === 'grapple' && effect.sourceId === attackerId && effect.targetId !== targetId))
        throw new rules.RuleViolation('GRAPPLE_TARGET_LOCKED', 'The creature cannot bite a different target while maintaining this grapple.', {})
    }
    const registryWeapon = attackerId === 'player' ? findWeapon(weaponOrSpell) : undefined
    if(attackerId==='player'&&weaponForReference(weaponOrSpell)?.improvised)throw new rules.RuleViolation('SRD_PROFILE_REQUIRED','Improvised physical rulings require the current SRD equipment/action state; no legacy grip or physical history is invented.',{})
    if (registryWeapon && rangeCells !== undefined && rangeCells !== weaponAttackRangeCells(registryWeapon))
      throw new rules.RuleViolation('WEAPON_RANGE_OVERRIDE_FORBIDDEN', 'The registered weapon determines its actual normal and long ranges.', {})
    rules.validateAttack(attackerId, targetId, weaponOrSpell, profile?.rangeCells ?? (registryWeapon ? weaponAttackRangeCells(registryWeapon) : rangeCells), options?.reaction)
    if (attackerId === 'player') {
      const weapon = findWeapon(weaponOrSpell)
      if (!weapon) throw new rules.RuleViolation('WEAPON_UNKNOWN', 'Choose an explicit weapon ID or exact label.', { weaponOrSpell })
      if (weapon.id !== 'unarmed' && !gs.getPlayer().inventory.some(item => item.type === 'weapon'
        && (findWeapon(item.id)?.id === weapon.id || findWeapon(item.name)?.id === weapon.id))) {
        throw new rules.RuleViolation('WEAPON_NOT_OWNED', 'This weapon is not in player inventory.', { weaponId: weapon.id })
      }
    }
    validateNonlethalAttack(options?.nonlethal,attackerId,target,profile?.melee??!findWeapon(weaponOrSpell)?.properties.includes('ranged'))
    if(attackerId==='player') {
      const weapon=weaponForReference(weaponOrSpell)!,item=selectedWeaponItem(weaponOrSpell)
      if(weapon.special==='net')throw new rules.RuleViolation('SRD_PROFILE_REQUIRED','The net requires its actual current SRD action/effect state; no legacy restraint or action history is invented.',{})
      if(weapon.ammunitionType||(weapon.properties as readonly string[]).includes('heavy')||weapon.special==='lance')resolvePlayerWeaponUse(weapon,item)
      heavyContext=playerHeavyWeaponContext(weapon)
      lanceContext=playerLanceWeaponContext(weapon,(spatialWeaponResolution(gs.getState(),attackerId,targetId)?.distanceFeet??distanceCells(attacker.position,target.position)*5)/5)
      ammunitionPlan=preflightWeaponAmmunition({weapon,weaponItem:item,ammunitionItemId:options?.ammunitionItemId,
        scopeId:options?.attackActionId??attackEventId,attackId:attackEventId})
      if(weapon.properties.includes('ranged')&&weapon.properties.includes('thrown')&&item)legacyFlame=captureThrownFlame(item.id,attacker.position,target.position,attackEventId)
    }
  } catch (err) {
    return rules.ruleErrorResult(err)
  }

  // Aptitude d'attaque du JOUEUR dérivée de l'arme (distance→DEX, finesse→
  // meilleure de FOR/DEX, sinon FOR). Les monstres gardent leur attackBonus.
  const isPlayerAttacker = attackerId === 'player'
  const attackAbilityKey = isPlayerAttacker
    ? attackAbilityFor(resolveWeapon(weaponOrSpell), attacker.stats)
    : 'str'
  const abilityMod = getAbilityModifier(attacker.stats[attackAbilityKey])
  const profBonus = isPlayerAttacker ? weaponProficiencyBonus(attacker as PlayerState, resolveWeapon(weaponOrSpell)) : 2
  const attackBonus = profile?.attackBonus ?? ('attackBonus' in attacker ? attacker.attackBonus : (abilityMod + profBonus))
  const targetDistance = (spatialWeaponResolution(gs.getState(),attackerId,targetId)?.distanceFeet??distanceCells(attacker.position,target.position)*5)/5
  const melee = profile?.melee ?? !findWeapon(weaponOrSpell)?.properties.includes('ranged')
  const rangedContext=!melee?rangedWeaponContext(attacker,target,profile?.normalRangeCells??findWeapon(weaponOrSpell)!.normalRangeCells!,profile?.rangeCells??findWeapon(weaponOrSpell)!.longRangeCells!,!profile?.magical):undefined
  let underwaterContext:UnderwaterWeaponContext
  try { underwaterContext=captureUnderwaterWeaponContext({actorId:attackerId,target:{kind:'creature',entityId:targetId},weaponReference:isPlayerAttacker?findWeapon(weaponOrSpell)!.id==='unarmed'?'unarmed':selectedWeaponItem(weaponOrSpell)?.id??findWeapon(weaponOrSpell)!.id:profile?.name??weaponOrSpell,canonicalWeaponId:isPlayerAttacker?findWeapon(weaponOrSpell)!.id:profile?nativeUnderwaterWeaponId((attacker as MonsterState).type,profile.name):undefined,melee,weaponAttack:!profile?.magical,normalRangeCells:rangedContext?.normalRangeCells,distanceCells:targetDistance}) } catch(err) { return rules.ruleErrorResult(err) }
  const automaticMiss=underwaterContext.automaticMiss
  const unconsciousMeleeTarget = targetDistance <= 1 && target.conditions.some(c => c === 'unconscious' || c === 'paralyzed')
  const packTactics = hasTrait(attacker, 'Pack Tactics') && allyAdjacentTo(attacker, target)
  const effectiveAdvantage = ruleRollAdvantage(attackerId,'attack',Boolean(advantage || unconsciousMeleeTarget || packTactics || attacker.conditions.includes('invisible')
    || target.conditions.some(c => ['blinded', 'restrained', 'stunned', 'unconscious', 'paralyzed', 'petrified'].includes(c)) || (target.conditions.includes('prone') && targetDistance <= 1)))
  const effectiveDisadvantage = ruleRollDisadvantage(attackerId,'attack',Boolean(disadvantage || attacker.conditions.some(c => ['poisoned', 'prone', 'restrained', 'blinded'].includes(c))
    || frightenedByVisibleSource(attackerId)
    || target.conditions.includes('invisible') || (target.conditions.includes('prone') && targetDistance > 1)
    || underwaterContext.disadvantage || rangedContext?.longRangeDisadvantage || rangedContext?.proximityDisadvantage || rangedContext?.strongWindDisadvantage || heavyContext?.disadvantage || lanceContext?.disadvantage),attackAbilityKey)

  const basicPoisonContext=isPlayerAttacker?basicPoisonAttackContext({attackId:attackEventId,targetId,weapon:weaponForReference(weaponOrSpell)!,item:selectedWeaponItem(weaponOrSpell),ammunition:ammunitionPlan}):undefined
  const oilIssue=!automaticMiss&&(profile?.damageType??(isPlayerAttacker?resolveWeapon(weaponOrSpell).damageType:(attacker as MonsterState).damageType))==='fire'?fireDamageContextIssue(gs.getState(),'creature',targetId):null;if(oilIssue)throw new rules.RuleViolation(oilIssue.code,oilIssue.message,{})
  const attackRoll = automaticMiss?automaticUnderwaterMiss():rollRuleD20(attackerId,'attack',attackBonus + rpBonus, effectiveAdvantage, effectiveDisadvantage,attackAbilityKey)
  const ammunitionReceipt=ammunitionPlan?commitWeaponAmmunition(ammunitionPlan,target.position):undefined
  attackRoll.detail += roleplayBonusDetail(rp)
  // La raison d'un avantage/désavantage de situation reste journalisée.
  const advantageNote = advantageReason?.trim() && effectiveAdvantage !== Boolean(disadvantage)
    ? ` | ${effectiveAdvantage ? 'AVANTAGE' : 'DESAVANTAGE'}: ${advantageReason.trim()}`
    : ''

  const targetAC = target.ac
  const naturalRoll = attackRoll.rolls[0]
  const criticalMiss = naturalRoll === 1
  const naturalCriticalHit = naturalRoll === 20
  const hit = !automaticMiss&&(naturalCriticalHit || (!criticalMiss && attackRoll.total >= targetAC))
  const criticalHit = naturalCriticalHit || (hit && unconsciousMeleeTarget && !criticalMiss)

  let damageRoll = undefined
  let damageDealt = undefined
  let targetHpAfter = undefined
  let targetDied = false
  let targetStatusDetail = ''
  const carriedWeapon = isPlayerAttacker ? (attacker as PlayerState).inventory.find(item => item.type === 'weapon'
    && (findWeapon(item.id)?.id === findWeapon(weaponOrSpell)?.id || findWeapon(item.name)?.id === findWeapon(weaponOrSpell)?.id)) : undefined
  const damageType = profile?.damageType ?? (isPlayerAttacker ? resolveWeapon(weaponOrSpell).damageType : (attacker as MonsterState).damageType as import('../../lib/types').DamageType | undefined) ?? 'bludgeoning'
  let rawDamage: number | undefined
  let damageAdjustment: string[] | undefined
  const riderEffects: unknown[] = []

  if (hit) {
    const abilityModDamage = getAbilityModifier(attacker.stats[attackAbilityKey])
    const baseDamage = profile?.damageDice ?? customDamageDice ?? ('damageDice' in attacker ? attacker.damageDice : withDamageMod(getWeaponDamage(weaponOrSpell), abilityModDamage))
    damageRoll = isPlayerAttacker&&!profile&&customDamageDice===undefined&&!('damageDice'in attacker)?rollWeaponDamage(getWeaponDamage(weaponOrSpell),abilityModDamage,criticalHit):rollDice(criticalHit ? doubleDiceNotation(baseDamage) : baseDamage)

    rawDamage = Math.max(0, damageRoll.total)
    if ('type' in attacker && hasTrait(attacker, 'Martial Advantage') && allyAdjacentTo(attacker, target)) {
      const key = `${gs.getState().combatGeneration}:${gs.getState().turnCounter ?? 0}`
      attacker.monsterRuntime ??= {}
      if (attacker.monsterRuntime.martialAdvantageTurn !== key) {
        const extra = rollDice(criticalHit ? '4d6' : '2d6')
        attacker.monsterRuntime.martialAdvantageTurn = key
        rawDamage += extra.total
        riderEffects.push({ trait: 'Martial Advantage', roll: extra })
      }
    }
    const damage = dealDamage(targetId, rawDamage, damageType, { damageEventId:attackEventId,critical: criticalHit,
      magical: profile?.magical ?? Boolean(carriedWeapon?.magical), silvered: ammunitionReceipt?Boolean(ammunitionReceipt.silvered):Boolean(carriedWeapon?.silvered), weaponAttack: !profile?.magical, sourceId: attackerId,
      knockout:knockoutFromAttack(options?.nonlethal,randomUUID()) })
    damageDealt = damage.damageDealt
    damageAdjustment = damage.damageAdjustment
    if (damage.fortitude) riderEffects.push({ trait: 'Undead Fortitude', ...damage.fortitude })
    riderEffects.push(...damage.harmSaves)
    if ('type' in attacker && profile) riderEffects.push(...applyAttackRiders(attacker, target, profile.name, damageDealt))

    if (targetId === 'player') {
      const updated = gs.getPlayer()
      targetHpAfter = updated.hp.current
      targetDied = Boolean(updated.deathSaves?.dead)
      if (targetDied) {
        targetStatusDetail = ' | MORT'
      } else if (updated.hp.current <= 0) {
        targetStatusDetail = ` | A TERRE (${updated.deathSaves?.successes ?? 0} succes, ${updated.deathSaves?.failures ?? 0} echecs mort)`
      }
    } else {
      const updated = gs.getMonster(targetId)!
      targetHpAfter = updated.hp.current
      targetDied = !updated.isAlive
      if (targetDied) targetStatusDetail = ' | MORT'
    }
  }
  if (!hit) riderEffects.push(...reactToHarm(attackerId, targetId))

  const mechanicalSummary = hit
    ? `Attaque: ${attackRoll.detail} vs CA ${targetAC} -> ${criticalHit ? 'CRITIQUE' : 'TOUCHE'} | Degats bruts: ${rawDamage}, appliqués: ${damageDealt} ${damageType}${damageAdjustment?.length ? ` (${damageAdjustment.join(', ')})` : ''}${targetStatusDetail}${advantageNote}`
    : `Attaque: ${attackRoll.detail} vs CA ${targetAC} -> ${criticalMiss ? 'ECHEC CRITIQUE' : 'RATE'}${advantageNote}`

  const result: AttackResult & {rangedContext?:RangedWeaponContext;ammunition?:unknown;heavyContext?:HeavyWeaponContext;lanceContext?:LanceWeaponContext;thrownItem?:unknown;underwaterContext?:UnderwaterWeaponContext;automaticMiss?:boolean} = {
    underwaterContext,automaticMiss,
    ...(ammunitionReceipt?{ammunition:ammunitionReceipt}:{}),
    ...(heavyContext?{heavyContext}:{}),
    ...(lanceContext?{lanceContext}:{}),
    attackerId,
    targetId,
    weaponOrSpell,
    ...rp,
    ...(rangedContext?{rangedContext}:{}),
    attackRoll,
    naturalRoll,
    criticalHit,
    criticalMiss,
    targetAC,
    hit,
    damageRoll,
    damageDealt,
    targetHpAfter,
    targetDied,
    mechanicalSummary,
    damageType, rawDamage, damageAdjustment, riderEffects,
  }

  gs.addLogEntry({
    round: gs.getState().round,
    turn: attackerId,
    action: `${attacker.name} attaque ${target.name} avec ${weaponOrSpell}`,
    mechanicalDetail: mechanicalSummary,
  })
  endInvisibility(attackerId)
  if (!options?.deferAction && !options?.reaction) rules.recordAction(attackerId)
  if(isPlayerAttacker&&findWeapon(weaponOrSpell)?.properties.includes('ranged')&&findWeapon(weaponOrSpell)?.properties.includes('thrown')){
    const item=selectedWeaponItem(weaponOrSpell)!
    result.thrownItem=commitPhysicalThrow(item.id,target.position,undefined,legacyFlame);afterInventoryChange()
  }

  return swallowBiteContext?resolveSwallowBite(swallowBiteContext,{...result}):nativePoisonContext?resolveNativePoisonHit(nativePoisonContext,{...result}):resolveBasicPoisonHit(basicPoisonContext,{...result})
}

export function resolveMonsterAttackAction(monsterId:string,targetId:string,actionName:string,attackActions?:string[],options?:{stopWhenPlayerDown?:boolean;damageOption?:number}):ReturnType<typeof resolveMonsterAttackActionCore>{
 try{if(actionName==='Multiattack'){const issue=cackleBatchIssue(gs.getState(),[monsterId,targetId]);if(issue)throw new rules.RuleViolation(issue.code,issue.message,{})}const actor=gs.getMonster(monsterId),reference=actionName.toLowerCase()==='multiattack'?attackActions?.[0]??(actor?multiattackPlans(actor).random?.action:undefined):actionName
 const context=reference?captureSpatialWeaponContext(monsterId,targetId,reference):undefined
 return withSpatialWeaponResolution(gs.getState(),context,()=>resolveMonsterAttackActionCore(monsterId,targetId,actionName,attackActions,options))}catch(error){return rules.ruleErrorResult(error)}
}
function resolveMonsterAttackActionCore(monsterId: string, targetId: string, actionName: string,
  attackActions?: string[], options?: { stopWhenPlayerDown?: boolean; damageOption?: number }) {
  const before = structuredClone(gs.getState())
  try {
    const monster = gs.getMonster(monsterId)
    if (!monster || !monster.srd) throw new rules.RuleViolation('MONSTER_SOURCE_REQUIRED', 'Choose an SRD monster actor.', {})
    if (!targetId) throw new rules.RuleViolation('TARGET_REQUIRED', 'The AI must select an explicit target.', {})
    rules.validateActionUse(monsterId)
    // A source-random attack count is still a die: reject total cover before
    // rolling it, rather than relying on the first attack's later assertion.
    assertDirectCoverTarget(monsterId,targetId)
    const preflightPhysicalAttack=(profile:ReturnType<typeof attackProfile>)=>{
      const spatial=captureSpatialWeaponContext(monsterId,targetId,profile.name)
      return withSpatialWeaponResolution(gs.getState(),spatial,()=>{
      rules.validateAttack(monsterId,targetId,profile.name,profile.rangeCells)
      const target=gs.getEntity(targetId)!
      const underwater=captureUnderwaterWeaponContext({actorId:monsterId,target:{kind:'creature',entityId:targetId},weaponReference:profile.name,canonicalWeaponId:nativeUnderwaterWeaponId(monster.type,profile.name),melee:profile.melee,weaponAttack:!profile.magical,normalRangeCells:profile.normalRangeCells,distanceCells:distanceCells(monster.position,target.position)})
      const issue=!underwater.automaticMiss&&profile.damageType==='fire'?fireDamageContextIssue(gs.getState(),'creature',targetId):null
      if(issue)throw new rules.RuleViolation(issue.code,issue.message,{})
      })
    }
    const multi = actionName.toLowerCase() === 'multiattack'
    let names: string[]
    let countRoll: ReturnType<typeof rollDice> | undefined
    if (multi) {
      // MM2014: one Claws substitution requires an actual retained native
      // flight, not a source speed, narrative statement or imported height.
      const plans = multiattackPlans(monster)
      const actuallyFlying=actualNativeFlightLocation(gs.getState(),monsterId)?.airborne===true
      if(monster.type==='wyvern'&&actuallyFlying)plans.options=[['Bite','Stinger'],['Claws','Stinger'],['Bite','Claws']]
      if(monster.type==='wyvern'&&!actuallyFlying&&attackActions?.some(name=>name.toLowerCase().replace(/\s/g,'')==='claws'))
        throw new rules.RuleViolation('WYVERN_FLYING_MULTIATTACK_UNSUPPORTED','The source permits one Claws replacement only while this exact native Wyvern is actually flying. Choose the ordinary pair or establish the actual source flight and exact weapon rays first; no flight or flattened altitude is inferred.',{})
      if (plans.random) {
        if (attackActions !== undefined) throw new rules.RuleViolation('MULTIATTACK_SELECTION_INVALID', 'The source determines the random count and single attack kind; do not supply a sequence.', {})
        // Preflight range/target before rolling the random attack count.
        const profile = attackProfile(monster, plans.random.action, options?.damageOption)
        rules.validateAttack(monsterId, targetId, profile.name, profile.rangeCells)
        preflightPhysicalAttack(profile)
        countRoll = rollDice(plans.random.countDice)
        names = Array.from({ length: countRoll.total }, () => plans.random!.action)
      } else {
        if (!attackActions || !plans.options!.some(plan => plan.length === attackActions.length && [...plan].sort().join('|') === [...attackActions].sort().join('|')))
          throw new rules.RuleViolation('MULTIATTACK_SELECTION_REQUIRED', 'Choose one complete source attack sequence explicitly.', { options: plans.options })
        names = attackActions
        if (monster.type === 'grick' && names.join('|') !== 'Tentacles|Beak')
          throw new rules.RuleViolation('MULTIATTACK_SELECTION_INVALID', 'Tentacles must precede the conditional beak attack.', {})
        if (monster.type === 'veteran' && names.includes('Shortsword') && options?.damageOption === 1)
          throw new rules.RuleViolation('MULTIATTACK_SELECTION_INVALID', 'Two-handed longsword use is incompatible with the drawn shortsword.', {})
      }
    } else {
      if (attackActions !== undefined) throw new rules.RuleViolation('MULTIATTACK_SELECTION_INVALID', 'Sequences require the Multiattack action.', {})
      names = [actionName]
    }
    for (const name of names) {
      const profile = attackProfile(monster, name, name === 'Shortsword' ? undefined : options?.damageOption)
      preflightPhysicalAttack(profile)
    }
    for(const[index,name]of names.entries())captureSwallowBite(monsterId,targetId,name,`swallow-preflight-${index}`)
    preflightNativePoisonSequence(names.map((name,index)=>nativePoisonAttackContext(monsterId,targetId,name,`preflight-${index}`)))
    if (strictHero()) return continueAttackSequence({ monsterId, targetId, names, attacks: [], damageOption: options?.damageOption })
    const attacks: AttackResult[] = []
    for (const name of names) {
      if (monster.type === 'grick' && name === 'Beak' && !attacks[0]?.hit) break
      const target = gs.getEntity(targetId)!
      if (targetId === 'player' ? target.hp.current <= 0 && options?.stopWhenPlayerDown || (target as PlayerState).deathSaves?.dead : !(target as MonsterState).isAlive) break
      const result = resolveAttack(monsterId, targetId, name, undefined, undefined, undefined, undefined, undefined,
        { deferAction: true, damageOption: name === 'Shortsword' ? undefined : options?.damageOption })
      if ('isError' in result && result.isError) throw new Error(result.content[0].text)
      attacks.push(JSON.parse(result.content[0].text))
    }
    rules.recordAction(monsterId)
    return { content: [{ type: 'text' as const, text: JSON.stringify({ monsterId, actionName, targetId, attacks, countRoll,
      attackCount: attacks.length, plannedAttackCount: names.length,
      mechanicalSummary: `${actionName} : ${attacks.length} attaque(s) résolue(s), une action consommée.` }) }] }
  } catch (err) { gs.replaceState(before); return rules.ruleErrorResult(err) }
}

export interface ResolvePlayerAttackInput extends RoleplayBonus {
  cleaving?:boolean
  attackMode?:WeaponAttackMode
  nonlethal?:boolean
  weaponHands?:1|2
  weaponAbility?:'str'|'dex'
  ammunitionItemId?:string
  newAttackAction?:boolean
  targetId?: string
  targetName?: string
  targetHint?: TargetHint
  weaponOrSpell?: string
  advantage?: boolean
  disadvantage?: boolean
  customDamageDice?: string
  rangeCells?: number
  advantageReason?: string
}

export function resolvePlayerAttack({
  targetId,
  targetName,
  targetHint,
  weaponOrSpell,
  advantage,
  disadvantage,
  customDamageDice,
  rangeCells,
  advantageReason,
  roleplayBonus,
  roleplayReason,
  attackMode,
  nonlethal,
  weaponHands,
  weaponAbility,
  ammunitionItemId,
  newAttackAction,
  cleaving,
}: ResolvePlayerAttackInput) {
  try {
    if (!weaponOrSpell) throw new rules.RuleViolation('WEAPON_REQUIRED', 'The agent must choose a weapon explicitly, including unarmed.', {})
    if(cleaving&&(!targetId||targetName!==undefined||targetHint!==undefined))throw new rules.RuleViolation('CLEAVING_EXACT_ORIGIN_REQUIRED','Explicit cleaving adopts one exact real targetId; no name/hint is interpreted into the original body.',{})
    const resolvedTargetId = selectPlayerTarget(targetId, targetName, targetHint)
    return resolveAttack('player', resolvedTargetId, weaponOrSpell, advantage, disadvantage, customDamageDice, rangeCells, advantageReason, { roleplayBonus, roleplayReason,attackMode,nonlethal,weaponHands,weaponAbility,ammunitionItemId,newAttackAction,cleaving })
  } catch (err) {
    return rules.ruleErrorResult(err)
  }
}

// ── SORTS (cast_spell) ────────────────────────────────────────────────────────
// Le moteur juge le COÛT (sort connu, tour/action, portée, emplacement) et
// résout l'effet fermé. Le LLM ne fait que narrer le résultat. Un sort coûte
// l'ACTION ; les tours de magie (niveau 0) ne consomment pas d'emplacement.

export interface CastSpellInput {
  invalidTargetRule?: 'xge-2014'
  invalidTargetEventId?: string
  alarmWard?: AlarmWardSelection
  lightObject?:import('../../lib/light-spell-state').LightObjectSelection
  spellObservers?:import('../../lib/spell-perception-state').SpellObserverSelection[]
  companionToCell?:{x:number;y:number};companionWillingConfirmed?:true
  area?: import('../../lib/spell-area-state').SpellAreaSelection
  upcastDamageType?: 'fire'|'radiant'
  nonlethal?: boolean
  curse?: CurseSelection
  afflictionId?: string
  itemId?: string
  narrative?: string
  effectDurationSeconds?: number
  targetIds?: string[]
  direction?: { x:number; y:number }
  sculptTargetIds?: string[]
  ritual?: boolean
  companionId?: string
  spellId?: string
  spellName?: string
  targetId?: string
  targetName?: string
  waterEffect?: WaterEffect
  slotLevel?: import('../../lib/types').SpellSlotLevel
  toCell?: { x: number; y: number }
  condition?: Condition
  materialItemId?: string
}

function spellcastingMod(player: PlayerState): number {
  const ability = player.spellcastingAbility ?? 'int'
  return getAbilityModifier(player.stats[ability])
}

// Remplace le marqueur MOD d'une notation de soin par le mod d'incantation.
function resolveHealNotation(amount: string, mod: number): string {
  if (!amount.includes('MOD')) return amount
  const die = amount.split('+MOD')[0]
  return withDamageMod(die, mod)
}

export function resolveCastSpell(input: CastSpellInput) {
  const { spellId, spellName, targetId, targetName, waterEffect, slotLevel, toCell, condition, materialItemId } = input
  if(strictHero()) {
    try{return cast5eSpell({...input,spellId:resolveSpell(spellId??spellName)?.id})}
    catch(err){return rules.ruleErrorResult(err)}
  }
  if(input.alarmWard!==undefined||resolveSpell(spellId??spellName)?.id==='alarm')return rules.ruleErrorResult(new rules.RuleViolation('SRD_PROFILE_REQUIRED','A physical door Alarm requires the actual SRD2014 long casting producer.',{}))
  if(input.invalidTargetRule!==undefined||input.invalidTargetEventId!==undefined)return rules.ruleErrorResult(new rules.RuleViolation('SRD_PROFILE_REQUIRED','The adopted invalid-target rule requires a current SRD2014 caster.',{}))
  if(input.lightObject!==undefined)return rules.ruleErrorResult(new rules.RuleViolation('SRD_PROFILE_REQUIRED','Actual Light object casting requires the current SRD2014 source/components; the legacy caster cannot ignore a physical object choice.',{}))
  if(input.spellObservers!==undefined)return rules.ruleErrorResult(new rules.RuleViolation('SRD_PROFILE_REQUIRED','Actual casting observers require the existing SRD2014 casting/component producer; a legacy spell cannot ignore observer choices.',{}))
  if(input.nonlethal!==undefined)return rules.ruleErrorResult(new rules.RuleViolation('SRD_PROFILE_REQUIRED','A spell knockout choice requires a current SRD profile and a supported melee spell attack; the legacy caster cannot ignore this field.',{}))
  if(input.area!==undefined||input.upcastDamageType!==undefined)return rules.ruleErrorResult(new rules.RuleViolation('SRD_PROFILE_REQUIRED','Spatial source areas require a current SRD2014 caster; these arguments cannot be ignored by a legacy single-target resolver.',{}))
  if(input.companionId!==undefined||input.companionToCell!==undefined||input.companionWillingConfirmed!==undefined)return rules.ruleErrorResult(new rules.RuleViolation('SRD_PROFILE_REQUIRED','Explicit companion consent and arrival require the current SRD2014 teleport procedure.',{}))
  const player = gs.getPlayer()
  const spell = resolveSpell(spellId ?? spellName)

  if (!spell) {
    return rules.ruleErrorResult(new rules.RuleViolation('SPELL_UNKNOWN', `Unknown spell: "${spellId ?? spellName ?? ''}".`, { spellId, spellName }))
  }
  if (!player.knownSpells?.includes(spell.id)) {
    return rules.ruleErrorResult(new rules.RuleViolation('SPELL_NOT_KNOWN', `The player does not know ${spell.label}.`, { spellId: spell.id, known: player.knownSpells ?? [] }))
  }

  if (spell.narrativeTarget || spell.effect.kind === 'advanced') {
    return rules.ruleErrorResult(new rules.RuleViolation('SRD_PROFILE_REQUIRED', 'This spell requires a current SRD rules profile.', {}))
  }

  // Économie d'action : un sort coûte l'action (vérification seule ici).
  try {
    rules.validateActionUse('player')
    if (spell.explorationOnly && gs.getState().phase === 'combat') throw new rules.RuleViolation('SPELL_REQUIRES_TIME', 'This spell takes longer than one combat action.', {})
    if(spell.effect.kind==='heal')assertBreathingRecoveryAllowed('player')
  } catch (err) {
    return rules.ruleErrorResult(err)
  }

  // Cible (pour les sorts ciblés) et portée.
  let target: PlayerState | MonsterState | undefined
  const needsEnemy = spell.effect.kind === 'attack_roll' || spell.effect.kind === 'save' || spell.effect.kind === 'auto_hit' || spell.effect.kind === 'condition'
  if (needsEnemy) {
    try {
      const resolvedTargetId = selectPlayerTarget(targetId, targetName, undefined)
      target = gs.getMonster(resolvedTargetId)
    } catch (err) {
      return rules.ruleErrorResult(err)
    }
    if (!target) {
      return rules.ruleErrorResult(new rules.RuleViolation('TARGET_NOT_FOUND', 'No valid target for this spell.', { targetId, targetName }))
    }
    if (!target.isAlive) return rules.ruleErrorResult(new rules.RuleViolation('ENTITY_DEAD', 'A spell cannot select this defeated target.', {}))
    try { rules.validateHostileTarget('player', target.id) } catch (err) { return rules.ruleErrorResult(err) }
    const distance = rules.distanceCells(player.position, target.position)
    if (distance > spell.rangeCells) {
      return rules.ruleErrorResult(new rules.RuleViolation('TARGET_OUT_OF_RANGE', `${target.name} is ${distance} cells away; ${spell.label} range is ${spell.rangeCells} cells.`, { distance, rangeCells: spell.rangeCells }))
    }
  }

  // Resolve explicit environmental arguments before debiting any resource.
  let resolvedWater: WaterEffect | undefined
  try {
    const heightIssue=toCell||spell.effect.kind==='water'?weatherHeightPointIssue(gs.getState(),['player']):weatherHeightCombatIssue(gs.getState(),['player',...(target?[target.id]:[])])
    if(heightIssue)throw new rules.RuleViolation(heightIssue.code,heightIssue.message,{})
    if (!needsEnemy && spell.target === 'self' && ((targetId !== undefined && targetId !== 'player') || targetName !== undefined))
      throw new rules.RuleViolation('SPELL_TARGET_CONFLICT', 'This supported effect applies to the player only.', {})
    if (spell.effect.kind === 'teleport') {
      if (!toCell || targetId !== undefined || targetName !== undefined) throw new rules.RuleViolation('SPELL_DESTINATION_REQUIRED', 'Choose one exact toCell on this map, without an enemy target.', {})
      rules.validateMapCell(toCell)
      const state = gs.getState()
      if (!inferRoomIdOnMap(toCell, state.currentMapId, state) || !navigationGrid(state, 'player', engineGeometry()).free(toCell)
        || rules.distanceCells(player.position, toCell) > spell.rangeCells)
        throw new rules.RuleViolation('SPELL_DESTINATION_BLOCKED', 'Choose an unoccupied room cell in range on the current map.', {})
      if(player.position.x!==toCell.x||player.position.y!==toCell.y)gs.assertPhysicalDisplacements([{id:'player',cell:toCell,kind:'teleport'}])
    } else if (toCell !== undefined) throw new rules.RuleViolation('SPELL_EFFECT_MISMATCH', 'This spell does not accept toCell.', {})
    if (spell.effect.kind === 'restore') {
      if (!condition || !spell.effect.conditions.includes(condition) || !player.conditions.includes(condition))
        throw new rules.RuleViolation('SPELL_CONDITION_REQUIRED', 'Choose one of the supported conditions actually affecting the player.', {})
    } else if (condition !== undefined) throw new rules.RuleViolation('SPELL_EFFECT_MISMATCH', 'This spell does not accept a condition.', {})
    if (spell.materialName) {
      const material = player.inventory.find(item => item.id === materialItemId)
      if (!material || material.name !== spell.materialName) throw new rules.RuleViolation('SPELL_MATERIAL_REQUIRED', 'Select an exact owned offering item ID.', {})
    } else if (materialItemId !== undefined) throw new rules.RuleViolation('SPELL_EFFECT_MISMATCH', 'This spell does not consume an offering.', {})
    if (spell.effect.kind === 'water') {
      if (targetId !== undefined || targetName !== undefined) {
        throw new rules.RuleViolation('SPELL_TARGET_CONFLICT', 'Water uses waterEffect only, not an enemy target.', {})
      }
      resolvedWater = validateWaterEffect(waterEffect, spell.rangeCells)
    } else if (waterEffect !== undefined) {
      throw new rules.RuleViolation('SPELL_EFFECT_MISMATCH', 'This spell does not accept a water effect.', {})
    }
  } catch (err) {
    return rules.ruleErrorResult(err)
  }

  // Emplacement disponible pour les sorts de niveau ≥ 1 (tours de magie exemptés).
  const castingLevel = slotLevel ?? spell.level
  if ((spell.level === 0 && slotLevel !== undefined) || castingLevel < spell.level || castingLevel > 4) {
    return rules.ruleErrorResult(new rules.RuleViolation('SPELL_SLOT_LEVEL_INVALID', 'Choose an explicit slot at least equal to the spell level; cantrips use no slot.', {}))
  }
  const pool = castingLevel >= 1 ? player.spellSlots?.[`level${castingLevel as import('../../lib/types').SpellSlotLevel}`] : undefined
  if (spell.level >= 1 && (!pool || pool.current <= 0)) {
    return rules.ruleErrorResult(new rules.RuleViolation('SPELL_SLOTS_EXHAUSTED', `No level-${castingLevel} spell slot remaining for ${spell.label}. Choose another level explicitly.`, { spellId: spell.id }))
  }

  // ── COMMIT : à partir d'ici, on débite et on résout ──────────────────────────
  if (spell.level >= 1) gs.consumeSpellSlot(castingLevel as import('../../lib/types').SpellSlotLevel)
  if (spell.materialName) gs.consumePlayerItem(item => item.id === materialItemId)
  if (gs.getState().phase === 'combat' && gs.getState().currentTurn === 'player') {
    rules.recordAction('player')
  }

  const result = { ...applySpellEffect(spellAtLevel(spell, player.level, castingLevel), player, target, resolvedWater, toCell, condition), slotLevel: castingLevel }
  gs.addLogEntry({
    round: gs.getState().round,
    turn: gs.getState().currentTurn ?? 'player',
    action: `${player.name} lance ${spell.label}`,
    mechanicalDetail: result.mechanicalSummary,
  })

  if('pendingGroundGearContactIds'in result&&Array.isArray(result.pendingGroundGearContactIds)&&result.pendingGroundGearContactIds.length)bindGroundGearContinuation(result.pendingGroundGearContactIds,{type:'engine-effect',domain:'hero-spell-result',command:{spellId:spell.id,result}})
  return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] }
}

function applySpellEffect(spell: SpellSpec, player: PlayerState, target: PlayerState | MonsterState | undefined, waterEffect?: WaterEffect,
  toCell?: { x: number; y: number }, condition?: Condition) {
  const mod = spellcastingMod(player)
  const effect = spell.effect

  switch (effect.kind) {
    case 'advanced': throw new rules.RuleViolation('SRD_PROFILE_REQUIRED', 'This spell requires the SRD rules profile.', {})
    case 'teleport': {
      const from = { ...player.position }
      const moved=from.x===toCell!.x&&from.y===toCell!.y?{groundGearContactIds:[]}:gs.commitPhysicalDisplacements([{id:'player',cell:toCell!,kind:'teleport'}])
      return { spell: spell.id, effect: 'teleport', from, newPosition: { ...player.position }, currentRoomId: gs.getState().currentRoomId,
        pendingGroundGearContactIds:moved.groundGearContactIds,spellEffectAlreadyCommitted:true,
        mechanicalSummary: `${spell.label} : téléportation de (${from.x},${from.y}) vers (${player.position.x},${player.position.y}) sur la même carte.` }
    }
    case 'restore': {
      gs.removeCondition('player', condition!)
      return { spell: spell.id, effect: 'restore', removedCondition: condition,
        mechanicalSummary: `${spell.label} : ${condition} retiré du héros, sans modifier ses autres états.` }
    }
    case 'water': {
      // Prevalidated before the slot/action commit; no fallible validation here.
      const fact = recordWaterEffect(waterEffect!)
      return { spell: spell.id, effect: 'utility', srdNote: effect.srdNote,
        waterEffect: fact.waterEffect, worldFact: fact,
        mechanicalSummary: `${spell.label} lancé en (${waterEffect!.cell.x},${waterEffect!.cell.y}) ; coûts appliqués, conséquence narrative enregistrée (${fact.id}).` }
    }
    case 'attack_roll': {
      const attackBonus = mod + player.proficiencyBonus
      const distance = rules.distanceCells(player.position, target!.position)
      const attackAdvantage = ruleRollAdvantage('player','attack',player.conditions.includes('invisible') || target!.conditions.some(c => ['blinded', 'restrained', 'stunned', 'unconscious', 'paralyzed', 'petrified'].includes(c))
        || distance <= 1 && target!.conditions.includes('prone'))
      const attackDisadvantage = ruleRollDisadvantage('player','attack',player.conditions.some(c => ['poisoned', 'prone', 'restrained', 'blinded'].includes(c))
        || frightenedByVisibleSource('player') || target!.conditions.includes('invisible') || distance > 1 && target!.conditions.includes('prone')
        || distance <= 1 && !player.conditions.includes('invisible') && target!.hp.current > 0 && !target!.conditions.some(c => ['blinded', 'incapacitated', 'unconscious', 'paralyzed', 'stunned', 'petrified'].includes(c)))
      const roll = rollRuleD20('player','attack',attackBonus, attackAdvantage, attackDisadvantage)
      const natural = roll.rolls[0]
      const critMiss = natural === 1
      const naturalCrit = natural === 20
      const hit = naturalCrit || (!critMiss && roll.total >= (target?.ac ?? 0))
      const critHit = naturalCrit || hit && distance <= 1 && target!.conditions.some(c => c === 'unconscious' || c === 'paralyzed')
      let damageRoll
      let targetHpAfter
      let targetDied = false
      let damageResolution: ReturnType<typeof dealDamage> | undefined
      if (hit && target) {
        damageRoll = rollDice(critHit ? doubleDiceNotation(effect.damage) : effect.damage)
        const damage = dealDamage(target.id, Math.max(0, damageRoll.total), effect.damageType, { magical: true, critical: critHit, sourceId: 'player' })
        damageResolution = damage
        targetHpAfter = damage.hpAfter
        targetDied = damage.died
      }
      const summary = hit
        ? `${spell.label}: ${roll.detail} vs CA ${target?.ac} -> ${critHit ? 'CRITIQUE' : 'TOUCHE'} | Degats appliqués: ${damageResolution?.damageDealt} ${effect.damageType} (${damageResolution?.damageAdjustment.join(', ')})${targetDied ? ' | MORT' : ''}`
        : `${spell.label}: ${roll.detail} vs CA ${target?.ac} -> ${critMiss ? 'ECHEC CRITIQUE' : 'RATE'}`
      return { spell: spell.id, effect: 'attack_roll', hit, roll, damageRoll, damageType: effect.damageType,
        damageDealt: damageResolution?.damageDealt, damageResolution,
        targetId: target?.id, targetHpAfter, targetDied, mechanicalSummary: summary }
    }
    case 'auto_hit': {
      const damageRoll = rollDice(effect.damage)
      let targetHpAfter
      let targetDied = false
      let damageResolution: ReturnType<typeof dealDamage> | undefined
      if (target) {
        const damage = dealDamage(target.id, Math.max(0, damageRoll.total), effect.damageType, { magical: true, sourceId: 'player' })
        damageResolution = damage
        targetHpAfter = damage.hpAfter
        targetDied = damage.died
      }
      const summary = `${spell.label}: touche automatique | Degats appliqués: ${damageResolution?.damageDealt} ${effect.damageType}${targetDied ? ' | MORT' : ''}`
      return { spell: spell.id, effect: 'auto_hit', hit: true, damageRoll, damageResolution, damageDealt: damageResolution?.damageDealt,
        damageType: effect.damageType, targetId: target?.id, targetHpAfter, targetDied, mechanicalSummary: summary }
    }
    case 'save': {
      const dc = 8 + player.proficiencyBonus + mod
      const save = savingThrow(target!.id, effect.ability, dc, true)
      const roll = save.roll
      const saved = save.success
      const fullRoll = rollDice(effect.damage)
      const rawDamage = saved ? (effect.halfOnSave ? Math.floor(fullRoll.total / 2) : 0) : fullRoll.total
      let damageDealt = 0
      let targetHpAfter
      let targetDied = false
      let damageResolution: ReturnType<typeof dealDamage> | undefined
      if (target) {
        const damage = dealDamage(target.id, rawDamage, effect.damageType, { magical: true, sourceId: 'player' })
        damageResolution = damage
        damageDealt = damage.damageDealt
        targetHpAfter = damage.hpAfter
        targetDied = damage.died
      }
      const summary = `${spell.label}: JS ${effect.ability.toUpperCase()} ${roll.detail} vs DD ${dc} -> ${saved ? 'REUSSI' : 'RATE'} | Degats: ${damageDealt} (${fullRoll.detail})${targetDied ? ' | MORT' : ''}`
      return { spell: spell.id, effect: 'save', saved, dc, roll, damageDealt, damageResolution, damageType: effect.damageType,
        targetId: target?.id, targetHpAfter, targetDied, mechanicalSummary: summary }
    }
    case 'condition': {
      const dc = 8 + player.proficiencyBonus + mod
      const save = savingThrow(target!.id, effect.ability, dc, true, effect.condition)
      const roll = save.roll
      const saved = save.success
      const applied = target && !saved ? gs.applyCondition(target.id, effect.condition) : undefined
      const summary = `${spell.label}: JS ${effect.ability.toUpperCase()} ${roll.detail} vs DD ${dc} -> ${saved ? 'REUSSI (aucun effet)' : applied?.immune ? 'IMMUNISÉ (aucun état appliqué)' : `RATE (${effect.condition})`}`
      return { spell: spell.id, effect: 'condition', saved, dc, roll, applied, condition: effect.condition, targetId: target?.id, mechanicalSummary: summary }
    }
    case 'heal': {
      const healRoll = rollDice(resolveHealNotation(effect.amount, mod))
      const before = player.hp.current
      const updated = gs.updatePlayerHP(healRoll.total)
      const summary = `${spell.label}: soin ${healRoll.detail} | PV ${before}/${updated.hp.max} -> ${updated.hp.current}/${updated.hp.max}`
      return { spell: spell.id, effect: 'heal', healRoll, hpBefore: before, hpAfter: updated.hp.current, mechanicalSummary: summary }
    }
    case 'utility': {
      let oracleReliable: boolean | undefined
      if (spell.id === 'divination') {
        const state = gs.getState()
        state.sceneMemory ??= {}
        const casts = (state.sceneMemory.divinationCasts ?? {}) as Record<string, number>
        const key = state.currentMapId ?? 'default', previous = casts[key] ?? 0
        oracleReliable = previous === 0 || rollDice('1d100').total > Math.min(100, previous * 25)
        state.sceneMemory.divinationCasts = { ...casts, [key]: previous + 1 }
      }
      let fact
      if (effect.fact) {
        const state = gs.getState()
        fact = gs.addWorldFact({
          text: effect.fact.text,
          source: `cast_spell:${spell.id}`,
          mapId: state.currentMapId ?? '',
          roomId: effect.fact.expires === 'room' ? (state.currentRoomId ?? undefined) : undefined,
          expires: effect.fact.expires,
        })
      }
      const summary = `${spell.label}: effet utilitaire — ${effect.srdNote}`
      return { spell: spell.id, effect: 'utility', srdNote: effect.srdNote, worldFact: fact, oracleReliable, mechanicalSummary: summary }
    }
  }
}

// ── CAPACITÉS DE CLASSE (use_class_feature) ─────────────────────────────────────

export interface UseClassFeatureInput {
  featureId: 'second_wind' | 'action_surge'
}

export function resolveUseClassFeature({ featureId }: UseClassFeatureInput) {
  if(strictHero()){try{return useHeroFeature({featureId})}catch(err){return rules.ruleErrorResult(err)}}
  const player = gs.getPlayer()
  if (!player.features?.includes(featureId)) {
    return rules.ruleErrorResult(new rules.RuleViolation('FEATURE_NOT_AVAILABLE', `The player does not have the ${featureId} feature.`, { featureId, features: player.features ?? [] }))
  }

  if (featureId === 'action_surge') {
    try {
      rules.validateFreeCombatAction('player')
      if (!gs.hasActionUsed('player')) throw new rules.RuleViolation('ACTION_SURGE_NOT_NEEDED', 'Spend the current action before requesting an additional one.', {})
      if (!gs.consumeResource('action_surge')) throw new rules.RuleViolation('RESOURCE_EXHAUSTED', 'Action Surge has already been used on this map.', {})
      gs.resetActionUsed('player')
      return { content: [{ type: 'text' as const, text: JSON.stringify({ feature: featureId, actionAvailable: true,
        mechanicalSummary: 'Sursaut : une action supplémentaire disponible, sans nouveau déplacement ni action bonus ; ressource consommée.' }) }] }
    } catch (err) { return rules.ruleErrorResult(err) }
  }

  // Économie d'action bonus (le second souffle coûte l'action bonus).
  try {
    assertBreathingRecoveryAllowed('player')
    rules.validateBonusActionUse('player')
  } catch (err) {
    return rules.ruleErrorResult(err)
  }

  if (!gs.consumeResource('second_wind')) {
    return rules.ruleErrorResult(new rules.RuleViolation('RESOURCE_EXHAUSTED', 'Second Wind has already been used (recharges when changing map).', {}))
  }
  const healRoll = rollDice(`1d10+${player.level}`)
  const before = player.hp.current
  const updated = gs.updatePlayerHP(healRoll.total)
  gs.markBonusActionUsed('player')
  const summary = `Second souffle: ${healRoll.detail} | PV ${before}/${updated.hp.max} -> ${updated.hp.current}/${updated.hp.max}`
  gs.addLogEntry({ round: gs.getState().round, turn: gs.getState().currentTurn ?? 'player', action: `${player.name} — Second souffle`, mechanicalDetail: summary })
  return { content: [{ type: 'text' as const, text: JSON.stringify({ feature: 'second_wind', healRoll, hpBefore: before, hpAfter: updated.hp.current, mechanicalSummary: summary }) }] }
}

// ── TOURS DES MONSTRES (résolution déterministe en un seul appel) ─────────────────

// Conditions qui font perdre son tour au monstre.
const INCAPACITATING_CONDITIONS: ReadonlySet<Condition> = new Set<Condition>([
  'incapacitated', 'paralyzed', 'petrified', 'stunned', 'unconscious',
])

interface MonsterTurnRecord {
  id: string
  name: string
  action: 'attack' | 'approach' | 'hold' | 'incapacitated'
  from: { x: number; y: number }
  to: { x: number; y: number }
  moved: number
  attack: AttackResult | null
  attacks?: AttackResult[]
  note?: string
}

// Déplace un monstre case par case vers la cible en respectant le budget de mouvement,
// les limites de la carte et l'occupation (validateMove rejette les cases illégales).
// Monotone par axe : converge sans osciller et s'arrête dès qu'il est au contact, à court
// de mouvement, ou totalement bloqué. Retourne le nombre de cases réellement parcourues.
function stepMonsterToward(monsterId: string, _target: { x: number; y: number }): number {
  try { return executeNavigation(monsterId, { kind: 'entity', entityId: 'player', relation: 'adjacent' }, true).costCells }
  catch { return 0 }
}

// Joue le tour d'UN monstre : attente (allié/neutre/hold), incapacité, sinon avance vers
// le joueur et attaque s'il est au contact. N'achève jamais un joueur déjà à terre.
function resolveMonsterTurn(monsterId: string, holdIds: ReadonlySet<string>): MonsterTurnRecord {
  const monster = gs.getMonster(monsterId)!
  const from = { ...monster.position }
  const name = monster.name

  if (isSurprised(gs.getState(), monsterId)) {
    return { id: monsterId, name, action: 'hold', from, to: from, moved: 0, attack: null, note: 'surprised' }
  }

  if (monster.hostile === false || holdIds.has(monsterId)) {
    return { id: monsterId, name, action: 'hold', from, to: from, moved: 0, attack: null }
  }
  if (monster.conditions.some(condition => INCAPACITATING_CONDITIONS.has(condition))) {
    return { id: monsterId, name, action: 'incapacitated', from, to: from, moved: 0, attack: null }
  }
  if (gs.hasActionUsed(monsterId)) return { id: monsterId, name, action: 'hold', from, to: from, moved: 0, attack: null, note: 'action_already_resolved' }
  if(strictHero()&&effects('turned',monsterId).length){
    let moved=0;try{moved=turnedMovement(monsterId)}catch{gs.markActionUsed(monsterId)}
    return{id:monsterId,name,action:'hold',from,to:{...monster.position},moved,attack:null,note:'turned_undead'}
  }

  const player = gs.getPlayer()
  const moved = stepMonsterToward(monsterId, player.position)
  const to = { ...gs.getMonster(monsterId)!.position }

  // Joueur déjà à terre : on s'approche/menace mais on n'achève pas (laisse une chance
  // aux jets de sauvegarde contre la mort — évite le « swarm instakill »).
  if (player.hp.current <= 0) {
    return { id: monsterId, name, action: 'approach', from, to, moved, attack: null, note: 'player_down' }
  }

  const distance = distanceCells(to, player.position)
  const grid = navigationGrid(gs.getState(), monsterId, engineGeometry())
  let clearReach = distance > 0 && distance <= (monster.attackRangeCells ?? 1)
  let previous = to
  for (let step = 1; clearReach && step <= distance; step++) {
    const next = { x: Math.round(to.x + (player.position.x - to.x) * step / distance),
      y: Math.round(to.y + (player.position.y - to.y) * step / distance) }
    clearReach = grid.step(previous, next, false, false)
    previous = next
  }
  if (clearReach) {
    const multi = monster.srd && sourceAction(monster, 'Multiattack')
    const plans = multi ? multiattackPlans(monster) : undefined
    const selected = plans?.options?.find(plan => plan.every(name => name === monster.attackName)) ?? plans?.options?.[0]
    const result = monster.srd
      ? resolveMonsterAttackAction(monsterId, 'player', multi ? 'Multiattack' : monster.attackName!, selected, { stopWhenPlayerDown: true })
      : resolveAttack(monsterId, 'player', monster.attackName ?? 'attaque')
    const errored = 'isError' in result && result.isError
    if (!errored) {
      const data = JSON.parse(result.content[0].text)
      if(strictHero()&&hero().pending)return {id:monsterId,name,action:'hold',from,to,moved,attack:null,note:'reaction_pending'}
      const attacks: AttackResult[] = data.attacks ?? [data]
      return { id: monsterId, name, action: 'attack', from, to, moved, attack: attacks[0] ?? null, attacks }
    }
    return { id: monsterId, name, action: 'approach', from, to, moved, attack: null, note: 'attack_unavailable' }
  }

  return { id: monsterId, name, action: 'approach', from, to, moved, attack: null }
}

export function registerCombatTools(server: McpServer): void {
  registerNativePoisonResolution();registerSwallowResolutions()
  server.tool('resolve_player_multiattack',
    'Uses the Fighter Extra Attack feature as ONE action. The AI must choose one or two exact targetId/weaponOrSpell pairs. Validates all choices before rolling. Never adds an attack or chooses another target automatically. A defeated selected target is skipped. No spells or damage overrides.',
    { attacks: z.array(z.object({ targetId: z.string().min(1), weaponOrSpell: z.string().min(1),attackMode:WeaponAttackModeSchema.optional(),nonlethal:z.boolean().optional(),weaponHands:z.union([z.literal(1),z.literal(2)]).optional(),weaponAbility:z.enum(['str','dex']).optional(),ammunitionItemId:z.string().min(1).optional(), ...roleplayBonusFields }).strict()).min(1).max(2),newAttackAction:z.boolean().optional() },
    async ({ attacks,newAttackAction }) => {
      try {
        if(attacks.length>1){const issue=cackleBatchIssue(gs.getState(),['player',...attacks.map(attack=>attack.targetId)]);if(issue)throw new rules.RuleViolation(issue.code,issue.message,{})}
        const player = gs.getPlayer()
        if (!player.features?.includes('extra_attack')) throw new rules.RuleViolation('FEATURE_NOT_AVAILABLE', 'Extra Attack is not available.', {})
        if(newAttackAction!==undefined&&!strictHero())throw new rules.RuleViolation('SRD_PROFILE_REQUIRED','An explicit additional Attack action requires the SRD action profile.',{})
        if(newAttackAction)rules.validateActionUse('player')
        if (strictHero() && attacks.length > ((!newAttackAction&&hero().attackAction?.remaining) || (hero().actionCredits>0?2:0))) throw new rules.RuleViolation('EXTRA_ATTACK_LIMIT', 'Only the remaining attacks of this Attack action may be selected.', {})
        const thrown=new Set<string>()
        const actionScopeId=strictHero()?newAttackAction||!hero().attackAction?.remaining?randomUUID():hero().attackAction!.id:randomUUID()
        const preparedAttacks=attacks.map((attack,index)=>({attackerId:'player',...attack,attackEventId:randomUUID(),
          ...(actionScopeId?{attackActionId:actionScopeId}:{}),...(index===0&&newAttackAction!==undefined?{newAttackAction}:{})}))
        const ammunitionPlans:(AmmunitionAttackPlan|undefined)[]=[]
        const sequenceConsumedLoadedHosts=new Set<string>()
        let possiblePoisonHits=0,possibleOilFireHits=0
        const possiblePlayerPoisonContexts:(PlayerPoisonAttackContext|undefined)[]=[]
        if(preparedAttacks.length>1&&preparedAttacks.some(attack=>weaponForReference(attack.weaponOrSpell)?.special==='net'))throw new rules.RuleViolation('NET_ONLY_ATTACK','A net permits only one attack in its actual action; the whole explicit sequence is refused before dice/costs.',{})
        for (const attack of preparedAttacks) {
          const spatial=captureSpatialWeaponContext('player',attack.targetId,attack.weaponOrSpell,attack.attackMode)
          withSpatialWeaponResolution(gs.getState(),spatial,()=>{
          validateRoleplayBonus(attack)
          const weapon = weaponForReference(attack.weaponOrSpell),carried=selectedWeaponItem(attack.weaponOrSpell)
          if (!weapon) throw new rules.RuleViolation('WEAPON_UNKNOWN', 'Choose an exact known weapon.', {})
          const heightIssue=physicalHeightCombatIssue(gs.getState(),['player',attack.targetId])??weatherHeightCombatIssue(gs.getState(),['player',attack.targetId]);if(heightIssue)throw new rules.RuleViolation(heightIssue.code,heightIssue.message,{})
          if(weapon.special==='net'&&!strictHero())throw new rules.RuleViolation('SRD_PROFILE_REQUIRED','The net requires its actual current SRD action/effect state.',{})
          if(!strictHero()&&attack.weaponHands!==undefined)throw new rules.RuleViolation('SRD_PROFILE_REQUIRED','An explicit attack grip requires the SRD equipment profile.',{})
          if(!strictHero()&&attack.weaponAbility!==undefined)throw new rules.RuleViolation('SRD_PROFILE_REQUIRED','An explicit finesse choice requires the current SRD profile.',{})
          playerFinesseWeaponContext(weapon,attack.weaponAbility)
          if(!strictHero()&&attack.attackMode)throw new rules.RuleViolation('SRD_PROFILE_REQUIRED','Explicit melee/thrown modes require the SRD2014 equipment profile.',{})
          rules.validateAttack('player', attack.targetId, attack.weaponOrSpell,weaponAttackRangeCells(weapon,attack.attackMode))
          // Validate every selected target before resolving even the first
          // attack; a later covered target cannot turn the call into a partial
          // damage/action commit followed by an error.
          assertDirectCoverTarget('player',attack.targetId)
          if(attack.attackMode&&weapon.properties.includes('ranged'))throw new rules.RuleViolation('ATTACK_MODE_INVALID','A ranged registry weapon uses its ranged profile.',{})
          validateNonlethalAttack(attack.nonlethal,'player',gs.getEntity(attack.targetId)!,attack.attackMode!=='thrown'&&!weapon.properties.includes('ranged'))
          if (weapon.id !== 'unarmed' && (!carried || !weaponItemHeld(carried)))
            throw new rules.RuleViolation('WEAPON_NOT_OWNED', 'Choose an owned weapon.', {})
          const underwater=captureUnderwaterWeaponContext({actorId:'player',target:{kind:'creature',entityId:attack.targetId},weaponReference:weapon.id==='unarmed'?'unarmed':carried!.id,canonicalWeaponId:weapon.improvised?.profileId??weapon.id,attackMode:attack.attackMode,melee:attack.attackMode!=='thrown'&&!weapon.properties.includes('ranged'),weaponAttack:true,normalRangeCells:weapon.normalRangeCells,distanceCells:distanceCells(player.position,gs.getEntity(attack.targetId)!.position)})
          const environmental=!underwater.automaticMiss&&weapon.damageType==='fire'?fireDamageContextIssue(gs.getState(),'creature',attack.targetId):null
          if(environmental)throw new rules.RuleViolation(environmental.code,environmental.message,{})
          if(strictHero())resolvePlayerWeaponUse(weapon,carried,attack.weaponHands,attack.attackMode)
          else if(weapon.ammunitionType||(weapon.properties as readonly string[]).includes('heavy')||weapon.special==='lance')resolvePlayerWeaponUse(weapon,carried)
          const throwing=Boolean(attack.attackMode==='thrown'||weapon.properties.includes('ranged')&&weapon.properties.includes('thrown'))
          if(throwing&&carried&&(!weapon.improvised||weapon.improvised.targetKind==='item'))assertCanDrop(carried.id)
          improvisedAttackContext(attack.weaponOrSpell,gs.getEntity(attack.targetId)!.position,throwing)
          if(throwing&&carried)captureThrownFlame(carried.id,player.position,gs.getEntity(attack.targetId)!.position,attack.attackEventId)
          playerHeavyWeaponContext(weapon)
          playerLanceWeaponContext(weapon,(spatialWeaponResolution(gs.getState(),'player',attack.targetId)?.distanceFeet??distanceCells(player.position,gs.getEntity(attack.targetId)!.position)*5)/5)
          if(strictHero())preflightNetAttack(weapon,{newAttackAction,nonlethal:attack.nonlethal},gs.getEntity(attack.targetId)!)
          if(weapon.ammunitionType&&!actionScopeId)throw new rules.RuleViolation('ATTACK_ACTION_IDENTITY_REQUIRED','Finish the old unwitnessed Attack action before using ammunition.',{})
          const ammunitionPlan=preflightWeaponAmmunition({weapon,weaponItem:carried,ammunitionItemId:attack.ammunitionItemId,
            scopeId:actionScopeId??attack.attackEventId,attackId:attack.attackEventId,sequenceConsumedLoadedHosts})
          ammunitionPlans.push(ammunitionPlan)
          if(ammunitionPlan?.loadedHostItemId)sequenceConsumedLoadedHosts.add(ammunitionPlan.loadedHostItemId)
          const poisonContext=basicPoisonAttackContext({attackId:attack.attackEventId,targetId:attack.targetId,weapon,item:carried,ammunition:ammunitionPlan})
          if(poisonContext?.poison)possiblePoisonHits++
          possiblePlayerPoisonContexts.push(poisonContext?.playerPoison)
          if(weapon.damageType==='fire'&&activeOilCoating(gs.getState(),'creature',attack.targetId))possibleOilFireHits++
          if(carried&&thrown.has(carried.id))throw new rules.RuleViolation('WEAPON_ALREADY_THROWN','This selected sequence cannot attack again with the same physical weapon after throwing it.',{})
          if((attack.attackMode==='thrown'||weapon.properties.includes('ranged')&&weapon.properties.includes('thrown'))&&carried)thrown.add(carried.id)
          })
        }
        preflightAmmunitionSequence(ammunitionPlans)
        preflightPlayerPoisonSequence(possiblePlayerPoisonContexts)
        if(Object.keys(gs.getState().dmTools?.basicPoison?.hits??{}).length+possiblePoisonHits>512)throw new rules.RuleViolation('BASIC_POISON_HIT_LIMIT','The whole explicit sequence exceeds retained poison-hit capacity before its first die or cost.',{})
        if(Object.keys(gs.getState().dmTools?.oil?.fireReceipts??{}).length+possibleOilFireHits>512)throw new rules.RuleViolation('OIL_FIRE_RECEIPT_LIMIT','The whole explicit fire sequence exceeds retained oil-fire capacity before its first die or cost.',{})
        if(strictHero()) {
          return continuePlayerAttackSequence(preparedAttacks)
        }
        const results = []
        for (const attack of preparedAttacks) {
          const selectedTarget=gs.getMonster(attack.targetId)
          if (selectedTarget&&(!selectedTarget.isAlive||selectedTarget.hp.current===0&&attack.nonlethal)) { results.push({ targetId: attack.targetId, skipped: 'target_defeated' }); continue }
          const response = resolveAttack('player', attack.targetId, attack.weaponOrSpell, undefined, undefined, undefined, undefined, undefined, { ...attack, deferAction: true })
          if ('isError' in response && response.isError === true) return { ...response, isError: true }
          results.push(JSON.parse(response.content[0].text))
        }
        if (strictHero()) { const used=(hero().attackAction?.used??0)+attacks.length; hero().attackAction={used,remaining:Math.max(0,2-used)} }
        rules.recordAction('player')
        return { content: [{ type: 'text' as const, text: JSON.stringify({ feature: 'extra_attack', attacks: results, actionSpent: true }) }] }
      } catch (err) { return rules.ruleErrorResult(err) }
    })
  server.tool('resolve_monster_action',
    'Resolves an explicitly selected source monster attack or Multiattack as one action. Choose exact monsterId, actionName and targetId; for a source offering alternatives, supply the complete attackActions sequence. The engine rolls variable counts, each hit/damage and on-hit saves, applies immunities/resistances and consumes only one action. It never guesses a target or an ambiguous sequence. Reactive NPCs must use npc_action.',
    { monsterId: z.string(), actionName: z.string(), targetId: z.string(), attackActions: z.array(z.string()).min(1).max(10).optional(), damageOption: z.number().int().min(0).optional() },
    async input => {
      if (gs.getMonster(input.monsterId)?.controller === 'reactive_npc') return rules.ruleErrorResult(new rules.RuleViolation('NPC_ACTIVATION_REQUIRED', 'Use npc_action for a reactive actor.', {}))
      return resolveMonsterAttackAction(input.monsterId, input.targetId, input.actionName, input.attackActions, { damageOption: input.damageOption })
    })
  // Pure dice roller — the DM can call this for any roll
  server.tool(
    'roll_dice',
    'Rolls dice using standard notation (e.g. "1d20+5", "2d6+3", "1d4"). Returns individual rolls and total.',
    {
      notation: z.string().describe('Dice notation e.g. "1d20+5", "2d6", "1d4-1"'),
    },
    async ({ notation }) => {
      const result = rollDice(notation)
      return {
        content: [{ type: 'text', text: JSON.stringify(result) }],
      }
    }
  )

  // Full attack resolution: roll to-hit vs AC, then damage if hit, apply HP
  server.tool(
    'resolve_attack',
    'Resolves a complete attack: rolls to-hit vs target AC, rolls damage on hit, applies HP changes. Returns structured result.',
    {
      attackerId: z.string().describe('Attacker entity ID'),
      targetId: z.string().describe('Target entity ID'),
      ammunitionItemId:z.string().min(1).optional().describe('Exact owned counted ammunition stack for a real ammunition weapon. No stock or projectile choice is inferred.'),
      newAttackAction:z.boolean().optional().describe('Explicitly abandon remaining attacks and start a different Attack action, using a real available action credit such as Action Surge. Primary player attack only.'),
      weaponOrSpell: z.string().describe('Explicit player weapon ID or exact label. For an SRD monster use its exact attackName from state; other source actions are not automatically implemented.'),
      weaponHands:z.union([z.literal(1),z.literal(2)]).optional().describe('Choose one or two hands for this real player weapon attack. Versatile defaults to one; Two-Handed requires two with the other hand free. Omit on unarmed or sourced monster attacks.'),
      weaponAbility:z.enum(['str','dex']).optional().describe('For an actual finesse player weapon only: explicitly choose the same STR or DEX for attack and damage. Omitted keeps the engine’s compatible higher-stat default, not a mandatory RAW choice.'),
      attackMode:WeaponAttackModeSchema.optional().describe('Explicit thrown mode is required to throw a held melee weapon with the thrown property; otherwise melee weapons use their exact registered melee reach. Omit for bows or sourced monsters.'),
      nonlethal:z.boolean().optional().describe('Explicitly declare knockout before a player melee attack. If it actually reduces the living target to 0 HP, the target becomes unconscious and stable. Refused for thrown/ranged attacks or unconsciousness immunity.'),
      ...roleplayBonusFields,
      advantage: z.boolean().optional().describe('Roll with advantage (roll twice, take higher) when justified by rules or circumstances. For creative/descriptive roleplay rewards use roleplayBonus instead.'),
      disadvantage: z.boolean().optional().describe('Roll with disadvantage (roll twice, take lower)'),
      advantageReason: z.string().optional().describe('One short sentence explaining the rule or circumstance that justifies advantage/disadvantage. Logged in the combat log.'),
      customDamageDice: z.string().optional().describe('Override damage dice (e.g. "2d8+4")'),
      rangeCells: z.number().int().positive().optional().describe('Legacy override only where no registered weapon/source profile applies. Registered weapon normal/long ranges cannot be replaced; SRD hero attacks forbid this argument.'),
    },
    async ({ attackerId, targetId, weaponOrSpell,attackMode,nonlethal,weaponHands,weaponAbility,ammunitionItemId,newAttackAction, advantage, disadvantage, advantageReason, customDamageDice, rangeCells, roleplayBonus, roleplayReason }) => {
      if (gs.getMonster(attackerId)?.controller === 'reactive_npc') return rules.ruleErrorResult(new rules.RuleViolation('NPC_ACTIVATION_REQUIRED', 'Use npc_action for this actor.', {}))
      return resolveAttack(attackerId, targetId, weaponOrSpell, advantage, disadvantage, customDamageDice, rangeCells, advantageReason, { roleplayBonus, roleplayReason,attackMode,nonlethal,weaponHands,weaponAbility,ammunitionItemId,newAttackAction })
    }
  )

  server.tool(
    'resolve_player_attack',
    'Resolves the player attack. Use this for natural-language targets such as nearest, right, left, front, back, or wounded; the tool selects the real monster ID before applying attack rules.',
    {
      cleaving:z.boolean().optional().describe('Explicit DMG2014 optional cleaving adoption for this exact lethal ordinary five-foot ground player melee/unarmed attack. Requires exact targetId and a real full-HP individual origin; no nonlethal/poison/rider/3D/group. Only the original attack rolls/spends. After a qualifying zero-HP surplus, choose each next carry target or stop explicitly with resolve_cleaving; no automatic chain, new d20/damage roll or secondary attack cost.'),
      targetId: z.string().optional().describe('Exact monster ID if already known.'),
      targetName: z.string().optional().describe('Exact monster name or type, chosen by the agent. No sentence parsing or partial-name guessing. Prefer targetId.'),
      targetHint: z.enum(['nearest', 'right', 'left', 'front', 'back', 'wounded']).optional().describe('Spatial/semantic target hint when the player did not name an exact monster ID.'),
      weaponOrSpell: z.string().describe('Explicit carried weapon ID/exact label, or unarmed. No automatic weapon choice. Use cast_spell for spells.'),
      ammunitionItemId:z.string().min(1).optional().describe('Exact owned counted ammunition stack required for an ammunition weapon. Each actual attack expends one, even on a miss.'),
      newAttackAction:z.boolean().optional().describe('Explicitly start a new Attack action with a real remaining action credit, abandoning an earlier remaining Extra Attack. Loading is limited separately for each actual action.'),
      weaponHands:z.union([z.literal(1),z.literal(2)]).optional().describe('Choose one or two hands for this real player weapon attack. Versatile defaults to one; Two-Handed requires two with the other hand free. Omit on unarmed or sourced monster attacks.'),
      weaponAbility:z.enum(['str','dex']).optional().describe('For an actual finesse player weapon only: same chosen STR or DEX for attack and damage. Omitted retains the compatible higher-stat engine default.'),
      attackMode:WeaponAttackModeSchema.optional().describe('Choose thrown explicitly for an actual held melee weapon with the published thrown property. A melee weapon otherwise uses its melee reach. Omit for ranged registry profiles, including physical ranged darts and nets.'),
      nonlethal:z.boolean().optional().describe('Explicit pre-attack choice to knock a living monster unconscious and stable when this real melee attack reduces it to 0 HP. No ranged/thrown knockout or corpse revival.'),
      ...roleplayBonusFields,
      advantage: z.boolean().optional().describe('Roll with advantage when justified by rules or circumstances. For creative/descriptive roleplay rewards use roleplayBonus instead.'),
      disadvantage: z.boolean().optional().describe('Roll with disadvantage.'),
      advantageReason: z.string().optional().describe('One short sentence explaining the rule or circumstance that justifies advantage/disadvantage. Logged in the combat log.'),
      customDamageDice: z.string().optional().describe('Override damage dice.'),
      rangeCells: z.number().int().positive().optional().describe('Legacy override only where no registered weapon/source profile applies. Registered weapon normal/long ranges cannot be replaced; SRD hero attacks forbid this argument.'),
    },
    async input => {
      return resolvePlayerAttack(input)
    }
  )

  server.tool(
    'cast_spell',
    'Casts a known spell with a slot of its own level by default, or an explicitly selected slotLevel 1-4 (never automatically picks a higher slot). Long spells and rituals BEGIN a persistent concentration incantation without effects or slot spending: use continue_casting for real work and finish_casting when ready; combat requires an action each turn and real rounds. Rituals add ten minutes and never upcast. Other spells resolve supported effects now. Dimension Door requires exact toCell, Divination its owned materialItemId. Utility narration stays within srdNote; never narrate success before the result.',
    {
      lightObject:LightObjectSelectionSchema.optional().describe('Required only for Light: exact existing measured scene object within actual touch; optional explicit aesthetic color. No creature/caster, inventory/hostile bearer or point fallback.'),
      invalidTargetRule:z.literal('xge-2014').optional().describe('Explicit MJ adoption for this direct player level-one Charm Person only. Requires invalidTargetEventId and one targetId. Otherwise strict target preflight remains the default. Apparent successful saves reveal neither a fabricated die nor target validity.'),
      invalidTargetEventId:z.string().min(1).max(100).regex(/^[a-zA-Z0-9][a-zA-Z0-9_:.-]*$/).optional().describe('Exact original cast event under invalidTargetRule. Replay retains its input and does not spend a second slot/action. Never reuse for another cast.'),
      alarmWard:AlarmWardSelectionSchema.optional().describe('Required for Alarm: kind door with exact existing doorId, or kind ground_cube with one exact ground cell (5-foot cube), mental mode, and explicit exemptCreatureIds. Windows, larger cubes, elevated placements and audible mode are outside this slice.'),
      spellObservers:SpellObserversSchema.optional().describe('Explicit original observers/channels; hearing V requires its actual source-voice scene qualification. Tracks this real cast only, never identifies spell/level/hidden target or creates senses.'),
      spellId: z.string().optional().describe('Exact spell id (e.g. "magic-missile", "cure-wounds") if known.'),
      nonlethal: z.boolean().optional().describe('Explicit knockout choice before the initial Spiritual Weapon melee spell attack against one exact targetId. Omit for creation without an attack and every other currently registered spell, even when false. Never becomes a lasting default on the weapon.'),
      spellName: z.string().optional().describe('Natural-language spell name from the player (e.g. "projectile magique"). Prefer this when the player names a spell.'),
      targetId: z.string().optional().describe('Exact creature ID for a targeted spell. Charm Person also accepts visible narrative NPC IDs with an authored SRD block; a failed Wisdom save records who is charmed by whom for one hour. Upcasting requires explicit targetIds, at most one per slot level, within 30 feet of each other. It grants friendly acquaintance, never automatic obedience or clue disclosure.'),
      targetName: z.string().optional().describe('Exact monster name/type chosen by the agent; prefer targetId. Enemy spells require an explicit target.'),
      waterEffect: WaterEffectSchema.optional().describe('Required for create-water ONLY: freely describe the narrative consequence and its explicit cell. Interpret the player creative use from the scene within srdNote; no predefined modes. No enemy target. This text never changes HP, inventory, doors or conditions.'),
      slotLevel: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).optional(),
      toCell: z.object({ x: z.number().int().nonnegative(), y: z.number().int().nonnegative() }).strict().optional(),
      condition: z.enum(['blinded', 'deafened', 'paralyzed', 'poisoned']).optional(),
      materialItemId: z.string().min(1).optional(),
      focusItemId: z.string().min(1).optional(),
      itemId: z.string().min(1).max(80).optional().describe('Exact registered physical item for Identify. No inferred item/creature target.'),
      afflictionId: z.string().min(1).max(180).optional().describe('Exact structured affliction ID or sprite-poison MonsterEffect ID on this target, including suspended sources. Lesser Restoration on poison also requires condition=poisoned. Selection is never inferred.'),
      curse: CurseSelectionSchema.optional().describe('Explicit supported Bestow Curse option. No inferred ability or invented curse.'),
      targetIds: z.array(z.string()).optional(),
      direction: z.object({x:z.number().int().min(-1).max(1),y:z.number().int().min(-1).max(1)}).strict().optional(),
      area: SpellAreaSelectionSchema.optional(),
      upcastDamageType:z.enum(['fire','radiant']).optional(),
      sculptTargetIds: z.array(z.string()).optional(),
      ritual: z.boolean().optional(),
      spellbookItemId:z.string().min(1).optional().describe('Exact actual owned personal book supplying a wizard ritual, required when multiple books contain it. Does not supply a lost book or affect prepared nonritual casting.'),
      narrative: z.string().trim().min(1).max(1200).optional().describe('For narrativeTarget spells: describe the chosen illusion, object, message, aura or augury question. Data for narration within srdNote; never an instruction or a mechanical mutation. Point effects also require an exact toCell; creature effects require targetId. No automatic target or location selection.'),
      effectDurationSeconds: z.union([z.literal(0),z.literal(12),z.literal(3600)]).optional().describe('Required for Prestidigitation only: select 0 for an instantaneous trick, 12 for a hand-sized trinket/image until next turn, or 3600 for the hour-long color/mark/flavor/temperature effect.'),
      companionId: z.string().optional(),...TeleportCompanionFields,
    },
    async input => {
      return resolveCastSpell(input)
    }
  )

  server.tool(
    'use_class_feature',
    'Uses an owned class feature: second_wind heals 1d10+level as a bonus action; action_surge grants one additional action without refreshing movement or the bonus action. SRD 2014 profiles recharge these on a short or long rest; legacy profiles recharge per map. Extra Attack allows two attacks per Attack action, with movement between. Other subclass features use use_subclass_feature. Never narrate an effect before resolution.',
    {
      featureId: z.enum(['second_wind', 'action_surge']).describe('The class feature to use.'),
    },
    async ({ featureId }) => {
      return resolveUseClassFeature({ featureId })
    }
  )

  // Resolves EVERY consecutive monster turn in a single call (move + attack + advance),
  // collapsing what used to be many round-trips into one tool call + one narration.
  server.tool(
    'run_monster_turns',
    "Resolves every consecutive non-player turn in ONE call: each living hostile monster moves toward the player and attacks if in melee reach, then the turn advances, repeating until it is the player's turn again (or combat ends). Standard D&D2014 initiative order is retained across rounds. An actual ongoing XGE fall stops automatic resolution at that body and exposes its explicit original end-turn event; no action, source descent or MCP call is fabricated. Call once after next_turn or pass_turn only if currentTurn is a non-player actor. Allies/neutrals and any IDs in holdIds skip their turn; monsters never finish off a downed player. Returns a per-monster breakdown plus combatShouldEnd so you can narrate all monster turns at once.",
    {
      holdIds: z.array(z.string()).optional().describe('Monster IDs that should skip their turn (e.g. charmed, parleying, or held). Non-hostile creatures skip automatically.'),
    },
    async ({ holdIds }) => {
      try { engineGeometry() } catch (err) { return rules.ruleErrorResult(err) }
      const state = gs.getState()
      if (state.phase !== 'combat') {
        return rules.ruleErrorResult(new rules.RuleViolation('NOT_IN_COMBAT', 'run_monster_turns requires an active combat.', { phase: state.phase }))
      }
      if (isSurvivalDayDue()) return { content: [{ type: 'text', text: JSON.stringify({
        survivalEventDue: true, turnsResolved: 0, resolvedTurns: [], currentTurn: state.currentTurn,
        round: state.round, initiativeOrder: state.initiativeOrder, combatShouldEnd: Boolean(state.player.deathSaves?.dead),
      }) }] }
      if (!state.currentTurn) {
        return rules.ruleErrorResult(new rules.RuleViolation('EMPTY_INITIATIVE', 'No active turn to resolve.', { initiativeOrder: state.initiativeOrder }))
      }
      if (state.currentTurn === 'player') {
        return rules.ruleErrorResult(new rules.RuleViolation('PLAYER_TURN_ACTIVE', "It is the player's turn. End it first with next_turn or pass_turn, then call run_monster_turns.", { currentTurn: state.currentTurn }))
      }

      const cackleBatch=cackleBatchIssue(state,state.initiativeOrder)
      if(cackleBatch)return rules.ruleErrorResult(new rules.RuleViolation(cackleBatch.code,cackleBatch.message,{}))
      // Validate the explicitly requested consecutive automatic turns before
      // movement, clock, recharge dice or any earlier actor is committed.
      const automaticHold=new Set(holdIds??[]),firstAutomatic=state.initiativeOrder.indexOf(state.currentTurn)
      for(let offset=0;offset<state.initiativeOrder.length;offset++){
        const id=state.initiativeOrder[(firstAutomatic+offset)%state.initiativeOrder.length];if(id==='player'||activeXgeFall(state,id)||chaseParticipant(state,id)||chaseTurnIssue(state))break
        const actor=gs.getMonster(id)
        if(!actor||!isActiveMonster(actor)||actor.hostile===false||automaticHold.has(id)||actor.conditions.some(condition=>INCAPACITATING_CONDITIONS.has(condition)))continue
        const missing=harvestCreatureActionIssue(actor.type,sourceAction(actor,'Multiattack')?'Multiattack':actor.attackName??'')
        if(missing)return rules.ruleErrorResult(new rules.RuleViolation('MONSTER_ACTION_REFERENCE_ONLY',missing,{monsterId:id,monsterType:actor.type}))
        try{const names=sourceAction(actor,'Multiattack')?.actions?.flatMap(entry=>Array.from({length:typeof entry.count==='number'?entry.count:1},()=>entry.action_name))??[actor.attackName??''];for(const[index,name]of names.entries())captureSwallowBite(actor.id,'player',name,`automatic-swallow-${index}`);preflightNativePoisonSequence(names.map((name,index)=>nativePoisonAttackContext(actor.id,'player',name,`automatic-preflight-${index}`)))}catch(err){return rules.ruleErrorResult(err)}
      }
      try {
        assertKnockoutTimeAdvance((state.initiativeOrder.length*4+4)*6,true)
        assertFrigidWaterTimeAdvance(6, true)
      } catch(err) { return rules.ruleErrorResult(err) }
      const hold = new Set(holdIds ?? [])
      if (!isSurvivalDayDue()&&!sewerPlagueEvent(state)&&!dueFrigidWaterSave(state)&&!activeXgeFall(state,state.currentTurn)) startMonsterTurn()
      const resolvedTurns: MonsterTurnRecord[] = []
      const startRound = state.round
      const eventsBefore = completedRoundEvents(state)
      const maxIterations = state.initiativeOrder.length * 4 + 4
      let iterations = 0

      while (iterations < maxIterations) {
        iterations++
        const current = gs.getState()

        if (isSurvivalDayDue()||sewerPlagueEvent(current)||dueFrigidWaterSave(current)||chaseParticipant(current,current.currentTurn??'')||chaseTurnIssue(current)) break
        if(current.currentTurn&&activeXgeFall(current,current.currentTurn))break
        if (current.player.deathSaves?.dead) break
        if (Object.values(current.monsters).filter(isActiveMonster).length === 0) break

        const turn = current.currentTurn
        if (!turn || turn === 'player' || complexTrapTurnDue(current)) break

        const monster = gs.getMonster(turn)
        if(monster&&npcDeathSaveEvent(monster))break
        if (monster?.controller === 'reactive_npc') break // Model decides at this turn; never a second deterministic activation.
        if (!monster || !isActiveMonster(monster)) {
          gs.advanceTurn()
          continue
        }

        resolvedTurns.push(resolveMonsterTurn(turn, hold))
        if(strictHero()&&hero().pending)break
        gs.advanceTurn()
      }

      const after = gs.getState()
      const livingMonsters = Object.values(after.monsters).filter(isActiveMonster)
      const npcDeathSaveEvents=dueNpcDeathSaveEvents()
      const playerDead = Boolean(after.player.deathSaves?.dead)
      const playerDown = after.player.hp.current <= 0 && !playerDead

      const plagueEvent = sewerPlagueEvent(after)
      const frigidWaterEvent = dueFrigidWaterSave(after)
      const summary = {
        ...(plagueEvent ? { sewerPlagueEvent: plagueEvent } : {}),
        ...(frigidWaterEvent ? { frigidWaterEvent } : {}),
        xgeFallEndTurnEvent:dueXgeFallDescent(after)??null,
        fallingBodyTurn:after.currentTurn&&activeXgeFall(after,after.currentTurn)?{entityId:after.currentTurn,episodeId:activeXgeFall(after,after.currentTurn)!.input.eventId,notice:'Only the original physical descent is retained for a corpse; no active action, new initiative roll, save, healing or server MCP call.'}:null,
        npcDeathSaveEvents,
        ...(strictHero()&&hero().pending?{pendingReaction:hero().pending}:{}),
        ...(isSurvivalDayDue()?{survivalEventDue:true}:{}),
        complexTrapTurn:inspectComplexTrapTurn(after),
        turnsResolved: resolvedTurns.length,
        roundEvents: Object.values(completedRoundEvents(after)).filter(event => !eventsBefore[event.eventId]),
        resolvedTurns,
        currentTurn: after.currentTurn,
        round: after.round,
        initiativeOrder: after.initiativeOrder,
        roundsAdvanced: after.round - startRound,
        player: {
          hp: after.player.hp,
          position: after.player.position,
          conditions: after.player.conditions,
          down: playerDown,
          dead: playerDead,
        },
        monstersRemaining: livingMonsters.length,
        chase:activeChase(after)?{chaseId:activeChase(after)!.id,dueEvent:chaseTurnIssue(after),manualChaseTurn:chaseParticipant(after,after.currentTurn??'')?.id??null}:null,
        combatShouldEnd: (livingMonsters.length === 0 || playerDead)&&npcDeathSaveEvents.length===0&&!xgeFallingTransitionIssue(after),
      }

      return { content: [{ type: 'text', text: JSON.stringify(summary) }] }
    }
  )

  // Ability checks and saving throw resolution
  server.tool(
    'roll_ability_check',
    'Rolls a D&D ability or skill check for an entity against an optional DC. Use this for Persuasion, Intimidation, Athletics, Perception, forcing doors, searching, and other checks. Do not use resolve_saving_throw for skill checks.',
    {
      entityId: z.string().optional().describe('Entity making the check; defaults to player.'),
      targetId: z.string().optional().describe('Exact social targetId for Persuasion, Intimidation or Deception. REQUIRED when influencing a creature: validates its authored influenceability restrictions. Never infer or omit a target to bypass a refusal. Pending encounter actors use encounter:<encounterId>:<monsterIndex>.'),
      ability: z.enum(['str', 'dex', 'con', 'int', 'wis', 'cha']).describe('Ability used for the check.'),
      dc: z.number().int().optional().describe('Base Difficulty Class from the module or MJ. For social requests use resolve_social_request and the actual DMG2014 attitude table.'),
      skill: z.string().optional().describe('Canonical skill id (e.g. "stealth", "persuasion", "perception"). When given for the player, the engine derives proficiency/expertise from the character sheet and IGNORES the proficient/expertise flags (anti-cheat).'),
      sightBased: z.boolean().optional().describe('Explicitly selected by the agent when this check relies on sight, for tracked disease penalties. For looking/searching toward a cell use resolve_visual_perception so actual lighting is resolved too. Never infer sensory mode from words or a skill name.'),
      perceptionSense:z.enum(['sight','hearing','other']).optional().describe('Explicit sensory mode of canonical Perception. Required before any die when established weather can affect its senses differently; never inferred from a label or player text.'),
      proficient: z.boolean().optional().describe('Whether to add proficiency bonus. Defaults false. Ignored when a known skill is given for the player.'),
      expertise: z.boolean().optional().describe('Whether to add double proficiency bonus. Defaults false. Ignored when a known skill is given for the player.'),
      label: z.string().optional().describe('Short label such as Persuasion, Intimidation, Athletics, or Perception.'),
      ...roleplayBonusFields,
      advantage: z.boolean().optional().describe('Roll with advantage (two d20, keep higher) when justified by rules or circumstances, not as a roleplay reward. Requires advantageReason.'),
      disadvantage: z.boolean().optional().describe('Roll with disadvantage (two d20, keep lower), e.g. when the approach clashes with the established fiction. Requires advantageReason.'),
      advantageReason: z.string().optional().describe('One short sentence explaining the rule or circumstance that justifies advantage/disadvantage. REQUIRED when advantage or disadvantage is set; logged for traceability.'),
    },
    async input => {
      try {
        if(strictHero())return heroAbilityCheck(input)
        const result = resolveAbilityCheck(input)
        return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] }
      } catch (err) {
        return rules.ruleErrorResult(err)
      }
    }
  )

  server.tool(
    'resolve_saving_throw',
    'Resolves a D&D 5e saving throw for an entity against a DC.',
    {
      entityId: z.string().describe('Entity making the saving throw'),
      ability: z.enum(['str', 'dex', 'con', 'int', 'wis', 'cha']).describe('Ability score for the save'),
      dc: z.number().int().describe('Difficulty Class to beat'),
      onFailure: z.string().optional().describe('Description of what happens on failure'),
      magical: z.boolean().optional().describe('The saving throw is caused by a spell or magical effect; applies source Magic Resistance automatically.'),
      againstCondition: z.enum(['charmed', 'frightened','poisoned']).optional().describe('Explicit source condition for saving throw advantage.'),
      originId: z.string().optional().describe('Exact source actor of this save; choose this OR originCell. Required for DEX when a declared cover could apply.'),
      originCell: z.object({x:z.number().int().nonnegative(),y:z.number().int().nonnegative()}).strict().optional().describe('Actual effect origin, such as an area center; choose this OR originId.'),
    },
    async ({ entityId, ability, dc, onFailure, magical, againstCondition, originId, originCell }) => {
      if(originId!==undefined&&originCell!==undefined)return rules.ruleErrorResult(new rules.RuleViolation('COVER_ORIGIN_AMBIGUOUS','Choose originId OR originCell, never both.',{}))
      const origin=originId??originCell
      if(strictHero()){try{return heroSavingThrow({entityId,ability,dc,magical,againstCondition,origin})}catch(err){return rules.ruleErrorResult(err)}}
      const entity = gs.getEntity(entityId)
      if (!entity) {
        return rules.ruleErrorResult(new rules.RuleViolation('ENTITY_NOT_FOUND', `Entity not found: ${entityId}`, {
          entityId,
        }))
      }
      try {
        rules.validateSavingThrow(entityId)
      } catch (err) {
        return rules.ruleErrorResult(err)
      }

      const resolved = savingThrow(entityId, ability, dc, magical, againstCondition, origin)
      const roll = resolved.roll
      const success = resolved.success

      const mechanicalSummary = `JS ${ability.toUpperCase()}: ${roll.detail} vs DD ${dc} → ${success ? 'SUCCÈS' : 'ÉCHEC'}${!success && onFailure ? ` | ${onFailure}` : ''}`

      const result: SavingThrowResult = {
        entityId,
        ability: ability as keyof EntityStats,
        dc,
        roll,
        success,
        mechanicalSummary,
      }

      gs.addLogEntry({
        round: gs.getState().round,
        turn: gs.getState().currentTurn ?? entityId,
        action: `${entity.name} — Jet de sauvegarde ${ability.toUpperCase()} DD ${dc}`,
        mechanicalDetail: mechanicalSummary,
      })

      return { content: [{ type: 'text', text: JSON.stringify(result) }] }
    }
  )

  server.tool(
    'roll_death_save',
    'Resolve one actual start-of-turn death save, without spending the normal action. Player outside combat needs the exact due eventId from inspect_player_life (actual damage/suffocation episode, or explicit present checkpoint for an unresolved legacy body). Player combat uses its actual due turn key, optionally omitted; exact retries replay without another die, HP or action. NPC needs its exact entityId/eventId. Natural20 normally restores1HP and leaves the normal action; absent air blocks HP/stability. Natural1 adds2failures, three successes normally stabilize, three failures kill. No source history, CON modifier, activation or automatic end of turn.',
    {entityId:z.string().min(1).max(180).optional(),eventId:z.string().min(1).max(500).optional()},
    async ({entityId,eventId}) => {
      if(entityId&&entityId!=='player')return toolkitTransaction(()=>{
        if(!eventId)throw new rules.RuleViolation('NPC_DEATH_SAVE_EVENT_REQUIRED','Select the exact due engine eventId for this NPC, not a client nonce.',{entityId})
        return resolveNpcDeathSave({entityId,eventId})
      })
      return toolkitTransaction(()=>{
      const replay=replayedPlayerDeathSave(eventId)
      if(replay)return toolkitResult(replay)
      const context=preparePlayerDeathSave(eventId)
      if(strictHero())inspectExhaustion('player')

      const roll = strictHero()?rollRuleD20('player','save',0,effects('beacon-of-hope','player').length>0,false):rollDice('1d20')
      const naturalRoll = roll.rolls[0] ?? roll.total
      const saveBonus=strictHero()?bonusOnRoll('save','player')+magicSaveBonus():0
      if(saveBonus){roll.total+=saveBonus;roll.modifier+=saveBonus;roll.detail+=` | Bonus de sauvegarde +${saveBonus}`}
      const deathSave = gs.rollPlayerDeathSave(naturalRoll,saveBonus,context.eventId)
      const outcome = deathSave.recoveryBlocked && naturalRoll === 20
        ? 'SUCCES : reprise de PV bloquée par absence d’air'
        : deathSave.afflictionHealingBlocked && naturalRoll === 20
        ? 'SUCCES : reprise de PV bloquée par le plafond de soin de l’affliction'
        : deathSave.criticalSuccess
        ? 'CRITIQUE: le joueur reprend 1 PV'
        : deathSave.criticalFailure
          ? 'ECHEC CRITIQUE: deux echecs'
          : deathSave.success
            ? 'SUCCES'
            : 'ECHEC'
      const status = deathSave.dead
        ? 'mort'
        : deathSave.stable
          ? 'stable'
          : deathSave.hpAfter > 0
            ? 'conscient'
            : `${deathSave.successes} succes / ${deathSave.failures} echecs`
      const mechanicalSummary = `Jet de mort: ${roll.detail} -> ${outcome} | ${status}`

      gs.addLogEntry({
        round: gs.getState().round,
        turn: 'player',
        action: 'Jet de sauvegarde contre la mort',
        mechanicalDetail: mechanicalSummary,
      })

      const result={...deathSave,roll,mechanicalSummary,eventId:context.eventId,episodeId:context.episodeId,scope:context.scope,at:context.at,actionSpent:false}
      completePlayerDeathSave(context,result)
      return toolkitResult(result)
      })
    }
  )

  // Apply a D&D 5e condition to an entity
  server.tool(
    'apply_condition',
    'Applies a D&D 5e condition (poisoned, prone, stunned, etc.) to an entity.',
    {
      entityId: z.string().describe('Target entity ID'),
      condition: z.enum([
        'blinded', 'charmed', 'deafened', 'frightened', 'grappled',
        'incapacitated', 'invisible', 'paralyzed', 'petrified', 'poisoned',
        'prone', 'restrained', 'stunned', 'unconscious', 'exhaustion',
      ]).describe('Condition to apply'),
    },
    async ({ entityId, condition }) => {
      try {
        if(condition==='exhaustion')throw new rules.RuleViolation('DEDICATED_TOOL_REQUIRED','Use the explicit leveled exhaustion tool; a boolean condition cannot select a level.',{})
        rules.validateConditionTarget(entityId)
        const applied = gs.applyCondition(entityId, condition as Condition)
        const entity = gs.getEntity(entityId)
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ success: true, ...applied, entityId, condition, entityConditions: entity?.conditions,
              mechanicalSummary: applied.immune ? `Immunité à ${condition} : aucun état appliqué.` : `État ${condition} appliqué.` }),
          }],
        }
      } catch (err) {
        return rules.ruleErrorResult(err)
      }
    }
  )
}
