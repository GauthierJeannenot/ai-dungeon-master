import { z } from 'zod'

/** Published 2014 DMG values, not 2024 encounter budgets or Xanathar ratios. */
export const ENCOUNTER_BUDGET_SOURCE = {
  book: 'dmg-2014', ruleset: '2014',
  sections: ['XP Thresholds by Character Level (2971–2993)', 'Evaluating Encounter Difficulty (3002–3043)',
    'Party Size (3045–3051)', 'The Adventuring Day / Adventuring Day XP (3073–3104)'],
} as const

const THRESHOLDS = [
  [25, 50, 75, 100], [50, 100, 150, 200], [75, 150, 225, 400], [125, 250, 375, 500],
  [250, 500, 750, 1100], [300, 600, 900, 1400], [350, 750, 1100, 1700], [450, 900, 1400, 2100],
  [550, 1100, 1600, 2400], [600, 1200, 1900, 2800], [800, 1600, 2400, 3600], [1000, 2000, 3000, 4500],
  [1100, 2200, 3400, 5100], [1250, 2500, 3800, 5700], [1400, 2800, 4300, 6400], [1600, 3200, 4800, 7200],
  [2000, 3900, 5900, 8800], [2100, 4200, 6300, 9500], [2400, 4900, 7300, 10900], [2800, 5700, 8500, 12700],
] as const
const DAILY_XP = [300, 600, 1200, 1700, 3500, 4000, 5000, 6000, 7500, 9000, 10500, 11500,
  13500, 15000, 18000, 20000, 25000, 27000, 30000, 40000] as const

const Id = z.string().min(1).max(120)
export const EncounterBudgetInputSchema = z.object({
  mode: z.enum(['planned', 'active']),
  groups: z.array(z.object({ monsterType: z.string().min(1).max(80), count: z.number().int().min(1).max(1000),
    countsForMultiplier: z.boolean() }).strict()).min(1).max(32).optional(),
  monsters: z.array(z.object({ monsterId: Id, countsForMultiplier: z.boolean() }).strict()).min(1).max(32).optional(),
}).strict().superRefine((input, ctx) => {
  if (input.mode === 'planned' && (!input.groups || input.monsters !== undefined)
    || input.mode === 'active' && (!input.monsters || input.groups !== undefined))
    ctx.addIssue({ code: 'custom', message: 'Choose planned groups OR active monster IDs, without another party, level or unrelated mode arguments.' })
})
export type EncounterBudgetInput = z.infer<typeof EncounterBudgetInputSchema>

export class EncounterBudgetError extends Error {
  constructor(public code: string, message: string) { super(message) }
}
const fail = (code: string, message: string): never => { throw new EncounterBudgetError(code, message) }

export function encounterThresholds(level: number) {
  if (!Number.isInteger(level) || level < 1 || level > 20)
    fail('ENCOUNTER_LEVEL_UNSUPPORTED', 'The 2014 DMG threshold table covers levels 1–20; do not extrapolate a source value.')
  const [easy, medium, hard, deadly] = THRESHOLDS[level - 1]
  return { easy, medium, hard, deadly }
}

export function adventuringDayXpReference(level:number){encounterThresholds(level);return DAILY_XP[level-1]}

/** The pure formula supports the published party-size cases. The MCP wrapper
 * always supplies the actual sole player, never a public party-size override. */
export function encounterMultiplier(monsterCount: number, partySize: number) {
  if (!Number.isSafeInteger(monsterCount) || monsterCount < 1)
    fail('ENCOUNTER_CONTRIBUTOR_REQUIRED', 'At least one monster must explicitly count toward the encounter multiplier.')
  if (!Number.isSafeInteger(partySize) || partySize < 1)
    fail('ENCOUNTER_PARTY_REQUIRED', 'A real positive party size is required.')
  const index = monsterCount === 1 ? 0 : monsterCount === 2 ? 1 : monsterCount <= 6 ? 2
    : monsterCount <= 10 ? 3 : monsterCount <= 14 ? 4 : 5
  const baseMultiplier = [1, 1.5, 2, 2.5, 3, 4][index]
  const multiplier = partySize < 3 ? [1.5, 2, 2.5, 3, 4, 5][index]
    : partySize >= 6 ? [0.5, 1, 1.5, 2, 2.5, 3][index] : baseMultiplier
  return { baseMultiplier, multiplier, partySizeAdjustment: partySize < 3 ? 'next_higher' as const
    : partySize >= 6 ? 'next_lower' as const : 'none' as const }
}

export interface BudgetMonster {
  count: number
  xpEach: number
  countsForMultiplier: boolean
}
export function calculateSoloEncounterBudget(level: number, monsters: readonly BudgetMonster[]) {
  const thresholds = encounterThresholds(level)
  if (!monsters.length) fail('ENCOUNTER_EMPTY', 'Choose explicit opponents; an empty scene is not an encounter assessment.')
  let rawXP = 0, totalMonsterCount = 0, multiplierMonsterCount = 0
  for (const monster of monsters) {
    if (!Number.isSafeInteger(monster.count) || monster.count < 1
      || !Number.isSafeInteger(monster.xpEach) || monster.xpEach < 0 || typeof monster.countsForMultiplier !== 'boolean')
      fail('ENCOUNTER_MONSTER_VALUES_INVALID', 'Counts and sourced XP must be nonnegative safe integers, with a positive count and an explicit multiplier decision.')
    rawXP += monster.xpEach * monster.count
    totalMonsterCount += monster.count
    if (monster.countsForMultiplier) multiplierMonsterCount += monster.count
  }
  if (![rawXP, totalMonsterCount, multiplierMonsterCount].every(Number.isSafeInteger))
    fail('ENCOUNTER_BUDGET_OVERFLOW', 'The selected encounter exceeds safe exact arithmetic.')
  const multiplier = encounterMultiplier(multiplierMonsterCount, 1)
  const adjustedXP = rawXP * multiplier.multiplier
  if (!Number.isSafeInteger(adjustedXP * 2)) fail('ENCOUNTER_BUDGET_OVERFLOW', 'Adjusted XP exceeds safe half-XP arithmetic.')
  const difficulty = adjustedXP >= thresholds.deadly ? 'deadly' : adjustedXP >= thresholds.hard ? 'hard'
    : adjustedXP >= thresholds.medium ? 'medium' : adjustedXP >= thresholds.easy ? 'easy' : 'below_easy'
  return { playerLevel: level, partySize: 1, thresholds, rawXP, adjustedXP, totalMonsterCount,
    multiplierMonsterCount, excludedFromMultiplierCount: totalMonsterCount - multiplierMonsterCount,
    ...multiplier, difficulty, adventuringDayAdjustedXPReference: DAILY_XP[level - 1],
    xpAward: null, source: ENCOUNTER_BUDGET_SOURCE }
}
