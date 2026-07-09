'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'

interface SessionSummary {
  sessionId: string
  adventureId?: string
  adventureTitle: string
  updatedAt: string
  phase: string
  playerHp: { current: number; max: number }
  currentRoomId: string | null
  turnCount: number
  playPath: string | null
  available: boolean
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const min = Math.round(diffMs / 60000)
  if (min < 1) return "à l'instant"
  if (min < 60) return `il y a ${min} min`
  const h = Math.round(min / 60)
  if (h < 24) return `il y a ${h} h`
  const d = Math.round(h / 24)
  return `il y a ${d} j`
}

function phaseLabel(phase: string): string {
  if (phase === 'combat') return 'Combat'
  if (phase === 'dialogue') return 'Dialogue'
  return 'Exploration'
}

// « Mes parties » : liste les parties en cours du joueur (reprise multi-appareils
// pour les comptes, même-navigateur pour les invités). N'affiche rien s'il n'y a
// aucune partie.
export default function MyGamesPanel() {
  const [sessions, setSessions] = useState<SessionSummary[] | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)

  const load = useCallback(() => {
    fetch('/api/sessions')
      .then(res => (res.ok ? res.json() : null))
      .then(data => setSessions(data?.sessions ?? []))
      .catch(() => setSessions([]))
  }, [])

  useEffect(() => { load() }, [load])

  const remove = useCallback(async (sessionId: string) => {
    setDeleting(sessionId)
    try {
      const res = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}`, { method: 'DELETE' })
      if (res.ok) setSessions(prev => (prev ?? []).filter(s => s.sessionId !== sessionId))
    } finally {
      setDeleting(null)
    }
  }, [])

  if (!sessions || sessions.length === 0) return null

  return (
    <section className="pb-14">
      <h2 className="text-xl font-bold text-stone-200 mb-1">Mes parties en cours</h2>
      <p className="text-sm text-stone-500 mb-6">Reprenez là où vous vous êtes arrêté.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {sessions.map(session => (
          <div
            key={session.sessionId}
            className="flex items-center gap-3 rounded-lg border border-stone-800 bg-stone-900/70 p-4"
          >
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-stone-100 truncate">{session.adventureTitle}</div>
              <div className="text-xs text-stone-400 mt-0.5">
                {phaseLabel(session.phase)} · {session.turnCount} tour{session.turnCount > 1 ? 's' : ''} ·
                {' '}HP {session.playerHp.current}/{session.playerHp.max} · {timeAgo(session.updatedAt)}
              </div>
            </div>
            {session.available && session.playPath ? (
              <Link
                href={session.playPath}
                className="flex-shrink-0 px-3 py-1.5 bg-amber-800 hover:bg-amber-700 text-white text-sm font-semibold rounded transition-colors"
              >
                Reprendre
              </Link>
            ) : (
              <span className="flex-shrink-0 text-xs text-stone-400">indisponible</span>
            )}
            <button
              type="button"
              onClick={() => remove(session.sessionId)}
              disabled={deleting === session.sessionId}
              title="Supprimer cette partie"
              aria-label="Supprimer cette partie"
              className="flex-shrink-0 text-stone-500 hover:text-red-400 disabled:opacity-40 px-2 py-1 text-lg leading-none transition-colors"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </section>
  )
}
