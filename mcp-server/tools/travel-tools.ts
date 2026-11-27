import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { TravelBeginSchema, TravelRouteInputSchema, TravelStepSchema, TravelNavigationInputSchema, NavigationSearchInputSchema } from '../../lib/travel-state'
import { inspectTravel, beginTravelTracking, createTravelRoute, abandonTravelRoute, advanceTravel,
  resolveForcedMarch, registerTravelContinuations, advanceNavigationSearch } from '../travel'
import { resolveTravelNavigation, registerTravelNavigationContinuations } from '../travel-navigation'
import { toolkitTransaction, toolkitResult } from '../toolkit'
const Id = z.string().min(1).max(80)
export function registerTravelTools(server: McpServer) {
  registerTravelContinuations()
  registerTravelNavigationContinuations()
  server.registerTool('inspect_travel', {
    description: 'Read persistent actual walking days, explicit MJ routes/distances, progress, published pace rows, pending forced-march saves and real nutrition day. No clock, roll, token movement, encounter, provision, mount or arrival. Untracked earlier walking remains unknown.',
    inputSchema: { journeyId: Id.optional() }, annotations: { readOnlyHint: true, idempotentHint: true },
  }, async ({ journeyId }) => toolkitTransaction(() => toolkitResult(inspectTravel(journeyId))))
  server.registerTool('begin_travel_tracking', {
    description: 'Establish walking history ONCE from actual known facts: explicit current dayStartsAt, knownWalkingSeconds<=8h and no more than real elapsed time. Active quantified nutrition must already exist. The explicit MJ convention is consecutive24h days from that epoch; new route IDs, rests, nutrition resumes and nonces never reset walking. No invented previous forced saves, food, water or time.',
    inputSchema: TravelBeginSchema.shape,
  }, async input => toolkitTransaction(() => toolkitResult(beginTravelTracking(input))))
  server.registerTool('create_travel_route', {
    description: 'Record one explicit actual MJ-established on-foot route with origin/destination, exact distanceFeet, normal/difficult terrain and source. Player carrier only, one active route. Reusing an ID preserves progress and definition. Route progression is a separate distance ledger: it NEVER changes tactical positions/maps or announces spatial arrival; a real map transition remains a separate explicitly selected tool. No new adventure/character, inferred destination, mount or encounter.',
    inputSchema: TravelRouteInputSchema.shape,
  }, async input => toolkitTransaction(() => toolkitResult(createTravelRoute(input))))
  server.registerTool('advance_travel', {
    description: 'Actually walk one explicitly selected existing route segment and advance real engine time. Choose PHB2014 slow/normal/fast and table scale minute/hour/day explicitly: published rounded daily distances differ from hourly distances. Minute scale whole minutes<=1h; hour scale1–3600seconds; day scale one8h block from zero walking that day. Difficult terrain halves distance; exhaustion speed penalty applies. No bypass of actual capacity, incapacity, nutrition, death-save, affliction or rest-activity history. Stop before the next forced-march save or day boundary. Explicit stopAtDestination may shorten minute/hour duration, rounding upward to a whole second as an engine interpretation. Every completed hour past8h creates its exact due CON save (DC11,12,...), not a roll chosen by nonce. Activity and rank are explicit; fast subtracts5 passive Perception, other tasks contribute no passive threat detection, stealth pace permission requires slow and non-open terrain. This does not resolve stealth, navigation, tracking, foraging or encounters, grant provisions, move tokens or establish spatial arrival.',
    inputSchema: TravelStepSchema.shape,
  }, async input => toolkitTransaction(() => toolkitResult(advanceTravel(input))))
  server.registerTool('resolve_forced_march', {
    description: 'Resolve only the exact actually due forced-march event reported after a completed extra walking hour. Actual player Constitution save through engine/inspiration/exhaustion, failure adds one real2014 exhaustion level. Held save resumes original dice. Completed event replay cannot reroll or alter later state. Simultaneous due nutrition and forced-march events may be explicitly resolved in either MJ-selected order; no printed order is invented. An already dead player closes the due event without a fabricated save or new exhaustion.',
    inputSchema: { eventId: Id },
  }, async ({ eventId }) => toolkitTransaction(() => resolveForcedMarch(eventId)))
  server.registerTool('abandon_travel_route', {
    description: 'Explicitly abandon the exact active route while retaining its progress, walking day, forced saves and receipts. No new time, position, arrival, rest or reset; a later route still shares the same daily history.',
    inputSchema: { eventId: Id, journeyId: Id, reason: z.string().trim().min(1).max(1000) },
  }, async input => toolkitTransaction(() => toolkitResult(abandonTravelRoute(input))))
  server.registerTool('resolve_travel_navigation', {
    description: 'Resolve an explicit MJ-called actual player Wisdom(Survival) wilderness-navigation check for an already-established route away from paths. Exact DMG2014 terrain DC5/10/15; slow pace+5 or fast-5 is a true check modifier. Accurate map aid requires an exact actually-owned inventory instance plus explicit accuracy/source; sun/stars require explicit actual visibility/source. Advantage does not stack and actual exhaustion/inspiration rules still apply. Failure rolls ONE real1d6 and makes the shared traveler lost until that many hours are actually spent searching, then a new real check succeeds. Waiting or changing route/event IDs cannot clear lost or fulfill the search. Held checks preserve original dice through hydration; replay never rerolls or refreshes a delay. No inferred map, sky, direction, position, encounter, vessel, food, token move or arrival.',
    inputSchema: TravelNavigationInputSchema.shape,
  }, async input => toolkitTransaction(() => resolveTravelNavigation(input)))
  server.registerTool('advance_navigation_search', {
    description: 'Actually spend an explicitly chosen1–3600seconds WALKING to regain orientation while the shared traveler is lost. Credits only its persisted real1d6 search delay, never progress toward any destination or a chosen/invented direction. Counts in the SAME walking day and forced-march/nutrition/exhaustion/rest timeline; stop at real save/day/hazard boundaries. A mere advance_time wait never counts as search. Requires an existing route as intended reference, actual capable player and resolved physical load. Exact receipt replays no time; no free arrival, food/water or encounter. Once the required duration is complete, explicitly request the next navigation check.',
    inputSchema: NavigationSearchInputSchema.shape,
  }, async input => toolkitTransaction(() => toolkitResult(advanceNavigationSearch(input))))
}
