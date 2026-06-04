import { z } from 'zod'
import { centerCellForAdventureRoom } from './adventure-map'
import { normalizeFrenchText } from './dm-intent'
import { analyzeFictionImprovisation } from './fiction-intent'
import { resolveLocationDestination } from './location-index'
import { buildSceneSurface, summarizeSceneSurfaceForDebug } from './scene-surface'
import type { CanonicalPlayerActionKind, ConversationTurn, GameState, PlayerAffordance } from './types'

export const INTENT_INTERPRETER_SCHEMA_VERSION = 1

export const IntentImprovisationTypeSchema = z.enum([
  'create_fiction_fact',
  'use_fiction_fact',
  'social_transgression',
  'environmental_change',
  'improvised_tool_object',
  'distraction_noise',
  'non_mechanical_flavor',
])

const REASONING_SUMMARY_MAX = 240

// LLMs sometimes return targetHints as an array of candidate strings (or a bare
// string) instead of the structured object. Coerce those shapes into the
// expected object so a benign format drift never collapses the whole turn to a
// mock clarification.
function coerceTargetHints(value: unknown): unknown {
  if (Array.isArray(value)) {
    const candidates = value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    return candidates.length > 0 ? { candidates } : {}
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed.length > 0 ? { targetHint: trimmed } : {}
  }
  if (value === null || value === undefined) return {}
  return value
}

// reasoningSummary is meant to be a short, non-technical note. The LLM
// occasionally overruns the 240-char cap; truncate instead of failing.
function coerceReasoningSummary(value: unknown): unknown {
  if (typeof value !== 'string') return value
  const trimmed = value.trim()
  return trimmed.length > REASONING_SUMMARY_MAX ? `${trimmed.slice(0, REASONING_SUMMARY_MAX - 1)}…` : trimmed
}

export const IntentInterpreterOutputSchema = z.object({
  schemaVersion: z.literal(INTENT_INTERPRETER_SCHEMA_VERSION).default(INTENT_INTERPRETER_SCHEMA_VERSION),
  intentKind: z.string().min(1),
  confidence: z.number().min(0).max(1),
  requiresClarification: z.boolean(),
  clarificationQuestion: z.string().trim().min(1).nullable().optional(),
  canonicalAction: z.record(z.string(), z.unknown()).nullable().optional(),
  improvisation: z.object({
    type: IntentImprovisationTypeSchema,
    persistence: z.enum(['none', 'scene', 'session']).optional(),
    createsFacts: z.array(z.record(z.string(), z.unknown())).optional(),
    usesFactIds: z.array(z.string()).optional(),
    tags: z.array(z.string()).optional(),
  }).nullable().optional(),
  targetHints: z.preprocess(
    coerceTargetHints,
    z.object({
      targetName: z.string().optional(),
      targetId: z.string().optional(),
      targetType: z.string().optional(),
      targetHint: z.string().optional(),
      candidates: z.array(z.string()).optional(),
    }),
  ).default({}),
  reasoningSummary: z.preprocess(coerceReasoningSummary, z.string().max(240)),
  source: z.enum(['mock', 'llm', 'fallback']).default('mock'),
}).strict()

export type IntentImprovisationType = z.infer<typeof IntentImprovisationTypeSchema>
export type IntentInterpreterOutput = z.infer<typeof IntentInterpreterOutputSchema>

export interface IntentInterpreterInputSummary {
  schemaVersion: 1
  message: string
  normalizedMessage: string
  state: {
    phase: GameState['phase']
    currentTurn: string | null
    playerHp: string
    playerConditions: string[]
    currentRoomId: string | null
    currentRoomName: string | null
    aliveMonsters: Array<{ id: string; name: string; hp: string }>
  }
  sceneSurface: Record<string, unknown> | null
  recentEvents: Array<Record<string, unknown>>
  recentHistory: Array<{ role: ConversationTurn['role']; content: string }>
}

function onePresentNpc(gameState: GameState): { id: string; name: string } | null {
  if (!gameState.currentRoomId || !gameState.world?.npcs) return null
  const npcs = buildSceneSurface(gameState).npcs.map(npc => ({ id: npc.id, name: npc.name }))
  return npcs.length === 1 ? npcs[0] : null
}

