import { sceneObjectFootprint } from '../lib/razorvine-state'
import { swallowBoundary } from '../lib/swallow-state'
import { spatialWeaponResolution } from '../lib/spatial-weapon-resolution'
import type { EntityStats } from '../lib/types'
import { firstMapId, inferRoomIdOnMap,getMapSpec } from '../lib/adventure-map'
import { COVER_SOURCE, CoverRecordSchema, coverObstacleBetween, sameCoverCell,
  type CoverOrigin, type CoverRecord, type CoverState } from '../lib/cover-state'
import { available } from './hero-rules'
import { toolkitError, toolkitState } from './toolkit'
import * as gs from './game-state'
import * as rules from './rules'
import { weatherHeightCombatIssue,weatherHeightPointIssue } from '../lib/weather-state'
import { entityVerticalContext,physicalBodyWitness,bodyPhysicalHeight,physicalHeightCombatIssue,physicalHeightPointIssue } from '../lib/jumping-state'
import { barrierShadowHeights } from '../lib/spell-area-geometry'
import { readPhysicalBarrier } from '../lib/vertical-barriers'
import { blockerRayInterval } from '../lib/spell-area-physics'

export type { CoverOrigin } from '../lib/cover-state'
type Holder = { cover?: CoverState }
const stored = () => (gs.getState().dmTools as Holder | undefined)?.cover?.records ?? {}
const mapId = () => gs.getState().currentMapId ?? firstMapId(gs.getState())
const originCell = (origin: CoverOrigin) => typeof origin === 'string' ? gs.getEntity(origin)?.position : origin
const rank = { none: 0, half: 1, three_quarters: 2, total: 3 } as const

function active(record: CoverRecord): boolean {
  const state = gs.getState(), object=record.targetKind==='object'?state.dmTools?.objects[record.targetId]:undefined, target=object&&object.mapId===mapId()&&(object.razorvine?sceneObjectFootprint(object).some(cell=>sameCoverCell(cell,record.targetCell)):sameCoverCell(object.cell,record.targetCell))?{position:record.targetCell}:record.targetKind==='object'?undefined:gs.getEntity(record.targetId)
  if (record.mapId !== mapId() || !target || !sameCoverCell(target.position, record.targetCell)
    || inferRoomIdOnMap(target.position, record.mapId, state) !== record.targetRoomId) return false
  const origin = record.origin.kind === 'actor' ? gs.getEntity(record.origin.id)?.position : record.origin.cell
  return Boolean(origin && sameCoverCell(origin, record.origin.cell)
    && inferRoomIdOnMap(origin, record.mapId, state) === record.originRoomId
    && coverObstacleBetween(origin, target.position, record.obstacleCell))
}

/** Pure directional lookup. No obstacle/creature automatically grants cover. */
export function coverFor(origin: CoverOrigin, targetId: string) {
  if(gs.getState().dmTools?.objects[targetId]&&!gs.getEntity(targetId))return sceneObjectCoverFor(origin,targetId)
  const state=gs.getState(),boundary=swallowBoundary(gs.getState(),typeof origin==='string'?origin:undefined,targetId)
  if(boundary==='blocked'||boundary==='interior_geometry_required')return{degree:'total' as const,acBonus:0,dexSaveBonus:0,records:[],source:COVER_SOURCE}
  if(boundary==='host_contact'||boundary==='self')return{degree:'none' as const,acBonus:0,dexSaveBonus:0,records:[],source:COVER_SOURCE}
  const spatial=typeof origin==='string'?spatialWeaponResolution(state,origin,targetId):undefined
  if(spatial){const result=areaCoverFor({x:spatial.origin.x*5,y:spatial.origin.y*5,z:spatial.origin.zFeet},targetId,false,origin as string);return{degree:result.degree,acBonus:result.bonus,dexSaveBonus:result.bonus,records:result.records,source:COVER_SOURCE}}
  const heightIssue=typeof origin==='string'?(physicalHeightCombatIssue(state,[origin,targetId])??weatherHeightCombatIssue(state,[origin,targetId])):(physicalHeightPointIssue(state,[targetId])??weatherHeightPointIssue(state,[targetId]))
  if(heightIssue)toolkitError(heightIssue.code,heightIssue.message)
  const cell = originCell(origin)
  const records = Object.values(stored()).filter(record => record.targetId === targetId && active(record)
    && (typeof origin === 'string'
      ? record.origin.kind === 'actor' && record.origin.id === origin
      : record.origin.kind === 'point' && sameCoverCell(record.origin.cell, origin)))
  const targetHeight=entityVerticalContext(state,targetId),sourceHeight=typeof origin==='string'?entityVerticalContext(state,origin):undefined
  for(const record of records){
    if(record.spatial){
      const spatial=record.spatial,read=readPhysicalBarrier(state,spatial.barrierId)
      if(!read.active||!read.barrier||read.issue||JSON.stringify(read.barrier)!==spatial.barrierWitness||!targetHeight.known||targetHeight.zFeet!==spatial.targetZFeet
        ||(sourceHeight?sourceHeight.zFeet:0)!==spatial.originZFeet||JSON.stringify(physicalBodyWitness(state,targetId))!==spatial.bodyWitness)
        toolkitError('COVER_OBSERVATION_STALE','Observe the actual cover direction again at its present support heights, barrier and body posture before any die; an old XY or spatial declaration cannot follow a new ledge implicitly.')
    }else if(!targetHeight.known||targetHeight.zFeet!==0||sourceHeight&&(!sourceHeight.known||sourceHeight.zFeet!==0))
      toolkitError('COVER_SPATIAL_REQUIRED','This relevant grade was observed only on the historical flat XY plane. Declare its actual origin height, measured barrier and current body before using it on real relief.')
  }
  // Point and actor declarations remain distinct: a fireball center never
  // borrows a caster's cover merely because it happens to be nearby.
  const degree = cell ? records.reduce<'none' | CoverRecord['degree']>((best, record) => rank[record.degree] > rank[best] ? record.degree : best, 'none') : 'none'
  const bonus = degree === 'half' ? 2 : degree === 'three_quarters' ? 5 : 0
  return { degree, acBonus: bonus, dexSaveBonus: bonus, records: records.map(record => record.id), source: COVER_SOURCE }
}

