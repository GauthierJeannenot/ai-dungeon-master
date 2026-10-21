// Configuration partagée avec le contrôle de démarrage, sans client réseau.
export type LlmProvider = 'anthropic' | 'vllm'

export function getLlmProvider(): LlmProvider {
  const provider = process.env.LLM_PROVIDER || 'anthropic'
  if (provider !== 'anthropic' && provider !== 'vllm') {
    throw new Error('LLM_PROVIDER doit valoir anthropic ou vllm.')
  }
  return provider
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
