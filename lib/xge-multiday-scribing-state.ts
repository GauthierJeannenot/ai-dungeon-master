import { z } from 'zod'
import type { GameState } from './types'
import { CoinsSchema, copperValue } from './srd/currency'
import { multiDayScribedScrollRecipe, MULTIDAY_SCRIBING_SPELL_IDS, SCRIBING_LEVEL_POLICIES } from './srd/spell-scrolls'
import { groundGearPhysicalWitness } from './ground-gear-recovery-state'
import { MULTIDAY_SCRIBED_SCROLL_CREATION_PREFIX } from './scroll-state'

const Id = z.string().min(1).max(80).regex(/^[A-Za-z0-9][A-Za-z0-9_:.-]*$/)
  .refine(value => !['__proto__', 'constructor', 'prototype'].includes(value))
const Time = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
const Day = z.number().int().nonnegative().max(Math.floor(Number.MAX_SAFE_INTEGER / 86400) - 365)
const levelPolicy = SCRIBING_LEVEL_POLICIES[2]
export const StartMultiDayScribingSchema = z.object({
  eventId: Id, projectId: Id, scrollItemId: Id, spellId: z.enum(MULTIDAY_SCRIBING_SPELL_IDS),
  suppliesFactId: Id, paid: CoinsSchema, explicitlyAdopted: z.literal(true),
  actualOneScrollSuppliesConfirmed: z.literal(true),
}).strict()
export const WorkMultiDayScribingSchema = z.object({ eventId: Id, projectId: Id,
  activitySource: z.string().trim().min(1).max(600) }).strict()
export const AbandonMultiDayScribingSchema = z.object({ eventId: Id, projectId: Id,
  reason: z.string().trim().min(1).max(600) }).strict()
export const AdjudicateMultiDayScribingSchema = z.object({ eventId: Id, projectId: Id,
  decisionFactId: Id, extraComplicationFactId: Id, newDeadlineDay: Day, paid: CoinsSchema,
  actualDiscretionaryDecisionConfirmed: z.literal(true), actualIntroducedComplicationConfirmed: z.literal(true),
  noUnresolvedMechanicalConsequenceConfirmed: z.literal(true) }).strict()
const Site = z.object({ mapId: Id, roomId: Id, cell: z.object({ x: z.number().int(), y: z.number().int() }).strict(),
  zFeet: z.number().finite() }).strict()
const Source = z.object({ book: z.literal('xge'), sectionId: z.string().min(1), sha256: z.string(),
  foundationLine: Time, startLine: Time, endLine: Time }).strict()
const Start = z.object({ input: StartMultiDayScribingSchema, at: Time, site: Site,
  suppliesFact: z.record(z.string(), z.unknown()), source: Source, command: z.string() }).strict()
const Segment = z.object({ input: WorkMultiDayScribingSchema, from: Time, to: Time, day: Time,
  command: z.string() }).strict()
// Initial full purchase is the explicit user convention, distinct from RAW cost.
const Purchase = z.object({ at: Time, paid: CoinsSchema, command: z.string() }).strict()
const Completion = z.object({ at: Time, workEventId: Id, command: z.string() }).strict()
const Abandonment = z.object({ input: AbandonMultiDayScribingSchema, at: Time, command: z.string() }).strict()
const DelaySource = z.object({ book: z.literal('xge'), sectionId: z.string(), sha256: z.string(),
  startLine: Time, endLine: Time, complicationsSectionId: z.string(), complicationsStartLine: Time, complicationsEndLine: Time }).strict()
const Adjudication = z.object({ input: AdjudicateMultiDayScribingSchema, at: Time, workedDays: z.number().int().min(1).max(levelPolicy.requiredDays - 1),
  previousDeadlineDay: Day, decisionFact: z.record(z.string(), z.unknown()), extraComplicationFact: z.record(z.string(), z.unknown()),
  source: DelaySource, command: z.string() }).strict()
