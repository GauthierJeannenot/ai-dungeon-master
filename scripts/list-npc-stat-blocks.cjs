#!/usr/bin/env node
'use strict'
const fs = require('node:fs')
const path = require('node:path')
const { getAdventureMap, seedAdventureNpcs } = require('../mcp-server/dist/lib/adventure-map.js')
const { getMonsterRecord } = require('../mcp-server/dist/lib/srd/monsters.js')
const root = path.resolve(__dirname, '..')
const campaigns = ['grammys-country-apple-pie', 'tide-crypt', 'fey-shadow-fair', 'sarah-of-yellowcrest-manor']
const lines = ['# Fiches mécaniques des PNJ', '',
  'Catalogue des PNJ déclarés dans les quatre aventures. Les adversaires des rencontres gardent leurs profils de rencontre. Les personnes seulement évoquées dans le récit ne sont pas créées comme acteurs supplémentaires.', '',
  'Les profils viennent du SRD D&D 2014 correspondant aux fiches du Monster Manual 2014. Une affectation est un choix de conception ; elle ne garantit pas une fiche propre au personnage original. Les pouvoirs non pris en charge restent documentaires.', '',
  'Les groupes sont des profils maison explicitement demandés : PV cumulés, un membre hors de combat par tranche entière de PV individuels perdue. Les dés et bonus de dégâts de chaque attaque sont multipliés par l’effectif restant ; le bonus pour toucher est conservé. Aucun gain de PV ni de PV temporaires. Les pertes ne désignent pas de victime nommée et ne prouvent pas à elles seules sa mort. Les KO non létaux collectifs sont refusés faute de suivi individuel.', '']
let total = 0
for (const id of campaigns) {
  const map = getAdventureMap(id)
  const npcs = seedAdventureNpcs(id)
  lines.push(`## ${id}`, '', '| PNJ / pion | Stat block | Base MM | Effectif | PV initiaux | CA |',
    '| --- | --- | --- | --- | --- | --- |')
  for (const spec of map.npcs) {
    const npc = npcs[spec.id]
    total++
    lines.push(`| ${[npc.name, npc.statBlock.name, npc.statBlock.type,
      npc.group?.initialCount ?? 1, `${npc.hp.current}/${npc.hp.max}`, npc.ac].join(' | ')} |`)
  }
  lines.push('')
  const encountered = new Map()
  for (const encounter of Object.values(map.encounters)) for (const monster of encounter.monsters) {
    const source = getMonsterRecord(monster.monsterType)
    const name = monster.name ?? source.source.name
    const key = `${name}|${monster.monsterType}`
    const previous = encountered.get(key)
    encountered.set(key, { name, block: source.source.name, count: (previous?.count ?? 0) + 1 })
  }
  lines.push('### Acteurs des rencontres', '',
    'Leur fiche est déjà déclarée dans la rencontre ; leur état vivant est créé lors du démarrage explicite de celle-ci.', '',
    '| PNJ / créature | Stat block | Nombre de placements |', '| --- | --- | --- |')
  for (const actor of encountered.values()) lines.push(`| ${actor.name} | ${actor.block} | ${actor.count} |`)
  lines.push('')
}
lines.push('## Choix particuliers', '',
  '- Mac conserve Awakened Tree, son profil déjà déclaré, malgré l’emploi narratif du mot tréant.',
  '- Madame Bougie utilise Mage comme base de lanceuse de sorts ; Mirabelle et Miroslav utilisent Commoner, sans pouvoirs de classe inventés.',
  '- Les Têtes Jacassantes utilisent un groupe de trois Gargoyles : adaptation de statues parlantes, pas fiche officielle spécifique.',
  '- Le Prince des Farces utilise Archmage comme base de puissant lanceur de sorts ; ce choix ne lui attribue aucun trait racial d’archifée.',
  '- Faerl utilise Noble comme base MM ; ses particularités elfiques restent dans la référence de campagne et ne deviennent pas des effets résolus par simple ajout de fiche.',
  '- Ashlan utilise Commoner au sein du groupe des captifs : choix de modélisation demandé, le scénario original le décrivant comme enfant non combattant sans fiche propre.',
  '- Sarah reste une seule personne représentée à deux étapes ; son pion final inclut les quatre esprits Yellowcrest, formant un groupe de cinq. Faerl et Vecken ont également des représentations à plusieurs étapes.', '',
  '## État et conservation', '',
  'Chaque entrée state.npcs possède un instantané statBlock sourcé, ses PV actuels/maximaux, sa CA, ses caractéristiques, ses conditions, sa vitesse et son attaque de base. Les groupes portent leur effectif et leur règle maison dans group. Les sources et les valeurs vivantes sont distinctes.', '',
  'Les parties historiques reçoivent les champs manquants lors de la synchronisation publique avec le moteur mis à jour, sans restaurer leurs PV ni leurs positions. Un ancien groupe déjà blessé avec un maximum incompatible, ou un ancien PNJ à zéro PV sans état de vie connu, est refusé plutôt que reconstruit arbitrairement. Les restaurations internes d’action ne préparent pas de nouveaux acteurs.', '',
  'Seuls les PNJ révélés sur la carte active peuvent être ciblés par leur identifiant moteur. enter_combat doit être explicitement choisi par le MJ ; la présence d’une fiche ne déclenche aucune initiative. Le pion et son acteur de combat partagent le même objet vivant, relié à nouveau au chargement.', '',
  'Un nouveau moteur doit être lancé après recompilation pour que les parties l’utilisent ; aucun processus de partie ouverte n’est arrêté automatiquement.', '',
  'Aucune suite de tests ni playtest exécuté pour cette évolution, conformément à la demande utilisateur.', '')
const report = lines.join('\n')
if (process.argv.includes('--write')) {
  const target = path.join(root, 'docs/npc-stat-blocks.md')
  fs.writeFileSync(target, report)
  console.log(`${total} entrées PNJ : ${target}`)
} else process.stdout.write(report)
