#!/usr/bin/env node
'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { normalizeTurn, validateTurn } = require('./playtest-contract.cjs')

function option(name, fallback) {
  const inline = process.argv.find(arg => arg.startsWith(`${name}=`))
  if (inline) return inline.slice(name.length + 1)
  const index = process.argv.indexOf(name)
  return index >= 0 && process.argv[index + 1] && !process.argv[index + 1].startsWith('--') ? process.argv[index + 1] : fallback
}

function numberOption(name, envName, fallback) {
  const value = Number(option(name, process.env[envName] ?? fallback))
  if (!Number.isFinite(value) || value < 0) throw new Error(`Invalid nonnegative threshold: ${name}`)
  return value
}

// A legacy-rules fixture deliberately isolates agent orchestration from the
// separate level-seven SRD class suite. No removed world/intent state is seeded.
function baseGameState() {
  return {
    adventureId: 'grammys-country-apple-pie', characterId: 'fighter', phase: 'exploration',
    player: {
      id: 'player', name: 'Heros', class: 'Guerrier', level: 1,
      hp: { current: 20, max: 20 }, ac: 16,
      stats: { str: 16, dex: 12, con: 14, int: 10, wis: 12, cha: 10 }, proficiencyBonus: 2,
      position: { x: 4, y: 13 }, conditions: [], speed: 30,
      inventory: [
        { id: 'longsword', name: 'Epee longue', type: 'weapon', damage: '1d8+3' },
        { id: 'shield', name: 'Bouclier', type: 'armor', acBonus: 2 },
        { id: 'potion1', name: 'Potion de soin', type: 'potion', description: '2d4+2 HP' },
      ],
    },
    monsters: {}, initiativeOrder: [], currentTurn: null, round: 0,
    movementUsed: {}, actionUsed: {}, bonusActionUsed: {}, combatLog: [],
    roomsVisited: ['1'], currentRoomId: '1', encountersTriggered: [], worldFacts: [], droppedItems: {},
  }
}

function officeGameState() {
  const state = baseGameState()
  state.player.position = { x: 5, y: 9 }
  state.currentRoomId = '5'; state.roomsVisited = ['5']
  return state
}

function combatGameState() {
  const state = baseGameState()
  state.phase = 'combat'; state.currentTurn = 'player'; state.round = 1
  state.player.hp.current = 18; state.player.ac = 30
  state.monsters.goblin_a = {
    id: 'goblin_a', name: 'Gobelin A', type: 'goblin', hp: { current: 60, max: 60 }, ac: 13,
    stats: { str: 8, dex: 14, con: 10, int: 10, wis: 8, cha: 8 },
    position: { x: 5, y: 13 }, conditions: [], xpValue: 50, attackBonus: 0,
    damageDice: '1d6+2', speed: 30, isAlive: true,
  }
  state.initiativeOrder = ['player', 'goblin_a']
  return state
}

