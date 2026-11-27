const test=require('node:test'),assert=require('node:assert/strict')
Object.assign(process.env,{MONETIZATION_ENABLED:'false',LLM_MODE:'mock',ALLOW_PAID_LLM:'false',LLM_PROVIDER: 'openai',DM_RATE_LIMIT_PER_MINUTE:'0',APP_LOG_PERSIST_ENABLED:'false'})
const {installPgMem}=require('./helpers/pg-mem.cjs'),pg=installPgMem()
const {engine,ok}=require('./helpers/mcp-toolkit.cjs')
const {setupShoveAside,prepareShoveAsideAtCurrentSite,persistShoveAside}=require('./helpers/dmg-shove-aside-fixture.cjs')
test.after(()=>pg.restore())
async function unchanged(call,name,input,code){const before=await call('get_game_state'),answer=await call(name,input);if(code)assert.equal(answer.code,code,JSON.stringify(answer));else assert.ok(answer.error,JSON.stringify(answer));assert.deepEqual(await call('get_game_state'),before);return answer}

test('explicit optional Shove Aside rolls disadvantage, commits one actual attack and physical five-foot side step, retaining Extra Attack and source through SQL',async t=>{
 const f=await setupShoveAside(t),before=await f.call('get_game_state'),answer=ok(await f.call('combat_action',f.input))
 assert.equal(answer.success,true);assert.equal(answer.shove,'aside');assert.match(answer.check.roll.detail,/DIS/);assert.deepEqual(answer.check.roll.rolls,[19]);assert.equal(answer.opposition.roll.rolls[0],1)
 const after=await f.call('get_game_state');assert.deepEqual(after.monsters[f.target.id].position,f.toCell);assert.equal(after.hero.attackAction.used,1);assert.equal(after.hero.attackAction.remaining,1);assert.equal(after.actionUsed.player,true)
 assert.deepEqual(after.movementUsed,before.movementUsed);assert.deepEqual(after.monsters[f.target.id].hp,before.monsters[f.target.id].hp);assert.equal(after.worldTimeSeconds,before.worldTimeSeconds)
 const attempt=after.dmTools.shoveAside.attempts[answer.shoveAsideId];assert.equal(attempt.status,'resolved');assert.match(attempt.source,/dmg-2014:Shove Aside:/);assert.equal(attempt.result.success,true)
 const fresh=await persistShoveAside(t,f.call);assert.equal(ok(await fresh('roll_dice',{notation:'1d20'})).total,19)
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,17)
})

test('a failed side contest and an exact total tie preserve the real position, each replacing only one attack and retaining the next source die',async t=>{
 for(const [dice,expectedTie] of [['20,1,20,1,20,17',false],['20,1,4,4,11,17',true]]){
  const f=await setupShoveAside(t,{dice}),before=await f.call('get_game_state'),result=ok(await f.call('combat_action',f.input))
  assert.equal(result.success,false);if(expectedTie)assert.equal(result.check.roll.total,result.opposition.roll.total)
  const after=await f.call('get_game_state');assert.deepEqual(after.monsters[f.target.id].position,before.monsters[f.target.id].position);assert.equal(after.hero.attackAction.remaining,1);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,17)
 }
})

test('missing, occupied, diagonal, outside-reach and non-shove side choices refuse before source d20, cost or ledger creation',async t=>{
 const f=await setupShoveAside(t,{dice:'20,1,17'}),s=await f.call('get_game_state'),p=s.player.position
 const choices=[{...f.input,toCell:undefined},{...f.input,defenseSkill:undefined},{...f.input,toCell:p},{...f.input,toCell:{x:f.targetCell.x+1,y:f.targetCell.y+1}},{...f.input,toCell:{x:p.x,y:p.y-2}},{...f.input,action:'dash'}]
 for(const input of choices)await unchanged(f.call,'combat_action',input)
 assert.equal((await f.call('get_game_state')).dmTools?.shoveAside,undefined);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,17)
 const blocked=await setupShoveAside(t,{dice:'20,1,17',beforeCombat:async f=>{
  const s=await f.call('get_game_state'),origin=s.player.position,corner={x:f.toCell.x===f.targetCell.x?origin.x:f.toCell.x,y:f.toCell.y===f.targetCell.y?origin.y:f.toCell.y}
  assert.notDeepEqual(corner,origin);assert.notDeepEqual(corner,f.targetCell)
  ok(await f.call('create_scene_object',{objectId:'real-reach-blocker',name:'Bloc réel',description:'Ce bloc de pierre réel ferme le passage physique latéral entre le PJ et la destination choisie.',cell:corner,kind:'obstacle',material:'stone',size:'small',resilience:'resilient'}))
 }})
 await unchanged(blocked.call,'combat_action',blocked.input,'SHOVE_ASIDE_REACH_BLOCKED');assert.equal(ok(await blocked.call('roll_dice',{notation:'1d20'})).total,17)
})

