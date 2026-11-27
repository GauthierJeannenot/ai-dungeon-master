// External durable draft. Stage into tests/ of the exact final common copy.
// Not executed before A/C gels and the parent's common-copy signal.
const test=require('node:test'),assert=require('node:assert/strict')
Object.assign(process.env,{MONETIZATION_ENABLED:'false',LLM_MODE:'mock',ALLOW_PAID_LLM:'false',APP_LOG_PERSIST_ENABLED:'false',APP_LOG_LEVEL:'error',RUNPOD_AUTO_MANAGE:'false'})
const{installPgMem}=require('./helpers/pg-mem.cjs'),pg=installPgMem()
const{saveSession,loadSession,deleteSession}=require('../lib/session-store.ts')
const{setupXgeFall,skip,source}=require('./helpers/xge-falling-fixture.cjs')
const{engine,ok}=require('./helpers/mcp-toolkit.cjs')
test.after(()=>pg.restore())

async function pureCalendar(call){
 const before=await call('get_game_state'),view=ok(await call('inspect_campaign_calendar'))
 assert.equal(view.configured,true);assert.equal(view.readOnly,true);assert.equal(view.consequencesApplied,false)
 assert.deepEqual(await call('get_game_state'),before)
 assert.equal(view.worldTimeSeconds,before.worldTimeSeconds??0)
 assert.equal(view.anchorWorldTimeSeconds,before.dmTools.calendar.configuration.at)
 assert.equal(view.elapsedSeconds,(before.worldTimeSeconds??0)-before.dmTools.calendar.configuration.at)
 return view
}
test('configured calendar inspection preserves a true native fall and its exact due end turn through SQL; only the chosen actual turn-end descent progresses the source cursor',async t=>{
 // Public A options deliberately leave the genuinely flown body upright and
 // outside combat, so the calendar is configured legally before initiative.
 // No phase/currentTurn/altitude/cursor is altered by state replacement.
 const f=await setupXgeFall(t,{height:1200,combat:false,prone:false,rate500:true,flyingCreatureOption:false,dice:'20,1,19'})
 const{call}=f,s=await call('get_game_state')
 assert.notEqual(s.phase,'combat')
 const decision=ok(await call('record_scene_fact',{description:'Le MJ choisit réellement ce calendrier fixe de deux jours nommés et sa date actuelle exacte, avec jour86400secondes explicitement adopté. Cette ancre d’affichage ne change aucune seconde déjà réellement écoulée.',cell:s.player.position})).worldFact
 const calendar={eventId:'cross-fall-calendar-configuration',decisionFactId:decision.id,actualCalendarAndAnchorConfirmed:true,day86400SecondsExplicitlyAdopted:true,definition:{kind:'custom_fixed',name:'Calendrier explicite du croisement',segments:[{segmentId:'first',name:'Premier jour explicitement choisi',days:1},{segmentId:'second',name:'Second jour explicitement choisi',days:1}]},anchor:{year:1,segmentId:'first',day:1,secondOfDay:86399}}
 ok(await call('configure_campaign_calendar',calendar))
 const referenceFact=ok(await call('record_scene_fact',{description:'Le MJ consigne une référence civique au début du second jour choisi, sans observance ou conséquence mécanique automatique.',cell:s.player.position})).worldFact
 ok(await call('record_calendar_reference',{eventId:'cross-fall-calendar-reference-command',referenceId:'cross-fall-calendar-reference',factId:referenceFact.id,actualReferenceConfirmed:true,category:'civic_observance',name:'Référence civique explicitement choisie',description:'Repère documentaire uniquement, aucun événement de jeu déclenché.',anchor:{year:1,segmentId:'second',day:1,secondOfDay:0}}))
 const configured=await call('get_game_state'),configuration=structuredClone(configured.dmTools.calendar)
 assert.equal(configured.worldTimeSeconds,s.worldTimeSeconds)
 ok(await call('enter_combat',{combatants:['player',f.body.id]}))
 ok(await call('apply_condition',{entityId:f.body.id,condition:'prone'}))
 // Same actual measured prone-body observation as the A public fixture.
 ok(await call('record_physical_body',{eventId:'cross-fall-real-prone-body',entityId:f.body.id,heightFeet:3,actualMeasuredBodyConfirmed:true,source}))
 const beforeBegin=await call('get_game_state'),first=ok(await call('begin_xge_fall',f.input))
 assert.equal(first.descendedFeet,500);assert.equal(first.remainingFeet,700);assert.equal(first.actualPosition.zFeet,700)
 let current=await call('get_game_state')
 assert.equal(current.worldTimeSeconds,beforeBegin.worldTimeSeconds)
 assert.deepEqual(current.actionUsed,beforeBegin.actionUsed);assert.deepEqual(current.movementUsed,beforeBegin.movementUsed)
 await pureCalendar(call)
 assert.deepEqual((await call('get_game_state')).dmTools.calendar,configuration)
 // Reach the real later source turn using A's explicit next_turn helper;
 // it does not invent a turn or resolve an action selected by the server.
 if(current.currentTurn!==f.body.id)await skip(call)
 const due=ok(await call('inspect_xge_falling')).dueEndTurn;assert.ok(due)
 const atDue=await call('get_game_state')
 assert.equal(atDue.currentTurn,f.body.id)
 assert.equal(atDue.dmTools.xgeFalling.episodes[f.input.eventId].steps.length,1)
 await pureCalendar(call)
 assert.deepEqual(ok(await call('inspect_xge_falling')).dueEndTurn,due)
 assert.deepEqual(await call('get_game_state'),atDue)
 const sessionId=`calendar-real-native-fall-${process.pid}`;t.after(()=>deleteSession(sessionId))
 await saveSession(sessionId,{gameState:atDue,history:[],adventureId:atDue.adventureId,characterId:atDue.characterId})
 const loaded=(await loadSession(sessionId)).gameState;assert.deepEqual(loaded,atDue)
 const resumed=await engine(t,{adventureId:atDue.adventureId,characterId:atDue.characterId,dice:'19'})
 ok(await resumed('replace_game_state',{gameState:loaded}));assert.deepEqual(await resumed('get_game_state'),atDue)
 await pureCalendar(resumed)
 assert.deepEqual(ok(await resumed('inspect_xge_falling')).dueEndTurn,due)
 assert.deepEqual(await resumed('get_game_state'),atDue)
 const beforeRequiredTurn=await resumed('get_game_state'),refused=await resumed('next_turn',{actorId:f.body.id,skipAction:true})
 assert.equal(refused.code,'XGE_FALL_DESCENT_DUE');assert.deepEqual(await resumed('get_game_state'),beforeRequiredTurn)
 const descent={eventId:due.eventId,episodeId:f.input.eventId,endTurn:true}
 const second=ok(await resumed('resolve_xge_fall_descent',descent))
 assert.equal(second.descendedFeet,500);assert.equal(second.remainingFeet,200);assert.equal(second.actualPosition.zFeet,200)
 assert.equal(second.actionSpent,false);assert.equal(second.secondsAdvanced,0)
 const ended=await resumed('get_game_state')
 assert.equal(ended.worldTimeSeconds,atDue.worldTimeSeconds)
 assert.deepEqual(ended.actionUsed,atDue.actionUsed);assert.deepEqual(ended.movementUsed,atDue.movementUsed)
 assert.equal(ended.dmTools.xgeFalling.episodes[f.input.eventId].steps.length,2)
 assert.deepEqual(ended.dmTools.calendar,configuration)
 await pureCalendar(resumed)
 assert.equal(ok(await resumed('resolve_xge_fall_descent',descent)).replayed,true)
 assert.deepEqual(await resumed('get_game_state'),ended)
 // The explicit descent declares the genuine end; next_turn still has to
 // settle that turn. Only this ordinary turn transition advances its clock.
 await skip(resumed)
 current=await resumed('get_game_state')
 assert.ok(current.worldTimeSeconds>ended.worldTimeSeconds)
 assert.equal(current.dmTools.xgeFalling.episodes[f.input.eventId].steps.length,2)
 assert.equal(current.dmTools.xgeFalling.episodes[f.input.eventId].steps.at(-1).toZFeet,200)
 assert.deepEqual(current.dmTools.calendar,configuration)
 const view=await pureCalendar(resumed)
 assert.equal(view.date.segmentId,'second');assert.equal(view.date.secondOfDay,view.elapsedSeconds-1)
 assert.equal(view.references[0].consequencesApplied,false)
 assert.equal(ok(await resumed('roll_dice',{notation:'1d20'})).total,19)
})
