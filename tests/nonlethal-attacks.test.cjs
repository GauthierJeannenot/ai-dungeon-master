const test = require('node:test'), assert = require('node:assert/strict')
const { engine, ok, replace, spawn, battle } = require('./helpers/mcp-toolkit.cjs')

const heldMain = state => state.dmTools?.loadout?.mainHandId ?? state.player.inventory.find(item => item.type === 'weapon').id
async function setup(t, { characterId = 'fighter', dice = '17,4,2,19', type = 'goblin', hp = 1 } = {}) {
  const call = await engine(t, { characterId, dice }), initial = await call('get_game_state')
  const weapon = heldMain(initial), target = await spawn(call, type)
  await battle(call, [target.id])
  await replace(call, state => { state.monsters[target.id].hp.current = hp })
  return { call, target, weapon }
}
const attack = (call, target, weapon, options = {}) => call('resolve_player_attack', {
  targetId: target.id, weaponOrSpell: weapon, nonlethal: true, ...options,
})

test('an explicit real melee knockout is alive, stable, prone, persisted, and never recorded as a death', async t => {
  const { call, target, weapon } = await setup(t), before = await call('get_game_state')
  const answer = ok(await attack(call, target, weapon)), state = await call('get_game_state'), body = state.monsters[target.id]
  assert.equal(answer.hit, true); assert.equal(answer.targetDied, false); assert.equal(answer.targetKnockedOut, true)
  assert.equal(body.hp.current, 0); assert.equal(body.isAlive, true)
  assert.deepEqual(body.knockout, { stable: true, sourceId: 'player', attackEventId: answer.primaryAttackId, at: before.worldTimeSeconds,
    recovery:{hours:2,wakeAt:before.worldTimeSeconds+7200} })
  assert.ok(body.conditions.includes('unconscious')); assert.ok(body.conditions.includes('prone'))
  assert.deepEqual(body.position, before.monsters[target.id].position)
  assert.equal(state.hero.corpseTimes[target.id], undefined)
  assert.deepEqual(state.player.inventory, before.player.inventory)
  assert.deepEqual(state.dmTools.loadout, before.dmTools.loadout)
  assert.equal(state.hero.actionCredits, before.hero.actionCredits - 1)
  ok(await call('replace_game_state', { gameState: state })); assert.deepEqual(await call('get_game_state'), state)
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19)
})

test('nonlethal declaration grants no extra damage or knockout before actual zero HP', async t => {
  const { call, target, weapon } = await setup(t, { hp: 200,dice:'17,4,19' })
  const answer = ok(await attack(call, target, weapon)), state = await call('get_game_state')
  assert.equal(answer.targetKnockedOut, false); assert.equal(answer.targetDied, false)
  assert.equal(state.monsters[target.id].hp.current, 200 - answer.damageDealt)
  assert.equal(state.monsters[target.id].knockout, undefined)
  assert.ok(!state.monsters[target.id].conditions.includes('unconscious'))
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19)
})

test('ordinary melee damage still kills ordinary monsters at zero and knockout cannot revive them afterward', async t => {
  const { call, target, weapon } = await setup(t)
  const answer = ok(await attack(call, target, weapon, { nonlethal: false })), before = await call('get_game_state')
  assert.equal(answer.targetDied, true); assert.equal(before.monsters[target.id].isAlive, false)
  assert.equal(before.monsters[target.id].knockout, undefined)
  assert.equal((await attack(call, target, weapon)).code, 'NONLETHAL_LIVING_TARGET_REQUIRED')
  assert.deepEqual(await call('get_game_state'), before)
})

