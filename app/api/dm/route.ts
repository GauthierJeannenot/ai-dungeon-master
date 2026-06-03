import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import crypto from 'crypto'
import fs from 'fs/promises'
import path from 'path'
import { loadContextFiles } from '@/lib/context-loader'
import { callMCPTool, listMCPTools } from '@/lib/mcp-client'
import { loadSession, saveSession } from '@/lib/session-store'
import { acquireSessionLock } from '@/lib/session-lock'
import { ADVENTURE_ROOMS, inferAdventureRoomId as inferMappedAdventureRoomId } from '@/lib/adventure-map'
import { DMRequest, DMResponse, GameState, ConversationTurn, CombatLogEntry, MonsterState } from '@/lib/types'
import {
  logAnthropicUsage,
  logAnthropicUsageSummary,
  type AnthropicUsageLogEntry,
} from '@/lib/anthropic-usage'
import { logEvent, summarizeGameState } from '@/lib/server-logger'

export const maxDuration = 60

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

const MODEL = 'claude-haiku-4-5'
const MAX_TOOL_ITERATIONS = 3
const MAX_TOKENS = 400
const FINAL_NARRATION_MAX_TOKENS = parsePositiveInt(process.env.LLM_FINAL_NARRATION_MAX_TOKENS, 180)
const ORAL_NARRATION_MAX_SENTENCES = parsePositiveInt(process.env.ORAL_NARRATION_MAX_SENTENCES, 5)
const COMBAT_LOG_TAIL = 6
const MAX_AUTO_NPC_TURNS = 8
type LlmMode = 'live' | 'mock' | 'record' | 'replay'
const INTERNAL_MCP_TOOLS = new Set(['replace_game_state', 'get_game_state', 'next_turn', 'update_hp', 'add_to_log', 'enter_combat', 'resolve_attack'])
const LLM_MODE = parseLlmMode(process.env.LLM_MODE)
const ALLOW_PAID_LLM = process.env.ALLOW_PAID_LLM !== 'false'
const LLM_REPLAY_FALLBACK_TO_MOCK = process.env.LLM_REPLAY_FALLBACK_TO_MOCK === 'true'
const LLM_CASSETTE_DIR = process.env.LLM_CASSETTE_DIR || path.join(process.cwd(), '.data', 'llm-cassettes')
const LLM_MAX_CALLS_PER_REQUEST = parsePositiveInt(process.env.LLM_MAX_CALLS_PER_REQUEST, 10)
const LLM_MAX_CALLS_PER_SESSION = parsePositiveInt(process.env.LLM_MAX_CALLS_PER_SESSION, 0)

// Nombre de messages récents conservés verbatim avant compression.
// Au-delà, les plus anciens sont résumés en un paragraphe.
const HISTORY_KEEP_RECENT = 10  // 5 tours de jeu (player + dm par tour)
// Seuil en caractères déclenchant la compression des messages "old"
// (~4 chars = 1 token → 6000 chars ≈ 1500 tokens)
const HISTORY_COMPRESS_THRESHOLD_CHARS = 6000
const MODULE_CONTEXT_MAX_CHARS = parsePositiveInt(process.env.LLM_MODULE_CONTEXT_MAX_CHARS, 6500)

// ── Cache des tools MCP ───────────────────────────────────────────────────────
let cachedMcpTools: Anthropic.Tool[] | null = null
const sessionLlmCalls = new Map<string, number>()

type LlmOperation =
  | 'history.compress'
  | 'dm.iteration'
  | 'dm.final_narration'
  | 'dm.final_narration_fallback'

type MessageCreateParams = Anthropic.MessageCreateParamsNonStreaming

interface LlmCallContext {
  requestId: string
  sessionId?: string
  operation: LlmOperation
  requestCallCount: number
  gameState?: GameState
  playerMessage?: string
  newCombatLogEntries?: CombatLogEntry[]
  tools?: Anthropic.Tool[]
}

function parseLlmMode(value: string | undefined): LlmMode {
  const mode = (value ?? 'live').toLowerCase()
  if (mode === 'live' || mode === 'mock' || mode === 'record' || mode === 'replay') {
    return mode
  }
  throw new Error(`LLM_MODE invalide: ${value}. Valeurs attendues: live, mock, record, replay.`)
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback
}

function normalizeBudgetSessionId(sessionId: string | undefined): string {
  const normalized = sessionId?.trim().replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128)
  return normalized || 'default'
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`

  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, child]) => `${JSON.stringify(key)}:${stableStringify(child)}`)
  return `{${entries.join(',')}}`
}

function cassetteKey(operation: LlmOperation, params: MessageCreateParams): string {
  return crypto
    .createHash('sha256')
    .update(stableStringify({ operation, params }))
    .digest('hex')
}

function lastUserText(messages: MessageCreateParams['messages']): string {
  const last = [...messages].reverse().find(message => message.role === 'user')
  if (!last) return ''
  if (typeof last.content === 'string') return last.content
  return last.content
    .map(block => 'text' in block && typeof block.text === 'string' ? block.text : '')
    .filter(Boolean)
    .join('\n')
}

function toolAvailable(name: string, tools: Anthropic.Tool[] | undefined): boolean {
  return Boolean(tools?.some(tool => tool.name === name))
}

function mockUsage() {
  return {
    input_tokens: 0,
    output_tokens: 0,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
  }
}

function mockTextMessage(text: string): Anthropic.Message {
  return {
    id: `msg_mock_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    type: 'message',
    role: 'assistant',
    model: MODEL,
    content: [{ type: 'text', text }],
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: mockUsage(),
  } as Anthropic.Message
}

function mockToolMessage(name: string, input: Record<string, unknown>): Anthropic.Message {
  return {
    id: `msg_mock_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    type: 'message',
    role: 'assistant',
    model: MODEL,
    content: [{
      type: 'tool_use',
      id: `toolu_mock_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name,
      input,
    }],
    stop_reason: 'tool_use',
    stop_sequence: null,
    usage: mockUsage(),
  } as Anthropic.Message
}

function createMockLlmMessage(params: MessageCreateParams, context: LlmCallContext): Anthropic.Message {
  if (context.operation === 'history.compress') {
    return mockTextMessage('Résumé mock: les échanges précédents sont conservés sous forme condensée pour les tests.')
  }

  if (context.operation === 'dm.final_narration' || context.operation === 'dm.final_narration_fallback') {
    const latestMechanical = context.newCombatLogEntries?.at(-1)?.mechanicalDetail
    return mockTextMessage(latestMechanical
      ? `[Mock] Action résolue. ${latestMechanical}`
      : '[Mock] Action prise en compte. Que faites-vous ?')
  }

  const text = (context.playerMessage || lastUserText(params.messages)).toLowerCase()
  const gameState = context.gameState

  if (!gameState) return mockTextMessage('[Mock] Le Dungeon Master observe la situation.')

  if (gameState.phase === 'combat' && gameState.currentTurn && gameState.currentTurn !== 'player') {
    return mockTextMessage('[Mock] Les adversaires agissent avant que vous puissiez reprendre l’initiative.')
  }

  if (gameState.phase === 'combat' && /passe|attend|attends|patient|ne fais rien/.test(text) && toolAvailable('pass_turn', context.tools)) {
    return mockToolMessage('pass_turn', { reason: 'Le joueur attend.' })
  }

  if (gameState.phase === 'exploration' && /gobelin|combat|debarque|perisse|fuyez|attaque/.test(text) && toolAvailable('start_encounter', context.tools)) {
    return mockToolMessage('start_encounter', {
      encounterId: 'bakery_floor_goblins',
      reason: 'Le joueur provoque bruyamment les gobelins du sol de la boulangerie.',
    })
  }

  const coordinateMatch = text.match(/\(?\s*(\d{1,2})\s*[,;]\s*(\d{1,2})\s*\)?/)
  if (coordinateMatch && /va|vais|avance|bouge|déplace|deplace|marche|case/.test(text) && toolAvailable('move_token', context.tools)) {
    return mockToolMessage('move_token', {
      tokenId: 'player',
      toCell: { x: Number(coordinateMatch[1]), y: Number(coordinateMatch[2]) },
    })
  }

  if (gameState.phase === 'combat' && gameState.currentTurn === 'player' && /attaque|frappe|tape|coup|charge/.test(text) && toolAvailable('resolve_player_attack', context.tools)) {
    return mockToolMessage('resolve_player_attack', {
      targetHint: 'nearest',
      weaponOrSpell: 'longsword',
    })
  }

  return mockTextMessage('[Mock] La scène progresse sans appel payant au LLM.')
}

async function readCassette(key: string): Promise<Anthropic.Message | null> {
  try {
    const raw = await fs.readFile(path.join(LLM_CASSETTE_DIR, `${key}.json`), 'utf-8')
    return JSON.parse(raw) as Anthropic.Message
  } catch {
    return null
  }
}

async function writeCassette(key: string, message: Anthropic.Message): Promise<void> {
  await fs.mkdir(LLM_CASSETTE_DIR, { recursive: true })
  await fs.writeFile(path.join(LLM_CASSETTE_DIR, `${key}.json`), JSON.stringify(message, null, 2), 'utf-8')
}

async function createLlmMessage(params: MessageCreateParams, context: LlmCallContext): Promise<Anthropic.Message> {
  if (context.requestCallCount > LLM_MAX_CALLS_PER_REQUEST) {
    throw new Error(`Budget LLM dépassé pour cette requête (${LLM_MAX_CALLS_PER_REQUEST} appels max).`)
  }

  const budgetSessionId = normalizeBudgetSessionId(context.sessionId)
  const nextSessionCalls = (sessionLlmCalls.get(budgetSessionId) ?? 0) + 1
  if (LLM_MAX_CALLS_PER_SESSION > 0 && nextSessionCalls > LLM_MAX_CALLS_PER_SESSION) {
    throw new Error(`Budget LLM dépassé pour cette session (${LLM_MAX_CALLS_PER_SESSION} appels max).`)
  }

  logEvent('info', 'llm.call.start', {
    requestId: context.requestId,
    sessionId: context.sessionId,
    operation: context.operation,
    mode: LLM_MODE,
    requestCallCount: context.requestCallCount,
    sessionCallCount: nextSessionCalls,
  })

  if (LLM_MODE === 'mock') {
    return createMockLlmMessage(params, context)
  }

  const key = cassetteKey(context.operation, params)
  if (LLM_MODE === 'replay') {
    const replayed = await readCassette(key)
    if (replayed) {
      logEvent('info', 'llm.replay.hit', { requestId: context.requestId, sessionId: context.sessionId, operation: context.operation, key })
      return replayed
    }
    logEvent('warn', 'llm.replay.miss', { requestId: context.requestId, sessionId: context.sessionId, operation: context.operation, key })
    if (LLM_REPLAY_FALLBACK_TO_MOCK) return createMockLlmMessage(params, context)
    throw new Error(`Cassette LLM introuvable pour ${context.operation}: ${key}`)
  }

  if (!ALLOW_PAID_LLM) {
    throw new Error('Appels LLM payants désactivés (ALLOW_PAID_LLM=false). Utilise LLM_MODE=mock ou replay.')
  }

  sessionLlmCalls.set(budgetSessionId, nextSessionCalls)
  const response = await anthropic.messages.create(params)

  if (LLM_MODE === 'record') {
    await writeCassette(key, response)
    logEvent('info', 'llm.record.saved', { requestId: context.requestId, sessionId: context.sessionId, operation: context.operation, key })
  }

  return response
}

async function getMcpTools(sessionId: string | undefined): Promise<Anthropic.Tool[]> {
  if (cachedMcpTools) {
    logEvent('debug', 'dm.mcp_tools.cache_hit', {
      sessionId,
      toolCount: cachedMcpTools.length,
      toolNames: cachedMcpTools.map(tool => tool.name),
    })
    return cachedMcpTools
  }
  logEvent('debug', 'dm.mcp_tools.load.start', { sessionId })
  const raw = await listMCPTools(sessionId)
  cachedMcpTools = raw
    .filter(t => !INTERNAL_MCP_TOOLS.has(t.name))
    .map(t => ({
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema as Anthropic.Tool['input_schema'],
    }))
  logEvent('info', 'dm.mcp_tools.load.ok', {
    sessionId,
    rawToolCount: raw.length,
    exposedToolCount: cachedMcpTools.length,
    exposedToolNames: cachedMcpTools.map(tool => tool.name),
  })
  return cachedMcpTools
}

