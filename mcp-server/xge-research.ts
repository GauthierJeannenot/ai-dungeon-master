import {
  AdoptXgeResearchSchema, StartXgeResearchSchema, WorkXgeResearchSchema, ResolveXgeResearchSchema,
  SettleXgeResearchSchema, CancelXgeResearchSchema, researchWitness, researchProjects, researchDays,
  researchDeadline, researchDay, researchBonus, researchLoreCount, researchProfile, remainingResearchLore,
  type ResearchEvent, type ResearchProject, type XgeResearchState,
} from '../lib/xge-research-state'
import { COIN_IDS, copperValue, emptyCoins, type Coins } from '../lib/srd/currency'
import { downtimeIntervalIssue } from '../lib/downtime-ledger'
import { entityVerticalContext } from '../lib/jumping-state'
import { breathingActivityIssue } from '../lib/activity-preflight'
import { swallowedBy } from '../lib/swallow-state'
import type { AbilityCheckResult, GameState } from '../lib/types'
import { readXgeResearchSource } from './rules-library'
import { assertToolkitReach, toolkitError, toolkitResult, toolkitState } from './toolkit'
import { checkedResolution, registerCheckedResolution } from './toolkit-checks'
import { available, advanceHeroTime, now } from './hero-rules'
import { assertGameTimeAdvance } from './time-preflight'
import { preflightRestStrenuousInterval, recordRestMeasuredActivityInterval } from './resting'
import { assertCarryingAcquisition } from './carrying'
import { rollDice } from './dice'
import * as gs from './game-state'
import * as rules from './rules'

const same = (a: unknown, b: unknown) => researchWitness(a) === researchWitness(b)
const data = () => gs.getState().dmTools?.xgeResearch
  ?? toolkitError('XGE_RESEARCH_NOT_ADOPTED', 'Explicitly adopt Research for this campaign first.')
const projects = () => researchProjects(data().events)
const capacity = (needed = 1) => {
  if (data().events.length + needed > 4095) toolkitError('XGE_RESEARCH_HISTORY_LIMIT', 'Research keeps its original history and reserves space to finish the paid week.')
}
const project = (id: string) => projects().get(id)
  ?? toolkitError('XGE_RESEARCH_PROJECT_REQUIRED', 'Choose the exact existing Research project.')

function ready() {
  if (gs.getState().phase === 'combat') toolkitError('XGE_RESEARCH_OUTSIDE_COMBAT', 'Research uses actual downtime outside combat.')
  available()
  rules.validateActionUse('player')
}

function fact(id: string) {
  const value = gs.getState().worldFacts?.find(f => f.id === id)
  if (!value || value.expires !== 'never' || value.clueId || value.subjectItemId)
    toolkitError('XGE_RESEARCH_FACT_REQUIRED', 'Choose an actual durable decision or access fact, separate from authored clues and item custody.')
  return structuredClone(value)
}

