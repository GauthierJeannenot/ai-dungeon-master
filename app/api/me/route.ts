import { NextResponse } from 'next/server'
import { resolveEntitlement } from '@/lib/entitlements'
import { isStripeConfigured } from '@/lib/stripe'
import { TOKEN_PACKAGES } from '@/lib/token-packages'
import { logEvent } from '@/lib/server-logger'

// État du compte pour le client : identité, solde de tokens ou quota invité,
// et packs disponibles à l'achat.

export async function GET(): Promise<NextResponse> {
  try {
    const entitlement = await resolveEntitlement()

    if (entitlement.kind === 'user') {
      return NextResponse.json({
        authenticated: true,
        user: {
          name: entitlement.name ?? null,
          email: entitlement.email ?? null,
          image: entitlement.image ?? null,
        },
        balance: entitlement.balance,
        packages: TOKEN_PACKAGES,
        paymentsEnabled: isStripeConfigured(),
      })
    }

    return NextResponse.json({
      authenticated: false,
      guest: {
        remaining: entitlement.remaining,
        limit: entitlement.limit,
      },
      packages: TOKEN_PACKAGES,
      paymentsEnabled: isStripeConfigured(),
    })
  } catch (err) {
    logEvent('error', 'me.error', { err: err instanceof Error ? err.message : String(err) })
    return NextResponse.json({ error: 'Erreur interne du serveur' }, { status: 500 })
  }
}
