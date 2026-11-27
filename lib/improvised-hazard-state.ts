import { z } from 'zod'
import type { GameState,WorldFact } from './types'
import { groundGearPhysicalWitness as witness } from './ground-gear-recovery-state'
export const hazardWitness=witness
const Id=z.string().min(1).max(180).refine(v=>!['constructor','prototype','__proto__'].includes(v))
const Cell=z.object({x:z.number().int().nonnegative(),y:z.number().int().nonnegative()}).strict(),Value=z.record(z.string(),z.unknown())
export const IMPROVISED_HAZARD_SOURCE={book:'dmg-2014' as const,sha256:'fa75462a6ef96ef0f86fbfd2d433c624ce926ff630a43d1fcaea6a2c1249b0d1',startLine:7997,endLine:8025}
export const ResolveImprovisedHazardSchema=z.object({eventId:Id.max(80),factId:Id,targetId:Id,cell:Cell,
 sourceKind:z.literal('established_environment_event'),actualLocalExposureConfirmed:z.literal(true),notAnAttackOrSpellConfirmed:z.literal(true),
 actorCost:z.literal('none'),elapsedSeconds:z.literal(0),consequence:z.literal('damage_only'),magical:z.boolean(),
 diceCount:z.union([z.literal(1),z.literal(2),z.literal(4),z.literal(10),z.literal(18),z.literal(24)]),
 damageType:z.enum(['acid','bludgeoning','cold','fire','force','lightning','necrotic','piercing','poison','psychic','radiant','slashing','thunder']),
 save:z.object({ability:z.enum(['str','dex','con','int','wis','cha']),dc:z.number().int().min(1).max(40),onSuccess:z.enum(['no_damage','half_damage'])}).strict().optional(),
 reason:z.string().trim().min(1).max(1000),
}).strict()
const Event=z.object({input:ResolveImprovisedHazardSchema,command:z.string(),at:z.number().int().nonnegative(),mapId:Id,roomId:Id,
 source:Value,fact:Value,bodyWitness:z.string(),status:z.enum(['held','resolved']),heldWitness:z.string().optional(),result:Value.optional(),resultWitness:z.string().optional()}).strict()
export const ImprovisedHazardStateSchema=z.object({version:z.literal(1),events:z.record(z.string(),Event)}).strict()
export type ImprovisedHazardEvent=z.infer<typeof Event>
export function hazardPending(state:GameState){const pending=state.hero?.pending,resolution=pending?.command.toolkitResolution as {domain?:unknown;command?:Record<string,unknown>}|undefined;return resolution?.domain==='improvised-hazard'?{pending:pending!,command:resolution.command}:undefined}
export function improvisedHazardBodyWitness(state:GameState,id:string){const body=id==='player'?state.player:state.monsters[id]??state.npcs?.[id];return witness({body,map:state.currentMapId,room:state.currentRoomId,time:state.worldTimeSeconds,phase:state.phase,generation:state.combatGeneration,counter:state.turnCounter,currentTurn:state.currentTurn,round:state.round,cover:state.dmTools?.cover})}
export function unclaimedHazardFact(fact:WorldFact){const{improvisedHazardEventId:_owner,improvisedHazardResultWitness:_result,...rest}=fact;return rest}
export function validateImprovisedHazards(state:GameState){const issues:string[]=[],events=state.dmTools?.improvisedHazards?.events??{},held=hazardPending(state)
 for(const[id,event]of Object.entries(events)){
  const fact=(state.worldFacts??[]).find(f=>f.id===event.input.factId)
  if(id!==event.input.eventId||event.command!==witness(event.input)||event.at>(state.worldTimeSeconds??0)||witness(event.source)!==witness(IMPROVISED_HAZARD_SOURCE)
   ||!fact||fact.improvisedHazardEventId!==id||witness(unclaimedHazardFact(fact))!==witness(event.fact))issues.push('The one actual improvised occurrence retains its exact explicit input, source fact and reciprocal ownership.')
  if(event.status==='held'){
   if(!event.input.save||!held||held.command?.eventId!==id||held.pending.kind!=='save'||held.pending.command.type!=='save'||held.pending.sourceId!==event.input.targetId||held.pending.targetId!==event.input.targetId
    ||!event.heldWitness||event.heldWitness!==witness(held.pending)||event.bodyWitness!==improvisedHazardBodyWitness(state,event.input.targetId)||event.result||fact?.improvisedHazardResultWitness!==undefined)
    issues.push('The held improvised save retains its exact source window, actual body/context and unspent consequence.')
  }else{
   if(!event.result||event.resultWitness!==witness({command:event.command,result:event.result})||fact?.improvisedHazardResultWitness!==event.resultWitness||held?.command?.eventId===id)
    issues.push('The resolved one-shot improvised occurrence retains its exact result and independent physical fact receipt.')
   const result=event.result as {rawRoll?:{notation?:unknown;rolls?:number[];modifier?:unknown;total?:unknown};save?:{entityId?:unknown;ability?:unknown;dc?:unknown;success?:unknown;roll?:{notation?:unknown;total?:unknown}};rawDamage?:unknown;eventId?:unknown;targetId?:unknown}|undefined
   const save=result?.save,avoided=event.input.save&&save?.success&&event.input.save.onSuccess==='no_damage',roll=result?.rawRoll
   if(result?.eventId!==id||result?.targetId!==event.input.targetId||Boolean(save)!==Boolean(event.input.save)
    ||save&&(save.entityId!==event.input.targetId||save.ability!==event.input.save?.ability||save.dc!==event.input.save?.dc||typeof save.roll?.total!=='number'||save.success!==(save.roll.notation!=='automatic-failure'&&save.roll.total>=event.input.save!.dc))
    ||(avoided?(!!roll||result?.rawDamage!==0):(!roll||roll.notation!==event.input.diceCount+'d10'||roll.modifier!==0||!Array.isArray(roll.rolls)||roll.rolls.length!==event.input.diceCount||roll.rolls.some(n=>!Number.isInteger(n)||n<1||n>10)||roll.total!==roll.rolls.reduce((n,v)=>n+v,0)||result?.rawDamage!==(event.input.save&&save?.success?Math.floor(Number(roll.total)/2):roll.total))))
    issues.push('The one final source save/damage packet retains its original dice and explicit success policy.')
  }
 }
 if(held){const e=events[String(held.command?.eventId)];if(!e||e.status!=='held')issues.push('An improvised-hazard pending marker cannot lose its actual live source registry.')}
 for(const fact of state.worldFacts??[])if(Object.hasOwn(fact,'improvisedHazardEventId')||Object.hasOwn(fact,'improvisedHazardResultWitness')){const e=events[String(fact.improvisedHazardEventId)];if(!e||e.input.factId!==fact.id)issues.push('A claimed physical hazard fact cannot lose its original one-shot event, even without the new domain.')}
 return issues
}
