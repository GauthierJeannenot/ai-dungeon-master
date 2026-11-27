const test=require('node:test'),assert=require('node:assert/strict')
const {engine,ok,replace}=require('./helpers/mcp-toolkit.cjs')
const {getAdventureMap,resolveRoomMapId}=require('../mcp-server/dist/lib/adventure-map.js')
const {isSurprised,EncounterSurpriseInputSchema}=require('../mcp-server/dist/lib/surprise-state.js')
const reason='Le MJ a établi que ces participants précis n’ont pas remarqué la menace.'
const presetId='bakery_floor_goblins'
const selection=(indices=[0],playerSurprised=false)=>({playerSurprised,surprisedMonsterIndices:indices,reason})
const begin=(call,surprise)=>call('start_encounter',{encounterId:presetId,...(surprise===undefined?{}:{surprise})})
const fixture=(t,dice='17')=>engine(t,{adventureId:'grammys-country-apple-pie',dice})
async function refused(call,name,input,code){const before=await call('get_game_state'),answer=await call(name,input);assert.equal(answer.code,code,JSON.stringify(answer));assert.deepEqual(await call('get_game_state'),before)}

test('inspect_encounter exposes the exact confidential zero-based roster with read-only annotations, no discovery or die',async t=>{
 const call=await fixture(t),before=await call('get_game_state'),preset=getAdventureMap(before).encounters[presetId]
 const answer=ok(await call('inspect_encounter',{encounterId:presetId}))
 assert.equal(answer.confidential,true);assert.equal(answer.alreadyTriggered,false);assert.equal(answer.roomId,preset.roomId)
 assert.deepEqual(answer.roster,preset.monsters.map((monster,monsterIndex)=>({monsterIndex,...monster})))
 assert.deepEqual(await call('get_game_state'),before)
 const tool=(await call.client.listTools()).tools.find(tool=>tool.name==='inspect_encounter')
 assert.deepEqual(tool.annotations,{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false})
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,17)
})

test('authored encounter maps only the explicitly selected monster indices and player to real IDs before the actual combat',async t=>{
 const call=await fixture(t,'5,17,19'),inspection=ok(await call('inspect_encounter',{encounterId:presetId}))
 const answer=ok(await begin(call,selection([1],true))),ids=answer.spawnedMonsters.map(monster=>monster.id)
 assert.equal(ids.length,inspection.roster.length);assert.equal(answer.combat.currentTurn,ids[0],'the real group initiative beats the player; no preset override')
 assert.deepEqual(answer.combat.initiativeOrder,[...ids,'player'])
 assert.deepEqual(Object.keys(answer.combat.surprise.actors),['player',ids[1]])
 let state=await call('get_game_state');assert.ok(isSurprised(state,'player'));assert.ok(isSurprised(state,ids[1]));assert.equal(isSurprised(state,ids[0]),false)
 assert.equal(state.encountersTriggered.filter(id=>id===presetId).length,1)
 ok(await call('replace_game_state',{gameState:state}));assert.deepEqual(await call('get_game_state'),state)
 ok(await call('next_turn',{actorId:ids[0],skipAction:true}));state=await call('get_game_state')
 assert.equal(state.currentTurn,ids[1]);assert.equal(isSurprised(state,ids[0]),false);assert.equal(isSurprised(state,'player'),true)
 await refused(call,'move_token',{tokenId:ids[1],toCell:state.monsters[ids[1]].position},'ACTOR_SURPRISED')
 ok(await call('next_turn',{actorId:ids[1]}));state=await call('get_game_state')
 assert.equal(isSurprised(state,ids[1]),false);assert.equal(isSurprised(state,ids[0]),false);assert.equal(state.currentTurn,'player')
 assert.equal(isSurprised(state,'player'),true)
 ok(await call('next_turn',{actorId:'player'}));assert.equal(isSurprised(await call('get_game_state'),'player'),false)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19,'only one player and one group initiative die were consumed')
})

