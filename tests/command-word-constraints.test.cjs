const test = require('node:test'), assert = require('node:assert/strict')
const { audibleSpeechStatus, inspectSpellComponents } = require('../mcp-server/dist/mcp-server/spell-components.js')
const { engine, ok, replace, spawn, battle } = require('./helpers/mcp-toolkit.cjs')

const fact = (kind, id = kind) => ({ id, targetId: 'player', kind, source: 'Une contrainte de parole déjà établie dans ce scénario.' })
function fixture() {
  return { player: { id: 'player', characterId: 'wizard', level: 7, inventory: [], conditions: [] },
    monsters: {}, worldTimeSeconds: 10, hero: { effects: [] },
    dmTools: { loadout: { unarmoredAC: 10 }, spellComponents: { constraints: {} } } }
}
const silenceEffect = (expiresAt, targetId = 'player') => ({ id: 'legacy-silence', kind: 'silence',
  sourceId: 'player', targetIds: [targetId], expiresAt, concentration: false, data: {} })

async function foundItem(call, templateId, itemId, initialCharges) {
  const state = await call('get_game_state')
  ok(await call('create_magic_item', { itemId, templateId, name: 'Objet réel du scénario',
    description: 'Un objet physique dont seules les propriétés publiées sont utilisées.',
    cell: state.player.position, initialCharges }))
  ok(await call('pick_up_item', { itemId }))
}
async function readyPearl(call) {
  await foundItem(call, 'pearl_of_power', 'command-pearl', 1)
  ok(await call('attune_magic_item', { itemId: 'command-pearl', operation: 'attune' }))
  await replace(call, state => { state.player.spellSlots.level1.current-- })
}
async function setFact(call, constraint, operation = 'apply') {
  return ok(await call('set_spell_component_constraint', { ...constraint, operation }))
}
const usePearl = call => call('use_magic_item', { itemId: 'command-pearl', slotLevel: 1 })
async function refusesWithoutChange(call) {
  const before = await call('get_game_state')
  assert.equal((await usePearl(call)).code, 'COMMAND_WORD_INAUDIBLE')
  assert.deepEqual(await call('get_game_state'), before, 'charge, slot, action, clock and every stored fact are unchanged')
  return before
}

test('shared speech preflight reads gag/silence facts only and never infers speech loss from deafness or bound hands', () => {
  const state = fixture()
  state.player.conditions.push('deafened')
  state.dmTools.spellComponents.constraints.bound = fact('hands-bound', 'bound')
  assert.equal(audibleSpeechStatus(state, 'player').blocked, false)
  for (const kind of ['gagged', 'silenced']) {
    state.dmTools.spellComponents.constraints.restriction = fact(kind, 'restriction')
    const before = structuredClone(state)
    assert.deepEqual(audibleSpeechStatus(state, 'player'), { blocked: true, constraintIds: ['restriction'], legacySilence: false })
    assert.equal(audibleSpeechStatus(state, 'another-actor').blocked, false)
    assert.deepEqual(state, before)
  }
})

test('legacy silence respects its actor and expiry, and the same preflight governs V without changing validated item exemptions', () => {
  const state = fixture()
  state.hero.effects.push(silenceEffect(11))
  const before = structuredClone(state)
  assert.equal(audibleSpeechStatus(state, 'player').legacySilence, true)
  assert.ok(inspectSpellComponents(state, { spellId: 'magic-missile' }).issues.some(issue => issue.code === 'SPELL_VERBAL_BLOCKED'))
  assert.equal(inspectSpellComponents(state, { spellId: 'counterspell' }).valid, true, 'an S-only spell does not gain a verbal component')
  assert.equal(inspectSpellComponents(state, { spellId: 'magic-missile', componentExemption: 'validated-magic-item' }).valid, true)
  assert.equal(inspectSpellComponents(state, { spellId: 'magic-missile', componentExemption: 'validated-spell-scroll' }).valid, true)
  assert.deepEqual(state, before)
  state.worldTimeSeconds = 11
  assert.equal(audibleSpeechStatus(state, 'player').blocked, false)
  state.hero.effects = [silenceEffect(20, 'another-actor')]
  assert.equal(audibleSpeechStatus(state, 'player').blocked, false)
})