export function assertDirectCoverTarget(origin: CoverOrigin, targetId: string) {
  const cover = coverFor(origin, targetId)
  if (cover.degree === 'total') toolkitError('COVER_TOTAL', 'This exact origin cannot directly target the creature through declared total cover. No attack, spell cost or die has been resolved.')
  return cover
}

export function coverArmorClass(origin: CoverOrigin, targetId: string, baseAC: number): number {
  return baseAC + assertDirectCoverTarget(origin, targetId).acBonus
}

export function assertCoverOriginKnown(origin: CoverOrigin | undefined, targetId: string): void {
  if (origin === undefined) {
    if (Object.values(stored()).some(record => record.targetId === targetId && active(record)))
      toolkitError('COVER_ORIGIN_REQUIRED', 'A relevant cover declaration requires the actual attack/effect origin (actor ID or exact point); no source direction is inferred.')
    return
  }
  const cell = originCell(origin)
  if (!cell) toolkitError('ENTITY_NOT_FOUND', 'Select an existing source actor or an actual explicit effect origin point; an unknown actor cannot bypass directional cover.')
  rules.validateMapCell(cell!, 'origin')
}

export function coverSavingThrowBonus(origin: CoverOrigin | undefined, targetId: string, ability: keyof EntityStats): number {
  if (ability !== 'dex') return 0
  assertCoverOriginKnown(origin, targetId)
  if(origin===undefined)return 0
  const cover = coverFor(origin, targetId)
  if (cover.degree === 'total') toolkitError('COVER_TOTAL_SAVE_UNRESOLVED', 'Total cover is not a numeric Dexterity bonus. Resolve direct targeting or the explicit supported area exception before rolling.')
  return cover.dexSaveBonus
}

/** Only the reviewed area planner calls this spatial lookup. A declared
 * partial grade remains MJ adjudication; a measured wall is not assigned an
 * invented percentage of body coverage. */
export function areaCoverFor(origin:{x:number;y:number;z:number},targetId:string,legacyFlat=false,sourceActorId?:string){
 if(swallowBoundary(gs.getState(),sourceActorId,targetId)==='blocked'||swallowBoundary(gs.getState(),sourceActorId,targetId)==='interior_geometry_required')return{degree:'total' as const,bonus:0,records:[],targetPosition:gs.getEntity(targetId)?.position}
 const target=gs.getEntity(targetId),vertical=entityVerticalContext(gs.getState(),targetId)
 const records=Object.values(stored()).filter(r=>r.targetId===targetId&&active(r)&&sameCoverCell(r.origin.cell,{x:origin.x/5,y:origin.y/5})&&(r.origin.kind==='point'||r.origin.id===sourceActorId))
 let degree:'none'|CoverRecord['degree']='none'
 for(const record of records){
  if(record.spatial){
   const spatial=record.spatial,read=readPhysicalBarrier(gs.getState(),spatial.barrierId)
   if(!read.active||!read.barrier||read.issue||JSON.stringify(read.barrier)!==spatial.barrierWitness||!vertical.known||vertical.zFeet!==spatial.targetZFeet||origin.z!==spatial.originZFeet||JSON.stringify(physicalBodyWitness(gs.getState(),targetId))!==spatial.bodyWitness)
    toolkitError('AREA_COVER_OBSERVATION_STALE','Observe this actual spatial cover direction again before resolving the area; no old height/posture is silently reused.')
  }else if(!legacyFlat||origin.z!==0||vertical.zFeet!==0)toolkitError('AREA_COVER_SPATIAL_REQUIRED','This relevant cover grade was observed only in XY. Declare its actual origin height and measured barrier before this spatial spell.')
  if(rank[record.degree]>rank[degree])degree=record.degree
 }
 return{degree,bonus:degree==='half'?2:degree==='three_quarters'?5:0,records:records.map(r=>r.id),targetPosition:target?.position}
}

