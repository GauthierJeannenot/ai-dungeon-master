import { z } from 'zod'
import type { GameState } from './types'

const Id = z.string().min(1).max(80).regex(/^[a-zA-Z0-9][a-zA-Z0-9_:.-]*$/)
  .refine(value => !['constructor', 'prototype', '__proto__'].includes(value))
const Source = z.string().trim().min(1).max(1000)
export const TRAVEL_DAY_SECONDS = 86400
export const TRAVEL_HOUR_SECONDS = 3600
// All three printed rows, integer seconds and the two source half-speed
// modifiers fit this exact integer unit. The maximum route remains <2^53.
export const TRAVEL_DISTANCE_UNITS_PER_FOOT = 115200
export const TravelPaceSchema = z.enum(['slow', 'normal', 'fast'])
export const TravelScaleSchema = z.enum(['minute', 'hour', 'day'])
export const TravelActivitySchema = z.enum(['watch', 'navigate', 'map', 'track', 'forage', 'other'])
export const TravelRankSchema = z.enum(['front', 'middle', 'back'])
export const WildernessTerrainSchema = z.enum(['forest', 'jungle', 'swamp', 'mountains', 'open_sea_overcast_no_land',
  'arctic', 'desert', 'hills', 'open_sea_clear_no_land', 'grassland', 'meadow', 'farmland'])
export const WILDERNESS_NAVIGATION_DC: Record<z.infer<typeof WildernessTerrainSchema>, number> = {
  forest: 15, jungle: 15, swamp: 15, mountains: 15, open_sea_overcast_no_land: 15,
  arctic: 10, desert: 10, hills: 10, open_sea_clear_no_land: 10, grassland: 5, meadow: 5, farmland: 5,
}
const NavigationAidSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('accurate_map'), itemId: Id, accurateForRouteConfirmed: z.literal(true), source: Source }).strict(),
  z.object({ kind: z.literal('visible_celestial'), body: z.enum(['sun', 'stars']), visibleConfirmed: z.literal(true), source: Source }).strict(),
])
export const TravelNavigationInputSchema = z.object({ eventId: Id, journeyId: Id, pace: TravelPaceSchema,
  terrain: WildernessTerrainSchema, offPathConfirmed: z.literal(true), aids: z.array(NavigationAidSchema).max(2), source: Source }).strict()
export const NavigationSearchInputSchema = z.object({ eventId: Id, journeyId: Id, pace: TravelPaceSchema,
  durationSeconds: z.number().int().min(1).max(3600), rank: TravelRankSchema, source: Source }).strict()
const DelayRoll = z.object({ notation: z.string(), rolls: z.array(z.number().int()), modifier: z.number(), total: z.number(), detail: z.string() }).strict()
const NavigationAttempt = z.object({ input: TravelNavigationInputSchema, command: z.string(), baseDc: z.number().int().min(5).max(15),
  paceModifier: z.union([z.literal(-5), z.literal(0), z.literal(5)]), at: z.number().nonnegative(),
  mapWitness: z.object({ itemId: Id, item: z.record(z.string(), z.unknown()) }).strict().optional(),
  result: z.record(z.string(), z.unknown()).optional() }).strict()
