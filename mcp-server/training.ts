import { StartTrainingSchema,WorkTrainingSchema,CancelTrainingSchema,trainingSubjectSupported,trainingKnowledgePresent,trainingDay,trainingWorkInDay,PERMISSION_TRAINING_LANGUAGES,type TrainingCourse } from '../lib/training-state'
import { CoinsSchema,copperValue,emptyCoins } from '../lib/srd/currency'
import { groundGearPhysicalWitness } from '../lib/ground-gear-recovery-state'
import { inferRoomIdOnMap } from '../lib/adventure-map'
import { breathingActivityIssue } from '../lib/activity-preflight'
import { entityVerticalContext } from '../lib/jumping-state'
import { AFFLICTIONS } from '../lib/srd/afflictions'
import { available,advanceHeroTime,now } from './hero-rules'
import { toolkitState,toolkitError,assertToolkitReach } from './toolkit'
import { freeHands,equipmentId } from './equipment'
import { balance,addCoins } from './currency'
import { assertGameTimeAdvance } from './time-preflight'
import { preflightRestStrenuousInterval,recordRestMeasuredActivityInterval } from './resting'
import { assertDowntimeInterval } from './downtime'
import { xgeTrainingCourses } from '../lib/xge-training-state'
import * as gs from './game-state'
import * as rules from './rules'
const training=()=>toolkitState().training??={version:1 as const,courses:{},instructorFees:{},receipts:{}}
function history(){if(Object.keys(training().receipts).length>=8192)toolkitError('TRAINING_HISTORY_LIMIT','Actual paid lessons are full before money, work or knowledge changes.')}
function receipt(id:string,command:string){const old=gs.getState().dmTools?.training?.receipts[id];if(old&&old.command!==command)toolkitError('TRAINING_EVENT_CONFLICT','Retain the exact actual teacher, subject, lesson interval and payment.');return old?{...structuredClone(old.result),replayed:true}:undefined}
function remember(id:string,command:string,result:Record<string,unknown>){training().receipts[id]={command,at:now(),result:structuredClone(result)};return result}
function capable(){available();rules.validateActionUse('player');if(gs.getState().phase==='combat')toolkitError('TRAINING_DOWNTIME_REQUIRED','Training is actual downtime outside combat; no initiative, extra action or training tick is fabricated.')}
function instructor(id:string){
 const state=gs.getState(),npc=gs.getNpc(id)
 if(!npc||!gs.npcOnCurrentMap(npc)||!npc.visible||npc.isAlive===false||npc.hp&&npc.hp.current<=0||npc.conditions?.some(c=>['incapacitated','unconscious','petrified','paralyzed','stunned'].includes(c)))toolkitError('TRAINING_ACTUAL_INSTRUCTOR_REQUIRED','Use the same actual known capable NPC, present on this map. No teacher, return to life or visibility is granted by payment.')
 const roomId=inferRoomIdOnMap(npc!.position,state.currentMapId,state),learnerRoom=inferRoomIdOnMap(state.player.position,state.currentMapId,state)
 if(!roomId||roomId!==learnerRoom||roomId!==state.currentRoomId)toolkitError('TRAINING_INSTRUCTOR_ABSENT','Attend the actual instructor in the same real room. No movement, teleport, remote class or substitute teacher is selected.')
 return{...npc!,roomId}
}
const identity=(id:string)=>{const npc=instructor(id);return groundGearPhysicalWitness({id:npc.id,kind:npc.kind,creation:gs.getState().dmTools?.npcs[id]?.creation??null})}
function teachingFact(id:string,instructorId:string){const npc=instructor(instructorId),state=gs.getState(),fact=state.worldFacts?.find(f=>f.id===id);if(!fact||fact.mapId!==state.currentMapId||fact.roomId!==npc.roomId||fact.narrativeEffect?.cell.x!==npc.position.x||fact.narrativeEffect.cell.y!==npc.position.y)toolkitError('TRAINING_TEACHING_FACT_REQUIRED','Establish the actual instructor knowledge, willingness and any exceptional language permission at that real NPC. No name, race, price or social roll invents instruction.');return structuredClone(fact!) as unknown as Record<string,unknown>}
function currentFact(snapshot:Record<string,unknown>){const current=gs.getState().worldFacts?.find(f=>f.id===snapshot.id);if(!current||groundGearPhysicalWitness(current)!==groundGearPhysicalWitness(snapshot))toolkitError('TRAINING_TEACHING_FACT_CHANGED','The actual teaching agreement/qualification changed. Preserve previous work and fees; no new agreement or teacher is inferred.')}
function practiceTool(course:Pick<TrainingCourse,'input'>,selectedId?:string){
 const state=gs.getState(),input=course.input,id=selectedId??input.practiceToolItemId
 if(input.kind==='language'){if(id!==undefined)toolkitError('TRAINING_PRACTICE_TOOL_NOT_APPLICABLE','This language course does not select a physical tool or grant one.');return undefined}
 if(!id)toolkitError('TRAINING_PRACTICE_TOOL_REQUIRED','Choose the actual set of the new tool being practiced; a future proficiency does not create a kit.')
 const owned=state.player.inventory.find(i=>i.id===id),dropped=state.droppedItems?.[id],stock=state.dmTools?.merchants?.stocks[id!],item=owned??dropped?.item??(stock?.status==='available'&&stock.merchantId===input.instructorId?stock.item:undefined)
 if(!item||equipmentId(item)!==input.subjectId||item.quantity!==undefined&&item.quantity!==1)toolkitError('TRAINING_PRACTICE_TOOL_REQUIRED','Use one exact existing matching tool instance, owned, reachable on the ground or actually provided from THIS instructor’s registered stock. Nothing is acquired automatically.')
 if(freeHands()<1)toolkitError('TRAINING_FREE_HAND_REQUIRED','Free an actual hand for the real manual tool practice.')
 if(dropped)assertToolkitReach({mapId:dropped.mapId,roomId:dropped.roomId!,cell:dropped.position})
 if(!owned&&!dropped){const teacher=instructor(input.instructorId),vertical=entityVerticalContext(state,teacher.id);assertToolkitReach({mapId:state.currentMapId!,roomId:teacher.roomId,cell:teacher.position,...vertical.known?{surfaceZFeet:vertical.zFeet!}:{}})}
 return id
}
function validate(c:TrainingCourse,practiceId?:string){
 const teacher=instructor(c.input.instructorId)
 if(identity(teacher.id)!==c.instructorWitness)toolkitError('TRAINING_INSTRUCTOR_CHANGED','Retain the actual original instructor identity. A new NPC cannot inherit another teacher’s paid course.')
 currentFact(c.teachingFact);if(c.permissionFact)currentFact(c.permissionFact)
 if(trainingKnowledgePresent(gs.getState(),c.input.kind,c.input.subjectId))toolkitError('TRAINING_SUBJECT_ALREADY_KNOWN','This subject is already actually known. No duplicate proficiency, expertise, level or refund is granted; previous instruction remains recorded.')
 return{teacher,practiceToolItemId:practiceTool(c,practiceId??c.currentPracticeToolItemId)}
}
function continuousLesson(seconds:number,instructorId:string){
 const state=gs.getState(),end=now()+seconds
 for(const id of ['player',instructorId]){const breath=breathingActivityIssue(state,id,seconds);if(breath)toolkitError(breath.code,breath.message)
  for(const record of Object.values(state.dmTools?.afflictions?.records??{})){const spec=AFFLICTIONS[record.templateId];if(record.targetId!==id||!['active','pending'].includes(record.status)||record.petrificationPause||record.nextAt===undefined||record.nextAt>end)continue;if(record.templateId==='midnight_tears'||spec.repeat==='daily'||spec.repeat==='start'||spec.repeat==='end')toolkitError('TRAINING_ACTUAL_EVENT_BOUNDARY','Stop before the actual student/instructor affliction event and resolve its real outcome. No future capability, save, lesson or poison result is invented.')}
 }
}
function snapshot(c:TrainingCourse){const day=trainingDay(now());return{success:true,courseId:c.id,instructorId:c.input.instructorId,kind:c.input.kind,subjectId:c.input.subjectId,status:c.status,qualifiedDays:c.qualifiedDays.length,requiredDays:250,workedSeconds:c.workedSeconds,calendarDay:day,todayWorkedSeconds:trainingWorkInDay(c,day),todayPaid:Boolean(c.payments[String(day)]),paidTeachingDays:Object.keys(c.payments).length,learned:c.status==='completed',rule:'PHB2014 Training:250distinct actual days each with at least8hours,1gp per actual taught day. Partial-day history persists without becoming a day. No INT reduction, XGE, class/weapon/armor training or free practice kit.'}}
export function startTraining(raw:unknown){
 const input=StartTrainingSchema.parse(raw),command=JSON.stringify({operation:'training-start',input}),old=receipt(input.eventId,command);if(old)return old
 capable();history();const state=gs.getState();if(Object.values(xgeTrainingCourses(state.dmTools?.xgeTraining)).some(c=>c.start.input.kind===input.kind&&c.start.input.subjectId===input.subjectId&&['active','paused'].includes(c.status)))toolkitError('TRAINING_XGE_COURSE_OPEN','Explicitly pause/abandon the active XGE alternative before resuming the same subject PHB course; no days or fees transfer between policies.');const data=training(),teacher=instructor(input.instructorId)
 if(!trainingSubjectSupported(input.kind,input.subjectId))toolkitError('TRAINING_SUBJECT_UNSUPPORTED','Choose a sourced canonical language or exact PHB tool. Extra training options are not silently activated.')
 if(input.kind==='language'&&!state.player.languages)toolkitError('TRAINING_LANGUAGE_HISTORY_REQUIRED','The actual existing language list is unknown in this legacy state. Establish its real current knowledge first; no empty history is invented.')
 if(trainingKnowledgePresent(state,input.kind,input.subjectId))toolkitError('TRAINING_SUBJECT_ALREADY_KNOWN','Already-known subjects cannot become expertise, a second proficiency, a level or a free item.')
 const existing=data.courses[input.courseId]
 if(existing){
  if(existing.status!=='cancelled'||existing.input.kind!==input.kind||existing.input.subjectId!==input.subjectId||existing.input.instructorId!==input.instructorId||existing.input.teachingFactId!==input.teachingFactId||existing.input.languagePermissionFactId!==input.languagePermissionFactId)toolkitError('TRAINING_COURSE_DEFINITION_CONFLICT','Resume only the exact paused original course/teacher/subject and qualification agreement. No new course or instructor discards actual days or fees.')
  if(existing.lifecycle.length>=128)toolkitError('TRAINING_LIFECYCLE_LIMIT','The actual pause/resume history is full.')
  validate(existing,input.practiceToolItemId);existing.currentPracticeToolItemId=input.practiceToolItemId??existing.currentPracticeToolItemId;existing.status='learning';existing.lifecycle.push({eventId:input.eventId,kind:'resume'})
  return remember(input.eventId,command,{...snapshot(existing),resumed:true,daysReset:0,feesRefunded:0,timeSpent:0,coinsSpent:0,itemsGranted:0})
 }
 if(Object.keys(data.courses).length>=64)toolkitError('TRAINING_COURSE_LIMIT','Use a new exact course identity within retained real history.')
 if(Object.values(data.courses).some(c=>c.input.kind===input.kind&&c.input.subjectId===input.subjectId))toolkitError('TRAINING_SUBJECT_COURSE_EXISTS','Continue or explicitly resume the original courseId for this subject. A new ID/teacher never discards or duplicates actual days or fees.')
 const exceptional=input.kind==='language'&&(PERMISSION_TRAINING_LANGUAGES as readonly string[]).includes(input.subjectId)
 if(exceptional&&(!input.actualLanguagePermissionConfirmed||!input.languagePermissionFactId))toolkitError('TRAINING_LANGUAGE_PERMISSION_REQUIRED','An exotic/secret language needs actual explicit MJ permission as well as the real willing qualified teacher.')
 if(!exceptional&&(input.actualLanguagePermissionConfirmed||input.languagePermissionFactId))toolkitError('TRAINING_LANGUAGE_PERMISSION_NOT_APPLICABLE','This course does not use exceptional-language permission to grant other training options.')
 if(input.kind==='tool'&&(!input.practiceToolItemId||!input.actualPracticeToolAvailableConfirmed))toolkitError('TRAINING_PRACTICE_TOOL_REQUIRED','Establish the actual existing practice set; paying a teacher does not create one.')
 if(input.kind==='language'&&(input.practiceToolItemId||input.actualPracticeToolAvailableConfirmed))toolkitError('TRAINING_PRACTICE_TOOL_NOT_APPLICABLE','A language course does not grant or select a tool kit.')
 const c:TrainingCourse={id:input.courseId,input,startedAt:now(),requiredDays:250,secondsPerDay:28800,feePerDayCp:100,status:'learning',instructorWitness:identity(teacher.id),teachingFact:teachingFact(input.teachingFactId,teacher.id),...(input.languagePermissionFactId?{permissionFact:teachingFact(input.languagePermissionFactId,teacher.id)}:{}),workedSeconds:0,qualifiedDays:[],segments:[],payments:{},lifecycle:[],...input.practiceToolItemId?{currentPracticeToolItemId:input.practiceToolItemId}:{}}
 practiceTool(c);data.courses[c.id]=c;return remember(input.eventId,command,{...snapshot(c),timeSpent:0,coinsSpent:0,itemsGranted:0})
}
export function workTraining(raw:unknown){
 const input=WorkTrainingSchema.parse(raw),command=JSON.stringify({operation:'training-work',input}),old=receipt(input.eventId,command);if(old)return old
 capable();history();const state=gs.getState(),data=training(),c=data.courses[input.courseId]??toolkitError('TRAINING_COURSE_REQUIRED','Choose the actual retained course.')
 if(c.status!=='learning')toolkitError('TRAINING_COURSE_CLOSED','This actual course is completed or explicitly cancelled; no new lesson or payment is made.')
 const context=validate(c,input.practiceToolItemId),from=now(),day=trainingDay(from),worked=trainingWorkInDay(c,day),payment=c.payments[String(day)]
 if(c.segments.length>=4096)toolkitError('TRAINING_SEGMENT_LIMIT','Actual lesson history is full before money or time.')
 if(input.seconds>28800-worked||c.qualifiedDays.includes(day))toolkitError('TRAINING_DAY_LIMIT','This same course can count only one actual8hour training day on this date. No new nonce supplies another day.')
 if(from+input.seconds>(day+1)*86400)toolkitError('TRAINING_CALENDAR_BOUNDARY','Stop at the actual day boundary and explicitly continue. Hours remain recorded, but partial days never combine into a qualified day.')
 let wallet=balance(),earned=data.instructorFees[c.input.instructorId]
 if(!payment){if(!input.paid)toolkitError('TRAINING_DAY_PAYMENT_REQUIRED','Explicitly pay the actual1gp teaching fee in chosen existing denominations before this real day’s first segment, including an eventual partial day.');if(copperValue(input.paid!)!==100)toolkitError('TRAINING_EXACT_DAY_FEE','The standard2014 teaching fee is exactly1gp per actual taught day; no implicit change, exchange, scholarship or INT discount is invented.');wallet=addCoins(wallet,emptyCoins(),input.paid!);earned=addCoins(earned??emptyCoins(),input.paid!)}
 else if(input.paid&&copperValue(input.paid)>0)toolkitError('TRAINING_DAY_ALREADY_PAID','This actual course/date has already been paid. Continue its real lesson without a second payment.')
 assertDowntimeInterval(from,input.seconds);continuousLesson(input.seconds,c.input.instructorId);preflightRestStrenuousInterval();assertGameTimeAdvance(input.seconds)
 advanceHeroTime(input.seconds);recordRestMeasuredActivityInterval({eventId:`training:${input.eventId}`,from,to:now(),activity:input.restActivity,reason:input.activitySource.slice(0,600)})
 if(!payment){state.dmTools!.wallet=wallet;data.instructorFees[c.input.instructorId]=CoinsSchema.parse(earned);c.payments[String(day)]={eventId:input.eventId,at:from,paid:input.paid!}}
 c.workedSeconds+=input.seconds;c.segments.push({eventId:input.eventId,from,to:now(),seconds:input.seconds,calendarDay:day,instructorId:c.input.instructorId,mapId:state.currentMapId!,roomId:state.currentRoomId!,learnerCell:{...state.player.position},instructorCell:{...context.teacher.position},...context.practiceToolItemId?{practiceToolItemId:context.practiceToolItemId}:{},restActivity:input.restActivity,source:input.activitySource})
 if(worked+input.seconds===28800)c.qualifiedDays.push(day)
 const learned=c.qualifiedDays.length===250
 if(learned){if(c.input.kind==='tool'){state.player.toolProficiencies??=[];state.player.toolProficiencies.push(c.input.subjectId)}else{state.player.languages??=[];state.player.languages.push(c.input.subjectId)}c.status='completed';c.completedAt=now();c.completionEventId=input.eventId}
 const result={...snapshot(c),lessonCalendarDay:day,secondsSpent:input.seconds,paidToday:!payment,coinsSpent:!payment?input.paid:emptyCoins(),qualifiedDayAdded:worked+input.seconds===28800,...worked+input.seconds===28800?{qualifiedCalendarDay:day}:{},learned,worldTimeSeconds:now(),itemsGranted:0,knowledge:learned?{kind:c.input.kind,subjectId:c.input.subjectId}:undefined,actionSpent:false}
 if(learned)c.result=result;return remember(input.eventId,command,result)
}
export function cancelTraining(raw:unknown){const input=CancelTrainingSchema.parse(raw),command=JSON.stringify({operation:'training-cancel',input}),old=receipt(input.eventId,command);if(old)return old;history();const c=training().courses[input.courseId]??toolkitError('TRAINING_COURSE_REQUIRED','Choose the actual retained course.');if(c.status==='completed')toolkitError('TRAINING_ALREADY_LEARNED','Actually learned knowledge is not cancelled or refunded.');if(c.status==='cancelled')return{...snapshot(c),alreadyCancelled:true};if(c.lifecycle.length>=128)toolkitError('TRAINING_LIFECYCLE_LIMIT','The actual pause/resume history is full.');c.status='cancelled';c.cancellationEventId=input.eventId;c.cancellationReason=input.reason;c.lifecycle.push({eventId:input.eventId,kind:'cancel'});return remember(input.eventId,command,{...snapshot(c),timeRefunded:0,coinsRefunded:0,knowledgeGranted:false,itemsGranted:0,actionSpent:false})}
export function inspectTraining(){return{courses:Object.values(gs.getState().dmTools?.training?.courses??{}).map(snapshot),readOnly:true,source:'PHB2014 Training5564–5570 and Downtime Activities5525. Actual teachers,250qualified days and real1gp/day payments. Instructor changes, campaign-specific training and XGE variants remain separate.'}}
