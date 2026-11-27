const test=require('node:test'),assert=require('node:assert/strict')
Object.assign(process.env,{LLM_MODE:'mock',ALLOW_PAID_LLM:'false',MONETIZATION_ENABLED:'false',DM_RATE_LIMIT_PER_MINUTE:'0',APP_LOG_PERSIST_ENABLED:'false',APP_LOG_LEVEL:'error'})
const{installPgMem}=require('./helpers/pg-mem.cjs'),pg=installPgMem()
const{engine,ok,spawn,adjacent}=require('./helpers/mcp-toolkit.cjs')
const{saveSession,loadSession,deleteSession}=require('../lib/session-store.ts')
test.after(()=>pg.restore())
const source='The MJ explicitly establishes these actual fixture bodies, their measured posture and existing floor, the chosen clear physical air route, and the retained real melee points. No anatomy, action, reaction, source trait or hidden outcome is inferred.'
const sameCell=(a,b)=>a.x===b.x&&a.y===b.y
const sleeping=(state,id='player')=>Object.values(state.dmTools.sleep?.episodes??{}).find(e=>e.entityId===id&&e.status==='sleeping')
const begin=(call,id,eventId)=>call('begin_natural_sleep',{eventId,entityId:id,actualNaturalSleepConfirmed:true,reason:source})
async function refused(call,name,input,code){const before=await call('get_game_state'),answer=await call(name,input);assert.equal(answer.code,code,JSON.stringify(answer));assert.deepEqual(await call('get_game_state'),before);return answer}
async function turn(call,id){for(let n=0;n<8;n++){const s=await call('get_game_state');assert.equal(s.phase,'combat');if(s.currentTurn===id)return s;ok(await call('next_turn',{actorId:s.currentTurn,skipAction:true,reason:'The MJ explicitly holds this actual remaining action to reach the separately selected actor turn.'}))}assert.fail('The actual chosen turn must be reachable without inventing initiative or extra turns.')}
async function sqlRestore(t,call,label){const before=await call('get_game_state'),session=`sleep-spatial-${label}-${process.pid}-${Date.now()}-${Math.random()}`;t.after(()=>deleteSession(session));await saveSession(session,{gameState:before,history:[],adventureId:before.adventureId,characterId:before.characterId});const saved=(await loadSession(session)).gameState;assert.deepEqual(saved,before);ok(await call('replace_game_state',{gameState:saved}));assert.deepEqual(await call('get_game_state'),before);return saved}
async function setup(t,{poison,extraSleeper=false}={}){
 // The real combatants order fixes actual initiative draws: goblin20, Wyvern10, player1.
 // Poison gives the real player initiative disadvantage and therefore consumes a second1.
 const dice=[...poison?[1]:[],20,10,1,...poison?[1]:[],19].join(',')
 const call=await engine(t,{dice}),initial=await call('get_game_state'),p=initial.player.position
 const tools=(await call.client.listTools()).tools.map(t=>t.name)
 for(const name of ['begin_natural_sleep','shake_natural_sleeper','report_sleep_noise','record_spatial_opportunity_geometry','fly_native_path'])assert.ok(tools.includes(name),'This bounded cross requires BOTH actually merged sleep and spatial layers: '+name)
 const launch=adjacent(initial).find(cell=>Math.abs(cell.x-p.x)+Math.abs(cell.y-p.y)===1);assert.ok(launch,'The actual fixture requires a free orthogonal launch column.')
 const flyer=await spawn(call,'wyvern',launch),awaker=await spawn(call,'goblin')
 assert.ok(!sameCell(flyer.position,awaker.position));assert.ok(!sameCell(awaker.position,p))
 let other
 if(extraSleeper){other=await spawn(call,'goblin');ok(await begin(call,other.id,'cross-other-real-sleep'))}
 ok(await begin(call,'player','cross-real-sleep'))
 let s=await call('get_game_state');assert.ok(s.player.conditions.includes('unconscious'));assert.ok(s.player.conditions.includes('prone'));assert.ok(sleeping(s))
 if(poison){ok(await call('create_affliction_source',{sourceId:'cross-real-poison',templateId:poison,name:'Actual established scene exposure at this sleeper location',cell:p,doses:1}));ok(await call('expose_affliction',{sourceId:'cross-real-poison',eventId:'cross-real-exposure',targetId:'player',delivery:poison==='essence_of_ether'?'inhaled':'contact'}));s=await call('get_game_state');assert.ok(s.player.conditions.includes('poisoned'));assert.ok(s.player.conditions.includes('unconscious'));assert.ok(sleeping(s))}
 const fact=ok(await call('record_scene_fact',{description:source,cell:flyer.position})).worldFact
 const noiseFact=ok(await call('record_scene_fact',{description:'The actual ground actor at this exact location is the established source of the explicitly qualified audible noise.',cell:awaker.position})).worldFact
 ok(await call('record_vertical_surface',{eventId:'cross-real-floor',surfaceId:'cross-floor',mapId:s.currentMapId,roomId:s.currentRoomId,cells:[flyer.position,p],kind:'support',elevationFeet:0,actualGeometryConfirmed:true,source}))
 for(const[entityId,heightFeet]of [[flyer.id,8],['player',2]])ok(await call('record_physical_body',{eventId:'cross-body-'+entityId,entityId,heightFeet,actualMeasuredBodyConfirmed:true,source:entityId==='player'?'This actual sleeping prone player body was measured at2feet in its present physical posture.':source}))
 ok(await call('observe_standing_surface',{eventId:'cross-real-standing',entityId:flyer.id,surfaceId:'cross-floor',actualCurrentSupportConfirmed:true,source}))
 const position={eventId:'cross-real-positioning',entityId:flyer.id,path:[{...flyer.position,zFeet:0},{...flyer.position,zFeet:5},{...p,zFeet:5},{...p,zFeet:4}],takeoffSurfaceId:'cross-floor',factId:fact.id,actualWholeBodyClearanceConfirmed:true,source}
 assert.equal(ok(await call('fly_native_path',position)).costFeet,11)
 ok(await call('enter_combat',{combatants:[awaker.id,flyer.id,'player']}))
 s=await call('get_game_state');assert.equal(s.currentTurn,awaker.id)
 const input={eventId:'cross-real-departure',entityId:flyer.id,path:[{...p,zFeet:4},{...p,zFeet:9}],factId:fact.id,actualWholeBodyClearanceConfirmed:true,source}
 return{call,flyer,awaker,other,input,noiseFact}
}
async function wakeAndQualify(f){
 const{call,awaker,flyer}=f;await turn(call,awaker.id);const before=await call('get_game_state')
 const shake={eventId:'cross-one-real-shake',actorId:awaker.id,targetId:'player'},result=ok(await call('shake_natural_sleeper',shake)),after=await call('get_game_state')
 assert.equal(after.actionUsed[awaker.id],true);assert.equal(after.actionUsed.player??false,false);assert.equal(after.player.hp.current,before.player.hp.current);assert.ok(after.player.conditions.includes('prone'));assert.equal(sleeping(after),undefined)
 await refused(call,'shake_natural_sleeper',{eventId:'cross-no-second-paid-shake',actorId:awaker.id,targetId:'player'},'ACTION_ALREADY_USED')
 const measured=after.dmTools.jumping.bodies.player;assert.ok(measured,'Actual retained prone body measurement must still exist.')
 await turn(call,flyer.id)
 ok(await call('record_spatial_opportunity_geometry',{eventId:'cross-real-unarmed-point',sourceId:'player',movingId:flyer.id,weaponReference:'unarmed',sourcePointZFeet:1,movingPointOffsetZFeet:0,factId:f.input.factId,actualRetainedBodyPointsConfirmed:true,source}))
 return{shake,result,before,after}
}
function assertExactOffer(f,result,state){assert.equal(result.status,'opportunity');assert.equal(result.costFeet,2);assert.equal(state.dmTools.nativeFlight.locations[f.flyer.id].point.zFeet,6);assert.equal(state.movementUsed[f.flyer.id],.4);assert.deepEqual(result.pendingReaction.command.opportunityBoundary.choices.map(c=>c.weaponOrSpell),['unarmed']);assert.deepEqual(state.dmTools.nativeFlight.moves[f.input.eventId].input.path,f.input.path)}

