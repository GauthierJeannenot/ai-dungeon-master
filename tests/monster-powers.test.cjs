const test = require('node:test')
const assert = require('node:assert/strict')
const gs = require('../mcp-server/dist/mcp-server/game-state.js')
const dice = require('../mcp-server/dist/mcp-server/dice.js')
const { createMonster } = require('../mcp-server/dist/mcp-server/tools/phase-tools.js')
const { resolveAttack, resolveMonsterAttackAction, resolveCastSpell, registerCombatTools } = require('../mcp-server/dist/mcp-server/tools/combat-tools.js')
const { registerPlayerTools } = require('../mcp-server/dist/mcp-server/tools/player-tools.js')
const { resolveMonsterPower, registerMonsterPowerTools } = require('../mcp-server/dist/mcp-server/tools/monster-power-tools.js')
const rules = require('../mcp-server/dist/mcp-server/monster-rules.js')
const { executeNavigation } = require('../mcp-server/dist/mcp-server/navigation.js')
const { Client } = require('@modelcontextprotocol/sdk/client/index.js')
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js')

const handlers = new Map()
const server = { tool(name, description, schema, handler) { handlers.set(name, handler) } }
registerPlayerTools(server); registerCombatTools(server); registerMonsterPowerTools(server)
const unpack = response => JSON.parse(response.content[0].text)
const call = async (name, input) => unpack(await handlers.get(name)(input))
function forced(sequence) {
  delete process.env.AI_DM_TEST_DICE_SEQUENCE; dice.rollDice('1d20')
  process.env.AI_DM_TEST_DICE_SEQUENCE = sequence
}
function combat(type, options = {}) {
  const monster = createMonster(type, { x: 5, y: 13 })
  monster.id = 'actor'; monster.hostile = true
  gs.spawnMonster(monster)
  const state = gs.getState()
  state.npcs = {}
  Object.assign(state, { phase: 'combat', currentTurn: monster.id, initiativeOrder: [monster.id, 'player'], round: 1 })
  Object.assign(state.player, { ac: 1, hp: { current: 100, max: 100 }, position: { x: 4, y: 13 } })
  Object.assign(monster, options)
  return monster
}
test.beforeEach(() => { gs.resetState(); delete process.env.AI_DM_TEST_DICE_SEQUENCE; dice.rollDice('1d20') })
test.after(() => { delete process.env.AI_DM_TEST_DICE_SEQUENCE })

test('all catalogued multiattacks have executable plans, including fixed, random, alternate and conditional sequences', () => {
  const snapshot = require('../lib/srd/monsters.json')
  for (const [type, record] of Object.entries(snapshot.monsters)) if (record.source.actions.some(a => a.name === 'Multiattack')) {
    const plan = rules.multiattackPlans(createMonster(type, { x: 5, y: 13 }))
    assert.ok(plan.options?.length || plan.random, type)
  }
  assert.deepEqual(rules.multiattackPlans(createMonster('veteran', { x: 5, y: 13 })).options,
    [['Longsword', 'Longsword'], ['Longsword', 'Longsword', 'Shortsword']])
})

test('fungus rolls its attack count then independent attacks and consumes exactly one action', () => {
  const monster = combat('violet_fungus')
  forced('3,15,2,1,15,4')
  const result = unpack(resolveMonsterAttackAction(monster.id, 'player', 'Multiattack'))
  assert.equal(result.countRoll.total, 3)
  assert.deepEqual(result.attacks.map(a => a.hit), [true, false, true])
  assert.equal(gs.getPlayer().hp.current, 94)
  assert.equal(gs.hasActionUsed(monster.id), true)
  assert.equal(unpack(resolveMonsterAttackAction(monster.id, 'player', 'Rotting Touch')).code, 'ACTION_ALREADY_USED')
})

test('wight alternatives require a complete explicit valid combination with atomic rejection', () => {
  combat('wight'); forced('17')
  const before = structuredClone(gs.getState())
  for (const sequence of [undefined, ['Longsword'], ['Longsword', 'Longbow'], ['Life Drain', 'Life Drain']]) {
    assert.equal(unpack(resolveMonsterAttackAction('actor', 'player', 'Multiattack', sequence)).code, 'MULTIATTACK_SELECTION_REQUIRED')
    assert.deepEqual(gs.getState(), before)
  }
  assert.equal(dice.rollDice('1d20').total, 17, 'invalid requests consume no rolls')
})

