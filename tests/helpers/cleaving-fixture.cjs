const assert=require('node:assert/strict')
const {engine,ok,adjacent}=require('./mcp-toolkit.cjs')
async function prepareCleavingAtCurrentSite(call,{types=['goblin','goblin','bandit'],weaponOrSpell='longsword'}={}){
 for(const item of(await call('get_game_state')).player.inventory)if(item.id!==weaponOrSpell)ok(await call('drop_item',{itemId:item.id}))
 ok(await call('set_carrying_context',{eventId:'cleaving-actual-size',entityId:'player',size:'Medium',reason:'Le MJ constate la taille réelle du corps préparé sur la carte.',source:'Qualification physique actuelle du PJ, sans bonus racial ni masse inventés.'}))
 const initial=await call('get_game_state'),cells=adjacent(initial);assert.ok(cells.length>=types.length,'The actual room must have enough distinct free five-foot melee cells.')
 const targets=[];for(const [i,monsterType]of types.entries())targets.push(ok(await call('spawn_monster',{monsterType,cell:cells[i]})))
 const input={targetId:targets[0].id,weaponOrSpell,cleaving:true}
 return{call,targets,cells,input,enter:()=>call('enter_combat',{combatants:['player',...targets.map(t=>t.id)],tieOrder:['player',...targets.map(t=>t.id)]})}
}
async function setupCleaving(t,{call:existingCall,dice='20,1,1,20,8,8,17',characterId='fighter',beforeCombat,...options}={}){
 const call=existingCall??await engine(t,{characterId,dice}),f=await prepareCleavingAtCurrentSite(call,options);if(beforeCombat)await beforeCombat(f);ok(await f.enter());return f
}
async function persistCleaving(t,call,dice='17'){
 const {saveSession,loadSession,deleteSession}=require('../../lib/session-store.ts'),state=await call('get_game_state'),sessionId='cleaving-sql-'+process.pid+'-'+Math.random()
 t.after(()=>deleteSession(sessionId));await saveSession(sessionId,{gameState:state,history:[],adventureId:state.adventureId,characterId:state.characterId})
 const fresh=await engine(t,{dice,characterId:state.characterId,adventureId:state.adventureId});ok(await fresh('replace_game_state',{gameState:(await loadSession(sessionId)).gameState}));assert.deepEqual(await fresh('get_game_state'),state);return fresh
}
module.exports={prepareCleavingAtCurrentSite,setupCleaving,persistCleaving}
