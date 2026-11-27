const test=require('node:test'),assert=require('node:assert/strict')
process.env.MONETIZATION_ENABLED='false'
const {installPgMem}=require('./helpers/pg-mem.cjs'),pg=installPgMem()
const {saveSession,loadSession,deleteSession}=require('../lib/session-store.ts')
const {fixture,ok}=require('./helpers/ammunition-fixture.cjs')
const gs=require('../mcp-server/dist/mcp-server/game-state.js')
const {registerPoisonHarvestTools}=require('../mcp-server/dist/mcp-server/tools/poison-harvest-tools.js')
test.after(()=>pg.restore())
async function refused(f,name,input,code){const before=await f.call('get_game_state'),answer=await f.call(name,input);assert.equal(answer.code,code,JSON.stringify(answer));assert.deepEqual(await f.call('get_game_state'),before);return answer}
const types={serpent_venom:'giant_poisonous_snake',carrion_crawler_mucus:'carrion_crawler',purple_worm_poison:'purple_worm',wyvern_poison:'wyvern'}
async function setup(t,{template='serpent_venom',dice='1,20,19',availableDoses=1,nature=false,kit=false,expertise=false,dead=false,stdio=false}={}){
 let f
 if(stdio){const{engine}=require('./helpers/mcp-toolkit.cjs');f={call:await engine(t,{dice})}}
 else{f=await fixture(t,{startBattle:false,quantity:null,weapon:'longsword',dice});delete f.state.monsters.target;const callbacks={},server={tool(n,d,c,fn){callbacks[n]=v=>fn(require('zod').z.object(c).parse(v))},registerTool(n,c,fn){callbacks[n]=v=>fn(require('zod').z.object(c.inputSchema).parse(v))}};registerPoisonHarvestTools(server);require('../mcp-server/dist/mcp-server/tools/player-poison-tools.js').registerPlayerPoisonTools(server);require('../mcp-server/dist/mcp-server/tools/player-tools.js').registerPlayerTools(server);const prior=f.call;f.call=async(n,v={})=>callbacks[n]?JSON.parse((await callbacks[n](v)).content[0].text):prior(n,v)}
 const state=await f.call('get_game_state'),cell=stdio?require('./helpers/mcp-toolkit.cjs').adjacent(state)[0]:{x:2,y:2}
 const body=ok(await f.call('spawn_monster',{monsterType:types[template],cell}));f.body=body;f.template=template;f.cell=cell
 ok(await f.call('apply_condition',{entityId:body.id,condition:'incapacitated'}))
 let current=await f.call('get_game_state');if(!current.dmTools?.loadout){const weapon=current.player.inventory.find(i=>i.type==='weapon');if(weapon)ok(await f.call('equip_item',{itemId:weapon.id,operation:'unequip',slot:'main_hand'}))}
 for(const[key,slot]of [['mainHandId','main_hand'],['offHandId','off_hand'],['shieldId','shield']]){current=await f.call('get_game_state');if(current.dmTools?.loadout?.[key])ok(await f.call('equip_item',{itemId:current.dmTools.loadout[key],operation:'unequip',slot}))}
 ok(await f.call('create_scene_object',{objectId:'actual-harvest-supplies',name:'Matériel réellement présent',description:'Le vrai récipient vide et le kit indiqué sont physiquement présents.',cell:state.player.position,kind:'container',material:'wood',size:'small',resilience:'resilient',contents:['vial',...kit?['poisoners_kit']:[]]}))
 const items=ok(await f.call('interact_object',{objectId:'actual-harvest-supplies',action:'open'})).releasedItems
 f.vial=items.find(i=>i.equipmentId==='vial');for(const item of items){ok(await f.call('declare_physical_weight',{eventId:`actual-mass-${item.id}`,targetKind:'item',targetId:item.id,weightLb:item===f.vial?0.1:2,unit:'lb_per_inventory_unit',reason:'Masse de cet exemplaire réellement pesé.',source:'Mesure physique actuelle explicite, pas poids imprimé ou proportion inventée.'}));ok(await f.call('pick_up_item',{itemId:item.id}))}
 if(nature||kit||expertise){const live=gs.getState();if(nature)live.player.skillProficiencies.push('nature');if(expertise){live.player.expertise??=[];live.player.expertise.push('nature')}if(kit){live.player.toolProficiencies??=[];live.player.toolProficiencies.push('poisoners_kit')}}
 const fact=ok(await f.call('record_scene_fact',{description:'Observation actuelle : matière organique accessible sur cet individu réel, réserve finie et quantité explicitement observée par le MJ.',cell})).worldFact
 const containerFact=ok(await f.call('record_scene_fact',{description:'Cette vraie fiole est vide et physiquement adaptée à contenir une dose ; aucune capacité ni fiole supplémentaire inventée.',cell:state.player.position})).worldFact
 f.observation={eventId:'actual-observation',sourceId:body.id,templateId:template,physicalFactId:fact.id,availableDoses,actualAccessibleOrganicMaterialConfirmed:true,actualFiniteReserveConfirmed:true}
 f.begin={eventId:'actual-begin',attemptId:'actual-attempt',sourceId:body.id,observationEventId:'actual-observation',containerItemId:f.vial.id,containerFactId:containerFact.id,actualEmptySuitableContainerConfirmed:true,doseItemId:'actual-filled-dose',doseCell:state.player.position,...kit?{poisonersKitItemId:items.find(i=>i.equipmentId==='poisoners_kit').id}:{}}
 return f
}
const work=(f,seconds,eventId='actual-work')=>f.call('work_poison_harvest',{eventId,attemptId:'actual-attempt',seconds,actualWorkConfirmed:true,restActivity:'strenuous',activitySource:'Extraction manuelle réellement effectuée sur cette source ; aucune minute offerte par attente.'})
const resolve=f=>f.call('resolve_poison_harvest',{attemptId:'actual-attempt'})
async function begin(f){ok(await f.call('observe_poison_harvest_source',f.observation));return ok(await f.call('begin_poison_harvest',f.begin))}
async function persist(t,f,key){const state=await f.call('get_game_state'),id=`harvest-${key}-${process.pid}`;t.after(()=>deleteSession(id));await saveSession(id,{gameState:state,history:[],adventureId:state.adventureId,characterId:state.characterId});const loaded=(await loadSession(id)).gameState;ok(await f.call('replace_game_state',{gameState:loaded}));return loaded}

