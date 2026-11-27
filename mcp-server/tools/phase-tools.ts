import { isEnrolledNonhostileNpcCombatant,activeNpcPartyRegistration } from '../../lib/npc-party-state'
import { isStatBackedNpc } from '../../lib/npc-stat-blocks'
import { preflightCampaignEngagement,recordCampaignEngagement,planCampaignEncounterClosures,commitCampaignEncounterClosures } from '../campaign-outcomes'
import { enrollComplexTrapInitiative, inspectComplexTrapTurn } from '../../lib/complex-trap-initiative'
import { encounterCadenceTransitionIssue } from '../../lib/encounter-cadence-state'
import { withCackleConsequences, stageCackleCombat, assertCackleEventsResolved } from '../cackle-fever'
import { chaseTurnIssue } from '../../lib/chase-state'
import { sewerPlagueEvent } from '../sewer-plague'
import { dueFrigidWaterSave } from '../../lib/frigid-water-state'
import { eligibleXgeFallInitiative } from '../../lib/xge-falling-geometry'
import { dueXgeFallDescent } from '../../lib/xge-falling-state'
import { afflictionRequiresInitiativeTurn } from '../afflictions'
import { isSurvivalDayDue, assertSurvivalEventsResolved } from '../survival'
import { assertWeaponConsumableTimeAdvance } from '../weapon-consumables'
import { assertOilTimeAdvance } from '../oil-ground'
import { HazardCombatPreparationSchema,validateHazardCombatPreparation,validateActiveComplexTrapGeometry,type HazardCombatPreparation,type HazardCombatWitness } from '../hazard-combat'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { rollDice, getAbilityModifier, d20WithModifier } from '../dice'
import * as gs from '../game-state'
import * as rules from '../rules'
import { MonsterState } from '../../lib/types'
import { EncounterMonsterSpec, encounterIds, getEncounter, getMapSpec, resolveRoomMapId,inferRoomIdOnMap } from '../../lib/adventure-map'
import { ACTIVE_ADVENTURE_ID } from '../adventure'
import { getMonsterRecord, listMonsterTypes, MONSTER_SOURCE_DATE } from '../../lib/srd/monsters'
import { monsterAutomation } from '../monster-automation'
import { strictHero, hero } from '../hero-rules'
import { encounterAwareness, pendingEncounterActors, pendingDoorAmbush } from '../../lib/encounter-awareness'
import { registerAmbushResolutions, resolveEncounterAmbush } from '../encounter-ambush'
import { attackProfile } from '../monster-rules'
import { canSee } from '../monster-perception'
import { navigationGrid } from '../../lib/navigation'
import { completedRoundEvents } from '../../lib/combat-round-events'
import { isActiveMonster, isKnockedOut } from '../../lib/nonlethal-state'
import { assertKnockoutTimeAdvance } from '../nonlethal'
import { hasNpcZeroHpEpisode } from '../../lib/npc-life-state'
import { assertNpcLifeTimeAdvance, dueNpcDeathSaveEvents, assertNpcCombatRoster, assertNpcRoundEventRoster } from '../npc-life'
import { CombatSurpriseInputSchema, EncounterSurpriseInputSchema, type CombatSurpriseInput } from '../../lib/surprise-state'
import { validateCombatSurprise, initializeCombatSurprise, validateEncounterSurprise, encounterCombatSurprise } from '../surprise'

// Base statistics are generated from the pinned SRD API snapshot.
const MONSTER_TEMPLATES = Object.fromEntries(listMonsterTypes().map(type => [type, getMonsterRecord(type)!.engine]))

let monsterIdCounter = 0

// A restored legacy combat may contain an exhaustion marker without its level.
// Check every combatant before ending effects, logging a pass, changing turn
// economy or rolling: a late initiative refusal must not commit half a turn.
function assertTurnExhaustionLevels(): void {
  const chase=chaseTurnIssue(gs.getState());if(chase)throw new rules.RuleViolation(chase.code,chase.message,chase)

  assertNpcLifeTimeAdvance(6)
  assertNpcRoundEventRoster(gs.getState().round+1)
  assertKnockoutTimeAdvance(6,true)
  const state = gs.getState()
  for (const id of state.initiativeOrder) {
    if (gs.getEntity(id)?.conditions.includes('exhaustion') && !state.dmTools?.exhaustion?.creatures[id])
      throw new rules.RuleViolation('EXHAUSTION_LEVEL_REQUIRED', 'An explicit authoritative exhaustion level is required before advancing combat turns.', { targetId: id })
  }
}

