import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { loadContextFiles, loadAdventureModuleParsed } from '@/lib/context-loader'
import { callMCPTool, listMCPTools } from '@/lib/mcp-client'
import { loadSession, saveSession } from '@/lib/session-store'
import { acquireSessionLock } from '@/lib/session-lock'
import { logEvent, summarizeGameState } from '@/lib/server-logger'
import { describeRoomHooks } from '@/lib/adventure-map'
import {
  logAnthropicUsage,
  summarizeAnthropicUsage,
  type AnthropicUsage,
  type AnthropicUsageLogEntry,
} from '@/lib/anthropic-usage'
import {
  DMRequest,
  DMResponse,
  GameState,
  GamePhase,
  ConversationTurn,
  DMTurnUsage,
} from '@/lib/types'

// Route longue à cause de la boucle agentique tool-use.
export const maxDuration = 60

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

const MODEL = process.env.DM_MODEL || 'claude-sonnet-4-6'
// Modèle du classifieur d'intention (pré-passe légère). Haiku : rapide et bon marché.
const PLANNER_MODEL = process.env.DM_PLANNER_MODEL || 'claude-haiku-4-5'
// Compression d'historique : tâche simple (résumé factuel) → Haiku suffit et coûte
// ~3× moins cher que Sonnet. Surchargeable via DM_COMPRESS_MODEL.
const COMPRESS_MODEL = process.env.DM_COMPRESS_MODEL || PLANNER_MODEL
// Permet de désactiver la pré-passe d'intention (fail-safe / A-B).
const LLM_PLANNER_ENABLED = process.env.LLM_PLANNER_ENABLED !== 'false'

