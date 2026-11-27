const test=require('node:test'),assert=require('node:assert/strict')
const {fixture,ok,refused}=require('./helpers/ammunition-fixture.cjs')
const gs=require('../mcp-server/dist/mcp-server/game-state.js')
const {listWeapons,getWeapon,attackAbilityFor}=require('../mcp-server/dist/lib/srd/weapons.js')
const {inspectCarriedWeight}=require('../mcp-server/dist/lib/carrying-state.js')
const {AMMUNITION}=require('../mcp-server/dist/lib/srd/ammunition.js')
const {rollWeaponDamage}=require('../mcp-server/dist/mcp-server/weapon-properties.js')
async function setup(t,{weapon='lance',distance=2,dice='17,5,19',object=false,...rest}={}){
 const f=await fixture(t,{startBattle:false,weapon,quantity:null,dice,...rest})
 f.state.monsters.target.position={x:1+distance,y:2}
 if(getWeapon(weapon).properties.includes('heavy'))ok(await f.call('set_carrying_context',{eventId:'standard-real-size',entityId:'player',size:'Medium',reason:'Taille réelle de cet acteur.',source:'Fait physique explicite du scénario.'}))
 if(object)ok(await f.call('create_scene_object',{objectId:'standard-object',name:'Objet réel',description:'Bois effectivement présent.',cell:{x:1+distance,y:2},kind:'container',material:'wood',size:'small',resilience:'resilient'}))
 Object.assign(f.state,{phase:'combat',round:1,currentTurn:'player',initiativeOrder:['player','target'],combatGeneration:1})
 return f
}
test('the PHB table has exactly37 physical profiles plus unarmed, with no item, mass or mastery granted',()=>{
 const weapons=listWeapons(),physical=weapons.filter(w=>w.id!=='unarmed')
 assert.equal(physical.length,37);assert.equal(new Set(weapons.map(w=>w.id)).size,38)
 assert.equal(physical.filter(w=>w.category==='simple').length,14);assert.equal(physical.filter(w=>w.category==='martial').length,23)
 for(const w of physical)if(w.id!=='sling')assert.ok(w.weightLb>0,w.id)
 assert.equal(getWeapon('sling').weightLb,undefined);assert.equal(getWeapon('dart').weightLb,.25)
 assert.equal(getWeapon('blowgun').damageDie,'1');assert.equal(getWeapon('net').damageDie,'0');assert.equal(getWeapon('net').damageType,undefined)
 assert.equal(AMMUNITION['blowgun-needle'].bundleQuantity,50)
})
test('new profiles retain their exact published dice, bands, versatile and heavy properties',()=>{
 for(const [id,die,normal,long,alternate]of [['javelin','1d6',6,24],['light-hammer','1d4',4,12],['spear','1d6',4,12,'1d8'],['dart','1d4',4,12],['sling','1d4',6,24],['trident','1d6',4,12,'1d8'],['blowgun','1',5,20],['heavy-crossbow','1d10',20,80],['longbow','1d8',30,120]]){
  const w=getWeapon(id);assert.equal(w.damageDie,die,id);assert.equal(w.normalRangeCells,normal,id);assert.equal(w.longRangeCells,long,id);assert.equal(w.versatileDamageDie,alternate,id)
 }
 for(const id of ['battleaxe','warhammer'])assert.equal(getWeapon(id).versatileDamageDie,'1d10')
 assert.deepEqual(getWeapon('maul').properties,['heavy','twoHanded'])
 assert.equal(getWeapon('lance').properties.includes('twoHanded'),false,'the special unmounted requirement is not a fictional printed property')
 assert.equal(attackAbilityFor(getWeapon('dart'),{str:18,dex:14}),'str','a ranged finesse dart retains the same finesse ability for attack and damage')
})
test('the actual ranged dart uses finesse, leaves the hand and persists at its real impact cell',async t=>{
 const f=await setup(t,{weapon:'dart',distance:3,dice:'17,3,19'}),answer=ok(await f.attack())
 assert.equal(answer.attackRoll.modifier,7);assert.equal(answer.damageRoll.notation,'1d4+4');assert.equal(answer.damageDealt,7)
 assert.ok(!f.state.player.inventory.some(i=>i.id==='dart'));assert.equal(f.state.dmTools.loadout.mainHandId,undefined)
 assert.deepEqual(f.state.droppedItems.dart.position,f.target.position);assert.equal(f.state.hero.attackAction.remaining,1)
 await refused(f,'resolve_player_attack',{targetId:'target',weaponOrSpell:'dart'},'WEAPON_NOT_OWNED')
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('a complete multiattack cannot throw the same physical ranged dart twice before its first die',async t=>{
 const f=await setup(t,{weapon:'dart',distance:3,dice:'19'})
 await refused(f,'resolve_player_multiattack',{attacks:[{targetId:'target',weaponOrSpell:'dart'},{targetId:'target',weaponOrSpell:'dart'}]},'WEAPON_ALREADY_THROWN')
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('blowgun uses actual counted needles and fixed damage without fictitious damage dice, including a critical',async t=>{
 const f=await fixture(t,{weapon:'blowgun',quantity:2,ammunitionType:'blowgun-needle',dice:'20,17,19'})
 const fixed=1+Math.floor((f.state.player.stats.dex-10)/2),answer=ok(await f.attack());assert.equal(answer.criticalHit,true);assert.equal(answer.damageRoll.total,fixed);assert.deepEqual(answer.damageRoll.rolls,[]);assert.equal(f.stock(),1)
 await refused(f,'resolve_player_attack',{targetId:'target',weaponOrSpell:'blowgun',ammunitionItemId:'actual-ammo'},'LOADING_LIMIT')
 ok(await f.call('use_class_feature',{featureId:'action_surge'}))
 const next=ok(await f.attack({newAttackAction:true}));assert.equal(next.damageRoll.total,fixed);assert.equal(f.stock(),0)
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('the fixed damage helper never doubles a fixed base or consumes a die',()=>{
 assert.deepEqual(rollWeaponDamage('1',-2,true),{notation:'1-2',rolls:[],modifier:-2,total:-1,detail:'1-2 = -1 (dégâts fixes, aucun dé)'})
})
test('sling requires actual bullets and a real free loading hand; its printed weight dash is never zero',async t=>{
 const f=await fixture(t,{weapon:'sling',quantity:1,ammunitionType:'sling-bullet',shield:true,dice:'19'})
 await refused(f,'resolve_player_attack',{targetId:'target',weaponOrSpell:'sling',ammunitionItemId:'actual-ammo'},'AMMUNITION_FREE_HAND_REQUIRED')
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('unmounted lance needs two attacking hands, without a two-slot hold or invented mount',async t=>{
 const f=await setup(t,{distance:1,dice:'17,8,5,19'}),answer=ok(await f.attack())
 assert.equal(answer.weaponHands,2);assert.equal(answer.lanceContext.mounted,false);assert.equal(answer.lanceContext.disadvantage,true)
 assert.match(answer.attackRoll.detail,/^DIS:/);assert.equal(answer.naturalRoll,8);assert.equal(answer.damageRoll.notation,'1d12+4');assert.equal(answer.damageDealt,9)
 assert.equal(f.state.dmTools.loadout.mainHandId,'lance');assert.equal(f.state.dmTools.loadout.offHandId,undefined)
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('a lance at ten feet loses close disadvantage and does not receive the one-hand Dueling bonus',async t=>{
 const f=await setup(t),answer=ok(await f.attack());assert.equal(answer.lanceContext.disadvantage,false);assert.equal(answer.damageRoll.notation,'1d12+4');assert.equal(answer.damageDealt,9)
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('one-hand declaration and an occupied second hand refuse lance before dice and action',async t=>{
 const f=await setup(t,{dice:'19'})
 await refused(f,'resolve_player_attack',{targetId:'target',weaponOrSpell:'lance',weaponHands:1},'TWO_HANDS_REQUIRED')
 f.state.player.inventory.push({id:'real-shield',equipmentId:'shield',name:'Bouclier réel',type:'armor',acBonus:2});f.state.dmTools.loadout.shieldId='real-shield'
 await refused(f,'resolve_player_attack',{targetId:'target',weaponOrSpell:'lance'},'TWO_HANDS_REQUIRED')
 f.state.monsters.target.position={x:2,y:2}
 await refused(f,'resolve_player_multiattack',{attacks:[{targetId:'target',weaponOrSpell:'unarmed'},{targetId:'target',weaponOrSpell:'lance'}]},'TWO_HANDS_REQUIRED')
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('the actual lance object attack uses close disadvantage, two hands and source die',async t=>{
 const f=await setup(t,{distance:1,object:true,dice:'17,8,5,19'}),answer=ok(await f.call('interact_object',{objectId:'standard-object',action:'attack',weaponId:'lance'}))
 assert.equal(answer.weaponHands,2);assert.equal(answer.lanceContext.disadvantage,true);assert.match(answer.attackRoll.detail,/^DIS:/);assert.equal(answer.damageRoll.notation,'1d12+4')
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('lance opportunity uses its real departed ten-foot boundary rather than an adjacent boundary',async t=>{
 const f=await setup(t);f.state.currentTurn='target'
 ok(await f.call('move_token',{tokenId:'target',toCell:{x:4,y:2}}));const pending=f.state.hero.pending
 assert.deepEqual(pending.command.opportunityBoundary.choices.map(choice=>choice.weaponOrSpell),['lance'])
 const answer=ok(await f.call('resolve_reaction',{pendingId:pending.id,choice:'opportunity_attack',weaponOrSpell:'lance'}))
 assert.equal(answer.attack.lanceContext.disadvantage,false);assert.equal(answer.attack.weaponHands,2);assert.equal(f.state.hero.reactionsUsed.player,true);assert.equal(f.state.hero.actionCredits,1)
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('readied lance release retains real close disadvantage and spends one reaction',async t=>{
 const f=await setup(t,{distance:1,dice:'17,8,5,19'}),ready=ok(await f.call('combat_action',{action:'ready',readied:{kind:'attack',weaponId:'lance',trigger:'Quand cet adversaire commence à partir.'}}))
 f.state.currentTurn='target'
 const answer=ok(await f.call('resolve_readied_action',{readyId:ready.readyId,choice:'execute',triggerObserved:'Cet adversaire commence son départ.',targetId:'target'}))
 assert.equal(answer.lanceContext.disadvantage,true);assert.equal(answer.weaponHands,2);assert.equal(f.state.hero.reactionsUsed.player,true);assert.equal(f.state.hero.actionCredits,0)
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
