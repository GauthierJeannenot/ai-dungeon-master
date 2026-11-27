const test=require('node:test'),assert=require('node:assert/strict')
process.env.MONETIZATION_ENABLED='false'
const {installPgMem}=require('./helpers/pg-mem.cjs'),pg=installPgMem()
const {saveSession,loadSession,deleteSession}=require('../lib/session-store.ts')
const {engine,ok,replace,adjacent}=require('./helpers/mcp-toolkit.cjs')
test.after(()=>pg.restore())
const source='Cours réellement enseigné par le professeur présent et volontaire ; activité réellement accomplie, aucun jour ni savoir gratuit.'
async function setup(t,{tool=false}={}){
 const call=await engine(t,{dice:'19'}),state=await call('get_game_state'),cell=adjacent(state)[0]
 ok(await call('create_npc',{npcId:'actual-instructor',name:'Professeur présent',statBlock:'goblin',cell,disposition:'neutral',visible:true,description:'Un vrai professeur qualifié, connu et volontaire pour le sujet explicitement établi ; aucun savoir déduit de sa race.'}))
 const fact=ok(await call('record_scene_fact',{description:tool?'Ce professeur réel maîtrise le matériel d’empoisonneur, sait effectivement l’enseigner et accepte réellement les leçons standard1po par jour.':'Ce professeur réel parle le gobelin, sait effectivement l’enseigner et accepte réellement les leçons standard1po par jour.',cell})).worldFact
 const start={eventId:'actual-training-start',courseId:'actual-course',instructorId:'actual-instructor',kind:tool?'tool':'language',subjectId:tool?'poisoners_kit':'goblin',teachingFactId:fact.id,actualQualifiedInstructorConfirmed:true,actualWillingInstructorConfirmed:true}
 return{call,start,cell,fact}
}
function lesson(call,eventId,seconds=28800,paid={gp:1}){return call('work_training',{eventId,courseId:'actual-course',seconds,...paid===null?{}:{paid},actualLessonConfirmed:true,restActivity:'light',activitySource:source})}
async function waitNextDay(call,at){const state=at===undefined?await call('get_game_state'):undefined,now=at??state.worldTimeSeconds;return ok(await call('advance_time',{seconds:(Math.floor(now/86400)+1)*86400-now}))}
async function refuse(call,name,input,code){const before=await call('get_game_state'),answer=await call(name,input);assert.equal(answer.code,code,JSON.stringify(answer));assert.deepEqual(await call('get_game_state'),before)}
async function hands(call){let s=await call('get_game_state');if(!s.dmTools?.loadout){const held=s.player.inventory.find(i=>i.type==='weapon');if(held)ok(await call('equip_item',{itemId:held.id,operation:'unequip',slot:'main_hand'}));s=await call('get_game_state')}for(const[key,slot]of [['mainHandId','main_hand'],['offHandId','off_hand'],['shieldId','shield']])if(s.dmTools?.loadout?.[key]){ok(await call('equip_item',{itemId:s.dmTools.loadout[key],operation:'unequip',slot}));s=await call('get_game_state')}}

