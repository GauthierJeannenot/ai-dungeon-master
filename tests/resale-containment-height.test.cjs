const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path')
Object.assign(process.env,{MONETIZATION_ENABLED:'false',LLM_MODE:'mock',ALLOW_PAID_LLM:'false',ADVENTURE_ID:'sarah-of-yellowcrest-manor',CHARACTER_ID:'fighter'})
// This external test resolves ONLY the explicitly chosen compiled cohort cwd.
// Run it from the parent W20 after B, Swallow A and flight C have been merged/built.
const root=process.cwd(),local=relative=>path.join(root,relative)
const{installPgMem}=require(local('tests/helpers/pg-mem.cjs')),pg=installPgMem()
const{saveSession,loadSession,deleteSession}=require(local('lib/session-store.ts'))
const{setup:ordinary}=require(local('tests/helpers/merchant-resale-fixture.cjs'))
const{setupValuable}=require(local('tests/helpers/valuable-resale-fixture.cjs'))
const{ok,adjacent}=require(local('tests/helpers/mcp-toolkit.cjs'))
test.after(()=>pg.restore())
const distance=(a,b)=>Math.max(Math.abs(a.x-b.x),Math.abs(a.y-b.y))
async function fixture(t,kind,tail='19'){
 const f=kind==='ordinary'?await ordinary(t,{dice:tail}):await setupValuable(t,{tail})
 const metadata=(await f.call.client.listTools()).tools
 for(const name of ['record_swallow_body_size','fly_native_path','create_valuable_resale_offer','sell_to_merchant'])assert.ok(metadata.some(tool=>tool.name===name),`Compile the joint B/A/C cohort before running this cross: missing ${name}`)
 const offer=kind==='ordinary'?f.offer:f.valuableOffer,sale=kind==='ordinary'?f.sale:f.valuableSale
 ok(await f.call(kind==='ordinary'?'create_resale_offer':'create_valuable_resale_offer',offer))
 return{...f,chosenOffer:offer,chosenSale:sale}
}
async function refused(call,name,input,codes){
 const before=await call('get_game_state'),answer=await call(name,input)
 assert.ok((Array.isArray(codes)?codes:[codes]).includes(answer.code),JSON.stringify(answer));assert.ok(answer.error)
 assert.deepEqual(await call('get_game_state'),before,'A physical handoff refusal must preserve ALL coins/items/doses/custody/source/conditions/clock')
 return answer
}
async function sql(t,f,key){
 const before=await f.call('get_game_state'),id=`cross-resale-${key}-${process.pid}`
 t.after(()=>deleteSession(id));await saveSession(id,{gameState:before,history:[],adventureId:before.adventureId,characterId:before.characterId})
 ok(await f.call('replace_game_state',{gameState:(await loadSession(id)).gameState}));return f.call('get_game_state')
}
async function actualSwallowedCorpse(t,kind){
 const f=await fixture(t,kind,'1,20,17,1,1,1,1,19'),state=await f.call('get_game_state'),npc=state.npcs[f.chosenOffer.merchantId]
 const size=ok(await f.call('record_scene_fact',{description:'Ce véritable corps du personnage mesure actuellement la taille Medium ; aucune forme ou anatomie nouvelle.',cell:state.player.position})).worldFact
 ok(await f.call('record_swallow_body_size',{entityId:'player',size:'Medium',factId:size.id,source:'Mesure physique actuelle de cet exemplaire de corps, pas taille déduite d’un nom.'}))
 const cell=adjacent(state).find(c=>distance(c,npc.position)<=1&&distance(c,npc.position)>0);assert.ok(cell,'An actual free neighboring source cell must be XY-close to the real outside merchant')
 const worm=ok(await f.call('spawn_monster',{monsterType:'purple_worm',cell}));ok(await f.call('enter_combat',{combatants:['player',worm.id]}));assert.equal((await f.call('get_game_state')).currentTurn,worm.id)
 const bite=ok(await f.call('resolve_monster_action',{monsterId:worm.id,targetId:'player',actionName:'Bite'}));assert.equal(bite.attacks[0].swallow.swallowed,true)
 ok(await f.call('update_hp',{entityId:worm.id,delta:-1000,damageType:'force',damageOrigin:'environment',reason:'Un véritable événement extérieur de dégâts détruit ce même hôte ; le corps intérieur ne reçoit ni sortie ni remise physique.'}))
 const saved=await sql(t,f,kind),episode=Object.values(saved.dmTools.swallow.episodes).find(e=>e.targetId==='player'&&e.sourceId===worm.id)
 assert.equal(episode.status,'corpse_inside');assert.equal(saved.monsters[worm.id].isAlive,false);assert.deepEqual(saved.player.position,saved.monsters[worm.id].position);assert.ok(distance(saved.player.position,saved.npcs[f.chosenOffer.merchantId].position)<=1)
 return{...f,saved,episode}
}
for(const kind of ['ordinary','valuable'])test(`${kind} custody cannot pass through an actual worm corpse despite an exterior merchant at adjacent projected XY`,async t=>{
 const f=await actualSwallowedCorpse(t,kind)
 // Preserve the source end-combat guard; never forge exploration or an interior square.
 await refused(f.call,'end_combat',{},'SWALLOW_MAP_TRANSITION_REQUIRED')
 await refused(f.call,'sell_to_merchant',f.chosenSale,['RESALE_OUTSIDE_COMBAT','NOT_CURRENT_TURN'])
 const state=await f.call('get_game_state'),gs=require(local('mcp-server/dist/mcp-server/game-state.js'))
 const{assertToolkitReach}=require(local('mcp-server/dist/mcp-server/toolkit.js'))
 const{swallowedBy}=require(local('mcp-server/dist/lib/swallow-state.js'))
 const{entityVerticalContext}=require(local('mcp-server/dist/lib/jumping-state.js'))
 gs.replaceState(structuredClone(state));assert.equal(swallowedBy(gs.getState(),'player'),f.episode.sourceId);assert.equal(entityVerticalContext(gs.getState(),'player').source,'actual_swallowed_body_derived_from_host')
 const npc=state.npcs[f.chosenOffer.merchantId],before=structuredClone(gs.getState())
 assert.throws(()=>assertToolkitReach({mapId:state.currentMapId,roomId:npc.roomId,cell:npc.position}),error=>error.code==='SWALLOW_EXTERNAL_REACH_BLOCKED')
 assert.deepEqual(gs.getState(),before,'The shared physical-reach guard is read-only even independently of the combat economy')
 // Explicitly SYNTHETIC ADVERSARIAL phase restoration, never a historical save:
 // Swallow has no earlier published encounter permitting that claimed history.
 // No acceptance is required and no validator is relaxed. If restoration is
 // rejected it must be atomic; if accepted, the actual handoff still cannot
 // cross the retained real source wall merely because the phase was changed.
 const adversarial=structuredClone(state);adversarial.phase='exploration';adversarial.currentTurn=null;adversarial.initiativeOrder=[]
 assert.deepEqual(adversarial.dmTools.swallow,state.dmTools.swallow)
 const id=`cross-resale-adversarial-phase-${kind}-${process.pid}`;t.after(()=>deleteSession(id))
 await saveSession(id,{gameState:adversarial,history:[],adventureId:adversarial.adventureId,characterId:adversarial.characterId})
 const restore=await f.call('replace_game_state',{gameState:(await loadSession(id)).gameState})
 if(restore.error||restore.isError)assert.deepEqual(await f.call('get_game_state'),state,'Rejected adversarial restoration must have no mutation')
 else{
  const restored=await f.call('get_game_state');assert.equal(restored.phase,'exploration');assert.deepEqual(restored.dmTools.swallow,state.dmTools.swallow);assert.deepEqual(restored.player.position,state.player.position);assert.deepEqual(restored.player.hp,state.player.hp);assert.equal(restored.worldTimeSeconds,state.worldTimeSeconds)
  await refused(f.call,'sell_to_merchant',f.chosenSale,'SWALLOW_EXTERNAL_REACH_BLOCKED')
 }
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})

