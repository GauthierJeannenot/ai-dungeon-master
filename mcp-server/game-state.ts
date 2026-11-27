import { validateObjectiveJournal, archiveObjectiveJournal } from '../lib/objective-journal'
import { validateAdventuringCycles } from '../lib/adventuring-cycle-state'
import { validateImprovisedHazards } from '../lib/improvised-hazard-state'
import { assertImprovisedHazardBodyMutation } from './improvised-hazards'
import { finishPassiveRobeSlot } from './charged-items'
import { validateChargedItems,robeRequiresInitiativeTurn,robePassiveOnlySlot,robeCombatExitIssue,chargedHeldBodyLocked } from '../lib/charged-item-state'
import { validateAdventureRewardSources } from './adventure-rewards'
import { validateAdventureRewardState } from '../lib/adventure-reward-state'
import { validateCampaignOutcomesState } from '../lib/campaign-outcome-state'
import { complexTrapSlot, complexTrapTurnDue, enrollComplexTrapInitiative, validateComplexTrapInitiative } from '../lib/complex-trap-initiative'
import { validateCriticalSpellsState } from '../lib/critical-spells-state'
import { validatePitTraps } from '../lib/pit-trap-state'
import { assertPitHeldBodyMutation } from './pit-traps'
import { validateTumbleState,tumbleCheckBodyLocked,tumbleCheckTransitionIssue } from '../lib/dmg-tumble-state'
import { validateOverrunState,overrunCheckBodyLocked,overrunCheckTransitionIssue } from '../lib/dmg-overrun-state'
import { validateCleavingState,cleavingHeldBodyMutationBlocked,cleavingTransitionIssue,reconcileCleavingActorLife } from '../lib/cleaving-state'
import { encounterCadenceStateIssues,protectedEncounterCadenceFactIds,encounterCadenceWitness } from '../lib/encounter-cadence-state'
import { withCackleConsequences, cackleActualDeath, assertCackleEventsResolved, assertCackleTurnMayEnd, cackleDueEvent, stageCackleStress, validateCackleHistory } from './cackle-fever'
import { cackleIncubationBoundary } from '../lib/cackle-fever-state'
import { validateInvalidTargetState } from '../lib/xge-invalid-target-state'
import { validateSacredRitesState } from '../lib/sacred-rites-state'
import { validateLightSpellState } from '../lib/light-spell-state'
import { validateAlarmSpellState } from '../lib/alarm-state'
import { validateRazorvineHistory } from '../lib/razorvine-state'
import { validateSlipperyIceState } from '../lib/slippery-ice-state'
import { validateDesecratedGroundHistory } from './desecrated-ground'
import { assertFrigidWaterTimeAdvance, reconcileFrigidWaterPresence, validateFrigidWaterHistory } from './frigid-water'
import { dueFrigidWaterSave, nextFrigidWaterSave } from '../lib/frigid-water-state'
import { validateShoveAsideState,shoveAsideHeldBodyMutationBlocked,shoveAsideTransitionIssue } from '../lib/dmg-shove-aside-state'
import { validateChaseState,chaseTurnIssue,chaseTransitionIssue,expireChaseTurnEffects,protectedChaseFactIds,chaseRequiresInitiativeTurn } from '../lib/chase-state'
import { validateKnotState,protectedKnotFactIds } from '../lib/knot-state'
import { validateSpellPerceptionState } from '../lib/spell-perception-state'
import { validateObjectWeaponAttacks } from '../lib/object-weapon-state'
import { validateAdamantineState } from '../lib/adamantine-state'
import { validateXgeFallingState,dueXgeFallDescent,activeXgeFall,xgeFallPoint,xgeFallingTurnIssue,xgeFallingTransitionIssue } from '../lib/xge-falling-state'
import { validateXgeFallingGeometry } from '../lib/xge-falling-geometry'
import { validateSpatialOpportunityState } from './spatial-opportunity'
import { validateSleepState,naturalSleepEpisode,sleepStateOf,sleepDueIssue } from '../lib/sleep-state'
import { validateSwallowState,swallowedBy,swallowedEpisodes,swallowRequiresTurn,swallowTurnIssue,swallowMapTransitionIssue } from '../lib/swallow-state'
import { reconcileSwallowDeaths } from './swallow'
import { validateNativePoisonState } from '../lib/native-poison-state'
import { entityVerticalContext } from '../lib/jumping-state'
import { assertSewerPlagueEventResolved, sewerPlagueEvent, validateSewerPlagueHistory } from './sewer-plague'
import { sewerPlagueIncubationBoundary } from '../lib/affliction-state'
import { ensureWeatherState } from './weather'
import { nativeFlightFallIssue,nativeFlightTransitionIssue,projectNativeFlightPoint,projectNativeFlightFall,validateNativeFlightState } from '../lib/native-flight-geometry'
import { actualNativeFlightLocation } from '../lib/native-flight-state'
import { validateUnderwaterState } from '../lib/underwater-rules'
import { startTurnFireDueIssue } from '../lib/weapon-consumable-state'
import { validatePoisonNutrition } from '../lib/poison-nutrition-state'
import { projectLocomotionStep,validateLocomotionState,locomotionPhysicalIssue } from '../lib/locomotion-geometry'
import type { LocomotionPoint } from '../lib/locomotion-state'
import { pendingGroundGearContacts } from '../lib/ground-gear-state'
import { prepareGroundGearStep,groundGearMovementIssue,groundGearMovementGroupIssue,recordGroundGearContact,type GroundGearMovementKind,type GroundGearStepWitness } from './ground-gear-contacts'
import { clearActualFootwork } from './vertical-observations'
import { projectActualGroundMovement } from '../lib/physical-ground-movement'
import { assertSurvivalEventsResolved, assertSurvivalTimeAdvance, isSurvivalDayDue } from './survival'
import { interruptAmmunitionSearches } from '../lib/ammunition-state'
import { validateCastingState } from '../lib/casting-state'
import { validateImprovisedState } from '../lib/improvised-state'
import { validateBasicPoisonState } from '../lib/basic-poison-state'
import { validatePlayerPoisonState } from '../lib/player-poison-state'
import { oilStateIssues } from '../lib/oil-state'
import { randomEncounterStateIssues } from '../lib/random-encounter-state'
import { validateUrbanEncounterHistory } from './urban-encounters'
import { campaignEncounterTableStateIssues } from '../lib/random-encounter-table-state'
import { clearCaltropsOnActualHealing,groundGearContactDueIssue,validateGroundGearState } from '../lib/ground-gear-state'
import { validateValuableResaleSources } from './valuable-resale-source'
import { validateDowntimeState,protectedDowntimeFactIds } from '../lib/downtime-state'
import { validateDowntimeSource } from './downtime'
import { validateCalendarState } from '../lib/calendar-state'
import { validateRechargeCalendarState, validateItemRechargeCalendarState } from '../lib/recharge-calendar-state'
import { reconcileMagicItems } from './magic-items'
import { validateCalendarSource } from './calendar'
import { validateRenownState } from '../lib/renown-state'
import { validateRenownSource } from './renown'
import { validateTradeGoodsState } from '../lib/trade-goods-state'
import { validateTradeGoodsSources } from './trade-goods'
import { validateMerchantResaleState } from '../lib/merchant-resale-state'
import { validateMerchantState } from '../lib/merchant-state'
import { validateOrdinaryCraftingState } from '../lib/ordinary-crafting-state'
import { validatePoisonHarvestState } from '../lib/poison-harvest-state'
import { validateTrainingState } from '../lib/training-state'
import { validateXgeTrainingState,protectedXgeTrainingFactIds } from '../lib/xge-training-state'
import { validateXgeTrainingSource } from './xge-training'
import { validateXgeGamblingState } from '../lib/xge-gambling-state'
import { validateXgeGamblingSource } from './xge-gambling'
import { validateXgePitFightingState } from '../lib/xge-pit-fighting-state'
import { validateXgePitFightingSource } from './xge-pit-fighting'
import { validateXgeReligiousServiceState } from '../lib/xge-religious-service-state'
import { validateXgeReligiousServiceSource } from './xge-religious-service'
import { validateXgeCarousingState } from '../lib/xge-carousing-state'
import { validateXgeCarousingSource } from './xge-carousing'
import { validateXgeScrollScribingState } from '../lib/xge-scroll-scribing-state'
import { validateXgeScribingSource } from './xge-scroll-scribing'
import { validateXgeBrewingState } from '../lib/xge-brewing-state'
import { validateXgeBrewingSource } from './xge-brewing'
import { validateRelaxationState } from '../lib/xge-relaxation-state'
import { validateRelaxationSources } from './xge-relaxation'
import { validateXgeResearchState } from '../lib/xge-research-state'
import { validateXgeResearchSource } from './xge-research'
import { groundGearContainerTransfer } from '../lib/ground-gear-containers'
import { assertCarryingAcquisition } from './carrying'
import { validateDoorDiscoveryState } from '../lib/door-discovery'
import { migrateSocialState } from '../lib/social-interaction-state'
import { validateSocialInteractionState } from './social-interactions'
import { reconcileCasting } from './casting'
import { netItemPickupIssue,validateNetState } from '../lib/net-state'
import { reconcileNets } from './nets'
import { physicalLoadTransitionIssue } from '../lib/physical-handling-state'
import { reconcilePhysicalHandling,releasePhysicalHandling,currentPhysicalLoad } from './physical-handling'
import {
  GameState,
  MonsterState,
  NpcState,
  Condition,
  PlayerState,
  Item,
  MapOutcome,
  WorldFact,
  WorldNpcDisposition,
  DroppedItem,
} from '../lib/types'
import { inferRoomIdOnMap, seedAdventureNpcs, seedAdventureGroundItems, getAdventureMap, firstMapId } from '../lib/adventure-map'
import { buildPlayerState } from '../lib/character-registry'
import { getMonsterRecord } from '../lib/srd/monsters'
import { hydrateNpcStatBlocks, isStatBackedNpc, reconcileNpcGroup } from '../lib/npc-stat-blocks'
import { initialHeroState } from '../lib/hero-state'
import { initialCurrencyState, migrateCurrencyState } from '../lib/currency-state'
import { migrateMapLayout } from '../lib/map-layout-migration'
import { rememberMapDiscovery } from '../lib/map-discovery'
import { advanceHeroTime, reconcileHeroAfterPhysicalArrival, startHeroTurn, endHeroTurn, heroBeforeHPChange, heroAfterHPChange, reconcileNaturalRecoveryClock, removeHeroEffect } from './hero-rules'
import { ACTIVE_ADVENTURE_ID } from './adventure'
import { ACTIVE_CHARACTER_ID } from './character'
import { conditionImmune, startMonsterTurn, endEffect, savingThrow, reconcileMonsterEffects } from './monster-rules'
import { resolveRoundEvents } from './round-events'
import { randomUUID } from 'node:crypto'
import { initializeSocialPersonalities } from '../lib/social'
import { getAbilityModifier } from './dice'
import { rollRuleD20, ruleRollAdvantage, ruleRollDisadvantage } from './roll-rules'
import { curseAbilityDisadvantage } from '../lib/curse-effects'
import { frightenedByVisibleSource } from './monster-perception'
import { strictHero } from './hero-rules'
import { startWeaponConsumableTurn,startTurnFirePreflightIssue } from './weapon-consumables'
import { onOilGroundContact,oilGroundContactIssue,oilRequiresInitiativeTurn,forecastOilGroundContact } from './oil-ground'
import { validateExhaustionState } from '../lib/exhaustion'
import { afflictionRequiresInitiativeTurn, assertPetrifiedAfflictionsTransition, suspendPetrifiedAfflictions, resumePetrifiedAfflictions, validatePetrifiedAfflictionHistory, reconcileAfflictions,afflictionHealingLimit } from './afflictions'
import { assertPetrifiedSpriteTransition, suspendPetrifiedSpriteEffects, resumePetrifiedSpriteEffects, validatePetrifiedSpriteHistory } from './petrified-sprite-effects'
import { RuleViolation } from './rules'
import { dropUnconsciousHeldItems } from './equipment'
import { isActiveMonster, reconcileKnockoutHp, hasIndependentUnconscious, type KnockoutState } from '../lib/nonlethal-state'
import { assertKnockoutDamageSupported, assertKnockoutTimeAdvance, assertKnockoutHealingSupported, startKnockoutRecovery, validateKnockoutRecoveryHistory } from './nonlethal'
import { validateSurpriseState } from '../lib/surprise-state'
import { completeSurpriseTurn, completeSkippedKnockoutSurpriseTurn, clearCombatSurprise, removeSurpriseActor } from './surprise'
import { reconcileNpcHpChange, startNpcDeathSaveTurn, assertNpcTurnDeathSaveResolved, validateNpcLifeState, assertNpcLifeTimeAdvance, assertNpcRoundEventRoster, dropNpcForSuffocation, persistedNpc, stabilizeNpc } from './npc-life'
import { isDyingNpc, cleanupNpcActualDeath } from '../lib/npc-life-state'
import { assertBreathingRecoveryAllowed, breathingRecoveryBlocked, breathingTurnEventDue, breathingRetainsCombatSlot, assertBreathingTimeAdvance, validateBreathingState, noteBlockedBreathingStabilization, clearBlockedBreathingStabilization, clearBreathingBlockedRecovery, type BreathingCollapseEvent } from './breathing'
import { breathingStateOf, type BreathingBlockedStabilization } from '../lib/breathing-state'
import { startSuffocationPlayerDying, clearSuffocationPlayerDying, assertSuffocationPlayerTimeAdvance, validateSuffocationPlayerDying } from './suffocation-player'
import { beginPlayerStableRecovery, closePlayerStableRecovery, assertPlayerRecoveryTimeAdvance, validatePlayerRecoveryState } from './player-recovery'
import { reconcilePlayerDamageLife,closePlayerDyingLife,assertPlayerLifeTimeAdvance,assertPlayerTurnSaveResolved,validatePlayerLifeState,observePlayerDyingCombatEntry } from './player-life'
import { playerLifeEpisodeId } from '../lib/player-life-state'
import { validatePhysicalHandlingState } from '../lib/physical-handling-state'
import { validateNpcPartyState,isEnrolledNonhostileNpcCombatant } from '../lib/npc-party-state'
import { validateNpcContinuityState } from '../lib/npc-continuity-state'
import { validateNpcRestState } from '../lib/npc-rest-state'
import { validateRestState } from './resting'
import { validateTravelState } from '../lib/travel-state'
import { validateSpellbooksState } from '../lib/spellbooks-state'
import { jumpingDueIssue,validateJumpingState } from '../lib/jumping-state'
import { validateVerticalBarrierRecords } from '../lib/vertical-barriers'
import { weatherDueIssue,weatherRoundPauseValid } from '../lib/weather-state'
import { assertWeatherTimeAdvance,weatherClockExpirations,validateWeatherState } from './weather'
import { assertWeatherFlightTurn,assertWeatherMapArrival,noteWeatherFlightMovement } from './weather-flight'
import { reconcileWeatherInventory } from './weather'

// Construit le joueur initial : personnage actif (classe, stats, kit, PV,
// capacités, sorts) fusionné avec les deltas de l'aventure (niveau, position,
// objets propres). Voir lib/character-registry.ts (buildPlayerState).
function buildInitialPlayer(): PlayerState {
  const map = getAdventureMap(ACTIVE_ADVENTURE_ID)
  return buildPlayerState({
    characterId: ACTIVE_CHARACTER_ID,
    level: map.initialPlayer.level,
    position: map.startCell,
    extraInventory: map.initialPlayer.extraInventory,
  })
}

let state: GameState = createInitialState()

function createInitialState(): GameState {
  const player = buildInitialPlayer()
  const initialMapId = firstMapId(ACTIVE_ADVENTURE_ID)
  const initialRoomId = inferRoomIdOnMap(player.position, initialMapId, ACTIVE_ADVENTURE_ID)
  return initializeSocialPersonalities({
    ...initialCurrencyState(player),
    ...(player.ruleset === 'srd2014' ? { hero: initialHeroState(player.characterId ?? 'fighter', player.level) } : {}),
    worldTimeSeconds: 0, turnCounter: 0, monsterEffects: [], monsterPowerImmunities: [],
    playerActionRevision: 0,
    combatGeneration: 0,
    npcActivationLedger: [],
    handledRequestIds: [],
    adventureId: ACTIVE_ADVENTURE_ID,
    characterId: ACTIVE_CHARACTER_ID,
    phase: 'exploration',
    player,
    monsters: {},
    npcs: seedAdventureNpcs(ACTIVE_ADVENTURE_ID),
    initiativeOrder: [],
    currentTurn: null,
    round: 0,
    movementUsed: {},
    diagonalMovementUsed: {},
    actionUsed: {},
    bonusActionUsed: {},
    combatLog: [],
    roomsVisited: initialRoomId ? [initialRoomId] : [],
    currentRoomId: initialRoomId,
    currentMapId: initialMapId,
    mapOutcomes: {},
    encountersTriggered: [],
    worldFacts: [],
    droppedItems: seedAdventureGroundItems(ACTIVE_ADVENTURE_ID),
    ...(getAdventureMap(ACTIVE_ADVENTURE_ID).layoutMigrations?.length ? {
      sceneMemory: { layoutMigrations: getAdventureMap(ACTIVE_ADVENTURE_ID).layoutMigrations!.map(m => m.id) },
    } : {}),
  }, randomUUID())
}

