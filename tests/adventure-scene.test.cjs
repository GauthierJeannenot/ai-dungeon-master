const assert = require('node:assert/strict')
const test = require('node:test')
const fs = require('node:fs')
const ts = require('typescript')
const { installTsRequireWithAliases } = require('./helpers/ts-require.cjs')
const restore = installTsRequireWithAliases()
const previousTsx = require.extensions['.tsx']
const previousCss = require.extensions['.css']
require.extensions['.tsx'] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText, filename)
require.extensions['.css'] = mod => { mod.exports = {} }
test.after(() => {
  restore()
  if (previousTsx) require.extensions['.tsx'] = previousTsx; else delete require.extensions['.tsx']
  if (previousCss) require.extensions['.css'] = previousCss; else delete require.extensions['.css']
})
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const AdventureScene = require('../components/AdventureScene.tsx').default
const { YELLOWCREST_CONTENT } = require('../adventures/sarah-of-yellowcrest-manor/definition.ts')
const { GRAMMYS_CONTENT } = require('../adventures/grammys-country-apple-pie/definition.ts')
const { FEY_SHADOW_FAIR_CONTENT } = require('../adventures/fey-shadow-fair/definition.ts')
const { FEY_SHADOW_FAIR_MAP } = require('../adventures/fey-shadow-fair/map.ts')
const { buildInitialGameState } = require('../lib/initial-game-state.ts')
const { getAdventureScene, getCombatView, getTacticalView } = require('../lib/adventures.ts')
const { explorationDestinationRooms } = require('../lib/exploration-navigation.ts')
const MapFog = require('../components/MapFog.tsx').default
const Battlemap = require('../components/Battlemap.tsx').default

test('barn combat view follows saved combat state without changing engine maps or coordinates', () => {
  const state = buildInitialGameState('sarah-of-yellowcrest-manor','fighter')
  state.currentMapId = 'greenfast'; state.currentRoomId = '15'; state.player.position = {x:15,y:14}
  assert.equal(getCombatView(YELLOWCREST_CONTENT,state),undefined)
  state.phase = 'combat'
  const before = structuredClone(state)
  const view = getCombatView(YELLOWCREST_CONTENT,state)
  assert.match(view.image,/barn-topdown\.png$/)
  assert.deepEqual(view.bounds,{minX:12,maxX:21,minY:13,maxY:21})
  assert.deepEqual(getCombatView(YELLOWCREST_CONTENT,JSON.parse(JSON.stringify(state))),view)
  assert.deepEqual(state,before,'selecting artwork cannot teleport or mutate the game')
  state.currentTurn='player';state.initiativeOrder=['player']
  const html = renderToStaticMarkup(React.createElement(Battlemap,{
    gameState:state,image:view.image,viewport:view.bounds,cols:30,rows:22,onMove:()=>{},
  }))
  assert.match(html,/width:480px;height:432px/,'viewport uses ten by nine square cells')
  assert.match(html,/left:-576px;top:-624px/,'world overlays are translated by the authored origin')
  assert.match(html,/Se déplacer en \(15, 15\)/,'destination buttons keep the authoritative global coordinates')
  state.sceneMemory = { ...state.sceneMemory, roundEvents: {barn_horse_escape:{eventId:'barn_horse_escape'}} }
  assert.match(getCombatView(YELLOWCREST_CONTENT,state).image,/barn-horse-escaped\.png$/)
  assert.match(getCombatView(YELLOWCREST_CONTENT,JSON.parse(JSON.stringify(state))).image,/barn-horse-escaped\.png$/)
  state.monsters.pursuer = {isAlive:true,position:{x:15,y:12}}
  assert.equal(getCombatView(YELLOWCREST_CONTENT,state),undefined,'an outside combatant requires the complete map')
  delete state.monsters.pursuer
  state.phase = 'exploration'
  assert.equal(getCombatView(YELLOWCREST_CONTENT,state),undefined)
  assert.equal(getAdventureScene(YELLOWCREST_CONTENT,state),YELLOWCREST_CONTENT.scenes.greenfast)
})

function render(state) {
  return renderToStaticMarkup(React.createElement(AdventureScene, {
    scene: YELLOWCREST_CONTENT.scenes.waterdeep, mapId: 'waterdeep',
    gameState: state, disabled: false, onAction: () => {},
  }))
}

