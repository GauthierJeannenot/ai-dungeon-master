import { timingSafeEqual } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import {
  clearLogEvents,
  getLogEvents,
  logEvent,
  type LogLevel,
} from '@/lib/server-logger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const VALID_LEVELS = new Set<LogLevel>(['debug', 'info', 'warn', 'error'])
// Lecture publique des logs : outil de dev local UNIQUEMENT. En production,
// l'endpoint exige toujours un Bearer token (APP_DEBUG_LOG_TOKEN) — les logs
// contiennent messages joueurs, sessionIds et userIds, ils ne doivent jamais
// être exposés. APP_DEBUG_LOG_PUBLIC_READ n'a d'effet qu'en non-production.
const PUBLIC_READ_ENABLED =
  process.env.NODE_ENV !== 'production' &&
  process.env.APP_DEBUG_LOG_PUBLIC_READ !== 'false'
const JSON_UTF8_HEADERS = { 'Content-Type': 'application/json; charset=utf-8' }

function jsonResponse(body: unknown, init?: ResponseInit): NextResponse {
  const headers = new Headers(init?.headers)
  headers.set('Content-Type', JSON_UTF8_HEADERS['Content-Type'])

  return NextResponse.json(body, {
    ...init,
    headers,
  })
}

function configuredToken(): string | null {
  const token = process.env.APP_DEBUG_LOG_TOKEN?.trim()
  return token && token.length >= 16 ? token : null
}

function tokenFromRequest(req: NextRequest): string {
  const auth = req.headers.get('authorization')?.trim()
  if (auth?.toLowerCase().startsWith('bearer ')) {
    return auth.slice('bearer '.length).trim()
  }

  const headerToken = req.headers.get('x-debug-log-token')?.trim()
  if (headerToken) return headerToken

  if (process.env.APP_DEBUG_LOG_TOKEN_QUERY_ENABLED === 'true') {
    return req.nextUrl.searchParams.get('token')?.trim() || ''
  }

  return ''
}

function safeEqual(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual)
  const expectedBuffer = Buffer.from(expected)
  if (actualBuffer.length !== expectedBuffer.length) return false
  return timingSafeEqual(actualBuffer, expectedBuffer)
}

function authorize(req: NextRequest): NextResponse | null {
  const expectedToken = configuredToken()
  if (!expectedToken) {
    return jsonResponse({ error: 'debug logs disabled' }, { status: 404 })
  }

  if (!safeEqual(tokenFromRequest(req), expectedToken)) {
    logEvent('warn', 'debug_logs.auth_failed', {
      path: req.nextUrl.pathname,
      forwardedFor: req.headers.get('x-forwarded-for'),
      userAgent: req.headers.get('user-agent'),
    })
    return jsonResponse({ error: 'unauthorized' }, { status: 401 })
  }

  return null
}

function parseLimit(req: NextRequest): number {
  const rawLimit = req.nextUrl.searchParams.get('limit')
  if (!rawLimit) return 100

  const limit = Number.parseInt(rawLimit, 10)
  if (!Number.isFinite(limit)) return 100
  return Math.min(Math.max(limit, 1), 500)
}

function parseAfter(req: NextRequest): number | undefined {
  const rawAfter = req.nextUrl.searchParams.get('after')
  if (!rawAfter) return undefined

  const after = Number.parseInt(rawAfter, 10)
  return Number.isFinite(after) && after >= 0 ? after : undefined
}

function parseSince(req: NextRequest): Date | undefined {
  const rawSince = req.nextUrl.searchParams.get('since')
  if (!rawSince) return undefined

  const since = new Date(rawSince)
  return Number.isFinite(since.getTime()) ? since : undefined
}

function parseLevel(req: NextRequest): LogLevel | undefined {
  const rawLevel = req.nextUrl.searchParams.get('level')?.toLowerCase()
  return rawLevel && VALID_LEVELS.has(rawLevel as LogLevel) ? rawLevel as LogLevel : undefined
}

function extractTurnTraces(entries: ReturnType<typeof getLogEvents>['entries']): unknown[] {
  return entries
    .filter(entry => entry.event === 'dm.turn.trace')
    .map(entry => entry.payload.turnTrace)
    .filter(Boolean)
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!PUBLIC_READ_ENABLED) {
    const unauthorized = authorize(req)
    if (unauthorized) return unauthorized
  }

  const limit = parseLimit(req)
  const logRead = req.nextUrl.searchParams.get('logRead') === 'true'
  const tracesOnly = req.nextUrl.searchParams.get('traces') === 'true'
  const result = getLogEvents({
    limit,
    after: parseAfter(req),
    since: parseSince(req),
    level: parseLevel(req),
    event: req.nextUrl.searchParams.get('event') ?? undefined,
    requestId: req.nextUrl.searchParams.get('requestId') ?? undefined,
    clientRequestId: req.nextUrl.searchParams.get('clientRequestId') ?? undefined,
    sessionId: req.nextUrl.searchParams.get('sessionId') ?? undefined,
  })

  logEvent(logRead ? 'info' : 'debug', 'debug_logs.read', {
    path: req.nextUrl.pathname,
    publicRead: PUBLIC_READ_ENABLED,
    returned: result.entries.length,
    totalBuffered: result.totalBuffered,
    totalPersisted: result.totalPersisted,
    nextAfter: result.nextAfter,
    source: result.source,
    filters: {
      limit,
      after: parseAfter(req),
      since: parseSince(req)?.toISOString(),
      level: parseLevel(req),
      event: req.nextUrl.searchParams.get('event') ?? undefined,
      requestId: req.nextUrl.searchParams.get('requestId') ?? undefined,
      clientRequestId: req.nextUrl.searchParams.get('clientRequestId') ?? undefined,
      sessionId: req.nextUrl.searchParams.get('sessionId') ?? undefined,
      logRead,
      tracesOnly,
    },
  })

  const turnTraces = tracesOnly ? extractTurnTraces(result.entries) : undefined

  return jsonResponse({
    logs: tracesOnly ? [] : result.entries,
    turnTraces,
    count: tracesOnly ? turnTraces?.length ?? 0 : result.entries.length,
    totalBuffered: result.totalBuffered,
    totalPersisted: result.totalPersisted,
    bufferLimit: result.bufferLimit,
    nextAfter: result.nextAfter,
    publicRead: PUBLIC_READ_ENABLED,
    persistent: result.persistent,
    source: result.source,
    logRead,
  })
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const unauthorized = authorize(req)
  if (unauthorized) return unauthorized

  const cleared = clearLogEvents()

  logEvent('warn', 'debug_logs.clear', {
    path: req.nextUrl.pathname,
    ...cleared,
  })

  return jsonResponse(cleared)
}
