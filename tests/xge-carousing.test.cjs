const assert = require('node:assert/strict'), test = require('node:test')
Object.assign(process.env, { MONETIZATION_ENABLED: 'false', LLM_MODE: 'mock', ALLOW_PAID_LLM: 'false', DM_RATE_LIMIT_PER_MINUTE: '0', APP_LOG_PERSIST_ENABLED: 'false', APP_LOG_LEVEL: 'error' })
const { installPgMem } = require('./helpers/pg-mem.cjs'), pg = installPgMem()
const { saveSession, loadSession, deleteSession } = require('../lib/session-store.ts')
const { engine, ok } = require('./helpers/mcp-toolkit.cjs')
const { refused } = require('./helpers/xge-training-fixture.cjs')
const { prepareCarousing, nextCarousingDate } = require('./helpers/xge-carousing-fixture.cjs')
const { prepareService } = require('./helpers/xge-religious-service-fixture.cjs')
const { play, lastResult } = require('./helpers/dm-scripted-turn.cjs')
const { copperValue } = require('../mcp-server/dist/lib/srd/currency.js')
test.after(() => pg.restore())
const get = call => call('get_game_state')
const latest = state => state.dmTools.xgeCarousing.weeks.at(-1)
const marker = async call => ok(await call('roll_dice', { notation: '1d20' })).total
async function sql(t, call, dice = '19') {
  const state = await get(call), id = 'carousing-' + process.pid + '-' + Math.random()
  t.after(() => deleteSession(id))
  await saveSession(id, { gameState: state, history: [], adventureId: state.adventureId, characterId: state.characterId })
  const fresh = await engine(t, { characterId: state.characterId, adventureId: state.adventureId, dice })
  ok(await fresh('replace_game_state', { gameState: (await loadSession(id)).gameState }))
  assert.deepEqual(await get(fresh), state)
  return fresh
}
async function finishWork(call, f, start = 0) {
  for (let i = start; i < 5; i++) {
    if (i) await nextCarousingDate(call)
    ok(await call('work_xge_carousing', f.work(i, i ? undefined : { gp: { lower: 10, middle: 50, upper: 250 }[f.startInput.socialClass] })))
  }
}
async function named(call, contactId, f, extra = {}) {
  const s = await get(call)
  const socialClass = ok(await call('record_scene_fact', { cell: s.player.position,
    description: `Le MJ atteste que cette personne déjà représentée et rencontrée appartient réellement au milieu ${f.startInput.socialClass} de cette semaine.` })).worldFact
  const explanation = ok(await call('record_scene_fact', { cell: s.player.position,
    description: 'Les repas et conversations de cette semaine réellement accomplie expliquent raisonnablement ce lien avec cette personne effectivement rencontrée. Aucun service, secret ou changement d’attitude n’est fabriqué.' })).worldFact
  return { eventId: contactId + '-actual-naming', contactId, assignment: 'named', targetId: f.hostId,
    socialClass: f.startInput.socialClass, socialClassFactId: socialClass.id, explanationFactId: explanation.id,
    actualMetNpcConfirmed: true, actualSocialClassConfirmed: true, actualRelationshipExplanationConfirmed: true, ...extra }
}

