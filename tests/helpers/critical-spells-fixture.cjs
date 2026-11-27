const assert=require('node:assert/strict')
const{engine,ok,grid}=require('./mcp-toolkit.cjs')
async function spawnExact(call,type,fromId='player'){
 const s=await call('get_game_state'),actor=fromId==='player'?s.player:s.monsters[fromId],nav=grid(s,fromId)
 const cell=nav.neighbors(actor.position).find(c=>nav.step(actor.position,c)&&!(c.x===s.player.position.x&&c.y===s.player.position.y))
 assert.ok(cell,'Actual free neighboring source cell required')
 return ok(await call('spawn_monster',{monsterType:type,cell}))
}
async function nextCasterTurn(call,casterId){
 let s=await call('get_game_state')
 ok(await call('next_turn',{actorId:s.currentTurn,skipAction:true}))
 for(let i=0;i<6;i++){s=await call('get_game_state');if(s.currentTurn===casterId)return s;ok(await call('next_turn',{actorId:s.currentTurn,skipAction:true}))}
 assert.fail('A real next caster turn was not reached')
}
async function mageConcentration(t,{self=false}={}){
 const call=await engine(t,{characterId:'wizard',dice:'1,20,1,19'})
 ok(await call('prepare_spells',{spellIds:['counterspell','greater-invisibility','mage-armor','detect-magic']}))
 const mage=await spawnExact(call,'mage'),ally=await spawnExact(call,'goblin',mage.id)
 ok(await call('enter_combat',{combatants:['player',mage.id,ally.id]}))
 assert.equal((await call('get_game_state')).currentTurn,mage.id)
 const a=ok(await call('cast_creature_spell',{casterId:mage.id,spellId:'greater-invisibility',targetId:self?mage.id:ally.id}))
 assert.ok(a.pendingReaction)
 ok(await call('resolve_reaction',{pendingId:a.pendingReaction.id,choice:'decline'}))
 const s=await call('get_game_state'),oldId=s.hero.concentrationIds[mage.id]
 assert.ok(oldId);assert.ok(s.monsters[self?mage.id:ally.id].conditions.includes('invisible'))
 await nextCasterTurn(call,mage.id)
 return{call,mage,ally,oldId}
}
async function persistCritical(t,call,dice='19'){
 const{saveSession,loadSession,deleteSession}=require('../../lib/session-store.ts'),s=await call('get_game_state'),id='critical-spells-'+process.pid+'-'+Math.random()
 t.after(()=>deleteSession(id));await saveSession(id,{gameState:s,history:[],adventureId:s.adventureId,characterId:s.characterId})
 const fresh=await engine(t,{characterId:s.characterId,adventureId:s.adventureId,dice})
 ok(await fresh('replace_game_state',{gameState:(await loadSession(id)).gameState}));assert.deepEqual(await fresh('get_game_state'),s)
 return fresh
}
async function cleric(t,dice='19'){
 const call=await engine(t,{characterId:'cleric',dice})
 ok(await call('equip_item',{itemId:'mace',operation:'unequip',slot:'main_hand'}))
 ok(await call('equip_item',{itemId:'holy_symbol',operation:'equip',slot:'main_hand'}))
 return call
}
const aid=(call,level)=>call('cast_spell',{spellId:'aid',targetIds:['player'],focusItemId:'holy_symbol',slotLevel:level})
module.exports={spawnExact,nextCasterTurn,mageConcentration,persistCritical,cleric,aid}
