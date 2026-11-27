import { activePlayerPoison,playerPoisonStateOf } from '../lib/player-poison-state'
import { planWaterPoisonTransfer,commitWaterPoisonTransfer,type WaterPoisonTransferPlan } from './poison-nutrition'
import { EstablishWaterSourceSchema, FillWaterContainerSchema, TransferWaterSchema,
  type WaterSourcesState, type EstablishWaterSourceInput, type FillWaterContainerInput, type TransferWaterInput } from '../lib/water-sources-state'
import { carryingStateOf, inspectCarryingCapacity } from '../lib/carrying-state'
import { playerHandOccupancy } from '../lib/hand-occupancy'
import { activePhysicalLoad } from '../lib/physical-handling-state'
import { inferRoomIdOnMap } from '../lib/adventure-map'
import * as gs from './game-state'
import * as rules from './rules'
import { available, alive, now, effects, advanceHeroTime, spendHeroAction } from './hero-rules'
import { toolkitState, toolkitError, assertToolkitPreparation, assertToolkitReach } from './toolkit'
import { spendObjectInteraction, afterInventoryChange } from './equipment'
import { syncWeatherClock } from './weather'
import { assertGameTimeAdvance } from './time-preflight'
import { activeAfflictions } from './afflictions'
import { preflightRestStrenuousInterval, recordRestMeasuredActivityInterval } from './resting'

