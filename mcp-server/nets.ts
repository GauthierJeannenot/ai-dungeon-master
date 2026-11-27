import type { GameState,MonsterState,PlayerState,DroppedItem,AbilityCheckResult } from '../lib/types'
import type { WeaponSpec } from '../lib/srd/weapons'
import { netStateOf,NetTargetWitnessSchema,type NetState,type NetBinding,type NetTargetWitness } from '../lib/net-state'
import { carryingStateOf } from '../lib/carrying-state'
import { inferRoomIdOnMap } from '../lib/adventure-map'
import * as gs from './game-state'
import * as rules from './rules'
import { toolkitState,toolkitError,toolkitResult } from './toolkit'
import { available,hero,now,distance,addHeroEffect,removeHeroEffect } from './hero-rules'
import { conditionImmune,monsterSource } from './monster-rules'
import { visibleCell } from './monster-perception'
import { persistedConditionTarget,hasPersistedConditionProvider,applyPersistedRestoredCondition } from './persisted-conditions'
import { checkedResolution,registerCheckedResolution } from './toolkit-checks'
import { inspectExhaustion } from './exhaustion'
import { weatherHeightCombatIssue } from '../lib/weather-state'
import { physicalHeightCombatIssue } from '../lib/jumping-state'

const state=():NetState=>((toolkitState() as NonNullable<GameState['dmTools']>&{nets?:NetState}).nets??={version:1,forms:{},bindings:{},receipts:{}})
const objectEntry=<T>(records:Record<string,T>|undefined,id:string)=>records&&Object.hasOwn(records,id)?records[id]:undefined
export const netBinding=(id:string):NetBinding=>objectEntry(netStateOf(gs.getState())?.bindings,id)??toolkitError('NET_NOT_FOUND','Select the exact actual thrown net binding ID.')
function replay(eventId:string,command:string){
  const receipt=objectEntry(netStateOf(gs.getState())?.receipts,eventId)
  if(receipt&&receipt.command!==command)toolkitError('NET_EVENT_CONFLICT','This event ID already belongs to another exact net operation.')
  return receipt
}
export function assertNetReceiptCapacity(){if(Object.keys(netStateOf(gs.getState())?.receipts??{}).length>=1024)toolkitError('NET_RECEIPT_LIMIT','The net receipt limit was reached before dice or costs.')}
export function saveNetReceipt(eventId:string,command:string,result:unknown){state().receipts[eventId]={command,result};return toolkitResult(result)}
export function replayNetReceipt(eventId:string,command:string){const previous=replay(eventId,command);return previous?toolkitResult(previous.result):undefined}
export function setNetCreatureForm(input:{eventId:string;entityId:string;formless:boolean;source:string;reason:string}) {
  const command=JSON.stringify({operation:'form',...input}),prior=replayNetReceipt(input.eventId,command)
  if(prior)return prior
  available();assertNetReceiptCapacity()
  const target=gs.getEntity(input.entityId)
  if(!target)toolkitError('ENTITY_NOT_FOUND','Establish the form of an actual current actor, never an archive or a guessed NPC.')
  const forms=netStateOf(gs.getState())?.forms??{}
  if(!Object.hasOwn(forms,input.entityId)&&Object.keys(forms).length>=256)toolkitError('NET_FORM_LIMIT','The actual net form fact limit was reached.')
  const fact={entityId:input.entityId,formless:input.formless,source:input.source,reason:input.reason,at:now()}
  state().forms[input.entityId]=fact;reconcileNets()
  return saveNetReceipt(input.eventId,command,{success:true,form:fact,notice:'Records an explicitly established physical fact only; creates no transformation, creature, token, mount or item.'})
}
export function netTargetWitness(target:PlayerState|MonsterState):NetTargetWitness {
  const native=monsterSource(target),fact=carryingStateOf(gs.getState())?.actors[target.id]
  const size=native?.size??fact?.size
  if(!size||!['Tiny','Small','Medium','Large','Huge','Gargantuan'].includes(size))toolkitError('NET_TARGET_SIZE_REQUIRED','The exact creature needs its real sourced size; Medium is not inferred.')
  const form=objectEntry(netStateOf(gs.getState())?.forms,target.id),immune=conditionImmune(target,'restrained')
  if(!['Huge','Gargantuan'].includes(size)&&!immune&&!form)toolkitError('NET_TARGET_FORM_REQUIRED','Record the exact creature’s established corporeal/formless fact with set_net_creature_form; no shape is guessed from its name or token.')
  const effective=!['Huge','Gargantuan'].includes(size)&&!immune&&form?.formless===false
  if(effective&&target.conditions.includes('restrained')&&!hasPersistedConditionProvider(target.id,'restrained'))toolkitError('NET_RESTRAINT_PROVENANCE_REQUIRED','Existing restrained has no known provider. Resolve its actual provenance before adding a net that could otherwise erase an unrelated condition.')
  return NetTargetWitnessSchema.parse({targetId:target.id,size,sizeSource:native?`mm2014:${'type'in target?target.type:'unknown'}:size`:fact!.source,
    ...(form?{formless:form.formless,formSource:form.source}:{}),conditionImmune:immune,effective,
    reason:['Huge','Gargantuan'].includes(size)?'too_large':immune?'source_restrained_immunity':form?.formless?'formless':'corporeal_large_or_smaller'})
}
export function preflightNetAttack(weapon:WeaponSpec,input:{reaction?:boolean;twoWeapon?:unknown;deferAction?:boolean;newAttackAction?:boolean;nonlethal?:boolean},target:PlayerState|MonsterState,held?:unknown):NetTargetWitness|undefined {
  if(weapon.special!=='net')return undefined
  if(input.nonlethal!==undefined)toolkitError('NET_NONLETHAL_NOT_APPLICABLE','A net deals no damage; omit the knockout field even when false.')
  if(input.twoWeapon||input.deferAction)toolkitError('NET_ACTION_SCOPE_UNSUPPORTED','The net must retain one exact supported action or readied reaction, never an unwitnessed deferred attack.')
  if(!input.reaction&&!input.newAttackAction&&(hero().attackAction?.used??0)>0&&(hero().attackAction?.remaining??0)>0)
    toolkitError('NET_ONLY_ATTACK','Using a net permits only one attack in its actual action; it cannot follow a prior attack of that same action.')
  if(Object.keys(netStateOf(gs.getState())?.bindings??{}).length>=256&&!held)toolkitError('NET_BINDING_LIMIT','The net throw record limit was reached before its d20.')
  if(!gs.getState().currentMapId||!gs.getState().currentRoomId)toolkitError('NET_LOCATION_REQUIRED','A net throw needs its actual current map and room.')
  // A harmful net attack can actually trigger an existing Fey Charm save even
  // though the net deals no damage. Validate that upcoming save before its d20.
  if(gs.getState().monsterEffects?.some(effect=>{
    if(effect.kind!=='fey-charm'||effect.targetId!==target.id)return false
    const charmer=gs.getEntity(effect.sourceId)
    return charmer&&(charmer.id==='player'||'hostile'in charmer&&charmer.hostile===false)
  }))inspectExhaustion(target.id)
  if(held!==undefined){const parsed=NetTargetWitnessSchema.safeParse(held);if(!parsed.success||parsed.data.targetId!==target.id)toolkitError('NET_HELD_CONTEXT_INVALID','The held net throw needs its original exact size/form witness before a reaction die or cost.');return parsed.data}
  return netTargetWitness(target)
}
export function finishNetThrow(attackId:string,itemId:string,targetId:string,hit:boolean,witness:NetTargetWitness,drop:DroppedItem,improvisedReferenceId?:string) {
  const old=objectEntry(netStateOf(gs.getState())?.bindings,attackId)
  if(old)return old
  const net:NetBinding={id:attackId,itemId,targetId,sourceId:'player',mapId:drop.mapId,thrownAt:now(),status:!hit?'missed':witness.effective?'restraining':'ineffective',targetWitness:witness,slashingDamageTaken:0,...(improvisedReferenceId?{improvisedReferenceId}:{})}
  if(hit&&witness.effective){
    const effect=addHeroEffect('net-restraint','player',[targetId],Number.MAX_SAFE_INTEGER/2,{condition:'restrained',netId:attackId,itemId},false)
    net.effectId=effect.id
  }
  state().bindings[attackId]=net
  return net
}
function release(net:NetBinding,reason:string,destroyed=false) {
  if(net.status!=='restraining')return
  net.status=destroyed?'destroyed':'freed';net.releasedAt=now();net.releaseReason=reason
  if(net.effectId)removeHeroEffect(net.effectId)
  if(destroyed){delete gs.getState().droppedItems?.[net.itemId]}
}
/** A real provider removal can release only this net; other providers remain. */
export function netRestraintEffectRemoved(effectId:string) {
  const net=Object.values(netStateOf(gs.getState())?.bindings??{}).find(net=>net.effectId===effectId&&net.status==='restraining')
  if(net){net.status='freed';net.releasedAt=now();net.releaseReason='actual_restraint_provider_removed'}
}
/** Bookkeeping follows an actual current actor or its already persisted body;
 * it never activates a retired/off-map target for a public action. */
