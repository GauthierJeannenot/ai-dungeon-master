'use client'

import { useState, useCallback, useEffect } from 'react'
import dynamic from 'next/dynamic'
import Chat from '@/components/Chat'
import CombatTracker from '@/components/CombatTracker'
import { GameState, ChatMessage, DMResponse, DMRequest, ConversationTurn, DMClientMeta, type DMTurnUsage } from '@/lib/types'
import { createInitialWorldState } from '@/lib/adventure-world'
import { buildInitialSceneNarrative } from '@/lib/scene-surface'

// Battlemap uses browser APIs — load client-only
const Battlemap = dynamic(() => import('@/components/Battlemap'), { ssr: false })

const INITIAL_GAME_STATE: GameState = {
  phase: 'exploration',
  player: {
    id: 'player',
    name: 'Héros',
    class: 'Guerrier',
    level: 1,
    hp: { current: 20, max: 20 },
    ac: 16,
    stats: { str: 16, dex: 12, con: 14, int: 10, wis: 12, cha: 10 },
    proficiencyBonus: 2,
    position: { x: 4, y: 13 },  // Chemin d'entrée — à côté de Mac le Tréant (bas-gauche)
    conditions: [],
    speed: 30,
    inventory: [
      { id: 'longsword', name: 'Épée longue', type: 'weapon', damage: '1d8+3' },
      { id: 'shield', name: 'Bouclier', type: 'armor', acBonus: 2 },
      { id: 'potion1', name: 'Potion de soin', type: 'potion', description: '2d4+2 HP' },
    ],
  },
  monsters: {},
  initiativeOrder: [],
  currentTurn: null,
  round: 0,
  movementUsed: {},
  actionUsed: {},
  combatLog: [],
  roomsVisited: ['1'],
  currentRoomId: '1',
  encountersTriggered: [],
  world: createInitialWorldState(),
}

function generateId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

const SESSION_KEYS = {
  sessionId: 'ai-dm-session-id',
  gameState: 'ai-dm-game-state',
  messages: 'ai-dm-messages',
  summaryContext: 'ai-dm-summary-context',
  budget: 'ai-dm-budget-summary',
}
const CLIENT_DEBUG_LOG_KEY = 'ai-dm-client-debug-log-v1'
const CLIENT_DEBUG_BROWSER_ID_KEY = 'ai-dm-client-debug-browser-id'
const CLIENT_DEBUG_LOG_LIMIT = 200
const CLIENT_DEBUG_SYNC_BATCH_SIZE = 100

interface ClientDebugEntry {
  id: string
  timestamp: string
  sessionId: string
  event: string
  payload: Record<string, unknown>
}

interface ClientBudgetSummary {
  turns: number
  llmCalls: number
  inputTokens: number
  outputTokens: number
  cacheCreationInputTokens: number
  cacheReadInputTokens: number
  estimatedCostUsd: number
  lastTurnCostUsd: number
  lastNarrator: DMTurnUsage['narrator'] | null
  lastLlmRoute: DMTurnUsage['llmRoute']
}

const WELCOME_MESSAGE = buildInitialSceneNarrative(INITIAL_GAME_STATE)

function createWelcomeMessage(): ChatMessage {
  return {
    id: generateId(),
    role: 'dm',
    content: WELCOME_MESSAGE,
    timestamp: Date.now(),
  }
}

function emptyBudgetSummary(): ClientBudgetSummary {
  return {
    turns: 0,
    llmCalls: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationInputTokens: 0,
    cacheReadInputTokens: 0,
    estimatedCostUsd: 0,
    lastTurnCostUsd: 0,
    lastNarrator: null,
    lastLlmRoute: 'none',
  }
}

function addTurnUsage(summary: ClientBudgetSummary, usage: DMTurnUsage | undefined): ClientBudgetSummary {
  if (!usage) return summary

  return {
    turns: summary.turns + 1,
    llmCalls: summary.llmCalls + usage.llm.calls,
    inputTokens: summary.inputTokens + usage.llm.inputTokens,
    outputTokens: summary.outputTokens + usage.llm.outputTokens,
    cacheCreationInputTokens: summary.cacheCreationInputTokens + usage.llm.cacheCreationInputTokens,
    cacheReadInputTokens: summary.cacheReadInputTokens + usage.llm.cacheReadInputTokens,
    estimatedCostUsd: Number((summary.estimatedCostUsd + usage.llm.estimatedCostUsd).toFixed(8)),
    lastTurnCostUsd: usage.llm.estimatedCostUsd,
    lastNarrator: usage.narrator,
    lastLlmRoute: usage.llmRoute,
  }
}

