import type { AdventureNpcSpec } from './adventure-map'
import type { MonsterState, NpcState } from './types'
import { getMonsterRecord } from './srd/monsters'

export function createNpcState(spec: AdventureNpcSpec, mapId: string): NpcState {
  const type = spec.statBlock ?? spec.reactive?.combatTemplate ?? spec.kind
  const record = getMonsterRecord(type)
  if (!record) throw new Error(`NPC_STAT_BLOCK_MISSING: ${spec.id} (${type})`)
  const count = spec.group?.members.length ?? 1
  if (!Number.isInteger(count) || count < 1) throw new Error(`NPC_GROUP_EMPTY: ${spec.id}`)
  const maximum = record.engine.hp.max * count
  const current = spec.initialHp ?? maximum
  if (!Number.isInteger(current) || current < 0 || current > maximum) throw new Error(`NPC_HP_INVALID: ${spec.id}`)
  const npc: NpcState = {
    ...structuredClone(record.engine),
    id: spec.id, name: spec.name, kind: spec.kind,
    socialIdentity: spec.socialIdentity,
    position: { ...spec.cell }, roomId: spec.roomId, mapId,
    disposition: spec.disposition, visible: spec.visibleFromStart,
    description: spec.description, hp: { current, max: maximum },
    isAlive: current > 0, hostile: spec.disposition === 'hostile',
    srd: { index: record.source.index, ruleset: '2014', url: record.sourceUrl },
    statBlock: { type, name: spec.group?.name ?? String(record.source.name), ruleset: '2014',
      sourceUrl: record.sourceUrl, sourceSha256: record.sourceSha256,
      published: structuredClone(record.reference ?? record.source),
      ...(spec.group ? { homebrew: 'Shared HP group: one member removed per full individual HP lost; attacks scale with remaining members. No healing or temporary HP. Losses do not choose named victims or assert their death.' } : {}) },
  }
  if (spec.group) npc.group = {
    rule: 'shared-hp-attrition-v1', name: spec.group.name,
    members: structuredClone(spec.group.members), initialCount: count,
    remainingCount: Math.ceil(current / record.engine.hp.max), memberMaxHp: record.engine.hp.max,
    incapacitatedCount: count - Math.ceil(current / record.engine.hp.max),
    cannotRegainHp: true, cannotGainTemporaryHp: true,
  }
  if (npc.group) npc.damageDice = groupDamageDice(npc as MonsterState, record.engine.damageDice)
  return npc
}

export function isStatBackedNpc(npc: NpcState | undefined): npc is NpcState & MonsterState {
  return Boolean(npc?.statBlock && npc.type && npc.hp && npc.stats && npc.conditions
    && npc.ac !== undefined && npc.speed !== undefined && npc.attackBonus !== undefined
    && npc.damageDice && npc.xpValue !== undefined && npc.isAlive !== undefined)
}

// Public hydration only. Existing HP, conditions, life episodes and positions win.
export function hydrateNpcStatBlocks(npcs: Record<string, NpcState>, specs: AdventureNpcSpec[], improvisedSources:Record<string,{statBlock:string}>={}): Record<string, NpcState> {
  const authoredIds=new Set(specs.map(spec=>spec.id)),actualSpecs=[...specs]
  for(const[id,source]of Object.entries(improvisedSources)){
    const npc=npcs[id]
    if(!npc||authoredIds.has(id)||isStatBackedNpc(npc))continue
    // Retain an unknown legacy zero-HP life history unchanged. It cannot be
    // declared alive/dead, activated or revived merely by restoring its block.
    if(npc.hp?.current===0&&npc.isAlive===undefined)continue
    actualSpecs.push({id,name:npc.name,kind:npc.kind,statBlock:source.statBlock,cell:{...npc.position},roomId:npc.roomId??null,
      mapId:npc.mapId,disposition:npc.disposition,visibleFromStart:npc.visible,description:npc.description})
  }
  for (const spec of actualSpecs) {
    const npc = npcs[spec.id]
    if (!npc || isStatBackedNpc(npc)) continue
    const seeded = createNpcState(spec, npc.mapId ?? spec.mapId ?? '')
    const hp = npc.hp ? { ...npc.hp } : seeded.hp!
    if (hp.current === 0 && npc.isAlive === undefined)
      throw new Error(`NPC_ZERO_HP_LEGACY_REQUIRES_MIGRATION: ${npc.id}`)
    // Legacy grouped tokens already injured retain their exact HP and maximum;
    // their historical member count cannot be reconstructed safely.
    if (seeded.group && npc.hp && npc.hp.max !== seeded.hp!.max)
      throw new Error(`NPC_GROUP_LEGACY_HP_REQUIRES_MIGRATION: ${npc.id}`)
    npcs[spec.id] = { ...seeded, ...npc, hp,
      conditions: npc.conditions ?? seeded.conditions,
      isAlive: npc.isAlive ?? hp.current > 0 }
    if (npcs[spec.id].group) reconcileNpcGroup(npcs[spec.id] as MonsterState)
  }
  return npcs
}

export function reconcileNpcGroup(actor: MonsterState): void {
  if (!actor.group) return
  const group = actor.group
  group.remainingCount = Math.min(group.remainingCount, Math.ceil(actor.hp.current / group.memberMaxHp))
  group.incapacitatedCount = group.initialCount - group.remainingCount
  const base = getMonsterRecord(actor.type)
  if (base) actor.damageDice = group.remainingCount > 0 ? groupDamageDice(actor, base.engine.damageDice) : '0'
}

export function groupDamageDice(actor: MonsterState, dice: string): string {
  if (!actor.group) return dice
  const match = /^(\d+)d(\d+)(?:\s*([+-])\s*(\d+))?$/.exec(dice)
  if (!match || actor.group.remainingCount < 1) throw new Error('NPC_GROUP_ATTACK_UNAVAILABLE')
  const count = actor.group.remainingCount
  const modifier = Number(match[4] ?? 0) * (match[3] === '-' ? -1 : 1) * count
  return `${Number(match[1]) * count}d${match[2]}${modifier ? `${modifier > 0 ? '+' : ''}${modifier}` : ''}`
}
