import { assertGreaterBrewingIdAvailable } from './toolkit'
import { randomUUID } from 'node:crypto'
import { ObservePoisonHarvestSchema,BeginPoisonHarvestSchema,WorkPoisonHarvestSchema,ResolvePoisonHarvestSchema,type PoisonHarvestAttempt } from '../lib/poison-harvest-state'
import { groundGearPhysicalWitness as witness } from '../lib/ground-gear-recovery-state'
import { PLAYER_POISONS } from '../lib/srd/player-poisons'
import { AFFLICTIONS } from '../lib/srd/afflictions'
import { entityVerticalContext } from '../lib/jumping-state'
import { inferRoomIdOnMap } from '../lib/adventure-map'
import { breathingActivityIssue } from '../lib/activity-preflight'
import type { AbilityCheckResult,SavingThrowResult } from '../lib/types'
import { toolkitState,toolkitError,toolkitResult,assertToolkitReach,toolkitLocation } from './toolkit'
import { naturalPlayerPoisonSource,preflightActualPoisonExposure,startActualPlayerPoisonDelivery,registerPlayerPoisonContinuation } from './player-poison-exposure'
import { checkedResolution,registerCheckedResolution } from './toolkit-checks'
import { available,now,advanceHeroTime } from './hero-rules'
import { equipmentId,freeHands,afterInventoryChange } from './equipment'
import { rollDice } from './dice'
import { assertGameTimeAdvance } from './time-preflight'
import { preflightRestStrenuousInterval,recordRestMeasuredActivityInterval } from './resting'
import * as gs from './game-state'
import * as rules from './rules'
const harvest=()=>toolkitState().poisonHarvest??={version:1 as const,sources:{},attempts:{},receipts:{}}
function history(){if(Object.keys(harvest().receipts).length>=2048)toolkitError('HARVEST_HISTORY_LIMIT','Harvest history is full before any duration, work, check or dose.')}
function replay(id:string,command:string){const receipt=gs.getState().dmTools?.poisonHarvest?.receipts[id];if(receipt&&receipt.command!==command)toolkitError('HARVEST_EVENT_CONFLICT','Retain this exact physical harvesting event and its original arguments.');return receipt?{...structuredClone(receipt.result),replayed:true}:undefined}
function remember(id:string,command:string,result:Record<string,unknown>){harvest().receipts[id]={command,at:now(),result:structuredClone(result)};return result}
function capable(){available();rules.validateActionUse('player');if(gs.getState().phase==='combat')toolkitError('HARVEST_EXPLORATION_REQUIRED','This extraction work is supported outside combat; no action, initiative or extra clock tick is fabricated. Its retained duration/work can resume afterwards.')}
function actualSource(id:string,templateId:PoisonHarvestAttempt['templateId']){
 const natural=naturalPlayerPoisonSource(id,templateId),body=gs.getPhysicalCreature(id)!,state=gs.getState()
 if(body.conditions.includes('petrified'))toolkitError('HARVEST_ORGANIC_MATERIAL_UNREPRESENTED','Petrification transforms this actual organic body. No organic venom or accessible gland is inferred from stone.')
 const roomId=inferRoomIdOnMap(body.position,state.currentMapId,state),vertical=entityVerticalContext(state,id)
 if(!roomId||!vertical.known)toolkitError('HARVEST_PHYSICAL_LOCATION_REQUIRED','The true source location and accessible working level must be known; no anatomy, height or remote body is invented.')
 assertToolkitReach({mapId:state.currentMapId!,roomId,cell:body.position,surfaceZFeet:vertical.zFeet!})
 return{body,roomId,bodyWitness:witness(JSON.parse(natural.bodyWitness))}
}
function actualFact(id:string,cell:{x:number;y:number},itemId?:string){const state=gs.getState(),fact=state.worldFacts?.find(f=>f.id===id);if(!fact||fact.mapId!==state.currentMapId||fact.roomId!==state.currentRoomId||fact.narrativeEffect?.cell.x!==cell.x||fact.narrativeEffect.cell.y!==cell.y||itemId&&fact.subjectItemId!==undefined&&fact.subjectItemId!==itemId)toolkitError('HARVEST_PHYSICAL_FACT_REQUIRED','Establish an actual current physical observation at this exact body/container, not a distant fact, price or fabricated source.');return structuredClone(fact!) as unknown as Record<string,unknown>}
function unchangedFact(value:Record<string,unknown>){const actual=gs.getState().worldFacts?.find(f=>f.id===value.id);if(!actual||witness(actual)!==witness(value))toolkitError('HARVEST_PHYSICAL_FACT_CHANGED','The real accessible material/container observation has changed. No substitute observation or renewed venom is selected.')}
function unusedOutput(id:string,except?:string){assertGreaterBrewingIdAvailable(id);const state=gs.getState();if(state.player.inventory.some(i=>i.id===id)||state.droppedItems?.[id]||state.monsters[id]||state.npcs?.[id]||state.dmTools?.objects[id]||state.dmTools?.merchants?.stocks[id]||Object.values(state.dmTools?.poisonHarvest?.attempts??{}).some(a=>a.id!==except&&a.input.doseItemId===id)||Object.values(state.dmTools?.playerPoisons?.preparations??{}).some(p=>p.doseItemId===id)||Object.values(state.dmTools?.playerPoisons?.clouds??{}).some(p=>p.doseItemId===id)||Object.values(state.dmTools?.ordinaryCrafting?.projects??{}).some(p=>p.input.outputItemIds.includes(id)))toolkitError('HARVEST_DOSE_ID_CONFLICT','Use a distinct unused filled-dose identity; an existing item or consumed dose cannot be renewed.')}
function containerFor(input:PoisonHarvestAttempt['input']){
 const state=gs.getState(),item=state.player.inventory.find(i=>i.id===input.containerItemId)
 if(!item||equipmentId(item)!=='vial'||item.magical||item.quantity!==undefined&&item.quantity!==1||state.dmTools?.groundGear?.stocks[item.id]||state.dmTools?.foraging?.containers[item.id]||state.dmTools?.spellbooks?.materials[item.id]||Object.values(state.dmTools?.poisonHarvest?.attempts??{}).some(a=>a.id!==input.attemptId&&a.status!=='resolved'&&a.input.containerItemId===item.id))toolkitError('HARVEST_ACTUAL_EMPTY_VIAL_REQUIRED','Choose one actually owned empty suitable vial, without other contents/reservation. No glass, capacity, purification or container is created.')
 if(freeHands()<1)toolkitError('HARVEST_FREE_HAND_REQUIRED','Free an actual hand for this manual extraction and its real vial.')
 if(input.poisonersKitItemId){const kit=state.player.inventory.find(i=>i.id===input.poisonersKitItemId);if(!kit||equipmentId(kit)!=='poisoners_kit'||!state.player.toolProficiencies?.includes('poisoners_kit')||state.player.skillProficiencies?.includes('nature'))toolkitError('HARVEST_KIT_FALLBACK_INVALID','Kit fallback requires the actual owned mastered poisoners kit and absence of Nature proficiency. Never add mastery twice or invent familiarity.')}
 return item!
}
function context(a:PoisonHarvestAttempt){
 const source=harvest().sources[a.input.sourceId],actual=actualSource(a.input.sourceId,a.templateId),state=gs.getState()
 if(!source||source.activeAttemptId!==a.id||source.input.eventId!==a.observation.eventId||source.remaining===undefined||source.remaining<1||actual.bodyWitness!==a.bodyWitness||state.currentMapId!==a.mapId||actual.roomId!==a.roomId)toolkitError('HARVEST_SOURCE_CHANGED','Retain the exact real body, reserve, original observation and physical worksite; no new body or availability is selected.')
 unchangedFact(source.physicalFact);unchangedFact(a.containerFact)
 const item=containerFor(a.input);if(witness(item)!==witness(a.container))toolkitError('HARVEST_CONTAINER_CHANGED','The original real empty container changed or was spent; preserve original work, do not create another vial.')
 unusedOutput(a.input.doseItemId,a.id);const vertical=entityVerticalContext(state,'player'),location=toolkitLocation(a.input.doseCell)
 assertToolkitReach({...location,cell:a.input.doseCell,...vertical.known?{surfaceZFeet:vertical.zFeet!}:{}})
 if(location.mapId!==a.mapId||location.roomId!==a.roomId)toolkitError('HARVEST_DOSE_LOCATION_CHANGED','Keep the explicitly selected real reachable dose drop point.')
 preflightActualPoisonExposure(a.templateId,'player')
 return witness({body:a.bodyWitness,container:a.container,player:{id:state.player.id,stats:state.player.stats,proficiencyBonus:state.player.proficiencyBonus,skillProficiencies:state.player.skillProficiencies,expertise:state.player.expertise,toolProficiencies:state.player.toolProficiencies,conditions:state.player.conditions,position:state.player.position},kit:a.input.poisonersKitItemId?state.player.inventory.find(i=>i.id===a.input.poisonersKitItemId):null,mapId:a.mapId,roomId:a.roomId,doseCell:a.input.doseCell})
}
function summary(a:PoisonHarvestAttempt){return{attemptId:a.id,sourceId:a.input.sourceId,templateId:a.templateId,status:a.status,duration:a.duration,requiredSeconds:a.requiredSeconds,workedSeconds:a.workedSeconds,startedAt:a.startedAt,workDue:a.workedSeconds===a.requiredSeconds&&now()>=a.startedAt+a.requiredSeconds}}
export function observePoisonHarvest(raw:unknown){
 const input=ObservePoisonHarvestSchema.parse(raw),command=JSON.stringify({operation:'harvest-observe',input}),old=replay(input.eventId,command);if(old)return old
 capable();history();const actual=actualSource(input.sourceId,input.templateId),physicalFact=actualFact(input.physicalFactId,actual.body.position),data=harvest(),prior=data.sources[input.sourceId]
 if(!prior&&Object.keys(data.sources).length>=128)toolkitError('HARVEST_SOURCE_LIMIT','Actual observed source history is full.')
 if(prior){if(prior.activeAttemptId)toolkitError('HARVEST_ATTEMPT_RESERVED','Finish the actual retained attempt before reobserving availability. A new nonce never rerolls duration or supplies venom.');if(prior.input.templateId!==input.templateId||input.afterAttemptId!==prior.lastAttemptId||prior.usedFactIds.includes(input.physicalFactId)||input.availableDoses>prior.upperBound)toolkitError('HARVEST_RESERVE_CANNOT_REFILL','Explicitly reassess the same source after its last actual attempt using a new real observation. Availability cannot increase or recharge by time/nonce. New biological material is not represented.');if(prior.usedFactIds.length>=256)toolkitError('HARVEST_OBSERVATION_LIMIT','The actual body observation history is full.')}
 else if(input.afterAttemptId)toolkitError('HARVEST_ATTEMPT_UNKNOWN','No earlier actual attempt exists for this source.')
 data.sources[input.sourceId]={input,at:now(),physicalFact,bodyWitness:actual.bodyWitness,upperBound:input.availableDoses,remaining:input.availableDoses,lastAttemptId:prior?.lastAttemptId,usedFactIds:[...prior?.usedFactIds??[],input.physicalFactId]}
 return remember(input.eventId,command,{sourceId:input.sourceId,templateId:input.templateId,observationEventId:input.eventId,availableDoses:input.availableDoses,adjudication:'Finite physically observed accessible reserve, not a published one-dose-per-body rule. No regeneration or nonce refill.',timeSpent:0,itemsGranted:0})
}
export function beginPoisonHarvest(raw:unknown){
 const input=BeginPoisonHarvestSchema.parse(raw),command=JSON.stringify({operation:'harvest-begin',input}),old=replay(input.eventId,command);if(old)return old
 capable();history();const data=harvest(),source=data.sources[input.sourceId]
 if(!source||source.input.eventId!==input.observationEventId||source.remaining===undefined||source.remaining<1)toolkitError('HARVEST_RESERVE_OBSERVATION_REQUIRED','Establish actual accessible organic material and a finite available reserve, or reassess after failure. No dose count is inferred from a stat block.')
 if(source.activeAttemptId||data.attempts[input.attemptId])toolkitError('HARVEST_ATTEMPT_RESERVED','Continue the original real attempt. A new ID never rerolls its retained duration.')
 if(Object.keys(data.attempts).length>=512)toolkitError('HARVEST_ATTEMPT_LIMIT','Actual extraction history is full before rolling duration.')
 const actual=actualSource(input.sourceId,source.input.templateId);if(actual.bodyWitness!==source.bodyWitness)toolkitError('HARVEST_SOURCE_CHANGED','Reobserve the actual changed body before extraction, never inherit its old availability automatically.')
 unchangedFact(source.physicalFact);const container=structuredClone(containerFor(input)),containerFact=actualFact(input.containerFactId,gs.getPlayer().position,container.id)
 const a:PoisonHarvestAttempt={id:input.attemptId,input,templateId:source.input.templateId,observation:source.input,mapId:gs.getState().currentMapId!,roomId:actual.roomId,bodyWitness:actual.bodyWitness,container,containerFact,startedAt:now(),duration:{notation:'1d6',rolls:[1],modifier:0,total:1,detail:''},requiredSeconds:60,workedSeconds:0,status:'working',segments:[],exposureId:`harvest-exposure:${randomUUID()}`}
 source.activeAttemptId=a.id;context(a) // All real output/exposure checks precede the original duration die.
 a.duration=rollDice('1d6');a.requiredSeconds=a.duration.total*60;data.attempts[a.id]=a
 return remember(input.eventId,command,{...summary(a),timeSpent:0,itemsGranted:0})
}
function attempt(id:string){return harvest().attempts[id]??toolkitError('HARVEST_ATTEMPT_REQUIRED','Choose the actual retained harvesting attempt.')}
export function workPoisonHarvest(raw:unknown){
 const input=WorkPoisonHarvestSchema.parse(raw),command=JSON.stringify({operation:'harvest-work',input}),old=replay(input.eventId,command);if(old)return old
 capable();history();const a=attempt(input.attemptId);if(a.status!=='working')toolkitError('HARVEST_WORK_CLOSED','This attempt is already being resolved; no extra work or new die is selected.')
 context(a);if(input.seconds>a.requiredSeconds-a.workedSeconds)toolkitError('HARVEST_WORK_OVERSHOOT','Work only the retained actual remaining extraction time; no new attempt or spare dose is created.')
 const breath=breathingActivityIssue(gs.getState(),'player',input.seconds);if(breath)toolkitError(breath.code,breath.message)
 const state=gs.getState(),end=now()+input.seconds,body=gs.getPhysicalCreature(a.input.sourceId)
 const recovery=body&&'npcLife'in body?body.npcLife?.episode?.recovery?.wakeAt??body.knockout?.recovery?.wakeAt:undefined
 const sourceBreath=state.dmTools?.breathing?.creatures[a.input.sourceId]?.episode
 const collapseAt=sourceBreath?.phase==='holding'?sourceBreath.breathEndsAt!+6*sourceBreath.graceRounds:sourceBreath?.phase==='choking'?sourceBreath.collapseAt:undefined
 const incap=['incapacitated','unconscious','paralyzed','stunned']
 const sourceEffectEnds=state.hero?.effects.some(e=>e.targetIds.includes(a.input.sourceId)&&e.expiresAt<=end&&incap.includes(String(e.data.condition)))||state.monsterEffects?.some(e=>e.targetId===a.input.sourceId&&!e.petrificationPause&&e.expiresAt!==undefined&&e.expiresAt<=end&&e.conditions.some(c=>incap.includes(c)))
 if(sourceEffectEnds||body&&'isAlive'in body&&body.isAlive&&collapseAt!==undefined&&collapseAt<=end)toolkitError('HARVEST_SOURCE_EVENT_BOUNDARY','Stop before this actual source condition/breathing transition. Future incapacity and accessibility are not inferred.')
 if(recovery!==undefined&&recovery<=end)toolkitError('HARVEST_SOURCE_EVENT_BOUNDARY','Stop before this real source recovery; future incapacity and accessible material are not inferred.')
 for(const r of Object.values(state.dmTools?.afflictions?.records??{}))if(['player',a.input.sourceId].includes(r.targetId)&&['active','pending'].includes(r.status)&&!r.petrificationPause&&r.nextAt!==undefined&&r.nextAt<=end)toolkitError('HARVEST_SOURCE_EVENT_BOUNDARY','Resolve the actual harvester/source affliction boundary before further manual work.')
 preflightRestStrenuousInterval();assertGameTimeAdvance(input.seconds);const from=now();advanceHeroTime(input.seconds);recordRestMeasuredActivityInterval({eventId:`harvest:${input.eventId}`,from,to:now(),activity:input.restActivity,reason:input.activitySource.slice(0,600)})
 a.workedSeconds+=input.seconds;a.segments.push({eventId:input.eventId,from,to:now(),seconds:input.seconds,restActivity:input.restActivity,source:input.activitySource})
 return remember(input.eventId,command,{...summary(a),secondsSpent:input.seconds,itemsGranted:0})
}
function finish(a:PoisonHarvestAttempt,exposure?:Record<string,unknown>){const source=harvest().sources[a.input.sourceId],success=Number((a.check?.roll as {total:number}).total)>=20;source.lastAttemptId=a.id;delete source.activeAttemptId;if(success){source.upperBound--;source.remaining=source.upperBound}else delete source.remaining
 const result={...summary(a),status:'resolved',success,check:a.check,...success?{doseItemId:a.input.doseItemId,physicalContainerItemId:a.container.id,doseCell:a.input.doseCell,itemsGranted:1}:{itemsGranted:0},...exposure?{exposure}:{},availabilityRequiresObservation:!success,actionSpent:false,timeSpent:0}
 a.status='resolved';a.completedAt=now();a.result=result;return toolkitResult(result)
}
export function validateHeldPoisonHarvestCheck(command:Record<string,unknown>){const resolution=command.toolkitResolution as {domain?:string;command?:{attemptId?:string}}|undefined;if(resolution?.domain!=='poison-harvest-check')return;const a=attempt(String(resolution.command?.attemptId));capableHeld();if(a.status!=='checking'||context(a)!==a.checkContext)toolkitError('HARVEST_HELD_CONTEXT_CHANGED','Retain the real source, empty container, original proficiency/context and exact Nature check before any optional reaction die.')}
function capableHeld(){const player=gs.getPlayer();if(player.hp.current<=0||player.conditions.some(c=>['incapacitated','unconscious','petrified','paralyzed','stunned'].includes(c)))toolkitError('HARVEST_ACTOR_UNAVAILABLE','Actual manual extraction requires a living capable harvester, without consuming an optional reaction die.');if(gs.getState().phase==='combat')toolkitError('HARVEST_EXPLORATION_REQUIRED','Resume the held actual extraction check outside combat; no combat action is fabricated.')}
registerCheckedResolution('poison-harvest-check',(command,checked:AbilityCheckResult|SavingThrowResult)=>{
 const a=attempt(String(command.attemptId));capableHeld();if(a.status!=='checking'||context(a)!==a.checkContext||checked.entityId!=='player'||checked.ability!=='int'||checked.dc!==20||!('proficient'in checked))toolkitError('HARVEST_HELD_CONTEXT_CHANGED','Finish exactly the original retained INT Nature20 check and its actual physical context.')
 a.check=structuredClone(checked) as unknown as Record<string,unknown>
 if(checked.roll.total>=20){const state=gs.getState();state.player.inventory=state.player.inventory.filter(i=>i.id!==a.container.id);state.droppedItems??={};state.droppedItems[a.input.doseItemId]={item:{id:a.input.doseItemId,equipmentId:PLAYER_POISONS[a.templateId].equipmentId,name:AFFLICTIONS[a.templateId].label,type:'misc',quantity:1,magical:false},mapId:a.mapId,roomId:a.roomId,position:{...a.input.doseCell}};afterInventoryChange();return finish(a)}
 if(checked.roll.total>15)return finish(a)
 a.status='exposing';return startActualPlayerPoisonDelivery({id:a.exposureId,command:JSON.stringify({domain:'harvest',attemptId:a.id,sourceId:a.input.sourceId,templateId:a.templateId}),templateId:a.templateId,targetId:'player',sourceActorId:a.input.sourceId,naturalSourceId:a.input.sourceId,physicalFact:harvest().sources[a.input.sourceId].physicalFact,baseAttack:{playerPoisonContinuation:{domain:'harvest',attemptId:a.id}}})
})
registerPlayerPoisonContinuation('harvest',deliveryId=>{const delivery=gs.getState().dmTools?.playerPoisons?.deliveries[deliveryId],id=(delivery?.baseAttack?.playerPoisonContinuation as {attemptId?:string}|undefined)?.attemptId,a=attempt(String(id));if(a.status==='resolved')return toolkitResult({...a.result,replayed:true});if(a.status!=='exposing'||a.exposureId!==deliveryId||!delivery?.result)toolkitError('HARVEST_EXPOSURE_CONTEXT_REQUIRED','Finish the exact already-real natural poison exposure, without repeating its save or checking a newly changed body.');return finish(a,delivery.result)})
export function resolvePoisonHarvest(raw:unknown){const input=ResolvePoisonHarvestSchema.parse(raw),a=attempt(input.attemptId);if(a.status==='resolved')return toolkitResult({...a.result,replayed:true});if(a.status==='checking'||a.status==='exposing'){const pending=gs.getState().hero?.pending;if(!pending)toolkitError('HARVEST_HELD_CONTEXT_REQUIRED','The original unresolved check/save is required, never roll a replacement.');return toolkitResult({...summary(a),pendingReaction:pending,alreadyPending:true})}
 capable();history();context(a);if(a.workedSeconds!==a.requiredSeconds||now()<a.startedAt+a.requiredSeconds)toolkitError('HARVEST_WORK_NOT_DUE','Complete the actual retained1d6minutes of extraction work and real time before INT Nature20. Waiting alone supplies no work.')
 a.checkContext=context(a);a.status='checking';return checkedResolution({entityId:'player',ability:'int',skill:'nature',dc:20,...a.input.poisonersKitItemId?{toolId:'poisoners_kit'}:{},label:'Récolte réelle de poison — Nature DD20'},{domain:'poison-harvest-check',command:{attemptId:a.id}})
}
export function inspectPoisonHarvest(){return{sources:Object.entries(gs.getState().dmTools?.poisonHarvest?.sources??{}).map(([sourceId,s])=>({sourceId,templateId:s.input.templateId,observationEventId:s.input.eventId,availableDoses:s.remaining,remainingUpperBound:s.upperBound,activeAttemptId:s.activeAttemptId,lastAttemptId:s.lastAttemptId,availabilityRequiresObservation:s.remaining===undefined})),attempts:Object.values(gs.getState().dmTools?.poisonHarvest?.attempts??{}).map(summary),readOnly:true,source:'DMG2014 Crafting and Harvesting Poison8626–8633. Reserve observations/container suitability are physical MJ adjudications, not RAW dose-per-body, refill, freshness or work-rate rules.'}}