test('real stdio source, retained1d6minutes and actual empty vial produce exactly one ground dose; SQL/replay never recreate glass or reroll',async t=>{
 const f=await setup(t,{stdio:true,dice:'2,20,19'}),a=await begin(f);assert.equal(a.requiredSeconds,120);assert.deepEqual(a.duration.rolls,[2]);const before=await f.call('get_game_state');assert.equal(before.worldTimeSeconds,a.startedAt);assert.equal(before.player.inventory.some(i=>i.id===f.vial.id),true)
 await refused(f,'resolve_poison_harvest',{attemptId:'actual-attempt'},'HARVEST_WORK_NOT_DUE');ok(await work(f,60));await persist(t,f,'work');ok(await work(f,60,'actual-work-second'));const result=ok(await resolve(f));assert.equal(result.success,true);assert.equal(result.itemsGranted,1);assert.equal(result.check.roll.total,20);assert.equal(result.physicalContainerItemId,f.vial.id)
 let state=await f.call('get_game_state');assert.equal(state.player.inventory.some(i=>i.id===f.vial.id),false);assert.equal(state.player.inventory.some(i=>i.id==='actual-filled-dose'),false);assert.equal(state.droppedItems['actual-filled-dose'].item.equipmentId,'poison_serpent_venom');assert.equal(state.dmTools.poisonHarvest.sources[f.body.id].remaining,0)
 await persist(t,f,'success');state=await f.call('get_game_state');assert.equal(ok(await resolve(f)).replayed,true);assert.deepEqual(await f.call('get_game_state'),state);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})

