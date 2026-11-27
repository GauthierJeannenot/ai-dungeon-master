const test=require('node:test'),assert=require('node:assert/strict')
Object.assign(process.env,{MONETIZATION_ENABLED:'false',LLM_MODE:'mock',ALLOW_PAID_LLM:'false'})
const{installPgMem}=require('./helpers/pg-mem.cjs'),pg=installPgMem()
const{ok}=require('./helpers/mcp-toolkit.cjs')
const{setupCackle,persistCackle,cackleRefused}=require('./helpers/cackle-fever-fixture.cjs')
test.after(()=>pg.restore())
test('a real NPC case, incubation, protected exhaustion and actual first-turn contagion survive SQL without reroll',async t=>{
 const f=await setupCackle(t),{call}=f
 assert.equal(f.infection.success,false)
 const state=await call('get_game_state'),record=state.dmTools.afflictions.records[f.infection.afflictionId]
 assert.equal(record.targetId,'player');assert.equal(record.cackleFever.incubationHours,1)
 assert.equal(state.dmTools.exhaustion.creatures[f.npcId].level,1)
 const fresh=await persistCackle(t,call)
 assert.equal(ok(await fresh('resolve_cackle_fever_event',{eventId:f.exposure.id})).replayed,true)
 assert.equal(ok(await fresh('roll_dice',{notation:'1d20'})).total,19)
})
test('one-field disease DC, failure count and exact incubation timestamp changes refuse hydration atomically',async t=>{
 const {call,seed}=await setupCackle(t,{contagion:false,dice:'1,19'}),state=await call('get_game_state')
 for(const mutate of [r=>r.cackleFever.dc=1,r=>r.cackleFever.recoveryFailures=2]){const changed=structuredClone(state);mutate(changed.dmTools.afflictions.records[seed.affliction.id]);await cackleRefused(call,'replace_game_state',{gameState:changed},'CACKLE_STATE_MISMATCH')}
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('gnome qualification and an actually petrified prospective carrier prevent infection before the incubation die',async t=>{
 const {engine,adjacent}=require('./helpers/mcp-toolkit.cjs'),{qualify}=require('./helpers/cackle-fever-fixture.cjs')
 const call=await engine(t,{dice:'19'}),state=await call('get_game_state'),cell=adjacent(state)[0],id='actual-stone-prospective-carrier'
 ok(await call('create_npc',{npcId:id,name:'Individu réel',statBlock:'veteran',cell,disposition:'neutral',visible:true,description:'Cet individu réel est seulement qualifié comme hôte.'}))
 await qualify(call,id)
 ok(await call('apply_condition',{entityId:id,condition:'petrified'}))
 const fact=ok(await call('record_scene_fact',{cell,description:'Le corps réellement pétrifié ne peut acquérir cette nouvelle maladie.'})).worldFact
 await cackleRefused(call,'record_cackle_fever_case',{eventId:'actual-no-stone-infection',creatureId:id,factId:fact.id,actualNewNpcInfectionConfirmed:true},'CACKLE_HOST_IMMUNE')
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
 const g=await setupCackle(t,{gnome:true,dice:'1,1,2,20,1,1,20,19'})
 assert.equal(g.infection.immune,'gnome');assert.equal(g.infection.diceRolled,false)
 assert.ok(!Object.values((await g.call('get_game_state')).dmTools.afflictions.records).some(r=>r.targetId==='player'))
 assert.equal(ok(await g.call('roll_dice',{notation:'1d20'})).total,19)
})

test('a real held NPC stress Constitution die survives SQL and actual Bardic Inspiration without a second source event',async t=>{
 const {call,npcId,cell}=await setupCackle(t,{characterId:'bard',contagion:false,dice:'1,1'})
 ok(await call('use_subclass_feature',{featureId:'bardic_inspiration',targetId:npcId}))
 const fact=ok(await call('record_scene_fact',{cell,description:'Un vrai événement extérieur éprouvant vient de survenir au porteur actuellement malade.'})).worldFact
 const stress=ok(await call('record_cackle_fever_stress',{eventId:'actual-held-carrier-stress',creatureId:npcId,factId:fact.id,reason:'Le MJ atteste cet événement de stress distinct.',actualGreatStressConfirmed:true}))
 const pending=ok(await call('resolve_cackle_fever_event',{eventId:stress.event.id})).pendingReaction
 assert.deepEqual(pending.roll.rolls,[1])
 const fresh=await persistCackle(t,call,'4,2,19'),before=await fresh('get_game_state'),changed=structuredClone(before)
 changed.hero.pending.roll.total++
 await cackleRefused(fresh,'replace_game_state',{gameState:changed},'CACKLE_STATE_MISMATCH')
 const saved=ok(await fresh('resolve_reaction',{pendingId:pending.id,choice:'bardic_inspiration'}))
 assert.deepEqual(saved.save.roll.rolls,[1]);assert.equal(saved.save.roll.total,pending.roll.total+4)
 assert.equal(saved.damageRoll.total,2);assert.equal(Object.values((await fresh('get_game_state')).dmTools.cackleFever.events).filter(e=>e.kind==='stress').length,1)
 assert.equal(ok(await fresh('roll_dice',{notation:'1d20'})).total,19)
})

test('an actual optional NPC end-turn crisis save can be declined and its committed turn receipt survives SQL without rolling',async t=>{
 const f=await setupCackle(t),{call}=f
 ok(await call('next_turn',{actorId:'player',skipAction:true,reason:'Le joueur termine explicitement son vrai tour.'}))
 const before=await call('get_game_state')
 assert.equal(before.currentTurn,f.npcId)
 const declined=ok(await call('resolve_cackle_fever_turn',{afflictionId:f.seed.affliction.id,endTurn:true,attemptSave:false}))
 assert.equal(declined.saveDeclined,true);assert.equal(declined.diceRolled,false)
 const saved=await call('get_game_state');assert.equal(saved.actionUsed[f.npcId],true)
 assert.ok(saved.monsters[f.npcId].conditions.includes('incapacitated'))
 const fresh=await persistCackle(t,call,'19')
 assert.equal(ok(await fresh('resolve_cackle_fever_turn',{afflictionId:f.seed.affliction.id,endTurn:true,attemptSave:false})).replayed,true)
 assert.equal(ok(await fresh('roll_dice',{notation:'1d20'})).total,19)
})

async function symptomaticPlayer(t,options={}){
 const f=await setupCackle(t,options),{call}=f
 ok(await call('end_combat',{force:true,reason:'La vraie confrontation se termine par la décision explicite du MJ sans victoire ni déplacement.'}))
 const state=await call('get_game_state'),record=state.dmTools.afflictions.records[f.infection.afflictionId]
 ok(await call('advance_time',{seconds:record.nextAt-state.worldTimeSeconds}))
 ok(await call('resolve_cackle_fever_onset',{afflictionId:record.id}))
 return f
}

test('an actual optional long-rest recovery may be declined through SQL with no failure, DC reduction, madness or die',async t=>{
 const {call,infection}=await symptomaticPlayer(t)
 const rest=ok(await call('take_rest',{kind:'long'})),link=rest.cackleFeverEvent??rest.result?.cackleFeverEvent
 assert.ok(link,JSON.stringify(rest))
 const declined=ok(await call('resolve_cackle_fever_event',{eventId:link.eventId,attemptSave:false}))
 assert.equal(declined.saveDeclined,true);assert.equal(declined.diceRolled,false)
 const state=await call('get_game_state'),disease=state.dmTools.afflictions.records[infection.afflictionId].cackleFever
 assert.equal(disease.dc,13);assert.equal(disease.recoveryFailures,0);assert.deepEqual(state.dmTools.cackleFever.madness,{})
 const fresh=await persistCackle(t,call)
 assert.equal(ok(await fresh('resolve_cackle_fever_event',{eventId:link.eventId,attemptSave:false})).replayed,true)
 assert.equal(ok(await fresh('roll_dice',{notation:'1d20'})).total,19)
})

test('three cumulative actual failed recoveries produce only the official persistent flaw; real Lesser Restoration cures disease and unlocks exhaustion without curing the flaw',async t=>{
 const {call,infection}=await symptomaticPlayer(t,{characterId:'cleric',dice:'1,1,2,20,1,1,1,1,20,1,1,1,12,19'})
 let final
 for(let day=0;day<3;day++){
  if(day)ok(await call('advance_time',{seconds:16*3600}))
  const rest=ok(await call('take_rest',{kind:'long'})),link=rest.cackleFeverEvent??rest.result?.cackleFeverEvent
  assert.ok(link,JSON.stringify(rest));final=ok(await call('resolve_cackle_fever_event',{eventId:link.eventId,attemptSave:true}))
  assert.equal(final.success,false)
 }
 assert.equal(final.cumulativeRecoveryFailures,3)
 assert.equal(final.indefiniteMadness.roll.total,12)
 const before=await call('get_game_state'),flaw=structuredClone(before.dmTools.cackleFever.madness[infection.afflictionId])
 assert.ok(flaw.text.includes('drunk'))
 await cackleRefused(call,'remove_exhaustion',{eventId:'no-protected-cackle-removal',targetId:'player',levels:1,reason:'Un niveau symptomatique ne peut être retiré avant guérison.'},'CACKLE_EXHAUSTION_LOCKED')
 ok(await call('cast_spell',{spellId:'lesser-restoration',targetId:'player',slotLevel:2,afflictionId:infection.afflictionId}))
 const after=await call('get_game_state')
 assert.equal(after.dmTools.afflictions.records[infection.afflictionId].status,'cured')
 assert.equal(after.dmTools.exhaustion.creatures.player.level,1)
 assert.deepEqual(after.dmTools.cackleFever.madness[infection.afflictionId],flaw)
 const fresh=await persistCackle(t,call),bad=await fresh('get_game_state');bad.dmTools.cackleFever.madness[infection.afflictionId].text='A fabricated trait'
 await cackleRefused(fresh,'replace_game_state',{gameState:bad},'CACKLE_STATE_MISMATCH')
 assert.equal(ok(await fresh('roll_dice',{notation:'1d20'})).total,19)
})

test('a real carrier death closes its laughter and pending stress without a corpse save or future contagion and preserves SQL history',async t=>{
 const {call,npcId,seed}=await setupCackle(t,{contagion:false,dice:'1,1,2,19'})
 const state=await call('get_game_state'),cell=state.npcs[npcId].position,fact=ok(await call('record_scene_fact',{cell,description:'Un stress extérieur réel déclenche cette crise avant la vraie blessure mortelle.'})).worldFact
 const stress=ok(await call('record_cackle_fever_stress',{eventId:'actual-before-death-stress',creatureId:npcId,factId:fact.id,reason:'Grand stress réellement constaté.',actualGreatStressConfirmed:true}))
 ok(await call('resolve_cackle_fever_event',{eventId:stress.event.id}))
 ok(await call('update_hp',{entityId:npcId,delta:-1000,reason:'Dégâts environnementaux létaux réellement appliqués.',damageType:'psychic',damageOrigin:'environment'}))
 const after=await call('get_game_state');assert.equal(after.npcs[npcId].isAlive,false)
 assert.ok(after.dmTools.afflictions.records[seed.affliction.id].cackleFever.crisis.endedAt!==undefined)
 assert.equal(ok(await call('inspect_cackle_fever')).dueEvent,null)
 const fresh=await persistCackle(t,call)
 ok(await fresh('advance_time',{seconds:60}))
 assert.equal(ok(await fresh('roll_dice',{notation:'1d20'})).total,19)
})

test('an active incubating case rejects an actual selected player batch before its first attack, action or die',async t=>{
 const f=await setupCackle(t,{onset:false,contagion:false,dice:'1,20,1,19'}),{call}=f
 ok(await call('enter_combat',{combatants:['player',f.npcId]}))
 await cackleRefused(call,'resolve_player_multiattack',{attacks:[{targetId:f.npcId,weaponOrSpell:'longsword'},{targetId:f.npcId,weaponOrSpell:'longsword'}]},'CACKLE_ATTACK_BATCH_UNSUPPORTED')
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('controlled temporary-stone context keeps the true incubation remainder through actual pause, expiry and SQL',async t=>{
 const f=await setupCackle(t,{onset:false,contagion:false,dice:'1,19'}),{call}=f
 const state=await call('get_game_state'),original=state.dmTools.afflictions.records[f.seed.affliction.id].nextAt
 const bad=structuredClone(state);bad.dmTools.afflictions.records[f.seed.affliction.id].nextAt++
 await cackleRefused(call,'replace_game_state',{gameState:bad},'CACKLE_STATE_MISMATCH')
 // Declared unit complement: only an already established temporary stone
 // provider is supplied. Disease, HP, skill, equipment and pending are real.
 state.hero.effects.push({id:'controlled-temporary-stone-provider',kind:'established-petrification',sourceId:'player',targetIds:[f.npcId],expiresAt:state.worldTimeSeconds+100,concentration:false,data:{condition:'petrified'}})
 ok(await call('replace_game_state',{gameState:state}))
 ok(await call('apply_condition',{entityId:f.npcId,condition:'petrified'}))
 ok(await call('advance_time',{seconds:100}))
 const resumed=await call('get_game_state'),record=resumed.dmTools.afflictions.records[f.seed.affliction.id]
 assert.equal(record.nextAt,original+100);assert.equal(record.cackleFever.incubationSuspendedSeconds,100)
 const fresh=await persistCackle(t,call)
 assert.equal(ok(await fresh('roll_dice',{notation:'1d20'})).total,19)
})

test('a real held Bardic source save refuses unrelated lethal damage before mutation and completes its original d20 before actual death',async t=>{
 const {call,npcId,cell}=await setupCackle(t,{characterId:'bard',contagion:false,dice:'1,1,2,19'})
 ok(await call('use_subclass_feature',{featureId:'bardic_inspiration',targetId:npcId}))
 const fact=ok(await call('record_scene_fact',{cell,description:'Ce vrai grand stress extérieur précède les dégâts environnementaux mortels.'})).worldFact
 const stress=ok(await call('record_cackle_fever_stress',{eventId:'held-before-actual-death',creatureId:npcId,factId:fact.id,reason:'Stress extérieur réel avant les dégâts.',actualGreatStressConfirmed:true}))
 const pending=ok(await call('resolve_cackle_fever_event',{eventId:stress.event.id})).pendingReaction
 assert.deepEqual(pending.roll.rolls,[1])
 await cackleRefused(call,'update_hp',{entityId:npcId,delta:-1000,reason:'Cette autre source de dégâts ne peut contourner le jet réellement tenu.',damageType:'psychic',damageOrigin:'environment'},'REACTION_PENDING')
 const freshHeld=await persistCackle(t,call,'2,19')
 const resolved=ok(await freshHeld('resolve_reaction',{pendingId:pending.id,choice:'decline'}))
 assert.deepEqual(resolved.save.roll.rolls,[1])
 ok(await freshHeld('update_hp',{entityId:npcId,delta:-1000,reason:'Dégâts environnementaux mortels réels après résolution de la fenêtre.',damageType:'psychic',damageOrigin:'environment'}))
 const state=await freshHeld('get_game_state'),event=state.dmTools.cackleFever.events[stress.event.id]
 assert.equal(state.npcs[npcId].isAlive,false);assert.equal(state.hero.pending,undefined)
 assert.deepEqual(event.result.save.roll.rolls,[1]);assert.equal(event.heldWitness,undefined)
 const fresh=await persistCackle(t,freshHeld)
 assert.equal(ok(await fresh('inspect_cackle_fever')).dueEvent,null)
 ok(await fresh('advance_time',{seconds:1}));assert.equal(ok(await fresh('roll_dice',{notation:'1d20'})).total,19)
})

test('a queued actual stress cannot be stranded by new stone; a controlled provider later preserves exactly the actual remaining crisis',async t=>{
 const {call,npcId,cell,seed}=await setupCackle(t,{contagion:false,dice:'1,1,2,19'})
 const fact=ok(await call('record_scene_fact',{cell,description:'Une vraie épreuve extérieure cause un stress distinct avant la suspension de la crise.'})).worldFact
 const stress=ok(await call('record_cackle_fever_stress',{eventId:'actual-before-stone-stress',creatureId:npcId,factId:fact.id,reason:'Grand stress réel avant suspension.',actualGreatStressConfirmed:true}))
 await cackleRefused(call,'apply_condition',{entityId:npcId,condition:'petrified'},'CACKLE_EVENT_REQUIRED')
 ok(await call('resolve_cackle_fever_event',{eventId:stress.event.id}));ok(await call('advance_time',{seconds:20}))
 const state=await call('get_game_state'),original=structuredClone(state.dmTools.afflictions.records[seed.affliction.id].cackleFever.crisis)
 // Controlled unit complement: only a temporary stone provider is initial
 // context. Actual infection, original crisis, damage and dice are public.
 state.hero.effects.push({id:'controlled-crisis-stone-provider',kind:'established-petrification',sourceId:'player',targetIds:[npcId],expiresAt:state.worldTimeSeconds+100,concentration:false,data:{condition:'petrified'}})
 ok(await call('replace_game_state',{gameState:state}));ok(await call('apply_condition',{entityId:npcId,condition:'petrified'}))
 ok(await call('advance_time',{seconds:100}))
 const resumed=await call('get_game_state'),crisis=resumed.dmTools.afflictions.records[seed.affliction.id].cackleFever.crisis
 assert.equal(crisis.endsAt,original.endsAt+100);assert.equal(crisis.suspendedSeconds,100);assert.equal(crisis.endsAt-resumed.worldTimeSeconds,40)
 const fresh=await persistCackle(t,call);ok(await fresh('advance_time',{seconds:39}))
 assert.ok((await fresh('get_game_state')).npcs[npcId].conditions.includes('incapacitated'))
 ok(await fresh('advance_time',{seconds:1}));assert.ok(!(await fresh('get_game_state')).npcs[npcId].conditions.includes('incapacitated'))
 assert.equal(ok(await fresh('roll_dice',{notation:'1d20'})).total,19)
})

test('pure immunity provenance never grants24h for an already-infected or gnome receipt without an actual successful source save',()=>{
 const{cackleCarrierImmune}=require('../mcp-server/dist/lib/cackle-fever-state.js')
 const event={kind:'contagion',targetId:'player',sourceId:'carrier',at:0,result:{success:true,immune:'already-infected'}}
 const state={worldTimeSeconds:10,dmTools:{cackleFever:{events:{event}}}}
 assert.equal(cackleCarrierImmune(state,'player','carrier'),false)
 event.result={success:true,immune:'gnome'};assert.equal(cackleCarrierImmune(state,'player','carrier'),false)
 event.result={success:true,save:{success:true},immuneUntil:86400};assert.equal(cackleCarrierImmune(state,'player','carrier'),true)
 assert.equal(cackleCarrierImmune(state,'player','other-carrier'),false)
 assert.equal(cackleCarrierImmune(state,'player','carrier',86400),false)
})

test('a genuine well-fed and hydrated long rest keeps the disease-protected exhaustion level and grants the rest normally',async t=>{
 const {call}=await symptomaticPlayer(t),state=await call('get_game_state')
 ok(await call('create_scene_object',{objectId:'actual-cackle-rest-provisions',name:'Vivres réels',description:'La ration et l’outre pleine sont physiquement présentes pour ce vrai repos.',cell:state.player.position,kind:'container',material:'wood',size:'small',resilience:'fragile',contents:['ration_1_day','waterskin_full']}))
 const supplies=ok(await call('interact_object',{objectId:'actual-cackle-rest-provisions',action:'open'})).releasedItems
 for(const item of supplies)ok(await call('pick_up_item',{itemId:item.id}))
 ok(await call('begin_nutrition_tracking',{eventId:'actual-cackle-nutrition',operation:'begin',standardNeedsConfirmed:true,hotWeather:false,source:'Besoins standards et absence de privation antérieure réellement établis.',foodDebtHalfDays:0,priorDeprivation:'none'}))
 for(const[i,item]of supplies.entries())ok(await call('consume_provisions',{eventId:'actual-cackle-intake-'+i,itemId:item.id,units:1}))
 const rest=ok(await call('take_rest',{kind:'long'})),stateAfter=await call('get_game_state')
 assert.equal(rest.exhaustionRecovery.beforeLevel,1);assert.equal(rest.exhaustionRecovery.afterLevel,1)
 assert.equal(stateAfter.dmTools.exhaustion.creatures.player.level,1)
 assert.equal(stateAfter.hero.lastLongRestAt,stateAfter.worldTimeSeconds)
 ok(await call('resolve_cackle_fever_event',{eventId:rest.cackleFeverEvent.eventId,attemptSave:false}))
 const fresh=await persistCackle(t,call)
 assert.equal(ok(await fresh('roll_dice',{notation:'1d20'})).total,19)
})
