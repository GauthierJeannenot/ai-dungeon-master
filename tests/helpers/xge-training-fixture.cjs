const assert=require('node:assert/strict')
const{engine,ok,adjacent}=require('./mcp-toolkit.cjs')
const zero={cp:0,sp:0,ep:0,gp:0,pp:0}

/** Public setup on an EXISTING call: no second engine, injected course, clock,
 * money, teacher qualification, inventory or learning result. */
async function prepareCourse(call,{kind='language',subjectId='goblin',instructorId='actual-xge-instructor',courseId='actual-xge-course',adopt=true,start=true}={}){
 const state=await call('get_game_state'),cell=adjacent(state).find(cell=>!Object.values(state.npcs??{}).some(n=>n.visible&&n.position.x===cell.x&&n.position.y===cell.y)&&!Object.values(state.monsters??{}).some(n=>n.hp.current>0&&n.position.x===cell.x&&n.position.y===cell.y))
 assert.ok(cell,'Real same-room adjacent instructor site required')
 ok(await call('create_npc',{npcId:instructorId,name:'Actual qualified temporary instructor',statBlock:'goblin',cell,disposition:'neutral',visible:true,description:'This actual existing person is explicitly willing and qualified for the selected source course. No qualification is inferred from species/name and no free kit or coin purse is supplied.'}))
 async function fact(description,at=cell){return ok(await call('record_scene_fact',{description,cell:at})).worldFact}
 const decision=await fact('The MJ explicitly adopts optional XGE Training and chooses initial real INT duration,25gp paid at first effort of each5qualified-day block without automatic prorata/refund, and refusal of nonpositive computed duration. These are explicit course conventions, not hidden printed RAW.'),teaching=await fact('This exact actual present instructor genuinely knows and willingly teaches the selected canonical subject, agrees to these explicitly adopted course conventions, and receives only the actual selected lesson fees. No prior work, qualification from a name or automatic knowledge is granted.')
 const adoption={eventId:courseId+'-adoption',decisionFactId:decision.id,explicitlyAdopted:true,initialIntelligenceConventionConfirmed:true,prepaidBlockWithoutAutomaticProrataOrRefundConfirmed:true,refuseNonpositiveDurationConventionConfirmed:true}
 const input={eventId:courseId+'-start',courseId,kind,subjectId,instructorId,teachingFactId:teaching.id,actualQualifiedInstructorConfirmed:true,actualWillingInstructorConfirmed:true,actualCourseConventionsConfirmed:true}
 if(kind==='tool'){
  const held=state.dmTools?.loadout?.mainHandId??state.player.inventory.find(i=>i.type==='weapon')?.id
  if(held)ok(await call('equip_item',{itemId:held,operation:'unequip',slot:'main_hand'}))
  const current=await call('get_game_state');ok(await call('create_scene_object',{objectId:courseId+'-actual-kit-chest',name:'Actual practice equipment chest',description:'One real physical matching practice kit already exists in this chest; opening and pickup do not grant its proficiency.',cell:current.player.position,kind:'container',material:'wood',size:'small',resilience:'resilient',contents:[subjectId]}))
  const item=ok(await call('interact_object',{objectId:courseId+'-actual-kit-chest',action:'open'})).releasedItems[0];ok(await call('pick_up_item',{itemId:item.id}));input.practiceToolItemId=item.id;input.actualPracticeToolAvailableConfirmed=true
 }
 if(adopt&&!state.dmTools?.xgeTraining)ok(await call('adopt_xge_training',adoption))
 if(start)ok(await call('start_xge_training',input))
 async function lesson(eventId,seconds=28800,extra={}){const v=ok(await call('inspect_xge_training')).courses.find(c=>c.courseId===courseId);assert.ok(v);const week=Math.floor(v.actualInstructionDays.length/5),paid=v.paidBlocks.some(p=>p.weekIndex===week);return{eventId,courseId,activity:'instruction',seconds,actualLessonConfirmed:true,restActivity:'light',activitySource:'Actual explicitly taught instruction at the real supported venue with the retained qualified willing teacher and actual practice set, not waiting or sleep.',...paid?{}:{paid:{gp:25}},...extra}}
 async function nextDay(){const s=await call('get_game_state'),remaining=86400-(s.worldTimeSeconds??0)%86400;if(remaining<86400)ok(await call('advance_time',{seconds:remaining}))}
 async function day(index,{advance=index>0,...extra}={}){if(advance)await nextDay();return ok(await call('work_xge_training',await lesson(courseId+'-actual-day-'+index,28800,extra)))}
 async function completeInstruction(){const v=ok(await call('inspect_xge_training')).courses.find(c=>c.courseId===courseId);for(let i=0;i<v.requiredInstructionDays;i++)await day(i)}
 return{call,initial:state,cell,fact,adoption,input,lesson,nextDay,day,completeInstruction,completion:{eventId:courseId+'-completion',courseId}}
}
async function setupXgeTraining(t,{characterId='fighter',dice='99,19',...options}={}){return prepareCourse(await engine(t,{characterId,dice}),options)}
async function prepareInstructor(call,{instructorId='actual-replacement-instructor',practiceToolItemId}={}){
 const state=await call('get_game_state'),cell=adjacent(state).find(cell=>!Object.values(state.npcs??{}).some(n=>n.visible&&n.position.x===cell.x&&n.position.y===cell.y));assert.ok(cell)
 ok(await call('create_npc',{npcId:instructorId,name:'Actual different qualified instructor',statBlock:'goblin',cell,disposition:'neutral',visible:true,description:'This actual different person is already genuinely qualified and willing; no search tool generates this person or its stock.'}))
 const f=ok(await call('record_scene_fact',{description:'This exact actual different teacher is qualified and willing for the same course subject and initial conventions, explicitly honors any already-paid remaining block when confirmed, and is the actual recipient of FUTURE teaching fees. No old money is transferred.',cell})).worldFact
 return{instructorId,teachingFactId:f.id,actualQualifiedInstructorConfirmed:true,actualWillingInstructorConfirmed:true,actualNextFeesRecipientConfirmed:true,...practiceToolItemId?{practiceToolItemId,actualPracticeToolAvailableConfirmed:true}:{}}
}
async function refused(call,name,input,code){const before=await call('get_game_state'),answer=await call(name,input);assert.ok(answer.error,JSON.stringify(answer));if(code)assert.equal(answer.code,code,JSON.stringify(answer));assert.deepEqual(await call('get_game_state'),before);return answer}
module.exports={prepareCourse,prepareInstructor,setupXgeTraining,refused,zero}
