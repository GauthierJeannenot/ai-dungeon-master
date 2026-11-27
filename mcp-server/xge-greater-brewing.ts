import {
  AbandonGreaterBrewingSchema, AdjudicateGreaterBrewingDelaySchema, GREATER_BREW_PREFIX, GREATER_BREW_SECONDS,
  StartGreaterBrewingSchema, StartHealingPotionProjectSchema, WorkGreaterBrewingSchema, healingPotionProjectRecipe,
  greaterBrewWitness, greaterBrewingDeadline, greaterBrewingExtraPaid, type GreaterBrewingProject,
} from '../lib/xge-greater-brewing-state'
import { COIN_IDS, copperValue, emptyCoins } from '../lib/srd/currency'
import { MAGIC_ITEMS } from '../lib/srd/magic-items'
import { AFFLICTIONS } from '../lib/srd/afflictions'
import { downtimeCraftSupplyUsed, downtimeIntervalIssue } from '../lib/downtime-ledger'
import { entityGroundContact, entityVerticalContext } from '../lib/jumping-state'
import { fullyImmersedInWater } from '../lib/underwater-rules'
import { breathingActivityIssue } from '../lib/activity-preflight'
import { groundGearRecoveryActivityIssue } from '../lib/ground-gear-recovery-state'
import { available, advanceHeroTime, now } from './hero-rules'
import { assertGameTimeAdvance } from './time-preflight'
import { readXgeHealingPotionProjectSource, readXgeGreaterBrewingDelaySource } from './rules-library'
import { magicDay } from './magic-items'
import { afterInventoryChange, equipmentId, freeHands } from './equipment'
import { assertToolkitReach, toolkitError, toolkitState } from './toolkit'
import { assertBrewingOutputIdFree } from './xge-brewing'
import * as gs from './game-state'
import * as rules from './rules'

const same = (a: unknown, b: unknown) => greaterBrewWitness(a) === greaterBrewWitness(b)
const projects = () => gs.getState().dmTools?.xgeBrewing?.projects ?? []
const stamp = <T extends object>(body: T) => ({ ...body, command: greaterBrewWitness(body) })
const result = (project: GreaterBrewingProject, replayed: boolean) => ({ success: true, replayed,
  projectId: project.start.input.eventId, completed: project.segments.length === healingPotionProjectRecipe(project.start.input).days,
  completedDays: project.segments.length, requiredDays: healingPotionProjectRecipe(project.start.input).days, deadlineDay: greaterBrewingDeadline(project),
  extraPaidCp: greaterBrewingExtraPaid(project), project })

function requireRecipeTool(project: GreaterBrewingProject, higher: boolean) {
  if (('potionType' in project.start.input) !== higher)
    toolkitError('XGE_BREW_RECIPE_TOOL_REQUIRED', 'Use the explicitly selected higher-potion project tools for superior or supreme recipes, and the original healing-potion tools for original greater projects.')
}

function replay(input: { eventId: string }, higher: boolean) {
  for (const project of projects()) {
    const event = [project.start, ...project.segments, ...(project.adjudications ?? []), project.abandonment].find(e => e?.input.eventId === input.eventId)
    if (!event) continue
    requireRecipeTool(project, higher)
    if (!same(event.input, input)) toolkitError('XGE_BREW_EVENT_CONFLICT', 'Retain the exact original healing-potion event.')
    return { ...result(project, true), event }
  }
  if (gs.getState().dmTools?.xgeBrewing?.receipts.some(receipt => receipt.input.eventId === input.eventId))
    toolkitError('XGE_BREW_EVENT_CONFLICT', 'That event belongs to the original normal-potion receipt.')
}

function ready() {
  const state = gs.getState()
  if (state.phase === 'combat' || state.dmTools?.rests?.active
    || Object.values(state.dmTools?.travel?.routes ?? {}).some(route => route.status === 'active'))
    toolkitError('XGE_BREW_DOWNTIME_REQUIRED', 'Choose actual downtime outside initiative, a recorded rest or an active journey.')
  available()
  rules.validateActionUse('player')
}

