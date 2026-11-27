import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { ToolkitIdSchema,ToolkitDescriptionSchema } from '../../lib/dm-tool-state'
import { WeaponAttackModeSchema } from '../../lib/two-weapon-state'
import { setNetCreatureForm,freeNet,registerNetCheckResolutions,netBinding } from '../nets'
import { attackNet,registerNetAttackResolutions } from '../net-attacks'
import { toolkitTransaction,toolkitResult } from '../toolkit'

export function registerNetTools(server:McpServer){
  registerNetCheckResolutions();registerNetAttackResolutions()
  server.registerTool('set_net_creature_form',{
    description:'MJ records an explicitly established corporeal/formless fact for one actual current creature, with source and reason. Does not transform it, infer its body from a name/image, grant a mount or create size. A net throw separately reads its actual native size or established player physical size and source restrained immunity. Actual formless creatures or Huge/larger receive no restraint. Changing a genuinely established form releases only the affected net provider.',
    inputSchema:{eventId:ToolkitIdSchema,entityId:ToolkitIdSchema,formless:z.boolean(),source:ToolkitDescriptionSchema,reason:ToolkitDescriptionSchema},
  },async input=>toolkitTransaction(()=>setNetCreatureForm(input)))
  server.registerTool('free_from_net',{
    description:'Attempt to free oneself or one other actual nearby captive from the exact thrown net. One real action and a Strength check DC10, not Athletics; choose actorId explicitly for a helper. Current five-foot physical hand reach and clear path are required; a Reach weapon does not extend the helping hand. Held Inspiration/Cutting Words keep the original check and exact choice. Success frees only this net, without destroying it or removing another restraint provider. Exact event retries spend no additional action/die.',
    inputSchema:{eventId:ToolkitIdSchema,netId:ToolkitIdSchema,actorId:ToolkitIdSchema.default('player')},
  },async input=>toolkitTransaction(()=>freeNet(input)))
  server.registerTool('attack_net',{
    description:'Attack the exact real net AC10 with an actually held registered SLASHING weapon; real action/Extra Attack, grip, reach/ranged bands, Heavy, physical throw and held Inspiration apply. This attacks the net object, never its captive. Five actual slashing damage releases/destroys it. Across-hit accumulation is an explicitly announced engine interpretation, not invented object hit points. Other damage types, spell-object attacks and independently declared net cover refuse before costs; no universal official net immunity is asserted. Exact repeats return the original outcome without another die or cost.',
    inputSchema:{eventId:ToolkitIdSchema,netId:ToolkitIdSchema,weaponId:ToolkitIdSchema,weaponHands:z.union([z.literal(1),z.literal(2)]).optional(),weaponAbility:z.enum(['str','dex']).optional(),attackMode:WeaponAttackModeSchema.optional(),ammunitionItemId:ToolkitIdSchema.optional(),newAttackAction:z.boolean().optional()},
  },async input=>toolkitTransaction(()=>attackNet(input)))
  server.registerTool('inspect_net',{
    description:'Read one exact recorded thrown net and its actual restraint/slashing bookkeeping. Does not reveal an unknown creature, move an item, free a captive, roll, spend an action or reactivate an archive.',
    inputSchema:{netId:ToolkitIdSchema},annotations:{readOnlyHint:true},
  },async input=>toolkitTransaction(()=>toolkitResult(netBinding(input.netId))))
}
