import type Anthropic from '@anthropic-ai/sdk'
import type { GameState } from './types'
import { normalizeFrenchText } from './dm-intent'
import {
  GAME_ACTION_KINDS,
  buildIntentForKind,
  classifyPlayerAction,
  type GameActionIntent,
  type GameActionKind,
} from './game-actions'

export const ACTION_PARSER_TOOL_NAME = 'report_player_intents'

export interface ParsedIntentSpec {
  kind: GameActionKind
  target?: string
}

/**
 * Tool Claude appelle pour déclarer la/les intentions de jeu détectées dans
 * l'action libre du joueur, dans l'ordre d'exécution. Une seule phrase peut
 * contenir plusieurs intentions (ex: « je vais parler aux dryades » = se
 * déplacer vers les dryades puis engager la discussion).
 */
export const ACTION_PARSER_TOOL: Anthropic.Tool = {
  name: ACTION_PARSER_TOOL_NAME,
  description:
    "Déclare la ou les intentions de jeu (D&D 5e) contenues dans l'action du joueur, dans l'ordre d'exécution. " +
    "Une seule phrase peut contenir plusieurs intentions (ex: 'je vais parler aux dryades' = move puis social).",
  input_schema: {
    type: 'object',
    properties: {
      intents: {
        type: 'array',
        minItems: 1,
        maxItems: 3,
        description: "Liste ordonnée (1 à 3) des intentions détectées dans le message du joueur.",
        items: {
          type: 'object',
          properties: {
            kind: {
              type: 'string',
              enum: GAME_ACTION_KINDS,
              description: "Primitive de jeu correspondant à cette intention.",
            },
            target: {
              type: 'string',
              description: "Cible optionnelle de l'intention (PNJ, objet, lieu, direction ou coordonnées).",
            },
          },
          required: ['kind'],
        },
      },
    },
    required: ['intents'],
  },
}

export function buildActionParserSystemPrompt(): string {
  return [
    "Tu es l'analyseur d'intentions d'un moteur de jeu de rôle (D&D 5e) en français.",
    "Tu reçois le message libre du joueur et un résumé de l'état de jeu.",
    "Ton unique tâche: appeler le tool report_player_intents avec la/les intentions du joueur, DANS L'ORDRE D'EXÉCUTION.",
    `Primitives valides: ${GAME_ACTION_KINDS.join(', ')}.`,
    "Une phrase peut contenir plusieurs intentions enchaînées. Exemple: « je vais parler aux dryades » => [move (cible: dryades), social (cible: dryades)].",
    "Autre exemple: « je fonce sur le gobelin et je le frappe » => [move, attack].",
    "N'invente jamais une intention absente du message. Pour une simple question sur l'état du jeu, utilise query_state; pour une simple observation/description, utilise observe.",
    "Si rien de mécanique n'est demandé, retourne une seule intention 'unknown' ou 'observe'.",
    "Réponds UNIQUEMENT via le tool, sans aucun texte libre.",
  ].join('\n')
}

export function buildActionParserUserPrompt(message: string, gameState: GameState): string {
  const aliveMonsters = Object.values(gameState.monsters).filter(monster => monster.isAlive)
  return [
    `Phase: ${gameState.phase}`,
    `Tour courant: ${gameState.currentTurn ?? 'aucun'}`,
    `Salle actuelle: ${gameState.currentRoomId ?? 'inconnue'}`,
    `PV joueur: ${gameState.player.hp.current}/${gameState.player.hp.max}`,
    `Monstres vivants: ${aliveMonsters.length}${aliveMonsters.length > 0 ? ` (${aliveMonsters.map(m => m.name).join(', ')})` : ''}`,
    '',
    `Message du joueur: "${message}"`,
  ].join('\n')
}

/**
 * Convertit la réponse tool de Claude en une liste de GameActionIntent
 * complets. Retourne [] si la réponse ne contient pas d'intentions valides
 * (l'appelant bascule alors sur le fallback regex).
 */
export function intentsFromParserMessage(
  response: Anthropic.Message,
  gameState: GameState,
  normalizedText: string
): GameActionIntent[] {
  const toolBlock = response.content.find(
    (block): block is Anthropic.ToolUseBlock =>
      block.type === 'tool_use' && block.name === ACTION_PARSER_TOOL_NAME
  )
  if (!toolBlock) return []

  const input = toolBlock.input as { intents?: Array<{ kind?: unknown }> } | undefined
  if (!input || !Array.isArray(input.intents)) return []

  const seen = new Set<GameActionKind>()
  const intents: GameActionIntent[] = []
  for (const spec of input.intents) {
    const kind = spec?.kind as GameActionKind
    if (!kind || !GAME_ACTION_KINDS.includes(kind) || seen.has(kind)) continue
    seen.add(kind)
    intents.push(buildIntentForKind(kind, gameState, normalizedText))
  }
  return intents
}

/**
 * Classifieur déterministe utilisé en LLM_MODE=mock. Il s'appuie sur le parser
 * regex existant pour rester cohérent avec les tests, et ajoute une seconde
 * intention sociale quand le message combine déplacement + conversation
 * (ex: « je vais parler aux dryades »).
 */
export function mockReportedIntents(message: string, gameState: GameState): ParsedIntentSpec[] {
  const primary = classifyPlayerAction(message, gameState)
  const text = normalizeFrenchText(message)
  const specs: ParsedIntentSpec[] = [{ kind: primary.kind }]

  const movementVerb = /\b(vais|va|aller|vers|rejoindre|rejoins|approche|approcher|avance|avancer)\b/.test(text)
  const socialVerb = /\b(parler|parle|discuter|discute|demander|demande|negoci|negocier|convaincre|convaincs|saluer|salue|adresser)\b/.test(text)
  const observeVerb = /\b(voir|regarder?|regarde|observer?|observe|examiner?|examine|inspecter?|inspecte|decouvrir)\b/.test(text)
  if (primary.kind === 'move' && movementVerb && socialVerb) {
    specs.push({ kind: 'social' })
  } else if (primary.kind === 'move' && observeVerb) {
    specs.push({ kind: 'observe' })
  }

  return specs
}
