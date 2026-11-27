import type { GameState } from '../lib/types'
import { getAdventureMap, inferRoomIdOnMap } from '../lib/adventure-map'
import { groundGearPhysicalWitness as witness } from '../lib/ground-gear-recovery-state'
import { UrbanCheckInputSchema, UrbanRerollInputSchema, UrbanEncounterStateSchema,
  localUrbanFact, urbanCadenceIssue, urbanClockAt, urbanClockKey, urbanEncounterCommand, urbanPhaseKey, urbanScope,
  URBAN_MAX_CHECKS, URBAN_MAX_REROLLS, URBAN_OCCURRENCE_THRESHOLD,
  type UrbanCheck, type UrbanProposal, type UrbanReroll } from '../lib/urban-encounter-state'
import { ACTIVE_ADVENTURE_ID } from './adventure'
import { getState } from './game-state'
import { readUrbanEncounterTable } from './rules-library'
import { rollDice } from './dice'
import { rollSourceTableDice } from './source-table-dice'
import { toolkitError, toolkitState } from './toolkit'

const same = (a: unknown, b: unknown) => witness(a) === witness(b)
const notice = 'Confidential MJ proposal only. No actor, location, hostility, discovery or encounter is created.'

function table() {
  try { return readUrbanEncounterTable() }
  catch { toolkitError('URBAN_ENCOUNTER_SOURCE_REQUIRED', 'Use the exact supplied DMG Random Urban Encounters table.') }
}

function draw(source: ReturnType<typeof table>): UrbanProposal {
  const roll = rollSourceTableDice(source.dice)
  return { faces: [roll.rolls[0], roll.rolls[1]], total: roll.total,
    label: source.rows.find(row => row.low === roll.total)!.cells[1] }
}

function history() { return getState().dmTools?.urbanEncounters }
function ledger() { return toolkitState().urbanEncounters ??= { version: 1, checks: [], rerolls: [] } }
function scene() {
  const state = getState(), { currentMapId: mapId, currentRoomId: roomId } = state, cell = state.player.position
  if (state.phase === 'combat' || !mapId || !roomId || !getAdventureMap(state).maps.some(map => map.id === mapId)
    || inferRoomIdOnMap(cell, mapId, state) !== roomId)
    toolkitError('URBAN_ENCOUNTER_SCENE_REQUIRED', 'Use the real current urban district outside combat.')
  return { adventureId: ACTIVE_ADVENTURE_ID, mapId, roomId, at: state.worldTimeSeconds ?? 0, cell: { ...cell } }
}

function checkView({ command: _, districtFact: _fact, latestDrawId: _latest, ...receipt }: UrbanCheck, replayed = false) {
  return { ...structuredClone(receipt), checkId: receipt.input.eventId,
    drawId: receipt.proposal ? receipt.input.eventId : null, replayed, confidentialMjReference: true, notice }
}

function rerollView({ command: _, ...receipt }: UrbanReroll, replayed = false) {
  return { ...structuredClone(receipt), drawId: receipt.input.eventId, checkId: receipt.input.checkId,
    replayed, confidentialMjReference: true, notice }
}