function targetNameFromText(text: string, gameState: GameState): string | undefined {
  const surface = buildSceneSurface(gameState)
  const haystack = text
  const matches = [
    ...surface.npcs
      .filter(npc => [npc.name, ...npc.aliases].some(alias => haystack.includes(normalizeFrenchText(alias))))
      .map(npc => npc.name),
    ...surface.objects
      .filter(object => [object.name, ...object.aliases, ...object.tags].some(alias => haystack.includes(normalizeFrenchText(alias))))
      .map(object => object.name),
  ]
  if (matches.length === 1) return matches[0]
  return onePresentNpc(gameState)?.name
}

function confidenceLabel(value: number): 'low' | 'medium' | 'high' {
  if (value >= 0.8) return 'high'
  if (value >= 0.55) return 'medium'
  return 'low'
}

function output(fields: Omit<IntentInterpreterOutput, 'schemaVersion' | 'source'> & { source?: IntentInterpreterOutput['source'] }): IntentInterpreterOutput {
  return IntentInterpreterOutputSchema.parse({
    schemaVersion: INTENT_INTERPRETER_SCHEMA_VERSION,
    source: fields.source ?? 'mock',
    ...fields,
  })
}

function maybeDirectQuestion(text: string): boolean {
  return /\b(ou|quoi|qui|comment|pourquoi|quel|quelle|quels|quelles|est ce que|peux tu|peux-tu|je peux|puis je|puis-je)\b/.test(text)
}

function wantsTraversal(text: string): boolean {
  return /\b(pousses?|pousser|rentres?|rentrer|entres?|entrer|franchis|franchir|passes?|passer|traverses?|traverser|dedans|interieur|batiment|boulangerie)\b/.test(text)
}

function mockCanonicalKind(text: string, gameState: GameState): CanonicalPlayerActionKind | null {
  if (/\b(lis|lire|lecture|dechiffres?|dechiffrer|etudies?|etudier)\b/.test(text)) return 'read'
  if (/\b(assembles?|assembler|combines?|combiner|reconstitues?|reconstituer|complete|completer)\b/.test(text) && /\b(recette|fragments?|morceaux?|moities?)\b/.test(text)) return 'combine_recipe'
  if (/\b(crochettes?|crochetes?|crocheter|deverrouilles?|deverrouiller|serrure)\b/.test(text)) return 'unlock'
  if (/\b(desamorces?|desamorcer|desactives?|desactiver|neutralises?|neutraliser)\b/.test(text)) return 'disarm'
  if (/\b(forces?|forcer|enfonces?|enfoncer|defonces?|defoncer|detruis|detruire|casses?|casser|exploses?|exploser)\b/.test(text)) return 'force'
  if (/\b(ouvres?|ouvrir|entrouvres?|pousses?|pousser|rentres?|rentrer|entres?|entrer|interieur|dedans|batiment)\b/.test(text)) return 'open'
  if (/\b(prends?|prendre|ramasses?|ramasser|recuperes?|recuperer|attrapes?|attraper|empoches?|empocher)\b/.test(text)) return 'take'
  if (/\b(montres?|montrer|presente|presentes|brandis)\b/.test(text)) return 'show_item'
  if (/\b(donnes?|donner|offres?|offrir|remets?|remettre|confies?|confier)\b/.test(text)) return 'give_item'
  if (/\b(menaces?|menacer|intimides?|intimider|rends toi|rendez vous|soumission)\b/.test(text)) return 'threaten'
  if (/\b(persuades?|persuader|convaincs?|convaincre|negocies?|negocier|rassures?|rassurer)\b/.test(text)) return 'persuade'
  if (/\b(parles?|parler|discutes?|discuter|salut|bonjour|bonsoir|hello)\b/.test(text)) return 'talk'
  if (/\b(demandes?|demander|questionnes?|questionner|interroges?|interroger)\b/.test(text)) return 'ask'
  if (/\b(caches?|cacher|planques?|planquer|discretion|furtif|faufiles?|faufiler)\b/.test(text)) return 'hide'
  if (/\b(fuis|fuir|fuite|retraite|bats en retraite|deguerpis)\b/.test(text)) return 'flee'
  if (/\b(aides?|aider|assistes?|assister|coup de main)\b/.test(text)) return 'help'
  if (/\b(stabilises?|stabiliser|premiers secours|medecine|soignes?|soigner)\b/.test(text)) return 'stabilize'
  if (/\b(utilises?|utiliser|actives?|activer|declenches?|declencher|actionnes?|actionner|demarres?|demarrer|touches?|toucher|manipules?|manipuler)\b/.test(text)) return 'use_object'
  if (/\b(fouilles?|fouiller|cherches?|chercher|inspectes?|inspecter)\b/.test(text) && !maybeDirectQuestion(text)) return 'search'
  if (/\b(regardes?|regarder|observes?|observer|examines?|examiner|decris|decrire|ecoutes?|ecouter)\b/.test(text)) return 'examine'
  if (gameState.phase === 'combat' && /\b(passe|attends?|attendre|patiente|ne fais rien)\b/.test(text)) return 'wait'
  return null
}