test('bakery exterior conceals interiors under its roof and tactical fog tracks discovered rooms', () => {
  const state = buildInitialGameState()
  const scene = GRAMMYS_CONTENT.scenes.bakery
  assert.match(scene.image, /bakery-exterior.png$/)
  assert.equal(scene.fogRegions, undefined, 'the roof conceals interiors without obsolete aerial masks')
  assert.ok(scene.hotspots.every(point => point.roomIds.some(id => ['1','2','3'].includes(id))))
  state.player.position = {x:11,y:13}; state.sceneMemory = {doorStates:{front:'open'}}
  const tactical = renderToStaticMarkup(React.createElement(MapFog, {gameState:state,width:1360,height:1200}))
  assert.match(tactical, /<mask/)
  assert.equal((tactical.match(/fill="white"/g) ?? []).length, 5, 'four unknown interiors; L-shaped floor has two rectangles')
})

test('all illustrated exploration maps share destination filtering and preserve identical map and legend requests', () => {
  const escape = label => label.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll("'", '&#x27;')
  for (const [content,mapId,roomId] of [[GRAMMYS_CONTENT,'bakery','1'], [YELLOWCREST_CONTENT,'waterdeep','4'],
    [YELLOWCREST_CONTENT,'greenfast','11'], [YELLOWCREST_CONTENT,'rest','33'], [FEY_SHADOW_FAIR_CONTENT,'fair','1']]) {
    const state = buildInitialGameState(content.id)
    state.currentMapId = mapId; state.currentRoomId = roomId
    const scene = content.scenes[mapId]
    const accessible = new Set(explorationDestinationRooms(state, true).map(room => room.id))
    const html = renderToStaticMarkup(React.createElement(AdventureScene, {scene,mapId,gameState:state,disabled:false,onAction:()=>{}}))
    for (const point of scene.hotspots.filter(point => point.destinationRoomId && !point.requiresClueId)) {
      const escapedLabel = escape(point.label)
      assert.equal(html.includes(`aria-label="${escapedLabel}"`), point.roomIds.includes(roomId) && accessible.has(point.destinationRoomId), `${mapId}: ${point.label}`)
    }
    const buttons = []
    const requests = []
    function collect(node) {
      React.Children.forEach(node, child => {
        if (!React.isValidElement(child)) return
        if (child.type === 'button') buttons.push(child)
        collect(child.props.children)
      })
    }
    collect(AdventureScene({scene,mapId,gameState:state,disabled:false,onAction:message=>requests.push(message)}))
    for (const button of buttons) button.props.onClick()
    for (const point of scene.hotspots.filter(point => point.destinationRoomId && point.marker && !point.requiresClueId)) {
      assert.equal(requests.filter(message => message === point.message).length, accessible.has(point.destinationRoomId) && point.roomIds.includes(roomId) ? 2 : 0, 'map pin and legend submit the same request')
    }
    state.player.conditions = ['restrained']
    const blocked = renderToStaticMarkup(React.createElement(AdventureScene, {scene,mapId,gameState:state,disabled:false,onAction:()=>{}}))
    for (const point of scene.hotspots.filter(point => point.destinationRoomId)) {
      assert.ok(!blocked.includes(`aria-label="${escape(point.label)}"`), `${mapId}: inaccessible destination has no pin or legend`)
    }
  }
})

test('Greenfast offers all seven locations from every village zone, including after resume', () => {
  const scene = YELLOWCREST_CONTENT.scenes.greenfast
  const state = buildInitialGameState(YELLOWCREST_CONTENT.id)
  state.currentMapId = 'greenfast'
  for (const current of [state, JSON.parse(JSON.stringify(state))]) {
    for (const roomId of ['10', '11', '12', '13', '14', '15', '16']) {
      current.currentRoomId = roomId
      const html = renderToStaticMarkup(React.createElement(AdventureScene, {
        scene, mapId: 'greenfast', gameState: current, disabled: false, onAction: () => {},
      }))
      for (const hotspot of scene.hotspots) assert.ok(html.includes(`aria-label="${hotspot.label}"`))
      assert.equal((html.match(/<button\b/g) ?? []).length, roomId === '16' ? 15 : 14)
    }
  }
})

