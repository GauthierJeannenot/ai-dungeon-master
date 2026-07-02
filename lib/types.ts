export interface Item {
  id: string
  name: string
  type: 'weapon' | 'armor' | 'potion' | 'misc'
  damage?: string    // e.g. "1d8+3"
  acBonus?: number
  description?: string
}

export interface EntityStats {
  str: number
  dex: number
  con: number
  int: number
  wis: number
  cha: number
}

export type Condition =
  | 'blinded'
  | 'charmed'
  | 'deafened'
  | 'frightened'
  | 'grappled'
  | 'incapacitated'
  | 'invisible'
  | 'paralyzed'
  | 'petrified'
  | 'poisoned'
  | 'prone'
  | 'restrained'
  | 'stunned'
  | 'unconscious'
  | 'exhaustion'

export interface PlayerState {
  id: 'player'
  name: string
  class: string
  level: number
  hp: { current: number; max: number }
  deathSaves?: { successes: number; failures: number; stable?: boolean; dead?: boolean }
  ac: number
  stats: EntityStats
  proficiencyBonus: number
  position: { x: number; y: number }
  conditions: Condition[]
  inventory: Item[]
  speed: number         // feet per turn
  initiative?: number
}

export interface MonsterState {
  id: string
  name: string
  type: string          // e.g. "goblin", "orc"
  hp: { current: number; max: number }
  ac: number
  stats: EntityStats
  position: { x: number; y: number }
  conditions: Condition[]
  xpValue: number
  attackBonus: number
  damageDice: string    // e.g. "1d6+2"
  speed: number
  initiative?: number
  isAlive: boolean
  xpAwarded?: boolean
  hostile?: boolean     // false = allié/neutre : ne joue pas de tour offensif (défaut: hostile)
}

export interface CombatLogEntry {
  id: string
  round: number
  turn: string          // entity ID
  action: string        // description of action
  mechanicalDetail?: string  // e.g. "1d20+5 = 14+5 = 19 vs AC 13 → HIT | Dmg: 1d8+3 = 6+3 = 9"
  timestamp: number
}

export type GamePhase = 'exploration' | 'combat' | 'dialogue'

export interface SceneMemory {
  madeNoise?: boolean
  insultedMac?: boolean
  foundRecipeHalfCount?: number
  sparedGoblin?: boolean
  tension?: number
  alertLevel?: number
  macDisposition?: 'neutral' | 'helpful' | 'offended'
  goblinMorale?: 'steady' | 'shaken' | 'broken'
  patrolPressure?: 'quiet' | 'stirring' | 'hunting'
  lastDirectorBeats?: string[]
  lastWorldSignals?: string[]
  updatedAt?: string
}

export interface WorldRoomState {
  id: string
  name: string
  aliases?: string[]
  description?: string
  tags?: string[]
  exits?: string[]
}

export type WorldObjectKind = 'door' | 'container' | 'item' | 'clue' | 'fixture' | 'trap'

export interface WorldObjectState {
  id: string
  roomId: string
  name: string
  aliases?: string[]
  kind: WorldObjectKind
  visible: boolean
  discovered: boolean
  opened?: boolean
  locked?: boolean
  taken?: boolean
  used?: boolean
  disarmed?: boolean
  contains?: string[]
  tags?: string[]
  dc?: {
    search?: number
    open?: number
    force?: number
    unlock?: number
  }
  description?: string
  readableText?: string
  portal?: {
    roomIds: string[]
  }
}

export type WorldNpcDisposition = 'hostile' | 'wary' | 'neutral' | 'helpful' | 'offended'

export interface WorldNpcState {
  id: string
  name: string
  roomId: string
  aliases?: string[]
  disposition: WorldNpcDisposition
  known?: boolean
  faction?: string
  goals?: string[]
  tags?: string[]
  memory?: Record<string, string | number | boolean>
}

export interface WorldQuestState {
  id: string
  name: string
  progress: number
  goal: number
  completed?: boolean
  flags?: Record<string, boolean>
}

