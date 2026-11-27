const {ok}=require('./mcp-toolkit.cjs')
async function prepareSacredRitesAtCurrentSite(call,{projectId='actual-sacred-cycle',eventId=projectId+'-start',deityName='Le dieu réellement vénéré',role='temple_priest',priestId}={}){
 const state=await call('get_game_state'),descriptions=[
  `Le MJ constate le vrai temple déjà établi à cette case et son affiliation réelle à ${deityName}. Ce constat ne crée pas de bâtiment.`,
  `Le personnage est réellement pieux et vénère ${deityName} ; sa classe ne prouve pas cette foi.`,
  'Le personnage a réellement accès à ce temple et aux rites choisis pendant les heures de pratique.',
  role==='temple_priest'?'Le personnage est réellement prêtre dans ce temple et dirige les rites choisis avec méditation et prière entre eux.':`Le personnage assiste réellement le prêtre déjà existant ${priestId} dans ce temple ; ce constat ne crée ni prêtre ni cérémonie.`,
 ],facts=[]
 for(const description of descriptions)facts.push(ok(await call('record_scene_fact',{description,cell:state.player.position})).worldFact)
 const input={eventId,projectId,deityName,templeFactId:facts[0].id,devotionFactId:facts[1].id,accessFactId:facts[2].id,roleFactId:facts[3].id,role,...priestId?{priestId}:{},actualPiousCharacterConfirmed:true,actualTempleAffiliatedWithReveredGodConfirmed:true,actualAccessAndRoleConfirmed:true}
 return{input,work:index=>({eventId:projectId+'-actual-date-'+index,projectId,activitySource:'Huit heures réellement consacrées aux rites du temple, à la méditation et à la prière entre les rites, sans crédit pour une autre activité.'}),facts}
}
async function nextSacredRiteDate(call,dates=1){let seconds=dates*86400-(await call('get_game_state')).worldTimeSeconds%86400;while(seconds>0){const part=Math.min(864000,seconds);ok(await call('advance_time',{seconds:part}));seconds-=part}}
module.exports={prepareSacredRitesAtCurrentSite,nextSacredRiteDate}
