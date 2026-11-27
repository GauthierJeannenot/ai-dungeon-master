import { z } from 'zod'
import type { GameState } from './types'
import { CoinsSchema, copperValue } from './srd/currency'
import { scribedScrollRecipe } from './srd/spell-scrolls'
import { SCRIBED_SCROLL_CREATION_PREFIX } from './scroll-state'
import { groundGearPhysicalWitness } from './ground-gear-recovery-state'
import { sharedDowntimeIntervalIssues } from './downtime-ledger'
import { MultiDayScribingProjectSchema, validateMultiDayScribingProjects } from './xge-multiday-scribing-state'

const Id = z.string().min(1).max(80).regex(/^[A-Za-z0-9][A-Za-z0-9_:.-]*$/)
const Time = z.number().int().nonnegative()
export const SCRIBING_SECONDS = 28800

export const ScribeSpellScrollSchema = z.object({
  eventId: Id, scrollItemId: Id, spellId: Id, suppliesFactId: Id, paid: CoinsSchema,
  componentPouchItemId: Id.optional(), explicitlyAdopted: z.literal(true),
  actualOneScrollSuppliesConfirmed: z.literal(true), activitySource: z.string().trim().min(1).max(600),
}).strict()
const ScribingSource = z.object({
  book: z.literal('xge'), sectionId: z.string(), sha256: z.string(),
  foundationLine: Time, startLine: Time, endLine: Time,
}).strict()
const Site = z.object({ mapId: Id, roomId: Id, cell: z.object({ x: z.number().int(), y: z.number().int() }).strict(),
  zFeet: z.number().finite(),
}).strict()
const Receipt = z.object({
  input: ScribeSpellScrollSchema, from: Time, to: Time, day: Time, site: Site,
  componentPouch: z.object({ id: Id, equipmentId: z.literal('component_pouch') }).strict().optional(),
  suppliesFact: z.record(z.string(), z.unknown()), source: ScribingSource, command: z.string(),
}).strict()
export const XgeScrollScribingStateSchema = z.object({ version: z.literal(1), receipts: z.array(Receipt).max(64),
  projects: z.array(MultiDayScribingProjectSchema).max(16).optional() }).strict()
export type ScribingReceipt = z.infer<typeof Receipt>
export const scribingWitness = groundGearPhysicalWitness

export function validateXgeScrollScribingState(state: GameState) {
  const receipts = state.dmTools?.xgeScrollScribing?.receipts ?? []
  const scrolls = state.dmTools?.spellScrolls ?? {}
  const scribed = Object.values(scrolls).filter(record =>
    record.creation.startsWith(SCRIBED_SCROLL_CREATION_PREFIX) || record.scribedCantripCasterLevel !== undefined)
  if (!receipts.length && !scribed.length) return [...validateMultiDayScribingProjects(state), ...sharedDowntimeIntervalIssues(state)]
  const issues: string[] = [], events = new Set<string>(), supplies = new Set<string>(), items = new Set<string>()
  let previousEnd = 0
  for (const receipt of receipts) {
    const { command, ...body } = receipt
    const { input, site, suppliesFact, componentPouch } = receipt
    const recipe = scribedScrollRecipe(input.spellId)
    const day = Math.floor(receipt.from / 86400)
    const correctPouch = recipe?.requiresComponentPouch
      ? componentPouch?.id === input.componentPouchItemId && Boolean(componentPouch) : !componentPouch && !input.componentPouchItemId
    if (!recipe || !correctPouch || command !== scribingWitness(body) || events.has(input.eventId)
      || supplies.has(input.suppliesFactId) || items.has(input.scrollItemId) || receipt.from < previousEnd
      || receipt.day !== day || receipt.to !== receipt.from + SCRIBING_SECONDS || receipt.to > (day + 1) * 86400
      || receipt.to > (state.worldTimeSeconds ?? 0) || copperValue(input.paid) !== recipe.costCp
      || suppliesFact.id !== input.suppliesFactId || suppliesFact.source !== 'record_scene_fact' || suppliesFact.expires !== 'never'
      || suppliesFact.clueId || suppliesFact.subjectItemId || suppliesFact.mapId !== site.mapId
      || suppliesFact.roomId !== site.roomId
      || scribingWitness((suppliesFact.narrativeEffect as { cell?: unknown } | undefined)?.cell) !== scribingWitness(site.cell))
      issues.push('Scribing must retain the exact source spell, supplies, component, payment and actual workday.')
    const record = scrolls[input.scrollItemId]
    const owned = state.player.inventory.filter(item => item.id === input.scrollItemId)
    const ground = state.droppedItems?.[input.scrollItemId]?.item
    const physical = [...owned, ...(ground ? [ground] : [])]
    const activeScroll = physical.length === 1 && physical.every(item => item.id === input.scrollItemId
      && item.equipmentId === 'spell_scroll' && item.type === 'misc' && item.magical === true && item.quantity === 1)
    if (!record || record.id !== input.scrollItemId || record.spellId !== input.spellId || !record.identified
      || record.creation !== SCRIBED_SCROLL_CREATION_PREFIX + command
      || record.scribedCantripCasterLevel !== (recipe?.spell.level === 0 ? 1 : undefined)
      || (record.status === 'active' ? !activeScroll : physical.some(item => item.equipmentId === 'spell_scroll')))
      issues.push('Retain the original single physical spell scroll or its consumed tombstone, with its exact cantrip level if applicable.')
    events.add(input.eventId)
    supplies.add(input.suppliesFactId)
    items.add(input.scrollItemId)
    previousEnd = receipt.to
  }
  if (scribed.some(record => !items.has(record.id))) issues.push('A scribed spell scroll requires its original source receipt.')
  return [...new Set([...issues, ...validateMultiDayScribingProjects(state), ...sharedDowntimeIntervalIssues(state)])]
}
