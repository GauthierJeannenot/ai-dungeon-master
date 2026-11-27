const test = require('node:test')
const assert = require('node:assert/strict')
const { engine, ok, replace, spawn, battle } = require('./helpers/mcp-toolkit.cjs')

for (const tool of ['next_turn', 'pass_turn']) {
  for (const legacyTarget of ['player', 'enemy']) {
    test(`${tool} refuses a legacy ${legacyTarget} at the round boundary before end effects, mutation or dice`, async t => {
      const call = await engine(t, { dice: '19,2,17' }), enemy = await spawn(call)
      await battle(call, [enemy.id])
      await replace(call, state => {
        state.initiativeOrder = [enemy.id, 'player']
        state.currentTurn = 'player'
        state.round = 4
        state.worldTimeSeconds = 120
        state.actionUsed.player = true
        state.bonusActionUsed.player = true
        state.movementUsed.player = 1
        state.hero.actionCredits = 0
        const target = legacyTarget === 'player' ? state.player : state.monsters[enemy.id]
        target.conditions.push('exhaustion')
        // This actual end-of-turn save would consume a die before initiative
        // checks the other actor. It must never run after a refused transition.
        state.player.conditions.push('blinded')
        state.hero.effects.push({ id: 'atomicity-end-save', kind: 'blindness-deafness',
          sourceId: enemy.id, targetIds: ['player'], expiresAt: 720,
          concentration: false, data: { dc: 10, condition: 'blinded' } })
      })
      const before = await call('get_game_state')
      const input = tool === 'next_turn'
        ? { actorId: 'player', skipAction: true, reason: 'Le personnage termine explicitement son tour.' }
        : { reason: 'Le personnage passe explicitement son tour.' }
      const refused = await call(tool, input)
      assert.equal(refused.code, 'EXHAUSTION_LEVEL_REQUIRED')
      assert.deepEqual(await call('get_game_state'), before,
        'No pass log, end save, condition removal, action reset, round event or time advance may be committed')
      assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19,
        'The end-of-turn save and new-round initiative must not consume any die')
    })
  }
}
