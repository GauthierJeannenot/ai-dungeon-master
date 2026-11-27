import { isEnrolledNonhostileNpcCombatant } from '../lib/npc-party-state'
import { robeCombatExitIssue } from '../lib/charged-item-state'
import { complexTrapTurnIssue, complexTrapSlot } from '../lib/complex-trap-initiative'
import { cleavingActionIssue,cleavingTransitionIssue } from '../lib/cleaving-state'
import { encounterCadenceTransitionIssue } from '../lib/encounter-cadence-state'
import { assertCackleEventsResolved } from './cackle-fever'
import { chaseTransitionIssue,chaseHeldBodyMutationBlocked } from '../lib/chase-state'
import { eligibleXgeFallInitiative } from '../lib/xge-falling-geometry'
import { xgeFallingTurnIssue,xgeFallingTransitionIssue,dueXgeFallDescent } from '../lib/xge-falling-state'
import { sleepDueIssue } from '../lib/sleep-state'
import { nativeFlightFallIssue } from '../lib/native-flight-geometry'
import { spatialWeaponResolution } from '../lib/spatial-weapon-resolution'
import { startTurnFireDueIssue } from '../lib/weapon-consumable-state'
import { jumpingDueIssue } from '../lib/jumping-state'
import { locomotionPhysicalIssue } from '../lib/locomotion-geometry'
import { assertSurvivalEventsResolved } from './survival'
import { travelDueIssue } from '../lib/travel-state'
import { castingDueIssue } from '../lib/casting-state'
import { weatherHeightCombatIssue,weatherDueIssue,weatherFlightTurnIssue } from '../lib/weather-state'
import { frigidWaterDueIssue } from '../lib/frigid-water-state'
import { assertFrigidWaterTimeAdvance } from './frigid-water'
import { PlayerState, MonsterState } from '../lib/types'
import { gridForMap } from '../lib/adventure-map'
import { findWeapon } from '../lib/srd/weapons'
import { ACTIVE_ADVENTURE_ID } from './adventure'
import * as gs from './game-state'
import { planNavigation } from './navigation'
import { strictHero,spendHeroAction,effects } from './hero-rules'
import { assertAfflictionEvents,assertAfflictionTurnOpen,assertAfflictionCombatRoster,afflictionRequiresInitiativeTurn } from './afflictions'
import { assertSewerPlagueEventResolved } from './sewer-plague'
import { isActiveMonster } from '../lib/nonlethal-state'
import { assertKnockoutDamageSupported } from './nonlethal'
import { assertNpcTurnDeathSaveResolved, assertNpcCombatRoster } from './npc-life'
import { isDyingNpc } from '../lib/npc-life-state'
import { breathingRetainsCombatSlot, assertBreathingCombatRoster } from './breathing'
import { assertPlayerTurnSaveResolved } from './player-life'
import { assertSurpriseCanAct } from './surprise'
import { assertOilCombatRoster,oilRequiresInitiativeTurn } from './oil-ground'
import { activeRazorvineObjects, sameRazorvineCell, sceneObjectFootprint } from '../lib/razorvine-state'
import { groundGearContactDueIssue,groundGearStoppedThisTurn } from '../lib/ground-gear-state'
import type { HazardCombatWitness } from './hazard-combat'
import { isSurprised } from '../lib/surprise-state'
import { swallowTurnIssue,swallowedBy,swallowMapTransitionIssue } from '../lib/swallow-state'
import { harvestCreatureActionIssue } from '../lib/srd/harvest-creatures'

