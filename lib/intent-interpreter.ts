import { z } from 'zod'
import { normalizeFrenchText } from './dm-intent'
import { analyzeFictionImprovisation } from './fiction-intent'
import { buildSceneSurface, summarizeSceneSurfaceForDebug } from './scene-surface'
import type { ConversationTurn, GameState } from './types'

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
  targetHints: z.object({
    targetName: z.string().optional(),
    targetId: z.string().optional(),
    targetType: z.string().optional(),
    targetHint: z.string().optional(),
    candidates: z.array(z.string()).optional(),
  }).default({}),
  reasoningSummary: z.string().max(240),
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

  if (presentNpc && /\b(salut|bonjour|bonsoir|hello|je suis|je viens|je cherche|je veux|recuperer|recupere|trouver|trouve|recette|grammy|aide|information|infos?)\b/.test(text)) {
    const npcSpeechKind = maybeDirectQuestion(text) || /\b(recette|grammy|trouver|trouve|chercher|cherche|recuperer|information|infos?)\b/.test(text)
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

  if (isImprovisedTool(text)) return buildImproviseOutput(message, gameState, 'improvised_tool_object')
  if (isDistraction(text)) return buildImproviseOutput(message, gameState, 'distraction_noise')
  if (isPhysicalTrick(text) || isMagicEnvironmental(text)) return buildImproviseOutput(message, gameState, 'environmental_change')

  const fiction = analyzeFictionImprovisation(message)
  if (fiction.improvisable) {
    return buildImproviseOutput(message, gameState, improvisationTypeForText(text), confidenceLabel(0.78) === 'high' ? 0.82 : 0.78)
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
    requiresClarification: false,
    canonicalAction: null,
    improvisation: null,
    targetHints: {},
    reasoningSummary: 'Le mock ne voit pas de plan fiable; le pipeline conserve le routage existant.',
  })
}
