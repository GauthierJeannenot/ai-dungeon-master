# Aventures multi-maps — conception (IMPLÉMENTÉE)

Les images des pions peuvent être déclarées par aventure dans
`definition.tokenImages` : identité PNJ/alias explicite, puis profil de créature
pour les combattants sans portrait individuel. Cette présentation suit les
pions visibles et leurs identités de combat entre les cartes ; elle ne crée
aucun acteur et ne modifie pas les transitions ou positions. Sarah utilise les
[images 5e.tools répertoriées et créditées](../adventures/sarah-of-yellowcrest-manor/assets-5etools.md).

Les PNJ de toutes les cartes possèdent désormais une fiche mécanique sourcée et
des PV persistants dans `state.npcs`, même avant un combat. Les groupes placés
sous un pion portent un profil maison à PV cumulés et effectif décroissant ;
voir [catalogue et règles des PNJ](npc-stat-blocks.md). Les champs restent
attachés au PNJ lors des transitions, sans soin ni nouvelle initiative. Le
contexte du MJ ne projette que les fiches du périmètre local ; l’outil de lecture
par identifiant exige un PNJ révélé de la carte active. Un acteur inscrit
explicitement au combat partage son état avec son pion, relié au rechargement.

État de livraison, validations exécutées et travail restant : [registre canonique des intégrations MCP](suivi-integration-mcp.md). Ce guide décrit le périmètre technique ; les anciennes matrices d’audit ne sont pas le suivi courant.

Dans Sarah, Faerl conserve une identité sociale commune à Waterdeep et Greenfast.
Depuis la décision utilisateur du 23 novembre 2026, il peut céder à une intimidation
crédible sur ces deux cartes, selon la même procédure sociale 2014. Cette exception
remplace son ancienne immunité narrative ; elle ne modifie ni son sort établi,
ni ses positions, ni les conditions de voyage et ne crée aucune confidence acquise.

Les nouvelles parties de `fey-shadow-fair` sélectionnent les profils de
personnage de niveau 3 (voir [personnages jouables](playable-characters.md)).
Leur recharge SRD se fait aux repos : le passage de la foire au bois ne rend
ni emplacements, ni inspiration, ni canalisation ou capacités martiales. Les
effets narratifs localisés gardent leur `mapId`, durée et concentration après
sauvegarde ; une commande ne peut pas déplacer un effet situé sur une autre
carte. Les anciennes sauvegardes gardent leurs règles et leur répertoire.

