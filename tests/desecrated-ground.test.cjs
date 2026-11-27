const test = require('node:test')
const assert = require('node:assert/strict')
Object.assign(process.env, { MONETIZATION_ENABLED: 'false', LLM_MODE: 'mock', ALLOW_PAID_LLM: 'false', DM_RATE_LIMIT_PER_MINUTE: '0' })
const { installPgMem } = require('./helpers/pg-mem.cjs')
const pg = installPgMem()
const { saveSession, loadSession, deleteSession } = require('../lib/session-store.ts')
const { engine, ok, spawn } = require('./helpers/mcp-toolkit.cjs')
const { play, lastResult } = require('./helpers/dm-scripted-turn.cjs')
const { prepareDesecratedGround, acquireHolyWater, freeClericHand } = require('./helpers/desecrated-ground-fixture.cjs')

const cleric = { adventureId: 'fey-shadow-fair', characterId: 'cleric' }
const detect = { spellId: 'detect-evil-and-good', narrative: 'Je concentre ce sens divin sans supposer sa réponse.' }
test.after(() => pg.restore())

async function refuse(call, name, input, code) {
  const before = await call('get_game_state')
  assert.equal((await call(name, input)).code, code)
  assert.deepEqual(await call('get_game_state'), before)
}

async function savingThrow(call, entityId, ability = 'str') {
  return ok(await call('resolve_saving_throw', { entityId, ability, dc: 10 }))
}

test('real undead gains a sourced save advantage at the actual ground, not by name or mere proximity', async t => {
  const call = await engine(t, { ...cleric, dice: '1,19,1,19,17' })
  const f = await prepareDesecratedGround(call)
  const skeleton = await spawn(call, 'skeleton', f.cells[1]), goblin = await spawn(call, 'goblin', f.cells[3])
  const profaned = await savingThrow(call, skeleton.id)
  assert.equal(profaned.roll.rolls[0], 19)
  assert.match(profaned.mechanicalSummary, /sol profané/)
  assert.equal((await savingThrow(call, goblin.id)).roll.rolls[0], 1)
  const out = { x: f.start.x + 2, y: f.start.y }
  assert.deepEqual(ok(await call('move_token', { tokenId: skeleton.id, toCell: out })).finalPosition, out)
  const ordinary = await savingThrow(call, skeleton.id, 'wis')
  assert.equal(ordinary.roll.rolls[0], 19)
  assert.doesNotMatch(ordinary.mechanicalSummary, /sol profané/)
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 17)
})

test('a genuine cleric concentration signals only presence; an unmeasured obstruction stays unresolved', async t => {
  const call = await engine(t, { ...cleric, dice: '19' })
  await freeClericHand(call)
  const { player } = await call('get_game_state'), p = player.position
  const distant = { x: p.x, y: p.y - 2 }, obstruction = { x: p.x, y: p.y - 1 }
  await prepareDesecratedGround(call, { cells: [distant] })
  assert.equal(ok(await call('inspect_detected_desecration')).active, false)
  const before = await call('get_game_state')
  const cast = ok(await call('cast_spell', detect))
  assert.equal(cast.desecratedGround.presence, 'detected')
  assert.deepEqual(Object.keys(cast.desecratedGround).sort(), ['active', 'expiresAt', 'presence', 'source'])
  assert.equal(cast.desecratedGround.expiresAt, before.worldTimeSeconds + 600)
  assert.equal((await call('get_game_state')).player.spellSlots.level1.current, before.player.spellSlots.level1.current - 1)
  ok(await call('create_scene_object', {
    objectId: 'actual-intervening-barrier', name: 'Cloison', description: 'Obstacle matériel, épaisseur de divination inconnue.',
    cell: obstruction, kind: 'obstacle', material: 'wood', size: 'medium', resilience: 'resilient',
  }))
  assert.equal(ok(await call('inspect_detected_desecration')).presence, 'unresolved')
  for (const roomId of ['2', '9', '5']) ok(await call('move_token', { tokenId: 'player', roomId }))
  assert.equal(ok(await call('inspect_detected_desecration')).presence, 'none_detected')
  ok(await call('end_concentration'))
  assert.equal(ok(await call('inspect_detected_desecration')).active, false)
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19)
})

