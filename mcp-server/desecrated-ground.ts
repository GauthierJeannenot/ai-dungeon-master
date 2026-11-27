import {
  actualDesecrationSurface, currentDesecratedCells, desecratedGroundStateOf, purificationFootprint, sameDesecratedCell,
  DESECRATED_GROUND_SOURCE, DESECRATION_DETECTION_MARKER, DETECT_DESECRATION_SOURCE,
  RecordDesecratedGroundSchema, PurifyDesecratedGroundSchema, type DesecratedGroundZone,
} from '../lib/desecrated-ground-state'
import { groundGearPhysicalWitness as witness } from '../lib/ground-gear-recovery-state'
import { getMapSpec, inferRoomIdOnMap } from '../lib/adventure-map'
import { entityGroundContact, entityVerticalContext } from '../lib/jumping-state'
import { lightingRay } from '../lib/lighting'
import { navigationGrid } from '../lib/navigation'
import { swallowedBy } from '../lib/swallow-state'
import type { GameState, Item, WorldFact } from '../lib/types'
import { available, advanceHeroTime, distance, now } from './hero-rules'
import { afterInventoryChange, currentLoadout, equipmentId, freeHands } from './equipment'
import { preflightGroundGearWork } from './ground-gear'
import { preflightRestStrenuousInterval, recordRestMeasuredActivityInterval } from './resting'
import { activeAfflictions } from './afflictions'
import { assertToolkitReach, toolkitError, toolkitState } from './toolkit'
import * as gs from './game-state'
import * as rules from './rules'

const data = () => toolkitState().desecratedGround ??= { version: 1, zones: {}, purifications: {} }
const isHolyWater = (item: Item | undefined) => item?.type === 'misc' && equipmentId(item) === 'holy_water_flask'

export function recordDesecratedGround(raw: unknown) {
  const input = RecordDesecratedGroundSchema.parse(raw), state = gs.getState()
  const ledger = desecratedGroundStateOf(state), old = ledger?.zones[input.zoneId]
  if (old) {
    if (witness(old.input) !== witness(input)) toolkitError('DESECRATED_GROUND_EVENT_CONFLICT', 'Retain the original measured and explicitly qualified zone.')
    return { success: true, zone: old, replayed: true, source: DESECRATED_GROUND_SOURCE }
  }
  available()
  if (Object.keys(ledger?.zones ?? {}).length >= 64) toolkitError('DESECRATED_GROUND_HISTORY_LIMIT', 'The retained source zones are full.')
  const surface = actualDesecrationSurface(state, input.surfaceId)
  if (!surface || surface.mapId !== state.currentMapId || surface.roomId !== state.currentRoomId)
    toolkitError('DESECRATED_GROUND_SUPPORT_REQUIRED', 'Choose the actual measured terrain support in this room, never a gap, object or second floor inferred from XY.')
  const grid = navigationGrid(state, 'player', getMapSpec(surface.mapId, state).geometry, { ignoreActorEffects: true, ignoreDoorKnowledge: true })
  if (new Set(input.cells.map(cell => witness(cell))).size !== input.cells.length
    || input.cells.some(cell => !surface.cells.some(c => sameDesecratedCell(c, cell)) || !grid.free(cell, false)))
    toolkitError('DESECRATED_GROUND_FOOTPRINT_REQUIRED', 'Choose distinct actual accessible terrain cells on this exact measured support.')
  const fact = state.worldFacts?.find(value => value.id === input.factId)
  if (!fact?.narrativeEffect || fact.source !== 'record_scene_fact' || fact.expires !== 'never' || fact.mapId !== surface.mapId
    || fact.roomId !== surface.roomId || !input.cells.some(cell => sameDesecratedCell(cell, fact.narrativeEffect!.cell)))
    toolkitError('DESECRATED_GROUND_FACT_REQUIRED', 'Qualify real magical desecration with an existing durable public scene fact on one of the exact cells.')
  if (Object.values(ledger?.zones ?? {}).some(zone => zone.mapId === surface.mapId && zone.elevationFeet === surface.elevationFeet
    && zone.input.cells.some(cell => input.cells.some(c => sameDesecratedCell(c, cell)))))
    toolkitError('DESECRATED_GROUND_ALREADY_RECORDED', 'An original cell, including one later purified, cannot be profaned again by repeating its qualification.')
  const qualification = { input, mapId: surface.mapId, roomId: surface.roomId, elevationFeet: surface.elevationFeet,
    surfaceWitness: witness(surface), factWitness: witness(fact), at: now() }
  const zone = { ...qualification, command: witness(qualification) }
  data().zones[input.zoneId] = zone
  return { success: true, zone, source: DESECRATED_GROUND_SOURCE }
}