function builtInScenarios() {
  const attackTools = ['resolve_attack', 'resolve_player_attack', 'cast_spell']
  return [
    {
      name: 'exploration-movement', initialGameState: baseGameState(),
      // More than eight requests in one session: rate limiting must not mask coverage.
      turns: [5, 6, 7, 8, 9, 10, 9, 8, 7, 6, 5, 4].map(x => ({
        message: `je vais en (${x},13)`, expectTools: ['move_token'], maxLlmCalls: 3,
        expectState: { 'player.position': { x, y: 13 }, phase: 'exploration' },
      })),
    },
    ...[
      { name: 'search-success', diceSequence: '17', result: 'SUCCES' },
      { name: 'search-failure', diceSequence: '1', result: 'ECHEC' },
    ].map(({ name, diceSequence, result }) => ({
      name, diceSequence, initialGameState: officeGameState(),
      turns: [{ message: 'je fouille le bureau', expectTools: ['roll_ability_check'],
        forbidTools: attackTools, expectLog: [`Fouille:.*${result}`], expectNarrative: [result],
        expectUnchanged: ['player.inventory', 'worldFacts', 'player.position'], maxLlmCalls: 3,
        verify(state, before) { assert.equal(state.combatLog.length - before.combatLog.length, 1, 'Exactly one search roll') },
      }],
    })),
    {
      name: 'standard-social-conversation-persistence', initialGameState: baseGameState(),
      turns: [1, 2].map(attempt => ({ message: 'je parle à mac du soin des arbres',
        expectTools: attempt === 1 ? ['begin_social_interaction','record_social_conversation'] : [], forbidTools: [...attackTools],
        expectNarrative: attempt === 2 ? ['déjà été enregistré'] : ['Vous échangez'],
        expectUnchanged: ['player.position', 'player.inventory'], maxLlmCalls: 3,
        verify(state, before) {
          assert.ok(state.socialProfileSeed, 'The engine initializes a new-game personality seed')
          assert.equal(Object.keys(state.socialPersonalities).length, 5)
          const conversations = Object.values(state.dmTools.socialInteractions.records)
          assert.equal(conversations.length, 1)
          assert.equal(conversations[0].conversations.length, 1, 'Repeated dialogue never creates another conversation')
          if (attempt === 2) {
            assert.deepEqual(state.dmTools.socialInteractions, before.dmTools.socialInteractions, 'Repeated dialogue never duplicates the conversation')
            assert.equal(state.socialProfileSeed, before.socialProfileSeed)
            assert.deepEqual(state.socialPersonalities, before.socialPersonalities, 'Personality is never redrawn between turns')
          }
        },
      })),
    },
    {
      name: 'combat-deescalation-success', initialGameState: combatGameState(), diceSequence: '20',
      turns: [{ message: "ok ok, arretez de m'attaquer on fait la paix",
        expectTools: ['begin_social_interaction','record_social_conversation','resolve_social_request','end_combat'], forbidTools: [...attackTools, 'run_monster_turns'],
        expectState: { phase: 'exploration', currentTurn: null }, expectUnchanged: ['player.hp'],
        expectLog: ['Interaction sociale'], expectNarrative: ['combat cesse'], maxLlmCalls: 6,
        verify(state) {
          const requests = Object.values(state.dmTools.socialInteractions.receipts).filter(receipt => receipt.kind === 'request')
          assert.equal(requests.length, 1)
          assert.equal(requests[0].result.requestGranted, true)
          assert.deepEqual(requests[0].result.check.roll.rolls, [20])
        },
      }],
    },
    {
      name: 'combat-deescalation-failure', initialGameState: combatGameState(), diceSequence: '1,1,20,1',
      turns: [{ message: "ok ok, arretez de m'attaquer on fait la paix",
        expectTools: ['begin_social_interaction','record_social_conversation','resolve_social_request','next_turn','run_monster_turns'], forbidTools: [...attackTools, 'end_combat'],
        expectState: { phase: 'combat', currentTurn: 'player', round: 2, 'monsters.goblin_a.hp.current': 60 },
        expectLog: ['Interaction sociale'], maxLlmCalls: 7,
        verify(state, before) {
          assert.equal(state.combatLog.slice(before.combatLog.length).filter(entry => entry.action === 'Interaction sociale').length, 1, 'A failed negotiation is not rerolled')
          const requests = Object.values(state.dmTools.socialInteractions.receipts).filter(receipt => receipt.kind === 'request')
          assert.equal(requests.length, 1)
          assert.equal(requests[0].result.requestGranted, false)
          assert.deepEqual(requests[0].result.check.roll.rolls, [1])
        },
      }],
    },
    {
      // Attack hit, attack miss, potion, pass; retain the encounter's initiative.
      name: 'combat-cycle', initialGameState: combatGameState(), diceSequence: '17,4,1,1,1,4,4,1,1',
      turns: ["j'attaque le gobelin", "j'attque le gobelin", 'je bois une potion de soin', 'je passe mon tour']
        .map((message, index) => ({ message,
          expectTools: [index < 2 ? 'resolve_attack' : index === 2 ? 'use_healing_potion' : 'pass_turn', 'run_monster_turns'],
          expectState: { phase: 'combat', currentTurn: 'player', round: index + 2 }, maxLlmCalls: 5,
          verify(state, before) {
            if (index === 0) assert.ok(state.monsters.goblin_a.hp.current < before.monsters.goblin_a.hp.current, 'A hit must actually damage its target')
            if (index === 1) {
              assert.equal(state.monsters.goblin_a.hp.current, before.monsters.goblin_a.hp.current, 'A miss must not damage its target')
              assert.match(state.combatLog.slice(before.combatLog.length).map(entry => entry.mechanicalDetail).join(' '), /ECHEC CRITIQUE/)
            }
            if (index === 2) {
              assert.ok(state.player.hp.current > before.player.hp.current, 'The potion must heal')
              assert.ok(!state.player.inventory.some(item => item.id === 'potion1'), 'The potion must be consumed')
            }
          },
        })),
    },
    {
      name: 'inventory-persistence-and-refusal', initialGameState: baseGameState(),
      turns: [
        { message: 'je depose la potion', expectTools: ['drop_item'],
          expectState: { 'player.inventory.length': 2, 'droppedItems.potion1.item.id': 'potion1' } },
        { message: 'je vais en (6,13)', expectTools: ['move_token'], expectState: { 'player.position': { x: 6, y: 13 } } },
        { message: 'je reprends la potion', expectTools: ['pick_up_item'], expectNarrative: ['refusée'],
          expectUnchanged: ['player.inventory', 'droppedItems', 'worldFacts'] },
        { message: 'je vais en (5,13)', expectTools: ['move_token'], expectState: { 'player.position': { x: 5, y: 13 } } },
        { message: 'je reprends la potion', expectTools: ['pick_up_item'],
          expectState: { 'player.inventory.length': 3, 'droppedItems.potion1': undefined },
          verify(state) { assert.equal(state.player.inventory.filter(item => item.id === 'potion1').length, 1, 'No duplicate item') } },
      ],
    },
    {
      name: 'dialogue-without-player-attack', initialGameState: combatGameState(),
      turns: ['je ne frappe pas', "il me menace de m'attaquer", "pourquoi est-ce qu'il attaque ?"].map(message => ({
        message, forbidTools: attackTools, expectTools: [],
        expectUnchanged: ['player.hp', 'monsters', 'round', 'actionUsed'], maxLlmCalls: 2,
      })),
    },
  ]
}