type Entity = PlayerState | MonsterState
export function assertSleepEventsResolved():void{const xge=xgeFallingTurnIssue(gs.getState());if(xge)throw new RuleViolation(xge.code,xge.message,{});const sleep=sleepDueIssue(gs.getState());if(sleep)throw new RuleViolation(sleep.code,sleep.message,{eventId:sleep.eventId})}
export function assertWeatherEventsResolved(initiativeCombatants?:string[]):void{const state=gs.getState(),allowed=initiativeCombatants?eligibleXgeFallInitiative(state,initiativeCombatants):[];const nativeFall=Object.keys(state.dmTools?.nativeFlight?.locations??{}).map(id=>nativeFlightFallIssue(state,id)).find(issue=>issue&&!allowed.some(entry=>entry.entityId===issue.entityId&&entry.nativeLocationWitness===issue.locationWitness));if(nativeFall)throw new RuleViolation(nativeFall.code,nativeFall.message,{entityId:nativeFall.entityId});const fire=startTurnFireDueIssue(gs.getState());if(fire)throw new RuleViolation(fire.code,fire.message,{eventId:fire.eventId});const frigid=frigidWaterDueIssue(state);if(frigid)throw new RuleViolation(frigid.code,frigid.message,{});const issue=weatherDueIssue(gs.getState());if(issue)throw new RuleViolation(issue.code,issue.message,{eventIds:issue.eventIds})}

const DEFAULT_MELEE_RANGE_CELLS = 1

// Bornes de déplacement dérivées de la grille de la MAP COURANTE du module
// actif (figé au spawn). Source de vérité unique : adventures/<id>/map.ts
// (maps[i].grid). DYNAMIQUE depuis le multi-map : chaque map a sa grille, les
// bornes suivent state.currentMapId — ne plus les figer dans une constante ni
// dans un schéma zod construit à l'import.
export function mapBounds(): { minX: number; maxX: number; minY: number; maxY: number } {
  const grid = gridForMap(gs.getState().currentMapId, gs.getState())
  return {
    minX: 0,
    maxX: grid.cols - 1,
    minY: 0,
    maxY: grid.rows - 1,
  }
}


export class RuleViolation extends Error {
  constructor(
    public code: string,
    message: string,
    public detail?: Record<string, unknown>
  ) {
    super(message)
    this.name = 'RuleViolation'
  }
}

export function ruleErrorResult(err: unknown) {
  const violation = err instanceof RuleViolation
    ? err
    : new RuleViolation('RULE_ERROR', err instanceof Error ? err.message : 'Illegal game action')

  return {
    content: [{
      type: 'text' as const,
      text: JSON.stringify({
        error: violation.message,
        code: violation.code,
        detail: violation.detail,
      }),
    }],
    isError: true,
  }
}

export function distanceCells(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y))
}

export function isAlive(entity: Entity): boolean {
  if ('isAlive' in entity) return entity.isAlive
  return entity.hp.current > 0
}

export function occupiesSpace(entity: Entity): boolean {
  if ('isAlive' in entity) return entity.isAlive
  return !entity.deathSaves?.dead
}

function speedCells(entity: Entity): number {
  return Math.floor(entity.speed / 5)
}

function assertLocomotionOutcomeResolved(): void {
  const issue=locomotionPhysicalIssue(gs.getState())
  if(issue)throw new RuleViolation(issue.code,issue.message,{entityId:issue.entityId,mediumId:issue.mediumId})
}

function assertEntity(entityId: string): Entity {
  const entity = gs.getEntity(entityId)
  if (!entity) {
    throw new RuleViolation('ENTITY_NOT_FOUND', `Entity not found: ${entityId}`, { entityId })
  }
  return entity
}

function assertAlive(entityId: string, entity: Entity): void {
  if (!isAlive(entity)) {
    throw new RuleViolation('ENTITY_DEAD', `${entity.name} cannot act because they are dead or unconscious.`, { entityId })
  }
}
function assertCanAct(entity: Entity): void {
  assertLocomotionOutcomeResolved()
  assertSurpriseCanAct(entity.id)
  if (entity.conditions.some(c => ['incapacitated', 'paralyzed', 'petrified', 'stunned', 'unconscious'].includes(c)))
    throw new RuleViolation('ENTITY_INCAPACITATED', 'This condition prevents actions and bonus actions.', { entityId: entity.id })
}

