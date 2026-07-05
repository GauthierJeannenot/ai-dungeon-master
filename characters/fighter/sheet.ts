import type { CharacterTemplate } from '../../lib/character-registry'

// Guerrier — personnage par défaut. Stats/CA/maîtrise/vitesse byte-identiques à
// l'ancien BASE_PLAYER (lib/player-template.ts) ; kit mécanique = l'inventaire
// historique commun aux aventures (épée longue, bouclier, potion). Les objets
// propres à une aventure viennent de map.ts (initialPlayer.extraInventory).
// PV : base 20, +8/niveau → reproduit les PV des aventures existantes aux
// niveaux 1/2/3 (20/28/36). AUCUN nom de module ici (catalogue global).
export const FIGHTER: CharacterTemplate = {
  id: 'fighter',
  name: 'Héros',
  class: 'Guerrier',
  classId: 'fighter',
  tagline: 'Épée, bouclier, second souffle. Simple et solide.',
  stats: { str: 16, dex: 12, con: 14, int: 10, wis: 12, cha: 10 },
  ac: 16,
  speed: 30,
  proficiencyBonus: 2,
  hp: { base: 20, perLevel: 8 },
  savingThrowProficiencies: ['str', 'con'],
  skillProficiencies: ['athletics', 'intimidation', 'perception', 'history'],
  inventory: [
    { id: 'longsword', name: 'Épée longue', type: 'weapon', damage: '1d8+3', description: 'Épée longue +3 STR' },
    { id: 'shield', name: 'Bouclier', type: 'armor', acBonus: 2, description: 'Bouclier standard' },
    { id: 'potion1', name: 'Potion de soin', type: 'potion', description: 'Restaure 2d4+2 HP' },
  ],
  features: ['second_wind'],
}
