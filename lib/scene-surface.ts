import type {
  CanonicalPlayerActionKind,
  GameState,
  Item,
  PlayerAffordance,
  WorldNpcState,
  WorldObjectState,
  WorldRoomState,
  WorldState,
} from './types'
import { normalizeFrenchText } from './dm-intent'
import {
  canCombineRecipe,
  isRecipeAlreadyCombined,
  isWorldObjectDisarmable,
  isWorldObjectOpenable,
  isWorldObjectReadable,
  isWorldObjectTakeable,
  isWorldObjectUsable,
  ownedRecipeHalfIds,
} from './world-action-effects'

export interface SceneSurfaceObject {
  id: string
  name: string
  aliases: string[]
  kind: WorldObjectState['kind']
  roomId: string
  surfaceRoomIds: string[]
  visible: boolean
  discovered: boolean
  opened?: boolean
  locked?: boolean
  taken?: boolean
  used?: boolean
  disarmed?: boolean
  tags: string[]
  description?: string
  readable: boolean
  distance: 'current' | 'boundary' | 'inventory'
  actionKinds: CanonicalPlayerActionKind[]
  portal?: {
    roomIds: string[]
    otherRoomIds: string[]
    traversable: boolean
  }
}

export interface SceneSurfaceNpc {
  id: string
  name: string
  aliases: string[]
  roomId: string
  disposition: WorldNpcState['disposition']
  known: boolean
  faction?: string
  goals: string[]
  tags: string[]
}

export interface SceneSurfaceExit {
  roomId: string
  name: string
  viaObjectId?: string
  viaObjectName?: string
  opened?: boolean
  locked?: boolean
  reason: string
}

export interface SceneSurfaceInventoryItem {
  id: string
  name: string
  type: Item['type']
  relevant: boolean
}

export interface SceneSurfaceTarget {
  id: string
  type: 'object' | 'npc' | 'inventory'
  name: string
  aliases: string[]
  kinds: CanonicalPlayerActionKind[]
}

export interface SceneSurface {
  currentRoomId: string | null
  currentRoom?: WorldRoomState
  exits: SceneSurfaceExit[]
  nearbyRooms: Array<{ id: string; name: string }>
  objects: SceneSurfaceObject[]
  npcs: SceneSurfaceNpc[]
  hazards: SceneSurfaceObject[]
  inventory: SceneSurfaceInventoryItem[]
  targets: SceneSurfaceTarget[]
  affordances: PlayerAffordance[]
  narratableFacts: string[]
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)]
}

function affordance(fields: PlayerAffordance): PlayerAffordance {
  return fields
}

export function objectSurfaceRoomIds(object: Pick<WorldObjectState, 'roomId' | 'portal'>): string[] {
  return unique([object.roomId, ...(object.portal?.roomIds ?? [])].filter(Boolean))
}

export function objectIsOnSceneSurface(object: WorldObjectState, currentRoomId: string | null | undefined): boolean {
  if (!currentRoomId || object.taken) return false
  if (!object.visible && !object.discovered) return false
  return objectSurfaceRoomIds(object).includes(currentRoomId)
}

function portalOtherRoomIds(object: WorldObjectState, currentRoomId: string | null | undefined): string[] {
  if (!currentRoomId || !object.portal?.roomIds?.includes(currentRoomId)) return []
  return object.portal.roomIds.filter(roomId => roomId !== currentRoomId)
}

function objectActionKinds(object: WorldObjectState): CanonicalPlayerActionKind[] {
  const kinds: CanonicalPlayerActionKind[] = ['examine']
  if (isWorldObjectReadable(object)) kinds.push('read')
  if (isWorldObjectOpenable(object) && object.opened !== true) {
    kinds.push('open')
    if (object.locked) kinds.push('unlock')
    if (object.locked || object.kind === 'door' || object.kind === 'container') kinds.push('force')
  }
  if (isWorldObjectTakeable(object)) kinds.push('take')
  if (isWorldObjectUsable(object)) kinds.push('use_object')
  if (isWorldObjectDisarmable(object)) kinds.push('disarm')
  return unique(kinds)
}

