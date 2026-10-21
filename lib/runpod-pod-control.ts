import { randomUUID } from 'node:crypto'
import { globalPodRequest, normalizeGlobalPod } from './runpod-global-api'
import type { RunpodPodConfig } from './runpod-config'
import { loadManagedPod, saveManagedPod, podBaseUrl, type ManagedPodState } from './runpod-pod-store'

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
class PodApiError extends Error {
  constructor(public status: number) { super(`API Pods Runpod : HTTP ${status}.`) }
}

// Refuser un snapshot incomplet : une métrique absente n'est PAS un zéro.
export function podMetricsDrained(text: string): boolean {
  const counts = new Map<string, number>()
  for (const line of text.split('\n')) {
    const match = line.match(/^vllm:num_requests_(running|waiting|swapped)(?:\{[^}]*\})?\s+(\S+)(?:\s+\S+)?\s*$/)
    if (!match) continue
    const value = Number(match[2])
    if (!Number.isFinite(value) || value < 0) throw new Error('Métriques vLLM invalides.')
    counts.set(match[1], (counts.get(match[1]) || 0) + value)
  }
  if (!counts.has('running') || !counts.has('waiting')) throw new Error('Métriques de drainage vLLM absentes.')
  return [...counts.values()].every(value => value === 0)
}

