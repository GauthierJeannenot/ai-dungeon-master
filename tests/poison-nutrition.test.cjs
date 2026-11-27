const test=require('node:test'),assert=require('node:assert/strict')
const {fixture,ok,refused}=require('./helpers/ammunition-fixture.cjs')
const gs=require('../mcp-server/dist/mcp-server/game-state.js')
async function setup(t,{template='assassins_blood',dice='1,5,19'}={}){
 const f=await fixture(t,{weapon:'longsword',quantity:null,startBattle:false,dice}),callbacks={},server={tool(n,d,s,fn){callbacks[n]=v=>fn(require('zod').z.object(s).parse(v))},registerTool(n,c,fn){callbacks[n]=v=>fn((typeof c.inputSchema?.parse==='function'?c.inputSchema:require('zod').z.object(c.inputSchema)).parse(v))}}
 for(const[module,method]of [['player-poison','registerPlayerPoisonTools'],['poison-nutrition','registerPoisonNutritionTools'],['foraging','registerForagingTools'],['water-sources','registerWaterSourcesTools'],['survival','registerSurvivalTools']])require(`../mcp-server/dist/mcp-server/tools/${module}-tools.js`)[method](server)
 const original=f.call;f.call=async(n,input={})=>callbacks[n]?JSON.parse((await callbacks[n](input)).content[0].text):original(n,input)
 gs.getPlayer().inventory.push({id:'actual-dose',equipmentId:'poison_'+template,name:'Dose physique rÃ©elle',type:'misc'},{id:'actual-ration',equipmentId:'ration_1_day',name:'Ration physique de deux livres',type:'misc'})
 ok(await f.call('begin_nutrition_tracking',{eventId:'actual-nutrition',operation:'begin',standardNeedsConfirmed:true,hotWeather:false,source:'Besoins et historique rÃ©ellement Ã©tablis par le MJ.',foodDebtHalfDays:0,priorDeprivation:'none'}));return f
}
async function fact(f,text='Composition et portion physique rÃ©ellement observÃ©es par le MJ.'){return ok(await f.call('record_scene_fact',{description:text,cell:{...gs.getPlayer().position}})).worldFact.id}
async function coat(f,itemId='actual-ration',eventId='actual-preparation',doseItemId='actual-dose'){return ok(await f.call('prepare_player_poison',{eventId,doseItemId,surfaceKind:'item',surfaceId:itemId,physicalFactId:await fact(f),foodOrLiquidConfirmed:true,surfaceDescription:'La dose entiÃ¨re dans cette quantitÃ© physique exactement suivie.'}))}
async function vessel(f,itemId,contents){gs.getPlayer().inventory.push({id:itemId,equipmentId:contents?'waterskin_full':'waterskin_empty',name:'Outre physique rÃ©elle',type:'misc'});ok(await f.call('register_water_container',{eventId:'container-'+itemId,itemId,containerType:'waterskin',actualContainerConfirmed:true,contentsQuarterPints:contents,dryWeightLb:1,waterWeightLbPerPint:1,hazardFactIds:[],source:'RÃ©cipient rÃ©el et quantitÃ© existante explicitement Ã©tablis.'}))}
async function disposition(f,{eventId='actual-disposition',preparationId='actual-preparation',sourceItemId='actual-ration',operation='consume',operationEventId='actual-meal',selectedUnits=1,where='remainder',targetItemId}={}){return ok(await f.call('adjudicate_poison_portion',{eventId,preparationId,sourceItemId,operation,operationEventId,selectedUnits,disposition:where,physicalFactId:await fact(f),wholeDoseDispositionConfirmed:true,source:'Le MJ Ã©tablit explicitement oÃ¹ se trouve la dose entiÃ¨re dans les portions rÃ©ellement existantes ; aucune dilution ni puissance fractionnÃ©e.',...targetItemId?{targetItemId}:{}}))}
const transfer=(extra={})=>({eventId:'actual-pour',sourceItemId:'source-water',targetItemId:'target-water',quarterPints:4,seconds:10,cost:'action',handsRequired:1,objectsManipulated:2,restActivity:'light',adjudication:'Temps, mains et vraie manipulation de ces deux rÃ©cipients Ã©tablis par le MJ.',...extra})

