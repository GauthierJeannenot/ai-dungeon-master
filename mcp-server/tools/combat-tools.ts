import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { rollDice, getAbilityModifier, d20WithModifier, rollD20WithAdvantage } from '../dice'
import * as gs from '../game-state'
import * as rules from '../rules'
import { EntityStats, AttackResult, SavingThrowResult, AbilityCheckResult, Condition, PlayerState, MonsterState } from '../../lib/types'
import { getWeapon, resolveWeapon, attackAbilityFor } from '../../lib/srd/weapons'
import { resolveSpell, type SpellSpec } from '../../lib/srd/spells'
import { getSkill } from '../../lib/srd/skills'

// Dé de dégâts d'une arme (source de vérité : lib/srd/weapons.ts). Repli '1d6'
// pour un nom d'arme inconnu du registre (comportement historique conservé).
function getWeaponDamage(weaponOrSpell: string): string {
  const key = weaponOrSpell.toLowerCase().replace(/\s+/g, '')
  return getWeapon(key)?.damageDie ?? '1d6'
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

  if (normalizedName === query || normalizedName.includes(query) || query.includes(normalizedName)) return true
  if (translatedType === query || translatedType.includes(query) || query.includes(translatedType)) return true

  const genericTerms = new Set(['le', 'la', 'les', 'un', 'une', 'des', 'du', 'de', 'gobelin', 'gobelins', 'garde', 'gardes', 'chef'])
  const terms = query
    .split(/[^a-z0-9']+/)
    .filter(term => term.length >= 4 && !genericTerms.has(term))

  return terms.some(term => normalizedName.includes(term) || translatedType.includes(term))
}

export function selectPlayerTarget(
  targetId: string | undefined,
  targetName: string | undefined,
  targetHint: TargetHint | undefined
): string {
  if (targetId) return targetId

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

  return candidates[0].id
}

export function resolveAttack(
  attackerId: string,
  targetId: string,
  weaponOrSpell: string,
  advantage?: boolean,
  disadvantage?: boolean,
  customDamageDice?: string,
  rangeCells?: number,
  advantageReason?: string
) {
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

  try {
    rules.validateAttack(attackerId, targetId, weaponOrSpell, rangeCells)
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
  const profBonus = 'proficiencyBonus' in attacker ? attacker.proficiencyBonus : 2
  const attackBonus = 'attackBonus' in attacker ? attacker.attackBonus : (abilityMod + profBonus)
  const targetDistance = distanceCells(attacker.position, target.position)
  const unconsciousMeleeTarget = target.conditions.includes('unconscious') && targetDistance <= 1
  const effectiveAdvantage = Boolean(advantage || unconsciousMeleeTarget)

  const attackRoll = rollD20WithAdvantage(attackBonus, effectiveAdvantage, disadvantage)
  // Raison d'un avantage/désavantage accordé par le DM (RP de qualité, position
  // désavantageuse…) : journalisée pour la traçabilité, sans effet mécanique
  // au-delà du flag lui-même.
  const advantageNote = advantageReason?.trim() && effectiveAdvantage !== Boolean(disadvantage)
    ? ` | ${effectiveAdvantage ? 'AVANTAGE' : 'DESAVANTAGE'}: ${advantageReason.trim()}`
    : ''

  const targetAC = target.ac
  const naturalRoll = attackRoll.rolls[0]
  const criticalMiss = naturalRoll === 1
  const naturalCriticalHit = naturalRoll === 20
  const hit = naturalCriticalHit || (!criticalMiss && attackRoll.total >= targetAC)
  const criticalHit = naturalCriticalHit || (hit && unconsciousMeleeTarget && !criticalMiss)

  let damageRoll = undefined
  let damageDealt = undefined
  let targetHpAfter = undefined
  let targetDied = false
  let targetStatusDetail = ''

  if (hit) {
    const abilityModDamage = getAbilityModifier(attacker.stats[attackAbilityKey])
    const baseDamage = customDamageDice ?? ('damageDice' in attacker ? attacker.damageDice : withDamageMod(getWeaponDamage(weaponOrSpell), abilityModDamage))
    damageRoll = rollDice(criticalHit ? doubleDiceNotation(baseDamage) : baseDamage)

    damageDealt = Math.max(1, damageRoll.total)

    if (targetId === 'player') {
      const playerWasDying = target.hp.current <= 0
      let updated = gs.updatePlayerHP(-damageDealt)
      if (playerWasDying && criticalHit && !updated.deathSaves?.dead) {
        updated = gs.updatePlayerHP(-1)
      }
      targetHpAfter = updated.hp.current
      targetDied = Boolean(updated.deathSaves?.dead)
      if (targetDied) {
        targetStatusDetail = ' | MORT'
      } else if (updated.hp.current <= 0) {
        targetStatusDetail = ` | A TERRE (${updated.deathSaves?.successes ?? 0} succes, ${updated.deathSaves?.failures ?? 0} echecs mort)`
      }
    } else {
      const updated = gs.updateMonsterHP(targetId, -damageDealt)
      targetHpAfter = updated.hp.current
      targetDied = !updated.isAlive
      if (targetDied) targetStatusDetail = ' | MORT'
    }
  }

  const mechanicalSummary = hit
    ? `Attaque: ${attackRoll.detail} vs CA ${targetAC} -> ${criticalHit ? 'CRITIQUE' : 'TOUCHE'} | Degats: ${damageRoll!.detail}${targetStatusDetail}${advantageNote}`
    : `Attaque: ${attackRoll.detail} vs CA ${targetAC} -> ${criticalMiss ? 'ECHEC CRITIQUE' : 'RATE'}${advantageNote}`

  const result: AttackResult = {
    attackerId,
    targetId,
    weaponOrSpell,
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
  }

  gs.addLogEntry({
    round: gs.getState().round,
    turn: attackerId,
    action: `${attacker.name} attaque ${target.name} avec ${weaponOrSpell}`,
    mechanicalDetail: mechanicalSummary,
  })
  rules.recordAction(attackerId)

  return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] }
}

export interface ResolvePlayerAttackInput {
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
}: ResolvePlayerAttackInput) {
  try {
    const resolvedTargetId = selectPlayerTarget(targetId, targetName, targetHint ?? 'nearest')
    return resolveAttack('player', resolvedTargetId, weaponOrSpell ?? 'longsword', advantage, disadvantage, customDamageDice, rangeCells, advantageReason)
  } catch (err) {
    return rules.ruleErrorResult(err)
  }
}

