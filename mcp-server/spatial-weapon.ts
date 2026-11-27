import { retainedSpatialOpportunityContext } from './spatial-opportunity'
import { selectedSpatialWeaponResolution } from '../lib/spatial-weapon-resolution'
import { activeSwallowEpisode,swallowBoundary } from '../lib/swallow-state'
import { monsterSource } from './monster-rules'
import { distance3 } from '../lib/spell-area-geometry'
import { SpatialAttackObservationSchema,SpatialAttackContextSchema,actualNativeFlightLocation,nativeFlightStateOf,initialNativeFlightState,spatialAttackKey,type SpatialAttackContext } from '../lib/native-flight-state'
import { spatialAttackContext,nativeFlightFrameWitness } from '../lib/native-flight-geometry'
import { entityVerticalContext,bodyPhysicalHeight } from '../lib/jumping-state'
import { activeLights } from '../lib/lighting'
import { inferRoomIdOnMap } from '../lib/adventure-map'
import { exactUnderwaterAttackInputs } from './underwater'
import { toolkitError,toolkitState } from './toolkit'
import * as gs from './game-state'
const data=()=>((toolkitState() as unknown as{nativeFlight:ReturnType<typeof initialNativeFlightState>}).nativeFlight??=initialNativeFlightState())
export function recordSpatialAttackGeometry(raw:unknown){
 const input=SpatialAttackObservationSchema.parse(raw),state=gs.getState(),command=JSON.stringify(input),prior=nativeFlightStateOf(state)?.receipts[input.eventId]
 if(prior){if(prior.command!==command)toolkitError('SPATIAL_ATTACK_EVENT_CONFLICT','Retain the exact original actual geometry observation.');return{...structuredClone(prior.result),replayed:true}}
 if(state.hero?.pending)toolkitError('REACTION_PENDING','Keep the original already rolled spatial attack geometry; a new observation cannot retrofit the held die.')
 if(activeSwallowEpisode(state,input.actorId)||activeSwallowEpisode(state,input.targetId))toolkitError('SWALLOW_INTERNAL_SPATIAL_GEOMETRY_REQUIRED','The actual interior/host contact is not an exterior weapon ray. Use the supported direct host contact procedure; no internal points or body wall crossing is invented.')
 const actor=gs.getPhysicalCreature(input.actorId),target=gs.getPhysicalCreature(input.targetId),fact=state.worldFacts?.find(f=>f.id===input.factId&&f.mapId===state.currentMapId)
 if(!actor||!target||actor.id===target.id||!fact)toolkitError('SPATIAL_ATTACK_PHYSICAL_SOURCE_REQUIRED','Choose the exact two current physical bodies and an existing current-map physical fact; no actor, position or attack is created.')
 const choice=exactUnderwaterAttackInputs(input.actorId,{kind:'creature',entityId:input.targetId},input.weaponReference,input.attackMode)
 const origin=entityVerticalContext(state,input.actorId),destination=entityVerticalContext(state,input.targetId),height=bodyPhysicalHeight(state,input.actorId),targetHeight=bodyPhysicalHeight(state,input.targetId)
 if(!origin.known||!destination.known||height===null||targetHeight===null||input.originZFeet<origin.zFeet!||input.originZFeet>origin.zFeet!+height||input.targetZFeet<destination.zFeet!||input.targetZFeet>destination.zFeet!+targetHeight)toolkitError('SPATIAL_ATTACK_BODY_POINTS_REQUIRED','The exact chosen real attack points must lie inside both actually measured current bodies at their actual support/flight Z. No eye, mouth, claw, head height or body dimension is inferred.')
 const record={input:{...input,weaponReference:choice.weaponReference},mapId:state.currentMapId!,actorWitness:nativeFlightFrameWitness(state,input.actorId),targetWitness:nativeFlightFrameWitness(state,input.targetId),at:state.worldTimeSeconds??0},stored=data(),key=spatialAttackKey(input.actorId,input.targetId,choice.weaponReference,input.attackMode)
 if(Object.keys(stored.receipts).length>=2048||!stored.attacks[key]&&Object.keys(stored.attacks).length>=1024)toolkitError('NATIVE_FLIGHT_HISTORY_LIMIT','Retain the original actual spatial observations before another mutation.')
 stored.attacks[key]=record;const result={success:true,confidential:true,record:structuredClone(record),positionChanged:false,attackResolved:false,diceRolled:false};stored.receipts[input.eventId]={command,result};return result
}
export function captureSpatialWeaponContext(actorId:string,targetId:string,reference:string,attackMode?:string,held?:unknown,isHeld=false):SpatialAttackContext|undefined{
 const state=gs.getState(),from=entityVerticalContext(state,actorId),to=entityVerticalContext(state,targetId)
 const scoped=selectedSpatialWeaponResolution(state,actorId,targetId)
 if(scoped){const choice=exactUnderwaterAttackInputs(actorId,{kind:'creature',entityId:targetId},reference,attackMode)
  if(scoped.weaponReference===choice.weaponReference){
   if(held&&JSON.stringify(held)!==JSON.stringify(scoped))toolkitError('SPATIAL_ATTACK_HELD_CONTEXT_INVALID','Keep the exact original scoped spatial opportunity ray before a bonus die.')
   return scoped
  }
 }
 if(held){const parsed=SpatialAttackContextSchema.safeParse(held)
  if(parsed.success&&parsed.data.actorId===actorId&&parsed.data.targetId===targetId){
   const retained=retainedSpatialOpportunityContext(parsed.data);if(retained)return retained
  }
 }
 if(swallowBoundary(state,actorId,targetId)!=='ordinary')return undefined
 if(!held&&!actualNativeFlightLocation(state,actorId)?.airborne&&!actualNativeFlightLocation(state,targetId)?.airborne)return undefined
 if(!held&&!from.airborne&&!to.airborne&&from.known&&to.known&&from.zFeet===to.zFeet)return undefined
 if(isHeld&&!held)toolkitError('SPATIAL_ATTACK_HELD_CONTEXT_REQUIRED','An old held nonplanar attack needs its original actual spatial ray before another bonus die; a new observation cannot retrofit it.')
 const choice=exactUnderwaterAttackInputs(actorId,{kind:'creature',entityId:targetId},reference,attackMode)
 if(held){const parsed=SpatialAttackContextSchema.safeParse(held);if(!parsed.success||parsed.data.actorId!==actorId||parsed.data.targetId!==targetId||parsed.data.weaponReference!==choice.weaponReference)toolkitError('SPATIAL_ATTACK_HELD_CONTEXT_INVALID','Retain the exact original spatial attack source, target, real weapon and ray before spending a held reaction die.')
 const c=parsed.data,record=nativeFlightStateOf(state)?.attacks[spatialAttackKey(actorId,targetId,choice.weaponReference,attackMode)],a={x:c.origin.x*5,y:c.origin.y*5,z:c.origin.zFeet},b={x:c.target.x*5,y:c.target.y*5,z:c.target.zFeet}
 if(!record||record.input.eventId!==c.observationEventId||record.actorWitness!==c.actorWitness||record.targetWitness!==c.targetWitness||record.input.originZFeet!==c.origin.zFeet||record.input.targetZFeet!==c.target.zFeet||Math.abs(distance3(a,b)-c.distanceFeet)>1e-7||gs.getPhysicalCreature(actorId)?.position.x!==c.origin.x||gs.getPhysicalCreature(actorId)?.position.y!==c.origin.y||gs.getPhysicalCreature(targetId)?.position.x!==c.target.x||gs.getPhysicalCreature(targetId)?.position.y!==c.target.y)toolkitError('SPATIAL_ATTACK_HELD_CONTEXT_INVALID','The held actual ray must retain its original observation, exact physical endpoints and derived geometric distance before a bonus die.')
 return c}
 const result=spatialAttackContext(state,actorId,targetId,choice.weaponReference,attackMode)
 if(result.issue)toolkitError(result.issue.code,result.issue.message)
 if(result.context){const actor=gs.getPhysicalCreature(actorId)!,target=gs.getPhysicalCreature(targetId)!,mapId=state.currentMapId!,targetRoom=inferRoomIdOnMap(target.position,mapId,state)
  if((state.dmTools?.lighting?.ambient[mapId]?.[targetRoom??'']??'bright')!=='bright'&&activeLights(state).length)toolkitError('SPATIAL_LIGHT_GEOMETRY_REQUIRED','This actual nonplanar attack depends on existing artificial lights whose source heights are not represented by this slice. Establish supported real illumination before dice/costs; no2D light radius is extended through altitude.')
  if('type'in actor&&['Pack Tactics','Martial Advantage'].some(name=>{return monsterSource(actor)?.special_abilities?.some(t=>t.name===name)}))toolkitError('SPATIAL_NATIVE_TRAIT_CONTEXT_REQUIRED','This source ally/adjacency trait needs its own actual spatial body geometry before this attack; no distant projected ally grants advantage or extra damage.')
 }
 return result.context
}
export function validateHeldSpatialWeaponAttack(command:Record<string,unknown>){if(command.type==='attack'&&command.spatialContext)captureSpatialWeaponContext(String(command.attackerId),String(command.targetId),String(command.weaponOrSpell),typeof command.attackMode==='string'?command.attackMode:undefined,command.spatialContext)}
