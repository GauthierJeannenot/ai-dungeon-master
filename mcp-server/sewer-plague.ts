import type { AfflictionRecord, SewerPlagueRestEvent } from '../lib/affliction-state'
import type { GameState, SavingThrowResult } from '../lib/types'
import { chaseFatigue, chaseWitness } from '../lib/chase-state'
import { exhaustionLevel } from '../lib/exhaustion'
import { nutritionRestEligibility } from '../lib/survival-state'
import { entityGroundContact } from '../lib/jumping-state'
import * as gs from './game-state'
import { effects, hero, now } from './hero-rules'
import { changeExhaustion, inspectExhaustion } from './exhaustion'
import { endAffliction } from './afflictions'
import { rollDice } from './dice'
import { hasRelaxationRecoveryAdvantage } from './xge-relaxation'
import { savedResolution } from './toolkit-checks'
import { toolkitError, toolkitResult } from './toolkit'

const TEMPLATE = 'sewer_plague'
const REST_DOMAIN = 'sewer-plague-rest'
const REST_DC = 11
const ONSET_REASON = 'DMG2014 Sewer Plague: actual incubated symptoms add one exhaustion level.'
const SAVE_FAILURE_REASON = 'DMG2014 Sewer Plague: failed Constitution save at an actual long-rest end.'
const SAVE_SUCCESS_REASON = 'DMG2014 Sewer Plague: successful Constitution save at an actual long-rest end.'

function plagueRecords(state: GameState) {
  return Object.values(state.dmTools?.afflictions?.records ?? {}).filter(record => record.templateId === TEMPLATE)
}

function activePlague(state: GameState) {
  return plagueRecords(state).find(record => record.status === 'active' && !record.petrificationPause && !state.player.deathSaves?.dead)
}

function onsetExhaustionId(record: AfflictionRecord) {
  return `\u0000sewer-plague:onset:${record.id}`
}

function restExhaustionId(record: AfflictionRecord, restId: string) {
  return `\u0000sewer-plague:rest:${JSON.stringify([record.id, restId])}`
}

export function preflightSewerPlagueContact(targetId: string, cell: { x: number; y: number }) {
  if (targetId !== 'player') toolkitError('SEWER_PLAGUE_PLAYER_ONLY', 'This tranche supports contact with contaminated ground for the actual humanoid player. Other disease hosts and rests are not represented.')
  const state = gs.getState()
  if (plagueRecords(state).some(record => record.status === 'active' || record.status === 'pending'))
    toolkitError('SEWER_PLAGUE_ALREADY_INFECTED', 'Retain the existing actual infection and incubation. No second save, dose or new infection is created.')
  if (entityGroundContact(state, targetId, cell, 0).contact !== true)
    toolkitError('SEWER_PLAGUE_GROUND_CONTACT_REQUIRED', 'The actual player must contact the explicitly prepared ground contamination on its current source cell.')
  if (!state.player.conditions.includes('petrified')) inspectExhaustion('player')
}

export function startSewerPlagueIncubation(record: AfflictionRecord) {
  const incubation = rollDice('1d4')
  record.sewerPlague = { incubationDays: incubation.total, restEvents: {} }
  record.nextAt = now() + incubation.total * 86400
  return incubation
}

export function symptomaticSewerPlague(state = gs.getState()) {
  return Boolean(activePlague(state)?.sewerPlague?.onset)
}

export function sewerPlagueHitDieHealing(total: number) {
  const normal = Math.max(0, total)
  return symptomaticSewerPlague() ? Math.floor(normal / 2) : normal
}

export function sewerPlagueEvent(state: GameState) {
  const record = activePlague(state)
  if (!record?.sewerPlague) return undefined
  const rest = Object.values(record.sewerPlague.restEvents).find(event => !event.result)
  if (rest) return { kind: 'sewer_rest' as const, afflictionId: record.id, restId: rest.restId, at: rest.completedAt }
  if (!record.sewerPlague.onset && record.nextAt !== undefined && record.nextAt <= (state.worldTimeSeconds ?? 0))
    return { kind: 'sewer_onset' as const, afflictionId: record.id, at: record.nextAt }
}

export function assertSewerPlagueEventResolved() {
  const event = sewerPlagueEvent(gs.getState())
  if (event) toolkitError('SEWER_PLAGUE_EVENT_REQUIRED', `Choose resolve_affliction_event for the actual ${event.kind} event of ${event.afflictionId}${'restId' in event ? ` at rest ${event.restId}` : ''}.`)
}

