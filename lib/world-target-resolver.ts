import type { CanonicalPlayerActionKind, GameState, PlayerAffordance, WorldObjectState } from './types'
import { normalizeFrenchText } from './dm-intent'
import {
  buildSceneSurface,
  findSceneTargetsByText,
  objectIsOnSceneSurface,
  type SceneSurface,
  type SceneSurfaceTarget,
} from './scene-surface'
import type { GameActionKind } from './game-actions'

type TargetSource = 'explicit' | 'recent_event' | 'unique_affordance' | 'unique_present_npc' | 'none'

export interface WorldActionTargetResolution {
  kind: GameActionKind
  targetName?: string
  targetSource: TargetSource
  npcTargetName?: string
  npcTargetSource: TargetSource
  itemName?: string
  itemSource: TargetSource
  ambiguous?: Array<{
    type: 'object' | 'npc'
    candidates: string[]
  }>
}

function uniqueOrUndefined<T>(values: T[]): T | undefined {
  const uniqueValues = [...new Set(values)]
  return uniqueValues.length === 1 ? uniqueValues[0] : undefined
}

function extractWorldTargetName(message: string): string | undefined {
  const text = normalizeFrenchText(message)
  const targetPatterns: Array<[string, RegExp]> = [
    ['Mac', /\bmac|pommier|treant\b/],
    ['Grukk', /\bgrukk|chef\b/],
    ['druidesse du verger', /\bdryade|druidesse|fee|fees|fees|verger\b/],
    ['tiroir', /\btiroirs?\b/],
    ['armoire', /\barmoires?|placards?\b/],
    ['coffre', /\bcoffres?\b/],
    ['four enchante', /\bfours?|fournee|runes?\b/],
    ['champignons violets', /\bchampignons?|amas|violets?\b/],
    ['porte de la reserve', /\bporte\b.{0,30}\breserve|reserve\b.{0,30}\bporte\b/],
    ['double porte', /\bdouble porte|porte d entree|porte de l entree|entree\b/],
    ['recette', /\brecette|fragment|moitie|parchemin|papier|indice\b/],
  ]
  return targetPatterns.find(([, pattern]) => pattern.test(text))?.[0]
}

function extractExpandedWorldTargetName(message: string): string | undefined {
  const text = normalizeFrenchText(message)
  const targetPatterns: Array<[string, RegExp]> = [
    ['Mac', /\bmac|pommier|treant|arbre\b/],
    ['Grukk', /\bgrukk|chef|hobgobelin\b/],
    ['druidesse du verger', /\bdryade|druidesse|fee|fees|femme du verger\b/],
    ['bureau', /\bbureau|paperasse|registres?\b/],
    ['registre', /\bregistre|livre de comptes|commandes\b/],
    ['tiroir', /\btiroirs?\b/],
    ['armoire', /\barmoires?|placards?\b/],
    ['coffre', /\bcoffres?\b/],
    ['caisses', /\bcaisses?|marchandises\b/],
    ['sacs de farine', /\bsacs?|farine|tas de farine\b/],
    ['cle', /\bcles?|clefs?\b/],
    ['note', /\bnotes?|ordre|bon de livraison|papier de livraison\b/],
    ['four enchante', /\bfours?|fournee|runes?\b/],
    ['couteaux', /\bcouteaux?|ratelier|outils animes?\b/],
    ['champignons violets', /\bchampignons?|amas|violets?\b/],
    ['porte de la reserve', /\bporte\b.{0,30}\breserve|reserve\b.{0,30}\bporte\b/],
    ['double porte', /\bdouble porte|porte d entree|porte de l entree|entree\b/],
    ['recette', /\brecette|fragment|moitie|parchemin|papier|indice\b/],
  ]
  return targetPatterns.find(([, pattern]) => pattern.test(text))?.[0] ?? extractWorldTargetName(message)
}