export interface WorldAlarmState {
  level: number
  raised: boolean
  reason?: string
  clock?: {
    id: string
    name: string
    value: number
    thresholds?: Record<string, number>
  }
}

export type FictionFactStatus = 'active' | 'used' | 'expired'

export interface FictionFactSoftAffordance {
  id?: string
  kind: CanonicalPlayerActionKind
  label: string
  aliases?: string[]
  reason?: string
  enabled?: boolean
  canonicalAction?: Record<string, unknown>
}

export interface FictionFactState {
  id: string
  text: string
  roomId?: string
  status: FictionFactStatus
  source?: string
  tags?: string[]
  createdAt?: string
  updatedAt?: string
  expires?: 'turn' | 'scene' | 'location' | 'never' | string | null
  softAffordances?: FictionFactSoftAffordance[]
  metadata?: Record<string, string | number | boolean>
}

export interface WorldState {
  schemaVersion?: number
  rooms: Record<string, WorldRoomState>
  objects: Record<string, WorldObjectState>
  npcs: Record<string, WorldNpcState>
  quests: Record<string, WorldQuestState>
  alarms: Record<string, WorldAlarmState>
  fictionFacts: Record<string, FictionFactState>
  flags?: Record<string, boolean>
  eventLog: EngineEvent[]
}

// PNJ de premier ordre, rendu sur la battlemap par son propre token. Distinct des
// MonsterState (combattants) et du WorldNpcState (moteur "world" retiré). Un PNJ peut
// être présent mais invisible (visible:false) tant qu'il ne s'est pas révélé au joueur.
export interface NpcState {
  id: string
  name: string
  kind: string                       // 'awakened_tree', 'dryad', …
  position: { x: number; y: number }
  roomId: string | null              // null = visible quelle que soit la salle
  disposition: WorldNpcDisposition
  visible: boolean                   // false = présent mais pas encore révélé au joueur
  description?: string
}

export interface GameState {
  // Module d'aventure de la partie. Fixé à la création (défaut : module par
  // défaut) et préservé au round-trip replace_game_state. Le moteur MCP le
  // reçoit aussi via ADVENTURE_ID au spawn du process (mcp-server/adventure.ts).
  adventureId?: string
  phase: GamePhase
  player: PlayerState
  monsters: Record<string, MonsterState>   // serializable (no Map)
  npcs?: Record<string, NpcState>          // PNJ avec token (hors combattants)
  initiativeOrder: string[]
  currentTurn: string | null
  round: number
  movementUsed: Record<string, number>  // grid cells spent by entity during its current turn
  actionUsed: Record<string, boolean>   // action economy consumed by entity during its current turn
  combatLog: CombatLogEntry[]
  roomsVisited: string[]
  currentRoomId: string | null
  encountersTriggered?: string[]
  sceneMemory?: SceneMemory
  world?: WorldState
}

export interface DiceRollResult {
  notation: string
  rolls: number[]
  modifier: number
  total: number
  detail: string        // e.g. "1d20+5: [14]+5 = 19"
}

export interface AttackResult {
  attackerId: string
  targetId: string
  weaponOrSpell: string
  attackRoll: DiceRollResult
  naturalRoll?: number
  criticalHit?: boolean
  criticalMiss?: boolean
  targetAC: number
  hit: boolean
  damageRoll?: DiceRollResult
  damageDealt?: number
  targetHpAfter?: number
  targetDied?: boolean
  mechanicalSummary: string
}

export interface SavingThrowResult {
  entityId: string
  ability: keyof EntityStats
  dc: number
  roll: DiceRollResult
  success: boolean
  mechanicalSummary: string
}

export interface AbilityCheckResult {
  entityId: string
  ability: keyof EntityStats
  label?: string
  dc?: number
  proficient: boolean
  expertise: boolean
  roll: DiceRollResult
  success?: boolean
  mechanicalSummary: string
}

