const test=require('node:test'),assert=require('node:assert/strict')
const {fixture,ok,refused}=require('./helpers/ammunition-fixture.cjs')
const {registerUnderwaterTools}=require('../mcp-server/dist/mcp-server/tools/underwater-tools.js')
const {registerSpecialMovementTools}=require('../mcp-server/dist/mcp-server/tools/special-movement-tools.js')
const gs=require('../mcp-server/dist/mcp-server/game-state.js')
async function legacy(t,{water=false}={}){
 const f=await fixture(t,{legacy:true,weapon:'mace',quantity:null,dice:'17,3,19'});f.state.currentTurn='target';f.target.position={x:2,y:2};delete f.target.srd
 if(water){
  const callbacks={},server={registerTool(name,config,callback){callbacks[name]=input=>callback(require('zod').z.object(config.inputSchema).parse(input))}};registerUnderwaterTools(server);registerSpecialMovementTools(server)
  const original=f.call;f.call=async(name,input={})=>callbacks[name]?JSON.parse((await callbacks[name](input)).content[0].text):original(name,input)
  const source='The exact actual existing water and attack, without any inferred source weapon.';f.state.worldFacts.push({id:'water-fact',text:source,source,mapId:f.state.currentMapId,expires:'never'})
  ok(await f.call('record_movement_medium',{eventId:'water-event',mediumId:'pool',mapId:f.state.currentMapId,roomId:'firing-room',mode:'swim',cells:[{x:1,y:2},{x:2,y:2}],bottomZFeet:0,topZFeet:12,surfaceZFeet:12,factId:'water-fact',actualPhysicalMediumConfirmed:true,handsRequired:0,difficult:false,source}))
  f.observation={eventId:'actual-legacy-attack',subject:{kind:'creature',entityId:'target'},waterMediumId:'pool',fullyImmersed:false,factId:'water-fact',actualPhysicalObservationConfirmed:true,source,weaponAttack:{target:{kind:'creature',entityId:'player'},weaponReference:'Scimitar',madeUnderwater:true}}
 }
 return f
}
test('an actual legacy monster without srd keeps its exact model-selected attack and reaches its existing flat resolver without a profile.name crash',async t=>{
 const f=await legacy(t),a=ok(await f.call('resolve_attack',{attackerId:'target',targetId:'player',weaponOrSpell:'Scimitar'}));assert.equal(a.underwaterContext.weaponReference,'Scimitar');assert.equal(a.underwaterContext.canonicalWeaponId,undefined);assert.equal(a.hit,true);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('unknown water on a legacy monster refuses without an invented weapon exemption or consumed die/action',async t=>{
 const f=await legacy(t,{water:true}),before=structuredClone(gs.getState()),answer=await f.call('resolve_attack',{attackerId:'target',targetId:'player',weaponOrSpell:'Scimitar'})
 assert.equal(answer.code,'UNDERWATER_ATTACK_CONTEXT_REQUIRED');assert.deepEqual(gs.getState(),before)
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,17)
})
