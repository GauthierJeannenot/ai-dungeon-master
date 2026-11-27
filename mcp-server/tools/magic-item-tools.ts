import { ChimeInputSchema,RobeInputSchema } from '../../lib/charged-item-state'
import { useChime,useRobe,registerChargedItemResolutions } from '../charged-items'
import { LightObjectSelectionSchema } from '../../lib/light-spell-state'
import { SpellObserversSchema } from '../../lib/spell-perception-state'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { SpellAreaSelectionSchema } from '../../lib/spell-area-state'
import { MAGIC_ITEM_IDS, MAGIC_ITEMS, MAGIC_ITEM_SOURCE } from '../../lib/srd/magic-items'
import { ToolkitCellSchema, ToolkitDescriptionSchema, ToolkitIdSchema } from '../../lib/dm-tool-state'
import { toolkitState, toolkitError, toolkitResult, toolkitLocation, toolkitTransaction } from '../toolkit'
import { magicRecord, magicSnapshot, ownedMagic, identifyMagic, assertMagicTouch, assertMagicUse, magicDay, isSpellcaster, consumeMagicCharges, reconcileMagicItems } from '../magic-items'
import { available, shortRest, healingRoll, healCreature, spendHeroAction } from '../hero-rules'
import { spendObjectInteraction, afterInventoryChange } from '../equipment'
import { cast5eSpell } from '../hero-spells'
import { audibleSpeechStatus } from '../spell-components'
import { finishShortRestStudy } from '../resting'
import { assertKnockoutHealingSupported } from '../nonlethal'
import { visibleCell } from '../monster-perception'
import * as gs from '../game-state'
import * as rules from '../rules'
import { assertGreaterBrewingIdAvailable } from '../toolkit'

