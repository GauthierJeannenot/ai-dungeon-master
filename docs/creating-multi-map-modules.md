# Créer un module multi-maps (2 cartes et plus) — guide pratique

> **Public** : quiconque crée un futur module d'aventure à plusieurs cartes.
> **Prérequis de lecture** : adventures/CLAUDE.md (anatomie d'un module,
> « Ajouter un module ») puis la section « Modules multi-maps » du même
> fichier. La conception moteur est dans docs/multi-map-adventures.md
> (IMPLÉMENTÉE — ne pas re-litiger les décisions actées).
> **Module de référence à copier** : `adventures/fey-shadow-fair/`
> (« La Foire du Voleur d'Ombres », 2 cartes). Tests de référence :
> tests/mcp-multimap.test.cjs + boucles registre de
> tests/adventure-modules.test.cjs.

## Le modèle mental en 6 règles

Avant d'écrire la moindre donnée, intégrer ces règles (décisions actées avec
l'auteur du projet, 2026-07-04) :

1. **Le moteur MCP est le seul juge du passage à la carte suivante.** Le LLM
   ne fait que *déclencher* `travel_to_map` ; le moteur refuse si la quête de
   la carte n'est pas au moins partiellement complète. Aucun objectif « flou »
   n'est possible : tout objectif est un `ObjectiveCheck` vérifiable dans
   `GameState`.
2. **Transitions à sens unique.** Une carte quittée est perdue à jamais (loot
   raté = raté, PNJ abandonnés = inaccessibles). Concevoir chaque carte comme
   un acte qui se suffit.
3. **Numérotation des salles GLOBALE et continue.** Si la carte 1 a les
   salles 1–5, la carte 2 commence à la salle 6. Jamais deux salles « 1 ».
4. **Chaque carte a sa propre grille et sa propre image de battlemap.** Les
   grilles peuvent avoir des dimensions différentes.
5. **Les PNJ compagnons traversent, les autres restent.** Le sort des PNJ à
   la transition est déclaré dans les données (`transition.companions`),
   jamais improvisé en jeu.
6. **Le contexte des cartes quittées est compressé** : le moteur enregistre
   `mapOutcomes[mapId]` (complétion `partial`/`total` + objectifs remplis) et
   le prompt n'en garde qu'une ligne par carte. Concevoir des cartes peu
   interdépendantes.

## Étape 0 — Conception papier

Pour chaque carte, décider AVANT de coder :

- son `mapId` (court, stable, ASCII : `fair`, `wood`, `crypt`…) — il sert de
  clé partout (quêtes, transitions, battlemaps, `# Carte` du .md) ;
- sa grille (`cols` × `rows`) et ses salles (avec la numérotation globale) ;
- sa **quête de carte** : quels objectifs sont `required` (condition de
  sortie) et lesquels sont optionnels (comptent pour la complétion `total`,
  donc pour la couleur du contexte des cartes suivantes) ;
- sa ou ses **transitions sortantes** : vers quelle carte, quelle cellule et
  quelle salle d'arrivée, quels PNJ compagnons éventuels ;
- la **carte finale** n'a pas de transition sortante ; sa quête sert
  uniquement de contexte au DM (objectif affiché), jamais de sortie.

Chaque objectif doit se traduire en une des quatre conditions vérifiables par
le moteur (liste fermée, `lib/adventure-map.ts`) :

| `ObjectiveCheck.type` | Vrai quand… | Exemple fey-shadow-fair |
|---|---|---|
| `roomVisited` | la salle a été visitée | entrer dans la Tente du Bonneteau |
| `npcDisposition` | le PNJ a la disposition demandée | Madame Bougie `helpful` |
| `encounterResolved` | la rencontre est terminée | tire-goussets réglés |
| `itemInInventory` | l'objet est dans l'inventaire | (aucun usage à ce jour) |

Si un objectif ne rentre dans aucune variante, c'est l'objectif qu'il faut
reformuler — on n'ajoute une variante à la liste fermée que sur décision
explicite (et elle doit rester vérifiable à partir du seul `GameState`).

## Étape 1 — `map.ts` (données moteur)

Suivre la forme de `adventures/fey-shadow-fair/map.ts`. Spécificités
multi-maps par rapport à un module 1-map :

```ts
// maps[0] est la carte de départ ; l'ordre = ordre de progression.
maps: [
  { id: 'fair', name: 'La Foire aux Chandelles', grid: { cols: 17, rows: 15 } },
  { id: 'wood', name: 'Le Bois-Ricanant',        grid: { cols: 15, rows: 13 } },
  // Optionnel : cellSize (px) fixe la taille de case MINIMALE au rendu. Absent
  // = DEFAULT_CELL_SIZE (48). Si la carte tient dans le conteneur, les cases
  // s'agrandissent pour le remplir (letterbox) ; sinon elles restent à cellSize
  // et la carte devient scrollable au cliquer-glisser. Purement du rendu : le
  // moteur ne lit JAMAIS cellSize (ses bornes viennent de `grid`). Générer alors
  // le PNG à ≥ cellSize px/case pour rester net. Voir docs/battlemap-viewport.md.
  // { id: 'grande', name: '…', grid: { cols: 30, rows: 24 }, cellSize: 64 },
],

// Chaque salle porte son mapId (absent = première map, réservé aux modules 1-map).
rooms: [
  { id: '1', name: '…', mapId: 'fair', zone: { … } },
  // …
  { id: '6', name: '…', mapId: 'wood', zone: { … } }, // la numérotation CONTINUE
],

// Une quête par carte (clé = mapId). partielle = tous les `required` ;
// totale = tous les objectifs. label court : il est injecté TEL QUEL au prompt.
mapQuests: {
  fair: { mapId: 'fair', objectives: [ { id: '…', label: '…', required: true,
    check: { type: 'roomVisited', roomId: '4' } }, /* … */ ] },
  wood: { /* carte finale : quête = contexte DM, pas de sortie */ },
},

// arrivalCell/arrivalRoomId en coordonnées de la grille de DESTINATION,
// et arrivalCell DANS la zone de arrivalRoomId (vérifié par test).
mapTransitions: [
  { id: 'firefly_gate', fromMapId: 'fair', toMapId: 'wood',
    arrivalCell: { x: 3, y: 10 }, arrivalRoomId: '6',
    companions: ['barnabe'],           // ids de PNJ existants
    pattern: /\b(portail|vers luisants)\b/ },
],
```

Points de vigilance :

- **Toutes les coordonnées d'une carte vivent dans SA grille** : zones,
  entryCells, encounters (`playerCell`, cellules de monstres), cellules de
  PNJ, `namedLocationCells`. Le test de registre vérifie les bornes carte par
  carte — corriger la donnée, jamais le test.
- Les `doorTransitions`/`forwardTransitions` (déplacements intra-carte)
  restent plates : ne JAMAIS y relier deux salles de cartes différentes — le
  seul passage inter-cartes est `mapTransitions` (via le tool
  `travel_to_map`).
- Un PNJ ambiant (`roomId: null`) doit déclarer son `mapId` explicitement ;
  sinon il est dérivé de sa salle.
- Bestiaire : uniquement des types de `MONSTER_TEMPLATES` (reskin par
  `name`/`hpOverride`), comme pour tout module.
- Toute carte doit être atteignable depuis `maps[0]` en suivant les
  transitions (test de reachability du registre).

## Étape 2 — `definition.ts` (contenu app)

```ts
battlemapImage: '/battlemaps/<id>-<premiereMapId>.png', // = carte de départ
battlemapImages: {
  fair: '/battlemaps/fey-shadow-fair-fair.png',   // une entrée PAR mapId
  wood: '/battlemaps/fey-shadow-fair-wood.png',
},
grid: MON_MODULE_MAP.maps[0].grid, // source de vérité unique : map.ts
```

- `chatPlaceholders` et `roomStatusHints` restent indexés par `roomId`
  (numérotation globale) — rien de spécial au multi-map.
- `promptGuidance.plannerExamples` : inclure au moins un exemple
  `tool=travel_to_map` (la phrase du joueur qui franchit la transition), voir
  fey-shadow-fair.
- Rappel frontière : `definition.ts` n'est JAMAIS importé par mcp-server ;
  tout ce dont le moteur a besoin va dans `map.ts`.

## Étape 3 — `adventure-module.md` (module narratif)

Structure attendue par le parseur (`lib/context-loader.ts`,
regex `^# Carte <mapId> …`) :

```markdown
# Module : <Titre>
## Synopsis                      ← préambule : TOUJOURS dans le prompt statique
## …annexes globales…

# Carte fair — La Foire aux Chandelles   ← l'ID juste après « # Carte » doit
## Points d'entrée et de déplacement       être un mapId EXACT de map.ts
## Salle 1 — …
## Salle 5 — …

# Carte wood — Le Bois-Ricanant
## Points d'entrée et de déplacement     ← une table PAR carte
## Salle 6 — …                            ← la numérotation globale continue
```

- Le préambule (tout ce qui précède la première `# Carte`) est statique ;
  l'intro de chaque carte (le texte entre `# Carte X` et sa première salle)
  est injectée **dynamiquement** quand la carte devient courante — ne pas y
  mettre d'information indispensable aux autres cartes.
- Un module SANS en-tête `# Carte` = module 1-map (comportement historique) ;
  ne pas mélanger les deux formes dans un même fichier.
- Dans la table « Points d'entrée » de chaque carte, documenter la sortie
  inter-cartes comme une ligne `travel_to_map` avec la mention SANS RETOUR
  (voir fey-shadow-fair, carte fair).
- Les `roomHooks` (dans map.ts) des salles charnières doivent scénariser la
  transition : la salle de sortie rappelle au joueur ce qu'il abandonne et
  demande une confirmation (sens unique) ; en cas de refus moteur
  (`MAP_QUEST_INCOMPLETE`), donner au DM une mise en scène du refus (« la
  porte est verrouillée », pas « le moteur a dit non »).

## Étape 4 — Battlemaps

- Une image PNG par carte : `public/battlemaps/<adventureId>-<mapId>.png`.
- Dimensions = multiples exacts de la grille de SA carte (cases carrées) —
  vérifié par test. Exemple : grille 17×15 → 1360×1200 (80 px/case).
- Script générateur par module : copier
  `scripts/generate-battlemap-fey-shadow-fair.cjs` (il génère les deux
  images du module de référence).

## Étape 5 — Enregistrement et validation

1. Enregistrer le module : import dans `lib/adventure-map.ts`
   (`ADVENTURE_MAPS`) et `lib/adventures.ts` (`ADVENTURES` + `AVAILABILITY`).
2. `npm run build:mcp` — indispensable : les `map.ts` sont compilés par le
   moteur ; sans rebuild, tests et dev tournent sur l'ancien binaire.
3. `npm run typecheck` + `npm test` : tests/adventure-modules.test.cjs boucle
   sur tout le registre et vérifie notamment, pour le multi-map :
   - mapIds uniques, roomIds uniques sur TOUT le module, `mapId` de chaque
     salle existant ;
   - zones/entryCells/encounters/PNJ dans la grille de LEUR carte ;
   - transitions cohérentes (maps existantes, salle d'arrivée sur la carte de
     destination, `arrivalCell` dans sa zone, compagnons existants, pas de
     transition vers soi-même) ;
   - chaque `ObjectiveCheck` référence des entités existantes ;
   - toutes les cartes atteignables depuis la première ;
   - une battlemap PNG par carte, aux bonnes dimensions.
   Ne jamais affaiblir un invariant pour faire passer un module — corriger la
   donnée.
4. Si des prompts ou du contenu partagé ont bougé : `npm run playtest:mock`
   et comparer les NOMBRES (23 tours, ratio ≈ 0,348) — le script sort en
   exit 1 même sur master propre, c'est attendu (scripts/CLAUDE.md).
5. Tests moteur dédiés : s'inspirer de tests/mcp-multimap.test.cjs si le
   module introduit un cas nouveau (première transition à compagnons
   multiples, première quête `itemInInventory`…). Pour un module qui ne fait
   qu'utiliser l'existant, les boucles de registre suffisent.

## Ce que le moteur fait tout seul (ne pas le re-coder côté contenu)

Le tool `travel_to_map` (mcp-server/tools/map-tools.ts) valide, dans l'ordre,
et renvoie une erreur `isError` JSON avec un code exploitable par le DM :

| Code | Cause | Narration attendue du DM |
|---|---|---|
| `NO_MAP_TRANSITION` | aucune transition ne part de la carte courante (ou id/pattern non reconnu) | ce passage n'existe pas |
| `TRAVEL_DURING_COMBAT` | combat en cours | on ne fuit pas la scène en plein combat |
| `MAP_TRANSITION_ONE_WAY` | destination déjà quittée (`mapOutcomes`) | le chemin du retour n'existe plus |
| `MAP_QUEST_INCOMPLETE` | objectifs `required` manquants (liste `missingObjectives` renvoyée avec leurs `label`) | la voie reste fermée, indices sur ce qui manque |

En cas de succès, le moteur, atomiquement : enregistre
`mapOutcomes[fromMapId]` (`partial` si seuls les `required` sont remplis,
`total` si tous), téléporte le joueur sur `arrivalCell`/`arrivalRoomId`,
transfère les seuls PNJ `companions`, et journalise le voyage.

Côté prompts (`lib/dm/prompts.ts`), le bloc dynamique expose déjà : l'état de
la quête de la carte courante (objectifs remplis/manquants, depuis les
`label`), les transitions encore disponibles, et une ligne compacte par carte
quittée (depuis `mapOutcomes`). Le contenu du module n'a donc qu'à fournir de
bons `label` — courts, narrables tels quels.

## Pièges connus (déjà payés une fois)

- **Nouveau champ `GameState`** (si une évolution du multi-map en ajoute un) :
  il doit survivre à `replaceState` (mcp-server/game-state.ts) ET au zod
  `GameStateSchema` de player-tools.ts, sinon il est strippé au round-trip.
  Ajouter un test de round-trip.
- **Bornes de déplacement dynamiques** : les grilles varient par carte —
  jamais de bornes figées dans un schéma construit à l'import
  (`rules.mapBounds()` lit `state.currentMapId`).
- **Cache prompt Anthropic** : l'intro `# Carte` va dans le bloc DYNAMIQUE,
  jamais statique ; et les octets injectés pour les modules existants doivent
  rester strictement identiques (playtest avant/après si lib/dm/prompts.ts ou
  lib/context-loader.ts bougent).
- **Frontière moteur/app** : `battlemapImages` vit dans `definition.ts`
  (app), les grilles dans `map.ts` (moteur). Jamais d'import de
  `definition.ts` depuis mcp-server.
- **Zéro fuite inter-modules** : aucun nom propre du module dans lib/,
  components/, app/, mcp-server/ (tests/no-module-leaks.test.cjs).

## Et pour 3 cartes ou plus ?

Le modèle de données et le moteur sont déjà génériques : il suffit de
chaîner (`maps` ordonnées, une quête par carte, une transition de la carte N
vers la N+1 — ou plusieurs sorties alternatives depuis une même carte, le
`pattern`/`transitionId` désambiguïse). Points d'attention spécifiques :

- la reachability est testée depuis `maps[0]` : pas de carte orpheline ;
- le sens unique s'applique de proche en proche : des branches qui
  divergent (carte 2A ou 2B) sont possibles dans les données, mais une seule
  sera visitée par partie — prévoir le budget de contenu en conséquence ;
- une seule ligne de contexte survit par carte quittée : plus il y a de
  cartes, plus les `label` d'objectifs doivent porter à eux seuls les
  conséquences narratives utiles aux cartes suivantes.
