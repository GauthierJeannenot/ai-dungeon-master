const test=require('node:test'),assert=require('node:assert/strict')
process.env.MONETIZATION_ENABLED='false'
const {installPgMem}=require('./helpers/pg-mem.cjs'),pg=installPgMem()
const {saveSession,loadSession,deleteSession}=require('../lib/session-store.ts')
const {engine,ok,replace,battle,spawn,grid}=require('./helpers/mcp-toolkit.cjs')
const {inferRoomIdOnMap}=require('../mcp-server/dist/lib/adventure-map.js')
test.after(()=>pg.restore())
const source='Physical collection actually observed and explicitly timed by the MJ; no published tariff or fractional mass inferred.'
test('continuous recovery stops at an actual existing affliction event without guessing its future outcome',()=>{
 const {groundGearRecoveryActivityIssue}=require('../mcp-server/dist/lib/ground-gear-recovery-state.js')
 const record={id:'real-next-poison-save',templateId:'pale_tincture',targetId:'player',status:'active',nextAt:86400},state={phase:'exploration',worldTimeSeconds:86390,dmTools:{afflictions:{records:{poison:record}}}}
 assert.equal(groundGearRecoveryActivityIssue(state,10),null)
 assert.equal(groundGearRecoveryActivityIssue(state,11).boundaryAt,86400)
 record.petrificationPause={pausedAt:86390,effects:[]};assert.equal(groundGearRecoveryActivityIssue(state,11),null)
})
async function fact(call,description,cell){return ok(await call('record_scene_fact',{description,cell})).worldFact.id}
async function setup(t,{kind='caltrops',dice='19',original=false}={}){
 const call=await engine(t,{dice}),count=kind==='ball_bearings'?1000:kind==='caltrops'?20:1
 await replace(call,s=>s.player.inventory.push({id:'real-source-lot',equipmentId:kind,name:'Lot physique réel',type:'misc',quantity:1},{id:'real-recovery-pouch',equipmentId:'pouch',name:'Bourse réellement possédée',type:'misc',quantity:1}))
 let state=await call('get_game_state')
 if(!state.dmTools?.loadout){const held=state.player.inventory.find(i=>i.type==='weapon');if(held){ok(await call('equip_item',{itemId:held.id,operation:'unequip',slot:'main_hand'}));state=await call('get_game_state')}}
 for(const[key,slot]of [['mainHandId','main_hand'],['offHandId','off_hand'],['shieldId','shield']])if(state.dmTools?.loadout?.[key]){ok(await call('equip_item',{itemId:state.dmTools.loadout[key],operation:'unequip',slot}));state=await call('get_game_state')}
 let origin={...state.player.position}
 if(kind==='ball_bearings'){
  const nav=grid(state),choices=[]
  for(let dx=-1;dx<=0;dx++)for(let dy=-1;dy<=0;dy++){const cell={x:state.player.position.x+dx,y:state.player.position.y+dy},cells=[cell,{x:cell.x+1,y:cell.y},{x:cell.x,y:cell.y+1},{x:cell.x+1,y:cell.y+1}];if(cells.every(c=>nav.valid(c)&&nav.free(c,false)&&inferRoomIdOnMap(c,state.currentMapId,state)===state.currentRoomId))choices.push(cell)}
  assert.ok(choices.length,'real level source square must fit');origin=choices[0]
 }
 const surfaceFactId=await fact(call,'Le sol réellement existant est horizontal, stable et au plan Z0 de cette carte.',origin)
 const placement={placementId:'real-placed-gear',itemId:'real-source-lot',originCell:origin,surfaceZFeet:0,surfaceFactId,...kind==='ball_bearings'?{levelSurfaceConfirmed:true}:{}}
 if(kind==='hunting_trap'){
  ok(await call('create_scene_object',{objectId:'actual-fixed-anchor',name:'Anneau fixe',description:'Un vrai anneau ancré dans la dalle.',cell:origin,kind:'lever',material:'iron',size:'tiny',resilience:'resilient'}))
  placement.anchorObjectId='actual-fixed-anchor';placement.anchorFactId=await fact(call,'Cet anneau existant est réellement immobile et la vraie chaîne du piège y est fixée.',origin);placement.immobileAnchorConfirmed=true
 }
 ok(await call('place_ground_gear',placement))
 const containerFactId=await fact(call,'Le récipient existant choisi peut réellement contenir les unités sélectionnées, compte tenu de son contenu actuel.',original?origin:state.player.position)
 const remainingCoverageFactId=await fact(call,'Après cette collecte partielle précisément observée, les unités restantes couvrent toujours les cellules explicitement choisies.',origin)
 const start={eventId:'start-real-recovery',recoveryId:'real-recovery',placementId:placement.placementId,units:kind==='hunting_trap'?1:count/2,containerItemId:original?'real-source-lot':'real-recovery-pouch',containerFactId,actualContainerConfirmed:true,availableCapacityUnits:count,capacityForCurrentContentsConfirmed:true,requiredSeconds:12,workSeconds:6,
  remainingCells:(await call('get_game_state')).dmTools.groundGear.placements[placement.placementId].cells,remainingCoverageFactId,remainingCoverageConfirmed:true,restActivity:'light',activitySource:source}
 if(kind==='hunting_trap'){
  for(const key of ['containerItemId','containerFactId','actualContainerConfirmed','availableCapacityUnits','capacityForCurrentContentsConfirmed','remainingCoverageFactId','remainingCoverageConfirmed'])delete start[key]
  start.remainingCells=[];start.requiredSeconds=6;start.safeHandlingFactId=await fact(call,'Le MJ établit la procédure physique réelle permettant de récupérer ce piège vide en sécurité, mâchoire maintenue sans actionner la plaque.',origin);start.actualSafeHandlingConfirmed=true
 }
 return{call,start,origin,kind,count,placementId:placement.placementId}
}
async function finish(call,id='real-recovery',eventId='finish-real-recovery'){return ok(await call('finish_ground_gear_recovery',{eventId,recoveryId:id}))}
async function refuse(call,name,input,code){const before=await call('get_game_state'),answer=await call(name,input);assert.equal(answer.code,code,JSON.stringify(answer));assert.deepEqual(await call('get_game_state'),before);return answer}
test('partial collection performs real work before changing any danger, persists through SQL, and never creates a full bag',async t=>{
 const{call,start,placementId}=await setup(t),before=await call('get_game_state')
 assert.equal(ok(await call('start_ground_gear_recovery',start)).status,'working')
 let state=await call('get_game_state');assert.equal(state.worldTimeSeconds,before.worldTimeSeconds+6);assert.equal(state.dmTools.groundGear.placements[placementId].unitsRemaining,20);assert.equal(Object.keys(state.dmTools.groundGear.stocks).length,0)
 await refuse(call,'finish_ground_gear_recovery',{eventId:'too-early',recoveryId:start.recoveryId},'GROUND_GEAR_RECOVERY_NOT_DUE')
 const id=`gear-recovery-${process.pid}`;t.after(()=>deleteSession(id));await saveSession(id,{gameState:state,history:[],adventureId:state.adventureId,characterId:state.characterId});ok(await call('replace_game_state',{gameState:(await loadSession(id)).gameState}))
 ok(await call('continue_ground_gear_recovery',{eventId:'real-work-two',recoveryId:start.recoveryId,workSeconds:6,restActivity:'light',activitySource:source}))
 state=await call('get_game_state');assert.equal(state.dmTools.groundGear.placements[placementId].unitsRemaining,20)
 const completed=await finish(call),after=await call('get_game_state');assert.equal(completed.stock.units,10);assert.equal(completed.stock.containerItemId,'real-recovery-pouch');assert.equal(after.dmTools.groundGear.placements[placementId].unitsRemaining,10)
 assert.equal(after.player.inventory.some(i=>i.equipmentId==='caltrops'),false);assert.equal(after.player.inventory.some(i=>i.id==='real-source-lot'),false);assert.equal(after.player.inventory.filter(i=>i.id==='real-recovery-pouch').length,1)
 ok(await call('replace_game_state',{gameState:after}));assert.equal((await finish(call)).replayed,true);assert.deepEqual(await call('get_game_state'),after)
 const forged=structuredClone(after);forged.dmTools.groundGear.stocks[completed.stock.itemId].units++
 await refuse(call,'replace_game_state',{gameState:forged},'GROUND_GEAR_STATE_MISMATCH')
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
test('missing cells, container, capacity, mass pair or overlarge work refuses before time, items or dice',async t=>{
 const{call,start}=await setup(t)
 await refuse(call,'start_ground_gear_recovery',{...start,remainingCells:[]},'GROUND_GEAR_REMAINING_COVERAGE_REQUIRED')
 await refuse(call,'start_ground_gear_recovery',{...start,containerItemId:'invented-container'},'GROUND_GEAR_REAL_CONTAINER_REQUIRED')
 await refuse(call,'start_ground_gear_recovery',{...start,availableCapacityUnits:1},'GROUND_GEAR_CONTAINER_CAPACITY')
 await refuse(call,'start_ground_gear_recovery',{...start,measuredStockWeightLb:.8},'GROUND_GEAR_MASS_FACT_REQUIRED')
 await refuse(call,'start_ground_gear_recovery',{...start,workSeconds:13},'GROUND_GEAR_RECOVERY_WORK_INVALID')
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
test('a whole original source bag is returned only with all its actual units and the original existing container',async t=>{
 const{call,start,count,placementId}=await setup(t,{kind:'ball_bearings',original:true})
 const input={...start,units:count,remainingCells:[],requiredSeconds:6,workSeconds:6};delete input.remainingCoverageFactId;delete input.remainingCoverageConfirmed
 ok(await call('start_ground_gear_recovery',input));const result=await finish(call),state=await call('get_game_state')
 assert.equal(result.item.id,'real-source-lot');assert.equal(result.item.equipmentId,'ball_bearings');assert.equal(result.stock,undefined);assert.equal(state.dmTools.groundGear.placements[placementId].status,'recovered');assert.equal(state.dmTools.groundGear.placements[placementId].unitsRemaining,0)
 assert.equal(state.player.inventory.filter(i=>i.id==='real-source-lot').length,1);assert.equal(Object.keys(state.dmTools.groundGear.stocks).length,0)
})
test('two real partial collections into the same chosen pouch combine exact counts and leave the original empty bag on the ground',async t=>{
 const{call,start,placementId}=await setup(t);ok(await call('start_ground_gear_recovery',{...start,requiredSeconds:6}));const first=await finish(call)
 const next={...start,eventId:'second-real-start',recoveryId:'second-real-recovery',requiredSeconds:6,remainingCells:[]};delete next.remainingCoverageFactId;delete next.remainingCoverageConfirmed
 ok(await call('start_ground_gear_recovery',next));const second=await finish(call,next.recoveryId,'second-real-finish'),state=await call('get_game_state')
 assert.equal(second.stock.itemId,first.stock.itemId);assert.equal(second.stock.units,20);assert.equal(state.dmTools.groundGear.placements[placementId].unitsRemaining,0)
 assert.equal(state.player.inventory.filter(i=>i.id===first.stock.itemId).length,1);assert.equal(state.droppedItems['real-source-lot'].item.equipmentId,'ground_gear_container')
 assert.equal(state.player.inventory.some(i=>i.equipmentId==='caltrops'),false)
 state.dmTools.groundGear.recoveries=Object.fromEntries(Object.entries(state.dmTools.groundGear.recoveries).reverse())
 ok(await call('replace_game_state',{gameState:state}))
})
test('dropping and retrieving the real container transfers its counted contents once, with no orphan child-item target',async t=>{
 const{call,start}=await setup(t);ok(await call('start_ground_gear_recovery',{...start,requiredSeconds:6}));const completed=await finish(call),stockId=completed.stock.itemId
 await refuse(call,'equip_item',{itemId:stockId,operation:'equip',slot:'main_hand'},'GROUND_GEAR_CONTAINER_SELECTION_REQUIRED')
 await refuse(call,'drop_item',{itemId:stockId},'GROUND_GEAR_CONTAINER_SELECTION_REQUIRED')
 ok(await call('drop_item',{itemId:'real-recovery-pouch'}));let state=await call('get_game_state');assert.equal(state.player.inventory.some(i=>i.id===stockId),false);assert.ok(state.droppedItems[stockId]);assert.deepEqual(state.droppedItems[stockId].position,state.droppedItems['real-recovery-pouch'].position)
 await refuse(call,'pick_up_item',{itemId:stockId},'GROUND_GEAR_CONTAINER_SELECTION_REQUIRED')
 ok(await call('pick_up_item',{itemId:'real-recovery-pouch'}));state=await call('get_game_state');assert.equal(state.player.inventory.filter(i=>i.id===stockId).length,1);assert.equal(state.droppedItems[stockId],undefined)
 ok(await call('replace_game_state',{gameState:state}))
})
test('combat work consumes its real action but neither waiting nor extra work advances the round clock',async t=>{
 const{call,start}=await setup(t),enemy=await spawn(call);await battle(call,[enemy.id]);const before=await call('get_game_state')
 await refuse(call,'start_ground_gear_recovery',{...start,workSeconds:7},'GROUND_GEAR_RECOVERY_COMBAT_WORK')
 ok(await call('start_ground_gear_recovery',{...start,requiredSeconds:6}));let state=await call('get_game_state');assert.equal(state.hero.actionCredits,0);assert.equal(state.worldTimeSeconds,before.worldTimeSeconds)
 await refuse(call,'finish_ground_gear_recovery',{eventId:'early-combat-finish',recoveryId:start.recoveryId},'GROUND_GEAR_RECOVERY_NOT_DUE')
 ok(await call('next_turn',{actorId:'player'}));ok(await call('next_turn',{actorId:enemy.id,skipAction:true}));state=await call('get_game_state');assert.equal(state.worldTimeSeconds,before.worldTimeSeconds+6)
 const credits=state.hero.actionCredits;await finish(call);assert.equal((await call('get_game_state')).hero.actionCredits,credits)
})
test('actual incapacity never credits work; cancellation preserves the danger and refunds no performed time',async t=>{
 const{call,start,placementId}=await setup(t);ok(await call('start_ground_gear_recovery',start));ok(await call('apply_condition',{entityId:'player',condition:'unconscious'}))
 await refuse(call,'continue_ground_gear_recovery',{eventId:'incapacitated-work',recoveryId:start.recoveryId,workSeconds:6,restActivity:'light',activitySource:source},'ENTITY_INCAPACITATED')
 const before=await call('get_game_state'),cancel=ok(await call('cancel_ground_gear_recovery',{eventId:'actual-cancel',recoveryId:start.recoveryId,reason:'The real collector cannot continue this attempt.'})),after=await call('get_game_state')
 assert.equal(cancel.unitsRemoved,0);assert.equal(after.worldTimeSeconds,before.worldTimeSeconds);assert.equal(after.dmTools.groundGear.placements[placementId].unitsRemaining,20);assert.deepEqual(after.player.inventory,before.player.inventory)
})
test('active carrying rejects unknown partial mass and overload before work, then accepts only the explicitly measured actual stock',async t=>{
 const{call,start,origin}=await setup(t)
 await replace(call,s=>{s.player.inventory=s.player.inventory.filter(i=>i.id==='real-recovery-pouch');s.dmTools.loadout={unarmoredAC:10+Math.floor((s.player.stats.dex-10)/2)}})
 ok(await call('set_carrying_context',{eventId:'actual-size-observed',entityId:'player',size:'Medium',reason:'Taille réelle observée.',source:'Mesure physique réelle du personnage.'}))
 await refuse(call,'start_ground_gear_recovery',start,'CARRYING_DATA_REQUIRED')
 const stockWeightFactId=await fact(call,'Les dix chausse-trappes exactement sélectionnées ont été réellement pesées ensemble : 0,8 livre, hors récipient.',origin),measured={...start,requiredSeconds:6,measuredStockWeightLb:.8,stockWeightFactId}
 const initial=ok(await call('inspect_carrying_capacity',{entityId:'player'})),baseline=initial.carriedWeightLb,limit=initial.carryingCapacityLb,heavy=limit-.5-baseline,ropes=Math.floor(heavy/10),arrows=Math.round((heavy-ropes*10)*20)
 await replace(call,s=>s.player.inventory.push({id:'real-heavy-chains',equipmentId:'hempen_rope_50_feet',name:'Cordes réellement portées',type:'misc',quantity:ropes},{id:'real-arrows',equipmentId:'arrows',ammunitionType:'arrow',name:'Flèches réellement portées',type:'misc',quantity:arrows}))
 await refuse(call,'start_ground_gear_recovery',measured,'CARRYING_CAPACITY_EXCEEDED')
 await replace(call,s=>{s.player.inventory=s.player.inventory.filter(i=>!['real-heavy-chains','real-arrows'].includes(i.id))})
 ok(await call('start_ground_gear_recovery',measured));const done=await finish(call),state=await call('get_game_state');assert.equal(done.stock.measuredWeightLb,.8)
 const capacity=ok(await call('inspect_carrying_capacity',{entityId:'player'}));assert.equal(capacity.status,'resolved');assert.equal(capacity.carriedWeightLb,Number((baseline+.8).toFixed(8)))
 ok(await call('replace_game_state',{gameState:state}));assert.equal(ok(await call('inspect_carrying_capacity',{entityId:'player'})).carriedWeightLb,capacity.carriedWeightLb)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
test('a partial original pouch recovery needs its separate actual dry mass and keeps contents attached through pickup capacity checks',async t=>{
 const{call,start,origin}=await setup(t,{original:true})
 await replace(call,s=>{s.player.inventory=s.player.inventory.filter(i=>i.id==='real-recovery-pouch');s.dmTools.loadout={unarmoredAC:10+Math.floor((s.player.stats.dex-10)/2)}})
 ok(await call('set_carrying_context',{eventId:'actual-size-observed',entityId:'player',size:'Medium',reason:'Taille réelle observée.',source:'Mesure physique réelle du personnage.'}))
 const baseline=ok(await call('inspect_carrying_capacity',{entityId:'player'})).carriedWeightLb
 const measured={...start,requiredSeconds:6,measuredStockWeightLb:.8,stockWeightFactId:await fact(call,'Masse réellement mesurée des dix pièces sélectionnées : 0,8 livre hors récipient.',origin)}
 await refuse(call,'start_ground_gear_recovery',measured,'CARRYING_DATA_REQUIRED')
 measured.measuredContainerDryWeightLb=.4;measured.containerWeightFactId=await fact(call,'Le vrai récipient d’origine vide a été pesé séparément : 0,4 livre.',origin)
 ok(await call('start_ground_gear_recovery',measured));const done=await finish(call),state=await call('get_game_state');assert.equal(done.restoredContainer.id,'real-source-lot');assert.equal(done.restoredContainer.equipmentId,'ground_gear_container');assert.equal(done.stock.containerItemId,'real-source-lot')
 const expected=Number((baseline+1.2).toFixed(8));assert.equal(ok(await call('inspect_carrying_capacity',{entityId:'player'})).carriedWeightLb,expected)
 ok(await call('drop_item',{itemId:'real-source-lot'}));const deposited=await call('get_game_state');assert.ok(deposited.droppedItems[done.stock.itemId]);ok(await call('replace_game_state',{gameState:deposited}))
 ok(await call('pick_up_item',{itemId:'real-source-lot'}));assert.equal(ok(await call('inspect_carrying_capacity',{entityId:'player'})).carriedWeightLb,expected)
})
test('an empty real hunting trap needs its actual safe handling procedure and returns the same whole trap without a bag',async t=>{
 const{call,start,placementId}=await setup(t,{kind:'hunting_trap'})
 const unsafe={...start};delete unsafe.safeHandlingFactId;delete unsafe.actualSafeHandlingConfirmed
 await refuse(call,'start_ground_gear_recovery',unsafe,'HUNTING_TRAP_SAFE_RECOVERY_REQUIRED')
 ok(await call('start_ground_gear_recovery',start));const done=await finish(call),state=await call('get_game_state');assert.equal(done.item.id,'real-source-lot');assert.equal(done.item.equipmentId,'hunting_trap');assert.equal(done.stock,undefined);assert.equal(state.dmTools.groundGear.placements[placementId].status,'recovered')
 assert.equal(state.player.inventory.filter(i=>i.id==='real-source-lot').length,1);assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
test('a real captive must actually be freed before any safe-handling declaration can recover its hunting trap',async t=>{
 const{call,start,origin,placementId}=await setup(t,{kind:'hunting_trap',dice:'1,3,19'}),enemy=await spawn(call)
 await battle(call,[enemy.id]);const state=await call('get_game_state'),nav=grid(state),outside=nav.neighbors(origin).find(c=>nav.step(origin,c)&&inferRoomIdOnMap(c,state.currentMapId,state)===state.currentRoomId)
 assert.ok(outside);ok(await call('move_token',{tokenId:'player',toCell:outside}));ok(await call('move_token',{tokenId:'player',toCell:origin}))
 const waiting=await call('get_game_state'),contact=Object.values(waiting.dmTools.groundGear.contacts).find(c=>c.status!=='resolved'&&c.entityId==='player');assert.ok(contact)
 ok(await call('resolve_ground_gear_contact',{contactId:contact.id,orderedPlacementIds:contact.placementIds,plateContacts:[{placementId,stepped:true,source:'Le pied réel appuie sur la petite plaque centrale.'}]}))
 assert.equal((await call('get_game_state')).dmTools.groundGear.placements[placementId].victimId,'player')
 await refuse(call,'start_ground_gear_recovery',start,'HUNTING_TRAP_VICTIM_REMAINS');assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
test('retrieving a container checks the actual unknown child-stock mass before adding either item',async t=>{
 const{call,start}=await setup(t);ok(await call('start_ground_gear_recovery',{...start,requiredSeconds:6}));const done=await finish(call)
 ok(await call('drop_item',{itemId:'real-recovery-pouch'}));await replace(call,s=>{s.player.inventory=[];s.dmTools.loadout={unarmoredAC:10+Math.floor((s.player.stats.dex-10)/2)}})
 ok(await call('set_carrying_context',{eventId:'real-carrying-begins',entityId:'player',size:'Medium',reason:'Taille réelle observée.',source:'Observation physique actuelle.'}))
 const answer=await refuse(call,'pick_up_item',{itemId:'real-recovery-pouch'},'CARRYING_DATA_REQUIRED');assert.ok(answer.detail.missing.some(m=>m.itemId===done.stock.itemId))
 ok(await call('declare_physical_weight',{eventId:'actual-ground-stock-weight',targetKind:'item',targetId:done.stock.itemId,weightLb:.8,unit:'lb_per_inventory_unit',reason:'Les dix pièces réelles ont été pesées ensemble hors bourse.',source:'Mesure réelle de cette instance au sol, aucune fraction calculée.'}))
 ok(await call('pick_up_item',{itemId:'real-recovery-pouch'}));const after=await call('get_game_state');assert.equal(after.player.inventory.length,2);assert.equal(after.player.inventory.filter(i=>i.id===done.stock.itemId).length,1)
})
test('a collection cannot credit any continuous work through a real suffocation collapse boundary',async t=>{
 const{call,start}=await setup(t);ok(await call('set_breathing_context',{entityId:'player',eventId:'actual-held-breath',mode:'hold_breath',reason:'Absence réelle d’air établie par le MJ.'}))
 const state=await call('get_game_state'),episode=state.dmTools.breathing.creatures.player.episode,seconds=episode.breathEndsAt+6*episode.graceRounds-state.worldTimeSeconds+1
 await refuse(call,'start_ground_gear_recovery',{...start,requiredSeconds:seconds,workSeconds:seconds},'ACTIVITY_BREATHING_BOUNDARY');assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
test('partial bearing coverage changes only to the explicit observed remaining cells, never clears the whole lot',async t=>{
 const{call,start,placementId}=await setup(t,{kind:'ball_bearings'}),remaining=start.remainingCells.slice(1)
 ok(await call('start_ground_gear_recovery',{...start,requiredSeconds:6,remainingCells:remaining}));await finish(call)
 const state=await call('get_game_state'),placed=state.dmTools.groundGear.placements[placementId];assert.equal(placed.unitsRemaining,500);assert.deepEqual(placed.cells,remaining);assert.equal(placed.status,'laid');assert.ok(placed.remainingCoverageFact)
 ok(await call('replace_game_state',{gameState:state}))
})
test('an actual thrown-container transfer keeps every counted child at the same destination room',async t=>{
 const{fixture}=require('./helpers/ammunition-fixture.cjs'),f=await fixture(t,{weapon:'longsword',quantity:null,startBattle:false,dice:'19'})
 const callbacks={},server={tool(name,_description,schema,callback){callbacks[name]=input=>callback(require('zod').z.object(schema).parse(input))},registerTool(name,config,callback){callbacks[name]=input=>callback(require('zod').z.object(config.inputSchema).parse(input))}}
 require('../mcp-server/dist/mcp-server/tools/ground-gear-tools.js').registerGroundGearTools(server);require('../mcp-server/dist/mcp-server/tools/ground-gear-recovery-tools.js').registerGroundGearRecoveryTools(server)
 const call=async(name,input)=>callbacks[name]?JSON.parse((await callbacks[name](input)).content[0].text):f.call(name,input),cell={...f.state.player.position}
 f.state.player.inventory.push({id:'real-lot',equipmentId:'caltrops',name:'Vingt chausse-trappes réelles',type:'misc'},{id:'real-pouch',equipmentId:'pouch',name:'Bourse réelle',type:'misc'})
 const observed=ok(await f.call('record_scene_fact',{description:'Sol et bourse réellement observés au même emplacement, capacité disponible réelle.',cell})).worldFact.id
 ok(await call('place_ground_gear',{placementId:'real-placement',itemId:'real-lot',originCell:cell,surfaceZFeet:0,surfaceFactId:observed}))
 ok(await call('start_ground_gear_recovery',{eventId:'actual-start',recoveryId:'actual-job',placementId:'real-placement',units:10,containerItemId:'real-pouch',containerFactId:observed,actualContainerConfirmed:true,availableCapacityUnits:20,capacityForCurrentContentsConfirmed:true,requiredSeconds:6,workSeconds:6,remainingCells:[cell],remainingCoverageFactId:observed,remainingCoverageConfirmed:true,restActivity:'light',activitySource:source}))
 const result=ok(await call('finish_ground_gear_recovery',{eventId:'actual-finish',recoveryId:'actual-job'})),gs=require('../mcp-server/dist/mcp-server/game-state.js')
 gs.dropPlayerItem('real-pouch',{position:{x:8,y:2},description:'Actual already validated physical throw destination.'})
 assert.equal(gs.getState().droppedItems['real-pouch'].roomId,'other-room');assert.equal(gs.getState().droppedItems[result.stock.itemId].roomId,'other-room')
 assert.deepEqual(gs.getState().droppedItems[result.stock.itemId].position,{x:8,y:2})
})