function generateRequestId(): string {
  return `dm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function summarizeContentBlocks(blocks: Anthropic.ContentBlock[]): Array<Record<string, unknown>> {
  return blocks.map(block => {
    if (block.type === 'text') {
      return { type: 'text', textLength: block.text.length, text: block.text }
    }
    if (block.type === 'tool_use') {
      return { type: 'tool_use', id: block.id, name: block.name, input: block.input }
    }
    return { type: block.type }
  })
}

// ── Sérialisation compacte du game state ─────────────────────────────────────
function serializeGameState(gameState: GameState): string {
  const compact = {
    ...gameState,
    monsters: Object.fromEntries(
      Object.entries(gameState.monsters).filter(([, m]) => m.isAlive)
    ),
    combatLog: gameState.combatLog.slice(-COMBAT_LOG_TAIL),
  }
  return JSON.stringify(compact)
}

// ── Compression de l'historique ───────────────────────────────────────────────
// Appel séparé à Haiku pour résumer les anciens échanges en un paragraphe court.
// Le résumé est renvoyé au client qui le stocke et le renvoie à chaque requête.
async function compressHistory(
  oldTurns: ConversationTurn[],
  existingSummary: string | undefined,
  usageLog: AnthropicUsageLogEntry[],
  requestId: string,
  sessionId: string | undefined
): Promise<string> {
  const startedAt = Date.now()
  const exchangeText = oldTurns
    .map(t => `${t.role === 'player' ? 'Joueur' : 'DM'}: ${t.content}`)
    .join('\n')

  logEvent('info', 'dm.history.compress.start', {
    requestId,
    oldTurns: oldTurns.length,
    exchangeTextLength: exchangeText.length,
    hasExistingSummary: Boolean(existingSummary),
    existingSummaryLength: existingSummary?.length ?? 0,
  })

  const prompt = existingSummary
    ? `Voici le résumé de la session jusqu'ici :\n${existingSummary}\n\nVoici les échanges suivants à intégrer au résumé :\n${exchangeText}\n\nÉcris un résumé mis à jour en 3-5 phrases : ce qui s'est passé, où en est le joueur, les éléments importants à retenir.`
    : `Résume ces échanges de jeu de rôle D&D en 3-5 phrases. Garde l'essentiel : actions, découvertes, état de la situation.\n\n${exchangeText}`

  const response = await createLlmMessage({
    model: MODEL,
    max_tokens: 300,
    messages: [{ role: 'user', content: prompt }],
  }, {
    requestId,
    sessionId,
    operation: 'history.compress',
    requestCallCount: usageLog.length + 1,
  })

  usageLog.push(logAnthropicUsage({
    requestId,
    operation: 'history.compress',
    model: MODEL,
    usage: response.usage,
    stopReason: response.stop_reason,
    metadata: {
      oldTurns: oldTurns.length,
      hasExistingSummary: Boolean(existingSummary),
    },
  }))

  const text = response.content.find(b => b.type === 'text')
  const summary = text && 'text' in text ? text.text : existingSummary ?? ''
  logEvent('info', 'dm.history.compress.ok', {
    requestId,
    durationMs: Date.now() - startedAt,
    summaryLength: summary.length,
    summary,
  })
  return summary
}

// ── Gestion de l'historique ───────────────────────────────────────────────────
// Retourne l'historique prêt à l'emploi + un éventuel nouveau résumé.
// La compression est déclenchée quand les messages "anciens" (au-delà de
// HISTORY_KEEP_RECENT) dépassent HISTORY_COMPRESS_THRESHOLD_CHARS.
async function processHistory(
  history: ConversationTurn[],
  existingSummary: string | undefined,
  usageLog: AnthropicUsageLogEntry[],
  requestId: string,
  sessionId: string | undefined
): Promise<{ recent: ConversationTurn[]; newSummary: string | undefined }> {
  // Pas assez de messages pour avoir une partie "ancienne"
  if (history.length <= HISTORY_KEEP_RECENT) {
    logEvent('debug', 'dm.history.process.keep_all', {
      requestId,
      historyLength: history.length,
      keepRecent: HISTORY_KEEP_RECENT,
    })
    return { recent: history, newSummary: undefined }
  }

  const oldTurns = history.slice(0, history.length - HISTORY_KEEP_RECENT)
  const recent  = history.slice(-HISTORY_KEEP_RECENT)

  // Vérifie si la partie ancienne est suffisamment longue pour mériter la compression
  const oldText = oldTurns.map(t => t.content).join(' ')
  const needsCompression = oldText.length > HISTORY_COMPRESS_THRESHOLD_CHARS

  if (!needsCompression) {
    if (existingSummary) {
      logEvent('debug', 'dm.history.process.reuse_summary', {
        requestId,
        historyLength: history.length,
        oldTurns: oldTurns.length,
        recentTurns: recent.length,
        oldTextLength: oldText.length,
        thresholdChars: HISTORY_COMPRESS_THRESHOLD_CHARS,
        existingSummaryLength: existingSummary.length,
      })
      return { recent: history, newSummary: undefined }
    }

    // Pas encore au seuil : on renvoie tout sans compresser
    logEvent('debug', 'dm.history.process.no_compression', {
      requestId,
      historyLength: history.length,
      oldTurns: oldTurns.length,
      recentTurns: recent.length,
      oldTextLength: oldText.length,
      thresholdChars: HISTORY_COMPRESS_THRESHOLD_CHARS,
    })
    return { recent: history, newSummary: undefined }
  }

  const newSummary = await compressHistory(oldTurns, existingSummary, usageLog, requestId, sessionId)
  logEvent('info', 'dm.history.process.compressed', {
    requestId,
    historyLength: history.length,
    oldTurns: oldTurns.length,
    recentTurns: recent.length,
    oldTextLength: oldText.length,
    newSummaryLength: newSummary.length,
  })
  return { recent, newSummary }
}

// ── Conversion historique → messages Anthropic ────────────────────────────────
// Garantit l'alternance user/assistant requise par l'API.
// Les messages mécaniques (rôle 'mechanical') sont ignorés — déjà dans le game state.
function historyToAnthropicMessages(turns: ConversationTurn[]): Anthropic.MessageParam[] {
  const msgs: Anthropic.MessageParam[] = []

  for (const turn of turns) {
    const role: 'user' | 'assistant' = turn.role === 'player' ? 'user' : 'assistant'

    // Évite deux messages consécutifs du même rôle (invalide pour l'API Anthropic)
    const last = msgs[msgs.length - 1]
    if (last && last.role === role) continue

    msgs.push({ role, content: turn.content })
  }

  // L'historique doit finir par 'assistant' pour que le message actuel du joueur
  // soit le dernier 'user'. Si ça finit par 'user', on retire ce message
  // (il sera de toute façon ajouté comme message courant).
  if (msgs.length > 0 && msgs[msgs.length - 1].role === 'user') {
    msgs.pop()
  }

  return msgs
}

// ── System prompts ────────────────────────────────────────────────────────────
interface AdventureRoomSection {
  id: string
  text: string
}

function extractAdventureRoomSections(adventureModule: string): AdventureRoomSection[] {
  const headingRegex = /^## Salle\s+(\d+)[^\n]*$/gim
  const headings: Array<{ id: string; index: number }> = []
  let match: RegExpExecArray | null

  while ((match = headingRegex.exec(adventureModule)) !== null) {
    headings.push({ id: match[1], index: match.index })
  }

  return headings.map((heading, index) => {
    const nextHeading = headings[index + 1]?.index ?? adventureModule.length
    return {
      id: heading.id,
      text: adventureModule.slice(heading.index, nextHeading).trim(),
    }
  })
}