export function configureCover(input: { coverId: string; operation: 'set' | 'remove'; originId?: string;
  originCell?: { x: number; y: number }; targetId?: string; obstacleCell?: { x: number; y: number };
  degree?: CoverRecord['degree']; reason?: string;targetCell?:{x:number;y:number};spatial?:{originZFeet:number;barrierId:string} }) {
  available()
  if (input.operation === 'remove') {
    if (['originId','originCell','targetId','obstacleCell','degree','reason','targetCell','spatial'].some(key => input[key as keyof typeof input] !== undefined))
      toolkitError('COVER_SELECTION_INVALID', 'Removing a declaration requires only coverId and operation.')
    const exists = Boolean(stored()[input.coverId])
    if (exists) delete (gs.getState().dmTools as Holder).cover!.records[input.coverId]
    return { success: true, removed: exists, coverId: input.coverId, source: COVER_SOURCE }
  }
  if ((input.originId !== undefined) === (input.originCell !== undefined) || !input.targetId || !input.obstacleCell || !input.degree || !input.reason?.trim())
    toolkitError('COVER_SELECTION_INVALID', 'Set requires exactly originId OR originCell, targetId, obstacleCell, degree and a factual MJ reason.')
  if(gs.getState().dmTools?.objects[input.targetId!]&&!gs.getEntity(input.targetId!))return configureSceneObjectCover(input)
  if(input.targetCell)toolkitError('OBJECT_COVER_FACE_REQUIRED','An explicit face is supported only for a real rooted razorvine scene object.')
  const origin = input.originId ?? input.originCell!, cell = originCell(origin), target = gs.getEntity(input.targetId!)
  if (!cell || !target) toolkitError('ENTITY_NOT_FOUND', 'Select an existing origin actor and target creature, or a real explicit origin point.')
  const heightIssue=typeof origin==='string'?weatherHeightCombatIssue(gs.getState(),[origin,input.targetId!]):weatherHeightPointIssue(gs.getState(),[input.targetId!])
  if(heightIssue&&!input.spatial)toolkitError(heightIssue.code,heightIssue.message)
  if (input.originId === input.targetId) toolkitError('COVER_ORIGIN_INVALID', 'A creature cannot provide a cover direction against itself.')
  if(input.spatial&&typeof origin!=='string'){
    const map=getMapSpec(mapId(),gs.getState())
    if(!Number.isFinite(cell!.x)||!Number.isFinite(cell!.y)||cell!.x<-.5||cell!.y<-.5||cell!.x>map.grid.cols-.5||cell!.y>map.grid.rows-.5)toolkitError('COVER_ORIGIN_INVALID','The explicit spatial origin must be within the actual represented map.')
  }else rules.validateMapCell(cell!)
  rules.validateMapCell(input.obstacleCell!); rules.validateMapCell(target!.position)
  const state = gs.getState(), currentMap = mapId()
  const originRoomId = inferRoomIdOnMap(cell!, currentMap, state), targetRoomId = inferRoomIdOnMap(target!.position, currentMap, state)
  if (!originRoomId || !targetRoomId) toolkitError('COVER_ROOM_REQUIRED', 'Both actual origin and target must lie in existing rooms of the active map.')
  if (!coverObstacleBetween(cell!, target!.position, input.obstacleCell!)) toolkitError('COVER_OBSTACLE_NOT_BETWEEN', 'The declared obstacle cell must intersect the ray strictly between the exact origin and target; no inferred cover or corner-only contact.')
  let spatial:CoverRecord['spatial']
  if(input.spatial){
   const vertical=entityVerticalContext(state,input.targetId!),read=readPhysicalBarrier(state,input.spatial.barrierId)
   if(!vertical.known||!read.active||!read.barrier||read.issue)toolkitError('AREA_COVER_MEASUREMENT_REQUIRED','A spatial grade needs the current measured target support and active physical barrier.')
   const from={x:cell!.x*5,y:cell!.y*5,z:input.spatial.originZFeet}
   if(input.originId&&entityVerticalContext(state,input.originId).zFeet!==from.z)toolkitError('AREA_COVER_ORIGIN_HEIGHT','The actor origin must match its actual measured height.')
   const path=blockerRayInterval({key:read.barrier!.id,boxes:read.actual!.boxes,edge:read.actual!.edge},from,{x:target!.position.x*5,y:target!.position.y*5})
   if(!path)toolkitError('COVER_OBSTACLE_NOT_BETWEEN','The actual measured barrier must cross this direction.')
   const height=bodyPhysicalHeight(state,input.targetId!)
   if(height===null)toolkitError('AREA_COVER_BODY_MEASUREMENT_REQUIRED','Observe the actual body in its current posture before judging a spatial coverage fraction.')
   const shadow=barrierShadowHeights(from.z,path!,read.barrier!.bottomZFeet,read.barrier!.topZFeet)
   if(shadow.max<vertical.zFeet!||shadow.min>vertical.zFeet!+height!)toolkitError('COVER_OBSTACLE_NOT_BETWEEN','The measured barrier does not cover any part of the actual vertical body interval in this direction.')
   spatial={...input.spatial,targetZFeet:vertical.zFeet!,barrierWitness:JSON.stringify(read.barrier),bodyWitness:JSON.stringify(physicalBodyWitness(state,input.targetId!))}
  }
  const parsed = CoverRecordSchema.safeParse({ id: input.coverId,
    origin: typeof origin === 'string' ? { kind: 'actor', id: origin, cell: { ...cell! } } : { kind: 'point', cell: { ...cell! } },
    targetId: input.targetId, targetCell: { ...target!.position }, mapId: currentMap,
    originRoomId, targetRoomId, obstacleCell: input.obstacleCell, degree: input.degree, reason: input.reason,...spatial?{spatial}:{} })
  if (!parsed.success) toolkitError('COVER_SELECTION_INVALID', 'Invalid bounded cover declaration.')
  if (!stored()[input.coverId] && Object.keys(stored()).length >= 128) toolkitError('COVER_DECLARATION_LIMIT', 'At most 128 directional cover records; remove obsolete declarations explicitly.')
  const data = toolkitState() as ReturnType<typeof toolkitState> & Holder
  data.cover ??= { records: {} }; data.cover.records[input.coverId] = parsed.data!
  return { success: true, declaration: parsed.data, cover: spatial?areaCoverFor({x:cell!.x*5,y:cell!.y*5,z:spatial.originZFeet},input.targetId!):coverFor(origin, input.targetId!),
    notice: 'MJ scene adjudication only: no movement, concealment, obstacle creation, discovery or player action granted. Moving either actor invalidates its anchored declaration.' }
}

