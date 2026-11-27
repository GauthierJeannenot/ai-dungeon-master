const test=require('node:test'),assert=require('node:assert/strict')
Object.assign(process.env,{MONETIZATION_ENABLED:'false',LLM_MODE:'mock',ALLOW_PAID_LLM:'false',LLM_PROVIDER: 'openai',DM_RATE_LIMIT_PER_MINUTE:'0',APP_LOG_PERSIST_ENABLED:'false'})
const {installPgMem}=require('./helpers/pg-mem.cjs'),pg=installPgMem()
const {engine,ok,grid}=require('./helpers/mcp-toolkit.cjs')
const {setupOverrun,prepareOverrunAtCurrentSite,persistOverrun}=require('./helpers/dmg-overrun-fixture.cjs')
test.after(()=>pg.restore())
async function unchanged(call,name,input,code){const before=await call('get_game_state'),answer=await call(name,input);if(code)assert.equal(answer.code,code,JSON.stringify(answer));else assert.ok(answer.error,JSON.stringify(answer));assert.deepEqual(await call('get_game_state'),before);return answer}

test('explicit optional Overrun spends one whole action and 15 feet for the chosen physical 10-foot crossing, without creating an Attack action; SQL retains its completed source',async t=>{
 const f=await setupOverrun(t),before=await f.call('get_game_state'),a=ok(await f.call('combat_action',f.input));assert.equal(a.success,true)
 assert.deepEqual(a.contest.check.roll.rolls,[18]);assert.deepEqual(a.contest.opposition.roll.rolls,[1]);assert.equal(a.movement.costCells,3);assert.equal(a.movement.distanceFeet,10)
 const after=await f.call('get_game_state');assert.deepEqual(after.player.position,f.path[2]);assert.deepEqual(after.monsters[f.target.id].position,f.path[1]);assert.equal(after.hero.actionCredits,0);assert.equal(after.actionUsed.player,true);assert.equal(after.hero.attackAction,undefined);assert.equal(after.movementUsed.player,3);assert.equal(after.worldTimeSeconds,before.worldTimeSeconds)
 const fresh=await persistOverrun(t,f.call),same=ok(await fresh('move_token',{tokenId:'player',toCell:f.path[2],overrunId:a.overrunId}));assert.equal(same.replayed,true);assert.deepEqual(await fresh('get_game_state'),after);assert.equal(ok(await fresh('roll_dice',{notation:'1d20'})).total,19);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,17)
})

test('bonus-action Overrun preserves the real action and Extra Attack, whereas action Overrun cannot replace a remaining attack',async t=>{
 const bonus=await setupOverrun(t,{cost:'bonus_action'});ok(await bonus.call('combat_action',bonus.input));const s=await bonus.call('get_game_state');assert.equal(s.hero.actionCredits,1);assert.equal(s.actionUsed.player,undefined);assert.equal(s.bonusActionUsed.player,true);assert.equal(s.hero.attackAction,undefined)
 ok(await bonus.call('combat_action',{action:'dash'}));assert.equal((await bonus.call('get_game_state')).hero.actionCredits,0)
 const f=await setupOverrun(t,{dice:'20,1,1,17'});ok(await f.call('resolve_player_attack',{targetId:f.target.id,weaponOrSpell:'unarmed'}));const before=await f.call('get_game_state');assert.equal(before.hero.attackAction.remaining,1)
 await unchanged(f.call,'combat_action',f.input,'ACTION_ALREADY_USED');assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,17)
})

test('Overrun failure or tie spends its selected bonus action while retaining both real positions and all movement',async t=>{
 for(const dice of ['20,1,1,20,17','20,1,4,11,17']){
  const f=await setupOverrun(t,{cost:'bonus_action',dice}),before=await f.call('get_game_state'),a=ok(await f.call('combat_action',f.input));assert.equal(a.success,false)
  const after=await f.call('get_game_state');assert.deepEqual(after.player.position,before.player.position);assert.deepEqual(after.monsters[f.target.id].position,before.monsters[f.target.id].position);assert.deepEqual(after.movementUsed,before.movementUsed);assert.equal(after.bonusActionUsed.player,true);assert.equal(after.hero.actionCredits,1);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,17)
 }
})

