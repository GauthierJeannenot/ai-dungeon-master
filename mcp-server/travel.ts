import { TravelBeginSchema, TravelRouteInputSchema, TravelStepSchema, TRAVEL_DAY_SECONDS, TRAVEL_HOUR_SECONDS,
  TRAVEL_PACE_FEET, TRAVEL_DISTANCE_UNITS_PER_FOOT, travelDayAt, travelStateOf, type TravelBeginInput, type TravelRouteInput,
  type TravelStepInput, type TravelState, NavigationSearchInputSchema, type NavigationSearchInput } from '../lib/travel-state'
import { exhaustionEffects, exhaustionLevel } from '../lib/exhaustion'
import { activePhysicalLoad } from '../lib/physical-handling-state'
import { navigationActor, NavigationError } from '../lib/navigation'
import type { SavingThrowResult } from '../lib/types'
import * as gs from './game-state'
import { available, alive, now, hero, effects, advanceHeroTime } from './hero-rules'
import { assertGameTimeAdvance } from './time-preflight'
import { passivePerceptionScore } from './monster-perception'
import { changeExhaustion, inspectExhaustion } from './exhaustion'
import { activeAfflictions } from './afflictions'
import { preflightRestStrenuousInterval, recordRestStrenuousInterval } from './resting'
import { registerCheckedResolution, savedResolution } from './toolkit-checks'
import { toolkitError, toolkitState, toolkitResult } from './toolkit'
import { weatherTravelMultiplier,weatherTravelAcclimationBoundary } from './weather'

const read = (): TravelState => travelStateOf(gs.getState())
  ?? toolkitError('TRAVEL_HISTORY_REQUIRED', 'Establish the actual current walking day and known earlier travel once; no previous travel is inferred.')
