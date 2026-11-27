import { entityVerticalContext } from '../lib/jumping-state'
import { complexTrapTurnId, complexTrapSlot, complexTrapTurnDue, enrollComplexTrapInitiative } from '../lib/complex-trap-initiative'
import { cackleBatchIssue } from '../lib/cackle-fever-state'
import type { AbilityCheckResult, SavingThrowResult } from '../lib/types'
import type { ComplexTrapRecord } from '../lib/complex-trap-state'
import { getAdventureMap } from '../lib/adventure-map'
import { navigationGrid, savedDoorState } from '../lib/navigation'
import { available } from './hero-rules'
import { rollDice } from './dice'
import { dealDamage } from './monster-rules'
import { checkedResolution, savedResolution, registerCheckedResolution } from './toolkit-checks'
import { toolkitError, toolkitResult, assertToolkitReach } from './toolkit'
import { engineGeometry } from './navigation'
import * as gs from './game-state'
import * as rules from './rules'
import { assertKnockoutDamageSupported } from './nonlethal'

export function complexTrap(id:string){const trap=gs.getState().dmTools?.complexTraps?.[id];if(!trap)toolkitError('COMPLEX_TRAP_NOT_FOUND','Choose an exact prepared complex trap ID.');return trap!}
export function complexTrapSnapshot(id:string){const {creation:_creation,...trap}=complexTrap(id);return trap}
export const inComplexArea=(trap:ComplexTrapRecord,cell:{x:number;y:number})=>cell.x>=trap.fromCell.x&&cell.x<=trap.toCell.x&&cell.y>=trap.fromCell.y&&cell.y<=trap.toCell.y
export function assertComplexPath(trap:Pick<ComplexTrapRecord,'fromCell'|'toCell'>){
  const grid=navigationGrid(gs.getState(),'player',engineGeometry()),from=trap.fromCell,to=trap.toCell
  const pit=Object.values(gs.getState().dmTools?.traps??{}).find(p=>p.template==='pit'&&p.mapId===gs.getState().currentMapId&&p.cell.x>=from.x&&p.cell.x<=to.x&&p.cell.y>=from.y&&p.cell.y<=to.y)
  if(pit)toolkitError('COMPLEX_TRAP_PIT_PATH_UNSUPPORTED','The actual sphere corridor contains a pit whose rolling-volume interaction is not represented. Qualify another real corridor before activation or initiative; no die, cost or hazard turn has committed.')
  for(let y=from.y;y<=to.y;y++)for(let x=from.x;x<=to.x;x++){
    const cell={x,y}
    if(!grid.free(cell,false))toolkitError('COMPLEX_TRAP_BLOCKER_UNSUPPORTED','The declared sphere corridor contains a blocked/uncertain cell or prepared obstacle; object impacts and stopping the sphere require dedicated support.')
    if(x>from.x&&!grid.step({x:x-1,y},cell,false,false)||y>from.y&&!grid.step({x,y:y-1},cell,false,false))
      toolkitError('COMPLEX_TRAP_BLOCKER_UNSUPPORTED','A wall or closed door blocks the declared sphere corridor; no impact is silently invented.')
  }
}
function trapOnMap(trap:ComplexTrapRecord){if(trap.mapId!==gs.getState().currentMapId)toolkitError('COMPLEX_TRAP_OTHER_MAP','Use a trap on the active map.')}
function log(data:Record<string,unknown>,summary:string){gs.addLogEntry({round:gs.getState().round,turn:'system',action:'Piège complexe',mechanicalDetail:summary});return toolkitResult({...data,mechanicalSummary:summary})}
export function activateComplexTrap(trap:ComplexTrapRecord){
  available();trapOnMap(trap)
  if(trap.status==='active'){assertComplexPath(trap);enrollComplexTrapInitiative(gs.getState(),trap.id);return toolkitResult({success:true,alreadyActive:true,trap:complexTrapSnapshot(trap.id)})}
  if(trap.status!=='armed')toolkitError('COMPLEX_TRAP_DISABLED','This complex trap has been permanently neutralized.')
  if(gs.getState().phase!=='combat')toolkitError('COMPLEX_TRAP_COMBAT_REQUIRED','Start the encounter explicitly before activating an initiative trap.')
  if(!['open','broken'].includes(savedDoorState(gs.getState(),trap.triggerDoorId)??''))toolkitError('COMPLEX_TRAP_TRIGGER_NOT_MET','Open the actual linked door using its own tool before activating this trap.')
  assertComplexPath(trap);trap.status='active';trap.activated=true;enrollComplexTrapInitiative(gs.getState(),trap.id)
  return log({success:true,trap:complexTrapSnapshot(trap.id)},'Sphère activée par la porte ouverte ; première impulsion à initiative 10, sans dégât immédiat ni action du joueur fabriquée.')
}
type PulseCommand={trapId:string;key:string;targetIds:string[];index:number;results:Record<string,unknown>[];damageRoll:ReturnType<typeof rollDice>}
function finishPulse(command:PulseCommand):ReturnType<typeof toolkitResult>{
  const trap=complexTrap(command.trapId)
  for(let index=command.index;index<command.targetIds.length;index++){
    const id=command.targetIds[index],target=gs.getEntity(id)
    if(!target||id==='player'&&gs.getPlayer().deathSaves?.dead||id!=='player'&&'isAlive'in target&&!target.isAlive)continue
    return savedResolution({entityId:id,ability:'str',dc:20},{domain:'complex-sphere-save',command:{...command,index}})
  }
  trap.pulses[command.key].status='resolved';trap.pulses[command.key].results=command.results;trap.damageDice+=2
  const nextTurn=gs.advanceTurn()
  return log({success:true,trapId:trap.id,pulseKey:command.key,damageRoll:command.damageRoll,results:command.results,nextDamageDice:trap.damageDice,
    nextInitiativeCounts:trap.damageDice>=10?[20,10]:[10],currentTurn:nextTurn},`Sphère résolue : ${command.results.length} sauvegarde(s), dégâts ${command.damageRoll.notation} ; accélération de 2d10 après ce passage.`)
}
export function pulseComplexTrap(trap:ComplexTrapRecord,initiativeCount:10|20,targetIds:string[]){
  available({allowComplexTrapEvent:true});trapOnMap(trap)
  const state=gs.getState(),key=`${state.combatGeneration??0}:${state.round}:${initiativeCount}`
  if(trap.pulses[key]?.status==='resolved')return toolkitResult({success:true,alreadyResolved:true,trapId:trap.id,pulseKey:key,results:trap.pulses[key].results})
  if(trap.status!=='active')toolkitError('COMPLEX_TRAP_NOT_ACTIVE','Explicitly activate the armed trap first; disabled traps cannot act.')
  if(state.phase!=='combat'||state.round<1)toolkitError('COMPLEX_TRAP_COMBAT_REQUIRED','A pulse requires an actual current combat round.')
  if(initiativeCount===20&&trap.damageDice<10)toolkitError('COMPLEX_TRAP_INITIATIVE_INVALID','Initiative 20 is unavailable until sphere damage is at least 10d10.')
  if(initiativeCount===20&&trap.pulses[`${state.combatGeneration??0}:${state.round}:10`])toolkitError('COMPLEX_TRAP_INITIATIVE_ORDER','Initiative 20 cannot follow initiative 10 in the same round.')
  if(initiativeCount===10&&trap.damageDice>=10&&!trap.pulses[`${state.combatGeneration??0}:${state.round}:20`])toolkitError('COMPLEX_TRAP_INITIATIVE_ORDER','Resolve the currently due initiative-20 pulse first.')
  if(state.currentTurn!==complexTrapTurnId(trap.id,initiativeCount)||!complexTrapTurnDue(state))toolkitError('COMPLEX_TRAP_NOT_CURRENT_INITIATIVE','Wait for this exact actual hazard turn, after all creatures tied at its fixed initiative count.')
  if(Object.keys(trap.pulses).length>=512)toolkitError('COMPLEX_TRAP_HISTORY_LIMIT','512 pulse checkpoints reached; no old receipt is discarded.')
  if(trap.damageDice>100)toolkitError('COMPLEX_TRAP_DAMAGE_UNSUPPORTED','The source continues accelerating beyond the engine limit of 100 dice; no silent damage cap is applied.')
  assertComplexPath(trap)
  const actual=gs.getAllEntities().filter(entity=>(entity.id==='player'?!state.player.deathSaves?.dead:'isAlive' in entity&&entity.isAlive)&&inComplexArea(trap,entity.position)).map(entity=>entity.id)
  if(targetIds.length!==new Set(targetIds).size||targetIds.length!==actual.length||actual.some(id=>!targetIds.includes(id)))toolkitError('COMPLEX_TRAP_TARGETS_INCOMPLETE','Explicitly select every actual living engine creature in the corridor, and no other target. Targets are never filled in.')
  for(const id of actual){const vertical=entityVerticalContext(state,id);if(!vertical.known||vertical.zFeet!==0||vertical.airborne)toolkitError('COMPLEX_TRAP_VERTICAL_GEOMETRY_UNSUPPORTED','Qualify the actual sphere path and body volume before a raised, flying or below-floor target can be resolved; no damage, die or turn has committed.')}
  const cackle=cackleBatchIssue(state,actual);if(cackle)toolkitError(cackle.code,cackle.message)
  for(const id of actual)assertKnockoutDamageSupported(gs.getEntity(id)!,1)
  if(Object.values(state.npcs??{}).some(npc=>gs.npcOnCurrentMap(npc)&&!state.monsters[npc.id]&&(npc.hp?.current??1)>0&&inComplexArea(trap,npc.position)))
    toolkitError('COMPLEX_TRAP_NPC_UNSUPPORTED','Narrative NPC injury is not implemented for this complex trap; use an actual statted combatant, never invented fallback HP.')
  const damageRoll=rollDice(trap.damageDice?`${trap.damageDice}d10`:'0')
  trap.pulses[key]={status:'pending',damageDice:trap.damageDice,results:[]}
  return finishPulse({trapId:trap.id,key,targetIds,index:0,results:[],damageRoll})
}
export function counterComplexTrap(trap:ComplexTrapRecord,portalId:'north'|'south',action:'examine'|'vandalize'){
  available();trapOnMap(trap);rules.validateActionUse('player')
  if(trap.status==='disabled')toolkitError('COMPLEX_TRAP_DISABLED','The portals have already been permanently disabled.')
  const portal=trap.portals[portalId]
  assertToolkitReach({mapId:trap.mapId,roomId:portal.roomId,cell:portal.cell})
  if(action==='examine'){
    if(portal.examinedBy.includes('player'))toolkitError('COMPLEX_TRAP_ALREADY_EXAMINED','This actor has already spent the examination action on this portal.')
    rules.recordAction('player');portal.examinedBy.push('player')
    return log({success:true,trapId:trap.id,portalId,examined:true},'Runes examinées : une action consommée. Le vandalisme exige une action ultérieure et un vrai test d’Arcanes DD 20.')
  }
  if(!portal.examinedBy.includes('player'))toolkitError('COMPLEX_TRAP_EXAMINATION_REQUIRED','Spend a distinct prior action examining this exact portal before vandalizing it.')
  return checkedResolution({entityId:'player',ability:'int',skill:'arcana',dc:20,label:'Saboter les runes du portail'},
    {domain:'complex-sphere-counter',command:{trapId:trap.id,portalId}})
}
export function registerComplexTrapResolutions(){
  registerCheckedResolution('complex-sphere-save',(raw,saved)=>{
    const command=raw as unknown as PulseCommand,save=saved as SavingThrowResult,id=command.targetIds[command.index]
    const amount=save.success?Math.floor(command.damageRoll.total/2):command.damageRoll.total,damage=dealDamage(id,amount,'bludgeoning')
    const prone=!save.success?gs.applyCondition(id,'prone'):{applied:false}
    command.results.push({targetId:id,save,damageResolution:damage,prone:prone.applied})
    command.index++;return finishPulse(command)
  })
  registerCheckedResolution('complex-sphere-counter',(raw,result)=>{
    const trap=complexTrap(String(raw.trapId)),portalId=raw.portalId as 'north'|'south',portal=trap.portals[portalId],check=result as AbilityCheckResult
    rules.recordAction('player')
    if(check.success){portal.successes++;trap.damageDice=Math.max(0,trap.damageDice-2);if(portal.successes>=3)trap.status='disabled'}
    return log({success:check.success,check,trapId:trap.id,portalId,successes:portal.successes,status:trap.status,damageDice:trap.damageDice,
      ...(trap.status==='disabled'&&trap.activated&&portalId==='south'?{southDoorBlocked:true,blockedDoorId:trap.triggerDoorId,geometrySupport:'The actual linked tomb door is physically blocked by the stopped sphere; navigation and door tools enforce the obstruction.'}:{})},
      `Runes : ${check.success?'réussite':'échec'} ; ${portal.successes}/3 succès sur ce portail, sphère ${trap.damageDice}d10, état ${trap.status}.`)
  })
}
