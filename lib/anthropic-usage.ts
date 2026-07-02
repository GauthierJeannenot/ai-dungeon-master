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

interface ModelPricePerMTokUsd {
  input: number
  output: number
  cacheWrite5m: number
  cacheWrite1h: number
  cacheRead: number
}

// Tarifs par MTok (USD). Cache : écriture 5m = 1,25× input, 1h = 2× input,
// lecture = 0,1× input. Détection par sous-chaîne du model id — le pipeline
// mélange Haiku (planner/compression) et Sonnet (narration), qui coûte 3× plus
// cher en input et en output : facturer tout au tarif Haiku sous-estimait le
// coût réel d'un facteur ~3-5.
const MODEL_PRICES_PER_MTOK_USD: Array<{ match: RegExp; prices: ModelPricePerMTokUsd }> = [
  { match: /haiku/, prices: { input: 1, output: 5, cacheWrite5m: 1.25, cacheWrite1h: 2, cacheRead: 0.1 } },
  { match: /sonnet/, prices: { input: 3, output: 15, cacheWrite5m: 3.75, cacheWrite1h: 6, cacheRead: 0.3 } },
  { match: /opus/, prices: { input: 5, output: 25, cacheWrite5m: 6.25, cacheWrite1h: 10, cacheRead: 0.5 } },
]

// Modèle inconnu : tarif Sonnet (défaut du DM) plutôt que le moins cher.
const DEFAULT_PRICES = MODEL_PRICES_PER_MTOK_USD[1].prices

function pricesForModel(model: string): ModelPricePerMTokUsd {
  return MODEL_PRICES_PER_MTOK_USD.find(entry => entry.match.test(model))?.prices ?? DEFAULT_PRICES
}

function tokenCount(value: number | null | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function roundUsd(value: number): number {
  return Number(value.toFixed(8))
}

function estimateModelCostUsd(model: string, usage: AnthropicUsage): number {
  const prices = pricesForModel(model)
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
    (inputTokens * prices.input) +
    (outputTokens * prices.output) +
    ((cacheCreation5mInputTokens + unclassifiedCacheCreationTokens) * prices.cacheWrite5m) +
    (cacheCreation1hInputTokens * prices.cacheWrite1h) +
    (cacheReadInputTokens * prices.cacheRead)

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
    estimatedCostUsd: estimateModelCostUsd(model, usage),
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
