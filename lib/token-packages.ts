// Packs de tokens vendus via Stripe Checkout. Un token = un message envoyé au DM.
//
// Les prix sont définis ici en `price_data` inline : aucun produit à créer dans
// le dashboard Stripe. Montants en centimes d'euro.
//
// exemple TO DO remplir les informations bancaires pour le paiement :
// les coordonnées bancaires de réception des fonds (compte de payout) se
// configurent dans le dashboard Stripe → Settings → Bank accounts and currencies.
// Rien à coder ici : renseigner STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET dans
// l'environnement une fois le compte Stripe activé.

export interface TokenPackage {
  id: string
  name: string
  tokens: number
  /** Prix en centimes (EUR). */
  amountCents: number
  highlight?: boolean
}

export const TOKEN_PACKAGES: TokenPackage[] = [
  { id: 'pack-apprenti', name: "Pack Apprenti", tokens: 50, amountCents: 299 },
  { id: 'pack-aventurier', name: 'Pack Aventurier', tokens: 200, amountCents: 899, highlight: true },
  { id: 'pack-heros', name: 'Pack Héros', tokens: 600, amountCents: 2499 },
]

export function getTokenPackage(id: string): TokenPackage | null {
  return TOKEN_PACKAGES.find(pkg => pkg.id === id) ?? null
}
