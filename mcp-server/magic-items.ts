import type { MagicItemRecord } from '../lib/magic-item-state'
import { MAGIC_ITEMS, MAGIC_ITEM_SOURCE, type MagicItemId } from '../lib/srd/magic-items'
import { firstMapId, getAdventureMap } from '../lib/adventure-map'
import type { GameState } from '../lib/types'
import { rechargeOccurrences, RECHARGE_DAY } from '../lib/recharge-calendar-state'
import { toolkitError, assertToolkitReach } from './toolkit'
import { now } from './hero-rules'
import { rollDice } from './dice'
import * as gs from './game-state'

export const magicDay = () => Math.floor(now()/86400)
export const isSpellcaster = () => Boolean(gs.getPlayer().features?.includes('spellcasting') && gs.getPlayer().knownSpells?.length)
export function magicRecord(id: string): MagicItemRecord {
  const record=gs.getState().dmTools?.magicItems?.[id]
  if(!record)toolkitError('MAGIC_ITEM_NOT_REGISTERED','Choose an exact prepared magic item ID.')
  return record!
}
export function ownedMagic(id: string) {
  const record=magicRecord(id)
  if(record.status!=='active')toolkitError('MAGIC_ITEM_INACTIVE','This magic item was consumed or destroyed.')
  if(!gs.getPlayer().inventory.some(item=>item.id===id))toolkitError('ITEM_NOT_OWNED','The exact magic item must be in the player inventory.')
  return record
}
export function assertMagicTouch(id: string) {
  const record=magicRecord(id)
  if(record.status!=='active')toolkitError('MAGIC_ITEM_INACTIVE','This item has been consumed or destroyed.')
  if(!gs.getPlayer().inventory.some(item=>item.id===id)){
    const drop=gs.getState().droppedItems?.[id]
    if(!drop || !drop.roomId)toolkitError('MAGIC_ITEM_OUT_OF_REACH','Touch the owned item or its exact ground location.')
    assertToolkitReach({mapId:drop!.mapId,roomId:drop!.roomId!,cell:drop!.position})
  }
  return record
}
export function itemProperties(id: string) {
  const record=magicRecord(id), spec=MAGIC_ITEMS[record.templateId]
  return {templateId:record.templateId,label:spec.label,rarity:spec.rarity,kind:spec.kind,attunement:spec.attunement,
    protection:spec.protection,weaponBonus:spec.weaponBonus,shieldBonus:spec.shieldBonus,healing:spec.healing,
    spellId:spec.spellId,spellDc:spec.spellDc,maxCharges:spec.maxCharges,recharge:spec.recharge,activation:spec.activation,
    ...(spec.kind==='robe'?{enginePolicy:{wearer:'excluded_by_explicit_user_convention',timing:'keep_initiative_until_actual_next_turn_end'}}:{}),
    source:{title:'SRD 5.1',ruleset:'2014',url:MAGIC_ITEM_SOURCE,page:spec.page,...spec.dmgPage?{dmg2014Page:spec.dmgPage}:{},entry:spec.sourceName}}
}
export function magicSnapshot(id: string) {
  const record=magicRecord(id),item=gs.getPlayer().inventory.find(i=>i.id===id)??gs.getState().droppedItems?.[id]?.item
  return {itemId:id,name:item?.name,identified:record.identified,status:record.status,attuned:record.attunedTo==='player',worn:record.worn,
    ...(record.identified?{properties:itemProperties(id)}:{}),...(record.chargesKnown?{charges:record.charges}:{})}
}
export function identifyMagic(id: string, method: 'study'|'spell'|'taste'|'attunement') {
  const record=assertMagicTouch(id),spec=MAGIC_ITEMS[record.templateId]
  if(method==='taste'&&spec.kind!=='potion')toolkitError('MAGIC_IDENTIFICATION_METHOD','Only a potion can be identified by tasting.')
  record.identified=true
  if(method==='spell'||method==='attunement')record.chargesKnown=true
  return {success:true,method,item:magicSnapshot(id),notice:'Properties learned. No attunement granted by identification; curses are not revealed by these methods.'}
}
export function magicHeld(id: string) {
  const loadout=gs.getState().dmTools?.loadout
  return Boolean(loadout && [loadout.mainHandId,loadout.offHandId].includes(id))
}
export function assertMagicUse(id: string) {
  const record=ownedMagic(id),spec=MAGIC_ITEMS[record.templateId]
  if(spec.attunement!=='none'&&(record.attunedTo!=='player'||spec.attunement==='spellcaster'&&!isSpellcaster()))toolkitError('ATTUNEMENT_REQUIRED','Attune to this exact item with the real prerequisite first.')
  return {record,spec}
}
export function consumeMagicCharges(id: string, count: number) {
  const record=ownedMagic(id),spec=MAGIC_ITEMS[record.templateId]
  if(!Number.isInteger(count)||count<1||count>record.charges)toolkitError('MAGIC_CHARGES_UNAVAILABLE','Choose available charges explicitly.')
  record.charges-=count
  let breakRoll
  if(record.charges===0&&spec.lastChargeBreak){
    breakRoll=rollDice('1d20')
    if(breakRoll.total===1){record.status='destroyed';delete record.attunedTo;record.worn=false;gs.consumePlayerItem(item=>item.id===id)}
  }
  // Do not identify an item or reveal its remaining charges by merely using it.
  reconcileMagicItems()
  return {itemId:id,...(record.chargesKnown?{chargesRemaining:record.charges}:{}),destroyed:record.status==='destroyed',breakRoll}
}
export function validateMagicCast(id: string, charges: number, spellId: string) {
  const {record,spec}=assertMagicUse(id)
  if(spec.kind!=='wand'||spec.spellId!==spellId)toolkitError('MAGIC_ITEM_SPELL_MISMATCH','This item cannot cast the selected spell.')
  if(!magicHeld(id))toolkitError('MAGIC_ITEM_MUST_BE_HELD','Explicitly hold this exact wand before casting from it.')
  if(!Number.isInteger(charges)||charges<1||charges>record.charges)toolkitError('MAGIC_CHARGES_UNAVAILABLE','Choose a positive number of available charges.')
  return {level:spellId==='fireball'?charges+2:charges,dc:spec.spellDc}
}
function restoreCharges(state: GameState, record: MagicItemRecord, occurrences: number, action: string) {
  const spec = MAGIC_ITEMS[record.templateId]
  if (record.status !== 'active' || !spec.maxCharges || !spec.recharge) return
  for (let remaining = occurrences; remaining > 0 && record.charges < spec.maxCharges; remaining--) {
    const roll = rollDice(spec.recharge), before = record.charges
    record.charges = Math.min(spec.maxCharges, record.charges + roll.total)
    if (!record.attunedTo) record.chargesKnown = false
    gs.addLogEntry({round:state.round,turn:'system',action,
      mechanicalDetail:record.attunedTo==='player'? `${record.id} : ${record.charges-before} charge(s) récupérée(s) ; ${record.charges} restantes.`
        :'Recharge résolue ; quantité confidentielle.'})
  }
}

