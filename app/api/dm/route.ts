import { buildObjectiveContext } from '@/lib/dm/objective-context'
import { socialInteractionContext } from '@/lib/dm/social-interaction-context'
import { createToolCatalog } from '@/lib/dm/tool-catalog'
import { HIDDEN_FROM_LLM, selectToolsForPhase } from '@/lib/tool-exposure'
import { currentCleavingChoice } from '@/lib/cleaving-state'
import { withRecording, startRecording, finishRecording } from '@/lib/training-recorder'
import { reactionOpportunities } from '@/lib/npc-reactions'
import { NextRequest, NextResponse } from 'next/server'
import type * as Llm from '@/lib/dm/llm-types'
import { callMCPTool, listMCPTools, prepareDevelopmentMCPClient } from '@/lib/mcp-client'
import { invalidateContextCache } from '@/lib/context-loader'
import { loadSession, saveSession } from '@/lib/session-store'
import { acquireSessionLock } from '@/lib/session-lock'
import { logEvent, summarizeGameState } from '@/lib/server-logger'
import { summarizeLlmUsage, type LlmUsageLogEntry } from '@/lib/llm-usage'
import {
  DMRequest,
  DMResponse,
  DMQuota,
  GameState,
  GamePhase,
  ConversationTurn,
  DMTurnUsage,
} from '@/lib/types'
import {
  consumeUserCredit,
  consumeGuestMessage,
  refundUserCredit,
  refundGuestMessage,
  GUEST_MESSAGE_LIMIT,
} from '@/lib/credits-store'
import {
  checkRateLimit,
  clientIpFromHeaders,
  consumeDailyGlobalBudget,
} from '@/lib/rate-limit'
import { DEFAULT_ADVENTURE_ID, isKnownAdventureId } from '@/lib/adventure-map'
import { DEFAULT_CHARACTER_ID, isKnownCharacterId } from '@/lib/character-registry'
import { requireAvailableAdventure, getAdventureDefinition } from '@/lib/adventures'
import {
  MODEL,
  MAX_TOKENS,
  parsePositiveInt,
  createLlmMessage,
  measureLlmContext,
  type LlmCallContext,
} from '@/lib/dm/llm'
import {
  buildStaticSystemBlocks,
  buildTurnUserMessage,
} from '@/lib/dm/prompts'
import { processHistory, historyPromptMessages, type HistoryBudget } from '@/lib/dm/history'
import { pendingCombatContinuation } from '@/lib/dm/combat-flow'
import { narrationEvidence, type ResolvedCall } from '@/lib/dm/narration'
import { buildClueContext } from '@/lib/dm/quest-context'
import { buildLocalRoomContext } from '@/lib/dm/nearby-rooms'

// ─────────────────────────────────────────────────────────────────────────────
// Route DM : orchestration d'un tour de jeu.
//   anti-abus → débit → session autoritaire → sync MCP → compression historique
//   → agent MJ (interprétation et tool-use) → persistance.
// Les briques vivent dans lib/dm/ (llm, prompts, history).
// ─────────────────────────────────────────────────────────────────────────────

// Route longue à cause de la boucle agentique tool-use.
export const maxDuration = 60

// Monétisation active par défaut. MONETIZATION_ENABLED=false ne sert qu'aux
// tests/dev hors runtime Next : le harnais Node ne fournit ni le contexte
// cookies() ni le chargement ESM de next-auth — d'où l'import paresseux de
// lib/entitlements plus bas, jamais exécuté quand la monétisation est coupée.
const MONETIZATION_ENABLED = process.env.MONETIZATION_ENABLED !== 'false'

type DebitRecord =
  | { kind: 'user'; userId: string }
  | { kind: 'guest'; guestId: string }
  | null

// Le joueur ne paie jamais une erreur serveur : à appeler avant TOUT retour
// d'erreur 5xx postérieur au débit (les `return` ne passent pas par le catch).
async function refundDebit(
  debited: DebitRecord,
  meta: { requestId: string; sessionId?: string }
): Promise<void> {
  if (!debited) return
  try {
    if (debited.kind === 'user') {
      await refundUserCredit(debited.userId)
    } else {
      await refundGuestMessage(debited.guestId)
    }
  } catch (err) {
    logEvent('error', 'dm.request.refund_failed', {
      ...meta,
      err: err instanceof Error ? err.message : String(err),
    })
  }
}

// Le MJ peut résoudre autant d'événements que nécessaire pour l'action du joueur.
// Seules les itérations sans nouveau résultat MCP réussi bornent la boucle.
// L'ancien réglage est conservé comme alias du seuil de stagnation.
const MAX_STALLED_ITERATIONS = parsePositiveInt(
  process.env.LLM_MAX_STALLED_ITERATIONS ?? process.env.LLM_MAX_CALLS_PER_REQUEST, 6)
const CONTEXT_RESERVE_TOKENS = parsePositiveInt(process.env.LLM_CONTEXT_RESERVE_TOKENS, 4096)

// Plafond dur de tours conservés dans la session persistée (le surplus ancien
// est couvert par summaryContext) — évite une ligne JSONB qui enfle sans fin.
const MAX_STORED_HISTORY_TURNS = parsePositiveInt(process.env.DM_MAX_STORED_HISTORY_TURNS, 200)

// Plafond de longueur du message joueur : un message géant part chez le MJ
// et finit dans l'historique persisté — vecteur de
// coût direct pour 1 seul token débité. 2000 est large pour une action de joueur.
const DM_MAX_MESSAGE_CHARS = parsePositiveInt(process.env.DM_MAX_MESSAGE_CHARS, 2000)

const DOCUMENTARY_TOOLS = new Set([
  "inspect_objectives",
  "inspect_campaign_outcomes",
  "inspect_npc_party",
  "inspect_xge_carousing",
  "inspect_sacred_rites",
  "inspect_xge_pit_fighting",
  "inspect_cackle_fever",
  "inspect_xge_gambling",
  "inspect_razorvine",
  "inspect_xge_scroll_scribing",
  "inspect_slippery_ice",
  "inspect_xge_brewing",
  "inspect_detected_desecration",
  "inspect_xge_relaxation",
  "inspect_frigid_water",
  "inspect_alarm",
  "inspect_xge_research",
  "inspect_xge_training",
  "inspect_spellcasting_perception",
  "inspect_knots",
  "inspect_xge_downtime",
  "inspect_xge_falling",
  "inspect_adamantine",
  "inspect_campaign_calendar",
  "inspect_xge_recharge_calendar",
  "inspect_renown",
  "inspect_sleep",
  "inspect_swallowing",
  "inspect_merchant_resales",
  "inspect_legacy_npc_life",
  "inspect_poison_harvest",
  "inspect_underwater_context",
  "inspect_poison_nutrition",
  "inspect_player_poisons",
  "inspect_training",
  "inspect_special_movement",
  "inspect_trade_stock",
  "inspect_ordinary_crafting",
  "inspect_random_encounter_tables",
  "inspect_random_encounters",
  "inspect_urban_encounters",
  "inspect_spell_area",
  "inspect_vertical_barriers",
  "inspect_vertical_movement",
  "inspect_spellbooks",
  "inspect_social_interaction",
  "inspect_weather",
  "inspect_hidden_doors",
  "inspect_foraging",
  "inspect_water_sources",
  "inspect_net",
  "get_casting",
  "inspect_rest",
  "inspect_travel",
  "preview_handled_load",
  "inspect_player_recovery",
  "inspect_player_life",
  "inspect_carrying_capacity",
  "assess_handling_load",
  "inspect_breathing",
  "inspect_encounter",
  "consult_rules",
  "consult_campaign",
  "discover_tools",
  "roll_table",
  "generate_dungeon",
  "validate_dungeon",
  "inspect_scene",
  "get_rules_support",
  "inspect_magic_items",
  "inspect_spell_scrolls",
  "read_spell_scroll",
  "inspect_lighting",
  "inspect_valuables",
  "inspect_afflictions",
  "inspect_curses",
  "inspect_exhaustion",
  "inspect_temporary_hp",
  "inspect_cover",
  "preview_grapple_transport",
  "resolve_passive_check",
  "inspect_spell_components",
  "inspect_creature_senses",
  "inspect_survival",
  "assess_encounter_budget",
  "assess_xge_encounter",
  "inspect_random_encounter_cadence",
  "inspect_xge_religious_service",
  "inspect_complex_trap_turn",
  "inspect_npc_rest",
  "inspect_improvised_hazards",
  "inspect_adventuring_cycles",
  "inspect_adventure_rewards",
])
const URBAN_REFERENCE_RECEIPT_TOOLS = new Set(['check_urban_encounter', 'reroll_urban_encounter'])
const MOVEMENT_TOOLS = new Set(['escape_worm_corpse','move_by_climbing_or_swimming','continue_special_movement','jump','continue_jump','move_vertical_flight','move_token','move_grappled_creature','move_handled_load'])
const REST_DECISION_TOOLS = new Set(['finish_rest','spend_rest_hit_die','take_rest','identify_magic_item','attune_magic_item'])
const CASTING_DECISION_TOOLS = new Set(['cast_spell','identify_magic_item','continue_casting','finish_casting'])
const TRAVEL_DECISION_TOOLS = new Set(['advance_travel','resolve_travel_navigation','advance_navigation_search','resolve_foraging','collect_forage'])
const COPY_DECISION_TOOLS = new Set(['copy_spell_to_book','copy_spell_scroll','copy_personal_spell','continue_spell_copy','resolve_spell_copy'])
const GEAR_RECOVERY_DECISION_TOOLS = new Set(['start_ground_gear_recovery','continue_ground_gear_recovery'])
const GEAR_TRANSFER_DECISION_TOOLS = new Set(['start_ground_gear_transfer','continue_ground_gear_transfer'])
const CRAFTING_DECISION_TOOLS = new Set(['work_ordinary_crafting'])

