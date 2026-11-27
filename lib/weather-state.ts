import { cackleIncubationBoundary } from './cackle-fever-state'
import { actualNativeFlightLocation } from './native-flight-state'
import { sewerPlagueIncubationBoundary } from './affliction-state'
import { dueFrigidWaterSave } from './frigid-water-state'
import { spatialWeaponResolution } from './spatial-weapon-resolution'
import { z } from 'zod'
import type { GameState } from './types'
import { inferRoomIdOnMap } from './adventure-map'

const Id=z.string().min(1).max(180).refine(value=>!['constructor','prototype','__proto__'].includes(value))
const EventId=z.string().min(1).max(80).regex(/^[a-zA-Z0-9][a-zA-Z0-9_:.-]*$/).refine(value=>!['constructor','prototype','__proto__'].includes(value))
const Source=z.string().trim().min(1).max(1000)
export const WEATHER_HOUR_SECONDS=3600
export const ALTITUDE_ACCLIMATION_SECONDS=30*86400
export const PerceptionSenseSchema=z.enum(['sight','hearing','other'])
export type PerceptionSense=z.infer<typeof PerceptionSenseSchema>
export const WeatherContextInputSchema=z.object({eventId:EventId,roomId:Id,temperatureF:z.number().finite().min(-200).max(1000),
  strongWind:z.boolean(),precipitation:z.enum(['none','heavy_rain','heavy_snow']),sandstorm:z.boolean(),
  fog:z.enum(['none','light','heavy']),source:Source}).strict().superRefine((input,ctx)=>{
  if(input.sandstorm&&!input.strongWind)ctx.addIssue({code:'custom',message:'The source strong-wind sandstorm requires actual strong wind; no sandstorm is inferred from a desert name.'})
})
export const ExposureInputSchema=z.object({eventId:EventId,entityId:Id,operation:z.enum(['begin','update']),
  exposed:z.boolean(),breathes:z.boolean(),altitudeFeet:z.number().finite().nonnegative().max(1000000),
  physiologyFactId:Id.nullable().optional(),nativeColdFactId:Id.nullable().optional(),nativeHeatFactId:Id.nullable().optional(),nativeHighAltitudeFactId:Id.nullable().optional(),
  noOtherWaterAccessFactId:Id.nullable().optional(),
  historyKnown:z.literal(true).optional(),knownColdPartialSeconds:z.number().int().min(0).max(3599).optional(),
  knownHeatPartialSeconds:z.number().int().min(0).max(3599).optional(),priorResolvedHeatHours:z.number().int().min(0).max(100000).optional(),
  knownAcclimationSeconds:z.number().int().min(0).max(ALTITUDE_ACCLIMATION_SECONDS).optional(),
  unobservedNoExposureConfirmed:z.literal(true).optional(),historyFactId:Id.optional(),source:Source}).strict().superRefine((input,ctx)=>{
  const initial=[input.knownColdPartialSeconds,input.knownHeatPartialSeconds,input.priorResolvedHeatHours,input.knownAcclimationSeconds]
  if(input.operation==='begin'&&(!input.historyKnown||initial.some(value=>value===undefined)))ctx.addIssue({code:'custom',message:'Initial exposure requires explicitly known history; no earlier cold/heat saves or acclimation dose are reconstructed.'})
  if(input.operation==='update'&&(input.historyKnown!==undefined||initial.some(value=>value!==undefined)))ctx.addIssue({code:'custom',message:'An update cannot reset initial physical history, accumulated dose or hourly difficulty.'})
  if(!input.breathes&&!input.physiologyFactId)ctx.addIssue({code:'custom',message:'An actual breathless physiology requires its established source fact, not a free exemption.'})
})
export const WeatherClothingInputSchema=z.object({eventId:EventId,itemId:Id,operation:z.enum(['wear','remove']),
  coldWeatherGear:z.boolean(),heavyClothing:z.boolean(),physicalGarmentConfirmed:z.literal(true),factId:Id,source:Source}).strict()
const Cell=z.object({x:z.number().int(),y:z.number().int()}).strict()
const Context=z.object({mapId:Id,roomId:Id,revision:z.number().int().positive(),temperatureF:z.number().finite(),strongWind:z.boolean(),
  precipitation:z.enum(['none','heavy_rain','heavy_snow']),sandstorm:z.boolean(),fog:z.enum(['none','light','heavy']),
  fogDispersed:z.boolean(),source:Source,at:z.number().nonnegative()}).strict()
