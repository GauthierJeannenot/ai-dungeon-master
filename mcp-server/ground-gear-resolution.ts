import { playerPoisonSurfaceContext,resolvePlayerPoisonWound,preflightPlayerPoisonSequence } from './player-poison-injury'
import { registerPlayerPoisonContinuation } from './player-poison-exposure'
import { playerPoisonStateOf } from '../lib/player-poison-state'
import type { SavingThrowResult } from '../lib/types'
import { pendingGroundGearContacts,groundGearTurnKey,type GroundGearContact } from '../lib/ground-gear-state'
import { GROUND_GEAR } from '../lib/srd/ground-gear'
import { groundGearState } from './ground-gear'
import { savedResolution,registerCheckedResolution } from './toolkit-checks'
import { inspectExhaustion } from './exhaustion'
import { rollDice } from './dice'
import { dealDamage } from './monster-rules'
import { groundDamageIssue } from './ground-damage-preflight'
import { resumePhysicalContinuation,stopPhysicalContinuation,type PhysicalContinuation } from './movement-continuation'
import { RuleViolation } from './rules'
import { toolkitError,toolkitResult } from './toolkit'
import * as gs from './game-state'
export interface ResolveGroundGearInput{contactId:string;orderedPlacementIds:string[];plateContacts?:{placementId:string;stepped:boolean;source:string}[]}
const contactById=(id:string)=>{const contact=gs.getState().dmTools?.groundGear?.contacts[id];if(!contact)toolkitError('GROUND_GEAR_CONTACT_REQUIRED','Choose an actual retained contact produced by committed movement, not a guessed target or location.');return contact!}
function assertContactBody(contact:GroundGearContact){
 const body=gs.getPhysicalCreature(contact.entityId)
 if(!body||gs.getState().currentMapId!==contact.mapId||body.position.x!==contact.cell.x||body.position.y!==contact.cell.y)
  toolkitError('GROUND_GEAR_CONTACT_CHANGED','The exact physically observed body/map/final cell must remain fixed while resolving this contact; no target or new entry is substituted.')
 return body!
}
export function finishGroundGearContact(contact:GroundGearContact):ReturnType<typeof toolkitResult>{
 contact.status='resolved'
 const continuation=contact.continuation,ids=(continuation?.groundGearContactIds as string[]|undefined)??[contact.id]
 const group=ids.map(contactById),unresolved=group.filter(value=>value.status!=='resolved')
 const base={success:true,contactId:contact.id,entityId:contact.entityId,...contact.slipperyIceEntry?{slipperyIceEntry:contact.slipperyIceEntry}:{},contactResults:contact.results,movementStopped:group.some(value=>value.stopMovement),pendingContacts:pendingGroundGearContacts(gs.getState()).map(value=>({id:value.id,entityId:value.entityId,placementIds:value.placementIds}))}
 if(unresolved.length||!continuation||group.some(value=>value.continuationConsumed)){contact.finalResult=structuredClone(base);return toolkitResult(base)}
 try{
  const command=continuation as unknown as PhysicalContinuation,answer=base.movementStopped?stopPhysicalContinuation(command):resumePhysicalContinuation(command)
  for(const value of group)value.continuationConsumed=true
  const result=JSON.parse(answer.content[0].text) as Record<string,unknown>
  contact.finalResult=structuredClone({...result,groundGearContact:base});return toolkitResult(contact.finalResult)
 }catch(error){
  if(!(error instanceof RuleViolation))throw error
  // The contact/save really completed. A later physical boundary stops that
  // continuation; it cannot rewind its already spent dice or applied damage.
  if(contact.slipperyIceEntry)contact.continuationConsumed=true
  contact.finalResult={...base,continuationBoundary:{code:error.code,message:error.message},continuationIncomplete:true}
  return toolkitResult(contact.finalResult)
 }
}
function nextContactEffect(contactId:string):ReturnType<typeof toolkitResult>{
 const contact=contactById(contactId),body=assertContactBody(contact)
 const order=contact.orderedPlacementIds!
 if(contact.cursor>=order.length)return finishGroundGearContact(contact)
 const dead=body.id==='player'?Boolean(gs.getPlayer().deathSaves?.dead):'isAlive'in body&&!body.isAlive
 if(dead){contact.results.push({skipped:'actual_body_already_dead',entityId:contact.entityId});return finishGroundGearContact(contact)}
 const id=order[contact.cursor],placement=gs.getState().dmTools!.groundGear!.placements[id]
 if(!placement||placement.unitsRemaining<=0||placement.status==='recovered')toolkitError('GROUND_GEAR_CONTACT_SOURCE_CHANGED','The actual source placement cannot be removed or emptied while its captured effect is unresolved.')
 if(placement.kind==='hunting_trap'){
  const plate=contact.plateContacts?.[id]
  if(!plate)toolkitError('HUNTING_TRAP_PRESSURE_FACT_REQUIRED','Explicitly decide the actual step onto this small central plate, not merely presence in its5foot cell.')
  if(!plate!.stepped){contact.results.push({placementId:id,kind:placement.kind,skipped:'actual_plate_not_stepped_on',source:plate!.source});contact.cursor++;return nextContactEffect(contactId)}
  if(placement.status!=='armed')toolkitError('HUNTING_TRAP_NOT_ARMED','This actual source trap is already sprung; a nonce cannot automatically rearm it.')
  placement.status='sprung'
 }
 const poisonContext=placement.kind==='hunting_trap'?playerPoisonSurfaceContext({surfaceKey:JSON.stringify(['hunting_trap',placement.itemId]),attackId:`gear-poison:${contact.id}:${contact.cursor}`,targetId:contact.entityId,damageType:'piercing'}):undefined
 return gs.withPhysicalCreatureResolution([contact.entityId],()=>savedResolution({entityId:contact.entityId,ability:'dex',dc:GROUND_GEAR[placement.kind].saveDc,ignoreCoverForSave:true},
  {domain:'ground-gear-contact-save',command:{contactId,placementId:id,cursor:contact.cursor,poisonContext}}))
}
function finishContactSave(command:Record<string,unknown>,save:SavingThrowResult):ReturnType<typeof toolkitResult>{
 const contact=contactById(String(command.contactId)),placementId=String(command.placementId),placement=gs.getState().dmTools!.groundGear!.placements[placementId]
 assertContactBody(contact)
 if(!placement||contact.status!=='resolving'||contact.cursor!==command.cursor||contact.orderedPlacementIds?.[contact.cursor]!==placementId||save.entityId!==contact.entityId||save.ability!=='dex'||save.dc!==GROUND_GEAR[placement.kind].saveDc)
  toolkitError('GROUND_GEAR_SAVE_CONTEXT_INVALID','Retain the exact original physical contact, selected order, source save and cursor before applying its effect once.')
 const result:Record<string,unknown>={placementId,kind:placement.kind,save,damageDealt:0}
 const poisonContext=placement.kind==='hunting_trap'?playerPoisonSurfaceContext({surfaceKey:JSON.stringify(['hunting_trap',placement.itemId]),attackId:`gear-poison:${contact.id}:${contact.cursor}`,targetId:contact.entityId,damageType:'piercing',held:true,context:command.poisonContext}):undefined
 if(!save.success){
  if(placement.kind==='ball_bearings'){
   const body=gs.getPhysicalCreature(contact.entityId)!,wasProne=body.conditions.includes('prone')
   const applied=gs.withPhysicalCreatureResolution([contact.entityId],()=>gs.applyCondition(contact.entityId,'prone'))
   result.conditionResult=applied;if(!wasProne&&applied.applied)contact.stopMovement=true
  }else{
   const damageRoll=placement.kind==='hunting_trap'?rollDice('1d4'):undefined,raw=damageRoll?.total??1
   if(placement.kind==='hunting_trap')placement.victimId=contact.entityId
   const damage=gs.withPhysicalCreatureResolution([contact.entityId],()=>dealDamage(contact.entityId,raw,'piercing',{sourceId:placement.sourceId,damageEventId:`gear:${contact.id}:${placementId}`}))
   result.rawDamage=raw;result.damageRoll=damageRoll;result.damageResolution=damage;result.damageDealt=damage.damageDealt;contact.stopMovement=true
   if(placement.kind==='caltrops'){
    groundGearState().stops[contact.entityId]={turnKey:contact.turnKey,contactId:contact.id,at:gs.getState().worldTimeSeconds??0}
    if(damage.damageDealt>0){const old=groundGearState().walkingInjuries[contact.entityId];groundGearState().walkingInjuries[contact.entityId]={contactIds:[...new Set([...(old?.contactIds??[]),contact.id])],at:gs.getState().worldTimeSeconds??0,penaltyFeet:10}}
   }else result.chain={anchor:placement.anchor,conditionApplied:false,notice:'Actual chain geometry only; no restrained condition, speed0 or continuing damage invented.'}
  }
 }
 if(poisonContext&&Number(result.damageDealt)>0)return resolvePlayerPoisonWound(poisonContext,{...result,hit:true,damageType:'piercing',playerPoisonContinuation:{domain:'ground-gear-poison',contactId:contact.id,cursor:contact.cursor}})
 contact.results.push(result);contact.cursor++;return nextContactEffect(contact.id)
}
export function resolveGroundGearContact(input:ResolveGroundGearInput){
 const contact=contactById(input.contactId),command=JSON.stringify(input)
 if(contact.slipperyIceEntry)toolkitError('SLIPPERY_ICE_RESOLVER_REQUIRED','Resolve the actual ice ability check through resolve_slippery_ice_entry.')
 if(contact.command&&contact.command!==command)toolkitError('GROUND_GEAR_CONTACT_CHOICE_CONFLICT','Keep the exact original effect order and actual plate-contact decisions on every retry.')
 if(contact.status==='resolved'){
  if(contact.continuation&&!contact.continuationConsumed)return finishGroundGearContact(contact)
  return toolkitResult({...contact.finalResult,replayed:true,currentPendingContacts:pendingGroundGearContacts(gs.getState()).map(value=>value.id)})
 }
 if(contact.status==='resolving'){
  const pending=gs.getState().hero?.pending,resolution=pending?.command.toolkitResolution as {domain?:string;command?:{contactId?:string}}|undefined
  if(resolution?.domain==='ground-gear-contact-save'&&resolution.command?.contactId===contact.id)return toolkitResult({contactId:contact.id,pendingReaction:pending,alreadyPending:true})
  toolkitError('GROUND_GEAR_CONTACT_RESOLUTION_DUE','This contact has an exact unfinished effect; complete its actual held save before choosing another operation.')
 }
 if(gs.getState().hero?.pending)toolkitError('REACTION_PENDING','Resolve the actual held reaction before selecting the effect order for another contact.')
 assertContactBody(contact);gs.withPhysicalCreatureResolution([contact.entityId],()=>inspectExhaustion(contact.entityId))
 if(input.orderedPlacementIds.length!==contact.placementIds.length||new Set(input.orderedPlacementIds).size!==contact.placementIds.length||contact.placementIds.some(id=>!input.orderedPlacementIds.includes(id)))
  toolkitError('GROUND_GEAR_COMPLETE_ORDER_REQUIRED','Explicitly order every exact device from this actual simultaneous contact once, without omission, duplication or invented source.')
 const traps=contact.placementIds.filter(id=>gs.getState().dmTools!.groundGear!.placements[id].kind==='hunting_trap'),plates=input.plateContacts??[]
 if(plates.length!==traps.length||new Set(plates.map(value=>value.placementId)).size!==plates.length||traps.some(id=>!plates.some(value=>value.placementId===id))||plates.some(value=>!value.source.trim()))
  toolkitError('HUNTING_TRAP_PRESSURE_FACT_REQUIRED','Give one explicit actual plate-contact decision and its physical source for each hunting trap, no arbitrary weight/5foot-area trigger.')
 for(const id of contact.placementIds){const placement=gs.getState().dmTools!.groundGear!.placements[id];if(placement.unitsRemaining<=0||placement.status==='recovered')toolkitError('GROUND_GEAR_CONTACT_SOURCE_CHANGED','The actual captured sources must remain present before the first save.')}
 if(contact.placementIds.some(id=>gs.getState().dmTools!.groundGear!.placements[id].kind==='caltrops')&&(gs.getState().phase!=='combat'||contact.turnKey!==groundGearTurnKey(gs.getState())))
  toolkitError('GROUND_GEAR_TURN_CONTEXT_CHANGED','Retain this actual source turn for caltrops; no outside-combat or later-turn stop is retrospectively invented.')
 const possibleDamage=contact.placementIds.reduce((maximum,id)=>{const placed=gs.getState().dmTools!.groundGear!.placements[id];return Math.max(maximum,placed.kind==='caltrops'?1:placed.kind==='hunting_trap'&&plates.some(plate=>plate.placementId===id&&plate.stepped)?4:0)},0)
 if(possibleDamage>0||contact.placementIds.some(id=>gs.getState().dmTools!.groundGear!.placements[id].kind==='ball_bearings')){const issue=groundDamageIssue(gs.getState(),contact.entityId,possibleDamage);if(issue)toolkitError(issue.code,issue.message)}
 const poisonContexts=traps.filter(id=>plates.some(plate=>plate.placementId===id&&plate.stepped)).map(id=>playerPoisonSurfaceContext({surfaceKey:JSON.stringify(['hunting_trap',gs.getState().dmTools!.groundGear!.placements[id].itemId]),attackId:`gear-poison:${contact.id}:${input.orderedPlacementIds.indexOf(id)}`,targetId:contact.entityId,damageType:'piercing'}));preflightPlayerPoisonSequence(poisonContexts)
 contact.command=command;contact.orderedPlacementIds=[...input.orderedPlacementIds];contact.plateContacts=Object.fromEntries(plates.map(value=>[value.placementId,{stepped:value.stepped,source:value.source}]));contact.status='resolving'
 return nextContactEffect(contact.id)
}
export function validateHeldGroundGearSave(command:Record<string,unknown>){
 const resolution=command.toolkitResolution as {domain?:string;command?:Record<string,unknown>}|undefined;if(resolution?.domain!=='ground-gear-contact-save')return
 const contact=contactById(String(resolution.command?.contactId));assertContactBody(contact)
 if(contact.status!=='resolving'||contact.cursor!==resolution.command?.cursor||contact.orderedPlacementIds?.[contact.cursor]!==resolution.command?.placementId)
  toolkitError('GROUND_GEAR_SAVE_CONTEXT_INVALID','This held save must retain its original actual contact and selected source order before any Inspiration die.')
 const heldPlacement=gs.getState().dmTools!.groundGear!.placements[String(resolution.command?.placementId)]
 if(heldPlacement?.kind==='hunting_trap')playerPoisonSurfaceContext({surfaceKey:JSON.stringify(['hunting_trap',heldPlacement.itemId]),attackId:`gear-poison:${contact.id}:${contact.cursor}`,targetId:contact.entityId,damageType:'piercing',held:true,context:resolution.command?.poisonContext})
 const placed=gs.getState().dmTools!.groundGear!.placements[String(resolution.command?.placementId)],issue=groundDamageIssue(gs.getState(),contact.entityId,placed?.kind==='hunting_trap'?4:placed?.kind==='caltrops'?1:0);if(issue)toolkitError(issue.code,issue.message)
}
export function registerGroundGearResolutions(){
 registerCheckedResolution('ground-gear-contact-save',(command,result)=>finishContactSave(command,result as SavingThrowResult))
 registerPlayerPoisonContinuation('ground-gear-poison',deliveryId=>{
  const delivery=playerPoisonStateOf(gs.getState())!.deliveries[deliveryId],continuation=delivery.baseAttack!.playerPoisonContinuation as{contactId:string;cursor:number},contact=contactById(continuation.contactId)
  if(contact.cursor!==continuation.cursor)toolkitError('GROUND_GEAR_POISON_CONTEXT_CHANGED','Retain the actual jaw wound cursor while finishing its original poison save.')
  contact.results.push(structuredClone(delivery.result!));contact.cursor++;return nextContactEffect(contact.id)
 })
}

