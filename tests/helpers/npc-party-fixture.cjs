const assert=require('node:assert/strict')
const{ok,engine,grid}=require('./mcp-toolkit.cjs')
async function fact(call,npcId,text='Cet individu réel accepte explicitement ce rôle auprès du héros, au lieu et au moment présents.'){
 const n=(await call('get_game_state')).npcs[npcId];return ok(await call('record_scene_fact',{cell:n.position,description:text})).worldFact.id
}
async function createPartyNpc(call,{id='actual-party-npc',type='knight',role='ally'}={}){
 const s=await call('get_game_state'),g=grid(s),cell=g.neighbors(s.player.position).find(c=>g.step(s.player.position,c));assert.ok(cell)
 const n=ok(await call('create_npc',{npcId:id,name:'Individu volontaire réel',statBlock:type,cell,disposition:'helpful',visible:true,description:'Corps individuel réellement présent ; aucun équipement ajouté.'})).npc
 const declaration={eventId:id+'-agreement',npcId:id,role,agreementFactId:await fact(call,id),actualAgreementConfirmed:true}
 return{npc:n,declaration}
}
async function persistParty(t,call,dice='19'){
 const{saveSession,loadSession,deleteSession}=require('../../lib/session-store.ts'),s=await call('get_game_state'),id='actual-party-'+process.pid+'-'+Math.random();t.after(()=>deleteSession(id))
 await saveSession(id,{gameState:s,history:[],adventureId:s.adventureId,characterId:s.characterId});const next=await engine(t,{adventureId:s.adventureId,characterId:s.characterId,dice})
 ok(await next('replace_game_state',{gameState:(await loadSession(id)).gameState}));assert.deepEqual(await next('get_game_state'),s);return next
}
async function refused(call,name,input,code){const before=await call('get_game_state'),r=await call(name,input);assert.equal(r.code,code,JSON.stringify(r));assert.deepEqual(await call('get_game_state'),before);return r}
async function walk(call,roomId){return ok(await call('move_token',{tokenId:'player',roomId}))}
async function open(call,doorId){ok(await call('move_token',{tokenId:'player',doorId,doorMode:'approach'}));return ok(await call('interact_door',{doorId,action:'open'}))}
async function toTemple(call){
 await toGreenfast(call);await walk(call,'16');ok(await call('travel_to_map',{transitionId:'walk_to_tower'}))
}
async function toGreenfast(call){
 ok(await call('reveal_npc',{npcId:'sarah',disposition:'helpful'}));ok(await call('pick_up_item',{itemId:'sarah_diary_copy'}));await walk(call,'3');ok(await call('travel_to_map',{transitionId:'sail_to_waterdeep'}))
 await walk(call,'7');ok(await call('reveal_npc',{npcId:'cobbler',disposition:'helpful'}));ok(await call('reveal_clue',{clueId:'greenfast_lead',npcId:'cobbler'}));await walk(call,'9');ok(await call('travel_to_map',{transitionId:'road_to_greenfast'}))
}
module.exports={fact,createPartyNpc,persistParty,refused,walk,open,toTemple,toGreenfast}
