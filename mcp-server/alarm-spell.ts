import type { GridCell } from '../lib/adventure-map'
import { AlarmWardSelectionSchema, AlarmPlacementSchema, ALARM_DURATION_SECONDS, activeAlarmWards, actualAlarmPlacement,
  alarmRecipientView, sameAlarmCell, sameAlarmPlacement, type AlarmPlacement, type AlarmWard } from '../lib/alarm-state'
import { actualSurfaceAt, entityVerticalContext } from '../lib/jumping-state'
import { navigationGrid } from '../lib/navigation'
import { swallowedBy } from '../lib/swallow-state'
import type { GroundGearMovementKind, GroundGearStepWitness } from './ground-gear-contacts'
import type { HeroSpellInput } from './hero-spells'
import { getDoor, getDoorState } from './doors'
import { visibleCell } from './monster-perception'
import { engineGeometry } from './navigation'
import { wakeNaturalSleeper } from './sleep'
import { toolkitError, toolkitState } from './toolkit'
import * as gs from './game-state'

function supportedGroundBody(id: string) {
  const state = gs.getState(), body = gs.getPhysicalCreature(id), vertical = entityVerticalContext(state, id)
  return Boolean(body && (id === 'player' ? !state.player.deathSaves?.dead : 'isAlive' in body && body.isAlive)
    && vertical.known && vertical.zFeet === 0 && vertical.supportZFeet === 0 && !vertical.airborne && !swallowedBy(state, id))
}

function supportedFloor(cell: GridCell) {
  return actualSurfaceAt(gs.getState(), cell).every(surface => surface.kind !== 'gap' && surface.elevationFeet === 0)
}

function supportedPlacementFloor(placement: AlarmPlacement) {
  return placement.kind === 'door' ? placement.sides.every(side => supportedFloor(side.cell)) : supportedFloor(placement.cell)
}

export function planAlarmSpell(input: HeroSpellInput, spellId: string, casterId: string, completing: boolean) {
  if (spellId !== 'alarm') {
    if (input.alarmWard !== undefined) toolkitError('ALARM_ARGUMENT_NOT_APPLICABLE', 'A door Alarm selection belongs only to Alarm.')
    return
  }
  if (casterId !== 'player' || input.magicItemId || input.scrollItemId || input.readiedPrepare || input.readiedRelease) {
    toolkitError('ALARM_CAST_SOURCE_UNSUPPORTED', 'This Alarm procedure uses the actual player’s normal or ritual long casting. Other producers are outside this slice.')
  }
  const selection = AlarmWardSelectionSchema.safeParse(input.alarmWard)
  if (!selection.success || input.targetId !== undefined || input.targetIds !== undefined || input.targetName !== undefined
    || input.toCell !== undefined || input.area !== undefined || input.direction !== undefined || input.narrative !== undefined) {
    toolkitError('ALARM_WARD_SELECTION_REQUIRED', 'Choose alarmWard with a real door or a single 5-foot ground cube, mental mode and explicit exemptions. Windows, larger or elevated cubes, audible signals and narrative points are outside this slice.')
  }
  const state = gs.getState(), mapId = state.currentMapId, player = gs.getPlayer()
  const placement = mapId ? actualAlarmPlacement(state, mapId, selection.data) : undefined
  if (!placement || !supportedGroundBody('player') || !supportedPlacementFloor(placement)) {
    toolkitError('ALARM_WARD_GEOMETRY_REQUIRED', 'Choose a real door panel with two adjacent ground sides or a 5-foot cube on a known ground cell and an exterior caster.')
  }
  const target = placement.kind === 'door' ? getDoor(placement.doorId).side.cell : placement.cell
  const gap = Math.max(Math.abs(player.position.x - target.x), Math.abs(player.position.y - target.y))
  if (gap > 6 || !visibleCell({ ...player, conditions: player.conditions.filter(c => c !== 'blinded') }, target)
    || (placement.kind === 'door' ? getDoorState(placement.doorId) === 'broken'
      : !navigationGrid(state, 'player', engineGeometry()).free(target, false))) {
    toolkitError('ALARM_WARD_UNREACHABLE', 'The chosen physical ward needs a clear path within 30 feet, an intact door or a clear ground cube.')
  }
  if (!completing && selection.data.exemptCreatureIds.some(id => !gs.getPhysicalCreature(id))) {
    toolkitError('ALARM_EXEMPT_CREATURE_REQUIRED', 'Choose exact already represented creatures for exemptions at the start of the casting.')
  }
  if (completing) {
    const original = AlarmPlacementSchema.safeParse(input.alarmPlacementWitness)
    const cast = input.alarmCastingId ? state.dmTools?.casting?.records[input.alarmCastingId] : undefined
    if (!cast || cast.spellId !== 'alarm' || !original.success || !sameAlarmPlacement(original.data, placement)) {
      toolkitError('ALARM_ORIGINAL_WARD_REQUIRED', 'Finish only a real Alarm incantation with its unchanged original physical ward.')
    }
  }
  return { selection: selection.data, placement }
}

