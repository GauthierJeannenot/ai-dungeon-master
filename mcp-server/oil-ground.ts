import { underwaterFireDefenseIssue } from '../lib/underwater-rules'
import type { GameState } from '../lib/types'
import { firstMapId } from '../lib/adventure-map'
import { randomUUID } from 'node:crypto'
import { entityGroundContact } from '../lib/jumping-state'
import { weatherAtCell } from '../lib/weather-state'
import { isStatBackedNpc } from '../lib/npc-stat-blocks'
import { oilState } from './oil-fire'
import { dealDamage } from './monster-rules'
import { toolkitError } from './toolkit'
import { groundDamageIssue } from './ground-damage-preflight'
import * as gs from './game-state'
export const oilActualActorIds=(state:GameState)=>[...new Set(['player',...Object.keys(state.monsters),...Object.values(state.npcs??{}).filter(npc=>(npc.mapId??firstMapId(state))===state.currentMapId).map(npc=>npc.id)])]
function patchesAt(state:GameState,entityId:string){
 const actor=entityId==='player'?state.player:state.monsters[entityId]??state.npcs?.[entityId]
 if(!actor||entityId==='player'&&'deathSaves'in actor&&actor.deathSaves?.dead||'isAlive'in actor&&actor.isAlive===false)return[]
 if('mapId'in actor&&actor.mapId&&actor.mapId!==state.currentMapId)return[]
 if(entityId!=='player'&&!state.monsters[entityId]&&state.npcs?.[entityId]&&(state.npcs[entityId].mapId??firstMapId(state))!==state.currentMapId)return[]
 const time=state.worldTimeSeconds??0
 return Object.values(state.dmTools?.oil?.patches??{}).filter(patch=>patch.mapId===state.currentMapId&&patch.ignitedAt!==undefined
  &&patch.ignitedAt<=time&&patch.burnsUntil!>time&&patch.extinguishedAt===undefined
  &&actor!.position.x===patch.cell.x&&actor!.position.y===patch.cell.y)
}
export function oilRequiresInitiativeTurn(state:GameState,entityId:string){
 return patchesAt(state,entityId).some(patch=>entityGroundContact(state,entityId,patch.cell,patch.elevationFeet).contact!==false)
}
export function assertOilCombatRoster(combatants:readonly string[]){
 const state=gs.getState()
 for(const id of oilActualActorIds(state))for(const patch of patchesAt(state,id)){
  const contact=entityGroundContact(state,id,patch.cell,patch.elevationFeet)
  if(contact.contact===null)toolkitError('OIL_SURFACE_CONTACT_REQUIRED','Resolve the actual existing body support at burning oil before choosing initiative; no XY contact is inferred.')
  if(contact.contact&&id!=='player'&&!state.monsters[id]&&!isStatBackedNpc(state.npcs?.[id]))toolkitError('OIL_BODY_PROFILE_REQUIRED','The actual present NPC touching ground oil needs its real published combat profile before source damage; no default HP or distant actor is created.')
  if(contact.contact&&!combatants.includes(id))toolkitError('OIL_GROUND_ROSTER_REQUIRED','Include every existing actual body touching burning oil in this explicit initiative roster; do not omit its source end-of-turn damage or invent a foe.')
 }
}
export function oilGroundContactIssue(state:GameState,entityId:string){
 let hasContact=false
 for(const patch of patchesAt(state,entityId)){
  const contact=entityGroundContact(state,entityId,patch.cell,patch.elevationFeet)
  if(contact.contact===null)return{code:'OIL_SURFACE_CONTACT_REQUIRED',message:'The actual burning oil surface has no resolved contact with this body. Establish its real support/height before movement, time or damage.',entityId,patchId:patch.id}
  if(!contact.contact)continue
  hasContact=true
  if(entityId!=='player'&&!state.monsters[entityId]&&!isStatBackedNpc(state.npcs?.[entityId]))return{code:'OIL_BODY_PROFILE_REQUIRED',message:'Use the actual published profile of this present body before ground-oil damage; no HP or statistic is invented.',entityId,patchId:patch.id}
  if(state.phase!=='combat')return{code:'OIL_GROUND_TURNS_REQUIRED',message:'This real body contacts burning ground oil. Explicitly enter initiative with the actual affected actors before resolving entry/end-turn damage or advancing time; no foe or turn is invented.',entityId,patchId:patch.id}
  if(!state.initiativeOrder.includes(entityId))return{code:'OIL_GROUND_ROSTER_REQUIRED',message:'The actual body in burning ground oil must have its own real initiative slot before entry/end-turn damage; explicitly include that existing actor.',entityId,patchId:patch.id}
 }
 const key=`${state.combatGeneration??0}:${state.turnCounter??0}:${entityId}`
 if(hasContact&&!Object.hasOwn(state.dmTools?.oil?.damageTurns??{},key)&&Object.keys(state.dmTools?.oil?.damageTurns??{}).length>=512)
  return{code:'OIL_DAMAGE_TURN_LIMIT',message:'No retained once-per-turn oil damage receipt remains before movement, time or damage.',entityId}
 if(hasContact&&!Object.hasOwn(state.dmTools?.oil?.damageTurns??{},key)){const environmental=underwaterFireDefenseIssue(state,{kind:'creature',entityId});if(environmental)return environmental;const issue=groundDamageIssue(state,entityId,5);if(issue)return issue}
 return null
}
/** Pure reservation information for an explicitly chosen physical step or
 * group. The actual receipt and UUID are created only at damage commit. */
