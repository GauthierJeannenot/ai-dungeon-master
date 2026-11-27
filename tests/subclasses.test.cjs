const test=require('node:test')
const {copyWork}=require('./helpers/spell-copy-supplies.cjs')
const assert=require('node:assert/strict')
const {Client}=require('@modelcontextprotocol/sdk/client/index.js')
const {StdioClientTransport}=require('@modelcontextprotocol/sdk/client/stdio.js')
const crypto=require('node:crypto')
const restoreTs=require('./helpers/ts-require.cjs').installTsRequireWithAliases()
test.after(restoreTs)

test('Pinned subclass rules are reproducible; spell counts match class tables plus the requested bard bonus',()=>{
  for(const record of Object.values(require('../lib/srd/subclass-sources.json').records))assert.equal(record.sha256,crypto.createHash('sha256').update(JSON.stringify(record.source)).digest('hex'))
  const {getCharacterTemplate}=require('../mcp-server/dist/lib/character-registry.js')
  const bardSpells=getCharacterTemplate('bard',7).spellcasting.knownSpells
  assert.ok(bardSpells.includes('charm-person'))
  assert.equal(bardSpells.filter(id=>id!=='charm-person').length,12)
  const wizard=getCharacterTemplate('wizard',7);assert.equal(wizard.spellbook.length,20);assert.equal(wizard.spellcasting.knownSpells.length,11)
  const cleric=getCharacterTemplate('cleric',7);assert.equal(cleric.domainSpells.length,8)
  assert.equal(cleric.spellcasting.knownSpells.filter(id=>!cleric.domainSpells.includes(id)).length,11)
})
async function engine(t,characterId,dice=''){
  const client=new Client({name:'subclasses-rules',version:'1'})
  await client.connect(new StdioClientTransport({command:'node',args:['mcp-server/dist/mcp-server/index.js'],env:{...process.env,
    ADVENTURE_ID:'sarah-of-yellowcrest-manor',CHARACTER_ID:characterId,AI_DM_TEST_DICE_SEQUENCE:dice}}))
  t.after(()=>client.close())
  return async(name,input={})=>{const reply=await client.callTool({name,arguments:input});const text=reply.content.find(c=>c.type==='text')?.text;try{return JSON.parse(text)}catch{throw Error(`${name}: ${text}`)}}
}
const ok=x=>{assert.ok(!x.error,JSON.stringify(x));return x}
async function spawn(call,type='goblin',cell={x:5,y:8},hp=200){return ok(await call('spawn_monster',{monsterType:type,cell,hpOverride:hp}))}
async function battle(call,ids,current='player'){
  const s=await call('get_game_state');Object.assign(s,{phase:'combat',round:1,currentTurn:current,initiativeOrder:['player',...ids],actionUsed:{},bonusActionUsed:{},movementUsed:{}})
  s.hero.actionCredits=1;return ok(await call('replace_game_state',{gameState:s}))
}

test('Champion: SRD hit points, improved critical, Dueling, half proficiency and a split Attack action',async t=>{
  const call=await engine(t,'fighter','19,4,5,15,4,10'),enemy=await spawn(call)
  await battle(call,[enemy.id])
  const first=ok(await call('resolve_player_attack',{targetId:enemy.id,weaponOrSpell:'longsword'}))
  assert.equal(first.criticalHit,true);assert.equal(first.damageDealt,15)
  ok(await call('move_token',{tokenId:'player',toCell:{x:4,y:9}}))
  const second=ok(await call('resolve_player_attack',{targetId:enemy.id,weaponOrSpell:'longsword'}))
  assert.equal(second.damageDealt,10)
  assert.equal((await call('resolve_player_attack',{targetId:enemy.id,weaponOrSpell:'longsword'})).code,'ACTION_ALREADY_USED')
  ok(await call('end_combat',{force:true,reason:'Test ends.'}))
  const check=ok(await call('roll_ability_check',{ability:'dex',skill:'stealth'}))
  assert.equal(check.roll.modifier,3)
  assert.equal((await call('get_game_state')).player.hp.max,67)
})

