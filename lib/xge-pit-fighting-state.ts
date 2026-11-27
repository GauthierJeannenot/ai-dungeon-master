import { z } from 'zod'
import type { GameState } from './types'
import { CoinsSchema, copperValue } from './srd/currency'
import { groundGearPhysicalWitness } from './ground-gear-recovery-state'
import { sharedDowntimeIntervalIssues } from './downtime-ledger'
import { getCharacterTemplate, isKnownCharacterId } from './character-registry'

const Id = z.string().min(1).max(80).regex(/^[A-Za-z0-9][A-Za-z0-9_:.-]*$/)
const Time = z.number().int().nonnegative()
const Value = z.record(z.string(), z.unknown())
const Event = z.object({ eventId: Id, weekId: Id }).strict()
export const PIT_DAY_SECONDS = 28800
export const PIT_CHECK_DOMAIN = 'xge-pit-fighting'
export const PIT_ATTACK_DOMAIN = 'xge-pit-fighting-weapon'
export const PIT_CHECKS = [
  { ability: 'str', skill: 'athletics', label: 'XGE Pit Fighting — Athletics' },
  { ability: 'dex', skill: 'acrobatics', label: 'XGE Pit Fighting — Acrobatics' },
  { ability: 'con', skill: undefined, label: 'XGE Pit Fighting — Constitution' },
] as const
export const StartPitSchema = z.object({ eventId: Id, venueFactId: Id, promoterId: Id,
  opponentIds: z.array(Id).min(1).max(8).refine(ids => new Set(ids).size === ids.length),
  explicitlyAdopted: z.literal(true), actualPredeterminedNonlethalMatchesConfirmed: z.literal(true),
}).strict()
export const WorkPitSchema = Event
export const ResolvePitSchema = Event.extend({ useThreeSourceChecks: z.literal(true),
  weaponCheck: z.object({ replaceSkill: z.enum(['athletics', 'acrobatics']), weaponId: Id,
    weaponHands: z.union([z.literal(1), z.literal(2)]).optional(), weaponAbility: z.enum(['str', 'dex']).optional() }).strict().optional(),
})
export const SettlePitSchema = Event.extend({ received: CoinsSchema, actualPromoterPaymentConfirmed: z.literal(true) })
export const AbandonPitSchema = Event.extend({ abandonUnfinishedWeekConfirmed: z.literal(true) })
export const pitWitness = groundGearPhysicalWitness
export const pitPrizeCp = (successes: number) => [0, 5000, 10000, 20000][successes]
export const pitDay = (time: number) => Math.floor(time / 86400)
export function pitCheckSucceeded(roll: { rolls: number[]; total: number; notation: string }, dc: number, attack = false, improvedCritical = false) {
  if (roll.notation === 'automatic-failure') return false
  return attack ? roll.rolls[0] !== 1 && (roll.rolls[0] === 20 || improvedCritical && roll.rolls[0] === 19 || roll.total >= dc) : roll.total >= dc
}
export const pitReceiptWitness = ({ command: _, ...body }: { command: string }) => pitWitness(body)
const Roll = z.object({ notation: z.string(), rolls: z.array(z.number().int()).max(4), modifier: z.number().int(),
  total: z.number().int(), detail: z.string() }).passthrough()
const Site = z.object({ mapId: Id, roomId: Id, cell: z.object({ x: z.number().int(), y: z.number().int() }).strict(), zFeet: z.number().finite() }).strict()
const Source = z.object({ book: z.literal('xge'), sectionId: z.string(), sha256: z.string(), foundationLine: Time,
  startLine: Time, endLine: Time, examples: z.array(z.string().min(1)).length(6) }).strict()
const Start = z.object({ input: StartPitSchema, at: Time, site: Site, venueFact: Value, participants: z.array(Value).min(1).max(9),
  source: Source, command: z.string() }).strict()
const Segment = z.object({ input: WorkPitSchema, from: Time, to: Time, day: Time, command: z.string() }).strict()
const HitDie = z.object({ characterId: Id, classId: z.enum(['fighter', 'wizard', 'bard', 'cleric']), level: z.number().int().min(1).max(7),
  die: z.union([z.literal(6), z.literal(8), z.literal(10)]) }).strict()
const Check = z.object({ kind: z.enum(['ability', 'attack']), entityId: z.literal('player'), ability: z.enum(['str', 'dex', 'con']),
  label: z.string(), dc: z.number().int(), proficient: z.boolean(), expertise: z.boolean(), roll: Roll,
  success: z.boolean(), mechanicalSummary: z.string() }).passthrough()
