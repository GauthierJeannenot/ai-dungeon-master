const test = require('node:test'), assert = require('node:assert/strict')
const { engine, ok, replace, spawn, battle, adjacent } = require('./helpers/mcp-toolkit.cjs')
const { exhaustionLevel, exhaustionDisadvantage, exhaustionSpeed, setExhaustionLevel, adjustExhaustionMaximum, validateExhaustionState } = require('../mcp-server/dist/lib/exhaustion.js')
const { ExhaustionStateSchema } = require('../mcp-server/dist/lib/exhaustion-state.js')
const { navigationActor } = require('../mcp-server/dist/lib/navigation.js')
const event = (id, levels = 1, targetId = 'player') => ({ eventId: id, levels, targetId, reason: 'Conséquence explicitement arbitrée par le MJ.' })

test('all six cumulative 2014 thresholds are exact; legacy absence means level zero', () => {
  assert.equal(exhaustionLevel({}, 'player'), 0)
  for (let level = 0; level <= 6; level++) {
    const state = { dmTools: { exhaustion: { creatures: { player: { level } }, receipts: {} } } }
    assert.equal(exhaustionDisadvantage(state, 'player', 'check'), level >= 1)
    assert.equal(exhaustionDisadvantage(state, 'player', 'attack'), level >= 3)
    assert.equal(exhaustionDisadvantage(state, 'player', 'save'), level >= 3)
    assert.equal(exhaustionSpeed(state, 'player', 35), level >= 5 ? 0 : level >= 2 ? 17 : 35)
  }
})

test('Aid, drain, restoration and exhaustion crossings compose once and never create current HP', () => {
  const hp = { current: 41, max: 41 }, record = { level: 0 }
  setExhaustionLevel(record, hp, 4); assert.deepEqual(hp, { current: 20, max: 20 })
  adjustExhaustionMaximum(record, hp, 5); assert.deepEqual(hp, { current: 20, max: 23 })
  adjustExhaustionMaximum(record, hp, -9); assert.deepEqual(hp, { current: 18, max: 18 })
  adjustExhaustionMaximum(record, hp, 9); assert.deepEqual(hp, { current: 18, max: 23 })
  adjustExhaustionMaximum(record, hp, -5, 1); assert.deepEqual(hp, { current: 18, max: 20 })
  setExhaustionLevel(record, hp, 3); assert.deepEqual(hp, { current: 18, max: 41 })
  assert.equal(record.unexhaustedHpMax, undefined)
  setExhaustionLevel(record, hp, 4); assert.equal(hp.max, 20)
  setExhaustionLevel(record, hp, 5); assert.equal(hp.max, 20)
  adjustExhaustionMaximum(record, hp, -100); assert.deepEqual(hp, { current: 0, max: 0 })
  assert.equal(record.unexhaustedHpMax, 0)
})

test('persistent schema requires the pre-halving maximum exactly at levels four through six', () => {
  const valid = entry => ExhaustionStateSchema.safeParse({ creatures: { player: entry }, receipts: {} }).success
  assert.equal(valid({ level: 4 }), false)
  assert.equal(valid({ level: 4, unexhaustedHpMax: 41 }), true)
  assert.equal(valid({ level: 3, unexhaustedHpMax: 41 }), false)
  assert.equal(valid({ level: 7 }), false)
})

