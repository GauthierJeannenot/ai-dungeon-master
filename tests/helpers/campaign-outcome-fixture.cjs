const assert=require('node:assert/strict')
const{engine,ok}=require('./mcp-toolkit.cjs')
const move=async(call,roomId)=>ok(await call('move_token',{tokenId:'player',roomId}))
const helpful=async(call,npcId)=>ok(await call('reveal_npc',{npcId,disposition:'helpful'}))
async function enter(call,doorId,roomId){
 await move(call,roomId);ok(await call('move_token',{tokenId:'player',doorId,doorMode:'approach'}))
 ok(await call('interact_door',{doorId,action:'open'}));await move(call,roomId)
}
/** Real prospective authored route. No injected map, encounter, actor or result.
 * Returns the explicit start input without starting an encounter itself. */
async function reachSarahChapel(call,{urn=false,playerCell}={}){
 await helpful(call,'sarah');ok(await call('pick_up_item',{itemId:'sarah_diary_copy'}))
 await move(call,'3');ok(await call('travel_to_map',{transitionId:'sail_to_waterdeep'}))
 await move(call,'7');await helpful(call,'cobbler');ok(await call('reveal_clue',{clueId:'greenfast_lead',npcId:'cobbler'}))
 await move(call,'9');ok(await call('travel_to_map',{transitionId:'road_to_greenfast'}))
 await move(call,'16');ok(await call('travel_to_map',{transitionId:'walk_to_tower'}))
 await move(call,'18');await enter(call,'arcane_study','19');await enter(call,'study_workshop','22')
 await move(call,'21');await move(call,'24')
 if(urn){await enter(call,'chapel_library','26');ok(await call('move_token',{tokenId:'player',toCell:{x:34,y:21}}));ok(await call('pick_up_item',{itemId:'yellowcrest_urn'}));await move(call,'24')}
 return{start:{encounterId:'viallis_ritual',...(playerCell?{playerCell}:{})}}
}
async function startSarah(t,{dice='20,1,1,19',urn=false,playerCell,characterId='fighter'}={}){
 const call=await engine(t,{dice,characterId}),site=await reachSarahChapel(call,{urn,playerCell})
 const begun=ok(await call('start_encounter',site.start)),state=await call('get_game_state')
 assert.equal(state.currentTurn,'player')
 const evidence=ok(await call('inspect_campaign_outcomes')).encounters.find(e=>e.encounterId==='viallis_ritual').evidence
 assert.ok(evidence);return{call,begun,evidence}
}
async function persistCampaign(t,call,dice='19'){
 const{saveSession,loadSession,deleteSession}=require('../../lib/session-store.ts'),state=await call('get_game_state'),id='campaign-outcomes-'+process.pid+'-'+Math.random()
 t.after(()=>deleteSession(id));await saveSession(id,{gameState:state,history:[],adventureId:state.adventureId,characterId:state.characterId})
 const fresh=await engine(t,{adventureId:state.adventureId,characterId:state.characterId,dice})
 ok(await fresh('replace_game_state',{gameState:(await loadSession(id)).gameState}));assert.deepEqual(await fresh('get_game_state'),state);return fresh
}
async function unchanged(call,name,input,code){const before=await call('get_game_state'),answer=await call(name,input);assert.equal(answer.code,code,JSON.stringify(answer));assert.deepEqual(await call('get_game_state'),before)}
async function knockoutSarahOpponents(call){
 let state=await call('get_game_state'),mage=Object.values(state.monsters).find(m=>m.socialIdentity==='encounter:viallis_ritual:0')
 const priest=Object.values(state.monsters).find(m=>m.socialIdentity==='encounter:viallis_ritual:1');assert.ok(mage&&priest)
 for(let n=0;n<2;n++)ok(await call('resolve_player_attack',{targetId:mage.id,weaponOrSpell:'longsword',nonlethal:true}))
 state=await call('get_game_state');assert.equal(state.monsters[mage.id].hp.current,0);assert.equal(state.monsters[mage.id].isAlive,true)
 ok(await call('next_turn',{actorId:'player'}))
 for(let n=0;n<5;n++){state=await call('get_game_state');if(state.currentTurn==='player')break;ok(await call('next_turn',{actorId:state.currentTurn,skipAction:true}))}
 state=await call('get_game_state');assert.equal(state.currentTurn,'player')
 ok(await call('move_token',{tokenId:'player',toCell:{x:24,y:19}}))
 for(let n=0;n<2&&(await call('get_game_state')).monsters[priest.id].hp.current>0;n++)
  ok(await call('resolve_player_attack',{targetId:priest.id,weaponOrSpell:'longsword',nonlethal:true}))
 state=await call('get_game_state');assert.equal(state.monsters[priest.id].hp.current,0);assert.equal(state.monsters[priest.id].isAlive,true)
 return{mageId:mage.id,priestId:priest.id}
}
module.exports={reachSarahChapel,startSarah,persistCampaign,unchanged,knockoutSarahOpponents,enter,move}
