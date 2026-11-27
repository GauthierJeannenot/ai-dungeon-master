const test=require('node:test'),assert=require('node:assert/strict')
Object.assign(process.env,{LLM_MODE:'mock',ALLOW_PAID_LLM:'false',MONETIZATION_ENABLED:'false',DM_RATE_LIMIT_PER_MINUTE:'0',APP_LOG_PERSIST_ENABLED:'false',APP_LOG_LEVEL:'error',LLM_MAX_CALLS_PER_REQUEST:'16'})
const{installPgMem}=require('./helpers/pg-mem.cjs'),pg=installPgMem()
const{play,lastResult}=require('./helpers/dm-scripted-turn.cjs')
const{engine,ok,replace,adjacent}=require('./helpers/mcp-toolkit.cjs')
const{localNpcHarvestContext}=require('../lib/dm/npc-harvest-context.ts')
test.after(()=>pg.restore())

async function legacy(t,dice='20,2,19',visible=false){
 const call=await engine(t,{dice}),state=await call('get_game_state'),cell=adjacent(state)[0],id='actual-api-legacy-body'
 ok(await call('create_npc',{npcId:id,name:'Ancien corps individuel réel',statBlock:'goblin',cell,disposition:'neutral',visible,description:'La création originale est conservée ; la vie de cette ancienne sauvegarde manque.'}))
 await replace(call,s=>{const n=s.npcs[id];s.npcs[id]={id:n.id,name:n.name,kind:n.kind,position:n.position,mapId:n.mapId,roomId:n.roomId,visible:n.visible,disposition:n.disposition,description:n.description,hp:{current:0,max:n.hp.max},conditions:['unconscious']}})
 const fact=ok(await call('record_scene_fact',{description:'Observation physique actuelle au même corps, sans date ancienne, compteurs ou stabilité connus.',cell})).worldFact
 return{call,id,input:{eventId:'actual-api-life-observation',entityId:id,physicalFactId:fact.id,observedState:'living_zero_unresolved',actualCurrentLifeObservedConfirmed:true,pastLifeHistoryUnknownConfirmed:true}}
}

test('API persists the exact model-selected current life observation and reads it without spending a player action',async t=>{
 const f=await legacy(t,'17,19'),commands=[{name:'observe_legacy_npc_life',input:f.input},{name:'inspect_legacy_npc_life',input:{}},{name:'roll_ability_check',input:{entityId:'player',ability:'wis',dc:10}}]
 const{result,seen,selected,before}=await play(t,f.call,[...commands,'Le constat actuel est conservé ; ton observation distincte a été résolue.'],'Le MJ constate la vie actuelle de ce corps ; j’observe ensuite les alentours.')
 assert.deepEqual(seen,selected);const after=result.newGameState,npc=after.npcs[f.id]
 assert.deepEqual(npc.npcLife.legacyObservation.input,f.input);assert.equal(npc.isAlive,true);assert.equal(npc.hp.current,0);assert.equal(npc.npcLife.episode,undefined);assert.equal(npc.npcLife.policy,undefined);assert.equal(npc.visible,false)
 assert.equal(after.worldTimeSeconds,before.worldTimeSeconds);assert.deepEqual(after.initiativeOrder,before.initiativeOrder);assert.equal(after.monsters[f.id],undefined);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})

test('API exposes real Medicine outside combat, preserves the one recovery die and rejects a second unrelated player action',async t=>{
 const f=await legacy(t,'20,2,19',true);ok(await f.call('observe_legacy_npc_life',f.input))
 const commands=[{name:'combat_action',input:{actorId:'player',action:'stabilize',targetId:f.id}},{name:'inspect_legacy_npc_life',input:{}},{name:'roll_ability_check',input:{entityId:'player',ability:'wis',dc:10}}]
 const{result,seen,selected,before}=await play(t,f.call,[(params,context)=>{assert.ok(context.availableTools.some(tool=>tool.name==='combat_action'));assert.ok(JSON.stringify(params.messages).includes('actual-api-life-observation'));return commands[0]},params=>{assert.equal(lastResult(params).success,true,JSON.stringify(lastResult(params)));return commands[1]},commands[2],params=>{assert.equal(lastResult(params).code,'PRIMARY_ACTION_ALREADY_RESOLVED');return 'Les premiers secours réussissent ; le corps reste inconscient et stable.'}],'Je stabilise réellement ce corps précis.')
 assert.deepEqual(seen,selected.slice(0,-1));const after=result.newGameState,npc=after.npcs[f.id]
 assert.equal(npc.npcLife.episode.status,'stable');assert.equal(npc.npcLife.episode.origin,'observation');assert.equal(npc.npcLife.episode.recovery.hours,2);assert.equal(npc.npcLife.legacyObservation.resolution.kind,'stabilized');assert.equal(npc.npcLife.policy,undefined)
 assert.equal(after.worldTimeSeconds,before.worldTimeSeconds);assert.equal(after.phase,'exploration');assert.deepEqual(after.initiativeOrder,before.initiativeOrder);assert.equal(after.monsters[f.id],undefined);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})

test('a confidential observation does not reveal a hidden body or permit public Medicine; the refusal consumes no die or player action',async t=>{
 const f=await legacy(t,'17,19');ok(await f.call('observe_legacy_npc_life',f.input))
 const commands=[{name:'combat_action',input:{actorId:'player',action:'stabilize',targetId:f.id}},{name:'roll_ability_check',input:{entityId:'player',ability:'wis',dc:10}}]
 const{result,seen,selected}=await play(t,f.call,[commands[0],params=>{assert.equal(lastResult(params).code,'STABILIZATION_TARGET_INVALID');return commands[1]},'Le corps caché n’a reçu aucun soin ; ton observation distincte est résolue.'],'Le MJ connaît ce corps ; je ne peux pas soigner une cible encore cachée.')
 assert.deepEqual(seen,selected);const npc=result.newGameState.npcs[f.id];assert.equal(npc.visible,false);assert.equal(npc.hp.current,0);assert.equal(npc.npcLife.legacyObservation.resolution,undefined);assert.equal(npc.npcLife.episode,undefined);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})

