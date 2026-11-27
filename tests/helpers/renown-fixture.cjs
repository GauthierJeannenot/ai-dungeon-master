const{engine,ok}=require('./mcp-toolkit.cjs')
async function setupRenown(t,{adopt=true,register=true,dice='19'}={}){
 const call=await engine(t,{dice}),fact=async description=>{const s=await call('get_game_state');return ok(await call('record_scene_fact',{description,cell:s.player.position})).worldFact}
 const decision=await fact('Le MJ a réellement choisi explicitement la règle optionnelle DMG Renown pour cette session, sans histoire chiffrée reconstruite.'),membership=await fact('L’organisation actuelle existe réellement et l’appartenance actuelle de ce personnage y est déjà établie, avant ce suivi comptable.'),occurrence=await fact('Cet accomplissement exact est réellement terminé et a fait avancer les intérêts de cette organisation ; aucune action incertaine n’est rendue réussie par la comptabilité.')
 const adoption={eventId:'actual-renown-adoption',decisionFactId:decision.id,optionalRuleExplicitlyAdopted:true}
 const organization={eventId:'actual-member-organization',organizationId:'actual-member-group',name:'Organisation déjà établie',membershipFactId:membership.id,actualExistingMembershipConfirmed:true,actualOrganizationDefinitionConfirmed:true,ranks:[{rankId:'chosen-guard',title:'Titre choisi par le MJ',minimumRenown:2,minimumLevel:1,prerequisites:[]},{rankId:'chosen-oath',title:'Titre avec prérequis réel',minimumRenown:3,prerequisites:[{prerequisiteId:'actual-oath',description:'Un vrai engagement déjà accompli, établi explicitement.'}]},{rankId:'chosen-veteran',title:'Titre à niveau élevé',minimumRenown:2,minimumLevel:20,prerequisites:[]}]}
 if(adopt)ok(await call('adopt_renown',adoption));if(register)ok(await call('record_renown_organization',organization))
 const award={eventId:'actual-renown-first-award',organizationId:organization.organizationId,occurrenceFactId:occurrence.id,kind:'interests',actualCompletedAccomplishmentConfirmed:true}
 return{call,fact,decision,membership,occurrence,adoption,organization,award}
}
module.exports={setupRenown}