function adventureOverview(adventureModule: string): string {
  const firstRoomIndex = adventureModule.search(/^## Salle\s+\d+/im)
  return (firstRoomIndex >= 0 ? adventureModule.slice(0, firstRoomIndex) : adventureModule).trim()
}

function roomContainsCell(section: AdventureRoomSection, cell: { x: number; y: number }): boolean {
  const zone = section.text.match(/\*\*Zone\*\*\s*:\s*x:(\d+)-(\d+),?\s*y:(\d+)-(\d+)/i)
  if (!zone) return false

  const minX = Number(zone[1])
  const maxX = Number(zone[2])
  const minY = Number(zone[3])
  const maxY = Number(zone[4])

  return cell.x >= minX && cell.x <= maxX && cell.y >= minY && cell.y <= maxY
}

function inferAdventureRoomId(sections: AdventureRoomSection[], cell: { x: number; y: number }): string | null {
  return sections.find(section => roomContainsCell(section, cell))?.id ?? null
}

function limitModuleContext(text: string): string {
  if (MODULE_CONTEXT_MAX_CHARS <= 0 || text.length <= MODULE_CONTEXT_MAX_CHARS) {
    return text
  }

  return `${text.slice(0, MODULE_CONTEXT_MAX_CHARS).trimEnd()}\n\n[contexte module tronque a ${MODULE_CONTEXT_MAX_CHARS} caracteres]`
}

function selectAdventureModuleContext(adventureModule: string, gameState: GameState): string {
  const sections = extractAdventureRoomSections(adventureModule)
  const sectionById = new Map(sections.map(section => [section.id, section]))
  const inferredPlayerRoomId = inferAdventureRoomId(sections, gameState.player.position)
  const selectedRoomIds = new Set<string>()

  if (gameState.currentRoomId) selectedRoomIds.add(gameState.currentRoomId)
  if (inferredPlayerRoomId) selectedRoomIds.add(inferredPlayerRoomId)

  for (const roomId of gameState.roomsVisited.slice(-2)) {
    selectedRoomIds.add(roomId)
  }

  for (const monster of Object.values(gameState.monsters)) {
    if (!monster.isAlive) continue
    const monsterRoomId = inferAdventureRoomId(sections, monster.position)
    if (monsterRoomId) selectedRoomIds.add(monsterRoomId)
  }

  if (selectedRoomIds.size === 0 && sectionById.has('1')) {
    selectedRoomIds.add('1')
  }

  const activeMonsters = Object.values(gameState.monsters)
    .filter(monster => monster.isAlive)
    .map(monster => `- ${monster.name} (${monster.type}) a (${monster.position.x},${monster.position.y})`)

  const parts = [
    adventureOverview(adventureModule),
    [
      'ETAT MODULE:',
      `- salle actuelle serveur: ${gameState.currentRoomId ?? 'inconnue'}`,
      `- salle inferree depuis la position joueur: ${inferredPlayerRoomId ?? 'inconnue'}`,
      `- salles visitees recentes: ${gameState.roomsVisited.slice(-4).join(', ') || 'aucune'}`,
      `- salles incluses ci-dessous: ${Array.from(selectedRoomIds).join(', ') || 'aucune'}`,
    ].join('\n'),
  ]

  if (activeMonsters.length > 0) {
    parts.push(`MONSTRES VIVANTS:\n${activeMonsters.join('\n')}`)
  }

  for (const roomId of selectedRoomIds) {
    const section = sectionById.get(roomId)
    if (section) parts.push(section.text)
  }

  return limitModuleContext(parts.join('\n\n---\n\n'))
}

function buildStaticPrompt(): string {
  const ctx = loadContextFiles()

  return `# CONTRAINTE ABSOLUE — LIS CECI EN PREMIER

Tu résous EXACTEMENT et UNIQUEMENT l'action écrite par le joueur dans CE message.
PAS d'anticipation. PAS d'enchaînement. PAS de "et ensuite logiquement...".

Exemples INTERDITS :
- "un ami crie à la porte" → NE PAS le faire entrer, NE PAS le déplacer, NE PAS explorer.
- "j'avance vers la porte" → NE PAS ouvrir la porte, NE PAS entrer dans la pièce.
- "j'attaque le gobelin" → NE PAS résoudre le tour du monstre ensuite.

Après ta réponse : STOP total. Tu attends le prochain message du joueur.

---

Tu es un Dungeon Master de D&D 5e. Tu narre en français, au présent, de façon brève et dense (1-2 phrases par défaut, 3 seulement si un résultat mécanique complexe l'exige).

FORMAT ORAL:
- La reponse doit pouvoir etre lue telle quelle a voix haute.
- Reste dans la fiction. Pas d'excuse, pas de commentaire meta, pas de mention du systeme, des prompts, du moteur, des tools, de MCP ou de l'IA.
- Pas de Markdown, pas de liste, pas de titre, pas de didascalie entre parentheses.
- Ne donne pas de coordonnees ni d'ID technique sauf si le joueur les demande explicitement.
- Ne termine pas par un menu d'options. Une question courte et naturelle est permise seulement si elle sert vraiment la scene.
- Si une action est impossible ou refusee par les regles, formule-le en fiction et en une phrase.
- Ne declare jamais "fin de quete", "fin de campagne", "objectif accompli" ou une conclusion alternative sauf si le joueur demande explicitement d'arreter.
- Si le joueur annonce un plan long, accepte l'intention mais ne saute pas des heures ou des jours: narre seulement la prochaine minute jouable.

RYTHME DE TABLE:
- Court ne veut pas dire sec: vise 2-5 phrases courtes avec un mouvement, une reaction ou une information utile.
- Evite les reponses purement atmospheriques. Chaque reponse doit faire avancer la scene, meme legerement.
- Si un PNJ repond, donne une replique savoureuse ou une decision visible, pas seulement une description.
- Termine sur une situation qui appelle naturellement l'action du joueur, sans menu ni formule froide.
- Si le joueur critique le style, la longueur, le systeme ou un bug, ne reponds pas a la critique et ne t'excuse pas: applique la correction silencieusement puis reprends la scene en fiction.

PERSONNAGE:
${ctx.playerCharacter}

RÈGLES JOUEUR:
${ctx.playerRules}

RÈGLES DM:
${ctx.dmRules}

MODULE:
Le contexte de module pertinent est fourni dans le bloc dynamique "CONTEXTE MODULE PERTINENT".

RÈGLES MÉCANIQUES:
- Tout calcul (attaque, dégâts, déplacement, HP, sauvegarde) → tools MCP obligatoires.
- Les tools MCP refusent les actions illégales (mauvais tour, cible morte, hors portée, déplacement trop long). Si un tool renvoie une erreur, narre sobrement pourquoi l'action échoue ou demande une action valide.
- Déplacement explicite du joueur → move_token AVANT de narrer.
- Début de combat / rencontre de salle → start_encounter en un seul tool, narre, STOP. Ne jamais inventer d'IDs de monstres.
- Rencontres connues: bakery_floor_goblins (salle 8), loading_dock_patrol (salle 7), grammy_apartment_guards (salle 9), violet_fungus_heap (salle 3).
- Tour joueur en combat → resolve_player_attack ou saving_throw, puis STOP. Pour une cible spatiale ("a ma droite", "le plus proche"), utilise resolve_player_attack avec targetHint.
- Si le joueur passe/attend son tour en combat → pass_turn, puis STOP.
- Ne jamais appeler next_turn : outil interne réservé au serveur.
- Tour monstre → ne résous pas toi-même. Le serveur joue les monstres automatiquement, puis tu narres le résultat.
- Fin de combat avec adversaires encore actifs → end_combat avec force=true seulement si fuite, reddition ou accord narratif crédible.
- HP monstres : vigoureux / légèrement blessé / gravement blessé / à l'agonie.

CONTRAT ETAT/NARRATION:
- Si l'etat indique exploration avec 0 monstre vivant, tu ne peux pas narrer des ennemis presents dans la salle, qui entrent, attaquent, degainent, reperent le heros ou bloquent son chemin.
- Pour faire apparaitre une rencontre reelle, appelle start_encounter avant de narrer sa presence.
- Si ce sont seulement des bruits, rumeurs ou mouvements hors champ, dis-le explicitement: aucun ennemi n'est encore sur la carte et le combat n'est pas engage.
- Si tu detectes que ta narration contredirait l'etat moteur, corrige silencieusement et reste dans la fiction. Ne montre jamais le diagnostic au joueur.`
}

function buildDynamicPrompt(gameState: GameState, summaryContext: string | undefined): string {
  const parts: string[] = [`ÉTAT DU JEU: ${serializeGameState(gameState)}`]
  const ctx = loadContextFiles()
  parts.push(`CONTEXTE MODULE PERTINENT:\n${selectAdventureModuleContext(ctx.adventureModule, gameState)}`)

  if (summaryContext) {
    parts.push(`RÉSUMÉ DE LA SESSION (échanges précédents compressés):\n${summaryContext}`)
  }
  return parts.join('\n\n')
}

function buildSystemBlocks(
  gameState: GameState,
  summaryContext: string | undefined
): Anthropic.TextBlockParam[] {
  return [
    {
      type: 'text',
      text: buildStaticPrompt(),
      cache_control: { type: 'ephemeral' },
    },
    {
      type: 'text',
      text: buildDynamicPrompt(gameState, summaryContext),
    },
  ]
}

function buildNarrationStaticPrompt(): string {
  return `Tu es le Dungeon Master d'une partie D&D 5e en francais.
Narre uniquement la consequence immediate de l'action du joueur.
Respecte strictement les resultats mecaniques fournis: jets, degats, morts, positions, tour courant.
Ne lance aucun de, n'invente aucun nouvel ennemi, ne resous aucun tour futur.
Reponse breve: 2-5 phrases courtes, present, style vivant mais clair.
Format vocal: pas de Markdown, pas de liste, pas de titre, pas de parenthese, pas d'excuse, pas de commentaire meta, pas de mention du systeme, des prompts, du moteur, des tools, de MCP ou de l'IA.
Ne donne pas de coordonnees ni d'ID technique sauf si le joueur les demande explicitement.
Ne termine pas par un menu d'options. Une question courte et naturelle est permise seulement si elle sert vraiment la scene.
Ne declare pas de fin de quete/campagne ni de conclusion alternative sauf demande explicite. Pas de time-skip: seulement la prochaine minute jouable.
Donne de l'elan: un mouvement, une replique, une menace, une opportunite ou une information exploitable. Evite les sorties qui ne font que decrire une ambiance.
Si le joueur critique le style, la longueur, le systeme ou un bug, ne reponds pas a la critique: applique la correction silencieusement et reprends la scene en fiction.`
}

function buildNarrationSystemBlocks(
  gameState: GameState,
  summaryContext: string | undefined
): Anthropic.TextBlockParam[] {
  return [
    {
      type: 'text',
      text: buildNarrationStaticPrompt(),
      cache_control: { type: 'ephemeral' },
    },
    {
      type: 'text',
      text: buildDynamicPrompt(gameState, summaryContext),
    },
  ]
}

async function syncMCPState(gameState: GameState, sessionId: string | undefined): Promise<GameState> {
  const startedAt = Date.now()
  logEvent('debug', 'dm.mcp_sync.start', {
    sessionId,
    gameState: summarizeGameState(gameState),
  })

  try {
    const synced = await callMCPTool('replace_game_state', { gameState }, sessionId) as GameState
    logEvent('debug', 'dm.mcp_sync.replace_ok', {
      sessionId,
      durationMs: Date.now() - startedAt,
      gameState: summarizeGameState(synced),
    })
    return synced
  } catch (err) {
    logEvent('warn', 'dm.mcp_sync.replace_failed', {
      sessionId,
      durationMs: Date.now() - startedAt,
      err,
    })
  }

  await callMCPTool('move_token', {
    tokenId: 'player',
    toCell: gameState.player.position,
  }, sessionId)

  for (const [id, monster] of Object.entries(gameState.monsters)) {
    if (monster.isAlive) {
      await callMCPTool('move_token', {
        tokenId: id,
        toCell: monster.position,
      }, sessionId)
    }
  }

  logEvent('warn', 'dm.mcp_sync.token_fallback_ok', {
    sessionId,
    durationMs: Date.now() - startedAt,
    monsterCount: Object.values(gameState.monsters).filter(monster => monster.isAlive).length,
  })
  return gameState
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isMcpErrorResult(result: unknown): boolean {
  return isObjectRecord(result) && typeof result.error === 'string'
}

function hasCompletedCurrentAction(gameState: GameState | undefined | null): boolean {
  if (!gameState || gameState.phase !== 'combat' || !gameState.currentTurn) return false
  return Boolean(gameState.actionUsed?.[gameState.currentTurn])
}

function normalizeFrenchText(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
}

type OralNarrativeGuardResult = {
  narrative: string
  changed: boolean
  fallbackUsed: boolean
  reasons: string[]
  removedLineCount: number
  originalLength: number
  finalLength: number
}

function getCurrentRoomName(gameState: GameState): string | null {
  return ADVENTURE_ROOMS.find(room => room.id === gameState.currentRoomId)?.name ?? null
}

function buildOralFallbackNarrative(gameState: GameState, toolsUsed: string[]): string {
  const roomName = getCurrentRoomName(gameState)

  if (toolsUsed.includes('move_token')) {
    return roomName
      ? `Tu arrives dans ${roomName}; l'air se tend autour de toi.`
      : "Tu avances; l'air se tend autour de toi."
  }

  if (gameState.phase === 'combat') {
    return gameState.currentTurn === 'player'
      ? "Le combat se resserre autour de toi; l'ouverture est a toi."
      : "Le combat continue dans une tension brutale."
  }

  return "Un bref silence tombe autour de toi; l'instant reste ouvert."
}

function splitIntoSentences(text: string): string[] {
  const sentences: string[] = []
  let start = 0
  let index = 0
  let inQuote = false

  while (index < text.length) {
    const char = text[index]
    if (char === '"' || char === '«' || char === '“') {
      inQuote = char === '"' ? !inQuote : true
      index++
      continue
    }

    if (char === '»' || char === '”') {
      inQuote = false
      index++
      continue
    }

    if (!'.!?'.includes(char)) {
      index++
      continue
    }

    let end = index + 1
    while (end < text.length && '.!?'.includes(text[end])) end++
    let closesQuote = false
    while (end < text.length && /["»”]/.test(text[end])) {
      closesQuote = true
      end++
    }
    if (inQuote && !closesQuote) {
      index = end
      continue
    }
    if (closesQuote) inQuote = false

    const whitespaceMatch = text.slice(end).match(/^\s+/)
    const nextIndex = end + (whitespaceMatch?.[0].length ?? 0)
    const nextChar = text[nextIndex]
    const startsNewSentence = !nextChar || /["'«“A-ZÀÂÄÉÈÊËÎÏÔÖÙÛÜÇ]/.test(nextChar)

    if (startsNewSentence) {
      const sentence = text.slice(start, end).trim()
      if (sentence) sentences.push(sentence)
      start = nextIndex
      index = nextIndex
      continue
    }

    index = end
  }

  const tail = text.slice(start).trim()
  if (tail) sentences.push(tail)
  return sentences
}

function lineLooksLikeMetaCommentary(line: string): boolean {
  const normalized = normalizeFrenchText(line)
  if (!normalized) return false

  const containsPositionCoordinates = /\(\s*\d{1,2}\s*,\s*\d{1,2}\s*\)/.test(line) &&
    /\b(actuellement|position|coordonnees?|salle|tu es)\b/.test(normalized)
  if (containsPositionCoordinates) return true

  if (/^\s*(?:[-*+]|\d+[.)])\s+/.test(line)) return true

  return [
    /\b(debug|moteur|mcp|tool|tools|outil|llm|prompt|systeme|etat moteur|contrat)\b/,
    /\b(action mecanique|resultats? mecaniques?|mutation de l'etat|etat attendu|dernier message du joueur)\b/,
    /\b(je comprends le systeme|en attente de ton action|tu as entierement raison|tu as raison|vous avez raison)\b/,
    /\b(tu es actuellement|tu es a\s+(?:en\s+)?salle\s+\d+|salle\s+\d+\s+[-:])\b/,
    /\b(excuse-moi|desole|erreur de ma part|j'aurais du|j aurais du|je vais corriger|merci de cette correction)\b/,
    /\b(je dois clarifier|non, ce message n'est pas|ce message n'est pas|on continue|laissez-moi recommencer|plus de substance)\b/,
    /\b(que fais-tu|que faites-vous|qu[' ]?allez-vous faire|qu[' ]?en est-il|ou veux-tu aller ensuite|deplacement,\s*attaque|attaque,\s*test|roleplay pur)\b/,
    /\b(appeler\s+\w+|move_token|start_encounter|resolve_player_attack|pass_turn|roll_dice)\b/,
    /\b(fin de quete|fin de campagne|quete alternative|objectif accompli|mission accomplie)\b/,
    /\b(heures suivantes|jours suivants|semaines suivantes|premiere fournee|faire fortune)\b/,
  ].some(pattern => pattern.test(normalized))
}

function isMetaOnlyNarrative(text: string): boolean {
  const lines = text
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)

  return lines.length > 0 && lines.every(lineLooksLikeMetaCommentary)
}

function looksLikeEnglishDrift(fragment: string): boolean {
  const normalized = normalizeFrenchText(fragment)
  const englishMarkers = normalized.match(/\b(eyes|shine|genuine|really|guys|friend|quest|campaign|with|the|you|your)\b/g)
  return (englishMarkers?.length ?? 0) >= 2
}

function normalizeNarrativeForOralPlayback(
  narrative: string,
  gameState: GameState,
  toolsUsed: string[]
): OralNarrativeGuardResult {
  const reasons = new Set<string>()
  const original = narrative.trim()

  let text = original
    .replace(/\r\n/g, '\n')
    .replace(/```[\s\S]*?```/g, () => {
      reasons.add('code_block_removed')
      return ' '
    })

  const formattingCleaned = text
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/_{1,2}([^_]+)_{1,2}/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^>\s+/gm, '')

  if (formattingCleaned !== text) {
    reasons.add('markdown_removed')
    text = formattingCleaned
  }

  const withoutParentheticals = text.replace(/\s*\([^)]{0,180}\)/g, match => {
    reasons.add('parenthetical_removed')
    return /[.!?]\s*$/.test(match) ? '. ' : ' '
  })
  if (withoutParentheticals !== text) text = withoutParentheticals

  let removedLineCount = 0
  const keptLines = text
    .split('\n')
    .map(line => line.trim())
    .filter(line => {
      if (!line) return false
      if (!lineLooksLikeMetaCommentary(line)) return true

      removedLineCount++
      reasons.add('meta_line_removed')
      return false
    })

  text = keptLines
    .join(' ')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.!?;:])/g, '$1')
    .replace(/([!?]){2,}/g, '$1')
    .trim()

  let sentences = splitIntoSentences(text)
  const filteredSentences = sentences.filter(sentence => {
    if (!lineLooksLikeMetaCommentary(sentence) && !looksLikeEnglishDrift(sentence)) return true

    reasons.add(looksLikeEnglishDrift(sentence) ? 'non_french_sentence_removed' : 'meta_sentence_removed')
    return false
  })
  if (filteredSentences.length !== sentences.length) {
    text = filteredSentences.join(' ').trim()
    sentences = splitIntoSentences(text)
  }

  if (sentences.length > ORAL_NARRATION_MAX_SENTENCES) {
    text = sentences.slice(0, ORAL_NARRATION_MAX_SENTENCES).join(' ')
    reasons.add('sentence_limit_applied')
  }

  let fallbackUsed = false
  if (!text || normalizeFrenchText(text).length < 12) {
    text = buildOralFallbackNarrative(gameState, toolsUsed)
    fallbackUsed = true
    reasons.add('fallback_used')
  }

  const finalNarrative = text.trim()
  return {
    narrative: finalNarrative,
    changed: finalNarrative !== original,
    fallbackUsed,
    reasons: [...reasons],
    removedLineCount,
    originalLength: original.length,
    finalLength: finalNarrative.length,
  }
}

