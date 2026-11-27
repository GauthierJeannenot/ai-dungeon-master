# Navigation explicite et battlemaps

## Audit

Le nom « Le Bureau », son ID `5` et son entrée `(6,8)` existaient déjà dans
`map.ts` et la carte dynamique du DM. Mais `move_token` n'acceptait pas de salle,
le prompt demandait des coordonnées dans une autre table narrative, et le
planner ne recevait que les portes de la salle actuelle. Le contrat obligeait
donc le modèle à traduire une salle en coordonnées et confrontait plusieurs
descriptions. Les mocks ne prouvent pas quelle cause dominait en LLM live.

Indépendamment, `validateMove` vérifiait la destination et la distance directe
de Chebyshev, pas un trajet. Les cloisons affichées n'étaient pas mécaniques ;
les monstres avançaient par une heuristique locale incapable de certains détours.

## Buts et règles

`move_token` et `preview_navigation` acceptent exactement un but :

```json
{"tokenId":"player","roomId":"5"}
{"tokenId":"player","toCell":{"x":6,"y":8}}
{"tokenId":"player","doorId":"floor-office","doorMode":"approach"}
{"tokenId":"player","doorId":"floor-office","doorMode":"cross"}
{"tokenId":"player","targetEntityId":"entity-id","relation":"adjacent"}
```

Une salle utilise son `entryCells[roomId]`. Une arrivée bloquée n'est pas
remplacée par une autre. Pour `adjacent`, le moteur choisit une case libre de
coût minimal satisfaisant cette relation explicite ; départage BFS dans l'ordre
N, O, E, S, NO, NE, SO, SE. Il ne choisit jamais l'entité à la place du modèle.
Un roomId d'une autre map est refusé : `travel_to_map` reste explicite.

Les pas droits coûtent **une case de 5 pieds** ; les diagonales alternent
**1 puis 2 cases**, avec un compteur par acteur conservé pendant tout son tour,
même entre plusieurs déplacements et des pas droits. Il repart à zéro au tour
suivant et survit aux sauvegardes. Le terrain difficile double le coût du pas.
La recherche pondérée conserve la parité des diagonales dans son état.
Le budget en combat vaut `floor(speed/5) - movementUsed` ;
la vitesse est en pieds, les coûts/budgets en cases. La distance géométrique de
Chebyshev est distincte du coût du parcours. Pas de vol ni
de circulation selon la taille pour l'instant. Les conditions empêchant le
déplacement sont refusées et la capacité de marche des PNJ doit être autorée.

Toute case occupée est infranchissable (alliés et PNJ cachés compris). Les
monstres morts ne bloquent plus, le joueur à terre occupe encore sa case. Un PNJ
devenu combattant ne compte qu'une fois. Une diagonale exige que les deux
routes orthogonales soient libres : aucun passage de coin à travers un mur,
une porte fermée ou une case occupée.

En exploration, un trajet libre est parcouru en une demande. Si seul un trajet
portes ouvertes existerait, le moteur s'arrête avant sa première porte fermée,
sans ouvrir, forcer ni déclencher de rencontre. `room.navigationEvent` peut
imposer une autre frontière de décision : `stopEvent` indique pourquoi ; un
nouvel appel avec `acknowledgeEventIds` autorise explicitement cette entrée,
sans exécuter l'événement. Une salle déjà visitée ne répète pas cette frontière.

En combat, un trajet trop long est refusé sans mutation, sauf `allowPartial:true`
explicitement choisi. Le budget s'applique au trajet jusqu'à son premier arrêt
de décision ; une porte proche peut être atteinte même si le but est plus loin.
Exécution et aperçu partagent le calcul ; l'exécution revalide l'état frais.

La battlemap surligne en bleu les destinations cliquables pendant le tour du
joueur en combat. `combatMovementCells` utilise le même graphe et le même ordre
BFS que le moteur : coût réel des détours, mouvement déjà dépensé, occupation,
murs et portes fermées, sans couper les coins en diagonale. Les conditions
immobilisantes, la peur et les frontières de décision non acquittées excluent
également les arrivées impossibles. L'aperçu se limite à la map courante et
disparaît pendant une requête. Un cliquer-glisser continue à déplacer la vue.
Le clic envoie au MJ une demande de déplacement à la case exacte, en conservant
l'action et le tour ; seul le modèle choisit l'appel MCP et le moteur revalide
l'état courant. Aucun déplacement n'est appliqué localement par anticipation.

