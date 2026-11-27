const assert=require('node:assert/strict')
const {engine,ok,grid}=require('./mcp-toolkit.cjs')
const {inferRoomIdOnMap}=require('../../mcp-server/dist/lib/adventure-map.js')
async function prepareOverrunAtCurrentSite(call,{monsterType='bandit',size='Medium',cost='action',clearEquipment=true}={}){
 if(clearEquipment)for(const item of(await call('get_game_state')).player.inventory)ok(await call('drop_item',{itemId:item.id}))
 const s=await call('get_game_state'),nav=grid(s),from={...s.player.position}
 const path=[[1,0],[-1,0],[0,1],[0,-1]].map(([x,y])=>[from,{x:from.x+x,y:from.y+y},{x:from.x+x*2,y:from.y+y*2}]).find(p=>p.slice(1).every((c,i)=>nav.step(p[i],c)&&inferRoomIdOnMap(c,s.currentMapId,s)===s.currentRoomId))
 assert.ok(path,'Actual current room needs a straight supported free three-cell route.')
 ok(await call('set_carrying_context',{eventId:'overrun-actual-size',entityId:'player',size,reason:'Le MJ constate la vraie taille physique actuelle du personnage.',source:'Qualification physique actuelle du corps sur la carte, sans bonus racial inventé.'}))
 const target=ok(await call('spawn_monster',{monsterType,cell:path[1]}))
 const input={action:'overrun',targetId:target.id,overrunCost:cost,overrunPath:path}
 return{call,target,path,input,enter:()=>call('enter_combat',{combatants:['player',target.id],tieOrder:['player',target.id]})}
}
async function setupOverrun(t,{call:existingCall,dice='20,1,18,1,17',characterId='fighter',beforeCombat,...options}={}){
 const call=existingCall??await engine(t,{characterId,dice}),f=await prepareOverrunAtCurrentSite(call,options)
 if(beforeCombat)await beforeCombat(f)
 ok(await f.enter());return f
}
async function persistOverrun(t,call,dice='19'){
 const {saveSession,loadSession,deleteSession}=require('../../lib/session-store.ts'),s=await call('get_game_state'),sessionId='overrun-sql-'+process.pid+'-'+Math.random()
 t.after(()=>deleteSession(sessionId));await saveSession(sessionId,{gameState:s,history:[],adventureId:s.adventureId,characterId:s.characterId})
 const fresh=await engine(t,{dice,characterId:s.characterId,adventureId:s.adventureId});ok(await fresh('replace_game_state',{gameState:(await loadSession(sessionId)).gameState}));assert.deepEqual(await fresh('get_game_state'),s);return fresh
}
module.exports={prepareOverrunAtCurrentSite,setupOverrun,persistOverrun}
