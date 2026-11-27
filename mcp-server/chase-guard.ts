import { z } from 'zod'
import type { GameState } from '../lib/types'
import type { GridCell } from '../lib/adventure-map'
import { activeChaseGuard,chaseStateOf,chaseWitness,QualifyChaseGuardSchema } from '../lib/chase-state'
import { toolkitError,toolkitResult,toolkitState,assertToolkitPreparation } from './toolkit'
import { available,hero,now,alive,distance,reactionAvailable } from './hero-rules'
import { canSee,visibleCell } from './monster-perception'
import { coverFor } from './cover'
import { heroAttack } from './hero-combat'
import * as gs from './game-state'

export const ResolveChaseGuardSchema=z.object({eventId:z.string().min(1).max(100),chaseId:z.string().min(1).max(100),turnEventId:z.string().min(1).max(100),choice:z.enum(['execute','decline'])}).strict()
export type ChaseGuardContext={chaseId:string;turnEventId:string;eventId:string;sourceId:string;targetId:string;turnKey:string;point:GridCell;mapId:string}
export function preflightChaseRoute(state:GameState,id:string,path:GridCell[],distanceFeet:readonly number[]){
 const active=state.phase==='combat'&&state.currentTurn===id?activeChaseGuard(state,id):undefined;if(!active)return
 const {e,t}=active
 if(t.guardTriggered)toolkitError('CHASE_GUARD_ATTACK_DUE','Resolve the exact actual20ft guard event before any further route or cost.')
 let feet=t.movedFeet??0
 for(let i=1;i<path.length;i++){
  feet+=distanceFeet[i-1]
  if(feet<20)continue
  const guard=state.monsters[t.qualification!.guardId!]
  if(!guard)toolkitError('CHASE_GUARD_SOURCE_MISSING','Retain the exact actual pre-entry guard body; no replacement attacker is fabricated.')
  if(alive(guard)&&reactionAvailable(guard.id)&&(distance(guard.position,path[i])>1||!visibleCell(guard,path[i])))toolkitError('CHASE_GUARD_ROUTE_UNREPRESENTABLE','The chosen route reaches the printed20ft threshold outside this real guard spear reach/sight. Choose an actually representable route before any cost; no guard teleport or attack through walls is invented.')
  return
 }
}
export function noteChaseActualStep(state:GameState,id:string,distanceFeet:number){
 const active=state.phase==='combat'&&state.currentTurn===id?activeChaseGuard(state,id):undefined;if(!active)return false
 const {t}=active;t.movedFeet=(t.movedFeet??0)+distanceFeet
 if(t.movedFeet>=20){t.guardTriggered=true;return true}
 return false
}
export function assertChaseGuardContext(context:ChaseGuardContext,sourceId:string,targetId:string,weapon:string){
 const state=gs.getState(),e=chaseStateOf(state)?.episodes[context.chaseId],t=e?.turns[context.turnEventId],source=gs.getEntity(sourceId),target=gs.getEntity(targetId)
 if(!chaseStateOf(state)?.guardRoles[sourceId]||!e||!t||!t.guardTriggered||t.guardCompleted||!t.guardAttackInput||chaseWitness(t.guardAttackInput)!==chaseWitness(context)||t.qualification?.guardId!==sourceId||t.nextParticipantId!==targetId||context.sourceId!==sourceId||context.targetId!==targetId||weapon!=='DMG urban chase guard spear'||context.mapId!==state.currentMapId||context.turnKey!==`${state.combatGeneration??0}:${state.turnCounter??0}:${state.round}:${state.currentTurn??''}`||!source||!target||target.position.x!==context.point.x||target.position.y!==context.point.y||distance(source.position,target.position)>1||!canSee(source,target)||coverFor(sourceId,targetId).degree==='total')toolkitError('CHASE_GUARD_CONTEXT_INVALID','Only the actual printed guard consequence after real20ft movement with its original body/source/range/current point may use this engine-only opportunity context.')
}
export function finishChaseGuardAttack(context:ChaseGuardContext,result:Record<string,unknown>){
 const data=chaseStateOf(gs.getState())!,t=data.episodes[context.chaseId].turns[context.turnEventId]
 t.guardCompleted=true;t.guardResult=structuredClone(result)
 const input=t.guardChoice!,command=chaseWitness({operation:'resolve-chase-guard',input})
 data.receipts[context.eventId]={command,result:{chaseId:context.chaseId,turnEventId:t.id,attack:structuredClone(result),reactionSpent:true,tableRollRetained:t.tableRoll},at:now()}
}
export function resolveChaseGuard(raw:unknown){
 const input=ResolveChaseGuardSchema.parse(raw),command=chaseWitness({operation:'resolve-chase-guard',input}),data=chaseStateOf(gs.getState()),old=data?.receipts[input.eventId]
 if(old){if(old.command!==command)toolkitError('CHASE_EVENT_CONFLICT','Retain the original guard-event command.');return toolkitResult({...old.result,replayed:true})}
 available({allowChaseEvent:true});const active=activeChaseGuard(gs.getState());if(!active||active.e.id!==input.chaseId||active.t.id!==input.turnEventId||!active.t.guardTriggered)toolkitError('CHASE_GUARD_NOT_DUE','Actual movement has not reached the printed20ft guard trigger for this original complication.')
 if(Object.keys(data!.receipts).length>=4096)toolkitError('CHASE_RECEIPT_LIMIT','Retain capacity before another guard choice or die.')
 const {e,t}=active,sourceId=t.qualification!.guardId!,targetId=t.nextParticipantId!
 if(input.choice==='decline'){
  t.guardCompleted=true;t.guardChoice=input;const result={chaseId:e.id,turnEventId:t.id,declined:true,reactionSpent:false,tableRollRetained:t.tableRoll};data!.receipts[input.eventId]={command,result,at:now()};return toolkitResult(result)
 }
 const target=gs.getEntity(targetId),source=gs.getEntity(sourceId)
 if(!target||!source||!alive(source)||!alive(target)||!reactionAvailable(sourceId))toolkitError('CHASE_GUARD_REACTION_UNAVAILABLE','The actual guard/target is no longer capable or its real reaction is spent; explicitly decline rather than invent an attack or renewed reaction.')
 const context:ChaseGuardContext={chaseId:e.id,turnEventId:t.id,eventId:input.eventId,sourceId,targetId,turnKey:`${gs.getState().combatGeneration??0}:${gs.getState().turnCounter??0}:${gs.getState().round}:${gs.getState().currentTurn??''}`,point:{...target.position},mapId:e.mapId}
 t.guardAttackInput=context;t.guardChoice=input
 assertChaseGuardContext(context,sourceId,targetId,'DMG urban chase guard spear')
 return heroAttack({attackerId:sourceId,targetId,weaponOrSpell:'DMG urban chase guard spear',damageOption:0,reaction:true,chaseGuardContext:context})
}