test('SRD rests: no map recharge; short rest spends actual Hit Dice and restores class resources; long rest is limited',async t=>{
  const call=await engine(t,'fighter','4,5')
  ok(await call('update_hp',{entityId:'player',delta:-25,reason:'Wound',damageType:'slashing',damageOrigin:'weapon'}))
  ok(await call('use_class_feature',{featureId:'second_wind'}))
  const before=await call('get_game_state')
  ok(await call('take_rest',{kind:'short',hitDice:1}))
  const after=await call('get_game_state')
  assert.equal(after.hero.hitDice.current,6)
  assert.equal(after.player.resources.second_wind.current,1)
  assert.equal(after.player.hp.current,Math.min(67,before.player.hp.current+8))
  assert.equal(after.worldTimeSeconds,3600)
  ok(await call('take_rest',{kind:'long'}))
  assert.equal((await call('take_rest',{kind:'long'})).code,'LONG_REST_TOO_SOON')
})

test('Lore: Inspiration d8 cannot target the bard, consumes a bonus action and returns on a short rest',async t=>{
  const call=await engine(t,'bard'),ally=await spawn(call,'knight',{x:7,y:8})
  assert.equal((await call('use_subclass_feature',{featureId:'bardic_inspiration',targetId:'player'})).code,'INSPIRATION_TARGET_INVALID')
  ok(await call('use_subclass_feature',{featureId:'bardic_inspiration',targetId:ally.id}))
  let s=await call('get_game_state')
  assert.equal(s.hero.inspiration[0].die,8);assert.equal(s.player.resources.bardic_inspiration.current,3)
  assert.equal((await call('use_subclass_feature',{featureId:'bardic_inspiration',targetId:ally.id})).code,'ALREADY_INSPIRED')
  ok(await call('take_rest',{kind:'short'}));s=await call('get_game_state')
  assert.equal(s.player.resources.bardic_inspiration.current,4);assert.deepEqual(s.hero.inspiration,[])
  assert.equal(s.player.skillProficiencies.length,8)
  assert.ok(s.player.knownSpells.includes('counterspell'));assert.ok(s.player.knownSpells.includes('fireball'))
})

test('Cutting Words interrupts before damage, preserves the original attack roll, and consumes only one reaction',async t=>{
  const call=await engine(t,'bard','15,8'),enemy=await spawn(call)
  await battle(call,[enemy.id],enemy.id)
  const before=(await call('get_game_state')).player.hp.current
  const interrupted=ok(await call('resolve_attack',{attackerId:enemy.id,targetId:'player',weaponOrSpell:'Scimitar'}))
  assert.ok(interrupted.pendingReaction)
  assert.equal((await call('get_game_state')).player.hp.current,before)
  assert.equal((await call('next_turn',{actorId:enemy.id,skipAction:true})).code,'REACTION_PENDING')
  const result=ok(await call('resolve_reaction',{pendingId:interrupted.pendingReaction.id,choice:'cutting_words_attack'}))
  assert.equal(result.hit,false)
  const s=await call('get_game_state');assert.equal(s.player.hp.current,before);assert.equal(s.hero.reactionsUsed.player,true)
  assert.equal(s.player.resources.bardic_inspiration.current,3)
  assert.equal((await call('resolve_reaction',{pendingId:interrupted.pendingReaction.id,choice:'decline'})).code,'REACTION_TRIGGER_INVALID')
})

test('Countercharm gives actual advantage against fear and charm, not on unrelated saving throws',async t=>{
  const call=await engine(t,'bard','2,18,7')
  ok(await call('use_subclass_feature',{featureId:'countercharm'}))
  const fear=ok(await call('resolve_saving_throw',{entityId:'player',ability:'wis',dc:13,againstCondition:'frightened'}))
  assert.match(fear.roll.detail,/ADV/)
  const con=ok(await call('resolve_saving_throw',{entityId:'player',ability:'con',dc:13}))
  assert.doesNotMatch(con.roll.detail,/ADV/)
})

