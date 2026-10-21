import type { RunpodConfig } from './runpod-config'
import { createPodControl } from './runpod-pod-control'

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

// URLs fixées côté serveur, sans secret dans les messages d'erreur ou les logs.
export function createRunpodControl(config: RunpodConfig) {
  if (config.mode === 'pod') return createPodControl(config)
  async function request(url: string, init?: RequestInit): Promise<unknown> {
    let response: Response
    try {
      response = await fetch(url, { ...init, headers: {
        Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json',
      }, signal: AbortSignal.timeout(10000), redirect: 'error', cache: 'no-store' })
    } catch { throw new Error('API de gestion Runpod indisponible.') }
    if (!response.ok) throw new Error(`API de gestion Runpod : HTTP ${response.status}.`)
    try { return await response.json() } catch { throw new Error('Réponse de gestion Runpod invalide.') }
  }

  return {
    async setActive(active: boolean): Promise<void> {
      const workersMin = active ? 1 : 0
      const result = await request(`https://rest.runpod.io/v1/endpoints/${config.endpointId}`, {
        method: 'PATCH',
        // Endpoint dédié à cette app : un seul worker partagé et aucun worker
        // flex supplémentaire qui pourrait rester allumé hors de son contrôle.
        body: JSON.stringify({ workersMin, workersMax: workersMin, ...(active ? { idleTimeout: 600 } : {}) }),
      })
      if (!record(result) || result.workersMin !== workersMin || result.workersMax !== workersMin) {
        throw new Error('Runpod n’a pas confirmé le changement de capacité.')
      }
    },
    async isDrained(): Promise<boolean> {
      const result = await request(`https://api.runpod.ai/v2/${config.endpointId}/health`)
      if (!record(result) || !record(result.jobs)) throw new Error('Statut des tâches Runpod indisponible.')
      const { inProgress, inQueue } = result.jobs
      if (typeof inProgress !== 'number' || typeof inQueue !== 'number' || inProgress < 0 || inQueue < 0) {
        throw new Error('Compteur de tâches Runpod invalide.')
      }
      return inProgress === 0 && inQueue === 0
    },
    async isReady(): Promise<boolean> {
      // Le statut de worker seul ne garantit pas le chargement des poids.
      // Vérifier aussi la disponibilité des modèles nécessaires à l'app.
      let response: Response
      try {
        response = await fetch(`${config.inferenceBaseUrl}/models`, {
          headers: { Authorization: `Bearer ${process.env.VLLM_API_KEY?.trim()}` },
          signal: AbortSignal.timeout(4000), redirect: 'error', cache: 'no-store',
        })
      } catch { return false }
      if (!response.ok) return false
      let result: unknown
      try { result = await response.json() } catch { return false }
      if (!record(result) || !Array.isArray(result.data)) return false
      const models = new Set(result.data.filter(record).map(model => model.id))
      const dmModel = process.env.DM_MODEL || 'Qwen/Qwen3.6-27B'
      const plannerModel = process.env.DM_PLANNER_MODEL || dmModel
      return [dmModel, plannerModel, process.env.DM_COMPRESS_MODEL || plannerModel].every(model => models.has(model))
    },
  }
}
