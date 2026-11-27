import { listSpells, getSpell } from './spells'
import { spellRules } from './hero-spells'
import { MULTIDAY_SCRIBED_SCROLL_CREATION_PREFIX, SCRIBED_SCROLL_CREATION_PREFIX, type SpellScrollRecord } from '../scroll-state'

// SRD 5.1 (2014), Spell Scroll. See spell-scrolls-sources.json and LICENSE.
// Acquisition/read profile only. Teleport's destination/mishap resolver is NOT admitted.
export const TELEPORT_SCROLL_PROFILE={spellId:'teleport',label:'Téléportation',level:7,rarity:'very rare',dc:18,attackBonus:10,castingTime:'1 action',classes:['bard','sorcerer','wizard'],castSupported:false as const,source:{book:'dmg-2014',startLine:5827,endLine:5847,spellBook:'phb-2014',spellStartLine:13006,classListLines:[6530,7015,7313]}}
export const SPELL_SCROLL_LEVELS = {
  1: { rarity: 'common', dc: 13, attackBonus: 5 },
  2: { rarity: 'uncommon', dc: 13, attackBonus: 5 },
  3: { rarity: 'uncommon', dc: 15, attackBonus: 7 },
  4: { rarity: 'rare', dc: 15, attackBonus: 7 },
  5: { rarity: 'rare', dc: 17, attackBonus: 9 },
} as const

/** Printed XGE resources are shared by spell level. Payment and delay handling
 * below are the explicitly adopted MJ conventions, not extra printed prices.
 * This policy never admits a spell: each recipe still needs its own review. */
export const SCRIBING_LEVEL_POLICIES = {
  2: {
    costCp: 25000, requiredDays: 3, secondsPerDay: 28800,
    paymentTiming: 'full-at-start', abandonmentRefundCp: 0,
    elapsedDateMultiplier: 2, maxSupplementCostMultiplier: 1,
  },
} as const
export type ScribingLevelPolicy = typeof SCRIBING_LEVEL_POLICIES[keyof typeof SCRIBING_LEVEL_POLICIES]
/** An explicit admission list, separate from both level policy and cast catalog. */
export const MULTIDAY_SCRIBING_SPELL_IDS = ['misty-step'] as const
export function supportedScrollSpell(id: string) {
  const spell = getSpell(id)
  if (!spell || spell.level < 1 || spell.level > 5) return undefined
  const source = spellRules(id)
  if (!['1 action', '1 bonus action'].includes(source.casting_time) && id !== 'counterspell') return undefined
  return { spell, source, ...SPELL_SCROLL_LEVELS[spell.level as 1|2|3|4|5] }
}
/** A bounded set with separately reviewed material treatment for scribing. */
export function scribedScrollRecipe(id: string) {
  if (id === 'ray-of-frost') {
    const spell = getSpell(id)!, source = spellRules(id)
    return { spell, source, rarity: 'common' as const, dc: 13, attackBonus: 5, costCp: 1500, requiresComponentPouch: false }
  }
  if (id !== 'magic-missile' && id !== 'mage-armor') return undefined
  const entry = supportedScrollSpell(id)
  if (!entry || entry.spell.level !== 1) return undefined
  return { ...entry, costCp: 2500, requiresComponentPouch: id === 'mage-armor' }
}

/** XGE2406/2415 and1987. Project/payment/delay procedures are separate from
 * this printed recipe; legacy one-day receipts never use this entry. */
export function multiDayScribedScrollRecipe(id: string) {
  if (!MULTIDAY_SCRIBING_SPELL_IDS.some(spellId => spellId === id)) return undefined
  const entry = supportedScrollSpell(id)
  if (!entry || entry.spell.level !== 2 || entry.source.components.length !== 1
    || entry.source.components[0] !== 'V' || entry.source.material) return undefined
  return { ...entry, ...SCRIBING_LEVEL_POLICIES[2], requiresComponentPouch: false as const }
}

export function registeredScrollSpell(record: SpellScrollRecord) {
  if (record.creation.startsWith(MULTIDAY_SCRIBED_SCROLL_CREATION_PREFIX))
    return record.scribedCantripCasterLevel === undefined ? multiDayScribedScrollRecipe(record.spellId) : undefined
  if (!record.creation.startsWith(SCRIBED_SCROLL_CREATION_PREFIX)) return supportedScrollSpell(record.spellId)
  const recipe = scribedScrollRecipe(record.spellId)
  return record.scribedCantripCasterLevel === (recipe?.spell.level === 0 ? 1 : undefined) ? recipe : undefined
}

export function spellScrollCatalog() {
  return listSpells().flatMap(spell => {
    const entry = supportedScrollSpell(spell.id)
    return entry ? [{ spellId: spell.id, label: spell.label, level: spell.level,
      rarity: entry.rarity, dc: entry.dc, attackBonus: entry.attackBonus,
      classes: entry.source.classes.map(c => c.index), castingTime: entry.source.casting_time }] : []
  })
}
