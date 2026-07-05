// Cohérence des données de TOUS les modules d'aventure du registre.
// Boucle sur lib/adventures.ts (ADVENTURES) : chaque module doit satisfaire les
// mêmes invariants — zones dans les bornes moteur, rencontres/PNJ dans leurs
// salles, types de monstres réellement définis dans le moteur, hooks/transitions
// alignés, markdown parsable, battlemap à la grille.

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const { installTsRequireWithAliases } = require('./helpers/ts-require.cjs')

process.env.APP_LOG_BUFFER_ENABLED = 'false'
process.env.APP_LOG_LEVEL = 'error'
process.env.APP_LOG_PERSIST_ENABLED = 'false'

const restoreTsRequire = installTsRequireWithAliases()
const { ADVENTURES } = require(path.join(process.cwd(), 'lib/adventures.ts'))
const { parseAdventureModule } = require(path.join(process.cwd(), 'lib/context-loader.ts'))
const { inferRoomIdOnMap } = require(path.join(process.cwd(), 'lib/adventure-map.ts'))

test.after(() => {
  restoreTsRequire()
})

// Bornes du moteur dérivées de la grille du MODULE (mcp-server/rules.ts calcule
// MAP_BOUNDS de la même façon : maxX = cols-1, maxY = rows-1).
function boundsForGrid(grid) {
  return { minX: 0, maxX: grid.cols - 1, minY: 0, maxY: grid.rows - 1 }
}

function inBounds(cell, bounds) {
  return cell.x >= bounds.minX && cell.x <= bounds.maxX && cell.y >= bounds.minY && cell.y <= bounds.maxY
}

function roomContains(room, cell) {
  return cell.x >= room.zone.minX && cell.x <= room.zone.maxX &&
    cell.y >= room.zone.minY && cell.y <= room.zone.maxY
}

