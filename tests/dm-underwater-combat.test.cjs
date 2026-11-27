const test=require('node:test'),assert=require('node:assert/strict')
Object.assign(process.env,{LLM_MODE:'mock',ALLOW_PAID_LLM:'false',MONETIZATION_ENABLED:'false',DM_RATE_LIMIT_PER_MINUTE:'0',APP_LOG_PERSIST_ENABLED:'false',APP_LOG_LEVEL:'error',LLM_MAX_CALLS_PER_REQUEST:'12'})
const{installPgMem}=require('./helpers/pg-mem.cjs'),pg=installPgMem()
const{play,lastResult}=require('./helpers/dm-scripted-turn.cjs')
const{engine,ok,replace,spawn,battle}=require('./helpers/mcp-toolkit.cjs')
test.after(()=>pg.restore())
const source='Observation du vrai corps et du vrai volume d’eau par le MJ.'
async function setup(t,{dice='17,19',target=false}={}){
 const call=await engine(t,{dice}),state=await call('get_game_state'),entityId=target?(await spawn(call)).id:'player',body=(await call('get_game_state')).monsters[entityId]??state.player
 const fact=ok(await call('record_scene_fact',{description:'Ce vrai bassin contient le point du corps sélectionné ; immersion complète distincte de son attaque.',cell:body.position})).worldFact
 ok(await call('record_movement_medium',{eventId:'actual-api-water',mediumId:'pool',mapId:state.currentMapId,roomId:state.currentRoomId,mode:'swim',cells:[body.position],bottomZFeet:0,topZFeet:12,surfaceZFeet:12,factId:fact.id,actualPhysicalMediumConfirmed:true,handsRequired:0,difficult:false,source}))
 const input={eventId:'actual-api-body',subject:{kind:'creature',entityId},waterMediumId:'pool',fullyImmersed:false,factId:fact.id,actualPhysicalObservationConfirmed:true,source}
 return{call,input,entityId}
}
test('API records an auxiliary real immersion observation, reads it, and retains one actual player action with exact SQL state',async t=>{
 const{call,input}=await setup(t)
 const{result,seen,selected,before}=await play(t,call,[{name:'record_underwater_context',input},{name:'inspect_underwater_context',input:{subject:input.subject}},{name:'roll_ability_check',input:{entityId:'player',ability:'wis',dc:10}},{name:'roll_ability_check',input:{entityId:'player',ability:'wis',dc:10}},params=>{assert.equal(lastResult(params).code,'PRIMARY_ACTION_ALREADY_RESOLVED');return 'Le vrai contexte physique est observé puis ton observation distincte est résolue.'}],'Je constate le bassin puis regarde autour de moi.')
 assert.deepEqual(seen,selected.slice(0,-1));assert.deepEqual(result.newGameState.player.hp,before.player.hp);assert.deepEqual(result.newGameState.player.position,before.player.position);assert.equal(result.newGameState.worldTimeSeconds,before.worldTimeSeconds);assert.ok(result.newGameState.dmTools.underwater.receipts[input.eventId]);assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
test('API inspection of unresolved whole immersion remains readonly without granting water breathing or an action',async t=>{
 const{call}=await setup(t)
 const{result,before}=await play(t,call,[{name:'inspect_underwater_context',input:{subject:{kind:'creature',entityId:'player'}}},params=>{assert.equal(lastResult(params).subjects[0].fullyImmersed,null);return 'Le bassin est réel mais l’immersion complète n’est pas établie.'}],'Est-ce que je suis complètement immergé ?')
 assert.deepEqual(result.newGameState.player,before.player);assert.deepEqual(result.newGameState.hero,before.hero);assert.equal(result.newGameState.dmTools.underwater,undefined);assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,17)
})
test('API resolves an exact already due turn-fire after physical observation without spending player action, time or another turn',async t=>{
 const{call,input,entityId}=await setup(t,{dice:'4,17,19'})
 // The fixture represents an already saved real alchemist-fire contact and its opened target turn.
 const opponent=(await spawn(call)).id;await battle(call,[opponent],'player');await replace(call,state=>{state.dmTools.weaponConsumables={receipts:{},burning:{[entityId]:{targetId:entityId,sourceId:'player',itemId:'retained-consumed-fire-flask',useId:'retained-actual-fire',startedAt:state.worldTimeSeconds}}}})
 const state=await call('get_game_state'),eventId=`${state.combatGeneration??0}:${state.turnCounter??0}:${entityId}`
 const{result,before}=await play(t,call,[{name:'record_underwater_context',input},{name:'resolve_start_turn_fire',input:{entityId,eventId}},{name:'inspect_underwater_context',input:{subject:input.subject}},'Le feu dû du tour déjà ouvert est résolu une seule fois.'],'Résous le feu réellement dû après avoir établi le contexte physique.')
 assert.equal(result.newGameState.player.hp.current,before.player.hp.current-4);assert.equal(result.newGameState.currentTurn,before.currentTurn);assert.equal(result.newGameState.turnCounter,before.turnCounter);assert.equal(result.newGameState.worldTimeSeconds,before.worldTimeSeconds);assert.deepEqual(result.newGameState.hero,before.hero)
 const saved=await call('get_game_state');assert.equal(ok(await call('resolve_start_turn_fire',{entityId,eventId})).replayed,true);assert.deepEqual(await call('get_game_state'),saved);assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,17)
})
