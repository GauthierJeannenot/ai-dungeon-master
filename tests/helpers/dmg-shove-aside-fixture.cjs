const assert=require('node:assert/strict')
const {engine,ok,grid,adjacent}=require('./mcp-toolkit.cjs')
async function prepareShoveAsideAtCurrentSite(call,{monsterType='bandit'}={}){
 const initial=await call('get_game_state'),origin=initial.player.position,nav=grid(initial)
 const pair=adjacent(initial).map(targetCell=>({targetCell,toCell:nav.neighbors(targetCell).find(cell=>Math.abs(cell.x-targetCell.x)+Math.abs(cell.y-targetCell.y)===1&&Math.max(Math.abs(cell.x-origin.x),Math.abs(cell.y-origin.y))===1&&nav.step(targetCell,cell)&&nav.step(origin,cell))})).find(p=>p.toCell)
 assert.ok(pair,'A real accessible cardinal side destination within actual player reach is required.')
 const target=ok(await call('spawn_monster',{monsterType,cell:pair.targetCell}))
 const input={action:'shove',targetId:target.id,shove:'aside',defenseSkill:'athletics',toCell:pair.toCell}
 return{call,target,...pair,input,enter:()=>call('enter_combat',{combatants:['player',target.id],tieOrder:['player',target.id]})}
}
async function setupShoveAside(t,{call:existingCall,dice='20,1,20,19,1,17',characterId='fighter',beforeCombat,...options}={}){
 const call=existingCall??await engine(t,{characterId,dice}),f=await prepareShoveAsideAtCurrentSite(call,options)
 if(beforeCombat)await beforeCombat(f)
 ok(await f.enter());return f
}
async function persistShoveAside(t,call,dice='19'){
 const {saveSession,loadSession,deleteSession}=require('../../lib/session-store.ts'),state=await call('get_game_state'),sessionId='aside-sql-'+process.pid+'-'+Math.random()
 t.after(()=>deleteSession(sessionId));await saveSession(sessionId,{gameState:state,history:[],adventureId:state.adventureId,characterId:state.characterId})
 const fresh=await engine(t,{dice,characterId:state.characterId,adventureId:state.adventureId});ok(await fresh('replace_game_state',{gameState:(await loadSession(sessionId)).gameState}));assert.deepEqual(await fresh('get_game_state'),state);return fresh
}
module.exports={prepareShoveAsideAtCurrentSite,setupShoveAside,persistShoveAside}
