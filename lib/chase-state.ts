import { RestSessionSchema } from './rest-state'
import { chaseExcessDashCount, WILDERNESS_CHASE_SOURCE } from './chase-source'
import { z } from 'zod'
import type { GameState } from './types'

const Id=z.string().min(1).max(100).regex(/^[a-zA-Z0-9][a-zA-Z0-9_:.-]*$/).refine(v=>!['__proto__','prototype','constructor'].includes(v),'Reserved identifier.')
const Cell=z.object({x:z.number().int().nonnegative(),y:z.number().int().nonnegative()}).strict()
const Value=z.record(z.string(),z.unknown())
export const QualifyChaseGuardSchema=z.object({eventId:Id,entityId:Id,roleFactId:Id,spearFactId:Id,spearInstanceId:Id,actualSpearHeld:z.literal(true)}).strict()
export const BeginChaseSchema=z.object({eventId:Id,chaseId:Id,quarryId:Id,pursuerIds:z.array(Id).min(1).max(12),table:z.enum(['urban','wilderness']),guardIds:z.array(Id).max(12).default([]),reason:z.string().trim().min(1).max(1000),tieOrder:z.array(Id).max(24).optional()}).strict()
export const ChaseDashSchema=z.object({eventId:Id,chaseId:Id,actorId:Id}).strict()
export const ChaseTurnSchema=z.object({eventId:Id,chaseId:Id}).strict()
export const QualifyChaseComplicationSchema=z.object({eventId:Id,chaseId:Id,turnEventId:Id,factId:Id,path:z.array(Cell).min(1).max(128),guardId:Id.optional(),barrier:z.object({objectId:Id,name:z.string().trim().min(1).max(80),description:z.string().trim().min(1).max(600),cell:Cell,size:z.enum(['small','medium','large']),transparent:z.boolean()}).strict().optional(),choice:z.enum(['athletics','acrobatics','int','intimidation']).optional(),coin:z.enum(['cp','sp','ep','gp','pp']).optional(),inspirationHolderId:z.literal('player').optional(),wilderness:z.object({kind:z.enum(['brush','uneven-ground','stream','ravine','rock-bed','blowing-particles','stampede']),actualPhysicalEventConfirmed:z.literal(true)}).strict().optional()}).strict()
export const ResolveChaseComplicationSchema=z.object({eventId:Id,chaseId:Id,turnEventId:Id,choice:z.enum(['resolve','negate']),inspirationHolderId:z.literal('player').optional()}).strict()
export const ResolveChaseEscapeSchema=z.object({eventId:Id,chaseId:Id,leaderId:Id,sightFactId:Id,continuousSight:z.boolean(),hide:z.enum(['many','few','normal']),area:z.enum(['crowded_noisy','quiet_uncrowded','normal']),senseByPursuer:z.record(Id,z.enum(['sight','hearing','other']))}).strict()
export const StopChaseSchema=z.object({eventId:Id,chaseId:Id,participantIds:z.array(Id).min(1).max(13),reason:z.string().trim().min(1).max(1000)}).strict()
const Participant=z.object({id:Id,role:z.enum(['quarry','pursuer']),status:z.enum(['active','stopped','escaped','exhausted','incapable']),dashIds:z.array(Id),initialConstitution:z.number().int().min(1).max(30)}).strict()
const Turn=z.object({id:Id,key:z.string(),actorId:Id,round:z.number().int().positive(),turnCounter:z.number().int().nonnegative(),dashIds:z.array(Id),constitutionAtEnd:z.number().int().min(1).max(30),checksDue:z.number().int().nonnegative(),checks:z.array(Value),status:z.enum(['checks','table','qualification','consequence','complete']),d20:z.number().int().min(1).max(20).optional(),tableRoll:Value.optional(),nextParticipantId:Id.optional(),qualification:QualifyChaseComplicationSchema.optional(),qualificationWitness:Value.optional(),consequence:Value.optional(),consequenceWitness:z.string().optional(),heldCheckWitness:z.string().optional(),heldBodiesWitness:z.string().optional(),guardHeldWitness:z.string().optional(),effectUntilTurnKey:z.string().optional(),movedFeet:z.number().nonnegative().optional(),guardTriggered:z.boolean().optional(),guardCompleted:z.boolean().optional(),effectExpired:z.boolean().optional(),guardResult:Value.optional(),guardChoice:Value.optional(),guardAttackInput:Value.optional(),result:Value.optional()}).strict()
const Receipt=z.object({command:z.string(),result:Value,at:z.number().nonnegative()}).strict()
const Episode=z.object({id:Id,input:BeginChaseSchema,command:z.string(),at:z.number().nonnegative(),mapId:Id,combatGeneration:z.number().int().nonnegative(),firstEscapeRound:z.number().int().positive(),status:z.enum(['active','ended']),participants:z.record(Id,Participant),turns:z.record(Id,Turn),escapes:z.record(z.string(),Value),newInitiatives:z.array(Value),initialDistances:z.record(Id,z.number().nonnegative()),tableSource:Value.optional(),endedReason:z.string().optional()}).strict()
export const ChaseStateSchema=z.object({activeId:Id.optional(),episodes:z.record(Id,Episode),receipts:z.record(Id,Receipt),fatigue:z.record(Id,z.object({levels:z.number().int().min(0).max(6),additions:z.array(z.string()),removals:z.array(z.string())}).strict()),guardRoles:z.record(Id,z.object({input:QualifyChaseGuardSchema,command:z.string(),roleFact:Value,spearFact:Value,at:z.number().nonnegative()}).strict()),restRulings:z.record(Id,z.object({input:z.object({eventId:Id,restId:Id,choice:z.enum(['chase_recovery_applies','armor_prevents_chase_recovery']),reason:z.string().trim().min(1).max(1000)}).strict(),command:z.string(),periodWitness:z.string(),periodSnapshot:RestSessionSchema,at:z.number().nonnegative()}).strict())}).strict()
export type ChaseState=z.infer<typeof ChaseStateSchema>
export type ChaseEpisode=z.infer<typeof Episode>
export type ChaseTurn=z.infer<typeof Turn>
export type ChaseParticipant=z.infer<typeof Participant>
export type BeginChaseInput=z.infer<typeof BeginChaseSchema>
export const chaseWitness=(value:unknown)=>JSON.stringify(value,(_key,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(key=>[key,v[key]])):v)
export const chaseStateOf=(state:GameState):ChaseState|undefined=>(state.dmTools as {chases?:ChaseState}|undefined)?.chases
export const activeChase=(state:GameState)=>{const data=chaseStateOf(state);return data?.activeId?data.episodes[data.activeId]:undefined}
export const chaseTurnKey=(state:GameState)=>`${state.combatGeneration??0}:${state.turnCounter??0}:${state.round}:${state.currentTurn??''}`
export function chaseParticipant(state:GameState,id:string){const p=activeChase(state)?.participants[id];const body=id==='player'?state.player:state.monsters[id]??state.npcs?.[id];return p?.status==='active'&&body&&body.hp.current>0&&(state.dmTools?.exhaustion?.creatures[id]?.level??0)<5?p:undefined}
export function sameChaseParticipants(state:GameState,one:string,two:string){return Boolean(one!==two&&chaseParticipant(state,one)&&chaseParticipant(state,two))}
export function chaseFatigue(state:GameState,id:string){return chaseStateOf(state)?.fatigue[id]?.levels??0}
export function currentChaseDashCount(state:GameState,id:string){const data=chaseStateOf(state);if(!data)return 0;const key=chaseTurnKey(state);return Object.values(data.episodes).reduce((n,e)=>n+(e.participants[id]?.dashIds.filter(event=>data.receipts[event]?.result.turnKey===key).length??0),0)}
export function dashMovementMultiplier(state:GameState,id:string){const legacy=state.hero?.effects.some(e=>e.kind==='dash'&&e.targetIds.includes(id)&&e.expiresAt>(state.worldTimeSeconds??0))?2:1;return Math.max(legacy,1+currentChaseDashCount(state,id))}
export function chaseTerrainDifficult(state:GameState,id:string,cell:{x:number;y:number}){return Object.values(chaseStateOf(state)?.episodes??{}).some(e=>Object.values(e.turns).some(t=>!t.effectExpired&&t.nextParticipantId===id&&t.consequence?.difficultTerrain&&((t.consequence.difficultTerrain as {cells?:{x:number;y:number}[]}).cells??[]).some(c=>c.x===cell.x&&c.y===cell.y)))}
export function expireChaseTurnEffects(state:GameState,id:string){for(const e of Object.values(chaseStateOf(state)?.episodes??{}))for(const t of Object.values(e.turns))if(t.nextParticipantId===id&&t.status==='complete')t.effectExpired=true}
export function activeChaseGuard(state:GameState,id?:string){for(const e of Object.values(chaseStateOf(state)?.episodes??{}))for(const t of Object.values(e.turns))if(!t.effectExpired&&e.input.table==='urban'&&t.d20===9&&t.status==='complete'&&!t.guardCompleted&&t.qualification&&(id===undefined||t.nextParticipantId===id))return {e,t};return undefined}

