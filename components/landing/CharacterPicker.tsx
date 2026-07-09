'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { listCharacters, DEFAULT_CHARACTER_ID } from '@/lib/character-registry'
import { characterSheetFromTemplate } from '@/lib/character-sheet-view'
import CharacterSheet from '@/components/CharacterSheet'

// Sélecteur de personnage prétiré sur la carte d'une aventure. Le choix est
// ajouté au lien de jeu (?character=<id>) ; défaut = guerrier (le lien sans
// paramètre reste valide côté page de jeu). Le survol d'une classe affiche un
// aperçu détaillé (popover) de sa fiche ; au tactile (pas de hover), le clic
// fait office de toggle. Voir docs/playable-characters.md.
export default function CharacterPicker({ playPath }: { playPath: string }) {
  const characters = listCharacters()
  const [selected, setSelected] = useState<string>(DEFAULT_CHARACTER_ID)
  // Aperçu affiché : la fiche du personnage survolé/sélectionné (indépendant
  // de la sélection courante). null = aucun aperçu → pas de popover.
  const [previewed, setPreviewed] = useState<string | null>(null)
  const active = characters.find(c => c.id === selected) ?? characters[0]
  const previewChar = previewed ? characters.find(c => c.id === previewed) : undefined
  const href = `${playPath}&character=${selected}`
  const wrapperRef = useRef<HTMLDivElement>(null)

  function handleSelect(id: string) {
    setSelected(id)
    // Toggle au clic : reclique sur la classe déjà prévisualisée → ferme le
    // popover (comportement prévisible au doigt, sans dépendre du hover).
    setPreviewed(prev => (prev === id ? null : id))
  }

  useEffect(() => {
    if (!previewed) return

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setPreviewed(null)
    }
    function onPointerDown(e: PointerEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setPreviewed(null)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [previewed])

  return (
    <div className="w-full flex flex-col gap-2">
      <span className="text-[10px] uppercase tracking-wider text-stone-500">Personnage</span>
      <div ref={wrapperRef} className="relative" onMouseLeave={() => setPreviewed(null)}>
        <div className="flex flex-wrap gap-1.5">
          {characters.map(c => {
            const isActive = c.id === selected
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => handleSelect(c.id)}
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
            onMouseLeave du parent (elle en est un descendant). Fermeture :
            bouton ×, Échap, ou tap/clic en dehors (voir l'effet ci-dessus). */}
        {previewChar && (
          <div className="absolute bottom-full left-0 right-0 pb-2 z-50">
            <div className="relative rounded-lg border border-amber-800/60 bg-stone-900/98 pt-3 pr-9 pb-3 pl-3 shadow-2xl max-h-[22rem] overflow-y-auto overscroll-contain">
              <button
                type="button"
                onClick={() => setPreviewed(null)}
                aria-label="Fermer l'aperçu"
                className="absolute top-2 right-2 z-10 flex h-7 w-7 items-center justify-center rounded text-stone-400 hover:text-stone-100 hover:bg-stone-800 transition-colors"
              >
                <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className="h-4 w-4">
                  <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
                </svg>
              </button>
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
