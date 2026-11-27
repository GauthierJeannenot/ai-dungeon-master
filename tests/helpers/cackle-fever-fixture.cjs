const assert = require('node:assert/strict')
const {engine,ok,adjacent}=require('./mcp-toolkit.cjs')
async function qualify(call,creatureId,actualGnome=false){
 const state=await call('get_game_state'),actor=creatureId==='player'?state.player:state.monsters[creatureId]??state.npcs[creatureId]
 const fact=ok(await call('record_scene_fact',{cell:actor.position,description:'Le MJ qualifie le vrai corps humanoïde présent et établit explicitement son appartenance ou non aux gnomes, sans bonus racial ni transformation.'})).worldFact
 return ok(await call('qualify_cackle_fever_host',{eventId:'real-cackle-host-'+creatureId,creatureId,factId:fact.id,actualHumanoidConfirmed:true,actualGnome}))
}
async function setupCackle(t,{characterId='fighter',dice='1,1,2,20,1,1,1,1,20,19',gnome=false,contagion=true,onset=true,call:existingCall}={}){
 const call=existingCall??await engine(t,{characterId,dice}),state=await call('get_game_state'),cell=adjacent(state).find(cell=>![...Object.values(state.monsters),...Object.values(state.npcs??{})].some(actor=>actor.position.x===cell.x&&actor.position.y===cell.y)),npcId='actual-fever-carrier'
 assert.ok(cell,'One genuinely free accessible adjacent cell must remain for the real carrier.')
 ok(await call('create_npc',{npcId,name:'Porteur réel',statBlock:'veteran',cell,disposition:'neutral',visible:true,description:'Cet individu humanoïde réel porte la nouvelle infection actuelle explicitement préparée par le MJ.'}))
 await qualify(call,npcId);await qualify(call,'player',gnome)
 const fact=ok(await call('record_scene_fact',{cell,description:'Ce vrai porteur vient de contracter la fièvre du fou rire à cet instant, décision initiale MJ de campagne sans date passée, attaque ou infection du joueur inventée.'})).worldFact
 const seed=ok(await call('record_cackle_fever_case',{eventId:'actual-first-fever-case',creatureId:npcId,factId:fact.id,actualNewNpcInfectionConfirmed:true}))
 if(!onset)return{call,npcId,cell,seed}
 ok(await call('advance_time',{seconds:seed.seed.incubation.total*3600}))
 ok(await call('resolve_cackle_fever_onset',{afflictionId:seed.affliction.id}))
 if(!contagion)return{call,npcId,cell,seed}
 const stressFact=ok(await call('record_scene_fact',{cell,description:'Le MJ atteste un événement extérieur de grand stress réellement survenu à cet individu, distinct des dégâts de la maladie.'})).worldFact
 const stress=ok(await call('record_cackle_fever_stress',{eventId:'actual-carrier-stress',creatureId:npcId,factId:stressFact.id,actualGreatStressConfirmed:true,reason:'Ce vrai événement extérieur cause un grand stress au porteur.'}))
 const crisis=ok(await call('resolve_cackle_fever_event',{eventId:stress.event.id}))
 assert.equal(crisis.success,false)
 ok(await call('enter_combat',{combatants:['player',npcId]}))
 const events=ok(await call('inspect_cackle_fever')).events
 const exposure=Object.values(events).find(event=>event.kind==='contagion'&&!event.result)
 assert.ok(exposure,'The real first player turn begins within ten feet of the living laughing carrier.')
 const infection=ok(await call('resolve_cackle_fever_event',{eventId:exposure.id}))
 for(const event of Object.values(ok(await call('inspect_cackle_fever')).events).filter(event=>event.kind==='stress'&&!event.result))ok(await call('resolve_cackle_fever_event',{eventId:event.id}))
 return{call,npcId,cell,seed,crisis,exposure,infection}
}
async function persistCackle(t,call,dice='19'){
 const {saveSession,loadSession,deleteSession}=require('../../lib/session-store.ts'),state=await call('get_game_state'),id='cackle-sql-'+process.pid+'-'+Math.random()
 t.after(()=>deleteSession(id));await saveSession(id,{gameState:state,history:[],adventureId:state.adventureId,characterId:state.characterId})
 const fresh=await engine(t,{dice,characterId:state.characterId,adventureId:state.adventureId})
 ok(await fresh('replace_game_state',{gameState:(await loadSession(id)).gameState}));assert.deepEqual(await fresh('get_game_state'),state)
 return fresh
}
async function cackleRefused(call,name,input,code){const before=await call('get_game_state'),answer=await call(name,input);assert.equal(answer.code,code,JSON.stringify(answer));assert.deepEqual(await call('get_game_state'),before)}
module.exports={setupCackle,qualify,persistCackle,cackleRefused}