export const MultiDayScribingProjectSchema = z.object({ start: Start, segments: z.array(Segment).max(levelPolicy.requiredDays),
  purchase: Purchase, completion: Completion.optional(), abandonment: Abandonment.optional(), adjudications: z.array(Adjudication).max(16).optional() }).strict()
export type MultiDayScribingProject = z.infer<typeof MultiDayScribingProjectSchema>
export const multiDayScribingWitness = groundGearPhysicalWitness
export function multiDayScribingIdReserved(state: GameState, id: string) {
  return state.dmTools?.xgeScrollScribing?.projects?.some(p => p.start.input.scrollItemId === id) ?? false
}
/** Reserve actual registry capacity until production, independently of the
 * permanent output-identity reservation retained after abandonment. */
export function multiDayScribingReservedSlots(state: GameState) {
  return (state.dmTools?.xgeScrollScribing?.projects ?? []).filter(p => !p.completion && !p.abandonment).length
}
export function multiDayScribingCommand(event: { command: string }) {
  const { command: _, ...body } = event
  return multiDayScribingWitness(body)
}
export function multiDayScribingDeadline(p: MultiDayScribingProject, at = Infinity) {
  return p.adjudications?.filter(e => e.at <= at).at(-1)?.input.newDeadlineDay
    ?? (p.segments[0] ? p.segments[0].day + levelPolicy.requiredDays * levelPolicy.elapsedDateMultiplier - 1 : undefined)
}
export function multiDayScribingExtraPaid(p: MultiDayScribingProject) {
  return (p.adjudications ?? []).reduce((n, e) => n + copperValue(e.input.paid), 0)
}
/** Existing physical producers/reservations only, including not-yet-recovered gear. */
export function multiDayScribingOutputOccupied(state: GameState, id: string, ignoreOwnScroll = false) {
  const d = state.dmTools
  return Boolean(!ignoreOwnScroll && (state.player.inventory.some(item => item.id === id) || state.droppedItems?.[id] || d?.spellScrolls?.[id])
    || state.monsters[id] || state.npcs?.[id] || d?.objects?.[id] || d?.magicItems?.[id]
    || d?.ammunition?.prepared[id] || d?.valuables?.[id] || d?.treasures?.[id]
    || Object.values(d?.merchants?.stocks ?? {}).some(stock => stock.item.id === id)
    || Object.values(d?.poisonHarvest?.attempts ?? {}).some(p => p.input.doseItemId === id)
    || Object.values(d?.ordinaryCrafting?.projects ?? {}).some(p => p.input.outputItemIds.includes(id))
    || Object.values(d?.xgeBrewing?.projects ?? []).some(p => p.start.input.potionItemId === id)
    || Object.values(d?.groundGear?.placements ?? {}).some(p => p.itemId === id || p.sourceContainerItemId === id)
    || Object.values(d?.groundGear?.recoveries ?? {}).some(p => p.stockItemId === id)
    || Object.values(d?.groundGear?.transfers ?? {}).some(p => p.destinationStockItemId === id)
    || Object.values(d?.objects ?? {}).some(object => !object.contentsReleased
      && object.contents.some((_, index) => `${object.id}:content:${index}` === id))
    || Object.values(d?.basicPoison?.applications ?? {}).some(p => p.vialItemId === id)
    || Object.values(d?.playerPoisons?.preparations ?? {}).some(p => p.doseItemId === id)
    || Object.values(d?.playerPoisons?.clouds ?? {}).some(p => p.doseItemId === id))
}

