const test=require('node:test'),assert=require('node:assert/strict')
const {getAdventureMap}=require('../mcp-server/dist/lib/adventure-map.js')
const {getWeapon}=require('../mcp-server/dist/lib/srd/weapons.js')
const {getMonsterRecord}=require('../mcp-server/dist/lib/srd/monsters.js')
const {buildPlayerState}=require('../mcp-server/dist/lib/character-registry.js')
const {initialHeroState}=require('../mcp-server/dist/lib/hero-state.js')
const gs=require('../mcp-server/dist/mcp-server/game-state.js')
const {registerCombatTools}=require('../mcp-server/dist/mcp-server/tools/combat-tools.js')
const {registerHeroTools}=require('../mcp-server/dist/mcp-server/tools/hero-tools.js')
const {toolkitState}=require('../mcp-server/dist/mcp-server/toolkit.js')
const {weaponAttackRangeCells}=require('../mcp-server/dist/mcp-server/equipment.js')
const {nearbyRangedHostiles}=require('../mcp-server/dist/mcp-server/ranged-weapon-rules.js')
let fixtureNumber=0
function fixture(t,{weapon='shortbow',distance=4,dice='17,4,19',legacy=false}={}){
 const data=getAdventureMap(),original=structuredClone(data),oldDice=process.env.AI_DM_TEST_DICE_SEQUENCE
 t.after(()=>{for(const key of Object.keys(data))delete data[key];Object.assign(data,original);gs.resetState();if(oldDice===undefined)delete process.env.AI_DM_TEST_DICE_SEQUENCE;else process.env.AI_DM_TEST_DICE_SEQUENCE=oldDice})
 const mapId='ranged-rules-fixture',grid={cols:72,rows:5}
 const geometry={version:1,mapId,grid,source:{kind:'procedural',version:1},review:'approved',blockedCells:[],edges:[],decorations:[],uncertainties:[],contradictions:[]}
 Object.assign(data,{maps:[{id:mapId,name:'Range test',grid,geometry}],rooms:[{id:'range-room',mapId,name:'Range room',zone:{minX:0,maxX:71,minY:0,maxY:4}}],startCell:{x:1,y:2},entryCells:{'range-room':{x:1,y:2}},npcs:[],encounters:{},doors:[],partitions:[],roomHooks:{}})
 gs.resetState();const state=gs.getState()
 state.player=buildPlayerState({characterId:'fighter',level:7,position:{x:1,y:2}})
 state.player.inventory=[{id:weapon,equipmentId:weapon,name:getWeapon(weapon).label,type:'weapon'}]
 if(getWeapon(weapon).ammunitionType)state.player.inventory.push({id:'actual-test-arrows',equipmentId:'arrows',ammunitionType:'arrow',quantity:5,name:'Flèches réelles de la scène test',type:'misc'})
 if(legacy){delete state.player.ruleset;delete state.hero}else state.hero=initialHeroState('fighter',7)
 Object.assign(state,{npcs:{},monsters:{},currentMapId:mapId,currentRoomId:'range-room',roomsVisited:['range-room'],phase:'combat',round:1,currentTurn:'player',initiativeOrder:['player','target'],actionUsed:{},bonusActionUsed:{},movementUsed:{}})
 const target={...structuredClone(getMonsterRecord('goblin').engine),id:'target',position:{x:1+distance,y:2},hp:{current:200,max:200},isAlive:true}
 state.monsters.target=target
 toolkitState().loadout={mainHandId:weapon}
 process.env.AI_DM_TEST_DICE_SEQUENCE=dice+' '.repeat(++fixtureNumber)
 const callbacks={},server={
  tool(name,_description,schema,callback){callbacks[name]=input=>callback(require('zod').z.object(schema).parse(input))},
  registerTool(name,config,callback){callbacks[name]=input=>callback(require('zod').z.object(config.inputSchema).parse(input))},
 }
 registerCombatTools(server);registerHeroTools(server)
 const call=async(name,input={})=>JSON.parse((await callbacks[name](input)).content[0].text)
 const attack=extra=>call(legacy?'resolve_attack':'resolve_player_attack',{...(legacy?{attackerId:'player'}:{}),targetId:'target',weaponOrSpell:weapon,...getWeapon(weapon).ammunitionType?{ammunitionItemId:'actual-test-arrows'}:{},...extra})
 return{state,target,geometry,call,attack}
}
const ok=x=>{assert.ok(!x.error,JSON.stringify(x));return x}
async function noMutation(f,input,code){const before=structuredClone(gs.getState());assert.equal((await f.attack(input)).code,code);assert.deepEqual(gs.getState(),before)}

