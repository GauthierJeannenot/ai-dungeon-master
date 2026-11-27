import { z } from 'zod'
import type { GameState } from './types'
import { groundGearPhysicalWitness as witness } from './ground-gear-recovery-state'
const Id=z.string().min(1).max(160).refine(id=>!['__proto__','prototype','constructor'].includes(id)),SourceId=z.string().min(1).max(1000),At=z.number().int().nonnegative(),Value=z.record(z.string(),z.unknown())
export const ADVENTURING_CYCLE_SOURCE='DMG2014:fa75462a6ef96ef0f86fbfd2d433c624ce926ff630a43d1fcaea6a2c1249b0d1:2971-3107,3538-3542;explicit-MJ-cycle-boundaries'
export const OpenAdventuringCycleSchema=z.object({eventId:Id,cycleId:Id,reason:z.string().trim().min(1).max(1000)}).strict()
export const QualifyCycleEncounterSchema=z.object({eventId:Id,cycleId:Id,encounterId:SourceId,factId:SourceId,
 presentNpcIds:z.array(Id).max(128),offSceneNpcIds:z.array(Id).max(128),actualPartyPresenceConfirmed:z.literal(true)}).strict()
export const RecordCycleEncounterSchema=z.object({eventId:Id,cycleId:Id,engagementId:SourceId,
 opponents:z.array(z.object({actorId:SourceId,countsForMultiplier:z.boolean()}).strict()).min(1).max(128),reason:z.string().trim().min(1).max(1000)}).strict()
export const CloseAdventuringCycleSchema=z.object({eventId:Id,cycleId:Id,reason:z.string().trim().min(1).max(1000),allowIncomplete:z.boolean().optional(),
 omittedEngagements:z.array(z.object({engagementId:SourceId,reason:z.string().trim().min(1).max(1000)}).strict()).max(128).optional()}).strict()
const Member=z.object({npcId:Id,registrationId:Id,role:z.enum(['civilian','ally']),scope:z.enum(['present','off_scene']),
 mapId:SourceId,roomId:SourceId,shareUnits:z.number().int().min(1).max(32),namedMemberIds:z.array(Id).min(1).max(32).optional(),
 survivingIdentitiesIndeterminate:z.boolean(),body:Value}).strict()
export type CyclePartyMember=z.infer<typeof Member>
const Open=z.object({input:OpenAdventuringCycleSchema,command:z.string(),at:At,mapId:SourceId,combatGeneration:z.number().int().nonnegative(),
 baselineEngagementIds:z.array(SourceId),baselineRestKeys:z.array(z.string()),resources:Value,witness:z.string()}).strict()
const Qualification=z.object({input:QualifyCycleEncounterSchema,command:z.string(),at:At,mapId:SourceId,roomId:SourceId,
 combatGeneration:z.number().int().nonnegative(),phase:z.enum(['exploration','combat']),sequence:z.number().int().nonnegative(),
 members:z.array(Member).max(128),deceasedNpcIds:z.array(Id).max(128),fact:Value,presenceWitness:z.string(),witness:z.string()}).strict()
export type CycleQualification=z.infer<typeof Qualification>
const Binding=z.object({cycleId:Id,qualificationId:Id,engagementId:SourceId,at:At,engagementWitness:z.string(),
 members:z.array(Member).max(128),player:Value,witness:z.string()}).strict()
const Entry=z.object({input:RecordCycleEncounterSchema,command:z.string(),at:At,closureId:SourceId,outcomeId:SourceId,
 engagementWitness:z.string(),closureWitness:z.string(),outcomeWitness:z.string(),assessment:Value,
 closurePlayer:Value,currentResources:Value,witness:z.string()}).strict()
const RestRef=z.object({key:z.string(),actorId:Id,restId:SourceId,kind:z.enum(['short','long']),completedAt:At,recordWitness:z.string()}).strict()
export type CycleRestReference=z.infer<typeof RestRef>
const Close=z.object({input:CloseAdventuringCycleSchema,command:z.string(),at:At,knownEngagementIds:z.array(SourceId),missingEngagementIds:z.array(SourceId),
 rests:z.array(RestRef),resources:Value,summary:Value,witness:z.string()}).strict()
export const AdventuringCycleStateSchema=z.object({version:z.literal(1),source:z.literal(ADVENTURING_CYCLE_SOURCE),activeCycleId:Id.optional(),
 cycles:z.record(z.string(),Open),qualifications:z.record(z.string(),Qualification),bindings:z.record(z.string(),Binding),entries:z.record(z.string(),Entry),closes:z.record(z.string(),Close)}).strict()
