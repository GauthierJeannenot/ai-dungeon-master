import type { AbilityCheckResult, GameState } from '../lib/types'
import { groundGearTurnKey, type GroundGearContact } from '../lib/ground-gear-state'
import { groundGearPhysicalWitness as witness } from '../lib/ground-gear-recovery-state'
import { actualSurfaceAt } from '../lib/jumping-state'
import { engineGeometry } from './navigation'
import { navigationGrid } from '../lib/navigation'
import {
  RecordSlipperyIceSchema, sameIceCell, slipperyIceAtBody, slipperyIceZones,
  SLIPPERY_ICE_CHECK, SLIPPERY_ICE_LABEL, SLIPPERY_ICE_SOURCE, validateSlipperyIceState,
} from '../lib/slippery-ice-state'
import { available, now } from './hero-rules'
import { checkedResolution, registerCheckedResolution } from './toolkit-checks'
import { finishGroundGearContact } from './ground-gear-resolution'
import { toolkitError, toolkitResult, toolkitState } from './toolkit'
import * as gs from './game-state'

export function recordSlipperyIce(raw: unknown) {
  const input = RecordSlipperyIceSchema.parse(raw), state = gs.getState()
  const ledger = state.dmTools?.slipperyIce, old = ledger?.zones[input.zoneId]
  if (old) {
    if (witness(old.input) !== witness(input)) toolkitError('SLIPPERY_ICE_ZONE_CONFLICT', 'Retain the original exact measured ice and its public scene fact.')
    return { success: true, zone: old, replayed: true, source: SLIPPERY_ICE_SOURCE }
  }
  available()
  if (slipperyIceZones(state).length >= 64) toolkitError('SLIPPERY_ICE_ZONE_LIMIT', 'The retained actual ice zone capacity is full.')
  const surface = state.dmTools?.jumping?.surfaces[input.surfaceId]
  if (!surface || surface.kind !== 'support' || surface.objectId || surface.mapId !== state.currentMapId || surface.roomId !== state.currentRoomId)
    toolkitError('SLIPPERY_ICE_SUPPORT_REQUIRED', 'Choose a real previously measured terrain support in the actual current room.')
  const grid = navigationGrid(state, 'player', engineGeometry(), { ignoreActorEffects: true, ignoreDoorKnowledge: true })
  if (new Set(input.cells.map(cell => witness(cell))).size !== input.cells.length
    || input.cells.some(cell => !surface.cells.some(value => sameIceCell(value, cell)) || !grid.free(cell, false)
      || actualSurfaceAt(state, cell, surface.elevationFeet).filter(value => value.kind === 'support').length !== 1))
    toolkitError('SLIPPERY_ICE_FOOTPRINT_REQUIRED', 'Each chosen cell must be distinct actual walkable terrain on the exact measured support.')
  if (slipperyIceZones(state).some(zone => zone.mapId === surface.mapId && zone.elevationFeet === surface.elevationFeet
    && zone.input.cells.some(cell => input.cells.some(value => sameIceCell(value, cell)))))
    toolkitError('SLIPPERY_ICE_OVERLAP', 'An already qualified ice cell on the same level cannot be qualified again under another ID.')
  const fact = state.worldFacts?.find(value => value.id === input.factId)
  if (!fact?.narrativeEffect || fact.source !== 'record_scene_fact' || fact.expires !== 'never'
    || fact.mapId !== surface.mapId || fact.roomId !== surface.roomId
    || !input.cells.some(cell => sameIceCell(cell, fact.narrativeEffect!.cell)))
    toolkitError('SLIPPERY_ICE_FACT_REQUIRED', 'Choose the durable public scene fact that actually locates this slippery ice on a selected cell.')
  const zone = { input, mapId: surface.mapId, roomId: surface.roomId, elevationFeet: surface.elevationFeet,
    surfaceWitness: witness(surface), factWitness: witness(fact), at: now() }
  const tools = toolkitState()
  ;(tools.slipperyIce ??= { version: 1, zones: {} }).zones[input.zoneId] = zone
  return { success: true, zone, source: SLIPPERY_ICE_SOURCE }
}

export function inspectSlipperyIce(state: GameState) {
  const zones = slipperyIceZones(state).filter(zone => zone.mapId === state.currentMapId)
  const contacts = Object.values(state.dmTools?.groundGear?.contacts ?? {}).filter(contact => contact.slipperyIceEntry && contact.mapId === state.currentMapId)
  return { source: SLIPPERY_ICE_SOURCE, zones, pendingEntries: contacts.filter(contact => contact.status !== 'resolved'),
    resolvedEntries: contacts.filter(contact => contact.status === 'resolved'), initiativeActive: state.phase === 'combat' }
}

