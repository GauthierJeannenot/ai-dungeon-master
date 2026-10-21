import { dbQuery } from './db'
import type { RunpodPodConfig } from './runpod-config'

export interface ManagedPodState {
  podId?: string
  pendingName?: string
  rejectedPod?: boolean
  created?: boolean
  blocked?: boolean
}

function controlId(config: RunpodPodConfig): string {
  return `global:${config.globalVolumeId}`
}

export async function loadManagedPod(config: RunpodPodConfig): Promise<ManagedPodState> {
  await dbQuery('INSERT INTO runpod_pod_state (control_id, state) VALUES ($1, $2) ON CONFLICT (control_id) DO NOTHING',
    [controlId(config), JSON.stringify({ podId: config.podId })])
  const result = await dbQuery<{ state: ManagedPodState }>('SELECT state FROM runpod_pod_state WHERE control_id = $1', [controlId(config)])
  return result.rows[0].state
}

export async function saveManagedPod(config: RunpodPodConfig, state: ManagedPodState): Promise<void> {
  await dbQuery('UPDATE runpod_pod_state SET state = $2, updated_at = now() WHERE control_id = $1',
    [controlId(config), JSON.stringify(state)])
}

export function podBaseUrl(config: RunpodPodConfig, podId: string): string {
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(podId)) throw new Error('Identifiant du Pod géré invalide.')
  return `https://${podId}-${config.port}.proxy.runpod.net/v1`
}

export async function managedPodBaseUrl(config: RunpodPodConfig): Promise<string> {
  const state = await loadManagedPod(config)
  if (!state.podId || state.pendingName || state.rejectedPod) throw new Error('Le Pod du MJ n’est pas encore disponible.')
  return podBaseUrl(config, state.podId)
}
