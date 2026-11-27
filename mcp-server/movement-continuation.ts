import { RuleViolation } from './rules'
import * as gs from './game-state'
import { hero } from './hero-rules'
import { executeNavigation } from './navigation'
import { resumeActualJump } from './actual-jump'
import type { OpportunityBoundary } from './opportunity-boundary'
const result=(data:unknown)=>({content:[{type:'text' as const,text:JSON.stringify(data)}]})
export interface MovementContinuation {tumbleId?:string;overrunId?:string;iceWalk?:import('./navigation').SlipperyIceWalk;nativeFlightId?:string;specialMovementId?:string;jumpId?:string;type:'movement';actorId:string;goal:import('../lib/navigation').NavigationGoal;allowPartial:boolean;acknowledgeEventIds:string[];ignored:string[];opportunityBoundary?:OpportunityBoundary;reactionMovement?:boolean;transport?:import('./grapple-transport').GrappleTransportInput;movementMode?:import('../lib/navigation').NavigationMovementMode}
export function resumeMovement(command:MovementContinuation,attack?:unknown):ReturnType<typeof result>{
  if(command.overrunId&&command.tumbleId)throw new RuleViolation('CROSSING_CONTINUATION_CONFLICT','One exact current movement continuation cannot select both source modes.',{})
  if(command.tumbleId)return resumePhysicalContinuation({type:'engine-effect',domain:'dmg-tumble',command:{eventId:command.tumbleId,ignored:command.ignored}},attack)
  if(command.overrunId)return resumePhysicalContinuation({type:'engine-effect',domain:'dmg-overrun',command:{eventId:command.overrunId,ignored:command.ignored}},attack)
  if(command.nativeFlightId)return resumePhysicalContinuation({type:'engine-effect',domain:'native-flight',command:{eventId:command.nativeFlightId,ignored:command.ignored}},attack)
  if(command.specialMovementId)return resumePhysicalContinuation({type:'engine-effect',domain:'special-movement',command:{eventId:command.specialMovementId,ignored:command.ignored}})
  if(command.jumpId)return resumeActualJump(command.jumpId,command.ignored,attack)
  const actor=gs.getPhysicalCreature(command.actorId)!
  let move:ReturnType<typeof executeNavigation>|undefined
  try{move=actor.hp.current>0?executeNavigation(command.actorId,command.goal,command.allowPartial,command.acknowledgeEventIds,command.ignored,command.reactionMovement,command.transport,command.movementMode,command.iceWalk):undefined}
  catch(error){
    if(!command.opportunityBoundary?.spatial||!(error instanceof RuleViolation))throw error
    return result({attack,movementStopped:true,stopReason:error.code,actorId:command.actorId,
      actualCell:{...actor.position},newMovementCreated:false,pendingReaction:hero().pending})
  }
  return result({attack,movement:move,actorDown:actor.hp.current<=0,pendingReaction:hero().pending})
}

export interface EngineEffectContinuation{type:'engine-effect';domain:string;command:Record<string,unknown>}
export type PhysicalContinuation=MovementContinuation|EngineEffectContinuation
const physicalEffects=new Map<string,(command:Record<string,unknown>,movementStopped:boolean,completedEffect?:unknown)=>ReturnType<typeof resumeMovement>>()
export function registerPhysicalContinuation(domain:string,handler:(command:Record<string,unknown>,movementStopped:boolean,completedEffect?:unknown)=>ReturnType<typeof resumeMovement>){physicalEffects.set(domain,handler)}
export function resumePhysicalContinuation(command:PhysicalContinuation,completedEffect?:unknown){
 if(command.type==='movement')return resumeMovement(command)
 const handler=physicalEffects.get(command.domain);if(!handler)throw new RuleViolation('PHYSICAL_CONTINUATION_UNAVAILABLE','The exact original physical-effect continuation is not registered; no new action or source effect is invented.',{})
 return handler(command.command,false,completedEffect)
}
export function stopPhysicalContinuation(command:PhysicalContinuation){
 if(command.type==='engine-effect'){const handler=physicalEffects.get(command.domain);if(!handler)throw new RuleViolation('PHYSICAL_CONTINUATION_UNAVAILABLE','The exact original physical-effect continuation is not registered; no new action or source effect is invented.',{});return handler(command.command,true)}
 if(command.overrunId&&command.tumbleId)throw new RuleViolation('CROSSING_CONTINUATION_CONFLICT','One exact current movement continuation cannot select both source modes.',{})
 if(command.tumbleId)return stopPhysicalContinuation({type:'engine-effect',domain:'dmg-tumble',command:{eventId:command.tumbleId,ignored:command.ignored}})
 if(command.overrunId)return stopPhysicalContinuation({type:'engine-effect',domain:'dmg-overrun',command:{eventId:command.overrunId,ignored:command.ignored}})
 if(command.nativeFlightId)return stopPhysicalContinuation({type:'engine-effect',domain:'native-flight',command:{eventId:command.nativeFlightId,ignored:command.ignored}})
 if(command.specialMovementId)return stopPhysicalContinuation({type:'engine-effect',domain:'special-movement',command:{eventId:command.specialMovementId}})
 if(command.jumpId)return resumeActualJump(command.jumpId,command.ignored)
 if(command.reactionMovement)hero().effects=hero().effects.filter(effect=>effect.kind!=='readied-movement'||!effect.targetIds.includes(command.actorId))
 return result({movementStopped:true,actorId:command.actorId,actualCell:{...gs.getPhysicalCreature(command.actorId)!.position},newMovementCreated:false})
}
