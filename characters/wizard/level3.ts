import type { CharacterTemplate } from '../../lib/character-registry'
import { WIZARD } from './sheet'

const SPELLBOOK = ['magic-missile', 'burning-hands', 'shield', 'mage-armor', 'charm-person', 'disguise-self',
  'comprehend-languages', 'detect-magic', 'identify', 'alarm', 'unseen-servant', 'floating-disk', 'illusory-script',
  'silent-image', 'magic-mouth', 'locate-object', 'rope-trick', 'arcanists-magic-aura', 'invisibility',
  'see-invisibility', 'continual-flame', 'gentle-repose', 'misty-step', 'shatter', 'blindness-deafness']

export const WIZARD_LEVEL3: CharacterTemplate = {
  ...WIZARD,
  ruleset: 'srd2014', subclassId: 'evocation', languages: ['common', 'draconic'],
  tagline: 'Magicien de niveau 3 : illusions, rituels et magie d’enquête.',
  features: ['spellcasting', 'arcane_recovery', 'evocation_savant', 'sculpt_spells'],
  spellbook: SPELLBOOK,
  inventory: [...WIZARD.inventory.map(i => i.id === 'spellbook' ? { ...i, spellIds: SPELLBOOK } : { ...i }),
    { id: 'component_pouch', name: 'Sacoche à composantes', type: 'misc', description: 'Composantes usuelles sans coût ; ne remplace pas les matériaux coûteux.' },
    { id: 'identify_pearl', name: 'Perle d’identification', type: 'misc', description: 'Perle de 100 po, non consommée.' },
    { id: 'script_ink', name: 'Encre d’écriture illusoire', type: 'misc', description: 'Encre de 10 po, consommée.' },
    { id: 'mouth_jade', name: 'Poudre de jade de bouche magique', type: 'misc', description: 'Poudre de 10 po, consommée.' },
    { id: 'ruby_dust', name: 'Poudre de rubis', type: 'misc', description: 'Poudre de 50 po, consommée.' },
    { id: 'rope', name: 'Corde de chanvre', type: 'misc', description: '15 m, pour Corde enchantée.' },
  ],
  spellcasting: {
    ability: 'int',
    cantrips: ['ray-of-frost', 'light', 'minor-illusion', 'mage-hand', 'mending', 'prestidigitation', 'message', 'dancing-lights'],
    // All book spells available: explicit narrative house rule, not extra slots.
    knownSpells: SPELLBOOK,
    slots: { level1: 4, level2: 2 },
  },
}