function extractWorldNpcTargetName(message: string): string | undefined {
  const text = normalizeFrenchText(message)
  const npcPatterns: Array<[string, RegExp]> = [
    ['Mac', /\bmac|pommier|treant|arbre\b/],
    ['Grukk', /\bgrukk|chef|hobgobelin\b/],
    ['druidesse du verger', /\bdryade|druidesse|fee|fees|femme du verger\b/],
  ]
  return npcPatterns.find(([, pattern]) => pattern.test(text))?.[0]
}

function extractWorldItemName(message: string): string | undefined {
  const text = normalizeFrenchText(message)
  const itemPatterns: Array<[string, RegExp]> = [
    ['recette', /\brecette|fragment|moitie|parchemin\b/],
    ['cle', /\bcles?|clefs?\b/],
    ['note', /\bnotes?|bon|ordre|papier\b/],
    ['potion', /\bpotion\b/],
  ]
  return itemPatterns.find(([, pattern]) => pattern.test(text))?.[0]
}

function wantsPortalTraversal(message: string): boolean {
  const text = normalizeFrenchText(message)
  return /\b(pousses?|pousser|rentres?|rentrer|entres?|entrer|franchis|franchir|passes?|passer|traverses?|traverser|dedans|interieur|a l interieur|dans le batiment|boulangerie)\b/.test(text)
}

