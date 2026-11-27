import { sameChaseParticipants } from '../lib/chase-state'
import type { GameState, MonsterState, PlayerState } from '../lib/types'
import type { NativeFlightPoint, SpatialAttackContext } from '../lib/spatial-weapon-state'
import { SpatialOpportunityObservationSchema, SpatialOpportunityBoundarySchema,
  initialSpatialOpportunityState, spatialOpportunityStateOf, spatialOpportunityKey,
  type SpatialOpportunityBoundary, type SpatialOpportunityState } from '../lib/spatial-opportunity-state'
import { spatialOpportunityExit, SPATIAL_OPPORTUNITY_SOURCE } from '../lib/spatial-opportunity-geometry'
import { actualNativeFlightLocation } from '../lib/native-flight-state'
import { nativeFlightFrameWitness, projectNativeFlightPoint } from '../lib/native-flight-geometry'
import { bodyPhysicalHeight, physicalBodyWitness, entityVerticalContext } from '../lib/jumping-state'
import { swallowedBy } from '../lib/swallow-state'
import { spellAreaRay, spellAreaBlockers } from '../lib/spell-area-physics'
import { resolveCreaturePerception, nativeCreatureSenses } from '../lib/creature-senses'
import { activeLights } from '../lib/lighting'
import { inferRoomIdOnMap } from '../lib/adventure-map'
import { weatherObscurationBetween } from '../lib/weather-state'
import { waterAlongAttack } from '../lib/underwater-rules'
import { projectActualGroundMovement } from '../lib/physical-ground-movement'
import { opportunityAttackChoices, type OpportunityAttackChoice, type OpportunityBoundary } from './opportunity-boundary'
import { exactUnderwaterAttackInputs } from './underwater'
import { reactionAvailable, effects, fail } from './hero-rules'
import { monsterSource } from './monster-rules'
import { toolkitState, toolkitError } from './toolkit'
import * as gs from './game-state'

const EPS = 1e-7
const body = (state: GameState, id: string) => id === 'player' ? state.player : state.monsters[id]
const allied = (state: GameState, id: string) => id === 'player' || state.monsters[id]?.hostile === false
const data = () => toolkitState().spatialOpportunities ??= initialSpatialOpportunityState()
export const movingOpportunityBodyWitness = (state: GameState, id: string) => JSON.stringify({
  id, mapId: state.currentMapId, type: id === 'player' ? state.player.characterId : state.monsters[id]?.type,
  body: physicalBodyWitness(state, id),
})

