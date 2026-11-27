import type { GameState } from './types'
import { geometricDistanceCells } from './navigation'
import { findWeapon } from './srd/weapons'
import { getSpell } from './srd/spells'

export interface CombatAttackOption {
  id: string
  label: string
  rangeCells: number
  detail: string
  disabledReason: string | null
  message: string
}

// Advisory client view, never an MCP command or an authoritative preflight.
// Each button expresses the player's exact choice through the usual DM agent.
export function combatAttackOptions(state: GameState, targetId: string): CombatAttackOption[] {
  const target = state.monsters[targetId]
  if (state.phase !== 'combat' || !state.initiativeOrder.includes(targetId) ||
    !target?.isAlive || target.hp.current <= 0 || target.hostile === false || !target.position) return []

  const { player } = state
  const distance = geometricDistanceCells(player.position, target.position)
  const blocked = state.currentTurn !== 'player' ? 'Attends ton tour'
    : player.hp.current <= 0 || player.deathSaves?.dead || player.conditions.some(condition =>
      ['incapacitated', 'unconscious', 'paralyzed', 'petrified', 'stunned'].includes(condition)) ? 'Impossible d’agir'
    : state.hero?.pending ? 'Réaction à résoudre' : null
  const actionAvailable = state.hero ? state.hero.actionCredits > 0 : !state.actionUsed.player
  const weaponActionAvailable = actionAvailable || (state.hero?.attackAction?.remaining ?? 0) > 0
  const options: CombatAttackOption[] = []
  const selectedTarget = `${target.name} (targetId=${JSON.stringify(targetId)})`
  const finish = ' Je ne termine pas mon tour.'

  const weapons = [...player.inventory, { id: 'unarmed', name: 'À mains nues', type: 'weapon' as const }]
  for (const item of weapons) {
    if (item.type !== 'weapon') continue
    const weapon = findWeapon(item.equipmentId ?? item.id)
    if (!weapon) continue
    const ranged = weapon.properties.includes('ranged')
    const modes = ranged ? ['ranged'] as const
      : weapon.properties.includes('thrown') ? ['melee', 'thrown'] as const : ['melee'] as const
    for (const mode of modes) {
      const rangeCells = mode === 'melee' ? weapon.reachCells ?? 1 : weapon.longRangeCells ?? weapon.rangeCells
      const normalRange = weapon.normalRangeCells ?? rangeCells
      const modeLabel = mode === 'melee' ? 'corps à corps' : mode === 'thrown' ? 'lancer' : 'tir'
      const ammunition = weapon.ammunitionType ? player.inventory.filter(stack => stack.type === 'misc' &&
        stack.ammunitionType === weapon.ammunitionType && Number.isSafeInteger(stack.quantity) && stack.quantity! > 0) : []
      const stocks = weapon.ammunitionType ? ammunition.length ? ammunition : [undefined] : [undefined]
      for (const stock of stocks) {
        const disabledReason = blocked ?? (!weaponActionAvailable ? 'Action utilisée' : null)
          ?? (distance > rangeCells ? 'Hors de portée' : null)
          ?? (weapon.ammunitionType && !stock ? 'Munitions épuisées' : null)
        options.push({
          id: `weapon:${item.id}:${mode}:${stock?.id ?? ''}`,
          label: `${item.name} · ${modeLabel}${stock ? ` · ${stock.name}` : ''}`,
          rangeCells,
          detail: `Portée ${rangeCells} case${rangeCells > 1 ? 's' : ''}${mode !== 'melee' && distance > normalRange && distance <= rangeCells ? ' · longue portée : désavantage' : ''}`,
          disabledReason,
          message: `Je veux attaquer ${selectedTarget} avec ${item.name} (weaponOrSpell=${JSON.stringify(item.id)}), en ${modeLabel}${mode === 'thrown' ? ' (attackMode="thrown")' : mode === 'melee' ? ' (attackMode="melee")' : ''}${stock ? `, avec les munitions ${stock.name} (ammunitionItemId=${JSON.stringify(stock.id)})` : ''}.${finish}`,
        })
      }
    }
  }

  for (const spellId of new Set(player.knownSpells ?? [])) {
    const spell = getSpell(spellId)
    if (!spell || spell.explorationOnly || !(spell.target === 'enemy' || spell.effect.kind === 'condition')) continue
    const levels = spell.level === 0 ? [0] : Object.entries(player.spellSlots ?? {})
      .filter(([key, slot]) => Number(key.slice(5)) >= spell.level && slot.current > 0)
      .map(([key]) => Number(key.slice(5)))
    for (const slotLevel of levels.length ? levels : [spell.level]) {
      const disabledReason = blocked ?? (!actionAvailable ? 'Action utilisée' : null)
        ?? (state.hero?.bonusSpellCast && spell.level > 0 ? 'Seul un tour de magie est encore possible' : null)
        ?? (distance > spell.rangeCells ? 'Hors de portée' : null)
        ?? (!levels.length ? 'Aucun emplacement disponible' : null)
      options.push({
        id: `spell:${spell.id}:${slotLevel}`,
        label: `${spell.label} · ${slotLevel === 0 ? 'tour de magie' : `niveau ${slotLevel}`}`,
        rangeCells: spell.rangeCells,
        detail: `Portée ${spell.rangeCells} case${spell.rangeCells > 1 ? 's' : ''}`,
        disabledReason,
        message: `Je veux lancer ${spell.label} (spellId=${JSON.stringify(spell.id)}${slotLevel > 0 ? `, slotLevel=${slotLevel}` : ''}) sur ${selectedTarget}.${finish}`,
      })
    }
  }
  return options
}
