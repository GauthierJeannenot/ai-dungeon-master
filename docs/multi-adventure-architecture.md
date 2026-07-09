# Architecture multi-modules d'aventure

> ✅ **REFACTOR TERMINÉ** (étapes 1→7 livrées). Le jeu est multi-modules :
> Grammy's et La Crypte des Marées sont jouables depuis la landing. Ce document
> reste comme référence de conception ; pour **ajouter un module**, suivre la
> checklist courte du README (« Ajouter un module d'aventure »). Le détail
> étape par étape ci-dessous documente comment le câblage a été fait.

## Objectif

Une partie = un module d'aventure choisi sur la landing. Le moteur MCP, les
prompts du DM, le classifieur, la battlemap et les textes du client sont
paramétrés par ce module. Grammy's reste le module par défaut et ne doit pas
changer de comportement (mêmes prompts, mêmes hooks, même playtest).

## Non-objectifs

- Ne PAS changer la grille 17×15 ni `MAP_BOUNDS` (les deux modules l'utilisent ;
  rendre les bornes par-module est un bonus optionnel de l'étape 3).
- Ne PAS toucher à la monétisation, l'auth, les stores Postgres/fichiers
  (au-delà de la colonne `adventure_id` de l'étape 6).
- Ne PAS généraliser les templates de monstres : les deux modules utilisent le
  bestiaire commun de `mcp-server/tools/phase-tools.ts` (reskin par `name`).

## Inventaire EXACT des couplages Grammy's (vérifié)

| Fichier | Couplage | Devient |
|---|---|---|
| `lib/adventure-map.ts` | Toutes les données Grammy's (ADVENTURE_ROOMS, ENCOUNTERS, ADVENTURE_NPCS, aliases, transitions, ROOM_HOOKS, describeRoomHooks, seedAdventureNpcs, inferAdventureRoomId) + les types partagés | Types + fonctions d'accès paramétrées par `adventureId` ; données déplacées vers `adventures/grammys-country-apple-pie/map.ts` |
| `context/*.md` (4 fichiers) | Contenu Grammy's chargé par `lib/context-loader.ts` (chemin fixe `context/`, caches globaux `cached` et `cachedParsedModule`) | `adventures/<id>/*.md` ; loader paramétré + caches par adventureId (Map) |
| `mcp-server/game-state.ts` | `seedAdventureNpcs()`, `inferAdventureRoomId()`, `DEFAULT_PLAYER.position = (4,13)` | Résolus depuis la définition du module actif du process |
| `mcp-server/tools/phase-tools.ts` | `ENCOUNTERS` / `getEncounter()` importés statiquement | Résolus depuis le module actif |
| `mcp-server/rules.ts` | `MAP_BOUNDS` 17×15 en dur | Inchangé (ou bornes du module actif en bonus) |
| `lib/mcp-client.ts` | Spawne UN process moteur par sessionId, sans notion d'aventure | Passe `ADVENTURE_ID` dans l'env du spawn (`createMCPClient`) |
| `lib/dm/prompts.ts` | `describeRoomHooks`, `loadContextFiles()`, `loadAdventureModuleParsed()` sans paramètre | Reçoivent l'adventureId (disponible via `gameState.adventureId`) |
| `lib/dm/planner.ts` | `describeRoomHooks` sans paramètre | Idem |
| `app/api/dm/route.ts` | Aucun adventureId dans DMRequest ni dans la session | Valide/propage l'adventureId (voir étape 5) |
| `app/game/page.tsx` | `INITIAL_GAME_STATE` (position, PV 20 niv.1), `WELCOME_MESSAGE` Grammy, `seedAdventureNpcs()` | Fournis par la définition du module (via un endpoint ou un import client de la définition) |
| `components/Chat.tsx` | `PLACEHOLDERS` et `describePlayerTurn` câblés sur les roomIds Grammy ('1','4','8','9') | Placeholders par module avec fallback générique |
| `components/Battlemap.tsx` | `url(/battlemap.png)`, `MAP_COLS/MAP_ROWS` 17×15 | Image et dimensions depuis la définition |
| `lib/adventures.ts` | Registre landing (`available`, `playPath`) | S'enrichit en registre technique (voir interface) |
| `scripts/generate-battlemap*.cjs` | Un script par module (OK, assumé) | Inchangé |
| `lib/session-store*` / `lib/db.ts` | Pas d'aventure dans `game_sessions` | Colonne `adventure_id` (étape 6) |

⚠️ Pièges connus :
- `lib/context-loader.ts` : les caches `cached` et `cachedParsedModule` sont des
  singletons de module — les transformer en `Map<adventureId, …>` sinon le
  deuxième module servira les prompts du premier.
- `app/api/dm/route.ts` : `cachedMcpTools` global est OK (les tools MCP sont
  identiques pour tous les modules — ne pas le rendre par-module).
- Le moteur MCP est UN process enfant par sessionId : l'aventure se choisit AU
  SPAWN (env `ADVENTURE_ID`), jamais en cours de vie du process. Un changement
  d'aventure = nouvelle session (nouveau sessionId côté client) — refuser
  explicitement le mismatch (étape 5).
- `GameState` transite par `replace_game_state` : le champ `adventureId` doit
  survivre au round-trip (l'ajouter à `replaceState` dans
  `mcp-server/game-state.ts`).

## Interface cible

```ts
// lib/adventures.ts (étendu — garder les champs landing existants)
export interface AdventureDefinition {
  id: string                      // 'grammys-country-apple-pie' | 'tide-crypt'
  // … champs landing existants (title, tagline, description, level, duration,
  //   available, playPath, accent) …

  // Câblage technique :
  contextDir: string              // 'adventures/<id>' — *.md chargés par context-loader
  battlemapImage: string          // '/battlemaps/<id>.png'
  grid: { cols: number; rows: number }   // 17×15 pour les deux
  startCell: GridCell
  initialPlayer: Pick<PlayerState, 'level' | 'hp' | 'inventory'> // deltas vs défaut
  welcomeMessage: string
  chatPlaceholders?: Record<string, string[]>  // par roomId + clé 'default'
  map: AdventureMapData           // rooms, encounters, npcs, aliases, transitions, hooks
}

export interface AdventureMapData {
  rooms: AdventureRoom[]
  entryCells: Record<string, GridCell>
  encounters: Record<string, EncounterDefinition>
  npcs: AdventureNpcSpec[]
  namedLocationCells: Array<{ id: string; pattern: RegExp; cell: GridCell }>
  roomNavigationAliases: Array<{ roomId: string; pattern: RegExp }>
  doorTransitions: AdventureTransition[]
  forwardTransitions: AdventureTransition[]
  roomHooks: Record<string, string>
}
```

`adventures/tide-crypt/map.ts` exporte déjà toutes ces données sous ces formes
(préfixées `TIDE_CRYPT_`) : l'étape 2 consiste surtout à les agréger en un
objet `AdventureMapData` et à faire de même pour Grammy's.

## Plan d'exécution (ordre impératif)

### Étape 1 — Déplacer le contenu Grammy's sans changer le comportement
1. Créer `adventures/grammys-country-apple-pie/` ; y déplacer les 4 fichiers de
   `context/` (garder `context/` comme fallback de compat dans le loader OU
   supprimer le dossier et mettre à jour le README).
2. Extraire les DONNÉES de `lib/adventure-map.ts` vers
   `adventures/grammys-country-apple-pie/map.ts` (mêmes constantes, format
   aligné sur `adventures/tide-crypt/map.ts`).
3. `lib/adventure-map.ts` ne garde que : les types, et des fonctions d'accès
   qui prennent `adventureId` (avec défaut `'grammys-country-apple-pie'`) et
   lisent le registre : `describeRoomHooks(roomId, adventureId?)`,
   `seedAdventureNpcs(adventureId?)`, `inferAdventureRoomId(cell, adventureId?)`,
   `getEncounter(id, adventureId?)`, etc. Les signatures à un argument restent
   valides → AUCUN call-site ne casse à cette étape.
4. ✅ Critère : typecheck + `npm test` verts, `npm run playtest:mock` identique,
   `npm run eval:intent` inchangé.

### Étape 2 — Registre technique
1. Étendre `lib/adventures.ts` avec `AdventureDefinition`/`AdventureMapData` ;
   construire les deux définitions (Grammy's + tide-crypt) à partir des
   `adventures/<id>/map.ts`.
2. Ajouter `getAdventureDefinition(id)` avec erreur claire si inconnu, et
   `DEFAULT_ADVENTURE_ID` (existe déjà).
3. Généraliser `tests/tide-crypt-module.test.cjs` en
   `tests/adventure-modules.test.cjs` : boucler sur TOUTES les définitions du
   registre (les invariants testés sont déjà génériques).
4. ✅ Critère : les invariants passent aussi sur Grammy's (si l'un échoue sur
   Grammy's, corriger la DONNÉE de test ou documenter l'exception — ne pas
   affaiblir l'invariant pour tide-crypt).

### Étape 3 — Moteur MCP paramétré
1. `lib/mcp-client.ts` → `createMCPClient(sessionId, adventureId)` : ajouter
   `ADVENTURE_ID` à l'env du `StdioClientTransport`. La clé du cache de clients
   reste le sessionId (une session = une aventure = un process).
2. Côté moteur : petit module `mcp-server/adventure.ts` qui lit
   `process.env.ADVENTURE_ID` (défaut Grammy's) et charge la `AdventureMapData`
   correspondante. ⚠️ le moteur est compilé par son propre tsconfig vers
   `mcp-server/dist/` : vérifier que `adventures/**` est inclus dans la
   compilation (`mcp-server/tsconfig.json` include) et que les imports relatifs
   restent corrects après build (`npm run build:mcp` puis lancer le binaire).
3. `game-state.ts` : `createInitialState()` utilise startCell/initialPlayer/
   npcs du module actif ; `GameState.adventureId` ajouté (type + seed +
   `replaceState` le préserve).
4. `phase-tools.ts` : `ENCOUNTERS`/`getEncounter` depuis le module actif.
5. ✅ Critère : les tests moteur existants (mcp-engine) passent sans
   `ADVENTURE_ID` (défaut Grammy's) ; un test lance le moteur avec
   `ADVENTURE_ID=tide-crypt` et vérifie `get_game_state` (position (4,13),
   PNJ `mael` visible, `start_encounter("guardian_chapel")` spawne le Gardien).

### Étape 4 — Contexte et prompts par aventure
1. `lib/context-loader.ts` : `loadContextFiles(adventureId)` lit
   `adventures/<id>/*.md` ; fichiers manquants → fallback sur les DEFAULT_*
   actuels (déjà en place) ; caches par adventureId. *(Évolution post-refactor :
   plus de repli entre modules — chaque module fournit ses `player-rules.md` et
   `bestiary.md` ; l'unique fichier partagé est
   `adventures/_shared/dm-rules.md`.)*
2. `lib/dm/prompts.ts` : `buildStaticPrompt(adventureId)`,
   `buildDynamicPrompt(gameState, …)` lit `gameState.adventureId`. Idem
   `lib/dm/planner.ts` pour `describeRoomHooks`.
3. ⚠️ Prompt caching Anthropic : le bloc statique varie désormais par aventure —
   c'est attendu (une variante de cache par module), ne rien "optimiser".
4. ✅ Critère : en mock, un tour tide-crypt loggue un prompt contenant
   « La Crypte des Marées » et les hooks de la salle 1 du module.

### Étape 5 — Route DM et sélection d'aventure
1. `DMRequest.adventureId?: string` (lib/types.ts). Règles serveur :
   - session stockée existante → l'aventure de LA SESSION fait foi ; un
     `adventureId` différent dans la requête → 409 explicite.
   - nouvelle session → `adventureId` du body, validé contre le registre ET
     `available: true` (403 sinon) ; défaut : `DEFAULT_ADVENTURE_ID`.
2. Passer l'adventureId résolu à `getMCPClient`/`callMCPTool` (nouveau
   paramètre optionnel qui aboutit au spawn).
3. `saveSession` persiste `adventureId` (voir étape 6).
4. ✅ Critère : deux sessions simultanées (une par module) ne se polluent pas —
   test d'intégration en mock sur la route (même mécanique que dm-api.test).

### Étape 6 — Persistance
1. `game_sessions.adventure_id TEXT` : colonne dans `DB_SCHEMA_SQL` + entrée
   dans `ADDITIVE_MIGRATIONS_SQL` (`lib/db.ts`) — même mécanique que `owner_id`.
2. `StoredGameSession.adventureId?: string` + backends fichier/db.
3. Sessions historiques sans adventure_id → Grammy's.
4. ✅ Critère : test pg-mem (db-stores) couvre le round-trip du champ.

### Étape 7 — Frontend
1. Route de jeu : `/game?adventure=<id>` (ou segment `/game/[adventureId]` —
   au choix, mais mettre à jour `playPath` dans le registre). Valider l'id
   côté page ; inconnu → redirect landing.
2. `app/game/page.tsx` : welcome message, état initial (startCell,
   initialPlayer, npcs), sessionStorage keys PRÉFIXÉES par adventureId (sinon
   changer de module dans le même onglet mélange les états).
3. `components/Battlemap.tsx` : image + cols/rows en props depuis la définition.
4. `components/Chat.tsx` : placeholders depuis la définition, fallback
   générique pour les salles non couvertes.
5. Landing : `available: true` pour tide-crypt ; le bouton Démarrer pointe vers
   le playPath paramétré.
6. ✅ Critère : parcours navigateur complet en mock sur les DEUX modules
   (landing → Démarrer → welcome correct → 1 message → battlemap et PNJ du bon
   module → Nouvelle partie).

### Étape 8 — Finitions
1. README : section « Ajouter un module d'aventure » (checklist : dossier
   adventures/<id>/, map.ts, module.md, battlemap script, entrée registre,
   tests automatiquement inclus).
2. `docs/cost-optimization.md` : noter la variante de cache par module.
3. Supprimer ce document ou le réduire à la checklist « nouveau module ».

## Critères d'acceptation globaux

- `npm run typecheck` + `npm test` verts (≥ 81 tests actuels + les nouveaux).
- `npm run build` OK ; `npm run playtest:mock` inchangé sur Grammy's.
- Une partie mock complète jouable sur CHAQUE module via le navigateur.
- Aucun changement de comportement Grammy's (prompts, hooks, encounters,
  welcome) — diff de prompt vide sur un tour identique avant/après.
- Une session ne peut jamais changer d'aventure en cours de route (409).
- `MONETIZATION_ENABLED=false` (harnais de test) continue de fonctionner.

## État des lieux du contenu tide-crypt (déjà livré, ne pas réécrire)

- `adventures/tide-crypt/adventure-module.md` — module complet format Grammy
  (8 salles, énigme des cloches, tous combats évitables, finale).
- `adventures/tide-crypt/map.ts` — données typées (salles, entrées, rencontres,
  PNJ `mael`/`guardian_echo`, aliases, transitions, hooks).
- `adventures/tide-crypt/player-character.md` — fiche Guerrier niveau 2 (28 PV).
- `public/battlemaps/tide-crypt.png` — battlemap pixel art 17×15 alignée
  (régénérable : `node scripts/generate-battlemap-tide-crypt.cjs`).
- `tests/tide-crypt-module.test.cjs` — 8 invariants de cohérence (à généraliser
  à tout le registre en étape 2).
- Bestiaire : uniquement des types moteur existants (wolf, bandit, skeleton,
  zombie, hobgoblin_captain reskiné « Le Gardien Noyé », hpOverride 33).
