import { getAdventureMap, getMapSpec, inferRoomIdOnMap } from '../lib/adventure-map'
import { completedRoundEvents, type RoundEventResult } from '../lib/combat-round-events'
import { getMonsterRecord } from '../lib/srd/monsters'
import { isStatBackedNpc, reconcileNpcGroup } from '../lib/npc-stat-blocks'
import { rollDice } from './dice'
import { adjustedDamage, conditionImmune, dealDamage } from './monster-rules'
import * as gs from './game-state'

// These are authored consequences of advancing a combat round, never inferred
// actions or fabricated MCP calls. Targets come only from the resolved board.
export function resolveRoundEvents(): RoundEventResult[] {
  const state = gs.getState(), map = getMapSpec(state.currentMapId, state)
  if (state.phase !== 'combat') return []
  const resolved: RoundEventResult[] = []
  for (const event of map.roundEvents ?? []) {
    if (state.round <= event.afterRound || completedRoundEvents(state)[event.id]) continue
    const entities = gs.getAllEntities().filter(entity => entity.id === 'player'
      ? !state.player.deathSaves?.dead : 'isAlive' in entity && entity.isAlive)
    if (!entities.some(entity => inferRoomIdOnMap(entity.position, map.id, state) === event.roomId)) continue
    const onPath = (position: { x: number; y: number }) => event.path.some(cell => cell.x === position.x && cell.y === position.y)
    const victims: RoundEventResult['victims'] = []
    for (const entity of entities.filter(entity => onPath(entity.position))) {
      const roll = rollDice(event.damageDice)
      const damage = dealDamage(entity.id, roll.total, 'bludgeoning')
      const condition = gs.applyCondition(entity.id, 'prone')
      victims.push({ entityId: entity.id, name: entity.name, damageRoll: roll.detail, rawDamage: roll.total,
        damageDealt: damage.damageDealt, hpBefore: damage.hpBefore, hpAfter: damage.hpAfter, prone: condition.applied })
    }
    // Narrative NPCs keep their tokens/disposition and receive injuries from
    // their authored SRD block, without spawning a combatant or initiative.
    for (const npc of Object.values(state.npcs ?? {}).filter(npc => gs.npcOnCurrentMap(npc)
      && !gs.getEntity(npc.id) && (npc.hp?.current ?? 1) > 0 && onPath(npc.position))) {
      const spec = getAdventureMap(state).npcs.find(spec => spec.id === npc.id)
      const record = getMonsterRecord(spec?.statBlock ?? spec?.reactive?.combatTemplate ?? npc.kind)
      if (!record) continue // No invented statistics for an unconfigured actor.
      const creature = { ...structuredClone(record.engine), id: npc.id, name: npc.name, position: npc.position,
        hp: npc.hp ?? structuredClone(record.engine.hp), conditions: [...npc.conditions ?? []], isAlive: true }
      const roll = rollDice(event.damageDice), damage = adjustedDamage(creature, roll.total, 'bludgeoning')
      const hpBefore = creature.hp.current
      npc.hp = { ...creature.hp, current: Math.max(0, hpBefore - damage.damage) }
      if (isStatBackedNpc(npc)) {
        reconcileNpcGroup(npc)
        npc.isAlive = npc.hp.current > 0
      }
      npc.conditions = [...creature.conditions]
      const prone = !conditionImmune(creature, 'prone')
      if (prone && !npc.conditions.includes('prone')) npc.conditions.push('prone')
      if (npc.hp.current === 0 && npc.isAlive !== false && !npc.conditions.includes('unconscious')) npc.conditions.push('unconscious')
      victims.push({ entityId: npc.id, name: npc.name, damageRoll: roll.detail, rawDamage: roll.total,
        damageDealt: damage.damage, hpBefore, hpAfter: npc.hp.current, prone })
    }
    const doorStates = { ...(state.sceneMemory?.doorStates ?? {}) as Record<string, string> }
    for (const id of event.opensDoors ?? []) if (doorStates[id] !== 'broken') doorStates[id] = 'open'
    const result: RoundEventResult = { eventId: event.id, name: event.name, mapId: map.id,
      round: state.round, path: structuredClone(event.path), victims,
      mechanicalSummary: `${event.name} : trajet ${event.path.map(c => `(${c.x},${c.y})`).join(' → ')}. ${victims.length
        ? victims.map(v => `${v.name} : ${v.damageRoll}, ${v.damageDealt} dégâts contondants, PV ${v.hpBefore} → ${v.hpAfter}${v.prone ? ', à terre' : ', immunisé à la chute'}`).join(' ; ')
        : 'Personne sur le trajet : aucun dégât ni chute.'} L’animal a quitté la scène ; sa stalle est libre.` }
    state.sceneMemory = { ...state.sceneMemory, doorStates, roundEvents: { ...completedRoundEvents(state), [event.id]: result } }
    gs.addLogEntry({ round: state.round, turn: 'system', action: event.name, mechanicalDetail: result.mechanicalSummary })
    resolved.push(result)
  }
  return resolved
}
