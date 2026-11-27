import { z } from 'zod'
import type { GameState,MonsterState,PlayerState } from './types'
import { getMonsterRecord } from './srd/monsters'
import { SwallowTurnIdentitySchema,SwallowInternalDamageWitnessSchema,qualifyingSwallowDamage } from './swallow-source-state'
const Id=z.string().min(1).max(180).refine(value=>!['constructor','prototype','__proto__'].includes(value))
const Cell=z.object({x:z.number().int().nonnegative(),y:z.number().int().nonnegative()}).strict()
const Packet=z.record(z.string(),z.unknown())
export const SwallowBiteContextSchema=z.object({attackId:Id,sourceId:Id,targetId:Id,mapId:Id,at:z.number().finite().nonnegative(),
 targetSize:z.enum(['Tiny','Small','Medium','Large','Huge','Gargantuan']),turn:SwallowTurnIdentitySchema}).strict()
export type SwallowBiteContext=z.infer<typeof SwallowBiteContextSchema>
export const SwallowStateSchema=z.object({version:z.literal(1),
 sizes:z.record(z.string(),z.object({entityId:Id,size:z.enum(['Tiny','Small','Medium','Large','Huge','Gargantuan']),factId:Id,source:z.string().min(1).max(1000),at:z.number().nonnegative()}).strict()),
 bites:z.record(z.string(),z.object({context:SwallowBiteContextSchema,baseAttack:Packet,status:z.enum(['pending','resolved']),result:Packet.optional()}).strict()),
 episodes:z.record(z.string(),z.object({id:Id,sourceId:Id,targetId:Id,mapId:Id,attackId:Id,effectId:Id,enteredAt:z.number().nonnegative(),
  enteredTurn:SwallowTurnIdentitySchema,entryOutsideCell:Cell,status:z.enum(['inside','corpse_inside','regurgitated','escaped']),endedAt:z.number().nonnegative().optional()}).strict()),
 damage:z.record(z.string(),SwallowInternalDamageWitnessSchema),
 events:z.record(z.string(),z.object({id:z.string().min(1).max(500),command:z.string().max(50000),kind:z.enum(['acid','regurgitation']),sourceId:Id,turn:SwallowTurnIdentitySchema,
  episodeIds:z.array(Id).max(128),targetIds:z.array(Id).max(128),status:z.enum(['pending','resolved']),exits:z.array(z.object({targetId:Id,cell:Cell}).strict()).max(128).optional(),result:Packet.optional()}).strict()),
 escapes:z.record(z.string(),z.object({command:z.string(),result:Packet}).strict()),endingTurn:z.string().optional(),
}).strict()
export type SwallowState=z.infer<typeof SwallowStateSchema>
export const swallowStateOf=(state:Pick<GameState,'dmTools'>)=>(state.dmTools as{swallow?:SwallowState}|undefined)?.swallow
export const swallowTurn=(state:GameState)=>({combatGeneration:state.combatGeneration??0,turnCounter:state.turnCounter??0,actorId:state.currentTurn??'none'})
export const swallowTurnKey=(state:GameState)=>JSON.stringify(swallowTurn(state))
export const activeSwallowEpisode=(state:Pick<GameState,'dmTools'>,id:string)=>Object.values(swallowStateOf(state)?.episodes??{}).find(e=>e.targetId===id&&['inside','corpse_inside'].includes(e.status))
export const swallowedBy=(state:Pick<GameState,'dmTools'>,id:string)=>activeSwallowEpisode(state,id)?.sourceId
export const swallowedEpisodes=(state:Pick<GameState,'dmTools'>,sourceId:string)=>Object.values(swallowStateOf(state)?.episodes??{}).filter(e=>e.sourceId===sourceId&&['inside','corpse_inside'].includes(e.status))
export function swallowActor(state:GameState,id:string):PlayerState|MonsterState|undefined{return id==='player'?state.player:state.monsters[id]}
const living=(state:GameState,id:string)=>{const a=swallowActor(state,id);return Boolean(a&&(id==='player'?!state.player.deathSaves?.dead:'isAlive'in a&&a.isAlive))}
/** Spatial relation authorised by the user on4Nov2026. No interior grid or
 * outside cell is created by an interior body. Its XY is the host projection. */
