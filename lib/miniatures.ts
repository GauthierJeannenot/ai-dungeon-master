// Visual correspondence only: never used by the rules engine or action planner.
import { CREATURE_MINIATURES, NPC_MINIATURES } from '../adventures/grammys-country-apple-pie/miniatures'
import { NPC_MINIATURES as FAIR_NPC_MINIATURES } from '../adventures/fey-shadow-fair/miniatures'
import { NPC_MINIATURES as MANOR_NPC_MINIATURES } from '../adventures/sarah-of-yellowcrest-manor/miniatures'

export type MiniatureId = 'realistic/warrior' | 'realistic/sage' | 'realistic/goblin' | 'realistic/wolf'
  | 'realistic/cleric' | 'realistic/bard' | 'realistic/forest-spirit' | 'realistic/satyr'
  | 'realistic/hobgoblin' | 'realistic/living-tree' | 'realistic/skeleton'
  | 'realistic/ghost-male' | 'realistic/violet-fungus'
  | 'realistic/awakened-shrub' | 'realistic/potted-shrub' | 'realistic/halfling-bard'
  | 'realistic/leprechaun' | 'realistic/goblin-civilian' | 'realistic/candle-halfling'

const heroes: Record<string, MiniatureId> = {
  fighter: 'realistic/warrior', wizard: 'realistic/sage', cleric: 'realistic/cleric', bard: 'realistic/bard',
}
const creatures: Record<string, MiniatureId> = {
  goblin: 'realistic/goblin', wolf: 'realistic/wolf', dire_wolf: 'realistic/wolf',
  knight: 'realistic/warrior', guard: 'realistic/warrior', mage: 'realistic/sage',
  hobgoblin: 'realistic/hobgoblin', satyr: 'realistic/satyr',
  awakened_tree: 'realistic/living-tree', skeleton: 'realistic/skeleton',
  ghost: 'realistic/ghost-male', violet_fungus: 'realistic/violet-fungus',
  awakened_shrub: 'realistic/awakened-shrub',
}
const npcs: Record<string, MiniatureId> = {
  knight: 'realistic/warrior', guard: 'realistic/warrior', mage: 'realistic/sage',
  scholar: 'realistic/sage', hermit: 'realistic/sage',
  awakened_tree: 'realistic/living-tree',
}

export function miniatureForHero(characterId?: string): MiniatureId | undefined {
  return Object.hasOwn(heroes, characterId ?? 'fighter') ? heroes[characterId ?? 'fighter'] : undefined
}
function authoredMiniature(adventureId?: string, actorId?: string): MiniatureId | null | undefined {
  const identities = adventureId === 'fey-shadow-fair' ? FAIR_NPC_MINIATURES
    : adventureId === 'sarah-of-yellowcrest-manor' ? MANOR_NPC_MINIATURES : undefined
  return actorId && identities && Object.hasOwn(identities, actorId) ? identities[actorId] : undefined
}

export function miniatureForCreature(type: string, adventureId?: string, actorId?: string): MiniatureId | undefined {
  const identity = authoredMiniature(adventureId, actorId)
  if (identity !== undefined) return identity ?? undefined
  if (adventureId === 'grammys-country-apple-pie' && Object.hasOwn(CREATURE_MINIATURES, type)) return CREATURE_MINIATURES[type]
  return Object.hasOwn(creatures, type) ? creatures[type] : undefined
}
export function miniatureForNpc(kind?: string, adventureId?: string, npcId?: string): MiniatureId | undefined {
  const identity = authoredMiniature(adventureId, npcId)
  if (identity !== undefined) return identity ?? undefined
  if (kind && adventureId === 'grammys-country-apple-pie' && Object.hasOwn(NPC_MINIATURES, kind)) return NPC_MINIATURES[kind]
  return kind && Object.hasOwn(npcs, kind) ? npcs[kind] : undefined
}
