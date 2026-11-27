import { swallowedBy } from '../lib/swallow-state'
import type { MonsterState,PlayerState } from '../lib/types'
import { getAdventureMap,inferRoomIdOnMap } from '../lib/adventure-map'
import { navigationGrid } from '../lib/navigation'
import { isStatBackedNpc } from '../lib/npc-stat-blocks'
import { entityVerticalContext,bodyPhysicalHeight,physicalBodyWitness,jumpingStateOf,activeVerticalSurface } from '../lib/jumping-state'
import { SPELL_AREA_PROFILES,SpellAreaSelectionSchema,makeSpellAreaVolume,pointFromAreaOrigin,type SpellAreaSelection } from '../lib/spell-area-state'
import { areaBodyMembership,targetAreaIntervals,distance3,type Point3 } from '../lib/spell-area-geometry'
import { spellAreaBlockers,spellAreaRay,unblockedAreaIntervals,fireballCornerRoute,cylinderVerticalIntervals } from '../lib/spell-area-physics'
import { areaCoverFor } from './cover'
import { canSee } from './monster-perception'
import { fail } from './hero-rules'
import * as gs from './game-state'

type Creature=PlayerState|MonsterState
type AreaInput={spellId?:string;area?:SpellAreaSelection;toCell?:{x:number;y:number};direction?:{x:number;y:number};targetId?:string;targetIds?:string[];targetName?:string}
export interface SpellAreaPlan {spellId:string;casterId:string;selection:SpellAreaSelection;legacyFlat:boolean;requestedOrigin:Point3;actualOrigin:Point3;targets:string[];cover:Record<string,{targetId:string;bonus:number}>;pushPaths:Record<string,Array<{x:number;y:number}>>;witness:string;excluded:Array<{targetId:string;reason:string}>;playerPerceivedTargetIds:string[];confidentialMj:{hiddenTargetIds:string[];notice:string}}
export function spellAreaCreatures():Creature[]{
 const state=gs.getState(),mapId=state.currentMapId,seen=new Set<string>(),result:Creature[]=[]
 for(const e of [state.player,...Object.values(state.monsters),...Object.values(state.npcs??{})]){
  if(state.npcs?.[e.id]&&!gs.npcOnCurrentMap(state.npcs[e.id]))continue
  if(swallowedBy(state,e.id))continue
  if(seen.has(e.id)||e.id!=='player'&&'mapId'in e&&e.mapId!==undefined&&e.mapId!==mapId)continue
  if(e.id!=='player'&&!('stats'in e))continue
  if('isAlive'in e?!e.isAlive:Boolean(state.player.deathSaves?.dead))continue
  if(e.id!=='player'&&state.npcs?.[e.id]&&!isStatBackedNpc(state.npcs[e.id]))fail('AREA_NPC_STAT_BLOCK_REQUIRED','An actual NPC body in this map needs its existing sourced statistics before an area can resolve; it is not enlisted or fabricated.')
  seen.add(e.id);result.push(e as Creature)
 }
 return result
}
function select(input:AreaInput,caster:Creature):{selection:SpellAreaSelection;legacyFlat:boolean}{
 const profile=SPELL_AREA_PROFILES[input.spellId!]!,vertical=entityVerticalContext(gs.getState(),caster.id)
 if(input.area){if(input.toCell||input.direction)fail('AREA_ARGUMENT_CONFLICT','Choose the explicit spatial area OR the legacy map center/direction, not both.');return{selection:SpellAreaSelectionSchema.parse(input.area),legacyFlat:false}}
 if(profile.shape==='cylinder')fail('AREA_SPATIAL_SELECTION_REQUIRED','Flame Strike requires its actual spatial origin, up/down direction and real base/top surface; a free cylinder is not invented.')
 if(!vertical.known||vertical.zFeet!==0)fail('AREA_SPATIAL_SELECTION_REQUIRED','Use an explicit spatial area for an actor whose actual support is not the legacy flat map plane.')
 if(profile.originKind==='point'){
  if(!input.toCell||input.direction)fail('AREA_CENTER_REQUIRED','Select an exact sourced sphere center, or an explicit spatial area.')
  return{legacyFlat:true,selection:{origin:{...input.toCell,zFeet:0}}}
 }
 const d=input.direction
 if(!d||input.toCell||!Number.isInteger(d.x)||!Number.isInteger(d.y)||Math.abs(d.x)>1||Math.abs(d.y)>1||!Math.hypot(d.x,d.y))fail('AREA_DIRECTION_REQUIRED','Choose an explicit nonzero adjacent map direction or a full spatial orientation.')
 const selection:SpellAreaSelection={origin:{...caster.position,zFeet:0},direction:{...d!,z:0}}
 if(profile.shape==='cube'){const mag=Math.hypot(d!.x,d!.y);selection.faceU={x:-d!.y/mag,y:d!.x/mag,z:0};selection.faceOffset={uFeet:profile.sideFeet!/2,vFeet:0}}
 return{selection,legacyFlat:true}
}
export function planSpellArea(input:AreaInput,caster:Creature):SpellAreaPlan|null{
 const profile=SPELL_AREA_PROFILES[input.spellId??''];if(!profile){if(input.area)fail('SPELL_AREA_PROFILE_REQUIRED','This spell has no reviewed source area profile.');return null}
 if(swallowedBy(gs.getState(),caster.id))fail('SWALLOW_INTERNAL_AREA_UNSUPPORTED','The actual contained interior has no external spell-area coordinates or internal volume; no outside area is invented.')
 if(input.targetId||input.targetIds||input.targetName)fail('AREA_SELECTION_REQUIRED','The actual volume determines all bodies; do not select creature IDs for this area.')
 const state=gs.getState(),map=getAdventureMap(state).maps.find(m=>m.id===state.currentMapId)??getAdventureMap(state).maps[0]
 const {selection,legacyFlat}=select(input,caster),requestedOrigin=pointFromAreaOrigin(selection.origin),vertical=entityVerticalContext(state,caster.id)
 if(!vertical.known)fail('AREA_CASTER_HEIGHT_REQUIRED','Observe the actual caster support/flight height before resolving a spatial origin.')
 if(selection.origin.x<-.5||selection.origin.y<-.5||selection.origin.x>map.grid.cols-.5||selection.origin.y>map.grid.rows-.5)fail('AREA_ORIGIN_OUTSIDE_MAP','The exact origin must be within the represented active map.')
 if(profile.originKind==='caster'&&(Math.abs(requestedOrigin.x-caster.position.x*5)>1e-7||Math.abs(requestedOrigin.y-caster.position.y*5)>1e-7||Math.abs(requestedOrigin.z-vertical.zFeet!)>1e-7))fail('AREA_CASTER_ORIGIN_REQUIRED','This sourced origin must be the actual caster location; no displaced origin is granted.')
 const casterPoint={x:caster.position.x*5,y:caster.position.y*5,z:vertical.zFeet!}
 if(profile.originKind==='point'&&distance3(casterPoint,requestedOrigin)>profile.rangeFeet+1e-7)fail('TARGET_OUT_OF_RANGE','The actual origin exceeds the sourced range in space.')
 if(profile.shape==='cylinder'){
  const surface=selection.surfaceId?jumpingStateOf(state)?.surfaces[selection.surfaceId]:undefined
  if(!surface||!activeVerticalSurface(state,surface.surfaceId)||surface.mapId!==map.id||surface.kind!=='support'||!surface.cells.some(c=>Math.abs(c.x-selection.origin.x)<=.5&&Math.abs(c.y-selection.origin.y)<=.5))fail('CYLINDER_SURFACE_REQUIRED','Identify the real measured ground/base surface under this cylinder; no ground is invented at an arbitrary altitude.')
  const baseZ=selection.verticalDirection==='up'?requestedOrigin.z:requestedOrigin.z-profile.heightFeet!
  if(Math.abs(baseZ-surface.elevationFeet)>1e-7)fail('CYLINDER_BASE_HEIGHT_MISMATCH','The cylinder base/top and sourced height must match the real supporting surface elevation.')
 }
 let volume;try{volume=makeSpellAreaVolume(profile,selection)}catch(error){fail('AREA_SELECTION_INVALID',String(error))}
 const blockers=spellAreaBlockers(state)
 const mapBounds={minXFeet:-2.5,maxXFeet:(map.grid.cols-.5)*5,minYFeet:-2.5,maxYFeet:(map.grid.rows-.5)*5}
 let actualOrigin=requestedOrigin
 if(profile.originKind==='point'){
  const path=spellAreaRay(blockers,casterPoint,requestedOrigin)
  if(path.kind==='unknown')fail('AREA_ORIGIN_PATH_UNRESOLVED',path.message)
  if(path.kind==='blocked'){
   if(path.blocker.opaque===false)fail('SPELL_PATH_BLOCKED','A transparent physical barrier blocks the clear path to the visible selected origin.')
   // Standard PHB clear-path placement on the near side of an unseen
   // obstructed point. The chosen point is retained separately for narration.
   const t=Math.max(0,path.t-1e-6)
   actualOrigin={x:casterPoint.x+(requestedOrigin.x-casterPoint.x)*t,y:casterPoint.y+(requestedOrigin.y-casterPoint.y)*t,z:casterPoint.z+(requestedOrigin.z-casterPoint.z)*t}
   if(profile.shape==='cylinder')fail('CYLINDER_ORIGIN_OBSTRUCTED','The near-side origin would no longer match the cylinder’s selected base/top surface. Choose a real clear origin; no substitute supporting surface is invented.')
   volume={...volume!,origin:actualOrigin}
  }
 }
 const targets:string[]=[],cover:SpellAreaPlan['cover']={},pushPaths:SpellAreaPlan['pushPaths']={},excluded:SpellAreaPlan['excluded']=[],bodyWitnesses:unknown[]=[]
 for(const target of spellAreaCreatures()){
  const context=entityVerticalContext(state,target.id),height=bodyPhysicalHeight(state,target.id)
  // A body outside this profile's entire possible XY reach cannot intersect
  // it regardless of unknown flight height.
  const xyDistance=Math.hypot(target.position.x*5-actualOrigin.x,target.position.y*5-actualOrigin.y)
  const reach=profile.radiusFeet??profile.lengthFeet??Math.sqrt(3)*profile.sideFeet!
  if(xyDistance>reach+1e-7)continue
  if(!context.known)fail('AREA_TARGET_HEIGHT_REQUIRED',`Observe the real support/flight height of ${target.id}; this volume may intersect it.`)
  const point={x:target.position.x*5,y:target.position.y*5,z:context.zFeet!}
  bodyWitnesses.push({id:target.id,position:target.position,context,body:physicalBodyWitness(state,target.id)})
  if(target.id===caster.id&&profile.originKind==='caster'&&!volume!.includeOrigin)continue
  // Older flat-map calls retain their documented token-reference convention;
  // an explicit spatial call uses the observed physical body interval.
  const physicalHeight=legacyFlat?0:height,membership=areaBodyMembership(volume!,point,physicalHeight)
  if(membership==='outside')continue
  if(membership==='unknown_height')fail('AREA_BODY_HEIGHT_REQUIRED',`Measure the actual current body/posture of ${target.id}; only a higher part might enter this volume.`)
  let intervals=targetAreaIntervals(volume!,point,physicalHeight),unknown:string|undefined
  if(!legacyFlat&&height===null&&membership==='inside'&&volume!.shape!=='cylinder'&&spellAreaRay(blockers,actualOrigin,point).kind==='clear')intervals=[{min:point.z,max:point.z}]
  if(volume!.shape==='cylinder'){
   const radial=spellAreaRay(blockers,actualOrigin,{...point,z:actualOrigin.z})
   if(radial.kind==='unknown')unknown=radial.message
   else if(radial.kind==='blocked')intervals=[]
   if(intervals.length){
    const verticalResult=cylinderVerticalIntervals(blockers,volume!,point,intervals)
    intervals=verticalResult.intervals;unknown??=verticalResult.unknown
   }
  }else{
   const result=unblockedAreaIntervals(blockers,actualOrigin,point,intervals);intervals=result.intervals;unknown=result.unknown
  }
  if(!intervals.length&&profile.aroundCorners){
   const candidate=targetAreaIntervals(volume!,point,physicalHeight)[0],route=candidate?fireballCornerRoute(blockers,volume!,{...point,z:candidate.min},mapBounds):'blocked'
   if(route==='clear')intervals=[candidate];else if(route==='unknown')unknown='The around-corner route depends on unresolved vertical obstacle bounds.'
  }
  if(unknown)fail('AREA_PROPAGATION_UNRESOLVED',unknown)
  if(!intervals.length){excluded.push({targetId:target.id,reason:'actual_total_cover_blocks_propagation'});continue}
  const declared=gs.withPhysicalCreatureResolution([target.id],()=>areaCoverFor(actualOrigin,target.id,legacyFlat,profile.originKind==='caster'?caster.id:undefined))
  if(declared.degree==='total'){
   if(!profile.aroundCorners){excluded.push({targetId:target.id,reason:'declared_directional_total_cover'});continue}
   if(!blockers.some(b=>spellAreaRay([b],actualOrigin,point).kind==='blocked'))fail('AREA_COVER_CORNERS_BARRIER_REQUIRED','The declared total-cover obstacle needs its actual measured physical geometry before a real around-corner route can be established.')
   const route=fireballCornerRoute(blockers,volume!,point,mapBounds)
   if(route!=='clear')fail('AREA_COVER_CORNERS_UNRESOLVED','The explicit total-cover exception needs a witnessed real around-corner route; no universal cover bypass is granted.')
  }
  if(input.spellId==='thunderwave'&&(context.airborne||context.zFeet!==vertical.zFeet||selection.direction!.z!==0))fail('THUNDERWAVE_PUSH_VERTICAL_UNREPRESENTED','This actual Thunderwave could push a body vertically or off a distinct support. Its forced-movement trajectory must be represented before any cost or die.')
  if(input.spellId==='thunderwave'&&target.id!==caster.id){
   const dx=Math.sign(target.position.x-caster.position.x),dy=Math.sign(target.position.y-caster.position.y),path=[{...target.position}],grid=navigationGrid(state,target.id,map.geometry)
   if(!dx&&!dy)fail('THUNDERWAVE_PUSH_DIRECTION_REQUIRED','Two distinct bodies at exactly the same map point need a represented separation before an away-from-caster push can be resolved.')
   for(let i=0;i<2;i++){const from=path.at(-1)!,to={x:from.x+dx,y:from.y+dy};if(!grid.step(from,to))break;path.push(to)}
   gs.withPhysicalCreatureResolution([target.id],()=>gs.assertGroundMovementPath(target.id,path))
   pushPaths[target.id]=path
  }
  targets.push(target.id);cover[target.id]={targetId:target.id,bonus:declared.bonus}
 }
 const witness=JSON.stringify({mapId:state.currentMapId,geometry:map.geometry?.source,origin:actualOrigin,caster:{position:caster.position,vertical},bodies:bodyWitnesses,blockers,cover:state.dmTools?.cover?.records??{}})
 const playerPerceivedTargetIds=targets.filter(id=>id==='player'||(!state.npcs?.[id]||state.npcs[id].visible)&&Boolean(gs.getPhysicalCreature(id)&&canSee(state.player,gs.getPhysicalCreature(id)!)))
 return{spellId:input.spellId!,casterId:caster.id,selection,legacyFlat,requestedOrigin,actualOrigin,targets,cover,pushPaths,witness,excluded,playerPerceivedTargetIds,
  confidentialMj:{hiddenTargetIds:targets.filter(id=>!playerPerceivedTargetIds.includes(id)),notice:'Mechanical target IDs and hidden-body outcomes are confidential MJ context. They do not establish discovery or a perceptible fact for player narration.'}}
}
export function assertSpellAreaPlan(plan:SpellAreaPlan){
 const caster=gs.getEntity(plan.casterId);if(!caster)fail('AREA_CASTER_MISSING','The actual spell caster is absent.')
 // Preserve the original reference-point convention only for actual legacy
 // continuations, never infer a new body measurement after a held die.
 if(plan.legacyFlat){
  const legacy=planSpellArea({spellId:plan.spellId,...SPELL_AREA_PROFILES[plan.spellId].originKind==='point'?{toCell:{x:plan.selection.origin.x,y:plan.selection.origin.y}}:{direction:{x:plan.selection.direction!.x,y:plan.selection.direction!.y}}},caster!)!
  if(legacy.witness!==plan.witness)fail('AREA_CONTEXT_CHANGED','Actual geometry, body support/posture or cover changed while this spell was held. No new die or damage was applied.');return
 }
 const current=planSpellArea({spellId:plan.spellId,area:plan.selection},caster!)!
 if(current.witness!==plan.witness)fail('AREA_CONTEXT_CHANGED','Actual geometry, body support/posture or cover changed while this spell was held. No new die or damage was applied.')
}
