import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { ForageInputSchema, WaterContainerInputSchema, CollectForageInputSchema } from '../../lib/foraging-state'
import { inspectForaging, resolveForaging, registerWaterContainer, collectForage, registerForagingContinuations } from '../foraging'
import { toolkitResult, toolkitTransaction } from '../toolkit'
export function registerForagingTools(server:McpServer){
  registerForagingContinuations()
  server.registerTool('inspect_foraging',{
    description:'Read actual retained forage attempts/yields, collected food and exact owned-container contents/capacities. Found resources are not automatically acquired or consumed. No check, food, vessel, water, purification, location or time is invented.',
    inputSchema:{attemptId:z.string().min(1).max(160).optional()},annotations:{readOnlyHint:true,idempotentHint:true},
  },async({attemptId})=>toolkitTransaction(()=>toolkitResult(inspectForaging(attemptId))))
  server.registerTool('resolve_foraging',{
    description:'Explicit MJ-called DMG2014 Wisdom(Survival) forage check on selected ACTUAL contiguous advance_travel receipts performed as forage at normal/slow pace. Source abundance sets DC10/15/20. Each real interval has one attempt globally; new IDs never reroll it. No printed fixed duration/frequency is invented. Held check retains its dice and grants nothing before final success. Success rolls TWO distinct1d6+actualWisdomModifier: food pounds, then water gallons; negative physical amounts clamp to0 as declared engine interpretation. Finds reserved resources at the exact observed point; no inventory, container, consumption or clean-water certificate is granted. Optional hazardFactIds preserve explicitly selected ACTUAL established hazards; no danger/detection is inferred.',
    inputSchema:ForageInputSchema.shape,
  },async input=>toolkitTransaction(()=>resolveForaging(input)))
  server.registerTool('register_water_container',{
    description:'ONE initial MJ establishment of an exact actually-owned liquid-container instance: actual declared physical type/source, explicit current contents in QUARTER-PINTS, actual measured dry mass and measured water mass per pint. Published PHB capacity selected by physical type (barrel/bottle/bucket/flask/tankard/jug/pitcher/iron pot/vial/waterskin). No empty vessel, water, earlier fill, inferred capacity from a name or inferred empty mass from a full weight. Already-consumed legacy waterskin quantities must agree exactly and remain witnessed. Another event ID cannot refill/reinitialize the same container. Optional actual hazard fact IDs are retained; ordinary water needs no invented purity certificate.',
    inputSchema:WaterContainerInputSchema.shape,
  },async input=>toolkitTransaction(()=>toolkitResult(registerWaterContainer(input))))
  server.registerTool('collect_forage',{
    description:'Acquire an explicitly selected amount of an ACTUAL final forage yield at its SAME observed map/cell/shared walking point, before any subsequent travel. foodHalfPounds becomes one real quantified consumable food instance; it is earned food, no bag/equipment. Water transfers in QUARTER-PINTS fill only exact actually-owned registered containers within actual remaining capacity. Two source yields/stock never reroll; partial collection and immutable receipts persist. Project actual future food+water mass against standard carrying BEFORE any ownership/content debit. No new vessel, remote collection, immediate intake, purification, food debt reset, money or time is invented; consume_provisions separately consumes the actual collected amount.',
    inputSchema:CollectForageInputSchema.shape,
  },async input=>toolkitTransaction(()=>toolkitResult(collectForage(input))))
}
