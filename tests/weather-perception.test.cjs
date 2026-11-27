const test=require('node:test'),assert=require('node:assert/strict')
process.env.MONETIZATION_ENABLED='false'
const {installPgMem}=require('./helpers/pg-mem.cjs'),pg=installPgMem()
const {engine,ok,replace,spawn,battle,adjacent}=require('./helpers/mcp-toolkit.cjs')
const {saveSession,loadSession,deleteSession}=require('../lib/session-store.ts')
const {lightingRay,visualPerceptionAt}=require('../mcp-server/dist/lib/lighting.js')
const {playerSeesCell}=require('../mcp-server/dist/lib/scene-perception.js')
const {resolveSenseFacets,weatherMasksTarget}=require('../mcp-server/dist/lib/creature-senses.js')
const fs=require('node:fs'),ts=require('typescript'),previousTsx=require.extensions['.tsx'],previousCss=require.extensions['.css']
require.extensions['.tsx']=(mod,filename)=>mod._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,filename)
require.extensions['.css']=mod=>{mod.exports={}}
test.after(()=>{if(previousTsx)require.extensions['.tsx']=previousTsx;else delete require.extensions['.tsx'];if(previousCss)require.extensions['.css']=previousCss;else delete require.extensions['.css']})
const React=require('react'),{renderToStaticMarkup}=require('react-dom/server'),Battlemap=require('../components/Battlemap.tsx').default
test.after(()=>pg.restore())
async function weather(call,extra={}){const state=await call('get_game_state');call.weatherSequence=(call.weatherSequence??0)+1;return ok(await call('configure_weather',{
 eventId:`weather-source-${call.weatherSequence}`,roomId:state.currentRoomId,temperatureF:65,strongWind:false,precipitation:'none',sandstorm:false,fog:'none',source:'Conditions physiques réellement établies par le MJ, sans lecture du texte joueur.',...extra}))}
async function refused(call,name,args,code){const before=await call('get_game_state'),result=await call(name,args);assert.equal(result.code,code,JSON.stringify(result));assert.deepEqual(await call('get_game_state'),before)}
async function hydrate(call){const state=await call('get_game_state');ok(await call('replace_game_state',{gameState:state}));assert.deepEqual(await call('get_game_state'),state);return state}
const check=(call,extra={})=>call('roll_ability_check',{ability:'wis',skill:'perception',dc:10,...extra})
const passive=(call,extra={})=>call('resolve_passive_check',{entityId:'player',ability:'wis',skill:'perception',...extra})
async function companion(call){const actor=await spawn(call,'goblin');await replace(call,state=>{state.monsters[actor.id].hostile=false;state.npcs??={};state.npcs[actor.id]={id:actor.id,name:'Compagnon réel',kind:'goblin',position:state.monsters[actor.id].position,mapId:state.currentMapId,roomId:state.currentRoomId,visible:true,disposition:'helpful'}});return actor.id}
const help=(id,sense,eventId)=>({eventId,helperId:id,beneficiaryId:'player',ability:'wis',skill:'perception',perceptionSense:sense,taskCanBeAttemptedAlone:true,collaborationIsProductive:true,reason:'Aide immédiate à ce même examen sensoriel réellement possible.'})

