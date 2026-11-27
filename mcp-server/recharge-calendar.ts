import { getAdventureMap } from '../lib/adventure-map'
import { groundGearPhysicalWitness as witness } from '../lib/ground-gear-recovery-state'
import { AdoptRechargeCalendarSchema, firstRechargeAt, RECHARGE_DAY, rechargeCalendarCommand,
  rechargeOccurrences, BindRechargePlaneMapSchema, nextRechargeAt, rechargePlaneMapCommand, type RechargeCalendar,
  AdoptItemRechargeTimeSchema, itemRechargeTimeCommand, dawnlessRechargeMap, type ItemRechargeCalendar } from '../lib/recharge-calendar-state'
import { MAGIC_ITEMS } from '../lib/srd/magic-items'
import { getState } from './game-state'
import { readXgeRechargeCalendarSource } from './rules-library'
import { toolkitError, toolkitState, assertToolkitReach } from './toolkit'

function itemTimeInspection() {
  const state = getState(), data = state.dmTools?.itemRechargeCalendar
  return data ? { itemTimes: Object.values(data.choices).map(choice => {
    const next = nextRechargeAt(choice.firstAt, state.worldTimeSeconds ?? 0)
    return { eventId: choice.input.eventId,
    mapId: choice.input.mapId, itemIds: choice.input.itemIds, referenceId: choice.input.referenceId,
    adoptedAt: choice.at, firstAt: choice.firstAt, nextAt: Number.isSafeInteger(next) ? next : null,
    periodSeconds: RECHARGE_DAY, scope: 'selected_instances_on_qualified_map', source: choice.source }
  }) } : {}
}

export function adoptItemRechargeTime(raw: unknown) {
  const input = AdoptItemRechargeTimeSchema.parse(raw), state = getState(), data = state.dmTools?.itemRechargeCalendar
  const old = data?.choices[input.eventId]
  if (old) {
    if (witness(old.input) !== witness(input))
      toolkitError('XGE_ITEM_RECHARGE_TIME_IMMUTABLE', 'Retain the exact original selected instances, map, reference and command.')
    return { success: true, replayed: true, seconds: 0, actionSpent: false, ...itemTimeInspection() }
  }
  if (state.phase === 'combat' || state.hero?.pending)
    toolkitError('XGE_RECHARGE_CALENDAR_WINDOW_REQUIRED', 'Adopt the selected-item schedule outside combat and held reactions as this engine tranche boundary.')
  if (state.player.ruleset !== 'srd2014' || !state.hero)
    toolkitError('SRD_PROFILE_REQUIRED', 'Retain the actual supported SRD 2014 hero clock.')
  if (input.mapId !== state.currentMapId || !getAdventureMap(state).maps.some(map => map.id === input.mapId))
    toolkitError('XGE_ITEM_RECHARGE_MAP_REQUIRED', 'Qualify the actual current map of the world with dawn.')
  if (dawnlessRechargeMap(state, input.mapId))
    toolkitError('XGE_RECHARGE_MAP_POLICY_CONFLICT', 'This map already belongs to the original dawnless-plane cycle. No priority or replacement is invented.')
  if (Object.keys(data?.choices ?? {}).length >= 64)
    toolkitError('XGE_ITEM_RECHARGE_TIME_LIMIT', 'Retain all existing selected-item schedule receipts; this tranche supports64 choices.')
  if (Object.values(data?.choices ?? {}).some(choice => choice.input.itemIds.some(id => input.itemIds.includes(id))))
    toolkitError('XGE_ITEM_RECHARGE_INSTANCE_IMMUTABLE', 'Each selected physical instance retains one original local schedule, including after consumption or destruction.')
  const at = state.worldTimeSeconds ?? 0, schedule = firstRechargeAt(state, input, at)
  if (!schedule)
    toolkitError('XGE_RECHARGE_CALENDAR_REFERENCE_REQUIRED', 'Choose an existing durable local physical-cycle reference with exactly one day per occurrence.')
  if (Object.values(state.dmTools?.magicItems ?? {}).some(record => record.status === 'active'
    && MAGIC_ITEMS[record.templateId].recharge && record.lastRechargeDay !== Math.floor(at / RECHARGE_DAY))
    || data && data.evaluatedThrough !== at)
    toolkitError('XGE_RECHARGE_CALENDAR_DAWN_PENDING', 'Reconcile the actual current engine day and previous schedules before this explicit choice.')
  const instances = input.itemIds.map(id => {
    const record = state.dmTools?.magicItems?.[id], owned = state.player.inventory.some(item => item.id === id)
    const dropped = state.droppedItems?.[id]
    if (!record || record.status !== 'active' || !MAGIC_ITEMS[record.templateId].recharge
      || !MAGIC_ITEMS[record.templateId].maxCharges || owned === Boolean(dropped))
      toolkitError('XGE_ITEM_RECHARGE_INSTANCE_REQUIRED', 'Select an exact actual active dawn-recharging instance in unique player or local-ground custody, never a template or future item.')
    if (!owned) {
      if (dropped!.mapId !== input.mapId || !dropped!.roomId)
        toolkitError('XGE_ITEM_RECHARGE_INSTANCE_REQUIRED', 'The selected ground instance must actually be on this current qualified map.')
      assertToolkitReach({ mapId: dropped!.mapId, roomId: dropped!.roomId, cell: dropped!.position })
    }
    return { id, templateId: record!.templateId, creation: record!.creation }
  })
  let source: ItemRechargeCalendar['choices'][string]['source']
  try { source = readXgeRechargeCalendarSource() } catch {
    toolkitError('XGE_RECHARGE_SOURCE_UNAVAILABLE', 'The exact supplied Xanathar recharge passage is required.')
  }
  const choice = { input, at, ...schedule, instances, source, command: '' }
  choice.command = itemRechargeTimeCommand(choice)
  const calendar = toolkitState().itemRechargeCalendar ??= { version: 1, choices: {}, evaluatedThrough: at }
  calendar.choices[input.eventId] = choice
  return { success: true, replayed: false, seconds: 0, actionSpent: false, ...itemTimeInspection() }
}