// Le personnage ne fait qu'UNE action de jeu majeure par message joueur, avec au
// plus un déplacement associé. Les répétitions après réussite sont refusées.
// NB : trigger_room_event N'EST PAS ici — c'est un marqueur de scène (flag + log),
// pas une action à économie de tour. Il doit pouvoir accompagner un move_token
// (« j'entre dans la salle » → move_token + trigger_room_event d'entrée).
// start_encounter, comme enter_combat, met en place la réaction de la scène :
// il doit rester possible après une porte forcée ou un jet social échoué.
// Seul le modèle choisit de l'appeler et fournit tous ses arguments.
const PRIMARY_ACTION_TOOLS = new Set([
  "work_xge_carousing",
  "work_xge_spell_scroll_project",
  "work_xge_pit_fighting",
  "work_xge_healing_potion_project",
  "work_xge_greater_healing_potion",
  "work_xge_gambling",
  "pay_xge_gambling_debt",
  "scribe_xge_spell_scroll",
  "brew_xge_healing_potion",
  "purify_desecrated_ground",
  "advance_xge_relaxation",
  "work_xge_training",
  "adjudicate_xge_training",
  "work_xge_religious_service",
  "work_sacred_rites",
  "set_light_object_cover",
  "dismiss_light_spell",
  "work_xge_research",
  "resolve_xge_research",
  "work_downtime",
  "resolve_downtime_work",
  "adjudicate_downtime_work",
  "tie_knot",
  "resolve_knot",
  "shake_natural_sleeper",
  "escape_worm_corpse",
  "sell_to_merchant",
  "work_poison_harvest",
  "prepare_player_poison",
  "wash_player_poison",
  "release_inhaled_poison",
  "work_training",
  "move_by_climbing_or_swimming",
  "continue_special_movement",
  "purchase_trade_offer",
  "work_ordinary_crafting",
  "place_ground_gear",
  "reset_hunting_trap",
  "escape_hunting_trap",
  "start_ground_gear_recovery",
  "continue_ground_gear_recovery",
  "start_ground_gear_transfer",
  "continue_ground_gear_transfer",
  "use_oil_flask",
  "pour_oil_flask",
  "ignite_oil_patch",
  "continue_jump",
  "coat_weapon_with_poison",
  "copy_personal_spell",
  "continue_spell_copy",
  "resolve_spell_copy",
  "resolve_social_request",
  "discern_social_characteristic",
  "manage_sling_projectile",
  "silver_equipment",
  "wear_weather_clothing",
  "move_vertical_flight",
  "resolve_door_discovery",
  "resolve_foraging",
  "collect_forage",
  "fill_water_container",
  "transfer_water",
  "free_from_net",
  "attack_net",
  "continue_casting",
  "finish_casting",
  "finish_rest",
  "spend_rest_hit_die",
  "begin_handling_load",
  "move_handled_load",
  "advance_travel",
  "resolve_travel_navigation",
  "advance_navigation_search",
  "recover_ammunition",
  "consume_provisions",
  "use_weapon_consumable",
  "extinguish_alchemists_fire",
  "resolve_group_check",
  "provide_check_help",
  "use_spell_scroll",
  "copy_spell_scroll",
  "manage_light_source",
  "resolve_visual_perception",
  "collect_treasure_hoard",
  "treat_affliction",
  "counter_complex_trap",
  "cast_curse",
  "identify_magic_item",
  "attune_magic_item",
  "wear_magic_item",
  "use_magic_item",
  "discover_dungeon_lead",
  "collect_treasure",
  "spend_currency",
  "exchange_currency",
  "resolve_tool_check",
  "interact_object",
  "interact_trap",
  "use_item",
  "equip_item",
  "resolve_player_multiattack",
  "escape_monster_grapple",
  "wake_sleeping_creature",
  "resolve_attack",
  "resolve_player_attack",
  "roll_ability_check",
  "use_healing_potion",
  "cast_spell",
  "use_narrative_spell_effect",
  "dismiss_prestidigitation",
  "use_subclass_feature",
  "take_rest",
  "prepare_spells",
  "copy_spell_to_book",
  "combat_action",
  "jump",
  "move_token",
  "move_grappled_creature",
  "drop_item",
  "pick_up_item",
  "interact_door",
  "travel_to_map",
  "advance_npc_rest",
  "finish_npc_rest",
  "activate_scintillating_robe",
  "use_chime_of_opening",
])

// Les outils partagés ne consomment le budget du joueur que s'il est l'acteur.
// Les événements du MJ et les actions des autres entités gardent leurs règles MCP.
function isPlayerPrimaryAction(tool: string, input: Record<string, unknown>, state: GameState): boolean {
  if (!PRIMARY_ACTION_TOOLS.has(tool)) return false
  switch (tool) {
    case 'advance_xge_relaxation': return !state.dmTools?.rests?.active
    case 'dismiss_light_spell': return input.actorId === 'player'
    case 'resolve_social_request': return input.resolution === 'check' && input.entityId === 'player'
    case 'discern_social_characteristic': return input.entityId === 'player'
    case 'resolve_door_discovery': return input.method !== 'passive'
    case 'interact_object': return input.action !== 'inspect'
    case 'interact_trap': return input.action !== 'trigger' && (input.actorId ?? 'player') === 'player'
    case 'use_item': return (input.actorId ?? 'player') === 'player'
    case 'resolve_attack': return input.attackerId === 'player'
    case 'adjudicate_xge_training': return input.kind === 'delay' && Object.values((input.paid ?? {}) as Record<string, unknown>).some(n => typeof n === 'number' && n > 0)
    case 'adjudicate_downtime_work': return input.kind === 'delay' && Object.values((input.paid ?? {}) as Record<string, unknown>).some(n => typeof n === 'number' && n > 0)
    case 'shake_natural_sleeper': return input.actorId === 'player'
    case 'escape_worm_corpse': return typeof input.episodeId==='string'&&state.dmTools?.swallow?.episodes[input.episodeId]?.targetId==='player'
    case 'move_token': return input.tokenId === 'player'
    case 'move_vertical_flight': return input.entityId === 'player'
    case 'move_by_climbing_or_swimming': return input.entityId === 'player'
    case 'continue_special_movement': return typeof input.eventId === 'string'
      && state.dmTools?.jumping?.locomotion?.moves[input.eventId]?.input.entityId === 'player'
    case 'move_grappled_creature': return input.actorId === 'player'
    case 'move_handled_load': return (input.actorId ?? 'player') === 'player'
    case 'roll_ability_check': return (input.entityId ?? 'player') === 'player'
    case 'resolve_cleaving': return false // Same original attack continuation, no new primary action.
    case 'combat_action': return (input.actorId ?? 'player') === 'player' && !(input.action==='overrun'&&input.overrunCost==='bonus_action') && !(input.action==='tumble'&&input.tumbleCost==='bonus_action')
    case 'free_from_net': return (input.actorId ?? 'player') === 'player'
    case 'escape_hunting_trap': return input.actorId === 'player'
    case 'escape_monster_grapple': return input.entityId === 'player'
    case 'wake_sleeping_creature': return input.actorId === 'player'
    case 'extinguish_alchemists_fire': return input.actorId === 'player'
    case 'provide_check_help': return input.helperId === 'player'
    default: return true
  }
}

// Cache de la liste de tools exposés, CLÉ PAR aventure : le schéma de certains
// tools (start_encounter → enum d'encounters) est propre au module. Un seul
// singleton serait rempli par la première session et servirait le mauvais enum
// aux sessions d'un autre module. Borné par le nombre de modules du registre.
const cachedMcpToolsByAdventure = new Map<string, Llm.Tool[]>()

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function narrationToolResult(result: unknown, before: GameState, after: GameState, tool: string): string {
  const narrationFacts = narrationEvidence(before, after, [{ tool, result }])
  const clueContext = buildClueContext(after)
  // The initial turn prompt stays frozen. Spatial changes need a fresh, appended
  // room/perception delta, especially after opening a door or crossing a threshold.
  const sceneContext = before.phase !== after.phase
    || ['tie_knot','resolve_knot','begin_xge_fall','resolve_xge_fall_descent','arrest_xge_fall','begin_natural_sleep','end_natural_sleep','shake_natural_sleeper','report_sleep_noise','resolve_monster_action','resolve_swallow_event','escape_worm_corpse','move_by_climbing_or_swimming','continue_special_movement','complete_locomotion_fall','record_movement_medium','place_ground_gear','resolve_ground_gear_contact','resolve_slippery_ice_entry','resolve_razorvine_contact','escape_hunting_trap','reset_hunting_trap','finish_ground_gear_recovery', 'jump','continue_jump','complete_jump_fall', 'configure_weather', 'set_light_weather_protection', 'move_vertical_flight', 'move_token', 'move_grappled_creature', 'interact_door', 'npc_action', 'react_to_noise', 'start_encounter', 'travel_to_map', 'spawn_monster', 'run_monster_turns', 'advance_turn'].includes(tool)
    ? buildLocalRoomContext(after) : ''
  const objectiveContext = sceneContext || ['reveal_npc','create_npc','record_objective_dialogue','npc_action'].includes(tool) ? buildObjectiveContext(after) : ''
  const socialContext = sceneContext || ['begin_social_interaction', 'record_social_conversation', 'inspect_social_interaction', 'resolve_social_request', 'discern_social_characteristic', 'end_social_interaction', 'resolve_reaction'].includes(tool)
    ? socialInteractionContext(after) : ''
  return JSON.stringify(narrationFacts.length || clueContext || sceneContext || objectiveContext || socialContext
    ? { ...(isObjectRecord(result) ? result : { result }),
      ...(narrationFacts.length ? { narrationFacts } : {}), ...(clueContext ? { clueContext } : {}), ...(sceneContext ? { sceneContext } : {}), ...(objectiveContext ? { objectiveContext } : {}), ...(socialContext ? { socialContext } : {}) }
    : result)
}