// Effort de réflexion du DM (paramètre GA). 'medium' = bon compromis coût/qualité :
// moins d'itérations et de préambule que 'high' (défaut API), pour une qualité de
// narration ~équivalente. Surchargeable via DM_EFFORT. On ne l'envoie QUE pour les
// modèles qui le supportent (Sonnet 4.6, Opus 4.5/4.6/4.7) ; Haiku 4.5 et Sonnet 4.5
// renverraient un 400.
type EffortLevel = 'low' | 'medium' | 'high' | 'xhigh' | 'max'
const DM_EFFORT = (process.env.DM_EFFORT || 'medium') as EffortLevel
function effortFor(model: string): { output_config?: { effort: EffortLevel } } {
  const supportsEffort = /claude-(sonnet-4-6|opus-4-(5|6|7))/.test(model)
  return supportsEffort ? { output_config: { effort: DM_EFFORT } } : {}
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

// Limite la boucle pour éviter les boucles infinies tout en laissant la place à
// plusieurs tool calls + la narration finale.
const MAX_TOOL_ITERATIONS = parsePositiveInt(process.env.LLM_MAX_CALLS_PER_REQUEST, 10)
// Plafond de sortie PAR appel API. Une narration immersive (2-4 phrases) tourne
// autour de 250-500 tokens ; un tool call est négligeable. 1024 laisse ~2× de marge
// sans gaspiller tout en bornant le coût. Pire cas par message joueur en sortie =
// MAX_TOKENS × MAX_TOOL_ITERATIONS (≈ 10k tokens, ~0,15 $ sur Sonnet 4.6) ; un tour
// typique = 1-2 appels ≈ 0,02 $. Surchargeable via LLM_MAX_TOKENS.
const MAX_TOKENS = parsePositiveInt(process.env.LLM_MAX_TOKENS, 1024)

// 'mock' permet aux tests de tourner sans appel payant. 'live' appelle l'API.
const LLM_MODE = (process.env.LLM_MODE === 'mock' ? 'mock' : 'live') as 'mock' | 'live'
const ALLOW_PAID_LLM = process.env.ALLOW_PAID_LLM !== 'false'
const LLM_PROMPT_CACHE_ENABLED = process.env.LLM_PROMPT_CACHE_ENABLED !== 'false'

// Historique récent gardé verbatim avant compression.
const HISTORY_KEEP_RECENT = parsePositiveInt(process.env.LLM_HISTORY_KEEP_RECENT, 10)
// Seuil (caractères) des anciens messages déclenchant une compression.
const HISTORY_COMPRESS_THRESHOLD_CHARS = parsePositiveInt(process.env.LLM_HISTORY_COMPRESS_THRESHOLD_CHARS, 4000)
const COMBAT_LOG_TAIL = parsePositiveInt(process.env.LLM_COMBAT_LOG_TAIL, 6)

// Tools jamais exposés au LLM. get_game_state/replace_game_state servent à la
// synchro interne ; get_entity_stats double la fiche/l'état déjà fournis ;
// add_to_log est géré côté serveur. Les retirer allège la liste d'outils (donc le
// contexte) et réduit les choix non pertinents du modèle.
const HIDDEN_FROM_LLM = new Set([
  'get_game_state',
  'replace_game_state',
  'get_entity_stats',
  'add_to_log',
])

// Exposition des tools selon la phase : inutile de présenter les outils de combat
// en exploration (et inversement). On réduit ainsi la liste envoyée à chaque appel
// et on évite les appels hors contexte. Tout tool non listé ici reste exposé
// (fail-open) pour ne jamais casser un outil ajouté plus tard côté MCP.
// NB : roll_death_save n'est PAS combat-only — un piège (ex. tiroir empoisonné
// salle 5) peut mettre le joueur à 0 PV hors combat ; il reste donc toujours exposé.
const COMBAT_ONLY_TOOLS = new Set([
  'resolve_attack',
  'resolve_player_attack',
  'run_monster_turns',
  'next_turn',
  'pass_turn',
  'end_combat',
])
const EXPLORATION_ONLY_TOOLS = new Set([
  'enter_combat',
  'start_encounter',
  'trigger_room_event',
])

// Le DM ne résout qu'UNE action de jeu majeure par message joueur. Ces tools
// déclenchent la résolution mécanique d'une action ; on en autorise un seul.
// NB : trigger_room_event N'EST PAS ici — c'est un marqueur de scène (flag + log),
// pas une action à économie de tour. Il doit pouvoir accompagner un move_token
// (« j'entre dans la salle » → move_token + trigger_room_event d'entrée).
const PRIMARY_ACTION_TOOLS = new Set([
  'resolve_attack',
  'resolve_player_attack',
  'roll_ability_check',
  'roll_death_save',
  'use_healing_potion',
  'move_token',
  'start_encounter',
])

let cachedMcpTools: Anthropic.Tool[] | null = null

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function generateRequestId(): string {
  return `dm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

// ── System prompt ────────────────────────────────────────────────────────────
// Bloc statique (règles + module) mis en cache. Bloc dynamique (état) non caché.

function buildStaticPrompt(): string {
  const ctx = loadContextFiles()
  const moduleIndex = loadAdventureModuleParsed().index

  return `Tu es un Dungeon Master expert de D&D 5e, narrateur immersif et arbitre de règles rigoureux.
Tu combines une narration cinématographique et épique avec une application stricte des règles mécaniques.

---
## FICHE DE PERSONNAGE DU JOUEUR
${ctx.playerCharacter}

---
## RÈGLES DU JOUEUR (actions, capacités de classe)
${ctx.playerRules}

---
## RÈGLES DM
${ctx.dmRules}

---
## MODULE D'AVENTURE (INDEX)
${moduleIndex}

> Ceci est l'INDEX du module (synopsis, carte, table des points d'entrée, annexes). Le **détail complet de la salle où se trouve actuellement le joueur** est injecté plus bas dans le bloc dynamique (« SALLE ACTUELLE — DÉTAIL DU MODULE »). Pour tout déplacement vers une salle non encore décrite, fie-toi à la table « Points d'entrée et de déplacement » ci-dessus.

---
## INSTRUCTIONS CRITIQUES

1. **Narration** : Narre en français, de manière immersive et cinématographique (2-4 phrases min). Utilise le présent dramatique. Tu es libre d'improviser une réponse vivante à TOUTE action du joueur, même absurde ou créative — ne refuse jamais avec une réponse générique.

2. **Mécanique obligatoire — appelle un tool, ne narre JAMAIS le résultat sans l'avoir lancé** : pour TOUT calcul ou résolution incertaine, utilise les tools MCP — n'improvise jamais un chiffre, un succès, un échec ou des dégâts. Grille de décision (situation du joueur → tool) :
   - Fouiller, observer attentivement, chercher un passage/objet caché, crocheter, forcer une porte, se faufiler, grimper, persuader, intimider, marchander, enquêter, repérer un piège → \`roll_ability_check\` (avec le DD indiqué par le module si présent).
   - Entrer dans une salle décrite par le module → \`trigger_room_event({ roomId, eventType: "enter" })\` pour activer son contenu et la marquer visitée (peut accompagner le \`move_token\` du même message).
   - Provoquer / approcher une rencontre prévue par le module → \`start_encounter\` (sinon \`spawn_monster\` + \`enter_combat\`).
   - Un PNJ caché qui se montre au joueur (offrande acceptée, jet social réussi, embuscade qui se déclenche) → \`reveal_npc\` (par \`kind\` pour révéler tout un groupe, ou par \`npcId\`) pour afficher son token. Les PNJ existent et ont un token même hors combat (ex. Mac dès le départ) ; ne narre l'apparition qu'APRÈS l'appel.
   - Subir un piège ou un effet à sauvegarde → \`resolve_saving_throw\`. Boire une potion → \`use_healing_potion\`. Attaquer → \`resolve_attack\` / \`resolve_player_attack\`.
   - **INTERDIT** : décrire l'issue (réussite, échec, dégâts, découverte, réaction d'un PNJ à un jet social, créature qui surgit) AVANT l'appel du tool. C'est le résultat du tool qui dicte ta narration, jamais l'inverse.
   - Seules les actions SANS incertitude mécanique (parler sans enjeu, contempler le décor, improviser une ruse de pure couleur) se narrent directement, sans tool.

3. **⚠️ Déplacement — RÈGLE ABSOLUE** : Dès que le joueur exprime une intention de déplacement (« je vais au verger », « entre dans la boutique », « avance vers la porte », « va en (x,y) », « retourne à l'entrée »…), tu DOIS appeler \`move_token\` AVANT toute narration.
   - **Lieu nommé** : si le joueur nomme un lieu connu du module (verger, tas de déchets, entrée/façade, bureau, quai de chargement, sol de la boulangerie, appartement…), va chercher le **Point d'entrée** de cette salle dans le MODULE D'AVENTURE (table « Points d'entrée et de déplacement », ou la ligne « Point d'entrée » de la salle) et appelle \`move_token({ tokenId: "player", toCell: { x, y } })\` vers ces coordonnées exactes.
   - **Coordonnées explicites** : si le joueur donne un (x,y), utilise-le directement.
   - **INTERDIT** : ne décris JAMAIS une arrivée, un trajet ou un changement de lieu sans avoir appelé \`move_token\` d'abord. Narrer un déplacement sans le tool call est une erreur — le pion ne bougerait pas à l'écran.
   - Un déplacement compte comme l'unique action de jeu majeure du message (voir règle 4).

4. **⚠️ RÈGLE ABSOLUE — UN ALLER-RETOUR COMPLET PAR MESSAGE** :
   - Tu résous l'action du joueur, PUIS tu joues d'un coup TOUS les tours des monstres, PUIS tu t'arrêtes et attends la prochaine action du joueur.
   - Tu ne joues JAMAIS les monstres à la main, un par un, avec des \`resolve_attack\` successifs : c'est le rôle de \`run_monster_turns\`, qui résout déplacement + attaque de chaque monstre en UN seul appel.
   - Tu n'appelles \`run_monster_turns\` qu'UNE fois par message, et seulement après avoir clos le tour du joueur (\`next_turn\` ou \`pass_turn\`).
   - Chaque message = l'action du joueur + la riposte de tous les monstres. Puis ARRÊTE-TOI.

5. **Séquence combat** (à suivre dans l'ordre) :
   - Début de combat → \`start_encounter\` (ou \`spawn_monster\` + \`enter_combat\`) → narre la mise en place.
   - Si l'initiative donne d'abord la main à un ou plusieurs monstres (currentTurn = monstre), appelle \`run_monster_turns\` UNE fois pour jouer leurs tours, PUIS rends la main au joueur. Sinon ATTENDS directement son action.
   - Tour du joueur → résous son action (\`resolve_player_attack\`, \`move_token\`, \`use_healing_potion\`…).
   - **Si cette action ne laisse plus AUCUN monstre vivant** → \`end_combat\` directement (ni \`next_turn\` ni \`run_monster_turns\`) → narre la victoire et ARRÊTE-TOI.
   - **Sinon, des monstres vivants restent** → clos le tour du joueur (\`next_turn\` s'il a agi, \`pass_turn\` s'il ne fait rien) → puis \`run_monster_turns\` UNE fois.
   - Lis le résultat de \`run_monster_turns\` : s'il renvoie \`combatShouldEnd: true\` (joueur mort ou plus de monstres) → \`end_combat\`. Sinon le tour revient au joueur.
   - Termine par UNE narration qui couvre l'action du joueur ET tous les tours des monstres (\`resolvedTurns\`), puis ARRÊTE-TOI.
   - \`run_monster_turns\` n'achève jamais un joueur déjà à terre et ignore automatiquement les créatures non hostiles (Mac le Tréant, la dryade…) ; mets dans \`holdIds\` tout monstre qui ne doit pas agir ce tour (charmé, en pourparlers).

6. **HP des monstres** : Ne révèle jamais les HP exacts. Utilise des descriptions qualitatives :
   - > 75% HP : "paraît vigoureux", "combat avec assurance"
   - 50-75% : "légèrement blessé", "esquive difficilement"
   - 25-50% : "sérieusement blessé", "en mauvaise posture"
   - < 25% : "à l'agonie", "chancelant", "vacillant"

7. **Module** : Respecte le contenu du module (positions des monstres, trésors, pièges). N'invente pas de contenu structurel, mais reste libre d'improviser des détails de couleur.

8. **Format de réponse** : Termine toujours par la narration en prose. Les résultats mécaniques sont extraits automatiquement des tool calls.`
}

