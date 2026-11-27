/** Continuous PHB2014 volumes in feet. No game state, dice or inferred height.
 * The line uses a circular transverse section whose diameter is its sourced
 * width; this is an explicit engine convention, not an official clarification. */
export type Point3={x:number;y:number;z:number}
export type Interval={min:number;max:number}
export type SpellAreaVolume={shape:'cone'|'cube'|'cylinder'|'line'|'sphere';origin:Point3;includeOrigin:boolean;
 direction?:Point3;faceU?:Point3;faceV?:Point3;offsetU?:number;offsetV?:number;
 length?:number;side?:number;radius?:number;width?:number;height?:number;verticalDirection?:'up'|'down'}
export const AREA_EPSILON=1e-8
const E=AREA_EPSILON,ALL={min:-Infinity,max:Infinity}
export const dot3=(a:Point3,b:Point3)=>a.x*b.x+a.y*b.y+a.z*b.z
export const sub3=(a:Point3,b:Point3):Point3=>({x:a.x-b.x,y:a.y-b.y,z:a.z-b.z})
export const add3=(a:Point3,b:Point3):Point3=>({x:a.x+b.x,y:a.y+b.y,z:a.z+b.z})
export const scale3=(a:Point3,n:number):Point3=>({x:a.x*n,y:a.y*n,z:a.z*n})
export const length3=(a:Point3)=>Math.hypot(a.x,a.y,a.z)
export const distance3=(a:Point3,b:Point3)=>length3(sub3(a,b))
export const cross3=(a:Point3,b:Point3):Point3=>({x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x})
export function unit3(a:Point3):Point3{
 const n=length3(a);if(![a.x,a.y,a.z,n].every(Number.isFinite)||n<E)throw Error('Choose a finite nonzero direction.')
 return scale3(a,1/n)
}
export function intersectIntervals(a:Interval[],b:Interval[]):Interval[]{
 return a.flatMap(x=>b.flatMap(y=>{const min=Math.max(x.min,y.min),max=Math.min(x.max,y.max);return min<=max+E?[{min,max}]:[]}))
}
function linearRange(a:number,b:number,min:number,max:number):Interval[]{
 if(Math.abs(a)<E)return b>=min-E&&b<=max+E?[ALL]:[]
 const x=(min-b)/a,y=(max-b)/a;return[{min:Math.min(x,y),max:Math.max(x,y)}]
}
/** All q for a*q²+b*q+c <= 0, including a tangent point. */
function quadraticRange(a:number,b:number,c:number):Interval[]{
 if(Math.abs(a)<E){if(Math.abs(b)<E)return c<=E?[ALL]:[];const root=-c/b;return[b>0?{min:-Infinity,max:root}:{min:root,max:Infinity}]}
 const disc=b*b-4*a*c
 if(disc<-E)return a<0?[ALL]:[]
 if(Math.abs(disc)<=E){const root=-b/(2*a);return a<0?[ALL]:[{min:root,max:root}]}
 const r=Math.sqrt(Math.max(0,disc)),x=(-b-r)/(2*a),y=(-b+r)/(2*a),lo=Math.min(x,y),hi=Math.max(x,y)
 return a>0?[{min:lo,max:hi}]:[{min:-Infinity,max:lo},{min:hi,max:Infinity}]
}
/** Exact vertical sections of the selected convex volume at one map point. */
export function areaVerticalIntervals(area:SpellAreaVolume,x:number,y:number):Interval[]{
 const dx=x-area.origin.x,dy=y-area.origin.y
 if(area.shape==='sphere'){
  const r2=area.radius!**2-dx*dx-dy*dy;if(r2<-E)return[]
  const dz=Math.sqrt(Math.max(0,r2));return[{min:area.origin.z-dz,max:area.origin.z+dz}]
 }
 if(area.shape==='cylinder'){
  if(dx*dx+dy*dy>area.radius!**2+E)return[]
  const end=area.origin.z+(area.verticalDirection==='up'?1:-1)*area.height!
  return[{min:Math.min(area.origin.z,end),max:Math.max(area.origin.z,end)}]
 }
 if(area.shape==='cube'){
  let intervals:Interval[]=[ALL]
  for(const [axis,min,max]of [[area.direction!,0,area.side!],[area.faceU!,-area.offsetU!,area.side!-area.offsetU!],[area.faceV!,-area.offsetV!,area.side!-area.offsetV!]]as Array<[Point3,number,number]>)
   intervals=intersectIntervals(intervals,linearRange(axis.z,axis.x*dx+axis.y*dy,min,max))
  return intervals.map(q=>({min:q.min+area.origin.z,max:q.max+area.origin.z}))
 }
 const d=area.direction!,b=d.x*dx+d.y*dy,factor=area.shape==='cone'?1.25:1
 const radius=area.shape==='line'?area.width!/2:0
 const radial=quadraticRange(1-factor*d.z*d.z,-2*factor*d.z*b,dx*dx+dy*dy-factor*b*b-radius*radius)
 return intersectIntervals(radial,linearRange(d.z,b,0,area.length!)).map(q=>({min:q.min+area.origin.z,max:q.max+area.origin.z}))
}
export function areaContainsPoint(area:SpellAreaVolume,p:Point3):boolean{
 if(!area.includeOrigin&&distance3(area.origin,p)<=E)return false
 return areaVerticalIntervals(area,p.x,p.y).some(i=>p.z>=i.min-E&&p.z<=i.max+E)
}
export function targetAreaIntervals(area:SpellAreaVolume,point:{x:number;y:number;z:number},height:number|null):Interval[]{
 const intervals=intersectIntervals(areaVerticalIntervals(area,point.x,point.y),[{min:point.z,max:height===null?Infinity:point.z+height}])
 return intervals.filter(i=>i.max-i.min>E||areaContainsPoint(area,{x:point.x,y:point.y,z:(i.min+i.max)/2}))
}
export function areaBodyMembership(area:SpellAreaVolume,point:Point3,height:number|null):'inside'|'outside'|'unknown_height'{
 const intervals=targetAreaIntervals(area,point,height)
 if(!intervals.length)return'outside'
 if(height!==null||areaContainsPoint(area,point)||intervals.some(i=>i.min<=point.z+E&&i.max>point.z+E))return'inside'
 return'unknown_height'
}
export function subtractIntervals(initial:Interval[],blocked:Interval[]):Interval[]{
 let result=initial
 for(const obstacle of blocked)result=result.flatMap(i=>{
  if(obstacle.max<i.min-E||obstacle.min>i.max+E)return[i]
  const pieces:Interval[]=[]
  if(obstacle.min>i.min+E)pieces.push({min:i.min,max:Math.min(i.max,obstacle.min-E*2)})
  if(obstacle.max<i.max-E)pieces.push({min:Math.max(i.min,obstacle.max+E*2),max:i.max})
  return pieces
 })
 return result
}
/** Interior ray intersection with a measured XY footprint. A zero-thickness
 * wall can supply enter=exit directly instead of using this rectangle. */
