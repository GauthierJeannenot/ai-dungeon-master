import { activeRazorvineObjects, sceneObjectFootprint } from './razorvine-state'
import type { GameState } from './types'
import { getAdventureMap } from './adventure-map'
import { navigationGrid } from './navigation'
import { edgeKey } from './battlemap-geometry'
import { activePhysicalBarriers,barrierReferenceKey,type BarrierBox } from './vertical-barriers'
import { areaContainsPoint,barrierShadowHeights,rayFootprintInterval,subtractIntervals,type Point3,type Interval,type SpellAreaVolume } from './spell-area-geometry'

const E=1e-7
type Edge={from:{x:number;y:number};to:{x:number;y:number}}
export interface AreaBlocker {key:string;boxes:BarrierBox[];edge?:Edge;bottom?:number;top?:number;opaque?:boolean;issue?:string;slab?:boolean}
const cellBox=(x:number,y:number):BarrierBox=>({minXFeet:(x-.5)*5,maxXFeet:(x+.5)*5,minYFeet:(y-.5)*5,maxYFeet:(y+.5)*5})
/** Physical topology, independent of blindness, door discovery and fog of war.
 * An unmeasured wall remains a real planar obstruction; its unknown height
 * is never promoted to an infinitely tall wall for a spatial calculation. */
export function spellAreaBlockers(state:GameState):AreaBlocker[]{
 const map=getAdventureMap(state).maps.find(m=>m.id===state.currentMapId)??getAdventureMap(state).maps[0]
 const vines=activeRazorvineObjects(state)
 const view=vines.length?{...state,dmTools:{...state.dmTools!,objects:Object.fromEntries(Object.entries(state.dmTools!.objects).filter(([,object])=>!object.razorvine))}}:state
 const grid=navigationGrid(view,'player',map.geometry,{ignoreActorEffects:true,ignoreDoorKnowledge:true}),out:AreaBlocker[]=[],keys=new Set<string>()
 const measured=activePhysicalBarriers(state,map.id)
 const add=(b:AreaBlocker)=>{if(!keys.has(b.key)){keys.add(b.key);out.push(b)}}
 for(let y=0;y<map.grid.rows;y++)for(let x=0;x<map.grid.cols;x++){
  const from={x,y}
  if(!grid.free(from,false))add({key:`cell:${x},${y}`,boxes:[cellBox(x,y)]})
  for(const to of [{x:x+1,y},{x,y:y+1}])if(grid.valid(to)&&grid.free(from,false)&&grid.free(to,false)&&!grid.step(from,to,false,false))
   add({key:`edge:${edgeKey(from,to)}`,boxes:[],edge:{from,to}})
 }
 for(const hedge of vines){const bottom=hedge.razorvine!.baseZFeet
  add({key:`razorvine:${hedge.id}`,boxes:sceneObjectFootprint(hedge).map(cell=>cellBox(cell.x,cell.y)),bottom,top:bottom+10,opaque:hedge.blocksSight})
 }
 for(const read of measured){
  if(!read.barrier)continue
  const b=read.barrier,key=barrierReferenceKey(b.reference)
  if(!read.active){if(read.issue)add({key:`invalid:${b.id}`,boxes:read.actual?.boxes??[],edge:read.actual?.edge,issue:read.issue.message});continue}
  const actual=read.actual!
  // A measured obstacle replaces only its own actual footprint. A separate
  // object measurement must not erase an unrelated native wall in that cell.
  const old=out.findIndex(o=>o.key===key)
  if(old>=0)out.splice(old,1)
  if(b.reference.kind==='object'){
   const object=state.dmTools?.objects[b.reference.objectId]
   if(object&&!map.geometry?.blockedCells.some(c=>c.x===object.cell.x&&c.y===object.cell.y)){
    const cell=out.findIndex(o=>o.key===`cell:${object.cell.x},${object.cell.y}`);if(cell>=0)out.splice(cell,1)
   }
  }
  out.push({key,boxes:actual.boxes,edge:actual.edge,bottom:b.bottomZFeet,top:b.topZFeet,opaque:b.blocksSight,slab:b.reference.kind==='surface'})
 }
 return out
}
function pathAcrossEdge(from:Point3,to:{x:number;y:number},edge:Edge):Interval|null{
 const axis=edge.from.x!==edge.to.x?'x':'y',other=axis==='x'?'y':'x'
 const plane=(edge.from[axis]+edge.to[axis])*2.5,delta=to[axis]-from[axis]
 if(Math.abs(delta)<E)return null
 const t=(plane-from[axis])/delta,center=edge.from[other]*5,q=from[other]+t*(to[other]-from[other])
 return t>E&&t<1-E&&q>center-2.5+E&&q<center+2.5-E?{min:t,max:t}:null
}
export function blockerRayInterval(b:AreaBlocker,from:Point3,to:{x:number;y:number}):Interval|null{
 if(b.edge)return pathAcrossEdge(from,to,b.edge)
 const intersections=b.boxes.map(box=>rayFootprintInterval(from,to,box)).filter((x):x is Interval=>Boolean(x))
 return intersections.length?{min:Math.min(...intersections.map(i=>i.min)),max:Math.max(...intersections.map(i=>i.max))}:null
}
export function spellAreaRay(blockers:AreaBlocker[],from:Point3,to:Point3){
 let first:{t:number;point:Point3;blocker:AreaBlocker}|undefined,unknown:string|undefined
 for(const b of blockers){
  const path=blockerRayInterval(b,from,to);if(!path)continue
  if(b.issue){unknown??=b.issue;continue}
  if(b.bottom===undefined||b.top===undefined){
   if(Math.abs(from.z)>E||Math.abs(to.z)>E){unknown??=`Measure the current vertical bounds of ${b.key} crossed by this actual ray.`;continue}
  }else{
   const z0=from.z+(to.z-from.z)*path.min,z1=from.z+(to.z-from.z)*path.max
   if(b.slab?Math.max(z0,z1)<=b.bottom+E||Math.min(z0,z1)>=b.top-E:Math.max(z0,z1)<b.bottom-E||Math.min(z0,z1)>b.top+E)continue
   // Exact entry in both XY and Z, for near-side origin placement.
   if(Math.abs(to.z-from.z)>E){const a=(b.bottom-from.z)/(to.z-from.z),c=(b.top-from.z)/(to.z-from.z);path.min=Math.max(path.min,Math.min(a,c));path.max=Math.min(path.max,Math.max(a,c));if(path.min>path.max+E)continue}
  }
  if(!first||path.min<first.t)first={t:path.min,point:{x:from.x+(to.x-from.x)*path.min,y:from.y+(to.y-from.y)*path.min,z:from.z+(to.z-from.z)*path.min},blocker:b}
 }
 return first?{kind:'blocked' as const,...first}:unknown?{kind:'unknown' as const,message:unknown}:{kind:'clear' as const}
}
/** Exact vertical shadow subtraction, using the creature's measured body
 * interval rather than sampling an invented eye/head height. */
