const assert=require('node:assert/strict')
const {grid,adjacent,ok}=require('./mcp-toolkit.cjs')
const {inferRoomIdOnMap}=require('../../mcp-server/dist/lib/adventure-map.js')
const unique=cells=>[...new Map(cells.map(cell=>[JSON.stringify(cell),cell])).values()]
async function prepareDiagonalRazorvine(call,{outerCorner=false,missingCorner=false,missingRay=false}={}){
 const state=await call('get_game_state'),start=state.player.position
 // Source-qualified concrete example. No teleport or replacement map is used.
 assert.equal(state.currentMapId,'candlekeep');assert.equal(state.currentRoomId,'1');assert.deepEqual(start,{x:4,y:8})
 const face={x:2,y:10},anchor={x:outerCorner?1:3,y:10},rayCells=[start,{x:3,y:9},face]
 const clearanceCells=[{x:3,y:8},{x:4,y:9},{x:2,y:9},{x:3,y:10}]
 const nav=grid(state),cells=unique([...rayCells,...clearanceCells,anchor])
 assert.ok(cells.every(cell=>inferRoomIdOnMap(cell,state.currentMapId,state)===state.currentRoomId&&nav.free(cell,false)))
 assert.ok(nav.step(start,rayCells[1],false,false)&&nav.step(rayCells[1],face,false,false))
 const supportCells=cells.filter(cell=>!(missingCorner&&cell.x===3&&cell.y===8)&&!(missingRay&&cell.x===3&&cell.y===9))
 const source='Le MJ mesure cette vraie haie enracinée et les supports secs du rayon diagonal au même niveau, sans déplacement du joueur.'
 const fact=ok(await call('record_scene_fact',{cell:anchor,description:source})).worldFact
 const surfaceId='actual-diagonal-razorvine-support',hedgeId='actual-diagonal-razorvine'
 ok(await call('record_vertical_surface',{eventId:'actual-diagonal-support',surfaceId,mapId:state.currentMapId,roomId:state.currentRoomId,cells:supportCells,
  kind:'support',elevationFeet:0,actualGeometryConfirmed:true,source}))
 ok(await call('observe_standing_surface',{eventId:'actual-diagonal-standing',entityId:'player',surfaceId,actualCurrentSupportConfirmed:true,source}))
 ok(await call('record_razorvine',{hedgeId,baseSurfaceId:surfaceId,firstCell:anchor,secondCell:face,factId:fact.id,actualRootedRazorvineConfirmed:true,observedBlocksSight:false}))
 return{call,start,face,anchor,rayCells,clearanceCells,hedgeId,surfaceId,
  handaxe:{eventId:'actual-diagonal-handaxe',objectId:hedgeId,action:'attack',weaponId:'handaxe',attackMode:'thrown',targetCell:face}}
}
async function equipDiagonalHandaxe(call){
 ok(await call('equip_item',{itemId:'longsword',operation:'unequip',slot:'main_hand'}))
 ok(await call('equip_item',{itemId:'handaxe',operation:'equip',slot:'main_hand'}))
}
async function enterDiagonalCombat(call){
 const state=await call('get_game_state'),cell={x:8,y:8}
 assert.equal(inferRoomIdOnMap(cell,state.currentMapId,state),state.currentRoomId);assert.ok(grid(state).free(cell))
 const npc=ok(await call('create_npc',{npcId:'actual-diagonal-opponent',name:'Adversaire présent',statBlock:'bandit',cell,disposition:'hostile',visible:true,
  description:'Cet adversaire individuel réel à profil déjà publié participe à la rencontre sans PV ou pouvoir personnalisés.'})).npc
 return ok(await call('enter_combat',{combatants:['player',npc.id],tieOrder:['player',npc.id]}))
}
async function buyDiagonalBow(call,f){
 const state=await call('get_game_state'),cell=adjacent(state).find(cell=>!unique([...f.rayCells,...f.clearanceCells,f.anchor]).some(point=>point.x===cell.x&&point.y===cell.y));assert.ok(cell)
 const merchantId='actual-diagonal-bow-merchant',weaponId='actual-diagonal-shortbow',ammoId='actual-diagonal-arrows'
 ok(await call('create_npc',{npcId:merchantId,name:'Marchand présent',statBlock:'goblin',cell,disposition:'neutral',visible:true,
  description:'Cet individu réel possède cet arc ordinaire fabriqué et le propose au prix PHB déjà enregistré.'}))
 const fact=ok(await call('record_scene_fact',{cell,description:'Cet arc court ordinaire réellement possédé par le marchand est proposé contre les25po mesurées.'})).worldFact
 ok(await call('prepare_phb_launcher_stock',{eventId:'actual-diagonal-bow-stock',itemId:weaponId,merchantId,weaponId:'shortbow',name:'Arc court réel',physicalFactId:fact.id,actualInitialStockConfirmed:true}))
 ok(await call('create_treasure',{treasureId:'actual-diagonal-bow-funds',name:'Pièces présentes',description:'Ces25po réellement présentes financent seulement cet achat.',cell:state.player.position,mode:'authored',coins:{gp:25}}))
 ok(await call('collect_treasure',{treasureId:'actual-diagonal-bow-funds'}))
 ok(await call('create_trade_offer',{offerId:'actual-diagonal-bow-offer',merchantId,itemIds:[weaponId],priceCp:2500,agreementFactId:fact.id,actualAgreementConfirmed:true}))
 ok(await call('equip_item',{itemId:'longsword',operation:'unequip',slot:'main_hand'}))
 ok(await call('purchase_trade_offer',{eventId:'actual-diagonal-bow-purchase',offerId:'actual-diagonal-bow-offer',paid:{gp:25},workSeconds:6,activitySource:'Échange réel des pièces contre cet arc pendant six secondes.'}))
 ok(await call('create_ammunition',{itemId:ammoId,ammunitionType:'arrow',quantity:4,name:'Quatre flèches réelles',description:'Ces quatre flèches ordinaires réellement au sol sont prises explicitement.',cell:f.start}))
 ok(await call('pick_up_item',{itemId:ammoId}));ok(await call('equip_item',{itemId:'shield',operation:'unequip',slot:'shield'}))
 ok(await call('equip_item',{itemId:weaponId,operation:'equip',slot:'main_hand'}))
 return{ammoId,shot:{eventId:'actual-diagonal-bow-shot',objectId:f.hedgeId,action:'attack',weaponId,ammunitionItemId:ammoId,targetCell:f.face}}
}
module.exports={prepareDiagonalRazorvine,equipDiagonalHandaxe,enterDiagonalCombat,buyDiagonalBow}
