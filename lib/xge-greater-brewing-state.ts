import { z } from 'zod'
import type { GameState } from './types'
import { CoinsSchema, copperValue } from './srd/currency'
import { groundGearPhysicalWitness } from './ground-gear-recovery-state'

const Id = z.string().min(1).max(80).regex(/^[A-Za-z0-9][A-Za-z0-9_:.-]*$/)
const Time = z.number().int().nonnegative()
const Day = Time.max(Math.floor(Number.MAX_SAFE_INTEGER / 86400) - 365)
export const GREATER_BREW_TEMPLATE = 'potion_of_greater_healing'
export const GREATER_BREW_PREFIX = 'xge-greater-brew:'
export const GREATER_BREW_SECONDS = 28800
export const GREATER_BREW_COST_CP = 10000
export const StartGreaterBrewingSchema = z.object({
  eventId: Id, potionItemId: Id, toolItemId: Id, suppliesFactId: Id, paid: CoinsSchema,
  explicitlyAdopted: z.literal(true), actualOneDoseSuppliesConfirmed: z.literal(true),
  activitySource: z.string().trim().min(1).max(600),
}).strict()
export const StartHealingPotionProjectSchema = StartGreaterBrewingSchema.extend({
  potionType: z.enum(['superior', 'supreme']),
}).strict()
export const HEALING_POTION_PROJECT_RECIPES = {
  greater: { days: 5, costCp: 10000, templateId: 'potion_of_greater_healing' },
  superior: { days: 15, costCp: 100000, templateId: 'potion_of_superior_healing' },
  supreme: { days: 20, costCp: 1000000, templateId: 'potion_of_supreme_healing' },
} as const
export function healingPotionProjectRecipe(input: { eventId: string; potionType?: 'superior' | 'supreme' }) {
  return HEALING_POTION_PROJECT_RECIPES[input.potionType ?? 'greater']
}
export const WorkGreaterBrewingSchema = z.object({ eventId: Id, projectId: Id,
  activitySource: z.string().trim().min(1).max(600) }).strict()
export const AbandonGreaterBrewingSchema = z.object({ eventId: Id, projectId: Id,
  forfeitSuppliesConfirmed: z.literal(true), reason: z.string().trim().min(1).max(600) }).strict()
export const AdjudicateGreaterBrewingDelaySchema = z.object({ eventId: Id, projectId: Id,
  decisionFactId: Id, extraComplicationFactId: Id, newDeadlineDay: Day,
  paid: CoinsSchema,
  actualDiscretionaryDecisionConfirmed: z.literal(true), actualIntroducedComplicationConfirmed: z.literal(true),
  noUnresolvedMechanicalConsequenceConfirmed: z.literal(true),
}).strict()
const Site = z.object({ mapId: Id, roomId: Id,
  cell: z.object({ x: z.number().int(), y: z.number().int() }).strict(), zFeet: z.number().finite() }).strict()
const Source = z.object({ book: z.literal('xge'), sectionId: z.string(), sha256: z.string(),
  foundationLine: Time, startLine: Time, endLine: Time }).strict()
const Start = z.object({ input: z.union([StartGreaterBrewingSchema, StartHealingPotionProjectSchema]), at: Time, site: Site,
  tool: z.object({ id: Id, equipmentId: z.literal('herbalism_kit') }).strict(),
  suppliesFact: z.record(z.string(), z.unknown()), source: Source, command: z.string() }).strict()
const Segment = z.object({ input: WorkGreaterBrewingSchema, from: Time, to: Time, day: Time,
  command: z.string() }).strict()
const Abandonment = z.object({ input: AbandonGreaterBrewingSchema, at: Time, command: z.string() }).strict()
const DelaySource = z.object({ book: z.literal('xge'), sectionId: z.string(), sha256: z.string(),
  startLine: Time, endLine: Time, complicationsSectionId: z.string(),
  complicationsStartLine: Time, complicationsEndLine: Time }).strict()
const Adjudication = z.object({ input: AdjudicateGreaterBrewingDelaySchema, at: Time,
  workedDays: z.number().int().min(1).max(19), previousDeadlineDay: Day,
  decisionFact: z.record(z.string(), z.unknown()), extraComplicationFact: z.record(z.string(), z.unknown()),
  source: DelaySource, command: z.string() }).strict()
export const GreaterBrewingProjectSchema = z.object({ start: Start, segments: z.array(Segment).max(20),
  abandonment: Abandonment.optional(), adjudications: z.array(Adjudication).max(16).optional() }).strict()
