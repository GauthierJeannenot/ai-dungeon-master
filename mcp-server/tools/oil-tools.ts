import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { ToolkitIdSchema,ToolkitCellSchema } from '../../lib/dm-tool-state'
import { useOilFlask,pourOilFlask,igniteOilPatch,registerOilAttackResolutions } from '../oil'
import { toolkitTransaction,toolkitResult } from '../toolkit'
export function registerOilTools(server:McpServer){
 registerOilAttackResolutions()
 server.registerTool('use_oil_flask',{
  description:'PHB2014 Oil: one exact owned full pint oil_flask, one complete action, ranged DEX improvised attack without automatic proficiency. Explicit creature OR intact scene object; splash within5feet or throw up to20feet, no60foot extension. The flask is consumed on hit or miss, without invented impact damage. A hit coats60seconds; each real positive fire event before drying adds5fire in that SAME packet after source qualification, never recursive damage. Repeated-event reading is an announced engine interpretation. Outside combat6s is actual work with capability/time preflight, never a fictitious initiative turn. Preserve useId/held context on retry.',
  inputSchema:{useId:ToolkitIdSchema,itemId:ToolkitIdSchema,targetKind:z.enum(['creature','object']),targetId:ToolkitIdSchema,mode:z.enum(['splash','throw'])},
 },async input=>toolkitTransaction(()=>useOilFlask(input)))
 server.registerTool('pour_oil_flask',{
  description:'Pour one actual full pint oil_flask on one explicit level5foot-square ground cell within real reach, one action. Choose an actual public scene fact at that exact cell and explicitly confirm levelSurfaceConfirmed; no text parsing. surfaceZFeet is the actual map support datum, not geographic altitude; choose supportSurfaceId when modeled. No free stock, slope flattening, bridging a gap or new height. No flame/damage is created. Outside combat6s actual work is an announced timing convention. Preserve useId for idempotent retry.',
  inputSchema:{useId:ToolkitIdSchema,itemId:ToolkitIdSchema,cell:ToolkitCellSchema,surfaceFactId:ToolkitIdSchema,levelSurfaceConfirmed:z.literal(true),surfaceZFeet:z.number(),supportSurfaceId:ToolkitIdSchema.optional()},
 },async input=>toolkitTransaction(()=>toolkitResult(pourOilFlask(input))))
 server.registerTool('ignite_oil_patch',{
  description:'Apply an actual exposed burning torch/candle to an exact poured oil patch within physical reach, using its real lit fuel and surface height; no free flame, oil or magical dispelling. One action (6actual seconds outside combat, an announced convention). Burns12s representing2rounds; open mundane fire follows actual wind/rain extinction. No immediate damage just for lighting under an occupant: entry/end-turn damage needs explicit actual initiative when a body contacts the surface.5fire only once per creature in an actual global turn, including overlapping pools. Never invent an enemy or tick. Preserve eventId,patchId,flameItemId.',
  inputSchema:{eventId:ToolkitIdSchema,patchId:ToolkitIdSchema,flameItemId:ToolkitIdSchema},
 },async input=>toolkitTransaction(()=>toolkitResult(igniteOilPatch(input))))
}