type RequiredMechanicalAction = {
  reason: string
  suggestedTools: string[]
}

const TOOL_INTENT_SATISFIERS: Record<string, string[]> = {
  'player-combat-attack-intent': ['resolve_player_attack', 'move_token'],
  'player-combat-movement-intent': ['move_token', 'resolve_player_attack'],
  'exploration-movement-intent': ['move_token', 'trigger_room_event', 'start_encounter', 'end_combat'],
  'encounter-or-attack-intent': ['start_encounter', 'resolve_player_attack'],
}

const LLM_TOOL_SETS = {
  explorationDefault: ['roll_dice', 'trigger_room_event', 'get_entity_stats'],
  explorationMovement: ['move_token', 'trigger_room_event', 'start_encounter', 'roll_dice', 'get_entity_stats'],
  explorationEncounter: ['start_encounter', 'move_token', 'trigger_room_event', 'roll_dice', 'get_entity_stats'],
  combatPlayer: ['resolve_player_attack', 'move_token', 'pass_turn', 'end_combat', 'roll_dice', 'get_entity_stats', 'resolve_saving_throw'],
  combatNonPlayer: ['roll_dice', 'get_entity_stats'],
  dialogue: ['roll_dice', 'get_entity_stats', 'apply_condition'],
} as const

type PlayerAttackTargetHint = 'nearest' | 'right' | 'left' | 'front' | 'back' | 'wounded'

function hasToolSatisfyingMechanicalAction(
  requiredAction: RequiredMechanicalAction,
  toolsUsed: string[]
): boolean {
  const satisfiers = TOOL_INTENT_SATISFIERS[requiredAction.reason] ?? requiredAction.suggestedTools
  const satisfierSet = new Set(satisfiers)
  return toolsUsed.some(toolName => satisfierSet.has(toolName))
}

function pickTools(allTools: Anthropic.Tool[], names: readonly string[]): Anthropic.Tool[] {
  const byName = new Map(allTools.map(tool => [tool.name, tool]))
  return names
    .map(name => byName.get(name))
    .filter((tool): tool is Anthropic.Tool => Boolean(tool))
}

function selectToolsForLlm(
  allTools: Anthropic.Tool[],
  gameState: GameState,
  requiredAction: RequiredMechanicalAction | null
): Anthropic.Tool[] {
  if (allTools.length === 0) return []

  if (gameState.phase === 'combat') {
    return pickTools(
      allTools,
      gameState.currentTurn === 'player'
        ? LLM_TOOL_SETS.combatPlayer
        : LLM_TOOL_SETS.combatNonPlayer
    )
  }

  if (gameState.phase === 'dialogue') {
    return pickTools(allTools, LLM_TOOL_SETS.dialogue)
  }

  if (requiredAction?.reason === 'exploration-movement-intent') {
    return pickTools(allTools, LLM_TOOL_SETS.explorationMovement)
  }

  if (requiredAction?.reason === 'encounter-or-attack-intent') {
    return pickTools(allTools, LLM_TOOL_SETS.explorationEncounter)
  }

  return pickTools(allTools, LLM_TOOL_SETS.explorationDefault)
}

function aliveMonsters(gameState: GameState): MonsterState[] {
  return Object.values(gameState.monsters).filter(monster => monster.isAlive)
}

type NarrativeStateContractIssue = {
  reason: string
  matchedTriggers: string[]
  suggestedTools: string[]
}

function countAliveMonsters(gameState: GameState): number {
  return Object.values(gameState.monsters).filter(monster => monster.isAlive).length
}

function detectNarrativeStateContractIssue(
  responseText: string,
  gameState: GameState
): NarrativeStateContractIssue | null {
  if (!responseText || gameState.phase !== 'exploration' || countAliveMonsters(gameState) > 0) {
    return null
  }

  const text = normalizeFrenchText(responseText)
  const mentionsEnemies = /\b(gobelins?|ennemis?|monstres?|creatures?|silhouettes?|eclaireurs?)\b/.test(text)
  if (!mentionsEnemies) return null

  const triggerPatterns: Array<[string, RegExp]> = [
    ['enemy_enters_or_moves', /\b(entrent?|rentrent?|arrivent?|approchent?|surgissent?|debarquent?|passent?|descendent|convergent|encerclent?|se rapprochent|suivent?|poursuivent?)\b/],
    ['enemy_takes_action', /\b(degainent?|attaquent?|frappent?|chargent?|scrutent?|fouillent?|poussent?|se retournent?|reperent?|repere|voient?|apercoivent?|crient?)\b/],
    ['combat_state_without_engine', /\b(combat imminent|initiative|armes? degainees?|epees? degainees?|vous etes repere|intrus)\b/],
  ]
  const matchedTriggers = triggerPatterns
    .filter(([, pattern]) => pattern.test(text))
    .map(([name]) => name)

  if (matchedTriggers.length === 0) return null

  return {
    reason: 'enemy_presence_without_engine_state',
    matchedTriggers,
    suggestedTools: ['start_encounter'],
  }
}

