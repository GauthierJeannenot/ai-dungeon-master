// Adaptation du contrat Pods historique vers l'API v2 et ses mounts globaux.
export function globalPodRequest(path: string, init: RequestInit = {}): { url: string; init: RequestInit } {
  const parsed = new URL(path, 'https://api.runpod.io')
  let target = `/v2${parsed.pathname}`
  const action = parsed.pathname.match(/^\/pods\/([^/]+)\/(start|stop)$/)
  if (action || init.method === 'DELETE') {
    target = action ? `/v2/pods/${action[1]}/action` : `${target}/action`
    init = { ...init, method: 'POST', body: JSON.stringify({ action: action?.[2] ?? 'terminate' }) }
  } else if (parsed.pathname === '/pods' && init.method === 'POST') {
    const body = JSON.parse(String(init.body))
    init = { ...init, body: JSON.stringify({ name: body.name, templateId: body.templateId,
      cloud: 'SECURE', gpu: { id: body.gpuTypeIds[0], count: 1 }, disk: 20,
      mounts: { global: [{ volumeId: body.globalVolumeId, path: '/workspace' }] },
      ports: body.ports, env: body.env }) }
  } else if (parsed.pathname === '/pods') {
    target += parsed.searchParams.has('cursor') ? `?cursor=${encodeURIComponent(parsed.searchParams.get('cursor')!)}` : ''
  }
  return { url: `https://api.runpod.io${target}`, init }
}

export function normalizeGlobalPod(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value
  const pod = value as Record<string, unknown>
  return { ...pod, desiredStatus: pod.status, costPerHr: pod.cost }
}
