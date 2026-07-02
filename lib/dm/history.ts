import type Anthropic from '@anthropic-ai/sdk'
import type { ConversationTurn } from '@/lib/types'
import { COMPRESS_MODEL, createLlmMessage, parsePositiveInt, type LlmCallContext } from './llm'
import { historyToMessages } from './prompts'

// ─────────────────────────────────────────────────────────────────────────────
// Historique de conversation : compression des anciens échanges en résumé
// factuel (Haiku) pour borner le contexte envoyé au LLM à chaque tour.
// ─────────────────────────────────────────────────────────────────────────────

// Historique récent gardé verbatim avant compression.
export const HISTORY_KEEP_RECENT = parsePositiveInt(process.env.LLM_HISTORY_KEEP_RECENT, 10)
// Seuil (caractères) des anciens messages déclenchant une compression.
const HISTORY_COMPRESS_THRESHOLD_CHARS = parsePositiveInt(process.env.LLM_HISTORY_COMPRESS_THRESHOLD_CHARS, 4000)

async function compressHistory(
  oldTurns: ConversationTurn[],
  existingSummary: string | undefined,
  context: LlmCallContext
): Promise<string> {
  const transcript = oldTurns.map(turn => `${turn.role === 'player' ? 'Joueur' : 'MJ'}: ${turn.content}`).join('\n')
  const prompt = `Résume en un court paragraphe (français) les événements clés de cette partie de D&D, en conservant les faits importants (lieux visités, PNJ rencontrés, objets obtenus, quêtes en cours, conséquences). Sois factuel et concis.

${existingSummary ? `Résumé existant:\n${existingSummary}\n\n` : ''}Échanges à intégrer:\n${transcript}`

  const message = await createLlmMessage(
    {
      model: COMPRESS_MODEL,
      max_tokens: 300,
      messages: [{ role: 'user', content: prompt }],
    },
    { ...context, operation: 'history.compress', model: COMPRESS_MODEL }
  )

  const summary = message.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map(block => block.text)
    .join('\n')
    .trim()

  return summary || existingSummary || ''
}

export interface ProcessedHistory {
  messages: Anthropic.MessageParam[]
  summaryContext?: string
  compressed: boolean
}

export async function processHistory(
  history: ConversationTurn[],
  summaryContext: string | undefined,
  context: LlmCallContext
): Promise<ProcessedHistory> {
  if (history.length <= HISTORY_KEEP_RECENT) {
    return { messages: historyToMessages(history), summaryContext, compressed: false }
  }

  const oldTurns = history.slice(0, history.length - HISTORY_KEEP_RECENT)
  const recent = history.slice(-HISTORY_KEEP_RECENT)
  const oldChars = oldTurns.reduce((sum, turn) => sum + turn.content.length, 0)

  if (oldChars < HISTORY_COMPRESS_THRESHOLD_CHARS) {
    return { messages: historyToMessages(history), summaryContext, compressed: false }
  }

  const newSummary = await compressHistory(oldTurns, summaryContext, context)
  return { messages: historyToMessages(recent), summaryContext: newSummary, compressed: true }
}