test('wight resolves two longswords without a second action debit', () => {
  combat('wight'); forced('15,3,15,4')
  const result = unpack(resolveMonsterAttackAction('actor', 'player', 'Multiattack', ['Longsword', 'Longsword']))
  assert.equal(result.attackCount, 2)
  assert.equal(gs.getPlayer().hp.current, 89)
})

test('grick beak depends on tentacle hit and veteran gets at most one shortsword', () => {
  combat('grick'); forced('1,18')
  let result = unpack(resolveMonsterAttackAction('actor', 'player', 'Multiattack', ['Tentacles', 'Beak']))
  assert.equal(result.attackCount, 1)
  assert.equal(dice.rollDice('1d20').total, 18)
  gs.resetState(); combat('veteran'); forced('15,1,15,1,15,1')
  result = unpack(resolveMonsterAttackAction('actor', 'player', 'Multiattack', ['Longsword', 'Longsword', 'Shortsword']))
  assert.equal(result.attackCount, 3)
  assert.deepEqual(result.attacks.map(a => a.damageDealt), [4,4,4])
})

test('delegated monster turns actually use the source multiattack and stop when the player falls', async () => {
  combat('thug'); forced('15,2,15,3')
  let result = await call('run_monster_turns', {})
  assert.equal(result.resolvedTurns[0].attacks.length, 2)
  assert.equal(gs.getState().currentTurn, 'player')
  gs.resetState(); combat('thug'); gs.getPlayer().hp.current = 1; forced('15,2,19')
  result = await call('run_monster_turns', {})
  assert.equal(result.resolvedTurns[0].attacks.length, 1)
  assert.equal(dice.rollDice('1d20').total, 19, 'automatic policy never executes a finishing blow')
})

test('damage defenses floor resistance, double vulnerability, cancel immunity and respect magical/silvered weapons', () => {
  const tree = createMonster('awakened_tree', { x: 5, y: 13 })
  assert.equal(rules.adjustedDamage(tree, 7, 'bludgeoning', false, false, true).damage, 3)
  assert.equal(rules.adjustedDamage(tree, 7, 'fire').damage, 14)
  const wight = createMonster('wight', { x: 5, y: 13 })
  assert.equal(rules.adjustedDamage(wight, 9, 'slashing', false, false, true).damage, 4)
  assert.equal(rules.adjustedDamage(wight, 9, 'slashing', false, true, true).damage, 9)
  assert.equal(rules.adjustedDamage(wight, 9, 'slashing', true, false, true).damage, 9)
  assert.equal(rules.adjustedDamage(wight, 9, 'slashing', false, false, false).damage, 9)
  const wisp = createMonster('will_o_wisp', { x: 5, y: 13 })
  assert.equal(rules.adjustedDamage(wisp, 99, 'lightning').damage, 0)
  assert.equal(rules.adjustedDamage(wisp, 9, 'fire').damage, 4)
})

test('player weapon provenance comes from the carried item, and source monster dice cannot be overridden', () => {
  combat('wight'); gs.getState().currentTurn = 'player'; gs.getPlayer().inventory.find(i => i.type === 'weapon').silvered = true
  gs.getState().monsters.actor.ac = 1; forced('15,5')
  const result = unpack(resolveAttack('player', 'actor', 'longsword'))
  assert.equal(result.damageDealt, result.rawDamage)
  gs.resetState(); combat('wight')
  const before = structuredClone(gs.getState())
  assert.equal(unpack(resolveAttack('actor', 'player', 'Longsword', undefined, undefined, '100')).code, 'MONSTER_OVERRIDE_FORBIDDEN')
  assert.deepEqual(gs.getState(), before)
})

