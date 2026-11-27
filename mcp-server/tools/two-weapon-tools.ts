import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { ToolkitIdSchema } from '../../lib/dm-tool-state'
import { WeaponAttackModeSchema } from '../../lib/two-weapon-state'
import { roleplayBonusFields } from '../roleplay-bonus'
import { heroAttack } from '../hero-combat'
import { prepareTwoWeaponAttack, replayTwoWeaponAttack } from '../two-weapon'
import { toolkitResult, toolkitTransaction } from '../toolkit'

export function registerTwoWeaponTools(server:McpServer){
  server.registerTool('resolve_two_weapon_attack',{
    description:'PHB2014 two-weapon bonus attack, after a real Attack-action attack this player turn with an exact light melee weapon held in one hand. Select the primaryAttackId returned by that attack, a different exact light melee weaponItemId held in the other hand at that time and still held there, exact targetId, explicit melee/thrown mode, and unique replayable attackId. No target/hand/weapon inference, free equipment, Dual Wielder or unowned Fighting Style. Uses the one bonus action, never Extra Attack or another action credit. Damage omits a positive ability modifier and retains a negative one; actual enchantment remains. Thrown requires the property and drops the physical weapon at the target after the resolution. Reactions hold and resume the same dice/costs. Replaying identical attackId returns its held/final result; changed choices refuse.',
    inputSchema:{attackId:ToolkitIdSchema,primaryAttackId:ToolkitIdSchema,weaponItemId:ToolkitIdSchema,targetId:z.string().min(1).max(180),attackMode:WeaponAttackModeSchema,
      nonlethal:z.boolean().optional().describe('Declare knockout before the real melee bonus attack. Never valid for thrown attacks.'),
      weaponAbility:z.enum(['str','dex']).optional().describe('Independent explicit STR/DEX choice for this actual finesse bonus weapon attack; never rewrites the triggering primary attack. Positive modifier remains omitted without the acquired fighting style; a negative modifier stays.'),
      advantage:z.boolean().optional(),disadvantage:z.boolean().optional(),advantageReason:z.string().trim().min(1).max(300).optional(),...roleplayBonusFields,
      roleplayReason:z.string().trim().min(1).max(600).optional()},
    annotations:{readOnlyHint:false,idempotentHint:true,destructiveHint:false,openWorldHint:false},
  },async input=>toolkitTransaction(()=>{
    const replay=replayTwoWeaponAttack(input)
    if(replay)return toolkitResult(replay)
    const twoWeapon=prepareTwoWeaponAttack(input)
    return heroAttack({attackerId:'player',targetId:input.targetId,weaponOrSpell:input.weaponItemId,attackMode:input.attackMode,
      advantage:input.advantage,disadvantage:input.disadvantage,roleplayBonus:input.roleplayBonus,roleplayReason:input.roleplayReason,nonlethal:input.nonlethal,weaponAbility:input.weaponAbility,twoWeapon})
  }))
}
