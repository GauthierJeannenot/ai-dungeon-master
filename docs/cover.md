# Couverture directionnelle — règles 2014

État de livraison, validations exécutées et travail restant : [registre canonique des intégrations MCP](suivi-integration-mcp.md). Ce guide décrit le périmètre technique ; les anciennes matrices d’audit ne sont pas le suivi courant.

Le moteur applique la couverture déclarée par le MJ pour une origine et une
cible précises. Source : PHB fourni, lignes 5974–5984 ; SRD 5.1 officiel 2014,
[page PDF 96](https://media.wizards.com/2023/downloads/dnd/SRD_CC_v5.1.pdf),
CC-BY-4.0. La demi-couverture donne **+2 CA et sauvegardes DEX** ; les trois
quarts donnent **+5**. Seul le degré le plus protecteur s'applique. Aucune
somme de couvertures, aucun bonus STR/CON, aucun malus numérique de l'édition 2024.

## Déclarer et consulter

`configure_cover` est une décision explicite du MJ sur la scène déjà établie,
avec les arguments `coverId`, `operation: "set"`, exactement `originId` **ou**
`originCell`, `targetId`, `obstacleCell`, `degree` (`half`, `three_quarters`,
`total`) et `reason`. L'origine acteur doit exister ; l'origine point correspond
à la cellule réelle d'un effet. La cible est une créature moteur existante.
Le moteur exige une cellule d'obstacle qui coupe l'intérieur du segment entre
origine et cible ; un simple contact de coin ne suffit pas. Cette vérification
prouve la direction, pas la hauteur ou l'existence de l'obstacle : le MJ déclare
ces faits et le degré. Aucune occupation de case ne devient automatiquement
une murette ou une couverture.

Un parapet explicitement établi peut se trouver dans la cellule de la cible :
le segment doit traverser l'intérieur proche de cette cellule avant d'atteindre
le corps. Cela permet une couverture à cinq pieds sans inventer une position
exacte du corps ou un pourcentage de pixels. La géométrie valide l'alignement ;
le degré reste déclaré par le MJ. Un obstacle derrière la cible ou du côté de
l'origine ne produit aucun bonus.

L'état `dmTools.cover.records` conserve carte, salles, cellules, origine, cible
et justification. Une déclaration d'origine acteur exige cet ID et sa position
exacte. Une déclaration d'origine point exige ce point exact ; elle ne s'applique
pas au lanceur ou à une autre cellule. Les coordonnées de la cible sont figées.
Le bonus ne s'applique que tant que ces ancrages correspondent ; revenir aux
ancrages peut le rendre applicable à nouveau. Un obstacle détruit ou déplacé
exige une suppression ou une nouvelle déclaration explicite du MJ.

`inspect_cover` lit sans mutation la couverture depuis exactement `originId`
ou `originCell` vers `targetId`, les bonus et déclarations actives/inactives.
Cette référence confidentielle ne révèle aucun secret au joueur.
`configure_cover({coverId, operation:"remove"})` retire seulement ce lien ;
la répétition d'une suppression ne crée rien. Les déclarations sont bornées à
128, sans éviction implicite. Une réaction tenue interdit de changer la scène.

## Résolution et limites

Les attaques d'armes et de sorts utilisent la CA augmentée pour cette origine.
Une couverture totale refuse le ciblage direct avant action, emplacement,
charges, réaction ou dé. Un 20 naturel ne permet pas de cibler à travers une
couverture totale. Une préparation de scène ne crée ni mouvement, cachette,
action du joueur ni obstacle physique de collision.

Les sauvegardes n'obtiennent le bonus que pour DEX et depuis l'origine réelle.
Un jet DEX générique sans origine reste compatible avec les anciennes sessions
sans couverture. Lorsqu'une déclaration active concerne la cible,
`COVER_ORIGIN_REQUIRED` demande la source exacte plutôt que d'inventer un côté.
Les échecs automatiques ne deviennent pas des réussites grâce à un bonus.

Pour une sauvegarde DEX effectivement lancée, une origine explicitement fournie
doit aussi être valide : l'ID d'acteur doit exister et la cellule de la source
doit être une vraie cellule de la carte active. Un acteur inconnu renvoie
`ENTITY_NOT_FOUND` et un point hors carte `INVALID_GRID_CELL`, avant le dé ou
une mutation. Ces refus s'appliquent même sans déclaration de couverture ;
une fausse origine ne peut pas transformer une couverture existante en bonus
nul. Une origine point valide reste distincte d'une origine acteur, même à
coordonnées identiques. L'absence d'origine reste compatible avec une ancienne
session sans déclaration pertinente ; aucun acteur ou centre d'effet n'est choisi
automatiquement.

Les sphères partent de leur centre sélectionné ; cônes et lignes du lanceur.
L'Arme spirituelle frappe depuis sa cellule propre, pas celle de son lanceur.
Le contexte des sorts suspendus conserve cette origine et les jets déjà faits.
Sacred Flame refuse les bonus numériques de couverture sur sa sauvegarde,
conformément à son exception explicite (SRD 5.1 p.176). Cette exception n'accorde
pas une vision ou une trajectoire à travers n'importe quel mur ; le ciblage
direct sous couverture totale reste hors de cette exception numérique bornée.

Le moteur ne simule pas la propagation des zones autour des angles. Une zone
qui rencontrerait une couverture totale déclarée renvoie
`COVER_AREA_TOTAL_UNSUPPORTED` avant tout coût. Fireball indique que le feu
contourne les coins (SRD 5.1 p.144) ; cette propriété n'est ni transformée en
permission universelle d'ignorer la couverture, ni remplacée par une propagation
inventée. Les collisions existantes de la carte gardent leurs propres limites.
Les couvertures d'objets, sources mobiles autonomes, hauteurs et pourcentages
de silhouette ne sont pas automatisés. La variante optionnelle de tir à travers
la couverture n'est pas ajoutée.

## Raccords et vérification

`coverFor`, `assertDirectCoverTarget`, `coverArmorClass` et
`coverSavingThrowBonus` sont des lectures pures de l'état directionnel.
Les raccords sont intégrés au schéma persistant, aux outils MCP, à la route,
aux attaques d'armes/sorts et aux sauvegardes. Les prévalidations précèdent
coûts et dés, y compris les activations d'Arme spirituelle et les cibles d'une
multiattaque avant son premier jet. Une inspection reste une lecture ; la
configuration est une mutation sauvegardée qui ne résout pas l'attaque prévue.

`tests/cover.test.cjs` couvre la persistance, inspection sans mutation,
non-cumul, direction, déplacement, vraies attaques d'arme/sort, DEX contre
STR/CON, refus atomiques, Sacred Flame et origines de zone/Arme spirituelle.
Ces tests nécessitent le moteur compilé ; leur exécution est centralisée.
Le registre canonique conserve les résultats et les limites encore ouvertes,
notamment la géométrie 3D et la propagation des zones autour des angles.

`tests/cover-origin-validation.test.cjs` ajoute trois scénarios de régression :
origines explicites inconnues/hors carte, refus sans coût ni dé en présence
d'une couverture, et préservation des bonus d'origines acteur/point réelles.
Leur exécution runtime attend la validation centrale de cette correction.