export type CanonicalPlayerActionKind =
  | 'attack'
  | 'move'
  | 'interact'
  | 'examine'
  | 'read'
  | 'search'
  | 'open'
  | 'take'
  | 'unlock'
  | 'force'
  | 'disarm'
  | 'talk'
  | 'ask'
  | 'persuade'
  | 'threaten'
  | 'show_item'
  | 'give_item'
  | 'hide'
  | 'help'
  | 'flee'
  | 'stabilize'
  | 'use_object'
  | 'combine_recipe'
  | 'ability_check'
  | 'social'
  | 'use_item'
  | 'wait'
  | 'death_save'
  | 'observe'
  | 'improvise'

export type EngineEventType =
  | 'combat.attack'
  | 'combat.death_save'
  | 'combat.turn_passed'
  | 'combat.started'
  | 'combat.ended'
  | 'entity.moved'
  | 'entity.hp_changed'
  | 'item.used'
  | 'check.rolled'
  | 'room.event'
  | 'room.examined'
  | 'room.object_discovered'
  | 'quest.item_found'
  | 'quest.completed'
  | 'npc.disposition_changed'
  | 'npc.information_revealed'
  | 'door.opened'
  | 'trap.disarmed'
  | 'object.opened'
  | 'object.taken'
  | 'object.examined'
  | 'clue.read'
  | 'object.used'
  | 'item.shown'
  | 'item.given'
  | 'trap.triggered'
  | 'alarm.raised'
  | 'character.hidden'
  | 'escape.attempted'
  | 'character.stabilized'
  | 'fiction.fact_created'
  | 'fiction.fact_used'
  | 'fiction.fact_expired'
  | 'improvisation.resolved'
  | 'action.blocked'
  | 'state.changed'

export interface EngineEvent {
  id: string
  type: EngineEventType
  summary: string
  actorId?: string
  targetId?: string
  round?: number
  turn?: string
  mechanicalDetail?: string
  outcome?: 'hit' | 'miss' | 'success' | 'failure' | 'critical' | 'blocked' | 'unknown'
  visibleToPlayer: boolean
  metadata?: Record<string, unknown>
}

export interface PlayerAffordance {
  id: string
  kind: CanonicalPlayerActionKind
  label: string
  enabled: boolean
  reason: string
  toolName?: string
  aliases?: string[]
  preconditions?: string[]
  blockedReason?: string
  target?: {
    id: string
    type: 'object' | 'npc' | 'inventory' | 'room' | 'self' | 'system' | 'fiction_fact'
    name?: string
  }
  canonicalAction?: Record<string, unknown>
}

export interface EngineResolutionView {
  events: EngineEvent[]
  affordances: PlayerAffordance[]
}

export interface DMDebugTurnView {
  actionIntent?: {
    kind: string
    primitive: string
    reason: string
    confidence: string
    requiresEngine: boolean
  }
  parsedAction?: Record<string, unknown> | null
  targetResolution?: Record<string, unknown> | null
  actionPlan?: Record<string, unknown> | null
  sceneSurface?: Record<string, unknown> | null
  intentInterpreterInputSummary?: Record<string, unknown> | null
  intentInterpreterOutput?: Record<string, unknown> | null
  intentInterpreterModel?: string | null
  intentInterpreterUsed?: boolean
  intentInterpreterFallbackReason?: string | null
  refusalCode?: string | null
  worldDiff?: {
    events: EngineEvent[]
    objects?: Record<string, { before: Record<string, unknown>; after: Record<string, unknown> }>
    npcs?: Record<string, { before: Record<string, unknown>; after: Record<string, unknown> }>
    quests?: Record<string, { before: Record<string, unknown>; after: Record<string, unknown> }>
    alarms?: Record<string, { before: Record<string, unknown>; after: Record<string, unknown> }>
    fictionFacts?: Record<string, { before: Record<string, unknown>; after: Record<string, unknown> }>
    flags?: { before: Record<string, boolean>; after: Record<string, boolean> }
  }
}

// Un tour de conversation envoyé au LLM (player/dm uniquement — pas mechanical)
export interface ConversationTurn {
  role: 'player' | 'dm'
  content: string
}

export interface DMClientMeta {
  inputMode?: 'text' | 'voice'
  voice?: {
    inputProvider?: 'browser-speech-recognition'
    outputProvider?: 'browser-speech-synthesis'
    transcriptChars?: number
    finalTranscriptOnly?: boolean
    noServerAudioUpload?: boolean
    language?: string
    recognitionEngine?: string
  }
}

