const test=require('node:test'),assert=require('node:assert/strict')
const {fixture,ok,refused}=require('./helpers/ammunition-fixture.cjs')
const gs=require('../mcp-server/dist/mcp-server/game-state.js')
const {registerPlayerPoisonTools}=require('../mcp-server/dist/mcp-server/tools/player-poison-tools.js')
const dose=(template='drow_poison',id='actual-dose')=>({id,equipmentId:'poison_'+template,name:'Une dose rÃ©ellement possÃ©dÃ©e',type:'misc'})
async function setup(t,{template='drow_poison',...options}={}){
 const f=await fixture(t,{weapon:'longsword',quantity:null,startBattle:false,dice:'19',...options}),callbacks={},server={tool(n,d,s,fn){callbacks[n]=v=>fn(require('zod').z.object(s).parse(v))},registerTool(n,c,fn){callbacks[n]=v=>fn(require('zod').z.object(c.inputSchema).parse(v))}}
 registerPlayerPoisonTools(server);require('../mcp-server/dist/mcp-server/tools/foraging-tools.js').registerForagingTools(server);require('../mcp-server/dist/mcp-server/tools/vertical-tools.js').registerVerticalTools(server);require('../mcp-server/dist/mcp-server/tools/weather-tools.js').registerWeatherTools(server);require('../mcp-server/dist/mcp-server/tools/affliction-tools.js').registerAfflictionTools(server);require('../mcp-server/dist/mcp-server/tools/npc-life-tools.js').registerNpcLifeTools(server);const original=f.call;f.call=async(n,v={})=>callbacks[n]?JSON.parse((await callbacks[n](v)).content[0].text):original(n,v);f.state.player.inventory.push(dose(template));return f
}
const prepare=(f,extra={})=>f.call('prepare_player_poison',{eventId:'actual-preparation',doseItemId:'actual-dose',surfaceKind:'weapon',surfaceId:'longsword',surfaceDescription:'La vraie lame sÃ©lectionnÃ©e reÃ§oit cette dose physique.',...extra})
async function observed(f,text='La peau exposÃ©e touche effectivement la partie rÃ©ellement enduite.'){return ok(await f.call('record_scene_fact',{description:text,cell:{...f.state.player.position}})).worldFact.id}
async function contactReady(t,options={}){const f=await setup(t,{template:'oil_of_taggit',...options});f.target.position={x:2,y:2};ok(await prepare(f,{physicalFactId:await observed(f,'La vraie partie sÃ©lectionnÃ©e de la lame est prÃªte Ã  Ãªtre enduite.')}));return f}
const touch=async(f,extra={})=>f.call('expose_player_poison',{eventId:'actual-delivery',preparationId:'actual-preparation',targetId:'target',physicalFactId:await observed(f),actualTouchConfirmed:true,exposedSkinConfirmed:true,...extra})
const gas=(f,area)=>f.call('release_inhaled_poison',{eventId:'actual-gas',doseItemId:'actual-dose',area})
const cube=(x=1.5,y=1.5,zFeet=0)=>({origin:{x,y,zFeet},direction:{x:1,y:0,z:0},faceU:{x:0,y:1,z:0},faceOffset:{uFeet:0,vFeet:0}})
function combat(f,generation=1){Object.assign(gs.getState(),{phase:'combat',round:1,turnCounter:0,currentTurn:'player',initiativeOrder:['player',...Object.keys(gs.getState().monsters)],combatGeneration:generation,actionUsed:{},bonusActionUsed:{},movementUsed:{}});gs.getState().hero.actionCredits=1;delete gs.getState().hero.attackAction}

test('one real DMG injury dose is actually spent, persists beyond a minute, survives hydration and exact retries never manufacture another coating',async t=>{
 const f=await setup(t),a=ok(await prepare(f));assert.equal(a.seconds,6);assert.equal(a.templateId,'drow_poison');assert.equal(gs.getPlayer().inventory.some(i=>i.id==='actual-dose'),false);assert.equal(f.target.conditions.includes('poisoned'),false)
 ok(await f.call('advance_time',{seconds:120}));gs.replaceState(structuredClone(gs.getState()));const before=structuredClone(gs.getState());assert.equal(ok(await prepare(f)).replayed,true);assert.deepEqual(gs.getState(),before);assert.equal(gs.getState().dmTools.playerPoisons.preparations['actual-preparation'].status,'active');assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})

test('missing doses, unrelated Basic Poison and an unseparated multi-dose stack refuse before action, time and dice',async t=>{
 const f=await setup(t);f.state.player.inventory.find(i=>i.id==='actual-dose').equipmentId='basic_poison_vial';await refused(f,'prepare_player_poison',{eventId:'bad',doseItemId:'actual-dose',surfaceKind:'weapon',surfaceId:'longsword',surfaceDescription:'Lame rÃ©elle.'},'PLAYER_POISON_REAL_DOSE_REQUIRED')
 f.state.player.inventory.find(i=>i.id==='actual-dose').equipmentId='poison_drow_poison';f.state.player.inventory.find(i=>i.id==='actual-dose').quantity=2;await refused(f,'prepare_player_poison',{eventId:'bad',doseItemId:'actual-dose',surfaceKind:'weapon',surfaceId:'longsword',surfaceDescription:'Lame rÃ©elle.'},'PLAYER_POISON_REAL_DOSE_REQUIRED');assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})

