import type { GameState } from '../lib/types'
import { lightFuelRemaining } from '../lib/lighting'
import { weatherAffectedFlames,weatherFlameExposureIssue,type WeatherFlameForecast } from '../lib/weather-light'
import { LightWeatherProtectionInputSchema,WeatherThrownFlamePlanSchema,type LightWeatherProtectionInput,type WeatherThrownFlamePlan,type WeatherFlameExtinction } from '../lib/lighting-state'
import { physicalFlameProtection } from '../lib/weather-light'
import { available,now } from './hero-rules'
import { toolkitError } from './toolkit'
import { lightingState } from './lighting'
import * as gs from './game-state'

export function assertWeatherFlameExposure(forecast:WeatherFlameForecast={},state:GameState=gs.getState()){
 const issue=weatherFlameExposureIssue(state,forecast);if(issue)toolkitError(issue.code,issue.message)
}
/** Validate every ambiguous source before extinguishing any represented flame.
 * This is source bookkeeping, with no action, roll or magical dispelling. */
export function reconcileWeatherLightSources(onlyItemIds?:readonly string[]):string[]{
 const state=gs.getState(),candidates=weatherAffectedFlames(state).filter(source=>!onlyItemIds||onlyItemIds.includes(source.itemId))
 if(candidates.some(source=>source.protection==='unresolved'))toolkitError('WEATHER_LAMP_PROTECTION_REQUIRED','Establish the real protection of the actual burning lamp affected by this wind/rain before changing its flame.')
 const affected=candidates.filter(source=>source.protection==='open'),extinguished:string[]=[]
 for(const flame of affected){
  const source=state.dmTools?.lighting?.sources[flame.itemId]
  if(source){source.remainingSeconds=lightFuelRemaining(source,now());delete source.litAt}
  else if(flame.legacyEffectId){
   const effect=state.hero?.effects.find(effect=>effect.id===flame.legacyEffectId)
   if(!effect)continue
   lightingState().sources[flame.itemId]={itemId:flame.itemId,kind:'torch',remainingSeconds:Math.max(0,Math.min(3600,effect.expiresAt-now()))}
   state.dmTools!.itemUses[flame.itemId]=0
  }
  if(state.hero)state.hero.effects=state.hero.effects.filter(effect=>effect.kind!=='burning-torch'||effect.data.itemId!==flame.itemId)
  extinguished.push(flame.itemId)
 }
 return extinguished
}
export function setLightWeatherProtection(raw:LightWeatherProtectionInput){
 const input=LightWeatherProtectionInputSchema.parse(raw),command=JSON.stringify(input),state=gs.getState(),existing=state.dmTools?.lighting?.weatherProtection
 const old=existing&&Object.hasOwn(existing.receipts,input.eventId)?existing.receipts[input.eventId]:undefined
 if(old){if(old.command!==command)toolkitError('LIGHT_WEATHER_PROTECTION_CONFLICT','This retained event records different immutable lamp-protection arguments.');return{...old.result,replayed:true}}
 available()
 const item=state.player.inventory.find(item=>item.id===input.itemId)??state.droppedItems?.[input.itemId]?.item
 if(!item||(item.equipmentId??item.id)!=='lamp')toolkitError('LIGHT_WEATHER_LAMP_REQUIRED','Choose a real simple lamp instance. Canonical torch/candle open flames and closed lanterns cannot be reclassified into invented weather protection.')
 const fact=state.worldFacts?.find(fact=>fact.id===input.factId)
 if(!fact)toolkitError('LIGHT_WEATHER_SOURCE_FACT_REQUIRED','Select an existing actual physical protection fact, never a protection inferred from a lamp name or player text.')
 if(Object.keys(existing?.receipts??{}).length>=512||!existing?.records[input.itemId]&&Object.keys(existing?.records??{}).length>=128)
  toolkitError('LIGHT_WEATHER_PROTECTION_LIMIT','Retained protection sources/receipts are full; no prior event is evicted.')
 const protection=lightingState().weatherProtection??={records:{},receipts:{}}
 const result={success:true,eventId:input.eventId,itemId:input.itemId,protection:input.protection,factId:input.factId,source:input.source,at:now()}
 protection.records[input.itemId]={input,at:now(),fact:structuredClone(fact!) as unknown as Record<string,unknown>}
 protection.receipts[input.eventId]={command,result}
 const extinguished=reconcileWeatherLightSources([input.itemId]),complete={...result,extinguished,actionSpent:false,diceRolled:false}
 protection.receipts[input.eventId].result=complete
 return complete
}

/** The attack resolver supplies its already authoritative attack identity and
 * actual reviewed XY ray. No trajectory, landing cell or attack is selected. */
