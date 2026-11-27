// PHB 2014, Weapons / Ammunition and Adventuring Gear / Ammunition.
// Source identifiers select a real physical projectile; names never imply stock.
export const AMMUNITION_TYPES = ['arrow', 'crossbow-bolt', 'sling-bullet', 'blowgun-needle'] as const
export type AmmunitionType = typeof AMMUNITION_TYPES[number]
export const AMMUNITION_SOURCE = 'rules/books/phb-2014.md:Weapons/Ammunition;Adventuring Gear/Ammunition'
export const AMMUNITION: Record<AmmunitionType, { label: string; equipmentId: string; bundleQuantity: number }> = {
  arrow: { label: 'Flèche', equipmentId: 'arrows', bundleQuantity: 20 },
  'crossbow-bolt': { label: 'Carreau d’arbalète', equipmentId: 'crossbow_bolts', bundleQuantity: 20 },
  'sling-bullet': { label: 'Bille de fronde', equipmentId: 'sling_bullets', bundleQuantity: 20 },
  'blowgun-needle': { label:'Aiguille de sarbacane',equipmentId:'blowgun_needles',bundleQuantity:50 },
}
