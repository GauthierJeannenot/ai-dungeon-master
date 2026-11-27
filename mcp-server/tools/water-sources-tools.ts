import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { EstablishWaterSourceSchema, FillWaterContainerSchema, TransferWaterSchema } from '../../lib/water-sources-state'
import { inspectWaterSources, establishWaterSource, fillWaterContainer, transferWater } from '../water-sources'
import { toolkitResult, toolkitTransaction } from '../toolkit'
export function registerWaterSourcesTools(server:McpServer){
  server.registerTool('inspect_water_sources',{
    description:'Read canonical actual situated source identities, finite water remaining or explicit MJ permanence, and registered real-container contents. No source, water, vessel, purification, detection, action, time or location is created.',
    inputSchema:{objectId:z.string().min(1).max(160).optional()},annotations:{readOnlyHint:true,idempotentHint:true},
  },async({objectId})=>toolkitTransaction(()=>toolkitResult(inspectWaterSources(objectId))))
  server.registerTool('establish_water_source',{
    description:'ONE MJ establishment of an ACTUAL existing intact source scene object on the active map, with exact existing resource fact/provenance. Finite sources require their actual current quarter-pint quantity; permanent sources require explicit MJ confirmation, never a nonce refill. Canonical identity is the actual object creation and resource fact; another ID cannot duplicate/reset it. Actual measured water mass per pint and existing hazard fact IDs are retained; no purity certificate or automatic detection. Source stays at its observed actual map/cell; no archived source/object, water or container is created or teleported.',
    inputSchema:EstablishWaterSourceSchema,
  },async input=>toolkitTransaction(()=>toolkitResult(establishWaterSource(input))))
  server.registerTool('fill_water_container',{
    description:'Draw an explicit positive QUARTER-PINT amount from the exact actual established situated source into one actual registered container owned or really deposited within unobstructed reach. Source must be intact/open/unlocked and at its actual observed point. Check stock, remaining capacity, actual compatible measured masses, hands and future carrying BEFORE cost/time/water mutation. handsRequired and objectsManipulated describe the explicit physical MJ ruling; already-held selected containers count once, no weapon is dropped. Two object manipulations in combat require action; seconds MUST0 in combat and actual action/interaction is spent, longer multi-turn work unsupported. Outside combat seconds>0 is explicitly adjudicated (no printed universal filling duration); restActivity light/strenuous is the MJ activity ruling. All clock/rest/hazard gates precede costs. Immutable receipt replays no fill/cost/time. No new vessel, nonce refill, intake, purification or hazard removal.',
    inputSchema:FillWaterContainerSchema.shape,
  },async input=>toolkitTransaction(()=>toolkitResult(fillWaterContainer(input))))
  server.registerTool('transfer_water',{
    description:'Pour an explicitly chosen positive QUARTER-PINT quantity between TWO distinct real registered containers, each actually owned or deposited within unobstructed reach. Conserves exact source/target contents, actual compatible measured water mass, capacities and established hazards. Future carrying checked before any increase in actual carried water; outgoing/conserved carried mass can still be reduced while overloaded. Physical hands/cost/duration/rest activity are explicitly adjudiqued: seconds0 combat with real current-turn cost, >0 outside; no arbitrary combat clock jump. Two object manipulations require action in combat, selected already-held containers count once. No pickup, new container, water creation, intake, purification or implicit movement; exact receipt never transfers twice. A real ingested poison follows the same whole dose: a partial contaminated source requires poisonPortionAdjudicationId for its explicitly recorded physical disposition; no dilution, purification or fractional potency is inferred.',
    inputSchema:TransferWaterSchema.shape,
  },async input=>toolkitTransaction(()=>toolkitResult(transferWater(input))))
}