En exploration, `explorationMovementRooms` surligne en vert les zones directement
reliées à la zone courante, sur la même map, pour les plans tactiques (défaut).
Avec `maps[].navigationMode: 'exploration'`, tous les autres lieux de la map
sont proposés, sans condition de contiguïté. Le moteur calcule le trajet vers
le lieu choisi en une demande, avec les mêmes arrêts aux portes et décisions.
Pour une map mixte, `explorationRoomIds` active l’exploration uniquement dans
les salles désignées : destinations extérieures distantes et accès locaux,
puis connexions tactiques dès l’entrée dans une autre salle. L’affichage et
le contexte du MJ suivent `getNavigationMode`, recalculé depuis l’état.
`explorationDestinationRooms` applique ensuite le brouillard et fournit les
mêmes destinations aux boutons de zones, aux repères illustrés liés par
`destinationRoomId` et à leur légende. Ce système est commun aux aventures.

Le brouillard de Grammy’s ne cache que les intérieurs (`fogHiddenRoomIds`).
La politique `fogReveal: 'open-door'` découvre une pièce depuis un seuil
ouvert à portée, après l’ouverture ou l’approche réelle. Les aperçus restent
sans mutation. Le moteur conserve les vues dans `sceneMemory.discoveredRoomIds`,
distinctes des visites ; fermer la porte ou reprendre la session ne les efface
pas. Aucun enchaînement visuel à travers plusieurs pièces. La scène extérieure
masque aussi ses pièces dessinées sans toit avec les polygones `fogRegions`.
Les emprises exactes (`areas`)
sont respectées ; un mur ou un simple contact par un coin ne crée pas de lien.
Une porte fermée conserve le lien topologique : le clic demande au MJ un
déplacement vers le `roomId` choisi, avec arrêt devant une porte fermée ou une
décision, sans autoriser leur résolution. Le moteur valide ensuite le trajet.
Les zones ne sont plus cliquables pendant une requête ou si le joueur ne peut
pas se déplacer. Les pions et le cliquer-glisser conservent leurs interactions.

Résultat : `path` (départ inclus), `costCells`, `plannedCostCells` (avant
limitation par budget, mais après frontière de décision), `finalPosition`,
`finalRoomId`, `remaining`, `goalReached`, `stopReason` (`goal_reached`,
`closed_door`, `event_decision`, `movement_budget`), `stopDoorId`/`stopEvent`.
Un arrêt valide peut avoir `success:true, goalReached:false`. Une erreur de
requête ne déplace personne. La narration doit respecter cette différence.

`lib/navigation.ts` produit circulation, connexions de salles et aides du
contexte. Une connexion **topologique** ignore état des portes et occupation ;
`pathExistsNow` tient compte des deux ; `withinMovementBudget` compare coût et
budget. Ces aides ne sont jamais un menu exhaustif des actions de jeu de rôle.
Connaître les salles ne révèle pas les entités. La même carte est transmise au
planner dans son message dynamique. Les systèmes sont stables ; les résultats
frais restent dans les `tool_result`, sans réécriture du message initial.

## Image fournie à l'assistant → JSON → ASCII

Décision révisée : fournir l'image à l'assistant dans la conversation, avec la
grille, l'aventure et la map. L'assistant l'examine et produit le JSON. Il n'y
a **aucune intégration d'API vision**, clé, extraction automatique à l'import ni
analyse pendant une partie. L'ASCII est dérivé du JSON, jamais une deuxième
description indépendante.

Le format distingue obstacles de cases, frontières `wall`/`passage`/`door`,
décors non bloquants, incertitudes et contradictions avec les métadonnées. Les
murs doivent provenir de l'image ; ne pas substituer une grille libre ou les
rectangles de salles. Une limite traversant une case ou un meuble ambigu reste
explicitement incertain jusqu'à correction.

Pour la boulangerie, la correction fournie par l'utilisateur est désormais la
référence active. Il n'y a pas de fichier `image-trace.json` à créer ni d'image
à analyser par le script. Depuis la racine du dépôt, afficher cette référence :

