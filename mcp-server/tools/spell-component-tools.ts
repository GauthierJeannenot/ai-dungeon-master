import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { SpellComponentConstraintSchema } from '../../lib/spell-component-state'
import { getState } from '../game-state'
import { available } from '../hero-rules'
import { changeSpellComponentConstraint, inspectSpellComponents } from '../spell-components'
import { toolkitResult, toolkitTransaction } from '../toolkit'

export function registerSpellComponentTools(server: McpServer) {
  server.registerTool('inspect_spell_components', {
    description: 'Read-only PHB2014 V/S/M preflight for an exact supported spell. Reads real hand loadout, owned exact component source, class focus and established gag/silence/bound-hands facts. No spell, item, slot, action, drawing, dice or area is created. Non-player hands/material inventories and worn/shield-mounted holy symbols are not modeled.',
    inputSchema: { spellId: z.string().min(1), casterId: z.string().optional(),
      materialItemId: z.string().optional(), focusItemId: z.string().optional() },
    annotations: { readOnlyHint: true },
  }, async input => toolkitTransaction(() => toolkitResult(inspectSpellComponents(getState(), input))))
  server.registerTool('set_spell_component_constraint', {
    description: 'Explicit MJ establishment/removal of an already known gag, silence or both bound hands on an exact existing actor, with stable ID and factual source. This is scene adjudication, not casting Silence, an automatic area, a free player maneuver, grappling, a condition immunity or an inferred dialogue restriction. Multiple facts coexist and require exact removal. Does not release items, grant equipment, move or consume actions.',
    inputSchema: { ...SpellComponentConstraintSchema.shape, operation: z.enum(['apply', 'remove']) },
  }, async input => toolkitTransaction(() => { available(); return toolkitResult(changeSpellComponentConstraint(input)) }))
}
