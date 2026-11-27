import { ObjectiveJournalSchema } from '../../lib/objective-journal'
import { complexTrapSlot } from '../../lib/complex-trap-initiative'
import { AdamantineWitnessSchema } from '../../lib/adamantine-witness'
import { registerNavigationTools } from './navigation-tools'
import { weatherRoundPauseValid } from '../../lib/weather-state'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { CLASS_FEATURE_IDS } from '../../lib/types'
import { HeroStateSchema } from '../../lib/hero-state'
import { DmToolStateSchema } from '../../lib/dm-tool-state'
import { migrateSocialState } from '../../lib/social-interaction-state'
import { SocialPersonalitySchema } from '../../lib/social'
import { healingRoll as heroHealingRoll,strictHero,effects } from '../hero-rules'
import { assertBreathingRecoveryAllowed } from '../breathing'
import * as gs from '../game-state'
import * as rules from '../rules'
import { resolveAbilityCheck } from '../ability-check'
import { getAdventureMap, inferRoomIdOnMap, firstMapId } from '../../lib/adventure-map'
import { rollDice } from '../dice'
import { GameState } from '../../lib/types'
import { assertDoorReach, getDoor, getDoorState } from '../doors'
import { StoredWaterEffectSchema } from '../water-effect'
import { SceneEffectSchema, NarrativeDescriptionSchema } from '../scene-facts'
import { dealDamage, DamageTypeSchema, monsterSource, hasTrait } from '../monster-rules'
import { toolkitTransaction } from '../toolkit'
import { KnockoutStateSchema, isKnockedOut } from '../../lib/nonlethal-state'
import { NpcLifeStateSchema, hasNpcZeroHpEpisode,hasUnresolvedNpcLifeObservation } from '../../lib/npc-life-state'
import { AmmunitionTypeSchema } from '../../lib/ammunition-state'

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
  max: z.number().int().nonnegative(),
})

const DeathSavesSchema = z.object({
  successes: z.number().int().min(0).max(3),
  failures: z.number().int().min(0).max(3),
  stable: z.boolean().optional(),
  dead: z.boolean().optional(),
})

const ItemSchema = z.object({
  adventureRewardId:z.string().min(1).max(80).optional(),
  adamantine:AdamantineWitnessSchema.optional(),
  quantity: z.number().int().nonnegative().optional(),
  ammunitionType: AmmunitionTypeSchema.optional(),
  equipmentId: z.string().optional(),
  spellIds: z.array(z.string()).optional(),
  id: z.string(),
  name: z.string(),
  type: z.enum(['weapon', 'armor', 'potion', 'misc']),
  damage: z.string().optional(),
  acBonus: z.number().optional(),
  description: z.string().optional(),
  magical: z.boolean().optional(),
  silvered: z.boolean().optional(),
})

const AbilityKeySchema = z.enum(['str', 'dex', 'con', 'int', 'wis', 'cha'])
const ResourcePoolSchema = z.object({
  current: z.number().int().min(0),
  max: z.number().int().min(0),
})

const PlayerStateSchema = z.object({
  toolProficiencies: z.array(z.string()).optional(),
  ruleset: z.literal('srd2014').optional(),
  subclassId: z.enum(['champion', 'lore', 'evocation', 'life']).optional(),
  spellbook: z.array(z.string()).optional(), domainSpells: z.array(z.string()).optional(), languages: z.array(z.string()).optional(),
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
  features: z.array(z.enum(CLASS_FEATURE_IDS)).optional(),
  spellSlots: z.object({ level1: ResourcePoolSchema, level2: ResourcePoolSchema.optional(),
    level3: ResourcePoolSchema.optional(), level4: ResourcePoolSchema.optional() }).optional(),
  knownSpells: z.array(z.string()).optional(),
  spellcastingAbility: AbilityKeySchema.optional(),
  resources: z.record(z.string(), ResourcePoolSchema).optional(),
})

