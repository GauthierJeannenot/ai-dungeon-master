const test=require('node:test'),assert=require('node:assert/strict')
const {engine,ok,replace,spawn,battle,object}=require('./helpers/mcp-toolkit.cjs')

async function fixture(t,{dice,cell,crate=false}){
  const call=await engine(t,{characterId:'wizard',dice}),initial=await call('get_game_state')
  const main=initial.dmTools?.loadout?.mainHandId??initial.player.inventory.find(item=>item.type==='weapon').id
  ok(await call('equip_item',{itemId:main,slot:'main_hand',operation:'unequip'}))
  await replace(call,state=>{state.player.inventory.push(
    {id:'integration-left',equipmentId:'dagger',name:'Dague gauche',type:'weapon'},
    {id:'integration-right',equipmentId:'dagger',name:'Dague droite',type:'weapon'})})
  ok(await call('equip_item',{itemId:'integration-left',slot:'main_hand',operation:'equip'}))
  ok(await call('equip_item',{itemId:'integration-right',slot:'off_hand',operation:'equip'}))
  if(crate)await object(call,'integration-crate')
  const target=await spawn(call,'goblin',cell)
  await battle(call,[target.id])
  return {call,target}
}
const bonus=(call,targetId,primaryAttackId,attackMode='melee')=>call('resolve_two_weapon_attack',{
  attackId:'integration-bonus',targetId,primaryAttackId,weaponItemId:'integration-right',attackMode,
})

test('a real Attack against an object supplies its exact witness for a subsequent off-hand attack against a creature',async t=>{
  const {call,target}=await fixture(t,{crate:true,dice:'15,2,16,3,19'})
  const first=ok(await call('interact_object',{objectId:'integration-crate',action:'attack',weaponId:'integration-left'}))
  assert.equal(first.hit,true);assert.equal(first.damageDealt,4)
  assert.ok(first.primaryAttackId);assert.equal(first.twoWeaponEligibility.otherItemId,'integration-right')
  const before=await call('get_game_state')
  assert.ok(!before.player.features.includes('two_weapon_fighting'))
  assert.equal(before.dmTools.objects['integration-crate'].hp.current,6)
  assert.equal(before.dmTools.twoWeapon.witnesses[first.primaryAttackId].primaryItemId,'integration-left')
  const answer=ok(await bonus(call,target.id,first.primaryAttackId)),after=await call('get_game_state')
  assert.equal(answer.damageRoll.modifier,0);assert.equal(answer.damageDealt,3)
  assert.equal(after.monsters[target.id].hp.current,before.monsters[target.id].hp.current-3)
  assert.equal(after.bonusActionUsed.player,true)
  assert.equal(after.hero.actionCredits,before.hero.actionCredits)
  assert.deepEqual(after.hero.attackAction,before.hero.attackAction)
  assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('an actually owned Two-Weapon Fighting style restores the ability damage modifier without granting the style to a default profile',async t=>{
  const {call,target}=await fixture(t,{dice:'15,2,16,3,19'})
  const initial=await call('get_game_state')
  assert.ok(!initial.player.features.includes('two_weapon_fighting'))
  assert.ok(!initial.player.features.includes('dueling'))
  await replace(call,state=>{state.player.features.push('two_weapon_fighting')})
  const first=ok(await call('resolve_player_attack',{targetId:target.id,weaponOrSpell:'integration-left'}))
  const answer=ok(await bonus(call,target.id,first.primaryAttackId))
  assert.equal(answer.attackRoll.modifier,5)
  assert.equal(answer.damageRoll.modifier,2);assert.equal(answer.damageDealt,5)
  assert.ok((await call('get_game_state')).player.features.includes('two_weapon_fighting'))
  assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('a cover-induced primary miss still witnesses Attacking and a hydrated Bardic bonus reuses the same covered AC',async t=>{
  const {call,target}=await fixture(t,{cell:{x:7,y:8},dice:'11,10,3,4,19'})
  ok(await call('configure_cover',{coverId:'offhand-parapet',operation:'set',originId:'player',targetId:target.id,
    obstacleCell:{x:5,y:8},degree:'half',reason:'Le MJ établit ce parapet entre le lanceur et la cible.'}))
  const first=ok(await call('resolve_player_attack',{targetId:target.id,weaponOrSpell:'integration-left',attackMode:'thrown'}))
  assert.equal(first.attackRoll.total,16);assert.equal(first.targetAC,17);assert.equal(first.hit,false)
  assert.equal(first.twoWeaponEligibility.otherItemId,'integration-right','Attacking, rather than hitting, supplies the prerequisite')
  await replace(call,state=>{state.hero.inspiration.push({targetId:'player',die:8,expiresAt:state.worldTimeSeconds+600})})
  const held=ok(await bonus(call,target.id,first.primaryAttackId,'thrown'))
  assert.equal(held.pendingReaction.roll.rolls[0],10)
  const saved=await call('get_game_state')
  ok(await call('replace_game_state',{gameState:saved}))
  assert.equal((await call('configure_cover',{coverId:'offhand-parapet',operation:'remove'})).code,'REACTION_PENDING')
  assert.deepEqual(await call('get_game_state'),saved)
  const finished=ok(await call('resolve_reaction',{pendingId:held.pendingReaction.id,choice:'bardic_inspiration'}))
  assert.equal(finished.attackRoll.rolls[0],10);assert.equal(finished.attackRoll.total,18)
  assert.equal(finished.targetAC,17);assert.equal(finished.hit,true);assert.equal(finished.damageDealt,4)
  assert.equal((await call('get_game_state')).monsters[target.id].hp.current,196)
  assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
