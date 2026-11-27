import type { CharacterTemplate } from '../../lib/character-registry'
import { CLERIC } from './sheet'

export const CLERIC_LEVEL3: CharacterTemplate = {
  ...CLERIC,
  ruleset: 'srd2014', subclassId: 'life', languages: ['common', 'celestial'],
  tagline: 'Clerc de niveau 3 : augures, détections, lumière et soins.',
  features: ['spellcasting', 'disciple_of_life', 'channel_divinity'],
  domainSpells: ['bless', 'cure-wounds', 'lesser-restoration', 'spiritual-weapon'],
  inventory: [...CLERIC.inventory,
    { id: 'augury_tokens', name: 'Jetons divinatoires', type: 'misc', description: 'Valeur 25 po ; conservés après Augure.' },
    { id: 'ruby_dust', name: 'Poudre de rubis', type: 'misc', description: 'Valeur 50 po ; consommée par Flamme éternelle.' },
  ],
  spellcasting: {
    ability: 'wis',
    cantrips: ['sacred-flame', 'thaumaturgy', 'light', 'mending'],
    knownSpells: ['cure-wounds', 'guiding-bolt', 'create-water', 'healing-word', 'bless', 'detect-magic',
      'detect-evil-and-good', 'detect-poison-and-disease', 'purify-food-and-drink', 'augury', 'locate-object',
      'continual-flame', 'gentle-repose', 'prayer-of-healing', 'lesser-restoration', 'spiritual-weapon',
      'aid', 'protection-from-poison', 'blindness-deafness'],
    slots: { level1: 4, level2: 2 },
  },
}
