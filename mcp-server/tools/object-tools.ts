import { attackSceneObject,registerObjectWeaponAttackResolutions } from '../object-weapon-attacks'
import { assertGreaterBrewingIdAvailable } from '../toolkit'
import { objectById,releaseContents,objectSnapshot } from '../scene-objects'
import { fireDamageContextIssue } from '../fire-damage-preflight'
import { captureUnderwaterWeaponContext } from '../underwater'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { randomUUID } from 'node:crypto'
import { getAdventureMap, resolveRoomMapId } from '../../lib/adventure-map'
import { ToolkitCellSchema, ToolkitDescriptionSchema, ToolkitIdSchema } from '../../lib/dm-tool-state'
import { SCENE_SUPPLIES, SCENE_SUPPLY_LABELS } from '../../lib/srd/equipment'
import { findWeapon, attackAbilityFor } from '../../lib/srd/weapons'
import { weaponProficiencyBonus } from '../../lib/weapon-proficiency'
import { OBJECT_MATERIAL_AC, ObjectMaterialSchema, ObjectDamageProfileSchema } from '../../lib/object-damage-state'
import { resolveOiledObjectDamage } from '../oil-object-damage'
import { oilFireCapacityIssue } from '../../lib/oil-state'
import { getAbilityModifier, rollDice } from '../dice'
import { rollRuleD20 } from '../roll-rules'
import { registerCheckedResolution, checkedResolution } from '../toolkit-checks'
import { equipmentId, spendObjectInteraction, weaponHeld, duelingApplies, weaponItemHeld, resolvePlayerWeaponUse, weaponAttackRangeCells,selectedWeaponItem,weaponForReference } from '../equipment'
import { magicWeaponBonus } from '../magic-items'
import { playerHeavyWeaponContext, playerLanceWeaponContext,playerFinesseWeaponContext,rollWeaponDamage } from '../weapon-properties'
import { spendAttack } from '../combat-actions'
import { toolkitState, toolkitResult, toolkitError, toolkitLocation, toolkitTransaction, assertToolkitPreparation, assertToolkitReach } from '../toolkit'
import { available, feature, spendHeroAction } from '../hero-rules'
import { captureTwoWeaponWitness, recordTwoWeaponWitness } from '../two-weapon'
import * as rules from '../rules'
import * as gs from '../game-state'

