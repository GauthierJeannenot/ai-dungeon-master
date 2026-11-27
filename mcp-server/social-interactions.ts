import { isDeepStrictEqual } from 'node:util'
import type { AbilityCheckResult,GameState } from '../lib/types'
import { socialActors } from '../lib/social'
import { BeginSocialInteractionSchema,RecordSocialConversationSchema,ResolveSocialRequestSchema,DiscernSocialCharacteristicSchema,
 EndSocialInteractionSchema,SocialInteractionStateSchema,socialCommand,socialReaction,socialRequestDc,socialRiskRank,
 type BeginSocialInteractionInput,type RecordSocialConversationInput,type ResolveSocialRequestInput,type DiscernSocialCharacteristicInput,
 type SocialInteractionRecord,type SocialInteractionReceipt } from '../lib/social-interaction-state'
import * as gs from './game-state'
import * as rules from './rules'
import { available as heroAvailable,hero,now,strictHero } from './hero-rules'
import { requireSocialTarget } from './social'
import { toolkitError,toolkitResult,toolkitState } from './toolkit'
import { checkedResolution,type CheckedResolution } from './toolkit-checks'
import { resolveAbilityCheck,type AbilityCheckInput } from './ability-check'
import { weatherDueIssue } from '../lib/weather-state'
import { travelDueIssue } from '../lib/travel-state'
import { castingDueIssue } from '../lib/casting-state'
import { assertSurvivalEventsResolved } from './survival'
import { assertAfflictionEvents,assertAfflictionTurnOpen } from './afflictions'