test('typed spell damage uses the same defenses and Magic Resistance applies only to magical saves', () => {
  combat('ghost')
  const state = gs.getState(); state.phase = 'exploration'
  state.player.knownSpells = ['ray-of-frost']; state.player.spellcastingAbility = 'int'; state.monsters.actor.ac = 1
  forced('15,8')
  const result = unpack(resolveCastSpell({ spellId: 'ray-of-frost', targetId: 'actor' }))
  assert.equal(result.damageDealt, 0)
  assert.equal(gs.getMonster('actor').hp.current, 45)
  gs.resetState(); combat('satyr'); forced('2,18,2')
  assert.equal(rules.savingThrow('actor', 'wis', 15, true).success, true)
  assert.equal(rules.savingThrow('actor', 'wis', 15).success, false)
})

test('condition immunity is enforced by the generic condition tool without mutating state', async () => {
  combat('will_o_wisp')
  const before = structuredClone(gs.getState())
  const result = await call('apply_condition', { entityId: 'actor', condition: 'restrained' })
  assert.equal(result.immune, true)
  assert.deepEqual(gs.getMonster('actor').conditions, [])
  assert.deepEqual(gs.getState().actionUsed, before.actionUsed)
})

test('raw damage cannot bypass defenses through update_hp; typed damage reports applied amount', async () => {
  combat('ghost')
  const before = structuredClone(gs.getState())
  assert.equal((await call('update_hp', { entityId: 'actor', delta: -10, reason: 'test' })).code, 'DAMAGE_CONTEXT_REQUIRED')
  assert.deepEqual(gs.getState(), before)
  const result = await call('update_hp', { entityId: 'actor', delta: -9, damageType: 'fire', damageOrigin: 'spell', reason: 'test' })
  assert.equal(result.damageResolution.damageDealt, 4)
  assert.equal(gs.getMonster('actor').hp.current, 41)
})

test('Undead Fortitude saves on lethal ordinary damage but never on radiant or critical damage', () => {
  combat('zombie'); gs.getMonster('actor').hp.current = 3; forced('20,17')
  let result = rules.dealDamage('actor', 5, 'slashing', { weaponAttack: true })
  assert.equal(result.fortitude.success, true)
  assert.equal(result.hpAfter, 1)
  result = rules.dealDamage('actor', 5, 'radiant')
  assert.equal(result.fortitude, undefined)
  assert.equal(result.died, true)
  assert.equal(dice.rollDice('1d20').total, 17)
  gs.resetState(); combat('zombie'); forced('17')
  assert.equal(rules.dealDamage('actor', 100, 'slashing', { critical: true }).fortitude, undefined)
  assert.equal(dice.rollDice('1d20').total, 17)
})

test('Pack Tactics grants advantage and wolf bite resolves its knockdown save', () => {
  combat('wolf')
  const ally = createMonster('goblin', { x: 4, y: 14 }); gs.spawnMonster(ally)
  forced('2,15,3,3,1')
  const result = unpack(resolveAttack('actor', 'player', 'Bite'))
  assert.match(result.attackRoll.detail, /ADV/)
  assert.equal(result.hit, true)
  assert.ok(gs.getPlayer().conditions.includes('prone'))
})

test('Martial Advantage adds 2d6 once per turn when a living ally is adjacent to the victim', () => {
  combat('hobgoblin')
  gs.spawnMonster(createMonster('goblin', { x: 4, y: 14 }))
  forced('15,2,3,4,15,2')
  const first = unpack(resolveAttack('actor', 'player', 'Longsword'))
  assert.equal(first.rawDamage, 10)
  gs.getState().actionUsed = {} // reaction-like extra attack, same turn key
  const second = unpack(resolveAttack('actor', 'player', 'Longsword'))
  assert.equal(second.rawDamage, 3)
})

