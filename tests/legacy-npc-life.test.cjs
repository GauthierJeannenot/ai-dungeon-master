const test=require('node:test'),assert=require('node:assert/strict')
process.env.MONETIZATION_ENABLED='false'
const {installPgMem}=require('./helpers/pg-mem.cjs'),pg=installPgMem()
const {saveSession,loadSession,deleteSession}=require('../lib/session-store.ts')
const{engine,ok,replace,adjacent}=require('./helpers/mcp-toolkit.cjs')
test.after(()=>pg.restore())
async function refused(call,name,input,code){const before=await call('get_game_state'),answer=await call(name,input);assert.equal(answer.code,code,JSON.stringify(answer));assert.deepEqual(await call('get_game_state'),before);return answer}
async function setup(t,{dice='19',characterId='fighter',visible=true,stairs=false}={}){
 const call=await engine(t,{dice,characterId})
 if(stairs)await replace(call,s=>{s.currentMapId='temple';s.currentRoomId='20';s.player.position={x:38,y:22}})
 const state=await call('get_game_state'),cell=adjacent(state)[0],id='actual-legacy-zero'
 ok(await call('create_npc',{npcId:id,name:'Corps ancien réellement présent',statBlock:'goblin',cell,disposition:'neutral',visible,description:'La vraie création et le profil sont conservés ; cette ancienne sauvegarde ne connaît plus son état de vie.'}))
 await replace(call,s=>{const n=s.npcs[id];s.npcs[id]={id:n.id,name:n.name,kind:n.kind,position:n.position,mapId:n.mapId,roomId:n.roomId,visible:n.visible,disposition:n.disposition,description:n.description,hp:{current:0,max:n.hp.max},conditions:['unconscious']}})
 const fact=ok(await call('record_scene_fact',{description:'Observation physique actuelle de ce corps exact : son état actuel est réellement examiné ; aucun ancien décès, début de blessure, compteur ou dé passé connu.',cell})).worldFact
 const input={eventId:'actual-current-life-observation',entityId:id,physicalFactId:fact.id,observedState:'living_zero_unresolved',actualCurrentLifeObservedConfirmed:true,pastLifeHistoryUnknownConfirmed:true}
 return{call,id,cell,input}
}
const observe=f=>f.call('observe_legacy_npc_life',f.input)
const medicine=f=>f.call('combat_action',{actorId:'player',action:'stabilize',targetId:f.id})
async function persist(t,f,key){const state=await f.call('get_game_state'),id=`legacy-npc-life-${key}-${process.pid}`;t.after(()=>deleteSession(id));await saveSession(id,{gameState:state,history:[],adventureId:state.adventureId,characterId:state.characterId});ok(await f.call('replace_game_state',{gameState:(await loadSession(id)).gameState}));return f.call('get_game_state')}

test('actual observed old death restores its retained source without inventing HP, death time, visibility, activation or a historical roll',async t=>{
 const f=await setup(t,{visible:false});f.input.observedState='dead';const before=await f.call('get_game_state'),original=structuredClone(before.npcs[f.id]),source=structuredClone(before.dmTools.npcs[f.id]),a=ok(await observe(f));assert.equal(a.normalized,false);let state=await persist(t,f,'observed-dead'),npc=state.npcs[f.id]
 assert.equal(npc.isAlive,false);assert.deepEqual(npc.hp,original.hp);assert.equal(npc.visible,false);assert.equal(npc.statBlock.type,source.statBlock);assert.deepEqual(npc.npcLife.legacyObservation.originalNpc,original);assert.deepEqual(state.dmTools.npcs[f.id],source);assert.equal(state.hero.corpseTimes[f.id],undefined);assert.equal(npc.npcLife.episode,undefined);assert.equal(state.worldTimeSeconds,before.worldTimeSeconds);assert.equal(state.monsters[f.id],undefined);assert.deepEqual(state.initiativeOrder,before.initiativeOrder)
 const snapshot=await f.call('get_game_state');assert.equal(ok(await observe(f)).replayed,true);assert.deepEqual(await f.call('get_game_state'),snapshot);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})

