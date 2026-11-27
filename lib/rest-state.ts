import { SleepArmorSnapshotSchema } from './sleep-state'
import { z } from 'zod'

const Id = z.string().min(1).max(80)
export const RestKindSchema = z.enum(['short', 'long'])
export const RestActivitySchema = z.enum(['sleep', 'light', 'strenuous'])
export const RestSegmentSchema = z.object({
  eventId: Id, from: z.number().int().nonnegative(), to: z.number().int().nonnegative(),
  sleepArmor: SleepArmorSnapshotSchema.optional(),
  activity: RestActivitySchema, reason: z.string().trim().min(1).max(600),
  observation: z.object({ before: z.string(), after: z.string() }).strict().optional(),
}).strict().refine(segment => segment.to > segment.from || segment.to === segment.from
  && !!segment.observation && segment.observation.before !== segment.observation.after,
  'An interval needs real elapsed time, or a witnessed action without an invented duration.')
export const RestCheckpointSchema = z.object({
  fingerprint: z.string(), mapId: z.string(), phase: z.string(), combatGeneration: z.number().int().nonnegative(),
  position: z.object({ x: z.number().int(), y: z.number().int() }).strict(),
}).strict()
export const RestSessionSchema = z.object({
  restId: Id, kind: RestKindSchema, startedAt: z.number().int().nonnegative(),
  hpAtStart: z.number().int().nonnegative(), creditedUntil: z.number().int().nonnegative(),
  segments: z.array(RestSegmentSchema).max(512),
  checkpoint: RestCheckpointSchema.optional(),
}).strict().superRefine((session, context) => {
  let cursor = session.startedAt
  const ids = new Set<string>()
  for (const segment of session.segments) {
    if (segment.from !== cursor) context.addIssue({ code: 'custom', message: 'Rest activity requires an exact contiguous clock record; gaps are not credited.' })
    if (ids.has(segment.eventId)) context.addIssue({ code: 'custom', message: 'A rest activity event can occur only once.' })
    ids.add(segment.eventId)
    cursor = segment.to
  }
  if (session.creditedUntil !== cursor) context.addIssue({ code: 'custom', message: 'Rest credit must end at its last actual segment.' })
})
export const RestStateSchema = z.object({
  version: z.literal(1), active: RestSessionSchema.optional(),
  receipts: z.record(z.string(), z.object({ restId: Id, definition: z.string(),
    completedAt: z.number().int().nonnegative(), result: z.record(z.string(), z.unknown()),
    session: RestSessionSchema,
    hitDiceContinuation: z.object({
      checkpoint: RestCheckpointSchema, songUsed: z.boolean(), musicAllowed: z.boolean(),
      events: z.record(z.string(), z.object({ songOfRest: z.boolean(), result: z.record(z.string(), z.unknown()) }).strict()),
    }).strict().optional(),
  }).strict()),
}).strict()
export type RestSession = z.infer<typeof RestSessionSchema>
export type RestSegment = z.infer<typeof RestSegmentSchema>
export type RestState = z.infer<typeof RestStateSchema>

/** Eligibility of the explicitly recorded period, never a heal, roll or clock
 * advance. The engine integration must establish every interval from real time. */
export function inspectRestPeriod(session: RestSession) {
  RestSessionSchema.parse(session)
  const seconds = { sleep: 0, light: 0, strenuous: 0 }
  for (const segment of session.segments) seconds[segment.activity] += segment.to - segment.from
  const elapsed = session.creditedUntil - session.startedAt
  const interrupted = session.kind === 'short' ? session.segments.some(segment => segment.activity === 'strenuous') : seconds.strenuous >= 3600
  const missing = session.kind === 'short' ? Math.max(0, 3600 - elapsed) : Math.max(0, 28800 - elapsed)
  const sleepMissing = session.kind === 'long' ? Math.max(0, 21600 - seconds.sleep) : 0
  const excessLight = session.kind === 'long' ? Math.max(0, seconds.light - 7200) : 0
  const startHpRequired = session.kind === 'long' && session.hpAtStart < 1
  return { restId: session.restId, kind: session.kind, elapsedSeconds: elapsed, activitySeconds: seconds,
    durationMissingSeconds: missing, sleepMissingSeconds: sleepMissing, excessLightSeconds: excessLight,
    startHpRequired, interrupted, eligible: !interrupted && !missing && !sleepMissing && !excessLight && !startHpRequired,
    interpretation: 'Long-rest strenuous time is accumulated within the explicitly recorded period; no retrospective period or missing activity is invented.',
    benefitsGranted: false as const }
}

/** Validates the entire next record before mutating the saved period. An exact
 * retry cannot add time; a conflicting ID or an unrecorded gap is refused. */
export function appendRestActivity(session: RestSession, input: RestSegment) {
  const segment = RestSegmentSchema.parse(input)
  const previous = session.segments.find(value => value.eventId === segment.eventId)
  if (previous) {
    if (JSON.stringify(previous) !== JSON.stringify(segment)) throw new Error('REST_ACTIVITY_EVENT_CONFLICT')
    return { replayed: true, ...inspectRestPeriod(session) }
  }
  const next = RestSessionSchema.parse({ ...session, creditedUntil: segment.to, segments: [...session.segments, segment] })
  Object.assign(session, next)
  return { replayed: false, ...inspectRestPeriod(session) }
}
