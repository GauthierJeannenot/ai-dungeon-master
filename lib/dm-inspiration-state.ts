import { z } from 'zod'

export const DM_INSPIRATION_ROLL_KINDS = ['attack', 'check', 'save'] as const
export type DMInspirationRollKind = typeof DM_INSPIRATION_ROLL_KINDS[number]
const id = z.string().min(1).max(80).regex(/^[a-zA-Z0-9][a-zA-Z0-9_:.-]*$/)
  .refine(value => !['constructor', 'prototype', '__proto__'].includes(value), 'Reserved identifier.')
const grant = z.object({ reason: z.string().trim().min(1).max(300), outcome: z.enum(['granted', 'capped']) }).strict()
const spend = z.object({ kind: z.enum([...DM_INSPIRATION_ROLL_KINDS,'chase_complication']), status: z.enum(['prepared', 'consumed']),
  consumedAt: z.number().nonnegative().optional() }).strict()

export const DMInspirationStateSchema = z.object({
  held: z.boolean(),
  prepared: z.object({ spendId: id, kind: z.enum(DM_INSPIRATION_ROLL_KINDS) }).strict().optional(),
  grants: z.record(id, grant).refine(records => Object.keys(records).length <= 256, 'At most 256 inspiration grant receipts.'),
  spends: z.record(id, spend).refine(records => Object.keys(records).length <= 256, 'At most 256 inspiration spend receipts.'),
}).strict().superRefine((state, ctx) => {
  if (state.held && state.prepared) ctx.addIssue({ code: 'custom', message: 'A held token and a prepared roll cannot coexist.' })
  const prepared = Object.entries(state.spends).filter(([, receipt]) => receipt.status === 'prepared')
  if (state.prepared) {
    const receipt = state.spends[state.prepared.spendId]
    if (prepared.length !== 1 || !receipt || receipt.status !== 'prepared' || receipt.kind !== state.prepared.kind)
      ctx.addIssue({ code: 'custom', message: 'The prepared roll must match exactly one active spend receipt.' })
  } else if (prepared.length) ctx.addIssue({ code: 'custom', message: 'A prepared spend receipt needs its matching roll reservation.' })
  for (const receipt of Object.values(state.spends)) {
    if ((receipt.status === 'consumed') !== (receipt.consumedAt !== undefined))
      ctx.addIssue({ code: 'custom', message: 'Only a consumed receipt carries its actual consumption time.' })
  }
})
export type DMInspirationState = z.infer<typeof DMInspirationStateSchema>
