import { NextResponse } from 'next/server'
import { getRunpodConfig } from '@/lib/runpod-config'
import { getRunpodLifecycle } from '@/lib/runpod-lifecycle'
import { loadSession } from '@/lib/session-store'
import { requireAvailableAdventure } from '@/lib/adventures'
import { isKnownCharacterId, DEFAULT_CHARACTER_ID } from '@/lib/character-registry'
import { DEFAULT_ADVENTURE_ID } from '@/lib/adventure-map'
import { checkRateLimit, clientIpFromHeaders } from '@/lib/rate-limit'
import { logEvent } from '@/lib/server-logger'

export const runtime = 'nodejs'
const MONETIZATION_ENABLED = process.env.MONETIZATION_ENABLED !== 'false'
function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
}

// Une présence ne consomme pas de crédit et ne crée/mute pas une partie. Les
// contrôles d'accès précèdent toute mise en route de capacité payante.
export async function POST(req: Request) {
  try {
    if (!getRunpodConfig()) return json({ enabled: false, ready: true, state: 'ready' })
    const origin = req.headers.get('origin')
    if (origin && origin !== new URL(req.url).origin) return json({ error: 'Origine refusée.' }, 403)
    if (!req.headers.get('content-type')?.startsWith('application/json')) return json({ error: 'JSON requis.' }, 415)
    const limit = checkRateLimit(`presence:${clientIpFromHeaders(req.headers)}`, 60)
    if (!limit.ok) return json({ error: 'Trop de requêtes de présence.' }, 429)
    const text = await req.text()
    if (text.length > 2000) return json({ error: 'Présence trop volumineuse.' }, 413)
    let body: unknown
    try { body = JSON.parse(text) } catch { return json({ error: 'JSON invalide.' }, 400) }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ error: 'Présence invalide.' }, 400)
    const { clientId, sessionId, adventureId, characterId, sequence, present, wake } = body as Record<string, unknown>
    if (typeof clientId !== 'string' || !/^[a-zA-Z0-9-]{16,80}$/.test(clientId)
      || typeof sessionId !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(sessionId)
      || typeof adventureId !== 'string' || !isKnownCharacterId(typeof characterId === 'string' ? characterId : undefined)
      || !Number.isSafeInteger(sequence) || (sequence as number) < 1 || typeof present !== 'boolean'
      || (wake !== undefined && typeof wake !== 'boolean')) {
      return json({ error: 'Présence invalide.' }, 400)
    }
    let ownerId = 'local'
    let userId: string | undefined
    let canPlay = true
    if (MONETIZATION_ENABLED) {
      const { resolveEntitlement } = await import('@/lib/entitlements')
      const entitlement = await resolveEntitlement()
      ownerId = entitlement.kind === 'user' ? `user:${entitlement.userId}` : `guest:${entitlement.guestId}`
      userId = entitlement.kind === 'user' ? entitlement.userId : undefined
      canPlay = entitlement.kind === 'user' ? entitlement.balance > 0 : entitlement.remaining > 0
    }
    const stored = await loadSession(sessionId)
    if (stored?.ownerId && stored.ownerId !== ownerId) return json({ error: 'Cette partie appartient à un autre joueur.' }, 403)
    if (stored && ((stored.adventureId ?? stored.gameState.adventureId ?? DEFAULT_ADVENTURE_ID) !== adventureId
      || (stored.characterId ?? stored.gameState.characterId ?? DEFAULT_CHARACTER_ID) !== characterId)) {
      return json({ error: 'La présence ne correspond pas à cette partie.' }, 409)
    }
    const key = `${ownerId}:${clientId}`
    const lifecycle = getRunpodLifecycle()!
    if (!present) {
      // Le départ doit fonctionner aussi lorsque le dernier crédit a été utilisé.
      await lifecycle.presence(key, sequence as number, false)
      return json(lifecycle.status())
    }
    if (!canPlay) {
      await lifecycle.presence(key, sequence as number, false)
      return json({ error: 'Plus de messages disponibles pour jouer.' }, 402)
    }
    let adventure
    try { adventure = requireAvailableAdventure(adventureId) } catch { return json({ error: 'Aventure indisponible.' }, 403) }
    if (MONETIZATION_ENABLED && adventure.requiresEntitlement) {
      const { hasModuleAccess } = await import('@/lib/module-access')
      if (!userId || !(await hasModuleAccess(userId, adventureId))) return json({ error: 'Accès à cette aventure requis.' }, 403)
    }
    await lifecycle.presence(key, sequence as number, true, wake === true)
    return json(lifecycle.status())
  } catch (err) {
    logEvent('warn', 'game_presence.failed', { err: err instanceof Error ? err.message : 'Erreur de présence' })
    return json({ error: 'Le MJ est momentanément indisponible. Nouvelle tentative automatique.' }, 503)
  }
}
