import { AdoptRenownSchema,RecordRenownOrganizationSchema,AwardRenownSchema,LoseRenownSchema,SetRenownRankSchema,renownAdoptionCommand,renownOrganizationCommand,renownEventCommand,renownProjection,renownSummary,renownRankIssue,validateRenownState,type RenownEvent } from '../lib/renown-state'
import { groundGearPhysicalWitness as witness } from '../lib/ground-gear-recovery-state'
import { readRenownSource } from './rules-library'
import { toolkitState,toolkitError } from './toolkit'
import * as gs from './game-state'
const now=()=>gs.getState().worldTimeSeconds??0
function ready(){if(gs.getState().phase==='combat')toolkitError('RENOWN_OUTSIDE_COMBAT','This first Renown bookkeeping procedure is outside combat; it grants no character action or resource.')}
function fact(id:string){const f=gs.getState().worldFacts?.find(f=>f.id===id);if(!f)toolkitError('RENOWN_ACTUAL_FACT_REQUIRED','Choose an exact existing actual decision, membership, completed occurrence or prerequisite fact. No event, membership, mission success or condition is inferred from prose.');return structuredClone(f!) as unknown as Record<string,unknown>}
function adopted(){return gs.getState().dmTools?.renown??toolkitError('RENOWN_NOT_ADOPTED','Explicitly adopt the optional DMG Renown rule with its actual decision fact first; no rule is silently activated.')}
function reserved(id:string){const d=adopted();return d.adoption.input.eventId===id||Object.values(d.organizations).some(o=>o.input.eventId===id)||Boolean(d.events[id])}
function eventResult(e:RenownEvent){return{success:true,eventId:e.input.eventId,operation:e.operation,sourceFactId:e.fact.id,sequence:e.sequence,organizationId:e.input.organizationId,scoreBefore:e.scoreBefore,scoreAfter:e.scoreAfter,rankBefore:e.rankBefore,rankAfter:e.rankAfter,pointsRequested:e.operation==='award'&&'kind'in e.input?e.input.kind==='interests'?1:2:e.operation==='loss'&&'lossPoints'in e.input?-e.input.lossPoints:0,pointsApplied:e.scoreAfter-e.scoreBefore,actionSpent:false,seconds:0,resourcesGranted:false,attitudesChanged:false}}
export function validateRenownSource(state:import('../lib/types').GameState){return state.dmTools?.renown&&witness(state.dmTools.renown.adoption.source)!==witness(readRenownSource())?['Optional Renown retains its actual original canonical DMG source; no silent alternate rule or source is adopted.']:[]}
export function adoptRenown(raw:unknown){
 const input=AdoptRenownSchema.parse(raw),old=gs.getState().dmTools?.renown
 if(old){if(witness(input)!==witness(old.adoption.input))toolkitError('RENOWN_ADOPTION_IMMUTABLE','Keep the original optional adoption; a new request cannot reset organizations, scores or ranks.');return{success:true,adopted:true,replayed:true}}
 ready();const adoption={input,decisionFact:fact(input.decisionFactId),source:readRenownSource(),at:now(),command:''};adoption.command=renownAdoptionCommand(adoption)
 toolkitState().renown={version:1,adoption,organizations:{},events:{}}
 return{success:true,adopted:true,optionalRule:true,organizationsCreated:0,pointsGranted:0,actionSpent:false,seconds:0}
}
export function recordRenownOrganization(raw:unknown){
 const input=RecordRenownOrganizationSchema.parse(raw),data=adopted(),old=data.organizations[input.organizationId]
 if(old){if(witness(old.input)!==witness(input))toolkitError('RENOWN_ORGANIZATION_IMMUTABLE','Retain the real original member organization, threshold/title definitions and command; no initial score or rewritten rank definition.');return{success:true,organizationId:input.organizationId,replayed:true,...renownSummary(gs.getState(),input.organizationId)}}
 ready();if(reserved(input.eventId))toolkitError('RENOWN_EVENT_CONFLICT','This actual command ID already identifies another original Renown operation.')
 if(Object.values(data.organizations).some(o=>o.input.membershipFactId===input.membershipFactId))toolkitError('RENOWN_MEMBERSHIP_FACT_ALREADY_USED','This original real membership fact already identifies its canonical organization; new IDs or labels do not create a second standing ledger.')
 if(Object.keys(data.organizations).length>=64)toolkitError('RENOWN_HISTORY_LIMIT','Retained actual member organizations are full; no existing history is evicted.')
 const org={input,membershipFact:fact(input.membershipFactId),at:now(),adoptionCommand:data.adoption.command,command:''};org.command=renownOrganizationCommand(org)
 const preview=structuredClone(gs.getState());preview.dmTools!.renown!.organizations[input.organizationId]=org
 const issues=validateRenownState(preview);if(issues.length)toolkitError('RENOWN_ORGANIZATION_INVALID',issues.join(' '))
 data.organizations[input.organizationId]=org
 return{success:true,organizationId:input.organizationId,score:0,rank:null,membership:'already_established',actionSpent:false,seconds:0,resourcesGranted:false}
}
function change(operation:'award'|'loss'|'rank',input:RenownEvent['input']){
 const data=adopted(),old=data.events[input.eventId]
 if(old){if(old.operation!==operation||witness(old.input)!==witness(input))toolkitError('RENOWN_EVENT_CONFLICT','Keep this exact original award/loss/rank command.');return{...eventResult(old),replayed:true}}
 ready();if(reserved(input.eventId))toolkitError('RENOWN_EVENT_CONFLICT','The original actual command ID is already used.')
 const organization=data.organizations[input.organizationId]??toolkitError('RENOWN_MEMBER_ORGANIZATION_REQUIRED','Select the exact real member organization already recorded. Names and faction tags do not create membership.')
 const factualId='decisionFactId'in input?input.decisionFactId:input.occurrenceFactId
 if(Object.values(data.events).some(e=>e.input.organizationId===input.organizationId&&(e.operation==='rank')===(operation==='rank')&&('decisionFactId'in e.input?e.input.decisionFactId:e.input.occurrenceFactId)===factualId))toolkitError('RENOWN_OCCURRENCE_ALREADY_USED','This same actual source occurrence already affected this organization; a new call nonce, +2 selection or sign cannot count it again.')
 if(Object.keys(data.events).length>=1024)toolkitError('RENOWN_HISTORY_LIMIT','Actual Renown event history is full and cannot be reset or evicted.')
 const before=renownSummary(gs.getState(),input.organizationId),event:RenownEvent={input,operation,fact:fact(factualId),prerequisiteFacts:'prerequisiteFacts'in input?input.prerequisiteFacts.map(p=>fact(p.factId)):[],levelAtDecision:gs.getState().player.level,at:now(),sequence:Object.keys(data.events).length+1,organizationCommand:organization.command,command:'',scoreBefore:before.score,scoreAfter:0,rankBefore:before.rank,rankAfter:null}
 if(operation==='rank'){const issue=renownRankIssue(organization,event,before.score,before.rank);if(issue)toolkitError('RENOWN_RANK_PREREQUISITES_REQUIRED',issue)}
 const after=renownProjection(before.score,before.rank,event);event.scoreAfter=after.score;event.rankAfter=after.rank;event.command=renownEventCommand(event)
 const preview=structuredClone(gs.getState());preview.dmTools!.renown!.events[input.eventId]=event;const issues=validateRenownState(preview);if(issues.length)toolkitError('RENOWN_EVENT_INVALID',issues.join(' '))
 data.events[input.eventId]=event;return eventResult(event)
}
export const awardRenown=(raw:unknown)=>change('award',AwardRenownSchema.parse(raw))
export const loseRenown=(raw:unknown)=>change('loss',LoseRenownSchema.parse(raw))
export const setRenownRank=(raw:unknown)=>change('rank',SetRenownRankSchema.parse(raw))
export function inspectRenown(){const state=gs.getState(),data=state.dmTools?.renown;return{readOnly:true,adopted:Boolean(data),organizations:Object.values(data?.organizations??{}).map(o=>({organizationId:o.input.organizationId,name:o.input.name,membership:'already_established',...renownSummary(state,o.input.organizationId),ranks:o.input.ranks})),events:Object.values(data?.events??{}).map(eventResult),notice:'Optional DMG Renown: this first tool subset tracks already-established members only, starting at zero. The source example joining at1renown remains outside this scope. No automatic promotion, attitude, perk, resource or affiliation.'}}
