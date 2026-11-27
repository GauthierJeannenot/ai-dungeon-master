import { AsyncLocalStorage } from 'node:async_hooks'
import { randomUUID } from 'node:crypto'
import { appendFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { dbQuery } from './db'
import { logEvent } from './server-logger'

type Recording = { id?: string; sessionId?: string; sequence: number; pending: Promise<unknown> }
const recording = new AsyncLocalStorage<Recording>()
export function withRecording<T>(fn: () => Promise<T>): Promise<T> {
  return recording.run({ sequence: 0, pending: Promise.resolve() }, fn)
}
export function isRecordingActive(): boolean { return !!recording.getStore()?.id }

export async function appendTrainingRecord(turnId: string, sessionId: string, record: Record<string, unknown>): Promise<void> {
  const enabled = process.env.NODE_ENV === 'production'
    ? process.env.LLM_TRAINING_FILE_ENABLED === 'true'
    : process.env.LLM_TRAINING_FILE_ENABLED !== 'false'
  if (!enabled) return
  // Only server-generated UUIDs can become filenames. Session IDs remain data.
  if (!/^[a-f0-9-]{36}$/.test(turnId)) throw new Error('Identifiant de trace invalide.')
  const dir = process.env.LLM_TRAINING_DIR || path.join(process.cwd(), 'llm_training')
  await mkdir(dir, { recursive: true, mode: 0o700 })
  await appendFile(path.join(dir, `${turnId}.jsonl`), JSON.stringify({
    schemaVersion: 1, turnId, sessionId, createdAt: new Date().toISOString(), ...record,
  }) + '\n', { encoding: 'utf8', mode: 0o600 })
}

export async function startRecording(sessionId: string | undefined, metadata: unknown): Promise<void> {
  const context = recording.getStore()
  if (!context) return
  const id = randomUUID()
  context.id = id
  context.sessionId = sessionId?.trim().replace(/[^a-zA-Z0-9_-]/g, '_').slice(0,128) || 'default'
  const runtime = {
    nodeVersion: process.version, environment: process.env.NODE_ENV || 'development',
    revision: process.env.RAILWAY_GIT_COMMIT_SHA || process.env.VERCEL_GIT_COMMIT_SHA || process.env.APP_REVISION || null,
  }
  // Keep the existing top-level metadata contract for the review UI and exports.
  const savedMetadata = { ...(typeof metadata === 'object' && metadata !== null ? metadata : {}), runtime }
  context.pending = (async () => {
    await appendTrainingRecord(id, context.sessionId!, { type: 'turn.start', metadata: savedMetadata })
    await dbQuery('INSERT INTO training_turns (id, session_id, metadata) VALUES ($1,$2,$3)',
      [id, context.sessionId, JSON.stringify(savedMetadata)])
  })()
  await context.pending
}
export async function recordExchange(kind: string, payload: unknown): Promise<void> {
  const context = recording.getStore()
  if (!context?.id) return
  const sequence = context.sequence++
  // Snapshot before any await: later tool-loop mutations must not change a trace.
  const json = JSON.stringify(payload)
  context.pending = context.pending.then(async () => {
    await appendTrainingRecord(context.id!, context.sessionId!, { type: 'event', sequence, kind, payload: JSON.parse(json) })
    await dbQuery('INSERT INTO training_events (id,turn_id,sequence,kind,payload) VALUES ($1,$2,$3,$4,$5)',
      [randomUUID(), context.id, sequence, kind, json])
  })
  await context.pending
}
export async function captureExchange<T>(kind: string, request: unknown, fn: () => Promise<T>): Promise<T> {
  await recordExchange(kind + '.request', request)
  try {
    const response = await fn()
    await recordExchange(kind + '.response', response)
    return response
  } catch (error) {
    await recordExchange(kind + '.error', { message: error instanceof Error ? error.message : String(error) })
    throw error
  }
}
export async function finishRecording(response: Response): Promise<void> {
  const context = recording.getStore()
  if (!context?.id) return
  try {
    const body = await response.clone().json()
    await context.pending
    const outcome = { status: response.status, body, recordedAt: new Date().toISOString() }
    await appendTrainingRecord(context.id!, context.sessionId!, { type: 'turn.outcome', outcome })
    await dbQuery('UPDATE training_turns SET outcome=$2 WHERE id=$1',
      [context.id, JSON.stringify(outcome)])
  } catch (error) {
    logEvent('error', 'training.finish.error', { turnId: context.id, error: String(error) })
  }
}
