const test = require('node:test'), assert = require('node:assert/strict')
Object.assign(process.env, { MONETIZATION_ENABLED: 'false', LLM_MODE: 'mock', ALLOW_PAID_LLM: 'false', ADVENTURE_ID: 'sarah-of-yellowcrest-manor', CHARACTER_ID: 'fighter' })
const { installPgMem } = require('./helpers/pg-mem.cjs'), pg = installPgMem()
const { engine, ok, adjacent } = require('./helpers/mcp-toolkit.cjs')
const { prepareRazorvine, refused, restoreRazorvine, marker } = require('./helpers/razorvine-fixture.cjs')
test.after(() => pg.restore())

async function bowFixture(t, dice, options) {
  const call = await engine(t, { dice }), f = await prepareRazorvine(call, options)
  const before = await call('get_game_state'), merchantCell = adjacent(before).find(cell => !f.rayCells.some(point => point.x === cell.x && point.y === cell.y)) ?? adjacent(before)[0]
  ok(await call('create_npc', { npcId: 'actual-face-bow-merchant', name: 'Marchand réel', statBlock: 'goblin', cell: merchantCell,
    disposition: 'neutral', visible: true, description: 'Le marchand présent vend cet arc ordinaire déjà fabriqué.' }))
  const fact = ok(await call('record_scene_fact', { cell: merchantCell, description: 'Cet arc court ordinaire réellement possédé par le marchand est disponible à son prix PHB de 25 po.' })).worldFact
  ok(await call('prepare_phb_launcher_stock', { eventId: 'actual-face-bow-stock', itemId: 'actual-face-shortbow', merchantId: 'actual-face-bow-merchant',
    weaponId: 'shortbow', name: 'Arc court réel', physicalFactId: fact.id, actualInitialStockConfirmed: true }))
  ok(await call('create_treasure', { treasureId: 'actual-face-bow-coins', name: 'Pièces réelles', description: 'Les 25 po réellement présentes sont ramassées pour cet achat.',
    cell: before.player.position, mode: 'authored', coins: { gp: 25 } }))
  ok(await call('collect_treasure', { treasureId: 'actual-face-bow-coins' }))
  ok(await call('create_trade_offer', { offerId: 'actual-face-bow-offer', merchantId: 'actual-face-bow-merchant', itemIds: ['actual-face-shortbow'],
    priceCp: 2500, agreementFactId: fact.id, actualAgreementConfirmed: true }))
  ok(await call('equip_item', { itemId: 'longsword', operation: 'unequip', slot: 'main_hand' }))
  ok(await call('purchase_trade_offer', { eventId: 'actual-face-bow-purchase', offerId: 'actual-face-bow-offer', paid: { gp: 25 }, workSeconds: 6,
    activitySource: 'Les vraies pièces sont échangées contre cet arc court pendant six secondes.' }))
  ok(await call('create_ammunition', { itemId: 'actual-face-arrows', ammunitionType: 'arrow', quantity: 4, name: 'Quatre flèches réelles',
    description: 'Quatre flèches ordinaires réellement au sol, prises explicitement.', cell: f.start }))
  ok(await call('pick_up_item', { itemId: 'actual-face-arrows' }))
  ok(await call('equip_item', { itemId: 'shield', operation: 'unequip', slot: 'shield' }))
  ok(await call('equip_item', { itemId: 'actual-face-shortbow', operation: 'equip', slot: 'main_hand' }))
  return { call, f, shot: { eventId: 'actual-near-face-arrow', objectId: f.hedgeId, action: 'attack', weaponId: 'actual-face-shortbow',
    ammunitionItemId: 'actual-face-arrows', targetCell: f.face } }
}

test('a real thrown slashing weapon lands at the selected second hedge cell and SQL replay never duplicates the throw', async t => {
  const call = await engine(t, { dice: '20,14,6,17' }), f = await prepareRazorvine(call)
  assert.ok((await call('get_game_state')).player.inventory.some(item => item.id === 'handaxe'))
  ok(await call('equip_item', { itemId: 'longsword', operation: 'unequip', slot: 'main_hand' }))
  ok(await call('equip_item', { itemId: 'handaxe', operation: 'equip', slot: 'main_hand' }))
  ok(await call('enter_combat', f.approach))
  const input = { eventId: 'actual-near-face-handaxe', objectId: f.hedgeId, action: 'attack', weaponId: 'handaxe', attackMode: 'thrown', targetCell: f.face }
  await refused(call, 'interact_object', { ...input, targetCell: f.anchor }, 'RAZORVINE_RANGED_FAR_FACE')
  const result = ok(await call('interact_object', input))
  assert.equal(result.hit, true)
  assert.equal(result.damageType, 'slashing')
  assert.ok(result.damageDealt > 0)
  assert.deepEqual(result.razorvineRay.rayCells, [f.start, f.face])
  assert.deepEqual(result.thrownItem.position, f.face)
  assert.notDeepEqual(result.thrownItem.position, f.anchor)
  const saved = await call('get_game_state')
  assert.ok(!saved.player.inventory.some(item => item.id === 'handaxe'))
  assert.deepEqual(saved.droppedItems.handaxe.position, f.face)
  assert.deepEqual(saved.dmTools.razorvine?.contacts ?? {}, {})
  const fresh = await restoreRazorvine(t, saved, '17')
  assert.equal(ok(await fresh('interact_object', input)).replayed, true)
  assert.deepEqual(await fresh('get_game_state'), saved)
  assert.equal(await marker(fresh), 17)
})