export function checkUrbanEncounter(raw: unknown) {
  const input = UrbanCheckInputSchema.parse(raw), data = history()
  const old = data?.checks.find(check => check.input.eventId === input.eventId)
  if (old) {
    if (!same(old.input, input)) toolkitError('URBAN_ENCOUNTER_EVENT_CONFLICT', 'Keep the exact original urban check.')
    return checkView(old, true)
  }
  if (data?.rerolls.some(event => event.input.eventId === input.eventId))
    toolkitError('URBAN_ENCOUNTER_EVENT_CONFLICT', 'This original command ID already belongs to a reroll.')
  if ((data?.checks.length ?? 0) >= URBAN_MAX_CHECKS)
    toolkitError('URBAN_ENCOUNTER_HISTORY_LIMIT', 'The actual urban check history is full.')
  const here = scene(), state = getState()
  const districtFact = state.worldFacts?.find(fact => fact.id === input.districtFactId)
  if (!districtFact || !localUrbanFact({ ...districtFact }, input.districtFactId, here.mapId, here.roomId))
    toolkitError('URBAN_ENCOUNTER_DISTRICT_REQUIRED', 'Choose the actual durable district fact in this room and map.')
  const clock = urbanClockAt(state, input, here.mapId, here.at)
  if (!clock) toolkitError('URBAN_ENCOUNTER_CLOCK_REQUIRED', 'Choose the two actual local daily physical references and supported civil date.')
  if (clock.phase === 'night' && input.nightOutsideConfirmed !== true)
    toolkitError('URBAN_ENCOUNTER_NIGHT_OUTSIDE_REQUIRED', 'Explicitly confirm the character is actually out at this local night hour.')
  const scoped = data?.checks.filter(check => check.mapId === here.mapId && check.roomId === here.roomId) ?? []
  if (scoped[0] && urbanClockKey(scoped[0].input) !== urbanClockKey(input))
    toolkitError('URBAN_ENCOUNTER_CLOCK_IMMUTABLE', 'Keep the original two local hour references for this district.')
  const key = urbanPhaseKey(here.mapId, here.roomId, clock)
  const previous = scoped.filter(check => urbanPhaseKey(check.mapId, check.roomId, check.clock) === key).at(-1)
  const cadenceIssue = urbanCadenceIssue(state, { input, ...here, clock }, previous)
  if (cadenceIssue) toolkitError(cadenceIssue.code, cadenceIssue.message)
  const source = table()
  const occurrenceRoll = input.decision === 'd20' ? { notation: '1d20' as const, face: rollDice('1d20').total } : undefined
  const occurs = occurrenceRoll ? occurrenceRoll.face >= URBAN_OCCURRENCE_THRESHOLD : input.decision === 'draw'
  const receipt: UrbanCheck = { input, ...here, districtFact: { ...structuredClone(districtFact) }, clock,
    source: source.source, ...(occurrenceRoll ? { occurrenceRoll } : {}),
    ...(occurs ? { proposal: draw(source), latestDrawId: input.eventId } : {}), command: '' }
  receipt.command = urbanEncounterCommand(receipt)
  ledger().checks.push(receipt)
  return checkView(receipt)
}

export function rerollUrbanEncounter(raw: unknown) {
  const input = UrbanRerollInputSchema.parse(raw), data = history()
  const old = data?.rerolls.find(event => event.input.eventId === input.eventId)
  if (old) {
    if (!same(old.input, input)) toolkitError('URBAN_ENCOUNTER_EVENT_CONFLICT', 'Keep the exact original urban reroll.')
    return rerollView(old, true)
  }
  if (data?.checks.some(check => check.input.eventId === input.eventId))
    toolkitError('URBAN_ENCOUNTER_EVENT_CONFLICT', 'This original command ID already belongs to a check.')
  if ((data?.rerolls.length ?? 0) >= URBAN_MAX_REROLLS)
    toolkitError('URBAN_ENCOUNTER_HISTORY_LIMIT', 'The actual urban reroll history is full.')
  const check = data?.checks.find(record => record.input.eventId === input.checkId)
  if (!check?.proposal || input.previousDrawId !== check.latestDrawId)
    toolkitError('URBAN_ENCOUNTER_LATEST_DRAW_REQUIRED', 'Select the latest actual proposal of this exact positive urban check.')
  const here = scene(), state = getState()
  if (here.mapId !== check.mapId || here.roomId !== check.roomId || here.at !== check.at
    || !same(urbanClockAt(state, check.input, here.mapId, here.at), check.clock)
    || !state.worldFacts?.some(fact => localUrbanFact({ ...fact }, check.input.districtFactId, here.mapId, here.roomId)))
    toolkitError('URBAN_ENCOUNTER_HOUR_CHANGED', 'A new contextual reroll requires the original actual hour and qualified district.')
  if (check.clock.phase === 'night' && input.nightOutsideConfirmed !== true)
    toolkitError('URBAN_ENCOUNTER_NIGHT_OUTSIDE_REQUIRED', 'Explicitly confirm the character is still out at the original local night hour.')
  const source = table()
  const receipt: UrbanReroll = { input, proposal: draw(source), command: '' }
  receipt.command = urbanEncounterCommand(receipt)
  ledger().rerolls.push(receipt)
  check.latestDrawId = input.eventId
  return rerollView(receipt)
}