test('Evocation: Sculpt Spells protects only chosen other creatures inside the actual Fireball area',async t=>{
  const call=await engine(t,'wizard','1,1,1,1,1,1,1,1,1,1')
  const enemy=await spawn(call,'goblin',{x:7,y:9}),ally=await spawn(call,'knight',{x:8,y:9})
  const before=(await call('get_game_state')).monsters[ally.id].hp.current
  const answer=ok(await call('cast_spell',{spellId:'fireball',toCell:{x:7,y:9},sculptTargetIds:[ally.id],focusItemId:'component_pouch'}))
  const protectedTarget=answer.results.find(r=>r.targetId===ally.id),hit=answer.results.find(r=>r.targetId===enemy.id)
  assert.equal(protectedTarget.damageDealt,0);assert.equal(protectedTarget.sculpted,true)
  assert.equal(hit.damageDealt,8)
  assert.equal((await call('get_game_state')).monsters[ally.id].hp.current,before)
})

test('Evocation: Potent Cantrip deals half damage after a successful save; Arcane Recovery has a real daily budget',async t=>{
  const call=await engine(t,'wizard','4,6,20'),enemy=await spawn(call,'goblin',{x:7,y:8})
  const answer=ok(await call('cast_spell',{spellId:'acid-splash',targetId:enemy.id}))
  assert.equal(answer.results[0].saved,true);assert.equal(answer.results[0].damageDealt,5)
  let s=await call('get_game_state');s.player.spellSlots.level3.current=0
  ok(await call('replace_game_state',{gameState:s}))
  assert.equal((await call('take_rest',{kind:'short',arcaneRecovery:[3,2]})).code,'ARCANE_RECOVERY_BUDGET')
  ok(await call('take_rest',{kind:'short',arcaneRecovery:[3]}))
  assert.equal((await call('take_rest',{kind:'short',arcaneRecovery:[3]})).code,'ARCANE_RECOVERY_UNAVAILABLE')
})

test('Life: Disciple of Life uses the actual slot level; Blessed Healer heals the cleric only when another creature is healed',async t=>{
  const call=await engine(t,'cleric','3,3,3'),ally=await spawn(call,'knight',{x:5,y:8})
  ok(await call('equip_item',{itemId:'mace',slot:'main_hand',operation:'unequip'}))
  let s=await call('get_game_state');s.player.hp.current=20;s.monsters[ally.id].hp.current=10
  ok(await call('replace_game_state',{gameState:s}))
  const answer=ok(await call('cast_spell',{spellId:'cure-wounds',slotLevel:3,targetId:ally.id}))
  assert.equal(answer.results[0].healing,18) // 3d8=9, WIS=4, Disciple=5.
  assert.equal(answer.results[1].healing,5)
  s=await call('get_game_state');assert.equal(s.player.hp.current,25)
})

test('Life: Preserve Life distributes at most 35 HP, never exceeds half HP and spends Channel Divinity',async t=>{
  const call=await engine(t,'cleric')
  let s=await call('get_game_state');s.player.hp.current=5;ok(await call('replace_game_state',{gameState:s}))
  assert.equal((await call('use_subclass_feature',{featureId:'preserve_life',allocations:[{targetId:'player',hp:22}]})).code,'PRESERVE_LIFE_TARGET')
  ok(await call('use_subclass_feature',{featureId:'preserve_life',allocations:[{targetId:'player',hp:21}]}))
  s=await call('get_game_state');assert.equal(s.player.hp.current,26);assert.equal(s.player.resources.channel_divinity.current,1)
})