test('actual qualified Small/Medium sizes grant only the printed Overrun disadvantage or advantage',async t=>{
 for(const [size,monsterType,expected]of [['Small','bandit','DIS'],['Medium','goblin','ADV']]){
  const f=await setupOverrun(t,{size,monsterType,dice:'20,1,20,18,1,17'}),a=ok(await f.call('combat_action',f.input));assert.equal(a.success,true);assert.match(a.contest.check.roll.detail,new RegExp(expected));assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,17);await persistOverrun(t,f.call)
 }
})

test('missing route/cost, a bent or occupied exit, insufficient real movement, and an incapable defender refuse before any source die or cost',async t=>{
 const f=await setupOverrun(t,{dice:'20,1,17'}),p=f.path
 for(const input of [{...f.input,overrunCost:undefined},{...f.input,overrunPath:undefined},{...f.input,overrunPath:[p[0],p[1],p[0]]},{...f.input,overrunPath:[p[0],p[1],{x:p[1].x+1,y:p[1].y+1}]},{...f.input,action:'dash'}])await unchanged(f.call,'combat_action',input)
 assert.equal((await f.call('get_game_state')).dmTools.overrun,undefined);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,17)
 const blocked=await setupOverrun(t,{dice:'20,1,17',beforeCombat:async f=>ok(await f.call('create_scene_object',{objectId:'exit-real-wall',name:'Bloc de pierre',description:'Bloc solide réel qui ferme exactement la sortie.',cell:f.path[2],kind:'obstacle',material:'stone',size:'small',resilience:'resilient'}))});await unchanged(blocked.call,'combat_action',blocked.input,'OVERRUN_PATH_BLOCKED');assert.equal(ok(await blocked.call('roll_dice',{notation:'1d20'})).total,17)
 const stunned=await setupOverrun(t,{dice:'20,1,17',beforeCombat:async f=>ok(await f.call('apply_condition',{entityId:f.target.id,condition:'stunned'}))});await unchanged(stunned.call,'combat_action',stunned.input,'OVERRUN_CAPABLE_CONTEST_REQUIRED')
 const tired=await setupOverrun(t,{dice:'20,1,17'}),initial=await tired.call('get_game_state'),nav=grid(initial),from=tired.path[0],step=nav.neighbors(from).find(c=>Math.abs(c.x-from.x)+Math.abs(c.y-from.y)===1&&nav.step(from,c)&&require('../mcp-server/dist/lib/adventure-map.js').inferRoomIdOnMap(c,initial.currentMapId,initial)===initial.currentRoomId);assert.ok(step)
 for(const toCell of [step,from,step,from]){
  let moved=ok(await tired.call('move_token',{tokenId:'player',toCell}));while(moved.pendingReaction)moved=ok(await tired.call('resolve_reaction',{pendingId:moved.pendingReaction.id,choice:'decline'}))
  assert.deepEqual((await tired.call('get_game_state')).player.position,toCell)
 }
 assert.equal((await tired.call('get_game_state')).movementUsed.player,4);await unchanged(tired.call,'combat_action',tired.input,'MOVEMENT_EXCEEDED');assert.equal(ok(await tired.call('roll_dice',{notation:'1d20'})).total,17)

})