export function recordSpatialOpportunityGeometry(raw: unknown) {
  const input = SpatialOpportunityObservationSchema.parse(raw), state = gs.getState(), command = JSON.stringify(input)
  const old = spatialOpportunityStateOf(state)?.receipts[input.eventId]
  if (old) {
    if (old.command !== command) toolkitError('SPATIAL_OPPORTUNITY_EVENT_CONFLICT', 'Retain the original actual opportunity point observation.')
    return { ...structuredClone(old.result), replayed: true }
  }
  if (state.hero?.pending) toolkitError('REACTION_PENDING', 'A new physical observation cannot replace an offered or already rolled opportunity ray.')
  if (state.phase !== 'combat') toolkitError('SPATIAL_OPPORTUNITY_COMBAT_REQUIRED', 'Qualify the actual fight and source turn; no initiative or future reaction is created.')
  if(!state.initiativeOrder.includes(input.sourceId)||!state.initiativeOrder.includes(input.movingId))toolkitError('SPATIAL_OPPORTUNITY_COMBAT_REQUIRED','Use actually enrolled participants; physical qualification never activates another encounter or grants an off-scene turn.')
  const source = body(state, input.sourceId), moving = body(state, input.movingId)
  const fact = state.worldFacts?.find(f => f.id === input.factId && f.mapId === state.currentMapId)
  if (!source || !moving || source.id === moving.id || !fact)
    toolkitError('SPATIAL_OPPORTUNITY_BODIES_REQUIRED', 'Select the two actual active bodies and an existing physical fact on their current map.')
  if (swallowedBy(state, source!.id) || swallowedBy(state, moving!.id))
    toolkitError('SWALLOW_EXTERNAL_REACH_BLOCKED', 'A contained body has no exterior opportunity origin or target merely from the host projection.')
  if (('group' in source! && source!.group) || ('group' in moving! && moving!.group))
    toolkitError('SPATIAL_OPPORTUNITY_INDIVIDUAL_REQUIRED', 'This qualified point belongs to one actual individual, never an aggregate of invented source bodies.')
  const choice = exactUnderwaterAttackInputs(input.sourceId, { kind: 'creature', entityId: input.movingId }, input.weaponReference)
  const available = opportunityAttackChoices(source!).find(entry => entry.weaponOrSpell === choice.weaponReference)
  if (!available) toolkitError('SPATIAL_OPPORTUNITY_MELEE_REQUIRED', 'Choose one exact actually available held melee weapon or already supported source melee action.')
  const vertical = entityVerticalContext(state, source!.id), height = bodyPhysicalHeight(state, source!.id)
  const movingVertical = entityVerticalContext(state, moving!.id), movingHeight = bodyPhysicalHeight(state, moving!.id)
  if (!vertical.known || !movingVertical.known || height === null || movingHeight === null
    || input.sourcePointZFeet < vertical.zFeet! || input.sourcePointZFeet > vertical.zFeet! + height
    || input.movingPointOffsetZFeet > movingHeight)
    toolkitError('SPATIAL_OPPORTUNITY_BODY_POINTS_REQUIRED', 'The retained real points require both actually measured bodies at their known supports or flight heights; no mouth, eye, hand or anatomical size is inferred.')
  const record: SpatialOpportunityState['records'][string] = {
    input: { ...input, weaponReference: choice.weaponReference }, mapId: state.currentMapId!,
    combatGeneration: state.combatGeneration ?? 0, turnCounter: state.turnCounter ?? 0,
    sourceWitness: nativeFlightFrameWitness(state, input.sourceId),
    movingBodyWitness: movingOpportunityBodyWitness(state, input.movingId), at: state.worldTimeSeconds ?? 0,
  }
  const key = spatialOpportunityKey(input.sourceId, input.movingId, choice.weaponReference), stored = data()
  if (Object.keys(stored.receipts).length >= 2048 || !stored.records[key] && Object.keys(stored.records).length >= 512)
    toolkitError('SPATIAL_OPPORTUNITY_HISTORY_LIMIT', 'Retain every actual original observation before qualifying another source point.')
  stored.records[key] = record
  const result = { success: true, confidential: true, record: structuredClone(record), attackCreated: false,
    reactionSpent: false, positionChanged: false, diceRolled: false, source: SPATIAL_OPPORTUNITY_SOURCE }
  stored.receipts[input.eventId] = { command, result: structuredClone(result) }
  return result
}

function sourceEligible(state: GameState, source: PlayerState | MonsterState, movingId: string) {
  if (sameChaseParticipants(state,source.id,movingId)||!state.initiativeOrder.includes(source.id)||!state.initiativeOrder.includes(movingId)||source.id === movingId || source.hp.current <= 0 || !reactionAvailable(source.id)
    || swallowedBy(state, source.id) || allied(state, source.id) === allied(state, movingId)
    || source.conditions.some(c => ['incapacitated', 'paralyzed', 'petrified', 'stunned', 'unconscious'].includes(c))) return false
  return !(source.conditions.includes('blinded') && nativeCreatureSenses(source).blindsightFeet === 0)
}

function horizontalDistanceToSegment(source: { x: number; y: number }, from: NativeFlightPoint, to: NativeFlightPoint) {
  const dx = to.x - from.x, dy = to.y - from.y, square = dx * dx + dy * dy
  const t = square ? Math.max(0, Math.min(1, ((source.x - from.x) * dx + (source.y - from.y) * dy) / square)) : 0
  return Math.hypot(from.x + dx * t - source.x, from.y + dy * t - source.y) * 5
}

