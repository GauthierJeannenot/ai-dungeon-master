import { z } from 'zod'
import { AdventureRewardSourceSchema } from './adventure-reward-state'
import { CoinsSchema } from './srd/currency'

const cell=z.object({x:z.number().int().nonnegative(),y:z.number().int().nonnegative()}).strict()
export const TreasureSourceSchema=z.object({book:z.literal('dmg-2014'),tableId:z.string(),sha256:z.string(),startLine:z.number().int(),endLine:z.number().int()}).strict()
const roll=z.object({notation:z.string(),rolls:z.array(z.number()),modifier:z.number(),total:z.number(),detail:z.string()}).strict()
export const ValuableRecordSchema=z.object({id:z.string().min(1).max(80),hoardId:z.string().min(1).max(60).optional(),rewardId:z.string().min(1).max(80).optional(),kind:z.enum(['gem','art','collection']),
  name:z.string().min(1).max(700),valueGp:z.number().int().positive().max(7500),source:z.union([TreasureSourceSchema,AdventureRewardSourceSchema])}).strict().refine(v=>v.rewardId?!v.hoardId&&'chapter'in v.source:Boolean(v.hoardId)&&'tableId'in v.source&&v.source.book==='dmg-2014'&&v.kind!=='collection','A valuable has exactly its real hoard or authored chapter provenance.')
export const HoardRecordSchema=z.object({id:z.string().min(1).max(60),name:z.string().min(1).max(80),description:z.string().min(1).max(600),
  mapId:z.string(),roomId:z.string(),cell,containerId:z.string().optional(),challengeBand:z.enum(['0-4','5-10','11-16','17+']),
  coins:CoinsSchema,valuableIds:z.array(z.string()).max(18),collected:z.boolean(),creation:z.string(),source:TreasureSourceSchema,
  coinSource:TreasureSourceSchema,rolls:z.array(roll).max(40),
  magicDraws:z.array(z.object({count:z.number().int().min(1).max(8),source:TreasureSourceSchema,instruction:z.string().max(200)}).strict()).max(2),
}).strict()
export type HoardRecord=z.infer<typeof HoardRecordSchema>
export type ValuableRecord=z.infer<typeof ValuableRecordSchema>