export function validateChaseState(state:GameState){
 const data=chaseStateOf(state);if(!data)return[]
 const parsed=ChaseStateSchema.safeParse(data);if(!parsed.success)return['Invalid chase episode/cursor/source-fatigue schema.']
 const issues:string[]=[...validateChaseHeldWindow(state)]
 if(data.activeId&&data.episodes[data.activeId]?.status!=='active')issues.push('The active chase id must retain its actual active episode.')
 for(const[id,e]of Object.entries(data.episodes)){
  if(id!==e.id||e.id!==e.input.chaseId||e.command!==chaseWitness(e.input)||!data.receipts[e.input.eventId]||data.receipts[e.input.eventId].command!==chaseWitness({operation:'begin-chase',input:e.input}))issues.push('A chase requires its exact original structured adoption/input and receipt.')
  if(e.input.table==='wilderness'&&(!e.tableSource||e.tableSource.book!==WILDERNESS_CHASE_SOURCE.book||e.tableSource.sha256!==WILDERNESS_CHASE_SOURCE.sha256||e.tableSource.startLine!==WILDERNESS_CHASE_SOURCE.startLine||e.tableSource.endLine!==WILDERNESS_CHASE_SOURCE.endLine||chaseWitness(e.tableSource)!==chaseWitness(data.receipts[e.input.eventId]?.result.tableSource)))issues.push('The wilderness table retains its exact supplied DMG section, lines, SHA and original adoption receipt.')
  const ids=[e.input.quarryId,...e.input.pursuerIds]
  if(new Set(ids).size!==ids.length||Object.keys(e.participants).length!==ids.length||ids.some(id=>!e.participants[id]||e.participants[id].id!==id||e.participants[id].role!==(id===e.input.quarryId?'quarry':'pursuer')))issues.push('The chase roster/roles are the exact explicitly enrolled existing bodies.')
  if(e.status==='active'&&(data.activeId!==e.id||state.phase!=='combat'||state.currentMapId!==e.mapId||(state.combatGeneration??0)!==e.combatGeneration||ids.some(id=>id!=='player'&&!state.monsters[id])))issues.push('An active chase belongs to its actual current map/encounter and existing roster.')
  for(const p of Object.values(e.participants)){
   if(new Set(p.dashIds).size!==p.dashIds.length||p.dashIds.some(id=>{const receipt=data.receipts[id];return!receipt||receipt.result.operation!=='chase-dash'||receipt.result.chaseId!==e.id||receipt.result.actorId!==p.id}))issues.push('Dash counts require their unique actual source action/effect receipts.')
  }
  for(const[id,t]of Object.entries(e.turns)){
   if(t.id!==id||!e.participants[t.actorId]||t.key!==`${e.combatGeneration}:${t.turnCounter}:${t.round}:${t.actorId}`||t.dashIds.some(id=>!e.participants[t.actorId].dashIds.includes(id)))issues.push('An end-turn cursor retains its exact actor/round/dash sources.')
   const actualDashIds=e.participants[t.actorId]?.dashIds.filter(event=>data.receipts[event]?.result.turnKey===t.key)??[],prior=e.participants[t.actorId]?.dashIds.filter(event=>Number(data.receipts[event]?.result.turnCounter)<t.turnCounter).length??0
   if(chaseWitness(actualDashIds)!==chaseWitness(t.dashIds)||t.checksDue!==chaseExcessDashCount(prior,actualDashIds.length,Math.floor((t.constitutionAtEnd-10)/2))||t.checks.length>t.checksDue)issues.push('End-turn check debt is derived only from each actually witnessed excess Dash, never a forged period/counter or negative-threshold phantom check.')
   if(t.d20!==undefined&&(t.tableRoll?.total!==t.d20||t.tableRoll?.notation!=='1d20'||chaseWitness(t.tableRoll?.rolls)!==chaseWitness([t.d20])||t.tableRoll?.modifier!==0)||t.d20!==undefined&&t.d20<=10&&!t.nextParticipantId)issues.push('A complication uses its one retained table die and explicitly next enrolled actor.')
   if(e.input.table==='wilderness'){
    if(t.status==='complete'&&t.consequenceWitness!==chaseWitness(t.consequence??null))issues.push('The wilderness consequence keeps its original exact check, terrain, damage and blinded-provider receipt.')
    if(t.qualification&&(!t.qualification.wilderness||t.qualification.guardId||t.qualification.coin||t.qualification.barrier))issues.push('A wilderness qualification preserves its explicit printed physical event and no urban-only producer.')
    const effect=t.consequence?.blindedEffectId?state.hero?.effects.find(effect=>effect.id===t.consequence!.blindedEffectId):undefined
    const affected=t.nextParticipantId==='player'?state.player:state.monsters[t.nextParticipantId??'']??state.npcs?.[t.nextParticipantId??''],actuallyAlive=affected&&(t.nextParticipantId==='player'?!state.player.deathSaves?.dead:'isAlive'in affected&&affected.isAlive!==false)
    if(t.consequence?.blindedEffectId&&actuallyAlive&&(!t.effectExpired&&!effect||t.effectExpired&&effect))issues.push('The exact wilderness blindness provider survives until its real affected end-turn, neither erased early nor retained afterward.')
    if(effect&&(t.d20!==5||effect.kind!=='chase-wilderness-blind'||effect.targetIds.length!==1||effect.targetIds[0]!==t.nextParticipantId||effect.data.untilEndOf!==t.nextParticipantId||effect.data.turnEventId!==t.id||effect.data.chaseId!==e.id))issues.push('Wilderness blindness retains only its actual failed row5 source and exact end-of-turn condition provider.')
   }
   if(t.qualification&&t.qualification.turnEventId!==t.id)issues.push('A qualification belongs to its original retained complication.')
  }
 }
 for(const[id,f]of Object.entries(data.fatigue)){
  const receipts=state.dmTools?.exhaustion?.receipts??{},added=f.additions.reduce((n,key)=>{const r=receipts[key];if(!r||r.targetId!==id||r.operation!=='add'||!(r as unknown as {chaseSourceId?:string}).chaseSourceId)issues.push('Chase fatigue needs actual canonically attributed exhaustion-add receipts.');return n+(r?r.afterLevel-r.beforeLevel:0)},0),removed=f.removals.reduce((n,key)=>{const r=receipts[key];if(!r||r.targetId!==id||r.operation==='add'||(r as unknown as {removalSource?:string}).removalSource!=='chase')issues.push('Only explicit actual chase-source removal receipts reduce chase fatigue.');return n+(r?r.beforeLevel-r.afterLevel:0)},0)
  if(new Set([...f.additions,...f.removals]).size!==f.additions.length+f.removals.length||added-removed!==f.levels||f.levels>(state.dmTools?.exhaustion?.creatures[id]?.level??0))issues.push('The retained fatigue counter equals its unique real source receipts, never greater than actual total exhaustion.')
 }
 for(const[id,role]of Object.entries(data.guardRoles)){
  if(role.input.entityId!==id||role.command!==chaseWitness(role.input)||data.receipts[role.input.eventId]?.command!==chaseWitness({operation:'qualify-chase-guard',input:role.input})||role.roleFact.id!==role.input.roleFactId||role.spearFact.id!==role.input.spearFactId)issues.push('The DMG-only guard role and exact spear custody require their original explicit structured pre-entry qualification and actual source facts.')
  if(state.player.inventory.some(i=>i.id===role.input.spearInstanceId)||state.droppedItems?.[role.input.spearInstanceId]||Object.values(state.dmTools?.merchants?.stocks??{}).some(stock=>stock.item.id===role.input.spearInstanceId))issues.push('A DMG chase-only spear custody observation cannot duplicate inventory, ground or merchant stock.')
 }
 if(new Set(Object.values(data.guardRoles).map(r=>r.input.spearInstanceId)).size!==Object.keys(data.guardRoles).length)issues.push('One exact actual spear custody instance belongs to only one qualified guard body.')
 for(const[restId,ruling]of Object.entries(data.restRulings)){
  const session=state.dmTools?.rests?.active?.restId===restId?state.dmTools.rests.active:state.dmTools?.rests?.receipts[restId]?.session
  const snapshot=ruling.periodSnapshot,receipt=data.receipts[ruling.input.eventId];const prefix=session&&snapshot.restId===session.restId&&snapshot.kind===session.kind&&snapshot.startedAt===session.startedAt&&snapshot.hpAtStart===session.hpAtStart&&snapshot.creditedUntil<=session.creditedUntil&&snapshot.segments.every((segment,index)=>chaseWitness(segment)===chaseWitness(session.segments[index]));if(restId!==ruling.input.restId||ruling.command!==chaseWitness(ruling.input)||!prefix||ruling.periodWitness!==chaseWitness(snapshot)||receipt?.command!==chaseWitness({operation:'adjudicate-chase-rest',input:ruling.input})||chaseWitness(receipt?.result.periodSnapshot)!==chaseWitness(snapshot)||chaseWitness(receipt?.result.input)!==chaseWitness(ruling.input))issues.push('The source conflict ruling belongs to the exact actual unchanged eligible rest period and original structured command, never a global policy or retroactive armor rewrite.')
 }
 return issues
}
export function chaseTransitionIssue(state:GameState){
 if(activeChase(state))return{code:'CHASE_ACTIVE',message:'Explicitly resolve or stop the actual current chase before ending this encounter or changing map; no pursuit or fatigue is silently erased.'}
 if(state.hero?.effects.some(effect=>effect.kind==='chase-wilderness-blind'&&effect.targetIds.some(id=>{const body=id==='player'?state.player:state.monsters[id];return body&&(id==='player'?!state.player.deathSaves?.dead:'isAlive'in body&&body.isAlive!==false)})))return{code:'CHASE_EFFECT_END_TURN_REQUIRED',message:'Complete the affected body actual turn before leaving initiative/map; the retained wilderness blindness has an end-of-turn boundary, not an invented outside-combat duration.'}
 return null
}
export function chaseWildernessSpeedMultiplier(state:GameState,id:string){
 const body=id==='player'?state.player:state.monsters[id]??state.npcs?.[id]
 return body?.conditions.includes('blinded')&&state.hero?.effects.some(effect=>effect.kind==='chase-wilderness-blind'&&effect.targetIds.includes(id))?0.5:1
}
/** A living body's retained dust end-turn is passive, including stable zero HP. */
export function chaseRequiresInitiativeTurn(state:GameState,id:string){
 const alive=id==='player'?!state.player.deathSaves?.dead:Boolean(state.monsters[id]?.isAlive)
 return alive&&Boolean(state.hero?.effects.some(effect=>effect.kind==='chase-wilderness-blind'&&effect.targetIds.includes(id)))
}
export function chaseTurnIssue(state:GameState){
 const e=activeChase(state);if(!e||!state.currentTurn)return null
 const guard=activeChaseGuard(state);if(guard?.t.guardTriggered)return{code:'CHASE_GUARD_ATTACK_DUE',message:'Resolve the exact source guard opportunity after actual20ft movement; no next action or turn skips it.',chaseId:guard.e.id,eventId:guard.t.id}
 const pending=Object.values(e.turns).find(t=>!['complete'].includes(t.status));if(pending)return{code:'CHASE_EVENT_DUE',message:'Resolve the exact retained chase end-turn/complication cursor before advancing.',eventId:pending.id,chaseId:e.id}
 if(chaseParticipant(state,state.currentTurn)&&!Object.values(e.turns).some(t=>t.key===chaseTurnKey(state)&&t.status==='complete'))return{code:'CHASE_END_TURN_DUE',message:'Explicitly choose this actual end-of-turn chase event: every excess Dash CON check, then its one complication d20.',chaseId:e.id,actorId:state.currentTurn,turnKey:chaseTurnKey(state)}
 const index=state.initiativeOrder.indexOf(state.currentTurn),nextAlive=state.initiativeOrder.slice(index+1).some(id=>id==='player'?!state.player.deathSaves?.dead:Boolean(state.monsters[id]?.isAlive))
 if(!nextAlive&&state.round>=e.firstEscapeRound&&!e.escapes[String(state.round)]&&Object.values(e.participants).filter(p=>p.status==='active').every(p=>Object.values(e.turns).some(t=>t.actorId===p.id&&t.round===state.round&&t.status==='complete')))return{code:'CHASE_ESCAPE_DUE',message:'At the real round boundary after every enrolled turn, explicitly qualify leader/sight/factors and resolve the retained quarry Stealth check.',chaseId:e.id,round:state.round}
 return null
}