export function qualifyChaseGuard(raw:unknown){
 const input=QualifyChaseGuardSchema.parse(raw),command=chaseWitness({operation:'qualify-chase-guard',input}),old=chaseStateOf(gs.getState())?.receipts[input.eventId]
 if(old){if(old.command!==command)toolkitError('CHASE_EVENT_CONFLICT','Retain exact original guard role/custody qualification.');return{...old.result,replayed:true}}
 assertToolkitPreparation();const state=gs.getState(),body=gs.getEntity(input.entityId)
 if(!body||input.entityId==='player'||!('type'in body)||body.type!=='commoner'||!alive(body)||body.controller==='reactive_npc')toolkitError('CHASE_GUARD_BODY_REQUIRED','This first table-only producer qualifies an actual existing capable manual commoner body, without changing its actual stat block, HP, AC or general actions. No renamed text or invented Guard profile is used.')
 const fact=(id:string)=>state.worldFacts?.find(f=>f.id===id&&f.mapId===state.currentMapId&&(!f.roomId||f.roomId===state.currentRoomId))
 const roleFact=fact(input.roleFactId),spearFact=fact(input.spearFactId)
 if(!roleFact||!spearFact)toolkitError('CHASE_GUARD_PHYSICAL_FACT_REQUIRED','Explicitly establish/select actual guard-role and carried-spear facts; text is never classified as a role or weapon.')
 const data=toolkitState().chases??={episodes:{},receipts:{},fatigue:{},guardRoles:{},restRulings:{}}
 if(data.guardRoles[input.entityId]||Object.values(data.guardRoles).some(r=>r.input.spearInstanceId===input.spearInstanceId||r.input.spearFactId===input.spearFactId))toolkitError('CHASE_GUARD_CUSTODY_RETAINED','One actual observed spear and guard body keep one immutable qualification; no duplicate source instance is made.')
 if(state.player.inventory.some(i=>i.id===input.spearInstanceId)||state.droppedItems?.[input.spearInstanceId]||Object.values(state.dmTools?.merchants?.stocks??{}).some(stock=>stock.item.id===input.spearInstanceId))toolkitError('CHASE_GUARD_ITEM_ID_CONFLICT','This observed already-held NPC spear cannot duplicate a player, ground or merchant instance.')
 if(Object.keys(data.receipts).length>=4096)toolkitError('CHASE_RECEIPT_LIMIT','Retain source qualification capacity before any mutation.')
 const role={input,command:chaseWitness(input),roleFact:structuredClone(roleFact!) as unknown as Record<string,unknown>,spearFact:structuredClone(spearFact!) as unknown as Record<string,unknown>,at:now()};data.guardRoles[input.entityId]=role
 const result={qualified:true,entityId:input.entityId,spearInstanceId:input.spearInstanceId,source:'DMG2014 Urban Chase9 only: attack+3,1d6+1 piercing; no MM Guard profile or general Spear action',inventoryGranted:false,lootGranted:false,statBlockChanged:false,custody:'Existing carried NPC spear observed explicitly; location derives only from its actual holder body; no inventory/ground duplicate or transfer permission.'};data.receipts[input.eventId]={command,result,at:now()};return result
}
export function chaseGuardAttackProfile(context:ChaseGuardContext,sourceId:string,targetId:string,weapon:string):ReturnType<typeof import('./monster-rules').attackProfile>{
 assertChaseGuardContext(context,sourceId,targetId,weapon)
 return{name:'DMG urban chase guard spear',attackBonus:3,damageDice:'1d6+1',damageType:'piercing',rangeCells:1,normalRangeCells:1,melee:true,magical:false,action:{name:'DMG urban chase guard spear',desc:'DMG2014 Urban Chase Complication9, table-only source attack, not a creature catalog action.',attack_bonus:3}}
}
