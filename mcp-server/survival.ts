import { cackleExhaustionFloor } from '../lib/cackle-fever-state'
import { dueSleepDeprivation } from '../lib/sleep-state'
import { preflightPoisonedProvisions,completePoisonedProvisions } from './poison-nutrition-consumption'
import type { SavingThrowResult } from '../lib/types'
import { SURVIVAL_DAY_SECONDS, dailyWaterPints, foodDeprivationAfter, nutritionRestEligibility, nutritionClockBlocked,
  SurvivalBeginSchema, type SurvivalState, type SurvivalBeginInput, type ConsumeProvisionsInput, type SurvivalDayInput } from '../lib/survival-state'
import { exhaustionLevel } from '../lib/exhaustion'
import * as gs from './game-state'
import { available, now, hero, effects, alive } from './hero-rules'
import { changeExhaustion, inspectExhaustion } from './exhaustion'
import { afterInventoryChange } from './equipment'
import { toolkitError, toolkitState, toolkitResult } from './toolkit'
import { registerCheckedResolution, savedResolution } from './toolkit-checks'

type Holder = { survival?: SurvivalState }
const current = () => (gs.getState().dmTools as Holder | undefined)?.survival
const corpse = () => Boolean(gs.getPlayer().deathSaves?.dead)
const result = (value: Record<string, unknown>) => toolkitResult(value)
const read = () => current() ?? toolkitError('NUTRITION_NOT_TRACKED', 'Begin with explicit established nutrition facts; no legacy history is guessed.')
function outsideCombat() {
  available()
  if (gs.getState().phase === 'combat') toolkitError('NUTRITION_CONSUMPTION_IN_COMBAT_UNSUPPORTED', 'Eating and drinking durations/actions are not modeled in combat.')
  if (!alive(gs.getPlayer())) toolkitError('NUTRITION_ACTOR_UNAVAILABLE', 'Only the living conscious player can consume these provisions.')
}
function receipt(eventId: string, command: string) {
  const old = current()?.receipts[eventId]
  if (old && old.command !== command) toolkitError('NUTRITION_EVENT_CONFLICT', 'This eventId already records another exact nutrition operation.')
  return old ? { ...old.result, replayed: true } : undefined
}
function historyRoom() {
  if (Object.keys(current()?.receipts ?? {}).length >= 512) toolkitError('NUTRITION_HISTORY_LIMIT', 'No nutrition receipt is evicted; the 512-event history is full.')
}
function save(eventId: string, command: string, output: Record<string, unknown>) {
  read().receipts[eventId] = { command, result: output }; return output
}
function active() {
  const state = read()
  if (state.status !== 'active') toolkitError('NUTRITION_SUSPENDED', 'Resume the actual post-death history explicitly; deprivation is not reset.')
  if (corpse()) toolkitError('NUTRITION_ACTOR_DEAD', 'Nutrition does not advance on a corpse.')
  return state
}
const dayAt = (index: number, startsAt: number, hotWeather: boolean) => ({ index, startsAt,
  endsAt: startsAt + SURVIVAL_DAY_SECONDS, hotWeather, foodHalfPounds: 0, waterPints: 0 })

export function inspectSurvival() {
  const state = current()
  return { tracked: !!state, status: corpse() && state ? 'dead' : state?.status,
    day: state?.day, foodDebtHalfDays: state?.foodDebtHalfDays, foodDebtAtLeast: state?.foodDebtAtLeast ?? false, priorDeprivation: state?.priorDeprivation,
    provisions: state?.provisions, pendingDay: state?.pendingDay,
    foragedFood: gs.getState().dmTools?.foraging?.foods, waterContainers: gs.getState().dmTools?.foraging?.containers,
    recovery: nutritionRestEligibility(state), nextEventDue: !!state && state.status === 'active' && !corpse() && now() >= state.day.endsAt }
}

/** Read-only gates for action/turn orchestration. The day resolver is the
 * only mutation allowed to bypass this due-event gate through an internal
 * available({ allowNutritionDue: true }) contract supplied by the parent. */