test('one acquired holy-water flask clears only the chosen four cells and its SQL replay spends nothing', async t => {
  const options = { ...cleric, dice: '1,19,17' }, call = await engine(t, options)
  const f = await prepareDesecratedGround(call)
  await freeClericHand(call)
  const flask = await acquireHolyWater(call, { x: f.start.x - 1, y: f.start.y })
  const near = await spawn(call, 'skeleton', f.cells[1]), tail = await spawn(call, 'skeleton', f.cells[4])
  const input = { eventId: 'actual-ground-purification', surfaceId: f.surfaceId, originCell: f.origin, itemId: flask.id,
    cost: { kind: 'measured_interval', seconds: 7, reason: 'The actual application over this entire floor took seven seconds.' } }
  await refuse(call, 'purify_desecrated_ground', { ...input, itemId: 'potion1' }, 'DESECRATED_GROUND_FLASK_REQUIRED')
  await refuse(call, 'purify_desecrated_ground', { ...input, originCell: f.cells[4] }, 'DESECRATED_GROUND_SQUARE_REQUIRED')
  const before = await call('get_game_state')
  const purified = ok(await call('purify_desecrated_ground', input))
  assert.deepEqual(purified.purifiedCells, f.cells.slice(0, 4))
  const after = await call('get_game_state')
  assert.equal(after.worldTimeSeconds - before.worldTimeSeconds, 7)
  assert.ok(!after.player.inventory.some(item => item.id === flask.id))
  assert.ok(!after.droppedItems?.[flask.id])
  ok(await call('create_magic_item', { itemId: flask.id, templateId: 'potion_of_healing', cell: f.start,
    name: 'Autre objet', description: 'Un autre objet de la scène reprend cet identifiant libéré.' }))
  ok(await call('record_scene_fact', { cell: f.origin, replaceFactId: f.classification.factId,
    description: 'Le carré a été réellement purifié, le reste du sol est toujours profané.' }))
  const withOtherItem = await call('get_game_state')
  assert.equal(withOtherItem.droppedItems[flask.id].item.type, 'potion')
  assert.ok(!withOtherItem.worldFacts.some(fact => fact.id === f.classification.factId))
  const id = `desecration-${process.pid}`
  t.after(() => deleteSession(id))
  await saveSession(id, { gameState: withOtherItem, history: [], adventureId: after.adventureId, characterId: after.characterId })
  const restored = await engine(t, { ...cleric, dice: '1,1,19,17' })
  ok(await restored('replace_game_state', { gameState: (await loadSession(id)).gameState }))
  const snapshot = await restored('get_game_state')
  const altered = structuredClone(snapshot)
  altered.dmTools.desecratedGround.purifications[input.eventId].cells[0] = f.cells[4]
  await refuse(restored, 'replace_game_state', { gameState: altered }, 'DESECRATED_GROUND_STATE_MISMATCH')
  assert.equal(ok(await restored('purify_desecrated_ground', input)).replayed, true)
  assert.equal(ok(await restored('record_desecrated_ground', f.classification)).replayed, true)
  assert.deepEqual(await restored('get_game_state'), snapshot)
  assert.equal((await savingThrow(restored, near.id)).roll.rolls[0], 1)
  const retained = await savingThrow(restored, tail.id)
  assert.equal(retained.roll.rolls[0], 19)
  assert.match(retained.mechanicalSummary, /sol profané/)
  assert.equal(ok(await restored('roll_dice', { notation: '1d20' })).total, 17)
})