export function inspectRechargeCalendar() {
  const state = getState(), data = state.dmTools?.rechargeCalendar
  if (!data) return { adopted: false, defaultPolicy: 'engine_dawn', ...itemTimeInspection() }
  const now = state.worldTimeSeconds ?? 0
  const { adoption } = data
  const next = adoption.firstAt + rechargeOccurrences(adoption.firstAt, now) * RECHARGE_DAY
  return { adopted: true, mapId: adoption.input.mapId, referenceId: adoption.input.referenceId,
    adoptedAt: adoption.adoptedAt, firstAt: adoption.firstAt, periodSeconds: RECHARGE_DAY,
    nextAt: Number.isSafeInteger(next) ? next : null, source: adoption.source, defaultOutsideMap: 'engine_dawn',
    ...(data.planeMaps ? { plane: {
      planeId: Object.values(data.planeMaps)[0].input.planeId,
      planeName: Object.values(data.planeMaps)[0].input.planeName, originMapId: adoption.input.mapId,
      maps: Object.values(data.planeMaps).map(binding => ({ mapId: binding.input.mapId,
        boundAt: binding.at, firstAt: binding.firstAt, factId: binding.input.factId })),
    } } : {}), ...itemTimeInspection() }
}

export function bindRechargePlaneMap(raw: unknown) {
  const input = BindRechargePlaneMapSchema.parse(raw), state = getState()
  const data = state.dmTools?.rechargeCalendar
  if (!data) toolkitError('XGE_RECHARGE_CALENDAR_REQUIRED', 'Adopt the actual original dawnless-map cycle first.')
  const adoption = data!.adoption, bindings = data!.planeMaps ?? {}, old = bindings[input.mapId]
  if (old) {
    if (witness(old.input) !== witness(input))
      toolkitError('XGE_RECHARGE_PLANE_MAP_IMMUTABLE', 'Retain the original map, plane qualification, fact and command.')
    return { success: true, replayed: true, seconds: 0, actionSpent: false, ...inspectRechargeCalendar() }
  }
  if (state.phase === 'combat' || state.hero?.pending)
    toolkitError('XGE_RECHARGE_CALENDAR_WINDOW_REQUIRED', 'This represented map bookkeeping requires an outside-combat window without a held reaction.')
  if (input.originMapId !== adoption.input.mapId || input.mapId === input.originMapId
    || state.currentMapId !== input.mapId || !getAdventureMap(state).maps.some(map => map.id === input.mapId))
    toolkitError('XGE_RECHARGE_PLANE_MAP_REQUIRED', 'Choose the original adopted map and a distinct actual current map on that same dawnless plane.')
  if (Object.values(state.dmTools?.itemRechargeCalendar?.choices ?? {}).some(choice => choice.input.mapId === input.mapId))
    toolkitError('XGE_RECHARGE_MAP_POLICY_CONFLICT', 'This map already has an explicitly chosen dawn-world item schedule. No dawnless override or priority is inferred.')
  const first = Object.values(bindings)[0]
  if (first && (first.input.planeId !== input.planeId || first.input.planeName !== input.planeName))
    toolkitError('XGE_RECHARGE_PLANE_IDENTITY_IMMUTABLE', 'Keep the exact same established plane identity and name.')
  if (adoption.input.eventId === input.eventId || Object.values(bindings).some(b => b.input.eventId === input.eventId))
    toolkitError('XGE_RECHARGE_PLANE_EVENT_CONFLICT', 'This recharge calendar command ID is already used.')
  if (Object.values(bindings).some(b => b.input.factId === input.factId))
    toolkitError('XGE_RECHARGE_PLANE_FACT_ALREADY_USED', 'Do not reuse a map qualification fact under fresh command IDs.')
  if (Object.keys(bindings).length >= 128)
    toolkitError('XGE_RECHARGE_PLANE_MAP_LIMIT', 'The represented map limit has been reached; no existing evidence is evicted.')
  const fact = state.worldFacts?.find(f => f.id === input.factId)
  if (!fact || fact.source !== 'record_scene_fact' || fact.mapId !== input.mapId || fact.expires !== 'never'
    || fact.subjectItemId !== undefined || fact.clueId !== undefined || fact.roomId !== state.currentRoomId
    || fact.narrativeEffect?.cell.x !== state.player.position.x || fact.narrativeEffect?.cell.y !== state.player.position.y)
    toolkitError('XGE_RECHARGE_PLANE_FACT_REQUIRED', 'Choose the actual durable local MJ fact at the player position, explicitly qualifying this same dawnless plane.')
  const at = state.worldTimeSeconds ?? 0, firstAt = nextRechargeAt(adoption.firstAt, at)
  if (data!.evaluatedThrough !== at || !Number.isSafeInteger(firstAt) || firstAt <= at)
    toolkitError('XGE_RECHARGE_CALENDAR_DAWN_PENDING', 'Retain the reconciled current clock and a strictly future cycle boundary.')
  try { readXgeRechargeCalendarSource() } catch {
    toolkitError('XGE_RECHARGE_SOURCE_UNAVAILABLE', 'The exact supplied Xanathar recharge passage is required.')
  }
  const binding = { input, at, firstAt, fact: structuredClone(fact) as unknown as Record<string, unknown>,
    adoptionCommand: adoption.command, command: '' }
  binding.command = rechargePlaneMapCommand(binding)
  data!.planeMaps ??= {}
  data!.planeMaps[input.mapId] = binding
  return { success: true, replayed: false, seconds: 0, actionSpent: false, ...inspectRechargeCalendar() }
}

