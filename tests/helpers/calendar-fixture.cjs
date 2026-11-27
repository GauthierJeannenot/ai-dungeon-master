const{engine,ok}=require('./mcp-toolkit.cjs')
async function setupCalendar(t,{configure=true,harptos=false,dice='19',anchor}={}){
 const call=await engine(t,{dice}),fact=async description=>{const s=await call('get_game_state');return ok(await call('record_scene_fact',{description,cell:s.player.position})).worldFact}
 const decision=await fact('Le MJ a réellement choisi ce calendrier, son ancre actuelle exacte et la convention explicite du jour de86400secondes moteur ; aucun temps antérieur n’est changé.')
 const configuration={eventId:'actual-calendar-configuration',decisionFactId:decision.id,actualCalendarAndAnchorConfirmed:true,day86400SecondsExplicitlyAdopted:true,definition:harptos?{kind:'harptos',shieldmeetYear:1488}:{kind:'custom_fixed',name:'Calendrier réel choisi par le MJ',segments:[{segmentId:'first',name:'Premier mois choisi',days:3},{segmentId:'feast',name:'Jour intercalaire choisi',days:1},{segmentId:'second',name:'Second mois choisi',days:2}]},anchor:anchor??(harptos?{year:1488,segmentId:'midsummer',day:1,secondOfDay:86399}:{year:7,segmentId:'first',day:3,secondOfDay:86399})}
 const referenceFact=await fact('Le MJ a réellement établi cette référence de célébration à une date précise et, si demandé explicitement, sa période ; aucune conséquence mécanique n’est résolue.')
 const reference={eventId:'actual-reference-command',referenceId:'actual-observance',factId:referenceFact.id,actualReferenceConfirmed:true,category:'civic_observance',name:'Célébration explicitement choisie',description:'Référence réelle du MJ, sans effet automatique.',anchor:configuration.anchor,periodDays:2}
 if(configure)ok(await call('configure_campaign_calendar',configuration))
 return{call,fact,decision,configuration,reference,referenceFact}
}
module.exports={setupCalendar}