export function forecastOilGroundContact(state:GameState,entityId:string){
 const key=`${state.combatGeneration??0}:${state.turnCounter??0}:${entityId}`
 const patchIds=patchesAt(state,entityId).filter(patch=>entityGroundContact(state,entityId,patch.cell,patch.elevationFeet).contact===true).map(patch=>patch.id)
 const issue=oilGroundContactIssue(state,entityId)
 return{key,patchIds,damageNeeded:patchIds.length>0&&!Object.hasOwn(state.dmTools?.oil?.damageTurns??{},key),...(issue?{issue}:{})}
}
/** Caller supplies only an actual committed contact, landing, entry or end of
 * turn, never a planned waypoint. Pure forecast is available before mutation. */
export function onOilGroundContact(entityId:string){
 const state=gs.getState(),forecast=forecastOilGroundContact(state,entityId);if(forecast.issue)toolkitError(forecast.issue.code,forecast.issue.message)
 const patches=forecast.patchIds.map(id=>state.dmTools!.oil!.patches[id])
 if(!patches.length)return undefined
 const key=forecast.key,existing=state.dmTools?.oil?.damageTurns[key]
 if(existing)return{...existing.result,replayed:true}
 const options={sourceId:patches[0].sourceId,damageEventId:randomUUID()},damageResolution=gs.withPhysicalCreatureResolution([entityId],()=>dealDamage(entityId,5,'fire',options))
 const result={targetId:entityId,patchIds:patches.map(value=>value.id),turnKey:key,damageResolution,damageDealt:damageResolution.damageDealt,
  source:'PHB2014 Oil ground:5fire on actual entry/end-of-turn, only once per creature in this actual turn; overlapping oil does not multiply this limit.'}
 oilState().damageTurns[key]={turnKey:key,patchIds:result.patchIds,at:state.worldTimeSeconds??0,result:structuredClone(result)}
 return result
}
export function assertOilTimeAdvance(seconds:number){
 if(seconds<=0)return
 const state=gs.getState()
 for(const id of oilActualActorIds(state)){const issue=oilGroundContactIssue(state,id);if(issue)toolkitError(issue.code,issue.message)}
 if(state.phase==='combat'&&Object.values(state.dmTools?.oil?.patches??{}).some(patch=>patch.ignitedAt!==undefined&&patch.burnsUntil!>(state.worldTimeSeconds??0)&&patch.extinguishedAt===undefined))
  toolkitError('OIL_GROUND_ACTIVE','Resolve the actual initiative turns through the burning oil duration before a time jump, rest or combat exit; no end-turn damage is skipped.')
}
/** Open mundane oil flames follow actual strong wind/heavy rain facts. No
 * magical dispelling and no invented weather or replacement fuel. */
export function reconcileOilWeather(){
 const state=gs.getState(),at=state.worldTimeSeconds??0,extinguished:string[]=[]
 for(const patch of Object.values(state.dmTools?.oil?.patches??{})){
  if(patch.ignitedAt===undefined||patch.extinguishedAt!==undefined||patch.burnsUntil!<=at)continue
  const weather=weatherAtCell(state,patch.cell,patch.mapId)
  if(!weather||!weather.strongWind&&weather.precipitation!=='heavy_rain')continue
  patch.extinguishedAt=at;patch.weatherExtinction={mapId:weather.mapId,roomId:weather.roomId,revision:weather.revision,strongWind:weather.strongWind,precipitation:weather.precipitation};extinguished.push(patch.id)
 }
 return extinguished
}
