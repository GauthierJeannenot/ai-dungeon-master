const test = require('node:test')
const assert = require('node:assert/strict')
const { Client } = require('@modelcontextprotocol/sdk/client/index.js')
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js')

const reason = 'Une diversion créative et cohérente avec la scène.'
async function engine(t, strict = false, dice = '') {
  const client = new Client({ name: 'roleplay-bonus-test', version: '1' })
  await client.connect(new StdioClientTransport({ command: 'node', args: ['mcp-server/dist/mcp-server/index.js'],
    env: { ...process.env, ADVENTURE_ID: strict ? 'sarah-of-yellowcrest-manor' : 'grammys-country-apple-pie',
      CHARACTER_ID: 'fighter', AI_DM_TEST_DICE_SEQUENCE: dice } }))
  t.after(() => client.close())
  const raw = (name, args = {}) => client.callTool({ name, arguments: args })
  const call = async (name, args) => {
    const response = await raw(name, args)
    assert.ok(!response.isError, JSON.stringify(response))
    return JSON.parse(response.content.find(c => c.type === 'text').text)
  }
  return { call, raw }
}

async function battle(call, { strict = false, ac = 15, inspiration = false } = {}) {
  const state = await call('get_game_state')
  // Known unobstructed starting cells for the two rules profiles.
  const position = strict ? { x: 5, y: 8 } : { x: 1, y: 0 }
  const target = await call('spawn_monster', { monsterType: 'goblin', cell: position, hpOverride: 200 })
  const combat = await call('get_game_state')
  Object.assign(combat, { phase: 'combat', currentTurn: 'player', round: 1, initiativeOrder: ['player', target.id],
    actionUsed: {}, bonusActionUsed: {}, movementUsed: {} })
  if (!strict) combat.player.position = { x: 0, y: 0 }
  combat.monsters[target.id].ac = ac
  if (inspiration) combat.hero.inspiration.push({ targetId: 'player', die: 8, expiresAt: 600 })
  await call('replace_game_state', { gameState: combat })
  return { targetId: target.id, baseModifier: Math.floor((state.player.stats.str - 10) / 2) + state.player.proficiencyBonus }
}