test('restored exhaustion validates real maxima and markers while legacy booleans remain unresolved without mutation', () => {
  const state = { player: { hp: { current: 10, max: 20 }, conditions: ['exhaustion'] }, monsters: {},
    dmTools: { exhaustion: { creatures: { player: { level: 4, unexhaustedHpMax: 41 } }, receipts: {} } } }
  const before = structuredClone(state)
  assert.equal(validateExhaustionState(state).status, 'valid')
  assert.deepEqual(state, before)
  state.player.hp.max = 21
  assert.equal(validateExhaustionState(state).errors[0].code, 'EXHAUSTION_MAXIMUM_MISMATCH')
  state.player.hp.max = 20; state.player.conditions = []
  assert.equal(validateExhaustionState(state).errors[0].code, 'EXHAUSTION_MARKER_MISMATCH')
  state.player.conditions = ['exhaustion']; delete state.dmTools.exhaustion.creatures.player
  const legacy = validateExhaustionState(state)
  assert.equal(legacy.status, 'unresolved'); assert.equal(legacy.valid, true)
  assert.deepEqual(legacy.unresolvedTargetIds, ['player'])
  assert.equal(Object.keys(state.dmTools.exhaustion.creatures).length, 0)
})

test('archived floor monsters keep exhaustion validation across map restoration; active actors override stale snapshots', () => {
  const monster={hp:{current:10,max:20},conditions:['exhaustion'],isAlive:true}
  const state={currentMapId:'second-floor',player:{hp:{current:20,max:20},conditions:[]},monsters:{},
    sceneMemory:{floorMonsters:{'first-floor':{'floor-creature':monster}}},
    dmTools:{exhaustion:{creatures:{'floor-creature':{level:4,unexhaustedHpMax:41}},receipts:{}}}}
  const before=structuredClone(state)
  assert.equal(validateExhaustionState(state).status,'valid')
  assert.deepEqual(state,before)
  const restored=structuredClone(state)
  restored.currentMapId='first-floor';restored.monsters={'floor-creature':structuredClone(monster)}
  // The old active-floor snapshot must not override a restored live creature.
  restored.sceneMemory.floorMonsters['first-floor']['floor-creature'].hp.max=99
  assert.equal(validateExhaustionState(restored).status,'valid')
  restored.monsters['floor-creature'].hp.max=21
  assert.equal(validateExhaustionState(restored).errors[0].code,'EXHAUSTION_MAXIMUM_MISMATCH')
  state.sceneMemory.floorMonsters['first-floor']['floor-creature'].hp.max=21
  assert.equal(validateExhaustionState(state).errors[0].code,'EXHAUSTION_MAXIMUM_MISMATCH')
})

test('level six rejects living restored actors but accepts an actual archived corpse and player death', () => {
  const state={currentMapId:'current',player:{hp:{current:0,max:20},conditions:['exhaustion'],deathSaves:{dead:true}},monsters:{},
    sceneMemory:{floorMonsters:{old:{corpse:{hp:{current:0,max:10},conditions:['exhaustion','unconscious'],isAlive:false}}}},
    dmTools:{exhaustion:{creatures:{player:{level:6,unexhaustedHpMax:40},corpse:{level:6,unexhaustedHpMax:20}},receipts:{}}}}
  assert.equal(validateExhaustionState(state).status,'valid')
  state.sceneMemory.floorMonsters.old.corpse.isAlive=true
  assert.equal(validateExhaustionState(state).errors[0].code,'EXHAUSTION_DEATH_MISMATCH')
  state.sceneMemory.floorMonsters.old.corpse.isAlive=false
  state.player.deathSaves.dead=false
  assert.equal(validateExhaustionState(state).errors[0].code,'EXHAUSTION_DEATH_MISMATCH')
})