async function harvest(t){
 const call=await engine(t,{dice:'2,20,19'}),state=await call('get_game_state'),cell=adjacent(state)[0]
 const body=ok(await call('spawn_monster',{monsterType:'giant_poisonous_snake',cell}));ok(await call('apply_condition',{entityId:body.id,condition:'incapacitated'}))
 // Free the actual hands; no kit or proficiency is invented.
 for(const[key,slot]of [['mainHandId','main_hand'],['offHandId','off_hand'],['shieldId','shield']]){const current=await call('get_game_state');if(current.dmTools?.loadout?.[key])ok(await call('equip_item',{itemId:current.dmTools.loadout[key],operation:'unequip',slot}))}
 const current=await call('get_game_state');if(!current.dmTools?.loadout){const weapon=current.player.inventory.find(i=>i.type==='weapon');if(weapon)ok(await call('equip_item',{itemId:weapon.id,operation:'unequip',slot:'main_hand'}));const shield=current.player.inventory.find(i=>(i.equipmentId??i.id)==='shield');if(shield)ok(await call('equip_item',{itemId:shield.id,operation:'unequip',slot:'shield'}))}
 ok(await call('create_scene_object',{objectId:'actual-api-vial-stock',name:'Fiole présente',description:'Une véritable fiole vide physiquement présente.',cell:state.player.position,kind:'container',material:'wood',size:'small',resilience:'resilient',contents:['vial']}))
 const vial=ok(await call('interact_object',{objectId:'actual-api-vial-stock',action:'open'})).releasedItems[0]
 ok(await call('declare_physical_weight',{eventId:'actual-api-vial-mass',targetKind:'item',targetId:vial.id,weightLb:0.1,unit:'lb_per_inventory_unit',reason:'Cette fiole a réellement été pesée.',source:'Mesure physique actuelle.'}));ok(await call('pick_up_item',{itemId:vial.id}))
 const sourceFact=ok(await call('record_scene_fact',{description:'Matière organique actuelle accessible et réserve finie effectivement observée sur ce corps incapable.',cell})).worldFact
 const vialFact=ok(await call('record_scene_fact',{description:'Cette même véritable fiole est vide et adaptée à une dose ; aucune autre fiole créée.',cell:state.player.position})).worldFact
 const observe={eventId:'actual-api-reserve',sourceId:body.id,templateId:'serpent_venom',physicalFactId:sourceFact.id,availableDoses:1,actualAccessibleOrganicMaterialConfirmed:true,actualFiniteReserveConfirmed:true}
 const begin={eventId:'actual-api-begin',attemptId:'actual-api-extraction',sourceId:body.id,observationEventId:observe.eventId,containerItemId:vial.id,containerFactId:vialFact.id,actualEmptySuitableContainerConfirmed:true,doseItemId:'actual-api-filled-vial',doseCell:state.player.position}
 const work=eventId=>({eventId,attemptId:begin.attemptId,seconds:60,actualWorkConfirmed:true,restActivity:'strenuous',activitySource:'Extraction manuelle effectivement réalisée ; attendre ne fournit aucun travail.'})
 return{call,body,vial,observe,begin,work}
}

test('API persists all five harvest tools, keeps exact segmented work on one attempt and refuses unrelated work before another die',async t=>{
 const f=await harvest(t),commands=[{name:'observe_poison_harvest_source',input:f.observe},{name:'begin_poison_harvest',input:f.begin},{name:'work_poison_harvest',input:f.work('actual-api-work-1')},{name:'work_poison_harvest',input:f.work('actual-api-work-2')},{name:'resolve_poison_harvest',input:{attemptId:f.begin.attemptId}},{name:'inspect_poison_harvest',input:{}}]
 const{result,seen,selected,before}=await play(t,f.call,[...commands,{name:'work_poison_harvest',input:{...f.work('unrelated-work'),attemptId:'unrelated-attempt'}},params=>{assert.equal(lastResult(params).code,'PRIMARY_ACTION_ALREADY_RESOLVED');return 'L’extraction réelle remplit la même fiole et la laisse au sol.'}],'Je récolte ce venin dans ma fiole réelle, en deux segments de travail réels.')
 assert.deepEqual(seen,selected.slice(0,-1));const after=result.newGameState,a=after.dmTools.poisonHarvest.attempts[f.begin.attemptId]
 assert.equal(a.status,'resolved');assert.deepEqual(a.duration.rolls,[2]);assert.equal(a.workedSeconds,120);assert.equal(a.segments.length,2);assert.equal(after.worldTimeSeconds,before.worldTimeSeconds+120);assert.equal(after.dmTools.poisonHarvest.sources[f.body.id].remaining,0)
 assert.equal(after.player.inventory.some(i=>i.id===f.vial.id),false);assert.equal(after.player.inventory.some(i=>i.id===f.begin.doseItemId),false);assert.equal(after.droppedItems[f.begin.doseItemId].item.equipmentId,'poison_serpent_venom');assert.deepEqual(after.player.position,before.player.position);assert.deepEqual(after.player.hp,before.player.hp)
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
 const context=localNpcHarvestContext(after);assert.ok(context.includes(f.begin.attemptId));assert.equal(localNpcHarvestContext({...after,currentMapId:'a-different-map'}),'','other-map receipts remain outside the local context')
})
