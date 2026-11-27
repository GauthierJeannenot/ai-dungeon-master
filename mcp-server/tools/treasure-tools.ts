import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { CoinsSchema, COIN_IDS, emptyCoins, copperValue, coinCount, type Coins } from '../../lib/srd/currency'
import { ToolkitCellSchema, ToolkitDescriptionSchema, ToolkitIdSchema } from '../../lib/dm-tool-state'
import { toolkitState, toolkitResult, toolkitError, toolkitLocation, toolkitTransaction, assertToolkitReach, assertGreaterBrewingIdAvailable } from '../toolkit'
import { readIndividualTreasureTable } from '../rules-library'
import { rollDice } from '../dice'
import { spendObjectInteraction } from '../equipment'
import * as gs from '../game-state'
import * as rules from '../rules'
import { balance, addCoins } from '../currency'
import { assertCarryingAcquisition } from '../carrying'

const BAND_IDS = ['0-4', '5-10', '11-16', '17+'] as const
function outsideCombat() {
  if (gs.getState().hero?.pending) toolkitError('REACTION_PENDING', 'Resolve the held reaction before another mutation.')
  if (gs.getState().phase === 'combat') toolkitError('TREASURE_OUTSIDE_COMBAT', 'Prepare treasure or settle currency outside combat.')
}
function snapshot(id: string) {
  const { creation: _creation, ...treasure } = gs.getState().dmTools!.treasures![id]
  return treasure
}
function log(action: string, mechanicalDetail: string) {
  gs.addLogEntry({ round: gs.getState().round, turn: 'player', action, mechanicalDetail })
}
function drawTreasure(band: typeof BAND_IDS[number]) {
  const table = readIndividualTreasureTable(band)
  if (table.columns.join(',').toLowerCase() !== 'd100,cp,sp,ep,gp,pp')
    toolkitError('TREASURE_SOURCE_UNSUPPORTED', 'The source does not have the supported coin columns.')
  // Validate EVERY row before consuming a die. Only the supplied coin formula
  // grammar is supported; no execution of Markdown or LLM-supplied expressions.
  const parsed = table.rows.map(row => ({ row, formulas: COIN_IDS.map((id, i) => {
    const value = row.cells[i + 1]
    if (value === '—') return { id, notation: null, multiplier: 1 }
    const match = /^(\d{1,2})d6(?:\s*×\s*([\d,]+))?\s*\([\d,]+\)$/.exec(value)
    const multiplier = match?.[2] ? Number(match[2].replaceAll(',', '')) : 1
    if (!match || Number(match[1]) > 20 || Number(match[1]) < 1 || ![1, 10, 100, 1000].includes(multiplier))
      toolkitError('TREASURE_SOURCE_UNSUPPORTED', 'An unsupported coin formula was found; no dice consumed.')
    return { id, notation: `${match![1]}d6`, multiplier }
  }) }))
  const selection = rollDice('1d100'), selected = parsed.find(entry => entry.row.low <= selection.total && selection.total <= entry.row.high)!
  const rolls = [selection], coins = emptyCoins()
  for (const formula of selected.formulas) if (formula.notation) {
    const roll = rollDice(formula.notation)
    rolls.push(roll); coins[formula.id] = roll.total * formula.multiplier
  }
  return { coins, rolls, source: { origin: 'transcription' as const, book: 'dmg-2014' as const,
    tableId: table.tableId, sha256: table.source.sha256, startLine: table.source.startLine, endLine: table.source.endLine } }
}

