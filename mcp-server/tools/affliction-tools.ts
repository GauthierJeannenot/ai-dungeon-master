import { assertGreaterBrewingIdAvailable } from '../toolkit'
import { assertGameTimeAdvance } from '../time-preflight'
import { applySewerPlagueRestSave, preflightSewerPlagueContact, resolveSewerPlagueOnset, resolveSewerPlagueRest } from '../sewer-plague'
import { retainRestCheckpointForSourceEvent } from '../resting'
import type { SavingThrowResult } from '../../lib/types'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { AFFLICTION_IDS, type AfflictionRecord } from '../../lib/affliction-state'
import { AFFLICTIONS } from '../../lib/srd/afflictions'
import { ToolkitIdSchema,ToolkitCellSchema } from '../../lib/dm-tool-state'
import { afflictions,applyAfflictionSave,dueAfflictionEvent,activeAfflictions,wakeAfflictionSleeper,commitAfflictionTurnEnd,afflictionSavingThrowInput } from '../afflictions'
import { available,assertHero,hero,now,spendHeroAction,advanceHeroTime } from '../hero-rules'
import { hasRelaxationRecoveryAdvantage } from '../xge-relaxation'
import { savedResolution,registerCheckedResolution } from '../toolkit-checks'
import { toolkitResult,toolkitError,toolkitTransaction,toolkitLocation,assertToolkitPreparation,assertToolkitReach } from '../toolkit'
import { afterInventoryChange,equipmentId } from '../equipment'
import * as gs from '../game-state'
import * as rules from '../rules'
import { assertKnockoutDamageSupported } from '../nonlethal'

