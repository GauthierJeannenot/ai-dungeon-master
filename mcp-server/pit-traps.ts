import { z } from 'zod'
import { VerticalSurfaceInputSchema,PhysicalBodyInputSchema,StandingSupportInputSchema } from '../lib/jumping-state'
import { DeclareVerticalBarrierSchema } from '../lib/vertical-barrier-state'
import { MovementMediumInputSchema } from '../lib/locomotion-state'
import { recordVerticalSurface,recordPhysicalBody,observeStandingSupport } from './vertical-observations'
import { declareVerticalBarrier } from './vertical-barriers'
import { recordMovementMedium } from './special-movement'
import { withHeldPitMeasurements,heldPitMeasurementsAllowed } from './pit-migration-scope'
import { PitGeometryInputSchema,pitWitness,type PitGeometry } from '../lib/pit-trap-state'
import { jumpingStateOf,entityVerticalContext,activeVerticalSurface } from '../lib/jumping-state'
import { readMovementMedium } from '../lib/locomotion-geometry'
import { xgeFallColumnIssue } from '../lib/xge-falling-geometry'
import { swallowedBy } from '../lib/swallow-state'
import { activePhysicalLoad } from '../lib/physical-handling-state'
import { heldGrappleTargets } from './grapple-transport'
import { assertKnockoutDamageSupported } from './nonlethal'
import { navigationGrid } from '../lib/navigation'
import { getMapSpec } from '../lib/adventure-map'
import type { SceneTrap } from '../lib/dm-tool-state'
import type { SavingThrowResult } from '../lib/types'
import { verticalData } from './vertical-observations'
import { readPitTrapSource } from './rules-library'
import { toolkitError,assertToolkitPreparation } from './toolkit'
import { prepareGroundGearStep,groundGearMovementIssue,recordGroundGearContact } from './ground-gear-contacts'
import { oilGroundContactIssue,onOilGroundContact } from './oil-ground'
import * as gs from './game-state'