function generateRequestId(): string {
  return `dm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

// ── MCP tools ────────────────────────────────────────────────────────────────

async function getMcpTools(
  sessionId: string | undefined,
  adventureId: string
): Promise<Llm.Tool[]> {
  const cached = cachedMcpToolsByAdventure.get(adventureId)
  if (cached && process.env.NODE_ENV !== 'development') return cached
  // Passer adventureId : si c'est le premier appel MCP qui spawne le process,
  // il doit démarrer sur le bon module (défense en profondeur, cf. Fix 3).
  const raw = await listMCPTools(sessionId, adventureId)
  const tools = raw
    .filter(tool => !HIDDEN_FROM_LLM.has(tool.name))
    .map(tool => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.inputSchema as Llm.Tool['input_schema'],
    }))
  cachedMcpToolsByAdventure.set(adventureId, tools)
  logEvent('info', 'dm.mcp_tools.loaded', {
    sessionId,
    adventureId,
    exposedToolNames: tools.map(tool => tool.name),
  })
  return tools
}

// ── State sync helpers ───────────────────────────────────────────────────────

function requireMcpGameState(result: unknown): GameState {
  // MCP rule refusals are returned as values, not thrown by the transport.
  // Never let one reach the turn pipeline or overwrite a stored session.
  if (!isObjectRecord(result) || typeof result.error === 'string' || result.isError === true
    || !isObjectRecord(result.player) || !isObjectRecord(result.monsters) || !Array.isArray(result.initiativeOrder)) {
    throw new Error(isObjectRecord(result) && typeof result.error === 'string'
      ? result.error : 'MCP returned an invalid game state.')
  }
  return result as unknown as GameState
}

async function syncGameStateToMcp(
  gameState: GameState | undefined,
  requestId: string,
  sessionId: string | undefined,
  adventureId?: string,
  characterId?: string
): Promise<GameState | undefined> {
  try {
    const initial = requireMcpGameState(gameState ?? await callMCPTool('get_game_state', {}, sessionId, adventureId, characterId))
    // Internal message context only. An allowance still requires a model-authored
    // grant_player_action call, and combat grants survive message boundaries.
    const syncedState = { ...initial, dmActionAllowance: { requestId,
      actionRevisionAtStart: initial.playerActionRevision ?? 0, granted: false,
      combatTurnKey: initial.dmActionAllowance?.combatTurnKey } }
    return requireMcpGameState(await callMCPTool('replace_game_state', { gameState: syncedState }, sessionId, adventureId, characterId))
  } catch (err) {
    // NE JAMAIS retomber sur get_game_state ici : sur un process fraîchement
    // spawné il renverrait l'état INITIAL du module, qui serait ensuite
    // persisté → reset silencieux de la partie. On échoue la requête (la
    // route rembourse + 503, la sauvegarde n'est pas touchée).
    logEvent('error', 'dm.state.replace_failed', { sessionId, err: err instanceof Error ? err.message : String(err) })
    return undefined
  }
}

// ── POST handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  return withRecording(async () => {
    const response = await recordedPOST(req)
    await finishRecording(response)
    return response
  })
}

async function recordedPOST(req: NextRequest): Promise<NextResponse> {
  const requestId = generateRequestId()
  const startedAt = Date.now()

  let body: DMRequest
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Corps de requête JSON invalide' }, { status: 400 })
  }

  const { message, sessionId, clientRequestId, clientMeta } = body
  const inputMode = clientMeta?.inputMode ?? 'text'

  if (!message?.trim()) {
    return NextResponse.json({ error: 'Message requis' }, { status: 400 })
  }

  // Plafond de longueur AVANT rate-limit et débit : refuser un message géant ne
  // doit rien coûter au joueur.
  if (message.length > DM_MAX_MESSAGE_CHARS) {
    return NextResponse.json(
      { error: `Message trop long (${message.length} caractères, maximum ${DM_MAX_MESSAGE_CHARS}).` },
      { status: 400 }
    )
  }

  // Validation cheap de l'adventureId AVANT tout débit : un id fourni mais
  // inconnu est un 400 immédiat (l'appartenance à la session, la disponibilité
  // et le mismatch 409 sont vérifiés plus bas, après chargement de la session).
  if (body.adventureId && !isKnownAdventureId(body.adventureId)) {
    return NextResponse.json({ error: `Module d'aventure inconnu : "${body.adventureId}"` }, { status: 400 })
  }
  // Idem pour le personnage (miroir d'adventureId) : id fourni mais inconnu → 400.
  if (body.characterId && !isKnownCharacterId(body.characterId)) {
    return NextResponse.json({ error: `Personnage inconnu : "${body.characterId}"` }, { status: 400 })
  }

  // ── Anti-abus : AVANT tout débit et tout appel LLM ──────────────────────────
  // Rate-limit par IP (le quota invité se contourne en effaçant le cookie, pas
  // l'IP) + disjoncteur global de dépense journalière.
  const clientIp = clientIpFromHeaders(req.headers)
  const rateLimit = checkRateLimit(`dm:${clientIp}`)
  if (!rateLimit.ok) {
    logEvent('warn', 'abuse.rate_limited', { requestId, sessionId, clientIp })
    return NextResponse.json(
      { error: 'Trop de messages envoyés. Réessayez dans un instant.' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } }
    )
  }
  if (!(await consumeDailyGlobalBudget())) {
    return NextResponse.json(
      { error: 'Le Dungeon Master a atteint sa limite quotidienne. Revenez demain !' },
      { status: 429, headers: { 'Retry-After': '3600' } }
    )
  }

  // ── Monétisation : débit AVANT le travail LLM, remboursement si erreur ──────
  // Connecté → 1 token de son solde. Anonyme → 1 des GUEST_MESSAGE_LIMIT
  // messages gratuits (suivis côté serveur par cookie invité httpOnly).
  let quota: DMQuota | undefined
  let debited: DebitRecord = null
  // Propriétaire de la requête ("user:<id>" / "guest:<id>") : lie les sessions
  // de jeu à leur créateur. null hors monétisation (tests, dev sans runtime Next).
  let ownerId: string | null = null
  // userId du compte connecté (null pour un invité ou hors monétisation) —
  // requis pour la garde d'accès aux modules payants plus bas.
  let userId: string | null = null

  if (MONETIZATION_ENABLED) {
    // Import paresseux : lib/entitlements tire next-auth + next/headers, qui
    // n'existent que dans le runtime Next (voir MONETIZATION_ENABLED ci-dessus).
    const { resolveEntitlement } = await import('@/lib/entitlements')
    const entitlement = await resolveEntitlement()
    ownerId = entitlement.kind === 'user'
      ? `user:${entitlement.userId}`
      : `guest:${entitlement.guestId}`
    userId = entitlement.kind === 'user' ? entitlement.userId : null

    if (entitlement.kind === 'user') {
      const debit = await consumeUserCredit(entitlement.userId)
      if (!debit.ok) {
        return NextResponse.json({
          error: 'Solde de messages épuisé. Achetez un pack pour continuer l\'aventure.',
          quota: { kind: 'user', balance: 0 } satisfies DMQuota,
        }, { status: 402 })
      }
      debited = { kind: 'user', userId: entitlement.userId }
      quota = { kind: 'user', balance: debit.balance }
    } else {
      const debit = await consumeGuestMessage(entitlement.guestId)
      if (!debit.ok) {
        return NextResponse.json({
          error: `Les ${GUEST_MESSAGE_LIMIT} messages d'essai gratuits sont épuisés. Connectez-vous pour continuer à jouer.`,
          quota: { kind: 'guest', remaining: 0, limit: GUEST_MESSAGE_LIMIT } satisfies DMQuota,
        }, { status: 402 })
      }
      debited = { kind: 'guest', guestId: entitlement.guestId }
      quota = { kind: 'guest', remaining: debit.remaining, limit: GUEST_MESSAGE_LIMIT }
    }
  }

  const releaseLock = await acquireSessionLock(sessionId)
  const usageLog: LlmUsageLogEntry[] = []
  let committedGameState: GameState | undefined

  try {
    const storedSession = await loadSession(sessionId)

    // Appartenance : une session existante n'est jouable que par son créateur
    // (connecté ou invité). Les sessions historiques sans owner restent jouables.
    if (storedSession?.ownerId && ownerId && storedSession.ownerId !== ownerId) {
      await refundDebit(debited, { requestId, sessionId })
      logEvent('warn', 'dm.session.owner_mismatch', { requestId, sessionId, ownerId })
      return NextResponse.json(
        { error: 'Cette partie appartient à un autre joueur.' },
        { status: 403 }
      )
    }

    // ── Résolution du module d'aventure ────────────────────────────────────
    // Session existante → l'aventure de LA SESSION fait foi (jamais de bascule
    // en cours de partie : un id différent dans la requête est un 409).
    // Nouvelle session → l'id du body, qui doit être un module DISPONIBLE.
    // Colonne stockée en priorité, puis l'id porté par l'état (compat).
    if (clientRequestId && storedSession?.gameState?.handledRequestIds?.includes(clientRequestId)) {
      await refundDebit(debited, { requestId, sessionId })
      return NextResponse.json({ error: 'Request already resolved; reload the session.', code: 'REQUEST_ALREADY_RESOLVED' }, { status: 409 })
    }

    const storedAdventureId = storedSession?.adventureId ?? storedSession?.gameState?.adventureId
    let adventureId: string
    if (storedSession) {
      adventureId = storedAdventureId ?? DEFAULT_ADVENTURE_ID
      if (body.adventureId && body.adventureId !== adventureId) {
        await refundDebit(debited, { requestId, sessionId })
        logEvent('warn', 'dm.session.adventure_mismatch', { requestId, sessionId, requested: body.adventureId, actual: adventureId })
        return NextResponse.json(
          { error: 'Cette partie appartient à une autre aventure. Démarre une nouvelle partie pour en changer.' },
          { status: 409 }
        )
      }
    } else {
      adventureId = body.adventureId ?? DEFAULT_ADVENTURE_ID
      try {
        // Sécurité : on ne démarre une partie que sur un module disponible.
        requireAvailableAdventure(adventureId)
      } catch {
        await refundDebit(debited, { requestId, sessionId })
        logEvent('warn', 'dm.session.adventure_unavailable', { requestId, sessionId, adventureId })
        return NextResponse.json(
          { error: `Module d'aventure non disponible : "${adventureId}"` },
          { status: 403 }
        )
      }
    }

    // ── Résolution du personnage (miroir exact de l'aventure) ──────────────────
    // Session existante → le personnage de LA SESSION fait foi (jamais de bascule
    // en cours de partie : un id différent est un 409). Nouvelle session → l'id du
    // body, sinon le guerrier par défaut. Colonne stockée en priorité, puis l'id
    // porté par l'état (compat legacy).
    const storedCharacterId = storedSession?.characterId ?? storedSession?.gameState?.characterId
    let characterId: string
    if (storedSession) {
      characterId = storedCharacterId ?? DEFAULT_CHARACTER_ID
      if (body.characterId && body.characterId !== characterId) {
        await refundDebit(debited, { requestId, sessionId })
        logEvent('warn', 'dm.session.character_mismatch', { requestId, sessionId, requested: body.characterId, actual: characterId })
        return NextResponse.json(
          { error: 'Cette partie se joue avec un autre personnage. Démarre une nouvelle partie pour en changer.' },
          { status: 409 }
        )
      }
    } else {
      characterId = body.characterId ?? DEFAULT_CHARACTER_ID
    }

    // ── Garde d'accès aux modules payants ─────────────────────────────────
    // Un module `requiresEntitlement` (ex. Tide Crypt) exige un compte connecté
    // AYANT acheté l'accès. Garde SERVEUR autoritaire : l'UI n'est qu'indicative.
    // Post-débit → rembourser avant tout return (invariant #2). Sous monétisation
    // seulement (hors runtime Next il n'y a ni compte ni achat possible).
    if (MONETIZATION_ENABLED && getAdventureDefinition(adventureId).requiresEntitlement) {
      // Import paresseux (comme lib/entitlements) : jamais chargé quand la
      // monétisation est coupée. module-access ne tire que lib/db (pg).
      const { hasModuleAccess } = await import('@/lib/module-access')
      if (!userId) {
        await refundDebit(debited, { requestId, sessionId })
        logEvent('warn', 'dm.module.login_required', { requestId, sessionId, adventureId })
        return NextResponse.json(
          { error: 'Connexion requise pour jouer à ce module.', moduleLocked: adventureId },
          { status: 402 }
        )
      }
      if (!(await hasModuleAccess(userId, adventureId))) {
        await refundDebit(debited, { requestId, sessionId })
        logEvent('warn', 'dm.module.purchase_required', { requestId, sessionId, adventureId, userId })
        return NextResponse.json(
          { error: 'Ce module doit être acheté pour y jouer.', moduleLocked: adventureId },
          { status: 402 }
        )
      }
    }

    // Réserver le worker pour le TOUR COMPLET, après autorisation et débit.
    // Le finally libère même en cas d'erreur/refus : aucun arrêt entre deux LLM.
    await startRecording(sessionId, { requestId, clientRequestId, message, adventureId, characterId })

    // État SERVEUR autoritaire (monétisation active) : le moteur MCP valide les
    // règles, donc l'état ne doit jamais venir du client — un gameState forgé
    // contournerait toutes les validations, et un summaryContext forgé serait
    // injecté tel quel dans le prompt système (prompt injection). Session
    // existante → état stocké ; nouvelle session → état initial du moteur.
    // Hors monétisation (tests, dev hors runtime Next), comportement historique :
    // le client peut fournir état/historique.
    const serverAuthoritative = ownerId !== null
    let currentGameState = serverAuthoritative
      ? storedSession?.gameState
      : body.gameState ?? storedSession?.gameState
    // Estampille l'aventure résolue sur l'état existant (états historiques sans
    // le champ) — le moteur préserve ensuite cet id au replace_game_state.
    if (currentGameState && !currentGameState.adventureId) {
      currentGameState = { ...currentGameState, adventureId }
    }
    // Idem pour le personnage (états historiques sans le champ).
    if (currentGameState && !currentGameState.characterId) {
      currentGameState = { ...currentGameState, characterId }
    }
    // Une histoire déjà résumée doit repartir de son suffixe stocké, même en
    // dev : le transcript complet de l'UI réintroduirait les échanges résumés.
    const storedHistoryIsCompressed = Boolean(storedSession?.summaryContext)
    const history = serverAuthoritative || storedHistoryIsCompressed
      ? storedSession?.history ?? []
      : body.history ?? storedSession?.history ?? []
    let summaryContext = serverAuthoritative || storedHistoryIsCompressed
      ? storedSession?.summaryContext
      : body.summaryContext ?? storedSession?.summaryContext

    logEvent('info', 'dm.request.start', {
      requestId,
      sessionId,
      clientRequestId,
      inputMode,
      messageLength: message.length,
      historyLength: history.length,
      hasStoredSession: Boolean(storedSession),
      gameState: summarizeGameState(currentGameState),
    })

    await prepareDevelopmentMCPClient(sessionId)
    if (process.env.NODE_ENV === 'development') invalidateContextCache()

    // Synchronise l'état côté serveur MCP (ou récupère l'état initial). PREMIER
    // appel MCP de la requête → c'est ici que le process enfant est spawné avec
    // ADVENTURE_ID ; les appels suivants réutilisent ce process (même session).
    const synced = await syncGameStateToMcp(currentGameState, requestId, sessionId, adventureId, characterId)
    if (!synced) {
      // Retour (pas d'exception) : le catch ne s'exécute pas — rembourser ici.
      await refundDebit(debited, { requestId, sessionId })
      return NextResponse.json({ error: 'Serveur MCP non disponible.' }, { status: 503 })
    }
    currentGameState = synced

    const narrationBefore = structuredClone(currentGameState)
    const requestReceipts = new Set(storedSession?.gameState?.handledRequestIds ?? currentGameState.handledRequestIds ?? [])
    const narrationCalls: ResolvedCall[] = []
    const pendingAtStart = pendingCombatContinuation(currentGameState)
    const heldReactionAtStart=Boolean(currentGameState.hero?.pending)
    let recoveringPreviousTurn = Boolean(pendingAtStart)

    const baseContext: LlmCallContext = {
      requestId,
      sessionId,
      clientRequestId,
      inputMode,
      operation: 'dm.turn',
      usageLog,
      playerMessage: message,
      gameState: currentGameState,
    }

    const allMcpTools = await getMcpTools(sessionId, adventureId)
    const toolCatalog = createToolCatalog()
    const availableTools = () => selectToolsForPhase(allMcpTools, currentGameState!.phase,currentGameState!.player.ruleset==='srd2014')
    const mcpTools = toolCatalog.exposed(availableTools())
    baseContext.tools = mcpTools
    logEvent('info', 'dm.mcp_tools.selected', {
      requestId,
      sessionId,
      phase: currentGameState.phase,
      toolNames: mcpTools.map(tool => tool.name),
    })

    const staticSystem = buildStaticSystemBlocks(currentGameState)
    const budgetFor = (params: Llm.MessageCreateParamsNonStreaming): HistoryBudget => async (recent, summary, hasHistory) => {
      const size = await measureLlmContext({ ...params,
        messages: [...historyPromptMessages(recent, summary), ...params.messages] })
      return !size || size.inputTokens + params.max_tokens + (hasHistory ? CONTEXT_RESERVE_TOKENS : 0) <= size.contextWindow
    }
    const processedHistory = await processHistory(history, summaryContext, baseContext, budgetFor({
      model: MODEL, max_tokens: MAX_TOKENS, system: staticSystem, tools: mcpTools,
      messages: [buildTurnUserMessage(currentGameState, message)],
    }))
    summaryContext = processedHistory.summaryContext
    const persistHistory = async () => saveSession(sessionId, { gameState: currentGameState!,
      history: processedHistory.retainedHistory, summaryContext,
      ownerId: storedSession?.ownerId ?? ownerId ?? undefined, adventureId, characterId })
    let urbanReferenceCommitted = false
    const checkpointToolState = async (markRequest = true) => {
      if (markRequest && clientRequestId) requestReceipts.add(clientRequestId)
      const state = currentGameState!
      state.handledRequestIds = [...requestReceipts]
      await persistHistory()
      committedGameState = structuredClone(state)
    }
    if (processedHistory.compressed) await persistHistory()

    // Contexte volatil (état + salle + reprise éventuelle) GELÉ à l'ouverture
    // du tour dans le message user courant : il ne sera pas re-sérialisé en cours de
    // boucle : l’état frais vient des résultats outils ordonnés.
    // Le système ne porte QUE le bloc statique, byte-identique sur toute la boucle.
    const turnDirective = [pendingAtStart
      ? `État de combat hérité du tour précédent : ${pendingAtStart}. Résous d'abord cette suite avec les outils que tu choisis, avant de traiter la nouvelle intention du joueur. Aucun outil de jeu n'a été exécuté automatiquement.` : null]
      .filter((part): part is string => Boolean(part))
      .join('\n') || undefined
    const messages: Llm.MessageParam[] = [
      ...historyPromptMessages(processedHistory.messages, summaryContext),
      buildTurnUserMessage(currentGameState, message, undefined, turnDirective),
    ]
    let historyPrefixLength = messages.length - 1
    const fitModelRequest = async (params: Llm.MessageCreateParamsNonStreaming): Promise<Llm.MessageCreateParamsNonStreaming> => {
      // Seul le préfixe historique peut changer. Le contexte d'ouverture et le
      // transcript tool_use/tool_result du tour restent intacts et dans l'ordre.
      const suffix = params.messages.slice(historyPrefixLength)
      const next = await processHistory(processedHistory.retainedHistory, summaryContext, baseContext,
        budgetFor({ ...params, messages: suffix }))
      if (next.compressed) {
        const prefix = historyPromptMessages(next.messages, next.summaryContext)
        messages.splice(0, historyPrefixLength, ...prefix)
        historyPrefixLength = prefix.length
        Object.assign(processedHistory, next, { compressed: true })
        summaryContext = next.summaryContext
        await persistHistory()
        return { ...params, messages: [...prefix, ...suffix] }
      }
      return params
    }

    const toolsUsed: string[] = []
    let narrative = ''
    let iterations = 0
    let stalledIterations = 0
    // Only the engine may mark a model-authored social procedure incomplete.
    // Keep tools available so the agent can correct/finish it within the usual
    // stalled-iteration budget; never synthesize a call or rewrite arguments.
    let pendingSocialContinuation: Record<string, unknown> | null = null
    const socialContinuationTools = new Set(['record_social_conversation', 'resolve_social_request', 'end_social_interaction'])
    const successfulResolutions = new Set<string>()
    const recordResolution = (tool: string, input: Record<string, unknown>, result: unknown) => {
      // Ignore call IDs and prose: replaying the same successful result must not
      // keep a stuck agent alive. Distinct MCP resolutions renew its allowance.
      const key = JSON.stringify([tool, input, result])
      if (successfulResolutions.has(key)) return
      successfulResolutions.add(key)
      stalledIterations = 0
    }
    let primaryActionToolUsed: string | null = null
    let additionalPlayerActionAvailable = false
    const resolvedPrimaryTools = new Set<string>()
    let restDecisionId: string | null = null
    let castingDecisionId: string | null = null
    let copyDecisionId: string | null = null
    let gearRecoveryDecisionId: string | null = null
    let gearTransferDecisionId: string | null = null
    let craftingDecisionId: string | null = null
    let trainingDecisionId: string | null = null
    let poisonHarvestDecisionId: string | null = null
    let jumpDecisionId: string | null = null
    let specialMovementDecisionId: string | null = null
    let ammunitionSearchDecisionId: string | null = null
    let ammunitionSearchMarksAtMove = -1
    let travelDecisionId: string | null = null
    let sawMcpToolError = false
    let hasGameplayResolution = false
    // Free prose cannot certify success after an unsuccessful attempt. Keep
    // this sticky for the turn, including after an agent's corrected retry.
    let sceneFactBlocked = false
    let turnBlockedCode: string | null = null
    let combatResponseCompleted = false
    let stealthMoveResolved = false
    let approachedDoorId: string | null = null
    let doorCrossingResolved = false
    let activeReaction: ReturnType<typeof reactionOpportunities>[number] | undefined
    const attemptedReactions = new Set<string>()
    const queueReaction = () => {
      if(currentGameState?.hero?.pending||currentGameState&&currentCleavingChoice(currentGameState))return false
      const next = reactionOpportunities(currentGameState!).find(o => !attemptedReactions.has(o.activationKey))
      if (!next) return false
      activeReaction = next
      attemptedReactions.add(next.activationKey)
      messages.push({ role: 'user', content: `REACTIVE NPC DECISION: ${JSON.stringify(next)}. Explicitly call npc_action with these npcId and activationKey, 1-3 permitted actions or wait. No gameplay call has been executed by the server. Objectives are motivations, not acquired facts. Complete this activation before narrating to the player.` })
      return true
    }
    if (currentGameState.phase === 'combat') queueReaction()

    while (stalledIterations < MAX_STALLED_ITERATIONS) {
      iterations++
      stalledIterations++

      // L'état peut avoir changé après un tool call : on rafraîchit le contexte du
      // mock (qui pilote les tools sur l'état frais). Le prompt LIVE, lui, ne
      // re-sérialise pas l'état — il vient des tool_result accumulés dans `messages`.
      baseContext.gameState = currentGameState
      baseContext.operation = activeReaction ? 'dm.npc' : 'dm.turn'
      const exposedTools = toolCatalog.exposed(availableTools())
      const iterationTools = activeReaction ? exposedTools.filter(tool => ['npc_action','consult_rules','consult_campaign','get_rules_support','get_monster_stat_block','discover_tools'].includes(tool.name)) : exposedTools
      baseContext.availableTools = availableTools()
      baseContext.tools = iterationTools

      const response = await createLlmMessage(
        await fitModelRequest({
          model: MODEL,
          max_tokens: MAX_TOKENS,
          system: staticSystem,
          tools: iterationTools.length > 0 ? iterationTools : undefined,
          ...(activeReaction || pendingSocialContinuation ? { tool_choice: { type: 'any' as const, disable_parallel_tool_use: true } } : {}),
          messages,
        }),
        baseContext
      )

      const toolUseBlocks = response.content.filter(
        (block): block is Llm.ToolUseBlock => block.type === 'tool_use'
      )
      if (response.stop_reason === 'max_tokens') {
        throw new Error('Réponse LLM tronquée : aucune action partielle ne sera exécutée.')
      }
      if (response.stop_reason !== 'tool_use') {
        if (toolUseBlocks.length) throw new Error('Réponse LLM incohérente : appels outils sans fin tool_use.')
        // Un fournisseur ignorant l'outil forcé ne doit pas publier une issue.
        const pending = pendingCombatContinuation(currentGameState)
        if (pending) {
          // This is validation of an incomplete engine state, not a decision
          // about the next action: only the model may emit further tool calls.
          messages.push({ role: 'user', content: `La résolution mécanique n'est pas terminée : ${pending}. Choisis les appels MCP nécessaires avant de narrer. Aucun effet supplémentaire n'a été appliqué par le serveur.` })
          continue
        }
        if (activeReaction) { activeReaction = undefined; continue }
        if (pendingSocialContinuation) {
          messages.push({ role: 'user', content: `Le moteur signale une procédure sociale encore incomplète : ${JSON.stringify(pendingSocialContinuation)}. Choisis les appels nécessaires pour corriger ou terminer l'action déjà déclarée avant la narration. Réutilise les consultations pertinentes de ce tour. Aucun outil ni argument n'a été choisi ou exécuté par le serveur. Si une véritable décision du joueur manque ou qu'une règle bloque l'action, fais constater ce blocage par les outils adaptés ; ne transforme pas une erreur de participants en demande de reformulation.` })
          continue
        }
        if (queueReaction()) continue
        if (response.stop_reason !== 'end_turn') throw new Error('Réponse LLM interrompue avant la narration finale.')
        narrative = response.content.filter((block): block is Llm.TextBlock => block.type === 'text')
          .map(block => block.text).join('\n\n').trim()
        break
      }
      if (toolUseBlocks.length === 0) throw new Error('Réponse LLM tool_use sans appel outil.')

      // Une prose accompagnant un appel peut inventer une issue avant résolution.
      // Ni publication, ni réinjection de cette prose comme fait acquis.
      messages.push({ role: 'assistant', content: response.content.filter(block => block.type !== 'text') })
      const toolResults: Llm.ToolResultBlockParam[] = []

      for (const toolUse of toolUseBlocks) {
        const input = isObjectRecord(toolUse.input) ? { ...toolUse.input } : {}
        // The live transport validates exposed schemas; the engine validates mechanics.
        // This public whitelist also protects injected/scripted model responses.
        if (!allMcpTools.some(tool => tool.name === toolUse.name)) {
          sceneFactBlocked = true
          toolResults.push({ type: 'tool_result', tool_use_id: toolUse.id, is_error: true,
            content: JSON.stringify({ code: 'TOOL_UNAVAILABLE', error: 'Cet outil est inconnu ou indisponible dans cette phase ; consulte discover_tools.' }) })
          continue
        }
        const playerPrimaryAction = isPlayerPrimaryAction(toolUse.name, input, currentGameState)
        if ((activeReaction && !['consult_rules','consult_campaign','discover_tools','get_rules_support','get_monster_stat_block'].includes(toolUse.name) && (toolUse.name !== 'npc_action' || input.npcId !== activeReaction.npcId || input.activationKey !== activeReaction.activationKey))
          || (!activeReaction && toolUse.name === 'npc_action')) {
          sceneFactBlocked = true
          toolResults.push({ type: 'tool_result', tool_use_id: toolUse.id, is_error: true, content: JSON.stringify({ code: 'NPC_CONTEXT_REQUIRED', error: 'Use the current reactive decision subject.' }) })
          continue
        }
        // A monster response hands control back to the human, not to another
        // LLM-authored player action in this same message.
        if (combatResponseCompleted && (playerPrimaryAction
          || ['start_encounter', 'enter_combat', 'use_class_feature', 'grant_player_action', 'next_turn', 'pass_turn', 'run_monster_turns'].includes(toolUse.name))) {
          sceneFactBlocked = true
          toolResults.push({ type: 'tool_result', tool_use_id: toolUse.id, is_error: true,
            content: JSON.stringify({ code: 'COMBAT_RESPONSE_COMPLETE', error: 'Le tour est terminé. Attends la prochaine action du joueur.' }) })
          turnBlockedCode = 'COMBAT_RESPONSE_COMPLETE'
          continue
        }
        if (toolUse.name === 'record_scene_fact' && sceneFactBlocked) {
          const result = { code: 'SCENE_FACT_UNCONFIRMED', error: 'Mémoire refusée : tentative échouée/refusée/incomplète dans ce tour. Aucun fait ajouté ni remplacé. Ne transforme pas cette tentative en réussite ; les résultats et états mécaniques font autorité.' }
          logEvent('warn', 'dm.tool_use.blocked_unconfirmed_fact', { requestId, sessionId, toolName: toolUse.name })
          toolResults.push({ type: 'tool_result', tool_use_id: toolUse.id, is_error: true, content: JSON.stringify(result) })
          continue
        }
        // Garde-fou "une action de jeu majeure par message" : il n'a de sens qu'en
        // EXPLORATION. En COMBAT, c'est déjà le moteur MCP qui borne tout (économie
        // d'action par tour via actionUsed/movementUsed, jets/attaques limités au tour
        // de l'acteur, action requise avant next_turn). Un même message joueur doit
        // donc pouvoir dérouler un round complet : joueur → next_turn → monstre →
        // next_turn. On désactive donc le garde-fou tant que la phase est "combat".
        const inCombat = currentGameState.phase === 'combat'
        // One move may accompany one other action (e.g. leave an item then
        // walk away). Repeated moves/checks remain blocked. A stealth move
        // already includes its check and consumes the entire action.
        const inventoryCompanion = ['drop_item', 'pick_up_item'].some(name => name === toolUse.name || resolvedPrimaryTools.has(name))
        const isStealthMove = playerPrimaryAction && toolUse.name === 'move_token' && input.stealth === true
        const oneMovementDecision = resolvedPrimaryTools.size === 1
          || (jumpDecisionId !== null || specialMovementDecisionId !== null)
            && [...resolvedPrimaryTools].every(name => MOVEMENT_TOOLS.has(name))
        const movementCompanion = (!(stealthMoveResolved || isStealthMove) || inventoryCompanion) && oneMovementDecision
          && (MOVEMENT_TOOLS.has(toolUse.name) !== [...resolvedPrimaryTools].some(name=>MOVEMENT_TOOLS.has(name)))
          && !resolvedPrimaryTools.has(toolUse.name)
        // Budget exception for a model-requested crossing of the SAME door
        // already approached this turn. This reads tool arguments, never prose.
        const doorCrossingCompanion = toolUse.name === 'move_token' && input.doorMode === 'cross'
          && typeof input.doorId === 'string' && input.doorId === approachedDoorId && !doorCrossingResolved
          && !stealthMoveResolved && [...resolvedPrimaryTools].every(name => name === 'move_token' || name === 'interact_door')
        // Additional hit dice are choices at the SAME actual short-rest end.
        // The model supplies every call and exact rest ID; no action is issued here.
        const restHitDieContinuation = toolUse.name === 'spend_rest_hit_die' && typeof input.restId === 'string'
          && input.restId === restDecisionId
          && currentGameState.dmTools?.rests?.receipts[input.restId]?.completedAt === (currentGameState.worldTimeSeconds ?? 0)
          && [...resolvedPrimaryTools].every(name => REST_DECISION_TOOLS.has(name))
        // Explicit work and completion belong to the SAME actual incantation.
        // This only accounts for model-authored calls; targets and durations
        // remain unchanged and the engine validates all costs and work.
        const castingContinuation = ['continue_casting','finish_casting'].includes(toolUse.name)
          && typeof input.castingId === 'string' && input.castingId === castingDecisionId
          && currentGameState.dmTools?.casting?.records[input.castingId]?.casterId === 'player'
          && [...resolvedPrimaryTools].every(name => CASTING_DECISION_TOOLS.has(name))
        // Explicit segments and completion belong to the same real paid copy.
        // Only the agent selects a job, duration, event resolution or action.
        const copyContinuation = ['continue_spell_copy','resolve_spell_copy'].includes(toolUse.name)
          && typeof input.jobId === 'string' && input.jobId === copyDecisionId
          && !!currentGameState.dmTools?.spellbooks?.jobs[input.jobId]
          && [...resolvedPrimaryTools].every(name => COPY_DECISION_TOOLS.has(name) || MOVEMENT_TOOLS.has(name))
        // Only explicit work on the same real collection/transfer shares this
        // decision. Completion/cancellation are auxiliary engine bookkeeping;
        // neither supplies work, a new action, elapsed time or another job.
        const gearRecoveryContinuation = toolUse.name === 'continue_ground_gear_recovery'
          && typeof input.recoveryId === 'string' && input.recoveryId === gearRecoveryDecisionId
          && !!currentGameState.dmTools?.groundGear?.recoveries?.[input.recoveryId]
          && [...resolvedPrimaryTools].every(name => GEAR_RECOVERY_DECISION_TOOLS.has(name) || MOVEMENT_TOOLS.has(name))
        const gearTransferContinuation = toolUse.name === 'continue_ground_gear_transfer'
          && typeof input.transferId === 'string' && input.transferId === gearTransferDecisionId
          && !!currentGameState.dmTools?.groundGear?.transfers?.[input.transferId]
          && [...resolvedPrimaryTools].every(name => GEAR_TRANSFER_DECISION_TOOLS.has(name) || MOVEMENT_TOOLS.has(name))
        const craftingContinuation = toolUse.name === 'work_ordinary_crafting'
          && typeof input.projectId === 'string' && input.projectId === craftingDecisionId
          && !!currentGameState.dmTools?.ordinaryCrafting?.projects?.[input.projectId]
          && [...resolvedPrimaryTools].every(name => CRAFTING_DECISION_TOOLS.has(name) || MOVEMENT_TOOLS.has(name))
        const trainingContinuation = toolUse.name === 'work_training'
          && typeof input.courseId === 'string' && input.courseId === trainingDecisionId
          && !!currentGameState.dmTools?.training?.courses?.[input.courseId]
          && [...resolvedPrimaryTools].every(name => name === 'work_training' || MOVEMENT_TOOLS.has(name))
        const poisonHarvestContinuation = toolUse.name === 'work_poison_harvest'
          && typeof input.attemptId === 'string' && input.attemptId === poisonHarvestDecisionId
          && !!currentGameState.dmTools?.poisonHarvest?.attempts?.[input.attemptId]
          && [...resolvedPrimaryTools].every(name => name === 'work_poison_harvest' || MOVEMENT_TOOLS.has(name))
        // Walking and jumping are explicitly chosen parts of one movement.
        // This only accounts for the actual calls; the engine validates the
        // running start, remaining distance, terrain and current support.
        const jumpMovementCompanion = !stealthMoveResolved && !isStealthMove && resolvedPrimaryTools.size === 1
          && (toolUse.name === 'jump' && resolvedPrimaryTools.has('move_token')
            || toolUse.name === 'move_token' && input.tokenId === 'player' && resolvedPrimaryTools.has('jump'))
        const jumpContinuation = toolUse.name === 'continue_jump'
          && typeof input.jumpId === 'string' && input.jumpId === jumpDecisionId
          && !!currentGameState.dmTools?.jumping?.jumps[input.jumpId]
          && [...resolvedPrimaryTools].every(name => MOVEMENT_TOOLS.has(name))
        // A real chosen crossing can contain walking, climbing and swimming.
        // Every leg still comes from the model; the engine alone resolves its
        // actual body, medium, path, shared movement cost and interruptions.
        const specialMovementPart = !stealthMoveResolved && !isStealthMove && resolvedPrimaryTools.size > 0
          && [...resolvedPrimaryTools].every(name => MOVEMENT_TOOLS.has(name))
          && (toolUse.name === 'move_by_climbing_or_swimming' && input.entityId === 'player'
            || toolUse.name === 'move_token' && input.tokenId === 'player' && specialMovementDecisionId !== null)
        const specialMovementContinuation = toolUse.name === 'continue_special_movement'
          && typeof input.eventId === 'string' && input.eventId === specialMovementDecisionId
          && currentGameState.dmTools?.jumping?.locomotion?.moves[input.eventId]?.input.entityId === 'player'
          && [...resolvedPrimaryTools].every(name => MOVEMENT_TOOLS.has(name))
        const selectedSearch = ammunitionSearchDecisionId
          ? currentGameState.dmTools?.ammunition?.searches?.[ammunitionSearchDecisionId] : undefined
        // The model explicitly selected this search. A further move needs a
        // newly performed checkpoint; waiting or unrelated actions cannot
        // manufacture one. Actual paths and recovery remain engine decisions.
        const ammunitionSearchContinuation = primaryActionToolUsed !== null && selectedSearch?.status === 'active'
          && typeof selectedSearch.mapId === 'string'
          && selectedSearch.mapId === currentGameState.currentMapId
          && selectedSearch.combatGenerationAtStart === (currentGameState.combatGeneration ?? 0)
          && [...resolvedPrimaryTools].every(name => ['move_token','interact_door','recover_ammunition'].includes(name))
          && (toolUse.name === 'recover_ammunition' && input.searchId === ammunitionSearchDecisionId
            || toolUse.name === 'move_token' && input.tokenId === 'player' && input.stealth !== true
              && selectedSearch.markOrder.length > ammunitionSearchMarksAtMove)
        // Consecutive model-selected segments or navigation of one recorded
        // journey share its exploration action. The engine still enforces
        // actual time, distance, required saves and physical prerequisites.
        const chosenTravelJourneyId = typeof input.journeyId === 'string' ? input.journeyId
          : toolUse.name === 'collect_forage' && typeof input.attemptId === 'string'
            ? currentGameState.dmTools?.foraging?.attempts[input.attemptId]?.input.journeyId : undefined
        const travelContinuation = primaryActionToolUsed !== null && TRAVEL_DECISION_TOOLS.has(toolUse.name)
          && chosenTravelJourneyId !== undefined && chosenTravelJourneyId === travelDecisionId
          && !!currentGameState.dmTools?.travel?.routes[chosenTravelJourneyId]
          && [...resolvedPrimaryTools].every(name => TRAVEL_DECISION_TOOLS.has(name))
        const needsAdditionalAction = playerPrimaryAction && primaryActionToolUsed !== null && !movementCompanion && !doorCrossingCompanion && !restHitDieContinuation && !castingContinuation && !copyContinuation && !gearRecoveryContinuation && !gearTransferContinuation && !craftingContinuation && !trainingContinuation && !poisonHarvestContinuation && !jumpMovementCompanion && !jumpContinuation && !specialMovementPart && !specialMovementContinuation && !ammunitionSearchContinuation && !travelContinuation
        if (needsAdditionalAction && !inCombat && !additionalPlayerActionAvailable) {
          sceneFactBlocked = true
          const result = {
            error: 'A primary game action has already been resolved for this player message.',
            code: 'PRIMARY_ACTION_ALREADY_RESOLVED',
            detail: { firstTool: primaryActionToolUsed, blockedTool: toolUse.name },
          }
          logEvent('warn', 'dm.tool_use.blocked_extra_primary_action', {
            requestId, sessionId, toolName: toolUse.name, primaryActionToolUsed,
          })
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: JSON.stringify(result),
            is_error: true,
          })
          continue
        }

        toolsUsed.push(toolUse.name)
        try {
          const beforeTool = structuredClone(currentGameState)
          const result = await callMCPTool(toolUse.name, input, sessionId, adventureId)
          if (socialContinuationTools.has(toolUse.name)
            && (!pendingSocialContinuation || input.interactionId === pendingSocialContinuation.interactionId)) {
            const continuation = isObjectRecord(result)
              ? result.agentContinuation ?? (isObjectRecord(result.detail) ? result.detail.agentContinuation : undefined)
              : undefined
            pendingSocialContinuation = isObjectRecord(continuation) && continuation.domain === 'social_interactions'
              ? continuation : null
          }
          if (toolUse.name === 'discover_tools' && isObjectRecord(result) && !('error' in result) && Array.isArray(result.tools)) {
            toolCatalog.load(result.tools.flatMap(tool => isObjectRecord(tool) && typeof tool.name === 'string' ? [tool.name] : []), availableTools())
          }
          const urbanReferenceReceipt = URBAN_REFERENCE_RECEIPT_TOOLS.has(toolUse.name)
          if (toolUse.name === 'get_rules_support' && isObjectRecord(result) && typeof input.domain === 'string' && Array.isArray(result.tools)) {
            toolCatalog.load(result.tools.filter((name): name is string => typeof name === 'string'), availableTools())
          }
          if (toolUse.name === 'consult_rules' && isObjectRecord(result) && !('error' in result)
            && (result.kind === 'passage' || result.kind === 'table') && isObjectRecord(result.engineGuidance)
            && Array.isArray(result.engineGuidance.tools)) {
            // Loading schemas follows the model's source read; it never executes a linked action.
            toolCatalog.load(result.engineGuidance.tools.filter((name): name is string => typeof name === 'string'), availableTools())
          }
          if (DOCUMENTARY_TOOLS.has(toolUse.name) || urbanReferenceReceipt) {
            const failed = isObjectRecord(result) && (typeof result.error === 'string' || result.isError === true)
            if (!failed) {
              if (urbanReferenceReceipt) {
                currentGameState = await callMCPTool('get_game_state', {}, sessionId, adventureId) as GameState
                await checkpointToolState(false)
                urbanReferenceCommitted = true
              }
              recordResolution(toolUse.name, input, result)
            }
            toolResults.push({ type: 'tool_result', tool_use_id: toolUse.id,
              content: JSON.stringify(result), ...(failed ? { is_error: true } : {}) })
            // Keep the actual documentary receipt when present, without treating
            // a reference as gameplay evidence, an action or a reaction.
            continue
          }
          narrationCalls.push({ tool: toolUse.name, result })
          // Un refus ne consomme pas l’action primaire. Seul le MJ choisit
          // une correction autorisée ou explique le blocage.
          if (isObjectRecord(result) && (typeof result.error === 'string' || result.isError === true)) {
            sawMcpToolError = true
            sceneFactBlocked = true
            logEvent('warn', 'dm.tool_use.rejected', { requestId, sessionId, toolName: toolUse.name, code: result.code })
            toolResults.push({ type: 'tool_result', tool_use_id: toolUse.id, content: narrationToolResult({ ...result,
              actionRecovery: "L'appel est REFUSÉ : aucun effet de réussite n'est acquis. Lis le détail et l'éventuelle agentContinuation du moteur. Réutilise les consultations pertinentes déjà reçues dans ce tour ; si elles manquent ou si la situation change, consulte get_rules_support et discover_tools, puis consult_rules si la règle est en cause. Inspecte seulement les références incertaines. Corrige les arguments refusés et poursuis l'action déjà déclarée lorsqu'elle reste autorisée, sans demander au joueur de répéter pour réparer ton appel. Conserve les identités et effets confirmés : un événement accepté ou suspendu ne se rejoue qu'avec ses arguments exacts ; un appel refusé sans reçu peut être corrigé avec son eventId encore inutilisé. Ne répète pas les mêmes arguments invalides et ne change pas d'ID pour contourner un conflit ou relancer un dé. Une règle bloquante ou un vrai choix joueur manquant doit être expliqué.",
            }, beforeTool, currentGameState, toolUse.name), is_error: true })
            // Let the AI recover a pending turn; never substitute game calls.
            if (!(PRIMARY_ACTION_TOOLS.has(toolUse.name) && !playerPrimaryAction)
              && ['ACTION_ALREADY_USED', 'NOT_CURRENT_TURN', 'PLAYER_TURN_ACTIVE', 'DOOR_BARRED'].includes(String(result.code))) {
              if (!pendingCombatContinuation(currentGameState)) {
                turnBlockedCode = String(result.code)
                break
              }
            }
            continue
          }
          // A completed tool may still report failure (not an MCP error), or
          // a partial journey. Check only outcome fields, never narrative text
          // or unrelated saving throws within a successful spell's payload.
          if (isObjectRecord(result) && (result.success === false || result.hit === false || result.goalReached === false
            || (isObjectRecord(result.check) && result.check.success === false)
            || (isObjectRecord(result.stealthCheck) && result.stealthCheck.success === false))) {
            sceneFactBlocked = true
          }
          recordResolution(toolUse.name, input, result)
          hasGameplayResolution = true
          if (toolUse.name === 'grant_player_action') additionalPlayerActionAvailable = true
          if (needsAdditionalAction) additionalPlayerActionAvailable = false
          // Le budget du personnage survit à une fin de combat dans ce message.
          // Pendant le combat, l'économie d'action reste contrôlée par le moteur.
          if (playerPrimaryAction && !restHitDieContinuation && !castingContinuation && !copyContinuation && !gearRecoveryContinuation && !gearTransferContinuation && !craftingContinuation && !trainingContinuation && !poisonHarvestContinuation && !jumpContinuation && !specialMovementContinuation
            && !travelContinuation && !(ammunitionSearchContinuation && toolUse.name === 'move_token')) {
            primaryActionToolUsed = toolUse.name
            resolvedPrimaryTools.add(toolUse.name)
          }
          if (isStealthMove) stealthMoveResolved = true
          if (playerPrimaryAction && toolUse.name === 'move_token' && input.doorMode === 'approach' && typeof input.doorId === 'string') approachedDoorId = input.doorId
          if (playerPrimaryAction && toolUse.name === 'move_token' && input.doorMode === 'cross' && isObjectRecord(result) && result.crossed === true) doorCrossingResolved = true
          // Rafraîchit l'état courant après une mutation.
          try {
            currentGameState = await callMCPTool('get_game_state', {}, sessionId, adventureId) as GameState
          } catch {
            // garde l'état précédent
          }
          if (REST_DECISION_TOOLS.has(toolUse.name) && isObjectRecord(result)) {
            const outcome = typeof result.restId === 'string' ? result : isObjectRecord(result.rest) ? result.rest : null
            const id = outcome && typeof outcome.restId === 'string' ? outcome.restId : null
            const receipt = id ? currentGameState.dmTools?.rests?.receipts[id] : undefined
            if (receipt?.hitDiceContinuation && receipt.completedAt === (currentGameState.worldTimeSeconds ?? 0)) restDecisionId = id
          }
          if (CASTING_DECISION_TOOLS.has(toolUse.name) && isObjectRecord(result)) {
            const id = typeof result.castingId === 'string' ? result.castingId
              : typeof input.castingId === 'string' ? input.castingId : null
            if (id && currentGameState.dmTools?.casting?.records[id]?.casterId === 'player') castingDecisionId = id
          }
          if (COPY_DECISION_TOOLS.has(toolUse.name) && isObjectRecord(result)) {
            const id = typeof result.jobId === 'string' ? result.jobId : typeof input.jobId === 'string' ? input.jobId : null
            if (id && currentGameState.dmTools?.spellbooks?.jobs[id]) copyDecisionId = id
          }
          if (GEAR_RECOVERY_DECISION_TOOLS.has(toolUse.name) && typeof input.recoveryId === 'string'
            && currentGameState.dmTools?.groundGear?.recoveries?.[input.recoveryId]) gearRecoveryDecisionId = input.recoveryId
          if (GEAR_TRANSFER_DECISION_TOOLS.has(toolUse.name) && typeof input.transferId === 'string'
            && currentGameState.dmTools?.groundGear?.transfers?.[input.transferId]) gearTransferDecisionId = input.transferId
          if (CRAFTING_DECISION_TOOLS.has(toolUse.name) && typeof input.projectId === 'string'
            && currentGameState.dmTools?.ordinaryCrafting?.projects?.[input.projectId]) craftingDecisionId = input.projectId
          if (toolUse.name === 'work_poison_harvest' && typeof input.attemptId === 'string'
            && currentGameState.dmTools?.poisonHarvest?.attempts?.[input.attemptId]) poisonHarvestDecisionId = input.attemptId
          if (toolUse.name === 'work_training' && typeof input.courseId === 'string'
            && currentGameState.dmTools?.training?.courses?.[input.courseId]) trainingDecisionId = input.courseId
          if (['jump','continue_jump','complete_jump_fall'].includes(toolUse.name)) {
            const id = toolUse.name === 'jump' && typeof input.eventId === 'string' ? input.eventId
              : typeof input.jumpId === 'string' ? input.jumpId : null
            if (id && currentGameState.dmTools?.jumping?.jumps[id]) jumpDecisionId = id
          }
          if (['move_by_climbing_or_swimming','continue_special_movement'].includes(toolUse.name)
            && typeof input.eventId === 'string'
            && currentGameState.dmTools?.jumping?.locomotion?.moves[input.eventId]?.input.entityId === 'player') specialMovementDecisionId = input.eventId
          if (['begin_ammunition_search','advance_ammunition_search'].includes(toolUse.name) && typeof input.searchId === 'string'
            && currentGameState.dmTools?.ammunition?.searches?.[input.searchId]?.status === 'active') {
            ammunitionSearchDecisionId = input.searchId
          }
          if (toolUse.name === 'move_token' && input.tokenId === 'player' && ammunitionSearchDecisionId) {
            ammunitionSearchMarksAtMove = currentGameState.dmTools?.ammunition?.searches?.[ammunitionSearchDecisionId]?.markOrder.length ?? -1
          }
          if (TRAVEL_DECISION_TOOLS.has(toolUse.name) && chosenTravelJourneyId
            && currentGameState.dmTools?.travel?.routes[chosenTravelJourneyId]) travelDecisionId = chosenTravelJourneyId
          // Checkpoint committed mechanics and activation receipts before another model call.
          await checkpointToolState()
          if (toolUse.name === 'npc_action') activeReaction = undefined
          if (recoveringPreviousTurn && !pendingCombatContinuation(currentGameState)) {
            recoveringPreviousTurn = false
          } else if (beforeTool.phase === 'combat'
            && (beforeTool.currentTurn !== 'player' || currentGameState.round > beforeTool.round)
            && currentGameState.phase === 'combat' && currentGameState.currentTurn === 'player') {
            combatResponseCompleted = true
          }
          if(heldReactionAtStart&&beforeTool.currentTurn!=='player'&&currentGameState.currentTurn==='player')combatResponseCompleted=true
          logEvent('info', 'dm.tool_use.ok', { requestId, sessionId, toolName: toolUse.name })
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: narrationToolResult(result, beforeTool, currentGameState, toolUse.name),
          })
        } catch (err) {
          if (socialContinuationTools.has(toolUse.name) && input.interactionId === pendingSocialContinuation?.interactionId) pendingSocialContinuation = null
          sawMcpToolError = true
          sceneFactBlocked = true
          const errMsg = err instanceof Error ? err.message : 'Unknown error'
          logEvent('warn', 'dm.tool_use.error', { requestId, sessionId, toolName: toolUse.name, err: errMsg })
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: JSON.stringify({ error: errMsg }),
            is_error: true,
          })
        }
      }

      messages.push({ role: 'user', content: toolResults })
      if (!activeReaction && currentGameState.phase === 'combat') queueReaction()
      if (turnBlockedCode) break
    }

    // Bounded failure leaves committed engine effects intact. Never invent
    // calls on behalf of the model when it fails to complete a combat cycle.
    const pendingAtEnd = pendingCombatContinuation(currentGameState)
    if (pendingAtEnd) {
      narrative = 'La résolution du tour reste incomplète. Les effets déjà confirmés par le moteur sont conservés ; aucune action supplémentaire n’a été exécutée.'
    } else if (!narrative.trim() && !hasGameplayResolution) {
      narrative = turnBlockedCode === 'DOOR_BARRED'
        ? 'La porte ne peut pas être ouverte depuis ce côté. Le franchissement n’a pas été exécuté.'
        : turnBlockedCode
        ? 'L’action demandée n’a pas été exécutée : le moteur l’a refusée pour ce tour.'
        : 'L’action n’a pas pu être résolue par le moteur. Précise ton intention pour réessayer.'
    }
    // Conserver les jets et les refus du transcript : l'état seul ne les raconte
    // pas. Le système statique reste identique aussi dans cet appel final.
    if (!narrative.trim()) {
      const finalResponse = await createLlmMessage(
        await fitModelRequest({
          model: MODEL,
          max_tokens: MAX_TOKENS,
          system: staticSystem,
          messages: [
            ...messages,
            {
              role: 'user',
              content: `Réponds maintenant uniquement en prose à partir des résultats outils ci-dessus. Rapporte les touches et pertes de PV réellement résolues, même si une armure amortit le choc. Une erreur ou un refus ne constitue jamais une réussite. Ne rejoue aucune action.\nFaits moteur de ce tour, dans l’ordre chronologique (l’état final fait autorité) :\n${narrationEvidence(narrationBefore, currentGameState, narrationCalls).join('\n')}`,
            },
          ],
        }),
        { ...baseContext, gameState: currentGameState, operation: 'dm.final_narration' }
      )
      if (finalResponse.stop_reason !== 'end_turn' || finalResponse.content.some(block => block.type === 'tool_use')) {
        throw new Error('Le LLM n’a pas fourni une narration finale complète.')
      }
      for (const block of finalResponse.content) {
        if (block.type === 'text') narrative += block.text
      }
    }

    // Catch the observed failure (the MJ starts narrating as the player). NPC
    // dialogue starting with a quotation mark is deliberately not matched.
    const speaksAsPlayer = (value: string) => /^(?:\*{1,2})?\s*(?:je\b|j['’])/i.test(value.trim())
    if (speaksAsPlayer(narrative)) {
      const repaired = await createLlmMessage(await fitModelRequest({
        model: MODEL, max_tokens: MAX_TOKENS, system: staticSystem,
        messages: [...messages, { role: 'user', content: 'Rédige la narration finale comme MJ en t’adressant au joueur avec « tu ». Ne parle pas à sa place avec « je », ne lui invente aucune décision et respecte uniquement les résultats outils déjà obtenus. Conserve les répliques des PNJ à la première personne entre guillemets français en identifiant le locuteur ; leur « je » est autorisé et ne doit pas devenir un résumé à la troisième personne. Respecte leur mutisme éventuel et leurs connaissances. Aucun nouvel appel outil.' }],
      }), { ...baseContext, gameState: currentGameState, operation: 'dm.repair_narration' })
      if (repaired.stop_reason !== 'end_turn' || repaired.content.some(block => block.type === 'tool_use')) {
        throw new Error('La correction de narration du MJ est incomplète.')
      }
      narrative = repaired.content.filter((block): block is Llm.TextBlock => block.type === 'text')
        .map(block => block.text).join('\n\n').trim()
      if (!narrative || speaksAsPlayer(narrative)) throw new Error('Le MJ continue de parler à la place du joueur.')
    }

    // Récupère l'état final faisant autorité.
    try {
      currentGameState = await callMCPTool('get_game_state', {}, sessionId, adventureId) as GameState
    } catch {
      // garde l'état courant
    }

    // Historique persisté BORNÉ : quand une compression a eu lieu, les vieux
    // tours vivent désormais dans summaryContext — inutile de les réécrire en
    // base à chaque message. Plafond dur en ceinture de sécurité.
    if (urbanReferenceCommitted && clientRequestId) requestReceipts.add(clientRequestId)
    currentGameState.handledRequestIds = [...requestReceipts]
    const retainedHistory = processedHistory.retainedHistory
    const appendedTurns: ConversationTurn[] = [
      { role: 'player', content: message },
      { role: 'dm', content: narrative },
    ]
    const newHistory = [...retainedHistory, ...appendedTurns].slice(-MAX_STORED_HISTORY_TURNS)

    await saveSession(sessionId, {
      gameState: currentGameState,
      history: newHistory,
      summaryContext,
      ownerId: storedSession?.ownerId ?? ownerId ?? undefined,
      adventureId: currentGameState.adventureId ?? adventureId,
      characterId: currentGameState.characterId ?? characterId,
    })

    const usage: DMTurnUsage = {
      llm: summarizeLlmUsage(usageLog),
      operations: [...new Set(usageLog.map(entry => entry.operation))],
      narrator: 'llm',
      llmRoute: usageLog.some(entry => entry.operation === 'dm.turn') ? 'rich' : 'none',
    }

    logEvent('info', 'dm.request.done', {
      requestId,
      sessionId,
      clientRequestId,
      durationMs: Date.now() - startedAt,
      iterations,
      toolsUsed: [...new Set(toolsUsed)],
      sawMcpToolError,
      narrativeLength: narrative.length,
      usage,
    })

    const dmResponse: DMResponse = {
      narrative: narrative || 'Le Dungeon Master prend un moment pour réfléchir...',
      newGameState: currentGameState,
      toolsUsed: [...new Set(toolsUsed)],
      usage,
      quota,
      ...(processedHistory.compressed && summaryContext ? { summaryContext } : {}),
    }

    return NextResponse.json(dmResponse)
  } catch (err) {
    // Erreur serveur : le joueur ne paie pas — on rembourse le débit initial.
    await refundDebit(debited, { requestId, sessionId })
    logEvent('error', 'dm.request.error', {
      requestId,
      sessionId,
      err: err instanceof Error ? err.message : String(err),
    })
    const errorMessage = err instanceof Error ? err.message : 'Erreur interne du serveur'
    return NextResponse.json({
      error: errorMessage,
      ...(committedGameState ? { newGameState: committedGameState } : {}),
    }, { status: 500 })
  } finally {
    await releaseLock()
  }
}