function assertReceiptCapacity(extra: number) {
  if (Object.keys(gs.getState().dmTools?.exhaustion?.receipts ?? {}).length + extra > 2048)
    toolkitError('EXHAUSTION_RECEIPT_LIMIT', 'Retain enough exhaustion receipt capacity for the actual Sewer Plague source before a die or new rest benefit.')
}

function assertSupportedWard(level: number, at = now()) {
  if (level >= 5 && gs.getState().hero?.effects.some(effect => effect.kind === 'death-ward' && effect.targetIds.includes('player') && effect.expiresAt > at))
    toolkitError('SEWER_PLAGUE_WARD_ADJUDICATION_REQUIRED', 'Potential lethal exhaustion with actual Death Ward needs separate adjudication. The infection, rest, exhaustion and original dice are retained.')
}

export function assertSewerPlagueTimeAdvance(seconds: number) {
  if (seconds <= 0) return
  assertSewerPlagueEventResolved()
  const record = activePlague(gs.getState())
  if (!record || record.nextAt === undefined) return
  const dueAt = record.nextAt
  const until = now() + seconds
  if (until > dueAt)
    toolkitError('SEWER_PLAGUE_ONSET_BOUNDARY', `Advance only to the actual incubation boundary ${dueAt}, then explicitly resolve ${record.id}.`)
  if (until === dueAt) {
    assertReceiptCapacity(1)
    assertSupportedWard(inspectExhaustion('player').level, dueAt)
  }
}

export function assertSewerPlagueUninterruptedRest(seconds: number) {
  const dueAt = activePlague(gs.getState())?.nextAt
  if (seconds > 0 && dueAt !== undefined && dueAt <= now() + seconds)
    toolkitError('REST_SEWER_PLAGUE_BOUNDARY', 'Use the actual recorded rest and advance only to the incubation boundary before resolving the onset. No rest benefits have been committed.')
}

export function sewerOnsetRemediationAt(targetId: string) {
  const event = sewerPlagueEvent(gs.getState())
  if (targetId === 'player' && event?.kind === 'sewer_onset'
      && exhaustionLevel(gs.getState(), targetId) === 5 && effects('death-ward', targetId).length > 0) return event.at
}

export function resolveSewerPlagueOnset(record: AfflictionRecord) {
  const infection = record.sewerPlague
  if (infection?.onset) return { replayed: true, onset: infection.onset, affliction: record }
  if (!infection || sewerPlagueEvent(gs.getState())?.afflictionId !== record.id
      || sewerPlagueEvent(gs.getState())?.kind !== 'sewer_onset' || record.nextAt === undefined)
    toolkitError('AFFLICTION_EVENT_NOT_DUE', 'The retained incubation has not reached its actual onset.')
  assertSupportedWard(inspectExhaustion('player').level)
  assertReceiptCapacity(1)
  const dueAt = record.nextAt!
  const exhaustionEventId = onsetExhaustionId(record)
  const exhaustion = changeExhaustion({ eventId: exhaustionEventId, targetId: 'player', operation: 'add', levels: 1, reason: ONSET_REASON })
  infection!.onset = { dueAt, resolvedAt: now(), exhaustionEventId }
  delete record.nextAt
  return { replayed: false, onset: infection!.onset, exhaustion, affliction: record }
}

export function preflightSewerPlagueLongRest(restId: string, armoredSleep: boolean, chaseRecovery: { recover: boolean; levels: number }) {
  const state = gs.getState()
  const record = activePlague(state)
  if (!record?.sewerPlague) return undefined
  if (Object.hasOwn(record.sewerPlague.restEvents, restId))
    toolkitError('SEWER_PLAGUE_REST_EVENT_CONFLICT', 'This actual rest already owns the original disease save.')
  const before = inspectExhaustion('player').level
  const chaseLevels = chaseRecovery.recover ? chaseRecovery.levels : 0
  const remaining = before - chaseLevels
  const nutritionReduction = !armoredSleep && remaining > 0 && nutritionRestEligibility(state.dmTools?.survival).eligible ? 1 : 0
  assertReceiptCapacity(Number(chaseLevels > 0) + nutritionReduction + 1)
  assertSupportedWard(remaining - nutritionReduction)
  return record
}

export function stageSewerPlagueLongRest(record: AfflictionRecord, restId: string) {
  const state = gs.getState()
  const event: SewerPlagueRestEvent = {
    restId, completedAt: now(), exhaustionBeforeSave: exhaustionLevel(state, 'player'), chaseBeforeSave: chaseFatigue(state, 'player'),
  }
  record.sewerPlague!.restEvents[restId] = event
  return { afflictionId: record.id, restId, at: event.completedAt, dc: REST_DC, recoveryAlreadyApplied: true }
}

