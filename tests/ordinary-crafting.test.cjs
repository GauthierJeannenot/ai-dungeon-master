const test=require('node:test'),assert=require('node:assert/strict')
process.env.MONETIZATION_ENABLED='false'
const {installPgMem}=require('./helpers/pg-mem.cjs'),pg=installPgMem()
const {saveSession,loadSession,deleteSession}=require('../lib/session-store.ts')
const {engine,ok,replace,adjacent}=require('./helpers/mcp-toolkit.cjs')
test.after(()=>pg.restore())
const reason='Travail de fabrication réellement accompli, activité déclarée par le MJ ; aucune heure, matière ou production gratuite.'
async function setup(t,{profile='caltrops',valueCp=50,toolId=profile==='basic_poison_vial'?'poisoners_kit':'smiths_tools'}={}){
 const call=await engine(t,{dice:'19'});let state=await call('get_game_state'),cell={...state.player.position}
 if(!state.dmTools?.loadout){const held=state.player.inventory.find(i=>i.type==='weapon');if(held)ok(await call('equip_item',{itemId:held.id,operation:'unequip',slot:'main_hand'}));state=await call('get_game_state')}
 for(const[key,slot]of [['mainHandId','main_hand'],['offHandId','off_hand'],['shieldId','shield']])if(state.dmTools?.loadout?.[key]){ok(await call('equip_item',{itemId:state.dmTools.loadout[key],operation:'unequip',slot}));state=await call('get_game_state')}
 ok(await call('create_scene_object',{objectId:'real-materials-chest',name:'Coffre d’atelier',description:'Un vrai outil et un lot réel de matières adaptées comprenant le récipient final nécessaire.',cell,kind:'container',material:'wood',size:'small',resilience:'resilient',contents:[toolId,'raw_crafting_materials']}))
 const items=ok(await call('interact_object',{objectId:'real-materials-chest',action:'open'})).releasedItems;for(const item of items)ok(await call('pick_up_item',{itemId:item.id}))
 const tool=items.find(i=>i.equipmentId===toolId),raw=items.find(i=>i.equipmentId==='raw_crafting_materials')
 await replace(call,s=>{s.player.toolProficiencies=[toolId]}) // Actual pre-existing proficiency fixture, never gained by a crafting tool.
 const physical=ok(await call('record_scene_fact',{description:'L’outil présent est réellement adapté et les matières physiques indiquées, récipient compris, conviennent à cet objet nonmagique ; leur valeur totale observée est celle explicitement déclarée.',cell})).worldFact
 const start={eventId:'real-project-start',projectId:'real-project',equipmentId:profile,outputItemIds:['real-crafted-output'],toolItemId:tool.id,toolRelationFactId:physical.id,actualRelatedToolConfirmed:true,materials:[{itemId:raw.id,valueCp,physicalFactId:physical.id}],actualIngredientsConfirmed:true}
 if(toolId==='smiths_tools'){
  state=await call('get_game_state');const forgeCell=adjacent(state)[0]
  ok(await call('create_scene_object',{objectId:'real-forge',name:'Forge existante',description:'La vraie forge nécessaire est utilisable à cet atelier.',cell:forgeCell,kind:'lever',material:'iron',size:'small',resilience:'resilient'}))
  start.facilityObjectIds=['real-forge'];start.facilityFactId=physical.id;start.actualFacilitiesConfirmed=true
 }
 return{call,start,raw,tool,cell,physical}
}
const work=(call,eventId='real-work',seconds=28800)=>call('work_ordinary_crafting',{eventId,projectId:'real-project',seconds,restActivity:'strenuous',activitySource:reason})
const complete=(call,raw,valueCp=50,eventId='real-completion')=>call('complete_ordinary_crafting_day',{eventId,projectId:'real-project',materialUses:[{itemId:raw.id,valueCp}]})
async function refuse(call,name,input,code){const before=await call('get_game_state'),answer=await call(name,input);assert.equal(answer.code,code,JSON.stringify(answer));assert.deepEqual(await call('get_game_state'),before)}
test('ordinary crafting retains real four-hour segments through SQL, then spends actual half-value material and produces one ground lot once',async t=>{
 const{call,start,raw}=await setup(t);ok(await call('start_ordinary_crafting',start));ok(await work(call,'first-real-half',14400));let state=await call('get_game_state');assert.equal(state.droppedItems['real-crafted-output'],undefined)
 const id=`ordinary-craft-${process.pid}`;t.after(()=>deleteSession(id));await saveSession(id,{gameState:state,history:[],adventureId:state.adventureId,characterId:state.characterId});ok(await call('replace_game_state',{gameState:(await loadSession(id)).gameState}))
 ok(await work(call,'second-real-half',14400));const result=ok(await complete(call,raw));assert.equal(result.progressCp,100);assert.equal(result.materialsUsedValueCp,50);assert.equal(result.itemsProduced,1)
 state=await call('get_game_state');assert.equal(state.player.inventory.some(i=>i.id===raw.id),false);assert.equal(state.player.inventory.some(i=>i.id==='real-crafted-output'),false);assert.equal(state.droppedItems['real-crafted-output'].item.equipmentId,'caltrops')
 ok(await call('replace_game_state',{gameState:state}));ok(await complete(call,raw));assert.deepEqual(await call('get_game_state'),state);ok(await call('pick_up_item',{itemId:'real-crafted-output'}));assert.equal((await call('get_game_state')).player.inventory.filter(i=>i.id==='real-crafted-output').length,1)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
test('Basic Poison uses the actual poisoners kit and8hours for5gp progress, with real partial ingredient value and no early dose',async t=>{
 const{call,start,raw}=await setup(t,{profile:'basic_poison_vial',valueCp:5000});ok(await call('start_ordinary_crafting',start));ok(await work(call));const result=ok(await complete(call,raw,250))
 assert.equal(result.progressCp,500);assert.equal(result.marketValueCp,10000);assert.equal(result.itemsProduced,0)
 const state=await call('get_game_state');assert.equal(state.dmTools.ordinaryCrafting.materials[raw.id].remainingValueCp,4750);assert.equal(state.player.inventory.some(i=>i.id===raw.id),true);assert.equal(state.droppedItems['real-crafted-output'],undefined)
 await refuse(call,'work_ordinary_crafting',{eventId:'false-second-day',projectId:start.projectId,seconds:28800,restActivity:'strenuous',activitySource:reason},'CRAFT_DAILY_WORK_LIMIT');ok(await call('replace_game_state',{gameState:state}));assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
test('missing proficiency, wrong material value and other-poison discretion refuse before work, ingredients or dice',async t=>{
 const{call,start}=await setup(t);await replace(call,s=>s.player.toolProficiencies=[])
 await refuse(call,'start_ordinary_crafting',start,'CRAFT_TOOL_PROFICIENCY_REQUIRED');await replace(call,s=>s.player.toolProficiencies=['smiths_tools'])
 await refuse(call,'start_ordinary_crafting',{...start,materials:[{...start.materials[0],valueCp:49}]},'CRAFT_MATERIAL_VALUE_REQUIRED')
 await refuse(call,'start_ordinary_crafting',{...start,equipmentId:'potion_of_healing'},'CRAFT_PROFILE_UNSUPPORTED')
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
test('real midnight keeps4h on dayA and4h on dayB as history without credit; only8h actually on dayB produce once',async t=>{
 const{call,start,raw}=await setup(t);await replace(call,s=>s.worldTimeSeconds=20*3600);ok(await call('start_ordinary_crafting',start))
 ok(await work(call,'before-midnight',14400));ok(await work(call,'after-midnight-first',14400));let state=await call('get_game_state')
 assert.equal(state.dmTools.ordinaryCrafting.projects[start.projectId].workedSeconds,28800);assert.equal(state.dmTools.ordinaryCrafting.projects[start.projectId].uncreditedSeconds,14400)
 await refuse(call,'complete_ordinary_crafting_day',{eventId:'false-interday-credit',projectId:start.projectId,materialUses:[{itemId:raw.id,valueCp:50}]},'CRAFT_WORKDAY_NOT_COMPLETE')
 assert.equal(state.dmTools.ordinaryCrafting.projects[start.projectId].progressCp,0);assert.equal(state.dmTools.ordinaryCrafting.materials[raw.id].remainingValueCp,50);assert.equal(state.droppedItems['real-crafted-output'],undefined)
 ok(await call('replace_game_state',{gameState:state}));ok(await work(call,'after-midnight-second',14400));const result=ok(await complete(call,raw));assert.equal(result.itemsProduced,1);assert.equal(result.calendarDay,1)
 state=await call('get_game_state');assert.equal(state.dmTools.ordinaryCrafting.projects[start.projectId].workedSeconds,43200);assert.deepEqual(state.dmTools.ordinaryCrafting.projects[start.projectId].segments.map(s=>s.calendarDay),[0,1,1]);ok(await call('replace_game_state',{gameState:state}));ok(await complete(call,raw));assert.deepEqual(await call('get_game_state'),state);assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
test('late bookkeeping selects a fully worked prior date explicitly, never reuses it or assigns it to the completion date',async t=>{
 const{call,start,raw}=await setup(t,{profile:'basic_poison_vial',valueCp:5000});ok(await call('start_ordinary_crafting',start));ok(await work(call,'actual-work-day-zero'))
 let state=await call('get_game_state');ok(await call('advance_time',{seconds:86400-state.worldTimeSeconds}))
 await refuse(call,'complete_ordinary_crafting_day',{eventId:'wrong-current-date',projectId:start.projectId,materialUses:[{itemId:raw.id,valueCp:250}]},'CRAFT_WORKDAY_NOT_COMPLETE')
 const oldDay={eventId:'explicit-old-day-credit',projectId:start.projectId,materialUses:[{itemId:raw.id,valueCp:250}],calendarDay:0};assert.equal(ok(await call('complete_ordinary_crafting_day',oldDay)).calendarDay,0)
 await refuse(call,'complete_ordinary_crafting_day',{...oldDay,eventId:'duplicate-old-date'},'CRAFT_WORKDAY_ALREADY_CREDITED')
 ok(await work(call,'actual-work-day-one'));const today=ok(await complete(call,raw,250,'actual-day-one-credit'));assert.equal(today.calendarDay,1);assert.equal(today.progressCp,1000)
 state=await call('get_game_state');assert.deepEqual(state.dmTools.ordinaryCrafting.projects[start.projectId].periods.map(p=>p.calendarDay),[0,1]);ok(await call('replace_game_state',{gameState:state}));assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
test('one genuinely worked day may produce an explicitly chosen same-recipe batch totalling5gp, without prorating recipe hours',async t=>{
 const{call,start,raw,cell}=await setup(t,{valueCp:250}),fact=ok(await call('record_scene_fact',{description:'Ce vrai lot de matières comprend les pièces et tissus nécessaires aux cinq sacs de vingt chausse-trappes explicitement choisis ; sa valeur totale observée est2,5po.',cell})).worldFact
 const outputItemIds=Array.from({length:5},(_,i)=>`actual-same-recipe-lot-${i}`);ok(await call('start_ordinary_crafting',{...start,outputItemIds,materials:[{...start.materials[0],physicalFactId:fact.id}]}));ok(await work(call));const result=ok(await complete(call,raw,250))
 assert.equal(result.progressCp,500);assert.equal(result.itemsProduced,5);assert.deepEqual(result.producedItems.map(i=>i.id),outputItemIds);const state=await call('get_game_state');for(const id of outputItemIds){assert.equal(state.droppedItems[id].item.equipmentId,'caltrops');assert.equal(state.droppedItems[id].item.quantity,1)}
 ok(await call('replace_game_state',{gameState:state}));assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
test('a partially used actual raw batch invalidates its old whole mass, and only a real new measurement resolves carrying',async t=>{
 const{call,start,raw,tool}=await setup(t,{profile:'basic_poison_vial',valueCp:5000})
 await replace(call,s=>{s.player.inventory=s.player.inventory.filter(i=>[raw.id,tool.id].includes(i.id));s.dmTools.loadout={unarmoredAC:10+Math.floor((s.player.stats.dex-10)/2)}})
 ok(await call('declare_physical_weight',{eventId:'real-whole-batch-weight',targetKind:'item',targetId:raw.id,weightLb:10,unit:'lb_per_inventory_unit',reason:'Le lot réel entier a été pesé.',source:'Mesure physique actuelle.'}));ok(await call('set_carrying_context',{eventId:'real-size',entityId:'player',size:'Medium',reason:'Taille réelle.',source:'Observation actuelle.'}))
 ok(await call('start_ordinary_crafting',start));assert.equal(ok(await call('inspect_carrying_capacity',{entityId:'player'})).status,'resolved');ok(await work(call));ok(await complete(call,raw,250));const missing=ok(await call('inspect_carrying_capacity',{entityId:'player'}));assert.equal(missing.status,'unresolved')
 ok(await call('declare_physical_weight',{eventId:'real-remainder-weight',targetKind:'item',targetId:raw.id,weightLb:9.8,unit:'lb_per_inventory_unit',reason:'Le reste actuel a réellement été pesé, sans calcul proportionnel au prix.',source:'Nouvelle pesée de cette instance.'}));assert.equal(ok(await call('inspect_carrying_capacity',{entityId:'player'})).status,'resolved');assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
test('twenty actual8hour workdays and real waits produce one Basic Poison dose from50gp ingredients, usable by its existing coating tool',async t=>{
 const{call,start,raw}=await setup(t,{profile:'basic_poison_vial',valueCp:5000});ok(await call('start_ordinary_crafting',start))
 for(let day=0;day<20;day++){
  ok(await work(call,`real-poison-work-${day}`));const credit=ok(await complete(call,raw,250,`real-poison-credit-${day}`));assert.equal(credit.progressCp,(day+1)*500);assert.equal(credit.itemsProduced,day===19?1:0)
  if(day<19){const state=await call('get_game_state'),seconds=(Math.floor(state.worldTimeSeconds/86400)+1)*86400-state.worldTimeSeconds;ok(await call('advance_time',{seconds}))}
 }
 let state=await call('get_game_state');assert.equal(state.dmTools.ordinaryCrafting.projects[start.projectId].workedSeconds,20*28800);assert.equal(state.dmTools.ordinaryCrafting.materials[raw.id].remainingValueCp,0);assert.equal(state.droppedItems['real-crafted-output'].item.equipmentId,'basic_poison_vial')
 ok(await call('replace_game_state',{gameState:state}));ok(await call('pick_up_item',{itemId:'real-crafted-output'}));state=await call('get_game_state');const weapon=state.player.inventory.find(i=>i.equipmentId==='longsword'||i.id==='longsword');assert.ok(weapon)
 ok(await call('equip_item',{itemId:weapon.id,operation:'equip',slot:'main_hand'}));ok(await call('coat_weapon_with_poison',{eventId:'actual-crafted-dose-use',vialItemId:'real-crafted-output',weaponReference:weapon.id}));assert.equal((await call('get_game_state')).player.inventory.some(i=>i.id==='real-crafted-output'),false)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
test('other DMG poison crafting never follows from a price or kit without the explicit discretionary permission and actual value',async t=>{
 const{call,start,physical}=await setup(t,{profile:'basic_poison_vial',valueCp:5000}),selected={...start,equipmentId:'poison_drow_poison'}
 await refuse(call,'start_ordinary_crafting',selected,'CRAFT_OTHER_POISON_PERMISSION_REQUIRED')
 await refuse(call,'start_ordinary_crafting',{...selected,otherPoisonPermissionConfirmed:true,otherPoisonPermissionFactId:physical.id},'CRAFT_OTHER_POISON_PERMISSION_REQUIRED')
 await refuse(call,'start_ordinary_crafting',{...selected,otherPoisonPermissionConfirmed:true,otherPoisonPermissionFactId:physical.id,actualMarketValueCp:20000},'CRAFT_MATERIAL_VALUE_REQUIRED')
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
test('a new crafting project rejects an actually spent poison identity before any of its days or ingredients',async t=>{
 const{call,start,cell}=await setup(t,{profile:'basic_poison_vial',valueCp:5000})
 ok(await call('create_scene_object',{objectId:'actual-old-dose-box',name:'Ancienne dose réelle',description:'Une dose physique déjà existante.',cell,kind:'container',material:'wood',size:'small',resilience:'fragile',contents:['basic_poison_vial']}));const dose=ok(await call('interact_object',{objectId:'actual-old-dose-box',action:'open'})).releasedItems[0]
 ok(await call('pick_up_item',{itemId:dose.id}));const state=await call('get_game_state'),weapon=state.player.inventory.find(i=>i.equipmentId==='longsword'||i.id==='longsword');assert.ok(weapon)
 ok(await call('equip_item',{itemId:weapon.id,operation:'equip',slot:'main_hand'}));ok(await call('coat_weapon_with_poison',{eventId:'actual-old-dose-use',vialItemId:dose.id,weaponReference:weapon.id}));ok(await call('equip_item',{itemId:weapon.id,operation:'unequip',slot:'main_hand'}))
 await refuse(call,'start_ordinary_crafting',{...start,outputItemIds:[dose.id]},'CRAFT_OUTPUT_ID_CONFLICT');assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