// Only actual forward clock commits call this. Changing custody/map at the same
// timestamp cannot replay either schedule or transfer time from another map.
function reconcileMagicRechargeCalendar() {
  const state = gs.getState(), calendar = state.dmTools?.rechargeCalendar, itemCalendar = state.dmTools?.itemRechargeCalendar
  const time = state.worldTimeSeconds ?? 0
  if ((!calendar || calendar.evaluatedThrough >= time) && (!itemCalendar || itemCalendar.evaluatedThrough >= time)) return
  const localOccurrences = calendar ? rechargeOccurrences(calendar.adoption.firstAt, time)
    - rechargeOccurrences(calendar.adoption.firstAt, calendar.evaluatedThrough) : 0
  const day = Math.floor(time / RECHARGE_DAY), maps = getAdventureMap(state).maps
  for (const record of Object.values(state.dmTools?.magicItems ?? {})) {
    const owned = state.player.inventory.some(item => item.id === record.id)
    const dropped = state.droppedItems?.[record.id]
    const mapId = owned && !dropped ? state.currentMapId ?? firstMapId(state)
      : !owned ? dropped?.mapId : undefined
    if (mapId && maps.some(map => map.id === mapId)) {
      const choice = Object.values(itemCalendar?.choices ?? {}).find(choice => choice.input.mapId === mapId
        && choice.input.itemIds.includes(record.id))
      if (choice)
        restoreCharges(state, record, rechargeOccurrences(choice.firstAt, time)
          - rechargeOccurrences(choice.firstAt, itemCalendar!.evaluatedThrough), 'Recharge d’objet sélectionné à l’horaire Xanathar local')
      else if (calendar && (mapId === calendar.adoption.input.mapId || Object.hasOwn(calendar.planeMaps ?? {}, mapId)))
        restoreCharges(state, record, localOccurrences, 'Recharge d’objet magique au cycle Xanathar')
      else
        restoreCharges(state, record, day - record.lastRechargeDay, 'Recharge d’objet magique à l’aube')
    }
    record.lastRechargeDay = Math.max(record.lastRechargeDay, day)
  }
  if (calendar) calendar.evaluatedThrough = time
  if (itemCalendar) itemCalendar.evaluatedThrough = time
}