export function createMonster(monsterType: string, cell: { x: number; y: number }, name?: string, hpOverride?: number): MonsterState {
  const normalizedType = monsterType.toLowerCase()
  const id = `${normalizedType}_${Date.now()}_${monsterIdCounter++}`
  const template = MONSTER_TEMPLATES[normalizedType]

  const record = getMonsterRecord(normalizedType)
  if (!template || !record) throw new rules.RuleViolation('MONSTER_UNKNOWN', 'Choose an exact monster type from the SRD catalog; no fabricated fallback stats.', { monsterType, available: listMonsterTypes() })

  const maxHp = hpOverride ?? template.hp.max
  return {
    ...structuredClone(template),
    id,
    name: name ?? record.source.name,
    hp: { current: maxHp, max: maxHp },
    position: { ...cell },
    // Social stance is separate from the published mechanical block.
    ...(['dryad', 'awakened_tree', 'awakened_shrub'].includes(normalizedType) ? { hostile: false } : {}),
    srd: { index: record.source.index, ruleset: '2014', url: record.sourceUrl,
      ...(hpOverride !== undefined ? { hpOverride } : {}) },
    isAlive: true,
    ...(normalizedType==='mage'&&strictHero()?{monsterRuntime:{spellSlots:{level1:{current:4,max:4},level2:{current:3,max:3},level3:{current:3,max:3},level4:{current:3,max:3},level5:{current:1,max:1}}}}:{}),
  }
}

export function startCombat(combatants: string[], options?: { tieOrder?: string[]; surprise?: CombatSurpriseInput; hazardPreparation?: HazardCombatPreparation }): ReturnType<typeof startCombatResolved> {
  const witness=options?.hazardPreparation?validateHazardCombatPreparation(gs.getState(),options.hazardPreparation,combatants):undefined
  assertCackleEventsResolved()
  return withCackleConsequences(()=>witness||combatants.some(id=>afflictionRequiresInitiativeTurn(gs.getState(),id))?gs.withPhysicalCreatureResolution(combatants,()=>startCombatResolved(combatants,options,witness)):startCombatResolved(combatants,options))
}

function startCombatResolved(combatants: string[], options?: { tieOrder?: string[]; surprise?: CombatSurpriseInput }, hazardPreparation?: HazardCombatWitness): {
  phase: 'combat'
  initiativeOrder: string[]
  initiatives: Array<{ id: string; initiative: number; roll: string }>
  currentTurn: string | null
  round: number
  surprise?: import('../../lib/surprise-state').SurpriseState
  npcDeathSaveEvents: ReturnType<typeof dueNpcDeathSaveEvents>
  hazardPreparation?: HazardCombatWitness
} {
  rules.validateEnterCombat(combatants,hazardPreparation)
  validateActiveComplexTrapGeometry(gs.getState())
  gs.validateInitiativeInput(combatants, options)
  validateCombatSurprise(combatants, options?.surprise)
  for (const id of combatants) if (gs.getEntity(id)?.conditions.includes('exhaustion') && !gs.getState().dmTools?.exhaustion?.creatures[id])
    throw new rules.RuleViolation('EXHAUSTION_LEVEL_REQUIRED','An explicit authoritative exhaustion level is required before entering combat.',{targetId:id})
  const fallingEntries=eligibleXgeFallInitiative(gs.getState(),combatants)
  gs.enlistNpcCombatants(combatants)
  gs.setPhase('combat')
  if(hazardPreparation?.kind==='complex_trap'){const trap=gs.getState().dmTools!.complexTraps![hazardPreparation.hazardId];trap.status='active';trap.activated=true}

  const initiatives = gs.rollInitiatives(combatants, options)
  const order = initiatives.map(i => i.id)
  initializeCombatSurprise(options?.surprise)
  gs.setInitiativeOrder(order)
  stageCackleCombat()
  for(const entry of fallingEntries)(gs.getState().dmTools!.xgeFalling!.initiativeFalls??={})[`${entry.generation}:${entry.entityId}`]=entry

  gs.addLogEntry({
    round: 1,
    turn: 'system',
    action: 'COMBAT ENGAGE',
    mechanicalDetail: initiatives.map(i => `${i.id}: ${i.roll}`).join(' | ')+(hazardPreparation?` | preparation ${hazardPreparation.kind}:${hazardPreparation.hazardId}`:''),
  })

  return {
    phase: 'combat',
    initiativeOrder: order,
    initiatives,
    currentTurn: gs.getState().currentTurn,
    round: 1,
    surprise: gs.getState().dmTools?.surprise,
    npcDeathSaveEvents: dueNpcDeathSaveEvents(),
    ...(hazardPreparation?{hazardPreparation}:{}),
  }
}

