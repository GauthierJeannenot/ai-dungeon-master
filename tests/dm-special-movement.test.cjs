const test=require('node:test'),assert=require('node:assert/strict')
Object.assign(process.env,{LLM_MODE:'mock',ALLOW_PAID_LLM:'false',MONETIZATION_ENABLED:'false',DM_RATE_LIMIT_PER_MINUTE:'0',APP_LOG_PERSIST_ENABLED:'false',APP_LOG_LEVEL:'error',LLM_MAX_CALLS_PER_REQUEST:'12'})
const{installPgMem}=require('./helpers/pg-mem.cjs'),pg=installPgMem()
const{play,lastResult}=require('./helpers/dm-scripted-turn.cjs')
const{engine,ok,grid,adjacent}=require('./helpers/mcp-toolkit.cjs')
const{inferRoomIdOnMap}=require('../mcp-server/dist/lib/adventure-map.js')
const{serializeGameState}=require('../lib/dm/prompts.ts')
test.after(()=>pg.restore())
const source='Milieu, face et appuis réellement présents dans la scène de test et mesurés explicitement par le MJ ; aucune hauteur ni trajectoire obtenue par le nom.'
const point=cell=>({...cell,zFeet:0})
function actualRoute(state,length){
 const nav=grid(state),room=state.currentRoomId
 function visit(path){if(path.length===length)return path
  const end=path.at(-1)
  for(const next of nav.neighbors(end))if(nav.step(end,next)&&nav.free(next)&&inferRoomIdOnMap(next,state.currentMapId,state)===room&&!path.some(cell=>cell.x===next.x&&cell.y===next.y)){
   const found=visit([...path,next]);if(found)return found
  }
 }
 const route=visit([{...state.player.position}]);assert.ok(route,'A real open route of the required length exists in this room');return route
}
test('the API performs actual walk/swim/walk legs on one movement decision, then one associated check, without inventing another action',async t=>{
 const call=await engine(t,{dice:'17,19'}),state=await call('get_game_state'),[start,approach,waterCell,bank,final]=actualRoute(state,5)
 const fact=ok(await call('record_scene_fact',{description:'Cette cellule contient réellement le milieu d’eau de surface observé ; les cellules de rive indiquées portent leur vrai appui.',cell:waterCell})).worldFact
 ok(await call('record_movement_medium',{eventId:'actual-api-water-observation',mediumId:'actual-api-water',mapId:state.currentMapId,roomId:state.currentRoomId,mode:'swim',cells:[waterCell],bottomZFeet:-5,topZFeet:2,surfaceZFeet:2,factId:fact.id,actualPhysicalMediumConfirmed:true,handsRequired:0,difficult:false,source}))
 ok(await call('record_vertical_surface',{eventId:'actual-api-bank-measurement',surfaceId:'actual-api-bank',mapId:state.currentMapId,roomId:state.currentRoomId,cells:[bank,final],kind:'support',elevationFeet:0,actualGeometryConfirmed:true,source}))
 const swim={eventId:'actual-api-crossing',entityId:'player',mediumId:'actual-api-water',path:[point(approach),point(waterCell),point(bank)],landingSurfaceId:'actual-api-bank',actualClearanceConfirmed:true,surfaceSwimmingConfirmed:true,source}
 const{result,seen,selected,before}=await play(t,call,[{name:'move_token',input:{tokenId:'player',toCell:approach}},{name:'move_by_climbing_or_swimming',input:swim},{name:'inspect_special_movement',input:{}},{name:'move_token',input:{tokenId:'player',toCell:final}},{name:'roll_ability_check',input:{entityId:'player',ability:'wis',dc:10}},{name:'roll_ability_check',input:{entityId:'player',ability:'wis',dc:10}},params=>{assert.equal(lastResult(params).code,'PRIMARY_ACTION_ALREADY_RESOLVED');return 'Tu rejoins la vraie rive par ces déplacements puis résous ton observation.'}],'Je rejoins ce passage, traverse cette eau puis avance sur la rive et observe.')
 assert.deepEqual(seen,selected.slice(0,-1));const after=result.newGameState,move=after.dmTools.jumping.locomotion.moves[swim.eventId]
 assert.deepEqual(before.player.position,start);assert.deepEqual(after.player.position,final);assert.equal(move.result.goalReached,true);assert.equal(after.dmTools.jumping.locomotion.locations.player,undefined)
 assert.equal(after.worldTimeSeconds,before.worldTimeSeconds);assert.deepEqual(after.player.hp,before.player.hp);assert.deepEqual(after.player.inventory,before.player.inventory)
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
test('the API climbs a measured actual object face to its real upper support and retains live height in SQL and dynamic context',async t=>{
 const call=await engine(t,{dice:'17,19'}),initial=await call('get_game_state'),shield=initial.player.inventory.find(item=>(item.equipmentId??item.id)==='shield')
 if(shield){const answer=await call('equip_item',{itemId:shield.id,operation:'unequip',slot:'shield'});if(answer.error)assert.equal(answer.code,'ITEM_NOT_EQUIPPED')}
 const state=await call('get_game_state'),cell={...state.player.position},nav=grid(state)
 const objectCell=adjacent(state).find(origin=>[origin,{x:origin.x+1,y:origin.y},{x:origin.x,y:origin.y+1},{x:origin.x+1,y:origin.y+1}].every(part=>(part.x!==cell.x||part.y!==cell.y)&&nav.valid(part)&&nav.free(part)&&inferRoomIdOnMap(part,state.currentMapId,state)===state.currentRoomId))
 assert.ok(objectCell,'The actual Large obstacle needs its complete free2x2 footprint beside the actor')
 ok(await call('create_scene_object',{objectId:'actual-api-climbing-frame',name:'Échafaudage réel',description:'Une vraie structure de bois avec paroi et appui supérieur, préexistante au déplacement demandé.',cell:objectCell,kind:'obstacle',material:'wood',size:'large',resilience:'resilient'}))
 ok(await call('record_vertical_surface',{eventId:'actual-api-floor-measurement',surfaceId:'actual-api-floor',mapId:state.currentMapId,roomId:state.currentRoomId,cells:[cell],kind:'support',elevationFeet:0,actualGeometryConfirmed:true,source}))
 ok(await call('observe_standing_surface',{eventId:'actual-api-floor-support',entityId:'player',surfaceId:'actual-api-floor',actualCurrentSupportConfirmed:true,source}))
 ok(await call('record_vertical_surface',{eventId:'actual-api-upper-measurement',surfaceId:'actual-api-upper-support',mapId:state.currentMapId,roomId:state.currentRoomId,cells:[cell],kind:'support',elevationFeet:10,actualGeometryConfirmed:true,source}))
 ok(await call('declare_vertical_barrier',{eventId:'actual-api-face-measurement',barrierId:'actual-api-face',mapId:state.currentMapId,reference:{kind:'object',objectId:'actual-api-climbing-frame',footprint:{minXFeet:objectCell.x*5-2.5,maxXFeet:objectCell.x*5+7.5,minYFeet:objectCell.y*5-2.5,maxYFeet:objectCell.y*5+7.5}},bottomZFeet:0,topZFeet:10,actualMeasuredBarrierConfirmed:true,source}))
 const fact=ok(await call('record_scene_fact',{description:'La vraie face permet cette escalade mesurée et cette prise effective à une main ; le dégagement et l’appui final ont été constatés.',cell})).worldFact
 ok(await call('record_movement_medium',{eventId:'actual-api-climb-observation',mediumId:'actual-api-climb',mapId:state.currentMapId,roomId:state.currentRoomId,mode:'climb',cells:[cell],bottomZFeet:0,topZFeet:10,barrierId:'actual-api-face',factId:fact.id,actualPhysicalMediumConfirmed:true,handsRequired:1,difficult:false,source}))
 const input={eventId:'actual-api-ascent',entityId:'player',mediumId:'actual-api-climb',path:[point(cell),{...cell,zFeet:5},{...cell,zFeet:10}],landingSurfaceId:'actual-api-upper-support',actualClearanceConfirmed:true,source}
 const{result,seen,selected,before}=await play(t,call,[{name:'move_by_climbing_or_swimming',input},{name:'inspect_special_movement',input:{}},{name:'roll_ability_check',input:{entityId:'player',ability:'wis',dc:10}},{name:'roll_ability_check',input:{entityId:'player',ability:'wis',dc:10}},params=>{assert.equal(lastResult(params).code,'PRIMARY_ACTION_ALREADY_RESOLVED');return 'Tu atteins réellement l’appui supérieur et observes depuis cette hauteur.'}],'Je grimpe par cette face réelle jusqu’à l’appui supérieur, puis j’observe.')
 assert.deepEqual(seen,selected.slice(0,-1));const after=result.newGameState
 assert.equal(after.dmTools.jumping.supports.player.surfaceId,'actual-api-upper-support');assert.equal(after.dmTools.jumping.supports.player.elevationFeet,10);assert.deepEqual(after.player.position,before.player.position);assert.deepEqual(after.player.hp,before.player.hp);assert.equal(after.worldTimeSeconds,before.worldTimeSeconds)
 assert.equal(JSON.parse(serializeGameState(after)).player.verticalContext.zFeet,10,'future dynamic MJ context retains actual live height beyond the initial sheet')
 assert.equal(ok(await call('roll_dice',{notation:'1d20'})).total,19)
})
