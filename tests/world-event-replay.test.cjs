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

const { createInitialWorldState } = loadTsModule('lib/adventure-world.ts')
const { replayWorldEvents } = loadTsModule('lib/world-event-replay.ts')

test('world event replay applies canonical discovery, open, take, and quest completion events', () => {
  const events = [
    {
      id: 'discover-drawer',
      type: 'room.object_discovered',
      summary: 'Tiroir decouvert.',
      targetId: 'office_drawer',
      visibleToPlayer: true,
    },
    {
      id: 'open-drawer',
      type: 'object.opened',
      summary: 'Tiroir ouvert.',
      targetId: 'office_drawer',
      visibleToPlayer: true,
    },
    {
      id: 'take-recipe',
      type: 'object.taken',
      summary: 'Fragment pris.',
      targetId: 'recipe_half_office',
      visibleToPlayer: true,
    },
    {
      id: 'recipe-found',
      type: 'quest.item_found',
      summary: 'Fragment ajoute.',
      targetId: 'recipe_half_office',
      metadata: { questId: 'grammy_recipe' },
      visibleToPlayer: true,
    },
    {
      id: 'recipe-complete',
      type: 'quest.completed',
      summary: 'Recette assemblee.',
      targetId: 'grammy_recipe',
      visibleToPlayer: true,
    },
  ]

  const result = replayWorldEvents(createInitialWorldState(), events)

  assert.deepEqual(result.issues, [])
  assert.equal(result.world.objects.office_drawer.opened, true)
  assert.equal(result.world.objects.recipe_half_office.taken, true)
  assert.equal(result.world.quests.grammy_recipe.completed, true)
  assert.equal(result.world.flags.recipe_combined, true)
})

test('world event replay detects duplicate take and impossible trap trigger', () => {
  const events = [
    {
      id: 'take-once',
      type: 'object.taken',
      summary: 'Fragment pris.',
      targetId: 'recipe_half_office',
      visibleToPlayer: true,
    },
    {
      id: 'take-twice',
      type: 'object.taken',
      summary: 'Fragment repris.',
      targetId: 'recipe_half_office',
      visibleToPlayer: true,
    },
    {
      id: 'disarm-trap',
      type: 'trap.disarmed',
      summary: 'Piege desamorce.',
      targetId: 'animated_knife_rack',
      visibleToPlayer: true,
    },
    {
      id: 'trigger-trap',
      type: 'trap.triggered',
      summary: 'Piege declenche.',
      targetId: 'animated_knife_rack',
      visibleToPlayer: true,
    },
  ]

  const result = replayWorldEvents(createInitialWorldState(), events)
  const codes = result.issues.map(issue => issue.code)

  assert.ok(codes.includes('REPLAY_DUPLICATE_TAKE'))
  assert.ok(codes.includes('REPLAY_TRIGGERED_DISARMED_TRAP'))
})
