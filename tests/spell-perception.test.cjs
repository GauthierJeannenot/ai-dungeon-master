const test=require('node:test'),assert=require('node:assert/strict')
Object.assign(process.env,{MONETIZATION_ENABLED:'false',LLM_MODE:'mock',ALLOW_PAID_LLM:'false'})
const{setup,refused,noIdentity}=require('./helpers/spell-perception-fixture.cjs')
const{ok}=require('./helpers/mcp-toolkit.cjs')
test('an actual prepared Mage Armor cast on the exact player with its real pouch is perceived through its material component, without identifying spell level or hidden targets',async t=>{
 const f=await setup(t),before=await f.call('get_game_state'),cast=ok(await f.call('cast_spell',f.materialCast()));assert.ok(cast.spellPerceptionEventId)
 const view=ok(await f.inspect(cast.spellPerceptionEventId));assert.equal(view.castingPerceived,true);assert.deepEqual(view.perceivedComponents,['S','M']);assert.equal(view.sourceAttributed,true);assert.equal(view.casterId,'player');noIdentity(view)
 const after=await f.call('get_game_state');assert.equal(after.player.spellSlots.level1.current,before.player.spellSlots.level1.current-1);assert.equal(require('../mcp-server/dist/lib/hero-state.js').heroArmorClass(after.player,after.hero,after.worldTimeSeconds),15);assert.equal(Object.keys(after.dmTools.spellPerception.records).length,1);const record=after.dmTools.spellPerception.records[cast.spellPerceptionEventId];assert.equal(record.original.componentProof.focusItemId,'component_pouch');assert.equal(record.phase,'cast');assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('a real verbally qualified casting can be heard without attributing its voice or identifying the spell, while current later sight cannot retrofit another observer',async t=>{
 const f=await setup(t),fact=await f.sourceFact(),cast=ok(await f.call('cast_spell',f.materialCast([f.choice(['hearing'],{verbalAudibility:{factId:fact.id,actualAudibleConfirmed:true,reason:'The actual chosen observer hears this current casting voice; no visual source or voice identity is established.'}})])))
 const view=ok(await f.inspect(cast.spellPerceptionEventId));assert.equal(view.castingPerceived,true);assert.deepEqual(view.perceivedComponents,['V']);assert.equal(view.sourceAttributed,false);assert.equal(Object.hasOwn(view,'casterId'),false);noIdentity(view)
 await refused(f.call,'inspect_spellcasting_perception',{eventId:cast.spellPerceptionEventId,observerId:'player'},'SPELL_PERCEPTION_OBSERVER_NOT_RECORDED');assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
test('missing verbal qualification, an unreal observer or failed casting prevalidation refuses before dice, slot, action, effect or observation history',async t=>{
 const f=await setup(t);await refused(f.call,'cast_spell',f.materialCast([f.choice(['hearing'])]),'SPELL_PERCEPTION_AUDIBILITY_REQUIRED');await refused(f.call,'cast_spell',f.materialCast([{observerId:'invented-spectator',channels:['sight']}]),'SPELL_PERCEPTION_OBSERVER_REQUIRED');await refused(f.call,'cast_spell',f.materialCast(undefined,{focusItemId:'invented-pouch'}),'SPELL_COMPONENT_SOURCE_REQUIRED');assert.equal((await f.call('get_game_state')).dmTools.spellPerception,undefined);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
