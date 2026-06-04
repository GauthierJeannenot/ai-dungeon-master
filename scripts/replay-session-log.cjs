#!/usr/bin/env node

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

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

function hasFlag(name) {
  return process.argv.includes(name)
}

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function turnFromMessage(message) {
  const text = typeof message === 'string' ? message.trim() : ''
  return text ? { message: text, category: 'regression' } : null
}

function turnFromTrace(trace) {
  if (!trace || typeof trace !== 'object') return null
  const message = trace.input && typeof trace.input.raw === 'string'
    ? trace.input.raw
    : typeof trace.playerMessage === 'string'
      ? trace.playerMessage
      : undefined
  const turn = turnFromMessage(message)
  if (!turn) return null

  const toolsUsed = Array.isArray(trace.toolsUsed) ? trace.toolsUsed.filter(tool => typeof tool === 'string') : []
  const eventTypes = Array.isArray(trace.engineEvents)
    ? trace.engineEvents
        .map(event => event && typeof event === 'object' ? event.type : undefined)
        .filter(type => typeof type === 'string')
    : []

  return {
    ...turn,
    expectTools: toolsUsed.length > 0 ? [...new Set(toolsUsed)] : undefined,
    expectEvents: eventTypes.length > 0 ? [...new Set(eventTypes)] : undefined,
    expectTargetResolution: trace.targetResolution ? undefined : false,
    traceId: typeof trace.traceId === 'string' ? trace.traceId : undefined,
  }
}

function turnFromEntry(entry) {
  if (typeof entry === 'string') return turnFromMessage(entry)
  if (!entry || typeof entry !== 'object') return null
  if (entry.schemaVersion === 1 && entry.input) return turnFromTrace(entry)
  if (entry.turnTrace) return turnFromTrace(entry.turnTrace)
  if (typeof entry.message === 'string') return turnFromMessage(entry.message)
  if (typeof entry.content === 'string' && entry.role === 'player') return turnFromMessage(entry.content)

  const payload = entry.payload && typeof entry.payload === 'object' ? entry.payload : entry
  const event = typeof entry.event === 'string' ? entry.event : ''
  if (event === 'dm.turn.trace' && payload.turnTrace) return turnFromTrace(payload.turnTrace)
  if (
    (event === 'client.dm.request' || event === 'dm.request.start' || event === 'dm.action.intent') &&
    typeof payload.message === 'string'
  ) {
    return turnFromMessage(payload.message)
  }

  if (payload.entry && typeof payload.entry === 'object') return turnFromEntry(payload.entry)
  if (payload.data && typeof payload.data === 'object') return turnFromEntry(payload.data)
  return null
}

function extractTurns(input) {
  if (Array.isArray(input)) return input.map(turnFromEntry).filter(Boolean)
  if (!input || typeof input !== 'object') return []

  if (Array.isArray(input.turns)) {
    return input.turns.map(turn => {
      if (typeof turn === 'string') return turnFromMessage(turn)
      if (turn && typeof turn === 'object' && typeof turn.message === 'string') return turn
      return turnFromEntry(turn)
    }).filter(Boolean)
  }

  if (Array.isArray(input.messages)) return input.messages.map(turnFromEntry).filter(Boolean)
  if (Array.isArray(input.history)) return input.history.map(turnFromEntry).filter(Boolean)
  if (Array.isArray(input.logs)) return input.logs.map(turnFromEntry).filter(Boolean)
  if (Array.isArray(input.entries)) return input.entries.map(turnFromEntry).filter(Boolean)
  if (Array.isArray(input.turnTraces)) return input.turnTraces.map(turnFromTrace).filter(Boolean)
  return []
}

function readInputFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8')
  try {
    return JSON.parse(raw)
  } catch {
    const entries = raw
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean)
      .map(line => JSON.parse(line))
    return { entries }
  }
}

function buildFixture(input, sourcePath) {
  const turns = extractTurns(input)
  if (turns.length === 0) {
    throw new Error('Aucun message joueur exploitable trouve dans le fichier.')
  }

  return {
    name: input.name || `session-regression-${path.basename(sourcePath, path.extname(sourcePath))}`,
    initialGameState: input.initialGameState || 'base',
    turns,
  }
}

function main() {
  const inputPath = option('--input', undefined)
  if (!inputPath) {
    console.error('Usage: node scripts/replay-session-log.cjs --input session.json [--output fixture.json] [--playtest]')
    process.exit(2)
  }

  const absoluteInput = path.resolve(inputPath)
  const input = readInputFile(absoluteInput)
  const fixture = buildFixture(input, absoluteInput)

  const outputPath = option('--output', undefined)
  const fixturePath = outputPath
    ? path.resolve(outputPath)
    : path.join(os.tmpdir(), `ai-dm-session-regression-${process.pid}.json`)

  fs.mkdirSync(path.dirname(fixturePath), { recursive: true })
  fs.writeFileSync(fixturePath, JSON.stringify(fixture, null, 2), 'utf8')

  console.log(`Fixture: ${fixturePath}`)
  console.log(`Tours joueur: ${fixture.turns.length}`)

  if (hasFlag('--playtest')) {
    const args = [
      path.join('scripts', 'playtest.cjs'),
      '--mode',
      option('--mode', process.env.LLM_MODE || 'mock'),
      '--narration-mode',
      option('--narration-mode', process.env.NARRATION_MODE || 'quality'),
      '--session-fixture',
      fixturePath,
    ]
    const result = spawnSync(process.execPath, args, {
      cwd: process.cwd(),
      stdio: 'inherit',
      env: process.env,
    })
    process.exitCode = result.status ?? 1
  }
}

if (require.main === module) {
  main()
}

module.exports = {
  buildFixture,
  extractTurns,
  readInputFile,
  turnFromEntry,
  turnFromTrace,
}