function access(input: ResearchProject['start']['input']) {
  const state = gs.getState(), accessFact = fact(input.accessFactId)
  const point = accessFact.narrativeEffect?.cell
  const vertical = entityVerticalContext(state, 'player')
  if (!point || !vertical.known || vertical.airborne || !state.currentMapId || !state.currentRoomId
    || accessFact.mapId !== state.currentMapId || accessFact.roomId !== state.currentRoomId)
    toolkitError('XGE_RESEARCH_SITE_REQUIRED', 'Establish actual local supported Research access at the existing scene site.')
  let sage: Record<string, unknown> | undefined
  if (input.siteKind === 'sage') {
    const npc = input.sageId ? state.npcs?.[input.sageId] : undefined
    if (!npc || !npc.visible || npc.isAlive === false || npc.hp && npc.hp.current <= 0
      || npc.conditions?.some(c => ['dead', 'unconscious', 'incapacitated', 'petrified', 'paralyzed', 'stunned'].includes(c))
      || swallowedBy(state, npc.id) || npc.mapId !== state.currentMapId || npc.roomId !== state.currentRoomId
      || npc.position.x !== point.x || npc.position.y !== point.y)
      toolkitError('XGE_RESEARCH_SAGE_REQUIRED', 'Use the exact actual present capable sage with explicitly established access.')
    const height = entityVerticalContext(state, npc.id)
    if (!height.known || height.airborne) toolkitError('XGE_RESEARCH_SAGE_REQUIRED', 'Observe the actual supported sage location first.')
    assertToolkitReach({ mapId: state.currentMapId, roomId: state.currentRoomId, cell: point, surfaceZFeet: height.zFeet! })
    sage = { id: npc.id, name: npc.name, kind: npc.kind }
  } else {
    if (input.sageId !== undefined || point.x !== state.player.position.x || point.y !== state.player.position.y)
      toolkitError('XGE_RESEARCH_LIBRARY_REQUIRED', 'The actual library access fact must qualify this supported study cell, with no invented sage.')
    assertToolkitReach({ mapId: state.currentMapId, roomId: state.currentRoomId, cell: point, surfaceZFeet: vertical.zFeet! })
  }
  const exceptionalFact = input.exceptionalAccessFactId ? fact(input.exceptionalAccessFactId) : undefined
  if (exceptionalFact
    ? input.actualExceptionalAccessConfirmed !== true || exceptionalFact.id === accessFact.id
      || exceptionalFact.mapId !== accessFact.mapId || exceptionalFact.roomId !== accessFact.roomId
      || !same(exceptionalFact.narrativeEffect?.cell, point)
    : input.actualExceptionalAccessConfirmed !== undefined)
    toolkitError('XGE_RESEARCH_EXCEPTIONAL_ACCESS_REQUIRED', 'Explicit exceptional source advantage needs its own actual local qualification fact.')
  return { accessFact: accessFact as unknown as Record<string, unknown>,
    exceptionalFact: exceptionalFact as unknown as Record<string, unknown> | undefined, sage,
    site: { mapId: state.currentMapId, roomId: state.currentRoomId, cell: { ...state.player.position }, zFeet: vertical.zFeet! } }
}

type Draft<E = ResearchEvent> = E extends ResearchEvent ? Omit<E, 'command'> : never
function commit(event: Draft) {
  const retained = { ...event, command: researchWitness(event) } as ResearchEvent
  data().events.push(retained)
  return result(retained)
}

function result(event: ResearchEvent, replayed = false) {
  const common = { success: true, projectId: event.input.projectId, eventId: event.input.eventId, replayed }
  switch (event.operation) {
    case 'start': return { ...common, requiredDays: 5, minimumExpenseCp: 5000, seconds: 0, learned: [] }
    case 'work': return { ...common, segment: event.payload, secondsSpent: event.input.seconds, learned: [] }
    case 'resolve': return { ...common, ...event.payload, seconds: 0, learned: [] }
    case 'settle': return { ...common, lore: event.payload.lore, seconds: 0, questUnlocked: false, itemsGranted: 0 }
    case 'cancel': return { ...common, seconds: 0, refundedCp: 0 }
  }
}

function replay(operation: ResearchEvent['operation'], input: ResearchEvent['input']) {
  const d = data(), old = d.events.find(e => e.input.eventId === input.eventId)
  if (old && old.operation === operation && same(old.input, input)) return result(old, true)
  if (old || d.adoption.input.eventId === input.eventId || d.pending?.input.eventId === input.eventId)
    toolkitError('XGE_RESEARCH_EVENT_CONFLICT', 'An existing event identity retains its original Research command.')
  return undefined
}

export function validateXgeResearchSource(state: GameState) {
  const d = state.dmTools?.xgeResearch
  return d && !same(d.adoption.source, readXgeResearchSource()) ? ['Retain the exact supplied original XGE Research source.'] : []
}

