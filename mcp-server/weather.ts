import { WeatherContextInputSchema, ExposureInputSchema, WeatherClothingInputSchema, WEATHER_HOUR_SECONDS, ALTITUDE_ACCLIMATION_SECONDS,
  weatherStateOf, weatherContextKey, weatherAtActor, weatherAtCell, weatherDueEvents, weatherDueIssue, weatherActorHeight,
  type WeatherState, type WeatherContextInput, type ExposureInput, type WeatherClothingInput, type WeatherProfile, type ThermalWeatherEvent } from '../lib/weather-state'
import { armorPenalties } from '../lib/armor-penalties'
import { lightFuelRemaining } from '../lib/lighting'
import { getMonsterRecord } from '../lib/srd/monsters'
import type { GameState, PlayerState, MonsterState, SavingThrowResult } from '../lib/types'
import { lightingRay } from '../lib/lighting'
import { getAdventureMap, firstMapId } from '../lib/adventure-map'
import * as gs from './game-state'
import * as rules from './rules'
import { available, hero, now, effects } from './hero-rules'
import { toolkitState, toolkitError, toolkitResult } from './toolkit'
import { monsterSource, conditionImmune } from './monster-rules'
import { changeExhaustion, inspectExhaustion } from './exhaustion'
import { spendObjectInteraction } from './equipment'
import { registerCheckedResolution, savedResolution } from './toolkit-checks'
import { assertWeatherFlameExposure } from './weather-flames'
import { reconcileWeatherLightSources } from './weather-flames'
import { reconcileOilWeather } from './oil-ground'
import { validateWeatherLightProtection } from '../lib/weather-light'

type Body=PlayerState|MonsterState
const saved=()=>weatherStateOf(gs.getState())
const data=():WeatherState=>toolkitState().weather??={version:1,contexts:{},profiles:{},clothing:{},events:{},flights:{},receipts:{}}
export { data as ensureWeatherState }
const living=(actor:Body)=>actor.id==='player'?!(actor as PlayerState).deathSaves?.dead:(actor as MonsterState).isAlive
function actual(id:string){return gs.getEntity(id)??toolkitError('WEATHER_ACTIVE_ACTOR_REQUIRED','Choose an actual active creature with real statistics; no archive or narrative NPC is activated.')}
function receipt(eventId:string,command:string){const old=saved()?.receipts[eventId];if(old&&old.command!==command)toolkitError('WEATHER_EVENT_CONFLICT','This retained context event has another immutable operation.');return old?{...old.result,replayed:true}:undefined}
function historyRoom(){if(Object.keys(saved()?.receipts??{}).length>=2048)toolkitError('WEATHER_HISTORY_LIMIT','Weather context/event receipts are full; no physical history is discarded.')}
function remember(eventId:string,command:string,result:Record<string,unknown>){data().receipts[eventId]={command,result};return result}
function sourceFact(id:string,entityId?:string){const fact=gs.getState().worldFacts?.find(fact=>fact.id===id);if(!fact)toolkitError('WEATHER_SOURCE_FACT_REQUIRED','Choose an existing actual physiology/equipment/history fact; no adaptation, breathlessness or protection is inferred.');return structuredClone(fact!) as unknown as Record<string,unknown>}
function wornClothing(state=gs.getState()){
  return Object.values(weatherStateOf(state)?.clothing??{}).filter(record=>record.worn&&state.player.inventory.some(item=>item.id===record.itemId))
}
function thermalQualification(entityId:string,kind:'cold'|'heat'){
  const state=gs.getState(),actor=actual(entityId),profile=saved()?.profiles[entityId],native=monsterSource(actor)
  const type=kind==='cold'?'cold':'fire',reasons:string[]=[]
  if(native?.damage_immunities.includes(type))reasons.push(`actual_native_${type}_immunity`)
  if(native?.damage_resistances.includes(type)||actor.conditions.includes('petrified'))reasons.push(`actual_${type}_resistance`)
  if(kind==='cold'&&profile?.nativeColdFactId)reasons.push('actual_sourced_natural_cold_adaptation')
  if(kind==='heat'&&profile?.nativeHeatFactId)reasons.push('actual_sourced_natural_heat_adaptation')
  const clothes=entityId==='player'?wornClothing(state):[]
  if(kind==='cold'&&clothes.some(record=>record.coldWeatherGear))reasons.push('actual_owned_worn_cold_weather_gear')
  let armorDisadvantage=false
  if(entityId==='player')armorDisadvantage=armorPenalties(state).worn.some(item=>item.category==='medium'||item.category==='heavy')
  else{
    const source=getMonsterRecord((actor as MonsterState).type)?.source
    const armor=source?.armor_class as Array<{armor?:Array<{index:string}>}>|undefined
    const heavyMedium=new Set(['hide-armor','chain-shirt','scale-mail','breastplate','half-plate-armor','ring-mail','chain-mail','splint-armor','plate-armor'])
    armorDisadvantage=Boolean(armor?.some(entry=>entry.armor?.some(item=>heavyMedium.has(item.index))))
  }
  return {automaticSuccess:reasons.length>0,automaticReason:reasons,disadvantage:kind==='heat'&&(armorDisadvantage||clothes.some(record=>record.heavyClothing))}
}
/** Actual quantities and reach only. This is neither consumption nor a purity
 * certificate. Unknown NPC inventory/legacy full-container history stays unknown. */
