import type * as Llm from './llm-types'
import { getOpenAIConfig, getOpenAIContextWindow } from './llm-config'
import { trainingFetch } from '../training-fetch'

export interface ContextSize { inputTokens: number; contextWindow: number }
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const count = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0

/** Keep the engine transcript intact; only translate the provider's wire format. */
export function buildOpenAIInput(params: Llm.MessageCreateParamsNonStreaming): Record<string, unknown> {
  const input: Record<string, unknown>[] = []
  for (const message of params.messages) {
    if (typeof message.content === 'string') {
      input.push({ role: message.role, content: message.content })
      continue
    }
    for (const block of message.content) {
      if (block.type === 'text') input.push({ role: message.role, content: block.text })
      else if (block.type === 'tool_use' && message.role === 'assistant') {
        // Stateless Responses must replay encrypted reasoning before its function call.
        if (block.openaiReasoning) input.push(...block.openaiReasoning)
        input.push({ type: 'function_call', call_id: block.id, name: block.name, arguments: JSON.stringify(block.input) })
      } else if (block.type === 'tool_result' && message.role === 'user') {
        const content = typeof block.content === 'string' ? block.content : (block.content ?? []).map(part => part.text).join('\n')
        input.push({ type: 'function_call_output', call_id: block.tool_use_id,
          output: block.is_error ? JSON.stringify({ is_error: true, content }) : content })
      } else throw new Error('OpenAI : bloc de transcript non pris en charge.')
    }
  }
  const choice = params.tool_choice
  const toolChoice = choice?.type === 'tool' ? { type: 'function', name: choice.name }
    : choice?.type === 'any' ? 'required' : choice?.type ?? 'auto'
  return {
    model: params.model, input,
    ...(params.system ? { instructions: typeof params.system === 'string' ? params.system : params.system.map(block => block.text).join('\n\n') } : {}),
    ...(params.tools?.length ? { tools: params.tools.map(tool => ({ type: 'function', name: tool.name,
      description: tool.description, parameters: tool.input_schema, strict: false })),
      tool_choice: toolChoice, parallel_tool_calls: false } : {}),
  }
}

export function buildOpenAIRequest(params: Llm.MessageCreateParamsNonStreaming): Record<string, unknown> {
  if (params.stop_sequences?.length) throw new Error('OpenAI Responses ne prend pas en charge stop_sequences.')
  const effort = process.env.OPENAI_REASONING_EFFORT?.trim()
  return { ...buildOpenAIInput(params), max_output_tokens: params.max_tokens, stream: false, store: false,
    truncation: 'disabled', include: ['reasoning.encrypted_content'],
    ...(effort ? { reasoning: { effort } } : {}),
    ...(params.temperature !== undefined ? { temperature: params.temperature } : {}),
    ...(params.top_p !== undefined ? { top_p: params.top_p } : {}),
  }
}