const Profile=z.object({entityId:Id,mapId:Id,source:Source,startedAt:z.number().nonnegative(),lastAt:z.number().nonnegative(),
  exposed:z.boolean(),breathes:z.boolean(),altitudeFeet:z.number().finite().nonnegative(),physiologyFactId:Id.optional(),
  nativeColdFactId:Id.optional(),nativeHeatFactId:Id.optional(),nativeHighAltitudeFactId:Id.optional(),
  noOtherWaterAccessFactId:Id.optional(),facts:z.record(z.string(),z.record(z.string(),z.unknown())),
  coldPartialSeconds:z.number().nonnegative().max(3599.999999),heatPartialSeconds:z.number().nonnegative().max(3599.999999),
  coldSequence:z.number().int().nonnegative(),heatSequence:z.number().int().nonnegative(),priorResolvedHeatHours:z.number().int().nonnegative(),
  coldEpisodeNumber:z.number().int().nonnegative(),heatEpisodeNumber:z.number().int().nonnegative(),coldEpisodeHours:z.number().int().nonnegative(),heatEpisodeHours:z.number().int().nonnegative(),
  lastColdExposed:z.boolean(),lastHeatUnsafe:z.boolean(),
  acclimationSeconds:z.number().nonnegative().max(ALTITUDE_ACCLIMATION_SECONDS),unobservedSince:z.number().nonnegative().optional(),
  initial:z.object({knownColdPartialSeconds:z.number().nonnegative(),knownHeatPartialSeconds:z.number().nonnegative(),
    priorResolvedHeatHours:z.number().int().nonnegative(),knownAcclimationSeconds:z.number().nonnegative()}).strict(),
}).strict()
const WeatherEvent=z.object({eventId:z.string().min(1).max(500),entityId:Id,kind:z.enum(['cold','heat']),sequence:z.number().int().positive(),
  episodeNumber:z.number().int().positive(),hourNumber:z.number().int().positive(),
  at:z.number().nonnegative(),dc:z.number().int().min(5).max(200000),context:Context,
  automaticSuccess:z.boolean(),automaticReason:z.array(z.string()),disadvantage:z.boolean(),
  status:z.enum(['due','held','resolved']),result:z.record(z.string(),z.unknown()).optional(),
}).strict()
const Flight=z.object({entityId:Id,mapId:Id,airborne:z.boolean(),heightFeet:z.number().min(0).max(1000000).nullable(),source:Source,
  startedAt:z.number().nonnegative(),initialEventId:EventId,revision:z.number().int().positive(),lastPosition:Cell,
}).strict()
export const WeatherStateSchema=z.object({version:z.literal(1),contexts:z.record(z.string(),Context),profiles:z.record(z.string(),Profile),
  clothing:z.record(z.string(),z.object({itemId:Id,coldWeatherGear:z.boolean(),heavyClothing:z.boolean(),worn:z.boolean(),factId:Id,fact:z.record(z.string(),z.unknown()),source:Source}).strict()),
  events:z.record(z.string(),WeatherEvent),flights:z.record(z.string(),Flight),
  pendingCombatRound:z.object({round:z.number().int().positive(),generation:z.number().int().nonnegative(),mapId:Id,
    at:z.number().nonnegative(),tickStartsAt:z.number().nonnegative(),tickEndsAt:z.number().nonnegative(),
    requestedFromTurnCounter:z.number().int().nonnegative(),eventIds:z.array(z.string()).max(512),nutritionDayIndex:z.number().int().nonnegative().optional(),
    cackleFeverAfflictionId:z.string().min(1).max(180).optional(),sewerPlagueAfflictionId:z.string().min(1).max(180).optional(),roundEventsResolved:z.boolean(),awaitingCombatClosure:z.literal(true).optional()}).strict().optional(),
  receipts:z.record(z.string(),z.object({command:z.string(),result:z.record(z.string(),z.unknown())}).strict()),
}).strict().superRefine((state,ctx)=>{
  if(Object.keys(state.contexts).length>512||Object.keys(state.profiles).length>256||Object.keys(state.clothing).length>256
    ||Object.keys(state.events).length>4096||Object.keys(state.receipts).length>2048||Object.keys(state.flights).length>256)
    ctx.addIssue({code:'custom',message:'Weather identities, exposure doses, real events and receipts are bounded and never evicted.'})
  for(const[key,context]of Object.entries(state.contexts))if(key!==weatherContextKey(context.mapId,context.roomId)||context.sandstorm&&!context.strongWind
    ||context.fogDispersed&&!context.strongWind)ctx.addIssue({code:'custom',message:'Physical weather context and wind-dispersed fog must retain their actual canonical scope.'})
  for(const[id,profile]of Object.entries(state.profiles))if(id!==profile.entityId||profile.lastAt<profile.startedAt
    ||profile.acclimationSeconds<profile.initial.knownAcclimationSeconds)ctx.addIssue({code:'custom',message:'Actor exposure identity, chronology and actual acclimation cannot reset through another event ID.'})
  for(const[id,event]of Object.entries(state.events))if(id!==event.eventId||!state.profiles[event.entityId]
    ||event.dc!==(event.kind==='cold'?10:4+event.hourNumber)
    ||event.status==='resolved'&&!event.result||event.status!=='resolved'&&event.result)
    ctx.addIssue({code:'custom',message:'Each thermal event requires its real actor/hour, source difficulty and exact resolution state.'})
  for(const[id,flight]of Object.entries(state.flights))if(id!==flight.entityId||!flight.airborne&&flight.heightFeet!==0||flight.heightFeet!==null&&flight.airborne!==(flight.heightFeet>0))
    ctx.addIssue({code:'custom',message:'An actual flight context retains its selected actor and real above-surface height without invented XY motion.'})
  const pending=state.pendingCombatRound
  if(pending&&(pending.tickEndsAt!==pending.tickStartsAt+6||pending.at<pending.tickStartsAt||pending.at>pending.tickEndsAt
    ||pending.roundEventsResolved&&pending.at!==pending.tickEndsAt||pending.awaitingCombatClosure&&!pending.roundEventsResolved))
    ctx.addIssue({code:'custom',message:'An environmental round continuation retains one actual requested six-second tick and its exact clock cursor.'})
})
export type WeatherState=z.infer<typeof WeatherStateSchema>
export type WeatherContext=z.infer<typeof Context>
export type WeatherProfile=z.infer<typeof Profile>
export type ThermalWeatherEvent=z.infer<typeof WeatherEvent>
export type WeatherContextInput=z.infer<typeof WeatherContextInputSchema>
export type ExposureInput=z.infer<typeof ExposureInputSchema>
export type WeatherClothingInput=z.infer<typeof WeatherClothingInputSchema>
export const weatherContextKey=(mapId:string,roomId:string)=>JSON.stringify([mapId,roomId])
export const weatherStateOf=(state:GameState):WeatherState|undefined=>state.dmTools?.weather
/** Witness of one already requested six-second round tick, never a new turn. */
export function weatherRoundPauseValid(state:GameState){
  const weather=weatherStateOf(state),pending=weather?.pendingCombatRound
  if(!pending)return false
  const at=state.worldTimeSeconds??0
  if(state.phase!=='combat'||state.currentTurn!==null||pending.round!==state.round||pending.generation!==(state.combatGeneration??0)
    ||pending.mapId!==state.currentMapId||pending.at!==at||pending.tickEndsAt!==pending.tickStartsAt+6
    ||pending.requestedFromTurnCounter!==(state.turnCounter??0)-1)return false
  if(pending.eventIds.some(id=>!weather!.events[id]||weather!.events[id].at<pending.tickStartsAt||weather!.events[id].at>at))return false
  if(pending.awaitingCombatClosure)return pending.roundEventsResolved&&at===pending.tickEndsAt
  const due=Object.values(weather!.events).some(event=>event.status!=='resolved'&&event.at===at)
  const nutrition=state.dmTools?.survival
  const nutritionDue=Boolean(nutrition&&nutrition.status==='active'&&nutrition.day.index===pending.nutritionDayIndex&&nutrition.day.endsAt<=at)
  const cackleOnset=cackleIncubationBoundary(state,at)
  const cackleDue=Boolean(pending.cackleFeverAfflictionId&&cackleOnset?.id===pending.cackleFeverAfflictionId)
  if(pending.cackleFeverAfflictionId&&!cackleDue)return false
  const sewerOnset = sewerPlagueIncubationBoundary(state, at)
  const sewerDue = Boolean(pending.sewerPlagueAfflictionId && sewerOnset?.id === pending.sewerPlagueAfflictionId)
  if (pending.sewerPlagueAfflictionId && !sewerDue) return false
  return at>=pending.tickStartsAt&&at<=pending.tickEndsAt&&!pending.roundEventsResolved&&(due||nutritionDue||sewerDue||cackleDue||dueFrigidWaterSave(state)?.at===at)
}
export function weatherAtCell(state:GameState,cell:{x:number;y:number},mapId=state.currentMapId??''){
  const roomId=inferRoomIdOnMap(cell,mapId,state)
  return roomId?weatherStateOf(state)?.contexts[weatherContextKey(mapId,roomId)]:undefined
}
export function weatherAtActor(state:GameState,entityId:string){const actor=entityId==='player'?state.player:state.monsters[entityId]??state.npcs?.[entityId];return actor?weatherAtCell(state,actor.position):undefined}
function rayWeather(state:GameState,from:{x:number;y:number},to:{x:number;y:number}){
  const contexts=new Map<string,WeatherContext>(),steps=Math.max(Math.abs(from.x-to.x),Math.abs(from.y-to.y))
  for(let step=0;step<=steps;step++){
    const cell=steps?{x:Math.round(from.x+(to.x-from.x)*step/steps),y:Math.round(from.y+(to.y-from.y)*step/steps)}:from
    const context=weatherAtCell(state,cell)
    if(context)contexts.set(weatherContextKey(context.mapId,context.roomId),context)
  }
  return [...contexts.values()]
}
export function weatherPerceptionDisadvantage(state:GameState,entityId:string,sense:PerceptionSense,targetCell?:{x:number;y:number}){
  if(!weatherStateOf(state))return false
  const actor=entityId==='player'?state.player:state.monsters[entityId]??state.npcs?.[entityId],atActor=weatherAtActor(state,entityId)
  if(sense==='hearing')return Boolean(atActor&&(atActor.strongWind||atActor.precipitation==='heavy_rain'))
  if(sense!=='sight')return false
  const contexts=actor&&targetCell?rayWeather(state,actor.position,targetCell):atActor?[atActor]:[]
  return contexts.some(context=>context.sandstorm||context.precipitation!=='none'||context.fog!=='none'&&!context.fogDispersed)
}
export function weatherObscurationBetween(state:GameState,from:{x:number;y:number},to:{x:number;y:number}){
  if(!weatherStateOf(state))return{heavy:false,light:false}
  const contexts=rayWeather(state,from,to)
  return {heavy:contexts.some(context=>context.fog==='heavy'&&!context.fogDispersed),
    light:contexts.some(context=>context.precipitation!=='none'||context.sandstorm||context.fog==='light'&&!context.fogDispersed)}
}
export function weatherObscurationAt(state:GameState,cell:{x:number;y:number}){
  const context=weatherAtCell(state,cell)
  return {heavy:Boolean(context&&context.fog==='heavy'&&!context.fogDispersed),
    light:Boolean(context&&(context.precipitation!=='none'||context.sandstorm||context.fog==='light'&&!context.fogDispersed))}
}
export function weatherActorHeight(state:GameState,entityId:string){const native=actualNativeFlightLocation(state,entityId);if(native)return{known:true,airborne:native.airborne,heightFeet:native.point.zFeet-native.datumZFeet,revision:native.revision};const flight=weatherStateOf(state)?.flights[entityId];return flight?{known:flight.heightFeet!==null,airborne:flight.airborne,heightFeet:flight.heightFeet,revision:flight.revision}: {known:false,airborne:false,heightFeet:0,revision:0}}
const needsHeightGeometry=(state:GameState,id:string)=>{const height=weatherActorHeight(state,id);return height.airborne&&(height.known||weatherAtActor(state,id)?.strongWind===true)}
export function weatherHeightCombatIssue(state:GameState,entityIds:readonly string[]){
 const selectedIds=[...new Set(entityIds)];if(selectedIds.length===2&&spatialWeaponResolution(state,selectedIds[0],selectedIds[1]))return null
  const ids=[...new Set(entityIds)],airborne=ids.filter(id=>needsHeightGeometry(state,id))
  return airborne.length&&ids.length>1?{code:'WEATHER_HEIGHT_3D_TARGETING_UNSUPPORTED',message:'Actual above-surface flight height is known. This engine has no reviewed3D attack/reach/cover geometry for those targets; resolve a real landing/fall instead of ignoring their height.',entityIds:airborne}:null
}
export function weatherHeightPointIssue(state:GameState,entityIds:readonly string[]){
  const airborne=[...new Set(entityIds)].filter(id=>needsHeightGeometry(state,id))
  return airborne.length?{code:'WEATHER_HEIGHT_3D_POINT_UNSUPPORTED',message:'This actual airborne actor interacts with an XY point/area whose altitude and3D geometry are not represented. Resolve real vertical positioning before costs; no height is silently ignored.',entityIds:airborne}:null
}
export function weatherFlightTurnIssue(state:GameState,entityId:string){
  const flight=weatherActorHeight(state,entityId)
  return flight.airborne&&weatherAtActor(state,entityId)?.strongWind?{code:'WEATHER_FLIGHT_LANDING_REQUIRED',message:'This actual airborne creature is in strong wind. Before ending its turn, explicitly land using its real remaining movement or resolve its actual completed fall; hover/magic is not a wind exemption.',entityId,heightFeet:flight.heightFeet}:null
}
export function weatherRangedWeaponContext(state:GameState,attackerId:string,targetId:string){
  const actor=attackerId==='player'?state.player:state.monsters[attackerId]??state.npcs?.[attackerId],target=targetId==='player'?state.player:state.monsters[targetId]??state.npcs?.[targetId]
  const witnesses=new Map<string,{key:string;revision:number;strongWind:boolean}>()
  if(actor&&target){
    const steps=Math.max(Math.abs(actor.position.x-target.position.x),Math.abs(actor.position.y-target.position.y))
    for(let step=0;step<=steps;step++){
      const cell=steps?{x:Math.round(actor.position.x+(target.position.x-actor.position.x)*step/steps),y:Math.round(actor.position.y+(target.position.y-actor.position.y)*step/steps)}:actor.position
      const context=weatherAtCell(state,cell)
      if(context?.strongWind){const key=weatherContextKey(context.mapId,context.roomId);witnesses.set(key,{key,revision:context.revision,strongWind:true})}
    }
  }
  return {strongWindDisadvantage:witnesses.size>0,weatherWitnesses:[...witnesses.values()],
    heightWitnesses:[...new Set([attackerId,targetId])].map(entityId=>({entityId,...weatherActorHeight(state,entityId)})),source:'DMG2014 Strong Wind p110'}
}
export function weatherDueEvents(state:GameState){return Object.values(weatherStateOf(state)?.events??{}).filter(event=>event.status!=='resolved')}
export function weatherDueIssue(state:GameState){const events=weatherDueEvents(state);return events.length?{code:'WEATHER_EVENT_DUE',message:'Resolve the actual due thermal exposure events before another action, actor or clock advance.',eventIds:events.map(event=>event.eventId)}:null}


export function weatherRangedPointWeaponContext(state:GameState,attackerId:string,targetCell:{x:number;y:number}){
  const actor=attackerId==='player'?state.player:state.monsters[attackerId]??state.npcs?.[attackerId],target={position:targetCell}
  const witnesses=new Map<string,{key:string;revision:number;strongWind:boolean}>()
  if(actor&&target){
    const steps=Math.max(Math.abs(actor.position.x-target.position.x),Math.abs(actor.position.y-target.position.y))
    for(let step=0;step<=steps;step++){
      const cell=steps?{x:Math.round(actor.position.x+(target.position.x-actor.position.x)*step/steps),y:Math.round(actor.position.y+(target.position.y-actor.position.y)*step/steps)}:actor.position
      const context=weatherAtCell(state,cell)
      if(context?.strongWind){const key=weatherContextKey(context.mapId,context.roomId);witnesses.set(key,{key,revision:context.revision,strongWind:true})}
    }
  }
  return {strongWindDisadvantage:witnesses.size>0,weatherWitnesses:[...witnesses.values()],
    heightWitnesses:[attackerId].map(entityId=>({entityId,...weatherActorHeight(state,entityId)})),source:'DMG2014 Strong Wind p110'}
}
