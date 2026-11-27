// Safe, serializable status only: never send container logs or credentials to clients.
const STARTUP_PHASES = ['starting', 'initializing', 'loading', 'preparing', 'optimizing', 'verifying', 'ready'] as const
export interface DmStartupProgress {
  phase: typeof STARTUP_PHASES[number]
  // Progress within the current phase, never an estimate of total startup time.
  // null means the provider does not expose measurable progress for this phase.
  percent: number | null
  label: string
}

export function isDmStartupProgress(value: unknown): value is DmStartupProgress {
  if (typeof value !== 'object' || value === null) return false
  const progress = value as Record<string, unknown>
  return STARTUP_PHASES.some(phase => phase === progress.phase)
    && (progress.percent === null || typeof progress.percent === 'number'
      && Number.isFinite(progress.percent) && progress.percent >= 0 && progress.percent <= 100)
    && typeof progress.label === 'string'
}

export function startupProgressFromLog(line: string): DmStartupProgress | null {
  const text = line.replace(/\x1b\[[0-9;]*m/g, '')
  const shards = text.match(/Loading (?:safetensors|pt) checkpoint shards[^\r\n]*?(\d{1,3})%/i)
  if (shards && Number(shards[1]) <= 100) {
    const percent = Number(shards[1])
    return { phase: 'loading', percent, label: 'Chargement des fichiers du modèle…' }
  }
  if (/Graph capturing finished|Application startup complete|Starting vLLM API server/i.test(text)) {
    return { phase: 'verifying', percent: null, label: 'Vérification de la disponibilité du MJ…' }
  }
  if (/Capturing CUDA graphs/i.test(text)) {
    const match = text.match(/Capturing CUDA graphs[^\r\n]*?(\d{1,3})%/i)
    const percent = match ? Number(match[1]) : null
    return { phase: 'optimizing', percent: percent !== null && percent <= 100 ? percent : null, label: 'Optimisation du modèle…' }
  }
  if (/torch\.compile takes|compil(?:ing|ation).*graph|GPU KV cache size/i.test(text)) return { phase: 'preparing', percent: null, label: 'Préparation du modèle…' }
  if (/Model loading took|Loading model weights took|Loading weights took/i.test(text)) return { phase: 'preparing', percent: null, label: 'Modèle chargé, préparation du MJ…' }
  if (/Starting to load model/i.test(text)) return { phase: 'loading', percent: null, label: 'Chargement des fichiers du modèle…' }
  if (/Initializing a V\d+ LLM engine/i.test(text)) return { phase: 'initializing', percent: null, label: 'Initialisation du modèle…' }
  return null
}

// Runpod's logs endpoint is an endless SSE stream. Read a bounded snapshot,
// retaining only known milestones, and resume after the last complete event.
export function createStartupLogReader(apiKey: string) {
  let podId: string | undefined
  let since = new Date().toISOString()
  let cursor: string | undefined
  let progress: DmStartupProgress | null = null
  return {
    reset() { podId = undefined; since = new Date().toISOString(); cursor = undefined; progress = null },
    async read(id: string): Promise<DmStartupProgress | null> {
      if (podId !== id) { podId = id; cursor = undefined; progress = null }
      const controller = new AbortController()
      let timeout: ReturnType<typeof setTimeout>
      // A wrapped/teed fetch stream may not settle its read or cancellation
      // when aborted. Optional logs must still release the lifecycle lock.
      const deadline = new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          controller.abort()
          reject(new Error('Startup log snapshot timed out.'))
        }, 1500)
      })
      let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
      try {
        const response = await Promise.race([deadline, fetch(`https://api.runpod.io/v2/pods/${encodeURIComponent(id)}/logs?source=container&since=${encodeURIComponent(since)}`, {
          headers: { Authorization: `Bearer ${apiKey}`, Accept: 'text/event-stream', ...(cursor ? { 'Last-Event-ID': cursor } : {}) },
          signal: controller.signal, redirect: 'error', cache: 'no-store',
        })])
        if (!response.ok || !response.headers.get('content-type')?.startsWith('text/event-stream') || !response.body) return progress
        reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        let bytes = 0
        while (bytes < 256 * 1024) {
          const chunk = await Promise.race([deadline, reader.read()])
          if (chunk.done) break
          bytes += chunk.value.byteLength
          buffer += decoder.decode(chunk.value, { stream: true })
          let separator: RegExpExecArray | null
          while ((separator = /\r?\n\r?\n/.exec(buffer))) {
            const frame = buffer.slice(0, separator.index)
            buffer = buffer.slice(separator.index + separator[0].length)
            const lines = frame.split(/\r?\n/)
            const data = lines.filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n')
            try {
              const event = JSON.parse(data)
              if (event.source === 'container' && typeof event.line === 'string'
                && typeof event.ts === 'string' && Date.parse(event.ts) >= Date.parse(since)) {
                const next = startupProgressFromLog(event.line)
                const restarting = /Initializing a V\d+ LLM engine|Starting to load model/i.test(event.line)
                if (next && (!progress || restarting
                  || STARTUP_PHASES.indexOf(next.phase) > STARTUP_PHASES.indexOf(progress.phase)
                  || next.phase === progress.phase && (progress.percent === null
                    || next.percent !== null && next.percent >= progress.percent))) progress = next
              }
            } catch { /* Unknown or incomplete frames are not progress. */ }
            const eventId = lines.find(line => line.startsWith('id:'))?.slice(3).trim()
            if (eventId && !/[\r\n]/.test(eventId)) cursor = eventId
          }
        }
      } catch { /* Optional telemetry must never prevent model startup. */ }
      finally {
        clearTimeout(timeout!)
        controller.abort()
        void reader?.cancel().catch(() => undefined)
      }
      return progress
    },
  }
}
