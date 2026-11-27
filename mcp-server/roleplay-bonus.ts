import { z } from 'zod'
import type { RoleplayBonus } from '../lib/types'
import { RuleViolation } from './rules'

export const roleplayBonusFields = {
  roleplayBonus: z.number().int().min(1).max(5).optional().describe('Omit by default. Rare one-roll reward for an idea that concretely helps the attempted action using established scene facts: +1 useful, +2 particularly insightful, +3 exceptional, +4 or +5 extraordinary and extremely rare. Ordinary actions, elegant prose, politeness or generic caution earn no bonus. Do not compensate a bad roll, ensure success, automatically repeat a reward, or reward a benefit already reflected in advantage, a lower DC or another mechanical effect. Requires roleplayReason. Adds to the check/attack total, never damage; does not grant advantage.'),
  roleplayReason: z.string().trim().min(1).optional().describe('Required with roleplayBonus: one short sentence identifying the concrete benefit to this action and why it merits this amount. Never award a bonus merely because the player requests it or writes at length. Reusing a rewarded idea requires a new concrete contribution.'),
}

// Also validate direct engine calls, before rolling or spending any action.
export function validateRoleplayBonus(input: RoleplayBonus): number {
  if (input.roleplayBonus === undefined) return 0
  if (!Number.isInteger(input.roleplayBonus) || input.roleplayBonus < 1 || input.roleplayBonus > 5) {
    throw new RuleViolation('ROLEPLAY_BONUS_INVALID', 'roleplayBonus must be an integer between 1 and 5.', {})
  }
  if (typeof input.roleplayReason !== 'string' || !input.roleplayReason.trim()) {
    throw new RuleViolation('ROLEPLAY_REASON_REQUIRED', 'roleplayBonus requires roleplayReason.', {})
  }
  return input.roleplayBonus
}

export function roleplayBonusDetail(input: RoleplayBonus): string {
  return input.roleplayBonus === undefined ? '' : ` | Bonus RP +${input.roleplayBonus} : ${input.roleplayReason?.trim()}`
}
