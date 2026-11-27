import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { ToolkitIdSchema } from '../../lib/dm-tool-state'
import { toolkitTransaction } from '../toolkit'
import { useWeaponConsumable, extinguishWeaponConsumableFire, registerWeaponConsumableResolutions } from '../weapon-consumables'

export function registerWeaponConsumableTools(server: McpServer) {
  registerWeaponConsumableResolutions()
  server.registerTool('use_weapon_consumable', {
    description: 'Use one exact player-owned acid vial, holy water flask or alchemist fire flask. Active combat; complete action, ranged DEX improvised attack without automatic proficiency; splash within 5 feet or throw up to 20 feet (fire throw only). Creature targets only; objects refused before costs. Holy water damages only authoritative fiends/undead. Fire deals 1d4 at each target turn start until an action and DC10 DEX check extinguish it. Preserve useId when resuming/retrying; no item acquisition.',
    inputSchema: { useId: ToolkitIdSchema, itemId: ToolkitIdSchema, targetKind: z.enum(['creature', 'object']), targetId: ToolkitIdSchema, mode: z.enum(['splash', 'throw']) },
  }, async input => toolkitTransaction(() => useWeaponConsumable(input)))
  server.registerTool('extinguish_alchemists_fire', {
    description: 'The exact burning creature uses its own action for a DC10 Dexterity ability check to extinguish alchemist fire. No saving throw or free automatic extinguishing. Stable eventId makes completed retries idempotent.',
    inputSchema: { eventId: ToolkitIdSchema, actorId: ToolkitIdSchema },
  }, async input => toolkitTransaction(() => extinguishWeaponConsumableFire(input)))
}