const Outcome = z.object({ successes: z.number().int().min(0).max(3), prizeCp: Time, chance: Roll,
  example: z.object({ roll: Roll, text: z.string() }).strict().optional() }).strict()
const Resolution = z.object({ input: ResolvePitSchema, at: Time, dcs: z.array(Roll).length(3), hitDie: HitDie,
  conBonus: Roll, actor: Value, weapon: Value.optional(), checks: z.array(Check).max(3),
  heldWitness: z.string().optional(), outcome: Outcome.optional(), command: z.string() }).strict()
const stamped = <T extends z.ZodType>(input: T) => z.object({ input, at: Time, command: z.string() }).strict()
const Week = z.object({ start: Start, segments: z.array(Segment).max(5), resolution: Resolution.optional(),
  settlement: stamped(SettlePitSchema).optional(), abandonment: stamped(AbandonPitSchema).optional() }).strict()
export const XgePitFightingStateSchema = z.object({ version: z.literal(1), weeks: z.array(Week).max(64) }).strict()
export type PitWeek = z.infer<typeof Week>
export type PitSource = z.infer<typeof Source>
export const openPitWeek = (state: GameState) => state.dmTools?.xgePitFighting?.weeks.find(week => !week.abandonment && !week.resolution?.outcome)

export function pitHitDie(state: GameState) {
  const player = state.player, id = player.characterId, level = player.level
  if (!id || !isKnownCharacterId(id) || !Number.isInteger(level) || level < 1 || level > 7 || !state.hero || player.ruleset !== 'srd2014') return undefined
  const template = getCharacterTemplate(id, level), die = template.classId === 'fighter' ? 10 : template.classId === 'wizard' ? 6 : 8
  if (player.class !== template.class || state.hero.hitDice.die !== die || state.hero.hitDice.max !== level) return undefined
  return { characterId: id, classId: template.classId, level, die } as z.infer<typeof HitDie>
}
function diceMatch(roll: z.infer<typeof Roll>, count: number, sides: number, modifier = 0) {
  return roll.notation === `${count}d${sides}${modifier ? '+' + modifier : ''}` && roll.rolls.length === count
    && roll.modifier === modifier && roll.rolls.every(face => face >= 1 && face <= sides)
    && roll.total === roll.rolls.reduce((sum, face) => sum + face, modifier)
}
export function validateXgePitFightingState(state: GameState) {
  const data = state.dmTools?.xgePitFighting
  if (!data) return []
  if (!XgePitFightingStateSchema.safeParse(data).success) return ['Invalid retained pit-fighting workweek schema.']
  const issues: string[] = [], events = new Set<string>(), time = state.worldTimeSeconds ?? 0
  let open = 0, held: PitWeek | undefined
  for (const week of data.weeks) {
    const { start, segments, resolution, settlement, abandonment } = week, venue = start.venueFact
    if (venue.id !== start.input.venueFactId || venue.source !== 'record_scene_fact' || venue.expires !== 'never' || venue.clueId || venue.subjectItemId
      || venue.mapId !== start.site.mapId || venue.roomId !== start.site.roomId
      || pitWitness((venue.narrativeEffect as { cell?: unknown } | undefined)?.cell) !== pitWitness(start.site.cell)
      || new Set(start.input.opponentIds).size !== start.input.opponentIds.length
      || pitWitness(start.participants.map(person => person.id)) !== pitWitness([...new Set([start.input.promoterId, ...start.input.opponentIds])])
      || start.participants.some(person => person.mapId !== start.site.mapId || person.roomId !== start.site.roomId))
      issues.push('Retain the original actual organized nonlethal venue, promoter and predetermined participants.')
    for (const receipt of [start, ...segments, resolution, settlement, abandonment]) {
      if (!receipt) continue
      const at = 'from' in receipt ? receipt.from : receipt.at
      if (events.has(receipt.input.eventId) || at < start.at || at > time || receipt.command !== pitReceiptWitness(receipt)
        || 'weekId' in receipt.input && receipt.input.weekId !== start.input.eventId)
        issues.push('Retain each exact original pit-fighting event, workweek and actual clock receipt.')
      events.add(receipt.input.eventId)
    }
    for (const [index, segment] of segments.entries())
      if (segment.day !== pitDay(segment.from) || segment.to !== segment.from + PIT_DAY_SECONDS || segment.to > (segment.day + 1) * 86400
        || segment.to > time || segment.day > segments[0].day + 9 || index > 0 && segment.day <= segments[index - 1].day)
        issues.push('A pit-fighting week retains five distinct actual eight-hour dates within the represented ten-date span.')
    const end = segments.at(-1)?.to ?? start.at
    if (abandonment && (segments.length >= 5 || resolution || abandonment.at < end)) issues.push('Abandonment cannot erase a completed pit-fighting week or its later result.')
    if (!abandonment && !resolution?.outcome) open++
    if (!resolution) { if (settlement) issues.push('A prize payment requires an actual completed result.'); continue }
    const { input, dcs, hitDie, conBonus, checks, outcome } = resolution
    const template = getCharacterTemplate(hitDie.characterId, hitDie.level), sourceDie = template.classId === 'fighter' ? 10 : template.classId === 'wizard' ? 6 : 8
    if (segments.length !== 5 || resolution.at < end || !isKnownCharacterId(hitDie.characterId) || template.classId !== hitDie.classId || sourceDie !== hitDie.die
      || Boolean(input.weaponCheck) !== Boolean(resolution.weapon)
      || dcs.some(roll => !diceMatch(roll, 2, 10, 5)) || !diceMatch(conBonus, 1, hitDie.die)
      || checks.some((check, index) => check.dc !== dcs[index].total || check.label !== PIT_CHECKS[index].label
        || check.kind === 'ability' && check.ability !== PIT_CHECKS[index].ability
        || check.kind !== (input.weaponCheck && input.weaponCheck.replaceSkill === PIT_CHECKS[index].skill ? 'attack' : 'ability')
        || check.success !== pitCheckSucceeded(check.roll, check.dc, check.kind === 'attack', resolution.weapon?.improvedCritical === true)))
      issues.push('Retain all three separately rolled DCs, the real largest-class Hit Die bonus and the original ordered source results.')
    if (!outcome) {
      if (!resolution.heldWitness || held || checks.length >= 3 || settlement) issues.push('An unfinished pit resolution retains exactly one original held check.'); held = week
    } else if (resolution.heldWitness || checks.length !== 3 || outcome.successes !== checks.filter(check => check.success).length
      || outcome.prizeCp !== pitPrizeCp(outcome.successes) || !diceMatch(outcome.chance, 1, 100)
      || Boolean(outcome.example) !== (outcome.chance.total <= 10)
      || outcome.example && (!diceMatch(outcome.example.roll, 1, 6) || outcome.example.text !== start.source.examples[outcome.example.roll.total - 1]))
      issues.push('Retain the exact source prize, successes and one documentary complication chance/example without automatic consequences.')
    if (settlement && (!outcome?.prizeCp || copperValue(settlement.input.received) !== outcome.prizeCp || settlement.at < resolution.at))
      issues.push('Receive the exact source prize once, in explicitly selected coins.')
  }
  if (open > 1) issues.push('Only one unfinished pit-fighting workweek is represented.')
  const pending = state.hero?.pending, continuation = pending?.command.toolkitResolution as { domain?: string; command?: { weekId?: string } } | undefined
  if (held || continuation?.domain === PIT_CHECK_DOMAIN || pending?.command.domain === PIT_ATTACK_DOMAIN) {
    const resolution = held?.resolution, index = resolution?.checks.length ?? 0
    const check = pending?.command.result as { entityId?: string; label?: string; dc?: number } | undefined
    const attack = Boolean(resolution?.input.weaponCheck && resolution.input.weaponCheck.replaceSkill === PIT_CHECKS[index]?.skill)
    if (!resolution || resolution.heldWitness !== pitWitness(pending) || (attack
      ? pending?.command.type !== 'toolkit_attack' || pending.command.domain !== PIT_ATTACK_DOMAIN || pending.command.weekId !== held?.start.input.eventId || pending.kind !== 'attack'
      : continuation?.domain !== PIT_CHECK_DOMAIN || continuation.command?.weekId !== held?.start.input.eventId
        || pending?.command.type !== 'check' || check?.entityId !== 'player' || check?.label !== PIT_CHECKS[index]?.label
        || check?.dc !== resolution.dcs[index]?.total))
      issues.push('The held pit d20 must retain its original source week, DC, largest-HD bonus and pending window.')
  }
  return [...new Set([...issues, ...sharedDowntimeIntervalIssues(state)])]
}
