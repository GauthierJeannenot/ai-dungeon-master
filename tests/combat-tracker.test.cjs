const assert = require('node:assert/strict')
const test = require('node:test')
const fs = require('node:fs')
const ts = require('typescript')
const { installTsRequireWithAliases } = require('./helpers/ts-require.cjs')
const restore = installTsRequireWithAliases()
const previousTsx = require.extensions['.tsx']
require.extensions['.tsx'] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText, filename)
test.after(() => { restore(); if (previousTsx) require.extensions['.tsx'] = previousTsx; else delete require.extensions['.tsx'] })
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const CombatTracker = require('../components/CombatTracker.tsx').default
const { combatParticipants } = require('../lib/combat-participants.ts')
const { buildInitialGameState } = require('../lib/initial-game-state.ts')
const { combatAttackOptions } = require('../lib/combat-attack-options.ts')
const { initialHeroState } = require('../lib/hero-state.ts')
function fixture() {
  const state = buildInitialGameState()
  state.phase = 'combat'; state.round = 2; state.currentTurn = 'player'
  state.monsters = {
    guard: { id: 'guard', name: 'Garde vaincu', isAlive: false, hp: { current: 0, max: 7 } },
    boss: { id: 'boss', name: 'Chef adverse', isAlive: true, hp: { current: 18, max: 18 } },
  }
  state.initiativeOrder = ['player', 'guard', 'unknown-id', 'boss']
  return state
}
test('the observed dead guard and missing ID do not count or appear in the active initiative', () => {
  const state = fixture()
  const view = combatParticipants(state)
  assert.deepEqual(view.active, ['player', 'boss'])
  assert.deepEqual(view.defeated, ['guard'])
  assert.equal(view.hostileCount, 1)
  const html = renderToStaticMarkup(React.createElement(CombatTracker, { gameState: state }))
  assert.match(html, /1 adversaire/)
  assert.doesNotMatch(html, /unknown-id|2 adversaires/)
  assert.ok(html.indexOf('Chef adverse') < html.indexOf('Vaincus (1)'))
  assert.ok(html.indexOf('Garde vaincu') > html.indexOf('Vaincus (1)'))
})
test('a dying or stable player remains in initiative and is not labelled dead or shown an available action', () => {
  for (const stable of [false, true]) {
    const state = fixture(); state.player.hp.current = 0; state.player.deathSaves = { successes: 0, failures: 0, stable }
    const view = combatParticipants(state)
    assert.ok(view.active.includes('player'))
    assert.equal(view.currentTurn, 'player')
    assert.match(view.playerStatus, stable ? /stable/ : /sauvegarde/)
    const html = renderToStaticMarkup(React.createElement(CombatTracker, { gameState: state }))
    assert.doesNotMatch(html, /Disponible|· mort/)
  }
})
test('only actual death removes the player; stale dead turns are not highlighted and allies are not counted hostile', () => {
  const state = fixture(); state.player.hp.current = 0; state.player.deathSaves = { successes: 0, failures: 3, dead: true }
  state.monsters.boss.hostile = false
  const view = combatParticipants(state)
  assert.equal(view.active.includes('player'), false)
  assert.equal(view.currentTurn, null)
  assert.equal(view.hostileCount, 0)
  const html = renderToStaticMarkup(React.createElement(CombatTracker, { gameState: state }))
  assert.doesNotMatch(html, /← TOUR|À toi de jouer/)
  assert.match(html, /· mort/)
})

test('an actual registered hazard is shown as a trap turn, never a monster, missing actor or defeated creature',()=>{
 const state=fixture();state.combatGeneration=1;state.currentMapId='test-map';state.currentTurn='@complex-trap:sphere:10'
 state.dmTools??={};state.dmTools.complexTraps={sphere:{id:'sphere',mapId:'test-map',initiativeGeneration:1,status:'active',damageDice:4,pulses:{}}}
 state.initiativeOrder=['@complex-trap:sphere:20','player','@complex-trap:sphere:10','boss']
 const view=combatParticipants(state);assert.equal(view.currentTurn,'@complex-trap:sphere:10');assert.equal(view.hostileCount,1)
 assert.ok(view.active.includes('@complex-trap:sphere:10'));assert.ok(!view.active.includes('@complex-trap:sphere:20'))
 assert.ok(!view.defeated.some(id=>id.startsWith('@complex-trap:')))
 const html=renderToStaticMarkup(React.createElement(CombatTracker,{gameState:state}));assert.match(html,/Piège complexe · initiative 10/);assert.doesNotMatch(html,/@complex-trap:|initiative 20|2 adversaires/)
})

