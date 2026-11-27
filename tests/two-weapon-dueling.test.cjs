const test=require('node:test'),assert=require('node:assert/strict')
const {engine,ok,replace,spawn,battle}=require('./helpers/mcp-toolkit.cjs')

async function fixture(t,dice){
  const call=await engine(t,{characterId:'fighter',dice}),initial=await call('get_game_state')
  assert.ok(initial.player.features.includes('dueling'))
  assert.ok(!initial.player.features.includes('two_weapon_fighting'))
  const main=initial.dmTools?.loadout?.mainHandId??initial.player.inventory.find(item=>item.type==='weapon').id
  ok(await call('equip_item',{itemId:main,slot:'main_hand',operation:'unequip'}))
  ok(await call('equip_item',{itemId:'shield',slot:'shield',operation:'unequip'}))
  await replace(call,state=>{state.player.inventory.push(
    {id:'dueling-left',equipmentId:'dagger',name:'Dague gauche',type:'weapon'},
    {id:'dueling-right',equipmentId:'dagger',name:'Dague droite',type:'weapon'})})
  ok(await call('equip_item',{itemId:'dueling-left',slot:'main_hand',operation:'equip'}))
  ok(await call('equip_item',{itemId:'dueling-right',slot:'off_hand',operation:'equip'}))
  const target=await spawn(call)
  await battle(call,[target.id])
  return {call,target,features:initial.player.features}
}

for(const mode of ['melee','thrown'])test(`Dueling applies to the sole remaining off-hand melee weapon in ${mode} mode, without adding positive ability damage`,async t=>{
  const dice=mode==='melee'?'16,15,2,16,3,19':'16,15,2,17,16,3,19'
  const {call,target,features}=await fixture(t,dice)
  const first=ok(await call('resolve_player_attack',{targetId:target.id,weaponOrSpell:'dueling-left',attackMode:'thrown'}))
  assert.equal(first.hit,true);assert.match(first.attackRoll.detail,/DIS:/,'the adjacent hostile creature imposes ranged-attack disadvantage')
  assert.equal(first.damageRoll.modifier,4,'both weapons were held: primary gets STR+4, without Dueling+2')
  assert.equal(first.damageDealt,6)
  const before=await call('get_game_state')
  assert.equal(before.dmTools.loadout.mainHandId,undefined)
  assert.equal(before.dmTools.loadout.offHandId,'dueling-right')
  assert.equal(before.dmTools.loadout.shieldId,undefined)
  assert.ok(before.droppedItems['dueling-left'])
  assert.ok(before.player.inventory.some(item=>item.id==='longsword'),'the carried spare does not count as a held weapon')
  const answer=ok(await call('resolve_two_weapon_attack',{attackId:`dueling-${mode}`,primaryAttackId:first.primaryAttackId,
    weaponItemId:'dueling-right',targetId:target.id,attackMode:mode}))
  assert.equal(answer.hit,true);assert.equal(answer.attackRoll.modifier,7)
  assert.equal(answer.damageRoll.modifier,2,'only the acquired Dueling bonus, with no positive STR+4 on the bonus attack')
  assert.equal(answer.damageDealt,5)
  const after=await call('get_game_state')
  assert.deepEqual(after.player.features,features,'no style was granted by either attack')
  assert.equal(after.bonusActionUsed.player,true)
  assert.equal(after.monsters[target.id].hp.current,before.monsters[target.id].hp.current-5)
  if(mode==='thrown')assert.ok(after.droppedItems['dueling-right'])
  else assert.equal(after.dmTools.loadout.offHandId,'dueling-right')
  assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
