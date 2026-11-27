import { LIGHT_TEMPLATES, isPhysicalLightKind, type LightSource, type LightDirection } from '../lib/lighting-state'
import { lightFuelRemaining, visualPerceptionAt } from '../lib/lighting'
import { assertToolkitReach, toolkitError, toolkitState } from './toolkit'
import { available, now, spendHeroAction } from './hero-rules'
import * as gs from './game-state'
import * as rules from './rules'
import { afterInventoryChange, spendObjectInteraction } from './equipment'
import { assertWeatherFlameExposure,reconcileWeatherLightSources } from './weather-flames'

export function lightingState() { return toolkitState().lighting??={ambient:{},sources:{}} }

export type LightOperation = 'light'|'extinguish'|'refuel'|'set_hood'|'aim'
export interface LightOptions {
  fuelItemId?:string;direction?:LightDirection;includeOrigin?:boolean
  hood?:'raised'|'lowered';discardRemainingFuel?:boolean
}

export function manageLightSource(itemId:string, operation:LightOperation, options:LightOptions={}) {
  available()
  const state=gs.getState(),owned=state.player.inventory.find(item=>item.id===itemId),drop=state.droppedItems?.[itemId],item=owned??drop?.item
  if(state.phase!=='combat')rules.validateActionUse('player')
  if(!item)toolkitError('LIGHT_ITEM_NOT_FOUND','Select an existing physical light source item.')
  const kind=item!.equipmentId??item!.id
  if(!isPhysicalLightKind(kind))toolkitError('LIGHT_ITEM_UNSUPPORTED','Choose a canonical torch, candle, lamp or lantern instance.')
  if(options.fuelItemId!==undefined&&operation!=='refuel'||options.discardRemainingFuel!==undefined&&operation!=='refuel'
    ||options.hood!==undefined&&operation!=='set_hood'
    ||(options.direction!==undefined||options.includeOrigin!==undefined)&&operation!=='aim'&&operation!=='light')
    toolkitError('LIGHT_OPTIONS_INVALID','Supply only the options belonging to this operation.')
  if((options.direction!==undefined||options.includeOrigin!==undefined)&&kind!=='bullseye_lantern')
    toolkitError('LIGHT_NOT_DIRECTIONAL','Only a bullseye lantern has a directed cone.')
  if(options.direction&&(!Number.isInteger(options.direction.x)||!Number.isInteger(options.direction.y)
    ||Math.abs(options.direction.x)>1||Math.abs(options.direction.y)>1||options.direction.x===0&&options.direction.y===0))
    toolkitError('LIGHT_DIRECTION_INVALID','Choose one explicit nonzero unit grid direction.')
  if(owned){
    const loadout=state.dmTools?.loadout
    if(!loadout||![loadout.mainHandId,loadout.offHandId].includes(itemId))toolkitError('LIGHT_MUST_BE_HELD','Hold the exact source in a hand, or place it on the ground within reach.')
  }else{
    if(!drop?.roomId)toolkitError('LIGHT_OUT_OF_REACH','Choose the actual source in this room.')
    assertToolkitReach({mapId:drop!.mapId,roomId:drop!.roomId!,cell:drop!.position})
  }
  const existing=state.dmTools?.lighting?.sources[itemId]
  if(!existing&&Object.keys(state.dmTools?.lighting?.sources??{}).length>=64)toolkitError('LIGHT_SOURCE_LIMIT','At most 64 finite light sources may be tracked per session.')
  const oldTorch=state.hero?.effects.find(e=>e.kind==='burning-torch'&&e.data.itemId===itemId)
  if(existing&&existing.kind!==kind)toolkitError('LIGHT_ITEM_KIND_MISMATCH','The physical item does not match its saved light source.')
  const source:LightSource=existing?structuredClone(existing):{itemId,kind,
    remainingSeconds:oldTorch&&kind==='torch'?Math.min(3600,Math.max(0,oldTorch.expiresAt-now()))
      :(kind==='torch'||kind==='candle')&&toolkitState().itemUses[itemId]!==0?LIGHT_TEMPLATES[kind].seconds:0,
    ...(oldTorch&&oldTorch.expiresAt>now()?{litAt:now()}: {})}
  const remainingSeconds=lightFuelRemaining(source,now()),lit=source.litAt!==undefined&&remainingSeconds>0
  if(operation==='light'&&lit)toolkitError('LIGHT_ALREADY_LIT','This source is already burning; repeated use never refills its fuel.')
  if(operation==='light'&&remainingSeconds<=0)toolkitError('LIGHT_EXHAUSTED','This source has no fuel left.')
  if(operation==='extinguish'&&!lit)toolkitError('LIGHT_NOT_LIT','This source is not burning.')
  if(operation==='light'&&kind==='bullseye_lantern'&&!options.direction&&!source.direction)
    toolkitError('LIGHT_DIRECTION_REQUIRED','Explicitly aim the bullseye lantern before or while lighting it.')
  let fuel:typeof owned
  if(operation==='refuel'){
    if(kind==='torch'||kind==='candle')toolkitError('LIGHT_NOT_REFILLABLE','A torch or candle cannot be replenished with a flask of oil.')
    if(lit)toolkitError('LIGHT_REFUEL_WHILE_LIT','Extinguish this physical source before replacing its oil.')
    if(!options.fuelItemId)toolkitError('LIGHT_FUEL_REQUIRED','Choose the exact owned one-pint oil flask to consume.')
    fuel=state.player.inventory.find(item=>item.id===options.fuelItemId)
    if(!fuel||(fuel.equipmentId??fuel.id)!=='oil_flask')toolkitError('LIGHT_FUEL_NOT_FOUND','Choose an actual owned oil_flask; no oil is created or picked up implicitly.')
    if(remainingSeconds>0&&!options.discardRemainingFuel)
      toolkitError('LIGHT_FUEL_REPLACEMENT_REQUIRED','This source still contains oil. Explicitly discard that remainder to replace it with a full pint; partial flasks are not simulated.')
  }
  if(operation==='set_hood'){
    if(kind!=='hooded_lantern')toolkitError('LIGHT_NO_HOOD','Only a hooded lantern has a hood.')
    if(!options.hood)toolkitError('LIGHT_HOOD_REQUIRED','Explicitly choose raised or lowered.')
    if((source.hood??'raised')===options.hood)toolkitError('LIGHT_HOOD_UNCHANGED','The hood is already in this position.')
  }
  if(operation==='aim'){
    if(kind!=='bullseye_lantern')toolkitError('LIGHT_NOT_DIRECTIONAL','Only a bullseye lantern has a directed cone.')
    if(!options.direction)toolkitError('LIGHT_DIRECTION_REQUIRED','Choose the explicit nonzero grid direction of the cone.')
    if(source.direction?.x===options.direction.x&&source.direction.y===options.direction.y
      &&(options.includeOrigin??source.includeOrigin??false)===(source.includeOrigin??false))
      toolkitError('LIGHT_DIRECTION_UNCHANGED','This lantern already points in that direction with that origin choice.')
  }
  const usesAction=operation==='light'||operation==='extinguish'||operation==='set_hood'&&options.hood==='lowered'
  if(operation==='light')assertWeatherFlameExposure({ignitingItemId:itemId})
  if(usesAction){rules.validateActionUse('player');spendHeroAction()}else spendObjectInteraction()
  source.remainingSeconds=remainingSeconds
  // Rebase the running clock once, even for aiming/hood changes, without
  // granting fuel or pausing the source on another map or in a pack.
  if(lit||operation==='light')source.litAt=now();else delete source.litAt
  if(operation==='extinguish')delete source.litAt
  if(options.direction)source.direction={...options.direction}
  if(options.includeOrigin!==undefined)source.includeOrigin=options.includeOrigin
  if(operation==='set_hood')source.hood=options.hood
  if(operation==='refuel'){
    gs.consumePlayerItem(item=>item.id===fuel!.id);afterInventoryChange()
    source.remainingSeconds=LIGHT_TEMPLATES[kind].seconds
  }
  lightingState().sources[itemId]=source
  toolkitState().itemUses[itemId]=0 // old generic use paths cannot grant fresh fuel
  if(state.hero)state.hero.effects=state.hero.effects.filter(e=>e.kind!=='burning-torch'||e.data.itemId!==itemId)
  const extinguishedByWeather=reconcileWeatherLightSources()
  return {success:true,itemId,operation,kind,remainingSeconds:source.remainingSeconds,lit:source.litAt!==undefined&&source.remainingSeconds>0,extinguishedByWeather,
    ...(source.hood?{hood:source.hood}:{}),...(source.direction?{direction:source.direction,includeOrigin:source.includeOrigin??false}:{}),
    ...(fuel?{consumedFuelItemId:fuel.id}:{}),cost:usesAction?'action':'object_interaction',
    perception:visualPerceptionAt(state,state.player,state.player.position),
    mechanicalSummary:`${item!.name} : ${operation} ; ${source.remainingSeconds} secondes de combustible restantes. ${usesAction?'Une action':'Une interaction avec un objet (puis une action si déjà utilisée)'} en combat.`}
}
