import { getLlmProvider } from './dm/llm-config'

export interface RunpodServerlessConfig {
  mode?: 'serverless'
  endpointId: string
  apiKey: string
  inferenceBaseUrl: string
}

export interface RunpodPodConfig {
  mode: 'pod'
  apiKey: string
  podId?: string
  globalVolumeId: string
  templateId: string
  gpuTypes: string[]
  port: number
  maxHourlyUsd: number
}
export type RunpodConfig = RunpodServerlessConfig | RunpodPodConfig

// Le contrôle de capacité est un opt-in serveur. Aucun appel de gestion ne
// doit partir dans les tests/mock, ni lorsque les appels payants sont bloqués.
export function getRunpodConfig(): RunpodConfig | null {
  if (process.env.RUNPOD_AUTO_MANAGE !== 'true' || process.env.LLM_MODE === 'mock'
    || process.env.ALLOW_PAID_LLM === 'false') return null
  if (getLlmProvider() !== 'vllm') throw new Error('RUNPOD_AUTO_MANAGE nécessite LLM_PROVIDER=vllm.')
  if (process.env.RUNPOD_MODE === 'pod') {
    const identifier = (name: string, optional = false) => {
      const value = process.env[name]?.trim()
      if (optional && !value) return undefined
      if (!value || !/^[a-zA-Z0-9_-]{1,80}$/.test(value)) throw new Error(`${name} manquant ou invalide.`)
      return value
    }
    const apiKey = process.env.RUNPOD_API_KEY?.trim()
    if (!apiKey) throw new Error('RUNPOD_API_KEY manquante pour le contrôle du Pod.')
    const port = Number(process.env.RUNPOD_POD_PORT || 8000)
    const maxHourlyUsd = Number(process.env.RUNPOD_MAX_HOURLY_USD || 3)
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('RUNPOD_POD_PORT invalide.')
    if (!Number.isFinite(maxHourlyUsd) || maxHourlyUsd <= 0 || maxHourlyUsd > 3) throw new Error('RUNPOD_MAX_HOURLY_USD doit être compris entre 0 et 3 $.')
    const gpuTypes = (process.env.RUNPOD_GPU_TYPES || 'NVIDIA H100 PCIe,NVIDIA A100 80GB PCIe').split(',').map(value => value.trim()).filter(Boolean)
    if (!gpuTypes.length) throw new Error('RUNPOD_GPU_TYPES vide.')
    const globalVolumeId = identifier('RUNPOD_GLOBAL_VOLUME_ID')!
    return { mode: 'pod', apiKey, podId: identifier('RUNPOD_POD_ID', true),
      globalVolumeId, templateId: identifier('RUNPOD_TEMPLATE_ID')!, port, maxHourlyUsd, gpuTypes }
  }
  if (process.env.RUNPOD_MODE && process.env.RUNPOD_MODE !== 'serverless') throw new Error('RUNPOD_MODE doit valoir pod ou serverless.')
  const endpointId = process.env.RUNPOD_ENDPOINT_ID?.trim()
  const apiKey = process.env.RUNPOD_API_KEY?.trim()
  if (!endpointId || !/^[a-zA-Z0-9_-]{1,80}$/.test(endpointId)) throw new Error('RUNPOD_ENDPOINT_ID manquant ou invalide.')
  if (!apiKey) throw new Error('RUNPOD_API_KEY manquante pour le contrôle du worker.')
  // Le health de l'endpoint queue-based permet de drainer aussi les requêtes
  // dont le client HTTP a abandonné l'attente. Ne pas piloter un autre endpoint.
  const inferenceBaseUrl = `https://api.runpod.ai/v2/${endpointId}/openai/v1`
  if (process.env.VLLM_BASE_URL?.trim().replace(/\/$/, '') !== inferenceBaseUrl) {
    throw new Error('RUNPOD_AUTO_MANAGE nécessite VLLM_BASE_URL=https://api.runpod.ai/v2/<RUNPOD_ENDPOINT_ID>/openai/v1.')
  }
  return { endpointId, apiKey, inferenceBaseUrl }
}
