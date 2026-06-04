import type {
  CanonicalPlayerActionKind,
  EngineEventType,
  PlayerState,
  WorldObjectState,
  WorldQuestState,
  WorldState,
} from './types'

export interface WorldActionEffectDefinition {
  kind: CanonicalPlayerActionKind
  target: 'room' | 'object' | 'npc' | 'inventory_item' | 'quest' | 'self'
  mutatesWorld: boolean
  consumesCombatAction: boolean
  canonicalEvents: EngineEventType[]
}

export const WORLD_ACTION_EFFECTS: Record<string, WorldActionEffectDefinition> = {
  search: {
    kind: 'search',
    target: 'room',
    mutatesWorld: true,
    consumesCombatAction: true,
    canonicalEvents: ['room.object_discovered'],
  },
  open: {
    kind: 'open',
    target: 'object',
    mutatesWorld: true,
    consumesCombatAction: true,
    canonicalEvents: ['door.opened', 'object.opened', 'room.object_discovered'],
  },
  take: {
    kind: 'take',
    target: 'object',
    mutatesWorld: true,
    consumesCombatAction: true,
    canonicalEvents: ['object.taken', 'quest.item_found'],
  },
  read: {
    kind: 'read',
    target: 'object',
    mutatesWorld: false,
    consumesCombatAction: true,
    canonicalEvents: ['clue.read'],
  },
  use_object: {
    kind: 'use_object',
    target: 'object',
    mutatesWorld: true,
    consumesCombatAction: true,
    canonicalEvents: ['object.used', 'trap.triggered', 'alarm.raised'],
  },
  disarm: {
    kind: 'disarm',
    target: 'object',
    mutatesWorld: true,
    consumesCombatAction: true,
    canonicalEvents: ['trap.disarmed', 'trap.triggered'],
  },
  combine_recipe: {
    kind: 'combine_recipe',
    target: 'quest',
    mutatesWorld: true,
    consumesCombatAction: true,
    canonicalEvents: ['quest.completed'],
  },
}

export function worldActionEffectForKind(kind: CanonicalPlayerActionKind): WorldActionEffectDefinition | undefined {
  return WORLD_ACTION_EFFECTS[kind]
}

export function isWorldObjectOpenable(object: Pick<WorldObjectState, 'kind' | 'opened' | 'locked'>): boolean {
  return object.kind === 'door' ||
    object.kind === 'container' ||
    object.opened !== undefined ||
    object.locked !== undefined
}

export function isWorldObjectTakeable(object: Pick<WorldObjectState, 'kind' | 'taken'>): boolean {
  return ['item', 'clue'].includes(object.kind) && object.taken !== true
}

export function isWorldObjectReadable(object: Pick<WorldObjectState, 'readableText' | 'tags'>): boolean {
  return Boolean(object.readableText || object.tags?.includes('readable'))
}

export function isWorldObjectUsable(object: Pick<WorldObjectState, 'kind'>): boolean {
  return ['fixture', 'trap'].includes(object.kind)
}

export function isWorldObjectTrap(object: Pick<WorldObjectState, 'kind' | 'tags'>): boolean {
  return object.kind === 'trap' || Boolean(object.tags?.includes('trap'))
}

export function isWorldObjectDisarmable(object: Pick<WorldObjectState, 'kind' | 'disarmed'>): boolean {
  return object.kind === 'trap' && object.disarmed !== true
}

export function isRecipeAlreadyCombined(world: WorldState | undefined): boolean {
  return Boolean(world?.quests.grammy_recipe?.flags?.recipe_combined || world?.flags?.recipe_combined)
}

export function ownedRecipeHalfIds(world: WorldState | undefined, player: PlayerState): string[] {
  const inventoryIds = new Set(player.inventory.map(item => item.id))
  return Object.values(world?.objects ?? {})
    .filter(object => object.tags?.includes('recipe_half') && (object.taken || inventoryIds.has(object.id)))
    .map(object => object.id)
}

export function canCombineRecipe(world: WorldState | undefined, player: PlayerState): boolean {
  const quest = world?.quests.grammy_recipe
  if (!quest || isRecipeAlreadyCombined(world)) return false
  return quest.progress >= quest.goal || ownedRecipeHalfIds(world, player).length >= quest.goal
}

export function recipeCombinationStatus(
  world: WorldState | undefined,
  player: PlayerState
): {
  quest?: WorldQuestState
  ownedHalfIds: string[]
  alreadyCombined: boolean
  canCombine: boolean
} {
  const quest = world?.quests.grammy_recipe
  const ownedHalfIds = ownedRecipeHalfIds(world, player)
  const alreadyCombined = isRecipeAlreadyCombined(world)
  return {
    quest,
    ownedHalfIds,
    alreadyCombined,
    canCombine: canCombineRecipe(world, player),
  }
}
