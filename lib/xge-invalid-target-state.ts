import { z } from 'zod'
import type { GameState } from './types'

export const INVALID_TARGET_SOURCE = { book: 'xge', sha256: '519584ec7fc7da6fea056c182a22254bc807db5d077c2fc205801bd872d761bf', startLine: 1109, endLine: 1113 } as const
export const InvalidTargetEventIdSchema = z.string().min(1).max(100).regex(/^[a-zA-Z0-9][a-zA-Z0-9_:.-]*$/).refine(id => !['__proto__','constructor','prototype'].includes(id))
const Value = z.record(z.string(), z.unknown())
export const InvalidTargetStateSchema = z.object({ version: z.literal(1), receipts: z.record(z.string(), z.object({
  input: Value, command: z.string(), at: z.number().nonnegative(), source: z.object({ book: z.literal('xge'), sha256: z.string(), startLine: z.literal(1109), endLine: z.literal(1113) }).strict(),
  result: Value, resultWitness: z.string(),
}).strict()).refine(receipts => Object.keys(receipts).length <= 256) }).strict()
export const invalidTargetWitness = (value: unknown): string => JSON.stringify(value, (_key,v) => v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map(key => [key,v[key]])) : v)
export function validateInvalidTargetState(state: GameState): string[] {
  const data = state.dmTools?.invalidSpellTargets
  if (!data) return []
  if (!InvalidTargetStateSchema.safeParse(data).success) return ['Invalid original XGE invalid-target casting receipts.']
  const issues: string[] = []
  for (const [id,r] of Object.entries(data.receipts)) {
    if (!InvalidTargetEventIdSchema.safeParse(id).success || id !== r.input.invalidTargetEventId || r.input.invalidTargetRule !== 'xge-2014' || r.input.spellId !== 'charm-person'
      || (r.input.slotLevel !== undefined && r.input.slotLevel !== 1) || typeof r.input.targetId !== 'string' || r.input.targetIds !== undefined
      || (r.input.casterId !== undefined && r.input.casterId !== 'player') || r.input.magicItemId !== undefined || r.input.scrollItemId !== undefined || r.input.ritual === true || r.input.readiedPrepare !== undefined || r.input.readiedRelease !== undefined
      || r.command !== invalidTargetWitness(r.input) || invalidTargetWitness(r.source) !== invalidTargetWitness(INVALID_TARGET_SOURCE)
      || r.at > (state.worldTimeSeconds ?? 0) || r.resultWitness !== invalidTargetWitness(r.result))
      issues.push('The explicit original level-one player Charm Person adoption, source and original result must survive unchanged.')
    const perceived = r.result
    if (perceived.spell !== 'charm-person' || perceived.slotLevel !== 1 || perceived.targetId !== r.input.targetId
      || invalidTargetWitness(perceived.targets) !== invalidTargetWitness([r.input.targetId]) || perceived.unaffectedType !== undefined)
      issues.push('The retained perceived cast result belongs to its exact original spell and one explicit target.')
    if (perceived.perceivedSave === 'succeeded' && (perceived.save !== undefined || perceived.immune !== undefined || perceived.charmed !== false))
      issues.push('An apparent successful save has no fabricated numeric die, invalid-type reason or distinguishable public outcome.')
  }
  return issues
}