test('a DMG surface application needs the actual manipulating hand before dose, action or time',async t=>{
 const f=await setup(t,{shield:true});await refused(f,'prepare_player_poison',{eventId:'bad',doseItemId:'actual-dose',surfaceKind:'weapon',surfaceId:'longsword',surfaceDescription:'Lame rÃ©elle.'},'PLAYER_POISON_FREE_HAND_REQUIRED');assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})

test('an actual remaining Extra Attack does not pay the full poison-application action after the first real weapon attack',async t=>{
 const f=await setup(t,{startBattle:true,dice:'17,3,19'});f.target.position={x:2,y:2};ok(await f.attack());assert.equal(gs.getState().hero.attackAction.remaining,1);assert.equal(gs.getState().hero.actionCredits,0)
 await refused(f,'prepare_player_poison',{eventId:'bad',doseItemId:'actual-dose',surfaceKind:'weapon',surfaceId:'longsword',surfaceDescription:'Lame rÃ©elle.'},'ACTION_ALREADY_USED');assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})

test('contact poison preparation binds a public observed surface, spends the real dose but never invents exposed-skin contact',async t=>{
 const f=await setup(t,{template:'oil_of_taggit'}),fact=ok(await f.call('record_scene_fact',{description:'La surface prÃ©cise de cette vraie lame est observÃ©e avant enduction.',cell:{...f.state.player.position}})).worldFact.id
 const a=ok(await prepare(f,{physicalFactId:fact}));assert.equal(a.physicalFact.id,fact);assert.equal(gs.getPlayer().conditions.includes('poisoned'),false);assert.equal(f.target.conditions.includes('poisoned'),false);assert.equal(gs.getState().dmTools.playerPoisons.preparations['actual-preparation'].delivery,'contact');assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})

test('the real selected food and whole-dose delivery are required instead of inventing swallowable material',async t=>{
 const f=await setup(t,{template:'assassins_blood'});f.state.player.inventory.push({id:'actual-food',name:'Mets rÃ©el du scÃ©nario',type:'misc'});const cell={...f.state.player.position},fact=ok(await f.call('record_scene_fact',{description:'Ce mets et sa portion rÃ©elle sont Ã©tablis par le MJ.',cell})).worldFact.id
 const input={eventId:'actual-preparation',doseItemId:'actual-dose',surfaceKind:'item',surfaceId:'actual-food',surfaceDescription:'Toute la dose dans cette portion rÃ©elle.',physicalFactId:fact};await refused(f,'prepare_player_poison',input,'PLAYER_POISON_FOOD_OR_LIQUID_REQUIRED');ok(await f.call('prepare_player_poison',{...input,foodOrLiquidConfirmed:true}));assert.equal(f.target.conditions.includes('poisoned'),false);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})

test('a true protected touch consumes this contact application without an exposed-skin effect, save die or invented glove coating',async t=>{
 const f=await contactReady(t),a=ok(await touch(f,{exposedSkinConfirmed:false}));assert.equal(a.playerPoison.skipped,'actual_touch_without_exposed_skin');assert.equal(gs.getState().dmTools.playerPoisons.preparations['actual-preparation'].status,'delivered');assert.equal(f.target.conditions.includes('poisoned'),false);assert.equal(Object.keys(gs.getState().dmTools.afflictions?.records??{}).length,0);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})

test('actual exposed skin receives the source Taggit CON13 and24hour poison/sleep rather than a freely selected effect',async t=>{
 const f=await contactReady(t,{dice:'1,19'}),a=ok(await touch(f));assert.equal(a.playerPoison.save.dc,13);assert.equal(a.playerPoison.save.success,false);assert.ok(gs.getMonster('target').conditions.includes('poisoned'));assert.ok(gs.getMonster('target').conditions.includes('unconscious'));assert.equal(a.playerPoison.affliction.expiresAt,86406);gs.replaceState(structuredClone(gs.getState()));assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})

test('the original actual contact CON save survives hydration and Inspiration without a second dose, touch or die',async t=>{
 const f=await contactReady(t,{dice:'8,6,19'});f.state.hero.inspiration.push({targetId:'target',die:8,expiresAt:600});const a=ok(await touch(f));assert.ok(a.pendingReaction);assert.equal(gs.getMonster('target').conditions.includes('poisoned'),false);gs.replaceState(structuredClone(gs.getState()))
 const b=ok(await f.call('resolve_reaction',{pendingId:a.pendingReaction.id,choice:'bardic_inspiration'}));assert.equal(b.playerPoison.save.success,true);assert.equal(gs.getMonster('target').conditions.includes('poisoned'),false);assert.equal(Object.keys(gs.getState().dmTools.playerPoisons.deliveries).length,1);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})