function assertAttackable(entityId: string, entity: Entity): void {
  if (isAlive(entity)) return
  if (entityId === 'player' && !('isAlive' in entity) && !entity.deathSaves?.dead) return

  throw new RuleViolation('ENTITY_DEAD', `${entity.name} cannot be targeted because they are dead.`, { entityId })
}

function assertCurrentTurn(entityId: string): void {
  const swallowed=swallowTurnIssue(gs.getState());if(swallowed)throw new RuleViolation(swallowed.code,swallowed.message,{})
  const state = gs.getState()
  if(state.hero?.pending)throw new RuleViolation('REACTION_PENDING','Resolve the held reaction before advancing or acting.',{})
  if (state.phase !== 'combat') {
    throw new RuleViolation('NOT_IN_COMBAT', 'This action requires an active combat.', { phase: state.phase })
  }
  if (state.currentTurn !== entityId) {
    throw new RuleViolation('NOT_CURRENT_TURN', `It is ${state.currentTurn ?? 'no one'}'s turn, not ${entityId}'s.`, {
      currentTurn: state.currentTurn,
      requestedEntity: entityId,
    })
  }
}

function assertInInitiative(entityId: string): void {
  const state = gs.getState()
  if (!state.initiativeOrder.includes(entityId)) {
    throw new RuleViolation('NOT_IN_INITIATIVE', `${entityId} is not in the initiative order.`, {
      entityId,
      initiativeOrder: state.initiativeOrder,
    })
  }
}

export function validateMapCell(cell: { x: number; y: number }, fieldName = 'cell'): void {
  const bounds = mapBounds()
  const validCoordinates = Number.isFinite(cell.x) &&
    Number.isFinite(cell.y) &&
    Number.isInteger(cell.x) &&
    Number.isInteger(cell.y)

  const inBounds = validCoordinates &&
    cell.x >= bounds.minX &&
    cell.x <= bounds.maxX &&
    cell.y >= bounds.minY &&
    cell.y <= bounds.maxY

  if (!inBounds) {
    throw new RuleViolation('INVALID_GRID_CELL', `Cell (${cell.x}, ${cell.y}) is outside the battlemap bounds.`, {
      field: fieldName,
      cell,
      bounds,
    })
  }
}

function assertActionAvailable(entityId: string): void {
  if (gs.hasActionUsed(entityId)) {
    throw new RuleViolation('ACTION_ALREADY_USED', `${entityId} has already used their action this turn.`, {
      entityId,
      currentTurn: gs.getState().currentTurn,
    })
  }
}

function occupiedByLivingEntity(cell: { x: number; y: number }, exceptId?: string): Entity | undefined {
  return gs.getAllEntities().find(entity =>
    entity.id !== exceptId &&
    occupiesSpace(entity) &&
    entity.position.x === cell.x &&
    entity.position.y === cell.y
  )
}

function attackRangeCells(weaponOrSpell: string, rangeCells?: number): number {
  if (rangeCells !== undefined) return rangeCells
  return findWeapon(weaponOrSpell)?.rangeCells ?? DEFAULT_MELEE_RANGE_CELLS
}

export function validateMove(tokenId: string, toCell: { x: number; y: number }): { distance: number; remaining: number | null } {
  assertSewerPlagueEventResolved()
  assertSleepEventsResolved()
  assertLocomotionOutcomeResolved()
  assertSurvivalEventsResolved()
  assertWeatherEventsResolved()
  assertAfflictionTurnOpen(tokenId)
  return planNavigation(tokenId, { kind: 'cell', cell: toCell })

}

export function recordMove(tokenId: string, distance: number): void {
  if (gs.getState().phase === 'combat' && distance > 0) {
    gs.addMovementUsed(tokenId, distance)
  }
}