export function isSurvivalDayDue() {
  const state = current()
  return Boolean(state && state.status === 'active' && !corpse() && (state.pendingDay || now() >= state.day.endsAt))
}
export function assertSurvivalEventsResolved() {
  if (isSurvivalDayDue()) toolkitError('SURVIVAL_DAY_EVENT_DUE', 'Resolve the exact due nutrition day before another action, actor or time advance; no MCP call is generated automatically.')
}

export function beginNutritionTracking(input: SurvivalBeginInput) {
  SurvivalBeginSchema.parse(input)
  const command = JSON.stringify({ kind: 'begin', input }), old = receipt(input.eventId, command)
  if (old) return old
  outsideCombat(); historyRoom()
  const existing = current()
  if (input.operation === 'begin' && existing) toolkitError('NUTRITION_ALREADY_TRACKED', 'Beginning again cannot reset deprivation, intake or a due event.')
  if (input.operation === 'resume_after_death' && (!existing || existing.status !== 'suspended' || existing.lastDeathAt === undefined || corpse()))
    toolkitError('NUTRITION_ACTUAL_RESURRECTION_REQUIRED', 'Resume only an engine-suspended record after actual resurrection, preserving all deprivation history.')
  if (existing) {
    existing.status = 'active'; existing.day = dayAt(existing.day.index + 1, now(), input.hotWeather)
    existing.recoveryIntake = { foodHalfPounds: 0, waterPints: 0 }; delete existing.pendingDay
  } else (toolkitState() as ReturnType<typeof toolkitState> & Holder).survival = {
    version: 1, status: 'active', startedAt: now(), source: input.source,
    foodDebtHalfDays: input.foodDebtHalfDays!, priorDeprivation: input.priorDeprivation!,
    day: dayAt(0, now(), input.hotWeather), recoveryIntake: { foodHalfPounds: 0, waterPints: 0 }, provisions: {}, receipts: {},
  }
  return save(input.eventId, command, { success: true, operation: input.operation, startedAt: now(), day: { ...read().day } })
}