function hasAnaphoricObjectReference(message: string): boolean {
  const text = normalizeFrenchText(message)
  return /\b(?:l[' ]?(?:ouvre|ouvres|examines?|etudies?|empoches?|attrapes?)|le prends|la prends|le lis|la lis|ouvre[- ]?(?:le|la|ca)|lis[- ]?(?:le|la)|prends ca|ramasse ca|recupere ca|reprends ca|utilise ca|desamorce ca)\b/.test(text)
}

function hasAnaphoricNpcReference(message: string): boolean {
  const text = normalizeFrenchText(message)
  return /\b(?:lui parle|parle[- ]?lui|je lui parle|je lui demande|demande[- ]?lui|je l interroge|interroge[- ]?(?:le|la)|je lui montre|je lui donne|aide[- ]?(?:le|la)|je l aide)\b/.test(text)
}

function isObjectOpenable(object: WorldObjectState): boolean {
  return object.kind === 'door' ||
    object.kind === 'container' ||
    object.opened !== undefined ||
    object.locked !== undefined
}

function isAnaphoricObjectCandidateForKind(
  kind: GameActionKind,
  object: WorldObjectState,
  gameState: GameState
): boolean {
  const visibleHere = objectIsOnSceneSurface(object, gameState.currentRoomId)
  const inventoryIds = new Set(gameState.player.inventory.map(item => item.id))
  const readable = Boolean(object.readableText || object.tags?.includes('readable'))
  switch (kind) {
    case 'open':
    case 'unlock':
    case 'force':
      return visibleHere && object.taken !== true && isObjectOpenable(object)
    case 'take':
      return visibleHere && object.taken !== true && ['item', 'clue'].includes(object.kind)
    case 'read':
      return readable && (visibleHere || inventoryIds.has(object.id))
    case 'disarm':
      return visibleHere && object.kind === 'trap' && object.disarmed !== true
    case 'use_object':
      return visibleHere && ['fixture', 'trap'].includes(object.kind)
    case 'examine':
      return visibleHere
    default:
      return false
  }
}

function canonicalKind(kind: GameActionKind): CanonicalPlayerActionKind | undefined {
  return [
    'examine',
    'read',
    'search',
    'open',
    'take',
    'unlock',
    'force',
    'disarm',
    'talk',
    'ask',
    'persuade',
    'threaten',
    'show_item',
    'give_item',
    'hide',
    'help',
    'flee',
    'stabilize',
    'use_object',
    'combine_recipe',
    'use_item',
  ].includes(kind) ? kind as CanonicalPlayerActionKind : undefined
}

function uniqueTargetOrAmbiguous(
  candidates: SceneSurfaceTarget[]
): { name?: string; ambiguous?: string[] } {
  const names = uniqueOrUndefined(candidates.map(target => target.name))
  if (names) return { name: names }
  const uniqueNames = [...new Set(candidates.map(target => target.name))]
  return uniqueNames.length > 1 ? { ambiguous: uniqueNames } : {}
}

function surfaceObjectTargetFromMessage(
  message: string,
  gameState: GameState,
  kind: GameActionKind
): { name?: string; ambiguous?: string[] } {
  if (!['examine', 'read', 'search', 'open', 'take', 'unlock', 'force', 'disarm', 'use_object'].includes(kind)) {
    return {}
  }
  const surface = buildSceneSurface(gameState)
  const targetKind = canonicalKind(kind)
  const directCandidates = findSceneTargetsByText(surface, message, 'object', targetKind)
  const direct = uniqueTargetOrAmbiguous(directCandidates)
  if (direct.name || direct.ambiguous) return direct

  const fallbackName = extractExpandedWorldTargetName(message)
  if (!fallbackName) return {}
  const fallbackCandidates = findSceneTargetsByText(surface, fallbackName, 'object', targetKind)
  const fallback = uniqueTargetOrAmbiguous(fallbackCandidates)
  if (fallback.name || fallback.ambiguous) return fallback

  return { name: fallbackName }
}

function surfaceNpcTargetFromMessage(
  message: string,
  gameState: GameState,
  kind: GameActionKind
): { name?: string; ambiguous?: string[] } {
  const surface = buildSceneSurface(gameState)
  const targetKind = canonicalKind(kind)
  const directCandidates = findSceneTargetsByText(surface, message, 'npc', targetKind)
  const direct = uniqueTargetOrAmbiguous(directCandidates)
  if (direct.name || direct.ambiguous) return direct

  const fallbackName = extractWorldNpcTargetName(message)
  if (!fallbackName) return {}
  const fallbackCandidates = findSceneTargetsByText(surface, fallbackName, 'npc', targetKind)
  const fallback = uniqueTargetOrAmbiguous(fallbackCandidates)
  if (fallback.name || fallback.ambiguous) return fallback

  return { name: fallbackName }
}

function objectTargetNameFromAffordance(affordance: PlayerAffordance, gameState: GameState): string | undefined {
  const prefixes = [
    'world-open-',
    'world-unlock-',
    'world-force-',
    'world-take-',
    'world-read-',
    'world-disarm-',
    'world-use-',
  ]
  const prefix = prefixes.find(candidate => affordance.id.startsWith(candidate))
  if (!prefix) return undefined
  return gameState.world?.objects[affordance.id.slice(prefix.length)]?.name
}

function inferAnaphoricWorldTarget(
  message: string,
  gameState: GameState,
  kind: GameActionKind
): { name?: string; source: TargetSource; ambiguous?: string[] } {
  if (!gameState.world || !hasAnaphoricObjectReference(message)) return { source: 'none' }

  const recentObject = gameState.world.eventLog
    .slice(-8)
    .reverse()
    .map(event => typeof event.targetId === 'string' ? gameState.world?.objects[event.targetId] : undefined)
    .find(object => object && isAnaphoricObjectCandidateForKind(kind, object, gameState))
  if (recentObject) return { name: recentObject.name, source: 'recent_event' }

  const affordedNames = buildSceneSurface(gameState).affordances
    .filter(affordance => affordance.kind === kind)
    .map(affordance => objectTargetNameFromAffordance(affordance, gameState))
    .filter((name): name is string => Boolean(name))
  const uniqueName = uniqueOrUndefined(affordedNames)
  if (uniqueName) return { name: uniqueName, source: 'unique_affordance' }
  if (affordedNames.length > 1) return { source: 'none', ambiguous: [...new Set(affordedNames)] }
  return { source: 'none' }
}

function npcTargetNameFromAffordance(affordance: PlayerAffordance, gameState: GameState): string | undefined {
  const prefixes = [
    'world-talk-',
    'world-ask-',
    'world-persuade-',
    'world-threaten-',
    'world-show-item-',
    'world-give-item-',
  ]
  const prefix = prefixes.find(candidate => affordance.id.startsWith(candidate))
  if (!prefix) return undefined
  return gameState.world?.npcs[affordance.id.slice(prefix.length)]?.name
}

function inferAnaphoricNpcTarget(
  message: string,
  gameState: GameState,
  kind: GameActionKind
): { name?: string; source: TargetSource; ambiguous?: string[] } {
  if (!gameState.world || !hasAnaphoricNpcReference(message)) return { source: 'none' }

  const recentNpc = gameState.world.eventLog
    .slice(-8)
    .reverse()
    .map(event => typeof event.targetId === 'string' ? gameState.world?.npcs[event.targetId] : undefined)
    .find(npc => npc && npc.roomId === gameState.currentRoomId)
  if (recentNpc) return { name: recentNpc.name, source: 'recent_event' }

  const affordedNames = buildSceneSurface(gameState).affordances
    .filter(affordance => affordance.kind === kind)
    .map(affordance => npcTargetNameFromAffordance(affordance, gameState))
    .filter((name): name is string => Boolean(name))
  const uniqueAffordedName = uniqueOrUndefined(affordedNames)
  if (uniqueAffordedName) return { name: uniqueAffordedName, source: 'unique_affordance' }
  if (affordedNames.length > 1) return { source: 'none', ambiguous: [...new Set(affordedNames)] }

  const knownNpcNames = Object.values(gameState.world.npcs)
    .filter(npc => npc.roomId === gameState.currentRoomId && npc.known)
    .map(npc => npc.name)
  const uniquePresentNpcName = uniqueOrUndefined(knownNpcNames)
  if (uniquePresentNpcName) return { name: uniquePresentNpcName, source: 'unique_present_npc' }
  if (knownNpcNames.length > 1) return { source: 'none', ambiguous: [...new Set(knownNpcNames)] }
  return { source: 'none' }
}

export function resolveWorldActionTargets(
  message: string,
  gameState: GameState,
  kind: GameActionKind
): WorldActionTargetResolution {
  const explicitTarget = surfaceObjectTargetFromMessage(message, gameState, kind)
  const inferredTarget = explicitTarget.name
    ? { name: explicitTarget.name, source: 'explicit' as TargetSource }
    : explicitTarget.ambiguous
      ? { source: 'none' as TargetSource, ambiguous: explicitTarget.ambiguous }
      : inferAnaphoricWorldTarget(message, gameState, kind)

  const explicitNpcTarget = surfaceNpcTargetFromMessage(message, gameState, kind)
  const inferredNpcTarget = explicitNpcTarget.name
    ? { name: explicitNpcTarget.name, source: 'explicit' as TargetSource }
    : explicitNpcTarget.ambiguous
      ? { source: 'none' as TargetSource, ambiguous: explicitNpcTarget.ambiguous }
      : inferAnaphoricNpcTarget(message, gameState, kind)

  const itemName = extractWorldItemName(message)
  const ambiguous = [
    ...(inferredTarget.ambiguous ? [{ type: 'object' as const, candidates: inferredTarget.ambiguous }] : []),
    ...(inferredNpcTarget.ambiguous ? [{ type: 'npc' as const, candidates: inferredNpcTarget.ambiguous }] : []),
  ]

  return {
    kind,
    targetName: inferredTarget.name,
    targetSource: inferredTarget.source,
    npcTargetName: inferredNpcTarget.name,
    npcTargetSource: inferredNpcTarget.source,
    itemName,
    itemSource: itemName ? 'explicit' : 'none',
    ...(ambiguous.length > 0 ? { ambiguous } : {}),
  }
}

export function buildWorldActionInput(
  message: string,
  gameState: GameState,
  kind: GameActionKind
): Record<string, unknown> | null {
  const targetResolution = resolveWorldActionTargets(message, gameState, kind)
  const targetName = targetResolution.targetName
  const npcTargetName = targetResolution.npcTargetName
  const itemName = targetResolution.itemName

  switch (kind) {
    case 'examine':
      return targetName ? { kind: 'examine', targetName } : { kind: 'examine' }
    case 'read':
      return { kind: 'read', ...(targetName ? { targetName } : {}) }
    case 'search':
      return targetName && /\b(tiroirs?|armoires?|coffres?|four|champignons?|caisses?|sacs?|bureau|appartement)\b/.test(normalizeFrenchText(message))
        ? { kind: 'search', targetName }
        : { kind: 'search' }
    case 'open':
      return { kind: 'open', ...(targetName ? { targetName } : {}), ...(wantsPortalTraversal(message) ? { traverse: true } : {}) }
    case 'take':
      return { kind: 'take', ...(targetName ? { targetName } : {}) }
    case 'unlock':
      return { kind: 'unlock', ...(targetName ? { targetName } : {}), ...(wantsPortalTraversal(message) ? { traverse: true } : {}) }
    case 'force':
      return { kind: 'force', ...(targetName ? { targetName } : {}), ...(wantsPortalTraversal(message) ? { traverse: true } : {}) }
    case 'disarm':
      return { kind: 'disarm', ...(targetName ? { targetName } : {}) }
    case 'talk':
      return { kind: 'talk', ...(npcTargetName ? { targetName: npcTargetName } : {}), topic: message }
    case 'ask':
      return { kind: 'ask', ...(npcTargetName ? { targetName: npcTargetName } : {}), topic: message }
    case 'persuade':
      return { kind: 'persuade', ...(npcTargetName ? { targetName: npcTargetName } : {}), topic: message }
    case 'threaten':
      return { kind: 'threaten', ...(npcTargetName ? { targetName: npcTargetName } : {}), demand: message }
    case 'show_item':
      return { kind: 'show_item', ...(npcTargetName ? { targetName: npcTargetName } : {}), ...(itemName ? { itemName } : {}) }
    case 'give_item':
      return { kind: 'give_item', ...(npcTargetName ? { targetName: npcTargetName } : {}), ...(itemName ? { itemName } : {}) }
    case 'hide':
      return { kind: 'hide' }
    case 'help':
      return { kind: 'help', ...(npcTargetName ? { targetName: npcTargetName } : {}) }
    case 'flee':
      return { kind: 'flee' }
    case 'stabilize':
      return { kind: 'stabilize', targetId: 'player' }
    case 'use_object':
      return { kind: 'use_object', ...(targetName ? { targetName } : {}) }
    case 'combine_recipe':
      return { kind: 'combine_recipe' }
    default:
      return null
  }
}

export function buildPortalTraversalActionInput(
  message: string,
  gameState: GameState
): Record<string, unknown> | null {
  if (!wantsPortalTraversal(message)) return null
  const surface = buildSceneSurface(gameState)
  const text = normalizeFrenchText(message)
  const mentionsPortalCue = /\b(portes?|entree|battants?|seuil|dedans|interieur|batiment|boulangerie|pousses?|pousser|rentres?|rentrer|entres?|entrer|franchis|franchir|passes?|passer)\b/.test(text)
  if (!mentionsPortalCue) return null

  const directCandidates = findSceneTargetsByText(surface, message, 'object', 'open')
    .filter(target => surface.objects.some(object => object.id === target.id && object.portal?.otherRoomIds.length))
  const candidates = directCandidates.length > 0
    ? directCandidates
    : surface.objects
        .filter(object => object.portal?.otherRoomIds.length && object.actionKinds.includes('open'))
        .map(object => ({
          id: object.id,
          type: 'object' as const,
          name: object.name,
          aliases: object.aliases,
          kinds: object.actionKinds,
        }))
  const uniqueTarget = uniqueTargetOrAmbiguous(candidates)
  if (uniqueTarget.ambiguous) {
    return {
      kind: 'open',
      traverse: true,
    }
  }
  if (!uniqueTarget.name) return null

  return {
    kind: 'open',
    targetName: uniqueTarget.name,
    traverse: true,
  }
}