test('a bought bow expends one real arrow toward its chosen face while the DMG piercing immunity preserves hedge HP', async t => {
  const { call, f, shot } = await bowFixture(t, '20,14,6,17')
  ok(await call('enter_combat', f.approach))
  await refused(call, 'interact_object', { ...shot, targetCell: undefined }, 'RAZORVINE_ATTACK_FACE_REQUIRED')
  await refused(call, 'interact_object', { ...shot, targetCell: f.anchor }, 'RAZORVINE_RANGED_FAR_FACE')
  const hit = ok(await call('interact_object', shot))
  assert.equal(hit.hit, true)
  assert.equal(hit.damageDealt, 0)
  assert.equal(hit.object.hp.current, 25)
  assert.ok(hit.damageResolution.components[0].immune)
  assert.deepEqual(hit.ammunition.targetCell, f.face)
  assert.equal((await call('get_game_state')).player.inventory.find(item => item.id === 'actual-face-arrows').quantity, 3)
  const saved = await call('get_game_state'), fresh = await restoreRazorvine(t, saved, '17')
  assert.equal(ok(await fresh('interact_object', shot)).replayed, true)
  assert.deepEqual(await fresh('get_game_state'), saved)
  assert.equal(await marker(fresh), 17)
})

test('total cover anchored to the second hedge face survives SQL and refuses before any arrow, action or die', async t => {
  const { call, f, shot } = await bowFixture(t, '20,17')
  const cover = { coverId: 'actual-second-face-total-cover', operation: 'set', originId: 'player', targetId: f.hedgeId,
    targetCell: f.face, obstacleCell: f.face, degree: 'total', reason: 'Le MJ constate le vrai panneau opaque devant cette face précise, sans déplacer ni créer un obstacle par ce choix de couverture.' }
  const configured = ok(await call('configure_cover', cover))
  assert.deepEqual(configured.declaration.targetCell, f.face)
  assert.equal(configured.cover.degree, 'total')
  assert.equal(ok(await call('inspect_cover', { originId: 'player', targetId: f.hedgeId, targetCell: f.face })).degree, 'total')
  assert.equal(ok(await call('inspect_cover', { originId: 'player', targetId: f.hedgeId, targetCell: f.anchor })).degree, 'none')
  ok(await call('enter_combat', f.approach))
  const saved = await call('get_game_state'), fresh = await restoreRazorvine(t, saved, '17')
  assert.deepEqual((await fresh('get_game_state')).dmTools.cover.records[cover.coverId].targetCell, f.face)
  await refused(fresh, 'interact_object', shot, 'COVER_TOTAL')
  assert.equal(await marker(fresh), 17)
})


test('a real non45degree oblique face ray refuses before weapon, action or dice', async t => {
  const call = await engine(t, { dice: '17' }), f = await prepareRazorvine(call)
  ok(await call('equip_item', { itemId: 'longsword', operation: 'unequip', slot: 'main_hand' }))
  ok(await call('equip_item', { itemId: 'handaxe', operation: 'equip', slot: 'main_hand' }))
  const sideOfStart = { x:f.start.x+f.neighbor.x-f.face.x, y:f.start.y+f.neighbor.y-f.face.y }
  ok(await call('move_token', { tokenId: 'player', toCell: sideOfStart }))
  const input = { eventId: 'actual-unrepresented-face-ray', objectId: f.hedgeId, action: 'attack', weaponId: 'handaxe', attackMode: 'thrown', targetCell: f.anchor }
  await refused(call, 'interact_object', input, 'RAZORVINE_RANGED_FACE_REQUIRED')
  assert.equal(await marker(call), 17)
})