test('living observation is not stability, a dying episode, zero counters or a clock reset; actual Medicine can still normalize at the uncertainty bound',async t=>{
 const f=await setup(t,{dice:'1,20,2,19'}),a=ok(await observe(f));assert.equal(a.normalized,false);let state=await persist(t,f,'living-unknown'),npc=state.npcs[f.id];assert.equal(npc.isAlive,true);assert.equal(npc.npcLife.episode,undefined);assert.deepEqual(npc.npcLife.receipts,{});assert.equal(npc.npcLife.legacyObservation.resolution,undefined)
 ok(await f.call('advance_time',{seconds:6}));await refused(f.call,'advance_time',{seconds:1},'NPC_LIFE_HISTORY_UNRESOLVED');await refused(f.call,'roll_death_save',{entityId:f.id,eventId:'fabricated-old-save'},'NPC_NOT_DYING')
 const failed=ok(await medicine(f));assert.equal(failed.success,false);state=await persist(t,f,'failed-medicine');assert.equal(state.npcs[f.id].npcLife.episode,undefined);assert.equal(state.npcs[f.id].npcLife.legacyObservation.resolution,undefined);assert.equal(state.worldTimeSeconds,6)
 const stabilized=ok(await medicine(f));assert.equal(stabilized.success,true);state=await persist(t,f,'new-real-stability');npc=state.npcs[f.id];assert.equal(npc.npcLife.episode.origin,'observation');assert.equal(npc.npcLife.episode.stableAt,6);assert.deepEqual(npc.npcLife.episode.recovery,{hours:2,wakeAt:7206});assert.deepEqual(npc.npcLife.legacyObservation.resolution,{kind:'stabilized',at:6});assert.equal(npc.npcLife.policy,undefined)
 const recovered=ok(await f.call('advance_time',{seconds:7200}));assert.equal(recovered.naturalRecoveries.length,1);state=await persist(t,f,'real-recovery');assert.equal(state.npcs[f.id].hp.current,1);assert.equal(state.npcs[f.id].isAlive,true);assert.equal(state.monsters[f.id],undefined);assert.equal(state.npcs[f.id].npcLife.legacyObservation.unknownHistory.deathSaveCounters,'unknown');assert.ok(state.npcs[f.id].conditions.includes('prone'));assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})

test('a genuine ordinary healing spell normalizes current living0HP without granting a policy, die, revelation or combat enrollment',async t=>{
 const f=await setup(t,{characterId:'cleric',dice:'2,19'});ok(await observe(f));const before=await f.call('get_game_state');ok(await f.call('cast_spell',{spellId:'healing-word',targetIds:[f.id],slotLevel:1}));const state=await persist(t,f,'healed')
 assert.ok(state.npcs[f.id].hp.current>0);assert.equal(state.npcs[f.id].isAlive,true);assert.equal(state.npcs[f.id].npcLife.episode,undefined);assert.equal(state.npcs[f.id].npcLife.policy,undefined);assert.deepEqual(state.npcs[f.id].npcLife.legacyObservation.resolution,{kind:'healed',at:before.worldTimeSeconds});assert.equal(state.monsters[f.id],undefined);assert.deepEqual(state.initiativeOrder,before.initiativeOrder);assert.equal(state.hero.corpseTimes[f.id],undefined);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})

test('a real observed old death refuses healing and undated Revivify before slot, diamond, HP, time or dice',async t=>{
 const f=await setup(t,{characterId:'cleric'});f.input.observedState='dead';ok(await observe(f));await refused(f.call,'cast_spell',{spellId:'healing-word',targetIds:[f.id],slotLevel:1},'ENTITY_DEAD');await refused(f.call,'cast_spell',{spellId:'revivify',targetIds:[f.id],slotLevel:3},'NPC_DEATH_TIME_UNKNOWN');assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})

test('existing known life, wrong physical fact, absent original source and changed observation cannot be rewritten',async t=>{
 const f=await setup(t),before=await f.call('get_game_state');await refused(f.call,'observe_legacy_npc_life',{...f.input,physicalFactId:'invented-observation'},'NPC_LIFE_PHYSICAL_OBSERVATION_REQUIRED');await replace(f.call,s=>delete s.dmTools.npcs[f.id]);await refused(f.call,'observe_legacy_npc_life',f.input,'NPC_LEGACY_STAT_BLOCK_SOURCE_REQUIRED');ok(await f.call('replace_game_state',{gameState:before}));ok(await observe(f));await refused(f.call,'observe_legacy_npc_life',{...f.input,eventId:'new-nonce',observedState:'dead'},'NPC_LIFE_OBSERVATION_IMMUTABLE');assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})

test('unknown counters refuse true damage/attack before a die; a real heal remains possible after the refusal',async t=>{
 const f=await setup(t,{characterId:'cleric',dice:'2,19'});ok(await observe(f));await refused(f.call,'update_hp',{entityId:f.id,delta:-1,damageType:'force',damageOrigin:'environment',reason:'Un vrai dommage exige de connaître les conséquences à zéro PV.'},'NPC_LIFE_HISTORY_UNRESOLVED');ok(await f.call('cast_spell',{spellId:'healing-word',targetIds:[f.id],slotLevel:1}));assert.ok((await f.call('get_game_state')).npcs[f.id].hp.current>0);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})

