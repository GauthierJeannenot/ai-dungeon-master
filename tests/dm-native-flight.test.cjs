const test=require('node:test'),assert=require('node:assert/strict')
Object.assign(process.env,{LLM_MODE:'mock',ALLOW_PAID_LLM:'false',MONETIZATION_ENABLED:'false',DM_RATE_LIMIT_PER_MINUTE:'0',APP_LOG_PERSIST_ENABLED:'false',APP_LOG_LEVEL:'error',LLM_MAX_CALLS_PER_REQUEST:'12'})
const{installPgMem}=require('./helpers/pg-mem.cjs'),pg=installPgMem()
const{play,lastResult}=require('./helpers/dm-scripted-turn.cjs')
const{engine,ok,replace,spawn}=require('./helpers/mcp-toolkit.cjs')
const{serializeGameState}=require('../lib/dm/prompts.ts')
test.after(()=>pg.restore())
const source='Actual measured source body, support and selected clear physical air route established by the MJ.'
async function setup(t,{dice='17,3,4,19'}={}){
 const call=await engine(t,{dice}),body=await spawn(call,'wyvern'),state=await call('get_game_state'),entityId=body.id
 const fact=ok(await call('record_scene_fact',{description:source,cell:body.position})).worldFact
 ok(await call('record_vertical_surface',{eventId:'stdio-real-floor',surfaceId:'floor',mapId:state.currentMapId,roomId:state.currentRoomId,cells:[body.position,state.player.position],kind:'support',elevationFeet:0,actualGeometryConfirmed:true,source}))
 for(const[id,heightFeet]of [[entityId,8],['player',6]])ok(await call('record_physical_body',{eventId:'body-'+id,entityId:id,heightFeet,actualMeasuredBodyConfirmed:true,source}))
 ok(await call('observe_standing_surface',{eventId:'stdio-standing',entityId,surfaceId:'floor',actualCurrentSupportConfirmed:true,source}))
 const input={eventId:'stdio-actual-flight',entityId,path:[{...body.position,zFeet:0},{...body.position,zFeet:5}],takeoffSurfaceId:'floor',factId:fact.id,actualWholeBodyClearanceConfirmed:true,source}
 const geometry={eventId:'stdio-real-ray',actorId:entityId,targetId:'player',weaponReference:'Bite',originZFeet:5,targetZFeet:5,factId:fact.id,actualAttackPointsConfirmed:true,source}
 return{call,entityId,input,geometry}
}

test('real stdio inventory and SQL restoration retain the measured native route and unchanged dice, action and time',async t=>{
 const{call,entityId,input}=await setup(t),tools=(await call.client.listTools()).tools
 for(const name of ['fly_native_path','continue_native_flight','complete_native_flight_fall','record_spatial_attack_geometry','inspect_native_flight'])assert.ok(tools.some(tool=>tool.name===name))
 const support=ok(await call('get_rules_support',{domain:'native_flight'}));assert.match(JSON.stringify(support),/Euclidean3D/)
 const before=await call('get_game_state'),result=ok(await call('fly_native_path',input));assert.equal(result.costFeet,5)
 const{saveSession,loadSession,deleteSession}=require('../lib/session-store.ts'),id='native-flight-stdio-'+Date.now();t.after(()=>deleteSession(id))
 const state=await call('get_game_state');await saveSession(id,{gameState:state,history:[],adventureId:state.adventureId,characterId:state.characterId});const saved=(await loadSession(id)).gameState;assert.deepEqual(saved,state)
 ok(await call('replace_game_state',{gameState:saved}));assert.equal(ok(await call('fly_native_path',input)).replayed,true);assert.deepEqual(await call('get_game_state'),state)
 assert.equal(state.worldTimeSeconds,before.worldTimeSeconds);assert.deepEqual(state.actionUsed,before.actionUsed);assert.equal(JSON.parse(serializeGameState(state)).monsters[entityId].verticalContext.zFeet,5);assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,17)
})