// Types de monstres réellement définis dans le moteur MCP : extraits du source
// de phase-tools.ts (entrées `key: { type: 'key', ... }` du template record).
function engineMonsterTypes() {
  const source = fs.readFileSync(path.join(process.cwd(), 'mcp-server/tools/phase-tools.ts'), 'utf8')
  const types = new Set()
  const pattern = /^\s{2}(\w+): \{\s*\n\s*type: '(\w+)'/gm
  let match
  while ((match = pattern.exec(source)) !== null) {
    if (match[1] === match[2]) types.add(match[1])
  }
  assert.ok(types.size >= 5, 'extraction des templates de monstres suspecte')
  return types
}

const MONSTER_TYPES = engineMonsterTypes()

// Un bloc de tests par module du registre.
for (const adventure of ADVENTURES) {
  const label = adventure.id
  const map = adventure.map
  const firstMapId = map.maps[0]?.id
  // Map d'une salle : mapId explicite, sinon première map du module.
  const roomMapId = room => room.mapId ?? firstMapId
  const boundsForRoom = room => {
    const spec = map.maps.find(m => m.id === roomMapId(room))
    return spec ? boundsForGrid(spec.grid) : null
  }
  const findRoom = roomId => map.rooms.find(room => room.id === roomId)

  test(`[${label}] maps are declared, unique, and rooms reference them`, () => {
    assert.ok(Array.isArray(map.maps) && map.maps.length >= 1, 'un module doit déclarer au moins une map')
    const mapIds = new Set(map.maps.map(spec => spec.id))
    assert.equal(mapIds.size, map.maps.length, 'mapIds dupliqués')
    for (const spec of map.maps) {
      assert.ok(spec.grid.cols > 0 && spec.grid.rows > 0, `map ${spec.id}: grille invalide`)
      assert.ok(spec.name, `map ${spec.id}: nom manquant`)
    }
    for (const room of map.rooms) {
      assert.ok(mapIds.has(roomMapId(room)), `salle ${room.id}: mapId inconnu ${roomMapId(room)}`)
    }
    // Numérotation GLOBALE : les roomId sont uniques sur tout le module,
    // toutes maps confondues (docs/multi-map-adventures.md, décision 4).
    const roomIds = map.rooms.map(room => room.id)
    assert.equal(new Set(roomIds).size, roomIds.length, 'roomIds dupliqués entre maps')
  })

  test(`[${label}] definition grid matches engine first-map grid (single source of truth)`, () => {
    assert.deepEqual(adventure.grid, map.maps[0].grid,
      'definition.grid et maps[0].grid divergent — la définition doit réexporter la grille moteur')
  })

  test(`[${label}] rooms are within their map bounds and resolve deterministically`, () => {
    for (const room of map.rooms) {
      const bounds = boundsForRoom(room)
      assert.ok(bounds, `${room.name}: map inconnue`)
      assert.ok(inBounds({ x: room.zone.minX, y: room.zone.minY }, bounds), `${room.name}: coin min hors carte`)
      assert.ok(inBounds({ x: room.zone.maxX, y: room.zone.maxY }, bounds), `${room.name}: coin max hors carte`)
      assert.ok(room.zone.minX <= room.zone.maxX && room.zone.minY <= room.zone.maxY, `${room.name}: zone inversée`)
    }
    // NB : on n'exige PAS l'absence de chevauchement — les salles en L sont
    // modélisées par des boîtes englobantes rectangulaires qui peuvent se
    // recouvrir (ex. Grammy's salles 5/8 partagent (6,8)). Le moteur
    // désambiguïse par l'ordre d'itération : inferRoomIdOnMap renvoie le
    // PREMIER match DE LA MAP. On vérifie que chaque case d'une salle résout
    // bien vers UNE salle réelle de sa map (jamais null → « hors salle »).
    for (const room of map.rooms) {
      for (let x = room.zone.minX; x <= room.zone.maxX; x++) {
        for (let y = room.zone.minY; y <= room.zone.maxY; y++) {
          const resolved = inferRoomIdOnMap({ x, y }, roomMapId(room), adventure.id)
          assert.ok(resolved !== null, `${adventure.id}: case (${x},${y}) de la salle ${room.id} ne résout vers aucune salle`)
          const resolvedRoom = findRoom(resolved)
          assert.ok(resolvedRoom, `${adventure.id}: (${x},${y}) résout vers une salle inexistante ${resolved}`)
          assert.equal(roomMapId(resolvedRoom), roomMapId(room),
            `${adventure.id}: (${x},${y}) résout vers une salle d'une autre map`)
        }
      }
    }
  })

  test(`[${label}] map transitions and quests are coherent and engine-checkable`, () => {
    const mapIds = new Set(map.maps.map(spec => spec.id))
    const encounterIdSet = new Set(Object.keys(map.encounters))
    const npcIds = new Set(map.npcs.map(npc => npc.id))
    const roomIds = new Set(map.rooms.map(room => room.id))

    for (const transition of map.mapTransitions) {
      assert.ok(mapIds.has(transition.fromMapId), `${transition.id}: fromMapId inconnu`)
      assert.ok(mapIds.has(transition.toMapId), `${transition.id}: toMapId inconnu`)
      assert.notEqual(transition.fromMapId, transition.toMapId, `${transition.id}: transition vers soi-même`)
      const arrivalRoom = findRoom(transition.arrivalRoomId)
      assert.ok(arrivalRoom, `${transition.id}: arrivalRoomId inconnu`)
      assert.equal(roomMapId(arrivalRoom), transition.toMapId, `${transition.id}: salle d'arrivée hors de la map de destination`)
      assert.ok(roomContains(arrivalRoom, transition.arrivalCell), `${transition.id}: arrivalCell hors de la salle d'arrivée`)
      for (const companion of transition.companions ?? []) {
        assert.ok(npcIds.has(companion), `${transition.id}: compagnon inconnu ${companion}`)
      }
    }

    for (const [mapId, quest] of Object.entries(map.mapQuests)) {
      assert.ok(mapIds.has(mapId), `quête pour map inconnue ${mapId}`)
      assert.equal(quest.mapId, mapId, `quête ${mapId}: mapId incohérent`)
      for (const objective of quest.objectives) {
        const check = objective.check
        if (check.type === 'encounterResolved') {
          assert.ok(encounterIdSet.has(check.encounterId), `objectif ${objective.id}: rencontre inconnue ${check.encounterId}`)
        } else if (check.type === 'npcDisposition') {
          assert.ok(npcIds.has(check.npcId), `objectif ${objective.id}: PNJ inconnu ${check.npcId}`)
        } else if (check.type === 'roomVisited') {
          assert.ok(roomIds.has(check.roomId), `objectif ${objective.id}: salle inconnue ${check.roomId}`)
        } else if (check.type === 'itemInInventory') {
          assert.ok(typeof check.item === 'string' && check.item.length > 0, `objectif ${objective.id}: item vide`)
        } else {
          assert.fail(`objectif ${objective.id}: type de condition inconnu ${check.type}`)
        }
      }
    }

    // Une map non-finale doit avoir une sortie ; toute map au-delà de la
    // première doit être atteignable (sens unique = progression linéaire ou DAG).
    if (map.maps.length > 1) {
      const reachable = new Set([map.maps[0].id])
      for (const transition of map.mapTransitions) {
        if (reachable.has(transition.fromMapId)) reachable.add(transition.toMapId)
      }
      for (const spec of map.maps) {
        assert.ok(reachable.has(spec.id), `map ${spec.id} inatteignable depuis la première map`)
      }
    }
  })

  test(`[${label}] entry cells exist for every room and sit inside it`, () => {
    for (const room of map.rooms) {
      const entry = map.entryCells[room.id]
      assert.ok(entry, `pas de point d'entrée pour la salle ${room.id}`)
      assert.ok(roomContains(room, entry), `entrée de la salle ${room.id} hors de sa zone`)
    }
    const startRoom = findRoom('1')
    assert.ok(startRoom && roomContains(startRoom, map.startCell), 'startCell hors de la salle 1')
  })

  test(`[${label}] initial player is coherent`, () => {
    // Le PERSONNAGE apporte PV/kit ; l'aventure ne règle que le niveau + des
    // objets propres optionnels (docs/playable-characters.md).
    assert.ok(map.initialPlayer.level >= 1, 'niveau du joueur invalide')
    if (map.initialPlayer.extraInventory !== undefined) {
      assert.ok(Array.isArray(map.initialPlayer.extraInventory), 'extraInventory doit être un tableau')
    }
  })

  test(`[${label}] encounters reference real rooms, real monster types, coherent cells`, () => {
    for (const encounter of Object.values(map.encounters)) {
      const room = findRoom(encounter.roomId)
      assert.ok(room, `${encounter.id}: salle inconnue ${encounter.roomId}`)

      const cells = new Set()
      if (encounter.playerCell) {
        assert.ok(roomContains(room, encounter.playerCell), `${encounter.id}: playerCell hors salle`)
        cells.add(`${encounter.playerCell.x},${encounter.playerCell.y}`)
      }
      for (const monster of encounter.monsters) {
        assert.ok(MONSTER_TYPES.has(monster.monsterType),
          `${encounter.id}: type de monstre inconnu du moteur "${monster.monsterType}"`)
        assert.ok(roomContains(room, monster.cell), `${encounter.id}: ${monster.monsterType} hors salle`)
        const key = `${monster.cell.x},${monster.cell.y}`
        assert.ok(!cells.has(key), `${encounter.id}: deux entités sur la case (${key})`)
        cells.add(key)
        if (monster.hpOverride !== undefined) {
          assert.ok(monster.hpOverride > 0, `${encounter.id}: hpOverride invalide`)
        }
      }
    }
  })

  test(`[${label}] npcs sit inside their room and do not collide with encounter spawns`, () => {
    const mapIds = new Set(map.maps.map(spec => spec.id))
    for (const npc of map.npcs) {
      let npcMapId = npc.mapId ?? firstMapId
      if (npc.roomId !== null) {
        const room = findRoom(npc.roomId)
        assert.ok(room, `PNJ ${npc.id}: salle inconnue ${npc.roomId}`)
        assert.ok(roomContains(room, npc.cell), `PNJ ${npc.id} hors de sa salle`)
        npcMapId = npc.mapId ?? roomMapId(room)
      }
      assert.ok(mapIds.has(npcMapId), `PNJ ${npc.id}: mapId inconnu ${npcMapId}`)
      const npcBounds = boundsForGrid(map.maps.find(spec => spec.id === npcMapId).grid)
      assert.ok(inBounds(npc.cell, npcBounds), `PNJ ${npc.id} hors carte`)
      for (const encounter of Object.values(map.encounters)) {
        for (const monster of encounter.monsters) {
          assert.ok(!(monster.cell.x === npc.cell.x && monster.cell.y === npc.cell.y),
            `PNJ ${npc.id} superposé au spawn de ${encounter.id}`)
        }
      }
    }
  })

  test(`[${label}] hooks, transitions and aliases only reference existing rooms`, () => {
    const roomIds = new Set(map.rooms.map(room => room.id))
    for (const roomId of Object.keys(map.roomHooks)) {
      assert.ok(roomIds.has(roomId), `hook pour salle inconnue ${roomId}`)
    }
    for (const roomId of roomIds) {
      assert.ok(map.roomHooks[roomId], `salle ${roomId} sans accroches mécaniques`)
    }
    for (const transition of [...map.doorTransitions, ...map.forwardTransitions]) {
      assert.ok(roomIds.has(transition.fromRoomId), `transition depuis salle inconnue ${transition.fromRoomId}`)
      assert.ok(roomIds.has(transition.toRoomId), `transition vers salle inconnue ${transition.toRoomId}`)
    }
    for (const alias of [...map.roomNavigationAliases, ...map.roomContextAliases]) {
      assert.ok(roomIds.has(alias.roomId), `alias vers salle inconnue ${alias.roomId}`)
    }
  })

  test(`[${label}] hooks only mention encounters that exist`, () => {
    const encounterIds = new Set(Object.keys(map.encounters))
    for (const match of Object.values(map.roomHooks).join('\n').matchAll(/start_encounter\("(\w+)"\)/g)) {
      assert.ok(encounterIds.has(match[1]), `hook référence une rencontre inconnue "${match[1]}"`)
    }
  })

  test(`[${label}] adventure-module.md parses into the same room set`, () => {
    const moduleText = fs.readFileSync(path.join(process.cwd(), adventure.contextDir, 'adventure-module.md'), 'utf8')
    const parsed = parseAdventureModule(moduleText)

    const mapRoomIds = new Set(map.rooms.map(room => room.id))
    const mdRoomIds = new Set(Object.keys(parsed.rooms))
    assert.deepEqual([...mdRoomIds].sort(), [...mapRoomIds].sort(),
      'les sections "## Salle N" du markdown ne correspondent pas aux salles de map.ts')

    for (const roomId of mapRoomIds) {
      const entry = map.entryCells[roomId]
      assert.ok(parsed.rooms[roomId].includes(`(${entry.x}, ${entry.y})`),
        `la salle ${roomId} du markdown ne mentionne pas son point d'entrée (${entry.x}, ${entry.y})`)
    }
  })

  test(`[${label}] battlemap assets exist with the exact grid dimensions (per map)`, () => {
    for (const spec of map.maps) {
      // Image de la map : battlemapImages[mapId] (multi-map), repli sur
      // battlemapImage (modules 1-map historiques).
      const image = (adventure.battlemapImages ?? {})[spec.id] ?? adventure.battlemapImage
      assert.ok(image, `map ${spec.id}: aucune image de battlemap déclarée`)
      const assetPath = path.join(process.cwd(), 'public', image.replace(/^\//, ''))
      const png = fs.readFileSync(assetPath)
      const width = png.readUInt32BE(16)
      const height = png.readUInt32BE(20)
      assert.equal(width % spec.grid.cols, 0, `map ${spec.id}: largeur non multiple du nombre de colonnes`)
      assert.equal(height % spec.grid.rows, 0, `map ${spec.id}: hauteur non multiple du nombre de rangées`)
      assert.equal(width / spec.grid.cols, height / spec.grid.rows, `map ${spec.id}: cases non carrées`)
    }
  })
}
