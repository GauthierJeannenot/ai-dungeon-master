const test=require('node:test'),assert=require('node:assert/strict')
const {engine,ok,replace,spawn,adjacent,grid}=require('./helpers/mcp-toolkit.cjs')
const {CombatSurpriseInputSchema,SurpriseStateSchema,isSurprised,validateSurpriseState}=require('../mcp-server/dist/lib/surprise-state.js')
const reason='Ces participants n’ont pas perçu la menace déjà établie avant le combat.'
async function begin(call,ids,surprisedIds){
 return ok(await call('enter_combat',{combatants:['player',...ids],...(surprisedIds?{surprise:{surprisedIds,reason}}:{})}))
}
async function refused(call,name,input,code){
 const before=await call('get_game_state'),result=await call(name,input)
 assert.equal(result.code,code,JSON.stringify(result));assert.deepEqual(await call('get_game_state'),before)
}
const distance=(a,b)=>Math.max(Math.abs(a.x-b.x),Math.abs(a.y-b.y))

test('explicit surprise blocks player action, bonus action and movement without any debit or die',async t=>{
 const call=await engine(t,{dice:'20,1,17'}),monster=await spawn(call)
 const result=await begin(call,[monster.id],['player'])
 assert.equal(result.currentTurn,'player');assert.equal(result.surprise.actors.player.firstTurnEnded,false)
 const state=await call('get_game_state');assert.ok(isSurprised(state,'player'))
 await refused(call,'resolve_attack',{attackerId:'player',targetId:monster.id,weaponOrSpell:'unarmed'},'ACTOR_SURPRISED')
 await refused(call,'combat_action',{actorId:'player',action:'dodge'},'ACTOR_SURPRISED')
 await refused(call,'combat_action',{actorId:'player',action:'ready',readied:{kind:'move',trigger:'Le garde approche.'}},'ACTOR_SURPRISED')
 await refused(call,'use_class_feature',{featureId:'second_wind'},'ACTOR_SURPRISED')
 await refused(call,'move_token',{tokenId:'player',toCell:state.player.position},'ACTOR_SURPRISED')
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,17)
})

test('surprised monster cannot attack, move or use its actual source power before its first turn ends',async t=>{
 const call=await engine(t,{dice:'1,20,17'}),monster=await spawn(call,'sprite')
 assert.equal((await begin(call,[monster.id],[monster.id])).currentTurn,monster.id)
 await refused(call,'resolve_monster_action',{monsterId:monster.id,actionName:'Longsword',targetId:'player'},'ACTOR_SURPRISED')
 await refused(call,'use_monster_power',{monsterId:monster.id,powerName:'Invisibility'},'ACTOR_SURPRISED')
 await refused(call,'move_token',{tokenId:monster.id,toCell:monster.position},'ACTOR_SURPRISED')
 ok(await call('next_turn',{actorId:monster.id}))
 const state=await call('get_game_state');assert.equal(state.currentTurn,'player')
 assert.equal(state.dmTools.surprise.actors[monster.id].firstTurnEnded,true)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,17)
})

test('a surprised wizard cannot offer Shield before its first turn, including after the normal start-turn reaction reset',async t=>{
 const call=await engine(t,{characterId:'wizard',dice:'1,20,17,1,19'}),monster=await spawn(call)
 assert.equal((await begin(call,[monster.id],['player'])).currentTurn,monster.id)
 const attack=ok(await call('resolve_attack',{attackerId:monster.id,targetId:'player',weaponOrSpell:'Scimitar'}))
 assert.equal(attack.pendingReaction,undefined);assert.equal((await call('get_game_state')).hero.pending,undefined)
 ok(await call('next_turn',{actorId:monster.id}))
 const state=await call('get_game_state');assert.equal(state.currentTurn,'player')
 assert.equal(state.hero.reactionsUsed.player,false);assert.ok(isSurprised(state,'player'))
 assert.equal(state.dmTools.surprise.actors.player.firstTurnEnded,false)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('reaction returns immediately after the surprised wizard first turn ends, before its next turn',async t=>{
 const call=await engine(t,{characterId:'wizard',dice:'20,1,17,1'}),monster=await spawn(call)
 assert.equal((await begin(call,[monster.id],['player'])).currentTurn,'player')
 ok(await call('next_turn',{actorId:'player'}))
 const state=await call('get_game_state');assert.equal(state.currentTurn,monster.id)
 assert.equal(state.dmTools.surprise.actors.player.firstTurnEnded,true);assert.ok(!isSurprised(state,'player'))
 const attack=ok(await call('resolve_attack',{attackerId:monster.id,targetId:'player',weaponOrSpell:'Scimitar'}))
 assert.ok(attack.pendingReaction?.options.includes('shield'))
 const held=await call('get_game_state');ok(await call('replace_game_state',{gameState:held}))
 assert.deepEqual(await call('get_game_state'),held)
})

test('explicit monster batch passes a surprised first turn without moving, attacking or inventing an extra tool call',async t=>{
 const call=await engine(t,{dice:'1,20,17'}),monster=await spawn(call)
 await begin(call,[monster.id],[monster.id]);const before=await call('get_game_state')
 const batch=ok(await call('run_monster_turns'))
 assert.equal(batch.turnsResolved,1);assert.equal(batch.resolvedTurns[0].note,'surprised')
 assert.equal(batch.resolvedTurns[0].moved,0);assert.equal(batch.resolvedTurns[0].attack,null)
 const after=await call('get_game_state');assert.deepEqual(after.monsters[monster.id].position,before.monsters[monster.id].position)
 assert.deepEqual(after.player.hp,before.player.hp);assert.equal(after.currentTurn,'player')
 assert.equal(after.dmTools.surprise.actors[monster.id].firstTurnEnded,true)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,17)
})

test('unknown and duplicate surprise choices refuse before initiative, phase or ledger mutation',async t=>{
 const call=await engine(t,{dice:'17'}),monster=await spawn(call)
 for(const [surprisedIds,code]of [[['missing'],'SURPRISED_ACTOR_NOT_IN_COMBAT'],[['player','player'],'DUPLICATE_SURPRISED_ACTOR']])
  await refused(call,'enter_combat',{combatants:['player',monster.id],surprise:{surprisedIds,reason}},code)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,17)
})

