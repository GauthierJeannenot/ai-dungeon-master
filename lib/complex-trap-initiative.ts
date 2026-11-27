import type { GameState } from './types'
import type { ComplexTrapRecord } from './complex-trap-state'

/** XGE Complex Traps: fixed initiative counts, after creatures with equal count.
 * These entries are hazard turns, never creatures, HP pools or action budgets. */
const prefix = '@complex-trap:'
export function complexTrapTurnId(trapId:string,count:10|20):string { return `${prefix}${encodeURIComponent(trapId)}:${count}` }
export function complexTrapSlot(state:GameState,id:string|null|undefined):{trap:ComplexTrapRecord;count:10|20}|undefined {
  if(!id?.startsWith(prefix))return
  for(const trap of Object.values(state.dmTools?.complexTraps??{}))for(const count of [20,10] as const)
    if(id===complexTrapTurnId(trap.id,count)&&trap.mapId===state.currentMapId&&trap.initiativeGeneration===(state.combatGeneration??0))return{trap,count}
}
export function complexTrapTurnDue(state:GameState,id=state.currentTurn):ReturnType<typeof complexTrapSlot>{
  const slot=complexTrapSlot(state,id)
  if(!state.initiativeOrder.some(actorId=>actorId==='player'?!state.player.deathSaves?.dead:Boolean(state.monsters[actorId]?.isAlive)))return
  if(!slot||state.phase!=='combat'||slot.trap.status!=='active'||slot.count===20&&slot.trap.damageDice<10)return
  if(slot.trap.pulses[`${state.combatGeneration??0}:${state.round}:${slot.count}`]?.status==='resolved')return
  return slot
}
export function complexTrapTurnIssue(state:GameState){
  const due=complexTrapTurnDue(state)
  return due?{code:'COMPLEX_TRAP_TURN_DUE',message:'Resolve the actual current hazard turn with pulse_complex_trap; no creature action or next_turn may skip it.',trapId:due.trap.id,initiativeCount:due.count}:undefined
}
export function enrollComplexTrapInitiative(state:GameState,trapId?:string):void {
  if(state.phase!=='combat')return
  for(const trap of Object.values(state.dmTools?.complexTraps??{})){
    if(trap.status!=='active'||trap.mapId!==state.currentMapId||trapId&&trap.id!==trapId)continue
    trap.initiativeGeneration=state.combatGeneration??0
    for(const count of [20,10] as const){const id=complexTrapTurnId(trap.id,count);if(!state.initiativeOrder.includes(id))state.initiativeOrder.push(id)}
  }
  const value=(id:string)=>complexTrapSlot(state,id)?.count??(id==='player'?state.player:state.monsters[id])?.initiative??-Infinity
  // Stable sorting preserves the encounter's already chosen creature tie order
  // and the explicit enrollment order of equal-count hazards.
  state.initiativeOrder.sort((a,b)=>value(b)-value(a)||Number(Boolean(complexTrapSlot(state,a)))-Number(Boolean(complexTrapSlot(state,b))))
}
export function inspectComplexTrapTurn(state:GameState){
  const due=complexTrapTurnDue(state)
  return due?{trapId:due.trap.id,initiativeCount:due.count,round:state.round,combatGeneration:state.combatGeneration??0,
    currentTurn:state.currentTurn,damageDice:due.trap.damageDice,explicitPulseRequired:true}:null
}
export function validateComplexTrapInitiative(state:GameState):string[]{
  const issues:string[]=[]
  for(const id of state.initiativeOrder)if(id.startsWith(prefix)&&!complexTrapSlot(state,id))issues.push('Unknown or stale complex-trap initiative entry.')
  if(state.phase!=='combat')return issues
  for(const trap of Object.values(state.dmTools?.complexTraps??{})){
    if(trap.initiativeGeneration!==(state.combatGeneration??0)||trap.mapId!==state.currentMapId)continue
    for(const count of [20,10] as const){
      const index=state.initiativeOrder.indexOf(complexTrapTurnId(trap.id,count))
      if(index<0){issues.push('Retain both fixed initiative entries of the enrolled trap.');continue}
      for(let i=0;i<state.initiativeOrder.length;i++){
        const id=state.initiativeOrder[i];if(complexTrapSlot(state,id))continue
        const actor=id==='player'?state.player:state.monsters[id];if(!actor)continue
        if((actor.initiative??0)>=count&&i>index||(actor.initiative??0)<count&&i<index)issues.push('A trap must act at its fixed count after creatures tied at that count.')
      }
    }
  }
  return issues
}
