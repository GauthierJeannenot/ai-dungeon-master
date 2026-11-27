const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto')
const {engine,ok,replace,spawn,battle,grid}=require('./helpers/mcp-toolkit.cjs')
const {inferRoomIdOnMap}=require('../mcp-server/dist/lib/adventure-map.js')

async function caster(t,options={}){
  const call=await engine(t,{characterId:'cleric',...options})
  ok(await call('equip_item',{itemId:'mace',operation:'unequip',slot:'main_hand'}))
  await replace(call,s=>{for(const spell of ['bestow-curse','remove-curse'])if(!s.player.knownSpells.includes(spell))s.player.knownSpells.push(spell)})
  return call
}
const curse=(call,targetId,choice={kind:'ability',ability:'str'},slotLevel=3)=>call('cast_curse',{spellId:'bestow-curse',targetId,curse:choice,slotLevel})

test('curse spell snapshots retain primary pages and the original 2014 metadata without invented save or duration',()=>{
  const source=require('../lib/srd/curse-spell-sources.json')
  for(const record of Object.values(source.records))assert.equal(crypto.createHash('sha256').update(JSON.stringify(record.source)).digest('hex'),record.sha256)
  const bestow=source.records['spells/bestow-curse']
  assert.equal(bestow.primaryPage,121);assert.equal(bestow.source.level,3);assert.equal(bestow.source.dc.dc_type.index,'wis')
  assert.equal(bestow.source.concentration,true);assert.equal(bestow.source.range,'Touch')
  assert.equal(source.records['spells/remove-curse'].primaryPage,174)
})

