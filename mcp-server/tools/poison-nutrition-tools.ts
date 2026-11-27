import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp'
import { z } from 'zod'
import { poisonNutritionStateOf } from '../../lib/poison-nutrition-state'
import { adjudicatePoisonPortion } from '../poison-nutrition'
import { registerPoisonNutritionConsumption } from '../poison-nutrition-consumption'
import { toolkitTransaction,toolkitResult } from '../toolkit'
import * as gs from '../game-state'
const EventId=z.string().min(1).max(80).regex(/^[a-zA-Z0-9][a-zA-Z0-9_:.-]*$/).refine(value=>!['constructor','prototype','__proto__'].includes(value))
const Id=z.string().min(1).max(180).refine(value=>!['constructor','prototype','__proto__'].includes(value))
export function registerPoisonNutritionTools(server:McpServer){
 registerPoisonNutritionConsumption()
 server.registerTool('inspect_poison_nutrition',{description:'Confidential MJ read-only exact whole ingested doses tied to actual quantified food/water and retained portion-disposition rulings. No food, water, portion, dose, dilution, purification or ingestion is created.',inputSchema:{},annotations:{readOnlyHint:true,idempotentHint:true}},async()=>toolkitTransaction(()=>toolkitResult({state:poisonNutritionStateOf(gs.getState())??null,units:{food:'actual half-pounds',water:'actual quarter-pints'},partialPotencyImplemented:false})))
 server.registerTool('adjudicate_poison_portion',{
  description:'Explicit MJ recorded physical ruling BEFORE one exact future consume_provisions or transfer_water operation: the ENTIRE original real poison dose is in its selected actual portion OR remains in its real remainder. Requires an actual scene fact, exact current quantity and operation ID; grants no portion, food, water, recipient or dose. SelectedUnits are half-pounds for food, quarter-pints for water. It never assumes homogeneous mixture, fractional potency/proportional damage or uniform distribution. If the whole dose is actually distributed between both portions, this first whole-dose procedure must refuse instead of inventing its effects. Ruling is bookkeeping only, no action/time; the actual consuming/transferring tool still pays its original operation.',
  inputSchema:{eventId:EventId,preparationId:Id,operation:z.enum(['consume','transfer']),operationEventId:EventId,sourceItemId:Id,targetItemId:Id.optional(),selectedUnits:z.number().int().positive().max(100000000),disposition:z.enum(['selected_portion','remainder']),physicalFactId:Id,wholeDoseDispositionConfirmed:z.literal(true),source:z.string().trim().min(1).max(1000)},
 },async input=>toolkitTransaction(()=>toolkitResult(adjudicatePoisonPortion(input))))
}