test('public POST Carousing retains two allies pending real allocation, enforces only the unspecified cap, and consumes actual named aid once through SQL without any generated effect', async t => {
  const call = await engine(t, { characterId: 'fighter', dice: '16,10,1,19' })
  const f = await prepareCarousing(call, { fundGp: 40 }), initial = await get(call)
  const tools = (await call.client.listTools()).tools
  for (const name of ['start_xge_carousing', 'work_xge_carousing', 'resolve_xge_carousing', 'assign_xge_carousing_contact', 'consume_xge_carousing_contact', 'abandon_xge_carousing', 'inspect_xge_carousing']) assert.ok(tools.some(tool => tool.name === name))
  assert.equal(tools.find(tool => tool.name === 'inspect_xge_carousing').annotations.readOnlyHint, true)
  assert.ok(ok(await call('get_rules_support', { domain: 'xge_carousing' })).tools.includes('assign_xge_carousing_contact'))
  const source = ok(await call('inspect_xge_carousing')).source
  assert.equal(source.sha256, '519584ec7fc7da6fea056c182a22254bc807db5d077c2fc205801bd872d761bf')
  assert.equal(source.startLine, 2059); assert.equal(source.endLine, 2137); assert.equal(source.foundationLine, 1987)
  assert.equal(source.examples.lower.length, 8)
  const first = f.work(0, { gp: 10 })
  const posted = await play(t, call, [{ name: 'start_xge_carousing', input: f.startInput }, params => {
    assert.equal(ok(lastResult(params)).paidCp, 0); return { name: 'work_xge_carousing', input: first }
  }, params => { assert.equal(ok(lastResult(params)).paidCp, 1000); return 'Tu consacres ces huit heures réelles aux rencontres et repas.' }], 'Je fréquente réellement ce lieu.')
  assert.ok(posted.result.newGameState, 'play already checked the actual HTTP200 and persisted response')
  await finishWork(call, f, 1)
  const beforeRoll = await get(call), answer = ok(await call('resolve_xge_carousing', f.resolve)), outcome = answer.week.resolution.outcome
  assert.equal(outcome.kind, 'allied'); assert.equal(outcome.count, 2); assert.equal(outcome.example.roll.total, 1)
  assert.equal(answer.contacts.filter(c => c.state === 'unallocated').length, 2)
  const afterRoll = await get(call)
  for (const key of ['player', 'npcs', 'monsters', 'worldFacts', 'revealedClues', 'quests', 'worldTimeSeconds']) assert.deepEqual(afterRoll[key], beforeRoll[key])
  assert.equal(copperValue(initial.dmTools.wallet) - copperValue(afterRoll.dmTools.wallet), 1000, 'documentary pickpocket example transfers no coins')
  await refused(call, 'start_xge_carousing', { ...f.startInput, eventId: 'not-before-actual-assignment' }, 'XGE_CAROUSING_ALLOCATION_REQUIRED')
  const reserve = { eventId: 'actual-unspecified-ally', contactId: outcome.contactIds[0], assignment: 'unspecified' }
  ok(await call('assign_xge_carousing_contact', reserve))
  await refused(call, 'assign_xge_carousing_contact', { ...reserve, eventId: 'no-cap-overflow', contactId: outcome.contactIds[1] }, 'XGE_CAROUSING_UNSPECIFIED_CAP')
  const namedInput = await named(call, outcome.contactIds[0], f)
  await refused(call, 'assign_xge_carousing_contact', { ...namedInput, socialClass: 'upper' }, 'XGE_CAROUSING_NAMED_QUALIFICATION_REQUIRED')
  await refused(call, 'assign_xge_carousing_contact', { ...namedInput, targetId: 'invented-contact' }, 'XGE_CAROUSING_PERSON_REQUIRED')
  const assigned = ok(await call('assign_xge_carousing_contact', namedInput))
  assert.equal(assigned.unspecifiedAlliedContacts.length, 0); assert.equal(assigned.contacts.filter(c => c.state === 'named').length, 1)
  ok(await call('assign_xge_carousing_contact', { eventId: 'now-free-unspecified-slot', contactId: outcome.contactIds[1], assignment: 'unspecified' }))
  assert.equal(ok(await call('inspect_xge_carousing')).unspecifiedAlliedContacts.length, 1)
  const resumed = await sql(t, call)
  const corrupt = structuredClone(await get(resumed)); latest(corrupt).resolution.outcome.count = 3
  await refused(resumed, 'replace_game_state', { gameState: corrupt }, 'XGE_CAROUSING_STATE_MISMATCH')
  const capCorrupt = structuredClone(await get(resumed)); capCorrupt.dmTools.xgeCarousing.assignments[0].cap = 100
  await refused(resumed, 'replace_game_state', { gameState: capCorrupt }, 'XGE_CAROUSING_STATE_MISMATCH')
  for (const [tool, input] of [['work_xge_carousing', first], ['resolve_xge_carousing', f.resolve], ['assign_xge_carousing_contact', namedInput]]) assert.equal(ok(await resumed(tool, input)).replayed, true)
  const s = await get(resumed), aid = ok(await resumed('record_scene_fact', { cell: s.player.position,
    description: 'Ce contact nommé a réellement fourni une aide non dangereuse déjà jouée et résolue séparément. Ce reçu ne produit ni information ni avantage.' })).worldFact
  const consume = { eventId: 'actual-ally-use', contactId: outcome.contactIds[0], targetId: f.hostId,
    actualAidOrObstacleFactId: aid.id, actualAidOrObstacleConfirmed: true, noLifeRiskConfirmed: true }
  const beforeUse = await get(resumed)
  assert.equal(ok(await resumed('consume_xge_carousing_contact', consume)).grantedBenefit, false)
  for (const key of ['player', 'npcs', 'monsters', 'worldFacts', 'relationships', 'worldTimeSeconds']) assert.deepEqual((await get(resumed))[key], beforeUse[key])
  assert.equal(ok(await resumed('consume_xge_carousing_contact', consume)).replayed, true)
  await refused(resumed, 'consume_xge_carousing_contact', { ...consume, eventId: 'no-new-use' }, 'XGE_CAROUSING_UNUSED_NAMED_CONTACT_REQUIRED')
  assert.equal(await marker(call), 19); assert.equal(await marker(resumed), 19)
})