for (const kind of ['gagged', 'silenced']) test(`actual Pearl refuses ${kind} before any charge, slot, action or die; explicit removal enables one use`, async t => {
  const call = await engine(t, { characterId: 'wizard', dice: '17,19' })
  await readyPearl(call)
  const enemy = await spawn(call); await battle(call, [enemy.id])
  const constraint = fact(kind, 'established-command-restriction')
  await setFact(call, constraint)
  const saved = await call('get_game_state')
  ok(await call('replace_game_state', { gameState: saved }))
  const before = await refusesWithoutChange(call)
  assert.equal(before.dmTools.magicItems['command-pearl'].charges, 1)
  assert.equal(before.hero.actionCredits, 1)
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 17)
  await setFact(call, constraint, 'remove')
  const answer = ok(await usePearl(call)), after = await call('get_game_state')
  assert.equal(answer.chargesRemaining, 0)
  assert.equal(after.player.spellSlots.level1.current, before.player.spellSlots.level1.current + 1)
  assert.equal(after.hero.actionCredits, 0); assert.equal(after.actionUsed.player, true)
  const repeated = await usePearl(call)
  assert.ok(repeated.error, 'no second activation can spend the same action/use')
  assert.deepEqual(await call('get_game_state'), after)
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19, 'successful use also requires no die')
})

test('removing one established speech fact cannot bypass a separate remaining gag or silence', async t => {
  const call = await engine(t, { characterId: 'wizard', dice: '17' })
  await readyPearl(call)
  const gag = fact('gagged', 'actual-gag'), silence = fact('silenced', 'actual-silence')
  await setFact(call, gag); await setFact(call, silence)
  await refusesWithoutChange(call)
  await setFact(call, gag, 'remove'); await refusesWithoutChange(call)
  await setFact(call, silence, 'remove')
  assert.equal(ok(await usePearl(call)).chargesRemaining, 0)
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 17)
})

test('an active legacy silence still blocks a command, while actual expiration permits its use', async t => {
  const call = await engine(t, { characterId: 'wizard', dice: '17' })
  await readyPearl(call)
  await replace(call, state => { state.hero.effects.push(silenceEffect(state.worldTimeSeconds + 30)) })
  await refusesWithoutChange(call)
  ok(await call('advance_time', { seconds: 30 }))
  assert.equal(ok(await usePearl(call)).chargesRemaining, 0)
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 17)
})

test('deafness and established bound hands do not invent a command-word restriction on a Pearl carried on the person', async t => {
  const call = await engine(t, { characterId: 'wizard' })
  await readyPearl(call)
  await setFact(call, fact('hands-bound', 'actual-bound-hands'))
  await replace(call, state => { state.player.conditions.push('deafened') })
  const before = await call('get_game_state')
  assert.equal(ok(await usePearl(call)).chargesRemaining, 0)
  const after = await call('get_game_state')
  assert.equal(after.player.spellSlots.level1.current, before.player.spellSlots.level1.current + 1)
  assert.ok(after.player.conditions.includes('deafened'))
  assert.equal(after.dmTools.spellComponents.constraints['actual-bound-hands'].kind, 'hands-bound')
})

test('a source wand without a spoken activation does not acquire V/S/M requirements from the spell it casts', async t => {
  const call = await engine(t, { characterId: 'wizard', dice: '1,1,1,17' })
  await foundItem(call, 'wand_of_magic_missiles', 'actual-wand', 2)
  const state = await call('get_game_state'), held = state.dmTools.loadout?.mainHandId ?? state.player.inventory.find(item => item.type === 'weapon')?.id
  assert.ok(held)
  ok(await call('equip_item', { itemId: held, slot: 'main_hand', operation: 'unequip' }))
  ok(await call('equip_item', { itemId: 'actual-wand', slot: 'main_hand', operation: 'equip' }))
  await setFact(call, fact('gagged', 'actual-gag'))
  await setFact(call, fact('silenced', 'actual-silence'))
  const enemy = await spawn(call), before = await call('get_game_state')
  const answer = ok(await call('use_magic_item', { itemId: 'actual-wand', charges: 1, targetId: enemy.id }))
  assert.ok(answer)
  const after = await call('get_game_state')
  assert.equal(after.dmTools.magicItems['actual-wand'].charges, 1, 'not the last charge, so no destruction die')
  assert.equal(after.monsters[enemy.id].hp.current, before.monsters[enemy.id].hp.current - 6)
  assert.deepEqual(after.player.spellSlots, before.player.spellSlots)
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 17)
})