export function createPodControl(config: RunpodPodConfig) {
  async function api(path: string, init?: RequestInit, pageDepth = 0): Promise<unknown> {
    if (pageDepth > 100) throw new Error('Pagination Pods excessive ; récupération manuelle requise.')
    const request = globalPodRequest(path, init)
    let response: Response
    try {
      response = await fetch(request.url, { ...request.init,
        headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(10000), redirect: 'error', cache: 'no-store' })
    } catch { throw new Error('API Pods Runpod indisponible ; résultat de la requête incertain.') }
    if (!response.ok) throw new PodApiError(response.status)
    const text = await response.text()
    if (!text) return null // /start, /stop et DELETE ne promettent pas un JSON.
    let result: unknown
    try { result = JSON.parse(text) } catch { throw new Error('Réponse API Pods invalide.') }
    if (path.startsWith('/pods?')) {
      if (!record(result) || !Array.isArray(result.pods) || !record(result.pagination)) throw new Error('Liste de Pods invalide.')
      const pods = result.pods.map(normalizeGlobalPod)
      if (result.pagination.hasNextPage) {
        if (typeof result.pagination.nextCursor !== 'string' || !result.pagination.nextCursor) throw new Error('Pagination Pods invalide.')
        const next = await api(`/pods?cursor=${encodeURIComponent(result.pagination.nextCursor)}`, undefined, pageDepth + 1)
        if (!Array.isArray(next)) throw new Error('Liste de Pods invalide.')
        pods.push(...next)
      }
      return pods
    }
    return path.startsWith('/pods') ? normalizeGlobalPod(result) : result
  }

  function validateIdentity(pod: unknown): asserts pod is Record<string, unknown> & { id: string } {
    if (!record(pod) || typeof pod.id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(pod.id)
      || !record(pod.mounts) || !Array.isArray(pod.mounts.global)
      || !pod.mounts.global.some(mount => record(mount) && mount.volumeId === config.globalVolumeId && mount.path === '/workspace')) {
      throw new Error('Le Pod ne porte pas le volume configuré sur le chemin attendu ; aucune mutation autorisée.')
    }
  }
  function acceptable(pod: Record<string, unknown>): boolean {
    const pendingPrice = ['EXITED', 'PROVISIONING', 'STARTING'].includes(String(pod.desiredStatus)) && pod.costPerHr === 0
    return typeof pod.costPerHr === 'number' && Number.isFinite(pod.costPerHr) && (pod.costPerHr > 0 || pendingPrice)
      && pod.costPerHr <= config.maxHourlyUsd && record(pod.gpu) && pod.gpu.count === 1
      && typeof pod.gpu.id === 'string' && config.gpuTypes.includes(pod.gpu.id) && pod.interruptible !== true
  }
  async function getPod(id: string) {
    const pod = await api(`/pods/${id}`)
    validateIdentity(pod)
    if (pod.id !== id) throw new Error('Identité du Pod incohérente.')
    return pod
  }
  async function recover(state: ManagedPodState): Promise<ManagedPodState> {
    if (!state.pendingName) return state
    const pods = await api('/pods?limit=1000')
    if (!Array.isArray(pods)) throw new Error('Liste des Pods invalide.')
    const matches = pods.filter(pod => record(pod) && pod.name === state.pendingName)
    if (matches.length !== 1) throw new Error('Création de Pod incertaine : résolution manuelle requise, aucun doublon créé.')
    validateIdentity(matches[0])
    const recovered = { podId: matches[0].id, created: true }
    await saveManagedPod(config, recovered)
    return recovered
  }
  async function rejectCreated(state: ManagedPodState) {
    await saveManagedPod(config, { ...state, rejectedPod: true, blocked: true })
    // Ce Pod vient de notre création. Ne supprimer JAMAIS le Global Volume.
    await api(`/pods/${state.podId}`, { method: 'DELETE' })
    await saveManagedPod(config, { blocked: true })
    throw new Error('Pod refusé : prix supérieur à 3 $/h ou configuration incompatible.')
  }
  async function quote(gpuType: string): Promise<number | null> {
    let response: Response
    try {
      response = await fetch('https://api.runpod.io/graphql', {
        method: 'POST', headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'query Quote($gpu: GpuTypeFilter, $offer: GpuLowestPriceInput) { gpuTypes(input: $gpu) { id lowestPrice(input: $offer) { uninterruptablePrice availableGpuCounts } } }',
          variables: { gpu: { id: gpuType }, offer: { gpuCount: 1, secureCloud: true, minDisk: 20 } } }),
        signal: AbortSignal.timeout(10000), redirect: 'error', cache: 'no-store',
      })
    } catch { throw new Error('Devis GPU Runpod indisponible.') }
    if (!response.ok) throw new Error('Devis GPU Runpod indisponible.')
    const result: unknown = await response.json()
    if (!record(result) || result.errors || !record(result.data) || !Array.isArray(result.data.gpuTypes)) throw new Error('Devis GPU invalide.')
    const entry = result.data.gpuTypes.find((item: unknown) => record(item) && item.id === gpuType)
    if (!record(entry) || !record(entry.lowestPrice)) return null
    const offer = entry.lowestPrice
    const price = offer.uninterruptablePrice
    if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0 || price > config.maxHourlyUsd) return null
    // Runpod renvoie aussi null pour ce champ sur un devis valide. Cela ne
    // prouve pas une rupture de stock : le start/create confirme la capacité.
    // Une liste explicitement renseignée reste contraignante.
    if (offer.availableGpuCounts != null
      && (!Array.isArray(offer.availableGpuCounts) || !offer.availableGpuCounts.includes(1))) return null
    return price
  }
  async function replace(): Promise<void> {
    const volumeId = config.globalVolumeId
    const volume = await api(`/global-volumes/${volumeId}`)
    if (!record(volume) || volume.id !== volumeId) throw new Error('Global Volume Runpod introuvable.')
    for (const gpuType of config.gpuTypes) {
      if (await quote(gpuType) === null) continue
      const pendingName = `ai-dm-${volumeId}-${randomUUID()}`
      const previous = await loadManagedPod(config)
      await saveManagedPod(config, { ...previous, pendingName })
      // Pas de retry automatique du POST : une coupure réseau peut cacher un
      // succès facturé. Le nom persistant permet de récupérer le Pod au restart.
      let pod: unknown
      try {
        pod = await api('/pods', { method: 'POST', body: JSON.stringify({
          name: pendingName, templateId: config.templateId,
          globalVolumeId: config.globalVolumeId,
          cloudType: 'SECURE', computeType: 'GPU', gpuCount: 1, gpuTypeIds: [gpuType],
          interruptible: false, containerDiskInGb: 20,
          volumeInGb: 0, volumeMountPath: '/workspace', ports: [`${config.port}/http`],
          env: { VLLM_API_KEY: process.env.VLLM_API_KEY, HF_HOME: '/workspace/huggingface' },
        }) })
      } catch (err) {
        if (err instanceof PodApiError && err.status === 400) {
          await saveManagedPod(config, previous)
          continue
        }
        throw err
      }
      if (!record(pod) || typeof pod.id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(pod.id)) {
        throw new Error('Création de Pod incertaine : ID manquant, aucun retry automatique.')
      }
      const state = { podId: pod.id, created: true }
      await saveManagedPod(config, state)
      if (!acceptable(await getPod(pod.id))) await rejectCreated(state)
      return
    }
    throw new Error(`Aucun GPU autorisé disponible à ${config.maxHourlyUsd} $/h maximum. Nouvelle tentative ultérieure.`)
  }
  async function setActive(active: boolean): Promise<void> {
    const state = await recover(await loadManagedPod(config))
    if (state.rejectedPod && state.podId) {
      try { await api(`/pods/${state.podId}`, { method: 'DELETE' }) } catch (err) {
        if (!(err instanceof PodApiError) || err.status !== 404) throw err
      }
      await saveManagedPod(config, { blocked: true })
      if (!active) return
      throw new Error('Allocation refusée ; contrôle du budget requis avant de réactiver les créations.')
    }
    if (state.blocked) { if (active) throw new Error('Créations de Pods bloquées après un tarif incompatible.'); return }
    if (!state.podId) { if (active) await replace(); return }
    let pod: Record<string, unknown>
    try { pod = await getPod(state.podId) } catch (err) {
      if (!(err instanceof PodApiError) || err.status !== 404) throw err
      if (active) await replace()
      return
    }
    if (!active) {
      if (pod.desiredStatus === 'RUNNING') await api(`/pods/${state.podId}/stop`, { method: 'POST' })
      return
    }
    if (pod.desiredStatus === 'TERMINATED') return replace()
    if (!acceptable(pod)) {
      if (state.created) return rejectCreated(state)
      if (pod.desiredStatus === 'RUNNING') await api(`/pods/${state.podId}/stop`, { method: 'POST' })
      throw new Error('Le Pod configuré dépasse le budget ou ne correspond pas aux GPU autorisés.')
    }
    if (pod.desiredStatus === 'RUNNING') return
    if (['PROVISIONING', 'STARTING'].includes(String(pod.desiredStatus))) return
    if (pod.desiredStatus !== 'EXITED') throw new Error('État du Pod non pris en charge.')
    if (record(pod.gpu) && await quote(String(pod.gpu.id)) === null) throw new Error('Aucune offre à 3 $/h maximum ; reprise reportée.')
    try { await api(`/pods/${state.podId}/start`, { method: 'POST' }) } catch (err) {
      // Uniquement un refus explicite, jamais un timeout ambigu.
      if (!(err instanceof PodApiError) || err.status !== 400) throw err
      return replace()
    }
    if (!acceptable(await getPod(state.podId))) {
      await api(`/pods/${state.podId}/stop`, { method: 'POST' })
      throw new Error('Le tarif après reprise dépasse le plafond ; Pod remis à l’arrêt.')
    }
  }
  async function inference(path: string): Promise<Response> {
    const state = await recover(await loadManagedPod(config))
    if (!state.podId || state.rejectedPod) throw new Error('Pod du MJ indisponible.')
    return fetch(`${podBaseUrl(config, state.podId).replace(/\/v1$/, '')}${path}`, {
      headers: { Authorization: `Bearer ${process.env.VLLM_API_KEY}` },
      signal: AbortSignal.timeout(4000), redirect: 'error', cache: 'no-store',
    })
  }
  return {
    setActive,
    async isDrained(): Promise<boolean> {
      const state = await recover(await loadManagedPod(config))
      if (!state.podId || state.rejectedPod) return true
      let pod
      try { pod = await getPod(state.podId) } catch (err) {
        if (err instanceof PodApiError && err.status === 404) return true
        throw err
      }
      if (pod.desiredStatus === 'EXITED' || pod.desiredStatus === 'TERMINATED') return true
      const response = await inference('/metrics')
      if (!response.ok) throw new Error('Drainage du Pod non vérifiable ; arrêt reporté.')
      return podMetricsDrained(await response.text())
    },
    async isReady(): Promise<boolean> {
      await setActive(true)
      const state = await loadManagedPod(config)
      if (!state.podId || (await getPod(state.podId)).desiredStatus !== 'RUNNING') return false
      try {
        const response = await inference('/v1/models')
        if (!response.ok) return false
        const result: unknown = await response.json()
        if (!record(result) || !Array.isArray(result.data)) return false
        const models = new Set(result.data.filter(record).map(model => model.id))
        const dm = process.env.DM_MODEL || 'Qwen/Qwen3.6-27B'
        const planner = process.env.DM_PLANNER_MODEL || dm
        return [dm, planner, process.env.DM_COMPRESS_MODEL || planner].every(model => models.has(model))
      } catch { return false }
    },
  }
}
