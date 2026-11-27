const test=require('node:test'),assert=require('node:assert/strict')
Object.assign(process.env,{MONETIZATION_ENABLED:'false',LLM_MODE:'mock',ALLOW_PAID_LLM:'false',DM_RATE_LIMIT_PER_MINUTE:'0',APP_LOG_PERSIST_ENABLED:'false',APP_LOG_LEVEL:'error',LLM_MAX_CALLS_PER_REQUEST:'12'})
const{installPgMem}=require('./helpers/pg-mem.cjs'),pg=installPgMem()
const{setup,prepareLightObject,cover,refused}=require('./helpers/light-spell-fixture.cjs')
const{engine,ok,spawn,grid}=require('./helpers/mcp-toolkit.cjs')
const{saveSession,loadSession,deleteSession}=require('../lib/session-store.ts')
const{play,lastResult}=require('./helpers/dm-scripted-turn.cjs')
const{noIdentity}=require('./helpers/spell-perception-fixture.cjs')
test.after(()=>pg.restore())
async function resume(t,call,dice='19'){const s=await call('get_game_state'),id=`actual-light-api-${process.pid}-${Date.now()}`;t.after(()=>deleteSession(id));await saveSession(id,{gameState:s,history:[],adventureId:s.adventureId,characterId:s.characterId});const next=await engine(t,{adventureId:s.adventureId,characterId:s.characterId,dice});ok(await next('replace_game_state',{gameState:(await loadSession(id)).gameState}));assert.deepEqual(await next('get_game_state'),s);return next}

test('actual POST chooses factual measurement, exact object Light and its original observer reading; a second cast is refused before source costs, then SQL/new engine keeps it',async t=>{
 const f=await setup(t),object=await prepareLightObject(f.call,{objectId:'actual-api-light-object',measure:false}),observer=await spawn(f.call);let event
 const casting={spellId:'light',lightObject:{objectId:object.objectId,color:'violet'},focusItemId:'component_pouch',spellObservers:[{observerId:observer.id,channels:['sight']}]}
 const{result,seen,selected}=await play(t,f.call,[{name:'record_light_object',input:object.input},{name:'cast_spell',input:casting},params=>{event=lastResult(params).spellPerceptionEventId;assert.ok(event);return{name:'inspect_spellcasting_perception',input:{eventId:event,observerId:observer.id}}},params=>{noIdentity(lastResult(params));return{name:'cast_spell',input:casting}},params=>{assert.equal(lastResult(params).code,'PRIMARY_ACTION_ALREADY_RESOLVED');return 'La lumière est attachée au même objet réellement mesuré, sans identifier le sort pour le témoin.'}],'Je choisis cet objet réel mesuré et cette couleur, puis je demande la perception initiale du témoin.')
 assert.deepEqual(seen,selected.slice(0,3));assert.equal(Object.keys(result.newGameState.dmTools.lightSpell.casts).length,1);const next=await resume(t,f.call),view=ok(await next('inspect_spellcasting_perception',{eventId:event,observerId:observer.id}));noIdentity(view);assert.equal(view.sourceAttributed,true);assert.equal(ok(await next('inspect_lighting',{cell:object.cell})).activeLights.find(l=>l.objectId===object.objectId).color,'violet');assert.equal(ok(await next('roll_dice',{notation:'1d20'})).total,19)
})