export function inspectUrbanEncounters({ checkId, offset, limit }: { checkId?: string; offset: number; limit: number }) {
  const state = getState(), data = history()
  const checks = data?.checks ?? [], rerolls = data?.rerolls ?? []
  const current = checks.find(record => record.mapId === state.currentMapId && record.roomId === state.currentRoomId)
  const clock = current && urbanClockAt(state, current.input, current.mapId, state.worldTimeSeconds ?? 0)
  const check = checkId ? checks.find(record => record.input.eventId === checkId) : undefined
  if (checkId && !check) toolkitError('URBAN_ENCOUNTER_CHECK_REQUIRED', 'Choose an actual retained urban check.')
  const results = check ? [checkView(check), ...rerolls.filter(event => event.input.checkId === checkId).map(event => rerollView(event))]
    : checks.map(record => checkView(record))
  if (offset > results.length) toolkitError('URBAN_ENCOUNTER_OFFSET_REQUIRED', 'Choose an offset in the retained history.')
  const currentKey = current && clock && urbanPhaseKey(current.mapId, current.roomId, clock)
  return { confidentialMjReference: true, clock: clock ?? null,
    phaseChecked: currentKey ? checks.some(record => urbanPhaseKey(record.mapId, record.roomId, record.clock) === currentKey) : null,
    total: results.length, nextOffset: offset + limit < results.length ? offset + limit : null,
    results: results.slice(offset, offset + limit), notice }
}

export function validateUrbanEncounterHistory(state: GameState, adventureId: string) {
  const data = state.dmTools?.urbanEncounters
  if (!data) return []
  if (!UrbanEncounterStateSchema.safeParse(data).success) return ['Invalid urban encounter ledger.']
  const scope = { ...state, adventureId }, maps = getAdventureMap(scope).maps
  const source = table(), ids = new Set<string>(), phases = new Map<string, UrbanCheck>()
  const clocks = new Map<string, string>(), latest = new Map<string, string>(), checks = new Map<string, UrbanCheck>()
  const validProposal = (p: UrbanProposal) => p.faces[0] + p.faces[1] === p.total
    && source.rows.find(row => row.low === p.total)?.cells[1] === p.label
  for (const check of data.checks) {
    const { input, clock, mapId, roomId } = check
    const key = urbanScope(mapId, roomId), phase = urbanPhaseKey(mapId, roomId, clock), clockKey = urbanClockKey(input)
    const occurs = check.occurrenceRoll ? check.occurrenceRoll.face >= URBAN_OCCURRENCE_THRESHOLD : input.decision === 'draw'
    if (check.adventureId !== adventureId || check.at > (state.worldTimeSeconds ?? 0)
      || !maps.some(map => map.id === mapId) || inferRoomIdOnMap(check.cell, mapId, scope) !== roomId
      || !localUrbanFact(check.districtFact, input.districtFactId, mapId, roomId)
      || !same(urbanClockAt(state, input, mapId, check.at), clock) || !same(check.source, source.source)
      || check.command !== urbanEncounterCommand(check) || ids.has(input.eventId) || urbanCadenceIssue(state, check, phases.get(phase))
      || clocks.has(key) && clocks.get(key) !== clockKey || clock.phase === 'night' && input.nightOutsideConfirmed !== true
      || (input.decision === 'd20') !== Boolean(check.occurrenceRoll)
      || occurs !== Boolean(check.proposal) || check.proposal && !validProposal(check.proposal))
      return ['Retain the actual source, district, local phase, decision and exact canonical check.']
    ids.add(input.eventId); phases.set(phase, check); clocks.set(key, clockKey); checks.set(input.eventId, check)
    if (check.proposal) latest.set(input.eventId, input.eventId)
  }
  for (const event of data.rerolls) {
    const { input } = event, check = checks.get(input.checkId)
    if (!check?.proposal || ids.has(input.eventId) || latest.get(input.checkId) !== input.previousDrawId
      || check.clock.phase === 'night' && input.nightOutsideConfirmed !== true
      || event.command !== urbanEncounterCommand(event) || !validProposal(event.proposal))
      return ['Retain every exact contextual reroll and its latest original proposal.']
    ids.add(input.eventId); latest.set(input.checkId, input.eventId)
  }
  return data.checks.some(check => check.latestDrawId !== latest.get(check.input.eventId))
    ? ['Retain each original check’s latest actual proposal and its full reroll sequence.'] : []
}