test('a false entire-dose assertion is refused, while true ingestion uses Assassin Blood real CON10/1d12 and poison duration',async t=>{
 const f=await setup(t,{template:'assassins_blood',dice:'1,5,19'});f.target.position={x:2,y:2};f.state.player.inventory.push({id:'actual-food',name:'Mets rÃ©el',type:'misc'});ok(await prepare(f,{surfaceKind:'item',surfaceId:'actual-food',physicalFactId:await observed(f,'La portion alimentaire physique est rÃ©ellement prÃ©sente.'),foodOrLiquidConfirmed:true}))
 const input={eventId:'actual-delivery',preparationId:'actual-preparation',targetId:'target',physicalFactId:await observed(f,'Cette dose entiÃ¨re est rÃ©ellement avalÃ©e dans cette portion.')};await refused(f,'expose_player_poison',input,'PLAYER_POISON_ENTIRE_DOSE_REQUIRED');const a=ok(await f.call('expose_player_poison',{...input,entireDoseSwallowedConfirmed:true}));assert.equal(a.playerPoison.save.dc,10);assert.equal(a.playerPoison.damageRoll.notation,'1d12');assert.equal(a.playerPoison.damageResolution.damageDealt,5);assert.equal(gs.getMonster('target').hp.current,195);assert.ok(gs.getMonster('target').conditions.includes('poisoned'));assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})

test('condition-only poisoned immunity never turns damaging DMG poison into an automatic successful CON save',async t=>{
 const f=await setup(t,{template:'assassins_blood',dice:'1,5,19'}),goblin=require('../mcp-server/dist/lib/srd/monsters.js').getMonsterRecord('goblin'),prior=goblin.source.condition_immunities;t.after(()=>goblin.source.condition_immunities=prior);goblin.source.condition_immunities=[...prior,{index:'poisoned',name:'Poisoned',url:'/api/conditions/poisoned'}]
 f.target.position={x:2,y:2};f.state.player.inventory.push({id:'actual-food',name:'Mets rÃ©el',type:'misc'});ok(await prepare(f,{surfaceKind:'item',surfaceId:'actual-food',physicalFactId:await observed(f,'La portion alimentaire est rÃ©ellement prÃªte.'),foodOrLiquidConfirmed:true}))
 const a=ok(await f.call('expose_player_poison',{eventId:'actual-delivery',preparationId:'actual-preparation',targetId:'target',physicalFactId:await observed(f,'La dose entiÃ¨re est rÃ©ellement avalÃ©e.'),entireDoseSwallowedConfirmed:true}));assert.equal(a.playerPoison.save.success,false);assert.equal(a.playerPoison.damageResolution.damageDealt,5);assert.equal(gs.getMonster('target').conditions.includes('poisoned'),false);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})

test('a true swallowed Midnight Tears dose records the established midnight without an immediate CON, damage or invented calendar',async t=>{
 const f=await setup(t,{template:'midnight_tears'});f.target.position={x:2,y:2};f.state.player.inventory.push({id:'actual-food',name:'Mets rÃ©el',type:'misc'});ok(await prepare(f,{surfaceKind:'item',surfaceId:'actual-food',physicalFactId:await observed(f,'Cette portion alimentaire physique est prÃªte.'),foodOrLiquidConfirmed:true}))
 const a=ok(await f.call('expose_player_poison',{eventId:'actual-delivery',preparationId:'actual-preparation',targetId:'target',physicalFactId:await observed(f,'Cette dose entiÃ¨re a rÃ©ellement Ã©tÃ© avalÃ©e.'),entireDoseSwallowedConfirmed:true,midnightAt:3600}));assert.equal(a.playerPoison.delayedUntil,3600);assert.equal(a.playerPoison.affliction.status,'pending');assert.equal(gs.getMonster('target').hp.current,200);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})

test('one actual inhaled dose affects the true5foot cube then immediately dissipates, without a fabricated enemy or persistent gas',async t=>{
 const f=await setup(t,{template:'malice',dice:'1,19'});f.target.position={x:2,y:2};const a=ok(await gas(f,cube()));assert.deepEqual(a.targetIds,['target']);assert.equal(a.results[0].playerPoison.save.dc,15);assert.ok(gs.getMonster('target').conditions.includes('blinded'));assert.equal(a.dissipatedImmediately,true);assert.equal(a.seconds,6);assert.equal(gs.getState().player.inventory.some(i=>i.id==='actual-dose'),false);gs.replaceState(structuredClone(gs.getState()));const before=structuredClone(gs.getState());assert.equal(ok(await gas(f,cube())).replayed,true);assert.deepEqual(gs.getState(),before);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})

test('holding actual breath gives no protection when the player really occupies the released inhaled cube',async t=>{
 const f=await setup(t,{template:'malice',dice:'1,19'});ok(await f.call('set_breathing_context',{eventId:'actual-held-breath',entityId:'player',mode:'hold_breath',reason:'Le joueur retient rÃ©ellement son souffle.'}));const a=ok(await gas(f,cube(.5,1.5)));assert.deepEqual(a.targetIds,['player']);assert.ok(gs.getPlayer().conditions.includes('poisoned'));assert.ok(gs.getPlayer().conditions.includes('blinded'));assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})

