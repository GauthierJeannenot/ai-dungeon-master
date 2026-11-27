const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const {installTsRequireWithAliases} = require('./helpers/ts-require.cjs')
installTsRequireWithAliases()
const {getAdventureMap,getNavigationMode,roomContainsCell,inferRoomIdOnMap} = require('../lib/adventure-map.ts')
const {GeometrySchema,edgeKey,geometryAscii} = require('../lib/battlemap-geometry.ts')
const {navigationGrid,explorationMovementRooms} = require('../lib/navigation.ts')
const {context,freshness,conflicts} = require('../scripts/battlemap-geometry.cjs')
const gs = require('../mcp-server/game-state.ts')
const {planNavigation,executeNavigation} = require('../mcp-server/navigation.ts')
const adventureId = 'grammys-country-apple-pie'

test('outdoors offer distant exploration zones; entering and leaving switch mode without bypassing doors or geometry', t => {
  gs.resetState(); t.after(() => gs.resetState())
  const state = gs.getState(), data = getAdventureMap(adventureId)
  for (const roomId of ['1', '2', '3']) {
    gs.moveToken('player', data.entryCells[roomId].x, data.entryCells[roomId].y)
    assert.equal(getNavigationMode(state), 'exploration')
    const choices = explorationMovementRooms(state).map(room => room.id)
    for (const destination of ['1', '2', '3'].filter(id => id !== roomId)) assert.ok(choices.includes(destination))
    assert.equal(choices.includes('5'), false, 'outdoor choices never expose a remote interior destination')
  }
  const blocked = executeNavigation('player', {kind:'room',roomId:'4'})
  assert.equal(blocked.stopReason, 'closed_door')
  assert.equal(getNavigationMode(state), 'exploration', 'approaching the closed entrance stays outside')
  state.sceneMemory = {doorStates:{front:'open'}}
  assert.equal(executeNavigation('player', {kind:'room',roomId:'4'}).goalReached, true)
  assert.equal(getNavigationMode(state), 'tactical')
  assert.deepEqual(explorationMovementRooms(state).map(room => room.id), ['1', '8', '9'])
  for (const roomId of ['4', '5', '7', '8', '9']) {
    gs.moveToken('player', data.entryCells[roomId].x, data.entryCells[roomId].y)
    assert.equal(getNavigationMode(state), 'tactical', `interior ${roomId}`)
  }
  gs.moveToken('player', data.entryCells['4'].x, data.entryCells['4'].y)
  assert.equal(executeNavigation('player', {kind:'room',roomId:'1'}).goalReached, true)
  assert.equal(getNavigationMode(state), 'exploration', 'leaving restores outdoor exploration')
  state.phase = 'combat'
  assert.equal(getNavigationMode(state), 'tactical')
  assert.deepEqual(explorationMovementRooms(state), [])
})

test('active geometry preserves the supplied reference exactly, restoring only the unambiguous missing door ID', () => {
  const source = JSON.parse(fs.readFileSync('adventures/grammys-country-apple-pie/bakery.geometry.source.json','utf8'))
  const active = getAdventureMap(adventureId).maps[0].geometry
  const edges = structuredClone(source.edges)
  const unnamed = edges.filter(e=>e.kind==='door'&&!e.doorId)
  assert.equal(unnamed.length,1)
  assert.equal(edgeKey(unnamed[0].from,unnamed[0].to),edgeKey({x:5,y:6},{x:6,y:6}))
  unnamed[0].doorId='dock-floor'
  assert.deepEqual(active.edges,edges)
  assert.deepEqual(active.blockedCells,source.blockedCells)
  assert.deepEqual(active.decorations,source.decorations)
  assert.equal(active.edges.length,61)
  assert.equal(active.review,'approved')
  assert.deepEqual(active.uncertainties,[])
  assert.deepEqual(active.contradictions,[])
  GeometrySchema.parse(active)
  const ctx=context(adventureId,'bakery')
  assert.equal(freshness(active,ctx),true)
  assert.deepEqual(conflicts(active,ctx),[])
  assert.equal(fs.readFileSync('adventures/grammys-country-apple-pie/bakery.geometry.corrected.txt','utf8'),geometryAscii(active)+'\n')
})

test('interior room footprints exactly match closed-door components, including the L-shaped floor and row 12', () => {
  gs.resetState()
  const state=gs.getState(),data=getAdventureMap(adventureId)
  state.sceneMemory={doorStates:Object.fromEntries(data.doors.map(d=>[d.id,'closed']))}
  const grid=navigationGrid(state,'player',data.maps[0].geometry)
  const counts={'4':16,'5':10,'7':12,'8':26,'9':15}
  for(const [roomId,count] of Object.entries(counts)) {
    const room=data.rooms.find(r=>r.id===roomId),entry=data.entryCells[roomId]
    const reached=new Map([[`${entry.x},${entry.y}`,entry]]),queue=[entry]
    for(let i=0;i<queue.length;i++) for(const next of grid.neighbors(queue[i])) {
      const key=`${next.x},${next.y}`
      if(!reached.has(key)&&grid.step(queue[i],next,false,false)){reached.set(key,next);queue.push(next)}
    }
    assert.equal(reached.size,count,`closed-door component of room ${roomId}`)
    const expected=[]
    for(let y=0;y<15;y++)for(let x=0;x<17;x++)if(roomContainsCell(room,{x,y}))expected.push(`${x},${y}`)
    assert.deepEqual([...reached.keys()].sort(),expected.sort(),`room ${roomId} must not claim cells across a wall`)
    for(const cell of reached.values())assert.equal(inferRoomIdOnMap(cell,'bakery',adventureId),roomId)
  }
  assert.equal(inferRoomIdOnMap({x:8,y:8},'bakery',adventureId),'9')
  assert.equal(inferRoomIdOnMap({x:10,y:8},'bakery',adventureId),'8')
  assert.equal(inferRoomIdOnMap({x:6,y:12},'bakery',adventureId),'5')
  gs.resetState()
})

test('exterior access stops at the main door; the reference contains no hidden entrance into the dock', () => {
  gs.resetState()
  const before=structuredClone(gs.getState())
  for(const roomId of ['4','5','7','8','9']) {
    const plan=planNavigation('player',{kind:'room',roomId})
    assert.equal(plan.stopReason,'closed_door')
    assert.equal(plan.stopDoorId,'front')
    assert.deepEqual(plan.finalPosition,{x:11,y:13})
  }
  const grid=navigationGrid(gs.getState(),'player',getAdventureMap(adventureId).maps[0].geometry)
  assert.equal(grid.step({x:2,y:6},{x:3,y:6},true,false),false)
  assert.deepEqual(gs.getState(),before,'previews must be read-only')
})

test('once the main door is explicitly open, movement uses the corrected thresholds and preserves inner closed doors', () => {
  gs.resetState()
  const state=gs.getState()
  state.sceneMemory={doorStates:{front:'open'}}
  const floor=executeNavigation('player',{kind:'room',roomId:'8'})
  assert.equal(floor.goalReached,true)
  assert.ok(floor.path.some(c=>c.x===10&&c.y===9))
  assert.ok(floor.path.some(c=>c.x===10&&c.y===8))
  const office=executeNavigation('player',{kind:'room',roomId:'5'})
  assert.equal(office.stopDoorId,'floor-office')
  assert.deepEqual(office.finalPosition,{x:6,y:7})
  state.sceneMemory.doorStates['floor-office']='open'
  const entered=executeNavigation('player',{kind:'room',roomId:'5'})
  assert.equal(entered.goalReached,true)
  assert.equal(entered.finalRoomId,'5')
  gs.resetState()
})
