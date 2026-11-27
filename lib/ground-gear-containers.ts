import type { GameState } from './types'
/** Counted contents keep their real container. This is a physical transfer of
 * existing instances, never an inferred player target or extra action. */
export function groundGearContainerTransfer(state:GameState,itemId:string,operation:'drop'|'pickup'){
 const stocks=state.dmTools?.groundGear?.stocks??{},selected=stocks[itemId]
 const issue=(code:string,message:string)=>({issue:{code,message},itemIds:[] as string[]})
 if(selected)return issue('GROUND_GEAR_CONTAINER_SELECTION_REQUIRED',`Choose the actual container ${selected.containerItemId} to transfer its counted contents together; no loose pile or replacement bag is created.`)
 const children=Object.values(stocks).filter(stock=>stock.containerItemId===itemId),ids=[itemId,...children.map(stock=>stock.itemId)]
 if(operation==='drop'){
  if(children.some(stock=>!state.player.inventory.some(item=>item.id===stock.itemId)||state.droppedItems?.[stock.itemId]))return issue('GROUND_GEAR_CONTAINER_CONTENTS_MISMATCH','The actual container and all its counted contents must already be physically together in inventory.')
 }else{
  const container=state.droppedItems?.[itemId]
  if(children.some(stock=>{const item=state.droppedItems?.[stock.itemId];return!container||!item||item.mapId!==container.mapId||item.roomId!==container.roomId||item.position.x!==container.position.x||item.position.y!==container.position.y||state.player.inventory.some(i=>i.id===stock.itemId)}))return issue('GROUND_GEAR_CONTAINER_CONTENTS_MISMATCH','The actual container and all its counted contents must be together at their real deposited map location.')
 }
 return{itemIds:ids,issue:undefined}
}
