const test=require('node:test'),assert=require('node:assert/strict')
const {fixture,ok,refused}=require('./helpers/ammunition-fixture.cjs')
const gs=require('../mcp-server/dist/mcp-server/game-state.js')
const {getMonsterRecord}=require('../mcp-server/dist/lib/srd/monsters.js')
const {registerSwallowTools}=require('../mcp-server/dist/mcp-server/tools/swallow-tools.js')
const {dueSwallowEvents,swallowedBy,swallowStateOf}=require('../mcp-server/dist/lib/swallow-state.js')
const {navigationGrid}=require('../mcp-server/dist/lib/navigation.js')
const {entityVerticalContext,entityGroundContact}=require('../mcp-server/dist/lib/jumping-state.js')
const {coverFor}=require('../mcp-server/dist/mcp-server/cover.js')
const {dealDamage}=require('../mcp-server/dist/mcp-server/monster-rules.js')
const {canSee}=require('../mcp-server/dist/mcp-server/monster-perception.js')
let sequence=0
const force=dice=>process.env.AI_DM_TEST_DICE_SEQUENCE=dice+' '.repeat(++sequence)
async function setup(t,{dice='17,1,1,1,1,19',size='Medium',observeSize=true}={}){
 const f=await fixture(t,{weapon:'longsword',quantity:null,dice}),r=getMonsterRecord('purple_worm')
 f.state.monsters.target={...structuredClone(r.engine),id:'target',name:'Actual source worm',position:{x:2,y:2},isAlive:true,srd:{index:r.source.index,ruleset:'2014',url:r.sourceUrl}};f.state.currentTurn='target';f.state.player.hp={current:300,max:300}
 const callbacks={},server={registerTool(name,config,callback){callbacks[name]=input=>callback(require('zod').z.object(config.inputSchema).parse(input))}};registerSwallowTools(server);const original=f.call;f.call=async(name,input={})=>callbacks[name]?JSON.parse((await callbacks[name](input)).content[0].text):original(name,input)
 f.state.worldFacts.push({id:'actual-body-size',mapId:f.state.currentMapId,text:'Actual body size physically observed.',source:'Actual physical body observation.',expires:'never'})
 if(observeSize)ok(await f.call('record_swallow_body_size',{entityId:'player',size,factId:'actual-body-size',source:'Actual measured current player body, no transformation.'}))
 f.bite=()=>f.call('resolve_monster_action',{monsterId:'target',targetId:'player',actionName:'Bite'})
 f.episode=()=>Object.values(swallowStateOf(gs.getState())?.episodes??{}).find(e=>e.targetId==='player')
 return f
}