function formatUsd(value: number): string {
  if (value <= 0) return '$0'
  if (value < 0.0001) return '<$0.0001'
  return `$${value.toFixed(4)}`
}

function narratorLabel(value: DMTurnUsage['narrator'] | null): string {
  switch (value) {
    case 'director': return 'director'
    case 'local': return 'local'
    case 'llm': return 'LLM'
    case 'rule': return 'regle'
    case 'fallback': return 'fallback'
    default: return '-'
  }
}

function createSessionId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `session-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function createClientRequestId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `client-${crypto.randomUUID()}`
  }
  return `client-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function getOrCreateSessionId(): string {
  try {
    const existing = sessionStorage.getItem(SESSION_KEYS.sessionId)
    if (existing) return existing

    const next = createSessionId()
    sessionStorage.setItem(SESSION_KEYS.sessionId, next)
    return next
  } catch {
    return createSessionId()
  }
}

function getOrCreateBrowserLogId(): string {
  try {
    const existing = localStorage.getItem(CLIENT_DEBUG_BROWSER_ID_KEY)
    if (existing) return existing

    const next = createSessionId()
    localStorage.setItem(CLIENT_DEBUG_BROWSER_ID_KEY, next)
    return next
  } catch {
    return createSessionId()
  }
}

function readSessionJson<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(key)
    return raw ? JSON.parse(raw) as T : null
  } catch {
    return null
  }
}

function writeSessionJson(key: string, value: unknown): void {
  try {
    sessionStorage.setItem(key, JSON.stringify(value))
  } catch { /* storage unavailable */ }
}

function truncateClientText(value: string, maxLength = 1200): string {
  return value.length <= maxLength
    ? value
    : `${value.slice(0, maxLength)}...[truncated ${value.length - maxLength} chars]`
}

function summarizeClientGameState(state: GameState): Record<string, unknown> {
  const monsters = Object.values(state.monsters)
  const aliveMonsters = monsters.filter(monster => monster.isAlive)

  return {
    phase: state.phase,
    round: state.round,
    currentTurn: state.currentTurn,
    player: {
      hp: state.player.hp,
      position: state.player.position,
      conditions: state.player.conditions,
    },
    monsters: {
      total: monsters.length,
      alive: aliveMonsters.length,
      aliveIds: aliveMonsters.map(monster => monster.id),
    },
    room: state.currentRoomId,
    roomsVisitedCount: state.roomsVisited.length,
    combatLogCount: state.combatLog.length,
    sceneMemory: state.sceneMemory ? {
      tension: state.sceneMemory.tension,
      alertLevel: state.sceneMemory.alertLevel,
      macDisposition: state.sceneMemory.macDisposition,
      goblinMorale: state.sceneMemory.goblinMorale,
      patrolPressure: state.sceneMemory.patrolPressure,
      lastDirectorBeats: state.sceneMemory.lastDirectorBeats,
    } : null,
  }
}

function summarizeClientWorldDebug(state: GameState): Record<string, unknown> | null {
  if (!state.world) return null

  const currentRoom = state.currentRoomId ? state.world.rooms?.[state.currentRoomId] : undefined
  const roomObjects = Object.values(state.world.objects ?? {})
    .filter(object => object.roomId === state.currentRoomId)
    .map(object => ({
      id: object.id,
      name: object.name,
      kind: object.kind,
      visible: object.visible,
      discovered: object.discovered,
      opened: object.opened,
      locked: object.locked,
      taken: object.taken,
      used: object.used,
      disarmed: object.disarmed,
      tags: object.tags,
    }))
  const roomNpcs = Object.values(state.world.npcs ?? {})
    .filter(npc => npc.roomId === state.currentRoomId)
    .map(npc => ({
      id: npc.id,
      name: npc.name,
      disposition: npc.disposition,
      known: npc.known,
      memory: npc.memory,
      tags: npc.tags,
    }))

  return {
    currentRoom: currentRoom ? {
      id: currentRoom.id,
      name: currentRoom.name,
      tags: currentRoom.tags,
      exits: currentRoom.exits,
    } : state.currentRoomId,
    roomObjects,
    roomNpcs,
    quests: state.world.quests,
    alarms: state.world.alarms,
    flags: state.world.flags,
    lastEvents: state.world.eventLog.slice(-8).map(event => ({
      type: event.type,
      outcome: event.outcome,
      targetId: event.targetId,
      summary: truncateClientText(event.summary, 180),
      metadata: event.metadata,
    })),
  }
}

