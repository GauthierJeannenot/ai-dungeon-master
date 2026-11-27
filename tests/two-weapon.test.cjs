const test=require('node:test'),assert=require('node:assert/strict')
const {engine,ok,replace,spawn,battle}=require('./helpers/mcp-toolkit.cjs')
const {TwoWeaponStateSchema}=require('../mcp-server/dist/lib/two-weapon-state.js')

async function pair(t,{characterId='wizard',dice='',weapon='dagger',cell}={}){
  const call=await engine(t,{characterId,dice}),initial=await call('get_game_state')
  const main=initial.dmTools?.loadout?.mainHandId??initial.player.inventory.find(item=>item.type==='weapon').id
  ok(await call('equip_item',{itemId:main,slot:'main_hand',operation:'unequip'}))
  if(initial.player.inventory.some(item=>item.id==='shield'))ok(await call('equip_item',{itemId:'shield',slot:'shield',operation:'unequip'}))
  await replace(call,state=>{
    state.player.inventory.push({id:'left-weapon',equipmentId:weapon,name:'Arme gauche',type:'weapon'},
      {id:'right-weapon',equipmentId:weapon,name:'Arme droite',type:'weapon'})
  })
  ok(await call('equip_item',{itemId:'left-weapon',slot:'main_hand',operation:'equip'}))
  ok(await call('equip_item',{itemId:'right-weapon',slot:'off_hand',operation:'equip'}))
  const target=await spawn(call,'goblin',cell)
  await battle(call,[target.id])
  return {call,target}
}
const primary=(call,targetId,extra={})=>call('resolve_player_attack',{targetId,weaponOrSpell:'left-weapon',...extra})
const bonus=(call,targetId,primaryAttackId,extra={})=>call('resolve_two_weapon_attack',{
  attackId:'offhand-1',targetId,primaryAttackId,weaponItemId:'right-weapon',attackMode:'melee',...extra,
})

