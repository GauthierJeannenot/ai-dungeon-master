import { z } from 'zod'
import type { GameState,Item } from './types'
import { ValuableRecordSchema } from './hoard-state'
import { valuablePhysicalItem } from './carrying-state'
import { groundGearPhysicalWitness as witness } from './ground-gear-recovery-state'

const Id=z.string().min(1).max(180).refine(id=>!['constructor','prototype','__proto__'].includes(id))
export const CreateValuableResaleOfferSchema=z.object({offerId:Id,merchantId:Id,
 valuables:z.array(z.object({itemId:Id,registeredKind:z.enum(['gem','art','collection']),physicalFactId:Id,actualRegisteredIdentityAndValueConfirmed:z.literal(true),materialStateUnchangedConfirmed:z.literal(true)}).strict()).min(1).max(32),
 priceCp:z.number().int().positive().max(1000000000),agreementFactId:Id,actualMerchantAcceptanceConfirmed:z.literal(true),expiresAt:z.number().int().nonnegative().optional(),
 actualDiscerningPurchaserConfirmed:z.literal(true).optional(),
}).strict().superRefine((input,ctx)=>{if(input.valuables.some(v=>v.registeredKind==='collection')&&!input.actualDiscerningPurchaserConfirmed)ctx.addIssue({code:'custom',path:['actualDiscerningPurchaserConfirmed'],message:'The source collection requires a real discerning purchaser explicitly qualified in the actual buyer agreement.'})})
export const ValuableResaleProvenanceSchema=z.object({record:ValuableRecordSchema,hoardCreation:z.string()}).strict()
/** Pure existing ownership/provenance check. A display name never chooses kind,
 * value, purity or component identity. Exact source-table verification is engine-only. */
export function registeredValuableResaleProfile(state:GameState,item:Item){
 const record=state.dmTools?.valuables?.[item.id],hoard=record?.hoardId?state.dmTools?.hoards?.[record.hoardId]:undefined
 const reward=record?.rewardId?state.dmTools?.adventureRewards?.receipts[record.rewardId]:undefined
 const original=Boolean(hoard?.collected&&hoard.valuableIds.includes(record!.id)||reward?.outputIds.includes(record!.id)&&item.adventureRewardId===reward.rewardId&&reward.ownershipTransferred)
 if(!record||!ValuableRecordSchema.safeParse(record).success||!original||record.id!==item.id||item.equipmentId!=='valuable'||item.type!=='misc'||item.quantity!==undefined&&item.quantity!==1||item.magical||item.silvered||item.spellIds?.length||item.damage!==undefined||item.acBonus!==undefined||item.ammunitionType)return undefined
 const expected=valuablePhysicalItem(record)
 if(item.name!==expected.name||item.description!==expected.description)return undefined
 return {priceCp:record.valueGp*100,provenance:{record:structuredClone(record),hoardCreation:hoard?.creation??reward!.creation}}
}
export function valuableResaleProvenanceMatches(state:GameState,item:Item,provenance:z.infer<typeof ValuableResaleProvenanceSchema>){
 const actual=registeredValuableResaleProfile(state,item)
 return Boolean(actual&&witness(actual.provenance)===witness(provenance))
}