export function consumeProvisions(input: ConsumeProvisionsInput) {
  const command = JSON.stringify({ kind: 'consume', input }), old = receipt(input.eventId, command)
  if (old) return old
  outsideCombat(); const state = active(); historyRoom()
  const poisonPlan=preflightPoisonedProvisions(input),complete=(value:Record<string,unknown>)=>completePoisonedProvisions(poisonPlan,input,value)
  if (state.pendingDay || now() >= state.day.endsAt) toolkitError('SURVIVAL_DAY_EVENT_DUE', 'Resolve the completed day before consuming provisions for the next one; no retroactive intake.')
  const item = gs.getPlayer().inventory.find(item => item.id === input.itemId), kind = item?.equipmentId ?? item?.id
  const foundFood=gs.getState().dmTools?.foraging?.foods[input.itemId],waterContainer=gs.getState().dmTools?.foraging?.containers[input.itemId]
  if(item&&(foundFood||waterContainer)){
    const hazards=foundFood?.hazardFactIds??waterContainer!.hazardFactIds
    if(hazards.length)toolkitError('PROVISIONS_KNOWN_HAZARD_REQUIRED','This actual resource retains an explicitly established hazard. Resolve its specific source interaction before consuming; no purity or removal is invented.')
    if(foundFood){
      if(!Number.isInteger(input.units)||input.units<1||input.units>foundFood.remainingHalfPounds)
        toolkitError('PROVISIONS_AMOUNT_UNAVAILABLE','Choose positive whole half-pounds actually remaining in this collected food instance.')
      foundFood.remainingHalfPounds-=input.units;state.day.foodHalfPounds+=input.units;state.recoveryIntake.foodHalfPounds+=input.units
      if(!foundFood.remainingHalfPounds)gs.consumePlayerItem(candidate=>candidate.id===input.itemId)
      afterInventoryChange()
      return complete(save(input.eventId,command,{success:true,itemId:input.itemId,kind:'foraged_food',consumedUnits:input.units,
        remainingUnits:foundFood.remainingHalfPounds,unit:'half_pound',day:{...state.day}}))
    }
    const quarterPints=input.units*4
    if(!Number.isInteger(quarterPints)||quarterPints<1||quarterPints>waterContainer!.contentsQuarterPints)
      toolkitError('PROVISIONS_AMOUNT_UNAVAILABLE','Choose positive quarter-pint increments actually present in this exact owned container; units are pints.')
    waterContainer!.contentsQuarterPints-=quarterPints;state.day.waterPints+=input.units;state.recoveryIntake.waterPints+=input.units
    if(waterContainer!.containerType==='waterskin'){item.equipmentId=waterContainer!.contentsQuarterPints?'waterskin_full':'waterskin_empty';item.name=`Outre : ${waterContainer!.contentsQuarterPints/4} pintes d’eau`}
    afterInventoryChange()
    return complete(save(input.eventId,command,{success:true,itemId:input.itemId,kind:'tracked_water_container',consumedUnits:input.units,
      remainingUnits:waterContainer!.contentsQuarterPints/4,unit:'pint',day:{...state.day}}))
  }
  if (!item || kind !== 'ration_1_day' && kind !== 'waterskin_full') toolkitError('PROVISIONS_ITEM_REQUIRED', 'Select an exact owned canonical two-pound ration or full four-pint waterskin.')
  const existing = state.provisions[input.itemId]
  if (existing && existing.kind !== kind) toolkitError('PROVISIONS_KIND_MISMATCH', 'The physical provision differs from its persisted contents.')
  if (!existing && Object.keys(state.provisions).length >= 256) toolkitError('PROVISIONS_HISTORY_LIMIT', 'At most 256 provision instances can be tracked; spent contents are never forgotten.')
  const remaining = existing?.remainingUnits ?? 4
  if (!Number.isInteger(input.units) || input.units <= 0 || input.units > remaining)
    toolkitError('PROVISIONS_AMOUNT_UNAVAILABLE', 'Choose positive whole half-pounds of food or pints of water actually remaining in this exact instance.')
  const record = state.provisions[input.itemId] = { kind: kind as 'ration_1_day' | 'waterskin_full', remainingUnits: remaining - input.units }
  if (kind === 'ration_1_day') { state.day.foodHalfPounds += input.units; state.recoveryIntake.foodHalfPounds += input.units }
  else { state.day.waterPints += input.units; state.recoveryIntake.waterPints += input.units }
  if (!record.remainingUnits) {
    if (kind === 'ration_1_day') gs.consumePlayerItem(candidate => candidate.id === input.itemId)
    else { item!.equipmentId = 'waterskin_empty'; item!.name = 'Outre vide'; item!.description = 'Outre réelle vidée de ses quatre pintes ; aucun remplissage gratuit.' }
    afterInventoryChange()
  }
  return complete(save(input.eventId, command, { success: true, itemId: input.itemId, kind, consumedUnits: input.units,
    remainingUnits: record.remainingUnits, unit: kind === 'ration_1_day' ? 'half_pound' : 'pint', day: { ...state.day } }))
}

/** Pure guard: a day boundary can be reached, never crossed without resolving
 * its exact event. Rests use the stricter endpoint rule before any benefit. */
export function assertSurvivalTimeAdvance(seconds: number, options: { rest?: boolean; combatStep?: boolean } = {}) {
  const state = current()
  if (nutritionClockBlocked(state, now(), seconds, { ...options, dead: corpse(), combatPhase: gs.getState().phase === 'combat' }))
    toolkitError('SURVIVAL_DAY_EVENT_DUE', 'Reach and explicitly resolve the nutrition day boundary before this time jump/rest. No event or save is fabricated.')
}

/** Required hook only when the engine actually establishes player death. */
export function suspendSurvivalForDeath() {
  const state = current()
  if (state && corpse()) { state.status = 'suspended'; state.lastDeathAt = now() }
}

