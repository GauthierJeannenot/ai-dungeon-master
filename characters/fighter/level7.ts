import type { CharacterTemplate } from '../../lib/character-registry'
import { FIGHTER } from './sheet'

export const FIGHTER_LEVEL7: CharacterTemplate = {
  ...FIGHTER,
  ruleset: 'srd2014', subclassId: 'champion', languages: ['common', 'dwarvish'],
  name: 'Darian',
  tagline: 'Vétéran de niveau 7 : deux attaques, sursaut et second souffle.',
  stats: { ...FIGHTER.stats, str: 18, con: 16 },
  proficiencyBonus: 3,
  ac: 18,
  // SRD fixed average: 10 + CON at first level, then 6 + CON per level.
  hp: { base: 13, perLevel: 9 },
  inventory: [
    { id: 'longsword', name: 'Épée longue', type: 'weapon', damage: '1d8+6', description: 'FOR +4 et style Duel +2, maniée à une main.' },
    { id: 'chain_mail', name: 'Cotte de mailles', type: 'armor', acBonus: 5, description: 'CA 16 avant bouclier ; DEX non ajoutée.' },
    { id: 'shield', name: 'Bouclier', type: 'armor', acBonus: 2 },
    { id: 'handaxe', name: 'Hachette', type: 'weapon', damage: '1d6+6', description: 'FOR +4 et Duel +2 si elle est seule en main ; lançable.' },
    { id: 'potion1', name: 'Potion de soin', type: 'potion' },
  ],
  features: ['second_wind', 'extra_attack', 'action_surge', 'dueling', 'improved_critical', 'remarkable_athlete'],
}
