import {
  StartPitSchema, WorkPitSchema, ResolvePitSchema, SettlePitSchema, AbandonPitSchema,
  PIT_DAY_SECONDS, PIT_CHECKS, PIT_CHECK_DOMAIN, PIT_ATTACK_DOMAIN, pitCheckSucceeded, pitDay, pitHitDie, pitPrizeCp, pitWitness as witness,
  pitReceiptWitness, openPitWeek, validateXgePitFightingState, type PitWeek,
} from '../lib/xge-pit-fighting-state'
import type { AbilityCheckResult, DiceRollResult, GameState } from '../lib/types'
import { COIN_IDS, CoinsSchema, copperValue, emptyCoins } from '../lib/srd/currency'
import { AFFLICTIONS } from '../lib/srd/afflictions'
import { entityGroundContact, entityVerticalContext } from '../lib/jumping-state'
import { fullyImmersedInWater } from '../lib/underwater-rules'
import { breathingActivityIssue } from '../lib/activity-preflight'
import { groundGearRecoveryActivityIssue } from '../lib/ground-gear-recovery-state'
import { downtimeIntervalIssue } from '../lib/downtime-ledger'
import { inferRoomIdOnMap } from '../lib/adventure-map'
import { available, advanceHeroTime, now, hero, feature, effects, bonusOnRoll, removeHeroEffect } from './hero-rules'
import { assertGameTimeAdvance } from './time-preflight'
import { afterInventoryChange, selectedWeaponItem, weaponForReference, weaponItemHeld, resolvePlayerWeaponUse } from './equipment'
import { assertCarryingAcquisition } from './carrying'
import { checkedResolution, registerCheckedResolution, registerToolkitAttack } from './toolkit-checks'
import { readXgePitFightingSource } from './rules-library'
import { rollDice, getAbilityModifier } from './dice'
import { attackAbilityFor } from '../lib/srd/weapons'
import { weaponProficiency } from '../lib/weapon-proficiency'
import { afflictionSightPenalty } from '../lib/affliction-state'
import { playerFinesseWeaponContext, playerHeavyWeaponContext } from './weapon-properties'
import { magicWeaponBonus } from './magic-items'
import { frightenedByVisibleSource } from './monster-perception'
import { rollRuleD20 } from './roll-rules'
import { reactionWindow } from './hero-combat'
import { assertToolkitReach, toolkitError, toolkitResult, toolkitState } from './toolkit'
import * as gs from './game-state'
import * as rules from './rules'

