const test = require('node:test')
const assert = require('node:assert/strict')
process.env.ADVENTURE_ID = 'sarah-of-yellowcrest-manor'
process.env.CHARACTER_ID = 'fighter'
const gs = require('../mcp-server/dist/mcp-server/game-state.js')
const { createMonster, registerPhaseTools } = require('../mcp-server/dist/mcp-server/tools/phase-tools.js')
const { registerCombatTools } = require('../mcp-server/dist/mcp-server/tools/combat-tools.js')
const { registerPlayerTools } = require('../mcp-server/dist/mcp-server/tools/player-tools.js')
const { completedRoundEvents } = require('../mcp-server/dist/lib/combat-round-events.js')
const { navigationGrid } = require('../mcp-server/dist/lib/navigation.js')

function fixture(t) {
  const previousDice = process.env.AI_DM_TEST_DICE_SEQUENCE
  delete process.env.AI_DM_TEST_DICE_SEQUENCE
  t.after(() => { gs.resetState(); if (previousDice === undefined) delete process.env.AI_DM_TEST_DICE_SEQUENCE; else process.env.AI_DM_TEST_DICE_SEQUENCE = previousDice })
  gs.resetState()
  const state = gs.getState()
  state.currentMapId = 'greenfast'; state.currentRoomId = '15'; state.player.position = {x:15,y:14}
  state.npcs = {}; state.monsters = {}
  const blocker = createMonster('cultist',{x:15,y:16},'On the route')
  const away = createMonster('cultist',{x:18,y:17},'Away from the route')
  gs.spawnMonster(blocker); gs.spawnMonster(away)
  gs.setPhase('combat'); gs.setInitiativeOrder(['player',blocker.id,away.id])
  const callbacks = {}, server = { tool(name,description,schema,callback) {
    callbacks[name] = input => callback(require('zod').z.object(schema).parse(input))
  } }
  registerPhaseTools(server); registerCombatTools(server); registerPlayerTools(server)
  const call = async (name,input={}) => JSON.parse((await callbacks[name](input)).content[0].text)
  const finishRound = () => { gs.advanceTurn(); gs.advanceTurn(); return gs.advanceTurn() }
  return {state,blocker,away,call,finishRound}
}

test('the horse flees after exactly one complete round and independently rolls damage for each creature on its route', t => {
  const {state,blocker,away} = fixture(t)
  const hp = state.player.hp.current, blockerHp = blocker.hp.current, awayBefore = structuredClone(away)
  gs.advanceTurn()
  assert.equal(state.round,1); assert.deepEqual(completedRoundEvents(state),{})
  gs.advanceTurn()
  assert.equal(state.round,1); assert.equal(state.player.hp.current,hp)
  process.env.AI_DM_TEST_DICE_SEQUENCE='1,4'
  gs.advanceTurn()
  assert.equal(state.round,2)
  assert.equal(state.player.hp.current,hp-1);assert.equal(blocker.hp.current,blockerHp-4)
  assert.ok(state.player.conditions.includes('prone'));assert.ok(blocker.conditions.includes('prone'))
  assert.equal(away.hp.current,awayBefore.hp.current);assert.deepEqual(away.conditions,awayBefore.conditions)
  const event = completedRoundEvents(state).barn_horse_escape
  assert.deepEqual(event.victims.map(v=>v.rawDamage),[1,4])
  assert.deepEqual(event.path.at(-1),{x:15,y:12})
  assert.equal(state.sceneMemory.doorStates.barn,'open')
  const grid = navigationGrid(state,'player')
  assert.equal(grid.free({x:13,y:17},false),true,'the departed horse no longer blocks its stall')
  assert.equal(grid.free({x:13,y:16},false),false,'the cow remains in place')
})

test('the completed escape and NPC injuries survive MCP hydration and never deal damage again', async t => {
  const {state,blocker,call,finishRound} = fixture(t)
  const npc = gs.getState().npcs.kara = {id:'kara',name:'Kara',kind:'mayor',position:{x:15,y:15},roomId:'15',
    mapId:'greenfast',visible:true,disposition:'helpful'}
  process.env.AI_DM_TEST_DICE_SEQUENCE='1,2,3'
  finishRound()
  assert.equal(npc.hp.current,npc.hp.max-3);assert.ok(npc.conditions.includes('prone'))
  assert.equal(state.initiativeOrder.includes('kara'),false,'a narrative NPC is never spawned as a combatant')
  const saved = structuredClone(gs.getState())
  assert.ok(!(await call('replace_game_state',{gameState:saved})).error)
  // Hydration may add the authored stat block to this legacy NPC, while
  // every saved field, especially injuries and conditions, must survive.
  for (const [key, value] of Object.entries(saved.npcs.kara)) {
    assert.deepEqual(gs.getState().npcs.kara[key], value)
  }
  assert.deepEqual(completedRoundEvents(gs.getState()),completedRoundEvents(saved))
  finishRound()
  assert.equal(gs.getPlayer().hp.current,saved.player.hp.current)
  assert.equal(gs.getMonster(blocker.id).hp.current,saved.monsters[blocker.id].hp.current)
  assert.equal(gs.getState().npcs.kara.hp.current,saved.npcs.kara.hp.current)
  assert.equal(gs.getState().combatLog.filter(log=>log.action==='Fuite du cheval affolé').length,1)
})

test('an empty route inflicts no damage and another map never runs this event', t => {
  const {state,blocker,finishRound} = fixture(t)
  state.player.position={x:16,y:18};blocker.position={x:18,y:16}
  const hp = state.player.hp.current
  finishRound()
  assert.deepEqual(completedRoundEvents(state).barn_horse_escape.victims,[])
  assert.equal(state.player.hp.current,hp)
  assert.equal(state.player.conditions.includes('prone'),false)
  delete state.sceneMemory.roundEvents
  state.currentMapId='waterdeep';state.currentRoomId='8'
  finishRound()
  assert.deepEqual(completedRoundEvents(state),{})
})

test('an event can kill the next monster without leaving a dead current turn', t => {
  const {state,blocker,away,finishRound} = fixture(t)
  blocker.hp.current=1
  gs.setInitiativeOrder([blocker.id,'player',away.id])
  process.env.AI_DM_TEST_DICE_SEQUENCE='1,4,20,1'
  finishRound()
  assert.equal(blocker.isAlive,false)
  assert.equal(state.initiativeOrder.includes(blocker.id),false)
  assert.equal(state.currentTurn,'player')
})

test('run_monster_turns exposes the same event and subsequent explicit next_turn calls do not repeat it', async t => {
  const {state,blocker,away,call} = fixture(t)
  await call('pass_turn',{reason:'wait'})
  process.env.AI_DM_TEST_DICE_SEQUENCE='2,3'
  const result = await call('run_monster_turns',{holdIds:[blocker.id,away.id]})
  assert.ok(!result.error,JSON.stringify(result))
  assert.equal(result.round,2);assert.equal(result.roundEvents.length,1)
  assert.equal(result.roundEvents[0].eventId,'barn_horse_escape')
  const hp=state.player.hp.current
  for (let i=0;i<3;i++) assert.deepEqual((await call('next_turn',{skipAction:true})).roundEvents,[])
  assert.equal(state.player.hp.current,hp)
})