export function parseOpenAIResponse(value: unknown, params: Llm.MessageCreateParamsNonStreaming): Llm.Message {
  if (!record(value) || !Array.isArray(value.output)) throw new Error('OpenAI : réponse Responses invalide.')
  if (value.status === 'incomplete') throw new Error('OpenAI : sortie incomplète ; augmenter LLM_MAX_TOKENS ou réduire le raisonnement.')
  if (value.status !== 'completed' || value.error) throw new Error('OpenAI : génération non terminée.')
  const content: Llm.ContentBlock[] = []
  const reasoning: Record<string, unknown>[] = []
  const ids = new Set<string>()
  for (const item of value.output) {
    if (!record(item)) throw new Error('OpenAI : élément de sortie invalide.')
    if (item.type === 'reasoning') { reasoning.push(item); continue }
    if (item.type === 'message') {
      if (item.role !== 'assistant' || item.status !== 'completed' || !Array.isArray(item.content)) throw new Error('OpenAI : message assistant invalide.')
      for (const part of item.content) {
        if (!record(part) || part.type !== 'output_text' || typeof part.text !== 'string') throw new Error('OpenAI : contenu assistant refusé ou invalide.')
        if (part.text.trim()) content.push({ type: 'text', text: part.text })
      }
    } else if (item.type === 'function_call') {
      if (item.status !== 'completed' || typeof item.call_id !== 'string' || !item.call_id || ids.has(item.call_id)
        || typeof item.name !== 'string' || typeof item.arguments !== 'string') throw new Error('OpenAI : appel outil invalide.')
      if (!params.tools?.some(tool => tool.name === item.name)) throw new Error('OpenAI : outil non exposé demandé.')
      let input: unknown
      try { input = JSON.parse(item.arguments) } catch { throw new Error('OpenAI : arguments outil JSON invalides.') }
      if (!record(input)) throw new Error('OpenAI : les arguments outil doivent être un objet JSON.')
      ids.add(item.call_id)
      content.push({ type: 'tool_use', id: item.call_id, name: item.name, input })
    } else throw new Error('OpenAI : type de sortie non pris en charge.')
  }
  if (ids.size > 1) throw new Error('OpenAI : appels parallèles refusés pour le moteur à état.')
  const call = content.find((block): block is Llm.ToolUseBlock => block.type === 'tool_use')
  if (call && reasoning.length) call.openaiReasoning = reasoning
  if (params.tool_choice?.type === 'tool' && call?.name !== params.tool_choice.name) throw new Error('OpenAI : outil forcé non respecté.')
  if (params.tool_choice?.type === 'any' && !call) throw new Error('OpenAI : appel outil obligatoire absent.')
  if (params.tool_choice?.type === 'none' && call) throw new Error('OpenAI : appel outil interdit.')
  if (!content.length) throw new Error('OpenAI : réponse vide.')
  const usage = record(value.usage) ? value.usage : {}
  const details = record(usage.input_tokens_details) ? usage.input_tokens_details : {}
  const tokens = count(usage.input_tokens), cached = Math.min(tokens, count(details.cached_tokens))
  return { id: typeof value.id === 'string' ? value.id : 'openai-message', type: 'message', role: 'assistant',
    model: typeof value.model === 'string' ? value.model : params.model, content,
    stop_reason: call ? 'tool_use' : 'end_turn', stop_sequence: null,
    usage: { input_tokens: tokens - cached, cache_read_input_tokens: cached, output_tokens: count(usage.output_tokens) } }
}

async function requestOpenAI(path: string, body: Record<string, unknown>, operation: string): Promise<unknown> {
  const { baseUrl, apiKey, timeout } = getOpenAIConfig()
  let response: Response
  try {
    response = await trainingFetch('openai', `${baseUrl}${path}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body), signal: AbortSignal.timeout(timeout), redirect: 'error',
    }, operation)
  } catch { throw new Error('OpenAI indisponible ou délai de réponse dépassé.') }
  if (!response.ok) {
    // Never forward response bodies, prompts or credentials into public errors.
    if (response.status === 400) {
      let failure: unknown
      try { failure = await response.json() } catch { /* generic error below */ }
      if (record(failure) && record(failure.error) && failure.error.code === 'context_length_exceeded') {
        throw new Error('OpenAI : capacité de contexte du modèle dépassée.')
      }
    }
    throw new Error(`OpenAI : erreur HTTP ${response.status}.`)
  }
  try { return await response.json() } catch { throw new Error('OpenAI : réponse HTTP non JSON.') }
}

export async function measureOpenAIContext(params: Llm.MessageCreateParamsNonStreaming): Promise<ContextSize> {
  const contextWindow = getOpenAIContextWindow(params.model)
  const data = await requestOpenAI('/responses/input_tokens', buildOpenAIInput(params), 'tokenize')
  if (!record(data) || !Number.isSafeInteger(data.input_tokens) || (data.input_tokens as number) < 0) throw new Error('OpenAI : mesure du contexte invalide.')
  return { inputTokens: data.input_tokens as number, contextWindow }
}

export async function createOpenAIMessage(params: Llm.MessageCreateParamsNonStreaming): Promise<Llm.Message> {
  return parseOpenAIResponse(await requestOpenAI('/responses', buildOpenAIRequest(params), 'generation'), params)
}
