import { NextRequest, NextResponse } from 'next/server'
import { closeMCPClient } from '@/lib/mcp-client'
import { deleteSession } from '@/lib/session-store'
import { logEvent } from '@/lib/server-logger'

interface DeleteSessionRequest {
  sessionId?: string
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const startedAt = Date.now()
  try {
    logEvent('info', 'session_api.delete.start', {
      method: req.method,
      url: req.url,
      userAgent: req.headers.get('user-agent'),
      referer: req.headers.get('referer'),
      forwardedFor: req.headers.get('x-forwarded-for'),
    })

    const body = await req.json().catch(() => ({})) as DeleteSessionRequest
    const sessionId = body.sessionId?.trim()

    if (!sessionId) {
      logEvent('warn', 'session_api.delete.invalid', {
        reason: 'missing-session-id',
        durationMs: Date.now() - startedAt,
      })
      return NextResponse.json({ error: 'sessionId requis' }, { status: 400 })
    }

    logEvent('info', 'session_api.delete.requested', { sessionId })
    await deleteSession(sessionId)
    await closeMCPClient(sessionId)

    logEvent('info', 'session_api.delete.ok', {
      sessionId,
      durationMs: Date.now() - startedAt,
    })
    return NextResponse.json({ success: true })
  } catch (err) {
    logEvent('error', 'session_api.delete.error', {
      durationMs: Date.now() - startedAt,
      err,
    })
    const message = err instanceof Error ? err.message : 'Erreur interne du serveur'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
