import { z } from 'zod'

export const WeaponConsumableIdSchema = z.enum(['acid_vial', 'holy_water_flask', 'alchemists_fire_flask'])
export type WeaponConsumableId = z.infer<typeof WeaponConsumableIdSchema>
export const WeaponConsumableStateSchema = z.object({
  receipts: z.record(z.string(), z.object({ command: z.string(), result: z.record(z.string(), z.unknown()) }).strict()),
  turnReceipts:z.record(z.string(),z.object({eventId:z.string(),entityId:z.string(),useId:z.string(),at:z.number().nonnegative(),result:z.record(z.string(),z.unknown())}).strict()).optional(),
  burning: z.record(z.string(), z.object({
    targetId: z.string(), sourceId: z.string(), itemId: z.string(), useId: z.string(),
    startedAt: z.number().nonnegative(), lastTurn: z.string().optional(),
  }).strict()),
}).strict()
export type WeaponConsumableState = z.infer<typeof WeaponConsumableStateSchema>

/** Local view permits staged engine integration without widening GameState. */
export interface WeaponConsumableHolder { dmTools?: { weaponConsumables?: WeaponConsumableState } }

export function pendingStartTurnFire(state:import('./types').GameState){
 const id=state.currentTurn;if(state.phase!=='combat'||!id)return undefined
 const fire=state.dmTools?.weaponConsumables?.burning[id],actor=id==='player'?state.player:state.monsters[id]??state.npcs?.[id]
 if(!fire||!actor||(id==='player'?Boolean(state.player.deathSaves?.dead):'isAlive'in actor&&actor.isAlive===false))return undefined
 const eventId=`${state.combatGeneration??0}:${state.turnCounter??0}:${id}`
 return fire.lastTurn===eventId?undefined:{eventId,entityId:id,useId:fire.useId,sourceId:fire.sourceId}
}
export function startTurnFireDueIssue(state:import('./types').GameState){const event=pendingStartTurnFire(state);return event?{code:'START_TURN_FIRE_DUE',message:'Resolve the exact already opened creature start-turn alchemist fire before another action, movement or turn; no initiative, time or budget is replayed.',...event}:null}