export function chaseActionIssue(state:GameState){
 const e=activeChase(state);if(!e)return null
 const due=activeChaseGuard(state);if(due?.t.guardTriggered)return{code:'CHASE_GUARD_ATTACK_DUE',message:'Resolve the exact actually triggered guard reaction before another action or route.'}
 const ending=Object.values(e.turns).find(t=>t.key===chaseTurnKey(state));return ending?{code:'CHASE_TURN_ENDING',message:'The explicit source end-turn event was already chosen; resolve its retained cursor and choose next_turn, without later action/movement.'}:null
}
export function protectedChaseFactIds(state:GameState){const ids:string[]=[];for(const e of Object.values(chaseStateOf(state)?.episodes??{}))for(const t of Object.values(e.turns))if(t.status==='consequence'&&t.qualification)ids.push(t.qualification.factId);return ids}

type Pending=NonNullable<NonNullable<GameState['hero']>['pending']>
function heldChaseTurn(state:GameState,pending:Pending){
 const resolution=pending.command.toolkitResolution as {domain?:string;command?:Record<string,unknown>}|undefined
 const guard=pending.command.chaseGuardContext as {chaseId?:string;turnEventId?:string}|undefined
 const command=resolution?.domain==='chase'?resolution.command:guard
 if(!command)return undefined
 const e=chaseStateOf(state)?.episodes[String(command.chaseId)],t=e?.turns[String(command.turnEventId)]
 return{e,t,guard:Boolean(guard)}
}
function chaseHeldBodies(state:GameState,pending:Pending){const body=(id:string|undefined)=>id==='player'?state.player:id?state.monsters[id]??state.npcs?.[id]:undefined;return chaseWitness({source:body(pending.sourceId),target:body(pending.targetId)})}
export function recordChaseHeldWindow(state:GameState,pending:Pending){const source=heldChaseTurn(state,pending);if(source?.t){source.t.heldBodiesWitness=chaseHeldBodies(state,pending);if(source.guard)source.t.guardHeldWitness=chaseWitness(pending);else source.t.heldCheckWitness=chaseWitness(pending)}}
export function validateChaseHeldWindow(state:GameState){
 const pending=state.hero?.pending;if(!pending)return[]
 const source=heldChaseTurn(state,pending);if(!source)return[]
 const witness=source.guard?source.t?.guardHeldWitness:source.t?.heldCheckWitness
 return !source.e||!source.t||witness!==chaseWitness(pending)||source.t.heldBodiesWitness!==chaseHeldBodies(state,pending)?['The held chase die/options/source command must equal its original retained engine window, never a reconstructed or edited roll.']:[]
}