```powershell
node scripts/battlemap-geometry.cjs inspect --adventure grammys-country-apple-pie --map bakery --file adventures/grammys-country-apple-pie/bakery.geometry.corrected.json --out bakery-review.html
Start-Process -FilePath '.\bakery-review.html'
```

Dans cette page, corriger les frontières par deux clics sur des cases adjacentes,
les obstacles par clic, ou le JSON. Résoudre les incertitudes et contradictions,
puis télécharger la correction : son nom est `bakery.geometry.corrected.json`.
Enregistrer ce fichier à la racine du dépôt (ou donner son chemin complet aux
commandes suivantes). Seulement après cette correction :

```powershell
node scripts/battlemap-geometry.cjs check --adventure grammys-country-apple-pie --map bakery --file bakery.geometry.corrected.json
node scripts/battlemap-geometry.cjs approve --adventure grammys-country-apple-pie --map bakery --file bakery.geometry.corrected.json
node scripts/battlemap-geometry.cjs ascii --adventure grammys-country-apple-pie --map bakery --file bakery.geometry.corrected.json --out bakery.txt
npm run build:mcp
```

Pour une nouvelle image, fournir l'image et la grille à l'assistant, enregistrer
le JSON qu'il livre, puis passer le chemin réel de ce fichier à `import --file`.
Cette commande lit un JSON existant ; elle ne le génère pas depuis une image.

`GeometrySchema` exige cases dans les bornes et frontières orthogonales unitaires
uniques. Une frontière de porte exige son ID autoré. `approve` refuse les
incertitudes, contradictions et seuils incompatibles. Une erreur de seuil peut
demander une correction explicite de `map.ts` puis une nouvelle confrontation
image/métadonnées. Ne pas remplacer simplement les empreintes pour masquer un
changement.

La sauvegarde active `adventures/<id>/geometry.json` est indexée par mapId et
compilée avec le moteur. Reconstruire puis redémarrer les processus MCP après
modification ; pas de recharge à chaud pendant une session. Les SHA-256 de
l'image et des métadonnées sont vérifiés par `check` et chaque calcul moteur :
`GEOMETRY_STALE` si modification, `GEOMETRY_UNREVIEWED` si non approuvée, sans
appel externe ni repli silencieux.

**Référence active de la boulangerie :** `bakery.geometry.corrected.json` et
`.txt` correspondent au fichier utilisateur `bakery.geometry.corrected (2).json`,
conservé sans modification dans `bakery.geometry.source.json`. Ses 61 frontières,
ses cases de sol et ses décors sont conservés. L'unique ID de porte vide a été
rétabli en `dock-floor` : son seuil `(5,6)/(6,6)` est exactement celui de cette
porte. Aucun passage n'a été ajouté. Les deux anciens brouillons restent des
archives et ne servent plus de géométrie active.

Les seuils `entry-floor` sont `(10,9)/(10,8)` ; `floor-apartment`,
`(8,7)/(8,8)`. Le bureau et l'appartement incluent la rangée 12 ; le quai et le
sol commencent à la rangée 4. Le sol est une emprise en L : `x6-11,y4-7` et
`x10-11,y8`. `AdventureRoom.areas` porte ces rectangles exacts ; `zone` reste
leur boîte englobante. Inférence, rendu et validations utilisent cette même
emprise, sans attribution de la rangée 8 de l'appartement au sol voisin.

Les anciennes contradictions ont été résolues en adaptant les métadonnées à
cette référence, puis en recalculant leur empreinte. Le SHA-256 de l'image reste
inchangé. `geometry.json.bakery` est approuvé et utilisé mécaniquement. Cela
valide l'intégration du fichier choisi, pas une nouvelle analyse de l'image.
Les autres aventures gardent leur repli auteur `legacy_unverified`.

Conséquence de la référence : le quai n'a aucun accès depuis l'extérieur. Son
mur reste fermé, y compris en coordonnées brutes. On entre par `front`, fermée
et barrée selon les règles existantes, puis par l'entrée et le sol de la
boulangerie. Ni le moteur ni le module narratif n'inventent une entrée latérale.

## Exemple : bureau

