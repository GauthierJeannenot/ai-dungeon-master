# Modes de déplacement — tranche ramper et se relever

Source : PHB2014 local, « Climbing, Swimming, and Crawling » ligne 5287,
« Being Prone » lignes 5719–5721, « Dash » ligne 5817 de
`rules/books/phb-2014.md`. Ce travail poursuit `PHB-MOVEMENT-MODES` du registre
canonique ; aucune nouvelle analyse globale n’a été réalisée.

`lib/movement-modes.ts` sépare vitesse modifiée et budget de déplacement.
La réduction de Ray of Frost, la pénalité d’armure réellement portée et
l’épuisement s’appliquent à la vitesse. Dash ajoute autant de déplacement que
cette vitesse ; il ne change donc pas le prix pour se relever.

Une vraie condition `prone` impose le coût de ramper sur chaque arête. Le
calcul reçoit la distance de cette arête déjà évaluée par la règle des
diagonales 5/10 pieds. Il ajoute un supplément égal à cette distance pour
ramper et un autre pour le terrain difficile. Ainsi, une arête de 5 pieds
coûte 15 pieds en rampant sur terrain difficile ; une diagonale actuellement
à 10 pieds coûte 30 pieds. Les obstacles difficiles multiples ne doublent pas
à nouveau ce supplément.

Le corps déplacé de force pendant une prise ne rampe pas volontairement :
`ignoreActorEffects` ignore son coût de posture, en conservant celui du
terrain. Le détenteur réellement à terre continue à ramper.

Se relever vérifie la posture, une vitesse positive et assez de mouvement
restant avant toute mutation. Le moteur utilise des cases de coût de 5 pieds :
le coût égal à la moitié de la vitesse est arrondi à la case supérieure et
le budget disponible à la case inférieure. À vitesse 15 pieds, le coût de
7,5 pieds prend donc deux cases. Le débit et la suppression de `prone`
restent à la charge de `combat_action(stand_up)`, sans action additionnelle.

## Raccords réalisés

Ces raccords font partie de la vague W3 validée.

- `../lib/movement-modes.ts` figure dans le `include` du compilateur MCP.
- `navigationGrid.stepCost` utilise
  `actorMovementStepCost(state,actorId,baseDistanceCells,difficult,options).totalCells`.
- Dans `combat-actions`, `preflightStandingMovement(actorId)` suit les
  validations de tour existantes ; le moteur débite ensuite `costCells` et
  enlève `prone` une seule fois. Ce précontrôle ne mute rien.
- `movementSpeedProfile` est disponible pour partager ultérieurement le
  calcul de vitesse ; aucun appelant n’est forcé à adopter un nouvel état.

## Validation et limites

Les neuf tests du domaine ont réussi dans la collecte ciblée W3 de 110 tests :
coûts additifs et diagonales, corps forcé, armure/épuisement/Dash, expirations
et immobilité, puis cinq scénarios via les vrais outils MCP.

Validation : [W3 sur instantané gelé](rules-audit/validation-wave3-2026-10-31.json) — suite **1 065/1 065**, playtest mock **30/30**, **125 outils**. Le [suivi canonique](suivi-integration-mcp.md#phb-movement-modes) décrit l'état courant et les limites ; les ajouts W4 sont hors de cette preuve.

Cette tranche n’ajoute pas de mode nage/escalade public : les cartes ne
décrivent pas encore leurs surfaces et altitudes de manière autoritaire.
Les vitesses natives déjà structurées des monstres ne prouvent pas à elles
seules qu’une case est de l’eau ou une paroi grimpable. Vol vertical,
squeezing, empreintes multicases, alternance de plusieurs vitesses et checks
de paroi glissante/eau agitée restent à traiter dans ce lot ou ses dépendances
du registre. Aucun relief, sens, poids, sort ou équipement n’est inventé.

Raccord central du 31 octobre : navigationGrid emploie actorMovementStepCost pour chaque arête et combat_action(stand_up) utilise le précontrôle avant son unique débit/retrait. Le corps transporté conserve ignoreActorEffects ; la posture du détenteur demeure effective. La validation W3 couvre ces raccords ; le registre canonique suit leurs évolutions.
