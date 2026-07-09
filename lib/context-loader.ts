import fs from 'fs'
import path from 'path'
import { DEFAULT_ADVENTURE_ID, isKnownAdventureId } from './adventure-map'
import { DEFAULT_CHARACTER_ID, isKnownCharacterId } from './character-registry'

interface ContextFiles {
  playerCharacter: string   // Fiche de personnage : stats, inventaire, capacités
  playerRules: string       // Règles D&D côté joueur, PAR module : actions, capacités de classe
  dmRules: string           // Règles DM génériques : UNIQUE fichier partagé (adventures/_shared/)
  bestiary: string          // Bestiaire & notes de maîtrise PAR module (reskins, calibrage)
  adventureModule: string   // Module narratif PAR module
}

// Cache par (module, personnage) : la fiche de personnage dépend du personnage,
// le reste du module. Une clé composite évite de mélanger les deux.
const cachedFiles = new Map<string, ContextFiles>()

function adventureDir(adventureId: string): string {
  return path.join(process.cwd(), 'adventures', adventureId)
}

// Règles DM génériques, SEUL contenu partagé entre modules (dm-rules.md).
// Le `_` évite toute collision avec un id de module.
function sharedRulesDir(): string {
  return path.join(process.cwd(), 'adventures', '_shared')
}

// dm-rules.md est l'unique fichier commun : jamais redéfini par module (le
// contenu propre à une aventure — bestiaire, calibrage, mise en scène — vit
// dans son bestiary.md). Verrouillé sans vocabulaire de module par
// tests/no-module-leaks.test.cjs.
function readSharedDmRules(): string {
  const shared = readFileOrNull(sharedRulesDir(), 'dm-rules.md')
  if (shared !== null) return shared
  throw new Error('Fichier de contexte manquant : adventures/_shared/dm-rules.md')
}

function characterDir(characterId: string): string {
  return path.join(process.cwd(), 'characters', characterId)
}

// Fiche de personnage GÉNÉRIQUE (characters/<id>/character-sheet.md), globale à
// toutes les aventures. Personnage connu sans fiche = erreur (jamais de repli
// silencieux sur un autre) ; id inconnu = fail-safe sur le guerrier par défaut.
function readCharacterSheet(characterId: string): string {
  const resolvedId = isKnownCharacterId(characterId) ? characterId : DEFAULT_CHARACTER_ID
  const sheet = readFileOrNull(characterDir(resolvedId), 'character-sheet.md')
  if (sheet !== null) return sheet
  throw new Error(`Fiche de personnage manquante : characters/${resolvedId}/character-sheet.md`)
}

function readFileOrNull(dir: string, filename: string): string | null {
  try {
    return fs.readFileSync(path.join(dir, filename), 'utf-8')
  } catch {
    return null
  }
}

// Chargement d'un fichier de contexte PROPRE au module (adventure-module.md,
// player-rules.md, bestiary.md) : le repli sur le module par défaut n'a lieu
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
    playerCharacter: readCharacterSheet(characterId),
    playerRules: readPerModule(adventureId, 'player-rules.md'),
    dmRules: readSharedDmRules(),
    bestiary: readPerModule(adventureId, 'bestiary.md'),
    adventureModule: readPerModule(adventureId, 'adventure-module.md'),
  }
  cachedFiles.set(cacheKey, files)
  return files
}

// Invalidate caches (useful for hot-reload in dev)
export function invalidateContextCache(): void {
  cachedFiles.clear()
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
// Objectif contexte : n'envoyer au LLM que le détail de la salle courante (via le
// bloc dynamique) au lieu des ~8 salles à chaque appel, tout en gardant la carte,
// la table des points d'entrée et les annexes (récompenses, finale, monstres,
// notes) toujours accessibles dans l'index statique mis en cache.
// Un module multi-maps découpe EN PLUS par "# Carte <mapId> — Titre" : chaque
// section de carte est parsée comme un sous-module (intro + salles), et seule la
// carte courante est envoyée au LLM.
export function parseAdventureModule(moduleText: string): ParsedAdventureModule {
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
