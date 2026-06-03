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

const intent = loadTsModule('lib/dm-intent.ts')

test('dm intent normalizes accents and typographic apostrophes', () => {
  assert.equal(intent.normalizeFrenchText("C'est à toi"), "c'est a toi")
  assert.equal(intent.normalizeFrenchText("C’est à toi"), "c'est a toi")
})

test('dm intent detects healing potion consumption without matching passive mentions', () => {
  assert.equal(intent.detectHealingPotionIntent("ah j'attrape les potions de soins et j'en bois une d'ailleurs"), true)
  assert.equal(intent.detectHealingPotionIntent("je me soigne avec une potion"), true)
  assert.equal(intent.detectHealingPotionIntent("je regarde la potion sans la toucher"), false)
})

test('dm intent detects state/debug questions from prod-like voice phrases', () => {
  assert.equal(intent.detectDebugStateQuestion('pourquoi je me vois à 10 points de vie alors'), true)
  assert.equal(intent.detectDebugStateQuestion('et le gobelin il est toujours devant moi sur la carte'), true)
  assert.equal(intent.detectDebugStateQuestion('je regarde le gobelin devant moi'), false)
})

test('dm intent separates door traversal from local object actions', () => {
  const door = intent.normalizeFrenchText("j'ouvre la grande porte")
  const drawer = intent.normalizeFrenchText("j'ouvre le tiroir du bureau")

  assert.equal(intent.isDoorTraversalIntent(door), true)
  assert.equal(intent.referencesLocalObjectInsteadOfRoom(door), false)
  assert.equal(intent.isDoorTraversalIntent(drawer), false)
  assert.equal(intent.referencesLocalObjectInsteadOfRoom(drawer), true)
})
