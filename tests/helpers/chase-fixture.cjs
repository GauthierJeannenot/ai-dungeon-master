const assert=require('node:assert/strict')
const{engine,ok,adjacent,grid}=require('./mcp-toolkit.cjs')
const source='Mesures et circonstances réellement constatées de cette poursuite urbaine, sur les cases actuelles, sans acteur ni déplacement déduits du texte.'
async function setupChase(t,{dice='20,10,1,11,11,11,11,19',quarry='player',adopt=true,characterId='fighter',enrollPursuer=true,pursuerCell}={}){
 const call=await engine(t,{adventureId:'sarah-of-yellowcrest-manor',characterId,dice});let s=await call('get_game_state')
 const pursuer=ok(await call('spawn_monster',{monsterType:'bandit',cell:pursuerCell??adjacent(s)[0]}));s=await call('get_game_state')
 const guard=ok(await call('spawn_monster',{monsterType:'commoner',cell:adjacent(s)[0]}));s=await call('get_game_state')
 const fact=ok(await call('record_scene_fact',{description:source,cell:s.player.position})).worldFact
 const roleFact=ok(await call('record_scene_fact',{description:'Rôle de garde réellement établi explicitement par le MJ pour ce corps existant ; aucune statistique générale changée.',cell:s.player.position})).worldFact
 const spearFact=ok(await call('record_scene_fact',{description:'Cette lance physique exacte est réellement tenue par ce PNJ avant la poursuite ; aucune remise au joueur.',cell:s.player.position})).worldFact
 ok(await call('qualify_chase_guard',{eventId:'actual-guard-role-spear',entityId:guard.id,roleFactId:roleFact.id,spearFactId:spearFact.id,spearInstanceId:'npc-held-actual-spear',actualSpearHeld:true}))
 const initiative=ok(await call('enter_combat',{combatants:enrollPursuer?['player',pursuer.id,guard.id]:['player',guard.id],tieOrder:enrollPursuer?['player',pursuer.id,guard.id]:['player',guard.id]}))
 const input={eventId:'begin-real-urban-chase',chaseId:'real-urban-chase',quarryId:quarry==='player'?'player':pursuer.id,pursuerIds:[quarry==='player'?pursuer.id:'player'],table:'urban',guardIds:[guard.id],reason:'Oui, table urbaine officielle et reprise persistée'}
 if(adopt)ok(await call('begin_chase',input));return{call,pursuer,guard,fact,input,initiative,source}
}
async function endChaseTurn(f,eventId){return ok(await f.call('resolve_chase_turn',{eventId,chaseId:f.input.chaseId}))}
async function next(f){const s=await f.call('get_game_state');return ok(await f.call('next_turn',{actorId:s.currentTurn,skipAction:true,reason:'Le MJ choisit explicitement cette vraie fin de tour, sans fabriquer action ni déplacement.'}))}
async function escapeVisible(f,eventId){const s=await f.call('get_game_state');return ok(await f.call('resolve_chase_escape',{eventId,chaseId:f.input.chaseId,leaderId:f.input.pursuerIds[0],sightFactId:f.fact.id,continuousSight:true,hide:'normal',area:'normal',senseByPursuer:{[f.input.pursuerIds[0]]:'sight'}}))}
async function refuse(call,name,input,code){const before=await call('get_game_state'),r=await call(name,input);assert.equal(r.code,code,JSON.stringify(r));assert.deepEqual(await call('get_game_state'),before);return r}
function route(s,id,length=3){const nav=grid(s,id),start=id==='player'?s.player.position:s.monsters[id].position;const visit=(cells)=>{if(cells.length>=length)return cells;for(const c of nav.neighbors(cells.at(-1))){if(cells.some(p=>p.x===c.x&&p.y===c.y)||!nav.step(cells.at(-1),c))continue;const found=visit([...cells,c]);if(found)return found}return null};const result=visit([start]);assert.ok(result,'Actual fixture room must provide a real explicitly chosen short route');return result}
async function makePlayerChaseFatigue(t,{armor=false,dice}={}){
 const sequence=dice??[20,10,1,...Array.from({length:6},()=>[11,11]).flat(),1,11,19].join(',')
 const f=await setupChase(t,{dice:sequence})
 for(let round=1;round<=7;round++){
  ok(await f.call('chase_dash',{eventId:`player-real-dash-${round}`,chaseId:f.input.chaseId,actorId:'player'}))
  if(round===7)await refuse(f.call,'stop_chase',{eventId:'cannot-erase-real-dash-debt',chaseId:f.input.chaseId,participantIds:['player'],reason:'Cette tentative ne peut pas effacer les vrais Dash déjà pris.'},'CHASE_DASH_END_REQUIRED')
  const result=await endChaseTurn(f,`player-real-end-${round}`)
  if(round===7){assert.equal(result.checks.length,1);assert.equal(result.checks[0].ability,'con');assert.equal(result.checks[0].dc,10);assert.equal(result.checks[0].success,false);break}
  await next(f);await endChaseTurn(f,`pursuer-real-end-${round}`);await next(f);await escapeVisible(f,`actual-visible-escape-${round}`);await next(f)
 }
 const state=await f.call('get_game_state');assert.equal(state.dmTools.chases.fatigue.player.levels,1)
 ok(await f.call('stop_chase',{eventId:'finish-actual-urban-chase',chaseId:f.input.chaseId,participantIds:['player'],reason:'Le joueur décide explicitement de cesser après tous les effets sources de son vrai tour.'}));ok(await f.call('end_combat',{force:true,reason:'Fin explicite par reddition, sans retirer ni inventer un acteur.'}));return f
}
module.exports={makePlayerChaseFatigue,setupChase,endChaseTurn,next,escapeVisible,refuse,route,source}
