import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { CurseSelectionSchema, activeCurses } from '../../lib/curse-effects'
import { cast5eSpell } from '../hero-spells'
import { registerCurseResolution } from '../curses'
import { toolkitTransaction, toolkitResult, toolkitError } from '../toolkit'
import * as gs from '../game-state'

export function registerCurseTools(server:McpServer){
  registerCurseResolution()
  server.registerTool('cast_curse',{
    description:'Cast the actual known/prepared Bestow Curse or Remove Curse spell on one explicit creature within touch. Normal slots/actions/components/bonus-spell rules apply. Bestow Curse needs a selected implemented variant (one ability: disadvantage to checks and saves; or attacks against caster: disadvantage only against that caster), Wisdom save, and concentration for one minute at level 3 or ten at level 4. Remove Curse ends actual tracked curses, not invented narrative curses or a cursed-item catalog. No free application/removal, automatic spell preparation or generic preliminary roll.',
    inputSchema:{spellId:z.enum(['bestow-curse','remove-curse']),targetId:z.string().min(1),slotLevel:z.number().int().min(3).max(4).optional(),curse:CurseSelectionSchema.optional()},
  },async input=>toolkitTransaction(()=>cast5eSpell(input)))
  server.registerTool('inspect_curses',{
    description:'Read implemented tracked Bestow Curse effects on one actual creature, including caster, variant, expiry and concentration. This confidential MJ reference never diagnoses an unknown narrative curse, breaks a curse, spends an action or grants an effect. Unsupported wasted-action/extra-damage/custom curses and cursed magic items remain reference-only.',
    inputSchema:{targetId:z.string().min(1)},annotations:{readOnlyHint:true},
  },async({targetId})=>toolkitTransaction(()=>{
    if(!gs.getEntity(targetId))toolkitError('ENTITY_NOT_FOUND','Select an actual engine creature.')
    return toolkitResult({targetId,curses:activeCurses(gs.getState(),targetId),source:'https://media.wizards.com/2023/downloads/dnd/SRD_CC_v5.1.pdf',pages:{bestowCurse:121,removeCurse:174}})
  }))
}
