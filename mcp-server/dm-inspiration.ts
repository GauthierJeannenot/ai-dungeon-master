import type { DiceRollResult } from '../lib/types'
import { DM_INSPIRATION_ROLL_KINDS, type DMInspirationState, type DMInspirationRollKind } from '../lib/dm-inspiration-state'
import { assertHero, hero, now } from './hero-rules'
import { rollD20WithAdvantage } from './dice'
import { toolkitState, toolkitError } from './toolkit'
import * as gs from './game-state'

type Holder = { dmInspiration?: DMInspirationState }
const current = () => (gs.getState().dmTools as Holder | undefined)?.dmInspiration
function state() {
  const data = toolkitState() as ReturnType<typeof toolkitState> & Holder
  return data.dmInspiration ??= { held: false, grants: {}, spends: {} }
}
function beforeChoice() {
  assertHero()
  if (hero().pending) toolkitError('REACTION_PENDING', 'Resolve the already rolled reaction window first; inspiration cannot alter a held roll retroactively.')
}
export function dmInspirationSnapshot() {
  const data = current()
  return { held: data?.held ?? false, capacityUsed: Boolean(data?.held || data?.prepared),
    ...(data?.prepared ? { preparedRollKind: data.prepared.kind, spendId: data.prepared.spendId } : {}) }
}
/** Shared one-token acquisition. Source awards keep their own dated receipt,
 * so they cannot be blocked by the discretionary MJ receipt limit. */
function acquireInspirationCapacity() {
  const data = state(), granted = !data.held && !data.prepared
  if (granted) data.held = true
  return { data, granted }
}
/** Internal actual source boundary: no choice, capacity/history validation or
 * reaction check may throw after the real clock has already committed. */
export function grantSourceDmInspiration() {
  const { granted } = acquireInspirationCapacity()
  return { granted, capped: !granted, ...dmInspirationSnapshot() }
}
export function grantDmInspiration(eventId: string, reason: string) {
  beforeChoice()
  const old = current()?.grants[eventId]
  if (old) {
    if (old.reason !== reason) toolkitError('INSPIRATION_EVENT_CONFLICT', 'This inspiration event already has a different immutable reason.')
    return { success: true, replayed: true, granted: false, originalOutcome: old.outcome, ...dmInspirationSnapshot(),
      mechanicalSummary: 'Événement d’inspiration du MJ déjà traité : aucune nouvelle réserve accordée.' }
  }
  if (current()?.prepared) toolkitError('INSPIRATION_ROLL_PREPARED', 'The one inspiration capacity is reserved for a declared roll; it cannot be replenished before that roll.')
  if (Object.keys(current()?.grants ?? {}).length >= 256) toolkitError('INSPIRATION_HISTORY_LIMIT', '256 grant receipts reached; no receipt is erased to permit another gift.')
  const { data, granted } = acquireInspirationCapacity()
  // A capped award is remembered too: retrying it after spending must not turn
  // an event that awarded no second token into a new gift.
  data.grants[eventId] = { reason, outcome: granted ? 'granted' : 'capped' }
  return { success: true, granted, capped: !granted, eventId, reason, ...dmInspirationSnapshot(),
    mechanicalSummary: granted ? 'Inspiration du MJ accordée : une réserve, sans bonus numérique ni jet.' : 'Inspiration du MJ déjà détenue : aucun cumul ; cet événement est mémorisé sans nouvelle réserve.' }
}
export function prepareDmInspiration(spendId: string, kind: DMInspirationRollKind) {
  beforeChoice()
  const old = current()?.spends[spendId]
  if (old) {
    if (old.kind !== kind) toolkitError('INSPIRATION_SPEND_CONFLICT', 'This spend ID already selects another immutable roll category.')
    return { success: true, replayed: true, alreadyConsumed: old.status === 'consumed', ...dmInspirationSnapshot(),
      mechanicalSummary: 'Dépense d’inspiration du MJ déjà enregistrée : aucun nouveau jet ni nouvelle préparation.' }
  }
  const data = current()
  if (data?.prepared) toolkitError('INSPIRATION_ROLL_PREPARED', 'Finish the explicitly prepared roll before selecting another one.')
  if (!data?.held) toolkitError('INSPIRATION_NOT_HELD', 'The player has no Dungeon Master inspiration token to spend.')
  if (Object.keys(data.spends).length >= 256) toolkitError('INSPIRATION_HISTORY_LIMIT', '256 spend receipts reached; old receipts are retained.')
  data.held = false
  data.spends[spendId] = { kind, status: 'prepared' }
  data.prepared = { spendId, kind }
  return { success: true, prepared: true, ...dmInspirationSnapshot(),
    mechanicalSummary: `Inspiration du MJ réservée au prochain vrai d20 de catégorie ${kind} du joueur : avantage, sans jet, action ou bonus numérique ici.` }
}
/** Pure peek for result metadata. This never creates state or spends a token. */
export function dmInspirationReady(entityId: string, kind: DMInspirationRollKind): boolean {
  return entityId === 'player' && current()?.prepared?.kind === kind
}
/** Call only at a validated actual d20, not at a held continuation, automatic
 * failure, or documentary roll_dice. The receipt changes only AFTER a valid
 * roll; invalid dice/modifiers therefore cannot spend the reservation. */
export function rollWithDmInspiration(entityId: string, kind: DMInspirationRollKind, modifier: number,
  advantage = false, disadvantage = false): DiceRollResult {
  if (!DM_INSPIRATION_ROLL_KINDS.includes(kind)) toolkitError('INSPIRATION_ROLL_KIND_INVALID', 'Choose an implemented d20 category.')
  const prepared = dmInspirationReady(entityId, kind) ? current()!.prepared : undefined
  const roll = rollD20WithAdvantage(modifier, Boolean(advantage || prepared), disadvantage)
  if (prepared) {
    const data = current()!, receipt = data.spends[prepared.spendId]
    receipt.status = 'consumed'; receipt.consumedAt = now(); delete data.prepared
    roll.detail += ' | Inspiration du MJ dépensée : avantage (annulation normale si désavantage)'
  }
  return roll
}
