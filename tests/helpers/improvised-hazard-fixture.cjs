const assert=require('node:assert/strict')
const{engine,ok,adjacent}=require('./mcp-toolkit.cjs')
const source='Le MJ atteste cette unique exposition environnementale déjà établie, au corps réel et à sa case actuelle ; aucune attaque, action ou sort de créature n’est remplacé.'
async function occurrence(call,{eventId='actual-environment-event',targetId='player',...rest}={}){
 const state=await call('get_game_state'),body=targetId==='player'?state.player:state.monsters[targetId]??state.npcs?.[targetId];assert(body)
 const cell={...body.position},fact=ok(await call('record_scene_fact',{cell,description:source})).worldFact
 return{eventId,factId:fact.id,targetId,cell,sourceKind:'established_environment_event',actualLocalExposureConfirmed:true,notAnAttackOrSpellConfirmed:true,actorCost:'none',elapsedSeconds:0,consequence:'damage_only',magical:false,diceCount:1,damageType:'fire',reason:source,...rest}
}
async function persist(t,call,dice='19'){const{saveSession,loadSession,deleteSession}=require('../../lib/session-store.ts'),state=await call('get_game_state'),id='actual-hazard-'+process.pid+'-'+Math.random();t.after(()=>deleteSession(id));await saveSession(id,{gameState:state,history:[],adventureId:state.adventureId,characterId:state.characterId});const fresh=await engine(t,{characterId:state.characterId,adventureId:state.adventureId,dice});ok(await fresh('replace_game_state',{gameState:(await loadSession(id)).gameState}));assert.deepEqual(await fresh('get_game_state'),state);return fresh}
async function refused(call,name,input,code){const before=await call('get_game_state'),a=await call(name,input);assert.equal(a.code,code,JSON.stringify(a));assert.deepEqual(await call('get_game_state'),before);return a}
async function bandit(call){const state=await call('get_game_state');return ok(await call('spawn_monster',{monsterType:'bandit',cell:adjacent(state)[0],name:'Témoin réel d’exposition'}))}
module.exports={engine,ok,occurrence,persist,refused,bandit,source}
