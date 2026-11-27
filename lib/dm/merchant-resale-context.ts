import type { GameState } from '../types'
import { merchantResaleBalance } from '../merchant-resale-state'
export function localMerchantResaleContext(state:GameState):string{
 const data=state.dmTools?.merchantResales
 const merchants=Object.values(state.npcs??{}).filter(n=>n.visible&&(!n.mapId||n.mapId===state.currentMapId)&&n.roomId===state.currentRoomId)
  .filter(n=>state.dmTools?.merchants?.earnedCoins[n.id]||Object.values(data?.offers??{}).some(o=>o.input.merchantId===n.id))
  .map(n=>({merchantId:n.id,availableCoins:merchantResaleBalance(state,n.id),offers:Object.values(data?.offers??{}).filter(o=>o.input.merchantId===n.id&&o.mapId===state.currentMapId&&o.roomId===state.currentRoomId).map(o=>({offerId:o.input.offerId,itemIds:o.items.map(i=>i.id),priceCp:o.input.priceCp,valuation:o.valuation??'ordinary_half',registeredKinds:o.valuableProvenance?.map(p=>p.record.kind),tradeGoods:o.tradeGoodProvenance?.map(p=>({itemId:p.input.itemId,commodityId:p.input.commodityId,sourceUnits:p.input.sourceUnits})),status:o.status}))}))
 const goods=Object.values(state.dmTools?.tradeGoods?.lots??{}).filter(r=>state.player.inventory.some(i=>i.id===r.input.itemId)||state.droppedItems?.[r.input.itemId]?.mapId===state.currentMapId&&state.droppedItems?.[r.input.itemId]?.roomId===state.currentRoomId).map(r=>({itemId:r.input.itemId,commodityId:r.input.commodityId,sourceUnits:r.input.sourceUnits,physicalFactId:r.input.physicalFactId}))
 const goodsContext=goods.length?`---\n## LOTS COMMERCIAUX LOCAUX QUALIFIÉS (MJ)\n${JSON.stringify(goods)}\nLot entier source, sans subdivision, nourriture acquise, masse tissu ni acceptation implicite.\n\n`:''
 return goodsContext+(merchants.length?`---\n## REVENTES LOCALES — RÉSERVE RÉELLE DU MARCHAND (MJ)\n${JSON.stringify(merchants)}\nLes pièces disponibles proviennent seulement de vrais achats antérieurs moins les versements conservés ; aucune bourse initiale ni volonté d'achat n'est déduite.\n\n`:'')
}
