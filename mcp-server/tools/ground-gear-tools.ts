import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { ToolkitIdSchema,ToolkitCellSchema } from '../../lib/dm-tool-state'
import { placeGroundGear,setGroundGearPace } from '../ground-gear'
import { resolveGroundGearContact,registerGroundGearResolutions } from '../ground-gear-resolution'
import { escapeHuntingTrap,resetHuntingTrap,registerHuntingTrapResolutions } from '../ground-gear-escape'
import { toolkitResult,toolkitTransaction } from '../toolkit'
const EntityId=z.string().min(1).max(180)
export function registerGroundGearTools(server:McpServer){
 registerGroundGearResolutions();registerHuntingTrapResolutions()
 server.registerTool('place_ground_gear',{
  description:'PHB2014 one actual owned bag of1000ball bearings,20caltrops or one hunting_trap, one complete action. Choose exact origin/support and physical scene fact; no stock, pack or anchor created. Bearings cover one LEVEL10foot square, caltrops one5foot square. Hunting trap locates one small central plate and needs its real immobile object/chain attachment; default3foot chain is the published typical length, not free extra reach. The whole physical bag/trap moves to ground; recovered contents leave their existing separate container in place. Outside combat6s actual work is an announced timing convention. Placement under an occupant does not invent an entry/step. No generic authored bear template, restrained or speed0.',
  inputSchema:{placementId:ToolkitIdSchema,itemId:EntityId,originCell:ToolkitCellSchema,surfaceZFeet:z.number().finite(),surfaceFactId:EntityId,
   levelSurfaceConfirmed:z.literal(true).optional(),supportSurfaceId:EntityId.optional(),anchorObjectId:ToolkitIdSchema.optional(),anchorFactId:EntityId.optional(),immobileAnchorConfirmed:z.literal(true).optional(),chainLengthFeet:z.number().finite().positive().max(1000).optional()},
 },async input=>toolkitTransaction(()=>toolkitResult(placeGroundGear(input))))
 server.registerTool('set_ground_gear_pace',{
  description:'Explicitly choose an actual capable actor’s persistent walking pace, normal or careful. No action/speed condition granted. Careful pace really pays twice each walking step’s full terrain/diagonal/crawl cost and avoids the source ball-bearing/caltrops save; never gives a free forced-target or flying exemption. Cannot change pace during a held reaction or actual unresolved ground contact. Normal remains an explicit choice; the server never reads player text to choose caution.',
  inputSchema:{eventId:ToolkitIdSchema,entityId:EntityId,pace:z.enum(['normal','careful'])},
 },async input=>toolkitTransaction(()=>toolkitResult(setGroundGearPace(input))))
 server.registerTool('resolve_ground_gear_contact',{
  description:'Continue ONE actual contact already recorded by committed ground movement. Explicitly order ALL exact placement IDs from that contact. For each hunting trap explicitly decide whether the creature really stepped on its small central pressure plate and state the physical source; a5foot cell is not automatically the plate. Uses the actual source DEX save (bearings10/caltrops15/trap13), real Inspiration, damages/conditions and original continuation. No fresh target, movement, action or fabricated MCP call. Failed caltrops stops voluntary movement for the real global turn; only actual received piercing gives walking-10until trueHPregain. Trap uses real chain geometry, never restrained/speed0. Preserve exact choices on retry.',
  inputSchema:{contactId:EntityId,orderedPlacementIds:z.array(ToolkitIdSchema).min(1).max(32),plateContacts:z.array(z.object({placementId:ToolkitIdSchema,stepped:z.boolean(),source:z.string().trim().min(1).max(1000)}).strict()).max(32).optional()},
 },async input=>toolkitTransaction(()=>resolveGroundGearContact(input)))
 server.registerTool('escape_hunting_trap',{
  description:'An actual capable actor uses ONE action for STR13 to free itself or the exact other body within real5foot manipulation reach from an actually sprung PHB hunting_trap. No automatic Athletics/tool proficiency, new target or free opening. Each failed check deals1piercing to the actual living victim. Inspiration holds the original check/action without reroll. Same physical opening procedure on an already dead body is an announced engine adjudication, giving no creature damage, HP or resurrection. A freed trap remains sprung until a separate real set action.',
  inputSchema:{eventId:ToolkitIdSchema,placementId:ToolkitIdSchema,actorId:EntityId,targetId:EntityId},
 },async input=>toolkitTransaction(()=>escapeHuntingTrap(input)))
 server.registerTool('reset_hunting_trap',{
  description:'Use one real action to set an existing sprung PHB hunting trap again at its actual unchanged immobile chain anchor, within reach and with a real free hand. No automatic rearming on successful dodge, freedom or nonce. Free an actual clamped body first. No new trap, stock, attack or target. Outside combat6real seconds is an announced action-work convention.',
  inputSchema:{eventId:ToolkitIdSchema,placementId:ToolkitIdSchema},
 },async input=>toolkitTransaction(()=>toolkitResult(resetHuntingTrap(input))))
}
