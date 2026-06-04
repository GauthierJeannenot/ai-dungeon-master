const assert = require('node:assert/strict')
const test = require('node:test')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')

function installTsRequire() {
  const previous = Module._extensions['.ts']
  Module._extensions['.ts'] = function loadTs(mod, filename) {
    const source = fs.readFileSync(filename, 'utf8')
    const output = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    }).outputText
    mod._compile(output, filename)
  }

  return () => {
    if (previous) Module._extensions['.ts'] = previous
    else delete Module._extensions['.ts']
  }
}

function loadTsModule(relativePath) {
  const restore = installTsRequire()
  try {
    return require(path.join(process.cwd(), relativePath))
  } finally {
    restore()
  }
}

const { normalizeLlmToolInput } = loadTsModule('lib/tool-input-normalizer.ts')

test('tool input normalizer parses stringified resolve_player_action action', () => {
  const normalized = normalizeLlmToolInput('resolve_player_action', {
    action: '{ "kind": "move", "tokenId": "player", "toCell": { "x": 12, "y": 10 } }',
  })

  assert.equal(normalized.error, undefined)
  assert.equal(normalized.changed, true)
  assert.deepEqual(normalized.corrections, ['parsed_stringified_action'])
  assert.deepEqual(normalized.input, {
    action: {
      kind: 'move',
      tokenId: 'player',
      toCell: { x: 12, y: 10 },
    },
  })
})

test('tool input normalizer refuses invalid stringified action', () => {
  const normalized = normalizeLlmToolInput('resolve_player_action', {
    action: '{ kind: move }',
  })

  assert.equal(normalized.error?.code, 'INVALID_STRINGIFIED_ACTION')
  assert.equal(normalized.input, undefined)
})
