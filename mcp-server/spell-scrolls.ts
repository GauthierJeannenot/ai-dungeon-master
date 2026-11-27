import type { SpellScrollRecord } from '../lib/scroll-state'
import type { AbilityCheckResult } from '../lib/types'
import { registeredScrollSpell, TELEPORT_SCROLL_PROFILE } from '../lib/srd/spell-scrolls'
import { MAGIC_ITEM_SOURCE } from '../lib/srd/magic-items'
import * as gs from './game-state'
import * as rules from './rules'
import { available, hero, feature, spendHeroAction } from './hero-rules'
import { toolkitError } from './toolkit'
import { afterInventoryChange } from './equipment'
import { endInvisibility } from './monster-rules'
import { visualPerceptionAt } from '../lib/lighting'

export function scrollRecord(id: string): SpellScrollRecord {
  const record = gs.getState().dmTools?.spellScrolls?.[id]
  if (!record) toolkitError('SPELL_SCROLL_UNKNOWN', 'Select an exact registered spell scroll item ID.')
  return record!
}
export function ownedScroll(id: string) {
  const record = scrollRecord(id)
  if (record.status !== 'active') toolkitError('SPELL_SCROLL_CONSUMED', 'This scroll has already crumbled to dust.')
  if (!gs.getPlayer().inventory.some(i => i.id === id)) toolkitError('ITEM_NOT_OWNED', 'The exact physical scroll must be owned.')
  return record
}
export function scrollHeld(id:string){const loadout=gs.getState().dmTools?.loadout;return Boolean(loadout&&[loadout.mainHandId,loadout.offHandId].includes(id))}
export function counterspellScrollAvailable() {
  return Object.values(gs.getState().dmTools?.spellScrolls??{}).some(record=>record.spellId==='counterspell'&&record.status==='active'&&gs.getPlayer().inventory.some(item=>item.id===record.id)&&scrollOnClassList(record)&&scrollHeld(record.id)&&visualPerceptionAt(gs.getState(),gs.getPlayer(),gs.getPlayer().position).canSee)
}
export function scrollOnClassList(record: SpellScrollRecord) {
  const spellId = record.spellId, entry = registeredScrollSpell(record), player = gs.getPlayer()
  if(spellId==='teleport')return Boolean(player.features?.includes('spellcasting')&&TELEPORT_SCROLL_PROFILE.classes.includes(player.characterId??''))
  return Boolean(entry && player.features?.includes('spellcasting') &&
    (entry.source.classes.some(c => c.index === player.characterId) ||
      player.characterId === 'bard' && feature('additional_magical_secrets') && player.knownSpells?.includes(spellId)))
}
export function scrollSnapshot(id: string) {
  const record = scrollRecord(id), item = gs.getPlayer().inventory.find(i => i.id === id) ?? gs.getState().droppedItems?.[id]?.item
  const entry = registeredScrollSpell(record)
  return { itemId: id, name: item?.name, status: record.status, identified: record.identified,
    ...(record.identified&&record.spellId==='teleport'?TELEPORT_SCROLL_PROFILE:{}),
    ...(record.identified && entry ? { cantripCasterLevel: record.scribedCantripCasterLevel, spellId: record.spellId, label: entry.spell.label, level: entry.spell.level,
      dc: entry.dc, attackBonus: entry.attackBonus, rarity: entry.rarity, castingTime: entry.source.casting_time } : {}),
    source: { url: MAGIC_ITEM_SOURCE, entry: 'Spell Scroll', page: 242 } }
}
export function assertScrollReadable() {
  const state=gs.getState(),player=gs.getPlayer()
  if(!visualPerceptionAt(state,player,player.position).canSee)
    toolkitError('SPELL_SCROLL_UNREADABLE','The reader must actually see the scroll: blindness, unconsciousness or darkness without sufficient vision prevents reading.')
}
export function validateScrollCast(id: string, spellId: string) {
  const record = ownedScroll(id), entry = registeredScrollSpell(record)
  if (!entry || record.spellId !== spellId) toolkitError('SPELL_SCROLL_SPELL_MISMATCH', 'The scroll contains only its registered supported spell, at its base level.')
  if (!scrollOnClassList(record)) toolkitError('SPELL_SCROLL_CLASS_REQUIRED', 'This spell must be on the actual class spell list (including actually known bard Magical Secrets).')
  assertScrollReadable()
  const highest = Math.max(0, ...Object.entries(gs.getPlayer().spellSlots ?? {}).filter(([, pool]) => pool.max > 0).map(([key]) => Number(key.slice(5))))
  return { level: entry!.spell.level, cantripCasterLevel: record.scribedCantripCasterLevel, dc: entry!.dc, attackBonus: entry!.attackBonus,
    requiresCheck: entry!.spell.level > highest, checkDc: 10 + entry!.spell.level }
}
/** A held damage spell has already consumed its exact scroll. */
export function retainedScribedCantripLevel(id: string, spellId: string, consumedId: string | undefined) {
  const record = scrollRecord(id), entry = registeredScrollSpell(record)
  if (id !== consumedId || record.status !== 'consumed' || record.spellId !== spellId
    || entry?.spell.level !== 0 || record.scribedCantripCasterLevel !== 1)
    toolkitError('XGE_SCRIBE_CANTRIP_CONTINUATION_MISMATCH', 'Retain the exact consumed scribed cantrip and its first-level caster effect.')
  return 1 as const
}
export function consumeScroll(id: string, check?: AbilityCheckResult) {
  const record = ownedScroll(id)
  record.identified = true; record.status = 'consumed'
  gs.consumePlayerItem(i => i.id === id); afterInventoryChange()
  return { itemId: id, consumed: true, check }
}
export function failScrollCast(id: string, check: AbilityCheckResult) {
  available()
  const record = ownedScroll(id), entry = registeredScrollSpell(record)!
  if (entry.source.casting_time === '1 bonus action') {
    rules.validateBonusActionUse('player')
    if (gs.getState().phase === 'combat') { gs.markBonusActionUsed('player'); hero().bonusSpellCast = true }
  } else {
    rules.validateActionUse('player'); spendHeroAction()
    if (gs.getState().phase === 'combat') { delete hero().attackAction; hero().actionSpellCast = true }
  }
  endInvisibility('player')
  return { success: false, spell: record.spellId, spellScrollUse: consumeScroll(id, check), spellSlotSpent: false,
    mechanicalSummary: 'Lecture du parchemin échouée : le parchemin est détruit sans effet ; son temps de lancement est dépensé, aucun emplacement de sort.' }
}