Le [premier lot d'outils MJ](mcp-toolkit.md) ajoute des objets, pièges et PNJ
improvisés persistants. Leur `mapId`/`roomId` fixe la portée des interactions et
des aperçus confidentiels ; les obstacles intacts ne bloquent que leur propre
map. `generate_dungeon`/`validate_dungeon` préparent un plan ; `install_dungeon`
ajoute explicitement une carte de donjon dans la même session et aventure.
`travel_to_map` permet ensuite l'entrée et le retour, sans changer le personnage.
Voir [Donjons aléatoires jouables](playable-random-dungeons.md).

Le module `sarah-of-yellowcrest-manor` utilise cinq actes à sens unique
(Candlekeep, Waterdeep, Greenfast, temple, sépulture). Le manoir victorien utilise deux cartes, `temple` (rez-de-chaussée, 40 × 24) et `cellar` (sous-sol, 40 × 16), dans le même `travelGroup: "manor"`. Les transitions `descend_manor` et `ascend_manor` portent un `passage` (salle, case et libellé du départ) : portée et mobilité sont validées par le moteur, combat/réaction en attente interdits. Elles ne vérifient pas la quête d’acte, ne produisent pas de `mapOutcomes`, ne restaurent aucune ressource et conservent les découvertes. Une sortie d’acte ferme toutes les cartes du groupe. Les PNJ et objets restent sur leur niveau ; les compagnons explicitement déclarés traversent lors du retour final. Les monstres de chaque niveau sont sauvegardés dans `sceneMemory.floorMonsters`. Les objets autorés optionnels
`map.ts.groundItems` sont amorcés dans `GameState.droppedItems` à la création
de session, pour toutes les cartes, puis ramassés par `pick_up_item` avec les
mêmes validations de salle, map et portée que les objets déposés. L'hydratation
ne les réamorce jamais : objets pris ou laissés conservent leur état. L'urne
portée constitue un objectif `itemInInventory`, puis son dépôt au mausolée
utilise `drop_item`. Les anciens modules sans `groundItems` restent inchangés.
La condition historique `encounterResolved` signifie preset déclenché ;
l'interdiction de voyager en combat est distincte. Elle ne certifie pas la
mort d'un ennemi après une fuite : les libellés et le récit doivent préserver
cette distinction.

Une condition auteur `encounterOutcome` utilise désormais le vrai registre
d’engagements/clôtures et une issue structurée choisie par le MJ après
`end_combat`. Sarah l’utilise pour la confrontation finale : `start_encounter`
seul ne suffit plus. Une fuite réellement close peut autoriser le départ avec
l’urne, en conservant son échec sans annoncer de victoire. Les départs nouveaux
retiennent `campaignOutcomeIds`; les cartes legacy déjà quittées gardent leurs
anciens résultats. Voir [issues de campagne](campaign-outcomes.md). Les
sauvetages physiques sont liés séparément aux véritables arrivées d’escorte.

Les conséquences localisées durables des actions du joueur (`worldFacts` avec
`expires: "never"`) restent sauvegardées lors de `travel_to_map`. Elles ne
sont rappelées au MJ que dans leur map et salle d'origine ; les faits
transitoires de la map quittée sont purgés. Les objets déposés conservent leur
position, leur description et leur repère historique sur la map d'origine ;
ils ne traversent pas avec le joueur ou le PNJ repère. Voir `playable-characters.md`.

## Continuité narrative du MJ entre les cartes

Le préambule de `adventure-module.md`, avant le premier `# Carte`, est conservé
dans l'index confidentiel du prompt système sur toutes les cartes. Sarah y porte
un fil narratif global : rôle des six cartes dans les cinq actes, liens entre
indices et objets, identités récurrentes, branches conditionnelles et dénouements.
Les introductions de cartes et détails de salles restent sélectionnés localement.
Ce dossier décrit le scénario prévu ; seuls l'état moteur et les faits établis
décrivent la progression réelle. Il ne révèle rien automatiquement au joueur et
ne crée ni indice, ni objectif communiqué, ni transition, ni effet mécanique.

L'outil documentaire MCP `consult_campaign` permet aussi au MJ de consulter le
Markdown intégral de sa campagne à la demande, y compris les cartes éloignées et
les annexes exclues du contexte automatique. Sans argument : index paginé des
titres et `sectionId`. `query` recherche explicitement dans le document ;
`sectionId` lit un titre et ses sous-sections, `sectionId: "module"` lit le fichier
complet par pages. `nextOffset` poursuit le texte (6 000 caractères par défaut,
8 000 maximum) ; `nextResultOffset` poursuit l'index ou les résultats. La route
fixe la session ; le moteur fixe l'aventure au spawn du processus. Aucun chemin
de fichier ou identifiant d'une autre campagne n'est accepté. Cet outil, ainsi
que `consult_rules` et `discover_tools`, est directement exposé avec son schéma
et documenté dans le prompt système, sans découverte préalable. Le contenu du
document est lu à la demande. Il est disponible dans toutes les phases,
sans appel de jeu MCP, dé, temps écoulé ni action consommée. Une référence à un
secret ou à un profil documentaire n'accorde aucune découverte ni capacité.

Pour modifier cette continuité, maintenir le préambule du module avec ses scènes
et ses conditions de `map.ts`. Après édition, invalider le cache de contexte ou
redémarrer l'application pour recharger le Markdown.

## Temps de voyage et profils SRD 2014

`MapTransition.travelSeconds` est optionnel. Pour un profil `srd2014`,
`travel_to_map` avance cette durée avant de changer de carte, pour expirer
les effets ; il ne confère ni repos ni restauration. Les anciennes transitions
sans durée et les profils historiques gardent leur comportement.
Les quatre trajets du module de niveau 7 durent 259200, 86400, 3600 et 90000
secondes. Seuls `take_rest` et les ressources propres à chaque classe
restaurent les réserves de ces profils. Les effets spatiaux (Arme spirituelle,
Gardien de la foi) gardent leur `mapId` et ne suivent pas le joueur.

## Navigation à l'intérieur d'une map

`map.ts.maps[].navigationMode` distingue les vues d’exploration (`exploration`)
des plans tactiques (`tactical`, comportement par défaut). Waterdeep et Greenfast
sont des vues d’exploration : tous les lieux de la même carte sont proposés,
même non contigus. Un seul `move_token` vers le `roomId` choisi calcule le trajet,
sans demande intermédiaire de retour dans les rues ou sur la place. Le contexte
du MJ explicite cette liberté et n’affiche pas de contiguïtés entre ces lieux.
Les portes fermées et les décisions d’entrée restent validées par le moteur ;
une demande de déplacement ne les résout pas. Les deux étages du manoir sont
des plans tactiques en vue de dessus : passages, murs et accès locaux restent
la référence. En combat, toute carte utilise toujours les trajets et budgets
tactiques. Ce champ ne change ni les objectifs ni les transitions entre maps.

Une même map peut être mixte : `explorationRoomIds` désigne ses zones
d’exploration, les autres conservent `navigationMode` (tactique par défaut).
`getNavigationMode` centralise le choix selon la salle courante et impose le
mode tactique en combat. Grammy’s utilise l’exploration dehors (salles 1, 2, 3)
et le tactique à l’intérieur (4, 5, 7, 8, 9, quai compris). Les destinations
extérieures sont proposées sans contiguïté, avec les accès intérieurs proches ;
les autres pièces gardent leurs connexions locales. `scenes[].navigationMode`
peut restreindre une illustration à un mode : `getAdventureScene` affiche la
vue illustrée de Grammy’s dehors, puis le plan tactique dès l’entrée, même
hors combat. Ressortir ou reprendre une session recalcule le même choix depuis
l’état moteur, sans nouveau champ de session. Les seuils, murs et événements
d’entrée restent validés ; l’approche d’une porte fermée ne change pas le mode.

Les cartes d’exploration partagent `explorationDestinationRooms` pour les
repères et leur légende (`AdventureScene`) et les boutons de zones de la
battlemap. Un repère de lieu déclare `destinationRoomId` ; son placement et sa
demande restent autorés dans le module. Le filtre commun respecte la map,
la mobilité, les connexions et le brouillard. Les conditions supplémentaires
comme `requiresClueId` restent appliquées par la scène. Waterdeep, Greenfast,
la Cité des Morts et la Foire utilisent le mode exploration ; Grammy’s
l’utilise seulement dehors. Les boutons envoient toujours une intention au
MJ, puis le moteur revalide l’appel qu’il choisit. Cliquer un repère ne quitte
jamais implicitement la map et ne résout ni porte ni rencontre.

Grammy’s active `fogOfWar`, avec `fogHiddenRoomIds` pour ses cinq intérieurs
et `fogReveal: 'open-door'`. Les extérieurs et le terrain entre leurs zones
restent visibles. Se placer à portée d’un seuil ouvert (case du seuil ou case
adjacente accessible sans mur ni coin coupé) révèle la pièce de l’autre côté.
Ouvrir ou briser une porte à portée produit le même effet, avant franchissement.
Une porte ouverte lointaine ne révèle rien et la vision ne se propage pas à
travers une deuxième porte. La cécité ou l’inconscience empêchent une nouvelle
découverte visuelle. Le moteur mémorise les pièces vues dans
`sceneMemory.discoveredRoomIds` après mouvement ou interaction de porte ; ce
champ survit à la sauvegarde et à la reprise. Les pièces déjà vues restent
connues après fermeture. `roomsVisited` reste réservé aux visites réelles,
sans complétion de quête ni révélation de PNJ par la seule vue. Les autres
cartes conservent le brouillard fondé sur les visites. L’illustration extérieure
utilise `scenes[].fogRegions` (polygones en pourcentages) pour masquer les mêmes
intérieurs que la grille, avec des emprises adaptées à son angle de vue.

Une map peut déclarer une scène d’exploration illustrée dans
`definition.ts.scenes[mapId]` : fond, zones cliquables et superpositions de PNJ
en coordonnées relatives à l’image. Candlekeep utilise l’image de la salle de
lecture et le fantôme de Sarah déjà détouré, caché initialement. Le clic sur le
livre envoie une demande de lecture au même agent que le chat ; seul son appel
explicite à `reveal_npc` rend l’apparition visible. Les superpositions suivent
les PNJ visibles de la salle et de la map courantes, y compris après reprise.
La salle 1 décrit le résumé complet des pages lues : vie de Sarah, famille,
adresses et relations, dernière entrée et deux croquis. Après confirmation de
`reveal_npc`, la réponse finale raconte cette lecture avant l’apparition muette,
sans confondre le journal avec le témoignage du fantôme ou les secrets futurs.
Le résumé prend la forme d’une prose continue qui relie la vie quotidienne,
les attachements de Sarah et la montée de sa peur, sans liste ni énumération.
Les indices restent disponibles dans le contexte de salle avant sa révélation ;
la prose accompagnant un appel outil ne suffit pas, puisqu’elle n’est pas publiée.
Les boutons de navigation suivent le même circuit de messages. Cette
présentation ne change ni la grille interne du moteur, ni les seuils, ni les
objectifs ; le combat et les maps sans scène gardent leur battlemap.

Les rayonnages à gauche de l’illustration portent une zone cliquable « Faire
des recherches ». Ce choix passe par le MJ et reste facultatif. La transmission
effective de l’histoire est mémorisée par un `reveal_clue` explicite du MJ
(`sarah_story`, source `sarah` ou `avowed` présent). Ce souvenir est le seul
préalable de départ ; une apparition seule ne vaut pas connaissance.

Le bouton « Partir pour Waterdeep » apparaît sur la droite, à l’intérieur
de l’image, dès ce souvenir connu, depuis toute salle de Candlekeep
(`hotspots[].appearance: 'button'` et `requiresClueId`). Ses coordonnées en
pourcentage suivent l’illustration, sans colonne extérieure. Il confirme le départ définitif sans retour et
la prise du journal. Le MJ appelle `travel_to_map` dans le même tour, sans
seconde confirmation ; l’outil est exposé dès le départ avec les outils courants.
La transition autorée `departureItemIds: ['sarah_diary_copy']` récupère l’instance
existante de la copie autorisée, sans duplication si elle est déjà portée,
puis place le héros sur `waterdeep`, salle 4. L’original et Sarah restent à
Candlekeep. Aucun objectif de mission, recherche, visite du quai ou ramassage
séparé n’est exigé. Un récit d’embarquement ne remplace pas la transition.

`MapTransition.departureItemIds` est une liste statique d’objets de départ
autorisés par le contenu, jamais un argument choisi par le modèle. Elle est
vide par défaut : les autres voyages ne prennent rien automatiquement. Le
moteur vérifie les instances au sol de la carte de départ, les contenus et la
capacité de portage active avant le voyage ; il ne crée aucun nouvel objet.
`travel_to_map` renvoie les `itemsTaken`, et l’inventaire persistant fait foi.

Waterdeep utilise une vue aérienne de la ville avec cinq repères numérotés
(manoir, maison de Vecken, commerces, cour du coche, route vers Greenfast).
Le champ optionnel `hotspots[].marker` affiche un repère sur l’image et un
bouton équivalent dans la légende, également utilisable sur petit écran.
Les noms sur l’image sont masqués sur les vues étroites ; numéros et légende
restent visibles. Les coordonnées sont relatives à l’illustration, distinctes
des cases moteur : ce placement est une mise en scène des adresses, pas une
géographie officielle. Le clic sur la route demande seulement de la rejoindre ;
le départ définitif reste une action distincte, proposée depuis la salle 9.
La battlemap interne reste disponible en combat.

Greenfast utilise une illustration du village vu de haut, générée avec
ImageGen (`public/adventures/sarah-of-yellowcrest-manor/greenfast-aerial.png`).
Les cinq repères G1 à G5 désignent le jardin de Kara, le Chaudron ventru,
la maison de Viallis, le bureau de Faerl et la grange. Deux autres repères
désignent la place (P) et le départ du chemin de la tour (T). Leurs positions
suivent les bâtiments de l’illustration ; elles ne remplacent pas les cases
du moteur. Les portes fermées demandent toujours une approche puis une
interaction résolue par l’agent. Le repère T demande seulement de rejoindre
le chemin ; le départ définitif est un bouton distinct depuis la salle 16.
La tour, à une heure de marche, n’est pas représentée dans le village.
Le prompt de génération est conservé dans le dossier du module sous
`greenfast-imagegen-prompt.txt`.

Les repères et actions peuvent porter `requiresClueId` : ils restent cachés
tant qu’aucun `worldFact.clueId` correspondant n’est enregistré. Les indices
sont définis dans `map.ts.clues` (`id`, texte et `sourceNpcIds`). Après qu’un
témoin a réellement partagé l’information, l’agent appelle explicitement
`reveal_clue(clueId, npcId)` ; le moteur valide l’indice et la présence visible
du témoin dans la salle et la map, sans condition de disposition. Le fait
durable est conservé à la reprise et ne peut pas être remplacé par un fait
narratif libre. La condition d’objectif `clueRevealed` vérifie ce même indice.
À Waterdeep, `greenfast_lead` ouvre la route et ses boutons après la révélation
du cordonnier ou de Faerl, sans exiger l’approbation du cordonnier. Une visite,
une amitié ou une hypothèse du joueur ne débloque rien à elle seule.
Le contexte dynamique du MJ donne le texte exact des indices,
leurs identifiants, leurs témoins et leur état enregistré. Les résultats MCP
rafraîchissent ce contexte, notamment après un jet social : l'agent doit
enregistrer le témoignage par `reveal_clue` avant de le raconter. Ce marqueur
peut accompagner l'action principale. Si une narration passée a omis cet
appel, l'agent peut le rattraper auprès du témoin présent sans nouveau jet ;
le serveur ne déduit aucun indice du texte et ne fabrique aucun appel.
Les objectifs et les notes du module sont des références privées pour le MJ,
pas un journal public : une condition non remplie ne prouve pas que le héros
connaît cette piste. Avant une transition, le MJ rappelle le sens unique et
les pistes déjà découvertes, sans annoncer les développements futurs des PNJ
ni les issues conditionnelles. Les résumés d'historique distinguent également
les faits découverts des prédictions et apartés omniscients.

En exploration, les zones directement reliées à la zone courante sont
cliquables sur la battlemap. Cette sélection reste limitée à la map courante :
elle envoie une demande de déplacement au MJ, sans créer de transition entre
maps ni ouvrir une porte fermée. Voir `navigation-and-battlemaps.md`.

Les types de rencontre viennent du catalogue SRD 2014 partagé
`lib/srd/monsters.ts`, et les fiches de `bestiary.json` sont générées depuis
le même snapshot API. Les anciens gobelins minions sont devenus des gobelins
SRD ; les PV réduits du Grand Flan et du majordome ont été supprimés.
Les apparences féeriques restent des choix narratifs explicitement nommés.
La copie de blocs d'une campagne à l'autre n'est plus une source de statistiques.

Le casting complet reste documentaire : il n'est plus injecté dans le système
statique. Le bestiaire dynamique sélectionne la zone courante en exploration,
ou la salle courante et les salles directement reliées en tactique/combat,
portes fermées comprises, toujours sur `currentMapId`. Les positions actuelles
des monstres, investigateurs et PNJ font autorité ; un membre éloigné d'une
rencontre locale n'est pas inclus. Les monstres sauvegardés sur les autres
étages (`sceneMemory.floorMonsters`) restent côté moteur/persistance. Le même
périmètre filtre les positions de la carte du prompt, les monstres de l'état
sérialisé et le décompte narratif local. Les résultats MCP et l'historique des
faits résolus conservent leur rôle ; ce filtrage ne supprime aucun acteur du jeu.

Voir [navigation-and-battlemaps.md](navigation-and-battlemaps.md) pour le contrat
`move_token`/`preview_navigation` (buts explicites salle, case, porte ou relation
à une entité), la recherche de chemin et les réactions PNJ. Un trajet reste
strictement sur `currentMapId` ; il ne traverse jamais implicitement une
`mapTransition`. Les IDs de salles conservent leur portée globale dans le module.

Le mode explicite `movementMode: "fly"` reste une projection horizontale sur
cette même carte, réservée aux créatures natives stationnaires sans marche.
Il n'ajoute ni altitude ni transition entre cartes, et conserve murs, portes,
occupation et budgets. Voir [hover-flight.md](hover-flight.md) pour ses limites.

En combat, les cases bleues cliquables de la battlemap sont calculées sur cette
seule map avec sa géométrie, ses portes et le budget restant du joueur. Un clic
transmet la destination exacte au MJ ; le moteur valide ensuite le chemin.
Le changement de map recalcule cet aperçu sans conserver de cases de la carte
précédente, et le clic ne déclenche aucune transition entre maps.

La géométrie active est enregistrée par mapId dans
`adventures/<id>/geometry.json`, compilée avec le moteur. Une image et ses
métadonnées portent des empreintes ; une modification rend la géométrie obsolète,
sans réanalyse pendant la partie. Après la décision produit révisée, l'assistant
analyse les images fournies **dans la conversation** et livre JSON/ASCII : aucune
intégration vision. Import local, superposition éditable, correction et approbation
précèdent l'activation. Les anciens brouillons incertains ne sont pas activés ;
la boulangerie utilise maintenant la correction utilisateur réconciliée avec
ses métadonnées. Les autres maps conservent leur géométrie autorée de repli.

Une salle peut déclarer `areas` (union de rectangles) pour une emprise exacte
non rectangulaire ; `zone` reste sa boîte englobante. Le rendu et l'inférence
de salle partagent `roomContainsCell`. Cette emprise reste scopée à la map de
la salle et ne peut jamais provoquer de transition implicite.

Les seuils sont franchis sur le graphe de circulation et ne peuvent plus être
contournés par des coordonnées traversant une cloison. Les pièces `enclosed`
utilisent leurs seuls seuils déclarés dans la géométrie autorée de repli. Cette
géométrie reste étiquetée `legacy_unverified` tant que l'illustration n'a pas été
revue et approuvée. Les connexions topologiques ne garantissent ni l'ouverture
d'une porte, ni un trajet libre, ni un budget suffisant. Les PNJ d'une autre map
ne reçoivent pas d'activation et les règles explicites des compagnons restent
inchangées.

> **Statut : IMPLÉMENTÉ (les 4 phases).** Ce document reste la référence de
> conception ; si une décision change, METTRE À JOUR ce document dans le même
> commit (docs/ a déjà divergé du code une fois — ne pas recommencer).
> Premier module multi-maps : `adventures/fey-shadow-fair/` (« La Foire du
> Voleur d'Ombres », 2 cartes). Tests : tests/mcp-multimap.test.cjs +
> boucles registre de tests/adventure-modules.test.cjs.
> Pour CRÉER un nouveau module multi-maps, suivre le guide pratique
> docs/creating-multi-map-modules.md (ce document-ci décrit le moteur, pas
> la marche à suivre côté contenu).

## Objectif

### Déplacement furtif et objets déposés (octobre 2026)

Une salle peut déclarer `entryStealthDc`. En exploration, `move_token` avec
`stealth: true` valide d'abord le déplacement, puis résout un test DEX
(Discrétion, maîtrises du personnage) et le trajet dans le même appel.
Le DD vient de la salle de destination sur la map courante (15 par défaut).
Le résultat `stealthCheck` et le journal moteur établissent l'issue ; un fait
de monde limité à la salle conserve cette issue. Aucun jet en double n'est
nécessaire. En combat, déplacement et action Se cacher restent distincts :
l'option composée est refusée.

Les objets déposés dans `GameState.droppedItems` conservent leur `mapId`
à chaque voyage. Ils restent sur la carte quittée, sans être téléportés dans
l'inventaire ou accessibles depuis une autre map. Le round-trip MCP conserve
ces emplacements, y compris pour les anciennes sauvegardes (défaut `{}`).

Permettre à un module d'aventure (`adventures/<id>/`) de contenir **plusieurs
maps** (chacune avec sa propre grille, sa propre image de battlemap et ses
propres salles). Le joueur passe à la map suivante quand la map courante « a
donné tout ce qu'elle avait ».

## Décisions actées (avec l'auteur du projet, 2026-07-04)

1. **Le moteur MCP est le seul juge de la complétion d'une map.** Jamais le
   LLM, jamais le client (invariant anti-triche/anti-injection n°1 de
   AGENTS.md). Le LLM/joueur ne fait que *déclencher* la transition ; le moteur
   la refuse si les conditions ne sont pas remplies.
2. **La condition de sortie = la quête associée à la map**, avec deux niveaux :
   complétion **partielle** (objectifs obligatoires remplis — suffit pour
   partir) ou **totale** (tous les objectifs). Le niveau atteint est enregistré
   et influence le contexte narratif des maps suivantes.
3. **Transitions à sens unique.** Aucun retour en arrière : le joueur assume
   ses choix. Le loot/contenu raté est raté. Le modèle de données ne doit pas
   l'interdire à jamais (les transitions sont des données), mais le moteur v1
   refuse toute transition vers une map déjà quittée.
4. **Numérotation des salles globale et continue sur tout le module.** Si la
   map 1 a les salles 1–8, la map 2 commence à la salle 9. Une map = un
   regroupement de salles + sa grille + son image. Toutes les structures à clé
   `roomId` (roomHooks, roomStatusHints, placeholders, aliases, `## Salle N`)
   restent inchangées.
5. **Un PNJ peut suivre le joueur** d'une map à l'autre (compagnon). Le sort
   des PNJ à la transition est déclaré dans les données, pas improvisé.
6. **Les deux aventures existantes deviennent des aventures à 1 map** sans
   aucun changement visible : mêmes prompts byte-à-byte, mêmes nombres au
   playtest. Les sessions legacy en base (GameState sans `currentMapId`)
   restent lisibles : défaut = première map.
7. **Contexte prompt maîtrisé** : l'index statique injecté au DM couvre la map
   courante ; les maps passées ne survivent que sous forme **compressée**
   (faits d'issue de quête enregistrés par le moteur). Les maps sont peu
   interdépendantes par conception.
8. **Le contenu multi-map** (nouvelle aventure) sera créé ou adapté plus tard
   sur demande. L'implémentation se valide d'abord sur une fixture de test.

## Modèle de données

### `lib/adventure-map.ts` — nouvelles structures

```ts
// Une map d'un module : sa grille et son identité. Les salles, encounters,
// PNJ, aliases restent des collections PLATES au niveau du module (les roomId
// sont globalement uniques — décision n°4) ; chaque salle porte son mapId.
export interface AdventureMapSpec {
  id: string            // ex. 'crypte', 'falaises' — stable, sert de clé partout
  name: string
  grid: { cols: number; rows: number }
}

// Vérifiable par le moteur UNIQUEMENT à partir de GameState. Liste fermée,
// extensible par ajout de variantes — jamais de condition « floue ».
export type ObjectiveCheck =
  | { type: 'encounterResolved'; encounterId: string }
  | { type: 'itemInInventory'; item: string }
  | { type: 'npcDisposition'; npcId: string; disposition: WorldNpcDisposition }
  | { type: 'roomVisited'; roomId: string }
  | { type: 'clueRevealed'; clueId: string }

export interface MapObjective {
  id: string
  label: string        // court, injectable tel quel dans un prompt
  required: boolean    // true = nécessaire à la complétion PARTIELLE
  check: ObjectiveCheck
}

export interface MapQuest {
  mapId: string
  objectives: MapObjective[]  // partielle = tous les required ; totale = tous
}

export interface MapTransition {
  id: string
  fromMapId: string
  toMapId: string
  // Cellule et salle d'arrivée sur la map de destination (coordonnées de la
  // grille de DESTINATION). Pas de startCell global par map : chaque
  // transition définit son point d'arrivée.
  arrivalCell: GridCell
  arrivalRoomId: string
  // PNJ candidats à la traversée avec le joueur (décision n°5). Seuls ceux
  // devenus `helpful` (amitié actée en jeu via reveal_npc) traversent : un
  // compagnon jamais abordé reste sur sa map, comme les autres PNJ de la map
  // quittée (sens unique).
  companions?: string[]        // npc ids
}
```

### `AdventureMapData` — champs ajoutés/modifiés

```ts
export interface AdventureMapData {
  // NOUVEAU. Ordre = ordre de progression ; maps[0] est la map de départ.
  maps: AdventureMapSpec[]
  mapQuests: Record<string, MapQuest>       // clé = mapId ; peut être vide pour maps[0] d'une aventure 1-map
  mapTransitions: MapTransition[]           // vide pour une aventure 1-map

  // MODIFIÉ : chaque salle sait sur quelle map elle vit.
  rooms: AdventureRoom[]                    // AdventureRoom gagne `mapId: string`

  // MODIFIÉ : un PNJ dont roomId est null (ambiant) doit déclarer son mapId
  // explicitement ; sinon mapId dérivé de sa salle.
  npcs: AdventureNpcSpec[]                  // AdventureNpcSpec gagne `mapId?: string`

  // INCHANGÉS (clés roomId globalement uniques) : entryCells, encounters,
  // rooms, entryCells, doors, partitions, roomHooks, startCell, initialPlayer.
  // `grid` top-level DISPARAÎT au profit de maps[i].grid — voir « Compat » ci-dessous.
}
```

**Compat des aventures existantes** : `grammys-country-apple-pie` et
`tide-crypt` deviennent `maps: [{ id: '<qqch>', name: ..., grid: <ancien grid> }]`,
`mapQuests: {}`, `mapTransitions: []`, chaque room gagne le mapId unique. Aucun
autre changement de contenu. Si trop de call-sites lisent `map.grid`, garder un
accesseur `gridForMap(mapId, adventureId?)` plutôt qu'un champ dupliqué —
**une seule source de vérité pour les dimensions** (le commentaire actuel de
`AdventureMapData.grid` reste la loi).

**Signatures** : les accesseurs de `lib/adventure-map.ts` gardent `adventureId`
en DERNIER argument optionnel (contrat lib/CLAUDE.md). Pour les fonctions qui
deviennent dépendantes de la map (`inferAdventureRoomId` : une cellule seule est
ambiguë quand deux grilles se chevauchent numériquement), créer une **nouvelle**
fonction avec `mapId` explicite (ex. `inferRoomIdOnMap(cell, mapId, adventureId?)`)
et faire pointer l'ancienne sur `maps[0]` (comportement historique 1-map).

### `lib/types.ts` — GameState

```ts
export interface GameState {
  // ...existant...
  currentMapId?: string   // absent (session legacy) = maps[0]
  // Issue des maps quittées, enregistrée PAR LE MOTEUR à la transition.
  // C'est la forme « compressée » du contexte des choix (décision n°7).
  mapOutcomes?: Record<string, {
    completion: 'partielle' | 'totale'
    objectivesDone: string[]   // ids d'objectifs remplis au moment du départ
  }>
}
// NpcState gagne `mapId?: string` (absent = maps[0]).
```

⚠️ **Piège n°1 du repo** : tout nouveau champ de `GameState` doit être
explicitement repris dans `replaceState` (mcp-server/game-state.ts, ~l.88),
comme `encountersTriggered`. `currentMapId`, `mapOutcomes` et le `mapId` des
NPC doivent survivre au round-trip, sinon ils meurent au tour suivant.
Ajouter un test unitaire de round-trip pour chacun.

**Persistance** : GameState est un blob JSON dans la session Postgres — pas de
changement de schéma SQL attendu. Les lignes legacy sans `currentMapId` doivent
rester lisibles (défaut au mapping, mécanique déjà en place dans les stores).
Si un changement de schéma s'avérait nécessaire : migration additive
(`ADDITIVE_MIGRATIONS_SQL`) + round-trip pg-mem dans tests/db-stores.test.cjs.

## Moteur (mcp-server)

### Bornes de déplacement par map courante

`mcp-server/rules.ts` fige aujourd'hui `MAP_BOUNDS` **au chargement du module**
(`const GRID = getAdventureMap(ACTIVE_ADVENTURE_ID).grid`). Avec plusieurs
grilles, les bornes deviennent **dynamiques** :

- Remplacer la constante par `mapBounds(): MapBounds` qui lit
  `state.currentMapId` (repli maps[0]).
- `PositionSchema` (mcp-server/tools/player-tools.ts) valide aujourd'hui via
  `.min/.max` figés à la construction du schéma → le schéma ne peut plus porter
  les bornes. Garder un schéma « entiers ≥ 0 » et déplacer la validation de
  borne dans les handlers via `rules.isCellInBounds` (qui existe déjà, ~l.133).
  Tout chemin qui écrit une position passe par cette validation.
- L'inférence de salle depuis la position (game-state.ts) doit filtrer les
  salles par `currentMapId` (via `inferRoomIdOnMap`).

### Nouveau tool : `travel_to_map`

Le seul point d'entrée de changement de map. Validations, dans l'ordre :

1. L’agent fournit explicitement `transitionId` ou `toMapId`. Une unique
   transition correspond depuis la map actuelle ; si les deux identifiants
   sont fournis, ils doivent désigner la même transition. `reason` est un
   texte de journal uniquement : aucun matching, aucune sortie implicite.
   Sinon → erreur `NO_MAP_TRANSITION` sans mutation.
2. Pas de combat en cours (`phase`), pas de map de destination déjà présente
   dans `mapOutcomes` (sens unique, décision n°3).
3. **Quête au moins partielle** : tous les objectifs `required` de
   `mapQuests[currentMapId]` sont satisfaits (évaluation des `ObjectiveCheck`
   contre l'état). Sinon → erreur listant les objectifs manquants (le DM narre
   le refus : la porte est verrouillée, pas le juge).

Effets, atomiquement :

- Enregistre `mapOutcomes[fromMapId] = { completion, objectivesDone }`
  (completion `totale` si tous les objectifs sont remplis, sinon `partielle`).
- `state.currentMapId = toMapId`, joueur téléporté sur `arrivalCell`,
  `currentRoomId = arrivalRoomId`, salle marquée visitée.
- Les PNJ listés dans `companions` ET devenus `helpful` (et eux seuls) passent
  sur la nouvelle map : `mapId = toMapId`, position adjacente à `arrivalCell`
  (réutiliser la logique de placement existante des PNJ). Un compagnon jamais
  abordé (neutral/wary) reste sur sa map, comme tous les autres PNJ (donc hors
  de portée à jamais) — l'amitié s'acte en jeu par
  `reveal_npc({ npcId, disposition: "helpful" })`.

Exposer aussi l'état de quête en LECTURE (soit un tool `get_map_quest_status`,
soit un champ dans le résultat de l'état renvoyé) pour que le prompt dynamique
puisse dire au DM ce qui manque, sans que le DM devine.

Rappels non négociables : jamais de `console.log` (stdout = protocole MCP) ;
chaque validation AVANT toute mutation ; erreurs = résultat `isError`, pas de
throw ; `npm run build:mcp` après tout changement ici ou dans les fichiers
partagés, sinon tests et dev tournent sur l'ancien binaire.

## App / UI / Prompts

- **Battlemap** : `definition.ts` remplace `battlemapImage: string` par
  `battlemaps: Record<string, string>` (clé = mapId, valeur =
  `/battlemaps/<fichier>.png`). `app/game/page.tsx` (~l.780) choisit l'image et
  la grille selon `gameState.currentMapId`. Convention fichier : une image par
  map, `public/battlemaps/<adventureId>-<mapId>.png` pour les nouvelles maps
  (les fichiers existants gardent leur nom, ce sont des aventures 1-map).
- **Frontière moteur/app** : `battlemaps` reste dans `definition.ts` (app
  only) ; les grilles restent dans `map.ts` (moteur). Ne jamais importer
  `definition.ts` depuis mcp-server.
- **Prompts** (`lib/dm/prompts.ts`) : le bloc dynamique gagne, quand pertinent,
  (a) l'état de la quête de la map courante (objectifs remplis/manquants) et
  (b) une ligne compacte par map quittée depuis `mapOutcomes` (ex.
  « Falaises : quête partielle — phare rallumé, contrebandier épargné »). Le
  libellé se construit depuis `MapObjective.label`, PAS de texte en dur dans
  lib/ (invariant zéro fuite inter-modules).
- **Progression et refus** : `lib/dm/quest-context.ts` fournit au planner et au
  DM les mêmes objectifs évalués et leurs conditions exactes (`npcDisposition`,
  `itemInInventory`, etc.) dans le contexte dynamique. Un changement certain
  exige aussi son outil : `reveal_npc` enregistre une disposition établie même
  pour un PNJ déjà visible ; `pick_up_item` enregistre une prise demandée par le
  joueur. Accepter une mission ne ramasse aucun objet implicitement. Après un
  refus du tool prévu, la route lève son forçage mais conserve le plan non résolu :
  l'agent peut corriger son appel, choisir un préalable autorisé ou expliquer les
  conditions manquantes. Le serveur ne choisit ni n'exécute ces préalables.
- **Context-loader** (`lib/context-loader.ts`) : le parsing `## Salle N` reste
  la loi. Ajouter un niveau optionnel `# Carte <mapId> — <titre>` (en-tête de
  niveau 1) dans `adventure-module.md` : le parseur rattache chaque salle à sa
  carte et produit un **index par map** ; le prompt statique n'embarque que
  l'index de la map courante + les annexes globales. Un module SANS en-tête
  `# Carte` = une seule map, index identique à aujourd'hui (comportement
  historique préservé, y compris le repli « aucune salle reconnue »).

**Stabilité du contexte** : l’index, les exemples et les accroches propres à
chaque module restent séparés de l’état volatil. Les procédures spécialisées
sont consultables par domaine ; le système permanent reste indépendant de la carte. Toute
validation de changement de prompt ou de contenu comprend
`npm run playtest:mock`, qui doit réussir avec les seuils actuels de
`scripts/CLAUDE.md`. Les résultats de la vague sont dans le registre canonique ;
les anciens chiffres du pipeline supprimé ne sont plus des critères acceptables.

## Tests

- `tests/adventure-modules.test.cjs` (boucle sur tout le registre) — étendre :
  - chaque aventure a ≥ 1 map ; chaque room référence un mapId existant ;
  - les zones/entryCells/encounters/cells de PNJ tiennent dans la grille de
    **leur** map (plus dans une grille globale) ;
  - roomIds uniques sur TOUT le module (décision n°4) ;
  - chaque `MapTransition` référence des maps existantes, une `arrivalRoomId`
    sur la map de destination, une `arrivalCell` dans sa zone, des
    `companions` existants ;
  - chaque `ObjectiveCheck` référence des entités existantes (encounterId,
    npcId, roomId, item du module) ;
  - une image de battlemap par map, PNG réel, dimensions multiples exactes de
    la grille de SA map (l'exception Grammy's documentée dans
    adventures/CLAUDE.md reste une exception).
- **Fixture multi-map** dédiée aux tests moteur (2 maps minimales, 1 quête,
  1 transition avec compagnon) — enregistrée uniquement côté tests, pas dans
  `ADVENTURES`/landing. C'est elle qui valide `travel_to_map` :
  refus quête incomplète, refus en combat, refus retour arrière, complétion
  partielle vs totale, compagnon transféré, PNJ non-compagnon abandonné,
  round-trip `replace_game_state` de `currentMapId`/`mapOutcomes`/`npc.mapId`,
  bornes de déplacement qui changent avec la map.
- `tests/no-module-leaks.test.cjs` doit rester vert : aucun vocabulaire de
  module dans lib/, components/, app/, mcp-server/.
- Validation de chaque phase : `npm run typecheck` + `npm test` (suite actuelle,
  aucun appel payant). `npm run playtest:mock` en plus dès que prompts ou
  contenu bougent.

## Découpage en phases (ordre d'implémentation)

Chaque phase laisse le repo vert (typecheck + tests + playtest inchangé).

- **Phase 1 — Modèle de données** : types ci-dessus dans `lib/adventure-map.ts`
  et `lib/types.ts` ; migration des deux `map.ts` existants en aventures
  1-map ; `replaceState` étendu ; accesseurs nouveaux (`gridForMap`,
  `inferRoomIdOnMap`, complétion de quête) ; tests de registre étendus.
- **Phase 2 — Moteur** : bornes dynamiques (`rules.ts`, `player-tools.ts`),
  inférence de salle par map, tool `travel_to_map` + lecture d'état de quête,
  fixture multi-map + tests moteur. `npm run build:mcp` avant les tests.
- **Phase 3 — App/UI/Prompts** : `battlemaps` par map dans les definitions,
  sélection d'image/grille par `currentMapId` dans app/game/page.tsx, blocs
  dynamiques quête + `mapOutcomes` dans prompts.ts, parseur `# Carte` dans
  context-loader. Playtest byte-à-byte identique sur les aventures 1-map.
- **Phase 4 — Contenu** : première vraie aventure multi-map (créée ou adaptée
  d'un module préfait fourni par l'auteur — hors périmètre de ce document,
  suivra adventures/CLAUDE.md « Ajouter un module »).

## État d'avancement

### Vue de combat locale et terrain autoré

`definition.ts.combatViews` peut fournir une image et une fenêtre de cases pour
une salle d'une map existante. La grange de Greenfast utilise ainsi une vue
strictement verticale de 10 × 9 cases, couvrant x=12–21 et y=13–21, dès que
l'état moteur passe en combat dans la salle 15. La fenêtre est recalculée à la
reprise ; aucune téléportation ni transition narrative ne lui est associée.
Les clics, pions, sorts et masques conservent les coordonnées globales. Si un
combattant vivant sort du cadrage, la battlemap complète reprend le relais ;
la fin du combat rétablit l'illustration d'exploration.

`map.ts.maps[].terrain` décrit des groupes de cases nommés : `blocked` interdit
le passage et `difficult` coûte deux unités de mouvement par case au lieu
d'une, diagonales comprises. Le pathfinding choisit le trajet de moindre
coût. Aperçu, budget, trajet partiel et interruptions de réaction partagent
ces coûts. La carte dynamique du MJ affiche les cases et leurs effets ; les
hachures dorées de l'interface signalent le terrain difficile. Les animaux
de cette grange occupent des stalles infranchissables autorées.

`maps[].roundEvents` décrit des fuites environnementales autorées, résolues à
la fin d'un round par `advanceTurn` (dont les tours de monstres explicitement
demandés). Pour la grange, `barn_horse_escape` se produit après le round 1 :
trajet fixé vers la double porte, ouverture des battants, 1d4 contondants par
créature sur le trajet et condition `prone`, sans sauvegarde supplémentaire.
Les défenses et immunités sont respectées. Joueur, monstres et PNJ avec bloc
SRD sont touchés sans choisir de cible depuis du texte ni créer de combattant.
`sceneMemory.roundEvents` conserve le reçu, les jets et les victimes : aucune
répétition après hydratation ou lors d'un autre combat. Les outils de tour
exposent les nouveaux résultats ; la narration reçoit les mêmes faits.

Un terrain `untilRoundEventId` cesse de bloquer après l'événement : la stalle
du cheval devient libre, celle de la vache reste occupée. La vue tactique peut
déclarer `afterEventImages` ; la variante ImageGen sans cheval est sélectionnée
depuis le même reçu persistant. Les PNJ narratifs blessés conservent leurs PV
et états optionnels dans `NpcState`, y compris via `replace_game_state`.


### Seuils de portes sur une même carte

`AdventureMapData.doors?` décrit des portes physiques, distinctes des transitions
entre cartes : identifiant, nom, deux côtés (`roomId`, `cell`, direction vue de
cette salle), état initial, DD de force optionnel et côté éventuellement barré.
Les deux côtés doivent appartenir à des salles distinctes de la même carte ;
chaque case doit réellement être inférée dans sa salle (test de registre).

`move_token(doorId, doorMode="approach")` choisit la case du côté actuel.
`interact_door` vérifie la portée (une case maximum) avant toute mutation ou
consommation de dé ; forcer utilise le DD déclaré, sinon 15. Ouvrir/forcer ne
déplace pas le joueur. `move_token(doorMode="cross")` exige une porte ouverte
ou brisée à portée et rejoint le côté opposé. Les états survivent à la sauvegarde
et à `replace_game_state` via `sceneMemory.doorStates`. Une porte brisée ne peut
pas être refermée. Le premier module équipé est celui par défaut ; les modules
sans `doors` conservent leur navigation existante. Cela ne constitue pas un
calculateur global de chemins/murs pour les déplacements par coordonnées.

Le modèle IA distingue l'approche du franchissement et choisit les outils et
leurs arguments. La route n'interprète pas le message joueur et ne réécrit pas
les appels. Le budget autorise l'approche et le franchissement de la même porte
sur la base des appels structurés réussis. Les prérequis sont validés par MCP.
Une approche n'active pas automatiquement de rencontre. Les seuils et leur
état courant sont fournis dans la carte dynamique, sans modifier le système
en cours de tour.

- [x] Phase 1 — Modèle de données (maps/quêtes/transitions, GameState.currentMapId + mapOutcomes, round-trip replaceState)
- [x] Phase 2 — Moteur (`travel_to_map`, bornes dynamiques par map, garde ENCOUNTER_WRONG_MAP)
- [x] Phase 3 — App/UI/Prompts (battlemapImages par map, blocs dynamiques quête/mapOutcomes, parseur `# Carte`)
- [x] Phase 4 — Contenu multi-map réel : `adventures/fey-shadow-fair/` (2 cartes, quête à objectifs requis/optionnels, compagnon, 2 battlemaps générées, 6 monstres fey SRD ajoutés au bestiaire commun, tests moteur dédiés)

Écarts assumés par rapport à la cible initiale : la « fixture de test » de la
phase 2 est remplacée par le module réel (fey-shadow-fair) ; l'union
`MapOutcome.completion` est en anglais (`partial`/`total`) comme le reste des
types ; l'intro de carte (`# Carte`) est injectée dans le bloc DYNAMIQUE (pas
statique) pour conserver un système permanent stable par aventure et personnage.