const NavigationState = z.object({ attempts: z.record(z.string(), NavigationAttempt), pendingAttemptId: Id.optional(),
  lost: z.object({ firstLostAt: z.number().nonnegative(), failedAttemptId: Id, delayRoll: DelayRoll,
    requiredSearchSeconds: z.number().int().min(3600).max(21600), searchedSeconds: z.number().int().min(0).max(21600) }).strict().optional(),
}).strict().superRefine((state, ctx) => {
  if (Object.keys(state.attempts).length > 512) ctx.addIssue({ code: 'custom', message: 'Navigation attempts are bounded and cannot evict earlier rolls.' })
  if (state.pendingAttemptId && (!state.attempts[state.pendingAttemptId] || state.attempts[state.pendingAttemptId].result))
    ctx.addIssue({ code: 'custom', message: 'The pending attempt must retain its exact original unresolved check.' })
  for (const [id, attempt] of Object.entries(state.attempts)) if (id !== attempt.input.eventId
    || attempt.baseDc !== WILDERNESS_NAVIGATION_DC[attempt.input.terrain]
    || attempt.paceModifier !== (attempt.input.pace === 'slow' ? 5 : attempt.input.pace === 'fast' ? -5 : 0)
    || !attempt.result && state.pendingAttemptId !== id)
    ctx.addIssue({ code: 'custom', message: 'Navigation witnesses must agree with the actual source terrain, pace and pending check.' })
  const lost = state.lost
  if (lost && (!state.attempts[lost.failedAttemptId]?.result || state.attempts[lost.failedAttemptId].result?.navigationSucceeded !== false
    || lost.delayRoll.notation !== '1d6' || lost.delayRoll.modifier !== 0 || lost.delayRoll.rolls.length !== 1
    || lost.delayRoll.rolls[0] < 1 || lost.delayRoll.rolls[0] > 6 || lost.delayRoll.total !== lost.delayRoll.rolls[0]
    || JSON.stringify(state.attempts[lost.failedAttemptId].result?.delayRoll) !== JSON.stringify(lost.delayRoll)
    || lost.requiredSearchSeconds !== lost.delayRoll.total * 3600 || lost.searchedSeconds > lost.requiredSearchSeconds))
    ctx.addIssue({ code: 'custom', message: 'Being lost requires its actual failed check and one real1d6 search delay; route IDs cannot manufacture or reset it.' })
})
export const TravelBeginSchema = z.object({ eventId: Id, dayStartsAt: z.number().int().nonnegative(),
  knownWalkingSeconds: z.number().int().min(0).max(28800), historyKnown: z.literal(true), source: Source }).strict()
export const TravelRouteInputSchema = z.object({ journeyId: Id, origin: Source, destination: Source,
  distanceFeet: z.number().int().positive().max(528000000), terrain: z.enum(['normal', 'difficult']),
  actualRouteConfirmed: z.literal(true), source: Source }).strict()
export const TravelStepSchema = z.object({ eventId: Id, journeyId: Id, pace: TravelPaceSchema, scale: TravelScaleSchema,
  durationSeconds: z.number().int().min(1).max(28800), stopAtDestination: z.boolean().default(false),
  activity: TravelActivitySchema, rank: TravelRankSchema, openTerrain: z.boolean(),
  perceptionSense:z.enum(['sight','hearing','other']).optional(),
  source: Source }).strict()
const Save = z.object({ eventId: Id, hour: z.number().int().min(9).max(48), dc: z.number().int().min(11).max(50),
  at: z.number().nonnegative(), result: z.record(z.string(), z.unknown()), exhaustionBefore: z.number().int().min(0).max(6),
  exhaustionAfter: z.number().int().min(0).max(6) }).strict()
const Day = z.object({ index: z.number().int().nonnegative(), startsAt: z.number().int().nonnegative(),
  walkingSeconds: z.number().int().min(0).max(TRAVEL_DAY_SECONDS), effectiveWalkingSeconds:z.number().int().min(0).max(TRAVEL_DAY_SECONDS*2).optional(), saves: z.record(z.string(), Save) }).strict()
const Route = TravelRouteInputSchema.extend({ progressedFeet: z.number().nonnegative(),
  status: z.enum(['active', 'distance_complete', 'abandoned']), createdAt: z.number().nonnegative(),
  originMapId: z.string().min(1), originCell: z.object({ x: z.number().int(), y: z.number().int() }).strict() }).strict()
