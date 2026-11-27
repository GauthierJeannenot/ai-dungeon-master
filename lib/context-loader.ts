import fs from 'fs'
import path from 'path'
import { SocialLoreSchema, type SocialActor, type SocialLore, type SocialProfile } from './social'
import { DEFAULT_ADVENTURE_ID, isKnownAdventureId, getAdventureMap } from './adventure-map'
import { DEFAULT_CHARACTER_ID, isKnownCharacterId } from './character-registry'

interface ContextFiles {
  playerCharacter: string   // Fiche de personnage : stats, inventaire, capacités
  playerRules: string       // Socle joueur partagé + complément facultatif du module
  dmRules: string           // Règles DM génériques partagées (adventures/_shared/)
  bestiary: string          // Bestiaire & notes de maîtrise PAR module (reskins, calibrage)
  adventureModule: string   // Module narratif PAR module
}

// Cache par (module, personnage) : la fiche de personnage dépend du personnage,
// le complément joueur dépend du module. Une clé composite évite de mélanger les deux.
const cachedFiles = new Map<string, ContextFiles>()
const cachedBestiaryPrompts = new Map<string, string>()
const cachedBestiaryManifests = new Map<string, BestiaryManifest>()
interface NpcLoreCatalog {
  version: number
  bindings: { npcs: Record<string, string[]>; monsterTypes: Record<string, string[]> }
  profiles: Record<string, Omit<SocialLore, 'id'>>
}
const cachedNpcLore = new Map<string, NpcLoreCatalog | null>()
const cachedNpcLoreProfiles = new Map<string, SocialLore>()

// Server-only content lookup. Narrative dossiers never enter map.ts, the client
// bundle, or mechanical state. Call only after the existing positional filter.
export function enrichLocalSocialProfile(adventureId: string | undefined, actor: SocialActor): SocialProfile {
  const id = isKnownAdventureId(adventureId) ? adventureId! : DEFAULT_ADVENTURE_ID
  if (!cachedNpcLore.has(id)) {
    const text = readFileOrNull(adventureDir(id), 'npc-lore.json')
    const catalog = text === null ? null : JSON.parse(text) as NpcLoreCatalog
    if (catalog && (catalog.version !== 1 || !catalog.bindings || !catalog.profiles))
      throw new Error(`Invalid NPC narrative catalog: ${id}`)
    cachedNpcLore.set(id, catalog)
  }
  const catalog = cachedNpcLore.get(id)
  if (!catalog) return actor.profile
  const keys = catalog.bindings.npcs[actor.targetId] ?? catalog.bindings.npcs[actor.relationshipId]
    ?? (actor.monsterType ? catalog.bindings.monsterTypes[actor.monsterType] : undefined)
  if (!keys?.length) return actor.profile
  const cacheKey = `${id}:${JSON.stringify(keys)}`
  let lore = cachedNpcLoreProfiles.get(cacheKey)
  if (!lore) {
    const dossiers = keys.map(key => {
      const dossier = catalog.profiles[key]
      if (!dossier) throw new Error(`Missing NPC narrative profile: ${id}/${key}`)
      return SocialLoreSchema.parse({ ...dossier, id: key })
    })
    const unique = <T>(items: T[], key: (item: T) => string): T[] => [...new Map(items.map(item => [key(item), item])).values()]
    const personality: NonNullable<SocialLore['sourcePersonality']> = {}
    for (const dossier of dossiers) for (const field of ['traits', 'ideals', 'bonds', 'flaws'] as const) {
      const values = dossier.sourcePersonality?.[field]
      if (values?.length) personality[field] = [...new Set([...(personality[field] ?? []), ...values])]
    }
    lore = SocialLoreSchema.parse({ ...dossiers[0], id: cacheKey,
      name: dossiers.map(dossier => dossier.name).join(' ; '),
      subjects: unique(dossiers.flatMap(dossier => dossier.subjects), subject => subject.id),
      sources: unique(dossiers.flatMap(dossier => dossier.sources), source => `${source.file}:${source.sha256}`),
      passages: unique(dossiers.flatMap(dossier => dossier.passages), passage => `${passage.sourceFile}:${passage.id}`),
      portraits: unique(dossiers.flatMap(dossier => dossier.portraits), portrait => portrait.url),
      adaptationNotes: [...new Set(dossiers.flatMap(dossier => dossier.adaptationNotes))],
      ...(Object.keys(personality).length ? { sourcePersonality: personality } : {}),
    })
    cachedNpcLoreProfiles.set(cacheKey, lore)
  }
  const source = lore.sourcePersonality
  const profile: SocialProfile = { ...actor.profile, lore }
  if (source) {
    const base = actor.profile.personality ?? { ideals: [], bonds: [], traits: [] }
    profile.personality = { ...base,
      ideals: [...new Set([...base.ideals, ...(source.ideals ?? [])])],
      bonds: [...new Set([...base.bonds, ...(source.bonds ?? [])])],
      traits: [...new Set([...base.traits, ...(source.traits ?? [])])],
      ...(source.flaws?.length ? { flaws: [...new Set([...(base.flaws ?? []), ...source.flaws])] } : {}),
    }
  }
  return profile
}