function syncPlayerRoomFromPosition(): void {
  const previousRoomId = state.currentRoomId
  const roomId = inferRoomIdOnMap(state.player.position, state.currentMapId, state)
  state.currentRoomId = roomId
  if (roomId && !state.roomsVisited.includes(roomId)) {
    state.roomsVisited.push(roomId)
  }
  // Purge des faits de monde bornés à la salle quittée (« eau au sol »…).
  if (previousRoomId && roomId !== previousRoomId) {
    purgeWorldFacts(fact => fact.expires === 'room' && fact.roomId === previousRoomId)
  }
  rememberMapDiscovery(state)
}

// Retire les faits de monde qui satisfont le prédicat. Centralisé pour que la
// purge (salle/carte) reste cohérente.
function purgeWorldFacts(shouldRemove: (fact: WorldFact) => boolean): void {
  if (!state.worldFacts?.length) return
  state.worldFacts = state.worldFacts.filter(fact => !shouldRemove(fact))
}

const MAX_WORLD_FACTS = 8

// Transient facts have a FIFO cap. Durable consequences must survive that cap.
export function addWorldFact(fact: Omit<WorldFact, 'id'>): WorldFact {
  const created: WorldFact = {
    ...fact,
    id: `wf-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  }
  const projected = [...(state.worldFacts??[]),created]
  const transient = projected.filter(entry => entry.expires !== 'never')
  const retainedIds = new Set(transient.slice(-MAX_WORLD_FACTS).map(entry => entry.id))
  const nextFacts = projected.filter(entry => entry.expires === 'never' || retainedIds.has(entry.id))
  if(protectedEncounterCadenceFactIds(state).some(id=>encounterCadenceWitness(nextFacts.find(f=>f.id===id))!==encounterCadenceWitness(state.worldFacts?.find(f=>f.id===id))))throw new RuleViolation('ENCOUNTER_CADENCE_FACT_REQUIRED','Keep the actual active cadence map qualification before replacement or eviction.',{})
  if(protectedChaseFactIds(state).some(id=>!nextFacts.some(f=>f.id===id)))throw new RuleViolation('CHASE_QUALIFICATION_FACT_REQUIRED','Retain the original actual held chase qualification before replacement/eviction.',{})
  if(protectedDowntimeFactIds(state).some(id=>!nextFacts.some(f=>f.id===id)))throw new RuleViolation('DOWNTIME_QUALIFICATION_FACT_REQUIRED','Retain the actual unfinished job/held Work fact; record a new distinct phase fact without erasing acquired effort or its original result.',{})
  if(protectedKnotFactIds(state).some(id=>!nextFacts.some(entry=>entry.id===id)))
    throw new RuleViolation('KNOT_PENDING_FACT_LOCKED','Keep the exact physical qualification participating in the original held knot; no source fact is evicted before its check finishes.',{})
  if(protectedXgeTrainingFactIds(state).some(id=>!nextFacts.some(entry=>entry.id===id)))throw new RuleViolation('XGE_TRAINING_QUALIFICATION_FACT_REQUIRED','Keep the actual active durable teacher/permission qualification; add a phase fact or explicitly agree on a different teacher without erasing acquired paid instruction.',{})
  state.worldFacts = nextFacts
  return created
}

// Only tool handlers that validated the replacement may call this.
export function removeWorldFact(factId: string): void {
  if((state.worldFacts??[]).find(f=>f.id===factId)?.improvisedHazardEventId!==undefined)throw new RuleViolation('IMPROVISED_HAZARD_FACT_REQUIRED','Retain the actual physical occurrence and its one-shot result; record a distinct new fact instead.',{})
  if(protectedEncounterCadenceFactIds(state).includes(factId))throw new RuleViolation('ENCOUNTER_CADENCE_FACT_REQUIRED','Keep the actual active cadence map qualification until explicit stop.',{})
  if(protectedChaseFactIds(state).includes(factId))throw new RuleViolation('CHASE_QUALIFICATION_FACT_REQUIRED','Retain the original actual held chase qualification before removal.',{})
  if(protectedXgeTrainingFactIds(state).includes(factId))throw new RuleViolation('XGE_TRAINING_QUALIFICATION_FACT_REQUIRED','Keep the actual active durable teacher/permission qualification; add a phase fact or explicitly agree on a different teacher without erasing acquired paid instruction.',{})
  if(protectedDowntimeFactIds(state).includes(factId))throw new RuleViolation('DOWNTIME_QUALIFICATION_FACT_REQUIRED','Retain the actual unfinished job/held Work fact; record a new distinct phase fact without erasing acquired effort or its original result.',{})
  if(protectedKnotFactIds(state).includes(factId))
    throw new RuleViolation('KNOT_PENDING_FACT_LOCKED','Keep the exact physical qualification participating in the original held knot before replacement or removal; unrelated facts remain mutable.',{})
  purgeWorldFacts(fact => fact.id === factId)
}

// Faits de monde actifs sur la carte courante (pour l'injection au prompt).
export function getActiveWorldFacts(): WorldFact[] {
  const currentMapId = state.currentMapId ?? firstMapId(state)
  return (state.worldFacts ?? []).filter(fact => fact.mapId === currentMapId
    && (!fact.roomId || fact.roomId === state.currentRoomId))
}

function syncDyingPlayerState(): void {
  state.player.deathSaves ??= { successes: 0, failures: 0 }

  if (state.player.hp.current > 0) {
    state.player.deathSaves = { successes: 0, failures: 0 }
    // A positive-HP creature may be unconscious for an explicitly established
    // reason. Hydration is not healing or waking; preserve its saved condition.
    return
  }

  state.player.hp.current = 0
  if (!state.player.conditions.includes('unconscious') && !state.player.deathSaves.dead) {
    state.player.conditions.push('unconscious')
  }

  if (state.phase === 'combat' && !state.player.deathSaves.dead) {
    if (!state.initiativeOrder.includes('player')) {
      state.initiativeOrder.push('player')
    }
    state.currentTurn ??= 'player'
  }
}

export function getState(): GameState {
  return state
}

export function resetState(): GameState {
  state = createInitialState()
  return state
}

export function replaceState(nextState: GameState, { prepareSocial = false }: { prepareSocial?: boolean } = {}): GameState {
  const objectiveIssues=validateObjectiveJournal({...nextState,adventureId:ACTIVE_ADVENTURE_ID});if(objectiveIssues.length)throw new RuleViolation('OBJECTIVE_JOURNAL_STATE_MISMATCH',objectiveIssues.join(' '),{})
  const cycleIssues=validateAdventuringCycles(nextState);if(cycleIssues.length)throw new RuleViolation('ADVENTURING_CYCLE_STATE_MISMATCH',cycleIssues.join(' '),{})
  const improvisedIssues=validateImprovisedHazards(nextState);if(improvisedIssues.length)throw new RuleViolation('IMPROVISED_HAZARD_STATE_MISMATCH',improvisedIssues.join(' '),{})
  const campaignIssues=validateCampaignOutcomesState(nextState);if(campaignIssues.length)throw new RuleViolation('CAMPAIGN_OUTCOME_STATE_MISMATCH',campaignIssues.join(' '),{})
  const criticalSpellIssues=validateCriticalSpellsState(nextState);if(criticalSpellIssues.length)throw new RuleViolation('CRITICAL_SPELL_STATE_MISMATCH',criticalSpellIssues.join(' '),{})
  const pitTrapIssues=validatePitTraps(nextState);if(pitTrapIssues.length)throw new RuleViolation('PIT_STATE_MISMATCH',pitTrapIssues.join(' '),{})
  const tumbleIssues=validateTumbleState(nextState);if(tumbleIssues.length)throw new RuleViolation('TUMBLE_STATE_MISMATCH',tumbleIssues.join(' '),{})
  const overrunIssues=validateOverrunState(nextState);if(overrunIssues.length)throw new RuleViolation('OVERRUN_STATE_MISMATCH',overrunIssues.join(' '),{})
  const cleavingIssues=validateCleavingState(nextState);if(cleavingIssues.length)throw new RuleViolation('CLEAVING_STATE_MISMATCH',cleavingIssues.join(' '),{})
  const asideIssues=validateShoveAsideState(nextState);if(asideIssues.length)throw new RuleViolation('SHOVE_ASIDE_STATE_MISMATCH',asideIssues.join(' '),{})
  const chaseIssues=validateChaseState(nextState);if(chaseIssues.length)throw new RuleViolation('CHASE_STATE_MISMATCH',chaseIssues.join(' '),{})
  const knotIssues=validateKnotState(nextState);if(knotIssues.length)throw new RuleViolation('KNOT_STATE_MISMATCH',knotIssues.join(' '),{})
  const razorvineIssues=validateRazorvineHistory(nextState);if(razorvineIssues.length)throw new RuleViolation('RAZORVINE_STATE_MISMATCH',razorvineIssues.join(' '),{})
  const iceIssues=validateSlipperyIceState(nextState);if(iceIssues.length)throw new RuleViolation('SLIPPERY_ICE_STATE_MISMATCH',iceIssues.join(' '),{})
  const chargedIssues=validateChargedItems(nextState);if(chargedIssues.length)throw new RuleViolation('CHARGED_ITEM_STATE_MISMATCH',chargedIssues.join(' '),{})
  const rewardIssues=[...validateAdventureRewardState(nextState),...validateAdventureRewardSources({...nextState,adventureId:ACTIVE_ADVENTURE_ID})];if(rewardIssues.length)throw new RuleViolation('ADVENTURE_REWARD_STATE_MISMATCH',rewardIssues.join(' '),{})
  const gearIssues=validateGroundGearState(nextState);if(gearIssues.length)throw new RuleViolation('GROUND_GEAR_STATE_MISMATCH',gearIssues.join(' '),{})
  const merchantIssues=validateMerchantState(nextState);if(merchantIssues.length)throw new RuleViolation('MERCHANT_STATE_MISMATCH',merchantIssues.join(' '),{})
  const valuableResaleIssues=validateValuableResaleSources({...nextState,adventureId:ACTIVE_ADVENTURE_ID});if(valuableResaleIssues.length)throw new RuleViolation('VALUABLE_RESALE_SOURCE_MISMATCH',valuableResaleIssues.join(' '),{})
  const downtimeIssues=[...validateDowntimeState(nextState),...validateDowntimeSource(nextState)];if(downtimeIssues.length)throw new RuleViolation('DOWNTIME_STATE_MISMATCH',downtimeIssues.join(' '),{})
  const calendarIssues=[...validateCalendarState(nextState),...validateCalendarSource(nextState)];if(calendarIssues.length)throw new RuleViolation('CALENDAR_STATE_MISMATCH',calendarIssues.join(' '),{})
  const rechargeIssues=validateRechargeCalendarState(nextState,ACTIVE_ADVENTURE_ID);if(rechargeIssues.length)throw new RuleViolation('XGE_RECHARGE_CALENDAR_STATE_MISMATCH',rechargeIssues.join(' '),{})
  const itemRechargeIssues=validateItemRechargeCalendarState(nextState,ACTIVE_ADVENTURE_ID);if(itemRechargeIssues.length)throw new RuleViolation('XGE_ITEM_RECHARGE_CALENDAR_STATE_MISMATCH',itemRechargeIssues.join(' '),{})
  const renownIssues=[...validateRenownState(nextState),...validateRenownSource(nextState)];if(renownIssues.length)throw new RuleViolation('RENOWN_STATE_MISMATCH',renownIssues.join(' '),{})
  const tradeGoodsIssues=[...validateTradeGoodsState(nextState),...validateTradeGoodsSources(nextState)];if(tradeGoodsIssues.length)throw new RuleViolation('TRADE_GOODS_STATE_MISMATCH',tradeGoodsIssues.join(' '),{})
  const resaleIssues=validateMerchantResaleState(nextState);if(resaleIssues.length)throw new RuleViolation('MERCHANT_RESALE_STATE_MISMATCH',resaleIssues.join(' '),{})
  const craftingIssues=validateOrdinaryCraftingState(nextState);if(craftingIssues.length)throw new RuleViolation('ORDINARY_CRAFT_STATE_MISMATCH',craftingIssues.join(' '),{})
  const harvestIssues=validatePoisonHarvestState(nextState);if(harvestIssues.length)throw new RuleViolation('POISON_HARVEST_STATE_MISMATCH',harvestIssues.join(' '),{})
  const xgeTrainingIssues=[...validateXgeTrainingState(nextState),...validateXgeTrainingSource(nextState)];if(xgeTrainingIssues.length)throw new RuleViolation('XGE_TRAINING_STATE_MISMATCH',xgeTrainingIssues.join(' '),{})
  const carousingIssues = [...validateXgeCarousingState(nextState), ...validateXgeCarousingSource(nextState)]
  if (carousingIssues.length) throw new RuleViolation('XGE_CAROUSING_STATE_MISMATCH', carousingIssues.join(' '), {})
  const serviceIssues = [...validateXgeReligiousServiceState(nextState), ...validateXgeReligiousServiceSource(nextState)]
  if (serviceIssues.length) throw new RuleViolation('XGE_SERVICE_STATE_MISMATCH', serviceIssues.join(' '), {})
  const gamblingIssues = [...validateXgeGamblingState(nextState), ...validateXgeGamblingSource(nextState)]
  if (gamblingIssues.length) throw new RuleViolation('XGE_GAMBLING_STATE_MISMATCH', gamblingIssues.join(' '), {})
  const pitIssues = [...validateXgePitFightingState(nextState), ...validateXgePitFightingSource(nextState)]
  if (pitIssues.length) throw new RuleViolation('XGE_PIT_STATE_MISMATCH', pitIssues.join(' '), {})
  const scribingIssues = [...validateXgeScrollScribingState(nextState), ...validateXgeScribingSource(nextState)]
  if (scribingIssues.length) throw new RuleViolation('XGE_SCRIBING_STATE_MISMATCH', scribingIssues.join(' '), {})
  const brewingIssues = [...validateXgeBrewingState(nextState), ...validateXgeBrewingSource(nextState)]
  if (brewingIssues.length) throw new RuleViolation('XGE_BREWING_STATE_MISMATCH', brewingIssues.join(' '), {})
  const relaxationIssues = [...validateRelaxationState(nextState), ...validateRelaxationSources(nextState)]
  if (relaxationIssues.length) throw new RuleViolation('XGE_RELAXATION_STATE_MISMATCH', relaxationIssues.join(' '), {})
  const researchIssues = [...validateXgeResearchState(nextState), ...validateXgeResearchSource(nextState)]
  if (researchIssues.length) throw new RuleViolation('XGE_RESEARCH_STATE_MISMATCH', researchIssues.join(' '), {})
  const trainingIssues=validateTrainingState(nextState);if(trainingIssues.length)throw new RuleViolation('TRAINING_STATE_MISMATCH',trainingIssues.join(' '),{})
  const oilIssues=oilStateIssues(nextState);if(oilIssues.length)throw new RuleViolation('OIL_STATE_MISMATCH',oilIssues.join(' '),{})
  const cadenceIssues=encounterCadenceStateIssues(nextState,ACTIVE_ADVENTURE_ID);if(cadenceIssues.length)throw new RuleViolation('ENCOUNTER_CADENCE_STATE_MISMATCH',cadenceIssues.join(' '),{})
  const encounterIssues=randomEncounterStateIssues(nextState,ACTIVE_ADVENTURE_ID);if(encounterIssues.length)throw new RuleViolation('RANDOM_ENCOUNTER_STATE_MISMATCH',encounterIssues.join(' '),{})
  const urbanIssues=validateUrbanEncounterHistory(nextState,ACTIVE_ADVENTURE_ID);if(urbanIssues.length)throw new RuleViolation('URBAN_ENCOUNTER_STATE_MISMATCH',urbanIssues.join(' '),{})
  const encounterTableIssues=campaignEncounterTableStateIssues(nextState,ACTIVE_ADVENTURE_ID);if(encounterTableIssues.length)throw new RuleViolation('ENCOUNTER_TABLE_STATE_MISMATCH',encounterTableIssues.join(' '),{})
  const basicPoisonValidation=validateBasicPoisonState(nextState)
  if(basicPoisonValidation.length)throw new RuleViolation('BASIC_POISON_STATE_MISMATCH',basicPoisonValidation.join(' '),{})
  const xgeIssues=[...validateXgeFallingState(nextState),...validateXgeFallingGeometry(nextState)];if(xgeIssues.length)throw new RuleViolation('XGE_FALL_STATE_MISMATCH',xgeIssues.join(' '),{})
  const sleepIssues=validateSleepState(nextState);if(sleepIssues.length)throw new RuleViolation('SLEEP_STATE_MISMATCH',sleepIssues.join(' '),{})
  const swallowIssues=validateSwallowState(nextState);if(swallowIssues.length)throw new RuleViolation('SWALLOW_STATE_MISMATCH',swallowIssues.join(' '),{})
  const playerPoisonValidation=[...validatePlayerPoisonState(nextState),...validatePoisonNutrition(nextState),...validateNativePoisonState(nextState)]
  if(playerPoisonValidation.length)throw new RuleViolation('PLAYER_POISON_STATE_MISMATCH',playerPoisonValidation.join(' '),{})
  nextState = migrateSocialState(nextState)
  const improvisedValidation=validateImprovisedState(nextState)
  if(improvisedValidation.length)throw new RuleViolation('INVALID_IMPROVISED_STATE',improvisedValidation.join(' '),{})
  const netValidation=validateNetState(nextState)
  if(netValidation.length)throw new RuleViolation('NET_STATE_MISMATCH',netValidation[0],{errors:netValidation})
  const lightValidation=validateLightSpellState(nextState)
  const invalidTargetValidation=validateInvalidTargetState(nextState)
  if(invalidTargetValidation.length)throw new RuleViolation('XGE_INVALID_TARGET_STATE_MISMATCH',invalidTargetValidation.join(' '),{})
  const sacredRitesValidation=validateSacredRitesState(nextState)
  if(sacredRitesValidation.length)throw new RuleViolation('SACRED_RITES_STATE_MISMATCH',sacredRitesValidation.join(' '),{})
  if(lightValidation.length)throw new RuleViolation('LIGHT_SPELL_STATE_INVALID',lightValidation.join(' '),{})
  const spellPerceptionValidation=validateSpellPerceptionState(nextState)
  if(spellPerceptionValidation.length)throw new RuleViolation('SPELL_PERCEPTION_STATE_INVALID',spellPerceptionValidation.join(' '),{})
  const adamantineValidation=[...validateAdamantineState(nextState),...validateObjectWeaponAttacks(nextState)]
  if(adamantineValidation.length)throw new RuleViolation('ADAMANTINE_STATE_INVALID',adamantineValidation.join(' '),{})
  const trapInitiativeIssues=validateComplexTrapInitiative(nextState)
  if(trapInitiativeIssues.length)throw new RuleViolation('COMPLEX_TRAP_INITIATIVE_STATE_INVALID',trapInitiativeIssues.join(' '),{})
  const castingValidation=validateCastingState(nextState)
  if(castingValidation.length)throw new RuleViolation('CASTING_STATE_MISMATCH',castingValidation[0],{errors:castingValidation})
  const alarmIssues=validateAlarmSpellState({...nextState,adventureId:ACTIVE_ADVENTURE_ID})
  if(alarmIssues.length)throw new RuleViolation('ALARM_STATE_MISMATCH',alarmIssues.join(' '),{})
  const desecrationIssues = validateDesecratedGroundHistory(nextState)
  if (desecrationIssues.length) throw new RuleViolation('DESECRATED_GROUND_STATE_MISMATCH', desecrationIssues.join(' '), {})
  const frigidWaterIssues = validateFrigidWaterHistory({...nextState, adventureId: ACTIVE_ADVENTURE_ID})
  if (frigidWaterIssues.length) throw new RuleViolation('FRIGID_WATER_STATE_MISMATCH', frigidWaterIssues.join(' '), {})
  const playerLifeValidation=validatePlayerLifeState(nextState)
  if(playerLifeValidation.length)throw new RuleViolation('PLAYER_LIFE_STATE_MISMATCH',playerLifeValidation[0],{errors:playerLifeValidation})
  const playerRecoveryValidation=validatePlayerRecoveryState(nextState)
  if(playerRecoveryValidation.length)throw new RuleViolation('PLAYER_RECOVERY_STATE_MISMATCH',playerRecoveryValidation[0],{errors:playerRecoveryValidation})
  const breathingValidation=validateBreathingState(nextState)
  breathingValidation.push(...validateSuffocationPlayerDying(nextState))
  if(breathingValidation.length)throw new RuleViolation('BREATHING_STATE_MISMATCH',breathingValidation[0],{errors:breathingValidation})
  const physicalHandlingValidation=validatePhysicalHandlingState(nextState)
  if(physicalHandlingValidation.length)throw new RuleViolation('PHYSICAL_HANDLING_STATE_MISMATCH',physicalHandlingValidation[0],{errors:physicalHandlingValidation})
  const partyIssues=validateNpcPartyState(nextState);if(partyIssues.length)throw new RuleViolation('NPC_PARTY_STATE_MISMATCH',partyIssues.join(' '),{})
  const npcContinuityIssues=validateNpcContinuityState(nextState);if(npcContinuityIssues.length)throw new RuleViolation('NPC_CONTINUITY_STATE_MISMATCH',npcContinuityIssues.join(' '),{})
  const npcRestIssues=validateNpcRestState(nextState);if(npcRestIssues.length)throw new RuleViolation('NPC_REST_STATE_MISMATCH',npcRestIssues.join(' '),{})
  const restValidation=validateRestState(nextState)
  if(restValidation.length)throw new RuleViolation('REST_STATE_MISMATCH',restValidation[0],{errors:restValidation})
  const travelValidation=validateTravelState(nextState)
  const spellbookValidation=validateSpellbooksState(nextState)
  const jumpValidation=[...validateJumpingState(nextState),...validateVerticalBarrierRecords(nextState),...validateLocomotionState(nextState),...validateUnderwaterState(nextState),...validateNativeFlightState(nextState),...validateSpatialOpportunityState(nextState)]
  if(jumpValidation.length)throw new RuleViolation('JUMP_STATE_INVALID',jumpValidation.join(' '),{})
  if(spellbookValidation.length)throw new RuleViolation('SPELLBOOK_STATE_INVALID',spellbookValidation.join(' '),{})
  const weatherValidation=validateWeatherState({...nextState,adventureId:nextState.adventureId??state.adventureId??ACTIVE_ADVENTURE_ID})
  if(weatherValidation.length)throw new RuleViolation('WEATHER_STATE_INVALID',weatherValidation.join(' '),{})
  if(nextState.dmTools?.weather?.pendingCombatRound&&!weatherRoundPauseValid(nextState))throw new RuleViolation('WEATHER_ROUND_CONTINUATION_MISMATCH','The weather pause must retain its exact real round tick and due source event.',{})
  if(nextState.dmTools?.weather?.pendingCombatRound?.awaitingCombatClosure&&nextState.initiativeOrder.some(id=>canTakeInitiativeTurnInState(nextState,id)))
    throw new RuleViolation('WEATHER_ROUND_CONTINUATION_MISMATCH','A completed round waits for explicit combat closure only when no real initiative slot can start.',{})
  if(travelValidation.length)throw new RuleViolation('TRAVEL_STATE_MISMATCH',travelValidation[0],{errors:travelValidation})
  const doorDiscoveryErrors=validateDoorDiscoveryState({...nextState,adventureId:nextState.adventureId??state.adventureId??ACTIVE_ADVENTURE_ID})
  if(doorDiscoveryErrors.length)throw new RuleViolation('DOOR_DISCOVERY_STATE_MISMATCH',doorDiscoveryErrors[0],{errors:doorDiscoveryErrors})
  const socialInteractionErrors=validateSocialInteractionState({...nextState,adventureId:nextState.adventureId??state.adventureId??ACTIVE_ADVENTURE_ID})
  if(socialInteractionErrors.length)throw new RuleViolation('SOCIAL_INTERACTION_STATE_MISMATCH',socialInteractionErrors[0],{errors:socialInteractionErrors})
  const npcLifeValidation=validateNpcLifeState(nextState)
  if(!npcLifeValidation.valid)throw new RuleViolation('NPC_LIFE_STATE_MISMATCH',npcLifeValidation.errors[0],{errors:npcLifeValidation.errors})
  const knockoutValidation=validateKnockoutRecoveryHistory(nextState)
  if(!knockoutValidation.valid)throw new RuleViolation('KNOCKOUT_STATE_MISMATCH',knockoutValidation.errors[0],{errors:knockoutValidation.errors})
  const surpriseValidation = validateSurpriseState(nextState)
  if (!surpriseValidation.valid)
    throw new RuleViolation('SURPRISE_STATE_MISMATCH', surpriseValidation.errors[0], { errors: surpriseValidation.errors })
  const cackleIssues=validateCackleHistory(nextState);if(cackleIssues.length)throw new RuleViolation('CACKLE_STATE_MISMATCH',cackleIssues.join(' '),{})
  const sewerIssues = validateSewerPlagueHistory(nextState)
  if (sewerIssues.length) throw new RuleViolation('SEWER_PLAGUE_STATE_MISMATCH', sewerIssues[0], { errors: sewerIssues })
  const petrificationValidation = validatePetrifiedAfflictionHistory(nextState)
  if (!petrificationValidation.valid) {
    const issue = petrificationValidation.errors[0]
    throw new RuleViolation(issue.code, issue.message, { recordId: issue.recordId })
  }
  const spritePetrificationValidation = validatePetrifiedSpriteHistory(nextState)
  if (!spritePetrificationValidation.valid) {
    const issue = spritePetrificationValidation.errors[0]
    throw new RuleViolation(issue.code, issue.message, { effectId: issue.effectId })
  }
  const exhaustionValidation = validateExhaustionState(nextState)
  if (!exhaustionValidation.valid) {
    const issue = exhaustionValidation.errors[0]
    throw new RuleViolation(issue.code,issue.message,{targetId:issue.targetId,errors:exhaustionValidation.errors})
  }
  // Legacy boolean-only exhaustion remains loadable, explicitly unresolved.
  // Its mechanical actions require an authoritative level before resolution.
  nextState = migrateCurrencyState(nextState)
  const socialProfileSeed = nextState.socialProfileSeed ?? state.socialProfileSeed ?? randomUUID()
  // L'aventure de l'état entrant fait foi si présente ; sinon celle du process
  // (états historiques sans le champ). Un process = une avention : on ne bascule
  // jamais d'aventure ici, on ne fait que compléter un état qui n'en portait pas.
  const adventureId = nextState.adventureId ?? ACTIVE_ADVENTURE_ID
  nextState = migrateMapLayout({ ...nextState, adventureId })
  state = {
    ...structuredClone(nextState),
    worldTimeSeconds: nextState.worldTimeSeconds ?? 0,
    turnCounter: nextState.turnCounter ?? 0,
    monsterEffects: structuredClone(nextState.monsterEffects ?? []),
    monsterPowerImmunities: structuredClone(nextState.monsterPowerImmunities ?? []),
    playerActionRevision: nextState.playerActionRevision ?? 0,
    combatGeneration: nextState.combatGeneration ?? 0,
    npcActivationLedger: structuredClone(nextState.npcActivationLedger ?? []),
    handledRequestIds: structuredClone(nextState.handledRequestIds ?? []),
    adventureId,
    // Personnage : l'état entrant fait foi ; sinon le personnage du process
    // (états historiques sans le champ = guerrier via ACTIVE_CHARACTER_ID).
    characterId: nextState.characterId ?? ACTIVE_CHARACTER_ID,
    movementUsed: structuredClone(nextState.movementUsed ?? {}),
    diagonalMovementUsed: structuredClone(nextState.diagonalMovementUsed ?? {}),
    actionUsed: structuredClone(nextState.actionUsed ?? {}),
    // Économie d'action bonus (états legacy sans ce champ = vide).
    bonusActionUsed: structuredClone(nextState.bonusActionUsed ?? {}),
    roomsVisited: structuredClone(nextState.roomsVisited ?? []),
    // Multi-map : états historiques sans ces champs = première map, aucune
    // map quittée. Doivent survivre au round-trip (docs/multi-map-adventures.md).
    currentMapId: nextState.currentMapId ?? firstMapId(adventureId),
    mapOutcomes: structuredClone(nextState.mapOutcomes ?? {}),
    encountersTriggered: structuredClone(nextState.encountersTriggered ?? []),
    ...(nextState.campaignOutcomeHistory?{campaignOutcomeHistory:structuredClone(nextState.campaignOutcomeHistory)}:{}),
    ...(nextState.adventuringCycleEvents?{adventuringCycleEvents:structuredClone(nextState.adventuringCycleEvents)}:{}),
    // Faits de monde (sorts utilitaires) : doivent survivre au round-trip, sinon
    // ils seraient perdus au premier tour suivant (docs/playable-characters.md).
    worldFacts: structuredClone(nextState.worldFacts ?? []),
    droppedItems: structuredClone(nextState.droppedItems ?? {}),
    // PNJ : on préserve l'état client s'il existe (révélations déjà faites), sinon on
    // ré-amorce le seed du module (états historiques sans le champ npcs).
    npcs: nextState.npcs
      ? (prepareSocial ? hydrateNpcStatBlocks(structuredClone(nextState.npcs), getAdventureMap(nextState).npcs,nextState.dmTools?.npcs) : structuredClone(nextState.npcs))
      : seedAdventureNpcs(adventureId),
    ...(nextState.socialProfileSeed ? { socialProfileSeed: nextState.socialProfileSeed } : {}),
    ...(nextState.socialPersonalities ? { socialPersonalities: structuredClone(nextState.socialPersonalities) } : {}),
  }
  // Combat and map representations of one NPC share the same live object.
  for (const [id, npc] of Object.entries(state.npcs ?? {})) {
    const combatant = state.monsters[id]
    if (combatant && isStatBackedNpc(npc)) state.monsters[id] = Object.assign(npc, combatant)
  }
  // Explicit hydration fills newly authored profiles without rerolling old ones.
  // Internal action rollbacks restore their snapshot without preparing new actors.
  if (prepareSocial || !nextState.socialProfileSeed || !nextState.socialPersonalities) initializeSocialPersonalities(state, socialProfileSeed)
  syncPlayerRoomFromPosition()
  syncDyingPlayerState()
  return state
}

export function getPlayer(): PlayerState {
  return state.player
}

const physicalResolutionIds=new Set<string>()
/** Internal physical consequences only: current-map sourced bodies exist
 * independently of their discovery. This never enlists or reveals a body. */
export function getPhysicalCreature(id:string):PlayerState|MonsterState|undefined{
  if(id==='player')return state.player
  const monster=state.monsters[id]
  if(monster)return monster // This collection is the actual active-map roster.
  const npc=state.npcs?.[id]
  return isStatBackedNpc(npc)&&npcOnCurrentMap(npc)?npc:undefined
}
/** Synchronous internal scope for existing HP/concentration/life hooks.
 * No public tool accepts these IDs or opens this scope. Visibility state and
 * the combat roster remain unchanged, including after exceptions. */
export function withPhysicalCreatureResolution<T>(ids:readonly string[],resolve:()=>T):T{
  const added=ids.filter(id=>!physicalResolutionIds.has(id))
  for(const id of added)if(!getPhysicalCreature(id))throw new RuleViolation('PHYSICAL_BODY_REQUIRED','Only a real sourced body on this map can receive a physical consequence.',{entityId:id})
  for(const id of added)physicalResolutionIds.add(id)
  try{return resolve()}finally{for(const id of added)physicalResolutionIds.delete(id)}
}
export function getMonster(id: string): MonsterState | undefined {
  if (state.monsters[id]) return state.monsters[id]
  const npc = state.npcs?.[id]
  return isStatBackedNpc(npc) && (npc.visible||physicalResolutionIds.has(id)) && npcOnCurrentMap(npc) ? npc : undefined
}

export function getAllEntities(): Array<PlayerState | MonsterState> {
  const npcs = Object.values(state.npcs ?? {}).filter(npc => !state.monsters[npc.id]
    && npc.visible && npcOnCurrentMap(npc) && isStatBackedNpc(npc)) as Array<NpcState & MonsterState>
  return [state.player, ...Object.values(state.monsters), ...npcs]
}

export function getEntity(id: string): PlayerState | MonsterState | undefined {
  if (id === 'player') return state.player
  return getMonster(id)
}

// Called only by the explicitly requested enter_combat, after its validation.
export function enlistNpcCombatants(ids: string[]): void {
  for (const id of ids) if (id !== 'player' && !state.monsters[id]) {
    const npc = getMonster(id)
    if (!npc) throw new Error(`NPC_COMBATANT_NOT_PRESENT: ${id}`)
    state.monsters[id] = npc
  }
}

/** Actual unconscious transition only. Hydration deliberately does not call
 * this: loading an old snapshot is not a new fall or item-drop event. */
export function enterUnconscious(entityId: string) {
  const entity = getEntity(entityId)
  if (!entity) throw new Error(`Entity not found: ${entityId}`)
  if (conditionImmune(entity, 'unconscious')) return { applied: false, immune: true, entityId, condition: 'unconscious' as const }
  if(entityId==='player')clearActualFootwork()
  if(entityId==='player')releasePhysicalHandling(undefined,'Actual unconscious transition releases the held load')
  if (!entity.conditions.includes('unconscious')) entity.conditions.push('unconscious')
  if (!conditionImmune(entity, 'prone') && !entity.conditions.includes('prone')) entity.conditions.push('prone')
  const dropped = entityId === 'player' ? dropUnconsciousHeldItems() : []
  // Non-player stat blocks do not contain a physical held-item inventory. Do
  // not manufacture a recoverable sword merely from an attack's source name.
  return { applied: true, immune: false, entityId, condition: 'unconscious' as const, droppedItemIds: dropped.map(entry => entry.item.id) }
}

/** Record a death already resolved by its authoritative source. This neither
 * kills nor advances time and is safe to repeat for the same actual corpse. */
export function recordActualDeath(entityId: string) {
  const entity = entityId==='player'?getEntity(entityId):getPersistedMaximumHpTarget(entityId)
  const dead = entity && entity.hp.current <= 0 && (entityId === 'player'
    ? Boolean(state.player.deathSaves?.dead) : !(entity as MonsterState).isAlive)
  if (!dead) throw new RuleViolation('DEATH_NOT_ESTABLISHED', 'Only record the timestamp after this creature has actually died.', { entityId })
  cackleActualDeath(entityId)
  if(entityId!=='player')cleanupNpcActualDeath(entity as MonsterState)
  clearBlockedBreathingStabilization(entityId)
  clearBreathingBlockedRecovery(entityId)
  if(entityId==='player'){closePlayerDyingLife('dead');closePlayerStableRecovery('death')}
  reconcileSwallowDeaths()
  if (entityId === 'player') reconcileFrigidWaterPresence()
  if (state.hero) state.hero.corpseTimes[entityId] ??= state.worldTimeSeconds ?? 0
  return state.hero?.corpseTimes[entityId]
}

/** HP-maximum bookkeeping only. Never use archived actors for actions, range,
 * targeting or activation: those continue to use getEntity. */
export function getPersistedMaximumHpTarget(id: string): PlayerState | MonsterState | undefined {
  const active = getEntity(id)
  if (active) return active
  const partyBody=state.npcs?.[id];if(partyBody?.partyHistory?.length&&isStatBackedNpc(partyBody))return partyBody
  const retired = state.sceneMemory?.retiredMonsters as Record<string, MonsterState> | undefined
  if (retired?.[id]) return retired[id]
  const floors = state.sceneMemory?.floorMonsters as Record<string, Record<string, MonsterState>> | undefined
  let archived: MonsterState | undefined
  for (const [mapId, monsters] of Object.entries(floors ?? {})) if (mapId !== state.currentMapId && monsters[id]) archived = monsters[id]
  return archived
}

export function getNpc(id: string): NpcState | undefined {
  return state.npcs?.[id]
}

// Rend visible(s) un ou plusieurs PNJ de la salle courante (par id ou par kind), et
// peut ajuster leur disposition. Scopé à la salle du joueur (roomId null = global)
// pour éviter de révéler un PNJ d'une autre salle. Retourne les PNJ effectivement
// touchés.
// Un PNJ est « sur la map courante » si son mapId (défaut : première map,
// états legacy) correspond au currentMapId de l'état.
export function npcOnCurrentMap(npc: NpcState): boolean {
  const defaultMapId = firstMapId(state)
  return (npc.mapId ?? defaultMapId) === (state.currentMapId ?? defaultMapId)
}

export function revealNpcs(params: {
  npcId?: string
  kind?: string
  disposition?: WorldNpcDisposition
}): NpcState[] {
  if (!state.npcs) return []
  const currentRoomId = state.currentRoomId
  const matched: NpcState[] = []

  for (const npc of Object.values(state.npcs)) {
    const inScope = npcOnCurrentMap(npc) && (npc.roomId === null || npc.roomId === currentRoomId)
    if (!inScope) continue

    const idMatch = params.npcId ? npc.id === params.npcId : false
    // Tolérance id/kind : le LLM confond parfois les deux (kind:"madame_bougie"
    // alors que c'est un id) — un kind qui correspond à un id exact matche aussi.
    const kindMatch = params.kind ? (npc.kind === params.kind || npc.id === params.kind) : false
    if (!idMatch && !kindMatch) continue

    npc.visible = true
    if (params.disposition) {
      npc.disposition = params.disposition
      if (isStatBackedNpc(npc)) npc.hostile = params.disposition === 'hostile'
    }
    matched.push(npc)
  }

  return matched
}

export function updatePlayerHP(delta: number, damageContext?: import('../lib/temporary-hp-state').TemporaryHpDamageContext): PlayerState {if(delta!==0){assertImprovisedHazardBodyMutation('player');assertPitHeldBodyMutation('player');assertShoveAsideBodyMutationAllowed('player')};return withCackleConsequences(()=>{const result=updateCackleBoundPlayerHP(delta,damageContext);reconcileCleavingActorLife(state);return result})}
function updateCackleBoundPlayerHP(delta: number, damageContext?: import('../lib/temporary-hp-state').TemporaryHpDamageContext): PlayerState {
  const hpBeforeLife=state.player.hp.current,wasStableLife=Boolean(state.player.deathSaves?.stable)
  if(delta>0)assertBreathingRecoveryAllowed('player')
  const damageReceived = damageContext?.damageReceived ?? Math.max(0, -delta)
  delta = heroBeforeHPChange('player', delta, damageContext)
  const player = state.player
  player.deathSaves ??= { successes: 0, failures: 0 }

  if (player.deathSaves.dead && delta > 0) {
    return player
  }

  if (player.hp.current <= 0 && damageReceived > 0 && !player.deathSaves.dead) {
    closePlayerStableRecovery('damage')
    player.hp.current = 0
    player.deathSaves.stable = false
    player.deathSaves.failures = Math.min(3, player.deathSaves.failures + (damageContext?.critical ? 2 : 1))
    if (player.deathSaves.failures >= 3) {
      player.deathSaves.dead = true
      recordActualDeath('player')
    }
    enterUnconscious('player')
    heroAfterHPChange('player',0,delta)
    reconcilePlayerDamageLife({hpBefore:hpBeforeLife,wasStable:wasStableLife,damageReceived})
    return player
  }

  const previousHp = player.hp.current
  player.hp.current = Math.max(0, Math.min(player.hp.max, player.hp.current + delta))
  clearCaltropsOnActualHealing(state,'player',previousHp,player.hp.current)
  heroAfterHPChange('player', previousHp, delta)

  if (player.hp.current <= 0) {
    player.hp.current = 0
    if (!player.deathSaves.dead && !player.deathSaves.stable) enterUnconscious('player')
  } else {
    clearBlockedBreathingStabilization('player')
    closePlayerDyingLife('healed')
    closePlayerStableRecovery('healed')
    player.deathSaves = { successes: 0, failures: 0 }
    player.conditions = player.conditions.filter(condition => condition !== 'unconscious'
      || state.monsterEffects?.some(effect => effect.targetId === 'player' && effect.conditions.includes('unconscious'))
      || state.hero?.effects.some(effect => effect.targetIds.includes('player') && effect.data.condition === 'unconscious' && effect.expiresAt > (state.worldTimeSeconds ?? 0)))
  }

  reconcilePlayerDamageLife({hpBefore:hpBeforeLife,wasStable:wasStableLife,damageReceived})
  return player
}

export function consumePlayerItem(predicate: (item: Item) => boolean): Item | null {
  const index = state.player.inventory.findIndex(predicate)
  if (index < 0) return null
  const [item] = state.player.inventory.splice(index, 1)
  return item ?? null
}

// Callers validate reach, ownership and action economy before either mutation.
export function dropPlayerItem(itemId: string, placement?: Pick<DroppedItem, 'position' | 'anchor' | 'description'>) {
  if(swallowedBy(state,'player'))throw new RuleViolation('SWALLOW_INTERNAL_ITEM_PLACEMENT_REQUIRED','A contained item cannot be deposited on an exterior square; no inventory item crosses the actual host wall.',{})
  const bundle=groundGearContainerTransfer(state,itemId,'drop')
  if(bundle.issue)throw new RuleViolation(bundle.issue.code,bundle.issue.message,{})
  if(bundle.itemIds.some(id=>!state.player.inventory.some(item=>item.id===id)||state.droppedItems?.[id]))throw new RuleViolation('ITEM_NOT_OWNED','The exact real container and contents must be uniquely owned before transfer.',{})
  let first:DroppedItem|undefined
  for(const id of bundle.itemIds){
    const result=dropPlayerItemInstance(id,placement);first??=result
  }
  return first!
}
function dropPlayerItemInstance(itemId:string,placement?:Pick<DroppedItem,'position'|'anchor'|'description'>){
  purgeWorldFacts(fact => fact.subjectItemId === itemId)
  const item = consumePlayerItem(item => item.id === itemId)!
  const dropped = {
    item,
    mapId: state.currentMapId ?? firstMapId(state),
    roomId: inferRoomIdOnMap(placement?.position??state.player.position,state.currentMapId,state)??state.currentRoomId,
    position: { ...(placement?.position ?? state.player.position) },
    ...(placement?.anchor ? { anchor: structuredClone(placement.anchor) } : {}),
    ...(placement?.description ? { description: placement.description } : {}),
  }
  state.droppedItems ??= {}
  state.droppedItems[itemId] = dropped
  if (item.type === 'armor') state.player.ac -= item.acBonus ?? 0
  return dropped
}

export function pickUpPlayerItem(itemId: string) {
  if(swallowedBy(state,'player'))throw new RuleViolation('SWALLOW_EXTERNAL_REACH_BLOCKED','An actual contained body cannot retrieve exterior items through its host.',{})
  const bundle=groundGearContainerTransfer(state,itemId,'pickup')
  if(bundle.issue)throw new RuleViolation(bundle.issue.code,bundle.issue.message,{})
  if(bundle.itemIds.some(id=>!state.droppedItems?.[id]||state.player.inventory.some(item=>item.id===id)))throw new RuleViolation('ITEM_NOT_DROPPED','The real container and all contents must be uniquely deposited before retrieval.',{})
  if(bundle.itemIds.length>1)assertCarryingAcquisition({additionalItems:bundle.itemIds.map(id=>state.droppedItems![id].item)})
  for(const id of bundle.itemIds){const issue=netItemPickupIssue(state,id);if(issue)throw new RuleViolation(issue.code,issue.message,{})}
  let first:Item|undefined
  for(const id of bundle.itemIds){const result=pickUpPlayerItemInstance(id);first??=result}
  return first!
}
function pickUpPlayerItemInstance(itemId:string){
  const netIssue=netItemPickupIssue(state,itemId)
  if(netIssue)throw new RuleViolation(netIssue.code,netIssue.message,{})
  const dropped = state.droppedItems![itemId]
  state.player.inventory.push(dropped.item)
  if (dropped.item.type === 'armor') state.player.ac += dropped.item.acBonus ?? 0
  delete state.droppedItems![itemId]
  purgeWorldFacts(fact => fact.subjectItemId === itemId)
  return dropped.item
}

export function stabilizePlayer(): PlayerState {
  assertBreathingRecoveryAllowed('player')
  const player = state.player
  if(player.hp.current!==0||player.deathSaves?.dead)
    throw new RuleViolation('STABILIZATION_TARGET_INVALID','Only the actual living unstable zero-HP player can become newly stable.',{entityId:'player'})
  if(player.deathSaves?.stable)return player
  clearBlockedBreathingStabilization('player')
  closePlayerDyingLife('stable')
  player.deathSaves = { successes: 0, failures: 0, stable: true }
  player.hp.current = 0
  enterUnconscious('player')
  beginPlayerStableRecovery()
  return player
}

/** Source-specific forced zero: no damage, temporary-HP absorption, Ward or fabricated save failure. */
export function dropForSuffocation(event:BreathingCollapseEvent):void {
  if(event.entityId==='player'){
    const player=state.player,before=player.hp.current
    if(player.deathSaves?.dead)throw new RuleViolation('ENTITY_DEAD','A breathing collapse cannot restart a corpse.',{entityId:'player'})
    const alreadyDying=before===0&&!player.deathSaves?.stable
    closePlayerStableRecovery('source_collapse')
    player.hp.current=0
    if(!alreadyDying)player.deathSaves={successes:0,failures:0}
    else player.deathSaves??={successes:0,failures:0}
    enterUnconscious('player');heroAfterHPChange('player',before,0)
    const concentration=state.hero?.concentrationIds.player
    if(concentration)removeHeroEffect(concentration)
    startSuffocationPlayerDying(event,{skipCurrentTurn:!alreadyDying})
  } else dropNpcForSuffocation(event)
  addLogEntry({round:state.round,turn:'system',action:'Effondrement par suffocation',mechanicalDetail:JSON.stringify({...event,hpAfter:0,damageDealt:0})})
}

/** Actual air removes the specific lock before this exact observed third success resolves. */
export function stabilizeAfterBreathingAir(marker:BreathingBlockedStabilization):void {
  if(marker.entityId==='player'){
    const saves=state.player.deathSaves
    if(state.player.hp.current!==0||!saves||saves.dead||saves.stable||saves.successes!==3||saves.failures>=3)
      throw new RuleViolation('BREATHING_STABILIZATION_WITNESS_REQUIRED','The actual player life episode no longer has its three blocked successes.',{entityId:'player'})
    stabilizePlayer()
  } else {
    const monster=persistedNpc(marker.entityId)?.monster,episode=monster?.npcLife?.episode
    if(!monster||!isDyingNpc(monster)||episode?.id!==marker.lifeEpisodeId||episode.successes!==3||episode.failures>=3
      ||JSON.stringify(episode.breathingBlockedStabilization)!==JSON.stringify(marker))
      throw new RuleViolation('BREATHING_STABILIZATION_WITNESS_REQUIRED','The actual NPC life episode no longer matches its three blocked successes.',{entityId:marker.entityId})
    stabilizeNpc(monster)
  }
}

export function rollPlayerDeathSave(roll: number, bonus=0, eventId?:string): {
  roll: number
  success: boolean
  criticalSuccess: boolean
  criticalFailure: boolean
  successes: number
  failures: number
  stable: boolean
  dead: boolean
  hpAfter: number
  recoveryBlocked: boolean
  afflictionHealingBlocked: boolean
  hitPointRecoveryBlocked: boolean
} {
  const player = state.player
  const recoveryBlocked=breathingRecoveryBlocked('player')
  const afflictionHealingBlocked=afflictionHealingLimit('player',1)<1
  const hitPointRecoveryBlocked=recoveryBlocked||afflictionHealingBlocked
  player.deathSaves ??= { successes: 0, failures: 0 }

  if (player.hp.current > 0) {
    player.deathSaves = { successes: 0, failures: 0 }
  } else if (roll === 20&&!hitPointRecoveryBlocked) {
    player.hp.current = 1
    player.deathSaves = { successes: 0, failures: 0 }
    player.conditions = player.conditions.filter(condition => condition !== 'unconscious'
      || state.monsterEffects?.some(effect => effect.targetId === 'player' && effect.conditions.includes('unconscious'))
      || state.hero?.effects.some(effect => effect.targetIds.includes('player') && effect.data.condition === 'unconscious' && effect.expiresAt > (state.worldTimeSeconds ?? 0)))
  } else if (roll === 1) {
    player.deathSaves.failures = Math.min(3, player.deathSaves.failures + 2)
  } else if (roll===20||roll+bonus >= 10) {
    player.deathSaves.successes = Math.min(3, player.deathSaves.successes + 1)
  } else {
    player.deathSaves.failures = Math.min(3, player.deathSaves.failures + 1)
  }

  if (player.hp.current <= 0 && player.deathSaves.successes >= 3&&!recoveryBlocked) {
    stabilizePlayer()
  }
  if (player.hp.current <= 0 && player.deathSaves.failures >= 3) {
    player.deathSaves.dead = true
    recordActualDeath('player')
    advanceHeroTime()
  }

  if (player.hp.current <= 0) enterUnconscious('player')
  if(recoveryBlocked&&player.hp.current===0&&player.deathSaves.successes===3&&!player.deathSaves.dead){
    const breathingEpisode=breathingStateOf(state)!.creatures.player.episode!
    noteBlockedBreathingStabilization({source:'suffocation',entityId:'player',breathingEpisodeId:breathingEpisode.id,
      lifeEpisodeId:playerLifeEpisodeId(state)??breathingEpisode.id,
      eventId:eventId??`player-death:${state.combatGeneration??0}:${state.turnCounter??0}:player`,at:state.worldTimeSeconds??0})
  } else if(player.hp.current>0||player.deathSaves.stable||player.deathSaves.dead){clearBlockedBreathingStabilization('player');closePlayerDyingLife(player.deathSaves.dead?'dead':player.deathSaves.stable?'stable':'healed')}

  return {
    roll,
    success: roll===20||roll!==1&&roll+bonus >= 10,
    criticalSuccess: roll === 20,
    criticalFailure: roll === 1,
    successes: player.deathSaves.successes,
    failures: player.deathSaves.failures,
    stable: Boolean(player.deathSaves.stable),
    dead: Boolean(player.deathSaves.dead),
    hpAfter: player.hp.current,
    recoveryBlocked,
    afflictionHealingBlocked,
    hitPointRecoveryBlocked,
  }
}

export function updateMonsterHP(id: string, delta: number, damageContext?: import('../lib/temporary-hp-state').TemporaryHpDamageContext & {knockout?:KnockoutState}): MonsterState {if(delta!==0){assertImprovisedHazardBodyMutation(id);assertPitHeldBodyMutation(id);assertShoveAsideBodyMutationAllowed(id)};return withCackleConsequences(()=>updateCackleBoundMonsterHP(id,delta,damageContext))}
function updateCackleBoundMonsterHP(id: string, delta: number, damageContext?: import('../lib/temporary-hp-state').TemporaryHpDamageContext & {knockout?:KnockoutState}): MonsterState {
  const grouped = getMonster(id)
  if (delta > 0 && grouped?.group) throw new RuleViolation('NPC_GROUP_HEALING_FORBIDDEN', 'This authored shared-HP group cannot regain hit points or recover lost members through ordinary healing.', { entityId: id })
  if(delta>0)assertBreathingRecoveryAllowed(id)
  const monster = getMonster(id)
  if (!monster) throw new Error(`Monster not found: ${id}`)
  if(!monster.isAlive&&delta>0)throw new RuleViolation('ENTITY_DEAD','Ordinary healing cannot resurrect a dead NPC.',{entityId:id})
  const damageReceived=damageContext?.damageReceived??Math.max(0,-delta)
  assertKnockoutDamageSupported(monster,Math.max(0,-delta,damageContext?.damageReceived??0))
  assertKnockoutHealingSupported(monster,delta)
  delta = heroBeforeHPChange(id, delta, damageContext)
  const previousHp = monster.hp.current
  const preserveUnconscious=hasIndependentUnconscious(state,id,state.worldTimeSeconds??0)
  const unknownUnconscious=previousHp>0&&monster.conditions.includes('unconscious')&&!preserveUnconscious
  const declaration=damageContext?.knockout?{...damageContext.knockout,...(unknownUnconscious?{independentUnconscious:true as const}:{})}:undefined
  monster.hp.current = Math.max(0, Math.min(monster.hp.max, monster.hp.current + delta))
  reconcileNpcGroup(monster)
  const knockedOut = reconcileKnockoutHp(monster,previousHp,declaration,preserveUnconscious)
  if(knockedOut){monster.knockout=startKnockoutRecovery(monster.knockout!);enterUnconscious(id)}
  reconcileNpcHpChange(monster,previousHp,damageReceived,Math.max(0,-delta),damageContext?.critical,knockedOut,unknownUnconscious)
  clearCaltropsOnActualHealing(state,id,previousHp,monster.hp.current)
  if(monster.isAlive&&monster.hp.current===0)enterUnconscious(id)
  reconcileSwallowDeaths()
  heroAfterHPChange(id, previousHp, delta)
  return monster
}

export function syncSwallowProjections(sourceId:string){const host=getEntity(sourceId);if(host)for(const e of swallowedEpisodes(state,sourceId))assignTokenPosition(e.targetId,host.position.x,host.position.y)}
function assignTokenPosition(tokenId: string, x: number, y: number): void {
  const falling=activeXgeFall(state,tokenId);if(falling&&(x!==falling.initialPoint.x||y!==falling.initialPoint.y))throw new RuleViolation('XGE_FALL_POSITION_OWNED','The actual source fall owns this vertical column; no unrelated XY movement rewrites its cursor.',{})
  if (tokenId === 'player') {
    state.player.position = { x, y }
    syncPlayerRoomFromPosition()
  } else if (state.npcs?.[tokenId] && !state.monsters[tokenId]) {
    const npc = state.npcs[tokenId]
    npc.position = { x, y }
    npc.roomId = inferRoomIdOnMap(npc.position, npc.mapId, state)
  } else {
    const monster = state.monsters[tokenId]
    if (!monster) throw new Error(`Token not found: ${tokenId}`)
    monster.position = { x, y }
    syncSwallowProjections(tokenId)
    if (state.npcs?.[tokenId]&&(monster.controller === 'reactive_npc'||state.npcs[tokenId].partyHistory?.length)) {
      state.npcs[tokenId].position = { x, y }
      state.npcs[tokenId].roomId = inferRoomIdOnMap({ x, y }, state.currentMapId, state)
    }
  }
}

export function moveToken(tokenId: string, x: number, y: number, physicalOptions?:{voluntaryFootstep?:boolean;airborneJump?:boolean;airborneFlight?:boolean;slipperyIceWalk?:boolean;shoveAsideId?:string;groundContactKind?:'walk'|'forced'|'landing'|'teleport'}): void {
  if(getEntity(tokenId)?.position.x!==x||getEntity(tokenId)?.position.y!==y){assertImprovisedHazardBodyMutation(tokenId);assertPitHeldBodyMutation(tokenId);assertShoveAsideBodyMutationAllowed(tokenId)}
  if(swallowedBy(state,tokenId))throw new RuleViolation('SWALLOW_EXPLICIT_EXIT_REQUIRED','A contained body cannot occupy an exterior movement destination; resolve its actual source exit.',{})
  const contactKind:GroundGearMovementKind=physicalOptions?.groundContactKind??(physicalOptions?.voluntaryFootstep?'walk':'forced'),stepWitness=prepareGroundGearStep(state,tokenId,contactKind,physicalOptions?.slipperyIceWalk,physicalOptions?.shoveAsideId?{attemptId:physicalOptions.shoveAsideId}:undefined)
  if(pendingGroundGearContacts(state).length)throw new RuleViolation('GROUND_GEAR_CONTACT_DUE','Resolve the actual pending physical contact before another displacement.',{})
  const projection=physicalOptions?.airborneJump||physicalOptions?.airborneFlight?undefined:projectActualGroundMovement(state,tokenId,{x,y})
  if(projection?.issue)throw new RuleViolation(projection.issue.code,projection.issue.message,{})
  if(projection){const issue=oilGroundContactIssue(projection.state,tokenId)??groundGearMovementIssue(projection.state,tokenId,contactKind,stepWitness);if(issue)throw new RuleViolation(issue.code,issue.message,{})}
  if(tokenId==='player'&&!physicalOptions?.voluntaryFootstep)clearActualFootwork()
  assignTokenPosition(tokenId, x, y)
  if(physicalOptions?.airborneFlight)noteWeatherFlightMovement(tokenId,'fly')
  if(projection&&state.dmTools?.jumping){const support=projection.state.dmTools?.jumping?.supports[tokenId];if(support)state.dmTools.jumping.supports[tokenId]=support;else delete state.dmTools.jumping.supports[tokenId]}
  reconcileMonsterEffects()
  advanceHeroTime() // A forced move/teleport immediately ends a grapple outside its source reach.
  reconcilePhysicalHandling()
  if(!physicalOptions?.airborneJump){onOilGroundContact(tokenId);recordGroundGearContact(tokenId,contactKind,physicalOptions?.airborneFlight?undefined:stepWitness)}
}

/** Commit only the exact paid point of an existing climbing/swimming route.
 * This source movement owns its vertical position; ordinary XY movement cannot
 * manufacture its grip, water surface or a ground arrival. */
/** Commit only the next paid point of an explicitly chosen native route. */
function commitNativeFlightFraction(id:string,eventId:string,fraction:number,landingSurfaceId?:string){
 const move=state.dmTools?.nativeFlight?.moves[eventId],fromPoint=move?.input.path[move.cursor],toPoint=move?.input.path[(move?.cursor??0)+1]
 const prior=move?.partial?.fraction??0
 if(!move||move.status!=='moving'||move.input.entityId!==id||!fromPoint||!toPoint||!Number.isFinite(fraction)||fraction<=prior||fraction>1
  ||fraction<1&&(fromPoint.x!==toPoint.x||fromPoint.y!==toPoint.y)||landingSurfaceId&&fraction!==1)
  throw new RuleViolation('NATIVE_FLIGHT_COMMIT_CONTEXT_REQUIRED','Retain the exact next original selected segment and its strictly increasing representable paid fraction.',{})
 const point=fraction===1?toPoint:{x:fromPoint.x,y:fromPoint.y,zFeet:fromPoint.zFeet+(toPoint.zFeet-fromPoint.zFeet)*fraction}
 const vertical=entityVerticalContext(state,id),datum=actualNativeFlightLocation(state,id)?.datumZFeet??vertical.supportZFeet??vertical.zFeet!
 const actualPoint=move.partial?.point??fromPoint,body=getPhysicalCreature(id)
 if(!body||body.position.x!==actualPoint.x||body.position.y!==actualPoint.y||!vertical.known||Math.abs(vertical.zFeet!-actualPoint.zFeet)>1e-7)
  throw new RuleViolation('NATIVE_FLIGHT_COMMIT_CONTEXT_REQUIRED','The same actual source body must still occupy its last committed original route point or exact partial point.',{})
 const kind:GroundGearMovementKind=landingSurfaceId?'landing':'forced',from=prepareGroundGearStep(state,id,kind)
 const projection=projectNativeFlightPoint(state,id,point,eventId,datum,landingSurfaceId)
 if(projection.issue)throw new RuleViolation(projection.issue.code,projection.issue.message,{})
 const issue=oilGroundContactIssue(projection.state!,id)??groundGearMovementIssue(projection.state!,id,kind,from);if(issue)throw new RuleViolation(issue.code,issue.message,{})
 const costFeet=move.stepFeet[move.cursor]*(fraction-prior)
 clearActualFootwork(id);assignTokenPosition(id,point.x,point.y)
 state.dmTools!.nativeFlight!.locations[id]=projection.state!.dmTools!.nativeFlight!.locations[id]
 const actual=state.dmTools!.jumping!,support=projection.state!.dmTools!.jumping?.supports[id];if(support)actual.supports[id]=support;else delete actual.supports[id]
 move.spentFeet+=costFeet
 if(fraction===1){move.cursor++;delete move.partial}else move.partial={fraction,point:{...point}}
 if(state.phase==='combat')addMovementUsed(id,costFeet/5)
 reconcileMonsterEffects();advanceHeroTime();reconcilePhysicalHandling();onOilGroundContact(id);recordGroundGearContact(id,kind,from)
 return{costFeet,point:{...point}}
}
export function commitNativeFlightDisplacement(id:string,point:import('../lib/native-flight-state').NativeFlightPoint,eventId:string,landingSurfaceId?:string){
 const move=state.dmTools?.nativeFlight?.moves[eventId],next=move?.input.path[(move?.cursor??0)+1]
 if(!next||JSON.stringify(next)!==JSON.stringify(point))throw new RuleViolation('NATIVE_FLIGHT_COMMIT_CONTEXT_REQUIRED','Retain the exact original next waypoint.',{})
 return commitNativeFlightFraction(id,eventId,1,landingSurfaceId)
}
export function commitNativeFlightPartialDisplacement(id:string,eventId:string,fraction:number){return commitNativeFlightFraction(id,eventId,fraction)}
/** Commit only the original exact XGE source landing. No chosen XY move or active targeting. */
export function commitXgeFallLanding(id:string,surfaceId:string,eventId:string){
 const e=state.dmTools?.xgeFalling?.episodes[eventId],surface=state.dmTools?.jumping?.surfaces[surfaceId]
 if(!e||e.input.entityId!==id||e.input.landingSurfaceId!==surfaceId||!surface||surface.elevationFeet!==xgeFallPoint(e).zFeet)throw new RuleViolation('XGE_FALL_LANDING_CONTEXT_CHANGED','Keep the exact actual source descent and selected measured support.',{})
 const j=state.dmTools!.jumping!;delete state.dmTools?.nativeFlight?.locations[id];if(j.locomotion)delete j.locomotion.locations[id];j.supports[id]={entityId:id,mapId:state.currentMapId!,surfaceId,elevationFeet:surface.elevationFeet,observedAt:state.worldTimeSeconds??0,source:'Actual completed source XGE descent, no new surface or movement.',revision:(j.supports[id]?.revision??0)+1};delete state.dmTools!.xgeFalling!.active[id];reconcileMonsterEffects();advanceHeroTime();reconcilePhysicalHandling()
}

/** Final physical arrival of the one already established sameXY source fall. */
export function commitNativeFlightFallLanding(id:string,surfaceId:string,eventId:string){
 const fall=state.dmTools?.nativeFlight?.falls[eventId],locationBefore=actualNativeFlightLocation(state,id),projection=fall?projectNativeFlightPoint(state,id,fall.point,eventId,fall.point.zFeet,surfaceId):undefined
 if(!fall||fall.entityId!==id||fall.landingSurfaceId!==surfaceId||projection?.issue||!projection||fall.locationWitness!==JSON.stringify(locationBefore))throw new RuleViolation('NATIVE_FLIGHT_FALL_CONTEXT_CHANGED','Keep the exact original falling body and selected actual lower support.',{})
 const location=projection.state!.dmTools!.nativeFlight!.locations[id];location.sourceEventId=eventId;location.sourceKind='fall';state.dmTools!.nativeFlight!.locations[id]=location
 state.dmTools!.jumping!.supports[id]=projection.state!.dmTools!.jumping!.supports[id]
 reconcileMonsterEffects();advanceHeroTime();reconcilePhysicalHandling()
}

export function commitLocomotionDisplacement(id:string,point:LocomotionPoint,mediumId:string,eventId:string,landingSurfaceId?:string){
 const move=state.dmTools?.jumping?.locomotion?.moves[eventId],nextPoint=move?.input.path[(move?.cursor??0)+1]
 if(!move||move.status!=='moving'||move.input.entityId!==id||move.input.mediumId!==mediumId||!nextPoint||JSON.stringify(nextPoint)!==JSON.stringify(point))throw new RuleViolation('LOCOMOTION_COMMIT_CONTEXT_REQUIRED','Only the next exact physical point of the same real movement may commit.',{})
 const kind:GroundGearMovementKind=landingSurfaceId?'landing':'forced',from=prepareGroundGearStep(state,id,kind),projection=projectLocomotionStep(state,id,mediumId,point,landingSurfaceId)
 if(projection.issue)throw new RuleViolation(projection.issue.code,projection.issue.message,{})
 const issue=oilGroundContactIssue(projection.state,id)??groundGearMovementIssue(projection.state,id,kind,from);if(issue)throw new RuleViolation(issue.code,issue.message,{})
 clearActualFootwork(id);assignTokenPosition(id,point.x,point.y)
 const actual=state.dmTools!.jumping!,planned=projection.state.dmTools!.jumping!
 if(planned.locomotion!.locations[id])actual.locomotion!.locations[id]={...planned.locomotion!.locations[id],sourceEventId:eventId};else delete actual.locomotion!.locations[id]
 if(planned.supports[id])actual.supports[id]=planned.supports[id];else delete actual.supports[id]
 reconcileMonsterEffects();advanceHeroTime();reconcilePhysicalHandling()
 onOilGroundContact(id);recordGroundGearContact(id,kind,from)
}

type PhysicalStep={id:string;cell:{x:number;y:number};kind?:GroundGearMovementKind;from?:GroundGearStepWitness;slipperyIceWalk?:boolean}
function preparePhysicalGroundCommits(moves:readonly PhysicalStep[],mapId=state.currentMapId,sourceState=state){
  let projected=sourceState
  for(const move of moves){const next=projectActualGroundMovement(projected,move.id,move.cell,mapId);if(next.issue)throw new RuleViolation(next.issue.code,next.issue.message,{});projected=next.state}
  const oilForecasts=moves.map(move=>forecastOilGroundContact(projected,move.id));for(const forecast of oilForecasts)if(forecast.issue)throw new RuleViolation(forecast.issue.code,forecast.issue.message,{})
  const newOilKeys=new Set(oilForecasts.filter(forecast=>forecast.damageNeeded).map(forecast=>forecast.key));if(Object.keys(projected.dmTools?.oil?.damageTurns??{}).length+newOilKeys.size>512)throw new RuleViolation('OIL_DAMAGE_TURN_LIMIT','This complete real displacement requires more retained oil damage keys than remain; no body, damage, die or cost has committed.',{})
  const issue=groundGearMovementGroupIssue(projected,moves.map(move=>({entityId:move.id,kind:move.kind??'forced',from:move.from??prepareGroundGearStep(sourceState,move.id,move.kind??'forced',move.slipperyIceWalk)})))
  if(issue)throw new RuleViolation(issue.code,issue.message,{})
  return projected
}
/** Pure exact source path preflight, before its original action and dice. */
export function assertGroundMovementPath(entityId:string,path:readonly{x:number;y:number}[],kind:GroundGearMovementKind='forced',slipperyIceShoveAside=false){
 let projected=state
 for(const cell of path){const from=prepareGroundGearStep(projected,entityId,kind,false,slipperyIceShoveAside?{}:undefined),next=projectActualGroundMovement(projected,entityId,cell);if(next.issue)throw new RuleViolation(next.issue.code,next.issue.message,{});const issue=oilGroundContactIssue(next.state,entityId)??groundGearMovementIssue(next.state,entityId,kind,from);if(issue)throw new RuleViolation(issue.code,issue.message,{});projected=next.state}
 return projected
}
/** One actual simultaneous displacement (e.g. chosen teleport companions), no
 * action or target selection. The source caller validates its spell/power first. */
export function assertPhysicalDisplacementsInState(sourceState:GameState,moves:readonly PhysicalStep[]){
 if(!moves.length||new Set(moves.map(move=>move.id)).size!==moves.length)throw new RuleViolation('PHYSICAL_DISPLACEMENT_SELECTION_REQUIRED','Choose distinct actual bodies and their explicit cells.',{})
 for(const move of moves){const body=move.id==='player'?sourceState.player:sourceState.monsters[move.id]??sourceState.npcs?.[move.id];if(!body||'mapId'in body&&body.mapId&&body.mapId!==sourceState.currentMapId)throw new RuleViolation('ENTITY_NOT_FOUND','A displacement never activates an archive or invents a body.',{})}
 return preparePhysicalGroundCommits(moves,sourceState.currentMapId,sourceState)
}
export function assertPhysicalDisplacements(moves:readonly{id:string;cell:{x:number;y:number};kind:GroundGearMovementKind}[],contextState=state){return assertPhysicalDisplacementsInState(contextState,moves)}
export function commitPhysicalDisplacements(moves:readonly{id:string;cell:{x:number;y:number};kind:GroundGearMovementKind}[]){
 const from=moves.map(move=>prepareGroundGearStep(state,move.id,move.kind)),projected=assertPhysicalDisplacements(moves)
 for(const move of moves){clearActualFootwork(move.id);assignTokenPosition(move.id,move.cell.x,move.cell.y);commitPhysicalGroundSupport(projected,move.id)}
 reconcileMonsterEffects();advanceHeroTime();reconcilePhysicalHandling()
 const contactIds:string[]=[]
 for(const[index,move]of moves.entries()){onOilGroundContact(move.id);const contact=recordGroundGearContact(move.id,move.kind,from[index]);if(contact)contactIds.push(contact.id)}
 return{groundGearContactIds:contactIds,positions:moves.map(move=>({entityId:move.id,cell:{...move.cell}}))}
}
/** Party transfer preflight reuses the actual physical source and all arrival contacts.
 * This does not select companions or destination cells, and never mutates a body. */
export function prepareNpcPartyPhysicalArrival(moves:readonly{id:string;cell:{x:number;y:number};kind:'arrival'}[],toMapId:string){
 const from=moves.map(m=>prepareGroundGearStep(state,m.id,'arrival'))
 const projected=preparePhysicalGroundCommits(moves,toMapId)
 return{projected,from,moves}
}
export function commitNpcPartyPhysicalArrival(plan:ReturnType<typeof prepareNpcPartyPhysicalArrival>){
 for(const m of plan.moves)commitPhysicalGroundSupport(plan.projected,m.id)
 reconcileMonsterEffects();reconcileHeroAfterPhysicalArrival();reconcilePhysicalHandling()
 for(const[index,m]of plan.moves.entries()){onOilGroundContact(m.id);recordGroundGearContact(m.id,'arrival',plan.from[index])}
}
function commitPhysicalGroundSupport(projected:GameState,id:string){if(!state.dmTools?.jumping)return;const support=projected.dmTools?.jumping?.supports[id];if(support)state.dmTools.jumping.supports[id]=support;else delete state.dmTools.jumping.supports[id]}

/** Internal paired step: callers validate BOTH paths before committing either
 * body. Reconcile only the final configuration, never an intermediate reach. */
export function moveGrappledPair(actorId: string, actorCell: {x:number;y:number}, targetId: string, targetCell: {x:number;y:number},voluntaryFootstep=false): void {
  if(actorId===targetId||!getEntity(actorId)||!getEntity(targetId))throw new RuleViolation('GRAPPLE_TRANSPORT_TARGET_REQUIRED','Both paired actors must still exist.',{})
  const actorKind:GroundGearMovementKind=voluntaryFootstep?'walk':'forced',actorWitness=prepareGroundGearStep(state,actorId,actorKind),targetWitness=prepareGroundGearStep(state,targetId,'forced')
  const physical=preparePhysicalGroundCommits([{id:actorId,cell:actorCell,kind:actorKind,from:actorWitness},{id:targetId,cell:targetCell,kind:'forced',from:targetWitness}])
  if(!voluntaryFootstep)clearActualFootwork(actorId);clearActualFootwork(targetId)
  assignTokenPosition(targetId, targetCell.x, targetCell.y)
  assignTokenPosition(actorId, actorCell.x, actorCell.y)
  commitPhysicalGroundSupport(physical,actorId);commitPhysicalGroundSupport(physical,targetId)
  reconcileMonsterEffects()
  advanceHeroTime()
  reconcilePhysicalHandling()
  onOilGroundContact(actorId);onOilGroundContact(targetId)
  recordGroundGearContact(actorId,actorKind,actorWitness);recordGroundGearContact(targetId,'forced',targetWitness)
}

/** Internal physical commit: no target action/activation, HP or life transition.
 * The planner validates the two paths and the entire payload footprint first. */
export function movePhysicalLoadPair(loadId:string,actorId:string,actorCell:{x:number;y:number},targetId:string,targetCell:{x:number;y:number},voluntaryFootstep=false):void {
  const load=currentPhysicalLoad(loadId)
  if(actorId!=='player'||load.actorId!==actorId||load.targetId!==targetId||load.mapId!==state.currentMapId||state.player.hp.current<=0)
    throw new RuleViolation('PHYSICAL_LOAD_SELECTION_CONFLICT','The actual held pair and map must still agree before committing either position.',{})
  const actorKind:GroundGearMovementKind=voluntaryFootstep?'walk':'forced',actorWitness=prepareGroundGearStep(state,actorId,actorKind),targetWitness=load.targetKind==='creature'?prepareGroundGearStep(state,targetId,'forced'):undefined
  const physical=preparePhysicalGroundCommits([{id:actorId,cell:actorCell,kind:actorKind,from:actorWitness},...(load.targetKind==='creature'?[{id:targetId,cell:targetCell,kind:'forced' as const,from:targetWitness}]:[])])
  if(!voluntaryFootstep)clearActualFootwork(actorId);if(load.targetKind==='creature')clearActualFootwork(targetId)
  if(load.targetKind==='creature'){
    if(!state.monsters[targetId])throw new RuleViolation('PHYSICAL_LOAD_TARGET_REQUIRED','Only an actual active modeled body can be moved; no archive is activated.',{})
    assignTokenPosition(targetId,targetCell.x,targetCell.y)
  }else{
    const object=state.dmTools?.objects[targetId],roomId=inferRoomIdOnMap(targetCell,state.currentMapId,state)
    if(!object||object.mapId!==state.currentMapId||object.state==='destroyed'||!roomId)throw new RuleViolation('PHYSICAL_OBJECT_ROOM_REQUIRED','The intact actual object needs an existing room anchor on this map.',{})
    const contents=[...Object.values(state.dmTools?.treasures??{}),...Object.values(state.dmTools?.hoards??{})].filter(value=>value.containerId===targetId&&!value.collected)
    const traps=Object.values(state.dmTools?.traps??{}).filter(value=>value.objectId===targetId)
    if([...contents,...traps].some(value=>value.mapId!==object.mapId||value.cell.x!==object.cell.x||value.cell.y!==object.cell.y))
      throw new RuleViolation('PHYSICAL_ATTACHMENT_STATE_MISMATCH','Actual container attachments must agree with their source position; none is teleported from another location.',{})
    object.cell={...targetCell};object.roomId=roomId
    for(const value of [...contents,...traps]){value.cell={...targetCell};value.roomId=roomId}
  }
  assignTokenPosition(actorId,actorCell.x,actorCell.y)
  load.lastActorCell={...actorCell};load.lastTargetCell={...targetCell}
  commitPhysicalGroundSupport(physical,actorId);if(load.targetKind==='creature')commitPhysicalGroundSupport(physical,targetId)
  reconcileMonsterEffects();advanceHeroTime();reconcilePhysicalHandling()
  onOilGroundContact(actorId);if(load.targetKind==='creature')onOilGroundContact(targetId)
  recordGroundGearContact(actorId,actorKind,actorWitness);if(load.targetKind==='creature')recordGroundGearContact(targetId,'forced',targetWitness)
}

export function getMovementUsed(entityId: string): number {
  return state.movementUsed[entityId] ?? 0
}

export function addMovementUsed(entityId: string, cells: number): number {
  state.movementUsed[entityId] = getMovementUsed(entityId) + cells
  return state.movementUsed[entityId]
}

export function resetMovement(entityId: string): void {
  delete state.movementUsed[entityId]
  if (state.diagonalMovementUsed) delete state.diagonalMovementUsed[entityId]
}

export function hasActionUsed(entityId: string): boolean {
  return Boolean(state.actionUsed[entityId])
}

export function markActionUsed(entityId: string): void {
  state.actionUsed[entityId] = true
}

export function resetActionUsed(entityId: string): void {
  delete state.actionUsed[entityId]
}

// ── Économie d'action bonus (second souffle) ─────────────────────────────────
export function hasBonusActionUsed(entityId: string): boolean {
  return Boolean(state.bonusActionUsed?.[entityId])
}

export function markBonusActionUsed(entityId: string): void {
  state.bonusActionUsed ??= {}
  state.bonusActionUsed[entityId] = true
}

export function resetTurnEconomy(entityId: string): void {
  if(complexTrapSlot(state,entityId)||robePassiveOnlySlot(state,entityId))return
  resetMovement(entityId)
  resetActionUsed(entityId)
  if (state.bonusActionUsed) delete state.bonusActionUsed[entityId]
}

export function spawnMonster(monster: MonsterState): void {
  const npc = state.npcs?.[monster.id]
  state.monsters[monster.id] = isStatBackedNpc(npc)
    ? Object.assign(npc, monster, { hp: npc.hp, conditions: npc.conditions, isAlive: npc.isAlive, group: npc.group, statBlock: npc.statBlock })
    : monster
  initializeSocialPersonalities(state, state.socialProfileSeed ?? randomUUID())
}

export function removeMonster(id: string): void {
  if(activeXgeFall(state,id))throw new RuleViolation('XGE_FALL_BODY_REQUIRED','Keep the actual ongoing falling body until its physical landing or real source recovery; removal cannot erase its timeline.',{})
  if(swallowedBy(state,id)||swallowedEpisodes(state,id).length)throw new RuleViolation('SWALLOW_BODY_REQUIRED','Keep the actual host and contained bodies until their explicit physical exits are resolved.',{})
  const monster = state.monsters[id],swallow=state.dmTools?.swallow
  const retainedSwallowBody=Boolean(swallow?.sizes[id]
    ||Object.values(swallow?.episodes??{}).some(episode=>episode.sourceId===id||episode.targetId===id)
    ||Object.values(swallow?.bites??{}).some(hit=>hit.context.sourceId===id||hit.context.targetId===id))
  if (monster && !isEnrolledNonhostileNpcCombatant(state,id) && (state.dmTools?.exhaustion?.creatures[id]||retainedSwallowBody||naturalSleepEpisode(state,id))) {
    state.sceneMemory ??= {}
    const retired = (state.sceneMemory.retiredMonsters ?? {}) as Record<string, MonsterState>
    state.sceneMemory.retiredMonsters = { ...retired, [id]: structuredClone(monster) }
  }
  removeSurpriseActor(id)
  delete state.monsters[id]
}

function assertShoveAsideBodyMutationAllowed(id:string){if(chargedHeldBodyLocked(state,id))throw new RuleViolation('ROBE_SAVE_PENDING','Resolve the exact original robe save before changing a participating physical body.',{});if(cleavingHeldBodyMutationBlocked(state,id))throw new RuleViolation('CLEAVING_ATTACK_PENDING','Resolve the exact held original cleaving attack before changing either body.',{});if(tumbleCheckBodyLocked(state,id))throw new RuleViolation('TUMBLE_CONTEST_PENDING','Resolve the exact retained Tumble check before changing either participating body.',{});if(overrunCheckBodyLocked(state,id))throw new RuleViolation('OVERRUN_CONTEST_PENDING','Resolve the exact retained Overrun check before changing either participating body.',{});if(shoveAsideHeldBodyMutationBlocked(state,id))throw new RuleViolation('SHOVE_ASIDE_CONTEST_PENDING','Resolve the exact retained optional contest before changing either participating body.',{})}
export function applyCondition(entityId: string, condition: Condition, options: { deferReconcile?: boolean } = {}) {
  assertImprovisedHazardBodyMutation(entityId);assertPitHeldBodyMutation(entityId)
  if(!getEntity(entityId)?.conditions.includes(condition))assertShoveAsideBodyMutationAllowed(entityId)
  const entity = getEntity(entityId)
  if (!entity) throw new Error(`Entity not found: ${entityId}`)
  if (conditionImmune(entity, condition)) return { applied: false, immune: true, entityId, condition }
  if (condition === 'petrified' && !entity.conditions.includes(condition)) {
    assertPetrifiedAfflictionsTransition(entityId)
    assertPetrifiedSpriteTransition(entityId)
  }
  if(entityId==='player'&&['prone','unconscious','incapacitated','paralyzed','petrified','stunned','grappled','restrained'].includes(condition))clearActualFootwork()
  const wasConditioned=entity.conditions.includes(condition)
  if (condition === 'unconscious') enterUnconscious(entityId)
  else if (!entity.conditions.includes(condition)) {
    entity.conditions.push(condition)
  }
  if (condition === 'petrified') {
    suspendPetrifiedAfflictions(entityId)
    suspendPetrifiedSpriteEffects(entityId)
  }
  if (!options.deferReconcile) advanceHeroTime()
  if (['incapacitated', 'paralyzed', 'petrified', 'stunned', 'unconscious'].includes(condition)){reconcileMonsterEffects();reconcilePhysicalHandling()}
  if(condition==='frightened'&&!wasConditioned)stageCackleStress(entityId,{kind:'actual-frightened',at:state.worldTimeSeconds??0})
  if(entityId==='player')reconcileCleavingActorLife(state)
  return { applied: true, immune: false, entityId, condition }
}

export function removeCondition(entityId: string, condition: Condition, endedAt = state.worldTimeSeconds ?? 0): void {
  assertImprovisedHazardBodyMutation(entityId);assertPitHeldBodyMutation(entityId)
  if(getEntity(entityId)?.conditions.includes(condition))assertShoveAsideBodyMutationAllowed(entityId)
  const entity = getEntity(entityId)
  if (!entity) throw new Error(`Entity not found: ${entityId}`)
  const containment=swallowedBy(state,entityId);if(containment&&state.monsterEffects?.some(e=>e.kind==='purple-worm-swallow'&&e.targetId===entityId&&e.conditions.includes(condition)))throw new RuleViolation('SWALLOW_PHYSICAL_RELEASE_REQUIRED','Resolve the actual source interior or corpse exit; a bare condition removal does not open the worm.',{})
  const resume = condition === 'petrified' && entity.conditions.includes(condition)
  if (resume) {
    assertPetrifiedAfflictionsTransition(entityId, endedAt)
    assertPetrifiedSpriteTransition(entityId, endedAt)
  }
  entity.conditions = entity.conditions.filter(c => c !== condition)
  for (const effect of [...state.monsterEffects ?? []]) {
    if (effect.targetId === entityId && effect.conditions.includes(condition)) endEffect(effect.id)
  }
  if (resume) {
    resumePetrifiedAfflictions(entityId, endedAt)
    resumePetrifiedSpriteEffects(entityId, endedAt)
    reconcileAfflictions()
  }
  if(condition==='grappled')reconcilePhysicalHandling()
}

export function setPhase(phase: GameState['phase']): void {
  const robe=phase!=='combat'?robeCombatExitIssue(state):null;if(robe)throw new RuleViolation(robe.code,robe.message,{})
  const weatherRound=state.dmTools?.weather?.pendingCombatRound
  if(phase!=='combat'&&weatherRound){
    if(!weatherRound.awaitingCombatClosure||!weatherRoundPauseValid(state))throw new RuleViolation('WEATHER_ROUND_CONTINUATION_DUE','Resolve the actual environmental round event before leaving combat.',{})
    delete state.dmTools!.weather!.pendingCombatRound
  }
  if(phase==='combat'&&state.phase!=='combat')interruptAmmunitionSearches(state,'combat_started')
  if (phase !== 'combat') clearCombatSurprise()
  state.phase = phase
}

export interface InitiativeOptions { tieOrder?: string[] }
export interface InitiativeResult {
  id: string
  initiative: number
  roll: string
  groupIds?: string[]
  sharedRollWith?: string
}

/** Pure preflight for an already materialized roster, before entering combat. */
export function validateInitiativeInput(combatants: string[], options: InitiativeOptions = {}): void {
  if (!combatants.length || new Set(combatants).size !== combatants.length || combatants.some(id => !getEntity(id)))
    throw new RuleViolation('INITIATIVE_ROSTER_INVALID', 'Initiative requires unique existing participants.', {})
  if (options.tieOrder && (new Set(options.tieOrder).size !== options.tieOrder.length || options.tieOrder.some(id => !combatants.includes(id))))
    throw new RuleViolation('INITIATIVE_TIE_ORDER_INVALID', 'Tie priority must contain only unique IDs from the explicit combatant roster.', {})
  for (const id of combatants) if (getEntity(id)?.conditions.includes('exhaustion') && !state.dmTools?.exhaustion?.creatures[id])
    throw new RuleViolation('EXHAUSTION_LEVEL_REQUIRED','An explicit authoritative exhaustion level is required before initiative rolls.',{targetId:id})
}

// Rolled once at entry. Grouping resolves only the explicitly supplied roster;
// supplied tie priority (or combatants order) is the MJ's declared adjudication.
export function rollInitiatives(combatants: string[], options: InitiativeOptions = {}): InitiativeResult[] {
  validateInitiativeInput(combatants, options)
  const priority = [...options.tieOrder ?? [], ...combatants.filter(id => !options.tieOrder?.includes(id))]
  const rank = (id: string) => priority.indexOf(id)
  const groups: Array<{ ids: string[]; modifier: number; advantage: boolean; disadvantage: boolean }> = []
  const identical = new Map<string, typeof groups[number]>()
  for (const id of combatants) {
    const entity = getEntity(id)!
    const proficiency = id === 'player' && state.player.features?.includes('remarkable_athlete')
      ? Math.ceil(state.player.proficiencyBonus / 2)
      : id === 'player' && state.player.features?.includes('jack_of_all_trades')
        ? Math.floor(state.player.proficiencyBonus / 2) : 0
    const modifier = getAbilityModifier(entity.stats.dex) + proficiency
    const cursed = curseAbilityDisadvantage(state, id, 'dex')
    const frightened = strictHero() && frightenedByVisibleSource(id)
    const disadvantage = ruleRollDisadvantage(id, 'check', cursed || frightened || strictHero() && entity.conditions.includes('poisoned'), 'dex')
    const advantage = ruleRollAdvantage(id, 'check')
    const monster = id === 'player' ? undefined : state.monsters[id]
    // Individual names, positions and wounds do not change a stat block. Legacy
    // actors without an identified source remain singletons instead of guessing.
    const source = monster ? getMonsterRecord(monster.type) : undefined
    const key = monster?.srd?.ruleset === '2014' && monster.srd.index && source?.source.index === monster.srd.index ? JSON.stringify([
      monster.srd.ruleset, monster.srd.index, monster.type, monster.hostile !== false, monster.controller ?? null,
      ['str', 'dex', 'con', 'int', 'wis', 'cha'].map(ability => monster.stats[ability as keyof typeof monster.stats]),
      monster.hp.max, monster.ac, monster.attackBonus, monster.damageDice, monster.speed,
      monster.attackName ?? null, monster.attackRangeCells ?? null, monster.damageType ?? null,
      monster.movementModes?.walk ?? null, monster.movementModes?.fly ?? null, monster.movementModes?.swim ?? null,
      monster.movementModes?.climb ?? null, monster.movementModes?.burrow ?? null, monster.movementModes?.hover ?? false,
      [...monster.conditions].sort(), state.dmTools?.exhaustion?.creatures[id]?.level ?? 0,
      modifier, advantage, disadvantage, cursed, frightened,
    ]) : undefined
    const existing = key ? identical.get(key) : undefined
    if (existing) existing.ids.push(id)
    else {
      const group = { ids: [id], modifier, advantage, disadvantage }
      groups.push(group)
      if (key) identical.set(key, group)
    }
  }
  const resolved = groups.map(group => {
    const leader = group.ids[0]
    const roll = rollRuleD20(leader, 'check', group.modifier, group.advantage, group.disadvantage, 'dex')
    const members = [...group.ids].sort((a, b) => rank(a) - rank(b))
    const entries = members.map(id => {
      getEntity(id)!.initiative = roll.total
      return { id, initiative: roll.total,
        roll: id === leader ? roll.detail + (members.length > 1 ? ` | Jet de groupe : ${group.ids.join(', ')}` : '')
          : `Jet de groupe partagé avec ${leader} : ${roll.total} ; aucun nouveau jet.`,
        ...(members.length > 1 ? { groupIds: [...group.ids], ...(id === leader ? {} : { sharedRollWith: leader }) } : {}),
      }
    })
    return { initiative: roll.total, priority: Math.min(...members.map(rank)), entries }
  })
  // An identical group acts together. Ties rank the whole group by its first
  // declared member, then rank members within it; no extra tiebreak die exists.
  return resolved.sort((a, b) => b.initiative - a.initiative || a.priority - b.priority).flatMap(group => group.entries)
}

export function setInitiativeOrder(order: string[]): void {
  state.combatGeneration = (state.combatGeneration ?? 0) + 1
  state.initiativeOrder = order
  enrollComplexTrapInitiative(state)
  state.currentTurn = order[0] ?? null
  state.round = 1
  state.movementUsed = {}
  state.diagonalMovementUsed = {}
  state.actionUsed = {}
  state.bonusActionUsed = {}
  state.turnCounter = 0
  state.currentTurn=state.initiativeOrder.find(canTakeInitiativeTurn)??null
  observePlayerDyingCombatEntry()
  startInitiativeSlotTiming()
}

export function canTakeInitiativeTurnInState(candidate:GameState,id:string):boolean {
  if(complexTrapSlot(candidate,id))return Boolean(complexTrapTurnDue(candidate,id))
  if(robeRequiresInitiativeTurn(candidate,id))return true // Actual original source deadline only; no activity right for an incapacitated body.
  if(chaseRequiresInitiativeTurn(candidate,id))return true // Retain only the living body's actual passive dust end-turn, never an action right.
  if(activeXgeFall(candidate,id))return true // Passive source gravity retains its original slot, never an active attack right.
  return id==='player' ? !candidate.player.deathSaves?.dead&&(!candidate.player.deathSaves?.stable||breathingTurnEventDue(id,candidate)||oilRequiresInitiativeTurn(candidate,id)||afflictionRequiresInitiativeTurn(candidate,id))
    : Boolean(candidate.monsters[id]&&(isActiveMonster(candidate.monsters[id])||isDyingNpc(candidate.monsters[id])
      ||breathingTurnEventDue(id,candidate)||candidate.monsters[id].isAlive&&(candidate.dmTools?.weaponConsumables?.burning[id]||oilRequiresInitiativeTurn(candidate,id)||afflictionRequiresInitiativeTurn(candidate,id)||swallowRequiresTurn(candidate,id))))
}
function canTakeInitiativeTurn(id:string):boolean{return canTakeInitiativeTurnInState(state,id)}
function startInitiativeSlotTiming():void{
  if(robePassiveOnlySlot(state,state.currentTurn)){advanceHeroTime();return}
  startMonsterTurn();startHeroTurn(state.currentTurn);startWeaponConsumableTurn(state.currentTurn)
}
/** Empty retained KO slots still cross their real end-of-turn wind boundary. */
export function assertWeatherEndingTurn():void{
  const fireDue=startTurnFireDueIssue(state);if(fireDue)throw new RuleViolation(fireDue.code,fireDue.message,{eventId:fireDue.eventId})
  const gearIssue=groundGearContactDueIssue(state);if(gearIssue)throw new RuleViolation(gearIssue.code,gearIssue.message,{})
  const locomotionIssue=locomotionPhysicalIssue(state);if(locomotionIssue)throw new RuleViolation(locomotionIssue.code,locomotionIssue.message,{})
  const jumpIssue=jumpingDueIssue(state);if(jumpIssue)throw new RuleViolation(jumpIssue.code,jumpIssue.message,{})
  const current=state.currentTurn;if(!current)return
  const oilIssue=oilGroundContactIssue(state,current);if(oilIssue)throw new RuleViolation(oilIssue.code,oilIssue.message,{})
  assertWeatherFlightTurn(current)
  const index=state.initiativeOrder.indexOf(current)
  if(index<0)return
  for(let offset=1;offset<state.initiativeOrder.length;offset++){
    const id=state.initiativeOrder[(index+offset)%state.initiativeOrder.length]
    if(canTakeInitiativeTurn(id)){const fire=startTurnFirePreflightIssue(state,id);if(fire)throw new RuleViolation(fire.code,fire.message,{});break}
    assertWeatherFlightTurn(id)
  }
}

/** Round boundaries retain the encounter's order and numeric initiatives. A KO
 * body keeps its assigned slot and can become eligible again at this boundary. */
function resumeFixedInitiativeRoster(){
  state.currentTurn=state.initiativeOrder.find(canTakeInitiativeTurn)??null
  addLogEntry({ round: state.round, turn: 'system', action: `Ordre d’initiative — round ${state.round}`,
    mechanicalDetail: `Ordre initial conservé : ${state.initiativeOrder.join(' → ')} ; aucun nouveau jet.` })
}

export function advanceTurn(): string | null {const cleaving=cleavingTransitionIssue(state);if(cleaving)throw new RuleViolation(cleaving.code,cleaving.message,{});assertCackleEventsResolved();if(state.currentTurn)assertCackleTurnMayEnd(state.currentTurn);return withCackleConsequences(()=>advanceCackleBoundTurn())}
function advanceCackleBoundTurn():string|null {
  assertSewerPlagueEventResolved()
  const chaseIssue=chaseTurnIssue(state);if(chaseIssue)throw new RuleViolation(chaseIssue.code,chaseIssue.message,chaseIssue)

  const xgeIssue=xgeFallingTurnIssue(state,true);if(xgeIssue)throw new RuleViolation(xgeIssue.code,xgeIssue.message,{eventId:dueXgeFallDescent(state)?.eventId,episodeId:dueXgeFallDescent(state)?.episodeId,entityId:state.currentTurn})
  const sleepIssue=sleepDueIssue(state);if(sleepIssue)throw new RuleViolation(sleepIssue.code,sleepIssue.message,{eventId:sleepIssue.eventId})
  const swallowIssue=swallowTurnIssue(state,true);if(swallowIssue)throw new RuleViolation(swallowIssue.code,swallowIssue.message,{})
  const nativeFall=nativeFlightFallIssue(state);if(nativeFall)throw new RuleViolation(nativeFall.code,nativeFall.message,{entityId:nativeFall.entityId})
  assertWeatherEndingTurn()
  assertWeatherTimeAdvance(6,{combatStep:true})
  assertFrigidWaterTimeAdvance(6, true)
  assertPlayerTurnSaveResolved()
  if(state.currentTurn&&state.currentTurn!=='player')assertNpcTurnDeathSaveResolved(state.currentTurn)
  assertNpcLifeTimeAdvance(6)
  assertBreathingTimeAdvance(6)
  assertSuffocationPlayerTimeAdvance(6)
  assertPlayerRecoveryTimeAdvance(6)
  assertPlayerLifeTimeAdvance(6)
  assertNpcRoundEventRoster(state.round+1)
  assertKnockoutTimeAdvance(6,true)
  assertSurvivalEventsResolved()
  assertSurvivalTimeAdvance(6, { combatStep: true })
  if (state.initiativeOrder.length === 0) return null
  const current = state.currentTurn
  const passiveRobeEnding=Boolean(current&&robePassiveOnlySlot(state,current))
  if(current)onOilGroundContact(current)
  const endingEffectsAllowed=Boolean(current&&(current==='player'||state.monsters[current]?.isAlive))
  if(current&&robePassiveOnlySlot(state,current))finishPassiveRobeSlot(current)
  else if (current&&endingEffectsAllowed) endHeroTurn(current)
  for (const effect of [...state.monsterEffects ?? []]) {
    if (endingEffectsAllowed && effect.targetId === current && effect.repeatSave && effect.dc !== undefined
      && savingThrow(current, effect.repeatSave, effect.dc, effect.kind !== 'horrifying-visage', effect.conditions[0]).success) {
      endEffect(effect.id)
    }
  }
  if (current) expireChaseTurnEffects(state,current)
  if (current) completeSurpriseTurn(current)
  const previousOrder = [...state.initiativeOrder]
  const previousIndex = previousOrder.indexOf(current ?? '')

  if (current&&!passiveRobeEnding) resetTurnEconomy(current)
  state.turnCounter = (state.turnCounter ?? 0) + 1

  // Remove dead monsters from initiative. Keep a dying player in the order:
  // in D&D 5e, an unconscious player still has turns for death saves.
  state.initiativeOrder = state.initiativeOrder.filter(id => {
    if(complexTrapSlot(state,id)||activeXgeFall(state,id)||robeRequiresInitiativeTurn(state,id))return true
    if (id === 'player') return !state.player.deathSaves?.dead
    return state.monsters[id]?.isAlive ?? false
  })

  if (!state.initiativeOrder.some(canTakeInitiativeTurn)) {
    state.currentTurn = null
    return null
  }

  const filteredCurrentIndex = current ? state.initiativeOrder.indexOf(current) : -1
  let nextId: string | undefined

  if (filteredCurrentIndex >= 0) {
    const ordered=[...state.initiativeOrder.slice(filteredCurrentIndex+1),...state.initiativeOrder.slice(0,filteredCurrentIndex+1)]
    nextId = ordered.find(canTakeInitiativeTurn)
  } else {
    const remainingAfterPrevious = previousOrder
      .slice(Math.max(0, previousIndex + 1))
      .find(id => state.initiativeOrder.includes(id)&&canTakeInitiativeTurn(id))
    nextId = remainingAfterPrevious ?? state.initiativeOrder.find(canTakeInitiativeTurn)
  }
  if (!nextId) {
    state.currentTurn = null
    return null
  }

  // Empty KO turns are skipped at their actual preserved initiative positions.
  // Acknowledge only slots traversed now, including the tail before a wrap.
  // No turn effects, costs or reaction budget are generated for these bodies.
  if (previousIndex >= 0) for (let offset = 1; offset <= previousOrder.length; offset++) {
    const skipped = previousOrder[(previousIndex + offset) % previousOrder.length]
    if (skipped === nextId) break
    completeSkippedKnockoutSurpriseTurn(skipped)
  }

  // Increment round when wrapping back to first combatant
  const nextPreviousIndex = previousOrder.indexOf(nextId)
  const newRound =
    previousIndex >= 0 &&
    nextPreviousIndex >= 0 &&
    nextPreviousIndex <= previousIndex &&
    state.initiativeOrder.length > 0
  if (newRound) {
    state.round++
    const startsAt=state.worldTimeSeconds??0,firstWeather=weatherClockExpirations(startsAt+6)[0]
    const frigidAt = nextFrigidWaterSave(state)?.at ?? Infinity
    if(firstWeather || cackleIncubationBoundary(state, startsAt + 6) || sewerPlagueIncubationBoundary(state, startsAt + 6) || frigidAt <= startsAt + 6) return retainEnvironmentalRoundTick(startsAt)
    state.worldTimeSeconds = (state.worldTimeSeconds ?? 0) + 6
    if (state.dmTools?.rechargeCalendar || state.dmTools?.itemRechargeCalendar) reconcileMagicItems()
    reconcileNaturalRecoveryClock()
    if (sewerPlagueEvent(state)?.kind === 'sewer_onset'||cackleDueEvent(state)?.kind==='onset') return retainEnvironmentalRoundTick(startsAt)
    resolveRoundEvents()
  }

  // A round effect can kill the next monster before its turn starts.
  const nextIndex = state.initiativeOrder.indexOf(nextId)
  const rotated = [...state.initiativeOrder.slice(nextIndex), ...state.initiativeOrder.slice(0, nextIndex)]
  state.initiativeOrder = state.initiativeOrder.filter(id => Boolean(complexTrapSlot(state,id))||activeXgeFall(state,id)||robeRequiresInitiativeTurn(state,id)|| (id === 'player'
    ? !state.player.deathSaves?.dead : state.monsters[id]?.isAlive))
  if (newRound && isSurvivalDayDue() && state.dmTools?.survival) {
    state.dmTools.survival.pendingCombatRound = { round: state.round, dayIndex: state.dmTools.survival.day.index, combatGeneration: state.combatGeneration ?? 0, mapId: state.currentMapId ?? firstMapId(state) }
    state.currentTurn = null
    return null // The explicit daily event must precede the new round's first turn.
  }
  if (newRound && state.initiativeOrder.some(canTakeInitiativeTurn)) {
    resumeFixedInitiativeRoster()
  } else {
    state.currentTurn = rotated.find(id => state.initiativeOrder.includes(id)&&canTakeInitiativeTurn(id)) ?? null
  }
  if (state.currentTurn) resetTurnEconomy(state.currentTurn)
  startInitiativeSlotTiming()
  return state.currentTurn
}

function retainEnvironmentalRoundTick(tickStartsAt: number): string | null {
  // The existing ledger owns the single real environmental clock cursor.
  // An illness-only pause supplies no weather context, profile or event.
  ensureWeatherState().pendingCombatRound = {
    round: state.round, generation: state.combatGeneration ?? 0, mapId: state.currentMapId ?? firstMapId(state),
    at: state.worldTimeSeconds ?? tickStartsAt, tickStartsAt, tickEndsAt: tickStartsAt + 6,
    requestedFromTurnCounter: (state.turnCounter ?? 1) - 1, eventIds: [], roundEventsResolved: false,
  }
  state.currentTurn = null
  return continueWeatherRoundTick()
}

/** A saved round can never be transplanted to another combat, floor or day. */
function continueWeatherRoundTick():string|null{
  const weather=state.dmTools!.weather!,pending=weather.pendingCombatRound!
  if(state.phase!=='combat'||state.currentTurn!==null||pending.round!==state.round||pending.generation!==(state.combatGeneration??0)
    ||pending.mapId!==(state.currentMapId??firstMapId(state))||pending.at!==(state.worldTimeSeconds??0))
    throw new RuleViolation('WEATHER_ROUND_CONTINUATION_MISMATCH','The environmental continuation belongs only to its original requested round tick.',{})
  if(pending.awaitingCombatClosure)return null
  const dueCackle=cackleDueEvent(state)
  if(dueCackle?.kind==='onset')pending.cackleFeverAfflictionId=dueCackle.afflictionId
  else delete pending.cackleFeverAfflictionId
  const dueSewerPlague = sewerPlagueEvent(state)
  if (dueSewerPlague?.kind === 'sewer_onset') pending.sewerPlagueAfflictionId = dueSewerPlague.afflictionId
  else delete pending.sewerPlagueAfflictionId
  if (isSurvivalDayDue()) pending.nutritionDayIndex = state.dmTools!.survival!.day.index
  if (dueCackle || dueSewerPlague || dueFrigidWaterSave(state) || weatherDueIssue(state) || isSurvivalDayDue()) return null
  const firstWeather=weatherClockExpirations(pending.tickEndsAt)[0]
  const nutrition=state.dmTools?.survival
  const nutritionAt=nutrition?.status==='active'&&nutrition.day.endsAt>(state.worldTimeSeconds??0)?nutrition.day.endsAt:Infinity
  const sewerPlagueAt = sewerPlagueIncubationBoundary(state, pending.tickEndsAt)?.nextAt ?? Infinity
  const frigidAt = nextFrigidWaterSave(state)?.at ?? Infinity
  const cackleAt=cackleIncubationBoundary(state,pending.tickEndsAt)?.nextAt??Infinity
  const until=Math.min(pending.tickEndsAt,firstWeather?.at??Infinity,nutritionAt,sewerPlagueAt,cackleAt,frigidAt)
  state.worldTimeSeconds=until
  if (state.dmTools?.rechargeCalendar || state.dmTools?.itemRechargeCalendar) reconcileMagicItems()
  reconcileNaturalRecoveryClock()
  pending.at=until
  pending.eventIds=Object.values(weather.events).filter(event=>event.at>=pending.tickStartsAt&&event.at<=until).map(event=>event.eventId)
  if(isSurvivalDayDue())pending.nutritionDayIndex=nutrition!.day.index
  const nextCackle=cackleDueEvent(state)
  if(nextCackle?.kind==='onset')pending.cackleFeverAfflictionId=nextCackle.afflictionId
  const nextSewerPlague = sewerPlagueEvent(state)
  if (nextSewerPlague?.kind === 'sewer_onset') pending.sewerPlagueAfflictionId = nextSewerPlague.afflictionId
  if (nextCackle || nextSewerPlague || dueFrigidWaterSave(state) || weatherDueIssue(state) || isSurvivalDayDue()) return null
  if(until<pending.tickEndsAt)return continueWeatherRoundTick()
  if(!pending.roundEventsResolved){resolveRoundEvents();pending.roundEventsResolved=true}
  state.initiativeOrder=state.initiativeOrder.filter(id=>Boolean(complexTrapSlot(state,id))||activeXgeFall(state,id)||robeRequiresInitiativeTurn(state,id)||(id==='player'?!state.player.deathSaves?.dead:state.monsters[id]?.isAlive))
  if(!state.initiativeOrder.some(canTakeInitiativeTurn)){pending.awaitingCombatClosure=true;return null}
  delete weather.pendingCombatRound
  resumeFixedInitiativeRoster()
  if(state.currentTurn)resetTurnEconomy(state.currentTurn)
  startInitiativeSlotTiming()
  return state.currentTurn
}

export function assertSurvivalRoundTransitionValid(dayCompleted = false): void {
  const nutrition = state.dmTools?.survival, pending = nutrition?.pendingCombatRound
  if (!pending) return
  if (state.phase !== 'combat' || state.currentTurn !== null || pending.round !== state.round
    || pending.combatGeneration !== (state.combatGeneration ?? 0)
    || pending.mapId !== (state.currentMapId ?? firstMapId(state))
    || pending.dayIndex + Number(dayCompleted) !== nutrition!.day.index)
    throw new RuleViolation('NUTRITION_ROUND_CONTINUATION_MISMATCH', 'The saved nutrition boundary must match its original combat, round, map and day.', {})
}

/** Resume only the deferred turn of an already requested round transition.
 * Nutrition resolves first; it never changes or rerolls the encounter's order. */
export function completeSurvivalRoundTransition(): string | null | undefined {return withCackleConsequences(()=>completeCackleBoundRoundTransition())}
function completeCackleBoundRoundTransition():string|null|undefined {
  if(state.dmTools?.weather?.pendingCombatRound)return continueWeatherRoundTick()
  const nutrition = state.dmTools?.survival, pending = nutrition?.pendingCombatRound
  if (!pending || isSurvivalDayDue()) return undefined
  assertSurvivalRoundTransitionValid(true)
  delete nutrition!.pendingCombatRound
  if (state.player.deathSaves?.dead&&!Object.keys(state.dmTools?.xgeFalling?.active??{}).length&&!robeRequiresInitiativeTurn(state,'player')) return null
  state.initiativeOrder = state.initiativeOrder.filter(id => Boolean(complexTrapSlot(state,id))||activeXgeFall(state,id)||robeRequiresInitiativeTurn(state,id)||(id === 'player'
    ? !state.player.deathSaves?.stable : state.monsters[id]?.isAlive))
  if (!state.initiativeOrder.some(canTakeInitiativeTurn)) return null
  resumeFixedInitiativeRoster()
  if (state.currentTurn) resetTurnEconomy(state.currentTurn)
  startInitiativeSlotTiming()
  return state.currentTurn
}

export function addLogEntry(entry: Omit<GameState['combatLog'][0], 'id' | 'timestamp'>): void {
  if (entry.turn === 'player') state.playerActionRevision = (state.playerActionRevision ?? 0) + 1
  state.combatLog.push({
    ...entry,
    id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: Date.now(),
  })

  // Keep log bounded
  if (state.combatLog.length > 200) {
    state.combatLog = state.combatLog.slice(-200)
  }
}

export function visitRoom(roomId: string): void {
  if (!state.roomsVisited.includes(roomId)) {
    state.roomsVisited.push(roomId)
  }
  state.currentRoomId = roomId
}

// Read-only preflight before the travel clock or inventory can change.
export function prepareMapDepartureItems(fromMapId: string, itemIds: readonly string[] = []): string[] {
  const departureItems = new Set<string>()
  for (const itemId of new Set(itemIds)) {
    const authored = getAdventureMap(state).groundItems?.find(entry => entry.item.id === itemId)
    if (!authored || authored.mapId !== fromMapId) {
      throw new RuleViolation('TRAVEL_ITEM_NOT_AUTHORED', 'Departure belongings must be authored on the departure map.', { itemId })
    }
    if (state.player.inventory.some(item => item.id === itemId)) continue
    const bundle = groundGearContainerTransfer(state, itemId, 'pickup')
    if (bundle.issue) throw new RuleViolation(bundle.issue.code, bundle.issue.message, {})
    for (const id of bundle.itemIds) {
      const dropped = state.droppedItems?.[id]
      if (!dropped || dropped.mapId !== fromMapId || state.player.inventory.some(item => item.id === id)) {
        throw new RuleViolation('TRAVEL_ITEM_UNAVAILABLE', 'Departure belongings must still exist on the departure map.', { itemId: id })
      }
      const issue = netItemPickupIssue(state, id)
      if (issue) throw new RuleViolation(issue.code, issue.message, {})
      departureItems.add(id)
    }
  }
  if (departureItems.size) assertCarryingAcquisition({ additionalItems: [...departureItems].map(id => state.droppedItems![id].item) })
  return [...departureItems]
}

// Apply a deliberate story departure after the tool validates its conditions.
export function applyMapTravel(params: {
  fromMapId: string
  toMapId: string
  arrivalCell: { x: number; y: number }
  arrivalRoomId: string
  companions: string[]
  outcome: MapOutcome
  departureItemIds?: string[]
}): { companionsMoved: string[]; itemsTaken: Item[] } {
  const aside=shoveAsideTransitionIssue(state);if(aside)throw new RuleViolation(aside.code,aside.message,{})
  const overrun=overrunCheckTransitionIssue(state);if(overrun)throw new RuleViolation(overrun.code,overrun.message,{})
  const tumble=tumbleCheckTransitionIssue(state);if(tumble)throw new RuleViolation(tumble.code,tumble.message,{})
  const cleaving=cleavingTransitionIssue(state);if(cleaving)throw new RuleViolation(cleaving.code,cleaving.message,{})
  const chase=chaseTransitionIssue(state);if(chase)throw new RuleViolation(chase.code,chase.message,{})
  const swallowed=swallowMapTransitionIssue(state);if(swallowed)throw new RuleViolation(swallowed.code,swallowed.message,{})
  const departureItems = prepareMapDepartureItems(params.fromMapId, params.departureItemIds)
  const arrivalWitness=prepareGroundGearStep(state,'player','arrival'),physicalArrival=preparePhysicalGroundCommits([{id:'player',cell:params.arrivalCell,kind:'arrival',from:arrivalWitness}],params.toMapId)
  assertWeatherMapArrival(params.toMapId,params.arrivalCell)
  if((state.currentMapId??firstMapId(state))!==params.toMapId){
    const issue=xgeFallingTransitionIssue(state)??nativeFlightTransitionIssue(state)??physicalLoadTransitionIssue(state)
    if(issue)throw new RuleViolation(issue.code,issue.message,{})
    interruptAmmunitionSearches(state,'map_changed')
  }
  // The authored departure includes collecting these existing belongings.
  // Preflight every instance before committing any inventory or map change.
  const itemsTaken = departureItems.map(id => pickUpPlayerItemInstance(id))

  // Issue de la map quittée — sens unique : sa présence dans mapOutcomes
  // verrouille tout retour.
  state.mapOutcomes ??= {}
  const maps = getAdventureMap(state).maps
  const group = maps.find(map => map.id === params.fromMapId)?.travelGroup
  for (const map of maps.filter(map => group ? map.travelGroup === group : map.id === params.fromMapId)) {
    archiveObjectiveJournal(state,map.id)
    state.mapOutcomes[map.id] = structuredClone(params.outcome)
  }

  // Les combattants de la map quittée n'ont plus de sens sur la nouvelle grille
  // (le voyage est refusé en combat : il ne reste que des cadavres ou des
  // créatures abandonnées derrière soi).
  // Preserve their authoritative records for persistent effects/exhaustion,
  // without making them active combatants or changing one-way travel rules.
  state.sceneMemory ??= {}
  const floors = (state.sceneMemory.floorMonsters ?? {}) as Record<string, Record<string, MonsterState>>
  state.sceneMemory.floorMonsters = { ...floors, [params.fromMapId]: structuredClone(state.monsters) }
  state.monsters = {}
  state.initiativeOrder = []
  state.currentTurn = null
  state.round = 0
  state.movementUsed = {}
  state.diagonalMovementUsed = {}
  state.actionUsed = {}
  state.bonusActionUsed = {}

  // Repos narratif entre cartes : recharge des ressources de classe et des
  // emplacements de sorts à leur max (décision n°6, docs/playable-characters.md).
  rechargePlayerResources()

  // Purge transient facts; durable scene consequences remain in saved state.
  purgeWorldFacts(fact => fact.mapId === params.fromMapId && fact.expires !== 'never')

  state.currentMapId = params.toMapId
  state.player.position = { x: params.arrivalCell.x, y: params.arrivalCell.y }
  clearActualFootwork();commitPhysicalGroundSupport(physicalArrival,'player')
  visitRoom(params.arrivalRoomId)

  // Compagnons : ils traversent avec le joueur, placés sur une case libre
  // adjacente à l'arrivée. Les autres PNJ restent sur leur map d'origine.
  const companionsMoved: string[] = []
  const occupied = new Set<string>([`${params.arrivalCell.x},${params.arrivalCell.y}`])
  for (const npcId of params.companions) {
    const npc = state.npcs?.[npcId]
    if (!npc) continue
    // Un compagnon ne suit le joueur que s'il est devenu son ami : l'accord se
    // matérialise en jeu par reveal_npc({ disposition: "helpful" }). Un PNJ
    // jamais abordé (neutral/wary) reste sur sa map d'origine — pas
    // d'apparition irrationnelle dans la suite de l'aventure.
    if (npc.disposition !== 'helpful') continue
    const grid = getAdventureMap(state).maps.find(m => m.id === params.toMapId)?.grid
    const cell = findFreeCellNear(params.arrivalCell, occupied, grid)
    npc.mapId = params.toMapId
    npc.roomId = params.arrivalRoomId
    npc.position = cell
    occupied.add(`${cell.x},${cell.y}`)
    companionsMoved.push(npcId)
  }
  reconcileCasting()
  reconcileNets()
  reconcileWeatherInventory()
  reconcileFrigidWaterPresence()
  onOilGroundContact('player');recordGroundGearContact('player','arrival',arrivalWitness)
  return { companionsMoved, itemsTaken }
}

// A local floor crossing closes no act, grants no rest and preserves discovery,
// ground objects, NPCs and spatial effects on their own maps.
export function applyMapPassage(toMapId: string, cell: { x: number; y: number }, roomId: string): void {
  const aside=shoveAsideTransitionIssue(state);if(aside)throw new RuleViolation(aside.code,aside.message,{})
  const overrun=overrunCheckTransitionIssue(state);if(overrun)throw new RuleViolation(overrun.code,overrun.message,{})
  const tumble=tumbleCheckTransitionIssue(state);if(tumble)throw new RuleViolation(tumble.code,tumble.message,{})
  const cleaving=cleavingTransitionIssue(state);if(cleaving)throw new RuleViolation(cleaving.code,cleaving.message,{})
  const chase=chaseTransitionIssue(state);if(chase)throw new RuleViolation(chase.code,chase.message,{})
  const swallowed=swallowMapTransitionIssue(state);if(swallowed)throw new RuleViolation(swallowed.code,swallowed.message,{})
  const arrivalWitness=prepareGroundGearStep(state,'player','arrival'),physicalArrival=preparePhysicalGroundCommits([{id:'player',cell,kind:'arrival',from:arrivalWitness}],toMapId)
  assertWeatherMapArrival(toMapId,cell)
  if((state.currentMapId??firstMapId(state))!==toMapId){
    const issue=xgeFallingTransitionIssue(state)??nativeFlightTransitionIssue(state)??physicalLoadTransitionIssue(state)
    if(issue)throw new RuleViolation(issue.code,issue.message,{})
    interruptAmmunitionSearches(state,'map_changed')
  }
  state.sceneMemory ??= {}
  const floors = (state.sceneMemory.floorMonsters ?? {}) as Record<string, Record<string, MonsterState>>
  state.sceneMemory.floorMonsters = {
    ...floors, [state.currentMapId ?? firstMapId(state)]: structuredClone(state.monsters),
  }
  state.monsters = structuredClone(floors[toMapId] ?? {})
  state.currentMapId = toMapId
  state.player.position = { ...cell }
  clearActualFootwork();commitPhysicalGroundSupport(physicalArrival,'player')
  state.initiativeOrder = []
  state.currentTurn = null
  state.round = 0
  state.movementUsed = {}
  state.diagonalMovementUsed = {}
  state.actionUsed = {}
  state.bonusActionUsed = {}
  syncPlayerRoomFromPosition()
  advanceHeroTime()
  reconcileWeatherInventory()
  onOilGroundContact('player');recordGroundGearContact('player','arrival',arrivalWitness)
}

// Première case libre autour d'un point (anneaux croissants), bornée à la
// grille. Repli : la case d'origine décalée d'un cran vers l'intérieur.
function findFreeCellNear(
  origin: { x: number; y: number },
  occupied: Set<string>,
  grid: { cols: number; rows: number } | undefined
): { x: number; y: number } {
  const maxX = (grid?.cols ?? 17) - 1
  const maxY = (grid?.rows ?? 15) - 1
  for (let radius = 1; radius <= 3; radius++) {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue
        const x = origin.x + dx
        const y = origin.y + dy
        if (x < 0 || y < 0 || x > maxX || y > maxY) continue
        if (occupied.has(`${x},${y}`)) continue
        return { x, y }
      }
    }
  }
  return { x: Math.max(0, Math.min(maxX, origin.x)), y: Math.max(0, Math.min(maxY, origin.y)) }
}

// Recharge les ressources de classe et emplacements de sorts du joueur à leur
// max (appelé au changement de carte). Sans effet sur un guerrier legacy sans
// ressources/emplacements.
function rechargePlayerResources(): void {
  if (state.player.ruleset === 'srd2014') return
  const player = state.player
  if (player.resources) {
    for (const key of Object.keys(player.resources)) {
      player.resources[key].current = player.resources[key].max
    }
  }
  if (player.spellSlots) {
    for (const pool of Object.values(player.spellSlots)) pool.current = pool.max
  }
}

// Dépense un emplacement de sort de niveau 1. Retourne false si aucun dispo.
export function consumeSpellSlot(level: import('../lib/types').SpellSlotLevel): boolean {
  const slots = state.player.spellSlots
  const pool = slots?.[`level${level}`]
  if (!pool || pool.current <= 0) return false
  pool.current -= 1
  return true
}

// Dépense une ressource de classe nommée. Retourne false si épuisée/absente.
export function consumeResource(name: string): boolean {
  const resource = state.player.resources?.[name]
  if (!resource || resource.current <= 0) return false
  resource.current -= 1
  return true
}

export function hasEncounterTriggered(encounterId: string): boolean {
  return Boolean(state.encountersTriggered?.includes(encounterId))
}

export function markEncounterTriggered(encounterId: string): void {
  state.encountersTriggered ??= []
  if (!state.encountersTriggered.includes(encounterId)) {
    state.encountersTriggered.push(encounterId)
  }
}
