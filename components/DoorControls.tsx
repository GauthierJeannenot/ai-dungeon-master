'use client'

import type { GameState } from '@/lib/types'
import { roomDoorActions } from '@/lib/door-navigation'

export default function DoorControls({ gameState, disabled, onAction }: {
  gameState: GameState; disabled: boolean; onAction: (message: string) => void
}) {
  const actions = roomDoorActions(gameState)
  if (!actions.length) return null
  return <nav aria-label="Accès et escaliers de la pièce" className="flex flex-wrap gap-2 border-t border-stone-700 bg-stone-950 p-2 max-h-36 overflow-y-auto">
    {actions.map(action => <button key={action.id} type="button" disabled={disabled}
      onClick={() => onAction(action.message)}
      className="rounded border border-amber-800/60 bg-stone-900 px-3 py-2 text-left text-xs text-amber-100 hover:bg-stone-800 focus-visible:outline-2 focus-visible:outline-amber-200 disabled:opacity-40">
      {action.label}
    </button>)}
  </nav>
}
