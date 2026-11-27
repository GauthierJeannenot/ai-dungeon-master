import { z } from 'zod'
import type { GameState } from './types'
import { groundGearPhysicalWitness } from './ground-gear-recovery-state'
import { CoinsSchema, copperValue } from './srd/currency'
import { getMonsterRecord } from './srd/monsters'
import { sharedDowntimeIntervalIssues } from './downtime-ledger'

const Id = z.string().trim().min(1).max(100)
const Note = z.string().trim().min(1).max(600)
const Fact = z.record(z.string(), z.unknown())
const Time = z.number().int().nonnegative()
const Cell = z.object({ x: z.number().int().nonnegative(), y: z.number().int().nonnegative() }).strict()
const Dice = z.object({ notation: z.string(), rolls: z.array(z.number()), modifier: z.number(), total: z.number(), detail: z.string() }).passthrough()
export const researchDay = (seconds: number) => Math.floor(seconds / 86400)
export const researchBonus = (cp: number) => Math.min(6, Math.max(0, Math.floor((cp - 5000) / 5000)))
export const researchLoreCount = (total: number) => total >= 21 ? 3 : total >= 11 ? 2 : total >= 6 ? 1 : 0
export const researchWitness = groundGearPhysicalWitness

export const AdoptXgeResearchSchema = z.object({ eventId: Id, decisionFactId: Id, explicitlyAdopted: z.literal(true) }).strict()
export const StartXgeResearchSchema = z.object({
  eventId: Id, projectId: Id, profileId: Id, accessFactId: Id, exceptionalAccessFactId: Id.optional(),
  siteKind: z.enum(['library', 'sage']), sageId: Id.optional(), actualAccessConfirmed: z.literal(true),
  actualExceptionalAccessConfirmed: z.literal(true).optional(),
}).strict()
export const WorkXgeResearchSchema = z.object({
  eventId: Id, projectId: Id, seconds: z.number().int().min(1).max(28800), paid: CoinsSchema.optional(),
  restActivity: z.enum(['light', 'strenuous']), activitySource: Note,
}).strict()
export const ResolveXgeResearchSchema = z.object({
  eventId: Id, projectId: Id, selection: z.enum(['roll', 'choose']),
  chosenRow: z.number().int().min(1).max(6).optional(), selectionFactId: Id.optional(),
}).strict()
export const SettleXgeResearchSchema = z.object({
  eventId: Id, projectId: Id, loreIds: z.array(Id).max(3), complicationFactId: Id.optional(),
  actualComplicationAdjudicated: z.literal(true).optional(),
}).strict()
export const CancelXgeResearchSchema = z.object({ eventId: Id, projectId: Id, reason: Note }).strict()

export const ResearchSourceSchema = z.object({
  book: z.literal('xge'), sectionId: z.string(), sha256: z.string(),
  foundationStartLine: z.number().int(), foundationEndLine: z.number().int(),
  startLine: z.number().int(), endLine: z.number().int(),
}).strict()
const ProfileRef = z.object({ id: Id, sourceSha256: z.string(), sourceUrl: z.string() }).strict()
const Site = z.object({ mapId: Id, roomId: Id, cell: Cell, zFeet: z.number().finite() }).strict()
const Lore = z.object({ id: Id, text: z.string() }).strict()
const base = { at: Time, command: z.string() }
const Start = z.object({ ...base, operation: z.literal('start'), input: StartXgeResearchSchema,
  payload: z.object({ profile: ProfileRef, site: Site, accessFact: Fact, exceptionalFact: Fact.optional(), sage: Fact.optional() }).strict() }).strict()
const Work = z.object({ ...base, operation: z.literal('work'), input: WorkXgeResearchSchema,
  payload: z.object({ from: Time, to: Time, day: Time, paidCp: Time }).strict() }).strict()
const Resolve = z.object({ ...base, operation: z.literal('resolve'), input: ResolveXgeResearchSchema,
  payload: z.object({ check: z.object({ ability: z.literal('int'), roll: Dice }).passthrough(),
    bonus: z.number().int().min(0).max(6), total: z.number(), loreCount: z.number().int().min(0).max(3),
    chance: Dice, tableRoll: Dice.optional(), row: z.number().int().min(1).max(6).optional(), selectionFact: Fact.optional(),
  }).strict() }).strict()
const Settle = z.object({ ...base, operation: z.literal('settle'), input: SettleXgeResearchSchema,
  payload: z.object({ lore: z.array(Lore).max(3), complicationFact: Fact.optional() }).strict() }).strict()
