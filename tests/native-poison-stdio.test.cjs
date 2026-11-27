const test=require('node:test'),assert=require('node:assert/strict')
process.env.MONETIZATION_ENABLED='false'
const {installPgMem}=require('./helpers/pg-mem.cjs'),pg=installPgMem()
const {saveSession,loadSession,deleteSession}=require('../lib/session-store.ts')
const {engine,ok,adjacent}=require('./helpers/mcp-toolkit.cjs')
test.after(()=>pg.restore())
test('real stdio native snake bite keeps one source hit and exact venom through Postgres hydration without acquiring a poison dose',async t=>{
 const call=await engine(t,{dice:'1,20,17,2,1,1,1,1,19'}),initial=await call('get_game_state')
 const snake=ok(await call('spawn_monster',{monsterType:'giant_poisonous_snake',cell:adjacent(initial)[0]}))
 ok(await call('enter_combat',{combatants:['player',snake.id]}))
 const before=await call('get_game_state');assert.equal(before.currentTurn,snake.id)
 const hit=ok(await call('resolve_monster_action',{monsterId:snake.id,targetId:'player',actionName:'Bite'})).attacks[0]
 assert.equal(hit.playerPoison.save.dc,11);assert.equal(hit.playerPoison.damageRoll.notation,'3d6');assert.equal(hit.poisonDamageDealt,3);assert.equal(hit.weaponDamageDealt,6)
 const state=await call('get_game_state'),id=`native-poison-stdio-${process.pid}`;t.after(()=>deleteSession(id))
 await saveSession(id,{gameState:state,history:[],adventureId:state.adventureId,characterId:state.characterId});const loaded=(await loadSession(id)).gameState
 assert.deepEqual(loaded.dmTools.nativePoison,state.dmTools.nativePoison);assert.equal(loaded.player.hp.current,before.player.hp.current-9)
 ok(await call('replace_game_state',{gameState:loaded}));assert.deepEqual((await call('get_game_state')).dmTools.nativePoison,state.dmTools.nativePoison)
 assert.equal(loaded.player.inventory.some(item=>(item.equipmentId??'').startsWith('poison_')),false);assert.equal(Object.keys(loaded.dmTools.playerPoisons.preparations).length,0)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