// ── SORTS (cast_spell) ────────────────────────────────────────────────────────
// Le moteur juge le COÛT (sort connu, tour/action, portée, emplacement) et
// résout l'effet fermé. Le LLM ne fait que narrer le résultat. Un sort coûte
// l'ACTION ; les tours de magie (niveau 0) ne consomment pas d'emplacement.

export interface CastSpellInput {
  spellId?: string
  spellName?: string
  targetId?: string
  targetName?: string
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

export function resolveCastSpell({ spellId, spellName, targetId, targetName }: CastSpellInput) {
  const player = gs.getPlayer()
  const spell = resolveSpell(spellId ?? spellName)

  if (!spell) {
    return rules.ruleErrorResult(new rules.RuleViolation('SPELL_UNKNOWN', `Unknown spell: "${spellId ?? spellName ?? ''}".`, { spellId, spellName }))
  }
  if (!player.knownSpells?.includes(spell.id)) {
    return rules.ruleErrorResult(new rules.RuleViolation('SPELL_NOT_KNOWN', `The player does not know ${spell.label}.`, { spellId: spell.id, known: player.knownSpells ?? [] }))
  }

  // Économie d'action : un sort coûte l'action (vérification seule ici).
  try {
    rules.validateActionUse('player')
  } catch (err) {
    return rules.ruleErrorResult(err)
  }

  // Cible (pour les sorts ciblés) et portée.
  let target: PlayerState | MonsterState | undefined
  const needsEnemy = spell.effect.kind === 'attack_roll' || spell.effect.kind === 'save' || spell.effect.kind === 'auto_hit' || spell.effect.kind === 'condition'
  if (needsEnemy) {
    try {
      const resolvedTargetId = selectPlayerTarget(targetId, targetName, 'nearest')
      target = gs.getMonster(resolvedTargetId)
    } catch (err) {
      return rules.ruleErrorResult(err)
    }
    if (!target) {
      return rules.ruleErrorResult(new rules.RuleViolation('TARGET_NOT_FOUND', 'No valid target for this spell.', { targetId, targetName }))
    }
    const distance = rules.distanceCells(player.position, target.position)
    if (distance > spell.rangeCells) {
      return rules.ruleErrorResult(new rules.RuleViolation('TARGET_OUT_OF_RANGE', `${target.name} is ${distance} cells away; ${spell.label} range is ${spell.rangeCells} cells.`, { distance, rangeCells: spell.rangeCells }))
    }
  }

  // Emplacement disponible pour les sorts de niveau ≥ 1 (tours de magie exemptés).
  if (spell.level >= 1 && (!player.spellSlots || player.spellSlots.level1.current <= 0)) {
    return rules.ruleErrorResult(new rules.RuleViolation('SPELL_SLOTS_EXHAUSTED', `No level-1 spell slot remaining for ${spell.label}.`, { spellId: spell.id }))
  }

  // ── COMMIT : à partir d'ici, on débite et on résout ──────────────────────────
  if (spell.level >= 1) gs.consumeSpellSlot(1)
  if (gs.getState().phase === 'combat' && gs.getState().currentTurn === 'player') {
    rules.recordAction('player')
  }

  const result = applySpellEffect(spell, player, target)
  gs.addLogEntry({
    round: gs.getState().round,
    turn: gs.getState().currentTurn ?? 'player',
    action: `${player.name} lance ${spell.label}`,
    mechanicalDetail: result.mechanicalSummary,
  })

  return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] }
}

