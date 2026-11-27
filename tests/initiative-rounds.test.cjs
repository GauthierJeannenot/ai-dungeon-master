const test = require('node:test')
const assert = require('node:assert/strict')
process.env.ADVENTURE_ID = 'sarah-of-yellowcrest-manor'
process.env.CHARACTER_ID = 'fighter'
const gs = require('../mcp-server/dist/mcp-server/game-state.js')
const { createMonster, startCombat, registerPhaseTools } = require('../mcp-server/dist/mcp-server/tools/phase-tools.js')
const { registerCombatTools } = require('../mcp-server/dist/mcp-server/tools/combat-tools.js')
const { rollDice } = require('../mcp-server/dist/mcp-server/dice.js')

function fixture(t, sequence) {
  const previous = process.env.AI_DM_TEST_DICE_SEQUENCE
  // Reset the forced sequence even when consecutive tests use identical dice.
  delete process.env.AI_DM_TEST_DICE_SEQUENCE
  rollDice('1d20')
  process.env.AI_DM_TEST_DICE_SEQUENCE = sequence
  gs.resetState()
  t.after(() => {
    gs.resetState()
    if (previous === undefined) delete process.env.AI_DM_TEST_DICE_SEQUENCE
    else process.env.AI_DM_TEST_DICE_SEQUENCE = previous
  })
  const state = gs.getState()
  state.player.stats.dex = 10
  state.player.features = []
  const a = createMonster('goblin', { x: 1, y: 1 })
  // These round-order fixtures need distinct initial rolls; identical SRD
  // goblins correctly share a single group roll in the dedicated group suite.
  const b = createMonster('bandit', { x: 2, y: 1 })
  a.stats.dex = b.stats.dex = 10
  gs.spawnMonster(a); gs.spawnMonster(b)
  const ids = ['player', a.id, b.id]
  const callbacks = {}, server = { tool(name, description, schema, callback) { callbacks[name] = callback } }
  registerPhaseTools(server); registerCombatTools(server)
  const call = async (name, input = {}) => JSON.parse((await callbacks[name](input)).content[0].text)
  return { state, a, b, ids, call }
}

test('initiative is rolled once at combat entry and retained across every subsequent round', t => {
  const { state, a, b, ids } = fixture(t, '18,10,2,6')
  const initial = startCombat(ids)
  assert.deepEqual(initial.initiativeOrder, ids)
  const generation = state.combatGeneration
  const assigned = [state.player.initiative, a.initiative, b.initiative]
  assert.equal(gs.advanceTurn(), a.id)
  assert.equal(gs.advanceTurn(), b.id)
  assert.equal(state.round, 1)
  assert.equal(gs.advanceTurn(), 'player')
  assert.equal(state.round, 2)
  assert.deepEqual(state.initiativeOrder, ids)
  assert.deepEqual([state.player.initiative, a.initiative, b.initiative], assigned)
  assert.equal(state.combatGeneration, generation, 'the new round is not a new combat')
  assert.equal(state.turnCounter, 3)
  assert.equal(state.worldTimeSeconds, 6)
  assert.equal(gs.advanceTurn(), a.id)
  assert.equal(gs.advanceTurn(), b.id)
  assert.equal(gs.advanceTurn(), 'player')
  assert.equal(state.round, 3)
  assert.deepEqual(state.initiativeOrder, ids)
  assert.deepEqual([state.player.initiative, a.initiative, b.initiative], assigned)
  assert.equal(state.combatLog.filter(entry => entry.action.startsWith('Initiative — round')).length, 0)
  assert.equal(state.combatLog.filter(entry => entry.action.startsWith('Ordre d’initiative — round')).length, 2)
  assert.equal(rollDice('1d20').total, 6, 'rounds do not consume any initiative dice')
})

test('initial ties retain the supplied adjudicated order and a saved mid-round state does not reroll', t => {
  const { a, b, ids } = fixture(t, '10,10,10,7')
  startCombat(ids)
  assert.equal(gs.advanceTurn(), a.id)
  gs.replaceState(structuredClone(gs.getState()))
  assert.equal(gs.advanceTurn(), b.id)
  assert.equal(gs.getState().round, 1)
  assert.equal(gs.advanceTurn(), 'player')
  assert.deepEqual(gs.getState().initiativeOrder, ['player', a.id, b.id])
  assert.equal(gs.getState().round, 2)
  assert.deepEqual(ids.map(id => gs.getEntity(id).initiative), [10,10,10])
  assert.equal(rollDice('1d20').total, 7)
})

