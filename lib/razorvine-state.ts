import { z } from 'zod'
import type { GameState, WorldFact } from './types'
import type { GridCell } from './adventure-map'
import { groundGearPhysicalWitness as witness } from './ground-gear-recovery-state'

const Id = z.string().min(1).max(80).regex(/^[a-zA-Z0-9][a-zA-Z0-9_:.-]*$/)
  .refine(value => !['constructor', 'prototype', '__proto__'].includes(value))
const EntityId = z.string().min(1).max(180).refine(value => !['constructor', 'prototype', '__proto__'].includes(value))
const Cell = z.object({ x: z.number().int().nonnegative(), y: z.number().int().nonnegative() }).strict()
const Reason = z.string().trim().min(1).max(1000)
export const RAZORVINE_SOURCE = 'DMG2014 Razorvine, rules/books/dmg-2014.md:4346–4350'
export const RAZORVINE_SAVE = 'razorvine-direct-contact-save'
export const RAZORVINE_IMMUNITIES = ['bludgeoning', 'piercing', 'psychic'] as const
export const RecordRazorvineSchema = z.object({
  hedgeId: Id, baseSurfaceId: Id, firstCell: Cell, secondCell: Cell, factId: EntityId,
  actualRootedRazorvineConfirmed: z.literal(true), observedBlocksSight: z.boolean(),
}).strict()
export const ResolveRazorvineContactSchema = z.object({
  eventId: Id, hedgeId: Id, creatureId: EntityId, faceCell: Cell, reason: Reason,
  actualDirectContactConfirmed: z.literal(true),
}).strict()
export const RazorvineObjectSchema = z.object({
  input: RecordRazorvineSchema, at: z.number().finite().nonnegative(), baseZFeet: z.number().finite(),
  surfaceWitness: z.string().min(1), factWitness: z.string().min(1),
}).strict()
const Contact = z.object({
  input: ResolveRazorvineContactSchema, mapId: EntityId, cell: Cell, turnKey: z.string(),
  at: z.number().finite().nonnegative(), bodyWitness: z.string(), hedgeWitness: z.string(),
  heldWitness: z.string().optional(), result: z.record(z.string(), z.unknown()).optional(), resultWitness: z.string().optional(),
}).strict()
export const RazorvineStateSchema = z.object({ version: z.literal(1), contacts: z.record(z.string(), Contact) }).strict()
export type RazorvineContact = z.infer<typeof Contact>
export type RazorvineObject = z.infer<typeof RazorvineObjectSchema>
export const razorvineStateOf = (state: GameState) => state.dmTools?.razorvine
export const sameRazorvineCell = (a: GridCell, b: GridCell) => a.x === b.x && a.y === b.y
export const adjacentRazorvineFace = (a: GridCell, b: GridCell) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1
export const razorvineTurnKey = (state: GameState) => `${state.combatGeneration ?? 0}:${state.turnCounter ?? 0}`
export function sceneObjectFootprint(object: { cell: GridCell; size: string; razorvine?: RazorvineObject }): GridCell[] {
  if (object.razorvine) return [object.cell, object.razorvine.input.secondCell]
  if (object.size !== 'large') return [object.cell]
  const { x, y } = object.cell
  return [object.cell, { x: x + 1, y }, { x, y: y + 1 }, { x: x + 1, y: y + 1 }]
}
export function activeRazorvineObjects(state: GameState) {
  return Object.values(state.dmTools?.objects ?? {}).filter(object =>
    object.razorvine && object.mapId === state.currentMapId && object.state !== 'destroyed' && object.hp.current > 0)
}
export function razorvineHedgeWitness(hedge: { id: string; mapId: string; cell: GridCell; creation: string; razorvine?: RazorvineObject }) {
  return witness({ id: hedge.id, mapId: hedge.mapId, cell: hedge.cell, creation: hedge.creation, razorvine: hedge.razorvine })
}
function historicalFact(state: GameState, id: string, evidence: string) {
  const live = state.worldFacts?.find(value => value.id === id)
  if (live) return witness(live) === evidence ? live : undefined
  try { return JSON.parse(evidence) as WorldFact | undefined } catch { return undefined }
}