interface BestiaryManifest {
  title: string
  notes: string[]
  creatures: Array<{ type: string; title: string; role?: string; notes?: string[]; npcIds?: string[] }>
  narrativeNpcs?: string[]
}

function adventureDir(adventureId: string): string {
  return path.join(process.cwd(), 'adventures', adventureId)
}

// Socles génériques obligatoires, sans vocabulaire propre à une aventure.
function sharedRulesDir(): string {
  return path.join(process.cwd(), 'adventures', '_shared')
}

function readSharedRules(filename: string): string {
  const shared = readFileOrNull(sharedRulesDir(), filename)
  if (shared !== null) return shared
  throw new Error(`Fichier de contexte manquant : adventures/_shared/${filename}`)
}

function readPlayerRules(adventureId: string): string {
  const shared = readSharedRules('player-rules.md')
  const resolvedId = isKnownAdventureId(adventureId) ? adventureId : DEFAULT_ADVENTURE_ID
  const supplement = readFileOrNull(adventureDir(resolvedId), 'player-rules.md')
  return supplement?.trim() ? `${shared.trimEnd()}\n\n${supplement.trim()}\n` : shared
}

function characterDir(characterId: string): string {
  return path.join(process.cwd(), 'characters', characterId)
}

// Fiche de personnage GÉNÉRIQUE (characters/<id>/character-sheet.md), globale à
// toutes les aventures. Personnage connu sans fiche = erreur (jamais de repli
// silencieux sur un autre) ; id inconnu = fail-safe sur le guerrier par défaut.
function readCharacterSheet(characterId: string, level?: number): string {
  const resolvedId = isKnownCharacterId(characterId) ? characterId : DEFAULT_CHARACTER_ID
  const filename = level === 7 ? 'character-sheet-level7.md'
    : level === 3 ? 'character-sheet-level3.md' : 'character-sheet.md'
  const sheet = readFileOrNull(characterDir(resolvedId), filename)
  if (sheet !== null) return sheet
  throw new Error(`Fiche de personnage manquante : characters/${resolvedId}/${filename}`)
}

function readFileOrNull(dir: string, filename: string): string | null {
  try {
    return fs.readFileSync(path.join(dir, filename), 'utf-8')
  } catch {
    return null
  }
}

// Chargement d'un fichier de contexte PROPRE au module (adventure-module.md,
// bestiary.md) : le repli sur le module par défaut n'a lieu
// QUE si l'id est inconnu du registre (fail-safe). Un module CONNU qui n'a pas
// son propre fichier est une erreur — jamais servir en silence le contenu
// d'une autre aventure.
function readPerModule(adventureId: string, filename: string): string {
  const own = readFileOrNull(adventureDir(adventureId), filename)
  if (own !== null) return own

  if (!isKnownAdventureId(adventureId)) {
    const fallback = readFileOrNull(adventureDir(DEFAULT_ADVENTURE_ID), filename)
    if (fallback !== null) return fallback
  }

  throw new Error(`Fichier de contexte manquant : adventures/${adventureId}/${filename}`)
}

