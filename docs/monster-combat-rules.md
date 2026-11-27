# Combat des monstres — SRD 2014

Le catalogue est le snapshot de l'API SRD 2014, sans appel réseau pendant une
partie. L'IA choisit les outils et leurs arguments ; le moteur résout les jets,
coûts et conséquences. Une description de capacité dans le bestiaire n'est pas
un résultat de jeu. `get_monster_stat_block` renvoie `engineSupport`, avec les
actions/traits implémentés et ceux qui restent des références source.

## Dégâts et sauvegardes

Toutes les attaques, sorts offensifs et pertes de PV via `update_hp` passent
par `dealDamage`. Les armes et sorts portent un type de dégâts. Les propriétés
magique/argentée d'une arme du joueur viennent de l'objet effectivement porté.
Les défenses de la cible sont lues dans le bloc source : immunité = zéro,
résistance = moitié arrondie à l'inférieur, vulnérabilité = double. Une même
résistance ne s'applique qu'une fois ; les exceptions non-magique/argentée sont
respectées. Les états pétrifié, paralysé, inconscient et entravé ont aussi leurs
conséquences sur dégâts, attaques et sauvegardes déjà prises en charge.

`update_hp` refuse un dégât sans type ET origine sur une cible avec défenses
ou Endurance de mort-vivant. Cet outil reste destiné aux effets explicitement
arbitrés ; les attaques et sorts ont leurs outils dédiés. Il ne faut pas
additionner un delta de PV après une attaque déjà résolue.

Les sauvegardes dérivent des caractéristiques et maîtrises de la cible. La
Résistance à la magie donne l'avantage contre les effets magiques ; Brave et
Dark Devotion s'appliquent aux sauvegardes de peur/charme correspondantes.
Les immunités d'états empêchent leur application, y compris via `apply_condition`.
La qualification « magique » suit le texte source et les critères du
[Sage Advice Compendium 2014](https://www.dndbeyond.com/sources/dnd/sac/sage-advice-compendium) :
Absorption de vie et Charme féerique sont explicitement magiques ; Visage
terrifant n'est pas qualifié ainsi, et ne déclenche pas Résistance à la magie.

## Multiattaques

`resolve_monster_action` reçoit `monsterId`, `targetId`, `actionName` et, pour
les séquences fixes, `attackActions`. Chaque frappe a son propre jet d'attaque,
critique, dégâts, défenses et effets de frappe. Le tout consomme une action.
La cible reste explicitement choisie pour toute la séquence ; il n'y a pas de
reciblage automatique.

- Champignon violet : le moteur tire 1d4 attaques de Rotting Touch.
- Wight : deux épées longues, deux arcs longs, ou Life Drain + une épée longue.
- Fanatique, brute et chevalier : deux attaques de mêlée de leur bloc.
- Vétéran : deux épées longues, avec éventuellement UNE épée courte ; pas
  d'épée longue à deux mains dans cette dernière combinaison. La description
  du [SRD/Basic Rules 2014](https://www.dndbeyond.com/monsters/17045-veteran)
  prévaut sur le compteur erroné de l'API pour l'épée courte.
- Grick : tentacules puis bec seulement si les tentacules touchent.

`run_monster_turns`, demandé par l'agent, emploie ces mêmes résolveurs dans sa
politique déterministe. Cette politique s'arrête quand le joueur tombe à 0 PV.
Un appel explicite peut choisir une autre séquence autorisée. Un pouvoir ou une
attaque déjà consommé avant `run_monster_turns` n'est jamais rejoué.

## Traits et pouvoirs implémentés

- Tactique de meute : avantage si un allié valide est adjacent à la victime.
- Avantage martial : +2d6 une fois par tour, doublés sur un critique.
- Endurance de mort-vivant : CON DD 5 + dégâts reçus pour rester à 1 PV ; pas
  de sauvegarde contre des dégâts radiants ou un coup critique.
- Morsure du loup : FOR DD11 ou à terre.
- Morsure de grenouille : agrippé + entravé, DD11 pour s'échapper, une victime.
  `escape_monster_grapple` coûte une action et demande FOR/Athlétisme ou
  DEX/Acrobaties explicitement. La mort de la source libère la victime.
- Flèche de sprite : CON DD10, poison pendant une minute ; résultat ≤5 :
  sommeil. Les dégâts ou `wake_sleeping_creature` (action au contact) réveillent
  sans guérir le poison. Le sommeil à PV positifs survit à la réhydratation.
- Life Drain : CON DD13, réduction du maximum de PV égale aux dégâts réellement
  reçus en cas d'échec, mort si ce maximum atteint zéro. Un repos long achevé
  restaure les réductions suivies ; la création ultérieure d'un zombie n'est
  pas encore automatisée.

`use_monster_power` résout les pouvoirs suivants ; un PNJ réactif utilise
`npc_action` avec `kind: "power"` dans son activation :

- Invisibility : action, concentration, fin lors d'une attaque, d'Absorption de
  vie, d'une incapacité ou d'un échec au jet de concentration après dégâts.
- Teleport : action, destination explicite visible/libre à 40 pieds maximum,
  morsure optionnelle avant/après avec cible explicite, recharge 4–6 au début
  du tour, une seule tentative de recharge par tour.
- Consume Life : action bonus, cible encore vivante à 0 PV au contact,
  CON DD10 ; échec = mort et soin de 3d6 à la source, fin d'invisibilité.
- Fey Charm : WIS DD14, visibilité réciproque à 30 pieds, humanoïde ou bête,
  durée 24 h, limites de victimes, protection contre les attaques du charmé,
  nouveau jet si attaqué/blessé par la source ou un allié, fin volontaire en
  action bonus. Une sauvegarde réussie donne une immunité de 24 h ; une fin
  volontaire ne donne pas cette immunité.
- Horrifying Visage : toutes les créatures non mortes-vivantes qui voient la
  source à 60 pieds, WIS DD13, peur une minute, nouveau jet en fin de tour et
  immunité de 24 h. Échec de 5 ou plus : vieillissement 1d4×10 ans mémorisé
  séparément. La fin de la peur ne supprime pas ce vieillissement.

## Persistance et temps

`monsterEffects`, `monsterPowerImmunities`, `monsterRuntime`, `worldTimeSeconds`
et `turnCounter` survivent au round-trip MCP et à la session. Les effets sont
présentés au modèle dans le contexte dynamique. En combat, chaque nouveau round
fait avancer le temps de six secondes. Hors combat, `advance_game_time` permet
à l'agent d'enregistrer un temps fictionnel écoulé et d'expirer les effets.
`completedLongRestForIds`, après au moins huit heures, restaure uniquement les
maxima de PV réduits par Life Drain ; ce n'est pas un outil de soin ou de
recharge des ressources du personnage.

## Limites explicites

Les plans, possession, engloutissement, déplacement incorporel, vol/nage,
sorts propres aux monstres, Leadership, réactions et capacités sensorielles
spécialisées n'ont pas encore tous un résolveur dédié. Ces capacités restent
marquées `sourceReferenceOnly`. Le moteur refuse leur utilisation comme une
attaque ordinaire plutôt que de leur attribuer les chiffres d'une autre attaque.
La restauration du vieillissement surnaturel n'est pas encore implémentée.

Validation : `tests/monster-powers.test.cjs` couvre les séquences, défenses,
exceptions, effets, coûts, recharges, refus sans mutation et persistance MCP.