test('the genuine Bardic defender window retains source/cost/route through SQL, rejects orphan/tampered imports, and pays only after its explicit choice',async t=>{
 const f=await setupOverrun(t,{characterId:'bard',dice:'20,1,18,1,17',beforeCombat:async f=>ok(await f.call('use_subclass_feature',{featureId:'bardic_inspiration',targetId:f.target.id}))}),held=ok(await f.call('combat_action',f.input));assert.ok(held.pendingReaction.options.includes('bardic_inspiration'))
 const state=await f.call('get_game_state');assert.deepEqual(state.player.position,f.path[0]);assert.equal(state.hero.actionCredits,1);assert.equal(state.actionUsed.player,undefined)
 const fresh=await persistOverrun(t,f.call,'19')
 for(const mutate of [s=>delete s.dmTools.overrun,s=>delete s.hero.pending.command.toolkitResolution.command.overrunId,s=>s.hero.pending.roll.total++,s=>Object.values(s.dmTools.overrun.attempts)[0].input.path[2].x++,s=>s.player.position.x++]){const bad=structuredClone(state);mutate(bad);await unchanged(fresh,'replace_game_state',{gameState:bad},'OVERRUN_STATE_MISMATCH')}
 const done=ok(await fresh('resolve_reaction',{pendingId:held.pendingReaction.id,choice:'decline'}));assert.equal(done.success,true);assert.deepEqual((await fresh('get_game_state')).player.position,f.path[2]);assert.equal((await fresh('get_game_state')).hero.actionCredits,0);await persistOverrun(t,fresh);assert.equal(ok(await fresh('roll_dice',{notation:'1d20'})).total,19)
})

test('a real middle-cell slippery-ice entry refuses before the contest and never persists the mover in occupied space',async t=>{
 const f=await setupOverrun(t,{dice:'20,1,17',beforeCombat:async f=>{
  const s=await f.call('get_game_state'),source='Le MJ mesure la vraie plaque de glace sous la case occupée.',fact=ok(await f.call('record_scene_fact',{cell:f.path[1],description:source})).worldFact
  ok(await f.call('record_vertical_surface',{eventId:'overrun-ice-support',surfaceId:'overrun-ice-support',mapId:s.currentMapId,roomId:s.currentRoomId,cells:[f.path[1]],kind:'support',elevationFeet:0,actualGeometryConfirmed:true,source}))
  ok(await f.call('record_slippery_ice',{zoneId:'overrun-middle-ice',surfaceId:'overrun-ice-support',cells:[f.path[1]],factId:fact.id,actualSlipperyIceConfirmed:true}))
 }})
 await unchanged(f.call,'combat_action',f.input);assert.deepEqual((await f.call('get_game_state')).player.position,f.path[0]);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,17)
})

test('the real POST recognizes action Overrun as primary and bonus Overrun leaves the real primary action available',async t=>{
 const {play,lastResult}=require('./helpers/dm-scripted-turn.cjs')
 for(const cost of ['action','bonus_action']){
  const f=await setupOverrun(t,{cost,dice:'20,1,18,1,1,17'}),calls=[{name:'combat_action',input:f.input},(params,context)=>{
   const state=context.gameState;assert.deepEqual(state.player.position,f.path[2]);assert.equal(state.hero.actionCredits,cost==='action'?0:1);assert.equal(state.bonusActionUsed.player??false,cost==='bonus_action');assert.equal(state.hero.attackAction,undefined);assert.equal(state.movementUsed.player,3)
   return cost==='bonus_action'?{name:'combat_action',input:{action:'dash'}}:{name:'next_turn',input:{actorId:'player'}}
  }]
  if(cost==='bonus_action')calls.push((params,context)=>{const state=context.gameState;assert.equal(state.hero.actionCredits,0);assert.equal(state.actionUsed.player,true);return{name:'next_turn',input:{actorId:'player'}}})
  calls.push({name:'run_monster_turns',input:{}},params=>{assert.equal(lastResult(params).turnsResolved,1);return 'Le passage choisi et son coût réel ont été résolus, puis le tour adverse réel a pris fin.'})
  const played=await play(t,f.call,calls,'Je tente ce passage précis avec le coût choisi, puis mon action si elle reste disponible et je termine le vrai tour.');assert.deepEqual(played.result.newGameState.player.position,f.path[2]);assert.equal(played.seen.length,cost==='bonus_action'?4:3);assert.equal(played.result.newGameState.currentTurn,'player');assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,17)
 }
})

