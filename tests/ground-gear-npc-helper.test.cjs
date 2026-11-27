const test=require('node:test'),assert=require('node:assert/strict')
process.env.MONETIZATION_ENABLED='false'
const{installPgMem}=require('./helpers/pg-mem.cjs'),pg=installPgMem()
const{saveSession,loadSession,deleteSession}=require('../lib/session-store.ts')
const{engine,ok,replace,adjacent}=require('./helpers/mcp-toolkit.cjs')
test.after(()=>pg.restore())
test('a capable actual NPC chooses its pace and opens the unconscious zeroHP player trap using only its own real action',async t=>{
 const call=await engine(t,{dice:'20,1,1,1,20,19'})
 let state=await call('get_game_state')
 if(!state.dmTools?.loadout){const weapon=state.player.inventory.find(i=>i.type==='weapon');if(weapon)ok(await call('equip_item',{itemId:weapon.id,operation:'unequip',slot:'main_hand'}))}
 for(const[key,slot]of [['mainHandId','main_hand'],['offHandId','off_hand'],['shieldId','shield']]){state=await call('get_game_state');if(state.dmTools?.loadout?.[key])ok(await call('equip_item',{itemId:state.dmTools.loadout[key],operation:'unequip',slot}))}
 state=await call('get_game_state');const neighbors=adjacent(state)
 const pair=neighbors.flatMap(a=>neighbors.filter(b=>(a.x!==b.x||a.y!==b.y)&&Math.max(Math.abs(a.x-b.x),Math.abs(a.y-b.y))<=1).map(b=>[a,b]))[0];assert.ok(pair,'Two actual neighboring reachable cells are needed')
 const[trapCell,helperCell]=pair
 ok(await call('create_scene_object',{objectId:'real-helper-trap-stock',name:'Caisse réelle',description:'Un piège de chasse effectivement présent.',cell:state.player.position,kind:'container',material:'wood',size:'small',resilience:'fragile',contents:['hunting_trap']}))
 const item=ok(await call('interact_object',{objectId:'real-helper-trap-stock',action:'open'})).releasedItems[0];ok(await call('pick_up_item',{itemId:item.id}))
 ok(await call('create_scene_object',{objectId:'real-helper-trap-anchor',name:'Anneau fixe',description:'Un anneau physiquement fixé à cette dalle.',cell:trapCell,kind:'lever',material:'iron',size:'tiny',resilience:'resilient'}))
 const surface=ok(await call('record_scene_fact',{description:'La vraie dalle stable au planZ0 porte le dispositif et sa chaîne est réellement fixée à cet anneau immobile.',cell:trapCell})).worldFact
 ok(await call('place_ground_gear',{placementId:'real-helper-trap',itemId:item.id,originCell:trapCell,surfaceZFeet:0,surfaceFactId:surface.id,anchorObjectId:'real-helper-trap-anchor',anchorFactId:surface.id,immobileAnchorConfirmed:true}))
 ok(await call('create_npc',{npcId:'actual-capable-helper',name:'Aide présent',statBlock:'goblin',cell:helperCell,disposition:'neutral',visible:true,description:'Un aide réel qui choisit ici de libérer le corps pris au piège.'}))
 await replace(call,s=>{s.player.hp.current=1}) // Genuine pre-existing injury fixture before this actual damaging contact.
 ok(await call('enter_combat',{combatants:['player','actual-capable-helper'],hazardPreparation:{kind:'ground_gear',hazardId:'real-helper-trap'}}))
 const moved=ok(await call('move_token',{tokenId:'player',toCell:trapCell}));assert.equal(moved.stopReason,'ground_gear_contact')
 ok(await call('resolve_ground_gear_contact',{contactId:moved.groundGearContactIds[0],orderedPlacementIds:['real-helper-trap'],plateContacts:[{placementId:'real-helper-trap',stepped:true,source:'Le pied réel du joueur a effectivement pressé la petite plaque à cette entrée.'}]}))
 state=await call('get_game_state');assert.equal(state.player.hp.current,0);assert.ok(state.player.conditions.includes('unconscious'));assert.equal(state.dmTools.groundGear.placements['real-helper-trap'].victimId,'player')
 ok(await call('next_turn',{actorId:'player',skipAction:true}));state=await call('get_game_state');assert.equal(state.currentTurn,'actual-capable-helper')
 const id=`helper-zero-${process.pid}`;t.after(()=>deleteSession(id));await saveSession(id,{gameState:state,history:[],adventureId:state.adventureId,characterId:state.characterId});ok(await call('replace_game_state',{gameState:(await loadSession(id)).gameState}))
 const before=await call('get_game_state')
 ok(await call('set_ground_gear_pace',{eventId:'helper-careful-choice',entityId:'actual-capable-helper',pace:'careful'}))
 assert.equal((await call('get_game_state')).actionUsed['actual-capable-helper']??false,false)
 const opened=ok(await call('escape_hunting_trap',{eventId:'helper-actual-opening',placementId:'real-helper-trap',actorId:'actual-capable-helper',targetId:'player'})),after=await call('get_game_state')
 assert.equal(opened.freed,true);assert.equal(opened.check.entityId,'actual-capable-helper');assert.equal(after.actionUsed['actual-capable-helper'],true)
 assert.equal(after.dmTools.groundGear.placements['real-helper-trap'].victimId,undefined);assert.deepEqual(after.player.hp,before.player.hp);assert.deepEqual(after.player.deathSaves,before.player.deathSaves);assert.deepEqual(after.player.conditions,before.player.conditions);assert.equal(after.worldTimeSeconds,before.worldTimeSeconds)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('restoring an older positiveHP improvised NPC fills its exact retained SRD block without healing, revealing or activating it',async t=>{
 const call=await engine(t,{dice:'19'}),initial=await call('get_game_state'),cell=adjacent(initial)[0]
 const created=ok(await call('create_npc',{npcId:'legacy-sourced-helper',name:'Acteur improvisé existant',statBlock:'goblin',cell,disposition:'neutral',visible:true,description:'Un acteur réel conservé dans une ancienne sauvegarde.'}))
 assert.equal(created.npc.type,'goblin');assert.ok(created.npc.statBlock.sourceSha256)
 const state=await call('get_game_state'),npc=state.npcs['legacy-sourced-helper']
 const bare={id:npc.id,name:npc.name,kind:npc.kind,position:npc.position,mapId:npc.mapId,roomId:npc.roomId,visible:false,disposition:npc.disposition,description:npc.description,hp:{current:3,max:7},conditions:['prone']}
 state.npcs[npc.id]=bare
 ok(await call('replace_game_state',{gameState:state}));const after=await call('get_game_state'),restored=after.npcs[npc.id]
 const source=require('../mcp-server/dist/lib/srd/monsters.js').getMonsterRecord('goblin')
 assert.equal(restored.type,'goblin');assert.equal(restored.ac,source.engine.ac);assert.deepEqual(restored.stats,source.engine.stats);assert.equal(restored.speed,source.engine.speed);assert.equal(restored.statBlock.sourceSha256,source.sourceSha256)
 for(const key of Object.keys(bare))assert.deepEqual(restored[key],bare[key],key)
 assert.equal(restored.isAlive,true);assert.deepEqual(after.monsters,state.monsters);assert.deepEqual(after.initiativeOrder,state.initiativeOrder);assert.equal(after.worldTimeSeconds,state.worldTimeSeconds);assert.deepEqual(after.player,state.player)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('an older improvised zeroHP NPC without a life witness is retained without invented death, revival or combat activation',async t=>{
 const call=await engine(t,{dice:'19'}),initial=await call('get_game_state'),cell=adjacent(initial)[0]
 ok(await call('create_npc',{npcId:'legacy-unknown-zero',name:'Acteur ancien à zéro PV',statBlock:'goblin',cell,disposition:'neutral',visible:true,description:'L’ancienne sauvegarde ne dit pas si ce corps est mort ou vivant.'}))
 const state=await call('get_game_state'),npc=state.npcs['legacy-unknown-zero']
 const bare={id:npc.id,name:npc.name,kind:npc.kind,position:npc.position,mapId:npc.mapId,roomId:npc.roomId,visible:npc.visible,disposition:npc.disposition,description:npc.description,hp:{current:0,max:7},conditions:['unconscious']}
 state.npcs[npc.id]=bare;ok(await call('replace_game_state',{gameState:state}));const after=await call('get_game_state')
 assert.deepEqual(after.npcs[npc.id],bare);assert.equal(after.npcs[npc.id].isAlive,undefined);assert.equal(after.monsters[npc.id],undefined);assert.deepEqual(after.initiativeOrder,state.initiativeOrder);assert.equal(after.worldTimeSeconds,state.worldTimeSeconds)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
