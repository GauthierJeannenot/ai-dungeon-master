# Donjons aléatoires dans une partie existante

Le donjon est une carte supplémentaire de la **même session, aventure et personnage**.
Sa création ne téléporte personne et ne ferme aucun acte de la campagne.

1. L'IA choisit `generate_dungeon` avec une graine, des dimensions et un nombre
   de tuiles. Le plan et sa validation restent documentaires.
2. L'IA appelle `install_dungeon({dungeonId,layout,entranceCell,questLink})` hors
   combat, à une entrée réellement accessible dans la salle courante. Le moteur
   valide le plan, l'emplacement, l'unicité et les références de quête fournies.
3. Le joueur décide d'entrer ; l'IA choisit explicitement le `transitionId`
   d'entrée avec `travel_to_map`. La sortie utilise un autre identifiant explicite,
   au même seuil intérieur. Aucun repos, soin ou réinitialisation de ressources.

`questLink` est obligatoire : `goal` nomme l'objectif principal réel du joueur,
`lead` fournit une piste concrète, `delivery` choisit `clue` ou `npc` et
`discoveryDc` fixe le DD de fouille. `targetMapId` + `objectiveId` peuvent lier
une condition structurée de campagne ; `targetNpcId` peut désigner un PNJ déjà
autoré. Les références inexistantes sont refusées. Pour les quêtes seulement
narratives, l'IA prend l'objectif dans le module et les faits acquis : aucun
parseur serveur n'essaie de déduire une quête du texte du joueur.

Ces ambiances, occupants légers et pistes sont du **contenu maison** du projet,
pas une exécution complète des tables du DMG. Les occupants utilisent les blocs
SRD locaux de gobelin et squelette ; l'IA décide explicitement d'engager leurs
rencontres via `start_encounter`. Le guide éventuel utilise le bloc commoner,
sans déplacer ni remplacer le PNJ de campagne auquel la piste peut renvoyer.

La salle d'objectif contient soit l'indice, soit le guide. `discover_dungeon_lead`
avec `action: search` effectue un test atomique d'INT (Investigation) au DD stocké ;
Inspiration bardique reprend le même dé après sauvegarde. `action: talk` exige
le guide réel, visible, vivant et consentant au contact. L'échec ne révèle pas
la piste. La réussite enregistre un indice durable (`basis: ai_interpretation`),
le rappelle après le retour et accomplit uniquement l'objectif de découverte du
donjon. Aucune quête principale, récompense, disposition ou preuve n'est validée
automatiquement. `reveal_clue` ne contourne pas ce résolveur pour ces indices.

La géométrie logique utilise un stencil conservateur de **7 × 7 cases de cinq
pieds par tuile** : axe de couloir d'une case, bras vers les seuls raccords
ouverts, espace central de trois cases pour la tuile salle. Les murs bloquent
réellement navigation et vue. La géométrie porte une source `procedural` v1 ;
elle n'est pas présentée comme une extraction approuvée des pixels au crayon.
La battlemap assemble les six PNG avec leurs rotations ; grille et brouillard
utilisent les mêmes coordonnées moteur.

`GameState.dmTools.dungeons` conserve plan, entrée d'origine, lien de quête,
état de découverte et empreinte de création. Le registre moteur/app accepte
un état de session pour composer sa carte sans modifier le catalogue global.
Les autres sessions ne voient jamais ces cartes. Les monstres de chaque carte
utilisent le stockage multi-étages existant ; objets, pièges, bourse, dégâts et
indices survivent aux allers-retours et à la réouverture de session.

Limites : quatre donjons par session, aucun emboîtement d'entrées ; les sorties
restent interdites en combat et nécessitent un seuil accessible. Les pièges
narratifs d'un ancien brouillon demandent une création mécanique séparée et ne
sont pas importés automatiquement. L'équilibrage avancé, les plans verticaux et
la fabrication d'une intrigue complète à partir des tables du DMG restent hors
de ce changement. La cohérence narrative avec la campagne relève de l'IA ; le
moteur valide références, lieux, jets et mutations.