### Illustration d’exploration de la foire Fey

La carte `fair` de `fey-shadow-fair` utilise une illustration ImageGen dans
`public/adventures/fey-shadow-fair/fair-aerial.png`, avec neuf repères numérotés
et les mêmes boutons dans la légende. Leur position vient du centre des zones
de `map.ts` (24 × 16), exportées dans `output/imagegen/fey-fair-layout.json`
pour la génération. `geometry.json` est vide : aucune ancienne image ni
géométrie déduite de l’illustration n’a servi de référence. Le prompt conservé
est `adventures/fey-shadow-fair/fair-aerial.prompt.txt`.

Les clics envoient une demande de déplacement au MJ via `AdventureScene` ;
l’agent choisit toujours ses outils et le moteur valide le trajet. Le repère
du portail demande seulement de l’approcher, sans franchissement ni changement
de carte implicite. Ces repères sont disponibles uniquement depuis les salles
de `fair` ; la carte `wood` conserve son affichage et les combats utilisent
toujours les battlemaps tactiques existantes. Le JSON exporté est un instantané
de génération, pas une seconde source de vérité mécanique.

### Frontière agent/moteur (audit octobre 2026)

Les tables regex de navigation (`namedLocationCells`, `roomNavigationAliases`,
`roomContextAliases`, `doorTransitions`, `forwardTransitions`) et leurs
résolveurs de texte ont été retirés du registre et des trois modules. L’IA
utilise les salles, coordonnées, cloisons, seuils `doors` et transitions
identifiées de la carte dynamique. Le moteur ne parse ni message joueur ni
`reason` pour décider d'une destination. Une demande incomplète/ambiguë est
refusée et renvoyée au modèle ; aucune transition unique n'est choisie par défaut.

