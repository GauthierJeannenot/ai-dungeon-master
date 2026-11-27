import { z } from 'zod'
import type { WaterEffect, WorldFact } from '../lib/types'
import { firstMapId, inferRoomIdOnMap } from '../lib/adventure-map'
import * as gs from './game-state'
import * as rules from './rules'
import { SceneEffectSchema, recordSceneEffect } from './scene-facts'

const CellSchema = z.object({ x: z.number().int().nonnegative(), y: z.number().int().nonnegative() }).strict()

export const WaterEffectSchema = SceneEffectSchema

// Used only for hydration of saved sessions, never as the cast_spell schema.
export const StoredWaterEffectSchema = z.union([
  WaterEffectSchema,
  z.discriminatedUnion('mode', [
    z.object({ mode: z.literal('container'), targetLabel: z.string(), cell: CellSchema, liters: z.number().positive().max(40) }).strict(),
    z.object({ mode: z.literal('rain'), targetLabel: z.string(), cell: CellSchema }).strict(),
    z.object({ mode: z.literal('extinguish'), targetLabel: z.string(), cell: CellSchema }).strict(),
  ]),
])

// Called before committing any action/slot. No interpretation of player text.
export function validateWaterEffect(input: unknown, rangeCells: number): WaterEffect {
  const parsed = WaterEffectSchema.safeParse(input)
  if (!parsed.success) {
    throw new rules.RuleViolation('WATER_EFFECT_REQUIRED', 'Describe the narrative consequence freely and supply its explicit cell. Stay within the spell limits.', {})
  }
  const effect = parsed.data
  rules.validateMapCell(effect.cell, 'waterEffect.cell')
  const state = gs.getState()
  const mapId = state.currentMapId ?? firstMapId(state)
  if (!state.currentRoomId || inferRoomIdOnMap(effect.cell, mapId, state) !== state.currentRoomId) {
    throw new rules.RuleViolation('WATER_TARGET_WRONG_ROOM', 'Water effects currently require a target in the player current room.', {})
  }
  const distance = rules.distanceCells(state.player.position, effect.cell)
  if (distance > rangeCells) {
    throw new rules.RuleViolation('TARGET_OUT_OF_RANGE', 'Water target is beyond the spell range.', { distance, rangeCells })
  }
  return effect
}

export function recordWaterEffect(effect: WaterEffect): WorldFact {
  return recordSceneEffect(effect, 'cast_spell:create-water', { waterEffect: effect })
}
