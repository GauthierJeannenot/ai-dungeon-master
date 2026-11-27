import type { GameState } from '../types'
import { renownSummary } from '../renown-state'
export function renownContext(state:GameState){
 const data=state.dmTools?.renown;if(!data)return''
 const organizations=Object.values(data.organizations).map(o=>({organizationId:o.input.organizationId,name:o.input.name,...renownSummary(state,o.input.organizationId),ranks:o.input.ranks}))
 return`---\n## RENOWN OPTIONNEL ADOPTÉ — APPARTENANCES DÉJÀ ÉTABLIES (MJ)\n${JSON.stringify(organizations)}\nDépart0 et événements réels distincts ; même occurrence dans la même organisation jamais recomptée par nouveau nonce. Rang/avantages/attitudes ne découlent pas automatiquement du score. Cette tranche exclut le suivi avant adhésion, dont l'exemple DMG d'adhésion à1point.\n\n`
}
