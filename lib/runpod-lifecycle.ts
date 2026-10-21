import { getRunpodConfig } from './runpod-config'
import { createRunpodControl } from './runpod-control'
import { logEvent } from './server-logger'

export const RUNPOD_IDLE_MS = 10 * 60 * 1000
export const RUNPOD_PRESENCE_TTL_MS = 90 * 1000
const SWEEP_MS = 15000

type WorkerControl = ReturnType<typeof createRunpodControl>
interface Presence { sequence: number; expiresAt: number; present: boolean }

// Volatile comme les verrous/moteurs MCP : une instance Next.js Node persistante.
// Le global évite deux contrôleurs indépendants entre bundles de routes / HMR.
export class RunpodLifecycle {
  private presences = new Map<string, Presence>()
  private generations = 0
  private remoteBusy = false
  private idleSince: number
  private desiredActive: boolean | undefined
  private ready = false
  private failed = false
  private pending?: Promise<void>
  private revision = 0
  private appliedRevision = -1
  private timer?: ReturnType<typeof setInterval>

  constructor(private control: WorkerControl, private now = Date.now) {
    // Après redémarrage : grâce complète avant de réconcilier un ancien worker.
    this.idleSince = now()
  }

  start(): void {
    if (this.timer) return
    this.timer = setInterval(() => { void this.reconcile().catch(() => undefined) }, SWEEP_MS)
    this.timer.unref()
  }

  stopTimer(): void { clearInterval(this.timer); this.timer = undefined }

  status() {
    return { enabled: true, ready: this.ready && this.desiredActive === true && !this.failed,
      state: this.failed ? 'error' : this.ready ? 'ready' : this.desiredActive ? 'warming' : 'idle' }
  }

  presence(key: string, sequence: number, present: boolean, wake = false): Promise<void> {
    const now = this.now()
    this.prune(now)
    const previous = this.presences.get(key)
    // Les départs et heartbeats peuvent arriver dans le désordre (pagehide).
    // Les heartbeats ne prolongent jamais la fenêtre d'activité du GPU.
    if (!previous || sequence > previous.sequence) {
      if (!previous && this.presences.size >= 5000) throw new Error('Trop de présences simultanées.')
      this.presences.set(key, { sequence, present, expiresAt: now + RUNPOD_PRESENCE_TTL_MS })
      this.revision++
      if (present && (!previous || wake)) {
        this.idleSince = now
        this.wakeRequested = true
      }
    }
    return this.reconcile()
  }

  async beginGeneration(): Promise<() => void> {
    // Réservation synchrone AVANT tout await : empêche un arrêt en course.
    this.generations++
    this.revision++
    const release = (() => {
      let released = false
      return () => {
        if (released) return
        released = true
        this.generations--
        this.idleSince = this.now()
        this.revision++
        void this.reconcile().catch(() => undefined)
      }
    })()
    try {
      await this.reconcile()
      if (!this.ready) throw new Error('Le MJ se prépare encore. Réessaie dans quelques instants.')
      return release
    } catch (err) { release(); throw err }
  }

  private prune(now: number): void {
    for (const [key, presence] of this.presences) {
      // Garder les onglets ouverts connus : leur prochain poll, même retardé,
      // ne doit pas être interprété comme l'ouverture d'une nouvelle partie.
      if (!presence.present && presence.expiresAt <= now) {
        this.presences.delete(key)
      }
    }
  }

  private wakeRequested = false

  reconcile(): Promise<void> {
    if (this.pending) {
      const revision = this.revision
      return this.pending.then(() => this.appliedRevision < revision ? this.reconcile() : undefined)
    }
    const operation = Promise.resolve().then(async () => {
      // Coalescer les heartbeats/ticks concurrents ; si une présence change
      // pendant une requête réseau, appliquer la nouvelle cible avant de finir.
      let revision: number
      do {
        revision = this.revision
        this.prune(this.now())
        const needed = this.wakeRequested || this.generations > 0
        if (needed) {
          if (this.desiredActive !== true) {
            await this.control.setActive(true)
            this.desiredActive = true
            logEvent('info', 'runpod.worker.started', {})
          }
          if (!this.ready || this.failed) this.ready = await this.control.isReady()
          if (this.ready) this.wakeRequested = false
        } else if (this.desiredActive !== false) {
          if (this.desiredActive === true && !(await this.control.isDrained())) {
            this.remoteBusy = true
            this.idleSince = this.now()
            if (revision !== this.revision) continue
            break
          }
          if (this.remoteBusy) {
            this.remoteBusy = false
            this.idleSince = this.now()
          }
          if (this.now() - this.idleSince < RUNPOD_IDLE_MS) break
          if (this.desiredActive !== true && !(await this.control.isDrained())) {
            this.remoteBusy = true
            this.idleSince = this.now()
            if (revision !== this.revision) continue
            break
          }
          // Un joueur / une génération peut arriver durant le health réseau.
          this.prune(this.now())
          if (this.wakeRequested || this.generations > 0) continue
          await this.control.setActive(false)
          this.desiredActive = false
          this.ready = false
          logEvent('info', 'runpod.worker.stopped', {})
        }
        this.failed = false
      } while (revision !== this.revision)
      this.appliedRevision = revision
    }).catch(err => {
      // Un PATCH ayant échoué peut avoir été appliqué à distance : la prochaine
      // réconciliation doit réaffirmer la capacité souhaitée, jamais la supposer.
      this.desiredActive = undefined
      this.ready = false
      this.failed = true
      logEvent('warn', 'runpod.worker.reconcile_failed', { err: err instanceof Error ? err.message : 'Runpod indisponible' })
      throw err
    })
    this.pending = operation.finally(() => { this.pending = undefined })
    return this.pending
  }
}

const shared = globalThis as typeof globalThis & { aiDmRunpodLifecycle?: RunpodLifecycle }
export function getRunpodLifecycle(): RunpodLifecycle | null {
  const config = getRunpodConfig()
  if (!config) return null
  if (!shared.aiDmRunpodLifecycle) shared.aiDmRunpodLifecycle = new RunpodLifecycle(createRunpodControl(config))
  shared.aiDmRunpodLifecycle.start()
  return shared.aiDmRunpodLifecycle
}

export async function beginRunpodGeneration(): Promise<() => void> {
  return await getRunpodLifecycle()?.beginGeneration() ?? (() => undefined)
}
