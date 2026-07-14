import type { CharacterTemplate } from '../../lib/character-registry'

// Barde — CHA, magie du verbe. Son kit de sorts privilégie les effets
// UTILITAIRES (illusion, déguisement, parole aux bêtes) : le moteur débite le
// coût via cast_spell et pose un WorldFact ; le DM narre dans les bornes du
// srdNote renvoyé. Voir lib/srd/spells.ts (kind: 'utility').
export const BARD: CharacterTemplate = {
  id: 'bard',
  name: 'Lyra',
  class: 'Barde',
  classId: 'bard',
  tagline: "Éloquence, illusions et magie du verbe. Change la scène en la racontant.",
  stats: { str: 8, dex: 14, con: 12, int: 10, wis: 12, cha: 16 },
  ac: 13,
  speed: 30,
  proficiencyBonus: 2,
  hp: { base: 16, perLevel: 6 },
  savingThrowProficiencies: ['dex', 'cha'],
  skillProficiencies: ['performance', 'persuasion', 'deception', 'insight', 'acrobatics'],
  inventory: [
    { id: 'rapier', name: 'Rapière', type: 'weapon', damage: '1d8+2', description: 'Arme de finesse (DEX)' },
    { id: 'dagger', name: 'Dague', type: 'weapon', damage: '1d4+2', description: 'Finesse, lançable' },
    { id: 'leather', name: 'Armure de cuir', type: 'armor', description: 'CA 11 + DEX (incluse dans la CA)' },
    { id: 'lute', name: 'Luth', type: 'misc', description: "Focaliseur d'incantation et gagne-pain" },
    { id: 'potion1', name: 'Potion de soin', type: 'potion', description: 'Restaure 2d4+2 HP' },
  ],
  features: ['spellcasting'],
  spellcasting: {
    ability: 'cha',
    cantrips: ['vicious-mockery', 'minor-illusion'],
    knownSpells: ['healing-word', 'thunderwave', 'disguise-self', 'speak-with-animals'],
    slots: { level1: 3 },
  },
}
