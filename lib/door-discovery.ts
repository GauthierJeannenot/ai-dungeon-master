import type { GameState } from './types'
import { getAdventureMap,getMapSpec,firstMapId } from './adventure-map'
import { ConfigureHiddenDoorSchema,ResolveDoorDiscoverySchema,DoorDiscoveryStateSchema,doorDiscoveryKey,doorCommand } from './door-discovery-state'
import type { BattlemapGeometry } from './battlemap-geometry'

export function hiddenDoorRecord(state:GameState,doorId:string,mapId=state.currentMapId??firstMapId(state)){
 const records=state.dmTools?.doorDiscovery?.records,key=doorDiscoveryKey(mapId,doorId)
 return records&&Object.hasOwn(records,key)?records[key]:undefined
}
/** Knowledge restricts player suggestions/requests, never NPC world geometry. */
export function playerKnowsDoor(state:GameState,doorId:string){return !hiddenDoorRecord(state,doorId)||Boolean(hiddenDoorRecord(state,doorId)?.discovered)}
/** Presentation only. The authoritative world/NPC graph is never rewritten. */
export function playerDoorGeometry(state:GameState,geometry:BattlemapGeometry):BattlemapGeometry{
 return{...geometry,edges:geometry.edges.map(edge=>edge.kind==='door'&&!playerKnowsDoor(state,edge.doorId!)
  ?{from:edge.from,to:edge.to,kind:'wall' as const}:edge)}
}
/** Ordinary wall strokes, with unknown panels rendered like their surrounding
 * wall; never a secret-specific icon. Known/revealed thresholds keep their gap. */