async function equip(call, equipmentId) {
  const initial = await call('get_game_state'), main = heldMain(initial), id = `nonlethal-${equipmentId}`
  const actors = initial.initiativeOrder.filter(id => id !== 'player')
  await replace(call, state => Object.assign(state, { phase: 'exploration', currentTurn: null, initiativeOrder: [], round: 0 }))
  ok(await call('equip_item', { itemId: main, slot: 'main_hand', operation: 'unequip' }))
  // Unequipping the legacy main hand establishes its real inferred loadout.
  // Read that result before freeing the worn shield for a two-handed bow.
  const freed = await call('get_game_state'), shield = freed.dmTools?.loadout?.shieldId
  if (shield) ok(await call('equip_item', { itemId: shield, slot: 'shield', operation: 'unequip' }))
  await replace(call, state => state.player.inventory.push({ id, equipmentId, name: equipmentId, type: 'weapon' }))
  ok(await call('equip_item', { itemId: id, slot: 'main_hand', operation: 'equip' }))
  await battle(call, actors)
  return id
}

test('ranged, explicitly thrown and source-immune knockout requests refuse without dice, HP or action costs', async t => {
  for (const kind of ['ranged', 'thrown', 'immune']) {
    await t.test(kind, async t => {
      const { call, target, weapon } = await setup(t, { type: kind === 'immune' ? 'will_o_wisp' : 'goblin', dice: '19' })
      const selected = kind === 'immune' ? weapon : await equip(call, kind === 'ranged' ? 'shortbow' : 'dagger')
      const before = await call('get_game_state')
      const answer = await attack(call, target, selected, kind === 'thrown' ? { attackMode: 'thrown' } : {})
      assert.equal(answer.code, kind === 'immune' ? 'NONLETHAL_CONDITION_IMMUNE' : 'NONLETHAL_MELEE_REQUIRED')
      assert.deepEqual(await call('get_game_state'), before)
      assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19)
    })
  }
})

test('hydration allows only the explicit stable unconscious exception, never generic alive-zero HP', async t => {
  const { call, target, weapon } = await setup(t)
  const original = await call('get_game_state'), forged = structuredClone(original)
  forged.monsters[target.id].hp.current = 0
  assert.ok((await call('replace_game_state', { gameState: forged })).error)
  assert.deepEqual(await call('get_game_state'), original)
  ok(await attack(call, target, weapon)); const saved = await call('get_game_state')
  for (const mutate of [
    body => { body.conditions = body.conditions.filter(condition => condition !== 'unconscious') },
    body => { body.isAlive = false },
    body => { body.hp.current = 1 },
  ]) {
    const invalid = structuredClone(saved); mutate(invalid.monsters[target.id])
    assert.ok((await call('replace_game_state', { gameState: invalid })).error)
    assert.deepEqual(await call('get_game_state'), saved)
  }
})

test('KO leaves a real occupied body, skips active initiative, and ends combat with XP exactly once', async t => {
  const { call, target, weapon } = await setup(t, { dice: '17,4,2,17,16,4,2,19' })
  ok(await attack(call, target, weapon))
  const after = await call('get_game_state')
  const { navigationGrid } = require('../mcp-server/dist/lib/navigation.js')
  const { getMapSpec } = require('../mcp-server/dist/lib/adventure-map.js')
  const grid = navigationGrid(after, 'player', getMapSpec(after.currentMapId, after).geometry)
  assert.ok(!grid.step(after.player.position, after.monsters[target.id].position))
  const next = ok(await call('next_turn', { actorId: 'player' }))
  assert.ok(next.initiativeOrder.includes(target.id), 'a living body retains its assigned slot for a possible real heal')
  assert.equal(next.currentTurn, 'player')
  const ended = ok(await call('end_combat'))
  assert.equal(ended.xpAwarded, after.monsters[target.id].xpValue)
  let state = await call('get_game_state')
  assert.equal(state.monsters[target.id].isAlive, true); assert.equal(state.monsters[target.id].xpAwarded, true)
  ok(await call('update_hp', { entityId: target.id, delta: 1, reason: 'Soin réel de la créature assommée.' }))
  await battle(call, [target.id])
  ok(await attack(call, target, weapon)); assert.equal(ok(await call('end_combat')).xpAwarded, 0)
  state = await call('get_game_state'); assert.equal(state.monsters[target.id].isAlive, true)
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19)
})