export function validateAttack(
  attackerId: string,
  targetId: string,
  weaponOrSpell: string,
  rangeCells?: number,
  reaction = false,
  sourceActionAlreadyPaid = false // Engine-only validated native action continuation.
): void {
  const gearIssue=groundGearContactDueIssue(gs.getState());if(gearIssue)throw new RuleViolation(gearIssue.code,gearIssue.message,{})
  if(!reaction&&attackerId==='player'){const issue=castingDueIssue(gs.getState());if(issue)throw new RuleViolation(issue.code,issue.message,{})}
  const heightIssue=weatherHeightCombatIssue(gs.getState(),[attackerId,targetId]);if(heightIssue)throw new RuleViolation(heightIssue.code,heightIssue.message,{})
  if (attackerId === targetId) {
    throw new RuleViolation('SELF_TARGET', 'An entity cannot attack itself.', { attackerId, targetId })
  }

  if (!reaction) assertCurrentTurn(attackerId)
  else if (gs.getState().hero?.pending) throw new RuleViolation('REACTION_PENDING', 'Resolve the held reaction first.', {})
  assertInInitiative(attackerId)
  assertInInitiative(targetId)
  if (!reaction && !sourceActionAlreadyPaid && !(attackerId === 'player' && (gs.getState().hero?.attackAction?.remaining ?? 0) > 0)) assertActionAvailable(attackerId)

  const attacker = assertEntity(attackerId)
  if('type'in attacker){const missing=harvestCreatureActionIssue(attacker.type,weaponOrSpell);if(missing)throw new RuleViolation('MONSTER_ACTION_REFERENCE_ONLY',missing,{monsterType:attacker.type,action:weaponOrSpell})}
  assertCanAct(attacker)
  const target = assertEntity(targetId)
  assertAlive(attackerId, attacker)
  assertAttackable(targetId, target)
  validateHostileTarget(attackerId, targetId)

  const distance = (spatialWeaponResolution(gs.getState(),attackerId,targetId)?.distanceFeet??distanceCells(attacker.position,target.position)*5)/5
  const maxRange = rangeCells ?? ('attackRangeCells' in attacker ? attacker.attackRangeCells : undefined)
    ?? attackRangeCells(weaponOrSpell)
  if (distance > maxRange) {
    throw new RuleViolation('TARGET_OUT_OF_RANGE', `${target.name} is ${distance} cells away; ${weaponOrSpell} range is ${maxRange} cells.`, {
      attackerId,
      targetId,
      weaponOrSpell,
      distance,
      maxRange,
    })
  }
}

export function validateHostileTarget(attackerId: string, targetId: string): void {
  if(swallowedBy(gs.getState(),attackerId)===targetId&&Object.keys(gs.getState().dmTools?.swallow?.damage??{}).length>=4096)throw new RuleViolation('SWALLOW_DAMAGE_HISTORY_LIMIT','Retain the actual source inside-damage event before any attack or save die.',{})
  const target = gs.getEntity(targetId)
  if (target) assertKnockoutDamageSupported(target,1)
  if (effects('charm-person', attackerId).some(effect => effect.sourceId === targetId))
    throw new RuleViolation('CHARMED_TARGET_FORBIDDEN', 'A charmed creature cannot attack or harm its charmer.', { attackerId, targetId })
  if (gs.getEntity(attackerId)?.conditions.includes('charmed') && gs.getState().monsterEffects?.some(effect => effect.kind === 'fey-charm' && effect.targetId === attackerId && effect.sourceId === targetId))
    throw new RuleViolation('CHARMED_TARGET_FORBIDDEN', 'A charmed creature cannot attack or harm its charmer.', { attackerId, targetId })
}

export function recordAction(entityId: string): void {
  if(entityId==='player'&&strictHero()) {spendHeroAction();return}
  gs.markActionUsed(entityId)
}

export function validateSavingThrow(entityId: string): void {
  const entity = assertEntity(entityId)
  assertAlive(entityId, entity)
  if (gs.getState().phase === 'combat') {
    assertInInitiative(entityId)
  }
}

