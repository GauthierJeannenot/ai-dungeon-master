import { assertGreaterBrewingIdAvailable } from './toolkit'
import { planWaterPoisonTransfer,commitWaterPoisonTransfer,actualPoisonedNutrition } from './poison-nutrition'
import { ForageInputSchema, WaterContainerInputSchema, CollectForageInputSchema, FORAGING_DC, CONTAINER_CAPACITY_QUARTER_PINTS,
  type ForagingState, type ForageInput, type WaterContainerInput, type CollectForageInput } from '../lib/foraging-state'
import { carryingStateOf, inspectCarryingCapacity } from '../lib/carrying-state'
import { EQUIPMENT_WEIGHTS_LB } from '../lib/srd/weights'
import { TOOLKIT_SUPPLIES } from '../lib/srd/equipment'
import type { AbilityCheckResult, Item } from '../lib/types'
import * as gs from './game-state'
import { available, alive, hero, now } from './hero-rules'
import { getAbilityModifier, rollDice } from './dice'
import { checkedResolution, registerCheckedResolution } from './toolkit-checks'
import { toolkitState, toolkitError, toolkitResult } from './toolkit'
import { afterInventoryChange } from './equipment'
import { RuleViolation } from './rules'

const saved=()=>gs.getState().dmTools?.foraging
const data=():ForagingState=>toolkitState().foraging??={version:1,attempts:{},foods:{},containers:{},receipts:{}}
function outside(){available();if(gs.getState().phase==='combat')toolkitError('FORAGING_IN_COMBAT','Forage, collect and establish container contents outside actual tactical combat.');if(!alive(gs.getPlayer())||gs.getPlayer().deathSaves?.dead)toolkitError('FORAGING_ACTOR_UNAVAILABLE','Only the actual living capable player can perform this forage operation.')}
function room(){if(Object.keys(saved()?.receipts??{}).length>=1024)toolkitError('FORAGING_HISTORY_LIMIT','The retained physical collection/container receipts are full; no past yield or content is discarded.')}
function oldReceipt(eventId:string,command:string){const old=saved()?.receipts[eventId];if(old&&old.command!==command)toolkitError('FORAGING_EVENT_CONFLICT','This exact event ID retains another immutable physical operation.');return old?{...old.result,replayed:true}:undefined}
function remember(eventId:string,command:string,result:Record<string,unknown>){data().receipts[eventId]={command,result};return result}
function point(){return {mapId:gs.getState().currentMapId!,cell:{...gs.getPlayer().position},walkingSeconds:Object.values(gs.getState().dmTools?.travel?.days??{}).reduce((sum,day)=>sum+day.walkingSeconds,0)}}
function hazards(ids:string[]){
  if(new Set(ids).size!==ids.length)toolkitError('FORAGING_HAZARD_DUPLICATE','Choose each actual established hazard fact only once.')
  return ids.map(id=>{const fact=gs.getState().worldFacts?.find(fact=>fact.id===id);if(!fact)toolkitError('FORAGING_HAZARD_FACT_REQUIRED','Select an actual existing hazard fact ID; no contamination or detection is invented.');return structuredClone(fact!) as unknown as Record<string,unknown>})
}
function intervals(input:ForageInput){
  const travel=gs.getState().dmTools?.travel
  if(!travel?.routes[input.journeyId])toolkitError('TRAVEL_ROUTE_REQUIRED','Choose an actual established route and actual completed foraging intervals.')
  if(new Set(input.travelEventIds).size!==input.travelEventIds.length)toolkitError('FORAGING_INTERVAL_DUPLICATE','Choose each actual travel interval once.')
  const used=new Set(Object.values(saved()?.attempts??{}).flatMap(attempt=>attempt.intervals.map(interval=>interval.eventId)))
  let previousTo:number|undefined
  const rows=input.travelEventIds.map(eventId=>{
    if(used.has(eventId))toolkitError('FORAGING_INTERVAL_ALREADY_USED','This real foraging interval has already produced its one actual check, even under another attempt ID.')
    const receipt=travel!.receipts[eventId]
    let command:{kind?:string;input?:{journeyId?:string;activity?:string;pace?:string}}={}
    try{command=JSON.parse(receipt?.command??'{}')}catch{/* unknown source rejected below */}
    const to=receipt?.result.worldTimeSeconds,seconds=receipt?.result.elapsedSeconds
    if(command.kind!=='step'||command.input?.journeyId!==input.journeyId||command.input.activity!=='forage'
      ||!['normal','slow'].includes(command.input.pace??'')||typeof to!=='number'||typeof seconds!=='number'||seconds<=0||to>now())
      toolkitError('FORAGING_INTERVAL_REQUIRED','Select actual completed advance_travel receipts explicitly performed as forage at normal/slow pace; no waiting, fast segment or narrative interval qualifies.')
    const from=(to as number)-(seconds as number)
    if(previousTo!==undefined&&from!==previousTo)toolkitError('FORAGING_INTERVAL_ORDER_REQUIRED','Select the actual contiguous foraging intervals in chronological order; gaps or other activities are not invented as forage.')
    previousTo=to as number
    return {eventId,from,to:to as number}
  })
  const observation=travel!.receipts[input.travelEventIds.at(-1)!].result.travelObservation
  if(!observation||JSON.stringify(observation)!==JSON.stringify(point()))toolkitError('FORAGING_INTERVAL_STALE','The selected forage interval is no longer at its actual recorded travel/map point. No collection or check reaches backward through subsequent movement.')
  return rows
}
function finishForage(checked:AbilityCheckResult){
  const state=data(),id=state.pendingAttemptId!,attempt=state.attempts[id],succeeded=checked.success===true
  const notation=`1d6${attempt.wisdomModifier>0?'+':''}${attempt.wisdomModifier||''}`
  const foodRoll=succeeded?rollDice(notation):undefined,waterRoll=succeeded?rollDice(notation):undefined
  const foodHalfPounds=Math.max(0,foodRoll?.total??0)*2,waterQuarterPints=Math.max(0,waterRoll?.total??0)*32
  attempt.foodRoll=foodRoll;attempt.waterRoll=waterRoll;attempt.foundFoodHalfPounds=attempt.remainingFoodHalfPounds=foodHalfPounds
  attempt.foundWaterQuarterPints=attempt.remainingWaterQuarterPints=waterQuarterPints
  const result={success:true,foragingSucceeded:succeeded,eventId:id,check:checked,foodRoll:foodRoll??null,waterRoll:waterRoll??null,
    foundFoodPounds:foodHalfPounds/2,foundWaterGallons:waterQuarterPints/32,foodHalfPounds,waterQuarterPints,
    acquired:false,intakeCredited:false,point:attempt.point,hazardFacts:attempt.hazardFacts,
    physicalMinimum:'Negative source yields are clamped to zero as an explicit physical engine interpretation; no item has negative mass.',
    source:'DMG2014 Foraging p111; no fixed additional duration or automatic check frequency is imposed.'}
  attempt.result=result;delete state.pendingAttemptId
  gs.addLogEntry({round:gs.getState().round,turn:'player',action:'Recherche de nourriture et eau',mechanicalDetail:`${checked.mechanicalSummary} | trouvé ${foodHalfPounds/2} lb et ${waterQuarterPints/32} gallons ; aucune acquisition ni consommation implicite.`})
  return toolkitResult(result)
}
export function registerForagingContinuations(){registerCheckedResolution('foraging',(command,checked)=>{
  const id=saved()?.pendingAttemptId,attempt=id?saved()?.attempts[id]:undefined
  if(!id||command.eventId!==id||!attempt||!('proficient'in checked)||checked.entityId!=='player'||checked.ability!=='wis'||checked.dc!==attempt.dc)
    toolkitError('FORAGING_CONTINUATION_MISMATCH','Resume only the actual original Wisdom(Survival) check for this exact foraging opportunity.')
  return finishForage(checked as AbilityCheckResult)
})}
export function inspectForaging(attemptId?:string){return {tracked:!!saved(),attempt:attemptId?saved()?.attempts[attemptId]??null:null,pendingAttemptId:saved()?.pendingAttemptId??null,
  foods:saved()?.foods??{},containers:saved()?.containers??{},sourceCapacitiesQuarterPints:CONTAINER_CAPACITY_QUARTER_PINTS,point:point(),acquired:false,intakeCredited:false}}
