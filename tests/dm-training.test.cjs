const test=require('node:test'),assert=require('node:assert/strict')
Object.assign(process.env,{LLM_MODE:'mock',ALLOW_PAID_LLM:'false',MONETIZATION_ENABLED:'false',DM_RATE_LIMIT_PER_MINUTE:'0',APP_LOG_PERSIST_ENABLED:'false',APP_LOG_LEVEL:'error',LLM_MAX_CALLS_PER_REQUEST:'12'})
const{installPgMem}=require('./helpers/pg-mem.cjs'),pg=installPgMem()
const{play,lastResult}=require('./helpers/dm-scripted-turn.cjs')
const{engine,ok,adjacent}=require('./helpers/mcp-toolkit.cjs')
const{serializeGameState}=require('../lib/dm/prompts.ts')
test.after(()=>pg.restore())
const activitySource='Le vrai professeur présent enseigne effectivement cette langue pendant le segment choisi, sans journée ni connaissance gratuite.'
async function setup(t){
 const call=await engine(t,{dice:'19'}),state=await call('get_game_state'),cell=adjacent(state)[0]
 ok(await call('create_npc',{npcId:'actual-api-instructor',name:'Professeur présent',statBlock:'goblin',cell,disposition:'neutral',visible:true,description:'Un vrai professeur, qualifié et volontaire selon l’accord explicitement établi.'}))
 const fact=ok(await call('record_scene_fact',{description:'Ce professeur parle réellement le gobelin, sait l’enseigner et accepte effectivement de donner ces leçons pour un po par vrai jour enseigné.',cell})).worldFact
 const start={eventId:'actual-api-course-start',courseId:'actual-api-course',instructorId:'actual-api-instructor',kind:'language',subjectId:'goblin',teachingFactId:fact.id,actualQualifiedInstructorConfirmed:true,actualWillingInstructorConfirmed:true}
 return{call,start}
}
function work(courseId,eventId,seconds=14400,paid){return{eventId,courseId,seconds,...paid?{paid}:{},actualLessonConfirmed:true,restActivity:'light',activitySource}}
test('the API performs two actual lesson segments on the same course with one daily fee and no early knowledge or unrelated action',async t=>{
 const{call,start}=await setup(t)
 const{result,seen,selected,before}=await play(t,call,[{name:'start_training',input:start},{name:'work_training',input:work(start.courseId,'actual-api-first-half',14400,{gp:1})},{name:'inspect_training',input:{}},{name:'work_training',input:work(start.courseId,'actual-api-second-half')},{name:'roll_ability_check',input:{entityId:'player',ability:'wis',dc:10}},params=>{assert.equal(lastResult(params).code,'PRIMARY_ACTION_ALREADY_RESOLVED');return 'Une vraie journée d’apprentissage est comptée, sans maîtrise prématurée.'}],'Je suis les huit heures de cette leçon réelle, en payant le prix convenu du jour.')
 assert.deepEqual(seen,selected.slice(0,-1));const after=result.newGameState,course=after.dmTools.training.courses[start.courseId]
 assert.equal(after.worldTimeSeconds,before.worldTimeSeconds+28800);assert.equal(course.workedSeconds,28800);assert.equal(course.qualifiedDays.length,1);assert.equal(course.segments.length,2);assert.equal(Object.keys(course.payments).length,1)
 assert.equal(after.dmTools.wallet.gp,before.dmTools.wallet.gp-1);assert.equal(after.dmTools.training.instructorFees[start.instructorId].gp,1);assert.deepEqual(after.player.languages,before.player.languages);assert.deepEqual(after.player.inventory,before.player.inventory);assert.equal(course.status,'learning')
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
test('the API finishes only the actual250th qualified lesson day and retains its learned language in SQL and future dynamic context',async t=>{
 const{call,start}=await setup(t);ok(await call('start_training',start))
 for(let day=0;day<249;day++){
  const lesson=ok(await call('work_training',work(start.courseId,`actual-prior-day-${day}`,28800,{gp:1})));assert.equal(lesson.learned,false)
  ok(await call('advance_time',{seconds:(Math.floor(lesson.worldTimeSeconds/86400)+1)*86400-lesson.worldTimeSeconds}))
 }
 const state=await call('get_game_state');assert.equal(state.dmTools.training.courses[start.courseId].qualifiedDays.length,249);assert.equal(state.player.languages.includes('goblin'),false)
 const{result,seen,selected,before}=await play(t,call,[{name:'work_training',input:work(start.courseId,'actual-final-day-first-half',14400,{gp:1})},params=>{assert.equal(ok(lastResult(params)).learned,false);return{name:'work_training',input:work(start.courseId,'actual-final-day-last-half')}},params=>{assert.equal(ok(lastResult(params)).learned,true);return{name:'inspect_training',input:{}}},{name:'roll_ability_check',input:{entityId:'player',ability:'wis',dc:10}},params=>{assert.equal(lastResult(params).code,'PRIMARY_ACTION_ALREADY_RESOLVED');return 'La dernière journée réellement accomplie te donne la langue apprise.'}],'Je termine les huit heures de la dernière journée de ce cours déjà réellement suivi.')
 assert.deepEqual(seen,selected.slice(0,-1));const after=result.newGameState,course=after.dmTools.training.courses[start.courseId]
 assert.equal(course.qualifiedDays.length,250);assert.equal(course.workedSeconds,250*28800);assert.equal(course.status,'completed');assert.equal(after.player.languages.filter(language=>language==='goblin').length,1)
 assert.equal(after.worldTimeSeconds,before.worldTimeSeconds+28800);assert.equal(after.dmTools.wallet.gp,before.dmTools.wallet.gp-1);assert.equal(after.dmTools.training.instructorFees[start.instructorId].gp,250);assert.deepEqual(after.player.inventory,before.player.inventory)
 assert.deepEqual(JSON.parse(serializeGameState(after)).player.languages,after.player.languages,'future MJ context includes live learned knowledge, beyond the initial character sheet')
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