test('an actual naturally sleeping reactor causes no opportunity during the chosen genuine native flight, without a reaction, attack or further die',async t=>{
 const f=await setup(t);await turn(f.call,f.flyer.id);const before=await f.call('get_game_state'),result=ok(await f.call('fly_native_path',f.input)),after=await f.call('get_game_state')
 assert.equal(result.costFeet,5);assert.equal(after.hero.pending,undefined);assert.ok(sleeping(after));assert.ok(after.player.conditions.includes('unconscious'));assert.equal(after.hero.reactionsUsed.player??false,false);assert.equal(after.player.hp.current,before.player.hp.current);assert.equal(after.worldTimeSeconds,before.worldTimeSeconds);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})

test('one real other actor action wakes the prone disarmed reactor, then only its freshly qualified unarmed reach offers the exact paid spatial opportunity',async t=>{
 const f=await setup(t),{result}=await wakeAndQualify(f);assert.equal(result.otherUnconsciousSourceRemains,false)
 const a=ok(await f.call('fly_native_path',f.input)),state=await f.call('get_game_state');assertExactOffer(f,a,state);assert.ok(state.player.conditions.includes('prone'));assert.equal(state.dmTools.sleep.receipts['cross-one-real-shake'].result.actionSpent,true);assert.equal(state.actionUsed.player??false,false);assert.equal(state.hero.reactionsUsed.player??false,false);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})

