// Explicit maintenance command: network only with --fetch; games/tests stay offline.
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const root = path.resolve(__dirname, '..')
const snapshotPath = path.join(root, 'lib/srd/monsters.json')
const apiBase = 'https://www.dnd5eapi.co/api/2014/monsters'
const primaryActions = {
  goblin: 'Scimitar', hobgoblin: 'Longsword', skeleton: 'Shortsword', zombie: 'Slam',
  violet_fungus: 'Rotting Touch', wolf: 'Bite', bandit: 'Scimitar', dryad: 'Club',
  awakened_tree: 'Slam', sprite: 'Longsword', satyr: 'Shortsword', blink_dog: 'Bite',
  will_o_wisp: 'Shock', awakened_shrub: 'Rake', giant_frog: 'Bite', wight: 'Longsword', ghost: 'Withering Touch',
  cultist: 'Scimitar', cult_fanatic: 'Dagger', thug: 'Mace', veteran: 'Longsword',
  noble: 'Rapier', knight: 'Greatsword', mage: 'Dagger', grick: 'Tentacles', commoner: 'Club', rat: 'Bite',
  ape: 'Fist', gargoyle: 'Bite', shadow: 'Strength Drain', archmage: 'Dagger',
}
const sha = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')
function verifiedReference(type, source) {
  // Keep the API response intact. This known API typo is checked against the
  // official SRD 5.1, printed p.309; do not invent an immunity or hide an edit.
  if (type !== 'violet_fungus' || source.condition_immunities.map(c => c.index).join(',') !== 'blinded,blinded,frightened') return {}
  const reference = structuredClone(source)
  reference.condition_immunities[1] = { index: 'deafened', name: 'Deafened', url: '/api/2014/conditions/deafened' }
  return { reference, errata: [{ field: 'condition_immunities',
    reason: 'The API duplicates blinded; the official SRD lists blinded, deafened, frightened.',
    sourceUrl: 'https://media.wizards.com/2023/downloads/dnd/SRD_CC_v5.1.pdf#page=309' }] }
}
function feet(value) {
  if (value === undefined) return 0
  const match = /^(\d+) ft\.?$/.exec(value)
  if (!match) throw new Error(`Unsupported source speed: ${value}`)
  return Number(match[1])
}
function project(type, source) {
  const action = source.actions.find(action => action.name === primaryActions[type])
  const rawDamage = action?.damage?.[0]
  const damage = rawDamage?.damage_dice ? rawDamage : rawDamage?.from?.options?.[0]
  const ac = source.armor_class[0]?.value
  if (!action || !Number.isFinite(action.attack_bonus) || !damage?.damage_dice || !Number.isFinite(ac)) {
    throw new Error(`Cannot project ${type}/${primaryActions[type]} faithfully`)
  }
  const reach = /reach (\d+) ft\./.exec(action.desc)
  if (!reach) throw new Error(`No explicit source reach for ${type}/${action.name}`)
  return {
    type, hp: { current: source.hit_points, max: source.hit_points }, ac,
    stats: { str: source.strength, dex: source.dexterity, con: source.constitution,
      int: source.intelligence, wis: source.wisdom, cha: source.charisma },
    conditions: [], xpValue: source.xp, attackBonus: action.attack_bonus,
    damageDice: damage.damage_dice, speed: feet(source.speed.walk),
    attackName: action.name, attackRangeCells: Number(reach[1]) / 5,
    damageType: damage.damage_type.index,
    movementModes: Object.fromEntries(Object.entries(source.speed).map(([key, value]) => [key, typeof value === 'boolean' ? value : feet(value)])),
  }
}
async function download() {
  const entries = Object.keys(primaryActions)
  const monsters = {}
  for (let start = 0; start < entries.length; start += 4) {
    const results = await Promise.all(entries.slice(start, start + 4).map(async type => {
      const index = type.replaceAll('_', '-')
      const sourceUrl = `${apiBase}/${index}`
      const response = await fetch(sourceUrl, { signal: AbortSignal.timeout(30000) })
      if (!response.ok) throw new Error(`${response.status} ${sourceUrl}`)
      const source = await response.json()
      if (source.index !== index || !Number.isFinite(source.hit_points) || !Array.isArray(source.actions)) throw new Error(`Invalid API record: ${sourceUrl}`)
      const verified = verifiedReference(type, source)
      return [type, { sourceUrl, sourceSha256: sha(source), source, ...verified, engine: project(type, verified.reference ?? source) }]
    }))
    for (const [type, record] of results) { monsters[type] = record; process.stdout.write(`${type}: ${record.sourceUrl}\n`) }
  }
  const snapshot = { ruleset: '2014', apiBase, retrievedAt: new Date().toISOString(),
    attribution: 'D&D 5e SRD 2014; source data supplied by the community-maintained 5e-bits D&D 5e SRD API. API documentation: https://docs.dnd5eapi.co/faq',
    license: 'CC-BY-4.0', licenseAttributionPath: 'lib/srd/monsters.LICENSE.txt', monsters }
  fs.writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2) + '\n')
}
function rebuildProjection() {
  const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'))
  snapshot.license = 'CC-BY-4.0'
  snapshot.licenseAttributionPath = 'lib/srd/monsters.LICENSE.txt'
  for (const [type, record] of Object.entries(snapshot.monsters)) {
    delete record.reference; delete record.errata
    Object.assign(record, verifiedReference(type, record.source))
    record.engine = project(type, record.reference ?? record.source)
  }
  fs.writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2) + '\n')
}
function renderBlock(entry) {
  const record = JSON.parse(fs.readFileSync(snapshotPath, 'utf8')).monsters[entry.type]
  if (!record) throw new Error(`Unknown bestiary source ${entry.type}`)
  const s = record.reference ?? record.source
  const cr = ({ 0.125: '1/8', 0.25: '1/4', 0.5: '1/2' })[s.challenge_rating] ?? s.challenge_rating
  const lines = [`### ${entry.title}`, ``, `Source : [${s.name}](${record.sourceUrl}) — SRD 2014 · type moteur \`${entry.type}\`.`, ``,
    `- **Taille / type / alignement (source)** : ${s.size} / ${s.type}${s.subtype ? ` (${s.subtype})` : ''} / ${s.alignment}.`,
    `- **CA** ${s.armor_class.map(ac => `${ac.value} (${ac.type}${ac.desc ? ` : ${ac.desc}` : ''})`).join(' ; ')} · **PV** ${s.hit_points} (${s.hit_points_roll ?? s.hit_dice}) · **FP** ${cr} · **XP** ${s.xp}.`,
    `- **Vitesses** : ${Object.entries(s.speed).map(([mode, value]) => `${({walk:'marche',fly:'vol',swim:'nage',climb:'escalade',burrow:'fouissement',hover:'stationnaire'})[mode] ?? mode} ${String(value).replace(/\.$/, '')}`).join(' ; ')}.`,
    `- **Caractéristiques** : FOR ${s.strength} · DEX ${s.dexterity} · CON ${s.constitution} · INT ${s.intelligence} · SAG ${s.wisdom} · CHA ${s.charisma}.`,
    `- **Maîtrises / sauvegardes (source)** : ${s.proficiencies.map(p => `${p.proficiency.name} ${p.value >= 0 ? '+' : ''}${p.value}`).join(' ; ') || 'aucune indiquée'}.`,
    `- **Vulnérabilités** : ${s.damage_vulnerabilities.join(', ') || 'aucune'}.`,
    `- **Résistances** : ${s.damage_resistances.join(', ') || 'aucune'}.`,
    `- **Immunités aux dégâts** : ${s.damage_immunities.join(', ') || 'aucune'}.`,
    `- **Immunités aux états (identifiants source)** : ${s.condition_immunities.map(c => c.index).join(', ') || 'aucune'}.`,
    `- **Sens** : ${Object.entries(s.senses).map(([sense, value]) => `${sense} ${value}`).join(' ; ')}.`,
    `- **Langues (source)** : ${s.languages || 'aucune'}.`, ``,
    `**Traits et actions SRD** — descriptions originales conservées pour éviter les ajouts ou traductions erronés :`, ``]
  for (const [section, features] of [['Traits', s.special_abilities], ['Actions', s.actions], ['Réactions', s.reactions], ['Actions légendaires', s.legendary_actions]]) {
    if (!features?.length) continue
    lines.push(`**${section}**`, '')
    for (const feature of features) lines.push(`- **${feature.name}** : ${feature.desc.replaceAll('\n', ' ')}`)
    lines.push('')
  }
  for (const correction of record.errata ?? []) lines.push(`**Correction sourcée de l'API** (${correction.field}) : ${correction.reason} [SRD officiel, p. 309](${correction.sourceUrl}).`, '')
  lines.push(`**Projection moteur de base** : ${record.engine.attackName}, +${record.engine.attackBonus}, ${record.engine.damageDice} ${record.engine.damageType}, allonge ${record.engine.attackRangeCells * 5} pieds ; marche ${record.engine.speed} pieds.`, '')
  if (entry.role) lines.push(`**Rôle dans ce module** : ${entry.role}`, '')
  for (const note of entry.notes ?? []) lines.push(`- ${note}`)
  return lines.join('\n')
}
function renderBestiary(manifest) {
  const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'))
  return [`# ${manifest.title}`, '',
    `> Généré par \`node scripts/sync-srd-bestiaries.cjs --write\` depuis le snapshot SRD 2014 consulté le ${snapshot.retrievedAt.slice(0, 10)}.`,
    `> Sources : [D&D 5e SRD API](https://www.dnd5eapi.co/) (projet communautaire 5e-bits), référentiel SRD 2014.`,
    `> Matériel SRD 5.1 sous CC-BY-4.0 : [attribution](../../lib/srd/monsters.LICENSE.txt). Les éventuelles corrections vérifiées dans le SRD officiel sont signalées et la réponse API originale est conservée.`,
    `> Les noms de campagne et comportements ci-dessous sont des adaptations narratives ; les valeurs de référence viennent de chaque endpoint cité. Aucun PV réduit dans les rencontres autorées.`,
    `> Le moteur applique les dégâts typés, résistances, vulnérabilités et immunités (dégâts et états), les multiattaques du catalogue et plusieurs effets de frappe et pouvoirs actifs. Les jets, coûts, durées et recharges passent par les outils. La couverture précise et les limites de chaque créature sont renvoyées par \`get_monster_stat_block.engineSupport\` ; un pouvoir seulement décrit dans la source n'est jamais une résolution mécanique acquise. Voir [règles moteur](../../docs/monster-combat-rules.md).`, '',
    ...manifest.notes.flatMap(note => [note, '']), ...manifest.creatures.flatMap(entry => [renderBlock(entry), '']),
    ...(manifest.narrativeNpcs?.length ? ['', '## PNJ — notes d’incarnation', '', ...manifest.narrativeNpcs.map(note => `- ${note}`)] : []), '',
  ].join('\n').trimEnd() + '\n'
}
function writeOrCheck(check) {
  for (const name of fs.readdirSync(path.join(root, 'adventures'))) {
    const dir = path.join(root, 'adventures', name)
    const manifestPath = path.join(dir, 'bestiary.json')
    if (!fs.existsSync(manifestPath)) continue
    const expected = renderBestiary(JSON.parse(fs.readFileSync(manifestPath, 'utf8')))
    const output = path.join(dir, 'bestiary.md')
    if (check) {
      if (fs.readFileSync(output, 'utf8').replaceAll('\r\n', '\n') !== expected) throw new Error(`Stale bestiary: ${output}`)
    } else fs.writeFileSync(output, expected)
  }
}
module.exports = { project, renderBestiary }
if (require.main === module) (async () => {
  if (process.argv.includes('--fetch')) await download()
  if (process.argv.includes('--project')) rebuildProjection()
  if (process.argv.includes('--write')) writeOrCheck(false)
  if (process.argv.includes('--check')) writeOrCheck(true)
})().catch(error => { process.stderr.write(`${error.stack}\n`); process.exitCode = 1 })