const Cancel = z.object({ ...base, operation: z.literal('cancel'), input: CancelXgeResearchSchema }).strict()
const ResearchEventSchema = z.discriminatedUnion('operation', [Start, Work, Resolve, Settle, Cancel])
const Pending = z.object({
  input: ResolveXgeResearchSchema, at: Time, selectionFact: Fact.optional(), heldWitness: z.string().optional(), command: z.string(),
}).strict()
export const XgeResearchStateSchema = z.object({
  version: z.literal(1),
  adoption: z.object({ input: AdoptXgeResearchSchema, at: Time, fact: Fact, source: ResearchSourceSchema, command: z.string() }).strict(),
  events: z.array(ResearchEventSchema).max(4095), pending: Pending.optional(),
}).strict()
export type XgeResearchState = z.infer<typeof XgeResearchStateSchema>
export type ResearchEvent = z.infer<typeof ResearchEventSchema>
type EventBy<T extends ResearchEvent['operation']> = Extract<ResearchEvent, { operation: T }>
export type ResearchProject = {
  start: EventBy<'start'>, work: EventBy<'work'>[], resolution?: EventBy<'resolve'>,
  settlement?: EventBy<'settle'>, cancellation?: EventBy<'cancel'>,
}

export function researchProjects(events: readonly ResearchEvent[]): Map<string, ResearchProject> {
  const projects = new Map<string, ResearchProject>()
  for (const event of events) {
    const id = event.input.projectId
    const project = projects.get(id)
    if (event.operation === 'start') projects.set(id, { start: event, work: [] })
    else if (project) {
      if (event.operation === 'work') project.work.push(event)
      if (event.operation === 'resolve') project.resolution = event
      if (event.operation === 'settle') project.settlement = event
      if (event.operation === 'cancel') project.cancellation = event
    }
  }
  return projects
}

export function researchDays(project: ResearchProject) {
  const hours = new Map<number, number>()
  for (const { payload } of project.work) hours.set(payload.day, (hours.get(payload.day) ?? 0) + payload.to - payload.from)
  return [...hours].filter(([, seconds]) => seconds === 28800).map(([day]) => day)
}

export function researchDeadline(project: ResearchProject) {
  return project.work[0] ? project.work[0].payload.day + 9 : null
}

export function researchProfile(id: string) {
  const record = getMonsterRecord(id)
  if (!record || record.source.index !== id) return null
  const source = record.source, lore: z.infer<typeof Lore>[] = []
  const add = (text: string) => lore.push({ id: `lore-${lore.length + 1}`, text: `${source.name} — ${text}` })
  if (typeof source.type === 'string' && source.type) add(`published creature type: ${source.type}.`)
  if (typeof source.size === 'string' && source.size) add(`published size: ${source.size}.`)
  const speed = source.speed as Record<string, unknown> | undefined
  for (const mode of ['walk', 'fly', 'swim', 'climb', 'burrow']) {
    if (typeof speed?.[mode] === 'string' && /^\d+ ft\.$/.test(speed[mode])) add(`published ${mode} speed: ${speed[mode]}`)
  }
  for (const [key, field] of [['resistance', 'damage_resistances'], ['immunity', 'damage_immunities']] as const) {
    const values = source[field]
    if (!Array.isArray(values)) continue
    for (const value of values) {
      if (typeof value === 'string' && value) add(`published damage ${key}: ${value}.`)
    }
  }
  return { ref: { id, sourceSha256: record.sourceSha256, sourceUrl: record.sourceUrl }, lore }
}

export function remainingResearchLore(profileId: string, projects: Iterable<ResearchProject>) {
  const learned = new Set<string>()
  for (const p of projects) if (p.start.input.profileId === profileId)
    for (const fact of p.settlement?.payload.lore ?? []) learned.add(fact.id)
  return (researchProfile(profileId)?.lore ?? []).filter(f => !learned.has(f.id))
}

const durableFact = (fact: Record<string, unknown> | undefined, id: string | undefined) =>
  Boolean(fact && fact.id === id && fact.expires === 'never' && !fact.subjectItemId && !fact.clueId)
const same = (a: unknown, b: unknown) => researchWitness(a) === researchWitness(b)
export function validateResearchHeldWindow(state: GameState) {
  const held = state.hero?.pending, pending = state.dmTools?.xgeResearch?.pending
  const resolution = held?.command.toolkitResolution as { domain?: string; command?: { input?: unknown } } | undefined
  if (!pending && resolution?.domain !== 'xge-research') return []
  return pending && resolution?.domain === 'xge-research' && same(resolution.command?.input, pending.input)
    && pending.heldWitness === researchWitness(held) ? [] : ['Retain the actual original Research die, options and command.']
}

