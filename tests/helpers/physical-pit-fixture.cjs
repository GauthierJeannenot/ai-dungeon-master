const assert=require('node:assert/strict')
const {ok,grid}=require('./mcp-toolkit.cjs')
const {getMapSpec,inferRoomIdOnMap}=require('../../mcp-server/dist/lib/adventure-map.js')
const source='Mesure physique actuelle du vrai canevas, du fond dix pieds plus bas, du bord sûr et de leur face solide ; aucune hauteur ni arrivée déduite du nom.'
async function preparePhysicalPit(call,{prefix='actual-pit',qualify=true}={}){
 let state=await call('get_game_state');const nav=grid(state),spec=getMapSpec(state.currentMapId,state)
 const candidates=[state.player.position,...Array.from({length:spec.grid.rows},(_,y)=>Array.from({length:spec.grid.cols},(_,x)=>({x,y}))).flat()]
 const pit=candidates.find(c=>{
  const cells=[c,{x:c.x+1,y:c.y},...Array.from({length:2},(_,dy)=>Array.from({length:2},(_,dx)=>({x:c.x+dx,y:c.y-2+dy}))).flat()]
  return cells.every(cell=>nav.valid(cell)&&nav.free(cell)&&inferRoomIdOnMap(cell,state.currentMapId,state)===state.currentRoomId)
 })
 assert(pit,'This actual room needs a free measured pit/rim and real wall footprint')
 if(pit.x!==state.player.position.x||pit.y!==state.player.position.y)ok(await call('move_token',{tokenId:'player',toCell:pit}))
 state=await call('get_game_state');const safe={x:pit.x+1,y:pit.y},wall={x:pit.x,y:pit.y-2}
 ok(await call('create_scene_object',{objectId:prefix+'-wall',name:'Face solide de la fosse',description:source,cell:wall,kind:'obstacle',material:'stone',size:'large',resilience:'resilient'}))
 ok(await call('create_trap',{trapId:prefix,name:'Fosse mesurée',template:'pit',cell:pit}))
 for(const[id,z,cells]of [[prefix+'-canvas',0,[pit]],[prefix+'-floor',-10,[pit]],[prefix+'-rim',0,[safe]]])
  ok(await call('record_vertical_surface',{eventId:id+'-measurement',surfaceId:id,mapId:state.currentMapId,roomId:state.currentRoomId,cells,kind:'support',elevationFeet:z,actualGeometryConfirmed:true,source}))
 ok(await call('observe_standing_surface',{eventId:prefix+'-current-canvas',entityId:'player',surfaceId:prefix+'-canvas',actualCurrentSupportConfirmed:true,source}))
 ok(await call('record_physical_body',{eventId:prefix+'-body',entityId:'player',heightFeet:6,actualMeasuredBodyConfirmed:true,source}))
 ok(await call('declare_vertical_barrier',{eventId:prefix+'-face-measurement',barrierId:prefix+'-face',mapId:state.currentMapId,reference:{kind:'object',objectId:prefix+'-wall',footprint:{minXFeet:(wall.x-.5)*5,maxXFeet:(wall.x+1.5)*5,minYFeet:(wall.y-.5)*5,maxYFeet:(wall.y+1.5)*5}},bottomZFeet:-10,topZFeet:0,actualMeasuredBarrierConfirmed:true,source}))
 const fact=ok(await call('record_scene_fact',{cell:pit,description:source})).worldFact
 ok(await call('record_movement_medium',{eventId:prefix+'-climb-observation',mediumId:prefix+'-climb',mapId:state.currentMapId,roomId:state.currentRoomId,mode:'climb',cells:[pit,safe],bottomZFeet:-10,topZFeet:0,barrierId:prefix+'-face',factId:fact.id,actualPhysicalMediumConfirmed:true,handsRequired:1,difficult:false,source}))
 const qualification={eventId:prefix+'-qualification',trapId:prefix,coverSurfaceId:prefix+'-canvas',bottomSurfaceId:prefix+'-floor',escapeSurfaceId:prefix+'-rim',climbMediumId:prefix+'-climb',factId:fact.id,actualPitGeometryConfirmed:true,source}
 if(qualify)ok(await call('qualify_pit_geometry',qualification))
 return{trapId:prefix,cell:pit,safe,qualification,trigger:{trapId:prefix,action:'trigger',targetId:'player',successCell:safe},
  climb:{eventId:prefix+'-real-ascent',entityId:'player',mediumId:prefix+'-climb',path:[{...pit,zFeet:-10},{...pit,zFeet:-5},{...pit,zFeet:0},{...safe,zFeet:0}],landingSurfaceId:prefix+'-rim',actualClearanceConfirmed:true,source}}
}
module.exports={preparePhysicalPit,source}
