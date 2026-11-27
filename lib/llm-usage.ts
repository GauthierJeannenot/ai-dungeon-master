import { logEvent } from './server-logger'
import type { DMLlmUsageSummary } from './types'
import type { Usage } from './dm/llm-types'
export type LlmUsage = Partial<Usage>
export interface LlmUsageLogContext { sessionId?: string; inputMode?: string; clientRequestId?: string }
export interface LlmUsageLogEntry extends LlmUsageLogContext {
  provider: 'openai' | 'vllm'; requestId: string; operation: string; model: string
  inputTokens: number; outputTokens: number; cacheReadInputTokens: number; totalInputTokens: number
  estimatedCostUsd: number; stopReason?: string | null; metadata?: Record<string, unknown>
}
const count = (value: number | null | undefined) => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0
const round = (value: number) => Number(value.toFixed(8))
function rate(name: string): number { return count(Number(process.env[name] ?? 0)) }
export function logLlmUsage(args: LlmUsageLogContext & {
  requestId: string; operation: string; model: string; usage: LlmUsage
  provider?: 'openai' | 'vllm'; stopReason?: string | null; metadata?: Record<string, unknown>
}): LlmUsageLogEntry {
  const { usage, ...context } = args
  const inputTokens = count(usage.input_tokens), outputTokens = count(usage.output_tokens)
  const cacheReadInputTokens = count(usage.cache_read_input_tokens)
  const totalInputTokens = inputTokens + cacheReadInputTokens
  const provider = args.provider ?? 'openai'
  const prefix = provider === 'openai' ? 'OPENAI' : 'VLLM'
  const cachedRate = provider === 'openai' && process.env.OPENAI_CACHED_INPUT_USD_PER_MTOK !== undefined
    ? rate('OPENAI_CACHED_INPUT_USD_PER_MTOK') : rate(`${prefix}_INPUT_USD_PER_MTOK`)
  const entry: LlmUsageLogEntry = { ...context, provider, inputTokens, outputTokens,
    cacheReadInputTokens, totalInputTokens,
    // Optional rates stay explicit, including the cached-input discount.
    estimatedCostUsd: round((inputTokens * rate(`${prefix}_INPUT_USD_PER_MTOK`) + cacheReadInputTokens * cachedRate
      + outputTokens * rate(`${prefix}_OUTPUT_USD_PER_MTOK`)) / 1_000_000) }
  logEvent('info', 'llm.usage', { ...entry })
  return entry
}
export function summarizeLlmUsage(entries: LlmUsageLogEntry[]): DMLlmUsageSummary {
  const summary = entries.reduce((acc, entry) => ({ calls: acc.calls + 1,
    inputTokens: acc.inputTokens + entry.inputTokens, outputTokens: acc.outputTokens + entry.outputTokens,
    cacheReadInputTokens: acc.cacheReadInputTokens + entry.cacheReadInputTokens,
    totalInputTokens: acc.totalInputTokens + entry.totalInputTokens,
    estimatedCostUsd: acc.estimatedCostUsd + entry.estimatedCostUsd }),
    { calls: 0, inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 0, totalInputTokens: 0, estimatedCostUsd: 0 })
  return { ...summary, estimatedCostUsd: round(summary.estimatedCostUsd) }
}
export function logLlmUsageSummary(requestId: string, entries: LlmUsageLogEntry[], metadata?: Record<string, unknown>, context?: LlmUsageLogContext): void {
  if (entries.length) logEvent('info', 'llm.usage_summary', { ...entries[0], ...context, requestId, ...summarizeLlmUsage(entries), metadata })
}