export const TravelStateSchema = z.object({ version: z.literal(1), epochAt: z.number().int().nonnegative(),
  establishedAt: z.number().nonnegative(), initialKnownWalkingSeconds: z.number().int().min(0).max(28800), source: Source,
  activeJourneyId: Id.optional(), routes: z.record(z.string(), Route), days: z.record(z.string(), Day),
  navigation: NavigationState.optional(),
  pendingForcedMarch: z.object({ eventId: Id, dayIndex: z.number().int().nonnegative(), hour: z.number().int().min(9).max(48),
    dc: z.number().int().min(11).max(50), at: z.number().nonnegative() }).strict().optional(),
  receipts: z.record(z.string(), z.object({ command: z.string(), result: z.record(z.string(), z.unknown()) }).strict()),
}).strict().superRefine((state, context) => {
  if (Object.keys(state.routes).length > 128 || Object.keys(state.days).length > 512 || Object.keys(state.receipts).length > 2048)
    context.addIssue({ code: 'custom', message: 'Travel histories are bounded and never discard actual walking or event receipts.' })
  if (state.establishedAt < state.epochAt || state.establishedAt >= state.epochAt + TRAVEL_DAY_SECONDS
    || state.initialKnownWalkingSeconds > state.establishedAt - state.epochAt)
    context.addIssue({ code: 'custom', message: 'The initial known travel belongs to this actual current day and cannot exceed its elapsed time.' })
  const active = Object.values(state.routes).filter(route => route.status === 'active')
  if (active.length !== (state.activeJourneyId ? 1 : 0) || state.activeJourneyId && state.routes[state.activeJourneyId]?.status !== 'active')
    context.addIssue({ code: 'custom', message: 'Exactly the explicit active route can be advanced.' })
  for (const [id, route] of Object.entries(state.routes)) {
    if (route.journeyId !== id || route.progressedFeet > route.distanceFeet || route.status === 'distance_complete' && route.progressedFeet !== route.distanceFeet)
      context.addIssue({ code: 'custom', message: 'Route identity, progress and completion must agree with its established distance.' })
  }
  for (const [key, day] of Object.entries(state.days)) {
    const effective=day.effectiveWalkingSeconds??day.walkingSeconds
    if(effective<day.walkingSeconds||effective>day.walkingSeconds*2)context.addIssue({code:'custom',message:'Effective walking retains actual real walking with only the source altitude multiplier, never extra clock time.'})
    if (key !== String(day.index) || day.startsAt !== state.epochAt + day.index * TRAVEL_DAY_SECONDS)
      context.addIssue({ code: 'custom', message: 'Walking days share one persistent epoch across all routes.' })
    for (let hour = 9; hour <= Math.floor(effective / TRAVEL_HOUR_SECONDS); hour++) {
      const save = day.saves[String(hour)], pending = state.pendingForcedMarch
      if (!save && !(pending?.dayIndex === day.index && pending.hour === hour))
        context.addIssue({ code: 'custom', message: 'Every completed forced-march hour requires its actual save receipt or exact unresolved event.' })
    }
    for (const [hour, save] of Object.entries(day.saves)) if (hour !== String(save.hour) || save.dc !== save.hour + 2
      || save.hour * TRAVEL_HOUR_SECONDS > effective || save.at < day.startsAt || save.at > day.startsAt + TRAVEL_DAY_SECONDS)
      context.addIssue({ code: 'custom', message: 'A forced-march save belongs to one real completed hour, not an arbitrary nonce.' })
  }
  const pending = state.pendingForcedMarch
  if (pending && (!state.days[String(pending.dayIndex)] || pending.dc !== pending.hour + 2
    || (state.days[String(pending.dayIndex)].effectiveWalkingSeconds??state.days[String(pending.dayIndex)].walkingSeconds) < pending.hour * TRAVEL_HOUR_SECONDS
    || (state.days[String(pending.dayIndex)].effectiveWalkingSeconds??state.days[String(pending.dayIndex)].walkingSeconds) > pending.hour * TRAVEL_HOUR_SECONDS+1
    || state.days[String(pending.dayIndex)].saves[String(pending.hour)]))
    context.addIssue({ code: 'custom', message: 'A pending forced-march event is exactly the next unresolved completed hour.' })
})
export type TravelState = z.infer<typeof TravelStateSchema>
export type TravelBeginInput = z.infer<typeof TravelBeginSchema>
export type TravelRouteInput = z.infer<typeof TravelRouteInputSchema>
export type TravelStepInput = z.infer<typeof TravelStepSchema>
export type TravelNavigationInput = z.infer<typeof TravelNavigationInputSchema>
export type NavigationSearchInput = z.infer<typeof NavigationSearchInputSchema>