test('a genuine pre-entry opportunity attack pauses on the free departure square, retains a nested Shield continuation through SQL, and cannot skip a reactor by tampering ignored IDs',async t=>{
 const call=await engine(t,{characterId:'wizard',dice:'20,1,20,1,17'}),f=await prepareOverrunAtCurrentSite(call)
 const [from,through]=f.path,nav=grid(await call('get_game_state')),behind=nav.neighbors(from).find(c=>nav.step(from,c)&&Math.max(Math.abs(c.x-through.x),Math.abs(c.y-through.y))>1);assert.ok(behind,'A real free pre-entry reactor cell is required')
 const guard=ok(await call('spawn_monster',{monsterType:'bandit',cell:behind}));ok(await call('enter_combat',{combatants:['player',f.target.id,guard.id],tieOrder:['player',f.target.id,guard.id]}))
 const held=ok(await call('combat_action',f.input));assert.equal(held.pendingReaction.kind,'movement');assert.equal(held.pendingReaction.sourceId,guard.id)
 const paid=await call('get_game_state');assert.deepEqual(paid.player.position,from);assert.equal(paid.hero.actionCredits,0);assert.equal(paid.movementUsed.player??0,0)
 const fresh=await persistOverrun(t,call,'12,17'),window=held.pendingReaction,boundary=window.command.opportunityBoundary
 const nested=ok(await fresh('resolve_reaction',{pendingId:window.id,choice:'opportunity_attack',weaponOrSpell:boundary.choices[0].weaponOrSpell}));assert.ok(nested.pendingReaction.options.includes('shield'))
 const inside=await fresh('get_game_state');assert.deepEqual(inside.player.position,from);assert.equal(inside.hero.actionCredits,0);assert.equal(inside.movementUsed.player??0,0)
 const replay=await persistOverrun(t,fresh,'17');for(const mutate of [s=>s.hero.pending.continuation.ignored.push(f.target.id),s=>delete s.dmTools.overrun,s=>delete s.hero.pending.continuation.overrunId,s=>{s.hero.pending.continuation={type:'engine-effect',domain:'dmg-overrun',command:{}}},s=>{const a=Object.values(s.dmTools.overrun.attempts)[0];a.status='complete';a.used=true}]){const bad=structuredClone(inside);mutate(bad);await unchanged(replay,'replace_game_state',{gameState:bad},'OVERRUN_STATE_MISMATCH')}
 const done=ok(await replay('resolve_reaction',{pendingId:inside.hero.pending.id,choice:'shield',slotLevel:1}));assert.equal(done.success,true);const after=await replay('get_game_state');assert.deepEqual(after.player.position,f.path[2]);assert.equal(after.movementUsed.player,3);assert.equal(after.hero.actionCredits,0);assert.equal(after.hero.reactionsUsed[guard.id],true);assert.equal(after.hero.reactionsUsed.player,true);assert.equal(after.dmTools.overrun.attempts[done.overrunId].actualReactions,undefined);assert.equal(after.dmTools.overrun.attempts[done.overrunId].reactionResults.length,1);await persistOverrun(t,replay);assert.equal(ok(await replay('roll_dice',{notation:'1d20'})).total,17)
})