test('the actual upper floor grants advantage even prone, unlike the overlapping lower support', async t => {
  const call = await engine(t, { ...cleric, dice: '1,1,19,1,19,17' })
  const state = await call('get_game_state'), a = { x: state.player.position.x, y: state.player.position.y - 1 }
  const b = { x: a.x + 1, y: a.y }
  const f = await prepareDesecratedGround(call, { cells: [a, b], elevationFeet: 10 })
  await freeClericHand(call)
  assert.equal(ok(await call('cast_spell', detect)).desecratedGround.presence, 'unresolved')
  ok(await call('record_vertical_surface', { eventId: 'actual-lower-measure', surfaceId: 'actual-lower-support',
    mapId: state.currentMapId, roomId: state.currentRoomId, cells: [a], kind: 'support', elevationFeet: 0,
    actualGeometryConfirmed: true, source: 'Actual lower floor under the separate upper floor.' }))
  const lower = await spawn(call, 'skeleton', a), upper = await spawn(call, 'skeleton', b)
  for (const [body, surfaceId] of [[lower, 'actual-lower-support'], [upper, f.surfaceId]]) {
    ok(await call('observe_standing_surface', { eventId: body.id + '-actual-level', entityId: body.id, surfaceId,
      actualCurrentSupportConfirmed: true, source: 'First factual observation of this actual body on its own floor.' }))
  }
  assert.equal((await savingThrow(call, lower.id)).roll.rolls[0], 1)
  assert.equal((await savingThrow(call, upper.id)).roll.rolls[0], 19)
  ok(await call('apply_condition', { entityId: upper.id, condition: 'prone' }))
  assert.equal((await call('get_game_state')).dmTools.jumping.supports[upper.id].surfaceId, f.surfaceId)
  assert.equal((await savingThrow(call, upper.id, 'wis')).roll.rolls[0], 19)
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 17)
})

test('sprinkling in combat spends the actual action without advancing the clock or throwing an attack', async t => {
  const call = await engine(t, { ...cleric, dice: '20,1,19' })
  const f = await prepareDesecratedGround(call)
  await freeClericHand(call)
  const item = await acquireHolyWater(call, { x: f.start.x - 1, y: f.start.y })
  const undead = await spawn(call, 'skeleton', f.cells[1])
  ok(await call('enter_combat', { combatants: ['player', undead.id] }))
  const before = await call('get_game_state')
  assert.equal(before.currentTurn, 'player')
  const input = { eventId: 'actual-combat-purification', surfaceId: f.surfaceId, originCell: f.origin, itemId: item.id }
  await refuse(call, 'purify_desecrated_ground', { ...input,
    cost: { kind: 'measured_interval', seconds: 7, reason: 'This is not the actual combat action.' } }, 'DESECRATED_GROUND_COST_REQUIRED')
  assert.equal(ok(await call('purify_desecrated_ground', { ...input, cost: { kind: 'action' } })).actionSpent, true)
  const after = await call('get_game_state')
  assert.equal(after.worldTimeSeconds, before.worldTimeSeconds)
  assert.equal(after.hero.actionCredits, before.hero.actionCredits - 1)
  assert.equal(after.actionUsed.player, true)
  assert.ok(!after.player.inventory.some(value => value.id === item.id))
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19)
})

test('the actual DM POST forwards a real Detect Evil and Good cast and its presence-only inspection', async t => {
  const call = await engine(t, { ...cleric, dice: '19' })
  for (const roomId of ['2', '9', '5']) ok(await call('move_token', { tokenId: 'player', roomId }))
  await freeClericHand(call)
  await prepareDesecratedGround(call)
  const { result, seen, selected, before } = await play(t, call, [
    { name: 'cast_spell', input: detect },
    params => {
      assert.equal(lastResult(params).desecratedGround.presence, 'detected')
      return { name: 'inspect_detected_desecration', input: {} }
    },
    params => {
      const view = lastResult(params)
      assert.equal(view.presence, 'detected')
      assert.deepEqual(Object.keys(view).sort(), ['active', 'expiresAt', 'presence', 'source'])
      return 'Tu perçois la présence d’un sol profané à portée.'
    },
  ], 'Je lance Détection du mal et du bien pour vérifier la présence du sol profané à portée.')
  assert.deepEqual(seen, selected)
  assert.equal(result.newGameState.player.spellSlots.level1.current, before.player.spellSlots.level1.current - 1)
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19)
})

