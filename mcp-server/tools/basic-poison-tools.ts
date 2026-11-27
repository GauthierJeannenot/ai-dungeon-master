import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { ToolkitIdSchema } from '../../lib/dm-tool-state'
import { coatBasicPoison } from '../basic-poison'
import { registerBasicPoisonResolutions } from '../basic-poison-hits'
import { toolkitTransaction,toolkitResult } from '../toolkit'
export function registerBasicPoisonTools(server:McpServer){
  registerBasicPoisonResolutions()
  server.registerTool('coat_weapon_with_poison',{
    description:'PHB2014 Basic Poison: consume one exact actually owned basic_poison_vial dose and one complete action to coat ONE actually held slashing/piercing weapon OR1–3explicit real ammunition units. Choose stack/count or an already reserved sling loadedHostItemId per unit; no free stock, kit-generated poison, launcher-to-projectile transfer or automatic selection. Splits preserve actual quantities/silver. Potency lasts60actual seconds after application; source hits require CONDC10 or1d4poison, no poisoned condition or critical doubling. Outside combat6s for application is an announced engine convention, with all time/event preflights before dose/action. Source price100gp, printed mass unspecified; this tool neither buys nor creates the vial. Exact event repeats never consume or refresh twice.',
    inputSchema:{eventId:ToolkitIdSchema,vialItemId:ToolkitIdSchema,weaponReference:z.string().min(1).max(180).optional(),ammunitionTargets:z.array(z.object({ammunitionItemId:z.string().min(1).max(180).optional(),quantity:z.number().int().min(1).max(3).optional(),loadedHostItemId:z.string().min(1).max(180).optional()}).strict()).min(1).max(3).optional()},
  },async input=>toolkitTransaction(()=>toolkitResult(coatBasicPoison(input))))
}
