import type { GameState } from '../lib/types'
import type { GridCell } from '../lib/adventure-map'
import type { BattlemapGeometry } from '../lib/battlemap-geometry'
import { navigationGrid,navigationDiagonalsUsed,isDiagonalStep } from '../lib/navigation'
import { distanceFromLoad,loadCells,type LoadFootprint } from '../lib/physical-handling-state'
import { RuleViolation } from './rules'
const same=(a:GridCell,b:GridCell)=>a.x===b.x&&a.y===b.y
const fail=(message:string):never=>{throw new RuleViolation('PHYSICAL_LOAD_PATH_BLOCKED',message,{})}
export function physicalLoadReach(state:GameState,actorId:string,targetId:string,targetKind:'creature'|'object',anchor:GridCell,footprint:LoadFootprint,geometry?:BattlemapGeometry){
  const projected=targetKind==='object'&&state.dmTools?{...state,dmTools:{...state.dmTools,objects:Object.fromEntries(Object.entries(state.dmTools.objects).filter(([id])=>id!==targetId))}}:state
  const grid=navigationGrid(projected,actorId,geometry,{ignoreOccupantIds:[actorId,targetId]})
  return loadCells(anchor,footprint).some(cell=>Math.max(Math.abs(cell.x-state.player.position.x),Math.abs(cell.y-state.player.position.y))===1&&grid.step(state.player.position,cell))
}
/** Joint grid search with a real target footprint. Only this moved object's
 * overlay is removed from the planning projection; authored walls remain. */
export function planPairedLoadPath(state:GameState,actorId:string,toCell:GridCell,targetId:string,targetKind:'creature'|'object',
  targetStart:GridCell,targetToCell:GridCell,footprint:LoadFootprint,geometry?:BattlemapGeometry){
  const objects=targetKind==='object'&&state.dmTools?Object.fromEntries(Object.entries(state.dmTools.objects).filter(([id])=>id!==targetId)):undefined
  const projected=objects?{...state,dmTools:{...state.dmTools!,objects}}:state
  const ignored=[actorId,...(targetKind==='creature'?[targetId]:[])]
  const actorGrid=navigationGrid(projected,actorId,geometry,{ignoreOccupantIds:ignored})
  const targetGrid=navigationGrid(projected,targetId,geometry,{ignoreOccupantIds:ignored,ignoreActorEffects:true})
  const free=(anchor:GridCell)=>loadCells(anchor,footprint).every(cell=>targetGrid.free(cell))
  const step=(from:GridCell,to:GridCell)=>loadCells(from,footprint).every(cell=>targetGrid.step(cell,{x:cell.x+to.x-from.x,y:cell.y+to.y-from.y}))
  if(!actorGrid.valid(toCell)||!loadCells(targetToCell,footprint).every(cell=>targetGrid.valid(cell)))fail('Both selected destinations and the complete actual payload footprint must be on this map.')
  if(distanceFromLoad(toCell,targetToCell,footprint)!==1||!actorGrid.free(toCell)||!free(targetToCell))fail('Choose an unobstructed adjacent carrier destination and non-overlapping load footprint.')
  const actor=state.player,diagonals=navigationDiagonalsUsed(state,actorId)
  const key=(a:GridCell,b:GridCell,d:number)=>`${a.x},${a.y}:${b.x},${b.y}:${d%2}`
  const start={cell:{...actor.position},targetCell:{...targetStart},cost:0,diagonals,key:key(actor.position,targetStart,diagonals)}
  const queue=[start],parents=new Map<string,typeof start|null>([[start.key,null]]),costs=new Map([[start.key,0]])
  while(queue.length){
    queue.sort((a,b)=>a.cost-b.cost)
    const current=queue.shift()!
    if(current.cost!==costs.get(current.key))continue
    if(same(current.cell,toCell)&&same(current.targetCell,targetToCell)){
      const path=[current.cell],targetPath=[current.targetCell];let before=parents.get(current.key)
      while(before){path.push(before.cell);targetPath.push(before.targetCell);before=parents.get(before.key)}
      return {path:path.reverse(),targetPath:targetPath.reverse()}
    }
    for(const next of actorGrid.neighbors(current.cell)){
      if(!actorGrid.step(current.cell,next))continue
      const d=current.diagonals+Number(isDiagonalStep(current.cell,next)),cost=current.cost+actorGrid.stepCost(next,current.cell,current.diagonals)
      const offset={x:current.targetCell.x+next.x-current.cell.x,y:current.targetCell.y+next.y-current.cell.y}
      const candidates=[current.cell,offset,current.targetCell,...targetGrid.neighbors(current.targetCell)],seen=new Set<string>()
      for(const target of candidates){
        const identity=`${target.x},${target.y}`;if(seen.has(identity))continue;seen.add(identity)
        if(distanceFromLoad(next,target,footprint)!==1||!free(target)||!same(target,current.targetCell)&&!step(current.targetCell,target))continue
        if(distanceFromLoad(next,current.targetCell,footprint)===0&&distanceFromLoad(current.cell,target,footprint)===0)continue
        const k=key(next,target,d);if(cost>=(costs.get(k)??Infinity))continue
        const entry={cell:next,targetCell:target,cost,diagonals:d,key:k};costs.set(k,cost);parents.set(k,current);queue.push(entry)
      }
    }
  }
  return fail('No legal joint path reaches the two explicit destinations; neither actor nor load moved.')
}
