import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { LoadFootprintSchema } from '../../lib/physical-handling-state'
import { ToolkitCellSchema } from '../../lib/dm-tool-state'
import { beginPhysicalHandling,releasePhysicalHandling } from '../physical-handling'
import { planNavigation,executeNavigation } from '../navigation'
import { available } from '../hero-rules'
import { toolkitTransaction,toolkitResult } from '../toolkit'
import * as gs from '../game-state'
const Id=z.string().min(1).max(180).refine(value=>!['constructor','prototype','__proto__'].includes(value))
export function registerPhysicalHandlingTools(server:McpServer){
  server.registerTool('begin_handling_load',{
    description:'Establish one exact actual player-held physical load without moving it. Requires real current whole-payload mass (creatures explicitly include all equipment), actual player size/inventory, required free hands, adjacent reach and real footprint. Living resistant creature: exact already-resolved grapple effect required. Incapacitated living creature: automatic source grapple costs one real Attack (2014 PHB errata), including a living0HP target, with hand/size/immunity validation. Capable willing target needs explicit established willingness and one action as an explicit MJ adjudication. Actual corpse/intact object needs confirmed mobility and MJ interaction/action ruling; this is not an automatic printed corpse rule. Missing container footprint is refused; obstacles use only their actual existing grid footprint. No narrative NPC, archive, guessed mass, inferred consent, new turn, HP change or teleport. Existing IDs never regrasp/refill after release.',
    inputSchema:{loadId:Id,actorId:Id,targetKind:z.enum(['creature','object']),targetId:Id,operation:z.enum(['carry','push','drag']),
      control:z.enum(['grapple','incapacitated_grapple','willing','inanimate']),hands:z.union([z.literal(1),z.literal(2)]),
      reason:z.string().trim().min(1).max(1000),source:z.string().trim().min(1).max(1000),
      grappleEffectId:Id.optional(),willing:z.literal(true).optional(),mobilityConfirmed:z.literal(true).optional(),interactionCost:z.enum(['interaction','action']).optional(),objectFootprint:LoadFootprintSchema.optional()},
  },async input=>toolkitTransaction(()=>toolkitResult(beginPhysicalHandling(input))))
  const movement={loadId:Id,actorId:Id,targetId:Id,toCell:ToolkitCellSchema,targetToCell:ToolkitCellSchema,
    allowPartial:z.boolean().default(false),acknowledgeEventIds:z.array(z.string()).max(32).optional()}
  server.registerTool('preview_handled_load',{
    description:'Read a legal joint walking path for the exact actual held load and TWO explicitly selected destinations. Checks the whole sourced footprint, walls/doors/occupancy, actual mass/capacity, real movement budget and source speed limits. No position, cost or die changes. No readied/hover/vertical transport is invented.',inputSchema:movement,
    annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false},
  },async input=>toolkitTransaction(()=>toolkitResult(planNavigation(input.actorId,{kind:'cell',cell:input.toCell},input.allowPartial,input.acknowledgeEventIds,false,
    {loadId:input.loadId,targetId:input.targetId,targetToCell:input.targetToCell}))))
  server.registerTool('move_handled_load',{
    description:'Move the exact already-held load and player to TWO explicit adjacent non-overlapping destinations through the actual joint grid path. Carry inventory+payload cannot exceed STR×15 with sourced size; push/drag cannot exceed STR×30 and speed drops to5ft above carrying capacity (before Dash). An actual grapple also keeps its source half-speed except two sizes smaller. Preserves opportunity reactions/held continuations, real movement costs, traps and room boundaries. Only carrier voluntary departure provokes; target is forced, gains no action/turn, and corpses/objects trigger no creature step effects. Actual uncollected attached contents follow their container physically without granting ownership. No archive, map transition, flight or teleport.',inputSchema:movement,
  },async input=>toolkitTransaction(()=>{
    available()
    const result=executeNavigation(input.actorId,{kind:'cell',cell:input.toCell},input.allowPartial,input.acknowledgeEventIds,[],false,
      {loadId:input.loadId,targetId:input.targetId,targetToCell:input.targetToCell})
    if(result.costCells)gs.addLogEntry({round:gs.getState().round,turn:input.actorId,action:'Transport physique de charge',mechanicalDetail:`${input.loadId} : ${result.costCells} cases ; ${result.stopReason}`})
    return toolkitResult({success:true,...result,...(gs.getState().hero?.pending?{pendingReaction:gs.getState().hero!.pending}:{})})
  }))
  server.registerTool('release_handled_load',{
    description:'Release the exact held physical grip at its ACTUAL current cells. Also ends its exact grapple if one supplied control. No target moves, no flight/fall/placement/HP is invented, and no action is spent for this release; careful placement is a separate MJ ruling. Exact released IDs are idempotent and never reacquired automatically.',inputSchema:{loadId:Id},
  },async({loadId})=>toolkitTransaction(()=>{available();return toolkitResult(releasePhysicalHandling(loadId))}))
}