for (const strict of [false, true]) {
  const profile = strict ? 'SRD 2014' : 'legacy'
  test(`${profile}: each RP bonus from +1 to +5 adds to a single check and is not retained`, async t => {
    const { call } = await engine(t, strict, '10,10,10,10,10,10')
    const state = await call('get_game_state')
    state.player.stats.cha = 10
    await call('replace_game_state', { gameState: state })
    for (let roleplayBonus = 1; roleplayBonus <= 5; roleplayBonus++) {
      const check = await call('roll_ability_check', { ability: 'cha', dc: 11, roleplayBonus, roleplayReason: `  ${reason}  ` })
      assert.equal(check.roleplayBonus, roleplayBonus)
      assert.equal(check.roleplayReason, reason)
      assert.equal(check.roll.total, 10 + roleplayBonus)
      assert.equal(check.roll.modifier, roleplayBonus)
      assert.equal(check.success, true)
      assert.deepEqual(check.roll.rolls, [10])
      assert.equal(check.advantage, false)
      assert.doesNotMatch(check.roll.detail, /ADV|DIS/)
      assert.ok(check.mechanicalSummary.includes(`Bonus RP +${roleplayBonus} : ${reason}`))
    }
    const ordinary = await call('roll_ability_check', { ability: 'cha', dc: 11 })
    assert.equal(ordinary.roll.total, 10)
    assert.equal(ordinary.success, false)
    assert.equal(ordinary.roleplayBonus, undefined)
    assert.doesNotMatch(ordinary.mechanicalSummary, /Bonus RP/)
    const after = await call('get_game_state')
    assert.ok(after.combatLog.some(entry => entry.mechanicalDetail.includes(`Bonus RP +5 : ${reason}`)))
  })

  for (const tool of ['resolve_player_attack', 'resolve_attack']) {
    test(`${profile}: ${tool} uses RP bonus to hit, without a second d20 or extra damage`, async t => {
      const { call } = await engine(t, strict, '8,4,17')
      const { targetId, baseModifier } = await battle(call, { strict, ac: 8 + (strict ? 7 : 5) + 3 })
      const attack = await call(tool, { attackerId: 'player', targetId, weaponOrSpell: 'longsword', roleplayBonus: 3, roleplayReason: reason })
      assert.equal(attack.attackRoll.total, 8 + baseModifier + 3)
      assert.equal(attack.attackRoll.modifier, baseModifier + 3)
      assert.deepEqual(attack.attackRoll.rolls, [8])
      assert.equal(attack.hit, true)
      assert.equal(attack.criticalHit, false)
      assert.equal(attack.damageRoll.rolls[0], 4)
      assert.equal(attack.damageDealt, strict ? 10 : 7)
      assert.equal(attack.roleplayBonus, 3)
      assert.equal(attack.roleplayReason, reason)
      assert.ok(attack.mechanicalSummary.includes(`Bonus RP +3 : ${reason}`))
      const after = await call('get_game_state')
      assert.equal(after.monsters[targetId].hp.current, 200 - attack.damageDealt)
      assert.ok(after.combatLog.at(-1).mechanicalDetail.includes(`Bonus RP +3 : ${reason}`))
      assert.equal((await call('roll_dice', { notation: '1d20' })).total, 17)
    })
  }

  test(`${profile}: RP bonus coexists with situational advantage and disadvantage`, async t => {
    const { call } = await engine(t, strict, '4,16,15,5,9')
    const state = await call('get_game_state')
    state.player.stats.cha = 10
    await call('replace_game_state', { gameState: state })
    const input = { ability: 'cha', roleplayBonus: 2, roleplayReason: reason, advantageReason: 'Circonstances du test.' }
    const adv = await call('roll_ability_check', { ...input, advantage: true })
    assert.equal(adv.roll.total, 18)
    assert.match(adv.roll.detail, /^ADV:/)
    const dis = await call('roll_ability_check', { ...input, disadvantage: true })
    assert.equal(dis.roll.total, 7)
    assert.match(dis.roll.detail, /^DIS:/)
    const cancelled = await call('roll_ability_check', { ...input, advantage: true, disadvantage: true })
    assert.equal(cancelled.roll.total, 11)
    assert.deepEqual(cancelled.roll.rolls, [9])
  })

  test(`${profile}: +5 cannot turn natural 1 into a hit or an ordinary hit into a critical`, async t => {
    const { call } = await engine(t, strict, '1,15,4,20,3,4')
    const { targetId } = await battle(call, { strict, ac: 10 })
    const saved = await call('get_game_state')
    const input = { targetId, weaponOrSpell: 'longsword', roleplayBonus: 5, roleplayReason: reason }
    const miss = await call('resolve_player_attack', input)
    assert.equal(miss.criticalMiss, true)
    assert.equal(miss.hit, false)
    assert.equal((await call('get_game_state')).monsters[targetId].hp.current, 200)
    await call('replace_game_state', { gameState: saved })
    const hit = await call('resolve_player_attack', input)
    assert.ok(hit.attackRoll.total >= 20)
    assert.equal(hit.criticalHit, false)
    await call('replace_game_state', { gameState: saved })
    const crit = await call('resolve_player_attack', input)
    assert.equal(crit.naturalRoll, 20)
    assert.equal(crit.criticalHit, true)
    assert.deepEqual(crit.damageRoll.rolls, [3, 4])
  })

  test(`${profile}: invalid RP inputs are refused before any dice, damage, or action`, async t => {
    const { call, raw } = await engine(t, strict, '12')
    const { targetId } = await battle(call, { strict })
    const before = await call('get_game_state')
    for (const tool of ['roll_ability_check', 'resolve_player_attack', 'resolve_attack', 'resolve_player_multiattack']) {
      for (const bonus of [0, -1, 6, 1.5, '3', null]) {
        const action = tool === 'roll_ability_check' ? { ability: 'cha' } : { targetId, weaponOrSpell: 'longsword' }
        const input = { ...action, roleplayBonus: bonus, roleplayReason: reason }
        const response = await raw(tool, tool === 'resolve_player_multiattack' ? { attacks: [input] } : { attackerId: 'player', ...input })
        assert.equal(response.isError, true, `${tool}: ${JSON.stringify(bonus)}`)
      }
      for (const roleplayReason of [undefined, '', '   ']) {
        const input = { targetId, weaponOrSpell: 'longsword', roleplayBonus: 3, roleplayReason }
        const response = await raw(tool, tool === 'resolve_player_multiattack' ? { attacks: [input] } : { attackerId: 'player', ability: 'cha', ...input })
        assert.equal(response.isError, true, `${tool}: missing justification`)
      }
    }
    assert.deepEqual(await call('get_game_state'), before)
    assert.equal((await call('roll_dice', { notation: '1d20' })).total, 12)
  })

  test(`${profile}: Extra Attack accepts an independently justified bonus per strike`, async t => {
    const { call, raw } = await engine(t, strict, strict ? '8,4,8,4' : '8,8,4')
    const { targetId, baseModifier } = await battle(call, { strict })
    const before = await call('get_game_state')
    if (!before.player.features.includes('extra_attack')) before.player.features.push('extra_attack')
    await call('replace_game_state', { gameState: before })
    const invalid = await raw('resolve_player_multiattack', { attacks: [
      { targetId, weaponOrSpell: 'longsword', roleplayBonus: 1, roleplayReason: reason },
      { targetId, weaponOrSpell: 'longsword', roleplayBonus: 5 },
    ] })
    assert.equal(invalid.isError, true)
    assert.deepEqual(await call('get_game_state'), before)
    const answer = await call('resolve_player_multiattack', { attacks: [
      { targetId, weaponOrSpell: 'longsword', roleplayBonus: 1, roleplayReason: reason },
      { targetId, weaponOrSpell: 'longsword', roleplayBonus: 5, roleplayReason: 'Une seconde idée créative.' },
    ] })
    // The first strike misses in legacy, so its damage die is not consumed.
    assert.equal(answer.attacks[0].attackRoll.total, 8 + baseModifier + 1)
    assert.equal(answer.attacks[0].roleplayBonus, 1)
    assert.equal(answer.attacks[1].roleplayBonus, 5)
    assert.equal(answer.attacks[1].attackRoll.modifier, baseModifier + 5)
    assert.equal(answer.attacks[1].attackRoll.total, 8 + baseModifier + 5)
  })
}

