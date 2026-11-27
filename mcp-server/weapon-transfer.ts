import { z } from 'zod'
import { WeatherThrownFlamePlanSchema,type WeatherThrownFlamePlan } from '../lib/lighting-state'
import { improvisedRuling } from '../lib/improvised-state'
import { activePhysicalLoad,loadCells } from '../lib/physical-handling-state'
import { navigationGrid } from '../lib/navigation'
import { inferRoomIdOnMap } from '../lib/adventure-map'
import { engineGeometry } from './navigation'
import { releasePhysicalHandling } from './physical-handling'
import { captureWeatherThrownFlame,commitWeatherThrownFlame } from './weather-flames'
import { toolkitError } from './toolkit'
import { distance } from './hero-rules'
import { validateImprovisedReference } from './improvised'
import { getWeapon } from '../lib/srd/weapons'
import * as gs from './game-state'
const Cell=z.object({x:z.number().int().nonnegative(),y:z.number().int().nonnegative()}).strict()
export const ImprovisedAttackContextSchema=z.object({referenceId:z.string(),ruling:z.string(),mapId:z.string(),actorCell:Cell,targetCell:Cell,
  physicalContext:z.string(),loadId:z.string().optional(),landingCell:Cell.optional()}).strict()
export type ImprovisedAttackContext=z.infer<typeof ImprovisedAttackContextSchema>
export function attackRayCells(from:{x:number;y:number},to:{x:number;y:number}){
  const count=Math.max(Math.abs(to.x-from.x),Math.abs(to.y-from.y))
  return Array.from({length:count+1},(_,step)=>count?{x:Math.round(from.x+(to.x-from.x)*step/count),y:Math.round(from.y+(to.y-from.y)*step/count)}:{...from})
}
export function improvisedAttackContext(reference:string,targetCell:{x:number;y:number},thrown:boolean,held?:unknown):ImprovisedAttackContext|undefined{
  const state=gs.getState(),ruling=improvisedRuling(state,reference)
  if(!ruling){if(held!==undefined)toolkitError('IMPROVISED_HELD_CONTEXT_INVALID','A held improvised context must retain its actual ruling.');return undefined}
  validateImprovisedReference(reference)
  const load=ruling.targetKind!=='item'?activePhysicalLoad(state):undefined
  const context:ImprovisedAttackContext={referenceId:reference,ruling:JSON.stringify(ruling),mapId:state.currentMapId!,actorCell:{...state.player.position},targetCell:{...targetCell},physicalContext:ruling.physicalContext,
    ...(load?{loadId:load.id}:{}),...(thrown&&load?{landingCell:ruling.landingCell}:{}),}
  if(held!==undefined){const parsed=ImprovisedAttackContextSchema.safeParse(held)
    if(!parsed.success||JSON.stringify(parsed.data)!==JSON.stringify(context))toolkitError('IMPROVISED_HELD_CONTEXT_INVALID','The same original ruling, real physical grip, map, target position and explicit landing must remain fixed before a reaction die or cost.')}
  if(thrown&&load){
    const landing=ruling.landingCell
    const range=ruling.mode==='similar'?getWeapon(ruling.profileId!)?.longRangeCells??12:12
    if(!landing||distance(landing,targetCell)>1||distance(landing,state.player.position)>range||!inferRoomIdOnMap(landing,state.currentMapId,state))
      toolkitError('IMPROVISED_LANDING_INVALID','Choose the explicit on-map landing adjacent to the attacked target and inside this actual selected profile’s long range (generic20/60ft); no scatter or displacement is inferred.')
    const objects=load.targetKind==='object'?Object.fromEntries(Object.entries(state.dmTools!.objects).filter(([id])=>id!==load.targetId)):state.dmTools!.objects
    const projected={...state,dmTools:{...state.dmTools!,objects}},grid=navigationGrid(projected,'player',engineGeometry(),{ignoreOccupantIds:[load.targetId],ignoreActorEffects:true,ignoreDoorKnowledge:true})
    if(!loadCells(landing!,load.footprint).every(cell=>grid.free(cell)))toolkitError('IMPROVISED_LANDING_OCCUPIED','The full real load footprint must land free; no living creature or object is vacated.')
    const ray=attackRayCells(load.lastTargetCell,landing!)
    for(let i=1;i<ray.length;i++)for(const cell of loadCells(ray[i-1],load.footprint)){
      const next={x:cell.x+ray[i].x-ray[i-1].x,y:cell.y+ray[i].y-ray[i-1].y}
      if(!grid.step(cell,next,false,false))toolkitError('IMPROVISED_THROW_PATH_BLOCKED','The full real payload cannot pass the represented wall/closed door/corner on its explicitly selected landing ray.')
    }
  }
  return context
}
export function captureThrownFlame(itemId:string,from:{x:number;y:number},to:{x:number;y:number},attackId:string,held?:unknown){
  if(held!==undefined){const parsed=WeatherThrownFlamePlanSchema.safeParse(held)
    if(!parsed.success||parsed.data.attackEventId!==attackId||parsed.data.itemId!==itemId||parsed.data.mapId!==gs.getState().currentMapId
      ||JSON.stringify(parsed.data.rayCells)!==JSON.stringify(attackRayCells(from,to)))toolkitError('WEATHER_HELD_THROW_CONTEXT_INVALID','Retain the original captured real item, attack, map, ray and validated flame decision before a reaction die.')
    return parsed.data
  }
  return captureWeatherThrownFlame(itemId,attackRayCells(from,to),gs.getState().currentMapId!,attackId)
}
export function commitPhysicalThrow(itemId:string,targetCell:{x:number;y:number},context?:ImprovisedAttackContext,flame?:WeatherThrownFlamePlan){
  const state=gs.getState(),ruling=context?improvisedRuling(state,context.referenceId):undefined
  if(ruling&&ruling.targetKind!=='item'){
    const load=activePhysicalLoad(state)
    if(!load||load.id!==context!.loadId||!context!.landingCell)toolkitError('IMPROVISED_LOAD_NOT_HELD','The exact prevalidated physical load must still be held for this single real throw.')
    // Existing authoritative pair commit updates the actual object attachments
    // or existing body only. The player's position does not change.
    gs.movePhysicalLoadPair(load!.id,'player',{...state.player.position},load!.targetId,context!.landingCell!)
    releasePhysicalHandling(load!.id,'Actual explicitly selected improvised throw')
    return {targetKind:ruling.targetKind,targetId:load!.targetId,landingCell:context!.landingCell,loadId:load!.id,source:'explicit_MJ_landing_adjudication'}
  }
  const dropped=gs.dropPlayerItem(itemId,{position:targetCell,description:'Objet/arme réellement lancé lors de cette attaque explicite.'})
  dropped.roomId=inferRoomIdOnMap(targetCell,state.currentMapId,state)??dropped.roomId
  if(flame)commitWeatherThrownFlame(flame)
  return dropped
}