function preflightDailyExhaustion(foodLevels: number, waterRisk: boolean) {
  const before = inspectExhaustion('player').level
  const additions = foodLevels + (waterRisk ? 2 : 0)
  if (Object.keys(gs.getState().dmTools?.exhaustion?.receipts ?? {}).length + Number(foodLevels > 0) + Number(waterRisk) > 2048)
    toolkitError('EXHAUSTION_RECEIPT_LIMIT', 'The exact daily exhaustion sources require free receipt slots before any roll or mutation.')
  if (before + additions >= 6 && effects('death-ward', 'player').length)
    toolkitError('EXHAUSTION_DEATH_WARD_ADJUDICATION', 'Resolve the possible source interaction with Death Ward before the daily roll or deprivation mutation.')
  return before
}
function applyDailyExhaustion(phase: 'food' | 'water', levels: number) {
  if (!levels) return
  const state = read(), pending = state.pendingDay!
  changeExhaustion({ targetId: 'player', eventId: `\u0000nutrition:${pending.input.eventId}:${phase}`, operation: 'add', levels,
    reason: `PHB2014 Food and Water: nutrition day ${state.day.index}, ${phase}.` })
  state.priorDeprivation = 'known'
  // Earlier inadequate intake cannot retroactively satisfy the new source's
  // "until ... eats and drinks the full required amount" recovery condition.
  state.recoveryIntake = { foodHalfPounds: 0, waterPints: 0 }
  suspendSurvivalForDeath()
}
function continueDay() {
  const state = read(), pending = state.pendingDay!
  while (pending.phase < 2 && !corpse()) {
    const phase = pending.phases[pending.phase]
    if (phase === 'food') {
      if (!pending.foodApplied) applyDailyExhaustion('food', pending.foodLevels)
      pending.foodApplied = true; pending.phase++
    } else {
      const waterRequired = dailyWaterPints(state.day.hotWeather)
      if (pending.waterNeedsSave && pending.waterSaveSuccess === undefined)
        return savedResolution({ entityId: 'player', ability: 'con', dc: 15 },
          { domain: 'nutrition-day', command: { eventId: pending.input.eventId } })
      if (!pending.waterApplied && state.day.waterPints < waterRequired && (!pending.waterNeedsSave || !pending.waterSaveSuccess))
        applyDailyExhaustion('water', exhaustionLevel(gs.getState(), 'player') > 0 ? 2 : 1)
      pending.waterApplied = true; pending.phase++
    }
  }
  state.foodDebtHalfDays = pending.foodDebtAfter
  state.foodDebtAtLeast = Boolean(pending.foodDebtAtLeastAfter)
  const output = { success: true, completedDay: { ...state.day }, foodDebtHalfDays: state.foodDebtHalfDays, foodDebtAtLeast: state.foodDebtAtLeast,
    exhaustionBefore: pending.exhaustionBefore, exhaustionAfter: exhaustionLevel(gs.getState(), 'player'),
    order: pending.phases, waterSave: pending.waterSave, died: corpse() }
  const input = pending.input
  state.day = dayAt(state.day.index + 1, state.day.endsAt, input.nextHotWeather)
  delete state.pendingDay
  const resumedCombatTurn = gs.completeSurvivalRoundTransition()
  Object.assign(output, resumedCombatTurn === undefined ? {} : { resumedCombatTurn })
  return result(save(input.eventId, JSON.stringify({ kind: 'day', input }), output))
}
export function registerSurvivalContinuations() {
  registerCheckedResolution('nutrition-day', (command, checked) => {
    const pending = read().pendingDay
    if (!pending || pending.input.eventId !== command.eventId || !('ability' in checked) || checked.ability !== 'con' || checked.dc !== 15)
      toolkitError('NUTRITION_CONTINUATION_MISMATCH', 'Resume only the original held Constitution save for this exact day.')
    pending!.waterSaveSuccess = checked.success
    pending!.waterSave = checked as unknown as Record<string, unknown>
    return continueDay()
  })
}
export function resolveSurvivalDay(input: SurvivalDayInput) {
  const command = JSON.stringify({ kind: 'day', input }), old = receipt(input.eventId, command)
  if (old) return result(old)
  const state = active()
  gs.assertSurvivalRoundTransitionValid()
  if (state.pendingDay) {
    if (JSON.stringify(state.pendingDay.input) !== JSON.stringify(input)) toolkitError('NUTRITION_DAY_PENDING', 'Resolve the exact pending day and held save before another nutrition command.')
    return hero().pending ? result({ pendingReaction: hero().pending }) : continueDay()
  }
  available({ allowSleepDue:true,allowNutritionDue: true, allowTravelDue: true, allowWeatherDue: true, allowCasting:true, allowSewerOnsetAt: state.day.endsAt, allowFrigidWaterDue:true }); historyRoom()
  if (now() < state.day.endsAt) toolkitError('SURVIVAL_DAY_NOT_DUE', 'A nutrition day must actually elapse before resolving deprivation.')
  const sleepDue=dueSleepDeprivation(gs.getState());if(sleepDue?.due&&sleepDue.at<state.day.endsAt)toolkitError('NUTRITION_EARLIER_SLEEP_EVENT_REQUIRED','Resolve the earlier actual adopted sleep-deprivation event first; only equal due timestamps allow a first-resolver choice.')
  const food = foodDeprivationAfter(state.foodDebtHalfDays, state.day.foodHalfPounds, gs.getPlayer().stats.con)
  const required = dailyWaterPints(state.day.hotWeather), waterRisk = state.day.waterPints < required
  const waterNeedsSave = waterRisk && state.day.waterPints >= required / 2
  if (food.exhaustionLevels && waterRisk && !input.order)
    toolkitError('SURVIVAL_SIMULTANEOUS_ORDER_REQUIRED', 'Food and water effects are simultaneously due. The source gives no order: explicitly adjudicate food_then_water or water_then_food.')
  const before = preflightDailyExhaustion(food.exhaustionLevels, waterRisk)
  state.pendingDay = { input, dayIndex: state.day.index, foodLevels: food.exhaustionLevels, waterNeedsSave,
    foodDebtAfter: food.debtHalfDays, foodDebtAtLeastAfter: Boolean(food.debtAtLeast), phases: input.order === 'water_then_food' ? ['water', 'food'] : ['food', 'water'],
    phase: 0, foodApplied: false, waterApplied: false, exhaustionBefore: before }
  return continueDay()
}

