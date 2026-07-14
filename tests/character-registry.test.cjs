const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const fs = require('node:fs')
const { installTsRequireWithAliases } = require('./helpers/ts-require.cjs')

const restore = installTsRequireWithAliases()
test.after(() => restore())

const root = process.cwd()
const registry = require(path.join(root, 'lib/character-registry.ts'))
const weapons = require(path.join(root, 'lib/srd/weapons.ts'))
const spells = require(path.join(root, 'lib/srd/spells.ts'))
const skills = require(path.join(root, 'lib/srd/skills.ts'))

const ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha']

test('le catalogue expose les 4 classes attendues, guerrier par défaut', () => {
  const ids = registry.listCharacters().map(c => c.id)
  assert.deepEqual(ids, ['fighter', 'bard', 'wizard', 'cleric'])
  assert.equal(registry.DEFAULT_CHARACTER_ID, 'fighter')
  assert.equal(registry.getCharacterTemplate('fighter').id, 'fighter')
  // Fail-safe : id inconnu → guerrier (y compris l'ancien roublard retiré).
  assert.equal(registry.getCharacterTemplate('inconnu').id, 'fighter')
  assert.equal(registry.isKnownCharacterId('bard'), true)
  assert.equal(registry.isKnownCharacterId('rogue'), false)
  assert.equal(registry.isKnownCharacterId('inconnu'), false)
  assert.equal(registry.isKnownCharacterId(null), false)
})

test('chaque personnage a des données cohérentes et vérifiables', () => {
  const seenIds = new Set()
  for (const c of registry.listCharacters()) {
    assert.equal(seenIds.has(c.id), false, `id dupliqué : ${c.id}`)
    seenIds.add(c.id)

    // Stats bornées 3-20 (prétirés SRD niveau 1).
    for (const ab of ABILITIES) {
      assert.ok(Number.isInteger(c.stats[ab]), `${c.id}.${ab} entier`)
      assert.ok(c.stats[ab] >= 3 && c.stats[ab] <= 20, `${c.id}.${ab} dans 3-20`)
    }

    assert.ok(c.ac >= 10 && c.ac <= 20, `${c.id} CA plausible`)
    assert.equal(c.proficiencyBonus, 2, `${c.id} maîtrise +2 (niveaux 1-4)`)
    assert.ok(c.hp.base > 0 && c.hp.perLevel > 0, `${c.id} PV positifs`)

    // Sauvegardes et compétences : ids canoniques connus.
    for (const s of c.savingThrowProficiencies) {
      assert.ok(ABILITIES.includes(s), `${c.id} save ${s} valide`)
    }
    for (const sk of c.skillProficiencies) {
      assert.ok(skills.isKnownSkillId(sk), `${c.id} compétence ${sk} connue du registre`)
    }
    for (const sk of c.expertise ?? []) {
      assert.ok(c.skillProficiencies.includes(sk), `${c.id} expertise ${sk} implique maîtrise`)
    }

    // Armes du kit : le NOM d'une arme résout vers une arme connue du registre
    // (l'id d'item n'est qu'une clé d'inventaire unique — ex. 'dagger2').
    for (const item of c.inventory) {
      if (item.type !== 'weapon') continue
      const resolved = weapons.resolveWeapon(item.name)
      assert.equal(resolved.id, weapons.resolveWeapon(item.name).id)
      assert.equal(
        resolved.label.toLowerCase().replace(/\s+/g, ''),
        item.name.toLowerCase().replace(/\s+/g, ''),
        `${c.id} arme « ${item.name} » résout vers le registre`
      )
    }

    // Sorts : tout id connu du registre de sorts, cohérence niveau.
    if (c.spellcasting) {
      assert.ok(ABILITIES.includes(c.spellcasting.ability), `${c.id} aptitude d'incantation valide`)
      for (const cid of c.spellcasting.cantrips) {
        const sp = spells.getSpell(cid)
        assert.ok(sp, `${c.id} tour de magie ${cid} connu`)
        assert.equal(sp.level, 0, `${c.id} ${cid} est un tour de magie`)
      }
      for (const sid of c.spellcasting.knownSpells) {
        const sp = spells.getSpell(sid)
        assert.ok(sp, `${c.id} sort ${sid} connu`)
        assert.equal(sp.level, 1, `${c.id} ${sid} est de niveau 1`)
      }
      assert.ok(c.spellcasting.slots.level1 >= 1, `${c.id} au moins 1 emplacement`)
      assert.ok(c.features.includes('spellcasting'), `${c.id} a la capacité spellcasting`)
    }
  }
})

test('formule de PV : reproduit les PV historiques des 3 aventures (guerrier)', () => {
  const fighter = registry.getCharacterTemplate('fighter')
  assert.equal(registry.maxHpForLevel(fighter, 1), 20)   // Grammy's N1
  assert.equal(registry.maxHpForLevel(fighter, 2), 28)   // Tide Crypt N2
  assert.equal(registry.maxHpForLevel(fighter, 3), 36)   // Fey Shadow Fair N3
})

test('dérivation de l\'aptitude d\'attaque depuis les propriétés de l\'arme', () => {
  const stats = { str: 10, dex: 16, con: 12, int: 10, wis: 10, cha: 10 }
  assert.equal(weapons.attackAbilityFor(weapons.getWeapon('longsword'), stats), 'str')
  assert.equal(weapons.attackAbilityFor(weapons.getWeapon('rapier'), stats), 'dex')   // finesse → meilleure
  assert.equal(weapons.attackAbilityFor(weapons.getWeapon('shortbow'), stats), 'dex') // ranged
  const strong = { ...stats, str: 18, dex: 12 }
  assert.equal(weapons.attackAbilityFor(weapons.getWeapon('rapier'), strong), 'str')  // finesse → FOR ici
})

test('registre d\'armes : couvre l\'union des anciennes tables + rapier/shortbow', () => {
  for (const id of ['longsword', 'shortsword', 'dagger', 'greataxe', 'greatsword', 'handaxe', 'rapier', 'mace', 'quarterstaff', 'unarmed', 'shortbow']) {
    assert.ok(weapons.getWeapon(id), `arme ${id} présente`)
  }
  // Portées historiques préservées.
  assert.equal(weapons.getWeapon('dagger').rangeCells, 4)
  assert.equal(weapons.getWeapon('handaxe').rangeCells, 4)
  assert.equal(weapons.getWeapon('longsword').rangeCells, 1)
  // Dégâts historiques préservés.
  assert.equal(weapons.getWeapon('greatsword').damageDie, '2d6')
  assert.equal(weapons.getWeapon('longsword').damageDie, '1d8')
})

test('zéro vocabulaire de module dans characters/ (anti-fuite inter-modules)', () => {
  const banned = /grammy|verger|dryad|grukk|tarte|tide|crypt|fey|foire|ombre du voleur|tyndareus/i
  const charDir = path.join(root, 'characters')
  for (const id of fs.readdirSync(charDir)) {
    const sheet = path.join(charDir, id, 'sheet.ts')
    if (!fs.existsSync(sheet)) continue
    const text = fs.readFileSync(sheet, 'utf8')
    assert.equal(banned.test(text), false, `vocabulaire de module dans characters/${id}/sheet.ts`)
  }
})