export function adoptXgeResearch(raw: unknown) {
  const input = AdoptXgeResearchSchema.parse(raw), old = gs.getState().dmTools?.xgeResearch
  if (old) {
    if (!same(old.adoption.input, input)) toolkitError('XGE_RESEARCH_ADOPTION_IMMUTABLE', 'Retain the original explicit adoption and history.')
    return { success: true, adopted: true, replayed: true, source: old.adoption.source }
  }
  ready()
  const adoption = { input, at: now(), fact: fact(input.decisionFactId) as unknown as Record<string, unknown>, source: readXgeResearchSource() }
  toolkitState().xgeResearch = { version: 1, adoption: { ...adoption, command: researchWitness(adoption) }, events: [] }
  return { success: true, adopted: true, source: adoption.source, seconds: 0 }
}

export function startXgeResearch(raw: unknown) {
  const input = StartXgeResearchSchema.parse(raw), old = replay('start', input)
  if (old) return old
  ready()
  capacity(8)
  const current = projects()
  if (current.has(input.projectId) || current.size >= 64 || [...current.values()].some(p => !p.settlement && !p.cancellation))
    toolkitError('XGE_RESEARCH_PROJECT_LIMIT', 'Use one open Research project and retain its actual identity and history.')
  const profile = researchProfile(input.profileId)
  if (!profile || remainingResearchLore(input.profileId, current.values()).length < 3)
    toolkitError('XGE_RESEARCH_PROFILE_UNAVAILABLE', 'Choose an existing published profile with sufficient eligible unread source facts for every outcome.')
  return commit({ operation: 'start', input, at: now(), payload: { profile: profile.ref, ...access(input) } })
}

function paidWallet(paid: Coins) {
  const wallet = { ...(gs.getState().dmTools?.wallet ?? emptyCoins()) }
  for (const id of COIN_IDS) {
    if (wallet[id] < paid[id]) toolkitError('XGE_RESEARCH_FUNDS_REQUIRED', 'Choose denominations actually held in the authoritative wallet.')
    wallet[id] -= paid[id]
  }
  assertCarryingAcquisition({ walletAfter: wallet })
  return wallet
}

export function workXgeResearch(raw: unknown) {
  const input = WorkXgeResearchSchema.parse(raw), old = replay('work', input)
  if (old) return old
  ready()
  const p = project(input.projectId)
  const completedDays = researchDays(p).length
  if (p.cancellation || p.resolution || completedDays >= 5 || p.work.length >= 1024)
    toolkitError('XGE_RESEARCH_EFFORT_CLOSED', 'Retain the actual completed, cancelled or bounded effort history.')
  const { profile: _profile, ...originalAccess } = p.start.payload
  if (!same(access(p.start.input), originalAccess))
    toolkitError('XGE_RESEARCH_ACCESS_CHANGED', 'Return to the actual original qualified source and supported study position.')
  const from = now(), day = researchDay(from), deadline = researchDeadline(p)
  if (deadline !== null && day > deadline)
    toolkitError('XGE_RESEARCH_DELAY_REVIEW_REQUIRED', 'Further effort exceeds the source twice-duration window. The project, paid expenses and real work remain retained for explicit future arbitration.')
  if (from + input.seconds > (day + 1) * 86400)
    toolkitError('XGE_RESEARCH_DAY_BOUNDARY', 'Stop at the actual day boundary. Partial dates never combine into a qualified day.')
  const shared = downtimeIntervalIssue(gs.getState(), from, input.seconds)
  if (shared) toolkitError('DOWNTIME_SHARED_DAY_REQUIRED', shared)
  const studyToday = p.work.filter(e => e.payload.day === day).reduce((sum, e) => sum + e.input.seconds, 0)
  const remainingDates = 5 - completedDays - Number(studyToday + input.seconds === 28800)
  capacity(1 + remainingDates + 2)
  if (p.work.length + 1 + remainingDates > 1024)
    toolkitError('XGE_RESEARCH_HISTORY_LIMIT', 'Retain enough interval slots to finish the original paid week.')
  const paidCp = input.paid ? copperValue(input.paid) : 0
  if (p.work.length ? input.paid !== undefined : !input.paid || paidCp < 5000)
    toolkitError('XGE_RESEARCH_EXPENSE_REQUIRED', 'Choose at least 50 gp of actual expense at the first effort only. No extra payment or implied refund later.')
  const wallet = input.paid ? paidWallet(input.paid) : undefined
  const actors = ['player', ...(p.start.input.sageId ? [p.start.input.sageId] : [])]
  for (const id of actors) {
    const issue = breathingActivityIssue(gs.getState(), id, input.seconds)
    if (issue) toolkitError(issue.code, issue.message)
    if (Object.values(gs.getState().dmTools?.afflictions?.records ?? {}).some(a => a.targetId === id
      && ['active', 'pending'].includes(a.status) && !a.petrificationPause && a.nextAt !== undefined && a.nextAt <= from + input.seconds))
      toolkitError('XGE_RESEARCH_ACTUAL_EVENT_BOUNDARY', 'Stop before the actual researcher or sage affliction boundary.')
  }
  preflightRestStrenuousInterval()
  assertGameTimeAdvance(input.seconds)
  advanceHeroTime(input.seconds)
  recordRestMeasuredActivityInterval({ eventId: `xge-research:${input.eventId}`, from, to: now(), activity: input.restActivity, reason: input.activitySource })
  if (wallet) toolkitState().wallet = wallet
  return commit({ operation: 'work', input, at: now(), payload: { from, to: now(), day, paidCp } })
}