test('actual healing wakes the living zero-HP target without standing it or inventing held equipment', async t => {
  const { call, target, weapon } = await setup(t, { characterId: 'cleric', dice: '17,4,2,3,19' })
  ok(await attack(call, target, weapon)); ok(await call('end_combat'))
  ok(await call('equip_item', { itemId: weapon, slot: 'main_hand', operation: 'unequip' }))
  const before = await call('get_game_state')
  ok(await call('cast_spell', { spellId: 'cure-wounds', targetId: target.id }))
  const after = await call('get_game_state'), body = after.monsters[target.id]
  assert.ok(body.hp.current > 0); assert.equal(body.isAlive, true); assert.equal(body.knockout, undefined)
  assert.ok(!body.conditions.includes('unconscious')); assert.ok(body.conditions.includes('prone'))
  assert.deepEqual(body.position, before.monsters[target.id].position)
  assert.deepEqual(after.dmTools.loadout, before.dmTools.loadout); assert.deepEqual(after.droppedItems, before.droppedItems)
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19)
})

test('actual further damage breaks stable KO and critical failures kill; corpse spells/healing still refuse before costs or dice', async t => {
  const { call, target, weapon } = await setup(t, { characterId: 'wizard', dice: '17,4,2,19' })
  ok(await attack(call, target, weapon)); ok(await call('end_combat'))
  ok(await call('update_hp',{entityId:target.id,delta:-1,reason:'Nouveau dégât explicite.'}))
  let state=await call('get_game_state')
  assert.equal(state.monsters[target.id].knockout,undefined);assert.equal(state.monsters[target.id].npcLife.episode.status,'dying')
  assert.equal(state.monsters[target.id].npcLife.episode.failures,1);assert.equal(state.monsters[target.id].npcLife.episode.recovery,undefined)
  ok(await call('update_hp',{entityId:target.id,delta:-1,critical:true,reason:'Véritable dégât critique à zéro.'}))
  state=await call('get_game_state');assert.equal(state.monsters[target.id].isAlive,false);assert.equal(state.monsters[target.id].npcLife.episode.failures,3)
  assert.equal(state.hero.corpseTimes[target.id],state.worldTimeSeconds)
  assert.equal((await attack(call,target,weapon,{nonlethal:false})).code,'NOT_IN_COMBAT')
  assert.equal((await call('cast_spell',{spellId:'magic-missile',targetId:target.id})).code,'ENTITY_DEAD')
  assert.equal((await call('update_hp',{entityId:target.id,delta:1,reason:'Le soin ordinaire ne ressuscite pas.'})).code,'ENTITY_DEAD')
  assert.deepEqual(await call('get_game_state'),state)
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19)
})

test('a held reaction retains the declared knockout and resolves its original attack dice once after hydration', async t => {
  const { call, target, weapon } = await setup(t, { dice: '15,2,4,2,19' })
  await replace(call, state => state.hero.inspiration.push({ targetId: 'player', die: 8, expiresAt: state.worldTimeSeconds + 600 }))
  const held = ok(await attack(call, target, weapon)); assert.ok(held.pendingReaction)
  assert.equal(held.pendingReaction.command.nonlethal, true)
  const state = await call('get_game_state'); ok(await call('replace_game_state', { gameState: state }))
  const answer = ok(await call('resolve_reaction', { pendingId: held.pendingReaction.id, choice: 'bardic_inspiration' }))
  assert.equal(answer.attackRoll.rolls[0], 15); assert.equal(answer.targetKnockedOut, true); assert.equal(answer.targetDied, false)
  assert.equal((await call('get_game_state')).hero.pending, undefined)
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19)
})