function loadFixtures(filename) {
  if (!filename) return []
  const value = JSON.parse(fs.readFileSync(filename, 'utf8'))
  return (Array.isArray(value) ? value : [value]).map((scenario, index) => ({
    ...scenario, name: scenario.name ?? `fixture-${index + 1}`,
    initialGameState: typeof scenario.initialGameState === 'object' ? scenario.initialGameState
      : scenario.initialGameState === 'office' ? officeGameState()
      : scenario.initialGameState === 'combat' ? combatGameState()
      : !scenario.initialGameState || ['base', 'entrance'].includes(scenario.initialGameState) ? baseGameState()
      : (() => { throw new Error(`Unsupported current-state fixture: ${scenario.initialGameState}`) })(),
    turns: (scenario.turns ?? scenario.messages ?? []).map(normalizeTurn),
  }))
}

async function run() {
  const mode = option('--mode', process.env.LLM_MODE || 'mock')
  if (!['mock', 'live'].includes(mode)) throw new Error('Supported playtest modes: mock, live.')
  if (process.argv.some(arg => /^--(?:narration-mode|min-director-local-ratio|max-simple-turn-llm-calls)(?:=|$)/.test(arg))) {
    throw new Error('Removed playtest option: the current pipeline always uses the AI agent and LLM narration.')
  }
  const allowPaid = process.argv.includes('--allow-paid') || process.env.ALLOW_PAID_LLM === 'true'
  if (mode === 'live' && !allowPaid) throw new Error('Refus de lancer un playtest live sans --allow-paid.')
  // Dedicated process only. Production guards are unchanged, even if a local
  // shell has configured a smaller nonzero limit or enabled monetization.
  Object.assign(process.env, {
    LLM_MODE: mode, ALLOW_PAID_LLM: allowPaid ? 'true' : 'false',
    MONETIZATION_ENABLED: 'false', DM_RATE_LIMIT_PER_MINUTE: '0', DM_DAILY_GLOBAL_MESSAGE_LIMIT: '0',
    APP_LOG_BUFFER_ENABLED: 'false', APP_LOG_PERSIST_ENABLED: 'false', APP_LOG_LEVEL: 'error',
  })
  process.env.AI_DM_TEST_DICE_SEQUENCE ||= Array(80).fill('17,6,14,3,12,4,18,5').join(',')
  const { installPgMem } = require('../tests/helpers/pg-mem.cjs')
  const pg = installPgMem()
  const { POST } = require('../app/api/dm/route.ts')
  const { closeMCPClient } = require('../lib/mcp-client.ts')
  const { saveSession, loadSession, deleteSession } = require('../lib/session-store.ts')
  const { pendingCombatContinuation } = require('../lib/dm/combat-flow.ts')
  const scenarios = [...builtInScenarios(), ...loadFixtures(option('--session-fixture'))]
  for (const scenario of scenarios) scenario.turns = scenario.turns.map(normalizeTurn)
  const report = {
    mode, allowPaid, startedAt: new Date().toISOString(),
    targets: {
      maxEstimatedCostUsd: numberOption('--max-cost-usd', 'PLAYTEST_MAX_COST_USD', 0.05),
      // Action + narration = 2 calls; a complete combat cycle = 4.
      maxAverageLlmCallsPerTurn: numberOption('--max-average-llm-calls', 'PLAYTEST_MAX_AVERAGE_LLM_CALLS', 4),
      minLlmNarratorRatio: numberOption('--min-llm-narrator-ratio', 'PLAYTEST_MIN_LLM_NARRATOR_RATIO', 1),
    },
    summary: { scenarios: scenarios.length, plannedTurns: scenarios.reduce((sum, scenario) => sum + scenario.turns.length, 0),
      turns: 0, durationMs: 0, usage: { calls: 0, estimatedCostUsd: 0 },
      narratorCounts: {}, operationCounts: {}, toolCounts: {}, averageLlmCallsPerTurn: 0, llmNarratorRatio: 0 },
    turns: [], failures: [], targetViolations: [],
  }
  const increment = (counts, key) => { counts[key] = (counts[key] ?? 0) + 1 }
  const startedAt = Date.now()
  try {
    for (const scenario of scenarios) {
      const sessionId = `playtest-${mode}-${scenario.name}-${process.pid}-${Date.now()}`
      const previousDice = process.env.AI_DM_TEST_DICE_SEQUENCE
      if (scenario.diceSequence) process.env.AI_DM_TEST_DICE_SEQUENCE = scenario.diceSequence
      let before = structuredClone(scenario.initialGameState)
      try {
        // Seed once, then send messages only. Every subsequent turn must load
        // the actual saved session; no stale client snapshot can overwrite it.
        await saveSession(sessionId, { gameState: before, history: [], adventureId: before.adventureId, characterId: before.characterId })
        for (let index = 0; index < scenario.turns.length; index++) {
          const turn = scenario.turns[index]
          const response = await POST(new Request('http://localhost/api/dm', {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ message: turn.message, sessionId, clientRequestId: `${sessionId}-${index + 1}`, clientMeta: { inputMode: 'text' } }),
          }))
          const data = await response.json()
          const persisted = await loadSession(sessionId)
          const failures = validateTurn({ turn, before, status: response.status, data, persisted,
            pending: data.newGameState ? pendingCombatContinuation(data.newGameState) : null })
          const entry = { scenario: scenario.name, index: index + 1, message: turn.message,
            status: response.status, toolsUsed: data.toolsUsed ?? [], llmCalls: data.usage?.llm?.calls ?? 0,
            narrativeSample: data.narrative, phase: data.newGameState?.phase, round: data.newGameState?.round, failures }
          report.turns.push(entry); report.summary.turns++
          report.failures.push(...failures.map(failure => ({ scenario: scenario.name, index: index + 1, ...failure })))
          report.summary.usage.calls += entry.llmCalls
          report.summary.usage.estimatedCostUsd += data.usage?.llm?.estimatedCostUsd ?? 0
          increment(report.summary.narratorCounts, data.usage?.narrator ?? 'unknown')
          for (const operation of data.usage?.operations ?? []) increment(report.summary.operationCounts, operation)
          for (const tool of entry.toolsUsed) increment(report.summary.toolCounts, tool)
          if (data.newGameState) before = data.newGameState
          // Keep collecting independent failures; an HTTP error cannot supply
          // a valid continuation for the remaining turns in this scenario.
          if (response.status >= 400) break
        }
      } finally {
        await closeMCPClient(sessionId).catch(() => undefined)
        await deleteSession(sessionId).catch(() => undefined)
        if (previousDice === undefined) delete process.env.AI_DM_TEST_DICE_SEQUENCE
        else process.env.AI_DM_TEST_DICE_SEQUENCE = previousDice
      }
    }
  } finally {
    pg.restore()
    await pg.pool.end()
  }
  const summary = report.summary
  summary.durationMs = Date.now() - startedAt
  summary.averageLlmCallsPerTurn = Number((summary.usage.calls / summary.turns).toFixed(4))
  summary.llmNarratorRatio = (summary.narratorCounts.llm ?? 0) / summary.turns
  if (summary.turns !== summary.plannedTurns) report.targetViolations.push(`Only ${summary.turns}/${summary.plannedTurns} turns executed`)
  if (summary.usage.estimatedCostUsd > report.targets.maxEstimatedCostUsd) report.targetViolations.push('Estimated cost exceeds threshold')
  if (summary.averageLlmCallsPerTurn > report.targets.maxAverageLlmCallsPerTurn) report.targetViolations.push(`averageLlmCallsPerTurn ${summary.averageLlmCallsPerTurn} > ${report.targets.maxAverageLlmCallsPerTurn}`)
  if (summary.llmNarratorRatio < report.targets.minLlmNarratorRatio) report.targetViolations.push('LLM narration ratio below threshold')
  if (report.failures.length) report.targetViolations.push(`${report.failures.length} current-pipeline checks failed`)
  report.finishedAt = new Date().toISOString()
  const filename = option('--report')
  if (filename) {
    fs.mkdirSync(path.dirname(path.resolve(filename)), { recursive: true })
    fs.writeFileSync(filename, JSON.stringify(report, null, 2), 'utf8')
  }
  if (process.argv.includes('--json')) console.log(JSON.stringify(report, null, 2))
  else {
    console.log(`Playtest ${mode}: ${summary.turns}/${summary.plannedTurns} tours, ${summary.scenarios} scénarios, ${summary.durationMs} ms`)
    console.log(`LLM: ${summary.usage.calls} appels, moyenne ${summary.averageLlmCallsPerTurn}/tour, coût estimé $${summary.usage.estimatedCostUsd.toFixed(8)}`)
    console.log(`Tools: ${JSON.stringify(summary.toolCounts)}`)
    for (const failure of report.failures) console.log(`- ${failure.scenario} #${failure.index} [${failure.check}]: ${failure.detail}`)
    for (const violation of report.targetViolations) console.log(`- ${violation}`)
    if (!report.targetViolations.length) console.log('Objectifs: OK')
    if (filename) console.log(`Rapport: ${path.resolve(filename)}`)
  }
  if (report.targetViolations.length && !process.argv.includes('--no-fail')) process.exitCode = 1
  return report
}

if (require.main === module) run().catch(error => { console.error(error); process.exitCode = 1 })
module.exports = { run, baseGameState, combatGameState, officeGameState, builtInScenarios, loadFixtures }
