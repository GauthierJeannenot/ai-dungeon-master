import { z } from 'zod'

const Id=z.string().min(1).max(160).regex(/^[a-zA-Z0-9][a-zA-Z0-9_:.-]*$/).refine(id=>!['constructor','prototype','__proto__'].includes(id))
const EventId=Id.describe('Unique ID of this actual event, distinct from every earlier accepted event including the interaction opening. Accepted or held events replay with exactly the same tool and arguments. A rejected call creates no receipt: correct that unrecorded event using its same eventId. Changing IDs never authorizes a reroll.')
const InteractionId=Id.describe('Stable ID of the whole actual conversation. Reuse the ID returned by begin_social_interaction across tools and turns. Recover existing IDs with inspect_social_interaction({}); never guess or replace an open interaction.')
const ConversationEventId=Id.describe('Exact eventId of a successful record_social_conversation in this interaction, not the begin eventId, an interactionId or a rejected event.')
const Text=z.string().trim().min(1).max(1600),At=z.number().nonnegative()
export const SocialPolicySchema=z.literal('standard2014')
export const SocialAttitudeSchema=z.enum(['friendly','indifferent','hostile'])
export type SocialAttitude=z.infer<typeof SocialAttitudeSchema>
export const SocialRiskSchema=z.enum(['none','minor','significant'])
export type SocialRisk=z.infer<typeof SocialRiskSchema>
const CharacteristicSource=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('authored_profile'),field:z.enum(['ideals','bonds','traits']),index:z.number().int().nonnegative()}).strict(),
 z.object({kind:z.literal('world_fact'),factId:Id}).strict(),
])
const Characteristic=z.object({id:Id,kind:z.enum(['ideal','bond','flaw','trait']),source:CharacteristicSource}).strict()
export const BeginSocialInteractionSchema=z.object({eventId:EventId,interactionId:InteractionId,targetId:Id,attitude:SocialAttitudeSchema,source:Text,
 renewedConversation:z.object({afterInteractionId:Id,afterCheckEventId:Id,source:Text}).strict().optional(),
 characteristics:z.array(Characteristic).max(24).default([]),
 diplomacyImpossible:z.object({source:Text}).strict().optional(),
}).strict()
export const RecordSocialConversationSchema=z.object({eventId:EventId,interactionId:InteractionId,targetId:Id,source:Text,
 requestReached:z.boolean().describe('True when the actual request has been reached. After this record succeeds, continue to resolve_social_request for that request; recording alone resolves no persuasion check.'),sufficientForInsight:z.boolean().describe('Whether enough conversation exists to discern a prepared characteristic. This is not a prerequisite for Persuasion.'),
 participants:z.array(z.object({entityId:Id.describe('A party contributor, e.g. player. Must differ from targetId AND every other representation of the target identity. This array is not a list of everyone speaking.'),statement:Text.describe('What this party contributor actually expressed, including descriptive roleplay. Do not invent player words or put the target reply here.'),contribution:z.enum(['neutral','positive','negative']),source:Text}).strict()).min(1).max(8).describe('PARTY side only, once per entity. For a player persuading one NPC alone, supply exactly one participant with entityId=player; the NPC belongs only in targetId. Other contributors require actual party participation. Describe any target reply in source, not in this array.'),
 attitude:SocialAttitudeSchema.optional(),attitudeSource:Text.optional(),
}).strict()
const Repeat=z.object({afterEventId:Id,source:Text}).strict()
export const ResolveSocialRequestSchema=z.object({eventId:EventId,interactionId:InteractionId,targetId:Id,conversationEventId:ConversationEventId,entityId:Id.describe('Exact ID of the real party participant making this request, e.g. player; must appear in the selected conversation participants.'),
 request:z.object({id:Id,description:Text,risk:SocialRiskSchema,source:Text,
  impossibleReason:Text.optional(),
 }).strict(),
 resolution:z.enum(['check','roleplay']).describe('Use roleplay with an explicit MJ decision for a certain outcome, including authored ordinary cooperation or a request whose actual minimum check total already reaches its DC. Use check only for meaningful uncertainty in the actual request; saying persuade does not require dice. Never invent risk or raise the DC to force uncertainty.'),skill:z.enum(['persuasion','deception','intimidation']).optional(),
 roleplayDecision:z.object({granted:z.boolean(),source:Text}).strict().optional(),repeatDecision:Repeat.optional(),
}).strict()
export const DiscernSocialCharacteristicSchema=z.object({eventId:EventId,interactionId:InteractionId,targetId:Id,conversationEventId:ConversationEventId,entityId:Id,
 characteristicId:Id,dc:z.number().int().min(0).max(100),source:Text,
 falseInterpretation:z.object({text:Text,source:Text}).strict().optional(),repeatDecision:Repeat.optional(),
}).strict()
export const EndSocialInteractionSchema=z.object({eventId:EventId,interactionId:InteractionId,targetId:Id,source:Text}).strict()
export type BeginSocialInteractionInput=z.infer<typeof BeginSocialInteractionSchema>
export type RecordSocialConversationInput=z.infer<typeof RecordSocialConversationSchema>
export type ResolveSocialRequestInput=z.infer<typeof ResolveSocialRequestSchema>
export type DiscernSocialCharacteristicInput=z.infer<typeof DiscernSocialCharacteristicSchema>
const Cell=z.object({x:z.number().int().nonnegative(),y:z.number().int().nonnegative()}).strict()
const Anchor=z.object({mapId:Id,roomId:z.string().nullable(),position:Cell,phase:z.enum(['exploration','combat','dialogue']),
 at:At,
 currentTurn:z.string().nullable(),turnCounter:z.number().int().nonnegative(),actionCredits:z.number().int().nonnegative().optional(),actionUsed:z.boolean(),
 entityId:Id,entityPosition:Cell,targetId:Id,targetPosition:Cell,targetMapId:Id,
}).strict()
const StoredCharacteristic=Characteristic.extend({text:Text,sourceSnapshot:Text})
const Conversation=z.object({input:RecordSocialConversationSchema,at:At,attitude:SocialAttitudeSchema,revision:z.number().int().positive()}).strict()
const Record=z.object({input:BeginSocialInteractionSchema,relationshipId:Id,mapId:Id,sequence:z.number().int().positive(),startedAt:At,attitude:SocialAttitudeSchema,
 characteristics:z.array(StoredCharacteristic).max(24),conversations:z.array(Conversation).max(64),revision:z.number().int().nonnegative(),
 checkSequence:z.number().int().nonnegative(),lastCheckEventId:Id.optional(),closedAt:At.optional(),closedEventId:Id.optional(),
}).strict()
const Receipt=z.object({kind:z.enum(['begin','conversation','request','insight','end']),command:z.string(),at:At,
 interactionId:Id.optional(),revision:z.number().int().nonnegative().optional(),checkSequence:z.number().int().positive().optional(),status:z.enum(['pending','resolved']),
 anchor:Anchor.optional(),policy:SocialPolicySchema.optional(),dcModifier:z.literal(0).optional(),attitude:SocialAttitudeSchema.optional(),
 result:z.record(z.string(),z.unknown()).optional(),
}).strict()
export const SocialInteractionStateSchema=z.object({version:z.literal(1),
 records:z.record(z.string(),Record),receipts:z.record(z.string(),Receipt),
}).strict()
export type SocialInteractionState=z.infer<typeof SocialInteractionStateSchema>
export type SocialInteractionRecord=z.infer<typeof Record>
export type SocialInteractionReceipt=z.infer<typeof Receipt>
export const socialCommand=(value:unknown):string=>JSON.stringify(value)