function toSceneObject(object: WorldObjectState, currentRoomId: string | null): SceneSurfaceObject {
  const surfaceRoomIds = objectSurfaceRoomIds(object)
  const otherRoomIds = portalOtherRoomIds(object, currentRoomId)
  const distance = object.roomId === currentRoomId ? 'current' : 'boundary'
  return {
    id: object.id,
    name: object.name,
    aliases: object.aliases ?? [],
    kind: object.kind,
    roomId: object.roomId,
    surfaceRoomIds,
    visible: object.visible,
    discovered: object.discovered,
    opened: object.opened,
    locked: object.locked,
    taken: object.taken,
    used: object.used,
    disarmed: object.disarmed,
    tags: object.tags ?? [],
    description: object.description,
    readable: isWorldObjectReadable(object),
    distance,
    actionKinds: objectActionKinds(object),
    ...(object.portal
      ? {
          portal: {
            roomIds: object.portal.roomIds,
            otherRoomIds,
            traversable: object.opened === true || object.locked !== true,
          },
        }
      : {}),
  }
}

function currentRoomHiddenObjects(world: WorldState | undefined, currentRoomId: string | null): WorldObjectState[] {
  if (!world || !currentRoomId) return []
  const containedBehindClosedObjects = new Set(
    Object.values(world.objects)
      .filter(object => object.contains?.length && isWorldObjectOpenable(object) && object.opened !== true)
      .flatMap(object => object.contains ?? [])
  )
  return Object.values(world.objects).filter(object =>
    object.roomId === currentRoomId &&
    !object.taken &&
    !containedBehindClosedObjects.has(object.id) &&
    (!object.visible || !object.discovered)
  )
}

function readableInventoryObjects(gameState: GameState, surfaceObjects: SceneSurfaceObject[]): WorldObjectState[] {
  const world = gameState.world
  if (!world) return []
  const inventoryIds = new Set(gameState.player.inventory.map(item => item.id))
  const visibleIds = new Set(surfaceObjects.map(object => object.id))
  return Object.values(world.objects).filter(object =>
    inventoryIds.has(object.id) &&
    isWorldObjectReadable(object) &&
    !visibleIds.has(object.id)
  )
}

