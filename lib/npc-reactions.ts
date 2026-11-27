import { activeNpcPartyRegistration } from './npc-party-state'
import type { GameState } from './types'
import { getAdventureMap, firstMapId,type AdventureNpcSpec } from './adventure-map'
import { adjacentRoomConnections } from './scene-perception'

export function npcActionPolicy(state:GameState,id:string):NonNullable<AdventureNpcSpec['reactive']>|undefined {
  const npc=state.npcs?.[id],party=activeNpcPartyRegistration(state,id)
  if(party&&npc?.isAlive&&npc.visible&&npc.disposition==='helpful'&&npc.hostile===false)return {
    objectives:['Respect the actual declared voluntary party role; the MJ explicitly chooses every activation.'],
    capabilities:party.input.role==='ally'?['move','open_door','attack']:['move','open_door'],
    speed:npc.speed??0,triggers:['turn_start'],
  }
  return getAdventureMap(state).npcs.find(n=>n.id===id)?.reactive
}
// Opportunities are facts from resolved state, never a choice of action or target.
export function reactionOpportunities(state: GameState) {
  const mapId = state.currentMapId ?? firstMapId(state)
  const localRooms = new Set([state.currentRoomId, ...adjacentRoomConnections(state).map(connection => connection.room.id)])
  const ids=[...new Set([...getAdventureMap(state).npcs.map(n=>n.id),...Object.keys(state.npcs??{}).filter(id=>activeNpcPartyRegistration(state,id))])]
  return ids.flatMap(id => {
    const spec={id}
    const npc = state.npcs?.[spec.id], policy = npcActionPolicy(state,spec.id), combatant = state.monsters[spec.id]
    if (!npc || !policy || (npc.mapId ?? firstMapId(state)) !== mapId) return []
    if (state.phase !== 'combat' && !localRooms.has(npc.roomId)) return []
    if (combatant && (!combatant.isAlive || combatant.controller !== 'reactive_npc')) return []
    const trigger = state.phase === 'combat'
      ? state.currentTurn === spec.id && policy.triggers.includes('turn_start') ? 'turn_start' : null
      : (state.playerActionRevision ?? 0) > 0 && policy.triggers.includes('after_player_action') ? 'after_player_action' : null
    if (!trigger) return []
    const key = trigger === 'turn_start' ? `${mapId}:turn:${state.combatGeneration ?? 0}:${state.round}:${spec.id}`
      : `${mapId}:action:${state.playerActionRevision}:${spec.id}`
    if (state.npcActivationLedger?.includes(key)) return []
    return [{ npcId: spec.id, activationKey: key, trigger, objectives: policy.objectives, capabilities: policy.capabilities,
      position: combatant?.position ?? npc.position, roomId: npc.roomId,
      offscreen: npc.roomId !== state.currentRoomId,
      perceptionNote: 'Adjacency is not awareness. Decide only from perceptible resolved events, doors and authored objectives; otherwise wait. Offscreen decisions remain confidential.' }]
  })
}
