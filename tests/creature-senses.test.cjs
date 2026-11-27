const test = require('node:test'), assert = require('node:assert/strict')
const { nativeCreatureSenses, resolveSenseFacets, resolveCreaturePerception } = require('../mcp-server/dist/lib/creature-senses.js')
const { getMonsterRecord } = require('../mcp-server/dist/lib/srd/monsters.js')
const { lightingRay } = require('../mcp-server/dist/lib/lighting.js')
const { getMapSpec } = require('../mcp-server/dist/lib/adventure-map.js')
const { engine, ok, replace, adjacent, grid } = require('./helpers/mcp-toolkit.cjs')

const native = type => ({ ...structuredClone(getMonsterRecord(type).engine), id: type, position: { x: 0, y: 0 }, isAlive: true })
const spawnNative = async (call, type) => ok(await call('spawn_monster', {
  monsterType: type, cell: adjacent(await call('get_game_state'))[0],
}))
const facts = patch => ({ distanceFeet: 5, pathClear: true, totalCover: false, inactive: false,
  blinded: false, deafened: false, targetInvisible: false, seesInvisible: false, perceivedIllumination: 'bright', ...patch })
// Bare ranges test rule formulas, not invented creature statistics or a
// fabricated source record. MCP can never receive or grant these profiles.
const formulaProfile = patch => ({ blindsightFeet: 0, darkvisionFeet: 0, tremorsenseFeet: 0, truesightFeet: 0,
  blindBeyondBlindsight: false, blindsightRequiresHearing: false, unsupportedNativeSenses: [], ...patch })

test('native senses match the frozen actual Grick and Violet Fungus sources', () => {
  const grick = nativeCreatureSenses(native('grick')), fungus = nativeCreatureSenses(native('violet_fungus'))
  assert.equal(grick.darkvisionFeet, 60); assert.equal(grick.blindsightFeet, 0)
  assert.equal(fungus.blindsightFeet, 30); assert.equal(fungus.blindBeyondBlindsight, true)
  assert.equal(fungus.truesightFeet, 0); assert.equal(fungus.tremorsenseFeet, 0)
  assert.equal(fungus.nativeSource.sha256, getMonsterRecord('violet_fungus').sourceSha256)
  assert.equal(fungus.nativeSource.url, getMonsterRecord('violet_fungus').sourceUrl)
})

test('actual naturally blind source perceives inside its inclusive radius and never gains bright-light sight outside', () => {
  const profile = nativeCreatureSenses(native('violet_fungus')), before = structuredClone(profile)
  const seen = resolveSenseFacets(profile, facts({ distanceFeet: 30, blinded: true, targetInvisible: true, perceivedIllumination: 'darkness' }))
  assert.equal(seen.canSee, true); assert.equal(seen.mode, 'blindsight'); assert.equal(seen.reliesOnSight, false)
  const unseen = resolveSenseFacets(profile, facts({ distanceFeet: 35 }))
  assert.equal(unseen.canSee, false); assert.equal(unseen.reason, 'naturally-blind-outside-usable-blindsight')
  for (const patch of [{ pathClear: false }, { totalCover: true }, { inactive: true }])
    assert.equal(resolveSenseFacets(profile, facts(patch)).canSee, false)
  assert.deepEqual(profile, before)
})

test('truesight formula handles only visibility, with range, blindness, physical obstruction and non-darkness obscuration intact', () => {
  const profile = formulaProfile({ truesightFeet: 60 })
  const darkInvisible = facts({ distanceFeet: 60, targetInvisible: true, perceivedIllumination: 'darkness', magicalDarkness: true })
  assert.equal(resolveSenseFacets(profile, darkInvisible).mode, 'truesight')
  for (const patch of [{ distanceFeet: 65 }, { blinded: true }, { pathClear: false }, { totalCover: true }, { heavyObscuration: true }])
    assert.equal(resolveSenseFacets(profile, { ...darkInvisible, ...patch }).canSee, false)
  assert.equal(resolveSenseFacets(profile, facts({ distanceFeet: NaN })).reason, 'invalid-distance')
})

test('hearing-dependent blindsight formula honors deafened; tremorsense never becomes visual targeting', () => {
  const echo = formulaProfile({ blindsightFeet: 30, blindsightRequiresHearing: true, blindBeyondBlindsight: true })
  assert.equal(resolveSenseFacets(echo, facts({ blinded: true, perceivedIllumination: 'darkness' })).canSee, true)
  assert.equal(resolveSenseFacets(echo, facts({ deafened: true })).canSee, false)
  const tremor = resolveSenseFacets(formulaProfile({ tremorsenseFeet: 60 }), facts({ perceivedIllumination: 'darkness' }))
  assert.equal(tremor.canSee, false)
  assert.equal(tremor.tremorsenseDetection, 'requires-unmodeled-contact-and-vibration')
})

