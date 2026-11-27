import type { UnderwaterWeaponContext } from '../lib/underwater-rules'
import { captureUnderwaterWeaponContext,automaticUnderwaterMiss } from './underwater'
import { randomUUID } from 'node:crypto'
import type { DiceRollResult } from '../lib/types'
import { attackAbilityFor,type WeaponHands } from '../lib/srd/weapons'
import type { WeaponAttackMode } from '../lib/two-weapon-state'
import { weaponProficiencyBonus } from '../lib/weapon-proficiency'
import { inferRoomIdOnMap } from '../lib/adventure-map'
import * as gs from './game-state'
import * as rules from './rules'
import { available,hero,now,distance,feature,spendHeroAction,bonusOnRoll,effects } from './hero-rules'
import { selectedWeaponItem,weaponForReference,weaponItemHeld,resolvePlayerWeaponUse,weaponAttackRangeCells,duelingApplies,afterInventoryChange,assertCanDrop } from './equipment'
import { playerHeavyWeaponContext,playerLanceWeaponContext,playerFinesseWeaponContext,rollWeaponDamage,type HeavyWeaponContext,type LanceWeaponContext,type FinesseWeaponContext } from './weapon-properties'
import { rollRuleD20 } from './roll-rules'
import { getAbilityModifier } from './dice'
import { magicWeaponBonus } from './magic-items'
import { visibleCell,frightenedByVisibleSource } from './monster-perception'
import { endInvisibility } from './monster-rules'
import { coverFor } from './cover'
import { rangedWeaponContext,assertHeldWeaponWeather,type RangedWeaponContext } from './ranged-weapon-rules'
import { weatherHeightCombatIssue } from '../lib/weather-state'
import { physicalHeightCombatIssue } from '../lib/jumping-state'
import { preflightWeaponAmmunition,commitWeaponAmmunition } from './ammunition'
import { reactionWindow } from './hero-combat'
import { toolkitError,toolkitResult } from './toolkit'
import { registerToolkitAttack } from './toolkit-checks'
import { accessibleNet,replayNetReceipt,assertNetReceiptCapacity,saveNetReceipt,applyNetSlashing } from './nets'
import { improvisedAttackContext,captureThrownFlame,commitPhysicalThrow,type ImprovisedAttackContext } from './weapon-transfer'
import type { WeatherThrownFlamePlan } from '../lib/lighting-state'

export interface NetAttackInput {eventId:string;netId:string;weaponId:string;weaponHands?:WeaponHands;weaponAbility?:'str'|'dex';attackMode?:WeaponAttackMode;ammunitionItemId?:string;newAttackAction?:boolean}
interface NetAttackContext {attackId:string;scopeId:string;mapId:string;actorCell:{x:number;y:number};netCell:{x:number;y:number};weaponId:string;
  hands?:WeaponHands;heavy?:HeavyWeaponContext;lance?:LanceWeaponContext;finesse?:FinesseWeaponContext;ranged?:RangedWeaponContext;
  underwater?:UnderwaterWeaponContext;improvised?:ImprovisedAttackContext;flame?:WeatherThrownFlamePlan}
