import {
  AbandonGamblingSchema, GAMBLING_CHECK_DOMAIN, GAMBLING_CHECKS, GAMBLING_DAY_SECONDS, PayGamblingDebtSchema, gamblingCheckInput,
  ResolveGamblingSchema, SettleGamblingSchema, StartGamblingSchema, WorkGamblingSchema, gamblingDay,
  gamblingDebtBalance, gamblingReceiptWitness, gamblingReturn, gamblingWitness, openGamblingWeek, validGamblingStake,
  validateXgeGamblingState, type GamblingWeek,
} from '../lib/xge-gambling-state'
import { COIN_IDS, CoinsSchema, copperValue, emptyCoins, type Coins } from '../lib/srd/currency'
import { AFFLICTIONS } from '../lib/srd/afflictions'
import { downtimeIntervalIssue } from '../lib/downtime-ledger'
import { entityGroundContact, entityVerticalContext } from '../lib/jumping-state'
import { fullyImmersedInWater } from '../lib/underwater-rules'
import { breathingActivityIssue } from '../lib/activity-preflight'
import { groundGearRecoveryActivityIssue } from '../lib/ground-gear-recovery-state'
import type { AbilityCheckResult, GameState } from '../lib/types'
import { advanceHeroTime, available, now } from './hero-rules'
import { assertGameTimeAdvance } from './time-preflight'
import { assertCarryingAcquisition } from './carrying'
import { afterInventoryChange } from './equipment'
import { checkedResolution, registerCheckedResolution } from './toolkit-checks'
import { readXgeGamblingSource } from './rules-library'
import { rollDice } from './dice'
import { assertToolkitReach, toolkitError, toolkitResult, toolkitState } from './toolkit'
import * as gs from './game-state'
import * as rules from './rules'

const same = (a: unknown, b: unknown) => gamblingWitness(a) === gamblingWitness(b)
const weeks = () => gs.getState().dmTools?.xgeGambling?.weeks ?? []
const stamp = <T extends object>(body: T) => ({ ...body, command: gamblingWitness(body) })

function currentResult(week: GamblingWeek, replayed: boolean) {
  return { success: true, replayed, weekId: week.start.input.eventId, week, debtBalanceCp: gamblingDebtBalance(week) }
}

function replay(input: { eventId: string }) {
  for (const week of weeks()) {
    const prior = [week.start, ...week.segments, week.resolution, week.settlement, ...week.payments, week.abandonment]
      .find(receipt => receipt?.input.eventId === input.eventId)
    if (!prior) continue
    if (!same(prior.input, input)) toolkitError('XGE_GAMBLING_EVENT_CONFLICT', 'Keep the exact original wager, week or transfer for that event identity.')
    return { ...currentResult(week, true), event: prior,
      ...(prior === week.resolution && week.resolution?.heldWitness ? { pendingReaction: gs.getState().hero?.pending } : {}) }
  }
}

function ready() {
  const state = gs.getState()
  if (state.phase === 'combat' || state.dmTools?.rests?.active || Object.values(state.dmTools?.travel?.routes ?? {}).some(route => route.status === 'active'))
    toolkitError('XGE_GAMBLING_DOWNTIME_REQUIRED', 'Choose an available actual period outside initiative, rest or a journey.')
  available()
  rules.validateActionUse('player')
}

function requireWeek(id: string) {
  const week = weeks().find(entry => entry.start.input.eventId === id)
  if (!week) toolkitError('XGE_GAMBLING_WEEK_REQUIRED', 'Choose the actual retained gambling workweek.')
  return week
}

function requireVenue(site: GamblingWeek['start']['site']) {
  const state = gs.getState()
  if (state.currentMapId !== site.mapId || state.currentRoomId !== site.roomId
    || entityGroundContact(state, 'player', site.cell, site.zFeet).contact !== true
    || state.player.position.x !== site.cell.x || state.player.position.y !== site.cell.y
    || fullyImmersedInWater(state, { kind: 'creature', entityId: 'player' }) !== false)
    toolkitError('XGE_GAMBLING_VENUE_REQUIRED', 'Return to the actual original supported dry gambling venue.')
  assertToolkitReach({ ...site, surfaceZFeet: site.zFeet })
}

