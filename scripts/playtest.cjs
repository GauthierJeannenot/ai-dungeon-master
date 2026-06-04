#!/usr/bin/env node

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')

function hasFlag(name) {
  return process.argv.includes(name)
}

function option(name, fallback) {
  const prefix = `${name}=`
  const inline = process.argv.find(arg => arg.startsWith(prefix))
  if (inline) return inline.slice(prefix.length)

  const index = process.argv.indexOf(name)
  if (index >= 0 && process.argv[index + 1] && !process.argv[index + 1].startsWith('--')) {
    return process.argv[index + 1]
  }

  return fallback
}

function numberOption(name, fallback) {
  const value = option(name, undefined)
  if (value === undefined) return fallback
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

const mode = option('--mode', process.env.LLM_MODE || 'mock')
const allowPaid = hasFlag('--allow-paid') || process.env.ALLOW_PAID_LLM === 'true'
const jsonOutput = hasFlag('--json')
const noFail = hasFlag('--no-fail')
const reportPath = option('--report', undefined)

if ((mode === 'live' || mode === 'record') && !allowPaid) {
  console.error('Refus de lancer un playtest live/record sans --allow-paid ou ALLOW_PAID_LLM=true.')
  process.exit(2)
}

const sessionStoreDir = path.join(os.tmpdir(), `ai-dm-playtest-${process.pid}`)

process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || 'sk-ant-playtest-placeholder'
process.env.ALLOW_PAID_LLM = allowPaid ? 'true' : 'false'
process.env.APP_LOG_BUFFER_ENABLED = process.env.APP_LOG_BUFFER_ENABLED || 'false'
process.env.APP_LOG_LEVEL = process.env.APP_LOG_LEVEL || 'error'
process.env.APP_LOG_PERSIST_ENABLED = process.env.APP_LOG_PERSIST_ENABLED || 'false'
process.env.GAME_SESSION_STORE_DIR = process.env.GAME_SESSION_STORE_DIR || sessionStoreDir
process.env.LLM_MODE = mode
process.env.AI_DM_TEST_DICE_SEQUENCE = process.env.AI_DM_TEST_DICE_SEQUENCE ||
  Array.from({ length: 160 }, (_, index) => [17, 6, 14, 3, 12, 4, 18, 5][index % 8]).join(',')

function installTsRequireWithAliases() {
  const previousTs = Module._extensions['.ts']
  const previousResolve = Module._resolveFilename

  Module._resolveFilename = function resolveFilename(request, parent, isMain, options) {
    if (request.startsWith('@/')) {
      const mapped = path.join(process.cwd(), request.slice(2))
      return previousResolve.call(this, mapped, parent, isMain, options)
    }

    return previousResolve.call(this, request, parent, isMain, options)
  }

  Module._extensions['.ts'] = function loadTs(mod, filename) {
    const source = fs.readFileSync(filename, 'utf8')
    const output = ts.transpileModule(source, {
      compilerOptions: {
        esModuleInterop: true,
        module: ts.ModuleKind.CommonJS,
        moduleResolution: ts.ModuleResolutionKind.NodeJs,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText
    mod._compile(output, filename)
  }

  return () => {
    Module._resolveFilename = previousResolve
    if (previousTs) Module._extensions['.ts'] = previousTs
    else delete Module._extensions['.ts']
  }
}

function baseGameState(overrides = {}) {
  return {
    phase: 'exploration',
    player: {
      id: 'player',
      name: 'Heros',
      class: 'Guerrier',
      level: 1,
      hp: { current: 20, max: 20 },
      ac: 16,
      stats: { str: 16, dex: 12, con: 14, int: 10, wis: 12, cha: 10 },
      proficiencyBonus: 2,
      position: { x: 4, y: 13 },
      conditions: [],
      inventory: [
        { id: 'longsword', name: 'Epee longue', type: 'weapon', damage: '1d8+3' },
        { id: 'shield', name: 'Bouclier', type: 'armor', acBonus: 2 },
        { id: 'potion1', name: 'Potion de soin', type: 'potion', description: '2d4+2 HP' },
      ],
      speed: 30,
    },
    monsters: {},
    initiativeOrder: [],
    currentTurn: null,
    round: 0,
    movementUsed: {},
    actionUsed: {},
    combatLog: [],
    roomsVisited: ['1'],
    currentRoomId: '1',
    encountersTriggered: [],
    ...overrides,
  }
}

function makeGoblin(id, overrides = {}) {
  return {
    id,
    name: `Gobelin ${id.replace(/^goblin_/, '').toUpperCase()}`,
    type: 'goblin',
    hp: { current: 60, max: 60 },
    ac: 13,
    stats: { str: 8, dex: 14, con: 10, int: 10, wis: 8, cha: 8 },
    position: { x: 5, y: 13 },
    conditions: [],
    xpValue: 50,
    attackBonus: 0,
    damageDice: '1d6+2',
    speed: 30,
    isAlive: true,
    ...overrides,
  }
}

function combatGameState() {
  return baseGameState({
    phase: 'combat',
    player: {
      ...baseGameState().player,
      hp: { current: 18, max: 20 },
      ac: 30,
      position: { x: 4, y: 13 },
    },
    monsters: {
      goblin_a: makeGoblin('goblin_a'),
    },
    initiativeOrder: ['player', 'goblin_a'],
    currentTurn: 'player',
    round: 1,
  })
}

const scenarios = [
  {
    name: 'exploration-local',
    initialGameState: baseGameState(),
    turns: [
      'je vais en (5,13)',
      'je vais en (6,13)',
      'je vais en (7,13)',
      'je vais en (8,13)',
      'je vais en (9,13)',
      'je vais en (10,13)',
      'je vais en (11,13)',
      'je vais en (11,12)',
      'je vais en (11,11)',
      'je vais en (10,11)',
      'je vais en (9,11)',
      'je vais en (8,11)',
    ].map(message => ({ message, expectNoLlm: true, category: 'simple' })),
  },
  {
    name: 'combat-local',
    initialGameState: combatGameState(),
    turns: [
      "j'attaque le gobelin",
      "je l'attaque encore",
      'je bois une potion de soin',
      "j'attaque le gobelin",
      'vas-y encore',
      "je l'attaque encore",
      'je passe mon tour',
      "j'attaque le gobelin",
      "je l'attaque encore",
      'vas-y encore',
    ].map(message => ({ message, expectNoLlm: true, category: 'simple' })),
  },
  {
    name: 'open-scenes',
    initialGameState: baseGameState(),
    turns: [
      'je parle gentiment a Mac pour lui demander ce qu il sait',
      "j'observe les marques autour de la porte",
      'je demande a Mac si Grammy est encore la',
      'je tente de convaincre Mac de nous aider',
      'je fouille prudemment le seuil sans entrer',
      'je raconte a Mac que je viens aider',
      'je cherche une odeur ou une piste utile',
      'je demande quelle entree semble la moins dangereuse',
    ].map(message => ({ message, expectNoLlm: false, category: 'open' })),
  },
]

function emptyUsage() {
  return {
    calls: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationInputTokens: 0,
    cacheReadInputTokens: 0,
    totalInputTokens: 0,
    estimatedCostUsd: 0,
  }
}

function addUsage(total, next) {
  if (!next) return total
  total.calls += next.calls ?? 0
  total.inputTokens += next.inputTokens ?? 0
  total.outputTokens += next.outputTokens ?? 0
  total.cacheCreationInputTokens += next.cacheCreationInputTokens ?? 0
  total.cacheReadInputTokens += next.cacheReadInputTokens ?? 0
  total.totalInputTokens += next.totalInputTokens ?? 0
  total.estimatedCostUsd = Number((total.estimatedCostUsd + (next.estimatedCostUsd ?? 0)).toFixed(8))
  return total
}

function increment(map, key) {
  map[key] = (map[key] ?? 0) + 1
}

function ratio(numerator, denominator) {
  return denominator > 0 ? Number((numerator / denominator).toFixed(4)) : 0
}

async function postDm(POST, body) {
  const response = await POST(new Request('http://localhost/api/dm', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }))
  return {
    status: response.status,
    data: await response.json(),
  }
}

async function run() {
  const restoreTsRequire = installTsRequireWithAliases()
  const { POST } = require(path.join(process.cwd(), 'app/api/dm/route.ts'))
  const { closeMCPClient } = require(path.join(process.cwd(), 'lib/mcp-client.ts'))
  const { deleteSession } = require(path.join(process.cwd(), 'lib/session-store.ts'))

  const report = {
    mode,
    allowPaid,
    startedAt: new Date().toISOString(),
    targets: {
      maxEstimatedCostUsd: numberOption('--max-cost-usd', Number(process.env.PLAYTEST_MAX_COST_USD ?? 0.05)),
      minDirectorLocalRatio: numberOption('--min-director-local-ratio', Number(process.env.PLAYTEST_MIN_DIRECTOR_LOCAL_RATIO ?? 0.65)),
      maxAverageLlmCallsPerTurn: numberOption('--max-average-llm-calls', Number(process.env.PLAYTEST_MAX_AVERAGE_LLM_CALLS ?? 0.45)),
      maxSimpleTurnLlmCalls: numberOption('--max-simple-turn-llm-calls', Number(process.env.PLAYTEST_MAX_SIMPLE_TURN_LLM_CALLS ?? 0)),
    },
    summary: {
      turns: 0,
      durationMs: 0,
      usage: emptyUsage(),
      narratorCounts: {},
      llmRouteCounts: {},
      operationCounts: {},
      toolCounts: {},
      directorLocalRatio: 0,
      averageLlmCallsPerTurn: 0,
    },
    turns: [],
    quality: {
      errors: [],
      simpleTurnLlmViolations: [],
      emptyNarratives: [],
      mockLeaksOnSimpleTurns: [],
    },
    targetViolations: [],
  }

  const startedAt = Date.now()

  try {
    for (const scenario of scenarios) {
      const sessionId = `playtest-${mode}-${scenario.name}-${process.pid}-${Date.now()}`
      let gameState = scenario.initialGameState
      let history = []
      let summaryContext

      try {
        for (let index = 0; index < scenario.turns.length; index++) {
          const turn = scenario.turns[index]
          const turnStartedAt = Date.now()
          const { status, data } = await postDm(POST, {
            message: turn.message,
            clientRequestId: `playtest-${scenario.name}-${index + 1}`,
            sessionId,
            gameState,
            history,
            summaryContext,
            clientMeta: { inputMode: 'text' },
          })

          const durationMs = Date.now() - turnStartedAt
          const usage = data.usage
          const turnReport = {
            scenario: scenario.name,
            index: index + 1,
            message: turn.message,
            category: turn.category,
            expectNoLlm: turn.expectNoLlm,
            status,
            durationMs,
            toolsUsed: data.toolsUsed ?? [],
            narrator: usage?.narrator ?? 'unknown',
            llmRoute: usage?.llmRoute ?? 'unknown',
            llmCalls: usage?.llm?.calls ?? 0,
            estimatedCostUsd: usage?.llm?.estimatedCostUsd ?? 0,
            operations: usage?.operations ?? [],
            narrativeLength: typeof data.narrative === 'string' ? data.narrative.length : 0,
            phase: data.newGameState?.phase,
            alertLevel: data.newGameState?.sceneMemory?.alertLevel ?? 0,
          }
          report.turns.push(turnReport)
          report.summary.turns += 1
          addUsage(report.summary.usage, usage?.llm)
          increment(report.summary.narratorCounts, turnReport.narrator)
          increment(report.summary.llmRouteCounts, turnReport.llmRoute)
          for (const operation of turnReport.operations) increment(report.summary.operationCounts, operation)
          for (const toolName of turnReport.toolsUsed) increment(report.summary.toolCounts, toolName)

          if (status >= 400 || data.error) {
            report.quality.errors.push({ scenario: scenario.name, index: index + 1, status, error: data.error })
          }
          if (!data.narrative) {
            report.quality.emptyNarratives.push({ scenario: scenario.name, index: index + 1 })
          }
          if (turn.expectNoLlm && turnReport.llmCalls > report.targets.maxSimpleTurnLlmCalls) {
            report.quality.simpleTurnLlmViolations.push(turnReport)
          }
          if (turn.expectNoLlm && /\[Mock\]/.test(data.narrative ?? '')) {
            report.quality.mockLeaksOnSimpleTurns.push(turnReport)
          }

          if (status >= 400) break
          if (data.newGameState) gameState = data.newGameState
          if (data.summaryContext) summaryContext = data.summaryContext
          history = [
            ...history,
            { role: 'player', content: turn.message },
            { role: 'dm', content: data.narrative || '' },
          ]
        }
      } finally {
        await closeMCPClient(sessionId).catch(() => undefined)
        await deleteSession(sessionId).catch(() => undefined)
      }
    }
  } finally {
    restoreTsRequire()
    fs.rmSync(sessionStoreDir, { recursive: true, force: true })
  }

  report.summary.durationMs = Date.now() - startedAt
  const directorLocalTurns = (report.summary.narratorCounts.director ?? 0) + (report.summary.narratorCounts.local ?? 0)
  report.summary.directorLocalRatio = ratio(directorLocalTurns, report.summary.turns)
  report.summary.averageLlmCallsPerTurn = ratio(report.summary.usage.calls, report.summary.turns)
  report.finishedAt = new Date().toISOString()

  if (report.summary.usage.estimatedCostUsd > report.targets.maxEstimatedCostUsd) {
    report.targetViolations.push(`estimatedCostUsd ${report.summary.usage.estimatedCostUsd} > ${report.targets.maxEstimatedCostUsd}`)
  }
  if (report.summary.directorLocalRatio < report.targets.minDirectorLocalRatio) {
    report.targetViolations.push(`directorLocalRatio ${report.summary.directorLocalRatio} < ${report.targets.minDirectorLocalRatio}`)
  }
  if (report.summary.averageLlmCallsPerTurn > report.targets.maxAverageLlmCallsPerTurn) {
    report.targetViolations.push(`averageLlmCallsPerTurn ${report.summary.averageLlmCallsPerTurn} > ${report.targets.maxAverageLlmCallsPerTurn}`)
  }
  if (report.quality.simpleTurnLlmViolations.length > 0) {
    report.targetViolations.push(`${report.quality.simpleTurnLlmViolations.length} simple turns used too many LLM calls`)
  }
  if (report.quality.errors.length > 0) {
    report.targetViolations.push(`${report.quality.errors.length} turns returned errors`)
  }
  if (report.quality.emptyNarratives.length > 0) {
    report.targetViolations.push(`${report.quality.emptyNarratives.length} turns returned empty narratives`)
  }

  if (reportPath) {
    const absolutePath = path.resolve(reportPath)
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true })
    fs.writeFileSync(absolutePath, JSON.stringify(report, null, 2), 'utf8')
  }

  if (jsonOutput) {
    console.log(JSON.stringify(report, null, 2))
  } else {
    console.log(`Playtest ${mode}: ${report.summary.turns} tours en ${report.summary.durationMs} ms`)
    console.log(`LLM: ${report.summary.usage.calls} appels, cout estime $${report.summary.usage.estimatedCostUsd.toFixed(8)}, moyenne ${report.summary.averageLlmCallsPerTurn} appel/tour`)
    console.log(`Director/local: ${(report.summary.directorLocalRatio * 100).toFixed(1)}%`)
    console.log(`Narrateurs: ${JSON.stringify(report.summary.narratorCounts)}`)
    console.log(`Routes LLM: ${JSON.stringify(report.summary.llmRouteCounts)}`)
    console.log(`Tools: ${JSON.stringify(report.summary.toolCounts)}`)
    if (reportPath) console.log(`Rapport: ${path.resolve(reportPath)}`)
    if (report.targetViolations.length > 0) {
      console.log('Violations:')
      for (const violation of report.targetViolations) console.log(`- ${violation}`)
    } else {
      console.log('Objectifs: OK')
    }
  }

  if (report.targetViolations.length > 0 && !noFail) {
    process.exitCode = 1
  }
}

run().catch(err => {
  console.error(err)
  process.exit(1)
})