test('a local dungeon passage archives and restores exhausted living monsters and true corpses without losing their levels', async t => {
  const call=await engine(t),living=await spawn(call),corpse=await spawn(call)
  ok(await call('add_exhaustion',event('floor-living',4,living.id)))
  ok(await call('add_exhaustion',event('floor-corpse',6,corpse.id)))
  const origin=await call('get_game_state')
  const layout=ok(await call('generate_dungeon',{seed:'exhaustion-floors',width:3,height:3,count:5})).layout
  const installed=ok(await call('install_dungeon',{dungeonId:'exhaustion-floor',layout,entranceCell:origin.player.position,
    questLink:{goal:'Poursuivre la quête principale.',lead:'Une piste rejoint le témoin recherché.',delivery:'clue',discoveryDc:10}}))
  ok(await call('travel_to_map',{transitionId:installed.entryTransitionId}))
  const away=await call('get_game_state')
  assert.equal(away.monsters[living.id],undefined)
  assert.equal(away.sceneMemory.floorMonsters[origin.currentMapId][living.id].hp.max,origin.monsters[living.id].hp.max)
  assert.equal(away.sceneMemory.floorMonsters[origin.currentMapId][corpse.id].isAlive,false)
  ok(await call('replace_game_state',{gameState:away}))
  ok(await call('travel_to_map',{transitionId:installed.exitTransitionId}))
  const restored=await call('get_game_state')
  assert.equal(restored.currentMapId,origin.currentMapId)
  assert.deepEqual(restored.monsters[living.id],origin.monsters[living.id])
  assert.deepEqual(restored.monsters[corpse.id],origin.monsters[corpse.id])
  assert.equal(restored.monsters[corpse.id].isAlive,false)
  assert.deepEqual(restored.dmTools.exhaustion,origin.dmTools.exhaustion)
  ok(await call('replace_game_state',{gameState:restored}))
  assert.deepEqual(await call('get_game_state'),restored)
})

test('one-way story travel archives exhausted monsters without reactivating them and permits repeated state restoration', async t => {
  const call=await engine(t),living=await spawn(call),corpse=await spawn(call)
  ok(await call('add_exhaustion',event('story-living',4,living.id)))
  ok(await call('add_exhaustion',event('story-corpse',6,corpse.id)))
  await replace(call,state=>{
    state.npcs.sarah.disposition='helpful'
    state.player.inventory.push({id:'sarah_diary_copy',name:'Copie du journal',type:'misc'})
  })
  const before=await call('get_game_state')
  ok(await call('travel_to_map',{toMapId:'waterdeep'}))
  const traveled=await call('get_game_state')
  assert.equal(traveled.currentMapId,'waterdeep')
  assert.equal(traveled.monsters[living.id],undefined);assert.equal(traveled.monsters[corpse.id],undefined)
  assert.deepEqual(traveled.sceneMemory.floorMonsters[before.currentMapId][living.id],before.monsters[living.id])
  assert.equal(traveled.sceneMemory.floorMonsters[before.currentMapId][corpse.id].isAlive,false)
  assert.deepEqual(traveled.dmTools.exhaustion,before.dmTools.exhaustion)
  for(let retry=0;retry<2;retry++)ok(await call('replace_game_state',{gameState:traveled}))
  assert.deepEqual(await call('get_game_state'),traveled)
  assert.ok((await call('travel_to_map',{toMapId:before.currentMapId})).error)
  assert.deepEqual(await call('get_game_state'),traveled)
})

test('forced combat exit retires a living exhausted actor without losing its ledger or reactivating it after travel', async t => {
  const call=await engine(t),enemy=await spawn(call)
  ok(await call('add_exhaustion',event('retired-living',4,enemy.id)))
  await battle(call,[enemy.id])
  const combat=await call('get_game_state'),monster=structuredClone(combat.monsters[enemy.id])
  const ended=ok(await call('end_combat',{force:true,reason:'La créature quitte effectivement la scène.'}))
  assert.ok(ended.disengagedMonsters.some(actor=>actor.id===enemy.id))
  const retired=await call('get_game_state')
  assert.equal(retired.monsters[enemy.id],undefined)
  assert.deepEqual(retired.sceneMemory.retiredMonsters[enemy.id],monster)
  assert.deepEqual(retired.dmTools.exhaustion,combat.dmTools.exhaustion)
  ok(await call('replace_game_state',{gameState:retired}))
  assert.deepEqual(await call('get_game_state'),retired)
  await replace(call,state=>{
    state.npcs.sarah.disposition='helpful'
    state.player.inventory.push({id:'sarah_diary_copy',name:'Copie du journal',type:'misc'})
  })
  ok(await call('travel_to_map',{toMapId:'waterdeep'}))
  const traveled=await call('get_game_state')
  assert.equal(traveled.monsters[enemy.id],undefined)
  assert.equal(traveled.sceneMemory.floorMonsters[retired.currentMapId][enemy.id],undefined)
  assert.deepEqual(traveled.sceneMemory.retiredMonsters[enemy.id],monster)
  assert.deepEqual(traveled.dmTools.exhaustion,combat.dmTools.exhaustion)
  ok(await call('replace_game_state',{gameState:traveled}))
  assert.deepEqual(await call('get_game_state'),traveled)
})

