'use client'

import { useState } from 'react'
import { signIn, signOut } from 'next-auth/react'

interface AuthControlsProps {
  authenticated: boolean
  userName?: string | null
  userImage?: string | null
  balance?: number
}

// Boutons de connexion OAuth / badge de compte. Utilise les helpers client de
// NextAuth v5 — pas besoin de SessionProvider, l'état vient du serveur en props.
export default function AuthControls({ authenticated, userName, userImage, balance }: AuthControlsProps) {
  const [pending, setPending] = useState<string | null>(null)

  if (authenticated) {
    return (
      <div className="flex items-center gap-3">
        <span className="hidden sm:flex items-center gap-2 text-xs text-stone-300">
          {userImage && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={userImage} alt="" className="w-6 h-6 rounded-full border border-amber-800/60" />
          )}
          {userName}
        </span>
        {typeof balance === 'number' && (
          <span className="text-xs font-mono text-amber-300 bg-stone-800 border border-amber-900/40 px-2 py-1 rounded">
            {balance} token{balance > 1 ? 's' : ''}
          </span>
        )}
        <button
          type="button"
          onClick={() => signOut({ callbackUrl: '/' })}
          className="text-xs text-stone-400 hover:text-stone-200 border border-stone-700 hover:border-stone-500 px-2 py-1 rounded transition-colors"
        >
          Déconnexion
        </button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        disabled={pending !== null}
        onClick={() => { setPending('google'); signIn('google', { callbackUrl: '/' }) }}
        className="text-xs font-semibold text-stone-100 bg-stone-800 hover:bg-stone-700 disabled:opacity-50 border border-amber-900/40 px-3 py-1.5 rounded transition-colors"
      >
        {pending === 'google' ? '...' : 'Google'}
      </button>
      <button
        type="button"
        disabled={pending !== null}
        onClick={() => { setPending('github'); signIn('github', { callbackUrl: '/' }) }}
        className="text-xs font-semibold text-stone-100 bg-stone-800 hover:bg-stone-700 disabled:opacity-50 border border-amber-900/40 px-3 py-1.5 rounded transition-colors"
      >
        {pending === 'github' ? '...' : 'GitHub'}
      </button>
    </div>
  )
}