export function activateAlarmWard(plan: NonNullable<ReturnType<typeof planAlarmSpell>>, castingId: string) {
  const startedAt = gs.getState().worldTimeSeconds ?? 0
  const ledger = toolkitState().alarmSpell ??= { version: 1, wards: {}, pingCount: 0 }
  const ward = { castingId, ...plan, startedAt, expiresAt: startedAt + ALARM_DURATION_SECONDS }
  ledger.wards[castingId] = ward
  return { alarmId: castingId, placement: ward.placement, mode: ward.selection.mode, expiresAt: ward.expiresAt }
}

function signal(ward: AlarmWard, creatureId: string) {
  if (ward.selection.exemptCreatureIds.includes(creatureId)) return
  const state = gs.getState(), ledger = state.dmTools!.alarmSpell!, at = state.worldTimeSeconds ?? 0
  const { position } = state.player, point = entityVerticalContext(state, 'player'), p = ward.placement
  const anchor = p.kind === 'door' ? p.sides[0].cell : p.cell
  // A conservative upper bound using the actual ward and recipient coordinates.
  // Distinct maps have no shared world coordinates in this model.
  const upperFeet = point.known && point.zFeet !== null
    ? 5 * (Math.abs(position.x - anchor.x) + Math.abs(position.y - anchor.y) + 1) + Math.abs(point.zFeet)
    : Infinity
  if (state.player.deathSaves?.dead || state.currentMapId !== p.mapId || upperFeet > 5280) return
  const awakened = wakeNaturalSleeper('player', 'mental_alarm').awakened
  ledger.latestPing = { number: ++ledger.pingCount, at, awakened }
}

export function recordAlarmMovement(id: string, kind: GroundGearMovementKind, from?: GroundGearStepWitness) {
  const state = gs.getState()
  if (!state.dmTools?.alarmSpell || !from || from.entityId !== id || !supportedGroundBody(id)) return
  const to = gs.getPhysicalCreature(id)!.position
  for (const ward of activeAlarmWards(state)) {
    const p = ward.placement
    if (p.mapId !== state.currentMapId || !supportedPlacementFloor(p)) continue
    if (p.kind === 'ground_cube') {
      const previouslyOutside = from.mapId !== p.mapId || !sameAlarmCell(from.fromCell, p.cell)
        || (from.fromZFeet !== null && (from.fromZFeet > 5 || from.fromZFeet < 0))
      if (previouslyOutside && sameAlarmCell(to, p.cell)) signal(ward, id)
    } else if (from.fromZFeet === 0 && from.mapId === p.mapId && (kind === 'walk' || kind === 'forced')) {
      const [a, b] = p.sides.map(side => side.cell)
      if ((sameAlarmCell(from.fromCell, a) && sameAlarmCell(to, b)) || (sameAlarmCell(from.fromCell, b) && sameAlarmCell(to, a))) signal(ward, id)
    }
  }
}

export function recordAlarmPanelContact(doorId: string, id: string) {
  const state = gs.getState()
  if (!state.dmTools?.alarmSpell || !supportedGroundBody(id)) return
  const ward = activeAlarmWards(state).find(w => w.placement.kind === 'door' && w.placement.mapId === state.currentMapId && w.placement.doorId === doorId)
  if (ward && supportedPlacementFloor(ward.placement)) signal(ward, id)
}

export const inspectAlarm = () => alarmRecipientView(gs.getState())