test('a whole actual poisoned ration debits its four half-pounds once before the source CON and never invents extra nutrition or another dose',async t=>{
 const f=await setup(t);ok(await coat(f));assert.equal(gs.getState().dmTools.poisonNutrition.resources['actual-preparation'].units,4)
 const a=ok(await f.call('consume_provisions',{eventId:'actual-meal',itemId:'actual-ration',units:4}));assert.equal(a.playerPoison.save.dc,10);assert.equal(a.poisonDamageDealt,5);assert.equal(gs.getState().dmTools.survival.day.foodHalfPounds,4);assert.equal(gs.getPlayer().inventory.some(item=>item.id==='actual-ration'),false)
 gs.replaceState(structuredClone(gs.getState()));const before=structuredClone(gs.getState());assert.equal(ok(await f.call('consume_provisions',{eventId:'actual-meal',itemId:'actual-ration',units:4})).replayed,true);assert.deepEqual(gs.getState(),before);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})

test('a partial meal refuses before debit or CON without a whole-dose ruling, then consumes an explicitly clean portion while preserving the entire dose in the true remainder',async t=>{
 const f=await setup(t);ok(await coat(f));await refused(f,'consume_provisions',{eventId:'actual-meal',itemId:'actual-ration',units:1},'POISON_WHOLE_DOSE_DISPOSITION_REQUIRED')
 await disposition(f);const a=ok(await f.call('consume_provisions',{eventId:'actual-meal',itemId:'actual-ration',units:1,poisonPortionAdjudicationId:'actual-disposition'}));assert.equal(a.wholePoisonDoseRetained,true);assert.equal(a.playerPoison,undefined);assert.equal(gs.getState().dmTools.poisonNutrition.resources['actual-preparation'].units,3);assert.equal(gs.getState().dmTools.survival.provisions['actual-ration'].remainingUnits,3)
 const b=ok(await f.call('consume_provisions',{eventId:'actual-rest-meal',itemId:'actual-ration',units:3}));assert.equal(b.poisonDamageDealt,5);assert.equal(gs.getState().dmTools.survival.day.foodHalfPounds,4);assert.equal(Object.keys(gs.getState().dmTools.playerPoisons.deliveries).length,1);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})

test('an explicitly whole dose in a selected real food portion keeps the one paid ingestion through a held CON, hydration and exact retries',async t=>{
 const f=await setup(t,{dice:'2,1,5,19'});ok(await coat(f));await disposition(f,{where:'selected_portion'});gs.getState().hero.inspiration.push({targetId:'player',die:8,expiresAt:600})
 const input={eventId:'actual-meal',itemId:'actual-ration',units:1,poisonPortionAdjudicationId:'actual-disposition'},a=ok(await f.call('consume_provisions',input));assert.ok(a.pendingReaction);assert.equal(gs.getState().dmTools.survival.day.foodHalfPounds,1);assert.equal(gs.getState().dmTools.survival.provisions['actual-ration'].remainingUnits,3);gs.replaceState(structuredClone(gs.getState()))
 const before=structuredClone(gs.getState());assert.equal(ok(await f.call('consume_provisions',input)).replayed,true);assert.deepEqual(gs.getState(),before);const b=ok(await f.call('resolve_reaction',{pendingId:a.pendingReaction.id,choice:'bardic_inspiration'}));assert.equal(b.poisonDamageDealt,5);assert.equal(b.ingestionPending,false);assert.equal(gs.getState().dmTools.survival.day.foodHalfPounds,1);assert.equal(ok(await f.call('consume_provisions',input)).poisonDamageDealt,5);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})