export function registerTreasureTools(server: McpServer) {
  server.registerTool('create_treasure', {
    description: 'MJ preparation outside combat: persist ONE coin treasure in an existing active-map room. mode=individual rolls the actual supplied DMG individual treasure table for an explicit challengeBand (0-4,5-10,11-16,17+), including coin dice/multipliers; mode=authored uses explicit coins. Never infer rewards from narration, defeated foes or a prior roll_table. An exact repeat with the same treasureId is idempotent, with no reroll/refill, even after collection. Optional containerId must be a prepared container at the same cell; collecting requires it open/destroyed. Preparation is confidential, grants no money or discovery. No hoards, gems, magic items or automatic quest rewards.',
    inputSchema: { treasureId: ToolkitIdSchema, name: z.string().trim().min(1).max(80), description: ToolkitDescriptionSchema,
      cell: ToolkitCellSchema, containerId: ToolkitIdSchema.optional(), mode: z.enum(['individual', 'authored']),
      challengeBand: z.enum(BAND_IDS).optional(), coins: CoinsSchema.optional() },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async input => toolkitTransaction(() => {
    outsideCombat()
    if (input.mode === 'individual' ? !input.challengeBand || input.coins !== undefined : !input.coins || input.challengeBand !== undefined)
      toolkitError('TREASURE_SELECTION_INVALID', 'Choose individual with challengeBand only, or authored with coins only.')
    if (input.coins && copperValue(input.coins) === 0) toolkitError('EMPTY_TREASURE', 'An authored treasure must contain at least one coin.')
    const location = toolkitLocation(input.cell), data = toolkitState(), creation = JSON.stringify(input)
    const existing = data.treasures?.[input.treasureId]
    if (existing) {
      if (existing.creation !== creation || existing.mapId !== location.mapId) toolkitError('TREASURE_ID_CONFLICT', 'This treasure ID already has a different definition or map.')
      return toolkitResult({ success: true, alreadyCreated: true, treasure: snapshot(input.treasureId) })
    }
    assertGreaterBrewingIdAvailable(input.treasureId)
    if (Object.keys(data.treasures ?? {}).length >= 64) toolkitError('TREASURE_LIMIT_REACHED', 'At most 64 coin treasures per session.')
    if (input.containerId) {
      const container = data.objects[input.containerId]
      if (!container || container.kind !== 'container' || container.mapId !== location.mapId || container.roomId !== location.roomId
        || container.cell.x !== input.cell.x || container.cell.y !== input.cell.y)
        toolkitError('TREASURE_CONTAINER_INVALID', 'Select a prepared container at the exact treasure cell on this map.')
    }
    const drawn = input.mode === 'individual' ? drawTreasure(input.challengeBand!)
      : { coins: input.coins!, rolls: [], source: { origin: 'authored' as const } }
    data.treasures ??= {}
    data.treasures[input.treasureId] = { id: input.treasureId, name: input.name, description: input.description,
      cell: { ...input.cell }, ...location, ...(input.containerId ? { containerId: input.containerId } : {}),
      ...drawn, collected: false, creation }
    return toolkitResult({ success: true, treasure: snapshot(input.treasureId), notice: 'MJ preparation only; no discovery, wallet credit or inventory acquisition.' })
  }))
  server.registerTool('collect_treasure', {
    description: 'Collect one exact prepared coin treasure into the player wallet ONCE. Same active room/map, within 5 feet and unobstructed reach; linked container must be open or destroyed. No search, opening or trap trigger is automatic. In combat uses first free object interaction, then an action (current SRD profile required in combat). Exact repeats acknowledge prior collection without changing coins or costs. When standard carrying is tracked, validates the real resulting coin mass and inventory before collection or interaction cost.',
    inputSchema: { treasureId: ToolkitIdSchema },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async ({ treasureId }) => toolkitTransaction(() => {
    const state = gs.getState()
    if (state.hero?.pending) toolkitError('REACTION_PENDING', 'Resolve the pending reaction first.')
    const treasure = state.dmTools?.treasures?.[treasureId]
    if (!treasure) toolkitError('TREASURE_NOT_FOUND', 'Select an exact prepared treasure ID.')
    if (treasure!.collected) return toolkitResult({ success: true, alreadyCollected: true, wallet: balance() })
    if (state.phase === 'combat') rules.validateFreeCombatAction('player')
    else rules.validateActionUse('player')
    assertToolkitReach(treasure!)
    if (treasure!.containerId) {
      const container = state.dmTools!.objects[treasure!.containerId]
      if (!container || !['open', 'destroyed'].includes(container.state)) toolkitError('TREASURE_CONTAINER_CLOSED', 'Resolve opening/destroying the container with its dedicated tool first.')
    }
    const wallet = addCoins(balance(), treasure!.coins)
    assertCarryingAcquisition({walletAfter:wallet})
    if (state.phase === 'combat') {
      if (!state.hero || state.player.ruleset !== 'srd2014') toolkitError('SRD_PROFILE_REQUIRED', 'Combat collection requires the current SRD action/interaction budgets.')
      spendObjectInteraction()
    }
    toolkitState().wallet = wallet; treasure!.collected = true
    const mechanicalSummary = `Butin ${treasure!.name} collecté une fois : ${JSON.stringify(treasure!.coins)} ; bourse ${JSON.stringify(wallet)}.`
    log('collect_treasure', mechanicalSummary)
    return toolkitResult({ success: true, collectedCoins: treasure!.coins, wallet, valueCp: copperValue(wallet),
      coinWeightLb: coinCount(wallet) / 50, mechanicalSummary, notice: 'Standard carrying preflight applies when physical tracking is active; absent data are not assumed zero.' })
  }))
  for (const kind of ['spend', 'exchange'] as const) server.registerTool(kind === 'spend' ? 'spend_currency' : 'exchange_currency', {
    description: kind === 'spend'
      ? 'Pay explicit denominations from the actual wallet outside combat for an established fictional expense. reason and unique transactionId required. No implicit change; no purchase/item, service, reward or quest effect is created by a payment. Repeating the exact transactionId is idempotent; a different payment needs a new ID.'
      : 'Outside combat, exchange explicit paid and received coin denominations at PHB exact rates, only after the MJ establishes a possible exchange in reason. Values in copper must match exactly; no rounding/change/profit, counterparty or merchant stock is invented. Idempotent exact transactionId. Does not convert objects/gems, buy items or prove merchant availability.',
    inputSchema: { transactionId: ToolkitIdSchema, paid: CoinsSchema,
      ...(kind === 'exchange' ? { received: CoinsSchema } : {}), reason: ToolkitDescriptionSchema },
    annotations: { readOnlyHint: false, destructiveHint: kind === 'spend', idempotentHint: true, openWorldHint: false },
  }, async input => toolkitTransaction(() => {
    outsideCombat()
    rules.validateActionUse('player')
    const received = 'received' in input ? input.received as Coins : emptyCoins()
    const creation = JSON.stringify({ kind, paid: input.paid, received, reason: input.reason }), data = toolkitState()
    const existing = data.currencyTransactions?.[input.transactionId]
    if (existing) {
      if (existing.creation !== creation) toolkitError('CURRENCY_TRANSACTION_CONFLICT', 'This transactionId already belongs to a different payment/exchange.')
      return toolkitResult({ success: true, alreadyProcessed: true, wallet: balance(), transaction: existing })
    }
    if (Object.keys(data.currencyTransactions ?? {}).length >= 512) toolkitError('CURRENCY_TRANSACTION_LIMIT', 'At most 512 currency receipts per session; no old receipt is silently evicted.')
    if (copperValue(input.paid) === 0) toolkitError('EMPTY_PAYMENT', 'Select nonzero paid coins.')
    if (kind === 'exchange' && copperValue(input.paid) !== copperValue(received)) toolkitError('CURRENCY_VALUE_MISMATCH', 'An exchange must preserve copper value exactly.')
    const wallet = addCoins(balance(), received, input.paid)
    assertCarryingAcquisition({walletAfter:wallet})
    data.wallet = wallet; data.currencyTransactions ??= {}
    data.currencyTransactions[input.transactionId] = { kind, creation, reason: input.reason, paid: input.paid, received, walletAfter: { ...wallet } }
    const mechanicalSummary = `${kind === 'spend' ? 'Dépense' : 'Change'} : ${JSON.stringify(input.paid)}${kind === 'exchange' ? ` contre ${JSON.stringify(received)}` : ''} ; bourse ${JSON.stringify(wallet)}. Motif : ${input.reason}`
    log(`${kind}_currency`, mechanicalSummary)
    return toolkitResult({ success: true, wallet, valueCp: copperValue(wallet), coinWeightLb: coinCount(wallet) / 50, mechanicalSummary,
      notice: 'Currency bookkeeping only. No item, service, merchant stock or quest completion created.' })
  }))
}
