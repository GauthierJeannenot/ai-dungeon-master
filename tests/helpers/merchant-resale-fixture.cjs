const assert=require('node:assert/strict')
const{engine,ok,adjacent}=require('./mcp-toolkit.cjs')
async function setup(t,{fund=true,copper=false,dice='19'}={}){
 const call=await engine(t,{dice}),initial=await call('get_game_state'),cell=adjacent(initial)[0],item=initial.player.inventory.find(i=>i.id==='handaxe');assert.ok(item)
 ok(await call('create_npc',{npcId:'actual-resale-buyer',name:'Acheteur actuel',statBlock:'goblin',cell,disposition:'neutral',visible:true,description:'Un marchand individuel réel ; aucune acceptation déduite de son nom ou disposition.'}))
 const held=initial.player.inventory.find(i=>i.id==='longsword');ok(await call('equip_item',{itemId:held.id,operation:'unequip',slot:'main_hand'}))
 let fundingItem
 if(fund){
  ok(await call('exchange_currency',{transactionId:'actual-change-before-market',paid:{gp:copper?6:1},received:copper?{cp:600}:{sp:10},reason:'Un véritable change de ces dénominations a été établi par le MJ avant le marché ; aucun marchand approvisionné par ce seul change.'}))
  ok(await call('create_scene_object',{objectId:'actual-funded-stock',name:'Stock existant',description:'Une vraie lampe déjà présente, distincte des biens du joueur.',cell,kind:'container',material:'wood',size:'small',resilience:'resilient',contents:['lamp']}))
  fundingItem=ok(await call('interact_object',{objectId:'actual-funded-stock',action:'open'})).releasedItems[0]
  const fact=ok(await call('record_scene_fact',{description:'Ce marchand possède cette lampe et un achat de550cp a réellement été convenu ; aucun prix implicite ou richesse initiale.',cell})).worldFact
  ok(await call('record_merchant_stock',{eventId:'actual-buyer-stock',merchantId:'actual-resale-buyer',itemIds:[fundingItem.id],physicalFactId:fact.id,actualStockConfirmed:true}))
  ok(await call('create_trade_offer',{offerId:'actual-funded-purchase',merchantId:'actual-resale-buyer',itemIds:[fundingItem.id],priceCp:550,agreementFactId:fact.id,actualAgreementConfirmed:true}))
  ok(await call('purchase_trade_offer',{eventId:'actual-buyer-earnings',offerId:'actual-funded-purchase',paid:copper?{cp:550}:{gp:5,sp:5},workSeconds:6,activitySource:'Le véritable achat de cette lampe transfère ces pièces au marchand et occupe six secondes adjudiquées.'}))
 }
 const fact=ok(await call('record_scene_fact',{description:'L’exemplaire exact de la hache du joueur a été examiné intact et non modifié ; le véritable marchand accepte de le racheter au demi-prix source250cp.',cell})).worldFact
 const offer={offerId:'actual-resale-offer',merchantId:'actual-resale-buyer',itemConditions:[{itemId:item.id,physicalFactId:fact.id,actualUndamagedConfirmed:true}],priceCp:250,agreementFactId:fact.id,actualMerchantAcceptanceConfirmed:true}
 const sale={eventId:'actual-completed-resale',offerId:offer.offerId,received:copper?{cp:250}:{gp:2,sp:5},workSeconds:6,activitySource:'Échange physique réellement réalisé de cette hache et de ces mêmes pièces disponibles ; temps adjudiqué explicitement.'}
 return{call,item,cell,fundingItem,fact,offer,sale}
}
module.exports={setup}