function detectRequiredMechanicalAction(message: string, gameState: GameState): RequiredMechanicalAction | null {
  const text = normalizeFrenchText(message)
  const asksOnlyForDescription = /\b(observe|regarde|inspecte|ecoute|vois|voir|decris|decrit|quoi|qu'est-ce|est-ce tout)\b/.test(text)
  if (asksOnlyForDescription && !/\b(deplace|attaque|frappe|spawn|apparaitre|carte|combat|ouvres?|ouvrir|enfonces?|enfoncer|portes?|gobelins?|ennemis?|monstres?)\b/.test(text)) {
    return null
  }

  const attackIntent = /\b(attaque|attaquer|frappe|frapper|tape|coup|assene|charge|tire|lance)\b/.test(text)
  const directMovementIntent = /\b(deplaces?|deplacer|avances?|avancer|bouges?|bouger|aller|vers|entres?|entrer|rentres?|retournes?|retourner|rejoins?|rejoindre|retrouves?|retrouver|rends|traverses?|approches?|explores?|explorer|montes?|monter|grimpes?|grimpe|empruntes?|prends|fuis|fuite|recules?|ouvres?|ouvrir|enfonces?|enfoncer|portes?|glisses?|glisser)\b/.test(text)
  const goToMovementIntent = /\b(vais|va)\b(?=.{0,80}\b(vers|au|aux|a la|a l|dans|voir|parler|rejoindre|retrouver|retourner|salle|piece|bureau|appartement|boulangerie|quai|verger|pommier)\b)/.test(text)
  const baseMovementIntent = directMovementIntent || goToMovementIntent
  const followIntent = /\b(suis|suivre|poursuis|poursuivre)\b/.test(text) && /\b(gobelins?|ennemis?|monstres?|creatures?|silhouettes?|eux|traces?)\b/.test(text)
  const movementIntent = baseMovementIntent || followIntent
  const mentionsCreature = /\b(ennemis?|gobelins?|monstres?|creatures?|silhouettes?|eclaireurs?)\b/.test(text)
  const explicitEncounterIntent = /\b(combat|apparaitre|spawn|carte|initiative|debarques?|perissez|fuyez)\b/.test(text)
  const hostileCreatureIntent = mentionsCreature && /\b(attaquent?|attaquer|hostiles?|menacent?|chargent?|surgissent?|arrivent?|debarquent?|foncent?|encerclent?)\b/.test(text)
  const encounterIntent = explicitEncounterIntent || hostileCreatureIntent

  if (gameState.phase === 'combat' && gameState.currentTurn === 'player' && attackIntent) {
    return { reason: 'player-combat-attack-intent', suggestedTools: ['resolve_player_attack', 'move_token'] }
  }

  if (gameState.phase === 'combat' && gameState.currentTurn === 'player' && movementIntent) {
    return { reason: 'player-combat-movement-intent', suggestedTools: ['move_token', 'resolve_player_attack'] }
  }

  if (movementIntent) {
    return { reason: 'exploration-movement-intent', suggestedTools: ['move_token', 'trigger_room_event', 'start_encounter'] }
  }

  if (attackIntent || encounterIntent) {
    return { reason: 'encounter-or-attack-intent', suggestedTools: ['start_encounter', 'resolve_player_attack'] }
  }

  return null
}

function detectPassTurnIntent(message: string, gameState: GameState): boolean {
  if (gameState.phase !== 'combat' || gameState.currentTurn !== 'player') return false
  const text = normalizeFrenchText(message)
  return /\b(passe|passer|attends?|attendre|patient|patiente|ne fais rien|reste sur place)\b/.test(text)
}

function parseCoordinateMove(message: string, gameState: GameState): { x: number; y: number } | null {
  const text = normalizeFrenchText(message)
  if (!/\b(va|vais|aller|avance|bouge|deplace|marche|case|coordonnees?)\b/.test(text)) {
    return null
  }

  const coordinateMatch = text.match(/\(?\s*(\d{1,2})\s*[,;]\s*(\d{1,2})\s*\)?/)
  if (!coordinateMatch) return null

  const x = Number(coordinateMatch[1])
  const y = Number(coordinateMatch[2])
  if (!Number.isInteger(x) || !Number.isInteger(y)) return null
  if (x === gameState.player.position.x && y === gameState.player.position.y) return null

  return { x, y }
}

function centerCellForRoom(roomId: string): { x: number; y: number } | null {
  const room = ADVENTURE_ROOMS.find(candidate => candidate.id === roomId)
  if (!room) return null

  return {
    x: Math.round((room.zone.minX + room.zone.maxX) / 2),
    y: Math.round((room.zone.minY + room.zone.maxY) / 2),
  }
}

function parseNamedRoomMove(message: string, gameState: GameState): { x: number; y: number } | null {
  const text = normalizeFrenchText(message)
  const hasMovementVerb = /\b(vers|vais|aller|va |deplace|rends|rejoins?|rejoint|entre|entrer|retournes?|retourner|montes?|monter|grimpes?|grimpe|empruntes?|prends|suis|suivre)\b/.test(text)
  if (!hasMovementVerb) return null

  if (!/\b(salle|piece|bureau|appartement|boulangerie|quai|verger|mac|treant|pommier|etage|haut|escalier)\b/.test(text)) {
    return null
  }

  const namedLocations: Array<{ pattern: RegExp; cell: { x: number; y: number } }> = [
    { pattern: /\b(mac|treant|grand pommier|pommier anime|pommier eveille)\b/, cell: { x: 7, y: 13 } },
  ]
  const namedLocation = namedLocations.find(location => location.pattern.test(text))
  if (namedLocation) {
    const { cell } = namedLocation
    if (cell.x === gameState.player.position.x && cell.y === gameState.player.position.y) return null
    return cell
  }

  const roomAliases: Array<[string, RegExp]> = [
    ['5', /\b(bureau|bureau de grammy)\b/],
    ['9', /\b(appartement|appartement de grammy|etage|a l etage|en haut|escalier)\b/],
    ['8', /\b(sol de la boulangerie|boulangerie|four|cuisine)\b/],
    ['7', /\b(quai|chargement|dock)\b/],
    ['2', /\b(verger|pommiers?|pommier|arbres?)\b/],
    ['3', /\b(dechets?|tas|champignons?|fungus)\b/],
    ['4', /\b(entree|hall)\b/],
    ['1', /\b(exterieur|dehors|sortie)\b/],
  ]

  const targetRoomId = roomAliases.find(([, pattern]) => pattern.test(text))?.[0]
  if (!targetRoomId || targetRoomId === gameState.currentRoomId) return null

  return centerCellForRoom(targetRoomId)
}

function parseTargetHint(message: string): PlayerAttackTargetHint | null {
  const text = normalizeFrenchText(message)
  if (/\b(droite|a droite|sur ma droite)\b/.test(text)) return 'right'
  if (/\b(gauche|a gauche|sur ma gauche)\b/.test(text)) return 'left'
  if (/\b(devant|face|en face)\b/.test(text)) return 'front'
  if (/\b(derriere|arriere|dans mon dos)\b/.test(text)) return 'back'
  if (/\b(blesse|blessure|affaibli|agonie|chancelant)\b/.test(text)) return 'wounded'
  if (/\b(proche|plus proche|nearest|au contact)\b/.test(text)) return 'nearest'
  return null
}

function lastMonsterThatAttackedPlayer(gameState: GameState): string | null {
  const aliveIds = new Set(aliveMonsters(gameState).map(monster => monster.id))

  for (const entry of [...gameState.combatLog].reverse()) {
    if (!aliveIds.has(entry.turn)) continue
    if (!/\battaque\b/i.test(entry.action)) continue
    if (/heros|héros|player|joueur/i.test(entry.action)) return entry.turn
  }

  return null
}

function parseWeaponOrSpell(message: string): string {
  const text = normalizeFrenchText(message)
  if (/\b(hache|hachette)\b/.test(text)) return 'handaxe'
  if (/\b(epee|lame|longsword)\b/.test(text)) return 'longsword'
  return 'longsword'
}

function parsePlayerAttackInput(
  message: string,
  gameState: GameState
): Record<string, unknown> | null {
  if (gameState.phase !== 'combat' || gameState.currentTurn !== 'player') return null
  const requiredAction = detectRequiredMechanicalAction(message, gameState)
  if (requiredAction?.reason !== 'player-combat-attack-intent') return null

  const monsters = aliveMonsters(gameState)
  if (monsters.length === 0) return null

  const text = normalizeFrenchText(message)
  const targetId = /\b(dernier|precedent|m[' ]?a attaque|vient de m[' ]?attaquer)\b/.test(text)
    ? lastMonsterThatAttackedPlayer(gameState)
    : monsters.length === 1
      ? monsters[0].id
      : null

  const targetHint = parseTargetHint(message) ?? (targetId ? null : 'nearest')
  const input: Record<string, unknown> = {
    weaponOrSpell: parseWeaponOrSpell(message),
  }

  if (targetId) input.targetId = targetId
  else if (targetHint) input.targetHint = targetHint

  if (/\b(avantage|advantage)\b/.test(text)) input.advantage = true
  if (/\b(desavantage|désavantage|disadvantage)\b/.test(text)) input.disadvantage = true

  return input
}

function summarizeMcpResultForNarration(toolName: string, result: unknown): string {
  if (isObjectRecord(result)) {
    if (typeof result.mechanicalSummary === 'string') return result.mechanicalSummary
    if (typeof result.error === 'string') return "Ton geste se bloque: ce n'est pas possible dans la situation actuelle."
    if (typeof result.reason === 'string') return result.reason
  }

  if (toolName === 'move_token') return "Tu avances, et la scene change autour de toi."
  return "L'action se resout dans la scene."
}

async function resolveServerFirstAction(
  message: string,
  gameState: GameState,
  sessionId: string | undefined,
  requestId: string
): Promise<{
  handled: boolean
  gameState: GameState
  toolsUsed: string[]
  draftNarrative: string
  sawMcpToolError: boolean
}> {
  const startedAt = Date.now()
  let toolName: string | null = null
  let input: Record<string, unknown> | null = null

  const attackInput = parsePlayerAttackInput(message, gameState)
  if (attackInput) {
    toolName = 'resolve_player_attack'
    input = attackInput
  } else if (detectPassTurnIntent(message, gameState)) {
    toolName = 'pass_turn'
    input = { reason: 'Le joueur attend et passe son tour.' }
  } else {
    const toCell = parseCoordinateMove(message, gameState) ?? parseNamedRoomMove(message, gameState)
    if (toCell) {
      toolName = 'move_token'
      input = { tokenId: 'player', toCell }
    }
  }

  if (!toolName || !input) {
    return { handled: false, gameState, toolsUsed: [], draftNarrative: '', sawMcpToolError: false }
  }

  logEvent('info', 'dm.cost.engine_first.start', {
    requestId,
    sessionId,
    toolName,
    input,
    gameState: summarizeGameState(gameState),
  })

  const result = await callMCPTool(toolName, input, sessionId)
  const sawMcpToolError = isMcpErrorResult(result)
  const nextGameState = await callMCPTool('get_game_state', {}, sessionId) as GameState
  const draftNarrative = summarizeMcpResultForNarration(toolName, result)

  logEvent(sawMcpToolError ? 'warn' : 'info', 'dm.cost.engine_first.complete', {
    requestId,
    sessionId,
    durationMs: Date.now() - startedAt,
    toolName,
    input,
    result,
    draftNarrative,
    gameState: summarizeGameState(nextGameState),
  })

  return {
    handled: true,
    gameState: nextGameState,
    toolsUsed: [toolName],
    draftNarrative,
    sawMcpToolError,
  }
}

function logRoomStateAnomaly(gameState: GameState, requestId: string, sessionId: string | undefined, stage: string): void {
  const inferredRoomId = inferMappedAdventureRoomId(gameState.player.position)
  if (!inferredRoomId) return

  if (gameState.currentRoomId !== inferredRoomId || !gameState.roomsVisited.includes(inferredRoomId)) {
    logEvent('warn', 'anomaly.room_state_mismatch', {
      requestId,
      sessionId,
      stage,
      inferredRoomId,
      currentRoomId: gameState.currentRoomId,
      roomsVisited: gameState.roomsVisited,
      playerPosition: gameState.player.position,
    })
  }
}

async function autoAdvanceCompletedTurn(
  gameState: GameState,
  sessionId: string | undefined,
  requestId: string
): Promise<{ gameState: GameState; advanced: boolean }> {
  if (!hasCompletedCurrentAction(gameState)) {
    return { gameState, advanced: false }
  }

  const actorId = gameState.currentTurn!
  const startedAt = Date.now()
  logEvent('info', 'dm.turn.auto_advance.start', {
    requestId,
    sessionId,
    actorId,
    gameState: summarizeGameState(gameState),
  })

  const result = await callMCPTool('next_turn', { actorId }, sessionId)
  if (isMcpErrorResult(result)) {
    logEvent('warn', 'dm.turn.auto_advance.failed', {
      requestId,
      sessionId,
      actorId,
      result,
    })
    return { gameState, advanced: false }
  }

  const nextGameState = await callMCPTool('get_game_state', {}, sessionId) as GameState
  logEvent('info', 'dm.turn.auto_advance.ok', {
    requestId,
    sessionId,
    actorId,
    durationMs: Date.now() - startedAt,
    result,
    gameState: summarizeGameState(nextGameState),
  })
  return { gameState: nextGameState, advanced: true }
}

// ── Handler principal ─────────────────────────────────────────────────────────
type GridCell = { x: number; y: number }

interface AutoNpcTurnSummary {
  actorId: string
  actorName: string
  moved?: { from: GridCell; to: GridCell }
  moveError?: unknown
  attack?: unknown
  skipped?: string
  advanceError?: unknown
  advancedTo?: string | null
}

function distanceCells(a: GridCell, b: GridCell): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y))
}

function speedCells(entity: { speed: number }): number {
  return Math.floor(entity.speed / 5)
}

function cellKey(cell: GridCell): string {
  return `${cell.x},${cell.y}`
}

function copyCell(cell: GridCell): GridCell {
  return { x: cell.x, y: cell.y }
}

function hasLivingEnemies(gameState: GameState): boolean {
  return Object.values(gameState.monsters).some(monster => monster.isAlive)
}

function monsterAttackName(monster: MonsterState): string {
  switch (monster.type) {
    case 'goblin':
    case 'goblin_minion':
    case 'goblin_boss':
    case 'bandit':
      return 'cimeterre'
    case 'hobgoblin':
    case 'hobgoblin_captain':
      return 'epee longue'
    case 'skeleton':
      return 'epee courte'
    case 'zombie':
    case 'awakened_tree':
      return 'coup'
    case 'wolf':
      return 'morsure'
    case 'violet_fungus':
      return 'touche pourrie'
    default:
      return 'attaque'
  }
}

