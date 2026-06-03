import { NextRequest, NextResponse } from 'next/server'
import { logEvent } from '@/lib/server-logger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const JSON_UTF8_HEADERS = { 'Content-Type': 'application/json; charset=utf-8' }
const MAX_ENTRIES_PER_POST = 100
const MAX_SEEN_CLIENT_LOG_IDS = 2000

const seenClientLogIds = new Set<string>()
const seenClientLogIdQueue: string[] = []

function jsonResponse(body: unknown, init?: ResponseInit): NextResponse {
  const headers = new Headers(init?.headers)
  headers.set('Content-Type', JSON_UTF8_HEADERS['Content-Type'])

  return NextResponse.json(body, {
    ...init,
    headers,
  })
}

function sameOriginOrServerSide(req: NextRequest): boolean {
  const origin = req.headers.get('origin')
  if (!origin) return true

  try {
    const originHost = new URL(origin).host
    const allowedHosts = new Set([
      req.nextUrl.host,
      req.headers.get('host'),
      req.headers.get('x-forwarded-host'),
    ].filter(Boolean))
    return allowedHosts.has(originHost)
  } catch {
    return false
  }
}

function safeString(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed ? trimmed.slice(0, maxLength) : undefined
}

function rememberClientLogId(id: string): boolean {
  if (seenClientLogIds.has(id)) return false

  seenClientLogIds.add(id)
  seenClientLogIdQueue.push(id)

  while (seenClientLogIdQueue.length > MAX_SEEN_CLIENT_LOG_IDS) {
    const oldest = seenClientLogIdQueue.shift()
    if (oldest) seenClientLogIds.delete(oldest)
  }

  return true
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!sameOriginOrServerSide(req)) {
    return jsonResponse({ error: 'origin mismatch' }, { status: 403 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ error: 'invalid json' }, { status: 400 })
  }

  const record = body && typeof body === 'object' ? body as Record<string, unknown> : {}
  const sessionId = safeString(record.sessionId, 128)
  const browserLogId = safeString(record.browserLogId, 128)
  const entries = Array.isArray(record.entries)
    ? record.entries.slice(-MAX_ENTRIES_PER_POST)
    : []

  let accepted = 0
  let deduped = 0

  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') continue
    const entryRecord = entry as Record<string, unknown>
    const clientEntryId = safeString(entryRecord.id, 160)
    if (!clientEntryId) continue

    if (!rememberClientLogId(clientEntryId)) {
      deduped++
      continue
    }

    accepted++
    logEvent('info', 'client.blackbox.entry', {
      source: 'browser-localStorage',
      browserLogId,
      sessionId: safeString(entryRecord.sessionId, 128) ?? sessionId,
      clientEntryId,
      clientTimestamp: entryRecord.timestamp,
      clientEvent: safeString(entryRecord.event, 120),
      clientPayload: entryRecord.payload,
    })
  }

  return jsonResponse({
    accepted,
    deduped,
    received: entries.length,
  })
}
