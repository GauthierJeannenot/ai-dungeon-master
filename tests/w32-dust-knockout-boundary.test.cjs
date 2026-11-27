const test=require('node:test'),assert=require('node:assert/strict')
Object.assign(process.env,{MONETIZATION_ENABLED:'false',LLM_MODE:'mock',ALLOW_PAID_LLM:'false'})
const{installPgMem}=require('./helpers/pg-mem.cjs'),pg=installPgMem()
const{ok,engine,adjacent}=require('./helpers/mcp-toolkit.cjs')
const{setupWilderness,qualifyWilderness,persistWilderness}=require('./helpers/wilderness-chase-fixture.cjs')
test.after(()=>pg.restore())
const end=(f,id)=>f.call('resolve_chase_turn',{eventId:id,chaseId:f.input.chaseId}).then(ok)
const next=(f,id)=>f.call('next_turn',{actorId:id,skipAction:true,reason:'Traversée explicite du vrai tour retenu, sans action ni mouvement inventé.'}).then(ok)
async function dust(f,id){await end(f,id);await qualifyWilderness(f,id,5);return ok(await f.call('resolve_chase_complication',{eventId:'resolve-'+id,chaseId:f.input.chaseId,turnEventId:id,choice:'resolve'}))}
async function deniedUnchanged(call,name,input){const before=await call('get_game_state');assert.ok((await call(name,input)).error);assert.deepEqual(await call('get_game_state'),before)}
function retained(s,id){return s.hero.effects.filter(e=>e.kind==='chase-wilderness-blind'&&e.targetIds.includes(id))}

test('W32 dust keeps a real nonlethal KO made BEFORE its next slot, expires at that passive end-turn and preserves real spell blindness through SQL',async t=>{
 const call=await engine(t,{characterId:'wizard',dice:'1,20,15,10,11,5,1,20,4,4,2,19'})
 ok(await call('take_rest',{kind:'long'}));ok(await call('prepare_spells',{spellIds:['blindness-deafness']}))
 const controller=ok(await call('spawn_monster',{monsterType:'bandit',cell:adjacent(await call('get_game_state'))[0]}))
 const affected=ok(await call('spawn_monster',{monsterType:'commoner',cell:adjacent(await call('get_game_state'))[0]}))
 ok(await call('cast_spell',{spellId:'blindness-deafness',targetId:affected.id,slotLevel:2,condition:'blinded'}))
 const afterSpell=await call('get_game_state'),previousHand=afterSpell.dmTools?.loadout?.mainHandId
 if(previousHand&&previousHand!=='dagger')ok(await call('equip_item',{itemId:previousHand,slot:'main_hand',operation:'unequip'}))
 ok(await call('equip_item',{itemId:'dagger',slot:'main_hand',operation:'equip'}))
 ok(await call('enter_combat',{combatants:['player',controller.id,affected.id],tieOrder:['player',controller.id,affected.id]}))
 const input={eventId:'r2-begin',chaseId:'r2-dust-real-ko',quarryId:'player',pursuerIds:[controller.id,affected.id],table:'wilderness',guardIds:[],reason:'Table officielle sur trois vrais corps, sans altération de leurs PV.'}
 ok(await call('begin_chase',input));const f={call,input,pursuer:affected}
 const initial=await call('get_game_state'),weapon=initial.dmTools?.loadout?.mainHandId??initial.player.inventory.find(i=>i.type==='weapon').id
 ok(await call('combat_action',{action:'ready',readied:{kind:'attack',weaponId:weapon,trigger:'Le second poursuivant est aveuglé avant le début de son tour.'}}))
 const readyId=(await call('get_game_state')).hero.effects.find(e=>e.kind==='readied-action').id
 await end(f,'r2-player-end');await next(f,'player');await dust(f,'r2-dust-to-ko')
 ok(await call('stop_chase',{eventId:'r2-stop',chaseId:input.chaseId,participantIds:['player'],reason:'Arrêt réel avant le Ready, qui ne supprime pas la frontière de poussière.'}))
 ok(await call('resolve_readied_action',{readyId,choice:'execute',targetId:affected.id,triggerObserved:'Le corps adjacent est réellement aveuglé et son prochain tour n’a pas encore commencé.',nonlethal:true}))
 let s=await call('get_game_state');assert.equal(s.currentTurn,controller.id);assert.equal(s.monsters[affected.id].hp.current,0);assert.equal(s.monsters[affected.id].isAlive,true);assert.ok(s.monsters[affected.id].knockout);assert.equal(retained(s,affected.id).length,1)
 f.call=await persistWilderness(t,call,'1,19');await next(f,controller.id)
 s=await f.call('get_game_state');assert.equal(s.currentTurn,affected.id);assert.equal(retained(s,affected.id).length,1)
 await deniedUnchanged(f.call,'resolve_attack',{attackerId:affected.id,targetId:'player',weaponOrSpell:'Scimitar'})
 await deniedUnchanged(f.call,'chase_dash',{eventId:'r2-no-ko-action',chaseId:input.chaseId,actorId:affected.id})
 const beforeTurns=structuredClone(s.dmTools.chases.episodes[input.chaseId].turns)
 await next(f,affected.id);s=await f.call('get_game_state')
 assert.equal(s.currentTurn,'player');assert.equal(retained(s,affected.id).length,0);assert.equal(s.dmTools.chases.episodes[input.chaseId].turns['r2-dust-to-ko'].effectExpired,true)
 assert.deepEqual(Object.keys(s.dmTools.chases.episodes[input.chaseId].turns),Object.keys(beforeTurns));assert.ok(s.monsters[affected.id].conditions.includes('blinded'));assert.ok(s.hero.effects.some(e=>e.kind==='blindness-deafness'&&e.targetIds.includes(affected.id)))
 ok(await f.call('end_combat',{force:true,reason:'La vraie fenêtre du corps KO a fini, seul le sort indépendant subsiste.'}))
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
 const restored=await persistWilderness(t,f.call);assert.equal(ok(await restored('roll_dice',{notation:'1d20'})).total,19)
})

