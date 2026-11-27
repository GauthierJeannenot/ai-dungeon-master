const test = require('node:test')
const assert = require('node:assert/strict')
const { engine, ok, replace, addSupply, spawn, battle, object } = require('./helpers/mcp-toolkit.cjs')

const attempt = { toolItemId: 'craft-kit', ability: 'int', dc: 15, task: 'Repérer les joints récemment refaits dans le mur.' }
async function kit(call, toolId = 'masons_tools', proficient = true) {
  await addSupply(call, toolId, 'craft-kit')
  if (proficient) await replace(call, state => { state.player.toolProficiencies = [toolId] })
}

test('an actual tool proficiency adds the character bonus once with the explicitly chosen ability', async t => {
  const call = await engine(t, { dice: '10,19' })
  await kit(call)
  const result = ok(await call('resolve_tool_check', attempt))
  const player = (await call('get_game_state')).player
  assert.equal(result.check.proficient, true)
  assert.equal(result.check.roll.modifier, Math.floor((player.stats.int - 10) / 2) + player.proficiencyBonus)
  assert.equal(result.check.ability, 'int')
  assert.equal(result.toolId, 'masons_tools')
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19)
})

test('owning a tool grants no proficiency; forged flags are ignored and ordinary character features remain', async t => {
  const call = await engine(t, { dice: '10' })
  await kit(call, 'masons_tools', false)
  const answer = ok(await call('resolve_tool_check', { ...attempt, proficient: true, expertise: true }))
  assert.equal(answer.check.proficient, false)
  assert.equal(answer.check.expertise, false)
  assert.equal(answer.check.roll.modifier, Math.floor(((await call('get_game_state')).player.stats.int - 10) / 2))
})

test('optional Xanathar synergy requires explicit adoption and both real proficiencies; never doubles skill expertise', async t => {
  const call = await engine(t, { dice: '4,18,11,19' })
  await kit(call)
  await replace(call, state => { state.player.skillProficiencies = ['investigation']; state.player.expertise = ['investigation'] })
  const combined = { ...attempt, relatedSkill: 'investigation', useXanatharAdvantage: true }
  const answer = ok(await call('resolve_tool_check', combined))
  const player = (await call('get_game_state')).player
  assert.equal(answer.check.roll.modifier, Math.floor((player.stats.int - 10) / 2) + 2 * player.proficiencyBonus)
  assert.equal(answer.check.advantage, true)
  assert.equal(answer.check.roll.total, 18 + answer.check.roll.modifier)
  const normal = ok(await call('resolve_tool_check', { ...attempt, relatedSkill: 'investigation' }))
  assert.equal(normal.check.advantage, false)
  assert.equal(normal.check.roll.total, 11 + normal.check.roll.modifier)
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19)
})

test('unowned/unsupported tools, invalid skills and unavailable synergy refuse before consuming dice or state', async t => {
  const call = await engine(t, { dice: '19' })
  await kit(call, 'masons_tools', false)
  const before = await call('get_game_state')
  assert.equal((await call('resolve_tool_check', { ...attempt, toolItemId: 'absent' })).code, 'TOOL_NOT_OWNED')
  assert.equal((await call('resolve_tool_check', { ...attempt, relatedSkill: 'arcana', useXanatharAdvantage: true })).code, 'TOOL_SYNERGY_UNAVAILABLE')
  assert.equal((await call('resolve_tool_check', { ...attempt, relatedSkill: 'perception' })).code, 'TOOL_SKILL_INVALID')
  assert.equal((await call('resolve_tool_check', { ...attempt, relatedSkill: 'invented' })).code, 'TOOL_SKILL_INVALID')
  assert.deepEqual(await call('get_game_state'), before)
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19)
})

test('thieves tools and social influence cannot bypass dedicated target/state validation', async t => {
  const call = await engine(t, { dice: '19' })
  await kit(call, 'thieves_tools')
  assert.equal((await call('resolve_tool_check', attempt)).code, 'DEDICATED_TOOL_REQUIRED')
  await replace(call, state => { state.player.inventory.find(item => item.id === 'craft-kit').equipmentId = 'disguise_kit' })
  assert.equal((await call('resolve_tool_check', { ...attempt, ability: 'cha', relatedSkill: 'deception' })).code, 'DEDICATED_TOOL_REQUIRED')
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19)
})

test('Bardic continuation survives hydration and spends a single combat action on the same tool die', async t => {
  const call = await engine(t, { dice: '8,4,19' })
  await kit(call)
  const enemy = await spawn(call)
  await battle(call, [enemy.id])
  await replace(call, state => state.hero.inspiration.push({ targetId: 'player', expiresAt: 600, die: 8 }))
  const held = ok(await call('resolve_tool_check', attempt))
  assert.ok(held.pendingReaction)
  const saved = await call('get_game_state')
  assert.equal(saved.hero.actionCredits, 1)
  ok(await call('replace_game_state', { gameState: saved }))
  const resolved = ok(await call('resolve_reaction', { pendingId: held.pendingReaction.id, choice: 'bardic_inspiration' }))
  assert.equal(resolved.toolId, 'masons_tools')
  assert.equal(resolved.check.roll.rolls[0], 8)
  assert.equal((await call('get_game_state')).hero.actionCredits, 0)
  const beforeRepeat = await call('get_game_state')
  assert.equal((await call('resolve_tool_check', attempt)).code, 'ACTION_ALREADY_USED')
  assert.deepEqual(await call('get_game_state'), beforeRepeat)
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19)
})

test('poisoned disadvantage cancels adopted synergy advantage and the test creates no discovered fact/item', async t => {
  const call = await engine(t, { dice: '12,19' })
  await kit(call)
  await replace(call, state => { state.player.skillProficiencies = ['investigation']; state.player.conditions.push('poisoned') })
  const before = await call('get_game_state')
  const answer = ok(await call('resolve_tool_check', { ...attempt, relatedSkill: 'investigation', useXanatharAdvantage: true }))
  assert.equal(answer.check.advantage, true)
  assert.equal(answer.check.disadvantage, true)
  const after = await call('get_game_state')
  assert.deepEqual(after.player, before.player)
  assert.deepEqual(after.worldFacts, before.worldFacts)
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19)
})

test('the level-seven bard has explicit instrument proficiencies and can acquire a real flute from a container', async t => {
  const call = await engine(t, { characterId: 'bard', dice: '3,17,19' })
  const player = (await call('get_game_state')).player
  assert.deepEqual(player.toolProficiencies, ['lute', 'flute', 'drum'])
  assert.equal(player.inventory.some(item => item.id === 'flute'), false)
  await object(call, 'instrument-box', { contents: ['flute'] })
  const opened = ok(await call('interact_object', { objectId: 'instrument-box', action: 'open' }))
  assert.equal(opened.releasedItems[0].equipmentId, 'flute')
  ok(await call('pick_up_item', { itemId: opened.releasedItems[0].id }))
  const result = ok(await call('resolve_tool_check', { toolItemId: opened.releasedItems[0].id, ability: 'cha', dc: 15,
    task: 'Accompagner une mélodie inconnue.', relatedSkill: 'performance', useXanatharAdvantage: true }))
  assert.equal(result.check.roll.total, 24)
  assert.equal(result.check.roll.modifier, 7)
  assert.equal(result.check.advantage, true)
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19)
})
