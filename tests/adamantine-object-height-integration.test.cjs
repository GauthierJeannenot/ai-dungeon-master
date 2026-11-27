// External durable draft. Stage into tests/ of the exact final common copy.
// No runtime before immutable gels and the parent's common-copy signal.
const test=require('node:test'),assert=require('node:assert/strict')
Object.assign(process.env,{MONETIZATION_ENABLED:'false',LLM_MODE:'mock',ALLOW_PAID_LLM:'false',APP_LOG_PERSIST_ENABLED:'false',APP_LOG_LEVEL:'error',RUNPOD_AUTO_MANAGE:'false'})
const{installPgMem}=require('./helpers/pg-mem.cjs'),pg=installPgMem()
const{saveSession,loadSession,deleteSession}=require('../lib/session-store.ts')
const{setup}=require('./helpers/adamantine-fixture.cjs')
const{engine,ok}=require('./helpers/mcp-toolkit.cjs')
const{entityVerticalContext}=require('../mcp-server/dist/lib/jumping-state.js')
test.after(()=>pg.restore())

test('a publicly bought ordinary shortbow and actual adamantine arrows cannot attack an object from an observed unsupported height before ammunition, action, time or dice',async t=>{
 // C's final public fixture MUST prepare/purchase the launcher; no bow:true
 // inventory injection is accepted. The source/gel is checked before runtime.
 const f=await setup(t,{kind:'ammunition',bow:true,dice:'19'}),{call}=f
 await f.equip();await f.object()
 let state=await call('get_game_state')
 const shot=f.attack('cross-actual-raised-object-shot'),launcher=state.player.inventory.find(i=>i.id===shot.weaponId),projectiles=state.player.inventory.find(i=>i.id===shot.ammunitionItemId)
 assert.ok(launcher);assert.equal(launcher.equipmentId,'shortbow');assert.equal(launcher.adamantine,undefined)
 assert.ok(projectiles?.adamantine);assert.equal(projectiles.quantity,10)
 assert.equal(state.dmTools.merchants.stocks[launcher.id].status,'sold')
 assert.equal(state.dmTools.merchants.stocks[projectiles.id].status,'sold')
 assert.ok(state.dmTools.merchants.stocks[launcher.id].soldEventId)
 assert.ok(state.dmTools.merchants.stocks[projectiles.id].soldEventId)
 const initialXY={...state.player.position},surfaceId='cross-actual-observed-player-platform',source='Support actuel du personnage réellement mesuré à20pieds et corps actuel mesuré à6pieds, à sa vraie cellule ; qualification géométrique observée, aucun vol, déplacement, hauteur initiale de chute ou rayon cible inventé.'
 // Exact published observation procedure used by the earlier commerce-height
 // witness and explicitly confirmed by C for this ranged-object boundary.
 ok(await call('record_vertical_surface',{eventId:'cross-actual-player-platform-observation',surfaceId,mapId:state.currentMapId,roomId:state.currentRoomId,cells:[state.player.position],kind:'support',elevationFeet:20,actualGeometryConfirmed:true,source}))
 ok(await call('record_physical_body',{eventId:'cross-actual-player-body-observation',entityId:'player',heightFeet:6,actualMeasuredBodyConfirmed:true,source}))
 ok(await call('observe_standing_surface',{eventId:'cross-actual-player-standing-observation',entityId:'player',surfaceId,actualCurrentSupportConfirmed:true,source}))
 state=await call('get_game_state')
 assert.deepEqual(state.player.position,initialXY)
 const vertical=entityVerticalContext(state,'player')
 assert.equal(vertical.known,true);assert.equal(vertical.zFeet,20);assert.equal(vertical.airborne,false)
 assert.equal(vertical.source,'actual_measured_support')
 assert.equal(Object.hasOwn(state.dmTools.objects[shot.objectId],'surfaceZFeet'),false,'No target Z field is invented for the XY-only object')
 const sessionId=`adamantine-real-height-${process.pid}`;t.after(()=>deleteSession(sessionId))
 await saveSession(sessionId,{gameState:state,history:[],adventureId:state.adventureId,characterId:state.characterId})
 const loaded=(await loadSession(sessionId)).gameState;assert.deepEqual(loaded,state)
 const resumed=await engine(t,{adventureId:state.adventureId,characterId:state.characterId,dice:'19'})
 ok(await resumed('replace_game_state',{gameState:loaded}));assert.deepEqual(await resumed('get_game_state'),state)
 const before=await resumed('get_game_state'),failure=await resumed('interact_object',shot)
 assert.equal(failure.code,'PHYSICAL_HEIGHT_POINT_GEOMETRY_REQUIRED',JSON.stringify(failure))
 // This whole-state assertion includes source material/custody/receipts,
 // ammunition expenditure, object HP, all actions, clock and any event debt.
 assert.deepEqual(await resumed('get_game_state'),before)
 assert.equal((await resumed('get_game_state')).player.inventory.find(i=>i.id===projectiles.id).quantity,10)
 assert.equal(ok(await resumed('roll_dice',{notation:'1d20'})).total,19)
 // This is measured relief of the real player, not an invented player-native
 // fall. The genuine coplanar shot is a separate public-acquisition witness.
})