test('Extra Attack prevalidates later nonlethal choices before its first roll and skips a target already knocked out by that sequence', async t => {
  const { call, target, weapon } = await setup(t)
  const ranged = await equip(call, 'shortbow')
  await replace(call,state=>state.player.inventory.push({id:'nonlethal-case-arrows',equipmentId:'arrows',ammunitionType:'arrow',quantity:2,name:'Flèches réelles de ce cas',type:'misc'}))
  const before = await call('get_game_state')
  const refused = await call('resolve_player_multiattack', { attacks: [
    { targetId: target.id, weaponOrSpell: ranged, ammunitionItemId:'nonlethal-case-arrows' }, { targetId: target.id, weaponOrSpell: ranged, ammunitionItemId:'nonlethal-case-arrows', nonlethal: true },
  ] })
  assert.equal(refused.code, 'NONLETHAL_MELEE_REQUIRED'); assert.deepEqual(await call('get_game_state'), before)
  await replace(call, state => Object.assign(state, { phase: 'exploration', currentTurn: null, initiativeOrder: [], round: 0 }))
  ok(await call('equip_item', { itemId: ranged, slot: 'main_hand', operation: 'unequip' }))
  ok(await call('equip_item', { itemId: weapon, slot: 'main_hand', operation: 'equip' }))
  await battle(call, [target.id])
  const answer = ok(await call('resolve_player_multiattack', { attacks: [
    { targetId: target.id, weaponOrSpell: weapon, nonlethal: true }, { targetId: target.id, weaponOrSpell: weapon, nonlethal: true },
  ] }))
  assert.equal(answer.attacks[0].targetKnockedOut, true); assert.equal(answer.attacks[1].skipped, 'target_defeated')
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19)
})

test('the off-hand knockout keeps the exact trigger, charges its bonus action once and rejects a replay changing lethal intent', async t => {
  const { call, target } = await setup(t, { characterId: 'wizard', hp: 200, dice: '17,3,17,4,2,19' })
  const left = await equip(call, 'dagger')
  await replace(call, state => state.player.inventory.push({ id: 'nonlethal-offhand', equipmentId: 'dagger', name: 'Dague gauche réelle', type: 'weapon' }))
  ok(await call('equip_item', { itemId: 'nonlethal-offhand', slot: 'off_hand', operation: 'equip' }))
  const primary = ok(await attack(call, target, left, { nonlethal: false }))
  assert.equal(primary.twoWeaponEligibility.otherItemId, 'nonlethal-offhand')
  await replace(call, state => { state.monsters[target.id].hp.current = 1 })
  const input = { attackId: 'offhand-knockout', primaryAttackId: primary.primaryAttackId, weaponItemId: 'nonlethal-offhand', targetId: target.id, attackMode: 'melee', nonlethal: true }
  const answer = ok(await call('resolve_two_weapon_attack', input)), after = await call('get_game_state')
  assert.equal(answer.targetKnockedOut, true); assert.equal(answer.targetDied, false); assert.equal(after.bonusActionUsed.player, true)
  assert.equal(ok(await call('resolve_two_weapon_attack', input)).alreadyResolved, true)
  assert.equal((await call('resolve_two_weapon_attack', { ...input, nonlethal: false })).code, 'TWO_WEAPON_EVENT_CONFLICT')
  assert.deepEqual(await call('get_game_state'), after)
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19)
})

test('an established burning target and a pending damaging poison reject knockout before a die or an action', async t => {
  for (const kind of ['fire', 'poison']) await t.test(kind, async t => {
    const { call, target, weapon } = await setup(t, { dice: '19' })
    await replace(call, state => {
      if (kind === 'fire') state.dmTools.weaponConsumables = { receipts: {}, burning: {
        [target.id]: { targetId: target.id, sourceId: 'player', itemId: 'established-fire-flask', useId: 'established-fire-hit', startedAt: 0 },
      } }
      else state.dmTools.afflictions = { sources: {}, ointments: {}, records: { 'established-poison': {
        id: 'established-poison', sourceId: 'established-dose', targetId: target.id, templateId: 'midnight_tears', eventId: 'established-ingestion',
        creation: 'Dose ingérée avant cette attaque.', status: 'pending', appliedAt: 0, nextAt: state.worldTimeSeconds + 3600,
        successes: 0, lastTurn: -1, unhealableDamage: 0, sightPenalty: 0, ointmentDoses: 0, ointmentPending: false,
      } } }
    })
    const before = await call('get_game_state'), answer = await attack(call, target, weapon)
    assert.equal(answer.code, 'NONLETHAL_ONGOING_DAMAGE_UNSUPPORTED')
    assert.equal(answer.detail[kind === 'fire' ? 'burning' : 'affliction'], true)
    assert.deepEqual(await call('get_game_state'), before)
    assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19)
  })
})