function retainedRecord(state: GameState, sourceId: string, movingId: string, choice: OpportunityAttackChoice) {
  const record = spatialOpportunityStateOf(state)?.records[spatialOpportunityKey(sourceId, movingId, choice.weaponOrSpell)]
  if (!record || record.mapId !== state.currentMapId || record.combatGeneration !== (state.combatGeneration ?? 0)
    || record.turnCounter !== (state.turnCounter ?? 0) || record.sourceWitness !== nativeFlightFrameWitness(state, sourceId)
    || record.movingBodyWitness !== movingOpportunityBodyWitness(state, movingId))
    fail('NATIVE_FLIGHT_OPPORTUNITY_CONTEXT_REQUIRED', `Qualify the exact retained body points for ${sourceId}, ${movingId} and ${choice.weaponOrSpell} before any movement or cost.`)
  return record!
}

/** Pure forecast of body coordinates. It does not install a location or choose
 * another route. The actual source-specific commit owns its position later. */
function projectedAt(state: GameState, movingId: string, point: NativeFlightPoint, nativeFlightId?: string) {
  if(nativeFlightId){
    const vertical=entityVerticalContext(state,movingId),projected=projectNativeFlightPoint(state,movingId,point,nativeFlightId,
      actualNativeFlightLocation(state,movingId)?.datumZFeet??vertical.supportZFeet??point.zFeet)
    if(projected.issue)fail(projected.issue.code,projected.issue.message)
    return projected.state!
  }
  const projected = structuredClone(state), moving = body(projected, movingId)!
  moving.position = { x: point.x, y: point.y }
  const location = projected.dmTools?.nativeFlight?.locations[movingId]
  if (location) location.point = { ...point }
  return projected
}

