# Bestiaire & notes de maîtrise — Grammy's Country Apple Pie

> Généré par `node scripts/sync-srd-bestiaries.cjs --write` depuis le snapshot SRD 2014 consulté le 2026-10-30.
> Sources : [D&D 5e SRD API](https://www.dnd5eapi.co/) (projet communautaire 5e-bits), référentiel SRD 2014.
> Matériel SRD 5.1 sous CC-BY-4.0 : [attribution](../../lib/srd/monsters.LICENSE.txt). Les éventuelles corrections vérifiées dans le SRD officiel sont signalées et la réponse API originale est conservée.
> Les noms de campagne et comportements ci-dessous sont des adaptations narratives ; les valeurs de référence viennent de chaque endpoint cité. Aucun PV réduit dans les rencontres autorées.
> Le moteur applique les dégâts typés, résistances, vulnérabilités et immunités (dégâts et états), les multiattaques du catalogue et plusieurs effets de frappe et pouvoirs actifs. Les jets, coûts, durées et recharges passent par les outils. La couverture précise et les limites de chaque créature sont renvoyées par `get_monster_stat_block.engineSupport` ; un pouvoir seulement décrit dans la source n'est jamais une résolution mécanique acquise. Voir [règles moteur](../../docs/monster-combat-rules.md).

**Niveau du joueur : 1.** Les gardes et pâtissiers utilisent désormais le gobelin SRD à 7 PV, sans variante minion. Deux gobelins représentent 100 XP bruts avant tout multiplicateur de rencontre : danger réel pour un héros solo. Privilégier les solutions créatives et sociales prévues par le module ; ne pas réduire leurs PV en secret.

Les DD d'interaction propres au scénario ne sont pas des caractéristiques SRD : repérer les dryades, DD 13 Perception ; approcher leur groupe sans les faire fuir, DD 14 Charisme ; obtenir l'aide de Mac par le respect, DD 12 Persuasion. Ne pas inventer un DD générique de 17–18.

Le chef est un hobgobelin SRD à 11 PV, pas un Goblin Boss ou un Hobgoblin Captain. Ces deux anciens blocs ne sont pas fournis par le catalogue SRD de cette API et ne servent plus de référence.

### Gobelins pâtissiers et gardes

Source : [Goblin](https://www.dnd5eapi.co/api/2014/monsters/goblin) — SRD 2014 · type moteur `goblin`.

- **Taille / type / alignement (source)** : Small / humanoid (goblinoid) / neutral evil.
- **CA** 15 (armor) · **PV** 7 (2d6) · **FP** 1/4 · **XP** 50.
- **Vitesses** : marche 30 ft.
- **Caractéristiques** : FOR 8 · DEX 14 · CON 10 · INT 10 · SAG 8 · CHA 8.
- **Maîtrises / sauvegardes (source)** : Skill: Stealth +6.
- **Vulnérabilités** : aucune.
- **Résistances** : aucune.
- **Immunités aux dégâts** : aucune.
- **Immunités aux états (identifiants source)** : aucune.
- **Sens** : darkvision 60 ft. ; passive_perception 9.
- **Langues (source)** : Common, Goblin.

**Traits et actions SRD** — descriptions originales conservées pour éviter les ajouts ou traductions erronés :

**Traits**

- **Nimble Escape** : The goblin can take the Disengage or Hide action as a bonus action on each of its turns.

**Actions**

- **Scimitar** : Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 5 (1d6 + 2) slashing damage.
- **Shortbow** : Ranged Weapon Attack: +4 to hit, range 80/320 ft., one target. Hit: 5 (1d6 + 2) piercing damage.

**Projection moteur de base** : Scimitar, +4, 1d6+2 slashing, allonge 5 pieds ; marche 30 pieds.

**Rôle dans ce module** : Deux pâtissiers à découvert en salle 8, occupés à essayer de faire des tartes aux pommes en se chamaillant, visibles depuis le quai par la porte ouverte selon la ligne de vue. Aucune embuscade ni combat automatique pour ces pâtissiers ; deux gardes en salle 9. Aucun gobelin dans le quai de chargement, salle 7.

- Les armes et dégâts restent ceux du gobelin SRD ; les outils de boulangerie sont de la mise en scène et ne remplacent pas les statistiques.

### Chef Grukk — hobgobelin

Source : [Hobgoblin](https://www.dnd5eapi.co/api/2014/monsters/hobgoblin) — SRD 2014 · type moteur `hobgoblin`.

- **Taille / type / alignement (source)** : Medium / humanoid (goblinoid) / lawful evil.
- **CA** 18 (armor) · **PV** 11 (2d8+2) · **FP** 1/2 · **XP** 100.
- **Vitesses** : marche 30 ft.
- **Caractéristiques** : FOR 13 · DEX 12 · CON 12 · INT 10 · SAG 10 · CHA 9.
- **Maîtrises / sauvegardes (source)** : aucune indiquée.
- **Vulnérabilités** : aucune.
- **Résistances** : aucune.
- **Immunités aux dégâts** : aucune.
- **Immunités aux états (identifiants source)** : aucune.
- **Sens** : darkvision 60 ft. ; passive_perception 10.
- **Langues (source)** : Common, Goblin.

**Traits et actions SRD** — descriptions originales conservées pour éviter les ajouts ou traductions erronés :

**Traits**

- **Martial Advantage** : Once per turn, the hobgoblin can deal an extra 7 (2d6) damage to a creature it hits with a weapon attack if that creature is within 5 ft. of an ally of the hobgoblin that isn't incapacitated.

**Actions**

- **Longsword** : Melee Weapon Attack: +3 to hit, reach 5 ft., one target. Hit: 5 (1d8 + 1) slashing damage, or 6 (1d10 + 1) slashing damage if used with two hands.
- **Longbow** : Ranged Weapon Attack: +3 to hit, range 150/600 ft., one target. Hit: 5 (1d8 + 1) piercing damage.

**Projection moteur de base** : Longsword, +3, 1d8+1 slashing, allonge 5 pieds ; marche 30 pieds.

**Rôle dans ce module** : Chef de l'appartement, salle 9.

- Son titre est narratif : ni multiattaque de capitaine ni redirection d'attaque de boss gobelin ne s'ajoutent à ce bloc. Peut tenter de fuir lorsqu'il est très blessé, uniquement après résolution du déplacement.

### Champignon violet

Source : [Violet Fungus](https://www.dnd5eapi.co/api/2014/monsters/violet-fungus) — SRD 2014 · type moteur `violet_fungus`.

- **Taille / type / alignement (source)** : Medium / plant / unaligned.
- **CA** 5 (dex) · **PV** 18 (4d8) · **FP** 1/4 · **XP** 50.
- **Vitesses** : marche 5 ft.
- **Caractéristiques** : FOR 3 · DEX 1 · CON 10 · INT 1 · SAG 3 · CHA 1.
- **Maîtrises / sauvegardes (source)** : aucune indiquée.
- **Vulnérabilités** : aucune.
- **Résistances** : aucune.
- **Immunités aux dégâts** : aucune.
- **Immunités aux états (identifiants source)** : blinded, deafened, frightened.
- **Sens** : blindsight 30 ft. (blind beyond this radius) ; passive_perception 6.
- **Langues (source)** : aucune.

**Traits et actions SRD** — descriptions originales conservées pour éviter les ajouts ou traductions erronés :

**Traits**

- **False Appearance** : While the violet fungus remains motionless, it is indistinguishable from an ordinary fungus.

**Actions**

- **Multiattack** : The fungus makes 1d4 Rotting Touch attacks.
- **Rotting Touch** : Melee Weapon Attack: +2 to hit, reach 10 ft., one creature. Hit: 4 (1d8) necrotic damage.

**Correction sourcée de l'API** (condition_immunities) : The API duplicates blinded; the official SRD lists blinded, deafened, frightened. [SRD officiel, p. 309](https://media.wizards.com/2023/downloads/dnd/SRD_CC_v5.1.pdf#page=309).

**Projection moteur de base** : Rotting Touch, +2, 1d8 necrotic, allonge 10 pieds ; marche 5 pieds.

**Rôle dans ce module** : Tas de déchets, salle 3.

- Créature végétale SRD, jamais un zombie reskinné. La touche pourrie inflige des dégâts nécrotiques : aucun effet anti-soin ni sauvegarde de Constitution DD 10 n'est ajouté.

### Mac — arbre éveillé

Source : [Awakened Tree](https://www.dnd5eapi.co/api/2014/monsters/awakened-tree) — SRD 2014 · type moteur `awakened_tree`.

- **Taille / type / alignement (source)** : Huge / plant / unaligned.
- **CA** 13 (natural) · **PV** 59 (7d12+14) · **FP** 2 · **XP** 450.
- **Vitesses** : marche 20 ft.
- **Caractéristiques** : FOR 19 · DEX 6 · CON 15 · INT 10 · SAG 10 · CHA 7.
- **Maîtrises / sauvegardes (source)** : aucune indiquée.
- **Vulnérabilités** : fire.
- **Résistances** : bludgeoning, piercing.
- **Immunités aux dégâts** : aucune.
- **Immunités aux états (identifiants source)** : aucune.
- **Sens** : passive_perception 10.
- **Langues (source)** : one language known by its creator.

**Traits et actions SRD** — descriptions originales conservées pour éviter les ajouts ou traductions erronés :

**Traits**

- **False Appearance** : While the tree remains motionless, it is indistinguishable from a normal tree.

**Actions**

- **Slam** : Melee Weapon Attack: +6 to hit, reach 10 ft., one target. Hit: 14 (3d6 + 4) bludgeoning damage.

**Projection moteur de base** : Slam, +6, 3d6+4 bludgeoning, allonge 10 pieds ; marche 20 pieds.

**Rôle dans ce module** : Gardien de l'entrée extérieure, normalement neutre.

- Pommier éveillé de fiction, pas le Treant FP 9. Les langues supplémentaires du scénario restent un choix narratif du module, distinct de la référence SRD.

### Dryades du verger

Source : [Dryad](https://www.dnd5eapi.co/api/2014/monsters/dryad) — SRD 2014 · type moteur `dryad`.

- **Taille / type / alignement (source)** : Medium / fey / neutral.
- **CA** 11 (dex) ; 16 (spell) · **PV** 22 (5d8) · **FP** 1 · **XP** 200.
- **Vitesses** : marche 30 ft.
- **Caractéristiques** : FOR 10 · DEX 12 · CON 11 · INT 14 · SAG 15 · CHA 18.
- **Maîtrises / sauvegardes (source)** : Skill: Perception +4 ; Skill: Stealth +5.
- **Vulnérabilités** : aucune.
- **Résistances** : aucune.
- **Immunités aux dégâts** : aucune.
- **Immunités aux états (identifiants source)** : aucune.
- **Sens** : darkvision 60 ft. ; passive_perception 14.
- **Langues (source)** : Elvish, Sylvan.

**Traits et actions SRD** — descriptions originales conservées pour éviter les ajouts ou traductions erronés :

**Traits**

- **Innate Spellcasting** : The dryad's innate spellcasting ability is Charisma (spell save DC 14). The dryad can innately cast the following spells, requiring no material components:  At will: druidcraft 3/day each: entangle, goodberry 1/day each: barkskin, pass without trace, shillelagh
- **Magic Resistance** : The dryad has advantage on saving throws against spells and other magical effects.
- **Speak with Beasts and Plants** : The dryad can communicate with beasts and plants as if they shared a language.
- **Tree Stride** : Once on her turn, the dryad can use 10 ft. of her movement to step magically into one living tree within her reach and emerge from a second living tree within 60 ft. of the first tree, appearing in an unoccupied space within 5 ft. of the second tree. Both trees must be large or bigger.

**Actions**

- **Club** : Melee Weapon Attack: +2 to hit (+6 to hit with shillelagh), reach 5 ft., one target. Hit: 2 (1d4) bludgeoning damage, or 8 (1d8 + 4) bludgeoning damage with shillelagh.
- **Fey Charm** : The dryad targets one humanoid or beast that she can see within 30 feet of her. If the target can see the dryad, it must succeed on a DC 14 Wisdom saving throw or be magically charmed. The charmed creature regards the dryad as a trusted friend to be heeded and protected. Although the target isn't under the dryad's control, it takes the dryad's requests or actions in the most favorable way it can. Each time the dryad or its allies do anything harmful to the target, it can repeat the saving throw, ending the effect on itself on a success. Otherwise, the effect lasts 24 hours or until the dryad dies, is on a different plane of existence from the target, or ends the effect as a bonus action. If a target's saving throw is successful, the target is immune to the dryad's Fey Charm for the next 24 hours. The dryad can have no more than one humanoid and up to three beasts charmed at a time.

**Projection moteur de base** : Club, +2, 1d4 bludgeoning, allonge 5 pieds ; marche 30 pieds.

**Rôle dans ce module** : Trois protectrices cachées dans la salle 2.

- Charisme 18. Le gourdin de base et sa variante sous shillelagh sont distincts ; ne pas supposer le sort actif. La liste innée exacte figure ci-dessous, sans le sort inventé « Hérissons ».
