const assert = require('node:assert/strict'), test = require('node:test')
Object.assign(process.env, { MONETIZATION_ENABLED: 'false', LLM_MODE: 'mock', ALLOW_PAID_LLM: 'false', APP_LOG_PERSIST_ENABLED: 'false', APP_LOG_LEVEL: 'error' })
const { installPgMem } = require('./helpers/pg-mem.cjs'), pg = installPgMem()
const { saveSession, loadSession, deleteSession } = require('../lib/session-store.ts')
const { engine, ok } = require('./helpers/mcp-toolkit.cjs')
const { carousingReceiptWitness } = require('../mcp-server/dist/lib/xge-carousing-state.js')
const { refused } = require('./helpers/xge-training-fixture.cjs')
const { nextCarousingDate } = require('./helpers/xge-carousing-fixture.cjs')
const { createAnotherPerson, completeCarousingWeek, nameActualContact, actualAidInput,
  prepareNamedAlly, prepareNextNamedWeek, prepareRenewalInput } = require('./helpers/xge-carousing-renewal-fixture.cjs')
test.after(() => pg.restore())
const get = call => call('get_game_state')
const marker = async call => ok(await call('roll_dice', { notation: '1d20' })).total
async function sql(t, call, dice = '19') {
  const before = await get(call), id = 'actual-renewal-sql-' + process.pid + '-' + Math.random()
  t.after(() => deleteSession(id))
  await saveSession(id, { gameState: before, history: [], adventureId: before.adventureId, characterId: before.characterId })
  const fresh = await engine(t, { adventureId: before.adventureId, characterId: before.characterId, dice })
  ok(await fresh('replace_game_state', { gameState: (await loadSession(id)).gameState }))
  assert.deepEqual(await get(fresh), before); return fresh
}
function physicalUnchanged(before, after) {
  for (const key of ['player', 'npcs', 'monsters', 'worldFacts', 'worldTimeSeconds', 'hero', 'relationships', 'quests', 'revealedClues'])
    assert.deepEqual(after[key], before[key], key)
  assert.deepEqual(after.dmTools.wallet, before.dmTools.wallet)
}