## Brouillard de guerre et commandes de porte

`AdventureMapSpec.fogOfWar: true` active le brouillard par pièce sur une battlemap, réutilisable sans nom de campagne dans les composants. `MapFog` découpe le masque opaque depuis `roomsVisited` et la position courante autoritaires, avec les empreintes exactes `areas` ou `zone`. Les pièces visitées restent découvertes à la reprise et entre niveaux ; ouvrir une porte sans entrer ne découvre pas la pièce voisine. Les noms, destinations cliquables, monstres et effets spatiaux inexplorés sont filtrés. Ce masque est une présentation côté client, pas un mécanisme de confidentialité du contenu envoyé au navigateur. Pour une scène d’exploration illustrée dont les repères ne suivent pas la grille, utiliser une battlemap pour bénéficier de ce masque.

`roomDoorActions` propose chaque porte de la salle courante, avec une approche tant qu’elle est hors de portée ; à portée, le bouton demande une ouverture ordinaire puis un franchissement explicite (ou seulement le franchissement si déjà ouverte). Les portes exigeant de forcer demandent un choix distinct. Les mêmes commandes apparaissent sous les illustrations et sur les battlemap tactiques ; les escaliers locaux sont proposés de la même façon. Le clic envoie un message au MJ, jamais un appel MCP fabriqué par le serveur.

