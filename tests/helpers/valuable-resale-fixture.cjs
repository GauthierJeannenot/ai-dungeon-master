const assert=require('node:assert/strict')
const{setup:ordinarySetup}=require('./merchant-resale-fixture.cjs')
const{ok}=require('./mcp-toolkit.cjs')
const sequences={gem:[...Array(11).fill(1),7,1,1,1,12],art:[...Array(13).fill(1),23,1,2,1,2,3]}
async function setupValuable(t,{kind='gem',count=1,fund=true,collect=true,tail='19'}={}){
 const f=await ordinarySetup(t,{fund:false,dice:[...sequences[kind],...tail.split(',')].join(',')}),state=await f.call('get_game_state')
 const hoard=ok(await f.call('create_treasure_hoard',{hoardId:'actual-resale-source-hoard',challengeBand:kind==='gem'?'0-4':'5-10',name:'Valeurs réellement présentes',description:'Les vrais objets sourcés de ce repaire sont conservés sans conversion automatique.',cell:state.player.position})).hoard
 assert.ok(hoard.valuables.length>=count);assert.ok(hoard.valuables.every(v=>v.kind===kind))
 if(collect)ok(await f.call('collect_treasure_hoard',{hoardId:hoard.id}))
 const values=hoard.valuables.slice(0,count),priceCp=values.reduce((sum,v)=>sum+v.valueGp*100,0)
 if(fund){
  ok(await f.call('create_scene_object',{objectId:'actual-valuables-funding-stock',name:'Lampe réelle',description:'Un véritable objet ordinaire est déjà disponible auprès de ce marchand.',cell:f.cell,kind:'container',material:'wood',size:'small',resilience:'resilient',contents:['lamp']}));const item=ok(await f.call('interact_object',{objectId:'actual-valuables-funding-stock',action:'open'})).releasedItems[0]
  const fact=ok(await f.call('record_scene_fact',{description:'L’achat exact de cette lampe existante au prix convenu approvisionne le marchand avec les dénominations effectivement échangées.',cell:f.cell})).worldFact
  const paidGp=priceCp/100+5
  ok(await f.call('record_merchant_stock',{eventId:'actual-valuables-funding-stock',merchantId:f.offer.merchantId,itemIds:[item.id],physicalFactId:fact.id,actualStockConfirmed:true}));ok(await f.call('create_trade_offer',{offerId:'actual-valuables-funding-offer',merchantId:f.offer.merchantId,itemIds:[item.id],priceCp:paidGp*100,agreementFactId:fact.id,actualAgreementConfirmed:true}));ok(await f.call('purchase_trade_offer',{eventId:'actual-valuables-funding-purchase',offerId:'actual-valuables-funding-offer',paid:{gp:paidGp},workSeconds:6,activitySource:'Échange réel de cette lampe et des pièces choisies ; aucune réserve marchand initiale ou extérieure.'}))
 }
 const fact=ok(await f.call('record_scene_fact',{description:'Ces exemplaires source précis, leur catégorie inscrite et leur vraie valeur déjà établie ont été qualifiés matériellement sans changement ; l’acheteur actuel accepte leur pleine valeur.',cell:f.cell})).worldFact
 const offer={offerId:'actual-full-value-offer',merchantId:f.offer.merchantId,valuables:values.map(v=>({itemId:v.id,registeredKind:v.kind,physicalFactId:fact.id,actualRegisteredIdentityAndValueConfirmed:true,materialStateUnchangedConfirmed:true})),priceCp,agreementFactId:fact.id,actualMerchantAcceptanceConfirmed:true}
 const sale={eventId:'actual-full-value-sale',offerId:offer.offerId,received:{gp:priceCp/100},workSeconds:6,activitySource:'Échange réellement effectué des valeurs exactes et des pièces choisies ; durée adjudiquée par le MJ.'}
 return{...f,hoard,values,valuableFact:fact,valuableOffer:offer,valuableSale:sale}
}
module.exports={setupValuable}