function occupiedCells(gameState: GameState, exceptId: string): Set<string> {
  const occupied = new Set<string>()
  if (exceptId !== 'player' && gameState.player.hp.current > 0) {
    occupied.add(cellKey(gameState.player.position))
  }
  for (const monster of Object.values(gameState.monsters)) {
    if (monster.id !== exceptId && monster.isAlive) {
      occupied.add(cellKey(monster.position))
    }
  }
  return occupied
}

function chooseMonsterMove(gameState: GameState, monster: MonsterState): GridCell | null {
  const remainingMovement = Math.max(0, speedCells(monster) - (gameState.movementUsed?.[monster.id] ?? 0))
  if (remainingMovement <= 0) return null

  const occupied = occupiedCells(gameState, monster.id)
  const currentDistance = distanceCells(monster.position, gameState.player.position)
  let best: { cell: GridCell; distanceToPlayer: number; movement: number } | null = null

  for (let x = Math.max(0, monster.position.x - remainingMovement); x <= monster.position.x + remainingMovement; x++) {
    for (let y = Math.max(0, monster.position.y - remainingMovement); y <= monster.position.y + remainingMovement; y++) {
      const cell = { x, y }
      const movement = distanceCells(monster.position, cell)
      if (movement === 0 || movement > remainingMovement) continue
      if (occupied.has(cellKey(cell))) continue

      const distanceToPlayer = distanceCells(cell, gameState.player.position)
      if (distanceToPlayer >= currentDistance) continue

      if (
        !best ||
        distanceToPlayer < best.distanceToPlayer ||
        (distanceToPlayer === best.distanceToPlayer && movement < best.movement)
      ) {
        best = { cell, distanceToPlayer, movement }
      }
    }
  }

  return best?.cell ?? null
}

async function loadCurrentGameState(sessionId: string | undefined): Promise<GameState> {
  return await callMCPTool('get_game_state', {}, sessionId) as GameState
}

async function autoEndCombatIfWon(
  gameState: GameState,
  sessionId: string | undefined,
  requestId: string
): Promise<{ gameState: GameState; ended: boolean }> {
  if (gameState.phase !== 'combat' || hasLivingEnemies(gameState)) {
    return { gameState, ended: false }
  }

  const startedAt = Date.now()
  logEvent('info', 'dm.combat.auto_end.start', {
    requestId,
    sessionId,
    gameState: summarizeGameState(gameState),
  })

  const result = await callMCPTool('end_combat', {
    reason: 'Tous les adversaires sont vaincus.',
  }, sessionId)
  if (isMcpErrorResult(result)) {
    logEvent('warn', 'dm.combat.auto_end.failed', {
      requestId,
      sessionId,
      result,
    })
    return { gameState, ended: false }
  }

  const nextGameState = await loadCurrentGameState(sessionId)
  logEvent('info', 'dm.combat.auto_end.ok', {
    requestId,
    sessionId,
    durationMs: Date.now() - startedAt,
    result,
    gameState: summarizeGameState(nextGameState),
  })
  return { gameState: nextGameState, ended: true }
}

async function resolveNpcTurnsUntilPlayerTurn(
  gameState: GameState,
  sessionId: string | undefined,
  requestId: string
): Promise<{ gameState: GameState; resolvedTurns: number; toolsUsed: string[]; summaries: AutoNpcTurnSummary[] }> {
  let state = gameState
  let resolvedTurns = 0
  const toolsUsed: string[] = []
  const summaries: AutoNpcTurnSummary[] = []

  if (state.phase !== 'combat' || !state.currentTurn || state.currentTurn === 'player') {
    return { gameState: state, resolvedTurns, toolsUsed, summaries }
  }

  logEvent('info', 'dm.combat.auto_npc.start', {
    requestId,
    sessionId,
    currentTurn: state.currentTurn,
    gameState: summarizeGameState(state),
  })

  while (
    state.phase === 'combat' &&
    state.currentTurn &&
    state.currentTurn !== 'player' &&
    state.player.hp.current > 0 &&
    resolvedTurns < MAX_AUTO_NPC_TURNS
  ) {
    const actorId = state.currentTurn
    let monster = state.monsters[actorId]
    const summary: AutoNpcTurnSummary = {
      actorId,
      actorName: monster?.name ?? actorId,
    }

    logEvent('info', 'dm.combat.auto_npc.turn_start', {
      requestId,
      sessionId,
      actorId,
      monster,
      gameState: summarizeGameState(state),
    })

    if (!monster || !monster.isAlive) {
      summary.skipped = 'Actor is not an active monster.'
      const advance = await callMCPTool('next_turn', {
        actorId,
        skipAction: true,
        reason: summary.skipped,
      }, sessionId)
      toolsUsed.push('next_turn')
      if (isMcpErrorResult(advance)) {
        summary.advanceError = advance
        summaries.push(summary)
        logEvent('warn', 'dm.combat.auto_npc.advance_failed', {
          requestId,
          sessionId,
          actorId,
          result: advance,
        })
        break
      }
      state = await loadCurrentGameState(sessionId)
      summary.advancedTo = state.currentTurn
      summaries.push(summary)
      resolvedTurns++
      continue
    }

    let distanceToPlayer = distanceCells(monster.position, state.player.position)
    if (distanceToPlayer > 1) {
      const destination = chooseMonsterMove(state, monster)
      if (destination) {
        const from = copyCell(monster.position)
        const move = await callMCPTool('move_token', {
          tokenId: actorId,
          toCell: destination,
        }, sessionId)
        toolsUsed.push('move_token')
        if (isMcpErrorResult(move)) {
          summary.moveError = move
          logEvent('warn', 'dm.combat.auto_npc.move_failed', {
            requestId,
            sessionId,
            actorId,
            destination,
            result: move,
          })
        } else {
          state = await loadCurrentGameState(sessionId)
          monster = state.monsters[actorId] ?? monster
          distanceToPlayer = distanceCells(monster.position, state.player.position)
          summary.moved = { from, to: copyCell(monster.position) }
          logEvent('info', 'dm.combat.auto_npc.move_ok', {
            requestId,
            sessionId,
            actorId,
            from,
            to: monster.position,
            distanceToPlayer,
          })
        }
      }
    }

    if (distanceToPlayer <= 1) {
      const attack = await callMCPTool('resolve_attack', {
        attackerId: actorId,
        targetId: 'player',
        weaponOrSpell: monsterAttackName(monster),
      }, sessionId)
      toolsUsed.push('resolve_attack')
      summary.attack = attack
      logEvent(isMcpErrorResult(attack) ? 'warn' : 'info', 'dm.combat.auto_npc.attack_result', {
        requestId,
        sessionId,
        actorId,
        result: attack,
      })
    } else {
      summary.skipped = 'Cannot reach the player this turn.'
    }

    const advanceArgs = summary.attack && !isMcpErrorResult(summary.attack)
      ? { actorId }
      : { actorId, skipAction: true, reason: summary.skipped ?? 'No legal attack available.' }

    const advance = await callMCPTool('next_turn', advanceArgs, sessionId)
    toolsUsed.push('next_turn')
    if (isMcpErrorResult(advance)) {
      summary.advanceError = advance
      summaries.push(summary)
      logEvent('warn', 'dm.combat.auto_npc.advance_failed', {
        requestId,
        sessionId,
        actorId,
        result: advance,
      })
      break
    }

    state = await loadCurrentGameState(sessionId)
    summary.advancedTo = state.currentTurn
    summaries.push(summary)
    resolvedTurns++
    logEvent('info', 'dm.combat.auto_npc.turn_complete', {
      requestId,
      sessionId,
      actorId,
      advancedTo: state.currentTurn,
      gameState: summarizeGameState(state),
    })
  }

  if (resolvedTurns >= MAX_AUTO_NPC_TURNS && state.currentTurn !== 'player') {
    logEvent('warn', 'dm.combat.auto_npc.guard_exhausted', {
      requestId,
      sessionId,
      maxAutoNpcTurns: MAX_AUTO_NPC_TURNS,
      gameState: summarizeGameState(state),
    })
  }

  logEvent('info', 'dm.combat.auto_npc.complete', {
    requestId,
    sessionId,
    resolvedTurns,
    toolsUsed,
    summaries,
    gameState: summarizeGameState(state),
  })

  return { gameState: state, resolvedTurns, toolsUsed, summaries }
}

function formatCombatLogEntries(entries: CombatLogEntry[]): string {
  if (entries.length === 0) return 'Aucun nouveau log mecanique.'
  return entries.map(entry => {
    const detail = entry.mechanicalDetail ? ` | ${entry.mechanicalDetail}` : ''
    return `- Round ${entry.round}, ${entry.turn}: ${entry.action}${detail}`
  }).join('\n')
}