const same=(a:{x:number;y:number},b:{x:number;y:number})=>a.x===b.x&&a.y===b.y
const qualificationKey=(id:string)=>`\u0000pit-geometry:${id}`
const definition=(g:PitGeometry)=>pitWitness({input:g.input,source:g.source,cover:g.cover,bottom:g.bottom,escape:g.escape,medium:g.medium})
function read(trap:SceneTrap){
 const g=trap.pitGeometry
 if(trap.template!=='pit'||!g)toolkitError('PIT_GEOMETRY_REQUIRED','Explicitly qualify this armed pit using existing measured canvas, ten-foot lower floor, safe rim and actual climbing face before any save or damage.')
 readPitTrapSource()
 const j=jumpingStateOf(gs.getState())
 for(const[key,id]of [['cover',g!.input.coverSurfaceId],['bottom',g!.input.bottomSurfaceId],['escape',g!.input.escapeSurfaceId]] as const)
  if(pitWitness(j?.surfaces[id])!==pitWitness(g![key]))toolkitError('PIT_GEOMETRY_CHANGED','Retain the originally qualified real pit surfaces.')
 const medium=readMovementMedium(gs.getState(),g!.input.climbMediumId)
 if(medium.issue||pitWitness(medium.medium)!==pitWitness(g!.medium))toolkitError('PIT_GEOMETRY_CHANGED','The real climbing face changed; no old qualification creates a new exit.')
 return g!
}
export function qualifyPitGeometry(raw:unknown,legacyPendingId?:string){
 const input=PitGeometryInputSchema.parse(raw),state=gs.getState(),trap=state.dmTools?.traps[input.trapId],command=pitWitness(input)
 if(!trap||trap.template!=='pit')toolkitError('PIT_TRAP_REQUIRED','Choose an actual prepared simple pit.')
 if(trap!.pitGeometry){if(trap!.pitGeometry.command!==command)toolkitError('PIT_QUALIFICATION_CONFLICT','Keep the exact original physical qualification.');return{success:true,replayed:true,geometry:trap!.pitGeometry}}
 if(legacyPendingId){if(!heldPitMeasurementsAllowed(state)||state.hero?.pending?.id!==legacyPendingId||trap!.status!=='triggered')toolkitError('PIT_MIGRATION_CONTEXT_REQUIRED','Only the exact admitted old held save may qualify its currently measured triggered pit.')}else assertToolkitPreparation()
 if(!legacyPendingId&&trap!.status!=='armed')toolkitError('PIT_ALREADY_TRIGGERED','Only an armed old pit can be qualified; no past fall or victim is reconstructed.')
 if(Object.values(state.dmTools?.traps??{}).some(other=>other.id!==trap!.id&&other.pitGeometry?.input.coverSurfaceId===input.coverSurfaceId))toolkitError('PIT_CANVAS_ALREADY_OWNED','One real canvas cannot belong to two different pits.')
 const j=jumpingStateOf(state),cover=j?.surfaces[input.coverSurfaceId],bottom=j?.surfaces[input.bottomSurfaceId],escape=j?.surfaces[input.escapeSurfaceId]
 const surface=(value:typeof cover)=>Boolean(value&&value.kind==='support'&&value.mapId===trap!.mapId&&value.roomId===trap!.roomId&&activeVerticalSurface(state,value.surfaceId))
 if(!surface(cover)||!surface(bottom)||!surface(escape)||cover!.surfaceId===bottom!.surfaceId||cover!.surfaceId===escape!.surfaceId
   ||cover!.cells.length!==1||!same(cover!.cells[0],trap!.cell)||bottom!.cells.length!==1||!same(bottom!.cells[0],trap!.cell)
   ||cover!.elevationFeet-bottom!.elevationFeet!==10||escape!.elevationFeet!==cover!.elevationFeet
   ||!escape!.cells.some(cell=>Math.max(Math.abs(cell.x-trap!.cell.x),Math.abs(cell.y-trap!.cell.y))===1))
  toolkitError('PIT_MEASURED_SURFACES_REQUIRED','Select the real one-cell canvas, the same-column floor exactly ten feet lower and a distinct adjacent safe rim at canvas level. No floor or interior map is created.')
 const fact=state.worldFacts?.find(value=>value.id===input.factId),medium=readMovementMedium(state,input.climbMediumId)
 if(!fact||fact.source!=='record_scene_fact'||fact.expires!=='never'||fact.mapId!==trap!.mapId||fact.roomId!==trap!.roomId
   ||!fact.narrativeEffect?.cell||!same(fact.narrativeEffect.cell,trap!.cell)||medium.issue||medium.medium?.mode!=='climb'
   ||!medium.medium.cells.some(cell=>same(cell,trap!.cell))||medium.medium.bottomZFeet>bottom!.elevationFeet||medium.medium.topZFeet<cover!.elevationFeet)
  toolkitError('PIT_MEASURED_FACE_REQUIRED','Choose the durable actual pit observation and an existing measured climbing face spanning its real bottom and rim. No universal Athletics DC is invented.')
 if(Object.keys(j?.receipts??{}).length>=2048)toolkitError('VERTICAL_HISTORY_LIMIT','Reserve the original physical qualification receipt before adopting this pit.')
 const g:PitGeometry={input,command,at:state.worldTimeSeconds??0,source:readPitTrapSource(),cover:structuredClone(cover!) as unknown as Record<string,unknown>,
  bottom:structuredClone(bottom!) as unknown as Record<string,unknown>,escape:structuredClone(escape!) as unknown as Record<string,unknown>,medium:structuredClone(medium.medium!) as unknown as Record<string,unknown>,open:false}
 trap!.pitGeometry=g
 verticalData().receipts[qualificationKey(trap!.id)]={command,result:{pitGeometry:true,trapId:trap!.id,definition:definition(g)}}
 return{success:true,replayed:false,trapId:trap!.id,geometry:g,geometryCreated:false,actorMoved:false}
}
export function preparePitTrigger(trap:SceneTrap,targetId:string,successCell?:{x:number;y:number}){
 const state=gs.getState(),g=read(trap),j=jumpingStateOf(state)!,body=gs.getEntity(targetId),support=j.supports[targetId],height=entityVerticalContext(state,targetId)
 if(body&&'group'in body&&body.group)toolkitError('PIT_INDIVIDUAL_BODY_REQUIRED','Choose one actual individual body; a shared-HP group has no single measured pit descent.')
 if(swallowedBy(state,targetId)||activePhysicalLoad(state)||heldGrappleTargets(state,targetId).length||body?.conditions.includes('grappled'))toolkitError('PIT_PAIRED_BODY_UNSUPPORTED','This first pit descent does not detach a real carried load, grapple or contained body. Resolve its actual physical association before this trigger.')
 if(!successCell)toolkitError('PIT_SUCCESS_DESTINATION_REQUIRED','Explicitly choose the actual adjacent safe step-back cell for a successful save. Catching an unrepresented edge/handhold is outside this slice.')
 const cover=j.surfaces[g.input.coverSurfaceId],escape=j.surfaces[g.input.escapeSurfaceId]
 if(!body||!support||support.surfaceId!==cover.surfaceId||!same(body.position,trap.cell)||!height.known||height.airborne||height.zFeet!==cover.elevationFeet
   ||Math.max(Math.abs(successCell!.x-trap.cell.x),Math.abs(successCell!.y-trap.cell.y))!==1||!escape.cells.some(cell=>same(cell,successCell!)))
  toolkitError('PIT_TRIGGER_SUPPORT_REQUIRED','The actual victim stands on this measured canvas and the explicit safe response lies on its adjacent real rim.')
 assertKnockoutDamageSupported(body!,6)
 const grid=navigationGrid(state,targetId,getMapSpec(state.currentMapId,state).geometry)
 if(!grid.step(trap.cell,successCell!))toolkitError('PIT_SAFE_CELL_BLOCKED','The explicit safe cell must be physically free and reachable before either save outcome.')
 gs.assertGroundMovementPath(targetId,[successCell!],'forced')
 const column=xgeFallColumnIssue(state,targetId,{...body.position,zFeet:cover.elevationFeet},g.input.bottomSurfaceId)
 if(column)toolkitError(column.code,column.message)
 const projected=structuredClone(state),pj=projected.dmTools!.jumping!
 projected.dmTools!.traps[trap.id].pitGeometry!.open=true
 pj.supports[targetId]={...support,surfaceId:g.input.bottomSurfaceId,elevationFeet:Number(g.bottom.elevationFeet),revision:support.revision+1}
 const landing=prepareGroundGearStep(state,targetId,'landing'),hazard=oilGroundContactIssue(projected,targetId)??groundGearMovementIssue(projected,targetId,'landing',landing)
 if(hazard)toolkitError(hazard.code,hazard.message)
 if(Object.keys(j.receipts).length>=2047)toolkitError('VERTICAL_HISTORY_LIMIT','Reserve the actual pit result receipt before any save or damage.')
 const attempt={targetId,successCell:{...successCell!},definition:pitWitness({geometry:definition(g),targetId,successCell,startingSupport:support}),targetPosition:{...body.position},startingSupport:structuredClone(support) as unknown as Record<string,unknown>,status:'save_pending' as const}
 g.attempt=attempt
 return{pitDefinition:attempt.definition}
}
export function commitPitOutcome(trap:SceneTrap,targetId:string,pitDefinition:unknown,save:SavingThrowResult){
 const state=gs.getState(),g=read(trap),a=g.attempt,body=gs.getEntity(targetId),j=verticalData()
 if(!a||a.status!=='save_pending'||a.targetId!==targetId||a.definition!==pitDefinition||!body||!same(body.position,a.targetPosition)
   ||pitWitness(j.supports[targetId])!==pitWitness(a.startingSupport))toolkitError('PIT_SAVE_CONTEXT_CHANGED','Keep the original victim, held save, measured canvas and explicitly selected safe response.')
 const landing=prepareGroundGearStep(state,targetId,'landing')
 if(save.success){
  gs.moveToken(targetId,a!.successCell.x,a!.successCell.y)
 }else{
  const old=j.supports[targetId],surface=j.surfaces[g.input.bottomSurfaceId]
  j.supports[targetId]={entityId:targetId,mapId:state.currentMapId!,surfaceId:surface.surfaceId,elevationFeet:surface.elevationFeet,observedAt:state.worldTimeSeconds??0,
    source:`XGE2014 actual ten-foot pit descent ${trap.id}`,revision:(old?.revision??0)+1}
 }
 a!.status='resolved';a!.save=structuredClone(save) as unknown as Record<string,unknown>;a!.outcome=save.success?'edge':'bottom';g.open=true
 j.receipts[`\u0000pit-result:${trap.id}`]={command:a!.definition,result:{pitResult:true,trapId:trap.id,save:structuredClone(save),outcome:a!.outcome}}
 return save.success?undefined:landing
}
export function finishPitLanding(targetId:string,landing:ReturnType<typeof prepareGroundGearStep>|undefined){
 if(!landing)return[]
 onOilGroundContact(targetId);const contact=recordGroundGearContact(targetId,'landing',landing);return contact?[contact.id]:[]
}
export function assertPitHeldBodyMutation(id:string){
 const pending=gs.getState().hero?.pending?.command as Record<string,unknown>|undefined
 const resolution=pending?.toolkitResolution as {domain?:string;command?:Record<string,unknown>}|undefined
 if(resolution?.domain==='trap-save'&&Object.hasOwn(resolution.command??{},'pitDefinition')&&resolution.command?.targetId===id)
  toolkitError('PIT_HELD_SAVE_REQUIRED','Resolve this original pit save before a separate body mutation; no held physical consequence is orphaned.')
}