// État envoyé au LLM, allégé selon la phase. On retire ce qui est déjà dans le
// prompt statique (stats/maîtrise du joueur = fiche de perso) et, hors combat, les
// champs purement combat (initiative, tours, économie d'action) ainsi que les
// collections vides — autant de bruit en moins à analyser pour le modèle.
function serializeGameState(gameState: GameState): string {
  const inCombat = gameState.phase === 'combat'
  const p = gameState.player

  const player: Record<string, unknown> = {
    id: p.id,
    name: p.name,
    class: p.class,
    level: p.level,
    hp: p.hp,
    ac: p.ac,
    position: p.position,
    conditions: p.conditions,
    speed: p.speed,
    inventory: p.inventory,
  }
  // Jets de mort uniquement quand ils comptent (joueur à terre / jets enregistrés).
  if (p.deathSaves && (p.hp.current <= 0 || p.deathSaves.successes > 0 || p.deathSaves.failures > 0)) {
    player.deathSaves = p.deathSaves
  }
  if (inCombat && p.initiative != null) {
    player.initiative = p.initiative
  }

  const aliveMonsters = Object.fromEntries(
    Object.entries(gameState.monsters).filter(([, monster]) => monster.isAlive)
  )
  const combatLogTail = gameState.combatLog.slice(-COMBAT_LOG_TAIL)

  const compact: Record<string, unknown> = {
    phase: gameState.phase,
    player,
    currentRoomId: gameState.currentRoomId,
    roomsVisited: gameState.roomsVisited,
  }
  if (gameState.encountersTriggered?.length) {
    compact.encountersTriggered = gameState.encountersTriggered
  }
  if (Object.keys(aliveMonsters).length > 0) {
    compact.monsters = aliveMonsters
  }
  // PNJ visibles de la salle courante (Mac dès le début, dryades une fois révélées).
  // Les PNJ cachés (visible:false) restent hors du contexte LLM.
  if (gameState.npcs) {
    const visibleNpcs = Object.values(gameState.npcs)
      .filter(npc => npc.visible && (npc.roomId === null || npc.roomId === gameState.currentRoomId))
      .map(npc => ({
        id: npc.id,
        name: npc.name,
        kind: npc.kind,
        position: npc.position,
        disposition: npc.disposition,
      }))
    if (visibleNpcs.length > 0) {
      compact.npcs = visibleNpcs
    }
  }
  // Champs spécifiques au combat : inutiles (et toujours vides) hors combat.
  if (inCombat) {
    compact.initiativeOrder = gameState.initiativeOrder
    compact.currentTurn = gameState.currentTurn
    compact.round = gameState.round
    compact.movementUsed = gameState.movementUsed
    compact.actionUsed = gameState.actionUsed
  }
  if (combatLogTail.length > 0) {
    compact.combatLog = combatLogTail
  }
  if (gameState.sceneMemory && Object.keys(gameState.sceneMemory).length > 0) {
    compact.sceneMemory = gameState.sceneMemory
  }
  return JSON.stringify(compact)
}

function buildDynamicPrompt(gameState: GameState, summaryContext?: string, directive?: string): string {
  const summaryBlock = summaryContext?.trim()
    ? `---\n## RÉSUMÉ DES ÉVÉNEMENTS PRÉCÉDENTS\n${summaryContext.trim()}\n\n`
    : ''
  const roomDetail = gameState.currentRoomId
    ? loadAdventureModuleParsed().rooms[gameState.currentRoomId]
    : undefined
  const roomDetailBlock = roomDetail
    ? `---\n## SALLE ACTUELLE — DÉTAIL DU MODULE\n${roomDetail}\n\n`
    : ''
  const roomHooks = describeRoomHooks(gameState.currentRoomId)
  const roomBlock = roomHooks
    ? `---\n## SALLE ACTUELLE — ACCROCHES MÉCANIQUES DISPONIBLES\n${roomHooks}\nDès que l'action du joueur correspond à l'une de ces accroches, appelle le tool indiqué (ne narre pas l'issue à la place).\n\n`
    : ''
  // #3 — La directive est placée en TOUT DERNIER (après l'état JSON) pour un effet de
  // récence maximal : c'est la dernière chose que le DM lit avant de répondre.
  const directiveBlock = directive
    ? `\n\n---\n## ⚠️ ACTION MÉCANIQUE REQUISE CE TOUR (classifieur d'intention)\n${directive}\nC'est le résultat du tool qui dicte ta narration — ne décris jamais l'issue avant l'appel.`
    : ''
  return `${summaryBlock}${roomDetailBlock}${roomBlock}---
## ÉTAT ACTUEL DU JEU
\`\`\`json
${serializeGameState(gameState)}
\`\`\`${directiveBlock}`
}

function buildSystemBlocks(gameState: GameState, summaryContext?: string, directive?: string): Anthropic.TextBlockParam[] {
  const staticBlock: Anthropic.TextBlockParam = {
    type: 'text',
    text: buildStaticPrompt(),
  }
  if (LLM_PROMPT_CACHE_ENABLED) {
    staticBlock.cache_control = { type: 'ephemeral' }
  }
  return [
    staticBlock,
    {
      type: 'text',
      text: buildDynamicPrompt(gameState, summaryContext, directive),
    },
  ]
}