test('inspection is pure, uses the actual monster sense, and rejects missing IDs without actions or dice', async t => {
  const call = await engine(t, { dice: '19' }), fungus = await spawnNative(call, 'violet_fungus')
  const initial = await call('get_game_state')
  ok(await call('configure_scene_lighting', { roomId: initial.currentRoomId, illumination: 'darkness' }))
  await replace(call, state => { state.monsters[fungus.id].conditions.push('blinded'); state.player.conditions.push('invisible') })
  const before = await call('get_game_state')
  const result = ok(await call('inspect_creature_senses', { observerId: fungus.id, targetId: 'player' }))
  assert.equal(result.canSee, true); assert.equal(result.mode, 'blindsight')
  assert.equal(result.profile.blindsightFeet, 30); assert.equal(result.colorRecognition, false)
  assert.equal(result.obscurationScope.magicalDarkness, 'not-modeled')
  const playerProfile = ok(await call('inspect_creature_senses', { observerId: 'player' }))
  assert.equal(playerProfile.profile.blindsightFeet, 0); assert.equal(playerProfile.profile.truesightFeet, 0)
  assert.equal(playerProfile.profile.nativeSource, undefined)
  assert.equal((await call('inspect_creature_senses', { observerId: 'absent' })).code, 'ENTITY_NOT_FOUND')
  assert.equal((await call('inspect_creature_senses', { observerId: fungus.id, targetId: 'absent' })).code, 'ENTITY_NOT_FOUND')
  assert.deepEqual(await call('get_game_state'), before)
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19)
})

test('a real blindsight creature cannot perceive through a physical wall on the active map', async t => {
  const call = await engine(t), fungus = await spawnNative(call, 'violet_fungus')
  const state = await call('get_game_state'), actor = state.monsters[fungus.id], nav = grid(state), map = getMapSpec(state.currentMapId, state)
  let blocked
  for (let y = 0; y < map.grid.rows && !blocked; y++) for (let x = 0; x < map.grid.cols && !blocked; x++) {
    const cell = { x, y }
    if (nav.free(cell, false) && !lightingRay(state, actor.position, cell)) blocked = cell
  }
  assert.ok(blocked, 'authored map supplies a physical obstruction')
  // Reposition the existing target in a pure projection, not a new stat block.
  const target = { ...state.player, position: blocked }
  const result = resolveCreaturePerception(state, actor, target, { pathClear: lightingRay(state, actor.position, target.position), totalCover: false })
  assert.equal(result.canSee, false); assert.equal(result.reason, 'physical-path-blocked')
})

test('See Invisibility remains a structured timed effect and alone does not reveal darkness', async t => {
  const call = await engine(t), target = await spawnNative(call, 'grick'), state = await call('get_game_state')
  await replace(call, current => {
    current.monsters[target.id].conditions.push('invisible')
    current.hero.effects.push({ id: 'structured-see-invisibility', kind: 'see-invisibility', sourceId: 'player', targetIds: ['player'],
      expiresAt: (current.worldTimeSeconds ?? 0) + 60, data: {} })
  })
  assert.equal(ok(await call('inspect_creature_senses', { observerId: 'player', targetId: target.id })).canSee, true)
  ok(await call('configure_scene_lighting', { roomId: state.currentRoomId, illumination: 'darkness' }))
  assert.equal(ok(await call('inspect_creature_senses', { observerId: 'player', targetId: target.id })).reason, 'darkness')
  await replace(call, current => { current.hero.effects.find(effect => effect.id === 'structured-see-invisibility').expiresAt = current.worldTimeSeconds ?? 0 })
  assert.equal(ok(await call('inspect_creature_senses', { observerId: 'player', targetId: target.id })).reason, 'target-invisible')
})

test('existing engine canSee uses sourced blindsight while strictly visual cell checks remain blind', async t => {
  const call = await engine(t), fungus = await spawnNative(call, 'violet_fungus')
  await replace(call, state => {
    state.monsters[fungus.id].conditions.push('blinded')
    state.player.conditions.push('invisible')
  })
  const projection = await call('get_game_state')
  const gs = require('../mcp-server/dist/mcp-server/game-state.js')
  const { canSee, visibleCell } = require('../mcp-server/dist/mcp-server/monster-perception.js')
  const original = structuredClone(gs.getState())
  try {
    gs.replaceState(projection)
    const observer = gs.getEntity(fungus.id), target = gs.getPlayer()
    assert.equal(canSee(observer, target), true)
    assert.equal(visibleCell(observer, target.position), false)
    assert.ok(observer.conditions.includes('blinded'))
    assert.ok(target.conditions.includes('invisible'))
    observer.hp.current = 0
    assert.equal(canSee(observer, target), false)
  } finally { gs.replaceState(original) }
})