test('W32 dust retains the stable zeroHP PLAYER real passive slot after actual damage and first aid, with no new chase die/action and exact SQL',async t=>{
 const f=await setupWilderness(t,{dice:'20,10,11,5,1,20,2,19'})
 await end(f,'r2-player-first-end');await next(f,'player');await dust(f,'r2-dust-stable-player')
 ok(await f.call('stop_chase',{eventId:'r2-stop-before-stable',chaseId:f.input.chaseId,participantIds:['player'],reason:'Arrêt réel, gardant la frontière du joueur poussiéreux.'}))
 const before=await f.call('get_game_state')
 ok(await f.call('update_hp',{entityId:'player',delta:-before.player.hp.current,reason:'Dégâts environnementaux réels avant le prochain tour du joueur.',damageType:'bludgeoning',damageOrigin:'environment'}))
 ok(await f.call('combat_action',{action:'stabilize',actorId:f.pursuer.id,targetId:'player'}))
 let s=await f.call('get_game_state');assert.equal(s.player.hp.current,0);assert.equal(s.player.deathSaves.stable,true);assert.equal(retained(s,'player').length,1)
 f.call=await persistWilderness(t,f.call);await next(f,f.pursuer.id);s=await f.call('get_game_state')
 assert.equal(s.currentTurn,'player');assert.equal(retained(s,'player').length,1)
 await deniedUnchanged(f.call,'combat_action',{action:'dash'})
 await deniedUnchanged(f.call,'resolve_player_attack',{targetId:f.pursuer.id,weaponOrSpell:'longsword'})
 const beforeTurns=Object.keys(s.dmTools.chases.episodes[f.input.chaseId].turns)
 await next(f,'player');s=await f.call('get_game_state')
 assert.equal(s.currentTurn,f.pursuer.id);assert.equal(s.player.deathSaves.stable,true);assert.equal(s.player.hp.current,0);assert.equal(retained(s,'player').length,0);assert.ok(!s.player.conditions.includes('blinded'));assert.equal(s.dmTools.chases.episodes[f.input.chaseId].turns['r2-dust-stable-player'].effectExpired,true);assert.deepEqual(Object.keys(s.dmTools.chases.episodes[f.input.chaseId].turns),beforeTurns)
 ok(await f.call('end_combat',{force:true,reason:'Le vrai tour passif du joueur stable est terminé.'}))
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
 const restored=await persistWilderness(t,f.call);assert.equal(ok(await restored('roll_dice',{notation:'1d20'})).total,19)
})
