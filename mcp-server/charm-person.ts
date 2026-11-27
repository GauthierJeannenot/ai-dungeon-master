import type { MonsterState, PlayerState } from '../lib/types'
import { getAdventureMap } from '../lib/adventure-map'
import { getMonsterRecord } from '../lib/srd/monsters'
import * as gs from './game-state'
import { addHeroEffect, distance, fail, now } from './hero-rules'
import { conditionImmune, creatureSavingThrow, monsterSource } from './monster-rules'
import { canSee } from './monster-perception'

type Creature = PlayerState | MonsterState

// A narrative NPC keeps its own token/disposition. Its authored block supplies
// mechanics only; casting never spawns a combatant or invents missing stats.
export function charmTarget(id: string): Creature {
  const npc = gs.getNpc(id)
  if (npc && (!npc.visible || !gs.npcOnCurrentMap(npc))) fail('SPELL_TARGET_UNSEEN', 'Choose a visible NPC on the current map.')
  if (npc?.group) fail('NPC_STATS_REQUIRED', 'Choose an individual humanoid; a shared group token is not one spell target.')
  const entity = gs.getEntity(id)
  if (entity) return entity
  if (!npc) fail('ENTITY_NOT_FOUND', `Unknown creature ${id}.`)
  const spec = getAdventureMap(gs.getState()).npcs.find(n => n.id === id)
  const record = getMonsterRecord(spec?.statBlock ?? spec?.reactive?.combatTemplate ?? npc.kind)
  if (!record) fail('NPC_STATS_REQUIRED', 'This NPC needs an authored SRD statBlock before resolving a spell save.')
  return { ...structuredClone(record.engine), id, name: npc.name, position: { ...npc.position },
    isAlive: true, hostile: npc.disposition === 'hostile' }
}

export function validateCharmTargets(caster: Creature, targets: Creature[], allowWrongType = false): void {
  for (const target of targets) {
    if (allowWrongType && target.id !== 'player' && !monsterSource(target)?.type)
      fail('SPELL_TARGET_TYPE_UNREPRESENTED', 'This creature needs its real represented source type; an absent source is not an invalid spell target.')
    if (!allowWrongType && target.id !== 'player' && monsterSource(target)?.type !== 'humanoid')
      fail('CHARM_REQUIRES_HUMANOID', 'Charm Person only affects humanoids.')
    if (!canSee(caster, target)) fail('SPELL_TARGET_UNSEEN', 'Charm Person requires a humanoid you can see.')
  }
  if (targets.some(a => targets.some(b => distance(a.position, b.position) > 6)))
    fail('TARGET_SEPARATION', 'Charm Person targets must be within 30 feet of each other.')
}

export function resolveCharmPerson(caster: Creature, target: Creature, dc: number, slotLevel: number, seconds: number) {
  if (conditionImmune(target, 'charmed')) return { targetId: target.id, charmed: false, immune: true }
  const friendly = (e: Creature) => e.id === 'player' || 'hostile' in e && e.hostile === false
  const fighting = gs.getState().phase === 'combat' && gs.getState().initiativeOrder.includes(target.id)
    && friendly(caster) !== friendly(target)
  const save = creatureSavingThrow(target, 'wis', dc, true, 'charmed', fighting)
  if (save.success) return { targetId: target.id, charmed: false, save }
  const effect = addHeroEffect('charm-person', caster.id, [target.id], seconds, {
    spellId: 'charm-person', slotLevel, targetName: target.name, sourceName: caster.name,
    ...(gs.getEntity(target.id) ? { condition: 'charmed' } : {}),
  })
  const worldFact = gs.addWorldFact({
    source: 'cast_spell:charm-person', mapId: gs.getState().currentMapId!, expires: 'never',
    text: `${target.name} (${target.id}) est charmé(e) par ${caster.name} (${caster.id}) jusqu’au temps moteur ${now() + seconds} s (Charme-personne). La cible considère le lanceur comme une connaissance amicale : aucun contrôle mental ni obéissance automatique. Le charme cesse si le lanceur ou ses compagnons lui font du mal ; à la fin, la cible sait qui l’a charmée.`,
  })
  effect.data.worldFactId = worldFact.id
  return { targetId: target.id, charmed: true, save, expiresAt: effect.expiresAt, worldFact }
}