export type AdventuringCycleState=z.infer<typeof AdventuringCycleStateSchema>
export const cycleWitness=witness
export const cycleStateOf=(s:GameState)=>s.dmTools?.adventuringCycles
export function sealCycleRecord<T extends object>(value:T){return{...value,witness:witness(value)}}
function withoutWitness(value:{witness:string}){const{witness:_w,...rest}=value;return rest}
export const cycleMarkerKey=(kind:'open'|'qualification'|'binding'|'entry'|'close',id:string)=>'adventuring-cycle:'+kind+':'+encodeURIComponent(id)
export function cyclePresenceWitness(members:readonly CyclePartyMember[],deceasedNpcIds:readonly string[]){return witness({members:members.map(m=>({npcId:m.npcId,registrationId:m.registrationId,role:m.role,scope:m.scope,mapId:m.mapId,roomId:m.roomId,
 position:m.body.position,type:m.body.type,shareUnits:m.shareUnits,namedMemberIds:m.namedMemberIds,survivingIdentitiesIndeterminate:m.survivingIdentitiesIndeterminate})),deceasedNpcIds})}
export function latestCycleQualification(s:GameState,cycleId:string,encounterId:string){
 const data=cycleStateOf(s),latest=Object.values(data?.qualifications??{}).filter(q=>q.input.cycleId===cycleId&&q.input.encounterId===encounterId).sort((a,b)=>b.sequence-a.sequence)[0]
 return latest&&!Object.values(data?.bindings??{}).some(b=>b.qualificationId===latest.input.eventId)?latest:undefined
}
/** These immutable source keys describe actual existing rest receipts. No
 * duration, activity, benefit or post-close same-second completion is inferred. */
