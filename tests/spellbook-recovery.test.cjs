const test=require('node:test'),assert=require('node:assert/strict')
const {engine,ok,replace,grid}=require('./helpers/mcp-toolkit.cjs')
const {carryingItemContext,carryingItemWeight}=require('../mcp-server/dist/lib/carrying-state.js')
const source='Livre et fournitures physiquement établis, vrai travail d’écriture et provenance réelle confirmés par le MJ.'
const supply={mode:'paid_supply',providedAndConsumedConfirmed:true,source}
const activity={restActivity:'light',activitySource:'Écriture et lecture réellement effectuées, activité légère explicitement adjudiquée par le MJ.'}
async function book(call,id){await replace(call,state=>state.player.inventory.push({id,name:'Volume physique existant',type:'misc'}));return ok(await call('register_spellbook',{eventId:`register-${id}`,itemId:id,kind:'blank',actualBookConfirmed:true,blankConfirmed:true,source}))}
const backup=(eventId='actual-backup',extra={})=>({eventId,mode:'backup',spellId:'magic-missile',sourceBookId:'spellbook',destinationBookId:'actual-backup-book',paid:{gp:5},materials:supply,...activity,...extra})
async function refused(call,name,input,code){const before=await call('get_game_state'),response=await call(name,input);if(code)assert.equal(response.code,code,JSON.stringify(response));else assert.ok(response.error,JSON.stringify(response));assert.deepEqual(await call('get_game_state'),before);return response}
async function hydrate(call){const state=await call('get_game_state');ok(await call('replace_game_state',{gameState:state}));assert.deepEqual(await call('get_game_state'),state);return state}
function away(state){const g=grid(state),from=state.player.position;for(const first of g.neighbors(from))if(g.step(from,first))for(const second of g.neighbors(first))if(g.step(first,second)&&Math.max(Math.abs(second.x-from.x),Math.abs(second.y-from.y))>1)return second;assert.fail('Actual map needs a reachable point beyond arm reach.')}

