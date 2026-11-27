const assert=require('node:assert/strict')
const {fixture,ok,refused}=require('./ammunition-fixture.cjs')
const gs=require('../../mcp-server/dist/mcp-server/game-state.js')
const {getAdventureMap}=require('../../mcp-server/dist/lib/adventure-map.js')
const {createMonster}=require('../../mcp-server/dist/mcp-server/tools/phase-tools.js')
const {entityVerticalContext,entityGroundContact}=require('../../mcp-server/dist/lib/jumping-state.js')
const {playerHandOccupancy}=require('../../mcp-server/dist/lib/hand-occupancy.js')
const source='Actual measured physical medium, support and source-specific MJ adjudication in this scene.'
async function setup(t,options={}){
 const f=await fixture(t,{weapon:'longsword',quantity:null,startBattle:false,dice:'19,1,17',...options}),callbacks={}
 f.target.position={x:11,y:4}
 const server={tool(n,d,s,fn){callbacks[n]=v=>fn(require('zod').z.object(s).parse(v))},registerTool(n,c,fn){callbacks[n]=v=>fn(require('zod').z.object(c.inputSchema).parse(v))}}
 require('../../mcp-server/dist/mcp-server/tools/special-movement-tools.js').registerSpecialMovementTools(server)
 require('../../mcp-server/dist/mcp-server/tools/vertical-tools.js').registerVerticalTools(server)
 require('../../mcp-server/dist/mcp-server/tools/vertical-barrier-tools.js').registerVerticalBarrierTools(server)
 require('../../mcp-server/dist/mcp-server/tools/rest-tools.js').registerRestTools(server)
 const old=f.call;f.call=async(n,v={})=>callbacks[n]?JSON.parse((await callbacks[n](v)).content[0].text):old(n,v)
 return f
}
const cells=[{x:1,y:2},{x:2,y:2},{x:3,y:2},{x:4,y:2}]
async function water(f,extra={}){
 const fact=ok(await f.call('record_scene_fact',{description:source,cell:cells[0]})).worldFact
 const args={eventId:'real-water-fact',mediumId:'actual-water',mapId:gs.getState().currentMapId,roomId:'firing-room',mode:'swim',cells,bottomZFeet:-5,topZFeet:2,surfaceZFeet:2,factId:fact.id,actualPhysicalMediumConfirmed:true,handsRequired:0,difficult:false,source,...extra}
 ok(await f.call('record_movement_medium',args));return args
}
async function surface(f,id,z=0,cell={x:1,y:2}){return ok(await f.call('record_vertical_surface',{eventId:'measure-'+id,surfaceId:id,mapId:gs.getState().currentMapId,roomId:'firing-room',cells:[cell],kind:'support',elevationFeet:z,actualGeometryConfirmed:true,source}))}
async function climb(f,extra={}){
 getAdventureMap().maps[0].geometry.edges.push({from:{x:1,y:2},to:{x:2,y:2},kind:'wall'})
 ok(await f.call('declare_vertical_barrier',{eventId:'real-face-measurement',barrierId:'actual-face',mapId:gs.getState().currentMapId,reference:{kind:'edge',from:{x:1,y:2},to:{x:2,y:2}},bottomZFeet:0,topZFeet:20,actualMeasuredBarrierConfirmed:true,source}))
 const fact=ok(await f.call('record_scene_fact',{description:source,cell:cells[0]})).worldFact
 ok(await f.call('record_movement_medium',{eventId:'real-climb-fact',mediumId:'actual-climb',mapId:gs.getState().currentMapId,roomId:'firing-room',mode:'climb',cells:[cells[0]],bottomZFeet:0,topZFeet:20,barrierId:'actual-face',factId:fact.id,actualPhysicalMediumConfirmed:true,handsRequired:1,difficult:false,source,...extra}))
}
const swim=(extra={})=>({eventId:'actual-swim',entityId:'player',mediumId:'actual-water',path:[{x:1,y:2,zFeet:0},{x:2,y:2,zFeet:0},{x:3,y:2,zFeet:0}],actualClearanceConfirmed:true,surfaceSwimmingConfirmed:true,source,...extra})
const climbMove=(extra={})=>({eventId:'actual-climb-move',entityId:'player',mediumId:'actual-climb',path:[{x:1,y:2,zFeet:0},{x:1,y:2,zFeet:5},{x:1,y:2,zFeet:10}],actualClearanceConfirmed:true,source,...extra})
async function combat(f,ids=['player','target']){ok(await f.call('enter_combat',{combatants:ids}))}
function hydrate(){gs.replaceState(structuredClone(gs.getState()))}

module.exports={setup,water,climb,surface,swim,climbMove,combat,hydrate,gs,ok,refused,source}
