import type { GameState } from '../lib/types'
import { groundGearPhysicalWitness as witness } from '../lib/ground-gear-recovery-state'
const context=(s:GameState)=>witness({player:s.player,monsters:s.monsters,npcs:s.npcs,hero:s.hero,monsterEffects:s.monsterEffects,worldFacts:s.worldFacts,
 map:s.currentMapId,room:s.currentRoomId,time:s.worldTimeSeconds,phase:s.phase,round:s.round,turn:s.currentTurn,generation:s.combatGeneration,counter:s.turnCounter,action:s.actionUsed,bonus:s.bonusActionUsed,move:s.movementUsed})
let scope:{state:GameState;context:string}|undefined
/** Internal synchronous capability, never an MCP argument or a saved bypass.
 * Only the caller that validated the exact old pit save may enter it. */
export function withHeldPitMeasurements<T>(state:GameState,operation:()=>T):T{
 if(scope)throw new Error('PIT_MIGRATION_SCOPE_NESTED')
 scope={state,context:context(state)}
 try{return operation()}finally{scope=undefined}
}
export function heldPitMeasurementsAllowed(state:GameState){return scope?.state===state&&scope.context===context(state)}
