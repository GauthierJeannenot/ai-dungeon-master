const test=require('node:test'),assert=require('node:assert/strict')
const {fixture,ok,refused}=require('./helpers/ammunition-fixture.cjs')
const gs=require('../mcp-server/dist/mcp-server/game-state.js')
const {getAdventureMap}=require('../mcp-server/dist/lib/adventure-map.js')
const {weatherContextKey}=require('../mcp-server/dist/lib/weather-state.js')
const source='Trajet et intempéries physiques établis par le MJ, sans trajectoire ou réaction fabriquée.'
async function flame(t,{kind='torch',dice='17,16,3,19',inspiration=false}={}){
 const f=await fixture(t,{weapon:'mace',quantity:null,dice}),map=getAdventureMap()
 map.rooms[0].zone.maxX=3;map.rooms.push({id:'actual-middle-room',mapId:f.state.currentMapId,name:'Passage exposé',zone:{minX:4,maxX:6,minY:0,maxY:4}})
 f.target.position={x:10,y:2};f.state.player.inventory.push({id:'actual-light',equipmentId:kind,name:'Source physique de lumière',type:'misc'});f.state.dmTools.loadout.mainHandId='actual-light'
 const key=weatherContextKey(f.state.currentMapId,'actual-middle-room')
 f.state.dmTools.weather={version:1,contexts:{[key]:{mapId:f.state.currentMapId,roomId:'actual-middle-room',revision:1,temperatureF:70,strongWind:true,precipitation:'heavy_rain',sandstorm:false,fog:'none',fogDispersed:false,source,at:0}},profiles:{},clothing:{},events:{},flights:{},receipts:{}}
 f.state.dmTools.lighting={ambient:{},sources:{'actual-light':{itemId:'actual-light',kind,remainingSeconds:kind==='torch'?3600:21600,litAt:0}}}
 ok(await f.call('adjudicate_improvised_weapon',{referenceId:'actual-flame-throw',targetKind:'item',targetId:'actual-light',mode:'thrown',allowProficiency:false,damageType:'bludgeoning',hands:1,source,reason:'Vrai objet lancé comme arme improvisée1d4, sans dégât de feu ajouté gratuitement.'}))
 if(inspiration)f.state.hero.inspiration.push({targetId:'player',die:8,expiresAt:600})
 return {...f,key}
}
test('a real burning thrown item crossing adverse weather is extinguished from its captured ray even when its landing is clear',async t=>{
 const f=await flame(t),a=ok(await f.attack({weaponOrSpell:'actual-flame-throw'}))
 assert.ok(a.thrownItem);assert.equal(f.state.dmTools.lighting.sources['actual-light'].litAt,undefined)
 const receipt=Object.values(f.state.dmTools.lighting.weatherExtinctions)[0];assert.equal(receipt.extinguished,true);assert.equal(receipt.plan.weather[0].roomId,'actual-middle-room');assert.deepEqual(receipt.plan.rayCells.at(-1),{x:10,y:2})
 assert.equal(f.state.droppedItems['actual-light'].roomId,'other-room');assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('the held burning throw retains its real original weather plan through hydration and clears the physical hands only on completion',async t=>{
 const f=await flame(t,{dice:'8,7,6,19',inspiration:true}),held=ok(await f.attack({weaponOrSpell:'actual-flame-throw'}))
 assert.ok(held.pendingReaction);assert.equal(f.state.dmTools.loadout.mainHandId,'actual-light');assert.equal(f.state.droppedItems['actual-light'],undefined)
 const saved=structuredClone(f.state);saved.dmTools.weather.contexts[f.key].strongWind=false;saved.dmTools.weather.contexts[f.key].precipitation='none';saved.dmTools.weather.contexts[f.key].revision=2;gs.replaceState(saved)
 const a=ok(await f.call('resolve_reaction',{pendingId:held.pendingReaction.id,choice:'bardic_inspiration'}));assert.ok(a.thrownItem)
 const state=gs.getState();assert.equal(state.dmTools.loadout.mainHandId,undefined);assert.equal(state.dmTools.lighting.sources['actual-light'].litAt,undefined)
 const receipt=Object.values(state.dmTools.lighting.weatherExtinctions)[0];assert.equal(receipt.plan.weather[0].revision,1);assert.equal(receipt.reason,'applied');assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('an ambiguous lamp crossing mid-ray wind/rain refuses before attack die, action, transfer or flame mutation',async t=>{
 const f=await flame(t,{kind:'lamp',dice:'19'})
 await refused(f,'resolve_player_attack',{targetId:'target',weaponOrSpell:'actual-flame-throw'},'WEATHER_LAMP_PROTECTION_REQUIRED')
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('an altered held extinction decision refuses before spending the actual Inspiration die',async t=>{
 const f=await flame(t,{dice:'8,7,6,3,19',inspiration:true}),held=ok(await f.attack({weaponOrSpell:'actual-flame-throw'}))
 f.state.hero.pending.command.thrownFlameContext.extinguish=false
 await refused(f,'resolve_reaction',{pendingId:held.pendingReaction.id,choice:'bardic_inspiration'},'WEATHER_HELD_THROW_CONTEXT_INVALID')
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,6)
})