test('MJ exhaustion mutation always requires an explicit target', async t => {
  const call = await engine(t), before = await call('get_game_state')
  const input = event('missing-target'); delete input.targetId
  assert.ok((await call('add_exhaustion', input)).error)
  assert.ok((await call('remove_exhaustion', input)).error)
  assert.deepEqual(await call('get_game_state'), before)
})

test('MCP inspection is read only; receipts survive replacement and reject conflicting retries atomically', async t => {
  const call = await engine(t), initial = await call('get_game_state')
  assert.equal(ok(await call('inspect_exhaustion')).level, 0)
  assert.deepEqual(await call('get_game_state'), initial)
  const input = event('hazard-one', 4), applied = ok(await call('add_exhaustion', input))
  assert.equal(applied.receipt.afterLevel, 4)
  assert.equal(applied.target.hp.max, Math.floor(initial.player.hp.max / 2))
  const state = await call('get_game_state')
  ok(await call('replace_game_state', { gameState: state }))
  assert.equal(ok(await call('add_exhaustion', input)).alreadyApplied, true)
  assert.equal((await call('add_exhaustion', { ...input, levels: 1 })).code, 'EXHAUSTION_EVENT_CONFLICT')
  assert.deepEqual(await call('get_game_state'), state)
  const removed = ok(await call('remove_exhaustion', event('cure-one')))
  assert.equal(removed.target.hp.max, initial.player.hp.max)
  assert.equal(removed.target.hp.current, state.player.hp.current)
})

test('checks really roll with disadvantage from level one, with ordinary advantage cancellation', async t => {
  const call = await engine(t, { dice: '19,2,17,18' })
  ok(await call('add_exhaustion', event('checks')))
  const check = ok(await call('roll_ability_check', { ability: 'int', dc: 10 }))
  assert.equal(check.disadvantage, true); assert.match(check.roll.detail, /DIS/)
  assert.equal(check.roll.rolls[0], 2)
  const canceled = ok(await call('roll_ability_check', { ability: 'int', dc: 10, advantage: true, advantageReason: 'Aide concrète établie avant le test.' }))
  assert.ok(!/DIS:|ADV:/.test(canceled.roll.detail)); assert.equal(canceled.roll.rolls[0], 17)
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 18)
})

test('saving throws and death saves really roll with disadvantage from level three', async t => {
  const call = await engine(t, { dice: '19,2,18,1' })
  ok(await call('add_exhaustion', event('saves', 3)))
  const save = ok(await call('resolve_saving_throw', { entityId: 'player', ability: 'wis', dc: 10 }))
  assert.match(save.roll.detail, /DIS/); assert.equal(save.roll.rolls[0], 2)
  const enemy = await spawn(call)
  await battle(call, [enemy.id])
  await replace(call, state => { state.player.hp.current = 0; state.player.conditions.push('unconscious') })
  ok(await call('checkpoint_player_dying', { eventId: 'exhausted-body-observed', reason: 'Corps ancien observé au présent avant son prochain véritable début de tour.' }))
  ok(await call('next_turn', { actorId: 'player', skipAction: true }))
  ok(await call('next_turn', { actorId: enemy.id, skipAction: true }))
  const deathSave = ok(await call('roll_death_save'))
  assert.match(deathSave.roll.detail, /DIS/); assert.equal(deathSave.criticalFailure, true)
})

