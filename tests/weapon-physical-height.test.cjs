const test=require('node:test'),assert=require('node:assert/strict')
const {fixture,ok,refused}=require('./helpers/ammunition-fixture.cjs')
const gs=require('../mcp-server/dist/mcp-server/game-state.js')
async function setup(t,options={}){
 const f=await fixture(t,{dice:'19,3,19',...options}),callbacks={},server={tool(n,d,s,fn){callbacks[n]=v=>fn(require('zod').z.object(s).parse(v))},registerTool(n,c,fn){callbacks[n]=v=>fn(require('zod').z.object(c.inputSchema).parse(v))}}
 for(const [path,name] of [['vertical-tools','registerVerticalTools'],['vertical-barrier-tools','registerVerticalBarrierTools'],['cover-tools','registerCoverTools']])require('../mcp-server/dist/mcp-server/tools/'+path+'.js')[name](server)
 const old=f.call;f.call=async(n,v={})=>callbacks[n]?JSON.parse((await callbacks[n](v)).content[0].text):old(n,v)
 return f
}
async function level(f,id,z=3){
 const cell={...(id==='player'?gs.getPlayer():gs.getMonster(id)).position},surfaceId='actual-support-'+id
 ok(await f.call('record_vertical_surface',{eventId:'measure-'+id,surfaceId,mapId:f.state.currentMapId,roomId:'firing-room',cells:[cell],kind:'support',elevationFeet:z,actualGeometryConfirmed:true,source:'Mesure de cet appui réel dans cette scène.'}))
 ok(await f.call('observe_standing_surface',{eventId:'observe-'+id,entityId:id,surfaceId,actualCurrentSupportConfirmed:true,source:'Première observation réelle de cet appui déjà occupé.'}))
}
const grade=f=>f.call('configure_cover',{coverId:'actual-grade',operation:'set',originId:'player',targetId:'target',obstacleCell:{x:3,y:2},degree:'half',reason:'Vrai parapet observé depuis cette direction précise.'})

for(const legacy of [false,true])test((legacy?'legacy':'modern')+' weapon refuses genuinely different support levels before ammunition, action or dice',async t=>{
 const f=await setup(t,{legacy,dice:'19'});await level(f,'target');await refused(f,legacy?'resolve_attack':'resolve_player_attack',{...(legacy?{attackerId:'player'}:{}),targetId:'target',weaponOrSpell:'shortbow',ammunitionItemId:'actual-ammo'},'PHYSICAL_HEIGHT_COMBAT_GEOMETRY_REQUIRED')
 assert.equal(f.stock(),3);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})

test('the complete explicit multiattack refuses its later raised target before the legal first attack die',async t=>{
 const f=await setup(t,{dice:'19'});f.state.monsters['raised-target']={...structuredClone(f.target),id:'raised-target',position:{x:5,y:1}};await level(f,'raised-target')
 await refused(f,'resolve_player_multiattack',{attacks:[{targetId:'target',weaponOrSpell:'shortbow',ammunitionItemId:'actual-ammo'},{targetId:'raised-target',weaponOrSpell:'shortbow',ammunitionItemId:'actual-ammo'}]},'PHYSICAL_HEIGHT_COMBAT_GEOMETRY_REQUIRED')
 assert.equal(f.stock(),3);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})

test('equal genuinely observed ledges keep the ordinary attack legal without a new bonus or free projectile',async t=>{
 const f=await setup(t,{dice:'17,3,19'});await level(f,'player');await level(f,'target');const a=ok(await f.attack())
 assert.equal(a.hit,true);assert.equal(a.attackRoll.rolls[0],17);assert.equal(f.stock(),2);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})

test('an old XY cover grade cannot silently follow both bodies to a genuinely observed ledge',async t=>{
 const f=await setup(t,{dice:'19'});ok(await grade(f));await level(f,'player');await level(f,'target')
 await refused(f,'resolve_player_attack',{targetId:'target',weaponOrSpell:'shortbow',ammunitionItemId:'actual-ammo'},'COVER_SPATIAL_REQUIRED')
 assert.equal(f.stock(),3);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})

test('a measured cover grade shares the source barrier/body witnesses and refuses a changed posture before the attack die',async t=>{
 const f=await setup(t,{dice:'19',startBattle:false});await level(f,'player');await level(f,'target')
 ok(await f.call('create_scene_object',{objectId:'actual-parapet',name:'Parapet réel',description:'Obstacle réel déjà présent sur cet appui.',cell:{x:3,y:2},kind:'obstacle',material:'stone',size:'medium',resilience:'resilient'}))
 ok(await f.call('record_physical_body',{eventId:'measure-body',entityId:'target',heightFeet:4,actualMeasuredBodyConfirmed:true,source:'Mesure réelle du corps debout.'}))
 ok(await f.call('declare_vertical_barrier',{eventId:'measure-wall',barrierId:'actual-wall',mapId:f.state.currentMapId,reference:{kind:'object',objectId:'actual-parapet',footprint:{minXFeet:12.5,maxXFeet:17.5,minYFeet:7.5,maxYFeet:12.5}},bottomZFeet:3,topZFeet:5,actualMeasuredBarrierConfirmed:true,source:'Mesure réelle du parapet.'}))
 ok(await f.call('configure_cover',{coverId:'actual-grade',operation:'set',originId:'player',targetId:'target',obstacleCell:{x:3,y:2},degree:'half',reason:'Fraction réelle du corps masquée depuis cette hauteur.',spatial:{originZFeet:3,barrierId:'actual-wall'}}))
 assert.equal(ok(await f.call('inspect_cover',{originId:'player',targetId:'target'})).acBonus,2)
 gs.applyCondition('target','prone');await refused(f,'resolve_player_attack',{targetId:'target',weaponOrSpell:'shortbow',ammunitionItemId:'actual-ammo'},'COVER_OBSERVATION_STALE')
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})