export function loadContextFiles(
  adventureId: string = DEFAULT_ADVENTURE_ID,
  characterId: string = DEFAULT_CHARACTER_ID
): ContextFiles {
  const cacheKey = `${adventureId}::${characterId}`
  const existing = cachedFiles.get(cacheKey)
  if (existing) return existing

  const files: ContextFiles = {
    // Fiche = personnage GÉNÉRIQUE (globale) ; l'accroche narrative propre au
    // couple aventure×personnage est ajoutée par prompts.ts (characterHooks).
    playerCharacter: readCharacterSheet(characterId, getAdventureMap(adventureId).initialPlayer.level),
    playerRules: readPlayerRules(adventureId),
    dmRules: readSharedRules('dm-rules.md'),
    bestiary: readPerModule(adventureId, 'bestiary.md'),
    adventureModule: readPerModule(adventureId, 'adventure-module.md'),
  }
  cachedFiles.set(cacheKey, files)
  return files
}

// Sans sélection : référence documentaire complète. Les prompts de jeu passent
// toujours les types/PNJ locaux, sans casting ni placements globaux. Les blocs
// SRD volumineux restent consultables explicitement via MCP.
export function loadBestiaryPrompt(adventureId: string = DEFAULT_ADVENTURE_ID, localTypes?: Iterable<string>, npcIds: string[] = []): string {
  const resolvedId = isKnownAdventureId(adventureId) ? adventureId : DEFAULT_ADVENTURE_ID
  const cached = cachedBestiaryPrompts.get(resolvedId)
  if (localTypes === undefined && cached !== undefined) return cached
  let manifest = cachedBestiaryManifests.get(resolvedId)
  if (!manifest) {
    const source = readFileOrNull(adventureDir(resolvedId), 'bestiary.json')
    if (source === null) {
      if (localTypes !== undefined) throw new Error(`Bestiaire structuré manquant : adventures/${resolvedId}/bestiary.json`)
      return readPerModule(resolvedId, 'bestiary.md')
    }
    manifest = JSON.parse(source) as BestiaryManifest
    cachedBestiaryManifests.set(resolvedId, manifest)
  }
  if (localTypes !== undefined) {
    const types = new Set(localTypes)
    // Roles, titles and general notes can enumerate remote casts/rooms. Local
    // identities come from the engine; keep only their species guidance here.
    const creatures = manifest.creatures.filter(creature => types.has(creature.type)
      || creature.npcIds?.some(id => npcIds.includes(id)))
    return creatures.map(creature => [`### Type moteur ${JSON.stringify(creature.type)}`,
      ...(creature.notes ?? [])].join('\n\n')).join('\n\n')
  }
  const prompt = [
    `# ${manifest.title}`,
    'Les statistiques SRD détaillées sont disponibles via `get_monster_stat_block({monsterType})` ou `get_monster_stat_block({monsterId})` (un seul sélecteur). Consulte cet outil si nécessaire avant de choisir une action de créature. Sa couverture `engineSupport` fait autorité : un trait décrit ne constitue jamais un effet résolu. Les jets, coûts et effets doivent passer par leurs outils MCP.',
    ...manifest.notes,
    ...manifest.creatures.map(creature => [
      `### ${creature.title} — type moteur ${JSON.stringify(creature.type)}`,
      ...(creature.role ? [creature.role] : []),
      ...(creature.notes ?? []),
    ].join('\n\n')),
    ...(manifest.narrativeNpcs?.length
      ? ['## PNJ — notes d’incarnation', ...manifest.narrativeNpcs] : []),
  ].join('\n\n')
  cachedBestiaryPrompts.set(resolvedId, prompt)
  return prompt
}

// Invalidate caches (useful for hot-reload in dev)
export function invalidateContextCache(): void {
  cachedNpcLore.clear()
  cachedNpcLoreProfiles.clear()
  cachedFiles.clear()
  cachedBestiaryPrompts.clear()
  cachedBestiaryManifests.clear()
  cachedParsedModule.clear()
}

export interface ParsedAdventureModule {
  index: string                  // En-tête + carte + table des transitions + annexes : toujours dans le prompt statique.
  rooms: Record<string, string>  // roomId -> section "## Salle N ..." complète, injectée dynamiquement selon la position.
  // Modules MULTI-MAPS (en-têtes "# Carte <mapId> — Titre") : intro de chaque
  // carte (synopsis, table des points d'entrée, sortie), injectée DYNAMIQUEMENT
  // quand la carte devient courante — l'index statique ne garde que le
  // préambule global. Vide pour un module 1-map (comportement historique).
  mapIntros: Record<string, string>
}

const cachedParsedModule = new Map<string, ParsedAdventureModule>()