export function validateAbilityCheck(entityId: string): void {
  validateActionUse(entityId)
}

export function validateFreeCombatAction(entityId: string): void {
  const cleaving=cleavingActionIssue(gs.getState());if(cleaving)throw new RuleViolation(cleaving.code,cleaving.message,{})
  assertCackleEventsResolved()
  assertSewerPlagueEventResolved()
  assertSleepEventsResolved()
  const gearIssue=groundGearContactDueIssue(gs.getState());if(gearIssue)throw new RuleViolation(gearIssue.code,gearIssue.message,{})
  const jumpIssue=jumpingDueIssue(gs.getState());if(jumpIssue)throw new RuleViolation(jumpIssue.code,jumpIssue.message,{})
  if(entityId==='player'){const issue=castingDueIssue(gs.getState());if(issue)throw new RuleViolation(issue.code,issue.message,{})}
  assertSurvivalEventsResolved()
  assertWeatherEventsResolved()
  assertAfflictionTurnOpen(entityId)
  const entity = assertEntity(entityId)
  assertAlive(entityId, entity)
  assertCanAct(entity)
  assertCurrentTurn(entityId)
  assertInInitiative(entityId)
}

export function validateActionUse(entityId: string): void {
  const trapTurn=complexTrapTurnIssue(gs.getState());if(trapTurn)throw new RuleViolation(trapTurn.code,trapTurn.message,{trapId:trapTurn.trapId,initiativeCount:trapTurn.initiativeCount})
  const cleaving=cleavingActionIssue(gs.getState());if(cleaving)throw new RuleViolation(cleaving.code,cleaving.message,{})
  assertCackleEventsResolved()
  assertSewerPlagueEventResolved()
  assertSleepEventsResolved()
  const gearIssue=groundGearContactDueIssue(gs.getState());if(gearIssue)throw new RuleViolation(gearIssue.code,gearIssue.message,{})
  const jumpIssue=jumpingDueIssue(gs.getState());if(jumpIssue)throw new RuleViolation(jumpIssue.code,jumpIssue.message,{})
  if(entityId==='player'){const issue=castingDueIssue(gs.getState());if(issue)throw new RuleViolation(issue.code,issue.message,{})}
  assertSurvivalEventsResolved()
  assertWeatherEventsResolved()
  assertAfflictionTurnOpen(entityId)
  if(gs.getState().hero?.pending)throw new RuleViolation('REACTION_PENDING','Resolve the held reaction before another action.',{})
  const entity = assertEntity(entityId)
  assertAlive(entityId, entity)
  assertCanAct(entity)
  if (gs.getState().phase === 'combat') {
    assertCurrentTurn(entityId)
    assertInInitiative(entityId)
    assertActionAvailable(entityId)
  }
}

// Économie d'action BONUS (second souffle). Hors combat : non contrainte
// (comme l'action). En combat : tour courant + action bonus non déjà dépensée.
export function validateBonusActionUse(entityId: string): void {
  const trapTurn=complexTrapTurnIssue(gs.getState());if(trapTurn)throw new RuleViolation(trapTurn.code,trapTurn.message,{trapId:trapTurn.trapId,initiativeCount:trapTurn.initiativeCount})
  const cleaving=cleavingActionIssue(gs.getState());if(cleaving)throw new RuleViolation(cleaving.code,cleaving.message,{})
  assertSewerPlagueEventResolved()
  assertSleepEventsResolved()
  if(entityId==='player'){const issue=castingDueIssue(gs.getState());if(issue)throw new RuleViolation(issue.code,issue.message,{})}
  assertSurvivalEventsResolved()
  assertWeatherEventsResolved()
  assertAfflictionTurnOpen(entityId)
  if(gs.getState().hero?.pending)throw new RuleViolation('REACTION_PENDING','Resolve the held reaction before a bonus action.',{})
  const entity = assertEntity(entityId)
  assertAlive(entityId, entity)
  assertCanAct(entity)
  if (gs.getState().phase === 'combat') {
    assertCurrentTurn(entityId)
    assertInInitiative(entityId)
    if (gs.hasBonusActionUsed(entityId)) {
      throw new RuleViolation('BONUS_ACTION_ALREADY_USED', `${entityId} has already used their bonus action this turn.`, {
        entityId,
        currentTurn: gs.getState().currentTurn,
      })
    }
  }
}