function preflight(input:NetAttackInput,context?:NetAttackContext,validatingPending=false){
  const found=accessibleNet(input.netId),actor=gs.getPlayer(),weapon=weaponForReference(input.weaponId),item=selectedWeaponItem(input.weaponId)
  const heightIssue=physicalHeightCombatIssue(gs.getState(),['player',found.target.id])??weatherHeightCombatIssue(gs.getState(),['player',found.target.id]);if(heightIssue)toolkitError(heightIssue.code,heightIssue.message)
  if(!weapon||!item||!weaponItemHeld(item))toolkitError('NET_ATTACK_WEAPON_REQUIRED','Choose the exact actually held registered physical weapon for the attack against the net.')
  if(weapon.special==='net')toolkitError('NET_REQUIRES_CREATURE','A net restrains an actual creature; it is not a damaging weapon against another net.')
  if(weapon.damageType!=='slashing')toolkitError('NET_DAMAGE_PROCEDURE_UNSUPPORTED','This dedicated procedure resolves the published five-slashing release route. Other damage/destruction outcomes are not modeled here; no universal net immunity is asserted and no die, action or ammunition is spent.')
  if(input.attackMode&&weapon.properties.includes('ranged'))toolkitError('ATTACK_MODE_INVALID','A ranged weapon uses its ranged profile, not an explicit melee/thrown mode.')
  if(input.attackMode==='thrown'&&!weapon.properties.includes('thrown'))toolkitError('WEAPON_NOT_THROWABLE','The actual selected weapon has no thrown property.')
  const use=resolvePlayerWeaponUse(weapon,item,input.weaponHands,input.attackMode)
  const thrown=Boolean(input.attackMode==='thrown'||weapon.properties.includes('ranged')&&weapon.properties.includes('thrown'))
  if(thrown&&(!weapon.improvised||weapon.improvised.targetKind==='item'))assertCanDrop(item.id)
  if(context&&weapon.improvised&&!context.improvised)toolkitError('IMPROVISED_HELD_CONTEXT_REQUIRED','The held net-object attack requires its original physical ruling, target and landing.')
  improvisedAttackContext(input.weaponId,found.drop.position,thrown,context?.improvised)
  if(context?.flame)captureThrownFlame(item.id,actor.position,found.drop.position,context.attackId,context.flame)
  if(context){
    if(typeof context.attackId!=='string'||!context.attackId||typeof context.scopeId!=='string'||!context.scopeId||!context.actorCell||!context.netCell
      ||context.mapId!==gs.getState().currentMapId||context.weaponId!==item.id||context.actorCell.x!==actor.position.x||context.actorCell.y!==actor.position.y
      ||context.netCell.x!==found.drop.position.x||context.netCell.y!==found.drop.position.y||context.hands!==use.hands)toolkitError('NET_HELD_ATTACK_INVALID','The held real net/object attack must keep its original positions, weapon and hands.')
    if(weapon.properties.includes('heavy')&&!context.heavy)toolkitError('HEAVY_HELD_CONTEXT_REQUIRED','The original Heavy context is required before a reaction die or cost.')
    if(weapon.special==='lance'&&!context.lance)toolkitError('LANCE_HELD_CONTEXT_REQUIRED','The original lance context is required before a reaction die or cost.')
    if(weapon.properties.includes('finesse')&&!context.finesse)toolkitError('FINESSE_HELD_CONTEXT_REQUIRED','The original finesse ability/modifier witness is required before a reaction die or cost.')
  }
  const heavy=playerHeavyWeaponContext(weapon,context?.heavy),lance=playerLanceWeaponContext(weapon,distance(actor.position,found.drop.position),context?.lance)
  const finesse=playerFinesseWeaponContext(weapon,input.weaponAbility,context?.finesse)
  if(validatingPending){
    if(actor.hp.current<=0||actor.deathSaves?.dead||actor.conditions.some(c=>['incapacitated','paralyzed','stunned','unconscious','petrified'].includes(c)))toolkitError('NET_HELD_ATTACK_INVALID','The original actor must still be capable before spending a reaction bonus die.')
    if(gs.getState().phase==='combat'){
      if(gs.getState().currentTurn!=='player'||!gs.getState().initiativeOrder.includes('player'))toolkitError('NET_HELD_ATTACK_INVALID','The original net-object attack must still belong to its actual player turn.')
      if((input.newAttackAction||!(hero().attackAction?.remaining??0))&&hero().actionCredits<=0)toolkitError('ACTION_ALREADY_USED','No real action credit remains for the original held net-object attack.')
    }
  }else if(gs.getState().phase==='combat'){
    rules.validateFreeCombatAction('player')
    if(input.newAttackAction||!(hero().attackAction?.remaining??0))rules.validateActionUse('player')
  }else {rules.validateActionUse('player');if(input.newAttackAction!==undefined)toolkitError('NEW_ATTACK_ACTION_NOT_APPLICABLE','Outside combat there is no additional paid combat Attack action to select.')}
  if(distance(actor.position,found.drop.position)>weaponAttackRangeCells(weapon,input.attackMode))toolkitError('NET_ATTACK_OUT_OF_RANGE','The actual net is outside this weapon’s sourced reach or long range.')
  if(!visibleCell({...actor,conditions:actor.conditions.filter(c=>c!=='blinded')},found.drop.position))toolkitError('ATTACK_PATH_BLOCKED','A real wall or closed door blocks this attack against the net.')
  if(coverFor(actor.id,found.target.id).degree!=='none')toolkitError('NET_OBJECT_COVER_UNSUPPORTED','An actual cover declaration affects this captive position. Net-object cover needs its own established scope; creature cover is not silently transferred or ignored. Reposition to an unobstructed origin first.')
  const ranged=weapon.properties.includes('ranged')||input.attackMode==='thrown'
    ?context?.ranged??rangedWeaponContext(actor,{...found.target,position:found.drop.position},weapon.normalRangeCells!,weapon.longRangeCells!):undefined
  if(context&&ranged)assertHeldWeaponWeather(ranged)
  const underwater=captureUnderwaterWeaponContext({actorId:'player',target:{kind:'creature',entityId:found.target.id},weaponReference:item.id,canonicalWeaponId:weapon.improvised?.profileId??weapon.id,attackMode:input.attackMode??'melee',melee:!(weapon.properties.includes('ranged')||input.attackMode==='thrown'),weaponAttack:true,normalRangeCells:weapon.normalRangeCells,distanceCells:distance(actor.position,found.drop.position)},context?.underwater)
  return {...found,actor,weapon,item,use,heavy,lance,finesse,ranged,underwater}
}
export function validateHeldNetAttack(command:Record<string,unknown>){
  if(command.domain!=='net-object')return
  const input=command.input as NetAttackInput,context=command.context as NetAttackContext
  if(!input||!context)toolkitError('NET_HELD_ATTACK_INVALID','The original net attack command is incomplete.')
  const data=preflight(input,context,true)
  preflightWeaponAmmunition({weapon:data.weapon,weaponItem:data.item,ammunitionItemId:input.ammunitionItemId,scopeId:context.scopeId,attackId:context.attackId,held:true})
}
export function attackNet(input:NetAttackInput,held?:{roll:DiceRollResult;context:NetAttackContext}){
  const command=JSON.stringify({operation:'attack',...input}),prior=replayNetReceipt(input.eventId,command)
  if(prior)return prior
  if(!held)available()
  assertNetReceiptCapacity()
  const data=preflight(input,held?.context),{actor,weapon,item,net}=data
  const starting=Boolean(input.newAttackAction||!hero().attackAction?.remaining)
  const context:NetAttackContext=held?.context??{attackId:randomUUID(),scopeId:starting?randomUUID():hero().attackAction!.id??toolkitError('ATTACK_ACTION_IDENTITY_REQUIRED','This actual action lacks its original identity; finish it before this net attack.'),
    underwater:data.underwater,mapId:gs.getState().currentMapId!,actorCell:{...actor.position},netCell:{...data.drop.position},weaponId:item.id,hands:data.use.hands,
    ...(data.heavy?{heavy:data.heavy}:{}),...(data.lance?{lance:data.lance}:{}),...(data.finesse?{finesse:data.finesse}:{}),...(data.ranged?{ranged:data.ranged}:{})}
  const ammunition=preflightWeaponAmmunition({weapon,weaponItem:item,ammunitionItemId:input.ammunitionItemId,scopeId:context.scopeId,attackId:context.attackId,held:Boolean(held)})
  if(!held){
    const thrown=Boolean(input.attackMode==='thrown'||weapon.properties.includes('ranged')&&weapon.properties.includes('thrown'))
    context.improvised=improvisedAttackContext(input.weaponId,data.drop.position,thrown)
    if(thrown)context.flame=captureThrownFlame(item.id,actor.position,data.drop.position,context.attackId)
  }
  const ability=data.finesse?.ability??attackAbilityFor(weapon,actor.stats),modifier=data.finesse?.modifier??getAbilityModifier(actor.stats[ability]),enchantment=magicWeaponBonus(item.id)
  const automaticMiss=data.underwater.automaticMiss
  const roll=held?.roll??(automaticMiss?automaticUnderwaterMiss():rollRuleD20('player','attack',modifier+weaponProficiencyBonus(actor,weapon)+enchantment,false,
    Boolean(data.underwater.disadvantage||data.heavy?.disadvantage||data.lance?.disadvantage||data.ranged?.longRangeDisadvantage||data.ranged?.proximityDisadvantage||data.ranged?.strongWindDisadvantage
      ||actor.conditions.some(c=>['blinded','poisoned','restrained','prone'].includes(c))||frightenedByVisibleSource(actor.id)),ability))
  const ammoReceipt=ammunition?commitWeaponAmmunition(ammunition,data.drop.position):undefined
  if(!held&&!automaticMiss){const bless=bonusOnRoll('attack','player');roll.modifier+=bless;roll.total+=bless}
  if(!held&&!automaticMiss&&hero().inspiration.some(entry=>entry.targetId==='player'&&entry.expiresAt>now()))return reactionWindow('attack','player',net.targetId,['bardic_inspiration','decline'],
    {type:'toolkit_attack',domain:'net-object',input,context,inspiredActorId:'player'},roll)
  const natural=roll.rolls[0],critical=natural===20||feature('improved_critical')&&natural===19,hit=!automaticMiss&&(critical||natural!==1&&roll.total>=10)
  const damageRoll=hit?rollWeaponDamage(data.use.damageDie,modifier+enchantment+(duelingApplies(weapon,data.use.hands)?2:0),critical):undefined
  const slashing=damageRoll&&weapon.damageType==='slashing'?Math.max(0,damageRoll.total):0
  const resolution=applyNetSlashing(net,slashing)
  if(gs.getState().phase==='combat'){
    if(starting)spendHeroAction()
    const used=starting?1:hero().attackAction!.used+1
    hero().attackAction={id:context.scopeId,used,remaining:Math.max(0,(feature('extra_attack')?2:1)-used)}
  }
  let thrownItem:unknown
  if(input.attackMode==='thrown'||weapon.properties.includes('ranged')&&weapon.properties.includes('thrown')){
    thrownItem=commitPhysicalThrow(item.id,data.drop.position,context.improvised,context.flame);afterInventoryChange()
  }
  endInvisibility('player')
  for(const effect of [...effects('hidden','player'),...effects('vicious-mockery','player')])hero().effects=hero().effects.filter(other=>other.id!==effect.id)
  return saveNetReceipt(input.eventId,command,{success:true,eventId:input.eventId,netId:net.id,underwaterContext:data.underwater,automaticMiss,attackRoll:roll,targetAC:10,hit,criticalHit:critical,
    damageRoll,damageType:weapon.damageType,slashingDamageThisAttack:slashing,...resolution,captiveDamage:0,weaponHands:data.use.hands,
    ...(data.finesse?{weaponAbility:data.finesse.ability,finesseContext:data.finesse}:{}),
    ...(ammoReceipt?{ammunition:ammoReceipt}:{}),...(thrownItem?{thrownItem}:{}),
    mechanicalSummary:`Attaque réelle contre le filet CA10 : ${roll.detail}, ${hit?'touché':'raté'} ; ${slashing} dégâts tranchants comptés. ${resolution.destroyed?'Filet détruit, sa propre entrave prend fin.':'Le filet demeure.'} Aucun dégât au captif.`})
}
export function registerNetAttackResolutions(){registerToolkitAttack('net-object',(command,roll)=>attackNet(command.input as unknown as NetAttackInput,{roll,context:command.context as unknown as NetAttackContext}))}
