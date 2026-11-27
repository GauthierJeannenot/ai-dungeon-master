import { z } from 'zod'
import type { GameState } from './types'
const Id=z.string().min(1).max(180).refine(value=>!['constructor','prototype','__proto__'].includes(value))
const Cell=z.object({x:z.number().int().nonnegative(),y:z.number().int().nonnegative()}).strict()
export const LoadFootprintSchema=z.object({widthCells:z.number().int().min(1).max(2),heightCells:z.number().int().min(1).max(2),source:z.string().trim().min(1).max(1000)}).strict()
export const PhysicalLoadSchema=z.object({
  id:Id,actorId:z.literal('player'),targetKind:z.enum(['creature','object']),targetId:Id,
  operation:z.enum(['carry','push','drag']),control:z.enum(['grapple','incapacitated_grapple','willing','inanimate']),
  hands:z.union([z.literal(1),z.literal(2)]),mapId:z.string().min(1),footprint:LoadFootprintSchema,
  targetLife:z.enum(['living','dead','object']),grappleEffectId:z.string().optional(),
  reason:z.string().trim().min(1).max(1000),source:z.string().trim().min(1).max(1000),
  creation:z.string(),startedAt:z.number().nonnegative(),status:z.enum(['active','released']),endedAt:z.number().nonnegative().optional(),
  lastActorCell:Cell,lastTargetCell:Cell,
}).strict().superRefine((load,ctx)=>{
  const grapple=load.control==='grapple'||load.control==='incapacitated_grapple'
  if(grapple!==Boolean(load.grappleEffectId)||grapple&&(load.targetKind!=='creature'||load.targetLife!=='living'))ctx.addIssue({code:'custom',message:'A physical source grapple requires its actual living target and exact effect.'})
  if(load.targetKind==='object'&&(load.targetLife!=='object'||load.control!=='inanimate')||load.targetLife==='dead'&&load.control!=='inanimate'||load.control==='willing'&&load.targetLife!=='living')ctx.addIssue({code:'custom',message:'Physical control must agree with the actual object/body life category.'})
})
export const PhysicalHandlingStateSchema=z.object({version:z.literal(1),activeId:Id.optional(),loads:z.record(z.string(),PhysicalLoadSchema)}).strict().superRefine((state,ctx)=>{
  if(Object.keys(state.loads).length>128)ctx.addIssue({code:'custom',message:'The retained physical handling records are full.'})
  const active=Object.values(state.loads).filter(load=>load.status==='active')
  if(active.length>(state.activeId?1:0)||state.activeId&&(!state.loads[state.activeId]||state.loads[state.activeId].status!=='active'))ctx.addIssue({code:'custom',message:'Exactly the selected physical load may be active.'})
  for(const [id,load] of Object.entries(state.loads))if(id!==load.id||load.status==='released'&&load.endedAt===undefined)ctx.addIssue({code:'custom',message:'Physical load identities and actual release timestamps must agree.'})
})
export type PhysicalLoad=z.infer<typeof PhysicalLoadSchema>
export type LoadFootprint=z.infer<typeof LoadFootprintSchema>
export type PhysicalHandlingState=z.infer<typeof PhysicalHandlingStateSchema>
type Holder={physicalHandling?:PhysicalHandlingState}
export const physicalHandlingStateOf=(state:GameState)=>(state.dmTools as Holder|undefined)?.physicalHandling
export function activePhysicalLoad(state:GameState){const data=physicalHandlingStateOf(state);return data?.activeId?data.loads[data.activeId]:undefined}
export function loadCells(anchor:{x:number;y:number},footprint:LoadFootprint){
  return Array.from({length:footprint.widthCells*footprint.heightCells},(_,index)=>({x:anchor.x+index%footprint.widthCells,y:anchor.y+Math.floor(index/footprint.widthCells)}))
}
export function distanceFromLoad(actor:{x:number;y:number},anchor:{x:number;y:number},footprint:LoadFootprint){return Math.min(...loadCells(anchor,footprint).map(cell=>Math.max(Math.abs(actor.x-cell.x),Math.abs(actor.y-cell.y))))}
export function physicalLoadTransitionIssue(state:GameState){return activePhysicalLoad(state)?{code:'PHYSICAL_LOAD_MAP_TRANSITION_REQUIRED',message:'Release the exact held physical load before changing maps; no body or object is teleported or archived by ordinary travel.'}:null}
export function validatePhysicalHandlingState(state:GameState):string[]{
  const saved=physicalHandlingStateOf(state)
  if(!saved)return []
  if(!PhysicalHandlingStateSchema.safeParse(saved).success)return ['Invalid persisted physical handling state.']
  const load=activePhysicalLoad(state);if(!load)return []
  const actor=state.player,target=load.targetKind==='object'?state.dmTools?.objects[load.targetId]:state.monsters[load.targetId]
  const cell=target&&('cell'in target?target.cell:target.position)
  const errors:string[]=[]
  if(!target||!cell||load.mapId!==state.currentMapId||'mapId'in target&&target.mapId!==load.mapId)errors.push('A held physical load must be an actual active-map target; no archive is reactivated.')
  if(actor.hp.current<=0||actor.conditions.some(condition=>['incapacitated','unconscious','petrified','stunned','paralyzed'].includes(condition)))errors.push('An incapacitated carrier cannot retain an active physical grip.')
  if(cell&&(distanceFromLoad(actor.position,cell,load.footprint)!==1||actor.position.x!==load.lastActorCell.x||actor.position.y!==load.lastActorCell.y||cell.x!==load.lastTargetCell.x||cell.y!==load.lastTargetCell.y))errors.push('The held load positions must match their actual last atomic paired configuration.')
  if(target&&'isAlive'in target&&((load.targetLife==='dead')!==(!target.isAlive)))errors.push('A body changing actual life status needs a new explicit handling control; no consent or grapple is inferred.')
  if(target&&'isAlive'in target&&(load.footprint.widthCells!==1||load.footprint.heightCells!==1))errors.push('This body transport retains the actual existing single-cell token projection.')
  if(target&&'kind'in target&&target.kind==='obstacle'){
    const span=target.size==='large'?2:1
    if(load.footprint.widthCells!==span||load.footprint.heightCells!==span)errors.push('The active physical footprint contradicts the prepared obstacle actual grid geometry.')
  }
  if(load.grappleEffectId&&!state.hero?.effects.some(effect=>effect.id===load.grappleEffectId&&effect.kind==='grapple'&&effect.sourceId==='player'&&effect.targetIds.includes(load.targetId)&&effect.expiresAt>(state.worldTimeSeconds??0)))errors.push('The actual source grapple for this physical load is no longer active.')
  return errors
}