export function canRecoverExhaustionLongRest() { return nutritionRestEligibility(current()) }
/** Invoke before rest time, resources or benefits. The post-rest hook cannot
 * discover a history/legacy-exhaustion refusal after healing has begun. */
export function assertSurvivalRestWindow(seconds: number, longRest = false) {
  assertSurvivalTimeAdvance(seconds, { rest: true })
  const state = current()
  if (!state || !longRest) return
  historyRoom()
  const before = inspectExhaustion('player').level
  if (before > 0 && nutritionRestEligibility(state).eligible
    && Object.keys(gs.getState().dmTools?.exhaustion?.receipts ?? {}).length >= 2048)
    toolkitError('EXHAUSTION_RECEIPT_LIMIT', 'Verified long-rest recovery needs a free exhaustion receipt before any rest time or benefit.')
}
/** Call after a successful real long rest, with its unique engine rest ID.
 * The receipt makes both recovery and intake-window closing idempotent. */
export function afterSurvivalLongRest(restEventId: string,preventExhaustionReduction=false) {
  const state = current()
  if (!state) return { status: 'blocked', code: 'NUTRITION_NOT_TRACKED', levelUnchanged: true }
  const eventId = `\u0000nutrition-rest:${restEventId}`, command = JSON.stringify({ kind: 'long-rest', restEventId,...preventExhaustionReduction?{preventExhaustionReduction}:{} }), old = receipt(eventId, command)
  if (old) return old
  if (!restEventId) toolkitError('NUTRITION_REST_EVENT_REQUIRED', 'Recovery requires the unique successful engine rest ID.')
  historyRoom()
  const eligibility = nutritionRestEligibility(state), before = exhaustionLevel(gs.getState(), 'player')
  if (eligibility.eligible && before > cackleExhaustionFloor(gs.getState(),'player')&&!preventExhaustionReduction) changeExhaustion({ eventId, targetId: 'player', operation: 'remove', levels: 1,
    reason: 'PHB2014 Exhaustion: actual successful long rest and verified food/drink intake.' })
  if (eligibility.eligible && eligibility.fullRequired) state.priorDeprivation = 'none'
  state.recoveryIntake = { foodHalfPounds: 0, waterPints: 0 }
  return save(eventId, command, { status: eligibility.eligible ? 'verified' : 'blocked', eligibility,...preventExhaustionReduction?{armorPreventsExhaustionReduction:true}:{},
    beforeLevel: before, afterLevel: exhaustionLevel(gs.getState(), 'player'), levelUnchanged: before === exhaustionLevel(gs.getState(), 'player') })
}
