const test=require('node:test'),assert=require('node:assert/strict')
const {engine,ok,replace,spawn,battle}=require('./helpers/mcp-toolkit.cjs')
const {getMapSpec}=require('../mcp-server/dist/lib/adventure-map.js')
const {getMonsterRecord}=require('../mcp-server/dist/lib/srd/monsters.js')
const {navigationActor,navigationGrid,navigationPathCost}=require('../mcp-server/dist/lib/navigation.js')
const {planNavigation}=require('../mcp-server/dist/mcp-server/navigation.js')
const gs=require('../mcp-server/dist/mcp-server/game-state.js')
const distance=(a,b)=>Math.max(Math.abs(a.x-b.x),Math.abs(a.y-b.y))
function profile(type='ghost'){
 const monster={...structuredClone(getMonsterRecord(type).engine),id:'native-hover',position:{x:2,y:2},isAlive:true}
 return {player:{id:'player',position:{x:0,y:0},hp:{current:10,max:10},conditions:[],inventory:[],stats:{dex:10}},monsters:{[monster.id]:monster},hero:{effects:[]},worldTimeSeconds:0}
}
function routeGrid(state,id,mode='fly'){
 return navigationGrid(state,id,getMapSpec(state.currentMapId,state).geometry,{movementMode:mode})
}
function destination(state,id,predicate=()=>true){
 const from=state.monsters[id].position,g=routeGrid(state,id)
 const cell=g.neighbors(from).find(cell=>(cell.x===from.x||cell.y===from.y)&&g.step(from,cell)&&predicate(cell))
 assert.ok(cell,'the current map supplies a legal cardinal fixture destination')
 return cell
}
async function refusesUnchanged(call,name,input,code){
 const before=await call('get_game_state'),answer=await call(name,input)
 assert.equal(answer.code,code,JSON.stringify(answer));assert.deepEqual(await call('get_game_state'),before)
}

test('native hover flight reads immutable fly speed and never turns absent walking mode into automatic flight',()=>{
 for(const [type,speed]of [['ghost',40],['will_o_wisp',50]]){
  const state=profile(type),id='native-hover',before=structuredClone(state)
  assert.equal(navigationActor(state,id).speed,0)
  assert.equal(navigationActor(state,id,'fly').speed,speed)
  assert.deepEqual(state,before)
  state.monsters[id].movementModes.fly=999
  assert.equal(navigationActor(state,id,'fly').speed,speed,'mutable metadata cannot grant a larger native fly speed')
 }
 const player=profile();player.player.movementModes={fly:50,hover:true,walk:0}
 assert.throws(()=>navigationActor(player,'player','fly'),{code:'HOVER_FLIGHT_ACTOR_UNSUPPORTED'})
 assert.throws(()=>navigationActor(profile('sprite'),'native-hover','fly'),{code:'HOVER_FLIGHT_ACTOR_UNSUPPORTED'})
})

test('flight keeps actual slowing, Dash and inability-to-move gates without changing source speed',()=>{
 const state=profile(),id='native-hover'
 state.hero.effects.push({id:'slow',kind:'ray-of-frost',sourceId:'player',targetIds:[id],expiresAt:60,data:{}})
 assert.equal(navigationActor(state,id,'fly').speed,30)
 state.hero.effects.push({id:'dash',kind:'dash',sourceId:id,targetIds:[id],expiresAt:60,data:{}})
 assert.equal(navigationActor(state,id,'fly').speed,60)
 assert.equal(state.monsters[id].speed,0)
 state.monsters[id].conditions.push('unconscious')
 assert.throws(()=>navigationActor(state,id,'fly'),{code:'ACTOR_IMMOBILE'})
})

test('explicit hover preview is read-only, default walking still refuses, and execution uses the exact chosen cell without dice',async t=>{
 const call=await engine(t,{dice:'17'}),actor=await spawn(call,'ghost'),state=await call('get_game_state'),toCell=destination(state,actor.id)
 await refusesUnchanged(call,'preview_navigation',{tokenId:actor.id,toCell},'ACTOR_IMMOBILE')
 const before=await call('get_game_state'),preview=ok(await call('preview_navigation',{tokenId:actor.id,toCell,movementMode:'fly'}))
 assert.equal(preview.movementMode,'fly');assert.equal(preview.movementScope,'native_hover_horizontal_projection')
 assert.equal(preview.costCells,1);assert.deepEqual(await call('get_game_state'),before)
 const moved=ok(await call('move_token',{tokenId:actor.id,toCell,movementMode:'fly'}))
 assert.equal(moved.goalReached,true);assert.deepEqual(moved.newPosition,toCell)
 const after=await call('get_game_state');assert.deepEqual(after.monsters[actor.id].position,toCell)
 assert.equal(after.monsters[actor.id].speed,0);assert.deepEqual(after.monsters[actor.id].movementModes,before.monsters[actor.id].movementModes)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,17)
})