function attackFixture(distance = 1) {
  const state = fixture()
  state.player.position = { x: 1, y: 1 }
  state.monsters.boss.position = { x: 1 + distance, y: 1 }
  state.player.inventory = [
    { id: 'blade-a', equipmentId: 'longsword', type: 'weapon', name: 'Lame du héros' },
    { id: 'bow-a', equipmentId: 'shortbow', type: 'weapon', name: 'Arc du héros' },
    { id: 'arrows-a', type: 'misc', name: 'Flèches ordinaires', ammunitionType: 'arrow', quantity: 3 },
    { id: 'dagger-a', equipmentId: 'dagger', type: 'weapon', name: 'Dague du héros' },
  ]
  state.actionUsed.player = false
  return state
}

test('attack choices use actual weapon reach, distinguish thrown attacks, and retain long range disadvantage', () => {
  const state = attackFixture(1)
  let options = combatAttackOptions(state, 'boss')
  assert.equal(options.find(option => option.id.startsWith('weapon:blade-a')).disabledReason, null)
  state.monsters.boss.position = { x: 2, y: 2 }
  assert.equal(combatAttackOptions(state, 'boss')[0].disabledReason, null, 'diagonal adjacency is melee reach')
  state.monsters.boss.position = { x: 3, y: 1 }
  options = combatAttackOptions(state, 'boss')
  assert.equal(options.find(option => option.id.startsWith('weapon:blade-a')).disabledReason, 'Hors de portée')
  assert.equal(options.find(option => option.id.startsWith('weapon:dagger-a:melee')).disabledReason, 'Hors de portée')
  assert.equal(options.find(option => option.id.startsWith('weapon:dagger-a:thrown')).disabledReason, null)
  state.player.inventory.push({ id: 'polearm', equipmentId: 'glaive', type: 'weapon', name: 'Coutille' })
  assert.equal(combatAttackOptions(state, 'boss').find(option => option.id.startsWith('weapon:polearm')).disabledReason, null)
  for (const [distance, available, long] of [[16, true, false], [17, true, true], [64, true, true], [65, false, false]]) {
    state.monsters.boss.position.x = 1 + distance
    const bow = combatAttackOptions(state, 'boss').find(option => option.id.startsWith('weapon:bow-a'))
    assert.equal(!bow.disabledReason, available)
    assert.equal(bow.detail.includes('désavantage'), long)
  }
})

test('choices preserve exact physical weapons, target and ammunition and never mutate state', () => {
  const state = attackFixture(4)
  state.player.inventory.push({ id: 'silver-arrows', type: 'misc', name: 'Flèches argentées', ammunitionType: 'arrow', quantity: 2 })
  const before = JSON.stringify(state)
  const options = combatAttackOptions(state, 'boss')
  const bowChoices = options.filter(option => option.id.startsWith('weapon:bow-a'))
  assert.equal(bowChoices.length, 2)
  assert.match(bowChoices[0].message, /targetId="boss"/)
  assert.match(bowChoices[0].message, /weaponOrSpell="bow-a"/)
  assert.match(bowChoices[0].message, /ammunitionItemId="arrows-a"/)
  assert.match(bowChoices[1].message, /ammunitionItemId="silver-arrows"/)
  assert.match(options.find(option => option.id.startsWith('weapon:dagger-a:thrown')).message, /attackMode="thrown"/)
  assert.ok(options.every(option => option.message.endsWith('Je ne termine pas mon tour.')))
  assert.equal(JSON.stringify(state), before)
  state.player.inventory.find(item => item.id === 'arrows-a').quantity = 0
  state.player.inventory.find(item => item.id === 'silver-arrows').quantity = undefined
  assert.equal(combatAttackOptions(state, 'boss').find(option => option.id.startsWith('weapon:bow-a')).disabledReason, 'Munitions épuisées')
})