test('the same entire dose follows an explicitly chosen real partial water transfer, leaving no poison on the clean source or a second copy',async t=>{
 const f=await setup(t);await vessel(f,'source-water',8);await vessel(f,'target-water',0);await coat(f,'source-water')
 await refused(f,'transfer_water',transfer(),'POISON_WHOLE_DOSE_DISPOSITION_REQUIRED');await disposition(f,{sourceItemId:'source-water',operation:'transfer',operationEventId:'actual-pour',targetItemId:'target-water',selectedUnits:4,where:'selected_portion'})
 const a=ok(await f.call('transfer_water',transfer({poisonPortionAdjudicationId:'actual-disposition'})));assert.equal(a.elapsedSeconds,10);assert.equal(gs.getState().dmTools.poisonNutrition.resources['actual-preparation'].itemId,'target-water');assert.equal(gs.getState().dmTools.poisonNutrition.resources['actual-preparation'].units,4);gs.replaceState(structuredClone(gs.getState()))
 const clean=ok(await f.call('consume_provisions',{eventId:'actual-clean-drink',itemId:'source-water',units:1}));assert.equal(clean.playerPoison,undefined);const poisoned=ok(await f.call('consume_provisions',{eventId:'actual-poison-drink',itemId:'target-water',units:1}));assert.equal(poisoned.poisonDamageDealt,5);assert.equal(gs.getState().dmTools.survival.day.waterPints,2);assert.equal(Object.keys(gs.getState().dmTools.playerPoisons.deliveries).length,1);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})

test('adding real clean water conserves one whole poison dose without dilution, and the now larger actual volume must still supply a true whole-dose ingestion',async t=>{
 const f=await setup(t);await vessel(f,'source-water',4);await vessel(f,'target-water',4);await coat(f,'target-water');ok(await f.call('transfer_water',transfer()))
 assert.equal(gs.getState().dmTools.poisonNutrition.resources['actual-preparation'].units,8);await refused(f,'consume_provisions',{eventId:'unsupported-half-dose',itemId:'target-water',units:1},'POISON_WHOLE_DOSE_DISPOSITION_REQUIRED')
 const a=ok(await f.call('consume_provisions',{eventId:'actual-whole-drink',itemId:'target-water',units:2}));assert.equal(a.playerPoison.save.dc,10);assert.equal(a.playerPoison.damageRoll.notation,'1d12');assert.equal(a.poisonDamageDealt,5);assert.equal(gs.getState().dmTools.survival.day.waterPints,2);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})

test('a true Midnight Tears drink requires the established next midnight before water debit, then preserves its delayed effect without an immediate die',async t=>{
 const f=await setup(t,{template:'midnight_tears',dice:'19'});await vessel(f,'actual-water',4);await coat(f,'actual-water');await refused(f,'consume_provisions',{eventId:'actual-drink',itemId:'actual-water',units:1},'MIDNIGHT_TIMESTAMP_REQUIRED')
 const a=ok(await f.call('consume_provisions',{eventId:'actual-drink',itemId:'actual-water',units:1,midnightAt:3600}));assert.equal(a.playerPoison.delayedUntil,3600);assert.equal(gs.getState().dmTools.foraging.containers['actual-water'].contentsQuarterPints,0);assert.equal(gs.getState().dmTools.survival.day.waterPints,1);assert.equal(gs.getState().dmTools.playerPoisons.preparations['actual-preparation'].status,'delivered');assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})

test('two actual active doses cannot be silently mixed, and an empty real vessel cannot be contaminated as invented liquid',async t=>{
 const f=await setup(t,{dice:'19'});await vessel(f,'source-water',4);await vessel(f,'target-water',4);await vessel(f,'empty-water',0);await coat(f,'source-water');gs.getPlayer().inventory.push({id:'second-dose',equipmentId:'poison_assassins_blood',name:'Autre dose rÃ©ellement prÃ©sente',type:'misc'});await coat(f,'target-water','second-preparation','second-dose')
 await refused(f,'transfer_water',transfer(),'POISON_TWO_DOSE_MIXTURE_UNSUPPORTED');gs.getPlayer().inventory.push({id:'third-dose',equipmentId:'poison_assassins_blood',name:'Autre dose rÃ©ellement prÃ©sente',type:'misc'});const physicalFactId=await fact(f);await refused(f,'prepare_player_poison',{eventId:'empty-prep',doseItemId:'third-dose',surfaceKind:'item',surfaceId:'empty-water',physicalFactId,foodOrLiquidConfirmed:true,surfaceDescription:'Pas de liquide rÃ©el disponible.'},'POISON_ACTUAL_FOOD_WATER_REQUIRED');assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})