test('frog bite restrains and grapples; escape is an action and source death frees the victim', async () => {
  combat('giant_frog'); forced('15,2')
  unpack(resolveAttack('actor', 'player', 'Bite'))
  assert.deepEqual(gs.getPlayer().conditions, ['grappled', 'restrained'])
  assert.throws(() => executeNavigation('player', { kind: 'cell', cell: { x: 3, y: 13 } }), /turn|condition/i)
  gs.getState().currentTurn = 'player'; forced('20')
  const effect = gs.getState().monsterEffects[0]
  const result = await call('escape_monster_grapple', { entityId: 'player', effectId: effect.id, ability: 'str' })
  assert.equal(result.escaped, true)
  assert.deepEqual(gs.getPlayer().conditions, [])
  rules.addEffect({ sourceId: 'actor', targetId: 'player', kind: 'grapple', conditions: ['grappled', 'restrained'], dc: 11 })
  rules.dealDamage('actor', 100, 'force')
  assert.deepEqual(gs.getPlayer().conditions, [])
})

test('sprite poison sleep survives hydration with positive HP and damage wakes without curing poison', () => {
  combat('sprite'); gs.getPlayer().position = { x: 3, y: 13 }; forced('15,1')
  unpack(resolveAttack('actor', 'player', 'Shortbow'))
  assert.deepEqual(gs.getPlayer().conditions, ['poisoned', 'unconscious', 'prone'])
  gs.replaceState(structuredClone(gs.getState()))
  assert.ok(gs.getPlayer().conditions.includes('unconscious'))
  rules.dealDamage('player', 1, 'fire')
  assert.deepEqual(gs.getPlayer().conditions, ['poisoned', 'prone'])
})

test('Life Drain reduces maximum HP by applied damage and a completed long rest restores the tracked reduction', async () => {
  combat('wight'); forced('15,4,1')
  const result = unpack(resolveAttack('actor', 'player', 'Life Drain'))
  assert.equal(result.damageDealt, 6)
  assert.equal(gs.getPlayer().hp.max, 94)
  assert.equal(gs.getPlayer().hp.current, 94)
  gs.getState().phase = 'exploration'
  assert.equal((await call('advance_game_time', { seconds: 10, completedLongRestForIds: ['player'] })).code, 'LONG_REST_INVALID')
  await call('advance_game_time', { seconds: 28800, completedLongRestForIds: ['player'] })
  assert.equal(gs.getPlayer().hp.max, 100)
  assert.equal(gs.getPlayer().hp.current, 94, 'this tool does not invent a healing event')
})

test('invisibility uses an action, grants attack advantage, and ends on attack or concentration failure', () => {
  combat('sprite')
  let result = unpack(resolveMonsterPower({ monsterId: 'actor', powerName: 'Invisibility' }))
  assert.equal(result.concentration, true)
  assert.equal(gs.hasActionUsed('actor'), true)
  gs.getState().actionUsed = {}; forced('2,15')
  result = unpack(resolveAttack('actor', 'player', 'Longsword'))
  assert.match(result.attackRoll.detail, /ADV/)
  assert.ok(!gs.getMonster('actor').conditions.includes('invisible'))
  gs.getState().actionUsed = {}; unpack(resolveMonsterPower({ monsterId: 'actor', powerName: 'Invisibility' }))
  forced('1'); rules.dealDamage('actor', 1, 'force')
  assert.ok(!gs.getMonster('actor').conditions.includes('invisible'))
})

test('teleport requires an explicit legal destination, supports a source bite and recharges once per monster turn', () => {
  combat('blink_dog'); forced('15,2,3,4,19')
  const result = unpack(resolveMonsterPower({ monsterId: 'actor', powerName: 'Teleport', toCell: { x: 3, y: 13 }, targetId: 'player', biteTiming: 'after' }))
  assert.equal(result.attack.hit, true)
  assert.equal(gs.getMonster('actor').monsterRuntime.recharge.Teleport, false)
  const copy = structuredClone(gs.getState()); copy.actionUsed = {}; gs.replaceState(copy)
  assert.equal(unpack(resolveMonsterPower({ monsterId: 'actor', powerName: 'Teleport', toCell: { x: 2, y: 13 } })).code, 'POWER_NOT_RECHARGED')
  gs.advanceTurn(); gs.advanceTurn() // first recharge = 3, fails
  assert.equal(gs.getMonster('actor').monsterRuntime.recharge.Teleport, false)
  rules.startMonsterTurn() // duplicate startup must not reroll
  assert.equal(gs.getMonster('actor').monsterRuntime.recharge.Teleport, false)
  gs.advanceTurn(); gs.advanceTurn() // next recharge = 4, succeeds
  assert.equal(gs.getMonster('actor').monsterRuntime.recharge.Teleport, true)
  assert.equal(dice.rollDice('1d20').total, 19)
})