`AdventureMapData.layoutMigrations` décrit les translations des zones lors d’une refonte. `migrateMapLayout` migre une fois les anciennes positions, PNJ, objets et effets, au chargement SQL et à l’hydratation moteur. Les identifiants appliqués sont dans `sceneMemory.layoutMigrations` ; les nouvelles parties les portent dès leur création.

## Contexte local et alerte des rencontres

Les butins du deuxième lot MCP sont conservés dans `dmTools.treasures` avec
leur `mapId`, `roomId` et case : inspection et collecte ne portent que sur la
map/salle courante, et un éventuel conteneur lié doit être local à la même
case. La bourse `dmTools.wallet` et les reçus de paiement suivent le personnage
pendant les transitions, sans nouveau crédit ni réinitialisation des butins.

En tactique, le MJ reçoit aussi les notes confidentielles des salles directement
reliées de la **map courante**, avec une projection distincte des cases en ligne
de vue à travers les passages ouverts. La présence dans le contexte ne visite
ni ne révèle une salle ou un PNJ caché. `fogReveal: "open-door"`, lorsqu'il est
activé, mémorise une salle aperçue depuis une vraie ligne de vue, même à distance
du seuil ; les autres politiques de brouillard restent fondées sur les visites.

Le modèle peut appeler `react_to_noise` pour une rencontre locale encore inactive :
alerte d'abord, investigation lors d'une action résolue ultérieure, puis engagement
éventuel. `sceneMemory.encounterAwareness` conserve la map, les positions, les
vitesses et les activations. Les acteurs d'une autre map ne bloquent pas la grille
courante. Les positions des investigateurs sont réutilisées au déclenchement,
sans déplacer le joueur vers l'ancien placement de rencontre. Les renforts d'un
combat actif entrent uniquement sur appel explicite du modèle. Le contrat et ses
limites figurent dans `docs/navigation-and-battlemaps.md`.

