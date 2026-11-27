const test=require('node:test'),assert=require('node:assert/strict')
const {inspectCarryingAcquisition}=require('../mcp-server/dist/lib/carrying-state.js')
const {engine,ok,replace,spawn,battle,object}=require('./helpers/mcp-toolkit.cjs')
const empty=()=>({cp:0,sp:0,ep:0,gp:0,pp:0})
const reason='Le MJ établit le fait physique réel et son origine.'
const source='Mesure actuelle de la masse de cette instance physique préparée.'
async function clearGear(call){for(const item of(await call('get_game_state')).player.inventory)ok(await call('drop_item',{itemId:item.id}))}
const begin=(call,size='Medium')=>call('set_carrying_context',{eventId:'begin',entityId:'player',size,reason,source})
async function refused(call,name,input,code){const before=await call('get_game_state'),result=await call(name,input);assert.equal(result.code,code,JSON.stringify(result));assert.deepEqual(await call('get_game_state'),before);return result}
async function treasure(call,id,coins){return ok(await call('create_treasure',{treasureId:id,name:'Pièces réelles',description:'Pièces préparées à cet emplacement précis.',cell:(await call('get_game_state')).player.position,mode:'authored',coins}))}
const declare=(call,id,weightLb,eventId=`mass-${id}`)=>call('declare_physical_weight',{eventId,targetKind:'item',targetId:id,weightLb,unit:'lb_per_inventory_unit',reason,source})

test('pure acquisition projection replaces the actual wallet once and adds exact counted projectile mass without mutation',()=>{
 const state={player:{id:'player',stats:{str:10},inventory:[{id:'longsword',type:'weapon'}]},monsters:{},dmTools:{wallet:{...empty(),gp:250},
  carrying:{version:1,actors:{player:{entityId:'player',size:'Medium',reason,source,tracking:true}},weights:{},receipts:{}}}}
 const before=structuredClone(state)
 const result=inspectCarryingAcquisition(state,{additionalItems:[{id:'actual-recovered-stack',equipmentId:'arrows',type:'misc',name:'Source instance',ammunitionType:'arrow',quantity:19}],walletAfter:{...empty(),cp:100}})
 assert.equal(result.coinWeightLb,2);assert.equal(result.carriedWeightLb,5.95);assert.equal(result.status,'resolved')
 assert.deepEqual(state,before)
})