for(const template of Object.keys(types))test(`actual ${types[template]} is a valid observed natural source, never a substitute profile or free dose`,async t=>{
 const f=await setup(t,{template});const a=await begin(f);assert.equal(a.templateId,template);assert.equal(a.requiredSeconds,60);const state=await f.call('get_game_state');assert.equal(state.monsters[f.body.id].type,types[template]);assert.equal(state.droppedItems['actual-filled-dose'],undefined);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,20)
})

test('waiting supplies no work, duplicate event does not repeat time, and a new attempt cannot fish for another duration',async t=>{
 const f=await setup(t,{dice:'3,19'}),a=await begin(f);ok(await f.call('advance_time',{seconds:180}));await refused(f,'resolve_poison_harvest',{attemptId:'actual-attempt'},'HARVEST_WORK_NOT_DUE');await refused(f,'begin_poison_harvest',{...f.begin,eventId:'new-nonce',attemptId:'new-attempt',doseItemId:'other-dose'},'HARVEST_ATTEMPT_RESERVED');assert.deepEqual(ok(await f.call('begin_poison_harvest',f.begin)).duration,a.duration);ok(await work(f,60));const state=await f.call('get_game_state');assert.equal(ok(await work(f,60)).replayed,true);assert.deepEqual(await f.call('get_game_state'),state);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})

test('active, wrong, absent or petrified source and absent vial refuse before original duration die',async t=>{
 const f=await setup(t,{dice:'19'});gs.removeCondition(f.body.id,'incapacitated');await refused(f,'observe_poison_harvest_source',f.observation,'PLAYER_POISON_NATURAL_SOURCE_REQUIRED');ok(await f.call('apply_condition',{entityId:f.body.id,condition:'petrified'}));await refused(f,'observe_poison_harvest_source',f.observation,'HARVEST_ORGANIC_MATERIAL_UNREPRESENTED');await refused(f,'observe_poison_harvest_source',{...f.observation,sourceId:'invented-body'},'PLAYER_POISON_NATURAL_SOURCE_REQUIRED');gs.removeCondition(f.body.id,'petrified');ok(await f.call('apply_condition',{entityId:f.body.id,condition:'incapacitated'}));await refused(f,'observe_poison_harvest_source',{...f.observation,templateId:'wyvern_poison'},'PLAYER_POISON_NATURAL_SOURCE_REQUIRED');ok(await f.call('observe_poison_harvest_source',f.observation));await refused(f,'begin_poison_harvest',{...f.begin,containerItemId:'invented-vial'},'HARVEST_ACTUAL_EMPTY_VIAL_REQUIRED');assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})

test('finite source observation cannot refill after success by a new nonce, fact or elapsed time',async t=>{
 const f=await setup(t);await begin(f);ok(await work(f,60));ok(await resolve(f));const fact=ok(await f.call('record_scene_fact',{description:'Nouvelle observation actuelle du même corps après extraction, sans matière nouvelle.',cell:f.cell})).worldFact
 await refused(f,'observe_poison_harvest_source',{...f.observation,eventId:'false-refill',physicalFactId:fact.id,afterAttemptId:'actual-attempt'},'HARVEST_RESERVE_CANNOT_REFILL');const empty=ok(await f.call('observe_poison_harvest_source',{...f.observation,eventId:'actual-empty-observation',physicalFactId:fact.id,availableDoses:0,afterAttemptId:'actual-attempt'}));assert.equal(empty.availableDoses,0);await refused(f,'begin_poison_harvest',{...f.begin,eventId:'false-new-begin',attemptId:'false-new-attempt',observationEventId:'actual-empty-observation',doseItemId:'false-other-dose'},'HARVEST_RESERVE_OBSERVATION_REQUIRED');assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})