test('a held original attack refuses altered physical levels before its Inspiration die and never spends another arrow',async t=>{
 const f=await setup(t,{dice:'8,6,3,19'});await level(f,'player',0);await level(f,'target',0);f.state.hero.inspiration.push({targetId:'player',die:8,expiresAt:600})
 const a=ok(await f.attack());assert.ok(a.pendingReaction);const saved=structuredClone(gs.getState());saved.dmTools.jumping.surfaces['actual-support-target'].elevationFeet=3;saved.dmTools.jumping.supports.target.elevationFeet=3;gs.replaceState(saved)
 await refused(f,'resolve_reaction',{pendingId:a.pendingReaction.id,choice:'bardic_inspiration'},'PHYSICAL_HEIGHT_COMBAT_GEOMETRY_REQUIRED')
 assert.equal(gs.getPlayer().inventory.find(i=>i.id==='actual-ammo').quantity,2);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,6)
})

test('an unmeasured object point is never assigned the raised attacker height before its melee attack or cost',async t=>{
 const f=await setup(t,{weapon:'longsword',quantity:null,dice:'19',startBattle:false})
 ok(await f.call('create_scene_object',{objectId:'actual-object',name:'Vrai objet',description:'Objet physique de la scène sans mesure de hauteur.',cell:{x:2,y:2},kind:'obstacle',material:'wood',size:'small',resilience:'fragile'}));await level(f,'player')
 await refused(f,'interact_object',{objectId:'actual-object',action:'attack',weaponId:'longsword'},'PHYSICAL_HEIGHT_POINT_GEOMETRY_REQUIRED');assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})

test('a real measured ground device can still be placed on the same actual ledge, without flattening it to zero',async t=>{
 const f=await setup(t,{weapon:'longsword',quantity:null,dice:'19',startBattle:false});await level(f,'player');f.state.player.inventory.push({id:'actual-caltrops',equipmentId:'caltrops',name:'Lot réel',type:'misc'})
 const cell={...gs.getPlayer().position},fact=ok(await f.call('record_scene_fact',{description:'La dalle réellement observée à cette hauteur porte le lot choisi.',cell})).worldFact.id
 const a=ok(await f.call('place_ground_gear',{placementId:'real-raised-gear',itemId:'actual-caltrops',originCell:cell,surfaceZFeet:3,surfaceFactId:fact,supportSurfaceId:'actual-support-player'}))
 assert.equal(a.placement.surfaceZFeet,3);assert.equal(a.seconds,6);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})

test('a held real net-opening check validates its same physical helping reach before the Inspiration die',async t=>{
 const f=await setup(t,{weapon:'net',quantity:null,dice:'17,16,5,6,19'});f.target.position={x:2,y:2};await level(f,'player',0);await level(f,'target',0)
 ok(await f.call('set_net_creature_form',{eventId:'actual-net-body',entityId:'target',formless:false,source:'Vraie forme corporelle observée.',reason:'Aucune forme déduite du nom.'}))
 const shot=ok(await f.attack());assert.ok(shot.net);ok(await f.call('use_subclass_feature',{featureId:'action_surge'}));f.state.hero.inspiration.push({targetId:'player',die:8,expiresAt:600})
 const check=ok(await f.call('free_from_net',{eventId:'actual-helper',netId:shot.net.id,actorId:'player'}));assert.ok(check.pendingReaction)
 const saved=structuredClone(gs.getState());saved.dmTools.jumping.surfaces['actual-support-target'].elevationFeet=3;saved.dmTools.jumping.supports.target.elevationFeet=3;gs.replaceState(saved)
 await refused(f,'resolve_reaction',{pendingId:check.pendingReaction.id,choice:'bardic_inspiration'},'PHYSICAL_HEIGHT_COMBAT_GEOMETRY_REQUIRED');assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,6)
})

test('the proven plane of a real flat-jump opportunity is compared against its actual attacker level rather than dropping the airborne body from geometry',async t=>{
 const f=await setup(t,{weapon:'longsword',quantity:null,dice:'19'}),{executeNavigation}=require('../mcp-server/dist/mcp-server/navigation.js')
 executeNavigation('player',{kind:'cell',cell:{x:3,y:2}});f.target.position={x:4,y:3};await level(f,'player',0);await level(f,'target',0)
 const jump=ok(await f.call('jump',{eventId:'actual-flat-jump',kind:'long',toCell:{x:6,y:2}}));assert.ok(jump.pendingReaction);assert.equal(gs.getState().dmTools.jumping.jumps['actual-flat-jump'].heightMatters,false)
 const saved=structuredClone(gs.getState());saved.dmTools.jumping.surfaces['actual-support-target'].elevationFeet=3;saved.dmTools.jumping.supports.target.elevationFeet=3;gs.replaceState(saved)
 const weapon=jump.pendingReaction.command.opportunityBoundary.choices[0].weaponOrSpell
 await refused(f,'resolve_reaction',{pendingId:jump.pendingReaction.id,choice:'opportunity_attack',weaponOrSpell:weapon},'PHYSICAL_HEIGHT_COMBAT_GEOMETRY_REQUIRED');assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
