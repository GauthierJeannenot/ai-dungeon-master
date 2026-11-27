import { assertGreaterBrewingIdAvailable } from '../toolkit'
import { LightObjectSelectionSchema } from '../../lib/light-spell-state'
import { multiDayScribingReservedSlots } from '../../lib/xge-multiday-scribing-state'
import { SpellObserversSchema } from '../../lib/spell-perception-state'
import { SpellAreaSelectionSchema } from '../../lib/spell-area-state'
import { TeleportCompanionFields } from '../../lib/spell-physical-state'
import { assertGameTimeAdvance } from '../time-preflight'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { AbilityCheckResult } from '../../lib/types'
import { ToolkitCellSchema, ToolkitDescriptionSchema, ToolkitIdSchema } from '../../lib/dm-tool-state'
import { CoinsSchema, copperValue, emptyCoins } from '../../lib/srd/currency'
import { CopyMaterialsSchema,SpellbookEventIdSchema } from '../../lib/spellbooks-state'
import { startSpellCopy,legacyCopyEventId } from '../spellbooks'
import { spellScrollCatalog, supportedScrollSpell } from '../../lib/srd/spell-scrolls'
import { MAGIC_ITEM_SOURCE } from '../../lib/srd/magic-items'
import { toolkitState, toolkitResult, toolkitError, toolkitLocation, toolkitTransaction } from '../toolkit'
import { available, feature, hero, advanceHeroTime } from '../hero-rules'
import { ownedScroll, scrollSnapshot, scrollOnClassList, validateScrollCast, failScrollCast, consumeScroll, assertScrollReadable } from '../spell-scrolls'
import { cast5eSpell, type HeroSpellInput } from '../hero-spells'
import { checkedResolution, registerCheckedResolution } from '../toolkit-checks'
import { balance, addCoins, debitCoins } from '../currency'
import * as gs from '../game-state'
import * as rules from '../rules'
import { WaterEffectSchema } from '../water-effect'
import { CurseSelectionSchema } from '../../lib/curse-effects'