## Profils sociaux entre les cartes

Les profils sociaux peuvent être définis par rencontre (`socialProfile`), en
priorité sur l’espèce. Le Bois-Ricanant conserve les buts et traits imposés de
ses six rencontres et ajoute des détails secondaires tirés une fois pour
chaque créature. Les 15 profils suivent leur identité canonique avant et après
le spawn ; les profils des PNJ et compagnons traversent sans nouveau tirage.
La reprise complète les nouveaux profils manquants avec la graine sauvegardée.
Le contexte MJ reste limité à la carte et aux salles locales : les profils du
bois ne sont pas révélés sur la foire. Voir docs/social-interactions.md.

## Ouvertures permanentes sans porte

Un seuil `AdventureDoor` peut porter `opening: true` : il représente alors un passage vide, toujours ouvert, même si une sauvegarde ancienne conserve un état fermé. `savedDoorState` (navigation et interface) et `getDoorState` (moteur) appliquent cette même priorité. Le moteur refuse fermeture et forçage avant tout coût ou jet ; ouvrir un passage déjà libre est un no-op. Les boutons affichent « Passage » et demandent uniquement son approche ou sa traversée. Cette option reste générique ; les salles et seuils restent autoritaires pour les murs, le déplacement et la découverte. Les deux cartes du manoir l’activent pour leurs accès vides ; seules les deux grilles de cellules conservent un seuil fermable. Elles restent strictement vues du dessus, avec leurs grilles et leur brouillard rectangulaires habituels.

## Cité des Morts : exploration nocturne

La carte finale `rest` de `sarah-of-yellowcrest-manor` déclare `scenes.rest` : une vue aérienne nocturne (`cemetery-night-aerial.png`), clair de lune, lanternes et brume. Trois repères et leurs boutons de légende désignent l’allée (salle 33), les quatre tombes des serviteurs (34) et le mausolée consacré (35). Ils sont accessibles depuis les trois salles, y compris à la reprise ; le composant existant les désactive pendant une requête. La sélection envoie uniquement une demande de déplacement au MJ. Le mausolée fermé arrête le trajet devant sa porte ; l’ouverture, l’entrée, le dépôt de l’urne et les adieux restent des choix explicites distincts. Les règles de navigation et la battlemap interne restent celles de map.ts. Cette illustration ne déclenche aucune cérémonie ni apparition et ne modifie pas le temps moteur. Le prompt de génération et sa révision nocturne sont conservés dans `adventures/sarah-of-yellowcrest-manor/cemetery-imagegen-prompts.txt`.


### Grammy : deux vues et passage aller-retour

Grammy conserve une carte mécanique `bakery` et deux visuels :
`public/adventures/grammys-country-apple-pie/bakery-exterior.png` pour
l’exploration des salles 1–3 et `public/battlemaps/grammys-interior-topdown.png`
pour la tactique intérieure (également utilisée en combat extérieur).
La porte `front` commande le franchissement ; revenir dehors rétablit
l’illustration. Aucun `travel_to_map` ni abandon de carte n’est nécessaire.
Le toit de la vue extérieure masque les pièces : pas de polygones de
brouillard hérités de l’ancienne illustration sans toit. Les repères restent
des intentions envoyées au MJ. Les coordonnées et la géométrie du plan
précédent sont conservées ; le nouveau plan tactique a été généré depuis
cette référence et revu pour conserver les seuils et les emprises.

