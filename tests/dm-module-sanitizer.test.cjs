const assert = require('node:assert/strict')
const test = require('node:test')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const Module = require('node:module')
const ts = require('typescript')

function loadTsModule(relativePath) {
  const filename = path.join(process.cwd(), relativePath)
  const source = fs.readFileSync(filename, 'utf8')
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText

  const mod = { exports: {} }
  const wrapped = Module.wrap(transpiled)
  const script = new vm.Script(wrapped, { filename })
  const requireFromFile = Module.createRequire(filename)
  script.runInThisContext()(mod.exports, requireFromFile, mod, filename, path.dirname(filename))
  return mod.exports
}

const sanitizer = loadTsModule('lib/dm-module-sanitizer.ts')

test('dm module sanitizer removes legacy MCP tool contracts from prompt context', () => {
  const moduleContext = [
    '# Module',
    'Texte important conserve.',
    '',
    'Utiliser `spawn_monster({ monsterType: "goblin" })` si les gobelins attaquent.',
    '',
    '```',
    'spawn_monster({ monsterType: "goblin", cell: {x:5, y:5} })',
    'enter_combat({ combatants: ["player"] })',
    '```',
  ].join('\n')

  const sanitized = sanitizer.sanitizeAdventureModuleToolContracts(moduleContext)

  assert.match(sanitized, /Texte important conserve/)
  assert.doesNotMatch(sanitized, /spawn_monster/)
  assert.doesNotMatch(sanitized, /enter_combat/)
  assert.match(sanitized, /start_encounter/)
  assert.match(sanitized, /Contrat moteur/)
})