for (const [socialClass, gp] of [['lower', 10], ['middle', 50], ['upper', 250]]) test(`real ${socialClass}-class entire ${gp}gp expense occurs only at first eight-hour effort; refusals and abandonment preserve coins/time/dice`, async t => {
  const call = await engine(t, { dice: '19' }), f = await prepareCarousing(call, { socialClass, fundGp: gp })
  if (socialClass === 'upper') await refused(call, 'start_xge_carousing', { ...f.startInput, nobilityContactIds: ['invented-noble'] }, 'XGE_CAROUSING_PERSON_REQUIRED')
  const before = await get(call)
  ok(await call('start_xge_carousing', f.startInput))
  assert.equal(copperValue((await get(call)).dmTools.wallet), copperValue(before.dmTools.wallet))
  await refused(call, 'work_xge_carousing', f.work(0), 'XGE_CAROUSING_EXACT_EXPENSE_REQUIRED')
  await refused(call, 'work_xge_carousing', f.work(0, { gp: gp - 1 }), 'XGE_CAROUSING_EXACT_EXPENSE_REQUIRED')
  await refused(call, 'work_xge_carousing', f.work(0, { cp: gp * 100 }), 'XGE_CAROUSING_COINS_REQUIRED')
  const day = f.work(0, { gp }); ok(await call('work_xge_carousing', day))
  assert.equal(copperValue(before.dmTools.wallet) - copperValue((await get(call)).dmTools.wallet), gp * 100)
  const fresh = await sql(t, call)
  assert.equal(ok(await fresh('work_xge_carousing', day)).replayed, true)
  await nextCarousingDate(fresh)
  await refused(fresh, 'work_xge_carousing', f.work(1, { gp }), 'XGE_CAROUSING_EXPENSE_ALREADY_PAID')
  const wallet = structuredClone((await get(fresh)).dmTools.wallet)
  const abandon = { eventId: socialClass + '-actual-abandon', weekId: f.startInput.eventId, abandonUnfinishedWeekConfirmed: true }
  assert.equal(ok(await fresh('abandon_xge_carousing', abandon)).refundedCp, 0)
  assert.deepEqual((await get(fresh)).dmTools.wallet, wallet); assert.equal(latest(await get(fresh)).segments.length, 1)
  assert.equal(await marker(call), 19); assert.equal(await marker(fresh), 19)
})

