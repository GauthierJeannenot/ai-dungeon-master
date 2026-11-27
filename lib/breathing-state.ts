import { z } from 'zod'
import type { GameState } from './types'

export const BreathingIdSchema = z.string().min(1).max(180)
  .refine(id => !['constructor', 'prototype', '__proto__'].includes(id), 'Choose an actual safe identifier.')

export const BreathingContextSchema = z.object({
  entityId: BreathingIdSchema,
  eventId: BreathingIdSchema,
  mode: z.enum(['hold_breath', 'choking', 'air']),
  reason: z.string().trim().min(1).max(1000),
}).strict()

/** An actual successful save which could not yet stabilize its exact episode.
 * This is a source witness, never a second save or deferred hit-point grant. */
export const BreathingBlockedStabilizationSchema = z.object({
  source: z.literal('suffocation'),
  entityId: BreathingIdSchema,
  breathingEpisodeId: BreathingIdSchema,
  lifeEpisodeId: BreathingIdSchema,
  eventId: z.string().min(1).max(500),
  at: z.number().nonnegative(),
}).strict()

export const BreathingEpisodeSchema = z.object({
  id: BreathingIdSchema,
  sourceEventId: BreathingIdSchema,
  reason: z.string().trim().min(1).max(1000),
  startedAt: z.number().nonnegative(),
  constitution: z.number().int().min(1).max(30),
  constitutionModifier: z.number().int().min(-5).max(10),
  holdSeconds: z.number().int().min(30).max(660),
  graceRounds: z.number().int().min(1).max(10),
  phase: z.enum(['holding', 'choking', 'collapsed']),
  breathEndsAt: z.number().nonnegative().optional(),
  chokingAt: z.number().nonnegative().optional(),
  collapseAt: z.number().nonnegative().optional(),
  combat: z.object({
    generation: z.number().int().nonnegative(),
    notBeforeRound: z.number().int().positive(),
  }).strict().optional(),
  collapsedAt: z.number().nonnegative().optional(),
  collapsedTurnKey: z.string().min(1).max(300).optional(),
  blockedStabilization: BreathingBlockedStabilizationSchema.optional(),
}).strict().superRefine((episode, ctx) => {
  const issue = (message: string) => ctx.addIssue({ code: 'custom', message })
  const mod = Math.floor((episode.constitution - 10) / 2)
  if (episode.constitutionModifier !== mod || episode.holdSeconds !== Math.max(30, 60 * (1 + mod))
    || episode.graceRounds !== Math.max(1, mod)) issue('Breathing limits must retain their actual Constitution witness.')
  if (episode.phase === 'holding') {
    if (episode.breathEndsAt !== episode.startedAt + episode.holdSeconds
      || episode.chokingAt !== undefined || episode.collapseAt !== undefined
      || episode.collapsedAt !== undefined || episode.blockedStabilization) issue('Holding breath requires its original deadline without a later phase invented.')
  } else {
    if (episode.chokingAt === undefined || episode.collapseAt !== episode.chokingAt + 6 * episode.graceRounds
      || episode.chokingAt < episode.startedAt) issue('Choking requires its real onset and complete source grace duration.')
    if (episode.phase === 'choking' && episode.collapsedAt !== undefined)
      issue('An uncollapsed episode cannot contain a completed collapse.')
    if (episode.phase === 'collapsed' && (episode.collapsedAt === undefined || episode.collapsedAt < episode.collapseAt!))
      issue('A real collapse cannot precede its grace deadline.')
  }
  const blocked = episode.blockedStabilization
  if (blocked && (blocked.breathingEpisodeId !== episode.id || blocked.at < episode.chokingAt!))
    issue('A blocked stabilization belongs to its exact current out-of-breath episode.')
})

/** Created only by a real suffocation collapse. Actual air can end the
 * breathing episode while this zero-HP life episode still needs saves. */
export const SuffocationPlayerDyingSchema = z.object({
  source: z.literal('suffocation'),
  breathingEpisodeId: BreathingIdSchema,
  lifeEpisodeId: BreathingIdSchema,
  collapsedAt: z.number().nonnegative(),
  nextSaveAt: z.number().nonnegative(),
  sequence: z.number().int().positive(),
  skipCombatTurnKey: z.string().min(1).max(300).optional(),
}).strict().superRefine((value, ctx) => {
  if (value.nextSaveAt < value.collapsedAt + 6)
    ctx.addIssue({code:'custom',message:'The first source death save cannot precede the next six-second bookkeeping turn.'})
})
export const SuffocationPlayerSaveReceiptSchema = z.object({
  source: z.literal('suffocation'),
  breathingEpisodeId: BreathingIdSchema,
  lifeEpisodeId: BreathingIdSchema,
  at: z.number().nonnegative(),
  result: z.record(z.string(), z.unknown()),
}).strict()

export const BreathingStateSchema = z.object({
  version: z.literal(1),
  creatures: z.record(z.string(), z.object({
    entityId: BreathingIdSchema,
    episode: BreathingEpisodeSchema.optional(),
    playerDying: SuffocationPlayerDyingSchema.optional(),
    playerDeathSaveReceipts: z.record(z.string(), SuffocationPlayerSaveReceiptSchema).optional(),
    blockedRecovery: z.object({
      breathingEpisodeId: BreathingIdSchema, lifeEpisodeId: BreathingIdSchema,
      wakeAt: z.number().nonnegative(), blockedAt: z.number().nonnegative(),
      airEventId: BreathingIdSchema.optional(), resumedAt: z.number().nonnegative().optional(),
    }).strict().optional(),
    receipts: z.record(z.string(), z.object({
      command: z.string(),
      result: z.record(z.string(), z.unknown()),
    }).strict()),
  }).strict()),
}).strict().superRefine((state, ctx) => {
  if (Object.keys(state.creatures).length > 128)
    ctx.addIssue({ code: 'custom', message: 'At most 128 actual actors can have breathing histories.' })
  for (const [id, record] of Object.entries(state.creatures)) {
    if (record.entityId !== id || Object.keys(record.receipts).length > 256
      || Object.keys(record.playerDeathSaveReceipts ?? {}).length > 256
      || id !== 'player' && (record.playerDying || record.playerDeathSaveReceipts)
      || record.episode?.blockedStabilization && record.episode.blockedStabilization.entityId !== id)
      ctx.addIssue({ code: 'custom', message: 'Actor identities and bounded non-evicting breathing receipts must match.' })
  }
})

export type BreathingContextInput = z.infer<typeof BreathingContextSchema>
export type BreathingEpisode = z.infer<typeof BreathingEpisodeSchema>
export type BreathingState = z.infer<typeof BreathingStateSchema>
export type BreathingBlockedStabilization = z.infer<typeof BreathingBlockedStabilizationSchema>
export type SuffocationPlayerDying = z.infer<typeof SuffocationPlayerDyingSchema>

/** Shared state access also works while the parent adds the optional field to
 * the canonical DmToolState schema; no parallel state store is created. */
export function breathingStateOf(state: GameState): BreathingState | undefined {
  return (state.dmTools as (NonNullable<GameState['dmTools']> & { breathing?: BreathingState }) | undefined)?.breathing
}