test('a real pending spatial boundary refuses unrelated shake/noise before any cost and survives SQL plus a new process before the explicit decline resumes only the original remainder',async t=>{
 const f=await setup(t,{extraSleeper:true});await wakeAndQualify(f);const a=ok(await f.call('fly_native_path',f.input));assertExactOffer(f,a,await f.call('get_game_state'))
 await refused(f.call,'shake_natural_sleeper',{eventId:'cross-no-shake-during-held-flight',actorId:f.awaker.id,targetId:f.other.id},'REACTION_PENDING')
 await refused(f.call,'report_sleep_noise',{eventId:'cross-no-noise-during-held-flight',originEntityId:f.awaker.id,sleeperIds:[f.other.id],kind:'sudden_loud',factId:f.noiseFact.id,actualAudibilityConfirmed:true,reason:source},'REACTION_PENDING')
 const saved=await sqlRestore(t,f.call,'pending'),restarted=await engine(t,{dice:'19'});ok(await restarted('replace_game_state',{gameState:saved}));assert.deepEqual(await restarted('get_game_state'),saved);assert.equal(ok(await restarted('fly_native_path',f.input)).replayed,true);assert.deepEqual(await restarted('get_game_state'),saved)
 const done=ok(await restarted('resolve_reaction',{pendingId:saved.hero.pending.id,choice:'decline'})),after=await restarted('get_game_state');assert.equal(done.costFeet,5);assert.equal(after.dmTools.nativeFlight.locations[f.flyer.id].point.zFeet,9);assert.equal(after.movementUsed[f.flyer.id],1);assert.equal(after.hero.reactionsUsed.player??false,false);assert.ok(sleeping(after,f.other.id));assert.equal(ok(await restarted('roll_dice',{notation:'1d20'})).total,19)
})

test('the same paid shake removes natural plus Ether unconsciousness but not Taggit; only the actually capable reactor offers an opportunity, and SQL/replay never spends a second action or cures poison',async t=>{
 for(const poison of ['essence_of_ether','oil_of_taggit']){
  const f=await setup(t,{poison}),{shake,result}=await wakeAndQualify(f);assert.equal(result.otherUnconsciousSourceRemains,poison==='oil_of_taggit')
  const before=await sqlRestore(t,f.call,poison);assert.ok(before.player.conditions.includes('poisoned'));assert.equal(before.player.conditions.includes('unconscious'),poison==='oil_of_taggit');assert.equal(ok(await f.call('shake_natural_sleeper',shake)).replayed,true);assert.deepEqual(await f.call('get_game_state'),before)
  const a=ok(await f.call('fly_native_path',f.input)),after=await f.call('get_game_state');if(poison==='essence_of_ether')assertExactOffer(f,a,after);else{assert.equal(a.costFeet,5);assert.equal(after.hero.pending,undefined)}
  assert.equal(after.dmTools.sleep.receipts['cross-one-real-shake'].result.actionSpent,true);assert.ok(after.player.conditions.includes('poisoned'));assert.equal(after.player.hp.current,before.player.hp.current);assert.equal(after.hero.reactionsUsed.player??false,false);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
 }
})
