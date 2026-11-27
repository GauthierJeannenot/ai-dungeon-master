const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto')
const {engine,ok,replace,spawn,battle,grid}=require('./helpers/mcp-toolkit.cjs')
const {copyWork}=require('./helpers/spell-copy-supplies.cjs')
const {playerSeesCell}=require('../mcp-server/dist/lib/scene-perception.js')
async function scroll(call,spellId,id=spellId){
  const state=await call('get_game_state'),input={itemId:id,spellId,name:'Parchemin au chiffre inconnu',description:'Des signes serrés sur un parchemin.',cell:state.player.position}
  ok(await call('create_spell_scroll',input));ok(await call('pick_up_item',{itemId:id}));return input
}
async function distant(call){
  const state=await call('get_game_state'),nav=grid(state),map=require('../mcp-server/dist/lib/adventure-map.js').getMapSpec(state.currentMapId,state)
  for(let y=0;y<map.grid.rows;y++)for(let x=0;x<map.grid.cols;x++)if(Math.max(Math.abs(x-state.player.position.x),Math.abs(y-state.player.position.y))>=5&&nav.free({x,y})&&playerSeesCell(state,{x,y}))return spawn(call,'goblin',{x,y})
  assert.fail('fixture needs a visible target away from the caster')
}
async function lowerSpellLevel(call){
  await replace(call,s=>{s.player.level=3;for(const key of ['level3','level4'])s.player.spellSlots[key]={current:0,max:0}})
}
test('scroll source table keeps primary provenance, exact passage hash and supported bounds',async t=>{
  const call=await engine(t),catalog=ok(await call('inspect_spell_scrolls')),source=require('../lib/srd/spell-scrolls-sources.json')
  const record=source.records['Spell Scroll'];assert.equal(record.page,242)
  assert.equal(record.sha256,crypto.createHash('sha256').update(record.text).digest('hex'))
  assert.ok(catalog.spells.length>10)
  for(const entry of catalog.spells){assert.ok(entry.level>=1&&entry.level<=5);assert.equal(entry.dc,entry.level<=2?13:entry.level<=4?15:17);assert.equal(entry.attackBonus,entry.level<=2?5:entry.level<=4?7:9)}
  const state=await call('get_game_state')
  assert.equal((await call('create_spell_scroll',{itemId:'unsupported',spellId:'shield',name:'Papier',description:'Une feuille.',cell:state.player.position})).code,'SPELL_SCROLL_UNSUPPORTED')
  assert.deepEqual(await call('get_game_state'),state)
})
test('unknown scroll properties remain secret through pickup, reading catalog and hydration; incompatible classes cannot read',async t=>{
  const call=await engine(t),definition=await scroll(call,'magic-missile','sealed-scroll')
  const before=await call('get_game_state'),inspected=ok(await call('inspect_spell_scrolls',{itemId:'sealed-scroll'}))
  assert.equal(inspected.identified,false);assert.equal(inspected.spellId,undefined)
  assert.equal((await call('read_spell_scroll',{itemId:'sealed-scroll'})).code,'SPELL_SCROLL_CLASS_REQUIRED')
  assert.equal((await call('use_spell_scroll',{itemId:'sealed-scroll',targetId:'player'})).code,'SPELL_SCROLL_CLASS_REQUIRED')
  assert.deepEqual(await call('get_game_state'),before)
  ok(await call('replace_game_state',{gameState:before}));assert.equal(ok(await call('create_spell_scroll',definition)).alreadyCreated,true)
  assert.equal((await call('create_spell_scroll',{...definition,spellId:'fireball'})).code,'SPELL_SCROLL_ID_CONFLICT')
})
test('a compatible reader learns properties without preparation, slots or consumption; blindness refuses atomically',async t=>{
  const call=await engine(t,{characterId:'wizard'});await scroll(call,'magic-missile','read-scroll')
  await replace(call,s=>{s.player.knownSpells=s.player.knownSpells.filter(id=>id!=='magic-missile')})
  const before=await call('get_game_state'),answer=ok(await call('read_spell_scroll',{itemId:'read-scroll'}))
  assert.equal(answer.item.spellId,'magic-missile');assert.equal(answer.item.dc,13)
  const after=await call('get_game_state');assert.deepEqual(after.player.spellSlots,before.player.spellSlots);assert.deepEqual(after.player.knownSpells,before.player.knownSpells)
  assert.equal(after.dmTools.spellScrolls['read-scroll'].status,'active')
  await replace(call,s=>s.player.conditions.push('blinded'))
  const blind=await call('get_game_state');assert.equal((await call('use_spell_scroll',{itemId:'read-scroll',targetId:'player'})).code,'SPELL_SCROLL_UNREADABLE');assert.deepEqual(await call('get_game_state'),blind)
})
test('actual darkness blocks reading, activation and copying even for identified scrolls; a real Light spell restores reading',async t=>{
  const call=await engine(t,{characterId:'wizard',dice:'1,2,3,20,19'})
  await scroll(call,'magic-missile','dark-cast');await scroll(call,'burning-hands','dark-copy')
  ok(await call('read_spell_scroll',{itemId:'dark-cast'}));ok(await call('read_spell_scroll',{itemId:'dark-copy'}))
  const enemy=await distant(call)
  await replace(call,s=>{
    s.player.spellbook=s.player.spellbook.filter(id=>id!=='burning-hands')
    s.player.inventory.find(i=>i.id==='spellbook').spellIds=[...s.player.spellbook]
    if(!s.player.knownSpells.includes('light'))s.player.knownSpells.push('light')
  })
  const location=await call('get_game_state')
  ok(await call('configure_scene_lighting',{roomId:location.currentRoomId,illumination:'darkness'}))
  const before=await call('get_game_state')
  for(const [name,args] of [
    ['read_spell_scroll',{itemId:'dark-cast'}],
    ['use_spell_scroll',{itemId:'dark-cast',targetId:enemy.id}],
    ['copy_spell_scroll',copyWork({itemId:'dark-copy',paid:{gp:25}})],
  ]){
    assert.equal((await call(name,args)).code,'SPELL_SCROLL_UNREADABLE')
    assert.deepEqual(await call('get_game_state'),before)
  }
  const lightObject=await require('./helpers/light-spell-fixture.cjs').prepareLightObject(call)
  ok(await call('cast_spell',{spellId:'light',lightObject:lightObject.selection,focusItemId:'component_pouch'}))
  assert.equal(ok(await call('inspect_lighting',{cell:before.player.position})).canSee,true)
  ok(await call('read_spell_scroll',{itemId:'dark-cast'}))
  const cast=ok(await call('use_spell_scroll',{itemId:'dark-cast',targetId:enemy.id}))
  assert.equal(cast.damageDealt,9)
  const copied=ok(await call('copy_spell_scroll',copyWork({itemId:'dark-copy',paid:{gp:25}})))
  assert.equal(copied.success,true);assert.equal(copied.check.roll.rolls[0],20);assert.equal(copied.seconds,3600)
  assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
test('an unprepared class-list spell casts with exhausted slots, consumes only its physical scroll, and cannot be recreated',async t=>{
  const call=await engine(t,{characterId:'wizard',dice:'1,2,3'}),definition=await scroll(call,'magic-missile','cast-scroll'),enemy=await distant(call)
  await replace(call,s=>{s.player.knownSpells=[];for(const p of Object.values(s.player.spellSlots))p.current=0;s.player.inventory=s.player.inventory.filter(i=>!['component_pouch','arcane_focus'].includes(i.id))})
  await battle(call,[enemy.id]);const before=await call('get_game_state')
  const answer=ok(await call('use_spell_scroll',{itemId:'cast-scroll',targetId:enemy.id}))
  assert.equal(answer.damageDealt,9);assert.equal(answer.spellSlotSpent,false)
  const after=await call('get_game_state');assert.equal(after.dmTools.spellScrolls['cast-scroll'].status,'consumed');assert.equal(after.hero.actionCredits,0)
  assert.deepEqual(after.player.spellSlots,before.player.spellSlots)
  await replace(call,s=>{s.phase='exploration';s.currentTurn=null;s.initiativeOrder=[]})
  assert.equal(ok(await call('create_spell_scroll',definition)).alreadyCreated,true)
})
test('the source fixed scroll attack bonus replaces the readers stronger spell attack bonus',async t=>{
  const call=await engine(t,{characterId:'cleric',dice:'10,1,2,3,4'});await scroll(call,'guiding-bolt','attack-scroll')
  const enemy=await distant(call);await battle(call,[enemy.id])
  const answer=ok(await call('use_spell_scroll',{itemId:'attack-scroll',targetId:enemy.id}))
  assert.equal(answer.roll.modifier,5);assert.equal(answer.damageDealt,10)
})
test('invalid choices never consume a scroll, an action or even the later higher-level check die',async t=>{
  const call=await engine(t,{characterId:'wizard',dice:'19'});await scroll(call,'fireball','invalid-scroll');await lowerSpellLevel(call)
  const before=await call('get_game_state')
  assert.equal((await call('use_spell_scroll',{itemId:'invalid-scroll',targetId:'missing-target'})).code,'AREA_SELECTION_REQUIRED')
  assert.deepEqual(await call('get_game_state'),before);assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
test('a failed higher-level ability check destroys the scroll with no spell effect, spends its action and no slot',async t=>{
  const call=await engine(t,{characterId:'wizard',dice:'1,19'});await scroll(call,'fireball','failed-scroll');await lowerSpellLevel(call)
  const enemy=await distant(call);await battle(call,[enemy.id]);const before=await call('get_game_state')
  const answer=ok(await call('use_spell_scroll',{itemId:'failed-scroll',toCell:enemy.position}))
  assert.equal(answer.success,false);assert.equal(answer.spellScrollUse.check.dc,13)
  const after=await call('get_game_state');assert.equal(after.monsters[enemy.id].hp.current,before.monsters[enemy.id].hp.current);assert.equal(after.hero.actionCredits,0)
  assert.equal(after.dmTools.spellScrolls['failed-scroll'].status,'consumed');assert.deepEqual(after.player.spellSlots,before.player.spellSlots)
  assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
test('higher-level check and held spell save resume across hydration without rerolling or paying twice',async t=>{
  const call=await engine(t,{characterId:'wizard',dice:'8,4,1,1,1,1,1,1,1,1,10,4'});await scroll(call,'fireball','held-scroll');await lowerSpellLevel(call)
  const enemy=await distant(call);await battle(call,[enemy.id])
  await replace(call,s=>{s.hero.inspiration.push({targetId:'player',expiresAt:s.worldTimeSeconds+600,die:8},{targetId:enemy.id,expiresAt:s.worldTimeSeconds+600,die:8})})
  const held=ok(await call('use_spell_scroll',{itemId:'held-scroll',toCell:enemy.position}))
  assert.ok(held.pendingReaction)
  const before=await call('get_game_state');assert.equal(before.dmTools.spellScrolls['held-scroll'].status,'active');assert.equal(before.hero.actionCredits,1)
  ok(await call('replace_game_state',{gameState:before}))
  const saved=ok(await call('resolve_reaction',{pendingId:held.pendingReaction.id,choice:'bardic_inspiration'}))
  assert.ok(saved.pendingReaction);const during=await call('get_game_state');assert.equal(during.dmTools.spellScrolls['held-scroll'].status,'consumed');assert.equal(during.hero.actionCredits,0)
  ok(await call('replace_game_state',{gameState:during}))
  const finished=ok(await call('resolve_reaction',{pendingId:saved.pendingReaction.id,choice:'bardic_inspiration'}))
  assert.equal(finished.dc,15);assert.equal(finished.damageDealt,4);assert.equal(finished.spellScrollUse.check.roll.total,8+Math.floor((before.player.stats.int-10)/2)+4)
  const after=await call('get_game_state');assert.deepEqual(after.player.spellSlots,before.player.spellSlots);assert.equal(after.hero.actionCredits,0)
})
test('wizard copying pays exact source costs and consumes on both success and failure; a known spell is never prepared automatically',async t=>{
  for(const [die,succeeds] of [['20',true],['1',false]]){
    const call=await engine(t,{characterId:'wizard',dice:die});await scroll(call,'shatter',`copy-${die}`)
    await replace(call,s=>{s.player.spellbook=s.player.spellbook.filter(id=>id!=='shatter');s.player.inventory.find(i=>i.id==='spellbook').spellIds=[...s.player.spellbook]})
    const before=await call('get_game_state')
    const answer=ok(await call('copy_spell_scroll',copyWork({itemId:`copy-${die}`,paid:{gp:50}})))
    assert.equal(answer.success,succeeds);assert.equal(answer.costGold,50);assert.equal(answer.seconds,7200);assert.equal(answer.check.dc,12)
    const after=await call('get_game_state');assert.equal(after.dmTools.wallet.gp,before.dmTools.wallet.gp-50)
    assert.equal(after.worldTimeSeconds,before.worldTimeSeconds+7200);assert.equal(after.player.spellbook.includes('shatter'),succeeds)
    assert.deepEqual(after.player.knownSpells,before.player.knownSpells);assert.equal(after.dmTools.spellScrolls[`copy-${die}`].status,'consumed')
  }
})
test('wrong copying payments or inadequate denominations refuse before dice, time or consumption',async t=>{
  const call=await engine(t,{characterId:'wizard',dice:'19'});await scroll(call,'shatter','poor-copy')
  await replace(call,s=>{s.player.spellbook=s.player.spellbook.filter(id=>id!=='shatter');s.player.inventory.find(item=>item.id==='spellbook').spellIds=[...s.player.spellbook];s.dmTools.wallet.gp=0})
  const before=await call('get_game_state')
  assert.equal((await call('copy_spell_scroll',copyWork({itemId:'poor-copy',paid:{gp:49}}))).code,'SPELL_COPY_PAYMENT_INVALID')
  assert.equal((await call('copy_spell_scroll',copyWork({itemId:'poor-copy',paid:{gp:50}}))).code,'INSUFFICIENT_COINS')
  assert.deepEqual(await call('get_game_state'),before);assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
