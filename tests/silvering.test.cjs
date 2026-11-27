const test=require('node:test'),assert=require('node:assert/strict')
const {fixture,ok,refused}=require('./helpers/ammunition-fixture.cjs')
const gs=require('../mcp-server/dist/mcp-server/game-state.js')
const {getMonsterRecord}=require('../mcp-server/dist/lib/srd/monsters.js')
const source='PHB2014 Silvered Weapons4115–4117 ; atelier physique et durée explicitement établis par le MJ.'
const reason='L’artisan présent possède réellement l’expertise, les matériaux et accepte ce service ; durée non fixée par la source.'
const paid={cp:0,sp:0,ep:0,gp:100,pp:0}
async function service(f,seconds=60){
 f.state.monsters.artisan={...structuredClone(getMonsterRecord('commoner').engine),id:'artisan',position:{x:2,y:2},hostile:false,isAlive:true}
 f.state.dmTools.wallet={cp:0,sp:0,ep:0,gp:500,pp:0}
 return ok(await f.call('establish_silvering_service',{serviceId:'actual-artisan',artisanId:'artisan',workSeconds:seconds,expertiseConfirmed:true,materialsAvailable:true,willing:true,source,reason}))
}
function battle(f,type='wight'){
 f.state.monsters.target={...structuredClone(getMonsterRecord(type).engine),id:'target',position:{x:2,y:2},hp:{current:200,max:200},isAlive:true}
 Object.assign(f.state,{phase:'combat',currentTurn:'player',initiativeOrder:['player','target'],combatGeneration:1})
 delete f.state.monsters.artisan
}
test('real silvering pays exactly100gp and actual adjudicated work time for one existing instance, with idempotent receipt and hydration',async t=>{
 const f=await fixture(t,{weapon:'longsword',quantity:null,startBattle:false,dice:'19'});await service(f)
 const ids=f.state.player.inventory.map(i=>i.id),before=f.state.worldTimeSeconds
 const input={eventId:'silver-real-sword',serviceId:'actual-artisan',paid,weaponItemId:'longsword'},a=ok(await f.call('silver_equipment',input))
 assert.equal(a.seconds,60);assert.equal(f.state.worldTimeSeconds,before+60);assert.equal(f.state.dmTools.wallet.gp,400);assert.equal(f.state.player.inventory.find(i=>i.id==='longsword').silvered,true);assert.deepEqual(f.state.player.inventory.map(i=>i.id),ids)
 const saved=structuredClone(gs.getState());gs.replaceState(saved);const hydrated=structuredClone(gs.getState());assert.equal(ok(await f.call('silver_equipment',input)).replayed,true);assert.deepEqual(gs.getState(),hydrated)
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('absent artisan, incorrect denominations and insufficient purse refuse without work, item changes or dice',async t=>{
 const f=await fixture(t,{weapon:'longsword',quantity:null,startBattle:false,dice:'19'});await service(f)
 await refused(f,'silver_equipment',{eventId:'wrong-price',serviceId:'actual-artisan',paid:{...paid,gp:99},weaponItemId:'longsword'},'SILVERING_PAYMENT_EXACT')
 f.state.dmTools.wallet.gp=99
 await refused(f,'silver_equipment',{eventId:'poor',serviceId:'actual-artisan',paid,weaponItemId:'longsword'},'INSUFFICIENT_COINS')
 delete f.state.monsters.artisan
 await refused(f,'silver_equipment',{eventId:'missing-artisan',serviceId:'actual-artisan',paid,weaponItemId:'longsword'},'SILVERING_ARTISAN_UNAVAILABLE')
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('silvering ten units splits a larger actual stack without coating free extra units or counting its loaded projectile twice',async t=>{
 const f=await fixture(t,{weapon:'shortbow',quantity:15,startBattle:false,dice:'19'});await service(f)
 await refused(f,'silver_equipment',{eventId:'nine',serviceId:'actual-artisan',paid,ammunition:[{itemId:'actual-ammo',quantity:9}]},'SILVERING_TEN_AMMUNITION_REQUIRED')
 const a=ok(await f.call('silver_equipment',{eventId:'ten',serviceId:'actual-artisan',paid,ammunition:[{itemId:'actual-ammo',quantity:10}]})),stock=a.ammunition[0]
 assert.equal(stock.quantity,10);assert.equal(stock.silvered,true);assert.equal(f.stock(),5);assert.equal(f.state.player.inventory.find(i=>i.id==='actual-ammo').silvered,undefined)
 assert.equal(f.state.player.inventory.filter(i=>i.ammunitionType==='arrow').reduce((sum,i)=>sum+i.quantity,0),15)
 assert.ok(f.state.dmTools.ammunition.prepared[stock.id]);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('actual silver weapon bypasses only the real wight silver clause; it does not become magical against generic nonmagic resistance',async t=>{
 const f=await fixture(t,{weapon:'longsword',quantity:null,startBattle:false,dice:'17,8,17,8,19'});await service(f)
 ok(await f.call('silver_equipment',{eventId:'sword-defense',serviceId:'actual-artisan',paid,weaponItemId:'longsword'}));battle(f)
 const a=ok(await f.attack());assert.equal(a.damageDealt,a.damageRoll.total);assert.equal(f.state.player.inventory[0].magical,undefined)
 f.state.monsters.target={...structuredClone(getMonsterRecord('will_o_wisp').engine),id:'target',position:{x:2,y:2},hp:{current:200,max:200},isAlive:true}
 const b=ok(await f.attack());assert.equal(b.damageDealt,Math.floor(b.damageRoll.total/2));assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('a silvered launcher does not silver ordinary ammunition, but an actual coated projectile keeps its immutable defense witness across a held reaction',async t=>{
 const f=await fixture(t,{weapon:'shortbow',quantity:12,startBattle:false,dice:'17,6,8,6,6,19'});await service(f)
 ok(await f.call('silver_equipment',{eventId:'bow-only',serviceId:'actual-artisan',paid,weaponItemId:'shortbow'}))
 const coated=ok(await f.call('silver_equipment',{eventId:'arrows',serviceId:'actual-artisan',paid,ammunition:[{itemId:'actual-ammo',quantity:10}]})).ammunition[0]
 battle(f);f.state.monsters.target.position={x:5,y:2}
 const ordinary=ok(await f.attack());assert.equal(ordinary.damageDealt,Math.floor(ordinary.damageRoll.total/2));assert.equal(ordinary.ammunition.silvered,undefined)
 f.state.hero.inspiration.push({targetId:'player',die:8,expiresAt:f.state.worldTimeSeconds+600})
 const held=ok(await f.attack({ammunitionItemId:coated.id}));assert.ok(held.pendingReaction)
 const saved=structuredClone(gs.getState());saved.player.inventory.find(i=>i.id===coated.id).silvered=false;gs.replaceState(saved)
 const silver=ok(await f.call('resolve_reaction',{pendingId:held.pendingReaction.id,choice:'bardic_inspiration'}));assert.equal(silver.ammunition.silvered,true);assert.equal(silver.damageDealt,silver.damageRoll.total)
 assert.equal(gs.getPlayer().inventory.find(i=>i.id===coated.id).quantity,9);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('battle recovery preserves all-silver coating and requires an explicit bounded composition when ordinary and silver units mixed',async t=>{
 const f=await fixture(t,{weapon:'shortbow',quantity:12,startBattle:false,dice:'17,2,17,2,19'});await service(f)
 const coated=ok(await f.call('silver_equipment',{eventId:'recover-coating',serviceId:'actual-artisan',paid,ammunition:[{itemId:'actual-ammo',quantity:10}]})).ammunition[0]
 battle(f);f.state.monsters.target.position={x:5,y:2};ok(await f.attack());ok(await f.attack({ammunitionItemId:coated.id}))
 Object.assign(f.state,{phase:'exploration',currentTurn:null,initiativeOrder:[]});delete f.state.hero.attackAction
 await refused(f,'recover_ammunition',{recoveryId:'mixed-coating',combatGeneration:1,ammunitionType:'arrow'},'AMMUNITION_RECOVERY_SILVER_COMPOSITION_REQUIRED')
 const recovered=ok(await f.call('recover_ammunition',{recoveryId:'mixed-coating',combatGeneration:1,ammunitionType:'arrow',recoveredSilveredCounts:[{ammunitionType:'arrow',quantity:1}]}))
 assert.equal(recovered.recovery.recoveredQuantity,1);assert.equal(recovered.recovery.allocations[0].silveredQuantity,1)
 const item=f.state.player.inventory.find(i=>i.id===recovered.recovery.allocations[0].silveredItemId);assert.equal(item.silvered,true);assert.equal(item.quantity,1)
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('a real clock boundary preflights silvering before the100gp debit, elapsed work or coating',async t=>{
 const f=await fixture(t,{weapon:'longsword',quantity:null,startBattle:false,dice:'19'});await service(f)
 const {setBreathingContext}=require('../mcp-server/dist/mcp-server/breathing.js')
 setBreathingContext({entityId:'player',eventId:'actual-choking',mode:'choking',reason:'L’air manque réellement pendant cette durée de travail.'})
 await refused(f,'silver_equipment',{eventId:'blocked-work',serviceId:'actual-artisan',paid,weaponItemId:'longsword'},'SUFFOCATION_TIME_BOUNDARY')
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('an all-silver actual battle recovers a deterministic silver stack without an invented second service',async t=>{
 const f=await fixture(t,{weapon:'shortbow',quantity:10,startBattle:false,dice:'17,2,17,2,19'});await service(f)
 const coated=ok(await f.call('silver_equipment',{eventId:'all-coating',serviceId:'actual-artisan',paid,ammunition:[{itemId:'actual-ammo',quantity:10}]})).ammunition[0]
 battle(f);f.state.monsters.target.position={x:5,y:2};ok(await f.attack({ammunitionItemId:coated.id}));ok(await f.attack({ammunitionItemId:coated.id}))
 Object.assign(f.state,{phase:'exploration',currentTurn:null,initiativeOrder:[]});delete f.state.hero.attackAction
 const a=ok(await f.call('recover_ammunition',{recoveryId:'all-silver-return',combatGeneration:1,ammunitionType:'arrow'})),item=f.state.player.inventory.find(i=>i.id===a.recovery.itemId)
 assert.equal(item.quantity,1);assert.equal(item.silvered,true);assert.equal(f.state.dmTools.wallet.gp,400)
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
