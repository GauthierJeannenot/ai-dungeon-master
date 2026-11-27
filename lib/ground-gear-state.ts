import { z } from 'zod'
import type { GameState } from './types'
import { SlipperyIceEntrySchema } from './slippery-ice-state'
import { GROUND_GEAR } from './srd/ground-gear'
import { GroundGearRecoverySchema,validateGroundGearRecoveries } from './ground-gear-recovery-state'
import { GroundGearTransferSchema,validateGroundGearTransfers } from './ground-gear-transfer-state'
const Id=z.string().min(1).max(180).refine(id=>!['constructor','prototype','__proto__'].includes(id))
const Cell=z.object({x:z.number().int().nonnegative(),y:z.number().int().nonnegative()}).strict()
const Time=z.number().nonnegative(),RecordValue=z.record(z.string(),z.unknown())
export const GroundGearKindSchema=z.enum(['ball_bearings','caltrops','hunting_trap'])
export const GroundGearPlacementSchema=z.object({id:Id,kind:GroundGearKindSchema,itemId:Id,originalItem:RecordValue,
  sourceId:Id,mapId:Id,roomId:Id,originalCells:z.array(Cell).min(1).max(4),cells:z.array(Cell).max(4),surfaceZFeet:z.number().finite(),
  placedAt:Time,units:z.number().int().positive().max(1000),unitsRemaining:z.number().int().nonnegative().max(1000),status:z.enum(['laid','armed','sprung','recovered']),
  sourceContainerItemId:Id.optional(),sourceContainerOnGround:z.boolean().optional(),
  remainingCoverageFact:RecordValue.optional(),
  surfaceFactId:Id.optional(),surfaceFact:RecordValue.optional(),levelSurfaceConfirmed:z.literal(true).optional(),
  anchor:z.object({objectId:Id,cell:Cell,zFeet:z.number().finite().optional(),chainLengthFeet:z.number().finite().positive().max(1000),factId:Id,fact:RecordValue,
    immobileAnchorConfirmed:z.literal(true)}).strict().optional(),
  victimId:Id.optional(),recoveredAt:Time.optional(),recoveryEventId:Id.optional(),
}).strict()
export const GroundGearContactSchema=z.object({id:Id,entityId:Id,mapId:Id,cell:Cell,at:Time,turnKey:z.string().max(500),
  stepWitness:z.object({entityId:Id,mapId:Id,fromCell:Cell,fromZFeet:z.number().finite().nullable(),fromPlacementIds:z.array(Id).max(256),slipperyIceWalk:z.literal(true).optional(),slipperyIceShoveAside:z.literal(true).optional(),shoveAsideId:Id.optional()}).strict().optional(),
  placementIds:z.array(Id).max(32),slipperyIceEntry:SlipperyIceEntrySchema.optional(),kind:z.enum(['walk','forced','landing','teleport','arrival']),
  status:z.enum(['waiting','resolving','resolved']),orderedPlacementIds:z.array(Id).max(32).optional(),
  plateContacts:z.record(z.string(),z.object({stepped:z.boolean(),source:z.string().min(1).max(1000)}).strict()).optional(),
  cursor:z.number().int().nonnegative().max(32).default(0),results:z.array(RecordValue).max(32).default([]),
  stopMovement:z.boolean().default(false),continuation:RecordValue.optional(),command:z.string().max(20000).optional(),
  finalResult:RecordValue.optional(),continuationConsumed:z.boolean().optional(),
}).strict().refine(contact=>contact.slipperyIceEntry ? contact.placementIds.length===0&&(contact.kind==='walk'||contact.kind==='forced'&&Boolean(contact.slipperyIceEntry.shoveAside)) : contact.placementIds.length>0)
export const GroundGearStateSchema=z.object({version:z.literal(1),
  placements:z.record(z.string(),GroundGearPlacementSchema),contacts:z.record(z.string(),GroundGearContactSchema),
  paces:z.record(z.string(),z.enum(['normal','careful'])),
  traversals:z.record(z.string(),z.array(Id).max(256)),
  stops:z.record(z.string(),z.object({turnKey:z.string().max(500),contactId:Id,at:Time}).strict()),
  walkingInjuries:z.record(z.string(),z.object({contactIds:z.array(Id).min(1).max(512),at:Time,penaltyFeet:z.literal(10)}).strict()),
  stocks:z.record(z.string(),z.object({itemId:Id,kind:GroundGearKindSchema,units:z.number().int().positive().max(1000000),
    containerItemId:Id,sourcePlacements:z.array(Id).min(1).max(256),at:Time,
    measuredWeightLb:z.number().finite().positive().optional(),weightFact:RecordValue.optional(),lastRecoveryEventId:Id.optional(),lastTransferEventId:Id.optional()}).strict()),
  recoveries:z.record(z.string(),GroundGearRecoverySchema).optional(),
  transfers:z.record(z.string(),GroundGearTransferSchema).optional(),
  receipts:z.record(z.string(),z.object({command:z.string().max(24000),result:RecordValue}).strict()),
}).strict()
export type GroundGearState=z.infer<typeof GroundGearStateSchema>
export type GroundGearPlacement=z.infer<typeof GroundGearPlacementSchema>
export type GroundGearContact=z.infer<typeof GroundGearContactSchema>
export const groundGearTurnKey=(state:Pick<GameState,'combatGeneration'|'turnCounter'>)=>`${state.combatGeneration??0}:${state.turnCounter??0}`
export const groundGearStateOf=(state:Pick<GameState,'dmTools'>)=>state.dmTools?.groundGear
export const carefulGroundPace=(state:Pick<GameState,'dmTools'>,entityId:string)=>groundGearStateOf(state)?.paces[entityId]==='careful'
export const groundGearWalkingPenalty=(state:Pick<GameState,'dmTools'>,entityId:string)=>groundGearStateOf(state)?.walkingInjuries[entityId]?.penaltyFeet??0
export function groundGearStoppedThisTurn(state:GameState,entityId:string){const stop=groundGearStateOf(state)?.stops[entityId];return Boolean(state.phase==='combat'&&stop?.turnKey===groundGearTurnKey(state))}
export function pendingGroundGearContacts(state:Pick<GameState,'dmTools'>){return Object.values(groundGearStateOf(state)?.contacts??{}).filter(contact=>contact.status!=='resolved')}
export function groundGearContactDueIssue(state:Pick<GameState,'dmTools'>,allowedContactId?:string){
 const pending=pendingGroundGearContacts(state)
 if(!pending.length||allowedContactId&&pending.some(value=>value.id===allowedContactId))return null
 return{code:'GROUND_GEAR_CONTACT_DUE',message:'Resolve the exact actually committed ground-gear contact before choosing another action, movement, pace, initiative change or real time advance.',contactIds:pending.map(value=>value.id)}
}
/** Actual healing only: a temporary buffer, stabilization, zero heal at max HP,
 * or a narration never satisfies “regains at least1hit point”. */