test('actual weapon attacks use disadvantage at level three', async t => {
  const call = await engine(t, { dice: '19,2' }), enemy = await spawn(call)
  ok(await call('add_exhaustion', event('attacks', 3)))
  await battle(call, [enemy.id])
  const attack = ok(await call('resolve_player_attack', { targetId: enemy.id, weaponOrSpell: 'longsword' }))
  assert.match(attack.attackRoll.detail, /DIS/); assert.equal(attack.attackRoll.rolls[0], 2)
})

test('the shared navigation actor exposes halved and zero movement speeds to engine and UI', async t => {
  const call = await engine(t), before = await call('get_game_state')
  ok(await call('add_exhaustion', event('slow', 2)))
  assert.equal(navigationActor(await call('get_game_state'), 'player').speed, Math.floor(before.player.speed / 2))
  ok(await call('add_exhaustion', event('immobile', 3)))
  assert.equal(navigationActor(await call('get_game_state'), 'player').speed, 0)
})

test('initiative is an actual Dexterity check and applies exhaustion from level one', async t => {
  const call = await engine(t, { dice: '19,2,11' }), enemy = await spawn(call)
  ok(await call('add_exhaustion', event('initiative')))
  const combat = ok(await call('enter_combat', { combatants: ['player', enemy.id] }))
  const entry = combat.initiatives.find(actor => actor.id === 'player')
  assert.match(entry.roll, /DIS/)
  assert.equal(combat.round, 1)
})

test('replace rejects an inconsistent effective HP maximum before mutating state', async t => {
  const call = await engine(t)
  ok(await call('add_exhaustion', event('replace-four', 4)))
  const before = await call('get_game_state'), invalid = structuredClone(before)
  invalid.player.hp.max++
  assert.equal((await call('replace_game_state', { gameState: invalid })).code, 'EXHAUSTION_MAXIMUM_MISMATCH')
  assert.deepEqual(await call('get_game_state'), before)
})

test('level five refuses voluntary exploration movement despite the absence of a turn budget', async t => {
  const call = await engine(t), toCell = adjacent(await call('get_game_state'))[0]
  ok(await call('add_exhaustion', event('no-exploration-movement', 5)))
  const before = await call('get_game_state')
  assert.equal((await call('move_token', { tokenId: 'player', toCell })).code, 'ACTOR_IMMOBILE')
  assert.deepEqual(await call('get_game_state'), before)
})

test('legacy unknown exhaustion loads but refuses combat entry before phase, initiative or dice mutate', async t => {
  const call = await engine(t, { dice: '19' }), enemy = await spawn(call)
  await replace(call, state => state.player.conditions.push('exhaustion'))
  const before = await call('get_game_state')
  assert.equal(before.phase, 'exploration')
  assert.equal((await call('enter_combat', { combatants: [enemy.id, 'player'] })).code, 'EXHAUSTION_LEVEL_REQUIRED')
  assert.deepEqual(await call('get_game_state'), before)
  assert.equal(ok(await call('roll_dice', { notation: '1d20' })).total, 19)
})

test('a long rest grants validated normal benefits but reports blocked nutrition recovery without removing exhaustion', async t => {
  const call = await engine(t)
  ok(await call('add_exhaustion', event('rest', 4)))
  await replace(call, state => { state.player.hp.current = 1 })
  const rested = ok(await call('take_rest', { kind: 'long' }))
  assert.equal(rested.exhaustionRecovery.code, 'NUTRITION_NOT_TRACKED')
  assert.equal(rested.exhaustionRecovery.levelUnchanged, true)
  const state = await call('get_game_state')
  assert.equal(state.dmTools.exhaustion.creatures.player.level, 4)
  assert.equal(state.player.hp.current, state.player.hp.max)
  assert.equal(state.player.hp.max, Math.floor(state.dmTools.exhaustion.creatures.player.unexhaustedHpMax / 2))
})