test('Life: Destroy Undead destroys CR 1/2 on a failed save and turns stronger undead without an invented frightened condition',async t=>{
  const call=await engine(t,'cleric','1,1'),weak=await spawn(call,'skeleton',{x:5,y:8}),strong=await spawn(call,'wight',{x:7,y:8})
  const answer=ok(await call('use_subclass_feature',{featureId:'turn_undead'}))
  assert.equal(answer.targets.find(r=>r.targetId===weak.id).destroyed,true)
  assert.equal(answer.targets.find(r=>r.targetId===strong.id).turned,true)
  const s=await call('get_game_state');assert.ok(!s.monsters[strong.id].conditions.includes('frightened'))
})

test('Concentration and bonus-action spells: one concentration, damage saves, correct Healing Word cost',async t=>{
  const call=await engine(t,'cleric','1,2,1,1')
  ok(await call('equip_item',{itemId:'mace',slot:'main_hand',operation:'unequip'}))
  ok(await call('equip_item',{itemId:'holy_symbol',slot:'main_hand',operation:'equip'}))
  ok(await call('cast_spell',{spellId:'bless',targetIds:['player'],focusItemId:'holy_symbol'}))
  const before=await call('get_game_state');assert.ok(before.hero.concentrationId)
  ok(await call('update_hp',{entityId:'player',delta:-10,damageType:'slashing',damageOrigin:'weapon',reason:'A wound.'}))
  const after=await call('get_game_state');assert.equal(after.hero.concentrationId,undefined)
  const enemy=await spawn(call)
  await battle(call,[enemy.id])
  ok(await call('cast_spell',{spellId:'healing-word',targetId:'player'}))
  assert.equal((await call('cast_spell',{spellId:'guiding-bolt',targetId:enemy.id})).code,'BONUS_SPELL_RESTRICTION')
  const s=await call('get_game_state');assert.equal(s.bonusActionUsed.player,true);assert.equal(Boolean(s.actionUsed.player),false)
})

test('Shield is an actual reaction before the hit, and Counterspell consumes both casters slots without resolving Fireball',async t=>{
  const call=await engine(t,'wizard','12')
  const enemy=await spawn(call,'goblin',{x:5,y:8});await battle(call,[enemy.id],enemy.id)
  const pending=ok(await call('resolve_attack',{attackerId:enemy.id,targetId:'player',weaponOrSpell:'Scimitar'}))
  const shield=ok(await call('resolve_reaction',{pendingId:pending.pendingReaction.id,choice:'shield'}))
  assert.equal(shield.hit,false)
  let s=await call('get_game_state');assert.equal(s.player.spellSlots.level1.current,3)
  const {characterSheetFromPlayerState}=require('../lib/character-sheet-view.ts')
  assert.equal(characterSheetFromPlayerState(s.player,s.hero,s.worldTimeSeconds).ac,17)
  ok(await call('end_combat',{force:true,reason:'Test setup.'}))
  ok(await call('take_rest',{kind:'long'}))
  ok(await call('prepare_spells',{spellIds:['counterspell','shield']}))
  const mage=await spawn(call,'mage',{x:7,y:8});await battle(call,[mage.id],mage.id)
  const block=ok(await call('get_monster_stat_block',{monsterId:mage.id}));assert.ok(block.engineSupport.spellcasting.supportedSpells.includes('fireball'))
  const spell=ok(await call('cast_creature_spell',{casterId:mage.id,spellId:'fireball',toCell:{x:4,y:8}}))
  assert.ok(spell.pendingReaction)
  const resolved=ok(await call('resolve_reaction',{pendingId:spell.pendingReaction.id,choice:'counterspell'}))
  assert.equal(resolved.countered,true)
  s=await call('get_game_state');assert.equal(s.player.hp.current,37)
  assert.equal(s.player.spellSlots.level3.current,2);assert.equal(s.monsters[mage.id].monsterRuntime.spellSlots.level3.current,2)
})

