const test=require('node:test'),assert=require('node:assert/strict')
Object.assign(process.env,{MONETIZATION_ENABLED:'false',LLM_MODE:'mock',ALLOW_PAID_LLM:'false',APP_LOG_PERSIST_ENABLED:'false'})
const{installPgMem}=require('./helpers/pg-mem.cjs'),pg=installPgMem()
const{engine,ok,adjacent,move,toTemple,prepareAtCurrentSite,magic,scroll,hold,fact,persist}=require('./helpers/adventure-rewards-fixture.cjs')
const{spawnExact}=require('./helpers/critical-spells-fixture.cjs')
test.after(()=>pg.restore())

test('public real B2 search prepares original chapter values and unknown chime once, with SQL and reciprocal owner refusals before acquisition',async t=>{
 const call=await engine(t,{dice:'19'}),initial=await call('get_game_state')
 const catalog=ok(await call('inspect_adventure_rewards'));assert.equal(catalog.confidential,true)
 assert.deepEqual(await call('get_game_state'),initial)
 const wrong=await prepareAtCurrentSite(call,'arcane_study'),before=await call('get_game_state')
 assert.equal((await call('prepare_adventure_reward',wrong)).code,'REWARD_SOURCE_LOCATION_REQUIRED');assert.deepEqual(await call('get_game_state'),before)
 await toTemple(call);await move(call,'18');await move(call,'19')
 const input=await prepareAtCurrentSite(call,'arcane_study'),prepared=ok(await call('prepare_adventure_reward',input)),s=await call('get_game_state')
 assert.equal(prepared.outputIds.length,3);assert.equal(s.dmTools.magicItems['arcane_study:magic:0'].identified,false)
 assert.deepEqual(s.dmTools.wallet,initial.dmTools.wallet);assert.equal(s.dmTools.valuables['arcane_study:art:0:0'].valueGp,125)
 assert.equal(s.dmTools.valuables['arcane_study:art:0:1'].source.book,'candlekeep-mysteries')
 const next=await persist(t,call),round=await next('get_game_state'),bad=structuredClone(round);delete bad.dmTools.adventureRewards
 assert.equal((await next('replace_game_state',{gameState:bad})).code,'ADVENTURE_REWARD_STATE_MISMATCH');assert.deepEqual(await next('get_game_state'),round)
 for(const itemId of prepared.outputIds)ok(await next('pick_up_item',{itemId}))
 const owned=await next('get_game_state');assert.ok(owned.player.inventory.some(i=>i.id==='arcane_study:magic:0'))
 assert.equal(ok(await next('prepare_adventure_reward',input)).replayed,true);assert.deepEqual(await next('get_game_state'),owned)
 assert.equal(ok(await next('roll_dice',{notation:'1d20'})).total,19)
})

