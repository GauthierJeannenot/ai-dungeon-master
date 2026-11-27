import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { RegisterSpellbookSchema,SpellbookLossSchema,PersonalSpellCopySchema,SpellbookEventIdSchema } from '../../lib/spellbooks-state'
import { inspectSpellbooks,registerSpellbook,recordSpellbookLoss,copyPersonalSpell,continueSpellCopy,resolveSpellCopy,registerSpellbookContinuations } from '../spellbooks'
import { toolkitResult,toolkitTransaction } from '../toolkit'
export function registerSpellbookTools(server:McpServer){
  registerSpellbookContinuations()
  server.registerTool('inspect_spellbooks',{
    description:'Read actual physical book identities, personally written versus foreign notation, actual owned availability, losses, paid material receipts and measured copying jobs. No book, contents, spell knowledge, preparation, payment, time or die is created. Several actual owned personal books jointly supply a wizard library; a lost global spell array does not.',
    inputSchema:{},annotations:{readOnlyHint:true,idempotentHint:true},
  },async()=>toolkitTransaction(()=>toolkitResult(inspectSpellbooks())))
  server.registerTool('register_spellbook',{
    description:'MJ establishes ONE actual owned physical book or notes collection. Exact existing item and source contents only; no book is granted from player.spellbook alone. A destination with unknown contents is not blank unless explicitly physically confirmed. Initial personal notation must agree with real wizard knowledge; foreign unknown spells remain foreign and need normal copying. Metadata cannot add spells or reset an already registered book.',
    inputSchema:RegisterSpellbookSchema,
  },async input=>toolkitTransaction(()=>toolkitResult(registerSpellbook(input))))
  server.registerTool('record_spellbook_loss',{
    description:'Explicit actual loss/unavailability of ONE real previously established personal book. It must be absent from inventory and not physically within reach. Retains the physical identity and previous contents without granting access or a replacement. Real prepared spells stay prepared; other lost spells cannot be reconstructed for free. An actual dropped original legacy book can supply its persisted identity, never a missing imaginary volume.',
    inputSchema:SpellbookLossSchema.shape,
  },async input=>toolkitTransaction(()=>toolkitResult(recordSpellbookLoss(input))))
  server.registerTool('copy_personal_spell',{
    description:'Start real PHB2014 Replacing the Book work for ONE supported wizard spell: backup from exact actually owned personal source into exact real owned destination, OR prepared-only replacement after exact real old book loss. Base1hour+10gp per spell level; actual Evocation Savant halves both evocation costs again (SRD5.1 general copying trait). Explicit actual paid_supply provides and consumes fine inks/components once for exact coins; owned_batch debits the exact cost from one real acquired material stock, preserves its measured remainder and requires ZERO second cash payment. No book, ink stock or unprepared lost spell is invented. workSeconds optionally requests a real partial segment before an actual clock event; otherwise request the entire source duration atomically. Real reader, writing hand, books, light, payment, time and rest-history preflights precede all costs. Progress/payments persist through pauses; knowledge is added only when the full real work completes. No spell preparation or slot recovery.',
    inputSchema:PersonalSpellCopySchema,
  },async input=>toolkitTransaction(()=>copyPersonalSpell(input)))
  server.registerTool('continue_spell_copy',{
    description:'Explicit next measured segment of the SAME actual persisted copying job. No new payment/material or reset after a pause. Select actual seconds up to remaining work; source/destination/reader/hand/vision and real time/rest boundaries are checked before progress. Resolve actual due source events first, then continue this job. No time is credited while traveling, resting or doing other actions. Multiple books remain distinct; no knowledge before full work.',
    inputSchema:{eventId:SpellbookEventIdSchema,jobId:SpellbookEventIdSchema,seconds:z.number().int().positive().max(64800),
      restActivity:z.enum(['light','strenuous']),source:z.string().trim().min(1).max(1000)},
  },async input=>toolkitTransaction(()=>continueSpellCopy(input)))
  server.registerTool('resolve_spell_copy',{
    description:'Finish only an ACTUAL fully measured copying job after its exact due clock events. Ordinary/personal copying adds the one earned spell to that real destination; scroll copying makes ONE final INT Arcana DC10+spell level, destroys the same real scroll on success or failure, and adds only on success. Bardic/held continuation keeps the original die through hydration. No extra work time/payment, book, known spell, automatic preparation or reroll is created. Replays return the final immutable result.',
    inputSchema:{jobId:z.string().min(1).max(80)},
  },async({jobId})=>toolkitTransaction(()=>resolveSpellCopy(jobId)))
}