test('Champion keeps the unfinished Attack action when Action Surge is used between attacks',async t=>{
  const call=await engine(t,'fighter','15,1,15,1,15,1,15,1'),enemy=await spawn(call)
  await battle(call,[enemy.id])
  ok(await call('resolve_player_attack',{targetId:enemy.id,weaponOrSpell:'longsword'}))
  ok(await call('use_class_feature',{featureId:'action_surge'}))
  for(let i=0;i<3;i++)ok(await call('resolve_player_attack',{targetId:enemy.id,weaponOrSpell:'longsword'}))
  assert.equal((await call('resolve_player_attack',{targetId:enemy.id,weaponOrSpell:'longsword'})).code,'ACTION_ALREADY_USED')
  const s=await call('get_game_state');assert.equal(s.monsters[enemy.id].hp.current,172);assert.equal(s.hero.actionCredits,0)
})

test('Lore Inspiration can actually be spent after a check, save, or attack d20, including after hydration',async t=>{
  for(const kind of ['check','save','attack']){
    const call=await engine(t,'bard',kind==='attack'?'8,8,4':'10,8'),ally=await spawn(call,'knight',{x:5,y:8}),enemy=await spawn(call,'goblin',{x:6,y:8})
    ok(await call('use_subclass_feature',{featureId:'bardic_inspiration',targetId:ally.id}))
    if(kind==='attack')await battle(call,[ally.id,enemy.id],ally.id)
    const pending=ok(await call(kind==='check'?'roll_ability_check':kind==='save'?'resolve_saving_throw':'resolve_attack',
      kind==='check'?{entityId:ally.id,ability:'str',dc:18}:kind==='save'?{entityId:ally.id,ability:'con',dc:18}:{attackerId:ally.id,targetId:enemy.id,weaponOrSpell:'Greatsword'}))
    assert.ok(pending.pendingReaction.options.includes('bardic_inspiration'))
    const held=await call('get_game_state');ok(await call('replace_game_state',{gameState:JSON.parse(JSON.stringify(held))}))
    let answer=ok(await call('resolve_reaction',{pendingId:pending.pendingReaction.id,choice:'bardic_inspiration'}))
    if(answer.pendingReaction)answer=ok(await call('resolve_reaction',{pendingId:answer.pendingReaction.id,choice:'decline'}))
    assert.equal(kind==='attack'?answer.hit:answer.success,true)
    const s=await call('get_game_state');assert.equal(s.hero.inspiration.length,0);assert.equal(Boolean(s.hero.reactionsUsed.player),false)
  }
})

test('Cutting Words can reduce a shared spell damage roll before any area consequences',async t=>{
  const call=await engine(t,'bard','4,4,4,4,4,4,4,4,8,20,20'),mage=await spawn(call,'mage',{x:8,y:8})
  await battle(call,[mage.id],mage.id)
  const spell=ok(await call('cast_creature_spell',{casterId:mage.id,spellId:'fireball',toCell:{x:5,y:8}}))
  const damage=ok(await call('resolve_reaction',{pendingId:spell.pendingReaction.id,choice:'decline'}))
  assert.equal(damage.pendingReaction.kind,'damage')
  assert.equal((await call('get_game_state')).player.hp.current,45)
  const outcome=ok(await call('resolve_reaction',{pendingId:damage.pendingReaction.id,choice:'cutting_words_damage'}))
  assert.equal(outcome.results.find(r=>r.targetId==='player').damageRoll.total,24)
  assert.equal(outcome.results.find(r=>r.targetId==='player').damageDealt,12)
  const s=await call('get_game_state');assert.equal(s.player.hp.current,33);assert.equal(s.monsters[mage.id].monsterRuntime.spellSlots.level3.current,2)
})

