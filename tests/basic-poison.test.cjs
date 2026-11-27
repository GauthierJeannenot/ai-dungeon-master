const test=require('node:test'),assert=require('node:assert/strict')
const {fixture,ok,refused}=require('./helpers/ammunition-fixture.cjs')
const gs=require('../mcp-server/dist/mcp-server/game-state.js')
const {advanceHeroTime}=require('../mcp-server/dist/mcp-server/hero-rules.js')
const {getMonsterRecord}=require('../mcp-server/dist/lib/srd/monsters.js')
const {carryingItemWeight}=require('../mcp-server/dist/lib/carrying-state.js')
const dose=(id='actual-poison')=>({id,equipmentId:'basic_poison_vial',name:'Poison courant effectivement présent',type:'misc'})
async function setup(t,{weapon='longsword',quantity=null,grantDose=true,atRange=false,...rest}={}){
 const f=await fixture(t,{weapon,quantity,startBattle:false,...rest});if(grantDose)f.state.player.inventory.push(dose())
 if(!atRange)f.target.position={x:2,y:2}
 return f
}
const coat=(f,extra={})=>f.call('coat_weapon_with_poison',{eventId:'actual-coating',vialItemId:'actual-poison',weaponReference:f.state.player.inventory[0].id,...extra})
function combat(f,currentTurn='player'){
 Object.assign(gs.getState(),{phase:'combat',currentTurn,round:1,initiativeOrder:['player','target'],combatGeneration:1,actionUsed:{},bonusActionUsed:{},movementUsed:{}})
 gs.getState().hero.actionCredits=1;delete gs.getState().hero.attackAction
}
test('the public scene-stock→pickup→coating flow consumes one real vial, never assumes its dash mass, and starts the minute after actual application',async t=>{
 const f=await setup(t,{grantDose:false,dice:'19'})
 ok(await f.call('create_scene_object',{objectId:'poison-source',name:'Réserve physique',description:'Une fiole de poison courant réellement présente.',cell:{...f.state.player.position},kind:'container',material:'wood',size:'small',resilience:'fragile',contents:['basic_poison_vial']}))
 const opened=ok(await f.call('interact_object',{objectId:'poison-source',action:'open'})),item=opened.releasedItems[0]
 assert.equal(item.equipmentId,'basic_poison_vial');assert.equal(f.state.player.inventory.some(i=>i.id===item.id),false)
 ok(await f.call('pick_up_item',{itemId:item.id}));assert.equal(carryingItemWeight(f.state,item).weightLb,null)
 const before=f.state.worldTimeSeconds,a=ok(await coat(f,{vialItemId:item.id}))
 assert.equal(a.seconds,6);assert.equal(a.appliedAt,before+6);assert.equal(a.expiresAt,a.appliedAt+60);assert.equal(a.consumedDose,true)
 assert.equal(f.state.player.inventory.some(i=>i.id===item.id),false);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('coating costs one full action, cannot use Extra Attack remainder, and rejects nonsharp weapons or launcher-to-ammunition transfer before dose/time',async t=>{
 const f=await setup(t,{weapon:'mace',dice:'19'});combat(f)
 await refused(f,'coat_weapon_with_poison',{eventId:'blunt',vialItemId:'actual-poison',weaponReference:'mace'},'BASIC_POISON_WEAPON_TYPE_REQUIRED')
 f.state.player.inventory.push({id:'actual-bow',equipmentId:'shortbow',name:'Arc réel',type:'weapon'});f.state.dmTools.loadout.mainHandId='actual-bow'
 await refused(f,'coat_weapon_with_poison',{eventId:'launcher',vialItemId:'actual-poison',weaponReference:'actual-bow'},'BASIC_POISON_LAUNCHER_NOT_PROJECTILE')
 f.state.hero.actionCredits=0;f.state.actionUsed.player=true;f.state.hero.attackAction={id:'actual-old-action',used:1,remaining:1}
 await refused(f,'coat_weapon_with_poison',{eventId:'not-an-attack',vialItemId:'actual-poison',weaponReference:'actual-bow'},'ACTION_ALREADY_USED')
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('an actual combat application spends the action and vial once; identical receipts never refresh or recreate the dose',async t=>{
 const f=await setup(t,{dice:'19'}),original=dose();combat(f)
 const a=ok(await coat(f));assert.equal(a.actionSpent,true);assert.equal(a.seconds,0);assert.equal(f.state.hero.actionCredits,0)
 const before=structuredClone(f.state);assert.equal(ok(await coat(f)).replayed,true);assert.deepEqual(f.state,before)
 f.state.player.inventory.push(original);ok(await f.call('use_subclass_feature',{featureId:'action_surge'}))
 await refused(f,'coat_weapon_with_poison',{eventId:'same-dose-other-event',vialItemId:'actual-poison',weaponReference:'longsword'},'BASIC_POISON_DOSE_ALREADY_SPENT')
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('the same actual coated weapon remains potent across hits for a minute: CON10 then1d4 on failure, no poisoned condition or first-hit depletion',async t=>{
 const f=await setup(t,{dice:'17,2,2,3,17,2,20,19'});ok(await coat(f));combat(f)
 const first=ok(await f.attack());assert.equal(first.basicPoison.save.dc,10);assert.equal(first.basicPoison.save.ability,'con');assert.equal(first.basicPoison.damageRoll.total,3);assert.equal(first.poisonDamageDealt,3)
 const second=ok(await f.attack());assert.equal(second.basicPoison.save.success,true);assert.equal(second.basicPoison.damageRoll,undefined);assert.equal(second.poisonDamageDealt,0)
 assert.equal(second.basicPoison.application.applicationId,first.basicPoison.application.applicationId);assert.deepEqual(f.target.conditions,[]);assert.equal(Object.keys(f.state.dmTools.basicPoison.hits).length,2)
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('a critical doubles only the physical attack dice; the separate failed-save poison remains1d4',async t=>{
 const f=await setup(t,{dice:'20,1,1,2,3,19'});ok(await coat(f));combat(f)
 const a=ok(await f.attack());assert.equal(a.criticalHit,true);assert.equal(a.damageRoll.rolls.length,2);assert.equal(a.basicPoison.damageRoll.notation,'1d4');assert.equal(a.basicPoison.damageRoll.rolls.length,1)
 assert.equal(a.damageDealt,a.weaponDamageDealt+3);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('a melee nonlethal declaration never converts the subsequent separate poison-save damage into a knockout',async t=>{
 const f=await setup(t,{dice:'17,2,2,3,19'});ok(await coat(f));combat(f)
 f.state.player.stats.str=10;f.target.hp.current=3
 const a=ok(await f.attack({weaponHands:2,nonlethal:true}))
 assert.equal(a.weaponDamageDealt,2);assert.equal(a.basicPoison.damageResolution.hpBefore,1);assert.equal(a.poisonDamageDealt,3)
 assert.equal(a.targetDied,true);assert.equal(a.targetKnockedOut,false);assert.equal(f.target.isAlive,false);assert.equal(f.target.knockout,undefined)
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('at the exact real drying boundary a hit has no retroactive poison save or damage',async t=>{
 const f=await setup(t,{dice:'17,2,19'});const a=ok(await coat(f));advanceHeroTime(60);assert.equal(f.state.worldTimeSeconds,a.expiresAt);combat(f)
 const hit=ok(await f.attack());assert.equal(hit.basicPoison,undefined);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('a missing actual dose and a real choking clock boundary refuse before application, time, inventory changes or dice',async t=>{
 const f=await setup(t,{dice:'19'})
 await refused(f,'coat_weapon_with_poison',{eventId:'missing',vialItemId:'not-owned',weaponReference:'longsword'},'BASIC_POISON_REAL_DOSE_REQUIRED')
 const {setBreathingContext}=require('../mcp-server/dist/mcp-server/breathing.js');f.state.player.stats.con=8;setBreathingContext({entityId:'player',eventId:'actual-no-air',mode:'choking',reason:'Privation réelle d’air pendant cette manipulation.'})
 advanceHeroTime(1)
 await refused(f,'coat_weapon_with_poison',{eventId:'clock-blocked',vialItemId:'actual-poison',weaponReference:'longsword'},'ACTIVITY_BREATHING_BOUNDARY')
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('source poison damage immunity applies, while an isolated immunity to the poisoned condition never removes this saving-throw damage',async t=>{
 const f=await setup(t,{dice:'17,2,2,3,17,2,2,3,19'});ok(await coat(f));combat(f)
 f.state.monsters.target={...structuredClone(getMonsterRecord('skeleton').engine),id:'target',position:{x:2,y:2},hp:{current:200,max:200},isAlive:true}
 const immune=ok(await f.attack());assert.equal(immune.basicPoison.save.success,false);assert.equal(immune.poisonDamageDealt,0);assert.equal(immune.basicPoison.damageRoll.total,3)
 const goblin=getMonsterRecord('goblin'),old=structuredClone(goblin.source.condition_immunities)
 t.after(()=>goblin.source.condition_immunities=old)
 // Controlled source fixture isolates condition immunity from damage immunity;
 // no production creature definition is added or rewritten.
 goblin.source.condition_immunities=[...old,{index:'poisoned',name:'Poisoned',url:'/api/conditions/poisoned'}]
 f.state.monsters.target={...structuredClone(goblin.engine),id:'target',position:{x:2,y:2},hp:{current:200,max:200},isAlive:true}
 assert.equal(require('../mcp-server/dist/mcp-server/monster-rules.js').conditionImmune(f.state.monsters.target,'poisoned'),true)
 const conditionOnly=ok(await f.attack());assert.equal(conditionOnly.basicPoison.save.success,false);assert.equal(conditionOnly.poisonDamageDealt,3);assert.equal(f.state.monsters.target.conditions.includes('poisoned'),false)
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('actual antitoxin grants advantage against this damage-poison CON save without inventing a poisoned condition',async t=>{
 const f=await setup(t,{dice:'17,2,2,20,19'});ok(await coat(f));combat(f)
 f.state.hero.effects.push({id:'actual-antitoxin',kind:'antitoxin',sourceId:'target',targetIds:['target'],expiresAt:3600,concentration:false,data:{}})
 const a=ok(await f.attack());assert.match(a.basicPoison.save.roll.detail,/^ADV:/);assert.equal(a.basicPoison.save.success,true);assert.equal(a.poisonDamageDealt,0)
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('a poison-save Inspiration pause keeps the already committed physical hit/action through hydration and never rolls or damages that attack twice',async t=>{
 const f=await setup(t,{dice:'17,2,5,6,19'});ok(await coat(f));combat(f);f.state.hero.inspiration.push({targetId:'target',die:8,expiresAt:600})
 const beforeHp=f.target.hp.current,held=ok(await f.attack()),pending=held.pendingReaction;assert.equal(pending.command.type,'save')
 const hit=Object.values(f.state.dmTools.basicPoison.hits)[0];assert.equal(f.target.hp.current,beforeHp-hit.baseAttack.damageDealt);assert.equal(f.state.hero.attackAction.used,1)
 gs.replaceState(structuredClone(f.state));const a=ok(await f.call('resolve_reaction',{pendingId:pending.id,choice:'bardic_inspiration'}))
 assert.equal(a.basicPoison.save.success,true);assert.equal(a.basicPoison.save.roll.rolls[0],5);assert.equal(gs.getState().monsters.target.hp.current,beforeHp-a.weaponDamageDealt);assert.equal(gs.getState().hero.attackAction.used,1)
 await refused(f,'resolve_reaction',{pendingId:pending.id,choice:'decline'},'REACTION_TRIGGER_INVALID')
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('the original explicit Extra Attack sequence resumes after a poison-save pause with exactly two physical attacks and saves',async t=>{
 const f=await setup(t,{dice:'17,2,5,1,3,17,2,20,19'});ok(await coat(f));combat(f);f.state.hero.inspiration.push({targetId:'target',die:8,expiresAt:600})
 const held=ok(await f.call('resolve_player_multiattack',{attacks:[{targetId:'target',weaponOrSpell:'longsword'},{targetId:'target',weaponOrSpell:'longsword'}]}));assert.ok(held.pendingReaction)
 const a=ok(await f.call('resolve_reaction',{pendingId:held.pendingReaction.id,choice:'bardic_inspiration'}));assert.equal(a.attacks.length,2);assert.equal(a.attacks[0].poisonDamageDealt,3);assert.equal(a.attacks[1].poisonDamageDealt,0)
 assert.equal(f.state.hero.attackAction.used,2);assert.equal(Object.keys(f.state.dmTools.basicPoison.hits).length,2);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('up to three actual silvered projectile units split without extra stock, and only the chosen coated projectile carries poison',async t=>{
 const f=await setup(t,{weapon:'shortbow',quantity:5,atRange:true,dice:'17,2,2,3,17,2,19',additionalAmmo:[{itemId:'second-arrow-stack',quantity:1}]})
 f.state.player.inventory.find(i=>i.id==='actual-ammo').silvered=true
 await refused(f,'coat_weapon_with_poison',{eventId:'four-units',vialItemId:'actual-poison',ammunitionTargets:[{ammunitionItemId:'actual-ammo',quantity:3},{ammunitionItemId:'actual-ammo',quantity:1}]},'BASIC_POISON_TARGET_DUPLICATE')
 await refused(f,'coat_weapon_with_poison',{eventId:'four-distinct-units',vialItemId:'actual-poison',ammunitionTargets:[{ammunitionItemId:'actual-ammo',quantity:3},{ammunitionItemId:'second-arrow-stack',quantity:1}]},'BASIC_POISON_UP_TO_THREE_REQUIRED')
 const applied=ok(await coat(f,{weaponReference:undefined,ammunitionTargets:[{ammunitionItemId:'actual-ammo',quantity:3}]})),coated=applied.ammunition[0]
 assert.equal(f.stock(),2);assert.equal(coated.quantity,3);assert.equal(coated.silvered,true);assert.equal(f.state.player.inventory.filter(i=>i.ammunitionType==='arrow').reduce((n,i)=>n+i.quantity,0),6)
 combat(f);const a=ok(await f.attack({ammunitionItemId:coated.id}));assert.ok(a.ammunition.basicPoison);assert.equal(a.ammunition.silvered,true);assert.equal(a.poisonDamageDealt,3)
 const b=ok(await f.attack());assert.equal(b.basicPoison,undefined);assert.equal(b.ammunition.basicPoison,undefined);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('a freshly poisoned reserved sling unit remains one physical silver projectile and can be explicitly unloaded separately without spreading poison to its original stack',async t=>{
 const f=await setup(t,{weapon:'sling',quantity:3,ammunitionType:'sling-bullet',atRange:true,dice:'17,2,2,3,19'})
 f.state.player.inventory.find(i=>i.id==='actual-ammo').silvered=true
 ok(await f.call('manage_sling_projectile',{eventId:'load-one',hostItemId:'sling',operation:'load',ammunitionItemId:'actual-ammo'}));assert.equal(f.stock(),2)
 ok(await coat(f,{weaponReference:undefined,ammunitionTargets:[{loadedHostItemId:'sling'}]}))
 await refused(f,'manage_sling_projectile',{eventId:'bad-merge',hostItemId:'sling',operation:'unload'},'SLING_POISON_STACK_MISMATCH')
 const transfer=ok(await f.call('manage_sling_projectile',{eventId:'separate-one',hostItemId:'sling',operation:'unload',separate:true})),unit=transfer.unloadedItem
 assert.equal(unit.quantity,1);assert.equal(unit.silvered,true);assert.equal(f.stock(),2);assert.equal(f.state.dmTools.improvised.loads.sling,undefined)
 combat(f);const a=ok(await f.attack({ammunitionItemId:unit.id}));assert.ok(a.ammunition.basicPoison);assert.equal(a.ammunition.silvered,true);assert.equal(a.poisonDamageDealt,3)
 assert.equal(f.state.player.inventory.find(i=>i.id===unit.id).quantity,0);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('firing the exact already loaded poisoned sling unit keeps its own coating witness and spends no second original-stock unit',async t=>{
 const f=await setup(t,{weapon:'sling',quantity:3,ammunitionType:'sling-bullet',atRange:true,dice:'17,2,2,3,19'})
 ok(await f.call('manage_sling_projectile',{eventId:'load-poison-shot',hostItemId:'sling',operation:'load',ammunitionItemId:'actual-ammo'}))
 ok(await coat(f,{weaponReference:undefined,ammunitionTargets:[{loadedHostItemId:'sling'}]}));combat(f)
 const a=ok(await f.attack({ammunitionItemId:'sling'}));assert.equal(a.ammunition.loadedHostItemId,'sling');assert.ok(a.ammunition.basicPoison);assert.equal(a.poisonDamageDealt,3);assert.equal(f.stock(),2);assert.equal(f.state.dmTools.improvised.loads.sling,undefined)
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('a legitimately coated striking surface on a launcher does not transfer poison into an ordinary arrow',async t=>{
 const f=await setup(t,{weapon:'shortbow',quantity:3,atRange:true,dice:'17,3,19'})
 ok(await f.call('adjudicate_improvised_weapon',{referenceId:'actual-bow-point',targetKind:'item',targetId:'shortbow',mode:'melee',damageType:'piercing',allowProficiency:false,hands:2,
  source:'Surface physique pointue réellement établie sur cet objet.',reason:'Usage de contact explicite du MJ ; aucun projectile n’est enduit.'}))
 ok(await coat(f,{weaponReference:'actual-bow-point'}));combat(f)
 const a=ok(await f.attack());assert.equal(a.ammunition.basicPoison,undefined);assert.equal(a.basicPoison,undefined);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('a readied coated dagger is really thrown once and its own subsequent poison save never reacquires the dropped item',async t=>{
 const f=await setup(t,{weapon:'dagger',atRange:true,dice:'17,2,2,3,19'});ok(await coat(f));combat(f)
 const ready=ok(await f.call('combat_action',{action:'ready',readied:{kind:'attack',weaponId:'dagger',attackMode:'thrown',trigger:'Un signal visible précisément établi.'}}))
 const a=ok(await f.call('resolve_readied_action',{readyId:ready.readyId,choice:'execute',triggerObserved:'Le signal visible a réellement lieu.',targetId:'target',weaponAbility:'dex'}))
 assert.equal(a.attackMode,'thrown');assert.equal(a.poisonDamageDealt,3);assert.equal(f.state.player.inventory.some(item=>item.id==='dagger'),false);assert.equal(f.state.droppedItems.dagger.item.id,'dagger');assert.equal(f.state.hero.reactionsUsed.player,true)
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('an actual coated opportunity attack can pause on its poison save and then resume only the original selected movement',async t=>{
 const f=await setup(t,{dice:'17,2,5,1,3,19'});ok(await coat(f));combat(f,'target');f.state.hero.inspiration.push({targetId:'target',die:8,expiresAt:600})
 ok(await f.call('move_token',{tokenId:'target',toCell:{x:3,y:2}}));const offered=f.state.hero.pending;assert.equal(offered.command.type,'movement')
 const initial=ok(await f.call('resolve_reaction',{pendingId:offered.id,choice:'opportunity_attack',weaponOrSpell:'longsword'}));assert.equal(initial.pendingReaction.command.type,'save');assert.deepEqual(f.target.position,{x:2,y:2})
 const a=ok(await f.call('resolve_reaction',{pendingId:initial.pendingReaction.id,choice:'bardic_inspiration'}));assert.equal(a.attack.poisonDamageDealt,3);assert.deepEqual(f.state.monsters.target.position,{x:3,y:2});assert.equal(f.state.hero.reactionsUsed.player,true);assert.equal(f.state.hero.actionCredits,1)
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('the real other-hand bonus attack keeps its poison-save pause and final damage receipt across exact retries',async t=>{
 const f=await setup(t,{weapon:'dagger',additionalWeapons:['shortsword'],dice:'17,2,17,2,2,1,3,19'})
 ok(await f.call('equip_item',{itemId:'dagger',operation:'unequip',slot:'main_hand'}));ok(await f.call('equip_item',{itemId:'shortsword',operation:'equip',slot:'main_hand'}))
 ok(await coat(f,{weaponReference:'shortsword'}))
 ok(await f.call('equip_item',{itemId:'shortsword',operation:'unequip',slot:'main_hand'}));ok(await f.call('equip_item',{itemId:'dagger',operation:'equip',slot:'main_hand'}));ok(await f.call('equip_item',{itemId:'shortsword',operation:'equip',slot:'off_hand'}))
 combat(f);f.state.hero.inspiration.push({targetId:'target',die:8,expiresAt:600})
 const primary=ok(await f.attack()),choice={attackId:'actual-poison-bonus',primaryAttackId:primary.primaryAttackId,weaponItemId:'shortsword',targetId:'target',attackMode:'melee',weaponAbility:'dex'}
 const held=ok(await f.call('resolve_two_weapon_attack',choice));assert.equal(held.pendingReaction.command.type,'save')
 const before=structuredClone(f.state),replay=ok(await f.call('resolve_two_weapon_attack',choice));assert.equal(replay.alreadyPending,true);assert.deepEqual(f.state,before)
 const a=ok(await f.call('resolve_reaction',{pendingId:held.pendingReaction.id,choice:'bardic_inspiration'}));assert.equal(a.weaponDamageDealt,2);assert.equal(a.poisonDamageDealt,3);assert.equal(a.damageDealt,5)
 const finished=structuredClone(f.state),again=ok(await f.call('resolve_two_weapon_attack',choice));assert.equal(again.alreadyResolved,true);assert.equal(again.poisonDamageDealt,3);assert.deepEqual(f.state,finished)
 assert.equal(f.state.bonusActionUsed.player,true);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('an old held physical attack without a poison-time witness is not retroactively given a current coating effect',async t=>{
 const f=await setup(t,{dice:'8,6,2,19'});ok(await coat(f));combat(f);f.state.hero.inspiration.push({targetId:'player',die:8,expiresAt:600})
 const held=ok(await f.attack());delete f.state.hero.pending.command.basicPoisonContext;gs.replaceState(structuredClone(f.state))
 const a=ok(await f.call('resolve_reaction',{pendingId:held.pendingReaction.id,choice:'bardic_inspiration'}));assert.equal(a.basicPoison,undefined);assert.equal(Object.keys(gs.getState().dmTools.basicPoison.hits).length,0)
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('an explicitly persisted coating on a legacy physical attack uses the same real save/damage without granting a modern hero profile',async t=>{
 const f=await setup(t,{dice:'17,2,2,3,19'});ok(await coat(f));combat(f);delete f.state.hero;delete f.state.player.ruleset
 const a=ok(await f.call('resolve_attack',{attackerId:'player',targetId:'target',weaponOrSpell:'longsword'}));assert.equal(a.poisonDamageDealt,3);assert.equal(f.state.hero,undefined);assert.equal(f.state.player.ruleset,undefined)
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('the possible poison CON save is preflighted before the physical attack die and cost when the target has an unproven exhaustion marker',async t=>{
 const f=await setup(t,{dice:'19'});ok(await coat(f));combat(f);f.target.conditions.push('exhaustion')
 await refused(f,'resolve_player_attack',{targetId:'target',weaponOrSpell:'longsword'},'EXHAUSTION_LEVEL_REQUIRED')
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('hydration rejects a coating with an invented application identity without changing the real dose history or consuming a die',async t=>{
 const f=await setup(t,{dice:'19'});ok(await coat(f));const before=structuredClone(f.state),bad=structuredClone(f.state)
 Object.values(bad.dmTools.basicPoison.coatings)[0].applicationId='invented-dose'
 assert.throws(()=>gs.replaceState(bad),error=>error.code==='BASIC_POISON_STATE_MISMATCH');assert.deepEqual(gs.getState(),before)
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('a real object hit has no creature poison save and does not consume the still-potent weapon coating',async t=>{
 const f=await setup(t,{dice:'17,2,17,2,2,3,19'});ok(await coat(f))
 ok(await f.call('create_scene_object',{objectId:'actual-wood',name:'Bois réel',description:'Objet en bois sans créature cachée.',cell:{x:2,y:1},kind:'container',material:'wood',size:'small',resilience:'fragile'}))
 const object=ok(await f.call('interact_object',{objectId:'actual-wood',action:'attack',weaponId:'longsword'}));assert.equal(object.basicPoison,undefined);assert.equal(Object.keys(f.state.dmTools.basicPoison.hits).length,0)
 combat(f);const hit=ok(await f.attack());assert.equal(hit.poisonDamageDealt,3);assert.equal(Object.keys(f.state.dmTools.basicPoison.hits).length,1)
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('a projectile recovered after the real search minute retains no newly granted poison potency',async t=>{
 const f=await setup(t,{weapon:'shortbow',quantity:2,atRange:true,dice:'17,2,20,17,2,20,17,2,19'})
 const coated=ok(await coat(f,{weaponReference:undefined,ammunitionTargets:[{ammunitionItemId:'actual-ammo',quantity:2}]})).ammunition[0]
 combat(f);ok(await f.attack({ammunitionItemId:coated.id}));ok(await f.attack({ammunitionItemId:coated.id}))
 ok(await f.call('end_combat',{force:true,reason:'La créature se retire réellement du combat.'}))
 const recovered=ok(await f.call('recover_ammunition',{recoveryId:'actual-poison-search',combatGeneration:1,ammunitionType:'arrow'}));assert.equal(recovered.recovery.recoveredQuantity,1)
 assert.ok(f.state.worldTimeSeconds>=f.state.dmTools.basicPoison.applications['actual-coating'].expiresAt)
 const target=ok(await f.call('spawn_monster',{monsterType:'goblin',cell:{x:5,y:2},hpOverride:200}))
 combat(f);f.state.combatGeneration=2;f.state.initiativeOrder=['player',target.id]
 const a=ok(await f.attack({targetId:target.id,ammunitionItemId:recovered.recovery.itemId}));assert.equal(a.basicPoison,undefined);assert.equal(a.ammunition.basicPoison,undefined);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
