import { z } from 'zod'
import type { GameState, WorldFact } from './types'
import type { GridCell } from './adventure-map'
import { actualSurfaceAt, entityGroundContact, entityVerticalContext } from './jumping-state'
import { groundGearPhysicalWitness as witness } from './ground-gear-recovery-state'
import { SHOVE_ASIDE_SOURCE, shoveAsideWitness } from './dmg-shove-aside-state'

const Id = z.string().min(1).max(180).refine(id => !['constructor', 'prototype', '__proto__'].includes(id))
const Cell = z.object({ x: z.number().int().nonnegative(), y: z.number().int().nonnegative() }).strict()
export const SLIPPERY_ICE_SOURCE = 'DMG2014 Slippery Ice, rules/books/dmg-2014.md:4352–4354'
export const SLIPPERY_ICE_CHECK = 'slippery-ice-entry-check'
export const SLIPPERY_ICE_LABEL = 'DMG Slippery Ice: Dexterity (Acrobatics)'
export const RecordSlipperyIceSchema = z.object({
  zoneId: Id, surfaceId: Id, cells: z.array(Cell).min(1).max(256), factId: Id,
  actualSlipperyIceConfirmed: z.literal(true),
}).strict()
const Zone = z.object({
  input: RecordSlipperyIceSchema, mapId: Id, roomId: Id, elevationFeet: z.number().finite(),
  surfaceWitness: z.string().min(1), factWitness: z.string().min(1), at: z.number().finite().nonnegative(),
}).strict()
export const SlipperyIceStateSchema = z.object({
  version: z.literal(1), zones: z.record(z.string(), Zone),
}).strict()
export const SlipperyIceEntrySchema = z.object({ zoneId: Id, heldCheckWitness: z.string().min(1).optional(),
  shoveAside: z.object({ attemptId: Id, resultWitness: z.string().min(1) }).strict().optional(),
}).strict()

/** Internal source witness, not a public movement permission. A projection may
 * precede the attempt ID; an actual recorded entry must prove its paid source. */
export function validShoveAsideIceStep(state: GameState, entityId: string, to: GridCell,
  from: { entityId: string; mapId: string; fromCell: GridCell; slipperyIceShoveAside?: true; shoveAsideId?: string }, completed = false) {
  if (!from.slipperyIceShoveAside || from.entityId !== entityId || entityId === 'player'
    || !completed && from.mapId !== state.currentMapId || Math.abs(from.fromCell.x - to.x) + Math.abs(from.fromCell.y - to.y) !== 1) return false
  const attempt = from.shoveAsideId ? state.dmTools?.shoveAside?.attempts[from.shoveAsideId] : undefined
  if (!attempt || attempt.source !== SHOVE_ASIDE_SOURCE || attempt.input.targetId !== entityId
    || !sameIceCell(attempt.input.toCell, to) || attempt.status !== (completed ? 'resolved' : 'rolling')) return false
  try {
    const context = JSON.parse(attempt.contextWitness)
    return context.phase === 'combat' && context.current === 'player' && context.map === from.mapId
      && context.target?.id === entityId && sameIceCell(context.target.position, from.fromCell)
      && (completed || context.generation === (state.combatGeneration ?? 0) && context.turn === (state.turnCounter ?? 0)
        && context.at === (state.worldTimeSeconds ?? 0) && state.currentTurn === 'player')
  } catch { return false }
}

export const sameIceCell = (a: GridCell, b: GridCell) => a.x === b.x && a.y === b.y
export const slipperyIceZones = (state: GameState) => Object.values(state.dmTools?.slipperyIce?.zones ?? {})

export function slipperyIceAtBody(state: GameState, entityId: string, cell: GridCell) {
  for (const zone of slipperyIceZones(state)) {
    if (zone.mapId !== state.currentMapId || !zone.input.cells.some(value => sameIceCell(cell, value))) continue
    const { contact, context } = entityGroundContact(state, entityId, cell, zone.elevationFeet)
    if (contact === null) return { unknown: true } as const
    if (contact && actualSurfaceAt(state, cell, zone.elevationFeet).filter(surface => surface.kind === 'support').length !== 1)
      return { unknown: true } as const
    if (contact && (context.surfaceId === zone.input.surfaceId || context.source === 'legacy_flat_map_plane'))
      return { zone } as const
  }
  return undefined
}