test('held Medicine and its original check survive SQL on an un-enrolled real NPC and commit one actual d4',async t=>{
 const f=await setup(t,{dice:'8,2,3,19'});ok(await observe(f));await replace(f.call,s=>s.hero.inspiration.push({targetId:'player',die:8,expiresAt:600}));const a=ok(await medicine(f));assert.ok(a.pendingReaction);await persist(t,f,'held-medicine');const b=ok(await f.call('resolve_reaction',{pendingId:a.pendingReaction.id,choice:'bardic_inspiration'}));assert.equal(b.success,true);const state=await persist(t,f,'completed-held');assert.equal(state.npcs[f.id].npcLife.episode.recovery.hours,3);assert.equal(state.hero.inspiration.length,0);assert.equal(state.monsters[f.id],undefined);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})

test('the same true stabilized NPC remains in npcs after a real stair passage and recovers on its original d4 clock without activation',async t=>{
 const f=await setup(t,{stairs:true,dice:'20,1,19'});ok(await observe(f));ok(await medicine(f));const before=await f.call('get_game_state'),wakeAt=before.npcs[f.id].npcLife.episode.recovery.wakeAt
 ok(await f.call('travel_to_map',{transitionId:'descend_manor',reason:'Le joueur emprunte réellement cet escalier existant ; le corps neutre reste sur son étage.'}));let state=await persist(t,f,'other-floor');assert.equal(state.currentMapId,'cellar');assert.equal(state.npcs[f.id].mapId,'temple');assert.equal(state.monsters[f.id],undefined)
 const elapsed=wakeAt-state.worldTimeSeconds;assert.ok(elapsed>0);const result=ok(await f.call('advance_time',{seconds:elapsed}));const event=result.naturalRecoveries.find(e=>e.entityId===f.id);assert.ok(event);assert.equal(event.archived,true);assert.equal(event.wakeAt,wakeAt);state=await persist(t,f,'offmap-recovered');assert.equal(state.npcs[f.id].hp.current,1);assert.equal(state.npcs[f.id].mapId,'temple');assert.equal(state.monsters[f.id],undefined);assert.equal(state.initiativeOrder.includes(f.id),false);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})

test('forged stable/counter history or an uncertainty clock reset is rejected on hydration without an implicit roll',async t=>{
 const f=await setup(t);ok(await observe(f));const before=await f.call('get_game_state'),forged=structuredClone(before);forged.npcs[f.id].npcLife.legacyObservation.resolution={kind:'stabilized',at:forged.worldTimeSeconds};forged.npcs[f.id].npcLife.episode={id:'fake-old-life',origin:'observation',at:forged.worldTimeSeconds,status:'stable',successes:0,failures:0,stableAt:forged.worldTimeSeconds};await refused(f.call,'replace_game_state',{gameState:forged},'NPC_LIFE_STATE_MISMATCH');const jumped=structuredClone(before);jumped.worldTimeSeconds+=7;await refused(f.call,'replace_game_state',{gameState:jumped},'NPC_LIFE_STATE_MISMATCH');assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})

test('actual healing during an existing encounter normalizes an un-enrolled observed body without choosing a new initiative slot',async t=>{
 const f=await setup(t,{characterId:'cleric',dice:'20,1,2,19'}),state=await f.call('get_game_state'),otherCell=adjacent(state).find(c=>c.x!==f.cell.x||c.y!==f.cell.y);assert.ok(otherCell)
 const enemy=ok(await f.call('spawn_monster',{monsterType:'goblin',cell:otherCell}));ok(await f.call('enter_combat',{combatants:['player',enemy.id]}));ok(await observe(f));const before=await f.call('get_game_state');assert.equal(before.currentTurn,'player');ok(await f.call('cast_spell',{spellId:'healing-word',targetIds:[f.id],slotLevel:1}));const after=await persist(t,f,'combat-heal');assert.ok(after.npcs[f.id].hp.current>0);assert.deepEqual(after.initiativeOrder,before.initiativeOrder);assert.equal(after.monsters[f.id],undefined);assert.equal(after.npcs[f.id].npcLife.legacyObservation.resolution.kind,'healed');assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})

test('a changed real Medicine helper refuses before an optional Inspiration die and preserves the original result',async t=>{
 const f=await setup(t,{dice:'8,2,3,19'});ok(await observe(f));await replace(f.call,s=>s.hero.inspiration.push({targetId:'player',die:8,expiresAt:600}));const pending=ok(await medicine(f)).pendingReaction;assert.ok(pending)
 // Model an actual capability change while preserving the original retained result.
 ok(await f.call('apply_condition',{entityId:'player',condition:'incapacitated'}));await refused(f.call,'resolve_reaction',{pendingId:pending.id,choice:'bardic_inspiration'},'NPC_MEDICINE_CONTEXT_CHANGED');const after=await f.call('get_game_state');assert.equal(after.hero.inspiration.length,1);assert.equal(after.hero.pending.command.result.roll.rolls[0],8);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,2)
})
