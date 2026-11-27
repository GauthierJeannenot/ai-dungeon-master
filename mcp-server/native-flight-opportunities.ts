import type { GameState } from '../lib/types'
import type { GridCell } from '../lib/adventure-map'
import { actualNativeFlightLocation } from '../lib/native-flight-state'
import { preflightSpatialGroundOpportunities } from './spatial-opportunity'
import { RuleViolation } from './rules'
/** Whole ground paths retain their existing cost. Only actual native airborne
 * counterparts enter the separately qualified physical opportunity procedure. */
export function nativeFlightGroundMovementIssue(state:GameState,actorId:string,path:GridCell[]){
 if(path.length<2||!Object.values(state.monsters).some(m=>actualNativeFlightLocation(state,m.id)?.airborne))return undefined
 if(state.hero?.effects.some(e=>e.kind==='hidden'&&e.expiresAt>(state.worldTimeSeconds??0)))
  return{code:'NATIVE_FLIGHT_VISIBILITY_CONTEXT_REQUIRED',message:'Existing hidden bodies and an actual airborne observer need supported spatial discovery before any ground step; no post-cost XY scan is used.'}
 try{preflightSpatialGroundOpportunities(state,actorId,path);return undefined}
 catch(error){if(error instanceof RuleViolation)return{code:error.code,message:error.message};throw error}
}