test('a true finite-source fill increases the same poisoned container volume without neutralizing or duplicating its one actual dose',async t=>{
 const f=await setup(t);await vessel(f,'target-water',4);await coat(f,'target-water');ok(await f.call('create_scene_object',{objectId:'actual-source',name:'Eau réellement présente',description:'Réserve réelle de quatre quarts de pinte.',cell:{...gs.getPlayer().position},kind:'lever',material:'stone',size:'small',resilience:'resilient'}));const establishedFactId=await fact(f)
 ok(await f.call('establish_water_source',{eventId:'actual-water-source',objectId:'actual-source',establishedFactId,actualWaterSourceConfirmed:true,kind:'finite',quantityQuarterPints:4,waterWeightLbPerPint:1,hazardFactIds:[],source:'Quatre quarts de pinte physiquement présents.'}))
 ok(await f.call('fill_water_container',{eventId:'actual-fill',objectId:'actual-source',targetItemId:'target-water',quarterPints:4,seconds:10,cost:'action',handsRequired:1,objectsManipulated:1,restActivity:'light',adjudication:'Vrai remplissage mesuré de ce récipient existant.'}));assert.equal(gs.getState().dmTools.waterSources.sources['actual-source'].remainingQuarterPints,0);assert.equal(gs.getState().dmTools.poisonNutrition.resources['actual-preparation'].units,8)
 const a=ok(await f.call('consume_provisions',{eventId:'actual-drink',itemId:'target-water',units:2}));assert.equal(a.poisonDamageDealt,5);assert.equal(Object.keys(gs.getState().dmTools.playerPoisons.deliveries).length,1);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})

test('a recorded ruling cannot be reused for another event or silently retained after its exact actual volume changes',async t=>{
 const f=await setup(t,{dice:'19'});await vessel(f,'source-water',4);await vessel(f,'target-water',8);await coat(f,'target-water');await disposition(f,{sourceItemId:'target-water',operationEventId:'original-drink',selectedUnits:4,where:'remainder'})
 await refused(f,'consume_provisions',{eventId:'other-drink',itemId:'target-water',units:1,poisonPortionAdjudicationId:'actual-disposition'},'POISON_PORTION_CONTEXT_CHANGED')
 ok(await f.call('transfer_water',transfer()));await refused(f,'consume_provisions',{eventId:'original-drink',itemId:'target-water',units:1,poisonPortionAdjudicationId:'actual-disposition'},'POISON_PORTION_CONTEXT_CHANGED');assert.equal(gs.getState().dmTools.poisonNutrition.adjudications['actual-disposition'].usedBy,undefined);assert.equal(gs.getState().dmTools.survival.day.waterPints,0);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})

test('the scene-only ingestion tool cannot deliver a tracked dose while leaving its nutrition undepleted, and poisoned washing water is not silently disposed',async t=>{
 const f=await setup(t,{dice:'19'});await coat(f);const physicalFactId=await fact(f)
 await refused(f,'expose_player_poison',{eventId:'bypass',preparationId:'actual-preparation',targetId:'player',physicalFactId,entireDoseSwallowedConfirmed:true},'POISON_TRACKED_INGESTION_REQUIRED')
 await vessel(f,'poisoned-water',4);gs.getPlayer().inventory.push({id:'water-dose',equipmentId:'poison_assassins_blood',name:'Dose réelle pour cette eau',type:'misc'},{id:'contact-dose',equipmentId:'poison_oil_of_taggit',name:'Dose réelle pour la lame',type:'misc'});await coat(f,'poisoned-water','water-preparation','water-dose')
 ok(await f.call('prepare_player_poison',{eventId:'contact-preparation',doseItemId:'contact-dose',surfaceKind:'weapon',surfaceId:'longsword',physicalFactId, surfaceDescription:'La surface physique de la lame reçoit cette dose réelle.'}))
 await refused(f,'wash_player_poison',{eventId:'bad-wash',preparationId:'contact-preparation',waterContainerItemId:'poisoned-water',quarterPints:1,physicalFactId,completeWashingConfirmed:true,adjudication:'Le lavage ne peut effacer la dose ingérée déjà dans cette eau.'},'POISON_WASHING_RESOURCE_CONTAMINATED');assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})