test('a genuinely first-observed elevated shooter cannot substitute an XY-only hedge projectile ray', async t => {
  const call = await engine(t, { dice: '17' }), f = await prepareRazorvine(call, { standPlayer: false })
  ok(await call('equip_item', { itemId: 'longsword', operation: 'unequip', slot: 'main_hand' }))
  ok(await call('equip_item', { itemId: 'handaxe', operation: 'equip', slot: 'main_hand' }))
  const state = await call('get_game_state')
  ok(await call('record_vertical_surface', { eventId: 'actual-high-thrower-support-record', surfaceId: 'actual-high-thrower-support',
    mapId: state.currentMapId, roomId: state.currentRoomId, cells: [state.player.position], kind: 'support', elevationFeet: 20,
    actualGeometryConfirmed: true, source: 'Le vrai support actuel encore non observé du tireur est mesuré à vingt pieds dans cette colonne.' }))
  ok(await call('observe_standing_surface', { eventId: 'actual-high-thrower-standing', entityId: 'player', surfaceId: 'actual-high-thrower-support',
    actualCurrentSupportConfirmed: true, source: 'Première observation du tireur réellement appuyé sur son support à vingt pieds, sans déplacement inventé.' }))
  const input = { eventId: 'actual-high-face-ray', objectId: f.hedgeId, action: 'attack', weaponId: 'handaxe', attackMode: 'thrown', targetCell: f.face }
  await refused(call, 'interact_object', input, 'RAZORVINE_RANGED_SUPPORT_REQUIRED')
  assert.equal(await marker(call), 17)
})
// Controlled unit complement. The initial Bardic reserve is a declared fixture,
// not a public grant. All inventory, payment, ammunition and hedge are obtained
// through bowFixture; no pending outcome or projectile receipt is injected.
test('controlled preexisting Bardic fixture keeps its original held face ray through SQL and rejects a changed support before a bonus die', async t => {
  const { call, f, shot } = await bowFixture(t, '20')
  ok(await call('enter_combat', f.approach))
  const { saveSession, loadSession, deleteSession } = require('../lib/session-store.ts')
  const gs = require('../mcp-server/dist/mcp-server/game-state.js')
  const { attackSceneObject, validateHeldObjectWeaponAttack } = require('../mcp-server/dist/mcp-server/object-weapon-attacks.js')
  const { rollDice } = require('../mcp-server/dist/mcp-server/dice.js')
  gs.replaceState(await call('get_game_state'))
  gs.getState().hero.inspiration.push({ targetId: 'player', die: 8, expiresAt: gs.getState().worldTimeSeconds + 600 })
  const priorDice = process.env.AI_DM_TEST_DICE_SEQUENCE
  process.env.AI_DM_TEST_DICE_SEQUENCE = '8,19'
  t.after(() => { if (priorDice === undefined) delete process.env.AI_DM_TEST_DICE_SEQUENCE; else process.env.AI_DM_TEST_DICE_SEQUENCE = priorDice })
  const { action, ...input } = shot
  const heldResult = JSON.parse(attackSceneObject(input).content[0].text)
  const pending = heldResult.pendingReaction
  assert.deepEqual(pending.roll.rolls, [8])
  assert.deepEqual(pending.command.context.razorvineRay.face, f.face)
  const state = structuredClone(gs.getState()), id = 'controlled-razorvine-held-' + process.pid
  t.after(() => deleteSession(id))
  await saveSession(id, { gameState: state, history: [], adventureId: state.adventureId, characterId: state.characterId })
  gs.replaceState((await loadSession(id)).gameState)
  validateHeldObjectWeaponAttack(gs.getState().hero.pending.command)
  assert.deepEqual(gs.getState().hero.pending.roll, pending.roll)
  assert.equal(gs.getState().player.inventory.find(item => item.id === shot.ammunitionItemId).quantity, 3)
  assert.equal(Object.keys(gs.getState().dmTools.ammunition.expenditures).length, 1)
  gs.getState().dmTools.jumping.surfaces['actual-razorvine-terrain'].source += ' Changed unit support witness.'
  assert.throws(() => validateHeldObjectWeaponAttack(gs.getState().hero.pending.command), error => error.code === 'RAZORVINE_HELD_RAY_CHANGED')
  assert.equal(rollDice('1d20').total, 19)
})


test('a fifteen-foot measured face ray uses all real intermediate supports and a new intervening obstacle blocks its next arrow atomically', async t => {
  const { call, f, shot } = await bowFixture(t, '14,6,17', { distanceCells: 3 })
  const hit = ok(await call('interact_object', shot))
  assert.equal(hit.hit, true)
  assert.equal(hit.rangedContext.distanceCells, 3)
  assert.equal(hit.razorvineRay.rayCells.length, 4)
  assert.deepEqual(hit.razorvineRay.rayCells, f.rayCells)
  assert.deepEqual(hit.ammunition.targetCell, f.face)
  ok(await call('create_scene_object', { objectId: 'actual-intervening-ray-block', name: 'Obstacle réel',
    description: 'Ce bloc de pierre existe réellement au milieu du rayon cardinal mesuré.', cell: f.rayCells[1],
    kind: 'obstacle', material: 'stone', size: 'small', resilience: 'resilient' }))
  await refused(call, 'interact_object', { ...shot, eventId: 'actual-now-blocked-face-shot' }, 'RAZORVINE_RANGED_PATH_BLOCKED')
  assert.equal(await marker(call), 17)
})

test('a missing intermediate support measurement rejects a fifteen-foot shot before its original arrow or die', async t => {
  const { call, shot } = await bowFixture(t, '17', { distanceCells: 3, measureRay: false })
  await refused(call, 'interact_object', shot, 'RAZORVINE_RANGED_PLANE_REQUIRED')
  assert.equal(await marker(call), 17)
})
