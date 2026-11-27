import { randomUUID } from 'node:crypto'
import { isRecordingActive, recordExchange } from './training-recorder'

function selectedHeaders(headers: Headers, names: string[]): Record<string, string> {
  return Object.fromEntries(names.flatMap(name => {
    const value = headers.get(name)
    return value === null ? [] : [[name, value]]
  }))
}

/** Capture the serialized provider exchange, including failed/invalid responses.
 * Authentication headers and URL query credentials are never collected. */
export async function trainingFetch(
  provider: 'openai' | 'vllm', input: Parameters<typeof fetch>[0],
  init?: Parameters<typeof fetch>[1], operation = 'generation',
): Promise<Response> {
  if (!isRecordingActive()) return fetch(input, init)
  const id = randomUUID()
  // Constructing from the original Request transfers its body. Inspect a clone
  // so the provider still receives a readable, byte-identical request.
  const request = new Request(input instanceof Request ? input.clone() : input, init)
  const url = new URL(request.url)
  await recordExchange('llm.http.request', {
    id, provider, operation, method: request.method, endpoint: url.origin + url.pathname,
    headers: selectedHeaders(request.headers, ['content-type']),
    body: await request.clone().text(),
  })
  try {
    const response = await fetch(input, init)
    await recordExchange('llm.http.response', {
      id, provider, operation, status: response.status, statusText: response.statusText,
      headers: selectedHeaders(response.headers, ['content-type', 'request-id', 'x-request-id']),
      body: await response.clone().text(),
    })
    return response
  } catch (error) {
    await recordExchange('llm.http.error', { id, provider, operation,
      message: error instanceof Error ? error.message : String(error) })
    throw error
  }
}
