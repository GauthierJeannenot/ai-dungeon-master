import type { GameState } from './types'
import type { PhysicalLightKind } from './lighting-state'
import { LightWeatherProtectionInputSchema } from './lighting-state'
import { firstMapId } from './adventure-map'
import { lightFuelRemaining } from './lighting'
import { weatherAtCell } from './weather-state'

export type WeatherFlameForecast={mapId?:string;playerPosition?:{x:number;y:number};heldItemIds?:Array<string|undefined>;ignitingItemId?:string;
 itemPositions?:Record<string,{mapId:string;cell:{x:number;y:number}}>}
export function weatherLightPosition(state:GameState,itemId:string,forecast:WeatherFlameForecast={}){
 if(forecast.itemPositions&&Object.hasOwn(forecast.itemPositions,itemId))return forecast.itemPositions[itemId]
 const held=forecast.heldItemIds??[state.dmTools?.loadout?.mainHandId,state.dmTools?.loadout?.offHandId]
 if(state.player.inventory.some(item=>item.id===itemId)&&held.includes(itemId))return{mapId:forecast.mapId??state.currentMapId??firstMapId(state),cell:forecast.playerPosition??state.player.position}
 const drop=state.droppedItems?.[itemId];return drop?{mapId:drop.mapId,cell:drop.position}:undefined
}
export function physicalFlameProtection(state:GameState,itemId:string,kind:PhysicalLightKind):'open'|'enclosed'|'unresolved'{
 if(kind==='torch'||kind==='candle')return 'open'
 if(kind==='hooded_lantern'||kind==='bullseye_lantern')return 'enclosed'
 const records=state.dmTools?.lighting?.weatherProtection?.records
 return records&&Object.hasOwn(records,itemId)?records[itemId].input.protection:'unresolved'
}
export function weatherAffectedFlames(state:GameState,forecast:WeatherFlameForecast={}){
 const at=state.worldTimeSeconds??0,candidates=new Map<string,{itemId:string;kind:PhysicalLightKind;legacyEffectId?:string}>()
 for(const source of Object.values(state.dmTools?.lighting?.sources??{}))if(source.litAt!==undefined&&lightFuelRemaining(source,at)>0)
  candidates.set(source.itemId,{itemId:source.itemId,kind:source.kind})
 for(const effect of state.hero?.effects??[])if(effect.kind==='burning-torch'&&effect.expiresAt>at&&!candidates.has(String(effect.data.itemId))){
  const itemId=String(effect.data.itemId),item=state.player.inventory.find(item=>item.id===itemId)??state.droppedItems?.[itemId]?.item
  if(item&&(item.equipmentId??item.id)==='torch')candidates.set(itemId,{itemId,kind:'torch',legacyEffectId:effect.id})
 }
 if(forecast.ignitingItemId&&!candidates.has(forecast.ignitingItemId)){
  const item=state.player.inventory.find(item=>item.id===forecast.ignitingItemId)??state.droppedItems?.[forecast.ignitingItemId]?.item
  const kind=item?.equipmentId??item?.id
  if(kind&&['torch','candle','lamp','hooded_lantern','bullseye_lantern'].includes(kind))candidates.set(forecast.ignitingItemId,{itemId:forecast.ignitingItemId,kind:kind as PhysicalLightKind})
 }
 return [...candidates.values()].flatMap(candidate=>{
  const position=weatherLightPosition(state,candidate.itemId,forecast)
  if(!position)return []
  const context=weatherAtCell(state,position.cell,position.mapId)
  return context&&(context.strongWind||context.precipitation==='heavy_rain')?[{...candidate,position,context,
   protection:physicalFlameProtection(state,candidate.itemId,candidate.kind)}]:[]
 })
}
export function weatherFlameExposureIssue(state:GameState,forecast:WeatherFlameForecast={}){
 const itemIds=weatherAffectedFlames(state,forecast).filter(source=>source.protection==='unresolved').map(source=>source.itemId)
 return itemIds.length?{code:'WEATHER_LAMP_PROTECTION_REQUIRED',message:'These actual burning lamps would be exposed to strong wind/heavy rain. Establish their real open/enclosed flame protection from an actual source fact before costs; no inventory item or narrative name is classified implicitly.',itemIds}:null
}
export function validateWeatherLightProtection(state:GameState):string[]{
 const protection=state.dmTools?.lighting?.weatherProtection
 const errors:string[]=[],at=state.worldTimeSeconds??0
 for(const record of Object.values(protection?.records??{})){
  const receipt=protection!.receipts[record.input.eventId]
  if(!receipt||record.at>at||receipt.command!==JSON.stringify(LightWeatherProtectionInputSchema.parse(record.input))
   ||receipt.result.eventId!==record.input.eventId||receipt.result.itemId!==record.input.itemId||receipt.result.protection!==record.input.protection
   ||receipt.result.at!==record.at||receipt.result.factId!==record.input.factId)errors.push(`Physical lamp ${record.input.itemId} lacks its exact protection source receipt.`)
 }
 const extinctions=state.dmTools?.lighting?.weatherExtinctions??{}
 if(Object.keys(extinctions).length>512)errors.push('Retained physical flame-extinction events exceed their non-evicting capacity.')
 for(const[id,event]of Object.entries(extinctions))if(id!==event.plan.attackEventId||event.plan.capturedAt>event.committedAt||event.committedAt>at
  ||event.extinguished!== (event.reason==='applied')||event.extinguished&&!event.plan.extinguish)
    errors.push(`Physical flame-extinction event ${id} has no exact committed attack/source chronology.`)
 return errors
}