export function resolveForaging(input:ForageInput){
  input=ForageInputSchema.parse(input)
  const command=JSON.stringify(input),old=saved()?.attempts[input.eventId]
  if(old){
    if(old.command!==command)toolkitError('FORAGING_ATTEMPT_CONFLICT','The retained forage opportunity has another exact interval or source context.')
    if(old.result)return toolkitResult({...old.result,replayed:true})
    const pending=hero().pending,resolution=pending?.command.toolkitResolution as {domain?:string;command?:{eventId?:string}}|undefined
    if(pending&&resolution?.domain==='foraging'&&resolution.command?.eventId===input.eventId)return toolkitResult({pendingReaction:pending})
    toolkitError('FORAGING_HISTORY_UNRESOLVED','The unresolved old forage check lacks its actual held witness; no replacement die is invented.')
  }
  outside()
  if(!Number.isInteger(gs.getPlayer().stats.wis)||gs.getPlayer().stats.wis<1||gs.getPlayer().stats.wis>30)
    toolkitError('FORAGING_WISDOM_UNSUPPORTED','Standard source Wisdom must be an actual integer1–30 before this check and its yield; nonstandard physiology is not inferred.')
  if(Object.keys(saved()?.attempts??{}).length>=512)toolkitError('FORAGING_ATTEMPT_LIMIT','The 512-opportunity history is full; old intervals and rolls cannot be evicted.')
  const selected=intervals(input),hazardFacts=hazards(input.hazardFactIds),dc=FORAGING_DC[input.abundance]
  const state=data();state.attempts[input.eventId]={input,command,dc,wisdomModifier:getAbilityModifier(gs.getPlayer().stats.wis),intervals:selected,at:now(),point:point(),hazardFacts}
  state.pendingAttemptId=input.eventId
  return checkedResolution({entityId:'player',ability:'wis',skill:'survival',dc,label:'Forage (Survie)'},{domain:'foraging',command:{eventId:input.eventId}})
}
export function registerWaterContainer(input:WaterContainerInput){
  input=WaterContainerInputSchema.parse(input)
  const command=JSON.stringify({kind:'container',input}),old=oldReceipt(input.eventId,command);if(old)return old
  outside();room()
  const item=gs.getPlayer().inventory.find(item=>item.id===input.itemId)
  if(!item)toolkitError('WATER_CONTAINER_ITEM_REQUIRED','Choose an actual owned physical container instance; this declaration provides no item or vessel.')
  const equipment=item!.equipmentId??item!.id,aliases:Record<string,string>={...Object.fromEntries(Object.keys(CONTAINER_CAPACITY_QUARTER_PINTS).map(type=>[type,type])),waterskin_full:'waterskin',waterskin_empty:'waterskin',pot_iron:'iron_pot'}
  if(item!.type!=='misc'||item!.magical||aliases[equipment]&&aliases[equipment]!==input.containerType
    ||!aliases[equipment]&&(equipment in EQUIPMENT_WEIGHTS_LB||(TOOLKIT_SUPPLIES as readonly string[]).includes(equipment)))
    toolkitError('WATER_CONTAINER_PHYSICAL_TYPE_REQUIRED','Choose an actual ordinary liquid container, not an undrained consumable, weapon, armor, magic item or incompatible established equipment type.')
  if(item!.quantity!==undefined&&item!.quantity!==1)toolkitError('WATER_CONTAINER_INSTANCE_REQUIRED','One real container instance is required, not an unresolved stack.')
  if(saved()?.containers[input.itemId])toolkitError('WATER_CONTAINER_ALREADY_TRACKED','This real container is already tracked. Another event ID cannot reset its contents, capacity or spent water.')
  if(equipment==='waterskin_empty'&&input.contentsQuarterPints!==0)
    toolkitError('WATER_CONTENT_HISTORY_CONFLICT','This actual equipment instance is already empty; declaring its container cannot supply water. Collect from a real resolved source instead.')
  if(Object.keys(saved()?.containers??{}).length>=256)toolkitError('WATER_CONTAINER_LIMIT','The 256-container history is full; spent contents are never forgotten.')
  const capacity=CONTAINER_CAPACITY_QUARTER_PINTS[input.containerType]
  if(input.contentsQuarterPints>capacity)toolkitError('WATER_CONTAINER_CAPACITY_EXCEEDED','The explicit current contents exceed the actual published liquid capacity.')
  hazards(input.hazardFactIds)
  const legacy=gs.getState().dmTools?.survival?.provisions[input.itemId]
  if(legacy&&(legacy.kind!=='waterskin_full'||legacy.remainingUnits*4!==input.contentsQuarterPints))
    toolkitError('WATER_CONTENT_HISTORY_CONFLICT','The declaration must preserve actual previously consumed water; no new initial nonce refills it.')
  const poison=actualPoisonedNutrition(input.itemId);if(poison&&poison.actual.units!==input.contentsQuarterPints)toolkitError('POISON_NUTRITION_VOLUME_CHANGED','An initial container declaration cannot retroactively alter the existing quantity containing this whole actual dose. Preserve its actual contents; use real filling/transfer for any change.')
  const {eventId:_id,actualContainerConfirmed:_confirmed,...definition}=input
  data().containers[input.itemId]={...definition,capacityQuarterPints:capacity,declaredAt:now(),...(legacy?{legacyProvisions:{kind:'waterskin_full',remainingUnits:legacy.remainingUnits}}:{})}
  if(legacy)delete gs.getState().dmTools!.survival!.provisions[input.itemId]
  afterInventoryChange()
  return remember(input.eventId,command,{success:true,container:structuredClone(data().containers[input.itemId]),contentsCreated:false,intakeCredited:false,source:'Actual initial physical facts; PHB2014 Container Capacity p153. No dry mass is inferred from full-container mass.'})
}
export function collectForage(input:CollectForageInput){
  input=CollectForageInputSchema.parse(input)
  const command=JSON.stringify({kind:'collect',input}),old=oldReceipt(input.eventId,command);if(old)return old
  outside();room()
  const state=saved(),attempt=state?.attempts[input.attemptId]
  if(!attempt?.result)toolkitError('FORAGE_YIELD_REQUIRED','Choose an actual completed foraging attempt; no yield exists before final check success.')
  if(JSON.stringify(attempt!.point)!==JSON.stringify(point()))toolkitError('FORAGE_SOURCE_OUT_OF_REACH','Collect at the same real map/cell and shared walking point; no remote collection through later travel is performed.')
  if(!input.foodHalfPounds&&!input.waterTransfers.length)toolkitError('FORAGE_COLLECTION_EMPTY','Choose an actual positive food amount or existing-container water transfer.')
  if(input.foodHalfPounds>(attempt!.remainingFoodHalfPounds??0))toolkitError('FORAGE_FOOD_UNAVAILABLE','Choose only half-pounds actually remaining in this resolved food yield.')
  if(new Set(input.waterTransfers.map(transfer=>transfer.itemId)).size!==input.waterTransfers.length)toolkitError('FORAGE_CONTAINER_DUPLICATE','Each actual water container appears once in this transfer.')
  const waterTotal=input.waterTransfers.reduce((sum,transfer)=>sum+transfer.quarterPints,0)
  if(waterTotal>(attempt!.remainingWaterQuarterPints??0))toolkitError('FORAGE_WATER_UNAVAILABLE','Choose only water actually found and still remaining; no free refill or new roll.')
  const future=structuredClone(gs.getState()),projected=future.dmTools!.foraging!,futureAttempt=projected.attempts[input.attemptId]
  let foodItemId:string|undefined
  if(input.foodHalfPounds){
    if(Object.keys(projected.foods).length>=512)toolkitError('FORAGED_FOOD_HISTORY_LIMIT','The 512-food-instance ledger is full; consumed food is never forgotten.')
    foodItemId=`foraged-food:${input.eventId}`
    assertGreaterBrewingIdAvailable(foodItemId)
    if(future.player.inventory.some(item=>item.id===foodItemId)||future.droppedItems?.[foodItemId]||projected.foods[foodItemId])toolkitError('FORAGED_ITEM_ID_CONFLICT','This exact physical food ID already exists; no duplicate ownership is created.')
    const item:Item={id:foodItemId,equipmentId:'foraged_food',name:'Nourriture récoltée',type:'misc',description:`Nourriture réellement trouvée par forage : ${input.foodHalfPounds/2} lb collectées ; contenu quantifié, aucune provision gratuite.`}
    future.player.inventory.push(item)
    projected.foods[foodItemId]={itemId:foodItemId,attemptId:input.attemptId,originalHalfPounds:input.foodHalfPounds,remainingHalfPounds:input.foodHalfPounds,hazardFactIds:[...attempt!.input.hazardFactIds],collectedAt:now()}
    futureAttempt.remainingFoodHalfPounds!-=input.foodHalfPounds
  }
  const poisonPlans=input.waterTransfers.map(transfer=>planWaterPoisonTransfer({eventId:input.eventId,targetItemId:transfer.itemId,quarterPints:transfer.quarterPints}))
  for(const transfer of input.waterTransfers){
    const container=projected.containers[transfer.itemId],item=future.player.inventory.find(item=>item.id===transfer.itemId)
    if(!container||!item)toolkitError('WATER_CONTAINER_REQUIRED','Choose one actual owned container with established source capacity and contents; no empty vessel is provided.')
    if(container.contentsQuarterPints+transfer.quarterPints>container.capacityQuarterPints)toolkitError('WATER_CONTAINER_CAPACITY_EXCEEDED','The transfer exceeds the actual remaining space in this precise container.')
    const combined=[...new Set([...container.hazardFactIds,...attempt!.input.hazardFactIds])]
    if(combined.length>32)toolkitError('WATER_HAZARD_HISTORY_LIMIT','The retained actual source hazards exceed this container history bound; none is discarded.')
    container.hazardFactIds=combined;container.contentsQuarterPints+=transfer.quarterPints
    if(container.containerType==='waterskin'){item.equipmentId='waterskin_full';item.name=`Outre : ${container.contentsQuarterPints/4} pintes d’eau`}
  }
  futureAttempt.remainingWaterQuarterPints!-=waterTotal
  if(carryingStateOf(future)?.actors.player?.tracking){
    const capacity=inspectCarryingCapacity(future)
    if(capacity.status==='unresolved')throw new RuleViolation('CARRYING_DATA_REQUIRED','Actual masses and quantities are required before collecting these physical resources.',{missing:capacity.missing})
    if(capacity.overloaded)throw new RuleViolation('CARRYING_CAPACITY_EXCEEDED','The projected real food/water acquisition exceeds standard carrying capacity.',{carriedWeightLb:capacity.carriedWeightLb,carryingCapacityLb:capacity.carryingCapacityLb})
  }
  gs.getState().dmTools!.foraging=projected;gs.getPlayer().inventory=future.player.inventory
  for(const plan of poisonPlans)commitWaterPoisonTransfer(plan)
  afterInventoryChange()
  return remember(input.eventId,command,{success:true,attemptId:input.attemptId,foodItemId:foodItemId??null,collectedFoodHalfPounds:input.foodHalfPounds,
    collectedWaterQuarterPints:waterTotal,waterTransfers:input.waterTransfers,remainingFoodHalfPounds:futureAttempt.remainingFoodHalfPounds,
    remainingWaterQuarterPints:futureAttempt.remainingWaterQuarterPints,intakeCredited:false,containerCreated:false})
}
