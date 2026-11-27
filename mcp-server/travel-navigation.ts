import { TravelNavigationInputSchema, WILDERNESS_NAVIGATION_DC, travelStateOf,
  type TravelNavigationInput } from '../lib/travel-state'
import type { AbilityCheckResult } from '../lib/types'
import * as gs from './game-state'
import { available, alive, hero, now } from './hero-rules'
import { rollDice } from './dice'
import { checkedResolution, registerCheckedResolution } from './toolkit-checks'
import { toolkitError, toolkitResult } from './toolkit'

const read = () => travelStateOf(gs.getState()) ?? toolkitError('TRAVEL_HISTORY_REQUIRED', 'Establish the actual shared travel history before resolving its navigation.')
function finishNavigation(checked: AbilityCheckResult) {
  const travel = read(), navigation = travel.navigation!, id = navigation.pendingAttemptId!, attempt = navigation.attempts[id]
  const success = checked.success === true, before = navigation.lost
  const delayRoll = success ? undefined : rollDice('1d6')
  if (success) delete navigation.lost
  else navigation.lost = { firstLostAt: before?.firstLostAt ?? now(), failedAttemptId: id, delayRoll: delayRoll!,
    requiredSearchSeconds: delayRoll!.total * 3600, searchedSeconds: 0 }
  const result = { success: true, navigationSucceeded: success, eventId: id, journeyId: attempt.input.journeyId,
    check: checked, baseDc: attempt.baseDc, paceModifier: attempt.paceModifier, aids: attempt.input.aids,
    delayRoll: delayRoll ?? null, lost: navigation.lost ? structuredClone(navigation.lost) : null,
    positionChanged: false, directionChosen: false, routeDistanceCredited: 0, timeAdvanced: 0 }
  attempt.result = result
  delete navigation.pendingAttemptId
  gs.addLogEntry({ round: gs.getState().round, turn: 'player', action: 'Orientation du voyage',
    mechanicalDetail: `${checked.mechanicalSummary} | DMG2014 allure ${attempt.paceModifier >= 0 ? '+' : ''}${attempt.paceModifier} ; ${success ? 'orientation réussie' : `perdu, recherche réelle ${delayRoll!.total}h avant nouvel essai`}` })
  return toolkitResult(result)
}
export function registerTravelNavigationContinuations() {
  registerCheckedResolution('travel-navigation', (command, checked) => {
    const navigation = read().navigation, id = navigation?.pendingAttemptId, attempt = id ? navigation?.attempts[id] : undefined
    if (!id || command.eventId !== id || !attempt || !('proficient' in checked) || checked.entityId !== 'player'
      || checked.ability !== 'wis' || checked.dc !== attempt.baseDc)
      toolkitError('TRAVEL_NAVIGATION_CONTINUATION_MISMATCH', 'Resume only the exact original Wisdom (Survival) check for this actual navigation attempt.')
    return finishNavigation(checked as AbilityCheckResult)
  })
}
export function resolveTravelNavigation(input: TravelNavigationInput) {
  input = TravelNavigationInputSchema.parse(input)
  const travel = read(), command = JSON.stringify(input), previous = travel.navigation?.attempts[input.eventId]
  if (previous) {
    if (previous.command !== command) toolkitError('TRAVEL_NAVIGATION_EVENT_CONFLICT', 'This navigation event ID already retains another exact source context or roll.')
    if (previous.result) return toolkitResult({ ...previous.result, replayed: true })
    const held = hero().pending, resolution = held?.command.toolkitResolution as { domain?: string; command?: { eventId?: string } } | undefined
    if (held && resolution?.domain === 'travel-navigation' && resolution.command?.eventId === input.eventId)
      return toolkitResult({ pendingReaction: held })
    toolkitError('TRAVEL_NAVIGATION_HISTORY_UNRESOLVED', 'An unresolved old navigation attempt has no actual held check witness; no replacement die is invented.')
  }
  available()
  if (gs.getState().phase === 'combat') toolkitError('TRAVEL_IN_COMBAT', 'Navigation of an overland route does not replace an actual combat action or turn.')
  if (!alive(gs.getPlayer()) || gs.getPlayer().deathSaves?.dead) toolkitError('TRAVEL_ACTOR_UNAVAILABLE', 'Navigation requires the actual living capable player.')
  if (!travel.routes[input.journeyId]) toolkitError('TRAVEL_ROUTE_REQUIRED', 'Choose an actual established route; no destination, distance or direction is inferred.')
  if (input.terrain.startsWith('open_sea_')) toolkitError('TRAVEL_NAVIGATION_MODE_UNSUPPORTED', 'The exact table includes open sea, but this on-foot travel engine has no actual vessel or sea route; no ship is provided.')
  if (travel.navigation?.pendingAttemptId) toolkitError('TRAVEL_NAVIGATION_PENDING', 'Resolve the existing held navigation check before another attempt.')
  if (travel.navigation?.lost && travel.navigation.lost.searchedSeconds < travel.navigation.lost.requiredSearchSeconds)
    toolkitError('NAVIGATION_SEARCH_REQUIRED', 'Complete the actual persisted1d6-hour search before another navigation check; time waiting, another route or event ID does not satisfy it.')
  if (Object.keys(travel.navigation?.attempts ?? {}).length >= 512) toolkitError('TRAVEL_NAVIGATION_HISTORY_LIMIT', 'The 512-attempt history is full; actual checks and failed searches cannot be evicted.')
  if (new Set(input.aids.map(aid => aid.kind)).size !== input.aids.length) toolkitError('TRAVEL_NAVIGATION_AID_DUPLICATE', 'Each established kind of navigation aid can appear only once; advantages never stack.')
  let mapWitness: { itemId: string; item: Record<string, unknown> } | undefined
  for (const aid of input.aids) {
    if (gs.getPlayer().conditions.includes('blinded')) toolkitError('TRAVEL_NAVIGATION_AID_UNSEEN', 'The actually blinded player cannot use a visible map or celestial observation; no visual access is inferred.')
    if (aid.kind === 'accurate_map') {
      const item = gs.getPlayer().inventory.find(item => item.id === aid.itemId)
      if (!item) toolkitError('TRAVEL_NAVIGATION_MAP_REQUIRED', 'Choose the exact map instance actually present in the player inventory; a name or narrative declaration does not create it.')
      mapWitness = { itemId: aid.itemId, item: structuredClone(item!) as unknown as Record<string, unknown> }
    }
  }
  const baseDc = WILDERNESS_NAVIGATION_DC[input.terrain], paceModifier = input.pace === 'slow' ? 5 : input.pace === 'fast' ? -5 : 0
  const navigation = travel.navigation ??= { attempts: {} }
  navigation.attempts[input.eventId] = { input, command, baseDc, paceModifier, at: now(), ...(mapWitness ? { mapWitness } : {}) }
  navigation.pendingAttemptId = input.eventId
  return checkedResolution({ entityId: 'player', ability: 'wis', skill: 'survival', dc: baseDc,
    label: 'Orientation du voyage (Survie)', advantage: input.aids.length > 0,
    advantageReason: input.aids.length ? input.aids.map(aid => aid.source).join(' ; ') : undefined,
    sourceModifier: { kind: 'wilderness_navigation_pace', value: paceModifier } },
  { domain: 'travel-navigation', command: { eventId: input.eventId } })
}
