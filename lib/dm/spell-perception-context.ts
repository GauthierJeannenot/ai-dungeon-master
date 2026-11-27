import type { GameState } from '../types'
import { spellPerceptionView } from '../spell-perception-state'
export function localSpellPerceptionContext(state:GameState):string{
 const events=Object.values(state.dmTools?.spellPerception?.records??{}).filter(r=>r.original.mapId===state.currentMapId&&r.original.roomId===state.currentRoomId).slice(-8).map(r=>({eventId:r.original.id,privateTechnicalSource:{casterId:r.original.casterId,spellId:r.original.spellId,phase:r.phase},observerViews:r.original.observers.map(o=>spellPerceptionView(r,o.selection.observerId))}))
 return events.length?`---
## INCANTATIONS — SOURCE TECHNIQUE CONFIDENTIELLE MJ
${JSON.stringify(events)}
La source technique et sa phase ne sont pas des connaissances acquises. Seules les vues originales indiquent ce que chaque observateur a effectivement percu ; aucun nom/niveau/cible cachee ou succes tardif ne decoule de cette perception.

`:''
}