test('an invalid teleport-plus-bite is atomic and consumes neither destination nor recharge', () => {
  combat('blink_dog')
  const before = structuredClone(gs.getState())
  assert.equal(unpack(resolveMonsterPower({ monsterId: 'actor', powerName: 'Teleport', toCell: { x: 8, y: 13 }, targetId: 'player', biteTiming: 'after' })).code, 'TELEPORT_BITE_INVALID')
  assert.deepEqual(gs.getState(), before)
})

test('Fey Charm protects its source; only a successful save grants immunity, not a voluntary ending', () => {
  combat('dryad'); forced('1')
  let result = unpack(resolveMonsterPower({ monsterId: 'actor', powerName: 'Fey Charm', targetId: 'player' }))
  assert.equal(result.save.success, false)
  gs.getState().currentTurn = 'player'
  assert.equal(unpack(resolveAttack('player', 'actor', 'longsword')).code, 'CHARMED_TARGET_FORBIDDEN')
  gs.getState().currentTurn = 'actor'
  result = unpack(resolveMonsterPower({ monsterId: 'actor', powerName: 'End Fey Charm', targetId: 'player' }))
  assert.equal(result.ended, true)
  assert.ok(!gs.getPlayer().conditions.includes('charmed'))
  assert.ok(!gs.getState().monsterPowerImmunities.some(i => i.power === 'fey-charm'))
  gs.getState().actionUsed = {}; forced('20')
  result = unpack(resolveMonsterPower({ monsterId: 'actor', powerName: 'Fey Charm', targetId: 'player' }))
  assert.equal(result.save.success, true)
  gs.getState().actionUsed = {}
  assert.equal(unpack(resolveMonsterPower({ monsterId: 'actor', powerName: 'Fey Charm', targetId: 'player' })).code, 'POWER_TARGET_IMMUNE')
})

test('harm from a charmer ally grants a fresh save even when an attack misses', () => {
  combat('dryad'); forced('1')
  unpack(resolveMonsterPower({ monsterId: 'actor', powerName: 'Fey Charm', targetId: 'player' }))
  const ally = createMonster('goblin', { x: 4, y: 14 }); ally.id = 'ally'; gs.spawnMonster(ally)
  gs.getState().initiativeOrder.push(ally.id); gs.getState().currentTurn = ally.id
  forced('1,20')
  const result = unpack(resolveAttack(ally.id, 'player', 'Scimitar'))
  assert.equal(result.hit, false)
  assert.ok(!gs.getPlayer().conditions.includes('charmed'))
  assert.ok(gs.getState().monsterPowerImmunities.some(i => i.power === 'fey-charm'))
})

test('curing a condition clears its tracked effect without leaving a charm limit or granting save immunity', () => {
  combat('dryad'); forced('1')
  unpack(resolveMonsterPower({ monsterId: 'actor', powerName: 'Fey Charm', targetId: 'player' }))
  gs.removeCondition('player', 'charmed')
  assert.equal(gs.getState().monsterEffects.length, 0)
  assert.equal(gs.getState().monsterPowerImmunities.length, 0)
})

test('Horrifying Visage does not grant Magic Resistance advantage absent a magical source description', () => {
  combat('ghost')
  const satyr = createMonster('satyr', { x: 6, y: 13 }); satyr.id = 'satyr'; gs.spawnMonster(satyr)
  forced('13,2,3,19')
  const result = unpack(resolveMonsterPower({ monsterId: 'actor', powerName: 'Horrifying Visage', targetIds: ['player', satyr.id] }))
  const target = result.targets.find(t => t.targetId === satyr.id)
  assert.equal(target.save.success, false)
  assert.doesNotMatch(target.save.roll.detail, /ADV/)
  assert.equal(dice.rollDice('1d20').total, 19)
})