function applySpellEffect(spell: SpellSpec, player: PlayerState, target: PlayerState | MonsterState | undefined) {
  const mod = spellcastingMod(player)
  const effect = spell.effect

  switch (effect.kind) {
    case 'attack_roll': {
      const attackBonus = mod + player.proficiencyBonus
      const roll = rollDice(d20WithModifier(attackBonus))
      const natural = roll.rolls[0]
      const critMiss = natural === 1
      const critHit = natural === 20
      const hit = critHit || (!critMiss && roll.total >= (target?.ac ?? 0))
      let damageRoll
      let targetHpAfter
      let targetDied = false
      if (hit && target) {
        damageRoll = rollDice(critHit ? doubleDiceNotation(effect.damage) : effect.damage)
        const updated = gs.updateMonsterHP(target.id, -Math.max(1, damageRoll.total))
        targetHpAfter = updated.hp.current
        targetDied = !updated.isAlive
      }
      const summary = hit
        ? `${spell.label}: ${roll.detail} vs CA ${target?.ac} -> ${critHit ? 'CRITIQUE' : 'TOUCHE'} | Degats: ${damageRoll!.detail}${targetDied ? ' | MORT' : ''}`
        : `${spell.label}: ${roll.detail} vs CA ${target?.ac} -> ${critMiss ? 'ECHEC CRITIQUE' : 'RATE'}`
      return { spell: spell.id, effect: 'attack_roll', hit, roll, damageRoll, targetId: target?.id, targetHpAfter, targetDied, mechanicalSummary: summary }
    }
    case 'auto_hit': {
      const damageRoll = rollDice(effect.damage)
      let targetHpAfter
      let targetDied = false
      if (target) {
        const updated = gs.updateMonsterHP(target.id, -Math.max(1, damageRoll.total))
        targetHpAfter = updated.hp.current
        targetDied = !updated.isAlive
      }
      const summary = `${spell.label}: touche automatique | Degats: ${damageRoll.detail}${targetDied ? ' | MORT' : ''}`
      return { spell: spell.id, effect: 'auto_hit', hit: true, damageRoll, targetId: target?.id, targetHpAfter, targetDied, mechanicalSummary: summary }
    }
    case 'save': {
      const dc = 8 + player.proficiencyBonus + mod
      const saveMod = target ? getAbilityModifier(target.stats[effect.ability]) : 0
      const roll = rollDice(d20WithModifier(saveMod))
      const saved = roll.total >= dc
      const fullRoll = rollDice(effect.damage)
      const damageDealt = saved ? (effect.halfOnSave ? Math.floor(fullRoll.total / 2) : 0) : fullRoll.total
      let targetHpAfter
      let targetDied = false
      if (target && damageDealt > 0) {
        const updated = gs.updateMonsterHP(target.id, -damageDealt)
        targetHpAfter = updated.hp.current
        targetDied = !updated.isAlive
      }
      const summary = `${spell.label}: JS ${effect.ability.toUpperCase()} ${roll.detail} vs DD ${dc} -> ${saved ? 'REUSSI' : 'RATE'} | Degats: ${damageDealt} (${fullRoll.detail})${targetDied ? ' | MORT' : ''}`
      return { spell: spell.id, effect: 'save', saved, dc, roll, damageDealt, targetId: target?.id, targetHpAfter, targetDied, mechanicalSummary: summary }
    }
    case 'condition': {
      const dc = 8 + player.proficiencyBonus + mod
      const saveMod = target ? getAbilityModifier(target.stats[effect.ability]) : 0
      const roll = rollDice(d20WithModifier(saveMod))
      const saved = roll.total >= dc
      if (target && !saved) gs.applyCondition(target.id, effect.condition)
      const summary = `${spell.label}: JS ${effect.ability.toUpperCase()} ${roll.detail} vs DD ${dc} -> ${saved ? 'REUSSI (aucun effet)' : `RATE (${effect.condition})`}`
      return { spell: spell.id, effect: 'condition', saved, dc, roll, condition: effect.condition, targetId: target?.id, mechanicalSummary: summary }
    }
    case 'heal': {
      const healRoll = rollDice(resolveHealNotation(effect.amount, mod))
      const before = player.hp.current
      const updated = gs.updatePlayerHP(healRoll.total)
      const summary = `${spell.label}: soin ${healRoll.detail} | PV ${before}/${updated.hp.max} -> ${updated.hp.current}/${updated.hp.max}`
      return { spell: spell.id, effect: 'heal', healRoll, hpBefore: before, hpAfter: updated.hp.current, mechanicalSummary: summary }
    }
    case 'utility': {
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
      return { spell: spell.id, effect: 'utility', srdNote: effect.srdNote, worldFact: fact, mechanicalSummary: summary }
    }
  }
}

