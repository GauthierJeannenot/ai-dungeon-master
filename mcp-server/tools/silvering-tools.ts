import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { SilveringServiceInputSchema } from '../../lib/silvering-state'
import { ToolkitIdSchema } from '../../lib/dm-tool-state'
import { CoinsSchema } from '../../lib/srd/currency'
import { establishSilveringService,silverEquipment } from '../silvering'
import { toolkitTransaction,toolkitResult } from '../toolkit'
export function registerSilveringTools(server:McpServer){
  server.registerTool('establish_silvering_service',{description:'MJ establishes source facts for an actual present accessible artisan: real expertise, materials and willingness plus a positive workSeconds adjudication. No NPC, metal, stock, money or item is created. PHB2014 specifies100gp including time/expertise/materials for one weapon or ten ammunition pieces, but no fixed crafting duration; this duration is explicitly adjudicated, never official invented time.',inputSchema:SilveringServiceInputSchema.shape},async input=>toolkitTransaction(()=>toolkitResult(establishSilveringService(input))))
  server.registerTool('silver_equipment',{description:'Complete the selected actual artisan service outside combat on exactly one real owned weapon OR ten real unsilvered projectile units. Pays exactly100gp in explicit canonical available denominations and advances the actual positive service work time only after all preflights; unsupported clock boundaries refuse before payment. Ten ammunition pieces are split into real separate silvered stock, not a free bundle or all of a larger pile. Coating persists on each physical instance. Exact event retries neither pay nor work nor coat twice. Silver is not magic and only bypasses source defenses that explicitly mention silver; a silvered launcher never coats ordinary ammunition.',inputSchema:{eventId:ToolkitIdSchema,serviceId:ToolkitIdSchema,paid:CoinsSchema,weaponItemId:ToolkitIdSchema.optional(),ammunition:z.array(z.object({itemId:ToolkitIdSchema,quantity:z.number().int().positive().max(10)}).strict()).min(1).max(10).optional()}},async input=>toolkitTransaction(()=>toolkitResult(silverEquipment(input))))
}
