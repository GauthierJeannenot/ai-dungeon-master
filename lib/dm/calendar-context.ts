import type { GameState } from '../types'
import { calendarProjection } from '../calendar-state'
export function calendarContext(state:GameState){
 if(!state.dmTools?.calendar)return''
 return`---\n## CALENDRIER EXPLICITE DU MJ — PROJECTION DU TEMPS MOTEUR\n${JSON.stringify(calendarProjection(state))}\nDate et références seules : aucun événement, cycle astronomique, météo, recharge, repos ou conséquence ne se déclenche automatiquement. Ne réinitialise pas le temps ni les calendarDay déjà choisis pour le travail.\n\n`
}