function requireCreditor(id: string) {
  const state = gs.getState()
  const npc = state.npcs?.[id]
  if (!npc?.visible || npc.isAlive === false || npc.hp?.current === 0 || !npc.roomId
    || npc.conditions?.some(condition => ['dead', 'unconscious', 'incapacitated', 'petrified', 'paralyzed', 'stunned'].includes(condition)))
    toolkitError('XGE_GAMBLING_CREDITOR_REQUIRED', 'Choose the actual present and capable venue representative or original creditor.')
  const vertical = entityVerticalContext(state, id)
  if (!vertical.known || vertical.zFeet === null || vertical.airborne)
    toolkitError('XGE_GAMBLING_CREDITOR_REQUIRED', 'Establish the original creditor on a reachable actual support.')
  assertToolkitReach({ mapId: npc.mapId ?? state.currentMapId!, roomId: npc.roomId, cell: npc.position, surfaceZFeet: vertical.zFeet })
}

function walletAfter(coins: Coins, direction: 1 | -1) {
  const wallet = { ...(gs.getState().dmTools?.wallet ?? emptyCoins()) }
  for (const coin of COIN_IDS) wallet[coin] += direction * coins[coin]
  if (!CoinsSchema.safeParse(wallet).success)
    toolkitError('XGE_GAMBLING_WALLET_REQUIRED', 'Choose actual available payment denominations or a representable receipt.')
  if (direction === 1) assertCarryingAcquisition({ walletAfter: wallet })
  return wallet
}

export function validateXgeGamblingSource(state: GameState) {
  const history = state.dmTools?.xgeGambling?.weeks
  if (!history?.length) return []
  const expected = readXgeGamblingSource()
  return history.every(week => same(week.start.source, expected)) ? [] : ['Retain the original supplied Xanathar gambling source.']
}

export function startXgeGambling(raw: unknown) {
  const input = StartGamblingSchema.parse(raw), old = replay(input)
  if (old) return old
  ready()
  const state = gs.getState()
  if (weeks().length >= 64 || openGamblingWeek(state))
    toolkitError('XGE_GAMBLING_OPEN_WEEK', 'Complete and resolve or explicitly abandon the actual earlier workweek before a new stake.')
  if (!validGamblingStake(copperValue(input.paid)))
    toolkitError('XGE_GAMBLING_STAKE_REQUIRED', 'Choose actual coins worth 10–1,000 gp and divisible into two whole copper amounts.')
  const fact = state.worldFacts?.find(value => value.id === input.venueFactId)
  const vertical = entityVerticalContext(state, 'player'), cell = { ...state.player.position }
  if (!fact || fact.source !== 'record_scene_fact' || fact.expires !== 'never' || fact.clueId || fact.subjectItemId
    || !state.currentMapId || !state.currentRoomId || fact.mapId !== state.currentMapId || fact.roomId !== state.currentRoomId
    || !same(fact.narrativeEffect?.cell, cell) || !vertical.known || vertical.zFeet === null)
    toolkitError('XGE_GAMBLING_VENUE_REQUIRED', 'Choose a durable fact qualifying the real gambling venue at this supported location.')
  const site = { mapId: state.currentMapId, roomId: state.currentRoomId, cell, zFeet: vertical.zFeet }
  requireVenue(site)
  requireCreditor(input.creditorId)
  const wallet = walletAfter(input.paid, -1)
  const start = stamp({ input, at: now(), site, venueFact: { ...structuredClone(fact) }, source: readXgeGamblingSource() })
  const week: GamblingWeek = { start, segments: [], payments: [] }
  const data = toolkitState()
  data.wallet = wallet
  ;(data.xgeGambling ??= { version: 1, weeks: [] }).weeks.push(week)
  afterInventoryChange()
  return { ...currentResult(week, false), event: start }
}