export function pendingChaseDashChecks(state:GameState,id:string,additional=0){
 const e=activeChase(state),p=e?.participants[id];if(!e||!p)return 0
 const key=chaseTurnKey(state),current=p.dashIds.filter(event=>chaseStateOf(state)?.receipts[event]?.result.turnKey===key),prior=p.dashIds.length-current.length,body=id==='player'?state.player:state.monsters[id]
 const t=Object.values(e.turns).find(t=>t.key===key&&t.actorId===id)
 return t?Math.max(0,t.checksDue-t.checks.length):chaseExcessDashCount(prior,current.length+additional,Math.floor(((body?.stats.con??10)-10)/2))
}
export function chaseDashAdmissionIssue(state:GameState,id:string){
 if(!activeChase(state)?.participants[id])return null
 const level=state.dmTools?.exhaustion?.creatures[id]?.level??0
 if(level>=5)return{code:'CHASE_EXHAUSTION_DROPOUT',message:'At actual exhaustion5 this body has dropped out; no new chase Dash is taken.'}
 if(level+pendingChaseDashChecks(state,id,1)>6)return{code:'CHASE_DASH_SEQUENCE_UNREPRESENTED',message:'This additional Dash could leave source ability-check debts after actual death. This first tranche refuses it BEFORE action/effect/cost; the earlier real Dash obligations remain and must all resolve, including after exhaustion5.'}
 const ward=chaseWardSequenceIssue(state,id,{checks:pendingChaseDashChecks(state,id,1)});if(ward)return ward
 return null
}

