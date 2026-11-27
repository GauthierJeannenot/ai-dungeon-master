import { z } from 'zod'
import type { GameState } from './types'
import { CalendarDateSchema, calendarDateFromSeconds, calendarDateSeconds } from './calendar-state'
import { groundGearPhysicalWitness as witness } from './ground-gear-recovery-state'

export const URBAN_DMG_SHA = 'fa75462a6ef96ef0f86fbfd2d433c624ce926ff630a43d1fcaea6a2c1249b0d1'
export const URBAN_MAX_CHECKS = 256
export const URBAN_MAX_REROLLS = 512
export const URBAN_OCCURRENCE_THRESHOLD = 18
const DAY = 86400
const Id = z.string().trim().min(1).max(100).refine(id => !['__proto__', 'prototype', 'constructor'].includes(id))
const Reason = z.string().trim().min(1).max(1000)
const Time = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
const CivilDate = CalendarDateSchema.pick({ year: true, segmentId: true, day: true })
const Fact = z.record(z.string(), z.unknown())

export const UrbanCheckInputSchema = z.object({
  eventId: Id, districtFactId: Id, dayStartReferenceId: Id, nightStartReferenceId: Id,
  actualUrbanDistrictConfirmed: z.literal(true), nightOutsideConfirmed: z.literal(true).optional(),
  decision: z.enum(['draw', 'no_encounter', 'd20']), reason: Reason,
  additionalDayCheck: z.object({
    previousCheckId: Id, momentReferenceId: Id, actualDistinctMomentConfirmed: z.literal(true),
  }).strict().optional(),
}).strict()
export const UrbanRerollInputSchema = z.object({
  eventId: Id, checkId: Id, previousDrawId: Id, incompatibleWithActualHourConfirmed: z.literal(true),
  nightOutsideConfirmed: z.literal(true).optional(), reason: Reason,
}).strict()

const Source = z.object({
  book: z.literal('dmg-2014'), tableId: Id, sectionId: Id, sha256: z.literal(URBAN_DMG_SHA),
  startLine: z.literal(4652), endLine: z.literal(4672),
}).strict()
const Clock = z.object({
  phase: z.enum(['day', 'night']), observedDate: CivilDate, phaseDate: CivilDate,
  localSeconds: Time, dayAnchor: Time, nightAnchor: Time,
}).strict()
const Proposal = z.object({
  faces: z.tuple([z.number().int().min(1).max(12), z.number().int().min(1).max(8)]),
  total: z.number().int().min(2).max(20), label: z.string().min(1).max(160),
}).strict()
const Check = z.object({
  input: UrbanCheckInputSchema, adventureId: Id, mapId: Id, roomId: Id, at: Time,
  cell: z.object({ x: z.number().int(), y: z.number().int() }).strict(),
  districtFact: Fact, clock: Clock, source: Source, proposal: Proposal.optional(), latestDrawId: Id.optional(), command: z.string(),
  occurrenceRoll: z.object({ notation: z.literal('1d20'), face: z.number().int().min(1).max(20) }).strict().optional(),
}).strict()
const Reroll = z.object({ input: UrbanRerollInputSchema, proposal: Proposal, command: z.string() }).strict()
export const UrbanEncounterStateSchema = z.object({
  version: z.literal(1), checks: z.array(Check).max(URBAN_MAX_CHECKS), rerolls: z.array(Reroll).max(URBAN_MAX_REROLLS),
}).strict()
export type UrbanCheck = z.infer<typeof Check>
export type UrbanReroll = z.infer<typeof Reroll>
export type UrbanProposal = z.infer<typeof Proposal>

export function urbanEncounterCommand({ command: _, ...receipt }: UrbanCheck | UrbanReroll) {
  if ('latestDrawId' in receipt) delete receipt.latestDrawId
  return witness(receipt)
}
export const urbanScope = (mapId: string, roomId: string) => witness([mapId, roomId])
export const urbanPhaseKey = (mapId: string, roomId: string, clock: UrbanCheck['clock']) =>
  witness([mapId, roomId, clock.phase, clock.phaseDate])
export const urbanClockKey = (input: UrbanCheck['input']) => witness([input.dayStartReferenceId, input.nightStartReferenceId])

