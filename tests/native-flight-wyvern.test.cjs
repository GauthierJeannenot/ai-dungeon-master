const test=require('node:test'),assert=require('node:assert/strict')
const {fixture,ok,refused}=require('./helpers/ammunition-fixture.cjs')
const gs=require('../mcp-server/dist/mcp-server/game-state.js')
const {getMonsterRecord}=require('../mcp-server/dist/lib/srd/monsters.js')
const {entityVerticalContext}=require('../mcp-server/dist/lib/jumping-state.js')
const {nativeFlightFallIssue}=require('../mcp-server/dist/lib/native-flight-geometry.js')
const {registerNativeFlightTools}=require('../mcp-server/dist/mcp-server/tools/native-flight-tools.js')
const {registerVerticalBarrierTools}=require('../mcp-server/dist/mcp-server/tools/vertical-barrier-tools.js')
const {registerVerticalTools}=require('../mcp-server/dist/mcp-server/tools/vertical-tools.js')
const source='Actual measured body, standing support and complete selected physical air clearance, established by the MJ.'
async function flight(t,{combat=false,dice='17,3,4,19',near=false}={}){
 const f=await fixture(t,{weapon:'longsword',quantity:null,dice,startBattle:false}),record=getMonsterRecord('wyvern')
 f.state.player.position=near?{x:2,y:1}:{x:10,y:4};f.state.currentRoomId=near?'firing-room':'other-room'
 f.state.monsters.wyvern={...structuredClone(record.engine),id:'wyvern',name:'Actual native flyer',type:'wyvern',srd:{index:'wyvern',ruleset:'2014',url:record.sourceUrl},position:{x:1,y:1},hp:{current:110,max:110},conditions:[],isAlive:true,hostile:true}
 const callbacks={},server={tool(name,_description,schema,callback){callbacks[name]=input=>callback(require('zod').z.object(schema).parse(input))},registerTool(name,config,callback){callbacks[name]=input=>callback((typeof config.inputSchema.parse==='function'?config.inputSchema:require('zod').z.object(config.inputSchema)).parse(input))}};registerNativeFlightTools(server);registerVerticalTools(server);registerVerticalBarrierTools(server);require('../mcp-server/dist/mcp-server/tools/weather-tools.js').registerWeatherTools(server)
 const original=f.call;f.call=async(name,input={})=>callbacks[name]?JSON.parse((await callbacks[name](input)).content[0].text):original(name,input)
 f.state.worldFacts.push({id:'actual-clearance',text:source,source,mapId:f.state.currentMapId,expires:'never'})
 ok(await f.call('record_vertical_surface',{eventId:'actual-floor',surfaceId:'floor',mapId:f.state.currentMapId,roomId:'firing-room',cells:[{x:1,y:1},{x:2,y:1},{x:3,y:1},{x:4,y:1}],kind:'support',elevationFeet:0,actualGeometryConfirmed:true,source}))
 for(const [entityId,heightFeet]of [['wyvern',8],['player',6],['target',4]])ok(await f.call('record_physical_body',{eventId:'body-'+entityId,entityId,heightFeet,actualMeasuredBodyConfirmed:true,source}))
 ok(await f.call('observe_standing_surface',{eventId:'actual-standing',entityId:'wyvern',surfaceId:'floor',actualCurrentSupportConfirmed:true,source}))
 gs.replaceState(structuredClone(f.state));f.state=gs.getState();f.target=f.state.monsters.target
 if(combat)Object.assign(f.state,{phase:'combat',currentTurn:'wyvern',round:1,combatGeneration:1,initiativeOrder:['wyvern','player','target'],actionUsed:{},movementUsed:{}})
 f.input=(extra={})=>({eventId:'actual-flight',entityId:'wyvern',path:[{x:1,y:1,zFeet:0},{x:1,y:1,zFeet:5}],takeoffSurfaceId:'floor',factId:'actual-clearance',actualWholeBodyClearanceConfirmed:true,source,...extra})
 f.qualify=(extra={})=>f.call('record_spatial_attack_geometry',{eventId:'actual-air-attack',actorId:'wyvern',targetId:'player',weaponReference:'Bite',originZFeet:5,targetZFeet:5,factId:'actual-clearance',actualAttackPointsConfirmed:true,source,...extra})
 return f
}

