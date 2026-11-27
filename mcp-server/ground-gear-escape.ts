import { createHash } from 'node:crypto'
import { playerPoisonSurfaceContext,resolvePlayerPoisonWound } from './player-poison-injury'
import { registerPlayerPoisonContinuation } from './player-poison-exposure'
import { playerPoisonStateOf } from '../lib/player-poison-state'
import type { AbilityCheckResult } from '../lib/types'
import { physicalHeightCombatIssue } from '../lib/jumping-state'
import { groundGearState,groundGearAction,groundGearHistoryRoom,groundGearReceipt,rememberGroundGear,preflightGroundGearWork,spendGroundGearWork,assertGroundGearNoContact } from './ground-gear'
import { checkedResolution,registerCheckedResolution } from './toolkit-checks'
import { assertToolkitReach,toolkitError,toolkitResult } from './toolkit'
import { dealDamage } from './monster-rules'
import { groundDamageIssue } from './ground-damage-preflight'
import { freeHands } from './equipment'
import * as gs from './game-state'
export interface EscapeHuntingTrapInput{eventId:string;placementId:string;actorId:string;targetId:string}
function sourceTrap(id:string){const trap=gs.getState().dmTools?.groundGear?.placements[id];if(!trap||trap.kind!=='hunting_trap'||trap.status!=='sprung')toolkitError('HUNTING_TRAP_SPRUNG_REQUIRED','Choose the exact actual sprung hunting trap, not the separate authored bear-trap template.');return trap!}
function escapePreflight(input:EscapeHuntingTrapInput,pending=false){
 const state=gs.getState(),trap=sourceTrap(input.placementId),actor=gs.getEntity(input.actorId),target=gs.getPhysicalCreature(input.targetId)
 if(!actor||!target||trap.victimId!==input.targetId||trap.mapId!==state.currentMapId)toolkitError('HUNTING_TRAP_CAPTURE_REQUIRED','Choose this actual actor and the exact body currently clamped by this physical trap; no other target or archive is selected.')
 if(!pending)groundGearAction(input.actorId)
 else{
  assertGroundGearNoContact()
  if(actor!.hp.current<=0||actor!.conditions.some(value=>['incapacitated','paralyzed','petrified','stunned','unconscious'].includes(value)))toolkitError('ENTITY_INCAPACITATED','The original actor must remain capable before an Inspiration die or action cost.')
  if(state.phase==='combat'&&(state.currentTurn!==input.actorId||gs.hasActionUsed(input.actorId)&&!(input.actorId==='player'&&state.hero!.actionCredits>0)))toolkitError('ACTION_ALREADY_USED','Keep this actor’s actual original unspent full action for the held opening check.')
 }
 const height=physicalHeightCombatIssue(state,[input.actorId,input.targetId]);if(height)toolkitError(height.code,height.message)
 if(Math.max(Math.abs(actor!.position.x-target!.position.x),Math.abs(actor!.position.y-target!.position.y))>1)toolkitError('HUNTING_TRAP_HELP_OUT_OF_REACH','The exact other body must be within actual5foot manipulation reach; a weapon’s longer reach does not automatically operate trap jaws.')
 gs.withPhysicalCreatureResolution([input.targetId],()=>assertToolkitReach({mapId:trap.mapId,roomId:trap.roomId,cell:target!.position,surfaceZFeet:trap.surfaceZFeet},input.actorId))
 const dead=target!.id==='player'?Boolean(state.player.deathSaves?.dead):'isAlive'in target!&&target!.isAlive===false
 if(!dead){const issue=groundDamageIssue(state,input.targetId,1);if(issue)toolkitError(issue.code,issue.message)}
 groundGearHistoryRoom();const seconds=preflightGroundGearWork(input.actorId)
 return{trap,actor:actor!,target:target!,seconds}
}
export function escapeHuntingTrap(input:EscapeHuntingTrapInput){
 const command=JSON.stringify({operation:'escape',...input}),old=groundGearReceipt(input.eventId,command);if(old)return toolkitResult({...old,replayed:true})
 const {seconds,trap,target}=escapePreflight(input)
 const poisonContext=(target.id==='player'?!gs.getPlayer().deathSaves?.dead:!('isAlive'in target)||target.isAlive)?playerPoisonSurfaceContext({surfaceKey:JSON.stringify(['hunting_trap',trap.itemId]),attackId:'jaw-open:'+createHash('sha256').update(input.eventId).digest('hex'),targetId:input.targetId,damageType:'piercing'}):undefined
 return checkedResolution({entityId:input.actorId,ability:'str',dc:13,proficient:false,label:'Ouvrir le vrai piège de chasse'},
  {domain:'hunting-trap-escape',command:{input,serialized:command,seconds,poisonContext}})
}
function finishEscape(command:Record<string,unknown>,checked:AbilityCheckResult){
 const input=command.input as unknown as EscapeHuntingTrapInput,serialized=String(command.serialized),old=groundGearReceipt(input.eventId,serialized);if(old)return toolkitResult({...old,replayed:true})
 const {trap,target,seconds}=escapePreflight(input)
 if(seconds!==command.seconds||checked.entityId!==input.actorId||checked.ability!=='str'||checked.dc!==13)toolkitError('HUNTING_TRAP_CHECK_CONTEXT_INVALID','Retain this exact actor, physical trap/body, original action duration and STR13 check.')
 const poisonContext=playerPoisonSurfaceContext({surfaceKey:JSON.stringify(['hunting_trap',trap.itemId]),attackId:'jaw-open:'+createHash('sha256').update(input.eventId).digest('hex'),targetId:input.targetId,damageType:'piercing',held:true,context:command.poisonContext})
 spendGroundGearWork(input.actorId,seconds)
 let damageResolution:ReturnType<typeof dealDamage>|undefined
 if(checked.success)delete trap.victimId
 else if(target.id==='player'?!gs.getPlayer().deathSaves?.dead:!('isAlive'in target)||target.isAlive)
  damageResolution=gs.withPhysicalCreatureResolution([input.targetId],()=>dealDamage(input.targetId,1,'piercing',{sourceId:input.actorId,damageEventId:`gear-open:${input.eventId}`}))
 const result={success:true,eventId:input.eventId,operation:'escape',placementId:trap.id,actorId:input.actorId,targetId:input.targetId,check:checked,
  freed:Boolean(checked.success),damageResolution,damageDealt:damageResolution?.damageDealt??0,seconds,actionSpent:seconds===0,
  interpretation:'PHB2014:one action STR13, no automatic Athletics/tool proficiency; each failed check deals1piercing to the actual living trapped creature. The same physical jaw-opening check can release an existing corpse as an announced engine adjudication, without creature damage, revival or a free recovered trap.'}
 if(poisonContext&&Number(result.damageDealt)>0)return resolvePlayerPoisonWound(poisonContext,{...result,hit:true,damageType:'piercing',playerPoisonContinuation:{domain:'hunting-trap-opening-poison',eventId:input.eventId,serialized}})
 return toolkitResult(rememberGroundGear(input.eventId,serialized,result))
}
export function resetHuntingTrap(input:{eventId:string;placementId:string}){
 const command=JSON.stringify({operation:'reset',...input}),old=groundGearReceipt(input.eventId,command);if(old)return{...old,replayed:true}
 groundGearAction();groundGearHistoryRoom();const trap=sourceTrap(input.placementId)
 if(trap.victimId)toolkitError('HUNTING_TRAP_STILL_CLAMPED','Free the actual clamped body before setting this same trap again; a nonce does not remove it.')
 if(freeHands()<1)toolkitError('GROUND_GEAR_FREE_HAND_REQUIRED','Free an actual hand to set this floor trap; a shield or physical load does not supply a hand.')
 const anchor=trap.anchor,object=anchor?gs.getState().dmTools?.objects[anchor.objectId]:undefined
 if(!anchor||!object||object.state==='destroyed'||object.mapId!==trap.mapId||object.cell.x!==anchor.cell.x||object.cell.y!==anchor.cell.y)toolkitError('HUNTING_TRAP_ANCHOR_CHANGED','The actual immobile anchor must still be present and unchanged before resetting this physical trap.')
 assertToolkitReach({mapId:trap.mapId,roomId:trap.roomId,cell:trap.cells[0],surfaceZFeet:trap.surfaceZFeet})
 const seconds=preflightGroundGearWork();spendGroundGearWork('player',seconds);trap.status='armed'
 return rememberGroundGear(input.eventId,command,{success:true,eventId:input.eventId,operation:'reset',placementId:trap.id,seconds,actionSpent:seconds===0,source:'PHB2014 Hunting Trap:use the actual action to set this existing physical trap; no stock, reset nonce, new chain or automatic target.'})
}
export function validateHeldHuntingTrapCheck(command:Record<string,unknown>){
 const resolution=command.toolkitResolution as {domain?:string;command?:Record<string,unknown>}|undefined;if(resolution?.domain!=='hunting-trap-escape')return
 const input=resolution.command?.input as unknown as EscapeHuntingTrapInput
 if(!input||!input.eventId||!input.actorId||!input.targetId||!input.placementId)toolkitError('HUNTING_TRAP_CHECK_CONTEXT_INVALID','Retain the actual original physical opening choice before Inspiration.')
 const context=escapePreflight(input,true);playerPoisonSurfaceContext({surfaceKey:JSON.stringify(['hunting_trap',context.trap.itemId]),attackId:'jaw-open:'+createHash('sha256').update(input.eventId).digest('hex'),targetId:input.targetId,damageType:'piercing',held:true,context:resolution.command?.poisonContext});if(context.seconds!==resolution.command?.seconds)toolkitError('HUNTING_TRAP_CHECK_CONTEXT_INVALID','The original action/time context changed; no reaction die or new work is spent.')
}
export function registerHuntingTrapResolutions(){
 registerCheckedResolution('hunting-trap-escape',(command,result)=>finishEscape(command,result as AbilityCheckResult))
 registerPlayerPoisonContinuation('hunting-trap-opening-poison',deliveryId=>{
  const delivery=playerPoisonStateOf(gs.getState())!.deliveries[deliveryId],continuation=delivery.baseAttack!.playerPoisonContinuation as{eventId:string;serialized:string}
  return toolkitResult(rememberGroundGear(continuation.eventId,continuation.serialized,delivery.result!))
 })
}
