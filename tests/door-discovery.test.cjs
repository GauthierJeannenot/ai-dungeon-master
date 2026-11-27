const test=require('node:test'),assert=require('node:assert/strict')
process.env.MONETIZATION_ENABLED='false'
const {installPgMem}=require('./helpers/pg-mem.cjs'),pg=installPgMem()
const {engine,ok,replace,spawn,battle}=require('./helpers/mcp-toolkit.cjs')
const {getAdventureMap,getMapSpec}=require('../mcp-server/dist/lib/adventure-map.js')
const {roomDoorActions}=require('../lib/door-navigation.ts')
const {nearbyRoomPerception}=require('../mcp-server/dist/lib/scene-perception.js')
const {navigationGrid}=require('../mcp-server/dist/lib/navigation.js')
const {edgeKey}=require('../mcp-server/dist/lib/battlemap-geometry.js')
const {buildPlayerState}=require('../mcp-server/dist/lib/character-registry.js')
const {initialHeroState}=require('../mcp-server/dist/lib/hero-state.js')
const {playerDoorGeometry,hiddenDoorWallMasks}=require('../mcp-server/dist/lib/door-discovery.js')
const {saveSession,loadSession,deleteSession}=require('../lib/session-store.ts')
const ts=require('typescript'),fs=require('node:fs'),previousTsx=require.extensions['.tsx']
require.extensions['.tsx']=(mod,filename)=>mod._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,filename)
test.after(()=>{if(previousTsx)require.extensions['.tsx']=previousTsx;else delete require.extensions['.tsx']})
const React=require('react'),{renderToStaticMarkup}=require('react-dom/server'),MapFog=require('../components/MapFog.tsx').default
test.after(()=>pg.restore())
const definition=(extra={})=>({kind:'secret',sourceDescription:'Une vraie porte existante se confond avec le mur ; les joints constituent les signes visuels établis.',detectionDc:15,...extra})
const concealed=()=>({kind:'concealed',sourceDescription:'La porte existante est réellement couverte par une tapisserie.',
 concealment:{description:'Tapisserie réelle devant cette porte.',stepId:'look-behind-tapestry',stepDescription:'Regarder derrière cette tapisserie précise.',operation:'look'},
 signs:{dc:1,description:'Des traces et le bord récemment déplacé de la tapisserie sont visibles.'}})
const input=(door,method,eventId,extra={})=>({doorId:door.id,cell:door.side.cell,method,eventId,...extra})
function prepared(state){return Object.values(state.dmTools.doorDiscovery.records)[0]}
async function hydrate(call){const state=await call('get_game_state');ok(await call('replace_game_state',{gameState:state}));assert.deepEqual(await call('get_game_state'),state);return state}
async function refused(call,name,args,code){const before=await call('get_game_state'),result=await call(name,args);assert.ok(result.error,JSON.stringify(result));if(code)assert.equal(result.code,code,JSON.stringify(result));assert.deepEqual(await call('get_game_state'),before)}
async function fixture(t,{dice='19',def=definition(),sideRoom='1',near=true,doorId='front'}={}){
 const call=await engine(t,{adventureId:'grammys-country-apple-pie',dice}),state=await call('get_game_state')
 // The small reviewed door map normally uses a historical level1 sheet.
 // Establish the real same-character level3 SRD fixture before scene prep.
 await replace(call,s=>{s.player=buildPlayerState({characterId:s.characterId,level:3,position:s.player.position});s.hero=initialHeroState(s.player.classId,3)})
 const raw=getAdventureMap(state).doors.find(door=>door.id===doorId),door={...raw,side:raw.sides.find(side=>side.roomId===sideRoom)}
 if(near)await replace(call,s=>{s.player.position={...door.side.cell};s.currentRoomId=sideRoom;s.roomsVisited=[...new Set([...s.roomsVisited,sideRoom])]})
 const configure={eventId:'established-door',doorId:door.id,definition:def}
 ok(await call('configure_hidden_door',configure));return{call,door,configure}
}

