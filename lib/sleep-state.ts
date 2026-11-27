import { isStatBackedNpc } from './npc-stat-blocks'
import { ARMOR_RULES } from './srd/equipment'
import { z } from 'zod'
import type { GameState,MonsterState,PlayerState } from './types'
import { nextSleepDeprivationBoundary } from './srd/xge-sleep'
const Id=z.string().min(1).max(180).refine(id=>!['constructor','prototype','__proto__'].includes(id))
const Event=z.string().min(1).max(80).regex(/^[a-zA-Z0-9][a-zA-Z0-9_:.-]*$/)
const At=z.number().int().nonnegative()
const Value=z.record(z.string(),z.unknown())
export const SleepPolicyInputSchema=z.object({eventId:Event,armorRecovery:z.boolean(),deprivation:z.boolean(),reason:z.string().trim().min(1).max(1000)}).strict()
export const SleepArmorSnapshotSchema=z.object({policyEventId:Event,adoptedAt:At,at:At,category:z.enum(['none','light','medium','heavy']),itemId:Id.optional(),equipmentId:Id.optional(),itemWitness:z.string().max(16000)}).strict()
export type SleepArmorSnapshot=z.infer<typeof SleepArmorSnapshotSchema>
export const NaturalSleepInputSchema=z.object({eventId:Event,entityId:Id,actualNaturalSleepConfirmed:z.literal(true),reason:z.string().trim().min(1).max(1000)}).strict()
export const SleepNoiseInputSchema=z.object({eventId:Event,sleeperIds:z.array(Id).min(1).max(32),originEntityId:Id,kind:z.enum(['whisper','normal_speech','sudden_loud']),factId:Id,actualAudibilityConfirmed:z.literal(true),otherwiseSilent:z.boolean().optional(),reason:z.string().trim().min(1).max(1000)}).strict().refine(v=>new Set(v.sleeperIds).size===v.sleeperIds.length,'Choose each actual sleeper once.')
export const SleepStateSchema=z.object({version:z.literal(1),
 policy:SleepPolicyInputSchema.extend({adoptedAt:At,command:z.string(),deprivationAnchorAt:At.optional(),resolvedPeriods:z.number().int().nonnegative(),lastResetRestId:Id.optional()}).optional(),
 episodes:z.record(z.string(),z.object({id:Event,entityId:Id,kind:z.literal('natural'),effectId:Id,mapId:Id,startedAt:At,status:z.enum(['sleeping','awakened','superseded']),endedAt:At.optional(),npcRest:z.object({restId:z.string().min(1).max(80),eventId:z.string().min(1).max(80)}).strict().optional(),wakeCause:z.enum(['damage','shake','noise','mental_alarm','chosen_interval_end','superseded_by_zero_hp']).optional(),reason:z.string().min(1).max(1000)}).strict()),
 deprivations:z.record(z.string(),z.object({id:Id,policyEventId:Event,periodIndex:z.number().int().positive(),anchorAt:At,at:At,dc:z.number().int().min(10),status:z.enum(['pending','resolved']),result:Value.optional()}).strict()),
 receipts:z.record(z.string(),z.object({command:z.string().max(100000),result:Value}).strict()),
}).strict().superRefine((v,ctx)=>{
 if(Object.keys(v.episodes).length>512||Object.keys(v.deprivations).length>1024||Object.keys(v.receipts).length>2048)ctx.addIssue({code:'custom',message:'Actual natural sleep, policy and deprivation receipts are bounded and never evicted.'})
 if(v.policy?.deprivation!==Boolean(v.policy?.deprivationAnchorAt!==undefined)&&v.policy)ctx.addIssue({code:'custom',message:'Only the explicitly enabled option retains a real present-day deprivation anchor.'})
 const targets=new Set<string>();for(const[id,e]of Object.entries(v.episodes)){
  if(id!==e.id||(e.status!=='sleeping')!==(e.endedAt!==undefined&&e.wakeCause!==undefined))ctx.addIssue({code:'custom',message:'Each original natural sleep episode retains its own immutable start and wake cause.'})
  if(e.status==='sleeping'){if(targets.has(e.entityId))ctx.addIssue({code:'custom',message:'One body has only one actual active natural sleep source.'});targets.add(e.entityId)}
 }
})
export type SleepState=z.infer<typeof SleepStateSchema>
export type SleepPolicyInput=z.infer<typeof SleepPolicyInputSchema>
export type NaturalSleepInput=z.infer<typeof NaturalSleepInputSchema>
export type SleepNoiseInput=z.infer<typeof SleepNoiseInputSchema>
export const initialSleepState=():SleepState=>({version:1,episodes:{},deprivations:{},receipts:{}})
export const sleepStateOf=(state:Pick<GameState,'dmTools'>)=>(state.dmTools as{sleep?:SleepState}|undefined)?.sleep
export const naturalSleepEpisode=(state:Pick<GameState,'dmTools'>,id:string)=>Object.values(sleepStateOf(state)?.episodes??{}).find(e=>e.entityId===id&&e.status==='sleeping')
export function sleepBody(state:GameState,id:string,archived=false):PlayerState|MonsterState|undefined{
 if(id==='player')return state.player
 const npc=state.npcs?.[id],active=state.monsters[id]??(isStatBackedNpc(npc)&&npc.visible&&(npc.mapId??state.currentMapId)===state.currentMapId?npc:undefined);if(active||!archived)return active
 return(state.sceneMemory?.retiredMonsters as Record<string,MonsterState>|undefined)?.[id]??Object.entries((state.sceneMemory?.floorMonsters??{})as Record<string,Record<string,MonsterState>>).filter(([map])=>map!==state.currentMapId).map(([,actors])=>actors[id]).find(Boolean)
}
export function dueSleepDeprivation(state:GameState){
 const data=sleepStateOf(state),p=data?.policy;if(!p?.deprivation||p.deprivationAnchorAt===undefined||state.player.deathSaves?.dead)return undefined
 const boundary=nextSleepDeprivationBoundary({enabled:true,anchorAt:p.deprivationAnchorAt,resolvedPeriods:p.resolvedPeriods})!
 return{...boundary,id:`sleep-deprivation:${p.eventId}:${p.deprivationAnchorAt}:${boundary.periodIndex}`,policyEventId:p.eventId,entityId:'player' as const,due:(state.worldTimeSeconds??0)>=boundary.at}
}
export function sleepDueIssue(state:GameState){const due=dueSleepDeprivation(state);return due?.due?{code:'SLEEP_DEPRIVATION_DUE',message:'Resolve the explicitly adopted actual deprivation event, or complete an already eligible real long rest at this same boundary. No optional save is invented or bypassed.',eventId:due.id}:null}
export function validateSleepState(state:GameState){
 const data=sleepStateOf(state);if(!data)return[];if(!SleepStateSchema.safeParse(data).success)return['Invalid actual sleep and explicit optional-rule state.']
 const issues:string[]=[],at=state.worldTimeSeconds??0,p=data.policy
 if(p&&(p.adoptedAt>at||p.deprivationAnchorAt!==undefined&&p.deprivationAnchorAt<p.adoptedAt||!data.receipts[p.eventId]))issues.push('A sleep policy requires its original explicit present adoption and immutable receipt, never retroactive optional rules.')
 if(p){
  const receipt=data.receipts[p.eventId],adopted=receipt?.result.policy as{adoptedAt?:number}|undefined
  const canonical=JSON.stringify({kind:'sleep-policy',input:{eventId:p.eventId,armorRecovery:p.armorRecovery,deprivation:p.deprivation,reason:p.reason}})
  if(receipt?.command!==p.command||p.command!==canonical||adopted?.adoptedAt!==p.adoptedAt)issues.push('The sleep policy fields and present adoption must match their exact original structured command and receipt.')
  const resolved=Object.values(data.deprivations).filter(e=>e.policyEventId===p.eventId&&e.anchorAt===p.deprivationAnchorAt&&e.status==='resolved').sort((a,b)=>a.periodIndex-b.periodIndex)
  if(p.resolvedPeriods!==resolved.length||resolved.some((e,i)=>e.periodIndex!==i+1)||!p.deprivation&&p.resolvedPeriods!==0)issues.push('The deprivation counter must match every actual continuously resolved period of the current real anchor; no nonce or restored counter defers a due event.')
  if(p.deprivationAnchorAt!==undefined&&p.deprivationAnchorAt>p.adoptedAt){const completed=p.lastResetRestId&&state.dmTools?.rests?.receipts[p.lastResetRestId];if(!completed||completed.session.kind!=='long'||completed.completedAt!==p.deprivationAnchorAt)issues.push('A deprivation reset requires the exact actually completed long-rest receipt, never a new nonce or invented day.')}
 }
 for(const period of [state.dmTools?.rests?.active,...Object.values(state.dmTools?.rests?.receipts??{}).map(r=>r.session)]){
  if(!period)continue
  for(const segment of period.segments){
   const observed=segment.sleepArmor
   if(!observed){if(p?.armorRecovery&&segment.activity==='sleep'&&segment.from>=p.adoptedAt)issues.push('An adopted armor rule needs its actual before-interval worn-armor witness; final equipment cannot replace it.');continue}
   if(!p?.armorRecovery||observed.policyEventId!==p.eventId||observed.adoptedAt!==p.adoptedAt||observed.at!==segment.from||segment.from<p.adoptedAt||segment.activity!=='sleep')issues.push('An optional armor sleep witness requires the original explicit policy before that actual sleep segment.')
   try{const item=JSON.parse(observed.itemWitness) as{id?:string;equipmentId?:string}|null,reference=item?.equipmentId??item?.id;if(observed.category==='none'?item!==null||observed.itemId!==undefined:!item||item.id!==observed.itemId||reference!==observed.equipmentId||ARMOR_RULES[reference!]?.category!==observed.category)issues.push('The original worn source armor and actual category must remain unchanged in the recorded sleep witness.')}catch{issues.push('The retained armor witness must remain its original actual source item.')}
  }
 }
 for(const e of Object.values(data.episodes)){
  if(e.startedAt>at||e.endedAt!==undefined&&(e.endedAt<e.startedAt||e.endedAt>at))issues.push('Natural sleep keeps its actual clock without fabricated past time.')
  if(e.status!=='sleeping')continue
  const body=sleepBody(state,e.entityId,true),effect=state.monsterEffects?.find(x=>x.id===e.effectId)
  if(!body||body.hp.current<=0||!body.conditions.includes('unconscious')||!effect||effect.kind!=='natural-sleep'||effect.sourceId!==e.entityId||effect.targetId!==e.entityId||!effect.conditions.includes('unconscious'))issues.push('An actual sleeping body requires its own real natural source, not zero HP, poison or a magical substitute.')
 }
 for(const[id,event]of Object.entries(data.deprivations)){
  if(id!==event.id||id!==`sleep-deprivation:${event.policyEventId}:${event.anchorAt}:${event.periodIndex}`||!p||event.policyEventId!==p.eventId||event.dc!==10+5*(event.periodIndex-1)||event.at!==event.anchorAt+event.periodIndex*86400||event.at>at||event.status==='resolved'&&!event.result)issues.push('A deprivation result retains its exact explicitly adopted source period, original DC and receipt.')
  if(event.status==='pending'){if(event.anchorAt!==p?.deprivationAnchorAt||event.periodIndex!==p.resolvedPeriods+1)issues.push('A pending deprivation save keeps the original actual current period.');const r=state.hero?.pending?.command.toolkitResolution as{domain?:string;command?:{eventId?:string}}|undefined;if(r?.domain!=='sleep-deprivation-save'||r.command?.eventId!==id)issues.push('A pending deprivation save retains its actual original CON and Inspiration continuation.')}
 }
 return issues
}
