# Aventures multi-maps — conception (IMPLÉMENTÉE)

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
  pattern?: RegExp             // reconnaissance de l'intention, comme AdventureTransition
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
  // namedLocationCells, roomNavigationAliases, roomContextAliases,
  // doorTransitions, forwardTransitions, roomHooks, startCell, initialPlayer.
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

1. Une transition existe avec `fromMapId === state.currentMapId` (matcher
   `pattern` sinon transition unique sortante). Sinon → erreur `isError` JSON.
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
- **Context-loader** (`lib/context-loader.ts`) : le parsing `## Salle N` reste
  la loi. Ajouter un niveau optionnel `# Carte <mapId> — <titre>` (en-tête de
  niveau 1) dans `adventure-module.md` : le parseur rattache chaque salle à sa
  carte et produit un **index par map** ; le prompt statique n'embarque que
  l'index de la map courante + les annexes globales. Un module SANS en-tête
  `# Carte` = une seule map, index identique à aujourd'hui (comportement
  historique préservé, y compris le repli « aucune salle reconnue »).

⚠️ **Cache prompt Anthropic** : pour Grammy's et Tide Crypt, les octets
injectés doivent rester STRICTEMENT identiques (index, guidance, hooks). Toute
phase se termine par `npm run playtest:mock` et comparaison des NOMBRES
(23 tours, ratio ≈ 0,348 — le script sort en exit 1 même sur master propre,
c'est attendu, voir scripts/CLAUDE.md).

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
- Validation de chaque phase : `npm run typecheck` + `npm test` (114+ tests,
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

- [x] Phase 1 — Modèle de données (maps/quêtes/transitions, GameState.currentMapId + mapOutcomes, round-trip replaceState)
- [x] Phase 2 — Moteur (`travel_to_map`, bornes dynamiques par map, garde ENCOUNTER_WRONG_MAP)
- [x] Phase 3 — App/UI/Prompts (battlemapImages par map, blocs dynamiques quête/mapOutcomes, parseur `# Carte`)
- [x] Phase 4 — Contenu multi-map réel : `adventures/fey-shadow-fair/` (2 cartes, quête à objectifs requis/optionnels, compagnon, 2 battlemaps générées, 6 monstres fey SRD ajoutés au bestiaire commun, tests moteur dédiés)

Écarts assumés par rapport à la cible initiale : la « fixture de test » de la
phase 2 est remplacée par le module réel (fey-shadow-fair) ; l'union
`MapOutcome.completion` est en anglais (`partial`/`total`) comme le reste des
types ; l'intro de carte (`# Carte`) est injectée dans le bloc DYNAMIQUE (pas
statique) pour garder le cache Anthropic stable par aventure.