async function flyingMulti(t,dice='17,2,3,17,2,3,1,1,1,1,1,1,1,1,19'){
 const f=await flight(t,{near:true,dice});f.state.player.hp={current:300,max:300};ok(await f.call('fly_native_path',f.input()));Object.assign(f.state,{phase:'combat',currentTurn:'wyvern',round:1,combatGeneration:1,initiativeOrder:['wyvern','player','target']});f.multi=attackActions=>f.call('resolve_monster_action',{monsterId:'wyvern',targetId:'player',actionName:'Multiattack',attackActions});f.rays=async names=>{for(const weaponReference of names)ok(await f.qualify({eventId:'ray-'+weaponReference,weaponReference}))};return f
}

test('actual native flight permits exactly one selected Claws replacement and preserves the complete real Stinger poison for one action',async t=>{
 const f=await flyingMulti(t);await f.rays(['Claws','Stinger']);const a=ok(await f.multi(['Claws','Stinger']));assert.deepEqual(a.attacks.map(h=>h.weaponOrSpell),['Claws','Stinger']);assert.equal(a.attacks[0].spatialContext.distanceFeet,5);assert.equal(a.attacks[0].damageRoll.notation,'2d8+4');assert.equal(a.attacks[1].spatialContext.distanceFeet,5);assert.equal(a.attacks[1].playerPoison.save.dc,15);assert.equal(a.attacks[1].playerPoison.damageRoll.notation,'7d6');assert.equal(a.attacks[1].poisonDamageDealt,7);assert.equal(f.state.player.hp.current,275);assert.equal(f.state.actionUsed.wyvern,true);assert.equal(Object.keys(f.state.dmTools.nativePoison.hits).length,1);gs.replaceState(structuredClone(f.state));assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})

test('actual flying Bite+Claws substitutes the other source attack without inventing venom or a second action',async t=>{
 const f=await flyingMulti(t,'17,2,3,17,2,3,19');await f.rays(['Bite','Claws']);const a=ok(await f.multi(['Bite','Claws']));assert.deepEqual(a.attacks.map(h=>h.weaponOrSpell),['Bite','Claws']);assert.equal(f.state.player.hp.current,282);assert.equal(f.state.dmTools.nativePoison,undefined);assert.equal(f.state.actionUsed.wyvern,true);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})

test('a later missing exact Stinger ray refuses the complete flying pair before its first Claws die or action',async t=>{
 const f=await flyingMulti(t,'19');await f.rays(['Claws']);await refused(f,'resolve_monster_action',{monsterId:'wyvern',targetId:'player',actionName:'Multiattack',attackActions:['Claws','Stinger']},'SPATIAL_ATTACK_GEOMETRY_REQUIRED');assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})

test('a legal10foot Bite cannot hide the later Claws real geometric5foot limit before the first die',async t=>{
 const f=await flyingMulti(t,'19');await f.rays(['Bite']);ok(await f.qualify({eventId:'ray-low-Claws',weaponReference:'Claws',targetZFeet:0}));await refused(f,'resolve_monster_action',{monsterId:'wyvern',targetId:'player',actionName:'Multiattack',attackActions:['Bite','Claws']},'TARGET_OUT_OF_RANGE');assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})

test('even actual flight does not grant twoClaws or silently complete an invalid source sequence',async t=>{
 const f=await flyingMulti(t,'19');await f.rays(['Claws']);await refused(f,'resolve_monster_action',{monsterId:'wyvern',targetId:'player',actionName:'Multiattack',attackActions:['Claws','Claws']},'MULTIATTACK_SELECTION_REQUIRED');assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})

test('the real second CON held after actual flying Claws+Stinger retains both original spatial wounds, poison and one action through hydration',async t=>{
 const f=await flyingMulti(t,[17,2,3,17,2,3,1,1,...Array(7).fill(1),19].join(','));await f.rays(['Claws','Stinger']);f.state.hero.inspiration.push({targetId:'player',die:8,expiresAt:600});const a=ok(await f.multi(['Claws','Stinger']));assert.ok(a.pendingReaction);assert.equal(f.state.player.hp.current,282);gs.replaceState(structuredClone(f.state));const b=ok(await f.call('resolve_reaction',{pendingId:a.pendingReaction.id,choice:'bardic_inspiration'}));assert.deepEqual(b.attacks.map(h=>h.weaponOrSpell),['Claws','Stinger']);assert.deepEqual(b.attacks.map(h=>h.spatialContext.distanceFeet),[5,5]);assert.equal(b.attacks[1].weaponDamageDealt,9);assert.equal(b.attacks[1].poisonDamageDealt,7);assert.equal(gs.getPlayer().hp.current,275);assert.equal(gs.getState().actionUsed.wyvern,true);assert.equal(Object.keys(gs.getState().dmTools.nativePoison.hits).length,1);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
