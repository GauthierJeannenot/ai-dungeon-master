import { inspectExhaustion } from './exhaustion'
import { assertGameTimeAdvance } from './time-preflight'
import { randomUUID } from 'node:crypto'
import type { SavingThrowResult,MonsterState } from '../lib/types'
import { getMonsterRecord } from '../lib/srd/monsters'
import { activeSwallowEpisode,swallowedBy,swallowedEpisodes,swallowActor,swallowStateOf,SwallowBiteContextSchema,
 dueSwallowEvents,swallowTurn,swallowTurnKey,type SwallowBiteContext,type SwallowState,type DueSwallowEvent } from '../lib/swallow-state'
import { movementSpeedProfile } from '../lib/movement-modes'
import { navigationGrid } from '../lib/navigation'
import { entityVerticalContext } from '../lib/jumping-state'
import { groundDamageIssue } from './ground-damage-preflight'
import { toolkitState,toolkitError,toolkitResult } from './toolkit'
import { available,assertHero,hero,now,advanceHeroTime } from './hero-rules'
import { rollDice } from './dice'
import { addEffect,endEffect,savingThrow,dealDamage } from './monster-rules'
import { finishPersistedConditionRemoval } from './persisted-conditions'
import { savedResolution,registerCheckedResolution } from './toolkit-checks'
import * as gs from './game-state'
export const swallow=()=>toolkitState().swallow??={version:1 as const,sizes:{},bites:{},episodes:{},damage:{},events:{},escapes:{}}
const living=(id:string)=>{const body=gs.getEntity(id);return Boolean(body&&(id==='player'?!gs.getPlayer().deathSaves?.dead:'isAlive'in body&&body.isAlive))}
export function recordSwallowSize(input:{entityId:string;size:SwallowBiteContext['targetSize'];factId:string;source:string}){
 const state=gs.getState(),body=gs.getEntity(input.entityId),fact=state.worldFacts?.find(f=>f.id===input.factId&&f.mapId===state.currentMapId)
 if(!body||!fact||hero()?.pending)toolkitError('SWALLOW_SIZE_PHYSICAL_FACT_REQUIRED','Observe the actual current body with an existing physical fact before the original bite or held save; no body or size change is granted.')
 const source=body&&'type'in body?getMonsterRecord(body.type)?.source.size:undefined,carrying=state.dmTools?.carrying?.actors[input.entityId]?.size
 if(source&&source!==input.size||carrying&&carrying!==input.size)toolkitError('SWALLOW_SIZE_CONFLICT','The actual sourced body or explicitly measured carrying size contradicts this observation; no transformation is granted.')
 if(!swallowStateOf(state)?.sizes[input.entityId]&&Object.keys(swallowStateOf(state)?.sizes??{}).length>=256)toolkitError('SWALLOW_SIZE_HISTORY_LIMIT','Retained actual body-size observations are full; no past source measurement is erased.')
 const old=swallowStateOf(state)?.sizes[input.entityId]
 if(old&&old.size!==input.size)toolkitError('SWALLOW_SIZE_CONFLICT','A new observation nonce cannot resize this unchanged body.')
 swallow().sizes[input.entityId]={...input,at:now()};return{success:true,size:swallow().sizes[input.entityId],bodyChanged:false}
}
export function captureSwallowBite(sourceId:string,targetId:string,actionName:string,attackId:string,held=false,raw?:unknown):SwallowBiteContext|undefined{
 const state=gs.getState(),source=gs.getMonster(sourceId)
 if(source?.type!=='purple_worm'||actionName.toLowerCase()!=='bite')return
 assertHero()
 if(source.group)toolkitError('SWALLOW_INDIVIDUAL_SOURCE_REQUIRED','A source swallowing procedure requires one actual individual worm, never an aggregated group.')
 if(swallowedBy(state,sourceId)||swallowedBy(state,targetId))toolkitError('SWALLOW_BODY_ALREADY_CONTAINED','A source bite cannot fabricate a second/nested interior or re-swallow an already contained body.')
 const body=gs.getEntity(targetId);if(!body)toolkitError('SWALLOW_TARGET_REQUIRED','The actual selected target must remain present.')
 const rawSize=swallowStateOf(state)?.sizes[targetId]?.size??state.dmTools?.carrying?.actors[targetId]?.size??(body&&'type'in body?getMonsterRecord(body.type)?.source.size:undefined)
 const targetSize=typeof rawSize==='string'?rawSize:undefined
 const nativeSize=body&&'type'in body?getMonsterRecord(body.type)?.source.size:undefined,carryingSize=state.dmTools?.carrying?.actors[targetId]?.size
 if(nativeSize&&nativeSize!==targetSize||carryingSize&&carryingSize!==targetSize)toolkitError('SWALLOW_SIZE_CONFLICT','The retained actual body size contradicts its unchanged canonical source or measured carrying size; no transformation is granted by restore or observation.')
 if(!['Tiny','Small','Medium','Large','Huge','Gargantuan'].includes(targetSize??''))toolkitError('SWALLOW_TARGET_SIZE_REQUIRED','Observe the actual target size explicitly before the original bite; no player size or transformation is inferred.')
 if(Object.keys(swallowStateOf(state)?.bites??{}).length>=512||Object.keys(swallowStateOf(state)?.episodes??{}).length>=128)toolkitError('SWALLOW_HISTORY_LIMIT','Retained original source bites/episodes are full before any attack die, action or piercing wound.')
 const physicalIssue=groundDamageIssue(state,targetId,57);if(physicalIssue)toolkitError(physicalIssue.code,physicalIssue.message);if(!['Huge','Gargantuan'].includes(targetSize!))inspectExhaustion(targetId)
 if(held){const parsed=SwallowBiteContextSchema.safeParse(raw);if(!parsed.success||parsed.data.attackId!==attackId||parsed.data.sourceId!==sourceId||parsed.data.targetId!==targetId||parsed.data.targetSize!==targetSize||parsed.data.mapId!==state.currentMapId)toolkitError('SWALLOW_HELD_BITE_CONTEXT_REQUIRED','Retain the actual original Bite, source, target, map and measured size before any reaction die or cost.');return parsed.data}
 return{attackId,sourceId,targetId,mapId:state.currentMapId!,targetSize:targetSize as SwallowBiteContext['targetSize'],at:now(),turn:swallowTurn(state)}
}
function finishBite(id:string,save?:SavingThrowResult){
 const hit=swallow().bites[id];if(!hit)toolkitError('SWALLOW_BITE_REQUIRED','The original actual source Bite must already be committed once.')
 if(hit!.status==='resolved')return toolkitResult({...hit!.result,replayed:true})
 const c=hit!.context,body=gs.getEntity(c.targetId),host=gs.getMonster(c.sourceId)
 if(save&&(save.entityId!==c.targetId||save.ability!=='dex'||save.dc!==19))toolkitError('SWALLOW_SAVE_CONTEXT_INVALID','Keep the original actual target DEX19; no save or source is substituted.')
 let episode:SwallowState['episodes'][string]|undefined
 if(save&&!save.success&&body&&host&&living(body.id)&&living(host.id)){
  const outside={...body.position},effect=addEffect({kind:'purple-worm-swallow',sourceId:host.id,targetId:body.id,conditions:['blinded','restrained']})
  episode={id,sourceId:host.id,targetId:body.id,mapId:c.mapId,attackId:id,effectId:effect.id,enteredAt:now(),enteredTurn:c.turn,entryOutsideCell:outside,status:'inside'}
  swallow().episodes[id]=episode
  gs.syncSwallowProjections(host.id);if(body.id==='player'){hero().movementTrail=[];delete gs.getState().dmTools?.jumping?.footwork}
  if(gs.getState().dmTools?.jumping){delete gs.getState().dmTools!.jumping!.supports[body.id]}
 }
 if(save)save={...save,mechanicalSummary:`DEX ${save.roll.detail} vs DD19: ${save.success?'SUCCESS':'FAILURE'}`}
 const result={...hit!.baseAttack,swallow:{save,episode:episode?structuredClone(episode):undefined,swallowed:Boolean(episode),
  skipped:save?undefined:!living(c.targetId)?'target_already_dead':'actual_target_larger_than_Large',source:'Supplied MM2014 Purple Worm Bite,16300–16301; user containment decision4Nov2026.'}}
 hit!.status='resolved';hit!.result=structuredClone(result);return toolkitResult(result)
}
export function resolveSwallowBite(context:SwallowBiteContext|undefined,baseAttack:Record<string,unknown>){
 if(!context||baseAttack.hit!==true)return toolkitResult(baseAttack)
 const old=swallow().bites[context.attackId];if(old?.status==='resolved')return toolkitResult({...old.result,replayed:true})
 if(!old)swallow().bites[context.attackId]={context,baseAttack:structuredClone(baseAttack),status:'pending'}
 if(['Huge','Gargantuan'].includes(context.targetSize)||!living(context.targetId))return finishBite(context.attackId)
 return savedResolution({entityId:context.targetId,ability:'dex',dc:19},{domain:'worm-bite-save',command:{attackId:context.attackId}})
}
/** Called only by a real typed damage commit, after its source/body preflight. */
export function captureInsideSwallowDamage(attackerId:string|undefined,targetId:string,eventId:string){
 const state=gs.getState(),e=attackerId?activeSwallowEpisode(state,attackerId):undefined
 return e?.status==='inside'&&e.sourceId===targetId?{eventId,episodeId:e.id,sourceId:targetId,insideActorId:attackerId!,turn:swallowTurn(state),at:now()}:undefined
}
export function noteInsideSwallowDamage(context:ReturnType<typeof captureInsideSwallowDamage>,damageReceived:number){if(context){const old=swallow().damage[context.eventId];if(old&&old.damageReceived!==damageReceived)toolkitError('SWALLOW_DAMAGE_EVENT_CONFLICT','The actual source damage event cannot acquire another received amount.');swallow().damage[context.eventId]={...context,damageReceived}}}
export function reconcileSwallowDeaths(){
 const state=gs.getState()
 for(const episode of Object.values(swallowStateOf(state)?.episodes??{}))if(episode.status==='inside'&&!living(episode.sourceId)){
  episode.status='corpse_inside';const effect=state.monsterEffects?.find(e=>e.id===episode.effectId)
  if(effect){effect.conditions=effect.conditions.filter(c=>c!=='restrained');finishPersistedConditionRemoval(episode.targetId,'restrained',now())}
 }
}
export function followSwallowHost(sourceId:string){gs.syncSwallowProjections(sourceId)}
function prepareExits(event:{sourceId:string;episodeIds:string[]},exits:Array<{targetId:string;cell:{x:number;y:number}}>,maximumCells:number){
 const state=gs.getState(),host=gs.getMonster(event.sourceId),episodes=event.episodeIds.map(id=>swallowStateOf(state)?.episodes[id])
 if(!host||episodes.some(e=>!e)||exits.length!==episodes.length||new Set(exits.map(e=>e.targetId)).size!==exits.length||new Set(exits.map(e=>`${e.cell.x},${e.cell.y}`)).size!==exits.length||episodes.some(e=>!exits.some(exit=>exit.targetId===e!.targetId)))toolkitError('SWALLOW_EXIT_SELECTION_REQUIRED','Explicitly choose one distinct actual outside cell for every original contained body; no destination is filled or inferred.')
 const height=entityVerticalContext(state,host!.id);if(!height.known||height.zFeet!==0)toolkitError('SWALLOW_EXIT_VERTICAL_GEOMETRY_REQUIRED','Resolve actual 3D ejection/landing geometry before the source save; no airborne or raised exit is flattened to an XY ground cell.')
 const grid=navigationGrid(state,host!.id,undefined,{ignoreOccupantIds:episodes.map(e=>e!.targetId)})
 for(const exit of exits){gs.getEntity(exit.targetId)??toolkitError('SWALLOW_BODY_REQUIRED','The actual contained body must remain present.');const d=Math.max(Math.abs(exit.cell.x-host!.position.x),Math.abs(exit.cell.y-host!.position.y));if(d<1||d>maximumCells||!grid.free(exit.cell))toolkitError('SWALLOW_EXIT_CELL_INVALID','Choose an actual unoccupied outside source-range cell; the host cell, wall, distant cell or another body is not an exit.')
  let previous=host!.position;for(let step=1;step<=d;step++){const next={x:Math.round(host!.position.x+(exit.cell.x-host!.position.x)*step/d),y:Math.round(host!.position.y+(exit.cell.y-host!.position.y)*step/d)};if(!grid.step(previous,next,false,false))toolkitError('SWALLOW_EXIT_BLOCKED','The selected actual ejection/exit cannot pass through a represented wall or closed door.');previous=next}
 }
 const projection=structuredClone(state)
 for(const episode of episodes){projection.dmTools!.swallow!.episodes[episode!.id].status='regurgitated';const b=swallowActor(projection,episode!.targetId)!;b.conditions=[...b.conditions.filter(c=>!['blinded','restrained'].includes(c)),'prone']}
 gs.assertPhysicalDisplacements(exits.map(e=>({id:e.targetId,cell:e.cell,kind:'forced'})),projection)
 return exits
}
function commitExits(event:{episodeIds:string[]},exits:Array<{targetId:string;cell:{x:number;y:number}}>,status:'escaped'|'regurgitated'){
 for(const id of event.episodeIds){const e=swallow().episodes[id];e.status=status;e.endedAt=now();endEffect(e.effectId);gs.applyCondition(e.targetId,'prone')}
 return gs.commitPhysicalDisplacements(exits.map(e=>({id:e.targetId,cell:e.cell,kind:'forced'})))
}
function finishRegurgitation(eventId:string,save:SavingThrowResult){
 const event=swallow().events[eventId];if(!event||event.kind!=='regurgitation'||save.entityId!==event.sourceId||save.ability!=='con'||save.dc!==21)toolkitError('SWALLOW_SAVE_CONTEXT_INVALID','Keep the original source CON21 and actual end-turn ejection event.')
 save={...save,mechanicalSummary:`CON ${save.roll.detail} vs DD21: ${save.success?'SUCCESS':'FAILURE'}`}
 const ground=save.success?undefined:commitExits(event!,event!.exits!,'regurgitated'),result={eventId,save,regurgitated:!save.success,targetIds:event!.episodeIds.map(id=>swallow().episodes[id].targetId),ground}
 event!.status='resolved';event!.result=structuredClone(result);return toolkitResult(result)
}
export function resolveSwallowEvent(input:{eventId:string;endTurn?:boolean;exits?:Array<{targetId:string;cell:{x:number;y:number}}>}){
 assertHero();if(hero().pending)toolkitError('REACTION_PENDING','Complete the original held source save first.')
 const command=JSON.stringify(input),old=swallowStateOf(gs.getState())?.events[input.eventId];if(old?.status==='resolved'){if(old.command!==command)toolkitError('SWALLOW_EVENT_CONFLICT','The actual resolved source event retains its original choices; another exit or event kind is not a replay.');return toolkitResult({...old.result,replayed:true})}
 const event=dueSwallowEvents(gs.getState(),input.endTurn?'end':'action').find(e=>e.id===input.eventId)
 if(!event)toolkitError('SWALLOW_EVENT_NOT_DUE','Choose the exact currently due source turn event, never a fresh nonce or another turn.')
 if(Object.keys(swallowStateOf(gs.getState())?.events??{}).length>=1024)toolkitError('SWALLOW_HISTORY_LIMIT','Retained source-turn events are full before any save or damage die.')
 if(event!.kind==='acid'){
  if(input.endTurn!==undefined||input.exits!==undefined)toolkitError('SWALLOW_EVENT_ARGUMENTS','Source start-turn acid accepts no turn-ending declaration or invented exit choices.')
  for(const targetId of event!.targetIds){inspectExhaustion(targetId);const issue=groundDamageIssue(gs.getState(),targetId,36);if(issue)toolkitError(issue.code,issue.message)}
  const roll=rollDice('6d6'),results=event!.targetIds.map(targetId=>dealDamage(targetId,roll.total,'acid',{sourceId:event!.sourceId,damageEventId:randomUUID()}))
  const result={eventId:event!.id,kind:'acid',roll,results};swallow().events[event!.id]={...event!,command,status:'resolved',result};return toolkitResult(result)
 }
 if(input.endTurn!==true||!input.exits)toolkitError('SWALLOW_END_TURN_SELECTION_REQUIRED','Explicitly finish this actual turn and choose every potential outside ejection cell before the CON save or its Inspiration.')
 inspectExhaustion(event!.sourceId);const exits=prepareExits(event!,input.exits!,2);swallow().endingTurn=swallowTurnKey(gs.getState());swallow().events[event!.id]={...event!,command,status:'pending',exits}
 return savedResolution({entityId:event!.sourceId,ability:'con',dc:21},{domain:'worm-regurgitation-save',command:{eventId:event!.id}})
}
export function escapeWormCorpse(input:{episodeId:string;toCell:{x:number;y:number}}){
 const command=JSON.stringify(input),old=swallowStateOf(gs.getState())?.escapes[input.episodeId];if(old){if(old.command!==command)toolkitError('SWALLOW_ESCAPE_CONFLICT','The actual completed corpse exit has different original choices.');return toolkitResult({...old.result,replayed:true})}
 available();const e=swallowStateOf(gs.getState())?.episodes[input.episodeId],state=gs.getState()
 if(!e||e.status!=='corpse_inside'||living(e.sourceId)||!living(e.targetId))toolkitError('SWALLOW_CORPSE_ESCAPE_REQUIRED','Only an actual living contained body can spend movement to leave its actual dead host; no corpse is revived or source death invented.')
 const body=gs.getEntity(e!.targetId)!
 if(state.phase==='combat'&&state.currentTurn!==body.id)toolkitError('NOT_CURRENT_TURN','This source corpse escape spends the exact actual victim own turn movement.')
 const speed=movementSpeedProfile(state,body.id),remaining=state.phase==='combat'?Math.floor(speed.budgetFeet/5)-gs.getMovementUsed(body.id):Math.floor(speed.speedFeet/5)
 if(remaining<4)toolkitError('MOVEMENT_EXCEEDED','The source corpse escape requires20feet of real remaining movement; no speed or Dash credit is granted.')
 const exits=prepareExits({sourceId:e!.sourceId,episodeIds:[e!.id]},[{targetId:e!.targetId,cell:input.toCell}],1)
 if(state.phase!=='combat')assertGameTimeAdvance(6)
 if(state.phase==='combat')gs.addMovementUsed(body.id,4)
 const ground=commitExits({episodeIds:[e!.id]},exits,'escaped');if(state.phase!=='combat')advanceHeroTime(6)
 const result={success:true,episodeId:e!.id,targetId:e!.targetId,position:{...body.position},movementFeet:20,prone:body.conditions.includes('prone'),ground};swallow().escapes[e!.id]={command,result};return toolkitResult(result)
}
export function validateHeldSwallowSave(command:Record<string,unknown>){
 const resolution=command.toolkitResolution as{domain?:string;command?:{attackId?:string;eventId?:string}}|undefined
 if(resolution?.domain==='worm-bite-save'){const hit=swallowStateOf(gs.getState())?.bites[String(resolution.command?.attackId)];if(!hit||hit.status!=='pending'||!living(hit.context.sourceId)||!living(hit.context.targetId))toolkitError('SWALLOW_SAVE_CONTEXT_INVALID','Retain the actual original Bite and living source/target before any Inspiration die.')}
 if(resolution?.domain==='worm-regurgitation-save'){const event=swallowStateOf(gs.getState())?.events[String(resolution.command?.eventId)];if(!event||event.status!=='pending'||!living(event.sourceId)||!event.exits)toolkitError('SWALLOW_SAVE_CONTEXT_INVALID','Retain the actual original source end-turn save and every explicitly chosen ejection destination.');prepareExits(event!,event!.exits!,2)}
}
export function registerSwallowResolutions(){registerCheckedResolution('worm-bite-save',(c,s)=>finishBite(String(c.attackId),s as SavingThrowResult));registerCheckedResolution('worm-regurgitation-save',(c,s)=>finishRegurgitation(String(c.eventId),s as SavingThrowResult))}
