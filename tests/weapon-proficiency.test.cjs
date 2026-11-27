const test=require('node:test'),assert=require('node:assert/strict')
const {engine,ok,replace,spawn,battle,object}=require('./helpers/mcp-toolkit.cjs')
const {getWeapon,listWeapons}=require('../mcp-server/dist/lib/srd/weapons.js')
const {buildPlayerState}=require('../mcp-server/dist/lib/character-registry.js')
const {weaponProficiency,weaponProficiencyBonus}=require('../mcp-server/dist/lib/weapon-proficiency.js')
const mod=value=>Math.floor((value-10)/2)
const fixture=characterId=>buildPlayerState({characterId,level:7,position:{x:0,y:0}})

async function heldWeapon(call,weapon,id='recovered-weapon'){
 const initial=await call('get_game_state'),loadout=initial.dmTools?.loadout
 const main=loadout?loadout.mainHandId:initial.player.inventory.find(item=>item.type==='weapon')?.id
 if(main)ok(await call('equip_item',{itemId:main,slot:'main_hand',operation:'unequip'}))
 const shield=loadout?loadout.shieldId:initial.player.inventory.find(item=>(item.equipmentId??item.id)==='shield')?.id
 if(shield)ok(await call('equip_item',{itemId:shield,slot:'shield',operation:'unequip'}))
 await replace(call,state=>state.player.inventory.push({id,equipmentId:weapon,name:'Arme récupérée de ce scénario',type:'weapon'}))
 ok(await call('equip_item',{itemId:id,slot:'main_hand',operation:'equip'}))
 if(getWeapon(weapon)?.properties.includes('heavy'))ok(await call('set_carrying_context',{eventId:`actual-size-${id}`,entityId:'player',size:'Medium',reason:'Taille réelle établie indépendamment de la maîtrise.',source:'Fait physique du scénario : taille Moyenne de cet acteur.'}))
 return id
}

test('published categories distinguish simple and martial weapons; unarmed stays a separate always-proficient attack',()=>{
 for(const id of ['dagger','handaxe','shortbow','mace','quarterstaff','light-crossbow'])assert.equal(getWeapon(id).category,'simple')
 for(const id of ['longsword','shortsword','rapier','greataxe','greatsword','hand-crossbow','glaive','halberd','pike','whip'])assert.equal(getWeapon(id).category,'martial')
 assert.equal(getWeapon('unarmed').category,'unarmed')
 for(const weapon of listWeapons())assert.ok(['simple','martial','unarmed'].includes(weapon.category))
})

test('the actual four class lists, including bard exceptions and restricted wizard weapons, decide proficiency',()=>{
 const simple=['club','dagger','greatclub','handaxe','javelin','light-hammer','mace','quarterstaff','sickle','spear','light-crossbow','dart','shortbow','sling']
 const martial=['battleaxe','flail','glaive','greataxe','greatsword','halberd','lance','longsword','maul','morningstar','pike','rapier','scimitar','shortsword','trident','war-pick','warhammer','whip','blowgun','hand-crossbow','heavy-crossbow','longbow','net']
 const expected={fighter:[...simple,...martial,'unarmed'],bard:[...simple,'longsword','rapier','shortsword','hand-crossbow','unarmed'],
  cleric:[...simple,'unarmed'],wizard:['dagger','dart','sling','quarterstaff','light-crossbow','unarmed']}
 for(const [characterId,ids] of Object.entries(expected)){
  const player=fixture(characterId),before=structuredClone(player)
  for(const weapon of listWeapons()){
   const proficient=ids.includes(weapon.id),answer=weaponProficiency(player,weapon)
   assert.equal(answer.proficient,proficient,characterId+': '+weapon.id)
   assert.equal(answer.proficiencyBonus,proficient?player.proficiencyBonus:0)
  }
  assert.deepEqual(player,before,'derivation never grants items or edits a sheet')
 }
})

test('ownership, a localized name, forged class prose or an unknown profile never grants a weapon proficiency',()=>{
 const player=fixture('wizard');player.name='Guerrier';player.class='Fighter'
 player.inventory.push({id:'loot',equipmentId:'longsword',name:'Épée longue',type:'weapon'})
 assert.equal(weaponProficiencyBonus(player,getWeapon('longsword')),0)
 for(const id of ['unknown-profile','constructor','__proto__']){
  player.characterId=id
  assert.equal(weaponProficiencyBonus(player,getWeapon('quarterstaff')),0)
 }
 assert.equal(weaponProficiencyBonus(player,getWeapon('unarmed')),player.proficiencyBonus)
 delete player.characterId
 assert.equal(weaponProficiencyBonus(player,getWeapon('greatsword')),player.proficiencyBonus,'documented legacy fighter remains compatible')
})

test('an actual wizard attack with a recovered martial weapon omits proficiency, keeps its ability damage and survives hydration',async t=>{
 const call=await engine(t,{characterId:'wizard',dice:'17,2'}),id=await heldWeapon(call,'greataxe')
 const target=await spawn(call);await battle(call,[target.id])
 const before=await call('get_game_state'),answer=ok(await call('resolve_player_attack',{targetId:target.id,weaponOrSpell:id}))
 assert.equal(answer.attackRoll.modifier,mod(before.player.stats.str))
 assert.equal(answer.attackRoll.total,17+mod(before.player.stats.str))
 assert.equal(answer.damageRoll.modifier,mod(before.player.stats.str),'no proficiency is added to damage')
 const saved=await call('get_game_state');ok(await call('replace_game_state',{gameState:saved}))
 assert.equal(weaponProficiencyBonus((await call('get_game_state')).player,getWeapon('greataxe')),0)
 assert.equal(saved.hero.actionCredits,before.hero.actionCredits-1)
})