const spellArguments = {
  lightObject:LightObjectSelectionSchema.optional(),
  spellObservers:SpellObserversSchema.optional(),
  area: SpellAreaSelectionSchema.optional(),
  nonlethal: z.boolean().optional().describe('Explicit knockout choice only for the initial Spiritual Weapon melee spell attack with one exact targetId. Omit for creation without an attack or any other registered scroll spell, even when false.'),
  targetId: z.string().optional(), targetIds: z.array(z.string()).max(100).optional(),
  toCell: ToolkitCellSchema.optional(), direction: z.object({ x: z.number().int().min(-1).max(1), y: z.number().int().min(-1).max(1) }).optional(),
  condition: z.enum(['blinded','deafened','paralyzed','poisoned']).optional(),
  sculptTargetIds: z.array(z.string()).max(5).optional(), companionId: z.string().optional(),...TeleportCompanionFields,
  narrative: ToolkitDescriptionSchema.optional(),
  waterEffect: WaterEffectSchema.optional(), afflictionId: ToolkitIdSchema.optional(), curse: CurseSelectionSchema.optional(),
}
function validateCopy(itemId: string, paid: z.infer<typeof CoinsSchema>) {
  available()
  rules.validateActionUse('player')
  const record = ownedScroll(itemId), player = gs.getPlayer(), entry = supportedScrollSpell(record.spellId)!
  if (gs.getState().phase === 'combat' || player.characterId !== 'wizard' || !player.features?.includes('spellcasting'))
    toolkitError('SPELL_SCROLL_COPY_UNAVAILABLE', 'Only an actual wizard outside combat can copy a scroll.')
  if (!entry.source.classes.some(c => c.index === 'wizard') || !player.inventory.some(i => i.id === 'spellbook') || !player.spellbook)
    toolkitError('SPELL_SCROLL_COPY_UNAVAILABLE', 'An owned personal spellbook and a supported wizard spell are required.')
  if (player.spellbook!.includes(record.spellId)) toolkitError('SPELL_ALREADY_IN_BOOK', 'This spell is already recorded; no scroll or payment is consumed.')
  if (validateScrollCast(itemId, record.spellId).requiresCheck) toolkitError('SPELL_COPY_LEVEL_UNAVAILABLE', 'A wizard can copy only a spell of a level they can prepare.')
  const savant = feature('evocation_savant') && entry.source.school.index === 'evocation'
  const gold = entry.spell.level * (savant ? 25 : 50), seconds = entry.spell.level * (savant ? 3600 : 7200)
  assertGameTimeAdvance(seconds)
  if (copperValue(paid) !== gold * 100) toolkitError('SPELL_COPY_PAYMENT_INVALID', 'Declare denominations matching the exact source copying cost.')
  addCoins(balance(), emptyCoins(), paid) // Validate availability before the single check.
  return { record, entry, gold, seconds }
}
export function registerSpellScrollTools(server: McpServer) {
  registerCheckedResolution('spell-scroll-cast', (command, result) => {
    const input = command.input as HeroSpellInput, check = result as AbilityCheckResult
    if (!check.success) return toolkitResult(failScrollCast(input.scrollItemId!, check))
    return cast5eSpell({ ...input, scrollCheckPassed: true, scrollCastCheck: check })
  })
  registerCheckedResolution('spell-scroll-copy', (command, result) => {
    const itemId = String(command.itemId), paid = CoinsSchema.parse(command.paid), { record, seconds, gold } = validateCopy(itemId, paid)
    const wallet = debitCoins(paid), scrollUse = consumeScroll(itemId, result as AbilityCheckResult)
    advanceHeroTime(seconds)
    if (result.success) {
      const player = gs.getPlayer(); player.spellbook!.push(record.spellId)
      player.inventory.find(i => i.id === 'spellbook')!.spellIds = [...player.spellbook!]
      hero().preparedAtRest = false
    }
    return toolkitResult({ success: result.success, check: result, spell: record.spellId, spellScrollUse: scrollUse, costGold: gold, paid, seconds, wallet,
      spellbook: gs.getPlayer().spellbook,
      mechanicalSummary: `Copie ${result.success ? 'réussie' : 'échouée'} ; ${gold} po et ${seconds} secondes dépensées ; le parchemin est détruit dans les deux cas.` })
  })
  server.registerTool('inspect_spell_scrolls', {
    description: 'Read the bounded SRD 2014 spell-scroll catalog, or the previously learned properties of one exact registered scroll. Documentary only; never reads an unknown cipher in fiction, casts a spell, copies to a book or grants an item. The generic catalogue remains limited to supported leveled action and bonus-action scrolls. An actual Ray of Frost scribed through Xanathar can be inspected by its exact registered ID. Counterspell has a separate actual reaction-window use; Teleport7 acquisition/read only. Other reaction scrolls, rituals, long casting and optional scroll mishaps are outside this procedure.',
    inputSchema: { itemId: ToolkitIdSchema.optional() }, annotations: { readOnlyHint: true, idempotentHint: true, destructiveHint: false },
  }, async ({itemId}) => toolkitTransaction(() => toolkitResult(itemId ? scrollSnapshot(itemId) : {
    source: { url: MAGIC_ITEM_SOURCE, entry: 'Spell Scroll', page: 242 }, spells: spellScrollCatalog(),
    notice: 'Confidential MJ reference. Reading this list grants no player knowledge, material or spell.' })))
  server.registerTool('create_spell_scroll', {
    description: 'MJ preparation outside combat: place one physical SRD spell scroll with exact spellId, unique itemId, appearance and explicit active-map room cell. Only base-level supported spells from inspect_spell_scrolls; no upcasting or invented power. No automatic pickup or player discovery. Exact repetitions are idempotent, including consumed scrolls; never restores a lost scroll. At most 64 instances with consumed tombstones retained.',
    inputSchema: { itemId: ToolkitIdSchema, spellId: z.string().min(1).max(80), name: z.string().trim().min(1).max(80), description: ToolkitDescriptionSchema, cell: ToolkitCellSchema },
  }, async input => toolkitTransaction(() => {
    available(); if (gs.getState().phase === 'combat') toolkitError('PREPARATION_OUTSIDE_COMBAT', 'Prepare the scroll outside combat.')
    if (!supportedScrollSpell(input.spellId)&&input.spellId!=='teleport') toolkitError('SPELL_SCROLL_UNSUPPORTED', 'Choose one exact implemented level 1-4 action/bonus-action spell from inspect_spell_scrolls.')
    const state = gs.getState(), data = toolkitState(), creation = JSON.stringify(input), existing = data.spellScrolls?.[input.itemId]
    if (existing) {
      if (existing.creation !== creation) toolkitError('SPELL_SCROLL_ID_CONFLICT', 'This scroll ID has another immutable definition.')
      return toolkitResult({ success: true, alreadyCreated: true, item: scrollSnapshot(input.itemId) })
    }
    assertGreaterBrewingIdAvailable(input.itemId)
    if (state.player.inventory.some(i => i.id === input.itemId) || state.droppedItems?.[input.itemId] || data.magicItems?.[input.itemId] || gs.getEntity(input.itemId) || gs.getNpc(input.itemId))
      toolkitError('SPELL_SCROLL_ID_CONFLICT', 'This physical item or actor ID is already in use.')
    if (Object.keys(data.spellScrolls ?? {}).length + multiDayScribingReservedSlots(state) >= 64)
      toolkitError('SPELL_SCROLL_LIMIT', 'The64scroll history includes every actual unfinished multi-day project reserved slot.')
    const location = toolkitLocation(input.cell)
    data.spellScrolls ??= {}; data.spellScrolls[input.itemId] = { id: input.itemId, spellId: input.spellId, creation, identified: false, status: 'active' }
    state.droppedItems ??= {}; state.droppedItems[input.itemId] = { item: { id: input.itemId, equipmentId: 'spell_scroll', name: input.name, description: input.description, type: 'misc', magical: true },
      mapId: location.mapId, roomId: location.roomId, position: {...input.cell} }
    return toolkitResult({ success: true, item: scrollSnapshot(input.itemId), notice: 'Prepared on the ground; acquisition and reading remain separate.' })
  }))
  server.registerTool('read_spell_scroll', {
    description: 'Read one exact owned active spell-scroll cipher. Its spell must be on the actual player class spell list; actually known bard Magical Secrets count as bard spells. A blinded reader cannot read. Learns the contained spell and source properties without casting, consuming, preparing, learning permanently or attuning. This is reading only, not an action activation or successful Arcana check.',
    inputSchema: { itemId: ToolkitIdSchema },
  }, async ({itemId}) => toolkitTransaction(() => {
    available(); if(gs.getState().phase==='combat')rules.validateFreeCombatAction('player');else rules.validateActionUse('player')
    const record = ownedScroll(itemId)
    if (!scrollOnClassList(record)) toolkitError('SPELL_SCROLL_CLASS_REQUIRED', 'The cipher is unintelligible to this actual class.')
    assertScrollReadable()
    record.identified = true
    return toolkitResult({success: true, item: scrollSnapshot(itemId), notice: 'Read only. No spell cast, slot spent, permanent spell knowledge or item consumed.'})
  }))
  server.registerTool('use_spell_scroll', {
    description: 'Cast the fixed spell on one exact owned SRD scroll using normal source casting time, fixed scroll DC/attack bonus, actual range/targets, concentration and reactions. No prepared/known spell, player slot or material component is required, but the spell MUST be on the class list. Select all spell targets/area explicitly; no slotLevel, ritual or invented effect. Above the highest normally available spell level: one spellcasting-ability check DC 10 + spell level; a failed check destroys the scroll without effect and spends the casting time. Bardic Inspiration/Cutting Words resume the same die after hydration. Successful casting consumes once, even across held damage/save reactions. Counterspell must instead use the actual offered react_to_trigger window with its exact scrollItemId. Teleport7 is acquisition/read only and refuses before cost. Readied/other reaction/long cast scrolls are not supported.',
    inputSchema: { itemId: ToolkitIdSchema, ...spellArguments },
  }, async ({itemId, ...arguments_}) => toolkitTransaction(() => {
    available()
    const record = ownedScroll(itemId)
    if(record.spellId==='teleport')toolkitError('TELEPORT_SCROLL_CAST_UNSUPPORTED','This real seventh-level Teleport scroll may be acquired/read, but destination/familiarity/mishap casting is not implemented. No action, roll or scroll is consumed.')
    if(record.spellId==='counterspell')toolkitError('SPELL_SCROLL_REACTION_REQUIRED','Use this exact Counterspell scroll through react_to_trigger with its actual offered spell trigger, never as a normal action.')
    const info = validateScrollCast(itemId, record.spellId)
    const input: HeroSpellInput = { ...arguments_, spellId: record.spellId, scrollItemId: itemId }
    cast5eSpell(input, false, false, true) // Full target/cost validation, no effects, payment or dice.
    if (info.requiresCheck) return checkedResolution({ entityId: 'player', ability: gs.getPlayer().spellcastingAbility!, dc: info.checkDc, sightBased: true, label: 'Lecture d’un parchemin de niveau supérieur' },
      { domain: 'spell-scroll-cast', command: { input } })
    return cast5eSpell(input)
  }))
  server.registerTool('copy_spell_scroll', {
    description: 'Actual wizard copies one exact owned scroll into one actual personal destination:2h/50gp per level, halved for real Evocation Savant evocations. Explicit actual fine-ink/component supply paid exactly once, or real owned exact-value batch and zero cash double payment. Work can be segmented before true clock events and resumed by continue_spell_copy. ONE final real INT Arcana DC10+spell level after actual full work; original held die persists. The same scroll is destroyed on success or failure, once; only success adds the one spell to the real destination. No free book/supplies, automatic preparation or alternate generic scroll copy.',
    inputSchema: {eventId:SpellbookEventIdSchema.optional(),itemId:ToolkitIdSchema,destinationBookId:z.string().optional(),paid:CoinsSchema,materials:CopyMaterialsSchema,
      workSeconds:z.number().int().positive().max(64800).optional(),restActivity:z.enum(['light','strenuous']),activitySource:z.string().trim().min(1).max(1000)},
  },async input=>toolkitTransaction(()=>{
    const record=gs.getState().dmTools?.spellScrolls?.[input.itemId]
    if(!record)toolkitError('SPELL_SCROLL_UNKNOWN','Choose the actual registered physical scroll, not an invented copy source.')
    if (record!.scribedCantripCasterLevel) toolkitError('SPELL_COPY_INVALID', 'A cantrip cannot be copied into a spellbook.')
    const entry=supportedScrollSpell(record!.spellId)
    if(!entry)toolkitError('SPELL_SCROLL_UNSUPPORTED','Choose an actual supported registered scroll.')
    return startSpellCopy({...input,mode:'scroll',spellId:record!.spellId,sourceItemId:input.itemId,eventId:input.eventId??legacyCopyEventId('scroll',input.itemId,input.destinationBookId??'spellbook',record!.spellId)})
  }))
}