// DMG 2014, Social Interaction / Conversation Reaction. A table band states
// the extent of help, not a command, secret, reward or invented willingness.
export function socialReaction(attitude:SocialAttitude,total:number){
 const threshold=total>=20?20:total>=10?10:total>=0?0:null
 if(threshold===null)return{threshold,kind:'no_table_threshold' as const,acceptedRisk:null}
 const bands={friendly:{0:'none',10:'minor',20:'significant'},indifferent:{0:null,10:'none',20:'minor'},hostile:{0:null,10:null,20:'none'}} as const
 const acceptedRisk=bands[attitude][threshold]
 const kind=acceptedRisk!==null?'help' as const:attitude==='hostile'&&threshold===0?'opposition' as const:'no_help_no_harm' as const
 return{threshold,kind,acceptedRisk}
}
export function socialRequestDc(attitude:SocialAttitude,risk:SocialRisk):number|null{
 const dcs={friendly:{none:0,minor:10,significant:20},indifferent:{none:10,minor:20,significant:null},hostile:{none:20,minor:null,significant:null}} as const
 return dcs[attitude][risk]
}
export const socialRiskRank=(risk:SocialRisk)=>({none:0,minor:1,significant:2}[risk])

// Compatibility at saved-state boundaries only; never converts old outcomes
// or held rolls to different rules. Nonstandard check receipts still fail the
// standard schema rather than being silently recalculated.
export function migrateSocialState<T>(input: T): T {
 if (!input || typeof input !== 'object') return input
 const original = input as Record<string, any>
 const social = original.dmTools?.socialInteractions
 if (!Object.hasOwn(original, 'socialRelationships') && !social?.policy
   && !Object.values(social?.receipts ?? {}).some((r: any) => r.kind === 'policy' || r.policyEventId)) return input
 const state = structuredClone(original)
 delete state.socialRelationships
 const data = state.dmTools?.socialInteractions
 if (data) {
  delete data.policy
  for (const [id, receipt] of Object.entries(data.receipts ?? {}) as [string, any][]) {
   if (receipt.kind === 'policy') delete data.receipts[id]
   else delete receipt.policyEventId
  }
 }
 return state as T
}