const current=()=>gs.getState().dmTools?.socialInteractions
const state=()=>toolkitState().socialInteractions??=( {version:1,records:{},receipts:{}} )
const own=<T>(record:Record<string,T>|undefined,id:string)=>record&&Object.hasOwn(record,id)?record[id]:undefined
export function assertSocialConversationAvailable(){
 if(strictHero())return heroAvailable()
 const s=gs.getState()
 if(s.hero?.pending)toolkitError('REACTION_PENDING','Resolve the held original reaction first.')
 for(const issue of [weatherDueIssue(s),travelDueIssue(s),castingDueIssue(s)])if(issue)toolkitError(issue.code,issue.message)
 assertSurvivalEventsResolved();assertAfflictionEvents();assertAfflictionTurnOpen(s.currentTurn)
}
function socialChecked(input:AbilityCheckInput,resolution:CheckedResolution){
 // The conversation rules do not require a class feature or a manufactured
 // HeroState. Historical sheets retain their real ability/proficiency/action
 // rules; only an actual supported hero can open its reaction window.
 return strictHero()?checkedResolution(input,resolution):finishSocialCheck(resolution.command,resolveAbilityCheck({...input,internalHold:true,passiveContest:true}))
}
function capacity(){if(Object.keys(current()?.receipts??{}).length>=512)toolkitError('SOCIAL_HISTORY_LIMIT','The retained social-event capacity is full; no original receipt is evicted and no die/action is spent.')}
function replay(input:{eventId:string},kind:SocialInteractionReceipt['kind']){
 const receipt=own(current()?.receipts,input.eventId)
 if(!receipt)return undefined
 if(receipt.kind!==kind||receipt.command!==socialCommand(input))toolkitError('SOCIAL_EVENT_CONFLICT','This eventId already belongs to an immutable social event. An exact replay keeps its tool and all arguments. A genuinely new conversation step needs its own unused eventId while keeping the same interactionId; do not reuse the begin eventId for statements or a request. Inspect the existing interaction first. A new ID never authorizes a reroll.')
 if(receipt.status==='resolved')return toolkitResult({...receipt.result,replayed:true})
 const pending=hero()?.pending,resolution=pending?.command.toolkitResolution as {domain?:string;command?:{eventId?:string}}|undefined
 if(resolution?.domain==='social-interaction'&&resolution.command?.eventId===input.eventId)return toolkitResult({confidential:true,alreadyPending:true,pendingReaction:pending})
 toolkitError('SOCIAL_PENDING_MISSING','This social event has no matching held original check; no new die is substituted.')
}
function save(input:{eventId:string},kind:SocialInteractionReceipt['kind'],result:Record<string,unknown>,interactionId?:string,metadata:Pick<SocialInteractionReceipt,'attitude'>={}){
 state().receipts[input.eventId]={kind,command:socialCommand(input),at:now(),status:'resolved',result,...(interactionId?{interactionId}:{}),...metadata}
 return toolkitResult(result)
}
function record(id:string){const value=own(current()?.records,id);if(!value)toolkitError('SOCIAL_INTERACTION_REQUIRED','Choose an actual recorded social interaction. Use inspect_social_interaction({}) without interactionId to recover existing IDs on the current map; never guess one or reopen an existing conversation.');return value!}
function targetFor(value:SocialInteractionRecord,targetId:string){
 if(value.closedAt!==undefined)toolkitError('SOCIAL_INTERACTION_CLOSED','This actual conversation has ended; old receipts remain replayable.')
 const actor=requireSocialTarget(targetId)
 if(actor.relationshipId!==value.relationshipId||actor.mapId!==value.mapId)toolkitError('SOCIAL_TARGET_IDENTITY_MISMATCH','Choose the same actual social identity on its recorded map, including its real encounter representation.')
 const creature=gs.getEntity(targetId)
 if(creature&&(creature.hp.current<=0||creature.conditions.some(c=>['unconscious','petrified'].includes(c))))toolkitError('SOCIAL_TARGET_CANNOT_CONVERSE','This actual target cannot participate in a conscious conversation in its present state.')
 return actor
}
function participant(id:string){
 const s=gs.getState(),actor=gs.getEntity(id)
 if(!actor||actor.hp.current<=0||actor.conditions.some(c=>['unconscious','petrified','incapacitated'].includes(c)))toolkitError('SOCIAL_PARTICIPANT_UNAVAILABLE','Choose an actually present conscious participant with a real stat block.')
 if(id!=='player'){
  const npc=gs.getNpc(id)
  if(!('hostile'in actor!)||actor!.hostile!==false||'controller'in actor!&&actor!.controller==='reactive_npc'
   ||!npc||!npc.visible||npc.disposition!=='helpful'||!gs.npcOnCurrentMap(npc)||npc.roomId!==s.currentRoomId)
   toolkitError('SOCIAL_PARTICIPANT_NOT_COOPERATIVE','A party participant requires a real currently present nonhostile helpful NPC; no stats, cooperation or reactive action are invented.')
 }
 return actor!
}
function characteristic(input:BeginSocialInteractionInput['characteristics'][number],actor:ReturnType<typeof requireSocialTarget>){
 if(input.source.kind==='authored_profile'){
  const expected={ideals:'ideal',bonds:'bond',traits:'trait'}as const,text=actor.profile.personality?.[input.source.field]?.[input.source.index]
  if(!text||expected[input.source.field]!==input.kind)toolkitError('SOCIAL_CHARACTERISTIC_SOURCE_REQUIRED','Choose an exact existing authored personality entry and its actual kind; no flaw or secret is invented.')
  return{...input,text:text!,sourceSnapshot:`authored:${actor.relationshipId}:${input.source.field}:${input.source.index}`}
 }
 const factId=input.source.factId,fact=gs.getState().worldFacts?.find(fact=>fact.id===factId)
 if(!fact||fact.mapId!==actor.mapId)toolkitError('SOCIAL_CHARACTERISTIC_SOURCE_REQUIRED','This characteristic requires an already established actual world fact on the target map, not newly supplied secret text.')
 return{...input,text:fact!.text,sourceSnapshot:socialCommand(fact)}
}
export function beginSocialInteraction(input:BeginSocialInteractionInput){
 const old=replay(input,'begin');if(old)return old
 assertSocialConversationAvailable();capacity()
 if(own(current()?.records,input.interactionId))toolkitError('SOCIAL_INTERACTION_EXISTS','An interactionId identifies its actual existing conversation; use its next conversation event rather than replacing it.')
 if(Object.keys(current()?.records??{}).length>=128)toolkitError('SOCIAL_INTERACTION_LIMIT','Keep existing conversations; their retained capacity is full.')
 const actor=requireSocialTarget(input.targetId),previous=Object.values(current()?.records??{}).filter(value=>value.relationshipId===actor.relationshipId).sort((a,b)=>b.sequence-a.sequence)
 const prior=previous[0],lastChecked=previous.find(value=>value.lastCheckEventId)
 if(prior&&prior.closedAt===undefined)toolkitError('SOCIAL_INTERACTION_ALREADY_ACTIVE',`This actual identity already has its open conversation ${prior.input.interactionId}; a new nonce cannot start another influence attempt.`)
 if(lastChecked&&(!input.renewedConversation||input.renewedConversation.afterInteractionId!==prior.input.interactionId||input.renewedConversation.afterCheckEventId!==lastChecked.lastCheckEventId))
  toolkitError('SOCIAL_RENEWED_CONVERSATION_DECISION_REQUIRED','After an actual earlier check, a new conversation requires an explicit MJ decision linked to the last ended interaction and actual last check; closing and changing IDs is not a reroll authorization.')
 if(input.renewedConversation&&!lastChecked)toolkitError('SOCIAL_RENEWED_CONVERSATION_SOURCE_INVALID','No actual earlier completed check exists for this renewed-conversation witness.')
 const characteristics=input.characteristics.map(value=>characteristic(value,actor))
 if(new Set(characteristics.map(value=>value.id)).size!==characteristics.length)toolkitError('SOCIAL_CHARACTERISTIC_DUPLICATE','Each genuinely established characteristic must have one exact ID.')
 state().records[input.interactionId]={input,relationshipId:actor.relationshipId,mapId:actor.mapId,sequence:Object.keys(state().records).length+1,startedAt:now(),attitude:input.attitude,characteristics,conversations:[],revision:0,checkSequence:0}
 return save(input,'begin',{confidential:true,eventId:input.eventId,interactionId:input.interactionId,targetId:input.targetId,relationshipId:actor.relationshipId,mapId:actor.mapId,sequence:state().records[input.interactionId].sequence,attitude:input.attitude,at:now(),mechanicalSummary:'Conversation réelle enregistrée avec son attitude explicite ; aucune confidence, coopération, action ou récompense n’est acquise.'},input.interactionId)
}
export function recordSocialConversation(input:RecordSocialConversationInput){
 const old=replay(input,'conversation');if(old)return old
 assertSocialConversationAvailable();capacity();const value=record(input.interactionId),target=targetFor(value,input.targetId)
 if(value.conversations.length>=64)toolkitError('SOCIAL_CONVERSATION_LIMIT','Keep the original conversation events; this interaction has reached its retained capacity.')
 const actors=socialActors(gs.getState())
 const opposed=input.participants.filter(p=>p.entityId===input.targetId||actors.find(actor=>actor.targetId===p.entityId)?.relationshipId===target.relationshipId).map(p=>p.entityId)
 const duplicate=new Set(input.participants.map(p=>p.entityId)).size!==input.participants.length
 if(opposed.length||duplicate)throw new rules.RuleViolation(duplicate?'SOCIAL_PARTICIPANT_DUPLICATE':'SOCIAL_PARTICIPANT_IS_TARGET',
  duplicate?'Each actual party contributor must appear once in participants.':'participants contains the opposed target. It lists party contributors, not all speakers. The target belongs in targetId; its reply may be described in source.',
  {interactionId:input.interactionId,eventId:input.eventId,targetId:input.targetId,rejectedParticipantIds:opposed,eventRecorded:false,
   agentContinuation:{domain:'social_interactions',stage:'correct_conversation',interactionId:input.interactionId,eventId:input.eventId,
    instruction:'Correct the rejected record_social_conversation with the same interactionId and still-unused eventId. Choose only actual party contributors, once each; exclude the target and its other identities. For the player acting alone, participants has only entityId=player with the actual declared statement. No die, action or event was recorded. This technical correction needs no repeated player dialogue. Continue the already declared request after the corrected record succeeds; inspect only if references are uncertain.'}})
 for(const p of input.participants)participant(p.entityId)
 const attitude=input.attitude??value.attitude,rank={hostile:0,indifferent:1,friendly:2}
 if(input.attitude!==undefined&&!input.attitudeSource)toolkitError('SOCIAL_ATTITUDE_SOURCE_REQUIRED','An actual attitude change needs its own explicit MJ adjudication source.')
 if(Math.abs(rank[attitude]-rank[value.input.attitude])>1)toolkitError('SOCIAL_ATTITUDE_STEP_LIMIT','The normal DMG procedure permits at most one attitude step during this single interaction; repeated event IDs cannot accumulate additional steps.')
 value.revision++;value.attitude=attitude;value.conversations.push({input,at:now(),attitude,revision:value.revision})
 const result={confidential:true,eventId:input.eventId,interactionId:input.interactionId,attitude,at:now(),revision:value.revision,mechanicalSummary:'Conversation et contributions réelles enregistrées. Aucun jet ni demande résolu ; l’attitude ne remplace pas la disposition de quête.'}
 const saved=save(input,'conversation',result,input.interactionId)
 // This transient continuation is not saved in the receipt: replaying an old
 // conversation must never demand another resolution of an already held die.
 return input.requestReached?toolkitResult({...result,agentContinuation:{domain:'social_interactions',stage:'resolve_request',interactionId:input.interactionId,conversationEventId:input.eventId,
  instruction:'The model explicitly recorded requestReached=true. Resolve the actual reached request before final narration, using this interactionId and conversationEventId, a distinct request eventId and its actual participating entityId. First check the campaign conditions, actual attitude, request risk and real modifiers: a certain outcome uses resolution=roleplay with an explicit MJ decision and no skill or die. A friendly no-risk request has DC0; do not roll when even the actual minimum total meets that DC. A declared attempt to persuade does not itself require a roll. Only meaningful uncertainty uses resolution=check with the relevant skill. Never invent risk, increase difficulty or expand the request to justify dice. After agreement, apply any actually established NPC disposition with reveal_npc before narrating that disposition; the social request does not apply it. Resolve a pending reaction on its original die. If a genuine missing player decision or rule prevents resolution, explain that actual blocker. Do not stop at recording or ask the player to repeat the same request.'}}):saved
}
// Advice on applying a resolved agreement, not a gameplay command or an
// automatic conversion of a reaction-table attitude into quest disposition.
function socialOutcomeApplication(targetId:string,granted:boolean){
 if(!granted)return {}
 const npc=gs.getNpc(targetId)
 return{outcomeApplication:{targetId,...(npc?{npcId:npc.id,npcDispositionAtResolution:npc.disposition}:{}),dispositionApplied:false,
  instruction:'Only this exact request was agreed. Before final narration, consult the campaign conditions if uncertain and explicitly apply any NPC disposition actually established by this agreement using reveal_npc with the exact npcId, chosen disposition and reason. This also applies to an already-visible NPC and to an agreement without dice. Do not equate friendly attitude or every granted request with helpful disposition; never grant trust just to complete an objective. If no disposition change was established, keep it unchanged and narrate only the limited agreement. Wait for the disposition tool success before claiming trust or quest cooperation. No recruitment, escort, movement, secret, item or reward follows automatically; respect authored refusals to join an expedition.'}}
}
function conversation(value:SocialInteractionRecord,eventId:string,entityId:string){
 const event=value.conversations.find(event=>event.input.eventId===eventId)
 if(!event)toolkitError('SOCIAL_CONVERSATION_REQUIRED','Choose an actual prior conversation event for this same interaction.')
 if(!event!.input.participants.some(p=>p.entityId===entityId))toolkitError('SOCIAL_ACTIVE_PARTICIPANT_REQUIRED','Only a character who really participated in this conversation may make its check.')
 for(const p of event!.input.participants)participant(p.entityId)
 return event!
}
function repeat(value:SocialInteractionRecord,decision:{afterEventId:string;source:string}|undefined){
 if(value.lastCheckEventId&&!decision)toolkitError('SOCIAL_REPEAT_DECISION_REQUIRED','A further influence/characteristic check needs the MJ’s explicit present decision that another attempt is meaningful, not a new nonce.')
 if(decision&&decision.afterEventId!==value.lastCheckEventId)toolkitError('SOCIAL_REPEAT_DECISION_STALE','The repeat decision must refer to the last actual completed check of this interaction.')
}
function anchorFor(s:GameState,entityId:string,targetId:string){
 const entity=entityId==='player'?s.player:s.monsters[entityId],target=socialActors(s).find(actor=>actor.targetId===targetId)
 if(!entity||!target)return undefined
 return{mapId:s.currentMapId!,roomId:s.currentRoomId,position:{...s.player.position},phase:s.phase,at:s.worldTimeSeconds??0,currentTurn:s.currentTurn,turnCounter:s.turnCounter??0,actionCredits:entityId==='player'?s.hero?.actionCredits:undefined,actionUsed:Boolean(s.actionUsed[entityId]),entityId,entityPosition:{...entity.position},targetId,targetPosition:{...target.position},targetMapId:target.mapId}
}
function startCheck(input:ResolveSocialRequestInput|DiscernSocialCharacteristicInput,kind:'request'|'insight',value:SocialInteractionRecord){
 rules.validateAbilityCheck(input.entityId)
 state().receipts[input.eventId]={kind,command:socialCommand(input),interactionId:input.interactionId,at:now(),status:'pending',revision:value.revision,checkSequence:value.checkSequence+1,anchor:anchorFor(gs.getState(),input.entityId,input.targetId),policy:'standard2014',dcModifier:0,attitude:value.attitude}
}
export function resolveSocialRequest(input:ResolveSocialRequestInput){
 const old=replay(input,'request');if(old)return old
 assertSocialConversationAvailable();capacity();const value=record(input.interactionId),actor=targetFor(value,input.targetId),event=conversation(value,input.conversationEventId,input.entityId)
 if(!event.input.requestReached)toolkitError('SOCIAL_REQUEST_NOT_REACHED','The actual conversation has not yet reached its request/demand/suggestion; this is an MJ fact, never parsed from dialogue.')
 repeat(value,input.repeatDecision)
 if(input.resolution==='check'&&input.roleplayDecision||input.resolution==='roleplay'&&(!input.roleplayDecision||input.skill))toolkitError('SOCIAL_RESOLUTION_ARGUMENTS','Choose either a real Charisma check, or the MJ’s explicit actual roleplay decision without a skill/die.')
 if(input.roleplayDecision?.granted&&input.request.impossibleReason)toolkitError('SOCIAL_REQUEST_IMPOSSIBLE','An explicitly impossible request cannot also be granted by the roleplay decision.')
 const baseDc=socialRequestDc(value.attitude,input.request.risk)
 if(input.resolution==='roleplay'||input.request.impossibleReason||value.input.diplomacyImpossible||baseDc===null){
  const granted=input.resolution==='roleplay'&&Boolean(input.roleplayDecision?.granted)&&!value.input.diplomacyImpossible
  const reason=input.request.impossibleReason??value.input.diplomacyImpossible?.source??(input.resolution==='roleplay'?input.roleplayDecision!.source:'The requested risk/sacrifice is beyond this attitude’s published reaction table.')
  return save(input,'request',{confidential:true,eventId:input.eventId,interactionId:input.interactionId,at:now(),resolution:input.resolution,requestGranted:granted,acceptedRisk:granted?input.request.risk:null,reason,
   playerResult:{request:input.request.description,granted},...socialOutcomeApplication(input.targetId,granted),mechanicalSummary:'Décision explicite sans jet : aucune volonté, confidence, récompense, position ou disposition de quête n’est exécutée.'},input.interactionId,{attitude:value.attitude})
 }
 const others=event.input.participants.filter(p=>p.entityId!==input.entityId),advantage=others.some(p=>p.contribution==='positive'),disadvantage=others.some(p=>p.contribution==='negative')
 startCheck(input,'request',value)
 return socialChecked({entityId:input.entityId,ability:'cha',skill:input.skill,targetId:input.targetId,dc:baseDc,socialProcedure:{helpSourceIds:others.filter(p=>p.contribution==='positive').map(p=>p.entityId)},advantage,disadvantage,
  ...(advantage||disadvantage?{advantageReason:'Contributions substantielles réellement établies dans la conversation sélectionnée (DMG2014).'}:{}),label:'Réaction à la demande sociale explicite'},
  {domain:'social-interaction',command:{eventId:input.eventId}})
}
export function discernSocialCharacteristic(input:DiscernSocialCharacteristicInput){
 const old=replay(input,'insight');if(old)return old
 assertSocialConversationAvailable();capacity();const value=record(input.interactionId);targetFor(value,input.targetId);const event=conversation(value,input.conversationEventId,input.entityId)
 if(!event.input.sufficientForInsight)toolkitError('SOCIAL_CHARACTERISTIC_CONVERSATION_REQUIRED','The MJ must first establish enough actual conversation to get a sense of this personality; no duration or trait is invented.')
 if(!value.characteristics.some(c=>c.id===input.characteristicId))toolkitError('SOCIAL_CHARACTERISTIC_SOURCE_REQUIRED','Choose a genuinely prepared characteristic, not new secret text.')
 repeat(value,input.repeatDecision);startCheck(input,'insight',value)
 return socialChecked({entityId:input.entityId,ability:'wis',skill:'insight',dc:input.dc,label:'Discerner une caractéristique établie'}, {domain:'social-interaction',command:{eventId:input.eventId}})
}
export function finishSocialCheck(command:Record<string,unknown>,check:AbilityCheckResult){
 const id=String(command.eventId),receipt=own(current()?.receipts,id)
 if(!receipt||receipt.status!=='pending'||!receipt.interactionId||!receipt.anchor)toolkitError('SOCIAL_CONTINUATION_INVALID','This held check requires its one actual pending social event.')
 const value=record(receipt!.interactionId!),input=receipt!.kind==='request'?ResolveSocialRequestSchema.parse(JSON.parse(receipt!.command)):DiscernSocialCharacteristicSchema.parse(JSON.parse(receipt!.command))
 targetFor(value,input.targetId)
 if(value.revision!==receipt!.revision||receipt!.checkSequence!==value.checkSequence+1||socialCommand(anchorFor(gs.getState(),input.entityId,input.targetId))!==socialCommand(receipt!.anchor)||check.entityId!==input.entityId||check.ability!==(receipt!.kind==='request'?'cha':'wis'))toolkitError('SOCIAL_CONTINUATION_INVALID','The original conversation, actor, attitude and action checkpoint must remain exact during its held check.')
 let result:Record<string,unknown>
 if(receipt!.kind==='request'){
  const request=input as ResolveSocialRequestInput,table=socialReaction(receipt!.attitude!,check.roll.total-(receipt!.dcModifier??0)),granted=table.acceptedRisk!==null&&socialRiskRank(table.acceptedRisk)>=socialRiskRank(request.request.risk)
  result={confidential:true,eventId:id,interactionId:input.interactionId,at:now(),resolution:'check',policy:receipt!.policy,check,attitude:receipt!.attitude,tableThreshold:table.threshold,tableCapacity:table.acceptedRisk,reaction:table.kind,requestGranted:granted,acceptedRisk:granted?request.request.risk:null,
   playerResult:{request:request.request.description,granted},...socialOutcomeApplication(input.targetId,granted),mechanicalSummary:'Table de réaction résolue pour cette demande seulement ; aucun ordre, déplacement, secret, objet, récompense ou objectif de quête exécuté automatiquement.'}
 }else{
  const insight=input as DiscernSocialCharacteristicInput,success=check.roll.total>=insight.dc,misidentified=!success&&check.roll.total<=insight.dc-10&&Boolean(insight.falseInterpretation),actual=value.characteristics.find(c=>c.id===insight.characteristicId)!
  const reading=success?actual.text:misidentified?insight.falseInterpretation!.text:undefined
  result={confidential:true,eventId:id,interactionId:input.interactionId,at:now(),check,success,misidentified,...(reading?{playerResult:{reading}}:{playerResult:{noReading:true}}),mechanicalSummary:'Une lecture précise de la conversation seulement ; une erreur ne crée ni trait véritable ni secret du monde.'}
 }
 if(gs.getState().phase==='combat')rules.recordAction(input.entityId)
 receipt!.status='resolved';receipt!.result=result;delete receipt!.anchor;value.lastCheckEventId=id;value.checkSequence=receipt!.checkSequence!
 gs.addLogEntry({round:gs.getState().round,turn:input.entityId,action:receipt!.kind==='request'?'Interaction sociale':'Intuition sociale',mechanicalDetail:check.roll.detail})
 return toolkitResult(result)
}
export function endSocialInteraction(input:ReturnType<typeof EndSocialInteractionSchema.parse>){
 const old=replay(input,'end');if(old)return old
 assertSocialConversationAvailable();capacity();const value=record(input.interactionId)
 if(value.closedAt!==undefined)toolkitError('SOCIAL_INTERACTION_CLOSED','This actual conversation is already closed; replay its original closure event.')
 const actor=socialActors(gs.getState()).find(actor=>actor.targetId===input.targetId)
 if(input.targetId!==value.input.targetId&&actor?.relationshipId!==value.relationshipId)toolkitError('SOCIAL_TARGET_IDENTITY_MISMATCH','Closing bookkeeping must name this recorded target or its actual same-identity representation; no actor is activated.')
 value.closedAt=now();value.closedEventId=input.eventId
 return save(input,'end',{confidential:true,eventId:input.eventId,interactionId:input.interactionId,at:now(),mechanicalSummary:'Cette interaction est terminée ; ses reçus restent conservés. Son attitude temporaire ne modifie pas la disposition de quête.'},input.interactionId)
}
export function inspectSocialInteraction(interactionId?:string){
 const data=current(),records=interactionId?[record(interactionId)]:Object.values(data?.records??{}).filter(value=>value.mapId===gs.getState().currentMapId),ids=new Set(records.map(value=>value.input.interactionId))
 const resolvedEvents=Object.entries(data?.receipts??{}).filter(([,receipt])=>receipt.interactionId&&ids.has(receipt.interactionId)&&['request','insight'].includes(receipt.kind)&&receipt.status==='resolved').map(([eventId,receipt])=>({eventId,...receipt.result}))
 return{confidential:true,policy:'standard2014',records,resolvedEvents,
  instructions:'Référence MJ confidentielle. Ne divulguer aucun trait ou faux indice avant un résultat final qui le permet. Attitude et disposition de quête sont distinctes ; les résultats ne commandent aucune autre mutation.'}
}