function hasMockMoveIntent(text: string): boolean {
  return /\b(va|vais|aller|deplaces?|deplacer|diriges?|diriger|avances?|avancer|bouges?|bouger|marche|pars|partir|sors|sortir|quittes?|quitter|retournes?|retourner|reviens|revenir|suis|suivre|approches?|approcher|explores?|explorer|continue|continuer|rentre|entrer|monte|monter|descends?|descendre)\b/.test(text)
}

function recentPortalFollowupRoomId(text: string, gameState: GameState): string | null {
  if (!gameState.currentRoomId || !gameState.world) return null
  const asksToFinishPortalMove =
    /\b(?:tu ne m[' ]?as pas deplace|tu m[' ]?as pas deplace|pas deplace|pas bouge|j[' ]?entre|je rentre|je franchis|je passe|j[' ]?y vais|vas y|go|dedans|interieur)\b/.test(text)
  if (!asksToFinishPortalMove) return null

  const recentPortalEvent = [...gameState.world.eventLog].reverse().find(event =>
    ['door.opened', 'object.opened', 'object.used'].includes(event.type) &&
    typeof event.targetId === 'string' &&
    Boolean(gameState.world?.objects[event.targetId]?.portal?.roomIds.includes(gameState.currentRoomId ?? ''))
  )
  if (!recentPortalEvent?.targetId) return null

  const portal = gameState.world.objects[recentPortalEvent.targetId]
  return portal.portal?.roomIds.find(roomId => roomId !== gameState.currentRoomId) ?? null
}

function buildMockMoveOutput(message: string, gameState: GameState): IntentInterpreterOutput | null {
  const text = normalizeFrenchText(message)
  if (!hasMockMoveIntent(text)) return null

  const recentPortalRoomId = recentPortalFollowupRoomId(text, gameState)
  const recentPortalCell = recentPortalRoomId ? centerCellForAdventureRoom(recentPortalRoomId) : null
  if (recentPortalRoomId && recentPortalCell) {
    return output({
      intentKind: 'move',
      confidence: 0.84,
      requiresClarification: false,
      canonicalAction: {
        kind: 'move',
        tokenId: 'player',
        toCell: recentPortalCell,
      },
      improvisation: null,
      targetHints: {
        targetId: recentPortalRoomId,
        targetName: gameState.world?.rooms?.[recentPortalRoomId]?.name,
        targetType: 'room',
      },
      reasoningSummary: 'Correction de deplacement rattachee au dernier portail ouvert/utilise.',
    })
  }

  const resolution = resolveLocationDestination(message, gameState)
  if (resolution.status === 'resolved' && resolution.target?.roomId) {
    const toCell = centerCellForAdventureRoom(resolution.target.roomId)
    if (toCell) {
      return output({
        intentKind: 'move',
        confidence: 0.86,
        requiresClarification: false,
        canonicalAction: {
          kind: 'move',
          tokenId: 'player',
          toCell,
        },
        improvisation: null,
        targetHints: {
          targetId: resolution.target.roomId,
          targetName: resolution.target.name,
          targetType: 'room',
        },
        reasoningSummary: 'Destination resolue par la surface de localisation; le moteur validera le deplacement.',
      })
    }
  }

  if (resolution.status === 'ambiguous') {
    const candidates = resolution.candidates.map(candidate => candidate.name).filter(Boolean).slice(0, 4)
    return output({
      intentKind: 'move',
      confidence: 0.74,
      requiresClarification: true,
      clarificationQuestion: candidates.length > 0
        ? `Plusieurs issues peuvent correspondre: ${candidates.join(', ')}. Laquelle tu prends ?`
        : 'Je vois que tu veux bouger, mais la direction est ambigue. Tu vas vers quel repere ?',
      canonicalAction: null,
      improvisation: null,
      targetHints: { candidates },
      reasoningSummary: 'Intention de mouvement reconnue, destination ambigue.',
    })
  }

  const surface = buildSceneSurface(gameState)
  const exitNames = surface.exits.map(exit => exit.name).filter(Boolean).slice(0, 4)
  return output({
    intentKind: 'move',
    confidence: 0.62,
    requiresClarification: true,
    clarificationQuestion: exitNames.length > 0
      ? `Je vois que tu veux changer de position, mais il faut un repere concret: ${exitNames.join(', ')}.`
      : 'Je vois que tu veux bouger, mais je ne vois pas de destination claire depuis ici.',
    canonicalAction: null,
    improvisation: null,
    targetHints: { candidates: exitNames },
    reasoningSummary: 'Intention de mouvement reconnue sans destination resolue.',
  })
}