// ── CAPACITÉS DE CLASSE (use_class_feature) ─────────────────────────────────────

export interface UseClassFeatureInput {
  featureId: 'second_wind'
}

export function resolveUseClassFeature({ featureId }: UseClassFeatureInput) {
  const player = gs.getPlayer()
  if (!player.features?.includes(featureId)) {
    return rules.ruleErrorResult(new rules.RuleViolation('FEATURE_NOT_AVAILABLE', `The player does not have the ${featureId} feature.`, { featureId, features: player.features ?? [] }))
  }

  // Économie d'action bonus (le second souffle coûte l'action bonus).
  try {
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

// Libellé d'arme par type de monstre. Les dégâts et le bonus d'attaque viennent
// TOUJOURS du damageDice/attackBonus du monstre — ceci n'affecte que le texte du log
// et la portée par défaut (un nom inconnu = mêlée 1 case dans rules.ts).
const MONSTER_NATURAL_WEAPON: Record<string, string> = {
  goblin: 'cimeterre',
  goblin_minion: 'cimeterre',
  goblin_boss: 'cimeterre',
  hobgoblin: 'épée',
  hobgoblin_captain: 'épée',
  skeleton: 'épée courte',
  zombie: 'coup',
  violet_fungus: 'touche putride',
  wolf: 'morsure',
  bandit: 'cimeterre',
  dryad: 'gourdin',
  awakened_tree: 'coup',
}

function monsterWeaponLabel(type: string): string {
  return MONSTER_NATURAL_WEAPON[type.toLowerCase()] ?? 'attaque'
}

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
  note?: string
}

// Déplace un monstre case par case vers la cible en respectant le budget de mouvement,
// les limites de la carte et l'occupation (validateMove rejette les cases illégales).
// Monotone par axe : converge sans osciller et s'arrête dès qu'il est au contact, à court
// de mouvement, ou totalement bloqué. Retourne le nombre de cases réellement parcourues.
function stepMonsterToward(monsterId: string, target: { x: number; y: number }): number {
  let stepsTaken = 0

  while (true) {
    const monster = gs.getMonster(monsterId)
    if (!monster) break
    if (distanceCells(monster.position, target) <= 1) break // déjà au contact (mêlée)

    const used = gs.getMovementUsed(monsterId)
    const max = Math.floor(monster.speed / 5)
    if (used >= max) break

    const dx = Math.sign(target.x - monster.position.x)
    const dy = Math.sign(target.y - monster.position.y)
    const candidates = [
      { x: monster.position.x + dx, y: monster.position.y + dy }, // diagonale (réduit les deux axes)
      { x: monster.position.x + dx, y: monster.position.y },      // horizontale
      { x: monster.position.x, y: monster.position.y + dy },      // verticale
    ].filter(cell => cell.x !== monster.position.x || cell.y !== monster.position.y)

    let moved = false
    for (const cell of candidates) {
      try {
        const { distance } = rules.validateMove(monsterId, cell)
        gs.moveToken(monsterId, cell.x, cell.y)
        rules.recordMove(monsterId, distance)
        moved = true
        stepsTaken++
        break
      } catch {
        // hors limites / occupée / hors budget — on tente la direction suivante
      }
    }
    if (!moved) break // toutes les directions utiles sont bloquées
  }

  return stepsTaken
}

// Joue le tour d'UN monstre : attente (allié/neutre/hold), incapacité, sinon avance vers
// le joueur et attaque s'il est au contact. N'achève jamais un joueur déjà à terre.
function resolveMonsterTurn(monsterId: string, holdIds: ReadonlySet<string>): MonsterTurnRecord {
  const monster = gs.getMonster(monsterId)!
  const from = { ...monster.position }
  const name = monster.name

  if (monster.hostile === false || holdIds.has(monsterId)) {
    return { id: monsterId, name, action: 'hold', from, to: from, moved: 0, attack: null }
  }
  if (monster.conditions.some(condition => INCAPACITATING_CONDITIONS.has(condition))) {
    return { id: monsterId, name, action: 'incapacitated', from, to: from, moved: 0, attack: null }
  }

  const player = gs.getPlayer()
  const moved = stepMonsterToward(monsterId, player.position)
  const to = { ...gs.getMonster(monsterId)!.position }

  // Joueur déjà à terre : on s'approche/menace mais on n'achève pas (laisse une chance
  // aux jets de sauvegarde contre la mort — évite le « swarm instakill »).
  if (player.hp.current <= 0) {
    return { id: monsterId, name, action: 'approach', from, to, moved, attack: null, note: 'player_down' }
  }

  if (distanceCells(to, player.position) <= 1) {
    const result = resolveAttack(monsterId, 'player', monsterWeaponLabel(monster.type))
    const errored = 'isError' in result && result.isError
    if (!errored) {
      return { id: monsterId, name, action: 'attack', from, to, moved, attack: JSON.parse(result.content[0].text) as AttackResult }
    }
    return { id: monsterId, name, action: 'approach', from, to, moved, attack: null, note: 'attack_unavailable' }
  }

  return { id: monsterId, name, action: 'approach', from, to, moved, attack: null }
}

export function registerCombatTools(server: McpServer): void {
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
      weaponOrSpell: z.string().describe('Weapon or spell name (e.g. "longsword", "fireball")'),
      advantage: z.boolean().optional().describe('Roll with advantage (roll twice, take higher). May be granted for quality roleplay that concretely exploits an established scene element.'),
      disadvantage: z.boolean().optional().describe('Roll with disadvantage (roll twice, take lower)'),
      advantageReason: z.string().optional().describe('One short sentence quoting the roleplay or scene element that justifies the advantage/disadvantage. Logged in the combat log.'),
      customDamageDice: z.string().optional().describe('Override damage dice (e.g. "2d8+4")'),
      rangeCells: z.number().int().positive().optional().describe('Optional attack range in grid cells; defaults to weapon range.'),
    },
    async ({ attackerId, targetId, weaponOrSpell, advantage, disadvantage, advantageReason, customDamageDice, rangeCells }) => {
      return resolveAttack(attackerId, targetId, weaponOrSpell, advantage, disadvantage, customDamageDice, rangeCells, advantageReason)
    }
  )

  server.tool(
    'resolve_player_attack',
    'Resolves the player attack. Use this for natural-language targets such as nearest, right, left, front, back, or wounded; the tool selects the real monster ID before applying attack rules.',
    {
      targetId: z.string().optional().describe('Exact monster ID if already known.'),
      targetName: z.string().optional().describe('Natural-language monster name from the player, e.g. "Grukk", "Chef Grukk", or "hobgoblin". Prefer this when the player names a creature.'),
      targetHint: z.enum(['nearest', 'right', 'left', 'front', 'back', 'wounded']).optional().describe('Spatial/semantic target hint when the player did not name an exact monster ID.'),
      weaponOrSpell: z.string().optional().describe('Weapon or spell name; defaults to longsword.'),
      advantage: z.boolean().optional().describe('Roll with advantage. May be granted for quality roleplay that concretely exploits an established scene element (give advantageReason).'),
      disadvantage: z.boolean().optional().describe('Roll with disadvantage.'),
      advantageReason: z.string().optional().describe('One short sentence quoting the roleplay or scene element that justifies the advantage/disadvantage. Logged in the combat log.'),
      customDamageDice: z.string().optional().describe('Override damage dice.'),
      rangeCells: z.number().int().positive().optional().describe('Optional attack range in grid cells; defaults to weapon range.'),
    },
    async ({ targetId, targetName, targetHint, weaponOrSpell, advantage, disadvantage, advantageReason, customDamageDice, rangeCells }) => {
      return resolvePlayerAttack({ targetId, targetName, targetHint, weaponOrSpell, advantage, disadvantage, advantageReason, customDamageDice, rangeCells })
    }
  )

  server.tool(
    'cast_spell',
    'Casts one of the player known spells. The engine validates that the spell is known, that it is the player turn with an action available, that the target is in range, and that a spell slot remains (level-1 spells). It resolves the closed effect (attack roll, saving throw, auto-hit, heal, or utility). Utility spells (create water, light) have no dice: the engine debits the cost and you narrate within the returned srdNote. Never narrate a spell effect before calling this.',
    {
      spellId: z.string().optional().describe('Exact spell id (e.g. "magic-missile", "cure-wounds") if known.'),
      spellName: z.string().optional().describe('Natural-language spell name from the player (e.g. "projectile magique"). Prefer this when the player names a spell.'),
      targetId: z.string().optional().describe('Exact monster ID for a targeted spell.'),
      targetName: z.string().optional().describe('Natural-language monster name for a targeted spell.'),
    },
    async ({ spellId, spellName, targetId, targetName }) => {
      return resolveCastSpell({ spellId, spellName, targetId, targetName })
    }
  )

  server.tool(
    'use_class_feature',
    'Uses a player class feature that costs the bonus action: "second_wind" (Fighter — heals 1d10+level, once per map). The engine validates the feature is available and the bonus action is free. Never narrate the effect before calling this.',
    {
      featureId: z.enum(['second_wind']).describe('The class feature to use.'),
    },
    async ({ featureId }) => {
      return resolveUseClassFeature({ featureId })
    }
  )

  // Resolves EVERY consecutive monster turn in a single call (move + attack + advance),
  // collapsing what used to be many round-trips into one tool call + one narration.
  server.tool(
    'run_monster_turns',
    "Resolves every consecutive non-player turn in ONE call: each living hostile monster moves toward the player and attacks if in melee reach, then the turn advances, repeating until it is the player's turn again (or combat ends). Call this exactly once right after the player ends their turn (next_turn or pass_turn). Allies/neutrals and any IDs in holdIds skip their turn; monsters never finish off a downed player. Returns a per-monster breakdown plus combatShouldEnd so you can narrate all monster turns at once.",
    {
      holdIds: z.array(z.string()).optional().describe('Monster IDs that should skip their turn (e.g. charmed, parleying, or held). Non-hostile creatures skip automatically.'),
    },
    async ({ holdIds }) => {
      const state = gs.getState()
      if (state.phase !== 'combat') {
        return rules.ruleErrorResult(new rules.RuleViolation('NOT_IN_COMBAT', 'run_monster_turns requires an active combat.', { phase: state.phase }))
      }
      if (!state.currentTurn) {
        return rules.ruleErrorResult(new rules.RuleViolation('EMPTY_INITIATIVE', 'No active turn to resolve.', { initiativeOrder: state.initiativeOrder }))
      }
      if (state.currentTurn === 'player') {
        return rules.ruleErrorResult(new rules.RuleViolation('PLAYER_TURN_ACTIVE', "It is the player's turn. End it first with next_turn or pass_turn, then call run_monster_turns.", { currentTurn: state.currentTurn }))
      }

      const hold = new Set(holdIds ?? [])
      const resolvedTurns: MonsterTurnRecord[] = []
      const startRound = state.round
      const maxIterations = state.initiativeOrder.length * 4 + 4
      let iterations = 0

      while (iterations < maxIterations) {
        iterations++
        const current = gs.getState()

        if (current.player.deathSaves?.dead) break
        if (Object.values(current.monsters).filter(monster => monster.isAlive).length === 0) break

        const turn = current.currentTurn
        if (!turn || turn === 'player') break

        const monster = gs.getMonster(turn)
        if (!monster || !monster.isAlive) {
          gs.advanceTurn()
          continue
        }

        resolvedTurns.push(resolveMonsterTurn(turn, hold))
        gs.advanceTurn()
      }

      const after = gs.getState()
      const livingMonsters = Object.values(after.monsters).filter(monster => monster.isAlive)
      const playerDead = Boolean(after.player.deathSaves?.dead)
      const playerDown = after.player.hp.current <= 0 && !playerDead

      const summary = {
        turnsResolved: resolvedTurns.length,
        resolvedTurns,
        currentTurn: after.currentTurn,
        round: after.round,
        roundsAdvanced: after.round - startRound,
        player: {
          hp: after.player.hp,
          position: after.player.position,
          conditions: after.player.conditions,
          down: playerDown,
          dead: playerDead,
        },
        monstersRemaining: livingMonsters.length,
        combatShouldEnd: livingMonsters.length === 0 || playerDead,
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
      ability: z.enum(['str', 'dex', 'con', 'int', 'wis', 'cha']).describe('Ability used for the check.'),
      dc: z.number().int().optional().describe('Optional Difficulty Class to determine success.'),
      skill: z.string().optional().describe('Canonical skill id (e.g. "stealth", "persuasion", "perception"). When given for the player, the engine derives proficiency/expertise from the character sheet and IGNORES the proficient/expertise flags (anti-cheat).'),
      proficient: z.boolean().optional().describe('Whether to add proficiency bonus. Defaults false. Ignored when a known skill is given for the player.'),
      expertise: z.boolean().optional().describe('Whether to add double proficiency bonus. Defaults false. Ignored when a known skill is given for the player.'),
      label: z.string().optional().describe('Short label such as Persuasion, Intimidation, Athletics, or Perception.'),
      advantage: z.boolean().optional().describe('Roll with advantage (two d20, keep higher). Grant ONLY when the player roleplay concretely exploits an established scene element in a plausible way — never just because the player asks for it. Requires advantageReason.'),
      disadvantage: z.boolean().optional().describe('Roll with disadvantage (two d20, keep lower), e.g. when the approach clashes with the established fiction. Requires advantageReason.'),
      advantageReason: z.string().optional().describe('One short sentence quoting the roleplay or scene element that justifies the advantage/disadvantage. REQUIRED when advantage or disadvantage is set; logged for traceability.'),
    },
    async ({ entityId, ability, dc, skill, proficient, expertise, label, advantage, disadvantage, advantageReason }) => {
      const resolvedEntityId = entityId ?? 'player'
      const entity = gs.getEntity(resolvedEntityId)
      if (!entity) {
        return rules.ruleErrorResult(new rules.RuleViolation('ENTITY_NOT_FOUND', `Entity not found: ${resolvedEntityId}`, {
          entityId: resolvedEntityId,
        }))
      }
      try {
        rules.validateAbilityCheck(resolvedEntityId)
      } catch (err) {
        return rules.ruleErrorResult(err)
      }

      // Avantage/désavantage accordé par le DM (RP de qualité, approche
      // incohérente…) : la raison est OBLIGATOIRE — c'est la trace auditable de
      // la décision du LLM, elle empêche un flag posé « gratuitement ».
      const reason = advantageReason?.trim()
      if ((advantage || disadvantage) && !reason) {
        return rules.ruleErrorResult(new rules.RuleViolation(
          'ADVANTAGE_REASON_REQUIRED',
          'advantage/disadvantage requires advantageReason: one short sentence quoting the roleplay or scene element that justifies it.',
          { advantage: Boolean(advantage), disadvantage: Boolean(disadvantage) }
        ))
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
        effAbility = skillSpec.ability
        isProficient = Boolean(player.skillProficiencies?.includes(skillSpec.id))
        isExpertise = Boolean(player.expertise?.includes(skillSpec.id))
        resolvedLabel = resolvedLabel ?? skillSpec.label
      }

      const abilityMod = getAbilityModifier(entity.stats[effAbility])
      const proficiencyBonus = 'proficiencyBonus' in entity ? entity.proficiencyBonus : 2
      const proficiencyMod = isExpertise ? proficiencyBonus * 2 : isProficient ? proficiencyBonus : 0
      const totalMod = abilityMod + proficiencyMod
      const roll = rollD20WithAdvantage(totalMod, advantage, disadvantage)
      const success = typeof dc === 'number' ? roll.total >= dc : undefined
      const checkLabel = resolvedLabel?.trim() || `Test ${effAbility.toUpperCase()}`
      const advantageNote = reason && Boolean(advantage) !== Boolean(disadvantage)
        ? ` | ${advantage ? 'AVANTAGE' : 'DESAVANTAGE'}: ${reason}`
        : ''
      const mechanicalSummary = `${checkLabel}: ${roll.detail}${typeof dc === 'number' ? ` vs DD ${dc} -> ${success ? 'SUCCES' : 'ECHEC'}` : ''}${advantageNote}`

      const result: AbilityCheckResult = {
        entityId: resolvedEntityId,
        ability: effAbility,
        label: checkLabel,
        dc,
        proficient: isProficient,
        expertise: isExpertise,
        advantage: Boolean(advantage),
        disadvantage: Boolean(disadvantage),
        advantageReason: reason || undefined,
        roll,
        success,
        mechanicalSummary,
      }

      gs.addLogEntry({
        round: gs.getState().round,
        turn: gs.getState().currentTurn ?? resolvedEntityId,
        action: `${entity.name} - ${checkLabel}`,
        mechanicalDetail: mechanicalSummary,
      })
      if (gs.getState().phase === 'combat' && gs.getState().currentTurn === resolvedEntityId) {
        rules.recordAction(resolvedEntityId)
      }

      return { content: [{ type: 'text', text: JSON.stringify(result) }] }
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
    },
    async ({ entityId, ability, dc, onFailure }) => {
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

      const abilityMod = getAbilityModifier(entity.stats[ability as keyof EntityStats])
      const roll = rollDice(d20WithModifier(abilityMod))
      const success = roll.total >= dc

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
    'Rolls and records the player death saving throw. Only valid on the player turn at 0 HP.',
    {},
    async () => {
      const state = gs.getState()
      const player = state.player

      try {
        if (state.phase !== 'combat') {
          throw new rules.RuleViolation('NOT_IN_COMBAT', 'Death saves only happen during combat.', { phase: state.phase })
        }
        if (state.currentTurn !== 'player') {
          throw new rules.RuleViolation('PLAYER_TURN_REQUIRED', 'Death saves can only be rolled on the player turn.', {
            currentTurn: state.currentTurn,
          })
        }
        if (gs.hasActionUsed('player')) {
          throw new rules.RuleViolation('ACTION_ALREADY_USED', 'The player has already rolled a death save this turn.', {
            entityId: 'player',
            currentTurn: state.currentTurn,
          })
        }
        if (player.hp.current > 0) {
          throw new rules.RuleViolation('PLAYER_NOT_DYING', 'The player is conscious and does not need a death save.', {
            hp: player.hp,
          })
        }
        if (player.deathSaves?.stable) {
          throw new rules.RuleViolation('PLAYER_STABLE', 'The player is already stable and does not roll more death saves.', {
            deathSaves: player.deathSaves,
          })
        }
        if (player.deathSaves?.dead) {
          throw new rules.RuleViolation('PLAYER_DEAD', 'The player is dead and cannot roll more death saves.', {
            deathSaves: player.deathSaves,
          })
        }
      } catch (err) {
        return rules.ruleErrorResult(err)
      }

      const roll = rollDice('1d20')
      const naturalRoll = roll.rolls[0] ?? roll.total
      const deathSave = gs.rollPlayerDeathSave(naturalRoll)
      const outcome = deathSave.criticalSuccess
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

      rules.recordAction('player')
      gs.addLogEntry({
        round: gs.getState().round,
        turn: 'player',
        action: 'Jet de sauvegarde contre la mort',
        mechanicalDetail: mechanicalSummary,
      })

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            ...deathSave,
            roll,
            mechanicalSummary,
          }),
        }],
      }
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
        rules.validateConditionTarget(entityId)
        gs.applyCondition(entityId, condition as Condition)
        const entity = gs.getEntity(entityId)
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ success: true, entityId, condition, entityConditions: entity?.conditions }),
          }],
        }
      } catch (err) {
        return rules.ruleErrorResult(err)
      }
    }
  )
}
