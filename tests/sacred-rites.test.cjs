const test=require('node:test'),assert=require('node:assert/strict')
Object.assign(process.env,{MONETIZATION_ENABLED:'false',LLM_MODE:'mock',ALLOW_PAID_LLM:'false',DM_RATE_LIMIT_PER_MINUTE:'0',APP_LOG_PERSIST_ENABLED:'false',APP_LOG_LEVEL:'error'})
const{installPgMem}=require('./helpers/pg-mem.cjs'),pg=installPgMem()
const{engine,ok,adjacent}=require('./helpers/mcp-toolkit.cjs')
const{prepareSacredRitesAtCurrentSite,nextSacredRiteDate}=require('./helpers/sacred-rites-fixture.cjs')
const{saveSession,loadSession,deleteSession}=require('../lib/session-store.ts')
const{play,lastResult}=require('./helpers/dm-scripted-turn.cjs')
test.after(()=>pg.restore())
async function persist(t,call,dice='19'){const s=await call('get_game_state'),id=`rites-${process.pid}-${Date.now()}-${Math.random()}`;t.after(()=>deleteSession(id));await saveSession(id,{gameState:s,history:[],adventureId:s.adventureId,characterId:s.characterId});const fresh=await engine(t,{characterId:s.characterId,adventureId:s.adventureId,dice});ok(await fresh('replace_game_state',{gameState:(await loadSession(id)).gameState}));assert.deepEqual(await fresh('get_game_state'),s);return fresh}
const state=call=>call('get_game_state')
async function refuse(call,tool,input,code){const before=await state(call),result=await call(tool,input);assert.equal(result.code,code,JSON.stringify(result));assert.deepEqual(await state(call),before)}
async function nineDates(call,f){for(let i=0;i<9;i++){ok(await call('work_sacred_rites',f.work(i)));if(i<8)await nextSacredRiteDate(call)}}