export function unblockedAreaIntervals(blockers:AreaBlocker[],origin:Point3,xy:{x:number;y:number},initial:Interval[]){
 let intervals=initial,unknown:string|undefined
 for(const b of blockers){
  const path=blockerRayInterval(b,origin,xy);if(!path)continue
  if(b.issue){unknown??=b.issue;continue}
  if(b.bottom===undefined||b.top===undefined){
   // The original flat-map path remains authoritative at its actual Z0
   // reference point. Other possible heights need a real measurement.
   if(Math.abs(origin.z)<E&&initial.every(i=>Math.abs(i.min)<E&&Math.abs(i.max)<E))intervals=[]
   else unknown??=`Measure ${b.key}: its unknown height affects this body's possible exposure.`
  }else{
   if(b.slab&&Math.abs(origin.z-b.top)<E&&initial.every(i=>i.min>=b.top!-E))continue
   if(b.slab&&Math.abs(origin.z-b.bottom)<E&&initial.every(i=>i.max<=b.bottom!+E))continue
   intervals=subtractIntervals(intervals,[barrierShadowHeights(origin.z,path,b.bottom,b.top)])
  }
 }
 return{intervals,unknown:intervals.length?unknown:undefined}
}
export function cylinderVerticalIntervals(blockers:AreaBlocker[],area:SpellAreaVolume,xy:{x:number;y:number},initial:Interval[]){
 let intervals=initial,unknown:string|undefined
 const start={...xy,z:area.origin.z},up=area.verticalDirection==='up'
 for(const b of blockers){
  if(b.edge||!blockerRayInterval(b,start,xy))continue
  if(b.issue){unknown??=b.issue;continue}
  if(b.bottom===undefined||b.top===undefined){unknown??=`Measure ${b.key}: this cylinder's actual vertical expansion crosses its occupied footprint.`;continue}
  if(up&&b.top<=area.origin.z+E||!up&&b.bottom>=area.origin.z-E)continue
  const stop=up?Math.max(area.origin.z,b.bottom):Math.min(area.origin.z,b.top)
  intervals=intervals.flatMap(i=>{const min=up?i.min:Math.max(i.min,stop+E),max=up?Math.min(i.max,stop-E):i.max;return min<=max?[{min,max}]:[]})
 }
 return{intervals,unknown:intervals.length?unknown:undefined}
}
/** A witnessed route inside Fireball's actual sphere proves its source
 * exception around a corner. It never ignores all cover. Every graph edge
 * is a real clear segment; convexity keeps it inside the sphere. */
