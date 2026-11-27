import type { GameState } from '../types'
import { lightObjectPosition,lightObjectCoverage } from '../light-spell-state'
export function localLightSpellContext(state:GameState){
 const d=state.dmTools?.lightSpell;if(!d)return''
 const objects=Object.entries(d.objects).filter(([id])=>lightObjectPosition(state,id)?.mapId===state.currentMapId&&lightObjectPosition(state,id)?.roomId===state.currentRoomId).slice(-16).map(([objectId,r])=>({objectId,dimensionsFeet:r.input.dimensionsFeet,coverage:lightObjectCoverage(state,objectId),actualPosition:lightObjectPosition(state,objectId)}))
 const active=Object.values(d.casts).filter(c=>c.status==='resolved'&&c.expiresAt!>(state.worldTimeSeconds??0)&&lightObjectPosition(state,c.selection.objectId)?.mapId===state.currentMapId).slice(-8).map(c=>({effectId:c.effectId,casterId:c.casterId,objectId:c.selection.objectId,...c.selection.color!==undefined?{color:c.selection.color}:{},expiresAt:c.expiresAt}))
 return objects.length||active.length?`\n## LUMIÈRE SUR OBJETS PHYSIQUES — RÉFÉRENCE MJ\n${JSON.stringify({objects,active})}\nLight exige lightObject.objectId, vraies dimensions≤10ft et toucher ; aucun repli lanceur/point/inventaire. Couvrir opaque bloque les vrais rayons sans pause/reset ; le coût de manipulation est une décision MJ explicite. Dismissal = action. Nouveau cast invalide tout ancien Light/Ready du lanceur, jamais réincantation au relâchement. Aucun porteur hostile/DEX simulé.\n`:''
}
