# Consommables offensifs PHB 2014

Ce lot implémente `use_weapon_consumable` et `extinguish_alchemists_fire` pour des instances réellement possédées par le personnage. Il ne termine pas toute la fiche `PHB-CONSUMABLE-WEAPONS` du registre canonique. Le moteur ne crée aucun stock, kit, compétence, cible ou mode depuis le texte du joueur.

| Objet / equipmentId | Action et portée | Attaque et effet |
| --- | --- | --- |
| Acide / `acid_vial` | Action complète ; `splash` à 5 pieds ou `throw` à 20 pieds | Attaque à distance DEX d'arme improvisée ; 2d6 acide si touché |
| Eau bénite / `holy_water_flask` | Action complète ; mêmes modes et portées | Même attaque ; 2d6 radiant seulement pour un fiélon ou mort-vivant dont le type vient de la fiche mécanique |
| Feu grégeois / `alchemists_fire_flask` | Action complète ; `throw` seulement à 20 pieds | Même attaque ; aucun dégât immédiat, puis 1d4 feu au début de chaque tour de la cible jusqu'à extinction |

La fiole/flasque est consommée même sur un échec. La maîtrise d'une arme improvisée n'est pas accordée automatiquement ; aucune maîtrise particulière n'est actuellement cataloguée pour ces objets. Les dégâts immédiats suivent les dés explicitement indiqués par l'objet, sans bonus de caractéristique ajouté. Un critique double leurs dés. Le critique initial du feu grégeois ne double pas les futurs 1d4. Une nouvelle application du même feu ne multiplie pas ses dégâts persistants.

La source locale est `rules/books/phb-2014.md`, chapitre 5, paragraphes **Acid** (ligne 4245), **Alchemist's Fire** (4247), **Holy Water** (4287), et chapitre 9, attaques à distance/armes improvisées/critiques. La règle de non-cumul des effets de même nom est `rules/books/dmg-2014.md`, **Combining Game Effects** (8165). Le rituel de fabrication d'eau bénite (PHB 4289) n'est pas implémenté ici.

L'attaque respecte le terrain bloquant, la couverture directionnelle, les avantages/désavantages mécaniques, notamment l'ennemi conscient à 5 pieds, Bless, l'épuisement, l'Inspiration du MJ et l'Inspiration bardique. Cette dernière suspend le jet avant tout débit ; sa reprise réutilise le d20. Un personnage qui lance une flasque vers une créature ne peut pas déclencher le Shield réservé au personnage cible d'une attaque adverse. Les attaques de consommables appartenant aux PNJ attendent un véritable contrat d'inventaire PNJ ; aucune propriété de flasque n'est inventée.

L'extinction est une action **de la créature qui brûle**, avec un **test** de Dextérité DD 10 ; ce n'est pas une sauvegarde. La continuation commune prend en charge l'Inspiration bardique et les Mots cinglants éligibles sur ce test. Un échec dépense aussi l'action. Les dégâts de début de tour utilisent le pipeline central de dégâts typés, incluant résistances, immunités et PV temporaires. Aucun outil de « tick » gratuit n'est exposé au modèle.

Les `useId` et `eventId` sont des identifiants stables d'opération. Un résultat terminé est persisté ; le rejouer restitue le résultat sans relancer ni payer. Réutiliser un identifiant avec une autre opération est refusé. Une réaction tenue contient la commande structurée choisie initialement par l'agent.

## Raccord moteur réalisé

Ces contrats sont raccordés dans la vague W3 validée.

- `WeaponConsumableStateSchema` est intégré sous `weaponConsumables` optionnel dans `lib/dm-tool-state.ts` et préservé au remplacement d’état.
- Les trois IDs et libellés sont ajoutés au catalogue de fournitures de scène. L'auteur MJ peut alors placer de vraies instances ; les outils d'utilisation ne les acquièrent pas.
- `registerWeaponConsumableTools(server)` enregistre les outils dans l’index MCP ; les deux sont exposés à l’agent IA.
- `startWeaponConsumableTurn(actorId)` est appelé à chaque véritable début de tour, après attribution de la nouvelle clé `combatGeneration`/`turnCounter`. Le helper mémorise la clé et ne double pas le même tick. Les morts ne reçoivent plus de tick.
- `assertWeaponConsumableTimeAdvance(seconds)` prévalide repos, sauts temporels et sortie du combat avec du feu actif. Le passage ordinaire des six secondes d'un round est géré par les tours et ne doit pas être refusé par ce garde.
- Le helper commun du lot armure applique le désavantage des attaques DEX en armure non maîtrisée.

## Périmètre restant

Les trois attaques demandent actuellement un combat actif et une cible créature. La source permet aussi certains usages sur des objets, mais le moteur doit d'abord partager la résolution autoritaire des dégâts/déstruction/libération des contenus et, pour le feu grégeois, établir une horloge d'objet sans inventer de tours. Ces cas sont refusés **avant les dés et les coûts**. L'huile de combat, le poison de base et le filet restent à intégrer dans la fiche canonique. L'huile d'éclairage appartient à un autre lot et conserve un unique stock `oil_flask`.

## Vérification

`tests/weapon-consumables.test.cjs` couvre des régressions MCP réelles pour les coûts, Extra Attack, portée/couverture/refus, dégâts/source de type, critique, reprise bardique, persistance/idempotence et feu/extinction. Les douze tests du domaine ont réussi dans la collecte ciblée W3 de 110 tests.

Les raccords centraux de la vague 3 sont écrits : catalogue des trois objets,
caractéristique DEX au jet commun, début de tour après attribution de la vraie
clé de combat, garde de sortie du combat et garde des sauts temporels.
Le garde est une lecture pure ; un refus ne nettoie pas des entrées de feu
dans l’état. La copie de parchemin le vérifie avant son jet et son paiement.
Validation : [W3 sur instantané gelé](rules-audit/validation-wave3-2026-10-31.json) — suite **1 065/1 065**, playtest mock **30/30**, **125 outils**. Le [suivi canonique](suivi-integration-mcp.md#phb-consumable-weapons) décrit l'état courant et les limites ; les ajouts W4 sont hors de cette preuve.
