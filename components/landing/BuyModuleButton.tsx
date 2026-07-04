'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'

interface BuyModuleButtonProps {
  moduleId: string
  priceCents: number
  authenticated: boolean
  paymentsEnabled: boolean
}

function formatEur(cents: number): string {
  return `${(cents / 100).toFixed(2).replace('.', ',')} €`
}

// Bouton d'achat de l'accès à un module payant via Stripe Checkout. Calqué sur
// BuyTokensPanel : non connecté → connexion ; connecté → POST /api/stripe/checkout
// { moduleId } puis redirection vers l'URL Stripe.
export default function BuyModuleButton({ moduleId, priceCents, authenticated, paymentsEnabled }: BuyModuleButtonProps) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function buy() {
    if (!authenticated) {
      signIn(undefined, { callbackUrl: '/' })
      return
    }
    setError(null)
    setPending(true)
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ moduleId }),
      })
      const data = await res.json()
      if (!res.ok || !data.url) {
        throw new Error(data.error ?? `HTTP ${res.status}`)
      }
      window.location.href = data.url
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue')
      setPending(false)
    }
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={pending || (authenticated && !paymentsEnabled)}
        onClick={buy}
        className="inline-block px-4 py-2 bg-amber-800 hover:bg-amber-700 disabled:bg-stone-700 disabled:opacity-50 text-white text-sm font-semibold rounded transition-colors"
      >
        {pending
          ? 'Redirection…'
          : authenticated
            ? `Acheter — ${formatEur(priceCents)}`
            : 'Se connecter pour acheter'}
      </button>
      {authenticated && !paymentsEnabled && (
        <span className="text-[10px] text-stone-500">Paiements non configurés</span>
      )}
      {error && <span className="text-[10px] text-red-400">{error}</span>}
    </span>
  )
}