test('Aid under level-four exhaustion changes real maximum using its pre-halving basis and expires cleanly', async t => {
  const call = await engine(t, { characterId: 'cleric' }), before = await call('get_game_state')
  ok(await call('equip_item', { itemId: 'mace', operation: 'unequip', slot: 'main_hand' }))
  ok(await call('equip_item', { itemId: 'holy_symbol', operation: 'equip', slot: 'main_hand' }))
  ok(await call('add_exhaustion', event('aid-exhaustion', 4)))
  ok(await call('cast_spell', { spellId: 'aid', focusItemId: 'holy_symbol', targetIds: ['player'], slotLevel: 3 }))
  let state = await call('get_game_state')
  assert.equal(state.player.hp.max, Math.floor((before.player.hp.max + 10) / 2))
  assert.equal(state.dmTools.exhaustion.creatures.player.unexhaustedHpMax, before.player.hp.max + 10)
  ok(await call('advance_time', { seconds: 28800 }))
  state = await call('get_game_state')
  assert.equal(state.player.hp.max, Math.floor(before.player.hp.max / 2))
  assert.equal(state.dmTools.exhaustion.creatures.player.unexhaustedHpMax, before.player.hp.max)
})

test('Aid expires on an archived exhausted monster before a floor return without activating or duplicating it', async t => {
  const call=await engine(t,{characterId:'cleric'}),enemy=await spawn(call),base=enemy.hp.max
  ok(await call('equip_item', { itemId: 'mace', operation: 'unequip', slot: 'main_hand' }))
  ok(await call('equip_item', { itemId: 'holy_symbol', operation: 'equip', slot: 'main_hand' }))
  ok(await call('cast_spell',{spellId:'aid',focusItemId:'holy_symbol',targetIds:[enemy.id],slotLevel:3}))
  ok(await call('add_exhaustion',event('aid-archived-four',4,enemy.id)))
  const origin=await call('get_game_state')
  assert.equal(origin.monsters[enemy.id].hp.max,Math.floor((base+10)/2))
  const layout=ok(await call('generate_dungeon',{seed:'aid-expiry-floor',width:3,height:3,count:5})).layout
  const installed=ok(await call('install_dungeon',{dungeonId:'aid-expiry-floor',layout,entranceCell:origin.player.position,
    questLink:{goal:'Poursuivre la quête principale.',lead:'Un indice ramène au témoin recherché.',delivery:'clue',discoveryDc:10}}))
  ok(await call('travel_to_map',{transitionId:installed.entryTransitionId}))
  ok(await call('advance_time',{seconds:28800}))
  const expired=await call('get_game_state'),archived=expired.sceneMemory.floorMonsters[origin.currentMapId][enemy.id]
  assert.equal(expired.monsters[enemy.id],undefined,'HP bookkeeping does not activate a creature on another floor')
  assert.equal(archived.hp.max,Math.floor(base/2));assert.equal(archived.hp.current,Math.floor(base/2))
  assert.equal(expired.dmTools.exhaustion.creatures[enemy.id].unexhaustedHpMax,base)
  assert.ok(!expired.hero.effects.some(effect=>effect.kind==='aid'&&effect.targetIds.includes(enemy.id)))
  ok(await call('replace_game_state',{gameState:expired}))
  ok(await call('travel_to_map',{transitionId:installed.exitTransitionId}))
  const restored=await call('get_game_state')
  assert.deepEqual(restored.monsters[enemy.id].hp,archived.hp)
  assert.equal(restored.dmTools.exhaustion.creatures[enemy.id].unexhaustedHpMax,base)
  ok(await call('replace_game_state',{gameState:restored}))
  assert.deepEqual(await call('get_game_state'),restored)
})

