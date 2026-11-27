import { z } from 'zod'
import { NativeFlightPointSchema, SpatialAttackContextSchema } from './spatial-weapon-state'
import type { GameState } from './types'

const Id = z.string().min(1).max(180).refine(value => !['constructor', 'prototype', '__proto__'].includes(value))
const Event = z.string().min(1).max(80).regex(/^[a-zA-Z0-9][a-zA-Z0-9_:.-]*$/)
const Feet = z.number().finite().min(-100000).max(100000)

/** An explicit actual point on each measured body, retained while that body
 * keeps its posture and measurement. This grants no reach, route or attack. */
export const SpatialOpportunityObservationSchema = z.object({
  eventId: Event,
  sourceId: Id,
  movingId: Id,
  weaponReference: Id,
  sourcePointZFeet: Feet,
  movingPointOffsetZFeet: z.number().finite().nonnegative().max(1000),
  factId: Id,
  actualRetainedBodyPointsConfirmed: z.literal(true),
  priority: z.number().int().nonnegative().max(255).optional(),
  source: z.string().trim().min(1).max(1000),
}).strict()
export type SpatialOpportunityObservation = z.infer<typeof SpatialOpportunityObservationSchema>

export const SpatialOpportunityChoiceSchema = z.object({
  weaponOrSpell: Id,
  kind: z.enum(['player_weapon', 'native_profile']),
  reachCells: z.number().finite().positive(),
  weaponId: Id.optional(),
  context: SpatialAttackContextSchema,
}).strict()
export const SpatialOpportunityBoundarySchema = z.object({
  kind: z.literal('spatial-opportunity'),
  key: z.string().min(1).max(5000),
  sourceId: Id, actorId: Id, mapId: Id,
  from: NativeFlightPointSchema, to: NativeFlightPointSchema, point: NativeFlightPointSchema,
  fraction: z.number().finite().min(0).lt(1),
  choices: z.array(SpatialOpportunityChoiceSchema).min(1).max(64),
  nativeFlightId: Event.optional(), segmentIndex: z.number().int().positive().optional(),
  priority: z.number().int().nonnegative().max(255).optional(),
  combatGeneration: z.number().int().nonnegative(), turnCounter: z.number().int().nonnegative(),
}).strict()
export type SpatialOpportunityBoundary = z.infer<typeof SpatialOpportunityBoundarySchema>

export const SpatialOpportunityStateSchema = z.object({
  version: z.literal(1),
  records: z.record(z.string(), z.object({
    input: SpatialOpportunityObservationSchema,
    mapId: Id,
    combatGeneration: z.number().int().nonnegative(),
    turnCounter: z.number().int().nonnegative(),
    sourceWitness: z.string(),
    movingBodyWitness: z.string(),
    at: z.number().finite().nonnegative(),
  }).strict()),
  receipts: z.record(z.string(), z.object({
    command: z.string(), result: z.record(z.string(), z.unknown()),
  }).strict()),
}).strict().superRefine((state, ctx) => {
  if (Object.keys(state.records).length > 512 || Object.keys(state.receipts).length > 2048)
    ctx.addIssue({ code: 'custom', message: 'Retain bounded original physical opportunity observations; no receipt is evicted.' })
})
export type SpatialOpportunityState = z.infer<typeof SpatialOpportunityStateSchema>
export const initialSpatialOpportunityState = (): SpatialOpportunityState => ({ version: 1, records: {}, receipts: {} })
export const spatialOpportunityStateOf = (state: Pick<GameState, 'dmTools'>) =>
  (state.dmTools as { spatialOpportunities?: SpatialOpportunityState } | undefined)?.spatialOpportunities
export const spatialOpportunityKey = (sourceId: string, movingId: string, weaponReference: string) =>
  JSON.stringify([sourceId, movingId, weaponReference])