export function spatialOpportunityBoundaries(state: GameState, movingId: string, from: NativeFlightPoint,
  to: NativeFlightPoint, options: { nativeFlightId?: string; segmentIndex?: number; ignored?: string[]; minimumFraction?: number } = {}) {
  if (state.phase !== 'combat' || effects('disengage', movingId).length || swallowedBy(state, movingId)) return []
  const moving = body(state, movingId)
  if (!moving) fail('ENTITY_NOT_FOUND', 'The actual moving body must still exist.')
  const nativeMoving = Boolean(options.nativeFlightId || actualNativeFlightLocation(state, movingId)?.airborne)
  const result: SpatialOpportunityBoundary[] = []
  for (const source of [state.player, ...Object.values(state.monsters)]) {
    if (!sourceEligible(state, source, movingId) || !nativeMoving && !actualNativeFlightLocation(state, source.id)?.airborne) continue
    const choices = opportunityAttackChoices(source)
    for (const choice of choices) {
      if (horizontalDistanceToSegment(source.position, from, to) > choice.reachCells * 5 + EPS) continue
      if (moving!.id !== 'player' && monsterSource(moving!)?.special_abilities?.some(t => t.name === 'Flyby'))
        fail('SPATIAL_OPPORTUNITY_MOVEMENT_TRAIT_UNSUPPORTED', 'This source movement trait modifies opportunity attacks and remains outside the PHB-only slice; no new monster power is activated.')
      const sourceVertical=entityVerticalContext(state,source.id),sourceHeight=bodyPhysicalHeight(state,source.id),movingHeight=bodyPhysicalHeight(state,movingId)
      if(sourceVertical.known&&sourceHeight!==null&&movingHeight!==null){
        const gap=Math.max(0,sourceVertical.zFeet!-Math.max(from.zFeet,to.zFeet)-movingHeight,
          Math.min(from.zFeet,to.zFeet)-sourceVertical.zFeet!-sourceHeight)
        if(Math.hypot(horizontalDistanceToSegment(source.position,from,to),gap)>choice.reachCells*5+EPS)continue
      }
      const record = retainedRecord(state, source.id, movingId, choice)
      const origin = { ...source.position, zFeet: record.input.sourcePointZFeet }
      const computed = spatialOpportunityExit(origin, from, to, record.input.movingPointOffsetZFeet, choice.reachCells * 5)
      if (computed.issue) fail(computed.issue.code, computed.issue.message)
      if (!computed.exit || computed.exit.fraction + EPS < (options.minimumFraction ?? 0)) continue
      const exit = computed.exit, projected = projectedAt(state, movingId, exit.point, options.nativeFlightId), target = body(projected, movingId)!
      const ray = spellAreaRay(spellAreaBlockers(projected), { x: origin.x * 5, y: origin.y * 5, z: origin.zFeet },
        { x: exit.targetPoint.x * 5, y: exit.targetPoint.y * 5, z: exit.targetPoint.zFeet })
      if (ray.kind === 'unknown') fail('SPATIAL_OPPORTUNITY_RAY_REQUIRED', ray.message)
      if (ray.kind === 'blocked') continue
      const roomId = inferRoomIdOnMap(target.position, projected.currentMapId, projected)
      if ((projected.dmTools?.lighting?.ambient[projected.currentMapId!]?.[roomId ?? ''] ?? 'bright') !== 'bright' && activeLights(projected).length)
        fail('SPATIAL_LIGHT_GEOMETRY_REQUIRED', 'Actual artificial-light source heights remain unrepresented for this spatial opportunity; no projected XY light radius is extended through altitude.')
      if (waterAlongAttack(projected, source.id, { kind: 'creature', entityId: movingId }).length)
        fail('SPATIAL_OPPORTUNITY_WATER_CONTEXT_UNSUPPORTED', 'This prospective spatial opportunity crosses observed water and needs its own actual source weapon environment; no old water or air witness is retrofitted after movement.')
      const obscuration = weatherObscurationBetween(projected, source.position, target.position)
      if (!resolveCreaturePerception(projected, source, target, { pathClear: true, totalCover: false,
        distanceFeet: exit.distanceFeet, heavyObscuration: obscuration.heavy, lightObscuration: obscuration.light }).canSee) continue
      if (monsterSource(source)?.special_abilities?.some(t => ['Pack Tactics', 'Martial Advantage'].includes(t.name)))
        fail('SPATIAL_NATIVE_TRAIT_CONTEXT_REQUIRED', 'This existing source ally trait requires its own actual spatial geometry; the PHB opportunity slice grants no projected ally advantage or damage.')
      const context: SpatialAttackContext = { source: 'Actual selected measured spatial weapon ray; real Euclidean feet approved2026-11-04',
        actorId: source.id, targetId: movingId, weaponReference: choice.weaponOrSpell,
        origin, target: exit.targetPoint, distanceFeet: exit.distanceFeet,
        actorWitness: record.sourceWitness, targetWitness: nativeFlightFrameWitness(projected, movingId), observationEventId: record.input.eventId }
      let group = result.find(entry => entry.sourceId === source.id && Math.abs(entry.fraction - exit.fraction) < EPS)
      if (!group) {
        const key = `spatial-opportunity:${JSON.stringify([state.combatGeneration ?? 0, state.turnCounter ?? 0, source.id, movingId, from, to, exit.fraction])}`
        group = { kind: 'spatial-opportunity', key, sourceId: source.id, actorId: movingId, mapId: state.currentMapId!,
          from, to, point: exit.point, fraction: exit.fraction, choices: [], priority: record.input.priority,
          combatGeneration: state.combatGeneration ?? 0, turnCounter: state.turnCounter ?? 0, ...options.nativeFlightId ? { nativeFlightId: options.nativeFlightId } : {},
          ...options.segmentIndex ? { segmentIndex: options.segmentIndex } : {} }
        result.push(group)
      } else if (group.priority !== record.input.priority) fail('SPATIAL_OPPORTUNITY_PRIORITY_CONFLICT', 'Retain one explicit source priority for its simultaneous weapon choices.')
      group.choices.push({ ...choice, context })
    }
  }
  const filtered = result.filter(entry => !options.ignored?.includes(entry.key))
  for (const entry of filtered) for (const other of filtered) if (entry.sourceId !== other.sourceId && Math.abs(entry.fraction - other.fraction) < EPS
    && (entry.priority === undefined || other.priority === undefined || entry.priority === other.priority))
    fail('SPATIAL_OPPORTUNITY_ORDER_REQUIRED', 'These actual simultaneous reactors require distinct explicitly chosen MJ source priorities before any displacement; no attack order is invented.')
  return filtered.sort((a, b) => a.fraction - b.fraction || (a.priority ?? 0) - (b.priority ?? 0))
}