test('a real hidden body in the same simultaneous gas event resolves after held Inspiration without revelation, activation or a second released dose',async t=>{
 const f=await setup(t,{template:'malice',dice:'8,6,1,19'}),{createNpcState}=require('../mcp-server/dist/lib/npc-stat-blocks.js'),npc=createNpcState({id:'actual-hidden-body',name:'TÃ©moin cachÃ©',kind:'goblin',statBlock:'goblin',cell:{x:2,y:2},roomId:'firing-room',disposition:'neutral',visibleFromStart:false,description:'Corps rÃ©el du scÃ©nario.'},f.state.currentMapId);f.state.npcs[npc.id]=npc;f.state.hero.inspiration.push({targetId:'player',die:8,expiresAt:600})
 const a=ok(await gas(f,cube(1,2)));assert.ok(a.pendingReaction);assert.deepEqual(a.targetIds,['player',npc.id]);assert.equal(a.actualDoseSpent,true);assert.equal(a.dissipatedImmediately,true);gs.replaceState(structuredClone(gs.getState()));const b=ok(await f.call('resolve_reaction',{pendingId:a.pendingReaction.id,choice:'bardic_inspiration'}));assert.equal(b.results.length,2);assert.equal(gs.getPlayer().conditions.includes('poisoned'),false);assert.ok(gs.getState().npcs[npc.id].conditions.includes('blinded'));assert.equal(gs.getState().npcs[npc.id].visible,false);assert.equal(gs.getState().monsters[npc.id],undefined);assert.equal(gs.getEntity(npc.id),undefined);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})

test('a wall or an ungranted distant release refuses before the actual dose, action, six-second activity or first CON die',async t=>{
 const f=await setup(t,{template:'malice'});await refused(f,'release_inhaled_poison',{eventId:'bad-range',doseItemId:'actual-dose',area:cube(3,2)},'PLAYER_POISON_RELEASE_OUT_OF_REACH');require('../mcp-server/dist/lib/adventure-map.js').getAdventureMap().maps[0].geometry.edges.push({from:{x:1,y:2},to:{x:2,y:2},kind:'wall'});await refused(f,'release_inhaled_poison',{eventId:'bad-wall',doseItemId:'actual-dose',area:cube(2,2)},'PLAYER_POISON_RELEASE_PATH_REQUIRED');assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})

test('the actual observed flying body above the cube is excluded instead of receiving a flattened XY poison exposure',async t=>{
 const f=await setup(t,{template:'malice'}),ghost=require('../mcp-server/dist/lib/srd/monsters.js').getMonsterRecord('ghost');f.state.monsters.target={...structuredClone(ghost.engine),id:'target',position:{x:2,y:2},hp:{current:45,max:45},isAlive:true};const fact=ok(await f.call('record_scene_fact',{description:'Le fantÃ´me vole rÃ©ellement dix pieds au-dessus de ce sol.',cell:{x:2,y:2}})).worldFact.id
 ok(await f.call('record_flight_height',{eventId:'actual-flight',entityId:'target',heightFeet:10,factId:fact,source:'Hauteur rÃ©ellement observÃ©e au-dessus du vrai plan du sol.'}));const a=ok(await gas(f,cube()));assert.deepEqual(a.targetIds,[]);assert.equal(Object.keys(gs.getState().dmTools.afflictions?.records??{}).length,0);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})

test('the first actual cutting wound delivers Drow Poison once, with true CON13/sleep, and another Extra Attack never reuses the spent dose',async t=>{
 const f=await setup(t,{dice:'17,3,1,17,3,19'});f.target.position={x:2,y:2};f.state.monsters.other={...structuredClone(f.target),id:'other',position:{x:2,y:3}};ok(await prepare(f));combat(f)
 const a=ok(await f.attack());assert.equal(a.playerPoison.save.dc,13);assert.equal(a.playerPoison.save.success,false);assert.ok(gs.getMonster('target').conditions.includes('poisoned'));assert.ok(gs.getMonster('target').conditions.includes('unconscious'));assert.equal(a.playerPoison.affliction.expiresAt,3606);assert.equal(a.poisonDamageDealt,0);assert.equal(gs.getState().dmTools.playerPoisons.preparations['actual-preparation'].status,'delivered')
 const b=ok(await f.call('resolve_player_attack',{targetId:'other',weaponOrSpell:'longsword'}));assert.equal(b.playerPoison,undefined);assert.equal(gs.getMonster('other').conditions.includes('poisoned'),false);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})

test('a missed stroke retains its DMG dose; a later actual critical wound uses source12d6 poison without inheriting critical or nonlethal flags',async t=>{
 const f=await setup(t,{template:'purple_worm_poison',dice:[1,20,2,3,1,...Array(12).fill(1),19].join(',')});f.target.position={x:2,y:2};ok(await prepare(f));combat(f)
 assert.equal(ok(await f.attack()).hit,false);assert.equal(gs.getState().dmTools.playerPoisons.preparations['actual-preparation'].status,'active');const a=ok(await f.attack({nonlethal:true}));assert.equal(a.criticalHit,true);assert.equal(a.nonlethal,true);assert.equal(a.playerPoison.damageRoll.notation,'12d6');assert.equal(a.playerPoison.damageRoll.rolls.length,12);assert.equal(a.poisonDamageDealt,12);assert.equal(gs.getMonster('target').conditions.includes('poisoned'),false);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})