for(const [type,speed]of [['ghost',40],['will_o_wisp',50]])test(type+' spends its actual native fly budget on its own combat turn',async t=>{
 const call=await engine(t),actor=await spawn(call,type)
 await battle(call,[actor.id],actor.id)
 await replace(call,state=>{state.movementUsed[actor.id]=speed/5-1;state.hero.reactionsUsed.player=true})
 const state=await call('get_game_state'),toCell=destination(state,actor.id)
 const moved=ok(await call('move_token',{tokenId:actor.id,toCell,movementMode:'fly'}))
 assert.equal(moved.remainingMovement,0)
 const after=await call('get_game_state');assert.equal(after.movementUsed[actor.id],speed/5)
 assert.equal(after.actionUsed[actor.id]??false,false,'movement does not spend the action')
 const further=destination(after,actor.id)
 await refusesUnchanged(call,'move_token',{tokenId:actor.id,toCell:further,movementMode:'fly'},'MOVEMENT_EXCEEDED')
})

test('horizontal hover ignores ground difficult terrain while preserving walls, blocked cells and occupancy',async t=>{
 const call=await engine(t),actor=await spawn(call,'ghost'),state=await call('get_game_state'),toCell=destination(state,actor.id)
 const map=getMapSpec(state.currentMapId,state),old=map.terrain
 t.after(()=>{map.terrain=old})
 map.terrain=[...(old??[]),{id:'hover-test-ground',kind:'difficult',cells:[toCell]}]
 const path=[actor.position,toCell]
 assert.equal(navigationPathCost(state,path,actor.id),2)
 assert.equal(navigationPathCost(state,path,actor.id,'fly'),1)
 const base=map.geometry??{blockedCells:[],edges:[]}
 const wall={...base,edges:[...(base.edges??[]),{from:actor.position,to:toCell,kind:'wall'}]}
 assert.equal(navigationGrid(state,actor.id,wall,{movementMode:'fly'}).step(actor.position,toCell),false)
 const blocked={...base,blockedCells:[...(base.blockedCells??[]),toCell]}
 assert.equal(navigationGrid(state,actor.id,blocked,{movementMode:'fly'}).free(toCell),false)
 assert.equal(routeGrid(state,actor.id).free(state.player.position),false)
})

test('non-hover flight and unknown movement modes refuse before movement or dice',async t=>{
 const call=await engine(t,{dice:'17'}),actor=await spawn(call,'sprite'),state=await call('get_game_state'),toCell=destination(state,actor.id)
 await refusesUnchanged(call,'move_token',{tokenId:actor.id,toCell,movementMode:'fly'},'HOVER_FLIGHT_ACTOR_UNSUPPORTED')
 const before=await call('get_game_state'),unknown=await call('move_token',{tokenId:actor.id,toCell,movementMode:'burrow'})
 assert.ok(unknown.error);assert.deepEqual(await call('get_game_state'),before)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,17)
})

test('an opportunity window and its restored continuation preserve exact explicit flight mode',async t=>{
 const call=await engine(t,{dice:'17'}),actor=await spawn(call,'ghost')
 await battle(call,[actor.id],actor.id)
 const state=await call('get_game_state'),toCell=destination(state,actor.id,cell=>distance(cell,state.player.position)>1)
 const paused=ok(await call('move_token',{tokenId:actor.id,toCell,movementMode:'fly'}))
 assert.equal(paused.stopReason,'reaction_decision');assert.equal(paused.distanceMoved,0)
 const saved=await call('get_game_state'),pending=saved.hero.pending
 assert.equal(pending.kind,'movement');assert.equal(pending.command.movementMode,'fly');assert.deepEqual(pending.command.goal.cell,toCell)
 ok(await call('replace_game_state',{gameState:saved}))
 const resolved=ok(await call('resolve_reaction',{pendingId:pending.id,choice:'decline'}))
 assert.equal(resolved.movement.movementMode,'fly');assert.deepEqual(resolved.movement.finalPosition,toCell)
 const after=await call('get_game_state');assert.equal(after.hero.pending,undefined);assert.equal(after.movementUsed[actor.id],1)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,17)
})

test('readied and grappled horizontal flight are refused before changing their private budgets',async t=>{
 const call=await engine(t),actor=await spawn(call,'ghost'),state=await call('get_game_state'),toCell=destination(state,actor.id)
 const original=structuredClone(gs.getState());t.after(()=>gs.replaceState(original))
 gs.replaceState(state)
 const before=structuredClone(gs.getState())
 assert.throws(()=>planNavigation(actor.id,{kind:'cell',cell:toCell},false,[],true,undefined,'fly'),{code:'HOVER_FLIGHT_COMBINATION_UNSUPPORTED'})
 assert.deepEqual(gs.getState(),before)
 assert.throws(()=>planNavigation(actor.id,{kind:'cell',cell:toCell},false,[],false,{targetId:'player',targetToCell:state.player.position},'fly'),{code:'HOVER_FLIGHT_COMBINATION_UNSUPPORTED'})
 assert.deepEqual(gs.getState(),before)
})
