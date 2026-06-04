import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { rollDice, getAbilityModifier, d20WithModifier } from '../dice'
import * as gs from '../game-state'
import * as rules from '../rules'
import { MonsterState, MonsterDisposition } from '../../lib/types'
import { EncounterMonsterSpec, ENCOUNTERS, getEncounter } from '../../lib/adventure-map'

// Monster stat blocks — Monster Manual 2025 (XMM)
// Source: CR list verified from MM 2025 appendix
const MONSTER_TEMPLATES: Record<string, Omit<MonsterState, 'id' | 'name' | 'position' | 'isAlive'>> = {

  // ── GOBELINS ─────────────────────────────────────────────────────────────────

  // Gobelin Minion — CR 1/8 · XP 25 (nouveau MM 2025 : version affaiblie)
  goblin_minion: {
    type: 'goblin_minion',
    hp: { current: 3, max: 3 },
    ac: 13,
    stats: { str: 8, dex: 14, con: 10, int: 10, wis: 8, cha: 8 },
    conditions: [],
    xpValue: 25,
    attackBonus: 3,
    damageDice: '1d4+1',
    speed: 30,
  },

  // Gobelin Warrior — CR 1/4 · XP 50 (référence pour les gobelins standard)
  goblin: {
    type: 'goblin',
    hp: { current: 7, max: 7 },
    ac: 15,  // armure de cuir + bouclier
    stats: { str: 8, dex: 14, con: 10, int: 10, wis: 8, cha: 8 },
    conditions: [],
    xpValue: 50,
    attackBonus: 4,
    damageDice: '1d6+2',  // cimeterre
    speed: 30,
    // Capacité spéciale : Fuite Agile (Disengage/Hide comme Bonus Action) — géré par le DM AI
  },

  // Gobelin Boss — CR 1 · XP 200 (base de Chef Grukk, HP réduit via hpOverride)
  goblin_boss: {
    type: 'goblin_boss',
    hp: { current: 21, max: 21 },
    ac: 17,  // armure de mailles + bouclier
    stats: { str: 10, dex: 14, con: 10, int: 10, wis: 8, cha: 10 },
    conditions: [],
    xpValue: 200,
    attackBonus: 4,
    damageDice: '1d6+2',  // cimeterre (multiattaque ×2 gérée par le DM AI)
    speed: 30,
  },

  // ── HOBGOBELINS ───────────────────────────────────────────────────────────────

  // Hobgoblin Warrior — CR 1/2 · XP 100
  hobgoblin: {
    type: 'hobgoblin',
    hp: { current: 11, max: 11 },
    ac: 18,  // cotte de mailles + bouclier
    stats: { str: 13, dex: 12, con: 12, int: 10, wis: 10, cha: 9 },
    conditions: [],
    xpValue: 100,
    attackBonus: 3,
    damageDice: '1d8+1',  // épée longue à 1 main
    speed: 30,
    // Capacité : Avantage martial +2d6 si allié à 5 pieds (géré par DM AI)
  },

  // Hobgoblin Captain — CR 3 · XP 700 (pour combats futurs, pas niv.1)
  hobgoblin_captain: {
    type: 'hobgoblin_captain',
    hp: { current: 52, max: 52 },
    ac: 17,  // demi-armure
    stats: { str: 15, dex: 14, con: 14, int: 12, wis: 10, cha: 13 },
    conditions: [],
    xpValue: 700,
    attackBonus: 4,
    damageDice: '2d6+2',  // espadon (multiattaque ×2)
    speed: 30,
  },

  // ── MORTS-VIVANTS ─────────────────────────────────────────────────────────────

  // Squelette — CR 1/4 · XP 50
  skeleton: {
    type: 'skeleton',
    hp: { current: 13, max: 13 },
    ac: 13,  // restes d'armure
    stats: { str: 10, dex: 14, con: 15, int: 6, wis: 8, cha: 5 },
    conditions: [],
    xpValue: 50,
    attackBonus: 4,
    damageDice: '1d6+2',  // épée courte
    speed: 30,
    // Vulnérabilité dégâts contondants × 2 — à appliquer manuellement dans resolve_attack
  },

  // Zombie — CR 1/4 · XP 50 (utilisé pour Champignon Violet dans le module)
  zombie: {
    type: 'zombie',
    hp: { current: 22, max: 22 },
    ac: 8,
    stats: { str: 13, dex: 6, con: 16, int: 3, wis: 6, cha: 5 },
    conditions: [],
    xpValue: 50,
    attackBonus: 3,
    damageDice: '1d6+1',  // coup
    speed: 20,
    // Résistance des morts-vivants : JS CON DD (5 + dégâts) pour rester à 1 PV — géré par DM AI
  },

  // ── CHAMPIGNONS ───────────────────────────────────────────────────────────────

  // Violet Fungus — CR 1/4 · XP 50 (Champignon Violet, stats pures MM 2025)
  violet_fungus: {
    type: 'violet_fungus',
    hp: { current: 18, max: 18 },
    ac: 5,
    stats: { str: 3, dex: 1, con: 10, int: 1, wis: 3, cha: 1 },
    conditions: [],
    xpValue: 50,
    attackBonus: 2,
    damageDice: '1d8',  // touche pourrie (nécrotique) — JS CON DD 10 ou pas de récup HP
    speed: 5,
  },

  // ── BÊTES ─────────────────────────────────────────────────────────────────────

  // Loup — CR 1/4 · XP 50
  wolf: {
    type: 'wolf',
    hp: { current: 11, max: 11 },
    ac: 13,  // armure naturelle
    stats: { str: 12, dex: 15, con: 12, int: 3, wis: 12, cha: 6 },
    conditions: [],
    xpValue: 50,
    attackBonus: 4,
    damageDice: '2d4+2',  // morsure — JS FOR DD 11 ou prone
    speed: 40,
  },

  // ── HUMANOÏDES ────────────────────────────────────────────────────────────────

  // Bandit — CR 1/8 · XP 25
  bandit: {
    type: 'bandit',
    hp: { current: 11, max: 11 },
    ac: 12,  // armure de cuir
    stats: { str: 11, dex: 12, con: 12, int: 10, wis: 10, cha: 10 },
    conditions: [],
    xpValue: 25,
    attackBonus: 3,
    damageDice: '1d6+1',  // cimeterre
    speed: 30,
  },

  // ── FÉE / NATURE ──────────────────────────────────────────────────────────────

  // Dryade — CR 1 · XP 200 (non hostile dans l'aventure)
  dryad: {
    type: 'dryad',
    hp: { current: 22, max: 22 },
    ac: 11,  // armure naturelle
    stats: { str: 10, dex: 12, con: 11, int: 14, wis: 15, cha: 20 },
    conditions: [],
    xpValue: 200,
    attackBonus: 6,  // avec Poigne du druide (Shillelagh)
    damageDice: '1d8+3',  // gourdin + Shillelagh
    speed: 30,
    disposition: 'neutral',  // non hostile tant que le joueur ne l'attaque pas
    // Charme féerique : JS SAG DD 14 ou charmé 24h — géré par DM AI via apply_condition
    // Résistance magie : Avantage sur JS contre sorts
  },

  // Mac le Tréant (Awakened Tree) — CR 2 · XP 450 (non hostile)
  // Treant complet = CR 9 · trop puissant pour niv.1 — Mac est un "jeune" pommier éveillé
  awakened_tree: {
    type: 'awakened_tree',
    hp: { current: 59, max: 59 },
    ac: 13,  // armure naturelle
    stats: { str: 19, dex: 6, con: 15, int: 10, wis: 10, cha: 7 },
    conditions: [],
    xpValue: 450,
    attackBonus: 6,
    damageDice: '3d6+4',  // coup (contondants)
    speed: 20,
    disposition: 'neutral',  // non hostile tant que le joueur ne l'attaque pas
    // Vulnérabilité : feu × 2
    // Fausse apparence : ressemble à un pommier ordinaire
  },
}