test('read-only inspection and missing physical destination never create a book, ink, spell, payment or time',async t=>{
 const call=await engine(t,{characterId:'wizard',dice:'19'}),before=await call('get_game_state');assert.equal(ok(await call('inspect_spellbooks')).tracked,false);assert.deepEqual(await call('get_game_state'),before)
 await refused(call,'copy_personal_spell',backup(),'SPELLBOOK_ITEM_REQUIRED');assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
test('real personal backup copies only into the chosen owned book at1h10gp base, Savant halves evocations, prepared spells and source stay unchanged',async t=>{
 const call=await engine(t,{characterId:'wizard',dice:'19'});await book(call,'actual-backup-book');const before=await call('get_game_state'),copied=ok(await call('copy_personal_spell',backup()))
 assert.equal(copied.costGold,5);assert.equal(copied.seconds,1800);assert.equal(copied.destinationBookId,'actual-backup-book');let state=await hydrate(call);assert.equal(state.worldTimeSeconds,1800);assert.equal(state.dmTools.wallet.gp,before.dmTools.wallet.gp-5)
 assert.deepEqual(state.player.inventory.find(item=>item.id==='actual-backup-book').spellIds,['magic-missile']);assert.deepEqual(state.player.inventory.find(item=>item.id==='spellbook').spellIds,before.player.inventory.find(item=>item.id==='spellbook').spellIds);assert.deepEqual(state.player.knownSpells,before.player.knownSpells)
 assert.equal(ok(await call('copy_personal_spell',backup())).replayed,true);assert.deepEqual(await call('get_game_state'),state);await refused(call,'copy_personal_spell',backup('another-copy-nonce'),'SPELL_ALREADY_IN_BOOK')
 ok(await call('copy_personal_spell',backup('actual-shield-backup',{spellId:'shield',paid:{gp:10}})));state=await hydrate(call);assert.equal(state.worldTimeSeconds,5400);assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
test('same paid work progresses only through real explicit segments, survives a pause/hydration and rejects a nonce restart without charging twice',async t=>{
 const call=await engine(t,{characterId:'wizard',dice:'19'});await book(call,'actual-backup-book');const input=backup('segmented-copy',{workSeconds:900}),first=ok(await call('copy_personal_spell',input));assert.equal(first.status,'working');assert.equal(first.remainingWorkSeconds,900)
 let state=await hydrate(call);assert.deepEqual(state.player.inventory.find(item=>item.id==='actual-backup-book').spellIds,[]);assert.equal(state.dmTools.wallet.gp,245)
 await refused(call,'copy_personal_spell',backup('fake-restart'),'SPELL_COPY_ALREADY_IN_PROGRESS');ok(await call('advance_time',{seconds:30}));assert.equal(ok(await call('inspect_spellbooks')).jobs['segmented-copy'].workedSeconds,900)
 const done=ok(await call('continue_spell_copy',{eventId:'real-second-segment',jobId:first.jobId,seconds:900,restActivity:'light',source}));assert.equal(done.costGold,5);state=await hydrate(call);assert.equal(state.worldTimeSeconds,1830);assert.equal(state.dmTools.wallet.gp,245);assert.deepEqual(state.player.inventory.find(item=>item.id==='actual-backup-book').spellIds,['magic-missile'])
 assert.equal(ok(await call('copy_personal_spell',input)).replayed,true);assert.deepEqual(await call('get_game_state'),state);assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
test('actual owned material stock is decremented once, retains real remainder, never pays cash again and cannot be refilled by a nonce',async t=>{
 const call=await engine(t,{characterId:'wizard',dice:'19'});await book(call,'actual-backup-book');await replace(call,state=>state.player.inventory.push({id:'actual-fine-ink-stock',name:'Encres et composantes réellement acquises',type:'misc'}))
 ok(await call('declare_physical_weight',{eventId:'actual-stock-mass',targetKind:'item',targetId:'actual-fine-ink-stock',weightLb:1,unit:'lb_per_inventory_unit',reason:source,source}))
 const state0=await call('get_game_state'),item=state0.player.inventory.find(item=>item.id==='actual-fine-ink-stock'),contextBefore=carryingItemContext(state0,item),materials={mode:'owned_batch',itemId:item.id,declaredValueCp:1000,actualCopyMaterialsConfirmed:true,source}
 assert.equal(carryingItemWeight(state0,item).weightLb,1)
 await refused(call,'copy_personal_spell',backup('cash-double',{materials}),'SPELL_COPY_DOUBLE_PAYMENT')
 ok(await call('copy_personal_spell',backup('owned-ink-first',{paid:{},materials})));let state=await hydrate(call);assert.equal(state.dmTools.wallet.gp,250);assert.equal(state.dmTools.spellbooks.materials[item.id].remainingValueCp,500);assert.ok(state.player.inventory.some(value=>value.id===item.id));assert.notEqual(carryingItemContext(state,item),contextBefore);assert.equal(carryingItemWeight(state,item).weightLb,null)
 await refused(call,'copy_personal_spell',backup('fake-refill',{spellId:'burning-hands',paid:{},materials}),'SPELL_COPY_MATERIAL_HISTORY_CONFLICT')
 ok(await call('copy_personal_spell',backup('owned-ink-second',{spellId:'burning-hands',paid:{},materials:{...materials,declaredValueCp:500}})));state=await hydrate(call);assert.equal(state.dmTools.wallet.gp,250);assert.equal(state.dmTools.spellbooks.materials[item.id].remainingValueCp,0);assert.ok(!state.player.inventory.some(value=>value.id===item.id));assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
test('a truly lost physical book permits only currently prepared reconstruction, keeps its other spells lost and never supplies a free new volume',async t=>{
 const call=await engine(t,{characterId:'wizard',dice:'19'});await book(call,'actual-backup-book');ok(await call('drop_item',{itemId:'spellbook'}));await refused(call,'record_spellbook_loss',{eventId:'not-actually-lost',itemId:'spellbook',actualLossConfirmed:true,source},'SPELLBOOK_STILL_ACCESSIBLE')
 const dropped=await call('get_game_state');ok(await call('move_token',{tokenId:'player',toCell:away(dropped)}));ok(await call('record_spellbook_loss',{eventId:'actual-book-loss',itemId:'spellbook',actualLossConfirmed:true,source}));const before=await hydrate(call)
 assert.deepEqual(before.player.spellbook,[]);assert.ok(before.player.knownSpells.includes('shield'));const replacement=backup('prepared-replacement',{mode:'replacement',sourceBookId:undefined,lostBookId:'spellbook',spellId:'shield',paid:{gp:10}})
 await refused(call,'copy_personal_spell',{...replacement,eventId:'unprepared-lost-spell',spellId:'mage-armor'},'SPELL_NOT_PREPARED');ok(await call('copy_personal_spell',replacement));const after=await hydrate(call)
 assert.deepEqual(after.player.inventory.find(item=>item.id==='actual-backup-book').spellIds,['shield']);assert.deepEqual(after.player.spellbook,['shield']);assert.deepEqual(after.player.knownSpells,before.player.knownSpells);assert.ok(!after.player.inventory.some(item=>item.id==='spellbook'));assert.ok(after.droppedItems.spellbook)
 await refused(call,'cast_spell',{spellId:'detect-magic',ritual:true},'SPELLBOOK_RITUAL_SOURCE_REQUIRED');assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
test('several real personal books jointly supply explicitly chosen preparation and a replacement volume really supplies its ritual',async t=>{
 const call=await engine(t,{characterId:'wizard',dice:'19'});await book(call,'actual-backup-book');await book(call,'actual-second-book');ok(await call('copy_personal_spell',backup('detect-magic-backup',{spellId:'detect-magic',paid:{gp:10}})));ok(await call('copy_personal_spell',backup('second-book-shield',{spellId:'shield',destinationBookId:'actual-second-book',paid:{gp:10}})))
 ok(await call('drop_item',{itemId:'spellbook'}));ok(await call('take_rest',{kind:'long'}));await refused(call,'prepare_spells',{spellIds:['detect-magic','shield']},'SPELLBOOK_SELECTION_REQUIRED')
 ok(await call('prepare_spells',{spellIds:['detect-magic','shield'],bookIds:['actual-backup-book','actual-second-book']}));const prepared=await hydrate(call);assert.ok(prepared.player.knownSpells.includes('shield'));assert.ok(prepared.player.knownSpells.includes('detect-magic'))
 ok(await call('cast_spell',{spellId:'detect-magic'}));ok(await call('end_concentration'));const spent=(await call('get_game_state')).player.spellSlots.level1.current;ok(await call('take_rest',{kind:'short',arcaneRecovery:[1]}));assert.equal((await call('get_game_state')).player.spellSlots.level1.current,spent+1)
 const cast=ok(await call('cast_spell',{spellId:'detect-magic',ritual:true,spellbookItemId:'actual-backup-book'}));assert.equal(cast.durationSeconds,606);const state=await call('get_game_state');assert.equal(state.dmTools.casting.records[cast.castingId].input.spellbookItemId,'actual-backup-book');assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
test('missing supplies, inaccessible hands and inappropriate sources refuse before time, materials, money or dice',async t=>{
 const call=await engine(t,{characterId:'wizard',dice:'19'});await book(call,'actual-backup-book');const missing=backup('unproven-supplies');delete missing.materials;await refused(call,'copy_personal_spell',missing)
 await refused(call,'copy_personal_spell',backup('same-physical-book',{destinationBookId:'spellbook'}),'SPELL_ALREADY_IN_BOOK')
 await replace(call,state=>{state.player.conditions.push('blinded')});await refused(call,'copy_personal_spell',backup('cannot-see'),'SPELLBOOK_UNREADABLE');assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
test('legacy migration proves only original book identity from the fixed character template, never former contents or a physical replacement',async t=>{
 const call=await engine(t,{characterId:'wizard',dice:'19'});await replace(call,state=>state.player.inventory=state.player.inventory.filter(item=>item.id!=='spellbook'));await book(call,'actual-backup-book')
 ok(await call('record_spellbook_loss',{eventId:'legacy-loss-established-now',itemId:'spellbook',actualLossConfirmed:true,source}));let state=await hydrate(call),identity=state.dmTools.spellbooks.books.spellbook
 assert.equal(identity.provenance,'character_template');assert.equal(identity.historicalIdentityOnly,true);assert.deepEqual(identity.spellIds,[]);assert.equal(identity.declaredAt,0);assert.ok(!state.player.inventory.some(item=>item.id==='spellbook'));assert.equal(state.droppedItems.spellbook,undefined)
 ok(await call('copy_personal_spell',backup('legacy-prepared-replacement',{mode:'replacement',sourceBookId:undefined,lostBookId:'spellbook',spellId:'shield',paid:{gp:10}})));state=await hydrate(call);assert.deepEqual(state.player.spellbook,['shield']);assert.ok(!state.player.inventory.some(item=>item.id==='spellbook'));assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
test('copy work stops at a true thermal event, pays once and resumes the same real remaining seconds after explicit CON',async t=>{
 const call=await engine(t,{characterId:'wizard',dice:'20,19'});await book(call,'actual-backup-book');const state=await call('get_game_state')
 ok(await call('configure_weather',{eventId:'actual-copy-cold',roomId:state.currentRoomId,temperatureF:0,strongWind:false,precipitation:'none',sandstorm:false,fog:'none',source}))
 ok(await call('record_weather_exposure',{eventId:'actual-copy-exposure',entityId:'player',operation:'begin',exposed:true,breathes:true,altitudeFeet:0,historyKnown:true,knownColdPartialSeconds:3599,knownHeatPartialSeconds:0,priorResolvedHeatHours:0,knownAcclimationSeconds:0,source}))
 const input=backup('cold-copy',{spellId:'shield',paid:{gp:10}});await refused(call,'copy_personal_spell',input,'WEATHER_TIME_BOUNDARY');const started=ok(await call('copy_personal_spell',{...input,workSeconds:1}));assert.equal(started.remainingWorkSeconds,3599)
 await hydrate(call);await refused(call,'continue_spell_copy',{eventId:'skip-real-hour',jobId:started.jobId,seconds:3599,restActivity:'light',source},'WEATHER_EVENT_DUE')
 const due=ok(await call('inspect_weather')).events[0];ok(await call('resolve_weather_event',{eventId:due.eventId}));ok(await call('continue_spell_copy',{eventId:'actual-cold-continuation',jobId:started.jobId,seconds:3599,restActivity:'light',source}));const after=await hydrate(call);assert.equal(after.worldTimeSeconds,3600);assert.equal(after.dmTools.wallet.gp,240);assert.deepEqual(after.player.inventory.find(item=>item.id==='actual-backup-book').spellIds,['shield']);assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
test('segmented scroll copying rolls only once after real full work, preserves held Arcana and destroys the exact scroll once',async t=>{
 const {copyWork}=require('./helpers/spell-copy-supplies.cjs'),call=await engine(t,{characterId:'wizard',dice:'1,6,19'});await replace(call,state=>{state.player.spellbook=state.player.spellbook.filter(id=>id!=='shatter');state.player.inventory.find(item=>item.id==='spellbook').spellIds=[...state.player.spellbook];state.hero.inspiration.push({targetId:'player',expiresAt:90000,die:6})})
 const initial=await call('get_game_state');ok(await call('create_spell_scroll',{itemId:'real-copy-scroll',spellId:'shatter',name:'Parchemin réel',description:source,cell:initial.player.position}));ok(await call('pick_up_item',{itemId:'real-copy-scroll'}))
 const input=copyWork({eventId:'actual-scroll-work',itemId:'real-copy-scroll',paid:{gp:50},workSeconds:3600}),started=ok(await call('copy_spell_scroll',input));assert.equal(started.status,'working');let state=await hydrate(call);assert.equal(state.dmTools.wallet.gp,200);assert.equal(state.dmTools.spellScrolls['real-copy-scroll'].status,'active');assert.ok(!state.player.spellbook.includes('shatter'))
 const finishInput={eventId:'actual-scroll-second-half',jobId:started.jobId,seconds:3600,restActivity:'light',source},held=ok(await call('continue_spell_copy',finishInput));assert.ok(held.pendingReaction);await hydrate(call);const replay=ok(await call('resolve_spell_copy',{jobId:started.jobId}));assert.equal(replay.pendingReaction.id,held.pendingReaction.id)
 ok(await call('resolve_reaction',{pendingId:held.pendingReaction.id,choice:'bardic_inspiration'}));const done=ok(await call('resolve_spell_copy',{jobId:started.jobId}));assert.equal(done.replayed,true);assert.equal(done.success,true);assert.equal(done.check.dc,12);assert.equal(done.check.roll.rolls[0],1)
 state=await hydrate(call);assert.equal(state.worldTimeSeconds,7200);assert.equal(state.dmTools.wallet.gp,200);assert.equal(state.dmTools.spellScrolls['real-copy-scroll'].status,'consumed');assert.ok(state.player.spellbook.includes('shatter'));assert.equal(ok(await call('copy_spell_scroll',input)).replayed,true);assert.deepEqual(await call('get_game_state'),state);assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})


for(const stage of ['start','continuation'])test(`active copying ${stage} refuses work beyond the actual breathing collapse before money, time or progress`,async t=>{
 const call=await engine(t,{characterId:'wizard',dice:'19'});await book(call,'actual-backup-book')
 if(stage==='continuation')ok(await call('copy_personal_spell',backup('actual-breathing-job',{workSeconds:900})))
 await replace(call,state=>{state.player.stats.con=8})
 ok(await call('set_breathing_context',{entityId:'player',eventId:'actual-copy-choking',mode:'choking',reason:'Privation réelle d’air pendant cette activité d’écriture.'}))
 ok(await call('advance_time',{seconds:1}));const before=await call('get_game_state')
 if(stage==='start')await refused(call,'copy_personal_spell',backup('must-not-charge-unconscious-work',{workSeconds:6}),'SPELL_COPY_ACTIVITY_BOUNDARY')
 else await refused(call,'continue_spell_copy',{eventId:'must-not-credit-unconscious-work',jobId:'actual-breathing-job',seconds:6,restActivity:'light',source},'SPELL_COPY_ACTIVITY_BOUNDARY')
 assert.deepEqual(await call('get_game_state'),before)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('active copying may end at the exact breathing boundary but learns nothing until the actual reader can finish',async t=>{
 const call=await engine(t,{characterId:'wizard',dice:'19'});await book(call,'actual-backup-book')
 ok(await call('copy_personal_spell',backup('actual-edge-job',{workSeconds:1795})))
 await replace(call,state=>{state.player.stats.con=8})
 ok(await call('set_breathing_context',{entityId:'player',eventId:'actual-edge-choking',mode:'choking',reason:source}))
 ok(await call('advance_time',{seconds:1}))
 const result=ok(await call('continue_spell_copy',{eventId:'actual-last-readable-seconds',jobId:'actual-edge-job',seconds:5,restActivity:'light',source}))
 assert.equal(result.status,'awaiting_completion')
 let state=await hydrate(call);assert.equal(state.worldTimeSeconds,1801);assert.equal(state.player.hp.current,0)
 assert.equal(state.dmTools.spellbooks.jobs['actual-edge-job'].workedSeconds,1800)
 assert.deepEqual(state.player.inventory.find(item=>item.id==='actual-backup-book').spellIds,[])
 await refused(call,'resolve_spell_copy',{jobId:'actual-edge-job'})
 ok(await call('set_breathing_context',{entityId:'player',eventId:'actual-air-restored',mode:'air',reason:source}))
 ok(await call('update_hp',{entityId:'player',delta:1,reason:'Soin réellement résolu après rétablissement de l’air, sans réveil offert par la copie.'}))
 ok(await call('resolve_spell_copy',{jobId:'actual-edge-job'}));state=await hydrate(call)
 assert.equal(state.worldTimeSeconds,1801);assert.equal(state.dmTools.wallet.gp,245)
 assert.deepEqual(state.player.inventory.find(item=>item.id==='actual-backup-book').spellIds,['magic-missile'])
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