Le cadrage `tacticalViews` de Grammy zoome sur x3–13, y4–12, hors combat
comme en combat intérieur. Les coordonnées restent globales ; une poursuite
avec un combattant hors cadre rétablit la carte complète.

La vue intérieure utilise `grammys-interior-rooms-hd.png`, image locale de
1386×1134 correspondant exactement au viewport de 11×9 cases. Le fond de
Battlemap remplit ce viewport ; il ne faut pas lui passer l’image complète
de 17×15 cases pour cette vue.

Le fond extérieur de la vue intérieure est illustré et flouté ; les pièces
restent nettes. La résolution du PNG est indépendante des coordonnées
mécaniques : 126 pixels par case pour le viewport 11×9.

Les préparations MCP supplémentaires restent dans la même session : repaires,
contaminations et pièges complexes portent leur `mapId`/salle ; les ambiances
lumineuses sont indexées par map et salle. Le combustible continue à s'écouler
quand une source est rangée ou hors map, sans éclairer la map actuelle à distance.
Parchemins, valeurs possédées et afflictions du joueur suivent le personnage.
Une sphère arrêtée contre sa porte sud bloque seulement cette porte sur sa map,
y compris dans le pathfinder et les outils d'ouverture/forçage. Aucun de ces
outils ne change l'aventure ou le personnage fixés au spawn.

Le transport en prise résout deux trajectoires sur la carte active avec
`move_grappled_creature`. Il ne crée pas de compagnon ni de transfert implicite
d'un combattant vers une autre carte. `travel_to_map` refuse
`GRAPPLE_MAP_TRAVEL_UNSUPPORTED` pour une prise active suivie dans `hero.effects`
ou `monsterEffects` impliquant le joueur. Le seul ancien marqueur `grappled`
ne déclenche pas ce nouveau refus ; les validations habituelles de mobilité
et de portée des escaliers restent applicables. Le détenteur exact, joueur ou
monstre, peut libérer son effet via `combat_action(release_grapple)` ; cela
n'accorde ni soin ni action. Libérer ou échapper à la prise précède le voyage.
Le refus intervient avant temps, archivage et mouvement. Voir
[transport en prise](grapple-transport.md).

Les réserves de PV temporaires et reçus restent des états persistants du
bénéficiaire ; le voyage ne les renouvelle pas. Les déclarations de couverture
restent liées à leur carte et à leurs cellules, sans bonus appliqué à une autre
carte qui partagerait les mêmes coordonnées. Ces mécanismes ne changent ni
l'aventure ni le personnage figés au spawn.

Le Bois-Ricanant utilise désormais /battlemaps/fey-shadow-fair-wood-zelda.png (1024×1536), une illustration peinte générée avec imagegen. Sa grille reste 16×24 et cellSize reste 64 : la résolution de l'illustration ne change pas les coordonnées moteur. AdventureMapSpec.imageRendering permet de choisir auto pour cette peinture, en conservant le rendu pixelated par défaut des autres cartes. L'ancienne illustration reste disponible.

### Échéances de nutrition et passages

Un passage conserve le registre de nutrition de la même partie et son horloge. Si une journée est réellement due, travel_to_map la refuse avant la transition ; le MJ doit demander explicitement resolve_survival_day, puis reprendre le voyage. Aucun nouveau jour, repas ou appel MCP n'est créé par le changement de carte. Le précontrôle du temps du passage s'applique aussi avant les mutations. Voir [nutrition](survival-nutrition.md) et le [suivi canonique](suivi-integration-mcp.md) pour la validation de cette tranche.


Les KO stables avec un véritable dé de récupération enregistré peuvent récupérer
1 PV à leur échéance dans les archives `floorMonsters`/`retiredMonsters`, sans
réactivation sur la carte, changement de rôle ou initiative inventée. Un corps
sur la carte active mais absent du roster d’un autre combat garde un refus
explicite avant une échéance qui lui donnerait un rang inconnu. Le suivi de pause
du poison/sommeil sprite se conserve dans les archives. Le raccord W7 termine
les fournisseurs héroïques et de monstres à leur échéance réelle, reprend les
afflictions sur la référence archivée, puis expire leurs symptômes dans l'ordre
du temps. Il ne change ni position, token, carte active, initiative ou état de
vie. Un cache de l'étage courant ne remplace jamais l'acteur actif ; les
`retiredMonsters` restent également accessibles au seul bookkeeping interne.
Les cures, expositions, attaques et déplacements continuent de sélectionner
des acteurs actifs. Les éventuels jets de mort de PNJ archivés réellement dus
suivent leur contrat séparé de cycle de vie, pas une activation sur la scène.
Les anciens historiques de pause inconnus restent refusés sans reconstitution.
La limite W6 sur la fin d'un fournisseur de pierre déjà archivé est donc
remplacée par ce contrat W7 ; elle ne s'applique plus au raccord courant.
Voir [petrified-afflictions.md](petrified-afflictions.md). Le raccord W7 n'est
pas couvert par les preuves W6 : ses résultats privés B sont décrits dans le
guide, séparément de l'intégration W7 du cycle PNJ à 0 PV. Voir aussi
[nonlethal-recovery.md](nonlethal-recovery.md).

Les profils sociaux partagés entre scènes conservent leur identité et leur
personnalité ; les interactions appliquent exclusivement la procédure DMG 2014
(attitude choisie par le MJ et table de réaction), voir [interactions sociales](social-interactions.md).

### Historiques d'avalement et vol achevé

Un épisode d'avalement encore actif, y compris dans un cadavre, exige une
sortie physique explicite avant le passage. Après cette sortie, l'historique et
les observations de taille restent dans la même session. Leur validation lit
le corps actif, puis son archive `retiredMonsters`, puis les `floorMonsters`
d'une autre carte ; un cache de la carte courante ne supplée pas le corps actif.
Cette lecture ne réactive aucun acteur et ne permet pas de cibler une archive.
Les tailles sources restent vérifiées lors de la restauration SQL.
Lors d'un retrait de combat, `removeMonster` conserve aussi dans
`retiredMonsters` le vrai corps référencé par une observation de taille, une
morsure ou un épisode Swallow, même sans épuisement. Aucun historique n'est
effacé pour rendre une sauvegarde valide ; une observation de taille dont le
vrai corps manque de toutes les archives reste refusée. Les régressions `swallow-archive`,
`swallow-retired` et `swallow-retention` couvrent ces transitions publiques.

Un vol natif doit aussi avoir sa réception physique achevée avant le voyage.
Un atterrissage suivi de marche conserve son historique terminé pendant
l'archivage, la restauration SQL et le retour sur la carte. Le passage ne
redonne ni déplacement, altitude ni vitesse. Voir [avalement](purple-worm-swallow.md)
et [vol natif](native-flight.md).

### Sommeil naturel et options Xanathar

Le sommeil naturel observé conserve son fournisseur et son épisode. Les corps
nécessaires à un épisode actif restent dans les vraies archives de carte ou de
retrait ; leur lecture de validation ne les réactive pas. Secousse et bruit
choisissent des corps actifs et leur contexte présent. Une même projection de
deux occupants avalés ne prouve aucune distance ni acoustique intérieure.

Les politiques optionnelles de sommeil suivent la session et son horloge.
Un passage ne crée ni long repos, réveil, remise à zéro de privation ou dette
antérieure à l'adoption. Les échéances dues demandent leurs résolveurs explicites
avant de poursuivre le temps. Voir [sommeil Xanathar](xge-sleep.md).

<!-- BEGIN:W22-PHYSICAL-AND-CALENDAR -->
### Descente active et calendrier de campagne

Les options [Xanathar de chute](xge-falling.md) sont explicitement adoptées,
séparément du socle PHB. Dans cette tranche, le curseur concerne uniquement un
corps déjà réellement en vol natif W20, dans le repère de la carte actuelle.
Le support d'arrivée appartient à cette même carte. Une descente active doit
être résolue avant une transition de carte, suppression de ce corps ou fin de
rencontre ; aucun transport vertical entre deux repères de cartes n'est déduit.
Un corps décédé peut conserver son seul créneau physique jusqu'à l'impact,
sans droit d'action, nouvelle initiative ou sauvegarde. Les départs de chute
depuis saut/locomotion/météo non représentés restent refusés explicitement.

Le [calendrier de campagne](campaign-calendar.md) projette uniquement le temps
moteur réellement écoulé depuis une ancre MJ explicite. Une transition de carte
ne change ni cette ancre ni les compteurs de repos, nutrition ou sommeil.
Les références datées restent des informations MJ ; aucune entrée sur une carte,
observance ou échéance narrative ne crée automatiquement un effet mécanique.
<!-- END:W22-PHYSICAL-AND-CALENDAR -->

<!-- BEGIN:W23-PHYSICAL-SOURCE-AND-WORKSITE -->
### Corde, observation initiale et lieu de travail

Une [boucle de corde qualifiée](knots.md) sur le joueur suit sa position et sa
carte en gardant sa masse et son identité ; un nœud posé reste sur sa carte et
case d'origine. L'inspection ne transporte rien. Une tentative exige sa portée,
son support et la qualification physique actuels ; aucun intérieur, ligotage
hostile, charge ou parcours vertical de corde n'est déduit.

