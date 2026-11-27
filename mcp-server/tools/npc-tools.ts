import { cleavingActionIssue } from '../../lib/cleaving-state'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { getAdventureMap } from '../../lib/adventure-map'
import { reactionOpportunities,npcActionPolicy } from '../../lib/npc-reactions'
import { geometricDistanceCells, navigationGrid } from '../../lib/navigation'
import * as gs from '../game-state'
import * as rules from '../rules'
import { engineGeometry, executeNavigation } from '../navigation'
import { GoalFields, explicitGoal } from './navigation-tools'
import { interactDoor } from './door-tools'
import { createMonster, startCombat } from './phase-tools'
import { completedRoundEvents } from '../../lib/combat-round-events'
import { resolveAttack, resolveMonsterAttackAction } from './combat-tools'
import { MonsterPowerFields, resolveMonsterPower } from './monster-power-tools'
import { assertKnockoutTimeAdvance } from '../nonlethal'

const Action = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('wait') }).strict(),
  z.object({ kind: z.literal('move'), ...GoalFields, allowPartial: z.boolean().optional() }).strict(),
  z.object({ kind: z.literal('door'), doorId: z.string(), action: z.enum(['open', 'close', 'force']) }).strict(),
  z.object({ kind: z.literal('initiate_combat'), targetId: z.literal('player') }).strict(),
  z.object({ kind: z.literal('attack'), targetId: z.string(), weaponOrSpell: z.string(), attackActions: z.array(z.string()).optional() }).strict(),
  z.object({ kind: z.literal('power'), ...MonsterPowerFields }).strict(),
])

export function registerNpcTools(server: McpServer) {
  server.tool('npc_action', 'Explicit model decision for ONE reactive NPC activation from the supplied activationKey. Choose 1-3 ordered actions using its authored capabilities/objectives, or wait. Engine revalidates goals, doors, range, turn and economy. Atomic: invalid action rolls back this activation. Completes the activation once; turn_start also ends that NPC turn. Never use for deterministic monsters.',
    { npcId: z.string(), activationKey: z.string(), actions: z.array(Action).min(1).max(3) }, async ({ npcId, activationKey, actions }) => {
      const before = structuredClone(gs.getState())
      try {
        const cleaving=cleavingActionIssue(gs.getState());if(cleaving)throw new rules.RuleViolation(cleaving.code,cleaving.message,{})
        const opportunity = reactionOpportunities(before).find(o => o.npcId === npcId && o.activationKey === activationKey)
        if (!opportunity) throw new rules.RuleViolation('NPC_ACTIVATION_UNAVAILABLE', 'Activation is stale, already completed, wrong map or not due.', {})
        if(opportunity.trigger==='turn_start')assertKnockoutTimeAdvance(6,true)
        const policy = npcActionPolicy(before,npcId)!
        const requireCapability = (c: typeof policy.capabilities[number]) => {
          if (!policy.capabilities.includes(c)) throw new rules.RuleViolation('NPC_CAPABILITY_MISSING', `Actor lacks ${c}.`, {})
        }
        const results: unknown[] = []
        if (actions.some((action, index) => action.kind === 'initiate_combat' && index !== actions.length - 1))
          throw new rules.RuleViolation('NPC_COMBAT_MUST_BE_LAST', 'Initiating combat ends this reaction; turn actions require the new turn activation.', {})
        for (const action of actions) {
          if (action.kind === 'wait') results.push({ waited: true })
          else if (action.kind === 'move') {
            requireCapability('move')
            results.push(executeNavigation(npcId, explicitGoal(action), action.allowPartial, action.acknowledgeEventIds))
          } else if (action.kind === 'door') {
            requireCapability(action.action === 'open' ? 'open_door' : action.action === 'close' ? 'close_door' : 'force_door')
            if (action.action === 'force' && !gs.getEntity(npcId)) throw new rules.RuleViolation('NPC_STATS_REQUIRED', 'Forcing requires an active combat stat block.', {})
            results.push(JSON.parse(interactDoor(action.doorId, action.action, npcId).content[0].text))
          } else if (action.kind === 'initiate_combat') {
            requireCapability('initiate_combat')
            if (gs.getState().phase === 'combat' || !policy.combatTemplate) throw new rules.RuleViolation('NPC_COMBAT_UNAVAILABLE', 'Combat already active or no authored combat template.', {})
            const npc = gs.getNpc(npcId)!, player = gs.getPlayer()
            if (geometricDistanceCells(npc.position, player.position) > 1 || !navigationGrid(gs.getState(), npcId, engineGeometry()).step(npc.position, player.position, false, false))
              throw new rules.RuleViolation('TARGET_OUT_OF_RANGE', 'NPC must have unobstructed adjacent contact to initiate combat.', {})
            const monster = createMonster(policy.combatTemplate, npc.position, npc.name)
            monster.id = npcId; monster.controller = 'reactive_npc'
            gs.spawnMonster(monster)
            npc.visible = true; npc.disposition = 'hostile'
            results.push(startCombat(['player', npcId]))
          } else if (action.kind === 'power') {
            requireCapability('attack')
            const result = resolveMonsterPower({ monsterId: npcId, ...action })
            if ('isError' in result && result.isError) throw new Error(result.content[0].text)
            results.push(JSON.parse(result.content[0].text))
          } else {
            requireCapability('attack')
            const result = gs.getMonster(npcId)?.srd
              ? resolveMonsterAttackAction(npcId, action.targetId, action.weaponOrSpell, action.attackActions)
              : resolveAttack(npcId, action.targetId, action.weaponOrSpell)
            if ('isError' in result && result.isError) throw new Error(result.content[0].text)
            results.push(JSON.parse(result.content[0].text))
          }
          if(gs.getState().hero?.pending)break
        }
        const state = gs.getState()
        if(state.hero?.pending)return {content:[{type:'text',text:JSON.stringify({npcId,activationKey,results,completed:false,pendingReaction:state.hero.pending})}]}
        state.npcActivationLedger = [...(state.npcActivationLedger ?? []), activationKey].slice(-128)
        if (opportunity.trigger === 'turn_start' && state.currentTurn === npcId) gs.advanceTurn()
        return { content: [{ type: 'text', text: JSON.stringify({ npcId, activationKey, results, completed: true,
          roundEvents: Object.values(completedRoundEvents(state)).filter(event => !completedRoundEvents(before)[event.eventId]),
          position: (gs.getEntity(npcId) ?? gs.getNpc(npcId))!.position, currentTurn: state.currentTurn }) }] }
      } catch (err) { gs.replaceState(before); return rules.ruleErrorResult(err) }
    })
}
