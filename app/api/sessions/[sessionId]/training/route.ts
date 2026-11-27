import { NextRequest, NextResponse } from 'next/server'
import { loadSession } from '@/lib/session-store'
import { dbQuery } from '@/lib/db'
import { acquireSessionLock } from '@/lib/session-lock'
import { appendTrainingRecord } from '@/lib/training-recorder'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
type Context = { params: Promise<{ sessionId: string }> }
async function authorized(sessionId: string): Promise<boolean> {
  const stored = await loadSession(sessionId)
  if (!stored) return false
  if (!stored.ownerId) return process.env.MONETIZATION_ENABLED === 'false'
  if (process.env.MONETIZATION_ENABLED === 'false') return false
  const { resolveEntitlement } = await import('@/lib/entitlements')
  const e = await resolveEntitlement()
  return stored.ownerId === (e.kind === 'user' ? `user:${e.userId}` : `guest:${e.guestId}`)
}
function key(value: string): string { return value.trim().replace(/[^a-zA-Z0-9_-]/g, '_').slice(0,128) }
export async function GET(req: NextRequest, context: Context) {
  const { sessionId } = await context.params
  if (!await authorized(sessionId)) return NextResponse.json({ error: 'Partie inaccessible.' }, { status: 403 })
  const turns = (await dbQuery('SELECT * FROM training_turns WHERE session_id=$1 ORDER BY created_at, id', [key(sessionId)])).rows
  if (req.nextUrl.searchParams.get('download') === '1') {
    const entries = await Promise.all(turns.map(async turn => ({ ...turn,
      events: (await dbQuery('SELECT sequence,kind,payload,created_at FROM training_events WHERE turn_id=$1 ORDER BY sequence', [turn.id])).rows })))
    return new NextResponse(JSON.stringify({ schemaVersion: 1, sessionId, turns: entries }), {
      headers: { 'Content-Type': 'application/json', 'Content-Disposition': 'attachment; filename="training-traces.json"', 'Cache-Control': 'no-store' } })
  }
  return NextResponse.json({ turns }, { headers: { 'Cache-Control': 'no-store' } })
}
export async function PATCH(req: NextRequest, context: Context) {
  const { sessionId } = await context.params
  if (!await authorized(sessionId)) return NextResponse.json({ error: 'Partie inaccessible.' }, { status: 403 })
  let body
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON invalide.' }, { status: 400 }) }
  if (!body || typeof body.id !== 'string' || !['good','bad',null].includes(body.rating) ||
      typeof body.correction !== 'string' || body.correction.length > 20000) {
    return NextResponse.json({ error: 'Annotation invalide (correction : 20 000 caractères maximum).' }, { status: 400 })
  }
  const release = await acquireSessionLock(sessionId)
  try {
    const result = await dbQuery('UPDATE training_turns SET rating=$3, correction=$4 WHERE id=$1 AND session_id=$2 RETURNING id',
      [body.id,key(sessionId),body.rating,body.correction])
    if (result.rows.length) await appendTrainingRecord(body.id, key(sessionId), {
      type: 'turn.annotation', rating: body.rating, correction: body.correction,
    })
    return NextResponse.json({ saved: result.rows.length === 1 }, { status: result.rows.length ? 200 : 404 })
  } finally { release() }
}