test('a fighter retains the actual proficiency bonus for the same recovered martial weapon',async t=>{
 const call=await engine(t,{characterId:'fighter',dice:'17,2'}),id=await heldWeapon(call,'greataxe')
 const target=await spawn(call);await battle(call,[target.id])
 const before=await call('get_game_state'),answer=ok(await call('resolve_player_attack',{targetId:target.id,weaponOrSpell:id}))
 assert.equal(answer.attackRoll.modifier,mod(before.player.stats.str)+before.player.proficiencyBonus)
})

test('a wizard attacking a prepared object does not receive proficiency for its recovered longsword',async t=>{
 const call=await engine(t,{characterId:'wizard',dice:'17,4'}),id=await heldWeapon(call,'longsword')
 await object(call,'proficiency-object')
 const before=await call('get_game_state'),answer=ok(await call('interact_object',{objectId:'proficiency-object',action:'attack',weaponId:id}))
 assert.equal(answer.attackRoll.modifier,mod(before.player.stats.str))
 assert.equal(answer.attackRoll.total,17+mod(before.player.stats.str))
})

test('the real bonus two-weapon attack also omits proficiency for a nonproficient light melee weapon',async t=>{
 const call=await engine(t,{characterId:'wizard',dice:'17,2,17,3'})
 const left=await heldWeapon(call,'handaxe','left-handaxe')
 await replace(call,state=>state.player.inventory.push({id:'right-handaxe',equipmentId:'handaxe',name:'Autre hache réelle',type:'weapon'}))
 ok(await call('equip_item',{itemId:'right-handaxe',slot:'off_hand',operation:'equip'}))
 const target=await spawn(call);await battle(call,[target.id])
 const before=await call('get_game_state'),first=ok(await call('resolve_player_attack',{targetId:target.id,weaponOrSpell:left}))
 const second=ok(await call('resolve_two_weapon_attack',{attackId:'nonproficient-offhand',primaryAttackId:first.primaryAttackId,targetId:target.id,weaponItemId:'right-handaxe',attackMode:'melee'}))
 assert.equal(first.attackRoll.modifier,mod(before.player.stats.str));assert.equal(second.attackRoll.modifier,mod(before.player.stats.str))
 assert.equal(second.damageRoll.modifier,Math.min(0,mod(before.player.stats.str)))
 assert.equal((await call('get_game_state')).bonusActionUsed.player,true)
})

test('held Bardic attack rolls preserve the already computed nonproficient modifier without rerolling after restore',async t=>{
 const call=await engine(t,{characterId:'wizard',dice:'17,2,19'}),id=await heldWeapon(call,'longsword')
 const target=await spawn(call);await battle(call,[target.id])
 await replace(call,state=>state.hero.inspiration.push({targetId:'player',expiresAt:state.worldTimeSeconds+600,die:8}))
 const before=await call('get_game_state'),held=ok(await call('resolve_player_attack',{targetId:target.id,weaponOrSpell:id}))
 assert.equal(held.pendingReaction.roll.modifier,mod(before.player.stats.str))
 const saved=await call('get_game_state');ok(await call('replace_game_state',{gameState:saved}))
 const answer=ok(await call('resolve_reaction',{pendingId:held.pendingReaction.id,choice:'decline'}))
 assert.equal(answer.attackRoll.modifier,mod(before.player.stats.str));assert.equal(answer.attackRoll.rolls[0],17)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('spell attacks retain spellcasting proficiency rather than inheriting weapon restrictions',async t=>{
 const call=await engine(t,{characterId:'wizard',dice:'17,17,2,2'})
 const target=await spawn(call);await battle(call,[target.id])
 const before=await call('get_game_state'),answer=ok(await call('cast_spell',{spellId:'ray-of-frost',targetId:target.id}))
 assert.equal(answer.results[0].roll.modifier,mod(before.player.stats.int)+before.player.proficiencyBonus)
})

 test('legacy non-SRD weapon attacks use the same fixed-class proficiency restriction',async t=>{
 const call=await engine(t,{characterId:'wizard',adventureId:'grammys-country-apple-pie',dice:'17,2'})
 await replace(call,state=>state.player.inventory.push({id:'longsword',equipmentId:'longsword',name:'Épée longue',type:'weapon'}))
 const target=await spawn(call)
 await replace(call,state=>{Object.assign(state,{phase:'combat',round:1,currentTurn:'player',initiativeOrder:['player',target.id],actionUsed:{},bonusActionUsed:{},movementUsed:{}})})
 const before=await call('get_game_state')
 const answer=ok(await call('resolve_attack',{attackerId:'player',targetId:target.id,weaponOrSpell:'longsword'}))
 assert.equal(answer.attackRoll.modifier,mod(before.player.stats.str))
})
