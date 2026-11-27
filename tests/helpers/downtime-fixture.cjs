const assert=require('node:assert/strict')
const{engine,ok,adjacent}=require('./mcp-toolkit.cjs')
const zero={cp:0,sp:0,ep:0,gp:0,pp:0}
async function setupWork(t,{dice='20,99,19',adopt=true,start=true,check={kind:'athletics'}}={}){
 const call=await engine(t,{dice}),initial=await call('get_game_state'),cell=adjacent(initial)[0]
 ok(await call('create_npc',{npcId:'actual-work-employer',name:'Actual temporary-job employer',statBlock:'goblin',cell,disposition:'neutral',visible:true,description:'This existing capable employer offers an explicitly established temporary job, with no default employer purse, rival, proficiency or food.'}))
 const held=initial.dmTools.loadout?.mainHandId??initial.player.inventory.find(i=>i.type==='weapon')?.id;if(held)ok(await call('equip_item',{itemId:held,operation:'unequip',slot:'main_hand'}))
 async function fact(description){return ok(await call('record_scene_fact',{description,cell})).worldFact}
 const decision=await fact('The MJ explicitly adopts optional XGE Downtime Revisited for actual Work; engine days remain epoch0, exactly86400seconds, independent of display calendar.'),job=await fact('This actual existing employer and worker have established this exact temporary job, original worksite and source check. No wage, completed effort or payment has yet been granted.')
 const adoption={eventId:'actual-work-adoption',decisionFactId:decision.id,explicitlyAdopted:true},input={eventId:'actual-work-start',projectId:'actual-work-project',employerId:'actual-work-employer',jobFactId:job.id,actualTemporaryJobConfirmed:true,check}
 if(adopt)ok(await call('adopt_xge_downtime',adoption));if(start)ok(await call('start_downtime_work',input))
 function effort(eventId,seconds=28800,projectId=input.projectId){return{eventId,projectId,seconds,restActivity:'strenuous',activitySource:'The actual worker performs the explicitly agreed physical job at the retained supported worksite for this actual measured interval; no rest, sleep or nutrition is inferred.'}}
 async function day(index,projectId=input.projectId){const before=await call('get_game_state'),at=before.worldTimeSeconds??0;if(index&&at%86400)ok(await call('advance_time',{seconds:86400-at%86400}));return ok(await call('work_downtime',effort('actual-work-day-'+projectId+'-'+index,28800,projectId)))}
 async function complete(projectId=input.projectId){for(let i=0;i<5;i++)await day(i,projectId)}
 async function settlement(eventId='actual-work-settlement',received=zero,extra={}){const s=await call('get_game_state'),coverage=await fact('The MJ explicitly dates the source Work noncash lifestyle entitlement for seven engine dates. It supplies no food, water, heal, rest, refund or cash equivalent; future expense consumption is not implemented.');return{eventId,projectId:input.projectId,coverageStartDay:Math.floor((s.worldTimeSeconds??0)/86400),coverageFactId:coverage.id,actualSevenDayCoverageConfirmed:true,received,complicationDecisions:[],...extra}}
 const resolution={eventId:'actual-work-resolution',projectId:input.projectId,complicationSelection:'roll'}
 return{call,initial,cell,fact,adoption,input,effort,day,complete,settlement,resolution}
}
async function refused(call,name,input,code){const before=await call('get_game_state'),answer=await call(name,input);assert.ok(answer.error,JSON.stringify(answer));if(code)assert.equal(answer.code,code,JSON.stringify(answer));assert.deepEqual(await call('get_game_state'),before);return answer}
module.exports={setupWork,refused,zero}
