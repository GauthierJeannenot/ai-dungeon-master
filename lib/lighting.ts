import { firstMapId, getMapSpec, inferRoomIdOnMap, type GridCell } from './adventure-map'
import { navigationGrid } from './navigation'
import { getMonsterRecord } from './srd/monsters'
import { LIGHT_TEMPLATES, type Illumination, type LightSource, type LightDirection } from './lighting-state'
import type { GameState, PlayerState, MonsterState } from './types'
import { weatherObscurationBetween,weatherHeightPointIssue,weatherStateOf } from './weather-state'
import { lightObjectPosition,lightObjectCoverage,lightSpellStateOf } from './light-spell-state'

export const lightFuelRemaining = (source: LightSource, time: number) => Math.max(0,
  source.remainingSeconds - (source.litAt === undefined ? 0 : Math.max(0, time - source.litAt)))
const distance = (a: GridCell, b: GridCell) => Math.max(Math.abs(a.x-b.x),Math.abs(a.y-b.y))

// A physical ray only: darkness never becomes a wall or prevents touch.
export function lightingRay(state: GameState, from: GridCell, to: GridCell,emittingObjectId?:string): boolean {
  // Remove the emitter's own projection and explicitly transparent objects
  // for optical rays only; navigation and weapon obstacles stay unchanged.
  const view=state.dmTools&&(emittingObjectId||Object.values(state.dmTools.objects).some(object=>object.blocksSight===false))?{...state,dmTools:{...state.dmTools,objects:Object.fromEntries(Object.entries(state.dmTools.objects).filter(([id,object])=>id!==emittingObjectId&&object.blocksSight!==false))}}:state
  const grid = navigationGrid(view, 'player', getMapSpec(state.currentMapId,state).geometry, {ignoreActorEffects:true,ignoreDoorKnowledge:true})
  if(!grid.free(from,false)||!grid.free(to,false))return false
  const count=distance(from,to)
  let previous=from
  for(let step=1;step<=count;step++){
    const next={x:Math.round(from.x+(to.x-from.x)*step/count),y:Math.round(from.y+(to.y-from.y)*step/count)}
    if(!grid.step(previous,next,false,false))return false
    previous=next
  }
  return true
}

function physicalLightPosition(state: GameState, itemId: string) {
  const mapId=state.currentMapId??firstMapId(state)
  if(state.player.inventory.some(item=>item.id===itemId)){
    const loadout=state.dmTools?.loadout
    return loadout&&[loadout.mainHandId,loadout.offHandId].includes(itemId)?{mapId,cell:state.player.position}:undefined
  }
  const drop=state.droppedItems?.[itemId]
  return drop?{mapId:drop.mapId,cell:drop.position}:undefined
}

export function activeLights(state: GameState) {
  const time=state.worldTimeSeconds??0,mapId=state.currentMapId??firstMapId(state)
  const lights:ActiveLight[]=[]
  for(const source of Object.values(state.dmTools?.lighting?.sources??{})){
    if(source.litAt===undefined||lightFuelRemaining(source,time)<=0)continue
    const position=physicalLightPosition(state,source.itemId)
    if(position?.mapId===mapId){
      const profile=source.kind==='hooded_lantern'&&source.hood==='lowered'
        ?{brightFeet:0,dimAdditionalFeet:5}:LIGHT_TEMPLATES[source.kind]
      // Never substitute a radius for an un-aimed bullseye cone.
      if(source.kind==='bullseye_lantern'&&!source.direction)continue
      lights.push({id:source.itemId,cell:position.cell,...profile,
        ...(source.kind==='bullseye_lantern'?{direction:source.direction,includeOrigin:source.includeOrigin??false}:{})})
    }
  }
  for(const effect of state.hero?.effects??[]){
    if(effect.expiresAt<=time)continue
    if(effect.kind==='burning-torch'){
      const id=String(effect.data.itemId)
      if(state.dmTools?.lighting?.sources[id])continue
      const position=physicalLightPosition(state,id)
      if(position?.mapId===mapId)lights.push({id:effect.id,cell:position.cell,...LIGHT_TEMPLATES.torch})
    }else if(effect.kind==='scintillating-robe'){
      const id=String(effect.data.itemId),owned=state.player.inventory.some(item=>item.id===id),drop=state.droppedItems?.[id]
      const position=owned?{mapId,cell:state.player.position}:drop?{mapId:drop.mapId,cell:drop.position}:undefined
      if(position?.mapId===mapId)lights.push({id:effect.id,cell:position.cell,brightFeet:30,dimAdditionalFeet:30})
    }else if(effect.kind==='light'){
      const objectId=typeof effect.data.objectId==='string'?effect.data.objectId:undefined
      const cast=typeof effect.data.lightCastId==='string'?lightSpellStateOf(state)?.casts[effect.data.lightCastId]:undefined
      const position=objectId?lightObjectPosition(state,objectId):undefined
      // Legacy self/point Light effects remain history, never certified light.
      if(position?.mapId===mapId&&cast?.effectId===effect.id&&cast.status==='resolved'&&lightObjectCoverage(state,objectId!)==='uncovered')
        lights.push({id:effect.id,objectId,cell:position.cell,brightFeet:20,dimAdditionalFeet:20,...cast.selection.color!==undefined?{color:cast.selection.color}:{}})
    }else if(['continual-flame','dancing-lights'].includes(effect.kind)){
      // The existing spell engine stores one point for Dancing Lights; no
      // invented positions for additional lights are inferred from narration.
      const point=effect.data.cell as GridCell|undefined
      const effectMap=effect.data.mapId
      const cell=point
      if(cell&&effectMap===mapId)lights.push({id:effect.id,cell,brightFeet:effect.kind==='dancing-lights'?0:20,
        dimAdditionalFeet:effect.kind==='dancing-lights'?10:20})
    }
  }
  return lights
}