export function reconcileMagicItems() {
  const state=gs.getState(), records=Object.values(state.dmTools?.magicItems??{})
  if(!records.length){reconcileMagicRechargeCalendar();return}
  const player=state.player,time=state.worldTimeSeconds??0,day=Math.floor(time/86400)
  for(const record of records){
    const spec=MAGIC_ITEMS[record.templateId],owned=player.inventory.some(item=>item.id===record.id)
    if(record.attunedTo){
      if(player.deathSaves?.dead || record.status!=='active' || spec.attunement==='spellcaster'&&!isSpellcaster())delete record.attunedTo
      else if(owned)delete record.awaySince
      else {
        const drop=state.droppedItems?.[record.id]
        const close=drop&&drop.mapId===(state.currentMapId??firstMapId(state))&&Math.max(Math.abs(drop.position.x-player.position.x),Math.abs(drop.position.y-player.position.y))<=20
        if(close)delete record.awaySince
        else {record.awaySince??=time;if(time-record.awaySince>=86400)delete record.attunedTo}
      }
    }
    if(!owned)record.worn=false
    if(!state.dmTools?.rechargeCalendar&&!state.dmTools?.itemRechargeCalendar){
      restoreCharges(state, record, day - record.lastRechargeDay, 'Recharge d’objet magique à l’aube')
      record.lastRechargeDay=Math.max(record.lastRechargeDay,day)
    }
  }
  reconcileMagicRechargeCalendar()
  if(!state.hero)return
  const held=state.dmTools?.loadout
  if(held)for(const slot of ['mainHandId','offHandId','shieldId','armorId'] as const)
    if(held[slot]&&!player.inventory.some(item=>item.id===held[slot]))delete held[slot]
  state.hero.effects=state.hero.effects.filter(effect=>effect.kind!=='magic-item-protection')
  for(const record of records){
    if(record.status!=='active'||!player.inventory.some(item=>item.id===record.id))continue
    const spec=MAGIC_ITEMS[record.templateId]
    if(spec.attunement!=='none'&&record.attunedTo!=='player')continue
    const bonus=record.worn?spec.protection??0:spec.kind==='shield'&&held?.shieldId===record.id?spec.shieldBonus??0:0
    if(bonus)state.hero.effects.push({id:`magic-protection:${record.id}`,kind:'magic-item-protection',sourceId:'player',targetIds:['player'],
      expiresAt:Number.MAX_SAFE_INTEGER,concentration:false,data:{itemId:record.id,acBonus:bonus,saveBonus:record.worn?spec.protection??0:0}})
  }
}
export function magicWeaponBonus(id: string|undefined) {
  if(!id)return 0
  const record=gs.getState().dmTools?.magicItems?.[id]
  return record?.status==='active'&&magicHeld(id)?MAGIC_ITEMS[record.templateId].weaponBonus??0:0
}
export function magicSaveBonus() {
  return gs.getState().hero?.effects.filter(e=>e.kind==='magic-item-protection'&&e.targetIds.includes('player')&&e.expiresAt>now())
    .reduce((sum,e)=>sum+Number(e.data.saveBonus??0),0)??0
}
