const assert=require('node:assert/strict')
const{engine,ok,grid}=require('./mcp-toolkit.cjs')
const{reachSarahChapel,persistCampaign,unchanged}=require('./campaign-outcome-fixture.cjs')
async function open(call,cycleId='actual-cycle'){return ok(await call('open_adventuring_cycle',{eventId:cycleId+'-open',cycleId,reason:'Le MJ ouvre explicitement ce cycle actuel, sans histoire passée ni recharge.'}))}
async function qualify(call,{cycleId='actual-cycle',eventId='actual-cycle-presence',presentNpcIds=[],offSceneNpcIds=[]}={}){
 const s=await call('get_game_state'),fact=ok(await call('record_scene_fact',{cell:s.player.position,description:'Le MJ atteste avant cette rencontre la présence physique des vrais membres de party et les corps actuellement hors champ, sans enrôlement ni mouvement ajouté.'})).worldFact
 const input={eventId,cycleId,encounterId:'viallis_ritual',factId:fact.id,presentNpcIds,offSceneNpcIds,actualPartyPresenceConfirmed:true};return{input,result:ok(await call('qualify_adventuring_cycle_encounter',input))}
}
async function closeIssue(call,{cycleId='actual-cycle',entryId='actual-cycle-entry',excludeWeak=false,record=true}={}){
 const state=await call('get_game_state'),engagement=Object.values(state.dmTools.campaignOutcomes.engagements).find(e=>e.encounterId==='viallis_ritual')
 const ended=ok(await call('end_combat',{force:true,reason:'Le MJ choisit explicitement la fin de cette vraie confrontation par reddition, avec opposition encore vivante.'})),closureId=ended.campaignClosures.find(c=>c.engagementId===engagement.id).closureId
 ok(await call('record_campaign_outcome',{eventId:entryId+'-source-outcome',closureId,result:'surrender',reason:'Le MJ atteste cette reddition réelle sans victoire, bénéfice ou progression inventés.'}))
 const input={eventId:entryId,cycleId,engagementId:engagement.id,opponents:engagement.participants.filter(p=>p.hostile!==false).map((p,index)=>({actorId:p.actorId,countsForMultiplier:!(excludeWeak&&index===1)})),reason:'Le MJ consigne la référence des adversaires réellement rencontrés ; aucun XP gagné ni coût fictif.'}
 return{engagement,input,ended,...record?{recorded:ok(await call('record_adventuring_cycle_encounter',input))}:{}}
}
const finish=(call,cycleId='actual-cycle',extra={})=>call('close_adventuring_cycle',{eventId:cycleId+'-close',cycleId,reason:'Le MJ ferme explicitement ce cycle, sans repos ou XP ajoutés.',...extra})
module.exports={assert,engine,ok,grid,reachSarahChapel,persist:persistCampaign,unchanged,open,qualify,closeIssue,finish}