export function validateSocialInteractionState(s:GameState):string[]{
 const data=s.dmTools?.socialInteractions;if(!data)return[]
 if(!SocialInteractionStateSchema.safeParse(data).success)return['Invalid structured social interaction state.']
 const errors:string[]=[],at=s.worldTimeSeconds??0,rank={hostile:0,indifferent:1,friendly:2}
 if(Object.keys(data.records).length>128||Object.keys(data.receipts).length>512)errors.push('Structured social retained-event capacity exceeded.')
 for(const [id,value]of Object.entries(data.records)){
  const initial=own(data.receipts,value.input.eventId)
  if(id!==value.input.interactionId||value.startedAt>at||initial?.kind!=='begin'||initial.command!==socialCommand(value.input)||initial.at!==value.startedAt||initial.interactionId!==id
   ||initial.result?.relationshipId!==value.relationshipId||initial.result?.mapId!==value.mapId||initial.result?.sequence!==value.sequence)errors.push(`Social interaction ${id} lacks its exact initial source event.`)
  const previous=Object.values(data.records).filter(r=>r.relationshipId===value.relationshipId&&r.sequence<value.sequence).sort((a,b)=>b.sequence-a.sequence),prior=previous[0],lastChecked=previous.find(r=>r.lastCheckEventId)
  if(prior&&(prior.closedAt===undefined||prior.closedAt>value.startedAt)||lastChecked&&(!value.input.renewedConversation||value.input.renewedConversation.afterInteractionId!==prior.input.interactionId||value.input.renewedConversation.afterCheckEventId!==lastChecked.lastCheckEventId)
   ||value.input.renewedConversation&&!lastChecked)errors.push(`Social interaction ${id} lacks a real ordered renewed-conversation decision.`)
  let attitude=value.input.attitude,index=0,lastAt=value.startedAt
  for(const event of value.conversations){
   const receipt=own(data.receipts,event.input.eventId);index++;attitude=event.input.attitude??attitude
   if(event.input.interactionId!==id||event.revision!==index||event.attitude!==attitude||Math.abs(rank[attitude]-rank[value.input.attitude])>1||event.at<lastAt||event.at>at
    ||receipt?.kind!=='conversation'||receipt.command!==socialCommand(event.input)||receipt.interactionId!==id||receipt.at!==event.at)errors.push(`Social conversation ${event.input.eventId} lacks its ordered actual witness.`)
   lastAt=event.at
  }
  if(value.revision!==index||value.attitude!==attitude||new Set(value.characteristics.map(c=>c.id)).size!==value.characteristics.length
   ||value.characteristics.length!==value.input.characteristics.length||value.characteristics.some((c,i)=>socialCommand({id:c.id,kind:c.kind,source:c.source})!==socialCommand(value.input.characteristics[i])))errors.push(`Social interaction ${id} has inconsistent attitude/characteristic provenance.`)
  if(value.closedAt!==undefined&&(value.closedAt<lastAt||value.closedAt>at||!value.closedEventId||data.receipts[value.closedEventId]?.kind!=='end'||data.receipts[value.closedEventId]?.interactionId!==id))errors.push(`Social interaction ${id} has no actual closure witness.`)
  if(value.lastCheckEventId){const last=own(data.receipts,value.lastCheckEventId);if(!last||last.status!=='resolved'||!['request','insight'].includes(last.kind)||last.interactionId!==id||!last.result?.check)errors.push(`Social interaction ${id} has no completed-check witness.`)}
  const checks=Object.entries(data.receipts).filter(([,r])=>r.interactionId===id&&r.status==='resolved'&&r.result?.check).sort((a,b)=>(a[1].checkSequence??0)-(b[1].checkSequence??0))
  if(checks.length!==value.checkSequence||checks.some(([,r],i)=>r.checkSequence!==i+1)||checks.at(-1)?.[0]!==value.lastCheckEventId)errors.push(`Social interaction ${id} has inconsistent monotone completed-check events.`)
 }
 const ordered=Object.values(data.records).sort((a,b)=>a.sequence-b.sequence)
 if(ordered.some((value,i)=>value.sequence!==i+1))errors.push('Social interactions must retain their monotone actual creation sequence.')
 const pending=Object.entries(data.receipts).filter(([,receipt])=>receipt.status==='pending')
 if(pending.length>1)errors.push('Only one original social check may be held.')
 for(const [id,receipt]of Object.entries(data.receipts)){
  try{
   const schemas={begin:BeginSocialInteractionSchema,conversation:RecordSocialConversationSchema,request:ResolveSocialRequestSchema,insight:DiscernSocialCharacteristicSchema,end:EndSocialInteractionSchema}
   const input=schemas[receipt.kind].parse(JSON.parse(receipt.command))
   if(input.eventId!==id||receipt.at>at||receipt.status==='resolved'&&(!receipt.result||receipt.anchor)||receipt.status==='pending'&&(!receipt.anchor||!['request','insight'].includes(receipt.kind)||receipt.result))throw Error('event')
   if('interactionId'in input&&input.interactionId!==receipt.interactionId)throw Error('interaction source')
   if(receipt.result&&(receipt.result.eventId!==id||receipt.result.at!==receipt.at||receipt.result.interactionId!==receipt.interactionId))throw Error('result source')
   if(receipt.status==='pending'){
    const resolution=s.hero?.pending?.command.toolkitResolution as {domain?:string;command?:{eventId?:string}}|undefined
    const checkedInput=input as ResolveSocialRequestInput|DiscernSocialCharacteristicInput
    if(resolution?.domain!=='social-interaction'||resolution.command?.eventId!==id||!receipt.interactionId||data.records[receipt.interactionId]?.revision!==receipt.revision
     ||socialCommand(anchorFor(s,checkedInput.entityId,checkedInput.targetId))!==socialCommand(receipt.anchor)||data.records[receipt.interactionId]?.closedAt!==undefined||receipt.checkSequence!==data.records[receipt.interactionId]?.checkSequence+1)throw Error('held')
   }
   if(receipt.result?.check){
    const result=receipt.result,check=result.check as AbilityCheckResult
    if(check.entityId!==(input as ResolveSocialRequestInput).entityId||!Number.isFinite(check.roll?.total)||!receipt.interactionId||!data.records[receipt.interactionId])throw Error('check')
    const value=data.records[receipt.interactionId],revision=receipt.revision??-1,attitude=revision===0?value.input.attitude:value.conversations[revision-1]?.attitude
    const checkInput=input as ResolveSocialRequestInput|DiscernSocialCharacteristicInput,conversation=value.conversations.find(c=>c.input.eventId===checkInput.conversationEventId)
    if(receipt.attitude!==attitude||!conversation||conversation.at>receipt.at||!conversation.input.participants.some(p=>p.entityId===check.entityId)||!receipt.checkSequence)throw Error('conversation source')
    const prior=receipt.checkSequence===1?undefined:Object.entries(data.receipts).find(([,r])=>r.interactionId===receipt.interactionId&&r.status==='resolved'&&r.checkSequence===receipt.checkSequence!-1)?.[0]
    if(checkInput.repeatDecision?.afterEventId!==prior)throw Error('repeat source')
    if(receipt.kind==='request'){
     const request=input as ResolveSocialRequestInput,table=socialReaction(receipt.attitude!,check.roll.total-(receipt.dcModifier??0)),granted=table.acceptedRisk!==null&&socialRiskRank(table.acceptedRisk)>=socialRiskRank(request.request.risk)
     // JSONB can reorder result keys. Compare values while keeping stored
     // command strings (the immutable event/replay witnesses) unchanged.
     if(result.requestGranted!==granted||result.tableThreshold!==table.threshold||result.tableCapacity!==table.acceptedRisk||result.reaction!==table.kind||result.acceptedRisk!==(granted?request.request.risk:null)
      ||!isDeepStrictEqual(result.playerResult,{request:request.request.description,granted})||check.ability!=='cha'||check.social?.policy!==receipt.policy
      ||check.social?.dcModifier!==receipt.dcModifier||check.social?.baseDc!==socialRequestDc(receipt.attitude!,request.request.risk)||check.dc!==check.social!.baseDc+receipt.dcModifier!)throw Error('table')
     if(receipt.policy!=='standard2014'||receipt.dcModifier!==0)throw Error('policy')
    }else if(receipt.kind==='insight'){
     const insight=input as DiscernSocialCharacteristicInput,success=check.roll.total>=insight.dc,misidentified=!success&&check.roll.total<=insight.dc-10&&Boolean(insight.falseInterpretation)
     const actual=data.records[receipt.interactionId!].characteristics.find(c=>c.id===insight.characteristicId),reading=success?actual?.text:misidentified?insight.falseInterpretation!.text:undefined
     if(!actual||result.success!==success||result.misidentified!==misidentified||check.ability!=='wis'||check.dc!==insight.dc||!isDeepStrictEqual(result.playerResult,reading?{reading}:{noReading:true}))throw Error('insight')
    }
   }
   if(receipt.kind==='request'&&receipt.status==='resolved'&&!receipt.result?.check){
    const request=input as ResolveSocialRequestInput,value=receipt.interactionId?data.records[receipt.interactionId]:undefined
    if(!value||!receipt.attitude||request.resolution==='check'&&!request.request.impossibleReason&&!value.input.diplomacyImpossible&&socialRequestDc(receipt.attitude,request.request.risk)!==null)throw Error('no-die decision')
    const granted=request.resolution==='roleplay'&&Boolean(request.roleplayDecision?.granted)&&!value.input.diplomacyImpossible&&!request.request.impossibleReason
    if(receipt.result?.requestGranted!==granted||receipt.result?.acceptedRisk!==(granted?request.request.risk:null)||!isDeepStrictEqual(receipt.result?.playerResult,{request:request.request.description,granted}))throw Error('roleplay')
   }
  }catch{errors.push(`Invalid structured social event ${id}.`)}
 }
 return errors
}
