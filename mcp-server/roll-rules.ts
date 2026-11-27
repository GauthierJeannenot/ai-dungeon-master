import type { EntityStats } from '../lib/types'
import { armorRollDisadvantage } from '../lib/armor-penalties'
import type { DMInspirationRollKind } from '../lib/dm-inspiration-state'
import { exhaustionDisadvantage } from '../lib/exhaustion'
import { desecratedGroundContact } from '../lib/desecrated-ground-state'
import { monsterSource } from './monster-rules'
import { dmInspirationReady, rollWithDmInspiration } from './dm-inspiration'
import { toolkitError } from './toolkit'
import * as gs from './game-state'

export function ruleRollAdvantage(entityId:string,kind:DMInspirationRollKind,advantage=false) {
  return Boolean(advantage||dmInspirationReady(entityId,kind))
}
export function ruleRollDisadvantage(entityId:string,kind:DMInspirationRollKind,disadvantage=false,ability?:keyof EntityStats) {
  return Boolean(disadvantage||exhaustionDisadvantage(gs.getState(),entityId,kind)||armorRollDisadvantage(gs.getState(),entityId,ability))
}
/** Validated actual d20 only: no arbitrary roll_dice, pending rerolls or
 * automatic failures. Missing legacy exhaustion levels are never guessed. */
export function rollRuleD20(entityId:string,kind:DMInspirationRollKind,modifier:number,advantage=false,disadvantage=false,ability?:keyof EntityStats) {
  const state=gs.getState(),entity=gs.getEntity(entityId)
  if(entity?.conditions.includes('exhaustion')&&!state.dmTools?.exhaustion?.creatures[entityId])
    toolkitError('EXHAUSTION_LEVEL_REQUIRED','This legacy exhaustion condition has no level; an explicit authoritative level is required before resolving its d20 effects.')
  const body = kind === 'save' && state.dmTools?.desecratedGround ? gs.getPhysicalCreature(entityId) : undefined
  const desecrated = Boolean(body && 'type' in body && monsterSource(body)?.type === 'undead' && desecratedGroundContact(state, body))
  const roll = rollWithDmInspiration(entityId,kind,modifier,advantage || desecrated,ruleRollDisadvantage(entityId,kind,disadvantage,ability))
  if (desecrated) roll.detail += ' | sol profané'
  return roll
}
