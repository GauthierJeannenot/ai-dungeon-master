const assert=require('node:assert/strict')
const{ok}=require('./mcp-toolkit.cjs')
async function prepareNpcRest(call,{npcId,restId='actual-npc-long-rest'}={}){
 const state=await call('get_game_state'),npc=state.npcs[npcId];assert.ok(npc)
 const fact=ok(await call('record_scene_fact',{cell:npc.position,description:'Le MJ constate que cet individu réel accepte maintenant de se reposer volontairement au lieu observé, sans déplacement ni repos passé inventé.'})).worldFact
 return{start:{restId,npcId,kind:'long',factId:fact.id,actualWillingRestConfirmed:true},sleep:{restId,eventId:'actual-six-hours-'+restId,seconds:21600,activity:'sleep',reason:'Six vraies heures de sommeil naturel de ce PNJ observé.'},light:{restId,eventId:'actual-two-hours-'+restId,seconds:7200,activity:'light',reason:'Deux vraies heures légères de ce PNJ au même lieu observé.'},finish:{restId}}
}
async function completeNpcRest(call,inputs){ok(await call('begin_npc_rest',inputs.start));ok(await call('advance_npc_rest',inputs.sleep));ok(await call('advance_npc_rest',inputs.light));return ok(await call('finish_npc_rest',inputs.finish))}
module.exports={prepareNpcRest,completeNpcRest}
