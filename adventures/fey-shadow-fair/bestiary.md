# Bestiaire & notes de maîtrise — La Foire du Voleur d'Ombres

> Généré par `node scripts/sync-srd-bestiaries.cjs --write` depuis le snapshot SRD 2014 consulté le 2026-10-30.
> Sources : [D&D 5e SRD API](https://www.dnd5eapi.co/) (projet communautaire 5e-bits), référentiel SRD 2014.
> Matériel SRD 5.1 sous CC-BY-4.0 : [attribution](../../lib/srd/monsters.LICENSE.txt). Les éventuelles corrections vérifiées dans le SRD officiel sont signalées et la réponse API originale est conservée.
> Les noms de campagne et comportements ci-dessous sont des adaptations narratives ; les valeurs de référence viennent de chaque endpoint cité. Aucun PV réduit dans les rencontres autorées.
> Le moteur applique les dégâts typés, résistances, vulnérabilités et immunités (dégâts et états), les multiattaques du catalogue et plusieurs effets de frappe et pouvoirs actifs. Les jets, coûts, durées et recharges passent par les outils. La couverture précise et les limites de chaque créature sont renvoyées par `get_monster_stat_block.engineSupport` ; un pouvoir seulement décrit dans la source n'est jamais une résolution mécanique acquise. Voir [règles moteur](../../docs/monster-combat-rules.md).

**Niveau du joueur : 3.** Tous les affrontements sont évitables par l'humour, le jeu ou la politesse selon le module : Charisme ou Sagesse DD 12–13 lorsqu'indiqué. Ces DD sont des choix de scénario, pas des pouvoirs SRD.

Les tire-goussets et brigands utilisent le gobelin SRD à 7 PV. Le Grand Flan utilise explicitement le profil de zombie à 22 PV, et le majordome le feu follet à 22 PV ; les anciens PV réduits et la variante gobelin minion sont supprimés. Les rencontres peuvent donc être plus dangereuses ; ne pas compenser en modifiant des statistiques en silence.

Les apparences comiques et comportements suivants appartiennent à cette aventure. Ils ne créent aucun nouveau pouvoir mécanique et ne transforment pas les données SRD en blocs officiels de desserts ou de reflets.

### Tire-goussets, croupiers, péagistes et brigands à mirliton

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

**Rôle dans ce module** : Petits escrocs des deux cartes.

- Tous partagent le même bloc gobelin SRD, sans faux CR 1/8. La fuite liée à la chute d'un compère est un comportement narratif demandant un déplacement résolu, pas une réaction SRD ajoutée.

### Videur satyre

Source : [Satyr](https://www.dnd5eapi.co/api/2014/monsters/satyr) — SRD 2014 · type moteur `satyr`.

- **Taille / type / alignement (source)** : Medium / fey / chaotic neutral.
- **CA** 14 (armor) · **PV** 31 (7d8) · **FP** 1/2 · **XP** 100.
- **Vitesses** : marche 40 ft.
- **Caractéristiques** : FOR 12 · DEX 16 · CON 11 · INT 12 · SAG 10 · CHA 14.
- **Maîtrises / sauvegardes (source)** : Skill: Perception +2 ; Skill: Performance +6 ; Skill: Stealth +5.
- **Vulnérabilités** : aucune.
- **Résistances** : aucune.
- **Immunités aux dégâts** : aucune.
- **Immunités aux états (identifiants source)** : aucune.
- **Sens** : passive_perception 12.
- **Langues (source)** : Common, Elvish, Sylvan.

**Traits et actions SRD** — descriptions originales conservées pour éviter les ajouts ou traductions erronés :

**Traits**

- **Magic Resistance** : The satyr has advantage on saving throws against spells and other magical effects.

**Actions**

- **Ram** : Melee Weapon Attack: +3 to hit, reach 5 ft., one target. Hit: 6 (2d4 + 1) bludgeoning damage.
- **Shortsword** : Melee Weapon Attack: +5 to hit, reach 5 ft., one target. Hit: 6 (1d6 + 3) piercing damage.
- **Shortbow** : Ranged Weapon Attack: +5 to hit, range 80/320 ft., one target. Hit: 6 (1d6 + 3) piercing damage.

**Projection moteur de base** : Shortsword, +5, 1d6+3 piercing, allonge 5 pieds ; marche 40 pieds.

**Rôle dans ce module** : Défend le tripot en vers de mirliton.

- Rimer avec lui, Charisme DD 12 selon le scénario. Coup de tête, épée courte et arc court restent trois actions source distinctes.

### Loups savants échappés

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

**Rôle dans ce module** : Artistes du carrousel.

- Un cerceau et un test de Dressage DD 10 peuvent les apaiser. Cela n'ajoute ni langage ni aptitude magique au loup SRD.

### Le Grand Flan — apparence narrative, profil zombie

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

**Rôle dans ce module** : Dessert de parade animé, salle du festin.

- Il n'existe pas de bloc « Grand Flan » dans cette API. Le module emprunte explicitement le profil zombie intact ; l'apparence gélatineuse n'ajoute aucune résistance ni attaque acide. Un compliment ou une part reprise avec conviction peut désamorcer la scène, Charisme DD 12.

### Reflets désobligeants — apparence narrative, profil bandit

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

**Rôle dans ce module** : Imitations vexantes du héros.

- Ils utilisent les armes et dégâts du bandit SRD, pas les statistiques ou dégâts réels du personnage joueur. Un geste ridicule assumé peut les désamorcer, Charisme DD 12.

### Champignons moqueurs

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

**Rôle dans ce module** : Champignons très lents des deux cartes.

- Le rire est de la couleur narrative ; la touche pourrie n'empêche pas les soins. Leur multiattaque source est une capacité distincte, pas un dégât inventé.

### Grenouilles de bal

Source : [Giant Frog](https://www.dnd5eapi.co/api/2014/monsters/giant-frog) — SRD 2014 · type moteur `giant_frog`.

- **Taille / type / alignement (source)** : Medium / beast / unaligned.
- **CA** 11 (dex) · **PV** 18 (4d8) · **FP** 1/4 · **XP** 50.
- **Vitesses** : marche 30 ft ; nage 30 ft.
- **Caractéristiques** : FOR 12 · DEX 13 · CON 11 · INT 2 · SAG 10 · CHA 3.
- **Maîtrises / sauvegardes (source)** : Skill: Perception +2 ; Skill: Stealth +3.
- **Vulnérabilités** : aucune.
- **Résistances** : aucune.
- **Immunités aux dégâts** : aucune.
- **Immunités aux états (identifiants source)** : aucune.
- **Sens** : darkvision 30 ft. ; passive_perception 12.
- **Langues (source)** : aucune.

**Traits et actions SRD** — descriptions originales conservées pour éviter les ajouts ou traductions erronés :

**Traits**

- **Amphibious** : The frog can breathe air and water
- **Standing Leap** : The frog's long jump is up to 20 ft. and its high jump is up to 10 ft., with or without a running start.

**Actions**

- **Bite** : Melee Weapon Attack: +3 to hit, reach 5 ft., one target. Hit: 4 (1d6 + 1) piercing damage, and the target is grappled (escape DC 11). Until this grapple ends, the target is restrained, and the frog can't bite another target.
- **Swallow** : The frog makes one bite attack against a Small or smaller target it is grappling. If the attack hits, the target is swallowed, and the grapple ends. The swallowed target is blinded and restrained, it has total cover against attacks and other effects outside the frog, and it takes 5 (2d4) acid damage at the start of each of the frog's turns. The frog can have only one target swallowed at a time. If the frog dies, a swallowed creature is no longer restrained by it and can escape from the corpse using 5 ft. of movement, exiting prone.

**Projection moteur de base** : Bite, +3, 1d6+1 piercing, allonge 5 pieds ; marche 30 pieds.

**Rôle dans ce module** : Convives susceptibles du Bois-Ricanant.

- Une révérence correcte peut les apaiser, Charisme DD 12. Agrippement, restriction de taille et déglutition sont conservés dans la référence source ci-dessous.

### Chien-clin — meute des chiens esquiveurs

Source : [Blink Dog](https://www.dnd5eapi.co/api/2014/monsters/blink-dog) — SRD 2014 · type moteur `blink_dog`.

- **Taille / type / alignement (source)** : Medium / fey / lawful good.
- **CA** 13 (dex) · **PV** 22 (4d8+4) · **FP** 1/4 · **XP** 50.
- **Vitesses** : marche 40 ft.
- **Caractéristiques** : FOR 12 · DEX 17 · CON 12 · INT 10 · SAG 13 · CHA 11.
- **Maîtrises / sauvegardes (source)** : Skill: Perception +3 ; Skill: Stealth +5.
- **Vulnérabilités** : aucune.
- **Résistances** : aucune.
- **Immunités aux dégâts** : aucune.
- **Immunités aux états (identifiants source)** : aucune.
- **Sens** : passive_perception 10.
- **Langues (source)** : Blink Dog, understands Sylvan but can't speak it.

**Traits et actions SRD** — descriptions originales conservées pour éviter les ajouts ou traductions erronés :

**Traits**

- **Keen Hearing and Smell** : The dog has advantage on Wisdom (Perception) checks that rely on hearing or smell.

**Actions**

- **Bite** : Melee Weapon Attack: +3 to hit, reach 5 ft., one target. Hit: 4 (1d6 + 1) piercing damage.
- **Teleport** : The dog magically teleports, along with any equipment it is wearing or carrying, up to 40 ft. to an unoccupied space it can see. Before or after teleporting, the dog can make one bite attack.

**Projection moteur de base** : Bite, +3, 1d6+1 piercing, allonge 5 pieds ; marche 40 pieds.

**Rôle dans ce module** : Meute joueuse du Bois-Ricanant.

- La téléportation source est de 40 pieds et se recharge sur 4–6 ; le moteur ne la résout pas comme une marche ordinaire. Ils n'achèvent pas un joueur à terre.

### Ombres-cotillons et lutins duellistes

Source : [Sprite](https://www.dnd5eapi.co/api/2014/monsters/sprite) — SRD 2014 · type moteur `sprite`.

- **Taille / type / alignement (source)** : Tiny / fey / neutral good.
- **CA** 15 (armor) · **PV** 2 (1d4) · **FP** 1/4 · **XP** 50.
- **Vitesses** : marche 10 ft ; vol 40 ft.
- **Caractéristiques** : FOR 3 · DEX 18 · CON 10 · INT 14 · SAG 13 · CHA 11.
- **Maîtrises / sauvegardes (source)** : Skill: Perception +3 ; Skill: Stealth +8.
- **Vulnérabilités** : aucune.
- **Résistances** : aucune.
- **Immunités aux dégâts** : aucune.
- **Immunités aux états (identifiants source)** : aucune.
- **Sens** : passive_perception 13.
- **Langues (source)** : Common, Elvish, Sylvan.

**Traits et actions SRD** — descriptions originales conservées pour éviter les ajouts ou traductions erronés :

**Actions**

- **Longsword** : Melee Weapon Attack: +2 to hit, reach 5 ft., one target. Hit: 1 slashing damage.
- **Shortbow** : Ranged Weapon Attack: +6 to hit, range 40/160 ft., one target. Hit: 1 piercing damage, and the target must succeed on a DC 10 Constitution saving throw or become poisoned for 1 minute. If its saving throw result is 5 or lower, the poisoned target falls unconscious for the same duration, or until it takes damage or another creature takes an action to shake it awake.
- **Heart Sight** : The sprite touches a creature and magically knows the creature's current emotional state. If the target fails a DC 10 Charisma saving throw, the sprite also knows the creature's alignment. Celestials, fiends, and undead automatically fail the saving throw.
- **Invisibility** : The sprite magically turns invisible until it attacks or casts a spell, or until its concentration ends (as if concentrating on a spell). Any equipment the sprite wears or carries is invisible with it.

**Projection moteur de base** : Longsword, +2, 1 slashing, allonge 5 pieds ; marche 10 pieds.

**Rôle dans ce module** : Danseurs et duellistes miniatures.

- L'épée longue de cette créature minuscule touche à +2 et inflige exactement 1 dégât tranchant. L'arc touche à +6, inflige 1 dégât perforant et possède ses propres conditions d'empoisonnement ; ne pas mélanger ces deux attaques. Marche 10 pieds et vol 40 pieds sont distincts.

### Feu follet majordome

Source : [Will-o'-Wisp](https://www.dnd5eapi.co/api/2014/monsters/will-o-wisp) — SRD 2014 · type moteur `will_o_wisp`.

- **Taille / type / alignement (source)** : Tiny / undead / chaotic evil.
- **CA** 19 (dex) · **PV** 22 (9d4) · **FP** 2 · **XP** 450.
- **Vitesses** : marche 0 ft ; vol 50 ft ; stationnaire true.
- **Caractéristiques** : FOR 1 · DEX 28 · CON 10 · INT 13 · SAG 14 · CHA 11.
- **Maîtrises / sauvegardes (source)** : aucune indiquée.
- **Vulnérabilités** : aucune.
- **Résistances** : acid, cold, fire, necrotic, thunder, bludgeoning, piercing, and slashing from nonmagical weapons.
- **Immunités aux dégâts** : lightning, poison.
- **Immunités aux états (identifiants source)** : exhaustion, grappled, paralyzed, poisoned, prone, restrained, unconscious.
- **Sens** : darkvision 120 ft. ; passive_perception 12.
- **Langues (source)** : the languages it knew in life.

**Traits et actions SRD** — descriptions originales conservées pour éviter les ajouts ou traductions erronés :

**Traits**

- **Consume Life** : As a bonus action, the will-o'-wisp can target one creature it can see within 5 ft. of it that has 0 hit points and is still alive. The target must succeed on a DC 10 Constitution saving throw against this magic or die. If the target dies, the will-o'-wisp regains 10 (3d6) hit points.
- **Ephemeral** : The will-o'-wisp can't wear or carry anything.
- **Incorporeal Movement** : The will-o'-wisp can move through other creatures and objects as if they were difficult terrain. It takes 5 (1d10) force damage if it ends its turn inside an object.
- **Variable Illumination** : The will-o'-wisp sheds bright light in a 5- to 20-foot radius and dim light for an additional number of ft. equal to the chosen radius. The will-o'-wisp can alter the radius as a bonus action.

**Actions**

- **Shock** : Melee Spell Attack: +4 to hit, reach 5 ft., one creature. Hit: 9 (2d8) lightning damage.
- **Invisibility** : The will-o'-wisp and its light magically become invisible until it attacks or uses its Consume Life, or until its concentration ends (as if concentrating on a spell).

**Projection moteur de base** : Shock, +4, 2d8 lightning, allonge 5 pieds ; marche 0 pieds.

**Rôle dans ce module** : Serviteur de la cour du Prince.

- 22 PV, marche 0 et vol 50 pieds stationnaire. Décharge, invisibilité et absorption de vie restent les capacités exactes de la source ; son ton cérémonieux n'ajoute aucun pouvoir.

### Barnabé — arbuste éveillé

Source : [Awakened Shrub](https://www.dnd5eapi.co/api/2014/monsters/awakened-shrub) — SRD 2014 · type moteur `awakened_shrub`.

- **Taille / type / alignement (source)** : Small / plant / unaligned.
- **CA** 9 (dex) · **PV** 10 (3d6) · **FP** 0 · **XP** 10.
- **Vitesses** : marche 20 ft.
- **Caractéristiques** : FOR 3 · DEX 8 · CON 11 · INT 10 · SAG 10 · CHA 6.
- **Maîtrises / sauvegardes (source)** : aucune indiquée.
- **Vulnérabilités** : fire.
- **Résistances** : piercing.
- **Immunités aux dégâts** : aucune.
- **Immunités aux états (identifiants source)** : aucune.
- **Sens** : passive_perception 10.
- **Langues (source)** : one language known by its creator.

**Traits et actions SRD** — descriptions originales conservées pour éviter les ajouts ou traductions erronés :

**Traits**

- **False Appearance** : While the shrub remains motionless, it is indistinguishable from a normal shrub.

**Actions**

- **Rake** : Melee Weapon Attack: +1 to hit, reach 5 ft., one target. Hit: 1 (1d4 - 1) slashing damage.

**Projection moteur de base** : Rake, +1, 1d4-1 slashing, allonge 5 pieds ; marche 20 pieds.

**Rôle dans ce module** : Compagnon potentiel de la salle 3 et de la transition.

- Normalement neutre ; ne suit le joueur qu'après amitié établie selon les règles du module. Sa griffure peut infliger 0 dégât après le modificateur de −1.

### Profil des PNJ : Madame Bougie

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


### Profil des PNJ : Ernestine

Source : [Ape](https://www.dnd5eapi.co/api/2014/monsters/ape) — SRD 2014 · type moteur `ape`.

- **Taille / type / alignement (source)** : Medium / beast / unaligned.
- **CA** 12 (dex) · **PV** 19 (3d8+6) · **FP** 1/2 · **XP** 100.
- **Vitesses** : marche 30 ft ; escalade 30 ft.
- **Caractéristiques** : FOR 16 · DEX 14 · CON 14 · INT 6 · SAG 12 · CHA 7.
- **Maîtrises / sauvegardes (source)** : Skill: Athletics +5 ; Skill: Perception +3.
- **Vulnérabilités** : aucune.
- **Résistances** : aucune.
- **Immunités aux dégâts** : aucune.
- **Immunités aux états (identifiants source)** : aucune.
- **Sens** : passive_perception 13.
- **Langues (source)** : aucune.

**Traits et actions SRD** — descriptions originales conservées pour éviter les ajouts ou traductions erronés :

**Actions**

- **Multiattack** : The ape makes two fist attacks.
- **Fist** : Melee Weapon Attack: +5 to hit, reach 5 ft., one target. Hit: 6 (1d6 + 3) bludgeoning damage.
- **Rock** : Ranged Weapon Attack: +5 to hit, range 25/50 ft., one target. Hit: 6 (1d6 + 3) bludgeoning damage.

**Projection moteur de base** : Fist, +5, 1d6+3 bludgeoning, allonge 5 pieds ; marche 30 pieds.


### Profil des PNJ : Mirabelle

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


### Profil des PNJ : Les Têtes Jacassantes

Source : [Gargoyle](https://www.dnd5eapi.co/api/2014/monsters/gargoyle) — SRD 2014 · type moteur `gargoyle`.

- **Taille / type / alignement (source)** : Medium / elemental / chaotic evil.
- **CA** 15 (natural) · **PV** 52 (7d8+21) · **FP** 2 · **XP** 450.
- **Vitesses** : marche 30 ft ; vol 60 ft.
- **Caractéristiques** : FOR 15 · DEX 11 · CON 16 · INT 6 · SAG 11 · CHA 7.
- **Maîtrises / sauvegardes (source)** : aucune indiquée.
- **Vulnérabilités** : aucune.
- **Résistances** : bludgeoning, piercing, and slashing from nonmagical weapons that aren't adamantine.
- **Immunités aux dégâts** : poison.
- **Immunités aux états (identifiants source)** : exhaustion, petrified, poisoned.
- **Sens** : darkvision 60 ft. ; passive_perception 10.
- **Langues (source)** : Terran.

**Traits et actions SRD** — descriptions originales conservées pour éviter les ajouts ou traductions erronés :

**Traits**

- **False Appearance** : While the gargoyle remains motion less, it is indistinguishable from an inanimate statue.

**Actions**

- **Multiattack** : The gargoyle makes two attacks: one with its bite and one with its claws.
- **Bite** : Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 5 (1d6 + 2) piercing damage.
- **Claws** : Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 5 (1d6 + 2) slashing damage.

**Projection moteur de base** : Bite, +4, 1d6+2 piercing, allonge 5 pieds ; marche 30 pieds.


### Profil des PNJ : L'Ombre Soliste

Source : [Shadow](https://www.dnd5eapi.co/api/2014/monsters/shadow) — SRD 2014 · type moteur `shadow`.

- **Taille / type / alignement (source)** : Medium / undead / chaotic evil.
- **CA** 12 (dex) · **PV** 16 (3d8+3) · **FP** 1/2 · **XP** 100.
- **Vitesses** : marche 40 ft.
- **Caractéristiques** : FOR 6 · DEX 14 · CON 13 · INT 6 · SAG 10 · CHA 8.
- **Maîtrises / sauvegardes (source)** : Skill: Stealth +4.
- **Vulnérabilités** : radiant.
- **Résistances** : acid, cold, fire, lightning, thunder, bludgeoning, piercing, and slashing from nonmagical weapons.
- **Immunités aux dégâts** : necrotic, poison.
- **Immunités aux états (identifiants source)** : exhaustion, frightened, grappled, paralyzed, petrified, poisoned, prone, restrained.
- **Sens** : darkvision 60 ft. ; passive_perception 10.
- **Langues (source)** : aucune.

**Traits et actions SRD** — descriptions originales conservées pour éviter les ajouts ou traductions erronés :

**Traits**

- **Amorphous** : The shadow can move through a space as narrow as 1 inch wide without squeezing.
- **Shadow Stealth** : While in dim light or darkness, the shadow can take the Hide action as a bonus action. Its stealth bonus is also improved to +6.
- **Sunlight Weakness** : While in sunlight, the shadow has disadvantage on attack rolls, ability checks, and saving throws.

**Actions**

- **Strength Drain** : Melee Weapon Attack: +4 to hit, reach 5 ft., one creature. Hit: 9 (2d6 + 2) necrotic damage, and the target's Strength score is reduced by 1d4. The target dies if this reduces its Strength to 0. Otherwise, the reduction lasts until the target finishes a short or long rest. If a non-evil humanoid dies from this attack, a new shadow rises from the corpse 1d4 hours later.

**Projection moteur de base** : Strength Drain, +4, 2d6+2 necrotic, allonge 5 pieds ; marche 40 pieds.


### Profil des PNJ : Le Prince des Farces

Source : [Archmage](https://www.dnd5eapi.co/api/2014/monsters/archmage) — SRD 2014 · type moteur `archmage`.

- **Taille / type / alignement (source)** : Medium / humanoid (any race) / any alignment.
- **CA** 12 (dex) ; 15 (spell) · **PV** 99 (18d8+18) · **FP** 12 · **XP** 8400.
- **Vitesses** : marche 30 ft.
- **Caractéristiques** : FOR 10 · DEX 14 · CON 12 · INT 20 · SAG 15 · CHA 16.
- **Maîtrises / sauvegardes (source)** : Saving Throw: INT +9 ; Saving Throw: WIS +6 ; Skill: Arcana +13 ; Skill: History +13.
- **Vulnérabilités** : aucune.
- **Résistances** : damage from spells, bludgeoning, piercing, and slashing from nonmagical attacks (from stoneskin).
- **Immunités aux dégâts** : aucune.
- **Immunités aux états (identifiants source)** : aucune.
- **Sens** : passive_perception 12.
- **Langues (source)** : any six languages.

**Traits et actions SRD** — descriptions originales conservées pour éviter les ajouts ou traductions erronés :

**Traits**

- **Magic Resistance** : The archmage has advantage on saving throws against spells and other magical effects.
- **Spellcasting** : The archmage is an 18th-level spellcaster. Its spellcasting ability is Intelligence (spell save DC 17, +9 to hit with spell attacks). The archmage can cast disguise self and invisibility at will and has the following wizard spells prepared:  - Cantrips (at will): fire bolt, light, mage hand, prestidigitation, shocking grasp - 1st level (4 slots): detect magic, identify, mage armor*, magic missile - 2nd level (3 slots): detect thoughts, mirror image, misty step - 3rd level (3 slots): counterspell, fly, lightning bolt - 4th level (3 slots): banishment, fire shield, stoneskin* - 5th level (3 slots): cone of cold, scrying, wall of force - 6th level (1 slot): globe of invulnerability - 7th level (1 slot): teleport - 8th level (1 slot): mind blank* - 9th level (1 slot): time stop * The archmage casts these spells on itself before combat.

**Actions**

- **Dagger** : Melee or Ranged Weapon Attack: +6 to hit, reach 5 ft. or range 20/60 ft., one target. Hit: 4 (1d4 + 2) piercing damage.

**Projection moteur de base** : Dagger, +6, 1d4+2 piercing, allonge 5 pieds ; marche 30 pieds.



## PNJ — notes d’incarnation

- Tous les PNJ disposent désormais du profil mécanique explicitement affecté dans map.ts. Le Prince utilise Archmage, Madame Bougie Mage, les artistes sans magie Commoner. Les trois Têtes Jacassantes forment un groupe maison de trois Gargoyles ; leurs PV et leur effectif sont suivis dans l’état.