function assertRestRemovalSource(event: SewerPlagueRestEvent, source: 'chase' | 'other' | undefined) {
  const { exhaustionBeforeSave: total, chaseBeforeSave: chase } = event
  if (source === 'chase' && chase === 0 || source === 'other' && total === chase)
    toolkitError('SEWER_PLAGUE_REMOVAL_SOURCE_UNAVAILABLE', 'Choose a source that actually has an exhaustion level available after this rest.')
  if (!source && chase > 0 && chase < total)
    toolkitError('EXHAUSTION_SOURCE_CHOICE_REQUIRED', 'Choose chase or other for a possible successful disease save before any die. Neither source receives priority.')
}

function originalRestEvent(record: AfflictionRecord, restId: string) {
  const events = record.sewerPlague?.restEvents
  return events && Object.hasOwn(events, restId) ? events[restId] : undefined
}

export function resolveSewerPlagueRest(record: AfflictionRecord, restId: string, removalSource?: 'chase' | 'other') {
  const event = originalRestEvent(record, restId)
  if (!event) toolkitError('SEWER_PLAGUE_REST_EVENT_NOT_DUE', 'Choose the exact completed long rest that owes this infection its save.')
  if (event!.result) {
    if (event!.removalSource !== removalSource) toolkitError('SEWER_PLAGUE_REST_EVENT_CONFLICT', 'The original exhaustion source decision remains fixed for this saved roll.')
    return toolkitResult({ replayed: true, afflictionId: record.id, event })
  }
  const issue = validateSewerPlagueHistory(gs.getState())[0]
  if (issue) toolkitError('SEWER_PLAGUE_STATE_MISMATCH', issue)
  assertRestRemovalSource(event!, removalSource)
  assertSupportedWard(event!.exhaustionBeforeSave)
  assertReceiptCapacity(1)
  if (removalSource) event!.removalSource = removalSource
  const answer = savedResolution({ entityId: 'player', ability: 'con', dc: REST_DC,
    sourceAdvantage: hasRelaxationRecoveryAdvantage(gs.getState(), event!.completedAt, restId) }, {
    domain: REST_DOMAIN, command: { afflictionId: record.id, restId },
  })
  if (hero().pending?.command.toolkitResolution && !event!.result) event!.heldWitness = chaseWitness(hero().pending)
  return answer
}

export function applySewerPlagueRestSave(command: Record<string, unknown>, save: SavingThrowResult) {
  const state = gs.getState()
  const record = state.dmTools?.afflictions?.records[String(command.afflictionId)]
  const event = record ? originalRestEvent(record, String(command.restId)) : undefined
  if (!record || !event || event.result) toolkitError('SEWER_PLAGUE_REST_EVENT_NOT_DUE', 'Retain the original completed rest and its one actual save.')
  const success = save.success === true
  const before = event!.exhaustionBeforeSave
  const exhaustionEventId = !success || before > 0 ? restExhaustionId(record!, event!.restId) : undefined
  if (exhaustionEventId) changeExhaustion({
    eventId: exhaustionEventId, targetId: 'player', operation: success ? 'remove' : 'add', levels: 1,
    reason: success ? SAVE_SUCCESS_REASON : SAVE_FAILURE_REASON,
  }, success && event!.removalSource ? { removalSource: event!.removalSource } : {})
  const recovered = success && before === 1
  event!.result = { success, roll: save.roll, recovered, ...(exhaustionEventId ? { exhaustionEventId } : {}) }
  delete event!.heldWitness
  if (recovered) endAffliction(record!, 'cured')
  return toolkitResult({ replayed: false, afflictionId: record!.id, event, affliction: record, save })
}