test('Aid expiry updates a retired exhausted monster without reintroducing it into the scene', async t => {
  const call=await engine(t,{characterId:'cleric'}),enemy=await spawn(call),base=enemy.hp.max
  ok(await call('equip_item', { itemId: 'mace', operation: 'unequip', slot: 'main_hand' }))
  ok(await call('equip_item', { itemId: 'holy_symbol', operation: 'equip', slot: 'main_hand' }))
  ok(await call('cast_spell',{spellId:'aid',focusItemId:'holy_symbol',targetIds:[enemy.id],slotLevel:2}))
  ok(await call('add_exhaustion',event('aid-retired-four',4,enemy.id)))
  await battle(call,[enemy.id])
  ok(await call('end_combat',{force:true,reason:'La créature quitte la scène.'}))
  ok(await call('advance_time',{seconds:28800}))
  const expired=await call('get_game_state')
  assert.equal(expired.monsters[enemy.id],undefined)
  assert.equal(expired.sceneMemory.retiredMonsters[enemy.id].hp.max,Math.floor(base/2))
  assert.equal(expired.dmTools.exhaustion.creatures[enemy.id].unexhaustedHpMax,base)
  ok(await call('replace_game_state',{gameState:expired}))
  assert.deepEqual(await call('get_game_state'),expired)
})

test('level six causes true death, ends concentration and attunement; removing levels never resurrects', async t => {
  const call = await engine(t, { characterId: 'cleric' }), state = await call('get_game_state')
  ok(await call('create_magic_item', { itemId: 'exhaustion-ring', templateId: 'ring_of_protection', name: 'Anneau', description: 'Un anneau.', cell: state.player.position }))
  ok(await call('pick_up_item', { itemId: 'exhaustion-ring' }))
  ok(await call('attune_magic_item', { itemId: 'exhaustion-ring', operation: 'attune' }))
  ok(await call('equip_item', { itemId: 'mace', operation: 'unequip', slot: 'main_hand' }))
  ok(await call('equip_item', { itemId: 'holy_symbol', operation: 'equip', slot: 'main_hand' }))
  ok(await call('cast_spell', { spellId: 'bless', focusItemId: 'holy_symbol', targetIds: ['player'], slotLevel: 1 }))
  const dead = ok(await call('add_exhaustion', event('fatal', 6)))
  assert.equal(dead.receipt.died, true)
  const after = await call('get_game_state')
  assert.equal(after.player.deathSaves.dead, true); assert.equal(after.player.hp.current, 0)
  assert.equal(after.hero.concentrationIds.player, undefined)
  assert.ok(Number.isFinite(after.hero.corpseTimes.player))
  assert.equal(after.dmTools.magicItems['exhaustion-ring'].attunedTo, undefined)
  assert.equal(ok(await call('add_exhaustion', event('fatal', 6))).alreadyApplied, true)
  const removed = ok(await call('remove_exhaustion', event('corpse-removal', 6)))
  assert.equal(removed.target.level, 0); assert.equal(removed.target.dead, true); assert.equal(removed.target.hp.current, 0)
})

test('Death Ward overlap is refused without consuming ward, changing levels, HP or receipts', async t => {
  const call = await engine(t)
  await replace(call, state => state.hero.effects.push({ id: 'exhaustion-ward', kind: 'death-ward', sourceId: 'player', targetIds: ['player'], expiresAt: (state.worldTimeSeconds ?? 0) + 28800, concentration: false, data: {} }))
  const before = await call('get_game_state')
  assert.equal((await call('add_exhaustion', event('warded', 6))).code, 'EXHAUSTION_DEATH_WARD_ADJUDICATION')
  assert.deepEqual(await call('get_game_state'), before)
})

test('exact monster exhaustion immunity prevents new levels atomically', async t => {
  // The pinned skeleton block explicitly lists exhaustion; zombie does not.
  const call = await engine(t), undead = await spawn(call, 'skeleton'), before = await call('get_game_state')
  assert.equal((await call('add_exhaustion', event('immune', 1, undead.id))).code, 'EXHAUSTION_IMMUNE')
  assert.deepEqual(await call('get_game_state'), before)
})
