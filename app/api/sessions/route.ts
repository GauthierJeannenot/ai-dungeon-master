import { NextResponse } from 'next/server'
import { listSessionsByOwner } from '@/lib/session-store'
import { getAdventure } from '@/lib/adventures'
import { logEvent } from '@/lib/server-logger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Import paresseux de lib/entitlements (tire next-auth + next/headers, présents
// seulement dans le runtime Next). MONETIZATION_ENABLED=false (tests/dev) →
// pas de propriétaire courant → pas de parties listées.
const MONETIZATION_ENABLED = process.env.MONETIZATION_ENABLED !== 'false'

async function currentOwnerId(): Promise<string | null> {
  if (!MONETIZATION_ENABLED) return null
  const { resolveEntitlement } = await import('@/lib/entitlements')
  const entitlement = await resolveEntitlement()
  return entitlement.kind === 'user'
    ? `user:${entitlement.userId}`
    : `guest:${entitlement.guestId}`
}

// Liste les parties en cours du joueur courant (« Mes parties »).
// Connecté → parties de son compte (multi-appareils). Invité → parties liées à
// son cookie invité (même navigateur). Chaque partie est enrichie du titre du
// module pour l'affichage.
export async function GET(): Promise<NextResponse> {
  try {
    const ownerId = await currentOwnerId()
    if (!ownerId) {
      return NextResponse.json({ authenticated: false, sessions: [] })
    }

    const summaries = await listSessionsByOwner(ownerId)
    const sessions = summaries.map(summary => {
      const adventure = getAdventure(summary.adventureId)
      return {
        ...summary,
        adventureTitle: adventure?.title ?? 'Aventure',
        playPath: adventure
          ? `${adventure.playPath ?? '/game'}${adventure.playPath?.includes('?') ? '&' : '?'}session=${encodeURIComponent(summary.sessionId)}`
          : null,
        available: adventure?.available ?? false,
      }
    })

    return NextResponse.json({
      authenticated: ownerId.startsWith('user:'),
      sessions,
    })
  } catch (err) {
    logEvent('error', 'sessions.list.error', { err: err instanceof Error ? err.message : String(err) })
    return NextResponse.json({ error: 'Erreur interne du serveur' }, { status: 500 })
  }
}