export function registerAfflictionTools(server:McpServer){
 registerCheckedResolution('sewer-plague-rest', (command, save) => applySewerPlagueRestSave(command, save as SavingThrowResult))
 registerCheckedResolution('affliction-save',(command,save)=>{
  const record=afflictions().records[String(command.afflictionId)]
  if(!record)toolkitError('AFFLICTION_NOT_FOUND','The held source event is absent.')
  const result=gs.withPhysicalCreatureResolution([record.targetId],()=>applyAfflictionSave(record,{...save,success:save.success===true},String(command.event)==='initial'?'initial':'repeat'))
  return toolkitResult({...result,mechanicalSummary:`${AFFLICTIONS[record.templateId].label} : sauvegarde ${save.success?'réussie':'échouée'}, état ${record.status}. Aucun secret ni mensonge de PNJ n'est révélé automatiquement.`})
 })
 server.registerTool('inspect_afflictions',{
  description:'Confidential MJ reference. No arguments lists implemented exact DMG 2014 poison/disease templates. targetId reads tracked afflictions and currently due events without saving, curing, revealing hidden contamination or spending an action. Sewer Plague shows its retained incubation, due onset and actual completed long-rest saves.',
  inputSchema:{targetId:z.string().optional()},annotations:{readOnlyHint:true},
 },async({targetId})=>toolkitTransaction(()=>toolkitResult(targetId?{
  records:Object.values(gs.getState().dmTools?.afflictions?.records??{}).filter(r=>r.targetId===targetId).map(r=>({...r,dueEvent:dueAfflictionEvent(r)})),
  notice:'Confidential cause/state, not automatic player identification or discovery. petrificationPause preserves the source while its symptoms and time are suspended; it is not a cure.'
 }:{templates:AFFLICTIONS,source:'Supplied DMG 2014: Sample Poisons / Sight Rot / Sewer Plague; lib/srd/affliction-sources.json',limitations:['Scene exposure only; no free player poisoning, weapon coating, harvesting, purchasing or dose acquisition.','14 named poisons, Sight Rot, and ground-contact Sewer Plague for the actual player. No carrier bite or NPC Sewer Plague. Dedicated Cackle Fever tools represent its actual humanoid carrier and turn contagion; other madness procedures remain separate.','Source events that require saves must be explicitly resolved by the agent with resolve_affliction_event; no fabricated MCP calls.','Truth serum constrains knowing lies, never forces speech, truth or secret disclosure.']})))
 server.registerTool('create_affliction_source',{
  description:'MJ preparation outside combat: establish a physically located scene contamination from an exact implemented DMG poison, Sight Rot or Sewer Plague template, with explicit source ID, name, location and number of actual exposures available (1-20). No infection, ownership, poison fabrication, discovery or player action is granted. Same immutable definition is idempotent and never replenishes used doses.',
  inputSchema:{sourceId:ToolkitIdSchema,templateId:z.enum(AFFLICTION_IDS),name:z.string().trim().min(1).max(80),cell:ToolkitCellSchema,doses:z.number().int().min(1).max(20)},
 },async input=>toolkitTransaction(()=>{
  if(input.templateId==='cackle_fever')toolkitError('CACKLE_DEDICATED_SOURCE_REQUIRED','Cackle Fever requires its actual infected humanoid carrier and real turn contagion, never ground contamination.')
  assertToolkitPreparation();const data=afflictions(),creation=JSON.stringify(input),existing=data.sources[input.sourceId]
  if(existing){if(existing.creation!==creation)toolkitError('AFFLICTION_SOURCE_CONFLICT','This source ID has another immutable definition.');return toolkitResult({success:true,alreadyCreated:true,source:existing})}
  if(Object.keys(data.sources).length>=64)toolkitError('AFFLICTION_SOURCE_LIMIT','At most 64 source contaminations per session.')
  const source={id:input.sourceId,templateId:input.templateId,name:input.name,...toolkitLocation(input.cell),cell:input.cell,doses:input.doses,creation}
  data.sources[input.sourceId]=source;return toolkitResult({success:true,source,notice:'Confidential scene preparation only; explicit exposure remains required.'})
 }))
 server.registerTool('expose_affliction',{
  description:'Explicit MJ scene event, not a player poisoning action. Resolve an established ingestion, inhalation, exposed-skin contact or injury at one prepared source location, with exact engine victim, source delivery and unique eventId. Costs one source exposure even if saved. Source DC, damage, incubation and duration are fixed. Ingestion requires an entire dose, injury an actual established piercing/slashing wound; the agent must establish that fiction, this tool never invents or attacks for it. Midnight Tears additionally requires the explicit next midnightAt world timestamp (within the next 24h): world clock does not guess a fictional calendar. Narrative NPCs have no automatic stats or exposure.',
  inputSchema:{sourceId:ToolkitIdSchema,eventId:ToolkitIdSchema,targetId:z.string(),delivery:z.enum(['ingested','inhaled','contact','injury']),midnightAt:z.number().int().nonnegative().optional()},
 },async input=>toolkitTransaction(()=>{
  available();const data=afflictions(),source=data.sources[input.sourceId]
  if(!source)toolkitError('AFFLICTION_SOURCE_UNKNOWN','Choose an exact prepared source.')
  const id=`${input.sourceId}:${input.eventId}`,creation=JSON.stringify(input),old=data.records[id]
  if(old){if(old.creation!==creation)toolkitError('AFFLICTION_EVENT_CONFLICT','This exposure ID has different immutable arguments.');return toolkitResult({success:true,alreadyResolved:true,affliction:old,pendingReaction:hero().pending})}
  if(Object.keys(data.records).length>=512)toolkitError('AFFLICTION_EVENT_LIMIT','At most 512 exposure receipts per session.')
  const target=gs.getEntity(input.targetId),spec=AFFLICTIONS[source.templateId]
  if(target)assertKnockoutDamageSupported(target,1)
  if(!target||input.targetId!=='player'&&'isAlive'in target&&!target.isAlive||input.targetId==='player'&&gs.getPlayer().deathSaves?.dead)toolkitError('AFFLICTION_TARGET_INVALID','Choose an existing living engine creature; a tracked dying creature is alive, a dead creature is not.')
  const targetLocation=toolkitLocation(target!.position)
  if(targetLocation.mapId!==source.mapId||targetLocation.roomId!==source.roomId||target!.position.x!==source.cell.x||target!.position.y!==source.cell.y)
    toolkitError('SCENE_TARGET_OUT_OF_REACH','The exposed creature must physically occupy the exact source cell on the same room/map; awareness or sight is not required.')
  if(source.doses<=0)toolkitError('AFFLICTION_SOURCE_EXHAUSTED','This source has no exposures left.')
  if(input.delivery!==spec.delivery)toolkitError('AFFLICTION_DELIVERY_MISMATCH','Use the source delivery type; a toxin is not interchangeable with another exposure route.')
  if(source.templateId==='sight_rot'&&input.targetId!=='player'&&!['beast','humanoid'].includes(requireCreatureType(input.targetId)))toolkitError('DISEASE_TARGET_IMMUNE','Sight Rot affects beasts and humanoids only.')
  if (source.templateId === 'sewer_plague') preflightSewerPlagueContact(input.targetId, source.cell)
  if(source.templateId==='midnight_tears'){
   if(input.midnightAt===undefined||input.midnightAt<=now()||input.midnightAt>now()+86400)toolkitError('MIDNIGHT_TIMESTAMP_REQUIRED','Choose the established next midnight world timestamp, within the next 24 hours.')
  }else if(input.midnightAt!==undefined)toolkitError('AFFLICTION_ARGUMENT_MISMATCH','Only Midnight Tears uses an explicit midnight timestamp.')
  source.doses--
  const record:AfflictionRecord=data.records[id]={id,sourceId:source.id,targetId:input.targetId,templateId:source.templateId,eventId:input.eventId,creation,status:'pending' as const,appliedAt:now(),successes:0,lastTurn:gs.getState().turnCounter??0,unhealableDamage:0,sightPenalty:0,ointmentDoses:0,ointmentPending:false,...(input.midnightAt!==undefined?{nextAt:input.midnightAt}:{})}
  if(target!.conditions.includes('petrified')){
   record.status='ended';delete record.nextAt
   return toolkitResult({success:true,immune:true,reason:'petrified',affliction:record,notice:'Petrified immunity prevents this new poison/disease. The actual prepared exposure is spent once; no save, damage or disease is created.'})
  }
  if(input.midnightAt!==undefined)return toolkitResult({success:true,affliction:record,notice:'Contamination delayed until the explicitly established midnight. No immediate saving throw, damage or player discovery.'})
  return savedResolution(afflictionSavingThrowInput(source.templateId,input.targetId),{domain:'affliction-save',command:{afflictionId:id,event:'initial'}})
 }))
 server.registerTool('resolve_affliction_event',{
  description:'Resolve exactly one actually due affliction event. Sewer Plague onset is deterministic. Choose the exact restId for its CON11 after actual long-rest recovery, and the available removalSource when exhaustion remains mixed. Other poison events include midnight, 24-hour saves and actual source turns. The engine validates timing and remembers the turn/timestamp, so repeats cannot reroll. This is a required MJ rules event, not another player action. Bardic Inspiration can suspend and resume the exact original save. Outside combat, each six-second round creates one due repeat save; unhandled earlier rounds remain due. Explicit record required; no effect or recipient is inferred.',
  inputSchema:{afflictionId:z.string().min(1).max(180),restId:ToolkitIdSchema.optional(),removalSource:z.enum(['chase','other']).optional(),endTurn:z.boolean().optional().describe('Required true for a combat end-of-turn save: commits this actor to ending the turn, no further actions even after a successful save. Then explicitly call next_turn/pass_turn.')},
 },async input=>toolkitTransaction(()=>{
  assertHero();if(hero().pending)toolkitError('REACTION_PENDING','Resolve the pending reaction first.')
  const record=afflictions().records[input.afflictionId]
  if(!record)toolkitError('AFFLICTION_NOT_FOUND','Choose an exact tracked affliction.')
  if (record.templateId === 'sewer_plague') {
   if (input.endTurn !== undefined || input.removalSource !== undefined && input.restId === undefined)
    toolkitError('AFFLICTION_EVENT_ARGUMENTS', 'Only the exact Sewer Plague rest save selects an exhaustion removal source; it is not a combat end turn.')
   if (input.restId) return resolveSewerPlagueRest(record, input.restId, input.removalSource)
   if (dueAfflictionEvent(record) === 'sewer_rest') toolkitError('SEWER_PLAGUE_REST_ID_REQUIRED', 'Select the original completed long rest before rolling this save.')
   const onset = retainRestCheckpointForSourceEvent(() => resolveSewerPlagueOnset(record))
   const round = gs.getState().dmTools?.weather?.pendingCombatRound
   const resumedCombatTurn = !onset.replayed && round?.sewerPlagueAfflictionId === record.id
    ? gs.completeSurvivalRoundTransition() : undefined
   return toolkitResult({ ...onset, resumedCombatTurn })
  }
  if (input.restId !== undefined || input.removalSource !== undefined) toolkitError('AFFLICTION_EVENT_ARGUMENTS', 'Only Sewer Plague uses these rest save arguments.')
  const target=gs.getPhysicalCreature(record.targetId)
  if(target&&AFFLICTIONS[record.templateId].damage)assertKnockoutDamageSupported(target,1)
  const event=dueAfflictionEvent(record)
  if(!event)toolkitError('AFFLICTION_EVENT_NOT_DUE','No source event is due for this record now.')
  if(event==='end'&&gs.getState().phase==='combat'){
   if(input.endTurn!==true)toolkitError('AFFLICTION_END_TURN_REQUIRED','Explicitly select endTurn=true to finish acting before this end-of-turn save.')
   commitAfflictionTurnEnd(record.targetId)
  }else if(input.endTurn!==undefined)toolkitError('AFFLICTION_EVENT_ARGUMENTS','endTurn is only supported for an actual combat end-of-turn event.')
  const sourceAdvantage = record.templateId === 'pale_tincture' && record.targetId === 'player' && event === 'daily'
    && record.nextAt !== undefined && hasRelaxationRecoveryAdvantage(gs.getState(), record.nextAt)
  return gs.withPhysicalCreatureResolution([record.targetId],()=>savedResolution({ ...afflictionSavingThrowInput(record.templateId,record.targetId), sourceAdvantage },{domain:'affliction-save',command:{afflictionId:record.id,event:event==='midnight'?'initial':'repeat'}}))
 }))
 server.registerTool('treat_affliction',{
  description:'Source treatments only. wake: one conscious actor action shakes an adjacent victim asleep from Drow Poison/Essence of Ether, removing sleep only, not the poison; Oil of Taggit permits waking by damage only. prepare_eyebright: the proficient player spends one hour and consumes an actual canonical eyebright flower with an owned herbalism kit to prepare one unique ointment. apply_eyebright: one action applies an actually prepared owned ointment to an adjacent Sight Rot victim before their next long rest; prevents that rest worsening, three treated rests cure the disease. No arbitrary cure, harvested ingredient, secret or spell is invented.',
  inputSchema:{operation:z.enum(['wake','prepare_eyebright','apply_eyebright']),targetId:z.string().optional(),actorId:z.string().default('player'),afflictionId:z.string().optional(),itemId:ToolkitIdSchema.optional(),kitItemId:ToolkitIdSchema.optional(),flowerItemId:ToolkitIdSchema.optional()},
 },async input=>toolkitTransaction(()=>{
  available();rules.validateActionUse(input.actorId)
  const actor=gs.getEntity(input.actorId)!
  if(input.operation==='prepare_eyebright'){
   if(input.actorId!=='player'||gs.getState().phase==='combat'||!input.itemId||input.targetId||input.afflictionId)toolkitError('TREATMENT_ARGUMENTS','Prepare an ointment as player outside combat with a unique itemId and real kit/flower IDs.')
   const data=afflictions(),creation=JSON.stringify(input),old=data.ointments[input.itemId!]
   if(old){if(old.creation!==creation)toolkitError('TREATMENT_ID_CONFLICT','The ointment ID is already used differently.');return toolkitResult({success:true,alreadyCreated:true,consumed:old.consumed})}
   assertGreaterBrewingIdAvailable(input.itemId!)
   const kit=gs.getPlayer().inventory.find(i=>i.id===input.kitItemId),flower=gs.getPlayer().inventory.find(i=>i.id===input.flowerItemId)
   if(!kit||equipmentId(kit)!=='herbalism_kit'||!gs.getPlayer().toolProficiencies?.includes('herbalism_kit')||!flower||equipmentId(flower)!=='eyebright')toolkitError('EYEBRIGHT_REQUIREMENTS','Source recipe requires real Eyebright, an owned herbalism kit and its actual proficiency.')
   if(gs.getPlayer().inventory.some(i=>i.id===input.itemId)||gs.getState().droppedItems?.[input.itemId!])toolkitError('TREATMENT_ID_CONFLICT','This physical item ID is already used.')
   if(Object.keys(data.ointments).length>=64)toolkitError('TREATMENT_LIMIT','At most 64 ointment receipts.')
   assertGameTimeAdvance(3600)
   gs.consumePlayerItem(i=>i.id===flower!.id);data.ointments[input.itemId!]={creation,consumed:false}
   gs.getPlayer().inventory.push({id:input.itemId!,equipmentId:'eyebright_ointment',name:'Onguent d’euphraise',type:'misc'})
   advanceHeroTime(3600);afterInventoryChange();return toolkitResult({success:true,preparedItemId:input.itemId,seconds:3600})
  }
  if(!input.targetId||input.kitItemId||input.flowerItemId)toolkitError('TREATMENT_ARGUMENTS','Select one exact nearby target and only arguments for the chosen treatment.')
  const target=gs.getEntity(input.targetId!)
  if(!target||target.hp.current<=0)toolkitError('TREATMENT_TARGET_INVALID','Choose an existing living target.')
  assertToolkitReach({...toolkitLocation(target!.position),cell:target!.position},input.actorId,1)
  if(input.operation==='wake'){
   if(input.afflictionId||input.itemId||!activeAfflictions(target!.id,'poison').some(r=>AFFLICTIONS[r.templateId].wake==='action'&&hero().effects.some(e=>e.data.afflictionId===r.id&&e.data.condition==='unconscious')))toolkitError('POISON_SLEEP_REQUIRED','Choose a victim actually asleep from a poison that permits shaking awake.')
   wakeAfflictionSleeper(target!.id,false)
  }else{
   const record=afflictions().records[input.afflictionId??''],ointment=afflictions().ointments[input.itemId??'']
   if(!record||record.targetId!==target!.id||record.templateId!=='sight_rot'||record.status!=='active'||record.ointmentPending||record.petrificationPause)toolkitError('SIGHT_ROT_TREATMENT_REQUIRED','Select a nonsuspended active Sight Rot infection without an ointment already pending for its next rest.')
   if(input.actorId!=='player'||!ointment||ointment.consumed||!gs.getPlayer().inventory.some(i=>i.id===input.itemId&&equipmentId(i)==='eyebright_ointment'))toolkitError('EYEBRIGHT_OINTMENT_REQUIRED','Use one actual owned source-prepared ointment.')
   gs.consumePlayerItem(i=>i.id===input.itemId);ointment.consumed=true;record.ointmentPending=true;afterInventoryChange()
  }
  if(input.actorId==='player')spendHeroAction();else if(gs.getState().phase==='combat')rules.recordAction(input.actorId)
  return toolkitResult({success:true,operation:input.operation,targetId:target!.id,mechanicalSummary:'Traitement source appliqué ; une action en combat. Aucun effet non déclaré soigné.'})
 }))
}
import { getMonsterRecord } from '../../lib/srd/monsters'
function requireCreatureType(id:string){const target=gs.getMonster(id);return target?String(getMonsterRecord(target.type)?.source.type??''):''}
