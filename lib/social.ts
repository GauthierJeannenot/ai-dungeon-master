import { z } from 'zod'
import { getAdventureMap, getMapSpec, inferRoomIdOnMap, resolveRoomMapId, type GridCell } from './adventure-map'
import { encounterActorId, encounterAwareness } from './encounter-awareness'
import type { GameState } from './types'

export const SOCIAL_RANDOM_FIELDS = ['ideals', 'bonds', 'traits', 'likedTopics', 'tabooTopics'] as const
const SocialTextsSchema = z.array(z.string().min(1)).min(1)
export const SocialPersonalitySchema = z.object({
  ideals: SocialTextsSchema.optional(), bonds: SocialTextsSchema.optional(), traits: SocialTextsSchema.optional(),
  likedTopics: SocialTextsSchema.optional(), tabooTopics: SocialTextsSchema.optional(),
})
export type SocialPersonality = z.infer<typeof SocialPersonalitySchema>

// Campaign rules, distinct from SRD creature types and quest dispositions.
export const SocialLoreSchema = z.object({
  id: z.string().min(1), name: z.string().min(1),
  sourceStatus: z.enum(['source-backed', 'generic-role', 'adaptation-only']),
  provider: z.literal('5etools'), ruleset: z.literal('2014'), revision: z.string(), chapterUrl: z.string(),
  subjects: z.array(z.object({ id: z.string(), name: z.string() })),
  sources: z.array(z.object({ file: z.string(), url: z.string(), sha256: z.string() })),
  passages: z.array(z.object({ id: z.string(), sectionId: z.string(), title: z.string(),
    page: z.number().optional(), text: z.string(),
    category: z.enum(['campaign', 'named-bestiary', 'archetype']),
    archetype: z.string().optional(), sourceFile: z.string(),
  })),
  sourcePersonality: z.object({ traits: SocialTextsSchema.optional(), ideals: SocialTextsSchema.optional(),
    bonds: SocialTextsSchema.optional(), flaws: SocialTextsSchema.optional() }).optional(),
  portraits: z.array(z.object({ title: z.string(), credit: z.string(), url: z.string() })),
  adaptationNotes: z.array(z.string()),
})
export type SocialLore = z.infer<typeof SocialLoreSchema>

export const SocialProfileSchema = z.object({
  lore: SocialLoreSchema.optional(),
  influenceable: z.boolean(),
  refusalReason: z.string().optional(),
  goals: z.array(z.string().min(1)),
  likedTopics: z.array(z.string().min(1)),
  tabooTopics: z.array(z.string().min(1)),
  personality: z.object({ ideals: SocialTextsSchema, bonds: SocialTextsSchema, traits: SocialTextsSchema,
    flaws: SocialTextsSchema.optional() }).optional(),
  randomize: z.partialRecord(z.enum(SOCIAL_RANDOM_FIELDS), z.string().min(1)).optional(),
  randomizeMode: z.enum(['replace', 'append']).optional(),
})
export type SocialProfile = z.infer<typeof SocialProfileSchema>
export interface AdventureSocialData {
  // Original campaign tables, not copied or presented as official source tables.
  tables?: Record<string, { description: string; entries: string[] }>
  npcDefault: SocialProfile
  monsterDefault: SocialProfile
  npcs: Record<string, SocialProfile>
  monsterTypes: Record<string, SocialProfile>
}

export interface SocialActor {
  monsterType?: string
  targetId: string
  relationshipId: string
  name: string
  profile: SocialProfile
  position: GridCell
  mapId: string
  roomId: string | null
  alive: boolean
}

const fallback = (): SocialProfile => ({ influenceable: true,
  goals: ['Préserver sa sécurité'], likedTopics: [], tabooTopics: [] })

