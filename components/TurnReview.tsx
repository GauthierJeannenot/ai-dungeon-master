 'use client'
import { useEffect, useState } from 'react'
type Turn = { id: string; metadata: { message: string }; rating: 'good' | 'bad' | null; correction: string; outcome?: { status: number; body?: { narrative?: string; error?: string } } }
export default function TurnReview({ sessionId, busy }: { sessionId: string; busy: boolean }) {
  const [open, setOpen] = useState(false)
  const [turns, setTurns] = useState<Turn[]>([])
  const [status, setStatus] = useState('')
  const [saving, setSaving] = useState(false)
  const url = `/api/sessions/${encodeURIComponent(sessionId)}/training`
  useEffect(() => {
    if (!open || busy) return
    const controller = new AbortController()
    void fetch(url, { signal: controller.signal }).then(async r => {
      if (!r.ok) throw new Error('Chargement impossible.')
      const data = await r.json(); setTurns(previous => data.turns.map((t: Turn) => { const old = previous.find(p => p.id === t.id); return old ? { ...t, rating: old.rating, correction: old.correction } : t }))
    }).catch(e => { if (!controller.signal.aborted) setStatus(String(e)) })
    return () => controller.abort()
  }, [open, busy, url])
  async function save(turn: Turn) {
    setSaving(true); setStatus('')
    try {
      const r = await fetch(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(turn) })
      if (!r.ok) throw new Error('Enregistrement impossible. Réessaie.')
      setStatus('Annotation enregistrée.')
    } catch (e) { setStatus(String(e)) } finally { setSaving(false) }
  }
  function change(id: string, patch: Partial<Turn>) { setTurns(previous => previous.map(t => t.id === id ? { ...t, ...patch } : t)) }
  return <div className="border border-amber-900/40 rounded p-2 text-sm">
    <button type="button" aria-expanded={open} onClick={() => setOpen(!open)}>Évaluer les tours</button>
    {open && <div className="max-h-72 overflow-y-auto space-y-3 mt-2">
      <a href={`${url}?download=1`} className="underline">Télécharger les échanges complets</a>
      <p>Enregistre chaque annotation. Les corrections sont des notes à vérifier avant entraînement.</p>
      {turns.length === 0 && <p>Aucun tour enregistré.</p>}
      {turns.map((turn, index) => <div key={turn.id} className="border-t border-amber-900/40 pt-2 space-y-1">
        <p>{index + 1}. {turn.metadata.message}</p>
        {turn.outcome?.body?.narrative && <p className="text-stone-300">{turn.outcome.body.narrative}</p>}
        {turn.outcome?.body?.error && <p>Erreur : {turn.outcome.body.error}</p>}
        <select aria-label={`Évaluation du tour ${index + 1}`} value={turn.rating ?? ''} onChange={e => change(turn.id, { rating: (e.target.value || null) as Turn['rating'] })} className="bg-stone-900 text-white p-1">
          <option value="">Non évalué</option><option value="good">Bon</option><option value="bad">Mauvais</option>
        </select>
        <textarea aria-label={`Correction du tour ${index + 1}`} placeholder="Ce que le MJ aurait dû faire ou raconter" maxLength={20000} value={turn.correction} onChange={e => change(turn.id, { correction: e.target.value })} className="block w-full bg-stone-900 text-white p-2" />
        <button disabled={saving || busy} onClick={() => void save(turn)}>Enregistrer ce tour</button>
      </div>)}
      <p role="status">{status}</p>
    </div>}
  </div>
}
