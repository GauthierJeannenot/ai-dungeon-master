const test=require('node:test'),assert=require('node:assert/strict')
Object.assign(process.env,{MONETIZATION_ENABLED:'false',LLM_MODE:'mock',ALLOW_PAID_LLM:'false',DM_RATE_LIMIT_PER_MINUTE:'0',APP_LOG_PERSIST_ENABLED:'false',APP_LOG_LEVEL:'error'})
const{installPgMem}=require('./helpers/pg-mem.cjs'),pg=installPgMem()
const{engine,ok,grid}=require('./helpers/mcp-toolkit.cjs')
const{createPartyNpc}=require('./helpers/npc-party-fixture.cjs')
const{play,lastResult}=require('./helpers/dm-scripted-turn.cjs')
test.after(()=>pg.restore())
test('the API persists exactly the chosen civilian role and its independent actual movement without inventing a player action or companion command',async t=>{
 const call=await engine(t,{dice:'19'}),f=await createPartyNpc(call,{role:'civilian',type:'commoner'}),s=await call('get_game_state'),g=grid(s,f.npc.id),target=g.neighbors(f.npc.position).find(c=>g.step(f.npc.position,c));assert.ok(target)
 const commands=[{name:'declare_npc_party_role',input:f.declaration},{name:'move_party_npc',input:{eventId:'api-real-civil-walk',npcId:f.npc.id,toCell:target}},{name:'inspect_npc_party',input:{}}]
 const{result,seen,selected,before}=await play(t,call,[...commands,params=>{assert.equal(lastResult(params).bodies[0].role,'civilian');return 'Cet individu volontaire a réellement rejoint le rôle civil et marché vers la case choisie, sans attaque ni action du héros.'}],"Enregistre son accord civil puis accompagne son déplacement réel vers cette case.")
 assert.deepEqual(seen,selected);assert.deepEqual(result.newGameState.npcs[f.npc.id].position,target);assert.deepEqual(result.newGameState.npcs[f.npc.id].hp,f.npc.hp);assert.deepEqual(result.newGameState.player,before.player);assert.equal(result.newGameState.worldTimeSeconds,before.worldTimeSeconds);assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