/** Match the same actual destination support selected by the walking projection.
 * Airborne and unresolved projections never acquire a ground terrain surcharge. */
export function slipperyIceWalkingCost(state: GameState, entityId: string, cell: GridCell) {
  const zones = slipperyIceZones(state).filter(zone => zone.mapId === state.currentMapId
    && zone.input.cells.some(value => sameIceCell(cell, value)))
  if (!zones.length) return false
  const height = entityVerticalContext(state, entityId)
  if (!height.known || height.airborne) return false
  const support = actualSurfaceAt(state, cell, height.zFeet!).find(surface => surface.kind === 'support')
  return zones.some(zone => support?.surfaceId === zone.input.surfaceId)
}

function historicalIceFact(state: GameState, factId: string, evidence: string) {
  const live = state.worldFacts?.find(value => value.id === factId)
  if (live) return witness(live) === evidence ? live : undefined
  try { return JSON.parse(evidence) as WorldFact | undefined } catch { return undefined }
}

export function validateSlipperyIceState(state: GameState) {
  const ledger = state.dmTools?.slipperyIce
  const issues: string[] = [], terrainKeys = new Set<string>()
  if (ledger && (!SlipperyIceStateSchema.safeParse(ledger).success || Object.keys(ledger.zones).length > 64))
    return ['Invalid retained slippery-ice zone schema or source capacity.']
  for (const [id, zone] of Object.entries(ledger?.zones ?? {})) {
    const surface = state.dmTools?.jumping?.surfaces[zone.input.surfaceId]
    const fact = historicalIceFact(state, zone.input.factId, zone.factWitness)
    if (id !== zone.input.zoneId || zone.at > (state.worldTimeSeconds ?? 0)
      || !surface || surface.kind !== 'support' || surface.objectId || surface.at > zone.at
      || surface.mapId !== zone.mapId || surface.roomId !== zone.roomId || surface.elevationFeet !== zone.elevationFeet
      || witness(surface) !== zone.surfaceWitness
      || !fact?.narrativeEffect?.cell || fact.id !== zone.input.factId || fact.source !== 'record_scene_fact' || fact.expires !== 'never'
      || fact.mapId !== zone.mapId || fact.roomId !== zone.roomId || witness(fact) !== zone.factWitness
      || !zone.input.cells.some(cell => sameIceCell(cell, fact.narrativeEffect!.cell)))
      issues.push('An ice zone requires its original durable public scene fact and exact measured terrain support.')
    for (const cell of zone.input.cells) {
      const key = JSON.stringify([zone.mapId, zone.elevationFeet, cell.x, cell.y])
      if (terrainKeys.has(key) || !surface?.cells.some(value => sameIceCell(cell, value)))
        issues.push('Each qualified ice cell must be distinct at its measured map level and on its source support.')
      terrainKeys.add(key)
    }
  }
  const entries = new Set<string>()
  let heldEntryId: string | undefined
  for (const contact of Object.values(state.dmTools?.groundGear?.contacts ?? {})) {
    if (!contact.slipperyIceEntry) continue
    const zone = ledger?.zones[contact.slipperyIceEntry.zoneId]
    const from = contact.stepWitness
    const turn = contact.turnKey.split(':').map(Number)
    const key = JSON.stringify([contact.entityId, contact.turnKey])
    const forced = contact.kind === 'forced'
    const aside = contact.slipperyIceEntry.shoveAside
    const attempt = aside ? state.dmTools?.shoveAside?.attempts[aside.attemptId] : undefined
    let sourceContext: { generation?: number; turn?: number; at?: number } | undefined
    try { if (attempt) sourceContext = JSON.parse(attempt.contextWitness) } catch { /* Refuse below. */ }
    if (forced && (!from || !validShoveAsideIceStep(state, contact.entityId, contact.cell, from, true)
      || !aside || aside.attemptId !== from.shoveAsideId || !attempt?.result || attempt.result.success !== true
      || attempt.result.action !== 'shove' || attempt.result.shove !== 'aside'
      || attempt.result.slipperyIceContactId !== contact.id || !Cell.safeParse(attempt.result.position).success
      || !sameIceCell(attempt.result.position as GridCell, contact.cell)
      || attempt.resultWitness !== aside.resultWitness || aside.resultWitness !== shoveAsideWitness(attempt.result)
      || contact.turnKey !== `${sourceContext?.generation}:${sourceContext?.turn}` || contact.at !== sourceContext?.at
      || contact.status !== 'resolved' && state.currentTurn !== 'player'
      || contact.continuation || from.slipperyIceWalk))
      issues.push('A forced ice entry retains its exact successful paid Shove Aside, original from/to, source result and actual turn, with no walking continuation.')
    if (!forced && (aside || from?.shoveAsideId || from?.slipperyIceShoveAside))
      issues.push('An ordinary ice walk cannot acquire forced Shove Aside provenance.')
    if (entries.has(key) || !zone || zone.mapId !== contact.mapId || zone.at > contact.at
      || !zone.input.cells.some(cell => sameIceCell(cell, contact.cell))
      || !from || !(forced ? from.slipperyIceShoveAside : from.slipperyIceWalk) || from.entityId !== contact.entityId || from.mapId !== contact.mapId
      || from.fromZFeet !== zone.elevationFeet || Math.max(Math.abs(from.fromCell.x - contact.cell.x), Math.abs(from.fromCell.y - contact.cell.y)) !== 1
      || !/^\d+:\d+$/.test(contact.turnKey) || turn[0] < 1 || turn[0] > (state.combatGeneration ?? 0)
      || turn[0] === (state.combatGeneration ?? 0) && turn[1] > (state.turnCounter ?? 0)
      || (contact.status === 'resolved' ? contact.cursor !== 1 || contact.results.length !== 1 || !contact.finalResult
        : contact.cursor !== 0 || contact.results.length !== 0))
      issues.push('An ice receipt needs a single check for the same actual supported step, actor and initiative turn.')
    if (contact.continuation) {
      const command = contact.continuation
      const path = (command.iceWalk as { retainedPath?: GridCell[] } | undefined)?.retainedPath
      if (command.type !== 'movement' || command.actorId !== contact.entityId || command.movementMode !== 'walk'
        || command.reactionMovement || command.transport || !Array.isArray(path) || !path.length
        || !Cell.safeParse(path[0]).success || !sameIceCell(path[0], contact.cell) || path.some((cell, index) => !Cell.safeParse(cell).success
          || index > 0 && Math.max(Math.abs(cell.x - path[index - 1].x), Math.abs(cell.y - path[index - 1].y)) !== 1))
        issues.push('An ice continuation needs the remaining original walking route beginning at the paid entry cell.')
    }
    entries.add(key)
    if (contact.status !== 'resolved' && (state.phase !== 'combat' || !state.initiativeOrder.includes(contact.entityId)
      || contact.turnKey !== `${state.combatGeneration ?? 0}:${state.turnCounter ?? 0}`
      || !zone || slipperyIceAtBody(state, contact.entityId, contact.cell)?.zone?.input.zoneId !== zone.input.zoneId))
      issues.push('Unfinished ice entry must keep its actual body, support and active initiative turn.')
    if (contact.status === 'resolving') {
      if (heldEntryId) issues.push('Only one retained check can await the original reaction window.')
      heldEntryId = contact.id
    }
  }
  const pending = state.hero?.pending
  const resolution = pending?.command.toolkitResolution as { domain?: string; command?: { contactId?: string } } | undefined
  if (heldEntryId || resolution?.domain === SLIPPERY_ICE_CHECK) {
    const check = pending?.command.result as { ability?: string; dc?: number; entityId?: string; label?: string } | undefined
    const contact = heldEntryId ? state.dmTools?.groundGear?.contacts[heldEntryId] : undefined
    if (!contact || resolution?.domain !== SLIPPERY_ICE_CHECK || resolution.command?.contactId !== contact.id
      || pending?.command.type !== 'check' || check?.ability !== 'dex' || check.dc !== 10
      || check.label !== SLIPPERY_ICE_LABEL || check.entityId !== contact.entityId
      || contact.slipperyIceEntry?.heldCheckWitness !== witness(pending))
      issues.push('Retain the original actual DC 10 Dexterity (Acrobatics) check through the matching reaction window.')
  }
  return issues
}
