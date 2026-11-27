const test=require('node:test'),assert=require('node:assert/strict')
const {installTsRequireWithAliases}=require('./helpers/ts-require.cjs');installTsRequireWithAliases()
const {PURPLE_WORM_SWALLOW_SOURCE:source}=require('../lib/srd/purple-worm-swallow.ts')
const {SwallowInternalDamageWitnessSchema,SwallowSourceEventSchema,qualifyingSwallowDamage}=require('../lib/swallow-source-state.ts')
const turn={combatGeneration:7,turnCounter:12,actorId:'actual-turn-owner'}
const event=(eventId,damageReceived,extra={})=>({eventId,episodeId:'actual-swallow-episode',sourceId:'actual-worm',insideActorId:'actual-inside-body',turn:{...turn},damageReceived,at:600,...extra})
const selection={sourceId:'actual-worm',insideActorId:'actual-inside-body',turn}
test('source prerequisites preserve the exact supplied bite, size/save, acid, regurgitation and corpse-exit procedures without activating them',()=>{
 assert.deepEqual([source.attackBonus,source.reachFeet,source.damageDice],[14,10,'3d8+9']);assert.deepEqual([source.swallow.ability,source.swallow.dc,source.swallow.maximumTargetSize],['dex',19,'Large']);assert.deepEqual(source.swallow.conditions,['blinded','restrained']);assert.equal(source.swallow.externalCover,'total');assert.deepEqual([source.acid.damageDice,source.acid.damageType,source.acid.timing],['6d6','acid','start_of_each_source_turn']);assert.deepEqual([source.regurgitation.thresholdDamageReceived,source.regurgitation.ability,source.regurgitation.dc,source.regurgitation.maximumExitDistanceFeet],[30,'con',21,10]);assert.equal(source.corpseEscape.movementFeet,20);assert.equal(source.corpseEscape.sourceDeathEndsRestrained,true)
})
test('one actual inside body can reach30 damage over distinct events during exactly one global turn',()=>{
 const a=qualifyingSwallowDamage([event('first-hit',17),event('second-hit',13)],selection);assert.equal(a.qualifying,true);assert.equal(a.damageReceived,30);assert.deepEqual(a.eventIds,['first-hit','second-hit']);assert.equal(qualifyingSwallowDamage([event('first-hit',29)],selection).qualifying,false)
})
test('two inside bodies or different turn counters/generations never pool their damage into the threshold',()=>{
 const original=event('first-hit',17),others=[event('another-body',20,{insideActorId:'other-inside-body'}),event('another-turn',20,{turn:{...turn,turnCounter:13}}),event('another-encounter',20,{turn:{...turn,combatGeneration:8}}),event('another-owner',20,{turn:{...turn,actorId:'different-turn-owner'}}),event('another-source',20,{sourceId:'other-worm'})]
 for(const other of others){const a=qualifyingSwallowDamage([original,other],selection);assert.equal(a.qualifying,false);assert.equal(a.damageReceived,17);assert.deepEqual(a.eventIds,['first-hit'])}
})
test('a retained actual damage event counts once while an identity reused for other damage is refused',()=>{
 const a=event('same-hit',17);assert.equal(qualifyingSwallowDamage([a,structuredClone(a)],selection).damageReceived,17);assert.throws(()=>qualifyingSwallowDamage([a,event('same-hit',13)],selection),/SWALLOW_DAMAGE_EVENT_CONFLICT/)
})
test('damage already absorbed by temporaryHP still counts as real received damage, and raw or HP-only replacements are not accepted as witnesses',()=>{
 assert.equal(qualifyingSwallowDamage([event('actual-damage-after-defenses',30)],selection).qualifying,true)
 const actual=event('actual-damage-after-defenses',0);delete actual.damageReceived;assert.equal(SwallowInternalDamageWitnessSchema.safeParse({...actual,rawDamage:30,hpLost:0}).success,false);assert.equal(SwallowInternalDamageWitnessSchema.safeParse(event('negative',-1)).success,false)
})
test('the source start-turn acid event cannot be assigned to another body turn or duplicate one swallowed episode',()=>{
 const a={kind:'source_turn_acid',sourceId:'actual-worm',turn:{...turn,actorId:'actual-worm'},episodeIds:['actual-episode']};assert.equal(SwallowSourceEventSchema.safeParse(a).success,true);assert.equal(SwallowSourceEventSchema.safeParse({...a,turn}).success,false);assert.equal(SwallowSourceEventSchema.safeParse({...a,episodeIds:['actual-episode','actual-episode']}).success,false)
})
test('a regurgitation event retains one actual inside attacker and distinct original damage events without arbitrary dice or exit coordinates',()=>{
 const a={kind:'inside_damage_regurgitation',sourceId:'actual-worm',turn,qualifyingInsideActorId:'actual-inside-body',damageEventIds:['actual-hit']};assert.equal(SwallowSourceEventSchema.safeParse(a).success,true);assert.equal(SwallowSourceEventSchema.safeParse({...a,dc:1}).success,false);assert.equal(SwallowSourceEventSchema.safeParse({...a,exitCell:{x:2,y:2}}).success,false);assert.equal(SwallowSourceEventSchema.safeParse({...a,qualifyingInsideActorId:'actual-worm'}).success,false)
})