export function purifyDesecratedGround(raw: unknown) {
  const input = PurifyDesecratedGroundSchema.parse(raw), state = gs.getState()
  const ledger = desecratedGroundStateOf(state), old = ledger?.purifications[input.eventId]
  if (old) {
    if (witness(old.input) !== witness(input)) toolkitError('DESECRATED_GROUND_EVENT_CONFLICT', 'Retain the exact original flask and square.')
    return { success: true, purifiedCells: old.cells, consumedItemId: input.itemId,
      seconds: input.cost.kind === 'measured_interval' ? input.cost.seconds : 0,
      actionSpent: input.cost.kind === 'action', replayed: true, source: DESECRATED_GROUND_SOURCE }
  }
  available()
  rules.validateActionUse('player')
  if (Object.keys(ledger?.purifications ?? {}).length >= 256) toolkitError('DESECRATED_GROUND_HISTORY_LIMIT', 'The retained actual purification receipts are full.')
  const item = state.player.inventory.find(value => value.id === input.itemId)
  if (!item || !isHolyWater(item) || (item.quantity ?? 1) !== 1)
    toolkitError('DESECRATED_GROUND_FLASK_REQUIRED', 'Choose one exact actually owned holy water flask, not an empty vial, ordinary water or an ambiguous stack.')
  if (Object.values(ledger?.purifications ?? {}).some(p => p.input.itemId === item.id))
    toolkitError('DESECRATED_GROUND_FLASK_ALREADY_SPENT', 'The actual holy-water flask of the original purification cannot be spent again.')
  const loadout = currentLoadout()
  if (freeHands() < 1 && ![loadout.mainHandId, loadout.offHandId].includes(item.id))
    toolkitError('DESECRATED_GROUND_HAND_REQUIRED', 'Use a genuinely free hand or this exact actually held flask.')
  const surface = actualDesecrationSurface(state, input.surfaceId), cells = purificationFootprint(input.originCell)
  if (!surface || surface.mapId !== state.currentMapId || surface.roomId !== state.currentRoomId
    || entityGroundContact(state, 'player', state.player.position, surface.elevationFeet).contact !== true
    || cells.some(cell => !surface.cells.some(c => sameDesecratedCell(c, cell))))
    toolkitError('DESECRATED_GROUND_SQUARE_REQUIRED', 'The whole chosen 10-foot square requires this exact reachable measured terrain support at the player’s actual ground level.')
  const grid = navigationGrid(state, 'player', getMapSpec(surface.mapId, state).geometry, { ignoreActorEffects: true, ignoreDoorKnowledge: true })
  for (const cell of cells) {
    if (inferRoomIdOnMap(cell, surface.mapId, state) !== surface.roomId || !grid.free(cell, false))
      toolkitError('DESECRATED_GROUND_SQUARE_REQUIRED', 'A gap, wall or absent terrain cell cannot complete the actual square.')
    assertToolkitReach({ mapId: surface.mapId, roomId: surface.roomId, cell, surfaceZFeet: surface.elevationFeet })
  }
  for (const [a, b] of [[0, 1], [0, 2], [1, 3], [2, 3]]) {
    if (!grid.step(cells[a], cells[b], false, false)) toolkitError('DESECRATED_GROUND_SQUARE_BLOCKED', 'Sprinkling cannot cross an actual separating wall or closed door inside the square.')
  }
  const active = currentDesecratedCells(state, surface.mapId)
  const purified = cells.filter(cell => active.some(part => part.zone.input.surfaceId === surface.surfaceId && sameDesecratedCell(part.cell, cell)))
  if (!purified.length) toolkitError('DESECRATED_GROUND_ALREADY_CLEAR', 'This exact footprint contains no remaining qualified desecrated ground.')
  if ((state.phase === 'combat') !== (input.cost.kind === 'action'))
    toolkitError('DESECRATED_GROUND_COST_REQUIRED', 'Use one actual action in combat or choose the actual measured positive application interval outside combat.')
  const from = now(), seconds = input.cost.kind === 'measured_interval' ? input.cost.seconds : 0
  if (seconds && activeAfflictions('player', 'poison').some(a => !a.petrificationPause && a.nextAt !== undefined && a.nextAt < from + seconds))
    toolkitError('DESECRATED_GROUND_AFFLICTION_BOUNDARY', 'Stop and resolve the actual poison event before completing application through its interruption.')
  preflightGroundGearWork('player', seconds)
  if (input.cost.kind === 'measured_interval') {
    preflightRestStrenuousInterval(true)
    advanceHeroTime(seconds)
    recordRestMeasuredActivityInterval({ eventId: `desecration:${input.eventId}`, from, to: now(), activity: 'light', reason: input.cost.reason })
  } else rules.recordAction('player')
  const flaskWitness = witness(item)
  gs.consumePlayerItem(candidate => candidate.id === item.id)
  afterInventoryChange()
  const application = { input, at: now(), mapId: surface.mapId, cells: purified, flaskWitness }
  data().purifications[input.eventId] = { ...application, command: witness(application) }
  return { success: true, purifiedCells: purified, consumedItemId: item.id, seconds, actionSpent: !seconds, source: DESECRATED_GROUND_SOURCE }
}

