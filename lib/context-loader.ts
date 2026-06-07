import fs from 'fs'
import path from 'path'

interface ContextFiles {
  playerCharacter: string   // Fiche de personnage : stats, inventaire, background
  playerRules: string       // Règles D&D côté joueur : actions, capacités de classe
  dmRules: string
  adventureModule: string
}

let cached: ContextFiles | null = null

export function loadContextFiles(): ContextFiles {
  if (cached) return cached

  const contextDir = path.join(process.cwd(), 'context')

  function readOrDefault(filename: string, fallback: string): string {
    const filePath = path.join(contextDir, filename)
    try {
      return fs.readFileSync(filePath, 'utf-8')
    } catch {
      return fallback
    }
  }

  cached = {
    playerCharacter: readOrDefault('player-character.md', DEFAULT_PLAYER_CHARACTER),
    playerRules: readOrDefault('player-rules.md', DEFAULT_PLAYER_RULES),
    dmRules: readOrDefault('dm-rules.md', DEFAULT_DM_RULES),
    adventureModule: readOrDefault('adventure-module.md', DEFAULT_ADVENTURE_MODULE),
  }

  return cached
}

// Invalidate cache (useful for hot-reload in dev)
export function invalidateContextCache(): void {
  cached = null
  cachedParsedModule = null
}

export interface ParsedAdventureModule {
  index: string                  // En-tête + carte + table des transitions + annexes : toujours dans le prompt statique.
  rooms: Record<string, string>  // roomId -> section "## Salle N ..." complète, injectée dynamiquement selon la position.
}

let cachedParsedModule: ParsedAdventureModule | null = null

