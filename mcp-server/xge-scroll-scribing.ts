import {
  SCRIBING_SECONDS, ScribeSpellScrollSchema, scribingWitness, type ScribingReceipt,
} from '../lib/xge-scroll-scribing-state'
import { SCRIBED_SCROLL_CREATION_PREFIX } from '../lib/scroll-state'
import { scribedScrollRecipe, multiDayScribedScrollRecipe, MULTIDAY_SCRIBING_SPELL_IDS } from '../lib/srd/spell-scrolls'
import { COIN_IDS, copperValue, emptyCoins } from '../lib/srd/currency'
import { AFFLICTIONS } from '../lib/srd/afflictions'
import { downtimeCraftSupplyUsed, downtimeIntervalIssue } from '../lib/downtime-ledger'
import { entityGroundContact, entityVerticalContext } from '../lib/jumping-state'
import { fullyImmersedInWater } from '../lib/underwater-rules'
import { breathingActivityIssue } from '../lib/activity-preflight'
import { groundGearRecoveryActivityIssue } from '../lib/ground-gear-recovery-state'
import type { GameState } from '../lib/types'
import { available, advanceHeroTime, now } from './hero-rules'
import { assertGameTimeAdvance } from './time-preflight'
import { readXgeScribingSource, readXgeMultiDayScribingSource, readXgeGreaterBrewingDelaySource } from './rules-library'
import { assertScrollReadable } from './spell-scrolls'
import { afterInventoryChange, equipmentId, freeHands } from './equipment'
import { assertToolkitReach, toolkitError, toolkitState } from './toolkit'
import * as gs from './game-state'
import * as rules from './rules'
import { assertGreaterBrewingIdAvailable } from './toolkit'
import { multiDayScribingReservedSlots } from '../lib/xge-multiday-scribing-state'

function assertOutputIdFree(state: GameState, id: string) {
  assertGreaterBrewingIdAvailable(id)
  const data = state.dmTools
  if (state.player.inventory.some(item => item.id === id) || state.droppedItems?.[id]
    || gs.getPersistedMaximumHpTarget(id) || state.npcs?.[id] || data?.magicItems?.[id]
    || data?.spellScrolls?.[id] || data?.objects?.[id] || data?.ammunition?.prepared[id]
    || Object.values(data?.merchants?.stocks ?? {}).some(stock => stock.item.id === id)
    || Object.values(data?.ordinaryCrafting?.projects ?? {}).some(project => project.input.outputItemIds.includes(id))
    || Object.values(data?.poisonHarvest?.attempts ?? {}).some(attempt => attempt.input.doseItemId === id))
    toolkitError('XGE_SCRIBE_OUTPUT_ID_CONFLICT', 'Choose a new physical scroll identity. Existing and spent identities remain intact.')
}

export function validateXgeScribingSource(state: GameState) {
  const data = state.dmTools?.xgeScrollScribing
  const receipts = [...(data?.receipts ?? []), ...(data?.projects ?? []).map(project => project.start)]
  if (!receipts?.length) return []
  const expected = scribingWitness(data?.projects?.length ? readXgeMultiDayScribingSource() : readXgeScribingSource())
  const delays = (data?.projects ?? []).flatMap(project => project.adjudications ?? [])
  return receipts.every(receipt => scribingWitness(receipt.source) === expected)
    && delays.every(event => scribingWitness(event.source) === scribingWitness(readXgeGreaterBrewingDelaySource()))
    ? [] : ['Retain the original supplied Xanathar spell scroll scribing source.']
}

function result(receipt: ScribingReceipt, replayed: boolean) {
  return { success: true, replayed, scrollItemId: receipt.input.scrollItemId, spellId: receipt.input.spellId,
    paidCp: copperValue(receipt.input.paid), seconds: SCRIBING_SECONDS, receipt }
}

