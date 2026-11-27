const test=require('node:test'),assert=require('node:assert/strict')
const {engine,ok,adjacent}=require('./helpers/mcp-toolkit.cjs')
async function spawn(call,monsterType='goblin'){const state=await call('get_game_state');return ok(await call('spawn_monster',{monsterType,cell:adjacent(state)[0]}))}
async function policy(call,id){return ok(await call('configure_npc_death_saves',{entityId:id,eventId:`feature-policy:${id}`,reason:'Le MJ choisit ce vrai PNJ important avant toute blessure.'}))}
const hurt=(call,id,amount)=>call('update_hp',{entityId:id,delta:-amount,damageType:'force',damageOrigin:'environment',reason:'Blessure réelle pour le raccord de capacité.'})
async function freeHand(call){const state=await call('get_game_state'),id=state.dmTools?.loadout?.mainHandId??state.player.inventory.find(item=>item.type==='weapon')?.id;if(id)ok(await call('equip_item',{itemId:id,slot:'main_hand',operation:'unequip'}))}
async function refused(call,name,input){const before=await call('get_game_state'),answer=await call(name,input);assert.ok(answer.error,JSON.stringify(answer));assert.deepEqual(await call('get_game_state'),before)}

test('Preserve Life heals a real dying NPC, but preflights every allocation before any HP, channel or action debit',async t=>{
 const call=await engine(t,{characterId:'cleric',dice:'19'}),target=await spawn(call)
 await policy(call,target.id);ok(await hurt(call,target.id,target.hp.current))
 const before=await call('get_game_state');assert.equal(before.monsters[target.id].npcLife.episode.status,'dying')
 await refused(call,'use_subclass_feature',{featureId:'preserve_life',allocations:[{targetId:target.id,hp:1},{targetId:'player',hp:1}]})
 const amount=Math.floor(before.monsters[target.id].hp.max/2)
 const healed=ok(await call('use_subclass_feature',{featureId:'preserve_life',allocations:[{targetId:target.id,hp:amount}]}))
 assert.equal(healed.healing[0].healing,amount)
 const after=await call('get_game_state');assert.equal(after.monsters[target.id].hp.current,amount);assert.equal(after.monsters[target.id].isAlive,true)
 assert.equal(after.monsters[target.id].npcLife.episode,undefined);assert.ok(after.monsters[target.id].conditions.includes('prone'))
 assert.equal(after.player.resources.channel_divinity.current,before.player.resources.channel_divinity.current-1)
 assert.equal(after.player.hp.current,before.player.hp.current)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('Destroy Undead really destroys a policy-tracked native skeleton; a genuinely cast Death Ward instead cancels that source effect',async t=>{
 for(const ward of [false,true])await t.test(ward?'actual Death Ward':'no ward',async t=>{
  const call=await engine(t,{characterId:'cleric',dice:'1,19'}),target=await spawn(call,'skeleton')
  await policy(call,target.id)
  if(ward){await freeHand(call);ok(await call('cast_spell',{spellId:'death-ward',slotLevel:4,targetId:target.id}))}
  const before=await call('get_game_state'),result=ok(await call('use_subclass_feature',{featureId:'turn_undead'}))
  const resolved=result.targets.find(entry=>entry.targetId===target.id);assert.equal(resolved.save.success,false)
  const after=await call('get_game_state'),body=after.monsters[target.id]
  assert.notEqual(body.npcLife.episode?.status,'dying','source destruction is never routed through the ordinary damage-to-zero policy')
  if(ward){
   assert.equal(resolved.destroyed,false);assert.equal(body.isAlive,true);assert.equal(body.hp.current,before.monsters[target.id].hp.current)
   assert.ok(!after.hero.effects.some(effect=>effect.kind==='death-ward'&&effect.targetIds.includes(target.id)))
   assert.equal(after.hero.corpseTimes[target.id],undefined)
  }else{
   assert.equal(resolved.destroyed,true);assert.equal(body.isAlive,false);assert.equal(body.hp.current,0)
   assert.equal(after.hero.corpseTimes[target.id],before.worldTimeSeconds)
  }
  assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
 })
})

test('Spiritual Weapon transmits a real low-damage critical at zero HP and rejects an archived target before moving or spending its bonus',async t=>{
 const call=await engine(t,{characterId:'cleric',dice:'20,1,20,17,1,1,20,1,19'}),initial=await call('get_game_state')
 const layout=ok(await call('generate_dungeon',{seed:'spiritual-zero-archive',width:3,height:3,count:5})).layout
 const installed=ok(await call('install_dungeon',{dungeonId:'spiritual-zero-side',layout,entranceCell:initial.player.position,
  questLink:{goal:'Retrouver la personne recherchée.',lead:'Un indice concret poursuit la même recherche.',delivery:'clue',discoveryDc:15}}))
 await freeHand(call)
 const target=await spawn(call,'veteran');assert.equal(target.hp.max,58,'published veteran profile avoids a massive-death shortcut')
 await policy(call,target.id)
 ok(await call('cast_spell',{spellId:'spiritual-weapon',slotLevel:2,toCell:initial.player.position}))
 let state=await call('get_game_state'),effect=state.hero.effects.find(effect=>effect.kind==='spiritual-weapon'&&effect.data.mapId===state.currentMapId)
 assert.ok(effect)
 ok(await call('enter_combat',{combatants:['player',target.id]}));ok(await hurt(call,target.id,target.hp.current))
 const attack=ok(await call('use_subclass_feature',{featureId:'spiritual_weapon',effectId:effect.id,targetId:target.id}))
 assert.equal(attack.roll.rolls[0],20);assert.equal(attack.damageRoll.rolls.length,2)
 assert.ok(attack.damageDealt<target.hp.max,'the real critical cannot be hidden by massive damage')
 state=await call('get_game_state');assert.equal(state.monsters[target.id].hp.current,0);assert.equal(state.monsters[target.id].isAlive,true)
 assert.equal(state.monsters[target.id].npcLife.episode.failures,2)
 assert.equal(state.bonusActionUsed.player,true)
 ok(await call('end_combat',{force:true,reason:'Le MJ établit une trêve sans résoudre automatiquement le sort du blessé.'}))
 ok(await call('travel_to_map',{transitionId:installed.entryTransitionId}))
 state=await call('get_game_state');assert.equal(state.monsters[target.id],undefined)
 ok(await call('cast_spell',{spellId:'spiritual-weapon',slotLevel:2,toCell:state.player.position}))
 const opponent=await spawn(call);ok(await call('enter_combat',{combatants:['player',opponent.id]}))
 state=await call('get_game_state');effect=state.hero.effects.find(effect=>effect.kind==='spiritual-weapon'&&effect.data.mapId===state.currentMapId)
 assert.ok(effect,'the explicitly created current-map weapon is selected, never its old-map counterpart')
 assert.equal(effect.data.mapId,state.currentMapId)
 // The entry room can have a single free adjacent square, now occupied by
 // the actual opponent. A Spiritual Weapon may share that cell; its movement
 // validates the physical ray, not creature walking occupancy.
 const toCell={...opponent.position}
 assert.notDeepEqual(toCell,effect.data.cell,'this explicit valid move would actually relocate the weapon if wrongly accepted')
 await refused(call,'use_subclass_feature',{featureId:'spiritual_weapon',effectId:effect.id,targetId:target.id,toCell})
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
