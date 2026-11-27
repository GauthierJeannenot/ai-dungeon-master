import { z } from 'zod'
import type { GameState,Item } from './types'
import { CoinsSchema,copperValue } from './srd/currency'
import { getSpell } from './srd/spells'
import { spellRules } from './srd/hero-spells'
const Id=z.string().min(1).max(180).refine(id=>!['constructor','prototype','__proto__'].includes(id))
const EventId=z.string().min(1).max(80).regex(/^[a-zA-Z0-9][a-zA-Z0-9_:.-]*$/)
export const SpellbookEventIdSchema=EventId
const Source=z.string().trim().min(1).max(1000)
export const CopyMaterialsSchema=z.discriminatedUnion('mode',[
  z.object({mode:z.literal('paid_supply'),providedAndConsumedConfirmed:z.literal(true),source:Source}).strict(),
  z.object({mode:z.literal('owned_batch'),itemId:Id,declaredValueCp:z.number().int().positive().max(1000000000),actualCopyMaterialsConfirmed:z.literal(true),source:Source}).strict(),
])
export const RegisterSpellbookSchema=z.object({eventId:EventId,itemId:Id,kind:z.enum(['personal','foreign','blank']),actualBookConfirmed:z.literal(true),
  personalNotationConfirmed:z.literal(true).optional(),blankConfirmed:z.literal(true).optional(),source:Source}).strict().superRefine((input,ctx)=>{
  if(input.kind==='personal'&&!input.personalNotationConfirmed)ctx.addIssue({code:'custom',message:'Personal notation is a real initial physical fact, never inferred from ownership or the book name.'})
  if(input.kind==='blank'&&!input.blankConfirmed)ctx.addIssue({code:'custom',message:'An undefined item content list is unknown, not proof that a real book is blank.'})
})
export const SpellbookLossSchema=z.object({eventId:EventId,itemId:Id,actualLossConfirmed:z.literal(true),source:Source}).strict()
export const PersonalSpellCopySchema=z.object({eventId:EventId,mode:z.enum(['backup','replacement']),spellId:Id,destinationBookId:Id,
  sourceBookId:Id.optional(),lostBookId:Id.optional(),paid:CoinsSchema,materials:CopyMaterialsSchema,
  workSeconds:z.number().int().positive().max(64800).optional(),restActivity:z.enum(['light','strenuous']),activitySource:Source}).strict().superRefine((input,ctx)=>{
  if(input.mode==='backup'&&(!input.sourceBookId||input.lostBookId)||input.mode==='replacement'&&(!input.lostBookId||input.sourceBookId))
    ctx.addIssue({code:'custom',message:'Choose the exact actual personal source for a backup, or the exact genuinely lost book for a prepared-spell replacement.'})
})
const Book=z.object({itemId:Id,personalNotation:z.boolean(),spellIds:z.array(Id).max(512),declaredAt:z.number().nonnegative(),source:Source,
  initialItem:z.record(z.string(),z.unknown()),legacy:z.boolean(),provenance:z.enum(['owned_item','dropped_item','character_template']).optional(),historicalIdentityOnly:z.literal(true).optional()}).strict()
const Loss=z.object({itemId:Id,eventId:EventId,at:z.number().nonnegative(),source:Source,physicalWitness:z.record(z.string(),z.unknown())}).strict()
const Segment=z.object({eventId:EventId,from:z.number().nonnegative(),to:z.number().nonnegative(),mapId:Id,
  cell:z.object({x:z.number().int(),y:z.number().int()}).strict(),activity:z.enum(['light','strenuous']),source:Source}).strict()
const Job=z.object({jobId:EventId,mode:z.enum(['ordinary','backup','replacement','scroll']),spellId:Id,destinationBookId:Id,
  sourceItemId:Id.optional(),lostBookId:Id.optional(),createdAt:z.number().nonnegative(),requiredSeconds:z.number().int().positive(),
  workedSeconds:z.number().int().nonnegative(),costCp:z.number().int().positive(),savant:z.boolean(),paid:CoinsSchema,
  materials:CopyMaterialsSchema,materialItemSnapshot:z.record(z.string(),z.unknown()).optional(),
  status:z.enum(['working','awaiting_completion','held_scroll','completed']),segments:z.array(Segment).max(1024),result:z.record(z.string(),z.unknown()).optional()}).strict()