/** PHB's published rows intentionally remain separate: their rounded daily
 * fast/slow values are not eight times the published hourly values. */
export const TRAVEL_PACE_FEET = {
  slow: { minute: 200, hour: 2 * 5280, day: 18 * 5280 },
  normal: { minute: 300, hour: 3 * 5280, day: 24 * 5280 },
  fast: { minute: 400, hour: 4 * 5280, day: 30 * 5280 },
} as const
export const travelStateOf = (state: GameState): TravelState | undefined => state.dmTools?.travel
export function travelDayAt(state: TravelState, at: number) {
  const index = Math.floor((at - state.epochAt) / TRAVEL_DAY_SECONDS)
  return { index, startsAt: state.epochAt + index * TRAVEL_DAY_SECONDS,
    saved: state.days[String(index)] }
}
export function travelDueIssue(state: GameState) {
  const pending = travelStateOf(state)?.pendingForcedMarch
  return pending ? { code: 'FORCED_MARCH_EVENT_DUE', message: 'Resolve the exact completed forced-march hour before another action, actor or clock advance.', eventId: pending.eventId } : null
}
export function validateTravelState(state: GameState): string[] {
  const travel = travelStateOf(state)
  if (!travel) return []
  const at = state.worldTimeSeconds ?? 0, issues: string[] = []
  if (travel.establishedAt > at) issues.push('Travel tracking cannot be established in the future.')
  for (const day of Object.values(travel.days)) {
    if (day.startsAt > at || day.walkingSeconds > Math.min(TRAVEL_DAY_SECONDS, at - day.startsAt))
      issues.push('Recorded walking cannot exceed real elapsed time in its exact day.')
    for (const save of Object.values(day.saves)) if (save.at > at) issues.push('A forced-march receipt cannot occur in the future.')
  }
  for (const route of Object.values(travel.routes)) if (route.createdAt > at) issues.push('A route cannot be prepared in the future.')
  for (const attempt of Object.values(travel.navigation?.attempts ?? {}))
    if (attempt.at > at || !travel.routes[attempt.input.journeyId]) issues.push('A navigation attempt requires an existing real route and a nonfuture observation.')
  if (travel.navigation?.lost && travel.navigation.lost.firstLostAt > at) issues.push('A lost episode cannot begin in the future.')
  const navigation = travel.navigation
  if (navigation?.pendingAttemptId) {
    const resolution = state.hero?.pending?.command.toolkitResolution as { domain?: string; command?: { eventId?: string } } | undefined
    if (resolution?.domain !== 'travel-navigation' || resolution.command?.eventId !== navigation.pendingAttemptId)
      issues.push('A pending navigation attempt requires its exact actual held check witness.')
  }
  if (navigation?.lost) {
    let measured = 0
    for (const receipt of Object.values(travel.receipts)) {
      const search = receipt.result.navigationSearch as { failedAttemptId?: string } | undefined
      if (search?.failedAttemptId === navigation.lost.failedAttemptId) measured += Number(receipt.result.elapsedSeconds ?? 0)
    }
    if (measured !== navigation.lost.searchedSeconds) issues.push('Navigation search credit requires its actual measured walking receipts, never a waiting interval or guessed history.')
  }
  if (travel.pendingForcedMarch && travel.pendingForcedMarch.at > at) issues.push('A forced-march event cannot become due in the future.')
  return issues
}