test('cemetery pins and legend only request movement, including after resume; visiting never authorizes burial', () => {
  const scene = YELLOWCREST_CONTENT.scenes.rest
  const state = buildInitialGameState(YELLOWCREST_CONTENT.id)
  state.currentMapId = 'rest'
  const renderRest = current => renderToStaticMarkup(React.createElement(AdventureScene, {
    scene, mapId: 'rest', gameState: current, disabled: false, onAction: () => {},
  }))
  for (const current of [state, JSON.parse(JSON.stringify(state))]) {
    for (const roomId of ['33', '34', '35']) {
      current.currentRoomId = roomId
      const html = renderRest(current)
      assert.equal((html.match(/<button\b/g) ?? []).length, 6, 'three pins and three matching legend buttons')
      for (const name of ['Allée du cimetière', 'Tombes des serviteurs', 'Mausolée consacré']) {
        assert.ok(html.includes(`aria-label="${name}"`))
      }
      assert.doesNotMatch(html, /Inhumer les cendres|Terminer la campagne|Partir pour/, 'navigation adds no final decision')
    }
    current.currentMapId = 'temple'; current.currentRoomId = '24'
    assert.doesNotMatch(renderRest(current), /<button\b/, 'cemetery pins are absent from other rooms')
  }
  const messages = []
  state.currentMapId = 'rest'; state.currentRoomId = '33'
  const tree = AdventureScene({ scene, mapId: 'rest', gameState: state, disabled: false, onAction: message => messages.push(message) })
  const buttons = []
  function visit(node) {
    React.Children.forEach(node, child => {
      if (!React.isValidElement(child)) return
      if (child.type === 'button') buttons.push(child)
      visit(child.props.children)
    })
  }
  visit(tree)
  for (const button of buttons) button.props.onClick()
  assert.deepEqual(messages.slice(0, 3), scene.hotspots.map(h => h.message))
  assert.deepEqual(messages.slice(3), messages.slice(0, 3))
  assert.match(messages[2], /Si sa porte est fermée, je m’arrête devant sans l’ouvrir/)
  assert.match(messages[2], /Je ne dépose pas l’urne et ne procède pas à l’inhumation/)
  assert.doesNotMatch(messages.join(' '), /drop_item|reveal_npc|travel_to_map/)
  const png = fs.readFileSync(`public${scene.image}`)
  assert.equal(png.readUInt32BE(16), scene.width)
  assert.equal(png.readUInt32BE(20), scene.height)
})

test('Greenfast pin, legend and departure are hidden until the residence is revealed, including after resuming', () => {
  const state = buildInitialGameState(YELLOWCREST_CONTENT.id)
  state.currentMapId = 'waterdeep'
  state.npcs.cobbler.visible = true
  state.npcs.cobbler.disposition = 'helpful'
  state.roomsVisited.push('7')
  for (const roomId of ['4', '7', '9']) {
    state.currentRoomId = roomId
    assert.doesNotMatch(render(state), /Greenfast/, 'visits and approval reveal no destination')
    assert.match(render(state), /Manoir Yellowcrest/)
  }
  state.npcs.cobbler.disposition = 'offended'
  state.worldFacts = [{ id: 'revealed', clueId: 'greenfast_lead', text: 'Résidence révélée.',
    source: 'reveal_clue:cobbler', mapId: 'waterdeep', expires: 'never' }]
  for (const resumed of [state, JSON.parse(JSON.stringify(state))]) {
    resumed.currentRoomId = '4'
    const streets = render(resumed)
    assert.match(streets, /aria-label="Route vers Greenfast"/)
    assert.equal((streets.match(/Route vers Greenfast/g) ?? []).length, 4, 'pin attributes, label and legend appear')
    assert.doesNotMatch(streets, /Partir pour Greenfast/)
    resumed.currentRoomId = '9'
    assert.match(render(resumed), /Partir pour Greenfast/)
  }
})