test('ten real nonconsecutive rite dates yield one original2d6, exact-midnight first Inspiration and capped reserved daily awards through SQL without losing the token',async t=>{
 let call=await engine(t,{characterId:'bard',dice:'1,2,19'}),f=await prepareSacredRitesAtCurrentSite(call)
 assert.equal((await state(call)).dmTools.sacredRites,undefined)
 const initial=await state(call);ok(await call('start_sacred_rites',f.input));assert.deepEqual((await state(call)).player,initial.player)
 for(let i=0;i<9;i++){
  ok(await call('work_sacred_rites',f.work(i)));assert.equal((await state(call)).dmTools.dmInspiration,undefined)
  if(i===4)call=await persist(t,call,'1,2,19')
  if(i<8)await nextSacredRiteDate(call,i===2?3:1)
 }
 await nextSacredRiteDate(call);ok(await call('advance_time',{seconds:57600}));const before=await state(call)
 const result=ok(await call('work_sacred_rites',f.work(9))),p=result.project
 assert.equal(result.completedDays,10);assert.deepEqual(p.benefit.roll.rolls,[1,2]);assert.equal(p.benefit.roll.total,3)
 assert.equal(p.benefit.fromDay,Math.floor(before.worldTimeSeconds/86400)+1);assert.equal((await state(call)).worldTimeSeconds,p.benefit.fromDay*86400)
 assert.equal(p.benefit.awards.length,1);assert.equal(p.benefit.awards[0].outcome,'granted');assert.equal((await state(call)).dmTools.dmInspiration.held,true)
 const finished=await state(call);assert.equal(ok(await call('work_sacred_rites',f.work(9))).replayed,true);assert.deepEqual(await state(call),finished)
 const missing=structuredClone(finished);missing.dmTools.sacredRites.projects[0].benefit.awards=[]
 await refuse(call,'replace_game_state',{gameState:missing},'SACRED_RITES_STATE_MISMATCH')
 const doubled=structuredClone(finished);doubled.dmTools.sacredRites.projects[0].benefit.awards.push(structuredClone(doubled.dmTools.sacredRites.projects[0].benefit.awards[0]))
 await refuse(call,'replace_game_state',{gameState:doubled},'SACRED_RITES_STATE_MISMATCH')
 const rerolled=structuredClone(finished),changed=rerolled.dmTools.sacredRites.projects[0].benefit;changed.roll.rolls=[6,6];changed.roll.total=12;changed.lastDay=changed.fromDay+11
 await refuse(call,'replace_game_state',{gameState:rerolled},'SACRED_RITES_STATE_MISMATCH')
 ok(await call('spend_inspiration',{spendId:'reserved-sacred-gift',rollKind:'check'}));const reserved=(await state(call)).dmTools.dmInspiration.prepared
 await nextSacredRiteDate(call);let s=await state(call);assert.deepEqual(s.dmTools.dmInspiration.prepared,reserved);assert.equal(s.dmTools.sacredRites.projects[0].benefit.awards[1].outcome,'capped')
 call=await persist(t,call,'2,18,19');s=await state(call);assert.deepEqual(s.dmTools.dmInspiration.prepared,reserved)
 const check=ok(await call('roll_ability_check',{ability:'int',dc:10}));assert.equal(check.roll.rolls[0],18);assert.equal(check.advantage,true);assert.equal((await state(call)).dmTools.dmInspiration.spends['reserved-sacred-gift'].status,'consumed')
 await nextSacredRiteDate(call);s=await state(call);assert.equal(s.dmTools.sacredRites.projects[0].benefit.awards[2].outcome,'granted');assert.equal(s.dmTools.dmInspiration.held,true)
 await nextSacredRiteDate(call,2);s=await state(call);assert.equal(s.dmTools.sacredRites.projects[0].benefit.awards.length,3);assert.equal(s.dmTools.dmInspiration.held,true,'Expiration of the daily benefit does not revoke already gained Inspiration.')
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('actual temple/role qualifiers and shared downtime preflight prevent phantom priests and double rite/relaxation credit; abandonment keeps real effort and SQL',async t=>{
 const call=await engine(t,{characterId:'bard',dice:'19'}),initial=await state(call),npc=initial.npcs.avowed
 const {findNavigationPath}=require('../mcp-server/dist/lib/navigation.js')
 const path=findNavigationPath(initial,'player',{kind:'cell',cell:{x:npc.position.x-1,y:npc.position.y}});assert.ok(path.length)
 for(const cell of path)if(cell.x!==initial.player.position.x||cell.y!==initial.player.position.y)ok(await call('move_token',{tokenId:'player',toCell:cell}))
 ok(await call('reveal_npc',{npcId:'avowed',disposition:'neutral'}))
 const f=await prepareSacredRitesAtCurrentSite(call,{projectId:'bounded-rites',role:'lay_assistant',priestId:npc.id})
 await refuse(call,'start_sacred_rites',{...f.input,priestId:undefined},'SACRED_RITES_ACTUAL_PRIEST_REQUIRED')
 await refuse(call,'start_sacred_rites',{...f.input,devotionFactId:f.input.templeFactId},'SACRED_RITES_DISTINCT_FACTS_REQUIRED')
 ok(await call('start_sacred_rites',f.input));ok(await call('work_sacred_rites',f.work(0)))
 await refuse(call,'work_sacred_rites',f.work(1),'SACRED_RITES_DISTINCT_WORKDAY_REQUIRED')
 let s=await state(call);ok(await call('create_treasure',{treasureId:'rites-real-lodging-coins',mode:'authored',name:'Pièces réelles pour le logement distinct',description:'Sept pièces réellement ramassées avant paiement du logement de détente.',cell:s.player.position,coins:{gp:7}}));ok(await call('collect_treasure',{treasureId:'rites-real-lodging-coins'}))
 const fact=ok(await call('record_scene_fact',{description:'Le lieu réel fournit aussi la chambre modeste choisie pour cette activité distincte de détente payée, sans crédit religieux commun.',cell:s.player.position})).worldFact
 const relaxStart={eventId:'rites-distinct-relax',siteFactId:fact.id,explicitlyAdopted:true,actualLifestyleAvailable:true,lifestyle:'modest',paid:{gp:7}}
 await refuse(call,'start_xge_relaxation',relaxStart,'DOWNTIME_SHARED_DAY_REQUIRED')
 const relax={eventId:'rites-separate-relax-date',weekId:'rites-distinct-relax',seconds:28800,activitySource:'Huit heures consacrées à une détente distincte, sans rites.'}
 await nextSacredRiteDate(call);ok(await call('start_xge_relaxation',relaxStart));ok(await call('advance_xge_relaxation',relax));await refuse(call,'work_sacred_rites',f.work(1),'DOWNTIME_SHARED_DAY_REQUIRED')
 s=await state(call);assert.equal(s.dmTools.sacredRites.projects[0].segments.length,1);assert.equal(s.dmTools.dmInspiration,undefined)
 ok(await call('abandon_sacred_rites',{eventId:'real-rites-abandonment',projectId:f.input.projectId,reason:'Le personnage cesse réellement ce cycle inachevé, sans récompense rétroactive.'}))
 const fresh=await persist(t,call);assert.equal((await state(fresh)).dmTools.sacredRites.projects[0].segments.length,1);assert.equal(ok(await fresh('roll_dice',{notation:'1d20'})).total,19)
})

test('actual POST chooses only the tenth real rite date and inspection; a later real rest and day boundary grant the same original benefit after SQL',async t=>{
 const call=await engine(t,{characterId:'bard',dice:'1,1,19'}),f=await prepareSacredRitesAtCurrentSite(call,{projectId:'actual-api-sacred'})
 ok(await call('start_sacred_rites',f.input));await nineDates(call,f);await nextSacredRiteDate(call)
 const{result,seen,selected}=await play(t,call,[{name:'work_sacred_rites',input:f.work(9)},params=>{assert.equal(lastResult(params).completedDays,10);return{name:'inspect_sacred_rites',input:{}}},params=>{assert.equal(lastResult(params).state.projects[0].benefit.awards.length,0);return 'Les dix dates de rites sont réellement terminées ; les dons commenceront au prochain début de date.'}],'Je consacre cette dixième date aux rites du temple, puis je vérifie le bénéfice daté réel.')
 assert.deepEqual(seen,selected);assert.equal(result.newGameState.dmTools.sacredRites.projects[0].benefit.roll.total,2);assert.equal(result.newGameState.dmTools.dmInspiration,undefined)
 ok(await call('take_rest',{kind:'long'}));assert.equal((await state(call)).dmTools.dmInspiration,undefined)
 await nextSacredRiteDate(call);assert.equal((await state(call)).dmTools.dmInspiration.held,true)
 const fresh=await persist(t,call);assert.equal((await state(fresh)).dmTools.sacredRites.projects[0].benefit.awards.length,1);assert.equal(ok(await fresh('roll_dice',{notation:'1d20'})).total,19)
})

test('the earned benefit follows actual authored map travel and movement, with original daily caps and one real Inspiration check rather than temple requalification',async t=>{
 const call=await engine(t,{characterId:'bard',dice:'6,6,2,18,19'}),f=await prepareSacredRitesAtCurrentSite(call,{projectId:'actual-travel-sacred'})
 ok(await call('start_sacred_rites',f.input));await nineDates(call,f);await nextSacredRiteDate(call);ok(await call('work_sacred_rites',f.work(9)));await nextSacredRiteDate(call)
 ok(await call('spend_inspiration',{spendId:'sacred-before-departure',rollKind:'check'}));assert.equal(ok(await call('roll_ability_check',{ability:'int',dc:10})).roll.rolls[0],18)
 // Complete the actual authored departure requirements with their public tools.
 ok(await call('reveal_npc',{npcId:'sarah',disposition:'helpful'}));ok(await call('pick_up_item',{itemId:'sarah_diary_copy'}))
 ok(await call('travel_to_map',{transitionId:'sail_to_waterdeep',reason:'Le personnage choisit réellement de partir avec la copie après les rites achevés.'}))
 let s=await state(call);assert.equal(s.currentMapId,'waterdeep');assert.equal(s.dmTools.sacredRites.projects[0].start.site.mapId,'candlekeep');assert.deepEqual(s.dmTools.sacredRites.projects[0].benefit.awards.map(a=>a.outcome),['granted','granted','capped','capped'])
 assert.equal(s.dmTools.dmInspiration.held,true);const step=adjacent(s)[0];ok(await call('move_token',{tokenId:'player',toCell:step}))
 const fresh=await persist(t,call);s=await state(fresh);assert.equal(s.dmTools.dmInspiration.held,true);assert.equal(s.dmTools.sacredRites.projects[0].benefit.roll.total,12);assert.equal(ok(await fresh('roll_dice',{notation:'1d20'})).total,19)
})

test('256 actual discretionary MJ receipts never block an acquired rite benefit, its reserved-token boundary or its next source gift after a real check and SQL',async t=>{
 let call=await engine(t,{characterId:'bard',dice:'2,2,19'});const f=await prepareSacredRitesAtCurrentSite(call,{projectId:'full-manual-history'})
 ok(await call('start_sacred_rites',f.input));await nineDates(call,f);await nextSacredRiteDate(call);ok(await call('work_sacred_rites',f.work(9)));await nextSacredRiteDate(call)
 assert.equal((await state(call)).dmTools.dmInspiration.held,true)
 for(let i=0;i<256;i++)assert.equal(ok(await call('grant_inspiration',{eventId:'actual-full-manual-'+i,reason:'Le MJ choisit réellement cet événement discrétionnaire distinct ; l’Inspiration déjà détenue le plafonne.'})).capped,true)
 let s=await state(call);assert.equal(Object.keys(s.dmTools.dmInspiration.grants).length,256)
 await refuse(call,'grant_inspiration',{eventId:'actual-manual-overflow',reason:'Le registre discrétionnaire est plein, aucune histoire n’est effacée.'},'INSPIRATION_HISTORY_LIMIT')
 ok(await call('spend_inspiration',{spendId:'source-reserved-at-full-history',rollKind:'check'}));const reservation=(await state(call)).dmTools.dmInspiration.prepared
 await nextSacredRiteDate(call);s=await state(call);assert.deepEqual(s.dmTools.dmInspiration.prepared,reservation);assert.equal(s.dmTools.sacredRites.projects[0].benefit.awards[1].outcome,'capped');assert.equal(Object.keys(s.dmTools.dmInspiration.grants).length,256)
 call=await persist(t,call,'2,18,19');const check=ok(await call('roll_ability_check',{ability:'int',dc:10}));assert.equal(check.roll.rolls[0],18);assert.equal(check.advantage,true)
 await nextSacredRiteDate(call);s=await state(call);assert.equal(s.dmTools.dmInspiration.held,true);assert.equal(s.dmTools.sacredRites.projects[0].benefit.awards[2].outcome,'granted')
 await nextSacredRiteDate(call,3);s=await state(call);assert.equal(s.dmTools.sacredRites.projects[0].benefit.awards.length,4);assert.equal(s.dmTools.dmInspiration.held,true);assert.equal(Object.keys(s.dmTools.dmInspiration.grants).length,256)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
