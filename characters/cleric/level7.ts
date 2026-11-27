import type { CharacterTemplate } from '../../lib/character-registry'
import { CLERIC } from './sheet'

export const CLERIC_LEVEL7: CharacterTemplate = {
  ...CLERIC,
  ruleset: 'srd2014', subclassId: 'life', languages: ['common', 'celestial'],
  hp: { base: 10, perLevel: 7 },
  features: ['spellcasting', 'disciple_of_life', 'channel_divinity', 'destroy_undead', 'blessed_healer'],
  domainSpells: ['bless', 'cure-wounds', 'lesser-restoration', 'spiritual-weapon', 'beacon-of-hope', 'revivify', 'death-ward', 'guardian-of-faith'],
  tagline: 'Prêtresse de niveau 7 : soins renforcés, restauration et divination.',
  stats: { ...CLERIC.stats, wis: 18 },
  proficiencyBonus: 3,
  // Life domain grants heavy armor proficiency: chain mail 16 + shield 2.
  ac: 18,
  inventory: [
    ...CLERIC.inventory.filter(item => item.id !== 'scale_mail'),
    { id: 'chain_mail', name: 'Cotte de mailles', type: 'armor', acBonus: 6, description: 'CA 16, plus bouclier ; maîtrise des armures lourdes du domaine.' },
    { id: 'revivify_diamonds', name: 'Diamants de revivification', type: 'misc', description: 'Valeur 300 po ; consommés par Revivification.' },
    ...Array.from({ length: 3 }, (_, i) => ({ id: `divination_offering_${i + 1}`, name: 'Offrande de divination',
      type: 'misc' as const, description: 'Encens et offrande valant 25 po, consommés par Divination.' })),
  ],
  spellcasting: {
    ability: 'wis', cantrips: ['sacred-flame', 'thaumaturgy', 'light', 'mending'],
    knownSpells: ['cure-wounds', 'guiding-bolt', 'create-water', 'healing-word', 'gentle-repose',
      'prayer-of-healing', 'lesser-restoration', 'speak-with-dead', 'tongues', 'sending', 'divination',
      'bless', 'spiritual-weapon', 'beacon-of-hope', 'revivify', 'death-ward', 'guardian-of-faith','aid','protection-from-poison'],
    slots: { level1: 4, level2: 3, level3: 3, level4: 1 },
  },
}
