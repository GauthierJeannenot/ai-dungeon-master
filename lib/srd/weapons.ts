import type { EntityStats, DamageType } from '../types'
import type { AmmunitionType } from './ammunition'
import { EQUIPMENT_WEIGHTS_LB } from './weights'

// ─────────────────────────────────────────────────────────────────────────────
// Registre d'armes SRD 5 — SOURCE DE VÉRITÉ UNIQUE des dégâts et de la portée
// des armes. Remplace les tables dupliquées WEAPON_DAMAGE (combat-tools.ts) et
// ATTACK_RANGE_CELLS (rules.ts) du moteur.
//
// Importable par le serveur MCP : RIEN d'app-only ici (pas de fs, pas de next,
// pas de logger). Voir lib/CLAUDE.md.
// ─────────────────────────────────────────────────────────────────────────────

export type WeaponCategory = 'simple' | 'martial' | 'unarmed' | 'improvised'

export type WeaponProperty = 'finesse' | 'ranged' | 'light' | 'twoHanded' | 'thrown' | 'versatile' | 'ammunition' | 'loading' | 'heavy' | 'reach' | 'special'
export type WeaponHands = 1 | 2

export interface WeaponSpec {
  improvised?:{referenceId:string;targetId:string;targetKind:'item'|'object'|'corpse';allowProficiency:boolean;profileId?:string}
  // Clé normalisée (anglais, sans espaces) : 'longsword', 'shortbow'…
  id: string
  category: WeaponCategory
  // Libellé FR — sert aussi au matching d'un item d'inventaire vers son arme.
  label: string
  // Dé de dégâts SANS modificateur : le moteur ajoute le mod d'aptitude.
  damageDie: string
  // Published alternative for an actual two-handed melee attack.
  versatileDamageDie?: string
  ammunitionType?: AmmunitionType
  reachCells?: number
  weightLb?: number // A published dash remains unknown, never a fabricated zero.
  special?: 'lance' | 'net'
  damageType?: DamageType // Net has no damage type because it deals no damage.
  // Published profile range in cells; melee reach and ranged bands stay explicit.
  rangeCells: number
  // Published normal/long ranges for ranged use; melee reach stays separate.
  normalRangeCells?: number
  longRangeCells?: number
  properties: WeaponProperty[]
}

