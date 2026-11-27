import { z } from 'zod'
import type { GameState, MonsterState } from './types'
import { activeVerticalSurface, entityGroundContact } from './jumping-state'
import { groundGearPhysicalWitness as witness } from './ground-gear-recovery-state'

const Id = z.string().min(1).max(180).refine(value => !['constructor', 'prototype', '__proto__'].includes(value))
const Source = z.string().trim().min(1).max(1000)
const Time = z.number().finite().nonnegative()
const Cell = z.object({ x: z.number().int().nonnegative(), y: z.number().int().nonnegative() }).strict()
type Cell = z.infer<typeof Cell>
export const DESECRATED_GROUND_SOURCE = 'DMG2014 Desecrated Ground, rules/books/dmg-2014.md:4328–4334'
export const DETECT_DESECRATION_SOURCE = 'PHB2014 Detect Evil and Good, rules/books/phb-2014.md:9247–9257'
export const DESECRATION_DETECTION_MARKER = 'actual_desecrated_ground_presence'

export const RecordDesecratedGroundSchema = z.object({
  zoneId: Id, surfaceId: Id, cells: z.array(Cell).min(1).max(256), factId: Id,
  actualMagicalDesecrationConfirmed: z.literal(true),
}).strict()

export const PurifyDesecratedGroundSchema = z.object({
  eventId: Id, surfaceId: Id, originCell: Cell, itemId: Id,
  cost: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('action') }).strict(),
    z.object({ kind: z.literal('measured_interval'), seconds: z.number().int().positive().max(3600), reason: Source }).strict(),
  ]),
}).strict()

const Zone = z.object({
  input: RecordDesecratedGroundSchema, mapId: Id, roomId: Id, elevationFeet: z.number().finite(),
  surfaceWitness: z.string().min(1), factWitness: z.string().min(1), at: Time, command: z.string().min(1),
}).strict()
const Purification = z.object({
  input: PurifyDesecratedGroundSchema, at: Time, mapId: Id, cells: z.array(Cell).min(1).max(4),
  flaskWitness: z.string().min(1), command: z.string().min(1),
}).strict()

export const DesecratedGroundStateSchema = z.object({
  version: z.literal(1), zones: z.record(z.string(), Zone), purifications: z.record(z.string(), Purification),
}).strict()

export type DesecratedGroundZone = z.infer<typeof Zone>
export type GroundPurification = z.infer<typeof Purification>
export const desecratedGroundStateOf = (state: GameState) => state.dmTools?.desecratedGround
export const sameDesecratedCell = (a: Cell, b: Cell) => a.x === b.x && a.y === b.y
export const purificationFootprint = (origin: Cell) => [
  { ...origin }, { x: origin.x + 1, y: origin.y }, { x: origin.x, y: origin.y + 1 }, { x: origin.x + 1, y: origin.y + 1 },
]

export function actualDesecrationSurface(state: GameState, id: string) {
  const surface = state.dmTools?.jumping?.surfaces[id]
  return surface?.kind === 'support' && !surface.objectId && activeVerticalSurface(state, id) ? surface : undefined
}

export function currentDesecratedCells(state: GameState, mapId: string) {
  const ledger = desecratedGroundStateOf(state)
  if (!ledger) return []
  const purified = new Set(Object.values(ledger.purifications).filter(p => p.mapId === mapId)
    .flatMap(p => p.cells.map(cell => JSON.stringify([p.input.surfaceId, cell.x, cell.y]))))
  return Object.values(ledger.zones).filter(zone => zone.mapId === mapId).flatMap(zone => {
    const surface = actualDesecrationSurface(state, zone.input.surfaceId)
    if (!surface || witness(surface) !== zone.surfaceWitness) return []
    return zone.input.cells.filter(cell => !purified.has(JSON.stringify([zone.input.surfaceId, cell.x, cell.y])))
      .map(cell => ({ cell, zone }))
  })
}

export function desecratedGroundContact(state: GameState, body: MonsterState) {
  if (!state.currentMapId || !body.isAlive) return false
  return currentDesecratedCells(state, state.currentMapId).some(({ cell, zone }) => {
    if (!sameDesecratedCell(cell, body.position)) return false
    const contact = entityGroundContact(state, body.id, cell, zone.elevationFeet)
    return contact.contact === true && (contact.context.surfaceId === zone.input.surfaceId
      || contact.context.source === 'legacy_flat_map_plane' && zone.elevationFeet === 0)
  })
}