export function resolveXgeResearch(raw: unknown) {
  const input = ResolveXgeResearchSchema.parse(raw), d = data()
  if (d.pending && same(d.pending.input, input)) return toolkitResult({ pendingReaction: gs.getState().hero?.pending, replayed: true })
  const old = replay('resolve', input)
  if (old) return toolkitResult(old)
  ready()
  capacity(2)
  const p = project(input.projectId)
  if (p.cancellation || p.resolution || researchDays(p).length !== 5)
    toolkitError('XGE_RESEARCH_FIVE_DAYS_REQUIRED', 'Complete five distinct real eight-hour dates before the single Research check.')
  if (input.selection === 'choose' ? !input.chosenRow || !input.selectionFactId : input.chosenRow !== undefined || input.selectionFactId !== undefined)
    toolkitError('XGE_RESEARCH_TABLE_SELECTION_REQUIRED', 'Choose an actual table roll, or an explicit source row and a real choice fact. Neither forces occurrence.')
  const selectionFact = input.selectionFactId ? fact(input.selectionFactId) as unknown as Record<string, unknown> : undefined
  const pending = { input, at: now(), selectionFact }
  d.pending = { ...pending, command: researchWitness(pending) }
  const result = checkedResolution({ entityId: 'player', ability: 'int', label: 'XGE Research',
    ...(p.start.payload.exceptionalFact ? { advantage: true, advantageReason: 'Actual separately qualified exceptional Research source.' } : {}),
  }, { domain: 'xge-research', command: { input } })
  if (d.pending) {
    const held = { ...pending, heldWitness: researchWitness(gs.getState().hero?.pending) }
    d.pending = { ...held, command: researchWitness(held) }
  }
  return result
}

function finishResearch(raw: unknown, check: AbilityCheckResult) {
  const input = ResolveXgeResearchSchema.parse(raw), d = data(), pending = d.pending, p = project(input.projectId)
  if (!pending || !same(input, pending.input) || p.resolution || check.ability !== 'int')
    toolkitError('XGE_RESEARCH_ORIGINAL_CHECK_REQUIRED', 'Resume the original retained Research INT check only.')
  const bonus = researchBonus(p.work[0].payload.paidCp), total = check.roll.total + bonus
  const chance = rollDice('1d100')
  const tableRoll = chance.total <= 10 && input.selection === 'roll' ? rollDice('1d6') : undefined
  const row = chance.total <= 10 ? input.chosenRow ?? tableRoll?.total : undefined
  delete d.pending
  return toolkitResult(commit({ operation: 'resolve', input, at: now(), payload: {
    check: { ...check, ability: 'int', roll: { ...check.roll } }, bonus, total, loreCount: researchLoreCount(total),
    chance: { ...chance }, tableRoll: tableRoll ? { ...tableRoll } : undefined, row, selectionFact: pending.selectionFact,
  } }))
}

