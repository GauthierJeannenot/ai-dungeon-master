import { ARMOR_RULES } from './srd/equipment'
import { getCharacterTemplate, isKnownCharacterId } from './character-registry'
import type { EntityStats, GameState, Item, PlayerState } from './types'

export type ArmorCategory = (typeof ARMOR_RULES)[string]['category']
export interface WornArmorPenalty {
  itemId: string
  equipmentId: string
  category: ArmorCategory
  proficient: boolean
  requiredStrength: number
}

/** PHB2014 Armor table, Strength column. Ring mail has no requirement. */
const REQUIRED_STRENGTH: Readonly<Record<string, number>> = { chain_mail: 13, splint: 15, plate: 15 }

/** The four immutable playable profiles, not a guess from a class/name string.
 * A missing characterId is the documented legacy fighter. Life's heavy armor
 * comes from Bonus Proficiency, not from the cleric's base class proficiency. */
export function proficientArmorCategories(player: PlayerState): ArmorCategory[] {
  const classId = !player.characterId ? 'fighter' : isKnownCharacterId(player.characterId)
    ? getCharacterTemplate(player.characterId, player.level).classId : undefined
  switch (classId) {
    case 'fighter': return ['light', 'medium', 'heavy', 'shield']
    case 'bard': return ['light']
    case 'cleric': return player.subclassId === 'life'
      ? ['light', 'medium', 'heavy', 'shield'] : ['light', 'medium', 'shield']
    default: return []
  }
}

function registeredArmor(item: Item | undefined) {
  return item ? ARMOR_RULES[item.equipmentId ?? item.id] : undefined
}

/** Mirrors equipment.currentLoadout's legacy inference without mutating state.
 * An explicit loadout, including empty slots, is always authoritative. */
function wornArmor(state: GameState): Item[] {
  const inventory = state.player.inventory, loadout = state.dmTools?.loadout
  const armorId = loadout ? loadout.armorId : inventory.find(item =>
    item.type === 'armor' && registeredArmor(item) && registeredArmor(item)!.category !== 'shield')?.id
  const shieldId = loadout ? loadout.shieldId : inventory.find(item => registeredArmor(item)?.category === 'shield')?.id
  return inventory.filter(item => item.id === armorId && registeredArmor(item)?.category !== 'shield'
    || item.id === shieldId && registeredArmor(item)?.category === 'shield')
    .filter(item => Boolean(registeredArmor(item)))
}

/** Derived entirely from the owned equipped items: no persisted duplicate state,
 * no penalty from a carried spare, and no change to armor's AC protection. */
export function armorPenalties(state: GameState) {
  const proficient = proficientArmorCategories(state.player)
  const worn: WornArmorPenalty[] = wornArmor(state).map(item => {
    const equipmentId = item.equipmentId ?? item.id, rule = ARMOR_RULES[equipmentId]
    return { itemId: item.id, equipmentId, category: rule.category,
      proficient: proficient.includes(rule.category), requiredStrength: REQUIRED_STRENGTH[equipmentId] ?? 0 }
  })
  const unproficientItemIds = worn.filter(item => !item.proficient).map(item => item.itemId)
  const strengthPenaltyItemIds = worn.filter(item => item.category === 'heavy'
    && state.player.stats.str < item.requiredStrength).map(item => item.itemId)
  return {
    worn,
    unproficientItemIds,
    spellcastingBlocked: unproficientItemIds.length > 0,
    strengthPenaltyItemIds,
    strengthSpeedPenaltyFeet: strengthPenaltyItemIds.length ? 10 : 0,
  }
}

/** Supply the ability actually used by this check, saving throw or attack.
 * Death saves, concentration (CON), and unspecified abilities receive none. */
export function armorRollDisadvantage(state: GameState, entityId: string, ability?: keyof EntityStats): boolean {
  return entityId === 'player' && (ability === 'str' || ability === 'dex')
    && armorPenalties(state).unproficientItemIds.length > 0
}

export function armorSpellcastingBlocked(state: GameState, entityId = 'player'): boolean {
  return entityId === 'player' && armorPenalties(state).spellcastingBlocked
}

/** Apply to base walking speed before Dash and exhaustion multipliers. This is
 * a speed reduction, not extra distance charged for every traversed cell. */
export function armorAdjustedSpeed(state: GameState, entityId: string, speed: number): number {
  return Math.max(0, speed - (entityId === 'player' ? armorPenalties(state).strengthSpeedPenaltyFeet : 0))
}
