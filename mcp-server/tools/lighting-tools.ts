import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { IlluminationSchema, LIGHTING_SOURCE, LightDirectionSchema,LightWeatherProtectionInputSchema } from '../../lib/lighting-state'
import { setLightWeatherProtection } from '../weather-flames'
import { activeLights, lightFuelRemaining, visualPerceptionAt } from '../../lib/lighting'
import { getAdventureMap, firstMapId } from '../../lib/adventure-map'
import { ToolkitCellSchema, ToolkitIdSchema } from '../../lib/dm-tool-state'
import { toolkitError, toolkitResult, toolkitTransaction } from '../toolkit'
import { lightingState, manageLightSource } from '../lighting'
import { available, now, spendHeroAction } from '../hero-rules'
import { heroAbilityCheck } from '../hero-checks'
import * as rules from '../rules'
import * as gs from '../game-state'

export function registerLightingTools(server:McpServer){
  server.registerTool('set_light_weather_protection',{
    description:'Explicit MJ physical source fact for one existing simple lamp: open flame or actually enclosed/protected. Requires a real existing factId and source; never infers protection from an item name, creates an item, changes canonical torches/candles or closed lanterns, dispels magical light, rolls or spends an action. Same eventId is immutable. A real newly exposed burning lamp obeys the currently established wind/rain immediately; original fuel is never refilled.',
    inputSchema:LightWeatherProtectionInputSchema.shape,annotations:{readOnlyHint:false,idempotentHint:true},
  },async input=>toolkitTransaction(()=>toolkitResult(setLightWeatherProtection(input))))
  server.registerTool('configure_scene_lighting',{
    description:'MJ preparation outside combat: establish ordinary ambient light (bright/dim/darkness) in one explicit existing room of the current map. No source, spell, fuel, senses or discoveries are granted. Historical unspecified rooms retain bright light; do not infer lighting from player text. Magical darkness, fog, sunlight traits and time-of-day simulation are not implemented by this tool.',
    inputSchema:{roomId:ToolkitIdSchema,illumination:IlluminationSchema},
  },async input=>toolkitTransaction(()=>{
    available();const state=gs.getState(),mapId=state.currentMapId??firstMapId(state)
    if(state.phase==='combat')toolkitError('LIGHTING_PREPARATION_OUTSIDE_COMBAT','Establish ambient lighting before combat, not to alter a pending attack.')
    if(!getAdventureMap(state).rooms.some(room=>room.id===input.roomId&&(room.mapId??firstMapId(state))===mapId))toolkitError('LIGHTING_ROOM_UNKNOWN','Choose an existing room of the active map.')
    const data=lightingState();data.ambient[mapId]??={};data.ambient[mapId][input.roomId]=input.illumination
    return toolkitResult({success:true,mapId,...input,source:LIGHTING_SOURCE,notice:'Scene illumination established; no player discovery or new light source.'})
  }))
  server.registerTool('manage_light_source',{
    description:'Manage an exact real held or touch-reachable ground torch, candle, lamp or lantern. Light/extinguish cost an action in combat. New oil lamps/lanterns start EMPTY: refuel consumes one exact owned oil_flask (one pint) for six hours, only while unlit; explicitly discardRemainingFuel to replace nonempty oil rather than invent partial flasks. Torches/candles last one hour and cannot refill. Hooded lantern: raised bright30+dim30ft; lowered dim5ft, lowering costs an action. Bullseye: explicit persistent nonzero grid direction, cone bright60+dim60ft, width equals forward distance, origin excluded unless includeOrigin chosen. Lamp bright15+dim30ft. Refuel, aim and raising hood use an object interaction (first free, later action). Aim requires direction; set_hood requires hood. Light may choose direction/includeOrigin for bullseye. No auto-facing, free fuel, implicit pickup or purchase. Time burns while packed/off map; packed sources shed no usable light.',
    inputSchema:{itemId:ToolkitIdSchema,operation:z.enum(['light','extinguish','refuel','set_hood','aim']),
      fuelItemId:ToolkitIdSchema.optional(),direction:LightDirectionSchema.optional(),includeOrigin:z.boolean().optional(),
      hood:z.enum(['raised','lowered']).optional(),discardRemainingFuel:z.boolean().optional()},
  },async input=>toolkitTransaction(()=>toolkitResult(manageLightSource(input.itemId,input.operation,{
    fuelItemId:input.fuelItemId,direction:input.direction,includeOrigin:input.includeOrigin,hood:input.hood,discardRemainingFuel:input.discardRemainingFuel}))))
  server.registerTool('inspect_lighting',{
    description:'Read the actual active-map light at an explicit cell for an existing actor, including clear physical ray, sourced darkvision range, effective perceived light, monochrome darkness vision and visual Perception disadvantage. Optional itemId reads that exact source fuel without modifying it. This never discovers a trap/secret, spends an action, rolls a die or changes light. No darkvision is inferred from class or prose.',
    inputSchema:{cell:ToolkitCellSchema,actorId:z.string().default('player'),itemId:ToolkitIdSchema.optional()},annotations:{readOnlyHint:true},
  },async input=>toolkitTransaction(()=>{
    rules.validateMapCell(input.cell);const actor=gs.getEntity(input.actorId)
    if(!actor)toolkitError('ENTITY_NOT_FOUND','Choose an actual engine actor.')
    const source=input.itemId?gs.getState().dmTools?.lighting?.sources[input.itemId]:undefined
    if(input.itemId&&!source)toolkitError('LIGHT_SOURCE_UNKNOWN','This item has no managed light source record.')
    return toolkitResult({...visualPerceptionAt(gs.getState(),actor!,input.cell),cell:input.cell,actorId:input.actorId,
      activeLights:activeLights(gs.getState()),...(source?{itemId:source.itemId,kind:source.kind,
        remainingSeconds:lightFuelRemaining(source,now()),lit:source.litAt!==undefined&&lightFuelRemaining(source,now())>0,
        ...(source.kind==='hooded_lantern'?{hood:source.hood??'raised'}:{}),
        ...(source.kind==='bullseye_lantern'?{direction:source.direction,includeOrigin:source.includeOrigin??false}:{})}: {})})
  }))
  server.registerTool('resolve_visual_perception',{
    description:'Resolve one explicitly visual Wisdom (Perception) check by the player toward an exact cell and chosen DC. Actual light and sourced darkvision determine sight: dim light imposes disadvantage; darkness/blocked vision/blindness fails automatically with no die. One action in combat, including failure. Uses the existing Bardic Inspiration continuation on rolled checks. No automatic trap/clue discovery, color recognition in darkvision darkness, hearing test, target inference or preliminary generic roll.',
    inputSchema:{cell:ToolkitCellSchema,dc:z.number().int().min(1).max(40)},
  },async input=>toolkitTransaction(()=>{
    available();rules.validateActionUse('player');rules.validateMapCell(input.cell)
    const perception=visualPerceptionAt(gs.getState(),gs.getPlayer(),input.cell)
    if(!perception.canSee){spendHeroAction();return toolkitResult({success:false,automaticFailure:true,perception,
      mechanicalSummary:'Perception visuelle impossible : vision bloquée ou obscurité non compensée. Échec automatique, aucun dé lancé ; une action en combat.'})}
    return heroAbilityCheck({entityId:'player',ability:'wis',skill:'perception',perceptionSense:'sight',dc:input.dc,sightBased:true,
      label:'Perception visuelle',disadvantage:perception.visualDisadvantage,advantageReason:perception.visualDisadvantage?'Éclairage perçu faible : zone légèrement obscurcie.':undefined})
  }))
}
