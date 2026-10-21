'use client'

import { useEffect, useRef, useState } from 'react'

export function useGamePresence(sessionId: string | null, adventureId: string, characterId: string) {
  const [status, setStatus] = useState({ ready: false, message: 'Préparation du MJ…' })
  const requestReady = useRef<() => Promise<void>>(async () => { throw new Error('Session en préparation.') })

  useEffect(() => {
    if (!sessionId) return
    const clientId = crypto.randomUUID()
    let sequence = 0
    let disposed = false
    let departed = false
    let inFlight = false
    let timer: ReturnType<typeof setTimeout>
    setStatus({ ready: false, message: 'Préparation du MJ…' })
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
          setStatus({ ready: false, message: data.error || 'Connexion au MJ interrompue. Nouvelle tentative…' })
          delay = 30000
        } else {
          if (sentWake) wakeRequested = false
          ready = Boolean(data.ready)
          setStatus({ ready, message: ready ? '' : data.state === 'idle' ? 'MJ en veille. Envoie un message pour le réveiller.' : 'Préparation du MJ…' })
          delay = ready || data.state === 'idle' ? 30000 : 3000
        }
      } catch {
        if (!disposed && !departed) setStatus({ ready: false, message: 'Connexion au MJ interrompue. Nouvelle tentative…' })
      } finally {
        inFlight = false
        if (!disposed && !departed) timer = setTimeout(() => { void heartbeat() }, delay)
      }
    }

    requestReady.current = async () => {
      wakeRequested = true
      ready = false
      const deadline = Date.now() + 15 * 60 * 1000
      while (!disposed && !departed && !ready && Date.now() < deadline) {
        clearTimeout(timer)
        await heartbeat()
        if (!ready) await new Promise(resolve => setTimeout(resolve, 1000))
      }
      if (!ready) throw new Error('Le MJ ne peut pas démarrer pour le moment. Réessaie.')
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
      setStatus({ ready: false, message: 'Préparation du MJ…' })
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
      leave()
      window.removeEventListener('pagehide', leave)
      window.removeEventListener('pageshow', resume)
      document.removeEventListener('visibilitychange', wake)
    }
  }, [sessionId, adventureId, characterId])

  return { ...status, ensureReady: () => requestReady.current() }
}