export function captureWeatherThrownFlame(itemId:string,rayCells:Array<{x:number;y:number}>,mapId:string,attackEventId:string):WeatherThrownFlamePlan|undefined{
 const state=gs.getState(),item=state.player.inventory.find(item=>item.id===itemId)??state.droppedItems?.[itemId]?.item
 if(!item)return undefined
 const light=state.dmTools?.lighting?.sources[itemId],legacy=!light?state.hero?.effects.find(effect=>effect.kind==='burning-torch'&&effect.data.itemId===itemId&&effect.expiresAt>now()):undefined
 if(!(light?.litAt!==undefined&&lightFuelRemaining(light,now())>0)&&!legacy)return undefined
 if(legacy&&(item.equipmentId??item.id)!=='torch')return undefined
 const receipts=state.dmTools?.lighting?.weatherExtinctions
 if(!attackEventId)toolkitError('WEATHER_FLAME_ATTACK_EVENT_REQUIRED','The actual attack event must be fixed before capturing this flame transfer; no event is reconstructed from its clock.')
 if(receipts&&Object.hasOwn(receipts,attackEventId))toolkitError('WEATHER_FLAME_ATTACK_ALREADY_COMMITTED','This exact attack already committed its physical flame transfer; no new roll or flame episode is substituted.')
 const kind=light?.kind??'torch',protection=physicalFlameProtection(state,itemId,kind),weather=new Map<string,WeatherThrownFlamePlan['weather'][number]>()
 for(const cell of rayCells){
  const subject=weatherAffectedFlames(state,{itemPositions:{[itemId]:{mapId,cell}}}).find(flame=>flame.itemId===itemId)
  if(!subject)continue
  if(subject.protection==='unresolved')toolkitError('WEATHER_LAMP_PROTECTION_REQUIRED','The actual burning lamp would traverse strong wind/heavy rain; establish its physical protection before the attack die.')
  const context=subject.context;weather.set(JSON.stringify([context.mapId,context.roomId]),{mapId:context.mapId,roomId:context.roomId,
    revision:context.revision,strongWind:context.strongWind,precipitation:context.precipitation})
 }
 if(protection==='open'&&weather.size>0&&Object.keys(receipts??{}).length>=512)toolkitError('WEATHER_FLAME_HISTORY_LIMIT','512 retained actual thrown-flame extinction commits reached; refuse before the attack die or resource, without discarding history.')
 return WeatherThrownFlamePlanSchema.parse({version:1,attackEventId,itemId,mapId,capturedAt:now(),rayCells:structuredClone(rayCells),protection,
  extinguish:protection==='open'&&weather.size>0,weather:[...weather.values()],
  source:light?{kind:'tracked',physicalKind:kind,litAt:light.litAt,remainingSeconds:light.remainingSeconds}
    :{kind:'legacy_torch',physicalKind:'torch',effectId:legacy!.id,expiresAt:legacy!.expiresAt}})
}
export function commitWeatherThrownFlame(raw:WeatherThrownFlamePlan){
 const plan=WeatherThrownFlamePlanSchema.parse(raw),state=gs.getState(),receipts=state.dmTools?.lighting?.weatherExtinctions
 const old=receipts&&Object.hasOwn(receipts,plan.attackEventId)?receipts[plan.attackEventId]:undefined
 if(old)return{...old,replayed:true}
 if(!plan.extinguish)return{plan,committedAt:now(),extinguished:false,reason:'not_required' as const}
 const landing=plan.rayCells[plan.rayCells.length-1],drop=state.droppedItems?.[plan.itemId]
 if(!drop||drop.mapId!==plan.mapId||drop.position.x!==landing.x||drop.position.y!==landing.y||state.player.inventory.some(item=>item.id===plan.itemId))
  toolkitError('WEATHER_FLAME_TRANSFER_REQUIRED','Commit this captured flame only after the same real item has actually reached its selected ground destination; no transfer is fabricated.')
 let reason:WeatherFlameExtinction['reason']='not_required',remainingSeconds:number|undefined,extinguished=false
 if(plan.extinguish){
  const source=state.dmTools?.lighting?.sources[plan.itemId]
  if(plan.source.kind==='tracked'&&source){
   if(source.litAt===undefined||lightFuelRemaining(source,now())<=0)reason='not_burning'
   else if(source.kind!==plan.source.physicalKind||source.litAt!==plan.source.litAt||source.remainingSeconds!==plan.source.remainingSeconds)reason='stale_source'
   else{source.remainingSeconds=lightFuelRemaining(source,now());remainingSeconds=source.remainingSeconds;delete source.litAt;reason='applied';extinguished=true}
  }else if(plan.source.kind==='legacy_torch'){
   const effect=state.hero?.effects.find(effect=>effect.id===plan.source.effectId&&effect.kind==='burning-torch'&&effect.data.itemId===plan.itemId&&effect.expiresAt===plan.source.expiresAt)
   if(!effect||effect.expiresAt<=now())reason='not_burning'
   else{remainingSeconds=Math.max(0,Math.min(3600,effect.expiresAt-now()));lightingState().sources[plan.itemId]={itemId:plan.itemId,kind:'torch',remainingSeconds};state.dmTools!.itemUses[plan.itemId]=0;reason='applied';extinguished=true}
  }else reason='not_burning'
  if(extinguished&&state.hero)state.hero.effects=state.hero.effects.filter(effect=>effect.kind!=='burning-torch'||effect.data.itemId!==plan.itemId)
 }
 const result:WeatherFlameExtinction={plan,committedAt:now(),extinguished,reason,...(remainingSeconds===undefined?{}:{remainingSeconds})}
 ;(lightingState().weatherExtinctions??={})[plan.attackEventId]=result
 return result
}
