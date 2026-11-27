import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { isPhysicalLightKind } from '../../lib/lighting-state'
import { ARMOR_RULES } from '../../lib/srd/equipment'
import { findWeapon } from '../../lib/srd/weapons'
import { equipmentId, initializeLoadout, syncEquipmentAC, spendObjectInteraction, afterInventoryChange, freeHands } from '../equipment'
import { toolkitError, toolkitResult, toolkitState, toolkitTransaction } from '../toolkit'
import { available, advanceHeroTime, addHeroEffect, effects, now } from '../hero-rules'
import * as rules from '../rules'
import * as gs from '../game-state'
import { visibleCell } from '../monster-perception'
import { MAGIC_ITEMS } from '../../lib/srd/magic-items'
import { reconcileMagicItems } from '../magic-items'
import { manageLightSource } from '../lighting'
import { heroArmorClass } from '../../lib/hero-state'
import { reconcileCasting } from '../casting'
import { reconcileWeatherInventory } from '../weather'
import { assertWeatherFlameExposure } from '../weather-flames'
import { groundGearContainerTransfer } from '../../lib/ground-gear-containers'

export function registerItemTools(server: McpServer) {
  server.registerTool('equip_item', {
    description: 'Explicitly equip or unequip one actually owned weapon, supported PHB armor/shield, physical light, spellcasting focus or musical instrument in the chosen slot. Armor must be donned/doffed outside combat with its published time; a shield takes one action. Drawing/stowing uses the first free object interaction, then an action. Hands and two-handed weapons are validated. Unproficient armor or shields impose STR/DEX roll disadvantage and prevent spellcasting; insufficient Strength for listed heavy armor reduces speed by 10 feet. Unequip an occupied slot first; no implicit item switch. Armor Class and subsequent weapon/Stealth checks use the actual loadout. Does not create an item or recharge a resource.',
    inputSchema: { itemId: z.string().min(1).max(100), operation: z.enum(['equip', 'unequip']),
      slot: z.enum(['main_hand', 'off_hand', 'armor', 'shield']) },
  }, async input => toolkitTransaction(() => {
    available()
    const player = gs.getPlayer(), item = player.inventory.find(item => item.id === input.itemId)
    if (!item) toolkitError('ITEM_NOT_OWNED', 'Choose an item actually in the player inventory.')
    const id = equipmentId(item!), armor = ARMOR_RULES[id], weapon = findWeapon(id), loadout = initializeLoadout()
    const slot = input.slot === 'main_hand' ? 'mainHandId' : input.slot === 'off_hand' ? 'offHandId' : input.slot === 'armor' ? 'armorId' : 'shieldId'
    if (input.operation === 'unequip') {
      if (loadout[slot] !== item!.id) toolkitError('ITEM_NOT_EQUIPPED', 'The selected item is not in that slot.')
    } else {
      if(gs.getState().dmTools?.groundGear?.stocks[item!.id]){const transfer=groundGearContainerTransfer(gs.getState(),item!.id,'drop');if(transfer.issue)toolkitError(transfer.issue.code,transfer.issue.message)}
      if (loadout[slot]) toolkitError('EQUIPMENT_SLOT_OCCUPIED', 'Explicitly unequip the current item before equipping another.')
      if ([loadout.mainHandId, loadout.offHandId, loadout.armorId, loadout.shieldId].includes(item!.id)) toolkitError('ITEM_ALREADY_EQUIPPED', 'This item is already equipped.')
      if (input.slot === 'armor' && (!armor || armor.category === 'shield') || input.slot === 'shield' && armor?.category !== 'shield')
        toolkitError('EQUIPMENT_SLOT_INVALID', 'Choose the matching armor or shield slot.')
      const magic=gs.getState().dmTools?.magicItems?.[item!.id]
      const isWand=magic?.status==='active'&&['wand','chime'].includes(MAGIC_ITEMS[magic.templateId].kind)
      const scroll=gs.getState().dmTools?.spellScrolls?.[item!.id],isActualScroll=Boolean(scroll?.status==='active'&&item!.magical&&item!.equipmentId==='spell_scroll')
      const improvised=Object.values(gs.getState().dmTools?.improvised?.rulings??{}).some(ruling=>ruling.targetKind==='item'&&ruling.targetId===item!.id)
      if (['main_hand', 'off_hand'].includes(input.slot) && (armor || !weapon && !improvised&&!isPhysicalLightKind(id)&&!['holy_symbol','arcane_focus','bagpipes','drum','dulcimer','flute','lute','lyre','horn','pan_flute','shawm','viol'].includes(id)&&!isWand&&!isActualScroll)) toolkitError('EQUIPMENT_ITEM_UNSUPPORTED', 'This hand slot supports registered weapons, explicitly adjudicated real improvised objects, registered wands/chimes/scrolls, physical lights, spellcasting focuses or musical instruments.')
      if (input.slot === 'shield' && loadout.offHandId || input.slot === 'off_hand' && loadout.shieldId) toolkitError('HAND_OCCUPIED', 'The off hand is already occupied.')
      if (input.slot !== 'armor' && freeHands() < 1) toolkitError('FREE_HAND_REQUIRED', 'Free the needed hands, including hands holding a grapple, before equipping this item.')
      // Holding occupies one hand; a Two-Handed attack validates the other hand separately.
    }
    const projectedHeld=new Set([loadout.mainHandId,loadout.offHandId,loadout.shieldId].filter((value):value is string=>Boolean(value)))
    if(input.slot!=='armor'){if(input.operation==='equip')projectedHeld.add(item!.id);else projectedHeld.delete(item!.id)}
    assertWeatherFlameExposure({heldItemIds:[...projectedHeld]})
    let seconds = 0
    if (input.slot === 'armor') {
      if (gs.getState().phase === 'combat') toolkitError('ARMOR_REQUIRES_TIME', 'Don or doff body armor outside combat.')
      seconds = input.operation === 'unequip' ? armor!.category === 'heavy' ? 300 : 60
        : armor!.category === 'heavy' ? 600 : armor!.category === 'medium' ? 300 : 60
      advanceHeroTime(seconds)
    } else if (input.slot === 'shield') { rules.validateActionUse('player'); if (gs.getState().phase === 'combat') rules.recordAction('player') }
    else spendObjectInteraction()
    if (input.operation === 'equip') loadout[slot] = item!.id
    else delete loadout[slot]
    syncEquipmentAC()
    reconcileMagicItems()
    reconcileCasting()
    reconcileWeatherInventory()
    const ac=heroArmorClass(player,gs.getState().hero,now())
    return toolkitResult({ success: true, loadout, ac, baselineAC:player.ac, seconds,
      mechanicalSummary: `${item!.name} ${input.operation === 'equip' ? 'équipé' : 'rangé/retiré'} ; CA ${ac}${seconds ? ` ; ${seconds} secondes écoulées` : ''}.` })
  }))
  server.registerTool('use_item', {
    description: 'Use one exact owned PHB item: healers_kit stabilizes the living player at zero HP using one of ten uses and one actor action; antitoxin is drunk by the explicit actor and grants advantage against poison saves for one hour; torch/candle delegates to manage_light_source and requires that exact item held in a hand, with real fuel, propagation and action cost. actorId defaults to player; another actor may use healing supplies while adjacent. Light sources currently require the player actor. This tool does not grant an item or improvise an unsupported effect. Magic potions and spell scrolls require their dedicated tools.',
    inputSchema: { itemId: z.string().min(1).max(100), actorId: z.string().default('player'), targetId: z.string().optional() },
  }, async input => toolkitTransaction(() => {
    available(); rules.validateActionUse(input.actorId)
    const player = gs.getPlayer(), actor = gs.getEntity(input.actorId)!, item = player.inventory.find(item => item.id === input.itemId)
    if (!item) toolkitError('ITEM_NOT_OWNED', 'Select an actually owned item.')
    if (input.actorId !== 'player' && Math.max(Math.abs(actor.position.x - player.position.x), Math.abs(actor.position.y - player.position.y)) > 1)
      toolkitError('ITEM_OUT_OF_REACH', 'The actor must be adjacent to the player inventory.')
    if (!visibleCell({ ...actor, conditions: actor.conditions.filter(condition => condition !== 'blinded') }, player.position))
      toolkitError('ITEM_OUT_OF_REACH', 'A wall or closed door blocks access to the player supplies.')
    const id = equipmentId(item!), data = toolkitState()
    if (id === 'healers_kit') {
      if (input.targetId !== 'player' || player.hp.current !== 0 || player.deathSaves?.dead || player.deathSaves?.stable)
        toolkitError('STABILIZATION_TARGET_INVALID', 'Choose the still-living, unstable player at zero HP.')
      const remaining = data.itemUses[item!.id] ?? 10
      if (remaining <= 0) toolkitError('ITEM_EXHAUSTED', 'This healer kit has no uses left.')
      gs.stabilizePlayer(); data.itemUses[item!.id] = remaining - 1
      if (remaining === 1) gs.consumePlayerItem(other => other.id === item!.id)
      if (gs.getState().phase === 'combat') rules.recordAction(input.actorId)
      return toolkitResult({ success: true, usesRemaining: remaining - 1, hp: player.hp, deathSaves: player.deathSaves,
        playerRecovery:gs.getState().dmTools?.playerRecovery?.episode,
        mechanicalSummary: 'Trousse de soins : cible stabilisée à 0 PV sans jet de Médecine ni soin ; une utilisation consommée, un délai naturel unique de 1d4 heures enregistré.' })
    }
    if (id === 'antitoxin') {
      if (input.targetId !== undefined && input.targetId !== actor.id) toolkitError('ITEM_TARGET_INVALID', 'The selected actor drinks the antitoxin themselves.')
      gs.consumePlayerItem(other => other.id === item!.id); afterInventoryChange()
      const effect = addHeroEffect('antitoxin', actor.id, [actor.id], 3600)
      if (gs.getState().phase === 'combat') rules.recordAction(input.actorId)
      return toolkitResult({ success: true, effect, mechanicalSummary: 'Antitoxine consommée : avantage aux sauvegardes contre le poison pendant une heure ; aucun poison existant soigné.' })
    }
    if (id === 'torch' || id === 'candle') {
      if (input.targetId !== undefined) toolkitError('ITEM_TARGET_INVALID', 'Lighting a torch does not select a creature target.')
      if (actor.id !== 'player') toolkitError('LIGHT_ACTOR_UNSUPPORTED', 'This light source resolver currently supports player-held or ground items only.')
      return toolkitResult(manageLightSource(item!.id,'light'))
    }
    toolkitError('ITEM_EFFECT_UNSUPPORTED', 'This item has no implemented use here. Consult its source and use a dedicated supported tool.')
  }))
}
