import { captureExchange } from '@/lib/training-recorder'
import type * as Llm from './llm-types'
import { logEvent } from '@/lib/server-logger'
import { logLlmUsage, type LlmUsage, type LlmUsageLogEntry } from '@/lib/llm-usage'
import type { GameState } from '@/lib/types'
import { getLlmProvider } from './llm-config'
import { createOpenAIMessage, measureOpenAIContext, type ContextSize } from './openai'

// One inference transport, with a deterministic offline mock.
export const LLM_PROVIDER = getLlmProvider()
export const MODEL = process.env.DM_MODEL || 'gpt-5.4-mini'
export const COMPRESS_MODEL = process.env.DM_COMPRESS_MODEL || MODEL

export function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

// Plafond de sortie PAR appel API. Une narration immersive (2-4 phrases) tourne
// autour de 250-500 tokens ; un tool call est négligeable. 1024 laisse ~2× de marge
// sans gaspiller. Le nombre d'appels dépend des événements à résoudre ; la boucle
// s'arrête en cas de stagnation, sans plafond total d'événements par message.
// Surchargeable via LLM_MAX_TOKENS.
export const MAX_TOKENS = parsePositiveInt(process.env.LLM_MAX_TOKENS, 1024)

// 'mock' permet aux tests de tourner sans appel payant. 'live' appelle l'API.
const LLM_MODE = (process.env.LLM_MODE === 'mock' ? 'mock' : 'live') as 'mock' | 'live'
const ALLOW_PAID_LLM = process.env.ALLOW_PAID_LLM !== 'false'

export async function measureLlmContext(params: Llm.MessageCreateParamsNonStreaming): Promise<ContextSize | null> {
  if (LLM_MODE === 'mock' || !ALLOW_PAID_LLM) return null
  return measureOpenAIContext(params)
}

export interface LlmCallContext {
  requestId: string
  sessionId?: string
  clientRequestId?: string
  inputMode: string
  operation: string
  model?: string
  usageLog: LlmUsageLogEntry[]
  playerMessage?: string
  gameState?: GameState
  tools?: Llm.Tool[]
  availableTools?: Llm.Tool[]
}

function recordUsage(message: Llm.Message, context: LlmCallContext, stopReason?: string | null): void {
  const usage = (message.usage ?? {}) as LlmUsage
  const entry = logLlmUsage({
    requestId: context.requestId,
    sessionId: context.sessionId,
    inputMode: context.inputMode,
    clientRequestId: context.clientRequestId,
    operation: context.operation,
    model: context.model ?? MODEL,
    usage,
    provider: LLM_PROVIDER,
    stopReason: stopReason ?? message.stop_reason,
  })
  context.usageLog.push(entry)
}

export async function createLlmMessage(
  params: Llm.MessageCreateParamsNonStreaming, context: LlmCallContext
): Promise<Llm.Message> {
  return captureExchange('llm', { params, operation: context.operation, provider: LLM_PROVIDER,
    mode: LLM_MODE }, () => createRecordedLlmMessage(params, context))
}

async function createRecordedLlmMessage(
  params: Llm.MessageCreateParamsNonStreaming,
  context: LlmCallContext
): Promise<Llm.Message> {
  logEvent('info', 'llm.call.start', {
    requestId: context.requestId,
    sessionId: context.sessionId,
    operation: context.operation,
    mode: LLM_MODE,
    provider: LLM_PROVIDER,
  })

  if (LLM_MODE === 'mock') {
    const { createMockLlmMessage } = await import('./mock-llm')
    const message = createMockLlmMessage(params, context)
    recordUsage(message, context)
    return message
  }

  if (!ALLOW_PAID_LLM) {
    throw new Error('Appels LLM payants désactivés (ALLOW_PAID_LLM=false). Utilise LLM_MODE=mock.')
  }

  const message = await createOpenAIMessage(params)
  recordUsage(message, context)
  return message
}