// Découpe le module d'aventure en un index permanent et des sections par salle.
// Objectif contexte : n'envoyer au LLM que le détail de la salle courante (via le
// bloc dynamique) au lieu des ~8 salles à chaque appel, tout en gardant la carte,
// la table des points d'entrée et les annexes (récompenses, finale, monstres,
// notes) toujours accessibles dans l'index statique mis en cache.
export function parseAdventureModule(moduleText: string): ParsedAdventureModule {
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

export function loadAdventureModuleParsed(): ParsedAdventureModule {
  if (cachedParsedModule) return cachedParsedModule
  cachedParsedModule = parseAdventureModule(loadContextFiles().adventureModule)
  return cachedParsedModule
}

const DEFAULT_PLAYER_CHARACTER = `
# Fiche de Personnage

## Identité
- **Nom** : Héros
- **Classe** : Guerrier
- **Niveau** : 1
- **Background** : Soldat (ex-mercenaire en quête de rédemption)

## Caractéristiques
| Caractéristique | Score | Modificateur |
|----------------|-------|-------------|
| Force (FOR)    | 16    | +3          |
| Dextérité (DEX)| 12    | +1          |
| Constitution (CON) | 14 | +2         |
| Intelligence (INT) | 10 | +0         |
| Sagesse (SAG)  | 12    | +1          |
| Charisme (CHA) | 10    | +0          |

## Défenses
- **Points de Vie** : 20/20
- **Classe d'Armure** : 16 (cotte de mailles + bouclier)
- **Bonus de maîtrise** : +2
- **Vitesse** : 30 pieds (6 cases)

## Jets de sauvegarde maîtrisés
- Force : +5 | Constitution : +4

## Compétences maîtrisées
- Athlétisme (+5), Intimidation (+2), Perception (+3), Histoire (+2)

## Inventaire
- Épée longue (1d8+3 dégâts tranchants)
- Bouclier (+2 CA déjà inclus dans la CA)
- Cotte de mailles
- 2 haches de main (1d6+3, portée 20/60 pieds)
- Pack d'aventurier (corde 15m, 5 torches, rations 5j, grappin)
- Potion de soin ×1 (restaure 2d4+2 PV)
- 10 pièces d'or

## Traits de personnalité
- Droit et direct, peu de patience pour la duplicité
- Protège les innocents, méfiant envers la magie
`.trim()

const DEFAULT_PLAYER_RULES = `
# Règles du Joueur — Guerrier D&D 5e

## Actions disponibles par tour

### Action principale
| Action | Effet |
|--------|-------|
| **Attaque** | 1 jet d'attaque (1d20 + bonus) vs CA cible, puis dégâts |
| **Esquiver** | Attaques contre toi en désavantage ; avantage sur jets DEX |
| **Se désengager** | Déplacement sans provoquer d'attaque d'opportunité |
| **Foncer** | Vitesse doublée ce tour |
| **Aider** | Donne l'avantage à un allié sur 1 attaque ou test |
| **Se cacher** | Test Discrétion (DEX) vs Perception passive des ennemis |
| **Chercher** | Test Perception (SAG) ou Investigation (INT) |
| **Utiliser un objet** | Boire une potion, activer un objet magique |

### Action bonus
| Action | Condition |
|--------|-----------|
| **Deuxième Souffle** | 1/repos court — récupère 1d10+1 PV |

### Réaction
| Action | Déclencheur |
|--------|------------|
| **Attaque d'opportunité** | Un ennemi quitte ton allonge sans se désengager → 1 attaque gratuite |

## Calcul des jets
- **Jet d'attaque** : 1d20 + FOR(+3) + maîtrise(+2) = 1d20+5
- **Dégâts épée longue** : 1d8 + FOR(+3) = 1d8+3
- **Dégâts hache de main** : 1d6 + FOR(+3) = 1d6+3
- **Critique (20 nat.)** : doubler les dés de dégâts (ex : 2d8+3)

## Règles de déplacement
- 30 pieds = 6 cases par tour
- Peut fractionner son déplacement avant/après l'action
- Terrain difficile : coûte 2 cases par case traversée
- Se relever de prone : coûte la moitié de la vitesse
`.trim()

const DEFAULT_DM_RULES = `
# Règles DM — D&D 5e (simplifié)

## Résolution des actions
- Jet d'attaque: 1d20 + bonus d'attaque vs CA cible
- Jet de dégâts: selon arme + modificateur
- Jet de sauvegarde: 1d20 + modificateur de capacité vs DD

## Classes d'Armure typiques
- Paysan/villageois: CA 10
- Gobelin: CA 15
- Hobgobelin: CA 18
- Orc: CA 13
- Squelette: CA 13
- Zombie: CA 8
- Bandit: CA 12
- Loup: CA 13

## XP par type de monstre
- Gobelin: 50 XP
- Bandit: 25 XP
- Squelette: 50 XP
- Loup: 50 XP
- Orc: 100 XP
- Hobgobelin: 100 XP

## Conditions
- À l'agonie (< 25% HP): décrit comme "à l'agonie", "chancelant"
- Gravement blessé (25-50%): "sérieusement blessé", "en mauvaise posture"
- Légèrement blessé (50-75%): "légèrement blessé", "esquive difficilement"
- En forme (> 75%): "paraît vigoureux", "combat avec assurance"

## Difficulté des jets
- Facile: DD 10
- Moyen: DD 12
- Difficile: DD 15
- Très difficile: DD 18
- Presque impossible: DD 20
`.trim()

const DEFAULT_ADVENTURE_MODULE = `
# Module d'Aventure : La Crypte des Ombres Oubliées

## Vue d'ensemble
Une crypte abandonnée sous les ruines d'un manoir noble. Plusieurs salles à explorer, des gobelins se sont installés dans les premières salles, des morts-vivants dans les profondeurs.

## Carte des salles

### Salle A — Entrée (position: x:0-4, y:0-2)
- Description: Hall d'entrée poussiéreux, colonnes brisées
- Contenu: Vide, indices de passage récent (traces de boue)
- Triggers: Première visite → narrer l'ambiance sinistre

### Salle B — Salle des Gardes (position: x:5-9, y:0-2)
- Description: Ancienne salle de garde, torches rouillées aux murs
- Contenu: 2 gobelins en embuscade (Gobelin-1, Gobelin-2)
- Trigger entrée: spawn Gobelin-1 à (6,1) et Gobelin-2 à (8,1), enter_combat
- Trésor: Sac de 15 po, clé rouillée

### Salle C — Couloir des Pièges (position: x:10-14, y:0-2)
- Description: Couloir étroit, dalles suspectes au sol
- Piège: dalle à (12,1) → DEX DD 13 → 1d8 dégâts perforants si raté
- Contenu: Gravures sur les murs (indices sur la salle finale)

### Salle D — Chambre des Morts (position: x:0-4, y:3-5)
- Description: Grande salle avec 4 sarcophages
- Contenu: 2 squelettes qui se lèvent quand on disturbe les sarcophages
- Trigger: Interaction avec sarcophage → spawn 2 Squelettes
- Trésor: Dans le grand sarcophage — épée +1 (1d8+1, bonus +1 aux jets d'attaque)

### Salle E — Salle du Boss (position: x:5-9, y:3-5)
- Description: Salle circulaire avec autel noir
- Contenu: 1 Hobgobelin Capitaine (HP max: 20, AC: 18) + 2 Gobelins
- Trigger victoire: Trésor final — coffre avec 100 po et gemme magique

## Règles du module
- Les portes entre salles nécessitent la clé rouillée (salle B) ou un test de Force DD 15
- Les morts-vivants sont insensibles aux conditions mentales (charm, fright)
- Le Hobgobelin capitaine utilise "Tactiques de commandement" — donne l'avantage à un gobelin adjacent 1/tour
`.trim()
