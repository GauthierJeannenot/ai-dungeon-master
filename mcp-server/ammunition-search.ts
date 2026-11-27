import { AmmunitionExpenditureSchema, type AmmunitionExpenditure, type AmmunitionSearch } from '../lib/ammunition-state'
import { inferRoomIdOnMap } from '../lib/adventure-map'
import { ammunitionState } from './ammunition'
import { available, advanceHeroTime } from './hero-rules'
import { assertGameTimeAdvance } from './time-preflight'
import { breathingActivityIssue } from '../lib/activity-preflight'
import { toolkitError } from './toolkit'
import * as gs from './game-state'
import * as rules from './rules'

export const AMMUNITION_SEARCH_INTERPRETATION='The PHB search minute is apportioned by explicit MJ durations among actually visited battlefield rooms. Travel uses separately chosen real navigation; other travel, waiting or rest time never counts as active search. The source does not specify per-room durations; this allocation is an implementation interpretation, not an official clarification.'
export function assertAmmunitionSearchActor() {
  available()
  if(gs.getState().phase!=='exploration')toolkitError('AMMUNITION_RECOVERY_AFTER_BATTLE','An ammunition search requires exploration after the battle, never active combat.')
  rules.validateActionUse('player')
}
export function recordedBattleExpenditures(combatGeneration:number):AmmunitionExpenditure[] {
  return Object.values(gs.getState().dmTools?.ammunition?.expenditures??{})
    .filter(record=>record.inCombat===true&&record.combatGeneration===combatGeneration)
    .sort((a,b)=>a.attackId<b.attackId?-1:a.attackId>b.attackId?1:0)
    .map(record=>AmmunitionExpenditureSchema.parse(record))
}
function assertUnsearchedBattle(combatGeneration:number) {
  if(Object.values(gs.getState().dmTools?.ammunition?.recoveries??{}).some(record=>record.combatGeneration===combatGeneration))
    toolkitError('AMMUNITION_BATTLE_ALREADY_SEARCHED','This whole battle already has its one actual ammunition recovery.')
}
function field(expenditures:AmmunitionExpenditure[]) {
  const state=gs.getState(),mapId=expenditures[0].mapId
  if(expenditures.some(record=>record.mapId!==mapId))toolkitError('AMMUNITION_SEARCH_MULTIMAP_UNSUPPORTED','A search cannot infer travel across different battlefield maps.')
  const rooms=expenditures.flatMap(record=>[record.roomId,inferRoomIdOnMap(record.shooterCell,mapId,state),inferRoomIdOnMap(record.targetCell,mapId,state)])
  if(rooms.some(room=>!room))toolkitError('AMMUNITION_BATTLEFIELD_GEOMETRY_REQUIRED','Every recorded battle origin and target needs its actual room before search progress can be certified.')
  const requiredRoomIds=[...new Set(rooms as string[])].sort()
  if(requiredRoomIds.length>60)toolkitError('AMMUNITION_SEARCH_AREAS_UNSUPPORTED','This bounded whole-second search cannot certify more than sixty separate room checkpoints in one minute.')
  return {mapId,requiredRoomIds}
}
function view(search:AmmunitionSearch) {
  const coveredRoomIds=[...new Set(search.markOrder.map(id=>search.marks[id].roomId))]
  return {searchId:search.searchId,combatGeneration:search.combatGeneration,status:search.status,mapId:search.mapId,
    requiredRoomIds:search.requiredRoomIds,coveredRoomIds,elapsedSeconds:search.elapsedSeconds,remainingSeconds:60-search.elapsedSeconds,
    checkpoints:search.markOrder.map(id=>search.marks[id]),...(search.interrupted?{interrupted:search.interrupted}:{}),
    interpretation:AMMUNITION_SEARCH_INTERPRETATION}
}
function searchById(searchId:string) {
  const searches=gs.getState().dmTools?.ammunition?.searches
  const search=searches&&Object.hasOwn(searches,searchId)?searches[searchId]:undefined
  if(!search)toolkitError('AMMUNITION_SEARCH_NOT_FOUND','Choose one exact previously begun ammunition search.')
  return search!
}
function assertContext(search:AmmunitionSearch) {
  assertAmmunitionSearchActor()
  assertUnsearchedBattle(search.combatGeneration)
  if(search.status==='interrupted')toolkitError('AMMUNITION_SEARCH_INTERRUPTED','An actual map change or new combat interrupted this search; previous checkpoints remain history, never fresh search credit.')
  if(search.status!=='active')toolkitError('AMMUNITION_SEARCH_COMPLETED','This search is no longer active.')
  const state=gs.getState()
  if(state.currentMapId!==search.mapId||(state.combatGeneration??0)!==search.combatGenerationAtStart)
    toolkitError('AMMUNITION_SEARCH_CONTEXT_CHANGED','The actual map or combat context differs from the context in which this search began.')
  if(JSON.stringify(recordedBattleExpenditures(search.combatGeneration))!==JSON.stringify(search.expenditures))
    toolkitError('AMMUNITION_SEARCH_EXPENDITURES_CHANGED','The exact frozen expenditure witnesses changed; no inserted or rewritten projectile can join this search.')
}
export function beginAmmunitionSearch(input:{searchId:string;combatGeneration:number}) {
  assertAmmunitionSearchActor()
  const state=gs.getState(),creation=JSON.stringify(input),searches=state.dmTools?.ammunition?.searches
  const existing=searches&&Object.hasOwn(searches,input.searchId)?searches[input.searchId]:undefined
  if(existing) {
    if(existing.creation!==creation)toolkitError('AMMUNITION_SEARCH_ID_CONFLICT','This search ID has another immutable battle definition.')
    return {success:true,replayed:true,search:view(existing),seconds:0}
  }
  assertUnsearchedBattle(input.combatGeneration)
  if(input.combatGeneration<=0||input.combatGeneration>(state.combatGeneration??0))toolkitError('AMMUNITION_BATTLE_REQUIRED','Choose an actual established positive combat generation.')
  const expenditures=recordedBattleExpenditures(input.combatGeneration)
  if(!expenditures.length)toolkitError('AMMUNITION_NO_EXPENDITURE','No actual in-combat expenditure witnesses exist for this battle.')
  const {mapId,requiredRoomIds}=field(expenditures)
  if(state.currentMapId!==mapId||!state.currentRoomId||inferRoomIdOnMap(state.player.position,mapId,state)!==state.currentRoomId)
    toolkitError('AMMUNITION_BATTLEFIELD_REQUIRED','Return to the actual battlefield map before beginning a physical search.')
  if(Object.values(searches??{}).some(other=>other.status==='active'&&other.combatGeneration===input.combatGeneration
    &&other.combatGenerationAtStart===(state.combatGeneration??0)&&other.mapId===state.currentMapId))
    toolkitError('AMMUNITION_SEARCH_ALREADY_STARTED','This battle already has an active search in the current context; continue its exact searchId.')
  if(Object.keys(searches??{}).length>=128)toolkitError('AMMUNITION_SEARCH_LIMIT','The retained search registry is full; no prior progress witness is discarded.')
  const search:AmmunitionSearch={searchId:input.searchId,creation,combatGeneration:input.combatGeneration,
    combatGenerationAtStart:state.combatGeneration??0,mapId,requiredRoomIds,expenditures,startedAt:state.worldTimeSeconds??0,
    status:'active',elapsedSeconds:0,marks:{},markOrder:[]}
  const data=ammunitionState();data.searches??={};data.searches[input.searchId]=search
  return {success:true,replayed:false,search:view(search),seconds:0,notice:'Search begun without movement, time or ammunition. Move explicitly with the existing navigation tools, then search only the actual current room.'}
}
export function advanceAmmunitionSearch(input:{searchId:string;eventId:string;seconds:number}) {
  const search=searchById(input.searchId)
  assertContext(search)
  const creation=JSON.stringify(input),existing=Object.hasOwn(search.marks,input.eventId)?search.marks[input.eventId]:undefined
  if(existing) {
    if(existing.creation!==creation)toolkitError('AMMUNITION_SEARCH_EVENT_CONFLICT','This retained checkpoint event already performed another exact search duration.')
    return {success:true,replayed:true,checkpoint:existing,search:view(search),seconds:0}
  }
  if(!Number.isSafeInteger(input.seconds)||input.seconds<1||input.seconds>60||search.elapsedSeconds+input.seconds>60)
    toolkitError('AMMUNITION_SEARCH_TIME_INVALID','Choose positive whole seconds within this search’s actual remaining minute.')
  const state=gs.getState(),roomId=state.currentRoomId
  if(!roomId||inferRoomIdOnMap(state.player.position,search.mapId,state)!==roomId||!search.requiredRoomIds.includes(roomId))
    toolkitError('AMMUNITION_SEARCH_ROOM_REQUIRED','Only the actual current battlefield room can receive search credit; navigate there explicitly first.')
  const covered=new Set([...search.markOrder.map(id=>search.marks[id].roomId),roomId])
  const remainingRooms=search.requiredRoomIds.filter(id=>!covered.has(id))
  if(60-search.elapsedSeconds-input.seconds<remainingRooms.length)
    toolkitError('AMMUNITION_SEARCH_AREAS_INCOMPLETE','Leave positive search time for every still unvisited battlefield room; no remote checkpoint can be invented.')
  const activity=breathingActivityIssue(state,'player',input.seconds);if(activity)toolkitError(activity.code,activity.message)
  assertGameTimeAdvance(input.seconds)
  const startedAt=state.worldTimeSeconds??0,cell={...state.player.position}
  advanceHeroTime(input.seconds)
  const checkpoint={eventId:input.eventId,creation,mapId:search.mapId,roomId,cell,seconds:input.seconds,startedAt,completedAt:state.worldTimeSeconds??0}
  search.marks[input.eventId]=checkpoint;search.markOrder.push(input.eventId);search.elapsedSeconds+=input.seconds
  return {success:true,replayed:false,checkpoint,search:view(search),seconds:input.seconds,notice:'Only the performed local search duration was credited; no destination, item or completed recovery was supplied.'}
}
export function completedAmmunitionSearch(searchId:string,combatGeneration:number) {
  const search=searchById(searchId)
  assertContext(search)
  if(search.combatGeneration!==combatGeneration)toolkitError('AMMUNITION_SEARCH_BATTLE_MISMATCH','The supplied search belongs to another exact battle.')
  if(search.elapsedSeconds!==60)toolkitError('AMMUNITION_SEARCH_TIME_INCOMPLETE','Perform the actual full minute of local search before recovering ammunition.')
  const covered=new Set(search.markOrder.map(id=>search.marks[id].roomId))
  if(search.requiredRoomIds.some(id=>!covered.has(id)))toolkitError('AMMUNITION_SEARCH_AREAS_INCOMPLETE','Every actual battlefield room must have a performed local search checkpoint.')
  return search
}