test('a prepared hidden door creates no geometry/knowledge and raw movement or a generic check never discovers it; failed/successful searches retain exact receipts',async t=>{
 const {call,door,configure}=await fixture(t,{dice:'20,1,20,19',near:false})
 let state=await hydrate(call);assert.equal(prepared(state).discovered,undefined);assert.equal(roomDoorActions(state).some(action=>action.id===door.id),false)
 const catalog=getAdventureMap(state).doors.find(d=>d.id===door.id);assert.equal(catalog.initialState,'closed');assert.equal(catalog.discovery,undefined)
 await refused(call,'interact_door',{doorId:door.id,action:'open'},'DOOR_NOT_ACCESSIBLE')
 await refused(call,'preview_navigation',{tokenId:'player',doorId:door.id,doorMode:'approach'},'DOOR_NOT_ACCESSIBLE')
 await refused(call,'move_token',{tokenId:'player',doorId:door.id,doorMode:'cross'},'DOOR_NOT_ACCESSIBLE')
 await refused(call,'resolve_door_discovery',input(door,'search','too-far'),'SCENE_TARGET_OUT_OF_REACH')
 ok(await call('move_token',{tokenId:'player',toCell:door.side.cell}));state=await hydrate(call);assert.equal(prepared(state).discovered,undefined)
 ok(await call('roll_ability_check',{ability:'wis',skill:'perception',dc:1}));assert.equal(prepared(await call('get_game_state')).discovered,undefined)
 const firstInput=input(door,'search','first-search'),failed=ok(await call('resolve_door_discovery',firstInput));assert.equal(failed.success,false);assert.equal(failed.check.roll.rolls[0],1)
 state=await hydrate(call);assert.equal(ok(await call('resolve_door_discovery',firstInput)).replayed,true);assert.deepEqual(await call('get_game_state'),state)
 await refused(call,'resolve_door_discovery',{...firstInput,method:'passive'},'DOOR_DISCOVERY_EVENT_CONFLICT')
 const success=ok(await call('resolve_door_discovery',input(door,'search','second-search')));assert.equal(success.discovered,true);assert.equal(success.check.roll.rolls[0],20)
 state=await hydrate(call);assert.equal(prepared(state).discovered.eventId,'second-search');assert.equal(state.sceneMemory?.doorStates?.front??door.initialState,'closed')
 assert.equal(roomDoorActions(state).some(action=>action.id===door.id),true)
 ok(await call('configure_hidden_door',configure));assert.deepEqual(await call('get_game_state'),state)
 await refused(call,'interact_door',{doorId:door.id,action:'open'},'DOOR_BARRED')
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('secret passive perception detects at the real source DC without a die or action, including another combatants turn',async t=>{
 const {call,door}=await fixture(t,{def:definition({detectionDc:1})}),other=await spawn(call,'commoner');await battle(call,[other.id],other.id)
 const before=await call('get_game_state'),result=ok(await call('resolve_door_discovery',input(door,'passive','passive-observation')))
 assert.equal(result.discovered,true);assert.equal(result.actionSpent,false);assert.ok(result.check.score>=1)
 const state=await hydrate(call);assert.deepEqual(state.actionUsed,before.actionUsed);assert.equal(state.hero.actionCredits,before.hero.actionCredits);assert.equal(state.currentTurn,other.id)
 assert.equal(state.sceneMemory?.doorStates?.front??door.initialState,'closed');assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('concealed passive perception reveals only actual signs; the exact correct-place step finds the door without a check and spends one Search action',async t=>{
 const {call,door}=await fixture(t,{def:concealed()}),other=await spawn(call,'commoner');await battle(call,[other.id])
 const signs=ok(await call('resolve_door_discovery',input(door,'passive','noticed-tracks')));assert.equal(signs.clueNoticed,true);assert.equal(signs.discovered,false)
 let state=await hydrate(call);assert.equal(roomDoorActions(state).some(action=>action.id===door.id),false);assert.equal(state.hero.actionCredits,1)
 await refused(call,'resolve_door_discovery',input(door,'search','no-invented-dc'),'CONCEALED_DOOR_REVEAL_STEP_REQUIRED')
 await refused(call,'resolve_door_discovery',input(door,'reveal','wrong-step',{revealStepId:'invented-step'}),'DOOR_REVEAL_STEP_REQUIRED')
 const revealInput=input(door,'reveal','looked-in-right-place',{revealStepId:'look-behind-tapestry'}),revealed=ok(await call('resolve_door_discovery',revealInput))
 assert.equal(revealed.discovered,true);assert.equal(revealed.check,undefined);assert.equal(revealed.actionSpent,true)
 state=await hydrate(call);assert.equal(state.hero.actionCredits,0);assert.equal(state.actionUsed.player,true);assert.equal(state.sceneMemory?.doorStates?.front??door.initialState,'closed')
 ok(await call('resolve_door_discovery',revealInput));assert.deepEqual(await call('get_game_state'),state)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('finding an optional secret mechanism does not operate it; failed Investigation and actual turn costs remain distinct from a later opening',async t=>{
 const {call,door}=await fixture(t,{dice:'1,20,19',sideRoom:'4',def:definition({detectionDc:1,mechanism:{investigationDc:12,instruction:'Tourner le petit disque effectivement établi dans le montant.'}})})
 await refused(call,'resolve_door_discovery',input(door,'investigate','before-detection'),'DOOR_MECHANISM_SOURCE_REQUIRED')
 ok(await call('resolve_door_discovery',input(door,'passive','found-door')))
 const other=await spawn(call,'commoner');await battle(call,[other.id])
 await refused(call,'interact_door',{doorId:door.id,action:'open'},'DOOR_MECHANISM_UNKNOWN')
 const failed=ok(await call('resolve_door_discovery',input(door,'investigate','first-mechanism')));assert.equal(failed.success,false);assert.equal(failed.actionSpent,true)
 let state=await hydrate(call);assert.equal(prepared(state).mechanismUnderstood,undefined)
 ok(await call('next_turn',{actorId:'player'}));ok(await call('next_turn',{actorId:other.id,skipAction:true}))
 const solved=ok(await call('resolve_door_discovery',input(door,'investigate','second-mechanism')));assert.equal(solved.mechanismKnown,true);assert.ok(solved.openingInstruction)
 state=await hydrate(call);assert.equal(state.sceneMemory.doorStates?.front??door.initialState,'closed')
 const position=state.player.position
 ok(await call('next_turn',{actorId:'player'}));ok(await call('next_turn',{actorId:other.id,skipAction:true}))
 ok(await call('interact_door',{doorId:door.id,action:'open'}));state=await hydrate(call);assert.equal(state.sceneMemory.doorStates.front,'open');assert.deepEqual(state.player.position,position)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('darkness and missing source/location refuse before dice/actions, while real dim light affects passive score and the active d20',async t=>{
 const {call,door}=await fixture(t,{dice:'20,1,19'})
 await refused(call,'resolve_door_discovery',{...input(door,'search','wrong-location'),cell:{x:0,y:0}},'DOOR_DISCOVERY_LOCATION_REQUIRED')
 ok(await call('configure_scene_lighting',{roomId:door.side.roomId,illumination:'darkness'}))
 await refused(call,'resolve_door_discovery',input(door,'passive','no-sight'),'DOOR_DISCOVERY_SIGHT_REQUIRED')
 ok(await call('configure_scene_lighting',{roomId:door.side.roomId,illumination:'dim'}))
 const passive=ok(await call('resolve_door_discovery',input(door,'passive','dim-passive')));assert.equal(passive.check.adjustment,-5);assert.equal(passive.discovered,false)
 const searched=ok(await call('resolve_door_discovery',input(door,'search','dim-search')));assert.match(searched.check.roll.detail,/DIS/);assert.equal(searched.check.roll.rolls[0],1);assert.equal(searched.discovered,false)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('preparation cannot invent an exit, reuse a changed definition, set implicit secret DCs or conceal an already open panel',async t=>{
 const {call,configure}=await fixture(t)
 await refused(call,'configure_hidden_door',{...configure,eventId:'fake-exit',doorId:'invented-from-text'},'HIDDEN_DOOR_EXISTING_PANEL_REQUIRED')
 await refused(call,'configure_hidden_door',{...configure,definition:definition({detectionDc:1})},'HIDDEN_DOOR_DEFINITION_IMMUTABLE')
 await refused(call,'configure_hidden_door',{eventId:'missing-source-dc',doorId:'entry-apartment',definition:{kind:'secret',sourceDescription:'Source sans DD.'}})
 await refused(call,'configure_hidden_door',{...configure,eventId:'open-panel',doorId:'entry-floor'},'HIDDEN_DOOR_CLOSED_SOURCE_REQUIRED')
 const inspect=await call('get_game_state');ok(await call('inspect_hidden_doors'));assert.deepEqual(await call('get_game_state'),inspect)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('a held Search persists through SQL and hydration, resumes exactly one original die and spends one action',async t=>{
 const {call,door}=await fixture(t,{dice:'10,5,19'}),other=await spawn(call,'commoner');await battle(call,[other.id])
 await replace(call,state=>state.hero.inspiration.push({targetId:'player',die:8,expiresAt:600}))
 const attempt=input(door,'search','held-search'),held=ok(await call('resolve_door_discovery',attempt));assert.ok(held.pendingReaction)
 let state=await hydrate(call);assert.equal(prepared(state).discovered,undefined);assert.equal(state.hero.actionCredits,1)
 const id=`hidden-door-sql-${process.pid}`;t.after(()=>deleteSession(id))
 await saveSession(id,{gameState:state,history:[],adventureId:state.adventureId,characterId:state.characterId})
 const loaded=await loadSession(id);assert.deepEqual(loaded.gameState,state);ok(await call('replace_game_state',{gameState:loaded.gameState}))
 const corrupt=structuredClone(state);corrupt.player.position.x-=1
 await refused(call,'replace_game_state',{gameState:corrupt},'DOOR_DISCOVERY_STATE_MISMATCH')
 const retry=ok(await call('resolve_door_discovery',attempt));assert.equal(retry.alreadyPending,true);assert.deepEqual(await call('get_game_state'),state)
 await refused(call,'move_token',{tokenId:'player',toCell:{x:door.side.cell.x-1,y:door.side.cell.y}},'REACTION_PENDING')
 const result=ok(await call('resolve_reaction',{pendingId:held.pendingReaction.id,choice:'bardic_inspiration'}));assert.equal(result.discovered,true);assert.equal(result.check.roll.rolls[0],10)
 state=await hydrate(call);assert.equal(state.hero.actionCredits,0);assert.equal(state.hero.inspiration.length,0)
 await saveSession(id,{gameState:state,history:[],adventureId:state.adventureId,characterId:state.characterId});assert.deepEqual((await loadSession(id)).gameState,state)
 ok(await call('resolve_door_discovery',attempt));assert.deepEqual(await call('get_game_state'),state)
 const forged=structuredClone(state);prepared(forged).discovered.eventId='nonexistent-success'
 await refused(call,'replace_game_state',{gameState:forged},'DOOR_DISCOVERY_STATE_MISMATCH')
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('player map/perception/paths hide unknown panels, physical NPC geometry stays real and known thresholds retain their picture gap',async t=>{
 const {call,door}=await fixture(t,{def:definition({detectionDc:1})}),other=await spawn(call,'commoner')
 const state=await hydrate(call),map=getMapSpec(state.currentMapId,state),geometry=structuredClone(map.geometry),[a,b]=door.sides
 assert.equal(navigationGrid(state,'player',map.geometry).step(a.cell,b.cell,true,false),false)
 assert.equal(navigationGrid(state,other.id,map.geometry).step(a.cell,b.cell,true,false),true)
 assert.equal(navigationGrid(state,'player',map.geometry,{ignoreDoorKnowledge:true}).step(a.cell,b.cell,true,false),true)
 assert.equal(nearbyRoomPerception(state).some(room=>room.doors.some(item=>item.doorId===door.id)),false)
 const projected=playerDoorGeometry(state,map.geometry);assert.ok(projected.edges.some(edge=>edge.kind==='wall'&&edgeKey(edge.from,edge.to)===edgeKey(a.cell,b.cell)))
 const walls=hiddenDoorWallMasks(state);assert.ok(walls.length>1,'the normal surrounding walls use the same stroke, not a special secret point')
 const picture=renderToStaticMarkup(React.createElement(MapFog,{gameState:state,width:1700,height:1500}));assert.equal((picture.match(/<line /g)||[]).length,walls.length);assert.doesNotMatch(picture,/front|Porte extérieure/)
 assert.deepEqual(map.geometry,geometry)
 ok(await call('resolve_door_discovery',input(door,'passive','actually-noticed')))
 const known=await hydrate(call);assert.equal(hiddenDoorWallMasks(known).length,0);assert.deepEqual(playerDoorGeometry(known,map.geometry),geometry)
 const knownPicture=renderToStaticMarkup(React.createElement(MapFog,{gameState:known,width:1700,height:1500}));assert.doesNotMatch(knownPicture,/<line /)
 assert.equal(roomDoorActions(known).some(action=>action.id===door.id),true)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('a concealed moving cover requires a real free hand before its no-die discovery action',async t=>{
 const def=concealed();def.concealment.operation='move_cover'
 const {call,door}=await fixture(t,{def})
 const attempt=input(door,'reveal','actually-moved-cover',{revealStepId:'look-behind-tapestry'})
 await refused(call,'resolve_door_discovery',attempt,'DOOR_COVER_FREE_HAND_REQUIRED')
 const state=await call('get_game_state'),weapon=state.player.inventory.find(item=>item.type==='weapon').id
 ok(await call('equip_item',{itemId:weapon,slot:'main_hand',operation:'unequip'}))
 assert.equal(ok(await call('resolve_door_discovery',attempt)).discovered,true)
 await hydrate(call);assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('an ununderstood secret can be broken only with an established wall/door Strength DC; no legacy default or invented skill applies',async t=>{
 const {call,door}=await fixture(t,{doorId:'floor-office',sideRoom:'8',def:definition({detectionDc:1,mechanism:{investigationDc:20,instruction:'Mécanisme non évident réellement établi.'}})})
 ok(await call('resolve_door_discovery',input(door,'passive','found-office-door')))
 await refused(call,'interact_door',{doorId:door.id,action:'force'},'DOOR_FORCE_DC_REQUIRED')
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('explicitly established breaking difficulty uses a real plain Strength check and leaves the unknown mechanism and traps untouched',async t=>{
 const {call,door}=await fixture(t,{dice:'1,20,19',doorId:'floor-office',sideRoom:'8',def:definition({detectionDc:1,forceDc:14,mechanism:{investigationDc:20,instruction:'Mécanisme non évident réellement établi.'}})})
 ok(await call('resolve_door_discovery',input(door,'passive','found-breakable-door')))
 const before=await call('get_game_state'),failed=ok(await call('interact_door',{doorId:door.id,action:'force'}));assert.equal(failed.check.dc,14);assert.equal(failed.check.proficient,false);assert.equal(failed.doorState,'closed')
 const forced=ok(await call('interact_door',{doorId:door.id,action:'force'}));assert.equal(forced.doorState,'broken')
 const state=await hydrate(call);assert.equal(prepared(state).mechanismUnderstood,undefined);assert.deepEqual(state.dmTools.traps,before.dmTools.traps);assert.deepEqual(state.player.position,before.player.position)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('a legacy map masks the ordinary doorway boundary and retains discovery per actual map across a floor change',async t=>{
 const call=await engine(t,{dice:'19'}),state=await call('get_game_state'),raw=getAdventureMap(state).doors.find(door=>door.id==='north_cell')
 const side=raw.sides.find(side=>side.roomId==='27'),door={...raw,side}
 await replace(call,s=>{s.currentMapId='cellar';s.currentRoomId='27';s.player.position={...side.cell};s.roomsVisited.push('27')})
 ok(await call('configure_hidden_door',{eventId:'actual-cellar-panel',doorId:door.id,definition:definition({detectionDc:1})}))
 let cellar=await hydrate(call);assert.equal(getMapSpec(cellar.currentMapId,cellar).geometry,undefined);assert.ok(hiddenDoorWallMasks(cellar).length>0)
 await replace(call,s=>{s.currentMapId='temple';s.currentRoomId='18';s.player.position={x:12,y:3};s.roomsVisited.push('18')})
 let other=await hydrate(call);assert.equal(hiddenDoorWallMasks(other).length,0);assert.equal(ok(await call('inspect_hidden_doors')).records.length,0);assert.deepEqual(other.dmTools.doorDiscovery,cellar.dmTools.doorDiscovery)
 await replace(call,s=>{s.currentMapId='cellar';s.currentRoomId='27';s.player.position={...side.cell}})
 assert.equal(ok(await call('resolve_door_discovery',input(door,'passive','noticed-cellar-panel'))).discovered,true)
 cellar=await hydrate(call);assert.equal(hiddenDoorWallMasks(cellar).length,0);assert.equal(prepared(cellar).mapId,'cellar')
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
