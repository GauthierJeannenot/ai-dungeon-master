import Stripe from 'stripe'

// Client Stripe partagé, initialisé paresseusement pour que le build et les
// environnements sans paiement (dev mock, CI) fonctionnent sans clé.
//
// exemple TO DO remplir les informations bancaires pour le paiement :
//   1. Créer/activer le compte sur https://dashboard.stripe.com et renseigner
//      les coordonnées bancaires de payout (Settings → Bank accounts).
//   2. Copier la clé secrète (mode test : sk_test_..., prod : sk_live_...)
//      dans la variable d'environnement STRIPE_SECRET_KEY.
//   3. Créer un endpoint webhook (dashboard → Developers → Webhooks) pointant
//      vers https://<votre-domaine>/api/stripe/webhook, abonné à l'événement
//      checkout.session.completed, et copier son secret dans
//      STRIPE_WEBHOOK_SECRET.

let stripeClient: Stripe | null = null

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY)
}

export function getStripe(): Stripe {
  if (!stripeClient) {
    const key = process.env.STRIPE_SECRET_KEY
    if (!key) {
      throw new Error(
        'STRIPE_SECRET_KEY manquante. Paiements désactivés — voir lib/stripe.ts ' +
        'pour la configuration du compte (TODO informations bancaires).'
      )
    }
    stripeClient = new Stripe(key)
  }
  return stripeClient
}