test('bakery switches between the outdoor illustration and tactical interiors after movement and resume', () => {
  const state = buildInitialGameState(GRAMMYS_CONTENT.id)
  const expected = {
    '1': ['Mac, le vieux pommier', 'Verger de pommiers', 'Tas de déchets', 'Porte extérieure'],
    '2': ['Verger de pommiers', 'Tas de déchets', 'Porte extérieure', 'Chemin extérieur'],
    '3': ['Verger de pommiers', 'Tas de déchets', 'Porte extérieure', 'Chemin extérieur'],
  }
  for (const current of [state, JSON.parse(JSON.stringify(state))]) {
    // Revisit rooms after entering others: previously visited points must disappear.
    for (const roomId of ['1', '4', '8', '5', '8', '7', '8', '9', '4', '1', '2', '3']) {
      current.currentRoomId = roomId
      current.roomsVisited.push(roomId)
      const scene = getAdventureScene(GRAMMYS_CONTENT, current)
      if (!['1', '2', '3'].includes(roomId)) {
        assert.equal(scene, undefined, `room ${roomId} uses the tactical battlemap`)
        continue
      }
      assert.equal(scene, GRAMMYS_CONTENT.scenes.bakery)
      const html = renderToStaticMarkup(React.createElement(AdventureScene, {
        scene, mapId: 'bakery',
        gameState: current, disabled: false, onAction: () => {},
      }))
      const pins = [...html.matchAll(/<button[^>]*aria-label="([^"]+)"/g)].map(match => match[1])
      assert.deepEqual(pins.sort(), [...expected[roomId]].sort(), `points in room ${roomId}`)
      const buttons = html.match(/<button\b/g) ?? []
      assert.equal(buttons.length, pins.length * 2, 'legend must have exactly the same choices as the map')
      assert.doesNotMatch(html, /recette|coffre caché|tiroir piégé|épices cachées|dryade/i, 'pins reveal no hidden discoveries')
    }
    current.currentRoomId = undefined
    assert.equal(getAdventureScene(GRAMMYS_CONTENT, current), undefined, 'unknown location uses tactical fallback')
    const html = renderToStaticMarkup(React.createElement(AdventureScene, {
      scene: GRAMMYS_CONTENT.scenes.bakery, mapId: 'bakery',
      gameState: current, disabled: false, onAction: () => {},
    }))
    assert.doesNotMatch(html, /<button\b/, 'no guessed points when the current room is unknown')
    current.currentRoomId = '1'; current.phase = 'combat'
    assert.equal(getAdventureScene(GRAMMYS_CONTENT, current), undefined, 'outdoor combat uses the tactical map')
  }
})

test('bakery illustration keeps its intrinsic dimensions and does not replace the authoritative tactical map', () => {
  const scene = GRAMMYS_CONTENT.scenes.bakery
  const png = fs.readFileSync(`public${scene.image}`)
  assert.equal(png.readUInt32BE(16), scene.width)
  assert.equal(png.readUInt32BE(20), scene.height)
  assert.notEqual(scene.image, GRAMMYS_CONTENT.battlemapImage)
})