function deriveSceneSurfaceAffordances(
  surfaceBase: Omit<SceneSurface, 'affordances' | 'targets' | 'narratableFacts'>,
  gameState: GameState
): PlayerAffordance[] {
  const affordances: PlayerAffordance[] = []
  const world = gameState.world
  const hiddenObjects = currentRoomHiddenObjects(world, surfaceBase.currentRoomId)
  const readableInventory = readableInventoryObjects(gameState, surfaceBase.objects)

  affordances.push(affordance({
    id: 'world-examine-current-room',
    kind: 'examine',
    label: 'Examiner sans muter',
    enabled: true,
    reason: 'Examiner produit un event moteur sans inventer de decouverte cachee.',
    toolName: 'resolve_player_action',
  }))

  affordances.push(affordance({
    id: 'world-search-current-room',
    kind: 'search',
    label: 'Fouiller la zone',
    enabled: true,
    reason: hiddenObjects.length > 0
      ? 'Des elements non reveles peuvent etre recherches par le moteur.'
      : 'Une fouille peut confirmer qu aucun element cache connu du moteur n est trouve.',
    toolName: 'resolve_player_action',
  }))

  for (const object of surfaceBase.objects) {
    if (object.readable) {
      affordances.push(affordance({
        id: `world-read-${object.id}`,
        kind: 'read',
        label: `Lire ${object.name}`,
        enabled: true,
        reason: 'Indice lisible visible ou deja revele.',
        toolName: 'resolve_player_action',
      }))
    }

    if (object.actionKinds.includes('open')) {
      affordances.push(affordance({
        id: `world-open-${object.id}`,
        kind: 'open',
        label: `Ouvrir ${object.name}`,
        enabled: !object.locked,
        reason: object.locked
          ? 'Objet verrouille: utiliser unlock ou force.'
          : object.portal
            ? 'Portail visible depuis la scene courante et pas encore ouvert.'
            : 'Objet visible et pas encore ouvert.',
        toolName: 'resolve_player_action',
      }))
    }

    if (object.actionKinds.includes('unlock')) {
      affordances.push(affordance({
        id: `world-unlock-${object.id}`,
        kind: 'unlock',
        label: `Crocheter ${object.name}`,
        enabled: true,
        reason: 'Objet verrouille et visible; un test moteur peut l ouvrir.',
        toolName: 'resolve_player_action',
      }))
    }

    if (object.actionKinds.includes('force')) {
      affordances.push(affordance({
        id: `world-force-${object.id}`,
        kind: 'force',
        label: `Forcer ${object.name}`,
        enabled: true,
        reason: object.locked
          ? 'Objet verrouille et visible; le forcer peut ouvrir mais augmente le risque d alarme.'
          : 'Objet visible; le forcer est possible mais bruyant et risqué.',
        toolName: 'resolve_player_action',
      }))
    }

    if (object.actionKinds.includes('take')) {
      affordances.push(affordance({
        id: `world-take-${object.id}`,
        kind: 'take',
        label: `Prendre ${object.name}`,
        enabled: true,
        reason: 'Objet decouvert, visible, et pas encore pris.',
        toolName: 'resolve_player_action',
      }))
    }

    if (object.actionKinds.includes('use_object')) {
      affordances.push(affordance({
        id: `world-use-${object.id}`,
        kind: 'use_object',
        label: `Utiliser ${object.name}`,
        enabled: true,
        reason: 'Objet de salle visible avec une interaction moteur explicite.',
        toolName: 'resolve_player_action',
      }))
    }

    if (object.actionKinds.includes('disarm')) {
      affordances.push(affordance({
        id: `world-disarm-${object.id}`,
        kind: 'disarm',
        label: `Desamorcer ${object.name}`,
        enabled: true,
        reason: 'Piege visible et pas encore desamorce.',
        toolName: 'resolve_player_action',
      }))
    }
  }

  for (const object of readableInventory) {
    affordances.push(affordance({
      id: `world-read-${object.id}`,
      kind: 'read',
      label: `Lire ${object.name}`,
      enabled: true,
      reason: 'Indice lisible visible ou deja revele.',
      toolName: 'resolve_player_action',
    }))
  }

  for (const npc of surfaceBase.npcs.filter(npc => npc.known)) {
    affordances.push(
      affordance({
        id: `world-talk-${npc.id}`,
        kind: 'talk',
        label: `Parler avec ${npc.name}`,
        enabled: true,
        reason: `PNJ present; disposition actuelle: ${npc.disposition}.`,
        toolName: 'resolve_player_action',
      }),
      affordance({
        id: `world-ask-${npc.id}`,
        kind: 'ask',
        label: `Questionner ${npc.name}`,
        enabled: true,
        reason: 'Demander une information produit un event social explicite.',
        toolName: 'resolve_player_action',
      }),
      affordance({
        id: `world-persuade-${npc.id}`,
        kind: 'persuade',
        label: `Convaincre ${npc.name}`,
        enabled: npc.disposition !== 'helpful',
        reason: npc.disposition === 'helpful'
          ? 'Le PNJ est deja utile; demander une information suffit.'
          : 'Changer une disposition doit passer par un check moteur.',
        toolName: 'resolve_player_action',
      }),
      affordance({
        id: `world-threaten-${npc.id}`,
        kind: 'threaten',
        label: `Menacer ${npc.name}`,
        enabled: npc.disposition !== 'helpful',
        reason: npc.disposition === 'helpful'
          ? 'Menacer un allie utile serait incoherent sans intention plus claire.'
          : 'Une menace doit produire un check social et un event de disposition/alerte.',
        toolName: 'resolve_player_action',
      }),
      affordance({
        id: `world-show-item-${npc.id}`,
        kind: 'show_item',
        label: `Montrer un objet a ${npc.name}`,
        enabled: gameState.player.inventory.length > 0,
        reason: gameState.player.inventory.length > 0
          ? 'Un objet d inventaire peut etre montre sans quitter l inventaire.'
          : 'Aucun objet en inventaire a montrer.',
        toolName: 'resolve_player_action',
      }),
      affordance({
        id: `world-give-item-${npc.id}`,
        kind: 'give_item',
        label: `Donner un objet a ${npc.name}`,
        enabled: gameState.player.inventory.length > 0,
        reason: gameState.player.inventory.length > 0
          ? 'Donner un objet mute l inventaire et la relation.'
          : 'Aucun objet en inventaire a donner.',
        toolName: 'resolve_player_action',
      })
    )
  }

  const recipeQuest = world?.quests.grammy_recipe
  const recipeAlreadyCombined = isRecipeAlreadyCombined(world)
  const hasRecipeHalves = canCombineRecipe(world, gameState.player) ||
    ownedRecipeHalfIds(world, gameState.player).length >= (recipeQuest?.goal ?? 2)
  affordances.push(affordance({
    id: 'world-combine-recipe',
    kind: 'combine_recipe',
    label: 'Assembler la recette',
    enabled: Boolean(recipeQuest && !recipeAlreadyCombined && hasRecipeHalves),
    reason: recipeAlreadyCombined
      ? 'La recette est deja assemblee.'
      : hasRecipeHalves
        ? 'Les deux fragments sont acquis par le moteur.'
        : 'Il manque encore un fragment de recette.',
    toolName: 'resolve_player_action',
  }))

  return affordances
}

