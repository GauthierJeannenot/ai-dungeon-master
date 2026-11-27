import {z} from 'zod'
import type{GameState,Item}from './types'
import{TradeItemSchema}from './merchant-state'
import{groundGearPhysicalWitness as witness}from './ground-gear-recovery-state'
import{KNOTS_SOURCE}from './srd/knots'
const Id=z.string().min(1).max(180).refine(id=>!['constructor','prototype','__proto__'].includes(id)),Text=z.string().trim().min(1).max(1000),Value=z.record(z.string(),z.unknown()),Cell=z.object({x:z.number().int().nonnegative(),y:z.number().int().nonnegative()}).strict()
export const KnotPolicySchema=z.object({eventId:Id,enabled:z.literal(true),reason:Text}).strict()
export const KnotCostSchema=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('improvised_action'),reason:Text}).strict(),
 z.object({kind:z.literal('measured_interval'),seconds:z.number().int().positive().max(3600),activity:z.enum(['light','strenuous']),reason:Text}).strict(),
])
export const KnotPlacementSchema=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('loose_ground'),cell:Cell}).strict(),
 z.object({kind:z.literal('player_loop'),actualPermittedPhysicalLoopConfirmed:z.literal(true),noHostileBindingConfirmed:z.literal(true)}).strict(),
])
export const KnotDestinationSchema=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('inventory')}).strict(),
 z.object({kind:z.literal('ground'),cell:Cell}).strict(),
])
export const TieKnotSchema=z.object({eventId:Id,knotId:Id,ropeItemId:Id,placement:KnotPlacementSchema,physicalFactId:Id,actualRopeAndPlacementConfirmed:z.literal(true),handsRequired:z.union([z.literal(1),z.literal(2)]),cost:KnotCostSchema}).strict()
export const ResolveKnotSchema=z.object({eventId:Id,knotId:Id,method:z.enum(['untie','slip']),physicalFactId:Id,actualAttemptPossibleConfirmed:z.literal(true),handsRequired:z.union([z.literal(1),z.literal(2)]).optional(),destination:KnotDestinationSchema,cost:KnotCostSchema}).strict().superRefine((input,ctx)=>{if(input.method==='untie'&&input.handsRequired===undefined||input.method==='slip'&&input.handsRequired!==undefined)ctx.addIssue({code:'custom',message:'Untying chooses actual required hands; slipping has no manual-hand choice.'});if(input.method==='slip'&&input.destination.kind!=='ground')ctx.addIssue({code:'custom',message:'The intact slipped knot must have its explicitly chosen real ground destination.'})})
const Request=z.discriminatedUnion('operation',[z.object({operation:z.literal('tie'),input:TieKnotSchema}).strict(),z.object({operation:z.literal('resolve'),input:ResolveKnotSchema}).strict()])
const Attempt=z.object({request:Request,command:z.string(),sourceCommand:z.string(),policyCommand:z.string(),at:z.number().nonnegative(),generation:z.number().int().nonnegative(),turnCounter:z.number().int().nonnegative(),frame:z.string(),factWitness:z.string(),status:z.enum(['pending','resolved']),originalCheck:Value.optional(),originalRoll:Value.optional(),heldCommand:z.string().optional(),result:Value.optional()}).strict()
const Ground=z.object({mapId:Id,roomId:Id,cell:Cell}).strict()
const Knot=z.object({id:Id,input:TieKnotSchema,command:z.string(),policyCommand:z.string(),ropeItem:TradeItemSchema,ropeInitialCommand:z.string(),tiedAt:z.number().nonnegative(),mapId:Id,roomId:Id,dc:z.number().int().min(-1000).max(1000),tieCheck:Value,status:z.enum(['tied','untied']),ground:Ground.optional(),slipEventId:Id.optional(),untieEventId:Id.optional()}).strict()
export const KnotStateSchema=z.object({version:z.literal(1),policy:z.object({input:KnotPolicySchema,at:z.number().nonnegative(),command:z.string(),source:z.string()}).strict().optional(),knots:z.record(z.string(),Knot),attempts:z.record(z.string(),Attempt),receipts:z.record(z.string(),z.object({command:z.string(),result:Value}).strict())}).strict()
export type KnotState=z.infer<typeof KnotStateSchema>
export type KnotRequest=z.infer<typeof Request>
export type KnotRecord=KnotState['knots'][string]
export const initialKnotState=():KnotState=>({version:1,knots:{},attempts:{},receipts:{}})
export const knotPolicyCommand=(input:z.infer<typeof KnotPolicySchema>,at:number)=>witness({operation:'xge-knot-policy',input,at,source:KNOTS_SOURCE})
export const knotRequestCommand=(request:KnotRequest)=>witness(request)
export function activeKnotCarriedItems(state:Pick<GameState,'dmTools'>):Item[]{return Object.values(state.dmTools?.knots?.knots??{}).filter(k=>k.status==='tied'&&k.input.placement.kind==='player_loop'&&!k.slipEventId).map(k=>k.ropeItem as Item)}
export function knotLocation(state:GameState,knot:KnotRecord){return knot.ground??(knot.input.placement.kind==='player_loop'&&!knot.slipEventId&&state.currentMapId&&state.currentRoomId?{mapId:state.currentMapId,roomId:state.currentRoomId,cell:{...state.player.position}}:undefined)}
export function validateKnotState(state:GameState){
 const data=state.dmTools?.knots;if(!data)return[];if(!KnotStateSchema.safeParse(data).success)return['Invalid optional knot policy, exact source knot, custody, attempt or receipt.'];const issues:string[]=[],p=data.policy,at=state.worldTimeSeconds??0
 if(Object.keys(data.knots).length>256||Object.keys(data.attempts).length>1024||Object.keys(data.receipts).length>2048)issues.push('Retain bounded actual knot and attempt histories; no event evicted.')
 if(p&&(p.command!==knotPolicyCommand(p.input,p.at)||p.source!==witness(KNOTS_SOURCE)||p.at>at||data.receipts[p.input.eventId]?.command!==p.command))issues.push('Knot adoption is the exact explicit original OFF-default option, command, source and time.')
 const tiedItems=new Set<string>()
 for(const[id,k]of Object.entries(data.knots)){
  const a=data.attempts[k.input.eventId],stock=state.dmTools?.merchants?.stocks[k.ropeItem.id],roll=k.tieCheck.roll as{total?:number}|undefined
  if(id!==k.id||k.input.knotId!==id||k.command!==knotRequestCommand({operation:'tie',input:k.input})||!p||k.policyCommand!==p.command||p.at>k.tiedAt||k.tiedAt>at||!a||a.status!=='resolved'||a.command!==k.command||witness(a.result?.check)!==witness(k.tieCheck)||k.dc!==roll?.total||a.result?.dc!==k.dc||k.tieCheck.ability!=='int'||k.tieCheck.entityId!=='player')issues.push('The real knot keeps its original final INT(Sleight) total as exact DC, not a new die, clamp or hydration rewrite.')
  if(!stock?.initialRope||stock.initialRope.command!==k.ropeInitialCommand||stock.status!=='sold'||witness(stock.item)!==witness(k.ropeItem)||k.input.ropeItemId!==k.ropeItem.id)issues.push('Knot custody retains the exact previously purchased one physical source rope, not free or legacy equipment.')
  if(k.status==='tied'){if(tiedItems.has(k.ropeItem.id)||state.player.inventory.some(item=>item.id===k.ropeItem.id)||state.droppedItems?.[k.ropeItem.id]||state.dmTools?.merchantResales?.custody[k.ropeItem.id])issues.push('A tied rope has one real knot custody, never inventory plus registry, ground or another knot.');tiedItems.add(k.ropeItem.id);if(k.input.placement.kind==='loose_ground'&&!k.ground||k.input.placement.kind==='player_loop'&&!k.slipEventId&&k.ground)issues.push('The physical knot stays on its chosen ground or follows its actual player loop, not a second authoritative location.')}
  if(k.slipEventId){const slip=data.attempts[k.slipEventId];if(k.input.placement.kind!=='player_loop'||!slip||slip.request.operation!=='resolve'||slip.request.input.method!=='slip'||slip.request.input.knotId!==id||slip.result?.success!==true||witness(slip.result?.ground)!==witness(k.ground))issues.push('A successful real body slip leaves this intact knot at its explicit destination, without untying it.')}
  if(k.status==='untied'){const untie=k.untieEventId?data.attempts[k.untieEventId]:undefined;if(!untie||untie.request.operation!=='resolve'||untie.request.input.method!=='untie'||untie.request.input.knotId!==id||untie.result?.success!==true)issues.push('Untied state requires its one successful actual INT(Sleight) attempt; no automatic freedom/condition removal.')}
 }
 for(const[id,a]of Object.entries(data.attempts)){
  if(id!==a.request.input.eventId||a.command!==knotRequestCommand(a.request)||a.sourceCommand!==witness({request:a.request,policyCommand:a.policyCommand,at:a.at,generation:a.generation,turnCounter:a.turnCounter,frame:a.frame,factWitness:a.factWitness})||!p||a.policyCommand!==p.command||a.at<p.at||a.at>at)issues.push('Every exact knot attempt keeps its explicit source choices, cost and original policy.')
  if(a.status==='resolved'){if(!a.result||data.receipts[id]?.command!==a.command||witness(data.receipts[id]?.result)!==witness(a.result))issues.push('A resolved knot attempt retains its one exact result, engaged cost and receipt.')}
  else{if(witness(state.worldFacts?.find(f=>f.id===a.request.input.physicalFactId))!==a.factWitness)issues.push('The held knot keeps its exact participating physical qualification fact through hydration; no deletion or replacement softlock.');if(a.request.input.cost.kind==='improvised_action'&&(state.phase!=='combat'||state.currentTurn!=='player')||a.request.input.cost.kind==='measured_interval'&&state.phase==='combat')issues.push('The held exact knot cost keeps its original actual player combat turn or outside-combat interval.');const pending=state.hero?.pending,resolution=pending?.command.toolkitResolution as{domain?:string;command?:{eventId?:string}}|undefined;if(!a.originalCheck||!a.originalRoll||a.heldCommand!==witness({sourceCommand:a.sourceCommand,originalCheck:a.originalCheck,originalRoll:a.originalRoll})||resolution?.domain!=='xge-knot-check'||resolution.command?.eventId!==id||witness(pending?.command.result)!==witness(a.originalCheck)||witness(pending?.roll)!==witness(a.originalRoll)||a.generation!==(state.combatGeneration??0)||a.turnCounter!==(state.turnCounter??0)||a.at!==at)issues.push('The held knot retains its actual original check/d20, cost-free pending attempt and same real turn through SQL.')}
 }
 return issues
}

/** The exact current held knot fact only; unrelated facts and resolved histories remain removable. */
export function protectedKnotFactIds(state:Pick<GameState,'dmTools'|'hero'>):string[]{
 const r=state.hero?.pending?.command.toolkitResolution as{domain?:string;command?:{eventId?:string}}|undefined
 if(r?.domain!=='xge-knot-check')return[]
 const attempt=state.dmTools?.knots?.attempts[String(r.command?.eventId)]
 return attempt?.status==='pending'?[attempt.request.input.physicalFactId]:[]
}