test('Opportunity attacks stop before leaving reach; invalid reaction choices preserve the pending movement',async t=>{
  const call=await engine(t,'fighter','1'),enemy=await spawn(call)
  await battle(call,[enemy.id])
  const move=ok(await call('move_token',{tokenId:'player',toCell:{x:3,y:8}}))
  assert.equal(move.stopReason,'reaction_decision')
  let s=await call('get_game_state');assert.deepEqual(s.player.position,{x:4,y:8});const pendingId=s.hero.pending.id
  assert.equal((await call('resolve_reaction',{pendingId,choice:'opportunity_attack',weaponOrSpell:'Shortbow'})).code,'OPPORTUNITY_REQUIRES_MELEE')
  assert.equal((await call('get_game_state')).hero.pending.id,pendingId)
  const resumed=ok(await call('resolve_reaction',{pendingId,choice:'opportunity_attack',weaponOrSpell:'Scimitar'}))
  assert.equal(resumed.attack.hit,false)
  s=await call('get_game_state');assert.deepEqual(s.player.position,{x:3,y:8});assert.equal(s.movementUsed.player,1);assert.equal(s.hero.reactionsUsed[enemy.id],true)
})

test('Life domain spells: Beacon maximizes healing, Death Ward prevents one fatal hit, Revivify consumes real diamonds',async t=>{
  const call=await engine(t,'cleric','1'),ally=await spawn(call,'knight',{x:5,y:8})
  ok(await call('equip_item',{itemId:'mace',slot:'main_hand',operation:'unequip'}))
  let s=await call('get_game_state');s.monsters[ally.id].hp.current=10;ok(await call('replace_game_state',{gameState:s}))
  ok(await call('cast_spell',{spellId:'beacon-of-hope',targetIds:[ally.id]}))
  const heal=ok(await call('cast_spell',{spellId:'cure-wounds',targetId:ally.id}))
  assert.equal(heal.results[0].healing,15) // 8 + WIS4 + Disciple3.
  ok(await call('cast_spell',{spellId:'death-ward',targetId:ally.id}))
  ok(await call('update_hp',{entityId:ally.id,delta:-1000,damageType:'force',damageOrigin:'spell',reason:'Fatal blow'}))
  s=await call('get_game_state');assert.equal(s.monsters[ally.id].hp.current,1);assert.ok(!s.hero.effects.some(e=>e.kind==='death-ward'))
  ok(await call('update_hp',{entityId:ally.id,delta:-1000,damageType:'force',damageOrigin:'spell',reason:'Another blow'}))
  const noMaterial=await call('cast_spell',{spellId:'revivify',targetId:ally.id});assert.equal(noMaterial.code,'SPELL_MATERIAL_REQUIRED')
  const revive=ok(await call('cast_spell',{spellId:'revivify',targetId:ally.id,materialItemId:'revivify_diamonds'}))
  assert.equal(revive.revived,true);s=await call('get_game_state');assert.equal(s.monsters[ally.id].hp.current,1);assert.equal(s.monsters[ally.id].isAlive,true)
  assert.ok(!s.player.inventory.some(i=>i.id==='revivify_diamonds'))
})

test('Life domain: Guardian occupies ten feet, triggers at its nearest edge once per turn and disappears after 60 damage',async t=>{
  const call=await engine(t,'cleric','1,1,1'),enemy=await spawn(call,'goblin',{x:11,y:8})
  ok(await call('cast_spell',{spellId:'guardian-of-faith',toCell:{x:7,y:7}}))
  const blocked=await call('move_token',{tokenId:'player',toCell:{x:8,y:8}});assert.ok(blocked.error)
  ok(await call('move_token',{tokenId:enemy.id,toCell:{x:10,y:8}}))
  assert.equal((await call('get_game_state')).monsters[enemy.id].hp.current,180)
  ok(await call('move_token',{tokenId:enemy.id,toCell:{x:10,y:9}}))
  assert.equal((await call('get_game_state')).monsters[enemy.id].hp.current,180)
  for(const cell of [{x:10,y:8},{x:10,y:9}]){ok(await call('advance_time',{seconds:6}));ok(await call('move_token',{tokenId:enemy.id,toCell:cell}))}
  const s=await call('get_game_state');assert.equal(s.monsters[enemy.id].hp.current,140);assert.ok(!s.hero.effects.some(e=>e.kind==='guardian-of-faith'))
})

