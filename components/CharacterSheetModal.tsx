'use client'

import { useEffect } from 'react'
import type { PlayerState } from '@/lib/types'
import { characterSheetFromPlayerState } from '@/lib/character-sheet-view'
import CharacterSheet from './CharacterSheet'

// Modale « fiche de personnage » ouverte en jeu (clic sur le pion joueur ou son
// tooltip, voir components/Battlemap.tsx). État live autoritaire : lit
// directement le PlayerState courant. Rendue en position `fixed` → échappe à
// l'overflow-hidden de la battlemap. Fermeture : Échap, croix, ou clic hors carte.
export default function CharacterSheetModal({
  player,
  open,
  onClose,
}: {
  player: PlayerState
  open: boolean
  onClose: () => void
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const data = characterSheetFromPlayerState(player)

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start sm:items-center justify-center bg-black/70 p-3 sm:p-6 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label={`Fiche de ${data.name}`}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg my-auto rounded-xl border border-amber-800/50 bg-stone-900 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer la fiche"
          className="absolute top-2.5 right-2.5 z-10 flex h-7 w-7 items-center justify-center rounded text-stone-400 hover:text-stone-100 hover:bg-stone-800 transition-colors"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className="h-4 w-4">
            <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
          </svg>
        </button>
        <div className="max-h-[85vh] overflow-y-auto p-4 sm:p-5">
          <CharacterSheet data={data} variant="full" />
        </div>
      </div>
    </div>
  )
}