test('a whole ingested water dose cannot overwrite a different real contact coating on the receiving item surface',async t=>{
 const f=await setup(t,{dice:'19'});await vessel(f,'source-water',4);await vessel(f,'target-water',4);await coat(f,'source-water');gs.getPlayer().inventory.push({id:'contact-dose',equipmentId:'poison_oil_of_taggit',name:'Dose de contact physique réelle',type:'misc'})
 ok(await f.call('prepare_player_poison',{eventId:'outer-contact',doseItemId:'contact-dose',surfaceKind:'item',surfaceId:'target-water',physicalFactId:await fact(f,'La partie extérieure réellement touchable de cette outre est enduite.'),surfaceDescription:'Dose sur la vraie surface extérieure, pas dans le liquide.'}))
 await refused(f,'transfer_water',transfer(),'POISON_CONTAINER_SURFACE_OCCUPIED');assert.equal(gs.getState().dmTools.playerPoisons.preparations['outer-contact'].status,'active');assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})

test('declaring a water ledger cannot erase a pre-existing actual object contamination or invent a safe finite source',async t=>{
 const f=await setup(t,{dice:'19'});ok(await f.call('create_scene_object',{objectId:'actual-source',name:'Bassin physique réel',description:'Le vrai liquide de ce bassin de scène n’a pas encore son registre quantifié.',cell:{...gs.getPlayer().position},kind:'lever',material:'stone',size:'small',resilience:'resilient'}));const physicalFactId=await fact(f)
 ok(await f.call('prepare_player_poison',{eventId:'actual-object-dose',doseItemId:'actual-dose',surfaceKind:'object',surfaceId:'actual-source',physicalFactId,foodOrLiquidConfirmed:true,surfaceDescription:'Dose entière dans le vrai liquide de cet objet de scène.'}))
 await refused(f,'establish_water_source',{eventId:'unsupported-source',objectId:'actual-source',establishedFactId:physicalFactId,actualWaterSourceConfirmed:true,kind:'finite',quantityQuarterPints:4,waterWeightLbPerPint:1,hazardFactIds:[],source:'Le registre ne peut supprimer le poison réellement présent.'},'POISON_SOURCE_BODY_VOLUME_UNSUPPORTED');assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})

test('initial container registration preserves the already-poisoned canonical full waterskin quantity instead of changing its real contents retroactively',async t=>{
 const f=await setup(t);gs.getPlayer().inventory.push({id:'actual-full-skin',equipmentId:'waterskin_full',name:'Outre réelle pleine de quatre pintes',type:'misc'});await coat(f,'actual-full-skin')
 const input={eventId:'actual-container',itemId:'actual-full-skin',containerType:'waterskin',actualContainerConfirmed:true,contentsQuarterPints:4,dryWeightLb:1,waterWeightLbPerPint:1,hazardFactIds:[],source:'La vraie quantité contenant cette dose ne peut changer par une déclaration.'};await refused(f,'register_water_container',input,'POISON_NUTRITION_VOLUME_CHANGED');ok(await f.call('register_water_container',{...input,contentsQuarterPints:16}));gs.replaceState(structuredClone(gs.getState()))
 const a=ok(await f.call('consume_provisions',{eventId:'actual-drink',itemId:'actual-full-skin',units:4}));assert.equal(a.poisonDamageDealt,5);assert.equal(gs.getState().dmTools.survival.day.waterPints,4);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})


test('a known contact dose on the real food surface cannot disappear through nutrition before the explicit actual skin-contact event',async t=>{
 const f=await setup(t,{template:'oil_of_taggit',dice:'19'}),physicalFactId=await fact(f);ok(await f.call('prepare_player_poison',{eventId:'actual-contact',doseItemId:'actual-dose',surfaceKind:'item',surfaceId:'actual-ration',physicalFactId,surfaceDescription:'Dose de contact sur la surface extérieure réellement touchable de cette ration.'}))
 await refused(f,'consume_provisions',{eventId:'actual-meal',itemId:'actual-ration',units:4},'POISON_CONTACT_EVENT_REQUIRED')
 ok(await f.call('expose_player_poison',{eventId:'actual-protected-touch',preparationId:'actual-contact',targetId:'player',physicalFactId,actualTouchConfirmed:true,exposedSkinConfirmed:false}));ok(await f.call('consume_provisions',{eventId:'actual-meal',itemId:'actual-ration',units:4}));assert.equal(gs.getState().dmTools.survival.day.foodHalfPounds,4);assert.equal(gs.getPlayer().conditions.includes('poisoned'),false);assert.equal(ok(await f.call('roll_dice',{notation:'1d20'})).total,19)
})
