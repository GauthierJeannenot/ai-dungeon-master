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

export type WorldObjectKind = 'door' | 'container' | 'item' | 'clue' | 'fixture' | 'trap'

export interface WorldObjectState {
  id: string
  roomId: string
  name: string
  kind: WorldObjectKind
  visible: boolean
  discovered: boolean
  opened?: boolean
  locked?: boolean
  taken?: boolean
  used?: boolean
  contains?: string[]
  tags?: string[]
  dc?: {
    search?: number
    open?: number
    force?: number
    unlock?: number
  }
  description?: string
}

export type WorldNpcDisposition = 'hostile' | 'wary' | 'neutral' | 'helpful' | 'offended'

export interface WorldNpcState {
  id: string
  name: string
  roomId: string
  disposition: WorldNpcDisposition
  known?: boolean
  tags?: string[]
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
}

export interface WorldState {
  objects: Record<string, WorldObjectState>
  npcs: Record<string, WorldNpcState>
  quests: Record<string, WorldQuestState>
  alarms: Record<string, WorldAlarmState>
  flags?: Record<string, boolean>
  eventLog: EngineEvent[]
}

export interface GameState {
  phase: GamePhase
  player: PlayerState
  monsters: Record<string, MonsterState>   // serializable (no Map)
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
  | 'search'
  | 'open'
  | 'take'
  | 'unlock'
  | 'force'
  | 'talk'
  | 'threaten'
  | 'hide'
  | 'help'
  | 'flee'
  | 'stabilize'
  | 'use_object'
  | 'ability_check'
  | 'social'
  | 'use_item'
  | 'wait'
  | 'death_save'
  | 'observe'

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
  | 'room.object_discovered'
  | 'quest.item_found'
  | 'npc.disposition_changed'
  | 'door.opened'
  | 'object.opened'
  | 'object.taken'
  | 'object.used'
  | 'trap.triggered'
  | 'alarm.raised'
  | 'character.hidden'
  | 'escape.attempted'
  | 'character.stabilized'
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
}

export interface EngineResolutionView {
  events: EngineEvent[]
  affordances: PlayerAffordance[]
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

// API request/response types
export interface DMRequest {
  message: string
  // Per-client request id for correlating browser and server logs.
  clientRequestId?: string
  // Per-tab browser session used to isolate MCP game state on the server.
  sessionId?: string
  gameState?: GameState
  // Historique récent gardé verbatim (derniers N messages player/dm)
  history?: ConversationTurn[]
  // Résumé compressé des échanges plus anciens (généré par le LLM quand l'historique est trop long)
  summaryContext?: string
  // Small client-side hints for observability/cost analysis. Never contains audio.
  clientMeta?: DMClientMeta
}

export interface DMResponse {
  narrative: string
  newGameState: GameState
  toolsUsed: string[]
  engine?: EngineResolutionView
  usage?: DMTurnUsage
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
