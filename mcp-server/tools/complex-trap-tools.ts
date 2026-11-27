import { inspectComplexTrapTurn } from '../../lib/complex-trap-initiative'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { getAdventureMap, inferRoomIdOnMap } from '../../lib/adventure-map'
import { savedDoorState } from '../../lib/navigation'
import { ToolkitCellSchema, ToolkitDescriptionSchema, ToolkitIdSchema } from '../../lib/dm-tool-state'
import { readCrushingSphereSource } from '../rules-library'
import { toolkitState, toolkitResult, toolkitError, toolkitTransaction, assertToolkitPreparation, toolkitLocation } from '../toolkit'
import { complexTrap, complexTrapSnapshot, assertComplexPath, activateComplexTrap, pulseComplexTrap, counterComplexTrap, registerComplexTrapResolutions } from '../complex-traps'
import * as gs from '../game-state'
import * as rules from '../rules'

export function registerComplexTrapTools(server:McpServer){
  registerComplexTrapResolutions()
  server.registerTool('inspect_complex_trap_turn',{description:'Read the actual current complex-trap initiative checkpoint (10 or 20), without dice, action, pulse or target selection. The agent must explicitly supply the complete current physical target IDs to pulse_complex_trap.',inputSchema:{},annotations:{readOnlyHint:true}},async()=>toolkitResult({event:inspectComplexTrapTurn(gs.getState())}))
  server.registerTool('create_complex_trap',{
    description:'MJ preparation outside combat: instantiate the sourced Xanathar Sphere of Crushing Doom, template=crushing_sphere, in an explicit clear rectangle 2 cells wide (10ft), length 2-30 cells, entirely inside one actual active-map room. fromCell/toCell must be ordered opposite corners. Explicit northRune/southRune must sit on the starting/ending short edges. Explicit triggerDoorId must be an actual CLOSED door leading out of the south end. geometryAdaptation declares any rotation/shortening of the original 150x10ft descending hall; damage/DC are never scaled. No trigger, initiative insertion, damage or discovery is automatic. Fixed rules: STR20, 4d10 initially, +2d10 after EACH pass, initiative10 then20+10 from10d10; three successful Arcana20 counters per portal after a distinct examination action. Object impacts/Wall of Force and Dispel Magic targeting runes are not supported and must not be narrated as resolved.',
    inputSchema:{trapId:ToolkitIdSchema,name:z.string().trim().min(1).max(80),template:z.literal('crushing_sphere'),
      fromCell:ToolkitCellSchema,toCell:ToolkitCellSchema,northRune:ToolkitCellSchema,southRune:ToolkitCellSchema,
      triggerDoorId:z.string().min(1),geometryAdaptation:ToolkitDescriptionSchema},
    annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:true,openWorldHint:false},
  },async input=>toolkitTransaction(()=>{
    assertToolkitPreparation()
    const data=toolkitState(),creation=JSON.stringify(input),existing=data.complexTraps?.[input.trapId]
    if(existing){if(existing.creation!==creation)toolkitError('COMPLEX_TRAP_ID_CONFLICT','This ID already has another immutable complex-trap definition.');return toolkitResult({success:true,alreadyCreated:true,trap:complexTrapSnapshot(existing.id)})}
    if(Object.keys(data.complexTraps??{}).length>=16)toolkitError('COMPLEX_TRAP_LIMIT','At most 16 complex traps per session.')
    const width=input.toCell.x-input.fromCell.x+1,height=input.toCell.y-input.fromCell.y+1,vertical=width===2
    if(!(width===2&&height>=2&&height<=30||height===2&&width>=2&&width<=30))toolkitError('COMPLEX_TRAP_GEOMETRY','Use an ordered rectangle 2 cells wide and 2-30 cells long; no free-form invented area.')
    const location=toolkitLocation(input.fromCell)
    for(let y=input.fromCell.y;y<=input.toCell.y;y++)for(let x=input.fromCell.x;x<=input.toCell.x;x++){
      rules.validateMapCell({x,y});if(inferRoomIdOnMap({x,y},location.mapId,gs.getState())!==location.roomId)toolkitError('COMPLEX_TRAP_GEOMETRY','All sphere corridor cells must belong to one actual room.')
    }
    const inBounds=(cell:{x:number;y:number})=>cell.x>=input.fromCell.x&&cell.x<=input.toCell.x&&cell.y>=input.fromCell.y&&cell.y<=input.toCell.y
    if(!inBounds(input.northRune)||!inBounds(input.southRune)||(vertical?input.northRune.y!==input.fromCell.y||input.southRune.y!==input.toCell.y:input.northRune.x!==input.fromCell.x||input.southRune.x!==input.toCell.x))
      toolkitError('COMPLEX_TRAP_PORTAL_GEOMETRY','Declare both actual rune cells on the opposite starting/ending short edges.')
    const door=getAdventureMap(gs.getState()).doors?.find(door=>door.id===input.triggerDoorId),side=door?.sides.find(side=>side.roomId===location.roomId)
    if(!door||door.opening||!side||Math.max(Math.abs(side.cell.x-input.southRune.x),Math.abs(side.cell.y-input.southRune.y))>1||savedDoorState(gs.getState(),door.id)!=='closed')
      toolkitError('COMPLEX_TRAP_TRIGGER_DOOR','Choose a real closed door adjacent to the southern rune in this room, not an empty opening.')
    assertComplexPath(input)
    const source=readCrushingSphereSource()
    data.complexTraps??={};data.complexTraps[input.trapId]={id:input.trapId,name:input.name,template:input.template,...location,fromCell:input.fromCell,toCell:input.toCell,
      triggerDoorId:input.triggerDoorId,geometryAdaptation:input.geometryAdaptation,status:'armed',activated:false,damageDice:4,creation,
      portals:{north:{cell:input.northRune,roomId:location.roomId,successes:0,examinedBy:[]},south:{cell:input.southRune,roomId:location.roomId,successes:0,examinedBy:[]}},pulses:{},source}
    return toolkitResult({success:true,trap:complexTrapSnapshot(input.trapId),notice:'Confidential preparation. This geometry adaptation is project-authored; source damage and DC remain fixed. Open the real trigger door and explicitly activate during combat; no pulse is automatic.'})
  }))
  server.registerTool('activate_complex_trap',{
    description:'Explicit MJ event: activate one armed crushing-sphere trap only after its actual linked door is open/broken, in an already started combat on the active map. Registers fixed hazard initiative entries after creatures tied at10/20; no player action, hidden trigger detection or immediate damage. Idempotent when already active; disabled traps never restart.',
    inputSchema:{trapId:ToolkitIdSchema},annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:true,openWorldHint:false},
  },async({trapId})=>toolkitTransaction(()=>activateComplexTrap(complexTrap(trapId))))
  server.registerTool('pulse_complex_trap',{
    description:'Resolve only the CURRENT actual hazard initiative turn, after all creatures tied at that count: initiativeCount10, and20 only while sphere damage is at least10d10. Supply ALL exact living engine targetIds currently in the corridor, without duplicates; incomplete/extra sets are refused, never completed by the server. Applies shared source bludgeoning damage with STR20 half-on-save/prone-on-failure and Bardic windows, then +2d10 after this pass. Round+initiative receipts prevent repeat damage or speed increases. Initiative20 precedes10 when due. After the explicit complete pulse, the same engine event advances to the next real turn. Ordinary next_turn cannot skip this hazard. No automatic MCP call or pulse on movement. Unsupported objects/blocked geometry/narrative NPCs refuse before any die; no silent impacts, fallback HP or damage cap.',
    inputSchema:{trapId:ToolkitIdSchema,initiativeCount:z.union([z.literal(10),z.literal(20)]),targetIds:z.array(z.string()).max(32)},
    annotations:{readOnlyHint:false,destructiveHint:true,idempotentHint:true,openWorldHint:false},
  },async({trapId,initiativeCount,targetIds})=>toolkitTransaction(()=>pulseComplexTrap(complexTrap(trapId),initiativeCount,targetIds)))
  server.registerTool('counter_complex_trap',{
    description:'Player action at touch range of an exact north/south portal: examine spends a distinct action learning its runes, with no check or sabotage; vandalize on a LATER action requires that examination and resolves real INT Arcana20. Each success removes2d10 (minimum zero damage); three successes on that same portal permanently neutralize the sphere. Failed checks still cost an action. Bardic/Cutting Words resume the same check after hydration. Destroying the south portal also physically blocks the linked tomb door; the north portal leaves it passable. No free counters, automatic Dispel Magic casting, invented item impact or resetting a portal.',
    inputSchema:{trapId:ToolkitIdSchema,portalId:z.enum(['north','south']),action:z.enum(['examine','vandalize'])},
  },async({trapId,portalId,action})=>toolkitTransaction(()=>counterComplexTrap(complexTrap(trapId),portalId,action)))
}