async function waterObservationTools(f){
 const callbacks={},server={registerTool(name,config,callback){callbacks[name]=input=>callback((typeof config.inputSchema.parse==='function'?config.inputSchema:require('zod').z.object(config.inputSchema)).parse(input))}}
 require('../mcp-server/dist/mcp-server/tools/underwater-tools.js').registerUnderwaterTools(server);require('../mcp-server/dist/mcp-server/tools/special-movement-tools.js').registerSpecialMovementTools(server);require('../mcp-server/dist/mcp-server/tools/native-flight-tools.js').registerNativeFlightTools(server)
 const original=f.call;f.call=async(name,input={})=>callbacks[name]?JSON.parse((await callbacks[name](input)).content[0].text):original(name,input)
}
const physicalSource='Actual exterior water and physical bodies observed independently of the retained swallow interior.'
test('a real prior water witness loses exterior fire resistance and water-attack exposure after actual ingestion while its original breathing debt survives',async t=>{
 const f=await setup(t);await waterObservationTools(f);const uw=require('../mcp-server/dist/lib/underwater-rules.js')
 ok(await f.call('record_movement_medium',{eventId:'exterior-water',mediumId:'pool',mapId:f.state.currentMapId,roomId:'firing-room',mode:'swim',cells:[{x:1,y:2},{x:2,y:2}],bottomZFeet:0,topZFeet:12,surfaceZFeet:12,factId:'actual-body-size',actualPhysicalMediumConfirmed:true,handsRequired:0,difficult:false,source:physicalSource}))
 ok(await f.call('set_breathing_context',{entityId:'player',eventId:'actual-debt',mode:'hold_breath',reason:physicalSource}));const episode=f.state.dmTools.breathing.creatures.player.episode
 ok(await f.call('record_underwater_context',{eventId:'prior-actual-immersion',subject:{kind:'creature',entityId:'player'},waterMediumId:'pool',fullyImmersed:true,breathingEpisodeId:episode.id,factId:'actual-body-size',actualPhysicalObservationConfirmed:true,source:physicalSource}));const beforeFrame=uw.underwaterSubjectFrame(f.state,{kind:'creature',entityId:'player'});assert.equal(require('../mcp-server/dist/mcp-server/monster-rules.js').adjustedDamage(f.state.player,9,'fire').damage,4)
 ok(await f.call('record_underwater_context',{eventId:'actual-worm-air-bite',subject:{kind:'creature',entityId:'target'},waterMediumId:'pool',fullyImmersed:false,factId:'actual-body-size',actualPhysicalObservationConfirmed:true,weaponAttack:{target:{kind:'creature',entityId:'player'},weaponReference:'Bite',madeUnderwater:false},source:physicalSource}))
 ok(await f.bite());assert.ok(f.episode());const current=gs.getState(),frame=uw.underwaterSubjectFrame(current,{kind:'creature',entityId:'player'});assert.notEqual(frame.witness,beforeFrame.witness);assert.match(frame.witness,/episodeId/);assert.equal(uw.currentUnderwaterRecord(current,{kind:'creature',entityId:'player'}),undefined);assert.deepEqual(uw.subjectWaterMedia(current,{kind:'creature',entityId:'player'}),[]);assert.equal(uw.fullyImmersedInWater(current,{kind:'creature',entityId:'player'}),false);assert.deepEqual(uw.waterAlongAttack(current,'player',{kind:'creature',entityId:'target'}),[]);assert.equal(require('../mcp-server/dist/mcp-server/monster-rules.js').adjustedDamage(current.player,9,'fire').damage,9);assert.deepEqual(current.dmTools.breathing.creatures.player.episode,episode)
 await refused(f,'set_breathing_context',{entityId:'player',eventId:'not-exterior-air',mode:'air',reason:physicalSource},'UNDERWATER_CONTAINED_AIR_CONTEXT_REQUIRED')
 await refused(f,'record_underwater_context',{eventId:'no-inherited-immersion',subject:{kind:'creature',entityId:'player'},waterMediumId:'pool',fullyImmersed:false,factId:'actual-body-size',actualPhysicalObservationConfirmed:true,source:physicalSource},'UNDERWATER_CONTAINED_EXPOSURE_UNSUPPORTED')
 gs.replaceState(structuredClone(current));assert.equal(uw.currentUnderwaterRecord(gs.getState(),{kind:'creature',entityId:'player'}),undefined);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})

test('a genuinely swallowed native flyer cannot use inherited hostXYZ as a free exterior takeoff or measured weapon ray',async t=>{
 const f=await setup(t);await waterObservationTools(f);const r=getMonsterRecord('wyvern');f.state.monsters.flyer={...structuredClone(r.engine),id:'flyer',name:'Actual swallowed native source',position:{x:3,y:2},hp:{current:200,max:200},isAlive:true,srd:{index:r.source.index,ruleset:'2014',url:r.sourceUrl}};f.state.initiativeOrder.push('flyer');ok(await f.call('record_swallow_body_size',{entityId:'flyer',size:'Large',factId:'actual-body-size',source:physicalSource}));gs.replaceState(structuredClone(f.state),{prepareSocial:true});ok(await f.call('resolve_monster_action',{monsterId:'target',targetId:'flyer',actionName:'Bite'}));assert.equal(swallowedBy(gs.getState(),'flyer'),'target')
 const pos=gs.getMonster('flyer').position;await refused(f,'fly_native_path',{eventId:'no-internal-takeoff',entityId:'flyer',path:[{...pos,zFeet:0},{...pos,zFeet:5}],factId:'actual-body-size',actualWholeBodyClearanceConfirmed:true,source:physicalSource},'NATIVE_FLIGHT_CONTAINED_BODY_REQUIRED')
 await refused(f,'record_spatial_attack_geometry',{eventId:'no-exterior-ray',actorId:'flyer',targetId:'target',weaponReference:'Bite',originZFeet:0,targetZFeet:0,factId:'actual-body-size',actualAttackPointsConfirmed:true,source:physicalSource},'SWALLOW_INTERNAL_SPATIAL_GEOMETRY_REQUIRED');assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
