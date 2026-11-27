import type { GameState } from '../types'
import { projectDays,downtimeDelayed,workOutcome } from '../downtime-state'
export function downtimeContext(state:GameState){
 const d=state.dmTools?.downtime;if(!d)return''
 return`---\n## XGE WORK EXPLICITEMENT ADOPTÉ — HISTOIRE MOTEUR AUTORITAIRE\n${JSON.stringify(Object.values(d.projects).map(p=>({projectId:p.input.projectId,status:p.status,qualifiedDays:projectDays(p),delayPending:downtimeDelayed(p,state.worldTimeSeconds??0),outcome:p.resolution?workOutcome(p):null,settled:Boolean(p.settlement)})))}\nAucun jour par attente/calendrier, récompense avant vraie résolution/complications ou cash de valeur lifestyle. Couverture7jours non monétaire datée : pas de nourriture/soin/repos ni consommation de dépenses rétroactive. Arbitrages MJ explicites, pas de relance/réinitialisation.\n\n`
}