async function measuredLevels(f,{sellerZ,merchantZ}){
 const state=await f.call('get_game_state'),npc=state.npcs[f.chosenOffer.merchantId],source='Deux supports actuels réellement mesurés, corps exacts et niveaux observés ; aucune vitesse volante ou trajectoire inventée.'
 for(const[entityId,cell,z,height]of [['player',state.player.position,sellerZ,6],[npc.id,npc.position,merchantZ,4]]){
  const surfaceId=`actual-handoff-support-${entityId}`
  ok(await f.call('record_vertical_surface',{eventId:`actual-handoff-surface-${entityId}`,surfaceId,mapId:state.currentMapId,roomId:state.currentRoomId,cells:[cell],kind:'support',elevationFeet:z,actualGeometryConfirmed:true,source}))
  ok(await f.call('record_physical_body',{eventId:`actual-handoff-body-${entityId}`,entityId,heightFeet:height,actualMeasuredBodyConfirmed:true,source}))
  ok(await f.call('observe_standing_surface',{eventId:`actual-handoff-standing-${entityId}`,entityId,surfaceId,actualCurrentSupportConfirmed:true,source}))
 }
 return state
}
for(const kind of ['ordinary','valuable'])for(const high of ['seller','merchant'])test(`${kind} handoff refuses a true measured ${high}20ft support while both projected XY remain adjacent`,async t=>{
 const f=await fixture(t,kind),before=await measuredLevels(f,{sellerZ:high==='seller'?20:0,merchantZ:high==='merchant'?20:0})
 const state=await sql(t,f,`${kind}-${high}-height`);assert.deepEqual(state.player.position,before.player.position);assert.deepEqual(state.npcs[f.chosenOffer.merchantId].position,before.npcs[f.chosenOffer.merchantId].position)
 assert.ok(distance(state.player.position,state.npcs[f.chosenOffer.merchantId].position)<=1)
 await refused(f.call,'sell_to_merchant',f.chosenSale,'PHYSICAL_HEIGHT_POINT_GEOMETRY_REQUIRED')
 assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
