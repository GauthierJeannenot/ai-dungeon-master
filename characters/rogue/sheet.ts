import type { CharacterTemplate } from '../../lib/character-registry'

// Roublard — DEX, finesse, attaque sournoise. Joue sur la discrétion (Ruse) et
// les armes finesse/distance. Attaque sournoise appliquée AUTOMATIQUEMENT par le
// moteur quand les conditions vérifiables sont réunies (voir docs).
export const ROGUE: CharacterTemplate = {
  id: 'rogue',
  name: 'Ombre',
  class: 'Roublard',
  classId: 'rogue',
  tagline: 'Discrétion, finesse, attaque sournoise. Frappe puis disparaît.',
  stats: { str: 10, dex: 16, con: 12, int: 13, wis: 12, cha: 14 },
  ac: 14,
  speed: 30,
  proficiencyBonus: 2,
  hp: { base: 16, perLevel: 6 },
  savingThrowProficiencies: ['dex', 'int'],
  skillProficiencies: ['stealth', 'acrobatics', 'perception', 'sleightOfHand', 'persuasion'],
  expertise: ['stealth', 'sleightOfHand'],
  inventory: [
    { id: 'rapier', name: 'Rapière', type: 'weapon', damage: '1d8+3', description: 'Arme de finesse (DEX)' },
    { id: 'dagger', name: 'Dague', type: 'weapon', damage: '1d4+3', description: 'Finesse, lançable' },
    { id: 'dagger2', name: 'Dague', type: 'weapon', damage: '1d4+3', description: 'Finesse, lançable' },
    { id: 'shortbow', name: 'Arc court', type: 'weapon', damage: '1d6+3', description: 'Arme à distance (DEX)' },
    { id: 'leather', name: 'Armure de cuir', type: 'armor', description: 'CA 11 + DEX (incluse dans la CA)' },
    { id: 'thieves_tools', name: 'Outils de voleur', type: 'misc', description: 'Crochetage, désamorçage' },
    { id: 'potion1', name: 'Potion de soin', type: 'potion', description: 'Restaure 2d4+2 HP' },
  ],
  features: ['sneak_attack', 'cunning_action'],
}