const weeks = () => gs.getState().dmTools?.xgePitFighting?.weeks ?? []
const same = (a: unknown, b: unknown) => witness(a) === witness(b)
const stamp = <T extends object>(body: T) => ({ ...body, command: witness(body) })
const result = (week: PitWeek, replayed = false) => ({ success: true, replayed, weekId: week.start.input.eventId, week })
function replay(input: { eventId: string }) {
  for (const week of weeks()) {
    const receipt = [week.start, ...week.segments, week.resolution, week.settlement, week.abandonment].find(r => r?.input.eventId === input.eventId)
    if (!receipt) continue
    if (!same(receipt.input, input)) toolkitError('XGE_PIT_EVENT_CONFLICT', 'Keep the exact original source workweek, choice and payment event.')
    return { ...result(week, true), event: receipt, ...(receipt === week.resolution && week.resolution?.heldWitness ? { pendingReaction: gs.getState().hero?.pending } : {}) }
  }
}
function ready() {
  const state = gs.getState()
  if (state.phase === 'combat' || state.dmTools?.rests?.active || Object.values(state.dmTools?.travel?.routes ?? {}).some(route => route.status === 'active'))
    toolkitError('XGE_PIT_DOWNTIME_REQUIRED', 'Choose actual downtime outside initiative, a recorded rest or active journey; a battle to the death uses the separate combat rules.')
  available(); rules.validateActionUse('player')
}
function requireWeek(id: string) {
  return weeks().find(week => week.start.input.eventId === id) ?? toolkitError('XGE_PIT_WEEK_REQUIRED', 'Choose the exact original pit-fighting workweek.')
}
function requirePerson(id: string) {
  const state = gs.getState(), person = gs.getPhysicalCreature(id)
  const npc = state.npcs?.[id]
  if (id === 'player' || !person || 'group' in person && person.group || 'isAlive' in person && !person.isAlive
    || person.hp.current <= 0 || npc && !npc.visible || person.conditions.some(condition => ['unconscious', 'incapacitated', 'petrified', 'paralyzed', 'stunned'].includes(condition)))
    toolkitError('XGE_PIT_PARTICIPANT_REQUIRED', 'Choose an actual present capable individual participant or promoter, not a profile, missing actor, group or corpse.')
  const vertical = entityVerticalContext(state, id)
  const roomId = inferRoomIdOnMap(person.position, state.currentMapId, state)
  if (!vertical.known || vertical.airborne || vertical.zFeet === null || roomId !== state.currentRoomId)
    toolkitError('XGE_PIT_PARTICIPANT_REQUIRED', 'Qualify the actual current same-room participant on a known support.')
  return { id, type: 'type' in person ? person.type : undefined, mapId: npc?.mapId ?? state.currentMapId, roomId,
    position: { ...person.position }, zFeet: vertical.zFeet }
}
function requireVenue(site: PitWeek['start']['site']) {
  const state = gs.getState()
  if (state.currentMapId !== site.mapId || state.currentRoomId !== site.roomId || !same(state.player.position, site.cell)
    || entityGroundContact(state, 'player', site.cell, site.zFeet).contact !== true
    || fullyImmersedInWater(state, { kind: 'creature', entityId: 'player' }) !== false)
    toolkitError('XGE_PIT_VENUE_REQUIRED', 'Return to the actual supported dry organized venue; no remote bouts or an invented battlefield.')
  assertToolkitReach({ ...site, surfaceZFeet: site.zFeet })
}
function participants(week: PitWeek) {
  return [...new Set([week.start.input.promoterId, ...week.start.input.opponentIds])].map(requirePerson)
}
function actorFrame() {
  const state = gs.getState(), player = state.player
  return { characterId: player.characterId, level: player.level, stats: player.stats, proficiencyBonus: player.proficiencyBonus,
    skillProficiencies: player.skillProficiencies, expertise: player.expertise, features: player.features,
    conditions: player.conditions, hitDice: state.hero?.hitDice }
}
function pitWeapon(input: NonNullable<NonNullable<PitWeek['resolution']>['input']['weaponCheck']>) {
  const item = selectedWeaponItem(input.weaponId), weapon = weaponForReference(input.weaponId), state = gs.getState()
  if (!item || !weapon || !weaponItemHeld(item)) toolkitError('XGE_PIT_WEAPON_REQUIRED', 'Choose one actual owned and held physical weapon, never a name, unarmed profile or future item.')
  if (weapon!.improvised || weapon!.special) toolkitError('XGE_PIT_WEAPON_PROFILE_UNSUPPORTED', 'This first abstract substitution supports a canonical weapon without a target-dependent special or improvised landing procedure.')
  const use = resolvePlayerWeaponUse(weapon!, item, input.weaponHands)
  const finesse = playerFinesseWeaponContext(weapon!, input.weaponAbility), heavy = playerHeavyWeaponContext(weapon!)
  const ability = finesse?.ability ?? attackAbilityFor(weapon!, state.player.stats)
  const proficiency = weaponProficiency(state.player, weapon!)
  const modifier = (finesse?.modifier ?? getAbilityModifier(state.player.stats[ability])) + proficiency.proficiencyBonus
    + magicWeaponBonus(item!.id) - afflictionSightPenalty(state, 'player')
  return { item: structuredClone(item!), weaponId: weapon!.id, ability, modifier, proficiency,
    hands: use.hands, finesse, heavy, improvedCritical: feature('improved_critical') }
}
export function validateXgePitFightingSource(state: GameState) {
  const history = state.dmTools?.xgePitFighting?.weeks
  if (!history?.length) return []
  const source = readXgePitFightingSource()
  return history.every(week => same(week.start.source, source)) ? [] : ['Retain the exact supplied Xanathar pit-fighting source and complication examples.']
}
export function startXgePitFighting(raw: unknown) {
  const input = StartPitSchema.parse(raw), old = replay(input); if (old) return old
  ready()
  const state = gs.getState()
  if (weeks().length >= 64 || openPitWeek(state)) toolkitError('XGE_PIT_OPEN_WEEK', 'Finish or explicitly abandon the original unfinished workweek; no old history is evicted.')
  const fact = state.worldFacts?.find(f => f.id === input.venueFactId), vertical = entityVerticalContext(state, 'player')
  if (!fact || fact.source !== 'record_scene_fact' || fact.expires !== 'never' || fact.subjectItemId || fact.clueId
    || fact.mapId !== state.currentMapId || fact.roomId !== state.currentRoomId || !same(fact.narrativeEffect?.cell, state.player.position)
    || !state.currentMapId || !state.currentRoomId || !vertical.known || vertical.zFeet === null)
    toolkitError('XGE_PIT_VENUE_REQUIRED', 'Choose the durable actual local organized nonlethal-match qualification at this supported site.')
  const site = { mapId: state.currentMapId, roomId: state.currentRoomId, cell: { ...state.player.position }, zFeet: vertical.zFeet }
  requireVenue(site)
  const people = [...new Set([input.promoterId, ...input.opponentIds])].map(requirePerson)
  const start = stamp({ input, at: now(), site, participants: people, venueFact: { ...structuredClone(fact) }, source: readXgePitFightingSource() })
  const week: PitWeek = { start, segments: [] }
  ;(toolkitState().xgePitFighting ??= { version: 1, weeks: [] }).weeks.push(week)
  return { ...result(week), event: start, seconds: 0, paidCp: 0, notice: 'An abstract source activity week, not a simulated encounter. No entry fee, action, injury, bet or combat state is created.' }
}
export function workXgePitFighting(raw: unknown) {
  const input = WorkPitSchema.parse(raw), old = replay(input); if (old) return old
  ready()
  const week = requireWeek(input.weekId), state = gs.getState()
  if (week.abandonment || week.segments.length >= 5) toolkitError('XGE_PIT_EFFORT_COMPLETE', 'Only the original unfinished workweek receives actual effort.')
  requireVenue(week.start.site); participants(week)
  const from = now(), to = from + PIT_DAY_SECONDS, day = pitDay(from)
  if (to > (day + 1) * 86400 || week.segments.some(segment => segment.day === day))
    toolkitError('XGE_PIT_WORKDAY_REQUIRED', 'Choose one distinct actual date with eight continuous activity hours available.')
  if (week.segments[0] && day > week.segments[0].day + 9)
    toolkitError('XGE_PIT_DELAY_ADJUDICATION_REQUIRED', 'Retain the delayed project before effort pending a future explicit extra-complication/cost procedure; no convention is invented.')
  const shared = downtimeIntervalIssue(state, from, PIT_DAY_SECONDS, true)
  if (shared) toolkitError('DOWNTIME_SHARED_DAY_REQUIRED', shared)
  const issue = breathingActivityIssue(state, 'player', PIT_DAY_SECONDS) ?? groundGearRecoveryActivityIssue(state, PIT_DAY_SECONDS)
  if (issue) toolkitError(issue.code, issue.message)
  if (Object.values(state.dmTools?.afflictions?.records ?? {}).some(record => record.targetId === 'player'
    && AFFLICTIONS[record.templateId].kind === 'poison' && ['active', 'pending'].includes(record.status)
    && !record.petrificationPause && record.nextAt !== undefined && record.nextAt < to))
    toolkitError('XGE_PIT_AFFLICTION_BOUNDARY', 'Resolve the earlier real poison event before an uninterrupted eight-hour activity.')
  assertGameTimeAdvance(PIT_DAY_SECONDS)
  const event = stamp({ input, from, to, day })
  advanceHeroTime(PIT_DAY_SECONDS); week.segments.push(event)
  return { ...result(week), event, seconds: PIT_DAY_SECONDS, hpChangedByPitActivity: false }
}
function nextPitCheck(week: PitWeek): ReturnType<typeof toolkitResult> {
  const resolution = week.resolution!, index = resolution.checks.length, check = PIT_CHECKS[index]
  let answer: ReturnType<typeof toolkitResult>
  if (resolution.input.weaponCheck && resolution.input.weaponCheck.replaceSkill === check.skill) {
    const weapon = pitWeapon(resolution.input.weaponCheck)
    if (!same(weapon, resolution.weapon)) toolkitError('XGE_PIT_WEAPON_CHANGED', 'Retain the exact original physical weapon, grip, proficiency, ability and applicable source properties.')
    const player = gs.getPlayer()
    const roll = rollRuleD20('player', 'attack', weapon.modifier, false, Boolean(weapon.heavy?.disadvantage
      || player.conditions.some(condition => ['blinded','poisoned','restrained','prone'].includes(condition))
      || frightenedByVisibleSource('player') || effects('vicious-mockery', 'player').length), weapon.ability)
    const bonus = bonusOnRoll('attack', 'player'); roll.modifier += bonus; roll.total += bonus
    if (hero().inspiration.some(entry => entry.targetId === 'player' && entry.expiresAt > now()))
      answer = reactionWindow('attack', 'player', undefined, ['bardic_inspiration', 'decline'],
        { type: 'toolkit_attack', domain: PIT_ATTACK_DOMAIN, weekId: week.start.input.eventId, inspiredActorId: 'player' }, roll)
    else answer = finishPitAttack(week.start.input.eventId, roll)
  } else answer = checkedResolution({ ...check, entityId: 'player', dc: resolution.dcs[index].total,
    ...(index === 2 ? { sourcePitConBonus: { weekId: week.start.input.eventId, value: resolution.conBonus.total } } : {}) },
  { domain: PIT_CHECK_DOMAIN, command: { weekId: week.start.input.eventId } })
  if (!resolution.outcome && gs.getState().hero?.pending && !resolution.heldWitness) {
    resolution.heldWitness = witness(gs.getState().hero!.pending); resolution.command = pitReceiptWitness(resolution)
  }
  return answer
}
export function resolveXgePitFighting(raw: unknown) {
  const input = ResolvePitSchema.parse(raw), old = replay(input); if (old) return toolkitResult(old)
  ready()
  const week = requireWeek(input.weekId)
  if (week.abandonment || week.segments.length !== 5 || week.resolution)
    toolkitError('XGE_PIT_RESOLUTION_REQUIRED', 'Complete five actual workdays before the one original source resolution.')
  requireVenue(week.start.site); participants(week)
  const hitDie = pitHitDie(gs.getState())
  if (!hitDie) toolkitError('XGE_PIT_HIT_DIE_PROFILE_REQUIRED', 'The largest Hit Die requires the actually represented supported single class, level and matching die pool; no multiclass history is inferred.')
  const weapon = input.weaponCheck ? pitWeapon(input.weaponCheck) : undefined
  if (gs.getPlayer().conditions.includes('exhaustion') && !gs.getState().dmTools?.exhaustion?.creatures.player)
    toolkitError('EXHAUSTION_LEVEL_REQUIRED', 'Qualify the existing actual exhaustion level before any source DC or Hit Die is rolled.')
  readXgePitFightingSource()
  week.resolution = stamp({ input, at: now(), hitDie, actor: structuredClone(actorFrame()),
    dcs: PIT_CHECKS.map(() => ({ ...rollDice('2d10+5') })), conBonus: { ...rollDice(`1d${hitDie.die}`) }, checks: [], ...(weapon ? { weapon } : {}) })
  return nextPitCheck(week)
}
function finishPitCheck(command: Record<string, unknown>, check: AbilityCheckResult, kind: 'ability' | 'attack' = 'ability') {
  const week = requireWeek(String(command.weekId)), resolution = week.resolution!, index = resolution.checks.length, source = PIT_CHECKS[index]
  if (!source || kind === 'ability' && check.ability !== source.ability || check.label !== source.label || check.dc !== resolution.dcs[index].total || typeof check.success !== 'boolean')
    toolkitError('XGE_PIT_CHECK_CHANGED', 'Retain the exact current source ability, original d20 and separately generated DC.')
  delete resolution.heldWitness
  resolution.checks.push({ ...check, kind, roll: { ...check.roll }, ability: check.ability as 'str'|'dex'|'con', entityId: 'player', label: source.label,
    dc: resolution.dcs[index].total, success: check.success,
    mechanicalSummary: `${source.label}: ${check.roll.detail} vs DD ${check.dc} -> ${check.success ? 'SUCCES' : 'ECHEC'}` })
  if (resolution.checks.length < 3) return nextPitCheck(week)
  const successes = resolution.checks.filter(check => check.success).length, chance = { ...rollDice('1d100') }
  const roll = chance.total <= 10 ? { ...rollDice('1d6') } : undefined
  resolution.outcome = { successes, prizeCp: pitPrizeCp(successes), chance,
    ...(roll ? { example: { roll, text: week.start.source.examples[roll.total - 1] } } : {}) }
  resolution.command = pitReceiptWitness(resolution)
  return toolkitResult({ ...result(week), event: resolution, notice: 'Complication is a retained source example only. Its text creates no actor, wound, attitude, forced action or scene consequence.' })
}
function finishPitAttack(weekId: string, roll: DiceRollResult) {
  const week = requireWeek(weekId), resolution = week.resolution!, index = resolution.checks.length, weapon = resolution.weapon!
  if (resolution.input.weaponCheck?.replaceSkill !== PIT_CHECKS[index].skill || !weapon)
    toolkitError('XGE_PIT_CHECK_CHANGED', 'Retain the original source slot chosen for the abstract weapon attack roll.')
  for (const effect of [...effects('vicious-mockery', 'player')]) removeHeroEffect(effect.id)
  return finishPitCheck({ weekId }, { entityId: 'player', ability: weapon.ability as 'str'|'dex', label: PIT_CHECKS[index].label,
    dc: resolution.dcs[index].total, proficient: (weapon.proficiency as { proficient: boolean }).proficient, expertise: false,
    roll, success: pitCheckSucceeded(roll, resolution.dcs[index].total, true, weapon.improvedCritical === true), mechanicalSummary: '' }, 'attack')
}
export function validateHeldPitCheck(command: Record<string, unknown>) {
  const source = command.toolkitResolution as { domain?: string } | undefined
  if (source?.domain !== PIT_CHECK_DOMAIN && command.domain !== PIT_ATTACK_DOMAIN) return
  const week = openPitWeek(gs.getState())
  if (!week?.resolution || !same(week.resolution.actor, actorFrame())) toolkitError('XGE_PIT_CHECK_CHANGED', 'Keep the original actual ability/proficiency/class/Hit Die context before a held bonus die.')
  requireVenue(week.start.site); participants(week)
  if (week.resolution.input.weaponCheck && !same(week.resolution.weapon, pitWeapon(week.resolution.input.weaponCheck)))
    toolkitError('XGE_PIT_WEAPON_CHANGED', 'Keep the actual original held weapon and applicable source modifiers before a bonus die.')
  const issues = validateXgePitFightingState(gs.getState())
  if (issues.length) toolkitError('XGE_PIT_CHECK_CHANGED', issues.join(' '))
}
export function registerPitResolution() {
  registerCheckedResolution(PIT_CHECK_DOMAIN, (command, check) => finishPitCheck(command, check as AbilityCheckResult))
  registerToolkitAttack(PIT_ATTACK_DOMAIN, (command, roll) => finishPitAttack(String(command.weekId), roll))
}
export function settleXgePitFighting(raw: unknown) {
  const input = SettlePitSchema.parse(raw), old = replay(input); if (old) return old
  ready()
  const week = requireWeek(input.weekId), due = week.resolution?.outcome?.prizeCp
  if (!due || week.settlement || copperValue(input.received) !== due)
    toolkitError('XGE_PIT_EXACT_PRIZE_REQUIRED', 'Receive exactly 50, 100 or 200 gp from the original retained result, once in explicitly selected coins. Zero successes earns no payment.')
  requireVenue(week.start.site)
  const promoter = requirePerson(week.start.input.promoterId)
  assertToolkitReach({ mapId: promoter.mapId!, roomId: promoter.roomId!, cell: promoter.position, surfaceZFeet: promoter.zFeet! })
  const wallet = { ...(gs.getState().dmTools?.wallet ?? emptyCoins()) }
  for (const coin of COIN_IDS) wallet[coin] += input.received[coin]
  if (!CoinsSchema.safeParse(wallet).success) toolkitError('XGE_PIT_WALLET_REQUIRED', 'The exact selected prize denominations must be representable.')
  assertCarryingAcquisition({ walletAfter: wallet })
  const event = stamp({ input, at: now() })
  toolkitState().wallet = wallet; week.settlement = event; afterInventoryChange()
  return { ...result(week), event, receivedCp: due }
}
export function abandonXgePitFighting(raw: unknown) {
  const input = AbandonPitSchema.parse(raw), old = replay(input); if (old) return old
  ready(); const week = requireWeek(input.weekId)
  if (week.abandonment || week.segments.length >= 5 || week.resolution) toolkitError('XGE_PIT_ABANDONMENT_UNAVAILABLE', 'Abandon only an unfinished actual week; no completed result, receipt or prize is erased.')
  const event = stamp({ input, at: now() }); week.abandonment = event
  return { ...result(week), event, refundedCp: 0, notice: 'Actual elapsed effort retained. No entry fee existed and no prize is granted for an unfinished week.' }
}
export function inspectXgePitFighting() { return { readOnly: true, weeks: weeks(), source: readXgePitFightingSource() } }
