import { z } from 'zod'
import type { GameState } from './types'
import { groundGearPhysicalWitness as witness } from './ground-gear-recovery-state'
const Id=z.string().min(1).max(100).refine(s=>!['constructor','prototype','__proto__'].includes(s)),Text=z.string().trim().min(1).max(1000),Value=z.record(z.string(),z.unknown()),Time=z.number().int().nonnegative(),Points=z.number().int().nonnegative().max(1000000)
export const AdoptRenownSchema=z.object({eventId:Id,decisionFactId:Id,optionalRuleExplicitlyAdopted:z.literal(true)}).strict()
const Rank=z.object({rankId:Id,title:z.string().trim().min(1).max(120),minimumRenown:Points,minimumLevel:z.number().int().min(1).max(20).optional(),prerequisites:z.array(z.object({prerequisiteId:Id,description:Text}).strict()).max(16)}).strict()
export const RecordRenownOrganizationSchema=z.object({eventId:Id,organizationId:Id,name:z.string().trim().min(1).max(120),membershipFactId:Id,actualExistingMembershipConfirmed:z.literal(true),actualOrganizationDefinitionConfirmed:z.literal(true),ranks:z.array(Rank).max(32)}).strict()
export const AwardRenownSchema=z.object({eventId:Id,organizationId:Id,occurrenceFactId:Id,kind:z.enum(['interests','direct_mission_or_benefit']),actualCompletedAccomplishmentConfirmed:z.literal(true)}).strict()
export const LoseRenownSchema=z.object({eventId:Id,organizationId:Id,occurrenceFactId:Id,lossPoints:Points.refine(n=>n>0),actualSeriousOffenseConfirmed:z.literal(true),revokeHeldRank:z.boolean()}).strict()
export const SetRenownRankSchema=z.object({eventId:Id,organizationId:Id,decisionFactId:Id,operation:z.enum(['grant','revoke']),rankId:Id,actualOrganizationDecisionConfirmed:z.literal(true),prerequisiteFacts:z.array(z.object({prerequisiteId:Id,factId:Id,actualSatisfiedConfirmed:z.literal(true)}).strict()).max(16)}).strict()
const Source=z.object({book:z.literal('dmg-2014'),sectionId:z.string(),sha256:z.string(),startLine:z.number().int(),endLine:z.number().int()}).strict()
const Adoption=z.object({input:AdoptRenownSchema,decisionFact:Value,source:Source,at:Time,command:z.string().max(24000)}).strict()
const Organization=z.object({input:RecordRenownOrganizationSchema,membershipFact:Value,at:Time,adoptionCommand:z.string().max(24000),command:z.string().max(50000)}).strict()
export const RenownEventSchema=z.object({input:z.union([AwardRenownSchema,LoseRenownSchema,SetRenownRankSchema]),operation:z.enum(['award','loss','rank']),fact:Value,prerequisiteFacts:z.array(Value).max(16),levelAtDecision:z.number().int().min(1).max(20),at:Time,sequence:z.number().int().positive(),organizationCommand:z.string().max(50000),command:z.string().max(100000),scoreBefore:Points,scoreAfter:Points,rankBefore:Id.nullable(),rankAfter:Id.nullable()}).strict()
export const RenownStateSchema=z.object({version:z.literal(1),adoption:Adoption,organizations:z.record(z.string(),Organization),events:z.record(z.string(),RenownEventSchema)}).strict()
export type RenownState=z.infer<typeof RenownStateSchema>
export type RenownEvent=z.infer<typeof RenownEventSchema>
export const renownAdoptionCommand=(r:z.infer<typeof Adoption>)=>witness({operation:'adopt_renown',input:r.input,decisionFact:r.decisionFact,source:r.source,at:r.at})
export const renownOrganizationCommand=(r:z.infer<typeof Organization>)=>witness({operation:'record_renown_organization',input:r.input,membershipFact:r.membershipFact,at:r.at,adoptionCommand:r.adoptionCommand})
export const renownEventCommand=(r:RenownEvent)=>witness({operation:r.operation,input:r.input,fact:r.fact,prerequisiteFacts:r.prerequisiteFacts,levelAtDecision:r.levelAtDecision,at:r.at,sequence:r.sequence,organizationCommand:r.organizationCommand})
export function renownProjection(score:number,rank:string|null,event:Pick<RenownEvent,'operation'|'input'>){
 if(event.operation==='award'&&'kind'in event.input)score+=event.input.kind==='interests'?1:2
 else if(event.operation==='loss'&&'lossPoints'in event.input){score=Math.max(0,score-event.input.lossPoints);if(event.input.revokeHeldRank)rank=null}
 else if(event.operation==='rank'&&'operation'in event.input)rank=event.input.operation==='grant'?event.input.rankId:null
 return{score,rank}
}
export function renownSummary(state:GameState,organizationId:string){
 let value:{score:number;rank:string|null}={score:0,rank:null}
 for(const event of Object.values(state.dmTools?.renown?.events??{}).sort((a,b)=>a.sequence-b.sequence))if(event.input.organizationId===organizationId)value=renownProjection(value.score,value.rank,event)
 return value
}
export function renownRankIssue(organization:z.infer<typeof Organization>,event:RenownEvent,score:number,held:string|null):string|undefined{
 if(!('operation'in event.input))return 'Choose the explicit rank operation.'
 const input=event.input,rank=organization.input.ranks.find(r=>r.rankId===input.rankId)
 if(!rank)return 'The exact chosen rank must already exist in this organization definition.'
 if(input.operation==='revoke')return held!==input.rankId||input.prerequisiteFacts.length||event.prerequisiteFacts.length?'Revoke only the exact currently held rank, without fabricated prerequisite fulfillment.':undefined
 if(held===input.rankId)return 'This same rank is already actually held; no duplicate promotion.'
 if(score<rank.minimumRenown||event.levelAtDecision<(rank.minimumLevel??1))return 'The chosen rank requires its actual renown threshold and character level; no promotion is automatic.'
 const requested=input.prerequisiteFacts.map(p=>p.prerequisiteId)
 if(new Set(requested).size!==requested.length||requested.length!==rank.prerequisites.length||rank.prerequisites.some(p=>!requested.includes(p.prerequisiteId))||event.prerequisiteFacts.length!==requested.length||event.prerequisiteFacts.some((f,index)=>f.id!==input.prerequisiteFacts[index].factId))return 'Every actual additional rank prerequisite needs its exact explicit current fact; none is inferred or invented.'
}
export function validateRenownState(state:GameState){
 const data=state.dmTools?.renown;if(!data)return[]
 if(!RenownStateSchema.safeParse(data).success)return['Invalid optional member-only Renown registry, source command or event schema.']
 const issues:string[]=[],clock=state.worldTimeSeconds??0,adoption=data.adoption,ids=new Set<string>([adoption.input.eventId])
 if(Object.keys(data.organizations).length>64||Object.keys(data.events).length>1024)issues.push('Renown history limits exceeded; events are never silently removed.')
 if(adoption.command!==renownAdoptionCommand(adoption)||adoption.at>clock||adoption.decisionFact.id!==adoption.input.decisionFactId)issues.push('The first optional adoption retains its original canonical command, actual decision fact and source before any organization or award.')
 for(const[id,org]of Object.entries(data.organizations)){
  const ranks=org.input.ranks
  if(Object.values(data.organizations).some(other=>other!==org&&other.input.membershipFactId===org.input.membershipFactId))issues.push('One actual existing membership fact identifies one canonical member organization, never a new organization alias to reset or duplicate standing.')
  if(id!==org.input.organizationId||ids.has(org.input.eventId)||org.at<adoption.at||org.at>clock||org.membershipFact.id!==org.input.membershipFactId||org.adoptionCommand!==adoption.command||org.command!==renownOrganizationCommand(org)||new Set(ranks.map(r=>r.rankId)).size!==ranks.length||ranks.some(r=>new Set(r.prerequisites.map(p=>p.prerequisiteId)).size!==r.prerequisites.length))issues.push('An organization starts at zero with its real existing membership and exact original explicit rank definition; no threshold/title or organization can be rewritten at SQL.')
  ids.add(org.input.eventId)
 }
 const values:Record<string,{score:number;rank:string|null}>={},pointFacts=new Set<string>(),rankFacts=new Set<string>()
 const events=Object.entries(data.events).sort(([,a],[,b])=>a.sequence-b.sequence)
 for(let index=0;index<events.length;index++){
  const[id,event]=events[index],org=data.organizations[event.input.organizationId],before=values[event.input.organizationId]??={score:0,rank:null},input=event.input
  if(id!==input.eventId||ids.has(id)||event.sequence!==index+1||event.at>clock||!org||event.at<org.at||event.organizationCommand!==org?.command||event.command!==renownEventCommand(event)||event.scoreBefore!==before.score||event.rankBefore!==before.rank)issues.push('Each Renown decision keeps its exact first-stage command/provenance and chronological before state; new nonces do not create prior history.')
  ids.add(id)
  const factualId='decisionFactId'in input?input.decisionFactId:input.occurrenceFactId,key=witness([input.organizationId,factualId]),seen=event.operation==='rank'?rankFacts:pointFacts
  if(event.fact.id!==factualId||seen.has(key))issues.push('One organization uses one actual source occurrence only once for points and once for its distinct explicit rank decision, independent of call eventId.')
  seen.add(key)
  if(event.operation==='award'&&!('kind'in input)||event.operation==='loss'&&!('lossPoints'in input)||event.operation==='rank'&&!('operation'in input))issues.push('Retain the original award/loss/rank procedure, not a reclassified event.')
  if(event.operation!=='rank'&&event.prerequisiteFacts.length)issues.push('A points event cannot fabricate rank prerequisites.')
  if(event.operation==='rank'&&org){const issue=renownRankIssue(org,event,before.score,before.rank);if(issue)issues.push(issue)}
  const after=renownProjection(before.score,before.rank,event)
  if(after.score>1000000||event.scoreAfter!==after.score||event.rankAfter!==after.rank)issues.push('Renown and held rank derive only from exact retained +1/+2, chosen serious-offense losses with floor zero and explicit rank decisions.')
  values[input.organizationId]=after
 }
 return issues
}
