'use client'

import { useState } from 'react'
import Link from 'next/link'
import { listCharacters, DEFAULT_CHARACTER_ID } from '@/lib/character-registry'
import { characterSheetFromTemplate } from '@/lib/character-sheet-view'
import CharacterSheet from '@/components/CharacterSheet'

// Sélecteur de personnage prétiré sur la carte d'une aventure. Le choix est
// ajouté au lien de jeu (?character=<id>) ; défaut = guerrier (le lien sans
// paramètre reste valide côté page de jeu). Le survol d'une classe affiche un
// aperçu détaillé (popover) de sa fiche. Voir docs/playable-characters.md.
export default function CharacterPicker({ playPath }: { playPath: string }) {
  const characters = listCharacters()
  const [selected, setSelected] = useState<string>(DEFAULT_CHARACTER_ID)
  // Aperçu au survol : la fiche du personnage survolé (indépendant de la
  // sélection). null = aucun survol → pas de popover.
  const [previewed, setPreviewed] = useState<string | null>(null)
  const active = characters.find(c => c.id === selected) ?? characters[0]
  const previewChar = previewed ? characters.find(c => c.id === previewed) : undefined
  const href = `${playPath}&character=${selected}`

  return (
    <div className="w-full flex flex-col gap-2">
      <span className="text-[10px] uppercase tracking-wider text-stone-500">Personnage</span>
      <div className="relative" onMouseLeave={() => setPreviewed(null)}>
        <div className="flex flex-wrap gap-1.5">
          {characters.map(c => {
            const isActive = c.id === selected
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelected(c.id)}
                onMouseEnter={() => setPreviewed(c.id)}
                onFocus={() => setPreviewed(c.id)}
                aria-pressed={isActive}
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

        {/* Popover d'aperçu détaillé (au-dessus des boutons). Interactif et
            scrollable : le `pb-2` sert d'espacement visuel SANS créer de zone
            morte entre les boutons et la carte (survol continu → pas de
            fermeture au passage). Le survol de la carte ne déclenche pas le
            onMouseLeave du parent (elle en est un descendant). */}
        {previewChar && (
          <div className="absolute bottom-full left-0 right-0 pb-2 z-50">
            <div className="rounded-lg border border-amber-800/60 bg-stone-900/98 p-3 shadow-2xl max-h-[22rem] overflow-y-auto overscroll-contain">
              <CharacterSheet data={characterSheetFromTemplate(previewChar)} variant="compact" />
            </div>
          </div>
        )}
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