function historyToMessages(history: ConversationTurn[]): Anthropic.MessageParam[] {
  return history.map(turn => ({
    role: turn.role === 'player' ? 'user' : 'assistant',
    content: turn.content,
  }))
}

// ── LLM call (mock / live) + cost tracking ──────────────────────────────────

interface LlmCallContext {
  requestId: string
  sessionId?: string
  clientRequestId?: string
  inputMode: string
  operation: string
  model?: string
  usageLog: AnthropicUsageLogEntry[]
  playerMessage?: string
  gameState?: GameState
  tools?: Anthropic.Tool[]
}

function lastUserText(messages: Anthropic.MessageParam[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]
    if (message.role !== 'user') continue
    if (typeof message.content === 'string') return message.content
  }
  return ''
}

function mockMessage(content: Anthropic.ContentBlock[], stopReason: Anthropic.Message['stop_reason']): Anthropic.Message {
  return {
    id: `msg_mock_${Math.random().toString(36).slice(2, 10)}`,
    type: 'message',
    role: 'assistant',
    model: MODEL,
    content,
    stop_reason: stopReason,
    stop_sequence: null,
    container: null,
    stop_details: null,
    usage: {
      input_tokens: 0,
      output_tokens: 0,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    } as Anthropic.Usage,
  }
}

function mockTextMessage(text: string): Anthropic.Message {
  return mockMessage([{ type: 'text', text, citations: null } as Anthropic.TextBlock], 'end_turn')
}

function mockToolMessage(name: string, input: Record<string, unknown>): Anthropic.Message {
  return mockMessage(
    [{ type: 'tool_use', id: `toolu_mock_${Math.random().toString(36).slice(2, 10)}`, name, input } as Anthropic.ToolUseBlock],
    'tool_use'
  )
}

function toolAvailable(name: string, tools?: Anthropic.Tool[]): boolean {
  return Boolean(tools?.some(tool => tool.name === name))
}

function firstAliveMonsterId(gameState: GameState): string | null {
  const entry = Object.entries(gameState.monsters).find(([, monster]) => monster.isAlive)
  return entry ? entry[0] : null
}

// Mock déterministe pour les tests : pilote les tools classiques.
function createMockLlmMessage(params: Anthropic.MessageCreateParamsNonStreaming, context: LlmCallContext): Anthropic.Message {
  if (context.operation === 'history.compress') {
    return mockTextMessage('Résumé mock: les échanges précédents sont conservés sous forme condensée pour les tests.')
  }

  // Le classifieur d'intention est un no-op déterministe en mock : aucune directive,
  // le DM mock garde son comportement habituel.
  if (context.operation === 'dm.plan') {
    return mockToolMessage('decide_action', {
      requiresMechanic: false,
      confidence: 'low',
      reason: 'mock planner: no-op',
    })
  }

  const text = (context.playerMessage || lastUserText(params.messages)).toLowerCase()
  const gameState = context.gameState
  if (!gameState) return mockTextMessage('Le Dungeon Master observe la situation.')

  // Tour d'un monstre : on résout d'un coup tous les tours non-joueur via run_monster_turns.
  if (gameState.phase === 'combat' && gameState.currentTurn && gameState.currentTurn !== 'player') {
    if (toolAvailable('run_monster_turns', context.tools) && Object.values(gameState.monsters).some(monster => monster.isAlive)) {
      return mockToolMessage('run_monster_turns', {})
    }
    return mockTextMessage("Les adversaires agissent avant que tu puisses reprendre l'initiative.")
  }

  const coordinateMatch = text.match(/\(?\s*(\d{1,2})\s*[,;]\s*(\d{1,2})\s*\)?/)
  const movementVerb = /va|vais|avance|bouge|déplace|deplace|marche|case|aller/.test(text)
  if (coordinateMatch && movementVerb && toolAvailable('move_token', context.tools)) {
    return mockToolMessage('move_token', {
      tokenId: 'player',
      toCell: { x: Number(coordinateMatch[1]), y: Number(coordinateMatch[2]) },
    })
  }

  if (
    gameState.phase === 'combat' &&
    gameState.currentTurn === 'player' &&
    /attaque|attque|frappe|tape|coup|charge/.test(text) &&
    toolAvailable('resolve_attack', context.tools)
  ) {
    const targetId = firstAliveMonsterId(gameState)
    if (targetId) {
      return mockToolMessage('resolve_attack', {
        attackerId: 'player',
        targetId,
        weaponOrSpell: 'longsword',
      })
    }
  }

  if (/passe|attend|attends|patient|ne fais rien/.test(text) && toolAvailable('pass_turn', context.tools)) {
    return mockToolMessage('pass_turn', { reason: 'Le joueur attend.' })
  }

  return mockTextMessage('La scène progresse; quelque chose dans le décor répond à ton geste.')
}

function recordUsage(message: Anthropic.Message, context: LlmCallContext, stopReason?: string | null): void {
  const usage = (message.usage ?? {}) as AnthropicUsage
  const entry = logAnthropicUsage({
    requestId: context.requestId,
    sessionId: context.sessionId,
    inputMode: context.inputMode,
    clientRequestId: context.clientRequestId,
    operation: context.operation,
    model: context.model ?? MODEL,
    usage,
    stopReason: stopReason ?? message.stop_reason,
  })
  context.usageLog.push(entry)
}

async function createLlmMessage(
  params: Anthropic.MessageCreateParamsNonStreaming,
  context: LlmCallContext
): Promise<Anthropic.Message> {
  logEvent('info', 'llm.call.start', {
    requestId: context.requestId,
    sessionId: context.sessionId,
    operation: context.operation,
    mode: LLM_MODE,
  })

  if (LLM_MODE === 'mock') {
    const message = createMockLlmMessage(params, context)
    recordUsage(message, context)
    return message
  }

  if (!ALLOW_PAID_LLM) {
    throw new Error('Appels LLM payants désactivés (ALLOW_PAID_LLM=false). Utilise LLM_MODE=mock.')
  }

  const message = await anthropic.messages.create(params)
  recordUsage(message, context)
  return message
}

// ── MCP tools ────────────────────────────────────────────────────────────────

async function getMcpTools(sessionId: string | undefined): Promise<Anthropic.Tool[]> {
  if (cachedMcpTools) return cachedMcpTools
  const raw = await listMCPTools(sessionId)
  cachedMcpTools = raw
    .filter(tool => !HIDDEN_FROM_LLM.has(tool.name))
    .map(tool => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.inputSchema as Anthropic.Tool['input_schema'],
    }))
  logEvent('info', 'dm.mcp_tools.loaded', {
    sessionId,
    exposedToolNames: cachedMcpTools.map(tool => tool.name),
  })
  return cachedMcpTools
}