test('only published current ranged profiles expose normal and long ranges; melee is never an implicit throw',()=>{
 for(const [id,normal,long]of [['shortbow',16,64],['dagger',4,12],['handaxe',4,12]]){
  assert.equal(getWeapon(id).normalRangeCells,normal);assert.equal(getWeapon(id).longRangeCells,long)
  assert.equal(weaponAttackRangeCells(getWeapon(id),id==='shortbow'?'melee':'thrown'),long)
 }
 assert.equal(weaponAttackRangeCells(getWeapon('dagger')),1)
})
for(const [distance,band]of [[16,'normal'],[17,'long'],[64,'long']])test('real shortbow at '+distance+' cells resolves '+band+' range',async t=>{
 const f=fixture(t,{distance,dice:band==='normal'?'17,4,19':'17,8,4,19'}),answer=ok(await f.attack())
 assert.equal(answer.rangedContext.rangeBand,band);assert.equal(answer.rangedContext.normalRangeCells,16);assert.equal(answer.rangedContext.longRangeCells,64)
 assert.equal(answer.attackRoll.detail.startsWith('DIS:'),band==='long');assert.equal(answer.naturalRoll,band==='normal'?17:8)
})
test('beyond source long range refuses before the d20, action, HP and held physical item change',async t=>{
 const f=fixture(t,{distance:65,dice:'19'})
 await noMutation(f,{},'TARGET_OUT_OF_RANGE');assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('explicit thrown dagger uses its own long range and ability, while the same held dagger defaults to melee',async t=>{
 const f=fixture(t,{weapon:'dagger',distance:5,dice:'17,8,3,19'})
 await noMutation(f,{},'TARGET_OUT_OF_RANGE')
 const answer=ok(await f.attack({attackMode:'thrown'}))
 assert.equal(answer.attackMode,'thrown');assert.equal(answer.rangedContext.rangeBand,'long');assert.equal(answer.rangedContext.longRangeCells,12)
 assert.equal(answer.naturalRoll,8);assert.ok(answer.thrownItem)
 assert.equal(gs.getState().player.inventory.some(item=>item.id==='dagger'),false)
})
test('an explicitly thrown weapon beyond its own long range refuses before leaving the hand or consuming a die',async t=>{
 const f=fixture(t,{weapon:'handaxe',distance:13,dice:'19'})
 await noMutation(f,{attackMode:'thrown'},'TARGET_OUT_OF_RANGE')
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('a different actual nearby hostile that sees the shooter imposes disadvantage when target is distant',async t=>{
 const f=fixture(t,{dice:'17,8,4,19'}),near={...structuredClone(f.target),id:'near',position:{x:1,y:1}}
 f.state.monsters.near=near
 const answer=ok(await f.attack());assert.equal(answer.naturalRoll,8)
 assert.equal(answer.rangedContext.proximityDisadvantage,true);assert.deepEqual(answer.rangedContext.nearbyHostileIds,['near'])
})
for(const condition of ['incapacitated','paralyzed','petrified','stunned','unconscious','blinded'])test('adjacent '+condition+' hostile does not impose the proximity penalty',async t=>{
 const f=fixture(t),near={...structuredClone(f.target),id:'near',position:{x:1,y:1},conditions:[condition]};f.state.monsters.near=near
 const answer=ok(await f.attack());assert.equal(answer.naturalRoll,17);assert.equal(answer.attackRoll.rolls.length,1)
 assert.equal(answer.rangedContext.proximityDisadvantage,false)
})
test('nonhostile actors, intervening walls and directional total cover do not create sight-based proximity disadvantage',t=>{
 const f=fixture(t),near={...structuredClone(f.target),id:'near',position:{x:1,y:1},hostile:false};f.state.monsters.near=near
 assert.deepEqual(nearbyRangedHostiles(f.state.player),[])
 near.hostile=true;f.geometry.edges.push({from:near.position,to:f.state.player.position,kind:'wall'})
 assert.deepEqual(nearbyRangedHostiles(f.state.player),[])
 f.geometry.edges=[]
 assert.deepEqual(nearbyRangedHostiles(f.state.player),['near'])
 const {configureCover}=require('../mcp-server/dist/mcp-server/cover.js')
 configureCover({coverId:'near-shooter-cover',operation:'set',originId:'near',targetId:'player',obstacleCell:f.state.player.position,degree:'total',reason:'Le parapet déclaré masque réellement le tireur depuis ce voisin précis.'})
 assert.deepEqual(nearbyRangedHostiles(f.state.player),[])
})
test('established advantage cancels long-range and proximity disadvantage rather than stacking d20s',async t=>{
 const f=fixture(t,{distance:17,dice:'17,4,19'});f.state.monsters.near={...structuredClone(f.target),id:'near',position:{x:1,y:1}}
 const answer=ok(await f.attack({advantage:true,advantageReason:'Avantage explicitement établi pour ce tir.'}))
 assert.equal(answer.rangedContext.longRangeDisadvantage,true);assert.equal(answer.rangedContext.proximityDisadvantage,true)
 assert.equal(answer.attackRoll.rolls.length,1);assert.equal(answer.naturalRoll,17)
 assert.ok(!/^(ADV|DIS):/.test(answer.attackRoll.detail))
})
test('held ranged d20 preserves source bands, exact hostile witnesses and die across hydration and decline',async t=>{
 const f=fixture(t,{distance:17,dice:'17,16,4,19'});f.state.hero.inspiration.push({targetId:'player',expiresAt:600,die:8})
 const answer=ok(await f.attack());assert.ok(answer.pendingReaction)
 const held=structuredClone(answer.pendingReaction),saved=structuredClone(gs.getState());gs.replaceState(saved)
 assert.deepEqual(gs.getState().hero.pending.command.rangedContext,held.command.rangedContext)
 const resumed=ok(await f.call('resolve_reaction',{pendingId:held.id,choice:'decline'}))
 assert.equal(resumed.naturalRoll,16);assert.deepEqual(resumed.rangedContext,held.command.rangedContext)
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('legacy resolve_attack receives sourced shortbow long range, proximity and refuses range overrides without spending',async t=>{
 const f=fixture(t,{distance:17,legacy:true,dice:'17,8,4,19'})
 f.state.monsters.near={...structuredClone(f.target),id:'near',position:{x:1,y:1}}
 await noMutation(f,{rangeCells:999},'WEAPON_RANGE_OVERRIDE_FORBIDDEN')
 const answer=ok(await f.attack());assert.equal(answer.rangedContext.rangeBand,'long');assert.equal(answer.naturalRoll,8)
 assert.equal(answer.rangedContext.proximityDisadvantage,true)
})
test('a later out-of-long-range multiattack entry refuses the entire actual sequence before its first roll',async t=>{
 const f=fixture(t,{distance:4,dice:'19'});f.state.monsters.far={...structuredClone(f.target),id:'far',position:{x:66,y:2}};f.state.initiativeOrder.push('far')
 const before=structuredClone(gs.getState()),answer=await f.call('resolve_player_multiattack',{attacks:[{targetId:'target',weaponOrSpell:'shortbow',ammunitionItemId:'actual-test-arrows'},{targetId:'far',weaponOrSpell:'shortbow',ammunitionItemId:'actual-test-arrows'}]})
 assert.equal(answer.code,'TARGET_OUT_OF_RANGE');assert.deepEqual(gs.getState(),before)
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('legacy Extra Attack uses the same source long range for every prevalidated shot',async t=>{
 const f=fixture(t,{legacy:true,distance:17,dice:'17,16,4,17,16,4,19'})
 const answer=ok(await f.call('resolve_player_multiattack',{attacks:[{targetId:'target',weaponOrSpell:'shortbow',ammunitionItemId:'actual-test-arrows'},{targetId:'target',weaponOrSpell:'shortbow',ammunitionItemId:'actual-test-arrows'}]}))
 assert.equal(answer.attacks.length,2)
 for(const attack of answer.attacks){assert.equal(attack.rangedContext.rangeBand,'long');assert.equal(attack.naturalRoll,16)}
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})

test('stdio MCP resolves a real equipped shortbow with a separate adjacent hostile and preserves the following die',async t=>{
 const {engine,ok,replace,spawn,battle,grid}=require('./helpers/mcp-toolkit.cjs')
 const {getMapSpec,inferRoomIdOnMap}=require('../mcp-server/dist/lib/adventure-map.js')
 const call=await engine(t,{dice:'17,16,4,19'}),initial=await call('get_game_state')
 const loadout=initial.dmTools?.loadout,main=loadout?.mainHandId??initial.player.inventory.find(item=>item.type==='weapon')?.id
 if(main)ok(await call('equip_item',{itemId:main,slot:'main_hand',operation:'unequip'}))
 const shield=loadout?.shieldId??initial.player.inventory.find(item=>(item.equipmentId??item.id)==='shield')?.id
 if(shield)ok(await call('equip_item',{itemId:shield,slot:'shield',operation:'unequip'}))
 await replace(call,state=>state.player.inventory.push({id:'actual-bow',equipmentId:'shortbow',name:'Arc court réel',type:'weapon'}))
 ok(await call('equip_item',{itemId:'actual-bow',slot:'main_hand',operation:'equip'}))
 ok(await call('create_ammunition',{itemId:'actual-arrows',ammunitionType:'arrow',quantity:3,name:'Flèches réelles',description:'Un petit stock réel posé au sol.',cell:initial.player.position}))
 ok(await call('pick_up_item',{itemId:'actual-arrows'}))
 const target=await spawn(call),near=await spawn(call),state=await call('get_game_state'),nav=grid(state),map=getMapSpec(state.currentMapId,state)
 let cells
 for(let y=0;y<map.grid.rows&&!cells;y++)for(let x=0;x<map.grid.cols-4&&!cells;x++){
  const line=Array.from({length:5},(_,n)=>({x:x+n,y}))
  if(line.every(cell=>nav.free(cell,false)&&inferRoomIdOnMap(cell,state.currentMapId,state)===state.currentRoomId))cells=line
 }
 assert.ok(cells,'actual room supplies a straight clear five-cell firing lane')
 await replace(call,state=>{state.player.position=cells[0];state.monsters[target.id].position=cells[4];state.monsters[near.id].position=cells[1]})
 await battle(call,[target.id,near.id])
 const answer=ok(await call('resolve_player_attack',{targetId:target.id,weaponOrSpell:'actual-bow',ammunitionItemId:'actual-arrows'}))
 assert.equal(answer.naturalRoll,16);assert.equal(answer.rangedContext.proximityDisadvantage,true)
 assert.deepEqual(answer.rangedContext.nearbyHostileIds,[near.id])
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