const commandOf = (kind: string, input: unknown) => JSON.stringify({ kind, input })
function oldReceipt(eventId: string, command: string) {
  const old = travelStateOf(gs.getState())?.receipts[eventId]
  if (old && old.command !== command) toolkitError('TRAVEL_EVENT_CONFLICT', 'This event ID already records a different exact travel operation.')
  return old ? { ...old.result, replayed: true } : undefined
}
function room() {
  if (Object.keys(read().receipts).length >= 2048) toolkitError('TRAVEL_HISTORY_LIMIT', 'Travel receipts are full; changing IDs cannot discard earlier walking or saves.')
}
function store(eventId: string, command: string, result: Record<string, unknown>) {
  read().receipts[eventId] = { command, result }; return result
}
function outside() {
  available()
  if (gs.getState().phase === 'combat') toolkitError('TRAVEL_IN_COMBAT', 'Use actual tactical movement and turns during combat; this tool does not end or skip them.')
}
function walker() {
  if (!alive(gs.getPlayer()) || gs.getPlayer().deathSaves?.dead) toolkitError('TRAVEL_ACTOR_UNAVAILABLE', 'Only the actual living capable player can walk this route.')
  if (gs.getPlayer().conditions.includes('prone')) toolkitError('TRAVEL_POSTURE_REQUIRED', 'Stand through the real movement procedure before beginning an on-foot walking segment.')
  if (activePhysicalLoad(gs.getState())) toolkitError('TRAVEL_PHYSICAL_LOAD_UNSUPPORTED', 'Use actual paired physical transport or release the held load first; route progress cannot leave its target behind or teleport it.')
  try {
    if (navigationActor(gs.getState(), 'player').speed <= 0) toolkitError('TRAVEL_ACTOR_IMMOBILE', 'The player has no actual walking movement.')
  } catch (error) {
    if (error instanceof NavigationError) toolkitError(error.code, error.message)
    throw error
  }
}
function currentDay() {
  const state = read(), day = travelDayAt(state, now())
  if (day.index < 0) toolkitError('TRAVEL_TIME_HISTORY_INVALID', 'The clock cannot precede the established travel epoch.')
  return { ...day, walkingSeconds: day.saved?.walkingSeconds ?? 0, effectiveWalkingSeconds:day.saved?.effectiveWalkingSeconds??day.saved?.walkingSeconds??0, endsAt: day.startsAt + TRAVEL_DAY_SECONDS }
}
function forcedPreflight() {
  const level = inspectExhaustion('player').level
  if (Object.keys(gs.getState().dmTools?.exhaustion?.receipts ?? {}).length >= 2048)
    toolkitError('EXHAUSTION_RECEIPT_LIMIT', 'A potential real forced-march failure needs a free exhaustion receipt before any travel or die.')
  if (level >= 5 && effects('death-ward', 'player').length)
    toolkitError('EXHAUSTION_DEATH_WARD_ADJUDICATION', 'Resolve the possible forced-march exhaustion interaction with Death Ward before advancing or rolling.')
  return level
}
export function inspectTravel(journeyId?: string) {
  const state = travelStateOf(gs.getState())
  if (!state) return { tracked: false, previousWalking: 'unknown', positionChanged: false, arrivalResolved: false }
  const day = currentDay(), route = journeyId ? state.routes[journeyId] : state.activeJourneyId ? state.routes[state.activeJourneyId] : undefined
  return { tracked: true, epochAt: state.epochAt, day: { index: day.index, startsAt: day.startsAt, endsAt: day.endsAt,
    walkingSeconds: day.walkingSeconds, saves: day.saved?.saves ?? {}, nextForcedMarchAtWalkingSeconds: Math.max(9 * 3600, (Math.floor(day.walkingSeconds / 3600) + 1) * 3600) },
    activeJourneyId: state.activeJourneyId ?? null, route: route ?? null, pendingForcedMarch: state.pendingForcedMarch ?? null,
    navigation: state.navigation ?? null,
    nutrition: gs.getState().dmTools?.survival?.day ?? null, ratesFeet: TRAVEL_PACE_FEET,
    dayConvention: 'Explicit MJ-established consecutive 24-hour windows; new route IDs and rests do not reset walking.',
    positionChanged: false, arrivalResolved: false, worldTimeSeconds: now() }
}
export function beginTravelTracking(input: TravelBeginInput) {
  TravelBeginSchema.parse(input)
  const command = commandOf('begin', input), old = oldReceipt(input.eventId, command)
  if (old) return old
  outside()
  if (travelStateOf(gs.getState())) toolkitError('TRAVEL_ALREADY_TRACKED', 'Travel is initialized only once; no new event, route, rest or nutrition ID resets its established day or walking history.')
  if (input.dayStartsAt > now() || now() >= input.dayStartsAt + TRAVEL_DAY_SECONDS || input.knownWalkingSeconds > now() - input.dayStartsAt)
    toolkitError('TRAVEL_INITIAL_HISTORY_INVALID', 'The explicit current day must contain the actual clock, and known prior walking cannot exceed its real elapsed time; history beyond eight hours requires actual source events and is unsupported as legacy initialization.')
  if (gs.getState().dmTools?.survival?.status !== 'active') toolkitError('NUTRITION_NOT_TRACKED', 'Begin actual quantified standard nutrition tracking first; travel never creates food, water or earlier meals.')
  toolkitState().travel = { version: 1, epochAt: input.dayStartsAt, establishedAt: now(), initialKnownWalkingSeconds: input.knownWalkingSeconds,
    source: input.source, routes: {}, days: { '0': { index: 0, startsAt: input.dayStartsAt, walkingSeconds: input.knownWalkingSeconds, saves: {} } }, receipts: {} }
  return store(input.eventId, command, { success: true, ...inspectTravel() })
}
export function createTravelRoute(input: TravelRouteInput) {
  TravelRouteInputSchema.parse(input)
  const state = read(), old = state.routes[input.journeyId]
  if (old) {
    const { progressedFeet: _progress, status: _status, createdAt: _at, originMapId: _map, originCell: _cell, ...definition } = old
    if (JSON.stringify(definition) !== JSON.stringify(input)) toolkitError('TRAVEL_ROUTE_CONFLICT', 'This route ID retains another source distance or definition; no old progress is reset.')
    return { replayed: true, route: structuredClone(old), positionChanged: false, arrivalResolved: false }
  }
  outside(); walker()
  if (state.activeJourneyId) toolkitError('TRAVEL_ROUTE_ACTIVE', 'Complete or explicitly abandon the exact active route before creating another one; its walking day remains shared.')
  if (Object.keys(state.routes).length >= 128) toolkitError('TRAVEL_ROUTE_LIMIT', 'The 128-route history is full; existing route records are not discarded.')
  state.routes[input.journeyId] = { ...input, progressedFeet: 0, status: 'active', createdAt: now(),
    originMapId: gs.getState().currentMapId!, originCell: { ...gs.getPlayer().position } }
  state.activeJourneyId = input.journeyId
  return { success: true, route: structuredClone(state.routes[input.journeyId]), positionChanged: false, arrivalResolved: false,
    support: 'Progress and real elapsed walking time only. A completed distance does not change any token, map, adventure or character, and is not a spatial arrival.' }
}
export function abandonTravelRoute(input: { eventId: string; journeyId: string; reason: string }) {
  const command = commandOf('abandon', input), old = oldReceipt(input.eventId, command)
  if (old) return old
  outside(); room()
  const state = read(), route = state.routes[input.journeyId]
  if (!route || state.activeJourneyId !== input.journeyId) toolkitError('TRAVEL_ROUTE_REQUIRED', 'Choose the exact currently active route.')
  route.status = 'abandoned'; delete state.activeJourneyId
  return store(input.eventId, command, { success: true, route: structuredClone(route), walkingDay: inspectTravel().day,
    positionChanged: false, arrivalResolved: false })
}
function planStep(input: TravelStepInput, navigationSearch = false) {
  const state = read(), route = state.routes[input.journeyId]
  if (!route || !navigationSearch && (state.activeJourneyId !== input.journeyId || route.status !== 'active')) toolkitError('TRAVEL_ROUTE_REQUIRED', 'Choose the exact existing active route and its established distance.')
  if (state.navigation?.pendingAttemptId) toolkitError('TRAVEL_NAVIGATION_PENDING', 'Finish the exact held navigation check before any walking interval.')
  if (state.navigation?.lost && !navigationSearch) toolkitError('TRAVEL_LOST', 'The player is actually lost. Resolve the measured search and subsequent navigation check before crediting progress toward any route destination.')
  if (navigationSearch && (!state.navigation?.lost || state.navigation.lost.searchedSeconds >= state.navigation.lost.requiredSearchSeconds))
    toolkitError('NAVIGATION_SEARCH_NOT_REQUIRED', 'Only an actual lost episode with an incomplete source1d6 search delay can credit this search interval.')
  if (gs.getState().dmTools?.survival?.status !== 'active') toolkitError('NUTRITION_NOT_TRACKED', 'Actual active nutrition tracking is required; this step does not resume post-death nutrition or provide supplies.')
  const day = currentDay(), level = exhaustionLevel(gs.getState(), 'player')
  if (input.scale === 'day' && (input.durationSeconds !== 28800 || day.walkingSeconds !== 0 || input.stopAtDestination))
    toolkitError('TRAVEL_DAY_SCALE_REQUIRED', 'The published daily row is exactly one eight-hour block from zero walking in this day; choose minute/hour scale for partial travel or explicit early stopping.')
  if (input.scale === 'minute' && (input.durationSeconds > 3600 || input.durationSeconds % 60 !== 0)
    || input.scale === 'hour' && input.durationSeconds > 3600)
    toolkitError('TRAVEL_SCALE_DURATION', 'Minute-scale segments use whole minutes up to one hour; hour-scale segments use 1–3600 real seconds. The table rows are not silently interchanged.')
  if (input.activity === 'forage' && input.pace === 'fast') toolkitError('TRAVEL_FORAGE_PACE', 'DMG2014 foraging while traveling requires normal or slow pace; this step never grants food or water.')
  const scaleSeconds = input.scale === 'minute' ? 60 : input.scale === 'hour' ? 3600 : 28800
  const terrainMultiplier = route.terrain === 'difficult' ? 0.5 : 1
  const speedMultiplier = exhaustionEffects(level).speedMultiplier
  const unitsPerSecond = TRAVEL_PACE_FEET[input.pace][input.scale] * (TRAVEL_DISTANCE_UNITS_PER_FOOT / scaleSeconds) * terrainMultiplier * speedMultiplier
  if (unitsPerSecond <= 0) toolkitError('TRAVEL_ACTOR_IMMOBILE', 'Actual exhaustion leaves no walking speed.')
  const remainingUnits = route.distanceFeet * TRAVEL_DISTANCE_UNITS_PER_FOOT - Math.round(route.progressedFeet * TRAVEL_DISTANCE_UNITS_PER_FOOT)
  let seconds = input.durationSeconds, distanceUnits = unitsPerSecond * seconds
  if (!navigationSearch && distanceUnits > remainingUnits) {
    if (!input.stopAtDestination) toolkitError('TRAVEL_ROUTE_DISTANCE_EXCEEDED', 'This duration exceeds the established remaining distance; explicitly choose stopAtDestination or a shorter segment.')
    seconds = Math.ceil(remainingUnits / unitsPerSecond)
    distanceUnits = remainingUnits
  }
  if (navigationSearch) {
    if (seconds > state.navigation!.lost!.requiredSearchSeconds - state.navigation!.lost!.searchedSeconds)
      toolkitError('NAVIGATION_SEARCH_DURATION_EXCEEDED', 'Choose no more than the actual remaining measured search duration before the next explicit navigation check.')
    distanceUnits = 0
  }
  const distanceFeet = distanceUnits / TRAVEL_DISTANCE_UNITS_PER_FOOT
  if (now() + seconds > day.endsAt) toolkitError('TRAVEL_DAY_BOUNDARY', `This segment crosses the established walking-day boundary; advance at most ${day.endsAt - now()} seconds before selecting a new segment.`)
  const altitudeMultiplier=weatherTravelMultiplier(),acclimationBoundary=weatherTravelAcclimationBoundary()
  if(acclimationBoundary!==undefined&&seconds>acclimationBoundary)toolkitError('TRAVEL_ALTITUDE_ACCLIMATION_BOUNDARY',`Stop after ${acclimationBoundary} actual seconds at the real acclimation boundary before the travel multiplier changes.`)
  const nextForcedSeconds = Math.max(9 * TRAVEL_HOUR_SECONDS, (Math.floor(day.effectiveWalkingSeconds / TRAVEL_HOUR_SECONDS) + 1) * TRAVEL_HOUR_SECONDS)
  const realSecondsToForced=Math.ceil((nextForcedSeconds-day.effectiveWalkingSeconds)/altitudeMultiplier)
  if(seconds>realSecondsToForced)toolkitError('FORCED_MARCH_BOUNDARY',`Stop after ${realSecondsToForced} actual walking seconds at the next effective forced-march hour; no source save is skipped.`)
  const forcedHour = day.effectiveWalkingSeconds + seconds*altitudeMultiplier >= nextForcedSeconds ? nextForcedSeconds / 3600 : undefined
  if (forcedHour) forcedPreflight()
  // Travel cannot award walking through a known interruption that requires an
  // explicit source resolution; ordinary clock tools remain available to reach it.
  if (gs.getState().dmTools?.breathing?.creatures.player?.episode)
    toolkitError('TRAVEL_BREATHING_CONTEXT_UNSUPPORTED', 'Resolve the actual unavailable-air context before ordinary overland walking; this tool does not model underwater or breath-held route travel.')
  if (activeAfflictions('player').some(record => !record.petrificationPause && record.nextAt !== undefined && record.nextAt < now() + seconds))
    toolkitError('TRAVEL_AFFLICTION_BOUNDARY', 'Reach and resolve the actual source affliction event before walking past its interruption; no whole segment is credited through it.')
  return { state, route, day, seconds, distanceFeet, distanceUnits, terrainMultiplier, speedMultiplier, forcedHour,altitudeMultiplier }
}
export function advanceTravel(input: TravelStepInput, navigationSearch = false) {
  input = TravelStepSchema.parse(input)
  const command = commandOf(navigationSearch ? 'navigation_search' : 'step', input), old = oldReceipt(input.eventId, command)
  if (old) return old
  outside(); walker(); room()
  const plan = planStep(input, navigationSearch), from = now()
  assertGameTimeAdvance(plan.seconds)
  preflightRestStrenuousInterval()
  const rawPerception = input.activity === 'watch' ? passivePerceptionScore(gs.getPlayer(),gs.getState(),false,false,input.perceptionSense) : null
  const passivePerception = rawPerception === null ? null : rawPerception - (input.pace === 'fast' ? 5 : 0)
  const naturalRecoveries = advanceHeroTime(plan.seconds)
  recordRestStrenuousInterval({ eventId: `travel:${input.eventId}`, from, to: now(), reason: `Actual on-foot travel on established route ${input.journeyId}.` })
  const day = plan.state.days[String(plan.day.index)] ??= { index: plan.day.index, startsAt: plan.day.startsAt, walkingSeconds: 0, saves: {} }
  day.effectiveWalkingSeconds=(day.effectiveWalkingSeconds??day.walkingSeconds)+plan.seconds*plan.altitudeMultiplier
  day.walkingSeconds += plan.seconds
  if (navigationSearch) plan.state.navigation!.lost!.searchedSeconds += plan.seconds
  else {
    plan.route.progressedFeet = Math.min(plan.route.distanceFeet,
      (Math.round(plan.route.progressedFeet * TRAVEL_DISTANCE_UNITS_PER_FOOT) + plan.distanceUnits) / TRAVEL_DISTANCE_UNITS_PER_FOOT)
    if (plan.route.progressedFeet === plan.route.distanceFeet) { plan.route.status = 'distance_complete'; delete plan.state.activeJourneyId }
  }
  if (plan.forcedHour) plan.state.pendingForcedMarch = { eventId: `forced-march:${plan.day.index}:${plan.forcedHour}`,
    dayIndex: plan.day.index, hour: plan.forcedHour, dc: plan.forcedHour + 2, at: now() }
  return store(input.eventId, command, { success: true, journeyId: input.journeyId, scale: input.scale, pace: input.pace,
    elapsedSeconds: plan.seconds, distanceFeet: plan.distanceFeet, progressedFeet: plan.route.progressedFeet, remainingFeet: plan.route.distanceFeet - plan.route.progressedFeet,
    routeStatus: plan.route.status, walkingSecondsThisDay: day.walkingSeconds,effectiveWalkingSecondsThisDay:day.effectiveWalkingSeconds,altitudeMultiplier:plan.altitudeMultiplier,
    effectiveTimeRounding:'Round an actual partial-second boundary upward to one whole real second; retain at most one effective second of overshoot (engine precision interpretation).', forcedMarchEvent: plan.state.pendingForcedMarch ?? null,
    ...(navigationSearch ? { navigationSearch: { ...plan.state.navigation!.lost!, directionChosen: false } } : {}),
    activity: input.activity, rank: input.rank, passivePerception, contributesToThreatDetection: input.activity === 'watch' && passivePerception !== null,
    perceptionSense:input.perceptionSense??null,
    stealthPacePermits: input.pace === 'slow' && !input.openTerrain, stealthResolved: false, activityResolved: false,
    timeRounding: input.stopAtDestination ? 'Explicit early stop rounds the required travel time upward to a whole second; engine interpretation.' : 'Whole seconds requested explicitly.',
    terrainMultiplier: plan.terrainMultiplier, exhaustionMultiplier: plan.speedMultiplier, naturalRecoveries,
    travelObservation: { mapId: gs.getState().currentMapId!, cell: { ...gs.getPlayer().position },
      walkingSeconds: Object.values(plan.state.days).reduce((sum, recorded) => sum + recorded.walkingSeconds, 0) },
    worldTimeSeconds: now(), positionChanged: false, arrivalResolved: false })
}
export function advanceNavigationSearch(input: NavigationSearchInput) {
  input = NavigationSearchInputSchema.parse(input)
  return advanceTravel({ ...input, scale: 'hour', stopAtDestination: false, activity: 'navigate', openTerrain: true }, true)
}
function finishForcedMarch(saved: SavingThrowResult | undefined) {
  const state = read(), pending = state.pendingForcedMarch!
  const before = exhaustionLevel(gs.getState(), 'player'), dead = Boolean(gs.getPlayer().deathSaves?.dead)
  if (saved && !saved.success && !dead) changeExhaustion({ targetId: 'player', eventId: `\u0000forced-march:${pending.dayIndex}:${pending.hour}`,
    operation: 'add', levels: 1, reason: `PHB2014 Forced March: actual day ${pending.dayIndex}, completed walking hour ${pending.hour}, CON DC${pending.dc}.` })
  const result = { success: true, eventId: pending.eventId, dayIndex: pending.dayIndex, hour: pending.hour, dc: pending.dc,
    save: saved ?? null, notRolled: !saved, ...(dead && !saved ? { reason: 'Actual player death occurred before resolving this completed-hour event.' } : {}),
    exhaustionBefore: before, exhaustionAfter: exhaustionLevel(gs.getState(), 'player'), died: Boolean(gs.getPlayer().deathSaves?.dead) }
  state.days[String(pending.dayIndex)].saves[String(pending.hour)] = { eventId: pending.eventId, hour: pending.hour, dc: pending.dc,
    at: now(), result, exhaustionBefore: before, exhaustionAfter: result.exhaustionAfter }
  delete state.pendingForcedMarch
  return toolkitResult(result)
}
export function registerTravelContinuations() {
  registerCheckedResolution('forced-march', (command, checked) => {
    const pending = read().pendingForcedMarch
    if (!pending || command.eventId !== pending.eventId || !('ability' in checked) || checked.entityId !== 'player' || checked.ability !== 'con' || checked.dc !== pending.dc)
      toolkitError('FORCED_MARCH_CONTINUATION_MISMATCH', 'Resume only the actual original Constitution save for this exact completed walking hour.')
    return finishForcedMarch(checked as SavingThrowResult)
  })
}
export function resolveForcedMarch(eventId: string) {
  const state = read()
  for (const day of Object.values(state.days)) for (const save of Object.values(day.saves)) if (save.eventId === eventId)
    return toolkitResult({ ...save.result, replayed: true })
  const pending = state.pendingForcedMarch
  if (!pending || pending.eventId !== eventId) toolkitError('FORCED_MARCH_EVENT_REQUIRED', 'Choose the exact actually due completed-hour event, never a new nonce or a future hour.')
  const held = hero().pending, resolution = held?.command.toolkitResolution as { domain?: string; command?: { eventId?: string } } | undefined
  if (held && resolution?.domain === 'forced-march' && resolution.command?.eventId === eventId)
    return toolkitResult({ pendingReaction: held })
  available({ allowTravelDue: true, allowNutritionDue: true, allowWeatherDue:true, allowCasting:true, allowFrigidWaterDue:true })
  if (gs.getPlayer().deathSaves?.dead) return finishForcedMarch(undefined)
  forcedPreflight()
  return savedResolution({ entityId: 'player', ability: 'con', dc: pending.dc }, { domain: 'forced-march', command: { eventId } })
}
