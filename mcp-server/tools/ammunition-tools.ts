import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { AMMUNITION, AMMUNITION_SOURCE, AMMUNITION_TYPES } from '../../lib/srd/ammunition'
import { ToolkitCellSchema, ToolkitDescriptionSchema, ToolkitIdSchema } from '../../lib/dm-tool-state'
import { ammunitionState } from '../ammunition'
import { recoverAmmunition } from '../ammunition-recovery'
import { beginAmmunitionSearch, advanceAmmunitionSearch } from '../ammunition-search'
import { assertToolkitPreparation, toolkitError, toolkitLocation, toolkitResult, toolkitTransaction } from '../toolkit'
import * as gs from '../game-state'
import { assertGreaterBrewingIdAvailable } from '../toolkit'

export function registerAmmunitionTools(server:McpServer) {
  server.registerTool('create_ammunition',{
    description:'MJ scene preparation outside combat: place a counted stack of actual mundane arrows, blowgun needles, crossbow bolts or sling bullets at one explicit active-map room cell. Does not add inventory, infer stock for an existing weapon, buy ammunition, load a weapon or alter a past expenditure. Pick up the real stack with pick_up_item. Exact itemId/definition repeats are idempotent even after depletion or loss; different wording never refills an instance.',
    inputSchema:{itemId:ToolkitIdSchema,ammunitionType:z.enum(AMMUNITION_TYPES),quantity:z.number().int().min(1).max(200),
      name:z.string().trim().min(1).max(80),description:ToolkitDescriptionSchema,cell:ToolkitCellSchema},
    annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:true,openWorldHint:false},
  },async input=>toolkitTransaction(()=>{
    assertToolkitPreparation()
    const state=gs.getState(),data=ammunitionState(),creation=JSON.stringify(input),existing=Object.hasOwn(data.prepared,input.itemId)?data.prepared[input.itemId]:undefined
    if(existing) {
      if(existing.creation!==creation)toolkitError('AMMUNITION_ID_CONFLICT','This stack ID has another immutable scene definition; it cannot be refilled or redefined.')
      const owned=state.player.inventory.find(item=>item.id===input.itemId),ground=state.droppedItems?.[input.itemId]
      return toolkitResult({success:true,alreadyCreated:true,item:owned??ground?.item,location:ground?{mapId:ground.mapId,roomId:ground.roomId,cell:ground.position}:undefined,
        notice:'No quantity, position, ownership or time changed.'})
    }
    assertGreaterBrewingIdAvailable(input.itemId)
    if(Object.keys(data.prepared).length>=128)toolkitError('AMMUNITION_STACK_LIMIT','At most 128 prepared ammunition stack identities are supported per session.')
    if(state.player.inventory.some(item=>item.id===input.itemId)||state.droppedItems?.[input.itemId]||gs.getEntity(input.itemId)||gs.getNpc(input.itemId)
      ||state.dmTools?.magicItems?.[input.itemId]||state.dmTools?.spellScrolls?.[input.itemId])
      toolkitError('AMMUNITION_ID_CONFLICT','This exact item or actor ID is already in use.')
    const location=toolkitLocation(input.cell),spec=AMMUNITION[input.ammunitionType]
    const item={id:input.itemId,name:input.name,description:input.description,type:'misc' as const,
      equipmentId:spec.equipmentId,quantity:input.quantity,ammunitionType:input.ammunitionType}
    data.prepared[input.itemId]={itemId:input.itemId,creation}
    state.droppedItems??={}
    state.droppedItems[input.itemId]={item,mapId:location.mapId,roomId:location.roomId,position:{...input.cell}}
    return toolkitResult({success:true,item,location:{...location,cell:{...input.cell}},source:AMMUNITION_SOURCE,
      notice:'Real scene stock placed on the ground; not owned, purchased, loaded or recovered.'})
  }))
  server.registerTool('begin_ammunition_search',{
    description:'Begin an actual post-battle ammunition search on its original map, freezing the exact in-combat expenditure witnesses and every required room. Does not move, open a door, spend search time or grant ammunition. A continuation, not a completed recovery. The agent must choose and execute real navigation between rooms, then call advance_ammunition_search only at the actual current room. Other waiting/rest/travel time never counts toward the active sixty-second search. Exact repeats retain progress. Actual new combat or a map change interrupts the search without erasing its performed checkpoints.',
    inputSchema:{searchId:ToolkitIdSchema,combatGeneration:z.number().int().positive()},
    annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:true,openWorldHint:false},
  },async input=>toolkitTransaction(()=>toolkitResult(beginAmmunitionSearch(input))))
  server.registerTool('advance_ammunition_search',{
    description:'Perform one explicitly chosen positive whole-second part of an existing ammunition search in the PLAYER’S ACTUAL CURRENT battlefield room. No room/path/position argument can declare a remote visit. Stores actual position, room, time and immutable event receipt. Every recorded battlefield room must receive positive search time, totaling exactly sixty active seconds for the whole battle, not per room/type. Durations per room are an explicit MJ implementation interpretation because the source gives only the global minute. Navigation is chosen and executed separately through real movement tools. Time-event boundaries preflight before this step. Exact event retries spend no second time. New combat/map change or modified frozen expenditures refuse further progress. Does not grant ammunition; recover_ammunition with searchId completes the actual recovery afterward.',
    inputSchema:{searchId:ToolkitIdSchema,eventId:ToolkitIdSchema,seconds:z.number().int().min(1).max(60)},
    annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:true,openWorldHint:false},
  },async input=>toolkitTransaction(()=>toolkitResult(advanceAmmunitionSearch(input))))
  server.registerTool('recover_ammunition',{
    description:'Complete a post-battle ammunition recovery: floor(ALL actually expended projectile units / 2), rounded down once across stacks AND types. Single-room: spend one preflighted real minute now. Multi-room: provide the exact searchId whose performed local checkpoints cover every battlefield room and total sixty active seconds; completion spends NO second minute and never moves the player. Choose ammunitionType for a single-type battle or recoveredCounts for every actual type once, including zeros, with exact global total and no type above actual expenditure. Mixed composition is an explicit MJ interpretation because the source does not specify it; no official clarification, price preference or conversion is claimed. The player must be capable in exploration on the original battlefield map. Frozen search witnesses, context and actual local visits remain authoritative. Exploration and unproven legacy receipts are excluded. Active carrying preflights the exact future items. One recovery per WHOLE battle; another ID/type/search never grants a second half. Exact retries cost no time.',
    inputSchema:{recoveryId:ToolkitIdSchema,combatGeneration:z.number().int().nonnegative(),ammunitionType:z.enum(AMMUNITION_TYPES).optional(),
      recoveredCounts:z.array(z.object({ammunitionType:z.enum(AMMUNITION_TYPES),quantity:z.number().int().nonnegative()}).strict()).min(1).max(4).optional(),
      recoveredSilveredCounts:z.array(z.object({ammunitionType:z.enum(AMMUNITION_TYPES),quantity:z.number().int().nonnegative()}).strict()).min(1).max(4).optional().describe('Explicit coating composition where the same ammunition type actually expended both silvered and ordinary projectiles. Bounds preserve actual stock, never prefer silver by price. Omit for deterministic all-ordinary/all-silver distributions.'),searchId:ToolkitIdSchema.optional(),
      recoveredAdamantineAttackIds:z.array(z.string().min(1).max(160)).max(256).optional().describe('If this battle spent adamantine, choose exact source shot IDs recovered or[]for none. Real individual units retain material, silver and any dose; no ordinary unit acquires a price/property.'),
      recoveredPoisonedAttackIds:z.array(z.string().min(1).max(160)).max(256).optional().describe('When this battle includes still-potent DMG-coated projectiles, explicitly choose the actual coated shot IDs recovered, or[]for none. Each chosen unit returns separately with its SAME real dose and silver; the normal/silver/type counts must fit the actual uncoated remainder. No coating disappears or spreads over an ordinary stack.')},
    annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:true,openWorldHint:false},
  },async input=>toolkitTransaction(()=>toolkitResult(recoverAmmunition(input))))
}
