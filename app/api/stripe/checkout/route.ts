import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getStripe, isStripeConfigured } from '@/lib/stripe'
import { getTokenPackage } from '@/lib/token-packages'
import { requirePurchasableModule } from '@/lib/adventures'
import { hasModuleAccess } from '@/lib/module-access'
import { logEvent } from '@/lib/server-logger'

// Crée une session Stripe Checkout, pour un pack de tokens OU pour l'accès à un
// module payant (achat unique). Réservé aux utilisateurs connectés : tokens et
// accès module sont crédités sur leur compte par le webhook
// (app/api/stripe/webhook/route.ts) après paiement confirmé.

interface CheckoutRequest {
  packageId?: string
  /** Si présent : achat de l'accès à ce module (au lieu d'un pack de tokens). */
  moduleId?: string
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

  // APP_BASE_URL d'abord : le header `origin` vient du client et ne doit pas
  // dicter les URLs de redirection en production.
  const origin = process.env.APP_BASE_URL?.trim()
    || req.headers.get('origin')
    || req.nextUrl.origin

  // ── Achat de l'accès à un module payant ────────────────────────────────────
  if (body.moduleId) {
    let module: { id: string; title: string; priceCents: number }
    try {
      module = requirePurchasableModule(body.moduleId)
    } catch {
      return NextResponse.json({ error: 'Module inconnu ou non payant.' }, { status: 400 })
    }
    if (await hasModuleAccess(session.userId, module.id)) {
      return NextResponse.json({ error: 'Module déjà débloqué sur ce compte.' }, { status: 409 })
    }

    try {
      const checkout = await getStripe().checkout.sessions.create({
        mode: 'payment',
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: 'eur',
              unit_amount: module.priceCents,
              product_data: {
                name: `Module — ${module.title}`,
                description: `Accès définitif au module « ${module.title} »`,
              },
            },
          },
        ],
        // Le webhook s'appuie sur ces metadata pour accorder le bon accès.
        metadata: {
          userId: session.userId,
          kind: 'module',
          moduleId: module.id,
        },
        customer_email: session.user?.email ?? undefined,
        success_url: `${origin}/?checkout=success`,
        cancel_url: `${origin}/?checkout=cancelled`,
      })

      logEvent('info', 'stripe.checkout.created', {
        userId: session.userId,
        kind: 'module',
        moduleId: module.id,
        amountCents: module.priceCents,
        checkoutSessionId: checkout.id,
      })

      return NextResponse.json({ url: checkout.url })
    } catch (err) {
      logEvent('error', 'stripe.checkout.error', {
        userId: session.userId,
        kind: 'module',
        moduleId: module.id,
        err: err instanceof Error ? err.message : String(err),
      })
      return NextResponse.json(
        { error: 'Impossible de créer la session de paiement.' },
        { status: 502 }
      )
    }
  }

  // ── Achat d'un pack de tokens ───────────────────────────────────────────────
  const pkg = getTokenPackage(body.packageId ?? '')
  if (!pkg) {
    return NextResponse.json({ error: 'Pack de tokens inconnu.' }, { status: 400 })
  }

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
        kind: 'tokens',
        packageId: pkg.id,
        tokens: String(pkg.tokens),
      },
      customer_email: session.user?.email ?? undefined,
      success_url: `${origin}/?checkout=success`,
      cancel_url: `${origin}/?checkout=cancelled`,
    })

    logEvent('info', 'stripe.checkout.created', {
      userId: session.userId,
      kind: 'tokens',
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