test('surprise survives hydration and corrupt combat, map, actor or roster references refuse before mutation',async t=>{
 const call=await engine(t,{dice:'20,1,17'}),monster=await spawn(call),outsider=await spawn(call)
 await begin(call,[monster.id],['player',monster.id]);const saved=await call('get_game_state')
 ok(await call('replace_game_state',{gameState:saved}));assert.deepEqual(await call('get_game_state'),saved)
 for(const change of [s=>s.dmTools.surprise.combatGeneration++,s=>s.dmTools.surprise.mapId='another-map',
  s=>s.dmTools.surprise.actors.missing={firstTurnEnded:false},s=>s.dmTools.surprise.actors[outsider.id]={firstTurnEnded:false},
  s=>Object.assign(s,{phase:'exploration',currentTurn:null,initiativeOrder:[],round:0})]){
  const corrupt=structuredClone(saved);change(corrupt)
  await refused(call,'replace_game_state',{gameState:corrupt},'SURPRISE_STATE_MISMATCH')
 }
 assert.ok(isSurprised(await call('get_game_state'),'player'))
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,17)
})

test('surprise ends individually and remains ended with the same initiative in the next round',async t=>{
 const call=await engine(t,{dice:'20,1,17'}),monster=await spawn(call)
 await begin(call,[monster.id],['player',monster.id]);ok(await call('next_turn',{actorId:'player'}))
 let state=await call('get_game_state');assert.ok(!isSurprised(state,'player'));assert.ok(isSurprised(state,monster.id))
 ok(await call('next_turn',{actorId:monster.id}));state=await call('get_game_state')
 assert.equal(state.round,2);assert.equal(state.currentTurn,'player')
 assert.ok(!isSurprised(state,'player'));assert.ok(!isSurprised(state,monster.id))
 ok(await call('combat_action',{actorId:'player',action:'dodge'}))
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,17)
})

test('ending surprise does not cure an actual incapacitating condition',async t=>{
 const call=await engine(t,{dice:'20,1,17'}),monster=await spawn(call)
 await begin(call,[monster.id],['player']);ok(await call('apply_condition',{entityId:'player',condition:'stunned'}))
 ok(await call('next_turn',{actorId:'player'}));ok(await call('next_turn',{actorId:monster.id,skipAction:true}))
 const state=await call('get_game_state');assert.equal(state.currentTurn,'player')
 assert.ok(!isSurprised(state,'player'));assert.ok(state.player.conditions.includes('stunned'))
 await refused(call,'combat_action',{actorId:'player',action:'dodge'},'ENTITY_INCAPACITATED')
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,17)
})

test('ending combat clears its surprise decision and a new ordinary combat never inherits it',async t=>{
 const call=await engine(t,{dice:'20,1,20,1,17'}),monster=await spawn(call)
 await begin(call,[monster.id],['player']);ok(await call('end_combat',{force:true,reason:'La reddition est établie.'}))
 assert.equal((await call('get_game_state')).dmTools.surprise,undefined)
 const next=await spawn(call);await begin(call,[next.id])
 assert.equal((await call('get_game_state')).dmTools.surprise,undefined)
 ok(await call('combat_action',{actorId:'player',action:'dodge'}))
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,17)
})