export function completedCycleRestReferences(s:GameState):CycleRestReference[]{
 const result:CycleRestReference[]=[]
 for(const[id,r]of Object.entries(s.dmTools?.rests?.receipts??{}))if(r.result.benefitsGranted===true)result.push({key:JSON.stringify(['player',id]),actorId:'player',restId:id,kind:r.session.kind,completedAt:r.completedAt,recordWitness:witness({restId:r.restId,definition:r.definition,completedAt:r.completedAt,result:r.result,session:r.session})})
 for(const[id,r]of Object.entries(s.dmTools?.npcRests?.records??{}))if(r.status==='completed')result.push({key:JSON.stringify([r.input.npcId,id]),actorId:r.input.npcId,restId:id,kind:'long',completedAt:r.endedAt!,recordWitness:witness(r)})
 return result.sort((a,b)=>a.key.localeCompare(b.key))
}
export function validateAdventuringCycles(s:GameState){
 const issues:string[]=[],d=cycleStateOf(s),markers=s.adventuringCycleEvents??{},expected=new Map<string,string>(),time=s.worldTimeSeconds??0
 const each=(kind:Parameters<typeof cycleMarkerKey>[0],records:Record<string,{witness:string}>)=>{for(const[id,r]of Object.entries(records)){const actual=witness(withoutWitness(r));expected.set(cycleMarkerKey(kind,id),actual);if(r.witness!==actual)issues.push('Retain the exact immutable cycle source event.')}}
 each('open',d?.cycles??{});each('qualification',d?.qualifications??{});each('binding',d?.bindings??{});each('entry',d?.entries??{});each('close',d?.closes??{})
 for(const[key,value]of expected)if(markers[key]!==value)issues.push('Each cycle event retains its reciprocal independent original marker.')
 for(const[key,value]of Object.entries(markers))if(expected.get(key)!==value)issues.push('A cycle marker cannot lose its original event or domain.')
 const unclosed=Object.keys(d?.cycles??{}).filter(id=>!Object.hasOwn(d?.closes??{},id))
 if(unclosed.length>1||d?.activeCycleId!==unclosed[0])issues.push('Exactly the one explicitly open cycle remains active until its explicit close.')
 for(const[id,o]of Object.entries(d?.cycles??{}))if(id!==o.input.cycleId||o.command!==witness(o.input)||o.at>time||o.resources.playerId!=='player')issues.push('A cycle opens now with its exact actual resource snapshot, never a fabricated earlier day.')
 const sequences=new Set<number>()
 for(const[id,q]of Object.entries(d?.qualifications??{})){
  const o=d?.cycles[q.input.cycleId]
  if(id!==q.input.eventId||q.command!==witness(q.input)||!o||q.at<o.at||q.at>time||sequences.has(q.sequence)||q.presenceWitness!==cyclePresenceWitness(q.members,q.deceasedNpcIds))issues.push('Retain the original prospective party qualification and its actual order/source.')
  sequences.add(q.sequence)
  if(witness(q.input.presentNpcIds.slice().sort())!==witness(q.members.filter(m=>m.scope==='present').map(m=>m.npcId).sort())||witness(q.input.offSceneNpcIds.slice().sort())!==witness(q.members.filter(m=>m.scope==='off_scene').map(m=>m.npcId).sort()))issues.push('A party qualification keeps its exact explicit present/off-scene partition.')
  for(const m of q.members){const r=s.dmTools?.npcParty?.registrations[m.registrationId]
   if(!r||r.input.npcId!==m.npcId||r.input.role!==m.role||r.at>q.at||r.endedAt!==undefined&&r.endedAt<q.at||m.body.id!==m.npcId||m.scope==='present'&&(m.mapId!==q.mapId||m.roomId!==q.roomId)||m.scope==='off_scene'&&m.mapId===q.mapId&&m.roomId===q.roomId)issues.push('The real party declaration and physically witnessed presence remain linked without civil exclusions.')
   const group=m.body.group as{remainingCount?:number;initialCount?:number;members?:{id:string}[]}|undefined
   if(group){if(m.shareUnits!==group.remainingCount||m.survivingIdentitiesIndeterminate!==(group.remainingCount!==group.initialCount)||m.survivingIdentitiesIndeterminate&&m.namedMemberIds!==undefined||!m.survivingIdentitiesIndeterminate&&witness(m.namedMemberIds)!==witness(group.members?.map(x=>x.id)))issues.push('Count actual group bodies and never invent named survivors after attrition.')}
   else if(m.shareUnits!==1||m.survivingIdentitiesIndeterminate||witness(m.namedMemberIds)!==witness([m.npcId]))issues.push('One real individual retains one full share unit.')
  }
 }
 const boundQualifications=new Set<string>()
 for(const[id,b]of Object.entries(d?.bindings??{})){
  const q=d?.qualifications[b.qualificationId],e=s.dmTools?.campaignOutcomes?.engagements[id],o=d?.cycles[b.cycleId]
  if(id!==b.engagementId||!q||!e||!o||q.input.cycleId!==b.cycleId||q.input.encounterId!==e.encounterId||e.origin!=='actual_start'||o.baselineEngagementIds.includes(id)||e.recordedAt<o.at||b.at!==e.recordedAt||e.witness!==b.engagementWitness||e.mapId!==q.mapId||e.roomId!==q.roomId||q.at>b.at||e.combatGeneration!==q.combatGeneration+(q.phase==='combat'?0:1)||boundQualifications.has(b.qualificationId)||cyclePresenceWitness(b.members,q.deceasedNpcIds)!==q.presenceWitness||b.player.id!=='player')issues.push('The exact real P1 start consumes only its own prior physical qualification, never a retrospective NPC enrollment.')
  boundQualifications.add(b.qualificationId)
 }
 const entries=new Set<string>()
 for(const[id,r]of Object.entries(d?.entries??{})){
  const b=d?.bindings[r.input.engagementId],o=b?d?.cycles[b.cycleId]:undefined,e=s.dmTools?.campaignOutcomes?.engagements[r.input.engagementId],c=s.dmTools?.campaignOutcomes?.closures[r.closureId],out=s.dmTools?.campaignOutcomes?.outcomes[r.outcomeId]
  if(id!==r.input.eventId||r.command!==witness(r.input)||!b||!o||!e||!c||!out||b.cycleId!==r.input.cycleId||c.engagementId!==e.id||out.closureId!==c.id||r.engagementWitness!==e.witness||r.closureWitness!==c.witness||r.outcomeWitness!==out.witness||r.at<out.at||r.at>time||entries.has(e.id)||r.assessment.xpAward!==null)issues.push('One exact actual closed P1 issue contributes once, without XP or progression.')
  if(d?.closes[r.input.cycleId]&&r.at>d.closes[r.input.cycleId].at)issues.push('An explicitly closed cycle receives no later event.')
  entries.add(r.input.engagementId)
 }
 const rests=completedCycleRestReferences(s)
 for(const[id,c]of Object.entries(d?.closes??{})){
  const o=d?.cycles[id],known=new Set(c.knownEngagementIds),recorded=new Set(Object.values(d?.entries??{}).filter(e=>e.input.cycleId===id).map(e=>e.input.engagementId)),missing=c.knownEngagementIds.filter(key=>!recorded.has(key))
  if(id!==c.input.cycleId||c.command!==witness(c.input)||!o||c.at<o.at||c.at>time||known.size!==c.knownEngagementIds.length||c.knownEngagementIds.some(key=>o.baselineEngagementIds.includes(key)||!s.dmTools?.campaignOutcomes?.engagements[key])||witness(missing.slice().sort())!==witness(c.missingEngagementIds.slice().sort())||witness((c.input.omittedEngagements??[]).map(x=>x.engagementId).sort())!==witness(c.missingEngagementIds.slice().sort())||missing.length&&!c.input.allowIncomplete||c.summary.xpAward!==null)issues.push('Only the explicit MJ close may retain an incomplete cycle with those exact missing IDs and reasons, never an invented outcome.')
  for(const r of c.rests)if(!o||o.baselineRestKeys.includes(r.key)||r.completedAt<o.at||r.completedAt>c.at||!rests.some(actual=>witness(actual)===witness(r)))issues.push('A cycle references only its original real completed rest, never new sleep or benefits.')
 }
 return [...new Set(issues)]
}
