import { z } from 'zod'
import type { GameState } from './types'
import { calendarDateSeconds } from './calendar-state'
import { getAdventureMap } from './adventure-map'
import { groundGearPhysicalWitness as witness } from './ground-gear-recovery-state'
import { MAGIC_ITEMS } from './srd/magic-items'
import { MagicItemRecordSchema } from './magic-item-state'

export const RECHARGE_DAY = 86400
export const RECHARGE_XGE_SHA = '519584ec7fc7da6fea056c182a22254bc807db5d077c2fc205801bd872d761bf'
const Id = z.string().min(1).max(100).refine(s => !['__proto__', 'constructor', 'prototype'].includes(s))
const Time = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
export const AdoptRechargeCalendarSchema = z.object({
  eventId: Id, mapId: Id, referenceId: Id, actualDawnlessMapConfirmed: z.literal(true),
}).strict()
const Source = z.object({ book: z.literal('xge'), sectionId: z.string(), sha256: z.literal(RECHARGE_XGE_SHA),
  startLine: z.literal(2620), endLine: z.literal(2626) }).strict()
export const AdoptItemRechargeTimeSchema = z.object({
  eventId: Id, mapId: Id, referenceId: Id,
  itemIds: z.array(z.string().min(1).max(80).refine(s => !['__proto__', 'constructor', 'prototype'].includes(s)))
    .min(1).max(64).refine(ids => new Set(ids).size === ids.length),
  actualWorldWithDawnConfirmed: z.literal(true), explicitlyAdopted: z.literal(true),
}).strict()
const ItemTimeChoice = z.object({
  input: AdoptItemRechargeTimeSchema, at: Time, firstAt: Time,
  instances: z.array(MagicItemRecordSchema.pick({ id: true, templateId: true, creation: true })).min(1).max(64),
  configurationCommand: z.string(), referenceCommand: z.string(), source: Source, command: z.string(),
}).strict()
export const ItemRechargeCalendarSchema = z.object({
  version: z.literal(1), choices: z.record(z.string(), ItemTimeChoice)
    .refine(choices => Object.keys(choices).length > 0 && Object.keys(choices).length <= 64), evaluatedThrough: Time,
}).strict()
export type ItemRechargeCalendar = z.infer<typeof ItemRechargeCalendarSchema>
export const itemRechargeTimeCommand = ({ command: _, ...data }: z.infer<typeof ItemTimeChoice>) => witness(data)
const Adoption = z.object({
  input: AdoptRechargeCalendarSchema, adoptedAt: Time, firstAt: Time,
  configurationCommand: z.string(), referenceCommand: z.string(),
  source: Source, command: z.string(),
}).strict()
export const BindRechargePlaneMapSchema = z.object({
  eventId: Id, originMapId: Id, mapId: Id, planeId: Id,
  planeName: z.string().trim().min(1).max(120), factId: Id,
  actualSameDawnlessPlaneConfirmed: z.literal(true),
}).strict()
const PlaneMapBinding = z.object({
  input: BindRechargePlaneMapSchema, at: Time, firstAt: Time,
  fact: z.record(z.string(), z.unknown()), adoptionCommand: z.string(), command: z.string(),
}).strict()
export const RechargeCalendarSchema = z.object({
  version: z.literal(1), adoption: Adoption, evaluatedThrough: Time,
  planeMaps: z.record(z.string(), PlaneMapBinding).refine(maps => Object.keys(maps).length > 0).optional(),
}).strict()
export type RechargeCalendar = z.infer<typeof RechargeCalendarSchema>
export const rechargeCalendarCommand = ({ command: _, ...data }: RechargeCalendar['adoption']) => witness(data)
export const rechargePlaneMapCommand = ({ command: _, ...data }: z.infer<typeof PlaneMapBinding>) => witness(data)
export function nextRechargeAt(firstAt: number, at: number) {
  return firstAt + rechargeOccurrences(firstAt, at) * RECHARGE_DAY
}

export function firstRechargeAt(state: GameState, input: Pick<z.infer<typeof AdoptRechargeCalendarSchema>, 'mapId' | 'referenceId'>, at: number) {
  const calendar = state.dmTools?.calendar
  const reference = calendar && Object.hasOwn(calendar.references, input.referenceId)
    ? calendar.references[input.referenceId] : undefined
  if (!calendar || !reference || reference.at > at || reference.input.category !== 'physical_cycle'
    || reference.input.periodDays !== 1 || reference.fact.source !== 'record_scene_fact'
    || reference.fact.mapId !== input.mapId || reference.fact.expires !== 'never'
    || reference.fact.subjectItemId !== undefined || reference.fact.clueId !== undefined)
    return undefined
  const configuration = calendar.configuration
  const definition = configuration.input.definition
  const zero = calendarDateSeconds(definition, configuration.input.anchor)
  const referenceDate = calendarDateSeconds(definition, reference.input.anchor)
  if (zero === undefined || referenceDate === undefined) return undefined
  const base = configuration.at + referenceDate - zero
  const firstAt = base > at ? base : base + (Math.floor((at - base) / RECHARGE_DAY) + 1) * RECHARGE_DAY
  if (!Number.isSafeInteger(firstAt) || firstAt <= at) return undefined
  return { firstAt, configurationCommand: configuration.command, referenceCommand: reference.command }
}

export function rechargeOccurrences(firstAt: number, through: number) {
  return through < firstAt ? 0 : Math.floor((through - firstAt) / RECHARGE_DAY) + 1
}

