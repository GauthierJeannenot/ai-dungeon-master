const test=require('node:test'),assert=require('node:assert/strict')
Object.assign(process.env,{MONETIZATION_ENABLED:'false',LLM_MODE:'mock',ALLOW_PAID_LLM:'false',DM_RATE_LIMIT_PER_MINUTE:'0',APP_LOG_PERSIST_ENABLED:'false',APP_LOG_LEVEL:'error'})
const {installPgMem}=require('./helpers/pg-mem.cjs'),pg=installPgMem()
const {engine,ok,spawn,grid}=require('./helpers/mcp-toolkit.cjs')
const {getMapSpec,inferRoomIdOnMap}=require('../mcp-server/dist/lib/adventure-map.js')
const {saveSession,loadSession,deleteSession}=require('../lib/session-store.ts')
const {play,lastResult}=require('./helpers/dm-scripted-turn.cjs')
test.after(()=>pg.restore())
const adopted=(id,targetId,extra={})=>({spellId:'charm-person',slotLevel:1,targetId,invalidTargetRule:'xge-2014',invalidTargetEventId:id,...extra})
async function refuse(call,input,code){const before=await call('get_game_state'),r=await call('cast_spell',input);assert.equal(r.code,code,JSON.stringify(r));assert.deepEqual(await call('get_game_state'),before)}
async function persist(t,call,dice='19'){
 const s=await call('get_game_state'),id=`xge-invalid-${process.pid}-${Date.now()}-${Math.random()}`;t.after(()=>deleteSession(id))
 await saveSession(id,{gameState:s,history:[],adventureId:s.adventureId,characterId:s.characterId})
 const fresh=await engine(t,{characterId:s.characterId,adventureId:s.adventureId,dice});ok(await fresh('replace_game_state',{gameState:(await loadSession(id)).gameState}))
 assert.deepEqual(await fresh('get_game_state'),s);return fresh
}
function noFakeDie(r){assert.equal(r.perceivedSave,'succeeded');assert.equal(r.charmed,false);assert.equal(r.save,undefined);assert.equal(r.immune,undefined);assert.doesNotMatch(JSON.stringify(r),/unaffectedType|invalid.?type|nonhumanoid|invalide/i);for(const row of r.results){assert.equal(row.save,undefined);assert.equal(row.perceivedSave,'succeeded')}}

test('an explicitly adopted real wrong-type Charm Person spends its actual slot/action with no save, persists SQL, and exact replay never pays or rolls again',async t=>{
 const call=await engine(t,{characterId:'bard',dice:'20,1,19'}),wolf=await spawn(call,'wolf')
 const original=adopted('actual-incompatible-cast',wolf.id)
 await refuse(call,{spellId:'charm-person',targetId:wolf.id},'CHARM_REQUIRES_HUMANOID')
 assert.equal((await call('get_game_state')).dmTools.invalidSpellTargets,undefined)
 ok(await call('enter_combat',{combatants:['player',wolf.id]}));const before=await call('get_game_state');assert.equal(before.currentTurn,'player')
 const answer=ok(await call('cast_spell',original));noFakeDie(answer)
 const after=await call('get_game_state');assert.equal(after.player.spellSlots.level1.current,before.player.spellSlots.level1.current-1);assert.equal(after.hero.actionCredits,0);assert.equal(after.actionUsed.player,true)
 assert.deepEqual(after.hero.reactionsUsed,before.hero.reactionsUsed);assert.equal(after.hero.pending,undefined);assert.ok(!after.monsters[wolf.id].conditions.includes('charmed'));assert.ok(!after.hero.effects.some(e=>e.kind==='charm-person'));assert.ok(!after.worldFacts.some(f=>f.source==='cast_spell:charm-person'))
 const receipt=after.dmTools.invalidSpellTargets.receipts[original.invalidTargetEventId];assert.deepEqual(receipt.input,original);assert.deepEqual(receipt.result,answer)
 assert.deepEqual(receipt.source,{book:'xge',sha256:'519584ec7fc7da6fea056c182a22254bc807db5d077c2fc205801bd872d761bf',startLine:1109,endLine:1113})
 const fresh=await persist(t,call),frozen=await fresh('get_game_state'),replayed=ok(await fresh('cast_spell',original));assert.deepEqual(replayed,{...answer,replayed:true});assert.deepEqual(await fresh('get_game_state'),frozen)
 await refuse(fresh,{...original,targetId:'player'},'XGE_INVALID_TARGET_EVENT_CONFLICT')
 const tampered=structuredClone(frozen);tampered.dmTools.invalidSpellTargets.receipts[original.invalidTargetEventId].input.targetId='player'
 assert.equal((await fresh('replace_game_state',{gameState:tampered})).code,'XGE_INVALID_TARGET_STATE_MISMATCH');assert.deepEqual(await fresh('get_game_state'),frozen)
 assert.equal(ok(await fresh('roll_dice',{notation:'1d20'})).total,19)
})