test('one actual new gain renews the consumed named ally with full unspecified stock, first effort at the exact aid second, immutable old receipts and a single distinct aid after SQL', async t => {
  const call = await engine(t, { dice: '16,99,11,99,19' }), old = await prepareNamedAlly(call, { reserveSecond: true })
  assert.equal(ok(await call('inspect_xge_carousing')).unspecifiedAlliedContacts.length, 1)
  const next = await prepareNextNamedWeek(call, old)
  ok(await call('start_xge_carousing', next.startInput)); const resolved = await completeCarousingWeek(call, next)
  assert.equal(resolved.week.segments[0].from, old.consumption.at, 'The actual first effort may follow the aid at the same second; do not add an artificial second.')
  const gain = resolved.week.resolution.outcome.contactIds[0], input = await prepareRenewalInput(call, old, gain)
  const other = await createAnotherPerson(call)
  await refused(call, 'renew_xge_carousing_contact', { ...input, targetId: other }, 'XGE_CAROUSING_CONTACT_IDENTITY_CHANGED')
  await refused(call, 'renew_xge_carousing_contact', { ...input, socialClassFactId: input.meetingFactId }, 'XGE_CAROUSING_RENEWAL_FACTS_REQUIRED')
  const before = await get(call), historic = structuredClone(before.dmTools.xgeCarousing)
  assert.equal(historic.renewals, undefined, 'The W34-compatible state acquires no empty renewal array before the explicit event.')
  const result = ok(await call('renew_xge_carousing_contact', input))
  assert.equal(result.seconds, 0); assert.equal(result.paidCp, 0); assert.equal(result.grantedBenefit, false)
  assert.equal(result.event.convention, 'user_one_new_ally_same_class_area_v1')
  assert.equal(result.unspecifiedAlliedContacts.length, 1)
  const after = await get(call); physicalUnchanged(before, after)
  for (const key of ['weeks', 'assignments', 'consumptions']) assert.deepEqual(after.dmTools.xgeCarousing[key], historic[key])
  const contacts = ok(await call('inspect_xge_carousing')).contacts
  assert.equal(contacts.find(c => c.id === old.contactId).consumed, true)
  assert.equal(contacts.find(c => c.id === gain).consumed, false)
  assert.equal(contacts.find(c => c.id === gain).renewedFrom, old.contactId)
  assert.equal(contacts.find(c => c.id === gain).rootContactId, old.contactId)
  const fresh = await sql(t, call)
  assert.equal(ok(await fresh('renew_xge_carousing_contact', input)).replayed, true)
  assert.deepEqual(await get(fresh), after)
  for (const mutate of [s => { s.dmTools.xgeCarousing.renewals[0].rootContactId = gain },
    s => { s.dmTools.xgeCarousing.renewals[0].site.mapId = 'not-the-original-area' },
    s => { s.dmTools.xgeCarousing.renewals[0].previousConsumptionCommand = 'forged-old-help' }]) {
    const corrupt = structuredClone(after); mutate(corrupt)
    corrupt.dmTools.xgeCarousing.renewals[0].command = carousingReceiptWitness(corrupt.dmTools.xgeCarousing.renewals[0])
    await refused(fresh, 'replace_game_state', { gameState: corrupt }, 'XGE_CAROUSING_STATE_MISMATCH')
  }
  const repeatOldAid = { ...old.consumptionInput, eventId: 'not-a-new-aid', contactId: gain, actualNewAidAfterRenewalConfirmed: true }
  await refused(fresh, 'consume_xge_carousing_contact', repeatOldAid, 'XGE_CAROUSING_NEW_AID_REQUIRED')
  const aid = await actualAidInput(fresh, gain, old.targetId, { eventId: 'actual-renewed-aid', renewed: true })
  const noConfirmation = { ...aid }; delete noConfirmation.actualNewAidAfterRenewalConfirmed
  await refused(fresh, 'consume_xge_carousing_contact', noConfirmation, 'XGE_CAROUSING_NEW_AID_REQUIRED')
  const beforeAid = await get(fresh), used = ok(await fresh('consume_xge_carousing_contact', aid))
  assert.equal(used.event.at, result.event.at, 'Distinct real aid may causally follow renewal at the same worldTime.')
  physicalUnchanged(beforeAid, await get(fresh))
  assert.equal(ok(await fresh('consume_xge_carousing_contact', aid)).replayed, true)
  const again = await sql(t, fresh); assert.equal(ok(await again('renew_xge_carousing_contact', input)).replayed, true)
  assert.equal(ok(await again('consume_xge_carousing_contact', aid)).replayed, true)
  const third = await prepareNextNamedWeek(again, old, { projectId: 'third-week-after-renewal' })
  ok(await again('start_xge_carousing', third.startInput))
  const last = await sql(t, again)
  assert.equal(ok(await last('start_xge_carousing', third.startInput)).replayed, true)
  assert.equal(await marker(call), 19); assert.equal(await marker(fresh), 19); assert.equal(await marker(again), 19); assert.equal(await marker(last), 19)
})

test('a new unspecified gain is spent into the same named chain, frees its cap slot and cannot stack a second promise or renew again using the same already-worked week', async t => {
  const call = await engine(t, { dice: '11,99,16,99,19' }), old = await prepareNamedAlly(call)
  const next = await prepareNextNamedWeek(call, old); ok(await call('start_xge_carousing', next.startInput))
  const result = await completeCarousingWeek(call, next), [gain, spare] = result.week.resolution.outcome.contactIds
  ok(await call('assign_xge_carousing_contact', { eventId: 'actual-new-gain-reserve', contactId: gain, assignment: 'unspecified' }))
  const input = await prepareRenewalInput(call, old, gain)
  const renewed = ok(await call('renew_xge_carousing_contact', input))
  assert.equal(renewed.unspecifiedAlliedContacts.length, 0)
  const stack = await prepareRenewalInput(call, old, spare, { eventId: 'no-collective-refill' })
  await refused(call, 'renew_xge_carousing_contact', stack, 'XGE_CAROUSING_LATEST_PROMISE_REQUIRED')
  const aid = await actualAidInput(call, gain, old.targetId, { renewed: true }); ok(await call('consume_xge_carousing_contact', aid))
  const again = await prepareRenewalInput(call, old, spare, { eventId: 'no-same-week-refill', consumedContactId: gain, consumedEventId: aid.eventId })
  await refused(call, 'renew_xge_carousing_contact', again, 'XGE_CAROUSING_NEW_WEEK_AFTER_AID_REQUIRED')
  await refused(call, 'renew_xge_carousing_contact', { ...stack, eventId: 'no-ancestor-refill' }, 'XGE_CAROUSING_LATEST_PROMISE_REQUIRED')
  const fresh = await sql(t, call)
  assert.equal(ok(await fresh('renew_xge_carousing_contact', input)).replayed, true)
  assert.equal(ok(await fresh('inspect_xge_carousing')).renewals.length, 1)
  assert.equal(await marker(call), 19); assert.equal(await marker(fresh), 19)
})