function outsideCombat() { available();if(gs.getState().phase==='combat')toolkitError('MAGIC_REQUIRES_REST','This preparation/focus requires time outside combat.') }
const focusFields={hitDice:z.number().int().min(0).max(7).optional(),arcaneRecovery:z.array(z.number().int().min(1).max(4)).optional(),songOfRest:z.boolean().optional()}
export function registerMagicItemTools(server: McpServer) {
  registerChargedItemResolutions()
  server.registerTool('use_chime_of_opening',{description:'Activate one exact owned held2014 Chime of Opening against one real single-lock/latch prepared container within120feet. Explicit current sound-route fact. One action/use even if actual sound cannot reach; one lock/latch per use, object opens only when no lock/latch remains. Ten total uses, then useless; never dawn recharge. Unqualified doors/compound/magic mechanisms refuse before cost. Same event replays without a new use.',inputSchema:ChimeInputSchema.shape},async input=>toolkitTransaction(()=>toolkitResult(useChime(input))))
  server.registerTool('activate_scintillating_robe',{description:'Activate one exact worn attuned2014 Robe of Scintillating Colors on the actual player initiative turn. One action/charge, bright30ft plus dim30ft; source-visual attackers have disadvantage. By explicit user convention the wearer is excluded; every other physically represented creature initially seeing the wearer in its bright light make their realWIS15save, each die retained through Bardic/SQL. Failed saves stun until the actual next player-turn end. Keep initiative through the actual next wearer-turn end before end_combat; no12second conversion. No concentration or new monster ability. Exact event retry never pays/rerolls.',inputSchema:RobeInputSchema.shape},async input=>toolkitTransaction(()=>useRobe(input)))
  server.registerTool('inspect_magic_items',{
    description:'Without itemId: read the bounded implemented SRD 5.1 (2014) magic-item catalog and source pages, for confidential MJ preparation only. With itemId: read only identified properties and known remaining charges of that registered physical item. Reading the catalog never identifies an item in fiction. Not an action, discovery, attunement or recharge. Unsupported artifacts/curses/scrolls are not invented.',
    inputSchema:{itemId:ToolkitIdSchema.optional()},annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false},
  },async({itemId})=>toolkitTransaction(()=>toolkitResult(itemId?magicSnapshot(itemId):{
    source:MAGIC_ITEM_SOURCE,items:MAGIC_ITEM_IDS.map(id=>({templateId:id,...MAGIC_ITEMS[id]})),
    notice:'Confidential source catalog, not player knowledge or acquisition. Only these templates have implemented effects.'})))
  server.registerTool('create_magic_item',{
    description:'MJ preparation outside combat: place one supported SRD magic-item template at an explicit active-map room cell, with a unique itemId and appearance description. No direct inventory grant, identification, attunement or invented powers. Pick up with pick_up_item. Optional initialCharges may lower the source maximum for a found wand/pearl; never higher. Same ID/arguments repeat is idempotent, including consumed/destroyed items. New wording never refills an existing instance. At most 64 registered instances, tombstones retained.',
    inputSchema:{itemId:ToolkitIdSchema,templateId:z.enum(MAGIC_ITEM_IDS),name:z.string().trim().min(1).max(80),description:ToolkitDescriptionSchema,cell:ToolkitCellSchema,initialCharges:z.number().int().min(0).max(10).optional()},
    annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:true,openWorldHint:false},
  },async input=>toolkitTransaction(()=>{
    outsideCombat()
    const state=gs.getState(),data=toolkitState(),spec=MAGIC_ITEMS[input.templateId],creation=JSON.stringify(input),existing=data.magicItems?.[input.itemId]
    if(existing){if(existing.creation!==creation)toolkitError('MAGIC_ITEM_ID_CONFLICT','An item with this ID already has another immutable definition.')
      return toolkitResult({success:true,alreadyCreated:true,item:magicSnapshot(input.itemId)})}
    assertGreaterBrewingIdAvailable(input.itemId)
    if(data.spellScrolls?.[input.itemId]||state.player.inventory.some(i=>i.id===input.itemId)||state.droppedItems?.[input.itemId]||gs.getEntity(input.itemId)||gs.getNpc(input.itemId))toolkitError('MAGIC_ITEM_ID_CONFLICT','This physical item/actor ID is already in use.')
    if(Object.keys(data.magicItems??{}).length>=64)toolkitError('MAGIC_ITEM_LIMIT','At most 64 magic item instances per session.')
    if(input.initialCharges!==undefined&&(!spec.maxCharges||input.initialCharges>spec.maxCharges))toolkitError('MAGIC_CHARGE_CONFIGURATION','Initial charges must fit the template; consumables/passive items have no charge pool.')
    const location=toolkitLocation(input.cell)
    data.magicItems??={};data.magicItems[input.itemId]={id:input.itemId,templateId:input.templateId,creation,identified:false,chargesKnown:false,
      charges:input.initialCharges??spec.maxCharges??0,status:'active',worn:false,lastRechargeDay:magicDay()}
    state.droppedItems??={};state.droppedItems[input.itemId]={item:{id:input.itemId,name:input.name,description:input.description,
      equipmentId:spec.equipmentId??input.templateId,type:spec.kind==='weapon'?'weapon':spec.kind==='shield'?'armor':spec.kind==='potion'?'potion':'misc',magical:true},
      mapId:location.mapId,roomId:location.roomId,position:{...input.cell}}
    return toolkitResult({success:true,item:magicSnapshot(input.itemId),source:{url:MAGIC_ITEM_SOURCE,page:spec.page},notice:'Placed on ground; no player discovery, ownership or magical bond.'})
  }))
  server.registerTool('identify_magic_item',{
    description:'Identify one exact touched registered magic item. method=study spends its OWN uninterrupted short rest (one hour), with explicitly optional hit dice/Arcane Recovery/Song of Rest; properties only, not remaining charges. method=taste identifies a potion with one free object interaction, without consuming it or granting healing. method=spell casts the actually known Identify spell, requiring the real declared identification pearl and its normal time/slot or explicit ritual; reveals remaining charges, never attunement or curses. Study and attunement cannot share a rest. No generic Arcana check or successful narration substitutes for this resolver.',
    inputSchema:{itemId:ToolkitIdSchema,method:z.enum(['study','taste','spell']),ritual:z.boolean().optional(),spellbookItemId:z.string().min(1).optional(),slotLevel:z.number().int().min(1).max(4).optional(),materialItemId:z.string().optional(),focusItemId:z.string().min(1).optional(),...focusFields},
  },async input=>toolkitTransaction(()=>{
    available();rules.validateActionUse('player');assertMagicTouch(input.itemId)
    const spellArgs=input.ritual!==undefined||input.spellbookItemId!==undefined||input.slotLevel!==undefined||input.materialItemId!==undefined||input.focusItemId!==undefined
    const restArgs=input.hitDice!==undefined||input.arcaneRecovery!==undefined||input.songOfRest!==undefined
    if(input.method!=='spell'&&spellArgs||input.method!=='study'&&restArgs)toolkitError('MAGIC_IDENTIFICATION_ARGUMENTS','Select only arguments for the chosen identification method.')
    if(input.method==='spell')return cast5eSpell({spellId:'identify',itemId:input.itemId,ritual:input.ritual,spellbookItemId:input.spellbookItemId,slotLevel:input.slotLevel,materialItemId:input.materialItemId,focusItemId:input.focusItemId})
    if(input.method==='taste'){
      if(!gs.getPlayer().inventory.some(i=>i.id===input.itemId))toolkitError('ITEM_NOT_OWNED','Pick up the potion before tasting it.')
      const answer=identifyMagic(input.itemId,'taste');spendObjectInteraction();return toolkitResult(answer)
    }
    outsideCombat()
    const rest=shortRest(input),identified=identifyMagic(input.itemId,'study')
    finishShortRestStudy(rest)
    return toolkitResult({...identified,rest})
  }))
  server.registerTool('attune_magic_item',{
    description:'Attune to, or voluntarily end attunement to, one exact OWNED registered item, using a separate uninterrupted short rest. Player only, outside combat. Maximum three distinct attunements; two copies of one template cannot be attuned together. Spellcaster prerequisites use actual class magic, never an item. Identification is not required first; completed attunement teaches properties, command use and remaining charges. Repeating an existing bond changes nothing and grants no free rest. No cursed template is supported. Dropping disables worn benefits immediately; a bond ends after actual death, lost prerequisites or >100 feet for 24 hours. No swapping mid-rest or implicit fourth-item replacement.',
    inputSchema:{itemId:ToolkitIdSchema,operation:z.enum(['attune','end']),...focusFields},
  },async input=>toolkitTransaction(()=>{
    outsideCombat();reconcileMagicItems()
    const record=ownedMagic(input.itemId),spec=MAGIC_ITEMS[record.templateId],attuned=Object.values(toolkitState().magicItems??{}).filter(r=>r.attunedTo==='player')
    if(input.operation==='end'){
      if(!record.attunedTo)toolkitError('ITEM_NOT_ATTUNED','This item has no player bond to end.')
      const rest=shortRest(input);delete record.attunedTo;delete record.awaySince;reconcileMagicItems()
      finishShortRestStudy(rest)
      return toolkitResult({success:true,rest,item:magicSnapshot(input.itemId)})
    }
    if(spec.attunement==='none')toolkitError('ATTUNEMENT_NOT_REQUIRED','This template needs no attunement and must not consume a slot.')
    if(record.attunedTo==='player')return toolkitResult({success:true,alreadyAttuned:true,item:magicSnapshot(input.itemId)})
    if(spec.attunement==='spellcaster'&&!isSpellcaster())toolkitError('ATTUNEMENT_PREREQUISITE','The player needs real class spellcasting, not a magic item.')
    if(attuned.length>=3)toolkitError('ATTUNEMENT_LIMIT','End an existing bond explicitly before attempting a fourth.')
    if(attuned.some(r=>r.templateId===record.templateId))toolkitError('DUPLICATE_ATTUNEMENT','Two copies of the same item cannot be attuned together.')
    const rest=shortRest(input);record.attunedTo='player';delete record.awaySince
    const learned=identifyMagic(record.id,'attunement');reconcileMagicItems()
    finishShortRestStudy(rest)
    return toolkitResult({...learned,rest,attunedCount:attuned.length+1})
  }))
  server.registerTool('wear_magic_item',{
    description:'Explicitly wear/remove an owned ring or cloak, using one free object interaction then an action in combat. Attunement and wearing are distinct; carried/removed items give no protection. One cloak at a time. Wands and weapons must use equip_item in a hand; shields use its shield slot. Wearing does not identify, attune or spend charges.',
    inputSchema:{itemId:ToolkitIdSchema,operation:z.enum(['wear','remove'])},
  },async input=>toolkitTransaction(()=>{
    available()
    if(gs.getState().phase==='combat')rules.validateFreeCombatAction('player');else rules.validateActionUse('player')
    const record=ownedMagic(input.itemId),spec=MAGIC_ITEMS[record.templateId]
    if(!['ring','cloak','robe'].includes(spec.kind))toolkitError('MAGIC_WEAR_SLOT','Only supported rings/cloaks use this tool.')
    const wear=input.operation==='wear'
    if(record.worn===wear)toolkitError('MAGIC_ALREADY_IN_STATE','This item is already worn/removed.')
    if(wear&&spec.kind==='cloak'&&Object.values(toolkitState().magicItems??{}).some(r=>r.worn&&MAGIC_ITEMS[r.templateId].kind==='cloak'))
      toolkitError('CLOAK_SLOT_OCCUPIED','Remove the existing cloak explicitly first.')
    spendObjectInteraction();record.worn=wear;reconcileMagicItems()
    return toolkitResult({success:true,item:magicSnapshot(input.itemId),mechanicalSummary:`Objet ${wear?'porté':'retiré'} ; les protections dépendent de l’harmonisation réelle.`})
  }))
  server.registerTool('use_magic_item',{
    description:'Activate one exact owned supported magic item with real costs. A held wand uses explicitly selected charges to cast its fixed source spell, with source DC, range, damage and one action, no known-spell requirement/components/user spell slots. Fireball requires exact toCell and source attunement; Magic Missiles supports one exact target (no dart splitting). Pearl of Power requires attunement, an audible command and a selected expended slot level 1-3; one action and one dawn-restored use. A potion uses an action, is consumed and heals the explicit living engine target within touch (player may be unconscious but not dead). Passive weapons/shields use equip_item and normal attack tools; rings/cloaks use wear_magic_item. No arbitrary effect, charge refund or automatic target choice.',
    inputSchema:{lightObject:LightObjectSelectionSchema.optional(),spellObservers:SpellObserversSchema.optional(),itemId:ToolkitIdSchema,charges:z.number().int().min(1).max(7).optional(),targetId:z.string().optional(),toCell:ToolkitCellSchema.optional(),area:SpellAreaSelectionSchema.optional(),
      slotLevel:z.number().int().min(1).max(3).optional(),sculptTargetIds:z.array(z.string()).max(4).optional()},
  },async input=>toolkitTransaction(()=>{
    available();rules.validateActionUse('player')
    const {record,spec}=assertMagicUse(input.itemId)
    if(spec.kind==='wand'){
      if(input.charges===undefined||input.slotLevel!==undefined)toolkitError('MAGIC_USE_ARGUMENTS','Select wand charges explicitly, not a user slot.')
      if(spec.spellId==='magic-missile'&&(!input.targetId||input.toCell||input.area||input.sculptTargetIds)||spec.spellId==='fireball'&&(!input.toCell&&!input.area||input.targetId))toolkitError('MAGIC_USE_ARGUMENTS','Select one exact missile target, or one Fireball center.')
      return cast5eSpell({lightObject:input.lightObject,spellObservers:input.spellObservers,spellId:spec.spellId,magicItemId:input.itemId,itemCharges:input.charges,targetId:input.targetId,toCell:input.toCell,area:input.area,sculptTargetIds:input.sculptTargetIds})
    }
    if(input.lightObject!==undefined||input.spellObservers!==undefined||input.charges!==undefined||input.toCell||input.area||input.sculptTargetIds)toolkitError('MAGIC_USE_ARGUMENTS','These arguments belong to a wand.')
    if(spec.kind==='pearl'){
      if(input.targetId||input.slotLevel===undefined)toolkitError('MAGIC_USE_ARGUMENTS','Choose one expended player spell slot of level 1-3.')
      if(audibleSpeechStatus(gs.getState(),'player').blocked)toolkitError('COMMAND_WORD_INAUDIBLE','An established silence or gag prevents the audible command word.')
      const pool=gs.getPlayer().spellSlots?.[`level${input.slotLevel as 1|2|3}`]
      if(!pool||pool.current>=pool.max)toolkitError('MAGIC_SLOT_NOT_EXPENDED','Select an actual expended slot; the pearl never increases a maximum.')
      const charge=consumeMagicCharges(record.id,1);pool.current++;spendHeroAction()
      return toolkitResult({success:true,...charge,slotLevel:input.slotLevel,spellSlots:gs.getPlayer().spellSlots,mechanicalSummary:'Perle de puissance : un emplacement dépensé restauré ; une action et une utilisation consommées.'})
    }
    if(spec.kind==='potion'){
      if(input.slotLevel!==undefined||!input.targetId)toolkitError('MAGIC_USE_ARGUMENTS','Choose the actual drinker targetId, without a spell slot.')
      const actor=gs.getPlayer(),target=gs.getEntity(input.targetId)
      if(!target||target.id==='player'&&actor.deathSaves?.dead||'isAlive'in target&&!target.isAlive)toolkitError('POTION_TARGET_INVALID','A potion heals but never resurrects a dead creature.')
      assertKnockoutHealingSupported(target!,1)
      if(Math.max(Math.abs(target!.position.x-actor.position.x),Math.abs(target!.position.y-actor.position.y))>1||!visibleCell({...actor,conditions:actor.conditions.filter(c=>c!=='blinded')},target!.position))toolkitError('POTION_OUT_OF_REACH','Touch the selected drinker without a blocking wall.')
      const roll=healingRoll(spec.healing!,target!.id),before=target!.hp.current
      if(target!.id==='player')gs.updatePlayerHP(Math.max(0,roll.total));else gs.updateMonsterHP(target!.id,Math.max(0,roll.total))
      const healed={targetId:target!.id,hpBefore:before,hpAfter:target!.hp.current,healing:target!.hp.current-before}
      gs.consumePlayerItem(item=>item.id===record.id);record.status='consumed';record.worn=false;delete record.attunedTo
      afterInventoryChange();spendHeroAction()
      return toolkitResult({success:true,...healed,roll,consumedItemId:record.id,mechanicalSummary:`Potion consommée : ${healed.healing} PV restaurés, une action.`})
    }
    toolkitError('PASSIVE_MAGIC_ITEM','Use actual equipment/attack tools for this passive item.')
  }))
}