function buildTargets(
  objects: SceneSurfaceObject[],
  npcs: SceneSurfaceNpc[],
  inventory: SceneSurfaceInventoryItem[]
): SceneSurfaceTarget[] {
  return [
    ...objects.map(object => ({
      id: object.id,
      type: 'object' as const,
      name: object.name,
      aliases: object.aliases,
      kinds: object.actionKinds,
    })),
    ...npcs.filter(npc => npc.known).map(npc => ({
      id: npc.id,
      type: 'npc' as const,
      name: npc.name,
      aliases: npc.aliases,
      kinds: ['talk', 'ask', 'persuade', 'threaten', 'show_item', 'give_item'] as CanonicalPlayerActionKind[],
    })),
    ...inventory.map(item => ({
      id: item.id,
      type: 'inventory' as const,
      name: item.name,
      aliases: [item.type],
      kinds: ['use_item', 'show_item', 'give_item'] as CanonicalPlayerActionKind[],
    })),
  ]
}

function narratableFactsForSurface(surfaceBase: Omit<SceneSurface, 'affordances' | 'targets' | 'narratableFacts'>): string[] {
  return [
    `currentRoom=${surfaceBase.currentRoomId ?? 'unknown'}:${surfaceBase.currentRoom?.name ?? 'unknown'}`,
    ...surfaceBase.exits.map(exit => `exit=${exit.roomId}:${exit.name}${exit.viaObjectId ? ` via ${exit.viaObjectName}` : ''}`),
    ...surfaceBase.objects.map(object =>
      `object=${object.id}:${object.name}:kind=${object.kind}:opened=${Boolean(object.opened)}:locked=${Boolean(object.locked)}:distance=${object.distance}`
    ),
    ...surfaceBase.npcs.map(npc => `npc=${npc.id}:${npc.name}:known=${npc.known}:disposition=${npc.disposition}`),
    ...surfaceBase.hazards.map(hazard => `hazard=${hazard.id}:${hazard.name}:disarmed=${Boolean(hazard.disarmed)}`),
  ]
}