// Pure lookup: never selects a target from player prose or updates saved state.
export function socialActors(state: GameState): SocialActor[] {
  const data = getAdventureMap(state), social = data.social
  const mapId = getMapSpec(state.currentMapId, state).id
  const result: SocialActor[] = []
  const encounterProfiles = new Map(Object.values(data.encounters).flatMap(encounter =>
    encounter.monsters.map((_, index) => [encounterActorId(encounter.id, index), encounter.socialProfile] as const)))
  const add = (actor: SocialActor) => {
    const profile = structuredClone(actor.profile)
    const drawn = state.socialPersonalities?.[actor.relationshipId]
    if (profile.randomize && drawn) {
      for (const field of SOCIAL_RANDOM_FIELDS) {
        if (!profile.randomize[field] || !drawn[field]) continue
        const combine = (fixed: string[]) => profile.randomizeMode === 'append'
          ? [...new Set([...fixed, ...drawn[field]!])] : [...drawn[field]!]
        if (field === 'likedTopics' || field === 'tabooTopics') profile[field] = combine(profile[field])
        else {
          profile.personality ??= { ideals: [], bonds: [], traits: [] }
          profile.personality[field] = combine(profile.personality[field])
        }
      }
    }
    result.push({ ...actor, profile })
  }
  for (const npc of Object.values(state.npcs ?? {})) {
    const spec = data.npcs.find(spec => spec.id === npc.id)
    add({ targetId: npc.id, relationshipId: spec?.socialIdentity ?? npc.id, name: npc.name,
      monsterType: npc.type ?? spec?.statBlock ?? spec?.reactive?.combatTemplate,
      profile: social?.npcs[npc.id] ?? social?.npcDefault ?? fallback(),
      position: state.monsters[npc.id]?.position ?? npc.position,
      mapId: npc.mapId ?? resolveRoomMapId(npc.roomId, state) ?? data.maps[0].id,
      roomId: npc.roomId, alive: state.monsters[npc.id]?.isAlive ?? (npc.hp?.current ?? 1) > 0 })
  }
  for (const monster of Object.values(state.monsters)) {
    if (state.npcs?.[monster.id]) continue // One relationship for a reactive NPC's two representations.
    add({ targetId: monster.id, relationshipId: monster.socialIdentity ?? monster.id, name: monster.name,
      monsterType: monster.type,
      profile: (monster.socialIdentity ? encounterProfiles.get(monster.socialIdentity) : undefined)
        ?? social?.monsterTypes[monster.type] ?? social?.monsterDefault ?? fallback(),
      position: monster.position, mapId, roomId: inferRoomIdOnMap(monster.position, mapId, state),
      alive: monster.isAlive && monster.hp.current > 0 })
  }
  for (const encounter of Object.values(data.encounters)) {
    if (state.encountersTriggered?.includes(encounter.id)) continue
    encounter.monsters.forEach((monster, index) => {
      const targetId = encounterActorId(encounter.id, index)
      if (result.some(actor => actor.relationshipId === targetId)) return
      const position = encounterAwareness(state)[encounter.id]?.positions[index] ?? monster.cell
      const actorMap = resolveRoomMapId(encounter.roomId, state) ?? data.maps[0].id
      add({ targetId, relationshipId: targetId, name: monster.name ?? monster.monsterType,
        monsterType: monster.monsterType,
        profile: encounter.socialProfile ?? social?.monsterTypes[monster.monsterType] ?? social?.monsterDefault ?? fallback(),
        position, mapId: actorMap, roomId: inferRoomIdOnMap(position, actorMap, state), alive: true })
    })
  }
  return result
}

// Campaign preparation, independent of gameplay dice. A persisted random seed
// gives each actor/field a stable draw without consuming the next attack/check.
function personalityIndex(seed: string, identity: string, field: string, size: number): number {
  let hash = 2166136261
  for (const char of JSON.stringify([seed, identity, field])) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619)
  hash = Math.imul(hash ^ (hash >>> 16), 2246822507)
  hash = Math.imul(hash ^ (hash >>> 13), 3266489909)
  return ((hash ^ (hash >>> 16)) >>> 0) % size
}

export function initializeSocialPersonalities(state: GameState, fallbackSeed: string): GameState {
  const actors = socialActors(state).filter(actor => Object.keys(actor.profile.randomize ?? {}).length)
  if (!actors.length) return state
  const tables = getAdventureMap(state).social?.tables ?? {}
  state.socialProfileSeed ??= fallbackSeed
  state.socialPersonalities ??= {}
  for (const actor of actors) {
    const existing = state.socialPersonalities[actor.relationshipId] ?? {}
    const personality = structuredClone(existing)
    for (const field of SOCIAL_RANDOM_FIELDS) {
      const tableId = actor.profile.randomize?.[field]
      if (!tableId || personality[field]) continue
      const table = tables[tableId]
      if (!table?.entries.length || table.entries.some(entry => !entry.trim()))
        throw new Error(`Invalid campaign social table: ${tableId}`)
      personality[field] = [table.entries[personalityIndex(state.socialProfileSeed, actor.relationshipId, field, table.entries.length)]]
    }
    state.socialPersonalities[actor.relationshipId] = personality
  }
  return state
}