test('a real second-edge opportunity boundary refuses the entire occupied crossing before either contest die or selected cost',async t=>{
 const call=await engine(t,{dice:'20,1,17'}),f=await prepareOverrunAtCurrentSite(call),[from,through]=f.path,dx=through.x-from.x,dy=through.y-from.y,nav=grid(await call('get_game_state'))
 const cell=[{x:from.x-dy,y:from.y+dx},{x:from.x+dy,y:from.y-dx}].find(c=>nav.free(c));assert.ok(cell)
 const guard=ok(await call('spawn_monster',{monsterType:'bandit',cell}));ok(await call('enter_combat',{combatants:['player',f.target.id,guard.id],tieOrder:['player',f.target.id,guard.id]}))
 await unchanged(call,'combat_action',f.input,'OVERRUN_OCCUPIED_REACTION_UNREPRESENTED');assert.equal((await call('get_game_state')).dmTools.overrun,undefined);assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,17)
})


test('a real massive-damage opportunity attack retains death, original action and reaction receipts, and stops before occupied entry without rollback through SQL',async t=>{
 const call=await engine(t,{characterId:'wizard',dice:'20,20,1,1,20,18,1,17'}),f=await prepareOverrunAtCurrentSite(call),[from,through]=f.path
 const nav=grid(await call('get_game_state')),behind=nav.neighbors(from).find(c=>nav.step(from,c)&&Math.max(Math.abs(c.x-through.x),Math.abs(c.y-through.y))>1);assert.ok(behind,'A real free pre-entry knight cell is required')
 const knight=ok(await call('spawn_monster',{monsterType:'knight',cell:behind}))
 ok(await call('add_exhaustion',{eventId:'actual-massive-oa-fatigue',targetId:'player',levels:4,reason:'Le MJ constate quatre niveaux réels après les efforts épuisants déjà établis dans cette préparation.'}))
 const fatigued=await call('get_game_state');assert.ok(fatigued.player.hp.max<28)
 ok(await call('update_hp',{entityId:'player',delta:1-fatigued.player.hp.current,reason:'Le MJ résout les vrais dégâts précédents qui laissent ce personnage vivant à un point de vie.'}))
 ok(await call('enter_combat',{combatants:['player',f.target.id,knight.id],tieOrder:['player',f.target.id,knight.id]}))
 const held=ok(await call('combat_action',f.input));assert.equal(held.pendingReaction.sourceId,knight.id);assert.deepEqual((await call('get_game_state')).player.position,from)
 const fresh=await persistOverrun(t,call,'20,6,6,6,6,17'),weapon=held.pendingReaction.command.opportunityBoundary.choices.find(c=>c.weaponOrSpell==='Greatsword');assert.ok(weapon)
 const initial=ok(await fresh('resolve_reaction',{pendingId:held.pendingReaction.id,choice:'opportunity_attack',weaponOrSpell:weapon.weaponOrSpell}));let done=initial
 if(initial.pendingReaction){assert.ok(initial.pendingReaction.options.includes('shield'));done=ok(await fresh('resolve_reaction',{pendingId:initial.pendingReaction.id,choice:'decline'}))}
 assert.equal(done.movementStopped,true);assert.equal(done.stopReason,'actual_reaction_ended_permission');assert.equal(done.costPaid,true);assert.equal(done.actualReactions.length,1)
 const after=await fresh('get_game_state');assert.equal(after.player.hp.current,0);assert.equal(after.player.deathSaves.dead,true);assert.ok(after.player.hp.max<=26);assert.deepEqual(after.player.position,from);assert.equal(after.hero.actionCredits,0);assert.equal(after.movementUsed.player??0,0);assert.equal(after.hero.reactionsUsed[knight.id],true);assert.equal(after.hero.pending,undefined);assert.equal(after.dmTools.overrun.attempts[done.overrunId].status,'stopped')
 const restored=await persistOverrun(t,fresh,'19');await unchanged(restored,'move_token',{tokenId:'player',toCell:f.path[2],overrunId:done.overrunId},'OVERRUN_PERMISSION_EXPIRED');assert.equal(ok(await restored('roll_dice',{notation:'1d20'})).total,19);assert.equal(ok(await fresh('roll_dice',{notation:'1d20'})).total,17)
})
