import type { EntityStats, Condition } from '../types'

// ─────────────────────────────────────────────────────────────────────────────
// Registre de sorts SRD 5 à effets FERMÉS — le moteur sait résoudre chaque
// variante d'effet. On étend par ajout de variantes/sorts, jamais par du flou.
// Importable par le serveur MCP : rien d'app-only.
//
// Exclusions v1 assumées : concentration, réactions, zones multi-cibles (une
// seule cible par lancer), rituels. Voir docs/playable-characters.md.
// ─────────────────────────────────────────────────────────────────────────────

export type SpellEffect =
  // Jet d'attaque magique vs CA (ex. rayon de givre).
  | { kind: 'attack_roll'; damage: string }
  // La cible fait une sauvegarde ; dégâts pleins ou moitié (ex. mains brûlantes).
  | { kind: 'save'; ability: keyof EntityStats; damage: string; halfOnSave: boolean }
  // Touche automatique : projectile magique = '3d4+3' (3 dards agrégés, cible unique).
  | { kind: 'auto_hit'; damage: string }
  // Soin (ex. soins). amount = notation, le mod d'aptitude est ajouté si +MOD présent.
  | { kind: 'heal'; amount: string }
  // Applique une condition avec sauvegarde (v2 si besoin).
  | { kind: 'condition'; condition: Condition; ability: keyof EntityStats }
  // Sort UTILITAIRE sans résolution mécanique : le moteur débite le COÛT
  // (connaissance, action, emplacement) et le LLM narre dans les bornes de
  // srdNote. `fact` (optionnel) : trace mémorielle enregistrée par le moteur
  // dans GameState.worldFacts, injectée au prompt tant qu'elle vit.
  | { kind: 'utility'; srdNote: string; fact?: { text: string; expires: 'room' | 'map' } }

export interface SpellSpec {
  id: string
  label: string
  level: 0 | 1              // 0 = tour de magie (sans emplacement)
  rangeCells: number
  target: 'enemy' | 'self' | 'any'
  effect: SpellEffect
}

const SPELLS: SpellSpec[] = [
  // ── Tours de magie (niveau 0) ──────────────────────────────────────────────
  {
    id: 'ray-of-frost', label: 'Rayon de givre', level: 0, rangeCells: 12, target: 'enemy',
    effect: { kind: 'attack_roll', damage: '1d8' },
  },
  {
    id: 'sacred-flame', label: 'Flamme sacrée', level: 0, rangeCells: 12, target: 'enemy',
    effect: { kind: 'save', ability: 'dex', damage: '1d8', halfOnSave: false },
  },
  {
    id: 'light', label: 'Lumière', level: 0, rangeCells: 0, target: 'self',
    effect: {
      kind: 'utility',
      srdNote: "Fait luire un objet (rayon ~6 m de lumière vive) pendant 1 h, ou éteint une lumière ; pas de dégât.",
      fact: { text: 'Un objet du héros émet une lumière vive (sort Lumière).', expires: 'map' },
    },
  },
  {
    id: 'thaumaturgy', label: 'Thaumaturgie', level: 0, rangeCells: 6, target: 'any',
    effect: {
      kind: 'utility',
      srdNote: 'Menue manifestation de pouvoir divin : voix tonnante, tremblement bref, flammes qui vacillent — effet sensoriel, aucun dégât ni contrainte mécanique.',
    },
  },

  // ── Sorts de niveau 1 ───────────────────────────────────────────────────────
  {
    id: 'magic-missile', label: 'Projectile magique', level: 1, rangeCells: 24, target: 'enemy',
    effect: { kind: 'auto_hit', damage: '3d4+3' },
  },
  {
    id: 'burning-hands', label: 'Mains brûlantes', level: 1, rangeCells: 3, target: 'enemy',
    effect: { kind: 'save', ability: 'dex', damage: '3d6', halfOnSave: true },
  },
  {
    id: 'cure-wounds', label: 'Soins', level: 1, rangeCells: 1, target: 'any',
    // +MOD signale au moteur d'ajouter le mod d'aptitude d'incantation.
    effect: { kind: 'heal', amount: '1d8+MOD' },
  },
  {
    id: 'guiding-bolt', label: 'Éclair traçant', level: 1, rangeCells: 24, target: 'enemy',
    // Rider SRD (avantage à l'attaquant suivant) hors périmètre v1 : dégâts seuls.
    effect: { kind: 'attack_roll', damage: '4d6' },
  },
  {
    id: 'create-water', label: "Création d'eau", level: 1, rangeCells: 6, target: 'any',
    effect: {
      kind: 'utility',
      srdNote: "Crée jusqu'à ~40 L d'eau propre dans un récipient ou en pluie sur un cube de 9 m, OU éteint des flammes sur un cube de 9 m. Pas de dégât, pas de noyade.",
      fact: { text: "De l'eau a été créée sur place (sort Création d'eau).", expires: 'room' },
    },
  },
]

const SPELLS_BY_ID = new Map(SPELLS.map(s => [s.id, s]))

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, '')
}

export function getSpell(id: string): SpellSpec | undefined {
  return SPELLS_BY_ID.get(id)
}

export function isKnownSpellId(id: string): boolean {
  return SPELLS_BY_ID.has(id)
}

// Résout un sort depuis son id ou un nom libre (label normalisé ou inclusion).
export function resolveSpell(text: string | undefined | null): SpellSpec | undefined {
  if (!text) return undefined
  const key = normalize(text)
  const byId = SPELLS_BY_ID.get(key)
  if (byId) return byId
  const byLabel = SPELLS.find(s => normalize(s.label) === key)
  if (byLabel) return byLabel
  return SPELLS.find(s => key.includes(normalize(s.label)))
}

export function listSpells(): SpellSpec[] {
  return SPELLS
}
