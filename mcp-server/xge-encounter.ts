import { z } from 'zod'
import { getMonsterRecord, listMonsterTypes } from '../lib/srd/monsters'
import { getState } from './game-state'
import { readXgeEncounterRatios, readXgeWeakMonsterSource, RulesLookupError } from './rules-library'
import { toolkitError } from './toolkit'

export const XgeEncounterInputSchema = z.object({
  mode: z.enum(['catalogue', 'planned']),
  groups: z.array(z.object({
    monsterType: z.string().min(1).max(80),
    count: z.number().int().min(1).max(1000),
  }).strict()).min(1).max(32).optional(),
}).strict().refine(input => (input.mode === 'planned') === (input.groups !== undefined),
  'Choose catalogue without a roster or planned with exact published types and counts.')

type EncounterInput = z.infer<typeof XgeEncounterInputSchema>
type Fraction = { numerator: number; denominator: number }

function add(left: Fraction, right: Fraction): Fraction {
  const numerator = left.numerator * right.denominator + right.numerator * left.denominator
  const denominator = left.denominator * right.denominator
  let gcd = denominator
  let remainder = numerator % gcd
  while (remainder !== 0) {
    const previous = remainder
    remainder = gcd % remainder
    gcd = previous
  }
  return { numerator: numerator / gcd, denominator: denominator / gcd }
}

function profile(monsterType: string) {
  const record = getMonsterRecord(monsterType)
  if (!record) toolkitError('XGE_ENCOUNTER_MONSTER_UNKNOWN', 'Choose an exact published profile type from the catalogue.')
  const cr = record.source.challenge_rating
  return { monsterType, name: record.source.name,
    challengeRating: typeof cr === 'number' && Number.isFinite(cr) && cr >= 0 ? cr : null,
    source: { url: record.sourceUrl, sha256: record.sourceSha256 } }
}

function ratioRow(level: number) {
  try {
    return { ...readXgeEncounterRatios(level), weakMonsterSource: readXgeWeakMonsterSource() }
  } catch (error) {
    if (error instanceof RulesLookupError) toolkitError(error.code, error.message)
    throw error
  }
}

const limitations = [
  'The printed Multiple Monsters ratios compare opposition with the one actual character. They are a planning reference, not a difficulty or survivability verdict.',
  'The Solo Monster table applies to a party of four to six and is not used here. Blank printed cells, CR above the printed columns and unknown CR remain indeterminate. Only a published lower CR below this band’s smallest column uses the separate 1:12 weak-monster guideline.',
  'Compare actual character resources, published stat blocks, supported powers, terrain and encounter circumstances separately. This tool does not pick a roster or inspect scene actors.',
]

export function assessXgeEncounter(raw: EncounterInput) {
  const input = XgeEncounterInputSchema.parse(raw)
  const player = getState().player
  const { ratios, source, weakMonsterSource } = ratioRow(player.level)
  const lowestPrintedChallengeRating = Math.min(...ratios.map(row => row.challengeRating))
  const weakRatio = { characters: 1, monsters: 12 }
  const isWeak = (challengeRating: number | null) => challengeRating !== null
    && challengeRating < lowestPrintedChallengeRating
  const common = { mode: input.mode, confidential: true, playerId: player.id, playerLevel: player.level,
    partySize: 1, source, weakMonsterRule: { source: weakMonsterSource, ratio: weakRatio,
      belowChallengeRating: lowestPrintedChallengeRating }, limitations }

  if (input.mode === 'catalogue') {
    const profiles = listMonsterTypes().sort().map(profile)
    const rows = ratios.map(row => ({
      ...row,
      wholeMonstersAtOrBelowOneCharacter: row.ratio ? Math.floor(row.ratio.monsters / row.ratio.characters) : null,
      profiles: profiles.filter(item => item.challengeRating === row.challengeRating),
    }))
    return { ...common, rows, profilesOutsidePrintedColumns: profiles.filter(item =>
      !ratios.some(row => row.challengeRating === item.challengeRating)),
      weakProfiles: profiles.filter(item => isWeak(item.challengeRating)).map(item => ({ ...item,
        ratio: weakRatio, ratioStatus: 'weak_monster_guideline', ratioSource: weakMonsterSource })) }
  }

  const seen = new Set<string>()
  const groups = input.groups!.map(group => {
    if (seen.has(group.monsterType))
      toolkitError('XGE_ENCOUNTER_DUPLICATE_GROUP', 'Combine an identical profile type in one explicit group.')
    seen.add(group.monsterType)
    const monster = profile(group.monsterType)
    const row = ratios.find(candidate => candidate.challengeRating === monster.challengeRating)
    const weak = isWeak(monster.challengeRating)
    const ratio = row?.ratio ?? (weak ? weakRatio : null)
    return { ...monster, count: group.count, ratio,
      ratioStatus: weak ? 'weak_monster_guideline' : ratio ? 'printed' : monster.challengeRating === null ? 'cr_not_published'
        : row ? 'blank_source_cell' : 'cr_outside_printed_columns',
      ...(weak ? { ratioSource: weakMonsterSource } : {}) }
  })
  if (groups.some(group => !group.ratio))
    return { ...common, groups, characterEquivalent: null, comparison: 'indeterminate' }
  const total = groups.reduce((sum, { count, ratio }) => add(sum, {
    numerator: count * ratio!.characters, denominator: ratio!.monsters,
  }), { numerator: 0, denominator: 1 })
  return { ...common, groups, characterEquivalent: total,
    comparison: total.numerator < total.denominator ? 'below_one_character'
      : total.numerator > total.denominator ? 'above_one_character' : 'equal_to_one_character' }
}