test('a later selected target with ongoing damage refuses the entire Extra Attack before the first target is damaged', async t => {
  const { call, target, weapon } = await setup(t, { dice: '19' })
  await replace(call,state=>Object.assign(state,{phase:'exploration',currentTurn:null,initiativeOrder:[],round:0}))
  const other = await spawn(call)
  await battle(call, [target.id, other.id])
  await replace(call, state => { state.dmTools.weaponConsumables = { receipts: {}, burning: {
    [other.id]: { targetId: other.id, sourceId: 'player', itemId: 'established-fire-flask', useId: 'established-fire-hit', startedAt: 0 },
  } } })
  const before = await call('get_game_state')
  const answer = await call('resolve_player_multiattack', { attacks: [
    { targetId: target.id, weaponOrSpell: weapon }, { targetId: other.id, weaponOrSpell: weapon, nonlethal: true },
  ] })
  assert.equal(answer.code, 'NONLETHAL_ONGOING_DAMAGE_UNSUPPORTED')
  assert.deepEqual(await call('get_game_state'), before)
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19)
})

async function roster(t, dice = '17,4,2,20,1,19') {
  const fixture = await setup(t, { dice }), { call, target } = fixture
  await replace(call,state=>Object.assign(state,{phase:'exploration',currentTurn:null,initiativeOrder:[],round:0}))
  const helper = await spawn(call, 'commoner')
  await battle(call, [target.id, helper.id])
  await replace(call, state => {
    state.player.initiative = 18; state.monsters[target.id].initiative = 13; state.monsters[helper.id].initiative = 8
  })
  ok(await attack(call, target, fixture.weapon))
  return { ...fixture, helper }
}
const healOne = (call, id) => call('update_hp', { entityId: id, delta: 1, reason: 'Soin réel à la place temporelle établie.' })

test('healing before the original initiative slot reactivates that future slot without changing the healer turn', async t => {
  const { call, target } = await roster(t), before = await call('get_game_state')
  ok(await healOne(call, target.id)); const after = await call('get_game_state')
  assert.equal(after.currentTurn, 'player'); assert.equal(after.turnCounter, before.turnCounter)
  assert.deepEqual(after.initiativeOrder, before.initiativeOrder)
  assert.equal(ok(await call('next_turn', { actorId: 'player' })).currentTurn, target.id)
  assert.equal((await call('get_game_state')).round, 1)
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 20)
})

test('healing after the original slot does not rewind initiative or give an immediate extra turn', async t => {
  const { call, target, helper } = await roster(t)
  assert.equal(ok(await call('next_turn', { actorId: 'player' })).currentTurn, helper.id)
  const before = await call('get_game_state'); ok(await healOne(call, target.id))
  const after = await call('get_game_state')
  assert.equal(after.currentTurn, helper.id); assert.equal(after.round, 1); assert.equal(after.turnCounter, before.turnCounter)
  assert.deepEqual(after.initiativeOrder, before.initiativeOrder)
  const next = ok(await call('next_turn', { actorId: helper.id, skipAction: true, reason: 'Le témoin attend explicitement.' }))
  assert.equal(next.round, 2, 'the recovered target cannot act until the next cycle has begun')
})

