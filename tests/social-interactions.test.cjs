const test=require('node:test'),assert=require('node:assert/strict')
process.env.MONETIZATION_ENABLED='false'
const {installPgMem}=require('./helpers/pg-mem.cjs'),pg=installPgMem()
const {engine,ok,replace,spawn,battle}=require('./helpers/mcp-toolkit.cjs')
const {socialActors}=require('../mcp-server/dist/lib/social.js')
const {socialReaction,socialRequestDc}=require('../mcp-server/dist/lib/social-interaction-state.js')
const {saveSession,loadSession,deleteSession}=require('../lib/session-store.ts')
test.after(()=>pg.restore())
const source='Arbitrage du MJ depuis les faits réellement établis de cette conversation, sans interprétation serveur du texte joueur.'
const participant=(entityId='player',contribution='neutral')=>({entityId,contribution,statement:'Une proposition précise réellement prononcée pendant cet échange.',source})
const begin=(targetId,attitude='indifferent',id='conversation-one')=>({eventId:`begin-${id}`,interactionId:id,targetId,attitude,source,characteristics:[]})
const talk=(targetId,id='conversation-one',extra={})=>({eventId:`talk-${id}`,interactionId:id,targetId,source,requestReached:true,sufficientForInsight:true,participants:[participant()],...extra})
const request=(targetId,id='conversation-one',extra={})=>({eventId:`request-${id}`,interactionId:id,targetId,conversationEventId:`talk-${id}`,entityId:'player',resolution:'check',skill:'persuasion',request:{id:`actual-demand-${id}`,description:'Aider à porter cet objet précis sur le même sol dégagé, sans rien révéler ni donner.',risk:'none',source},...extra})
async function hydrate(call){const state=await call('get_game_state');ok(await call('replace_game_state',{gameState:state}));assert.deepEqual(await call('get_game_state'),state);return state}
async function refused(call,name,args,code){const before=await call('get_game_state'),result=await call(name,args);assert.equal(result.code,code,JSON.stringify(result));assert.deepEqual(await call('get_game_state'),before)}
async function nextConversation(call,targetId,attitude,id,extra={}){
 const state=await call('get_game_state'),previous=Object.values(state.dmTools.socialInteractions?.records??{}).filter(r=>r.input.targetId===targetId).sort((a,b)=>b.sequence-a.sequence),prior=previous[0],checked=previous.find(r=>r.lastCheckEventId)
 if(prior&&prior.closedAt===undefined)ok(await call('end_social_interaction',{eventId:`end-${prior.input.interactionId}-before-${id}`,interactionId:prior.input.interactionId,targetId,source}))
 return ok(await call('begin_social_interaction',{...begin(targetId,attitude,id),...(checked?{renewedConversation:{afterInteractionId:prior.input.interactionId,afterCheckEventId:checked.lastCheckEventId,source}}:{}),...extra}))
}
async function fixture(t,{dice='19',attitude='indifferent',id='conversation-one',characteristics=[]}={}){
 const call=await engine(t,{dice}),target=await spawn(call,'commoner')
 await replace(call,s=>{s.player.stats.cha=10;s.player.stats.wis=10;s.player.skillProficiencies=[];s.player.expertise=[]})
 ok(await call('begin_social_interaction',{...begin(target.id,attitude,id),characteristics}));ok(await call('record_social_conversation',talk(target.id,id)))
 return{call,target,id}
}

test('published reaction bands and request ceilings are exactly the three DMG2014 attitudes, including no fabricated band below zero',()=>{
 for(const attitude of ['friendly','indifferent','hostile'])for(const total of [-1,0,9,10,19,20,100]){
  const result=socialReaction(attitude,total);assert.equal(result.threshold,total<0?null:total<10?0:total<20?10:20)
 }
 assert.deepEqual(['none','minor','significant'].map(r=>socialRequestDc('friendly',r)),[0,10,20])
 assert.deepEqual(['none','minor','significant'].map(r=>socialRequestDc('indifferent',r)),[10,20,null])
 assert.deepEqual(['none','minor','significant'].map(r=>socialRequestDc('hostile',r)),[20,null,null])
 assert.equal(socialReaction('hostile',0).kind,'opposition');assert.equal(socialReaction('hostile',10).kind,'no_help_no_harm')
})