const NpcStatBlockSchema = z.object({
  type: z.string(), name: z.string(), ruleset: z.literal('2014'),
  sourceUrl: z.string(), sourceSha256: z.string(), published: z.record(z.string(), z.unknown()),
  homebrew: z.string().optional(),
})
const NpcGroupSchema = z.object({
  rule: z.literal('shared-hp-attrition-v1'), name: z.string(),
  members: z.array(z.object({ id: z.string(), name: z.string() })).min(1),
  initialCount: z.number().int().positive(), remainingCount: z.number().int().nonnegative(),
  memberMaxHp: z.number().int().positive(), incapacitatedCount: z.number().int().nonnegative(),
  cannotRegainHp: z.literal(true), cannotGainTemporaryHp: z.literal(true),
})
const MonsterStateSchema = z.object({
  statBlock: NpcStatBlockSchema.optional(),
  group: NpcGroupSchema.optional(),
  socialIdentity: z.string().optional(),
  controller: z.literal('reactive_npc').optional(),
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
  speed: z.number().int().nonnegative(),
  attackName: z.string().optional(),
  attackRangeCells: z.number().positive().optional(),
  damageType: z.string().optional(),
  movementModes: z.object({ walk: z.number().nonnegative().optional(), fly: z.number().nonnegative().optional(),
    swim: z.number().nonnegative().optional(), climb: z.number().nonnegative().optional(),
    burrow: z.number().nonnegative().optional(), hover: z.boolean().optional() }).optional(),
  srd: z.object({ index: z.string(), ruleset: z.literal('2014'), url: z.string(), hpOverride: z.number().int().positive().optional() }).optional(),
  monsterRuntime: z.object({ spellSlots:z.record(z.string(),ResourcePoolSchema).optional(), startedTurn: z.string().optional(), martialAdvantageTurn: z.string().optional(),
    recharge: z.record(z.string(), z.boolean()).optional(), invisibleConcentration: z.boolean().optional() }).optional(),
  initiative: z.number().optional(),
  isAlive: z.boolean(),
  knockout: KnockoutStateSchema.optional(),
  npcLife:NpcLifeStateSchema.optional(),
  xpAwarded: z.boolean().optional(),
  hostile: z.boolean().optional(),
})

const NpcStateSchema = MonsterStateSchema.partial().extend({
  id: z.string(),
  name: z.string(),
  kind: z.string(),
  position: PositionSchema,
  roomId: z.string().nullable(),
  mapId: z.string().optional(),
  partyEvents: z.record(z.string(),z.string()).optional(),
  partyHistory: z.array(z.string().min(1).max(120)).max(128).refine(ids=>new Set(ids).size===ids.length).optional(),
  continuityHistory: z.array(z.string().min(1).max(120)).max(128).refine(ids=>new Set(ids).size===ids.length).optional(),
  disposition: z.enum(['hostile', 'wary', 'neutral', 'helpful', 'offended']),
  visible: z.boolean(),
  description: z.string().optional(),
  hp: z.object({ current: z.number().min(0), max: z.number().positive() }).optional(),
  conditions: z.array(ConditionSchema).optional(),
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
  improvisedHazardEventId:z.string().min(1).max(80).optional(),
  improvisedHazardResultWitness:z.string().optional(),
  id: z.string(),
  clueId: z.string().optional(),
  text: z.string(),
  source: z.string(),
  mapId: z.string(),
  roomId: z.string().optional(),
  expires: z.enum(['room', 'map', 'never']),
  waterEffect: StoredWaterEffectSchema.optional(),
  narrativeEffect: SceneEffectSchema.optional(),
  subjectItemId: z.string().optional(),
  basis: z.literal('ai_interpretation').optional(),
})

