import { AdamantineWitnessSchema } from './adamantine-witness'
import { z } from 'zod'
import { AMMUNITION_TYPES } from './srd/ammunition'
import type { GameState } from './types'
import { BasicPoisonWitnessSchema } from './basic-poison-state'
import { PlayerPoisonWitnessSchema } from './player-poison-state'

const Id = z.string().min(1).max(160)
const Cell = z.object({ x:z.number().int().nonnegative(), y:z.number().int().nonnegative() }).strict()
export const AmmunitionTypeSchema = z.enum(AMMUNITION_TYPES)
export const AmmunitionExpenditureSchema = z.object({
  attackId:Id, scopeId:Id, weaponItemId:Id, ammunitionItemId:Id, ammunitionType:AmmunitionTypeSchema,
  combatGeneration:z.number().int().nonnegative(), mapId:Id, roomId:Id,
  inCombat:z.literal(true).optional(), // Absent old/exploration receipts never prove a battle.
  silvered:z.literal(true).optional(),adamantine:AdamantineWitnessSchema.optional(),loadedHostItemId:Id.optional(),
  basicPoison:BasicPoisonWitnessSchema.optional(),
  playerPoison:PlayerPoisonWitnessSchema.optional(),
  shooterCell:Cell, targetCell:Cell, worldTimeSeconds:z.number().nonnegative(),
}).strict()
export const AmmunitionRecoverySchema = z.object({
  adamantineUnits:z.array(z.object({attackId:Id,itemId:Id}).strict()).max(256).optional(),
  recoveryId:Id, creation:z.string().max(20000), combatGeneration:z.number().int().nonnegative(),
  ammunitionType:AmmunitionTypeSchema.optional(), mapId:Id, roomId:Id,
  attackIds:z.array(Id).min(1), expendedQuantity:z.number().int().positive(), recoveredQuantity:z.number().int().nonnegative(),
  startedAt:z.number().nonnegative(), completedAt:z.number().nonnegative(), itemId:Id.optional(),
  composition:z.enum(['single_type_deterministic','explicit_mj_allocation']).optional(),
  allocations:z.array(z.object({ammunitionType:AmmunitionTypeSchema,expendedQuantity:z.number().int().positive(),
    recoveredQuantity:z.number().int().nonnegative(),itemId:Id.optional(),silveredQuantity:z.number().int().nonnegative().optional(),silveredItemId:Id.optional()}).strict()).min(1).max(4).optional(),
  interpretation:z.string().max(1000).optional(),
  searchId:Id.optional(), searchSeconds:z.number().int().min(60).max(60).optional(),
  poisonedUnits:z.array(z.object({attackId:Id,itemId:Id,preparationId:z.string().min(1).max(180)}).strict()).max(256).optional(),
  searchInterpretation:z.string().max(1000).optional(),
}).strict()
export const AmmunitionSearchMarkSchema=z.object({
  eventId:Id,creation:z.string().max(1000),mapId:Id,roomId:Id,cell:Cell,
  seconds:z.number().int().min(1).max(60),startedAt:z.number().nonnegative(),completedAt:z.number().nonnegative(),
}).strict()
export const AmmunitionSearchSchema=z.object({
  searchId:Id,creation:z.string().max(1000),combatGeneration:z.number().int().positive(),
  combatGenerationAtStart:z.number().int().nonnegative(),mapId:Id,requiredRoomIds:z.array(Id).min(1),
  expenditures:z.array(AmmunitionExpenditureSchema).min(1),startedAt:z.number().nonnegative(),
  status:z.enum(['active','interrupted','completed']),elapsedSeconds:z.number().int().min(0).max(60),
  marks:z.record(z.string(),AmmunitionSearchMarkSchema),markOrder:z.array(Id).max(60),
  interrupted:z.object({reason:z.enum(['combat_started','map_changed']),at:z.number().nonnegative()}).strict().optional(),
  completedByRecoveryId:Id.optional(),
}).strict()
export const AmmunitionStateSchema = z.object({
  version:z.literal(1),
  // Immutable authoring witness survives pickup, depletion and dropping.
  prepared:z.record(z.string(),z.object({ itemId:Id, creation:z.string().max(3000) }).strict()),
  // One receipt for one real d20, including a miss or a held reaction.
  expenditures:z.record(z.string(),AmmunitionExpenditureSchema),
  recoveries:z.record(z.string(),AmmunitionRecoverySchema).optional(),
  searches:z.record(z.string(),AmmunitionSearchSchema).optional(),
}).strict()
export type AmmunitionState = z.infer<typeof AmmunitionStateSchema>
export type AmmunitionExpenditure = z.infer<typeof AmmunitionExpenditureSchema>
export type AmmunitionRecovery = z.infer<typeof AmmunitionRecoverySchema>
export type AmmunitionSearch = z.infer<typeof AmmunitionSearchSchema>
export const initialAmmunitionState = ():AmmunitionState => ({version:1,prepared:{},expenditures:{}})
/** The actual engine transition interrupts bookkeeping only. It never blocks
 * travel/combat, refunds past search time or rewrites the visited checkpoints. */
export function interruptAmmunitionSearches(state:Pick<GameState,'dmTools'|'worldTimeSeconds'>,reason:'combat_started'|'map_changed') {
  for(const search of Object.values(state.dmTools?.ammunition?.searches??{}))if(search.status==='active') {
    search.status='interrupted';search.interrupted={reason,at:state.worldTimeSeconds??0}
  }
}
