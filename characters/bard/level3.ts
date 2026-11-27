import type { CharacterTemplate } from '../../lib/character-registry'
import { BARD } from './sheet'

export const BARD_LEVEL3: CharacterTemplate = {
  ...BARD,
  ruleset: 'srd2014', subclassId: 'lore', languages: ['common', 'elvish'],
  tagline: 'Barde de niveau 3 : illusions, messages, langues et exploration.',
  toolProficiencies: ['lute', 'flute', 'drum'],
  skillProficiencies: [...BARD.skillProficiencies, 'arcana', 'history', 'investigation'],
  expertise: ['persuasion', 'insight'],
  features: ['spellcasting', 'jack_of_all_trades', 'bardic_inspiration', 'song_of_rest', 'cutting_words'],
  inventory: [...BARD.inventory,
    { id: 'identify_pearl', name: 'Perle d’identification', type: 'misc', description: 'Perle de 100 po, non consommée.' },
    { id: 'script_ink', name: 'Encre d’écriture illusoire', type: 'misc', description: 'Encre de 10 po, consommée.' },
    { id: 'mouth_jade', name: 'Poudre de jade de bouche magique', type: 'misc', description: 'Poudre de 10 po, consommée.' },
  ],
  spellcasting: {
    ability: 'cha',
    // Deliberate house rule: expanded known spells/cantrips, normal level-3 slots.
    cantrips: ['vicious-mockery', 'minor-illusion', 'light', 'mage-hand', 'mending', 'prestidigitation', 'message', 'dancing-lights'],
    knownSpells: ['healing-word', 'cure-wounds', 'thunderwave', 'charm-person', 'disguise-self', 'speak-with-animals',
      'comprehend-languages', 'detect-magic', 'identify', 'unseen-servant', 'illusory-script', 'silent-image',
      'magic-mouth', 'locate-object', 'animal-messenger', 'invisibility', 'see-invisibility', 'shatter',
      'lesser-restoration', 'blindness-deafness'],
    slots: { level1: 4, level2: 2 },
  },
}
