'use client'

import { useState, useCallback, useEffect } from 'react'
import dynamic from 'next/dynamic'
import Chat from '@/components/Chat'
import CombatTracker from '@/components/CombatTracker'
import { GameState, ChatMessage, DMResponse, DMRequest, ConversationTurn } from '@/lib/types'

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
  roomsVisited: [],
  currentRoomId: null,
}

function generateId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

const SESSION_KEYS = {
  sessionId: 'ai-dm-session-id',
  gameState: 'ai-dm-game-state',
  messages: 'ai-dm-messages',
  summaryContext: 'ai-dm-summary-context',
}

const WELCOME_MESSAGE =
  'Le vieux sorcier Tyndareus le Vert vous a confié une mission des plus… particulières. Sa carte en main, vous avez chevauché deux jours jusqu\'à cette bâtisse en pierre abandonnée au bout d\'un chemin de gravier envahi par les herbes folles. L\'odeur vous a frappé bien avant que le bâtiment n\'apparaisse : cannelle, muscade, pommes mûres — un parfum presque magique qui flotte dans l\'air chaud. Devant vous se dressent de grandes portes en bois doubles, à moitié vermoulues. Sur le chemin, un immense pommier aux branches noueuses vous observe… ou du moins, c\'est l\'impression que donne son écorce ridée. Bienvenue à la Boulangerie de Grammy. Que faites-vous ?'

function createWelcomeMessage(): ChatMessage {
  return {
    id: generateId(),
    role: 'dm',
    content: WELCOME_MESSAGE,
    timestamp: Date.now(),
  }
}

function createSessionId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `session-${Date.now()}-${Math.random().toString(36).slice(2)}`
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

  // Restore the per-tab session after hydration. sessionStorage keeps refreshes coherent
  // while still isolating separate browser tabs from one another.
  useEffect(() => {
    const restoredSessionId = getOrCreateSessionId()
    const restoredGameState = readSessionJson<GameState>(SESSION_KEYS.gameState)
    const restoredMessages = readSessionJson<ChatMessage[]>(SESSION_KEYS.messages)

    setSessionId(restoredSessionId)
    if (restoredGameState) setGameState(restoredGameState)
    setMessages(restoredMessages?.length ? restoredMessages : [createWelcomeMessage()])

    try {
      setSummaryContext(sessionStorage.getItem(SESSION_KEYS.summaryContext) ?? undefined)
    } catch { /* storage unavailable */ }

    setHasLoadedSession(true)
  }, [])

  useEffect(() => {
    if (!hasLoadedSession) return

    writeSessionJson(SESSION_KEYS.gameState, gameState)
    writeSessionJson(SESSION_KEYS.messages, messages)

    try {
      if (summaryContext) {
        sessionStorage.setItem(SESSION_KEYS.summaryContext, summaryContext)
      } else {
        sessionStorage.removeItem(SESSION_KEYS.summaryContext)
      }
    } catch { /* storage unavailable */ }
  }, [gameState, hasLoadedSession, messages, summaryContext])

  const sendMessage = useCallback(async (text: string) => {
    if (isLoading || !hasLoadedSession) return
    setError(null)
    setIsLoading(true)
    setInputValue('')

    const activeSessionId = sessionId ?? getOrCreateSessionId()
    if (!sessionId) setSessionId(activeSessionId)

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
        sessionId: activeSessionId,
        gameState,
        history,
        summaryContext,
      }

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

      // Update game state
      if (data.newGameState) {
        setGameState(data.newGameState)
      }

      // Si une compression a eu lieu, on stocke le nouveau résumé
      if (data.summaryContext) {
        setSummaryContext(data.summaryContext)
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
    } catch { /* storage unavailable */ }

    setSessionId(nextSessionId)
    setGameState(INITIAL_GAME_STATE)
    setMessages([createWelcomeMessage()])
    setSummaryContext(undefined)
    setError(null)
    setInputValue('')

    if (previousSessionId) {
      fetch('/api/session', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: previousSessionId }),
      }).catch(err => {
        console.error('Failed to delete previous game session:', err)
      })
    }
  }, [isLoading, sessionId])

  const { label: phaseText, color: phaseColor } = phaseLabel(gameState.phase)

  return (
    <div className="flex flex-col h-screen bg-stone-950 text-stone-100 overflow-hidden">
      {/* Top bar */}
      <header className="flex-shrink-0 h-10 bg-stone-900 border-b border-amber-900/40 flex items-center px-4 gap-4">
        <span className="font-bold text-amber-500 tracking-wider text-sm">⚔ AI DUNGEON MASTER</span>
        <div className="h-4 w-px bg-stone-700" />
        <span className={`text-xs font-mono font-bold ${phaseColor}`}>{phaseText}</span>
        <div className="h-4 w-px bg-stone-700" />
        <span className="text-xs text-stone-500">
          {gameState.player.name} · {gameState.player.class} niv.{gameState.player.level}
        </span>
        <span className="text-xs text-stone-500">
          HP: <span className={gameState.player.hp.current < gameState.player.hp.max * 0.3 ? 'text-red-400' : 'text-stone-300'}>
            {gameState.player.hp.current}
          </span>/{gameState.player.hp.max}
        </span>
        <span className="text-xs text-stone-500">CA: {gameState.player.ac}</span>
        <button
          type="button"
          onClick={resetGame}
          disabled={isLoading || !hasLoadedSession}
          className="ml-auto text-xs text-amber-200 bg-stone-800 hover:bg-stone-700 disabled:opacity-40 border border-amber-900/40 px-2 py-1 rounded transition-colors"
        >
          Nouvelle partie
        </button>
        {error && (
          <span className="text-xs text-red-400 bg-red-900/20 px-2 py-0.5 rounded">
            {error}
          </span>
        )}
      </header>

      {/* Main layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: Battlemap (65%) */}
        <div className="flex-[65] min-w-0 p-2 overflow-hidden">
          <Battlemap gameState={gameState} cellSize={52} />
          {/* Carte : Grammy's Bakery (~880×800px) — grille 17×15 cases à 52px */}
        </div>

        {/* Right: Chat + CombatTracker (35%) */}
        <div className="flex-[35] min-w-[320px] max-w-[480px] flex flex-col gap-2 p-2 overflow-hidden">
          {gameState.phase === 'combat' && (
            <div className="flex-shrink-0">
              <CombatTracker gameState={gameState} />
            </div>
          )}
          <div className="flex-1 min-h-0">
            <Chat
              messages={messages}
              isLoading={isLoading || !hasLoadedSession}
              onSendMessage={sendMessage}
              inputValue={inputValue}
              onInputChange={setInputValue}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