export function validateConditionTarget(entityId: string): void {
  assertSewerPlagueEventResolved()
  if(chaseHeldBodyMutationBlocked(gs.getState(),entityId))throw new RuleViolation('REACTION_PENDING','Retain the actual source/target bodies of the original held chase check/attack before applying another condition.',{})
  const entity = assertEntity(entityId)
  assertAlive(entityId, entity)
}

export function validateHPUpdate(entityId: string, delta: number): void {
  assertSewerPlagueEventResolved()
  assertSurvivalEventsResolved()
  assertWeatherEventsResolved()
  if(gs.getState().hero?.pending)throw new RuleViolation('REACTION_PENDING','Resolve the held reaction before an unrelated HP change.',{})
  const entity = assertEntity(entityId)
  if (delta < 0) assertKnockoutDamageSupported(entity,-delta)
  if (delta < 0) {
    if (entityId === 'player' && !('isAlive' in entity) && entity.hp.current <= 0 && !entity.deathSaves?.dead) {
      return
    }
    assertAlive(entityId, entity)
  }
  if (entityId === 'player' && delta > 0 && 'deathSaves' in entity && entity.deathSaves?.dead) {
    throw new RuleViolation('PLAYER_DEAD', 'A dead player cannot be healed by ordinary HP recovery.', {
      entityId,
      deathSaves: entity.deathSaves,
    })
  }
}

export function validateEnterCombat(combatants: string[], hazardPreparation?: HazardCombatWitness): void {
  const cadence=encounterCadenceTransitionIssue(gs.getState());if(cadence)throw new RuleViolation(cadence.code,cadence.message,cadence)
  assertSewerPlagueEventResolved()
  assertLocomotionOutcomeResolved()
  const gearIssue=groundGearContactDueIssue(gs.getState());if(gearIssue)throw new RuleViolation(gearIssue.code,gearIssue.message,{})
  assertOilCombatRoster(combatants)
  assertAfflictionCombatRoster(combatants)
  assertSurvivalEventsResolved()
  assertWeatherEventsResolved(combatants)
  const travelIssue = travelDueIssue(gs.getState())
  if (travelIssue) throw new RuleViolation(travelIssue.code, travelIssue.message, { eventId: travelIssue.eventId })
  const state = gs.getState()
  if (state.phase === 'combat') {
    throw new RuleViolation('COMBAT_ALREADY_ACTIVE', 'Combat is already active.', {
      currentTurn: state.currentTurn,
      initiativeOrder: state.initiativeOrder,
    })
  }

  const unique = new Set(combatants)
  assertNpcCombatRoster(combatants)
  assertBreathingCombatRoster(combatants)
  if (unique.size !== combatants.length) {
    throw new RuleViolation('DUPLICATE_COMBATANT', 'Combatants must not contain duplicates.', { combatants })
  }
  if (!unique.has('player')) {
    throw new RuleViolation('PLAYER_REQUIRED', 'Combat must include the player.', { combatants })
  }

  const livingCombatants = combatants.map(id => {
    const entity = assertEntity(id)
    if((id!=='player'||entity.hp.current>0||gs.getPlayer().deathSaves?.dead)&&!oilRequiresInitiativeTurn(state,id)&&!afflictionRequiresInitiativeTurn(state,id))assertAlive(id, entity)
    if ('isAlive' in entity && !isActiveMonster(entity)&&!isDyingNpc(entity)&&!breathingRetainsCombatSlot(id)&&!oilRequiresInitiativeTurn(state,id)&&!afflictionRequiresInitiativeTurn(state,id))
      throw new RuleViolation('ENTITY_INCAPACITATED', 'A stable knocked-out creature does not take active combat turns.', { entityId: id })
    return entity
  })

  if (livingCombatants.length < 2 && !(livingCombatants.length===1&&livingCombatants[0].id==='player'&&(oilRequiresInitiativeTurn(state,'player')||afflictionRequiresInitiativeTurn(state,'player')||hazardPreparation))) {
    throw new RuleViolation('NOT_ENOUGH_COMBATANTS', 'Combat requires at least two living combatants.', { combatants })
  }
}

