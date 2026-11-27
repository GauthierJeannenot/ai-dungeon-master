import { observeCycleParty,CyclePartyObservationError } from '../lib/adventuring-cycle-party'
import { calculateInitialPartyReference } from '../lib/adventuring-cycle-math'
import type { GameState } from '../lib/types'
import { getMonsterRecord } from '../lib/srd/monsters'
import { calculateSoloEncounterBudget, EncounterBudgetError, EncounterBudgetInputSchema,
  type EncounterBudgetInput } from '../lib/encounter-budget'
import { monsterAutomation } from './monster-automation'
import { getState } from './game-state'
import { toolkitError } from './toolkit'

/** Pure session projection: no toolkit initialization, dice, turn, HP, XP or
 * implicit party members. Mutable monster XP cannot lower published cost. */
export function assessEncounterBudget(state: GameState, input: EncounterBudgetInput) {
  const parsed = EncounterBudgetInputSchema.safeParse(input)
  if (!parsed.success) toolkitError('ENCOUNTER_ARGUMENTS', parsed.error.issues[0]?.message ?? 'Choose one exact encounter assessment mode.')
  const selected = parsed.data!
  const seen = new Set<string>()
  const rows = selected.mode === 'planned' ? selected.groups!.map(group => {
    if (seen.has(group.monsterType)) toolkitError('ENCOUNTER_DUPLICATE_GROUP', 'Combine an identical planned type in one explicit group; use individual active IDs for distinct actual actors.')
    seen.add(group.monsterType)
    return { ...group, monsterId: undefined, hpOverride: false }
  }) : selected.monsters!.map(selection => {
    if (seen.has(selection.monsterId)) toolkitError('ENCOUNTER_DUPLICATE_ACTOR', 'Each real monster may be counted only once.')
    seen.add(selection.monsterId)
    const actor = state.monsters[selection.monsterId]
    if (!actor || !actor.isAlive || actor.hp.current <= 0)
      toolkitError('ENCOUNTER_ACTOR_UNAVAILABLE', 'Select an actual living active-map monster, not a narrative NPC, archived actor or corpse.')
    if (actor!.hostile === false)
      toolkitError('ENCOUNTER_NON_HOSTILE_ACTOR', 'Active-mode opponents must actually be hostile. This does not assign NPC allies a player level; use planned mode for a hypothetical opposition.')
    return { monsterId: actor!.id, monsterType: actor!.type, count: 1,
      countsForMultiplier: selection.countsForMultiplier, hpOverride: actor!.srd?.hpOverride !== undefined }
  })
  const groups = rows.map(row => {
    const record = getMonsterRecord(row.monsterType)
    if (!record) toolkitError('ENCOUNTER_MONSTER_UNKNOWN', 'Choose an exact published type from the active frozen monster catalogue; no substitute creature or XP value is invented.')
    const coverage = monsterAutomation(row.monsterType, state.player.ruleset === 'srd2014')
    return { ...row, xpEach: record!.engine.xpValue,
      challengeRating: typeof record!.source.challenge_rating === 'number' ? record!.source.challenge_rating : null,
      source: { url: record!.sourceUrl, sha256: record!.sourceSha256 },
      sourceReferenceOnly: coverage.sourceReferenceOnly,
      mechanicalLimitations: coverage.limitations }
  })
  try {
    const party=observeCycleParty(state),present=party.members.filter(member=>member.scope==='present')
    const assessment = present.length ? calculateInitialPartyReference(state.player.level,groups,present.map(member=>({actorId:member.npcId,shareUnits:member.shareUnits,namedMemberIds:member.namedMemberIds,survivingIdentitiesIndeterminate:member.survivingIdentitiesIndeterminate}))) : calculateSoloEncounterBudget(state.player.level, groups)
    return { ...assessment, mode: selected.mode, playerId: state.player.id,
      groups, hasHpOverride: groups.some(group => group.hpOverride),
      overLevelChallengeTypes: [...new Set(groups.filter(group => group.challengeRating !== null
        && group.challengeRating > state.player.level).map(group => group.monsterType))],
      ...(present.length?{npcParty:{present,offScene:party.members.filter(member=>member.scope==='off_scene'),deceasedNpcIds:party.deceasedNpcIds,source:{book:'dmg-2014',startLine:3538,endLine:3542}},partyBudgetIndeterminate:true}:{}),
      limitations: [present.length?'Every actual local declared NPC, civilian included, contributes its full real headcount. NPC stat blocks have no character level: party thresholds, daily allowance and difficulty remain indeterminate, never CR-to-level.':'This is the DMG2014 estimate for the sole actual player, not a guarantee of fairness or survivability in a solo game.',
        'Current HP, spell slots, conditions, terrain, tactics, surprise, waves, hazards and companion support are not priced into this formula.',
        'countsForMultiplier is an explicit MJ judgment about meaningful contribution; all listed monsters remain in raw XP, and no CR cutoff is inferred.',
        'Source-reference-only powers and special movement may make a listed creature incomplete mechanically. A native HP override does not recalculate its challenge rating.',
        'The daily figure is a source reference, not XP awarded, spent or a required rest. Multipart waves must be assessed separately; no general adventuring-day ledger is created.'],
      mechanicalSummary: present.length?`Estimation DMG2014 : ${assessment.rawXP} XP source ×${assessment.multiplier} = ${assessment.adjustedXP} XP ajustés ; ${assessment.partySize} personnes réelles présentes, seuils et budget du parti indéterminés faute de niveaux de personnage PNJ. Aucun XP attribué.`:`Estimation DMG2014 : ${assessment.rawXP} XP source ×${assessment.multiplier} = ${assessment.adjustedXP} XP ajustés ; ${assessment.difficulty}, pour l’unique personnage de niveau ${state.player.level}. Aucun XP attribué ni acteur créé.` }
  } catch (error) {
    if(error instanceof CyclePartyObservationError)toolkitError(error.code,error.message)
    if (error instanceof EncounterBudgetError) toolkitError(error.code, error.message)
    throw error
  }
}

export function inspectEncounterBudget(input: EncounterBudgetInput) { return assessEncounterBudget(getState(), input) }
