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

const effects = loadTsModule('lib/world-action-effects.ts')

test('world action effect table declares canonical events for mutating actions', () => {
  assert.deepEqual(effects.worldActionEffectForKind('open').canonicalEvents, ['door.opened', 'object.opened', 'room.object_discovered'])
  assert.deepEqual(effects.worldActionEffectForKind('take').canonicalEvents, ['object.taken', 'quest.item_found'])
  assert.deepEqual(effects.worldActionEffectForKind('combine_recipe').canonicalEvents, ['quest.completed'])
  assert.equal(effects.worldActionEffectForKind('read').mutatesWorld, false)
})

test('world action predicates classify common object capabilities', () => {
  assert.equal(effects.isWorldObjectOpenable({ kind: 'container', opened: false }), true)
  assert.equal(effects.isWorldObjectTakeable({ kind: 'clue', taken: false }), true)
  assert.equal(effects.isWorldObjectReadable({ tags: ['readable'] }), true)
  assert.equal(effects.isWorldObjectUsable({ kind: 'fixture' }), true)
  assert.equal(effects.isWorldObjectTrap({ kind: 'fixture', tags: ['trap'] }), true)
  assert.equal(effects.isWorldObjectDisarmable({ kind: 'trap', disarmed: false }), true)
})

test('world action recipe status requires both fragments and not-yet-combined flag', () => {
  const world = {
    objects: {
      recipe_half_office: { id: 'recipe_half_office', tags: ['recipe_half'], taken: true },
      recipe_half_apartment: { id: 'recipe_half_apartment', tags: ['recipe_half'], taken: true },
    },
    quests: {
      grammy_recipe: { id: 'grammy_recipe', progress: 2, goal: 2, flags: {}, completed: false },
    },
    flags: {},
  }
  const player = { inventory: [] }

  assert.equal(effects.canCombineRecipe(world, player), true)
  world.flags.recipe_combined = true
  assert.equal(effects.canCombineRecipe(world, player), false)
})
