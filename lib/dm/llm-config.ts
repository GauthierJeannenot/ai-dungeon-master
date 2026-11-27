// OpenAI is the only active transport; reject stale provider selections.
export function getLlmProvider(): 'openai' {
  if (process.env.LLM_PROVIDER && process.env.LLM_PROVIDER !== 'openai') {
    throw new Error('LLM_PROVIDER doit valoir openai ; aucun autre fournisseur actif n’est pris en charge.')
  }
  return 'openai'
}

export function getOpenAIConfig(): { baseUrl: string; apiKey: string; timeout: number } {
  const baseUrl = (process.env.OPENAI_BASE_URL?.trim() || 'https://api.openai.com/v1').replace(/\/$/, '')
  let url: URL
  try { url = new URL(baseUrl) } catch { throw new Error('OPENAI_BASE_URL doit être une URL HTTP(S) valide.') }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || !url.pathname.endsWith('/v1')) {
    throw new Error('OPENAI_BASE_URL doit être une URL HTTP(S) terminant par /v1, sans identifiants, query ni fragment.')
  }
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) throw new Error('OPENAI_API_KEY manquante en mode OpenAI live.')
  const timeout = Number(process.env.OPENAI_TIMEOUT_MS ?? 60000)
  if (!Number.isSafeInteger(timeout) || timeout <= 0) throw new Error('OPENAI_TIMEOUT_MS doit être un entier positif.')
  const effort = process.env.OPENAI_REASONING_EFFORT?.trim()
  if (effort && !['none', 'minimal', 'low', 'medium', 'high', 'xhigh'].includes(effort)) throw new Error('OPENAI_REASONING_EFFORT invalide.')
  return { baseUrl, apiKey, timeout }
}

export function getOpenAIContextWindow(model: string): number {
  const dmModel = process.env.DM_MODEL || 'gpt-5.4-mini'
  const isSeparateCompressor = model !== dmModel && model === process.env.DM_COMPRESS_MODEL
  const configured = (isSeparateCompressor ? process.env.OPENAI_COMPRESS_CONTEXT_WINDOW_TOKENS : undefined)
    ?? process.env.OPENAI_CONTEXT_WINDOW_TOKENS
  if (configured !== undefined) {
    const size = Number(configured)
    if (!Number.isSafeInteger(size) || size <= 0) throw new Error('La fenêtre de contexte OpenAI doit être un entier positif.')
    return size
  }
  if (/^gpt-5\.4-mini(?:-\d{4}-\d{2}-\d{2})?$/.test(model)) return 400000
  throw new Error('Configurer OPENAI_CONTEXT_WINDOW_TOKENS (ou OPENAI_COMPRESS_CONTEXT_WINDOW_TOKENS) pour ce modèle OpenAI.')
}

export function getVllmEndpoint(): string {
  const baseUrl = process.env.VLLM_BASE_URL?.trim()
  if (!baseUrl) throw new Error('VLLM_BASE_URL manquante (URL du serveur vLLM terminant par /v1).')
  let url: URL
  try { url = new URL(baseUrl) } catch { throw new Error('VLLM_BASE_URL doit être une URL HTTP(S) valide.') }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('VLLM_BASE_URL doit être une URL HTTP(S) sans identifiants, query ni fragment.')
  }
  if (!url.pathname.replace(/\/$/, '').endsWith('/v1')) {
    throw new Error('VLLM_BASE_URL doit terminer par /v1 (API Chat Completions, pas /runsync).')
  }
  return `${baseUrl.replace(/\/$/, '')}/chat/completions`
}