function iceContact(id: string) {
  const contact = gs.getState().dmTools?.groundGear?.contacts[id]
  if (!contact?.slipperyIceEntry) toolkitError('SLIPPERY_ICE_CONTACT_REQUIRED', 'Choose an exact retained ice entry from committed movement.')
  return contact
}

function assertCurrentIceContact(contact: GroundGearContact) {
  const state = gs.getState(), body = gs.getPhysicalCreature(contact.entityId)
  if (!body || state.phase !== 'combat' || !state.initiativeOrder.includes(contact.entityId)
    || state.currentMapId !== contact.mapId || groundGearTurnKey(state) !== contact.turnKey
    || !sameIceCell(body.position, contact.cell)
    || slipperyIceAtBody(state, body.id, contact.cell)?.zone?.input.zoneId !== contact.slipperyIceEntry!.zoneId)
    toolkitError('SLIPPERY_ICE_CONTEXT_CHANGED', 'The exact body, measured destination support and original initiative turn must remain actual before the check and any reaction dice.')
  return body
}

function finishIceContact(command: Record<string, unknown>, check: AbilityCheckResult) {
  const contact = iceContact(String(command.contactId)), body = assertCurrentIceContact(contact)
  if (contact.status !== 'resolving' || contact.cursor !== 0 || check.entityId !== body.id
    || check.ability !== 'dex' || check.dc !== 10 || check.label !== SLIPPERY_ICE_LABEL || typeof check.success !== 'boolean')
    toolkitError('SLIPPERY_ICE_CHECK_CHANGED', 'Retain the exact original Dexterity (Acrobatics) check before applying its single consequence.')
  const wasProne = body.conditions.includes('prone')
  const prone = check.success ? undefined : gs.withPhysicalCreatureResolution([body.id], () => gs.applyCondition(body.id, 'prone', { deferReconcile: true }))
  contact.stopMovement = Boolean(!wasProne && prone?.applied)
  contact.results.push({ kind: 'slippery_ice', check, ...(prone ? { prone } : {}) })
  contact.cursor = 1
  return finishGroundGearContact(contact)
}

export function resolveSlipperyIceEntry(id: string) {
  const contact = iceContact(id)
  if (contact.status === 'resolved') return toolkitResult({ ...contact.finalResult, replayed: true })
  if (contact.status === 'waiting' && contact.slipperyIceEntry?.shoveAside) {
    const issues = validateSlipperyIceState(gs.getState())
    if (issues.length) toolkitError('SLIPPERY_ICE_CONTEXT_CHANGED', issues.join(' '))
  }
  const body = assertCurrentIceContact(contact), pending = gs.getState().hero?.pending
  if (contact.status === 'resolving') {
    validateHeldSlipperyIceCheck(pending?.command ?? {})
    if (!pending || (pending.command.toolkitResolution as { domain?: string } | undefined)?.domain !== SLIPPERY_ICE_CHECK)
      toolkitError('SLIPPERY_ICE_CHECK_CHANGED', 'The original held check must finish before another result can be recorded.')
    return toolkitResult({ contactId: id, pendingReaction: pending, alreadyPending: true })
  }
  available({ allowGroundGearContactId: id })
  if (body.hp.current <= 0) {
    contact.stopMovement = true
    contact.results.push({ kind: 'slippery_ice', skipped: 'actual_body_no_longer_able_to_check' })
    contact.cursor = 1
    return finishGroundGearContact(contact)
  }
  contact.status = 'resolving'
  const answer = gs.withPhysicalCreatureResolution([body.id], () => checkedResolution({ entityId: body.id, ability: 'dex',
    skill: 'acrobatics', dc: 10, label: SLIPPERY_ICE_LABEL }, { domain: SLIPPERY_ICE_CHECK, command: { contactId: id } }))
  if (contact.status === 'resolving' && gs.getState().hero?.pending)
    contact.slipperyIceEntry!.heldCheckWitness = witness(gs.getState().hero!.pending)
  return answer
}

export function validateHeldSlipperyIceCheck(command: Record<string, unknown>) {
  const resolution = command.toolkitResolution as { domain?: string; command?: { contactId?: string } } | undefined
  if (resolution?.domain !== SLIPPERY_ICE_CHECK) return
  const contact = iceContact(String(resolution.command?.contactId))
  assertCurrentIceContact(contact)
  const issues = validateSlipperyIceState(gs.getState())
  if (issues.length) toolkitError('SLIPPERY_ICE_CHECK_CHANGED', issues.join(' '))
}

export function registerSlipperyIceResolution() {
  registerCheckedResolution(SLIPPERY_ICE_CHECK, (command, result) => finishIceContact(command, result as AbilityCheckResult))
}