test('an entire round while KO preserves its actual initiative value and hydrated slot for later healing', async t => {
  const { call, target, helper } = await roster(t)
  ok(await call('next_turn', { actorId: 'player' }))
  const round = ok(await call('next_turn', { actorId: helper.id, skipAction: true, reason: 'Le témoin attend explicitement.' }))
  assert.equal(round.round, 2); assert.equal(round.currentTurn, 'player')
  const saved = await call('get_game_state')
  assert.equal(saved.monsters[target.id].initiative, 13)
  assert.deepEqual(saved.initiativeOrder, ['player', target.id, helper.id])
  ok(await call('replace_game_state', { gameState: saved })); assert.deepEqual(await call('get_game_state'), saved)
  ok(await healOne(call, target.id)); assert.equal((await call('get_game_state')).currentTurn, 'player')
  assert.equal(ok(await call('next_turn', { actorId: 'player', skipAction: true, reason: 'Le soigneur attend explicitement.' })).currentTurn, target.id)
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 20, 'the next round consumed no new initiative dice')
})

test('a legacy KO without a persisted recovery die refuses its unknown boundary before time/rest mutation, costs or dice', async t => {
  const { call, target, weapon } = await setup(t)
  ok(await attack(call, target, weapon)); ok(await call('end_combat'))
  await replace(call,state=>{delete state.monsters[target.id].knockout.recovery})
  ok(await call('advance_time', { seconds: 3599 }))
  const before = await call('get_game_state')
  assert.equal(before.monsters[target.id].hp.current, 0)
  ok(await call('replace_game_state', { gameState: before }))
  for(const [tool,input] of [
    ['advance_time',{seconds:1}],
    ['take_rest',{kind:'short',hitDice:0}],
    ['take_rest',{kind:'long'}],
  ]) {
    assert.equal((await call(tool,input)).code,'KNOCKOUT_RECOVERY_PENDING')
    assert.deepEqual(await call('get_game_state'),before)
  }
  const skipped=structuredClone(before);skipped.worldTimeSeconds=3600
  assert.ok((await call('replace_game_state',{gameState:skipped})).error)
  assert.deepEqual(await call('get_game_state'),before)
  assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
  ok(await healOne(call,target.id));ok(await call('advance_time',{seconds:1}))
  assert.equal((await call('get_game_state')).monsters[target.id].hp.current,1)
})