// Filtre la liste exposée selon la phase. Calculé une fois par requête (sur la
// phase de départ) pour rester stable pendant toute la boucle agentique et ne pas
// invalider le cache de prompt en cours de requête.
function selectToolsForPhase(tools: Anthropic.Tool[], phase: GamePhase): Anthropic.Tool[] {
  const inCombat = phase === 'combat'
  return tools.filter(tool => {
    if (COMBAT_ONLY_TOOLS.has(tool.name)) return inCombat
    if (EXPLORATION_ONLY_TOOLS.has(tool.name)) return !inCombat
    return true
  })
}

// ── Classifieur d'intention (pré-passe « soft ») ─────────────────────────────
// Un appel LLM léger (Haiku) en amont du DM. Il ne narre pas : il décide via un
// unique méta-tool forcé (decide_action) si le message du joueur exige une
// résolution mécanique, laquelle, et avec quels indices. Le résultat est injecté
// comme directive obligatoire dans le prompt du DM — c'est toujours le modèle DM
// qui exécute le tool (aucune exécution déterministe côté serveur).
// Le champ `tool` est contraint à un enum des tools réellement exposés cette phase :
// Haiku ne peut plus halluciner un nom de tool inexistant.
function buildDecideActionTool(toolNames: string[]): Anthropic.Tool {
  const toolProp: Record<string, unknown> = {
    type: 'string',
    description: "Nom exact du tool MCP à appeler (omets si requiresMechanic=false).",
  }
  if (toolNames.length > 0) toolProp.enum = toolNames
  return {
    name: 'decide_action',
    description: "Déclare l'unique action mécanique requise par le message du joueur (ou aucune).",
    input_schema: {
      type: 'object',
      properties: {
        requiresMechanic: { type: 'boolean', description: 'true si une résolution mécanique (jet/règle) est requise.' },
        tool: toolProp,
        ability: { type: 'string', enum: ['str', 'dex', 'con', 'int', 'wis', 'cha'], description: 'Caractéristique pour un roll_ability_check / resolve_saving_throw.' },
        dc: { type: 'number', description: "Degré de Difficulté si connu (DD de l'accroche de salle)." },
        target: { type: 'string', description: "Cible ou objet visé (id de monstre, nom d'objet…)." },
        sceneMarkers: { type: 'array', items: { type: 'string' }, description: 'Marqueurs de scène à poser en plus (ex: "reveal_npc:dryad", "trigger_room_event:enter").' },
        confidence: { type: 'string', enum: ['low', 'medium', 'high'], description: 'Confiance dans la classification.' },
        reason: { type: 'string', description: 'Justification courte (1 phrase).' },
      },
      required: ['requiresMechanic', 'confidence', 'reason'],
    },
  }
}

interface PlannerDecision {
  requiresMechanic: boolean
  tool: string
  ability?: string
  dc?: number
  target?: string
  sceneMarkers: string[]
  confidence: 'low' | 'medium' | 'high'
  reason: string
}

async function planPlayerAction(
  playerMessage: string,
  gameState: GameState,
  tools: Anthropic.Tool[],
  recentMessages: Anthropic.MessageParam[],
  summaryContext: string | undefined,
  context: LlmCallContext,
): Promise<PlannerDecision | null> {
  if (gameState.phase === 'combat' && gameState.currentTurn && gameState.currentTurn !== 'player') {
    return null
  }
  const roomHooks = describeRoomHooks(gameState.currentRoomId)
  const toolList = tools.map(tool => `- ${tool.name}: ${tool.description ?? ''}`).join('\n')
  const phaseLine = gameState.phase === 'combat' ? 'COMBAT (tour du joueur)' : 'EXPLORATION'
  const summaryBlock = summaryContext?.trim()
    ? `\nRésumé de la partie (contexte) :\n${summaryContext.trim()}\n`
    : ''
  const system = `Tu es un classifieur d'intention pour un Maître du Jeu D&D 5e. Tu NE narres jamais. Ton unique rôle : analyser le message du joueur et décider s'il exige une résolution mécanique (un tool), laquelle, puis appeler decide_action.

Phase: ${phaseLine}
${roomHooks ? `\nAccroches mécaniques de la salle actuelle:\n${roomHooks}\n` : ''}${summaryBlock}
Tools mécaniques disponibles (le champ \`tool\` doit être EXACTEMENT l'un de ces noms) :
${toolList}

Règles de décision:
- requiresMechanic=true dès que l'issue est INCERTAINE et dépend d'un jet ou d'une règle : fouiller, observer/chercher un caché, crocheter, forcer, se faufiler, grimper, persuader, intimider, marchander, enquêter, attaquer, subir un piège/sauvegarde, boire une potion, déclencher/approcher une rencontre. Choisis alors le tool exact (\`tool\`).
- Pour un jet de caractéristique, renseigne \`ability\` et \`dc\` (reprends le DD de l'accroche si présent).
- requiresMechanic=false UNIQUEMENT pour la pure couleur sans enjeu : dialogue anodin, contemplation, question, déplacement déjà couvert par move_token mais sans incertitude.
- \`sceneMarkers\` : ajoute les marqueurs utiles EN PLUS de l'action (ex "reveal_npc:dryad" quand des PNJ cachés se montrent suite à une offrande/jet réussi, "trigger_room_event:enter" à l'entrée d'une salle décrite).
- \`confidence\` : high = intention et tool sans ambiguïté ; medium = probable mais le message reste vague ; low = tu n'es pas sûr qu'une mécanique s'applique.
- Sers-toi du contexte récent et du résumé pour lever les ambiguïtés (un "je leur parle" devient une persuasion si la scène l'exige).
- Dans le doute sur l'incertitude, préfère requiresMechanic=true.

Exemples (message → décision) :
- "je fouille la bibliothèque" → requiresMechanic=true, tool=roll_ability_check, ability=wis, dc≈13, confidence=high.
- "je crochète la serrure du coffre" → requiresMechanic=true, tool=roll_ability_check, ability=dex, dc≈15, confidence=high.
- "je dépose une offrande au pied des arbres" → requiresMechanic=true, tool=roll_ability_check, ability=cha, sceneMarkers=["reveal_npc:dryad"], confidence=medium.
- "j'attaque le gobelin" → requiresMechanic=true, tool=resolve_player_attack, target="gobelin", confidence=high.
- "j'entre dans la salle suivante" → requiresMechanic=true, tool=move_token, sceneMarkers=["trigger_room_event:enter"], confidence=high.
- "je lève les yeux vers le plafond / qui es-tu ?" → requiresMechanic=false, confidence=high.`
  const recentText = recentMessages
    .slice(-4)
    .map(m => `${m.role === 'user' ? 'Joueur' : 'MJ'}: ${typeof m.content === 'string' ? m.content : '[action]'}`)
    .join('\n')
  const userContent = recentText
    ? `Contexte récent :\n${recentText}\n\nDERNIER message du joueur à classer :\n${playerMessage}`
    : playerMessage
  const response = await createLlmMessage(
    {
      model: PLANNER_MODEL,
      max_tokens: 400,
      system,
      messages: [{ role: 'user', content: userContent }],
      tools: [buildDecideActionTool(tools.map(tool => tool.name))],
      tool_choice: { type: 'tool', name: 'decide_action' },
    },
    { ...context, operation: 'dm.plan', model: PLANNER_MODEL },
  )
  const block = response.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use' && b.name === 'decide_action'
  )
  if (!block || !isObjectRecord(block.input)) return null
  const input = block.input
  const confidence = input.confidence === 'high' || input.confidence === 'medium' ? input.confidence : 'low'
  const sceneMarkers = Array.isArray(input.sceneMarkers)
    ? input.sceneMarkers.filter((m): m is string => typeof m === 'string')
    : []
  return {
    requiresMechanic: Boolean(input.requiresMechanic),
    tool: typeof input.tool === 'string' ? input.tool : '',
    ability: typeof input.ability === 'string' && input.ability ? input.ability : undefined,
    dc: typeof input.dc === 'number' && Number.isFinite(input.dc) && input.dc > 0 ? input.dc : undefined,
    target: typeof input.target === 'string' && input.target ? input.target : undefined,
    sceneMarkers,
    confidence,
    reason: typeof input.reason === 'string' ? input.reason : '',
  }
}