function readClientDebugLog(): ClientDebugEntry[] {
  try {
    const raw = localStorage.getItem(CLIENT_DEBUG_LOG_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed as ClientDebugEntry[] : []
  } catch {
    return []
  }
}

function writeClientDebugLog(entries: ClientDebugEntry[]): void {
  try {
    localStorage.setItem(
      CLIENT_DEBUG_LOG_KEY,
      JSON.stringify(entries.slice(-CLIENT_DEBUG_LOG_LIMIT))
    )
  } catch { /* storage unavailable */ }
}

function appendClientDebugLog(
  sessionId: string,
  event: string,
  payload: Record<string, unknown>
): void {
  const entry: ClientDebugEntry = {
    id: `${sessionId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    sessionId,
    event,
    payload,
  }

  writeClientDebugLog([...readClientDebugLog(), entry])
}

async function syncClientDebugLog(sessionId: string): Promise<void> {
  const entries = readClientDebugLog()
  if (entries.length === 0) return
  const batch = entries.slice(0, CLIENT_DEBUG_SYNC_BATCH_SIZE)

  const res = await fetch('/api/debug/client-logs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      browserLogId: getOrCreateBrowserLogId(),
      sessionId,
      entries: batch,
    }),
  })
  if (!res.ok) return

  const sentIds = new Set(batch.map(entry => entry.id))
  writeClientDebugLog(readClientDebugLog().filter(entry => !sentIds.has(entry.id)))
}

function phaseLabel(phase: GameState['phase']): { label: string; color: string } {
  switch (phase) {
    case 'combat': return { label: 'COMBAT', color: 'text-red-400' }
    case 'dialogue': return { label: 'DIALOGUE', color: 'text-blue-400' }
    default: return { label: 'EXPLORATION', color: 'text-green-400' }
  }
}

export default function GamePage() {
  const [gameState, setGameState] = useState<GameState>(INITIAL_GAME_STATE)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [hasLoadedSession, setHasLoadedSession] = useState(false)
  // Résumé compressé des échanges anciens — stocké ici, renvoyé à chaque requête
  const [summaryContext, setSummaryContext] = useState<string | undefined>(undefined)
  const [budgetSummary, setBudgetSummary] = useState<ClientBudgetSummary>(emptyBudgetSummary)

  // Restore the per-tab session after hydration. sessionStorage keeps refreshes coherent
  // while still isolating separate browser tabs from one another.
  useEffect(() => {
    const restoredSessionId = getOrCreateSessionId()
    const restoredGameState = readSessionJson<GameState>(SESSION_KEYS.gameState)
    const restoredMessages = readSessionJson<ChatMessage[]>(SESSION_KEYS.messages)
    const restoredBudget = readSessionJson<ClientBudgetSummary>(SESSION_KEYS.budget)

    setSessionId(restoredSessionId)
    if (restoredGameState) setGameState(restoredGameState)
    setMessages(restoredMessages?.length ? restoredMessages : [createWelcomeMessage()])
    if (restoredBudget) setBudgetSummary(restoredBudget)
    appendClientDebugLog(restoredSessionId, 'client.session.loaded', {
      restoredGameState: Boolean(restoredGameState),
      restoredMessages: restoredMessages?.length ?? 0,
      gameState: summarizeClientGameState(restoredGameState ?? INITIAL_GAME_STATE),
      budget: restoredBudget ?? emptyBudgetSummary(),
    })
    syncClientDebugLog(restoredSessionId).catch(err => {
      console.error('Failed to sync client debug log:', err)
    })

    try {
      setSummaryContext(sessionStorage.getItem(SESSION_KEYS.summaryContext) ?? undefined)
    } catch { /* storage unavailable */ }

    setHasLoadedSession(true)
  }, [])

  useEffect(() => {
    if (!hasLoadedSession) return

    writeSessionJson(SESSION_KEYS.gameState, gameState)
    writeSessionJson(SESSION_KEYS.messages, messages)
    writeSessionJson(SESSION_KEYS.budget, budgetSummary)

    try {
      if (summaryContext) {
        sessionStorage.setItem(SESSION_KEYS.summaryContext, summaryContext)
      } else {
        sessionStorage.removeItem(SESSION_KEYS.summaryContext)
      }
    } catch { /* storage unavailable */ }
  }, [budgetSummary, gameState, hasLoadedSession, messages, summaryContext])

  const logClientEvent = useCallback((event: string, payload: Record<string, unknown>) => {
    if (!hasLoadedSession) return

    const activeSessionId = sessionId ?? getOrCreateSessionId()
    if (!sessionId) setSessionId(activeSessionId)

    appendClientDebugLog(activeSessionId, event, payload)
    syncClientDebugLog(activeSessionId).catch(err => {
      console.error('Failed to sync client debug log:', err)
    })
  }, [hasLoadedSession, sessionId])

  const sendMessage = useCallback(async (text: string, clientMeta: DMClientMeta = { inputMode: 'text' }) => {
    if (isLoading || !hasLoadedSession) return
    setError(null)
    setIsLoading(true)
    setInputValue('')

    const activeSessionId = sessionId ?? getOrCreateSessionId()
    if (!sessionId) setSessionId(activeSessionId)
    const clientRequestId = createClientRequestId()

    // Add player message immediately
    const playerMsg: ChatMessage = {
      id: generateId(),
      role: 'player',
      content: text,
      timestamp: Date.now(),
    }
    setMessages(prev => [...prev, playerMsg])

    try {
      // Construit l'historique : messages player/dm uniquement (pas mechanical),
      // sans le message courant qui vient d'être ajouté à la liste.
      // On l'exclut en prenant tous les messages AVANT l'ajout du playerMsg.
      const history: ConversationTurn[] = messages
        .filter((m): m is ChatMessage & { role: 'player' | 'dm' } =>
          m.role === 'player' || m.role === 'dm'
        )
        .map(m => ({ role: m.role, content: m.content }))

      const body: DMRequest = {
        message: text,
        clientRequestId,
        sessionId: activeSessionId,
        gameState,
        history,
        summaryContext,
        clientMeta,
      }
      appendClientDebugLog(activeSessionId, 'client.dm.request', {
        clientRequestId,
        message: truncateClientText(text),
        inputMode: clientMeta.inputMode ?? 'text',
        voice: clientMeta.voice,
        historyLength: history.length,
        summaryContextLength: summaryContext?.length ?? 0,
        gameState: summarizeClientGameState(gameState),
      })
      syncClientDebugLog(activeSessionId).catch(err => {
        console.error('Failed to sync client debug log:', err)
      })

      const res = await fetch('/api/dm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? `HTTP ${res.status}`)
      }

      const data: DMResponse = await res.json()
      appendClientDebugLog(activeSessionId, 'client.dm.response', {
        clientRequestId,
        inputMode: clientMeta.inputMode ?? 'text',
        narrative: truncateClientText(data.narrative ?? ''),
        toolsUsed: data.toolsUsed,
        engine: data.engine ? {
          eventTypes: data.engine.events.map(event => event.type),
          events: data.engine.events.map(event => ({
            type: event.type,
            outcome: event.outcome,
            actorId: event.actorId,
            targetId: event.targetId,
            summary: truncateClientText(event.summary, 180),
            metadata: event.metadata,
          })),
          affordances: data.engine.affordances.map(action => ({
            id: action.id,
            kind: action.kind,
            label: action.label,
            enabled: action.enabled,
            toolName: action.toolName,
            reason: action.reason,
          })),
          enabledAffordances: data.engine.affordances
            .filter(action => action.enabled)
            .map(action => ({ kind: action.kind, label: action.label, reason: action.reason })),
          blockedAffordances: data.engine.affordances
            .filter(action => !action.enabled)
            .map(action => ({ kind: action.kind, label: action.label, reason: action.reason })),
        } : undefined,
        debug: data.debug,
        usage: data.usage,
        summaryContextLength: data.summaryContext?.length ?? 0,
        gameState: data.newGameState ? summarizeClientGameState(data.newGameState) : null,
        worldDebug: data.newGameState ? summarizeClientWorldDebug(data.newGameState) : null,
      })
      syncClientDebugLog(activeSessionId).catch(err => {
        console.error('Failed to sync client debug log:', err)
      })

      // Update game state
      if (data.newGameState) {
        setGameState(data.newGameState)
      }

      // Si une compression a eu lieu, on stocke le nouveau résumé
      if (data.summaryContext) {
        setSummaryContext(data.summaryContext)
      }

      if (data.usage) {
        setBudgetSummary(prev => addTurnUsage(prev, data.usage))
      }

      const newMessages: ChatMessage[] = []

      // Add mechanical results from combat log
      if (data.toolsUsed && data.toolsUsed.length > 0 && data.newGameState) {
        const newEntries = data.newGameState.combatLog.slice(gameState.combatLog.length)
        for (const entry of newEntries) {
          if (entry.mechanicalDetail) {
            newMessages.push({
              id: generateId(),
              role: 'mechanical',
              content: entry.mechanicalDetail,
              timestamp: entry.timestamp,
            })
          }
        }
      }

      // Add DM narrative
      if (data.narrative) {
        newMessages.push({
          id: generateId(),
          role: 'dm',
          content: data.narrative,
          timestamp: Date.now(),
        })
      }

      setMessages(prev => [...prev, ...newMessages])
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erreur inconnue'
      appendClientDebugLog(activeSessionId, 'client.dm.error', {
        clientRequestId,
        message: truncateClientText(text),
        inputMode: clientMeta.inputMode ?? 'text',
        error: msg,
        gameState: summarizeClientGameState(gameState),
      })
      syncClientDebugLog(activeSessionId).catch(syncErr => {
        console.error('Failed to sync client debug log:', syncErr)
      })
      setError(msg)
      setMessages(prev => [...prev, {
        id: generateId(),
        role: 'dm',
        content: `[Erreur du système] ${msg}`,
        timestamp: Date.now(),
      }])
    } finally {
      setIsLoading(false)
    }
  }, [gameState, hasLoadedSession, isLoading, messages, sessionId, summaryContext])

  const resetGame = useCallback(() => {
    if (isLoading) return

    const previousSessionId = sessionId
    const nextSessionId = createSessionId()

    try {
      sessionStorage.setItem(SESSION_KEYS.sessionId, nextSessionId)
      sessionStorage.removeItem(SESSION_KEYS.gameState)
      sessionStorage.removeItem(SESSION_KEYS.messages)
      sessionStorage.removeItem(SESSION_KEYS.summaryContext)
      sessionStorage.removeItem(SESSION_KEYS.budget)
    } catch { /* storage unavailable */ }

    setSessionId(nextSessionId)
    setGameState(INITIAL_GAME_STATE)
    setMessages([createWelcomeMessage()])
    setSummaryContext(undefined)
    setBudgetSummary(emptyBudgetSummary())
    setError(null)
    setInputValue('')

    if (previousSessionId) {
      appendClientDebugLog(previousSessionId, 'client.session.reset', {
        nextSessionId,
        gameState: summarizeClientGameState(gameState),
        messageCount: messages.length,
      })
      syncClientDebugLog(previousSessionId).catch(err => {
        console.error('Failed to sync client debug log:', err)
      })

      fetch('/api/session', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: previousSessionId }),
      }).catch(err => {
        console.error('Failed to delete previous game session:', err)
      })
    }
  }, [gameState, isLoading, messages.length, sessionId])

  const { label: phaseText, color: phaseColor } = phaseLabel(gameState.phase)
  const alertLevel = gameState.sceneMemory?.alertLevel ?? 0
  const alertColor = alertLevel >= 4 ? 'text-red-300' : alertLevel >= 2 ? 'text-amber-300' : 'text-stone-300'

  return (
    <div className="flex flex-col h-screen bg-stone-950 text-stone-100 overflow-hidden">
      {/* Top bar */}
      <header className="flex-shrink-0 min-h-10 bg-stone-900 border-b border-amber-900/40 flex flex-wrap items-center px-3 sm:px-4 py-1 gap-2 sm:gap-4">
        <span className="font-bold text-amber-500 tracking-wider text-xs sm:text-sm">⚔ AI DUNGEON MASTER</span>
        <div className="hidden sm:block h-4 w-px bg-stone-700" />
        <span className={`text-xs font-mono font-bold ${phaseColor}`}>{phaseText}</span>
        <div className="hidden sm:block h-4 w-px bg-stone-700" />
        <span className="hidden sm:inline text-xs text-stone-500">
          {gameState.player.name} · {gameState.player.class} niv.{gameState.player.level}
        </span>
        <span className="text-[11px] sm:text-xs text-stone-500">
          HP: <span className={gameState.player.hp.current < gameState.player.hp.max * 0.3 ? 'text-red-400' : 'text-stone-300'}>
            {gameState.player.hp.current}
          </span>/{gameState.player.hp.max}
        </span>
        <span className="text-[11px] sm:text-xs text-stone-500">CA: {gameState.player.ac}</span>
        <button
          type="button"
          onClick={resetGame}
          disabled={isLoading || !hasLoadedSession}
          className="ml-auto text-[11px] sm:text-xs text-amber-200 bg-stone-800 hover:bg-stone-700 disabled:opacity-40 border border-amber-900/40 px-2 py-1 rounded transition-colors"
        >
          <span className="sm:hidden">Nouvelle</span>
          <span className="hidden sm:inline">Nouvelle partie</span>
        </button>
        {error && (
          <span className="text-xs text-red-400 bg-red-900/20 px-2 py-0.5 rounded">
            {error}
          </span>
        )}
      </header>

      {/* Main layout */}
      <div className="flex flex-col lg:flex-row flex-1 overflow-hidden">
        {/* Left: Battlemap (65%) */}
        <div className="flex-[45] lg:flex-[65] min-w-0 min-h-0 p-2 overflow-hidden">
          <Battlemap gameState={gameState} cellSize={52} />
          {/* Carte : Grammy's Bakery (~880×800px) — grille 17×15 cases à 52px */}
        </div>

        {/* Right: Chat + CombatTracker (35%) */}
        <div className="flex-[55] lg:flex-[35] min-w-0 lg:min-w-[320px] w-full lg:max-w-[480px] flex flex-col gap-2 p-2 overflow-hidden">
          <div className="flex-shrink-0 border border-stone-800 bg-stone-900/70 px-3 py-2 text-[11px] text-stone-400">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div>
                <div className="uppercase tracking-wide text-stone-600">Partie</div>
                <div className="font-mono text-stone-200">{formatUsd(budgetSummary.estimatedCostUsd)}</div>
              </div>
              <div>
                <div className="uppercase tracking-wide text-stone-600">Tour</div>
                <div className="font-mono text-stone-200">{formatUsd(budgetSummary.lastTurnCostUsd)}</div>
              </div>
              <div>
                <div className="uppercase tracking-wide text-stone-600">LLM</div>
                <div className="font-mono text-stone-200">{budgetSummary.llmCalls} appel{budgetSummary.llmCalls > 1 ? 's' : ''}</div>
              </div>
              <div>
                <div className="uppercase tracking-wide text-stone-600">Alerte</div>
                <div className={`font-mono ${alertColor}`}>{alertLevel}/5</div>
              </div>
            </div>
            <div className="mt-1 grid grid-cols-2 gap-x-2 gap-y-0.5 font-mono text-[10px] text-stone-500 sm:grid-cols-[auto_1fr_auto]">
              <span className="min-w-0">cache {budgetSummary.cacheReadInputTokens}/{budgetSummary.cacheCreationInputTokens}</span>
              <span className="min-w-0 text-right sm:text-center">narrateur {narratorLabel(budgetSummary.lastNarrator)}</span>
              <span className="min-w-0 text-right sm:col-auto">route {budgetSummary.lastLlmRoute}</span>
            </div>
          </div>
          {gameState.phase === 'combat' && (
            <div className="flex-shrink-0">
              <CombatTracker gameState={gameState} />
            </div>
          )}
          <div className="flex-1 min-h-0">
            <Chat
              messages={messages}
              isLoading={isLoading || !hasLoadedSession}
              gameState={gameState}
              onSendMessage={sendMessage}
              inputValue={inputValue}
              onInputChange={setInputValue}
              onClientEvent={logClientEvent}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
