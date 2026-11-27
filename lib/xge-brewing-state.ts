import { z } from 'zod'
import { GreaterBrewingProjectSchema, validateGreaterBrewingState } from './xge-greater-brewing-state'
import type { GameState } from './types'
import { CoinsSchema, copperValue } from './srd/currency'
import { groundGearPhysicalWitness } from './ground-gear-recovery-state'
import { sharedDowntimeIntervalIssues } from './downtime-ledger'

const Id = z.string().min(1).max(80).regex(/^[A-Za-z0-9][A-Za-z0-9_:.-]*$/)
const Time = z.number().int().nonnegative()
export const BREW_POTION_ID = 'potion_of_healing'
export const BREW_POTION_SECONDS = 28800
export const BREW_POTION_COST_CP = 2500
export const BREW_CREATION_PREFIX = 'xge-brew:'

export const BrewHealingPotionSchema = z.object({
  eventId: Id, potionItemId: Id, toolItemId: Id, suppliesFactId: Id, paid: CoinsSchema,
  explicitlyAdopted: z.literal(true), actualOneDoseSuppliesConfirmed: z.literal(true),
  activitySource: z.string().trim().min(1).max(600),
}).strict()
const BrewSource = z.object({
  book: z.literal('xge'), sectionId: z.string(), sha256: z.string(),
  foundationLine: Time, startLine: Time, endLine: Time,
}).strict()
const Site = z.object({ mapId: Id, roomId: Id,
  cell: z.object({ x: z.number().int(), y: z.number().int() }).strict(), zFeet: z.number().finite(),
}).strict()
const BrewReceipt = z.object({
  input: BrewHealingPotionSchema, from: Time, to: Time, day: Time, site: Site,
  tool: z.object({ id: Id, equipmentId: z.literal('herbalism_kit') }).strict(),
  suppliesFact: z.record(z.string(), z.unknown()), source: BrewSource, command: z.string(),
}).strict()
export const XgeBrewingStateSchema = z.object({ version: z.literal(1), receipts: z.array(BrewReceipt).max(64),
  projects: z.array(GreaterBrewingProjectSchema).max(64).optional() }).strict()
export type BrewingReceipt = z.infer<typeof BrewReceipt>
export const brewWitness = groundGearPhysicalWitness

export function validateXgeBrewingState(state: GameState) {
  const receipts = state.dmTools?.xgeBrewing?.receipts ?? []
  const magic = state.dmTools?.magicItems ?? {}
  const produced = Object.values(magic).filter(item => item.creation.startsWith(BREW_CREATION_PREFIX))
  if (!receipts.length && !produced.length) return [...new Set([...validateGreaterBrewingState(state), ...sharedDowntimeIntervalIssues(state)])]
  const issues: string[] = []
  const ids = new Set<string>(), supplyIds = new Set<string>(), potions = new Set<string>()
  let previousEnd = 0
  for (const receipt of receipts) {
    const { command, ...body } = receipt
    const { input, site, suppliesFact } = receipt
    const day = Math.floor(receipt.from / 86400)
    if (command !== brewWitness(body) || ids.has(input.eventId) || supplyIds.has(input.suppliesFactId)
      || potions.has(input.potionItemId) || receipt.from < previousEnd || receipt.day !== day
      || receipt.to !== receipt.from + BREW_POTION_SECONDS || receipt.to > (day + 1) * 86400
      || receipt.to > (state.worldTimeSeconds ?? 0) || copperValue(input.paid) !== BREW_POTION_COST_CP
      || receipt.tool.id !== input.toolItemId || input.toolItemId === input.potionItemId
      || suppliesFact.id !== input.suppliesFactId || suppliesFact.expires !== 'never'
      || suppliesFact.clueId || suppliesFact.subjectItemId || suppliesFact.mapId !== site.mapId
      || suppliesFact.roomId !== site.roomId
      || brewWitness((suppliesFact.narrativeEffect as { cell?: unknown } | undefined)?.cell) !== brewWitness(site.cell))
      issues.push('A brewed potion needs the exact one-use supply fact, real workday, original payment and tool receipt.')
    const record = magic[input.potionItemId]
    const owned = state.player.inventory.filter(item => item.id === input.potionItemId)
    const dropped = state.droppedItems?.[input.potionItemId]?.item
    const physical = [...owned, ...(dropped ? [dropped] : [])]
    const canonicalActive = physical.length === 1 && physical.every(item =>
      item.id === input.potionItemId && item.equipmentId === BREW_POTION_ID
      && item.type === 'potion' && item.magical === true && item.quantity === 1)
    // A spent potion remains reserved in the magic ledger. An unrelated later
    // physical object can share its string ID without recreating this potion.
    const spentPotionPresent = physical.some(item => item.type === 'potion' || item.equipmentId === BREW_POTION_ID)
    if (!record || record.id !== input.potionItemId || record.templateId !== BREW_POTION_ID
      || record.creation !== BREW_CREATION_PREFIX + command || record.charges !== 0 || !record.identified
      || record.lastRechargeDay < Math.floor(receipt.to / 86400)
      || record.lastRechargeDay > Math.floor((state.worldTimeSeconds ?? 0) / 86400)
      || record.worn || record.attunedTo || (record.status === 'active' ? !canonicalActive : spentPotionPresent))
      issues.push('Retain the exact single canonical brewed potion and its physical custody or spent tombstone.')
    ids.add(input.eventId)
    supplyIds.add(input.suppliesFactId)
    potions.add(input.potionItemId)
    previousEnd = receipt.to
  }
  if (produced.some(item => !potions.has(item.id))) issues.push('A brewed potion cannot exist without its original source receipt.')
  return [...new Set([...issues, ...validateGreaterBrewingState(state), ...sharedDowntimeIntervalIssues(state)])]
}