export function dawnlessRechargeMap(state: GameState, mapId: string) {
  const data = state.dmTools?.rechargeCalendar
  return Boolean(data && (data.adoption.input.mapId === mapId || Object.hasOwn(data.planeMaps ?? {}, mapId)))
}

export function validateItemRechargeCalendarState(state: GameState, adventureId: string) {
  const data = state.dmTools?.itemRechargeCalendar
  if (!data) return []
  if (!ItemRechargeCalendarSchema.safeParse(data).success) return ['Invalid selected-item recharge calendar schema.']
  const now = state.worldTimeSeconds ?? 0, maps = getAdventureMap({ ...state, adventureId }).maps
  if (state.player.ruleset !== 'srd2014' || !state.hero || !Number.isSafeInteger(now) || data.evaluatedThrough !== now)
    return ['The selected-item recharge calendar retains the supported real reconciled clock.']
  const selected = new Set<string>()
  for (const [eventId, choice] of Object.entries(data.choices)) {
    const schedule = firstRechargeAt(state, choice.input, choice.at)
    if (eventId !== choice.input.eventId || choice.command !== itemRechargeTimeCommand(choice) || choice.at > now
      || !maps.some(map => map.id === choice.input.mapId) || dawnlessRechargeMap(state, choice.input.mapId)
      || !schedule || schedule.firstAt !== choice.firstAt || schedule.configurationCommand !== choice.configurationCommand
      || schedule.referenceCommand !== choice.referenceCommand || choice.instances.length !== choice.input.itemIds.length)
      return ['Retain each original explicit dawn-world map, selected instances, physical reference and strictly future first occurrence.']
    for (const [index, instance] of choice.instances.entries()) {
      const record = state.dmTools?.magicItems?.[instance.id], spec = MAGIC_ITEMS[instance.templateId]
      if (instance.id !== choice.input.itemIds[index] || selected.has(instance.id)
        || !record || record.id !== instance.id || record.templateId !== instance.templateId || record.creation !== instance.creation
        || !spec.recharge || !spec.maxCharges)
        return ['Retain the exact original rechargeable instance or its spent tombstone; fresh IDs cannot reanchor an already selected item.']
      selected.add(instance.id)
    }
  }
  if (Object.values(state.dmTools?.magicItems ?? {}).some(record => record.status === 'active'
    && MAGIC_ITEMS[record.templateId].recharge && record.lastRechargeDay !== Math.floor(now / RECHARGE_DAY)))
    return ['Retain the actual reconciled engine day of every active rechargeable item.']
  return []
}

export function validateRechargeCalendarState(state: GameState, adventureId: string) {
  const data = state.dmTools?.rechargeCalendar
  if (!data) return []
  if (!RechargeCalendarSchema.safeParse(data).success) return ['Invalid XGE recharge calendar schema.']
  const { adoption, evaluatedThrough } = data, now = state.worldTimeSeconds ?? 0
  const schedule = firstRechargeAt(state, adoption.input, adoption.adoptedAt)
  const maps = getAdventureMap({ ...state, adventureId }).maps
  if (state.player.ruleset !== 'srd2014' || !state.hero || !Number.isSafeInteger(now) || adoption.adoptedAt > now || evaluatedThrough !== now
    || adoption.command !== rechargeCalendarCommand(adoption) || !maps.some(map => map.id === adoption.input.mapId)
    || !schedule || schedule.firstAt !== adoption.firstAt || schedule.referenceCommand !== adoption.referenceCommand
    || schedule.configurationCommand !== adoption.configurationCommand)
    return ['The original local calendar reference, immutable adoption and reconciled actual clock must survive unchanged.']
  const bindings = Object.entries(data.planeMaps ?? {}), events = new Set([adoption.input.eventId]), facts = new Set<string>()
  const first = bindings[0]?.[1].input
  if (bindings.length > 128) return ['The represented recharge plane map capacity cannot evict existing evidence.']
  for (const [mapId, binding] of bindings) {
    const input = binding.input, fact = binding.fact
    const cell = fact.narrativeEffect as { cell?: { x: number; y: number } } | undefined
    if (mapId !== input.mapId || input.originMapId !== adoption.input.mapId || mapId === input.originMapId
      || !maps.some(map => map.id === mapId) || input.planeId !== first?.planeId || input.planeName !== first.planeName
      || binding.at < adoption.adoptedAt || binding.at > now || events.has(input.eventId) || facts.has(input.factId)
      || binding.adoptionCommand !== adoption.command || binding.command !== rechargePlaneMapCommand(binding)
      || binding.firstAt !== nextRechargeAt(adoption.firstAt, binding.at) || !Number.isSafeInteger(binding.firstAt)
      || fact.id !== input.factId || fact.source !== 'record_scene_fact' || fact.mapId !== mapId || fact.expires !== 'never'
      || fact.subjectItemId !== undefined || fact.clueId !== undefined || !cell?.cell)
      return ['Each explicitly qualified map must retain its original same-plane identity, local fact, future boundary and immutable command.']
    events.add(input.eventId); facts.add(input.factId)
  }
  const day = Math.floor(now / RECHARGE_DAY)
  if (Object.values(state.dmTools?.magicItems ?? {}).some(record =>
    record.status === 'active' && MAGIC_ITEMS[record.templateId].recharge && record.lastRechargeDay !== day))
    return ['Each active rechargeable item must retain its actual reconciled engine day.']
  return []
}