export function weatherWaterAccess(entityId:string,state=gs.getState()):'available'|'none'|'unresolved'{
  const actor=entityId==='player'?state.player:state.monsters[entityId],profile=weatherStateOf(state)?.profiles[entityId]
  if(!actor)return 'unresolved'
  if(entityId==='player'){
    for(const item of state.player.inventory){
      const tracked=state.dmTools?.foraging?.containers[item.id]
      if(tracked&&tracked.contentsQuarterPints>0&&!tracked.hazardFactIds.length)return 'available'
      const legacy=state.dmTools?.survival?.provisions[item.id]
      if(legacy?.kind==='waterskin_full'&&legacy.remainingUnits>0)return 'available'
    }
  }
  if(!weatherActorHeight(state,entityId).airborne){
    for(const source of Object.values(state.dmTools?.waterSources?.sources??{})){
      const object=state.dmTools?.objects[source.objectId]
      if(!object||object.state==='destroyed'||object.locked||object.kind==='container'&&object.state!=='open'
        ||source.mapId!==state.currentMapId||object.creation!==source.objectCreation||object.cell.x!==source.cell.x||object.cell.y!==source.cell.y
        ||source.hazardFactIds.length||source.kind==='finite'&&source.remainingQuarterPints!<1)continue
      const view={...state,dmTools:{...state.dmTools!,objects:Object.fromEntries(Object.entries(state.dmTools!.objects).filter(([id])=>id!==source.objectId))}}
      if(Math.max(Math.abs(actor.position.x-source.cell.x),Math.abs(actor.position.y-source.cell.y))<=1&&lightingRay(view,actor.position,source.cell))return 'available'
    }
    for(const[itemId,dropped]of Object.entries(state.droppedItems??{})){
      const container=state.dmTools?.foraging?.containers[itemId]
      if(container&&container.contentsQuarterPints>0&&!container.hazardFactIds.length&&dropped.mapId===state.currentMapId
        &&Math.max(Math.abs(actor.position.x-dropped.position.x),Math.abs(actor.position.y-dropped.position.y))<=1&&lightingRay(state,actor.position,dropped.position))return 'available'
    }
  }
  if(profile?.noOtherWaterAccessFactId)return 'none'
  if(entityId!=='player')return 'unresolved'
  return state.player.inventory.some(item=>(item.equipmentId??item.id)==='waterskin_full'&&!state.dmTools?.foraging?.containers[item.id]
    &&!state.dmTools?.survival?.provisions[item.id])?'unresolved':'none'
}
function climate(profile:WeatherProfile,strict=false){
  const actor=gs.getEntity(profile.entityId),active=Boolean(actor)
  if(!active)return {active:false,living:false,cold:false,heat:false,unresolved:false,context:undefined}
  if(profile.mapId!==gs.getState().currentMapId){if(strict)toolkitError('WEATHER_LOCATION_CONTEXT_REQUIRED','This actor moved to another actual map. Establish its real current elevation/exposure without resetting accumulated history.');return {active:true,living:living(actor!),cold:false,heat:false,unresolved:true,context:undefined}}
  if(!living(actor!))return {active:true,living:false,cold:false,heat:false,unresolved:false,context:undefined}
  const context=weatherAtActor(gs.getState(),profile.entityId)
  if(profile.exposed&&!context){if(strict)toolkitError('WEATHER_CONTEXT_REQUIRED','Establish the actual current room weather or actual shelter before advancing a previously tracked exposure.');return {active:true,living:true,cold:false,heat:false,unresolved:true,context}}
  const hot=Boolean(profile.exposed&&context&&context.temperatureF>=100),water=hot?weatherWaterAccess(profile.entityId):'none'
  if(water==='unresolved'&&strict)toolkitError('WEATHER_WATER_HISTORY_REQUIRED','Actual access to drinkable water is unresolved. Establish real current quantities/reach or an actual absence fact before the heat interval; no full legacy container or NPC inventory is invented.')
  return {active:true,living:true,cold:Boolean(profile.exposed&&context&&context.temperatureF<=0),heat:hot&&water==='none',unresolved:water==='unresolved',context}
}
function phase(profile:WeatherProfile,facts:ReturnType<typeof climate>){
  if(facts.unresolved)return
  if(!facts.cold){profile.coldPartialSeconds=0;profile.coldEpisodeHours=0}
  else if(!profile.lastColdExposed){profile.coldEpisodeNumber++;profile.coldPartialSeconds=0;profile.coldEpisodeHours=0}
  if(!facts.heat){profile.heatPartialSeconds=0;profile.heatEpisodeHours=0}
  else if(!profile.lastHeatUnsafe){profile.heatEpisodeNumber++;profile.heatPartialSeconds=0;profile.heatEpisodeHours=0}
  profile.lastColdExposed=facts.cold;profile.lastHeatUnsafe=facts.heat
}
function eventAt(profile:WeatherProfile,kind:'cold'|'heat',at:number){
  const context=weatherAtActor(gs.getState(),profile.entityId)!,qualification=thermalQualification(profile.entityId,kind)
  const sequence=kind==='cold'?++profile.coldSequence:++profile.heatSequence
  const hourNumber=kind==='cold'?++profile.coldEpisodeHours:++profile.heatEpisodeHours
  const event:ThermalWeatherEvent={eventId:`weather:${profile.entityId}:${kind}:${sequence}`,entityId:profile.entityId,kind,sequence,
    episodeNumber:kind==='cold'?profile.coldEpisodeNumber:profile.heatEpisodeNumber,hourNumber,at,dc:kind==='cold'?10:4+hourNumber,
    context:structuredClone(context),...qualification,status:'due'}
  data().events[event.eventId]=event
}
/** Called only at the actual internal clock cursor, including an exact hourly
 * boundary inside one admitted six-second combat tick. Never rolls a die. */
