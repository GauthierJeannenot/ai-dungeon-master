import { nativePoisonStateOf } from './native-poison-state'
import { z } from 'zod'
import type { GameState } from './types'
import { PLAYER_POISON_IDS,PLAYER_POISONS } from './srd/player-poisons'
import { AFFLICTIONS } from './srd/afflictions'
const Id=z.string().min(1).max(180).refine(value=>!['constructor','prototype','__proto__'].includes(value))
const Cell=z.object({x:z.number().int().nonnegative(),y:z.number().int().nonnegative()}).strict()
const Value=z.record(z.string(),z.unknown()),Time=z.number().finite().nonnegative()
export const PlayerPoisonIdSchema=z.enum(PLAYER_POISON_IDS)
export const PlayerPoisonWitnessSchema=z.object({preparationId:Id,templateId:PlayerPoisonIdSchema,
 originSurfaceKey:z.string().min(1).max(400),appliedAt:Time}).strict()
export type PlayerPoisonWitness=z.infer<typeof PlayerPoisonWitnessSchema>
export const PlayerPoisonAttackContextSchema=z.object({attackId:Id,targetId:Id,at:Time,damageType:z.enum(['piercing','slashing']),witness:PlayerPoisonWitnessSchema}).strict()
export type PlayerPoisonAttackContext=z.infer<typeof PlayerPoisonAttackContextSchema>
export const PlayerPoisonLocationSchema=z.object({kind:z.enum(['item','object','ground_gear','loaded_projectile','expended_projectile']),id:Id,key:z.string().min(1).max(400)}).strict()
export type PlayerPoisonLocation=z.infer<typeof PlayerPoisonLocationSchema>
export const PlayerPoisonStateSchema=z.object({version:z.literal(1),
 preparations:z.record(z.string(),z.object({id:Id,command:z.string().max(20000),doseItemId:Id,templateId:PlayerPoisonIdSchema,
  delivery:z.enum(['contact','ingested','injury']),surfaceKey:z.string().min(1).max(400),targetKind:z.enum(['item','object','ground_gear']),targetId:Id,
  sourceItem:Value,appliedAt:Time,status:z.enum(['active','delivered','washed']),
  currentSurface:PlayerPoisonLocationSchema.optional(),
  coverage:z.object({objects:z.literal(1),exposures:z.literal(1),source:z.string().min(1).max(1000)}).strict(),
  physicalFact:Value.optional(),deliveryEventId:Id.optional(),washEventId:Id.optional(),result:Value,
 }).strict()),
 surfaces:z.record(z.string(),PlayerPoisonWitnessSchema),
 deliveries:z.record(z.string(),z.object({id:Id,command:z.string().max(20000),templateId:PlayerPoisonIdSchema,targetId:Id,
  preparationId:Id.optional(),cloudId:Id.optional(),nativeAttackId:Id.optional(),naturalSource:z.object({entityId:Id,templateId:PlayerPoisonIdSchema,creatureType:z.string().min(1).max(100),observedAt:Time,bodyWitness:z.string().min(1).max(10000)}).strict().optional(),afflictionId:Id.optional(),at:Time,
  status:z.enum(['pending','resolved']),physicalFact:Value.optional(),baseAttack:Value.optional(),result:Value.optional(),
 }).strict()),
 clouds:z.record(z.string(),z.object({id:Id,command:z.string().max(20000),templateId:PlayerPoisonIdSchema,doseItemId:Id,at:Time,
  seconds:z.number().nonnegative(),actionSpent:z.boolean(),
  origin:z.object({x:z.number().finite(),y:z.number().finite(),zFeet:z.number().finite()}).strict(),
  targets:z.array(Id).max(128),cursor:z.number().int().min(0).max(128),results:z.array(Value).max(128),
  playerPerceivedTargetIds:z.array(Id).max(128),
  witness:z.string().min(1).max(100000),status:z.enum(['resolving','resolved']),result:Value.optional(),
 }).strict()),
 receipts:z.record(z.string(),z.object({command:z.string().max(20000),result:Value}).strict()),
}).strict()
export type PlayerPoisonState=z.infer<typeof PlayerPoisonStateSchema>
export const playerPoisonStateOf=(state:Pick<GameState,'dmTools'>)=>(state.dmTools as{playerPoisons?:PlayerPoisonState}|undefined)?.playerPoisons
export const activePlayerPoison=(state:Pick<GameState,'dmTools'>,surfaceKey:string)=>{
 const data=playerPoisonStateOf(state),witness=data?.surfaces[surfaceKey],record=witness?data?.preparations[witness.preparationId]:undefined
 return witness&&record?.status==='active'?witness:undefined
}
export function validPlayerPoisonWitness(state:Pick<GameState,'dmTools'>,raw:unknown):raw is PlayerPoisonWitness{
 const parsed=PlayerPoisonWitnessSchema.safeParse(raw);if(!parsed.success)return false
 const record=playerPoisonStateOf(state)?.preparations[parsed.data.preparationId]
 return Boolean(record&&record.templateId===parsed.data.templateId&&record.surfaceKey===parsed.data.originSurfaceKey&&record.appliedAt===parsed.data.appliedAt)
}
/** Called only at a real already validated unit transfer/firing commit. */
export function movePlayerPoisonSurface(state:GameState,witness:PlayerPoisonWitness,location:PlayerPoisonLocation){
 const data=playerPoisonStateOf(state),preparation=data?.preparations[witness.preparationId]
 if(!data||!preparation||preparation.status!=='active'||!validPlayerPoisonWitness(state,witness))return false
 for(const[key,value]of Object.entries(data.surfaces))if(value.preparationId===witness.preparationId)delete data.surfaces[key]
 preparation.currentSurface=structuredClone(location);data.surfaces[location.key]=structuredClone(witness);return true
}
export function validatePlayerPoisonState(state:GameState){
 const data=playerPoisonStateOf(state);if(!data)return []
 if(!PlayerPoisonStateSchema.safeParse(data).success)return['Invalid actual player-poison dose/preparation/delivery schema.']
 const issues:string[]=[],time=state.worldTimeSeconds??0,spent=new Set<string>()
 if(Object.keys(data.preparations).length>256||Object.keys(data.surfaces).length>512||Object.keys(data.deliveries).length>1024||Object.keys(data.clouds).length>128||Object.keys(data.receipts).length>2048)issues.push('Player-poison physical history capacity exceeded; no retained dose receipt is evicted.')
 for(const[id,record]of Object.entries(data.preparations)){
  if(id!==record.id||record.sourceItem.id!==record.doseItemId||record.delivery!==AFFLICTIONS[record.templateId].delivery||record.appliedAt>time||spent.has(record.doseItemId))issues.push('An actual poison dose needs its unique physical item, source delivery, preparation identity and elapsed application time.')
  spent.add(record.doseItemId)
  if(record.status==='delivered'&&(!record.deliveryEventId||!data.deliveries[record.deliveryEventId]))issues.push('A delivered coating needs its actual physical exposure receipt.')
  if(record.status==='washed'&&(!record.washEventId||!data.receipts[record.washEventId]))issues.push('Washing needs its actual completed operation receipt, never a free removal.')
  if(record.status==='active'){
   const location=record.currentSurface??{key:record.surfaceKey,kind:record.targetKind,id:record.targetId}
   if(data.surfaces[location.key]?.preparationId!==id||Object.values(data.surfaces).filter(value=>value.preparationId===id).length!==1)issues.push('One potent physical single-dose surface retains exactly one current unit/location, never aliases that duplicate the dose.')
   const basic=state.dmTools?.basicPoison?.coatings[location.key]
   if(basic&&basic.appliedAt<=time&&basic.expiresAt>time)issues.push('This procedure does not silently combine a potent Basic Poison coating with a different DMG dose.')
   if(location.kind==='loaded_projectile'&&state.dmTools?.improvised?.loads[location.id]?.projectile.playerPoison?.preparationId!==id)issues.push('A real reserved projectile must carry that same current poison unit.')
   if(location.kind==='expended_projectile'&&state.dmTools?.ammunition?.expenditures[location.id]?.playerPoison?.preparationId!==id)issues.push('A fired poisoned projectile needs its actual original shot receipt, not a free held unit.')
  }
 }
 for(const witness of Object.values(data.surfaces))if(!validPlayerPoisonWitness(state,witness))issues.push('A current poisoned surface needs the retained actual dose witness.')
 for(const[id,cloud]of Object.entries(data.clouds)){
  if(id!==cloud.id||cloud.at>time||spent.has(cloud.doseItemId)||new Set(cloud.targets).size!==cloud.targets.length||cloud.cursor>cloud.targets.length)issues.push('An inhaled cloud requires one unique actually spent dose and its frozen physical bodies, never duplicated gas or future history.')
  spent.add(cloud.doseItemId)
  if(AFFLICTIONS[cloud.templateId].delivery!=='inhaled'||cloud.playerPerceivedTargetIds.some(target=>!cloud.targets.includes(target))||cloud.status==='resolved'&&(cloud.cursor!==cloud.targets.length||!cloud.result))issues.push('A completed actual inhaled event keeps its source delivery, complete cursor and confidential perception subset.')
  try{const proof=JSON.parse(cloud.witness) as{targets?:unknown;area?:unknown},command=JSON.parse(cloud.command) as{area?:unknown};if(JSON.stringify(proof.targets)!==JSON.stringify(cloud.targets)||JSON.stringify(proof.area)!==JSON.stringify(command.area))issues.push('The actual gas event must retain its original physical cube and frozen exposed body list.')}catch{issues.push('The actual gas event needs its valid retained physical witness and original explicit area command.')}
 }
 for(const[id,delivery]of Object.entries(data.deliveries)){
  if(id!==delivery.id||delivery.at>time||delivery.preparationId&&!data.preparations[delivery.preparationId]||delivery.cloudId&&!data.clouds[delivery.cloudId]||delivery.status==='resolved'&&!delivery.result)issues.push('An actual poison exposure must retain its real preparation/cloud and completed result.')
  if([delivery.preparationId,delivery.cloudId,delivery.naturalSource,delivery.nativeAttackId].filter(Boolean).length!==1)issues.push('An actual poison delivery has exactly one real preparation, cloud, natural harvesting source or committed native attack; sources are never fabricated or combined.')
  if(delivery.nativeAttackId){const hit=nativePoisonStateOf(state)?.hits[delivery.nativeAttackId];if(!hit||hit.context.attackId!==id||hit.context.targetId!==delivery.targetId||hit.context.templateId!==delivery.templateId)issues.push('A native poison delivery retains its one original real hit and exact source body/action, never an inventory dose.')}
  if(delivery.naturalSource&&(delivery.preparationId||delivery.cloudId||delivery.naturalSource.templateId!==delivery.templateId||delivery.naturalSource.observedAt>delivery.at||(PLAYER_POISONS[delivery.templateId] as{harvestCreatureType?:string}).harvestCreatureType!==delivery.naturalSource.creatureType))issues.push('A natural harvest mishap keeps its actual creature body and source poison witness, never a manufactured preparation or vial.')
  if(delivery.cloudId){const cloud=data.clouds[delivery.cloudId];if(!cloud||cloud.templateId!==delivery.templateId||!cloud.targets.includes(delivery.targetId))issues.push('A gas delivery remains bound to one original actual body and source cloud.')}
  if(delivery.status==='pending'){
   const resolution=state.hero?.pending?.command.toolkitResolution as{domain?:string;command?:{deliveryId?:string}}|undefined
   if(resolution?.domain!=='player-poison-save'||resolution.command?.deliveryId!==delivery.id)issues.push('A pending poison delivery needs its exact original held source CON save, never a new die.')
  }
 }
 return issues
}