export function validateNextTurn(actorId?: string, skipAction = false): string {
  const trapTurn=complexTrapTurnIssue(gs.getState());if(trapTurn)throw new RuleViolation(trapTurn.code,trapTurn.message,{trapId:trapTurn.trapId,initiativeCount:trapTurn.initiativeCount})
  const cleaving=cleavingTransitionIssue(gs.getState());if(cleaving)throw new RuleViolation(cleaving.code,cleaving.message,{})
    assertCackleEventsResolved()
  const xge=xgeFallingTurnIssue(gs.getState(),true);if(xge)throw new RuleViolation(xge.code,xge.message,{...dueXgeFallDescent(gs.getState())})
  assertLocomotionOutcomeResolved()
  gs.assertWeatherEndingTurn()
  assertSurvivalEventsResolved()
  assertWeatherEventsResolved()
  const travelIssue = travelDueIssue(gs.getState())
  if (travelIssue) throw new RuleViolation(travelIssue.code, travelIssue.message, { eventId: travelIssue.eventId })
  if(gs.getState().hero?.pending)throw new RuleViolation('REACTION_PENDING','Resolve the held reaction before ending the turn.',{})
  assertAfflictionEvents('end')
  const state = gs.getState()
  if (state.phase !== 'combat') {
    throw new RuleViolation('NOT_IN_COMBAT', 'Cannot advance turns because combat is not active.', { phase: state.phase })
  }
  if (!state.currentTurn || state.initiativeOrder.length === 0) {
    throw new RuleViolation('EMPTY_INITIATIVE', 'Cannot advance turns without an initiative order.')
  }
  const endingActorId = actorId ?? state.currentTurn
  if (endingActorId !== state.currentTurn) {
    throw new RuleViolation('NOT_CURRENT_TURN', `It is ${state.currentTurn}'s turn, not ${endingActorId}'s.`, {
      currentTurn: state.currentTurn,
      requestedEntity: endingActorId,
    })
  }
  assertInInitiative(endingActorId)
  if(endingActorId==='player')assertPlayerTurnSaveResolved()
  if(endingActorId!=='player')assertNpcTurnDeathSaveResolved(endingActorId)
  if (!skipAction && !gs.hasActionUsed(endingActorId) && !isSurprised(state, endingActorId)
    && !(state.monsters[endingActorId]&&state.monsters[endingActorId].hp.current===0)
    && !(endingActorId==='player'&&state.player.hp.current===0)) {
    throw new RuleViolation('TURN_ACTION_REQUIRED', `${endingActorId} cannot end their turn before using an action.`, {
      currentTurn: state.currentTurn,
      requestedEntity: endingActorId,
      actionUsed: gs.hasActionUsed(endingActorId),
    })
  }
  assertFrigidWaterTimeAdvance(6, true)
  return endingActorId
}