export function detectDesecratedGround(state: GameState) {
  const nowSeconds = state.worldTimeSeconds ?? 0
  const group = state.hero?.effects.find(e => e.id === state.hero?.concentrationIds.player && e.concentration
    && e.kind === 'concentration:detect-evil-and-good' && e.sourceId === 'player' && e.expiresAt > nowSeconds)
  const effect = state.hero?.effects.find(e => e.sourceId === 'player' && e.kind === 'detect-evil-and-good' && e.expiresAt > nowSeconds
    && e.data.desecratedGroundDetection === DESECRATION_DETECTION_MARKER && e.data.groupId === group?.id && e.expiresAt === group?.expiresAt)
  if (!effect || !state.currentMapId) return { active: false as const, source: DETECT_DESECRATION_SOURCE }
  const vertical = entityVerticalContext(state, 'player'), from = state.player.position
  if (swallowedBy(state, 'player') || !vertical.known || vertical.airborne) {
    return { active: true as const, presence: 'unresolved', expiresAt: effect.expiresAt, source: DETECT_DESECRATION_SOURCE }
  }
  const candidates = currentDesecratedCells(state, state.currentMapId).filter(({ cell }) => distance(from, cell) * 5 <= 30)
  const canRead = (part: typeof candidates[number]) => vertical.zFeet === part.zone.elevationFeet && lightingRay(state, from, part.cell)
  const presence = candidates.some(canRead) ? 'detected' : candidates.length ? 'unresolved' : 'none_detected'
  return { active: true as const, presence, expiresAt: effect.expiresAt, source: DETECT_DESECRATION_SOURCE }
}

function retainedFlask(text: string, itemId: string) {
  try {
    const item = JSON.parse(text) as Item | null
    return item?.id === itemId && isHolyWater(item) && (item.quantity ?? 1) === 1
  } catch { return false }
}

function retainedQualificationFact(state: GameState, zone: DesecratedGroundZone) {
  const live = state.worldFacts?.find(fact => fact.id === zone.input.factId)
  if (live) return witness(live) === zone.factWitness ? live : undefined
  try { return JSON.parse(zone.factWitness) as WorldFact | undefined } catch { return undefined }
}

export function validateDesecratedGroundHistory(state: GameState) {
  const ledger = desecratedGroundStateOf(state)
  if (!ledger) return []
  const issues: string[] = [], time = state.worldTimeSeconds ?? 0, area = new Set<string>()
  if (Object.keys(ledger.zones).length > 64 || Object.keys(ledger.purifications).length > 256)
    issues.push('Keep the bounded source zone and purification receipts.')
  for (const [id, zone] of Object.entries(ledger.zones)) {
    const { command, ...qualification } = zone
    const surface = actualDesecrationSurface(state, zone.input.surfaceId), fact = retainedQualificationFact(state, zone)
    if (command !== witness(qualification) || id !== zone.input.zoneId || zone.at > time || !surface || surface.mapId !== zone.mapId || surface.roomId !== zone.roomId
      || surface.elevationFeet !== zone.elevationFeet || witness(surface) !== zone.surfaceWitness
      || !fact?.narrativeEffect?.cell || fact.id !== zone.input.factId || fact.mapId !== zone.mapId || fact.roomId !== zone.roomId
      || fact.source !== 'record_scene_fact' || fact.expires !== 'never' || witness(fact) !== zone.factWitness
      || !zone.input.cells.some(c => sameDesecratedCell(c, fact.narrativeEffect!.cell)))
      issues.push('Keep the original measured terrain and durable public desecration source.')
    for (const cell of zone.input.cells) {
      const key = JSON.stringify([zone.mapId, zone.elevationFeet, cell.x, cell.y])
      if (area.has(key) || !surface?.cells.some(c => sameDesecratedCell(c, cell)))
        issues.push('Desecrated cells must retain one actual source without duplication.')
      area.add(key)
    }
  }
  const cleared = new Set<string>(), items = new Set<string>()
  for (const [id, p] of Object.entries(ledger.purifications)) {
    const { command, ...application } = p
    const square = purificationFootprint(p.input.originCell), surface = actualDesecrationSurface(state, p.input.surfaceId)
    if (command !== witness(application) || !retainedFlask(p.flaskWitness, p.input.itemId)
      || id !== p.input.eventId || p.at > time || surface?.mapId !== p.mapId || !square.every(cell => surface.cells.some(c => sameDesecratedCell(c, cell)))
      || items.has(p.input.itemId) || state.player.inventory.some(item => item.id === p.input.itemId && isHolyWater(item))
      || isHolyWater(state.droppedItems?.[p.input.itemId]?.item))
      issues.push('Purification retains its original actual terrain square, time and unique spent flask.')
    items.add(p.input.itemId)
    for (const cell of p.cells) {
      const key = JSON.stringify([p.mapId, p.input.surfaceId, cell.x, cell.y])
      if (cleared.has(key) || !square.some(c => sameDesecratedCell(c, cell))
        || !Object.values(ledger.zones).some(zone => zone.at <= p.at && zone.mapId === p.mapId && zone.input.surfaceId === p.input.surfaceId
          && zone.input.cells.some(c => sameDesecratedCell(c, cell)))) issues.push('Only actual prior desecrated cells inside the square can be purified once.')
      cleared.add(key)
    }
  }
  return issues
}
