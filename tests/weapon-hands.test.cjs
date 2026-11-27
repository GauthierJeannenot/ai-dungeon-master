const test=require('node:test'),assert=require('node:assert/strict')
const {engine,ok,replace,spawn,battle,object}=require('./helpers/mcp-toolkit.cjs')

async function loadout(call,{weapon='longsword',id=weapon,shield=false,offHand}={}){
 const before=await call('get_game_state')
 const slots=before.dmTools?.loadout
 const main=slots?.mainHandId??before.player.inventory.find(item=>item.type==='weapon')?.id
 if(main)ok(await call('equip_item',{itemId:main,slot:'main_hand',operation:'unequip'}))
 const shieldId=slots?slots.shieldId:before.player.inventory.find(item=>(item.equipmentId??item.id)==='shield')?.id
 if(shieldId)ok(await call('equip_item',{itemId:shieldId,slot:'shield',operation:'unequip'}))
 if(slots?.offHandId)ok(await call('equip_item',{itemId:slots.offHandId,slot:'off_hand',operation:'unequip'}))
 const add=async(equipmentId,itemId)=>{
  const state=await call('get_game_state')
  if(!state.player.inventory.some(item=>item.id===itemId))await replace(call,s=>s.player.inventory.push({id:itemId,equipmentId,name:'Arme de ce scénario',type:'weapon'}))
 }
 await add(weapon,id)
 ok(await call('equip_item',{itemId:id,slot:'main_hand',operation:'equip'}))
 if(shield){assert.ok(shieldId,'fixture uses its actual shield');ok(await call('equip_item',{itemId:shieldId,slot:'shield',operation:'equip'}))}
 if(offHand){await add(offHand,'second-held-weapon');ok(await call('equip_item',{itemId:'second-held-weapon',slot:'off_hand',operation:'equip'}))}
 return id
}
async function refused(call,name,input,code){
 const before=await call('get_game_state'),answer=await call(name,input)
 assert.equal(answer.code,code,JSON.stringify(answer));assert.deepEqual(await call('get_game_state'),before)
 return answer
}
async function roundtrip(call){const before=await call('get_game_state');ok(await call('replace_game_state',{gameState:before}));assert.deepEqual(await call('get_game_state'),before);return before}

test('a versatile longsword keeps one-handed Dueling with a shield, and an explicit two-handed attack changes its die without Dueling',async t=>{
 for(const hands of [1,2])await t.test(`${hands} hand(s)`,async t=>{
  const call=await engine(t,{dice:'17,3,19'}),id=await loadout(call,{shield:hands===1})
  const target=await spawn(call);await battle(call,[target.id])
  const before=await roundtrip(call),answer=ok(await call('resolve_player_attack',{targetId:target.id,weaponOrSpell:id,...hands===2?{weaponHands:2}:{}}))
  assert.equal(answer.weaponHands,hands);assert.equal(answer.attackRoll.modifier,7)
  assert.equal(answer.damageRoll.notation,hands===2?'1d10+4':'1d8+6')
  assert.equal(answer.damageRoll.total,hands===2?7:9)
  const after=await roundtrip(call)
  assert.deepEqual(after.dmTools.loadout,before.dmTools.loadout,'per-attack use never changes equipment or a lasting grip')
  assert.equal(after.hero.attackAction.remaining,1)
  assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
 })
})

