import { CackleDiseaseSchema } from './cackle-fever-state'
import { z } from 'zod'
import { HeroEffectSchema } from './hero-state'
import type { GameState } from './types'
export const AFFLICTION_IDS=['assassins_blood','burnt_othur_fumes','carrion_crawler_mucus','drow_poison','essence_of_ether','malice','midnight_tears','oil_of_taggit','pale_tincture','purple_worm_poison','serpent_venom','torpor','truth_serum','wyvern_poison','sight_rot','sewer_plague','cackle_fever'] as const
export const AfflictionSourceSchema=z.object({id:z.string(),templateId:z.enum(AFFLICTION_IDS),name:z.string(),mapId:z.string(),roomId:z.string(),cell:z.object({x:z.number().int().nonnegative(),y:z.number().int().nonnegative()}).strict(),doses:z.number().int().nonnegative(),creation:z.string()}).strict()
const PetrificationPauseSchema=z.object({pausedAt:z.number().nonnegative(),effects:z.array(HeroEffectSchema).max(16)}).strict()
const SewerPlagueSaveSchema = z.object({
 success: z.boolean(),
 roll: z.object({ notation: z.string(), rolls: z.array(z.number()), modifier: z.number(), total: z.number(), detail: z.string() }).strict(),
 exhaustionEventId: z.string().optional(),
 recovered: z.boolean(),
}).strict()
export const SewerPlagueRestEventSchema = z.object({
 restId: z.string().min(1).max(80), completedAt: z.number().int().nonnegative(),
 exhaustionBeforeSave: z.number().int().min(0).max(5), chaseBeforeSave: z.number().int().min(0).max(5),
 removalSource: z.enum(['chase','other']).optional(), heldWitness: z.string().optional(),
 result: SewerPlagueSaveSchema.optional(),
}).strict()
const SewerPlagueSchema = z.object({
 incubationDays: z.number().int().min(1).max(4),
 onset: z.object({ dueAt: z.number().int().nonnegative(), resolvedAt: z.number().int().nonnegative(), exhaustionEventId: z.string() }).strict().optional(),
 restEvents: z.record(z.string(), SewerPlagueRestEventSchema),
}).strict()
export type SewerPlagueRestEvent = z.infer<typeof SewerPlagueRestEventSchema>
export const AfflictionRecordSchema=z.object({id:z.string(),sourceId:z.string(),sourceActorId:z.string().optional(),targetId:z.string(),templateId:z.enum(AFFLICTION_IDS),eventId:z.string(),creation:z.string(),status:z.enum(['pending','active','ended','cured']),appliedAt:z.number().nonnegative(),nextAt:z.number().nonnegative().optional(),expiresAt:z.number().nonnegative().optional(),successes:z.number().int().nonnegative(),lastTurn:z.number().int(),turnContext:z.object({phase:z.enum(['exploration','combat','dialogue']),combatGeneration:z.number().int().nonnegative().optional()}).strict().optional(),unhealableDamage:z.number().nonnegative(),relaxationHealingRelease:z.object({weekId:z.string(),eventId:z.string(),at:z.number().int().nonnegative()}).strict().optional(),sightPenalty:z.number().int().min(0).max(5),ointmentDoses:z.number().int().min(0).max(3),ointmentPending:z.boolean(),sewerPlague:SewerPlagueSchema.optional(),cackleFever:CackleDiseaseSchema.optional(),petrificationPause:PetrificationPauseSchema.optional()}).strict().superRefine((r,ctx)=>{
 if(r.templateId==='cackle_fever'?!r.cackleFever:r.cackleFever!==undefined)ctx.addIssue({code:'custom',message:'Only the actual Cackle Fever record owns its exact disease progression.'})
 if (r.relaxationHealingRelease && (r.templateId !== 'pale_tincture' || r.targetId !== 'player' || r.unhealableDamage !== 0))
  ctx.addIssue({code:'custom',message:'A Relaxation release belongs to the exact Pale Tincture dose and leaves its damage healable.'})
 if (r.templateId === 'sewer_plague') {
  if (r.targetId !== 'player' || r.sourceActorId || r.status === 'active' && !r.sewerPlague) ctx.addIssue({code:'custom',message:'Sewer Plague requires its actual player contact source and saved infection history.'})
  if (r.sewerPlague) {
   const data = r.sewerPlague
   const earliestOnset = r.appliedAt + data.incubationDays * 86400
   if (r.status === 'active' && !data.onset && r.nextAt === undefined || data.onset && r.nextAt !== undefined || r.nextAt !== undefined && r.nextAt < earliestOnset) ctx.addIssue({code:'custom',message:'Sewer Plague onset and incubation must retain their real source clock.'})
   if (data.onset && (data.onset.dueAt < earliestOnset || data.onset.resolvedAt < data.onset.dueAt)) ctx.addIssue({code:'custom',message:'Sewer Plague symptoms cannot precede the retained incubation.'})
   if (Object.keys(data.restEvents).length > 128) ctx.addIssue({code:'custom',message:'Sewer Plague requires bounded actual rest history.'})
   for (const [restId,event] of Object.entries(data.restEvents)) {
    if (restId !== event.restId || event.completedAt < r.appliedAt || event.chaseBeforeSave > event.exhaustionBeforeSave || event.result && event.heldWitness) ctx.addIssue({code:'custom',message:'Sewer Plague rest save must retain its exact rest and original outcome.'})
   }
  }
 } else if (r.sewerPlague) ctx.addIssue({code:'custom',message:'Sewer Plague history belongs to its exact disease.'})
 if(r.petrificationPause){
  if(!['pending','active'].includes(r.status))ctx.addIssue({code:'custom',message:'Only an extant poison or disease may be suspended.'})
  const ids=new Set<string>();for(const effect of r.petrificationPause.effects){
   if(ids.has(effect.id)||effect.data.afflictionId!==r.id||!effect.targetIds.includes(r.targetId))ctx.addIssue({code:'custom',message:'Suspended effects must be distinct and belong to this exact affliction and target.'})
   ids.add(effect.id)
  }
 }
})
export const AfflictionStateSchema=z.object({sources:z.record(z.string(),AfflictionSourceSchema),records:z.record(z.string(),AfflictionRecordSchema),ointments:z.record(z.string(),z.object({creation:z.string(),consumed:z.boolean()}).strict())}).strict().superRefine((state,ctx)=>{
 const effectIds=new Set<string>();for(const record of Object.values(state.records))for(const effect of record.petrificationPause?.effects??[]){
  if(effectIds.has(effect.id))ctx.addIssue({code:'custom',message:'Suspended affliction effect IDs cannot be duplicated across records.'})
  effectIds.add(effect.id)
 }
})
export type AfflictionRecord=z.infer<typeof AfflictionRecordSchema>

/** Exact incubation boundary eligible within a real clock step. */
export function sewerPlagueIncubationBoundary(state: GameState, until: number) {
 if (state.player.deathSaves?.dead) return undefined
 return Object.values(state.dmTools?.afflictions?.records ?? {}).find(record =>
  record.templateId === 'sewer_plague' && record.status === 'active' && !record.petrificationPause
  && record.nextAt !== undefined && record.nextAt <= until)
}
export function afflictionSightPenalty(state: {dmTools?:{afflictions?:z.infer<typeof AfflictionStateSchema>}},id:string){return Math.max(0,...Object.values(state.dmTools?.afflictions?.records??{}).filter(r=>r.targetId===id&&r.status==='active'&&!r.petrificationPause).map(r=>r.sightPenalty))}
