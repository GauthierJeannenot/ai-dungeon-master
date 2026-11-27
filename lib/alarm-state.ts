import { z } from 'zod'
import { getAdventureMap, inferRoomIdOnMap, resolveRoomMapId, type GridCell } from './adventure-map'
import type { GameState } from './types'

const id = z.string().min(1).max(160).refine(value => !['constructor', '__proto__', 'prototype'].includes(value), 'Reserved identifier.')
const time = z.number().finite().nonnegative()
const count = z.number().int().nonnegative().safe()
const cell = z.object({ x: z.number().int().nonnegative(), y: z.number().int().nonnegative() }).strict()
export const ALARM_DURATION_SECONDS = 8 * 60 * 60
const selectionFields = {
  mode: z.literal('mental'),
  exemptCreatureIds: z.array(id).max(128),
}
export const AlarmWardSelectionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('door'), doorId: id, ...selectionFields }).strict(),
  z.object({ kind: z.literal('ground_cube'), cell, ...selectionFields }).strict(),
]).refine(v => new Set(v.exemptCreatureIds).size === v.exemptCreatureIds.length, 'Choose each exempt creature once.')
export type AlarmWardSelection = z.infer<typeof AlarmWardSelectionSchema>

const side = z.object({ roomId: id, cell }).strict()
const AlarmDoorWitnessSchema = z.object({ kind: z.literal('door'), mapId: id, doorId: id, sides: z.tuple([side, side]) }).strict()
export type AlarmDoorWitness = z.infer<typeof AlarmDoorWitnessSchema>
const AlarmCubeWitnessSchema = z.object({ kind: z.literal('ground_cube'), mapId: id, cell, baseZFeet: z.literal(0), sideFeet: z.literal(5) }).strict()
export const AlarmPlacementSchema = z.discriminatedUnion('kind', [AlarmDoorWitnessSchema, AlarmCubeWitnessSchema])
export type AlarmPlacement = z.infer<typeof AlarmPlacementSchema>

const ping = z.object({ number: count, at: time, awakened: z.boolean() }).strict()
const ward = z.object({
  castingId: id, selection: AlarmWardSelectionSchema, placement: AlarmPlacementSchema, startedAt: time, expiresAt: time,
}).strict()
export type AlarmWard = z.infer<typeof ward>
export const AlarmSpellStateSchema = z.object({
  version: z.literal(1), wards: z.record(z.string(), ward), pingCount: count, latestPing: ping.optional(),
}).strict()
export type AlarmSpellState = z.infer<typeof AlarmSpellStateSchema>

export const alarmStateOf = (state: Pick<GameState, 'dmTools'>) => state.dmTools?.alarmSpell
export const alarmPingCount = (state: Pick<GameState, 'dmTools'>) => alarmStateOf(state)?.pingCount ?? 0
export const sameAlarmCell = (a: GridCell, b: GridCell) => a.x === b.x && a.y === b.y

export function alarmPingsSince(state: GameState, previous: number) {
  const ledger = alarmStateOf(state)
  return ledger?.latestPing && ledger.pingCount > previous
    ? { mentalAlarm: { received: ledger.pingCount - previous, latestPing: { ...ledger.latestPing } } }
    : {}
}

export function actualAlarmDoor(state: GameState, mapId: string, doorId: string): AlarmDoorWitness | undefined {
  const door = getAdventureMap(state).doors?.find(d => d.id === doorId)
  if (!door || door.opening || door.sides.length !== 2) return
  const [a, b] = door.sides
  if (resolveRoomMapId(a.roomId, state) !== mapId || resolveRoomMapId(b.roomId, state) !== mapId) return
  if (a.roomId === b.roomId || Math.abs(a.cell.x - b.cell.x) + Math.abs(a.cell.y - b.cell.y) !== 1) return
  return { kind: 'door', mapId, doorId, sides: [{ roomId: a.roomId, cell: { ...a.cell } }, { roomId: b.roomId, cell: { ...b.cell } }] }
}

function sameAlarmDoor(a: AlarmDoorWitness, b: AlarmDoorWitness) {
  return a.mapId === b.mapId && a.doorId === b.doorId && a.sides.every((side, i) =>
    side.roomId === b.sides[i].roomId && sameAlarmCell(side.cell, b.sides[i].cell))
}

export function actualAlarmPlacement(state: GameState, mapId: string, selection: AlarmWardSelection): AlarmPlacement | undefined {
  if (selection.kind === 'door') return actualAlarmDoor(state, mapId, selection.doorId)
  const map = getAdventureMap(state).maps.find(m => m.id === mapId), at = selection.cell
  if (!map || at.x >= map.grid.cols || at.y >= map.grid.rows || !inferRoomIdOnMap(at, mapId, state)) return
  return { kind: 'ground_cube', mapId, cell: { ...at }, baseZFeet: 0, sideFeet: 5 }
}