test('two actual physical weapons use one bonus action, omit only the positive damage modifier and replay once across hydration',async t=>{
  const {call,target}=await pair(t,{dice:'15,3,16,4,19'})
  const first=ok(await primary(call,target.id))
  assert.ok(first.primaryAttackId);assert.equal(first.twoWeaponEligibility.otherItemId,'right-weapon')
  assert.equal(first.damageRoll.modifier,2)
  const before=await call('get_game_state'),answer=ok(await bonus(call,target.id,first.primaryAttackId))
  assert.equal(answer.damageRoll.modifier,0);assert.equal(answer.damageDealt,4)
  const saved=await call('get_game_state')
  assert.equal(saved.bonusActionUsed.player,true)
  assert.equal(saved.hero.actionCredits,before.hero.actionCredits)
  assert.deepEqual(saved.hero.attackAction,before.hero.attackAction)
  assert.equal(saved.monsters[target.id].hp.current,before.monsters[target.id].hp.current-4)
  assert.equal(saved.dmTools.twoWeapon.receipts['offhand-1'].status,'resolved')
  ok(await call('replace_game_state',{gameState:saved}))
  assert.equal(ok(await bonus(call,target.id,first.primaryAttackId)).alreadyResolved,true)
  assert.equal((await bonus(call,target.id,first.primaryAttackId,{targetId:'different-target'})).code,'TWO_WEAPON_EVENT_CONFLICT')
  assert.equal((await bonus(call,target.id,first.primaryAttackId,{attackId:'offhand-2'})).code,'BONUS_ACTION_ALREADY_USED')
  assert.deepEqual(await call('get_game_state'),saved)
  assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('negative ability modifiers remain on actual off-hand damage and on its attack roll',async t=>{
  const {call,target}=await pair(t,{characterId:'fighter',weapon:'handaxe',dice:'16,3,17,4,19'})
  await replace(call,state=>{state.player.stats.str=8})
  const first=ok(await primary(call,target.id)),answer=ok(await bonus(call,target.id,first.primaryAttackId))
  assert.equal(first.damageRoll.modifier,-1)
  assert.equal(answer.damageRoll.modifier,-1);assert.equal(answer.damageDealt,3)
  assert.equal(answer.attackRoll.modifier,2,'STR -1 plus actual proficiency3, with no damage-only omission on the attack')
  assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('the trigger, different exact instance, held other hand, thrown property and real target validate before dice or costs',async t=>{
  const {call,target}=await pair(t,{weapon:'shortsword',dice:'15,3,19'})
  let before=await call('get_game_state')
  assert.equal((await bonus(call,target.id,'not-an-attack')).code,'TWO_WEAPON_ATTACK_REQUIRED')
  assert.deepEqual(await call('get_game_state'),before)
  const first=ok(await primary(call,target.id));before=await call('get_game_state')
  assert.equal((await bonus(call,target.id,first.primaryAttackId,{weaponItemId:'left-weapon'})).code,'TWO_WEAPON_OTHER_REQUIRED')
  assert.equal((await bonus(call,target.id,first.primaryAttackId,{attackMode:'thrown'})).code,'WEAPON_NOT_THROWABLE')
  assert.equal((await bonus(call,'nonexistent',first.primaryAttackId)).code,'ENTITY_NOT_FOUND')
  assert.deepEqual(await call('get_game_state'),before)
  ok(await call('equip_item',{itemId:'right-weapon',slot:'off_hand',operation:'unequip'}))
  before=await call('get_game_state')
  assert.equal((await bonus(call,target.id,first.primaryAttackId)).code,'TWO_WEAPON_NOT_HELD')
  assert.deepEqual(await call('get_game_state'),before)
  assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('the bonus attack neither consumes Extra Attack nor refreshes with Action Surge',async t=>{
  const {call,target}=await pair(t,{characterId:'fighter',dice:'15,2,16,3,17,4,18,2,19'})
  const first=ok(await primary(call,target.id))
  let state=await call('get_game_state');assert.equal(state.hero.attackAction.remaining,1)
  ok(await bonus(call,target.id,first.primaryAttackId))
  state=await call('get_game_state');assert.equal(state.hero.attackAction.remaining,1);assert.equal(state.hero.actionCredits,0)
  ok(await primary(call,target.id));assert.equal((await call('get_game_state')).hero.attackAction.remaining,0)
  ok(await call('use_class_feature',{featureId:'action_surge'}))
  ok(await primary(call,target.id));state=await call('get_game_state')
  assert.equal(state.hero.attackAction.remaining,1)
  assert.equal((await bonus(call,target.id,first.primaryAttackId,{attackId:'surge-offhand'})).code,'BONUS_ACTION_ALREADY_USED')
  assert.deepEqual(await call('get_game_state'),state)
  assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('a model-selected Extra Attack sequence holds its first roll, resumes only its selected second attack and then exposes both primary witnesses',async t=>{
  const {call,target}=await pair(t,{characterId:'fighter',dice:'15,6,2,16,3,17,4,19'})
  await replace(call,state=>{state.hero.inspiration.push({targetId:'player',die:8,expiresAt:state.worldTimeSeconds+600})})
  const held=ok(await call('resolve_player_multiattack',{attacks:[
    {targetId:target.id,weaponOrSpell:'left-weapon'},
    {targetId:target.id,weaponOrSpell:'left-weapon'},
  ]}))
  assert.ok(held.pendingReaction)
  const saved=await call('get_game_state')
  ok(await call('replace_game_state',{gameState:saved}))
  const finished=ok(await call('resolve_reaction',{pendingId:held.pendingReaction.id,choice:'bardic_inspiration'}))
  assert.equal(finished.attacks.length,2)
  assert.equal(finished.attacks[0].attackRoll.rolls[0],15)
  assert.equal(finished.attacks[1].attackRoll.rolls[0],16)
  assert.ok(finished.attacks.every(attack=>attack.twoWeaponEligibility.otherItemId==='right-weapon'))
  assert.notEqual(finished.attacks[0].primaryAttackId,finished.attacks[1].primaryAttackId)
  assert.equal((await call('get_game_state')).hero.attackAction.remaining,0)
  const answer=ok(await bonus(call,target.id,finished.attacks[0].primaryAttackId))
  assert.equal(answer.damageDealt,4)
  assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('two non-light weapons do not gain a free Dual Wielder prerequisite',async t=>{
  const {call,target}=await pair(t,{weapon:'rapier',dice:'15,3,19'})
  const first=ok(await primary(call,target.id)),before=await call('get_game_state')
  assert.equal(first.twoWeaponEligibility,undefined)
  assert.equal((await bonus(call,target.id,first.primaryAttackId)).code,'TWO_WEAPON_ATTACK_REQUIRED')
  assert.deepEqual(await call('get_game_state'),before)
  assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('a held bonus attack preserves its d20 and unique bonus debit through Bardic Inspiration and hydration',async t=>{
  const {call,target}=await pair(t,{dice:'15,2,12,6,4,19'})
  const first=ok(await primary(call,target.id))
  await replace(call,state=>{state.hero.inspiration.push({targetId:'player',die:8,expiresAt:state.worldTimeSeconds+600})})
  const before=await call('get_game_state'),held=ok(await bonus(call,target.id,first.primaryAttackId))
  assert.ok(held.pendingReaction)
  const saved=await call('get_game_state')
  assert.equal(saved.bonusActionUsed.player,true)
  assert.equal(saved.monsters[target.id].hp.current,before.monsters[target.id].hp.current)
  assert.equal(saved.dmTools.twoWeapon.receipts['offhand-1'].status,'pending')
  ok(await call('replace_game_state',{gameState:saved}))
  assert.equal(ok(await bonus(call,target.id,first.primaryAttackId)).alreadyPending,true)
  assert.deepEqual(await call('get_game_state'),saved)
  const finished=ok(await call('resolve_reaction',{pendingId:held.pendingReaction.id,choice:'bardic_inspiration'}))
  assert.equal(finished.attackRoll.rolls[0],12)
  assert.equal(finished.attackRoll.total,12+5+6)
  assert.equal(finished.damageRoll.modifier,0);assert.equal(finished.damageDealt,4)
  const after=await call('get_game_state')
  assert.equal(after.dmTools.twoWeapon.receipts['offhand-1'].status,'resolved')
  assert.equal(after.monsters[target.id].hp.current,before.monsters[target.id].hp.current-4)
  assert.equal(after.bonusActionUsed.player,true)
  assert.equal(ok(await bonus(call,target.id,first.primaryAttackId)).alreadyResolved,true)
  assert.deepEqual(await call('get_game_state'),after)
  assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('throwing either weapon is explicit and conserves both physical items, even after the primary leaves the hand',async t=>{
  const {call,target}=await pair(t,{cell:{x:7,y:8},dice:'15,2,16,3,19'})
  const before=await call('get_game_state')
  assert.equal((await primary(call,target.id)).code,'TARGET_OUT_OF_RANGE')
  assert.deepEqual(await call('get_game_state'),before)
  const first=ok(await primary(call,target.id,{attackMode:'thrown'}))
  assert.equal(first.attackMode,'thrown');assert.equal(first.twoWeaponEligibility.otherItemId,'right-weapon')
  const answer=ok(await bonus(call,target.id,first.primaryAttackId,{attackMode:'thrown'}))
  assert.equal(answer.attackMode,'thrown');assert.equal(answer.damageRoll.modifier,0)
  const state=await call('get_game_state')
  for(const id of ['left-weapon','right-weapon']){
    assert.ok(!state.player.inventory.some(item=>item.id===id))
    assert.equal(state.droppedItems[id].item.id,id)
    assert.deepEqual(state.droppedItems[id].position,state.monsters[target.id].position)
  }
  assert.equal(state.dmTools.loadout.mainHandId,undefined);assert.equal(state.dmTools.loadout.offHandId,undefined)
  assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('a qualifying attack witness from a previous turn cannot authorize another bonus attack',async t=>{
  const {call,target}=await pair(t,{dice:'15,2,19'})
  const first=ok(await primary(call,target.id))
  await replace(call,state=>{
    state.turnCounter=(state.turnCounter??0)+2;state.round++
    state.actionUsed={};state.bonusActionUsed={};state.hero.actionCredits=1;delete state.hero.attackAction
  })
  const before=await call('get_game_state')
  assert.equal((await bonus(call,target.id,first.primaryAttackId)).code,'TWO_WEAPON_ATTACK_REQUIRED')
  assert.deepEqual(await call('get_game_state'),before)
  assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('strict witness schema rejects a single physical item masquerading as both hands',()=>{
  assert.equal(TwoWeaponStateSchema.safeParse({witnesses:{attack:{turnKey:'1:1:1:player',primaryItemId:'same',otherItemId:'same',primaryHand:'mainHandId',attackMode:'melee'}},receipts:{}}).success,false)
})