// Transforme la décision du classifieur en directive injectable. Conservatrice :
// pas de directive si pas de mécanique requise, si confiance faible, ou si le tool
// proposé n'est pas réellement exposé pour cette phase (fail-open vers le DM seul).
function buildDirective(
  decision: PlannerDecision | null,
  availableToolNames: Set<string>,
): { text: string; tool: string; force: 'tool' | 'any' } | null {
  if (!decision || !decision.requiresMechanic) return null
  if (decision.confidence === 'low') return null
  if (!decision.tool || !availableToolNames.has(decision.tool)) return null
  const hints: string[] = []
  if (decision.ability) hints.push(`ability="${decision.ability}"`)
  if (decision.dc) hints.push(`dc=${decision.dc}`)
  if (decision.target) hints.push(`cible="${decision.target}"`)
  const hintStr = hints.length ? ` (${hints.join(', ')})` : ''
  // Les marqueurs de scène ne sont PLUS délégués au DM ici : le serveur les exécute
  // lui-même (executeSceneMarkers). La directive ne porte que sur l'action mécanique.
  // confidence=high → on force EXACTEMENT ce tool ; medium → on force « au moins un tool »
  // et on laisse le DM choisir (le message reste un peu ambigu).
  const force: 'tool' | 'any' = decision.confidence === 'high' ? 'tool' : 'any'
  return { text: `Appelle le tool \`${decision.tool}\`${hintStr} AVANT toute narration.`, tool: decision.tool, force }
}

// ── Hybride : exécution déterministe des marqueurs de scène ───────────────────
// Pour les beats à effet de bord sûr (révéler des PNJ, activer/marquer une salle),
// le serveur appelle le tool MCP lui-même dès que le classifieur est confiant, au
// lieu de l'espérer du DM. Les jets et le combat restent « soft » (directive seule).
const SCENE_MARKER_TOOLS = new Set(['reveal_npc', 'trigger_room_event'])
const ROOM_EVENT_TYPES = new Set(['enter', 'trap', 'discovery', 'ambush', 'puzzle', 'treasure', 'exit', 'custom'])

interface SceneMarkerCall {
  tool: string
  input: Record<string, unknown>
  label: string
}

// Transforme les marqueurs « tool:valeur » du classifieur en appels MCP concrets.
function parseSceneMarkers(decision: PlannerDecision | null, gameState: GameState): SceneMarkerCall[] {
  if (!decision || decision.sceneMarkers.length === 0) return []
  const calls: SceneMarkerCall[] = []
  const seen = new Set<string>()
  for (const raw of decision.sceneMarkers) {
    const idx = raw.indexOf(':')
    const tool = (idx >= 0 ? raw.slice(0, idx) : raw).trim()
    const value = (idx >= 0 ? raw.slice(idx + 1) : '').trim()
    if (!SCENE_MARKER_TOOLS.has(tool)) continue
    const key = `${tool}:${value}`
    if (seen.has(key)) continue
    if (tool === 'reveal_npc') {
      if (!value) continue
      seen.add(key)
      calls.push({
        tool,
        input: { kind: value, reason: "classifieur d'intention : marqueur de scène" },
        label: `reveal_npc(${value})`,
      })
    } else if (tool === 'trigger_room_event') {
      const eventType = value || 'enter'
      if (!ROOM_EVENT_TYPES.has(eventType)) continue
      if (!gameState.currentRoomId) continue
      seen.add(key)
      calls.push({
        tool,
        input: { roomId: gameState.currentRoomId, eventType },
        label: `trigger_room_event(${eventType})`,
      })
    }
  }
  return calls
}

// Exécute les marqueurs côté serveur. On respecte le gating de phase (un marqueur
// dont le tool n'est pas exposé cette phase n'est pas tiré) et on encaisse chaque
// erreur sans interrompre le tour (effets de bord non critiques).
async function executeSceneMarkers(
  calls: SceneMarkerCall[],
  availableToolNames: Set<string>,
  gameState: GameState,
  sessionId: string | undefined,
  meta: { requestId: string },
): Promise<{ executed: string[]; newState: GameState }> {
  let state = gameState
  const executed: string[] = []
  for (const call of calls) {
    if (!availableToolNames.has(call.tool)) continue
    try {
      await callMCPTool(call.tool, call.input, sessionId)
      executed.push(call.label)
      try {
        state = await callMCPTool('get_game_state', {}, sessionId) as GameState
      } catch {
        // garde l'état précédent
      }
      logEvent('info', 'dm.plan.scene_marker.ok', { requestId: meta.requestId, sessionId, tool: call.tool, input: call.input })
    } catch (err) {
      logEvent('warn', 'dm.plan.scene_marker.error', {
        requestId: meta.requestId,
        sessionId,
        tool: call.tool,
        err: err instanceof Error ? err.message : String(err),
      })
    }
  }
  return { executed, newState: state }
}