export function workXgeGambling(raw: unknown) {
  const input = WorkGamblingSchema.parse(raw), old = replay(input)
  if (old) return old
  ready()
  const week = requireWeek(input.weekId), state = gs.getState()
  if (week.abandonment || week.segments.length >= 5)
    toolkitError('XGE_GAMBLING_EFFORT_COMPLETE', 'Only the original open week can receive a new actual block.')
  requireVenue(week.start.site)
  const from = now(), to = from + GAMBLING_DAY_SECONDS, day = gamblingDay(from)
  if (to > (day + 1) * 86400 || week.segments.some(entry => entry.day === day)
    || week.segments[0] && day > week.segments[0].day + 9)
    toolkitError('XGE_GAMBLING_WORKDAY_REQUIRED', 'Choose one distinct full eight-hour block on a real date within the supported ten-date window.')
  const ledgerIssue = downtimeIntervalIssue(state, from, GAMBLING_DAY_SECONDS, true)
  if (ledgerIssue) toolkitError('DOWNTIME_SHARED_DAY_REQUIRED', ledgerIssue)
  const activity = breathingActivityIssue(state, 'player', GAMBLING_DAY_SECONDS)
    ?? groundGearRecoveryActivityIssue(state, GAMBLING_DAY_SECONDS)
  if (activity) toolkitError(activity.code, activity.message)
  if (Object.values(state.dmTools?.afflictions?.records ?? {}).some(record => record.targetId === 'player'
    && AFFLICTIONS[record.templateId].kind === 'poison' && ['active', 'pending'].includes(record.status)
    && !record.petrificationPause && record.nextAt !== undefined && record.nextAt < to))
    toolkitError('XGE_GAMBLING_AFFLICTION_BOUNDARY', 'Resolve the actual earlier poison event before starting an uninterrupted workday.')
  assertGameTimeAdvance(GAMBLING_DAY_SECONDS)
  const event = stamp({ input, from, to, day })
  advanceHeroTime(GAMBLING_DAY_SECONDS)
  week.segments.push(event)
  return { ...currentResult(week, false), event, seconds: GAMBLING_DAY_SECONDS }
}

function requireGamingSet(set: NonNullable<NonNullable<GamblingWeek['resolution']>['input']['gamingSet']>) {
  const player = gs.getPlayer()
  if (!player.inventory.some(item => item.id === set.itemId && item.equipmentId === set.equipmentId)
    || !player.toolProficiencies?.includes(set.equipmentId))
    toolkitError('XGE_GAMBLING_SET_REQUIRED', 'Choose the actual owned canonical set and actual matching proficiency.')
}

function nextGamblingCheck(week: GamblingWeek): ReturnType<typeof toolkitResult> {
  const resolution = week.resolution!, index = resolution.checks.length
  const result = checkedResolution({ ...gamblingCheckInput(resolution.input, index)!, entityId: 'player', dc: resolution.dcs[index].total, sourceGamblingCheck: true },
    { domain: GAMBLING_CHECK_DOMAIN, command: { weekId: week.start.input.eventId } })
  if (!resolution.outcome && gs.getState().hero?.pending && !resolution.heldWitness) {
    resolution.heldWitness = gamblingWitness(gs.getState().hero!.pending)
    resolution.command = gamblingReceiptWitness(resolution)
  }
  return result
}

export function resolveXgeGambling(raw: unknown) {
  const input = ResolveGamblingSchema.parse(raw), old = replay(input)
  if (old) return toolkitResult(old)
  ready()
  const week = requireWeek(input.weekId)
  if (week.abandonment || week.segments.length !== 5 || week.resolution)
    toolkitError('XGE_GAMBLING_RESOLUTION_REQUIRED', 'Complete five actual workdays and keep the original single resolution.')
  requireVenue(week.start.site)
  let setFact: Record<string, unknown> | undefined
  if (input.gamingSet) {
    const set = input.gamingSet
    requireGamingSet(set)
    const fact = gs.getState().worldFacts?.find(value => value.id === set.factId)
    if (!fact || fact.source !== 'record_scene_fact' || fact.clueId || fact.subjectItemId
      || fact.mapId !== week.start.site.mapId || fact.roomId !== week.start.site.roomId
      || !same(fact.narrativeEffect?.cell, week.start.site.cell) || new Set(set.replaceSkills).size !== set.replaceSkills.length)
      toolkitError('XGE_GAMBLING_GAME_FACT_REQUIRED', 'Choose a local fact qualifying this game set and unique checks to replace.')
    setFact = { ...structuredClone(fact) }
  }
  week.resolution = stamp({ input, at: now(), ...(setFact ? { setFact } : {}), dcs: GAMBLING_CHECKS.map(() => ({ ...rollDice('2d10+5') })), checks: [] })
  return nextGamblingCheck(week)
}

