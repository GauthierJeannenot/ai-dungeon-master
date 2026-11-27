import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StartCarousingSchema, WorkCarousingSchema, ResolveCarousingSchema, AssignCarousingContactSchema,
  ConsumeCarousingContactSchema, RenewCarousingContactSchema, AbandonCarousingSchema } from '../../lib/xge-carousing-state'
import { startXgeCarousing, workXgeCarousing, resolveXgeCarousing, assignXgeCarousingContact, consumeXgeCarousingContact,
  renewXgeCarousingContact, abandonXgeCarousing, inspectXgeCarousing, registerCarousingResolution } from '../xge-carousing'
import { toolkitResult, toolkitTransaction } from '../toolkit'
export function registerCarousingTools(server: McpServer) {
  registerCarousingResolution()
  server.registerTool('start_xge_carousing', {
    description: 'Explicit optional Xanathar Carousing. Qualify a real supported venue, real host, access and lower/middle/upper social class. Upper class requires actual sufficient represented contacts and local nobility access. No fee or time at start; no noble background, disguise, Deception result, contact or aid is fabricated. Prior pending contact assignments must be resolved explicitly.',
    inputSchema: StartCarousingSchema.shape, annotations: { idempotentHint: true },
  }, async input => toolkitTransaction(() => toolkitResult(startXgeCarousing(input))))
  server.registerTool('work_xge_carousing', {
    description: 'Commit one actual uninterrupted eight-hour date at the original venue, sharing the downtime budget. Five dates within ten. Explicit user convention: entire10/50/250gp class expense paid in exact owned denominations at FIRST actual effort only; pass paid then, omit later. Preflight all refusals before time/coins. No automatic refund or lifestyle benefit.',
    inputSchema: WorkCarousingSchema.shape, annotations: { idempotentHint: true },
  }, async input => toolkitTransaction(() => toolkitResult(workXgeCarousing(input))))
  server.registerTool('resolve_xge_carousing', {
    description: 'After five real dates resolve one actual CHA Persuasion total without DC, retaining mastery, Help, Inspiration and held original rolls. Printed result:1–5 one hostile contact;6–10 none;11–15 one ally;16–20 two;21+three. Explicit user convention includes all nonpositive totals in the hostile row. Roll one10percent complication chance and class-specific documentary d8 only. Results await explicit assignments; no erased gain or cap overflow, generated person, attitude, aid, injury, theft, marriage, quest, debt or expense.',
    inputSchema: ResolveCarousingSchema.shape, annotations: { idempotentHint: true },
  }, async input => toolkitTransaction(() => resolveXgeCarousing(input)))
  server.registerTool('assign_xge_carousing_contact', {
    description: 'Assign one retained contact result to a free unspecified slot or a real met named NPC. Global max(1,1+CHAmod) applies ONLY to unspecified allies; named contacts have no source cap. For named assignment choose targetId, matching socialClass, distinct durable class/explanation facts and actual confirmations in the origin map area. Can expend an existing unspecified contact into its real named identity. No NPC, social attitude, knowledge or help is created; no automatic renewal of a consumed named contact.',
    inputSchema: AssignCarousingContactSchema.shape, annotations: { idempotentHint: true },
  }, async input => toolkitTransaction(() => toolkitResult(assignXgeCarousingContact(input))))
  server.registerTool('renew_xge_carousing_contact', {
    description: 'Explicit user convention, not an added printed RAW procedure: consume ONE real new allied gain (unallocated/unspecified) from a fresh actual week for ONE last consumed named ally, same current/original class and represented map area. All five efforts follow the consumed aid receipt; equal worldTime is allowed with real event order, no extra second. Choose sourceContactId, consumedContactId, consumedEventId, targetId and distinct real meeting/class/good-graces facts. Preserve old receipts; one available promise at a time. No collective refill, old stock, reroll, fee, time, NPC, aid, attitude, secret or effect generated.',
    inputSchema: RenewCarousingContactSchema.shape, annotations: { idempotentHint: true },
  }, async input => toolkitTransaction(() => toolkitResult(renewXgeCarousingContact(input))))
  server.registerTool('consume_xge_carousing_contact', {
    description: 'Record an actual named contact’s single already-established aid or obstacle. Explicitly qualify real aid without risk to an ally’s life, or a noncriminal nonviolent hostile obstacle, using its durable local fact. For a genuinely renewed promise also confirm actualNewAidAfterRenewalConfirmed and choose a distinct aid fact not already used in its chain. Preserves bond and consumption history, produces no aid, attitude, information, damage or effect. Exact replay consumes nothing again.',
    inputSchema: ConsumeCarousingContactSchema.shape, annotations: { idempotentHint: true },
  }, async input => toolkitTransaction(() => toolkitResult(consumeXgeCarousingContact(input))))
  server.registerTool('abandon_xge_carousing', {
    description: 'Explicitly abandon unfinished Carousing, retaining real dates and any entire week expense already paid. No automatic refund, partial contact or history deletion. Completed results cannot be abandoned to reroll.',
    inputSchema: AbandonCarousingSchema.shape, annotations: { idempotentHint: true },
  }, async input => toolkitTransaction(() => toolkitResult(abandonXgeCarousing(input))))
  server.registerTool('inspect_xge_carousing', {
    description: 'Documentary read of original weeks, actual fees/effort/checks, pending assignments, unspecified-cap state, named contacts, actual uses and source complications. No die, time, cost, contact assignment, aid or information disclosure.',
    inputSchema: {}, annotations: { readOnlyHint: true, idempotentHint: true },
  }, async () => toolkitResult(inspectXgeCarousing()))
}