test('a defended cut that deals zero actual piercing/slashing never delivers the wound poison or rolls its CON',async t=>{
 const f=await setup(t,{dice:'17,3,19'}),goblin=require('../mcp-server/dist/lib/srd/monsters.js').getMonsterRecord('goblin'),prior=goblin.source.damage_immunities;t.after(()=>goblin.source.damage_immunities=prior);goblin.source.damage_immunities=[...prior,'slashing'];f.target.position={x:2,y:2};ok(await prepare(f));combat(f);const a=ok(await f.attack());assert.equal(a.hit,true);assert.equal(a.damageDealt,0);assert.equal(a.playerPoison,undefined);assert.equal(gs.getState().dmTools.playerPoisons.preparations['actual-preparation'].status,'active');assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})

test('an actual injury-poison CON held after the paid weapon hit keeps that hit and its sole dose through hydration/Inspiration',async t=>{
 const f=await setup(t,{dice:'17,3,8,6,19'});f.target.position={x:2,y:2};ok(await prepare(f));combat(f);f.state.hero.inspiration.push({targetId:'target',die:8,expiresAt:600});const a=ok(await f.attack());assert.ok(a.pendingReaction);const hitHp=gs.getMonster('target').hp.current;assert.ok(hitHp<200);assert.equal(gs.getState().hero.attackAction.remaining,1);gs.replaceState(structuredClone(gs.getState()));const b=ok(await f.call('resolve_reaction',{pendingId:a.pendingReaction.id,choice:'bardic_inspiration'}));assert.equal(b.playerPoison.save.success,true);assert.equal(gs.getMonster('target').hp.current,hitHp);assert.equal(gs.getState().hero.attackAction.remaining,1);assert.equal(Object.keys(gs.getState().dmTools.playerPoisons.deliveries).length,1);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})

test('an actual single poisoned silvered projectile survives a miss, explicit half-battle recovery and another real shot with the SAME permanent dose',async t=>{
 const f=await setup(t,{template:'serpent_venom',weapon:'shortbow',quantity:1,dice:'1,1,17,3,1,2,3,4,19',additionalAmmo:[{itemId:'plain-arrow',ammunitionType:'arrow',quantity:1}]});f.state.player.inventory.find(i=>i.id==='actual-ammo').silvered=true;const later=require('../mcp-server/dist/lib/npc-stat-blocks.js').createNpcState({id:'later-target',name:'Autre corps réellement présent',kind:'goblin',statBlock:'goblin',cell:{x:5,y:3},roomId:'firing-room',disposition:'hostile',visibleFromStart:true,description:'Ce corps distinct est déjà réellement présent avant la bataille.'},f.state.currentMapId);later.hp={current:200,max:200};f.state.npcs[later.id]=later;ok(await prepare(f,{surfaceKind:'ammunition',surfaceId:'actual-ammo'}));combat(f)
 const a=ok(await f.attack()),shot=a.ammunition.attackId;assert.equal(a.hit,false);assert.equal(a.ammunition.playerPoison.preparationId,'actual-preparation');ok(await f.attack({ammunitionItemId:'plain-arrow'}));ok(await f.call('end_combat',{force:true}))
 await refused(f,'recover_ammunition',{recoveryId:'actual-search',combatGeneration:1,ammunitionType:'arrow'},'AMMUNITION_POISON_RECOVERY_SELECTION_REQUIRED')
 const recovered=ok(await f.call('recover_ammunition',{recoveryId:'actual-search',combatGeneration:1,ammunitionType:'arrow',recoveredPoisonedAttackIds:[shot]}));assert.equal(recovered.seconds,60);const unit=recovered.recovery.poisonedUnits[0],item=gs.getPlayer().inventory.find(i=>i.id===unit.itemId);assert.equal(item.quantity,1);assert.equal(item.silvered,true);assert.equal(gs.getState().dmTools.playerPoisons.preparations['actual-preparation'].status,'active');assert.equal(gs.getState().dmTools.playerPoisons.preparations['actual-preparation'].currentSurface.id,item.id);gs.replaceState(structuredClone(gs.getState()));combat(f,2);gs.getState().initiativeOrder.push('later-target')
 const hit=ok(await f.attack({ammunitionItemId:item.id,targetId:'later-target'}));assert.equal(hit.ammunition.silvered,true);assert.equal(hit.ammunition.playerPoison.preparationId,'actual-preparation');assert.equal(hit.playerPoison.damageRoll.notation,'3d6');assert.equal(hit.poisonDamageDealt,9);assert.equal(gs.getState().dmTools.playerPoisons.preparations['actual-preparation'].status,'delivered');assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})

test('contact coating follows its one true loaded/unloaded sling unit, never the emptied host or the whole original stack',async t=>{
 const f=await setup(t,{template:'oil_of_taggit',weapon:'sling',quantity:1,ammunitionType:'sling-bullet',dice:'1,19'});ok(await prepare(f,{surfaceKind:'ammunition',surfaceId:'actual-ammo',physicalFactId:await observed(f,'La vraie balle unique sÃ©lectionnÃ©e sera enduite.')}));ok(await f.call('manage_sling_projectile',{eventId:'actual-load',hostItemId:'sling',operation:'load',ammunitionItemId:'actual-ammo'}));assert.equal(gs.getState().dmTools.improvised.loads.sling.projectile.playerPoison.preparationId,'actual-preparation');gs.replaceState(structuredClone(gs.getState()))
 const unloaded=ok(await f.call('manage_sling_projectile',{eventId:'actual-unload',hostItemId:'sling',operation:'unload',separate:true}));assert.equal(unloaded.unloadedItem.quantity,1);assert.equal(gs.getPlayer().inventory.find(i=>i.id==='actual-ammo').quantity,0);assert.equal(gs.getState().dmTools.playerPoisons.preparations['actual-preparation'].currentSurface.id,unloaded.unloadedItem.id);assert.equal(gs.getState().dmTools.improvised.loads.sling,undefined);gs.replaceState(structuredClone(gs.getState()))
 const a=ok(await touch(f,{targetId:'player'}));assert.equal(a.playerPoison.save.success,false);assert.ok(gs.getPlayer().conditions.includes('unconscious'));assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})