test('coin collection refuses an exact overweight result before a combat interaction, then allows the exact boundary once and survives hydration',async t=>{
 const call=await engine(t,{dice:'19'});await clearGear(call);ok(await begin(call))
 const capacity=ok(await call('inspect_carrying_capacity',{entityId:'player'})),count=(capacity.carryingCapacityLb-capacity.carriedWeightLb)*50
 await treasure(call,'too-many',{cp:count+1});await treasure(call,'exact-boundary',{cp:count})
 const enemy=await spawn(call);await battle(call,[enemy.id])
 await refused(call,'collect_treasure',{treasureId:'too-many'},'CARRYING_CAPACITY_EXCEEDED')
 let state=await call('get_game_state');assert.equal(state.hero.actionCredits,1);assert.ok(!state.hero.effects.some(effect=>effect.kind==='object-interaction'))
 ok(await call('collect_treasure',{treasureId:'exact-boundary'}))
 state=await call('get_game_state');assert.equal(state.dmTools.wallet.cp,count);assert.equal(state.hero.actionCredits,1)
 assert.ok(state.hero.effects.some(effect=>effect.kind==='object-interaction'))
 const load=ok(await call('inspect_carrying_capacity',{entityId:'player'}));assert.equal(load.carriedWeightLb,load.carryingCapacityLb)
 ok(await call('replace_game_state',{gameState:state}));assert.equal(ok(await call('collect_treasure',{treasureId:'exact-boundary'})).alreadyCollected,true)
 assert.deepEqual(await call('get_game_state'),state)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('a real coin gain cannot bypass unresolved carried item masses, while an actual payment still lightens the wallet',async t=>{
 const call=await engine(t,{dice:'19'});ok(await begin(call));await treasure(call,'small-gain',{cp:1})
 await refused(call,'collect_treasure',{treasureId:'small-gain'},'CARRYING_DATA_REQUIRED')
 const paid=ok(await call('spend_currency',{transactionId:'lighter-payment',paid:{gp:1},reason:'Dépense déjà établie par le MJ.'}))
 assert.equal(paid.wallet.gp,249)
 const load=ok(await call('inspect_carrying_capacity',{entityId:'player'}));assert.equal(load.status,'unresolved')
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('equal-value change checks physical piece count and rejects a heavier wallet without recording the exchange',async t=>{
 const call=await engine(t,{dice:'19'});await clearGear(call)
 await replace(call,state=>{state.player.stats.str=1;state.dmTools.wallet={...empty(),gp:5}})
 ok(await begin(call,'Tiny'))
 await refused(call,'exchange_currency',{transactionId:'heavy-change',paid:{gp:5},received:{cp:500},reason:'Change explicitement disponible, sans profit.'},'CARRYING_CAPACITY_EXCEEDED')
 assert.equal((await call('get_game_state')).dmTools.currencyTransactions?.['heavy-change'],undefined)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('a lighter exchange and spending remain possible from an overloaded unresolved state without certifying its unknown masses',async t=>{
 const call=await engine(t,{dice:'19'})
 await replace(call,state=>{state.player.stats.str=1;state.dmTools.wallet={...empty(),cp:500}})
 ok(await begin(call,'Tiny'))
 const changed=ok(await call('exchange_currency',{transactionId:'lighter-change',paid:{cp:500},received:{gp:5},reason:'Change plus léger explicitement disponible.'}))
 assert.equal(changed.wallet.gp,5);assert.equal(changed.wallet.cp,0)
 const paid=ok(await call('spend_currency',{transactionId:'lighter-again',paid:{gp:1},reason:'Dépense réelle établie.'}));assert.equal(paid.wallet.gp,4)
 const load=ok(await call('inspect_carrying_capacity',{entityId:'player'}));assert.equal(load.status,'unresolved');assert.equal(load.carriedWeightLb,null)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('actual prepared hoard valuables need declared masses before ownership; declared projections persist identically through collection/drop/pickup',async t=>{
 const call=await engine(t,{dice:[...Array(11).fill(1),7,1,1,1,12,19].join(',')});await clearGear(call)
 await replace(call,state=>{state.player.stats.str=2;state.dmTools.wallet=empty()})
 await object(call,'physical-cache');ok(await call('interact_object',{objectId:'physical-cache',action:'open'}))
 const made=ok(await call('create_treasure_hoard',{hoardId:'weighed-hoard',containerId:'physical-cache',challengeBand:'0-4',name:'Richesses physiques',description:'Pièces et pierres réellement préparées.',cell:(await call('get_game_state')).player.position}))
 ok(await call('declare_physical_weight',{eventId:'full-cache-mass',targetKind:'object',targetId:'physical-cache',weightLb:40,unit:'lb_total',reason,source}))
 const ids=made.hoard.valuableIds;assert.equal(ids.length,2);ok(await begin(call))
 const missing=await refused(call,'collect_treasure_hoard',{hoardId:'weighed-hoard'},'CARRYING_DATA_REQUIRED')
 assert.deepEqual(missing.detail.missing.map(row=>row.itemId).sort(),[...ids].sort())
 await refused(call,'declare_physical_weight',{eventId:'not-a-physical-draw',targetKind:'item',targetId:'weighed-hoard:valuable:18',weightLb:1,unit:'lb_per_inventory_unit',reason,source},'PHYSICAL_ITEM_REQUIRED')
 ok(await declare(call,ids[0],1));ok(await declare(call,ids[1],20))
 assert.equal((await call('get_game_state')).player.inventory.length,0,'mass facts did not grant ownership')
 await refused(call,'collect_treasure_hoard',{hoardId:'weighed-hoard'},'CARRYING_CAPACITY_EXCEEDED')
 ok(await declare(call,ids[1],2,'corrected-second-mass'))
 ok(await call('collect_treasure_hoard',{hoardId:'weighed-hoard'}))
 let state=await call('get_game_state');assert.equal(state.player.inventory.length,2);assert.deepEqual(state.dmTools.wallet,made.hoard.coins)
 let load=ok(await call('inspect_carrying_capacity',{entityId:'player'}));assert.equal(load.status,'resolved');assert.equal(load.carriedWeightLb,21.4)
 const emptied=ok(await call('assess_handling_load',{entityId:'player',targetKind:'object',targetId:'physical-cache',operation:'lift'}))
 assert.equal(emptied.targetWeightLb,null);assert.ok(emptied.missing.includes('physical_target_context_changed'),'collecting the real contents invalidated the old full-container measurement')
 ok(await call('replace_game_state',{gameState:state}));ok(await call('drop_item',{itemId:ids[0]}));ok(await call('pick_up_item',{itemId:ids[0]}))
 load=ok(await call('inspect_carrying_capacity',{entityId:'player'}));assert.equal(load.carriedWeightLb,21.4)
 state=await call('get_game_state');assert.equal(ok(await call('collect_treasure_hoard',{hoardId:'weighed-hoard'})).alreadyCollected,true);assert.deepEqual(await call('get_game_state'),state)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