test('public B8 search preserves victim ownership and cannot create115gp or player items through generic search or enemy-body release',async t=>{
 const call=await engine(t,{dice:'19'});await toTemple(call);await move(call,'18');await move(call,'21');await move(call,'24');await move(call,'25')
 const input=await prepareAtCurrentSite(call,'prisoner_effects'),before=await call('get_game_state')
 assert.equal((await call('prepare_adventure_reward',input)).code,'REWARD_PROPERTY_RELEASE_REQUIRED')
 assert.deepEqual(await call('get_game_state'),before)
 const wrong={...input,release:{kind:'physical_helpless_body_search',factId:input.searchFactId,actualTransferConfirmed:true,reason:'Une fouille des coffres ne transfère pas les droits des victimes.'}}
 assert.equal((await call('prepare_adventure_reward',wrong)).code,'REWARD_VICTIM_PROPERTY_REQUIRED')
 assert.deepEqual(await call('get_game_state'),before);assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('public Chime opens one real lock then its box, retains ten actual uses across SQL and never recharges or pays twice',async t=>{
 let call=await engine(t,{dice:'19'});await magic(call,'chime_of_opening','real-chime');await hold(call,'real-chime')
 const s=await call('get_game_state'),cell=s.player.position
 ok(await call('create_scene_object',{objectId:'real-chime-box',name:'Coffre réel',description:'Coffre à une serrure mécanique réellement qualifiée.',cell,kind:'container',material:'iron',size:'small',resilience:'resilient',locked:true,lockDc:15,contents:[]}))
 const f=await fact(call,'Le son clair de ce carillon peut réellement atteindre ce seul coffre et sa serrure à cette cellule, sans silence ni barrière acoustique.',cell)
 const input=n=>({eventId:'real-chime-use-'+n,itemId:'real-chime',objectId:'real-chime-box',soundFactId:f.id,actualSoundReachesTarget:true,actualSingleLockStateConfirmed:true})
 const first=ok(await call('use_chime_of_opening',input(1)));assert.equal(first.unlocked,true);assert.equal(first.object.state,'closed')
 call=await persist(t,call)
 for(let n=2;n<=10;n++){
  const current=await call('get_game_state');if(current.dmTools.objects['real-chime-box'].state==='open')ok(await call('interact_object',{objectId:'real-chime-box',action:'close'}))
  assert.equal(ok(await call('use_chime_of_opening',input(n))).opened,true)
 }
 const spent=await call('get_game_state');assert.equal(spent.dmTools.magicItems['real-chime'].charges,0)
 assert.equal(Object.keys(spent.dmTools.chargedItems.events).length,10)
 assert.equal((await call('use_chime_of_opening',input(11))).code,'CHIME_USE_EXHAUSTED');assert.deepEqual(await call('get_game_state'),spent)
 assert.equal(ok(await call('use_chime_of_opening',input(1))).replayed,true);assert.deepEqual(await call('get_game_state'),spent)
 ok(await call('advance_time',{seconds:86400,reason:'Une vraie journée entière passe sans utilisation ni réparation du carillon.'}))
 assert.equal((await call('get_game_state')).dmTools.magicItems['real-chime'].charges,0)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('public robe uses an actual Bardic grant and held WIS die across SQL, excludes wearer by convention and retains initiative through real next-turn end',async t=>{
 let call=await engine(t,{characterId:'bard',dice:'20,1,8'});await toTemple(call);await move(call,'18');await move(call,'19');await magic(call,'robe_of_scintillating_colors','real-robe')
 ok(await call('attune_magic_item',{itemId:'real-robe',operation:'attune'}));ok(await call('wear_magic_item',{itemId:'real-robe',operation:'wear'}))
 const s=await call('get_game_state'),cell=adjacent(s)[0]
 ok(await call('create_npc',{npcId:'actual-robe-ally',name:'Allié actuel',statBlock:'commoner',cell,visible:true,disposition:'helpful',description:'Un véritable individu allié qui entend le barde ; aucune réserve synthétique.'}))
 ok(await call('use_subclass_feature',{featureId:'bardic_inspiration',targetId:'actual-robe-ally'}))
 const granted=await call('get_game_state');assert.equal(granted.hero.inspiration[0].targetId,'actual-robe-ally')
 ok(await call('enter_combat',{combatants:['player','actual-robe-ally']}));assert.equal((await call('get_game_state')).currentTurn,'player')
 const input={eventId:'actual-robe-activation',itemId:'real-robe'},a=ok(await call('activate_scintillating_robe',input))
 assert.ok(a.pendingReaction);const held=await call('get_game_state'),event=held.dmTools.chargedItems.events[input.eventId]
 assert.equal(event.targetIds.includes('player'),false);assert.equal(event.policy.wearer,'excluded_by_explicit_user_convention')
 assert.equal(held.hero.pending.roll.rolls[0],8);assert.equal(held.dmTools.magicItems['real-robe'].charges,2)
 // Negative clones only: no positive reserve/pending/physical state is fabricated.
 for(const mutate of [bad=>{delete bad.dmTools.chargedItems},bad=>{bad.dmTools.chargedItems.events[input.eventId].targetIds=[]},bad=>{bad.dmTools.magicItems['real-robe'].charges=4}]){
  const bad=structuredClone(held);mutate(bad);assert.equal((await call('replace_game_state',{gameState:bad})).code,'CHARGED_ITEM_STATE_MISMATCH');assert.deepEqual(await call('get_game_state'),held)
 }
 assert.equal((await call('update_hp',{entityId:'actual-robe-ally',delta:-1,reason:'Tentative externe refusée avant de changer le vrai corps du jet tenu.'})).code,'REACTION_PENDING');assert.deepEqual(await call('get_game_state'),held)
 call=await persist(t,call,'8,20,1,19')
 ok(await call('resolve_reaction',{pendingId:held.hero.pending.id,choice:'bardic_inspiration'}))
 let current=await call('get_game_state');assert.equal(current.dmTools.chargedItems.events[input.eventId].saves[0].result.roll.total,16)
 assert.equal(current.hero.inspiration.length,0);assert.equal(current.monsters['actual-robe-ally'].conditions.includes('stunned'),false)
 const before=await call('get_game_state');assert.equal((await call('end_combat',{force:true})).code,'ROBE_NEXT_TURN_END_REQUIRED');assert.deepEqual(await call('get_game_state'),before)
 ok(await call('next_turn',{actorId:'player'}));assert.equal((await call('get_game_state')).currentTurn,'actual-robe-ally')
 const attack=ok(await call('resolve_monster_action',{monsterId:'actual-robe-ally',targetId:'player',actionName:'Club'}))
 if(attack.pendingReaction)ok(await call('resolve_reaction',{pendingId:attack.pendingReaction.id,choice:'decline'}))
 const afterAttack=await call('get_game_state');assert.equal(afterAttack.player.hp.current,before.player.hp.current)
 ok(await call('next_turn',{actorId:'actual-robe-ally'}));ok(await call('next_turn',{actorId:'player',skipAction:true}))
 current=await call('get_game_state');assert.equal(current.dmTools.chargedItems.events[input.eventId].status,'ended')
 assert.ok(!current.hero.effects.some(e=>e.data.eventId===input.eventId));ok(await call('end_combat',{force:true}))
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('public exact held Counterspell scroll uses the actual observed reaction window with no prepared spell or user slot and resumes the original caster once through SQL',async t=>{
 let call=await engine(t,{characterId:'wizard',dice:'1,20,19'})
 ok(await call('prepare_spells',{spellIds:['mage-armor','magic-missile']}));await scroll(call,'counterspell','actual-counterspell-scroll');await hold(call,'actual-counterspell-scroll')
 const mage=await spawnExact(call,'mage');ok(await call('enter_combat',{combatants:['player',mage.id]}));assert.equal((await call('get_game_state')).currentTurn,mage.id)
 const cast=ok(await call('cast_creature_spell',{casterId:mage.id,spellId:'magic-missile',targetId:'player',spellObservers:[{observerId:'player',channels:['sight']}]}))
 assert.ok(cast.pendingReaction.options.includes('counterspell'));const before=await call('get_game_state');assert.ok(!before.player.knownSpells.includes('counterspell'))
 call=await persist(t,call)
 const answer=ok(await call('resolve_reaction',{pendingId:before.hero.pending.id,choice:'counterspell',scrollItemId:'actual-counterspell-scroll'}));assert.equal(answer.countered,true)
 const after=await call('get_game_state');assert.deepEqual(after.player.spellSlots,before.player.spellSlots);assert.equal(after.player.hp.current,before.player.hp.current)
 assert.equal(after.hero.reactionsUsed.player,true);assert.equal(after.dmTools.spellScrolls['actual-counterspell-scroll'].status,'consumed')
 assert.ok(!after.player.inventory.some(i=>i.id==='actual-counterspell-scroll'))
 assert.ok((await call('resolve_reaction',{pendingId:before.hero.pending.id,choice:'counterspell',scrollItemId:'actual-counterspell-scroll'})).error);assert.deepEqual(await call('get_game_state'),after)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('public actual wearer death and SQL retain only its acquired passive initiative endpoint, never startHeroTurn resources or resurrection',async t=>{
 let call=await engine(t,{characterId:'fighter',dice:'20,1,1,19'});await toTemple(call);await move(call,'18');await move(call,'19');await magic(call,'robe_of_scintillating_colors','death-boundary-robe')
 ok(await call('attune_magic_item',{itemId:'death-boundary-robe',operation:'attune'}));ok(await call('wear_magic_item',{itemId:'death-boundary-robe',operation:'wear'}))
 const enemy=await spawnExact(call,'goblin');ok(await call('enter_combat',{combatants:['player',enemy.id]}))
 ok(await call('activate_scintillating_robe',{eventId:'real-predeath-activation',itemId:'death-boundary-robe'}))
 ok(await call('update_hp',{entityId:'player',delta:-1000,damageType:'force',damageOrigin:'environment',reason:'Le MJ établit ce dégât environnemental fatal réel ; aucun état de mort ou ressource n’est injecté.'}))
 const dead=await call('get_game_state');assert.equal(dead.player.deathSaves.dead,true);assert.equal(dead.player.hp.current,0)
 call=await persist(t,call)
 const before=await call('get_game_state');assert.equal((await call('end_combat',{force:true})).code,'ROBE_NEXT_TURN_END_REQUIRED');assert.deepEqual(await call('get_game_state'),before)
 ok(await call('next_turn',{actorId:'player',skipAction:true}))
 let current=await call('get_game_state');assert.equal(current.currentTurn,enemy.id)
 ok(await call('next_turn',{actorId:enemy.id,skipAction:true}))
 current=await call('get_game_state');assert.equal(current.currentTurn,'player');assert.equal(current.player.deathSaves.dead,true)
 assert.equal(current.hero.turnStarted.player,dead.hero.turnStarted.player);assert.equal(current.hero.actionCredits,dead.hero.actionCredits)
 assert.deepEqual(current.player.resources,dead.player.resources);assert.equal(current.hero.reactionsUsed.player,dead.hero.reactionsUsed.player)
 ok(await call('next_turn',{actorId:'player',skipAction:true}))
 current=await call('get_game_state');assert.equal(current.dmTools.chargedItems.events['real-predeath-activation'].status,'ended')
 assert.ok(!current.hero.effects.some(e=>e.data.eventId==='real-predeath-activation'));assert.equal(current.player.deathSaves.dead,true)
 ok(await call('end_combat',{force:true}));assert.equal((await call('get_game_state')).phase,'exploration')
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('public real seventh-level Teleport scroll is acquired and class-read while unsupported casting refuses before any cost or consumption across SQL',async t=>{
 let call=await engine(t,{characterId:'wizard',dice:'19'});await scroll(call,'teleport','actual-teleport-scroll')
 assert.equal(ok(await call('inspect_spell_scrolls',{itemId:'actual-teleport-scroll'})).spellId,undefined)
 const read=ok(await call('read_spell_scroll',{itemId:'actual-teleport-scroll'}));assert.equal(read.item.level,7);assert.equal(read.item.dc,18);assert.equal(read.item.castSupported,false)
 call=await persist(t,call);const before=await call('get_game_state')
 assert.equal((await call('use_spell_scroll',{itemId:'actual-teleport-scroll',targetId:'player'})).code,'TELEPORT_SCROLL_CAST_UNSUPPORTED')
 assert.deepEqual(await call('get_game_state'),before);assert.equal(before.dmTools.spellScrolls['actual-teleport-scroll'].status,'active')
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})


test('public real nonlethal chapter victory exposes only the actual Viallis body property, retains its source through SQL and never materializes a closure snapshot',async t=>{
 const{startSarah,knockoutSarahOpponents}=require('./helpers/campaign-outcome-fixture.cjs')
 let{call}=await startSarah(t,{playerCell:{x:24,y:20},dice:'20,1,1,20,8,8,20,8,8,1,20,8,8,1,19'})
 const ids=await knockoutSarahOpponents(call),ended=ok(await call('end_combat',{}))
 ok(await call('record_campaign_outcome',{eventId:'rewards-real-viallis-victory',closureId:ended.campaignClosures[0].closureId,result:'victory',reason:'The two actual source opponents have been defeated nonlethally; their actual bodies remain here.'}))
 const body=(await call('get_game_state')).monsters[ids.mageId]
 assert.equal(body.hp.current,0);assert.equal(body.isAlive,true)
 // Pure negative clones only. No flight/support or successful imported state is fabricated.
 const{authoredRewardOwnerHeightIssue}=require('../mcp-server/dist/lib/adventure-reward-state.js')
 const grounded=await call('get_game_state');assert.equal(authoredRewardOwnerHeightIssue(grounded,body.id),null)
 for(const heightFeet of [10,null]){
  const bad=structuredClone(grounded);bad.dmTools.weather??={};bad.dmTools.weather.flights??={}
  bad.dmTools.weather.flights[body.id]={entityId:body.id,mapId:grounded.currentMapId,airborne:true,heightFeet,revision:1}
  assert.equal(authoredRewardOwnerHeightIssue(bad,body.id).code,'REWARD_OWNER_HEIGHT_UNSUPPORTED')
 }
 assert.deepEqual(await call('get_game_state'),grounded)

 // The body occupies its actual cell; the player remains adjacent after the real combat.
 assert.ok(Math.max(Math.abs((await call('get_game_state')).player.position.x-body.position.x),Math.abs((await call('get_game_state')).player.position.y-body.position.y))<=1)
 const f=await fact(call,'The MJ establishes the actual accessible helpless body search and physical release of Viallis carried property here; no closure snapshot is a body.',body.position)
 const input={rewardId:'viallis_personal',cell:body.position,searchFactId:f.id,actualSearchAndContentsAccessConfirmed:true,release:{kind:'physical_helpless_body_search',factId:f.id,actualTransferConfirmed:true,reason:'Actual retained helpless source owner searched at his present physical cell.'}}
 const before=await call('get_game_state'),r=ok(await call('prepare_adventure_reward',input)),prepared=await call('get_game_state')
 assert.equal(r.outputIds.length,2);assert.deepEqual(prepared.player,before.player)
 assert.equal(prepared.dmTools.magicItems['viallis_personal:magic:0'].templateId,'robe_of_scintillating_colors')
 assert.equal(prepared.dmTools.spellScrolls['viallis_personal:scroll:1'].spellId,'teleport')
 assert.equal(JSON.parse(prepared.dmTools.adventureRewards.receipts.viallis_personal.bodyWitness).body.id,ids.mageId)
 call=await persist(t,call)
 for(const itemId of r.outputIds)ok(await call('pick_up_item',{itemId}))
 const owned=await call('get_game_state');assert.equal(ok(await call('prepare_adventure_reward',input)).replayed,true)
 assert.deepEqual(await call('get_game_state'),owned)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})

test('public real B6 collection has original300gp value, requires actual discerning acceptance and never pays from an absent merchant purse',async t=>{
 let call=await engine(t,{dice:'19'});await toTemple(call);await move(call,'18');await move(call,'21');await move(call,'23')
 const input=await prepareAtCurrentSite(call,'cult_library'),r=ok(await call('prepare_adventure_reward',input));ok(await call('pick_up_item',{itemId:r.outputIds[0]}))
 const s=await call('get_game_state'),cell=adjacent(s)[0];ok(await call('create_npc',{npcId:'real-collection-buyer',name:'Acheteur actuel',statBlock:'commoner',cell,visible:true,disposition:'neutral',description:'Un véritable interlocuteur examine cette collection ; aucune bourse ni acceptation implicite.'}))
 const f=await fact(call,'The MJ establishes the actual discerning buyer inspection, unchanged original source collection and explicit agreement to its full300gp printed value.',cell)
 const offer={offerId:'actual-source-collection-offer',merchantId:'real-collection-buyer',valuables:[{itemId:r.outputIds[0],registeredKind:'collection',physicalFactId:f.id,actualRegisteredIdentityAndValueConfirmed:true,materialStateUnchangedConfirmed:true}],priceCp:30000,agreementFactId:f.id,actualMerchantAcceptanceConfirmed:true}
 const before=await call('get_game_state');assert.ok((await call('create_valuable_resale_offer',offer)).error);assert.deepEqual(await call('get_game_state'),before)
 ok(await call('equip_item',{itemId:'longsword',slot:'main_hand',operation:'unequip'}))
 ok(await call('create_valuable_resale_offer',{...offer,actualDiscerningPurchaserConfirmed:true}));call=await persist(t,call)
 const accepted=await call('get_game_state'),sale=await call('sell_to_merchant',{eventId:'actual-collection-sale-unfunded',offerId:offer.offerId,received:{gp:300},workSeconds:6,activitySource:'Proposed actual exchange requires existing real merchant denominations; none are invented.'})
 assert.equal(sale.code,'INSUFFICIENT_COINS');assert.deepEqual(await call('get_game_state'),accepted)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
