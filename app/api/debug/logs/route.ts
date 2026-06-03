import { timingSafeEqual } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import {
  clearBufferedLogEvents,
  getBufferedLogEvents,
  logEvent,
  type LogLevel,
} from '@/lib/server-logger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const VALID_LEVELS = new Set<LogLevel>(['debug', 'info', 'warn', 'error'])
const PUBLIC_READ_ENABLED = process.env.APP_DEBUG_LOG_PUBLIC_READ !== 'false'

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
    return NextResponse.json({ error: 'debug logs disabled' }, { status: 404 })
  }

  if (!safeEqual(tokenFromRequest(req), expectedToken)) {
    logEvent('warn', 'debug_logs.auth_failed', {
      path: req.nextUrl.pathname,
      forwardedFor: req.headers.get('x-forwarded-for'),
      userAgent: req.headers.get('user-agent'),
    })
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
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

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!PUBLIC_READ_ENABLED) {
    const unauthorized = authorize(req)
    if (unauthorized) return unauthorized
  }

  const limit = parseLimit(req)
  const result = getBufferedLogEvents({
    limit,
    after: parseAfter(req),
    since: parseSince(req),
    level: parseLevel(req),
    event: req.nextUrl.searchParams.get('event') ?? undefined,
    requestId: req.nextUrl.searchParams.get('requestId') ?? undefined,
    sessionId: req.nextUrl.searchParams.get('sessionId') ?? undefined,
  })

  logEvent('info', 'debug_logs.read', {
    path: req.nextUrl.pathname,
    publicRead: PUBLIC_READ_ENABLED,
    returned: result.entries.length,
    totalBuffered: result.totalBuffered,
    nextAfter: result.nextAfter,
    filters: {
      limit,
      after: parseAfter(req),
      since: parseSince(req)?.toISOString(),
      level: parseLevel(req),
      event: req.nextUrl.searchParams.get('event') ?? undefined,
      requestId: req.nextUrl.searchParams.get('requestId') ?? undefined,
      sessionId: req.nextUrl.searchParams.get('sessionId') ?? undefined,
    },
  })

  return NextResponse.json({
    logs: result.entries,
    count: result.entries.length,
    totalBuffered: result.totalBuffered,
    bufferLimit: result.bufferLimit,
    nextAfter: result.nextAfter,
    publicRead: PUBLIC_READ_ENABLED,
  })
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const unauthorized = authorize(req)
  if (unauthorized) return unauthorized

  const cleared = clearBufferedLogEvents()

  logEvent('warn', 'debug_logs.clear', {
    path: req.nextUrl.pathname,
    cleared,
  })

  return NextResponse.json({ cleared })
}
