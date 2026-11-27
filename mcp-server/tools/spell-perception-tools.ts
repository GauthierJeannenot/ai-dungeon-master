import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { inspectSpellPerception } from '../spell-perception'
import { toolkitResult,toolkitTransaction } from '../toolkit'
export function registerSpellPerceptionTools(server:McpServer){
 server.registerTool('inspect_spellcasting_perception',{description:'Read one exact observer response captured from a real original cast. Original V/S/M and actual selected sensory channels only, before invisibility ends or material is consumed; no fresh retroactive perception. Does not identify the spell, disclose its level/hidden targets, attribute a caster from an effect alone, roll, spend action/reaction, cast or create a scene fact. Observer must have been explicitly selected by spellObservers at the real original producer.',inputSchema:{eventId:z.string().min(1).max(180),observerId:z.string().min(1).max(180)},annotations:{readOnlyHint:true,idempotentHint:true}},async input=>toolkitTransaction(()=>toolkitResult(inspectSpellPerception(input.eventId,input.observerId))))
}