Les [observations d'incantation](spell-perception.md) conservent la
carte, les positions, composantes et sens au début réellement observé. Voyager
ou revenir ne recrée pas cet instant et ne révèle pas son résultat futur.
Géométrie élevée, intérieurs et détail par un sens non visuel restent bornés
aux limites du guide de domaine ; aucun rayon d'audibilité universel n'est créé.

Le [travail Xanathar](xge-downtime-work.md) reste lié à son vrai employeur et
lieu de travail. Une transition ne fournit aucun effort à distance et ne change
ni l'époque moteur fixe de ses journées, ni l'horloge, ni les dettes de repos ou
nutrition. Le calendrier W22 reste une projection indépendante des libellés de
dates. Les jours peuvent être discontinus ; au-delà de la durée bornée, une
prolongation exige l'arbitrage MJ explicite, sa complication et son coût choisi.
<!-- END:W23-PHYSICAL-SOURCE-AND-WORKSITE -->

<!-- BEGIN:W24-LIGHT-TRAINING-CHASE-SITES -->
### Sources de Lumière et activités à leur lieu réel

La [source de Lumière](light-spell.md) dérive sa position et sa carte du même
objet de scène mesuré ; aucun second jeton ou objet d'inventaire n'est créé.
Son transport utilise les procédures physiques existantes, leurs mains, leur
masse et leurs destinations. Les murs et la couverture réelle bloquent les
rayons. Le toucher, les géométries élevées et les intérieurs restent bornés au
périmètre explicitement annoncé par le guide, sans point optique déduit.

La [formation Xanathar](xge-training.md) exige la présence et le lieu réels de
l'instructeur retenu. Voyager, attendre ou changer le libellé du calendrier ne
produit pas d'instruction. Les dates sont calculées sur l'horloge moteur ; leur
budget physique est partagé avec Work et l'artisanat/formation PHB représentés.
Les vrais frais, accords, efforts et complications restent conservés dans SQL.

Une poursuite urbaine DMG reste sur la carte actuelle au sol coplanaire, avec
les vrais corps et leurs positions. Cette tranche ne transporte pas la poursuite
entre cartes et n'invente pas de distance de rapprochement ou de trajet. Les
complications attendent leur qualification physique exacte ; le déplacement de
vingt pieds déclenchant la ligne 9 est distinct du coût du terrain difficile.
Les lignes de nature encore non représentées, poursuites multiples et nouvelles
capacités MM restent reportées. Aucune transition ou narration ne résout automatiquement un événement.
<!-- END:W24-LIGHT-TRAINING-CHASE-SITES -->

W32 étend la même poursuite aux lignes de nature1/2/4/5/8 du DMG, sur la
carte actuelle et une route simple cardinale réellement supportée. Les autres
lignes conservent leur résultat en attente; aucune créature ni destination
souterraine ou de chute n’est créée. L’aveuglement par particules de la ligne5
reste attaché à la vraie fin du tour affecté, même après arrêt de la poursuite:
un départ de carte ou une sortie d’initiative doit attendre cette frontière
pour un corps vivant. Une mort réelle clôt ce fournisseur sans bloquer les
autres corps. Il n’existe aucune poursuite transférée automatiquement.
Un corps vivant stabilisé à zéro PV conserve aussi son vrai créneau passif
d’initiative tant que ce fournisseur de poussière attend la fin de son tour.
Ce créneau n’accorde aucune action au corps inconscient ni nouveau dé de
poursuite ; sa vraie fin ferme seulement ce fournisseur et son historique,
sans retirer un autre aveuglement. Cette frontière reste requise avant départ.

Une cadence générale de rencontres DMG éventuellement adoptée reste attachée
à sa carte réelle. Le MJ doit la terminer explicitement avant tout changement
de carte ou entrée en combat; un contrôle déjà dû conserve son identité et
doit d’abord être résolu. Cette limite de W33 évite d’inventer un contrôle hors
carte ou une reprise de round. Les contrôles et propositions documentaires
restent persistés après l’arrêt; le voyage ne les transforme pas en créatures
ni en combat. Voir [rencontres aléatoires](random-encounters.md).

### W34 — concours optionnel Shove Aside tenu

Un vrai concours `combat_action` avec `shove: aside` conserve sa source DMG2014, ses deux corps, son tour, son jet et sa case latérale choisis. Tant qu’un choix de réaction sur ce concours est en attente, `end_combat` et `travel_to_map` refusent avant transfert ou archivage. Résoudre explicitement cette même fenêtre suffit à lever la garde ; aucun déplacement, tour ou appel MCP n’est fabriqué pour quitter la carte. Les autres bousculades conservent leur procédure existante.

W35 — Overrun optionnel : un concours tenu ou sa réaction réelle avant entrée conserve la carte et le tour sources ; fin de combat et transition de carte refusent tant que cette fenêtre est ouverte. Une permission gagnée sans fenêtre ouverte expire avec son vrai tour. La tranche reste dans une même salle, sur trois cases physiques explicites, et n’enrôle aucun corps ni événement de l’autre côté d’une frontière. Le contrôleur de traversée ne publie jamais une position d’arrêt dans la case hostile ; les réactions non représentées à cet endroit sont refusées avant coût ou dé.

W36 — Tumble optionnel conserve ses propres fenêtres et sa carte/tour source, sans migrer les reçus Overrun. Les mêmes refus de transition avant résolution des concours/OA réels s’appliquent ; une permission inutilisée sans fenêtre expire avec son tour. Les trois cases explicites restent dans une même salle. Les continuations movement/engine-effect ne peuvent porter simultanément overrunId et tumbleId, ni remplacer une permission gagnée par l’autre mode.

W37 — Cleaving Through Creatures (première tranche) retient la carte, la cellule et le vrai tour de l’attaque d’origine. Un jet initial tenu ou un choix de carry/stop bloque les transitions avant coûts/durée/XP (validateEndCombat avant nettoyage), le tour suivant et un autre déplacement. Chaque victime est choisie explicitement en portée de l’attaquant, pas de la précédente ; aucune arrivée ou cible d’une autre carte n’est déduite. L’arrêt utilisateur explicite reste disponible pour abandonner uniquement le surplus non appliqué. La mort/incapacité réelle ferme le curseur avec son témoin, sans restaurer dégâts/ressources ni inventer un choix du joueur.

Les fosses XGE physiquement qualifiées conservent leur canevas, leur vrai fond dix pieds plus bas et le corps qui y est tombé. Une transition de carte ne remonte pas ce corps gratuitement : il doit atteindre un vrai support de sortie par une procédure représentée. Cette garde porte seulement sur le corps effectivement transféré ; elle ne déplace ni ne bloque automatiquement les PNJ laissés sur la carte. Une fosse ancienne non qualifiée ne crée aucune hauteur rétroactive.


## Continuité PNJ explicitement observée

Un PNJ atteint de fièvre hilare peut rester sur sa vraie carte après `declare_npc_separation` pour la transition choisie. Le voyage conserve son corps et ses délais ; aucune activité ou repos hors carte n’est inventé. Au retour réel, les symptômes échus exigent leur résolution explicite, sans remise à zéro. Les compagnons autorés restent distincts. Les repos PNJ sont prospectifs et sur la carte active : voir [Continuité et repos PNJ](npc-continuity-rest.md).

### Escortes et alliés recrutés — W39 Sarah

`travel_to_map` accepte `partyCompanions: [{ npcId, arrivalCell }]` pour les
compagnons réellement déclarés. Chacun doit pouvoir marcher, être présent à
portée du départ actuel et avoir une case libre distincte dans la pièce
physique d'arrivée. Un PNJ éloigné ou seulement helpful ne suit pas le joueur.
Les escaliers conservent le même corps et ses PV ; les anciennes copies de
combattant de ces PNJ sont retirées des archives d'étage afin de ne pas
remplacer leur état réel au retour. Le passage ne recharge aucune ressource.

Sarah utilise cette sélection explicite pour le départ final et les escaliers.
La sécurité des captifs est une arrivée attestée au vestibule après un vrai
trajet, distincte de leur accord ou de l'ouverture de la cellule. Les autres
transitions autorées conservent leur liste historique de compagnons.
Les maladies et échéances des PNJ restés sur leur carte gardent la procédure
de séparation et de réconciliation existante. Les arrivées qualifiées portent
leurs propres reçus persistants, sans simuler une activité hors champ.

Source : DMG 2014, page 92, « NPC Party Members » ; conventions de rôle
civil/allié et de géométrie explicite approuvées par l'utilisateur.
Voir [compagnons PNJ](npc-party.md).


## Journal des objectifs communiqués

Le [journal générique](objective-journal.md) reste séparé des conditions
internes `mapQuests` qui autorisent les sorties. `applyMapTravel` fige les
objectifs déjà connus de chaque carte quittée dans
`objectiveJournal.closedMaps`, avant le transfert de l’état physique. Les
passages réversibles entre étages ne les figent pas. Les propositions pour
une carte future restent actives ; une carte définitivement quittée refuse
toute nouvelle révélation ou quête inventée. Les instantanés et les sources de
communication survivent au chargement SQL. Aucun voyage ne fabrique de propos,
d’acceptation, de récompense ni de nouvelle condition de passage.