test('a real repeated poison save still occurs on a living zeroHP NPC and actual poison damage counts one death-save failure',async t=>{
 const f=await setup(t,{template:'burnt_othur_fumes',dice:'1,1,1,1,1,2,19'});f.target.position={x:2,y:2};f.target.hp.current=1;ok(await f.call('configure_npc_death_saves',{entityId:'target',eventId:'real-policy-before-poison',reason:'Cet acteur vivant suit rÃ©ellement les sauvegardes contre la mort avant toute blessure.'}));const a=ok(await gas(f,cube()));const id=a.results[0].playerPoison.affliction.id
 assert.equal(gs.getMonster('target').hp.current,0);assert.equal(gs.getMonster('target').isAlive,true);assert.equal(gs.getMonster('target').npcLife.episode.failures,0);ok(await f.call('advance_time',{seconds:6}));const repeat=ok(await f.call('resolve_affliction_event',{afflictionId:id}));assert.equal(repeat.save.success,false);assert.equal(repeat.damageRoll.notation,'1d6');assert.equal(repeat.damageResolution.damageDealt,2);assert.equal(gs.getMonster('target').npcLife.episode.failures,1);assert.equal(gs.getMonster('target').isAlive,true);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})

test('the actually exposed hidden NPC keeps its due source poison save without discovery or enlistment',async t=>{
 const f=await setup(t,{template:'burnt_othur_fumes',dice:'1,1,1,1,20,19'}),{createNpcState}=require('../mcp-server/dist/lib/npc-stat-blocks.js'),npc=createNpcState({id:'actual-hidden-body',name:'TÃ©moin cachÃ©',kind:'goblin',statBlock:'goblin',cell:{x:2,y:2},roomId:'firing-room',disposition:'neutral',visibleFromStart:false,description:'Corps rÃ©el du scÃ©nario.'},f.state.currentMapId);f.state.npcs[npc.id]=npc;const a=ok(await gas(f,cube())),id=a.results[0].playerPoison.affliction.id
 assert.equal(gs.getState().npcs[npc.id].hp.current,4);ok(await f.call('advance_time',{seconds:6}));const repeat=ok(await f.call('resolve_affliction_event',{afflictionId:id}));assert.equal(repeat.save.success,true);assert.equal(repeat.affliction.successes,1);assert.equal(gs.getState().npcs[npc.id].visible,false);assert.equal(gs.getState().monsters[npc.id],undefined);assert.equal(gs.getEntity(npc.id),undefined);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})


test('a real source coating is washed only by an actual complete operation with counted water, and retry never debits more water',async t=>{
 const f=await setup(t);ok(await prepare(f));const fact=await observed(f,'Cette vraie lame reçoit un lavage complet avec la quantité d’eau choisie par le MJ.'),input={eventId:'actual-wash',preparationId:'actual-preparation',waterContainerItemId:'actual-water',quarterPints:2,physicalFactId:fact,completeWashingConfirmed:true,adjudication:'Le MJ établit que cette quantité réelle suffit au lavage complet de la surface physique.'}
 await refused(f,'wash_player_poison',input,'PLAYER_POISON_WASHING_WATER_REQUIRED');gs.getPlayer().inventory.push({id:'actual-water',equipmentId:'waterskin_full',name:'Outre réellement remplie',type:'misc'})
 ok(await f.call('register_water_container',{eventId:'actual-water-context',itemId:'actual-water',containerType:'waterskin',actualContainerConfirmed:true,contentsQuarterPints:8,dryWeightLb:1,waterWeightLbPerPint:1,hazardFactIds:[],source:'Outre réelle et quantité existante explicitement établies par le MJ.'}))
 const a=ok(await f.call('wash_player_poison',input));assert.equal(a.seconds,6);assert.equal(gs.getState().dmTools.foraging.containers['actual-water'].contentsQuarterPints,6);assert.equal(gs.getState().dmTools.playerPoisons.preparations['actual-preparation'].status,'washed');gs.replaceState(structuredClone(gs.getState()));const before=structuredClone(gs.getState());assert.equal(ok(await f.call('wash_player_poison',input)).replayed,true);assert.deepEqual(gs.getState(),before);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})

test('the same actual exploration poison gets its first real combat start save despite turnCounter0, and a player-only source-turn roster creates no foe',async t=>{
 const f=await setup(t,{template:'burnt_othur_fumes',dice:'1,1,1,1,20,20,19'}),a=ok(await gas(f,cube(.5,1.5))),id=a.results[0].playerPoison.affliction.id
 const c=ok(await f.call('enter_combat',{combatants:['player']}));assert.deepEqual(c.initiativeOrder,['player']);const repeat=ok(await f.call('resolve_affliction_event',{afflictionId:id}));assert.equal(repeat.save.success,true);assert.equal(repeat.affliction.successes,1);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})

