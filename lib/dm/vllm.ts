import type Anthropic from '@anthropic-ai/sdk'
import { getVllmEndpoint } from './llm-config'
import { getRunpodConfig } from '../runpod-config'
import { managedPodBaseUrl } from '../runpod-pod-store'

interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  tool_call_id?: string
  tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

// Le contrat interne reste celui de Messages. Cette frontière traduit les
// échanges en Chat Completions sans transmettre les marqueurs cache Anthropic.
export function buildVllmRequest(params: Anthropic.MessageCreateParamsNonStreaming): Record<string, unknown> {
  const messages: ChatMessage[] = []
  if (params.system) {
    messages.push({ role: 'system', content: typeof params.system === 'string'
      ? params.system : params.system.map(block => block.text).join('\n\n') })
  }
  for (const message of params.messages) {
    if (typeof message.content === 'string') {
      messages.push({ role: message.role, content: message.content })
      continue
    }
    let text: string[] = []
    const calls: NonNullable<ChatMessage['tool_calls']> = []
    for (const block of message.content) {
      if (block.type === 'text') text.push(block.text)
      else if (block.type === 'tool_use' && message.role === 'assistant') {
        calls.push({ id: block.id, type: 'function', function: { name: block.name, arguments: JSON.stringify(block.input) } })
      } else if (block.type === 'tool_result' && message.role === 'user') {
        if (text.length) {
          messages.push({ role: 'user', content: text.join('\n\n') })
          text = []
        }
        const content = typeof block.content === 'string' ? block.content
          : (block.content ?? []).map(part => {
            if (part.type !== 'text') throw new Error('vLLM : résultat outil non textuel non pris en charge.')
            return part.text
          }).join('\n')
        messages.push({ role: 'tool', tool_call_id: block.tool_use_id,
          content: block.is_error ? JSON.stringify({ is_error: true, content }) : content })
      } else {
        throw new Error(`vLLM : bloc ${block.type} non pris en charge.`)
      }
    }
    if (text.length || calls.length) {
      messages.push({ role: message.role, content: text.length ? text.join('\n\n') : null,
        ...(calls.length ? { tool_calls: calls } : {}) })
    }
  }
  const tools = params.tools?.map(tool => {
    if (!('input_schema' in tool)) throw new Error('vLLM : seul un outil de fonction est pris en charge.')
    return { type: 'function', function: { name: tool.name, description: tool.description, parameters: tool.input_schema } }
  })
  const choice = params.tool_choice
  const toolChoice = choice?.type === 'tool' ? { type: 'function', function: { name: choice.name } }
    : choice?.type === 'any' ? 'required' : choice?.type ?? 'auto'
  return {
    model: params.model, messages, max_tokens: params.max_tokens, stream: false,
    // Mode instruct pour respecter aussi les petits budgets planner/résumé.
    chat_template_kwargs: { enable_thinking: false },
    ...(params.temperature !== undefined ? { temperature: params.temperature } : {}),
    ...(params.top_p !== undefined ? { top_p: params.top_p } : {}),
    ...(params.stop_sequences?.length ? { stop: params.stop_sequences } : {}),
    ...(tools?.length ? { tools, tool_choice: toolChoice, parallel_tool_calls: false } : {}),
  }
}

function count(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0
}

