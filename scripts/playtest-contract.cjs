'use strict'

const { isDeepStrictEqual } = require('node:util')

const turnFields = new Set(['message', 'category', 'expectTools', 'forbidTools', 'expectState',
  'expectUnchanged', 'expectLog', 'expectNarrative', 'forbidNarrative', 'maxLlmCalls', 'verify'])

function normalizeTurn(turn) {
  const value = typeof turn === 'string' ? { message: turn } : turn
  if (!value || typeof value.message !== 'string' || !value.message.trim()) throw new Error('Each playtest turn requires a message.')
  for (const key of Object.keys(value)) {
    if (!turnFields.has(key)) throw new Error(`Unsupported playtest expectation: ${key}. Migrate the fixture to the current MCP/state contract.`)
  }
  return value
}

function atPath(value, path) {
  return path.split('.').reduce((current, key) => current?.[key], value)
}

function validateTurn({ turn, before, status, data, persisted, pending }) {
  const failures = []
  const fail = (check, detail) => failures.push({ check, detail })
  if (status !== 200 || data.error) fail('response', `${status}: ${data.error ?? 'Unexpected HTTP status'}`)
  if (typeof data.narrative !== 'string' || !data.narrative.trim()) fail('narration', 'Missing narration')
  else {
    if (/résolution du tour reste incomplète|action n.a pas pu être résolue|Dungeon Master prend un moment/i.test(data.narrative)) {
      fail('narration', 'Unresolved turn or placeholder narration')
    }
    if (/^(?:\*{1,2})?\s*(?:je\b|j['’])/i.test(data.narrative)) fail('narration', 'The DM speaks as the player')
    for (const pattern of turn.expectNarrative ?? []) {
      if (!new RegExp(pattern, 'iu').test(data.narrative)) fail('narration', `Missing: ${pattern}`)
    }
    for (const pattern of turn.forbidNarrative ?? []) {
      if (new RegExp(pattern, 'iu').test(data.narrative)) fail('narration', `Forbidden: ${pattern}`)
    }
  }
  if (!Array.isArray(data.toolsUsed) || data.toolsUsed.some(tool => typeof tool !== 'string')) fail('tools', 'Missing or malformed toolsUsed')
  const tools = Array.isArray(data.toolsUsed) ? data.toolsUsed : []
  for (const name of turn.expectTools ?? []) if (!tools.includes(name)) fail('tools', `Missing ${name}`)
  for (const name of turn.forbidTools ?? []) if (tools.includes(name)) fail('tools', `Forbidden ${name}`)
  if (!Number.isInteger(data.usage?.llm?.calls) || data.usage.llm.calls < 1 || data.usage.narrator !== 'llm') {
    fail('usage', 'Missing current LLM usage/narrator contract')
  } else if (turn.maxLlmCalls && data.usage.llm.calls > turn.maxLlmCalls) fail('usage', `Too many calls: ${data.usage.llm.calls} > ${turn.maxLlmCalls}`)
  const state = data.newGameState
  if (!state?.player || !Array.isArray(state.combatLog)) {
    fail('state', 'Missing current game state')
    return failures
  }
  if (pending) fail('combat', `Incomplete combat cycle: ${pending}`)
  // Compare the JSON boundary on both sides (undefined fields are not persisted).
  if (!persisted || !isDeepStrictEqual(JSON.parse(JSON.stringify(persisted.gameState)), state)) {
    fail('persistence', 'Saved state differs from response state')
  }
  for (const [path, expected] of Object.entries(turn.expectState ?? {})) {
    if (!isDeepStrictEqual(atPath(state, path), expected)) fail('state', `${path}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(atPath(state, path))}`)
  }
  for (const path of turn.expectUnchanged ?? []) {
    if (!isDeepStrictEqual(atPath(state, path), atPath(before, path))) fail('state', `${path} changed unexpectedly`)
  }
  const log = state.combatLog.slice(before.combatLog?.length ?? 0)
    .map(entry => `${entry.action} ${entry.mechanicalDetail ?? ''}`).join('\n')
  for (const pattern of turn.expectLog ?? []) if (!new RegExp(pattern, 'iu').test(log)) fail('log', `Missing new mechanical entry: ${pattern}`)
  if (turn.verify) {
    try { turn.verify(state, before, data) } catch (error) { fail('state', error.message) }
  }
  return failures
}

module.exports = { normalizeTurn, validateTurn }
