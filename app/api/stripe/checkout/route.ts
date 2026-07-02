import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getStripe, isStripeConfigured } from '@/lib/stripe'
import { getTokenPackage } from '@/lib/token-packages'
import { logEvent } from '@/lib/server-logger'

// Crée une session Stripe Checkout pour un pack de tokens.
// Réservé aux utilisateurs connectés : les tokens sont crédités sur leur compte
// par le webhook (app/api/stripe/webhook/route.ts) après paiement confirmé.

interface CheckoutRequest {
  packageId?: string
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await auth()
  if (!session?.userId) {
    return NextResponse.json(
      { error: 'Connexion requise pour acheter des tokens.' },
      { status: 401 }
    )
  }

  if (!isStripeConfigured()) {
    // exemple TO DO remplir les informations bancaires pour le paiement :
    // définir STRIPE_SECRET_KEY (et STRIPE_WEBHOOK_SECRET) dans l'environnement
    // de l'hébergeur pour activer cette route. Voir lib/stripe.ts.
    return NextResponse.json(
      { error: 'Paiements non configurés sur ce déploiement.' },
      { status: 503 }
    )
  }

  const body = await req.json().catch(() => ({})) as CheckoutRequest
  const pkg = getTokenPackage(body.packageId ?? '')
  if (!pkg) {
    return NextResponse.json({ error: 'Pack de tokens inconnu.' }, { status: 400 })
  }

  // APP_BASE_URL d'abord : le header `origin` vient du client et ne doit pas
  // dicter les URLs de redirection en production.
  const origin = process.env.APP_BASE_URL?.trim()
    || req.headers.get('origin')
    || req.nextUrl.origin

  try {
    const checkout = await getStripe().checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'eur',
            unit_amount: pkg.amountCents,
            product_data: {
              name: `${pkg.name} — ${pkg.tokens} tokens`,
              description: `${pkg.tokens} messages au Dungeon Master IA`,
            },
          },
        },
      ],
      // Le webhook s'appuie sur ces metadata pour créditer le bon compte.
      metadata: {
        userId: session.userId,
        packageId: pkg.id,
        tokens: String(pkg.tokens),
      },
      customer_email: session.user?.email ?? undefined,
      success_url: `${origin}/?checkout=success`,
      cancel_url: `${origin}/?checkout=cancelled`,
    })

    logEvent('info', 'stripe.checkout.created', {
      userId: session.userId,
      packageId: pkg.id,
      tokens: pkg.tokens,
      amountCents: pkg.amountCents,
      checkoutSessionId: checkout.id,
    })

    return NextResponse.json({ url: checkout.url })
  } catch (err) {
    logEvent('error', 'stripe.checkout.error', {
      userId: session.userId,
      packageId: pkg.id,
      err: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json(
      { error: 'Impossible de créer la session de paiement.' },
      { status: 502 }
    )
  }
}