test('the exact poisoned hidden body must be explicitly included before initiative without automatic revelation or an invented distant actor',async t=>{
 const f=await setup(t,{template:'burnt_othur_fumes',dice:'1,1,1,1,20,20,20,19'}),{createNpcState}=require('../mcp-server/dist/lib/npc-stat-blocks.js'),npc=createNpcState({id:'actual-hidden-body',name:'Témoin caché',kind:'goblin',statBlock:'goblin',cell:{x:2,y:2},roomId:'firing-room',disposition:'neutral',visibleFromStart:false,description:'Corps réel déjà présent.'},f.state.currentMapId);f.state.npcs[npc.id]=npc;ok(await gas(f,cube()))
 await refused(f,'enter_combat',{combatants:['player','target']},'AFFLICTION_COMBAT_ROSTER_REQUIRED');assert.equal(gs.getState().npcs[npc.id].visible,false);assert.equal(gs.getState().monsters[npc.id],undefined)
 ok(await f.call('enter_combat',{combatants:['player','target',npc.id]}));assert.equal(gs.getState().npcs[npc.id].visible,false);assert.ok(gs.getState().initiativeOrder.includes(npc.id));assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})


async function actualPoisonTrap(f,{coatBefore=true}={}){
 gs.getPlayer().inventory.push({id:'actual-trap',equipmentId:'hunting_trap',name:'Piège physique réel',type:'misc'})
 ok(await f.call('create_scene_object',{objectId:'actual-anchor',name:'Anneau réellement fixé',description:'Anneau de fixation du piège existant.',cell:{x:2,y:2},kind:'lever',material:'iron',size:'tiny',resilience:'resilient'}))
 const fact=ok(await f.call('record_scene_fact',{description:'Le vrai piège est ancré à cet anneau immobile sur ce vrai sol.',cell:{x:2,y:2}})).worldFact.id
 ok(await f.call('place_ground_gear',{placementId:'actual-device',itemId:'actual-trap',originCell:{x:2,y:2},surfaceZFeet:0,surfaceFactId:fact,anchorObjectId:'actual-anchor',anchorFactId:fact,immobileAnchorConfirmed:true}))
 if(coatBefore)ok(await prepare(f,{surfaceKind:'hunting_trap',surfaceId:'actual-device'}))
 gs.moveToken('target',2,2,{groundContactKind:'forced'})
 return Object.values(gs.getState().dmTools.groundGear.contacts).find(c=>c.entityId==='target'&&c.status==='waiting')
}
const resolveTrap=(f,c)=>f.call('resolve_ground_gear_contact',{contactId:c.id,orderedPlacementIds:c.placementIds,plateContacts:[{placementId:'actual-device',stepped:true,source:'Le pied réel a réellement appuyé sur la plaque centrale.'}]})

test('the actual coated hunting-trap jaws deliver injury poison after their real piercing wound and preserve the pending contact through Inspiration',async t=>{
 const f=await setup(t,{dice:'1,2,8,6,19'}),contact=await actualPoisonTrap(f);f.state.hero.inspiration.push({targetId:'target',die:8,expiresAt:600});const a=ok(await resolveTrap(f,contact));assert.ok(a.pendingReaction);assert.equal(gs.getMonster('target').hp.current,200);const actualPoison=ok(await f.call('resolve_reaction',{pendingId:a.pendingReaction.id,choice:'decline'}));assert.ok(actualPoison.pendingReaction);assert.equal(gs.getMonster('target').hp.current,198);gs.replaceState(structuredClone(gs.getState()))
 const b=ok(await f.call('resolve_reaction',{pendingId:actualPoison.pendingReaction.id,choice:'bardic_inspiration'}));assert.equal(b.contactResults.length,1);assert.equal(b.contactResults[0].playerPoison.save.success,true);assert.equal(gs.getState().dmTools.groundGear.contacts[contact.id].status,'resolved');assert.equal(gs.getState().dmTools.playerPoisons.preparations['actual-preparation'].status,'delivered');assert.equal(gs.getState().dmTools.groundGear.placements['actual-device'].victimId,'target');assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})

test('a real failed STR13 jaw-opening check can cause the first piercing wound of that same subsequently coated component, with one actual action and poison delivery',async t=>{
 const f=await setup(t,{dice:'1,2,1,1,19'}),contact=await actualPoisonTrap(f,{coatBefore:false});ok(await resolveTrap(f,contact));ok(await prepare(f,{surfaceKind:'hunting_trap',surfaceId:'actual-device'}));const a=ok(await f.call('escape_hunting_trap',{eventId:'actual-opening',placementId:'actual-device',actorId:'player',targetId:'target'}))
 assert.equal(a.check.success,false);assert.equal(a.damageDealt,1);assert.equal(a.playerPoison.save.dc,13);assert.ok(gs.getMonster('target').conditions.includes('unconscious'));assert.equal(gs.getMonster('target').hp.current,197);assert.equal(gs.getState().dmTools.playerPoisons.preparations['actual-preparation'].status,'delivered');assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})