export interface DMLlmUsageSummary {
  calls: number
  inputTokens: number
  outputTokens: number
  cacheCreationInputTokens: number
  cacheReadInputTokens: number
  totalInputTokens: number
  estimatedCostUsd: number
}

export interface DMTurnUsage {
  llm: DMLlmUsageSummary
  operations: string[]
  narrator: 'director' | 'local' | 'llm' | 'fallback' | 'rule'
  llmRoute: 'none' | 'short' | 'rich' | 'blocked'
}

export interface TurnTraceActionExecution {
  id: string
  source:
    | 'engine_first'
    | 'action_plan'
    | 'llm_tool'
    | 'llm_tool_blocked'
    | 'auto'
    | 'rule'
  toolName: string
  input?: Record<string, unknown>
  result?: unknown
  executed: boolean
  succeeded: boolean
  errorCode?: string | null
}

export interface TurnTrace {
  schemaVersion: 1
  traceId: string
  requestId: string
  clientRequestId?: string
  sessionId?: string
  startedAt: string
  completedAt: string
  status: 'completed' | 'error'
  input: {
    raw: string
    inputMode?: string
  }
  intent?: DMDebugTurnView['actionIntent']
  parsedAction?: Record<string, unknown> | null
  targetResolution?: Record<string, unknown> | null
  actionPlan?: Record<string, unknown> | null
  sceneSurface?: Record<string, unknown> | null
  intentInterpreterInputSummary?: Record<string, unknown> | null
  intentInterpreterOutput?: Record<string, unknown> | null
  intentInterpreterModel?: string | null
  intentInterpreterUsed?: boolean
  intentInterpreterFallbackReason?: string | null
  actions: TurnTraceActionExecution[]
  toolsUsed: string[]
  engineEvents: EngineEvent[]
  affordances: PlayerAffordance[]
  worldDiff?: DMDebugTurnView['worldDiff']
  enemyReactions: Array<Record<string, unknown>>
  narrativeFacts: Array<{ kind: string; trigger: string }>
  contradictions: Array<{
    reason: string
    fact?: Record<string, unknown>
    suggestedTools?: string[]
  }>
  finalNarration: string
  narrator: DMTurnUsage['narrator']
  llmRoute: DMTurnUsage['llmRoute']
  refusalCode?: string | null
}

// API request/response types
export interface DMRequest {
  message: string
  // Per-client request id for correlating browser and server logs.
  clientRequestId?: string
  // Per-tab browser session used to isolate MCP game state on the server.
  sessionId?: string
  // Module d'aventure choisi (nouvelle session). Ignoré si la session existe
  // déjà — l'aventure de la session fait foi (mismatch → 409).
  adventureId?: string
  gameState?: GameState
  // Historique récent gardé verbatim (derniers N messages player/dm)
  history?: ConversationTurn[]
  // Résumé compressé des échanges plus anciens (généré par le LLM quand l'historique est trop long)
  summaryContext?: string
  // Small client-side hints for observability/cost analysis. Never contains audio.
  clientMeta?: DMClientMeta
}

// État de consommation renvoyé au client après chaque message.
//   - user  : balance = tokens restants sur le compte
//   - guest : remaining/limit = messages gratuits restants (anonyme)
export interface DMQuota {
  kind: 'user' | 'guest'
  balance?: number
  remaining?: number
  limit?: number
}

export interface DMResponse {
  narrative: string
  newGameState: GameState
  toolsUsed: string[]
  engine?: EngineResolutionView
  debug?: DMDebugTurnView
  turnTrace?: TurnTrace
  usage?: DMTurnUsage
  quota?: DMQuota
  // Nouveau résumé retourné si une compression a eu lieu pendant cette requête
  summaryContext?: string
  error?: string
}

// Chat message types for frontend
export type MessageRole = 'player' | 'dm' | 'mechanical'

export interface ChatMessage {
  id: string
  role: MessageRole
  content: string
  timestamp: number
}
