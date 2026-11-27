import snapshot from './monsters.json'
import { HARVEST_CREATURES } from './harvest-creatures'
import type { MonsterState } from '../types'

export type MonsterTemplate = Pick<MonsterState, 'type' | 'hp' | 'ac' | 'stats' | 'conditions' |
  'xpValue' | 'attackBonus' | 'damageDice' | 'speed' | 'attackName' | 'attackRangeCells' | 'damageType' | 'movementModes'>

export interface SrdMonsterRecord {
  sourceUrl: string
  sourceSha256: string
  source: Record<string, unknown> & { index: string; name: string }
  reference?: Record<string, unknown> & { index: string; name: string }
  errata?: Array<{ field: string; reason: string; sourceUrl: string }>
  engine: MonsterTemplate
}

// The maintenance script downloads and validates the API; no runtime network.
const records = {...snapshot.monsters,...HARVEST_CREATURES} as unknown as Record<string, SrdMonsterRecord>
export const MONSTER_RULESET = snapshot.ruleset
export const MONSTER_SOURCE_DATE = snapshot.retrievedAt
export function listMonsterTypes(): string[] { return Object.keys(records) }
export function getMonsterRecord(type: string): SrdMonsterRecord | undefined {
  return Object.hasOwn(records, type) ? records[type] : undefined
}