test('Horrifying Visage requires the full area, tracks fear and aging, repeats the save and grants immunity', () => {
  combat('ghost'); forced('1,2,20')
  const before = structuredClone(gs.getState())
  assert.equal(unpack(resolveMonsterPower({ monsterId: 'actor', powerName: 'Horrifying Visage', targetIds: [] })).code, 'AREA_TARGETS_REQUIRED')
  assert.deepEqual(gs.getState(), before)
  const result = unpack(resolveMonsterPower({ monsterId: 'actor', powerName: 'Horrifying Visage', targetIds: ['player'] }))
  assert.equal(result.targets[0].aging.agingYears, 20)
  assert.ok(gs.getPlayer().conditions.includes('frightened'))
  gs.advanceTurn(); gs.advanceTurn()
  assert.ok(!gs.getPlayer().conditions.includes('frightened'))
  assert.ok(gs.getState().monsterPowerImmunities.some(i => i.targetId === 'player' && i.power === 'horrifying-visage'))
  assert.ok(gs.getState().monsterEffects.some(e => e.kind === 'supernatural-aging'), 'ending fear does not undo aging')
})

test('Consume Life is a bonus action with a real save, kills only on failure, heals and breaks invisibility', () => {
  combat('will_o_wisp'); gs.getMonster('actor').hp.current = 10
  gs.getPlayer().hp.current = 0; gs.getPlayer().deathSaves = { successes: 0, failures: 0 }
  unpack(resolveMonsterPower({ monsterId: 'actor', powerName: 'Invisibility' })); forced('1,2,3,4')
  const result = unpack(resolveMonsterPower({ monsterId: 'actor', powerName: 'Consume Life', targetId: 'player' }))
  assert.equal(result.killed, true)
  assert.equal(gs.getPlayer().deathSaves.dead, true)
  assert.equal(gs.getMonster('actor').hp.current, 19)
  assert.equal(gs.hasBonusActionUsed('actor'), true)
  assert.ok(!gs.getMonster('actor').conditions.includes('invisible'))
})

test('the real MCP schema preserves effects, recharge state, aging, time and item provenance across hydration', async t => {
  const client = new Client({ name: 'monster-persistence-test', version: '1' })
  await client.connect(new StdioClientTransport({ command: 'node', args: ['mcp-server/dist/mcp-server/index.js'], env: { ...process.env, ADVENTURE_ID: 'grammys-country-apple-pie', CHARACTER_ID: 'fighter' } }))
  t.after(() => client.close())
  const callMcp = async (name, arguments = {}) => unpack(await client.callTool({ name, arguments }))
  const state = await callMcp('get_game_state')
  const monster = createMonster('blink_dog', { x: 5, y: 13 }); monster.monsterRuntime = { recharge: { Teleport: false }, startedTurn: 'turn', invisibleConcentration: false }
  state.monsters[monster.id] = monster
  state.worldTimeSeconds = 120; state.turnCounter = 3
  state.player.inventory[0].magical = true; state.player.inventory[0].silvered = true
  state.monsterEffects = [{ id: 'sleep', sourceId: monster.id, targetId: 'player', kind: 'sprite-sleep', conditions: ['unconscious'], expiresAt: 180, endsOnDamage: true },
    { id: 'age', sourceId: monster.id, targetId: 'player', kind: 'supernatural-aging', conditions: [], agingYears: 20 }]
  state.monsterPowerImmunities = [{ sourceId: monster.id, targetId: 'player', power: 'horrifying-visage', expiresAt: 86520 }]
  state.player.conditions = ['unconscious']
  const hydrated = await callMcp('replace_game_state', { gameState: state })
  assert.deepEqual(hydrated.monsterEffects, state.monsterEffects)
  assert.deepEqual(hydrated.monsterPowerImmunities, state.monsterPowerImmunities)
  assert.deepEqual(hydrated.monsters, state.monsters)
  assert.deepEqual(hydrated.player.inventory, state.player.inventory)
  assert.deepEqual(hydrated.player.conditions, ['unconscious'])
  assert.equal(hydrated.worldTimeSeconds, 120)
})
