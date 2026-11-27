'use client'

import { useEffect, useRef, useState } from 'react'
import { isDmStartupProgress, type DmStartupProgress } from './runpod-startup-progress'

export type GamePresenceState = 'checking' | 'warming' | 'ready' | 'idle' | 'error'

export function useGamePresence(sessionId: string | null, adventureId: string, characterId: string) {
  const [status, setStatus] = useState<{ ready: boolean; state: GamePresenceState; message: string; progress?: DmStartupProgress | null }>({
    ready: false, state: 'checking', message: 'Préparation du MJ…',
  })
  const requestReady = useRef<() => Promise<void>>(async () => { throw new Error('Session en préparation.') })
  const requestRetry = useRef<() => void>(() => undefined)

  useEffect(() => {
    if (!sessionId) return
    const clientId = crypto.randomUUID()
    let sequence = 0
    let disposed = false
    let departed = false
    let inFlight = false
    let timer: ReturnType<typeof setTimeout>
    setStatus({ ready: false, state: 'checking', message: 'Préparation du MJ…' })
    let wakeRequested = true
    let ready = false
    const payload = (present: boolean) => JSON.stringify({ clientId, sessionId, adventureId, characterId, sequence: ++sequence, present, wake: present && wakeRequested })

    async function heartbeat() {
      if (inFlight || disposed || departed) return
      inFlight = true
      let delay = 3000
      try {
        const body = payload(true)
        const sentWake = wakeRequested
        const sentSequence = sequence
        const response = await fetch('/api/game-presence', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body,
          signal: AbortSignal.timeout(20000),
        })
        const data = await response.json()
        if (disposed || departed || sentSequence !== sequence) return
        if (!response.ok) {
          ready = false
          setStatus({ ready: false, state: 'error', message: data.error || 'Connexion au MJ interrompue. Nouvelle tentative…' })
          delay = 30000
        } else {
          if (sentWake) wakeRequested = false
          ready = Boolean(data.ready)
          const state: GamePresenceState = ready ? 'ready' : data.state === 'idle' ? 'idle' : data.state === 'error' ? 'error' : 'warming'
          const progress = isDmStartupProgress(data.progress) ? data.progress : null
          setStatus({ ready, state, progress, message: ready ? '' : state === 'idle' ? 'MJ en veille. Envoie un message pour le réveiller.' : state === 'error' ? 'Le MJ est momentanément indisponible. Nouvelle tentative automatique…' : 'Préparation du MJ…' })
          delay = ready || data.state === 'idle' ? 30000 : 3000
        }
      } catch {
        ready = false
        if (!disposed && !departed) setStatus({ ready: false, state: 'error', message: 'Connexion au MJ interrompue. Nouvelle tentative…' })
      } finally {
        inFlight = false
        if (!disposed && !departed) timer = setTimeout(() => { void heartbeat() }, delay)
      }
    }

    requestReady.current = async () => {
      wakeRequested = true
      if (!ready) setStatus({ ready: false, state: 'warming', message: 'Préparation du MJ…' })
      ready = false
      const deadline = Date.now() + 15 * 60 * 1000
      while (!disposed && !departed && !ready && Date.now() < deadline) {
        clearTimeout(timer)
        await heartbeat()
        if (!ready) await new Promise(resolve => setTimeout(resolve, 1000))
      }
      if (!ready) throw new Error('Le MJ ne peut pas démarrer pour le moment. Réessaie.')
    }
    requestRetry.current = () => {
      wakeRequested = true
      ready = false
      setStatus({ ready: false, state: 'warming', message: 'Préparation du MJ…' })
      clearTimeout(timer)
      void heartbeat()
    }

    function leave() {
      if (departed) return
      departed = true
      clearTimeout(timer)
      const body = payload(false)
      // Le départ nettoie la présence ; seul le délai sans messages pilote l'arrêt.
      if (!navigator.sendBeacon?.('/api/game-presence', new Blob([body], { type: 'application/json' }))) {
        void fetch('/api/game-presence', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => undefined)
      }
    }
    function resume() {
      if (disposed || !departed) return
      departed = false
      setStatus({ ready: false, state: 'checking', message: 'Préparation du MJ…' })
      void heartbeat()
    }
    function wake() {
      if (document.visibilityState !== 'visible' || disposed || departed) return
      clearTimeout(timer)
      void heartbeat()
    }
    void heartbeat()
    window.addEventListener('pagehide', leave)
    window.addEventListener('pageshow', resume)
    document.addEventListener('visibilitychange', wake)
    return () => {
      disposed = true
      requestRetry.current = () => undefined
      leave()
      window.removeEventListener('pagehide', leave)
      window.removeEventListener('pageshow', resume)
      document.removeEventListener('visibilitychange', wake)
    }
  }, [sessionId, adventureId, characterId])

  return { ...status, ensureReady: () => requestReady.current(), retry: () => requestRetry.current() }
}