test('curse spells require genuine known/prepared magic, exact targets and an implemented choice before paying or rolling',async t=>{
  const call=await engine(t,{characterId:'cleric',dice:'19'}),target=await spawn(call),before=await call('get_game_state')
  assert.equal((await curse(call,target.id)).code,'SPELL_NOT_KNOWN')
  assert.deepEqual(await call('get_game_state'),before)
  await replace(call,s=>{s.player.knownSpells.push('bestow-curse')})
  const ready=await call('get_game_state')
  assert.equal((await call('cast_spell',{spellId:'bestow-curse',targetId:target.id})).code,'CURSE_VARIANT_REQUIRED')
  assert.ok((await curse(call,target.id,{kind:'extra_damage'})).error)
  assert.equal((await curse(call,'nonexistent')).code,'ENTITY_NOT_FOUND')
  assert.deepEqual(await call('get_game_state'),ready)
  assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('a failed Wisdom save applies disadvantage only to checks and saves of the selected ability, surviving hydration',async t=>{
  const call=await caster(t,{dice:'1,19,2,18,3,17'}),target=await spawn(call)
  const cast=ok(await curse(call,target.id))
  assert.equal(cast.cursed,true);assert.equal(cast.save.ability,'wis')
  const saved=await call('get_game_state');ok(await call('replace_game_state',{gameState:saved}))
  const check=ok(await call('roll_ability_check',{entityId:target.id,ability:'str',dc:15}))
  assert.equal(check.roll.rolls[0],2);assert.match(check.roll.detail,/DIS:/)
  const save=ok(await call('resolve_saving_throw',{entityId:target.id,ability:'str',dc:15}))
  assert.equal(save.roll.rolls[0],3);assert.match(save.roll.detail,/DIS:/)
  const other=ok(await call('roll_ability_check',{entityId:target.id,ability:'int',dc:15}))
  assert.equal(other.roll.rolls[0],17);assert.doesNotMatch(other.roll.detail,/DIS:/)
})

test('level four curse lasts ten source minutes, expires at the boundary, and ending concentration removes it earlier',async t=>{
  const call=await caster(t,{dice:'1,1'}),target=await spawn(call)
  ok(await curse(call,target.id,{kind:'ability',ability:'dex'},4))
  let curses=ok(await call('inspect_curses',{targetId:target.id})).curses
  assert.equal(curses.length,1);assert.equal(curses[0].expiresAt,600)
  ok(await call('advance_time',{seconds:599}))
  assert.equal(ok(await call('inspect_curses',{targetId:target.id})).curses.length,1)
  ok(await call('advance_time',{seconds:1}))
  assert.equal(ok(await call('inspect_curses',{targetId:target.id})).curses.length,0)
  ok(await curse(call,target.id))
  ok(await call('end_concentration'))
  assert.equal(ok(await call('inspect_curses',{targetId:target.id})).curses.length,0)
})

test('a successful Wisdom save spends the real action and slot but never applies a curse',async t=>{
  const call=await caster(t,{dice:'20'}),target=await spawn(call)
  await battle(call,[target.id]);const before=await call('get_game_state')
  const answer=ok(await curse(call,target.id))
  assert.equal(answer.cursed,false);assert.equal(answer.save.success,true)
  const state=await call('get_game_state')
  assert.equal(state.hero.actionCredits,0);assert.equal(state.player.spellSlots.level3.current,before.player.spellSlots.level3.current-1)
  assert.equal(ok(await call('inspect_curses',{targetId:target.id})).curses.length,0)
  assert.equal(state.hero.concentrationId,undefined)
})

test('a held Bardic Wisdom save resumes across hydration without another slot, action or initial d20',async t=>{
  const call=await caster(t,{dice:'10,8,19'}),target=await spawn(call)
  await battle(call,[target.id])
  await replace(call,s=>{s.hero.inspiration.push({targetId:target.id,expiresAt:s.worldTimeSeconds+600,die:8})})
  const held=ok(await curse(call,target.id));assert.ok(held.pendingReaction)
  const saved=await call('get_game_state');assert.equal(saved.hero.actionCredits,0)
  assert.equal(ok(await call('inspect_curses',{targetId:target.id})).curses.length,0)
  ok(await call('replace_game_state',{gameState:saved}))
  const result=ok(await call('resolve_reaction',{pendingId:held.pendingReaction.id,choice:'bardic_inspiration'}))
  assert.equal(result.cursed,false);assert.equal(result.save.success,true)
  assert.deepEqual((await call('get_game_state')).player.spellSlots,saved.player.spellSlots)
  assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('the attack variant applies only against its caster, not against another creature',async t=>{
  const call=await caster(t,{dice:'1,19,2,17,4'}),target=await spawn(call)
  const scene=await call('get_game_state'),nav=grid(scene,target.id)
  const cell=nav.neighbors(target.position).find(c=>nav.free(c)&&nav.step(target.position,c)
    &&inferRoomIdOnMap(c,scene.currentMapId,scene)===scene.currentRoomId)
  assert.ok(cell)
  const other=await spawn(call,'bandit',cell)
  ok(await curse(call,target.id,{kind:'attacks_against_caster'}))
  await battle(call,[target.id,other.id],target.id)
  const againstCaster=ok(await call('resolve_attack',{attackerId:target.id,targetId:'player',weaponOrSpell:'Scimitar'}))
  assert.match(againstCaster.attackRoll.detail,/DIS:/);assert.equal(againstCaster.attackRoll.rolls[0],2)
  await replace(call,s=>{s.actionUsed={}})
  const againstOther=ok(await call('resolve_attack',{attackerId:target.id,targetId:other.id,weaponOrSpell:'Scimitar'}))
  assert.doesNotMatch(againstOther.attackRoll.detail,/DIS:/);assert.equal(againstOther.attackRoll.rolls[0],17)
})

test('Remove Curse is a real touch spell with slot/action costs and ends the tracked curse and its concentration',async t=>{
  const call=await caster(t,{dice:'1'}),target=await spawn(call)
  ok(await curse(call,target.id))
  const before=await call('get_game_state')
  const removed=ok(await call('cast_curse',{spellId:'remove-curse',targetId:target.id}))
  assert.equal(removed.removedCount,1)
  const state=await call('get_game_state')
  assert.equal(state.player.spellSlots.level3.current,before.player.spellSlots.level3.current-1)
  assert.equal(state.hero.concentrationId,undefined)
  assert.equal(ok(await call('inspect_curses',{targetId:target.id})).curses.length,0)
})