test('all nine public reaction bands resolve real dice and only the actual requested risk, without NPC/quest/wallet/secret mutations',async t=>{
 const call=await engine(t,{dice:'1,10,20,1,10,20,1,10,20,19'}),target=await spawn(call,'commoner')
 await replace(call,s=>{s.player.stats.cha=10;s.player.skillProficiencies=[];s.player.expertise=[]})
 const initial=await call('get_game_state'),unchanged=s=>({wallet:s.dmTools.wallet,inventory:s.player.inventory,world:s.world,objectives:s.objectivesDone,npcs:s.npcs,monsters:s.monsters,worldFacts:s.worldFacts})
 for(const attitude of ['friendly','indifferent','hostile'])for(const band of [0,10,20]){
  const id=`${attitude}-${band}`,input=request(target.id,id),expected=socialReaction(attitude,band)
  await nextConversation(call,target.id,attitude,id);ok(await call('record_social_conversation',talk(target.id,id)))
  const result=ok(await call('resolve_social_request',input));assert.equal(result.tableThreshold,band);assert.equal(result.reaction,expected.kind)
  assert.equal(result.tableCapacity,expected.acceptedRisk);assert.equal(result.requestGranted,expected.acceptedRisk!==null);assert.equal(result.acceptedRisk,expected.acceptedRisk===null?null:'none')
  assert.equal(result.policy,'standard2014');assert.equal(result.check.social.dcModifier,0)
  assert.deepEqual(unchanged(await hydrate(call)),unchanged(initial))
 }
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('negative total and natural20 do not invent a reaction or exceed the actual request/table capacity',async t=>{
 const {call,target}=await fixture(t,{attitude:'friendly',dice:'1,20,19'});await replace(call,s=>s.player.stats.cha=1)
 const below=ok(await call('resolve_social_request',request(target.id)));assert.equal(below.tableThreshold,null);assert.equal(below.reaction,'no_table_threshold');assert.equal(below.requestGranted,false)
 const id='a-real-new-topic';await nextConversation(call,target.id,'hostile',id);ok(await call('record_social_conversation',talk(target.id,id)))
 const high=ok(await call('resolve_social_request',request(target.id,id)));assert.equal(high.check.roll.rolls[0],20);assert.equal(high.tableThreshold,10);assert.equal(high.requestGranted,false)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('actual significant request needs friendly20; an indifferent significant request or explicit impossible demand grants nothing and draws no die',async t=>{
 const {call,target}=await fixture(t,{attitude:'friendly',dice:'20,19'}),input=request(target.id);input.request.risk='significant'
 const granted=ok(await call('resolve_social_request',input));assert.equal(granted.requestGranted,true);assert.equal(granted.acceptedRisk,'significant')
 for(const [id,reason]of [['beyond-attitude',undefined],['explicit-impossible','Les clés demandées n’existent pas et ce PNJ n’a aucun pouvoir de les créer.']]){
  await nextConversation(call,target.id,'indifferent',id);ok(await call('record_social_conversation',talk(target.id,id)))
  const requestInput=request(target.id,id);requestInput.request.risk='significant';if(reason)requestInput.request.impossibleReason=reason
  const result=ok(await call('resolve_social_request',requestInput));assert.equal(result.requestGranted,false);assert.equal(result.check,undefined)
 }
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('attitude changes need an actual source and cannot be accumulated beyond one normal step or mutate quest disposition',async t=>{
 const {call,target}=await fixture(t,{attitude:'hostile',dice:'19'}),before=await call('get_game_state')
 await refused(call,'record_social_conversation',talk(target.id,'conversation-one',{eventId:'no-attitude-source',attitude:'indifferent'}),'SOCIAL_ATTITUDE_SOURCE_REQUIRED')
 ok(await call('record_social_conversation',talk(target.id,'conversation-one',{eventId:'actual-change',attitude:'indifferent',attitudeSource:source})))
 await refused(call,'record_social_conversation',talk(target.id,'conversation-one',{eventId:'nonce-second-change',attitude:'friendly',attitudeSource:source}),'SOCIAL_ATTITUDE_STEP_LIMIT')
 const state=await hydrate(call);assert.equal(state.dmTools.socialInteractions.records['conversation-one'].attitude,'indifferent');assert.deepEqual(state.npcs,before.npcs)
})

test('new request IDs do not farm rerolls; each actual repeat names the last completed check and exact event retry draws nothing',async t=>{
 const {call,target}=await fixture(t,{attitude:'friendly',dice:'1,20,19'}),first=request(target.id);first.request.risk='minor'
 assert.equal(ok(await call('resolve_social_request',first)).requestGranted,false);await hydrate(call)
 await refused(call,'begin_social_interaction',begin(target.id,'friendly','nonce-new-conversation'),'SOCIAL_INTERACTION_ALREADY_ACTIVE')
 const second={...first,eventId:'new-random-nonce',request:{...first.request,id:'same-real-demand'}}
 await refused(call,'resolve_social_request',second,'SOCIAL_REPEAT_DECISION_REQUIRED')
 await refused(call,'resolve_social_request',{...second,repeatDecision:{afterEventId:'not-the-real-check',source}},'SOCIAL_REPEAT_DECISION_STALE')
 const repeated={...second,repeatDecision:{afterEventId:first.eventId,source}};assert.equal(ok(await call('resolve_social_request',repeated)).requestGranted,true)
 const before=await call('get_game_state');assert.equal(ok(await call('resolve_social_request',first)).replayed,true);assert.deepEqual(await call('get_game_state'),before)
 await refused(call,'resolve_social_request',{...first,request:{...first.request,risk:'significant'}},'SOCIAL_EVENT_CONFLICT')
 ok(await call('end_social_interaction',{eventId:'actual-end-before-new-attempt',interactionId:first.interactionId,targetId:target.id,source}))
 const next=begin(target.id,'friendly','actual-next-conversation')
 await refused(call,'begin_social_interaction',next,'SOCIAL_RENEWED_CONVERSATION_DECISION_REQUIRED')
 ok(await call('begin_social_interaction',{...next,renewedConversation:{afterInteractionId:first.interactionId,afterCheckEventId:repeated.eventId,source}}));await hydrate(call)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('actual roleplaying can resolve a friendly no-cost request without a die, while a real diplomacy refusal cannot be bypassed',async t=>{
 const {call,target}=await fixture(t,{attitude:'friendly',dice:'19'}),input=request(target.id)
 input.resolution='roleplay';delete input.skill;input.roleplayDecision={granted:true,source}
 assert.equal(ok(await call('resolve_social_request',input)).requestGranted,true)
 const id='actual-refusal';await nextConversation(call,target.id,'hostile',id,{diplomacyImpossible:{source:'Ce refus absolu est réellement établi par le MJ pour cette conversation.'}});ok(await call('record_social_conversation',talk(target.id,id)))
 const refusedResult=ok(await call('resolve_social_request',request(target.id,id)));assert.equal(refusedResult.requestGranted,false);assert.equal(refusedResult.check,undefined)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('participants and request-reached facts are explicit and validated before any d20 or action',async t=>{
 const {call,target}=await fixture(t,{dice:'19'}),id='not-at-request';await nextConversation(call,target.id,'friendly',id);ok(await call('record_social_conversation',talk(target.id,id,{requestReached:false})))
 await refused(call,'resolve_social_request',request(target.id,id),'SOCIAL_REQUEST_NOT_REACHED')
 await refused(call,'resolve_social_request',{...request(target.id,id),entityId:target.id},'SOCIAL_ACTIVE_PARTICIPANT_REQUIRED')
 await refused(call,'record_social_conversation',talk(target.id,id,{eventId:'imaginary-ally',participants:[participant(),participant('not-an-actor','positive')]}),'SOCIAL_PARTICIPANT_UNAVAILABLE')
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('substantial other-party positive and negative contributions cancel once, rather than generating numeric roleplay bonuses',async t=>{
 const {call,target}=await fixture(t,{dice:'10,19'}),a=await spawn(call,'commoner'),b=await spawn(call,'commoner')
 await replace(call,s=>{s.npcs??={};for(const actor of [a,b]){s.monsters[actor.id].hostile=false;s.npcs[actor.id]={id:actor.id,name:'Participant réel',kind:'compagnon',position:actor.position,mapId:s.currentMapId,roomId:s.currentRoomId,visible:true,disposition:'helpful'}}})
 ok(await call('record_social_conversation',talk(target.id,'conversation-one',{eventId:'real-contributions',participants:[participant(),participant(a.id,'positive'),participant(b.id,'negative')]})))
 const result=ok(await call('resolve_social_request',{...request(target.id),conversationEventId:'real-contributions'}));assert.equal(result.check.advantage,true);assert.equal(result.check.disadvantage,true);assert.deepEqual(result.check.roll.rolls,[10]);assert.equal(result.check.roleplayBonus,undefined)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('a held social check persists its actual attitude/policy/d20 in SQL, spends one action only on final resolution and replays after closure',async t=>{
 const {call,target}=await fixture(t,{attitude:'friendly',dice:'4,6,19'}),input=request(target.id);input.request.risk='minor'
 await battle(call,[target.id]);await replace(call,s=>s.hero.inspiration.push({targetId:'player',die:8,expiresAt:600}))
 const held=ok(await call('resolve_social_request',input));assert.ok(held.pendingReaction);let state=await hydrate(call);assert.equal(state.hero.actionCredits,1)
 const sessionId=`social-held-${process.pid}`;t.after(()=>deleteSession(sessionId));await saveSession(sessionId,{gameState:state,history:[],adventureId:state.adventureId,characterId:state.characterId});const saved=(await loadSession(sessionId)).gameState;assert.deepEqual(saved,state);ok(await call('replace_game_state',{gameState:saved}))
 assert.equal(ok(await call('resolve_social_request',input)).alreadyPending,true)
 const result=ok(await call('resolve_reaction',{pendingId:held.pendingReaction.id,choice:'bardic_inspiration'}));assert.equal(result.requestGranted,true);assert.equal(result.check.roll.rolls[0],4);assert.equal(result.check.roll.total,10)
 state=await hydrate(call);assert.equal(state.hero.actionCredits,0);assert.equal(state.actionUsed.player,true)
 ok(await call('end_social_interaction',{eventId:'actual-end',interactionId:input.interactionId,targetId:target.id,source}));const before=await call('get_game_state');assert.equal(ok(await call('resolve_social_request',input)).replayed,true);assert.deepEqual(await call('get_game_state'),before)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

for(const resolution of ['check','roleplay'])test(`a resolved social ${resolution} survives SQL and a fresh engine with JSONB key order, without changing its receipt or rerolling`,async t=>{
 const {call,target}=await fixture(t,{attitude:'friendly',dice:'7,19'})
 const input=request(target.id,'conversation-one',resolution==='roleplay'?{resolution,skill:undefined,roleplayDecision:{granted:true,source}}:{})
 const result=ok(await call('resolve_social_request',input));assert.equal(result.requestGranted,true)
 const state=await call('get_game_state'),receipt=state.dmTools.socialInteractions.receipts[input.eventId]
 const command=receipt.command,originalResult=structuredClone(receipt.result)
 // pg-mem does not reproduce PostgreSQL JSONB's property ordering. Supply
 // that ordering explicitly, then exercise the actual SQL store and MCP.
 receipt.result.playerResult={granted:receipt.result.playerResult.granted,request:receipt.result.playerResult.request}
 const sessionId=`social-jsonb-${resolution}-${process.pid}`;t.after(()=>deleteSession(sessionId))
 await saveSession(sessionId,{gameState:state,history:[{role:'user',content:'Conversation déjà résolue.'}],adventureId:state.adventureId,characterId:state.characterId})
 const saved=await loadSession(sessionId),before=structuredClone(saved)
 const fresh=await engine(t,{dice:'19',adventureId:state.adventureId,characterId:state.characterId})
 ok(await fresh('replace_game_state',{gameState:saved.gameState}))
 const restored=await fresh('get_game_state'),restoredReceipt=restored.dmTools.socialInteractions.receipts[input.eventId]
 assert.equal(restoredReceipt.command,command);assert.deepEqual(restoredReceipt.result,originalResult)
 assert.equal(ok(await fresh('resolve_social_request',input)).replayed,true)
 assert.deepEqual(await fresh('get_game_state'),restored)
 assert.equal(ok(await fresh('roll_dice',{notation:'1d20'})).total,19)
 const forged=structuredClone(restored);forged.dmTools.socialInteractions.receipts[input.eventId].result.playerResult.granted=false
 await refused(fresh,'replace_game_state',{gameState:forged},'SOCIAL_INTERACTION_STATE_MISMATCH')
 assert.deepEqual(await loadSession(sessionId),before,'validation and replay never rewrite the stored snapshot')
})

test('an unrelated combat Help is neither borrowed nor consumed by a conversation its helper did not actually contribute to',async t=>{
 const {call,target}=await fixture(t,{dice:'1,20,19'}),ally=await spawn(call,'commoner')
 await replace(call,s=>{s.monsters[ally.id].hostile=false;s.npcs??={};s.npcs[ally.id]={id:ally.id,name:'Compagnon réel',kind:'compagnon',position:ally.position,mapId:s.currentMapId,roomId:s.currentRoomId,visible:true,disposition:'helpful'}})
 ok(await call('record_social_conversation',talk(target.id,'conversation-one',{eventId:'ally-only-conversation',participants:[participant(ally.id)]})))
 await battle(call,[ally.id,target.id])
 const help=ok(await call('combat_action',{action:'help',helpKind:'check',beneficiaryId:ally.id,skill:'persuasion',task:'Autre tâche immédiate explicitement aidée, sans contribution du joueur dans la conversation sélectionnée.'})).effect
 ok(await call('next_turn',{actorId:'player'}))
 const result=ok(await call('resolve_social_request',{...request(target.id),entityId:ally.id,conversationEventId:'ally-only-conversation'}));assert.equal(result.check.advantage,false);assert.deepEqual(result.check.roll.rolls,[1]);assert.equal(result.requestGranted,false)
 assert.ok((await hydrate(call)).hero.effects.some(effect=>effect.id===help.id))
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,20)
})

test('a genuinely participating cooperative NPC can make its own Charisma check and spends only its own real combat action',async t=>{
 const {call,target}=await fixture(t,{dice:'1,20,19'}),ally=await spawn(call,'commoner')
 await replace(call,s=>{s.monsters[ally.id].hostile=false;s.npcs??={};s.npcs[ally.id]={id:ally.id,name:'Compagnon réel',kind:'compagnon',position:ally.position,mapId:s.currentMapId,roomId:s.currentRoomId,visible:true,disposition:'helpful'}})
 ok(await call('record_social_conversation',talk(target.id,'conversation-one',{eventId:'actual-party-negotiation',participants:[participant('player','positive'),participant(ally.id)]})))
 await battle(call,[ally.id,target.id],ally.id)
 const input={...request(target.id),entityId:ally.id,conversationEventId:'actual-party-negotiation'};input.request.risk='minor'
 const result=ok(await call('resolve_social_request',input));assert.equal(result.requestGranted,true);assert.equal(result.check.entityId,ally.id);assert.match(result.check.roll.detail,/ADV/)
 const state=await hydrate(call);assert.equal(state.actionUsed[ally.id],true);assert.equal(Boolean(state.actionUsed.player),false);assert.equal(state.hero.actionCredits,1)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('Insight reveals only a sourced characteristic; optional false interpretation is fixed before a failure10+ and never becomes a real trait',async t=>{
 const call=await engine(t,{dice:'20,1,19,17'});await replace(call,s=>{const npc=s.npcs.avowed;s.player.position={...npc.position};s.currentRoomId=npc.roomId;s.player.stats.wis=10;s.player.skillProficiencies=[];s.player.expertise=[]})
 const targetId='avowed',initial=await call('get_game_state'),actual=socialActors(initial).find(a=>a.targetId===targetId).profile.personality.ideals[0]
 const definition={id:'real-authored-ideal',kind:'ideal',source:{kind:'authored_profile',field:'ideals',index:0}}
 ok(await call('begin_social_interaction',{...begin(targetId),characteristics:[definition]}));ok(await call('record_social_conversation',talk(targetId)))
 const input={eventId:'actual-insight',interactionId:'conversation-one',targetId,conversationEventId:'talk-conversation-one',entityId:'player',characteristicId:definition.id,dc:15,source}
 const found=ok(await call('discern_social_characteristic',input));assert.equal(found.success,true);assert.equal(found.playerResult.reading,actual)
 const misleading={...input,eventId:'actual-misreading',falseInterpretation:{text:'Il estime à tort que cet interlocuteur méprise toute transmission du savoir.',source:'Interprétation erronée précisément choisie avant le dé par le MJ, pas caractéristique réelle.'},repeatDecision:{afterEventId:input.eventId,source}}
 const mistake=ok(await call('discern_social_characteristic',misleading));assert.equal(mistake.success,false);assert.equal(mistake.misidentified,true);assert.equal(mistake.playerResult.reading,misleading.falseInterpretation.text)
 const noInvented=ok(await call('discern_social_characteristic',{...input,eventId:'no-generated-falsehood',dc:30,repeatDecision:{afterEventId:misleading.eventId,source}}));assert.equal(noInvented.misidentified,false);assert.deepEqual(noInvented.playerResult,{noReading:true})
 const state=await hydrate(call);assert.equal(state.dmTools.socialInteractions.records['conversation-one'].characteristics[0].text,actual);assert.deepEqual(state.worldFacts,initial.worldFacts)
 const inspected=ok(await call('inspect_social_interaction',{interactionId:input.interactionId}));assert.equal(inspected.resolvedEvents.find(e=>e.eventId===input.eventId).playerResult.reading,actual);assert.equal(inspected.resolvedEvents.find(e=>e.eventId===misleading.eventId).playerResult.reading,misleading.falseInterpretation.text)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,17)
})

test('missing characteristic sources, authored influence locks and forged reaction receipts refuse atomically with the next die untouched',async t=>{
 const {call,target}=await fixture(t,{dice:'10,19'})
 const other=await spawn(call,'commoner');await refused(call,'begin_social_interaction',{...begin(other.id,'friendly','invented-trait'),characteristics:[{id:'fake-flaw',kind:'flaw',source:{kind:'authored_profile',field:'traits',index:500}}]},'SOCIAL_CHARACTERISTIC_SOURCE_REQUIRED')
 const locked=await spawn(call,'cultist');await refused(call,'begin_social_interaction',begin(locked.id,'friendly','locked-conversation'),'SOCIAL_TARGET_UNINFLUENCEABLE')
 ok(await call('resolve_social_request',request(target.id)));const state=await hydrate(call),forged=structuredClone(state);forged.dmTools.socialInteractions.receipts['request-conversation-one'].result.requestGranted=false
 await refused(call,'replace_game_state',{gameState:forged},'SOCIAL_INTERACTION_STATE_MISMATCH')
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('the MJ can close an actual conversation after leaving its map without bringing back or altering its remote target',async t=>{
 const call=await engine(t,{dice:'19'});await replace(call,s=>{const npc=s.npcs.avowed;s.player.position={...npc.position};s.currentRoomId=npc.roomId})
 ok(await call('begin_social_interaction',begin('avowed','friendly')));ok(await call('record_social_conversation',talk('avowed')))
 await replace(call,s=>{s.currentMapId='waterdeep';s.currentRoomId='4';s.player.position={x:0,y:0};s.roomsVisited.push('4')})
 const before=await call('get_game_state'),input={eventId:'end-after-actual-departure',interactionId:'conversation-one',targetId:'avowed',source:'Le MJ constate maintenant la fin de cet échange après le départ réellement établi vers une autre carte.'}
 ok(await call('end_social_interaction',input));const state=await hydrate(call);assert.deepEqual(state.npcs,before.npcs);assert.deepEqual(state.monsters,before.monsters);assert.equal(state.currentMapId,'waterdeep')
 const ended=await call('get_game_state');assert.equal(ok(await call('end_social_interaction',input)).replayed,true);assert.deepEqual(await call('get_game_state'),ended)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