test('the actual API agent chooses exact native XYZ movement and inspection with one player check and no fabricated tool arguments',async t=>{
 const{call,input,entityId}=await setup(t)
 const{result,seen,selected,before}=await play(t,call,[{name:'fly_native_path',input},{name:'inspect_native_flight',input:{}},{name:'roll_ability_check',input:{entityId:'player',ability:'wis',dc:10}},'La trajectoire native choisie est accomplie et ton observation distincte est resolue.'],'Le vrai monstre prend exactement cette trajectoire, puis je regarde la scene.')
 assert.deepEqual(seen,selected);assert.equal(result.newGameState.dmTools.nativeFlight.locations[entityId].point.zFeet,5);assert.equal(result.newGameState.worldTimeSeconds,before.worldTimeSeconds);assert.deepEqual(result.newGameState.actionUsed,before.actionUsed);assert.equal(JSON.parse(serializeGameState(result.newGameState)).monsters[entityId].verticalContext.zFeet,5);assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,3)
})

test('API and SQL resume the exact held spatial Bite with its original d20 and Inspiration die without changing the measured ray',async t=>{
 const{call,input,entityId,geometry}=await setup(t,{dice:'8,4,2,3,19'});ok(await call('fly_native_path',input));ok(await call('record_spatial_attack_geometry',geometry))
 await replace(call,state=>{Object.assign(state,{phase:'combat',round:1,currentTurn:entityId,initiativeOrder:['player',entityId],actionUsed:{},movementUsed:{}});state.hero.inspiration.push({targetId:entityId,die:8,expiresAt:600})})
 ok(await call('resolve_monster_action',{monsterId:entityId,targetId:'player',actionName:'Bite'}));const held=await call('get_game_state'),pending=held.hero.pending;assert.ok(pending);assert.equal(pending.command.spatialContext.distanceFeet,5)
 const{result,before}=await play(t,call,[{name:'inspect_native_flight',input:{}},{name:'resolve_reaction',input:{pendingId:pending.id,choice:'bardic_inspiration'}},params=>{const attack=lastResult(params).attacks?.[0]??lastResult(params);assert.equal(attack.attackRoll.rolls[0],8);assert.equal(attack.spatialContext.distanceFeet,5);return{name:'next_turn',input:{actorId:entityId}}},'Le meme coup tenu se termine avec son Inspiration choisie.'],'Reprends le vrai coup tenu avec son Inspiration.')
 assert.equal(result.newGameState.hero.pending,undefined);assert.deepEqual(result.newGameState.dmTools.nativeFlight.attacks,before.dmTools.nativeFlight.attacks);assert.equal(result.newGameState.monsters[entityId].position.x,before.monsters[entityId].position.x);assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
test('actual POST and SQL complete the original flying Claws+Stinger pair after its held second CON without replaying either spatial wound',async t=>{
 const{call,input,entityId,geometry}=await setup(t,{dice:[17,2,3,17,2,3,1,1,...Array(7).fill(1),19].join(',')});ok(await call('fly_native_path',input));for(const weaponReference of ['Claws','Stinger'])ok(await call('record_spatial_attack_geometry',{...geometry,eventId:'actual-ray-'+weaponReference,weaponReference}))
 await replace(call,state=>{Object.assign(state,{phase:'combat',round:1,currentTurn:entityId,initiativeOrder:['player',entityId],actionUsed:{},movementUsed:{}});state.player.hp={current:300,max:300};state.hero.inspiration.push({targetId:'player',die:8,expiresAt:600})})
 const a=ok(await call('resolve_monster_action',{monsterId:entityId,targetId:'player',actionName:'Multiattack',attackActions:['Claws','Stinger']}));assert.ok(a.pendingReaction);const pending=(await call('get_game_state')).hero.pending
 const{result,before}=await play(t,call,[{name:'inspect_native_flight',input:{}},{name:'resolve_reaction',input:{pendingId:pending.id,choice:'bardic_inspiration'}},params=>{const b=lastResult(params);assert.deepEqual(b.attacks.map(h=>h.weaponOrSpell),['Claws','Stinger']);assert.deepEqual(b.attacks.map(h=>h.spatialContext.distanceFeet),[5,5]);assert.equal(b.attacks[1].weaponDamageDealt,9);assert.equal(b.attacks[1].poisonDamageDealt,7);return{name:'next_turn',input:{actorId:entityId}}},'La meme sequence aerienne et son vrai venin sont termines.'],'Reprends le vrai venin tenu avec son Inspiration puis termine ce meme tour.')
 assert.equal(before.player.hp.current,282);assert.equal(result.newGameState.player.hp.current,275);assert.equal(Object.keys(result.newGameState.dmTools.nativePoison.hits).length,1);assert.deepEqual(result.newGameState.dmTools.nativeFlight.attacks,before.dmTools.nativeFlight.attacks);assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
