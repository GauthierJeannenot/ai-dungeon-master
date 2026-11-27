import { savedDoorState } from '../lib/navigation'
import { assertComplexPath } from './complex-traps'
import { z } from 'zod'
import type { GameState } from '../lib/types'
import { findNavigationPath, navigationActor, NavigationError } from '../lib/navigation'
import { projectActualGroundMovement } from '../lib/physical-ground-movement'
import { razorvinePreparationWitness } from './razorvine'
import { slipperyIceAtBody } from '../lib/slippery-ice-state'
import { entityGroundContact, jumpingDueIssue } from '../lib/jumping-state'
import { isStatBackedNpc } from '../lib/npc-stat-blocks'
import { activeGroundGearPlacements, groundGearMovementIssue, prepareGroundGearStep } from './ground-gear-contacts'
import { oilGroundContactIssue } from './oil-ground'
import { engineGeometry } from './navigation'
import { RuleViolation } from './rules'
import { MagicHazardApproachSchema } from '../lib/spell-physical-state'
import { validateMagicalHazardApproach } from './hero-spells'

export const HazardCombatPreparationSchema = z.object({
  kind: z.enum(['oil', 'ground_gear', 'slippery_ice', 'razorvine', 'complex_trap']),
  hazardId: z.string().min(1).max(180).refine(id => !['__proto__','prototype','constructor'].includes(id)),
  approach: MagicHazardApproachSchema.optional(),
}).strict()
export type HazardCombatPreparation = z.infer<typeof HazardCombatPreparationSchema>
export interface HazardCombatWitness extends HazardCombatPreparation {
  mapId: string
  validatedAt: number
  hazardCell: { x: number; y: number }
  validatedBy: 'actual_contact' | 'reachable_ground_path' | 'reachable_magic_approach'
  uncertainScrollCheck?: boolean
}

function fail(code: string, message: string): never { throw new RuleViolation(code, message, {}) }

/** Qualifies only the selected real danger. No actor, path, contact, time,
 * reaction or turn is committed by preparation. The model still chooses every
 * later movement and action. */