export function wrapSpatialOpportunity(boundary: SpatialOpportunityBoundary): OpportunityBoundary {
  const source = gs.getEntity(boundary.sourceId)!
  return { sourceId: boundary.sourceId, actorId: boundary.actorId, mapId: boundary.mapId,
    sourceCell: { ...source.position }, from: { x: boundary.from.x, y: boundary.from.y }, to: { x: boundary.to.x, y: boundary.to.y },
    choices: boundary.choices.map(({ context: _context, ...choice }) => choice), spatial: boundary }
}

export function preflightSpatialGroundOpportunities(state: GameState, movingId: string, path: { x: number; y: number }[]) {
  if (path.length < 2 || !Object.values(state.monsters).some(source => actualNativeFlightLocation(state, source.id)?.airborne)) return
  let projected = state
  for (const cell of path.slice(1)) {
    const from = entityVerticalContext(projected, movingId), moving = body(projected, movingId)!
    const next = projectActualGroundMovement(projected, movingId, cell)
    if (next.issue) fail(next.issue.code, next.issue.message)
    const to = entityVerticalContext(next.state, movingId)
    if (!from.known || !to.known) fail('SPATIAL_OPPORTUNITY_BODY_POINTS_REQUIRED', 'Retain the actual ground support before a spatial opportunity forecast.')
    spatialOpportunityBoundaries(projected, movingId, { ...moving.position, zFeet: from.zFeet! }, { ...cell, zFeet: to.zFeet! })
    projected = next.state
  }
}

export function inspectSpatialOpportunities() {
  return { confidential: true, spatialOpportunities: spatialOpportunityStateOf(gs.getState()) ?? null,
    diceRolled: false, movementCreated: false, source: SPATIAL_OPPORTUNITY_SOURCE }
}


/** Rebind only the actual current frame after the selected body has really
 * reached the already computed exact boundary. No ray or weapon is selected. */
export function currentSpatialOpportunityBoundary(planned:SpatialOpportunityBoundary):SpatialOpportunityBoundary {
  const state=gs.getState(),moving=body(state,planned.actorId),vertical=entityVerticalContext(state,planned.actorId)
  if(!moving||!vertical.known||moving.position.x!==planned.point.x||moving.position.y!==planned.point.y
    ||Math.abs(vertical.zFeet!-planned.point.zFeet)>EPS)
    fail('SPATIAL_OPPORTUNITY_POSITION_CHANGED','The moving body must occupy the exact retained boundary before a reaction is offered.')
  return {...planned,choices:planned.choices.map(choice=>({...choice,context:{...choice.context,
    actorWitness:nativeFlightFrameWitness(state,planned.sourceId),targetWitness:nativeFlightFrameWitness(state,planned.actorId)}}))}
}