test('a real prepared PHB Inspiration cancels source disadvantage once and consumes no invented action or second d20',async t=>{
 const f=await setupShoveAside(t,{dice:'20,1,18,1,17'})
 ok(await f.call('grant_inspiration',{eventId:'actual-aside-gift',reason:'Le MJ accorde réellement son Inspiration pour le choix courageux établi.'}))
 ok(await f.call('spend_inspiration',{spendId:'actual-aside-spend',rollKind:'check'}))
 const answer=ok(await f.call('combat_action',f.input));assert.equal(answer.success,true);assert.deepEqual(answer.check.roll.rolls,[18]);assert.doesNotMatch(answer.check.roll.detail,/DIS|ADV/)
 const s=await f.call('get_game_state');assert.equal(s.dmTools.dmInspiration.spends['actual-aside-spend'].status,'consumed');assert.equal(s.dmTools.dmInspiration.prepared,undefined);assert.equal(s.hero.attackAction.remaining,1);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,17)
})

test('a genuine Bardic defender window retains both actual contest rolls and destination across SQL, rejects tampering/body changes before bonus, then commits exactly once',async t=>{
 const f=await setupShoveAside(t,{characterId:'bard',dice:'20,1,20,19,1,17',beforeCombat:async f=>ok(await f.call('use_subclass_feature',{featureId:'bardic_inspiration',targetId:f.target.id}))})
 const held=ok(await f.call('combat_action',f.input));assert.ok(held.pendingReaction);assert.ok(held.pendingReaction.options.includes('bardic_inspiration'))
 const state=await f.call('get_game_state');assert.equal(state.actionUsed.player,undefined);assert.equal(state.hero.attackAction,undefined);assert.deepEqual(state.monsters[f.target.id].position,f.targetCell)
 const fresh=await persistShoveAside(t,f.call,'3,17')
 for(const mutate of [s=>s.hero.pending.roll.total++,s=>s.hero.pending.command.toolkitResolution.command.toCell.x++,s=>s.hero.pending.command.toolkitResolution.command.firstCheck.roll.total++,s=>s.monsters[f.target.id].stats.str++,s=>s.player.position.x++,s=>{const a=Object.values(s.dmTools.shoveAside.attempts)[0];a.input.toCell.x++}]){
  const changed=structuredClone(state);mutate(changed);await unchanged(fresh,'replace_game_state',{gameState:changed},'SHOVE_ASIDE_STATE_MISMATCH')
 }
 await unchanged(fresh,'update_hp',{entityId:f.target.id,delta:-1,reason:'Le MJ tente un vrai changement de PV pendant le concours tenu.'},'REACTION_PENDING')
 await unchanged(fresh,'apply_condition',{entityId:f.target.id,condition:'unconscious'},'SHOVE_ASIDE_CONTEST_PENDING')
 const answer=ok(await fresh('resolve_reaction',{pendingId:held.pendingReaction.id,choice:'bardic_inspiration'}));assert.equal(answer.success,true);assert.equal(answer.opposition.roll.total,4)
 const after=await fresh('get_game_state');assert.deepEqual(after.monsters[f.target.id].position,f.toCell);assert.equal(after.hero.attackAction.used,1);assert.equal(after.hero.inspiration.length,0);assert.equal(after.hero.pending,undefined)
 await unchanged(fresh,'resolve_reaction',{pendingId:held.pendingReaction.id,choice:'bardic_inspiration'},'REACTION_TRIGGER_INVALID');const restored=await persistShoveAside(t,fresh);assert.equal(ok(await restored('roll_dice',{notation:'1d20'})).total,19);assert.equal(ok(await fresh('roll_dice',{notation:'1d20'})).total,17)
})

test('incapable target and a real raised destination refuse atomically rather than inventing an automatic optional contest or level change',async t=>{
 for(const raised of [false,true]){
  const call=await engine(t,{dice:'20,1,17'}),f=await prepareShoveAsideAtCurrentSite(call)
  if(raised)ok(await call('record_vertical_surface',{eventId:'real-raised-side',surfaceId:'real-raised-side',mapId:(await call('get_game_state')).currentMapId,roomId:(await call('get_game_state')).currentRoomId,cells:[f.toCell],kind:'support',elevationFeet:5,actualGeometryConfirmed:true,source:'Le MJ mesure le véritable rebord cinq pieds plus haut que les corps.'}))
  else ok(await call('apply_condition',{entityId:f.target.id,condition:'stunned'}))
  ok(await f.enter());await unchanged(call,'combat_action',f.input,raised?'VERTICAL_MOVEMENT_REQUIRED':'SHOVE_ASIDE_CAPABLE_CONTEST_REQUIRED');assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,17)
 }
})