function finishGamblingCheck(command: Record<string, unknown>, check: AbilityCheckResult) {
  const week = requireWeek(String(command.weekId)), resolution = week.resolution!
  const source = GAMBLING_CHECKS[resolution.checks.length]
  if (!source || check.label !== source.label || check.ability !== source.ability
    || check.dc !== resolution.dcs[resolution.checks.length].total || typeof check.success !== 'boolean')
    toolkitError('XGE_GAMBLING_CHECK_CHANGED', 'Keep the exact pending check, DC and source ability.')
  delete resolution.heldWitness
  const mechanicalSummary = `${source.label}: ${check.roll.detail} vs DD ${check.dc} -> ${check.success ? 'SUCCES' : 'ECHEC'}`
  resolution.checks.push({ ...check, roll: { ...check.roll }, entityId: 'player', ability: source.ability, label: source.label,
    dc: resolution.dcs[resolution.checks.length].total, success: check.success, mechanicalSummary })
  if (resolution.checks.length < 3) return nextGamblingCheck(week)
  const successes = resolution.checks.filter(entry => entry.success).length
  const stakeCp = copperValue(week.start.input.paid), chance = { ...rollDice('1d100') }
  const roll = chance.total <= 10 ? { ...rollDice('1d6') } : undefined
  resolution.outcome = { successes, returnCp: gamblingReturn(stakeCp, successes), debtCp: successes === 0 ? stakeCp : 0,
    chance, ...(roll ? { example: { roll, text: week.start.source.examples[roll.total - 1] } } : {}) }
  resolution.command = gamblingReceiptWitness(resolution)
  return toolkitResult({ ...currentResult(week, false), event: resolution })
}

export function validateHeldGamblingCheck(command: Record<string, unknown>) {
  const continuation = command.toolkitResolution as { domain?: string } | undefined
  if (continuation?.domain !== GAMBLING_CHECK_DOMAIN) return
  const week = openGamblingWeek(gs.getState())
  if (week?.resolution?.input.gamingSet) requireGamingSet(week.resolution.input.gamingSet)
  const issues = validateXgeGamblingState(gs.getState())
  if (issues.length) toolkitError('XGE_GAMBLING_CHECK_CHANGED', issues.join(' '))
}

export function registerGamblingResolution() {
  registerCheckedResolution(GAMBLING_CHECK_DOMAIN, (command, result) => finishGamblingCheck(command, result as AbilityCheckResult))
}

export function settleXgeGambling(raw: unknown) {
  const input = SettleGamblingSchema.parse(raw), old = replay(input)
  if (old) return old
  ready()
  const week = requireWeek(input.weekId), due = week.resolution?.outcome?.returnCp
  if (!due || week.settlement || copperValue(input.received) !== due)
    toolkitError('XGE_GAMBLING_EXACT_RETURN_REQUIRED', 'Receive exactly the original gross return, in explicitly chosen coins, once.')
  requireVenue(week.start.site)
  requireCreditor(week.start.input.creditorId)
  const wallet = walletAfter(input.received, 1), event = stamp({ input, at: now() })
  toolkitState().wallet = wallet
  week.settlement = event
  afterInventoryChange()
  return { ...currentResult(week, false), event }
}

export function payXgeGamblingDebt(raw: unknown) {
  const input = PayGamblingDebtSchema.parse(raw), old = replay(input)
  if (old) return old
  ready()
  const week = requireWeek(input.weekId), amount = copperValue(input.paid)
  if (input.creditorId !== week.start.input.creditorId || amount <= 0 || amount > gamblingDebtBalance(week) || week.payments.length >= 64 || week.payments.length === 63 && amount !== gamblingDebtBalance(week))
    toolkitError('XGE_GAMBLING_DEBT_PAYMENT_REQUIRED', 'Pay the original creditor at most the actual outstanding amount, in real coins. The last retained installment must close the balance.')
  requireCreditor(input.creditorId)
  const wallet = walletAfter(input.paid, -1), event = stamp({ input, at: now() })
  toolkitState().wallet = wallet
  week.payments.push(event)
  afterInventoryChange()
  return { ...currentResult(week, false), event }
}

export function abandonXgeGambling(raw: unknown) {
  const input = AbandonGamblingSchema.parse(raw), old = replay(input)
  if (old) return old
  ready()
  const week = requireWeek(input.weekId)
  if (week.abandonment || week.segments.length === 5 || week.resolution)
    toolkitError('XGE_GAMBLING_ABANDONMENT_UNAVAILABLE', 'A completed or resolved week cannot erase its outcome or debt.')
  week.abandonment = stamp({ input, at: now() })
  return { ...currentResult(week, false), event: week.abandonment }
}

export function inspectXgeGambling() {
  return { readOnly: true, weeks: weeks().map(week => currentResult(week, false)), source: readXgeGamblingSource() }
}