export function validateEndCombat(force?: boolean): void {
  const robe=robeCombatExitIssue(gs.getState());if(robe)throw new RuleViolation(robe.code,robe.message,{})
  const trapTurn=complexTrapTurnIssue(gs.getState());if(trapTurn)throw new RuleViolation(trapTurn.code,trapTurn.message,{})
  const activeTrap=Object.values(gs.getState().dmTools?.complexTraps??{}).find(t=>t.status==='active'&&t.mapId===gs.getState().currentMapId&&gs.getAllEntities().some(e=>(e.id==='player'?!gs.getPlayer().deathSaves?.dead:'isAlive' in e&&e.isAlive)&&e.position.x>=t.fromCell.x&&e.position.x<=t.toCell.x&&e.position.y>=t.fromCell.y&&e.position.y<=t.toCell.y))
  if(activeTrap)throw new RuleViolation('COMPLEX_TRAP_COMBAT_ACTIVE','A living body remains in the actual active sphere corridor; leave it physically or neutralize the trap before ending combat.',{trapId:activeTrap.id})
  const cleaving=cleavingTransitionIssue(gs.getState());if(cleaving)throw new RuleViolation(cleaving.code,cleaving.message,{})
    assertCackleEventsResolved()
  const chase=chaseTransitionIssue(gs.getState());if(chase)throw new RuleViolation(chase.code,chase.message,{})

  const xge=xgeFallingTransitionIssue(gs.getState());if(xge)throw new RuleViolation(xge.code,xge.message,{})
  const swallowed=swallowMapTransitionIssue(gs.getState());if(swallowed)throw new RuleViolation(swallowed.code,swallowed.message,{})
  assertLocomotionOutcomeResolved()
  const gearIssue=groundGearContactDueIssue(gs.getState());if(gearIssue)throw new RuleViolation(gearIssue.code,gearIssue.message,{})
  assertPlayerTurnSaveResolved()
  assertSurvivalEventsResolved()
  assertWeatherEventsResolved()
  if(gs.getState().hero?.pending)throw new RuleViolation('REACTION_PENDING','Resolve the held reaction before ending combat.',{})
  const state = gs.getState()
  if (Object.keys(state.dmTools?.groundGear?.stops??{}).some(id=>groundGearStoppedThisTurn(state,id)))
    throw new RuleViolation('CALTROPS_TURN_UNRESOLVED','End the actual current turn before leaving initiative; a combat exit cannot erase the source movement stop.',{})
  if(state.currentTurn&&state.currentTurn!=='player')assertNpcTurnDeathSaveResolved(state.currentTurn)
  if (state.phase !== 'combat') {
    throw new RuleViolation('NOT_IN_COMBAT', 'Cannot end combat because combat is not active.', { phase: state.phase })
  }

  const livingEnemies = Object.values(state.monsters).filter(m => isActiveMonster(m) && !isEnrolledNonhostileNpcCombatant(state,m.id))

  if (!force && livingEnemies.length > 0) {
    throw new RuleViolation('COMBATANTS_STILL_ACTIVE', 'Cannot end combat while non-player combatants are still active unless force is true.', {
      livingCombatants: livingEnemies.map(entity => entity.id),
    })
  }
}

export function validateSpawn(cell: { x: number; y: number }): void {
  const state = gs.getState()
  if (state.phase === 'combat') {
    throw new RuleViolation('SPAWN_DURING_COMBAT', 'Cannot spawn a monster during active combat. Spawn before enter_combat.', {
      currentTurn: state.currentTurn,
    })
  }

  validateMapCell(cell, 'cell')
  if (activeRazorvineObjects(state).some(hedge => sceneObjectFootprint(hedge).some(part => sameRazorvineCell(part, cell))))
    throw new RuleViolation('RAZORVINE_VOLUME_BLOCKED', 'A new body cannot be placed inside the actual rooted thorn footprint.', { cell })

  const blocker = occupiedByLivingEntity(cell)
  if (blocker) {
    throw new RuleViolation('CELL_OCCUPIED', `Cell (${cell.x}, ${cell.y}) is occupied by ${blocker.name}.`, {
      blockerId: blocker.id,
      cell,
    })
  }
}
