'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'
import type { TokenPackage } from '@/lib/token-packages'

interface BuyTokensPanelProps {
  authenticated: boolean
  paymentsEnabled: boolean
  packages: TokenPackage[]
}

function formatEur(cents: number): string {
  return `${(cents / 100).toFixed(2).replace('.', ',')} €`
}

// Panneau d'achat de packs de tokens via Stripe Checkout.
export default function BuyTokensPanel({ authenticated, paymentsEnabled, packages }: BuyTokensPanelProps) {
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function buy(packageId: string) {
    if (!authenticated) {
      signIn(undefined, { callbackUrl: '/' })
      return
    }
    setError(null)
    setPendingId(packageId)
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packageId }),
      })
      const data = await res.json()
      if (!res.ok || !data.url) {
        throw new Error(data.error ?? `HTTP ${res.status}`)
      }
      window.location.href = data.url
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue')
      setPendingId(null)
    }
  }

  return (
    <div>
      <div className="grid gap-4 sm:grid-cols-3">
        {packages.map(pkg => (
          <div
            key={pkg.id}
            className={`relative rounded-lg border p-5 bg-stone-900/70 flex flex-col gap-2 ${
              pkg.highlight ? 'border-amber-600/70 shadow-lg shadow-amber-950/40' : 'border-stone-800'
            }`}
          >
            {pkg.highlight && (
              <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-[10px] uppercase tracking-wider bg-amber-700 text-amber-50 px-2 py-0.5 rounded">
                Populaire
              </span>
            )}
            <div className="text-amber-400 font-bold">{pkg.name}</div>
            <div className="text-3xl font-bold text-stone-100">
              {pkg.tokens}
              <span className="text-sm font-normal text-stone-400"> messages</span>
            </div>
            <div className="text-stone-300 font-mono">{formatEur(pkg.amountCents)}</div>
            <button
              type="button"
              disabled={pendingId !== null || (authenticated && !paymentsEnabled)}
              onClick={() => buy(pkg.id)}
              className="mt-2 text-sm font-semibold bg-amber-800 hover:bg-amber-700 disabled:bg-stone-700 disabled:opacity-50 text-white px-3 py-2 rounded transition-colors"
            >
              {pendingId === pkg.id ? 'Redirection…' : authenticated ? 'Acheter' : 'Se connecter pour acheter'}
            </button>
          </div>
        ))}
      </div>
      {authenticated && !paymentsEnabled && (
        <p className="mt-3 text-xs text-stone-500">
          Paiements non configurés sur ce déploiement (STRIPE_SECRET_KEY manquante).
        </p>
      )}
      {error && <p className="mt-3 text-xs text-red-400">{error}</p>}
    </div>
  )
}
