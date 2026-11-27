import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StartServiceSchema, WorkServiceSchema, ResolveServiceSchema, AbandonServiceSchema, SpendServiceFavorSchema } from '../../lib/xge-religious-service-state'
import { startXgeReligiousService, workXgeReligiousService, resolveXgeReligiousService, abandonXgeReligiousService,
  spendXgeReligiousFavor, inspectXgeReligiousService, registerServiceResolution } from '../xge-religious-service'
import { toolkitResult, toolkitTransaction } from '../toolkit'
export function registerReligiousServiceTools(server: McpServer) {
  registerServiceResolution()
  server.registerTool('start_xge_religious_service', {
    description: 'Explicit optional Xanathar Religious Service. Choose an actual supported dry temple site fact, its real present capable representative and actual explicitly qualified access, aligned beliefs and ethos. One workweek, no gold expense, automatic spell service, deity, clergy, knowledge, quest or effect. Exact retry retains the original week.',
    inputSchema: StartServiceSchema.shape, annotations: { idempotentHint: true },
  }, async input => toolkitTransaction(() => toolkitResult(startXgeReligiousService(input))))
  server.registerTool('work_xge_religious_service', {
    description: 'Measure one real uninterrupted eight-hour date of religious service at the original actual temple with its qualified representative. Five distinct dates within the first ten dates; shared downtime budget, actual clock and due-event preflight. No payment, rest, check, favor or narrative consequence is created by working.',
    inputSchema: WorkServiceSchema.shape, annotations: { idempotentHint: true },
  }, async input => toolkitTransaction(() => toolkitResult(workXgeReligiousService(input))))
  server.registerTool('resolve_xge_religious_service', {
    description: 'After five actual service dates choose one real Intelligence(Religion) or Charisma(Persuasion) check without a DC. Actual ability, skill mastery, Help and Inspiration apply. Retain the original total through reactions and SQL; source table determines zero, one or two future-assistance promises under the GLOBAL current Charisma cap, with no retroactive refill. Explicit user convention awards no favor for every total <=10 including zero/negative; keep that original roll and the normal complication chance. One 10 percent chance and source d6 example remain documentary only. No secret, quest, deity intervention, NPC, attitude or benefit is generated.',
    inputSchema: ResolveServiceSchema.shape, annotations: { idempotentHint: true },
  }, async input => toolkitTransaction(() => resolveXgeReligiousService(input)))
  server.registerTool('spend_xge_religious_favor', {
    description: 'Explicitly consume one actual unused promise at its original temple after a real specific-problem or political/social-support request and distinct actual acceptance facts, with a genuinely qualified present representative. Persists only that one promise consumption. No aid, information, knowledge, quest, attitude, spell, discounted service, omen or physical consequence is automatically granted. Exact replay consumes nothing again.',
    inputSchema: SpendServiceFavorSchema.shape, annotations: { idempotentHint: true },
  }, async input => toolkitTransaction(() => toolkitResult(spendXgeReligiousFavor(input))))
  server.registerTool('abandon_xge_religious_service', {
    description: 'Explicitly abandon unfinished actual service while retaining every real workday. No fee existed, refund or partial favor; complete weeks and results cannot be erased.',
    inputSchema: AbandonServiceSchema.shape, annotations: { idempotentHint: true },
  }, async input => toolkitTransaction(() => toolkitResult(abandonXgeReligiousService(input))))
  server.registerTool('inspect_xge_religious_service', {
    description: 'Read retained religious-service weeks, original totals, global current cap, unused promises, actual spends and documentary source complications. No work, request, payment, die, knowledge revelation or benefit.',
    inputSchema: {}, annotations: { readOnlyHint: true, idempotentHint: true },
  }, async () => toolkitResult(inspectXgeReligiousService()))
}
