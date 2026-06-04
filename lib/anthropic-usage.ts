import { logEvent } from './server-logger'
import type { DMLlmUsageSummary } from './types'

interface CacheCreationUsage {
  ephemeral_5m_input_tokens?: number | null
  ephemeral_1h_input_tokens?: number | null
}

export interface AnthropicUsage {
  input_tokens?: number | null
  output_tokens?: number | null
  cache_creation_input_tokens?: number | null
  cache_read_input_tokens?: number | null
  cache_creation?: CacheCreationUsage | null
  service_tier?: string | null
  inference_geo?: string | null
}

export interface AnthropicUsageLogContext {
  sessionId?: string
  inputMode?: string
  clientRequestId?: string
}

export interface AnthropicUsageLogEntry extends AnthropicUsageLogContext {
  requestId: string
  operation: string
  model: string
  inputTokens: number
  outputTokens: number
  cacheCreationInputTokens: number
  cacheCreation5mInputTokens: number
  cacheCreation1hInputTokens: number
  cacheReadInputTokens: number
  totalInputTokens: number
  estimatedCostUsd: number
  stopReason?: string | null
  serviceTier?: string | null
  inferenceGeo?: string | null
  metadata?: Record<string, unknown>
}

const HAIKU_4_5_PRICE_PER_MTOK_USD = {
  input: 1,
  output: 5,
  cacheWrite5m: 1.25,
  cacheWrite1h: 2,
  cacheRead: 0.1,
}

function tokenCount(value: number | null | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function roundUsd(value: number): number {
  return Number(value.toFixed(8))
}

function estimateHaiku45CostUsd(usage: AnthropicUsage): number {
  const inputTokens = tokenCount(usage.input_tokens)
  const outputTokens = tokenCount(usage.output_tokens)
  const cacheReadInputTokens = tokenCount(usage.cache_read_input_tokens)
  const cacheCreationInputTokens = tokenCount(usage.cache_creation_input_tokens)

  const cacheCreation5mInputTokens = tokenCount(usage.cache_creation?.ephemeral_5m_input_tokens)
  const cacheCreation1hInputTokens = tokenCount(usage.cache_creation?.ephemeral_1h_input_tokens)
  const unclassifiedCacheCreationTokens = Math.max(
    0,
    cacheCreationInputTokens - cacheCreation5mInputTokens - cacheCreation1hInputTokens
  )

  const cost =
    (inputTokens * HAIKU_4_5_PRICE_PER_MTOK_USD.input) +
    (outputTokens * HAIKU_4_5_PRICE_PER_MTOK_USD.output) +
    ((cacheCreation5mInputTokens + unclassifiedCacheCreationTokens) * HAIKU_4_5_PRICE_PER_MTOK_USD.cacheWrite5m) +
    (cacheCreation1hInputTokens * HAIKU_4_5_PRICE_PER_MTOK_USD.cacheWrite1h) +
    (cacheReadInputTokens * HAIKU_4_5_PRICE_PER_MTOK_USD.cacheRead)

  return roundUsd(cost / 1_000_000)
}

export function logAnthropicUsage({
  requestId,
  sessionId,
  inputMode,
  clientRequestId,
  operation,
  model,
  usage,
  stopReason,
  metadata,
}: {
  requestId: string
  sessionId?: string
  inputMode?: string
  clientRequestId?: string
  operation: string
  model: string
  usage: AnthropicUsage
  stopReason?: string | null
  metadata?: Record<string, unknown>
}): AnthropicUsageLogEntry {
  const inputTokens = tokenCount(usage.input_tokens)
  const outputTokens = tokenCount(usage.output_tokens)
  const cacheCreationInputTokens = tokenCount(usage.cache_creation_input_tokens)
  const cacheCreation5mInputTokens = tokenCount(usage.cache_creation?.ephemeral_5m_input_tokens)
  const cacheCreation1hInputTokens = tokenCount(usage.cache_creation?.ephemeral_1h_input_tokens)
  const cacheReadInputTokens = tokenCount(usage.cache_read_input_tokens)

  const entry: AnthropicUsageLogEntry = {
    requestId,
    sessionId,
    inputMode,
    clientRequestId,
    operation,
    model,
    inputTokens,
    outputTokens,
    cacheCreationInputTokens,
    cacheCreation5mInputTokens,
    cacheCreation1hInputTokens,
    cacheReadInputTokens,
    totalInputTokens: inputTokens + cacheCreationInputTokens + cacheReadInputTokens,
    estimatedCostUsd: estimateHaiku45CostUsd(usage),
    stopReason,
    serviceTier: usage.service_tier,
    inferenceGeo: usage.inference_geo,
    metadata,
  }

  logEvent('info', 'anthropic.usage', { ...entry })
  return entry
}

export function logAnthropicUsageSummary(
  requestId: string,
  entries: AnthropicUsageLogEntry[],
  metadata?: Record<string, unknown>,
  context?: AnthropicUsageLogContext
): void {
  if (entries.length === 0) return

  const summary = entries.reduce(
    (acc, entry) => ({
      calls: acc.calls + 1,
      inputTokens: acc.inputTokens + entry.inputTokens,
      outputTokens: acc.outputTokens + entry.outputTokens,
      cacheCreationInputTokens: acc.cacheCreationInputTokens + entry.cacheCreationInputTokens,
      cacheReadInputTokens: acc.cacheReadInputTokens + entry.cacheReadInputTokens,
      totalInputTokens: acc.totalInputTokens + entry.totalInputTokens,
      estimatedCostUsd: acc.estimatedCostUsd + entry.estimatedCostUsd,
    }),
    {
      calls: 0,
      inputTokens: 0,
      outputTokens: 0,
      cacheCreationInputTokens: 0,
      cacheReadInputTokens: 0,
      totalInputTokens: 0,
      estimatedCostUsd: 0,
    }
  )

  const firstEntry = entries[0]
  logEvent('info', 'anthropic.usage_summary', {
    requestId,
    sessionId: context?.sessionId ?? firstEntry.sessionId,
    inputMode: context?.inputMode ?? firstEntry.inputMode,
    clientRequestId: context?.clientRequestId ?? firstEntry.clientRequestId,
    ...summary,
    estimatedCostUsd: roundUsd(summary.estimatedCostUsd),
    metadata,
  })
}

export function summarizeAnthropicUsage(entries: AnthropicUsageLogEntry[]): DMLlmUsageSummary {
  const summary = entries.reduce(
    (acc, entry) => ({
      calls: acc.calls + 1,
      inputTokens: acc.inputTokens + entry.inputTokens,
      outputTokens: acc.outputTokens + entry.outputTokens,
      cacheCreationInputTokens: acc.cacheCreationInputTokens + entry.cacheCreationInputTokens,
      cacheReadInputTokens: acc.cacheReadInputTokens + entry.cacheReadInputTokens,
      totalInputTokens: acc.totalInputTokens + entry.totalInputTokens,
      estimatedCostUsd: acc.estimatedCostUsd + entry.estimatedCostUsd,
    }),
    {
      calls: 0,
      inputTokens: 0,
      outputTokens: 0,
      cacheCreationInputTokens: 0,
      cacheReadInputTokens: 0,
      totalInputTokens: 0,
      estimatedCostUsd: 0,
    }
  )

  return {
    ...summary,
    estimatedCostUsd: roundUsd(summary.estimatedCostUsd),
  }
}