async function generateFinalNarration(
  params: {
    requestId: string
    sessionId: string | undefined
    playerMessage: string
    draftNarrative: string
    gameState: GameState
    newCombatLogEntries: CombatLogEntry[]
    summaryContext: string | undefined
    usageLog: AnthropicUsageLogEntry[]
  }
): Promise<string | null> {
  const startedAt = Date.now()
  const {
    requestId,
    sessionId,
    playerMessage,
    draftNarrative,
    gameState,
    newCombatLogEntries,
    summaryContext,
    usageLog,
  } = params

  logEvent('info', 'dm.final_narration.start', {
    requestId,
    sessionId,
    draftNarrativeLength: draftNarrative.length,
    newCombatLogCount: newCombatLogEntries.length,
    gameState: summarizeGameState(gameState),
  })

  const finalPrompt = [
    `Action du joueur:\n${playerMessage}`,
    draftNarrative ? `Brouillon narratif precedent, potentiellement incomplet:\n${draftNarrative}` : undefined,
    `Resultats mecaniques faisant autorite:\n${formatCombatLogEntries(newCombatLogEntries)}`,
    `Ecris la reponse finale au joueur en francais, au present, en 2-5 phrases courtes. Elle doit etre naturelle a l'oral et donner de l'elan: mouvement, replique, menace, opportunite ou information exploitable. Respecte strictement les resultats mecaniques. N'annonce aucune action future non resolue. Pas de Markdown, pas de liste, pas de parenthese, pas d'excuse, pas de meta, pas de menu, pas de mention du systeme, du moteur, des tools, de MCP ou de l'IA. Pas de coordonnees ni d'ID technique sauf demande explicite du joueur. Ne declare pas de fin de quete/campagne ni de conclusion alternative sauf demande explicite. Pas de time-skip: seulement la prochaine minute jouable. Si le joueur critique le style, la longueur, le systeme ou un bug, ne reponds pas a la critique: applique la correction silencieusement et reprends la scene en fiction.`,
  ].filter(Boolean).join('\n\n')

  try {
    const response = await createLlmMessage({
      model: MODEL,
      max_tokens: FINAL_NARRATION_MAX_TOKENS,
      system: buildNarrationSystemBlocks(gameState, summaryContext),
      messages: [{ role: 'user', content: finalPrompt }],
    }, {
      requestId,
      sessionId,
      operation: 'dm.final_narration',
      requestCallCount: usageLog.length + 1,
      gameState,
      playerMessage,
      newCombatLogEntries,
    })

    logEvent('info', 'dm.final_narration.response', {
      requestId,
      sessionId,
      durationMs: Date.now() - startedAt,
      stopReason: response.stop_reason,
      content: summarizeContentBlocks(response.content),
    })

    usageLog.push(logAnthropicUsage({
      requestId,
      operation: 'dm.final_narration',
      model: MODEL,
      usage: response.usage,
      stopReason: response.stop_reason,
      metadata: {
        newCombatLogCount: newCombatLogEntries.length,
        draftNarrativeLength: draftNarrative.length,
      },
    }))

    const text = response.content.find(block => block.type === 'text')
    const finalNarrative = text && 'text' in text ? text.text.trim() : ''
    if (!finalNarrative) return null

    logEvent('info', 'dm.final_narration.ok', {
      requestId,
      sessionId,
      narrativeLength: finalNarrative.length,
      narrative: finalNarrative,
    })
    return finalNarrative
  } catch (err) {
    logEvent('error', 'dm.final_narration.error', {
      requestId,
      sessionId,
      durationMs: Date.now() - startedAt,
      err,
    })
    return null
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const requestStartedAt = Date.now()
  const requestId = generateRequestId()
  let releaseSessionLock: (() => void) | null = null
  try {
    const usageLog: AnthropicUsageLogEntry[] = []
    logEvent('info', 'dm.request.start', {
      requestId,
      method: req.method,
      url: req.url,
      userAgent: req.headers.get('user-agent'),
      referer: req.headers.get('referer'),
      forwardedFor: req.headers.get('x-forwarded-for'),
    })

    const body: DMRequest = await req.json()
    const { message, gameState, history = [], summaryContext, sessionId } = body
    logEvent('info', 'dm.request.received', {
      requestId,
      sessionId,
      messageLength: message?.length ?? 0,
      message,
      historyLength: history.length,
      summaryContextLength: summaryContext?.length ?? 0,
      hasClientGameState: Boolean(gameState),
      clientGameState: summarizeGameState(gameState),
    })

    if (!message?.trim()) {
      logEvent('warn', 'dm.request.invalid', {
        requestId,
        sessionId,
        reason: 'missing-message',
        durationMs: Date.now() - requestStartedAt,
      })
      return NextResponse.json({ error: 'Message requis' }, { status: 400 })
    }

    releaseSessionLock = await acquireSessionLock(sessionId)
    logEvent('debug', 'dm.session_lock.acquired', { requestId, sessionId })

    const storedSession = await loadSession(sessionId)

    let currentGameState = storedSession?.gameState ?? gameState
    let requestHistory = storedSession?.history ?? history
    let requestSummaryContext = storedSession?.summaryContext ?? summaryContext
    const toolsUsed: string[] = []
    logEvent('info', 'dm.state.resolved', {
      requestId,
      sessionId,
      stateSource: storedSession?.gameState ? 'stored-session' : gameState ? 'client-bootstrap' : 'mcp-default',
      historySource: storedSession?.history ? 'stored-session' : history.length > 0 ? 'client-bootstrap' : 'empty',
      historyLength: requestHistory.length,
      hasSummary: Boolean(requestSummaryContext),
      gameState: summarizeGameState(currentGameState),
    })

    let mcpTools: Anthropic.Tool[] = []
    try {
      mcpTools = await getMcpTools(sessionId)
    } catch (err) {
      logEvent('error', 'dm.mcp_tools.load.error', { requestId, sessionId, err })
    }

    if (currentGameState) {
      try {
        currentGameState = await syncMCPState(currentGameState, sessionId)
      } catch (err) {
        logEvent('error', 'dm.mcp_sync.unavailable', {
          requestId,
          sessionId,
          durationMs: Date.now() - requestStartedAt,
          err,
        })
        return NextResponse.json({ error: 'Serveur MCP non disponible.' }, { status: 503 })
      }
    } else {
      try {
        currentGameState = await callMCPTool('get_game_state', {}, sessionId) as GameState
        logEvent('debug', 'dm.state.loaded_from_mcp', {
          requestId,
          sessionId,
          gameState: summarizeGameState(currentGameState),
        })
      } catch (err) {
        logEvent('error', 'dm.mcp_default_state.unavailable', {
          requestId,
          sessionId,
          durationMs: Date.now() - requestStartedAt,
          err,
        })
        return NextResponse.json({ error: 'Serveur MCP non disponible.' }, { status: 503 })
      }
    }

    logRoomStateAnomaly(currentGameState, requestId, sessionId, 'after-mcp-sync')
    const combatLogStartLength = currentGameState.combatLog.length

    if (currentGameState.phase === 'combat' && currentGameState.currentTurn && currentGameState.currentTurn !== 'player') {
      try {
        logEvent('info', 'dm.combat.pre_llm_auto_npc.start', {
          requestId,
          sessionId,
          currentTurn: currentGameState.currentTurn,
          gameState: summarizeGameState(currentGameState),
        })
        const npcTurns = await resolveNpcTurnsUntilPlayerTurn(currentGameState, sessionId, requestId)
        if (npcTurns.resolvedTurns > 0) {
          currentGameState = npcTurns.gameState
          toolsUsed.push(...npcTurns.toolsUsed)
        }
        logEvent('info', 'dm.combat.pre_llm_auto_npc.complete', {
          requestId,
          sessionId,
          resolvedTurns: npcTurns.resolvedTurns,
          toolsUsed: npcTurns.toolsUsed,
          gameState: summarizeGameState(currentGameState),
        })
      } catch (err) {
        logEvent('error', 'dm.combat.pre_llm_auto_npc.error', {
          requestId,
          sessionId,
          err,
        })
      }
    }

    // ── Traitement de l'historique ──────────────────────────────────────────
    const { recent: recentHistory, newSummary } = await processHistory(
      requestHistory,
      requestSummaryContext,
      usageLog,
      requestId,
      sessionId
    )
    const activeSummary = newSummary ?? requestSummaryContext
    const requiredMechanicalAction = detectRequiredMechanicalAction(message, currentGameState)
    logEvent('debug', 'dm.history.ready', {
      requestId,
      sessionId,
      recentHistoryLength: recentHistory.length,
      activeSummaryLength: activeSummary?.length ?? 0,
      compressedThisRequest: Boolean(newSummary),
    })

    // Convertit l'historique récent en messages Anthropic (alternance user/assistant)
    const historyMessages = historyToAnthropicMessages(recentHistory)

    // ── Construction des messages pour l'appel LLM ──────────────────────────
    const systemBlocks = buildSystemBlocks(currentGameState, activeSummary)
    const llmTools = selectToolsForLlm(mcpTools, currentGameState, requiredMechanicalAction)
    const messages: Anthropic.MessageParam[] = [
      ...historyMessages,
      { role: 'user', content: message },
    ]
    logEvent('debug', 'dm.anthropic.messages.ready', {
      requestId,
      sessionId,
      messageCount: messages.length,
      historyMessageCount: historyMessages.length,
      systemBlockCount: systemBlocks.length,
      rawToolsAvailable: mcpTools.length,
      toolsAvailable: llmTools.length,
      toolNames: llmTools.map(tool => tool.name),
      gameState: summarizeGameState(currentGameState),
      requiredMechanicalAction,
    })

    let narrative = ''
    let iterations = 0
    let turnBoundaryReached = false
    let mechanicalRetryInjected = false
    let maxTokensRetryInjected = false
    let sawMcpToolError = false
    let lastStopReason: Anthropic.Message['stop_reason'] | null = null
    let lastEndTurnNarrative = ''

    const engineFirst = await resolveServerFirstAction(message, currentGameState, sessionId, requestId)
    if (engineFirst.handled) {
      currentGameState = engineFirst.gameState
      narrative = engineFirst.draftNarrative
      sawMcpToolError = engineFirst.sawMcpToolError
      toolsUsed.push(...engineFirst.toolsUsed)
      logRoomStateAnomaly(currentGameState, requestId, sessionId, 'after-engine-first')
    }

    while (!engineFirst.handled && iterations < MAX_TOOL_ITERATIONS) {
      iterations++
      const iterationStartedAt = Date.now()
      logEvent('info', 'dm.anthropic.iteration.start', {
        requestId,
        sessionId,
        iteration: iterations,
        model: MODEL,
        maxTokens: MAX_TOKENS,
        messageCount: messages.length,
        toolsAvailable: llmTools.length,
        toolNames: llmTools.map(tool => tool.name),
      })

      const response = await createLlmMessage({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: systemBlocks,
        tools: llmTools.length > 0 ? llmTools : undefined,
        messages,
      }, {
        requestId,
        sessionId,
        operation: 'dm.iteration',
        requestCallCount: usageLog.length + 1,
        gameState: currentGameState,
        playerMessage: message,
        tools: llmTools,
      })
      logEvent('info', 'dm.anthropic.iteration.response', {
        requestId,
        sessionId,
        iteration: iterations,
        durationMs: Date.now() - iterationStartedAt,
        stopReason: response.stop_reason,
        content: summarizeContentBlocks(response.content),
      })
      lastStopReason = response.stop_reason

      usageLog.push(logAnthropicUsage({
        requestId,
        operation: 'dm.iteration',
        model: MODEL,
        usage: response.usage,
        stopReason: response.stop_reason,
        metadata: {
          iteration: iterations,
          toolsAvailable: llmTools.length,
          rawToolsAvailable: mcpTools.length,
        },
      }))

      const responseText = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === 'text')
        .map(block => block.text)
        .join('\n\n')
      const narrativeBeforeResponse = narrative
      if (responseText) {
        narrative += (narrative ? '\n\n' : '') + responseText
      }
      logEvent('debug', 'dm.narrative.updated', {
        requestId,
        sessionId,
        iteration: iterations,
        narrativeLength: narrative.length,
        narrative,
      })

      if (response.stop_reason === 'end_turn') {
        lastEndTurnNarrative = responseText
        if (
          requiredMechanicalAction &&
          !hasToolSatisfyingMechanicalAction(requiredMechanicalAction, toolsUsed) &&
          !mechanicalRetryInjected &&
          iterations < MAX_TOOL_ITERATIONS
        ) {
          mechanicalRetryInjected = true
          narrative = narrativeBeforeResponse
          lastEndTurnNarrative = ''
          logEvent('warn', 'anomaly.intent_without_required_tool', {
            requestId,
            sessionId,
            iteration: iterations,
            reason: requiredMechanicalAction.reason,
            suggestedTools: requiredMechanicalAction.suggestedTools,
            toolsUsed,
            message,
            gameState: summarizeGameState(currentGameState),
          })
          messages.push({ role: 'assistant', content: response.content })
          messages.push({
            role: 'user',
            content: `SYSTEM INTERNE, a ne jamais citer au joueur: Le dernier message du joueur demande une action mecanique (${requiredMechanicalAction.reason}). Les tools deja utilises (${toolsUsed.length > 0 ? toolsUsed.join(', ') : 'aucun'}) ne mutent pas l'etat attendu. Tu dois appeler au moins un tool MCP adapte (${requiredMechanicalAction.suggestedTools.join(', ')}) ou, si aucune mutation de l'etat n'est legale, repondre en fiction en une phrase courte. Un simple roll_dice ne suffit pas pour un deplacement, une entree de salle ou une attaque. Ne narre pas une action mecanique sans tool pertinent. La reponse visible doit rester orale, sans meta, sans liste, sans Markdown et sans mention d'outil.`,
          })
          continue
        }

        const narrativeStateIssue = detectNarrativeStateContractIssue(responseText, currentGameState)
        if (narrativeStateIssue) {
          narrative = narrativeBeforeResponse
          lastEndTurnNarrative = "Un bruit bouge hors champ, mais rien ne se montre devant toi pour l'instant."
          narrative = narrative
            ? `${narrative}\n\n${lastEndTurnNarrative}`
            : lastEndTurnNarrative
          logEvent('warn', 'anomaly.narrative_state_contract', {
            requestId,
            sessionId,
            iteration: iterations,
            issue: narrativeStateIssue,
            toolsUsed,
            message,
            responseText,
            serverCorrection: lastEndTurnNarrative,
            gameState: summarizeGameState(currentGameState),
          })
          break
        }

        logEvent('info', 'dm.anthropic.end_turn', {
          requestId,
          sessionId,
          iteration: iterations,
          narrativeLength: narrative.length,
        })
        break
      }

      if (response.stop_reason === 'tool_use') {
        const toolUseBlocks = response.content.filter(
          (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use'
        )
        if (toolUseBlocks.length === 0) {
          logEvent('warn', 'dm.tool_use.empty', { requestId, sessionId, iteration: iterations })
          break
        }

        messages.push({ role: 'assistant', content: response.content })

        const toolResults: Anthropic.ToolResultBlockParam[] = []
        for (const toolUse of toolUseBlocks) {
          if (turnBoundaryReached) {
            const result = {
              error: 'Turn boundary already reached in this request. Wait for the next player message before resolving another actor.',
              code: 'TURN_BOUNDARY_REACHED',
              detail: { toolName: toolUse.name },
            }
            logEvent('warn', 'dm.tool_use.blocked_after_turn_boundary', {
              requestId,
              sessionId,
              iteration: iterations,
              toolUseId: toolUse.id,
              toolName: toolUse.name,
              result,
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
          logEvent('info', 'dm.tool_use.start', {
            requestId,
            sessionId,
            iteration: iterations,
            toolUseId: toolUse.id,
            toolName: toolUse.name,
            input: toolUse.input,
          })
          try {
            const result = await callMCPTool(toolUse.name, toolUse.input as Record<string, unknown>, sessionId)
            const mcpResultIsError = isMcpErrorResult(result)
            logEvent('info', 'dm.tool_use.ok', {
              requestId,
              sessionId,
              iteration: iterations,
              toolUseId: toolUse.id,
              toolName: toolUse.name,
              result,
            })
            if (mcpResultIsError) {
              sawMcpToolError = true
              logEvent('warn', 'dm.tool_use.rule_error', {
                requestId,
                sessionId,
                iteration: iterations,
                toolUseId: toolUse.id,
                toolName: toolUse.name,
                result,
              })
            }
            if (toolUse.name === 'next_turn' && !mcpResultIsError) {
              turnBoundaryReached = true
              logEvent('info', 'dm.turn.boundary_reached', {
                requestId,
                sessionId,
                iteration: iterations,
                toolUseId: toolUse.id,
                result,
              })
            }
            toolResults.push({
              type: 'tool_result',
              tool_use_id: toolUse.id,
              content: JSON.stringify(result),
              is_error: mcpResultIsError,
            })
          } catch (err) {
            const errMsg = err instanceof Error ? err.message : 'Unknown error'
            logEvent('error', 'dm.tool_use.error', {
              requestId,
              sessionId,
              iteration: iterations,
              toolUseId: toolUse.id,
              toolName: toolUse.name,
              err,
            })
            toolResults.push({
              type: 'tool_result',
              tool_use_id: toolUse.id,
              content: JSON.stringify({ error: errMsg }),
              is_error: true,
            })
          }
        }
        messages.push({ role: 'user', content: toolResults })
        logEvent('debug', 'dm.tool_results.queued', {
          requestId,
          sessionId,
          iteration: iterations,
          toolResultCount: toolResults.length,
          turnBoundaryReached,
        })
        if (turnBoundaryReached) break
        continue
      }

      if (response.stop_reason === 'max_tokens' && !maxTokensRetryInjected && iterations < MAX_TOOL_ITERATIONS) {
        maxTokensRetryInjected = true
        const discardedNarrativeLength = narrative.length - narrativeBeforeResponse.length
        narrative = narrativeBeforeResponse
        lastEndTurnNarrative = ''
        logEvent('warn', 'dm.anthropic.max_tokens_retry', {
          requestId,
          sessionId,
          iteration: iterations,
          narrativeLength: narrative.length,
          discardedNarrativeLength,
        })
        messages.push({ role: 'assistant', content: response.content })
        messages.push({
          role: 'user',
          content: 'SYSTEM INTERNE, a ne jamais citer au joueur: Ta reponse a ete tronquee. Reponds en 2-5 phrases courtes, ou appelle exactement un tool MCP si une mutation mecanique est necessaire. Ne repete pas le brouillon tronque. La reponse visible doit rester orale, vivante, sans meta, sans liste, sans Markdown et sans mention d outil.',
        })
        continue
      }

      logEvent('warn', 'dm.anthropic.unhandled_stop_reason', {
        requestId,
        sessionId,
        iteration: iterations,
        stopReason: response.stop_reason,
      })
      break
    }

    if (!narrative && iterations >= MAX_TOOL_ITERATIONS) {
      const fallbackStartedAt = Date.now()
      logEvent('warn', 'dm.final_fallback.start', {
        requestId,
        sessionId,
        iterations,
      })
      const finalResponse = await createLlmMessage({
        model: MODEL,
        max_tokens: FINAL_NARRATION_MAX_TOKENS,
        system: buildNarrationSystemBlocks(currentGameState!, activeSummary),
        messages: [{ role: 'user', content: message }],
      }, {
        requestId,
        sessionId,
        operation: 'dm.final_narration_fallback',
        requestCallCount: usageLog.length + 1,
        gameState: currentGameState!,
        playerMessage: message,
      })
      logEvent('warn', 'dm.final_fallback.response', {
        requestId,
        sessionId,
        durationMs: Date.now() - fallbackStartedAt,
        stopReason: finalResponse.stop_reason,
        content: summarizeContentBlocks(finalResponse.content),
      })

      usageLog.push(logAnthropicUsage({
        requestId,
        operation: 'dm.final_narration_fallback',
        model: MODEL,
        usage: finalResponse.usage,
        stopReason: finalResponse.stop_reason,
        metadata: {
          iterations,
        },
      }))

      for (const block of finalResponse.content) {
        if (block.type === 'text') narrative += block.text
      }
      logEvent('warn', 'dm.final_fallback.narrative_ready', {
        requestId,
        sessionId,
        narrativeLength: narrative.length,
        narrative,
      })
    }

    try {
      currentGameState = await callMCPTool('get_game_state', {}, sessionId) as GameState
      logRoomStateAnomaly(currentGameState, requestId, sessionId, 'after-llm-tools')
      logEvent('debug', 'dm.final_state.loaded', {
        requestId,
        sessionId,
        gameState: summarizeGameState(currentGameState),
      })
    } catch { /* garde l'état qu'on avait */ }

    const llmToolCountAfterLoop = toolsUsed.length

    try {
      const autoEnd = await autoEndCombatIfWon(currentGameState, sessionId, requestId)
      if (autoEnd.ended) {
        currentGameState = autoEnd.gameState
        toolsUsed.push('end_combat')
      }
    } catch (err) {
      logEvent('error', 'dm.combat.auto_end.error', {
        requestId,
        sessionId,
        err,
      })
    }

    if (!turnBoundaryReached) {
      try {
        const autoAdvance = await autoAdvanceCompletedTurn(currentGameState, sessionId, requestId)
        if (autoAdvance.advanced) {
          currentGameState = autoAdvance.gameState
          toolsUsed.push('next_turn')
        }
      } catch (err) {
        logEvent('error', 'dm.turn.auto_advance.error', {
          requestId,
          sessionId,
          err,
        })
      }
    }

    try {
      const npcTurns = await resolveNpcTurnsUntilPlayerTurn(currentGameState, sessionId, requestId)
      if (npcTurns.resolvedTurns > 0) {
        currentGameState = npcTurns.gameState
        toolsUsed.push(...npcTurns.toolsUsed)
      }
    } catch (err) {
      logEvent('error', 'dm.combat.auto_npc.error', {
        requestId,
        sessionId,
        err,
      })
    }

    try {
      const autoEnd = await autoEndCombatIfWon(currentGameState, sessionId, requestId)
      if (autoEnd.ended) {
        currentGameState = autoEnd.gameState
        toolsUsed.push('end_combat')
      }
    } catch (err) {
      logEvent('error', 'dm.combat.auto_end_after_npc.error', {
        requestId,
        sessionId,
        err,
      })
    }

    const canReuseLlmNarration =
      toolsUsed.length > 0 &&
      toolsUsed.length === llmToolCountAfterLoop &&
      lastStopReason === 'end_turn' &&
      lastEndTurnNarrative.trim().length > 0 &&
      !sawMcpToolError &&
      !isMetaOnlyNarrative(lastEndTurnNarrative)

    const canKeepAccumulatedNarrative =
      toolsUsed.length > 0 &&
      toolsUsed.length === llmToolCountAfterLoop &&
      lastStopReason === 'end_turn' &&
      lastEndTurnNarrative.trim().length > 0 &&
      !sawMcpToolError &&
      isMetaOnlyNarrative(lastEndTurnNarrative) &&
      narrative.replace(lastEndTurnNarrative, '').trim().length > 0

    if (canReuseLlmNarration) {
      narrative = lastEndTurnNarrative.trim()
      logEvent('info', 'dm.final_narration.skipped_reuse_llm', {
        requestId,
        sessionId,
        toolsUsed: [...new Set(toolsUsed)],
        narrativeLength: narrative.length,
      })
    } else if (canKeepAccumulatedNarrative) {
      logEvent('info', 'dm.final_narration.skipped_strip_meta_end_turn', {
        requestId,
        sessionId,
        toolsUsed: [...new Set(toolsUsed)],
        lastEndTurnNarrative,
        narrativeLength: narrative.length,
      })
    } else if (toolsUsed.length > 0) {
      const finalNarrative = await generateFinalNarration({
        requestId,
        sessionId,
        playerMessage: message,
        draftNarrative: narrative,
        gameState: currentGameState,
        newCombatLogEntries: currentGameState.combatLog.slice(combatLogStartLength),
        summaryContext: activeSummary,
        usageLog,
      })
      if (finalNarrative) narrative = finalNarrative
    }

    const oralNarrative = normalizeNarrativeForOralPlayback(narrative, currentGameState, toolsUsed)
    if (oralNarrative.changed) {
      logEvent(oralNarrative.fallbackUsed ? 'warn' : 'info', 'dm.narrative.oral_guard.applied', {
        requestId,
        sessionId,
        reasons: oralNarrative.reasons,
        removedLineCount: oralNarrative.removedLineCount,
        fallbackUsed: oralNarrative.fallbackUsed,
        originalLength: oralNarrative.originalLength,
        finalLength: oralNarrative.finalLength,
        originalNarrative: narrative,
        oralNarrative: oralNarrative.narrative,
      })
      narrative = oralNarrative.narrative
    }

    const persistedHistory = [
      ...(activeSummary ? recentHistory.slice(-HISTORY_KEEP_RECENT) : requestHistory),
      { role: 'player', content: message } satisfies ConversationTurn,
      { role: 'dm', content: narrative || 'Le Dungeon Master réfléchit...' } satisfies ConversationTurn,
    ]

    try {
      await saveSession(sessionId, {
        gameState: currentGameState,
        history: persistedHistory,
        summaryContext: activeSummary,
      })
    } catch (err) {
      logEvent('error', 'dm.session.persist.error', {
        requestId,
        sessionId,
        historyLength: persistedHistory.length,
        err,
      })
    }

    const dmResponse: DMResponse = {
      narrative: narrative || 'Le Dungeon Master réfléchit...',
      newGameState: currentGameState,
      toolsUsed: [...new Set(toolsUsed)],
      // Renvoie le nouveau résumé au client seulement si une compression a eu lieu
      summaryContext: newSummary,
    }

    logAnthropicUsageSummary(requestId, usageLog, {
      iterations,
      toolsUsed: [...new Set(toolsUsed)],
      compressedHistory: Boolean(newSummary),
    })

    logEvent('info', 'dm.request.complete', {
      requestId,
      sessionId,
      durationMs: Date.now() - requestStartedAt,
      iterations,
      toolsUsed: [...new Set(toolsUsed)],
      narrativeLength: dmResponse.narrative.length,
      narrative: dmResponse.narrative,
      compressedHistory: Boolean(newSummary),
      newGameState: summarizeGameState(dmResponse.newGameState),
    })

    return NextResponse.json(dmResponse)
  } catch (err) {
    logEvent('error', 'dm.request.error', {
      requestId,
      durationMs: Date.now() - requestStartedAt,
      err,
    })
    const message = err instanceof Error ? err.message : 'Erreur interne du serveur'
    return NextResponse.json({ error: message }, { status: 500 })
  } finally {
    if (releaseSessionLock) {
      releaseSessionLock()
      logEvent('debug', 'dm.session_lock.released', { requestId })
    }
  }
}
