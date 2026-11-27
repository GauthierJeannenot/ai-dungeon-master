# Sarah du manoir Yellowcrest — bestiaire et adaptation solo

> Généré par `node scripts/sync-srd-bestiaries.cjs --write` depuis le snapshot SRD 2014 consulté le 2026-10-30.
> Sources : [D&D 5e SRD API](https://www.dnd5eapi.co/) (projet communautaire 5e-bits), référentiel SRD 2014.
> Matériel SRD 5.1 sous CC-BY-4.0 : [attribution](../../lib/srd/monsters.LICENSE.txt). Les éventuelles corrections vérifiées dans le SRD officiel sont signalées et la réponse API originale est conservée.
> Les noms de campagne et comportements ci-dessous sont des adaptations narratives ; les valeurs de référence viennent de chaque endpoint cité. Aucun PV réduit dans les rencontres autorées.
> Le moteur applique les dégâts typés, résistances, vulnérabilités et immunités (dégâts et états), les multiattaques du catalogue et plusieurs effets de frappe et pouvoirs actifs. Les jets, coûts, durées et recharges passent par les outils. La couverture précise et les limites de chaque créature sont renvoyées par `get_monster_stat_block.engineSupport` ; un pouvoir seulement décrit dans la source n'est jamais une résolution mécanique acquise. Voir [règles moteur](../../docs/monster-combat-rules.md).

Source narrative : document utilisateur Candlekeep Mysteries — Sarah of Yellowcrest Manor, Derek Ruiz ; développement et édition Scott Fitzgerald Gray. Les statistiques de référence ci-dessous viennent du SRD 2014, pas du texte commercial.

Version pour un héros au niveau 7 avec le kit et les capacités implémentées du personnage choisi. Effectifs réduits, PV SRD inchangés. Les gardes du coche et de la grange sont moins nombreux ; aucun renfort automatique dans la chapelle. Les négociations, le contournement et les redditions peuvent éviter des combats.

Les grells non SRD ne sont pas simulés par un bloc inventé : un grick SRD garde le caveau dans cette adaptation. Le vol, les tentacules paralysants et l’apparition d’un second grell au round 2 sont retirés. Le piège de chute B2 est explicitement neutralisé et ne téléporte personne. La Porte dimensionnelle d’un héros peut en revanche rejoindre une case libre du plan déplié en dépensant son emplacement.

Viallis emploie le mage SRD. Avec un profil SRD 2014, cast_creature_spell résout explicitement Boule de feu, Projectile magique, Armure du mage, Foulée brumeuse, Invisibilité supérieure et Détection de la magie, avec ses emplacements réels et une éventuelle réaction de Contresort du héros. Les autres sorts, réactions du mage, robe et parchemin de fuite restent non automatisés ; aucun effet par narration seule.

Sarah, Vecken, Faerl et le jeune Fargo sont des PNJ narratifs, pas des monstres hostiles cachés. Leurs blocs sources servent à les identifier ; aucun effet spécial, attaque alliée ou PV de PNJ ne doit être présenté comme acquis sans outil. Les deux positions de Faerl et de Vecken correspondent au même individu à des étapes différentes.

Tous les pions PNJ possèdent désormais leur fiche mécanique dans state.npcs. Les captifs sont un groupe maison de cinq Commoners et le pion final un groupe de cinq Ghosts ; les pertes réduisent leur effectif, sans désigner de victime nommée. Aucun groupe supplémentaire n’est créé par la narration.

### Fidèles de la Langue brûlée

Source : [Cultist](https://www.dnd5eapi.co/api/2014/monsters/cultist) — SRD 2014 · type moteur `cultist`.

- **Taille / type / alignement (source)** : Medium / humanoid (any race) / any non-good alignment.
- **CA** 12 (armor) · **PV** 9 (2d8) · **FP** 1/8 · **XP** 25.
- **Vitesses** : marche 30 ft.
- **Caractéristiques** : FOR 11 · DEX 12 · CON 10 · INT 10 · SAG 11 · CHA 10.
- **Maîtrises / sauvegardes (source)** : Skill: Deception +2 ; Skill: Religion +2.
- **Vulnérabilités** : aucune.
- **Résistances** : aucune.
- **Immunités aux dégâts** : aucune.
- **Immunités aux états (identifiants source)** : aucune.
- **Sens** : passive_perception 10.
- **Langues (source)** : any one language (usually Common).

**Traits et actions SRD** — descriptions originales conservées pour éviter les ajouts ou traductions erronés :

**Traits**

- **Dark Devotion** : The cultist has advantage on saving throws against being charmed or frightened.

**Actions**

- **Scimitar** : Melee Weapon Attack: +3 to hit, reach 5 ft., one creature. Hit: 4 (1d6 + 1) slashing damage.

**Projection moteur de base** : Scimitar, +3, 1d6+1 slashing, allonge 5 pieds ; marche 30 pieds.

**Rôle dans ce module** : Garde du coche, guetteurs de la grange et de B1, novice de B12.

- Fanatisme humain, sans pouvoir magique ajouté. Une reddition établie peut terminer une rencontre sans tuer tous les adversaires.

### Officiants et ravisseurs

Source : [Cult Fanatic](https://www.dnd5eapi.co/api/2014/monsters/cult-fanatic) — SRD 2014 · type moteur `cult_fanatic`.

- **Taille / type / alignement (source)** : Medium / humanoid (any race) / any non-good alignment.
- **CA** 13 (armor) · **PV** 22 (6d8-5) · **FP** 2 · **XP** 450.
- **Vitesses** : marche 30 ft.
- **Caractéristiques** : FOR 11 · DEX 14 · CON 12 · INT 10 · SAG 13 · CHA 14.
- **Maîtrises / sauvegardes (source)** : Skill: Deception +4 ; Skill: Persuasion +4 ; Skill: Religion +2.
- **Vulnérabilités** : aucune.
- **Résistances** : aucune.
- **Immunités aux dégâts** : aucune.
- **Immunités aux états (identifiants source)** : aucune.
- **Sens** : passive_perception 11.
- **Langues (source)** : any one language (usually Common).

**Traits et actions SRD** — descriptions originales conservées pour éviter les ajouts ou traductions erronés :

**Traits**

- **Dark Devotion** : The fanatic has advantage on saving throws against being charmed or frightened.
- **Spellcasting** : The fanatic is a 4th-level spellcaster. Its spell casting ability is Wisdom (spell save DC 11, +3 to hit with spell attacks). The fanatic has the following cleric spells prepared:  Cantrips (at will): light, sacred flame, thaumaturgy - 1st level (4 slots): command, inflict wounds, shield of faith - 2nd level (3 slots): hold person, spiritual weapon

**Actions**

- **Multiattack** : The fanatic makes two melee attacks.
- **Dagger** : Melee or Ranged Weapon Attack: +4 to hit, reach 5 ft. or range 20/60 ft., one creature. Hit: 4 (1d4 + 2) piercing damage.

**Projection moteur de base** : Dagger, +4, 1d4+2 piercing, allonge 5 pieds ; marche 30 pieds.

**Rôle dans ce module** : Meneur de la grange, guetteur B3, instructeur B12 et assistant de Viallis.

- Les sorts du bloc source ne sont pas des actions automatisées de la projection ; seule l’attaque prise en charge produit ses dégâts.

### Mercenaire du coche

Source : [Thug](https://www.dnd5eapi.co/api/2014/monsters/thug) — SRD 2014 · type moteur `thug`.

- **Taille / type / alignement (source)** : Medium / humanoid (any race) / any non-good alignment.
- **CA** 11 (armor) · **PV** 32 (5d8+10) · **FP** 1/2 · **XP** 100.
- **Vitesses** : marche 30 ft.
- **Caractéristiques** : FOR 15 · DEX 11 · CON 14 · INT 10 · SAG 10 · CHA 11.
- **Maîtrises / sauvegardes (source)** : Skill: Intimidation +2.
- **Vulnérabilités** : aucune.
- **Résistances** : aucune.
- **Immunités aux dégâts** : aucune.
- **Immunités aux états (identifiants source)** : aucune.
- **Sens** : passive_perception 10.
- **Langues (source)** : any one language (usually Common).

**Traits et actions SRD** — descriptions originales conservées pour éviter les ajouts ou traductions erronés :

**Traits**

- **Pack Tactics** : The thug has advantage on an attack roll against a creature if at least one of the thug's allies is within 5 ft. of the creature and the ally isn't incapacitated.

**Actions**

- **Multiattack** : The thug makes two melee attacks.
- **Mace** : Melee Weapon Attack: +4 to hit, reach 5 ft., one creature. Hit: 5 (1d6 + 2) bludgeoning damage.
- **Heavy Crossbow** : Ranged Weapon Attack: +2 to hit, range 100/400 ft., one target. Hit: 5 (1d10) piercing damage.

**Projection moteur de base** : Mace, +4, 1d6+2 bludgeoning, allonge 5 pieds ; marche 30 pieds.

**Rôle dans ce module** : Protège Faerl à Waterdeep ; le reste de l’escorte du texte papier est retiré dans la version solo.


### Lord Viallis Yellowcrest

Source : [Mage](https://www.dnd5eapi.co/api/2014/monsters/mage) — SRD 2014 · type moteur `mage`.

- **Taille / type / alignement (source)** : Medium / humanoid (any race) / any alignment.
- **CA** 12 (dex) ; 15 (spell) · **PV** 40 (9d8) · **FP** 6 · **XP** 2300.
- **Vitesses** : marche 30 ft.
- **Caractéristiques** : FOR 9 · DEX 14 · CON 11 · INT 17 · SAG 12 · CHA 11.
- **Maîtrises / sauvegardes (source)** : Saving Throw: INT +6 ; Saving Throw: WIS +4 ; Skill: Arcana +6 ; Skill: History +6.
- **Vulnérabilités** : aucune.
- **Résistances** : aucune.
- **Immunités aux dégâts** : aucune.
- **Immunités aux états (identifiants source)** : aucune.
- **Sens** : passive_perception 11.
- **Langues (source)** : any four languages.

**Traits et actions SRD** — descriptions originales conservées pour éviter les ajouts ou traductions erronés :

**Traits**

- **Spellcasting** : The mage is a 9th-level spellcaster. Its spellcasting ability is Intelligence (spell save DC 14, +6 to hit with spell attacks). The mage has the following wizard spells prepared:  - Cantrips (at will): fire bolt, light, mage hand, prestidigitation - 1st level (4 slots): detect magic, mage armor, magic missile, shield - 2nd level (3 slots): misty step, suggestion - 3rd level (3 slots): counterspell, fireball, fly - 4th level (3 slots): greater invisibility, ice storm - 5th level (1 slot): cone of cold

**Actions**

- **Dagger** : Melee or Ranged Weapon Attack: +5 to hit, reach 5 ft. or range 20/60 ft., one target. Hit: 4 (1d4 + 2) piercing damage.

**Projection moteur de base** : Dagger, +5, 1d4+2 piercing, allonge 5 pieds ; marche 30 pieds.

**Rôle dans ce module** : Meurtrier de sa famille et meneur du culte de Gaernoo, rencontré en B7.

- Arrogant, loyal à Gaernoo, hésitant quand il perd la maîtrise. Choisir une attaque ou un sort réellement pris en charge : cast_creature_spell exige casterId, spellId, emplacement et cible ou zone explicites. Puis terminer les tours restants sans rejouer son action. La dague ne devient jamais une Boule de feu par changement de nom.
- Armure du mage, téléportation et invisibilité ne modifient l’état qu’après leur outil. Le mage possède des emplacements 4/3/3/3/1 ; un sort de base peut utiliser un niveau supérieur explicitement choisi. Aucun sort non listé par engineSupport.spellcasting n’est acquis.

### Grick de Gaernoo

Source : [Grick](https://www.dnd5eapi.co/api/2014/monsters/grick) — SRD 2014 · type moteur `grick`.

- **Taille / type / alignement (source)** : Medium / monstrosity / neutral.
- **CA** 14 (natural) · **PV** 27 (6d8) · **FP** 2 · **XP** 450.
- **Vitesses** : marche 30 ft ; escalade 30 ft.
- **Caractéristiques** : FOR 14 · DEX 14 · CON 11 · INT 3 · SAG 14 · CHA 5.
- **Maîtrises / sauvegardes (source)** : aucune indiquée.
- **Vulnérabilités** : aucune.
- **Résistances** : bludgeoning, piercing, and slashing from nonmagical weapons.
- **Immunités aux dégâts** : aucune.
- **Immunités aux états (identifiants source)** : aucune.
- **Sens** : darkvision 60 ft. ; passive_perception 12.
- **Langues (source)** : aucune.

**Traits et actions SRD** — descriptions originales conservées pour éviter les ajouts ou traductions erronés :

**Traits**

- **Stone Camouflage** : The grick has advantage on Dexterity (Stealth) checks made to hide in rocky terrain.

**Actions**

- **Multiattack** : The grick makes one attack with its tentacles. If that attack hits, the grick can make one beak attack against the same target.
- **Tentacles** : Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 9 (2d6 + 2) slashing damage.
- **Beak** : Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 5 (1d6 + 2) piercing damage.

**Projection moteur de base** : Tentacles, +4, 2d6+2 slashing, allonge 5 pieds ; marche 30 pieds.

**Rôle dans ce module** : Gardien terrestre du caveau B8, substitution explicite aux grells du scénario papier.

- Le camouflage et les résistances sont documentés par la source ; leurs effets ne sont pas automatiquement appliqués. Pas de vol ou de paralysie.

### Sarah

Source : [Ghost](https://www.dnd5eapi.co/api/2014/monsters/ghost) — SRD 2014 · type moteur `ghost`.

- **Taille / type / alignement (source)** : Medium / undead / any alignment.
- **CA** 11 (dex) · **PV** 45 (10d8) · **FP** 4 · **XP** 1100.
- **Vitesses** : marche 0 ft ; vol 40 ft ; stationnaire true.
- **Caractéristiques** : FOR 7 · DEX 13 · CON 10 · INT 10 · SAG 12 · CHA 17.
- **Maîtrises / sauvegardes (source)** : aucune indiquée.
- **Vulnérabilités** : aucune.
- **Résistances** : acid, fire, lightning, thunder, bludgeoning, piercing, and slashing from nonmagical weapons.
- **Immunités aux dégâts** : cold, necrotic, poison.
- **Immunités aux états (identifiants source)** : charmed, exhaustion, frightened, grappled, paralyzed, petrified, poisoned, prone, restrained.
- **Sens** : darkvision 60 ft. ; passive_perception 11.
- **Langues (source)** : any languages it knew in life.

**Traits et actions SRD** — descriptions originales conservées pour éviter les ajouts ou traductions erronés :

**Traits**

- **Ethereal Sight** : The ghost can see 60 ft. into the Ethereal Plane when it is on the Material Plane, and vice versa.
- **Incorporeal Movement** : The ghost can move through other creatures and objects as if they were difficult terrain. It takes 5 (1d10) force damage if it ends its turn inside an object.

**Actions**

- **Withering Touch** : Melee Weapon Attack: +5 to hit, reach 5 ft., one target. Hit: 17 (4d6 + 3) necrotic damage.
- **Etherealness** : The ghost enters the Ethereal Plane from the Material Plane, or vice versa. It is visible on the Material Plane while it is in the Border Ethereal, and vice versa, yet it can't affect or be affected by anything on the other plane.
- **Horrifying Visage** : Each non-undead creature within 60 ft. of the ghost that can see it must succeed on a DC 13 Wisdom saving throw or be frightened for 1 minute. If the save fails by 5 or more, the target also ages 1d4 × 10 years. A frightened target can repeat the saving throw at the end of each of its turns, ending the frightened condition on itself on a success. If a target's saving throw is successful or the effect ends for it, the target is immune to this ghost's Horrifying Visage for the next 24 hours. The aging effect can be reversed with a greater restoration spell, but only within 24 hours of it occurring.
- **Possession** : One humanoid that the ghost can see within 5 ft. of it must succeed on a DC 13 Charisma saving throw or be possessed by the ghost; the ghost then disappears, and the target is incapacitated and loses control of its body. The ghost now controls the body but doesn't deprive the target of awareness. The ghost can't be targeted by any attack, spell, or other effect, except ones that turn undead, and it retains its alignment, Intelligence, Wisdom, Charisma, and immunity to being charmed and frightened. It otherwise uses the possessed target's statistics, but doesn't gain access to the target's knowledge, class features, or proficiencies. The possession lasts until the body drops to 0 hit points, the ghost ends it as a bonus action, or the ghost is turned or forced out by an effect like the dispel evil and good spell. When the possession ends, the ghost reappears in an unoccupied space within 5 ft. of the body. The target is immune to this ghost's Possession for 24 hours after succeeding on the saving throw or after the possession ends.

**Projection moteur de base** : Withering Touch, +5, 4d6+3 necrotic, allonge 5 pieds ; marche 0 pieds.

**Rôle dans ce module** : Victime bienveillante, liée au journal à Candlekeep, puis libérée au dénouement.

- Elle refuse de nuire ; ne jamais déclencher un combat pour avoir lu le journal. Elle est muette jusqu’à sa libération. Pas de possession imposée au joueur.

### Faerl

Source : [Noble](https://www.dnd5eapi.co/api/2014/monsters/noble) — SRD 2014 · type moteur `noble`.

- **Taille / type / alignement (source)** : Medium / humanoid (any race) / any alignment.
- **CA** 15 (armor) · **PV** 9 (2d8) · **FP** 1/8 · **XP** 25.
- **Vitesses** : marche 30 ft.
- **Caractéristiques** : FOR 11 · DEX 12 · CON 11 · INT 12 · SAG 14 · CHA 16.
- **Maîtrises / sauvegardes (source)** : Skill: Deception +5 ; Skill: Insight +4 ; Skill: Persuasion +5.
- **Vulnérabilités** : aucune.
- **Résistances** : aucune.
- **Immunités aux dégâts** : aucune.
- **Immunités aux états (identifiants source)** : aucune.
- **Sens** : passive_perception 12.
- **Langues (source)** : any two languages.

**Traits et actions SRD** — descriptions originales conservées pour éviter les ajouts ou traductions erronés :

**Actions**

- **Rapier** : Melee Weapon Attack: +3 to hit, reach 5 ft., one target. Hit: 5 (1d8 + 1) piercing damage.

**Réactions**

- **Parry** : The noble adds 2 to its AC against one melee attack that would hit it. To do so, the noble must see the attacker and be wielding a melee weapon.

**Projection moteur de base** : Rapier, +3, 1d8+1 piercing, allonge 5 pieds ; marche 30 pieds.

**Rôle dans ce module** : Intendant elfe de Viallis, à Waterdeep ou Greenfast selon son sort.

- Le bloc source est humain générique : l’apparence et les langues de l’elfe sont narratives. L’avantage contre charme et l’immunité au sommeil du texte papier ne sont pas automatisés. Il ne révèle pas le culte sous simple persuasion.

### Sir Vecken de la Corne brisée

Source : [Knight](https://www.dnd5eapi.co/api/2014/monsters/knight) — SRD 2014 · type moteur `knight`.

- **Taille / type / alignement (source)** : Medium / humanoid (any race) / any alignment.
- **CA** 18 (armor) · **PV** 52 (8d8+16) · **FP** 3 · **XP** 700.
- **Vitesses** : marche 30 ft.
- **Caractéristiques** : FOR 16 · DEX 11 · CON 14 · INT 11 · SAG 11 · CHA 15.
- **Maîtrises / sauvegardes (source)** : Saving Throw: CON +4 ; Saving Throw: WIS +2.
- **Vulnérabilités** : aucune.
- **Résistances** : aucune.
- **Immunités aux dégâts** : aucune.
- **Immunités aux états (identifiants source)** : aucune.
- **Sens** : passive_perception 10.
- **Langues (source)** : any one language (usually Common).

**Traits et actions SRD** — descriptions originales conservées pour éviter les ajouts ou traductions erronés :

**Traits**

- **Brave** : The knight has advantage on saving throws against being frightened.

**Actions**

- **Multiattack** : The knight makes two melee attacks.
- **Greatsword** : Melee Weapon Attack: +5 to hit, reach 5 ft., one target. Hit: 10 (2d6 + 3) slashing damage.
- **Heavy Crossbow** : Ranged Weapon Attack: +2 to hit, range 100/400 ft., one target. Hit: 5 (1d10) piercing damage.
- **Leadership** : For 1 minute, the knight can utter a special command or warning whenever a nonhostile creature that it can see within 30 ft. of it makes an attack roll or a saving throw. The creature can add a d4 to its roll provided it can hear and understand the knight. A creature can benefit from only one Leadership die at a time. This effect ends if the knight is incapacitated.

**Réactions**

- **Parry** : The knight adds 2 to its AC against one melee attack that would hit it. To do so, the knight must see the attacker and be wielding a melee weapon.

**Projection moteur de base** : Greatsword, +5, 2d6+3 slashing, allonge 5 pieds ; marche 30 pieds.

**Rôle dans ce module** : Ancien amant de Sarah ; témoin à Waterdeep, puis captif ou soutien tardif selon les actes établis.

- N’ajoute pas de tour allié gratuit. Sa blessure est narrative tant qu’il reste un PNJ de carte ; ne pas présenter les 25 PV du texte papier comme une valeur suivie par le moteur.

### Profil des PNJ : L’archiviste des Avoués

Source : [Commoner](https://www.dnd5eapi.co/api/2014/monsters/commoner) — SRD 2014 · type moteur `commoner`.

- **Taille / type / alignement (source)** : Medium / humanoid (any race) / any alignment.
- **CA** 10 (dex) · **PV** 4 (1d8) · **FP** 0 · **XP** 10.
- **Vitesses** : marche 30 ft.
- **Caractéristiques** : FOR 10 · DEX 10 · CON 10 · INT 10 · SAG 10 · CHA 10.
- **Maîtrises / sauvegardes (source)** : aucune indiquée.
- **Vulnérabilités** : aucune.
- **Résistances** : aucune.
- **Immunités aux dégâts** : aucune.
- **Immunités aux états (identifiants source)** : aucune.
- **Sens** : passive_perception 10.
- **Langues (source)** : any one language (usually Common).

**Traits et actions SRD** — descriptions originales conservées pour éviter les ajouts ou traductions erronés :

**Actions**

- **Club** : Melee Weapon Attack: +2 to hit, reach 5 ft., one target. Hit: 2 (1d4) bludgeoning damage.

**Projection moteur de base** : Club, +2, 1d4 bludgeoning, allonge 5 pieds ; marche 30 pieds.



## PNJ — notes d’incarnation

- L’archiviste des Avoués : Commoner, aide documentaire et profil mécanique suivi.
- Arnulf : majordome des Falgarst, témoin des faits publics.
- Le cordonnier : accès fiable à la piste Greenfast même sur un jet social raté.
- Kara Firenni et le vieux Fargo : proches de disparus, aucune récompense mécanique inventée.
- Yaeda, Jalrax, Durz, Seffra et Ashlan : groupe maison de cinq Commoners, 20 PV cumulés ; leur délivrance exige toujours l’ouverture réelle de la grille.
- Le jeune Fargo : novice pouvant renoncer au culte ; exclu du preset hostile pour permettre de l’épargner sans dégâts fictifs.
- La gardienne des sépultures : prépare le dernier repos sans jet bloquant.