test('a real slippery-ice side arrival retains its paid original contest and creates only the committed forced contact',async t=>{
 const f=await setupShoveAside(t,{dice:'20,1,20,19,1,1,17',beforeCombat:async f=>{
  const s=await f.call('get_game_state'),source='Le MJ mesure une vraie plaque glissante sur la destination latérale au niveau du sol.',fact=ok(await f.call('record_scene_fact',{cell:f.toCell,description:source})).worldFact
  ok(await f.call('record_vertical_surface',{eventId:'side-ice-support',surfaceId:'side-ice-support',mapId:s.currentMapId,roomId:s.currentRoomId,cells:[f.toCell],kind:'support',elevationFeet:0,actualGeometryConfirmed:true,source}))
  ok(await f.call('record_slippery_ice',{zoneId:'side-real-ice',surfaceId:'side-ice-support',cells:[f.toCell],factId:fact.id,actualSlipperyIceConfirmed:true}))
 }})
 const before=await f.call('get_game_state'),result=ok(await f.call('combat_action',f.input));assert.equal(result.success,true);assert.ok(result.slipperyIceContactId)
 const state=await f.call('get_game_state'),contact=state.dmTools.groundGear.contacts[result.slipperyIceContactId]
 assert.equal(contact.status,'waiting');assert.equal(contact.kind,'forced');assert.equal(contact.slipperyIceEntry.shoveAside.attemptId,result.shoveAsideId)
 assert.deepEqual(state.monsters[f.target.id].position,f.toCell);assert.deepEqual(state.movementUsed,before.movementUsed);assert.equal(state.hero.attackAction.remaining,1)
 const ice=ok(await f.call('resolve_slippery_ice_entry',{contactId:contact.id}));assert.equal(ice.contactResults[0].check.success,false)
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,17)
})

test('an actual rooted razorvine destination refuses before either side-contest die or attack, without inventing thorn contact merely from proximity',async t=>{
 const call=await engine(t,{dice:'20,1,17'}),f=await require('./helpers/razorvine-fixture.cjs').prepareRazorvine(call)
 const beside={x:f.start.x+f.neighbor.x-f.face.x,y:f.start.y+f.neighbor.y-f.face.y};ok(await call('move_token',{tokenId:'player',toCell:beside}))
 const target=ok(await call('spawn_monster',{monsterType:'bandit',cell:f.start}));ok(await call('enter_combat',{combatants:['player',target.id],tieOrder:['player',target.id]}))
 const answer=await unchanged(call,'combat_action',{action:'shove',targetId:target.id,shove:'aside',defenseSkill:'athletics',toCell:f.face})
 assert.ok(['SHOVE_ASIDE_PATH_BLOCKED','RAZORVINE_VOLUME_BLOCKED'].includes(answer.code),JSON.stringify(answer));assert.equal((await call('get_game_state')).dmTools.shoveAside,undefined);assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,17)
})

test('a real undead side displacement onto measured desecrated ground receives only the existing actual save advantage, preserved through SQL',async t=>{
 const f=await setupShoveAside(t,{monsterType:'skeleton',dice:'20,1,20,19,1,1,20,17',beforeCombat:async f=>require('./helpers/desecrated-ground-fixture.cjs').prepareDesecratedGround(f.call,{cells:[f.toCell]})})
 const result=ok(await f.call('combat_action',f.input));assert.equal(result.success,true)
 const save=ok(await f.call('resolve_saving_throw',{entityId:f.target.id,ability:'con',dc:10}));assert.equal(save.roll.rolls[0],20);assert.match(save.mechanicalSummary,/sol profané/)
 const fresh=await persistShoveAside(t,f.call);assert.deepEqual((await fresh('get_game_state')).monsters[f.target.id].position,f.toCell);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,17)
})

test('the actual POST forwards the agent’s exact optional side destination once and persists its real contest/movement without fabricated game calls',async t=>{
 const f=await setupShoveAside(t),{play,lastResult}=require('./helpers/dm-scripted-turn.cjs')
 const played=await play(t,f.call,[{name:'combat_action',input:f.input},params=>{const result=lastResult(params);assert.equal(result.success,true);assert.equal(result.shove,'aside');return 'Le concours réel a réussi et la cible occupe la case latérale choisie.'}],'Je tente cette option de bousculade de côté sur cette case précise.')
 assert.deepEqual(played.seen,[{name:'combat_action',input:f.input}]);assert.deepEqual(played.result.newGameState.monsters[f.target.id].position,f.toCell);assert.equal(played.result.newGameState.hero.attackAction.remaining,1);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,17)
})