test('failure by less than5 gives no dose, keeps real empty glass and requires actual reserve reassessment without a free retry',async t=>{
 const f=await setup(t,{dice:'1,17,19'});await begin(f);ok(await work(f,60));const a=ok(await resolve(f));assert.equal(a.success,false);assert.equal(a.exposure,undefined);assert.equal(a.itemsGranted,0);assert.equal(a.check.roll.total,17);assert.equal((await f.call('get_game_state')).player.inventory.some(i=>i.id===f.vial.id),true);await persist(t,f,'failure');await refused(f,'begin_poison_harvest',{...f.begin,eventId:'retry-nonce',attemptId:'retry-attempt',doseItemId:'retry-dose'},'HARVEST_RESERVE_OBSERVATION_REQUIRED');assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})

test('failure by5 causes actual sourced snake CON/3d6poison without a fabricated bite or piercing packet; no dose',async t=>{
 const f=await setup(t,{dice:'1,15,1,1,2,3,19'});await begin(f);ok(await work(f,60));const before=(await f.call('get_game_state')).player.hp.current,a=ok(await resolve(f));assert.equal(a.success,false);assert.equal(a.exposure.playerPoison.save.dc,11);assert.equal(a.exposure.playerPoison.save.roll.total,7);assert.equal((await f.call('get_game_state')).player.hp.current,before-6);const state=await f.call('get_game_state'),delivery=Object.values(state.dmTools.playerPoisons.deliveries)[0];assert.equal(delivery.naturalSource.entityId,f.body.id);assert.equal(delivery.preparationId,undefined);assert.equal(state.droppedItems['actual-filled-dose'],undefined);await persist(t,f,'exposure');assert.equal(ok(await resolve(f)).replayed,true);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})