test('250distinct actually taught8hour paid days learn one real language, persist through SQL, and never reroll/pay twice',async t=>{
 const{call,start}=await setup(t);ok(await call('start_training',start));let final
 for(let day=0;day<250;day++){
  final=ok(await lesson(call,`actual-language-day-${day}`));assert.equal(final.qualifiedDays,day+1);assert.equal(final.learned,day===249)
  if(day===248)assert.equal((await call('get_game_state')).player.languages.includes('goblin'),false)
  if(day<249)await waitNextDay(call,final.worldTimeSeconds)
 }
 let state=await call('get_game_state');assert.equal(state.player.languages.filter(l=>l==='goblin').length,1);assert.equal(state.dmTools.wallet.gp,0);assert.equal(state.dmTools.training.instructorFees['actual-instructor'].gp,250);assert.equal(state.dmTools.training.courses[start.courseId].workedSeconds,250*28800)
 const id=`training-language-${process.pid}`;t.after(()=>deleteSession(id));await saveSession(id,{gameState:state,history:[],adventureId:state.adventureId,characterId:state.characterId});ok(await call('replace_game_state',{gameState:(await loadSession(id)).gameState}));state=await call('get_game_state')
 assert.equal(ok(await lesson(call,'actual-language-day-249')).replayed,true);assert.deepEqual(await call('get_game_state'),state)
 await refuse(call,'work_training',{eventId:'false-251st-day',courseId:start.courseId,seconds:28800,paid:{gp:1},actualLessonConfirmed:true,restActivity:'light',activitySource:source},'TRAINING_COURSE_CLOSED');assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
test('partial days cost their actual teaching fees but never combine; SQL and explicit pause/resume preserve work and the same-day fee',async t=>{
 const{call,start}=await setup(t);await replace(call,s=>s.worldTimeSeconds=20*3600);ok(await call('start_training',start))
 const first=ok(await lesson(call,'actual-four-hours-day-A',14400));assert.equal(first.lessonCalendarDay,0);assert.equal(first.qualifiedDays,0)
 ok(await lesson(call,'actual-four-hours-day-B',14400));let state=await call('get_game_state');assert.equal(state.dmTools.training.courses[start.courseId].qualifiedDays.length,0);assert.equal(state.dmTools.training.courses[start.courseId].workedSeconds,28800);assert.equal(state.dmTools.wallet.gp,248)
 const id=`training-partial-${process.pid}`;t.after(()=>deleteSession(id));await saveSession(id,{gameState:state,history:[],adventureId:state.adventureId,characterId:state.characterId});ok(await call('replace_game_state',{gameState:(await loadSession(id)).gameState}))
 await replace(call,s=>s.player.conditions.push('incapacitated'));const beforePause=await call('get_game_state');ok(await call('cancel_training',{eventId:'actual-training-pause',courseId:start.courseId,reason:'Pause comptable explicite pendant incapacité, sans remboursement ni perte des cours.'}));assert.equal((await call('get_game_state')).worldTimeSeconds,beforePause.worldTimeSeconds)
 await replace(call,s=>s.player.conditions=s.player.conditions.filter(c=>c!=='incapacitated'));ok(await call('start_training',{...start,eventId:'actual-training-resume'}))
 await refuse(call,'work_training',{eventId:'false-second-fee',courseId:start.courseId,seconds:14400,paid:{gp:1},actualLessonConfirmed:true,restActivity:'light',activitySource:source},'TRAINING_DAY_ALREADY_PAID')
 const taught=ok(await lesson(call,'actual-remaining-hours-day-B',14400,null));assert.equal(taught.qualifiedDays,1);assert.equal(taught.paidToday,false);assert.equal(taught.qualifiedCalendarDay,1)
 state=await call('get_game_state');assert.equal(state.dmTools.wallet.gp,248);assert.deepEqual(state.dmTools.training.courses[start.courseId].qualifiedDays,[1]);assert.equal(state.dmTools.training.courses[start.courseId].workedSeconds,43200);assert.deepEqual(state.dmTools.training.courses[start.courseId].lifecycle.map(e=>e.kind),['cancel','resume']);ok(await call('replace_game_state',{gameState:state}));assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
test('an absent/incapable teacher, missing payment or known subject cannot grant work, knowledge, money changes or dice',async t=>{
 const{call,start}=await setup(t)
 await refuse(call,'start_training',{...start,instructorId:'invented-instructor'},'TRAINING_ACTUAL_INSTRUCTOR_REQUIRED')
 await refuse(call,'start_training',{...start,subjectId:'common'},'TRAINING_SUBJECT_ALREADY_KNOWN')
 await refuse(call,'start_training',{...start,subjectId:'draconic'},'TRAINING_LANGUAGE_PERMISSION_REQUIRED')
 ok(await call('start_training',start));await refuse(call,'work_training',{eventId:'unpaid-day',courseId:start.courseId,seconds:28800,actualLessonConfirmed:true,restActivity:'light',activitySource:source},'TRAINING_DAY_PAYMENT_REQUIRED')
 await replace(call,s=>s.npcs['actual-instructor'].conditions=['incapacitated']);await refuse(call,'work_training',{eventId:'incapable-teacher-day',courseId:start.courseId,seconds:28800,paid:{gp:1},actualLessonConfirmed:true,restActivity:'light',activitySource:source},'TRAINING_ACTUAL_INSTRUCTOR_REQUIRED')
 await replace(call,s=>{s.npcs['actual-instructor'].conditions=[];s.dmTools.wallet.gp=0});await refuse(call,'work_training',{eventId:'unaffordable-day',courseId:start.courseId,seconds:28800,paid:{gp:1},actualLessonConfirmed:true,restActivity:'light',activitySource:source},'INSUFFICIENT_COINS');assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
test('a real suffocation boundary refuses a continuous lesson before its fee or clock is spent',async t=>{
 const{call,start}=await setup(t);ok(await call('start_training',start));ok(await call('set_breathing_context',{entityId:'player',eventId:'actual-held-breath-before-class',mode:'hold_breath',reason:'L’absence réelle d’air actuelle est explicitement établie.'}))
 await refuse(call,'work_training',{eventId:'impossible-continuous-class',courseId:start.courseId,seconds:28800,paid:{gp:1},actualLessonConfirmed:true,restActivity:'light',activitySource:source},'ACTIVITY_BREATHING_BOUNDARY');assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
test('250actual tool-training days confer usable proficiency but never grant the teacher’s real practice kit or buy it for free',async t=>{
 const{call,start,cell}=await setup(t,{tool:true});await hands(call);await replace(call,s=>s.dmTools.wallet.gp=300)
 await refuse(call,'start_training',start,'TRAINING_PRACTICE_TOOL_REQUIRED')
 ok(await call('create_scene_object',{objectId:'real-teacher-equipment',name:'Matériel existant du cours',description:'Un vrai kit appartenant au professeur et un lot de matières déjà physiquement présent.',cell,kind:'container',material:'wood',size:'small',resilience:'resilient',contents:['poisoners_kit','raw_crafting_materials']}))
 const items=ok(await call('interact_object',{objectId:'real-teacher-equipment',action:'open'})).releasedItems,tool=items.find(i=>i.equipmentId==='poisoners_kit'),raw=items.find(i=>i.equipmentId==='raw_crafting_materials'),fact=ok(await call('record_scene_fact',{description:'Ce vrai kit appartient au professeur qui le fournit effectivement pour la pratique sans transfert de propriété ; il accepte réellement sa vente séparée50po après le cours.',cell})).worldFact
 ok(await call('record_merchant_stock',{eventId:'teacher-real-kit-custody',merchantId:start.instructorId,itemIds:[tool.id],physicalFactId:fact.id,actualStockConfirmed:true}));ok(await call('pick_up_item',{itemId:raw.id}))
 const course={...start,practiceToolItemId:tool.id,actualPracticeToolAvailableConfirmed:true};ok(await call('start_training',course));let final
 for(let day=0;day<250;day++){final=ok(await lesson(call,`actual-tool-day-${day}`));if(day===248)assert.equal((await call('get_game_state')).player.toolProficiencies?.includes('poisoners_kit')??false,false);if(day<249)await waitNextDay(call,final.worldTimeSeconds)}
 let state=await call('get_game_state');assert.equal(state.player.toolProficiencies.filter(id=>id==='poisoners_kit').length,1);assert.equal(state.player.inventory.some(i=>i.id===tool.id),false);assert.equal(state.dmTools.wallet.gp,50);assert.equal(state.dmTools.training.instructorFees[start.instructorId].gp,250)
 const observed=ok(await call('record_scene_fact',{description:'Les matières réellement possédées conviennent au poison courant, récipient compris, et valent effectivement50po. Le vrai kit est adapté.',cell:state.player.position})).worldFact
 const crafting={eventId:'trained-real-craft-start',projectId:'trained-real-craft',equipmentId:'basic_poison_vial',outputItemIds:['actual-trained-future-dose'],toolItemId:tool.id,toolRelationFactId:observed.id,actualRelatedToolConfirmed:true,materials:[{itemId:raw.id,valueCp:5000,physicalFactId:observed.id}],actualIngredientsConfirmed:true}
 await refuse(call,'start_ordinary_crafting',crafting,'CRAFT_TOOL_PROFICIENCY_REQUIRED')
 ok(await call('create_trade_offer',{offerId:'real-practice-kit-sale',merchantId:start.instructorId,itemIds:[tool.id],priceCp:5000,agreementFactId:fact.id,actualAgreementConfirmed:true}));ok(await call('purchase_trade_offer',{eventId:'actual-practice-kit-purchase',offerId:'real-practice-kit-sale',paid:{gp:50},workSeconds:6,activitySource:'Vrai achat séparé du kit existant, aucun objet fourni par la maîtrise.'}))
 ok(await call('start_ordinary_crafting',crafting));state=await call('get_game_state');assert.equal(state.dmTools.ordinaryCrafting.projects[crafting.projectId].progressCp,0);assert.equal(state.player.inventory.filter(i=>i.id===tool.id).length,1);assert.equal(state.dmTools.wallet.gp,0);assert.equal(state.droppedItems['actual-trained-future-dose'],undefined)
 const id=`training-tool-${process.pid}`;t.after(()=>deleteSession(id));await saveSession(id,{gameState:state,history:[],adventureId:state.adventureId,characterId:state.characterId});ok(await call('replace_game_state',{gameState:(await loadSession(id)).gameState}));assert.equal((await call('get_game_state')).player.toolProficiencies.filter(id=>id==='poisoners_kit').length,1);assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
test('a new event on the same actual day and forged250day hydration cannot turn one paid day into learned knowledge',async t=>{
 const{call,start}=await setup(t);ok(await call('start_training',start));ok(await lesson(call,'actual-only-day'))
 await refuse(call,'work_training',{eventId:'false-new-day-nonce',courseId:start.courseId,seconds:28800,paid:{gp:1},actualLessonConfirmed:true,restActivity:'light',activitySource:source},'TRAINING_DAY_LIMIT')
 const before=await call('get_game_state'),forged=structuredClone(before),c=forged.dmTools.training.courses[start.courseId];c.qualifiedDays=Array.from({length:250},(_,i)=>i);c.status='completed';c.completedAt=forged.worldTimeSeconds;c.completionEventId='actual-only-day';c.result=forged.dmTools.training.receipts['actual-only-day'].result;forged.player.languages.push('goblin')
 await refuse(call,'replace_game_state',{gameState:forged},'TRAINING_STATE_MISMATCH');assert.equal((await call('get_game_state')).player.languages.includes('goblin'),false);assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
