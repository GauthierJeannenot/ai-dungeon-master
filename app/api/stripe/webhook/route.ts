import { NextRequest, NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { getStripe, isStripeConfigured } from '@/lib/stripe'
import { addPurchasedCredits } from '@/lib/credits-store'
import { logEvent } from '@/lib/server-logger'

// Webhook Stripe : crédite les tokens après paiement confirmé.
// La signature est vérifiée avec STRIPE_WEBHOOK_SECRET — ne JAMAIS créditer sur
// la seule success_url (falsifiable). Le crédit est idempotent par event.id
// (Stripe rejoue les webhooks en cas de timeout).
//
// exemple TO DO remplir les informations bancaires pour le paiement :
// créer l'endpoint webhook dans le dashboard Stripe (Developers → Webhooks),
// l'abonner à `checkout.session.completed`, puis copier son signing secret
// (whsec_...) dans la variable d'environnement STRIPE_WEBHOOK_SECRET.

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!isStripeConfigured() || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Webhook Stripe non configuré.' }, { status: 503 })
  }

  const signature = req.headers.get('stripe-signature')
  if (!signature) {
    return NextResponse.json({ error: 'Signature manquante.' }, { status: 400 })
  }

  // Corps BRUT requis pour la vérification de signature (pas de req.json()).
  const rawBody = await req.text()

  let event: Stripe.Event
  try {
    event = await getStripe().webhooks.constructEventAsync(
      rawBody,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    )
  } catch (err) {
    logEvent('warn', 'stripe.webhook.bad_signature', {
      err: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json({ error: 'Signature invalide.' }, { status: 400 })
  }

  if (event.type === 'checkout.session.completed') {
    const checkout = event.data.object
    const userId = checkout.metadata?.userId
    const tokens = Number.parseInt(checkout.metadata?.tokens ?? '', 10)

    if (!userId || !Number.isFinite(tokens) || tokens <= 0) {
      logEvent('error', 'stripe.webhook.invalid_metadata', {
        eventId: event.id,
        checkoutSessionId: checkout.id,
        metadata: checkout.metadata,
      })
      // 200 : inutile que Stripe rejoue un événement structurellement invalide.
      return NextResponse.json({ received: true, ignored: 'invalid-metadata' })
    }

    if (checkout.payment_status !== 'paid') {
      logEvent('warn', 'stripe.webhook.not_paid', {
        eventId: event.id,
        checkoutSessionId: checkout.id,
        paymentStatus: checkout.payment_status,
      })
      return NextResponse.json({ received: true, ignored: 'not-paid' })
    }

    const credits = await addPurchasedCredits(userId, tokens, {
      eventId: event.id,
      email: checkout.customer_details?.email ?? undefined,
      source: `stripe:${checkout.metadata?.packageId ?? 'unknown'}`,
    })

    logEvent('info', 'stripe.webhook.credited', {
      eventId: event.id,
      userId,
      tokens,
      balance: credits.balance,
    })
  }

  return NextResponse.json({ received: true })
}
