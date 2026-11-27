const test=require('node:test'),assert=require('node:assert/strict')
const {engine,ok,spawn,battle}=require('./helpers/mcp-toolkit.cjs')

const totalCover=(call,originId,targetId,obstacleCell)=>call('configure_cover',{
  coverId:'action-preflight-total',operation:'set',originId,targetId,obstacleCell,degree:'total',
  reason:'Le MJ établit un parapet opaque protégeant cette cible depuis cette origine exacte.',
})

test('the entire explicit player multiattack list refuses a later totally covered target before the first die or action',async t=>{
  const call=await engine(t,{dice:'3,19'}),first=await spawn(call),covered=await spawn(call)
  const positioned=await call('get_game_state')
  ok(await totalCover(call,'player',covered.id,positioned.monsters[covered.id].position))
  await battle(call,[first.id,covered.id])
  const before=await call('get_game_state')
  assert.ok(before.player.features.includes('extra_attack'))
  const answer=await call('resolve_player_multiattack',{attacks:[
    {targetId:first.id,weaponOrSpell:'longsword'},
    {targetId:covered.id,weaponOrSpell:'longsword'},
  ]})
  assert.equal(answer.code,'COVER_TOTAL')
  assert.deepEqual(await call('get_game_state'),before)
  assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,3,'the otherwise legal first attack did not roll')
})

test('a sourced violet fungus random Multiattack refuses total cover before its 1d4 attack-count die',async t=>{
  const source=require('../lib/srd/monsters.json').monsters.violet_fungus.source
  assert.equal(source.actions.find(action=>action.name==='Multiattack').actions[0].count,'1d4')
  const call=await engine(t,{dice:'3,19'}),fungus=await spawn(call,'violet_fungus')
  const positioned=await call('get_game_state')
  ok(await totalCover(call,fungus.id,'player',positioned.player.position))
  await battle(call,[fungus.id],fungus.id)
  const before=await call('get_game_state')
  const answer=await call('resolve_monster_action',{monsterId:fungus.id,targetId:'player',actionName:'Multiattack'})
  assert.equal(answer.code,'COVER_TOTAL')
  assert.deepEqual(await call('get_game_state'),before)
  assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,3,'the real source-random 1d4 count was not rolled')
})