test('Preparation, real grimoire copying and Evocation Savant enforce limits, cost, source and ritual class',async t=>{
  const call=await engine(t,'wizard')
  assert.equal((await call('prepare_spells',{spellIds:['cure-wounds']})).code,'SPELL_CANNOT_PREPARE')
  let s=await call('get_game_state');s.player.spellbook=s.player.spellbook.filter(id=>id!=='shatter');s.player.inventory.find(item=>item.id==='spellbook').spellIds=[...s.player.spellbook];s.player.inventory.push({id:'source_book',name:'Recueil trouvé',type:'misc',spellIds:['shatter']})
  ok(await call('replace_game_state',{gameState:s}))
  ok(await call('copy_spell_to_book',copyWork({spellId:'shatter',sourceItemId:'source_book',paid:{gp:50}})))
  s=await call('get_game_state');assert.equal(s.hero.gold,undefined);assert.equal(s.dmTools.wallet.gp,200);assert.equal(s.worldTimeSeconds,7200);assert.ok(s.player.inventory.find(i=>i.id==='spellbook').spellIds.includes('shatter'))
  const bard=await engine(t,'bard')
  ok(await bard('equip_item',{itemId:'rapier',slot:'main_hand',operation:'unequip'}))
  ok(await bard('equip_item',{itemId:'lute',slot:'main_hand',operation:'equip'}))
  const before=await bard('get_game_state')
  await require('./helpers/casting.cjs').completeCasting(bard,ok(await bard('cast_spell',{spellId:'comprehend-languages',ritual:true,focusItemId:'lute'})))
  const after=await bard('get_game_state')
  assert.deepEqual(after.player.spellSlots,before.player.spellSlots)
  assert.equal(after.worldTimeSeconds,606)
  assert.equal((await bard('cast_spell',{spellId:'healing-word',ritual:true,targetId:'player'})).code,'SPELL_NOT_RITUAL')
})

test('Protection from poison gives actual resistance and save advantage; Aid expires without leaving extra maximum HP',async t=>{
  const call=await engine(t,'cleric','1,20')
  ok(await call('equip_item',{itemId:'mace',slot:'main_hand',operation:'unequip'}))
  ok(await call('apply_condition',{entityId:'player',condition:'poisoned'}))
  ok(await call('cast_spell',{spellId:'protection-from-poison',targetId:'player'}))
  ok(await call('update_hp',{entityId:'player',delta:-10,damageType:'poison',damageOrigin:'spell',reason:'Poison damage'}))
  assert.equal((await call('get_game_state')).player.hp.current,47)
  const save=ok(await call('resolve_saving_throw',{entityId:'player',ability:'con',dc:18,againstCondition:'poisoned'}));assert.equal(save.success,true);assert.match(save.roll.detail,/ADV/)
  ok(await call('equip_item',{itemId:'holy_symbol',slot:'main_hand',operation:'equip'}))
  ok(await call('cast_spell',{spellId:'aid',targetIds:['player'],slotLevel:3,focusItemId:'holy_symbol'}))
  assert.equal((await call('get_game_state')).player.hp.max,62)
  ok(await call('advance_time',{seconds:28800}));assert.equal((await call('get_game_state')).player.hp.max,52)
})

test('Wizard Blindness has an actual condition and repeats the CON save at the end of the target turn',async t=>{
  const call=await engine(t,'wizard','1,20'),enemy=await spawn(call)
  ok(await call('prepare_spells',{spellIds:['blindness-deafness']}))
  ok(await call('cast_spell',{spellId:'blindness-deafness',targetId:enemy.id,condition:'blinded'}))
  assert.ok((await call('get_game_state')).monsters[enemy.id].conditions.includes('blinded'))
  await battle(call,[enemy.id],enemy.id)
  ok(await call('next_turn',{actorId:enemy.id,skipAction:true}))
  assert.ok(!(await call('get_game_state')).monsters[enemy.id].conditions.includes('blinded'))
})

