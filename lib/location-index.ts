import { centerCellForAdventureRoom } from './adventure-map'
import { normalizeFrenchText } from './dm-intent'
import { aliasLooksLikeDestinationTarget, frenchLocationTokens } from './natural-language'
import type { GameState, WorldNpcState, WorldObjectState, WorldRoomState } from './types'

export type LocationDestinationType = 'room' | 'npc' | 'portal'
export type LocationResolutionStatus = 'resolved' | 'current' | 'ambiguous' | 'not_found'

export interface LocationDestination {
  id: string
  type: LocationDestinationType
  roomId: string
  name: string
  aliases: string[]
  known: boolean
  current: boolean
  adjacent: boolean
  visited: boolean
  sourceId?: string
  viaObjectId?: string
  viaObjectName?: string
}

export interface LocationResolution {
  status: LocationResolutionStatus
  reason: string
  target?: LocationDestination
  candidates: LocationDestination[]
  canonicalAction?: Record<string, unknown>
}

const ROOM_FALLBACK_ALIASES: Record<string, string[]> = {
  '1': ['dehors', 'exterieur', 'facade', 'chemin', 'route', 'arrivee'],
  '2': ['verger', 'pommiers', 'pommier', 'arbres', 'dryade', 'dryades', 'druidesse', 'fee', 'fees'],
  '3': ['dechets', 'tas de dechets', 'ordures', 'champignons', 'champignon'],
  '4': ['entree', 'hall', 'vestibule', 'interieur', 'boulangerie'],
  '5': ['bureau', 'paperasse', 'registres'],
  '7': ['quai', 'chargement', 'dock', 'quai de chargement', 'porte laterale'],
  '8': ['sol de la boulangerie', 'fours', 'four', 'reserve', 'reserves', 'cuisine'],
  '9': ['appartement', 'appartement de grammy', 'etage', 'haut', 'escaliers', 'escalier', 'grukk'],
}

function unique(values: string[]): string[] {
  return [...new Set(values.map(normalizeFrenchText).filter(Boolean))]
}

function aliasVariants(value: string): string[] {
  const alias = normalizeFrenchText(value)
  if (!alias) return []
  const variants = [alias]
  if (!alias.endsWith('s') && /^[a-z ]{3,}$/.test(alias)) variants.push(`${alias}s`)
  if (alias.endsWith('s') && alias.length > 4) variants.push(alias.slice(0, -1))
  return variants
}

function expandAliases(values: Array<string | undefined>): string[] {
  return unique(values.flatMap(value => value ? aliasVariants(value) : []))
}

function currentRoomExitIds(gameState: GameState): string[] {
  const roomId = gameState.currentRoomId
  if (!roomId || !gameState.world?.rooms?.[roomId]) return []
  return gameState.world.rooms[roomId].exits?.filter(exitId => exitId !== roomId) ?? []
}

function roomAliases(roomId: string, room: WorldRoomState): string[] {
  return expandAliases([
    `salle ${roomId}`,
    room.name,
    ...(room.aliases ?? []),
    ...(room.tags ?? []),
    ...(ROOM_FALLBACK_ALIASES[roomId] ?? []),
  ])
}

function npcAliases(npc: WorldNpcState): string[] {
  return expandAliases([
    npc.name,
    ...(npc.aliases ?? []),
    ...(npc.tags ?? []),
    ...(npc.id === 'dryad_orchard'
      ? ['dryades', 'soeur de mac', 'soeur du pommier', 'sa soeur', 'ta soeur', 'demoiselles', 'creatures raffinees']
      : []),
  ])
}

function portalAliases(object: WorldObjectState): string[] {
  return expandAliases([object.name, ...(object.aliases ?? []), ...(object.tags ?? [])])
}

function destinationBase(
  gameState: GameState,
  roomId: string
): Pick<LocationDestination, 'known' | 'current' | 'adjacent' | 'visited'> {
  const exits = currentRoomExitIds(gameState)
  const roomsVisited = gameState.roomsVisited ?? []
  return {
    known: roomsVisited.includes(roomId),
    current: gameState.currentRoomId === roomId,
    adjacent: exits.includes(roomId),
    visited: roomsVisited.includes(roomId),
  }
}