Le modèle choisit `move_token({tokenId:"player",roomId:"5"})`. Depuis l'extérieur,
le moteur s'arrête devant `front` fermée (`goalReached:false,
stopReason:"closed_door", finalRoomId:"1"`). Après une décision explicite de
forcer puis franchir cette porte, un déplacement vers le bureau emprunte
`entry-floor` au seuil corrigé, puis s'arrête en salle `8` devant `floor-office`
fermée. Le DM ne raconte pas une arrivée dans le bureau. Sur une nouvelle
décision d'ouvrir et d'entrer, le modèle appelle distinctement :

```json
{"tool":"interact_door","arguments":{"actorId":"player","doorId":"floor-office","action":"open"}}
{"tool":"move_token","arguments":{"tokenId":"player","doorId":"floor-office","doorMode":"cross"}}
```

L'ouverture ne déplace personne. Le serveur ne détecte aucun mot-clé ni ne
complète les arguments. Les rencontres restent des outils explicites distincts :
`start_encounter` conserve son placement de mise en scène, limité à la map
courante, distinct de la navigation.

## PNJ réactifs

`AdventureNpcSpec.reactive` définit objectifs, capacités, vitesse, triggers et
template de combat éventuel. Sont concernés les PNJ de la même salle ou d'une
salle directement reliée, sur la même map, après une action joueur résolue, ou
un combattant réactif dont le tour commence. Une opportunité hors champ ne prouve
pas que le PNJ a perçu l'action : le modèle attend (`wait`) en l'absence de motif
perceptible et garde ses décisions confidentielles.
Exemples autorés : Madame Bougie (guider, marcher, ouvrir/fermer) et l'Écho de
la Gardienne (protéger, privilégier le dialogue, éventuellement combattre).

L'orchestrateur fournit une opportunité issue de l'état. Le modèle choisit
`npc_action` et tous les arguments ; aucun appel de jeu n'est fabriqué côté
serveur. Exemple, si ces IDs/permissions existent dans l'aventure :

```json
{"npcId":"guide-id","activationKey":"map:action:12:guide-id","actions":[
  {"kind":"move","doorId":"door-id","doorMode":"approach"},
  {"kind":"door","doorId":"door-id","action":"open"},
  {"kind":"move","doorId":"door-id","doorMode":"cross"}
]}
```

Le combat exige `kind:"initiate_combat", targetId:"player"`, la capacité,
un template et un contact adjacent libre avec le joueur. Le combattant reçoit
`controller:"reactive_npc"`. `run_monster_turns` s'arrête devant lui ; le modèle
choisit son tour, que `npc_action` achève. Les monstres déterministes conservent
leurs tours, avec le nouveau calcul de chemin.

Maximum quatre décisions PNJ par requête, trois actions par activation. Un
refus restaure l'état de cette activation. Les échecs sont bornés par la boucle
globale (six itérations ordinaires par défaut + au plus quatre décisions PNJ).
Les réactions ne créent aucune nouvelle révision joueur : pas de cascade.

`playerActionRevision`, `combatGeneration`, `npcActivationLedger` et
`handledRequestIds` survivent à `replace_game_state` et au JSONB Postgres. Les
effets confirmés sont sauvegardés avant l'appel LLM suivant. Réutiliser un
`clientRequestId` résolu retourne 409 sans rejouer ni réactiver, avec remboursement
du débit éventuel. Sans ID stable, deux messages identiques ne sont pas
distinguables d'une nouvelle action.

## Validation et limites

### Salles voisines, vue et réactions au bruit (31 octobre 2026)

Le bestiaire du prompt suit le mode de navigation : zone courante seule en
exploration ; salle courante et salles directement reliées en tactique et en
combat (portes fermées comprises, aucune autre map). `lib/dm/local-creatures.ts`
calcule cette sélection depuis les positions réelles des créatures, PNJ et
investigateurs. Les groupes sont filtrés membre par membre ; les rencontres
déjà déclenchées ne réintroduisent pas leur placement initial. Le contexte
local est actualisé après déplacement, franchissement, réaction, transition
de map ou de phase dans le résultat MCP. Le système statique reste identique
pendant toute la session, sans casting de campagne ni annexe de bestiaire.
Les souvenirs et les résultats d'actions résolues ne sont pas effacés.

`loadBestiaryPrompt` fournit seulement les notes des types locaux : les titres,
rôles et notes générales qui énumèrent d'autres créatures restent dans la
référence documentaire. `creatures[].npcIds` permet une liaison explicite à un
PNJ dont le `kind` est narratif. L'agent consulte les profils SRD complets via
`get_monster_stat_block` à la demande. Les états moteur/persistés restent entiers,
y compris les monstres des autres étages et les alertes hors champ ; seule leur
projection dans le prompt est réduite. Le bilan narratif précise que son
décompte d'adversaires est local et ne suffit jamais à décider la fin du combat.

En navigation tactique, `lib/dm/nearby-rooms.ts` transmet au MJ et au planner les
notes de la salle courante et des salles directement reliées de la même map.
Les portes fermées restent des liaisons pour ce contexte ; les murs sans passage,
les salles distantes et les autres maps ne sont pas des voisines. La topologie
provient de `navigationGrid` et des seuils autorés, avec les empreintes `areas`.

`lib/scene-perception.ts` donne séparément les cases en ligne de vue géométrique
depuis la position réelle du joueur (`visibleCells`, paires `[x,y]` dans le prompt).
Une porte ouverte permet donc de regarder dans la pièce voisine sans y entrer,
même depuis plusieurs cases, si le rayon passe effectivement dans l'ouverture.
Une porte fermée, une cellule bloquée ou un mur bloque le rayon. Occupants et
restrictions de déplacement n'obstruent pas cette vue. Aveuglement, inconscience
ou pétrification empêchent de voir. Cela ne résout ni éclairage, ni cachettes,
ni découverte d'un secret : ces limites et les jets éventuels restent au MJ.
Les PNJ cachés ne sont pas révélés, `roomsVisited` reste inchangé. Le brouillard
opt-in `fogReveal: "open-door"` utilise cette même projection pour mémoriser une
salle aperçue. Après une mutation spatiale, les notes locales et la perception
fraîches sont ajoutées au résultat outil ; le prompt initial reste gelé.

L'IA seule évalue l'audibilité depuis les actions réellement résolues (résultats
MCP), les portes, la distance et le module. Aucune regex ne lit le message joueur,
aucun moteur ne transforme une citation, négation ou hypothèse en bruit. Le nouvel
outil `react_to_noise` reçoit `encounterId`, `sourceRoomId`, `reason` et `response` :

- `alert` : enregistre d'abord une vigilance, sans déplacement ni initiative.
- `investigate` : lors d'une action ultérieure, déplace les membres explicitement
  sélectionnés par `monsterIndex` et un but de navigation chacun. La vitesse SRD
  borne le trajet ; `allowPartial: true` autorise une progression partielle. Une
  porte fermée arrête le trajet, sans ouverture, attaque ou téléportation implicite.
- `join_combat` : sur une activation ultérieure, ajoute explicitement une rencontre
  en investigation à un combat déjà actif, à ses positions réelles. Les renforts
  sont placés en fin d'ordre pour le round courant, triés entre eux par leur nouvelle
  initiative ; aucun jet d'initiative, tour ou budget existant n'est réinitialisé.
- `ambush` : exception autorée par `encounters[].noiseAmbush` ; disponible dès le
  premier bruit résolu. Le MJ choisit la porte reliant la source à la salle et
  les déplacements explicites, tous limités à cette salle. Le seuil intérieur
  reste libre, avec au moins un attaquant à côté. L'outil refuse toute sortie,
  investigation ou participation à un combat extérieur pour cette rencontre.
  Les positions sont persistées et occupées, sans révélation ni attaque.

Une embuscade préparée arrête le déplacement du héros au seuil intérieur de la
porte choisie (`stopReason: encounter_ambush`), puis attend un appel explicite du
modèle à `start_encounter` avec `ambush: {doorId, attackerIndex, weaponOrSpell,
suspicious}`. Pas de `playerCell` ni de remplacement du roster. La méfiance est
une interprétation du MJ, jamais une détection textuelle serveur. Les DD sont
autorés dans `noiseAmbush` : Perception, puis sauvegarde DEX seulement sur
réussite. Sauvegarde réussie = aucun dégât ; sinon une unique frappe de réaction
de l'attaquant sélectionné, contre la CA, avec son arme SRD et sa portée réelles.
Sans méfiance, pas de jet de Perception ni de sauvegarde. Les fenêtres de réaction
des profils SRD restent suspendables et reprenables après hydratation sans
relancer les dés. La rencontre est marquée déclenchée une fois ; les tours normaux
suivent. L'ouverture seule, une entrée par une autre porte ou une rencontre sans
préparation ne donnent aucune frappe gratuite. Cette règle est propre au module
qui l'autorise, pas une nouvelle règle générale d'attaque d'opportunité.
Si le héros entre pendant un combat déjà actif, les embusqués s'engagent dans
leur propre salle en fin d'ordre courant, sans modifier l'initiative existante,
le round ni les budgets déjà dépensés par le joueur.

Une rencontre réagit au plus une fois par révision d'action en exploration ou par
round de combat. Investigation et arrivée ne peuvent suivre l'alerte à la même
révision joueur. Une réaction n'incrémente pas cette révision : pas de cascade.
Un refus annule atomiquement toute l'activation. Les créatures en investigation
restent une rencontre inactive, mais occupent leurs vraies cases. Le modèle engage
un combat hors combat avec `start_encounter` ; celui-ci réutilise leurs positions
sauvegardées et conserve la salle/position du joueur sans placement de preset
implicite. Il refuse un remplacement de leur roster. Une rencontre engagée ne
réagit plus par cet outil : ses créatures suivent les tours de combat normaux.

La mémoire `sceneMemory.encounterAwareness` conserve map, vigilance, source,
justification du MJ, vitesses, positions et activation traitée, au round-trip MCP
et en JSONB Postgres. Une alerte/investigation ne marque pas la rencontre comme
déclenchée et ne complète aucun objectif. Cette première version ne simule ni
propagation acoustique chiffrée, ni activité continue, ni ouverture de porte par
les investigateurs ; l'audibilité reste une interprétation IA. Les entités sont
celles des rencontres autorées, sans invention de roster ni statistiques.

Tests dédiés : `tests/adjacent-rooms.test.cjs`, ainsi que les scénarios réels
MCP/route dans `tests/dm-navigation-reactions.test.cjs` et
`tests/dm-doors-narration.test.cjs`. Ils couvrent vue partielle/obstruée,
confidentialité, limites de map, alerte préalable, occupation, portes, vitesse,
refus atomique, sauvegarde, non-répétition, placement conservé et renforts.

Tests : buts explicites, détours, impossibilité, diagonales, portes, budget,
progression partielle, occupation et changements après aperçu, monstres/PNJ,
combat explicite, non-répétition, persistance, frontière agent/MCP, import local,
corrections, ASCII et obsolescence. Aucun appel modèle payant.
Les mocks ne prouvent ni la compréhension d'un modèle réel ni la précision de
l'analyse d'image. Seule la boulangerie utilise actuellement la référence
corrigée et approuvée par ce flux ; les autres illustrations restent à traiter.
La page de superposition est générée et ses contrats testés ; sa vérification
visuelle dans le navigateur embarqué n'a pas été possible (URL `file:` interdite).

Vérifications exécutées le 22 octobre 2026 : `npm run typecheck` réussi,
`npm test` : **314 tests réussis, zéro échec**. `npm run playtest:mock` avant/après :
23 tours, 64 appels, 2,7826 appels/tour, ratio narrateur 0,3478 et 15 tours en
erreur, inchangés. Le code de sortie 1 vient des seuils/attentes hérités déjà
présents dans la baseline ; aucun appel payant n'a été lancé.

Après adaptation à `bakery.geometry.corrected (2).json` : typecheck réussi,
**318 tests réussis, zéro échec**, dont la conservation exacte des frontières
utilisateur et l'égalité entre emprises des cinq salles intérieures et leurs
composantes portes fermées. Playtest avant/après : mêmes 23 tours, 64 appels,
ratio narrateur 0,3478 et 15 erreurs héritées. La vérification locale de la
géométrie active confirme l'approbation, les empreintes à jour et zéro conflit
avec les métadonnées. Redémarrer le serveur de développement pour recharger les
processus MCP existants avec cette version compilée.
