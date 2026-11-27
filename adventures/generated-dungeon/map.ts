import type { AdventureMapData, AdventureMapSpec, AdventureRoom, EncounterDefinition } from '../../lib/adventure-map'
import type { DungeonInstance } from '../../lib/dm-tool-state'
import { assertDungeonLayout, DUNGEON_DIRECTIONS } from '../../lib/dungeon-layout'

export const DUNGEON_TILE_CELLS = 7
export const dungeonMapId = (id: string) => `dungeon:${id}`
export const dungeonLeadId = (id: string) => `dungeon:${id}:lead`
export const dungeonGuideId = (id: string) => `dungeon:${id}:guide`
export const dungeonTransitionId = (id: string, way: 'enter' | 'exit') => `dungeon:${id}:${way}`
const cache = new WeakMap<DungeonInstance, ReturnType<typeof build>>()
const overlayCache = new WeakMap<Record<string,DungeonInstance>, {base:AdventureMapData;data:AdventureMapData}>()

function build(instance: DungeonInstance) {
  const layout = assertDungeonLayout(instance.layout), mapId = dungeonMapId(instance.id), k = DUNGEON_TILE_CELLS
  const same = (a: {x:number;y:number}, b: {x:number;y:number}) => a.x===b.x && a.y===b.y
  const center = (tile: {x:number;y:number}) => ({x:tile.x*k+3,y:tile.y*k+3})
  const tiles = [...layout.tiles.filter(tile=>same(tile,layout.entrance)), ...layout.tiles.filter(tile=>!same(tile,layout.entrance))]
  const tileAt=new Map(tiles.map(tile=>[`${tile.x},${tile.y}`,tile])), parents=new Map<string,{x:number;y:number}>(), queue=[tiles[0]], seen=new Set([`${tiles[0].x},${tiles[0].y}`])
  for(let i=0;i<queue.length;i++)for(const d of DUNGEON_DIRECTIONS)if(queue[i].exits&d.bit){const key=`${queue[i].x+d.dx},${queue[i].y+d.dy}`;if(!seen.has(key)){seen.add(key);parents.set(key,queue[i]);queue.push(tileAt.get(key)!)}}
  const goalParent=parents.get(`${layout.objective.x},${layout.objective.y}`)!
  const approach={dx:goalParent.x-layout.objective.x,dy:goalParent.y-layout.objective.y}
  const rooms: AdventureRoom[] = [], entryCells: AdventureMapData['entryCells'] = {}, roomHooks: Record<string,string> = {}, encounters: Record<string,EncounterDefinition> = {}
  const free = new Set<string>(), key = (x:number,y:number)=>`${x},${y}`
  let objectiveRoomId = ''
  let encounterAdded = false
  const moods = ['Des traces de poussière interrompues longent la pierre.', 'Une goutte régulière résonne entre les murs.', 'Des marques anciennes entourent une niche vide.', 'Des débris secs craquent sous les pas.']
  tiles.forEach((tile,index)=>{
    const id=`dungeon:${instance.id}:room:${index+1}`, cell=center(tile), goal=same(tile,layout.objective)
    const floor = new Set<string>(), add=(x:number,y:number)=>{floor.add(key(x,y));free.add(key(x,y))}
    add(cell.x,cell.y)
    if(tile.tileId==='room')for(let y=-1;y<=1;y++)for(let x=-1;x<=1;x++)add(cell.x+x,cell.y+y)
    for(const d of DUNGEON_DIRECTIONS)if(tile.exits&d.bit)for(let step=1;step<=3;step++)add(cell.x+d.dx*step,cell.y+d.dy*step)
    rooms.push({ id, mapId, name: index===0?'Entrée du passage':goal?'Salle de la piste':`Passage ${index+1}`,
      zone:{minX:tile.x*k,maxX:tile.x*k+6,minY:tile.y*k,maxY:tile.y*k+6},
      areas:[...floor].map(value=>{const [x,y]=value.split(',').map(Number);return{minX:x,maxX:x,minY:y,maxY:y}}) })
    entryCells[id]=goal && instance.questLink.delivery==='npc'?{x:cell.x+approach.dx,y:cell.y+approach.dy}:cell
    roomHooks[id]=`${moods[(tile.x*7+tile.y*11)%moods.length]} Aucun secret ni trésor acquis par simple entrée.`
    if(goal){
      objectiveRoomId=id
      roomHooks[id]+=`\nLIEN DE QUÊTE CONFIDENTIEL : objectif ${JSON.stringify(instance.questLink.goal)}. Piste ${JSON.stringify(instance.questLink.lead)}. Transmission ${instance.questLink.delivery}. Utilise discover_dungeon_lead(dungeonId=${JSON.stringify(instance.id)}) au contact ; la piste reste inconnue avant la réussite. Aucun accomplissement automatique de la quête principale.`
    }else if(index>0 && (!encounterAdded || index%4===0)){
      encounterAdded = true
      const direction=DUNGEON_DIRECTIONS.find(d=>tile.exits&d.bit)!, monsterCell={x:cell.x+direction.dx*2,y:cell.y+direction.dy*2}
      const encounterId=`dungeon:${instance.id}:encounter:${index+1}`
      encounters[encounterId]={id:encounterId,roomId:id,name:'Occupant du passage',monsters:[{monsterType:index%8===0?'skeleton':'goblin',cell:monsterCell}]}
      rooms.at(-1)!.navigationEvent={id:encounterId,label:'Des signes de présence demandent une décision du MJ.'}
      roomHooks[id]+=`\nRencontre possible ${JSON.stringify(encounterId)}, choisie explicitement via start_encounter ; aucun déclenchement automatique.`
    }
  })
  const grid={cols:layout.width*k,rows:layout.height*k}, blockedCells=[]
  for(let y=0;y<grid.rows;y++)for(let x=0;x<grid.cols;x++)if(!free.has(key(x,y)))blockedCells.push({x,y})
  const map: AdventureMapSpec={id:mapId,name:'Donjon aléatoire',grid,cellSize:32,navigationMode:'tactical',fogOfWar:true,
    travelGroup:mapId,geometry:{version:1,mapId,grid,source:{kind:'procedural',version:1},review:'approved',blockedCells,edges:[],decorations:[],uncertainties:[],contradictions:[]}}
  const startCell=center(layout.entrance), goalCell=center(layout.objective)
  const npc=instance.questLink.delivery==='npc' ? {id:dungeonGuideId(instance.id),name:'Témoin du passage',kind:'dungeon-guide',
    mapId,roomId:objectiveRoomId,cell:goalCell,disposition:'neutral' as const,visibleFromStart:true,statBlock:'commoner',
    description:'Une personne qui peut transmettre une piste sur ton objectif.'} : null
  return {map,rooms,entryCells,roomHooks,encounters,startCell,goalCell,objectiveRoomId,npc}
}
export function dungeonContent(instance: DungeonInstance) {
  let content=cache.get(instance)
  if(!content){content=build(instance);cache.set(instance,content)}
  return content
}
export function overlayDungeons(base: AdventureMapData, instances: Record<string,DungeonInstance>): AdventureMapData {
  const existing=overlayCache.get(instances)
  if(existing?.base===base)return existing.data
  const data: AdventureMapData={...base,maps:[...base.maps],rooms:[...base.rooms],entryCells:{...base.entryCells},roomHooks:{...base.roomHooks},
    encounters:{...base.encounters},npcs:[...base.npcs],clues:[...base.clues??[]],mapQuests:{...base.mapQuests},mapTransitions:[...base.mapTransitions]}
  for(const instance of Object.values(instances)){
    const c=dungeonContent(instance), mapId=c.map.id
    data.maps.push(c.map);data.rooms.push(...c.rooms);Object.assign(data.entryCells,c.entryCells);Object.assign(data.roomHooks,c.roomHooks);Object.assign(data.encounters,c.encounters)
    if(c.npc)data.npcs.push(c.npc)
    data.clues!.push({id:dungeonLeadId(instance.id),text:instance.questLink.lead,sourceNpcIds:c.npc?[c.npc.id]:[]})
    data.mapQuests[mapId]={mapId,objectives:[{id:dungeonLeadId(instance.id),label:`Trouver une piste : ${instance.questLink.goal}`,required:true,check:{type:'clueRevealed',clueId:dungeonLeadId(instance.id)}}]}
    data.mapTransitions.push({id:dungeonTransitionId(instance.id,'enter'),fromMapId:instance.origin.mapId,toMapId:mapId,
      arrivalCell:c.startCell,arrivalRoomId:c.rooms[0].id,generatedDungeonId:instance.id,
      passage:{roomId:instance.origin.roomId,cell:instance.origin.cell,label:'Entrer dans le donjon aléatoire'}},
    {id:dungeonTransitionId(instance.id,'exit'),fromMapId:mapId,toMapId:instance.origin.mapId,
      arrivalCell:instance.origin.cell,arrivalRoomId:instance.origin.roomId,generatedDungeonId:instance.id,
      passage:{roomId:c.rooms[0].id,cell:c.startCell,label:'Revenir au lieu de départ'}})
  }
  overlayCache.set(instances,{base,data})
  return data
}