export function sameAlarmPlacement(a: AlarmPlacement, b: AlarmPlacement) {
  if (a.kind === 'door' && b.kind === 'door') return sameAlarmDoor(a, b)
  return a.kind === 'ground_cube' && b.kind === 'ground_cube' && a.mapId === b.mapId && sameAlarmCell(a.cell, b.cell)
}

export function activeAlarmWards(state: GameState) {
  const active = new Map<string, AlarmWard>()
  for (const ward of Object.values(alarmStateOf(state)?.wards ?? {})) {
    if (ward.expiresAt <= (state.worldTimeSeconds ?? 0)) continue
    const p = ward.placement
    const key = JSON.stringify(p.kind === 'door' ? [p.mapId, p.kind, p.doorId] : [p.mapId, p.kind, p.cell.x, p.cell.y])
    const previous = active.get(key)
    if (!previous || previous.startedAt < ward.startedAt) active.set(key, ward)
  }
  return [...active.values()]
}

// The spell ledger stores only the caster's chosen wards and received pings.
export function alarmRecipientView(state: GameState) {
  const ledger = alarmStateOf(state)
  return {
    activeWards: activeAlarmWards(state).map(({ castingId, selection, placement, startedAt, expiresAt }) =>
      ({ castingId, selection: structuredClone(selection), placement: structuredClone(placement), startedAt, expiresAt })),
    pingCount: ledger?.pingCount ?? 0,
    latestPing: ledger?.latestPing ? { ...ledger.latestPing } : null,
  }
}

export function validateAlarmSpellState(state: GameState): string[] {
  const ledger = alarmStateOf(state), casts = state.dmTools?.casting?.records ?? {}
  for (const cast of Object.values(casts)) {
    if (cast.spellId !== 'alarm' || cast.input.alarmWard === undefined || (cast.status !== 'active' && cast.status !== 'ready')) continue
    const selected = AlarmWardSelectionSchema.safeParse(cast.input.alarmWard)
    const retained = AlarmPlacementSchema.safeParse(cast.input.alarmPlacementWitness)
    const actual = selected.success ? actualAlarmPlacement(state, cast.mapId, selected.data) : undefined
    if (!actual || !retained.success || !sameAlarmPlacement(actual, retained.data)) return ['Retain the actual original Alarm placement during incantation.']
  }
  const completed = Object.values(casts).filter(c => c.spellId === 'alarm' && c.status === 'completed' && c.input.alarmWard !== undefined)
  if (completed.some(c => !ledger?.wards[c.id])) return ['Retain the ward of each actual completed door Alarm cast.']
  if (!ledger) return []
  if (!AlarmSpellStateSchema.safeParse(ledger).success) return ['Invalid actual door Alarm ledger.']
  if (Object.keys(ledger.wards).length > 128) return ['Retain only the bounded original Alarm casting records.']
  const now = state.worldTimeSeconds ?? 0
  const issues: string[] = []
  for (const [key, ward] of Object.entries(ledger.wards)) {
    const cast = casts[key], source = AlarmWardSelectionSchema.safeParse(cast?.input.alarmWard)
    const original = AlarmPlacementSchema.safeParse(cast?.input.alarmPlacementWitness)
    const current = actualAlarmPlacement(state, ward.placement.mapId, ward.selection)
    if (key !== ward.castingId || cast?.spellId !== 'alarm' || cast.status !== 'completed' || cast.completedAt !== ward.startedAt
      || ward.startedAt > now || ward.expiresAt !== ward.startedAt + ALARM_DURATION_SECONDS || !source.success
      || JSON.stringify(source.data) !== JSON.stringify(AlarmWardSelectionSchema.parse(ward.selection))
      || !original.success || !sameAlarmPlacement(original.data, ward.placement) || !current || !sameAlarmPlacement(current, ward.placement)
      || cast.mapId !== ward.placement.mapId || (cast.result as { alarmId?: string } | undefined)?.alarmId !== key) {
      issues.push('A ward must retain its exact completed cast, actual placement, original exemptions and eight-hour duration.')
    }
  }
  const latest = ledger.latestPing
  if (Boolean(latest) !== (ledger.pingCount > 0) || (latest && (latest.number !== ledger.pingCount || latest.at > now
    || !Object.values(ledger.wards).some(w => w.startedAt <= latest.at && latest.at < w.expiresAt)))) {
    issues.push('Retain the actual delivered mental ping counter and latest observation within an original ward duration.')
  }
  return issues
}
