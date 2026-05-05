import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { rollDice, getAbilityModifier } from '../dice'
import * as gs from '../game-state'
import { EntityStats, AttackResult, SavingThrowResult, Condition } from '../../lib/types'

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
    },
    async ({ attackerId, targetId, weaponOrSpell, advantage, disadvantage, customDamageDice }) => {
      const attacker = gs.getEntity(attackerId)
      const target = gs.getEntity(targetId)

      if (!attacker) return { content: [{ type: 'text', text: JSON.stringify({ error: `Attacker not found: ${attackerId}` }) }], isError: true }
      if (!target) return { content: [{ type: 'text', text: JSON.stringify({ error: `Target not found: ${targetId}` }) }], isError: true }

      // Determine attack bonus
      const strMod = getAbilityModifier(attacker.stats.str)
      const profBonus = 'proficiencyBonus' in attacker ? attacker.proficiencyBonus : 2
      const attackBonus = 'attackBonus' in attacker ? attacker.attackBonus : (strMod + profBonus)

      // Roll to-hit (with advantage/disadvantage)
      const roll1 = rollDice(`1d20+${attackBonus}`)
      let attackRoll = roll1

      if (advantage && !disadvantage) {
        const roll2 = rollDice(`1d20+${attackBonus}`)
        attackRoll = roll1.total >= roll2.total ? roll1 : roll2
        attackRoll = { ...attackRoll, detail: `ADV: ${roll1.detail} / ${roll2.detail} → kept ${attackRoll.total}` }
      } else if (disadvantage && !advantage) {
        const roll2 = rollDice(`1d20+${attackBonus}`)
        attackRoll = roll1.total <= roll2.total ? roll1 : roll2
        attackRoll = { ...attackRoll, detail: `DIS: ${roll1.detail} / ${roll2.detail} → kept ${attackRoll.total}` }
      }

      const targetAC = target.ac
      const hit = attackRoll.total >= targetAC

      let damageRoll = undefined
      let damageDealt = undefined
      let targetHpAfter = undefined
      let targetDied = false

      if (hit) {
        // Determine damage dice
        const strModDamage = getAbilityModifier(attacker.stats.str)
        const baseDamage = customDamageDice ?? ('damageDice' in attacker ? attacker.damageDice : `${getWeaponDamage(weaponOrSpell)}+${strModDamage}`)
        damageRoll = rollDice(baseDamage)
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
        ? `Attaque: ${attackRoll.detail} vs CA ${targetAC} → TOUCHÉ | Dégâts: ${damageRoll!.detail}${targetDied ? ' | MORT' : ''}`
        : `Attaque: ${attackRoll.detail} vs CA ${targetAC} → RATÉ`

      const result: AttackResult = {
        attackerId,
        targetId,
        weaponOrSpell,
        attackRoll,
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

      return { content: [{ type: 'text', text: JSON.stringify(result) }] }
    }
  )

  // Saving throw resolution
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

      const abilityMod = getAbilityModifier(entity.stats[ability as keyof EntityStats])
      const roll = rollDice(`1d20+${abilityMod}`)
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
      gs.applyCondition(entityId, condition as Condition)
      const entity = gs.getEntity(entityId)
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ success: true, entityId, condition, entityConditions: entity?.conditions }),
        }],
      }
    }
  )
}
