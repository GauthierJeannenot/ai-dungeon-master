import type * as Llm from '@/lib/dm/llm-types'
import type { ConversationTurn } from '@/lib/types'
import { COMPRESS_MODEL, createLlmMessage, measureLlmContext, parsePositiveInt, type LlmCallContext } from './llm'
import { historyToMessages } from './prompts'
import { logEvent } from '@/lib/server-logger'

// ─────────────────────────────────────────────────────────────────────────────
// Historique de conversation : compression des anciens échanges en résumé
// factuel pour borner le contexte envoyé au LLM à chaque tour.
// ─────────────────────────────────────────────────────────────────────────────

// Cible de conservation verbatim ; la pression de contexte peut la réduire.
export const HISTORY_KEEP_RECENT = parsePositiveInt(process.env.LLM_HISTORY_KEEP_RECENT, 10)
// Seuil (caractères) des anciens messages déclenchant une compression.
const HISTORY_COMPRESS_THRESHOLD_CHARS = parsePositiveInt(process.env.LLM_HISTORY_COMPRESS_THRESHOLD_CHARS, 4000)

async function compressHistory(
  oldTurns: ConversationTurn[],
  existingSummary: string | undefined,
  context: LlmCallContext
): Promise<string> {
  const transcript = oldTurns.map(turn => `${turn.role === 'player' ? 'Joueur' : 'MJ'}: ${turn.content}`).join('\n')
  const prompt = `Résume en un court paragraphe (français) les événements clés de cette partie de D&D, en conservant les faits importants (lieux visités, PNJ rencontrés, objets obtenus OU déposés avec leur emplacement, quêtes en cours, conséquences, et tout FAIT DURABLE établi dans la fiction — par exemple un élément d'environnement modifié par un sort ou une action). Distingue les intentions déclarées des résultats réellement résolus. Distingue aussi les informations effectivement découvertes par le personnage des hypothèses et des apartés omniscients du MJ. Ne transforme jamais une prédiction, un objectif caché ou une conséquence future conditionnelle en événement accompli ou en connaissance acquise ; écarte ces spoilers du résumé des faits établis. Une information nécessitant un jet reste inconnue sans réussite confirmée du jet correspondant : ne l'inscris pas comme acquise à partir d'un échec ou d'un aparté. Une confidence refusée reste inconnue : si le narrateur a divulgué ce qu'un PNJ sait mais refuse de dire, ou ce que le personnage n'a pas appris après un échec, conserve seulement le refus observable et écarte le contenu secret de cette confidence. Ne rééquipe pas un objet laissé derrière. L'état moteur actuel prime sur le résumé. Sois factuel et concis.

${existingSummary ? `Résumé existant:\n${existingSummary}\n\n` : ''}Échanges à intégrer:\n${transcript}`

  const params: Llm.MessageCreateParamsNonStreaming = {
    model: COMPRESS_MODEL,
    max_tokens: parsePositiveInt(process.env.LLM_COMPRESS_MAX_TOKENS, 300),
    messages: [{ role: 'user', content: prompt }],
  }
  const size = await measureLlmContext(params)
  if (size && size.inputTokens + params.max_tokens > size.contextWindow) {
    // Résumer par morceaux chronologiques : l'appel de compression doit lui
    // aussi rentrer dans la fenêtre. Aucun texte ancien n'est supprimé sans résumé.
    if (oldTurns.length > 1) {
      const middle = Math.floor(oldTurns.length / 2)
      const first = await compressHistory(oldTurns.slice(0, middle), existingSummary, context)
      return compressHistory(oldTurns.slice(middle), first, context)
    }
    if (oldTurns.length === 1 && oldTurns[0].content.length > 256) {
      const chars = Array.from(oldTurns[0].content)
      const middle = Math.floor(chars.length / 2)
      const first = await compressHistory([{ ...oldTurns[0], content: chars.slice(0, middle).join('') }], existingSummary, context)
      return compressHistory([{ ...oldTurns[0], content: chars.slice(middle).join('') }], first, context)
    }
    if (existingSummary && existingSummary.length > 256) {
      const first = await compressHistory([{ role: 'dm', content: existingSummary }], undefined, context)
      if (first.length >= existingSummary.length) throw new Error('Le résumé reste trop volumineux pour le modèle.')
      return compressHistory(oldTurns, first, context)
    }
    throw new Error('Le contexte fixe dépasse la capacité du modèle de résumé.')
  }
  const message = await createLlmMessage(
    params,
    { ...context, operation: 'history.compress', model: COMPRESS_MODEL }
  )

  const summary = message.content
    .filter((block): block is Llm.TextBlock => block.type === 'text')
    .map(block => block.text)
    .join('\n')
    .trim()

  if (message.stop_reason !== 'end_turn' || message.content.some(block => block.type === 'tool_use') || !summary) {
    throw new Error('La compression de l’historique n’a pas produit de résumé complet.')
  }
  return summary
}

export interface ProcessedHistory {
  messages: Llm.MessageParam[]
  summaryContext?: string
  compressed: boolean
  retainedHistory: ConversationTurn[]
}

export type HistoryBudget = (messages: Llm.MessageParam[], summary: string | undefined, hasHistory: boolean) => Promise<boolean>

export function historyPromptMessages(messages: Llm.MessageParam[], summary?: string): Llm.MessageParam[] {
  return summary?.trim()
    ? [{ role: 'user', content: `## RÉSUMÉ DES ÉVÉNEMENTS PRÉCÉDENTS\n${summary.trim()}\nL'état moteur actuel et les résultats outils priment sur ce résumé.` }, ...messages]
    : [...messages]
}

export async function processHistory(
  history: ConversationTurn[],
  summaryContext: string | undefined,
  context: LlmCallContext,
  budget?: HistoryBudget,
): Promise<ProcessedHistory> {
  let retainedHistory = history
  let compressed = false
  let summaryRecompressed = false
  while (true) {
    const messages = historyToMessages(retainedHistory)
    const pressured = budget ? !(await budget(messages, summaryContext, retainedHistory.length > 0)) : false
    const oldCount = Math.max(0, retainedHistory.length - HISTORY_KEEP_RECENT)
    const oldChars = retainedHistory.slice(0, oldCount).reduce((sum, turn) => sum + turn.content.length, 0)
    if (!pressured && oldChars < HISTORY_COMPRESS_THRESHOLD_CHARS) {
      return { messages, summaryContext, compressed, retainedHistory }
    }
    if (!retainedHistory.length) {
      if (summaryContext && !summaryRecompressed) {
        summaryContext = await compressHistory([], summaryContext, context)
        summaryRecompressed = true
        compressed = true
        continue
      }
      throw new Error('Le contexte du tour courant dépasse la capacité du modèle, même après compression de l’historique.')
    }
    let removeCount = pressured
      ? Math.max(oldCount, Math.ceil(retainedHistory.length / 2)) : oldCount
    // Ne jamais garder une réponse MJ en séparant sa demande joueur.
    if (retainedHistory[removeCount]?.role === 'dm' && retainedHistory[removeCount - 1]?.role === 'player') removeCount++
    summaryContext = await compressHistory(retainedHistory.slice(0, removeCount), summaryContext, context)
    retainedHistory = retainedHistory.slice(removeCount)
    compressed = true
    logEvent('info', 'dm.history.compressed', { requestId: context.requestId, sessionId: context.sessionId,
      removedTurns: removeCount, retainedTurns: retainedHistory.length, reason: pressured ? 'context_budget' : 'history_size' })
  }
}
