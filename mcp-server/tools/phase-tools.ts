import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { rollDice, getAbilityModifier } from '../dice'
import * as gs from '../game-state'
import { MonsterState } from '../../lib/types'

// Monster stat blocks (D&D 5e simplified)
const MONSTER_TEMPLATES: Record<string, Omit<MonsterState, 'id' | 'name' | 'position' | 'isAlive'>> = {
  goblin: {
    type: 'goblin',
    hp: { current: 7, max: 7 },
    ac: 15,
    stats: { str: 8, dex: 14, con: 10, int: 10, wis: 8, cha: 8 },
    conditions: [],
    xpValue: 50,
    attackBonus: 4,
    damageDice: '1d6+2',
    speed: 30,
  },
  hobgoblin: {
    type: 'hobgoblin',
    hp: { current: 11, max: 11 },
    ac: 18,
    stats: { str: 13, dex: 12, con: 12, int: 10, wis: 10, cha: 9 },
    conditions: [],
    xpValue: 100,
    attackBonus: 3,
    damageDice: '1d8+1',
    speed: 30,
  },
  orc: {
    type: 'orc',
    hp: { current: 15, max: 15 },
    ac: 13,
    stats: { str: 16, dex: 12, con: 16, int: 7, wis: 11, cha: 10 },
    conditions: [],
    xpValue: 100,
    attackBonus: 5,
    damageDice: '1d12+3',
    speed: 30,
  },
  skeleton: {
    type: 'skeleton',
    hp: { current: 13, max: 13 },
    ac: 13,
    stats: { str: 10, dex: 14, con: 15, int: 6, wis: 8, cha: 5 },
    conditions: [],
    xpValue: 50,
    attackBonus: 4,
    damageDice: '1d6+2',
    speed: 30,
  },
  zombie: {
    type: 'zombie',
    hp: { current: 22, max: 22 },
    ac: 8,
    stats: { str: 13, dex: 6, con: 16, int: 3, wis: 6, cha: 5 },
    conditions: [],
    xpValue: 50,
    attackBonus: 3,
    damageDice: '1d6+1',
    speed: 20,
  },
  wolf: {
    type: 'wolf',
    hp: { current: 11, max: 11 },
    ac: 13,
    stats: { str: 12, dex: 15, con: 12, int: 3, wis: 12, cha: 6 },
    conditions: [],
    xpValue: 50,
    attackBonus: 4,
    damageDice: '2d4+2',
    speed: 40,
  },
  bandit: {
    type: 'bandit',
    hp: { current: 11, max: 11 },
    ac: 12,
    stats: { str: 11, dex: 12, con: 12, int: 10, wis: 10, cha: 10 },
    conditions: [],
    xpValue: 25,
    attackBonus: 3,
    damageDice: '1d6+1',
    speed: 30,
  },
}

export function registerPhaseTools(server: McpServer): void {
  // Transitions to combat: rolls initiative for all combatants
  server.tool(
    'enter_combat',
    'Enters combat phase. Rolls initiative (1d20+DEX) for all combatants and sets initiative order.',
    {
      combatants: z.array(z.string()).describe('Array of entity IDs entering combat (include "player")'),
    },
    async ({ combatants }) => {
      gs.setPhase('combat')

      // Roll initiative for each combatant
      const initiatives: Array<{ id: string; initiative: number; roll: string }> = []

      for (const id of combatants) {
        const entity = gs.getEntity(id)
        if (!entity) continue
        const dexMod = getAbilityModifier(entity.stats.dex)
        const roll = rollDice(`1d20+${dexMod}`)
        entity.initiative = roll.total
        initiatives.push({ id, initiative: roll.total, roll: roll.detail })
      }

      // Sort descending by initiative
      initiatives.sort((a, b) => b.initiative - a.initiative)
      const order = initiatives.map(i => i.id)
      gs.setInitiativeOrder(order)

      gs.addLogEntry({
        round: 1,
        turn: 'system',
        action: 'COMBAT ENGAGÉ',
        mechanicalDetail: initiatives.map(i => `${i.id}: ${i.roll}`).join(' | '),
      })

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            phase: 'combat',
            initiativeOrder: order,
            initiatives,
            currentTurn: gs.getState().currentTurn,
            round: 1,
          }),
        }],
      }
    }
  )

  // Advances to the next turn in initiative order
  server.tool(
    'next_turn',
    'Advances to the next combatant in initiative order. Returns who is now acting.',
    {},
    async () => {
      const nextTurn = gs.advanceTurn()
      const state = gs.getState()
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            currentTurn: nextTurn,
            round: state.round,
            initiativeOrder: state.initiativeOrder,
          }),
        }],
      }
    }
  )

  // Ends combat, awards XP, resets combat state
  server.tool(
    'end_combat',
    'Ends combat phase, awards XP for defeated monsters, returns to exploration.',
    {},
    async () => {
      const state = gs.getState()

      // Calculate XP from defeated monsters
      const deadMonsters = Object.values(state.monsters).filter(m => !m.isAlive)
      const totalXP = deadMonsters.reduce((sum, m) => sum + m.xpValue, 0)

      gs.setPhase('exploration')
      state.initiativeOrder = []
      state.currentTurn = null
      state.round = 0

      gs.addLogEntry({
        round: state.round,
        turn: 'system',
        action: 'COMBAT TERMINÉ',
        mechanicalDetail: `XP gagné: ${totalXP} (${deadMonsters.map(m => m.name).join(', ')})`,
      })

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            phase: 'exploration',
            xpAwarded: totalXP,
            defeatedMonsters: deadMonsters.map(m => ({ id: m.id, name: m.name, xp: m.xpValue })),
          }),
        }],
      }
    }
  )

  // Spawns a monster from the template library onto the grid
  server.tool(
    'spawn_monster',
    'Spawns a monster on the grid. Uses built-in stat blocks for known types.',
    {
      monsterType: z.string().describe('Monster type key (goblin, orc, skeleton, zombie, wolf, bandit, hobgoblin)'),
      cell: z.object({ x: z.number().int().min(0), y: z.number().int().min(0) }).describe('Grid position to spawn at'),
      name: z.string().optional().describe('Custom name override (e.g. "Gobelin Chef")'),
      hpOverride: z.number().int().positive().optional().describe('Override max HP'),
    },
    async ({ monsterType, cell, name, hpOverride }) => {
      const template = MONSTER_TEMPLATES[monsterType.toLowerCase()]
      if (!template) {
        // Unknown monster type — create a generic one
        const genericId = `${monsterType}_${Date.now()}`
        const generic: MonsterState = {
          id: genericId,
          name: name ?? monsterType,
          type: monsterType,
          hp: { current: hpOverride ?? 10, max: hpOverride ?? 10 },
          ac: 12,
          stats: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
          position: cell,
          conditions: [],
          xpValue: 50,
          attackBonus: 2,
          damageDice: '1d6',
          speed: 30,
          isAlive: true,
        }
        gs.spawnMonster(generic)
        return { content: [{ type: 'text', text: JSON.stringify(generic) }] }
      }

      const id = `${monsterType}_${Date.now()}`
      const maxHp = hpOverride ?? template.hp.max
      const monster: MonsterState = {
        ...template,
        id,
        name: name ?? `${monsterType.charAt(0).toUpperCase()}${monsterType.slice(1)}`,
        hp: { current: maxHp, max: maxHp },
        position: cell,
        isAlive: true,
      }

      gs.spawnMonster(monster)

      return {
        content: [{ type: 'text', text: JSON.stringify(monster) }],
      }
    }
  )
}
