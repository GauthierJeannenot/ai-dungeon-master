import type { CharacterTemplate } from '../../lib/character-registry'

// Magicien — INT, sorts arcaniques. Fragile en mêlée, redoutable à distance.
// Tours de magie illimités ; sorts de niveau 1 sur emplacements (rechargés au
// changement de carte). Incante via le tool cast_spell.
export const WIZARD: CharacterTemplate = {
  id: 'wizard',
  name: 'Aldric',
  class: 'Magicien',
  classId: 'wizard',
  tagline: 'Sorts arcaniques, INT élevée. Fragile mais dévastateur.',
  stats: { str: 8, dex: 14, con: 12, int: 16, wis: 12, cha: 10 },
  ac: 12,
  speed: 30,
  proficiencyBonus: 2,
  hp: { base: 12, perLevel: 5 },
  savingThrowProficiencies: ['int', 'wis'],
  skillProficiencies: ['arcana', 'investigation', 'history', 'insight'],
  inventory: [
    { id: 'quarterstaff', name: 'Bâton', type: 'weapon', damage: '1d6-1', description: 'Arme de mêlée simple' },
    { id: 'dagger', name: 'Dague', type: 'weapon', damage: '1d4+2', description: 'Finesse (DEX)' },
    { id: 'spellbook', name: 'Grimoire', type: 'misc', description: 'Recueil de sorts arcaniques' },
    { id: 'potion1', name: 'Potion de soin', type: 'potion', description: 'Restaure 2d4+2 HP' },
  ],
  features: ['spellcasting'],
  spellcasting: {
    ability: 'int',
    cantrips: ['ray-of-frost', 'light'],
    knownSpells: ['magic-missile', 'burning-hands'],
    slots: { level1: 3 },
  },
}
