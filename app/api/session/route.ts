import { NextRequest, NextResponse } from 'next/server'
import { closeMCPClient } from '@/lib/mcp-client'
import { deleteSession } from '@/lib/session-store'

interface DeleteSessionRequest {
  sessionId?: string
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json().catch(() => ({})) as DeleteSessionRequest
    const sessionId = body.sessionId?.trim()

    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId requis' }, { status: 400 })
    }

    await deleteSession(sessionId)
    await closeMCPClient(sessionId)

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Session reset error:', err)
    const message = err instanceof Error ? err.message : 'Erreur interne du serveur'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