export function rayFootprintInterval(from:Point3,to:{x:number;y:number},box:{minXFeet:number;maxXFeet:number;minYFeet:number;maxYFeet:number}):Interval|null{
 let min=0,max=1
 for(const [axis,lo,hi]of [['x',box.minXFeet,box.maxXFeet],['y',box.minYFeet,box.maxYFeet]]as const){
  const delta=to[axis]-from[axis]
  if(Math.abs(delta)<E){if(from[axis]<=lo+E||from[axis]>=hi-E)return null}
  else{const a=(lo-from[axis])/delta,b=(hi-from[axis])/delta;min=Math.max(min,Math.min(a,b));max=Math.min(max,Math.max(a,b))}
 }
 return max-min>E&&max>E&&min<1-E?{min:Math.max(0,min),max:Math.min(1,max)}:null
}
/** Which target heights are shadowed by this real barrier along the fixed XY
 * ray? Endpoints arise from actual entry/exit and measured top/bottom, never
 * a sampled head-height or an invented infinitely tall wall. */
export function barrierShadowHeights(originZ:number,path:Interval,bottom:number,top:number):Interval{
 const values:number[]=[]
 for(const z of [bottom,top])for(const t of [path.min,path.max])values.push(t>E?originZ+(z-originZ)/t:z>originZ+E?Infinity:z<originZ-E?-Infinity:originZ)
 return{min:Math.min(...values),max:Math.max(...values)}
}