test('real source Carousing totals cover every printed boundary, natural20 is still a total and Bard expertise natural1 can yield an allied contact', async t => {
  for (const [die, kind, count] of [[1, 'hostile', 1], [5, 'hostile', 1], [6, 'none', 0], [10, 'none', 0], [11, 'allied', 1], [15, 'allied', 1], [16, 'allied', 2], [20, 'allied', 2]]) {
    const call = await engine(t, { characterId: 'fighter', dice: `${die},99,19` }), f = await prepareCarousing(call, { fundGp: 10 })
    ok(await call('start_xge_carousing', f.startInput)); await finishWork(call, f)
    const out = ok(await call('resolve_xge_carousing', f.resolve)).week.resolution
    assert.equal(out.check.roll.total, die); assert.equal(out.outcome.kind, kind); assert.equal(out.outcome.count, count)
    assert.equal(out.check.dc, undefined); assert.equal(out.check.success, undefined); assert.equal(await marker(call), 19)
    await call.client.close()
  }
  for (const die of [1, 20]) {
    const call = await engine(t, { characterId: 'bard', dice: `${die},99,19` }), f = await prepareCarousing(call, { fundGp: 10 })
    ok(await call('start_xge_carousing', f.startInput)); await finishWork(call, f)
    const out = ok(await call('resolve_xge_carousing', f.resolve)).week.resolution
    assert.equal(out.check.proficient, true); assert.equal(out.check.expertise, true); assert.equal(out.check.roll.rolls[0], die)
    assert.equal(out.outcome.kind, 'allied'); assert.equal(out.outcome.count, die === 1 ? 1 : 3); assert.equal(await marker(call), 19)
    await call.client.close()
  }
})

test('public prepared Inspiration survives SQL and supplies real advantage to the one Carousing check without target, fee or effort replay', async t => {
  const call = await engine(t, { dice: '2,18,99,19' }), f = await prepareCarousing(call, { fundGp: 10 })
  ok(await call('start_xge_carousing', f.startInput)); await finishWork(call, f)
  ok(await call('grant_inspiration', { eventId: 'actual-carousing-inspiration', reason: 'Le MJ récompense une interprétation réellement établie de cet idéal.' }))
  ok(await call('spend_inspiration', { spendId: 'actual-social-advantage', rollKind: 'check' }))
  const fresh = await sql(t, call, '2,18,99,19'), before = await get(fresh)
  const out = ok(await fresh('resolve_xge_carousing', f.resolve)).week.resolution
  assert.equal(out.check.advantage, true); assert.equal(out.check.roll.rolls[0], 18); assert.equal(out.outcome.count, 2)
  assert.equal((await get(fresh)).dmTools.dmInspiration.spends['actual-social-advantage'].status, 'consumed')
  assert.equal(copperValue((await get(fresh)).dmTools.wallet), copperValue(before.dmTools.wallet))
  const again = await sql(t, fresh); assert.equal(ok(await again('resolve_xge_carousing', f.resolve)).replayed, true)
  assert.equal(await marker(fresh), 19); assert.equal(await marker(again), 19)
})