let monsterIdCounter = 0

function createMonster(
  monsterType: string,
  cell: { x: number; y: number },
  name?: string,
  hpOverride?: number,
  disposition?: MonsterDisposition,
): MonsterState {
  const normalizedType = monsterType.toLowerCase()
  const id = `${normalizedType}_${Date.now()}_${monsterIdCounter++}`
  const template = MONSTER_TEMPLATES[normalizedType]

  if (!template) {
    return {
      id,
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
      disposition: disposition ?? 'hostile',
    }
  }

  const maxHp = hpOverride ?? template.hp.max
  return {
    ...template,
    id,
    name: name ?? `${normalizedType.charAt(0).toUpperCase()}${normalizedType.slice(1)}`,
    hp: { current: maxHp, max: maxHp },
    position: cell,
    isAlive: true,
    disposition: disposition ?? template.disposition ?? 'hostile',
  }
}

function startCombat(combatants: string[], options?: { playerActsFirst?: boolean }): {
  phase: 'combat'
  initiativeOrder: string[]
  initiatives: Array<{ id: string; initiative: number; roll: string }>
  currentTurn: string | null
  round: number
} {
  rules.validateEnterCombat(combatants)
  gs.setPhase('combat')

  const initiatives: Array<{ id: string; initiative: number; roll: string }> = []
  for (const id of combatants) {
    const entity = gs.getEntity(id)
    if (!entity) continue
    const dexMod = getAbilityModifier(entity.stats.dex)
    const roll = rollDice(d20WithModifier(dexMod))
    entity.initiative = roll.total
    initiatives.push({ id, initiative: roll.total, roll: roll.detail })
  }

  initiatives.sort((a, b) => b.initiative - a.initiative)
  const order = options?.playerActsFirst
    ? ['player', ...initiatives.filter(i => i.id !== 'player').map(i => i.id)]
    : initiatives.map(i => i.id)
  gs.setInitiativeOrder(order)

  gs.addLogEntry({
    round: 1,
    turn: 'system',
    action: 'COMBAT ENGAGE',
    mechanicalDetail: initiatives.map(i => `${i.id}: ${i.roll}`).join(' | '),
  })

  return {
    phase: 'combat',
    initiativeOrder: order,
    initiatives,
    currentTurn: gs.getState().currentTurn,
    round: 1,
  }
}

