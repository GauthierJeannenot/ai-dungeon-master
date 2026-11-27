const test = require('node:test'), assert = require('node:assert/strict')
const {copyWork}=require('./helpers/spell-copy-supplies.cjs')
const { engine, ok, replace, object } = require('./helpers/mcp-toolkit.cjs')

const facts = () => ({
  eventId: 'preflight-nutrition-begin', operation: 'begin', standardNeedsConfirmed: true,
  hotWeather: false, source: 'Besoins standard et absence de privation initiale établis pour ce scénario.',
  foodDebtHalfDays: 0, priorDeprivation: 'none',
})
async function begin(call) { return ok(await call('begin_nutrition_tracking', facts())) }
async function nearBoundary(call, remainingSeconds) {
  const state = await call('get_game_state')
  const seconds = state.dmTools.survival.day.endsAt - state.worldTimeSeconds - remainingSeconds
  assert.ok(seconds > 0)
  ok(await call('advance_time', { seconds }))
}
async function refusesWithoutChangeOrDice(call, name, input, code = 'SURVIVAL_DAY_EVENT_DUE') {
  const before = await call('get_game_state')
  const refused = await call(name, input)
  assert.equal(refused.code, code, JSON.stringify(refused))
  assert.deepEqual(await call('get_game_state'), before, 'all resources, receipts, facts and time remain exactly unchanged')
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 17, 'preflight did not consume a check or other die')
  return before
}
async function newShatterSource(call) {
  await replace(call, state => {
    state.player.spellbook = state.player.spellbook.filter(id => id !== 'shatter')
    state.player.inventory.find(item => item.id === 'spellbook').spellIds = [...state.player.spellbook]
    state.player.knownSpells = state.player.knownSpells.filter(id => id !== 'shatter')
    state.dmTools.wallet = { cp: 0, sp: 0, ep: 0, gp: 500, pp: 0 }
  })
}

test('actual Identify casting work refuses a nutrition crossing before its slot, pearl, properties, work receipts, time or dice change', async t => {
  // The real wand recharges at dawn during setup; the following 17 is reserved for the preflight proof.
  const call = await engine(t, { characterId: 'wizard', dice: '1,17' })
  ok(await call('prepare_spells', { spellIds: ['identify'] }))
  const initial = await call('get_game_state')
  assert.ok(initial.player.spellSlots.level1.current > 0)
  assert.ok(initial.player.inventory.some(item => item.id === 'component_pouch'))
  ok(await call('create_magic_item', { itemId: 'preflight-wand', templateId: 'wand_of_magic_missiles',
    name: 'Baguette à examiner', description: 'La véritable baguette de ce scénario.',
    cell: initial.player.position, initialCharges: 3 }))
  ok(await call('pick_up_item', { itemId: 'preflight-wand' }))
  await object(call, 'preflight-pearl-box', { contents: ['identification_pearl'] })
  const opened = ok(await call('interact_object', { objectId: 'preflight-pearl-box', action: 'open' }))
  const pearlId = opened.releasedItems[0].id
  ok(await call('pick_up_item', { itemId: pearlId }))
  await begin(call); await nearBoundary(call, 30)
  const started=ok(await call('cast_spell', {
    spellId: 'identify', itemId: 'preflight-wand', materialItemId: pearlId, focusItemId: 'component_pouch',
  }))
  assert.equal(started.activeSeconds,0);assert.equal(started.status,'active')
  const before = await refusesWithoutChangeOrDice(call, 'continue_casting', {castingId:started.castingId,eventId:'crossing-work',seconds:60})
  assert.equal(before.dmTools.magicItems['preflight-wand'].identified, false)
  assert.ok(before.player.inventory.some(item => item.id === pearlId && item.equipmentId === 'identification_pearl'))
})

test('copying a real owned spell source preflights the whole copying duration before coin debit or learning', async t => {
  const call = await engine(t, { characterId: 'wizard', dice: '17' })
  await newShatterSource(call)
  await replace(call, state => state.player.inventory.push({ id: 'preflight-source-book', name: 'Recueil source établi', type: 'misc', spellIds: ['shatter'] }))
  await begin(call); await nearBoundary(call, 60)
  const before = await refusesWithoutChangeOrDice(call, 'copy_spell_to_book', copyWork({
    spellId: 'shatter', sourceItemId: 'preflight-source-book', paid: { gp: 50 },
  }))
  assert.equal(before.dmTools.wallet.gp, 500)
  assert.ok(!before.player.spellbook.includes('shatter'))
})

test('copying a real scroll refuses before its ability check, coin debit or physical destruction', async t => {
  const call = await engine(t, { characterId: 'wizard', dice: '17' })
  await newShatterSource(call)
  const state = await call('get_game_state')
  ok(await call('create_spell_scroll', { itemId: 'preflight-copy-scroll', spellId: 'shatter', name: 'Parchemin source établi',
    description: 'Le véritable parchemin à copier dans ce scénario.', cell: state.player.position }))
  ok(await call('pick_up_item', { itemId: 'preflight-copy-scroll' }))
  ok(await call('read_spell_scroll', { itemId: 'preflight-copy-scroll' }))
  await begin(call); await nearBoundary(call, 60)
  const before = await refusesWithoutChangeOrDice(call, 'copy_spell_scroll', copyWork({ itemId: 'preflight-copy-scroll', paid: { gp: 50 } }))
  assert.equal(before.dmTools.spellScrolls['preflight-copy-scroll'].status, 'active')
  assert.ok(before.player.inventory.some(item => item.id === 'preflight-copy-scroll'))
})

test('full nutrition receipt history refuses a long rest before benefits while a completed event still replays', async t => {
  const call = await engine(t, { dice: '17' })
  await begin(call)
  await replace(call, state => {
    state.player.hp.current = state.player.hp.max - 2
    state.hero.hitDice.current = 0
    const receipts = state.dmTools.survival.receipts
    // Explicit persisted-history fixture, without creating meals or resources.
    for (let index = 0; index < 511; index++) receipts['fixture-old-event-' + index] = {
      command: JSON.stringify({ kind: 'fixture-history', index }), result: { recorded: true },
    }
  })
  const before = await refusesWithoutChangeOrDice(call, 'take_rest', { kind: 'long' }, 'NUTRITION_HISTORY_LIMIT')
  assert.equal(Object.keys(before.dmTools.survival.receipts).length, 512)
  assert.deepEqual(before.dmTools.survival.recoveryIntake, { foodHalfPounds: 0, waterPints: 0 })
  const replay = ok(await call('begin_nutrition_tracking', facts()))
  assert.equal(replay.replayed, true)
  assert.deepEqual(await call('get_game_state'), before, 'capacity does not destroy or refresh the original completed receipt')
})
