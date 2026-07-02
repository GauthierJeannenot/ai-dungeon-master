// Cohérence des données du module « La Crypte des Marées ».
// Le module n'est pas encore branché au moteur (voir
// docs/multi-adventure-architecture.md) : ce test garantit que tout ce que le
// futur câblage supposera vrai l'est déjà — zones dans les bornes de la carte,
// rencontres/PNJ dans leurs salles, types de monstres réellement définis dans
// le moteur, markdown parsable par context-loader, hooks alignés sur les salles.

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const { installTsRequireWithAliases } = require('./helpers/ts-require.cjs')

process.env.APP_LOG_BUFFER_ENABLED = 'false'
process.env.APP_LOG_LEVEL = 'error'
process.env.APP_LOG_PERSIST_ENABLED = 'false'

const restoreTsRequire = installTsRequireWithAliases()
const map = require(path.join(process.cwd(), 'adventures/tide-crypt/map.ts'))
const { parseAdventureModule } = require(path.join(process.cwd(), 'lib/context-loader.ts'))

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

function findRoom(roomId) {
  return map.TIDE_CRYPT_ROOMS.find(room => room.id === roomId)
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

test('tide-crypt: rooms are within engine bounds and never overlap', () => {
  for (const room of map.TIDE_CRYPT_ROOMS) {
    assert.ok(inBounds({ x: room.zone.minX, y: room.zone.minY }), `${room.name}: coin min hors carte`)
    assert.ok(inBounds({ x: room.zone.maxX, y: room.zone.maxY }), `${room.name}: coin max hors carte`)
    assert.ok(room.zone.minX <= room.zone.maxX && room.zone.minY <= room.zone.maxY, `${room.name}: zone inversée`)
  }

  for (const a of map.TIDE_CRYPT_ROOMS) {
    for (const b of map.TIDE_CRYPT_ROOMS) {
      if (a.id >= b.id) continue
      const overlap = a.zone.minX <= b.zone.maxX && b.zone.minX <= a.zone.maxX &&
        a.zone.minY <= b.zone.maxY && b.zone.minY <= a.zone.maxY
      assert.equal(overlap, false, `salles ${a.id} et ${b.id} se chevauchent`)
    }
  }
})

test('tide-crypt: entry cells exist for every room and sit inside it', () => {
  for (const room of map.TIDE_CRYPT_ROOMS) {
    const entry = map.TIDE_CRYPT_ENTRY_CELLS[room.id]
    assert.ok(entry, `pas de point d'entrée pour la salle ${room.id}`)
    assert.ok(roomContains(room, entry), `entrée de la salle ${room.id} hors de sa zone`)
  }
  assert.ok(
    roomContains(findRoom('1'), map.TIDE_CRYPT_START_CELL),
    'position initiale du joueur hors de la salle 1'
  )
})

test('tide-crypt: encounters reference real rooms, real monster types, coherent cells', () => {
  const monsterTypes = engineMonsterTypes()

  for (const encounter of Object.values(map.TIDE_CRYPT_ENCOUNTERS)) {
    const room = findRoom(encounter.roomId)
    assert.ok(room, `${encounter.id}: salle inconnue ${encounter.roomId}`)

    const cells = new Set()
    if (encounter.playerCell) {
      assert.ok(roomContains(room, encounter.playerCell), `${encounter.id}: playerCell hors salle`)
      cells.add(`${encounter.playerCell.x},${encounter.playerCell.y}`)
    }
    for (const monster of encounter.monsters) {
      assert.ok(monsterTypes.has(monster.monsterType),
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

test('tide-crypt: npcs sit inside their room and do not collide with encounter spawns', () => {
  for (const npc of map.TIDE_CRYPT_NPCS) {
    if (npc.roomId !== null) {
      const room = findRoom(npc.roomId)
      assert.ok(room, `PNJ ${npc.id}: salle inconnue ${npc.roomId}`)
      assert.ok(roomContains(room, npc.cell), `PNJ ${npc.id} hors de sa salle`)
    }
    assert.ok(inBounds(npc.cell), `PNJ ${npc.id} hors carte`)

    for (const encounter of Object.values(map.TIDE_CRYPT_ENCOUNTERS)) {
      for (const monster of encounter.monsters) {
        assert.ok(
          !(monster.cell.x === npc.cell.x && monster.cell.y === npc.cell.y),
          `PNJ ${npc.id} superposé au spawn de ${encounter.id}`
        )
      }
    }
  }
})

test('tide-crypt: hooks, transitions and aliases only reference existing rooms', () => {
  const roomIds = new Set(map.TIDE_CRYPT_ROOMS.map(room => room.id))

  for (const roomId of Object.keys(map.TIDE_CRYPT_ROOM_HOOKS)) {
    assert.ok(roomIds.has(roomId), `hook pour salle inconnue ${roomId}`)
  }
  // Chaque salle a ses accroches (le prompt dynamique en dépend).
  for (const roomId of roomIds) {
    assert.ok(map.TIDE_CRYPT_ROOM_HOOKS[roomId], `salle ${roomId} sans accroches mécaniques`)
    assert.ok(map.describeTideCryptRoomHooks(roomId)?.includes(`Salle ${roomId}`))
  }

  for (const transition of [...map.TIDE_CRYPT_DOOR_TRANSITIONS, ...map.TIDE_CRYPT_FORWARD_TRANSITIONS]) {
    assert.ok(roomIds.has(transition.fromRoomId), `transition depuis salle inconnue ${transition.fromRoomId}`)
    assert.ok(roomIds.has(transition.toRoomId), `transition vers salle inconnue ${transition.toRoomId}`)
  }
  for (const alias of map.TIDE_CRYPT_ROOM_NAVIGATION_ALIASES) {
    assert.ok(roomIds.has(alias.roomId), `alias vers salle inconnue ${alias.roomId}`)
  }
})

test('tide-crypt: hooks only mention encounters that exist', () => {
  const encounterIds = new Set(Object.keys(map.TIDE_CRYPT_ENCOUNTERS))
  const mentioned = Object.values(map.TIDE_CRYPT_ROOM_HOOKS)
    .join('\n')
    .matchAll(/start_encounter\("(\w+)"\)/g)
  let count = 0
  for (const match of mentioned) {
    count++
    assert.ok(encounterIds.has(match[1]), `hook référence une rencontre inconnue "${match[1]}"`)
  }
  assert.ok(count >= 5, 'les hooks devraient référencer les rencontres du module')
})

test('tide-crypt: adventure-module.md parses into the same room set', () => {
  const moduleText = fs.readFileSync(
    path.join(process.cwd(), 'adventures/tide-crypt/adventure-module.md'),
    'utf8'
  )
  const parsed = parseAdventureModule(moduleText)

  const mapRoomIds = new Set(map.TIDE_CRYPT_ROOMS.map(room => room.id))
  const mdRoomIds = new Set(Object.keys(parsed.rooms))
  assert.deepEqual([...mdRoomIds].sort(), [...mapRoomIds].sort(),
    'les sections "## Salle N" du markdown ne correspondent pas aux salles de map.ts')

  // L'index conserve la carte et la table des points d'entrée (prompt statique).
  assert.ok(parsed.index.includes('Points d\'entrée et de déplacement'))
  assert.ok(parsed.index.includes('GRILLE : 17 colonnes'))
  // Chaque section de salle mentionne son point d'entrée.
  for (const roomId of mapRoomIds) {
    const entry = map.TIDE_CRYPT_ENTRY_CELLS[roomId]
    assert.ok(
      parsed.rooms[roomId].includes(`(${entry.x}, ${entry.y})`),
      `la salle ${roomId} du markdown ne mentionne pas son point d'entrée (${entry.x}, ${entry.y})`
    )
  }
})

test('tide-crypt: battlemap asset exists with the exact grid dimensions', () => {
  const png = fs.readFileSync(path.join(process.cwd(), 'public/battlemaps/tide-crypt.png'))
  // IHDR : largeur/hauteur en big-endian aux offsets 16/20.
  const width = png.readUInt32BE(16)
  const height = png.readUInt32BE(20)
  assert.equal(width % 17, 0, 'largeur non multiple de 17 colonnes')
  assert.equal(height % 15, 0, 'hauteur non multiple de 15 rangées')
  assert.equal(width / 17, height / 15, 'cases non carrées')
})
