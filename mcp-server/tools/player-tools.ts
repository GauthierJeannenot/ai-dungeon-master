import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import * as gs from '../game-state'
import * as rules from '../rules'
import { rollDice } from '../dice'
import { GameState } from '../../lib/types'

const ConditionSchema = z.enum([
  'blinded', 'charmed', 'deafened', 'frightened', 'grappled',
  'incapacitated', 'invisible', 'paralyzed', 'petrified', 'poisoned',
  'prone', 'restrained', 'stunned', 'unconscious', 'exhaustion',
])

const EntityStatsSchema = z.object({
  str: z.number().int(),
  dex: z.number().int(),
  con: z.number().int(),
  int: z.number().int(),
  wis: z.number().int(),
  cha: z.number().int(),
})

// Multi-map : les bornes dépendent de la MAP COURANTE (rules.mapBounds()),
// elles ne peuvent plus être figées dans un schéma construit à l'import. Le
// schéma ne garde que la forme ; la validation de borne se fait dans les
// handlers via rules.validateMapCell (source de vérité : maps[i].grid).
const PositionSchema = z.object({
  x: z.number().int().min(0),
  y: z.number().int().min(0),
})

const HpSchema = z.object({
  current: z.number().int().min(0),
  max: z.number().int().positive(),
})

const DeathSavesSchema = z.object({
  successes: z.number().int().min(0).max(3),
  failures: z.number().int().min(0).max(3),
  stable: z.boolean().optional(),
  dead: z.boolean().optional(),
})

const ItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(['weapon', 'armor', 'potion', 'misc']),
  damage: z.string().optional(),
  acBonus: z.number().optional(),
  description: z.string().optional(),
})

const AbilityKeySchema = z.enum(['str', 'dex', 'con', 'int', 'wis', 'cha'])
const ResourcePoolSchema = z.object({
  current: z.number().int().min(0),
  max: z.number().int().min(0),
})

const PlayerStateSchema = z.object({
  id: z.literal('player'),
  name: z.string(),
  class: z.string(),
  level: z.number().int().positive(),
  hp: HpSchema,
  deathSaves: DeathSavesSchema.optional(),
  ac: z.number().int(),
  stats: EntityStatsSchema,
  proficiencyBonus: z.number().int(),
  position: PositionSchema,
  conditions: z.array(ConditionSchema),
  inventory: z.array(ItemSchema),
  speed: z.number().int().positive(),
  initiative: z.number().optional(),
  // Personnage jouable : SANS ces champs, zod les STRIPPERAIT du round-trip
  // replace_game_state et le personnage perdrait classe/sorts/ressources au
  // premier tour (docs/playable-characters.md). Tous optionnels (legacy).
  characterId: z.string().optional(),
  savingThrowProficiencies: z.array(AbilityKeySchema).optional(),
  skillProficiencies: z.array(z.string()).optional(),
  expertise: z.array(z.string()).optional(),
  features: z.array(z.enum(['second_wind', 'spellcasting'])).optional(),
  spellSlots: z.object({ level1: ResourcePoolSchema }).optional(),
  knownSpells: z.array(z.string()).optional(),
  spellcastingAbility: AbilityKeySchema.optional(),
  resources: z.record(z.string(), ResourcePoolSchema).optional(),
})

const MonsterStateSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  hp: HpSchema,
  ac: z.number().int(),
  stats: EntityStatsSchema,
  position: PositionSchema,
  conditions: z.array(ConditionSchema),
  xpValue: z.number().int().min(0),
  attackBonus: z.number().int(),
  damageDice: z.string(),
  speed: z.number().int().positive(),
  initiative: z.number().optional(),
  isAlive: z.boolean(),
  xpAwarded: z.boolean().optional(),
  hostile: z.boolean().optional(),
})

const NpcStateSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.string(),
  position: PositionSchema,
  roomId: z.string().nullable(),
  mapId: z.string().optional(),
  disposition: z.enum(['hostile', 'wary', 'neutral', 'helpful', 'offended']),
  visible: z.boolean(),
  description: z.string().optional(),
})

