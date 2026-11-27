import { z } from 'zod'
import type { GameState } from './types'
import { getMapSpec } from './adventure-map'

const Id=z.string().min(1).max(100).refine(id=>!['constructor','prototype','__proto__'].includes(id))
export const CampaignEncounterTableInputSchema=z.object({
 tableId:Id.refine(id=>id.startsWith('campaign:'),'A campaign table has an explicit campaign: identity.'),
 title:z.string().trim().min(1).max(160),theme:z.string().trim().min(1).max(1000),
 scope:z.discriminatedUnion('kind',[
  z.object({kind:z.literal('adventure')}).strict(),
  z.object({kind:z.literal('map'),mapId:Id}).strict(),
 ]),
 dice:z.array(z.union([z.literal(4),z.literal(6),z.literal(8),z.literal(10),z.literal(12),z.literal(20),z.literal(100)])).min(1).max(4),
 entries:z.array(z.object({rowId:Id,low:z.number().int().positive(),high:z.number().int().positive(),text:z.string().trim().min(1).max(1500)}).strict()).min(1).max(64),
}).strict().superRefine((input,ctx)=>{
 const minimum=input.dice.length,maximum=input.dice.reduce((n,d)=>n+d,0)
 if(new Set(input.entries.map(row=>row.rowId)).size!==input.entries.length
  ||input.entries.some(row=>row.low<minimum||row.high>maximum||row.high<row.low)
  ||Array.from({length:maximum-minimum+1},(_,i)=>i+minimum).some(value=>input.entries.filter(row=>row.low<=value&&value<=row.high).length!==1))
  ctx.addIssue({code:'custom',message:'Retain distinct row identities and exactly one explicit entry for every possible actual dice sum; no gap, overlap or invented weight.'})
})
export type CampaignEncounterTableInput=z.infer<typeof CampaignEncounterTableInputSchema>
export function campaignEncounterTableCommand(input:CampaignEncounterTableInput){
 return JSON.stringify([input.tableId,input.title,input.theme,input.scope.kind,input.scope.kind==='map'?input.scope.mapId:null,input.dice,
  input.entries.map(row=>[row.rowId,row.low,row.high,row.text])])
}
const RecordSchema=z.object({input:CampaignEncounterTableInputSchema,command:z.string(),adventureId:Id,authoredAt:z.number().nonnegative()}).strict()
export const CampaignEncounterTablesSchema=z.record(z.string(),RecordSchema).superRefine((tables,ctx)=>{
 if(Object.keys(tables).length>64)ctx.addIssue({code:'custom',message:'The actual authored table registry is bounded; immutable tables are never silently replaced or evicted.'})
 for(const[id,table]of Object.entries(tables))if(id!==table.input.tableId||table.command!==campaignEncounterTableCommand(table.input))
  ctx.addIssue({code:'custom',message:'Retain the exact original authored table identity, entries, dice, theme and scope.'})
})
export function campaignEncounterTableStateIssues(state:GameState,expectedAdventureId:string){
 const tables=state.dmTools?.randomEncounterTables;if(!tables)return[]
 if(!CampaignEncounterTablesSchema.safeParse(tables).success)return['Invalid immutable campaign encounter tables.']
 if(Object.values(tables).some(table=>table.input.scope.kind==='map'&&getMapSpec(table.input.scope.mapId,{...state,adventureId:expectedAdventureId}).id!==table.input.scope.mapId))
  return['An authored table scope requires its actual existing map in the same adventure.']
 return Object.values(tables).some(table=>table.adventureId!==expectedAdventureId||table.authoredAt>(state.worldTimeSeconds??0))
  ?['A campaign table cannot belong to another adventure or a future clock.']:[]
}
