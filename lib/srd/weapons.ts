import type { EntityStats } from '../types'

// ─────────────────────────────────────────────────────────────────────────────
// Registre d'armes SRD 5 — SOURCE DE VÉRITÉ UNIQUE des dégâts et de la portée
// des armes. Remplace les tables dupliquées WEAPON_DAMAGE (combat-tools.ts) et
// ATTACK_RANGE_CELLS (rules.ts) du moteur.
//
// Importable par le serveur MCP : RIEN d'app-only ici (pas de fs, pas de next,
// pas de logger). Voir lib/CLAUDE.md.
// ─────────────────────────────────────────────────────────────────────────────

export type WeaponProperty = 'finesse' | 'ranged' | 'light' | 'twoHanded' | 'thrown'

export interface WeaponSpec {
  // Clé normalisée (anglais, sans espaces) : 'longsword', 'shortbow'…
  id: string
  // Libellé FR — sert aussi au matching d'un item d'inventaire vers son arme.
  label: string
  // Dé de dégâts SANS modificateur : le moteur ajoute le mod d'aptitude.
  damageDie: string
  // Portée en cases : 1 = mêlée ; >1 = distance.
  rangeCells: number
  properties: WeaponProperty[]
}

const WEAPONS: WeaponSpec[] = [
  { id: 'longsword', label: 'Épée longue', damageDie: '1d8', rangeCells: 1, properties: [] },
  { id: 'shortsword', label: 'Épée courte', damageDie: '1d6', rangeCells: 1, properties: ['finesse', 'light'] },
  { id: 'rapier', label: 'Rapière', damageDie: '1d8', rangeCells: 1, properties: ['finesse'] },
  { id: 'dagger', label: 'Dague', damageDie: '1d4', rangeCells: 4, properties: ['finesse', 'light', 'thrown'] },
  { id: 'handaxe', label: 'Hache de main', damageDie: '1d6', rangeCells: 4, properties: ['light', 'thrown'] },
  { id: 'shortbow', label: 'Arc court', damageDie: '1d6', rangeCells: 16, properties: ['ranged', 'twoHanded'] },
  { id: 'mace', label: "Masse d'armes", damageDie: '1d6', rangeCells: 1, properties: [] },
  { id: 'quarterstaff', label: 'Bâton', damageDie: '1d6', rangeCells: 1, properties: [] },
  { id: 'greataxe', label: "Grande hache", damageDie: '1d12', rangeCells: 1, properties: ['twoHanded'] },
  { id: 'greatsword', label: 'Épée à deux mains', damageDie: '2d6', rangeCells: 1, properties: ['twoHanded'] },
  { id: 'unarmed', label: 'À mains nues', damageDie: '1d4', rangeCells: 1, properties: [] },
]

const WEAPONS_BY_ID = new Map(WEAPONS.map(w => [w.id, w]))

// Arme par défaut si un nom d'arme/de sort n'est pas dans le registre : mêlée
// FOR 1d4 (comportement dégradé historique, conservé).
export const DEFAULT_WEAPON: WeaponSpec = WEAPONS_BY_ID.get('unarmed')!

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, '')
}

// Résout une arme depuis un texte libre (nom d'arme du joueur ou label d'un
// item d'inventaire) : d'abord par id normalisé, puis par label normalisé,
// puis par inclusion du label (« ma vieille épée longue » → longsword).
export function resolveWeapon(text: string | undefined | null): WeaponSpec {
  if (!text) return DEFAULT_WEAPON
  const key = normalize(text)
  const byId = WEAPONS_BY_ID.get(key)
  if (byId) return byId
  const byLabel = WEAPONS.find(w => normalize(w.label) === key)
  if (byLabel) return byLabel
  const byInclusion = WEAPONS.find(w => key.includes(normalize(w.label)) || normalize(w.label).includes(key))
  return byInclusion ?? DEFAULT_WEAPON
}

export function getWeapon(id: string): WeaponSpec | undefined {
  return WEAPONS_BY_ID.get(id)
}

export function listWeapons(): WeaponSpec[] {
  return WEAPONS
}

// Aptitude d'attaque dérivée des propriétés de l'arme (jamais passée en
// paramètre par le LLM) : distance → DEX ; finesse → la meilleure de FOR/DEX ;
// sinon FOR. Retourne la clé d'EntityStats à utiliser pour le bonus.
export function attackAbilityFor(weapon: WeaponSpec, stats: EntityStats): keyof EntityStats {
  if (weapon.properties.includes('ranged')) return 'dex'
  if (weapon.properties.includes('finesse')) return stats.dex >= stats.str ? 'dex' : 'str'
  return 'str'
}