test('a true Bardic Inspiration continuation keeps the grounded undead’s original two-d20 save through SQL', async t => {
  const bard = { adventureId: 'fey-shadow-fair', characterId: 'bard' }
  const call = await engine(t, { ...bard, dice: '1,8' }), f = await prepareDesecratedGround(call)
  const undead = await spawn(call, 'skeleton', f.cells[1])
  ok(await call('use_subclass_feature', { featureId: 'bardic_inspiration', targetId: undead.id }))
  const { pendingReaction: held } = await savingThrow(call, undead.id)
  assert.equal(held.roll.rolls[0], 8)
  assert.match(held.roll.detail, /^ADV:/)
  const state = await call('get_game_state'), id = `desecration-held-${process.pid}`
  t.after(() => deleteSession(id))
  await saveSession(id, { gameState: state, history: [], adventureId: state.adventureId, characterId: state.characterId })
  const restored = await engine(t, { ...bard, dice: '4,19' })
  ok(await restored('replace_game_state', { gameState: (await loadSession(id)).gameState }))
  const result = ok(await restored('resolve_reaction', { pendingId: held.id, choice: 'bardic_inspiration' }))
  assert.equal(result.roll.rolls[0], 8)
  assert.equal(result.roll.total, held.roll.total + 4)
  assert.equal(result.success, true)
  assert.equal((await restored('get_game_state')).hero.inspiration.length, 0)
  assert.equal(ok(await restored('roll_dice', { notation: '1d20' })).total, 19)
})

test('an actually dying grounded undead uses the same advantage only when its own death save is due', async t => {
  const call = await engine(t, { ...cleric, dice: '1,19,17' }), f = await prepareDesecratedGround(call)
  const undead = await spawn(call, 'skeleton', f.cells[1])
  ok(await call('configure_npc_death_saves', { entityId: undead.id, eventId: 'actual-undead-life-policy',
    reason: 'The MJ explicitly tracks the life of this actual important NPC before injury.' }))
  ok(await call('update_hp', { entityId: undead.id, delta: -undead.hp.current, damageType: 'force',
    damageOrigin: 'environment', reason: 'An actual environmental injury leaves the body on this terrain.' }))
  const time = ok(await call('advance_time', { seconds: 6 }))
  const event = time.npcDeathSaveEvents.find(value => value.entityId === undead.id)
  assert.ok(event, 'This particular tracked dying body owes its real six-second save.')
  const save = ok(await call('roll_death_save', { entityId: undead.id, eventId: event.eventId }))
  assert.equal(save.naturalRoll, 19)
  assert.equal(save.successes, 1)
  assert.equal(save.failures, 0)
  assert.match(save.roll.detail, /sol profané/)
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 17)
})

test('measured application cannot pass a real Pale Tincture boundary before time or the flask is spent', async t => {
  const call = await engine(t, { ...cleric, dice: '1,1,19' }), f = await prepareDesecratedGround(call)
  await freeClericHand(call)
  const item = await acquireHolyWater(call, { x: f.start.x - 1, y: f.start.y })
  ok(await call('create_affliction_source', { sourceId: 'real-tincture', templateId: 'pale_tincture',
    name: 'Teinture pâle réelle', cell: f.start, doses: 1 }))
  const exposed = ok(await call('expose_affliction', { sourceId: 'real-tincture', eventId: 'actual-tincture-exposure',
    targetId: 'player', delivery: 'ingested' }))
  assert.equal(exposed.save.success, false)
  const current = await call('get_game_state'), at = exposed.affliction.nextAt
  ok(await call('advance_time', { seconds: at - current.worldTimeSeconds - 5 }))
  const input = { eventId: 'actual-application-at-boundary', surfaceId: f.surfaceId, originCell: f.origin, itemId: item.id }
  const cost = { kind: 'measured_interval', reason: 'The actual selected interval to sprinkle over this whole square.' }
  await refuse(call, 'purify_desecrated_ground', { ...input, cost: { ...cost, seconds: 7 } }, 'DESECRATED_GROUND_AFFLICTION_BOUNDARY')
  ok(await call('purify_desecrated_ground', { ...input, cost: { ...cost, seconds: 5 } }))
  const after = await call('get_game_state')
  assert.equal(after.worldTimeSeconds, at)
  assert.equal(after.dmTools.afflictions.records[exposed.affliction.id].nextAt, at)
  assert.ok(!after.player.inventory.some(value => value.id === item.id))
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19)
})