function kit(toolItemId: string) {
  const state = gs.getState(), item = state.player.inventory.find(entry => entry.id === toolItemId)
  if (!item || equipmentId(item) !== 'herbalism_kit' || !state.player.toolProficiencies?.includes('herbalism_kit'))
    toolkitError('XGE_BREW_KIT_PROFICIENCY_REQUIRED', 'Use the exact owned herbalism kit and actual proficiency.')
  if (freeHands() < 1) toolkitError('XGE_BREW_FREE_HAND_REQUIRED', 'Free an actual hand for the owned kit.')
}

function atSite(site: GreaterBrewingProject['start']['site']) {
  const state = gs.getState()
  if (state.currentMapId !== site.mapId || state.currentRoomId !== site.roomId
    || !same(state.player.position, site.cell)
    || entityGroundContact(state, 'player', site.cell, site.zFeet).contact !== true
    || fullyImmersedInWater(state, { kind: 'creature', entityId: 'player' }) !== false)
    toolkitError('XGE_BREW_SUPPLIES_SITE_REQUIRED', 'Return to the original physically supported dry brewing worksite.')
  assertToolkitReach({ ...site, surfaceZFeet: site.zFeet })
}

function projectById(id: string) {
  const project = projects().find(entry => entry.start.input.eventId === id)
  if (!project) toolkitError('XGE_BREW_PROJECT_REQUIRED', 'Choose the actual retained healing-potion project.')
  return project
}

export function startGreaterHealingPotion(raw: unknown, higher = false) {
  const input = higher ? StartHealingPotionProjectSchema.parse(raw) : StartGreaterBrewingSchema.parse(raw), old = replay(input, higher)
  const recipe = healingPotionProjectRecipe(input)
  if (old) return old
  ready()
  const state = gs.getState()
  if (projects().length >= 64 || projects().some(project => !project.abandonment && project.segments.length < healingPotionProjectRecipe(project.start.input).days))
    toolkitError('XGE_BREW_OPEN_PROJECT', 'Finish or explicitly abandon the original healing-potion project before starting another.')
  kit(input.toolItemId)
  if (Object.keys(state.dmTools?.magicItems ?? {}).length >= 64)
    toolkitError('MAGIC_ITEM_LIMIT', 'Retain all existing physical magic-item identities.')
  assertBrewingOutputIdFree(state, input.potionItemId)
  if (downtimeCraftSupplyUsed(state, input.suppliesFactId))
    toolkitError('XGE_BREW_SUPPLIES_ALREADY_USED', 'These exact ordinary supplies already belong to their retained crafting event.')
  const fact = state.worldFacts?.find(entry => entry.id === input.suppliesFactId)
  const vertical = entityVerticalContext(state, 'player')
  if (!fact || fact.source !== 'record_scene_fact' || fact.expires !== 'never' || fact.clueId || fact.subjectItemId
    || !state.currentMapId || !state.currentRoomId || fact.mapId !== state.currentMapId || fact.roomId !== state.currentRoomId
    || !same(fact.narrativeEffect?.cell, state.player.position) || !vertical.known || vertical.zFeet === null)
    toolkitError('XGE_BREW_SUPPLIES_SITE_REQUIRED', 'Choose the original durable local one-dose ordinary-supplies fact at this actual worksite.')
  const site = { mapId: state.currentMapId, roomId: state.currentRoomId, cell: { ...state.player.position }, zFeet: vertical.zFeet }
  atSite(site)
  if (copperValue(input.paid) !== recipe.costCp)
    toolkitError('XGE_BREW_EXACT_COST_REQUIRED', 'Select exact held denominations matching the actual source cost of the chosen healing-potion recipe.')
  const wallet = { ...(state.dmTools?.wallet ?? emptyCoins()) }
  for (const coin of COIN_IDS) {
    if (wallet[coin] < input.paid[coin]) toolkitError('XGE_BREW_FUNDS_REQUIRED', 'The actual wallet does not hold these denominations.')
    wallet[coin] -= input.paid[coin]
  }
  const start = stamp({ input, at: now(), site, tool: { id: input.toolItemId, equipmentId: 'herbalism_kit' as const },
    suppliesFact: { ...structuredClone(fact) }, source: readXgeHealingPotionProjectSource(input) })
  const project: GreaterBrewingProject = { start, segments: [] }
  const data = toolkitState(), brewing = data.xgeBrewing ??= { version: 1, receipts: [] }
  data.wallet = wallet
  ;(brewing.projects ??= []).push(project)
  afterInventoryChange()
  return { ...result(project, false), event: start, paidCp: recipe.costCp, seconds: 0 }
}

