import type { CharacterTemplate } from '../../lib/character-registry'
import { FIGHTER } from './sheet'

export const FIGHTER_LEVEL3: CharacterTemplate = {
  ...FIGHTER,
  ruleset: 'srd2014', subclassId: 'champion', languages: ['common', 'dwarvish'],
  tagline: 'Guerrier de niveau 3 : champion, sursaut et second souffle.',
  // Keep the existing solo HP/AC calibration; grant only level-3 features.
  features: ['second_wind', 'action_surge', 'dueling', 'improved_critical'],
  inventory: [...FIGHTER.inventory.map(i => i.id === 'longsword' ? { ...i, damage: '1d8+5', description: 'FOR +3 et style Duel +2 à une main.' } : { ...i }),
    { id: 'chain_shirt', name: 'Chemise de mailles', type: 'armor', description: 'CA 13 + DEX + bouclier = 16.' },
  ],
}
