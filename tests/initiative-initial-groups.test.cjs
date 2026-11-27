const test = require('node:test')
const assert = require('node:assert/strict')
process.env.ADVENTURE_ID = 'sarah-of-yellowcrest-manor'
process.env.CHARACTER_ID = 'fighter'
const gs = require('../mcp-server/dist/mcp-server/game-state.js')
const { createMonster } = require('../mcp-server/dist/mcp-server/tools/phase-tools.js')
const { rollDice } = require('../mcp-server/dist/mcp-server/dice.js')

function fixture(t, sequence) {
  const previous = process.env.AI_DM_TEST_DICE_SEQUENCE
  delete process.env.AI_DM_TEST_DICE_SEQUENCE; rollDice('1d20')
  process.env.AI_DM_TEST_DICE_SEQUENCE = sequence
  gs.resetState()
  t.after(() => {
    gs.resetState()
    if (previous === undefined) delete process.env.AI_DM_TEST_DICE_SEQUENCE
    else process.env.AI_DM_TEST_DICE_SEQUENCE = previous
  })
  const state = gs.getState()
  state.player.stats.dex = 10; state.player.features = []
  const a = createMonster('goblin', {x:1,y:1}), b = createMonster('goblin', {x:2,y:1})
  a.stats.dex = b.stats.dex = 10
  gs.spawnMonster(a); gs.spawnMonster(b)
  return {state,a,b,ids:[a.id,'player',b.id]}
}

test('identified identical monsters share one real initiative die despite individual names, positions and wounds', t => {
  const {state,a,b,ids} = fixture(t, '12,9,19')
  b.name = 'Individual name'; b.hp.current--
  const result = gs.rollInitiatives(ids)
  assert.deepEqual(result.map(row=>row.id), [a.id,b.id,'player'])
  assert.deepEqual(result.map(row=>row.initiative), [12,12,9])
  assert.deepEqual(result[0].groupIds, [a.id,b.id])
  assert.equal(result[0].sharedRollWith, undefined)
  assert.equal(result[1].sharedRollWith, a.id)
  assert.match(result[1].roll, /aucun nouveau jet/)
  assert.equal(a.initiative, b.initiative)
  assert.equal(state.phase, 'exploration', 'rolling does not itself start combat')
  assert.equal(rollDice('1d20').total,19)
})

test('explicit tie priority orders equal groups together without rolling a tiebreaker', t => {
  const {a,b,ids} = fixture(t, '10,10,19')
  const result = gs.rollInitiatives(ids, {tieOrder:[b.id,'player',a.id]})
  assert.deepEqual(result.map(row=>row.id), [b.id,a.id,'player'])
  assert.equal(result[0].sharedRollWith,a.id, 'the actual first roster member rolled for the group')
  assert.equal(rollDice('1d20').total,19)
})

test('partial tie priority affects only equal scores; omitted actors retain roster priority', t => {
  const {a,b,ids} = fixture(t, '9,15,19')
  const result = gs.rollInitiatives(ids, {tieOrder:[b.id]})
  assert.deepEqual(result.map(row=>row.id), ['player',b.id,a.id])
  assert.equal(rollDice('1d20').total,19)
})

for (const variant of ['legacy','unknown-source','side','base-stat','exhaustion-context']) {
  test('initiative groups remain separate for '+variant, t => {
    const {state,a,b,ids} = fixture(t, variant==='exhaustion-context' ? '12,9,8,3,19' : '12,9,3,19')
    if (variant==='legacy') { delete a.srd; delete b.srd }
    if (variant==='unknown-source') { a.srd.index=b.srd.index='unknown-authored-source' }
    if (variant==='side') b.hostile=false
    if (variant==='base-stat') b.stats.str++
    if (variant==='exhaustion-context') {
      b.conditions.push('exhaustion')
      state.dmTools ??= {}
      state.dmTools.exhaustion={creatures:{[b.id]:{level:1}},receipts:{}}
    }
    const result = gs.rollInitiatives(ids)
    assert.deepEqual(result.map(row=>row.id), [a.id,'player',b.id])
    assert.deepEqual(result.map(row=>row.initiative), [12,9,3])
    assert.ok(result.every(row=>row.groupIds===undefined && row.sharedRollWith===undefined))
    assert.equal(rollDice('1d20').total,19)
  })
}

test('identical poisoned monsters share one disadvantaged check rather than bypassing the condition', t => {
  const {a,b,ids} = fixture(t, '18,4,10,19')
  a.conditions.push('poisoned'); b.conditions.push('poisoned')
  const result = gs.rollInitiatives(ids)
  assert.deepEqual(result.map(row=>row.id), ['player',a.id,b.id])
  assert.equal(a.initiative,4); assert.equal(b.initiative,4)
  assert.equal(result.find(row=>row.id===b.id).sharedRollWith,a.id)
  assert.equal(rollDice('1d20').total,19)
})

for (const variant of ['duplicate-priority','foreign-priority','duplicate-roster','missing-roster','unresolved-exhaustion']) {
  test('initiative rejects '+variant+' before any mutation or random draw', t => {
    const {state,a,ids} = fixture(t, '19')
    let roster=ids, options={tieOrder:[]}
    if (variant==='duplicate-priority') options.tieOrder=[a.id,a.id]
    if (variant==='foreign-priority') options.tieOrder=['absent']
    if (variant==='duplicate-roster') roster=[...ids,a.id]
    if (variant==='missing-roster') roster=[...ids,'absent']
    if (variant==='unresolved-exhaustion') a.conditions.push('exhaustion')
    const before=structuredClone(state)
    assert.throws(()=>gs.rollInitiatives(roster,options), /priority|participants|exhaustion/i)
    assert.deepEqual(gs.getState(),before)
    assert.equal(rollDice('1d20').total,19)
  })
}
