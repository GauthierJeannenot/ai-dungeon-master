import { complexTrapSlot } from './complex-trap-initiative'
import type { GameState } from './types'

export function combatParticipants(state: GameState) {
  const known = [...new Set(state.initiativeOrder)].filter(id => id === 'player' || Boolean(state.monsters[id]) || Boolean(complexTrapSlot(state,id)))
  const active = known.filter(id => id === 'player'
    ? !state.player.deathSaves?.dead
    : complexTrapSlot(state,id) ? complexTrapSlot(state,id)!.trap.status==='active'&&(complexTrapSlot(state,id)!.count===10||complexTrapSlot(state,id)!.trap.damageDice>=10)
    : state.monsters[id].isAlive && state.monsters[id].hp.current > 0)
  const defeated = known.filter(id => !complexTrapSlot(state,id) && !active.includes(id))
  const currentTurn = state.currentTurn && active.includes(state.currentTurn) ? state.currentTurn : null
  const hostileCount = active.filter(id => id !== 'player' && !complexTrapSlot(state,id) && state.monsters[id].hostile !== false).length
  const playerStatus = state.player.deathSaves?.dead ? 'Mort'
    : state.player.hp.current === 0 ? state.player.deathSaves?.stable ? 'Inconscient · stable' : 'À terre · jets de sauvegarde contre la mort'
    : state.player.conditions.includes('unconscious') ? 'Inconscient' : null
  return { active, defeated, currentTurn, hostileCount, playerStatus }
}