export function parseVllmResponse(value: unknown, params: Anthropic.MessageCreateParamsNonStreaming): Anthropic.Message {
  if (!isRecord(value) || !Array.isArray(value.choices) || value.choices.length !== 1) {
    throw new Error('vLLM : réponse Chat Completions invalide.')
  }
  const choice: unknown = value.choices[0]
  if (!isRecord(choice) || !isRecord(choice.message) || choice.message.role !== 'assistant') {
    throw new Error('vLLM : message assistant invalide.')
  }
  if (choice.finish_reason === 'length') {
    throw new Error('vLLM : sortie tronquée ; augmenter LLM_MAX_TOKENS ou vérifier le mode instruct.')
  }
  if (choice.finish_reason !== 'stop' && choice.finish_reason !== 'tool_calls') {
    throw new Error('vLLM : raison de fin non prise en charge.')
  }
  const content: Anthropic.ContentBlock[] = []
  const message = choice.message
  if (message.content !== null && message.content !== undefined && typeof message.content !== 'string') {
    throw new Error('vLLM : contenu assistant invalide.')
  }
  if (typeof message.content === 'string' && message.content.trim()) {
    if (/<\/?think\b/i.test(message.content)) throw new Error('vLLM : raisonnement présent dans la narration ; vérifier le parser qwen3.')
    content.push({ type: 'text', text: message.content, citations: null })
  }
  if (message.tool_calls !== undefined && message.tool_calls !== null && !Array.isArray(message.tool_calls)) {
    throw new Error('vLLM : liste des appels outils invalide.')
  }
  const calls: unknown[] = message.tool_calls ?? []
  const ids = new Set<string>()
  for (const call of calls) {
    if (!isRecord(call) || call.type !== 'function' || typeof call.id !== 'string' || !call.id || ids.has(call.id)
      || !isRecord(call.function) || typeof call.function.name !== 'string' || typeof call.function.arguments !== 'string') {
      throw new Error('vLLM : appel outil invalide.')
    }
    const name = call.function.name
    if (!params.tools?.some(tool => tool.name === name)) throw new Error('vLLM : outil non exposé demandé.')
    let input: unknown
    try { input = JSON.parse(call.function.arguments) } catch { throw new Error('vLLM : arguments outil JSON invalides.') }
    if (!isRecord(input)) throw new Error('vLLM : les arguments outil doivent être un objet JSON.')
    ids.add(call.id)
    content.push({ type: 'tool_use', id: call.id, name, input, caller: { type: 'direct' } })
  }
  if ((choice.finish_reason === 'tool_calls') !== (calls.length > 0)) {
    throw new Error('vLLM : fin de réponse incohérente avec les appels outils.')
  }
  if (calls.length > 1) throw new Error('vLLM : appels parallèles refusés pour le moteur à état.')
  if (params.tool_choice?.type === 'tool' && (calls.length !== 1
    || (content.find(block => block.type === 'tool_use') as Anthropic.ToolUseBlock | undefined)?.name !== params.tool_choice.name)) {
    throw new Error('vLLM : outil forcé non respecté.')
  }
  if (params.tool_choice?.type === 'any' && !calls.length) throw new Error('vLLM : appel outil obligatoire absent.')
  if (params.tool_choice?.type === 'none' && calls.length) throw new Error('vLLM : appel outil interdit.')
  if (!content.length) throw new Error('vLLM : réponse vide.')
  const usage = isRecord(value.usage) ? value.usage : {}
  const details = isRecord(usage.prompt_tokens_details) ? usage.prompt_tokens_details : {}
  const promptTokens = count(usage.prompt_tokens)
  const cached = Math.min(promptTokens, count(details.cached_tokens))
  return {
    id: typeof value.id === 'string' ? value.id : 'vllm-message',
    type: 'message', role: 'assistant', model: params.model, content,
    stop_reason: calls.length ? 'tool_use' : 'end_turn', stop_sequence: null,
    container: null, stop_details: null,
    usage: { input_tokens: promptTokens - cached, output_tokens: count(usage.completion_tokens),
      cache_creation_input_tokens: 0, cache_read_input_tokens: cached } as Anthropic.Usage,
  }
}

export async function createVllmMessage(params: Anthropic.MessageCreateParamsNonStreaming): Promise<Anthropic.Message> {
  const managed = getRunpodConfig()
  const endpoint = managed?.mode === 'pod' ? `${await managedPodBaseUrl(managed)}/chat/completions` : getVllmEndpoint()
  const apiKey = process.env.VLLM_API_KEY?.trim()
  if (!apiKey) throw new Error('VLLM_API_KEY manquante (clé du serveur vLLM, pas la clé Runpod).')
  const timeout = Number(process.env.VLLM_TIMEOUT_MS ?? 45000)
  if (!Number.isInteger(timeout) || timeout <= 0) throw new Error('VLLM_TIMEOUT_MS doit être un entier positif.')
  const body = JSON.stringify(buildVllmRequest(params))
  let response: Response
  try {
    response = await fetch(endpoint, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body, signal: AbortSignal.timeout(timeout), redirect: 'error',
    })
  } catch {
    throw new Error('vLLM indisponible ou délai de réponse dépassé.')
  }
  // Pas de retry ni repli payant implicite. Ne pas exposer le corps d'erreur,
  // qui peut contenir le prompt ou les secrets du proxy.
  if (!response.ok) throw new Error(`vLLM : erreur HTTP ${response.status}.`)
  let payload: unknown
  try { payload = await response.json() } catch { throw new Error('vLLM : réponse HTTP non JSON.') }
  return parseVllmResponse(payload, params)
}