export function reconcileNets() {
  const game=gs.getState(),data=netStateOf(game)
  if(!data)return
  for(const net of Object.values(data.bindings))if(net.status==='restraining'){
    const target=persistedConditionTarget(net.targetId),effect=game.hero?.effects.find(e=>e.id===net.effectId)
    if(!effect){release(net,'actual_restraint_provider_removed');continue}
    const form=objectEntry(data.forms,net.targetId)
    if(form?.formless||target&&conditionImmune(target,'restrained')){release(net,form?.formless?'established_formless':'source_restrained_immunity');continue}
    if(target&&!target.conditions.includes('restrained'))applyPersistedRestoredCondition(target.id,'restrained')
    const drop=game.droppedItems?.[net.itemId]
    if(drop&&target){
      if(gs.getEntity(target.id)===target){net.mapId=game.currentMapId!;drop.mapId=net.mapId;drop.position={...target.position};drop.roomId=inferRoomIdOnMap(target.position,net.mapId,game)??drop.roomId}
      else {drop.mapId=net.mapId;drop.position={...target.position}}
    }
  }
}
export function accessibleNet(id:string,actorId='player') {
  const net=netBinding(id),target=gs.getEntity(net.targetId),actor=gs.getEntity(actorId),drop=gs.getState().droppedItems?.[net.itemId]
  if(net.status!=='restraining')toolkitError('NET_NOT_RESTRAINING','Select an exact net that is still actually restraining its creature.')
  if(!target||!actor||!drop||net.mapId!==gs.getState().currentMapId||drop.mapId!==gs.getState().currentMapId)toolkitError('NET_TARGET_NOT_PRESENT','The real net and its target must be present on this map; no remote archive is activated.')
  return {net,target,actor,drop}
}
function freePhysicalReach(id:string,actorId:string){
  const found=accessibleNet(id,actorId)
  const heightIssue=physicalHeightCombatIssue(gs.getState(),[actorId,found.net.targetId])??weatherHeightCombatIssue(gs.getState(),[actorId,found.net.targetId]);if(heightIssue)toolkitError(heightIssue.code,heightIssue.message)
  if(distance(found.actor.position,found.target.position)>1||!visibleCell({...found.actor,conditions:found.actor.conditions.filter(c=>c!=='blinded')},found.target.position))toolkitError('NET_FREE_OUT_OF_REACH','Reach the exact net/captive within the current five-foot physical hand-reach scope; a held Reach weapon does not extend a helping hand.')
  return found
}
function validateFree(id:string,actorId:string){const found=freePhysicalReach(id,actorId);rules.validateActionUse(actorId);return found}
export function validateHeldNetFree(command:Record<string,unknown>){
 const resolution=command.toolkitResolution as {domain?:string;command?:Record<string,unknown>}|undefined
 if(resolution?.domain==='net-free')freePhysicalReach(String(resolution.command?.netId),String(resolution.command?.actorId))
}
export function freeNet(input:{eventId:string;netId:string;actorId:string}){
  const command=JSON.stringify({operation:'free',...input}),prior=replayNetReceipt(input.eventId,command)
  if(prior)return prior
  available();assertNetReceiptCapacity();validateFree(input.netId,input.actorId)
  return checkedResolution({entityId:input.actorId,ability:'str',dc:10,proficient:false,label:'Libérer du filet (Force DD10)'},
    {domain:'net-free',command:{...input,serialized:command}})
}
export function registerNetCheckResolutions(){
  registerCheckedResolution('net-free',(command,check)=>{
    const eventId=String(command.eventId),serialized=String(command.serialized),actorId=String(command.actorId),netId=String(command.netId)
    const prior=replayNetReceipt(eventId,serialized);if(prior)return prior
    const {net}=validateFree(netId,actorId)
    rules.recordAction(actorId)
    if(check.success)release(net,'successful_strength_check')
    return saveNetReceipt(eventId,serialized,{success:check.success,eventId,netId,actorId,actionSpent:gs.getState().phase==='combat',check:check as AbilityCheckResult,
      freed:net.status==='freed',mechanicalSummary:`Libération du filet : ${check.roll.detail} contre DD10 ; ${check.success?'cette entrave est libérée':'le filet retient toujours sa cible'}. Aucun dégât au captif.`})
  })
}
export function applyNetSlashing(net:NetBinding,amount:number) {
  if(!Number.isSafeInteger(amount)||amount<0)toolkitError('NET_DAMAGE_INVALID','Only the actual nonnegative slashing damage from the registered attack can contribute.')
  net.slashingDamageTaken+=amount
  if(net.slashingDamageTaken>=5)release(net,'five_actual_slashing_damage',true)
  return {slashingDamageTaken:net.slashingDamageTaken,destroyed:net.status==='destroyed',freed:net.status!=='restraining',
    accumulationPolicy:'cumulative_actual_slashing_damage',policyBasis:'explicit_engine_interpretation',
    interpretation:'The source says dealing 5 slashing damage without specifying aggregation across hits. This procedure sums actual slashing damage until five; it does not invent object hit points or immunity to every other attack type.'}
}
