import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { rollDice, getAbilityModifier, d20WithModifier } from '../dice'
import * as gs from '../game-state'
import * as rules from '../rules'
import { EntityStats, AttackResult, SavingThrowResult, AbilityCheckResult, Condition } from '../../lib/types'

// Weapon damage dice by weapon name (D&D 5e)
const WEAPON_DAMAGE: Record<string, string> = {
  longsword: '1d8',
  shortsword: '1d6',
  dagger: '1d4',
  greataxe: '1d12',
  greatsword: '2d6',
  handaxe: '1d6',
  rapier: '1d8',
  mace: '1d6',
  quarterstaff: '1d6',
  unarmed: '1d4',
}

function getWeaponDamage(weaponOrSpell: string): string {
  const key = weaponOrSpell.toLowerCase().replace(/\s+/g, '')
  return WEAPON_DAMAGE[key] ?? '1d6'
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
  rangeCells?: number
) {
  const attacker = gs.getEntity(attackerId)
  const target = gs.getEntity(targetId)

  if (!attacker) return { content: [{ type: 'text' as const, text: JSON.stringify({ error: `Attacker not found: ${attackerId}` }) }], isError: true }
  if (!target) return { content: [{ type: 'text' as const, text: JSON.stringify({ error: `Target not found: ${targetId}` }) }], isError: true }
  try {
    rules.validateAttack(attackerId, targetId, weaponOrSpell, rangeCells)
  } catch (err) {
    return rules.ruleErrorResult(err)
  }

  const strMod = getAbilityModifier(attacker.stats.str)
  const profBonus = 'proficiencyBonus' in attacker ? attacker.proficiencyBonus : 2
  const attackBonus = 'attackBonus' in attacker ? attacker.attackBonus : (strMod + profBonus)
  const targetDistance = distanceCells(attacker.position, target.position)
  const unconsciousMeleeTarget = target.conditions.includes('unconscious') && targetDistance <= 1
  const effectiveAdvantage = Boolean(advantage || unconsciousMeleeTarget)

  const roll1 = rollDice(d20WithModifier(attackBonus))
  let attackRoll = roll1

  if (effectiveAdvantage && !disadvantage) {
    const roll2 = rollDice(d20WithModifier(attackBonus))
    attackRoll = roll1.total >= roll2.total ? roll1 : roll2
    attackRoll = { ...attackRoll, detail: `ADV: ${roll1.detail} / ${roll2.detail} -> kept ${attackRoll.total}` }
  } else if (disadvantage && !effectiveAdvantage) {
    const roll2 = rollDice(d20WithModifier(attackBonus))
    attackRoll = roll1.total <= roll2.total ? roll1 : roll2
    attackRoll = { ...attackRoll, detail: `DIS: ${roll1.detail} / ${roll2.detail} -> kept ${attackRoll.total}` }
  }

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
    const strModDamage = getAbilityModifier(attacker.stats.str)
    const baseDamage = customDamageDice ?? ('damageDice' in attacker ? attacker.damageDice : `${getWeaponDamage(weaponOrSpell)}+${strModDamage}`)
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
    ? `Attaque: ${attackRoll.detail} vs CA ${targetAC} -> ${criticalHit ? 'CRITIQUE' : 'TOUCHE'} | Degats: ${damageRoll!.detail}${targetStatusDetail}`
    : `Attaque: ${attackRoll.detail} vs CA ${targetAC} -> ${criticalMiss ? 'ECHEC CRITIQUE' : 'RATE'}`

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
}: ResolvePlayerAttackInput) {
  try {
    const resolvedTargetId = selectPlayerTarget(targetId, targetName, targetHint ?? 'nearest')
    return resolveAttack('player', resolvedTargetId, weaponOrSpell ?? 'longsword', advantage, disadvantage, customDamageDice, rangeCells)
  } catch (err) {
    return rules.ruleErrorResult(err)
  }
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
      advantage: z.boolean().optional().describe('Roll with advantage (roll twice, take higher)'),
      disadvantage: z.boolean().optional().describe('Roll with disadvantage (roll twice, take lower)'),
      customDamageDice: z.string().optional().describe('Override damage dice (e.g. "2d8+4")'),
      rangeCells: z.number().int().positive().optional().describe('Optional attack range in grid cells; defaults to weapon range.'),
    },
    async ({ attackerId, targetId, weaponOrSpell, advantage, disadvantage, customDamageDice, rangeCells }) => {
      return resolveAttack(attackerId, targetId, weaponOrSpell, advantage, disadvantage, customDamageDice, rangeCells)

      const attacker = gs.getEntity(attackerId)!
      const target = gs.getEntity(targetId)!

      if (!attacker) return { content: [{ type: 'text', text: JSON.stringify({ error: `Attacker not found: ${attackerId}` }) }], isError: true }
      if (!target) return { content: [{ type: 'text', text: JSON.stringify({ error: `Target not found: ${targetId}` }) }], isError: true }
      try {
        rules.validateAttack(attackerId, targetId, weaponOrSpell, rangeCells)
      } catch (err) {
        return rules.ruleErrorResult(err)
      }

      // Determine attack bonus
      const strMod = getAbilityModifier(attacker.stats.str)
      const profBonus = 'proficiencyBonus' in attacker ? Number((attacker as { proficiencyBonus: number }).proficiencyBonus) : 2
      const attackBonus = 'attackBonus' in attacker ? Number((attacker as { attackBonus: number }).attackBonus) : (strMod + profBonus)

      // Roll to-hit (with advantage/disadvantage)
      const roll1 = rollDice(d20WithModifier(attackBonus))
      let attackRoll = roll1

      if (advantage && !disadvantage) {
        const roll2 = rollDice(d20WithModifier(attackBonus))
        attackRoll = roll1.total >= roll2.total ? roll1 : roll2
        attackRoll = { ...attackRoll, detail: `ADV: ${roll1.detail} / ${roll2.detail} → kept ${attackRoll.total}` }
      } else if (disadvantage && !advantage) {
        const roll2 = rollDice(d20WithModifier(attackBonus))
        attackRoll = roll1.total <= roll2.total ? roll1 : roll2
        attackRoll = { ...attackRoll, detail: `DIS: ${roll1.detail} / ${roll2.detail} → kept ${attackRoll.total}` }
      }

      const targetAC = target.ac
      const naturalRoll = attackRoll.rolls[0]
      const criticalMiss = naturalRoll === 1
      const criticalHit = naturalRoll === 20
      const hit = criticalHit || (!criticalMiss && attackRoll.total >= targetAC)

      let damageRoll = undefined
      let damageDealt = undefined
      let targetHpAfter = undefined
      let targetDied = false

      if (hit) {
        // Determine damage dice
        const strModDamage = getAbilityModifier(attacker.stats.str)
        const baseDamage = customDamageDice ?? ('damageDice' in attacker ? (attacker as { damageDice: string }).damageDice : `${getWeaponDamage(weaponOrSpell)}+${strModDamage}`)
        damageRoll = rollDice(criticalHit ? doubleDiceNotation(baseDamage) : baseDamage)
        damageDealt = Math.max(1, damageRoll.total)

        // Apply damage
        if (targetId === 'player') {
          const updated = gs.updatePlayerHP(-damageDealt)
          targetHpAfter = updated.hp.current
          targetDied = updated.hp.current === 0
        } else {
          const updated = gs.updateMonsterHP(targetId, -damageDealt)
          targetHpAfter = updated.hp.current
          targetDied = !updated.isAlive
        }
      }

      const mechanicalSummary = hit
        ? `Attaque: ${attackRoll.detail} vs CA ${targetAC} -> ${criticalHit ? 'CRITIQUE' : 'TOUCHE'} | Degats: ${damageRoll!.detail}${targetDied ? ' | MORT' : ''}`
        : `Attaque: ${attackRoll.detail} vs CA ${targetAC} -> ${criticalMiss ? 'ECHEC CRITIQUE' : 'RATE'}`

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

      return { content: [{ type: 'text', text: JSON.stringify(result) }] }
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
      advantage: z.boolean().optional().describe('Roll with advantage.'),
      disadvantage: z.boolean().optional().describe('Roll with disadvantage.'),
      customDamageDice: z.string().optional().describe('Override damage dice.'),
      rangeCells: z.number().int().positive().optional().describe('Optional attack range in grid cells; defaults to weapon range.'),
    },
    async ({ targetId, targetName, targetHint, weaponOrSpell, advantage, disadvantage, customDamageDice, rangeCells }) => {
      return resolvePlayerAttack({ targetId, targetName, targetHint, weaponOrSpell, advantage, disadvantage, customDamageDice, rangeCells })
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
      proficient: z.boolean().optional().describe('Whether to add proficiency bonus. Defaults false.'),
      expertise: z.boolean().optional().describe('Whether to add double proficiency bonus. Defaults false.'),
      label: z.string().optional().describe('Short label such as Persuasion, Intimidation, Athletics, or Perception.'),
    },
    async ({ entityId, ability, dc, proficient, expertise, label }) => {
      const resolvedEntityId = entityId ?? 'player'
      const entity = gs.getEntity(resolvedEntityId)
      if (!entity) return { content: [{ type: 'text', text: JSON.stringify({ error: `Entity not found: ${resolvedEntityId}` }) }], isError: true }
      try {
        rules.validateAbilityCheck(resolvedEntityId)
      } catch (err) {
        return rules.ruleErrorResult(err)
      }

      const abilityMod = getAbilityModifier(entity.stats[ability as keyof EntityStats])
      const proficiencyBonus = 'proficiencyBonus' in entity ? entity.proficiencyBonus : 2
      const proficiencyMod = expertise ? proficiencyBonus * 2 : proficient ? proficiencyBonus : 0
      const totalMod = abilityMod + proficiencyMod
      const roll = rollDice(d20WithModifier(totalMod))
      const success = typeof dc === 'number' ? roll.total >= dc : undefined
      const checkLabel = label?.trim() || `Test ${ability.toUpperCase()}`
      const mechanicalSummary = `${checkLabel}: ${roll.detail}${typeof dc === 'number' ? ` vs DD ${dc} -> ${success ? 'SUCCES' : 'ECHEC'}` : ''}`

      const result: AbilityCheckResult = {
        entityId: resolvedEntityId,
        ability: ability as keyof EntityStats,
        label: checkLabel,
        dc,
        proficient: Boolean(proficient),
        expertise: Boolean(expertise),
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
      if (!entity) return { content: [{ type: 'text', text: JSON.stringify({ error: `Entity not found: ${entityId}` }) }], isError: true }
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
