# Bestiaire & notes de maîtrise — La Crypte des Marées

> Généré par `node scripts/sync-srd-bestiaries.cjs --write` depuis le snapshot SRD 2014 consulté le 2026-10-30.
> Sources : [D&D 5e SRD API](https://www.dnd5eapi.co/) (projet communautaire 5e-bits), référentiel SRD 2014.
> Matériel SRD 5.1 sous CC-BY-4.0 : [attribution](../../lib/srd/monsters.LICENSE.txt). Les éventuelles corrections vérifiées dans le SRD officiel sont signalées et la réponse API originale est conservée.
> Les noms de campagne et comportements ci-dessous sont des adaptations narratives ; les valeurs de référence viennent de chaque endpoint cité. Aucun PV réduit dans les rencontres autorées.
> Le moteur applique les dégâts typés, résistances, vulnérabilités et immunités (dégâts et états), les multiattaques du catalogue et plusieurs effets de frappe et pouvoirs actifs. Les jets, coûts, durées et recharges passent par les outils. La couverture précise et les limites de chaque créature sont renvoyées par `get_monster_stat_block.engineSupport` ; un pouvoir seulement décrit dans la source n'est jamais une résolution mécanique acquise. Voir [règles moteur](../../docs/monster-combat-rules.md).

**Niveau du joueur : 2.** Tous les combats sont évitables. Les morts protègent leur Gardienne et la Flamme ; ils ne haïssent pas les vivants. Proposer un geste de respect et un test de Charisme ou de Sagesse DD 13 lorsque le module le prévoit.

Le Gardien Noyé utilise désormais le Wight SRD (FP 3, 45 PV), un véritable mort-vivant, et non un capitaine hobgobelin réduit à 33 PV. Avec le zombie de la chapelle, cette rencontre représente 750 XP bruts : le combat direct est particulièrement dangereux pour un héros solo de niveau 2. Préserver la médiation, le Médaillon et l'aide de l'Écho.

La marée est l'horloge narrative du module, pas une source de dégâts arbitraires. Les vitesses SRD restent intactes : un ralentissement dans l'eau demande une règle résolue, pas une réduction cachée des statistiques. Les morts cessent le combat après une résolution sociale confirmée et un appel explicite de fin de combat.

### Marins et sonneurs squelettes

Source : [Skeleton](https://www.dnd5eapi.co/api/2014/monsters/skeleton) — SRD 2014 · type moteur `skeleton`.

- **Taille / type / alignement (source)** : Medium / undead / lawful evil.
- **CA** 13 (armor : armor scraps) · **PV** 13 (2d8+4) · **FP** 1/4 · **XP** 50.
- **Vitesses** : marche 30 ft.
- **Caractéristiques** : FOR 10 · DEX 14 · CON 15 · INT 6 · SAG 8 · CHA 5.
- **Maîtrises / sauvegardes (source)** : aucune indiquée.
- **Vulnérabilités** : bludgeoning.
- **Résistances** : aucune.
- **Immunités aux dégâts** : poison.
- **Immunités aux états (identifiants source)** : poisoned, exhaustion.
- **Sens** : darkvision 60 ft. ; passive_perception 9.
- **Langues (source)** : understands all languages it spoke in life but can't speak.

**Traits et actions SRD** — descriptions originales conservées pour éviter les ajouts ou traductions erronés :

**Actions**

- **Shortsword** : Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 5 (1d6 + 2) piercing damage.
- **Shortbow** : Ranged Weapon Attack: +4 to hit, range 80/320 ft., one target. Hit: 5 (1d6 + 2) piercing damage.

**Projection moteur de base** : Shortsword, +4, 1d6+2 piercing, allonge 5 pieds ; marche 30 pieds.

**Rôle dans ce module** : Gardes des salles 5, 6 et 7.

- Le sabre du décor conserve le profil de l'épée courte SRD et ses dégâts perforants ; son nom ne transforme pas le type de dégâts en tranchant.

### Marins noyés

Source : [Zombie](https://www.dnd5eapi.co/api/2014/monsters/zombie) — SRD 2014 · type moteur `zombie`.

- **Taille / type / alignement (source)** : Medium / undead / neutral evil.
- **CA** 8 (dex) · **PV** 22 (3d8+9) · **FP** 1/4 · **XP** 50.
- **Vitesses** : marche 20 ft.
- **Caractéristiques** : FOR 13 · DEX 6 · CON 16 · INT 3 · SAG 6 · CHA 5.
- **Maîtrises / sauvegardes (source)** : Saving Throw: WIS +0.
- **Vulnérabilités** : aucune.
- **Résistances** : aucune.
- **Immunités aux dégâts** : poison.
- **Immunités aux états (identifiants source)** : poisoned.
- **Sens** : darkvision 60 ft. ; passive_perception 8.
- **Langues (source)** : understands all languages it spoke in life but can't speak.

**Traits et actions SRD** — descriptions originales conservées pour éviter les ajouts ou traductions erronés :

**Traits**

- **Undead Fortitude** : If damage reduces the zombie to 0 hit points, it must make a Constitution saving throw with a DC of 5+the damage taken, unless the damage is radiant or from a critical hit. On a success, the zombie drops to 1 hit point instead.

**Actions**

- **Slam** : Melee Weapon Attack: +3 to hit, reach 5 ft., one target. Hit: 4 (1d6 + 1) bludgeoning damage.

**Projection moteur de base** : Slam, +3, 1d6+1 bludgeoning, allonge 5 pieds ; marche 20 pieds.

**Rôle dans ce module** : Un noyé en salle 5 et un noyé de la chapelle en salle 8.

- 22 PV. Pas d'immunité générale au charme ou à la peur. La résistance des morts-vivants n'est pas limitée à une fois par tour dans le SRD ; ses exceptions radiant et critique figurent dans le texte source.

### Le Gardien Noyé — nécrophage (Wight)

Source : [Wight](https://www.dnd5eapi.co/api/2014/monsters/wight) — SRD 2014 · type moteur `wight`.

- **Taille / type / alignement (source)** : Medium / undead / neutral evil.
- **CA** 14 (armor) · **PV** 45 (6d8+18) · **FP** 3 · **XP** 700.
- **Vitesses** : marche 30 ft.
- **Caractéristiques** : FOR 15 · DEX 14 · CON 16 · INT 10 · SAG 13 · CHA 15.
- **Maîtrises / sauvegardes (source)** : Skill: Perception +3 ; Skill: Stealth +4.
- **Vulnérabilités** : aucune.
- **Résistances** : necrotic, bludgeoning, piercing, and slashing from nonmagical weapons that aren't silvered.
- **Immunités aux dégâts** : poison.
- **Immunités aux états (identifiants source)** : exhaustion, poisoned.
- **Sens** : darkvision 60 ft. ; passive_perception 13.
- **Langues (source)** : the languages it knew in life.

**Traits et actions SRD** — descriptions originales conservées pour éviter les ajouts ou traductions erronés :

**Traits**

- **Sunlight Sensitivity** : While in sunlight, the wight has disadvantage on attack rolls, as well as on Wisdom (Perception) checks that rely on sight.

**Actions**

- **Multiattack** : The wight makes two longsword attacks or two longbow attacks. It can use its Life Drain in place of one longsword attack.
- **Life Drain** : Melee Weapon Attack: +4 to hit, reach 5 ft., one creature. Hit: 5 (1d6 + 2) necrotic damage. The target must succeed on a DC 13 Constitution saving throw or its hit point maximum is reduced by an amount equal to the damage taken. This reduction lasts until the target finishes a long rest. The target dies if this effect reduces its hit point maximum to 0. A humanoid slain by this attack rises 24 hours later as a zombie under the wight's control, unless the humanoid is restored to life or its body is destroyed. The wight can have no more than twelve zombies under its control at one time.
- **Longsword** : Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 6 (1d8 + 2) slashing damage, or 7 (1d10 + 2) slashing damage if used with two hands.
- **Longbow** : Ranged Weapon Attack: +4 to hit, range 150/600 ft., one target. Hit: 6 (1d8 + 2) piercing damage.

**Projection moteur de base** : Longsword, +4, 1d8+2 slashing, allonge 5 pieds ; marche 30 pieds.

**Rôle dans ce module** : Capitaine mort-vivant de la chapelle, salle 8.

- Reconnaît le Médaillon et respecte la médiation de l'Écho. Il n'hérite ni de l'avantage martial ni du leadership d'un hobgobelin. Son Drain de vie et sa multiattaque sont décrits à titre de référence ; ne pas en inventer la résolution dans le moteur actuel.

### Écho de la Gardienne — fantôme

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

**Rôle dans ce module** : Médiatrice de la salle 8 ; bloc utilisé uniquement si elle devient combattante.

- Normalement protectrice et tournée vers le dialogue. La référence mécanique est un fantôme SRD, pas le feu follet de la campagne féerique. Les règles d'incorporéité et de possession ne sont pas automatiquement simulées.

### Loups des dunes

Source : [Wolf](https://www.dnd5eapi.co/api/2014/monsters/wolf) — SRD 2014 · type moteur `wolf`.

- **Taille / type / alignement (source)** : Medium / beast / unaligned.
- **CA** 13 (natural) · **PV** 11 (2d8+2) · **FP** 1/4 · **XP** 50.
- **Vitesses** : marche 40 ft.
- **Caractéristiques** : FOR 12 · DEX 15 · CON 12 · INT 3 · SAG 12 · CHA 6.
- **Maîtrises / sauvegardes (source)** : Skill: Perception +3 ; Skill: Stealth +4.
- **Vulnérabilités** : aucune.
- **Résistances** : aucune.
- **Immunités aux dégâts** : aucune.
- **Immunités aux états (identifiants source)** : aucune.
- **Sens** : passive_perception 13.
- **Langues (source)** : aucune.

**Traits et actions SRD** — descriptions originales conservées pour éviter les ajouts ou traductions erronés :

**Traits**

- **Keen Hearing and Smell** : The wolf has advantage on Wisdom (Perception) checks that rely on hearing or smell.
- **Pack Tactics** : The wolf has advantage on an attack roll against a creature if at least one of the wolf's allies is within 5 ft. of the creature and the ally isn't incapacitated.

**Actions**

- **Bite** : Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 7 (2d4 + 2) piercing damage. If the target is a creature, it must succeed on a DC 11 Strength saving throw or be knocked prone.

**Projection moteur de base** : Bite, +4, 2d4+2 piercing, allonge 5 pieds ; marche 40 pieds.

**Rôle dans ce module** : Deux charognards de la grève, salle 3.

- Évitables en tenant la lanterne haut selon la scène ; ne pas ajouter de faiblesse mécanique à la lumière au bloc SRD.

### Pilleurs d'épaves

Source : [Bandit](https://www.dnd5eapi.co/api/2014/monsters/bandit) — SRD 2014 · type moteur `bandit`.

- **Taille / type / alignement (source)** : Medium / humanoid (any race) / any non-lawful alignment.
- **CA** 12 (armor) · **PV** 11 (2d8+2) · **FP** 1/8 · **XP** 25.
- **Vitesses** : marche 30 ft.
- **Caractéristiques** : FOR 11 · DEX 12 · CON 12 · INT 10 · SAG 10 · CHA 10.
- **Maîtrises / sauvegardes (source)** : aucune indiquée.
- **Vulnérabilités** : aucune.
- **Résistances** : aucune.
- **Immunités aux dégâts** : aucune.
- **Immunités aux états (identifiants source)** : aucune.
- **Sens** : passive_perception 10.
- **Langues (source)** : any one language (usually Common).

**Traits et actions SRD** — descriptions originales conservées pour éviter les ajouts ou traductions erronés :

**Actions**

- **Scimitar** : Melee Weapon Attack: +3 to hit, reach 5 ft., one target. Hit: 4 (1d6 + 1) slashing damage.
- **Light Crossbow** : Ranged Weapon Attack: +3 to hit, range 80/320 ft., one target. Hit: 5 (1d8 + 1) piercing damage.

**Projection moteur de base** : Scimitar, +3, 1d6+1 slashing, allonge 5 pieds ; marche 30 pieds.

**Rôle dans ce module** : Deux naufrageurs vivants, salle 2.

- Le coutelas conserve le profil du cimeterre SRD. Ce sont des humanoïdes vivants, sans traits de mort-vivant.

### Profil des PNJ : Maël

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
