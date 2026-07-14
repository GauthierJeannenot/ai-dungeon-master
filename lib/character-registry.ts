import type { EntityStats, Item, PlayerState } from './types'

// ─────────────────────────────────────────────────────────────────────────────
// Registre de personnages jouables (prétirés SRD 5) — partagé app + moteur MCP.
// Miroir de lib/adventure-map.ts : le catalogue est GLOBAL, orthogonal aux
// aventures. Rien d'app-only ici (pas de fs, pas de next, pas de logger).
//
// Le personnage apporte : classe, stats, CA, vitesse, kit d'équipement, PV
// (formule), capacités, sorts. L'aventure apporte : niveau, position de départ,
// objets additionnels. Voir docs/playable-characters.md.
// ─────────────────────────────────────────────────────────────────────────────

export type CharacterClassId = 'fighter' | 'bard' | 'wizard' | 'cleric'

// Capacités de classe que le MOTEUR sait appliquer. Liste fermée.
export type ClassFeatureId =
  | 'second_wind'      // action bonus : soin 1d10+niveau, ressource 1/carte
  | 'spellcasting'     // active cast_spell + emplacements

export interface CharacterSpellcasting {
  ability: keyof EntityStats   // int (magicien), wis (clerc), cha (barde)
  cantrips: string[]           // ids de lib/srd/spells.ts (niveau 0)
  knownSpells: string[]        // sorts de niveau 1 connus/préparés
  slots: { level1: number }    // v1 : uniquement des emplacements de niveau 1
}

export interface CharacterTemplate {
  id: string                   // slug stable, ex. 'fighter'
  name: string                 // nom affiché (PlayerState.name)
  class: string                // libellé FR (PlayerState.class)
  classId: CharacterClassId
  tagline: string              // résumé une ligne (sélecteur landing)
  stats: EntityStats
  ac: number                   // CA équipée (armure du kit incluse)
  speed: number
  proficiencyBonus: number     // niveaux 1-4 : +2
  hp: { base: number; perLevel: number }   // PV = base + perLevel × (niveau − 1)
  savingThrowProficiencies: Array<keyof EntityStats>
  skillProficiencies: string[] // ids canoniques (lib/srd/skills.ts)
  expertise?: string[]         // compétences à double maîtrise (aucun prétiré v1)
  inventory: Item[]            // kit de classe (armes/armure/outils)
  features: ClassFeatureId[]
  spellcasting?: CharacterSpellcasting
}

import { FIGHTER } from '../characters/fighter/sheet'
import { BARD } from '../characters/bard/sheet'
import { WIZARD } from '../characters/wizard/sheet'
import { CLERIC } from '../characters/cleric/sheet'

export const DEFAULT_CHARACTER_ID: CharacterClassId = 'fighter'

const CHARACTERS: Record<string, CharacterTemplate> = {
  [FIGHTER.id]: FIGHTER,
  [BARD.id]: BARD,
  [WIZARD.id]: WIZARD,
  [CLERIC.id]: CLERIC,
}

// Ordre d'affichage stable (sélecteur landing) : guerrier d'abord (défaut).
const CHARACTER_ORDER: string[] = ['fighter', 'bard', 'wizard', 'cleric']

// Retourne le template demandé, ou celui par défaut si l'id est inconnu
// (fail-safe : ni le moteur ni l'app ne doivent planter sur un id douteux).
export function getCharacterTemplate(characterId: string = DEFAULT_CHARACTER_ID): CharacterTemplate {
  return CHARACTERS[characterId] ?? CHARACTERS[DEFAULT_CHARACTER_ID]
}

export function isKnownCharacterId(characterId: string | null | undefined): boolean {
  return Boolean(characterId && characterId in CHARACTERS)
}

export function listCharacters(): CharacterTemplate[] {
  return CHARACTER_ORDER.map(id => CHARACTERS[id]).filter(Boolean)
}

// PV maximum d'un personnage à un niveau donné (formule solo, décision n°7).
export function maxHpForLevel(template: CharacterTemplate, level: number): number {
  return template.hp.base + template.hp.perLevel * Math.max(0, level - 1)
}

// Ressources rechargeables initiales d'un personnage (d'après ses capacités).
// Rechargées à leur max au changement de carte (applyMapTravel).
function seedResources(features: ClassFeatureId[]): Record<string, { current: number; max: number }> | undefined {
  const resources: Record<string, { current: number; max: number }> = {}
  if (features.includes('second_wind')) resources.second_wind = { current: 1, max: 1 }
  return Object.keys(resources).length > 0 ? resources : undefined
}

// Construit le PlayerState initial d'une partie : template du personnage
// (classe, stats, CA, kit, PV, capacités, sorts) fusionné avec les deltas de
// l'aventure (niveau, position, objets propres). SOURCE UNIQUE partagée par le
// moteur MCP (game-state.ts) et le miroir client optimiste
// (lib/initial-game-state.ts) — aucun drift possible entre les deux.
export function buildPlayerState(params: {
  characterId?: string
  level: number
  position: { x: number; y: number }
  extraInventory?: Item[]
}): PlayerState {
  const tpl = getCharacterTemplate(params.characterId)
  const maxHp = maxHpForLevel(tpl, params.level)
  const player: PlayerState = {
    id: 'player',
    name: tpl.name,
    class: tpl.class,
    characterId: tpl.id,
    level: params.level,
    hp: { current: maxHp, max: maxHp },
    deathSaves: { successes: 0, failures: 0 },
    ac: tpl.ac,
    stats: { ...tpl.stats },
    proficiencyBonus: tpl.proficiencyBonus,
    position: { ...params.position },
    conditions: [],
    inventory: [
      ...tpl.inventory.map(item => ({ ...item })),
      ...(params.extraInventory ?? []).map(item => ({ ...item })),
    ],
    speed: tpl.speed,
    savingThrowProficiencies: [...tpl.savingThrowProficiencies],
    skillProficiencies: [...tpl.skillProficiencies],
    features: [...tpl.features],
  }
  if (tpl.expertise && tpl.expertise.length > 0) {
    player.expertise = [...tpl.expertise]
  }
  const resources = seedResources(tpl.features)
  if (resources) player.resources = resources
  if (tpl.spellcasting) {
    player.spellcastingAbility = tpl.spellcasting.ability
    player.spellSlots = {
      level1: { current: tpl.spellcasting.slots.level1, max: tpl.spellcasting.slots.level1 },
    }
    player.knownSpells = [...tpl.spellcasting.cantrips, ...tpl.spellcasting.knownSpells]
  }
  return player
}
