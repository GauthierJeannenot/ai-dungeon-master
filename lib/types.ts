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

export interface GameState {
  phase: GamePhase
  player: PlayerState
  monsters: Record<string, MonsterState>   // serializable (no Map)
  initiativeOrder: string[]
  currentTurn: string | null
  round: number
  movementUsed: Record<string, number>  // grid cells spent by entity during its current turn
  combatLog: CombatLogEntry[]
  roomsVisited: string[]
  currentRoomId: string | null
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

// Un tour de conversation envoyé au LLM (player/dm uniquement — pas mechanical)
export interface ConversationTurn {
  role: 'player' | 'dm'
  content: string
}

// API request/response types
export interface DMRequest {
  message: string
  // Per-tab browser session used to isolate MCP game state on the server.
  sessionId?: string
  gameState?: GameState
  // Historique récent gardé verbatim (derniers N messages player/dm)
  history?: ConversationTurn[]
  // Résumé compressé des échanges plus anciens (généré par le LLM quand l'historique est trop long)
  summaryContext?: string
}

export interface DMResponse {
  narrative: string
  newGameState: GameState
  toolsUsed: string[]
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