export function assertSpatialOpportunityBoundary(raw:unknown,reference:string,reachCells?:number,weaponId?:string) {
  const parsed=SpatialOpportunityBoundarySchema.safeParse(raw)
  if(!parsed.success)fail('SPATIAL_OPPORTUNITY_BOUNDARY_INVALID','Retain the original complete spatial opportunity witness.')
  const boundary=parsed.data,state=gs.getState(),source=body(state,boundary.sourceId),moving=body(state,boundary.actorId)
  if(boundary.mapId!==state.currentMapId||boundary.combatGeneration!==(state.combatGeneration??0)
    ||boundary.turnCounter!==(state.turnCounter??0)||!source||!moving||swallowedBy(state,source.id)||swallowedBy(state,moving.id))
    fail('SPATIAL_OPPORTUNITY_BOUNDARY_INVALID','The exact original current-map source, moving body and turn must remain present, outside containment.')
  const canonical=exactUnderwaterAttackInputs(boundary.sourceId,{kind:'creature',entityId:boundary.actorId},reference)
  const selected=boundary.choices.find(choice=>choice.weaponOrSpell===canonical.weaponReference
    &&(reachCells===undefined||choice.reachCells===reachCells)&&(weaponId===undefined||choice.weaponId===weaponId))
  if(!selected)fail('OPPORTUNITY_REACH_NOT_LEFT','Select an exact offered melee weapon whose own actual3D reach is being left.')
  const context=selected!.context,record=spatialOpportunityStateOf(state)?.records[
    spatialOpportunityKey(boundary.sourceId,boundary.actorId,selected!.weaponOrSpell)]
  const vertical=entityVerticalContext(state,boundary.actorId)
  if(!record||record.input.eventId!==context.observationEventId||record.input.sourcePointZFeet!==context.origin.zFeet
    ||context.actorId!==boundary.sourceId||context.targetId!==boundary.actorId||context.actorWitness!==record.sourceWitness
    ||context.weaponReference!==selected!.weaponOrSpell||source!.position.x!==context.origin.x||source!.position.y!==context.origin.y
    ||moving!.position.x!==boundary.point.x||moving!.position.y!==boundary.point.y||!vertical.known
    ||Math.abs(vertical.zFeet!-boundary.point.zFeet)>EPS
    ||context.target.x!==boundary.point.x||context.target.y!==boundary.point.y
    ||Math.abs(context.target.zFeet-boundary.point.zFeet-record.input.movingPointOffsetZFeet)>EPS)
    fail('SPATIAL_OPPORTUNITY_BOUNDARY_INVALID','The original actual source/body points, observation and reached boundary must still agree before dice or reaction cost.')
  const derived=spatialOpportunityExit(context.origin,boundary.from,boundary.to,record!.input.movingPointOffsetZFeet,selected!.reachCells*5)
  if(derived.issue||!derived.exit||Math.abs(derived.exit.fraction-boundary.fraction)>EPS
    ||Math.abs(derived.exit.distanceFeet-context.distanceFeet)>EPS
    ||Math.abs(derived.exit.point.zFeet-boundary.point.zFeet)>EPS)
    fail('SPATIAL_OPPORTUNITY_BOUNDARY_INVALID','Retain the exact original source reach intersection and derived distance; neither a new weapon range nor a shorter held ray is invented.')
  return context
}

/** Initial selection and held attacks must match the same stored explicit
 * physical observation and original offered boundary, not a fresh ray. */
export function retainedSpatialOpportunityContext(context:SpatialAttackContext):SpatialAttackContext|undefined {
  const pending=gs.getState().hero?.pending
  const candidates=[pending?.command.opportunityBoundary,pending?.continuation?.opportunityBoundary]
  for(const candidate of candidates){
    const raw=(candidate as {spatial?:unknown}|undefined)?.spatial
    if(!raw)continue
    const parsed=SpatialOpportunityBoundarySchema.safeParse(raw)
    const selected=parsed.success?parsed.data.choices.find(choice=>choice.context.actorId===context.actorId
      &&choice.context.targetId===context.targetId&&choice.weaponOrSpell===context.weaponReference
      &&JSON.stringify(choice.context)===JSON.stringify(context)):undefined
    if(selected)return assertSpatialOpportunityBoundary(raw,context.weaponReference,selected.reachCells,selected.weaponId)
  }
  return undefined
}