export function buildSceneSurface(gameState: GameState): SceneSurface {
  const world = gameState.world
  const currentRoomId = gameState.currentRoomId
  const currentRoom = currentRoomId && world?.rooms?.[currentRoomId] ? world.rooms[currentRoomId] : undefined
  const roomExitIds = currentRoom?.exits?.filter(roomId => roomId !== currentRoomId) ?? []
  const objects = Object.values(world?.objects ?? {})
    .filter(object => objectIsOnSceneSurface(object, currentRoomId))
    .map(object => toSceneObject(object, currentRoomId))
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'))
  const npcs = Object.values(world?.npcs ?? {})
    .filter(npc => npc.roomId === currentRoomId && npc.known)
    .map(npc => ({
      id: npc.id,
      name: npc.name,
      aliases: npc.aliases ?? [],
      roomId: npc.roomId,
      disposition: npc.disposition,
      known: Boolean(npc.known),
      faction: npc.faction,
      goals: npc.goals ?? [],
      tags: npc.tags ?? [],
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'))
  const exitByRoomId = new Map<string, SceneSurfaceExit>()
  for (const exitId of roomExitIds) {
    exitByRoomId.set(exitId, {
      roomId: exitId,
      name: world?.rooms?.[exitId]?.name ?? `salle ${exitId}`,
      reason: 'Exit declared by current room.',
    })
  }
  for (const object of objects.filter(object => object.portal)) {
    for (const roomId of object.portal?.otherRoomIds ?? []) {
      exitByRoomId.set(roomId, {
        roomId,
        name: world?.rooms?.[roomId]?.name ?? `salle ${roomId}`,
        viaObjectId: object.id,
        viaObjectName: object.name,
        opened: object.opened,
        locked: object.locked,
        reason: 'Portal object visible on current scene surface.',
      })
    }
  }
  const exits = [...exitByRoomId.values()].sort((a, b) => a.name.localeCompare(b.name, 'fr'))
  const nearbyRooms = exits.map(exit => ({ id: exit.roomId, name: exit.name }))
  const hazards = objects.filter(object => object.kind === 'trap' || object.tags.includes('trap') || object.tags.includes('dangerous'))
  const inventory = gameState.player.inventory.map(item => ({
    id: item.id,
    name: item.name,
    type: item.type,
    relevant: item.type === 'potion' || /recette|cle|note|fragment|papier/i.test(item.name),
  }))
  const surfaceBase = {
    currentRoomId,
    currentRoom,
    exits,
    nearbyRooms,
    objects,
    npcs,
    hazards,
    inventory,
  }
  const affordances = deriveSceneSurfaceAffordances(surfaceBase, gameState)
  const targets = buildTargets(objects, npcs, inventory)
  const narratableFacts = narratableFactsForSurface(surfaceBase)
  return {
    ...surfaceBase,
    affordances,
    targets,
    narratableFacts,
  }
}

function targetHaystack(target: SceneSurfaceTarget): string {
  return [target.id, target.name, ...target.aliases].map(normalizeFrenchText).join(' ')
}

const TARGET_STOPWORDS = new Set([
  'avec',
  'aux',
  'dans',
  'des',
  'elle',
  'elles',
  'entre',
  'faire',
  'les',
  'leur',
  'lui',
  'mes',
  'mon',
  'par',
  'pour',
  'que',
  'qui',
  'sur',
  'ton',
  'une',
  'vers',
  'vais',
  'ouvre',
  'ouvres',
  'ouvrir',
  'pousse',
  'pousses',
  'pousser',
  'casse',
  'casses',
  'casser',
  'force',
  'forces',
  'forcer',
  'prends',
  'prendre',
])

export function findSceneTargetsByText(
  surface: SceneSurface,
  rawText: string,
  type?: SceneSurfaceTarget['type'],
  kind?: CanonicalPlayerActionKind
): SceneSurfaceTarget[] {
  const text = normalizeFrenchText(rawText)
  if (!text.trim()) return []
  const parts = text
    .split(/[^a-z0-9']+/)
    .map(part => part.replace(/^j'/, '').replace(/^l'/, ''))
    .filter(part => part.length >= 3 && !TARGET_STOPWORDS.has(part))
  return surface.targets.filter(target => {
    if (type && target.type !== type) return false
    if (kind && !target.kinds.includes(kind)) return false
    const haystack = targetHaystack(target)
    return haystack.includes(text) ||
      text.includes(normalizeFrenchText(target.name)) ||
      parts.some(part => haystack.includes(part))
  })
}

export function summarizeSceneSurfaceForDebug(surface: SceneSurface): Record<string, unknown> {
  return {
    currentRoomId: surface.currentRoomId,
    currentRoomName: surface.currentRoom?.name,
    exits: surface.exits.map(exit => ({
      roomId: exit.roomId,
      name: exit.name,
      viaObjectId: exit.viaObjectId,
      opened: exit.opened,
      locked: exit.locked,
    })),
    objects: surface.objects.map(object => ({
      id: object.id,
      name: object.name,
      kind: object.kind,
      distance: object.distance,
      opened: object.opened,
      locked: object.locked,
      actions: object.actionKinds,
      portal: object.portal,
    })),
    npcs: surface.npcs.map(npc => ({
      id: npc.id,
      name: npc.name,
      disposition: npc.disposition,
      known: npc.known,
    })),
    enabledAffordances: surface.affordances
      .filter(affordance => affordance.enabled)
      .map(affordance => ({ id: affordance.id, kind: affordance.kind, reason: affordance.reason })),
    blockedAffordances: surface.affordances
      .filter(affordance => !affordance.enabled)
      .map(affordance => ({ id: affordance.id, kind: affordance.kind, reason: affordance.reason })),
  }
}

export function buildInitialSceneNarrative(gameState: GameState): string {
  const surface = buildSceneSurface(gameState)
  const door = surface.objects.find(object =>
    object.kind === 'door' &&
    object.portal?.otherRoomIds.includes('4') &&
    object.actionKinds.some(kind => kind === 'open' || kind === 'force')
  )
  const mac = surface.npcs.find(npc => npc.id === 'mac')
  const scent = surface.exits.some(exit => exit.roomId === '4')
    ? "L'odeur de cannelle, de muscade et de pommes chaudes vient clairement de la boulangerie."
    : "L'air chaud porte une odeur de cannelle, de muscade et de pommes."
  const doorSentence = door
    ? `Devant toi, ${door.name} attend: tu peux l'observer, l'ouvrir ou la forcer, et ce sera tranche par le moteur.`
    : "Devant toi, le chemin se divise sans obstacle concret a manipuler."
  const macSentence = mac
    ? `${mac.name}, le grand pommier eveille, te regarde depuis le bord du chemin.`
    : "Le verger remue doucement au bord du chemin."

  return [
    "Le vieux sorcier Tyndareus le Vert t'a confie une mission tres particuliere: retrouver ce qui reste des secrets de Grammy.",
    "Apres deux jours de route, tu arrives devant la Boulangerie de Grammy, une batisse de pierre abandonnee au bout d'un chemin envahi d'herbes.",
    scent,
    doorSentence,
    macSentence,
  ].join(' ')
}
