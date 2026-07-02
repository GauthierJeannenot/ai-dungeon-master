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
const { inferAdventureRoomId } = require(path.join(process.cwd(), 'lib/adventure-map.ts'))

test.after(() => {
  restoreTsRequire()
})

// Bornes du moteur (mcp-server/rules.ts MAP_BOUNDS).
const BOUNDS = { minX: 0, maxX: 16, minY: 0, maxY: 14 }

function inBounds(cell) {
  return cell.x >= BOUNDS.minX && cell.x <= BOUNDS.maxX && cell.y >= BOUNDS.minY && cell.y <= BOUNDS.maxY
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
  const findRoom = roomId => map.rooms.find(room => room.id === roomId)

  test(`[${label}] rooms are within engine bounds and resolve deterministically`, () => {
    for (const room of map.rooms) {
      assert.ok(inBounds({ x: room.zone.minX, y: room.zone.minY }), `${room.name}: coin min hors carte`)
      assert.ok(inBounds({ x: room.zone.maxX, y: room.zone.maxY }), `${room.name}: coin max hors carte`)
      assert.ok(room.zone.minX <= room.zone.maxX && room.zone.minY <= room.zone.maxY, `${room.name}: zone inversée`)
    }
    // NB : on n'exige PAS l'absence de chevauchement — les salles en L sont
    // modélisées par des boîtes englobantes rectangulaires qui peuvent se
    // recouvrir (ex. Grammy's salles 5/8 partagent (6,8)). Le moteur
    // désambiguïse par l'ordre d'itération : inferAdventureRoomId renvoie le
    // PREMIER match. On vérifie que chaque case d'une salle résout bien vers UNE
    // salle réelle du module (jamais null → « hors salle » inattendu).
    for (const room of map.rooms) {
      for (let x = room.zone.minX; x <= room.zone.maxX; x++) {
        for (let y = room.zone.minY; y <= room.zone.maxY; y++) {
          const resolved = inferAdventureRoomId({ x, y }, adventure.id)
          assert.ok(resolved !== null, `${adventure.id}: case (${x},${y}) de la salle ${room.id} ne résout vers aucune salle`)
          assert.ok(map.rooms.some(r => r.id === resolved), `${adventure.id}: (${x},${y}) résout vers une salle inexistante ${resolved}`)
        }
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
    assert.ok(map.initialPlayer.level >= 1, 'niveau du joueur invalide')
    assert.ok(map.initialPlayer.hp.current > 0 && map.initialPlayer.hp.current <= map.initialPlayer.hp.max, 'PV incohérents')
    assert.ok(Array.isArray(map.initialPlayer.inventory) && map.initialPlayer.inventory.length > 0, 'inventaire vide')
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
    for (const npc of map.npcs) {
      if (npc.roomId !== null) {
        const room = findRoom(npc.roomId)
        assert.ok(room, `PNJ ${npc.id}: salle inconnue ${npc.roomId}`)
        assert.ok(roomContains(room, npc.cell), `PNJ ${npc.id} hors de sa salle`)
      }
      assert.ok(inBounds(npc.cell), `PNJ ${npc.id} hors carte`)
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

  test(`[${label}] battlemap asset exists with the exact grid dimensions`, () => {
    const assetPath = path.join(process.cwd(), 'public', adventure.battlemapImage.replace(/^\//, ''))
    const png = fs.readFileSync(assetPath)
    const width = png.readUInt32BE(16)
    const height = png.readUInt32BE(20)
    assert.equal(width % adventure.grid.cols, 0, 'largeur non multiple du nombre de colonnes')
    assert.equal(height % adventure.grid.rows, 0, 'hauteur non multiple du nombre de rangées')
    assert.equal(width / adventure.grid.cols, height / adventure.grid.rows, 'cases non carrées')
  })
}