test('a real Ready Light followed by explicitly granted second-action Light never revives its obsolete generation at old release, including SQL and original perceptions',async t=>{
 const f=await setup(t,{dice:'20,1,19'}),b=await prepareLightObject(f.call,{objectId:'newer-light-object'}),observer=await spawn(f.call);ok(await f.call('enter_combat',{combatants:['player',observer.id]}));const initial=await f.call('get_game_state'),nav=grid(initial,observer.id),from=initial.monsters[observer.id].position,step=nav.neighbors(from).find(cell=>nav.step(from,cell)&&Math.max(Math.abs(cell.x-initial.player.position.x),Math.abs(cell.y-initial.player.position.y))<=1);assert.ok(step)
 let readyId,firstPerception,newerEffect,current=f.call,refusalSeen=false,restarted=false,originalView
 // Genuine SQL/new-engine replacement occurs after the newer committed cast,
 // before the agent chooses the old release. These are hydration/read calls,
 // not game actions synthesized by the application server.
 const forward=async(name,input={})=>{const before=await current('get_game_state'),result=await current(name,input);if(name==='cast_spell'&&input.lightObject?.objectId===b.objectId){current=await resume(t,current,'1,19');restarted=true;originalView=ok(await current('inspect_spellcasting_perception',{eventId:firstPerception,observerId:observer.id}))}if(name==='resolve_readied_action'){assert.equal(result.code,'LIGHT_ORIGINAL_CAST_REQUIRED');assert.deepEqual(await current('get_game_state'),before);assert.equal(before.hero.reactionsUsed.player??false,false);refusalSeen=true}return result};forward.client=f.call.client
 const{seen,selected}=await play(t,forward,[
  {name:'combat_action',input:{action:'ready',readied:{kind:'spell',spellId:'light',lightObject:f.object.selection,focusItemId:'component_pouch',spellObservers:[{observerId:observer.id,channels:['sight']}],trigger:'The actual observer completes its chosen visible adjacent step.'}}},
  params=>{const r=lastResult(params);readyId=r.readyId;firstPerception=r.spellPerceptionEventId;assert.ok(readyId);return{name:'grant_player_action',input:{reason:'An actual exceptional MJ ruling permits this separately declared second action now; no class feature, new turn, movement, source slot or creature power is granted.'}}},
  params=>{assert.equal(lastResult(params).additionalPlayerAction,true);return{name:'cast_spell',input:{spellId:'light',lightObject:{...b.selection,color:'green'},focusItemId:'component_pouch',spellObservers:[{observerId:observer.id,channels:['sight']}]}}},
  params=>{newerEffect=lastResult(params).effectId;assert.ok(newerEffect);return{name:'pass_turn',input:{reason:'The player explicitly ends the real completed turn after the second chosen Light.'}}},
  {name:'move_token',input:{tokenId:observer.id,toCell:step}},
  ()=>({name:'resolve_readied_action',input:{readyId,choice:'execute',triggerObserved:'This selected actual visible step has really occurred during its source actor turn.'}}),
  params=>{assert.equal(lastResult(params).code,'LIGHT_ORIGINAL_CAST_REQUIRED');return{name:'inspect_lighting',input:{cell:b.cell}}},
  params=>{assert.equal(lastResult(params).activeLights.filter(l=>l.id===newerEffect).length,1);return{name:'resolve_monster_action',input:{monsterId:observer.id,targetId:'player',actionName:'Scimitar'}}},
  {name:'next_turn',input:{actorId:observer.id}},
  'Le nouveau sort reste seul actif ; l’ancien relâchement a été refusé sans réaction ni nouvelle lumière.',
 ],'Je prépare cette Lumière, demande une vraie seconde action exceptionnelle pour le nouveau lancer, puis choisis explicitement chaque transition et la tentative de relâchement sur le pas visible.')
 assert.deepEqual(seen,selected);assert.equal(restarted,true);assert.equal(refusalSeen,true);const after=await current('get_game_state');assert.equal(after.hero.effects.filter(e=>e.kind==='light').length,1);assert.equal(after.hero.effects.find(e=>e.id===newerEffect).data.objectId,b.objectId);assert.equal(Object.keys(after.dmTools.lightSpell.casts).length,2);assert.equal(Object.keys(after.dmTools.spellPerception.records).length,2);assert.deepEqual(ok(await current('inspect_spellcasting_perception',{eventId:firstPerception,observerId:observer.id})),originalView);assert.equal(ok(await current('roll_dice',{notation:'1d20'})).total,19)
})

test('actual POST exposes the costed opaque-cover and action-dismissal tools without granting a second primary action or resetting the original light',async t=>{
 const f=await setup(t),cast=ok(await f.cast()),operation=await cover(f.call,f.object.objectId,'opaque_full'),before=await f.call('get_game_state')
 const first=await play(t,f.call,[{name:'set_light_object_cover',input:operation},{name:'inspect_lighting',input:{cell:f.object.cell}},params=>{assert.equal(lastResult(params).activeLights.some(l=>l.id===cast.effectId),false);return 'La couverture opaque réelle bloque maintenant la source sans prolonger le sort.'}],'Je couvre effectivement cet objet avec cette couverture réelle selon l’intervalle précisément choisi.')
 assert.deepEqual(first.seen,first.selected);assert.equal(first.result.newGameState.worldTimeSeconds,before.worldTimeSeconds+operation.cost.seconds);assert.equal(first.result.newGameState.hero.effects.find(e=>e.id===cast.effectId).expiresAt,cast.expiresAt)
 const dismissal={eventId:'actual-api-dismissal',actorId:'player',effectId:cast.effectId},second=await play(t,f.call,[{name:'dismiss_light_spell',input:dismissal},{name:'cast_spell',input:{spellId:'light',lightObject:f.object.selection,focusItemId:'component_pouch'}},params=>{assert.equal(lastResult(params).code,'PRIMARY_ACTION_ALREADY_RESOLVED');return 'Le lanceur dissipe sa propre Lumière avec son action ; aucun second lancer n’a eu lieu.'}],'Je termine ce sort avec l’action de son propre lanceur.')
 assert.deepEqual(second.seen,second.selected.slice(0,1));assert.equal(second.result.newGameState.hero.effects.some(e=>e.id===cast.effectId),false);assert.equal(Object.keys(second.result.newGameState.dmTools.lightSpell.casts).length,1);const next=await resume(t,f.call),state=await next('get_game_state');assert.equal(ok(await next('dismiss_light_spell',dismissal)).replayed,true);assert.deepEqual(await next('get_game_state'),state);assert.equal(ok(await next('roll_dice',{notation:'1d20'})).total,19)
})
