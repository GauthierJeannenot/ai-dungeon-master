import { z } from 'zod'
import type { GameState } from './types'
import type { Coins } from './srd/currency'
import type { MagicItemId } from './srd/magic-items'
import { groundGearPhysicalWitness as witness } from './ground-gear-recovery-state'
import { entityVerticalContext } from './jumping-state'

export interface AdventureRewardSource { book:string; chapter:string; section:string; page:number; sha256:string }
export interface AdventureRewardDefinition {
  id:string; label:string; mapId:string; roomId:string; source:AdventureRewardSource;
  owner:'unclaimed'|'enemy'|'victims'; sourceNpcId?:string; sourceNpcIds?:string[]; encounterId?:string; participantIndex?:number;
  sourceDescription:string; containerRequired?:boolean; sourceConditions?:{outcome:'victory';preventOwnerEscape:true};
  coins?:Partial<Coins>;
  items:Array<{id:string;name:string;description:string;kind:'magic'|'scroll'|'valuable'|'equipment'|'collection';
    templateId?:MagicItemId;spellId?:'counterspell'|'teleport';valueGp?:number;equipmentId?:string}>;
}
const Id=z.string().min(1).max(80).refine(v=>!['constructor','prototype','__proto__'].includes(v))
export const AdventureRewardSourceSchema=z.object({book:z.string().min(1).max(100),chapter:z.string(),section:z.string(),page:z.number().int().positive(),sha256:z.string().length(64)}).strict()
export const PrepareAdventureRewardSchema=z.object({rewardId:Id,cell:z.object({x:z.number().int().nonnegative(),y:z.number().int().nonnegative()}).strict(),
  searchFactId:Id,actualSearchAndContentsAccessConfirmed:z.literal(true),containerId:Id.optional(),actualOwnerEscapePreventedConfirmed:z.literal(true).optional(),
  release:z.object({kind:z.enum(['physical_helpless_body_search','actual_property_surrender','victim_ownership_transfer']),factId:Id,
    actualTransferConfirmed:z.literal(true),reason:z.string().trim().min(1).max(600)}).strict().optional(),
}).strict()
export type PrepareAdventureReward=z.infer<typeof PrepareAdventureRewardSchema>
const receipt=z.object({rewardId:Id,input:PrepareAdventureRewardSchema,creation:z.string(),source:AdventureRewardSourceSchema,
  placement:z.object({mapId:z.string(),roomId:z.string(),cell:z.object({x:z.number().int().nonnegative(),y:z.number().int().nonnegative()}).strict()}).strict(),
  sourceWitness:z.string(),factWitness:z.string(),releaseWitness:z.string().optional(),at:z.number().nonnegative(),
  outputIds:z.array(Id).max(32),coinTreasureId:Id.optional(),ownerBefore:z.enum(['unclaimed','enemy','victims']),
  ownershipTransferred:z.boolean(),encounterWitness:z.string().optional(),bodyWitness:z.string().optional(),ownerVerticalWitness:z.string().optional(),
}).strict()
export const AdventureRewardStateSchema=z.object({version:z.literal(1),receipts:z.record(z.string(),receipt)}).strict()
export type AdventureRewardState=z.infer<typeof AdventureRewardStateSchema>
export const ADVENTURE_REWARD_CREATION_PREFIX='adventure-reward:'

/** Reciprocal producer links survive pickups, deposits and ordinary consumed
 * tombstones. Legacy items without the new marker remain untouched. */
export function validateAdventureRewardState(state:GameState){
  const data=state.dmTools?.adventureRewards,errors:string[]=[]
  const linked:string[]=[]
  for(const item of [...state.player.inventory,...Object.values(state.droppedItems??{}).map(d=>d.item)])
    if(item.adventureRewardId)linked.push(item.adventureRewardId)
  for(const entry of Object.values(state.dmTools?.magicItems??{}))if(entry.creation.startsWith(ADVENTURE_REWARD_CREATION_PREFIX))linked.push(entry.creation.slice(ADVENTURE_REWARD_CREATION_PREFIX.length).split('|')[0])
  for(const entry of Object.values(state.dmTools?.spellScrolls??{}))if(entry.creation.startsWith(ADVENTURE_REWARD_CREATION_PREFIX))linked.push(entry.creation.slice(ADVENTURE_REWARD_CREATION_PREFIX.length).split('|')[0])
  for(const entry of Object.values(state.dmTools?.treasures??{}))if(entry.creation.startsWith(ADVENTURE_REWARD_CREATION_PREFIX))linked.push(entry.creation.slice(ADVENTURE_REWARD_CREATION_PREFIX.length).split('|')[0])
  for(const entry of Object.values(state.dmTools?.valuables??{}))if(entry.rewardId)linked.push(entry.rewardId)
  if(!data)return linked.length?['An authored reward producer requires its original reciprocal receipt.']:[]
  if(!AdventureRewardStateSchema.safeParse(data).success)return ['Invalid authored reward receipt schema.']
  for(const id of linked)if(!data.receipts[id])errors.push('An authored reward output lost its original receipt.')
  if(Object.keys(data.receipts).length>64)errors.push('Retain bounded authored reward receipts; never discard their history.')
  for(const[id,r]of Object.entries(data.receipts)){
    if(id!==r.rewardId||id!==r.input.rewardId||r.creation!==witness(r.input)||r.at>(state.worldTimeSeconds??0)
      ||new Set(r.outputIds).size!==r.outputIds.length||r.ownershipTransferred!==(r.ownerBefore==='unclaimed'||r.input.release!==undefined))errors.push('Retain the original authored reward input, date and ownership decision.')
    for(const output of r.outputIds){
      const physical=state.player.inventory.find(i=>i.id===output)??state.droppedItems?.[output]?.item
      const magic=state.dmTools?.magicItems?.[output],scroll=state.dmTools?.spellScrolls?.[output]
      const custody=state.dmTools?.merchantResales?.custody[output]?.item
      if(physical&&physical.adventureRewardId!==id||custody&&custody.adventureRewardId!==id)errors.push('The original physical reward output retains its exact producer marker.')
      if(!physical&&!custody&&magic?.status!=='consumed'&&magic?.status!=='destroyed'&&scroll?.status!=='consumed')errors.push('An acquired/prepared reward may not disappear or be rematerialized by hydration.')
      if(magic&&!magic.creation.startsWith(`${ADVENTURE_REWARD_CREATION_PREFIX}${id}|`)||scroll&&!scroll.creation.startsWith(`${ADVENTURE_REWARD_CREATION_PREFIX}${id}|`))errors.push('The magic/scroll reward producer must retain its original source owner.')
    }
    if(r.coinTreasureId){const t=state.dmTools?.treasures?.[r.coinTreasureId];if(!t||!t.creation.startsWith(`${ADVENTURE_REWARD_CREATION_PREFIX}${id}|`))errors.push('The exact once-only coin treasure and reward receipt must remain reciprocal.')}
  }
  return errors
}

/** This first authored-placement tranche emits at an actual Z0 ground point.
 * An elevated/airborne/unknown source owner cannot be flattened into that point. */
export function authoredRewardOwnerHeightIssue(state:GameState,entityId:string){
 const context=entityVerticalContext(state,entityId)
 return !context.known||context.airborne||context.zFeet!==0
  ?{code:'REWARD_OWNER_HEIGHT_UNSUPPORTED',message:'This carried-source search or surrender requires the actual owner on known Z0 ground. Elevated, airborne or unresolved bodies need their actual represented handling before reward placement; no fall, landing or ground loot is invented.'}:null
}