function buildSceneNote(executed: string[]): string {
  return `Éléments de scène déjà posés ce tour par le système (ne rappelle PAS ces tools, narre-les comme acquis) : ${executed.join(', ')}.`
}

// ── Historique : compression des anciens échanges ────────────────────────────

async function compressHistory(
  oldTurns: ConversationTurn[],
  existingSummary: string | undefined,
  context: LlmCallContext
): Promise<string> {
  const transcript = oldTurns.map(turn => `${turn.role === 'player' ? 'Joueur' : 'MJ'}: ${turn.content}`).join('\n')
  const prompt = `Résume en un court paragraphe (français) les événements clés de cette partie de D&D, en conservant les faits importants (lieux visités, PNJ rencontrés, objets obtenus, quêtes en cours, conséquences). Sois factuel et concis.

${existingSummary ? `Résumé existant:\n${existingSummary}\n\n` : ''}Échanges à intégrer:\n${transcript}`

  const message = await createLlmMessage(
    {
      model: COMPRESS_MODEL,
      max_tokens: 300,
      messages: [{ role: 'user', content: prompt }],
    },
    { ...context, operation: 'history.compress', model: COMPRESS_MODEL }
  )

  const summary = message.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map(block => block.text)
    .join('\n')
    .trim()

  return summary || existingSummary || ''
}

interface ProcessedHistory {
  messages: Anthropic.MessageParam[]
  summaryContext?: string
  compressed: boolean
}

async function processHistory(
  history: ConversationTurn[],
  summaryContext: string | undefined,
  context: LlmCallContext
): Promise<ProcessedHistory> {
  if (history.length <= HISTORY_KEEP_RECENT) {
    return { messages: historyToMessages(history), summaryContext, compressed: false }
  }

  const oldTurns = history.slice(0, history.length - HISTORY_KEEP_RECENT)
  const recent = history.slice(-HISTORY_KEEP_RECENT)
  const oldChars = oldTurns.reduce((sum, turn) => sum + turn.content.length, 0)

  if (oldChars < HISTORY_COMPRESS_THRESHOLD_CHARS) {
    return { messages: historyToMessages(history), summaryContext, compressed: false }
  }

  const newSummary = await compressHistory(oldTurns, summaryContext, context)
  return { messages: historyToMessages(recent), summaryContext: newSummary, compressed: true }
}

// ── State sync helpers ───────────────────────────────────────────────────────

async function syncGameStateToMcp(gameState: GameState | undefined, sessionId: string | undefined): Promise<GameState | undefined> {
  if (gameState) {
    try {
      return await callMCPTool('replace_game_state', { gameState }, sessionId) as GameState
    } catch (err) {
      logEvent('warn', 'dm.state.replace_failed', { sessionId, err: err instanceof Error ? err.message : String(err) })
    }
  }
  try {
    return await callMCPTool('get_game_state', {}, sessionId) as GameState
  } catch {
    return gameState
  }
}