export function inspectCover(origin: CoverOrigin, targetId: string,originZFeet?:number,targetCell?:{x:number;y:number}) {
  const cell = originCell(origin)
  if(gs.getState().dmTools?.objects[targetId]&&!gs.getEntity(targetId)){if(originZFeet!==undefined)toolkitError('OBJECT_COVER_SPATIAL_UNSUPPORTED','Object cover currently uses exact coplanar source/target anchors; no unmeasured object dimensions.');return{origin,targetId,...sceneObjectCoverFor(origin,targetId,targetCell),declarations:Object.values(stored()).filter(r=>r.targetKind==='object'&&r.targetId===targetId)}}
  if(targetCell)toolkitError('OBJECT_COVER_FACE_REQUIRED','An explicit face is supported only for a real rooted razorvine scene object.')
  if (!cell || !gs.getEntity(targetId)) toolkitError('ENTITY_NOT_FOUND', 'Choose an existing target and origin actor, or an explicit map point.')
  if(originZFeet===undefined)rules.validateMapCell(cell!)
  else{const map=getMapSpec(mapId(),gs.getState());if(!Number.isFinite(originZFeet)||cell!.x<-.5||cell!.y<-.5||cell!.x>map.grid.cols-.5||cell!.y>map.grid.rows-.5)toolkitError('COVER_ORIGIN_INVALID','Choose a finite actual spatial origin within this map.')}
  return { origin, targetId, ...(originZFeet===undefined?coverFor(origin, targetId):areaCoverFor({x:cell!.x*5,y:cell!.y*5,z:originZFeet},targetId,false,typeof origin==='string'?origin:undefined)),
    declarations: Object.values(stored()).filter(record => record.targetId === targetId).map(record => ({ ...record, active: active(record) })),
    notice: 'Read-only confidential MJ scene state. No discovery, die, cost or state change. Nonmatching origins and moved anchors grant no bonus.' }
}