// Découpe le module d'aventure en un index permanent et des sections par salle.
// Objectif contexte : sélectionner la salle courante et ses voisines tactiques
// dans le bloc dynamique, au lieu de toutes les salles à chaque appel, en gardant la carte,
// la table des points d'entrée et les annexes (récompenses, finale,
// notes) toujours accessibles dans l'index statique mis en cache.
// Un module multi-maps découpe EN PLUS par "# Carte <mapId> — Titre" : chaque
// section de carte est parsée comme un sous-module (intro + salles), et seule la
// carte courante est envoyée au LLM.
export function parseAdventureModule(moduleText: string): ParsedAdventureModule {
  // Dedicated roster annexes would bypass the dynamic local bestiary. This is
  // document parsing, never player-message interpretation.
  moduleText = moduleText.replace(/^## (?:Bestiaire\b|Récapitulatif des monstres\b)[^\n]*\n[\s\S]*?(?=^#{1,2} |$(?![\s\S]))/gmi, '')
  const mapHeaderRegex = /^# Carte\s+(\S+)[^\n]*$/gm
  const mapMatches: { mapId: string; start: number }[] = []
  let mapMatch: RegExpExecArray | null
  while ((mapMatch = mapHeaderRegex.exec(moduleText)) !== null) {
    mapMatches.push({ mapId: mapMatch[1], start: mapMatch.index })
  }

  if (mapMatches.length === 0) {
    return { ...parseSingleMapSection(moduleText), mapIntros: {} }
  }

  const preamble = moduleText.slice(0, mapMatches[0].start).trim()
  const rooms: Record<string, string> = {}
  const mapIntros: Record<string, string> = {}
  for (let i = 0; i < mapMatches.length; i++) {
    const end = i + 1 < mapMatches.length ? mapMatches[i + 1].start : moduleText.length
    const section = moduleText.slice(mapMatches[i].start, end)
    const parsed = parseSingleMapSection(section)
    mapIntros[mapMatches[i].mapId] = parsed.index
    Object.assign(rooms, parsed.rooms)
  }
  return { index: preamble, rooms, mapIntros }
}

function parseSingleMapSection(moduleText: string): { index: string; rooms: Record<string, string> } {
  const roomHeaderRegex = /^## Salle\s+(\d+)\b/gm
  const roomMatches: { id: string; start: number }[] = []
  let match: RegExpExecArray | null
  while ((match = roomHeaderRegex.exec(moduleText)) !== null) {
    roomMatches.push({ id: match[1], start: match.index })
  }

  // Aucune section de salle reconnue (module au format différent / fallback) :
  // on garde le module entier dans l'index — comportement historique, sûr.
  if (roomMatches.length === 0) {
    return { index: moduleText.trim(), rooms: {} }
  }

  // Position de TOUS les en-têtes de niveau 2, pour délimiter chaque section
  // (y compris le début des annexes situées après la dernière salle).
  const anyHeaderRegex = /^## .+$/gm
  const headerStarts: number[] = []
  let header: RegExpExecArray | null
  while ((header = anyHeaderRegex.exec(moduleText)) !== null) {
    headerStarts.push(header.index)
  }

  const preIndex = moduleText.slice(0, roomMatches[0].start)

  const rooms: Record<string, string> = {}
  for (const room of roomMatches) {
    const nextHeaderStart = headerStarts.find(pos => pos > room.start)
    rooms[room.id] = moduleText.slice(room.start, nextHeaderStart ?? moduleText.length).trim()
  }

  // Annexes = tout ce qui suit le dernier en-tête de salle. Conservé dans l'index.
  const lastRoomStart = roomMatches[roomMatches.length - 1].start
  const appendixStart = headerStarts.find(pos => pos > lastRoomStart)
  const postIndex = appendixStart != null ? moduleText.slice(appendixStart) : ''

  const index = [preIndex.trim(), postIndex.trim()].filter(Boolean).join('\n\n')
  return { index, rooms }
}

export function loadAdventureModuleParsed(adventureId: string = DEFAULT_ADVENTURE_ID): ParsedAdventureModule {
  const existing = cachedParsedModule.get(adventureId)
  if (existing) return existing
  const parsed = parseAdventureModule(loadContextFiles(adventureId).adventureModule)
  cachedParsedModule.set(adventureId, parsed)
  return parsed
}