const saved=()=>gs.getState().dmTools?.waterSources
const data=():WaterSourcesState=>toolkitState().waterSources??={version:1,sources:{},receipts:{}}
type Operation=FillWaterContainerInput|TransferWaterInput
function oldReceipt(eventId:string,command:string){const old=saved()?.receipts[eventId];if(old&&old.command!==command)toolkitError('WATER_EVENT_CONFLICT','This event ID retains a different actual water operation.');return old?{...old.result,replayed:true}:undefined}
function room(){if(Object.keys(saved()?.receipts??{}).length>=1024)toolkitError('WATER_HISTORY_LIMIT','Water-operation history is full; no actual finite stock or receipt is evicted.')}
function remember(eventId:string,command:string,result:Record<string,unknown>){data().receipts[eventId]={command,result};return result}
function hazardFacts(ids:string[]){
  if(new Set(ids).size!==ids.length)toolkitError('WATER_HAZARD_DUPLICATE','Choose each actual established hazard fact once.')
  return ids.map(id=>{const fact=gs.getState().worldFacts?.find(fact=>fact.id===id);if(!fact)toolkitError('WATER_HAZARD_FACT_REQUIRED','Choose an actual existing hazard fact; no contamination, purity or detection is invented.');return structuredClone(fact!) as unknown as Record<string,unknown>})
}
function actor(){available();if(!alive(gs.getPlayer())||gs.getPlayer().deathSaves?.dead)toolkitError('WATER_ACTOR_UNAVAILABLE','Only the actual living capable player can manipulate this water.')}
function actualContainer(itemId:string){
  const state=gs.getState(),container=state.dmTools?.foraging?.containers[itemId]
  const owned=state.player.inventory.find(item=>item.id===itemId),dropped=state.droppedItems?.[itemId],item=owned??dropped?.item
  if(!container||!item)toolkitError('WATER_CONTAINER_REQUIRED','Choose an actual registered container instance that is possessed or really deposited within reach; no vessel is created.')
  if(item!.quantity!==undefined&&item!.quantity!==1)toolkitError('WATER_CONTAINER_INSTANCE_REQUIRED','The exact container must remain one actual instance, not a new unresolved stack.')
  if(!owned){
    const mapId=dropped!.mapId??state.currentMapId!,roomId=dropped!.roomId??inferRoomIdOnMap(dropped!.position,mapId,state)
    if(!roomId)toolkitError('SCENE_LOCATION_REQUIRED','The actual deposited container needs a real source room on its map.')
    assertToolkitReach({mapId,roomId:roomId!,cell:dropped!.position})
  }
  return {container:container!,item:item!,owned:Boolean(owned)}
}
function hands(input:Operation,involvedItemIds:string[]){
  const occupancy=playerHandOccupancy(gs.getState()),alreadyHeld=[...occupancy.held].filter(id=>involvedItemIds.includes(id)).length
  if(occupancy.bound||occupancy.invalid||occupancy.free+alreadyHeld<input.handsRequired)
    toolkitError('WATER_HANDS_REQUIRED','The explicitly adjudicated operation needs its actual available hands, counting a selected already-held container once. Release other objects explicitly; nothing is automatically unequipped.')
}
function costAndClockPreflight(input:Operation){
  if(gs.getState().phase==='combat'){
    if(input.seconds!==0)toolkitError('WATER_COMBAT_DURATION_UNSUPPORTED','Resolve a within-turn operation with seconds0 and its actual cost; a longer multi-turn water job is not represented and cannot move the combat clock.')
    if(input.objectsManipulated===2&&input.cost!=='action')toolkitError('WATER_MULTIPLE_OBJECTS_ACTION_REQUIRED','PHB2014 interacting with a second object requires the actual Use an Object action; one free interaction cannot manipulate two objects.')
    if(input.cost==='action')rules.validateActionUse('player')
    else{rules.validateFreeCombatAction('player');if(effects('object-interaction','player').length)rules.validateActionUse('player')}
  }else if(input.seconds<1)toolkitError('WATER_DURATION_REQUIRED','Outside combat choose a positive actual duration established by the MJ; the rule gives no universal filling or pouring duration.')
  if(input.seconds>0){
    if(gs.getState().dmTools?.breathing?.creatures.player?.episode)toolkitError('WATER_BREATHING_CONTEXT_UNSUPPORTED','Resolve unavailable air before this timed manipulation; no completed work through suffocation is credited.')
    if(activeAfflictions('player').some(record=>!record.petrificationPause&&record.nextAt!==undefined&&record.nextAt<now()+input.seconds))
      toolkitError('WATER_AFFLICTION_BOUNDARY','Stop and resolve the actual affliction interruption before completing water work across it.')
  }
  assertGameTimeAdvance(input.seconds)
  preflightRestStrenuousInterval()
}
function futureCapacity(future:ReturnType<typeof gs.getState>,increasesCarriedMass:boolean){
  if(!increasesCarriedMass||!carryingStateOf(future)?.actors.player?.tracking)return
  const capacity=inspectCarryingCapacity(future)
  if(capacity.status==='unresolved')throw new rules.RuleViolation('CARRYING_DATA_REQUIRED','Actual future carried masses and quantities are required before collecting more water.',{missing:capacity.missing})
  if(capacity.overloaded)throw new rules.RuleViolation('CARRYING_CAPACITY_EXCEEDED','The actual future water acquisition exceeds standard carrying capacity.',{carriedWeightLb:capacity.carriedWeightLb,carryingCapacityLb:capacity.carryingCapacityLb})
}
function combineHazards(existing:string[],incoming:string[]){const combined=[...new Set([...existing,...incoming])];if(combined.length>32)toolkitError('WATER_HAZARD_HISTORY_LIMIT','This actual mixture exceeds the retained hazard bound; no established source hazard is discarded.');return combined}
function complete(input:Operation,command:string,future:ReturnType<typeof gs.getState>,itemIds:string[],result:Record<string,unknown>,poisonPlan?:WaterPoisonTransferPlan){
  const from=now(),beforeCredits=gs.getState().hero?.actionCredits
  if(input.cost==='action')spendHeroAction();else spendObjectInteraction()
  const naturalRecoveries=input.seconds?advanceHeroTime(input.seconds):[]
  for(const itemId of itemIds){
    const next=future.dmTools!.foraging!.containers[itemId]
    gs.getState().dmTools!.foraging!.containers[itemId]=next
    const item=gs.getPlayer().inventory.find(item=>item.id===itemId)??gs.getState().droppedItems?.[itemId]?.item
    if(next.containerType==='waterskin'&&item){item.equipmentId=next.contentsQuarterPints?'waterskin_full':'waterskin_empty';item.name=`Outre : ${next.contentsQuarterPints/4} pintes d’eau`}
  }
  if('objectId'in input&&future.dmTools?.waterSources?.sources[input.objectId])data().sources[input.objectId]=future.dmTools.waterSources.sources[input.objectId]
  if(poisonPlan)commitWaterPoisonTransfer(poisonPlan)
  afterInventoryChange()
  gs.addLogEntry({round:gs.getState().round,turn:'player',action:'Manipulation réelle d’eau',mechanicalDetail:`${input.eventId} : ${input.quarterPints/4} pintes ; ${input.cost}, ${input.seconds}s ; adjudication : ${input.adjudication}`})
  recordRestMeasuredActivityInterval({eventId:`water:${input.eventId}`,from,to:now(),activity:input.restActivity,reason:`Actual measured water operation ${input.eventId}; explicit MJ activity ruling.`})
  return remember(input.eventId,command,{success:true,...result,transferredQuarterPints:input.quarterPints,elapsedSeconds:input.seconds,
    actionSpent:gs.getState().phase==='combat'&&beforeCredits!==gs.getState().hero?.actionCredits,cost:input.cost,objectsManipulated:input.objectsManipulated,
    handsRequired:input.handsRequired,restActivity:input.restActivity,naturalRecoveries,worldTimeSeconds:now(),intakeCredited:false,containerCreated:false,purificationPerformed:false})
}
export function inspectWaterSources(objectId?:string){return {tracked:!!saved(),source:objectId?saved()?.sources[objectId]??null:null,
  sources:saved()?.sources??{},containers:gs.getState().dmTools?.foraging?.containers??{},worldTimeSeconds:now(),waterCreated:false,purificationPerformed:false}}