/** Real scene-object directional cover, separate from creature anatomy. Only
 * established coplanar point geometry is supported in this first object path. */
function objectCoverPlane(origin:CoverOrigin,targetId:string){
 const state=gs.getState(),object=state.dmTools?.objects[targetId],from=originCell(origin)
 if(!object||object.mapId!==mapId()||!from)toolkitError('SCENE_OBJECT_NOT_FOUND','Choose the exact actual local object and source.')
 const vertical=typeof origin==='string'?entityVerticalContext(state,origin):undefined
 if(vertical&&(!vertical.known||vertical.airborne||vertical.zFeet!==0))
  toolkitError('OBJECT_COVER_SPATIAL_UNSUPPORTED','This actual nonplanar object cover requires measured object/source rays, not inferred body or object dimensions.')
 return{object:object!,from:from!}
}
export function sceneObjectCoverFor(origin:CoverOrigin,targetId:string,faceCell?:{x:number;y:number}){
 const{object}=objectCoverPlane(origin,targetId)
 if(faceCell&&(!object.razorvine||!sceneObjectFootprint(object).some(cell=>sameCoverCell(cell,faceCell))))toolkitError('OBJECT_COVER_FACE_REQUIRED','Select one exact actual footprint cell of the rooted razorvine for directional face cover.')
 const records=Object.values(stored()).filter(r=>r.targetKind==='object'&&r.targetId===object.id&&(!faceCell||sameCoverCell(r.targetCell,faceCell))&&active(r)&&(typeof origin==='string'?r.origin.kind==='actor'&&r.origin.id===origin:r.origin.kind==='point'&&sameCoverCell(r.origin.cell,origin)))
 const degree=records.reduce<'none'|CoverRecord['degree']>((best,r)=>rank[r.degree]>rank[best]?r.degree:best,'none'),bonus=degree==='half'?2:degree==='three_quarters'?5:0
 return{degree,acBonus:bonus,dexSaveBonus:bonus,records:records.map(r=>r.id),source:COVER_SOURCE}
}
function configureSceneObjectCover(input:Parameters<typeof configureCover>[0]){
 const state=gs.getState();if(state.hero?.pending)toolkitError('REACTION_PENDING','Keep the original already rolled object ray and cover before any bonus die.')
 if(input.spatial)toolkitError('OBJECT_COVER_SPATIAL_UNSUPPORTED','No object size or vertical coverage fraction is inferred; this object cover procedure is coplanar only.')
 const origin=input.originId??input.originCell!,{object,from}=objectCoverPlane(origin,input.targetId!)
 const targetCell=input.targetCell??object.cell
 if(input.targetCell&&(!object.razorvine||!sceneObjectFootprint(object).some(cell=>sameCoverCell(cell,targetCell))))toolkitError('OBJECT_COVER_FACE_REQUIRED','An explicit face must be one of this actual rooted hedge footprint cells.')
 rules.validateMapCell(from);rules.validateMapCell(targetCell);rules.validateMapCell(input.obstacleCell!)
 const originRoomId=inferRoomIdOnMap(from,mapId(),state),targetRoomId=inferRoomIdOnMap(targetCell,mapId(),state)
 if(!originRoomId||!targetRoomId||!coverObstacleBetween(from,targetCell,input.obstacleCell!))toolkitError('COVER_OBSTACLE_NOT_BETWEEN','The actual selected obstacle cell must be strictly between this real origin and object; no cover is inferred.')
 const parsed=CoverRecordSchema.parse({id:input.coverId,targetKind:'object',origin:typeof origin==='string'?{kind:'actor',id:origin,cell:{...from}}:{kind:'point',cell:{...from}},targetId:object.id,targetCell:{...targetCell},mapId:mapId(),originRoomId,targetRoomId,obstacleCell:input.obstacleCell,degree:input.degree,reason:input.reason})
 if(!stored()[input.coverId]&&Object.keys(stored()).length>=128)toolkitError('COVER_DECLARATION_LIMIT','Retain the bounded actual directional cover history.')
 const data=toolkitState();data.cover??={records:{}};data.cover.records[input.coverId]=parsed
 return{success:true,declaration:parsed,cover:sceneObjectCoverFor(origin,object.id,object.razorvine?targetCell:undefined),notice:'Actual object cover adjudication only; no obstacle, item movement, attack, die or action created.'}
}
