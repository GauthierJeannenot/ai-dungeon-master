import {
  BREW_CREATION_PREFIX, BREW_POTION_COST_CP, BREW_POTION_ID, BREW_POTION_SECONDS,
  BrewHealingPotionSchema, brewWitness, type BrewingReceipt,
} from '../lib/xge-brewing-state'
import { COIN_IDS, copperValue, emptyCoins } from '../lib/srd/currency'
import { MAGIC_ITEMS } from '../lib/srd/magic-items'
import { AFFLICTIONS } from '../lib/srd/afflictions'
import { downtimeCraftSupplyUsed, downtimeIntervalIssue } from '../lib/downtime-ledger'
import { multiDayScribingIdReserved } from '../lib/xge-multiday-scribing-state'
import { entityGroundContact, entityVerticalContext } from '../lib/jumping-state'
import { fullyImmersedInWater } from '../lib/underwater-rules'
import { breathingActivityIssue } from '../lib/activity-preflight'
import { groundGearRecoveryActivityIssue } from '../lib/ground-gear-recovery-state'
import type { GameState } from '../lib/types'
import { available, advanceHeroTime, now } from './hero-rules'
import { assertGameTimeAdvance } from './time-preflight'
import { readXgeBrewingSource, readXgeHealingPotionProjectSource, readXgeGreaterBrewingDelaySource } from './rules-library'
import { magicDay } from './magic-items'
import { afterInventoryChange, equipmentId, freeHands } from './equipment'
import { assertToolkitReach, toolkitError, toolkitState } from './toolkit'
import * as gs from './game-state'
import * as rules from './rules'

export function assertBrewingOutputIdFree(state: GameState, id: string, ownProjectId?: string) {
  if (multiDayScribingIdReserved(state, id)) toolkitError('XGE_SCRIBE_OUTPUT_ID_RESERVED', 'That physical identity belongs to its original multi-day scroll project, including abandoned or consumed history.')
  const data = state.dmTools
  const ordinary = Object.values(data?.ordinaryCrafting?.projects ?? {}).some(project => project.input.outputItemIds.includes(id))
  const merchant = Object.values(data?.merchants?.stocks ?? {}).some(stock => stock.item.id === id)
  const pendingContents = Object.values(data?.objects ?? {}).some(object => !object.contentsReleased
    && object.contents.some((_, index) => `${object.id}:content:${index}` === id))
  const promised = Object.values(data?.poisonHarvest?.attempts ?? {}).some(attempt => attempt.input.doseItemId === id)
    || Object.values(data?.groundGear?.placements ?? {}).some(placement => placement.itemId === id || placement.sourceContainerItemId === id)
    || Object.values(data?.groundGear?.recoveries ?? {}).some(job => job.stockItemId === id)
    || Object.values(data?.groundGear?.transfers ?? {}).some(job => job.destinationStockItemId === id)
  const poisonDose = Object.values(data?.basicPoison?.applications ?? {}).some(a => a.vialItemId === id)
    || Object.values(data?.playerPoisons?.preparations ?? {}).some(a => a.doseItemId === id)
    || Object.values(data?.playerPoisons?.clouds ?? {}).some(a => a.doseItemId === id)
  if (state.player.inventory.some(item => item.id === id) || state.droppedItems?.[id]
    || gs.getPersistedMaximumHpTarget(id) || state.npcs?.[id] || data?.magicItems?.[id]
    || data?.spellScrolls?.[id] || data?.objects?.[id] || data?.ammunition?.prepared[id] || data?.valuables?.[id] || promised
    || ordinary || merchant || poisonDose || pendingContents
    || data?.xgeBrewing?.projects?.some(project => project.start.input.potionItemId === id
      && project.start.input.eventId !== ownProjectId))
    toolkitError('XGE_BREW_OUTPUT_ID_CONFLICT', 'Choose a new physical potion identity. Existing, reserved and spent identities remain intact.')
}

