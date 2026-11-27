import type { TemporaryHpDuration, TemporaryHpPool, TemporaryHpState } from '../lib/temporary-hp-state'
import { temporaryHpFor } from '../lib/temporary-hp-state'
import { toolkitState, toolkitError } from './toolkit'
import { assertHero, now } from './hero-rules'
import * as gs from './game-state'

function data(): TemporaryHpState {
  const state = toolkitState() as ReturnType<typeof toolkitState> & { temporaryHp?: TemporaryHpState }
  return state.temporaryHp ??= { pools: {}, receipts: {} }
}
export function reconcileTemporaryHp() {
  for (const pool of Object.values(gs.getState().dmTools?.temporaryHp?.pools ?? {}))
    if (pool.expiresAt !== undefined && pool.expiresAt <= now()) pool.current = 0
}
export function temporaryHpLongRest(targetId: string) {
  const pool = gs.getState().dmTools?.temporaryHp?.pools[targetId]
  const before = temporaryHpFor(gs.getState(), targetId)
  if (pool?.endOnLongRest) pool.current = 0
  return { targetId, before, after: temporaryHpFor(gs.getState(), targetId), expiredByLongRest: Boolean(pool?.endOnLongRest && before > 0) }
}
export function inspectTemporaryHp(targetId: string) {
  const target = gs.getEntity(targetId)
  if (!target) toolkitError('ENTITY_NOT_FOUND', 'Choose an existing active creature for temporary-HP inspection.')
  const pool = gs.getState().dmTools?.temporaryHp?.pools[targetId]
  return { targetId, temporaryHp: temporaryHpFor(gs.getState(), targetId), hp: { ...target!.hp },
    ...(pool ? { pool: { ...pool, current: temporaryHpFor(gs.getState(), targetId) } } : {}),
    notice: 'Temporary HP are a separate non-healing buffer. They never wake, stabilize, resurrect or increase actual HP maximum.' }
}
export type TemporaryHpGrant = { eventId: string; targetId: string; sourceId: string; sourceDescription: string;
  amount: number; duration: TemporaryHpDuration; choice?: 'keep' | 'replace' }
export function grantTemporaryHp(input: TemporaryHpGrant) {
  assertHero()
  if (!input.eventId || !input.sourceId || !input.sourceDescription.trim())
    toolkitError('TEMPORARY_HP_SOURCE_REQUIRED', 'An explicit event ID and established identified source description are required.')
  if (input.duration.kind === 'seconds' && (!Number.isInteger(input.duration.seconds) || input.duration.seconds < 1 || input.duration.seconds > 31536000))
    toolkitError('TEMPORARY_HP_DURATION_INVALID', 'The exact source duration must be 1–31536000 whole seconds.')
  const command = JSON.stringify({ targetId: input.targetId, sourceId: input.sourceId, sourceDescription: input.sourceDescription,
    amount: input.amount, duration: input.duration, choice: input.choice ?? null })
  const existing = gs.getState().dmTools?.temporaryHp, old = existing?.receipts[input.eventId]
  if (old) {
    if (old.command !== command) toolkitError('TEMPORARY_HP_EVENT_CONFLICT', 'This event ID already records another immutable temporary-HP grant.')
    return { success: true, alreadyApplied: true, receipt: old, target: inspectTemporaryHp(input.targetId) }
  }
  const target = gs.getEntity(input.targetId)
  if (!target) toolkitError('ENTITY_NOT_FOUND', 'Temporary HP require an existing active creature.')
  if ('group' in target && target.group) toolkitError('NPC_GROUP_TEMPORARY_HP_FORBIDDEN', 'This authored shared-HP group cannot gain temporary hit points.')
  if (input.targetId === 'player' ? gs.getPlayer().deathSaves?.dead : !(target as { isAlive: boolean }).isAlive)
    toolkitError('TEMPORARY_HP_TARGET_DEAD', 'A corpse cannot receive this grant; temporary HP never resurrect.')
  if (!Number.isInteger(input.amount) || input.amount < 1 || input.amount > 10000)
    toolkitError('TEMPORARY_HP_AMOUNT_INVALID', 'The source must provide an explicit integer grant from 1 to 10000.')
  if (Object.keys(existing?.receipts ?? {}).length >= 2048) toolkitError('TEMPORARY_HP_RECEIPT_LIMIT', 'At most 2048 grant receipts; no receipt is evicted.')
  const current = temporaryHpFor(gs.getState(), input.targetId)
  if (current > 0 && !input.choice)
    toolkitError('TEMPORARY_HP_CHOICE_REQUIRED', 'Temporary HP never stack. The player must explicitly choose keep or replace the existing source pool.')
  if (current <= 0 && input.choice === 'keep')
    toolkitError('TEMPORARY_HP_KEEP_EMPTY', 'There is no remaining active temporary-HP pool to keep.')
  const store = data(), before = store.pools[input.targetId] ? structuredClone(store.pools[input.targetId]) : undefined
  const pool: TemporaryHpPool = input.choice === 'keep' ? store.pools[input.targetId] : {
    eventId: input.eventId, sourceId: input.sourceId, sourceDescription: input.sourceDescription,
    initial: input.amount, current: input.amount, grantedAt: now(), endOnLongRest: input.duration.kind === 'until_long_rest',
    ...(input.duration.kind === 'seconds' ? { expiresAt: now() + input.duration.seconds } : {}),
  }
  store.pools[input.targetId] = pool
  const receipt = { eventId: input.eventId, command, targetId: input.targetId,
    outcome: input.choice === 'keep' ? 'kept' as const : current > 0 ? 'replaced' as const : 'granted' as const,
    ...(before ? { before } : {}), after: structuredClone(pool), at: now() }
  store.receipts[input.eventId] = receipt
  return { success: true, alreadyApplied: false, receipt, target: inspectTemporaryHp(input.targetId) }
}

/** Input must already reflect vulnerability/resistance/immunity. This does not
 * alter real HP, wake a sleeper, stabilize, or resolve concentration itself. */
export function absorbTemporaryHpDamage(targetId: string, damageReceived: number) {
  if (!Number.isSafeInteger(damageReceived) || damageReceived < 0) toolkitError('DAMAGE_INVALID', 'Temporary HP require nonnegative integer actual damage.')
  reconcileTemporaryHp()
  const before = temporaryHpFor(gs.getState(), targetId), absorbed = Math.min(before, damageReceived)
  const pool = gs.getState().dmTools?.temporaryHp?.pools[targetId]
  if (pool) pool.current -= absorbed
  return { before, absorbed, after: before - absorbed, hpDamage: damageReceived - absorbed, damageReceived }
}
