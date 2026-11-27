// Durable external witness, written against C's confirmed interface.
// DO NOT RUN before C's final interface/build/gel signal and parent authorization.
// Stage unchanged into tests/ of an exact frozen private copy; use absolute cwd.
const test=require('node:test'),assert=require('node:assert/strict')
Object.assign(process.env,{MONETIZATION_ENABLED:'false',LLM_MODE:'mock',ALLOW_PAID_LLM:'false',APP_LOG_PERSIST_ENABLED:'false',APP_LOG_LEVEL:'error',RUNPOD_AUTO_MANAGE:'false',DM_RATE_LIMIT_PER_MINUTE:'0',LLM_MAX_CALLS_PER_REQUEST:'12'})
const{installPgMem}=require('./helpers/pg-mem.cjs'),pg=installPgMem()
const{engine,ok,adjacent}=require('./helpers/mcp-toolkit.cjs')
const{saveSession,loadSession,deleteSession}=require('../lib/session-store.ts')
const{getWeapon}=require('../mcp-server/dist/lib/srd/weapons.js')
const{copperValue,emptyCoins}=require('../mcp-server/dist/lib/srd/currency.js')
const{play,lastResult}=require('./helpers/dm-scripted-turn.cjs')
test.after(()=>pg.restore())

async function sqlIntoFreshProcess(t,call,label,dice){
 const actual=await call('get_game_state'),sessionId=`real-launcher-acquisition-${label}-${process.pid}`
 t.after(()=>deleteSession(sessionId))
 await saveSession(sessionId,{gameState:actual,history:[],adventureId:actual.adventureId,characterId:actual.characterId})
 const stored=(await loadSession(sessionId)).gameState
 assert.deepEqual(stored,actual)
 const resumed=await engine(t,{adventureId:actual.adventureId,characterId:actual.characterId,dice})
 // Faithful SQL resume only: no setup inventory/state/position injection.
 ok(await resumed('replace_game_state',{gameState:stored}))
 assert.deepEqual(await resumed('get_game_state'),actual)
 return resumed
}
test('POST lets a fresh published character publicly buy its ordinary launcher and exact ten adamantine arrows, then hits a real object and resumes the same custody/payments/shot through SQL in new engines',async t=>{
 const call=await engine(t,{adventureId:'sarah-of-yellowcrest-manor',characterId:'fighter',dice:'17,2,3,19'})
 const initial=await call('get_game_state')
 assert.equal(initial.player.ruleset,'srd2014')
 assert.ok(!initial.player.inventory.some(i=>getWeapon(i.equipmentId??i.id)?.properties.includes('ammunition')),'No launcher is initialized by this fixture')
 const initialWallet=structuredClone(initial.dmTools?.wallet??emptyCoins()),initialWalletCp=copperValue(initialWallet)
 assert.ok(Number.isSafeInteger(initialWalletCp)&&initialWalletCp>=0)
 const merchantId='public-source-launcher-merchant',merchantCell=adjacent(initial)[0]
 ok(await call('create_npc',{npcId:merchantId,name:'Vendeur réel des deux biens déjà fabriqués',statBlock:'goblin',cell:merchantCell,disposition:'neutral',visible:true,description:'Vendeur réel capable, présent avec son stock initial choisi explicitement ; aucune bourse ou transformation d’objet possédé.'}))
 // Two physical hands are freed through real equipment tools, never loadout edits.
 ok(await call('equip_item',{itemId:'longsword',operation:'unequip',slot:'main_hand'}))
 const equipped=await call('get_game_state')
 if(equipped.dmTools.loadout?.shieldId)ok(await call('equip_item',{itemId:equipped.dmTools.loadout.shieldId,operation:'unequip',slot:'shield'}))
 async function fact(description){return ok(await call('record_scene_fact',{description,cell:merchantCell})).worldFact}
 const launcherFact=await fact('Ce vendeur possède réellement dans son stock initial cet arc court ordinaire neuf, déjà fabriqué ; profil, prix et masse du PHB, aucune transformation ni propriété de matériau supplémentaire.')
 const arrowFact=await fact('Ce vendeur possède réellement ces dix flèches déjà revêtues d’adamantium comme stock initial distinct ; prix normal source plus supplément XGE, sans transformation d’un objet du personnage.')
 const launcherInput={eventId:'public-real-initial-launcher',itemId:'public-bought-ordinary-shortbow',merchantId,weaponId:'shortbow',name:'Arc court ordinaire réellement acheté',physicalFactId:launcherFact.id,actualInitialStockConfirmed:true}
 const arrowInput={eventId:'public-real-initial-adamantine-arrows',itemId:'public-bought-ten-adamantine-arrows',merchantId,name:'Dix flèches réelles déjà revêtues',kind:'ammunition',ammunitionType:'arrow',form:'coated',physicalFactId:arrowFact.id,actualInitialAdamantineStockConfirmed:true}
 const beforeStock=await call('get_game_state');let launcher,arrows
 const preparedTurn=await play(t,call,[{name:'prepare_phb_launcher_stock',input:launcherInput},params=>{launcher=ok(lastResult(params));return{name:'prepare_adamantine_stock',input:arrowInput}},params=>{arrows=ok(lastResult(params));return 'Le vendeur conserve ses deux biens déjà fabriqués ; leur préparation administrative ne te donne aucun objet ni argent.'}],'Le MJ consigne explicitement les deux stocks réels du vendeur, sans acquisition ni transformation de mes objets.')
 assert.deepEqual(preparedTurn.seen,preparedTurn.selected)
 assert.equal(launcher.priceCp,2500);assert.equal(launcher.sourceWeightLb,2)
 assert.equal(launcher.ownership,'actual_initial_merchant_stock');assert.equal(launcher.itemsAcquired,0)
 assert.equal(launcher.item.equipmentId,'shortbow');assert.equal(launcher.item.quantity,1)
 assert.equal(launcher.item.adamantine,undefined);assert.equal(launcher.item.magical,undefined);assert.equal(launcher.item.damage,undefined)
 assert.equal(arrows.priceCp,50050);assert.equal(arrows.item.quantity,10);assert.equal(arrows.item.ammunitionType,'arrow')
 let state=await call('get_game_state')
 assert.deepEqual(state.player.inventory,beforeStock.player.inventory)
 assert.equal(copperValue(state.dmTools.wallet??emptyCoins()),copperValue(beforeStock.dmTools?.wallet??emptyCoins()))
 assert.equal(copperValue(state.dmTools.merchants.earnedCoins[merchantId]??emptyCoins()),0)
 for(const id of [launcherInput.itemId,arrowInput.itemId]){
  assert.equal(state.dmTools.merchants.stocks[id].status,'available')
  assert.ok(!state.player.inventory.some(i=>i.id===id));assert.ok(!state.droppedItems?.[id])
 }
 // Finite real coin treasure; no wallet injection and no free merchant purse.
 const funding={gp:525,sp:5};assert.equal(launcher.priceCp+arrows.priceCp,52550)
 ok(await call('create_treasure',{treasureId:'public-finite-purchase-funding',name:'Pièces réelles choisies',description:'Ce trésor réel est explicitement préparé puis collecté une fois pour les deux achats exacts, sans change ou crédit implicite.',cell:state.player.position,mode:'authored',coins:funding}))
 ok(await call('collect_treasure',{treasureId:'public-finite-purchase-funding'}))
 const launcherAgreement=await fact('Le vendeur accepte réellement de remettre cet arc court précis au prix source de25po dans cette vente distincte.'),arrowAgreement=await fact('Le vendeur accepte réellement la vente distincte du lot entier des dix flèches déjà revêtues, au prix source normal plus500po, soit500po et5pa.')
 const launcherOffer={offerId:'public-shortbow-offer',merchantId,itemIds:[launcherInput.itemId],priceCp:launcher.priceCp,agreementFactId:launcherAgreement.id,actualAgreementConfirmed:true}
 const arrowOffer={offerId:'public-ten-arrows-offer',merchantId,itemIds:[arrowInput.itemId],priceCp:arrows.priceCp,agreementFactId:arrowAgreement.id,actualAgreementConfirmed:true}
 const launcherPurchase={eventId:'public-shortbow-payment',offerId:launcherOffer.offerId,paid:{gp:25},workSeconds:6,activitySource:'Remise physique réelle de cet arc précis pour les25po explicitement choisies, durée MJ de six secondes.'}
 const arrowPurchase={eventId:'public-ten-arrows-payment',offerId:arrowOffer.offerId,paid:{gp:500,sp:5},workSeconds:6,activitySource:'Remise physique réelle du lot entier distinct pour500po et5pa choisies, durée MJ de six secondes.'}
 const beforePayments=await call('get_game_state')
 const firstPurchaseTurn=await play(t,call,[{name:'create_trade_offer',input:launcherOffer},{name:'create_trade_offer',input:arrowOffer},{name:'purchase_trade_offer',input:launcherPurchase},{name:'purchase_trade_offer',input:arrowPurchase},params=>{assert.equal(lastResult(params).code,'PRIMARY_ACTION_ALREADY_RESOLVED');return 'Tu achètes cet arc réel pour les25po choisies. Le second achat demande un autre message, sans transfert ou débit anticipé.'}],'Les deux offres sont réellement acceptées ; j’achète cet arc et propose ensuite l’achat distinct du lot de flèches.')
 assert.deepEqual(firstPurchaseTurn.seen,firstPurchaseTurn.selected.slice(0,-1))
 const afterFirstPurchase=await call('get_game_state');assert.equal(afterFirstPurchase.player.inventory.filter(i=>i.id===launcherInput.itemId).length,1);assert.ok(!afterFirstPurchase.player.inventory.some(i=>i.id===arrowInput.itemId));assert.equal(copperValue(afterFirstPurchase.dmTools.wallet),initialWalletCp+50050);assert.equal(copperValue(afterFirstPurchase.dmTools.merchants.earnedCoins[merchantId]),2500);assert.equal(afterFirstPurchase.worldTimeSeconds,(beforePayments.worldTimeSeconds??0)+6)
 const secondPurchaseTurn=await play(t,call,[{name:'purchase_trade_offer',input:arrowPurchase},'Tu achètes maintenant le lot entier des dix flèches réellement revêtues pour500po et5pa, dans cette seconde transaction choisie.'],'J’effectue maintenant le second achat distinct des dix flèches déjà revêtues, selon l’offre réelle et les dénominations choisies.')
 assert.deepEqual(secondPurchaseTurn.seen,secondPurchaseTurn.selected)
 state=await call('get_game_state')
 assert.equal(state.worldTimeSeconds,(beforePayments.worldTimeSeconds??0)+12)
 assert.equal(copperValue(state.dmTools.wallet),initialWalletCp)
 assert.deepEqual(state.dmTools.wallet,initialWallet)
 assert.equal(copperValue(state.dmTools.merchants.earnedCoins[merchantId]),52550)
 for(const id of [launcherInput.itemId,arrowInput.itemId]){
  assert.equal(state.player.inventory.filter(i=>i.id===id).length,1)
  assert.equal(state.dmTools.merchants.stocks[id].status,'sold');assert.ok(!state.droppedItems?.[id])
 }
 assert.equal(state.dmTools.merchants.stocks[launcherInput.itemId].soldEventId,launcherPurchase.eventId)
 assert.equal(state.dmTools.merchants.stocks[arrowInput.itemId].soldEventId,arrowPurchase.eventId)
 // New process receives ONLY the actual SQL state after the two actual payments.
 const resumed=await sqlIntoFreshProcess(t,call,'bought','17,2,3,19')
 const beforeReplay=await resumed('get_game_state')
 ok(await resumed('prepare_phb_launcher_stock',launcherInput));ok(await resumed('prepare_adamantine_stock',arrowInput))
 assert.equal(ok(await resumed('purchase_trade_offer',launcherPurchase)).replayed,true)
 assert.equal(ok(await resumed('purchase_trade_offer',arrowPurchase)).replayed,true)
 assert.deepEqual(await resumed('get_game_state'),beforeReplay)
 const equipTurn=await play(t,resumed,[{name:'equip_item',input:{itemId:launcherInput.itemId,operation:'equip',slot:'main_hand'}},'Tu prends en main cet arc acheté ; ton autre main reste libre et ton bouclier est déjà retiré.'],'Je prends en main l’arc réellement acheté, avec les mains libérées par les outils d’équipement.');assert.deepEqual(equipTurn.seen,equipTurn.selected)
 state=await resumed('get_game_state');assert.equal(state.dmTools.loadout.mainHandId,launcherInput.itemId);assert.equal(state.dmTools.loadout.shieldId,undefined);assert.equal(state.dmTools.loadout.offHandId,undefined)
 const targetCell=adjacent(state).find(c=>c.x!==merchantCell.x||c.y!==merchantCell.y);assert.ok(targetCell,'A real unobstructed adjacent target cell distinct from the seller is required')
 const objectId='public-ranged-object'
 ok(await resumed('create_scene_object',{objectId,name:'Objet physique réel du tir',description:'Objet en bois présent dans la vraie géométrie, CA/PV imprimés et aucune immunité/résistance ou vulnérabilité ajoutée.',cell:targetCell,kind:'container',material:'wood',size:'large',resilience:'resilient'}))
 const beforeShot=await resumed('get_game_state'),shot={objectId,action:'attack',eventId:'public-real-adamantine-arrow-shot',weaponId:launcherInput.itemId,ammunitionItemId:arrowInput.itemId}
 let attack;const shotTurn=await play(t,resumed,[{name:'interact_object',input:shot},params=>{attack=ok(lastResult(params));return 'Tu tires une seule de ces flèches achetées sur cet objet réel. Le coup au but utilise ses dés source doublés par l’adamantium du projectile, sans transformer l’arc.'}],'Je tire une flèche précise du lot acheté sur cet objet réel avec mon arc acheté, selon les identifiants choisis.');assert.deepEqual(shotTurn.seen,shotTurn.selected)
 assert.equal(attack.hit,true);assert.equal(attack.criticalHit,true);assert.equal(attack.adamantineCritical,true)
 assert.deepEqual(attack.damageRoll.rolls,[2,3]);assert.ok(attack.ammunition.adamantine)
 const afterShot=await resumed('get_game_state')
 assert.equal(afterShot.player.inventory.find(i=>i.id===arrowInput.itemId).quantity,9)
 assert.equal(afterShot.player.inventory.find(i=>i.id===launcherInput.itemId).adamantine,undefined)
 assert.equal(afterShot.player.inventory.find(i=>i.id===launcherInput.itemId).equipmentId,'shortbow')
 assert.equal(Object.keys(afterShot.dmTools.ammunition.expenditures).length,1)
 assert.ok(afterShot.dmTools.objects[objectId].hp.current<beforeShot.dmTools.objects[objectId].hp.current)
 assert.equal(ok(await resumed('interact_object',shot)).replayed,true);assert.deepEqual(await resumed('get_game_state'),afterShot)
 assert.equal(ok(await resumed('roll_dice',{notation:'1d20'})).total,19)
 // A second SQL/new-process boundary retains the paid custody and exact spent shot.
 const final=await sqlIntoFreshProcess(t,resumed,'shot','19'),beforeFinalReplay=await final('get_game_state')
 ok(await final('prepare_phb_launcher_stock',launcherInput));ok(await final('prepare_adamantine_stock',arrowInput))
 ok(await final('purchase_trade_offer',launcherPurchase));ok(await final('purchase_trade_offer',arrowPurchase))
 assert.equal(ok(await final('interact_object',shot)).replayed,true)
 assert.deepEqual(await final('get_game_state'),beforeFinalReplay)
 assert.equal(ok(await final('roll_dice',{notation:'1d20'})).total,19)
})