export function workGreaterHealingPotion(raw: unknown, higher = false) {
  const input = WorkGreaterBrewingSchema.parse(raw), old = replay(input, higher)
  if (old) return old
  ready()
  const state = gs.getState(), project = projectById(input.projectId)
  requireRecipeTool(project, higher)
  const recipe = healingPotionProjectRecipe(project.start.input)
  if (project.abandonment || project.segments.length >= recipe.days)
    toolkitError('XGE_BREW_EFFORT_COMPLETE', 'Only the actual unfinished greater-potion project can receive effort.')
  kit(project.start.input.toolItemId)
  atSite(project.start.site)
  assertBrewingOutputIdFree(state, project.start.input.potionItemId, project.start.input.eventId)
  if (Object.keys(state.dmTools?.magicItems ?? {}).length >= 64)
    toolkitError('MAGIC_ITEM_LIMIT', 'Retain all existing physical magic-item identities before beginning this workday.')
  const from = now(), to = from + GREATER_BREW_SECONDS, day = Math.floor(from / 86400)
  if (to > (day + 1) * 86400 || project.segments.some(segment => segment.day === day))
    toolkitError('XGE_BREW_WORKDAY_REQUIRED', 'Choose one distinct real date with eight continuous hours available.')
  if (project.segments[0] && day > (greaterBrewingDeadline(project) ?? -1))
    toolkitError('XGE_BREW_DELAY_ADJUDICATION_REQUIRED', 'The original or explicitly adjudicated deadline has elapsed. Retain the project for an explicit MJ delay adjudication; no new cost, complication or effort is inferred.')
  const ledger = downtimeIntervalIssue(state, from, GREATER_BREW_SECONDS, true)
  if (ledger) toolkitError('DOWNTIME_SHARED_DAY_REQUIRED', ledger)
  const boundary = breathingActivityIssue(state, 'player', GREATER_BREW_SECONDS)
    ?? groundGearRecoveryActivityIssue(state, GREATER_BREW_SECONDS)
  if (boundary) toolkitError(boundary.code, boundary.message)
  if (Object.values(state.dmTools?.afflictions?.records ?? {}).some(record => record.targetId === 'player'
    && AFFLICTIONS[record.templateId].kind === 'poison' && ['active', 'pending'].includes(record.status)
    && !record.petrificationPause && record.nextAt !== undefined && record.nextAt < to))
    toolkitError('XGE_BREW_AFFLICTION_BOUNDARY', 'Resolve the actual earlier poison event before an uninterrupted workday.')
  assertGameTimeAdvance(GREATER_BREW_SECONDS)
  const event = stamp({ input, from, to, day })
  advanceHeroTime(GREATER_BREW_SECONDS)
  project.segments.push(event)
  if (project.segments.length === recipe.days) {
    const id = project.start.input.potionItemId, data = toolkitState(), site = project.start.site
    ;(data.magicItems ??= {})[id] = { id, templateId: recipe.templateId,
      creation: GREATER_BREW_PREFIX + project.start.command, identified: true, chargesKnown: false,
      charges: 0, status: 'active', worn: false, lastRechargeDay: magicDay() }
    ;(state.droppedItems ??= {})[id] = { item: { id, name: MAGIC_ITEMS[recipe.templateId].label,
      equipmentId: recipe.templateId, type: 'potion', magical: true, quantity: 1 },
      mapId: site.mapId, roomId: site.roomId, position: { ...site.cell } }
    afterInventoryChange()
  }
  return { ...result(project, false), event, seconds: GREATER_BREW_SECONDS,
    ...(project.segments.length === recipe.days ? { potionItemId: project.start.input.potionItemId, templateId: recipe.templateId } : {}) }
}