export function hiddenDoorWallMasks(state:GameState):Array<{from:{x:number;y:number};to:{x:number;y:number}}>{
 const map=getMapSpec(state.currentMapId,state),data=getAdventureMap(state)
 const unknown=Object.values(state.dmTools?.doorDiscovery?.records??{}).filter(record=>record.mapId===map.id&&!record.discovered)
 if(!unknown.length)return []
 if(map.geometry)return playerDoorGeometry(state,map.geometry).edges.filter(edge=>edge.kind==='wall').map(edge=>{
  const x=(edge.from.x+edge.to.x+1)/2,y=(edge.from.y+edge.to.y+1)/2
  return edge.from.x===edge.to.x?{from:{x:x-.5,y},to:{x:x+.5,y}}:{from:{x,y:y-.5},to:{x,y:y+.5}}
 })
 // Legacy room geometry already gates an entire doorway-bearing boundary.
 // Cover that ordinary wall run, leaving every known doorway as a gap.
 const masks:Array<{from:{x:number;y:number};to:{x:number;y:number}}>=[]
 for(const record of unknown){
  const [a,b]=record.sides,rooms=[a,b].map(side=>data.rooms.find(room=>room.id===side.roomId)!),areas=rooms.map((room,index)=>(room.areas??[room.zone]).find(area=>{
   const cell=record.sides[index].cell;return cell.x>=area.minX&&cell.x<=area.maxX&&cell.y>=area.minY&&cell.y<=area.maxY
  }))
  if(!areas[0]||!areas[1])continue
  const horizontal=a.cell.x===b.cell.x,at=horizontal?(a.cell.y+b.cell.y+1)/2:(a.cell.x+b.cell.x+1)/2
  const lo=horizontal?Math.max(areas[0].minX,areas[1].minX):Math.max(areas[0].minY,areas[1].minY)
  const hi=horizontal?Math.min(areas[0].maxX,areas[1].maxX):Math.min(areas[0].maxY,areas[1].maxY)
  for(let index=lo;index<=hi;index++){
   const from=horizontal?{x:index,y:at-1}:{x:at-1,y:index},to=horizontal?{x:index,y:at}:{x:at,y:index}
   const knownThreshold=data.doors?.some(door=>playerKnowsDoor(state,door.id)&&door.sides.some(side=>side.cell.x===from.x&&side.cell.y===from.y)&&door.sides.some(side=>side.cell.x===to.x&&side.cell.y===to.y))
   if(!knownThreshold)masks.push(horizontal?{from:{x:index,y:at},to:{x:index+1,y:at}}:{from:{x:at,y:index},to:{x:at,y:index+1}})
  }
 }
 return masks
}
export function confidentialHiddenDoorContext(state:GameState){
 const records=Object.values(state.dmTools?.doorDiscovery?.records??{}).filter(record=>record.mapId===(state.currentMapId??firstMapId(state))
  &&record.sides.some(side=>side.roomId===state.currentRoomId))
 return records.length?`\nPORTES CACHÉES — RÉFÉRENCE CONFIDENTIELLE MJ, jamais une perception du joueur : ${JSON.stringify(records)}\nSeuls les résultats explicites de resolve_door_discovery établissent détection, indices ou compréhension du mécanisme. Une visite, une navigation ou un jet générique ne les découvre pas. Les indices d’une porte concealed ne révèlent pas la porte. Détecter ne signifie ni ouvrir, ni déverrouiller, ni désamorcer.\n`:''
}
export function validateDoorDiscoveryState(state:GameState):string[]{
 const data=state.dmTools?.doorDiscovery;if(!data)return []
 if(!DoorDiscoveryStateSchema.safeParse(data).success)return ['Invalid hidden-door discovery state.']
 const errors:string[]=[],at=state.worldTimeSeconds??0,map=getAdventureMap(state),events=new Set<string>()
 if(Object.keys(data.records).length>256||Object.keys(data.receipts).length>512)errors.push('Hidden-door definitions or retained attempt receipts exceed their non-evicting capacity.')
 for(const [key,record]of Object.entries(data.records)){
  const door=map.doors?.find(door=>door.id===record.doorId),input=(()=>{try{return ConfigureHiddenDoorSchema.parse(JSON.parse(record.creation))}catch{return undefined}})()
  if(key!==doorDiscoveryKey(record.mapId,record.doorId)||!door||door.opening||events.has(record.creationEventId)
   ||!input||input.eventId!==record.creationEventId||input.doorId!==record.doorId||doorCommand(input.definition)!==doorCommand(record.definition)
   ||record.createdAt>at||record.sides.some(side=>!door.sides.some(actual=>actual.roomId===side.roomId&&doorCommand(actual.cell)===doorCommand(side.cell))
    ||(map.rooms.find(room=>room.id===side.roomId)?.mapId??firstMapId(state))!==record.mapId)
   ||new Set(record.sides.map(side=>side.roomId)).size!==2)errors.push(`Hidden door ${record.doorId} lacks its actual prepared doorway/source.`)
  events.add(record.creationEventId)
  for(const [field,resultField]of [['discovered','discovered'],['signsNoticed','clueNoticed'],['mechanismUnderstood','mechanismKnown']]as const){
   const witness=record[field];if(!witness)continue
   const receipt=Object.hasOwn(data.receipts,witness.eventId)?data.receipts[witness.eventId]:undefined
   let input:ReturnType<typeof ResolveDoorDiscoverySchema.parse>|undefined
   try{input=receipt?ResolveDoorDiscoverySchema.parse(JSON.parse(receipt.command)):undefined}catch{/* rejected below */}
   const validMethod=field==='discovered'?(record.definition.kind==='secret'?input?.method==='search'||input?.method==='passive':input?.method==='reveal')
    :field==='signsNoticed'?input?.method==='passive':input?.method==='investigate'
   if(!receipt||receipt.status!=='resolved'||receipt.doorId!==record.doorId||receipt.mapId!==record.mapId||receipt.at!==witness.at
    ||witness.at<record.createdAt||witness.at>at||!validMethod||receipt.result?.success!==true||receipt.result?.[resultField]!==true)
    errors.push(`Hidden door ${record.doorId} has no exact resolved ${field} witness.`)
  }
  if(record.mechanismUnderstood&&(!record.discovered||!record.definition.mechanism))errors.push(`Hidden door ${record.doorId} has an impossible mechanism witness.`)
  if(record.signsNoticed&&(record.definition.kind!=='concealed'||!record.definition.signs))errors.push(`Hidden door ${record.doorId} has an impossible concealed-door clue.`)
 }
 for(const [eventId,receipt]of Object.entries(data.receipts)){
  let input:ReturnType<typeof ResolveDoorDiscoverySchema.parse>|undefined
  try{input=ResolveDoorDiscoverySchema.parse(JSON.parse(receipt.command))}catch{/* rejected below */}
  const record=hiddenDoorRecord(state,receipt.doorId,receipt.mapId)
  if(!input||input.eventId!==eventId||input.doorId!==receipt.doorId||!record||events.has(eventId)||receipt.at<record.createdAt||receipt.at>at
   ||!record.sides.some(side=>doorCommand(side.cell)===doorCommand(input!.cell)))errors.push(`Invalid hidden-door attempt receipt ${eventId}.`)
  if(receipt.status==='resolved'){
   if(receipt.anchor||!receipt.result||receipt.result.eventId!==eventId||receipt.result.at!==receipt.at||receipt.result.doorId!==receipt.doorId)
    errors.push(`Invalid resolved hidden-door attempt ${eventId}.`)
  }else{
   const pending=state.hero?.pending,resolution=pending?.command.toolkitResolution as {domain?:string;command?:Record<string,unknown>}|undefined,a=receipt.anchor
   if(receipt.result||!a||!pending||pending.command.type!=='check'||resolution?.domain!=='door-discovery'||resolution.command?.eventId!==eventId
    ||a.mapId!==state.currentMapId||a.roomId!==state.currentRoomId||a.phase!==state.phase||a.currentTurn!==state.currentTurn||a.turnCounter!==(state.turnCounter??0)
    ||doorCommand(a.position)!==doorCommand(state.player.position)||a.actionCredits!==state.hero?.actionCredits||a.actionUsed!==Boolean(state.actionUsed.player))
    errors.push(`Hidden-door held attempt ${eventId} lost its exact actor/location/action checkpoint.`)
  }
 }
 return errors
}
