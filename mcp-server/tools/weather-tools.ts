import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { WeatherContextInputSchema, ExposureInputSchema, WeatherClothingInputSchema } from '../../lib/weather-state'
import { inspectWeather, configureWeather, recordWeatherExposure, wearWeatherClothing, resolveWeatherEvent, registerWeatherContinuations } from '../weather'
import { toolkitResult, toolkitTransaction } from '../toolkit'
import { FlightObservationSchema,VerticalFlightSchema,observeWeatherFlight,moveWeatherFlight } from '../weather-flight'
export function registerWeatherTools(server:McpServer){
  registerWeatherContinuations()
  server.registerTool('record_flight_height',{
    description:'Explicit physical observation of an actual source native hover flyer height above the current supporting surface, with existing creature-specific fact. Fills unknown height after an actual fly move, or records already established physical flight; never grants a flying trait or changes known height through a nonce. Sea-level altitude is distinct. Walking does not grant a free landing.',
    inputSchema:FlightObservationSchema.shape,
  },async input=>toolkitTransaction(()=>toolkitResult(observeWeatherFlight(input))))
  server.registerTool('move_vertical_flight',{
    description:'Actual native supported hover flyer vertical movement at the same XY cell. Pays the true vertical distance from the current known surface height and remaining flying movement; a real landing needs an established supporting surface fact and free ground cell. No extra time, teleport, free landing, paired load, automatic opportunity decision, or hover wind exemption. Unrepresented nearby3D enemy reach refuses before movement. After strong wind, an actual flying creature must explicitly land before ending its turn or explicitly resolve its real completed fall with resolve_fall.',
    inputSchema:VerticalFlightSchema.shape,
  },async input=>toolkitTransaction(()=>toolkitResult(moveWeatherFlight(input))))
  server.registerTool('inspect_weather',{
    description:'Read actual recorded physical room weather, exposure doses, due hourly events and source flight contexts. No weather roll, Constitution save, gear, adaptation, exposure, water, time, light extinction or position is inferred or mutated.',
    inputSchema:{entityId:z.string().min(1).max(180).optional()},annotations:{readOnlyHint:true,idempotentHint:true},
  },async({entityId})=>toolkitTransaction(()=>toolkitResult(inspectWeather(entityId))))
  server.registerTool('configure_weather',{
    description:'Explicit MJ physical weather facts for ONE actual existing room of the active map: actual temperature Fahrenheit, strong wind, heavy rain/snow, actual sandstorm and ordinary physical fog. No random weather roll or inferred exposure from player text. Strong wind disperses the ordinary fog and wind/heavy rain extinguish only actual open flames with remaining fuel preserved; ambiguous simple lamps require their real per-instance protection fact before mutation. Weather never changes fogOfWar or dispels an unimplemented magical fog spell. New event IDs/revisions do not reset creature exposure history. No scene/gear/water/position is created.',
    inputSchema:WeatherContextInputSchema,
  },async input=>toolkitTransaction(()=>toolkitResult(configureWeather(input))))
  server.registerTool('record_weather_exposure',{
    description:'MJ observation of an ACTUAL active creature current exposure, breathing physiology and feet above sea level, with one explicitly known initial partial-hour/acclimation history. Begin ONCE; updates preserve recorded doses and hourly difficulty. Native adaptation/breathlessness requires an existing real physiology fact, not class/name inference or a free resistance grant. Water access uses actual quantified resources/reach; unknown NPC inventory or full legacy-container history remains unresolved unless actual absence is established. A real condition ending or actual access to drinkable water closes its continuous heat episode as an announced engine interpretation; a nonce does not. Unknown intervals off map are never fabricated as previous saves. No XY/vertical movement, trait, meal or earlier roll is created.',
    inputSchema:ExposureInputSchema,
  },async input=>toolkitTransaction(()=>toolkitResult(recordWeatherExposure(input))))
  server.registerTool('wear_weather_clothing',{
    description:'Actually wear/remove one exact owned ordinary physical garment under its existing item-specific fact: source cold-weather gear and/or heavy clothing. No item, armor AC or magical resistance is granted. Uses the actual object interaction then action in combat; absent/deposited gear gives no exemption and pickup never automatically rew wears it. Classification is immutable for this actual instance; no narrative name parsing. Current wearing is used at the real hourly event, never changed retroactively for an already due save.',
    inputSchema:WeatherClothingInputSchema.shape,
  },async input=>toolkitTransaction(()=>toolkitResult(wearWeatherClothing(input))))
  server.registerTool('resolve_weather_event',{
    description:'Explicitly resolve ONE actually due DMG2014 hourly cold/heat event. Cold DC10; heat DC5 then+1 per additional hour in the same real continuous unsafe-heat episode. Real existing defenses/worn gear/adaptation can automatically succeed without a die or inspiration spend. Actual medium/heavy armor or heavy clothing imposes heat-save disadvantage. Uses true CON/proficiencies/exhaustion/inspiration and held original dice; failure adds one actual exhaustion level unless source immune, dead bodies receive no new save. Replay cannot reroll or reapply. Actual simultaneous nutrition/forced-march events are resolved by explicit MJ order, never invented server calls. No clock/action/weather/position is created by inspection.',
    inputSchema:{eventId:z.string().min(1).max(500)},
  },async({eventId})=>toolkitTransaction(()=>resolveWeatherEvent(eventId)))
}
