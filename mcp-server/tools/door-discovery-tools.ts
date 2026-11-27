import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { ConfigureHiddenDoorSchema,ResolveDoorDiscoverySchema } from '../../lib/door-discovery-state'
import { configureHiddenDoor,inspectHiddenDoors,resolveDoorDiscovery,finishDoorDiscovery } from '../door-discovery'
import { toolkitTransaction,toolkitResult } from '../toolkit'
import { registerCheckedResolution } from '../toolkit-checks'
import type { AbilityCheckResult } from '../../lib/types'

export function registerDoorDiscoveryTools(server:McpServer){
 registerCheckedResolution('door-discovery',(command,result)=>finishDoorDiscovery(command,result as AbilityCheckResult))
 server.registerTool('configure_hidden_door',{
  description:'Confidential MJ preparation outside combat for an already existing closed door on this map. Explicit source fact and DCs only; never creates a door/room/exit or changes geometry, opening, locks/traps or player knowledge. Secret requires detectionDc; concealed requires its actual cover and exact feasible revealing step, normally without a check. Optional concealed signs have their own explicit DC; optional non-obvious secret opening mechanism has its own Investigation DC. Same immutable event replays without re-hiding a discovered door.',
  inputSchema:ConfigureHiddenDoorSchema.shape,annotations:{readOnlyHint:false,idempotentHint:true},
 },async input=>toolkitTransaction(()=>toolkitResult(configureHiddenDoor(ConfigureHiddenDoorSchema.parse(input)))))
 server.registerTool('inspect_hidden_doors',{
  description:'Confidential MJ reference of established hidden doors on this map, actual location, explicit DCs/cover/steps and already resolved discovery witnesses. Do not narrate unknown doors, hints, opening mechanisms or destination rooms from this reference. No check, discovery, action or opening.',
  inputSchema:{doorId:z.string().optional()},annotations:{readOnlyHint:true},
 },async({doorId})=>toolkitTransaction(()=>toolkitResult(inspectHiddenDoors(doorId))))
 server.registerTool('resolve_door_discovery',{
  description:'Resolve one explicit actual doorway location, never player-text intent. passive: no dice/action; secret notices the door, concealed only its authored signs. search: player Search action and real WIS(Perception) against the secret source DC. reveal: exact concealed-door revealStepId at physical reach, normally no die, actual Search action in combat. investigate: separate INT(Investigation) action against the established non-obvious mechanism after detection. Active inspection requires reach; passive requires same room and actual visual LOS/light. Uses immutable event receipts and one held original roll. Finding never opens, traverses, unlocks or disarms. Results are MJ-confidential; only playerResult and genuinely acquired facts may be narrated.',
  inputSchema:ResolveDoorDiscoverySchema.shape,annotations:{readOnlyHint:false,idempotentHint:true},
 },async input=>toolkitTransaction(()=>resolveDoorDiscovery(ResolveDoorDiscoverySchema.parse(input))))
}
