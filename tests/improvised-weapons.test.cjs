const test=require('node:test'),assert=require('node:assert/strict')
const {fixture,ok,refused}=require('./helpers/ammunition-fixture.cjs')
const gs=require('../mcp-server/dist/mcp-server/game-state.js')
const {getAbilityModifier}=require('../mcp-server/dist/mcp-server/dice.js')
const {weaponForReference}=require('../mcp-server/dist/mcp-server/equipment.js')
const {weaponProficiency}=require('../mcp-server/dist/lib/weapon-proficiency.js')
const {carryingItemWeight}=require('../mcp-server/dist/lib/carrying-state.js')
const {opportunityBoundary}=require('../mcp-server/dist/mcp-server/opportunity-boundary.js')
const {getMonsterRecord}=require('../mcp-server/dist/lib/srd/monsters.js')
const source='PHB2014 Improvised Weapons4107–4113 ; forme physique réellement établie par le MJ.'
const reason='Objet réel du scénario, sans création, don, dégâts de masse ou interprétation du message joueur.'
function ruling(targetId,extra={}){return{referenceId:'actual-improvised',targetKind:'item',targetId,mode:'melee',allowProficiency:false,damageType:'bludgeoning',hands:1,source,reason,...extra}}
function actualPan(f){f.state.player.inventory.push({id:'actual-pan',name:'Poêle réelle',type:'misc'});f.state.dmTools.loadout.mainHandId='actual-pan';f.target.position={x:2,y:2}}
test('a real raw improvised object has1d4, explicit type, actual STR and no free class/feat proficiency',async t=>{
 const f=await fixture(t,{weapon:'mace',quantity:null,dice:'12,4,19'});actualPan(f)
 const before=structuredClone(f.state.player.inventory);ok(await f.call('adjudicate_improvised_weapon',ruling('actual-pan')))
 assert.deepEqual(f.state.player.inventory,before);const profile=weaponForReference('actual-improvised')
 assert.equal(profile.damageDie,'1d4');assert.equal(weaponProficiency(f.state.player,profile).proficiencyBonus,0)
 const answer=ok(await f.attack({weaponOrSpell:'actual-improvised'}));assert.equal(answer.attackRoll.modifier,getAbilityModifier(f.state.player.stats.str));assert.equal(answer.damageRoll.rolls.length,1)
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('another appropriate damage type needs a real exact-instance physical fact and grants no magic, condition or ongoing damage',async t=>{
 const f=await fixture(t,{weapon:'mace',quantity:null,dice:'17,3,19'});actualPan(f)
 const fact=ok(await f.call('record_scene_fact',{description:'Cette instance réelle est un bloc de métal effectivement gelé ; le contact froid est physiquement établi.',cell:{...f.state.player.position}})).worldFact
 assert.equal(fact.subjectItemId,undefined)
 ok(await f.call('adjudicate_improvised_weapon',ruling('actual-pan',{damageType:'cold',physicalFactId:fact.id})))
 const a=ok(await f.attack({weaponOrSpell:'actual-improvised'}));assert.equal(weaponForReference('actual-improvised').damageType,'cold');assert.equal(a.damageRoll.rolls.length,1);assert.deepEqual(f.target.conditions,[]);assert.equal(f.state.player.inventory.find(i=>i.id==='actual-pan').magical,undefined)
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('a changed exact-instance elemental fact refuses a held attack before the real Inspiration die',async t=>{
 const f=await fixture(t,{weapon:'mace',quantity:null,dice:'8,6,3,19'});actualPan(f)
 await refused(f,'adjudicate_improvised_weapon',ruling('actual-pan',{damageType:'cold'}),'IMPROVISED_DAMAGE_FACT_REQUIRED')
 f.state.worldFacts.push({id:'actual-cold-instance',subjectItemId:'actual-pan',text:'Métal réellement gelé dans cette instance.',source:'Mesure physique MJ.',mapId:f.state.currentMapId,expires:'never'})
 ok(await f.call('adjudicate_improvised_weapon',ruling('actual-pan',{damageType:'cold',physicalFactId:'actual-cold-instance'})))
 f.state.hero.inspiration.push({targetId:'player',die:8,expiresAt:600});const held=ok(await f.attack({weaponOrSpell:'actual-improvised'}))
 f.state.worldFacts.find(fact=>fact.id==='actual-cold-instance').text='Cette instance a réellement été réchauffée.'
 await refused(f,'resolve_reaction',{pendingId:held.pendingReaction.id,choice:'bardic_inspiration'},'IMPROVISED_DAMAGE_FACT_CHANGED')
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,6)
})
test('the burning-torch and actual acid-specific procedures cannot be replaced by free generic1d4 effects',async t=>{
 const f=await fixture(t,{weapon:'mace',quantity:null,dice:'19'});f.target.position={x:2,y:2}
 f.state.player.inventory.push({id:'actual-torch',equipmentId:'torch',name:'Torche réelle',type:'misc'},{id:'actual-acid',equipmentId:'acid_vial',name:'Fiole réelle',type:'misc'})
 f.state.dmTools.loadout.mainHandId='actual-torch';f.state.dmTools.lighting={ambient:{},sources:{'actual-torch':{itemId:'actual-torch',kind:'torch',remainingSeconds:3600,litAt:0}}}
 ok(await f.call('adjudicate_improvised_weapon',ruling('actual-torch')))
 await refused(f,'resolve_player_attack',{targetId:'target',weaponOrSpell:'actual-improvised'},'IMPROVISED_SPECIFIC_SOURCE_PROCEDURE_REQUIRED')
 f.state.dmTools.loadout.mainHandId='actual-acid';f.state.worldFacts.push({id:'actual-acid-fact',subjectItemId:'actual-acid',text:'La fiole contient réellement son acide.',source:'Contenu physique réel.',mapId:f.state.currentMapId,expires:'never'})
 ok(await f.call('adjudicate_improvised_weapon',ruling('actual-acid',{referenceId:'acid-generic-refused',damageType:'acid',physicalFactId:'actual-acid-fact'})))
 await refused(f,'resolve_player_attack',{targetId:'target',weaponOrSpell:'acid-generic-refused'},'IMPROVISED_SPECIFIC_SOURCE_PROCEDURE_REQUIRED')
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('similarity inherits only the explicitly selected published profile and actual acquired proficiency',async t=>{
 const f=await fixture(t,{weapon:'mace',quantity:null,dice:'17,3,19'});actualPan(f)
 ok(await f.call('adjudicate_improvised_weapon',ruling('actual-pan',{mode:'similar',profileId:'club',damageType:undefined,allowProficiency:true})))
 const profile=weaponForReference('actual-improvised');assert.equal(profile.damageDie,'1d4');assert.ok(profile.properties.includes('light'));assert.equal(weaponProficiency(f.state.player,profile).proficiencyBonus,3)
 const a=ok(await f.attack({weaponOrSpell:'actual-improvised'}));assert.equal(a.attackRoll.modifier,getAbilityModifier(f.state.player.stats.str)+3)
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('a non-Thrown melee weapon really thrown uses generic1d4, DEX20/60 and leaves its exact hand',async t=>{
 const f=await fixture(t,{weapon:'longsword',quantity:null,dice:'17,16,2,19'});f.target.position={x:6,y:2}
 await refused(f,'resolve_player_attack',{targetId:'target',weaponOrSpell:'longsword',attackMode:'thrown'},'WEAPON_NOT_THROWABLE')
 ok(await f.call('adjudicate_improvised_weapon',ruling('longsword',{mode:'thrown',damageType:'slashing'})))
 const a=ok(await f.attack({weaponOrSpell:'actual-improvised'}));assert.equal(a.rangedContext.normalRangeCells,4);assert.equal(a.rangedContext.longRangeCells,12);assert.match(a.attackRoll.detail,/^DIS:/)
 assert.equal(a.attackRoll.modifier,getAbilityModifier(f.state.player.stats.dex));assert.equal(a.damageRoll.rolls.length,1)
 assert.ok(!f.state.player.inventory.some(i=>i.id==='longsword'));assert.equal(f.state.droppedItems.longsword.item.id,'longsword');assert.equal(f.state.dmTools.loadout.mainHandId,undefined)
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('a ranged weapon used in melee rolls improvised1d4 without a fictitious projectile or shot',async t=>{
 const f=await fixture(t,{weapon:'shortbow',quantity:null,dice:'17,4,19'});f.target.position={x:2,y:2}
 ok(await f.call('adjudicate_improvised_weapon',ruling('shortbow',{hands:2})))
 const a=ok(await f.attack({weaponOrSpell:'actual-improvised'}));assert.equal(a.weaponHands,2);assert.equal(a.rangedContext,undefined);assert.equal(a.ammunition,undefined);assert.equal(a.damageRoll.rolls.length,1)
 assert.equal(Object.keys(f.state.dmTools.ammunition?.expenditures??{}).length,0);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('unknown ownership, lost actual grip and worn-shield throws refuse before dice or actions',async t=>{
 const f=await fixture(t,{weapon:'mace',quantity:null,shield:true,dice:'19'});actualPan(f)
 await refused(f,'adjudicate_improvised_weapon',ruling('not-present'),'IMPROVISED_PHYSICAL_OBJECT_REQUIRED')
 ok(await f.call('adjudicate_improvised_weapon',ruling('actual-pan')));delete f.state.dmTools.loadout.mainHandId
 await refused(f,'resolve_player_attack',{targetId:'target',weaponOrSpell:'actual-improvised'},'IMPROVISED_OBJECT_NOT_HELD')
 ok(await f.call('adjudicate_improvised_weapon',ruling('actual-shield',{referenceId:'thrown-shield',mode:'thrown'})))
 await refused(f,'resolve_player_attack',{targetId:'target',weaponOrSpell:'thrown-shield'},'ITEM_EQUIPPED')
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('a held improvised attack keeps its immutable ruling/target through hydration and refuses tampering before Inspiration',async t=>{
 const f=await fixture(t,{weapon:'mace',quantity:null,dice:'8,6,4,19'});actualPan(f);ok(await f.call('adjudicate_improvised_weapon',ruling('actual-pan')))
 f.state.hero.inspiration.push({targetId:'player',die:8,expiresAt:600});const held=ok(await f.attack({weaponOrSpell:'actual-improvised'}));assert.ok(held.pendingReaction)
 const saved=structuredClone(f.state);gs.replaceState(saved);gs.getState().hero.pending.command.improvisedContext.targetCell.x=3
 await refused(f,'resolve_reaction',{pendingId:held.pendingReaction.id,choice:'bardic_inspiration'},'IMPROVISED_HELD_CONTEXT_INVALID')
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,6)
})
test('Ready stores the explicit improvised usage and OA offers the actual chosen melee reference separately',async t=>{
 const f=await fixture(t,{weapon:'mace',quantity:null,dice:'17,3,19'});actualPan(f);ok(await f.call('adjudicate_improvised_weapon',ruling('actual-pan')))
 const boundary=opportunityBoundary(f.state.player,'target',{x:2,y:2},{x:3,y:2});assert.ok(boundary.choices.some(c=>c.weaponOrSpell==='actual-improvised'))
 const ready=ok(await f.call('combat_action',{action:'ready',readied:{kind:'attack',weaponId:'actual-improvised',trigger:'La créature franchit le seuil visible.'}}))
 assert.equal(ready.effect.data.readied.weaponId,'actual-improvised')
 const a=ok(await f.call('resolve_readied_action',{readyId:ready.readyId,choice:'execute',triggerObserved:'Franchissement réellement observé du seuil.',targetId:'target'}))
 assert.equal(a.weaponOrSpell,'actual-improvised');assert.equal(a.damageRoll.rolls.length,1);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('Ready preserves an explicitly chosen similar Thrown profile and its actual throw mode without parsing the trigger',async t=>{
 const f=await fixture(t,{weapon:'mace',quantity:null,dice:'17,3,19'});actualPan(f);f.target.position={x:5,y:2}
 ok(await f.call('adjudicate_improvised_weapon',ruling('actual-pan',{mode:'similar',profileId:'light-hammer',damageType:undefined,allowProficiency:true})))
 const ready=ok(await f.call('combat_action',{action:'ready',readied:{kind:'attack',weaponId:'actual-improvised',attackMode:'thrown',trigger:'Le signal visible a réellement lieu.'}}))
 const a=ok(await f.call('resolve_readied_action',{readyId:ready.readyId,choice:'execute',triggerObserved:'Signal réellement observé.',targetId:'target'}))
 assert.equal(a.attackMode,'thrown');assert.equal(a.rangedContext.normalRangeCells,4);assert.equal(a.thrownItem.item.id,'actual-pan');assert.equal(f.state.player.inventory.some(i=>i.id==='actual-pan'),false)
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('an actual departing opponent exposes the improvised OA choice and the explicit reaction resolves that exact strike before movement resumes',async t=>{
 const f=await fixture(t,{weapon:'mace',quantity:null,dice:'17,3,19'});actualPan(f);ok(await f.call('adjudicate_improvised_weapon',ruling('actual-pan')))
 f.state.currentTurn='target'
 ok(await f.call('move_token',{tokenId:'target',toCell:{x:3,y:2}}));const pending=f.state.hero.pending
 assert.ok(pending);assert.ok(pending.command.opportunityBoundary.choices.some(c=>c.weaponOrSpell==='actual-improvised'))
 const a=ok(await f.call('resolve_reaction',{pendingId:pending.id,choice:'opportunity_attack',weaponOrSpell:'actual-improvised'}))
 assert.equal(a.attack.weaponOrSpell,'actual-improvised');assert.deepEqual(f.state.monsters.target.position,{x:3,y:2});assert.equal(f.state.hero.reactionsUsed.player,true)
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('an admissible actual object attack uses the explicit improvised melee profile without changing the physical inventory type',async t=>{
 const f=await fixture(t,{weapon:'mace',quantity:null,startBattle:false,dice:'17,3,19'});actualPan(f)
 ok(await f.call('create_scene_object',{objectId:'actual-wood',name:'Bois réel',description:'Objet en bois présent.',cell:{x:2,y:1},kind:'container',material:'wood',size:'small',resilience:'fragile'}))
 ok(await f.call('adjudicate_improvised_weapon',ruling('actual-pan')));Object.assign(f.state,{phase:'combat',currentTurn:'player',initiativeOrder:['player','target']})
 const a=ok(await f.call('interact_object',{objectId:'actual-wood',action:'attack',weaponId:'actual-improvised'}));assert.equal(a.damageRoll.rolls.length,1);assert.equal(a.attackRoll.modifier,getAbilityModifier(f.state.player.stats.str));assert.equal(f.state.player.inventory.find(i=>i.id==='actual-pan').type,'misc')
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('a sling must really contain a reserved projectile for melee damage; its mass and physical ownership are counted once',async t=>{
 const f=await fixture(t,{weapon:'sling',ammunitionType:'sling-bullet',quantity:3,dice:'17,4,19'});f.target.position={x:2,y:2}
 ok(await f.call('adjudicate_improvised_weapon',ruling('sling')))
 await refused(f,'resolve_player_attack',{targetId:'target',weaponOrSpell:'actual-improvised'},'IMPROVISED_SLING_MUST_BE_LOADED')
 const loaded=ok(await f.call('manage_sling_projectile',{eventId:'actual-load',hostItemId:'sling',operation:'load',ammunitionItemId:'actual-ammo'}));assert.ok(loaded.loaded);assert.equal(f.stock(),2)
 ok(await f.call('manage_sling_projectile',{eventId:'actual-load',hostItemId:'sling',operation:'load',ammunitionItemId:'actual-ammo'}));assert.equal(f.stock(),2)
 ok(await f.call('declare_physical_weight',{eventId:'dry-sling',targetKind:'item',targetId:'sling',weightLb:.1,unit:'lb_per_inventory_unit',source,reason}))
 assert.equal(carryingItemWeight(f.state,f.state.player.inventory.find(i=>i.id==='sling')).weightLb,.175)
 const a=ok(await f.attack({weaponOrSpell:'actual-improvised',ammunitionItemId:undefined}));assert.equal(a.ammunition,undefined);assert.equal(f.stock(),2);assert.ok(f.state.dmTools.improvised.loads.sling)
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('the actually reserved sling projectile can be fired exactly once without taking another stack unit',async t=>{
 const f=await fixture(t,{weapon:'sling',ammunitionType:'sling-bullet',quantity:3,dice:'17,3,19'})
 ok(await f.call('manage_sling_projectile',{eventId:'load-shot',hostItemId:'sling',operation:'load',ammunitionItemId:'actual-ammo'}));assert.equal(f.stock(),2)
 const a=ok(await f.attack({ammunitionItemId:'sling'}));assert.equal(a.ammunition.loadedHostItemId,'sling');assert.equal(f.stock(),2);assert.equal(f.state.dmTools.improvised.loads.sling,undefined)
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('a complete real sling Extra Attack sequence can fire its reserved projectile then one loose actual unit without a second fictitious load',async t=>{
 const f=await fixture(t,{weapon:'sling',ammunitionType:'sling-bullet',quantity:3,dice:'17,3,17,4,19'})
 ok(await f.call('manage_sling_projectile',{eventId:'load-sequence',hostItemId:'sling',operation:'load',ammunitionItemId:'actual-ammo'}))
 const a=ok(await f.call('resolve_player_multiattack',{attacks:[{targetId:'target',weaponOrSpell:'sling',ammunitionItemId:'sling'},{targetId:'target',weaponOrSpell:'sling',ammunitionItemId:'actual-ammo'}]}))
 assert.equal(a.attacks.length,2);assert.equal(f.stock(),1);assert.equal(f.state.dmTools.improvised.loads.sling,undefined);assert.equal(Object.keys(f.state.dmTools.ammunition.expenditures).length,2)
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('an explicitly similar Light object participates in the real other-hand bonus attack without granting a positive damage modifier',async t=>{
 const f=await fixture(t,{weapon:'dagger',quantity:null,dice:'17,2,17,4,19'});f.target.position={x:2,y:2}
 f.state.player.inventory.push({id:'actual-pan',name:'Petite poêle réelle',type:'misc'});f.state.dmTools.loadout.offHandId='actual-pan'
 ok(await f.call('adjudicate_improvised_weapon',ruling('actual-pan',{mode:'similar',profileId:'club',damageType:undefined,allowProficiency:true})))
 const primary=ok(await f.attack());assert.ok(primary.primaryAttackId);assert.ok(primary.twoWeaponEligibility.otherWeaponReferences.includes('actual-improvised'))
 const bonus=ok(await f.call('resolve_two_weapon_attack',{attackId:'actual-pan-bonus',primaryAttackId:primary.primaryAttackId,weaponItemId:'actual-improvised',targetId:'target',attackMode:'melee'}))
 assert.equal(bonus.damageRoll.total,4);assert.equal(f.state.bonusActionUsed.player,true)
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
async function physical(t,{corpse=false,large=false,longDescription=false,dice='17,3,19'}={}){
 const f=await fixture(t,{weapon:'mace',quantity:null,startBattle:false,dice})
 delete f.state.dmTools.loadout.mainHandId;f.state.dmTools.wallet={cp:0,sp:0,ep:0,gp:0,pp:0}
 const id=corpse?'actual-corpse':'actual-load',kind=corpse?'creature':'object'
 if(corpse){f.state.monsters[id]={...structuredClone(getMonsterRecord('commoner').engine),id,position:{x:1,y:3},hp:{current:0,max:4},isAlive:false};f.state.hero.corpseTimes[id]=0}
 else ok(await f.call('create_scene_object',{objectId:id,name:'Charge physique réelle',description:longDescription?'Charge réelle en bois actuellement maniable selon le MJ. '.repeat(10).trim():'Objet entier réellement maniable selon le MJ.',cell:{x:1,y:3},kind:'obstacle',material:'wood',size:large?'large':'small',resilience:'fragile'}))
 ok(await f.call('set_carrying_context',{eventId:'actual-player-size',entityId:'player',size:'Medium',source,reason}))
 ok(await f.call('declare_physical_weight',{eventId:'actual-payload',targetKind:kind,targetId:id,weightLb:corpse?40:10,unit:'lb_total',...(corpse?{includesCarriedEquipment:true}:{}),source,reason}))
 Object.assign(f.state,{phase:'combat',currentTurn:'player',initiativeOrder:['player','target'],combatGeneration:1})
 ok(await f.call('begin_handling_load',{loadId:'actual-grip',actorId:'player',targetKind:kind,targetId:id,operation:'carry',control:'inanimate',hands:corpse?2:1,mobilityConfirmed:true,interactionCost:'interaction',source,reason}))
 ok(await f.call('adjudicate_improvised_weapon',ruling(id,{targetKind:corpse?'corpse':'object',mode:'thrown',hands:corpse?2:1,landingCell:{x:5,y:3}})))
 return f
}
test('the actual corpse is thrown to the explicit free landing with no player move, mass damage, life or initiative change',async t=>{
 const f=await physical(t,{corpse:true}),before={position:{...f.state.player.position},order:[...f.state.initiativeOrder],time:f.state.hero.corpseTimes['actual-corpse']}
 const a=ok(await f.attack({weaponOrSpell:'actual-improvised'}));assert.equal(a.damageRoll.rolls.length,1);assert.equal(a.damageRoll.notation.startsWith('1d4'),true)
 assert.deepEqual(f.state.player.position,before.position);assert.deepEqual(f.state.monsters['actual-corpse'].position,{x:5,y:3});assert.equal(f.state.monsters['actual-corpse'].isAlive,false);assert.equal(f.state.monsters['actual-corpse'].hp.current,0)
 assert.deepEqual(f.state.initiativeOrder,before.order);assert.equal(f.state.hero.corpseTimes['actual-corpse'],before.time);assert.equal(f.state.dmTools.physicalHandling.activeId,undefined);assert.equal(f.state.dmTools.physicalHandling.loads['actual-grip'].status,'released')
 gs.replaceState(structuredClone(f.state));assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('a real one-handed carried improvised melee object receives the acquired Dueling bonus only with no other actual held weapon',async t=>{
 const f=await physical(t);f.target.position={x:2,y:2}
 ok(await f.call('adjudicate_improvised_weapon',ruling('actual-load',{referenceId:'actual-load-melee',targetKind:'object',mode:'melee'})))
 const {duelingApplies}=require('../mcp-server/dist/mcp-server/equipment.js'),profile=weaponForReference('actual-load-melee')
 assert.equal(duelingApplies(profile,1),true)
 const a=ok(await f.attack({weaponOrSpell:'actual-load-melee'}));assert.equal(a.damageRoll.total,3+getAbilityModifier(f.state.player.stats.str)+2)
 f.state.dmTools.loadout.mainHandId='mace';assert.equal(duelingApplies(profile,1),false)
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('a real two-cell obstacle keeps its entire footprint, preflights occupied landing before dice, and then moves only that actual object',async t=>{
 const f=await physical(t,{large:true,longDescription:true});const initial=structuredClone(f.state)
 f.state.monsters.occupant={...structuredClone(getMonsterRecord('commoner').engine),id:'occupant',position:{x:6,y:4},hp:{current:4,max:4},isAlive:true}
 await refused(f,'resolve_player_attack',{targetId:'target',weaponOrSpell:'actual-improvised'},'IMPROVISED_LANDING_OCCUPIED')
 delete f.state.monsters.occupant;const a=ok(await f.attack({weaponOrSpell:'actual-improvised'}));assert.ok(a.thrownItem)
 assert.deepEqual(f.state.dmTools.objects['actual-load'].cell,{x:5,y:3});assert.equal(f.state.dmTools.objects['actual-load'].size,'large');assert.deepEqual(f.state.player.position,initial.player.position)
 assert.equal(f.state.dmTools.physicalHandling.activeId,undefined);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
