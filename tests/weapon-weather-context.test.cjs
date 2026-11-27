const test=require('node:test'),assert=require('node:assert/strict')
const {fixture,ok,refused}=require('./helpers/ammunition-fixture.cjs')
const gs=require('../mcp-server/dist/mcp-server/game-state.js')
const {buildPlayerState}=require('../mcp-server/dist/lib/character-registry.js')
const {initialHeroState}=require('../mcp-server/dist/lib/hero-state.js')
const {getMonsterRecord}=require('../mcp-server/dist/lib/srd/monsters.js')
const {weatherContextKey,WeatherStateSchema}=require('../mcp-server/dist/lib/weather-state.js')
const {configureCover}=require('../mcp-server/dist/mcp-server/cover.js')
function weather(f,{wind=true,fog='none'}={}){
 const game=gs.getState(),key=weatherContextKey(game.currentMapId,'firing-room')
 game.dmTools.weather={version:1,contexts:{[key]:{mapId:game.currentMapId,roomId:'firing-room',revision:1,temperatureF:70,strongWind:wind,
   precipitation:'none',sandstorm:false,fog,fogDispersed:wind&&fog!=='none',source:'Conditions physiques réellement établies dans cette salle.',at:game.worldTimeSeconds}},
   profiles:{},clothing:{},events:{},flights:{},receipts:{}}
 assert.equal(WeatherStateSchema.safeParse(game.dmTools.weather).success,true)
 return {key,context:game.dmTools.weather.contexts[key]}
}
function wizard(f){
 const game=gs.getState();game.player=buildPlayerState({characterId:'wizard',level:7,position:{...game.player.position}});game.hero=initialHeroState('wizard',7)
 game.player.knownSpells.push('misty-step');game.dmTools.loadout={unarmoredAC:10}
}
test('actual strong wind applies once to a physical ranged weapon and captures its original source witnesses',async t=>{
 const f=await fixture(t,{dice:'17,16,3,19'}),{key}=weather(f),answer=ok(await f.attack())
 assert.equal(answer.rangedContext.strongWindDisadvantage,true);assert.deepEqual(answer.rangedContext.weatherWitnesses,[{key,revision:1,strongWind:true}])
 assert.match(answer.attackRoll.detail,/^DIS:/);assert.equal(answer.naturalRoll,16);assert.equal(f.stock(),2)
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('an already held wind-affected d20 keeps the original weather through hydration and later real Inspiration',async t=>{
 const f=await fixture(t,{dice:'8,7,6,3,19'}),{key}=weather(f);f.state.hero.inspiration.push({targetId:'player',die:8,expiresAt:600})
 const held=ok(await f.attack()),pending=held.pendingReaction;assert.ok(pending);assert.equal(f.stock(),2)
 const saved=structuredClone(gs.getState());saved.dmTools.weather.contexts[key].strongWind=false;saved.dmTools.weather.contexts[key].revision=2
 gs.replaceState(saved)
 const answer=ok(await f.call('resolve_reaction',{pendingId:pending.id,choice:'bardic_inspiration'}))
 assert.equal(answer.naturalRoll,7);assert.equal(answer.rangedContext.strongWindDisadvantage,true);assert.equal(answer.rangedContext.weatherWitnesses[0].revision,1)
 assert.equal(gs.getPlayer().inventory.find(i=>i.id==='actual-ammo').quantity,2)
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('a malformed held weather witness refuses before its Inspiration die or another ammunition unit',async t=>{
 const f=await fixture(t,{dice:'8,7,6,3,19'});weather(f);f.state.hero.inspiration.push({targetId:'player',die:8,expiresAt:600})
 const held=ok(await f.attack());f.state.hero.pending.command.rangedContext.strongWindDisadvantage=false
 await refused(f,'resolve_reaction',{pendingId:held.pendingReaction.id,choice:'bardic_inspiration'},'WEATHER_HELD_WEAPON_CONTEXT_INVALID')
 assert.equal(f.stock(),2);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,6)
})
test('legacy physical weapon attacks read actual wind without acquiring a modern profile or new stock',async t=>{
 const f=await fixture(t,{legacy:true,dice:'17,16,3,19'});weather(f)
 const answer=ok(await f.attack());assert.match(answer.attackRoll.detail,/^DIS:/);assert.equal(answer.rangedContext.strongWindDisadvantage,true)
 assert.equal(f.stock(),2);assert.equal(gs.getState().hero,undefined);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('the wind penalty is not applied to an actual ranged spell attack',async t=>{
 const f=await fixture(t,{quantity:null,dice:'17,3,4,19'});wizard(f);weather(f)
 const answer=ok(await f.call('cast_spell',{spellId:'ray-of-frost',targetId:'target'})),hit=answer.results[0]
 assert.equal(hit.roll.rolls[0],17);assert.equal(hit.roll.detail.startsWith('DIS:'),false);assert.equal(hit.damageDealt,7)
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('the dedicated acid improvised ranged attack keeps its actual2d6 damage and full action while applying real strong wind',async t=>{
 const f=await fixture(t,{weapon:'mace',quantity:null,dice:'17,16,3,4,19'});weather(f)
 f.state.player.inventory.push({id:'actual-acid',equipmentId:'acid_vial',name:'Acide réellement possédé',type:'misc'})
 const a=ok(await f.call('use_weapon_consumable',{useId:'wind-acid',itemId:'actual-acid',targetKind:'creature',targetId:'target',mode:'throw'}))
 assert.match(a.attackRoll.detail,/^DIS:/);assert.equal(a.rangedContext.strongWindDisadvantage,true);assert.equal(a.damageRoll.total,7);assert.equal(a.damageRoll.notation,'2d6');assert.equal(a.proficiencyApplied,false);assert.equal(f.state.hero.actionCredits,0)
 assert.equal(f.state.player.inventory.some(i=>i.id==='actual-acid'),false);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('a held acid source attack retains original wind through hydration and rejects a tampered witness before its Inspiration die',async t=>{
 const f=await fixture(t,{weapon:'mace',quantity:null,dice:'8,7,8,3,4,19'}),{key}=weather(f)
 f.state.player.inventory.push({id:'actual-acid',equipmentId:'acid_vial',name:'Acide réellement possédé',type:'misc'});f.state.hero.inspiration.push({targetId:'player',die:8,expiresAt:600})
 const a=ok(await f.call('use_weapon_consumable',{useId:'held-wind-acid',itemId:'actual-acid',targetKind:'creature',targetId:'target',mode:'throw'}));assert.ok(a.pendingReaction)
 f.state.hero.pending.command.rangedContext.strongWindDisadvantage=false
 await refused(f,'resolve_reaction',{pendingId:a.pendingReaction.id,choice:'bardic_inspiration'},'WEATHER_HELD_WEAPON_CONTEXT_INVALID')
 f.state.hero.pending.command.rangedContext.strongWindDisadvantage=true
 const saved=structuredClone(f.state);saved.dmTools.weather.contexts[key].strongWind=false;saved.dmTools.weather.contexts[key].revision=2;gs.replaceState(saved)
 const hit=ok(await f.call('resolve_reaction',{pendingId:a.pendingReaction.id,choice:'bardic_inspiration'}));assert.equal(hit.rangedContext.strongWindDisadvantage,true);assert.equal(hit.damageRoll.total,7);assert.equal(hit.naturalRoll,7)
 assert.equal(gs.getPlayer().inventory.some(i=>i.id==='actual-acid'),false);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('actual known airborne height refuses ranged attacks and a complete multiattack before dice, ammo or cost',async t=>{
 const f=await fixture(t,{dice:'19'});weather(f,{wind:false})
 const native=getMonsterRecord('will_o_wisp');assert.ok(native)
 f.state.monsters.target={...structuredClone(native.engine),id:'target',position:{x:5,y:2},hp:{current:200,max:200},isAlive:true}
 f.state.dmTools.weather.flights.target={entityId:'target',mapId:f.state.currentMapId,airborne:true,heightFeet:15,source:'Vol natif observé à quinze pieds au-dessus du plan.',startedAt:0,initialEventId:'actual-height',revision:1,lastPosition:{x:5,y:2}}
 await refused(f,'resolve_player_attack',{targetId:'target',weaponOrSpell:'shortbow',ammunitionItemId:'actual-ammo'},'WEATHER_HEIGHT_3D_TARGETING_UNSUPPORTED')
 f.state.monsters.ground={...structuredClone(getMonsterRecord('goblin').engine),id:'ground',position:{x:4,y:2},hp:{current:200,max:200},isAlive:true};f.state.initiativeOrder.push('ground')
 await refused(f,'resolve_player_multiattack',{attacks:[{targetId:'ground',weaponOrSpell:'shortbow',ammunitionItemId:'actual-ammo'},{targetId:'target',weaponOrSpell:'shortbow',ammunitionItemId:'actual-ammo'}]},'WEATHER_HEIGHT_3D_TARGETING_UNSUPPORTED')
 const before=structuredClone(f.state)
 assert.throws(()=>configureCover({coverId:'no-fake-3d-cover',operation:'set',originId:'player',targetId:'target',obstacleCell:{x:3,y:2},degree:'half',reason:'Obstacle XY sans géométrie verticale représentée.'}),error=>error.code==='WEATHER_HEIGHT_3D_TARGETING_UNSUPPORTED')
 assert.deepEqual(f.state,before);assert.equal(f.stock(),3);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('Misty Step needs actual sight through fog, while a nonsight area spell retains its physical line of effect',async t=>{
 const f=await fixture(t,{quantity:null,dice:'1,1,1,1,1,1,1,1,20,19'});wizard(f);weather(f,{wind:false,fog:'heavy'})
 await refused(f,'cast_spell',{spellId:'misty-step',toCell:{x:2,y:2}},'SPELL_DESTINATION_UNSEEN')
 const before=f.state.player.spellSlots.level3.current,answer=ok(await f.call('cast_spell',{spellId:'fireball',toCell:{x:6,y:2},focusItemId:'component_pouch'}))
 assert.equal(answer.results.length,1);assert.equal(answer.results[0].damageDealt,4);assert.equal(f.state.player.spellSlots.level3.current,before-1)
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