test('a dying player retains its original slot while a dead monster is removed without new initiative rolls', t => {
  const { state, a, b, ids } = fixture(t, '18,10,2,8')
  startCombat(ids)
  gs.updatePlayerHP(-state.player.hp.current)
  gs.updateMonsterHP(a.id, -a.hp.current)
  assert.equal(gs.advanceTurn(), b.id)
  assert.equal(gs.advanceTurn(), 'player')
  assert.deepEqual(state.initiativeOrder, ['player', b.id])
  assert.equal(state.round, 2)
  assert.deepEqual([state.player.initiative, a.initiative, b.initiative], [18,10,2])
  assert.equal(rollDice('1d20').total, 8)
})

for (const [feature, expected] of [['remarkable_athlete', 12], ['jack_of_all_trades', 11]]) {
  test('initial initiative keeps the '+feature+' bonus without applying it again at later rounds', t => {
    const { state, ids } = fixture(t, '10,1,1,17')
    state.player.proficiencyBonus = 3
    state.player.features = [feature]
    startCombat(ids)
    assert.equal(state.player.initiative, expected)
    gs.advanceTurn(); gs.advanceTurn(); gs.advanceTurn()
    assert.equal(state.player.initiative, expected)
    assert.equal(rollDice('1d20').total, 17)
  })
}

test('run_monster_turns follows the retained order across a round boundary and returns at the real player slot', async t => {
  const { state, a, b, ids, call } = fixture(t, '18,10,2,17')
  startCombat(ids)
  const generation = state.combatGeneration
  await call('pass_turn')
  const result = await call('run_monster_turns', { holdIds: [a.id, b.id] })
  assert.equal(result.error, undefined)
  assert.equal(result.turnsResolved, 2)
  assert.deepEqual(result.resolvedTurns.map(turn => turn.id), [a.id, b.id])
  assert.deepEqual(result.initiativeOrder, ids)
  assert.equal(result.currentTurn, 'player')
  assert.equal(result.round, 2)
  assert.equal(state.combatGeneration, generation)
  assert.equal(state.hero.actionCredits, 1)
  assert.equal(state.actionUsed.player, undefined)
  assert.equal(rollDice('1d20').total, 17)
})

test('passing the last player slot returns to the original first combatant rather than choosing a new winner', async t => {
  const { state, a, b, ids, call } = fixture(t, '1,20,10,17')
  startCombat(ids)
  assert.deepEqual(state.initiativeOrder, [a.id,b.id,'player'])
  gs.advanceTurn(); gs.advanceTurn()
  const result = await call('pass_turn')
  assert.equal(result.currentTurn, a.id)
  assert.equal(result.round, 2)
  assert.deepEqual(result.initiativeOrder, [a.id,b.id,'player'])
  assert.equal(state.hero.turnStarted.player, 1)
  assert.equal(rollDice('1d20').total, 17)
})

const {engine,ok,replace,spawn}=require('./helpers/mcp-toolkit.cjs')
test('a real KO in the first slot recovers at the boundary and receives that next-round slot after recovery',async t=>{
  const call=await engine(t,{dice:'20,10,1,17,1,19'})
  const target=await spawn(call),other=await spawn(call,'commoner')
  await replace(call,state=>{state.monsters[target.id].hp.current=1})
  const initial=ok(await call('enter_combat',{combatants:[target.id,'player',other.id]}))
  assert.equal(initial.currentTurn,target.id)
  ok(await call('next_turn',{actorId:target.id,skipAction:true}))
  ok(await call('resolve_attack',{attackerId:'player',targetId:target.id,weaponOrSpell:'unarmed',nonlethal:true}))
  let state=await call('get_game_state')
  assert.equal(state.monsters[target.id].knockout.recovery.wakeAt,3600)
  const assigned=Object.fromEntries(initial.initiativeOrder.map(id=>[id,(id==='player'?state.player:state.monsters[id]).initiative]))
  ok(await call('next_turn',{actorId:'player'}))
  await replace(call,state=>{state.worldTimeSeconds=3594})
  const next=ok(await call('next_turn',{actorId:other.id,skipAction:true}))
  state=await call('get_game_state')
  assert.equal(next.round,2);assert.equal(state.worldTimeSeconds,3600)
  assert.equal(next.currentTurn,target.id,'eligibility is checked after the real boundary recovery')
  assert.equal(state.monsters[target.id].hp.current,1)
  assert.equal(state.monsters[target.id].knockout,undefined)
  assert.deepEqual(state.initiativeOrder,initial.initiativeOrder)
  assert.deepEqual(Object.fromEntries(state.initiativeOrder.map(id=>[id,(id==='player'?state.player:state.monsters[id]).initiative])),assigned)
  ok(await call('replace_game_state',{gameState:state}))
  assert.equal((await call('get_game_state')).currentTurn,target.id)
  assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
