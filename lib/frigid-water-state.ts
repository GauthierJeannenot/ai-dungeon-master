import { z } from 'zod'
import type { GameState } from './types'

const Id = z.string().min(1).max(180).refine(value => !['constructor', 'prototype', '__proto__'].includes(value))
const Time = z.number().finite().nonnegative()
export const FRIGID_WATER_SOURCE = 'DMG2014 Frigid Water, rules/books/dmg-2014.md:4336–4338'
export const FRIGID_WATER_DC = 10
export const FRIGID_WATER_MINUTE = 60

export const RecordFrigidWaterSchema = z.object({
  eventId: Id,
  waterMediumId: Id,
  factId: Id,
  actualFrigidWaterConfirmed: z.literal(true),
}).strict()

const Qualification = RecordFrigidWaterSchema.extend({
  mapId: Id,
  mediumWitness: z.string().min(1),
  factWitness: z.string().min(1),
  at: Time,
}).strict()

const SaveReceipt = z.object({
  eventId: Id,
  at: Time,
  success: z.boolean(),
  automaticReason: z.string().min(1).optional(),
  save: z.record(z.string(), z.unknown()).optional(),
  exhaustionEventId: z.string().min(1).optional(),
}).strict()

const Episode = z.object({
  qualificationId: Id,
  startedAt: Time,
  constitution: z.number().int().min(1).max(30),
  entry: z.object({ kind: z.enum(['surface_swim', 'whole_immersion']), eventId: Id }).strict(),
  endedAt: Time.optional(),
  saves: z.array(SaveReceipt).max(2048),
}).strict()

export const FrigidWaterStateSchema = z.object({
  version: z.literal(1),
  qualifications: z.record(z.string(), Qualification),
  episodes: z.array(Episode).max(256),
  held: z.object({ eventId: Id, witness: z.string().min(1) }).strict().optional(),
}).strict()

export type FrigidWaterEpisode = z.infer<typeof Episode>
export type FrigidWaterQualification = z.infer<typeof Qualification>
export type FrigidWaterSaveReceipt = z.infer<typeof SaveReceipt>
export const frigidWaterEventId = (index: number, ordinal: number) => `frigid-water:${index}:${ordinal}`
export const frigidWaterStateOf = (state: GameState) => state.dmTools?.frigidWater

export function activeFrigidWaterEpisode(state: GameState) {
  const episodes = frigidWaterStateOf(state)?.episodes
  const episode = episodes?.at(-1)
  return episode && episode.endedAt === undefined ? { episode, index: episodes!.length - 1 } : undefined
}

export function nextFrigidWaterSave(state: GameState) {
  const active = activeFrigidWaterEpisode(state)
  if (!active || state.player.deathSaves?.dead) return undefined
  const { episode, index } = active
  const ordinal = episode.saves.length + 1
  return {
    eventId: frigidWaterEventId(index, ordinal),
    qualificationId: episode.qualificationId,
    ordinal,
    at: episode.startedAt + (episode.constitution + ordinal) * FRIGID_WATER_MINUTE,
    dc: FRIGID_WATER_DC,
  }
}

export function dueFrigidWaterSave(state: GameState) {
  const event = nextFrigidWaterSave(state)
  return event && event.at <= (state.worldTimeSeconds ?? 0) ? event : undefined
}

export function frigidWaterDueIssue(state: GameState) {
  const event = dueFrigidWaterSave(state)
  return event && {
    code: 'FRIGID_WATER_SAVE_DUE',
    message: `Resolve the actual immersion save ${event.eventId} before another action or further time.`,
  }
}