const objectHP = { tiny: [2, 5], small: [3, 10], medium: [4, 18], large: [5, 27] }
const ObjectInput = {
  objectId: ToolkitIdSchema, name: z.string().trim().min(1).max(80), description: ToolkitDescriptionSchema,
  cell: ToolkitCellSchema, kind: z.enum(['container', 'lever', 'obstacle']),
  material: ObjectMaterialSchema, size: z.enum(['tiny', 'small', 'medium', 'large']),
  damageProfile:ObjectDamageProfileSchema.optional().describe('Explicit MJ ruling for this scene object: reason, ineffective damage-type immunities, resistance/vulnerability, one-hit damageThreshold, and ordinary magicalResilience. Poison/psychic immunity always applies. No inferred material weaknesses. Threshold compares damage after resistance/vulnerability (engine interpretation). This does not create a catalog magic item, potion, scroll or artifact.'),
  resilience: z.enum(['fragile', 'resilient']), locked: z.boolean().default(false),
  lockDc: z.number().int().min(5).max(30).optional(), forceDc: z.number().int().min(5).max(30).optional(),
  linkedDoorId: z.string().optional(), contents: z.array(z.enum(SCENE_SUPPLIES)).max(10).default([]),
}
function completeOpening(id: string, action: string, success: boolean) {
  const object = objectById(id)
  if (success) {
    object.locked = false
    if (action === 'force') object.state = 'open'
  }
  return object.state === 'open' ? releaseContents(id) : []
}
export function registerObjectTools(server: McpServer) {
  registerObjectWeaponAttackResolutions()
  registerCheckedResolution('object', (command, check) => {
    const object = objectById(String(command.objectId)), success = check.success === true
    spendHeroAction()
    const items = completeOpening(object.id, String(command.action), success)
    const mechanicalSummary = `${object.name} : ${check.roll.detail} contre DD ${check.dc}, ${success ? 'réussite' : 'échec'} ; état ${object.state}, ${object.locked ? 'verrouillé' : 'déverrouillé'}.`
    gs.addLogEntry({ round: gs.getState().round, turn: 'player', action: String(command.action), mechanicalDetail: mechanicalSummary })
    return toolkitResult({ success, object: objectSnapshot(object.id), check, releasedItems: items, mechanicalSummary })
  })
  server.registerTool('create_scene_object', {
    description: 'Prepare a new uniquely identified container, lever or destructible obstacle outside combat, in an existing active-map room. Uses DMG 2014 material AC and size/resilience average HP. Choose explicit lock/force DCs where relevant; no guessed module contents. Contents may only be selected PHB supply templates. Lever can toggle one explicit authored door on the same map. Identical creation is idempotent; existing module doors/actors/objects cannot be overwritten. This is an explicit MJ authoring decision, not a player discovery.',
    inputSchema: ObjectInput,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async input => toolkitTransaction(() => {
    assertToolkitPreparation()
    const location = toolkitLocation(input.cell), data = toolkitState(), creation = JSON.stringify(input)
    const existing = data.objects[input.objectId]
    if (existing) {
      if (existing.creation === creation) return toolkitResult({ success: true, alreadyCreated: true, object: objectSnapshot(existing.id) })
      toolkitError('OBJECT_ID_CONFLICT', 'This object ID already exists.')
    }
    assertGreaterBrewingIdAvailable(input.objectId)
    input.contents.forEach((_, index) => assertGreaterBrewingIdAvailable(`${input.objectId}:content:${index}`))
    const map = getAdventureMap(gs.getState())
    if (map.doors?.some(door => door.id === input.objectId) || gs.getNpc(input.objectId) || gs.getEntity(input.objectId)) toolkitError('OBJECT_ID_CONFLICT', 'Choose a new ID that does not replace an authored actor or door.')
    if (Object.keys(data.objects).length >= 64) toolkitError('OBJECT_LIMIT_REACHED', 'At most 64 improvised objects per adventure session.')
    if (input.kind !== 'container' && (input.contents.length || input.locked || input.lockDc !== undefined || input.forceDc !== undefined)) toolkitError('OBJECT_CONFIG_INVALID', 'Locks and contents belong to containers.')
    if (input.locked && input.lockDc === undefined) toolkitError('OBJECT_LOCK_DC_REQUIRED', 'Supply the explicit authored lock DC.')
    if (input.linkedDoorId) {
      const door = map.doors?.find(door => door.id === input.linkedDoorId)
      if (input.kind !== 'lever' || !door || door.opening || door.sides.some(side => resolveRoomMapId(side.roomId, gs.getState()) !== location.mapId))
        toolkitError('OBJECT_LINK_INVALID', 'Choose a real operable door on the current map for a lever.')
    }
    if (input.kind === 'obstacle') {
      const span = input.size === 'large' ? 2 : 1
      for (let dy = 0; dy < span; dy++) for (let dx = 0; dx < span; dx++) {
        const cell = { x: input.cell.x + dx, y: input.cell.y + dy }
        const part = toolkitLocation(cell)
        if (part.roomId !== location.roomId) toolkitError('OBJECT_FOOTPRINT_INVALID', 'The whole obstacle must fit inside one room.')
        rules.validateSpawn(cell)
      }
    }
    const hp = objectHP[input.size][input.resilience === 'fragile' ? 0 : 1]
    const { objectId: _objectId, ...definition } = input
    data.objects[input.objectId] = { ...definition, id: input.objectId, ...location, ac: OBJECT_MATERIAL_AC[input.material], hp: { current: hp, max: hp },
      state: input.kind === 'container' ? 'closed' : input.kind === 'lever' ? 'inactive' : 'intact', creation, contentsReleased: false }
    return toolkitResult({ success: true, object: objectSnapshot(input.objectId),
      source: { book: 'dmg-2014', section: 'Statistics for Objects', hpPolicy: 'published average' } })
  }))
  server.registerTool('interact_object', {
    description: 'Resolve one exact prepared object interaction atomically: inspect, open/close a container, activate/deactivate a lever, pick a lock, force a container, or attack it with one exact held weapon and, for ranged ammunition weapons, an explicitly selected real projectile stack. Real source reach/range, Loading, cover, sight, water, wind, actual d20/Inspiration and attack economy apply. Optional eventId retains exact attack retries. Actual adamantine weapon/projectile material makes only a confirmed object hit critical; no material or damage die is inferred. Locks/force use their stored DC and one action; ordinary open/close/toggle use the first free object interaction each turn, then an action. Source HP/AC and weapon damage determine destruction. Armed linked needle traps return an unresolved trigger requiring an explicit interact_trap call by the agent; never narrate opening before success. Revealed contents become exact ground items once, collected through pick_up_item.',
    inputSchema: { objectId: ToolkitIdSchema, action: z.enum(['inspect', 'open', 'close', 'activate', 'deactivate', 'pick_lock', 'force', 'attack']),
      eventId:z.string().min(1).max(180).optional(),attackMode:z.enum(['melee','thrown']).optional(),toolItemId: z.string().optional(), weaponId: z.string().optional(), weaponHands:z.union([z.literal(1),z.literal(2)]).optional(),weaponAbility:z.enum(['str','dex']).optional(),ammunitionItemId:z.string().optional(),newAttackAction:z.boolean().optional(),targetCell:ToolkitCellSchema.optional().describe('Exact exposed face cell for a coplanar weapon attack against one rooted razorvine. Ranged/thrown attacks require a dry measured cardinal or exact45degree ray to the explicitly chosen uniquely first entered face. Whole-hedge corners and unrepresented oblique impacts refuse before cost. Omit for ordinary objects.') },
  }, async input => toolkitTransaction(() => {
    if(input.weaponHands!==undefined&&input.action!=='attack')toolkitError('WEAPON_HANDS_OBJECT_ATTACK_REQUIRED','Choose weaponHands only for an actual object attack.')
    if(input.weaponAbility!==undefined&&input.action!=='attack')toolkitError('FINESSE_OBJECT_ATTACK_REQUIRED','Choose weaponAbility only for an actual attack with a finesse weapon.')
    if(input.action==='attack')return attackSceneObject({eventId:input.eventId??randomUUID(),objectId:input.objectId,weaponId:input.weaponId,...input.attackMode?{attackMode:input.attackMode}:{},...input.ammunitionItemId?{ammunitionItemId:input.ammunitionItemId}:{},...input.weaponHands!==undefined?{weaponHands:input.weaponHands}:{},...input.weaponAbility?{weaponAbility:input.weaponAbility}:{},...input.newAttackAction!==undefined?{newAttackAction:input.newAttackAction}:{},...input.targetCell?{targetCell:input.targetCell}:{}})
    if(input.eventId!==undefined||input.attackMode!==undefined||input.ammunitionItemId!==undefined||input.targetCell!==undefined||input.newAttackAction!==undefined)toolkitError('OBJECT_ATTACK_ARGUMENT_REQUIRED','Choose attack event, mode, ammunition and action identity only for an actual object attack.')
    available()
    const object = objectById(input.objectId)
    const actor = assertToolkitReach(object,'player',1,object.id)
    if (input.action === 'inspect') return toolkitResult({ success: true, object: objectSnapshot(object.id), notice: 'Object description only; hidden traps are not discovered.' })
    if (object.state === 'destroyed') toolkitError('OBJECT_DESTROYED', 'This object is already destroyed.')
    if (['open', 'close', 'pick_lock', 'force'].includes(input.action) && object.kind !== 'container') toolkitError('OBJECT_ACTION_INVALID', 'This interaction needs a container.')
    if (['activate', 'deactivate'].includes(input.action) && object.kind !== 'lever') toolkitError('OBJECT_ACTION_INVALID', 'This interaction needs a lever.')
    const needle = Object.values(toolkitState().traps).find(trap => trap.objectId === object.id && trap.status === 'armed')
    if (input.action === 'open' && object.state === 'open') toolkitError('OBJECT_ALREADY_OPEN', 'This container is already open.')
    if (input.action === 'pick_lock' && !object.locked) toolkitError('OBJECT_NOT_LOCKED', 'This container is already unlocked.')
    if (needle && ['open', 'pick_lock'].includes(input.action)) {
      throw new rules.RuleViolation('SCENE_TRIGGER_PENDING', 'Interaction not resolved. Explicitly choose interact_trap with the stored trap and target, then reevaluate the declared interaction. Confidential MJ event, not a player discovery.',
        { objectId: object.id, pendingTrapId: needle.id })
    }
    if (input.action === 'pick_lock' || input.action === 'force') {
      rules.validateActionUse('player')
      if (!object.locked && input.action === 'pick_lock') toolkitError('OBJECT_NOT_LOCKED', 'This container is already unlocked.')
      if (object.state === 'open') toolkitError('OBJECT_ALREADY_OPEN', 'This container is already open.')
      const dc = input.action === 'force' ? object.forceDc : object.lockDc
      if (dc === undefined) toolkitError('OBJECT_RULE_NOT_AUTHORED', 'No force/lock DC was authored for this object.')
      if (input.action === 'pick_lock') {
        const tool = gs.getPlayer().inventory.find(item => item.id === input.toolItemId)
        if (!tool || equipmentId(tool) !== 'thieves_tools') toolkitError('THIEVES_TOOLS_REQUIRED', 'Select an actually owned thieves tools item.')
        if (!gs.getPlayer().toolProficiencies?.includes('thieves_tools')) toolkitError('TOOL_PROFICIENCY_REQUIRED', 'PHB locks require thieves tools proficiency.')
      }
      return checkedResolution({ ability: input.action === 'force' ? 'str' : 'dex', ...(input.action === 'force' ? { skill: 'athletics' } : { proficient: true }), dc,
        label: `${input.action} — ${object.name}` }, { domain: 'object', command: { objectId: object.id, action: input.action } })
    }
    if (input.action === 'open' && object.locked) toolkitError('OBJECT_LOCKED', 'The stored lock is still closed.')
    const state = input.action === 'open' ? 'open' : input.action === 'close' ? 'closed' : input.action === 'activate' ? 'active' : 'inactive'
    if (object.state === state) toolkitError('OBJECT_ALREADY_IN_STATE', 'The object already has this state.')
    spendObjectInteraction(); object.state = state
    if (object.linkedDoorId) {
      gs.getState().sceneMemory ??= {}
      const doors = { ...(gs.getState().sceneMemory!.doorStates as Record<string, string> ?? {}) }
      if (doors[object.linkedDoorId] !== 'broken') doors[object.linkedDoorId] = state === 'active' ? 'open' : 'closed'
      gs.getState().sceneMemory!.doorStates = doors
    }
    return toolkitResult({ success: true, object: objectSnapshot(object.id), releasedItems: object.state === 'open' ? releaseContents(object.id) : [],
      mechanicalSummary: `${object.name} : état confirmé ${object.state}${object.linkedDoorId ? ` ; porte liée ${object.linkedDoorId}` : ''}.` })
  }))
}
