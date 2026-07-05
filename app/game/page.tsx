'use client'

import { useState, useCallback, useEffect, useMemo, Suspense } from 'react'
import dynamic from 'next/dynamic'
import { useSearchParams, useRouter } from 'next/navigation'
import Chat from '@/components/Chat'
import CombatTracker from '@/components/CombatTracker'
import Link from 'next/link'
import { GameState, ChatMessage, DMResponse, DMRequest, ConversationTurn, DMClientMeta, type DMQuota, type DMTurnUsage } from '@/lib/types'
import { getAdventure, DEFAULT_ADVENTURE_ID, type AdventureDefinition } from '@/lib/adventures'
import { DEFAULT_CHARACTER_ID, isKnownCharacterId } from '@/lib/character-registry'
import { buildInitialGameState } from '@/lib/initial-game-state'

// Battlemap uses browser APIs — load client-only
const Battlemap = dynamic(() => import('@/components/Battlemap'), { ssr: false })

function generateId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

// Clés sessionStorage préfixées par module ET par personnage : deux parties de
// modules ou de personnages différents coexistent dans le même onglet. Le
// personnage PAR DÉFAUT (guerrier) garde le préfixe historique `ai-dm:<adv>:`
// (aucune partie en cours perdue à la mise à jour) ; les autres personnages
// ajoutent `<characterId>:`.
interface SessionKeys {
  sessionId: string
  gameState: string
  messages: string
  summaryContext: string
  budget: string
}
function makeSessionKeys(adventureId: string, characterId: string = DEFAULT_CHARACTER_ID): SessionKeys {
  const charSegment = characterId === DEFAULT_CHARACTER_ID ? '' : `${characterId}:`
  const prefix = `ai-dm:${adventureId}:${charSegment}`
  return {
    sessionId: `${prefix}session-id`,
    gameState: `${prefix}game-state`,
    messages: `${prefix}messages`,
    summaryContext: `${prefix}summary-context`,
    budget: `${prefix}budget-summary`,
  }
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

function createWelcomeMessage(welcome: string): ChatMessage {
  return {
    id: generateId(),
    role: 'dm',
    content: welcome,
    timestamp: Date.now(),
  }
}

// Reconstruit les bulles de chat depuis l'historique serveur (reprise de partie
// sur un nouvel appareil : le sessionStorage local est vide).
function historyToChatMessages(history: ConversationTurn[] | undefined): ChatMessage[] {
  if (!Array.isArray(history)) return []
  return history.map((turn, index) => ({
    id: `hist-${index}-${Math.random().toString(36).slice(2, 7)}`,
    role: turn.role,
    content: turn.content,
    timestamp: Date.now() + index,
  }))
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

function getOrCreateSessionId(keys: SessionKeys): string {
  try {
    const existing = sessionStorage.getItem(keys.sessionId)
    if (existing) return existing

    const next = createSessionId()
    sessionStorage.setItem(keys.sessionId, next)
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
    // sceneMemory est un Record libre propre au module : passthrough sans
    // référencer de clé de module (le débug affiche ce que le module y a mis).
    sceneMemory: state.sceneMemory ?? null,
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
  const batch = entries.slice(-CLIENT_DEBUG_SYNC_BATCH_SIZE)

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

  // Keep the local ring buffer after a successful sync. On multi-machine or
  // ephemeral deployments, the server-side log that accepted the batch can
  // disappear before we inspect it; keeping recent entries lets refreshes
  // republish the same blackbox data to the currently visible instance.
  writeClientDebugLog(readClientDebugLog())
}

// Libellé compact du quota dans la barre du haut : solde de tokens (connecté)
// ou messages d'essai restants (anonyme).
function quotaLabel(quota: DMQuota | null): { label: string; warning: boolean } | null {
  if (!quota) return null
  if (quota.kind === 'user') {
    const balance = quota.balance ?? 0
    return { label: `${balance} message${balance > 1 ? 's' : ''}`, warning: balance <= 3 }
  }
  const remaining = quota.remaining ?? 0
  return { label: `essai ${remaining}/${quota.limit ?? remaining}`, warning: remaining <= 1 }
}

function phaseLabel(phase: GameState['phase']): { label: string; color: string } {
  switch (phase) {
    case 'combat': return { label: 'COMBAT', color: 'text-red-400' }
    case 'dialogue': return { label: 'DIALOGUE', color: 'text-blue-400' }
    default: return { label: 'EXPLORATION', color: 'text-green-400' }
  }
}

function GameView({ adventure, characterId, resumeSessionId }: { adventure: AdventureDefinition; characterId: string; resumeSessionId?: string | null }) {
  const router = useRouter()
  // Clés sessionStorage et état initial DÉRIVÉS du module ET du personnage
  // actifs. Stables par (adventure.id, characterId) ; un changement de l'un
  // (nouvelle URL) reconstruit tout.
  const keys = useMemo(() => makeSessionKeys(adventure.id, characterId), [adventure.id, characterId])
  const initialGameState = useMemo(() => buildInitialGameState(adventure.id, characterId), [adventure.id, characterId])

  const [gameState, setGameState] = useState<GameState>(initialGameState)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [hasLoadedSession, setHasLoadedSession] = useState(false)
  // Résumé compressé des échanges anciens — stocké ici, renvoyé à chaque requête
  const [summaryContext, setSummaryContext] = useState<string | undefined>(undefined)
  // Map courante du module : image et grille suivent gameState.currentMapId
  // (modules multi-maps). Repli : première map (états legacy, modules 1-map).
  const currentMapSpec = useMemo(
    () => adventure.map.maps.find(spec => spec.id === gameState.currentMapId) ?? adventure.map.maps[0],
    [adventure, gameState.currentMapId]
  )
  const currentBattlemapImage = adventure.battlemapImages?.[currentMapSpec.id] ?? adventure.battlemapImage
  const [budgetSummary, setBudgetSummary] = useState<ClientBudgetSummary>(emptyBudgetSummary)
  const [quota, setQuota] = useState<DMQuota | null>(null)

  // Charge l'état du compte (solde de tokens ou quota invité). Crée aussi le
  // cookie invité et crédite le bonus de bienvenue au premier passage.
  useEffect(() => {
    fetch('/api/me')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (!data) return
        // Garde de confort : un module payant non débloqué renvoie vers l'accueil
        // (le vrai verrou reste la 402 de /api/dm). L'achat/la connexion s'y font.
        if (adventure.requiresEntitlement) {
          const owned = Array.isArray(data.ownedModules) && data.ownedModules.includes(adventure.id)
          if (!data.authenticated || !owned) {
            router.replace('/')
            return
          }
        }
        if (data.authenticated) {
          setQuota({ kind: 'user', balance: data.balance })
        } else if (data.guest) {
          setQuota({ kind: 'guest', remaining: data.guest.remaining, limit: data.guest.limit })
        }
      })
      .catch(() => { /* affichage quota indisponible, le serveur reste l'arbitre */ })
  }, [])

  // Restore the per-tab session after hydration. sessionStorage keeps refreshes
  // coherent while still isolating separate browser tabs from one another.
  // Cas particulier « reprise » (?session=<id>) : si le sessionStorage local est
  // vide (nouvel appareil), on hydrate depuis le serveur.
  useEffect(() => {
    let cancelled = false

    async function initSession() {
      const localState = readSessionJson<GameState>(keys.gameState)
      const localMessages = readSessionJson<ChatMessage[]>(keys.messages)
      const localBudget = readSessionJson<ClientBudgetSummary>(keys.budget)

      // Reprise demandée ET aucun état local pour ce module → hydratation serveur.
      if (resumeSessionId && !(localState && localMessages?.length)) {
        try {
          const res = await fetch(`/api/sessions/${encodeURIComponent(resumeSessionId)}`)
          if (res.ok) {
            const data = await res.json()
            if (cancelled) return
            try { sessionStorage.setItem(keys.sessionId, resumeSessionId) } catch { /* storage unavailable */ }
            const rebuilt = historyToChatMessages(data.history)
            setSessionId(resumeSessionId)
            setGameState(data.gameState ?? initialGameState)
            setMessages(rebuilt.length ? rebuilt : [createWelcomeMessage(adventure.welcomeMessage)])
            setSummaryContext(data.summaryContext ?? undefined)
            setBudgetSummary(emptyBudgetSummary())
            setHasLoadedSession(true)
            return
          }
          // 403/404 → on retombe sur une nouvelle partie (code ci-dessous).
        } catch { /* réseau indisponible : nouvelle partie */ }
      }

      // Reprise sur le même navigateur : forcer le sessionId demandé.
      if (resumeSessionId) {
        try { sessionStorage.setItem(keys.sessionId, resumeSessionId) } catch { /* storage unavailable */ }
      }

      const restoredSessionId = getOrCreateSessionId(keys)
      if (cancelled) return

      setSessionId(restoredSessionId)
      if (localState) setGameState(localState)
      setMessages(localMessages?.length ? localMessages : [createWelcomeMessage(adventure.welcomeMessage)])
      if (localBudget) setBudgetSummary(localBudget)
      appendClientDebugLog(restoredSessionId, 'client.session.loaded', {
        restoredGameState: Boolean(localState),
        restoredMessages: localMessages?.length ?? 0,
        gameState: summarizeClientGameState(localState ?? initialGameState),
        budget: localBudget ?? emptyBudgetSummary(),
      })
      syncClientDebugLog(restoredSessionId).catch(err => {
        console.error('Failed to sync client debug log:', err)
      })

      try {
        setSummaryContext(sessionStorage.getItem(keys.summaryContext) ?? undefined)
      } catch { /* storage unavailable */ }

      setHasLoadedSession(true)
    }

    initSession()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!hasLoadedSession) return

    writeSessionJson(keys.gameState, gameState)
    writeSessionJson(keys.messages, messages)
    writeSessionJson(keys.budget, budgetSummary)

    try {
      if (summaryContext) {
        sessionStorage.setItem(keys.summaryContext, summaryContext)
      } else {
        sessionStorage.removeItem(keys.summaryContext)
      }
    } catch { /* storage unavailable */ }
  }, [budgetSummary, gameState, hasLoadedSession, messages, summaryContext])

  const logClientEvent = useCallback((event: string, payload: Record<string, unknown>) => {
    if (!hasLoadedSession) return

    const activeSessionId = sessionId ?? getOrCreateSessionId(keys)
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

    const activeSessionId = sessionId ?? getOrCreateSessionId(keys)
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
        adventureId: adventure.id,
        characterId,
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
        // 402 = quota épuisé : le serveur renvoie l'état exact du compteur.
        if (res.status === 402 && data.quota) setQuota(data.quota)
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
        turnTrace: data.turnTrace ? {
          traceId: data.turnTrace.traceId,
          actionCount: data.turnTrace.actions.length,
          engineEventTypes: data.turnTrace.engineEvents.map(event => event.type),
          contradictionReasons: data.turnTrace.contradictions.map(issue => issue.reason),
          narrativeFactKinds: data.turnTrace.narrativeFacts.map(fact => fact.kind),
          refusalCode: data.turnTrace.refusalCode,
        } : undefined,
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

      if (data.quota) {
        setQuota(data.quota)
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
      sessionStorage.setItem(keys.sessionId, nextSessionId)
      sessionStorage.removeItem(keys.gameState)
      sessionStorage.removeItem(keys.messages)
      sessionStorage.removeItem(keys.summaryContext)
      sessionStorage.removeItem(keys.budget)
    } catch { /* storage unavailable */ }

    setSessionId(nextSessionId)
    setGameState(initialGameState)
    setMessages([createWelcomeMessage(adventure.welcomeMessage)])
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
  const quotaInfo = quotaLabel(quota)
  const quotaExhausted = quota
    ? (quota.kind === 'user' ? (quota.balance ?? 0) <= 0 : (quota.remaining ?? 0) <= 0)
    : false
  const alertLevel = Number(gameState.sceneMemory?.alertLevel ?? 0)
  const alertColor = alertLevel >= 4 ? 'text-red-300' : alertLevel >= 2 ? 'text-amber-300' : 'text-stone-300'

  return (
    <div className="flex flex-col h-screen bg-stone-950 text-stone-100 overflow-hidden">
      {/* Top bar */}
      <header className="flex-shrink-0 min-h-10 bg-stone-900 border-b border-amber-900/40 flex flex-wrap items-center px-3 sm:px-4 py-1 gap-2 sm:gap-4">
        <Link href="/" className="font-bold text-amber-500 hover:text-amber-400 tracking-wider text-xs sm:text-sm transition-colors" title="Retour à l'accueil">
          ⚔ AI DUNGEON MASTER
        </Link>
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
        {quotaInfo && (
          <Link
            href="/"
            title={quota?.kind === 'user' ? 'Messages restants — acheter un pack' : "Messages d'essai restants — se connecter"}
            className={`text-[11px] sm:text-xs font-mono border px-2 py-0.5 rounded transition-colors ${
              quotaInfo.warning
                ? 'text-red-300 border-red-800/60 bg-red-950/40 hover:bg-red-900/40'
                : 'text-amber-300 border-amber-900/40 bg-stone-800 hover:bg-stone-700'
            }`}
          >
            {quotaInfo.label}
          </Link>
        )}
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
          <Battlemap
            gameState={gameState}
            cellSize={52}
            image={currentBattlemapImage}
            cols={currentMapSpec.grid.cols}
            rows={currentMapSpec.grid.rows}
          />
          {/* Battlemap et grille de la MAP COURANTE du module actif */}
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
          {quotaExhausted && (
            <div className="flex-shrink-0 border border-red-800/60 bg-red-950/40 px-3 py-2 text-xs text-red-200">
              {quota?.kind === 'user'
                ? 'Solde de messages épuisé — achetez un pack pour continuer l\'aventure.'
                : "Messages d'essai gratuits épuisés — connectez-vous pour continuer à jouer."}{' '}
              <Link href="/" className="underline text-amber-300 hover:text-amber-200">
                {quota?.kind === 'user' ? 'Acheter des messages' : 'Se connecter'}
              </Link>
            </div>
          )}
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
              placeholders={adventure.chatPlaceholders}
              roomStatusHints={adventure.roomStatusHints}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

// Résout le module depuis ?adventure=<id>. Module inconnu ou verrouillé →
// retour à l'accueil (on ne joue que du disponible). useSearchParams impose un
// Suspense boundary côté Next.
function GamePageResolver() {
  const params = useSearchParams()
  const router = useRouter()
  const requested = params.get('adventure') ?? DEFAULT_ADVENTURE_ID
  const resumeSessionId = params.get('session')
  // Personnage choisi (?character=). Inconnu → guerrier par défaut (fail-safe :
  // le vrai verrou reste le 400/409 de /api/dm).
  const requestedCharacter = params.get('character')
  const characterId = isKnownCharacterId(requestedCharacter) ? requestedCharacter! : DEFAULT_CHARACTER_ID
  const adventure = getAdventure(requested)
  const playable = adventure?.available ? adventure : null

  useEffect(() => {
    if (!playable) router.replace('/')
  }, [playable, router])

  if (!playable) return null
  // key : un changement de module OU de personnage remonte un GameView neuf
  // (états/refs isolés).
  return <GameView key={`${playable.id}:${characterId}`} adventure={playable} characterId={characterId} resumeSessionId={resumeSessionId} />
}

export default function GamePage() {
  return (
    <Suspense fallback={<div className="h-screen bg-stone-950" />}>
      <GamePageResolver />
    </Suspense>
  )
}