export interface ActiveLight {
  id:string;cell:GridCell;brightFeet:number;dimAdditionalFeet:number;objectId?:string;color?:string
  direction?:LightDirection;includeOrigin?:boolean
}

/** PHB cone: width equals distance from the origin, not a 90-degree sector.
 * Grid cells are tested at their centers. A diagonal direction is normalized,
 * so choosing a diagonal does not lengthen or widen the source's cone. */
export function physicalLightAt(source:ActiveLight,cell:GridCell):Illumination|undefined {
  let feet=distance(source.cell,cell)*5
  if(source.direction){
    const dx=(cell.x-source.cell.x)*5,dy=(cell.y-source.cell.y)*5
    if(dx===0&&dy===0)return source.includeOrigin?(source.brightFeet>0?'bright':'dim'):undefined
    const magnitude=Math.hypot(source.direction.x,source.direction.y)
    const forward=(dx*source.direction.x+dy*source.direction.y)/magnitude
    const sideways=Math.abs(dx*source.direction.y-dy*source.direction.x)/magnitude
    if(forward<=0||sideways>forward/2+1e-9)return undefined
    feet=forward
  }
  if(feet>source.brightFeet+source.dimAdditionalFeet+1e-9)return undefined
  return source.brightFeet>0&&feet<=source.brightFeet+1e-9?'bright':'dim'
}

export function illuminationAt(state: GameState, cell: GridCell): Illumination {
  const mapId=state.currentMapId??firstMapId(state),roomId=inferRoomIdOnMap(cell,mapId,state)
  // Historical maps have no authored lighting data. Preserve their prior
  // visibility until the MJ explicitly establishes a room's illumination.
  let rank=({darkness:0,dim:1,bright:2} as const)[roomId?state.dmTools?.lighting?.ambient[mapId]?.[roomId]??'bright':'bright']
  if(rank===2)return 'bright'
  for(const source of activeLights(state)){
    const light=physicalLightAt(source,cell)
    if(!light||!lightingRay(state,source.cell,cell,source.objectId))continue
    rank=Math.max(rank,light==='bright'?2:1) as 0|1|2
    if(rank===2)break
  }
  return rank===2?'bright':rank===1?'dim':'darkness'
}

export function darkvisionFeet(state: GameState, actor: PlayerState|MonsterState): number {
  const senses='type'in actor?getMonsterRecord(actor.type)?.source.senses as Record<string,unknown>|undefined:undefined
  const sourceRange=typeof senses?.darkvision==='string'?Number(/^\d+/.exec(senses.darkvision)?.[0]??0):0
  const effectRange=Math.max(0,...(state.hero?.effects??[]).filter(e=>e.kind==='darkvision'&&e.targetIds.includes(actor.id)
    &&e.expiresAt>(state.worldTimeSeconds??0)).map(e=>Number(e.data.rangeFeet??0)).filter(Number.isFinite))
  return Math.max(sourceRange,effectRange)
}

export function perceivedLightAt(state: GameState, actor: PlayerState|MonsterState, cell: GridCell,spatial?:{distanceFeet:number}) {
  const illumination=illuminationAt(state,cell),darkvisionRangeFeet=darkvisionFeet(state,actor)
  const withinDarkvision=darkvisionRangeFeet>0&&(spatial?.distanceFeet??distance(actor.position,cell)*5)<=darkvisionRangeFeet
  const perceivedIllumination:Illumination=withinDarkvision?(illumination==='darkness'?'dim':'bright'):illumination
  return {illumination,perceivedIllumination,darkvisionRangeFeet,
    monochrome:illumination==='darkness'&&withinDarkvision}
}

export function visualPerceptionAt(state: GameState, actor: PlayerState|MonsterState, cell: GridCell) {
  const light=perceivedLightAt(state,actor,cell),pathClear=lightingRay(state,actor.position,cell)
  const weather=weatherObscurationBetween(state,actor.position,cell),heightIssue=weatherHeightPointIssue(state,[actor.id])
  const canSee=actor.hp.current>0&&!actor.conditions.some(c=>['blinded','unconscious','petrified'].includes(c))
    &&pathClear&&!weather.heavy&&!heightIssue&&light.perceivedIllumination!=='darkness'
  return {...light,pathClear,canSee,visualDisadvantage:canSee&&(light.perceivedIllumination==='dim'||weather.light),monochrome:canSee&&light.monochrome,
    ...(weatherStateOf(state)?{physicalWeatherObscuration:weather}:{}),...(heightIssue?{unsupportedHeight:heightIssue}:{})}
}
