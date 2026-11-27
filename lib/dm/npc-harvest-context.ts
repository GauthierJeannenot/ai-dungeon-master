import type { GameState } from '../types'
import { inferRoomIdOnMap } from '../adventure-map'

/** Confidential current-room receipts; never a remote actor or historical ruling. */
export function localNpcHarvestContext(state: GameState): string {
  const npcs = Object.values(state.npcs ?? {}).filter(npc =>
    (!npc.mapId || npc.mapId === state.currentMapId) && npc.roomId === state.currentRoomId
    && (npc.npcLife?.legacyObservation || npc.hp?.current === 0 && npc.isAlive === undefined))
    .map(npc => ({ entityId: npc.id, hp: npc.hp, isAlive: npc.isAlive,
      ...(npc.npcLife?.legacyObservation ? {
        observedState: npc.npcLife.legacyObservation.input.observedState,
        observationEventId: npc.npcLife.legacyObservation.input.eventId,
        observedAt: npc.npcLife.legacyObservation.at,
        unknownHistory: npc.npcLife.legacyObservation.unknownHistory,
        resolution: npc.npcLife.legacyObservation.resolution,
        recovery: npc.npcLife.episode?.recovery,
      } : { lifeHistory: 'unknown; no living/dead fact inferred' }) }))
  const harvest = state.dmTools?.poisonHarvest
  const attempts = Object.values(harvest?.attempts ?? {})
    .filter(attempt => attempt.mapId === state.currentMapId && attempt.roomId === state.currentRoomId)
    .map(attempt => ({ attemptId: attempt.id, sourceId: attempt.input.sourceId,
      observationEventId: attempt.observation.eventId, status: attempt.status,
      requiredSeconds: attempt.requiredSeconds, workedSeconds: attempt.workedSeconds,
      containerItemId: attempt.input.containerItemId, doseItemId: attempt.input.doseItemId }))
  const sources = Object.values(harvest?.sources ?? {}).filter(source => {
    if (source.physicalFact.mapId !== state.currentMapId) return false
    const body = state.monsters[source.input.sourceId] ?? state.npcs?.[source.input.sourceId]
    return body && (!('mapId' in body) || !body.mapId || body.mapId === state.currentMapId)
      && inferRoomIdOnMap(body.position, state.currentMapId, state) === state.currentRoomId
  }).map(source => ({ sourceId: source.input.sourceId, observationEventId: source.input.eventId,
    templateId: source.input.templateId, remaining: source.remaining, upperBound: source.upperBound,
    activeAttemptId: source.activeAttemptId }))
  if (!npcs.length && !attempts.length && !sources.length) return ''
  return `---\n## OBSERVATIONS ACTUELLES ET EXTRACTIONS LOCALES (MJ)\n${JSON.stringify({ npcs, sources, attempts })}\nLes inconnues restent inconnues ; choisis explicitement les outils, événements et actes réels. Aucun soin, stabilité, dé, travail ou dose n'est accordé par ce contexte.\n\n`
}
