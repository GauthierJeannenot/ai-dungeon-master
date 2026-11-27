import { z } from 'zod'
import { PerceptionSenseSchema } from './weather-state'

const Id = z.string().min(1).max(80).regex(/^[a-zA-Z0-9][a-zA-Z0-9_:.-]*$/)
  .refine(value => !['constructor', 'prototype', '__proto__'].includes(value))
export const CheckAbilitySchema = z.enum(['str', 'dex', 'con', 'int', 'wis', 'cha'])
export const CheckSelectionSchema = z.object({ ability: CheckAbilitySchema, skill: z.string().min(1).max(40).optional(),perceptionSense:PerceptionSenseSchema.optional() }).strict()
export const GroupCheckInputSchema = CheckSelectionSchema.extend({
  eventId: Id, participants: z.array(Id).min(2).max(8), dc: z.number().int().min(0).max(100),
  reason: z.string().trim().min(1).max(600),
}).strict()
export const CheckHelpInputSchema = CheckSelectionSchema.extend({
  eventId: Id, helperId: Id, beneficiaryId: Id,
  taskCanBeAttemptedAlone: z.literal(true), collaborationIsProductive: z.literal(true),
  requiredToolId: z.string().min(1).max(80).optional(),
  reason: z.string().trim().min(1).max(600),
}).strict()
const Roll = z.object({ notation: z.string(), rolls: z.array(z.number()), modifier: z.number(), total: z.number(), detail: z.string() }).strict()
const GroupResult = z.object({ entityId: Id, ability: CheckAbilitySchema, roll: Roll, success: z.boolean(),
  perceptionSense:PerceptionSenseSchema.optional(),weatherDisadvantage:z.boolean().optional(),automaticFailure:z.boolean().optional() }).strict()
export const CheckModeStateSchema = z.object({
  groups: z.record(z.string(), z.object({ input: GroupCheckInputSchema, results: z.array(GroupResult).max(8), complete: z.boolean() }).strict()),
  help: z.record(z.string(), z.object({ input: CheckHelpInputSchema, effectId: z.string() }).strict()),
}).strict().superRefine((state, ctx) => {
  for (const [id, receipt] of Object.entries(state.groups)) {
    if (id !== receipt.input.eventId || new Set(receipt.input.participants).size !== receipt.input.participants.length
      || receipt.results.length > receipt.input.participants.length
      || receipt.results.some((result, index) => result.entityId !== receipt.input.participants[index]
        || result.ability !== receipt.input.ability||result.perceptionSense!==receipt.input.perceptionSense
        ||result.roll.notation==='automatic-failure'&&(!result.automaticFailure||result.roll.rolls.length!==0)
        || result.success !== (result.roll.notation!=='automatic-failure'&&result.roll.total >= receipt.input.dc))
      || receipt.complete !== (receipt.results.length === receipt.input.participants.length))
      ctx.addIssue({ code: 'custom', path: ['groups', id], message: 'Group receipt must preserve its ordered participants, totals and completion.' })
  }
  for (const [id, receipt] of Object.entries(state.help)) if (id !== receipt.input.eventId)
    ctx.addIssue({ code: 'custom', path: ['help', id], message: 'Help receipt event mismatch.' })
})
export type CheckModeState = z.infer<typeof CheckModeStateSchema>
export type GroupCheckInput = z.infer<typeof GroupCheckInputSchema>
export type CheckHelpInput = z.infer<typeof CheckHelpInputSchema>