test('carousing again cannot renew an unused named promise, and a gain earned before actual aid consumption never becomes a retroactive recharge', async t => {
  const call = await engine(t, { dice: '11,99,11,99,19' }), old = await prepareNamedAlly(call, { consume: false })
  await nextCarousingDate(call)
  const next = await prepareNextNamedWeek(call, old); ok(await call('start_xge_carousing', next.startInput))
  const result = await completeCarousingWeek(call, next), gain = result.week.resolution.outcome.contactIds[0]
  const unused = await prepareRenewalInput(call, old, gain, { consumedEventId: 'no-actual-prior-aid' })
  await refused(call, 'renew_xge_carousing_contact', unused, 'XGE_CAROUSING_CONSUMED_ALLY_REQUIRED')
  const aid = await actualAidInput(call, old.contactId, old.targetId)
  ok(await call('consume_xge_carousing_contact', aid))
  ok(await call('assign_xge_carousing_contact', { eventId: 'actual-old-stock', contactId: gain, assignment: 'unspecified' }))
  const input = await prepareRenewalInput(call, old, gain, { consumedEventId: aid.eventId })
  await refused(call, 'renew_xge_carousing_contact', input, 'XGE_CAROUSING_NEW_WEEK_AFTER_AID_REQUIRED')
  assert.equal(ok(await call('inspect_xge_carousing')).renewals.length, 0)
  assert.equal(await marker(call), 19)
})

test('a week partly worked before the consumed aid stays ineligible even if its final new gain is awarded later', async t => {
  const call = await engine(t, { dice: '11,99,11,99,19' }), old = await prepareNamedAlly(call, { consume: false })
  await nextCarousingDate(call)
  const next = await prepareNextNamedWeek(call, old); ok(await call('start_xge_carousing', next.startInput))
  ok(await call('work_xge_carousing', next.work(0, { gp: 10 })))
  const aid = await actualAidInput(call, old.contactId, old.targetId), consumed = ok(await call('consume_xge_carousing_contact', aid)).event
  const result = await completeCarousingWeek(call, next, { start: 1 })
  assert.ok(result.week.segments[0].from < consumed.at)
  assert.ok(result.week.resolution.outcome.ledgerIndex > consumed.ledgerIndex)
  const input = await prepareRenewalInput(call, old, result.week.resolution.outcome.contactIds[0], { consumedEventId: aid.eventId })
  await refused(call, 'renew_xge_carousing_contact', input, 'XGE_CAROUSING_NEW_WEEK_AFTER_AID_REQUIRED')
  assert.equal(await marker(call), 19)
})

test('a genuine differently priced social-class week preserves its original gain and paid effort while refusing to renew the lower-class named ally', async t => {
  const call = await engine(t, { dice: '11,99,11,99,19' }), old = await prepareNamedAlly(call)
  const next = await prepareNextNamedWeek(call, old, { socialClass: 'middle' }); ok(await call('start_xge_carousing', next.startInput))
  const result = await completeCarousingWeek(call, next), gain = result.week.resolution.outcome.contactIds[0]
  const input = await prepareRenewalInput(call, old, gain)
  await refused(call, 'renew_xge_carousing_contact', input, 'XGE_CAROUSING_RENEWAL_CLASS_AREA_REQUIRED')
  assert.equal(ok(await call('inspect_xge_carousing')).contacts.find(c => c.id === gain).state, 'unallocated')
  assert.equal(await marker(call), 19)
})

test('hostile, nonexistent and already-named-elsewhere new results cannot be borrowed to refresh an older ally', async t => {
  for (const die of [1, 6, 11]) {
    const call = await engine(t, { dice: `11,99,${die},99,19` }), old = await prepareNamedAlly(call)
    const other = await createAnotherPerson(call), next = await prepareNextNamedWeek(call, old)
    ok(await call('start_xge_carousing', next.startInput)); const result = await completeCarousingWeek(call, next)
    const gain = result.week.resolution.outcome.contactIds[0] ?? next.startInput.eventId + ':contact:1'
    if (die === 11) await nameActualContact(call, gain, { ...next, hostId: other })
    const input = await prepareRenewalInput(call, old, gain)
    await refused(call, 'renew_xge_carousing_contact', input, 'XGE_CAROUSING_NEW_ALLIED_GAIN_REQUIRED')
    assert.equal(ok(await call('inspect_xge_carousing')).renewals.length, 0)
    assert.equal(await marker(call), 19); await call.client.close()
  }
})