export function validateHazardCombatPreparation(state: GameState, input: HazardCombatPreparation,
  combatants: readonly string[]): HazardCombatWitness {
  if (state.phase === 'combat') fail('COMBAT_ALREADY_ACTIVE', 'Combat is already active; never restart initiative to reroll.')
  if (state.hero?.pending) fail('REACTION_PENDING', 'Resolve the actual held reaction before preparing another initiative.')
  const jump = jumpingDueIssue(state)
  if (jump) fail(jump.code, jump.message)
  const at = state.worldTimeSeconds ?? 0
  if(input.kind==='complex_trap'){
    if(input.approach)fail('COMPLEX_TRAP_MAGIC_APPROACH_UNSUPPORTED','Select the existing real sphere corridor without an unrepresented magical approach.')
    const trap=state.dmTools?.complexTraps?.[input.hazardId]
    if(!trap||trap.status==='disabled'||trap.mapId!==state.currentMapId||trap.roomId!==state.currentRoomId||!['open','broken'].includes(savedDoorState(state,trap.triggerDoorId)??''))
      fail('COMPLEX_TRAP_PREPARATION_REQUIRED','Choose an existing local sphere with its actual linked door already open or broken; no enemy or threat is invented.')
    assertComplexPath(trap)
    const path=findNavigationPath(state,'player',{kind:'cell',cell:trap.fromCell},{geometry:engineGeometry()})
    if(!path.length)fail('COMPLEX_TRAP_APPROACH_REQUIRED','The actual corridor must be reachable.')
    for(const body of [state.player,...Object.values(state.monsters),...Object.values(state.npcs??{}).filter(npc=>!state.monsters[npc.id])]){
      if('mapId'in body&&body.mapId&&body.mapId!==state.currentMapId)continue
      if(body.id==='player'?state.player.deathSaves?.dead:'isAlive'in body&&body.isAlive===false)continue
      if(body.position.x>=trap.fromCell.x&&body.position.x<=trap.toCell.x&&body.position.y>=trap.fromCell.y&&body.position.y<=trap.toCell.y&&!combatants.includes(body.id))
        fail('COMPLEX_TRAP_ROSTER_REQUIRED','Explicitly include every actual living body in the sphere corridor, without revealing or fabricating one.')
    }
    return{...input,mapId:state.currentMapId!,validatedAt:at,hazardCell:{...trap.fromCell},validatedBy:'reachable_ground_path'}
  }
  if (input.kind === 'razorvine') {
    if (input.approach) fail('RAZORVINE_APPROACH_UNREPRESENTED', 'Choose a currently reachable actual hedge face without magical approach.')
    const face = razorvinePreparationWitness(state, input.hazardId)
    if (!face) fail('RAZORVINE_APPROACH_REQUIRED', 'The actual player must already be at a clear, same-level cardinal face of this living measured hedge.')
    return { ...input, mapId: state.currentMapId!, validatedAt: at, hazardCell: { ...face }, validatedBy: 'reachable_ground_path' }
  }
  const oil = state.dmTools?.oil?.patches[input.hazardId]
  const gear = activeGroundGearPlacements(state).find(value => value.id === input.hazardId)
  const ice = input.kind === 'slippery_ice' ? state.dmTools?.slipperyIce?.zones[input.hazardId] : undefined
  if (ice && input.approach) fail('SLIPPERY_ICE_APPROACH_UNREPRESENTED', 'This ice preparation supports an exact ground approach only.')
  const cells = input.kind === 'slippery_ice' ? ice?.mapId === state.currentMapId ? ice?.input.cells ?? [] : [] : input.kind === 'oil'
    ? oil && oil.mapId === state.currentMapId && oil.ignitedAt !== undefined
      && oil.ignitedAt <= at && oil.burnsUntil! > at && oil.extinguishedAt === undefined ? [oil.cell] : []
    : gear?.cells ?? []
  const elevation = input.kind === 'slippery_ice' ? ice?.elevationFeet : input.kind === 'oil' ? oil?.elevationFeet : gear?.surfaceZFeet
  if (!cells.length || elevation === undefined)
    fail('ACTIVE_HAZARD_REQUIRED', 'Choose an actual active burning oil patch, deployed ground device or measured slippery ice on this map. No threat is created by its name.')

  // Every actual oil victim needs its real turn, including hidden local bodies.
  // Explicitly choosing that participant does not set its visible flag.
  const bodies = [state.player, ...Object.values(state.monsters),
    ...Object.values(state.npcs ?? {}).filter(body => !state.monsters[body.id])]
  let selectedVictimCell: {x:number;y:number}|undefined
  for (const body of bodies) {
    if (body.id === 'player' ? state.player.deathSaves?.dead : 'isAlive' in body && body.isAlive === false) continue
    if ('mapId' in body && body.mapId && body.mapId !== state.currentMapId) continue
    for (const patch of Object.values(state.dmTools?.oil?.patches ?? {})) {
      if (patch.mapId !== state.currentMapId || patch.ignitedAt === undefined || patch.ignitedAt > at
        || patch.burnsUntil! <= at || patch.extinguishedAt !== undefined) continue
      const contact = entityGroundContact(state, body.id, patch.cell, patch.elevationFeet)
      if (contact.contact === null) fail('OIL_SURFACE_CONTACT_REQUIRED', 'Resolve the real support of the body touching this oil before selecting initiative.')
      if (!contact.contact) continue
      if (body.id !== 'player' && !state.monsters[body.id] && !isStatBackedNpc(state.npcs?.[body.id]))
        fail('OIL_BODY_PROFILE_REQUIRED', 'The actual affected body needs its real published combat profile; no default statistics are created.')
      if (!combatants.includes(body.id)) fail('OIL_GROUND_ROSTER_REQUIRED', 'Explicitly include every actual body contacting burning oil, without revealing or inventing one.')
      if(input.kind==='oil'&&patch.id===input.hazardId)selectedVictimCell={...patch.cell}
    }
  }

  if(input.approach){
    const possible=validateMagicalHazardApproach(state,input.approach,combatants)
    for(const arrival of possible.arrivals)for(const cell of cells)
      if(entityGroundContact(possible.projection,arrival.id,cell,elevation).contact===true)
        return{...input,mapId:state.currentMapId!,validatedAt:at,hazardCell:{...cell},validatedBy:'reachable_magic_approach',uncertainScrollCheck:possible.uncertainScrollCheck}
    fail('HAZARD_MAGIC_APPROACH_MISSES','The exact chosen magical arrivals do not contact this selected actual hazard. No destination or cast is supplied automatically.')
  }

  if(selectedVictimCell)
    return {...input,mapId:state.currentMapId!,validatedAt:at,hazardCell:selectedVictimCell,validatedBy:'actual_contact'}

  const reachesHazard = (snapshot: GameState, cell: {x:number;y:number}) => ice
    ? slipperyIceAtBody(snapshot, 'player', cell)?.zone?.input.zoneId === ice.input.zoneId
    : entityGroundContact(snapshot, 'player', cell, elevation).contact === true
  for (const cell of cells) {
    if (reachesHazard(state, cell))
      return { ...input, mapId: state.currentMapId!, validatedAt: at, hazardCell: { ...cell },validatedBy:'actual_contact' }
  }
  if (state.player.hp.current <= 0 || state.player.conditions.some(condition =>
    ['incapacitated','paralyzed','petrified','stunned','unconscious'].includes(condition)))
    fail('HAZARD_APPROACH_UNAVAILABLE', 'The actual player cannot approach this remote danger in their current condition.')
  if (navigationActor(state, 'player').speed <= 0)
    fail('ACTOR_IMMOBILE', 'No real movement is available to approach this selected danger.')

  let lastIssue: unknown
  for (const cell of cells) {
    try {
      const path = findNavigationPath(state, 'player', { kind: 'cell', cell }, { geometry: engineGeometry() })
      let projection = state
      for (const next of path.slice(1)) {
        const from = prepareGroundGearStep(projection, 'player', 'walk')
        const projected = projectActualGroundMovement(projection, 'player', next)
        if (projected.issue) fail(projected.issue.code, projected.issue.message)
        projection = projected.state
        const oilIssue = oilGroundContactIssue(projection, 'player')
        if (oilIssue && oilIssue.code !== 'OIL_GROUND_TURNS_REQUIRED') fail(oilIssue.code, oilIssue.message)
        const gearIssue = groundGearMovementIssue(projection, 'player', 'walk', from)
        if (gearIssue && gearIssue.code !== 'GROUND_GEAR_TURNS_REQUIRED' && !(ice && gearIssue.code === 'SLIPPERY_ICE_TURNS_REQUIRED')) fail(gearIssue.code, gearIssue.message)
      }
      if (!reachesHazard(projection, cell))
        fail('HAZARD_GROUND_APPROACH_REQUIRED', 'This actual route does not reach the danger support; flight or another level is not ground contact.')
      return { ...input, mapId: state.currentMapId!, validatedAt: at, hazardCell: { ...cell },validatedBy:'reachable_ground_path' }
    } catch (error) {
      lastIssue = error instanceof NavigationError ? new RuleViolation(error.code,error.message,error.detail) : error
    }
  }
  if (lastIssue) throw lastIssue
  return fail('HAZARD_UNREACHABLE', 'No real physical route reaches the selected danger.')
}

/** Existing active hazards keep physical qualification before any new initiative die. */
export function validateActiveComplexTrapGeometry(state:GameState){for(const trap of Object.values(state.dmTools?.complexTraps??{}))if(trap.status==='active'&&trap.mapId===state.currentMapId)assertComplexPath(trap)}
