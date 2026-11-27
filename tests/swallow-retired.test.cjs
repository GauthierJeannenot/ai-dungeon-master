const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path')
process.env.MONETIZATION_ENABLED='false'
const {installPgMem}=require('./helpers/pg-mem.cjs'),pg=installPgMem()
const {saveSession,loadSession,deleteSession}=require('../lib/session-store.ts')
const {Client}=require('@modelcontextprotocol/sdk/client/index.js'),{StdioClientTransport}=require('@modelcontextprotocol/sdk/client/stdio.js')
const {adjacent,ok}=require('./helpers/mcp-toolkit.cjs')
const wave=path.resolve(__dirname,'..'),plain=v=>JSON.parse(JSON.stringify(v))
test.after(()=>pg.restore())
async function engine(t){const client=new Client({name:'swallow-archive-review',version:'1'});await client.connect(new StdioClientTransport({command:'node',args:[process.env.SWALLOW_ARCHIVE_ENGINE_PATH??path.join(wave,'mcp-server/dist/mcp-server/index.js')],cwd:wave,env:{...process.env,ADVENTURE_ID:'sarah-of-yellowcrest-manor',CHARACTER_ID:'fighter',AI_DM_TEST_DICE_SEQUENCE:'1,20,17,19',MONETIZATION_ENABLED:'false',LLM_MODE:'mock'}}));t.after(()=>client.close());return async(name,args={})=>{const result=await client.callTool({name,arguments:args});const text=result.content.find(c=>c.type==='text').text;try{return JSON.parse(text)}catch{return{error:text,tool:name}}}}
test('an observed canonical body really retired by a public exhausted surrender remains restorable through SQL',async t=>{
 const call=await engine(t),initial=await call('get_game_state'),body=ok(await call('spawn_monster',{monsterType:'giant_poisonous_snake',cell:adjacent(initial)[0]}))
 const fact=ok(await call('record_scene_fact',{description:'La taille Moyenne actuelle du vrai serpent est observée, sans transformation.',cell:body.position})).worldFact
 ok(await call('record_swallow_body_size',{entityId:body.id,size:'Medium',factId:fact.id,source:'Profil MM canonique observé avant un éventuel avalement.'}))
 ok(await call('add_exhaustion',{eventId:'actual-exhaustion-before-retirement-size',targetId:body.id,levels:1,reason:'Épuisement réel avant la retraite.'}));ok(await call('enter_combat',{combatants:['player',body.id]}));ok(await call('end_combat',{force:true,reason:'Le vrai combat cesse par reddition et le corps épuisé est retiré.'}))
 const retired=await call('get_game_state');assert.equal(retired.monsters[body.id],undefined);assert.ok(retired.sceneMemory.retiredMonsters[body.id]);assert.equal(retired.dmTools.swallow.sizes[body.id].size,'Medium');const snapshot=plain(retired.sceneMemory.retiredMonsters[body.id])
 const id=`swallow-retired-${process.pid}`;await saveSession(id,{gameState:retired,history:[],adventureId:retired.adventureId,characterId:retired.characterId});t.after(()=>deleteSession(id));const loaded=(await loadSession(id)).gameState
 const result=await call('replace_game_state',{gameState:loaded});assert.ok(!result.error,JSON.stringify(result));const after=await call('get_game_state');assert.deepEqual(after,plain(retired));assert.deepEqual(after.sceneMemory.retiredMonsters[body.id],snapshot);assert.equal(after.monsters[body.id],undefined);const attack=await call('resolve_attack',{attackerId:body.id,targetId:'player',weaponOrSpell:'Bite'});assert.equal(attack.code,'ENTITY_NOT_FOUND');assert.deepEqual(await call('get_game_state'),plain(retired))
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
