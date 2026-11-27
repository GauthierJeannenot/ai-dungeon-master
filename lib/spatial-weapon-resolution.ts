import type { GameState } from './types'
import type { SpatialAttackContext } from './native-flight-state'
let active:{state:GameState;context:SpatialAttackContext}|undefined
/** Synchronous internal rule scope, like physical creature resolution. No state
 * mutation, async work or model-selected action is created by this helper. */
export function withSpatialWeaponResolution<T>(state:GameState,context:SpatialAttackContext|undefined,resolve:()=>T):T{if(!context)return resolve();const prior=active;active={state,context};try{return resolve()}finally{active=prior}}
export function spatialWeaponResolution(state:GameState,actorId:string,targetId:string){if(active?.state!==state)return undefined;const c=active.context;return c.actorId===actorId&&c.targetId===targetId?c:c.actorId===targetId&&c.targetId===actorId?{...c,actorId,targetId,origin:c.target,target:c.origin,actorWitness:c.targetWitness,targetWitness:c.actorWitness}:undefined}

/** Only the exact selected already-qualified weapon endpoint can replace a XY grid ray. */
export function spatialWeaponRayForCell(state:GameState,actorId:string,cell:{x:number;y:number}){if(active?.state!==state)return undefined;const c=active.context,targetId=c.actorId===actorId?c.targetId:c.targetId===actorId?c.actorId:undefined;if(!targetId)return undefined;const pair=spatialWeaponResolution(state,actorId,targetId);return pair&&pair.target.x===cell.x&&pair.target.y===cell.y?pair:undefined}

/** Attack resolution needs the original ordered source/target; reverse rays
 * remain available only to perception and other pair geometry. */
export function selectedSpatialWeaponResolution(state:GameState,actorId:string,targetId:string){return active?.state===state&&active.context.actorId===actorId&&active.context.targetId===targetId?active.context:undefined}