function assertEncounterCanStart(playerCell: { x: number; y: number } | undefined, monsters: EncounterMonsterSpec[], encounterId?: string, allowActiveCombat = false): void {
  const state = gs.getState()
  const cadence=encounterCadenceTransitionIssue(state);if(cadence)throw new rules.RuleViolation(cadence.code,cadence.message,cadence)
  if (state.phase === 'combat' && !allowActiveCombat) {
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
  const grid = navigationGrid(state, 'player', getMapSpec(state.currentMapId, gs.getState()).geometry)
  for (const cell of [playerCell ?? state.player.position, ...monsters.map(m => m.cell)]) {
    rules.validateMapCell(cell, 'encounter.cell')
    if (!grid.free(cell, false)) throw new rules.RuleViolation('DESTINATION_BLOCKED', 'Encounter placement is on impassable terrain.', { cell })
  }

  const occupied = new Map<string, string>()
  for (const actor of pendingEncounterActors(state)) {
    if (actor.encounterId !== encounterId) occupied.set(`${actor.position.x},${actor.position.y}`, actor.id)
  }
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
    if (!getMonsterRecord(monster.monsterType.toLowerCase())) {
      throw new rules.RuleViolation('MONSTER_UNKNOWN', 'Encounter includes an unknown SRD monster type.', { monsterType: monster.monsterType })
    }
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

export function registerEncounterInspectionTools(server: McpServer): void {
  server.registerTool('inspect_encounter', {
    description: 'Read-only confidential MJ inspection of one exact authored encounterId on the current map, including installed dungeon encounters. Returns the exact zero-based monsterIndex roster, source types, saved positions, player placement and awareness/ambush status for explicit start_encounter choices. Does not reveal anything to the player, visit a room, react to noise, spawn, roll, start combat or spend resources. No default encounter selection.',
    inputSchema: {encounterId:z.string().min(1).max(180)},
    annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false},
  },async({encounterId})=>{
    try{
      const state=gs.getState(),preset=encounterIds(state).includes(encounterId)?getEncounter(encounterId,state):null
      if(!preset)throw new rules.RuleViolation('UNKNOWN_ENCOUNTER','Choose one exact authored encounterId.',{encounterId})
      const mapId=getMapSpec(state.currentMapId,state).id,encounterMapId=resolveRoomMapId(preset.roomId,state)
      if(encounterMapId!==mapId)throw new rules.RuleViolation('ENCOUNTER_WRONG_MAP','Inspect only a preset on the current map.',{encounterId,encounterMapId,currentMapId:mapId})
      const awareness=encounterAwareness(state)[encounterId]
      return{content:[{type:'text' as const,text:JSON.stringify({confidential:true,encounterId,name:preset.name,mapId,roomId:preset.roomId,
        alreadyTriggered:gs.hasEncounterTriggered(encounterId),playerCell:awareness?undefined:preset.playerCell,
        roster:preset.monsters.map((monster,monsterIndex)=>({monsterIndex,...monster,cell:awareness?awareness.positions[monsterIndex]:monster.cell})),
        awareness:awareness?{status:awareness.status,doorId:awareness.doorId}:undefined,
        mechanicalSummary:'Confidential MJ roster only; no player discovery, movement, spawn, combat, die or cost.'})}]}
    }catch(err){return rules.ruleErrorResult(err)}
  })
}

export function registerPhaseTools(server: McpServer): void {
  registerAmbushResolutions()
  server.tool(
    'grant_player_action',
    'Exceptional DM ruling: grant the player ONE additional action when established circumstances warrant it. Never routine or automatic. Requires a concrete reason and a resolved first player action. At most once per player message and once per combat turn; no movement, bonus action or resources are refreshed. This grants permission only: choose a separate action tool for an action declared by the player, or return the decision to them.',
    { reason: z.string().trim().min(1).max(1000).describe('Concrete established circumstance justifying this rare second action.') },
    async ({ reason }) => {
      try {
        const state = gs.getState(), allowance = state.dmActionAllowance
        if (!allowance) throw new rules.RuleViolation('DM_TURN_REQUIRED', 'No current player message context.', {})
        if (allowance.granted) throw new rules.RuleViolation('ADDITIONAL_ACTION_ALREADY_GRANTED', 'Only one exceptional additional action per player message.', {})
        if (state.hero?.pending) throw new rules.RuleViolation('REACTION_PENDING', 'Resolve the held reaction first.', {})
        let combatTurnKey: string | undefined
        if (state.phase === 'combat') {
          rules.validateFreeCombatAction('player')
          combatTurnKey = `${state.combatGeneration ?? 0}:${state.round}:${state.turnCounter ?? 0}`
          if (allowance.combatTurnKey === combatTurnKey) throw new rules.RuleViolation('ADDITIONAL_ACTION_ALREADY_GRANTED', 'The DM already granted an additional action this combat turn.', {})
          if (!gs.hasActionUsed('player') || strictHero() && (hero().actionCredits > 0 || (hero().attackAction?.remaining ?? 0) > 0))
            throw new rules.RuleViolation('FIRST_ACTION_REQUIRED', 'Finish the available player action before granting another.', {})
        } else {
          rules.validateActionUse('player')
          if ((state.playerActionRevision ?? 0) <= allowance.actionRevisionAtStart)
            throw new rules.RuleViolation('FIRST_ACTION_REQUIRED', 'Resolve the first player action in this message before granting another.', {})
        }
        allowance.granted = true
        allowance.reason = reason
        if (combatTurnKey) {
          allowance.combatTurnKey = combatTurnKey
          gs.resetActionUsed('player')
          if (strictHero()) { hero().actionCredits++; delete hero().attackAction }
        }
        gs.addLogEntry({ round: state.round, turn: 'system', action: 'Le MJ accorde exceptionnellement une deuxième action au joueur', mechanicalDetail: reason })
        return { content: [{ type: 'text', text: JSON.stringify({ additionalPlayerAction: true, reason,
          mechanicalSummary: 'Une deuxième action autorisée par le MJ ; déplacement, action bonus et ressources inchangés.' }) }] }
      } catch (err) { return rules.ruleErrorResult(err) }
    }
  )

  server.tool('get_monster_stat_block',
    'Reads the complete locally pinned SRD 2014 API block and base engine projection. Select exactly one monsterType or monsterId; a revealed NPC ID on the current map is valid outside combat. An authored shared-HP NPC group returns its named homebrew block, current membership and canonical individual base separately. Complex traits are source references, not already-resolved effects. No network call or mutation.',
    { monsterType: z.string().optional(), monsterId: z.string().optional() }, async ({ monsterType, monsterId }) => {
      try {
        if ((monsterType !== undefined) === (monsterId !== undefined)) throw new rules.RuleViolation('MONSTER_SELECTION_REQUIRED', 'Choose one exact monster type or existing monster ID.', {})
        const monster = monsterId ? gs.getMonster(monsterId) : undefined
        if (monsterId && !monster) throw new rules.RuleViolation('ENTITY_NOT_FOUND', 'Unknown monster ID.', { monsterId })
        const record = getMonsterRecord(monsterType ?? monster!.type)
        if (!record) throw new rules.RuleViolation('MONSTER_UNKNOWN', 'No canonical SRD block for this type.', {})
        const statBlock = monster?.group ? {
          name: monster.statBlock?.name ?? monster.name, ruleset: 'homebrew-2014',
          baseMonsterType: monster.type, baseStatBlock: record.reference ?? record.source,
          hp: monster.hp, ac: monster.ac, stats: monster.stats, movementModes: monster.movementModes,
          attackName: monster.attackName, attackBonus: monster.attackBonus, damageDice: monster.damageDice,
          group: monster.group, rules: monster.statBlock?.homebrew,
        } : record.reference ?? record.source
        return { content: [{ type: 'text' as const, text: JSON.stringify({ ...record, statBlock, ruleset: '2014', retrievedAt: MONSTER_SOURCE_DATE,
          currentMonster: monster, engineSupport: monsterAutomation(monsterType ?? monster!.type,strictHero()) }) }] }
      } catch (err) { return rules.ruleErrorResult(err) }
    })
  // Transitions to combat: rolls initiative for all combatants
  server.tool(
    'enter_combat',
    'Enters combat using standard D&D 2014 initiative, retained for the entire encounter. Identical sourced monsters share one initiative roll. Optional tieOrder gives exact participant IDs in MJ tie priority; remaining ties follow the explicitly supplied combatants order. Explicit optional surprise is the MJ decision about exact participants that failed to notice a threat; establish any Stealth/Perception checks beforehand. No text inference or extra surprise roll. Selected actors cannot move, act, use bonus actions or react until their first turn ends; next_turn can end that turn without an action. Absence means nobody surprised. Never restart active combat to reroll. Authored start_encounter doorway ambushes remain separate.',
    {
      combatants: z.array(z.string()).describe('Array of entity IDs entering combat (include "player")'),
      tieOrder: z.array(z.string()).optional().describe('Explicit MJ tie priority, unique exact IDs from combatants. Omitted IDs retain combatants order; identical groups stay together.'),
      surprise: CombatSurpriseInputSchema.optional().describe('Explicit MJ determination before combat: exact surprisedIds from combatants and established reason. Omit when nobody is surprised.'),
      hazardPreparation: HazardCombatPreparationSchema.optional().describe('Explicit preparation of real turns before approaching one actual active oil patch, deployed ground device or measured slippery ice zone (ground approach only), rooted razorvine at an already reachable face, or complex_trap with its actual linked door already open. The selected complex trap is activated by this explicit initiative request and can be the sole danger without a fabricated enemy. Select its exact kind and hazardId; the engine validates an existing actual victim or the real physical approach route. No movement, contact damage, foe or threat is created. Include every actual body already touching burning oil, even if hidden; their visibility is unchanged.'),
    },
    async ({ combatants, surprise, tieOrder, hazardPreparation }) => {
      try {
        const result = startCombat(combatants, { surprise, tieOrder, hazardPreparation })
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
    'Atomically moves the player if needed, spawns monsters, and enters combat with the real spawned monster IDs. Prefer this over separate spawn_monster + enter_combat for room encounters. Optional surprise for an authored encounterId uses the exact zero-based roster from inspect_encounter, explicit playerSurprised and reason; checked before movement/spawn/initiative. It is forbidden with custom replacement monsters or a prepared ambush. No inferred surprise, checks or extra turn. At a prepared doorway ambush, first cross the chosen door with normal movement; the engine stops at its inside threshold. Then provide ambush with explicit doorId, attackerIndex, exact melee weaponOrSpell and suspicious (MJ interpretation of player precautions). A suspicious player rolls Perception, then on success a DEX save to avoid the single reaction strike entirely. Failure or no suspicion permits a normal attack against AC. Do not roll those checks separately or add a second attack. This is an authored module ambush rule, not a universal entry opportunity attack.',
    {
      encounterId: z.string().min(1).max(180).optional().describe('Exact preset encounter id from the current session map, including installed dungeon encounters.'),
      partyNpcIds: z.array(z.string().min(1).max(120)).max(16).optional().describe('Explicit exact IDs of individual real registered nonhostile NPC companions to enlist in this authored preset, already revealed and physically in its actual scene. Magical invisibility does not prevent their initiative or remove its effect. No automatic following, movement, HP reset or attack. Civilian turns remain passive. This first tranche refuses groups, replacement/custom rosters and any explicit surprise/prepared ambush combination before costs.'),
      playerCell: z.object({ x: z.number().int().min(0), y: z.number().int().min(0) }).optional().describe('Optional player destination before combat starts.'),
      monsters: z.array(z.object({
        monsterType: z.string().describe('Monster type key'),
        cell: z.object({ x: z.number().int().min(0), y: z.number().int().min(0) }),
        name: z.string().optional(),
        hpOverride: z.number().int().positive().optional(),
      })).optional().describe('Custom monster list when no preset encounterId is used.'),
      reason: z.string().optional().describe('Short narrative/mechanical reason for starting the encounter.'),
      surprise:EncounterSurpriseInputSchema.optional().describe('Explicit MJ decision for this exact authored roster: playerSurprised boolean, surprisedMonsterIndices from inspect_encounter, reason. No ambush/custom roster combination.'),
      ambush: z.object({ doorId: z.string(), attackerIndex: z.number().int().nonnegative(), weaponOrSpell: z.string().min(1),
        suspicious: z.boolean() }).strict().optional(),
    },
    async ({ encounterId, playerCell, monsters, reason, ambush, surprise, partyNpcIds }) => {
      const selectedPartyNpcIds=partyNpcIds??[]
      const stateBefore = structuredClone(gs.getState())
      try {
        if (gs.getState().hero?.pending) throw new rules.RuleViolation('REACTION_PENDING', 'Resolve the held reaction before starting an encounter.', {})
        assertNpcCombatRoster(['player',...selectedPartyNpcIds])
        const preset = encounterId && encounterIds(gs.getState()).includes(encounterId) ? getEncounter(encounterId, gs.getState()) : null
        if (encounterId && !preset) {
          throw new rules.RuleViolation('UNKNOWN_ENCOUNTER', `Unknown encounter: ${encounterId}`, { encounterId })
        }
        if (encounterId && gs.hasEncounterTriggered(encounterId)) {
          throw new rules.RuleViolation('ENCOUNTER_ALREADY_RESOLVED', `Encounter already triggered: ${encounterId}`, { encounterId })
        }
        // Multi-map : une rencontre préréglée ne se déclenche que sur SA map
        // (ses cellules n'ont de sens que sur la grille de sa salle).
        if (preset) {
          const presetMapId = resolveRoomMapId(preset.roomId, gs.getState())
          const currentMapId = getMapSpec(gs.getState().currentMapId, gs.getState()).id
          if (presetMapId && presetMapId !== currentMapId) {
            throw new rules.RuleViolation('ENCOUNTER_WRONG_MAP', `Encounter ${preset.id} belongs to another map.`, {
              encounterId: preset.id,
              encounterMapId: presetMapId,
              currentMapId,
            })
          }
        }

        const awareness = encounterId ? encounterAwareness(gs.getState())[encounterId] : undefined
        if(selectedPartyNpcIds.length){
          if(new Set(selectedPartyNpcIds).size!==selectedPartyNpcIds.length)
            throw new rules.RuleViolation('ENCOUNTER_PARTY_SELECTION_INVALID','Select each exact NPC companion once, never a duplicate initiative.',{})
          if(!preset||monsters)
            throw new rules.RuleViolation('ENCOUNTER_PARTY_PRESET_REQUIRED','This companion selection requires one actual authored preset without a replacement/custom roster.',{})
          if(surprise||ambush||awareness?.status==='ambushing')
            throw new rules.RuleViolation('ENCOUNTER_PARTY_VARIANT_UNSUPPORTED','This first companion-preset tranche does not represent their additional surprise or authored entry-ambush decisions. Resolve that combination with a supported procedure before any cost; no NPC surprise is inferred.',{})
          for(const id of selectedPartyNpcIds){
            const npc=gs.getNpc(id),registration=activeNpcPartyRegistration(gs.getState(),id)
            if(!isStatBackedNpc(npc)||!registration||npc.hostile!==false)
              throw new rules.RuleViolation('ENCOUNTER_PARTY_NPC_REQUIRED','Choose an actual sourced nonhostile NPC with one active explicit party role, not an invented or unregistered combatant.',{npcId:id})
            if(npc.group)
              throw new rules.RuleViolation('ENCOUNTER_PARTY_GROUP_UNSUPPORTED','An authored shared-HP civilian group does not become one individual combat turn. It can remain a separately qualified present civilian group outside initiative.',{npcId:id})
            if(!npc.visible||!gs.npcOnCurrentMap(npc)||inferRoomIdOnMap(npc.position,gs.getState().currentMapId,gs.getState())!==preset.roomId)
              throw new rules.RuleViolation('ENCOUNTER_PARTY_NPC_SCENE_REQUIRED','The selected individual must already be revealed and physically on this map in the authored encounter scene; no move, reveal or remote participant is supplied. Magical invisibility does not remove an actual party member.',{npcId:id})
            if(!isActiveMonster(npc))
              throw new rules.RuleViolation('ENTITY_INCAPACITATED','This individual companion needs its actual living positive-HP body before this active initiative selection.',{entityId:id})
          }
          // Pure existing entry admissions before room visits, placements,
          // spawned identities or initiative. The final full roster still uses
          // startCombat once, with its same authoritative guards and rolls.
          const existing=['player',...selectedPartyNpcIds]
          rules.validateEnterCombat(existing)
          validateActiveComplexTrapGeometry(gs.getState())
          gs.validateInitiativeInput(existing)
          for(const id of existing)if(gs.getEntity(id)?.conditions.includes('exhaustion')&&!gs.getState().dmTools?.exhaustion?.creatures[id])
            throw new rules.RuleViolation('EXHAUSTION_LEVEL_REQUIRED','An explicit authoritative exhaustion level is required before entering combat.',{targetId:id})
        }
        if(surprise){
          if(!preset||monsters)throw new rules.RuleViolation('ENCOUNTER_SURPRISE_PRESET_REQUIRED','General encounter surprise requires one authored encounterId without replacement monsters.',{})
          if(ambush||awareness?.status==='ambushing')throw new rules.RuleViolation('ENCOUNTER_SURPRISE_AMBUSH_CONFLICT','Resolve the authored prepared ambush separately; do not combine or replace it with general surprise.',{})
          validateEncounterSurprise(preset.monsters.length,surprise)
          // Entry gates which would otherwise fail only after spawning must
          // precede every identity/position mutation for this explicit choice.
          assertSurvivalEventsResolved()
          if(!rules.isAlive(gs.getPlayer()))throw new rules.RuleViolation('ENTITY_DEAD','The actual player must be alive before starting this combat.',{entityId:'player'})
          if(gs.getPlayer().conditions.includes('exhaustion')&&!gs.getState().dmTools?.exhaustion?.creatures.player)
            throw new rules.RuleViolation('EXHAUSTION_LEVEL_REQUIRED','An explicit authoritative exhaustion level is required before entering combat.',{targetId:'player'})
        }
        if (awareness?.status === 'ambushing' && !ambush
          && (pendingDoorAmbush(gs.getState()) === encounterId || gs.getState().currentRoomId !== preset?.roomId))
          throw new rules.RuleViolation('AMBUSH_RESOLUTION_REQUIRED', 'Cross the prepared door, then explicitly choose the ambush attacker, weapon and player suspicion.', {})
        if (ambush && (!preset?.noiseAmbush || awareness?.status !== 'ambushing' || awareness.doorId !== ambush.doorId
          || pendingDoorAmbush(gs.getState()) !== encounterId || playerCell || monsters))
          throw new rules.RuleViolation('AMBUSH_THRESHOLD_REQUIRED', 'Resolve only a prepared ambush at its exact inside doorway threshold, without replacement placements.', {})
        if (awareness && monsters) throw new rules.RuleViolation('ENCOUNTER_POSITIONS_AUTHORITATIVE', 'Do not replace an alerted encounter roster or its saved positions.', {})
        const encounterMonsters = awareness && preset ? preset.monsters.map((monster, index) => ({ ...monster, cell: awareness.positions[index] }))
          : monsters ?? preset?.monsters ?? []
        const resolvedPlayerCell = playerCell ?? (awareness ? undefined : preset?.playerCell)
        if (ambush && gs.getState().phase === 'combat' && gs.getState().currentTurn !== 'player')
          throw new rules.RuleViolation('PLAYER_TURN_REQUIRED', 'Resolve the entry ambush during the entering player turn.', {})
        assertEncounterCanStart(resolvedPlayerCell, encounterMonsters, encounterId, Boolean(ambush))
        const cyclePlan=preset&&!monsters?preflightCampaignEngagement(gs.getState(),preset.id):undefined
        if(resolvedPlayerCell)gs.assertGroundMovementPath('player',[resolvedPlayerCell],'teleport')

        if (preset?.roomId && !awareness) {
          gs.visitRoom(preset.roomId)
        }

        let movedPlayer: { from: { x: number; y: number }; to: { x: number; y: number } } | null = null
        if (resolvedPlayerCell) {
          const from = { ...gs.getState().player.position }
          gs.moveToken('player', resolvedPlayerCell.x, resolvedPlayerCell.y,{groundContactKind:'teleport'})
          movedPlayer = { from, to: resolvedPlayerCell }
        }

        const spawnedMonsters: MonsterState[] = []
        for (const [index, spec] of encounterMonsters.entries()) {
          const monster = createMonster(spec.monsterType, spec.cell, spec.name, spec.hpOverride)
          if (preset && !monsters) monster.socialIdentity = `encounter:${preset.id}:${index}`
          gs.spawnMonster(monster)
          spawnedMonsters.push(monster)
        }

        if (ambush) {
          const attacker = spawnedMonsters[ambush.attackerIndex]
          if (!attacker) throw new rules.RuleViolation('MONSTER_SELECTION_REQUIRED', 'Choose an exact encounter attackerIndex.', {})
          const profile = attackProfile(attacker, ambush.weaponOrSpell)
          const player = gs.getPlayer()
          if (!profile.melee || Math.max(Math.abs(attacker.position.x - player.position.x), Math.abs(attacker.position.y - player.position.y)) > profile.rangeCells
            || !canSee(attacker, player))
            throw new rules.RuleViolation('AMBUSH_ATTACK_UNAVAILABLE', 'The chosen melee attacker must reach and see the entering player through legal geometry.', {})
        }

        const combat = ambush && gs.getState().phase === 'combat' ? (() => {
          // The player entered this room during an existing fight. These foes
          // engage here, without leaving their room or renewing any spent budget.
          for (const monster of spawnedMonsters) monster.initiative = rollDice(d20WithModifier(getAbilityModifier(monster.stats.dex))).total
          const state = gs.getState()
          state.initiativeOrder.push(...[...spawnedMonsters].sort((a, b) => b.initiative! - a.initiative!).map(monster => monster.id))
          if(Object.values(state.dmTools?.complexTraps??{}).some(trap=>trap.mapId===state.currentMapId&&trap.status==='active'))enrollComplexTrapInitiative(state)
          return { phase: 'combat' as const, initiativeOrder: state.initiativeOrder, currentTurn: state.currentTurn,
            round: state.round, joinedExistingCombat: true }
        })() : startCombat(['player', ...spawnedMonsters.map(monster => monster.id),...selectedPartyNpcIds], {
          ...(surprise?{surprise:encounterCombatSurprise(spawnedMonsters.map(monster=>monster.id),surprise)}:{}) })
        if (encounterId) {
          gs.markEncounterTriggered(encounterId)
        }
        if(preset&&!monsters)recordCampaignEngagement(gs.getState(),preset.id,spawnedMonsters,cyclePlan)
        if (reason || preset) {
          gs.addLogEntry({
            round: gs.getState().round,
            turn: 'system',
            action: `RENCONTRE: ${preset?.name ?? 'custom'}`,
            mechanicalDetail: reason,
          })
        }

        const state = gs.getState()
        if (ambush) return resolveEncounterAmbush({ encounterId, encounterName: preset?.name, doorId: ambush.doorId,
          attackerId: spawnedMonsters[ambush.attackerIndex].id, weaponOrSpell: ambush.weaponOrSpell,
          roomId: state.currentRoomId, movedPlayer, spawnedMonsters, combat }, ambush.suspicious)
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
    'Ends the current combatant turn and advances initiative. After everyone has acted, the engine starts a new round while retaining the encounter initiative order under standard D&D 2014 rules. Follow the returned currentTurn and initiativeOrder. Requires the current actor to have used an action, unless skipAction=true for an explicit pass/hold.',
    {
      actorId: z.string().optional().describe('Entity ID ending its own turn. Defaults to currentTurn and must match currentTurn.'),
      skipAction: z.boolean().optional().describe('Set true only when the current actor explicitly passes/holds instead of using an action.'),
      reason: z.string().optional().describe('Short reason when skipAction=true, e.g. "holds position" or "cannot reach target".'),
    },
    async ({ actorId, skipAction, reason }) => {
      let endingActorId: string
      try {
        endingActorId = rules.validateNextTurn(actorId, Boolean(skipAction))
        assertTurnExhaustionLevels()
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

      const eventsBefore = completedRoundEvents(gs.getState())
      const nextTurn = gs.advanceTurn()
      const state = gs.getState()
      const plagueEvent = sewerPlagueEvent(state)
      const frigidWaterEvent = dueFrigidWaterSave(state)
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            endedTurn: endingActorId,
            ...(plagueEvent ? { sewerPlagueEvent: plagueEvent } : {}),
            ...(frigidWaterEvent ? { frigidWaterEvent } : {}),
            ...(isSurvivalDayDue()?{survivalEventDue:true}:{}),
            roundEvents: Object.values(completedRoundEvents(state)).filter(event => !eventsBefore[event.eventId]),
            currentTurn: nextTurn,
            round: state.round,
            initiativeOrder: state.initiativeOrder,
            complexTrapTurn:inspectComplexTrapTurn(state),
            npcDeathSaveEvents: dueNpcDeathSaveEvents(),
            xgeFallEndTurnEvent:dueXgeFallDescent(gs.getState())??null,
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
        assertTurnExhaustionLevels()
      } catch (err) {
        return rules.ruleErrorResult(err)
      }

      gs.addLogEntry({
        round: gs.getState().round,
        turn: endingActorId,
        action: 'Le joueur passe son tour',
        mechanicalDetail: reason,
      })

      const eventsBefore = completedRoundEvents(gs.getState())
      const nextTurn = gs.advanceTurn()
      const nextState = gs.getState()
      const plagueEvent = sewerPlagueEvent(nextState)
      const frigidWaterEvent = dueFrigidWaterSave(nextState)
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            endedTurn: endingActorId,
            ...(plagueEvent ? { sewerPlagueEvent: plagueEvent } : {}),
            ...(frigidWaterEvent ? { frigidWaterEvent } : {}),
            ...(isSurvivalDayDue()?{survivalEventDue:true}:{}),
            currentTurn: nextTurn,
            round: nextState.round,
            roundEvents: Object.values(completedRoundEvents(nextState)).filter(event => !eventsBefore[event.eventId]),
            initiativeOrder: nextState.initiativeOrder,
            complexTrapTurn:inspectComplexTrapTurn(state),
            npcDeathSaveEvents: dueNpcDeathSaveEvents(),
            xgeFallEndTurnEvent:dueXgeFallDescent(gs.getState())??null,
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
        assertWeaponConsumableTimeAdvance(1)
        assertOilTimeAdvance(1)
      } catch (err) {
        return rules.ruleErrorResult(err)
      }

      const state = gs.getState()

      // Calculate XP from defeated monsters
      let campaignPlans:ReturnType<typeof planCampaignEncounterClosures>
      try{campaignPlans=planCampaignEncounterClosures(state,force)}catch(err){return rules.ruleErrorResult(err)}
      const deadMonsters = Object.values(state.monsters).filter(m => m.hostile!==false && (!m.isAlive || hasNpcZeroHpEpisode(m)) && !m.xpAwarded)
      const returnedPartyMembers = Object.values(state.monsters).filter(m => isEnrolledNonhostileNpcCombatant(state,m.id))
      const disengagedMonsters = force
        ? Object.values(state.monsters).filter(m => isActiveMonster(m) && !isEnrolledNonhostileNpcCombatant(state,m.id))
        : []
      const totalXP = deadMonsters.reduce((sum, m) => sum + m.xpValue, 0)

      for (const monster of deadMonsters) {
        monster.xpAwarded = true
      }

      for (const monster of [...disengagedMonsters,...returnedPartyMembers]) {
        gs.removeMonster(monster.id)
      }

      gs.setPhase('exploration')
      state.initiativeOrder = []
      state.currentTurn = null
      state.round = 0
      state.movementUsed = {}
      state.diagonalMovementUsed = {}
      state.actionUsed = {}
      const campaignClosures=commitCampaignEncounterClosures(state,campaignPlans)

      gs.addLogEntry({
        round: state.round,
        turn: 'system',
        action: 'COMBAT TERMINÉ',
        mechanicalDetail: `XP gagné: ${totalXP} (${deadMonsters.map(m => m.name).join(', ')})${disengagedMonsters.length > 0 ? ` | Désengagés: ${disengagedMonsters.map(m => m.name).join(', ')}` : ''}${returnedPartyMembers.length > 0 ? ` | Compagnons hors initiative: ${returnedPartyMembers.map(m => m.name).join(', ')}` : ''}`,
      })

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            phase: 'exploration',
            xpAwarded: totalXP,
            ...(campaignClosures.length?{campaignClosures}:{}),
            reason,
            defeatedMonsters: deadMonsters.map(m => ({ id: m.id, name: m.name, xp: m.xpValue })),
            disengagedMonsters: disengagedMonsters.map(m => ({ id: m.id, name: m.name, type: m.type })),
            ...(returnedPartyMembers.length?{returnedPartyMembers:returnedPartyMembers.map(m=>({id:m.id,name:m.name,status:'returned_to_exploration'}))}:{}),
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
      monsterType: z.string().describe(`Monster type key (built-in stat block): ${Object.keys(MONSTER_TEMPLATES).join(', ')}`),
      cell: z.object({ x: z.number().int().min(0), y: z.number().int().min(0) }).describe('Grid position to spawn at'),
      name: z.string().optional().describe('Custom name override (e.g. "Gobelin Chef")'),
      hpOverride: z.number().int().positive().optional().describe('Override max HP'),
    },
    async ({ monsterType, cell, name, hpOverride }) => {
      try {
        rules.validateSpawn(cell)
        const createdMonster = createMonster(monsterType, cell, name, hpOverride)
        gs.spawnMonster(createdMonster)
        return { content: [{ type: 'text', text: JSON.stringify(createdMonster) }] }
      } catch (err) { return rules.ruleErrorResult(err) }
    }
  )
}