// ── POST handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
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

  const releaseLock = await acquireSessionLock(sessionId)
  const usageLog: AnthropicUsageLogEntry[] = []

  try {
    const storedSession = await loadSession(sessionId)
    let currentGameState = body.gameState ?? storedSession?.gameState
    const history = body.history ?? storedSession?.history ?? []
    let summaryContext = body.summaryContext ?? storedSession?.summaryContext

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

    // Synchronise l'état côté serveur MCP (ou récupère l'état initial).
    const synced = await syncGameStateToMcp(currentGameState, sessionId)
    if (!synced) {
      return NextResponse.json({ error: 'Serveur MCP non disponible.' }, { status: 503 })
    }
    currentGameState = synced

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

    const processedHistory = await processHistory(history, summaryContext, baseContext)
    summaryContext = processedHistory.summaryContext

    const allMcpTools = await getMcpTools(sessionId)
    const mcpTools = selectToolsForPhase(allMcpTools, currentGameState.phase)
    baseContext.tools = mcpTools
    logEvent('info', 'dm.mcp_tools.selected', {
      requestId,
      sessionId,
      phase: currentGameState.phase,
      toolNames: mcpTools.map(tool => tool.name),
    })

    // Pré-passe d'intention : un classifieur léger (Haiku) décide ce que le message
    // exige mécaniquement. HYBRIDE : le serveur EXÉCUTE lui-même les marqueurs de
    // scène sûrs (reveal_npc / trigger_room_event) — le DM ne peut plus les oublier.
    // Les jets et le combat restent « soft » : une directive obligatoire est injectée
    // mais c'est le DM qui appelle le tool. En cas d'erreur, on continue sans rien
    // (le DM reste seul maître à bord).
    let plannerDirective: string | null = null
    let plannedTool: string | null = null
    let plannedForce: 'tool' | 'any' | null = null
    let sceneNote: string | null = null
    if (LLM_PLANNER_ENABLED) {
      try {
        const decision = await planPlayerAction(message, currentGameState, mcpTools, processedHistory.messages, summaryContext, baseContext)
        const availableToolNames = new Set(mcpTools.map(tool => tool.name))

        // Exécution déterministe des marqueurs, seulement si le classifieur est sûr
        // (medium/high) : éviter de révéler des PNJ prématurément sur une lecture floue.
        let executedMarkers: string[] = []
        if (decision && decision.confidence !== 'low') {
          const markerCalls = parseSceneMarkers(decision, currentGameState)
          const sceneResult = await executeSceneMarkers(markerCalls, availableToolNames, currentGameState, sessionId, { requestId })
          executedMarkers = sceneResult.executed
          currentGameState = sceneResult.newState
        }
        if (executedMarkers.length > 0) {
          sceneNote = buildSceneNote(executedMarkers)
        }

        const directive = buildDirective(decision, availableToolNames)
        if (directive) {
          plannerDirective = directive.text
          plannedTool = directive.tool
          plannedForce = directive.force
        }
        logEvent('info', 'dm.plan.done', {
          requestId,
          sessionId,
          decision,
          directiveApplied: Boolean(directive),
          force: plannedForce,
          executedMarkers,
        })
      } catch (err) {
        logEvent('warn', 'dm.plan.error', { requestId, sessionId, err: err instanceof Error ? err.message : String(err) })
      }
    }

    const messages: Anthropic.MessageParam[] = [
      ...processedHistory.messages,
      { role: 'user', content: message },
    ]

    const toolsUsed: string[] = []
    let narrative = ''
    let iterations = 0
    let primaryActionToolUsed: string | null = null
    let sawMcpToolError = false
    // La directive du classifieur reste active jusqu'à ce que le tool planifié soit
    // appelé : on la retire ensuite pour ne pas pousser à le rappeler (et déclencher
    // PRIMARY_ACTION_ALREADY_RESOLVED) au tour suivant de la boucle.
    let plannedToolSatisfied = false

    while (iterations < MAX_TOOL_ITERATIONS) {
      iterations++

      // L'état peut avoir changé après un tool call : on reconstruit le contexte.
      baseContext.gameState = currentGameState

      // La directive mécanique tombe une fois son tool appelé ; la note de scène
      // (marqueurs déjà exécutés par le serveur) persiste pour guider la narration.
      const directiveParts = [plannedToolSatisfied ? null : plannerDirective, sceneNote]
        .filter((part): part is string => Boolean(part))
      const activeDirective = directiveParts.length > 0 ? directiveParts.join('\n') : undefined
      // #1 — Tant que le tool planifié n'a pas été appelé, on force le DM à passer par
      // un tool (impossible de narrer l'issue en sautant la mécanique). high → on force
      // EXACTEMENT le tool ; medium → on force « au moins un tool » et le DM choisit.
      // Dès qu'un tool a réussi, on repasse en `auto` (narration libre). En cas d'erreur
      // de tool, plannedToolSatisfied reste false → l'itération suivante reforce (retry
      // borné par MAX_TOOL_ITERATIONS).
      let toolChoice: Anthropic.MessageCreateParamsNonStreaming['tool_choice']
      if (!plannedToolSatisfied && plannedForce && mcpTools.length > 0) {
        toolChoice = plannedForce === 'tool' && plannedTool
          ? { type: 'tool', name: plannedTool, disable_parallel_tool_use: true }
          : { type: 'any', disable_parallel_tool_use: true }
      }
      const response = await createLlmMessage(
        {
          model: MODEL,
          max_tokens: MAX_TOKENS,
          ...effortFor(MODEL),
          system: buildSystemBlocks(currentGameState, summaryContext, activeDirective),
          tools: mcpTools.length > 0 ? mcpTools : undefined,
          ...(toolChoice ? { tool_choice: toolChoice } : {}),
          messages,
        },
        baseContext
      )

      for (const block of response.content) {
        if (block.type === 'text' && block.text.trim()) {
          narrative += (narrative ? '\n\n' : '') + block.text
        }
      }

      if (response.stop_reason !== 'tool_use') break

      const toolUseBlocks = response.content.filter(
        (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
      )
      if (toolUseBlocks.length === 0) break

      messages.push({ role: 'assistant', content: response.content })
      const toolResults: Anthropic.ToolResultBlockParam[] = []

      for (const toolUse of toolUseBlocks) {
        // Garde-fou "une action de jeu majeure par message" : il n'a de sens qu'en
        // EXPLORATION. En COMBAT, c'est déjà le moteur MCP qui borne tout (économie
        // d'action par tour via actionUsed/movementUsed, jets/attaques limités au tour
        // de l'acteur, action requise avant next_turn). Un même message joueur doit
        // donc pouvoir dérouler un round complet : joueur → next_turn → monstre →
        // next_turn. On désactive donc le garde-fou tant que la phase est "combat".
        const inCombat = currentGameState.phase === 'combat'
        if (PRIMARY_ACTION_TOOLS.has(toolUse.name) && primaryActionToolUsed && !inCombat) {
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
          const input = isObjectRecord(toolUse.input) ? toolUse.input : {}
          const result = await callMCPTool(toolUse.name, input, sessionId)
          // On ne comptabilise l'action « primaire » qu'en exploration : une action
          // résolue en combat ne doit pas bloquer une action d'exploration menée
          // après un end_combat survenu dans le même message joueur.
          if (PRIMARY_ACTION_TOOLS.has(toolUse.name) && !inCombat) {
            primaryActionToolUsed = toolUse.name
          }
          // Sous tool_choice forcé (surtout `any`), c'est le DM qui choisit le tool :
          // on considère la directive satisfaite dès qu'UN tool a réussi, et on relâche
          // le forçage (sinon on rebouclerait à forcer un tool au tour suivant).
          if (plannerDirective) {
            plannedToolSatisfied = true
          }
          // Rafraîchit l'état courant après une mutation.
          try {
            currentGameState = await callMCPTool('get_game_state', {}, sessionId) as GameState
          } catch {
            // garde l'état précédent
          }
          logEvent('info', 'dm.tool_use.ok', { requestId, sessionId, toolName: toolUse.name })
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: JSON.stringify(result),
          })
        } catch (err) {
          sawMcpToolError = true
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
    }

    // Dernière tentative de narration si la boucle s'est arrêtée sans prose.
    if (!narrative.trim()) {
      const finalResponse = await createLlmMessage(
        {
          model: MODEL,
          max_tokens: MAX_TOKENS,
          ...effortFor(MODEL),
          system: [
            {
              type: 'text',
              text: buildStaticPrompt() + '\n\nRéponds maintenant UNIQUEMENT avec la narration en prose, sans appeler de tools.',
            },
            { type: 'text', text: buildDynamicPrompt(currentGameState, summaryContext) },
          ],
          messages: [{ role: 'user', content: message }],
        },
        { ...baseContext, operation: 'dm.final_narration' }
      )
      for (const block of finalResponse.content) {
        if (block.type === 'text') narrative += block.text
      }
    }

    // Récupère l'état final faisant autorité.
    try {
      currentGameState = await callMCPTool('get_game_state', {}, sessionId) as GameState
    } catch {
      // garde l'état courant
    }

    const newHistory: ConversationTurn[] = [
      ...history,
      { role: 'player', content: message },
      { role: 'dm', content: narrative },
    ]

    await saveSession(sessionId, {
      gameState: currentGameState,
      history: newHistory,
      summaryContext,
    })

    const usage: DMTurnUsage = {
      llm: summarizeAnthropicUsage(usageLog),
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
      ...(processedHistory.compressed && summaryContext ? { summaryContext } : {}),
    }

    return NextResponse.json(dmResponse)
  } catch (err) {
    logEvent('error', 'dm.request.error', {
      requestId,
      sessionId,
      err: err instanceof Error ? err.message : String(err),
    })
    const errorMessage = err instanceof Error ? err.message : 'Erreur interne du serveur'
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  } finally {
    await releaseLock()
  }
}
