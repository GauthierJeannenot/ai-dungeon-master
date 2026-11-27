import type { GameState } from '../types'
import { adamantineItemWitness } from '../adamantine-state'
export function localAdamantineContext(state:GameState):string{
 const owned=state.player.inventory.filter(i=>adamantineItemWitness(state,i)).map(i=>({itemId:i.id,quantity:i.quantity??1,ammunitionType:i.ammunitionType,material:i.adamantine}))
 const ground=Object.values(state.droppedItems??{}).filter(d=>d.mapId===state.currentMapId&&d.roomId===state.currentRoomId&&adamantineItemWitness(state,d.item)).map(d=>({itemId:d.item.id,quantity:d.item.quantity??1,cell:d.position,material:d.item.adamantine})).slice(0,24)
 const stock=Object.values(state.dmTools?.merchants?.stocks??{}).filter(s=>s.status==='available'&&(s.item.adamantine||s.initialLauncher)).filter(s=>{const n=state.npcs?.[s.merchantId];return n?.visible&&n.mapId===state.currentMapId&&n.roomId===state.currentRoomId}).map(s=>({itemId:s.item.id,merchantId:s.merchantId,quantity:s.item.quantity??1,material:s.item.adamantine,ordinaryLauncher:s.initialLauncher?.input.weaponId,priceCp:s.item.adamantine?state.dmTools?.adamantine?.origins[s.item.adamantine.originEventId]?.fullPriceCp:s.initialLauncher?.priceCp}))
 return owned.length||stock.length||ground.length?`---
## VERSIONS MATERIELLES ET STOCK LOCAL REELS (MJ)
${JSON.stringify({owned:owned.slice(0,24),stock:stock.slice(0,24),ground})}
Une instance exacte, pas une propriete magique ou une transformation par recit. Achat reel obligatoire ; lots partiels sans tarif invente. Seul un vrai hit contre objet devient critique.

`:''
}