test('absent surprise keeps original placements, the actual group initiative and no surprise state',async t=>{
 const call=await fixture(t,'5,17,19'),before=await call('get_game_state'),preset=getAdventureMap(before).encounters[presetId]
 const answer=ok(await begin(call)),after=await call('get_game_state')
 assert.deepEqual(after.player.position,preset.playerCell);assert.equal(answer.combat.currentTurn,answer.spawnedMonsters[0].id)
 assert.deepEqual(answer.combat.initiativeOrder,[...answer.spawnedMonsters.map(monster=>monster.id),'player'])
 assert.deepEqual(answer.spawnedMonsters.map(monster=>monster.position),preset.monsters.map(monster=>monster.cell))
 assert.equal(after.dmTools?.surprise,undefined)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('duplicate/out-of-roster surprise choices refuse before player move, room visit, IDs, phase or initiative RNG',async t=>{
 const call=await fixture(t,'5,17,19')
 await refused(call,'start_encounter',{encounterId:presetId,surprise:selection([0,0])},'DUPLICATE_SURPRISED_ACTOR')
 await refused(call,'start_encounter',{encounterId:presetId,surprise:selection([3])},'SURPRISED_ACTOR_NOT_IN_COMBAT')
 const answer=ok(await begin(call,selection([1])))
 assert.ok(answer.spawnedMonsters[0].id.endsWith('_0'),'refused choices have not allocated an actor identity')
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('strict selector shape rejects inferred IDs, negative indices, absent player choice and oversized combined selections',async t=>{
 const call=await fixture(t)
 for(const surprise of [
  {surprisedIds:['player'],reason},selection([-1]),{surprisedMonsterIndices:[0],reason},
  selection(Array.from({length:128},(_,i)=>i),true),
 ]){
  assert.equal(EncounterSurpriseInputSchema.safeParse(surprise).success,false)
  await refused(call,'start_encounter',{encounterId:presetId,surprise},'MCP_INPUT_INVALID')
 }
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,17)
})

test('general surprise refuses custom/replacement rosters and an authored ambush argument before all mutations and dice',async t=>{
 const call=await fixture(t),initial=await call('get_game_state'),monster=getAdventureMap(initial).encounters[presetId].monsters[0]
 for(const input of [{monsters:[monster]},{encounterId:presetId,monsters:[monster]}])
  await refused(call,'start_encounter',{...input,surprise:selection()},'ENCOUNTER_SURPRISE_PRESET_REQUIRED')
 await refused(call,'start_encounter',{encounterId:'grammy_apartment_guards',surprise:selection(),ambush:{doorId:'floor-apartment',attackerIndex:0,weaponOrSpell:'Scimitar',suspicious:false}},'ENCOUNTER_SURPRISE_AMBUSH_CONFLICT')
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,17)
})

test('prepared authored awareness retains its exact saved positions and forbids replacement by general surprise',async t=>{
 const call=await fixture(t),encounterId='grammy_apartment_guards'
 await replace(call,state=>{state.player.position={x:8,y:7};state.currentRoomId='8';state.roomsVisited=['8'];state.playerActionRevision=1})
 const moves=[{monsterIndex:0,toCell:{x:9,y:8}},{monsterIndex:1,toCell:{x:9,y:9}},{monsterIndex:2,toCell:{x:7,y:9}}]
 ok(await call('react_to_noise',{encounterId,sourceRoomId:'8',response:'ambush',doorId:'floor-apartment',moves,reason:'Un choc résolu a préparé l’embuscade autorée derrière sa porte.'}))
 const before=await call('get_game_state'),inspection=ok(await call('inspect_encounter',{encounterId}))
 assert.equal(inspection.awareness.status,'ambushing');assert.deepEqual(inspection.roster.map(monster=>monster.cell),moves.map(move=>move.toCell))
 assert.deepEqual(await call('get_game_state'),before)
 await refused(call,'start_encounter',{encounterId,surprise:selection([0],true)},'ENCOUNTER_SURPRISE_AMBUSH_CONFLICT')
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,17)
})

test('inspection requires one exact current-map preset, rejecting unknown/prototype names without state or dice changes',async t=>{
 const call=await fixture(t)
 for(const encounterId of ['missing','constructor','__proto__'])await refused(call,'inspect_encounter',{encounterId},'UNKNOWN_ENCOUNTER')
 const other=await engine(t,{dice:'17'}),state=await other('get_game_state')
 const preset=Object.values(getAdventureMap(state).encounters).find(preset=>resolveRoomMapId(preset.roomId,state)!==state.currentMapId)
 assert.ok(preset,'actual module includes another-map preset')
 await refused(other,'inspect_encounter',{encounterId:preset.id},'ENCOUNTER_WRONG_MAP')
 await refused(other,'start_encounter',{encounterId:preset.id,surprise:selection()},'ENCOUNTER_WRONG_MAP')
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,17)
 assert.equal(ok(await other('roll_dice',{notation:'1d20'})).total,17)
})

test('legacy exhaustion without its level refuses surprise encounter entry before any spawn, identity or die',async t=>{
 const call=await fixture(t)
 await replace(call,state=>state.player.conditions.push('exhaustion'))
 await refused(call,'start_encounter',{encounterId:presetId,surprise:selection()},'EXHAUSTION_LEVEL_REQUIRED')
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,17)
})

test('installed dungeon roster is inspectable during an actual held roll and starts with the exact selected surprise after resolution',async t=>{
 const call=await engine(t,{dice:'11,19'}),initial=await call('get_game_state')
 const layout=ok(await call('generate_dungeon',{seed:'surprise-roster',width:3,height:3,count:5})).layout
 const installed=ok(await call('install_dungeon',{dungeonId:'surprise-side',layout,entranceCell:initial.player.position,
  questLink:{goal:'Retrouver la personne recherchée.',lead:'Cette piste concrète mène à un indice de la quête.',delivery:'clue',discoveryDc:15}}))
 ok(await call('travel_to_map',{transitionId:installed.entryTransitionId}))
 await replace(call,state=>state.hero.inspiration.push({targetId:'player',expiresAt:state.worldTimeSeconds+600,die:8}))
 const held=ok(await call('roll_ability_check',{entityId:'player',ability:'wis',skill:'perception',dc:12}));assert.ok(held.pendingReaction)
 const before=await call('get_game_state'),encounterId=installed.encounters[0],inspection=ok(await call('inspect_encounter',{encounterId}))
 assert.equal(inspection.mapId,installed.mapId);assert.equal(inspection.roster[0].monsterIndex,0)
 assert.deepEqual(await call('get_game_state'),before)
 await refused(call,'start_encounter',{encounterId,surprise:selection()},'REACTION_PENDING')
 ok(await call('resolve_reaction',{pendingId:held.pendingReaction.id,choice:'decline'}))
 const state=await call('get_game_state'),events=getAdventureMap(state).rooms.flatMap(room=>room.navigationEvent?[room.navigationEvent.id]:[])
 ok(await call('move_token',{tokenId:'player',roomId:inspection.roomId,acknowledgeEventIds:events}))
 const started=ok(await call('start_encounter',{encounterId,surprise:selection()})),id=started.spawnedMonsters[0].id
 assert.deepEqual(Object.keys(started.combat.surprise.actors),[id]);assert.equal(started.spawnedMonsters[0].type,inspection.roster[0].monsterType)
})