export const SpellbooksStateSchema=z.object({version:z.literal(1),books:z.record(z.string(),Book),losses:z.record(z.string(),Loss),
  jobs:z.record(z.string(),Job),
  materials:z.record(z.string(),z.object({itemId:Id,initialValueCp:z.number().int().positive(),remainingValueCp:z.number().int().nonnegative(),
    establishedAt:z.number().nonnegative(),source:Source,itemSnapshot:z.record(z.string(),z.unknown())}).strict()),
  receipts:z.record(z.string(),z.object({command:z.string(),result:z.record(z.string(),z.unknown())}).strict())}).strict().superRefine((state,ctx)=>{
  if(Object.keys(state.books).length>128||Object.keys(state.losses).length>128||Object.keys(state.jobs).length>512||Object.keys(state.materials).length>512||Object.keys(state.receipts).length>2048)ctx.addIssue({code:'custom',message:'Real book identities, losses and copying receipts are retained and bounded, never evicted by another nonce.'})
  for(const[id,material]of Object.entries(state.materials))if(id!==material.itemId||material.remainingValueCp>material.initialValueCp)ctx.addIssue({code:'custom',message:'One actual acquired material stock keeps its spent remainder; another declaration cannot refill it.'})
  for(const[id,book]of Object.entries(state.books))if(id!==book.itemId||new Set(book.spellIds).size!==book.spellIds.length)ctx.addIssue({code:'custom',message:'A physical book has one stable identity and distinct actual contents.'})
  for(const book of Object.values(state.books))if(book.historicalIdentityOnly&&(book.provenance!=='character_template'||book.spellIds.length))ctx.addIssue({code:'custom',message:'A legacy template tombstone retains identity only, never a physical volume or restored former contents.'})
  for(const[id,loss]of Object.entries(state.losses))if(id!==loss.itemId||!state.books[id])ctx.addIssue({code:'custom',message:'A lost book retains its actual previously established physical identity.'})
  for(const[id,job]of Object.entries(state.jobs)){
    const spell=getSpell(job.spellId),personal=job.mode==='backup'||job.mode==='replacement',discount=job.savant?0.5:1
    if(!spell||spell.level===0||job.savant&&spellRules(job.spellId).school.index!=='evocation'
      ||job.requiredSeconds!==spell.level*(personal?3600:7200)*discount||job.costCp!==spell.level*(personal?1000:5000)*discount
      ||copperValue(job.paid)!==(job.materials.mode==='paid_supply'?job.costCp:0))
      ctx.addIssue({code:'custom',message:'Actual copy time, once-paid materials and canonical coins retain the printed source tariff and real Savant discount.'})
    if(id!==job.jobId||!state.books[job.destinationBookId]||job.workedSeconds>job.requiredSeconds
      ||job.workedSeconds!==job.segments.reduce((sum,segment)=>sum+segment.to-segment.from,0)
      ||job.status==='working'&&job.workedSeconds===job.requiredSeconds||job.status!=='working'&&job.workedSeconds!==job.requiredSeconds
      ||(job.status==='completed')!==Boolean(job.result)||job.segments.some(segment=>segment.to<=segment.from))
      ctx.addIssue({code:'custom',message:'One real copying job retains its actual measured work, destination, completion and result; a pause never resets its time or payment.'})
  }
})
export type SpellbooksState=z.infer<typeof SpellbooksStateSchema>
export type CopyMaterials=z.infer<typeof CopyMaterialsSchema>
export type RegisterSpellbookInput=z.infer<typeof RegisterSpellbookSchema>
export type PersonalSpellCopyInput=z.infer<typeof PersonalSpellCopySchema>
export const spellbooksStateOf=(state:GameState):SpellbooksState|undefined=>state.dmTools?.spellbooks
/** Legacy knowledge is grounded in an actual owned original book. Missing item
 * never materializes a replacement from the character's old spell array. */
export function ownedPersonalSpellbooks(state:GameState){
  const ledger=spellbooksStateOf(state),result:Array<{itemId:string;spellIds:string[];legacy:boolean}>=[]
  for(const item of state.player.inventory){
    const known=ledger?.books[item.id]
    if(known?.personalNotation)result.push({itemId:item.id,spellIds:[...known.spellIds],legacy:known.legacy})
    else if(!known&&item.id==='spellbook'&&state.player.characterId==='wizard'&&state.player.spellbook)
      result.push({itemId:item.id,spellIds:[...(item.spellIds??state.player.spellbook)],legacy:true})
  }
  return result
}
export function validateSpellbooksState(state:GameState){
  const ledger=spellbooksStateOf(state);if(!ledger)return []
  const errors:string[]=[],at=state.worldTimeSeconds??0
  for(const book of Object.values(ledger.books)){
    const item:Item|undefined=state.player.inventory.find(item=>item.id===book.itemId)??state.droppedItems?.[book.itemId]?.item
    if(book.declaredAt>at)errors.push('A real book cannot be established in the future.')
    if(item&&(item.type!=='misc'||item.magical||JSON.stringify(item.spellIds??[])!==JSON.stringify(book.spellIds)))errors.push('The actual physical book contents must agree with its retained identity; copying cannot mutate another book or restore lost spells.')
  }
  for(const loss of Object.values(ledger.losses))if(loss.at>at)errors.push('A real book loss cannot be recorded in the future.')
  for(const material of Object.values(ledger.materials))if(material.establishedAt>at||material.remainingValueCp!==material.initialValueCp-Object.values(ledger.jobs).filter(job=>job.materials.mode==='owned_batch'&&job.materials.itemId===material.itemId).reduce((sum,job)=>sum+job.costCp,0))errors.push('The real material remainder requires exactly its original acquired value less actual once-paid copying jobs.')
  for(const job of Object.values(ledger.jobs)){
    if(job.createdAt>at||job.segments.some(segment=>segment.to>at||segment.from<job.createdAt))errors.push('Copying progress requires actual elapsed segments, never future or reconstructed work.')
    if(job.status==='held_scroll'){
      const held=state.hero?.pending?.command.toolkitResolution as {domain?:string;command?:{jobId?:string;skill?:string}}|undefined
      if(held?.domain!=='spellbook-scroll-copy'||held.command?.jobId!==job.jobId||held.command?.skill!=='arcana')errors.push('A held scroll-copy check retains its exact original real work and Arcana die.')
    }
  }
  const actual=[...new Set(ownedPersonalSpellbooks(state).flatMap(book=>book.spellIds))]
  if(JSON.stringify(state.player.spellbook??[])!==JSON.stringify(actual))errors.push('Wizard book availability is the union of real personally written books currently owned, not lost global spell knowledge.')
  return errors
}