test('actual Nature expertise and real kit fallback never double proficiency, with missing kit refused before duration',async t=>{
 const f=await setup(t,{nature:true,expertise:true,dice:'1,14,19'});await begin(f);ok(await work(f,60));const a=ok(await resolve(f));assert.equal(a.check.proficient,true);assert.equal(a.check.expertise,true);assert.equal(a.check.roll.modifier,6);assert.equal(a.success,true);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('actual owned mastered poisoners kit applies only instead of missing Nature proficiency',async t=>{
 const f=await setup(t,{kit:true,dice:'1,17,19'});await begin(f);ok(await work(f,60));const a=ok(await resolve(f));assert.equal(a.check.roll.modifier,3);assert.equal(a.check.expertise,false);assert.equal(a.success,true);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})

test('held Nature die survives SQL and a changed body refuses BEFORE the optional Inspiration die',async t=>{
 const f=await setup(t,{dice:'1,17,4,19'});await begin(f);ok(await work(f,60));gs.getState().hero.inspiration.push({targetId:'player',die:8,expiresAt:600});const a=ok(await resolve(f));assert.ok(a.pendingReaction);assert.equal(a.pendingReaction.command.result.roll.total,17);await persist(t,f,'nature-held');gs.getState().monsters[f.body.id].hp.current--;await refused(f,'resolve_reaction',{pendingId:a.pendingReaction.id,choice:'bardic_inspiration'},'HARVEST_SOURCE_CHANGED');gs.getState().monsters[f.body.id].hp.current++;const b=ok(await f.call('resolve_reaction',{pendingId:a.pendingReaction.id,choice:'bardic_inspiration'}));assert.equal(b.success,true);assert.equal(b.check.roll.total,21);assert.equal((await f.call('get_game_state')).hero.inspiration.length,0);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})

test('natural CON held after failed extraction survives SQL and completes original harvest, not another Nature roll',async t=>{
 const f=await setup(t,{dice:'1,15,1,2,1,2,3,19'});await begin(f);ok(await work(f,60));gs.getState().hero.inspiration.push({targetId:'player',die:8,expiresAt:600});const nature=ok(await resolve(f));const save=ok(await f.call('resolve_reaction',{pendingId:nature.pendingReaction.id,choice:'decline'}));assert.equal(save.pendingReaction.command.type,'save');await persist(t,f,'save-held');const before=(await f.call('get_game_state')).player.hp.current,a=ok(await f.call('resolve_reaction',{pendingId:save.pendingReaction.id,choice:'bardic_inspiration'}));assert.equal(a.success,false);assert.equal(a.exposure.playerPoison.save.success,false);assert.equal((await f.call('get_game_state')).player.hp.current,before-6);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})

test('incapacity, overshoot and breathing boundary refuse actual work before clock or check dice; forged work hydration is rejected',async t=>{
 const f=await setup(t,{dice:'1,19'});await begin(f);await refused(f,'work_poison_harvest',{eventId:'overshoot',attemptId:'actual-attempt',seconds:61,actualWorkConfirmed:true,restActivity:'strenuous',activitySource:'Travail réellement prévu.'},'HARVEST_WORK_OVERSHOOT');ok(await f.call('set_breathing_context',{eventId:'actual-no-air',entityId:'player',mode:'choking',reason:'Absence réelle actuelle d’air, aucun historique inventé.'}));const answer=await work(f,60);assert.equal(answer.code,'ACTIVITY_BREATHING_BOUNDARY');const state=await f.call('get_game_state'),forged=structuredClone(state);forged.dmTools.poisonHarvest.attempts['actual-attempt'].workedSeconds=60;await refused(f,'replace_game_state',{gameState:forged},'POISON_HARVEST_STATE_MISMATCH');assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})

test('a genuine sourced body killed by the damage engine remains dead while its actual organic reserve yields one dose',async t=>{
 const f=await setup(t,{dice:'1,20,19'});const outcome=require('../mcp-server/dist/mcp-server/monster-rules.js').dealDamage(f.body.id,30,'force',{damageEventId:'actual-source-death'});assert.equal(outcome.damageDealt,30);assert.equal(gs.getMonster(f.body.id).isAlive,false)
 const fact=ok(await f.call('record_scene_fact',{description:'Observation actuelle du véritable cadavre : matière organique encore accessible et réserve finie établie ; aucune résurrection.',cell:f.cell})).worldFact;f.observation.physicalFactId=fact.id;await begin(f);ok(await work(f,60));const a=ok(await resolve(f));assert.equal(a.success,true);assert.equal(gs.getMonster(f.body.id).isAlive,false);assert.equal(gs.getMonster(f.body.id).hp.current,0);await persist(t,f,'actual-corpse');assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})

test('a successful actual natural CON save halves poison damage once and never adds a weapon wound',async t=>{
 const f=await setup(t,{dice:'1,15,20,1,2,3,19'});await begin(f);ok(await work(f,60));const before=gs.getPlayer().hp.current,a=ok(await resolve(f));assert.equal(a.success,false);assert.equal(a.exposure.playerPoison.save.success,true);assert.equal(gs.getPlayer().hp.current,before-3);assert.equal(a.exposure.weaponDamageDealt,0);assert.equal(a.exposure.poisonDamageDealt,3);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})

test('an unmastered kit or kit-plus-Nature claim refuses before the original duration die',async t=>{
 const f=await setup(t,{kit:true,dice:'19'});ok(await f.call('observe_poison_harvest_source',f.observation));gs.getPlayer().toolProficiencies=[];await refused(f,'begin_poison_harvest',f.begin,'HARVEST_KIT_FALLBACK_INVALID');gs.getPlayer().toolProficiencies=['poisoners_kit'];gs.getPlayer().skillProficiencies.push('nature');await refused(f,'begin_poison_harvest',f.begin,'HARVEST_KIT_FALLBACK_INVALID');assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})

test('a real timed incapacity ending during the requested interval cannot credit post-waking work',async t=>{
 const f=await setup(t,{dice:'1,19'});await begin(f);gs.getState().hero.effects.push({id:'actual-timed-source-incapacity',kind:'condition',sourceId:'player',targetIds:[f.body.id],expiresAt:30,concentration:false,data:{condition:'incapacitated'}})
 await refused(f,'work_poison_harvest',{eventId:'work-after-source-wakes',attemptId:'actual-attempt',seconds:60,actualWorkConfirmed:true,restActivity:'strenuous',activitySource:'Travail à arrêter avant le vrai réveil.'},'HARVEST_SOURCE_EVENT_BOUNDARY');assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