test('the legacy conservative combat recovery bound rejects next/pass and monster batch before events, action costs or initiative dice', async t => {
  const { call, target, helper } = await roster(t, '17,4,2,19')
  await replace(call,state=>{delete state.monsters[target.id].knockout.recovery;state.worldTimeSeconds=3595})
  let before=await call('get_game_state')
  for(const [tool,input] of [['next_turn',{actorId:'player'}],['pass_turn',{}]]){
    const answer=await call(tool,input)
    assert.equal(answer.code,'KNOCKOUT_RECOVERY_PENDING');assert.equal(answer.detail.conservativeCombat,true)
    assert.deepEqual(await call('get_game_state'),before)
  }
  await replace(call,state=>{state.currentTurn=helper.id})
  before=await call('get_game_state')
  const answer=await call('run_monster_turns',{holdIds:[helper.id]})
  assert.equal(answer.code,'KNOCKOUT_RECOVERY_PENDING');assert.equal(answer.detail.conservativeCombat,true)
  assert.deepEqual(await call('get_game_state'),before)
  assert.equal(before.monsters[target.id].knockout.at,0)
  assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('a real poison exposure and one-shot trap damage a stable body once and cannot replay their costs or zero-HP failures', async t => {
  const {call,target,weapon}=await setup(t,{dice:'17,4,2,1,1,1,1,15,2,19'})
  ok(await attack(call,target,weapon));ok(await call('end_combat'))
  const state=await call('get_game_state'),cell=state.monsters[target.id].position
  ok(await call('create_affliction_source',{sourceId:'new-ko-dose',templateId:'serpent_venom',name:'Dose réelle après le combat',cell,doses:2}))
  ok(await call('create_trap',{trapId:'new-ko-trap',name:'Mâchoires préparées à la case établie',template:'bear',cell}))
  const prepared=await call('get_game_state'),{getAdventureMap}=require('../mcp-server/dist/lib/adventure-map.js')
  const adventure=getAdventureMap(prepared),otherMap=adventure.maps.find(map=>map.id!==prepared.currentMapId)
  const otherRoom=adventure.rooms.find(room=>room.mapId===otherMap?.id)
  assert.ok(otherMap&&otherRoom,'fixture uses another actual authored map and room')
  for(const placement of ['out-of-reach','other-map']){
    await replace(call,state=>{
      const trap=state.dmTools.traps['new-ko-trap']
      if(placement==='out-of-reach')trap.cell={...state.player.position}
      else {trap.mapId=otherMap.id;trap.roomId=otherRoom.id;trap.cell={...(adventure.entryCells[otherRoom.id]??{x:otherRoom.zone.minX,y:otherRoom.zone.minY})}}
    })
    const before=await call('get_game_state')
    assert.equal((await call('interact_trap',{trapId:'new-ko-trap',action:'trigger',targetId:target.id})).code,'SCENE_TARGET_OUT_OF_REACH')
    assert.deepEqual(await call('get_game_state'),before)
    ok(await call('replace_game_state',{gameState:prepared}))
  }
  const exposure={sourceId:'new-ko-dose',eventId:'new-exposure',targetId:target.id,delivery:'injury'}
  ok(await call('expose_affliction',exposure));ok(await call('interact_trap',{trapId:'new-ko-trap',action:'trigger',targetId:target.id}))
  const after=await call('get_game_state')
  assert.equal(after.dmTools.afflictions.sources['new-ko-dose'].doses,1);assert.equal(after.dmTools.traps['new-ko-trap'].status,'triggered')
  assert.equal(after.monsters[target.id].hp.current,0);assert.equal(after.monsters[target.id].isAlive,true)
  assert.equal(after.monsters[target.id].knockout,undefined);assert.equal(after.monsters[target.id].npcLife.episode.failures,2)
  assert.equal(ok(await call('expose_affliction',exposure)).alreadyResolved,true)
  assert.equal((await call('interact_trap',{trapId:'new-ko-trap',action:'trigger',targetId:target.id})).code,'TRAP_NOT_ARMED')
  assert.deepEqual(await call('get_game_state'),after)
  assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('healing an old KO omitted from a new encounter refuses before dice or slots instead of inventing initiative', async t => {
  const {call,target,weapon}=await setup(t,{characterId:'cleric'})
  ok(await attack(call,target,weapon));ok(await call('end_combat'))
  const helper=await spawn(call,'commoner');await battle(call,[helper.id])
  const before=await call('get_game_state')
  assert.equal((await healOne(call,target.id)).code,'KNOCKOUT_INITIATIVE_NOT_REGISTERED')
  assert.equal((await call('cast_spell',{spellId:'cure-wounds',targetId:target.id})).code,'KNOCKOUT_INITIATIVE_NOT_REGISTERED')
  assert.deepEqual(await call('get_game_state'),before)
  assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
  ok(await call('end_combat',{force:true,reason:'La créature active quitte explicitement la rencontre.'}))
  ok(await healOne(call,target.id));assert.equal((await call('get_game_state')).monsters[target.id].hp.current,1)
})

test('sourced Consume Life can actually kill a KO and clears its stable exception before recording death', async t => {
  const {call,target,weapon}=await setup(t,{dice:'17,4,2,1,1,1,1,19'})
  ok(await attack(call,target,weapon));ok(await call('end_combat'))
  const state=await call('get_game_state'),{grid}=require('./helpers/mcp-toolkit.cjs'),nav=grid(state)
  const cell=nav.neighbors(state.monsters[target.id].position).find(cell=>nav.free(cell))
  assert.ok(cell)
  const source=await spawn(call,'will_o_wisp',cell)
  const answer=ok(await call('use_monster_power',{monsterId:source.id,powerName:'Consume Life',targetId:target.id}))
  assert.equal(answer.killed,true)
  const after=await call('get_game_state')
  assert.equal(after.monsters[target.id].isAlive,false);assert.equal(after.monsters[target.id].knockout,undefined)
  assert.equal(after.hero.corpseTimes[target.id],after.worldTimeSeconds)
  ok(await call('replace_game_state',{gameState:after}))
  assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