export function clearCaltropsOnActualHealing(state:GameState,entityId:string,before:number,after:number){
 if(after<=before||after<1||!state.dmTools?.groundGear?.walkingInjuries[entityId])return false
 delete state.dmTools.groundGear.walkingInjuries[entityId];return true
}
export function validateGroundGearState(state:GameState){
 const data=groundGearStateOf(state);if(!data)return[]
 if(!GroundGearStateSchema.safeParse(data).success)return['Invalid physical ground gear, contact, movement or recovery schema.']
 const issues:string[]=[],at=state.worldTimeSeconds??0,activeItems=new Set<string>()
 if(Object.keys(data.placements).length>256||Object.keys(data.contacts).length>512||Object.keys(data.receipts).length>1024||Object.keys(data.paces).length>256||Object.keys(data.walkingInjuries).length>256)
  issues.push('Retained ground-gear history exceeds its fixed source-event capacity.')
 for(const[id,placed]of Object.entries(data.placements)){
  const definition=GROUND_GEAR[placed.kind],cells=new Set(placed.originalCells.map(cell=>`${cell.x},${cell.y}`))
  if(id!==placed.id||placed.originalItem.id!==placed.itemId||placed.units!==definition.units||placed.unitsRemaining>placed.units||placed.placedAt>at
    ||!Object.hasOwn(data.receipts,id)||cells.size!==placed.originalCells.length||new Set(placed.cells.map(cell=>`${cell.x},${cell.y}`)).size!==placed.cells.length)issues.push('A placed hazard needs its exact original physical unit, whole source lot and actual placement receipt.')
  if(placed.status!=='recovered'){if(activeItems.has(placed.itemId))issues.push('One physical bag/trap cannot be active in two placements.');activeItems.add(placed.itemId)}
  if(placed.kind==='ball_bearings'){
   const minX=Math.min(...placed.originalCells.map(cell=>cell.x)),minY=Math.min(...placed.originalCells.map(cell=>cell.y))
   if(!placed.levelSurfaceConfirmed||placed.originalCells.length!==4||[0,1].some(dx=>[0,1].some(dy=>!cells.has(`${minX+dx},${minY+dy}`))))issues.push('One ball-bearing lot covers one actual level10foot square, not a free arbitrary area.')
  }else if(placed.originalCells.length!==1)issues.push('Caltrops occupy one actual5foot square; a hunting trap has one located pressure plate, not a multi-cell invented trigger.')
  if(placed.kind!=='hunting_trap'&&placed.cells.some(cell=>!cells.has(`${cell.x},${cell.y}`))||placed.unitsRemaining===0&&placed.cells.length||placed.unitsRemaining>0&&!placed.cells.length)issues.push('Actual remaining loose coverage must stay inside its original placed area and cannot erase remaining physical units.')
  if(placed.kind==='hunting_trap'?!placed.anchor:placed.anchor!==undefined)issues.push('A hunting trap needs its actual immobile chain anchor; loose gear cannot invent one.')
  if(placed.kind==='hunting_trap'?!['armed','sprung','recovered'].includes(placed.status):!['laid','recovered'].includes(placed.status))issues.push('The actual device kind must retain its own source placed/armed/sprung lifecycle.')
  if(placed.victimId&&(placed.kind!=='hunting_trap'||placed.status!=='sprung'))issues.push('Only the actual sprung hunting trap can retain its captured body.')
  if(placed.status==='recovered'&&(!placed.recoveryEventId||!Object.hasOwn(data.receipts,placed.recoveryEventId)||placed.recoveredAt===undefined||placed.recoveredAt>at))issues.push('Recovered gear needs its real completed collection event and chronology.')
 }
 for(const[id,contact]of Object.entries(data.contacts))if(id!==contact.id||contact.at>at||contact.placementIds.some(value=>!Object.hasOwn(data.placements,value)))issues.push('A source contact needs its actual ground placements and observed movement event.')
 for(const injury of Object.values(data.walkingInjuries))if(injury.at>at||injury.contactIds.some(id=>!data.contacts[id]?.results.some(result=>result.kind==='caltrops'&&Number(result.damageDealt)>0)))issues.push('A caltrops walking penalty needs its actual received piercing damage, not a failed save alone.')
 return[...issues,...validateGroundGearRecoveries(state),...validateGroundGearTransfers(state)]
}