export function fireballCornerRoute(blockers:AreaBlocker[],area:SpellAreaVolume,target:Point3,bounds?:BarrierBox):'clear'|'blocked'|'unknown'{
 const direct=spellAreaRay(blockers,area.origin,target);if(direct.kind==='clear')return'clear'
 const nodes:Point3[]=[area.origin,target],heights=new Set([area.origin.z,target.z])
 for(const b of blockers)if(b.bottom!==undefined&&b.top!==undefined){heights.add(b.top+.001);heights.add(b.bottom-.001)}
 for(const b of blockers){
  const boxes=b.edge?[b.edge.from.x!==b.edge.to.x?{minXFeet:(b.edge.from.x+b.edge.to.x)*2.5,maxXFeet:(b.edge.from.x+b.edge.to.x)*2.5,minYFeet:b.edge.from.y*5-2.5,maxYFeet:b.edge.from.y*5+2.5}:{minYFeet:(b.edge.from.y+b.edge.to.y)*2.5,maxYFeet:(b.edge.from.y+b.edge.to.y)*2.5,minXFeet:b.edge.from.x*5-2.5,maxXFeet:b.edge.from.x*5+2.5}]:b.boxes
  for(const box of boxes)for(const x of [box.minXFeet-.001,box.maxXFeet+.001])for(const y of [box.minYFeet-.001,box.maxYFeet+.001])for(const z of heights){const p={x,y,z};if(areaContainsPoint(area,p)&&(!bounds||x>=bounds.minXFeet&&x<=bounds.maxXFeet&&y>=bounds.minYFeet&&y<=bounds.maxYFeet)&&nodes.length<512)nodes.push(p)}
 }
 const seen=new Set([0]),queue=[0];let uncertain=direct.kind==='unknown'
 while(queue.length){const i=queue.shift()!;for(let j=1;j<nodes.length;j++)if(!seen.has(j)){
  const ray=spellAreaRay(blockers,nodes[i],nodes[j]);if(ray.kind==='unknown')uncertain=true
  if(ray.kind==='clear'){if(j===1)return'clear';seen.add(j);queue.push(j)}
 }}
 // Failure of a bounded constructive graph is never falsely presented as a
 // proof that an unmeasured vertical detour cannot exist.
 const sphereBottom=area.origin.z-area.radius!,sphereTop=area.origin.z+area.radius!
 const possibleUnprovedVerticalDetour=blockers.some(b=>b.bottom===undefined||b.top===undefined||b.bottom>sphereBottom||b.top<sphereTop)
 const possibleUnrepresentedOutside=bounds&&(area.origin.x-area.radius!<bounds.minXFeet||area.origin.x+area.radius!>bounds.maxXFeet||area.origin.y-area.radius!<bounds.minYFeet||area.origin.y+area.radius!>bounds.maxYFeet)
 return uncertain||nodes.length>=512||possibleUnprovedVerticalDetour||possibleUnrepresentedOutside?'unknown':'blocked'
}