export function validateXgeBrewingSource(state: GameState) {
  const receipts = state.dmTools?.xgeBrewing?.receipts
  const projects = state.dmTools?.xgeBrewing?.projects ?? []
  if (!receipts?.length && !projects.length) return []
  const expected = brewWitness(readXgeBrewingSource())
  const delays = projects.flatMap(project => project.adjudications ?? [])
  const delayExpected = delays.length ? brewWitness(readXgeGreaterBrewingDelaySource()) : undefined
  return (receipts ?? []).every(receipt => brewWitness(receipt.source) === expected)
    && projects.every(project => brewWitness(project.start.source) === brewWitness(readXgeHealingPotionProjectSource(project.start.input)))
    && delays.every(event => brewWitness(event.source) === delayExpected)
    ? [] : ['Retain the original supplied Xanathar brewing source.']
}

function brewResult(receipt: BrewingReceipt, replayed: boolean) {
  return { success: true, replayed, potionItemId: receipt.input.potionItemId, templateId: BREW_POTION_ID,
    paidCp: BREW_POTION_COST_CP, seconds: BREW_POTION_SECONDS, receipt }
}

export function brewHealingPotion(raw: unknown) {
  const input = BrewHealingPotionSchema.parse(raw), state = gs.getState()
  const receipts = state.dmTools?.xgeBrewing?.receipts ?? []
  if (state.dmTools?.xgeBrewing?.projects?.some(project =>
    [project.start, ...project.segments, ...(project.adjudications ?? []), project.abandonment].some(event => event?.input.eventId === input.eventId)))
    toolkitError('XGE_BREW_EVENT_CONFLICT', 'That event belongs to the original greater-potion project.')
  const prior = receipts.find(receipt => receipt.input.eventId === input.eventId)
  if (prior) {
    if (brewWitness(prior.input) !== brewWitness(input))
      toolkitError('XGE_BREW_EVENT_CONFLICT', 'Retain the exact original payment, supplies, tool and potion identity.')
    return brewResult(prior, true)
  }
  if (state.phase === 'combat')
    toolkitError('XGE_BREW_DOWNTIME_REQUIRED', 'Brewing requires an actual workday outside combat.')
  available()
  rules.validateActionUse('player')
  if (state.dmTools?.rests?.active)
    toolkitError('XGE_BREW_REST_ACTIVE', 'Complete or abandon the recorded rest before this separate uninterrupted brewing activity.')
  const tool = state.player.inventory.find(item => item.id === input.toolItemId)
  if (!tool || equipmentId(tool) !== 'herbalism_kit' || !state.player.toolProficiencies?.includes('herbalism_kit'))
    toolkitError('XGE_BREW_KIT_PROFICIENCY_REQUIRED', 'Use the exact owned herbalism kit and an actual herbalism-kit proficiency.')
  if (freeHands() < 1)
    toolkitError('XGE_BREW_FREE_HAND_REQUIRED', 'Free an actual hand to use the owned kit.')
  if (receipts.length >= 64 || Object.keys(state.dmTools?.magicItems ?? {}).length >= 64)
    toolkitError('MAGIC_ITEM_LIMIT', 'The physical magic item history is full. No old potion identity is discarded.')
  assertBrewingOutputIdFree(state, input.potionItemId)
  if (downtimeCraftSupplyUsed(state, input.suppliesFactId))
    toolkitError('XGE_BREW_SUPPLIES_ALREADY_USED', 'This exact observed batch of ordinary supplies was spent on its original crafting receipt.')
  const fact = state.worldFacts?.find(entry => entry.id === input.suppliesFactId)
  const cell = fact?.narrativeEffect?.cell
  const vertical = entityVerticalContext(state, 'player')
  if (!fact || fact.expires !== 'never' || fact.clueId || fact.subjectItemId || !cell
    || !state.currentMapId || !state.currentRoomId || fact.mapId !== state.currentMapId
    || fact.roomId !== state.currentRoomId || typeof vertical.zFeet !== 'number'
    || entityGroundContact(state, 'player', cell, vertical.zFeet).contact !== true
    || fullyImmersedInWater(state, { kind: 'creature', entityId: 'player' }) !== false)
    toolkitError('XGE_BREW_SUPPLIES_SITE_REQUIRED', 'Choose the actual durable local one-dose ordinary supply fact at the supported dry worksite.')
  const site = { mapId: state.currentMapId, roomId: state.currentRoomId, cell: { ...cell }, zFeet: vertical.zFeet }
  assertToolkitReach({ ...site, surfaceZFeet: site.zFeet })
  if (copperValue(input.paid) !== BREW_POTION_COST_CP)
    toolkitError('XGE_BREW_EXACT_COST_REQUIRED', 'Choose exact held denominations totaling 25 gp for the ordinary supplies already established at this site.')
  const wallet = { ...(state.dmTools?.wallet ?? emptyCoins()) }
  for (const coin of COIN_IDS) {
    if (wallet[coin] < input.paid[coin])
      toolkitError('XGE_BREW_FUNDS_REQUIRED', 'The actual wallet does not hold these denominations.')
    wallet[coin] -= input.paid[coin]
  }
  const from = now(), to = from + BREW_POTION_SECONDS, day = Math.floor(from / 86400)
  if (to > (day + 1) * 86400)
    toolkitError('XGE_BREW_DAY_BOUNDARY', 'Choose one actual engine date with eight continuous hours available. No overnight partial brewing is represented.')
  const ledger = downtimeIntervalIssue(state, from, BREW_POTION_SECONDS, true)
  if (ledger) toolkitError('DOWNTIME_SHARED_DAY_REQUIRED', ledger)
  const activityBoundary = breathingActivityIssue(state, 'player', BREW_POTION_SECONDS)
    ?? groundGearRecoveryActivityIssue(state, BREW_POTION_SECONDS)
  if (activityBoundary) toolkitError(activityBoundary.code, activityBoundary.message)
  if (Object.values(state.dmTools?.afflictions?.records ?? {}).some(record => record.targetId === 'player'
    && AFFLICTIONS[record.templateId].kind === 'poison' && ['active','pending'].includes(record.status)
    && !record.petrificationPause && record.nextAt !== undefined && record.nextAt < to))
    toolkitError('XGE_BREW_AFFLICTION_BOUNDARY', 'Resolve the actual earlier poison event before attempting an uninterrupted workday.')
  assertGameTimeAdvance(BREW_POTION_SECONDS)
  const body: Omit<BrewingReceipt, 'command'> = { input, from, to, day, site,
    tool: { id: tool.id, equipmentId: 'herbalism_kit' }, suppliesFact: { ...structuredClone(fact) }, source: readXgeBrewingSource() }
  const receipt = { ...body, command: brewWitness(body) }

  advanceHeroTime(BREW_POTION_SECONDS)
  const data = toolkitState(), id = input.potionItemId
  data.wallet = wallet
  const brewing = data.xgeBrewing ??= { version: 1, receipts: [] }
  brewing.receipts.push(receipt)
  data.magicItems ??= {}
  data.magicItems[id] = { id, templateId: BREW_POTION_ID, creation: BREW_CREATION_PREFIX + receipt.command,
    identified: true, chargesKnown: false, charges: 0, status: 'active', worn: false, lastRechargeDay: magicDay() }
  state.droppedItems ??= {}
  state.droppedItems[id] = {
    item: { id, name: MAGIC_ITEMS[BREW_POTION_ID].label, equipmentId: BREW_POTION_ID, type: 'potion', magical: true, quantity: 1 },
    mapId: site.mapId, roomId: site.roomId, position: { ...site.cell },
  }
  afterInventoryChange()
  return brewResult(receipt, false)
}

export function inspectXgeBrewing() {
  return { receipts: gs.getState().dmTools?.xgeBrewing?.receipts ?? [],
    projects: gs.getState().dmTools?.xgeBrewing?.projects ?? [], readOnly: true }
}
