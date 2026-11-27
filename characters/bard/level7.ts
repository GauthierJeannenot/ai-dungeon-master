import type { CharacterTemplate } from '../../lib/character-registry'
import { BARD } from './sheet'

export const BARD_LEVEL7: CharacterTemplate = {
  ...BARD,
  ruleset: 'srd2014', subclassId: 'lore', languages: ['common', 'elvish'],
  toolProficiencies: ['lute', 'flute', 'drum'],
  hp: { base: 9, perLevel: 6 },
  skillProficiencies: [...BARD.skillProficiencies, 'arcana', 'history', 'investigation'],
  tagline: 'Enquêtrice de niveau 7 : expertise, langues, soins et porte dimensionnelle.',
  stats: { ...BARD.stats, cha: 18 },
  proficiencyBonus: 3,
  ac: 14,
  expertise: ['persuasion', 'insight'],
  features: ['spellcasting', 'jack_of_all_trades', 'bardic_inspiration', 'song_of_rest', 'font_of_inspiration',
    'countercharm', 'cutting_words', 'additional_magical_secrets'],
  inventory: BARD.inventory.map(item => item.id === 'leather'
    ? { id: 'studded_leather', name: 'Armure de cuir clouté', type: 'armor', acBonus: 2, description: 'CA 12 + DEX.' } : { ...item }),
  spellcasting: {
    ability: 'cha', cantrips: ['vicious-mockery', 'minor-illusion', 'light'],
    knownSpells: ['charm-person', 'healing-word', 'cure-wounds', 'thunderwave', 'disguise-self', 'speak-with-animals',
      'comprehend-languages', 'shatter', 'tongues', 'speak-with-dead', 'dimension-door', 'counterspell', 'fireball'],
    slots: { level1: 4, level2: 3, level3: 3, level4: 1 },
  },
}