export function establishWaterSource(input:EstablishWaterSourceInput){
  input=EstablishWaterSourceSchema.parse(input)
  const command=JSON.stringify({kind:'establish',input}),old=oldReceipt(input.eventId,command);if(old)return old
  assertToolkitPreparation();room()
  const state=gs.getState(),object=state.dmTools?.objects[input.objectId],fact=state.worldFacts?.find(fact=>fact.id===input.establishedFactId)
  if(!object||object.state==='destroyed'||object.mapId!==state.currentMapId)toolkitError('WATER_SOURCE_OBJECT_REQUIRED','Choose an actual intact scene-source object on the active map; no source object or archived location is created/reactivated.')
  if(!fact||fact.mapId!==object!.mapId)toolkitError('WATER_SOURCE_FACT_REQUIRED','Choose the actual established resource fact on this source map; provenance cannot create water from a name or nonce.')
  const sourcePoison=activePlayerPoison(gs.getState(),JSON.stringify(['object',input.objectId]));if(sourcePoison&&playerPoisonStateOf(gs.getState())?.preparations[sourcePoison.preparationId].delivery==='ingested')toolkitError('POISON_SOURCE_BODY_VOLUME_UNSUPPORTED','This source object already has a real ingested poison application. Establishing finite/permanent water cannot silently discard or distribute that unknown source-body concentration; resolve the actual contamination before declaring its water ledger.')
  if(saved()?.sources[input.objectId])toolkitError('WATER_SOURCE_ALREADY_TRACKED','This real source identity already retains its actual stock; a new event ID or fact cannot reset it.')
  if(Object.values(saved()?.sources??{}).some(source=>source.establishedFactId===input.establishedFactId))toolkitError('WATER_SOURCE_IDENTITY_CONFLICT','This actual established water resource already has its canonical source object; another alias cannot duplicate its stock.')
  if(Object.keys(saved()?.sources??{}).length>=128)toolkitError('WATER_SOURCE_LIMIT','The 128-source history is full; no depleted source is evicted.')
  const knownHazards=hazardFacts(input.hazardFactIds)
  const source:WaterSourcesState['sources'][string]={objectId:input.objectId,objectCreation:object!.creation,establishedFactId:input.establishedFactId,kind:input.kind,
    ...(input.kind==='finite'?{initialQuarterPints:input.quantityQuarterPints!,remainingQuarterPints:input.quantityQuarterPints!}:{}),
    waterWeightLbPerPint:input.waterWeightLbPerPint,mapId:object!.mapId,roomId:object!.roomId,cell:{...object!.cell},hazardFactIds:input.hazardFactIds,
    establishedFact:structuredClone(fact!) as unknown as Record<string,unknown>,hazardFacts:knownHazards,source:input.source,establishedAt:now()}
  data().sources[input.objectId]=source
  syncWeatherClock(now())
  return remember(input.eventId,command,{success:true,source:structuredClone(source),waterCreated:false,containerCreated:false,purificationPerformed:false})
}
export function fillWaterContainer(input:FillWaterContainerInput){
  input=FillWaterContainerSchema.parse(input)
  const command=JSON.stringify({kind:'fill',input}),old=oldReceipt(input.eventId,command);if(old)return old
  actor();room()
  const source=saved()?.sources[input.objectId],object=gs.getState().dmTools?.objects[input.objectId]
  if(!source||!object||object.state==='destroyed'||object.creation!==source.objectCreation)toolkitError('WATER_SOURCE_REQUIRED','Choose the exact actual established intact source identity; no old source is recreated.')
  if(object!.mapId!==source!.mapId||object!.cell.x!==source!.cell.x||object!.cell.y!==source!.cell.y)
    toolkitError('WATER_SOURCE_LOCATION_CHANGED','This situated source no longer has its observed physical anchor; no water body is teleported along with a moved marker.')
  if(activePhysicalLoad(gs.getState())?.targetKind==='object'&&activePhysicalLoad(gs.getState())?.targetId===input.objectId)
    toolkitError('WATER_SOURCE_PHYSICAL_HANDLING_REQUIRED','Release this actual scene-source object before operating it; portable liquid vessels use their registered item-transfer procedure.')
  if(object!.locked||object!.kind==='container'&&object!.state!=='open')toolkitError('WATER_SOURCE_ACCESS_REQUIRED','Open/unlock the actual source container through its real procedure before drawing water.')
  assertToolkitReach({mapId:source!.mapId,roomId:source!.roomId,cell:source!.cell},'player',1,input.objectId)
  const target=actualContainer(input.targetItemId)
  if(source!.kind==='finite'&&input.quarterPints>source!.remainingQuarterPints!)toolkitError('WATER_SOURCE_EMPTY','Choose only actual finite water still remaining; new event IDs do not refill the source.')
  if(target.container.contentsQuarterPints+input.quarterPints>target.container.capacityQuarterPints)toolkitError('WATER_CONTAINER_CAPACITY_EXCEEDED','The requested real fill exceeds this container remaining source capacity.')
  if(source!.waterWeightLbPerPint!==target.container.waterWeightLbPerPint)toolkitError('WATER_MASS_CONTEXT_CONFLICT','Source and recipient must use compatible actual measured water mass per pint; no mass appears or disappears during transfer.')
  hands(input,[input.targetItemId])
  const poisonPlan=planWaterPoisonTransfer({eventId:input.eventId,targetItemId:input.targetItemId,quarterPints:input.quarterPints})
  const future=structuredClone(gs.getState()),next=future.dmTools!.foraging!.containers[input.targetItemId]
  next.contentsQuarterPints+=input.quarterPints;next.hazardFactIds=combineHazards(next.hazardFactIds,source!.hazardFactIds)
  if(source!.kind==='finite')future.dmTools!.waterSources!.sources[input.objectId].remainingQuarterPints!-=input.quarterPints
  futureCapacity(future,target.owned)
  costAndClockPreflight(input)
  return complete(input,command,future,[input.targetItemId],{sourceObjectId:input.objectId,targetItemId:input.targetItemId,
    sourceRemainingQuarterPints:future.dmTools!.waterSources!.sources[input.objectId].remainingQuarterPints??null,targetQuarterPints:next.contentsQuarterPints},poisonPlan)
}
export function transferWater(input:TransferWaterInput){
  input=TransferWaterSchema.parse(input)
  const command=JSON.stringify({kind:'transfer',input}),old=oldReceipt(input.eventId,command);if(old)return old
  actor();room()
  if(input.sourceItemId===input.targetItemId)toolkitError('WATER_SELF_TRANSFER','Choose two distinct actual containers; a self-transfer cannot create or reset water.')
  const source=actualContainer(input.sourceItemId),target=actualContainer(input.targetItemId)
  if(input.quarterPints>source.container.contentsQuarterPints)toolkitError('WATER_CONTENTS_UNAVAILABLE','The source container does not hold that actual quantity.')
  if(target.container.contentsQuarterPints+input.quarterPints>target.container.capacityQuarterPints)toolkitError('WATER_CONTAINER_CAPACITY_EXCEEDED','The target container has insufficient actual remaining space.')
  if(source.container.waterWeightLbPerPint!==target.container.waterWeightLbPerPint)toolkitError('WATER_MASS_CONTEXT_CONFLICT','The actual measured water mass contexts must agree before conservation can be resolved.')
  hands(input,[input.sourceItemId,input.targetItemId])
  const poisonPlan=planWaterPoisonTransfer(input)
  const future=structuredClone(gs.getState()),nextSource=future.dmTools!.foraging!.containers[input.sourceItemId],nextTarget=future.dmTools!.foraging!.containers[input.targetItemId]
  nextSource.contentsQuarterPints-=input.quarterPints;nextTarget.contentsQuarterPints+=input.quarterPints
  nextTarget.hazardFactIds=combineHazards(nextTarget.hazardFactIds,nextSource.hazardFactIds)
  futureCapacity(future,!source.owned&&target.owned)
  costAndClockPreflight(input)
  return complete(input,command,future,[input.sourceItemId,input.targetItemId],{sourceItemId:input.sourceItemId,targetItemId:input.targetItemId,
    sourceQuarterPints:nextSource.contentsQuarterPints,targetQuarterPints:nextTarget.contentsQuarterPints},poisonPlan)
}
