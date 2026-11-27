import type { GameState } from './types'
import { getAdventureMap, inferRoomIdOnMap } from './adventure-map'

export function migrateMapLayout(input: GameState): GameState {
  const migrations = getAdventureMap(input.adventureId).layoutMigrations ?? []
  const applied = (input.sceneMemory?.layoutMigrations ?? []) as string[]
  const pending = migrations.filter(migration => !applied.includes(migration.id))
  if (!pending.length) return input
  const state = structuredClone(input)
  for (const migration of pending) {
    const { area, offset, fromMapId, toMapId } = migration
    const matches = (mapId: string | undefined, cell: { x: number; y: number }) => mapId === fromMapId
      && cell.x >= area.minX && cell.x <= area.maxX && cell.y >= area.minY && cell.y <= area.maxY
    const shift = (cell: { x: number; y: number }) => ({ x: cell.x + offset.x, y: cell.y + offset.y })
    const oldMapId = state.currentMapId
    if (matches(oldMapId, state.player.position)) {
      state.player.position = shift(state.player.position)
      state.currentMapId = toMapId
      state.currentRoomId = inferRoomIdOnMap(state.player.position, toMapId, state)
    }
    if (oldMapId === fromMapId) {
      const upper: typeof state.monsters = {}, lower: typeof state.monsters = {}
      for (const [id, monster] of Object.entries(state.monsters)) {
        if (matches(oldMapId, monster.position)) { monster.position = shift(monster.position); lower[id] = monster }
        else upper[id] = monster
      }
      state.sceneMemory ??= {}
      const floors = (state.sceneMemory.floorMonsters ?? {}) as Record<string, typeof state.monsters>
      state.sceneMemory.floorMonsters = { ...floors, [fromMapId]: upper, [toMapId]: lower }
      state.monsters = state.currentMapId === toMapId ? lower : upper
    }
    for (const npc of Object.values(state.npcs ?? {})) {
      if (!matches(npc.mapId, npc.position)) continue
      npc.position = shift(npc.position); npc.mapId = toMapId
      npc.roomId = inferRoomIdOnMap(npc.position, toMapId, state)
    }
    for (const drop of Object.values(state.droppedItems ?? {})) {
      if (!matches(drop.mapId, drop.position)) continue
      drop.position = shift(drop.position); drop.mapId = toMapId
      drop.roomId = inferRoomIdOnMap(drop.position, toMapId, state)
    }
    for (const effect of state.hero?.effects ?? []) {
      const cell = effect.data.cell as { x: number; y: number } | undefined
      if (cell && matches(effect.data.mapId as string, cell)) {
        effect.data.cell = shift(cell); effect.data.mapId = toMapId
      }
    }
    for (const fact of state.worldFacts ?? []) {
      const room = getAdventureMap(state).rooms.find(room => room.id === fact.roomId)
      if (fact.mapId === fromMapId && room?.mapId === toMapId) {
        fact.mapId = toMapId
        if (fact.narrativeEffect) fact.narrativeEffect.cell = shift(fact.narrativeEffect.cell)
        if (fact.waterEffect) fact.waterEffect.cell = shift(fact.waterEffect.cell)
      }
    }
    if (state.mapOutcomes?.[fromMapId]) state.mapOutcomes[toMapId] = structuredClone(state.mapOutcomes[fromMapId])
  }
  state.sceneMemory = { ...state.sceneMemory, layoutMigrations: [...applied, ...pending.map(m => m.id)] }
  return state
}