export function validateRazorvineHistory(state: GameState) {
  const issues: string[] = [], at = state.worldTimeSeconds ?? 0, cells = new Set<string>()
  for (const [id, hedge] of Object.entries(state.dmTools?.objects ?? {})) {
    const vine = hedge.razorvine
    if (!vine && hedge.material !== 'razorvine') continue
    if (!vine || hedge.material !== 'razorvine' || hedge.kind !== 'obstacle' || hedge.id !== id) {
      issues.push('A razorvine plant requires its exact sourced obstacle profile.')
      continue
    }
    const surface = state.dmTools?.jumping?.surfaces[vine.input.baseSurfaceId]
    const fact = historicalFact(state, vine.input.factId, vine.factWitness)
    if (!RazorvineObjectSchema.safeParse(vine).success || vine.input.hedgeId !== id
      || !sameRazorvineCell(hedge.cell, vine.input.firstCell) || !adjacentRazorvineFace(hedge.cell, vine.input.secondCell)
      || vine.at > at || !surface || surface.kind !== 'support' || surface.objectId || surface.at > vine.at
      || surface.mapId !== hedge.mapId || surface.roomId !== hedge.roomId || surface.elevationFeet !== vine.baseZFeet
      || witness(surface) !== vine.surfaceWitness
      || !fact?.narrativeEffect?.cell || fact.id !== vine.input.factId || fact.source !== 'record_scene_fact'
      || fact.expires !== 'never' || fact.mapId !== hedge.mapId || fact.roomId !== hedge.roomId
      || witness(fact) !== vine.factWitness || !sceneObjectFootprint(hedge).some(cell => sameRazorvineCell(cell, fact.narrativeEffect!.cell))
      || hedge.creation !== witness(vine.input) || hedge.size !== 'large' || hedge.resilience !== 'resilient'
      || hedge.ac !== 11 || hedge.hp.max !== 25 || hedge.hp.current > 25
      || hedge.state !== (hedge.hp.current ? 'intact' : 'destroyed') || hedge.blocksSight !== vine.input.observedBlocksSight || hedge.locked || hedge.contents.length
      || witness(hedge.damageProfile?.immunities) !== witness(RAZORVINE_IMMUNITIES)
      || hedge.damageProfile?.resistances.length || hedge.damageProfile?.vulnerabilities.length
      || hedge.damageProfile?.damageThreshold !== 0 || hedge.damageProfile.magicalResilience
      || sceneObjectFootprint(hedge).some(cell => !surface.cells.some(other => sameRazorvineCell(cell, other))))
      issues.push('Retain the original sourced two-cell razorvine, measured base, fixed profile, and actual damage state.')
    for (const cell of sceneObjectFootprint(hedge)) {
      const key = witness([hedge.mapId, vine.baseZFeet, cell])
      if (cells.has(key)) issues.push('A measured thorn footprint cannot acquire another source hedge by nonce.')
      cells.add(key)
    }
  }
  const data = razorvineStateOf(state), turnReceipts = new Set<string>()
  if (data && (!RazorvineStateSchema.safeParse(data).success || Object.keys(data.contacts).length > 512))
    return [...issues, 'Invalid retained razorvine contact history.']
  const pending = state.hero?.pending
  const resolution = pending?.command.toolkitResolution as { domain?: string; command?: { eventId?: string } } | undefined
  let active: string | undefined
  for (const [id, contact] of Object.entries(data?.contacts ?? {})) {
    const hedge = state.dmTools?.objects[contact.input.hedgeId]
    const turn = contact.turnKey.split(':').map(Number), key = witness([contact.input.creatureId, contact.turnKey])
    if (id !== contact.input.eventId || !hedge?.razorvine || hedge.mapId !== contact.mapId || contact.at < hedge.razorvine.at || contact.at > at
      || hedge && razorvineHedgeWitness(hedge) !== contact.hedgeWitness
      || !hedge || !sceneObjectFootprint(hedge).some(cell => sameRazorvineCell(cell, contact.input.faceCell))
      || !adjacentRazorvineFace(contact.cell, contact.input.faceCell) || turnReceipts.has(key)
      || !/^\d+:\d+$/.test(contact.turnKey) || turn[0] < 1 || turn[0] > (state.combatGeneration ?? 0)
      || turn[0] === (state.combatGeneration ?? 0) && turn[1] > (state.turnCounter ?? 0))
      issues.push('Each first direct razorvine contact retains its exact real face, body, original hedge and actual global turn.')
    turnReceipts.add(key)
    if (contact.result ? contact.resultWitness !== witness(contact.result) : contact.resultWitness !== undefined)
      issues.push('A completed razorvine contact retains its original single save and damage receipt.')
    if (!contact.result) {
      if (active) issues.push('Only one actual thorn save can be held at once.')
      active = id
      const body = contact.input.creatureId === 'player' ? state.player : state.monsters[contact.input.creatureId] ?? state.npcs?.[contact.input.creatureId]
      const save = pending?.command.result as { ability?: string; dc?: number; entityId?: string } | undefined
      if (state.phase !== 'combat' || contact.turnKey !== razorvineTurnKey(state) || !state.initiativeOrder.includes(contact.input.creatureId)
        || state.currentMapId !== contact.mapId || !body || !sameRazorvineCell(body.position, contact.cell)
        || !hedge?.hp.current || resolution?.domain !== RAZORVINE_SAVE || resolution.command?.eventId !== id
        || pending?.command.type !== 'save' || save?.ability !== 'dex' || save.dc !== 10 || save.entityId !== contact.input.creatureId
        || contact.heldWitness !== witness(pending))
        issues.push('Keep the original actual DC 10 Dexterity saving throw and matching held reaction witness.')
    }
  }
  if (resolution?.domain === RAZORVINE_SAVE && resolution.command?.eventId !== active)
    issues.push('A held razorvine saving throw requires its exact source contact.')
  return issues
}
