const assert=require('node:assert/strict'),{engine,ok}=require('./mcp-toolkit.cjs')
async function setupCadence(t,{call:existingCall,dice='17,18,19',intervalHours=1,adopt=true}={}){
 const call=existingCall??await engine(t,{dice}),state=await call('get_game_state')
 const fact=ok(await call('record_scene_fact',{cell:state.player.position,description:'Le MJ établit explicitement toute cette carte actuelle comme périmètre réel de contrôles de donjon, avec sa cadence optionnelle choisie au présent, sans état passé ni rencontre créée.'})).worldFact
 const input={eventId:'actual-cadence-adoption',cadenceId:'actual-map-cadence',operation:'start',reason:'Le MJ choisit cette fréquence imprimée pour le véritable périmètre de carte actuel.',start:{factId:fact.id,environment:'dungeon',intervalHours,actualMapScopeConfirmed:true}}
 const adopted=adopt?ok(await call('configure_random_encounter_cadence',input)):undefined
 return{call,fact,input,adopted,at:state.worldTimeSeconds}
}
const check=(f,checkId,method='d20')=>({checkId,cadenceId:f.input.cadenceId,method,reason:'Le MJ choisit explicitement le contrôle de cette échéance réelle et conservée.'})
const stop=f=>({eventId:'actual-cadence-stop',cadenceId:f.input.cadenceId,operation:'stop',reason:'Le MJ termine explicitement cette cadence sans effacer les contrôles déjà acquis.'})
async function refused(call,name,input,code){const before=await call('get_game_state'),r=await call(name,input);assert.equal(r.code,code,JSON.stringify(r));assert.deepEqual(await call('get_game_state'),before)}
async function persistCadence(t,call,dice='19'){
 const{saveSession,loadSession,deleteSession}=require('../../lib/session-store.ts'),state=await call('get_game_state'),id='cadence-sql-'+process.pid+'-'+Math.random()
 t.after(()=>deleteSession(id));await saveSession(id,{gameState:state,history:[],adventureId:state.adventureId,characterId:state.characterId});const fresh=await engine(t,{dice,adventureId:state.adventureId,characterId:state.characterId});ok(await fresh('replace_game_state',{gameState:(await loadSession(id)).gameState}));assert.deepEqual(await fresh('get_game_state'),state);return fresh
}
async function forest(call){const r=ok(await call('consult_rules',{book:'dmg-2014',query:'Sylvan Forest Encounters'})),hit=r.results.find(r=>r.headings.at(-1)==='Sylvan Forest Encounters');assert.ok(hit);return ok(await call('consult_rules',{sectionId:hit.sectionId})).tables.find(r=>r.title==='Sylvan Forest Encounters').tableId}
module.exports={setupCadence,check,stop,refused,persistCadence,forest}

/** Parent integration helper: records only the actual context and returns the
 * explicit adoption arguments; it never configures, rolls, advances or spawns. */
async function prepareCadence(call,{cadenceId='actual-map-cadence',intervalHours=1}={}){
 const state=await call('get_game_state'),fact=ok(await call('record_scene_fact',{cell:state.player.position,description:'Le MJ qualifie explicitement le périmètre réel de cette carte pour sa cadence générale de rencontres; aucune présence, durée passée ou rencontre physique n’est créée.'})).worldFact
 const input={eventId:cadenceId+'-adoption',cadenceId,operation:'start',reason:'Adoption explicite au présent de cette fréquence de contrôle pour la carte réellement qualifiée.',start:{factId:fact.id,environment:'dungeon',intervalHours,actualMapScopeConfirmed:true}}
 return{call,fact,input,at:state.worldTimeSeconds}
}
module.exports.prepareCadence=prepareCadence