test('wind requires an explicit sense before RNG, never reads labels, and affects hearing but not other senses',async t=>{
 const call=await engine(t,{dice:'17,20,1,19'});await weather(call,{strongWind:true})
 await refused(call,'roll_ability_check',{ability:'wis',skill:'perception',label:'Je regarde ou écoute peut-être.'},'PERCEPTION_SENSE_REQUIRED')
 await refused(call,'roll_ability_check',{ability:'wis',skill:'perception',sightBased:true},'PERCEPTION_SENSE_REQUIRED')
 await refused(call,'roll_ability_check',{ability:'wis',skill:'perception',perceptionSense:'hearing',sightBased:true},'PERCEPTION_SENSE_CONFLICT')
 const other=ok(await check(call,{perceptionSense:'other',label:'Écouter est seulement un mot cité dans ce libellé.'}));assert.equal(other.roll.rolls[0],17);assert.equal(other.weatherDisadvantage,false)
 const heard=ok(await check(call,{perceptionSense:'hearing'}));assert.equal(heard.roll.rolls[0],1);assert.equal(heard.weatherDisadvantage,true);assert.match(heard.roll.detail,/DIS/)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('passive weather penalties are one minus five, cancel advantage normally, consume no resource and preserve the real modifier',async t=>{
 const call=await engine(t,{dice:'19'}),base=ok(await passive(call,{perceptionSense:'hearing'})).score
 await weather(call,{strongWind:true,precipitation:'heavy_rain'})
 await replace(call,state=>state.player.conditions.push('poisoned'))
 const before=await call('get_game_state'),heard=ok(await passive(call,{perceptionSense:'hearing'}))
 assert.equal(heard.score,base-5);assert.equal(heard.adjustment,-5)
 const canceled=ok(await passive(call,{perceptionSense:'hearing',advantage:true,advantageReason:'Une source favorable réelle et explicitement établie pour ce test.'}));assert.equal(canceled.score,base)
 assert.deepEqual(await call('get_game_state'),before);assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('heavy snow affects sight only; actual heavy rain affects hearing too without stacking disadvantages',async t=>{
 const call=await engine(t,{dice:'20,1,18,2,17,19'});await weather(call,{precipitation:'heavy_snow'})
 assert.equal(ok(await check(call,{perceptionSense:'hearing'})).roll.rolls[0],20)
 const sight=ok(await check(call,{perceptionSense:'sight'}));assert.equal(sight.roll.rolls[0],1);assert.equal(sight.weatherDisadvantage,true)
 await weather(call,{precipitation:'heavy_rain',strongWind:true})
 const hearing=ok(await check(call,{perceptionSense:'hearing'}));assert.equal(hearing.roll.rolls[0],2)
 const state=await hydrate(call),view=visualPerceptionAt(state,state.player,state.player.position);assert.equal(view.canSee,true);assert.equal(view.visualDisadvantage,true)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('ordinary heavy fog blocks sight and truesight, preserves physical reach and sourced blindsight, and never changes fog-of-war knowledge',async t=>{
 const call=await engine(t,{dice:'19'}),fungus=await spawn(call,'violet_fungus')
 await replace(call,state=>state.hero.effects.push({id:'unimplemented-magical-fog',kind:'unimplemented-magical-fog',sourceId:'player',targetIds:[],expiresAt:1000,concentration:false,data:{established:true}}))
 const before=await call('get_game_state')
 await weather(call,{fog:'heavy'});let state=await hydrate(call)
 assert.equal(lightingRay(state,state.player.position,fungus.position),true);assert.equal(playerSeesCell(state,fungus.position),false)
 const sight=ok(await call('inspect_creature_senses',{observerId:'player',targetId:fungus.id})),blind=ok(await call('inspect_creature_senses',{observerId:fungus.id,targetId:'player'}))
 assert.equal(sight.canSee,false);assert.equal(sight.reason,'heavy-obscuration');assert.equal(blind.canSee,true);assert.equal(blind.mode,'blindsight')
 assert.equal(weatherMasksTarget(state,state.player,state.monsters[fungus.id]),true);assert.equal(weatherMasksTarget(state,state.monsters[fungus.id],state.player),false)
 assert.deepEqual(state.sceneMemory,before.sceneMemory)
 const profile={blindsightFeet:0,darkvisionFeet:0,tremorsenseFeet:0,truesightFeet:60,blindBeyondBlindsight:false,blindsightRequiresHearing:false,unsupportedNativeSenses:[]}
 assert.equal(resolveSenseFacets(profile,{distanceFeet:5,pathClear:true,totalCover:false,inactive:false,blinded:false,deafened:false,targetInvisible:false,seesInvisible:false,perceivedIllumination:'bright',heavyObscuration:true}).canSee,false)
 await weather(call,{fog:'heavy',strongWind:true});state=await hydrate(call)
 assert.equal(playerSeesCell(state,fungus.position),true);assert.ok(state.hero.effects.some(effect=>effect.id==='unimplemented-magical-fog'))
 assert.equal(weatherMasksTarget(state,state.player,state.monsters[fungus.id]),false)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('an unusable explicitly selected sense automatically fails even DC zero without dice, prepared Inspiration or Bardic spending',async t=>{
 const call=await engine(t,{dice:'17,19'});await weather(call,{fog:'heavy'})
 ok(await call('grant_inspiration',{eventId:'real-inspiration',reason:'Une vraie décision de MJ antérieure au test.'}));ok(await call('spend_inspiration',{spendId:'reserved-inspiration',rollKind:'check'}))
 await replace(call,state=>state.hero.inspiration.push({targetId:'player',die:8,expiresAt:600}))
 const before=await call('get_game_state'),failed=ok(await check(call,{perceptionSense:'sight',dc:0}))
 assert.equal(failed.success,false);assert.equal(failed.automaticFailure,true);assert.equal(failed.roll.notation,'automatic-failure');assert.equal(failed.roll.rolls.length,0)
 const state=await hydrate(call);assert.deepEqual(state.dmTools.dmInspiration,before.dmTools.dmInspiration);assert.deepEqual(state.hero.inspiration,before.hero.inspiration);assert.equal(state.hero.pending,undefined)
 await replace(call,s=>s.player.conditions.push('deafened'))
 const deaf=ok(await passive(call,{perceptionSense:'hearing',dc:0}));assert.equal(deaf.score,null);assert.equal(deaf.success,false)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,17)
})

test('Help is tied to the exact selected sensory task and weather disadvantage cancels that one advantage without consuming other help',async t=>{
 const call=await engine(t,{dice:'17,20,1,19'}),id=await companion(call);await weather(call,{strongWind:true})
 await refused(call,'provide_check_help',{...help(id,'hearing','missing-sense'),perceptionSense:undefined},'PERCEPTION_SENSE_REQUIRED')
 ok(await call('provide_check_help',help(id,'hearing','real-hearing-help')))
 assert.equal(ok(await call('provide_check_help',help(id,'hearing','real-hearing-help'))).active,true)
 const other=ok(await check(call,{perceptionSense:'other'}));assert.equal(other.roll.rolls[0],17);assert.equal(other.advantage,false)
 const heard=ok(await check(call,{perceptionSense:'hearing'}));assert.equal(heard.roll.rolls[0],20);assert.equal(heard.advantage,true);assert.equal(heard.disadvantage,true);assert.doesNotMatch(heard.roll.detail,/^(ADV|DIS):/)
 assert.equal(ok(await call('provide_check_help',help(id,'hearing','real-hearing-help'))).active,false)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,1);assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('a held weather-affected group keeps each original d20 and explicit sense through SQL, reaction and exact retry',async t=>{
 const call=await engine(t,{dice:'20,1,6,20,2,19'}),id=await companion(call);await weather(call,{strongWind:true})
 const input={eventId:'actual-group-hearing',participants:['player',id],ability:'wis',skill:'perception',perceptionSense:'hearing',dc:5,reason:'Écouter ensemble un son réellement établi dans cette même salle.'}
 await refused(call,'resolve_group_check',{...input,eventId:'ambiguous-group',perceptionSense:undefined},'PERCEPTION_SENSE_REQUIRED')
 await replace(call,state=>state.hero.inspiration.push({targetId:'player',die:8,expiresAt:600}))
 const held=ok(await call('resolve_group_check',input));assert.ok(held.pendingReaction)
 let state=await hydrate(call);assert.equal(state.hero.pending.command.result.perceptionSense,'hearing');assert.equal(state.hero.pending.command.result.weatherDisadvantage,true)
 const sessionId=`weather-hearing-${process.pid}`;t.after(()=>deleteSession(sessionId));await saveSession(sessionId,{gameState:state,history:[],adventureId:state.adventureId,characterId:state.characterId})
 const saved=await loadSession(sessionId);assert.deepEqual(saved.gameState,state);ok(await call('replace_game_state',{gameState:saved.gameState}))
 ok(await call('resolve_group_check',input));assert.deepEqual(await call('get_game_state'),state)
 const resolved=ok(await call('resolve_reaction',{pendingId:held.pendingReaction.id,choice:'bardic_inspiration'}));assert.equal(resolved.complete,true)
 state=await hydrate(call);const results=state.dmTools.checkModes.groups[input.eventId].results;assert.equal(results[0].roll.rolls[0],1);assert.equal(results[1].roll.rolls[0],2);assert.ok(results.every(result=>result.perceptionSense==='hearing'&&result.weatherDisadvantage))
 assert.equal(ok(await call('resolve_group_check',input)).replayed,true);assert.deepEqual(await call('get_game_state'),state)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('a group cannot turn an automatic sensory failure into a success at DC zero or spend its unused inspiration',async t=>{
 const call=await engine(t,{dice:'19'}),id=await companion(call);await weather(call,{fog:'heavy'})
 const result=ok(await call('resolve_group_check',{eventId:'group-no-vision',participants:['player',id],ability:'wis',skill:'perception',perceptionSense:'sight',dc:0,reason:'Tentative visuelle explicite dans ce vrai brouillard opaque.'}))
 assert.equal(result.success,false);assert.equal(result.successes,0);assert.ok(result.receipt.results.every(value=>value.automaticFailure&&value.roll.rolls.length===0))
 await hydrate(call);assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('the dedicated visible-cell resolver transmits its real sight procedure without a generic preliminary check',async t=>{
 const call=await engine(t,{dice:'20,1,19'}),state=await call('get_game_state');await weather(call,{precipitation:'heavy_rain'})
 const view=ok(await call('resolve_visual_perception',{cell:state.player.position,dc:10}));assert.equal(view.perceptionSense,'sight');assert.equal(view.weatherDisadvantage,true);assert.equal(view.roll.rolls[0],1)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('a genuine secret-door search uses its declared sight under rain/wind and persists no discovery from a failed check',async t=>{
 const call=await engine(t,{dice:'20,1,20,19'})
 await replace(call,state=>{state.currentMapId='cellar';state.currentRoomId='27';state.player.position={x:11,y:6};state.roomsVisited.push('27')})
 ok(await call('configure_hidden_door',{eventId:'real-rainy-door',doorId:'north_cell',definition:{kind:'secret',sourceDescription:'Panneau réellement camouflé au seuil existant, traces visuelles établies.',detectionDc:15}}))
 await weather(call,{precipitation:'heavy_rain'})
 const search={doorId:'north_cell',cell:{x:11,y:6},method:'search',eventId:'search-rainy-door'}
 const failed=ok(await call('resolve_door_discovery',search));assert.equal(failed.discovered,false);assert.equal(failed.check.perceptionSense,'sight');assert.equal(failed.check.weatherDisadvantage,true);assert.equal(failed.check.roll.rolls[0],1)
 await hydrate(call);await weather(call,{strongWind:true})
 const found=ok(await call('resolve_door_discovery',{...search,eventId:'search-windy-door'}));assert.equal(found.discovered,true);assert.equal(found.check.weatherDisadvantage,false);assert.equal(found.check.roll.rolls[0],20)
 const state=await hydrate(call);assert.equal(state.sceneMemory?.doorStates?.north_cell??'closed','closed');assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('normal map presentation removes fresh known monster/NPC positions in physical heavy fog and restores them without changing map knowledge',async t=>{
 const call=await engine(t,{dice:'19'}),actor=await spawn(call,'commoner'),initial=await call('get_game_state'),cell=adjacent(initial)[0]
 await replace(call,state=>{state.monsters[actor.id].name='PionConnuMeteoUnique';state.npcs??={};state.npcs['weather-display-npc']={id:'weather-display-npc',name:'PnjConnuMeteoUnique',kind:'habitante',mapId:state.currentMapId,roomId:state.currentRoomId,position:cell,disposition:'neutral',visible:true}})
 const render=state=>renderToStaticMarkup(React.createElement(Battlemap,{gameState:state,image:'/known-map.png'}))
 let state=await hydrate(call);const knowledge={roomsVisited:structuredClone(state.roomsVisited),sceneMemory:structuredClone(state.sceneMemory)}
 assert.match(render(state),/PionConnuMeteoUnique/);assert.match(render(state),/PnjConnuMeteoUnique/)
 await weather(call,{fog:'heavy'});state=await hydrate(call);const unchanged=structuredClone(state),hidden=render(state)
 assert.doesNotMatch(hidden,/PionConnuMeteoUnique|PnjConnuMeteoUnique/);assert.deepEqual(state,unchanged)
 assert.deepEqual({roomsVisited:state.roomsVisited,sceneMemory:state.sceneMemory},knowledge)
 await weather(call,{fog:'light'});state=await hydrate(call);assert.match(render(state),/PionConnuMeteoUnique/);assert.match(render(state),/PnjConnuMeteoUnique/)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('combat Help retains its explicit Perception sense and an impossible sensory task spends no action',async t=>{
 const call=await engine(t,{dice:'19'}),id=await companion(call);await weather(call,{strongWind:true});await battle(call,[id])
 const input={action:'help',helpKind:'check',beneficiaryId:id,skill:'perception',task:'Écouter ensemble ce bruit réellement présent.'}
 await refused(call,'combat_action',input,'PERCEPTION_SENSE_REQUIRED')
 ok(await call('combat_action',{...input,perceptionSense:'hearing'}));let state=await hydrate(call)
 assert.equal(state.hero.effects.find(effect=>effect.kind==='help-check').data.perceptionSense,'hearing');assert.equal(state.hero.actionCredits,0)
 await battle(call,[id]);await replace(call,s=>s.player.conditions.push('deafened'))
 await refused(call,'combat_action',{...input,perceptionSense:'hearing'},'CHECK_HELP_SENSE_UNAVAILABLE')
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('Hide uses the selected hearing observer passive in wind and refuses a missing sensory choice before its action or die',async t=>{
 const call=await engine(t,{characterId:'wizard',dice:'6,19'}),enemy=await spawn(call);await weather(call,{strongWind:true});await battle(call,[enemy.id]);await replace(call,state=>state.player.conditions.push('invisible'))
 await refused(call,'combat_action',{action:'hide'},'PERCEPTION_SENSE_REQUIRED')
 const result=ok(await call('combat_action',{action:'hide',perceptionSense:'hearing'}));assert.equal(result.check.dc,5);assert.equal(result.success,true)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