export function swallowBoundary(state:GameState,originId:string|undefined,targetId:string):'ordinary'|'host_contact'|'self'|'blocked'|'interior_geometry_required'{
 const a=originId?activeSwallowEpisode(state,originId):undefined,b=activeSwallowEpisode(state,targetId)
 if(originId===targetId)return'self'
 if(a&&targetId===a.sourceId)return'host_contact'
 if(a&&b&&a.sourceId===b.sourceId)return'interior_geometry_required'
 if(a||b)return'blocked'
 return'ordinary'
}
export interface DueSwallowEvent{id:string;kind:'acid'|'regurgitation';sourceId:string;turn:ReturnType<typeof swallowTurn>;episodeIds:string[];targetIds:string[]}
export function dueSwallowEvents(state:GameState,phase:'action'|'end'='action'):DueSwallowEvent[]{
 const data=swallowStateOf(state);if(!data||state.phase!=='combat'||!state.currentTurn)return[]
 const turn=swallowTurn(state),events:DueSwallowEvent[]=[]
 const sources=[...new Set(Object.values(data.episodes).filter(e=>e.status==='inside').map(e=>e.sourceId))]
 for(const sourceId of sources){
  if(!living(state,sourceId))continue
  const all=swallowedEpisodes(state,sourceId).filter(e=>e.status==='inside'),active=all.filter(e=>living(state,e.targetId))
  const acidId=`swallow-acid:${turn.combatGeneration}:${turn.turnCounter}:${sourceId}`
  const start=active.filter(e=>e.enteredTurn.combatGeneration!==turn.combatGeneration||e.enteredTurn.turnCounter!==turn.turnCounter)
  if(sourceId===state.currentTurn&&start.length&&!data.events[acidId])events.push({id:acidId,kind:'acid',sourceId,turn,episodeIds:start.map(e=>e.id),targetIds:start.map(e=>e.targetId)})
  if(phase==='end'){
   const id=`swallow-regurgitation:${turn.combatGeneration}:${turn.turnCounter}:${sourceId}`
   const qualifies=all.some(e=>qualifyingSwallowDamage(Object.values(data.damage),{sourceId,insideActorId:e.targetId,turn}).qualifying)
   if(qualifies&&!data.events[id])events.push({id,kind:'regurgitation',sourceId,turn,episodeIds:all.map(e=>e.id),targetIds:all.map(e=>e.targetId)})
  }
 }
 return events
}
export function swallowTurnIssue(state:GameState,ending=false){
 const pending=Object.values(swallowStateOf(state)?.events??{}).find(e=>e.status==='pending')
 if(pending)return{code:'SWALLOW_EVENT_CONTINUATION_REQUIRED',message:'Resolve the exact held source swallow event before another action, turn or displacement.'}
 const due=dueSwallowEvents(state,ending?'end':'action')
 if(due.length)return{code:'SWALLOW_EVENT_REQUIRED',message:`Explicitly resolve the actual source event before continuing: ${due.map(e=>e.id).join(', ')}.`}
 if(!ending&&swallowStateOf(state)?.endingTurn===swallowTurnKey(state))return{code:'SWALLOW_TURN_ENDING',message:'The actual end-of-turn source save was explicitly requested; finish this turn before another action or movement.'}
 return null
}
export function swallowRequiresTurn(state:GameState,id:string){return living(state,id)&&swallowedEpisodes(state,id).some(e=>e.status==='inside'&&living(state,e.targetId))}
export function swallowMapTransitionIssue(state:GameState){return Object.values(swallowStateOf(state)?.episodes??{}).some(e=>['inside','corpse_inside'].includes(e.status))?{code:'SWALLOW_MAP_TRANSITION_REQUIRED',message:'Resolve the actual contained bodies and their explicit physical exits before this map transition; no interior body is teleported or archived.'}:null}
export function validateSwallowState(state:GameState){
 const data=swallowStateOf(state);if(!data)return[]
 if(!SwallowStateSchema.safeParse(data).success)return['Invalid actual source-swallow schema.']
 const issues:string[]=[],targets=new Set<string>()
 for(const[id,record]of Object.entries(data.sizes)){
  const retired=(state.sceneMemory?.retiredMonsters as Record<string,MonsterState>|undefined)?.[id]
  const archived=Object.entries((state.sceneMemory?.floorMonsters??{}) as Record<string,Record<string,MonsterState>>).filter(([mapId])=>mapId!==state.currentMapId).map(([,floor])=>floor[id]).find(Boolean)
  const body=swallowActor(state,id)??retired??archived,native=body&&'type'in body?getMonsterRecord(body.type)?.source.size:undefined,carrying=state.dmTools?.carrying?.actors[id]?.size
  if(id!==record.entityId||!body||record.at>(state.worldTimeSeconds??0)||native&&native!==record.size||carrying&&carrying!==record.size)issues.push('A retained swallow body-size observation must match its actual unchanged source body and measured carrying size; no transformation or replacement profile is granted by hydration.')
 }
 for(const hit of Object.values(data.bites)){
  if(hit.status!=='pending')continue
  const body=swallowActor(state,hit.context.targetId),native=body&&'type'in body?getMonsterRecord(body.type)?.source.size:undefined,actual=data.sizes[hit.context.targetId]?.size??state.dmTools?.carrying?.actors[hit.context.targetId]?.size??native
  if(!body||hit.context.targetSize!==actual||native&&native!==hit.context.targetSize)issues.push('A held source bite must preserve the actual canonical or explicitly measured body size, never a substituted source profile.')
 }
 if(Object.keys(data.episodes).length>128||Object.keys(data.bites).length>512||Object.keys(data.damage).length>4096||Object.keys(data.events).length>1024||Object.keys(data.escapes).length>128)issues.push('Retained source-swallow capacity exceeded; no actual original hit, episode or turn is evicted.')
 for(const[id,e]of Object.entries(data.episodes)){
  if(id!==e.id||e.attackId!==id||!data.bites[e.attackId]||e.sourceId===e.targetId||e.enteredAt>(state.worldTimeSeconds??0))issues.push('A contained episode needs its original distinct source hit, body and elapsed entry.')
  if(!['inside','corpse_inside'].includes(e.status))continue
  const host=swallowActor(state,e.sourceId),body=swallowActor(state,e.targetId),effect=state.monsterEffects?.find(effect=>effect.id===e.effectId)
  if(targets.has(e.targetId)||!host||!('type'in host)||host.type!=='purple_worm'||host.group||!body||e.mapId!==state.currentMapId||swallowedBy(state,e.sourceId)||!effect||effect.sourceId!==e.sourceId||effect.targetId!==e.targetId||effect.kind!=='purple-worm-swallow')issues.push('One actual body must retain its one real current-map individual host and original source condition provider; no nested interior or archive is inferred.')
  if(body&&host&&(body.position.x!==host.position.x||body.position.y!==host.position.y))issues.push('The retained contained-body projection must move atomically with its actual host, never occupy an independent exterior square.')
  if(e.status==='inside'&&!living(state,e.sourceId)||e.status==='corpse_inside'&&living(state,e.sourceId))issues.push('The actual live/corpse containment state must match the host life witness.')
  if(e.status==='inside'&&(state.phase!=='combat'||!state.initiativeOrder.includes(e.sourceId)||living(state,e.targetId)&&!state.initiativeOrder.includes(e.targetId)))issues.push('Living swallowing requires explicitly preserved real source/victim combat turns; no turns or initiative enrollment are invented.')
  targets.add(e.targetId)
 }
 for(const[id,hit]of Object.entries(data.bites))if(id!==hit.context.attackId||hit.context.sourceId!==hit.baseAttack.attackerId||hit.context.targetId!==hit.baseAttack.targetId||hit.baseAttack.hit!==true||hit.status==='resolved'&&!hit.result)issues.push('Each source bite retains its original actual hit, body, target and completion.')
 for(const[id,event]of Object.entries(data.events))if(id!==event.id||event.status==='resolved'&&!event.result||event.episodeIds.some(episode=>!data.episodes[episode]))issues.push('Each source-turn event retains its actual original episodes and completion.')
 for(const[id,hit]of Object.entries(data.bites))if(hit.status==='pending'){const r=state.hero?.pending?.command.toolkitResolution as{domain?:string;command?:{attackId?:string}}|undefined;if(r?.domain!=='worm-bite-save'||r.command?.attackId!==id)issues.push('A pending swallowing DEX retains its actual original hit and held save, never a fresh roll.')}
 for(const[id,event]of Object.entries(data.events)){if(new Set(event.episodeIds).size!==event.episodeIds.length||JSON.stringify(event.targetIds)!==JSON.stringify(event.episodeIds.map(id=>data.episodes[id]?.targetId))||event.episodeIds.some(id=>data.episodes[id]?.sourceId!==event.sourceId))issues.push('A retained source event must keep each exact actual swallowed body once.');if(event.status==='pending'){const r=state.hero?.pending?.command.toolkitResolution as{domain?:string;command?:{eventId?:string}}|undefined;if(r?.domain!=='worm-regurgitation-save'||r.command?.eventId!==id)issues.push('A pending source regurgitation CON retains its exact original turn and held save.')}}
 return issues
}
