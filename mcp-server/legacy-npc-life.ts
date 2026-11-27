import { ObserveLegacyNpcLifeSchema } from '../lib/legacy-npc-life-state'
import { createNpcState,isStatBackedNpc } from '../lib/npc-stat-blocks'
import { getMonsterRecord } from '../lib/srd/monsters'
import { inferRoomIdOnMap } from '../lib/adventure-map'
import { hasUnresolvedNpcLifeObservation } from '../lib/npc-life-state'
import { visibleCell } from './monster-perception'
import { assertBreathingRecoveryAllowed } from './breathing'
import { toolkitError,toolkitResult } from './toolkit'
import * as gs from './game-state'
export function observeLegacyNpcLife(raw:unknown){
 const input=ObserveLegacyNpcLifeSchema.parse(raw),command=JSON.stringify(input),state=gs.getState(),npc=state.npcs?.[input.entityId],prior=npc?.npcLife?.legacyObservation
 if(prior){if(prior.command!==command)toolkitError('NPC_LIFE_OBSERVATION_IMMUTABLE','This life observation already exists. Do not rewrite a known life, reset uncertainty or replace its real normalization.');return toolkitResult({...prior.result,replayed:true})}
 if(!npc||!gs.npcOnCurrentMap(npc)||state.monsters[input.entityId]||npc.hp?.current!==0||npc.isAlive!==undefined||npc.npcLife||npc.knockout||npc.group||state.hero?.corpseTimes[input.entityId]!==undefined)toolkitError('NPC_LEGACY_LIFE_OBSERVATION_REQUIRED','Choose only an actual current-map improvised individual at0HP whose life was genuinely absent from the legacy state. Known living/dead actors, combat bodies, groups and archives cannot be rewritten.')
 if(state.hero?.pending)toolkitError('REACTION_PENDING','Finish the actual held result before observing another life state.')
 const source=state.dmTools?.npcs[input.entityId],record=source&&getMonsterRecord(source.statBlock)
 if(!source||!record)toolkitError('NPC_LEGACY_STAT_BLOCK_SOURCE_REQUIRED','The exact retained original improvised creation and canonical stat block are required; no profile is inferred from name, description or new arguments.')
 const roomId=inferRoomIdOnMap(npc!.position,state.currentMapId,state),fact=state.worldFacts?.find(f=>f.id===input.physicalFactId)
 if(!fact||fact.mapId!==state.currentMapId||fact.roomId!==roomId||fact.narrativeEffect?.cell.x!==npc!.position.x||fact.narrativeEffect.cell.y!==npc!.position.y)toolkitError('NPC_LIFE_PHYSICAL_OBSERVATION_REQUIRED','Establish the actual current life observation at this same real body, not a remote assertion or inferred past event.')
 const immune=((record!.reference??record!.source).condition_immunities as Array<{index:string}>|undefined)?.some(c=>c.index==='unconscious')
 if(input.observedState==='living_zero_unresolved'&&immune)toolkitError('NPC_LIFE_CONDITION_IMMUNE','This source cannot use the supported unconscious0HP life procedure. No source exception or consciousness is invented.')
 const originalNpc=structuredClone(npc!) as unknown as Record<string,unknown>,seed=createNpcState({id:npc!.id,name:npc!.name,kind:npc!.kind,statBlock:source!.statBlock,cell:{...npc!.position},roomId:npc!.roomId,disposition:npc!.disposition,visibleFromStart:npc!.visible,description:npc!.description},state.currentMapId!)
 const observed={...seed,...npc!,hp:{...npc!.hp!},conditions:[...npc!.conditions??[]],isAlive:input.observedState==='living_zero_unresolved'}
 if(observed.isAlive){for(const condition of ['unconscious','prone'] as const)if(!observed.conditions.includes(condition))observed.conditions.push(condition)}
 const result={success:true,entityId:input.entityId,observedState:input.observedState,observedAt:state.worldTimeSeconds??0,hpAfter:0,deathAtKnown:false,deathSaveCountersKnown:false,stabilityKnown:false,normalized:false,healingGranted:0,actionSpent:false,timeSpent:0,sourceStatBlock:source!.statBlock}
 observed.npcLife={receipts:{},legacyObservation:{input,command,at:state.worldTimeSeconds??0,sourceStatBlock:source!.statBlock,sourceCreation:source!.creation,originalNpc,physicalFact:structuredClone(fact!) as unknown as Record<string,unknown>,unknownHistory:{injuryAt:'unknown',deathAt:'unknown',deathSaveCounters:'unknown',stability:'unknown'},result}}
 state.npcs![input.entityId]=observed
 return toolkitResult(result)
}
export function inspectLegacyNpcLife(){const state=gs.getState();return toolkitResult({readOnly:true,observations:Object.values(state.npcs??{}).flatMap(npc=>npc.npcLife?.legacyObservation?[{entityId:npc.id,observedState:npc.npcLife.legacyObservation.input.observedState,observedAt:npc.npcLife.legacyObservation.at,unknownHistory:npc.npcLife.legacyObservation.unknownHistory,resolution:npc.npcLife.legacyObservation.resolution,hp:npc.hp,isAlive:npc.isAlive}]:[]),rule:'PHB2014 Monsters and Death6101–6103, Stabilizing6089–6095. Present observation never creates past counters, stabilization, death time or recovery die.'})}
export function validateHeldLegacyNpcMedicine(command:Record<string,unknown>){
 const r=command.toolkitResolution as {domain?:string;command?:Record<string,unknown>}|undefined,c=r?.command
 if(r?.domain!=='combat-simple'||c?.action!=='stabilize'||typeof c.observationEventId!=='string')return
 const target=gs.getMonster(String(c.targetId)),actor=gs.getEntity(String(c.actorId)),state=gs.getState()
 if(!target||!hasUnresolvedNpcLifeObservation(target)||target.npcLife!.legacyObservation!.input.eventId!==c.observationEventId||!actor||actor.hp.current<=0||actor.conditions.some(v=>['incapacitated','unconscious','paralyzed','petrified','stunned'].includes(v))||state.phase==='combat'&&state.currentTurn!==actor.id||Math.max(Math.abs(actor.position.x-target.position.x),Math.abs(actor.position.y-target.position.y))>1||!visibleCell({...actor,conditions:actor.conditions.filter(v=>v!=='blinded')},target.position))toolkitError('NPC_MEDICINE_CONTEXT_CHANGED','Retain the exact currently observed living0HP body, original capable helper and actual reach before any optional Medicine reaction die. No new observation, life or stabilization is selected.')
 assertBreathingRecoveryAllowed(target!.id)
}
export function validateLegacyNpcLifeObservation(npc:import('../lib/types').MonsterState,state:import('../lib/types').GameState){
 const o=npc.npcLife?.legacyObservation;if(!o)return[]
 const issues:string[]=[],source=state.dmTools?.npcs[npc.id],at=state.worldTimeSeconds??0,before=o.originalNpc
 if(o.input.entityId!==npc.id||o.command!==JSON.stringify(o.input)||o.at>at||!source||source.statBlock!==o.sourceStatBlock||source.creation!==o.sourceCreation||!isStatBackedNpc(npc as import('../lib/types').NpcState)||npc.statBlock?.type!==o.sourceStatBlock||(before.hp as {current?:number})?.current!==0||before.isAlive!==undefined||before.npcLife!==undefined||before.knockout!==undefined)issues.push('A legacy life observation needs the exact genuinely unknown original0HP body and retained improvised source.')
 if(o.physicalFact.id!==o.input.physicalFactId||o.result.observedState!==o.input.observedState||o.result.observedAt!==o.at||o.resolution&&(o.resolution.at<o.at||o.resolution.at>at))issues.push('Retain the actual current physical observation and monotone normalization time.')
 if(!o.resolution&&(o.input.observedState==='dead'&&(npc.isAlive||npc.hp.current!==0||state.hero?.corpseTimes[npc.id]!==undefined)||o.input.observedState==='living_zero_unresolved'&&(!npc.isAlive||npc.hp.current!==0||!npc.conditions.includes('unconscious')||npc.npcLife?.episode||npc.knockout)))issues.push('Observation cannot resurrect, heal, stabilize, invent old counters or date an old death.')
 if(!o.resolution&&o.input.observedState==='living_zero_unresolved'&&at>o.at+6)issues.push('An unknown legacy life cannot skip its conservative present-observation uncertainty bound; no old save date is invented.')
 if(o.resolution?.kind==='stabilized'&&npc.npcLife?.episode?.origin==='observation'&&npc.npcLife.episode.at!==o.resolution.at)issues.push('A normalized episode starts at the true new stabilization, not the unknown injury.')
 return issues
}
