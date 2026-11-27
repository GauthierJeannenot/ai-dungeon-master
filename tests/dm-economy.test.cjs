const test=require('node:test'),assert=require('node:assert/strict')
Object.assign(process.env,{LLM_MODE:'mock',ALLOW_PAID_LLM:'false',MONETIZATION_ENABLED:'false',DM_RATE_LIMIT_PER_MINUTE:'0',APP_LOG_PERSIST_ENABLED:'false',APP_LOG_LEVEL:'error',LLM_MAX_CALLS_PER_REQUEST:'12'})
const {installPgMem}=require('./helpers/pg-mem.cjs'),pg=installPgMem()
const {play,lastResult}=require('./helpers/dm-scripted-turn.cjs')
const {engine,ok,replace,adjacent}=require('./helpers/mcp-toolkit.cjs')
test.after(()=>pg.restore())
const activitySource='Travail physique réellement choisi et effectué, sans durée ni ressource gratuite.'
async function freeHands(call){
 let state=await call('get_game_state')
 if(!state.dmTools?.loadout){const weapon=state.player.inventory.find(i=>i.type==='weapon');if(weapon)ok(await call('equip_item',{itemId:weapon.id,operation:'unequip',slot:'main_hand'}))}
 for(const[key,slot]of [['mainHandId','main_hand'],['offHandId','off_hand'],['shieldId','shield']]){state=await call('get_game_state');if(state.dmTools?.loadout?.[key])ok(await call('equip_item',{itemId:state.dmTools.loadout[key],operation:'unequip',slot}))}
}
test('the API purchases only the actual offered instance with exact money and real time, then blocks another player action',async t=>{
 const call=await engine(t,{dice:'19'});await freeHands(call);const state=await call('get_game_state'),cell=adjacent(state)[0]
 ok(await call('create_npc',{npcId:'actual-api-merchant',name:'Marchand présent',statBlock:'goblin',cell,disposition:'neutral',visible:true,description:'Un véritable marchand avant la demande du joueur.'}))
 ok(await call('create_scene_object',{objectId:'actual-api-stock',name:'Caisse existante',description:'La vraie caisse contient cette instance proposée à la vente.',cell,kind:'container',material:'wood',size:'small',resilience:'resilient',contents:['caltrops']}))
 const item=ok(await call('interact_object',{objectId:'actual-api-stock',action:'open'})).releasedItems[0]
 const fact=ok(await call('record_scene_fact',{description:'Le marchand détient réellement cet objet et l’accord de vente au prix choisi est établi.',cell})).worldFact
 ok(await call('record_merchant_stock',{eventId:'actual-api-custody',merchantId:'actual-api-merchant',itemIds:[item.id],physicalFactId:fact.id,actualStockConfirmed:true}))
 ok(await call('create_trade_offer',{offerId:'actual-api-offer',merchantId:'actual-api-merchant',itemIds:[item.id],priceCp:100,agreementFactId:fact.id,actualAgreementConfirmed:true}))
 const purchase={eventId:'actual-api-purchase',offerId:'actual-api-offer',paid:{gp:1},workSeconds:6,activitySource}
 const{result,seen,selected,before}=await play(t,call,[{name:'inspect_trade_stock',input:{merchantId:'actual-api-merchant'}},{name:'purchase_trade_offer',input:purchase},{name:'roll_ability_check',input:{entityId:'player',ability:'wis',dc:10}},params=>{assert.equal(lastResult(params).code,'PRIMARY_ACTION_ALREADY_RESOLVED');return 'Tu achètes cet objet réellement proposé.'}],'J’achète cet objet selon l’accord établi.')
 assert.deepEqual(seen,selected.slice(0,-1));const after=result.newGameState
 assert.equal(after.player.inventory.filter(i=>i.id===item.id).length,1);assert.equal(after.dmTools.wallet.gp,before.dmTools.wallet.gp-1);assert.equal(after.dmTools.merchants.earnedCoins['actual-api-merchant'].gp,1)
 assert.equal(after.worldTimeSeconds,before.worldTimeSeconds+6);assert.deepEqual(after.player.hp,before.player.hp);assert.deepEqual(after.player.position,before.player.position)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('the API preserves cross-midnight work without crediting incomplete dates, then completes the actually qualified day once',async t=>{
 const{call,start,raw}=await craftingFixture(t),initial=await call('get_game_state')
 ok(await call('advance_time',{seconds:72000-initial.worldTimeSeconds}))
 const work=eventId=>({eventId,projectId:start.projectId,seconds:14400,restActivity:'strenuous',activitySource})
 const{result,seen,selected,before}=await play(t,call,[
  {name:'start_ordinary_crafting',input:start},
  {name:'work_ordinary_crafting',input:work('actual-api-day-zero-four-hours')},
  {name:'work_ordinary_crafting',input:work('actual-api-day-one-four-hours')},
  {name:'complete_ordinary_crafting_day',input:{eventId:'actual-api-premature-interday-credit',projectId:start.projectId,calendarDay:1,materialUses:[{itemId:raw.id,valueCp:50}]}},
  params=>{assert.equal(lastResult(params).code,'CRAFT_WORKDAY_NOT_COMPLETE');return{name:'work_ordinary_crafting',input:work('actual-api-day-one-eight-hours')}},
  {name:'complete_ordinary_crafting_day',input:{eventId:'actual-api-qualified-day-credit',projectId:start.projectId,calendarDay:1,materialUses:[{itemId:raw.id,valueCp:50}]}},
  {name:'pick_up_item',input:{itemId:'actual-api-crafted'}},
  params=>{assert.equal(lastResult(params).code,'PRIMARY_ACTION_ALREADY_RESOLVED');return 'Seule la journée réellement travaillée huit heures est comptée ; le lot reste à l’atelier.'},
 ],'Je commence ce travail à vingt heures puis le poursuis jusqu’à avoir huit heures réellement effectuées le lendemain.')
 assert.deepEqual(seen,selected.slice(0,-1));const after=result.newGameState,project=after.dmTools.ordinaryCrafting.projects[start.projectId]
 assert.equal(after.worldTimeSeconds,before.worldTimeSeconds+43200);assert.equal(project.workedSeconds,43200);assert.deepEqual(project.segments.map(segment=>segment.calendarDay),[0,1,1]);assert.deepEqual(project.periods.map(period=>period.calendarDay),[1]);assert.equal(project.progressCp,100)
 assert.equal(after.dmTools.ordinaryCrafting.receipts['actual-api-premature-interday-credit'],undefined);assert.equal(after.player.inventory.some(item=>item.id===raw.id||item.id==='actual-api-crafted'),false);assert.equal(after.droppedItems['actual-api-crafted'].item.equipmentId,'caltrops')
 assert.deepEqual(after.player.hp,before.player.hp);assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
async function craftingFixture(t){
 const call=await engine(t,{dice:'19'});await freeHands(call);const state=await call('get_game_state'),cell={...state.player.position}
 ok(await call('create_scene_object',{objectId:'actual-api-materials',name:'Atelier existant',description:'Un outil et un lot physique de matières adaptés, avec le récipient de l’objet final.',cell,kind:'container',material:'wood',size:'small',resilience:'resilient',contents:['smiths_tools','raw_crafting_materials']}))
 const items=ok(await call('interact_object',{objectId:'actual-api-materials',action:'open'})).releasedItems
 for(const item of items)ok(await call('pick_up_item',{itemId:item.id}))
 const tool=items.find(i=>i.equipmentId==='smiths_tools'),raw=items.find(i=>i.equipmentId==='raw_crafting_materials')
 await replace(call,s=>{s.player.toolProficiencies=['smiths_tools']}) // Pre-existing trained character fixture; crafting grants no proficiency.
 const physical=ok(await call('record_scene_fact',{description:'L’outil et ces matières conviennent physiquement à cet objet. La valeur observée des matières est de cinquante pièces de cuivre, récipient final compris.',cell})).worldFact
 ok(await call('create_scene_object',{objectId:'actual-api-forge',name:'Forge réelle',description:'Une vraie forge utilisable pour ce travail.',cell:adjacent(await call('get_game_state'))[0],kind:'lever',material:'iron',size:'small',resilience:'resilient'}))
 const start={eventId:'actual-api-craft-start',projectId:'actual-api-project',equipmentId:'caltrops',outputItemIds:['actual-api-crafted'],toolItemId:tool.id,toolRelationFactId:physical.id,actualRelatedToolConfirmed:true,materials:[{itemId:raw.id,valueCp:50,physicalFactId:physical.id}],actualIngredientsConfirmed:true,facilityObjectIds:['actual-api-forge'],facilityFactId:physical.id,actualFacilitiesConfirmed:true}
 return{call,start,raw}
}
test('the API keeps two real four-hour crafting segments in one project and completes without free pickup or a second action',async t=>{
 const{call,start,raw}=await craftingFixture(t)
 const work=eventId=>({eventId,projectId:start.projectId,seconds:14400,restActivity:'strenuous',activitySource})
 const{result,seen,selected,before}=await play(t,call,[{name:'start_ordinary_crafting',input:start},{name:'work_ordinary_crafting',input:work('actual-api-four-hours')},{name:'inspect_ordinary_crafting',input:{}},{name:'work_ordinary_crafting',input:work('actual-api-eight-hours')},{name:'complete_ordinary_crafting_day',input:{eventId:'actual-api-craft-finish',projectId:start.projectId,materialUses:[{itemId:raw.id,valueCp:50}]}},{name:'pick_up_item',input:{itemId:'actual-api-crafted'}},params=>{assert.equal(lastResult(params).code,'PRIMARY_ACTION_ALREADY_RESOLVED');return 'Les huit heures de travail produisent le lot réel à l’atelier.'}],'Je travaille huit heures à ce projet avec mes vrais outils et matériaux.')
 assert.deepEqual(seen,selected.slice(0,-1));const after=result.newGameState,project=after.dmTools.ordinaryCrafting.projects[start.projectId]
 assert.equal(after.worldTimeSeconds,before.worldTimeSeconds+28800);assert.equal(project.status,'completed');assert.equal(project.workedSeconds,28800);assert.equal(project.segments.length,2);assert.equal(project.progressCp,100);assert.ok(project.segments.every(segment=>Math.floor(segment.from/86400)===Math.floor(before.worldTimeSeconds/86400)&&segment.to<=(Math.floor(before.worldTimeSeconds/86400)+1)*86400),'both4hour segments are in the same actual qualifying day')
 assert.equal(after.droppedItems['actual-api-crafted'].item.equipmentId,'caltrops');assert.equal(after.player.inventory.some(i=>i.id==='actual-api-crafted'||i.id===raw.id),false)
 assert.deepEqual(after.player.hp,before.player.hp);assert.deepEqual(after.player.position,before.player.position);assert.equal(after.dmTools.wallet.gp,before.dmTools.wallet.gp)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
