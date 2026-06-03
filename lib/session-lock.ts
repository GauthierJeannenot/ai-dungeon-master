const DEFAULT_LOCK_KEY = 'default'

type ReleaseLock = () => void

const locks = new Map<string, Promise<void>>()

function normalizeLockKey(sessionId: string | undefined): string {
  const normalized = sessionId?.trim().replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128)
  return normalized || DEFAULT_LOCK_KEY
}

export async function acquireSessionLock(sessionId: string | undefined): Promise<ReleaseLock> {
  const key = normalizeLockKey(sessionId)
  const previous = locks.get(key) ?? Promise.resolve()

  let releaseCurrent!: () => void
  const current = new Promise<void>(resolve => {
    releaseCurrent = resolve
  })

  const queued = previous.then(() => current)
  locks.set(key, queued)
  await previous.catch(() => undefined)

  let released = false
  return () => {
    if (released) return
    released = true
    releaseCurrent()
    if (locks.get(key) === queued) {
      locks.delete(key)
    }
  }
}
