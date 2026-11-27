const test=require('node:test'),assert=require('node:assert/strict')
Object.assign(process.env,{MONETIZATION_ENABLED:'false',LLM_MODE:'mock',ALLOW_PAID_LLM:'false',DM_RATE_LIMIT_PER_MINUTE:'0',APP_LOG_PERSIST_ENABLED:'false',APP_LOG_LEVEL:'error'})
const{installPgMem}=require('./helpers/pg-mem.cjs'),pg=installPgMem()
const{engine,ok,magic,hold,fact}=require('./helpers/adventure-rewards-fixture.cjs')
const{play,lastResult}=require('./helpers/dm-scripted-turn.cjs')
test.after(()=>pg.restore())

test('POST forwards one exact chime activation and blocks a second chosen major action before MCP while retaining actual use and SQL',async t=>{
 const call=await engine(t,{dice:'19'});await magic(call,'chime_of_opening','post-real-chime');await hold(call,'post-real-chime')
 const s=await call('get_game_state'),cell=s.player.position
 ok(await call('create_scene_object',{objectId:'post-real-lock',name:'Coffre actuel',description:'Un vrai coffre à une serrure.',cell,kind:'container',material:'iron',size:'small',resilience:'resilient',locked:true,lockDc:15,contents:[]}))
 const f=await fact(call,'Le son du carillon atteint effectivement ce coffre et sa serrure ; événement de la scène établi explicitement.',cell)
 const first={name:'use_chime_of_opening',input:{eventId:'post-real-first',itemId:'post-real-chime',objectId:'post-real-lock',soundFactId:f.id,actualSoundReachesTarget:true,actualSingleLockStateConfirmed:true}}
 const second={name:'use_chime_of_opening',input:{...first.input,eventId:'post-real-second'}}
 const played=await play(t,call,[first,params=>{assert.equal(ok(lastResult(params)).unlocked,true);return second},params=>{
  const result=lastResult(params);assert.ok(result.error);return'La première utilisation réelle a déverrouillé cette serrure. La seconde action attend une nouvelle décision du joueur.'
 }],'Je frappe ce carillon une fois vers ce coffre réel et attends son résultat.')
 assert.deepEqual(played.selected,[first,second]);assert.deepEqual(played.seen,[first])
 const after=played.result.newGameState;assert.equal(after.dmTools.magicItems['post-real-chime'].charges,9)
 assert.equal(after.dmTools.objects['post-real-lock'].locked,false);assert.equal(after.dmTools.objects['post-real-lock'].state,'closed')
 assert.equal(Object.keys(after.dmTools.chargedItems.events).length,1)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