export function scribeXgeSpellScroll(raw: unknown) {
  const input = ScribeSpellScrollSchema.parse(raw), state = gs.getState()
  const receipts = state.dmTools?.xgeScrollScribing?.receipts ?? []
  const prior = receipts.find(receipt => receipt.input.eventId === input.eventId)
  if (prior) {
    if (scribingWitness(prior.input) !== scribingWitness(input))
      toolkitError('XGE_SCRIBE_EVENT_CONFLICT', 'Retain the original spell, supplies, components, payment and scroll identity.')
    return result(prior, true)
  }
  if (state.dmTools?.xgeScrollScribing?.projects?.some(p => [p.start, ...p.segments, ...(p.adjudications ?? []), p.abandonment].some(e => e?.input.eventId === input.eventId)))
    toolkitError('XGE_SCRIBE_EVENT_CONFLICT', 'This event belongs to its retained multi-day scribing project.')
  if (state.phase === 'combat')
    toolkitError('XGE_SCRIBE_DOWNTIME_REQUIRED', 'Scribing requires an actual workday outside combat.')
  available()
  rules.validateActionUse('player')
  if (state.dmTools?.rests?.active)
    toolkitError('XGE_SCRIBE_REST_ACTIVE', 'Complete or abandon the recorded rest before this separate uninterrupted workday.')
  const recipe = scribedScrollRecipe(input.spellId)
  if (!recipe)
    toolkitError('XGE_SCRIBE_UNSUPPORTED_SPELL', 'This tranche accepts Ray of Frost, Magic Missile and Mage Armor. Specific, costly or consumed components and longer casts are deferred.')
  if (!state.player.skillProficiencies?.includes('arcana'))
    toolkitError('XGE_SCRIBE_ARCANA_REQUIRED', 'The actual spellcaster needs proficiency in Arcana, without a substitute roll.')
  if (!state.player.features?.includes('spellcasting') || !state.player.knownSpells?.includes(input.spellId))
    toolkitError('XGE_SCRIBE_SPELL_REQUIRED', 'The actual caster must have this spell prepared or known. A wizard spellbook entry alone is insufficient.')
  assertScrollReadable()
  if (freeHands() < 1)
    toolkitError('XGE_SCRIBE_FREE_HAND_REQUIRED', 'Free an actual hand for writing and access to the selected physical supplies.')
  let componentPouch: ScribingReceipt['componentPouch']
  if (recipe.requiresComponentPouch) {
    const item = state.player.inventory.find(item => item.id === input.componentPouchItemId)
    if (!item || equipmentId(item) !== 'component_pouch')
      toolkitError('XGE_SCRIBE_COMPONENT_POUCH_REQUIRED', 'Mage Armor requires an actual owned component pouch supplying its ordinary cured leather. A focus is not this physical ingredient source.')
    componentPouch = { id: item.id, equipmentId: 'component_pouch' }
  } else if (input.componentPouchItemId) {
    toolkitError('XGE_SCRIBE_COMPONENT_MISMATCH', 'This exact spell has no material component to supply.')
  }
  if (receipts.length >= 64 || Object.keys(state.dmTools?.spellScrolls ?? {}).length + multiDayScribingReservedSlots(state) >= 64)
    toolkitError('SPELL_SCROLL_LIMIT', 'The physical scroll history is full. No old scroll identity is discarded.')
  assertOutputIdFree(state, input.scrollItemId)
  if (downtimeCraftSupplyUsed(state, input.suppliesFactId))
    toolkitError('XGE_SCRIBE_SUPPLIES_ALREADY_USED', 'This exact one-use supply batch was spent on its original crafting receipt.')
  const fact = state.worldFacts?.find(entry => entry.id === input.suppliesFactId)
  const cell = fact?.narrativeEffect?.cell
  const vertical = entityVerticalContext(state, 'player')
  if (!fact || fact.source !== 'record_scene_fact' || fact.expires !== 'never' || fact.clueId || fact.subjectItemId || !cell
    || !state.currentMapId || !state.currentRoomId || fact.mapId !== state.currentMapId
    || fact.roomId !== state.currentRoomId || typeof vertical.zFeet !== 'number'
    || entityGroundContact(state, 'player', cell, vertical.zFeet).contact !== true
    || fullyImmersedInWater(state, { kind: 'creature', entityId: 'player' }) !== false)
    toolkitError('XGE_SCRIBE_SUPPLIES_SITE_REQUIRED', 'Choose a durable local fact for one actual batch of paper and ink at the supported dry worksite.')
  const site = { mapId: state.currentMapId, roomId: state.currentRoomId, cell: { ...cell }, zFeet: vertical.zFeet }
  assertToolkitReach({ ...site, surfaceZFeet: site.zFeet })
  if (copperValue(input.paid) !== recipe.costCp)
    toolkitError('XGE_SCRIBE_EXACT_COST_REQUIRED', 'Choose exact held denominations totaling 15 gp for the cantrip or 25 gp for a first-level scroll.')
  const wallet = { ...(state.dmTools?.wallet ?? emptyCoins()) }
  for (const coin of COIN_IDS) {
    if (wallet[coin] < input.paid[coin])
      toolkitError('XGE_SCRIBE_FUNDS_REQUIRED', 'The actual wallet does not hold these denominations.')
    wallet[coin] -= input.paid[coin]
  }
  const from = now(), to = from + SCRIBING_SECONDS, day = Math.floor(from / 86400)
  if (to > (day + 1) * 86400)
    toolkitError('XGE_SCRIBE_DAY_BOUNDARY', 'Choose one actual date with eight continuous hours available. Overnight partial scribing is not represented.')
  const ledger = downtimeIntervalIssue(state, from, SCRIBING_SECONDS, true)
  if (ledger) toolkitError('DOWNTIME_SHARED_DAY_REQUIRED', ledger)
  const activityBoundary = breathingActivityIssue(state, 'player', SCRIBING_SECONDS)
    ?? groundGearRecoveryActivityIssue(state, SCRIBING_SECONDS)
  if (activityBoundary) toolkitError(activityBoundary.code, activityBoundary.message)
  if (Object.values(state.dmTools?.afflictions?.records ?? {}).some(record => record.targetId === 'player'
    && AFFLICTIONS[record.templateId].kind === 'poison' && ['active','pending'].includes(record.status)
    && !record.petrificationPause && record.nextAt !== undefined && record.nextAt < to))
    toolkitError('XGE_SCRIBE_AFFLICTION_BOUNDARY', 'Resolve the actual earlier poison event before choosing an uninterrupted workday.')
  assertGameTimeAdvance(SCRIBING_SECONDS)
  const body: Omit<ScribingReceipt, 'command'> = { input, from, to, day, site,
    ...(componentPouch ? { componentPouch } : {}), suppliesFact: { ...structuredClone(fact) }, source: readXgeScribingSource() }
  const receipt = { ...body, command: scribingWitness(body) }

  advanceHeroTime(SCRIBING_SECONDS)
  const data = toolkitState(), id = input.scrollItemId
  data.wallet = wallet
  const scribing = data.xgeScrollScribing ??= { version: 1, receipts: [] }
  scribing.receipts.push(receipt)
  data.spellScrolls ??= {}
  data.spellScrolls[id] = { id, spellId: input.spellId, creation: SCRIBED_SCROLL_CREATION_PREFIX + receipt.command,
    identified: true, status: 'active', ...(recipe.spell.level === 0 ? { scribedCantripCasterLevel: 1 as const } : {}) }
  state.droppedItems ??= {}
  state.droppedItems[id] = {
    item: { id, name: 'Parchemin — ' + recipe.spell.label, equipmentId: 'spell_scroll', type: 'misc', magical: true, quantity: 1 },
    mapId: site.mapId, roomId: site.roomId, position: { ...site.cell },
  }
  afterInventoryChange()
  return result(receipt, false)
}

export function inspectXgeScrollScribing() {
  return { receipts: gs.getState().dmTools?.xgeScrollScribing?.receipts ?? [],
    projects: gs.getState().dmTools?.xgeScrollScribing?.projects ?? [],
    recipes: ['ray-of-frost','magic-missile','mage-armor'].map(id => {
      const recipe = scribedScrollRecipe(id)!
      return { spellId: id, level: recipe.spell.level, costCp: recipe.costCp, requiresComponentPouch: recipe.requiresComponentPouch }
    }), multiDayRecipes: MULTIDAY_SCRIBING_SPELL_IDS.map(spellId => {
      const recipe = multiDayScribedScrollRecipe(spellId)!
      return { spellId, level: recipe.spell.level, costCp: recipe.costCp,
        requiredDays: recipe.requiredDays, secondsPerDay: recipe.secondsPerDay }
    }), readOnly: true }
}
