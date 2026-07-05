'use client'

import { useState } from 'react'
import Link from 'next/link'
import { listCharacters, DEFAULT_CHARACTER_ID } from '@/lib/character-registry'

// Sélecteur de personnage prétiré sur la carte d'une aventure. Le choix est
// ajouté au lien de jeu (?character=<id>) ; défaut = guerrier (le lien sans
// paramètre reste valide côté page de jeu). Voir docs/playable-characters.md.
export default function CharacterPicker({ playPath }: { playPath: string }) {
  const characters = listCharacters()
  const [selected, setSelected] = useState<string>(DEFAULT_CHARACTER_ID)
  const active = characters.find(c => c.id === selected) ?? characters[0]
  const href = `${playPath}&character=${selected}`

  return (
    <div className="w-full flex flex-col gap-2">
      <span className="text-[10px] uppercase tracking-wider text-stone-500">Personnage</span>
      <div className="flex flex-wrap gap-1.5">
        {characters.map(c => {
          const isActive = c.id === selected
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => setSelected(c.id)}
              aria-pressed={isActive}
              title={c.tagline}
              className={`px-2.5 py-1 rounded text-xs font-semibold border transition-colors ${
                isActive
                  ? 'bg-amber-800 border-amber-600 text-white'
                  : 'bg-stone-800/60 border-stone-700 text-stone-300 hover:border-stone-500'
              }`}
            >
              {c.class}
            </button>
          )
        })}
      </div>
      <p className="text-[11px] text-stone-500 italic min-h-[1.5em]">{active?.tagline}</p>
      <Link
        href={href}
        className="inline-block text-center px-4 py-2 bg-amber-800 hover:bg-amber-700 text-white text-sm font-semibold rounded transition-colors"
      >
        Démarrer avec {active?.class}
      </Link>
    </div>
  )
}
