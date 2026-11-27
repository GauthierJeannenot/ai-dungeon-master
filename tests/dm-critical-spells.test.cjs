const test=require('node:test'),assert=require('node:assert/strict')
Object.assign(process.env,{MONETIZATION_ENABLED:'false',LLM_MODE:'mock',ALLOW_PAID_LLM:'false',DM_RATE_LIMIT_PER_MINUTE:'0',APP_LOG_PERSIST_ENABLED:'false',APP_LOG_LEVEL:'error'})
const{installPgMem}=require('./helpers/pg-mem.cjs'),pg=installPgMem()
const{ok}=require('./helpers/mcp-toolkit.cjs')
const{mageConcentration}=require('./helpers/critical-spells-fixture.cjs')
const{play,lastResult}=require('./helpers/dm-scripted-turn.cjs')
test.after(()=>pg.restore())

test('POST forwards the exact new-concentration and Counterspell choices, persists its single start and never restores the older effect',async t=>{
 const f=await mageConcentration(t,{self:true}),before=await f.call('get_game_state')
 const cast={name:'cast_creature_spell',input:{casterId:f.mage.id,spellId:'greater-invisibility',targetId:f.ally.id,spellObservers:[{observerId:'player',channels:['sight']}]}}
 let reaction
 const played=await play(t,f.call,[cast,params=>{
  const a=ok(lastResult(params));assert.ok(a.pendingReaction);reaction={name:'resolve_reaction',input:{pendingId:a.pendingReaction.id,choice:'counterspell',slotLevel:4}}
  return reaction
 },params=>{assert.equal(ok(lastResult(params)).countered,true);return{name:'next_turn',input:{actorId:f.mage.id}}},
 'Le nouveau sort a été contré après la fin de l’ancienne concentration ; le MJ a explicitement terminé le vrai tour du mage.'],
 'Le MJ lance ce nouveau sort réel avec le mage désigné ; je choisis explicitement Contresort avec mon emplacement de niveau4.')
 assert.deepEqual(played.selected,[cast,reaction,{name:'next_turn',input:{actorId:f.mage.id}}]);assert.deepEqual(played.seen,played.selected)
 const after=played.result.newGameState
 assert.equal(after.hero.concentrationIds[f.mage.id],undefined);assert.equal(after.hero.concentrationStart,undefined)
 assert.ok(!after.monsters[f.mage.id].conditions.includes('invisible'));assert.ok(!after.monsters[f.ally.id].conditions.includes('invisible'))
 assert.equal(after.monsters[f.mage.id].monsterRuntime.spellSlots.level4.current,before.monsters[f.mage.id].monsterRuntime.spellSlots.level4.current-1)
 assert.equal(after.player.spellSlots.level4.current,before.player.spellSlots.level4.current-1)
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