export function validateSpatialOpportunityState(state:GameState){
  const stored=spatialOpportunityStateOf(state);if(!stored)return[];const issues:string[]=[]
  for(const[key,record]of Object.entries(stored.records))if(key!==spatialOpportunityKey(record.input.sourceId,record.input.movingId,record.input.weaponReference)
    ||record.at>(state.worldTimeSeconds??0)||JSON.stringify(stored.receipts[record.input.eventId]?.result.record)!==JSON.stringify(record))
    issues.push('A retained spatial opportunity observation requires its original exact source/body/weapon receipt and actual past clock.')
  const pending=state.hero?.pending,candidates=[pending?.command.opportunityBoundary,pending?.continuation?.opportunityBoundary]
  for(const candidate of candidates){
    const raw=(candidate as {spatial?:unknown}|undefined)?.spatial;if(!raw)continue
    const parsed=SpatialOpportunityBoundarySchema.safeParse(raw)
    if(!parsed.success){issues.push('An active spatial opportunity retains its original complete boundary.');continue}
    const boundary=parsed.data
    if(boundary.mapId!==state.currentMapId||boundary.combatGeneration!==(state.combatGeneration??0)
      ||boundary.turnCounter!==(state.turnCounter??0))issues.push('An active spatial opportunity belongs to its actual current map, encounter and turn.')
    for(const choice of boundary.choices){
      const context=choice.context,record=stored.records[spatialOpportunityKey(boundary.sourceId,boundary.actorId,choice.weaponOrSpell)]
      const exit=record&&spatialOpportunityExit(context.origin,boundary.from,boundary.to,record.input.movingPointOffsetZFeet,choice.reachCells*5)
      if(!record||record.input.eventId!==context.observationEventId||record.sourceWitness!==context.actorWitness
        ||context.actorId!==boundary.sourceId||context.targetId!==boundary.actorId||context.weaponReference!==choice.weaponOrSpell
        ||record.input.sourcePointZFeet!==context.origin.zFeet||exit?.issue||!exit?.exit
        ||Math.abs(exit.exit.fraction-boundary.fraction)>EPS||JSON.stringify(exit.exit.point)!==JSON.stringify(boundary.point)
        ||JSON.stringify(exit.exit.targetPoint)!==JSON.stringify(context.target)||Math.abs(exit.exit.distanceFeet-context.distanceFeet)>EPS)
        issues.push('An active spatial opportunity retains its original observed source, individual weapon reach, exact intersection and held physical ray.')
    }
    const held=pending?.command.spatialContext
    if(held&&!boundary.choices.some(choice=>JSON.stringify(choice.context)===JSON.stringify(held)))
      issues.push('An already rolled spatial opportunity retains exactly one original offered attack ray before any bonus die.')
  }
  return issues
}


export function spatialGroundStepBoundaries(state:GameState,movingId:string,from:{x:number;y:number},to:{x:number;y:number},ignored:string[]){
 if(!Object.values(state.monsters).some(source=>actualNativeFlightLocation(state,source.id)?.airborne))return[]
 const sourceHeight=entityVerticalContext(state,movingId),projection=projectActualGroundMovement(state,movingId,to)
 if(projection.issue)fail(projection.issue.code,projection.issue.message)
 const destination=entityVerticalContext(projection.state,movingId)
 if(!sourceHeight.known||!destination.known)fail('SPATIAL_OPPORTUNITY_BODY_POINTS_REQUIRED','Retain the actual supported ground levels before this offered spatial departure.')
 return spatialOpportunityBoundaries(state,movingId,{...from,zFeet:sourceHeight.zFeet!},{...to,zFeet:destination.zFeet!},{ignored})
}
