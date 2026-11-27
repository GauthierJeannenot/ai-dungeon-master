const test=require('node:test'),assert=require('node:assert/strict')
const {engine:baseEngine,ok,replace,object,spawn,battle}=require('./helpers/mcp-toolkit.cjs')
const empty=()=>({cp:0,sp:0,ep:0,gp:0,pp:0})
async function engine(t,options){const call=await baseEngine(t,options);await replace(call,s=>{s.dmTools.wallet=empty()});return call}
async function input(call,id='hoard',band='0-4',extra={}){return {hoardId:id,challengeBand:band,name:'Coffre de richesses',description:'Un amas de pièces et de valeurs ordinaires.',cell:(await call('get_game_state')).player.position,...extra}}

for(const fixture of [
  {band:'0-4',dice:[...Array(11).fill(1),7,1,1,1,12,19],coins:{cp:600,sp:300,ep:0,gp:20,pp:0},quantity:2,value:10,kind:'gem',magic:0},
  {band:'5-10',dice:[...Array(13).fill(1),23,1,2,1,2,3,19],coins:{cp:200,sp:2000,ep:0,gp:600,pp:30},quantity:3,value:250,kind:'art',magic:0},
  {band:'11-16',dice:[...Array(9).fill(1),99,1,1,1,1,8,2,19],coins:{cp:0,sp:0,ep:0,gp:4000,pp:500},quantity:3,value:1000,kind:'gem',magic:1},
  {band:'17+',dice:[...Array(20).fill(1),100,1,2,3,19],coins:{cp:0,sp:0,ep:0,gp:12000,pp:8000},quantity:1,value:5000,kind:'gem',magic:1},
])test(`hoard ${fixture.band}: exact source coins, quantities, source identities and one-time physical collection`,async t=>{
  const call=await engine(t,{dice:fixture.dice.join(',')}),args=await input(call,'source-hoard',fixture.band),before=await call('get_game_state')
  const answer=ok(await call('create_treasure_hoard',args)),hoard=answer.hoard
  assert.deepEqual(hoard.coins,fixture.coins);assert.equal(hoard.valuables.length,fixture.quantity)
  assert.equal(hoard.magicDraws.length,fixture.magic)
  for(const value of hoard.valuables){assert.equal(value.kind,fixture.kind);assert.equal(value.valueGp,fixture.value);assert.match(value.source.sha256,/^[a-f0-9]{64}$/);assert.ok(value.name)}
  assert.deepEqual((await call('get_game_state')).dmTools.wallet,empty())
  assert.deepEqual((await call('get_game_state')).player.inventory,before.player.inventory)
  assert.equal(ok(await call('inspect_valuables')).total,0)
  assert.equal(ok(await call('create_treasure_hoard',args)).alreadyCreated,true)
  const collected=ok(await call('collect_treasure_hoard',{hoardId:args.hoardId}))
  assert.deepEqual(collected.wallet,fixture.coins);assert.equal(collected.valuableValueGp,fixture.quantity*fixture.value)
  let saved=await call('get_game_state')
  assert.equal(saved.player.inventory.length,before.player.inventory.length+fixture.quantity)
  assert.ok(saved.player.inventory.filter(i=>hoard.valuableIds.includes(i.id)).every(i=>i.type==='misc'&&i.magical===undefined))
  ok(await call('replace_game_state',{gameState:saved}));assert.deepEqual(await call('get_game_state'),saved)
  assert.equal(ok(await call('collect_treasure_hoard',{hoardId:args.hoardId})).alreadyCollected,true)
  assert.deepEqual(await call('get_game_state'),saved)
  const inventory=ok(await call('inspect_valuables'));assert.equal(inventory.totalReferenceValueGp,fixture.quantity*fixture.value)
  assert.equal(ok(await call('create_treasure_hoard',args)).hoard.collected,true)
  assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('hoard container gates physical collection, and dropped valuables keep value without money or duplicate ownership',async t=>{
  const call=await engine(t,{dice:[...Array(11).fill(1),7,1,1,1,12,19].join(',')})
  await object(call,'hoard-box')
  const args=await input(call,'box-hoard','0-4',{containerId:'hoard-box'}),made=ok(await call('create_treasure_hoard',args))
  const before=await call('get_game_state')
  assert.equal((await call('collect_treasure_hoard',{hoardId:args.hoardId})).code,'TREASURE_CONTAINER_CLOSED')
  assert.deepEqual(await call('get_game_state'),before)
  ok(await call('interact_object',{objectId:'hoard-box',action:'open'}));ok(await call('collect_treasure_hoard',{hoardId:args.hoardId}))
  const id=made.hoard.valuableIds[0],wallet=(await call('get_game_state')).dmTools.wallet
  assert.equal(ok(await call('inspect_valuables',{itemId:id})).valuable.valueGp,10)
  ok(await call('drop_item',{itemId:id}))
  assert.equal((await call('inspect_valuables',{itemId:id})).code,'VALUABLE_NOT_OWNED')
  assert.equal(ok(await call('inspect_valuables')).total,1)
  assert.deepEqual((await call('get_game_state')).dmTools.wallet,wallet)
  ok(await call('collect_treasure_hoard',{hoardId:args.hoardId}));assert.equal(ok(await call('inspect_valuables')).total,1)
  ok(await call('pick_up_item',{itemId:id}));assert.equal(ok(await call('inspect_valuables')).total,2)
  assert.deepEqual((await call('get_game_state')).dmTools.wallet,wallet)
  assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('invalid hoard container/reserved ID and changed definitions do not mutate state or consume dice',async t=>{
  const call=await engine(t,{dice:[...Array(11).fill(1),1,19].join(',')}),args=await input(call)
  const before=await call('get_game_state')
  assert.equal((await call('create_treasure_hoard',{...args,containerId:'absent'})).code,'TREASURE_CONTAINER_INVALID')
  assert.deepEqual(await call('get_game_state'),before)
  ok(await call('create_treasure_hoard',args))
  const made=await call('get_game_state')
  assert.equal((await call('create_treasure_hoard',{...args,challengeBand:'17+'})).code,'HOARD_ID_CONFLICT')
  assert.deepEqual(await call('get_game_state'),made)
  await replace(call,s=>{s.player.inventory.push({id:'blocked:valuable:1',name:'Un objet existant',type:'misc'})})
  const blocked=await call('get_game_state')
  assert.equal((await call('create_treasure_hoard',{...args,hoardId:'blocked'})).code,'VALUABLE_ID_CONFLICT')
  assert.deepEqual(await call('get_game_state'),blocked)
  assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('unreachable hoards and whole-hoard combat collection are refused without granting coins/items',async t=>{
  const call=await engine(t,{dice:[...Array(11).fill(1),1,19].join(',')}),args=await input(call)
  ok(await call('create_treasure_hoard',args))
  await replace(call,s=>{s.dmTools.hoards.hoard.mapId='another-map'})
  const before=await call('get_game_state')
  assert.equal((await call('collect_treasure_hoard',{hoardId:'hoard'})).code,'SCENE_TARGET_OUT_OF_REACH')
  assert.deepEqual(await call('get_game_state'),before)
  await replace(call,s=>{s.dmTools.hoards.hoard.mapId=s.currentMapId})
  const enemy=await spawn(call);await battle(call,[enemy.id])
  const combat=await call('get_game_state')
  assert.equal((await call('collect_treasure_hoard',{hoardId:'hoard'})).code,'HOARD_OUTSIDE_COMBAT')
  assert.deepEqual(await call('get_game_state'),combat)
  assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
