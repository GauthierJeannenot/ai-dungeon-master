const assert=require('node:assert/strict')
const{engine,ok,adjacent,grid}=require('./mcp-toolkit.cjs')
async function setupWilderness(t,{call:existingCall,dice='20,10,1,1,19',characterId='fighter',adopt=true}={}){
 const call=existingCall??await engine(t,{adventureId:'sarah-of-yellowcrest-manor',characterId,dice}),initial=await call('get_game_state')
 const pursuer=ok(await call('spawn_monster',{monsterType:'bandit',cell:adjacent(initial)[0]}))
 const initiative=ok(await call('enter_combat',{combatants:['player',pursuer.id],tieOrder:['player',pursuer.id]}))
 const input={eventId:'begin-real-wilderness',chaseId:'actual-wilderness',quarryId:'player',pursuerIds:[pursuer.id],table:'wilderness',guardIds:[],reason:'Le MJ choisit explicitement la table wilderness officielle sur cette vraie carte.'}
 if(adopt)ok(await call('begin_chase',input))
 return{call,pursuer,input,initiative}
}
function wildernessRoute(state,id,length=3){
 const nav=grid(state,id),start=id==='player'?state.player.position:state.monsters[id].position
 const walk=path=>{if(path.length>=length)return path;for(const cell of nav.neighbors(path.at(-1))){if(Math.abs(cell.x-path.at(-1).x)+Math.abs(cell.y-path.at(-1).y)!==1||path.some(p=>p.x===cell.x&&p.y===cell.y)||!nav.step(path.at(-1),cell))continue;const found=walk([...path,cell]);if(found)return found}return null}
 const route=walk([start]);assert.ok(route,'A real supported simple cardinal route is required.');return route
}
async function qualifyWilderness(f,turnEventId,row,{choice,kind,path,eventId='physical-'+turnEventId}={}){
 const state=await f.call('get_game_state'),affected=state.dmTools.chases.episodes[f.input.chaseId].turns[turnEventId].nextParticipantId
 path??=wildernessRoute(state,affected,[1,5,8].includes(row)?2:3)
 kind??=({1:'brush',2:'uneven-ground',4:'rock-bed',5:'blowing-particles',8:'stampede'})[row]
 const fact=ok(await f.call('record_scene_fact',{cell:path[0],description:'Le MJ atteste cet événement environnemental imprimé réellement présent, mesuré sur cette route physique explicite, sans profil de créature ni déplacement inventé.'})).worldFact
 const input={eventId,chaseId:f.input.chaseId,turnEventId,factId:fact.id,path,...choice?{choice}:{},wilderness:{kind,actualPhysicalEventConfirmed:true}}
 return{input,fact,path,result:ok(await f.call('qualify_chase_complication',input))}
}
async function persistWilderness(t,call,dice='19'){
 const{saveSession,loadSession,deleteSession}=require('../../lib/session-store.ts'),state=await call('get_game_state'),id='wilderness-sql-'+process.pid+'-'+Math.random()
 t.after(()=>deleteSession(id));await saveSession(id,{gameState:state,history:[],adventureId:state.adventureId,characterId:state.characterId})
 const fresh=await engine(t,{dice,adventureId:state.adventureId,characterId:state.characterId});ok(await fresh('replace_game_state',{gameState:(await loadSession(id)).gameState}));assert.deepEqual(await fresh('get_game_state'),state);return fresh
}
module.exports={setupWilderness,wildernessRoute,qualifyWilderness,persistWilderness}