function haystackForAffordance(affordance: PlayerAffordance): string {
  return [
    affordance.id,
    affordance.label,
    affordance.target?.id,
    affordance.target?.name,
    ...(affordance.aliases ?? []),
  ].filter((value): value is string => Boolean(value)).map(normalizeFrenchText).join(' ')
}

function targetSpecificityScore(text: string, affordance: PlayerAffordance): number {
  const haystack = haystackForAffordance(affordance)
  let score = 0
  for (const token of text.split(/[^a-z0-9']+/).filter(part => part.length >= 3)) {
    if (haystack.includes(token)) score += token.length
  }
  return score
}

function normalizeAffordanceAction(
  affordance: PlayerAffordance | null,
  kind: CanonicalPlayerActionKind,
  message: string,
  gameState: GameState
): Record<string, unknown> {
  if (kind === 'search') return { kind: 'search', query: message }

  const action: Record<string, unknown> = { kind }
  const target = affordance?.target
  if (target?.type === 'object' || target?.type === 'inventory') {
    action.targetId = target.id
    if (target.name) action.targetName = target.name
  } else if (target?.type === 'npc') {
    action.targetName = target.name
  }

  if ((kind === 'open' || kind === 'unlock' || kind === 'force') && wantsTraversal(normalizeFrenchText(message))) {
    action.traverse = true
  }

  if (kind === 'talk' || kind === 'ask' || kind === 'persuade') action.topic = message
  if (kind === 'threaten') action.demand = message
  if (kind === 'stabilize') action.targetId = 'player'
  if (kind === 'use_item') action.itemType = 'healing_potion'
  if (kind === 'wait') action.reason = 'Le joueur attend et passe son tour.'

  if (kind === 'show_item' || kind === 'give_item') {
    const item = inventoryItemFromText(message, gameState)
    if (item) {
      action.itemId = item.id
      action.itemName = item.name
    }
  }

  if ((kind === 'talk' || kind === 'ask' || kind === 'persuade' || kind === 'threaten' || kind === 'help') && !action.targetName) {
    const npc = onePresentNpc(gameState)
    if (npc) action.targetName = npc.name
  }

  return action
}

function inventoryItemFromText(message: string, gameState: GameState): GameState['player']['inventory'][number] | null {
  const text = normalizeFrenchText(message)
  const explicitPotion = /\b(potion|fiole|soin)\b/.test(text)
  const explicitRecipe = /\b(recette|fragment|moitie|parchemin|papier)\b/.test(text)
  const matches = gameState.player.inventory.filter(item => {
    const haystacks = [
      item.id,
      item.name,
      item.type,
      item.description ?? '',
      item.type === 'potion' ? 'potion fiole soin potion de soin' : '',
      item.id.includes('recipe') || normalizeFrenchText(item.name).includes('recette') ? 'recette fragment moitie parchemin papier' : '',
    ].map(normalizeFrenchText)
    return haystacks.some(haystack => {
      if (!haystack) return false
      return haystack.split(/[^a-z0-9']+/).some(token => token.length >= 3 && text.includes(token)) ||
        text.includes(haystack)
    })
  })
  if (matches.length === 1) return matches[0]
  if (explicitPotion) {
    const potions = gameState.player.inventory.filter(item => item.type === 'potion')
    if (potions.length === 1) return potions[0]
  }
  if (explicitRecipe) {
    const recipes = gameState.player.inventory.filter(item =>
      item.id.includes('recipe') || normalizeFrenchText(item.name).includes('recette')
    )
    if (recipes.length === 1) return recipes[0]
  }
  return null
}

function bestAffordanceForKind(
  kind: CanonicalPlayerActionKind,
  text: string,
  gameState: GameState,
  includeBlocked = false
): PlayerAffordance | null {
  const surface = buildSceneSurface(gameState)
  const candidates = surface.affordances.filter(affordance =>
    affordance.kind === kind &&
    (includeBlocked || affordance.enabled)
  )
  if (candidates.length === 0) return null
  const scored = candidates
    .map(affordance => ({ affordance, score: targetSpecificityScore(text, affordance) }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      const aRoom = a.affordance.target?.type === 'room' ? 1 : 0
      const bRoom = b.affordance.target?.type === 'room' ? 1 : 0
      return aRoom - bRoom
    })
  if (scored[0]?.score > 0) return scored[0].affordance
  const recentTargetId = [...(gameState.world?.eventLog ?? [])].reverse().find(event =>
    typeof event.targetId === 'string' &&
    ['object.taken', 'room.object_discovered', 'object.opened', 'door.opened', 'clue.read'].includes(event.type)
  )?.targetId
  const recentAffordance = recentTargetId
    ? candidates.find(candidate => candidate.target?.id === recentTargetId)
    : null
  if (recentAffordance) return recentAffordance
  if (kind === 'examine' || kind === 'search' || kind === 'hide' || kind === 'flee' || kind === 'combine_recipe' || kind === 'wait') {
    return candidates[0]
  }
  return candidates.length === 1 ? candidates[0] : null
}

function buildMockWorldActionOutput(
  message: string,
  gameState: GameState,
  kind: CanonicalPlayerActionKind
): IntentInterpreterOutput | null {
  const text = normalizeFrenchText(message)
  const affordance = bestAffordanceForKind(kind, text, gameState)
  const blockedAffordance = affordance ? null : bestAffordanceForKind(kind, text, gameState, true)
  const selectedAffordance = affordance ?? blockedAffordance
  const recentTakenTargetId = kind === 'take'
    ? [...(gameState.world?.eventLog ?? [])].reverse().find(event =>
        event.type === 'object.taken' &&
        typeof event.targetId === 'string'
      )?.targetId
    : undefined
  const selectedScore = selectedAffordance ? targetSpecificityScore(text, selectedAffordance) : 0
  const explicitlyNamesRecipeButNoRecipeTarget =
    kind === 'take' &&
    selectedScore === 0 &&
    /\b(recette|fragment|moitie|papier|parchemin)\b/.test(text)
  if (explicitlyNamesRecipeButNoRecipeTarget) {
    return output({
      intentKind: kind,
      confidence: 0.78,
      requiresClarification: false,
      canonicalAction: { kind, targetName: 'recette' },
      improvisation: null,
      targetHints: { targetName: 'recette', targetType: 'object' },
      reasoningSummary: 'Objet nomme explicitement mais non afforde; le moteur doit produire le refus canonique plutot que prendre un autre objet.',
    })
  }
  const repeatsRecentTakenObject =
    kind === 'take' &&
    Boolean(recentTakenTargetId) &&
    selectedScore === 0 &&
    /\b(encore|de nouveau|recette|fragment|papier|parchemin|la|le|l')\b/.test(text)
  if ((!selectedAffordance && recentTakenTargetId) || repeatsRecentTakenObject) {
    return output({
      intentKind: kind,
      confidence: 0.76,
      requiresClarification: false,
      canonicalAction: { kind, targetId: recentTakenTargetId },
      improvisation: null,
      targetHints: { targetId: recentTakenTargetId, targetType: 'object' },
      reasoningSummary: 'Anaphore/repetition rattachee au dernier objet pris; le moteur produira le refus canonique si necessaire.',
    })
  }
  const action = normalizeAffordanceAction(selectedAffordance, kind, message, gameState)
  if (!selectedAffordance && ['open', 'take', 'unlock', 'force', 'read', 'disarm', 'use_object', 'show_item', 'give_item'].includes(kind)) {
    const surface = buildSceneSurface(gameState)
    const candidates = surface.affordances
      .filter(candidate => candidate.kind === kind)
      .map(candidate => candidate.target?.name ?? candidate.label)
      .filter(Boolean)
      .slice(0, 4)
    return output({
      intentKind: kind,
      confidence: 0.62,
      requiresClarification: true,
      clarificationQuestion: candidates.length > 0
        ? `Tu veux ${kind}, mais je dois savoir quelle cible tu vises: ${candidates.join(', ')}.`
        : `Tu veux ${kind}, mais je ne vois pas de cible claire ici.`,
      canonicalAction: null,
      improvisation: null,
      targetHints: { candidates },
      reasoningSummary: 'Le mock a reconnu une famille d action mais pas une cible unique.',
    })
  }

  return output({
    intentKind: kind,
    confidence: affordance ? 0.86 : 0.72,
    requiresClarification: false,
    canonicalAction: action,
    improvisation: null,
    targetHints: selectedAffordance?.target
      ? {
          targetId: selectedAffordance.target.id,
          targetName: selectedAffordance.target.name,
          targetType: selectedAffordance.target.type,
        }
      : {},
    reasoningSummary: `Action ${kind} proposee depuis la SceneSurface; le moteur validera la cible.`,
  })
}

function isGuidanceRequest(text: string): boolean {
  return /\b(je peux faire quoi|que puis je faire|que puis-je faire|quoi faire|je fais quoi|on fait quoi|aide moi|guide moi|objectif|pas compris|comprends pas)\b/.test(text)
}

function isCombatDeescalation(text: string): boolean {
  return /\b(arretez?|stop|paix|treve|cessez?|calmez|on fait la paix|faire la paix|je me rends|pitie|parlemente|negocie|arrangeons nous)\b/.test(text)
}

function isEnemyLocationQuestion(text: string): boolean {
  return /\b(ou sont|ou est|ils sont ou|elles sont ou|position|localisation|emplacement)\b/.test(text) &&
    /\b(gobelins?|ennemis?|monstres?|creatures?|adversaires?|grukk|chef)\b/.test(text)
}

function isAttack(text: string): boolean {
  return /\b(attaques?|attaquer|attques?|attquer|attque|ataques?|ataquer|frappes?|frapper|tapes?|taper|coup|charges?|charger|acheves?|achever|tuer|gorge)\b/.test(text)
}

function isCombatRepeatAttack(text: string): boolean {
  return /\b(recommences?|recommencer|encore|a nouveau|meme chose|continue|vas y|vas-y)\b/.test(text)
}

function isImprovisedTool(text: string): boolean {
  return /\b(tabouret|chaise|table|planche|jambe de table|corde|meuble|outil|objet)\b/.test(text) &&
    /\b(bloquer|barricader|coincer|fabriquer|bricoler|prendre|utiliser|improviser|faire une arme|pieger)\b/.test(text)
}

function isDistraction(text: string): boolean {
  return /\b(diversion|distraire|detourner l attention|faire du bruit|attirer|vacarme|crier|hurler|leurre)\b/.test(text)
}

function isPhysicalTrick(text: string): boolean {
  return /\b(croche[- ]?patte|faire tomber|bouscule|bousculer|poussette|renverse|renverser|desarme|desarmer)\b/.test(text)
}

function isMagicEnvironmental(text: string): boolean {
  return /\b(creation d eau|cree de l eau|creer de l eau|create water|eau|flotte|flaque|feu|fumee|huile|boue|illusion|sort)\b/.test(text) &&
    /\b(cree|creer|creation|invoque|conjure|verse|repand|sous|devant|derriere|sur|dans|bloquer|eteindre|glisser)\b/.test(text)
}

function improvisationTypeForText(text: string): IntentImprovisationType {
  const analysis = analyzeFictionImprovisation(text)
  if (analysis.socialViolation) return 'social_transgression'
  if (isImprovisedTool(text)) return 'improvised_tool_object'
  if (isDistraction(text)) return 'distraction_noise'
  if (isMagicEnvironmental(text) || isPhysicalTrick(text)) return 'environmental_change'
  if (analysis.improvisable) return 'create_fiction_fact'
  return 'non_mechanical_flavor'
}

function buildImproviseOutput(message: string, gameState: GameState, type: IntentImprovisationType, confidence = 0.86): IntentInterpreterOutput {
  const targetName = targetNameFromText(normalizeFrenchText(message), gameState)
  const tags = [type, ...analyzeFictionImprovisation(message).tags].filter(Boolean)
  const canonicalAction: Record<string, unknown> = {
    kind: 'improvise',
    intent: message,
    desiredEffect: message,
    tags,
  }
  if (targetName) canonicalAction.targetName = targetName
  return output({
    intentKind: 'improvise',
    confidence,
    requiresClarification: false,
    canonicalAction,
    improvisation: {
      type,
      persistence: type === 'non_mechanical_flavor' ? 'none' : 'scene',
      tags,
    },
    targetHints: {
      ...(targetName ? { targetName } : {}),
    },
    reasoningSummary: `Action creative routee vers improvise (${type}); le moteur persistera seulement les faits acceptes.`,
  })
}

export function buildIntentInterpreterInputSummary(params: {
  message: string
  gameState: GameState
  recentHistory?: ConversationTurn[]
}): IntentInterpreterInputSummary {
  const { message, gameState, recentHistory = [] } = params
  const surface = gameState.world ? buildSceneSurface(gameState) : null
  return {
    schemaVersion: 1,
    message,
    normalizedMessage: normalizeFrenchText(message),
    state: {
      phase: gameState.phase,
      currentTurn: gameState.currentTurn,
      playerHp: `${gameState.player.hp.current}/${gameState.player.hp.max}`,
      playerConditions: gameState.player.conditions,
      currentRoomId: gameState.currentRoomId,
      currentRoomName: gameState.currentRoomId ? gameState.world?.rooms?.[gameState.currentRoomId]?.name ?? null : null,
      aliveMonsters: Object.values(gameState.monsters)
        .filter(monster => monster.isAlive)
        .map(monster => ({ id: monster.id, name: monster.name, hp: `${monster.hp.current}/${monster.hp.max}` })),
    },
    sceneSurface: surface ? summarizeSceneSurfaceForDebug(surface) : null,
    recentEvents: gameState.world?.eventLog.slice(-6).map(event => ({
      type: event.type,
      targetId: event.targetId,
      outcome: event.outcome,
      summary: event.summary,
    })) ?? [],
    recentHistory: recentHistory.slice(-6).map(turn => ({
      role: turn.role,
      content: turn.content.slice(0, 500),
    })),
  }
}

export function validateIntentInterpreterOutput(value: unknown, source: IntentInterpreterOutput['source'] = 'llm'): IntentInterpreterOutput {
  return IntentInterpreterOutputSchema.parse({
    ...(typeof value === 'object' && value ? value as Record<string, unknown> : {}),
    source,
  })
}

export function interpretPlayerIntentMock(params: {
  message: string
  gameState: GameState
  recentHistory?: ConversationTurn[]
}): IntentInterpreterOutput {
  const { message, gameState } = params
  const text = normalizeFrenchText(message)
  const presentNpc = onePresentNpc(gameState)

  if (isGuidanceRequest(text)) {
    return output({
      intentKind: 'guidance',
      confidence: 0.92,
      requiresClarification: false,
      canonicalAction: null,
      improvisation: null,
      targetHints: {},
      reasoningSummary: 'Le joueur demande les options jouables; aucune mutation moteur.',
    })
  }

  if (gameState.phase === 'combat' && gameState.currentTurn === 'player' && isCombatDeescalation(text)) {
    return output({
      intentKind: 'social_deescalation',
      confidence: 0.9,
      requiresClarification: false,
      canonicalAction: {
        kind: 'social',
        ability: 'cha',
        label: 'Persuasion',
        proficient: true,
        dc: 14,
      },
      improvisation: null,
      targetHints: { targetHint: 'hostile creatures' },
      reasoningSummary: 'Le joueur cherche a desamorcer le combat, pas a attaquer.',
    })
  }

  if (gameState.phase === 'combat' && gameState.currentTurn === 'player' && isCombatRepeatAttack(text)) {
    return output({
      intentKind: 'attack',
      confidence: 0.82,
      requiresClarification: false,
      canonicalAction: {
        kind: 'attack',
        targetHint: 'nearest',
        weaponOrSpell: 'longsword',
      },
      improvisation: null,
      targetHints: { targetHint: 'nearest' },
      reasoningSummary: 'Continuation en combat interpretee comme repetition de l attaque precedente.',
    })
  }

  if (gameState.phase === 'combat' && gameState.currentTurn === 'player' && isAttack(text)) {
    return output({
      intentKind: 'attack',
      confidence: 0.88,
      requiresClarification: false,
      canonicalAction: {
        kind: 'attack',
        targetHint: 'nearest',
        weaponOrSpell: 'longsword',
      },
      improvisation: null,
      targetHints: { targetHint: 'nearest' },
      reasoningSummary: 'Attaque en combat, typo toleree.',
    })
  }

  const earlyWorldKind = mockCanonicalKind(text, gameState)
  if (earlyWorldKind === 'combine_recipe') {
    const worldOutput = buildMockWorldActionOutput(message, gameState, earlyWorldKind)
    if (worldOutput) return worldOutput
  }

  if (isEnemyLocationQuestion(text)) {
    if (presentNpc) {
      return output({
        intentKind: 'ask',
        confidence: 0.84,
        requiresClarification: false,
        canonicalAction: {
          kind: 'ask',
          targetName: presentNpc.name,
          topic: message,
        },
        improvisation: null,
        targetHints: { targetId: presentNpc.id, targetName: presentNpc.name, targetType: 'npc' },
        reasoningSummary: 'Question d information adressee au seul PNJ present.',
      })
    }
    return output({
      intentKind: 'query_state',
      confidence: 0.82,
      requiresClarification: false,
      canonicalAction: null,
      improvisation: null,
      targetHints: {},
      reasoningSummary: 'Question de localisation; ne declenche pas de rencontre hostile.',
    })
  }

  if (presentNpc && /\b(salut|bonjour|bonsoir|hello|je suis|je viens|je cherche|je veux|recuperer|recupere|trouver|trouve|recette|grammy|aide|information|infos?|parles?|parler|discutes?|discuter)\b/.test(text)) {
    const explicitTalk = /\b(parles?|parler|discutes?|discuter)\b/.test(text)
    const npcSpeechKind = explicitTalk
      ? 'talk'
      : maybeDirectQuestion(text) || /\b(recette|grammy|trouver|trouve|chercher|cherche|recuperer|information|infos?)\b/.test(text)
      ? 'ask'
      : 'talk'
    return output({
      intentKind: npcSpeechKind,
      confidence: 0.82,
      requiresClarification: false,
      canonicalAction: {
        kind: npcSpeechKind,
        targetName: presentNpc.name,
        topic: message,
      },
      improvisation: null,
      targetHints: { targetId: presentNpc.id, targetName: presentNpc.name, targetType: 'npc' },
      reasoningSummary: 'Parole naturelle adressee au seul PNJ present.',
    })
  }

  const worldKind = earlyWorldKind
  if (worldKind && worldKind !== 'take') {
    const worldOutput = buildMockWorldActionOutput(message, gameState, worldKind)
    if (worldOutput) return worldOutput
  }

  const moveOutput = buildMockMoveOutput(message, gameState)
  if (moveOutput) return moveOutput

  if (isImprovisedTool(text)) return buildImproviseOutput(message, gameState, 'improvised_tool_object')
  if (isDistraction(text)) return buildImproviseOutput(message, gameState, 'distraction_noise')
  if (isPhysicalTrick(text) || isMagicEnvironmental(text)) return buildImproviseOutput(message, gameState, 'environmental_change')

  const fiction = analyzeFictionImprovisation(message)
  if (fiction.improvisable) {
    return buildImproviseOutput(message, gameState, improvisationTypeForText(text), confidenceLabel(0.78) === 'high' ? 0.82 : 0.78)
  }

  if (worldKind) {
    const worldOutput = buildMockWorldActionOutput(message, gameState, worldKind)
    if (worldOutput) return worldOutput
  }

  if (maybeDirectQuestion(text)) {
    return output({
      intentKind: 'question',
      confidence: 0.64,
      requiresClarification: false,
      canonicalAction: null,
      improvisation: null,
      targetHints: {},
      reasoningSummary: 'Question ou demande de precision; aucune mutation moteur directe.',
    })
  }

  return output({
    intentKind: 'pass_through',
    confidence: 0.35,
    requiresClarification: true,
    clarificationQuestion: "Je ne suis pas sur de l'effet voulu. Tu vises quoi, et tu veux obtenir quoi exactement ?",
    canonicalAction: null,
    improvisation: null,
    targetHints: {},
    reasoningSummary: 'Le mock ne voit pas de plan fiable; le pipeline doit clarifier au lieu de retomber sur le routage regex.',
  })
}