test('controlled pre-existing Bardic reserve holds the actual Carousing d20 through SQL and resumes once without another fee, effort or source roll', async t => {
  const call = await engine(t, { dice: '10,3,99,19' }), f = await prepareCarousing(call, { fundGp: 10 })
  ok(await call('start_xge_carousing', f.startInput)); await finishWork(call, f)
  // Controlled reserve complement only; this does not prove a public Bardic grant producer.
  const state = await get(call); state.hero.inspiration.push({ targetId: 'player', expiresAt: state.worldTimeSeconds + 600, die: 8 })
  ok(await call('replace_game_state', { gameState: state }))
  const held = ok(await call('resolve_xge_carousing', f.resolve)).pendingReaction
  assert.ok(held)
  const original = await get(call), fresh = await sql(t, call, '3,99,19')
  assert.equal(ok(await fresh('resolve_xge_carousing', f.resolve)).pendingReaction.id, held.id)
  const missingRegistry = structuredClone(await get(fresh)); delete missingRegistry.dmTools.xgeCarousing
  await refused(fresh, 'replace_game_state', { gameState: missingRegistry }, 'XGE_CAROUSING_STATE_MISMATCH')
  const changed = structuredClone(await get(fresh)); latest(changed).resolution.heldWitness = 'tampered'
  await refused(fresh, 'replace_game_state', { gameState: changed }, 'XGE_CAROUSING_STATE_MISMATCH')
  const done = ok(await fresh('resolve_reaction', { pendingId: held.id, choice: 'bardic_inspiration' })).week.resolution
  assert.deepEqual(done.check.roll.rolls, [10]); assert.equal(done.check.roll.total, 13); assert.equal(done.outcome.kind, 'allied')
  assert.equal((await get(fresh)).hero.inspiration.length, 0)
  assert.equal((await get(fresh)).worldTimeSeconds, original.worldTimeSeconds)
  assert.deepEqual((await get(fresh)).dmTools.wallet, original.dmTools.wallet)
  assert.equal(ok(await fresh('resolve_xge_carousing', f.resolve)).replayed, true)
  const again = await sql(t, fresh); assert.equal(ok(await again('resolve_xge_carousing', f.resolve)).replayed, true)
  assert.equal(await marker(fresh), 19); assert.equal(await marker(again), 19)
})

test('real middle and upper class complication8 keeps printed extra expenses documentary with no new debt, actor or wallet debit', async t => {
  for (const [socialClass, gp] of [['middle', 50], ['upper', 250]]) {
    const call = await engine(t, { dice: '11,10,8,19' }), f = await prepareCarousing(call, { socialClass, fundGp: gp })
    ok(await call('start_xge_carousing', f.startInput)); await finishWork(call, f)
    const before = await get(call), out = ok(await call('resolve_xge_carousing', f.resolve)).week.resolution
    assert.equal(out.outcome.example.roll.total, 8)
    assert.match(out.outcome.example.text, new RegExp(socialClass === 'middle' ? '100 gp' : '500 gp'))
    const after = await get(call)
    for (const key of ['player', 'dmTools', 'npcs', 'monsters', 'worldFacts', 'worldTimeSeconds']) {
      if (key === 'dmTools') { assert.deepEqual(after.dmTools.wallet, before.dmTools.wallet); continue }
      assert.deepEqual(after[key], before[key])
    }
    assert.equal(await marker(call), 19); await call.client.close()
  }
})

test('controlled low-CHA sheet boundaries use real public effort/check/SQL and preserve the explicit nonpositive hostile convention', async t => {
  for (const charisma of [8, 6]) {
    const call = await engine(t, { dice: '1,10,8,19' })
    // Controlled sheet boundary, not a claim that a public ability-reduction producer exists.
    const sheet = await get(call); sheet.player.stats.cha = charisma; ok(await call('replace_game_state', { gameState: sheet }))
    const f = await prepareCarousing(call, { fundGp: 10 }); ok(await call('start_xge_carousing', f.startInput)); await finishWork(call, f)
    const out = ok(await call('resolve_xge_carousing', f.resolve)).week.resolution
    assert.equal(out.check.roll.total, charisma === 8 ? 0 : -1); assert.equal(out.outcome.kind, 'hostile'); assert.equal(out.outcome.count, 1)
    assert.equal(out.outcome.nonpositiveTotalConvention, 'user_hostile_2026_11_07'); assert.equal(out.outcome.example.roll.total, 8)
    const fresh = await sql(t, call); assert.equal(ok(await fresh('resolve_xge_carousing', f.resolve)).replayed, true)
    assert.equal(await marker(call), 19); assert.equal(await marker(fresh), 19)
    await call.client.close(); await fresh.client.close()
  }
})