export function validateMultiDayScribingProjects(state: GameState) {
  const projects = state.dmTools?.xgeScrollScribing?.projects ?? [], scrolls = state.dmTools?.spellScrolls ?? {}
  if (!projects.length && !Object.values(scrolls).some(r => r.creation.startsWith(MULTIDAY_SCRIBED_SCROLL_CREATION_PREFIX))) return []
  const issues: string[] = [], events = new Set<string>(), ids = new Set<string>(), supplies = new Set<string>(), outputs = new Set<string>()
  const clock = state.worldTimeSeconds ?? 0
  let open = 0
  const legacyEvents = new Set((state.dmTools?.xgeScrollScribing?.receipts ?? []).map(r => r.input.eventId))
  for (const p of projects) {
    if (!MultiDayScribingProjectSchema.safeParse(p).success) { issues.push('Malformed original multi-day scribing project.'); continue }
    const { start, segments, purchase, completion, abandonment } = p, { input, site, suppliesFact, source } = start
    const recipe = multiDayScribedScrollRecipe(input.spellId)
    if (!recipe || ids.has(input.projectId) || supplies.has(input.suppliesFactId) || outputs.has(input.scrollItemId)
      || copperValue(input.paid) !== recipe.costCp || start.at > clock
      || suppliesFact.id !== input.suppliesFactId || suppliesFact.source !== 'record_scene_fact' || suppliesFact.expires !== 'never'
      || suppliesFact.clueId || suppliesFact.subjectItemId || suppliesFact.mapId !== site.mapId || suppliesFact.roomId !== site.roomId
      || multiDayScribingWitness((suppliesFact.narrativeEffect as {cell?: unknown} | undefined)?.cell) !== multiDayScribingWitness(site.cell)
      || source.sha256 !== '519584ec7fc7da6fea056c182a22254bc807db5d077c2fc205801bd872d761bf'
      || source.foundationLine !== 1987 || source.startLine !== 2402 || source.endLine !== 2424)
      issues.push('Retain the exact source recipe, declared denominations, unique supplies and original physical scribing site.')
    for (const event of [start, ...segments, ...(p.adjudications ?? []), abandonment]) {
      if (!event) continue
      const at = 'from' in event ? event.from : event.at
      if (events.has(event.input.eventId) || legacyEvents.has(event.input.eventId) || event.command !== multiDayScribingCommand(event) || at < start.at || at > clock
        || event.input.projectId !== input.projectId)
        issues.push('Retain each original unique scribing command, project identity and actual clock receipt.')
      events.add(event.input.eventId)
    }
    for (const [index, segment] of segments.entries()) {
      if (segment.day !== Math.floor(segment.from / 86400) || segment.to !== segment.from + levelPolicy.secondsPerDay
        || segment.to > (segment.day + 1) * 86400 || segment.to > clock || segment.day > (multiDayScribingDeadline(p, segment.from) ?? segment.day)
        || index > 0 && segment.day <= segments[index - 1].day)
        issues.push('Multi-day scribing retains three distinct chronological actual eight-hour dates; waiting is no work.')
    }
    if (purchase.command !== multiDayScribingCommand(purchase) || purchase.at !== start.at || purchase.at > clock
      || copperValue(purchase.paid) !== recipe?.costCp || multiDayScribingWitness(purchase.paid) !== multiDayScribingWitness(input.paid))
      issues.push('Retain the exact full actual supplies purchase and original denominations at start, by explicit user convention.')
    let deadline = segments[0] ? segments[0].day + levelPolicy.requiredDays * levelPolicy.elapsedDateMultiplier - 1 : undefined, decisionAt = start.at, extra = 0
    const facts = new Set<string>()
    for (const e of p.adjudications ?? []) {
      const choice = e.input, day = Math.floor(e.at / 86400), worked = segments.filter(s => s.to <= e.at).length
      const fact = (f: Record<string, unknown>, id: string) => f.id === id && f.source === 'record_scene_fact'
        && f.expires === 'never' && !f.clueId && !f.subjectItemId && f.mapId === site.mapId && f.roomId === site.roomId
        && multiDayScribingWitness((f.narrativeEffect as { cell?: unknown } | undefined)?.cell) === multiDayScribingWitness(site.cell)
      if (deadline === undefined || e.previousDeadlineDay !== deadline || day <= deadline || e.at < decisionAt || worked < 1 || worked >= levelPolicy.requiredDays || e.workedDays !== worked
        || choice.newDeadlineDay < day || choice.newDeadlineDay > (segments[0]?.day ?? 0) + 365
        || abandonment && e.at > abandonment.at || choice.decisionFactId === choice.extraComplicationFactId
        || facts.has(choice.decisionFactId) || facts.has(choice.extraComplicationFactId)
        || !fact(e.decisionFact, choice.decisionFactId) || !fact(e.extraComplicationFact, choice.extraComplicationFactId)
        || e.source.sha256 !== source.sha256 || e.source.startLine !== 1989 || e.source.endLine !== 1989
        || e.source.complicationsStartLine !== 1991 || e.source.complicationsEndLine !== 1995)
        issues.push('Retain each actual overdue boundary, distinct real complication, original decision and finite new deadline.')
      extra += copperValue(choice.paid)
      if (extra > levelPolicy.costCp * levelPolicy.maxSupplementCostMultiplier) issues.push('All chosen delay supplements together are capped at250gp for the entire project, including repeated delays.')
      deadline = choice.newDeadlineDay; decisionAt = e.at; facts.add(choice.decisionFactId); facts.add(choice.extraComplicationFactId)
    }
    const complete = segments.length === levelPolicy.requiredDays
    if (!complete && !abandonment) open++
    if (Boolean(completion) !== complete || completion && (!purchase || purchase.at > completion.at
      || completion.command !== multiDayScribingCommand(completion) || completion.at !== segments[levelPolicy.requiredDays - 1].to
      || completion.workEventId !== segments[levelPolicy.requiredDays - 1].input.eventId))
      issues.push('Exactly the third actual date completes one paid physical scroll at its original final work event.')
    if (abandonment && (complete || abandonment.at < (segments.at(-1)?.to ?? start.at)))
      issues.push('Abandonment retains actual effort and cannot replace or erase a completed scroll.')
    const record = scrolls[input.scrollItemId]
    if (complete) {
      const physical = [...state.player.inventory.filter(item => item.id === input.scrollItemId),
        ...(state.droppedItems?.[input.scrollItemId] ? [state.droppedItems[input.scrollItemId].item] : [])]
      const actual = physical.length === 1 && physical.every(item => item.equipmentId === 'spell_scroll' && item.type === 'misc' && item.magical === true && item.quantity === 1)
      if (!record || record.spellId !== input.spellId || record.id !== input.scrollItemId || !record.identified
        || record.scribedCantripCasterLevel !== undefined || record.creation !== MULTIDAY_SCRIBED_SCROLL_CREATION_PREFIX + start.command
        || (record.status === 'active' ? !actual : physical.length > 0))
        issues.push('Retain one exact completed multi-day spell scroll or its consumed source tombstone.')
      if (multiDayScribingOutputOccupied(state, input.scrollItemId, true))
        issues.push('The completed scroll identity cannot simultaneously belong to another physical producer or reservation.')
    } else if (multiDayScribingOutputOccupied(state, input.scrollItemId)) {
      issues.push('An unfinished or abandoned scribing output identity remains reserved without a premature physical occupant.')
    }
    ids.add(input.projectId); supplies.add(input.suppliesFactId); outputs.add(input.scrollItemId)
  }
  if (Object.values(scrolls).some(r => r.creation.startsWith(MULTIDAY_SCRIBED_SCROLL_CREATION_PREFIX) && !projects.some(p => p.completion && p.start.input.scrollItemId === r.id)))
    issues.push('A multi-day scribed scroll requires the original completed project.')
  if (open > 1) issues.push('This bounded tranche retains only one unfinished multi-day scroll, without discarding any history.')
  if (Object.keys(scrolls).length + multiDayScribingReservedSlots(state) > 64)
    issues.push('The existing64scroll registry includes each open project reserved slot; abandonment releases only its unproduced slot, never its identity or history.')
  return [...new Set(issues)]
}
