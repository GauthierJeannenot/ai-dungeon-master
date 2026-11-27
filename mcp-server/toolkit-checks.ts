import type { AbilityCheckResult, DiceRollResult, SavingThrowResult, EntityStats, Condition } from '../lib/types'
import { resolveAbilityCheck, type AbilityCheckInput } from './ability-check'
import { reactionWindow } from './hero-combat'
import { hero, now, canCutWords } from './hero-rules'
import { toolkitResult, toolkitError } from './toolkit'
import { savingThrow } from './monster-rules'

export interface CheckedResolution { domain: string; command: Record<string, unknown> }
type CheckHandler = (command: Record<string, unknown>, result: AbilityCheckResult | SavingThrowResult) => ReturnType<typeof toolkitResult>
const handlers = new Map<string, CheckHandler>()
const attackHandlers = new Map<string, (command: Record<string, unknown>, roll: DiceRollResult) => ReturnType<typeof toolkitResult>>()
export function registerCheckedResolution(domain: string, handler: CheckHandler) { handlers.set(domain, handler) }
export function registerToolkitAttack(domain: string, handler: (command: Record<string, unknown>, roll: DiceRollResult) => ReturnType<typeof toolkitResult>) { attackHandlers.set(domain, handler) }
export function finishToolkitAttack(command: Record<string, unknown>, roll: DiceRollResult) {
  const handler = attackHandlers.get(String(command.domain))
  if (!handler) toolkitError('ATTACK_RESOLUTION_UNAVAILABLE', 'This held attack has no supported engine continuation.')
  return handler!(command, roll)
}
export function finishCheckedResolution(resolution: CheckedResolution, checked: AbilityCheckResult | SavingThrowResult, roll: DiceRollResult) {
  const handler = handlers.get(resolution.domain)
  if (!handler) toolkitError('CHECK_RESOLUTION_UNAVAILABLE', 'The saved atomic check has no supported engine continuation.')
  const resolved = 'proficient' in checked
    ? { ...checked, roll, success: roll.notation==='automatic-failure'?false:checked.dc === undefined ? undefined : roll.total >= checked.dc }
    : { ...checked, roll, success: roll.notation !== 'automatic-failure' && roll.total >= checked.dc }
  return handler!(resolution.command, resolved)
}
export function savedResolution(input: { entityId: string; ability: keyof EntityStats; dc: number; magical?: boolean; againstCondition?: Condition; origin?: import('./cover').CoverOrigin; sourceDisadvantage?: boolean;sourceAdvantage?:boolean;ignoreCoverForSave?:boolean }, resolution: CheckedResolution) {
  const saved = savingThrow(input.entityId, input.ability, input.dc, input.magical, input.againstCondition, input.origin, input.ignoreCoverForSave??false, input.sourceDisadvantage,input.sourceAdvantage)
  if (saved.roll.notation !== 'automatic-failure' && hero().inspiration.some(entry => entry.targetId === input.entityId && entry.expiresAt > now()))
    return reactionWindow('save', input.entityId, input.entityId, ['bardic_inspiration', 'decline'], {
      type: 'save', result: saved, inspiredActorId: input.entityId, toolkitResolution: resolution,
    }, saved.roll)
  return finishCheckedResolution(resolution, saved, saved.roll)
}
export function checkedResolution(input: AbilityCheckInput, resolution: CheckedResolution) {
  // The dedicated resolver validates location, target, turn and resources before
  // this roll. Only its final continuation spends the single action and mutates.
  const checked = resolveAbilityCheck({ ...input, internalHold: true, passiveContest: true })
  if(checked.roll.notation==='automatic-failure')return finishCheckedResolution(resolution,checked,checked.roll)
  const actorId = input.entityId ?? 'player', options: string[] = []
  if (canCutWords(actorId)) options.push('cutting_words_check')
  if (hero().inspiration.some(entry => entry.targetId === actorId && entry.expiresAt > now())) options.push('bardic_inspiration')
  if (options.length) {
    return reactionWindow('check', actorId, actorId, [...options, 'decline'], {
      type: 'check', result: checked, inspiredActorId: actorId, toolkitResolution: resolution,
    }, checked.roll)
  }
  return finishCheckedResolution(resolution, checked, checked.roll)
}