const WEAPONS: WeaponSpec[] = [
  { id:'club',category:'simple',label:'Gourdin',damageDie:'1d4',damageType:'bludgeoning',rangeCells:1,properties:['light'] },
  { id:'greatclub',category:'simple',label:'Massue',damageDie:'1d8',damageType:'bludgeoning',rangeCells:1,properties:['twoHanded'] },
  { id:'javelin',category:'simple',label:'Javeline',damageDie:'1d6',damageType:'piercing',rangeCells:6,normalRangeCells:6,longRangeCells:24,properties:['thrown'] },
  { id:'light-hammer',category:'simple',label:'Marteau léger',damageDie:'1d4',damageType:'bludgeoning',rangeCells:4,normalRangeCells:4,longRangeCells:12,properties:['light','thrown'] },
  { id:'sickle',category:'simple',label:'Serpe',damageDie:'1d4',damageType:'slashing',rangeCells:1,properties:['light'] },
  { id:'spear',category:'simple',label:'Lance',damageDie:'1d6',versatileDamageDie:'1d8',damageType:'piercing',rangeCells:4,normalRangeCells:4,longRangeCells:12,properties:['thrown','versatile'] },
  { id:'dart',category:'simple',label:'Fléchette',damageDie:'1d4',damageType:'piercing',rangeCells:4,normalRangeCells:4,longRangeCells:12,properties:['ranged','finesse','thrown'] },
  { id:'sling',category:'simple',label:'Fronde',damageDie:'1d4',damageType:'bludgeoning',rangeCells:6,normalRangeCells:6,longRangeCells:24,ammunitionType:'sling-bullet',properties:['ranged','ammunition'] },
  { id:'battleaxe',category:'martial',label:'Hache d’armes',damageDie:'1d8',versatileDamageDie:'1d10',damageType:'slashing',rangeCells:1,properties:['versatile'] },
  { id:'flail',category:'martial',label:'Fléau',damageDie:'1d8',damageType:'bludgeoning',rangeCells:1,properties:[] },
  { id:'lance',category:'martial',label:'Lance d’arçon',damageDie:'1d12',damageType:'piercing',rangeCells:2,reachCells:2,special:'lance',properties:['reach','special'] },
  { id:'maul',category:'martial',label:'Merlin',damageDie:'2d6',damageType:'bludgeoning',rangeCells:1,properties:['heavy','twoHanded'] },
  { id:'morningstar',category:'martial',label:'Morgenstern',damageDie:'1d8',damageType:'piercing',rangeCells:1,properties:[] },
  { id:'scimitar',category:'martial',label:'Cimeterre',damageDie:'1d6',damageType:'slashing',rangeCells:1,properties:['finesse','light'] },
  { id:'trident',category:'martial',label:'Trident',damageDie:'1d6',versatileDamageDie:'1d8',damageType:'piercing',rangeCells:4,normalRangeCells:4,longRangeCells:12,properties:['thrown','versatile'] },
  { id:'war-pick',category:'martial',label:'Pic de guerre',damageDie:'1d8',damageType:'piercing',rangeCells:1,properties:[] },
  { id:'warhammer',category:'martial',label:'Marteau de guerre',damageDie:'1d8',versatileDamageDie:'1d10',damageType:'bludgeoning',rangeCells:1,properties:['versatile'] },
  { id:'blowgun',category:'martial',label:'Sarbacane',damageDie:'1',damageType:'piercing',rangeCells:5,normalRangeCells:5,longRangeCells:20,ammunitionType:'blowgun-needle',properties:['ranged','ammunition','loading'] },
  { id:'heavy-crossbow',category:'martial',label:'Arbalète lourde',damageDie:'1d10',damageType:'piercing',rangeCells:20,normalRangeCells:20,longRangeCells:80,ammunitionType:'crossbow-bolt',properties:['ranged','ammunition','loading','heavy','twoHanded'] },
  { id:'longbow',category:'martial',label:'Arc long',damageDie:'1d8',damageType:'piercing',rangeCells:30,normalRangeCells:30,longRangeCells:120,ammunitionType:'arrow',properties:['ranged','ammunition','heavy','twoHanded'] },
  { id:'net',category:'martial',label:'Filet',damageDie:'0',rangeCells:1,normalRangeCells:1,longRangeCells:3,special:'net',properties:['ranged','thrown','special'] },
  { id: 'longsword', category: 'martial', label: 'Épée longue', damageDie: '1d8', versatileDamageDie: '1d10', damageType: 'slashing', rangeCells: 1, properties: ['versatile'] },
  { id: 'shortsword', category: 'martial', label: 'Épée courte', damageDie: '1d6', damageType: 'piercing', rangeCells: 1, properties: ['finesse', 'light'] },
  { id: 'rapier', category: 'martial', label: 'Rapière', damageDie: '1d8', damageType: 'piercing', rangeCells: 1, properties: ['finesse'] },
  { id: 'dagger', category: 'simple', label: 'Dague', damageDie: '1d4', damageType: 'piercing', rangeCells: 4, normalRangeCells: 4, longRangeCells: 12, properties: ['finesse', 'light', 'thrown'] },
  { id: 'handaxe', category: 'simple', label: 'Hache de main', damageDie: '1d6', damageType: 'slashing', rangeCells: 4, normalRangeCells: 4, longRangeCells: 12, properties: ['light', 'thrown'] },
  { id: 'shortbow', category: 'simple', label: 'Arc court', damageDie: '1d6', damageType: 'piercing', rangeCells: 16, normalRangeCells: 16, longRangeCells: 64, ammunitionType:'arrow', properties: ['ranged', 'twoHanded', 'ammunition'] },
  { id: 'light-crossbow', category: 'simple', label: 'Arbalète légère', damageDie: '1d8', damageType: 'piercing', rangeCells: 16, normalRangeCells: 16, longRangeCells: 64, ammunitionType:'crossbow-bolt', properties: ['ranged', 'twoHanded', 'ammunition', 'loading'] },
  { id: 'hand-crossbow', category: 'martial', label: 'Arbalète de poing', damageDie: '1d6', damageType: 'piercing', rangeCells: 6, normalRangeCells: 6, longRangeCells: 24, ammunitionType:'crossbow-bolt', properties: ['ranged', 'light', 'ammunition', 'loading'] },
  { id: 'mace', category: 'simple', label: "Masse d'armes", damageDie: '1d6', damageType: 'bludgeoning', rangeCells: 1, properties: [] },
  { id: 'quarterstaff', category: 'simple', label: 'Bâton', damageDie: '1d6', versatileDamageDie: '1d8', damageType: 'bludgeoning', rangeCells: 1, properties: ['versatile'] },
  { id: 'greataxe', category: 'martial', label: "Grande hache", damageDie: '1d12', damageType: 'slashing', rangeCells: 1, properties: ['twoHanded', 'heavy'] },
  { id: 'greatsword', category: 'martial', label: 'Épée à deux mains', damageDie: '2d6', damageType: 'slashing', rangeCells: 1, properties: ['twoHanded', 'heavy'] },
  { id: 'glaive', category: 'martial', label: 'Coutille', damageDie: '1d10', damageType: 'slashing', rangeCells: 2, reachCells: 2, properties: ['twoHanded', 'heavy', 'reach'] },
  { id: 'halberd', category: 'martial', label: 'Hallebarde', damageDie: '1d10', damageType: 'slashing', rangeCells: 2, reachCells: 2, properties: ['twoHanded', 'heavy', 'reach'] },
  { id: 'pike', category: 'martial', label: 'Pique', damageDie: '1d10', damageType: 'piercing', rangeCells: 2, reachCells: 2, properties: ['twoHanded', 'heavy', 'reach'] },
  { id: 'whip', category: 'martial', label: 'Fouet', damageDie: '1d4', damageType: 'slashing', rangeCells: 2, reachCells: 2, properties: ['finesse', 'reach'] },
  { id: 'unarmed', category: 'unarmed', label: 'À mains nues', damageDie: '1d4', damageType: 'bludgeoning', rangeCells: 1, properties: [] },
]
// PHB2014 Weapons table (supplied book lines4027–4068). Reuse the existing
// exact physical-weight catalogue instead of inventing another mass policy.
for(const weapon of WEAPONS){const weight=EQUIPMENT_WEIGHTS_LB[weapon.id];if(weight!==undefined)weapon.weightLb=weight}

const WEAPONS_BY_ID = new Map(WEAPONS.map(w => [w.id, w]))

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, '')
}

// Lookup of an explicit identifier/label, never interpretation of an action.
export function findWeapon(text: string | undefined | null): WeaponSpec | undefined {
  if (!text) return undefined
  const key = normalize(text)
  const byId = WEAPONS_BY_ID.get(key)
  if (byId) return byId
  const byLabel = WEAPONS.find(w => normalize(w.label) === key)
  if (byLabel) return byLabel
  return undefined
}

export function resolveWeapon(text: string | undefined | null): WeaponSpec {
  const weapon = findWeapon(text)
  if (!weapon) throw new Error(`Unknown weapon identifier: ${text ?? '(missing)'}`)
  return weapon
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
  if (weapon.properties.includes('finesse')) return stats.dex >= stats.str ? 'dex' : 'str'
  if (weapon.properties.includes('ranged')) return 'dex'
  return 'str'
}