const CombatLogEntrySchema = z.object({
  id: z.string(),
  round: z.number().int().min(0),
  turn: z.string(),
  action: z.string(),
  mechanicalDetail: z.string().optional(),
  timestamp: z.number(),
})

// Mémoire de scène libre : clés propres au module, non typées ici (le moteur ne
// fait que la round-tripper). z.record garantit la survie des états legacy sans
// coder de vocabulaire de module dans le moteur.
const SceneMemorySchema = z.record(z.string(), z.unknown())

const WorldFactSchema = z.object({
  id: z.string(),
  text: z.string(),
  source: z.string(),
  mapId: z.string(),
  roomId: z.string().optional(),
  expires: z.enum(['room', 'map', 'never']),
})

const GameStateSchema = z.object({
  phase: z.enum(['exploration', 'combat', 'dialogue']),
  // Personnage de la partie (miroir d'adventureId). Sans ce champ, zod le
  // stripperait au round-trip et la session retomberait sur le guerrier.
  characterId: z.string().optional(),
  player: PlayerStateSchema,
  monsters: z.record(z.string(), MonsterStateSchema),
  npcs: z.record(z.string(), NpcStateSchema).optional(),
  initiativeOrder: z.array(z.string()),
  currentTurn: z.string().nullable(),
  round: z.number().int().min(0),
  movementUsed: z.record(z.string(), z.number().min(0)).optional().default({}),
  actionUsed: z.record(z.string(), z.boolean()).optional().default({}),
  bonusActionUsed: z.record(z.string(), z.boolean()).optional().default({}),
  worldFacts: z.array(WorldFactSchema).optional().default([]),
  combatLog: z.array(CombatLogEntrySchema),
  roomsVisited: z.array(z.string()),
  currentRoomId: z.string().nullable(),
  // Multi-map : sans ces champs, zod les STRIPPERAIT du round-trip
  // replace_game_state et la partie retomberait sur la première map.
  currentMapId: z.string().optional(),
  mapOutcomes: z.record(z.string(), z.object({
    completion: z.enum(['partial', 'total']),
    objectivesDone: z.array(z.string()),
  })).optional(),
  encountersTriggered: z.array(z.string()).optional().default([]),
  sceneMemory: SceneMemorySchema.optional(),
  world: z.any().optional(),
}).superRefine((state, ctx) => {
  if (state.player.hp.current > state.player.hp.max) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['player', 'hp', 'current'],
      message: 'Player current HP cannot exceed max HP.',
    })
  }

  const monsterIds = new Set(Object.keys(state.monsters))
  for (const [key, monster] of Object.entries(state.monsters)) {
    if (monster.id !== key) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['monsters', key, 'id'],
        message: 'Monster id must match its record key.',
      })
    }
    if (monster.hp.current > monster.hp.max) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['monsters', key, 'hp', 'current'],
        message: 'Monster current HP cannot exceed max HP.',
      })
    }
    if (monster.isAlive !== (monster.hp.current > 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['monsters', key, 'isAlive'],
        message: 'Monster isAlive must match current HP.',
      })
    }
  }

  const validEntityIds = new Set(['player', ...monsterIds])
  const initiativeSeen = new Set<string>()
  for (const [index, id] of state.initiativeOrder.entries()) {
    if (initiativeSeen.has(id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['initiativeOrder', index],
        message: 'Initiative order cannot contain duplicate IDs.',
      })
    }
    initiativeSeen.add(id)
    if (!validEntityIds.has(id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['initiativeOrder', index],
        message: 'Initiative order contains an unknown entity ID.',
      })
    }
  }

  if (state.phase === 'combat') {
    if (!state.currentTurn || !initiativeSeen.has(state.currentTurn)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['currentTurn'],
        message: 'Combat currentTurn must be present in initiativeOrder.',
      })
    }
    if (state.round < 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['round'],
        message: 'Combat round must be at least 1.',
      })
    }
  } else {
    if (state.currentTurn !== null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['currentTurn'],
        message: 'Non-combat currentTurn must be null.',
      })
    }
  }
})

