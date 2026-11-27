import { getAdventureMap,firstMapId,inferRoomIdOnMap } from '../lib/adventure-map'
import { PrepareAdventureRewardSchema,ADVENTURE_REWARD_CREATION_PREFIX,validateAdventureRewardState,authoredRewardOwnerHeightIssue } from '../lib/adventure-reward-state'
import { groundGearPhysicalWitness as witness } from '../lib/ground-gear-recovery-state'
import { valuablePhysicalItem } from '../lib/carrying-state'
import { emptyCoins } from '../lib/srd/currency'
import { MAGIC_ITEMS } from '../lib/srd/magic-items'
import { entityVerticalContext } from '../lib/jumping-state'
import { getEncounterOutcomeEvidence } from '../lib/campaign-outcome-state'
import type { Item,MonsterState } from '../lib/types'
import { toolkitState,toolkitError,toolkitLocation,assertToolkitPreparation,assertToolkitReach,assertGreaterBrewingIdAvailable } from './toolkit'
import { magicDay } from './magic-items'
import * as gs from './game-state'

export function inspectAdventureRewards(){
 const state=gs.getState(),mapId=state.currentMapId??firstMapId(state)
 return {confidential:true,rewards:(getAdventureMap(state).rewards??[]).filter(r=>r.mapId===mapId).map(r=>({definition:r,receipt:state.dmTools?.adventureRewards?.receipts[r.id]})),
  notice:'Author source only. No search, discovery, player ownership, coins, magic identification, creature equipment or victory is granted.'}
}
export function validateAdventureRewardSources(state:import('../lib/types').GameState){
 const issues:string[]=[],definitions=getAdventureMap(state).rewards??[]
 for(const[id,r]of Object.entries(state.dmTools?.adventureRewards?.receipts??{})){
  const definition=definitions.find(d=>d.id===id)
  if(!definition||r.sourceWitness!==witness(definition)||witness(r.source)!==witness(definition.source)
    ||witness(r.outputIds)!==witness(definition.items.map(i=>i.id))
    ||r.ownerBefore!==definition.owner||r.coinTreasureId!==(definition.coins?`${id}:coins`:undefined)){
   issues.push('An authored reward retains its immutable current adventure definition, original ownership, source and complete output set.');continue
  }
  for(const i of definition.items){
   const physical=state.player.inventory.find(v=>v.id===i.id)??state.droppedItems?.[i.id]?.item??state.dmTools?.merchantResales?.custody[i.id]?.item
   if(physical&&physical.adventureRewardId!==id)issues.push('Every physical reward output retains its original exact owner receipt.')
   if(i.kind==='magic'&&state.dmTools?.magicItems?.[i.id]?.templateId!==i.templateId)issues.push('No magic reward template may change or lose its original physical record.')
   if(i.kind==='scroll'&&state.dmTools?.spellScrolls?.[i.id]?.spellId!==i.spellId)issues.push('No source scroll changes spell, level or original instance.')
   if(i.kind==='valuable'||i.kind==='collection'){
    const v=state.dmTools?.valuables?.[i.id]
    if(!v||v.rewardId!==id||v.name!==i.name||v.kind!==(i.kind==='collection'?'collection':'art')||v.valueGp!==i.valueGp||witness(v.source)!==witness(definition.source))issues.push('Source-authored property values retain their real chapter, identities and amounts, never a fabricated DMG table.')
   }
  }
  if(definition.sourceConditions&&!r.input.actualOwnerEscapePreventedConfirmed)issues.push('Keep the explicit actual prevention of the source owner escape required by this reward.');
  if(definition.owner==='enemy')try{
   const physical=JSON.parse(r.bodyWitness??''),body=physical.body,vertical=JSON.parse(r.ownerVerticalWitness??''),npcIds=definition.sourceNpcIds??(definition.sourceNpcId?[definition.sourceNpcId]:[])
   if(!body||vertical.entityId!==body.id||vertical.known!==true||vertical.airborne!==false||vertical.zFeet!==0||physical.mapId!==r.placement.mapId||!definition.containerRequired&&witness(body.position)!==witness(r.placement.cell)
    ||npcIds.length&&!npcIds.includes(body.id)||r.input.release?.kind==='physical_helpless_body_search'&&body.hp.current>0)issues.push('A carried reward keeps its exact original physical body and actual search/transfer location.')
   if(definition.encounterId){
    const e=JSON.parse(r.encounterWitness??''),records=state.dmTools?.campaignOutcomes,
     engagement=records?.engagements[e.engagementId],closure=records?.closures[e.closureId],outcome=records?.outcomes[e.outcomeId]
    if(!engagement||!closure||!outcome||engagement.encounterId!==definition.encounterId||closure.engagementId!==engagement.id
     ||outcome.closureId!==closure.id||outcome.result!==e.result||!['victory','capture','surrender','agreement'].includes(e.result)
     ||definition.sourceConditions&&e.result!==definition.sourceConditions.outcome
     ||body.id!==e.actorId||!npcIds.length&&!engagement.participants.some(p=>p.actorId===body.id&&p.authoredIndex===definition.participantIndex))issues.push('Conditional enemy property retains its actual original encounter/outcome and physical source owner, never a generic victory or reconstructed body.')
   }else if(!npcIds.length||r.encounterWitness!==undefined)issues.push('An unconditionally carried source needs its exact authored owner, not an invented guard-victory condition.')
  }catch{issues.push('Retain the structured original encounter and physical owner witnesses of enemy property.')}
  if(witness(r.placement.cell)!==witness(r.input.cell)||inferRoomIdOnMap(r.placement.cell,r.placement.mapId,state)!==r.placement.roomId
    ||!(definition.owner==='enemy'&&!definition.containerRequired)&&(r.placement.mapId!==definition.mapId||r.placement.roomId!==definition.roomId))issues.push('Keep the exact actual source placement; carried goods follow their actual owner, fixed room contents do not teleport.')
  if(r.coinTreasureId){const t=state.dmTools?.treasures?.[r.coinTreasureId]
   const container=t?.containerId?state.dmTools?.objects[t.containerId]:undefined
   if(!t||witness(t.coins)!==witness({...emptyCoins(),...definition.coins})||t.containerId!==r.input.containerId
    ||!t.containerId&&(t.mapId!==r.placement.mapId||t.roomId!==r.placement.roomId||witness(t.cell)!==witness(r.input.cell))
    ||t.containerId&&!t.collected&&(!container||t.mapId!==container.mapId||t.roomId!==container.roomId||witness(t.cell)!==witness(container.cell)))issues.push('Original source coins retain their one real pile/container attachment and exact denominations, even after actual movement or collection.')
  }
 }
 return issues
}
function locatedFact(id:string,mapId:string,roomId:string,cell:{x:number;y:number}){
 const f=gs.getState().worldFacts?.find(v=>v.id===id)
 if(!f||f.source!=='record_scene_fact'||f.mapId!==mapId||f.roomId!==roomId||f.narrativeEffect?.cell.x!==cell.x||f.narrativeEffect.cell.y!==cell.y||f.subjectItemId||f.clueId)
  toolkitError('REWARD_PHYSICAL_FACT_REQUIRED','Choose the actual explicit search/access or property-release fact at this exact real source. No narrative keyword, discovery, clue or other item classifies the reward.')
 return f!
}
export function prepareAdventureReward(raw:unknown){
 const input=PrepareAdventureRewardSchema.parse(raw),state=gs.getState(),definition=getAdventureMap(state).rewards?.find(r=>r.id===input.rewardId)
 if(!definition)toolkitError('AUTHORED_REWARD_UNKNOWN','Choose one exact reward definition of this adventure, never an invented treasure or magic template.')
 const data=toolkitState(),prior=data.adventureRewards?.receipts[input.rewardId]
 if(prior){if(prior.creation!==witness(input))toolkitError('AUTHORED_REWARD_ID_CONFLICT','This source retains its original once-only input and outputs, even after collection or consumption.')
  return {success:true,replayed:true,rewardId:input.rewardId,outputIds:prior.outputIds,coinTreasureId:prior.coinTreasureId}}
 assertToolkitPreparation()
 const issues=validateAdventureRewardState(state);if(issues.length)toolkitError('ADVENTURE_REWARD_STATE_MISMATCH',issues.join(' '))
 const location=toolkitLocation(input.cell)
 const carried=definition!.owner==='enemy'&&!definition!.containerRequired
 if(!carried&&(location.mapId!==definition!.mapId||location.roomId!==definition!.roomId))toolkitError('REWARD_SOURCE_LOCATION_REQUIRED','The fixed printed room contents belong to their source map/room; carried goods instead require their actual present owner.')
 assertToolkitReach({...location,cell:input.cell})
 const fact=locatedFact(input.searchFactId,location.mapId,location.roomId,input.cell)
 if(definition!.containerRequired&&!input.containerId)toolkitError('REWARD_CONTAINER_REQUIRED','The printed locked strongbox must actually exist and be open/destroyed before its contents are exposed.')
 if(input.containerId){const c=data.objects[input.containerId];if(!c||c.kind!=='container'||c.mapId!==location.mapId||c.roomId!==location.roomId||witness(c.cell)!==witness(input.cell)||!['open','destroyed'].includes(c.state))toolkitError('REWARD_CONTAINER_CLOSED','Use the actual opened source container at this exact location; no search opens a lock or box.')}
 let body:MonsterState|undefined,releaseFact:ReturnType<typeof locatedFact>|undefined,encounterWitness:string|undefined
 if(definition!.owner==='unclaimed'&&input.release)toolkitError('REWARD_RELEASE_NOT_APPLICABLE','This source is found material, not an invented owner transfer.')
 if(definition!.owner!=='unclaimed'){
  if(!input.release)toolkitError('REWARD_PROPERTY_RELEASE_REQUIRED','The original enemy/victim property requires a real explicit physical release/transfer, never a generic victory or player escape.')
  if(definition!.owner==='victims'&&input.release!.kind!=='victim_ownership_transfer')toolkitError('REWARD_VICTIM_PROPERTY_REQUIRED','Keep the victims as owners until their actual explicit transfer. The chest does not make their possessions player loot.')
  if(definition!.owner==='enemy'){
   if(input.release!.kind==='victim_ownership_transfer')toolkitError('REWARD_OWNER_MISMATCH','This is the enemy original property, not a transfer by unrelated victims.')
   const evidence=definition!.encounterId?getEncounterOutcomeEvidence(state,definition!.encounterId):undefined
   if(definition!.encounterId&&(!evidence?.outcome||!evidence.closure||evidence.mapId!==definition!.mapId
    ||!['victory','capture','surrender','agreement'].includes(evidence.outcome.result)))toolkitError('REWARD_ENCOUNTER_EVIDENCE_REQUIRED','Use the actual closed tracked encounter and explicit qualifying issue. Player/opponent flight and a triggered encounter alone grant no property.')
   if(definition!.sourceConditions&&(evidence?.outcome?.result!==definition!.sourceConditions.outcome||input.actualOwnerEscapePreventedConfirmed!==true))toolkitError('REWARD_PRINTED_CONDITION_REQUIRED','This exact printed reward additionally requires a real victory and explicit prevention of its source owner escape. No pocket reward or generic negotiation supplies that condition.');
   const npcIds=definition!.sourceNpcIds??(definition!.sourceNpcId?[definition!.sourceNpcId]:[])
   const physicalOwners=npcIds.filter(id=>{const npc=state.npcs?.[id];return npc?.visible&&gs.npcOnCurrentMap(npc)&&gs.getPhysicalCreature(id)})
   if(npcIds.length&&physicalOwners.length!==1)toolkitError('REWARD_CURRENT_OWNER_BODY_REQUIRED','There must be exactly one actual revealed current-map owner among the authored aliases, never a duplicated or dormant stage token.')
   const sourceId=npcIds.length?physicalOwners[0]:evidence?.participants.find(p=>p.authoredIndex===definition!.participantIndex)?.actorId
   const actualBody=sourceId?gs.getPhysicalCreature(sourceId):undefined
   body=actualBody&&actualBody.id!=='player'&&'type'in actualBody?actualBody:undefined
   if(!body||!npcIds.length&&!evidence?.currentActors.some(a=>a.actorId===body!.id&&a.presentOnCurrentMap&&a.body))
    toolkitError('REWARD_CURRENT_OWNER_BODY_REQUIRED','The exact original owner must still physically exist here. An old closure snapshot, name, absent foe or other incarnation cannot become a lootable body.')
   const heightIssue=authoredRewardOwnerHeightIssue(state,body!.id);if(heightIssue)toolkitError(heightIssue.code,heightIssue.message)
   const sourceLocation=toolkitLocation(body!.position)
   if(sourceLocation.mapId!==location.mapId||!definition!.containerRequired&&witness(body!.position)!==witness(input.cell))
    toolkitError('REWARD_BODY_LOCATION_REQUIRED','Search the actual source owner at its real body cell; the coach strongbox is a separate real container in that source room.')
   if(input.release!.kind==='physical_helpless_body_search'&&body!.hp.current>0)toolkitError('REWARD_BODY_NOT_HELPLESS','A living active owner is not automatically searched or stripped by victory over other combatants. Establish actual property surrender instead.')
   releaseFact=locatedFact(input.release!.factId,sourceLocation.mapId,sourceLocation.roomId,body!.position)
   if(evidence)encounterWitness=witness({engagementId:evidence.engagementId,closureId:evidence.closure!.id,outcomeId:evidence.outcome!.id,result:evidence.outcome!.result,actorId:body!.id})
  }
  if(!releaseFact)releaseFact=locatedFact(input.release!.factId,location.mapId,location.roomId,input.cell)
 }
 if(Object.keys(data.adventureRewards?.receipts??{}).length>=64)toolkitError('REWARD_HISTORY_LIMIT','Retain all original source rewards before any new materialization.')
 const outputIds=definition!.items.map(i=>i.id),coinTreasureId=definition!.coins?`${definition!.id}:coins`:undefined,ids=[...outputIds,...coinTreasureId?[coinTreasureId]:[]]
 for(const id of ids){assertGreaterBrewingIdAvailable(id);if(state.player.inventory.some(i=>i.id===id)||state.droppedItems?.[id]||data.magicItems?.[id]||data.spellScrolls?.[id]||data.valuables?.[id]||data.treasures?.[id]||gs.getEntity(id)||gs.getNpc(id))toolkitError('REWARD_OUTPUT_ID_CONFLICT','An original reward identity is already in use; no replacement, clone or refill is allowed.')}
 const magicCount=definition!.items.filter(i=>i.kind==='magic').length,scrollCount=definition!.items.filter(i=>i.kind==='scroll').length
 if(Object.keys(data.magicItems??{}).length+magicCount>64||Object.keys(data.spellScrolls??{}).length+scrollCount>64||Object.keys(data.valuables??{}).length+definition!.items.filter(i=>i.kind==='valuable'||i.kind==='collection').length>1024)toolkitError('REWARD_INSTANCE_LIMIT','All exact source outputs must fit their real retained registries before materialization.')
 const creation=`${ADVENTURE_REWARD_CREATION_PREFIX}${definition!.id}|${witness(input)}`,items:Item[]=[]
 for(const source of definition!.items){
  let item:Item={id:source.id,name:source.name,description:source.description,type:source.kind==='equipment'?'weapon':'misc',adventureRewardId:definition!.id}
  if(source.kind==='magic'){
   const templateId=source.templateId!,spec=MAGIC_ITEMS[templateId];data.magicItems??={};data.magicItems[source.id]={id:source.id,templateId,creation,identified:false,chargesKnown:false,charges:spec.maxCharges??0,status:'active',worn:false,lastRechargeDay:magicDay()}
   item={...item,equipmentId:spec.equipmentId??templateId,magical:true,type:spec.kind==='potion'?'potion':spec.kind==='weapon'?'weapon':spec.kind==='shield'?'armor':'misc'}
  }else if(source.kind==='scroll'){
   data.spellScrolls??={};data.spellScrolls[source.id]={id:source.id,spellId:source.spellId!,creation,identified:false,status:'active'};item={...item,equipmentId:'spell_scroll',magical:true}
  }else if(source.kind==='valuable'||source.kind==='collection'){
   data.valuables??={};const value={id:source.id,rewardId:definition!.id,kind:source.kind==='collection'?'collection' as const:'art' as const,name:source.name,valueGp:source.valueGp!,source:definition!.source};data.valuables[source.id]=value
   item={...valuablePhysicalItem(value),adventureRewardId:definition!.id}
  }else if(source.kind==='equipment')item.equipmentId=source.equipmentId
  items.push(item)
 }
 state.droppedItems??={}
 for(const item of items)state.droppedItems[item.id]={item,...location,position:{...input.cell}}
 if(coinTreasureId){data.treasures??={};data.treasures[coinTreasureId]={id:coinTreasureId,name:definition!.label,description:definition!.sourceDescription,...location,cell:{...input.cell},coins:{...emptyCoins(),...definition!.coins},collected:false,creation,source:{origin:'authored'},rolls:[],...(input.containerId?{containerId:input.containerId}:{})}}
 data.adventureRewards??={version:1,receipts:{}}
 data.adventureRewards.receipts[definition!.id]={rewardId:definition!.id,input,creation:witness(input),source:structuredClone(definition!.source),placement:{...location,cell:{...input.cell}},sourceWitness:witness(definition!),factWitness:witness(fact),at:state.worldTimeSeconds??0,outputIds,...coinTreasureId?{coinTreasureId}:{},ownerBefore:definition!.owner,ownershipTransferred:definition!.owner==='unclaimed'||Boolean(input.release),...releaseFact?{releaseWitness:witness(releaseFact)}:{},...body?{bodyWitness:witness({mapId:location.mapId,roomId:toolkitLocation(body.position).roomId,body}),ownerVerticalWitness:witness(entityVerticalContext(state,body.id))}:{},...encounterWitness?{encounterWitness}:{}}
 return {success:true,rewardId:definition!.id,outputIds,coinTreasureId,source:definition!.source,notice:'Prepared once at the actual source only. Coins remain uncollected; every item remains on the ground. Acquisition, identification, attunement and use require their existing explicit procedures.'}
}
