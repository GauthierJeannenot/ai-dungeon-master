import { timingSafeEqual } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { dbQuery } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const headers = { 'Cache-Control': 'no-store' }
type Cursor = { id: string }
interface TrainingTurn {
  [column: string]: unknown
  id: string
  session_id: string
  created_at: Date
  metadata: Record<string, unknown>
  outcome: { recordedAt?: string; status: number; body: unknown } | null
  rating: string | null
  correction: string
}

function authorize(req: NextRequest): NextResponse | null {
  const expected = (process.env.LLM_TRAINING_TOKEN || process.env.APP_DEBUG_LOG_TOKEN)?.trim()
  if (!expected || expected.length < 16) return NextResponse.json({ error: 'Export désactivé.' }, { status: 404, headers })
  const authorization = req.headers.get('authorization') || ''
  const supplied = /^Bearer /i.test(authorization) ? authorization.slice(7).trim() : ''
  const a = Buffer.from(supplied), b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ error: 'Accès refusé.' }, { status: 401, headers })
  }
  return null
}

/** Administrative, read-only export. Collection happens automatically in POST /api/dm. */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const denied = authorize(req)
  if (denied) return denied
  const search = req.nextUrl.searchParams
  const limit = Number(search.get('limit') || 20)
  let cursor: Cursor | undefined
  try {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error()
    if (search.has('cursor')) {
      const encoded = search.get('cursor')!
      if (encoded.length > 512) throw new Error()
      const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'))
      if (typeof parsed.id !== 'string' || !parsed.id || parsed.id.length > 128) throw new Error()
      cursor = parsed
    }
  } catch {
    return NextResponse.json({ error: 'Pagination invalide (limit : 1 à 100).' }, { status: 400, headers })
  }
  const values: unknown[] = []
  const clauses: string[] = []
  if (search.has('sessionId')) {
    values.push(search.get('sessionId')!.trim().replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128))
    clauses.push(`session_id=$${values.length}`)
  }
  if (cursor) {
    values.push(cursor.id)
    // Compare inside Postgres: serializing a JS Date would lose microseconds.
    const anchor = `(SELECT anchor.created_at FROM training_turns AS anchor WHERE anchor.id=$${values.length})`
    clauses.push(`(created_at > ${anchor} OR (created_at = ${anchor} AND id > $${values.length}))`)
  }
  values.push(limit + 1)
  const rows = (await dbQuery<TrainingTurn>(`SELECT * FROM training_turns${clauses.length ? ' WHERE ' + clauses.join(' AND ') : ''}
    ORDER BY created_at, id LIMIT $${values.length}`, values)).rows
  const page = rows.slice(0, limit)
  const turns = await Promise.all(page.map(async turn => ({ ...turn,
    events: (await dbQuery('SELECT sequence,kind,payload,created_at FROM training_events WHERE turn_id=$1 ORDER BY sequence', [turn.id])).rows,
  })))
  const last = page.at(-1)
  const nextCursor = rows.length > limit && last ? Buffer.from(JSON.stringify({
    id: last.id,
  })).toString('base64url') : null
  if (search.get('download') === '1') {
    const lines: string[] = []
    for (const turn of turns) {
      const base = { schemaVersion: 1, turnId: turn.id, sessionId: turn.session_id }
      lines.push(JSON.stringify({ ...base, type: 'turn.start', createdAt: turn.created_at, metadata: turn.metadata }))
      for (const event of turn.events) lines.push(JSON.stringify({ ...base, type: 'event',
        createdAt: event.created_at, sequence: event.sequence, kind: event.kind, payload: event.payload }))
      if (turn.outcome) lines.push(JSON.stringify({ ...base, type: 'turn.outcome',
        createdAt: turn.outcome.recordedAt || turn.created_at, outcome: turn.outcome }))
      lines.push(JSON.stringify({ ...base, type: 'turn.annotation', rating: turn.rating, correction: turn.correction }))
    }
    return new NextResponse(lines.length ? lines.join('\n') + '\n' : '', { headers: {
      ...headers, 'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Content-Disposition': 'attachment; filename="llm_training.jsonl"',
      ...(nextCursor ? { 'X-Next-Cursor': nextCursor } : {}),
    } })
  }
  return NextResponse.json({ schemaVersion: 1, turns, nextCursor }, { headers })
}