test('a wizard uses the actual versatile quarterstaff two-handed die without gaining a style or proficiency',async t=>{
 const call=await engine(t,{characterId:'wizard',dice:'17,4,19'}),id=await loadout(call,{weapon:'quarterstaff'})
 const target=await spawn(call);await battle(call,[target.id]);const before=await call('get_game_state')
 const modifier=Math.floor((before.player.stats.str-10)/2),answer=ok(await call('resolve_player_attack',{targetId:target.id,weaponOrSpell:id,weaponHands:2}))
 assert.equal(answer.weaponHands,2);assert.equal(answer.damageRoll.notation,`1d8${modifier>=0?'+':''}${modifier}`)
 assert.equal(answer.damageRoll.modifier,modifier)
 assert.deepEqual((await call('get_game_state')).player.features,before.player.features)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('a mandatory two-handed weapon may be held beside a shield, but its attack refuses before dice or costs until the other hand is free',async t=>{
 const call=await engine(t,{dice:'17,2,3,19'}),id=await loadout(call,{weapon:'greatsword',shield:true})
 const target=await spawn(call);await battle(call,[target.id])
 await refused(call,'resolve_player_attack',{targetId:target.id,weaponOrSpell:id},'TWO_HANDS_REQUIRED')
 await refused(call,'resolve_player_attack',{targetId:target.id,weaponOrSpell:id,weaponHands:1},'TWO_HANDS_REQUIRED')
 // The shield is doffed as its real action, outside this attack-budget fixture.
 await replace(call,s=>{s.phase='exploration';s.currentTurn=null})
 ok(await call('equip_item',{itemId:'shield',slot:'shield',operation:'unequip'}))
 await battle(call,[target.id])
 ok(await call('set_carrying_context',{eventId:'actual-heavy-size',entityId:'player',size:'Medium',reason:'Taille réelle établie pour ce scénario.',source:'Fait physique du scénario : ce personnage est de taille Moyenne.'}))
 const answer=ok(await call('resolve_player_attack',{targetId:target.id,weaponOrSpell:id}))
 assert.equal(answer.weaponHands,2);assert.equal(answer.damageRoll.notation,'2d6+4');assert.equal(answer.damageRoll.total,9)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('a second held weapon prevents versatile two-handed use without silently stowing it',async t=>{
 const call=await engine(t,{dice:'17,4,19'}),id=await loadout(call,{offHand:'dagger'})
 const target=await spawn(call);await battle(call,[target.id])
 await refused(call,'resolve_player_attack',{targetId:target.id,weaponOrSpell:id,weaponHands:2},'TWO_HANDS_REQUIRED')
 const answer=ok(await call('resolve_player_attack',{targetId:target.id,weaponOrSpell:id,weaponHands:1}))
 assert.equal(answer.damageRoll.notation,'1d8+4','two held weapons deny Dueling even on a one-handed strike')
 assert.equal((await call('get_game_state')).dmTools.loadout.offHandId,'second-held-weapon')
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('unsupported grips and a forbidden second multiattack are refused before any first attack or dice',async t=>{
 const call=await engine(t,{dice:'19'}),id=await loadout(call,{shield:true}),target=await spawn(call)
 await battle(call,[target.id])
 await refused(call,'resolve_player_attack',{targetId:target.id,weaponOrSpell:'unarmed',weaponHands:1},'WEAPON_HANDS_NOT_APPLICABLE')
 await refused(call,'resolve_player_multiattack',{attacks:[
  {targetId:target.id,weaponOrSpell:id,weaponHands:1},
  {targetId:target.id,weaponOrSpell:id,weaponHands:2},
 ]},'TWO_HANDS_REQUIRED')
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('the actual free hand holding a grapple cannot be reused for a two-handed attack',async t=>{
 const call=await engine(t,{dice:'20,1,19'}),id=await loadout(call),target=await spawn(call)
 await battle(call,[target.id]);assert.equal(ok(await call('combat_action',{action:'grapple',targetId:target.id,defenseSkill:'acrobatics'})).success,true)
 await refused(call,'resolve_player_attack',{targetId:target.id,weaponOrSpell:id,weaponHands:2},'TWO_HANDS_REQUIRED')
 const after=await call('get_game_state')
 assert.ok(after.monsters[target.id].conditions.includes('grappled'));assert.equal(after.hero.attackAction.remaining,1)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('holding a two-handed weapon alone leaves a somatic hand free without moving the actual item',async t=>{
 const call=await engine(t,{characterId:'wizard',dice:'19'}),id=await loadout(call,{weapon:'greatsword'})
 const before=await roundtrip(call),inspection=ok(await call('inspect_spell_components',{spellId:'mage-hand'}))
 assert.equal(inspection.valid,true)
 const after=await call('get_game_state');assert.equal(after.dmTools.loadout.mainHandId,id)
 assert.deepEqual(after.dmTools.loadout,before.dmTools.loadout)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('a held two-handed attack retains its chosen die through hydration and rejects an after-roll grip change',async t=>{
 const call=await engine(t,{dice:'15,2,4,19'}),id=await loadout(call),target=await spawn(call)
 await replace(call,state=>state.hero.inspiration.push({targetId:'player',die:8,expiresAt:state.worldTimeSeconds+600}))
 await battle(call,[target.id])
 const held=ok(await call('resolve_player_attack',{targetId:target.id,weaponOrSpell:id,weaponHands:2})),pending=held.pendingReaction
 assert.ok(pending);assert.equal(pending.command.weaponHands,2);assert.equal(pending.roll.rolls[0],15)
 await roundtrip(call)
 await refused(call,'resolve_reaction',{pendingId:pending.id,choice:'bardic_inspiration',weaponHands:1},'WEAPON_HANDS_REACTION_CHOICE_INVALID')
 const answer=ok(await call('resolve_reaction',{pendingId:pending.id,choice:'bardic_inspiration'}))
 assert.equal(answer.weaponHands,2);assert.equal(answer.attackRoll.rolls[0],15);assert.equal(answer.damageRoll.notation,'1d10+4')
 assert.equal(answer.damageRoll.total,8)
 assert.equal((await call('get_game_state')).hero.pending,undefined)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('object attacks use the same per-impact versatile die and no two-handed Dueling bonus',async t=>{
 const call=await engine(t,{dice:'17,4,19'}),id=await loadout(call),prepared=await object(call)
 const target=await spawn(call);await battle(call,[target.id])
 const answer=ok(await call('interact_object',{objectId:prepared.object.id,action:'attack',weaponId:id,weaponHands:2}))
 assert.equal(answer.damageRoll.notation,'1d10+4');assert.equal(answer.damageRoll.total,8)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
