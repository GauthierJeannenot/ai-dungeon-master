const test=require('node:test'),assert=require('node:assert/strict')
Object.assign(process.env,{LLM_MODE:'mock',ALLOW_PAID_LLM:'false',MONETIZATION_ENABLED:'false',DM_RATE_LIMIT_PER_MINUTE:'0',APP_LOG_PERSIST_ENABLED:'false',APP_LOG_LEVEL:'error',LLM_MAX_CALLS_PER_REQUEST:'12'})
const{installPgMem}=require('./helpers/pg-mem.cjs'),pg=installPgMem()
const{engine,ok,spawn}=require('./helpers/mcp-toolkit.cjs')
const{play,lastResult}=require('./helpers/dm-scripted-turn.cjs')
const source='Actual measured bodies and retained melee points, standing support and clear chosen physical air route, established by the MJ.'
test.after(()=>pg.restore())
async function setup(t,{dice='1,20,17,3,19'}={}){
 const call=await engine(t,{dice}),body=await spawn(call,'wyvern'),state=await call('get_game_state'),id=body.id,p=state.player.position
 const fact=ok(await call('record_scene_fact',{description:source,cell:body.position})).worldFact
 ok(await call('record_vertical_surface',{eventId:'oa-floor',surfaceId:'oa-floor',mapId:state.currentMapId,roomId:state.currentRoomId,cells:[body.position,p],kind:'support',elevationFeet:0,actualGeometryConfirmed:true,source}))
 for(const[entityId,heightFeet]of [[id,8],['player',6]])ok(await call('record_physical_body',{eventId:'oa-body-'+entityId,entityId,heightFeet,actualMeasuredBodyConfirmed:true,source}))
 ok(await call('observe_standing_surface',{eventId:'oa-standing',entityId:id,surfaceId:'oa-floor',actualCurrentSupportConfirmed:true,source}))
 ok(await call('fly_native_path',{eventId:'oa-real-positioning',entityId:id,path:[{...body.position,zFeet:0},{...body.position,zFeet:5},{...body.position,zFeet:10},{...p,zFeet:10},{...p,zFeet:7}],takeoffSurfaceId:'oa-floor',factId:fact.id,actualWholeBodyClearanceConfirmed:true,source}))
 ok(await call('enter_combat',{combatants:['player',id]}));const combat=await call('get_game_state');assert.equal(combat.currentTurn,id)
 const main=combat.player.inventory.find(item=>item.id==='longsword');assert.ok(main)
 for(const weaponReference of ['unarmed',main.id])ok(await call('record_spatial_opportunity_geometry',{eventId:'oa-actual-point-'+weaponReference,sourceId:'player',movingId:id,weaponReference,sourcePointZFeet:5,movingPointOffsetZFeet:0,factId:fact.id,actualRetainedBodyPointsConfirmed:true,source}))
 const input={eventId:'oa-real-departure',entityId:id,path:[{...p,zFeet:7},{...p,zFeet:12}],factId:fact.id,actualWholeBodyClearanceConfirmed:true,source}
 return{call,id,input,weapon:main.id}
}
test('a new stdio engine and SQL process restart retain the actual partial opportunity point and selected original path without replaying movement',async t=>{
 const{call,id,input,weapon}=await setup(t),tools=(await call.client.listTools()).tools
 for(const name of ['record_spatial_opportunity_geometry','inspect_spatial_opportunities'])assert.ok(tools.some(tool=>tool.name===name))
 const a=ok(await call('fly_native_path',input));assert.equal(a.status,'opportunity');assert.equal(a.costFeet,3);const pending=a.pendingReaction
 assert.deepEqual(pending.command.opportunityBoundary.spatial.point,{...input.path[0],zFeet:10})
 const state=await call('get_game_state'),{saveSession,loadSession,deleteSession}=require('../lib/session-store.ts'),session='oa-partial-'+Date.now();t.after(()=>deleteSession(session))
 await saveSession(session,{gameState:state,history:[],adventureId:state.adventureId,characterId:state.characterId});const saved=(await loadSession(session)).gameState;assert.deepEqual(saved,state)
 const restarted=await engine(t,{dice:'17,3,19'});ok(await restarted('replace_game_state',{gameState:saved}));assert.equal(ok(await restarted('fly_native_path',input)).replayed,true);assert.deepEqual(await restarted('get_game_state'),saved)
 const b=ok(await restarted('resolve_reaction',{pendingId:pending.id,choice:'opportunity_attack',weaponOrSpell:weapon}));assert.equal(b.costFeet,5);assert.equal(b.attack.spatialContext.distanceFeet,5)
 const after=await restarted('get_game_state');assert.equal(after.movementUsed[id],1);assert.equal(after.dmTools.nativeFlight.locations[id].point.zFeet,12);assert.deepEqual(after.dmTools.nativeFlight.moves[input.eventId].input.path,input.path);assert.equal(after.hero.reactionsUsed.player,true)
 assert.equal(ok(await restarted('roll_dice',{notation:'1d20'})).total,19)
})
test('the actual API agent selects the pending three dimensional opportunity explicitly, preserves SQL state and ends the real monster turn without fabricated calls',async t=>{
 const{call,id,input,weapon}=await setup(t);const paused=ok(await call('fly_native_path',input))
 const{result,seen,selected}=await play(t,call,[{name:'inspect_spatial_opportunities',input:{}},{name:'resolve_reaction',input:{pendingId:paused.pendingReaction.id,choice:'opportunity_attack',weaponOrSpell:weapon}},params=>{const a=lastResult(params);assert.equal(a.costFeet,5);assert.equal(a.attack.spatialContext.distanceFeet,5);return{name:'next_turn',input:{actorId:id,skipAction:true,reason:'The selected native route is complete; explicitly hold this remaining action.'}}},'La reaction choisie a ete resolue au vrai point de sortie, puis le meme vol et son tour se terminent.'],'Je choisis exactement cette reaction au depart de sa portee, puis termine le tour du volant.')
 assert.deepEqual(seen,selected);assert.equal(result.newGameState.dmTools.nativeFlight.locations[id].point.zFeet,12);assert.equal(result.newGameState.hero.pending,undefined);assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