export function registerXgeResearchResolution() {
  registerCheckedResolution('xge-research', (command, checked) => finishResearch(command.input, checked as AbilityCheckResult))
}

export function settleXgeResearch(raw: unknown) {
  const input = SettleXgeResearchSchema.parse(raw), old = replay('settle', input)
  if (old) return old
  ready()
  capacity()
  const p = project(input.projectId), resolution = p.resolution?.payload
  if (!resolution || p.settlement || p.cancellation)
    toolkitError('XGE_RESEARCH_RESULT_REQUIRED', 'Settle only the original completed Research result.')
  if (resolution.row ? !input.complicationFactId || input.actualComplicationAdjudicated !== true
    : input.complicationFactId !== undefined || input.actualComplicationAdjudicated !== undefined)
    toolkitError('XGE_RESEARCH_COMPLICATION_DECISION_REQUIRED', 'An actual source complication needs its explicit MJ consequence fact. No side effect is executed here.')
  const eligible = remainingResearchLore(p.start.input.profileId, projects().values())
  const lore = input.loreIds.map(id => eligible.find(f => f.id === id))
  if (lore.length !== resolution.loreCount || new Set(input.loreIds).size !== input.loreIds.length || lore.some(f => !f))
    toolkitError('XGE_RESEARCH_LORE_SELECTION_INVALID', 'Choose the exact earned count of distinct eligible source IDs. No text, guessed secret or authored clue is accepted.')
  const complicationFact = input.complicationFactId ? fact(input.complicationFactId) as unknown as Record<string, unknown> : undefined
  return commit({ operation: 'settle', input, at: now(), payload: { lore: lore.filter(f => f !== undefined), complicationFact } })
}

export function cancelXgeResearch(raw: unknown) {
  const input = CancelXgeResearchSchema.parse(raw), old = replay('cancel', input)
  if (old) return old
  ready()
  capacity()
  const p = project(input.projectId)
  if (p.cancellation || p.resolution || researchDays(p).length >= 5)
    toolkitError('XGE_RESEARCH_CANCELLATION_CLOSED', 'A completed Research week still requires its original result and complication.')
  return commit({ operation: 'cancel', input, at: now() })
}

export function inspectXgeResearch() {
  const d: XgeResearchState | undefined = gs.getState().dmTools?.xgeResearch
  const records = researchProjects(d?.events ?? [])
  return { readOnly: true, adopted: Boolean(d), projects: [...records.values()].map(p => {
    const result = p.resolution?.payload, deadline = researchDeadline(p)
    return {
      projectId: p.start.input.projectId, profileId: p.start.input.profileId, days: researchDays(p),
      paidCp: p.work[0]?.payload.paidCp ?? 0, deadlineDay: deadline, loreCount: result?.loreCount ?? null,
      status: p.cancellation ? 'cancelled' : p.settlement ? 'settled' : p.resolution ? 'awaiting_settlement'
        : d?.pending?.input.projectId === p.start.input.projectId ? 'held'
          : researchDays(p).length === 5 ? 'awaiting_check' : deadline !== null && researchDay(now()) > deadline ? 'awaiting_delay_review' : 'working',
      complicationRow: result?.row ?? null, lore: p.settlement?.payload.lore ?? [],
      eligibleLoreIds: result && result.loreCount > 0 && !p.settlement
        ? remainingResearchLore(p.start.input.profileId, records.values()).map(f => f.id) : [],
    }
  }) }
}