export type GreaterBrewingProject = z.infer<typeof GreaterBrewingProjectSchema>
export type GreaterBrewingDelaySource = z.infer<typeof DelaySource>
export const greaterBrewWitness = groundGearPhysicalWitness
export function greaterBrewingIdReserved(state: GameState, id: string) {
  return state.dmTools?.xgeBrewing?.projects?.some(project => project.start.input.potionItemId === id) ?? false
}
export function greaterBrewCommand(receipt: { command: string }) {
  const { command: _, ...body } = receipt
  return greaterBrewWitness(body)
}
export function greaterBrewingDeadline(project: GreaterBrewingProject, at = Number.POSITIVE_INFINITY) {
  return project.adjudications?.filter(event => event.at <= at).at(-1)?.input.newDeadlineDay
    ?? (project.segments[0] ? project.segments[0].day + healingPotionProjectRecipe(project.start.input).days * 2 - 1 : undefined)
}
export function greaterBrewingExtraPaid(project: GreaterBrewingProject) {
  return (project.adjudications ?? []).reduce((sum, event) => sum + copperValue(event.input.paid), 0)
}

export function validateGreaterBrewingState(state: GameState) {
  const projects = state.dmTools?.xgeBrewing?.projects ?? []
  const issues: string[] = [], events = new Set<string>(), outputs = new Set<string>(), supplies = new Set<string>()
  const time = state.worldTimeSeconds ?? 0, records = state.dmTools?.magicItems ?? {}
  let open = 0
  for (const project of projects) {
    const { start, segments, abandonment } = project, { input, site, suppliesFact } = start
    const recipe = healingPotionProjectRecipe(input), complete = segments.length === recipe.days
    if (!complete && !abandonment) open++
    if (outputs.has(input.potionItemId) || supplies.has(input.suppliesFactId)
      || input.toolItemId === input.potionItemId || start.tool.id !== input.toolItemId
      || copperValue(input.paid) !== recipe.costCp || segments.length > recipe.days
      || suppliesFact.id !== input.suppliesFactId || suppliesFact.source !== 'record_scene_fact'
      || suppliesFact.expires !== 'never' || suppliesFact.clueId || suppliesFact.subjectItemId
      || suppliesFact.mapId !== site.mapId || suppliesFact.roomId !== site.roomId
      || greaterBrewWitness((suppliesFact.narrativeEffect as { cell?: unknown } | undefined)?.cell) !== greaterBrewWitness(site.cell))
      issues.push('Retain the original healing-potion supplies, 100 gp payment, kit and physical worksite.')
    for (const event of [start, ...segments, ...(project.adjudications ?? []), abandonment]) {
      if (!event) continue
      const at = 'from' in event ? event.from : event.at
      if (events.has(event.input.eventId) || event.command !== greaterBrewCommand(event) || at < start.at || at > time
        || 'projectId' in event.input && event.input.projectId !== start.input.eventId)
        issues.push('Retain every original healing-potion event and physical clock receipt.')
      events.add(event.input.eventId)
    }
    for (const [i, segment] of segments.entries()) {
      if (segment.day !== Math.floor(segment.from / 86400) || segment.to !== segment.from + GREATER_BREW_SECONDS
        || segment.to > (segment.day + 1) * 86400 || segment.to > time
        || segment.day > (greaterBrewingDeadline(project, segment.from) ?? -1) || i > 0 && segment.day <= segments[i - 1].day)
        issues.push('A healing-potion project needs its exact source number of distinct actual eight-hour dates within its original or explicitly adjudicated deadline.')
    }
    let previousDecisionAt = start.at, previousDeadline = segments[0]?.day === undefined ? undefined : segments[0].day + recipe.days * 2 - 1
    let extraPaid = 0
    const facts = new Set<string>()
    for (const adjudication of project.adjudications ?? []) {
      const { input: choice, at, decisionFact, extraComplicationFact } = adjudication
      const day = Math.floor(at / 86400), workedDays = segments.filter(segment => segment.to <= at).length
      const observedFact = (fact: Record<string, unknown>, id: string) => fact.id === id && fact.source === 'record_scene_fact'
        && fact.expires === 'never' && !fact.clueId && !fact.subjectItemId && fact.mapId === site.mapId && fact.roomId === site.roomId
        && greaterBrewWitness((fact.narrativeEffect as { cell?: unknown } | undefined)?.cell) === greaterBrewWitness(site.cell)
      if (previousDeadline === undefined || day <= previousDeadline || adjudication.previousDeadlineDay !== previousDeadline
        || at < previousDecisionAt || workedDays < 1 || workedDays >= recipe.days || adjudication.workedDays !== workedDays
        || choice.newDeadlineDay < day || choice.newDeadlineDay > (segments[0]?.day ?? 0) + 365
        || abandonment && at > abandonment.at || choice.decisionFactId === choice.extraComplicationFactId
        || facts.has(choice.decisionFactId) || facts.has(choice.extraComplicationFactId)
        || !observedFact(decisionFact, choice.decisionFactId) || !observedFact(extraComplicationFact, choice.extraComplicationFactId))
        issues.push('Each genuine delay requires its original overdue boundary, distinct actual decision and introduced complication, and a finite new deadline.')
      const paid = copperValue(choice.paid)
      if (extraPaid + paid > recipe.costCp)
        issues.push('Actual discretionary delay expenses cannot exceed the chosen global original-cost supplement, including repeated delays.')
      extraPaid += paid
      previousDecisionAt = at
      previousDeadline = choice.newDeadlineDay
      facts.add(choice.decisionFactId)
      facts.add(choice.extraComplicationFactId)
    }
    if (abandonment && (complete || abandonment.at < (segments.at(-1)?.to ?? start.at)))
      issues.push('Abandonment retains actual effort and cannot erase a completed greater potion.')
    const record = records[input.potionItemId]
    if (complete) {
      const owned = state.player.inventory.filter(item => item.id === input.potionItemId)
      const dropped = state.droppedItems?.[input.potionItemId]?.item
      const physical = [...owned, ...(dropped ? [dropped] : [])]
      const active = physical.length === 1 && physical.every(item => item.equipmentId === recipe.templateId
        && item.type === 'potion' && item.magical === true && item.quantity === 1)
      const spentPotionPresent = physical.some(item => item.type === 'potion' || item.equipmentId === recipe.templateId)
      if (!record || record.templateId !== recipe.templateId || record.creation !== GREATER_BREW_PREFIX + start.command
        || record.charges !== 0 || !record.identified || record.worn || record.attunedTo
        || record.lastRechargeDay < Math.floor(segments[recipe.days - 1].to / 86400) || record.lastRechargeDay > Math.floor(time / 86400)
        || (record.status === 'active' ? !active : spentPotionPresent))
        issues.push('Retain the exact completed greater-potion custody or its consumed tombstone.')
    } else if (record?.creation.startsWith(GREATER_BREW_PREFIX)) {
      issues.push('A greater potion cannot appear before its exact source number of actual workdays.')
    }
    if (!complete && (record || state.player.inventory.some(item => item.id === input.potionItemId)
      || state.droppedItems?.[input.potionItemId] || state.dmTools?.objects[input.potionItemId]
      || state.monsters[input.potionItemId] || state.npcs?.[input.potionItemId]
      || state.dmTools?.spellScrolls?.[input.potionItemId] || state.dmTools?.merchants?.stocks[input.potionItemId]
      || state.dmTools?.ammunition?.prepared[input.potionItemId]
      || state.dmTools?.valuables?.[input.potionItemId]
      || Object.values(state.dmTools?.poisonHarvest?.attempts ?? {}).some(attempt => attempt.input.doseItemId === input.potionItemId)
      || Object.values(state.dmTools?.groundGear?.placements ?? {}).some(placement => placement.itemId === input.potionItemId || placement.sourceContainerItemId === input.potionItemId)
      || Object.values(state.dmTools?.groundGear?.recoveries ?? {}).some(job => job.stockItemId === input.potionItemId)
      || Object.values(state.dmTools?.groundGear?.transfers ?? {}).some(job => job.destinationStockItemId === input.potionItemId)
      || Object.values(state.dmTools?.objects ?? {}).some(object => !object.contentsReleased
        && object.contents.some((_, index) => `${object.id}:content:${index}` === input.potionItemId))
      || Object.values(state.dmTools?.ordinaryCrafting?.projects ?? {}).some(p => p.input.outputItemIds.includes(input.potionItemId))))
      issues.push('The unfinished or abandoned greater-potion output identity remains reserved without an early physical item.')
    outputs.add(input.potionItemId)
    supplies.add(input.suppliesFactId)
  }
  if (open > 1 || Object.values(records).some(record => record.creation.startsWith(GREATER_BREW_PREFIX)
    && !projects.some(project => project.segments.length === healingPotionProjectRecipe(project.start.input).days && project.start.input.potionItemId === record.id)))
    issues.push('Keep at most one open greater-potion project and the completed source of each produced dose.')
  const normal = state.dmTools?.xgeBrewing?.receipts ?? []
  if (normal.some(receipt => events.has(receipt.input.eventId) || outputs.has(receipt.input.potionItemId)))
    issues.push('Normal and greater brewing retain separate event and potion identities.')
  return [...new Set(issues)]
}