const GameStateSchema = z.object({
  objectiveJournal: ObjectiveJournalSchema.optional(),
  socialProfileSeed: z.string().min(1).max(100).optional(),
  socialPersonalities: z.record(z.string(), SocialPersonalitySchema).optional(),
  dmTools: z.preprocess(value => migrateSocialState({ dmTools: value }).dmTools, DmToolStateSchema.optional()),
  worldTimeSeconds: z.number().nonnegative().optional(), turnCounter: z.number().int().nonnegative().optional(),
  monsterEffects: z.array(z.object({ id: z.string(), sourceId: z.string(), targetId: z.string(), kind: z.string(),
    conditions: z.array(ConditionSchema), expiresAt: z.number().optional(), endsOnDamage: z.boolean().optional(),
    dc: z.number().optional(), repeatSave: AbilityKeySchema.optional(), hpMaxReduction: z.number().nonnegative().optional(), agingYears: z.number().nonnegative().optional(),
    petrificationPause: z.object({ pausedAt: z.number().nonnegative(), conditions: z.array(ConditionSchema).length(1) }).strict().optional(),
    spritePoisonId: z.string().min(1).max(180).optional(),
  }).superRefine((effect,ctx)=>{
    if(effect.petrificationPause&&(effect.conditions.length||!['sprite-poison','sprite-sleep'].includes(effect.kind)
      ||effect.petrificationPause.conditions[0]!== (effect.kind==='sprite-poison'?'poisoned':'unconscious')
      ||effect.expiresAt===undefined||effect.expiresAt<=effect.petrificationPause.pausedAt))
      ctx.addIssue({code:z.ZodIssueCode.custom,message:'Only exact existing sprite poison/sleep symptoms with a remaining source duration can be suspended.'})
    if(effect.spritePoisonId&&effect.kind!=='sprite-sleep')
      ctx.addIssue({code:z.ZodIssueCode.custom,message:'Only sprite sleep may link to its actual sprite poison.'})
  })).optional(),
  monsterPowerImmunities: z.array(z.object({ sourceId: z.string(), targetId: z.string(), power: z.string(), expiresAt: z.number() })).optional(),
  playerActionRevision: z.number().int().nonnegative().optional(),
  combatGeneration: z.number().int().nonnegative().optional(),
  npcActivationLedger: z.array(z.string()).optional(),
  handledRequestIds: z.array(z.string()).optional(),
  dmActionAllowance: z.object({ requestId: z.string(), actionRevisionAtStart: z.number().int().nonnegative(),
    granted: z.boolean(), reason: z.string().optional(), combatTurnKey: z.string().optional() }).optional(),
  phase: z.enum(['exploration', 'combat', 'dialogue']),
  // Personnage de la partie (miroir d'adventureId). Sans ce champ, zod le
  // stripperait au round-trip et la session retomberait sur le guerrier.
  characterId: z.string().optional(),
  player: PlayerStateSchema,
  monsters: z.record(z.string(), MonsterStateSchema),
  npcs: z.record(z.string(), NpcStateSchema).optional(),
  droppedItems: z.record(z.string(), z.object({
    item: ItemSchema,
    mapId: z.string(),
    roomId: z.string().nullable(),
    position: PositionSchema,
    description: NarrativeDescriptionSchema.optional(),
    anchor: z.object({ entityId: z.string(), name: z.string(), position: PositionSchema }).optional(),
  })).optional(),
  hero: HeroStateSchema.optional(),
  initiativeOrder: z.array(z.string()),
  currentTurn: z.string().nullable(),
  round: z.number().int().min(0),
  diagonalMovementUsed: z.record(z.string(), z.number().int().min(0)).optional().default({}),
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
    campaignOutcomeIds: z.array(z.string()).optional(),
  })).optional(),
  encountersTriggered: z.array(z.string()).optional().default([]),
  campaignOutcomeHistory: z.array(z.string()).optional(),
  adventuringCycleEvents: z.record(z.string(),z.string()).optional(),
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
    if (monster.knockout && (!isKnockedOut(monster) || monsterSource(monster)?.condition_immunities.some(condition => condition.index === 'unconscious'))) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['monsters', key, 'knockout'],
        message: 'Knockout requires a living, unconscious, nonimmune creature at exactly zero HP.' })
    }
    if(monster.knockout&&(monster.knockout.at>(state.worldTimeSeconds??0)||(state.worldTimeSeconds??0)>=(monster.knockout.recovery?.wakeAt??monster.knockout.at+3600)))
      ctx.addIssue({code:z.ZodIssueCode.custom,path:['monsters',key,'knockout','at'],
        message:'A knockout timestamp cannot be in the future or skip its persisted recovery deadline (one-hour boundary for legacy saves without a timer).'})
    if (monster.isAlive !== (monster.hp.current > 0 || isKnockedOut(monster)||hasNpcZeroHpEpisode(monster)||hasUnresolvedNpcLifeObservation(monster))) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['monsters', key, 'isAlive'],
        message: 'Monster isAlive must match current HP, an explicit stable knockout or a tracked NPC zero-HP episode.',
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
    if (!validEntityIds.has(id) && !complexTrapSlot(state as GameState,id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['initiativeOrder', index],
        message: 'Initiative order contains an unknown entity ID.',
      })
    }
  }

  const nutrition = state.dmTools?.survival, pendingRound = nutrition?.pendingCombatRound
  const nutritionPause = Boolean(pendingRound && state.phase === 'combat' && state.currentTurn === null
    && nutrition!.status === 'active' && !state.player.deathSaves?.dead
    && (state.worldTimeSeconds ?? 0) >= nutrition!.day.endsAt
    && pendingRound.round === state.round && pendingRound.dayIndex === nutrition!.day.index
    && pendingRound.combatGeneration === (state.combatGeneration ?? 0)
    && pendingRound.mapId === (state.currentMapId ?? firstMapId(state as GameState)))
  if (pendingRound && !nutritionPause) ctx.addIssue({
    code: z.ZodIssueCode.custom, path: ['dmTools', 'survival', 'pendingCombatRound'],
    message: 'A nutrition round pause must match its due day, combat generation, round and map.',
  })
  if (state.phase === 'combat') {
    if ((!state.currentTurn || !initiativeSeen.has(state.currentTurn)) && !nutritionPause && !weatherRoundPauseValid(state as GameState)) {
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
    async ({ gameState }) => toolkitTransaction(() => {
      const state = gs.replaceState(gameState as GameState, { prepareSocial: true })
      return {
        content: [{ type: 'text', text: JSON.stringify(state) }],
      }
    })
  )

  registerNavigationTools(server)

  // Modifies HP of any entity (positive = heal, negative = damage)
  server.tool(
    'update_hp',
    'Modifies HP of an entity. delta is positive for healing, negative for damage.',
    {
      entityId: z.string().describe('Entity ID ("player" or monster ID)'),
      delta: z.number().describe('HP change: positive = heal, negative = damage'),
      reason: z.string().describe('Reason for HP change (e.g. "longsword hit", "fireball")'),
      damageType: DamageTypeSchema.optional().describe('Required for damage against a creature with source defenses or Undead Fortitude. Prefer attack/spell tools for attacks and spells.'),
      damageOrigin: z.enum(['weapon', 'spell', 'environment']).optional().describe('Explicit origin for typed damage; conditional weapon resistances use this field.'),
      magical: z.boolean().optional(), silvered: z.boolean().optional(), critical: z.boolean().optional(),
      sourceId: z.string().optional().describe('Exact creature causing this damage, needed to resolve harmful actions against tracked charms. Omit for environmental damage.'),
    },
    async ({ entityId, delta, reason, damageType, damageOrigin, magical, silvered, critical, sourceId }) => {
      try {
        rules.validateHPUpdate(entityId, delta)
        const target = gs.getEntity(entityId)!
        const source = monsterSource(target)
        if (sourceId && !gs.getEntity(sourceId)) throw new rules.RuleViolation('ENTITY_NOT_FOUND', 'Damage source does not exist.', { sourceId })
        if (delta < 0 && sourceId) rules.validateHostileTarget(sourceId, entityId)
        if (delta < 0 && (gs.getState().monsterEffects?.some(e => e.targetId === entityId && e.kind === 'fey-charm') || effects('charm-person',entityId).length) && !sourceId && damageOrigin !== 'environment')
          throw new rules.RuleViolation('DAMAGE_SOURCE_REQUIRED', 'Select a creature sourceId or explicitly environmental damage for this charmed target.', {})
        if (delta < 0 && (source?.damage_immunities.length || source?.damage_resistances.length || source?.damage_vulnerabilities.length || hasTrait(target, 'Undead Fortitude') || target.conditions.includes('petrified'))
          && (!damageType || !damageOrigin)) throw new rules.RuleViolation('DAMAGE_CONTEXT_REQUIRED', 'Choose the damage type and origin; a raw HP delta cannot bypass source defenses.', {})

        // Capturer les PV AVANT mutation : entity.hp.current - delta serait faux
        // quand les PV sont écrêtés (soin au-delà du max, dégâts sous 0).
        const hpBefore = gs.getEntity(entityId)?.hp.current ?? 0

        let entity
        let damageResolution
        if (delta < 0) {
          damageResolution = dealDamage(entityId, -delta, damageType ?? 'bludgeoning', { magical: magical || damageOrigin === 'spell', silvered, critical, weaponAttack: damageOrigin === 'weapon', sourceId })
          entity = gs.getEntity(entityId)!
        } else if (entityId === 'player') {
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
              damageResolution,
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

        if(gs.getState().dmTools?.magicItems?.[potion.id])throw new rules.RuleViolation('DEDICATED_TOOL_REQUIRED','Use use_magic_item with this exact registered potion and drinker targetId; its source potency must not be replaced by 2d4+2.',{})

        const hpBefore = playerBefore.hp.current
        const hpMax = playerBefore.hp.max
        assertBreathingRecoveryAllowed('player')
        const healingRoll = strictHero()?heroHealingRoll('2d4+2','player'):rollDice('2d4+2')
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