export function adoptRechargeCalendar(raw: unknown) {
  const input = AdoptRechargeCalendarSchema.parse(raw), state = getState()
  const old = state.dmTools?.rechargeCalendar?.adoption
  if (old) {
    if (witness(old.input) !== witness(input))
      toolkitError('XGE_RECHARGE_CALENDAR_IMMUTABLE', 'Retain this original map, reference and adoption. A new command cannot reanchor it.')
    return { ...inspectRechargeCalendar(), success: true, replayed: true, seconds: 0 }
  }
  if (state.phase === 'combat' || state.hero?.pending)
    toolkitError('XGE_RECHARGE_CALENDAR_WINDOW_REQUIRED', 'Adopt the local rule outside combat and any held reaction.')
  if (state.player.ruleset !== 'srd2014' || !state.hero)
    toolkitError('SRD_PROFILE_REQUIRED', 'This calendar requires the current supported SRD 2014 hero clock.')
  if (state.currentMapId !== input.mapId || !getAdventureMap(state).maps.some(map => map.id === input.mapId))
    toolkitError('XGE_RECHARGE_CALENDAR_MAP_REQUIRED', 'Select the real current map explicitly qualified without a dawn.')
  if (Object.values(state.dmTools?.itemRechargeCalendar?.choices ?? {}).some(choice => choice.input.mapId === input.mapId))
    toolkitError('XGE_RECHARGE_MAP_POLICY_CONFLICT', 'This map already has a dawn-world selected-item schedule; the original choice cannot be silently replaced.')
  const adoptedAt = state.worldTimeSeconds ?? 0, schedule = firstRechargeAt(state, input, adoptedAt)
  if (!schedule)
    toolkitError('XGE_RECHARGE_CALENDAR_REFERENCE_REQUIRED', 'Select the actual local durable physical-cycle reference with exactly one day per occurrence.')
  if (Object.values(state.dmTools?.magicItems ?? {}).some(record => record.status === 'active'
    && MAGIC_ITEMS[record.templateId].recharge && record.lastRechargeDay !== Math.floor(adoptedAt / RECHARGE_DAY)))
    toolkitError('XGE_RECHARGE_CALENDAR_DAWN_PENDING', 'Reconcile the previous engine day through an existing actual time operation before adopting this rule.')
  let source: RechargeCalendar['adoption']['source']
  try {
    source = readXgeRechargeCalendarSource()
  } catch {
    toolkitError('XGE_RECHARGE_SOURCE_UNAVAILABLE', 'The exact supplied Xanathar recharge passage is required.')
  }
  const adoption = { input, adoptedAt, ...schedule, source, command: '' }
  adoption.command = rechargeCalendarCommand(adoption)
  toolkitState().rechargeCalendar = { version: 1, adoption, evaluatedThrough: adoptedAt }
  return { ...inspectRechargeCalendar(), success: true, replayed: false, seconds: 0 }
}