export function validateSewerPlagueHistory(state: GameState) {
  const issues: string[] = []
  const records = plagueRecords(state)
  if (records.filter(record => record.status === 'active' || record.status === 'pending').length > 1)
    issues.push('Only one original Sewer Plague infection can be active or awaiting its contact save.')
  for (const record of records) {
    if (record.status === 'pending') {
      const held = state.hero?.pending?.command.toolkitResolution as { domain?: string; command?: { afflictionId?: string; event?: string } } | undefined
      if (held?.domain !== 'affliction-save' || held.command?.afflictionId !== record.id || held.command.event !== 'initial')
        issues.push('A pending Sewer Plague contact requires its original held infection save.')
    }
    if (state.dmTools?.afflictions?.sources[record.sourceId]?.templateId !== TEMPLATE)
      issues.push('Sewer Plague requires its actual prepared contamination source.')
    const infection = record.sewerPlague
    if (!infection) continue
    if (infection.onset) {
      const receipt = state.dmTools?.exhaustion?.receipts[infection.onset.exhaustionEventId]
      if (infection.onset.exhaustionEventId !== onsetExhaustionId(record) || receipt?.targetId !== 'player'
        || receipt.operation !== 'add' || receipt.levels !== 1 || receipt.at !== infection.onset.resolvedAt || receipt.reason !== ONSET_REASON)
        issues.push('Sewer Plague symptoms require their original exhaustion receipt.')
    }
    const restEvents = Object.values(infection.restEvents)
    if (restEvents.filter(event => !event.result).length > 1)
      issues.push('Only one actually owed Sewer Plague rest save can be pending.')
    for (const event of restEvents) {
      const receipts = state.dmTools?.rests?.receipts
      const rest = receipts && Object.hasOwn(receipts, event.restId) ? receipts[event.restId] : undefined
      const link = rest?.result.sewerPlagueEvent as { afflictionId?: string; restId?: string } | undefined
      if (rest?.session.kind !== 'long' || rest.completedAt !== event.completedAt || rest.result.benefitsGranted !== true
        || link?.afflictionId !== record.id || link.restId !== event.restId)
        issues.push('Sewer Plague rest save requires the linked actually completed long rest.')
      if (!event.result) {
        if (record.status !== 'active' || record.petrificationPause || state.player.deathSaves?.dead || state.phase === 'combat'
          || event.completedAt !== state.worldTimeSeconds || event.exhaustionBeforeSave !== exhaustionLevel(state, 'player')
          || event.chaseBeforeSave !== chaseFatigue(state, 'player'))
          issues.push('The owed Sewer Plague save must remain at its original rest boundary with unchanged exhaustion.')
        if (event.heldWitness && event.heldWitness !== chaseWitness(state.hero?.pending))
          issues.push('The original held Sewer Plague die cannot be changed or discarded.')
        continue
      }
      const { result } = event
      const before = event.exhaustionBeforeSave
      if (result.success !== (result.roll.total >= REST_DC) || result.recovered !== (result.success && before === 1)
        || result.recovered && record.status !== 'cured')
        issues.push('Sewer Plague recovery must be derived from the original save and exhaustion reaching zero.')
      if (!result.success || before > 0) {
        const expectedId = restExhaustionId(record, event.restId)
        const receipt = state.dmTools?.exhaustion?.receipts[expectedId]
        if (result.exhaustionEventId !== expectedId || receipt?.targetId !== 'player' || receipt.levels !== 1
          || receipt.operation !== (result.success ? 'remove' : 'add') || receipt.at !== event.completedAt
          || receipt.beforeLevel !== before || receipt.afterLevel !== before + (result.success ? -1 : 1))
          issues.push('Sewer Plague rest outcome requires the original one-level exhaustion receipt.')
      } else if (result.exhaustionEventId) issues.push('A success at exhaustion zero cannot invent a reduction.')
    }
  }
  for (const rest of Object.values(state.dmTools?.rests?.receipts ?? {})) {
    const link = rest.result.sewerPlagueEvent as { afflictionId?: string; restId?: string } | undefined
    if (link && (link.restId !== rest.restId || !records.find(record => record.id === link.afflictionId)?.sewerPlague?.restEvents[rest.restId]))
      issues.push('The actual completed rest cannot discard its original disease save event.')
  }
  const resolution = state.hero?.pending?.command.toolkitResolution as { domain?: string; command?: { afflictionId?: string; restId?: string } } | undefined
  if (resolution?.domain === REST_DOMAIN) {
    const record = records.find(record => record.id === resolution.command?.afflictionId)
    const event = record?.sewerPlague?.restEvents[resolution.command?.restId ?? '']
    if (!event?.heldWitness || event.result) issues.push('A held Sewer Plague save requires the exact original due event.')
  }
  return issues
}

export function assertSewerPlagueHeldWindow() {
  const resolution = hero().pending?.command.toolkitResolution as { domain?: string } | undefined
  if (resolution?.domain !== REST_DOMAIN) return
  const issue = validateSewerPlagueHistory(gs.getState())[0]
  if (issue) toolkitError('SEWER_PLAGUE_STATE_MISMATCH', issue)
  assertReceiptCapacity(1)
  assertSupportedWard(exhaustionLevel(gs.getState(), 'player'))
}