export function buildLocationIndex(gameState: GameState): LocationDestination[] {
  const world = gameState.world
  if (!world) return []
  const rooms = world.rooms ?? {}
  const objects = world.objects ?? {}
  const npcs = world.npcs ?? {}

  const destinations = new Map<string, LocationDestination>()
  const upsert = (destination: LocationDestination) => {
    const previous = destinations.get(destination.id)
    if (!previous) {
      destinations.set(destination.id, destination)
      return
    }
    destinations.set(destination.id, {
      ...previous,
      aliases: unique([...previous.aliases, ...destination.aliases]),
      known: previous.known || destination.known,
      current: previous.current || destination.current,
      adjacent: previous.adjacent || destination.adjacent,
      visited: previous.visited || destination.visited,
      viaObjectId: previous.viaObjectId ?? destination.viaObjectId,
      viaObjectName: previous.viaObjectName ?? destination.viaObjectName,
    })
  }

  for (const [roomId, room] of Object.entries(rooms)) {
    upsert({
      id: `room:${roomId}`,
      type: 'room',
      roomId,
      name: room.name,
      aliases: roomAliases(roomId, room),
      ...destinationBase(gameState, roomId),
    })
  }

  for (const object of Object.values(objects)) {
    if (!object.portal?.roomIds?.length) continue
    if (!object.visible && !object.discovered) continue
    if (!gameState.currentRoomId || !object.portal.roomIds.includes(gameState.currentRoomId)) continue
    for (const roomId of object.portal.roomIds.filter(id => id !== gameState.currentRoomId)) {
      const room = rooms[roomId]
      if (!room) continue
      upsert({
        id: `room:${roomId}`,
        type: 'room',
        roomId,
        name: room.name,
        aliases: unique([...roomAliases(roomId, room), ...portalAliases(object)]),
        ...destinationBase(gameState, roomId),
        viaObjectId: object.id,
        viaObjectName: object.name,
      })
    }
  }

  for (const npc of Object.values(npcs)) {
    const room = rooms[npc.roomId]
    if (!room) continue
    const base = destinationBase(gameState, npc.roomId)
    upsert({
      id: `npc:${npc.id}`,
      type: 'npc',
      roomId: npc.roomId,
      name: npc.name,
      aliases: npcAliases(npc),
      ...base,
      known: Boolean(npc.known) || base.known || base.current || base.adjacent,
      sourceId: npc.id,
    })
  }

  return [...destinations.values()].sort((a, b) => a.name.localeCompare(b.name, 'fr'))
}

function destinationScore(destination: LocationDestination, normalizedText: string, textTokens: string[]): number {
  let best = 0
  for (const alias of destination.aliases) {
    if (alias.length < 3 || /^\d+$/.test(alias)) continue
    const aliasTokens = frenchLocationTokens(alias)
    if (aliasTokens.length === 0) continue
    if (normalizedText === alias) best = Math.max(best, 140 + alias.length)
    else if (aliasLooksLikeDestinationTarget(normalizedText, alias)) best = Math.max(best, 160 + alias.length)
    else if (normalizedText.includes(alias)) best = Math.max(best, 100 + alias.length)
    else if (aliasTokens.every(token => textTokens.includes(token))) best = Math.max(best, 70 + aliasTokens.join('').length)
    else if (aliasTokens.some(token => textTokens.includes(token))) best = Math.max(best, 25 + aliasTokens.join('').length)
  }
  if (best === 0) return 0
  if (destination.current) best += 12
  if (destination.adjacent) best += 10
  if (destination.known) best += 6
  if (destination.type === 'npc') best += 4
  return best
}

function moveActionForRoom(roomId: string): Record<string, unknown> | undefined {
  const toCell = centerCellForAdventureRoom(roomId)
  return toCell ? { kind: 'move', tokenId: 'player', toCell } : undefined
}

export function resolveLocationDestination(message: string, gameState: GameState): LocationResolution {
  const normalizedText = normalizeFrenchText(message)
  const textTokens = frenchLocationTokens(normalizedText)
  const scored = buildLocationIndex(gameState)
    .map(destination => ({ destination, score: destinationScore(destination, normalizedText, textTokens) }))
    .filter(candidate => candidate.score > 0)
    .sort((a, b) => b.score - a.score)

  if (scored.length === 0) {
    return {
      status: 'not_found',
      reason: 'No location alias matched the player text.',
      candidates: [],
    }
  }

  const topScore = scored[0].score
  const topCandidates = scored
    .filter(candidate => candidate.score >= topScore - 3)
    .map(candidate => candidate.destination)
  const roomIds = [...new Set(topCandidates.map(candidate => candidate.roomId))]
  if (roomIds.length > 1) {
    return {
      status: 'ambiguous',
      reason: 'Several location aliases matched different rooms.',
      candidates: topCandidates,
    }
  }

  const target = topCandidates.find(candidate => candidate.type === 'npc') ?? topCandidates[0]
  if (target.current) {
    return {
      status: 'current',
      reason: 'The requested destination is already the current room.',
      target,
      candidates: topCandidates,
    }
  }

  return {
    status: 'resolved',
    reason: 'A unique location target was resolved from world state aliases.',
    target,
    candidates: topCandidates,
    canonicalAction: moveActionForRoom(target.roomId),
  }
}

export function summarizeLocationResolution(resolution: LocationResolution): Record<string, unknown> {
  return {
    status: resolution.status,
    reason: resolution.reason,
    target: resolution.target ? summarizeDestination(resolution.target) : null,
    candidates: resolution.candidates.map(summarizeDestination),
    canonicalAction: resolution.canonicalAction ?? null,
  }
}

function summarizeDestination(destination: LocationDestination): Record<string, unknown> {
  return {
    id: destination.id,
    type: destination.type,
    roomId: destination.roomId,
    name: destination.name,
    known: destination.known,
    current: destination.current,
    adjacent: destination.adjacent,
    visited: destination.visited,
    viaObjectId: destination.viaObjectId,
    viaObjectName: destination.viaObjectName,
  }
}