export function abandonGreaterHealingPotion(raw: unknown, higher = false) {
  const input = AbandonGreaterBrewingSchema.parse(raw), old = replay(input, higher)
  if (old) return old
  const project = projectById(input.projectId)
  requireRecipeTool(project, higher)
  const recipe = healingPotionProjectRecipe(project.start.input)
  if (project.abandonment || project.segments.length >= recipe.days)
    toolkitError('XGE_BREW_EFFORT_COMPLETE', 'Retain completed doses and prior abandonment. Only an unfinished project may be abandoned.')
  const event = stamp({ input, at: now() })
  project.abandonment = event
  return { ...result(project, false), event, refundedCp: 0 }
}

export function adjudicateGreaterHealingDelay(raw: unknown, higher = false) {
  const input = AdjudicateGreaterBrewingDelaySchema.parse(raw), old = replay(input, higher)
  if (old) return old
  ready()
  const project = projectById(input.projectId), state = gs.getState(), at = now(), day = Math.floor(at / 86400)
  requireRecipeTool(project, higher)
  const recipe = healingPotionProjectRecipe(project.start.input)
  const previousDeadlineDay = greaterBrewingDeadline(project)
  if (project.abandonment || project.segments.length >= recipe.days || !project.segments.length
    || previousDeadlineDay === undefined || day <= previousDeadlineDay || (project.adjudications?.length ?? 0) >= 16)
    toolkitError('XGE_BREW_DELAY_DECISION_REQUIRED', 'Choose the real unfinished currently overdue project, with retained actual effort and bounded original decisions.')
  if (input.newDeadlineDay < day || input.newDeadlineDay > project.segments[0].day + 365)
    toolkitError('XGE_BREW_DELAY_DEADLINE_REQUIRED', 'Choose an explicit current or future engine-date deadline within 365 dates of the original first effort. No clock or effort advances.')
  atSite(project.start.site)
  const previousFacts = (project.adjudications ?? []).flatMap(event => [event.input.decisionFactId, event.input.extraComplicationFactId])
  if (input.decisionFactId === input.extraComplicationFactId || previousFacts.includes(input.decisionFactId)
    || previousFacts.includes(input.extraComplicationFactId))
    toolkitError('XGE_BREW_DELAY_DISTINCT_FACTS_REQUIRED', 'Each new delay introduces its own actual decision and extra complication, not a reused prior fact.')
  function fact(id: string) {
    const value = state.worldFacts?.find(entry => entry.id === id), site = project.start.site
    if (!value || value.source !== 'record_scene_fact' || value.expires !== 'never' || value.clueId || value.subjectItemId
      || value.mapId !== site.mapId || value.roomId !== site.roomId || !same(value.narrativeEffect?.cell, site.cell))
      toolkitError('XGE_BREW_DELAY_FACT_REQUIRED', 'Choose the durable public MJ decision and actual introduced complication at this original worksite. Consequences are resolved separately through their real procedures.')
    return { ...structuredClone(value) }
  }
  const decisionFact = fact(input.decisionFactId), extraComplicationFact = fact(input.extraComplicationFactId)
  const paidCp = copperValue(input.paid), previousExtraPaidCp = greaterBrewingExtraPaid(project)
  if (previousExtraPaidCp + paidCp > recipe.costCp)
    toolkitError('XGE_BREW_DELAY_COST_CAP', 'All actual supplementary expenses together are capped at the original source recipe cost for this project. Repeated delays cannot double the total again.')
  const wallet = { ...(state.dmTools?.wallet ?? emptyCoins()) }
  for (const coin of COIN_IDS) {
    if (wallet[coin] < input.paid[coin]) toolkitError('XGE_BREW_FUNDS_REQUIRED', 'Choose only actually held payment denominations, or explicitly no supplementary expense.')
    wallet[coin] -= input.paid[coin]
  }
  const event = stamp({ input, at, workedDays: project.segments.length, previousDeadlineDay,
    decisionFact, extraComplicationFact, source: readXgeGreaterBrewingDelaySource() })
  toolkitState().wallet = wallet
  ;(project.adjudications ??= []).push(event)
  afterInventoryChange()
  return { ...result(project, false), event, paidCp, totalCostCp: recipe.costCp + previousExtraPaidCp + paidCp,
    seconds: 0, actionSpent: false, complicationIntroducedByMj: true, automaticConsequenceApplied: false }
}