export function syncWeatherClock(at=now()){
  if(!saved())return
  for(const profile of Object.values(saved()!.profiles)){
    if(at<profile.lastAt)continue
    const facts=climate(profile),elapsed=at-profile.lastAt
    if(!facts.active){if(elapsed>0)profile.unobservedSince??=profile.lastAt;profile.lastAt=at;continue}
    if(profile.unobservedSince!==undefined){profile.lastAt=at;continue}
    phase(profile,facts)
    if(facts.living&&!facts.unresolved){
      if(facts.cold)profile.coldPartialSeconds+=elapsed
      if(facts.heat)profile.heatPartialSeconds+=elapsed
      if(profile.breathes&&profile.altitudeFeet>=10000&&(profile.altitudeFeet<=20000||profile.nativeHighAltitudeFactId))
        profile.acclimationSeconds=Math.min(ALTITUDE_ACCLIMATION_SECONDS,profile.acclimationSeconds+elapsed)
      if(profile.coldPartialSeconds>=WEATHER_HOUR_SECONDS){profile.coldPartialSeconds-=WEATHER_HOUR_SECONDS;eventAt(profile,'cold',at)}
      if(profile.heatPartialSeconds>=WEATHER_HOUR_SECONDS){profile.heatPartialSeconds-=WEATHER_HOUR_SECONDS;eventAt(profile,'heat',at)}
    }
    profile.lastAt=at
  }
}
export function weatherClockExpirations(until:number){
  const result:Array<{at:number;entityId:string;kind:'weather-hour';run:()=>void}>=[]
  for(const profile of Object.values(saved()?.profiles??{})){
    const facts=climate(profile)
    if(!facts.active||!facts.living||facts.unresolved||profile.unobservedSince!==undefined)continue
    const coldPartial=profile.lastColdExposed?profile.coldPartialSeconds:0,heatPartial=profile.lastHeatUnsafe?profile.heatPartialSeconds:0
    const at=Math.min(facts.cold?profile.lastAt+WEATHER_HOUR_SECONDS-coldPartial:Infinity,facts.heat?profile.lastAt+WEATHER_HOUR_SECONDS-heatPartial:Infinity)
    if(at<=until)result.push({at,entityId:profile.entityId,kind:'weather-hour',run:()=>syncWeatherClock(at)})
  }
  return result.sort((a,b)=>a.at-b.at||a.entityId.localeCompare(b.entityId))
}
export function assertWeatherTimeAdvance(seconds:number,options:{combatStep?:boolean}={}){
  if(seconds<=0)return
  const issue=weatherDueIssue(gs.getState());if(issue)toolkitError(issue.code,issue.message)
  for(const actor of [gs.getPlayer(),...Object.values(gs.getState().monsters)]){
    const context=weatherAtActor(gs.getState(),actor.id)
    if(living(actor)&&context&&(context.temperatureF<=0||context.temperatureF>=100)&&!saved()?.profiles[actor.id])
      toolkitError('WEATHER_EXPOSURE_HISTORY_REQUIRED','Record actual current creature exposure/physiology and known initial dose before this interval; no prior weather history is fabricated.')
  }
  for(const profile of Object.values(saved()?.profiles??{})){
    const facts=climate(profile,true)
    if(facts.active&&profile.unobservedSince!==undefined)toolkitError('WEATHER_HISTORY_GAP_REQUIRED','The returned actor has an actual unobserved interval. Reconcile its real absence before crediting more exposure or acclimation.')
    if(facts.active&&facts.living&&(facts.cold||facts.heat))inspectExhaustion(profile.entityId)
  }
  const due=weatherClockExpirations(now()+seconds)
  if(Object.keys(saved()?.events??{}).length+due.length>4096)toolkitError('WEATHER_EVENT_HISTORY_LIMIT','The actual next thermal boundaries need free source-event slots before time advances.')
  const first=due[0]?.at
  if(first!==undefined&&now()+seconds>first&&!(options.combatStep&&gs.getState().phase==='combat'&&seconds<=6))
    toolkitError('WEATHER_TIME_BOUNDARY',`Stop at the actual thermal hour in ${first-now()} seconds and explicitly resolve it before further time.`)
}
export function reconcileWeatherInventory(){
  if(!saved())return
  for(const record of Object.values(saved()!.clothing))if(record.worn&&!gs.getPlayer().inventory.some(item=>item.id===record.itemId))record.worn=false
  syncWeatherClock(now())
  reconcileWeatherFlames()
}
/** Only physical, actually exposed lights are affected. Packed and protected
 * lanterns do not become invented open flames; magical light is not dispelled. */
