import { NextRequest, NextResponse } from 'next/server'
import { loadSession, deleteSession } from '@/lib/session-store'
import { closeMCPClient } from '@/lib/mcp-client'
import { logEvent } from '@/lib/server-logger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Import paresseux de lib/entitlements (next-auth + next/headers). Hors runtime
// Next (tests/dev, MONETIZATION_ENABLED=false) → owner null : les parties SANS
// propriétaire restent accessibles, celles AVEC un propriétaire sont protégées
// (la comparaison `stored.ownerId !== null` déclenche le 403).
const MONETIZATION_ENABLED = process.env.MONETIZATION_ENABLED !== 'false'

async function currentOwnerId(): Promise<string | null> {
  if (!MONETIZATION_ENABLED) return null
  const { resolveEntitlement } = await import('@/lib/entitlements')
  const entitlement = await resolveEntitlement()
  return entitlement.kind === 'user'
    ? `user:${entitlement.userId}`
    : `guest:${entitlement.guestId}`
}

// GET : état d'une partie pour la REPRISE (état + historique), seulement si elle
// appartient au joueur courant. Renvoie de quoi réhydrater le client sur un
// nouvel appareil (sessionStorage vide).
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
): Promise<NextResponse> {
  try {
    const { sessionId } = await params
    const stored = await loadSession(sessionId)
    if (!stored) {
      return NextResponse.json({ error: 'Partie introuvable.' }, { status: 404 })
    }

    const ownerId = await currentOwnerId()
    if (stored.ownerId && stored.ownerId !== ownerId) {
      logEvent('warn', 'sessions.get.owner_mismatch', { sessionId, ownerId })
      return NextResponse.json({ error: 'Cette partie appartient à un autre joueur.' }, { status: 403 })
    }

    return NextResponse.json({
      sessionId: stored.sessionId,
      adventureId: stored.adventureId ?? stored.gameState?.adventureId,
      gameState: stored.gameState,
      history: stored.history,
      summaryContext: stored.summaryContext,
    })
  } catch (err) {
    logEvent('error', 'sessions.get.error', { err: err instanceof Error ? err.message : String(err) })
    return NextResponse.json({ error: 'Erreur interne du serveur' }, { status: 500 })
  }
}

// DELETE : supprime une partie du joueur courant (bouton « Supprimer » de
// « Mes parties »). Vérifie l'appartenance, puis ferme le process moteur.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
): Promise<NextResponse> {
  try {
    const { sessionId } = await params
    const stored = await loadSession(sessionId)
    if (stored?.ownerId) {
      const ownerId = await currentOwnerId()
      if (stored.ownerId !== ownerId) {
        logEvent('warn', 'sessions.delete.owner_mismatch', { sessionId, ownerId })
        return NextResponse.json({ error: 'Cette partie appartient à un autre joueur.' }, { status: 403 })
      }
    }

    await deleteSession(sessionId)
    await closeMCPClient(sessionId)
    logEvent('info', 'sessions.delete.ok', { sessionId })
    return NextResponse.json({ success: true })
  } catch (err) {
    logEvent('error', 'sessions.delete.error', { err: err instanceof Error ? err.message : String(err) })
    return NextResponse.json({ error: 'Erreur interne du serveur' }, { status: 500 })
  }
}