test('a real readied thrown dagger carries its selected DMG injury dose through the one actual throw without reacquiring its dropped weapon',async t=>{
 const f=await setup(t,{template:'serpent_venom',weapon:'dagger',dice:'17,2,1,1,2,3,19'});ok(await prepare(f,{surfaceId:'dagger'}));combat(f)
 const ready=ok(await f.call('combat_action',{action:'ready',readied:{kind:'attack',weaponId:'dagger',attackMode:'thrown',trigger:'Un signal visible précisément établi.'}}))
 const a=ok(await f.call('resolve_readied_action',{readyId:ready.readyId,choice:'execute',triggerObserved:'Le signal visible a réellement lieu.',targetId:'target',weaponAbility:'dex'}));assert.equal(a.poisonDamageDealt,6);assert.equal(a.weaponDamageDealt+6,a.damageDealt);assert.equal(gs.getPlayer().inventory.some(item=>item.id==='dagger'),false);assert.equal(gs.getState().droppedItems.dagger.item.id,'dagger');assert.equal(gs.getState().hero.reactionsUsed.player,true);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})

test('a real opportunity wound retains its exact moving body while its source CON is held, then resumes only that original movement',async t=>{
 const f=await setup(t,{template:'serpent_venom',dice:'17,2,5,1,1,2,3,19'});f.target.position={x:2,y:2};ok(await prepare(f));combat(f);gs.getState().currentTurn='target';f.state.hero.inspiration.push({targetId:'target',die:8,expiresAt:600})
 ok(await f.call('move_token',{tokenId:'target',toCell:{x:3,y:2}}));const offered=gs.getState().hero.pending,held=ok(await f.call('resolve_reaction',{pendingId:offered.id,choice:'opportunity_attack',weaponOrSpell:'longsword'}));assert.equal(held.pendingReaction.command.type,'save');gs.replaceState(structuredClone(gs.getState()));const a=ok(await f.call('resolve_reaction',{pendingId:held.pendingReaction.id,choice:'bardic_inspiration'}));assert.equal(a.attack.poisonDamageDealt,6);assert.deepEqual(gs.getMonster('target').position,{x:3,y:2});assert.equal(gs.getState().hero.reactionsUsed.player,true);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})

test('an actual offhand injury-poison hit keeps the separate bonus receipt pending and resolved across exact retries without another attack or dose',async t=>{
 const f=await setup(t,{template:'serpent_venom',weapon:'dagger',additionalWeapons:['shortsword'],dice:'17,2,17,2,2,1,1,2,3,19'});f.target.position={x:2,y:2}
 ok(await f.call('equip_item',{itemId:'dagger',operation:'unequip',slot:'main_hand'}));ok(await f.call('equip_item',{itemId:'shortsword',operation:'equip',slot:'main_hand'}));ok(await prepare(f,{surfaceId:'shortsword'}))
 ok(await f.call('equip_item',{itemId:'shortsword',operation:'unequip',slot:'main_hand'}));ok(await f.call('equip_item',{itemId:'dagger',operation:'equip',slot:'main_hand'}));ok(await f.call('equip_item',{itemId:'shortsword',operation:'equip',slot:'off_hand'}));combat(f);f.state.hero.inspiration.push({targetId:'target',die:8,expiresAt:600})
 const primary=ok(await f.attack()),choice={attackId:'actual-dmg-bonus',primaryAttackId:primary.primaryAttackId,weaponItemId:'shortsword',targetId:'target',attackMode:'melee',weaponAbility:'dex'},a=ok(await f.call('resolve_two_weapon_attack',choice));assert.ok(a.pendingReaction);assert.equal(ok(await f.call('resolve_two_weapon_attack',choice)).alreadyPending,true);gs.replaceState(structuredClone(gs.getState()))
 const b=ok(await f.call('resolve_reaction',{pendingId:a.pendingReaction.id,choice:'bardic_inspiration'}));assert.equal(b.weaponDamageDealt,2);assert.equal(b.poisonDamageDealt,6);const before=structuredClone(gs.getState()),again=ok(await f.call('resolve_two_weapon_attack',choice));assert.equal(again.alreadyResolved,true);assert.equal(again.poisonDamageDealt,6);assert.deepEqual(gs.getState(),before);assert.equal(gs.getState().bonusActionUsed.player,true);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})


test('a real quantified ration can bind the original whole dose without free food, swallowing or an initial CON die',async t=>{
 const f=await setup(t,{template:'assassins_blood'});gs.getPlayer().inventory.push({id:'actual-ration',equipmentId:'ration_1_day',name:'Ration réelle',type:'misc'});const physicalFactId=await observed(f,'Ration réelle à quantité suivie.')
 const a=ok(await f.call('prepare_player_poison',{eventId:'actual-nutrition-prep',doseItemId:'actual-dose',surfaceKind:'item',surfaceId:'actual-ration',foodOrLiquidConfirmed:true,physicalFactId,surfaceDescription:'Dose choisie sur une ration à quantité réellement suivie.'}));assert.equal(a.consumedDose,true);assert.equal(gs.getState().dmTools.poisonNutrition.resources['actual-nutrition-prep'].units,4);assert.equal(gs.getPlayer().conditions.includes('poisoned'),false);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