export const MigrateHeldPitSchema=z.object({pendingId:z.string().min(1).max(180),qualification:PitGeometryInputSchema,
 successCell:z.object({x:z.number().int().nonnegative(),y:z.number().int().nonnegative()}).strict(),actualCurrentGeometryOnlyConfirmed:z.literal(true),
 observations:z.object({surfaces:z.array(VerticalSurfaceInputSchema).max(3),body:PhysicalBodyInputSchema.optional(),standing:StandingSupportInputSchema.optional(),
  barrier:DeclareVerticalBarrierSchema.optional(),medium:MovementMediumInputSchema.optional()}).strict(),
}).strict()
/** Adoption of current physical observations for ONE actual uncommitted W37
 * save. The original die/window is retained; no historical height is invented. */
export function migrateHeldPitSave(raw:unknown){
 const input=MigrateHeldPitSchema.parse(raw),command=pitWitness(input),state=gs.getState(),trap=state.dmTools?.traps[input.qualification.trapId]
 if(trap?.pitGeometry?.migration){if(trap.pitGeometry.migration.command!==command)toolkitError('PIT_MIGRATION_CONFLICT','Retain the exact original current-geometry migration.');return{success:true,replayed:true,pendingId:input.pendingId,migrated:true,saveResolved:trap.pitGeometry.attempt?.status==='resolved',diceRolled:false}}
 const pending=state.hero?.pending,resolution=pending?.command.toolkitResolution as {domain?:unknown;command?:Record<string,unknown>}|undefined
 const oldSave=pending?.command.result as SavingThrowResult|undefined,targetId=resolution?.command?.targetId
 if(!pending||pending.id!==input.pendingId||pending.kind!=='save'||pending.command.type!=='save'||pending.continuation!==undefined
  ||resolution?.domain!=='trap-save'||Object.keys(resolution.command??{}).sort().join(',')!=='targetId,trapId'||resolution.command?.trapId!==trap?.id
  ||!trap||trap.template!=='pit'||trap.status!=='triggered'||trap.pitGeometry||typeof targetId!=='string'||oldSave?.entityId!==targetId||oldSave.ability!=='dex'||oldSave.dc!==10
  ||pending.sourceId!==targetId||pending.targetId!==targetId||!pending.roll||pending.roll.notation==='automatic-failure'||pitWitness(pending.roll)!==pitWitness(oldSave.roll)
  ||[...pending.options].sort().join(',')!=='bardic_inspiration,decline')
  toolkitError('PIT_LEGACY_SAVE_REQUIRED','Choose the exact actual W37 pit save still held before its physical outcome; no other pending or completed trap can be migrated.')
 const body=gs.getEntity(targetId as string),at=state.worldTimeSeconds??0
 if(!body||body.hp.current<1||body.conditions.some(c=>['unconscious','incapacitated','paralyzed','petrified','stunned'].includes(c))||!same(body.position,trap!.cell)||trap!.mapId!==state.currentMapId||trap!.roomId!==state.currentRoomId)
  toolkitError('PIT_MIGRATION_ACTUAL_BODY_REQUIRED','The original capable individual still physically occupies this exact pit on its current map; no past body or position is reconstructed.')
 const obs=input.observations,ids=[input.qualification.coverSurfaceId,input.qualification.bottomSurfaceId,input.qualification.escapeSurfaceId]
 if(obs.surfaces.some(v=>!ids.includes(v.surfaceId))||new Set(obs.surfaces.map(v=>v.surfaceId)).size!==obs.surfaces.length
  ||obs.body&&obs.body.entityId!==targetId||obs.standing&&(obs.standing.entityId!==targetId||obs.standing.surfaceId!==input.qualification.coverSurfaceId)
  ||obs.medium&&(obs.medium.mediumId!==input.qualification.climbMediumId||obs.medium.mode!=='climb'||obs.medium.cells.some(c=>!same(c,trap!.cell)&&!same(c,input.successCell)))
  ||obs.barrier&&obs.barrier.barrierId!==(obs.medium?.barrierId??jumpingStateOf(state)?.locomotion?.media[input.qualification.climbMediumId]?.barrierId))
  toolkitError('PIT_MIGRATION_MEASUREMENTS_REQUIRED','Measure only this exact selected canvas, floor, safe rim, original body and real selected climbing face; no unrelated observation is admitted.')
 if(Object.keys(jumpingStateOf(state)?.receipts??{}).length+obs.surfaces.length+Number(!!obs.body)+Number(!!obs.standing)+Number(!!obs.barrier)+Number(!!obs.medium)+2>=2048)
  toolkitError('VERTICAL_HISTORY_LIMIT','Reserve every real measurement, original migration and future landing before this adoption.')
 const original=structuredClone(pending),originalPendingWitness=pitWitness(original),bodyWitness=pitWitness(body)
 return withHeldPitMeasurements(state,()=>{
  for(const surface of obs.surfaces)recordVerticalSurface(surface)
  if(obs.body)recordPhysicalBody(obs.body)
  if(obs.standing)observeStandingSupport(obs.standing)
  if(obs.barrier)declareVerticalBarrier(obs.barrier)
  if(obs.medium)recordMovementMedium(obs.medium)
  qualifyPitGeometry(input.qualification,input.pendingId)
  const plan=preparePitTrigger(trap!,targetId as string,input.successCell),geometry=trap!.pitGeometry!
  if(!heldPitMeasurementsAllowed(state)||pitWitness(pending)!==originalPendingWitness||pitWitness(gs.getEntity(targetId as string))!==bodyWitness)
   toolkitError('PIT_MIGRATION_CONTEXT_CHANGED','Current measurements cannot rewrite the original held save, body, clock, turn or resources.')
  resolution!.command!.pitDefinition=plan.pitDefinition
  const adoptedPendingWitness=pitWitness(pending)
  geometry.migration={input:input as unknown as Record<string,unknown>,command,pendingId:input.pendingId,at,trapCreation:trap!.creation,
   originalPending:original as unknown as Record<string,unknown>,originalPendingWitness,adoptedPendingWitness,bodyWitness}
  geometry.attempt!.heldWitness=adoptedPendingWitness
  verticalData().receipts[qualificationKey(trap!.id)].result.pitMigrationWitness=pitWitness(geometry.migration)
  return{success:true,replayed:false,migrated:true,pendingId:input.pendingId,trapId:trap!.id,currentGeometryObservedAt:at,diceRolled:false,bodyMoved:false,seconds:0,resourcesSpent:false}
 })
}
