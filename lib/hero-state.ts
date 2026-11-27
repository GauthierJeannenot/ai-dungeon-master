import { z } from 'zod'
import { ConcentrationStartSchema } from './critical-spells-state'

const Cell = z.object({ x: z.number().int().nonnegative(), y: z.number().int().nonnegative() }).strict()
export const HeroEffectSchema = z.object({
  id: z.string(), kind: z.string(), sourceId: z.string(), targetIds: z.array(z.string()),
  expiresAt: z.number().nonnegative(), concentration: z.boolean().default(false),
  data: z.record(z.string(), z.unknown()).default({}),
}).strict()
export const HeroStateSchema = z.object({
  version: z.literal(1),
  hitDice: z.object({ die: z.union([z.literal(6), z.literal(8), z.literal(10)]), current: z.number().int().min(0).max(7), max: z.number().int().min(1).max(7) }),
  reactionsUsed: z.record(z.string(), z.boolean()),
  effects: z.array(HeroEffectSchema),
  concentrationId: z.string().optional(),
  concentrationIds: z.record(z.string(),z.string()).default({}),
  concentrationStart: ConcentrationStartSchema.optional(),
  aidModelVersion: z.literal(1).optional(),
  pending: z.object({ id: z.string(), kind: z.enum(['attack', 'damage', 'spell', 'movement', 'check', 'save']),
    sourceId: z.string(), targetId: z.string().optional(), options: z.array(z.string()),
    command: z.record(z.string(), z.unknown()), roll: z.any().optional(), damageRoll: z.any().optional(),
    continuation: z.record(z.string(), z.unknown()).optional(),
  }).strict().optional(),
  attackAction: z.object({ id: z.string().min(1).max(160).optional(), remaining: z.number().int().min(0).max(2), used: z.number().int().min(0).max(2) }).optional(),
  actionCredits: z.number().int().min(0).max(2).default(1),
  gold: z.number().nonnegative().optional(), // Legacy import, consumed by migrateCurrencyState.
  bonusSpellCast: z.boolean().default(false),
  actionSpellCast: z.boolean().default(false),
  lastLongRestAt: z.number().optional(),
  arcaneRecoveryDay: z.number().int().optional(),
  preparedAtRest: z.boolean().default(true),
  inspiration: z.array(z.object({ targetId: z.string(), expiresAt: z.number(), die: z.union([z.literal(6), z.literal(8)]) })),
  corpseTimes: z.record(z.string(), z.number()),
  turnStarted: z.record(z.string(), z.number()),
  movementTrail:z.array(Cell).default([]),
}).strict()
export type HeroState = z.infer<typeof HeroStateSchema>
export type HeroEffect = z.infer<typeof HeroEffectSchema>

// Shared by the authoritative attacks and the live sheet; ac remains the
// equipment baseline in PlayerState so timed spell defenses cannot drift it.
export function heroArmorClass(entity:{id:string;ac:number;stats:{dex:number}},state?:HeroState,time=0):number {
  const active=state?.effects.filter(e=>e.targetIds.includes(entity.id)&&e.expiresAt>time)??[]
  const base=active.some(e=>e.kind==='mage-armor')?13+Math.floor((entity.stats.dex-10)/2):entity.ac
  return base+(active.some(e=>e.kind==='shield')?5:0)+active.filter(e=>e.kind==='magic-item-protection').reduce((sum,e)=>sum+Number(e.data.acBonus??0),0)
}

export function initialHeroState(classId: string, level = 7): HeroState {
  return { version: 1, hitDice: { die: classId === 'fighter' ? 10 : classId === 'wizard' ? 6 : 8, current: level, max: level },
    reactionsUsed: {}, effects: [], bonusSpellCast: false, actionSpellCast: false, preparedAtRest: true,
    inspiration: [], corpseTimes: {}, turnStarted: {}, actionCredits: 1, concentrationIds:{}, movementTrail:[] }
}
