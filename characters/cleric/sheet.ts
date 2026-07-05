import type { CharacterTemplate } from '../../lib/character-registry'

// Clerc — SAG, magie divine. Robuste, soigne et châtie. Tours de magie
// illimités ; sorts de niveau 1 sur emplacements (rechargés au changement de
// carte). Incante via le tool cast_spell.
export const CLERIC: CharacterTemplate = {
  id: 'cleric',
  name: 'Séréna',
  class: 'Clerc',
  classId: 'cleric',
  tagline: 'Magie divine, soins et lumière. Tient la ligne.',
  stats: { str: 14, dex: 10, con: 14, int: 10, wis: 16, cha: 12 },
  ac: 16,
  speed: 30,
  proficiencyBonus: 2,
  hp: { base: 18, perLevel: 7 },
  savingThrowProficiencies: ['wis', 'cha'],
  skillProficiencies: ['medicine', 'insight', 'religion', 'persuasion'],
  inventory: [
    { id: 'mace', name: "Masse d'armes", type: 'weapon', damage: '1d6+2', description: 'Arme de mêlée (FOR)' },
    { id: 'shield', name: 'Bouclier', type: 'armor', acBonus: 2, description: 'Bouclier standard (inclus dans la CA)' },
    { id: 'scale_mail', name: "Chemise d'écailles", type: 'armor', description: 'CA 14 de base (incluse dans la CA)' },
    { id: 'holy_symbol', name: 'Symbole sacré', type: 'misc', description: 'Focaliseur divin pour incanter' },
    { id: 'potion1', name: 'Potion de soin', type: 'potion', description: 'Restaure 2d4+2 HP' },
  ],
  features: ['spellcasting'],
  spellcasting: {
    ability: 'wis',
    cantrips: ['sacred-flame', 'thaumaturgy'],
    // Clerc préparé : connaît plus de sorts que d'emplacements. Création d'eau
    // est bien un sort de clerc au niveau 1 (SRD).
    knownSpells: ['cure-wounds', 'guiding-bolt', 'create-water'],
    slots: { level1: 3 },
  },
}