test('actual religious service and Carousing use the same eight-hour effort budget in both directions before coins or time', async t => {
  const call = await engine(t, { dice: '19' }), f = await prepareCarousing(call, { fundGp: 10 }), service = await prepareService(call)
  ok(await call('start_xge_carousing', f.startInput)); ok(await call('start_xge_religious_service', service.input))
  ok(await call('work_xge_carousing', f.work(0, { gp: 10 })))
  await refused(call, 'work_xge_religious_service', service.work(0), 'DOWNTIME_SHARED_DAY_REQUIRED')
  await nextCarousingDate(call); ok(await call('work_xge_religious_service', service.work(0)))
  await refused(call, 'work_xge_carousing', f.work(1), 'DOWNTIME_SHARED_DAY_REQUIRED')
  const fresh = await sql(t, call); assert.equal(ok(await fresh('work_xge_carousing', f.work(0, { gp: 10 }))).replayed, true)
  assert.equal(await marker(call), 19); assert.equal(await marker(fresh), 19)
})

test('a real hostile contact can be named from its unspecified result and records only an actual nonviolent noncriminal obstacle without changing NPC attitude', async t => {
  const call = await engine(t, { dice: '1,99,19' }), f = await prepareCarousing(call, { fundGp: 10 })
  ok(await call('start_xge_carousing', f.startInput)); await finishWork(call, f)
  const out = ok(await call('resolve_xge_carousing', f.resolve)).week.resolution.outcome
  assert.equal(out.kind, 'hostile')
  ok(await call('assign_xge_carousing_contact', { eventId: 'actual-unspecified-hostile', contactId: out.contactIds[0], assignment: 'unspecified' }))
  assert.equal(ok(await call('inspect_xge_carousing')).unspecifiedAlliedContacts.length, 0)
  const input = await named(call, out.contactIds[0], f), before = await get(call)
  ok(await call('assign_xge_carousing_contact', input))
  assert.deepEqual((await get(call)).npcs, before.npcs)
  const actual = ok(await call('record_scene_fact', { cell: before.player.position,
    description: 'Ce contact hostile nommé a réellement placé un obstacle administratif déjà joué et résolu. Le MJ atteste que cet obstacle ne constitue ni crime ni violence ; ce reçu ne produit aucun obstacle supplémentaire.' })).worldFact
  const use = { eventId: 'actual-hostile-obstacle', contactId: out.contactIds[0], targetId: f.hostId,
    actualAidOrObstacleFactId: actual.id, actualAidOrObstacleConfirmed: true, nonviolentNoncriminalObstacleConfirmed: true }
  await refused(call, 'consume_xge_carousing_contact', { ...use, nonviolentNoncriminalObstacleConfirmed: undefined, noLifeRiskConfirmed: true }, 'XGE_CAROUSING_CONTACT_LIMITS_REQUIRED')
  const frozen = await get(call); assert.equal(ok(await call('consume_xge_carousing_contact', use)).grantedBenefit, false)
  assert.deepEqual((await get(call)).npcs, frozen.npcs); assert.deepEqual((await get(call)).player, frozen.player)
  assert.equal(ok(await call('consume_xge_carousing_contact', use)).replayed, true)
  assert.equal(await marker(call), 19)
})

test('a delayed actual Carousing week keeps paid effort and SQL history while refusing further time or automatic doubled costs', async t => {
  const call = await engine(t, { dice: '19' }), f = await prepareCarousing(call, { fundGp: 20 })
  ok(await call('start_xge_carousing', f.startInput)); const day = f.work(0, { gp: 10 })
  ok(await call('work_xge_carousing', day)); await nextCarousingDate(call, 10)
  await refused(call, 'work_xge_carousing', f.work(1), 'XGE_CAROUSING_DELAY_ADJUDICATION_REQUIRED')
  const fresh = await sql(t, call)
  await refused(fresh, 'work_xge_carousing', f.work(1), 'XGE_CAROUSING_DELAY_ADJUDICATION_REQUIRED')
  const before = await get(fresh)
  ok(await fresh('abandon_xge_carousing', { eventId: 'actual-delayed-abandon', weekId: f.startInput.eventId, abandonUnfinishedWeekConfirmed: true }))
  assert.deepEqual(latest(await get(fresh)).segments, latest(before).segments)
  assert.deepEqual((await get(fresh)).dmTools.wallet, before.dmTools.wallet)
  assert.equal(await marker(call), 19); assert.equal(await marker(fresh), 19)
})
