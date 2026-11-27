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
const { listMonsterTypes } = require(path.join(process.cwd(), 'lib/srd/monsters.ts'))

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
  return (room.areas ?? [room.zone]).some(area => cell.x >= area.minX && cell.x <= area.maxX &&
    cell.y >= area.minY && cell.y <= area.maxY)
}

// Deux zones se touchent (chevauchement ou bord commun, jamais un simple coin)
// — même définition que lib/dm/scene-map.ts. Sert à valider que les cloisons
// déclarées portent bien sur des salles réellement CONTIGUËS.
function zonesTouch(a, b) {
  const xOverlap = a.minX <= b.maxX && b.minX <= a.maxX
  const yOverlap = a.minY <= b.maxY && b.minY <= a.maxY
  if (xOverlap && yOverlap) return true
  const xTouch = a.maxX + 1 === b.minX || b.maxX + 1 === a.minX
  const yTouch = a.maxY + 1 === b.minY || b.maxY + 1 === a.minY
  return (xTouch && yOverlap) || (yTouch && xOverlap)
}

// Types de monstres réellement définis dans le moteur MCP : extraits du source
// de phase-tools.ts (entrées `key: { type: 'key', ... }` du template record).
const MONSTER_TYPES = new Set(listMonsterTypes())

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

  test(`[${label}] navigation destinations and fog regions reference rooms on their own map`, () => {
    for (const spec of map.maps) {
      for (const ids of [spec.explorationRoomIds, spec.fogHiddenRoomIds]) {
        if (!ids) continue
        assert.equal(new Set(ids).size, ids.length)
        for (const id of ids) assert.equal(roomMapId(findRoom(id) ?? {}), spec.id, `unknown or wrong-map room ${id}`)
        for (const id of ids) assert.ok(findRoom(id), `unknown room ${id}`)
      }
      const scene = adventure.scenes?.[spec.id]
      for (const point of scene?.hotspots ?? []) if (point.destinationRoomId) {
        assert.ok(findRoom(point.destinationRoomId))
        assert.equal(roomMapId(findRoom(point.destinationRoomId)), spec.id)
      }
      for (const region of scene?.fogRegions ?? []) {
        assert.ok(findRoom(region.roomId))
        assert.equal(roomMapId(findRoom(region.roomId)), spec.id)
        assert.ok(spec.fogOfWar, 'illustration masks require engine fog')
        assert.ok(region.points.length >= 3)
        assert.ok(region.points.flat().every(value => Number.isFinite(value) && value >= 0 && value <= 100))
      }
    }
  })

  test(`[${label}] door thresholds stay on their authored side and map`, () => {
    const ids = new Set()
    for (const door of map.doors ?? []) {
      assert.equal(ids.has(door.id), false, `duplicate door ${door.id}`)
      ids.add(door.id)
      assert.equal(door.sides.length, 2)
      assert.notEqual(door.sides[0].roomId, door.sides[1].roomId)
      const rooms = door.sides.map(side => findRoom(side.roomId))
      assert.ok(rooms.every(Boolean))
      assert.equal(roomMapId(rooms[0]), roomMapId(rooms[1]))
      for (const side of door.sides) {
        assert.equal(inferRoomIdOnMap(side.cell, roomMapId(findRoom(side.roomId)), label), side.roomId, `${door.id}: wrong side at ${JSON.stringify(side.cell)}`)
      }
    }
  })

  test(`[${label}] maps are declared, unique, and rooms reference them`, () => {
    assert.ok(Array.isArray(map.maps) && map.maps.length >= 1, 'un module doit déclarer au moins une map')
    const mapIds = new Set(map.maps.map(spec => spec.id))
    assert.equal(mapIds.size, map.maps.length, 'mapIds dupliqués')
    for (const spec of map.maps) {
      assert.ok(spec.grid.cols > 0 && spec.grid.rows > 0, `map ${spec.id}: grille invalide`)
      assert.ok(spec.name, `map ${spec.id}: nom manquant`)
      // cellSize est optionnel (rendu uniquement) ; s'il est présent, borne
      // raisonnable pour éviter une valeur absurde. Voir docs/battlemap-viewport.md.
      if (spec.cellSize !== undefined) {
        assert.ok(
          Number.isFinite(spec.cellSize) && spec.cellSize >= 16 && spec.cellSize <= 256,
          `map ${spec.id}: cellSize hors bornes (16–256)`
        )
      }
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
      if(room.areas) {
        assert.ok(room.areas.length>0,`${room.name}: empty exact footprint`)
        for(const area of room.areas) {
          assert.ok(area.minX<=area.maxX&&area.minY<=area.maxY,`${room.name}: invalid exact footprint`)
          assert.ok(area.minX>=room.zone.minX&&area.maxX<=room.zone.maxX&&area.minY>=room.zone.minY&&area.maxY<=room.zone.maxY,`${room.name}: exact footprint outside bounding box`)
        }
      }
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
          if(!roomContains(room,{x,y})) continue
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

    const clueIds = new Set()
    for (const clue of map.clues ?? []) {
      assert.ok(clue.id && !clueIds.has(clue.id), `indice vide ou dupliqué ${clue.id}`)
      clueIds.add(clue.id)
      assert.ok(clue.text.trim(), `${clue.id}: texte vide`)
      assert.ok(clue.sourceNpcIds.length > 0, `${clue.id}: aucun témoin`)
      for (const npcId of clue.sourceNpcIds) assert.ok(npcIds.has(npcId), `${clue.id}: témoin inconnu ${npcId}`)
    }
    for (const scene of Object.values(adventure.scenes ?? {})) {
      for (const entry of [...scene.hotspots, ...(scene.actions ?? [])]) {
        if (entry.requiresClueId) assert.ok(clueIds.has(entry.requiresClueId), `indice de navigation inconnu ${entry.requiresClueId}`)
      }
    }

    for (const transition of map.mapTransitions) {
      assert.ok(mapIds.has(transition.fromMapId), `${transition.id}: fromMapId inconnu`)
      assert.ok(mapIds.has(transition.toMapId), `${transition.id}: toMapId inconnu`)
      assert.notEqual(transition.fromMapId, transition.toMapId, `${transition.id}: transition vers soi-même`)
      const arrivalRoom = findRoom(transition.arrivalRoomId)
      assert.ok(arrivalRoom, `${transition.id}: arrivalRoomId inconnu`)
      assert.equal(roomMapId(arrivalRoom), transition.toMapId, `${transition.id}: salle d'arrivée hors de la map de destination`)
      assert.ok(roomContains(arrivalRoom, transition.arrivalCell), `${transition.id}: arrivalCell hors de la salle d'arrivée`)
      if (transition.passage) {
        const departure = findRoom(transition.passage.roomId)
        assert.ok(departure, `${transition.id}: unknown departure room`)
        assert.equal(roomMapId(departure), transition.fromMapId)
        assert.ok(roomContains(departure, transition.passage.cell), `${transition.id}: departure outside room`)
        const from = map.maps.find(m => m.id === transition.fromMapId)
        const to = map.maps.find(m => m.id === transition.toMapId)
        assert.ok(from.travelGroup, `${transition.id}: local passage needs a story group`)
        assert.equal(from.travelGroup, to.travelGroup)
        assert.ok(map.mapTransitions.some(back => back.passage && back.fromMapId === to.id && back.toMapId === from.id), `${transition.id}: no return staircase`)
      }
      for (const companion of transition.companions ?? []) {
        assert.ok(npcIds.has(companion), `${transition.id}: compagnon inconnu ${companion}`)
      }
    }

    assert.equal(new Set(map.campaignTracking?.encounterIds??[]).size,(map.campaignTracking?.encounterIds??[]).length,'Tracked encounter IDs are unique')
    for(const id of map.campaignTracking?.encounterIds??[])assert.ok(encounterIdSet.has(id),`Tracked encounter does not exist: ${id}`)
    for (const [mapId, quest] of Object.entries(map.mapQuests)) {
      assert.ok(mapIds.has(mapId), `quête pour map inconnue ${mapId}`)
      assert.equal(quest.mapId, mapId, `quête ${mapId}: mapId incohérent`)
      for (const objective of quest.objectives) {
        const check = objective.check
        if (objective.dialogue) {
          assert.ok(objective.dialogue.label.trim() && objective.dialogue.label.length <= 200, 'public objective label')
          assert.ok(objective.dialogue.npcIds.length && new Set(objective.dialogue.npcIds).size === objective.dialogue.npcIds.length, 'unique dialogue sources')
          for (const npcId of objective.dialogue.npcIds) assert.ok(npcIds.has(npcId), `unknown objective speaker ${npcId}`)
        }
        if (check.type === 'encounterResolved' || check.type === 'encounterOutcome') {
          assert.ok(encounterIdSet.has(check.encounterId), `objectif ${objective.id}: rencontre inconnue ${check.encounterId}`)
        } else if (check.type === 'npcDisposition') {
          assert.ok(npcIds.has(check.npcId), `objectif ${objective.id}: PNJ inconnu ${check.npcId}`)
        } else if (check.type === 'npcPartyArrival') {
          const npc=map.npcs.find(n=>n.id===check.npcId)
          assert.ok(npc, `objectif ${objective.id}: PNJ escorte inconnu ${check.npcId}`)
          assert.ok(roomIds.has(check.roomId), `objectif ${objective.id}: destination inconnue ${check.roomId}`)
          assert.ok(npc.party?.safeRoomIds.includes(check.roomId), `objectif ${objective.id}: destination non qualifiee pour cette escorte`)
        } else if (check.type === 'roomVisited') {
          assert.ok(roomIds.has(check.roomId), `objectif ${objective.id}: salle inconnue ${check.roomId}`)
        } else if (check.type === 'itemInInventory') {
          assert.ok(typeof check.item === 'string' && check.item.length > 0, `objectif ${objective.id}: item vide`)
        } else if (check.type === 'clueRevealed') {
          assert.ok(clueIds.has(check.clueId), `objectif ${objective.id}: indice inconnu ${check.clueId}`)
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

  test(`[${label}] authored ground items are unique and located on their declared map`, () => {
    const ids = new Set(map.initialPlayer.extraInventory?.map(item => item.id) ?? [])
    for (const drop of map.groundItems ?? []) {
      assert.ok(drop.item.id && !ids.has(drop.item.id), `duplicate ground item ${drop.item.id}`)
      ids.add(drop.item.id)
      const room = findRoom(drop.roomId)
      assert.ok(room, `${drop.item.id}: unknown room`)
      assert.equal(roomMapId(room), drop.mapId, `${drop.item.id}: wrong map`)
      assert.ok(roomContains(room, drop.position), `${drop.item.id}: outside its room`)
      assert.equal(inferRoomIdOnMap(drop.position, drop.mapId, label), drop.roomId)
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

  test(`[${label}] hooks only reference existing rooms`, () => {
    const roomIds = new Set(map.rooms.map(room => room.id))
    for (const roomId of Object.keys(map.roomHooks)) {
      assert.ok(roomIds.has(roomId), `hook pour salle inconnue ${roomId}`)
    }
    for (const roomId of roomIds) {
      assert.ok(map.roomHooks[roomId], `salle ${roomId} sans accroches mécaniques`)
    }

  })

  test(`[${label}] partitions reference contiguous, same-map rooms without duplicates`, () => {
    // Optionnel : un module sans cloison déclarée passe trivialement.
    const partitions = map.partitions ?? []
    assert.ok(Array.isArray(partitions), 'partitions doit être un tableau')
    const seen = new Set()
    const key = (a, b) => [a, b].sort().join('|')
    for (const pair of partitions) {
      assert.ok(Array.isArray(pair) && pair.length === 2, `cloison mal formée : ${JSON.stringify(pair)}`)
      const [a, b] = pair
      assert.notEqual(a, b, `cloison d'une salle avec elle-même : ${a}`)
      const roomA = findRoom(a)
      const roomB = findRoom(b)
      assert.ok(roomA, `cloison vers salle inconnue ${a}`)
      assert.ok(roomB, `cloison vers salle inconnue ${b}`)
      assert.equal(roomMapId(roomA), roomMapId(roomB), `cloison entre salles de maps différentes (${a}, ${b})`)
      // Une cloison n'a de sens qu'entre salles CONTIGUËS : sinon la scène-map
      // ne l'affiche jamais (elle ne parcourt que les voisines) = donnée morte.
      assert.ok(zonesTouch(roomA.zone, roomB.zone),
        `cloison (${a}, ${b}) entre salles NON contiguës — déclaration sans effet`)
      const k = key(a, b)
      assert.ok(!seen.has(k), `cloison en double (${a}, ${b})`)
      seen.add(k)
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