export function validateXgeResearchState(state: GameState): string[] {
  const d = state.dmTools?.xgeResearch
  if (!d) return validateResearchHeldWindow(state)
  if (!XgeResearchStateSchema.safeParse(d).success) return ['Invalid Research history schema.']
  const issues = validateResearchHeldWindow(state), now = state.worldTimeSeconds ?? 0
  const { command, ...adoption } = d.adoption
  if (!durableFact(adoption.fact, adoption.input.decisionFactId) || command !== researchWitness(adoption) || adoption.at > now)
    issues.push('Retain the original explicit Research adoption and source.')
  const ids = new Set([adoption.input.eventId]), projects = new Map<string, ResearchProject>()
  let prior = adoption.at
  for (const event of d.events) {
    const { command, ...body } = event
    if (command !== researchWitness(body) || ids.has(event.input.eventId) || event.at < prior || event.at > now)
      issues.push('Research history changed its command, event order, time or identity.')
    ids.add(event.input.eventId)
    const project = projects.get(event.input.projectId)
    if (event.operation === 'start') {
      const { input, payload } = event
      const profile = researchProfile(input.profileId)
      if (project || projects.size >= 64 || [...projects.values()].some(p => !p.settlement && !p.cancellation)
        || !profile || !same(profile.ref, payload.profile)
        || remainingResearchLore(input.profileId, projects.values()).length < 3
        || !durableFact(payload.accessFact, input.accessFactId)
        || (input.siteKind === 'sage' ? !input.sageId || payload.sage?.id !== input.sageId : input.sageId !== undefined || payload.sage !== undefined)
        || (input.exceptionalAccessFactId ? input.actualExceptionalAccessConfirmed !== true || input.exceptionalAccessFactId === input.accessFactId
          || !durableFact(payload.exceptionalFact, input.exceptionalAccessFactId)
          : input.actualExceptionalAccessConfirmed !== undefined || payload.exceptionalFact !== undefined))
        issues.push('Retain the original eligible profile, actual access and one open project.')
      projects.set(input.projectId, { start: event, work: [] })
    } else if (!project || project.cancellation || project.settlement) {
      issues.push('Research event needs an original open project.')
    } else if (event.operation === 'work') {
      const { input, payload } = event
      const deadline = researchDeadline(project)
      if (project.resolution || researchDays(project).length >= 5 || project.work.length >= 1024
        || payload.from < prior || payload.to !== event.at || payload.to - payload.from !== input.seconds
        || payload.day !== researchDay(payload.from) || payload.to > (payload.day + 1) * 86400
        || deadline !== null && payload.day > deadline
        || (project.work.length ? input.paid !== undefined || payload.paidCp !== 0
          : !input.paid || payload.paidCp !== copperValue(input.paid) || payload.paidCp < 5000))
        issues.push('Research effort, day boundaries and original expense must remain exact.')
      project.work.push(event)
    } else if (event.operation === 'resolve') {
      const { input, payload } = event
      const bonus = researchBonus(project.work[0]?.payload.paidCp ?? 0)
      const choiceValid = input.selection === 'choose'
        ? Boolean(input.chosenRow && durableFact(payload.selectionFact, input.selectionFactId) && !payload.tableRoll)
        : input.chosenRow === undefined && input.selectionFactId === undefined && payload.selectionFact === undefined
          && (payload.chance.total <= 10 ? payload.tableRoll?.notation === '1d6' && payload.tableRoll.total >= 1 && payload.tableRoll.total <= 6 : !payload.tableRoll)
      const row = payload.chance.total <= 10 ? input.chosenRow ?? payload.tableRoll?.total : undefined
      if (project.resolution || researchDays(project).length !== 5 || bonus !== payload.bonus
        || payload.total !== payload.check.roll.total + bonus || payload.loreCount !== researchLoreCount(payload.total)
        || payload.chance.notation !== '1d100' || payload.chance.total < 1 || payload.chance.total > 100
        || !choiceValid || payload.row !== row) issues.push('Retain the original Research INT result, expense bonus and distinct complication chance.')
      project.resolution = event
    } else if (event.operation === 'settle') {
      const { input, payload } = event
      const result = project.resolution?.payload, eligible = remainingResearchLore(project.start.input.profileId, projects.values())
      const facts = input.loreIds.map(id => eligible.find(f => f.id === id))
      if (!result || input.loreIds.length !== result.loreCount || new Set(input.loreIds).size !== input.loreIds.length
        || facts.some(f => !f) || !same(facts, payload.lore)
        || (result.row ? input.actualComplicationAdjudicated !== true || !durableFact(payload.complicationFact, input.complicationFactId)
          : input.complicationFactId !== undefined || payload.complicationFact !== undefined || input.actualComplicationAdjudicated !== undefined))
        issues.push('Research may disclose only actual selected novel profile facts and a source complication decision.')
      project.settlement = event
    } else {
      if (project.resolution || researchDays(project).length >= 5) issues.push('An actual finished Research week cannot bypass its source result.')
      project.cancellation = event
    }
    prior = event.at
  }
  if (d.pending) {
    const { command, ...body } = d.pending
    const p = projects.get(body.input.projectId)
    if (!p || p.resolution || p.settlement || p.cancellation || researchDays(p).length !== 5
      || command !== researchWitness(body) || ids.has(body.input.eventId) || body.at !== now || body.at < prior
      || (body.input.selection === 'choose'
        ? !body.input.chosenRow || !durableFact(body.selectionFact, body.input.selectionFactId)
        : body.input.chosenRow !== undefined || body.input.selectionFactId !== undefined || body.selectionFact !== undefined))
      issues.push('Research pending selection does not match its original completed week.')
  }
  return [...new Set([...issues, ...sharedDowntimeIntervalIssues(state)])]
}
