import type { CharacterTemplate } from '../../lib/character-registry'
import { WIZARD } from './sheet'
const SPELLBOOK=['magic-missile', 'burning-hands', 'comprehend-languages', 'shield', 'mage-armor', 'identify', 'detect-magic', 'thunderwave',
  'shatter', 'gentle-repose', 'misty-step', 'blindness-deafness', 'lightning-bolt', 'tongues', 'sending', 'fireball', 'counterspell',
  'dispel-magic', 'dimension-door', 'greater-invisibility']

export const WIZARD_LEVEL7: CharacterTemplate = {
  ...WIZARD,
  ruleset: 'srd2014', subclassId: 'evocation', languages: ['common', 'draconic'],
  hp: { base: 7, perLevel: 5 },
  features: ['spellcasting', 'arcane_recovery', 'evocation_savant', 'sculpt_spells', 'potent_cantrip'],
  spellbook: SPELLBOOK,
  tagline: 'Arcaniste de niveau 7 : éclairs, langues anciennes et porte dimensionnelle.',
  stats: { ...WIZARD.stats, int: 18 },
  proficiencyBonus: 3,
  inventory: [...WIZARD.inventory.map(i=>i.id==='spellbook'?{...i,spellIds:SPELLBOOK}:{...i}),
    {id:'component_pouch',name:'Sacoche à composantes',type:'misc',description:'Composantes usuelles sans coût indiqué ; ne remplace aucun composant coûteux.'},
    {id:'identify_pearl',name:'Perle d’identification',type:'misc',description:'Perle valant au moins 100 po ; non consommée par Identification.'}],
  spellcasting: {
    ability: 'int', cantrips: ['ray-of-frost', 'light', 'minor-illusion', 'acid-splash'],
    // A deliberately prepared subset; no unimplemented spell is advertised.
    knownSpells: ['magic-missile', 'burning-hands', 'comprehend-languages', 'shatter',
      'gentle-repose', 'lightning-bolt', 'tongues', 'sending', 'dimension-door', 'shield', 'fireball'],
    slots: { level1: 4, level2: 3, level3: 3, level4: 1 },
  },
}