export function localUrbanFact(fact: Record<string, unknown>, id: string, mapId: string, roomId?: string) {
  return fact.id === id && fact.source === 'record_scene_fact' && fact.expires === 'never' && fact.mapId === mapId
    && (roomId === undefined || fact.roomId === roomId) && fact.subjectItemId === undefined && fact.clueId === undefined
}

export function urbanCadenceIssue(state: GameState,
  { input, mapId, roomId, at, clock }: Pick<UrbanCheck, 'input' | 'mapId' | 'roomId' | 'at' | 'clock'>,
  previous: UrbanCheck | undefined) {
  const extra = input.additionalDayCheck
  if (!extra) return previous ? { code: 'URBAN_ENCOUNTER_PHASE_ALREADY_CHECKED',
    message: 'Keep this phase check, or explicitly qualify a later and distinct daytime moment.' } : undefined
  if (clock.phase !== 'day') return { code: 'URBAN_ENCOUNTER_DAY_EXTRA_REQUIRED',
    message: 'Only daytime supports an additional check. Retain the one actual night check.' }
  if (!previous || previous.input.eventId !== extra.previousCheckId || previous.at >= at
    || previous.input.districtFactId !== input.districtFactId)
    return { code: 'URBAN_ENCOUNTER_DISTINCT_DAY_REQUIRED',
      message: 'Use the latest check of this date and district, the original district fact and a later actual instant.' }
  const calendar = state.dmTools?.calendar
  const reference = calendar && Object.hasOwn(calendar.references, extra.momentReferenceId)
    ? calendar.references[extra.momentReferenceId] : undefined
  if (!calendar || !reference || reference.at !== at || reference.input.periodDays !== undefined
    || reference.input.factId === input.districtFactId || !localUrbanFact(reference.fact, reference.input.factId, mapId, roomId)
    || calendarDateSeconds(calendar.configuration.input.definition, reference.input.anchor) !== clock.localSeconds)
    return { code: 'URBAN_ENCOUNTER_MOMENT_REQUIRED',
      message: 'Choose a separate durable local fact through a one-time calendar reference recorded at this exact instant.' }
}

export function urbanClockAt(state: GameState, input: UrbanCheck['input'], mapId: string, at: number): UrbanCheck['clock'] | undefined {
  const calendar = state.dmTools?.calendar
  if (!calendar || at < calendar.configuration.at || input.dayStartReferenceId === input.nightStartReferenceId) return
  const { definition, anchor } = calendar.configuration.input
  const calendarAnchor = calendarDateSeconds(definition, anchor)
  function physicalAnchor(id: string) {
    if (!calendar || !Object.hasOwn(calendar.references, id)) return
    const ref = calendar.references[id]
    if (ref.at > at || ref.input.periodDays !== 1 || ref.input.category !== 'physical_cycle'
      || !localUrbanFact(ref.fact, ref.input.factId, mapId)) return
    return calendarDateSeconds(definition, ref.input.anchor)
  }
  const dayAnchor = physicalAnchor(input.dayStartReferenceId), nightAnchor = physicalAnchor(input.nightStartReferenceId)
  if (calendarAnchor === undefined || dayAnchor === undefined || nightAnchor === undefined || dayAnchor === nightAnchor
    || Math.floor(dayAnchor / DAY) !== Math.floor(nightAnchor / DAY)) return
  const localSeconds = calendarAnchor + at - calendar.configuration.at
  if (!Number.isSafeInteger(localSeconds)) return
  const latest = (start: number) => localSeconds < start ? -1 : start + Math.floor((localSeconds - start) / DAY) * DAY
  const latestDay = latest(dayAnchor), latestNight = latest(nightAnchor)
  if (latestDay === latestNight) return
  const phase = latestNight > latestDay ? 'night' : 'day'
  function date(seconds: number) {
    const value = calendarDateFromSeconds(definition, seconds)
    if (!value) return
    const { year, segmentId, day } = value
    return { year, segmentId, day }
  }
  const observedDate = date(localSeconds), phaseDate = date(phase === 'night' ? latestNight : localSeconds)
  if (observedDate && phaseDate) return { phase, observedDate, phaseDate, localSeconds, dayAnchor, nightAnchor }
}