test('fair map pins and legend cover its nine public locations after movement and resume, without leaking into the wood', () => {
  const scene = FEY_SHADOW_FAIR_CONTENT.scenes.fair
  const state = buildInitialGameState(FEY_SHADOW_FAIR_CONTENT.id)
  const rooms = FEY_SHADOW_FAIR_MAP.rooms.filter(room => room.mapId === 'fair')
  const renderFair = current => renderToStaticMarkup(React.createElement(AdventureScene, {
    scene, mapId: 'fair', gameState: current, disabled: false, onAction: () => {},
  }))
  for (const current of [state, JSON.parse(JSON.stringify(state))]) {
    for (const room of rooms) {
      current.currentRoomId = room.id
      const html = renderFair(current)
      assert.equal((html.match(/aria-label="/g) ?? []).length, 10, 'one scene and nine location pins')
      assert.equal((html.match(/<button\b/g) ?? []).length, 18, 'nine matching legend buttons')
      assert.match(html, /aria-label="Le Portail des Vers Luisants"/)
      assert.doesNotMatch(html, /Cour du Prince|Maître Filou|objectifs manquants|Partir pour/)
    }
    current.currentMapId = 'wood'
    current.currentRoomId = '10'
    assert.doesNotMatch(renderFair(current), /<button\b/, 'fair choices never appear from a wood room')
  }
  const portal = scene.hotspots.find(hotspot => hotspot.marker === '5')
  assert.match(portal.message, /devant le Portail des Vers Luisants, sans le franchir ni quitter la foire/)
  assert.equal(FEY_SHADOW_FAIR_CONTENT.scenes.wood, undefined)
})

test('fair pins and legend submit the same player requests, including a portal approach without travel', () => {
  const scene = FEY_SHADOW_FAIR_CONTENT.scenes.fair
  const state = buildInitialGameState(FEY_SHADOW_FAIR_CONTENT.id)
  const messages = []
  const tree = AdventureScene({ scene, mapId: 'fair', gameState: state, disabled: false, onAction: message => messages.push(message) })
  const buttons = []
  function visit(node) {
    React.Children.forEach(node, child => {
      if (!React.isValidElement(child)) return
      if (child.type === 'button') buttons.push(child)
      visit(child.props.children)
    })
  }
  visit(tree)
  assert.equal(buttons.length, 18)
  for (const button of buttons) button.props.onClick()
  assert.deepEqual(messages.slice(0, 9), scene.hotspots.map(hotspot => hotspot.message))
  assert.deepEqual(messages.slice(9), messages.slice(0, 9), 'pins and legend have identical requests')
  assert.match(messages[4], /sans le franchir ni quitter la foire/)
})

test('fair illustration dimensions and pins agree with the engine layout used by ImageGen', () => {
  const scene = FEY_SHADOW_FAIR_CONTENT.scenes.fair
  const png = fs.readFileSync(`public${scene.image}`)
  assert.equal(png.readUInt32BE(16), scene.width)
  assert.equal(png.readUInt32BE(20), scene.height)
  assert.notEqual(scene.image, FEY_SHADOW_FAIR_CONTENT.battlemapImages.fair)
  const { grid } = FEY_SHADOW_FAIR_MAP.maps.find(map => map.id === 'fair')
  for (const hotspot of scene.hotspots) {
    const room = FEY_SHADOW_FAIR_MAP.rooms.find(room => room.id === hotspot.marker)
    assert.equal(room.mapId, 'fair')
    const x = (hotspot.bounds.x + hotspot.bounds.width / 2) / 100 * grid.cols
    const y = (hotspot.bounds.y + hotspot.bounds.height / 2) / 100 * grid.rows
    assert.ok(x >= room.zone.minX && x < room.zone.maxX + 1, `pin ${room.id} x is within its zone`)
    assert.ok(y >= room.zone.minY && y < room.zone.maxY + 1, `pin ${room.id} y is within its zone`)
    assert.ok(hotspot.message.toLocaleLowerCase('fr').includes(room.name.toLocaleLowerCase('fr')))
  }
})

test('bakery tactical framing zooms into interiors and restores full board when leaving or pursuing outside', () => {
  const state = buildInitialGameState()
  state.currentRoomId = '4'; state.player.position = {x:11,y:12}
  const view = getTacticalView(GRAMMYS_CONTENT,state)
  assert.deepEqual(view.bounds,{minX:3,maxX:13,minY:4,maxY:12})
  const png = fs.readFileSync(require('node:path').join(__dirname,'../public',view.image))
  const width = png.readUInt32BE(16), height = png.readUInt32BE(20)
  assert.ok(width >= 1386 && height >= 1134, 'interior art retains the generated detail')
  assert.equal(width * 9, height * 11, 'high-resolution art keeps square cells in the 11 by 9 viewport')
  state.phase = 'combat'
  assert.deepEqual(getTacticalView(GRAMMYS_CONTENT,state),view)
  state.monsters.outside = {isAlive:true,position:{x:11,y:13}}
  assert.equal(getTacticalView(GRAMMYS_CONTENT,state),undefined)
  delete state.monsters.outside
  state.phase = 'exploration'; state.currentRoomId = '1'; state.player.position = {x:11,y:13}
  assert.equal(getTacticalView(GRAMMYS_CONTENT,state),undefined)
  assert.equal(getAdventureScene(GRAMMYS_CONTENT,state),GRAMMYS_CONTENT.scenes.bakery)
})