test('under the same adoption a genuine successful WIS save and a wrong creature type have identical perceived envelopes and logs, with distinct genuine die consumption',async t=>{
 const results=[]
 for(const [type,dice]of [['goblin','20,1,1,20,19'],['wolf','20,1,19']]){
  const call=await engine(t,{characterId:'bard',dice}),target=await spawn(call,type);ok(await call('enter_combat',{combatants:['player',target.id]}))
  const r=ok(await call('cast_spell',adopted('same-adoption-event',target.id)));noFakeDie(r)
  const state=await call('get_game_state');assert.equal(state.hero.pending,undefined)
  assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19,'A genuine fighting WIS save uses both d20s; invalid type uses none.')
  const log=state.combatLog.at(-1)
  results.push({result:JSON.parse(JSON.stringify(r).replaceAll(target.id,'chosen-creature')),log:{action:log.action,mechanicalDetail:log.mechanicalDetail},receipt:JSON.parse(JSON.stringify(state.dmTools.invalidSpellTargets.receipts['same-adoption-event'].result).replaceAll(target.id,'chosen-creature'))})
 }
 assert.deepEqual(results[0],results[1])
 const {perceivedCharmResult}=require('../mcp-server/dist/mcp-server/xge-invalid-targets.js')
 assert.deepEqual(perceivedCharmResult({targetId:'humanoid',charmed:false,immune:true}),{targetId:'humanoid',charmed:false,immune:true},'Existing charm immunity is not recast as an incompatible creature type.')
})

test('adoption does not bypass unknown/hidden targets, scope or genuine components; a valid failed save still creates its real charm',async t=>{
 const call=await engine(t,{characterId:'bard',dice:'1,19'}),wolf=await spawn(call,'wolf'),base=adopted('real-validated-cast',wolf.id)
 for(const[input,code]of[
  [{...base,targetId:undefined},'TARGET_REQUIRED'],[{...base,targetId:'absent-body'},'ENTITY_NOT_FOUND'],[{...base,targetId:'avowed'},'SPELL_TARGET_UNSEEN'],
  [{...base,slotLevel:2},'XGE_INVALID_TARGET_SCOPE_UNSUPPORTED'],[{...base,spellId:'healing-word'},'XGE_INVALID_TARGET_SCOPE_UNSUPPORTED'],
  [{...base,targetId:undefined,targetIds:[wolf.id]},'XGE_INVALID_TARGET_SCOPE_UNSUPPORTED'],[{...base,invalidTargetRule:undefined},'XGE_INVALID_TARGET_ADOPTION_REQUIRED'],
  [{...base,invalidTargetEventId:undefined},'XGE_INVALID_TARGET_ADOPTION_REQUIRED'],
 ])await refuse(call,input,code)
 const current=await call('get_game_state'),spec=getMapSpec(current.currentMapId,current),nav=grid(current);let far
 for(let y=0;y<spec.grid.rows&&!far;y++)for(let x=0;x<spec.grid.cols&&!far;x++)if(Math.max(Math.abs(x-current.player.position.x),Math.abs(y-current.player.position.y))>6&&nav.free({x,y})&&inferRoomIdOnMap({x,y},current.currentMapId,current))far={x,y}
 assert.ok(far);const distant=await spawn(call,'wolf',far);await refuse(call,{...base,targetId:distant.id},'TARGET_OUT_OF_RANGE')
 const constraint={id:'actual-gag',targetId:'player',kind:'gagged',source:'Le MJ constate le vrai bâillon déjà établi dans cette scène.'}
 ok(await call('set_spell_component_constraint',{...constraint,operation:'apply'}));await refuse(call,base,'SPELL_VERBAL_BLOCKED')
 ok(await call('set_spell_component_constraint',{...constraint,operation:'remove'}))
 ok(await call('apply_condition',{entityId:wolf.id,condition:'invisible'}));await refuse(call,base,'SPELL_TARGET_UNSEEN')
 const goblin=await spawn(call,'goblin'),r=ok(await call('cast_spell',adopted('actual-failed-save',goblin.id)))
 assert.equal(r.charmed,true);assert.equal(r.save.success,false);assert.deepEqual(r.save.roll.rolls,[1]);assert.ok((await call('get_game_state')).monsters[goblin.id].conditions.includes('charmed'))
 const fresh=await persist(t,call);assert.equal(ok(await fresh('roll_dice',{notation:'1d20'})).total,19)
})