for (const kind of ['check', 'attack']) for (const choice of ['decline', 'bardic_inspiration']) {
  test(`SRD 2014: ${kind} RP bonus survives reaction hydration and ${choice} exactly once`, async t => {
    const { call } = await engine(t, true, choice === 'decline' ? (kind === 'check' ? '8,17' : '8,4,17') : (kind === 'check' ? '8,4,17' : '8,4,4,17'))
    const { targetId, baseModifier } = await battle(call, { strict: true, inspiration: true })
    const before = await call('get_game_state')
    before.player.stats.cha = 10
    await call('replace_game_state', { gameState: before })
    const pending = await call(kind === 'check' ? 'roll_ability_check' : 'resolve_player_attack', {
      ability: 'cha', dc: 11, ...(kind === 'attack' ? { targetId } : {}), weaponOrSpell: 'longsword', roleplayBonus: 3, roleplayReason: reason,
    })
    assert.ok(pending.pendingReaction)
    const saved = await call('get_game_state')
    await call('replace_game_state', { gameState: JSON.parse(JSON.stringify(saved)) })
    const resolved = await call('resolve_reaction', { pendingId: pending.pendingReaction.id, choice })
    const roll = kind === 'check' ? resolved.roll : resolved.attackRoll
    assert.equal(roll.total, 8 + (kind === 'check' ? 0 : baseModifier) + 3 + (choice === 'decline' ? 0 : 4))
    assert.equal((roll.detail.match(/Bonus RP/g) ?? []).length, 1)
    assert.equal(resolved.roleplayBonus, 3)
    assert.equal(resolved.roleplayReason, reason)
    assert.ok(resolved.mechanicalSummary.includes(`Bonus RP +3 : ${reason}`))
    if (kind === 'check') assert.equal(resolved.success, true)
    else assert.equal(resolved.damageDealt, 10)
    assert.equal((await call('roll_dice', { notation: '1d20' })).total, 17)
  })
}

test('direct engine entry points also refuse invalid bonuses before mutation or dice', () => {
  const gs = require('../mcp-server/dist/mcp-server/game-state.js')
  const { resolveAbilityCheck } = require('../mcp-server/dist/mcp-server/ability-check.js')
  const { resolvePlayerAttack } = require('../mcp-server/dist/mcp-server/tools/combat-tools.js')
  const before = structuredClone(gs.getState())
  for (const bonus of [0, -1, 6, 1.5, Infinity, NaN]) {
    assert.throws(() => resolveAbilityCheck({ ability: 'cha', roleplayBonus: bonus, roleplayReason: reason }), err => err.code === 'ROLEPLAY_BONUS_INVALID')
    const attack = resolvePlayerAttack({ targetId: 'missing', weaponOrSpell: 'longsword', roleplayBonus: bonus, roleplayReason: reason })
    assert.equal(attack.isError, true)
    assert.equal(JSON.parse(attack.content[0].text).code, 'ROLEPLAY_BONUS_INVALID')
  }
  assert.throws(() => resolveAbilityCheck({ ability: 'cha', roleplayBonus: 3 }), err => err.code === 'ROLEPLAY_REASON_REQUIRED')
  assert.deepEqual(gs.getState(), before)
})
