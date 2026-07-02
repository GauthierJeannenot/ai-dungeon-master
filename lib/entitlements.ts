import { cookies } from 'next/headers'
import { auth } from './auth'
import {
  GUEST_MESSAGE_LIMIT,
  ensureSignupBonus,
  getGuestUsage,
} from './credits-store'

// Détermine « qui joue » et ce qu'il a le droit de consommer.
//   - Utilisateur connecté (NextAuth) → solde de tokens achetés/offerts.
//   - Anonyme → quota de GUEST_MESSAGE_LIMIT messages gratuits, suivi côté
//     serveur par un cookie httpOnly d'identifiant invité.
//
// Next 16 : cookies() est asynchrone et mutable uniquement dans les Route
// Handlers / Server Actions — getOrCreateGuestId ne doit être appelé que là.

export const GUEST_COOKIE_NAME = 'adm_guest_id'
const GUEST_COOKIE_MAX_AGE_S = 60 * 60 * 24 * 365

export interface UserEntitlement {
  kind: 'user'
  userId: string
  email?: string | null
  name?: string | null
  image?: string | null
  balance: number
}

export interface GuestEntitlement {
  kind: 'guest'
  guestId: string
  remaining: number
  limit: number
}

export type Entitlement = UserEntitlement | GuestEntitlement

export async function getOrCreateGuestId(): Promise<string> {
  const store = await cookies()
  const existing = store.get(GUEST_COOKIE_NAME)?.value
  if (existing && /^[a-zA-Z0-9-]{8,64}$/.test(existing)) return existing

  const guestId = crypto.randomUUID()
  store.set(GUEST_COOKIE_NAME, guestId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: GUEST_COOKIE_MAX_AGE_S,
    path: '/',
  })
  return guestId
}

// Résout l'entitlement courant. Crédite le bonus de bienvenue au premier accès
// d'un utilisateur connecté.
export async function resolveEntitlement(): Promise<Entitlement> {
  const session = await auth()

  if (session?.userId) {
    const credits = await ensureSignupBonus(session.userId, session.user?.email ?? undefined)
    return {
      kind: 'user',
      userId: session.userId,
      email: session.user?.email,
      name: session.user?.name,
      image: session.user?.image,
      balance: credits.balance,
    }
  }

  const guestId = await getOrCreateGuestId()
  const usage = await getGuestUsage(guestId)
  return {
    kind: 'guest',
    guestId,
    remaining: Math.max(0, GUEST_MESSAGE_LIMIT - usage.messagesUsed),
    limit: GUEST_MESSAGE_LIMIT,
  }
}