test('the real API agent chooses the explicit option and exact existing target, persists only the perceived result, and invents no reaction or gameplay call',async t=>{
 const call=await engine(t,{characterId:'bard',dice:'19'}),target=await spawn(call,'wolf'),input=adopted('actual-api-adoption',target.id);let observed
 const {result,seen,selected,before}=await play(t,call,[{name:'cast_spell',input},params=>{observed=lastResult(params);noFakeDie(observed);return 'La cible paraît avoir résisté au charme.'}],'Je lance ce Charme-personne sur cette créature précise ; le MJ adopte explicitement la règle Xanathar pour ce lancement.')
 assert.deepEqual(seen,selected);assert.equal(seen.length,1);assert.equal(result.newGameState.player.spellSlots.level1.current,before.player.spellSlots.level1.current-1)
 assert.deepEqual(result.newGameState.dmTools.invalidSpellTargets.receipts[input.invalidTargetEventId].input,input)
 const {narrationFacts,...engineResult}=observed
 assert.deepEqual(result.newGameState.dmTools.invalidSpellTargets.receipts[input.invalidTargetEventId].result,engineResult)
 assert.ok(narrationFacts.includes(observed.mechanicalSummary));assert.doesNotMatch(narrationFacts.join('\n'),/invalide|invalid.?type|unaffectedType|JS WIS|DD 15/)
 const fresh=await persist(t,call);assert.equal(ok(await fresh('roll_dice',{notation:'1d20'})).total,19)
})

test('a real adopted cast on a supported legacy state without dmTools completes once, retains actual slot/action and exact SQL replay, without default adoption at hydration',async t=>{
 const call=await engine(t,{characterId:'bard',dice:'20,1,19'}),target=await spawn(call,'wolf')
 ok(await call('enter_combat',{combatants:['player',target.id]}))
 const legacy=await call('get_game_state');assert.equal(legacy.currentTurn,'player')
 // Sole compatibility deletion: dmTools is optional in historical GameState.
 // The body, known spell, HP, inventory, initiatives and resources are genuine.
 delete legacy.dmTools
 ok(await call('replace_game_state',{gameState:legacy}));const before=await call('get_game_state');assert.deepEqual(before,legacy);assert.equal(before.dmTools,undefined)
 const input=adopted('actual-legacy-no-toolkit',target.id)
 await refuse(call,{spellId:'charm-person',slotLevel:1,targetId:target.id},'CHARM_REQUIRES_HUMANOID')
 assert.equal((await call('get_game_state')).dmTools,undefined)
 const result=ok(await call('cast_spell',input));noFakeDie(result)
 const after=await call('get_game_state');assert.equal(after.player.spellSlots.level1.current,before.player.spellSlots.level1.current-1);assert.equal(after.hero.actionCredits,0);assert.equal(after.actionUsed.player,true)
 assert.deepEqual(after.hero.reactionsUsed,before.hero.reactionsUsed);assert.equal(after.hero.pending,undefined);assert.ok(!after.monsters[target.id].conditions.includes('charmed'))
 assert.deepEqual(after.dmTools.invalidSpellTargets.receipts[input.invalidTargetEventId].input,input)
 assert.deepEqual(after.dmTools.invalidSpellTargets.receipts[input.invalidTargetEventId].result,result)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19,'No WIS die was consumed by the invalid creature type.')
 const fresh=await persist(t,call),snapshot=await fresh('get_game_state'),replayed=ok(await fresh('cast_spell',input))
 assert.deepEqual(replayed,{...result,replayed:true});assert.deepEqual(await fresh('get_game_state'),snapshot)
 await refuse(fresh,{...input,targetId:'player'},'XGE_INVALID_TARGET_EVENT_CONFLICT')
 assert.equal(ok(await fresh('roll_dice',{notation:'1d20'})).total,19)
})

test('a publicly revealed actual stat-backed humanoid NPC keeps its canonical type and makes a genuine WIS save under the adopted option',async t=>{
 const call=await engine(t,{characterId:'bard',dice:'20,19'})
 let before=await call('get_game_state');const npc=before.npcs.avowed
 assert.ok(npc.type);assert.match(String(npc.statBlock.published.type),/^humanoid/i)
 const {findNavigationPath}=require('../mcp-server/dist/lib/navigation.js')
 const path=findNavigationPath(before,'player',{kind:'cell',cell:{x:npc.position.x-1,y:npc.position.y}})
 assert.ok(path.length)
 for(const cell of path)if(cell.x!==before.player.position.x||cell.y!==before.player.position.y)ok(await call('move_token',{tokenId:'player',toCell:cell}))
 ok(await call('reveal_npc',{npcId:'avowed',disposition:'neutral'}))
 before=await call('get_game_state')
 assert.equal(before.npcs.avowed.visible,true)
 const result=ok(await call('cast_spell',adopted('actual-humanoid-npc-source',npc.id)));noFakeDie(result)
 const after=await call('get_game_state');assert.equal(after.player.spellSlots.level1.current,before.player.spellSlots.level1.current-1)
 assert.equal(after.monsters[npc.id],undefined,'No combatant or substitute NPC is spawned.')
 assert.equal(after.npcs[npc.id].type,npc.type);assert.equal(after.npcs[npc.id].disposition,npc.disposition)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19,'A genuine humanoid NPC consumed the real20 WIS die, rather than taking the wrong-type path.')
})
