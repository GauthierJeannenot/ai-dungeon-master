const test=require('node:test'),assert=require('node:assert/strict')
Object.assign(process.env,{LLM_MODE:'mock',ALLOW_PAID_LLM:'false',MONETIZATION_ENABLED:'false',DM_RATE_LIMIT_PER_MINUTE:'0',APP_LOG_PERSIST_ENABLED:'false',APP_LOG_LEVEL:'error',LLM_MAX_CALLS_PER_REQUEST:'12'})
const {installPgMem}=require('./helpers/pg-mem.cjs'),pg=installPgMem()
const llm=require('../lib/dm/llm.ts'),mcp=require('../lib/mcp-client.ts'),{POST}=require('../app/api/dm/route.ts')
const {saveSession,loadSession,deleteSession}=require('../lib/session-store.ts')
const {engine,ok,adjacent}=require('./helpers/mcp-toolkit.cjs')
const plain=value=>JSON.parse(JSON.stringify(value))
test.after(()=>pg.restore())
function lastResult(params){return JSON.parse(params.messages.flatMap(m=>Array.isArray(m.content)?m.content:[]).filter(b=>b.type==='tool_result').at(-1).content)}
async function play(t,seed,steps,message){
 const before=await seed('get_game_state'),metadata=(await seed.client.listTools()).tools,seen=[],selected=[],id=`swallow-api-${process.pid}-${Date.now()}-${Math.random()}`
 await saveSession(id,{gameState:before,history:[],adventureId:before.adventureId,characterId:before.characterId})
 t.after(async()=>{await mcp.closeMCPClient(id);await deleteSession(id)})
 t.mock.method(mcp,'listMCPTools',async()=>metadata)
 t.mock.method(mcp,'callMCPTool',async(name,input={})=>{if(!['get_game_state','replace_game_state'].includes(name)){seen.push({name,input:plain(input)});assert.ok(selected.some(command=>command.name===name&&JSON.stringify(command.input)===JSON.stringify(input)),`No fabricated gameplay call: ${name}`)}return seed(name,input)})
 let index=0
 t.mock.method(llm,'createLlmMessage',async(params,context)=>{assert.equal(context.operation,'dm.turn');assert.equal(params.tool_choice,undefined);const step=steps[index++];assert.ok(step,'The agent must finish its explicitly selected source event');const command=typeof step==='function'?step(params):step;if(typeof command==='string')return{stop_reason:'end_turn',content:[{type:'text',text:command}]};selected.push(plain(command));return{stop_reason:'tool_use',content:[{type:'tool_use',id:`swallow-${index}`,name:command.name,input:command.input}]}})
 const response=await POST(new Request('http://localhost/api/dm',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({sessionId:id,adventureId:before.adventureId,characterId:before.characterId,message})})),result=await response.json()
 assert.equal(response.status,200,JSON.stringify(result));assert.equal(index,steps.length);assert.deepEqual(plain((await loadSession(id)).gameState),result.newGameState);assert.deepEqual(seen,selected)
 return{before,result,seen}
}
async function swallowed(t,{tail=[],beforeCombat}={}){
 const seed=await engine(t,{dice:[1,20,17,1,1,1,1,...tail].join(',')}),initial=await seed('get_game_state')
 const fact=ok(await seed('record_scene_fact',{description:'La taille Moyenne actuelle du vrai personnage est observée, sans transformation.',cell:initial.player.position})).worldFact
 ok(await seed('record_swallow_body_size',{entityId:'player',size:'Medium',factId:fact.id,source:'Observation actuelle du vrai corps.'}))
 if(beforeCombat)await beforeCombat(seed,initial)
 const host=ok(await seed('spawn_monster',{monsterType:'purple_worm',cell:adjacent(initial)[0]}));ok(await seed('enter_combat',{combatants:['player',host.id]}));ok(await seed('resolve_monster_action',{monsterId:host.id,targetId:'player',actionName:'Bite'}))
 return{seed,host}
}
async function realThreshold(t,tail){
 const {seed,host}=await swallowed(t,{tail:[20,20,8,8,17,18,8,...tail]});ok(await seed('next_turn',{actorId:host.id}));const state=await seed('get_game_state'),sword=state.player.inventory.find(item=>(item.equipmentId??item.id)==='longsword');assert.ok(state.player.features.includes('extra_attack'))
 const first=ok(await seed('resolve_player_attack',{targetId:host.id,weaponOrSpell:sword.id})),second=ok(await seed('resolve_player_attack',{targetId:host.id,weaponOrSpell:sword.id}));assert.ok(first.damageDealt+second.damageDealt>=30)
 const inspection=ok(await seed('inspect_swallowing')),event=inspection.dueEvents.find(e=>e.kind==='regurgitation'),episode=Object.values((await seed('get_game_state')).dmTools.swallow.episodes)[0];assert.ok(event);return{seed,host,event,episode}
}
test('POST agent explicitly selects the due source acid, receives its actual6d6 and persists the interior with one original event through SQL',async t=>{
 const {seed,host}=await swallowed(t,{tail:[...Array(6).fill(1),19]});ok(await seed('next_turn',{actorId:host.id}));ok(await seed('pass_turn',{reason:'Attente effectivement choisie pour conserver les tours réels.'}));const before=await seed('get_game_state');let selectedEvent
 const {result}=await play(t,seed,[{name:'inspect_swallowing',input:{}},params=>{const event=lastResult(params).dueEvents.find(e=>e.kind==='acid');assert.ok(event);selectedEvent=event.id;return{name:'resolve_swallow_event',input:{eventId:event.id}}},params=>{assert.equal(lastResult(params).roll.notation,'6d6');return{name:'next_turn',input:{actorId:host.id,skipAction:true,reason:'Le MJ choisit explicitement que le ver attende après son véritable acide.'}}},'Le véritable acide agit dans le corps du ver ; tu restes à l’intérieur et reprends ton vrai tour.'],'Je conserve ma position à l’intérieur du ver.')
 const after=result.newGameState;assert.equal(after.player.hp.current,before.player.hp.current-6);assert.equal(after.dmTools.swallow.events[selectedEvent].status,'resolved');assert.equal(Object.values(after.dmTools.swallow.episodes)[0].status,'inside');assert.deepEqual(after.player.position,after.monsters[host.id].position);assert.equal(ok(await seed('roll_dice',{notation:'1d20'})).total,19)
})
test('POST agent chooses every exact potential exit and endTurn before the source CON21; actual ejection and original receipt persist in SQL without a fabricated position',async t=>{
 const {seed,event,episode}=await realThreshold(t,[1,19]),exit={...episode.entryOutsideCell},input={eventId:event.id,endTurn:true,exits:[{targetId:'player',cell:exit}]}
 const {result,seen}=await play(t,seed,[{name:'resolve_swallow_event',input},params=>{assert.equal(lastResult(params).save.dc,21);assert.equal(lastResult(params).regurgitated,true);return{name:'next_turn',input:{actorId:'player'}}},params=>({name:'run_monster_turns',input:{holdIds:[event.sourceId]}}),'Tu es rejeté dans la case effectivement choisie et retombes à terre. Le MJ fait explicitement attendre le ver avant ton prochain tour.'],'Je termine mon tour ; si le ver me rejette, cette case libre est ma sortie choisie.')
 assert.deepEqual(seen[0].input,input);assert.deepEqual(result.newGameState.player.position,exit);assert.equal(result.newGameState.dmTools.swallow.episodes[episode.id].status,'regurgitated');assert.equal(result.newGameState.dmTools.swallow.events[event.id].status,'resolved');assert.ok(result.newGameState.player.conditions.includes('prone'));assert.equal(ok(await seed('roll_dice',{notation:'1d20'})).total,19)
})
test('POST preserves a model-selected invalid exit unchanged and refuses it before CON, movement or any source-event receipt',async t=>{
 const {seed,host}=await swallowed(t,{tail:[20,20,8,8,1,...Array(12).fill(1),19],beforeCombat:async(seed,initial)=>{
  const shield=initial.player.inventory.find(item=>(item.equipmentId??item.id)==='shield');if(shield)ok(await seed('equip_item',{itemId:shield.id,slot:'shield',operation:'unequip'}))
  ok(await seed('create_scene_object',{objectId:'actual-source-venom',name:'Actual physical stock',description:'One actual whole Purple Worm poison dose is in this physical stock.',cell:initial.player.position,kind:'container',material:'wood',size:'small',resilience:'fragile',contents:['poison_purple_worm_poison']}));const dose=ok(await seed('interact_object',{objectId:'actual-source-venom',action:'open'})).releasedItems[0];ok(await seed('pick_up_item',{itemId:dose.id}));const sword=initial.player.inventory.find(item=>(item.equipmentId??item.id)==='longsword');ok(await seed('prepare_player_poison',{eventId:'actual-before-swallow-coating',doseItemId:dose.id,surfaceKind:'weapon',surfaceId:sword.id,surfaceDescription:'This actual whole dose is applied to the selected actual blade.'}))
 }});ok(await seed('next_turn',{actorId:host.id}));const ready=await seed('get_game_state'),blade=ready.player.inventory.find(item=>(item.equipmentId??item.id)==='longsword'),hit=ok(await seed('resolve_player_attack',{targetId:host.id,weaponOrSpell:blade.id}));assert.ok(hit.damageDealt>=30);assert.equal((await seed('get_game_state')).hero.attackAction.remaining,1)
 const inspection=ok(await seed('inspect_swallowing')),event=inspection.dueEvents.find(e=>e.kind==='regurgitation'),before=await seed('get_game_state'),episode=Object.values(before.dmTools.swallow.episodes)[0],input={eventId:event.id,endTurn:true,exits:[{targetId:'player',cell:{x:0,y:0}}]}
 const {result,seen}=await play(t,seed,[{name:'resolve_swallow_event',input},params=>{assert.equal(lastResult(params).code,'SWALLOW_EXIT_CELL_INVALID');return'Cette case ne constitue pas une sortie physique autorisée ; aucun rejet n’est encore résolu.'}],'Je demande cette sortie précise, même si elle est trop éloignée.')
 assert.deepEqual(seen[0].input,input);assert.equal(result.newGameState.dmTools.swallow.events[event.id],undefined);assert.equal(result.newGameState.dmTools.swallow.episodes[episode.id].status,'inside');assert.deepEqual(result.newGameState.player.hp,before.player.hp);assert.deepEqual(result.newGameState.player.position,before.player.position);assert.equal(ok(await seed('roll_dice',{notation:'1d20'})).total,19)
})
