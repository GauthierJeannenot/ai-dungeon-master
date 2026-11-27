const assert=require('node:assert/strict')
const{setup:ordinary}=require('./merchant-resale-fixture.cjs')
const{ok}=require('./mcp-toolkit.cjs')
async function setupGoods(t,{commodityId='copper',sourceUnits=3,buy=true,qualify=true,initialFunding=false,dice='19'}={}){
 const f=await ordinary(t,{fund:initialFunding,dice})
 ok(await f.call('exchange_currency',{transactionId:'actual-goods-change',paid:{gp:2},received:{sp:20},reason:'Un vrai change de ces pièces déjà possédées, distinct des fonds du marchand.'}))
 ok(await f.call('create_scene_object',{objectId:'actual-goods-crate',name:'Lot déjà présent',description:'Un vrai lot physique de matière est présent ici ; sa catégorie et sa quantité ne sont pas déduites de cette description.',cell:f.cell,kind:'container',material:'wood',size:'small',resilience:'resilient',contents:['raw_crafting_materials']}))
 const item=ok(await f.call('interact_object',{objectId:'actual-goods-crate',action:'open'})).releasedItems[0]
 const fact=ok(await f.call('record_scene_fact',{description:'Le lot physique exact a réellement été examiné et mesuré dans ses unités source ; identité et état inchangés. Le marchand possède ce lot et accepte explicitement achat et reprise à sa pleine valeur.',cell:f.cell})).worldFact
 const definition=require('../../mcp-server/dist/lib/srd/trade-goods.js').TRADE_GOODS[commodityId],priceCp=definition.priceCp*sourceUnits
 const qualification={eventId:'actual-goods-qualified',itemId:item.id,commodityId,sourceUnits,physicalFactId:fact.id,actualWholeLotIdentityQuantityAndUnchangedStateConfirmed:true}
 if(qualify)ok(await f.call('record_trade_good',qualification))
 const stock={eventId:'actual-goods-stock',merchantId:f.offer.merchantId,itemIds:[item.id],physicalFactId:fact.id,actualStockConfirmed:true}
 const purchaseOffer={offerId:'actual-goods-purchase-offer',merchantId:f.offer.merchantId,itemIds:[item.id],priceCp,agreementFactId:fact.id,actualAgreementConfirmed:true}
 const paid=priceCp%10===0?{sp:priceCp/10}:{cp:priceCp}
 const purchase={eventId:'actual-goods-purchase',offerId:purchaseOffer.offerId,paid,workSeconds:6,activitySource:'Remise réelle du lot entier déjà qualifié et des pièces choisies ; durée explicitement adjudiquée.'}
 if(buy){ok(await f.call('record_merchant_stock',stock));ok(await f.call('create_trade_offer',purchaseOffer));ok(await f.call('purchase_trade_offer',purchase))}
 const resaleOffer={offerId:'actual-goods-resale-offer',merchantId:f.offer.merchantId,tradeGoods:[{itemId:item.id,physicalFactId:fact.id,actualWholeLotUnchangedConfirmed:true}],priceCp,agreementFactId:fact.id,actualMerchantAcceptanceConfirmed:true}
 const resale={eventId:'actual-goods-resale',offerId:resaleOffer.offerId,received:paid,workSeconds:6,activitySource:'Remise réelle de ce même lot entier, payé par les seules recettes effectives de ce marchand.'}
 return{...f,goodsItem:item,qualification,stock,purchaseOffer,purchase,resaleOffer,resale,priceCp}
}
module.exports={setupGoods}