test('only living hostile combatants offer an attack button, including its disabled out-of-range state', () => {
  const state = attackFixture()
  const render = props => renderToStaticMarkup(React.createElement(CombatTracker, { gameState: state, onAttack() {}, ...props }))
  let html = render()
  assert.match(html, /aria-label="Attaquer Chef adverse"/)
  assert.doesNotMatch(html, /aria-label="Attaquer Garde vaincu"|aria-label="Attaquer Héros"/)
  assert.doesNotMatch(html, /aria-label="Attaquer Chef adverse"[^>]* disabled=""/)
  assert.match(render({ disabled: true }), /aria-label="Attaquer Chef adverse"[^>]* disabled=""/)
  state.monsters.boss.position.x = 100
  html = render()
  assert.match(html, /aria-label="Attaquer Chef adverse"[^>]* disabled=""/)
  assert.match(html, /Hors de portée/)
  state.monsters.boss.hostile = false
  assert.deepEqual(combatAttackOptions(state, 'boss'), [])
  assert.doesNotMatch(render(), /aria-label="Attaquer/)
  state.monsters.boss.hostile = true
  state.monsters.boss.isAlive = false
  assert.deepEqual(combatAttackOptions(state, 'boss'), [])
  state.phase = 'exploration'
  assert.deepEqual(combatAttackOptions(state, 'boss'), [])
})

test('turn, incapacitation, pending reactions and spent actions disable attacks; extra attacks remain usable', () => {
  const state = attackFixture()
  const allBlocked = reason => assert.ok(combatAttackOptions(state, 'boss').every(option => option.disabledReason === reason))
  state.currentTurn = 'boss'; allBlocked('Attends ton tour')
  state.currentTurn = 'player'; state.player.hp.current = 0; allBlocked('Impossible d’agir')
  state.player.hp.current = 20; state.player.conditions = ['stunned']; allBlocked('Impossible d’agir')
  state.player.conditions = []; state.actionUsed.player = true; allBlocked('Action utilisée')
  state.hero = initialHeroState('fighter'); state.hero.actionCredits = 0
  state.hero.attackAction = { used: 1, remaining: 1 }
  assert.ok(combatAttackOptions(state, 'boss').some(option => !option.disabledReason))
  state.hero.pending = { id: 'pending', kind: 'attack', sourceId: 'player', options: [], command: {} }
  allBlocked('Réaction à résoudre')
})

test('magic lists known offensive spells with exact slot choices, cantrips and range/resource restrictions', () => {
  const state = attackFixture(12)
  state.player.knownSpells = ['ray-of-frost', 'magic-missile', 'cure-wounds', 'light', 'ray-of-frost']
  state.player.spellSlots = { level1: { current: 0, max: 2 }, level2: { current: 1, max: 2 } }
  let options = combatAttackOptions(state, 'boss').filter(option => option.id.startsWith('spell:'))
  assert.equal(options.length, 2)
  assert.ok(options.every(option => !option.disabledReason))
  assert.doesNotMatch(options.find(option => option.id === 'spell:ray-of-frost:0').message, /slotLevel/)
  assert.match(options.find(option => option.id === 'spell:magic-missile:2').message, /spellId="magic-missile", slotLevel=2/)
  state.monsters.boss.position.x++
  options = combatAttackOptions(state, 'boss')
  assert.equal(options.find(option => option.id === 'spell:ray-of-frost:0').disabledReason, 'Hors de portée')
  state.player.spellSlots.level2.current = 0
  assert.equal(combatAttackOptions(state, 'boss').find(option => option.id.startsWith('spell:magic-missile')).disabledReason, 'Aucun emplacement disponible')
  state.hero = initialHeroState('wizard'); state.hero.actionCredits = 0
  state.hero.attackAction = { used: 1, remaining: 1 }
  assert.equal(combatAttackOptions(state, 'boss').find(option => option.id.startsWith('spell:magic-missile')).disabledReason, 'Action utilisée')
})
