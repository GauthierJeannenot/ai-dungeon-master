import type { HeroSpellInput } from './hero-spells'
import { INVALID_TARGET_SOURCE, InvalidTargetEventIdSchema, invalidTargetWitness } from '../lib/xge-invalid-target-state'
import { readXgeInvalidTargetSource } from './rules-library'
import * as gs from './game-state'
import { fail } from './hero-rules'
import { toolkitState } from './toolkit'

export function planInvalidTargetCast(input: HeroSpellInput) {
  if (input.invalidTargetRule === undefined && input.invalidTargetEventId === undefined) return undefined
  if (input.invalidTargetRule !== 'xge-2014' || !InvalidTargetEventIdSchema.safeParse(input.invalidTargetEventId).success)
    fail('XGE_INVALID_TARGET_ADOPTION_REQUIRED','Select the explicit per-cast rule and one original invalidTargetEventId together.')
  if (input.spellId !== 'charm-person' || (input.casterId ?? 'player') !== 'player' || (input.slotLevel ?? 1) !== 1
    || input.targetIds !== undefined || input.targetName !== undefined || input.magicItemId || input.scrollItemId || input.ritual || input.readiedPrepare || input.readiedRelease)
    fail('XGE_INVALID_TARGET_SCOPE_UNSUPPORTED','This explicit option supports only a directly cast player level-one Charm Person with one exact targetId, never a higher slot, item, scroll, Ready or ritual.')
  if (!input.targetId) fail('TARGET_REQUIRED','Choose one exact existing creature targetId.')
  readXgeInvalidTargetSource()
  const original = structuredClone(input), command = invalidTargetWitness(original), id = input.invalidTargetEventId!
  const old = gs.getState().dmTools?.invalidSpellTargets?.receipts[id]
  if (old && old.command !== command) fail('XGE_INVALID_TARGET_EVENT_CONFLICT','Continue the exact original casting command; this event cannot cast again or change its choices.')
  if (!old && Object.keys(gs.getState().dmTools?.invalidSpellTargets?.receipts ?? {}).length >= 256)
    fail('XGE_INVALID_TARGET_RECEIPT_LIMIT','This bounded first tranche retains at most 256 original adopted casts.')
  return { id, original, command, old }
}
export type InvalidTargetCastPlan = ReturnType<typeof planInvalidTargetCast>
export function perceivedCharmResult(result: Record<string,unknown>) {
  if (result.unaffectedType === true || (result.save as {success?:boolean}|undefined)?.success === true)
    return { targetId: result.targetId, charmed: false, perceivedSave: 'succeeded' }
  return result
}
export function retainInvalidTargetCast(plan: NonNullable<InvalidTargetCastPlan>, result: Record<string,unknown>) {
  const state = gs.getState()
  const data=toolkitState()
  data.invalidSpellTargets ??= { version: 1, receipts: {} }
  data.invalidSpellTargets.receipts[plan.id] = { input: plan.original as Record<string,unknown>, command: plan.command,
    at: state.worldTimeSeconds ?? 0, source: { ...INVALID_TARGET_SOURCE }, result: structuredClone(result), resultWitness: invalidTargetWitness(result) }
}
