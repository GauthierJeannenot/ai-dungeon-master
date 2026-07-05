import type { EntityStats, Item } from './types'

// ─────────────────────────────────────────────────────────────────────────────
// Registre de personnages jouables (prétirés SRD 5) — partagé app + moteur MCP.
// Miroir de lib/adventure-map.ts : le catalogue est GLOBAL, orthogonal aux
// aventures. Rien d'app-only ici (pas de fs, pas de next, pas de logger).
//
// Le personnage apporte : classe, stats, CA, vitesse, kit d'équipement, PV
// (formule), capacités, sorts. L'aventure apporte : niveau, position de départ,
// objets additionnels. Voir docs/playable-characters.md.
// ─────────────────────────────────────────────────────────────────────────────

export type CharacterClassId = 'fighter' | 'rogue' | 'wizard' | 'cleric'

// Capacités de classe que le MOTEUR sait appliquer. Liste fermée.
export type ClassFeatureId =
  | 'second_wind'      // action bonus : soin 1d10+niveau, ressource 1/carte
  | 'sneak_attack'     // passif : +dés si conditions vérifiables (voir moteur)
  | 'cunning_action'   // action bonus : dash (×2 mouvement) ou hide
  | 'spellcasting'     // active cast_spell + emplacements

export interface CharacterSpellcasting {
  ability: keyof EntityStats   // int (magicien), wis (clerc)
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
  expertise?: string[]         // compétences à double maîtrise (roublard)
  inventory: Item[]            // kit de classe (armes/armure/outils)
  features: ClassFeatureId[]
  spellcasting?: CharacterSpellcasting
}

import { FIGHTER } from '../characters/fighter/sheet'
import { ROGUE } from '../characters/rogue/sheet'
import { WIZARD } from '../characters/wizard/sheet'
import { CLERIC } from '../characters/cleric/sheet'

export const DEFAULT_CHARACTER_ID: CharacterClassId = 'fighter'

const CHARACTERS: Record<string, CharacterTemplate> = {
  [FIGHTER.id]: FIGHTER,
  [ROGUE.id]: ROGUE,
  [WIZARD.id]: WIZARD,
  [CLERIC.id]: CLERIC,
}

// Ordre d'affichage stable (sélecteur landing) : guerrier d'abord (défaut).
const CHARACTER_ORDER: string[] = ['fighter', 'rogue', 'wizard', 'cleric']

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