export function registerPlayerTools(server: McpServer): void {
  // Returns full serializable game state snapshot
  server.tool(
    'get_game_state',
    'Returns the complete current game state (player, monsters, phase, initiative, log)',
    {},
    async () => {
      const state = gs.getState()
      return {
        content: [{ type: 'text', text: JSON.stringify(state, null, 2) }],
      }
    }
  )

  // Internal sync point used by the Next.js API to hydrate this per-session MCP process.
  // The route filters this tool out before sending the tool list to the LLM.
  server.tool(
    'replace_game_state',
    'Internal: replaces the complete game state for this MCP session.',
    {
      gameState: GameStateSchema.describe('Complete serializable game state snapshot'),
    },
    async ({ gameState }) => {
      const state = gs.replaceState(gameState as GameState)
      return {
        content: [{ type: 'text', text: JSON.stringify(state) }],
      }
    }
  )

  // Moves any token (player or monster) to a grid cell
  server.tool(
    'move_token',
    'Moves a token to a new grid cell. tokenId is "player" or a monster ID.',
    {
      tokenId: z.string().describe('ID of the token to move ("player" or monster ID)'),
      toCell: z.object({
        x: z.number().int().min(0),
        y: z.number().int().min(0),
      }).describe('Target grid coordinates'),
    },
    async ({ tokenId, toCell }) => {
      try {
        const movement = rules.validateMove(tokenId, toCell)
        const beforeState = gs.getState()
        const entityBefore = gs.getEntity(tokenId)
        const fromCell = entityBefore ? { ...entityBefore.position } : null
        const roomBefore = beforeState.currentRoomId
        gs.moveToken(tokenId, toCell.x, toCell.y)
        rules.recordMove(tokenId, movement.distance)

        const entity = gs.getEntity(tokenId)
        const name = entity ? ('name' in entity ? entity.name : 'Player') : tokenId
        const state = gs.getState()
        const roomTransition = tokenId === 'player'
          ? ` | salle ${roomBefore ?? 'inconnue'} -> ${state.currentRoomId ?? 'inconnue'}`
          : ''
        gs.addLogEntry({
          round: state.round,
          turn: state.currentTurn ?? tokenId,
          action: `${name} se deplace`,
          mechanicalDetail: `Deplacement ${fromCell ? `(${fromCell.x},${fromCell.y})` : '?'} -> (${toCell.x},${toCell.y}) | distance ${movement.distance}${movement.remaining === null ? '' : ` | mouvement restant ${movement.remaining}`}${roomTransition}`,
        })

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              tokenId,
              name,
              newPosition: toCell,
              distanceMoved: movement.distance,
              remainingMovement: movement.remaining,
              currentRoomId: state.currentRoomId,
              roomsVisited: state.roomsVisited,
            }),
          }],
        }
      } catch (err) {
        return rules.ruleErrorResult(err)
      }
    }
  )

  // Modifies HP of any entity (positive = heal, negative = damage)
  server.tool(
    'update_hp',
    'Modifies HP of an entity. delta is positive for healing, negative for damage.',
    {
      entityId: z.string().describe('Entity ID ("player" or monster ID)'),
      delta: z.number().describe('HP change: positive = heal, negative = damage'),
      reason: z.string().describe('Reason for HP change (e.g. "longsword hit", "fireball")'),
    },
    async ({ entityId, delta, reason }) => {
      try {
        rules.validateHPUpdate(entityId, delta)

        // Capturer les PV AVANT mutation : entity.hp.current - delta serait faux
        // quand les PV sont écrêtés (soin au-delà du max, dégâts sous 0).
        const hpBefore = gs.getEntity(entityId)?.hp.current ?? 0

        let entity
        if (entityId === 'player') {
          entity = gs.updatePlayerHP(delta)
        } else {
          entity = gs.updateMonsterHP(entityId, delta)
        }

        const died = 'isAlive' in entity ? !entity.isAlive : entity.hp.current === 0
        gs.addLogEntry({
          round: gs.getState().round,
          turn: gs.getState().currentTurn ?? 'N/A',
          action: `${entity.name}: ${delta > 0 ? '+' : ''}${delta} HP (${reason})`,
          mechanicalDetail: `HP: ${entity.hp.current}/${entity.hp.max}${died ? ' — MORT' : ''}`,
        })

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              entityId,
              name: entity.name,
              hpBefore,
              hpAfter: entity.hp.current,
              hpMax: entity.hp.max,
              died,
              reason,
            }),
          }],
        }
      } catch (err) {
        return rules.ruleErrorResult(err)
      }
    }
  )

  server.tool(
    'use_healing_potion',
    'Consumes one healing potion from the player inventory, rolls its healing, applies HP, and consumes the player action in combat. Use this instead of roll_dice for drinking a potion.',
    {
      potionId: z.string().optional().describe('Optional exact potion item id. Defaults to the first healing potion in inventory.'),
    },
    async ({ potionId }) => {
      try {
        rules.validateActionUse('player')

        const playerBefore = gs.getPlayer()
        const potion = playerBefore.inventory.find(item =>
          potionId ? item.id === potionId : item.type === 'potion'
        )
        if (!potion) {
          throw new rules.RuleViolation('ITEM_NOT_FOUND', 'The player has no healing potion to drink.', {
            potionId,
            inventory: playerBefore.inventory.map(item => ({ id: item.id, name: item.name, type: item.type })),
          })
        }

        const hpBefore = playerBefore.hp.current
        const hpMax = playerBefore.hp.max
        const healingRoll = rollDice('2d4+2')
        const consumed = gs.consumePlayerItem(item => item.id === potion.id)
        if (!consumed) {
          throw new rules.RuleViolation('ITEM_NOT_FOUND', 'The healing potion disappeared before it could be consumed.', {
            potionId: potion.id,
          })
        }

        const playerAfter = gs.updatePlayerHP(healingRoll.total)
        if (gs.getState().phase === 'combat' && gs.getState().currentTurn === 'player') {
          rules.recordAction('player')
        }

        const remainingPotions = playerAfter.inventory.filter(item => item.type === 'potion').length
        const mechanicalSummary = `Potion de soin: ${healingRoll.detail} | HP ${hpBefore}/${hpMax} -> ${playerAfter.hp.current}/${playerAfter.hp.max} | potions restantes: ${remainingPotions}`
        gs.addLogEntry({
          round: gs.getState().round,
          turn: gs.getState().currentTurn ?? 'player',
          action: `${playerAfter.name} boit ${consumed.name}`,
          mechanicalDetail: mechanicalSummary,
        })

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              entityId: 'player',
              itemId: consumed.id,
              itemName: consumed.name,
              healingRoll,
              healingDone: playerAfter.hp.current - hpBefore,
              hpBefore,
              hpAfter: playerAfter.hp.current,
              hpMax: playerAfter.hp.max,
              remainingPotions,
              mechanicalSummary,
            }),
          }],
        }
      } catch (err) {
        return rules.ruleErrorResult(err)
      }
    }
  )

  // Returns full stats of any entity
  server.tool(
    'get_entity_stats',
    'Returns complete stats of a player or monster entity',
    {
      entityId: z.string().describe('Entity ID ("player" or monster ID)'),
    },
    async ({ entityId }) => {
      const entity = gs.getEntity(entityId)
      if (!entity) {
        return rules.ruleErrorResult(new rules.RuleViolation('ENTITY_NOT_FOUND', `Entity not found: ${entityId}`, {
          entityId,
        }))
      }
      return {
        content: [{ type: 'text', text: JSON.stringify(entity, null, 2) }],
      }
    }
  )
}