test('surprised creatures cannot provoke an opportunity-attack offer until after their own first turn ends',async t=>{
 const call=await engine(t,{dice:'20,1,20,1,17'}),monster=await spawn(call)
 await begin(call,[monster.id],[monster.id]);let state=await call('get_game_state')
 const nav=grid(state),from=state.player.position
 const away=nav.neighbors(from).find(cell=>nav.step(from,cell)&&distance(cell,monster.position)>1)
 assert.ok(away,'fixture needs a legal step out of melee reach')
 const first=ok(await call('move_token',{tokenId:'player',toCell:away}))
 assert.equal(first.pendingReaction,undefined);assert.equal((await call('get_game_state')).hero.pending,undefined)
 ok(await call('next_turn',{actorId:'player',skipAction:true}));ok(await call('next_turn',{actorId:monster.id}))
 state=await call('get_game_state');assert.equal(state.currentTurn,'player')
 ok(await call('move_token',{tokenId:'player',toCell:from}))
 ok(await call('move_token',{tokenId:'player',toCell:away}))
 const pending=(await call('get_game_state')).hero.pending
 assert.equal(pending?.sourceId,monster.id);assert.ok(pending?.options.includes('opportunity_attack'))
})

test('strict surprise state never treats prototype property names as selected participants',()=>{
 const state={phase:'combat',combatGeneration:1,currentMapId:'test',initiativeOrder:['player'],player:{deathSaves:{}},monsters:{},
  dmTools:{surprise:{combatGeneration:1,mapId:'test',reason,actors:{player:{firstTurnEnded:false}}}}}
 for(const id of ['constructor','toString','__proto__'])assert.equal(isSurprised(state,id),false)
 assert.ok(SurpriseStateSchema.safeParse(state.dmTools.surprise).success)
 assert.ok(!SurpriseStateSchema.safeParse({...state.dmTools.surprise,round:1}).success)
 assert.ok(!CombatSurpriseInputSchema.safeParse({surprisedIds:['player'],reason:''}).success)
 assert.equal(validateSurpriseState(state).valid,true)
})

test('a held end-of-turn affliction save preserves surprise until explicit resolution and actual turn completion',async t=>{
 const call=await engine(t,{dice:'1,20,20,1,1,17'}),initial=await call('get_game_state')
 ok(await call('create_affliction_source',{sourceId:'held-end',templateId:'carrion_crawler_mucus',name:'Mucus établi',cell:initial.player.position,doses:1}))
 ok(await call('expose_affliction',{sourceId:'held-end',eventId:'contact',targetId:'player',delivery:'contact'}))
 const monster=await spawn(call);await begin(call,[monster.id],['player'])
 await replace(call,state=>state.hero.inspiration.push({targetId:'player',die:6,expiresAt:3600}))
 await refused(call,'next_turn',{actorId:'player'},'AFFLICTION_EVENT_REQUIRED')
 const event=ok(await call('resolve_affliction_event',{afflictionId:'held-end:contact',endTurn:true}))
 assert.equal(event.pendingReaction.roll.rolls[0],1,'the poisoned initiative check used its own two dice, leaving the held end-turn save intact')
 assert.ok(event.pendingReaction);let state=await call('get_game_state')
 assert.ok(isSurprised(state,'player'));assert.equal(state.currentTurn,'player')
 ok(await call('replace_game_state',{gameState:state}));assert.deepEqual(await call('get_game_state'),state)
 await refused(call,'next_turn',{actorId:'player'},'REACTION_PENDING')
 ok(await call('resolve_reaction',{pendingId:event.pendingReaction.id,choice:'decline'}))
 state=await call('get_game_state');assert.ok(isSurprised(state,'player'));assert.equal(state.currentTurn,'player')
 ok(await call('next_turn',{actorId:'player'}));state=await call('get_game_state')
 assert.ok(!isSurprised(state,'player'));assert.equal(state.dmTools.surprise.actors.player.firstTurnEnded,true)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,17)
})

test('an existing readied move cannot spend a reaction while the player is surprised',async t=>{
 const call=await engine(t,{dice:'20,1,1,20,17'}),first=await spawn(call)
 await begin(call,[first.id]);const ready=ok(await call('combat_action',{actorId:'player',action:'ready',readied:{kind:'move',trigger:'La créature approche.'}}))
 ok(await call('end_combat',{force:true,reason:'La créature fuit immédiatement.'}))
 const second=await spawn(call);assert.equal((await begin(call,[second.id],['player'])).currentTurn,second.id)
 const state=await call('get_game_state')
 await refused(call,'resolve_readied_action',{readyId:ready.readyId,choice:'execute',triggerObserved:'La créature approche réellement.',toCell:state.player.position},'REACTION_ALREADY_USED')
 assert.ok(isSurprised(await call('get_game_state'),'player'))
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,17)
})

test('a held roll refuses entry into combat before surprise, phase or initiative mutation',async t=>{
 const call=await engine(t,{dice:'17'}),monster=await spawn(call)
 await replace(call,state=>state.hero.pending={id:'actual-held-save',kind:'save',sourceId:'player',targetId:'player',options:['decline'],command:{type:'save'},roll:{notation:'1d20',rolls:[8],modifier:0,total:8,detail:'8'}})
 await refused(call,'enter_combat',{combatants:['player',monster.id],surprise:{surprisedIds:['player'],reason}},'REACTION_PENDING')
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,17)
})