/** Conservative representation preflight only; never adjudicates the Death Ward/exhaustion rule. */
export function chaseWardSequenceIssue(state:GameState,id:string,options:{checks?:number;exhaustionLevel?:number;introducingWard?:boolean}={}){
 if(!activeChase(state)?.participants[id])return null
 const checks=options.checks??pendingChaseDashChecks(state,id),level=options.exhaustionLevel??state.dmTools?.exhaustion?.creatures[id]?.level??0
 if(checks<1||level+checks<6)return null
 const ward=options.introducingWard||state.hero?.effects.some(e=>e.kind==='death-ward'&&e.expiresAt>(state.worldTimeSeconds??0)&&e.targetIds.includes(id))
 return ward?{code:'CHASE_DEATH_WARD_SEQUENCE_UNREPRESENTED',message:'These actually owed chase CON checks could require the unsupported Death Ward/lethal-exhaustion adjudication. Refused BEFORE a new Dash, spell/source cost, reaction bonus or the FIRST CON in this sequence; existing original dice and source debts remain unchanged. No Ward rule or result is invented.'}:null
}

export function chaseHeldBodyMutationBlocked(state:GameState,id:string){const pending=state.hero?.pending;return Boolean(pending&&heldChaseTurn(state,pending)&&(pending.sourceId===id||pending.targetId===id))}
