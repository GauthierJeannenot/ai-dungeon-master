import type { AbilityCheckResult, SavingThrowResult } from '../lib/types'
import { getEncounter } from '../lib/adventure-map'
import { checkedResolution, savedResolution, registerCheckedResolution } from './toolkit-checks'
import { resolveAbilityCheck } from './ability-check'
import { savingThrow } from './monster-rules'
import { resolveAttack } from './tools/combat-tools'
import * as gs from './game-state'
import { RuleViolation } from './rules'

const result = (data: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(data) }] })

function strike(command: Record<string, unknown>) {
  const attack = resolveAttack(String(command.attackerId), 'player', String(command.weaponOrSpell),
    undefined, undefined, undefined, undefined, undefined, { reaction: true })
  if ('isError' in attack && attack.isError) {
    const error = JSON.parse(attack.content[0].text)
    throw new RuleViolation(error.code, error.error, error.detail ?? {})
  }
  const resolved = JSON.parse(attack.content[0].text)
  if (resolved.pendingReaction) return result({ ...command, pendingReaction: resolved.pendingReaction,
    mechanicalSummary: 'Frappe d’embuscade suspendue : résoudre la réaction proposée avant de narrer ses conséquences.' })
  return result({ ...command, opportunityAttack: resolved,
    mechanicalSummary: 'Embuscade au seuil : une frappe de réaction résolue ; le combat continue selon son initiative.' })
}

function afterSave(command: Record<string, unknown>, save: SavingThrowResult) {
  if (save.success) return result({ ...command, save, avoided: true, damageDealt: 0,
    mechanicalSummary: 'Embuscade repérée : sauvegarde de Dextérité réussie, frappe évitée entièrement, aucun dégât.' })
  return strike({ ...command, save, avoided: false })
}

function afterPerception(command: Record<string, unknown>, perception: AbilityCheckResult) {
  const next = { ...command, perception }
  if (!perception.success) return strike(next)
  const dc = getEncounter(String(command.encounterId), gs.getState())!.noiseAmbush!.dexterityDc
  if (gs.getState().hero) return savedResolution({ entityId: 'player', ability: 'dex', dc, origin: String(command.attackerId) },
    { domain: 'encounter-ambush-save', command: next })
  return afterSave(next, savingThrow('player', 'dex', dc, false, undefined, String(command.attackerId)))
}

// Resumable checks preserve Inspiration/other hero reaction choices without rerolls.
export function registerAmbushResolutions() {
  registerCheckedResolution('encounter-ambush-perception', (command, check) => afterPerception(command, check as AbilityCheckResult))
  registerCheckedResolution('encounter-ambush-save', (command, save) => afterSave(command, save as SavingThrowResult))
}

export function resolveEncounterAmbush(command: Record<string, unknown>, suspicious: boolean) {
  if (!suspicious) return strike(command)
  const dc = getEncounter(String(command.encounterId), gs.getState())!.noiseAmbush!.perceptionDc
  const input = { entityId: 'player', ability: 'wis' as const, skill: 'perception', dc, label: 'Repérer une embuscade au seuil' }
  if (gs.getState().hero) return checkedResolution(input, { domain: 'encounter-ambush-perception', command })
  return afterPerception(command, resolveAbilityCheck({ ...input, passiveContest: true }))
}
