const test = require('node:test'), assert = require('node:assert/strict')
Object.assign(process.env, { MONETIZATION_ENABLED: 'false', LLM_MODE: 'mock', ALLOW_PAID_LLM: 'false' })
const { installPgMem } = require('./helpers/pg-mem.cjs'), pg = installPgMem()
const { engine, ok, grid } = require('./helpers/mcp-toolkit.cjs')
const { prepareOverrunAtCurrentSite, persistOverrun } = require('./helpers/dmg-overrun-fixture.cjs')
const { inferRoomIdOnMap } = require('../mcp-server/dist/lib/adventure-map.js')

test.after(() => pg.restore())

test('an actual Shove Aside attack followed by bonus Overrun keeps both contests and the remaining Extra Attack through SQL and completed-movement replay', async t => {
  const call = await engine(t, { characterId: 'fighter', dice: '20,1,19,18,1,18,1,17' })
  const f = await prepareOverrunAtCurrentSite(call, { cost: 'bonus_action' })
  const scene = await call('get_game_state'), nav = grid(scene, f.target.id), origin = f.path[0]
  const inRoom = cell => inferRoomIdOnMap(cell, scene.currentMapId, scene) === scene.currentRoomId
  const pair = [[1, 0], [-1, 0], [0, 1], [0, -1]].flatMap(([dx, dy]) => {
    const path = [origin, { x: origin.x + dx, y: origin.y + dy }, { x: origin.x + dx * 2, y: origin.y + dy * 2 }]
    if (!path.slice(1).every((cell, index) => inRoom(cell) && nav.step(path[index], cell))) return []
    const side = nav.neighbors(path[1]).find(cell =>
      Math.abs(cell.x - path[1].x) + Math.abs(cell.y - path[1].y) === 1
      && Math.max(Math.abs(cell.x - origin.x), Math.abs(cell.y - origin.y)) === 1
      && nav.free(cell) && nav.step(path[1], cell) && nav.step(origin, cell) && inRoom(cell))
    return side ? [{ path, side }] : []
  })[0]
  assert.ok(pair, 'Qualify both real procedures before initiative; the narrow Overrun exit need not permit a later side shove.')
  f.path = pair.path
  f.input.overrunPath = pair.path
  const through = pair.path[1], side = pair.side
  ok(await call('move_token', { tokenId: f.target.id, toCell: side }))
  ok(await f.enter())
  const before = await call('get_game_state')
  const shoved = ok(await f.call('combat_action', {
    action: 'shove', shove: 'aside', targetId: f.target.id, defenseSkill: 'athletics', toCell: through,
  }))
  assert.equal(shoved.success, true)
  assert.deepEqual(shoved.check.roll.rolls, [18])
  assert.match(shoved.check.roll.detail, /DIS/)
  assert.deepEqual(shoved.opposition.roll.rolls, [1])
  const between = await call('get_game_state')
  assert.deepEqual(between.monsters[f.target.id].position, through)
  assert.equal(between.hero.actionCredits, 0)
  assert.equal(between.hero.attackAction.remaining, 1)
  assert.notEqual(between.bonusActionUsed.player, true)
  const crossed = ok(await call('combat_action', f.input))
  assert.equal(crossed.success, true)
  assert.deepEqual(crossed.contest.check.roll.rolls, [18])
  assert.deepEqual(crossed.contest.opposition.roll.rolls, [1])
  const after = await f.call('get_game_state')
  assert.deepEqual(after.player.position, f.path[2])
  assert.deepEqual(after.monsters[f.target.id].position, through)
  assert.equal(after.hero.actionCredits, 0)
  assert.equal(after.hero.attackAction.remaining, 1)
  assert.equal(after.bonusActionUsed.player, true)
  assert.equal(after.movementUsed.player, 3)
  assert.equal(after.movementUsed[f.target.id] ?? 0, 0)
  assert.equal(after.worldTimeSeconds, before.worldTimeSeconds)
  const fresh = await persistOverrun(t, f.call, '19')
  const replay = ok(await fresh('move_token', { tokenId: 'player', toCell: f.path[2], overrunId: crossed.overrunId }))
  assert.equal(replay.replayed, true)
  assert.deepEqual(await fresh('get_game_state'), after)
  assert.equal(ok(await fresh('roll_dice', { notation: '1d20' })).total, 19)
  assert.equal(ok(await f.call('roll_dice', { notation: '1d20' })).total, 17)
})
