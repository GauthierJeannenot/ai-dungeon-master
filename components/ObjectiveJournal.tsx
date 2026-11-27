import type { GameState } from '@/lib/types'
import { knownObjectives } from '@/lib/objective-journal'

export default function ObjectiveJournal({gameState}:{gameState:GameState}) {
  const objectives=knownObjectives(gameState)
  if(!objectives.length)return null
  return <details className="flex-shrink-0 rounded-lg border border-amber-900/30 bg-stone-900 text-sm text-stone-200">
    <summary className="cursor-pointer px-3 py-2">Objectifs connus · {objectives.length}</summary>
    <div className="max-h-48 overflow-y-auto px-3 pb-3">
      <p className="mb-2 text-xs text-stone-400">Proposés au fil des conversations. Tu choisis de les poursuivre.</p>
      <ul className="space-y-2">{objectives.map(objective=><li key={objective.id}>
        <div>{objective.label}</div>
        <div className="text-xs text-stone-400">{objective.npcName} · {objective.done?'Conditions remplies':objective.archived?'Acte terminé':'À faire'}</div>
      </li>)}</ul>
    </div>
  </details>
}