function assertEncounterCanStart(playerCell: { x: number; y: number } | undefined, monsters: EncounterMonsterSpec[]): void {
  const state = gs.getState()
  if (state.phase === 'combat') {
    throw new rules.RuleViolation('COMBAT_ALREADY_ACTIVE', 'Cannot start an encounter while combat is already active.', {
      currentTurn: state.currentTurn,
      initiativeOrder: state.initiativeOrder,
    })
  }

  if (monsters.length === 0) {
    throw new rules.RuleViolation('ENCOUNTER_EMPTY', 'An encounter requires at least one monster.')
  }

  if (playerCell) {
    rules.validateMapCell(playerCell, 'playerCell')
  }

  const occupied = new Map<string, string>()
  for (const entity of gs.getAllEntities()) {
    if (rules.occupiesSpace(entity)) {
      occupied.set(`${entity.position.x},${entity.position.y}`, entity.id)
    }
  }

  if (playerCell) {
    const playerTarget = `${playerCell.x},${playerCell.y}`
    const blockerId = occupied.get(playerTarget)
    if (blockerId && blockerId !== 'player') {
      throw new rules.RuleViolation('CELL_OCCUPIED', `Player destination (${playerCell.x}, ${playerCell.y}) is occupied.`, {
        blockerId,
        cell: playerCell,
      })
    }
    occupied.delete(`${state.player.position.x},${state.player.position.y}`)
    occupied.set(playerTarget, 'player')
  }

  for (const monster of monsters) {
    rules.validateMapCell(monster.cell, 'monster.cell')
    const key = `${monster.cell.x},${monster.cell.y}`
    const blockerId = occupied.get(key)
    if (blockerId) {
      throw new rules.RuleViolation('CELL_OCCUPIED', `Encounter spawn cell (${monster.cell.x}, ${monster.cell.y}) is occupied.`, {
        blockerId,
        cell: monster.cell,
        monsterType: monster.monsterType,
      })
    }
    occupied.set(key, monster.monsterType)
  }
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
      try {
        const result = startCombat(combatants)
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(result),
          }],
        }
      } catch (err) {
        return rules.ruleErrorResult(err)
      }
    }
  )

  server.tool(
    'start_encounter',
    'Atomically moves the player if needed, spawns monsters, and enters combat with the real spawned monster IDs. Prefer this over separate spawn_monster + enter_combat for room encounters.',
    {
      encounterId: z.enum(Object.keys(ENCOUNTERS) as [string, ...string[]]).optional().describe('Preset encounter id from the adventure, e.g. bakery_floor_goblins.'),
      playerCell: z.object({ x: z.number().int().min(0), y: z.number().int().min(0) }).optional().describe('Optional player destination before combat starts.'),
      monsters: z.array(z.object({
        monsterType: z.string().describe('Monster type key'),
        cell: z.object({ x: z.number().int().min(0), y: z.number().int().min(0) }),
        name: z.string().optional(),
        hpOverride: z.number().int().positive().optional(),
      })).optional().describe('Custom monster list when no preset encounterId is used.'),
      reason: z.string().optional().describe('Short narrative/mechanical reason for starting the encounter.'),
    },
    async ({ encounterId, playerCell, monsters, reason }) => {
      const stateBefore = structuredClone(gs.getState())
      try {
        const preset = encounterId ? getEncounter(encounterId) : null
        if (encounterId && !preset) {
          throw new rules.RuleViolation('UNKNOWN_ENCOUNTER', `Unknown encounter: ${encounterId}`, { encounterId })
        }
        if (encounterId && gs.hasEncounterTriggered(encounterId)) {
          throw new rules.RuleViolation('ENCOUNTER_ALREADY_RESOLVED', `Encounter already triggered: ${encounterId}`, { encounterId })
        }

        const encounterMonsters = monsters ?? preset?.monsters ?? []
        const resolvedPlayerCell = playerCell ?? preset?.playerCell
        assertEncounterCanStart(resolvedPlayerCell, encounterMonsters)

        if (preset?.roomId) {
          gs.visitRoom(preset.roomId)
        }

        let movedPlayer: { from: { x: number; y: number }; to: { x: number; y: number } } | null = null
        if (resolvedPlayerCell) {
          const from = { ...gs.getState().player.position }
          gs.moveToken('player', resolvedPlayerCell.x, resolvedPlayerCell.y)
          movedPlayer = { from, to: resolvedPlayerCell }
        }

        const spawnedMonsters: MonsterState[] = []
        for (const spec of encounterMonsters) {
          // Une rencontre démarre un combat: les monstres sont hostiles, même si
          // leur template par défaut est neutre (ex: dryade provoquée).
          const monster = createMonster(spec.monsterType, spec.cell, spec.name, spec.hpOverride, 'hostile')
          gs.spawnMonster(monster)
          spawnedMonsters.push(monster)
        }

        const combat = startCombat(['player', ...spawnedMonsters.map(monster => monster.id)], {
          playerActsFirst: true,
        })
        if (encounterId) {
          gs.markEncounterTriggered(encounterId)
        }
        if (reason || preset) {
          gs.addLogEntry({
            round: gs.getState().round,
            turn: 'system',
            action: `RENCONTRE: ${preset?.name ?? 'custom'}`,
            mechanicalDetail: reason,
          })
        }

        const state = gs.getState()
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              encounterId,
              encounterName: preset?.name,
              roomId: state.currentRoomId,
              movedPlayer,
              spawnedMonsters,
              combat,
            }),
          }],
        }
      } catch (err) {
        gs.replaceState(stateBefore)
        return rules.ruleErrorResult(err)
      }
    }
  )

  // Advances to the next turn in initiative order
  server.tool(
    'next_turn',
    'Ends the current combatant turn and advances initiative. Requires the current actor to have used an action, unless skipAction=true for an explicit pass/hold.',
    {
      actorId: z.string().optional().describe('Entity ID ending its own turn. Defaults to currentTurn and must match currentTurn.'),
      skipAction: z.boolean().optional().describe('Set true only when the current actor explicitly passes/holds instead of using an action.'),
      reason: z.string().optional().describe('Short reason when skipAction=true, e.g. "holds position" or "cannot reach target".'),
    },
    async ({ actorId, skipAction, reason }) => {
      let endingActorId: string
      try {
        endingActorId = rules.validateNextTurn(actorId, Boolean(skipAction))
      } catch (err) {
        return rules.ruleErrorResult(err)
      }

      if (skipAction) {
        const actor = gs.getEntity(endingActorId)
        gs.addLogEntry({
          round: gs.getState().round,
          turn: endingActorId,
          action: `${actor?.name ?? endingActorId} passe son tour`,
          mechanicalDetail: reason,
        })
      }

      const nextTurn = gs.advanceTurn()
      const state = gs.getState()
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            endedTurn: endingActorId,
            currentTurn: nextTurn,
            round: state.round,
            initiativeOrder: state.initiativeOrder,
            skippedAction: Boolean(skipAction),
            reason,
          }),
        }],
      }
    }
  )

  server.tool(
    'pass_turn',
    'Passes or holds the player combat turn. Only valid when it is currently the player turn.',
    {
      reason: z.string().optional().describe('Short reason, e.g. "holds position" or "waits".'),
    },
    async ({ reason }) => {
      const state = gs.getState()
      if (state.currentTurn !== 'player') {
        return rules.ruleErrorResult(new rules.RuleViolation(
          'PLAYER_TURN_REQUIRED',
          'Only the player turn can be passed through this tool.',
          { currentTurn: state.currentTurn }
        ))
      }

      let endingActorId: string
      try {
        endingActorId = rules.validateNextTurn('player', true)
      } catch (err) {
        return rules.ruleErrorResult(err)
      }

      gs.addLogEntry({
        round: gs.getState().round,
        turn: endingActorId,
        action: 'Le joueur passe son tour',
        mechanicalDetail: reason,
      })

      const nextTurn = gs.advanceTurn()
      const nextState = gs.getState()
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            endedTurn: endingActorId,
            currentTurn: nextTurn,
            round: nextState.round,
            initiativeOrder: nextState.initiativeOrder,
            skippedAction: true,
            reason,
          }),
        }],
      }
    }
  )

  // Ends combat, awards XP, resets combat state
  server.tool(
    'end_combat',
    'Ends combat phase, awards XP for defeated monsters, returns to exploration. Set force=true only when combat ends by surrender, negotiation, or flight.',
    {
      force: z.boolean().optional().describe('Allow ending combat while non-player combatants are still active.'),
      reason: z.string().optional().describe('Narrative reason for ending combat, e.g. surrender, negotiation, or flight.'),
    },
    async ({ force, reason }) => {
      try {
        rules.validateEndCombat(force)
      } catch (err) {
        return rules.ruleErrorResult(err)
      }

      const state = gs.getState()

      // Calculate XP from defeated monsters
      const deadMonsters = Object.values(state.monsters).filter(m => !m.isAlive && !m.xpAwarded)
      const disengagedMonsters = force
        ? Object.values(state.monsters).filter(m => m.isAlive)
        : []
      const totalXP = deadMonsters.reduce((sum, m) => sum + m.xpValue, 0)

      for (const monster of deadMonsters) {
        monster.xpAwarded = true
      }

      for (const monster of disengagedMonsters) {
        gs.removeMonster(monster.id)
      }

      gs.setPhase('exploration')
      state.initiativeOrder = []
      state.currentTurn = null
      state.round = 0
      state.movementUsed = {}
      state.actionUsed = {}

      gs.addLogEntry({
        round: state.round,
        turn: 'system',
        action: 'COMBAT TERMINÉ',
        mechanicalDetail: `XP gagné: ${totalXP} (${deadMonsters.map(m => m.name).join(', ')})${disengagedMonsters.length > 0 ? ` | Désengagés: ${disengagedMonsters.map(m => m.name).join(', ')}` : ''}`,
      })

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            phase: 'exploration',
            xpAwarded: totalXP,
            reason,
            defeatedMonsters: deadMonsters.map(m => ({ id: m.id, name: m.name, xp: m.xpValue })),
            disengagedMonsters: disengagedMonsters.map(m => ({ id: m.id, name: m.name, type: m.type })),
          }),
        }],
      }
    }
  )

  // Spawns a monster from the template library onto the grid
  server.tool(
    'spawn_monster',
    'Places a creature token on the grid WITHOUT starting combat. Use this during exploration/narration to introduce NPCs or creatures the player notices or meets (e.g. neutral dryads, an awakened tree). Set disposition="neutral" or "friendly" for non-hostile creatures: no combat starts and they will not act against the player unless the player attacks them (then use start_encounter). Uses built-in stat blocks for known types.',
    {
      monsterType: z.string().describe('Monster type key: goblin, goblin_minion, goblin_boss, hobgoblin, hobgoblin_captain, skeleton, zombie, violet_fungus, wolf, bandit, dryad, awakened_tree'),
      cell: z.object({ x: z.number().int().min(0), y: z.number().int().min(0) }).describe('Grid position to spawn at'),
      name: z.string().optional().describe('Custom name override (e.g. "Gobelin Chef")'),
      hpOverride: z.number().int().positive().optional().describe('Override max HP'),
      disposition: z.enum(['hostile', 'neutral', 'friendly']).optional().describe('Attitude toward the player. Defaults to the template attitude (dryad/awakened_tree are neutral, others hostile). Use neutral/friendly to introduce a creature in narration without starting combat.'),
    },
    async ({ monsterType, cell, name, hpOverride, disposition }) => {
      try {
        rules.validateSpawn(cell)
      } catch (err) {
        return rules.ruleErrorResult(err)
      }

      const createdMonster = createMonster(monsterType, cell, name, hpOverride, disposition)
      gs.spawnMonster(createdMonster)
      return {
        content: [{ type: 'text', text: JSON.stringify(createdMonster) }],
      }

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