export function reconcileWeatherFlames(){
  const sources=reconcileWeatherLightSources()
  reconcileOilWeather()
  return sources
}
export function inspectWeather(entityId?:string){const profile=entityId?saved()?.profiles[entityId]:undefined;return {tracked:!!saved(),contexts:saved()?.contexts??{},profile:profile??null,
  events:weatherDueEvents(gs.getState()),flights:saved()?.flights??{},waterAccess:profile?weatherWaterAccess(profile.entityId):null,
  acclimated:profile?profile.acclimationSeconds>=ALTITUDE_ACCLIMATION_SECONDS&&(profile.altitudeFeet<=20000||Boolean(profile.nativeHighAltitudeFactId)):null,
  worldTimeSeconds:now(),diceRolled:false,positionChanged:false}}
export function configureWeather(raw:WeatherContextInput){
  const input=WeatherContextInputSchema.parse(raw),command=JSON.stringify({kind:'context',input}),old=receipt(input.eventId,command);if(old)return old
  available();historyRoom();syncWeatherClock(now());reconcileWeatherFlames()
  const mapId=gs.getState().currentMapId!,map=requireWeatherRoom(input.roomId),key=weatherContextKey(mapId,map.id),previous=saved()?.contexts[key]
  if(!previous&&Object.keys(saved()?.contexts??{}).length>=512)toolkitError('WEATHER_CONTEXT_LIMIT','The retained physical weather-area registry is full.')
  const next:WeatherState['contexts'][string]={mapId,roomId:input.roomId,revision:(previous?.revision??0)+1,temperatureF:input.temperatureF,strongWind:input.strongWind,
    precipitation:input.precipitation,sandstorm:input.sandstorm,fog:input.fog,fogDispersed:input.strongWind&&input.fog!=='none',source:input.source,at:now()}
  const state=gs.getState(),base=saved()??{version:1 as const,contexts:{},profiles:{},clothing:{},events:{},flights:{},receipts:{}}
  const future={...state,dmTools:{...(state.dmTools??{version:1 as const,objects:{},traps:{},npcs:{},itemUses:{}}),weather:{...base,contexts:{...base.contexts,[key]:next}}}}
  assertWeatherFlameExposure({},future)
  data().contexts[key]=next
  syncWeatherClock(now());const extinguished=reconcileWeatherFlames()
  return remember(input.eventId,command,{success:true,context:structuredClone(data().contexts[key]),extinguished,positionChanged:false,diceRolled:false})
}
function requireWeatherRoom(roomId:string){
  const state=gs.getState(),mapId=state.currentMapId??firstMapId(state)
  const room=getAdventureMap(state).rooms.find(room=>room.id===roomId&&(room.mapId??firstMapId(state))===mapId)
  if(!room)toolkitError('WEATHER_ROOM_REQUIRED','Select an actual existing room on the active map; no region or position is invented.')
  return room!
}
export function recordWeatherExposure(raw:ExposureInput){
  const input=ExposureInputSchema.parse(raw),command=JSON.stringify({kind:'exposure',input}),old=receipt(input.eventId,command);if(old)return old
  available();historyRoom();const actor=actual(input.entityId)
  if(!living(actor))toolkitError('WEATHER_LIVING_ACTOR_REQUIRED','A new exposure observation is for an actual living creature; it does not revive or add exhaustion to a corpse.')
  syncWeatherClock(now())
  const previous=saved()?.profiles[input.entityId]
  if(input.operation==='begin'&&previous)toolkitError('WEATHER_ALREADY_TRACKED','The real creature already has exposure history; a new nonce never restarts its thermal hour or acclimation.')
  if(input.operation==='update'&&!previous)toolkitError('WEATHER_EXPOSURE_REQUIRED','Begin once from actual known initial history before updating current physical exposure.')
  if(!previous&&Object.keys(saved()?.profiles??{}).length>=256)toolkitError('WEATHER_ACTOR_LIMIT','The retained actual exposure registry is full.')
  const proofKeys=['physiologyFactId','nativeColdFactId','nativeHeatFactId','nativeHighAltitudeFactId','noOtherWaterAccessFactId'] as const
  const facts={...(previous?.facts??{})}
  const proofs:Partial<Record<typeof proofKeys[number],string>>={}
  for(const key of proofKeys){const id=input[key]===undefined?previous?.[key]:input[key]??undefined;if(id){if(!facts[id])facts[id]=sourceFact(id,input.entityId);proofs[key]=id}}
  if(previous?.unobservedSince!==undefined){
    if(!input.unobservedNoExposureConfirmed||!input.historyFactId)toolkitError('WEATHER_HISTORY_GAP_REQUIRED','Explicitly reconcile the actual missing interval. Only a sourced no-unobserved-exposure checkpoint is currently supported; no previous CON saves or acclimation time are fabricated.')
    facts[input.historyFactId]=sourceFact(input.historyFactId,input.entityId)
  }
  let profile:WeatherProfile
  if(previous){
    profile=previous;profile.mapId=gs.getState().currentMapId!;profile.source=input.source;profile.exposed=input.exposed;profile.breathes=input.breathes;profile.altitudeFeet=input.altitudeFeet;profile.facts=facts
    for(const key of proofKeys)profile[key]=proofs[key]
    delete profile.unobservedSince
  }else{
    profile={entityId:input.entityId,mapId:gs.getState().currentMapId!,source:input.source,startedAt:now(),lastAt:now(),exposed:input.exposed,breathes:input.breathes,altitudeFeet:input.altitudeFeet,
      ...proofs,facts,coldPartialSeconds:input.knownColdPartialSeconds!,heatPartialSeconds:input.knownHeatPartialSeconds!,coldSequence:0,heatSequence:0,
      coldEpisodeNumber:1,heatEpisodeNumber:1,coldEpisodeHours:0,heatEpisodeHours:input.priorResolvedHeatHours!,priorResolvedHeatHours:input.priorResolvedHeatHours!,
      lastColdExposed:true,lastHeatUnsafe:true,acclimationSeconds:input.knownAcclimationSeconds!,
      initial:{knownColdPartialSeconds:input.knownColdPartialSeconds!,knownHeatPartialSeconds:input.knownHeatPartialSeconds!,priorResolvedHeatHours:input.priorResolvedHeatHours!,knownAcclimationSeconds:input.knownAcclimationSeconds!}}
    data().profiles[input.entityId]=profile
  }
  phase(profile,climate(profile))
  return remember(input.eventId,command,{success:true,profile:structuredClone(profile),pastSavesInvented:false,altitudePositionChanged:false})
}
export function wearWeatherClothing(raw:WeatherClothingInput){
  const input=WeatherClothingInputSchema.parse(raw),command=JSON.stringify({kind:'clothing',input}),old=receipt(input.eventId,command);if(old)return old
  available();historyRoom();const item=gs.getPlayer().inventory.find(item=>item.id===input.itemId)
  if(gs.getState().phase!=='combat')rules.validateActionUse('player')
  if(!item||item.type!=='misc'||item.magical)toolkitError('WEATHER_GARMENT_REQUIRED','Choose one actually owned ordinary garment instance; this tool creates no outfit, armor or magic property.')
  const previous=saved()?.clothing[input.itemId],fact=previous?.factId===input.factId?previous.fact:sourceFact(input.factId)
  if(fact.subjectItemId!==undefined&&fact.subjectItemId!==input.itemId)toolkitError('WEATHER_GARMENT_FACT_REQUIRED','The established physical garment fact identifies another item. Choose a real scene fact and explicitly associate this actual owned garment; no property is inferred from prose.')
  if(previous&&(previous.factId!==input.factId||previous.coldWeatherGear!==input.coldWeatherGear||previous.heavyClothing!==input.heavyClothing))
    toolkitError('WEATHER_GARMENT_PROFILE_CONFLICT','The retained physical garment classification cannot change through another wear event or nonce.')
  const wear=input.operation==='wear'
  if((previous?.worn??false)===wear)toolkitError('WEATHER_GARMENT_WEAR_UNCHANGED','The actual garment is already in that recorded worn state; no new action is paid.')
  if(!previous&&Object.keys(saved()?.clothing??{}).length>=256)toolkitError('WEATHER_GARMENT_LIMIT','The retained garment registry is full.')
  spendObjectInteraction()
  data().clothing[input.itemId]={itemId:input.itemId,coldWeatherGear:input.coldWeatherGear,heavyClothing:input.heavyClothing,worn:wear,factId:input.factId,fact,source:input.source}
  syncWeatherClock(now())
  gs.addLogEntry({round:gs.getState().round,turn:'player',action:wear?'Vêtement thermique porté':'Vêtement thermique retiré',mechanicalDetail:`${input.itemId} ; profil physique réellement établi ; ${input.source}`})
  return remember(input.eventId,command,{success:true,garment:structuredClone(data().clothing[input.itemId]),itemGranted:false,armorClassChanged:false})
}
function eventPreflight(event:ThermalWeatherEvent){
  const actor=actual(event.entityId),level=inspectExhaustion(event.entityId).level
  if(event.automaticSuccess||conditionImmune(actor,'exhaustion')||!living(actor))return
  if(Object.keys(gs.getState().dmTools?.exhaustion?.receipts??{}).length>=2048)toolkitError('EXHAUSTION_RECEIPT_LIMIT','A possible actual thermal failure needs a free exhaustion receipt before its die.')
  if(level>=5&&effects('death-ward',event.entityId).length)toolkitError('EXHAUSTION_DEATH_WARD_ADJUDICATION','Resolve the source interaction with Death Ward before this potentially fatal exhaustion save; no die or exhaustion was changed.')
}
function finishWeatherEvent(event:ThermalWeatherEvent,checked?:SavingThrowResult){
  const actor=actual(event.entityId),dead=!living(actor),before=inspectExhaustion(event.entityId).level,immune=conditionImmune(actor,'exhaustion')
  if(!dead&&!event.automaticSuccess&&checked&&!checked.success&&!immune)changeExhaustion({targetId:event.entityId,eventId:`\u0000${event.eventId}`,operation:'add',levels:1,
    reason:`DMG2014 actual ${event.kind} exposure episode ${event.episodeNumber}, completed hour ${event.hourNumber}, CON DC${event.dc}.`})
  const result={success:true,eventId:event.eventId,entityId:event.entityId,kind:event.kind,at:event.at,dc:event.dc,episodeNumber:event.episodeNumber,hourNumber:event.hourNumber,
    save:checked??null,automaticSuccess:event.automaticSuccess&&!dead,automaticReason:event.automaticReason,notRolled:!checked,
    exhaustionBefore:before,exhaustionAfter:inspectExhaustion(event.entityId).level,exhaustionImmune:immune,cancelledForActualDeath:dead}
  event.status='resolved';event.result=result
  const resumedCombatTurn=gs.completeSurvivalRoundTransition()
  const complete={...result,...(resumedCombatTurn===undefined?{}:{resumedCombatTurn})}
  event.result=complete
  return toolkitResult(complete)
}
export function registerWeatherContinuations(){registerCheckedResolution('weather-exposure',(command,checked)=>{
  const event=saved()?.events[String(command.eventId)]
  if(!event||event.status!=='held'||!('ability'in checked)||checked.entityId!==event.entityId||checked.ability!=='con'||checked.dc!==event.dc)
    toolkitError('WEATHER_CONTINUATION_MISMATCH','Resume only the original held Constitution save for this exact actual thermal hour.')
  return finishWeatherEvent(event!,checked as SavingThrowResult)
})}
export function resolveWeatherEvent(eventId:string){
  const event=saved()?.events[eventId]
  if(!event)toolkitError('WEATHER_EVENT_REQUIRED','Select an actually due exposure event, never a future hour or invented nonce.')
  if(event!.status==='resolved')return toolkitResult({...event!.result,replayed:true})
  const held=hero().pending,resolution=held?.command.toolkitResolution as {domain?:string;command?:{eventId?:string}}|undefined
  if(held&&resolution?.domain==='weather-exposure'&&resolution.command?.eventId===eventId)return toolkitResult({pendingReaction:held})
  available({allowWeatherDue:true,allowNutritionDue:true,allowTravelDue:true,allowCasting:true,allowSewerOnsetAt:event!.at,allowFrigidWaterDue:true})
  eventPreflight(event!)
  if(!living(actual(event!.entityId))||event!.automaticSuccess)return finishWeatherEvent(event!)
  event!.status='held'
  return savedResolution({entityId:event!.entityId,ability:'con',dc:event!.dc,sourceDisadvantage:event!.disadvantage},
    {domain:'weather-exposure',command:{eventId}})
}
export function weatherTravelMultiplier(entityId='player',state=gs.getState()){
  const profile=weatherStateOf(state)?.profiles[entityId]
  if(!profile)return 1
  if(profile.mapId!==state.currentMapId||profile.unobservedSince!==undefined)toolkitError('WEATHER_LOCATION_CONTEXT_REQUIRED','Establish this tracked traveler actual current elevation/history before the real walking interval.')
  const acclimated=profile.acclimationSeconds>=ALTITUDE_ACCLIMATION_SECONDS&&(profile.altitudeFeet<=20000||Boolean(profile.nativeHighAltitudeFactId))
  return profile.breathes&&profile.altitudeFeet>=10000&&!acclimated?2:1
}
export function weatherTravelAcclimationBoundary(entityId='player'){
  const profile=saved()?.profiles[entityId]
  return profile&&weatherTravelMultiplier(entityId)===2&&(profile.altitudeFeet<=20000||profile.nativeHighAltitudeFactId)
    ?Math.max(0,ALTITUDE_ACCLIMATION_SECONDS-profile.acclimationSeconds):undefined
}
export function validateWeatherState(state:GameState):string[]{
  const errors:string[]=validateWeatherLightProtection(state)
  const weather=weatherStateOf(state);if(!weather)return errors
  const at=state.worldTimeSeconds??0
  for(const profile of Object.values(weather.profiles))if(profile.startedAt>at||profile.lastAt>at
    ||(profile.entityId==='player'||state.monsters[profile.entityId])&&profile.lastAt!==at)
    errors.push('A tracked weather clock must retain the exact observed present or its real inactive-history gap, never skip elapsed active exposure.')
  for(const event of Object.values(weather.events)){
    if(event.at>at)errors.push('A thermal source event cannot be due in the future.')
    if(event.status!=='resolved'&&!(event.entityId==='player'||state.monsters[event.entityId]))errors.push('An unresolved actual thermal event cannot be archived or retargeted.')
    if(event.status==='held'){
      const resolution=state.hero?.pending?.command.toolkitResolution as {domain?:string;command?:{eventId?:string}}|undefined
      if(resolution?.domain!=='weather-exposure'||resolution.command?.eventId!==event.eventId)errors.push('A held thermal event requires its exact original saved Constitution-check witness.')
    }
  }
  for(const flight of Object.values(weather.flights))if(flight.startedAt>at)errors.push('An observed actual flight cannot begin in the future.')
  return errors
}