test('An inspired creature may modify its held area save before any damage, and the spell is not paid twice',async t=>{
  const call=await engine(t,'bard','1,1,1,1,1,1,1,1,20,6,8,20'),ally=await spawn(call,'knight',{x:5,y:8}),mage=await spawn(call,'mage',{x:8,y:8})
  ok(await call('use_subclass_feature',{featureId:'bardic_inspiration',targetId:ally.id}))
  await battle(call,[ally.id,mage.id],mage.id)
  let pending=ok(await call('cast_creature_spell',{casterId:mage.id,spellId:'fireball',toCell:{x:6,y:8}}))
  pending=ok(await call('resolve_reaction',{pendingId:pending.pendingReaction.id,choice:'decline'}))
  pending=ok(await call('resolve_reaction',{pendingId:pending.pendingReaction.id,choice:'decline'}))
  assert.equal(pending.pendingReaction.kind,'save');assert.equal(pending.pendingReaction.targetId,ally.id)
  const held=await call('get_game_state');assert.equal(held.player.hp.current,45)
  ok(await call('replace_game_state',{gameState:JSON.parse(JSON.stringify(held))}))
  const answer=ok(await call('resolve_reaction',{pendingId:pending.pendingReaction.id,choice:'bardic_inspiration'}))
  const saved=answer.results.find(r=>r.targetId===ally.id);assert.equal(saved.saved,true);assert.equal(saved.damageDealt,4)
  const s=await call('get_game_state');assert.equal(s.player.hp.current,41);assert.equal(s.monsters[mage.id].monsterRuntime.spellSlots.level3.current,2)
})

test('A multiattack interrupted by Cutting Words survives hydration and resumes only its remaining explicit attacks',async t=>{
  const call=await engine(t,'bard','15,8,15,4,15,4'),enemy=await spawn(call,'veteran')
  await battle(call,[enemy.id],enemy.id)
  const interrupted=ok(await call('resolve_monster_action',{monsterId:enemy.id,targetId:'player',actionName:'Multiattack',attackActions:['Longsword','Longsword','Shortsword']}))
  assert.ok(interrupted.pendingReaction)
  const held=await call('get_game_state');ok(await call('replace_game_state',{gameState:JSON.parse(JSON.stringify(held))}))
  const resumed=ok(await call('resolve_reaction',{pendingId:interrupted.pendingReaction.id,choice:'cutting_words_attack'}))
  assert.equal(resumed.attacks.length,3);assert.equal(resumed.attacks[0].hit,false)
  const s=await call('get_game_state');assert.equal(s.player.hp.current,31);assert.equal(s.actionUsed[enemy.id],true);assert.equal(s.hero.pending,undefined)
})

test('Shield may interrupt an opportunity attack and then resume the original movement without rerolling',async t=>{
  const call=await engine(t,'wizard','12'),enemy=await spawn(call)
  await battle(call,[enemy.id])
  ok(await call('move_token',{tokenId:'player',toCell:{x:3,y:8}}))
  const movePending=(await call('get_game_state')).hero.pending
  const attackPending=ok(await call('resolve_reaction',{pendingId:movePending.id,choice:'opportunity_attack',weaponOrSpell:'Scimitar'}))
  assert.ok(attackPending.pendingReaction.options.includes('shield'))
  assert.equal((await call('get_game_state')).player.hp.current,37)
  const resumed=ok(await call('resolve_reaction',{pendingId:attackPending.pendingReaction.id,choice:'shield'}))
  assert.equal(resumed.attack.attackRoll.rolls[0],12);assert.equal(resumed.attack.hit,false)
  const s=await call('get_game_state');assert.deepEqual(s.player.position,{x:3,y:8});assert.equal(s.hero.reactionsUsed[enemy.id],true);assert.equal(s.hero.reactionsUsed.player,true);assert.equal(s.player.spellSlots.level1.current,3)
})
