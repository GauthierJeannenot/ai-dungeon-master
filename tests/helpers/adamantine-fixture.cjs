const assert=require('node:assert/strict')
const{engine,ok,replace,adjacent}=require('./mcp-toolkit.cjs')
const source='Actual already-manufactured seller-owned source instance, its exact canonical normal version and original adamantine material are established before any purchase; no former ordinary item is transformed.'
async function setup(t,{kind='melee_weapon',weaponId='longsword',ammunitionType='arrow',dice='17,2,3,19',buy=true,bow=false,launcherId='shortbow'}={}){
 const call=await engine(t,{dice}),initial=await call('get_game_state'),cell=adjacent(initial)[0]
 ok(await call('create_npc',{npcId:'actual-adamantine-merchant',name:'Actual material-version seller',statBlock:'goblin',cell,disposition:'neutral',visible:true,description:'One actual existing seller with its stated stock; no material, price or consent is inferred from its name.'}))
 ok(await call('equip_item',{itemId:'longsword',operation:'unequip',slot:'main_hand'}))
 ok(await call('create_treasure',{treasureId:'actual-material-funding',name:'Actual coins',description:'Actual existing coin treasure selected for this fixture; no wallet refill or merchant purse inferred.',cell:initial.player.position,mode:'authored',coins:{gp:1000,sp:20,cp:100}}))
 ok(await call('collect_treasure',{treasureId:'actual-material-funding'}))
 const fact=ok(await call('record_scene_fact',{description:source,cell})).worldFact
 const input={eventId:'actual-initial-adamantine',itemId:'actual-material-instance',merchantId:'actual-adamantine-merchant',name:'Actual source material version',kind,form:'coated',physicalFactId:fact.id,actualInitialAdamantineStockConfirmed:true,...kind==='melee_weapon'?{weaponId}:{ammunitionType}}
 const prepared=ok(await call('prepare_adamantine_stock',input))
 if(bow)ok(await call('prepare_phb_launcher_stock',{eventId:'actual-initial-launcher',itemId:'actual-ordinary-bow',merchantId:input.merchantId,weaponId:launcherId,name:'Actual already-manufactured ordinary shortbow',physicalFactId:fact.id,actualInitialStockConfirmed:true}))
 const offer={offerId:'actual-material-purchase-offer',merchantId:input.merchantId,itemIds:bow?['actual-ordinary-bow',input.itemId]:[input.itemId],priceCp:prepared.priceCp+(bow?require('../../mcp-server/dist/lib/srd/weapon-prices.js').WEAPON_PRICES[launcherId]:0),agreementFactId:fact.id,actualAgreementConfirmed:true}
 const paid={gp:Math.floor(offer.priceCp/100)-1,sp:10,cp:offer.priceCp%100}
 const purchase={eventId:'actual-material-purchase',offerId:offer.offerId,paid,workSeconds:6,activitySource:'The real agreed full version is handed over for the explicitly selected available coin denominations in this actual six-second exchange.'}
 if(buy){ok(await call('create_trade_offer',offer));ok(await call('purchase_trade_offer',purchase))}
 async function equip(){const s=await call('get_game_state');if(s.dmTools.loadout?.shieldId)ok(await call('equip_item',{itemId:s.dmTools.loadout.shieldId,operation:'unequip',slot:'shield'}));ok(await call('equip_item',{itemId:bow?'actual-ordinary-bow':input.itemId,operation:'equip',slot:'main_hand'}))}
 async function object(id='actual-target',extra={}){const s=await call('get_game_state');return ok(await call('create_scene_object',{objectId:id,name:'Actual breakable object',description:'The exact physical object selected for the actual attack, with source AC/HP and explicitly chosen physical defenses.',cell:s.player.position,kind:'container',material:'wood',size:'large',resilience:'resilient',...extra}))}
 const attack=(eventId='actual-object-hit',extra={})=>({objectId:'actual-target',action:'attack',eventId,weaponId:bow?'actual-ordinary-bow':input.itemId,...bow?{ammunitionItemId:input.itemId}:{},...extra})
 return{call,cell,fact,input,prepared,offer,purchase,equip,object,attack}
}
async function refused(call,name,input,code){const before=await call('get_game_state'),answer=await call(name,input);assert.equal(answer.code,code,JSON.stringify(answer));assert.deepEqual(await call('get_game_state'),before);return answer}
module.exports={setup,refused,source}
