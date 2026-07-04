# Correctifs de l'audit code — juillet 2026 (guide d'implémentation)

Ce document liste les correctifs issus de l'audit complet du 2026-07-04, dans
l'ordre d'implémentation recommandé, avec le détail exact des changements.
Chaque fix = **un commit séparé**.

> **Déjà traité ailleurs — NE PAS s'en occuper ici :**
> la battlemap tide-crypt (PNG 1180×1333 non multiple de la grille 17×15,
> test `adventure-modules.test.cjs` en échec) est corrigée à la main par
> Gauthier. Si ce test échoue encore au moment où tu commences, ignore CET
> échec-là et uniquement celui-là.

## Pré-requis et règles du dépôt (rappel)

- `npm ci` obligatoire dans un worktree frais.
- `npm run build:mcp` avant tout ce qui spawne le moteur — les tests tournent
  sur le binaire compilé `mcp-server/dist/`.
- Validation minimale par fix : `npm run typecheck` + `npm test`.
- **Ne PAS toucher** à `buildStaticPrompt` (lib/dm/prompts.ts) : le prompt
  statique doit rester byte-identique (invariant de cache Anthropic). Aucun
  des fixes ci-dessous ne le nécessite.
- Jamais de `console.log` dans `mcp-server/` (stdout = protocole MCP).
- Le moteur (`mcp-server/`) n'importe JAMAIS `adventures/<id>/definition.ts`
  ni du code app-only. Il ne voit que `map.ts`, `lib/adventure-map.ts`,
  `lib/types.ts`, `lib/player-template.ts`.

---

## Fix 1 (P0) — Dockerfile : `COPY context` cassé et `adventures/` absent du runtime

**Problème.** `Dockerfile:46` fait `COPY context ./context`, mais le dossier
`context/` a été supprimé au commit `4bb2395` → `docker build` échoue sur ce
COPY. Et même corrigé, l'image ne copie jamais `adventures/`, alors que
`lib/context-loader.ts` lit `adventures/<id>/*.md` (player-character.md,
player-rules.md, dm-rules.md, adventure-module.md) **au runtime** via
`fs.readFileSync(path.join(process.cwd(), 'adventures', ...))`. En prod
Docker, chaque tour DM lèverait « Fichier de contexte manquant ».

**Correctif.** Dans le stage `runner` du Dockerfile, remplacer :

```dockerfile
COPY context       ./context
```

par :

```dockerfile
COPY adventures    ./adventures
```

Copier tout `adventures/` est le plus simple et le plus robuste (les `.ts`
embarqués sont inertes au runtime ; seuls les `.md` sont lus). Ne pas tenter
de ne copier que les `.md` avec des globs — un nouveau module doit marcher
sans retoucher le Dockerfile.

**Validation.**
- `docker build .` si Docker est disponible ; sinon, au minimum vérifier que
  chaque chemin source des `COPY` du stage runner existe dans le dépôt
  (`node_modules` exclu — il vient des stages précédents).
- Grep de contrôle : `grep -rn "'context'" lib/ app/ mcp-server/` ne doit
  rien remonter (aucun code ne lit plus `context/`).

---

## Fix 2 (P1) — Cache des tools MCP partagé entre aventures

**Problème.** `app/api/dm/route.ts:148` :

```ts
let cachedMcpTools: Anthropic.Tool[] | null = null
```

Ce singleton de module est rempli par la **première session** qui passe,
toutes aventures confondues. Or le schéma du tool `start_encounter` est
propre à chaque aventure (`mcp-server/tools/phase-tools.ts` :
`encounterId: z.enum(encounterIds(ACTIVE_ADVENTURE_ID))`). Les encounters
diffèrent : `bakery_floor_goblins`, `grammy_apartment_guards`… côté Grammy's
vs `wreck_wolves`, `ossuary_awakening`… côté tide-crypt. Une session
tide-crypt démarrée après une session Grammy's expose donc au LLM l'enum du
mauvais module → le DM ne peut plus déclencher les rencontres prévues.

**Correctif.** Clé de cache = adventureId :

```ts
const cachedMcpToolsByAdventure = new Map<string, Anthropic.Tool[]>()

async function getMcpTools(sessionId: string | undefined, adventureId: string): Promise<Anthropic.Tool[]> {
  const cached = cachedMcpToolsByAdventure.get(adventureId)
  if (cached) return cached
  const raw = await listMCPTools(sessionId, adventureId)
  const tools = raw
    .filter(tool => !HIDDEN_FROM_LLM.has(tool.name))
    .map(tool => ({ ... }))  // inchangé
  cachedMcpToolsByAdventure.set(adventureId, tools)
  ...
  return tools
}
```

Au call-site (`route.ts:405`), passer l'`adventureId` résolu par la route
(la variable locale `adventureId`, déjà en scope) :

```ts
const allMcpTools = await getMcpTools(sessionId, adventureId)
```

Notes :
- `listMCPTools` accepte déjà `adventureId` en 2e argument
  (lib/mcp-client.ts) — le passer est important pour le cas où ce serait le
  premier appel qui spawne le process (défense en profondeur, cf. Fix 3).
- Le cache reste illimité mais borné par le nombre de modules du registre
  (2 aujourd'hui) — pas besoin de TTL.

**Validation.** `npm run typecheck` + `npm test` (les tests
`dm-adventure-selection.test.cjs` et `dm-api.test.cjs` couvrent la route).
Ajouter si possible un test dans `tests/dm-adventure-selection.test.cjs` :
deux sessions sur deux aventures différentes dans le même process → la liste
de tools de la 2e session doit contenir l'enum d'encounters de SON module
(inspectable via le log `dm.mcp_tools.loaded` ou en exportant `getMcpTools`
pour le test — préférer vérifier via `listMCPTools` directement sur les deux
clients si plus simple).

---

## Fix 3 (P1) — Propager `adventureId` sur TOUS les appels MCP d'une requête

**Problème.** Seul le premier appel MCP de la requête
(`syncGameStateToMcp`, route.ts:383) passe `adventureId`. Tous les suivants
appellent `callMCPTool(name, input, sessionId)` sans lui :

- route.ts:558 (boucle tool-use), :573 et :624 (`get_game_state` de refresh),
- lib/dm/planner.ts:236 et :239 (`executeSceneMarkers`).

Si le process moteur meurt en vol (crash → `onclose` supprime l'entrée du
cache, lib/mcp-client.ts:167-173) ou est évincé par `pruneOldestClient`
(`MAX_SESSION_CLIENTS = 25`), l'appel suivant **re-spawne un process SANS
`ADVENTURE_ID`** → moteur sur le module par défaut (Grammy's). Le
`get_game_state` qui suit renvoie un état initial Grammy's, qui est ensuite
**persisté** sur la partie tide-crypt : corruption de sauvegarde.

**Correctif.**
1. Dans `app/api/dm/route.ts`, passer `adventureId` (4e argument) à chaque
   `callMCPTool` de la requête : lignes 558, 573, 624 →
   `callMCPTool(toolUse.name, input, sessionId, adventureId)`, etc.
2. Dans `lib/dm/planner.ts`, `executeSceneMarkers` reçoit déjà `gameState` :
   utiliser `gameState.adventureId` comme 4e argument des deux `callMCPTool`
   (le champ est garanti non-vide à ce stade : la route estampille
   `adventureId` sur l'état avant la sync, route.ts:359-361). Ne pas changer
   la signature publique si `state.adventureId` suffit — sinon ajouter un
   paramètre `adventureId: string` à `executeSceneMarkers` et le passer
   depuis la route (variante plus explicite, acceptable aussi).

**Piège.** Ne PAS « corriger » en permettant à un client existant de changer
d'aventure : `getMCPClient` ignore volontairement `adventureId` quand le
client est déjà en cache (une session = une aventure, pour toujours). Le
paramètre ne sert qu'au (re)spawn.

**Validation.** typecheck + tests. Test ciblé recommandé (dans
`tests/dm-adventure-selection.test.cjs`) : démarrer une session tide-crypt,
appeler `closeMCPClient(sessionId)` pour simuler un crash du process, puis
rejouer un message → l'état renvoyé doit toujours porter
`adventureId === 'tide-crypt'` (sans le fix, il repart sur le module par
défaut).

---

## Fix 4 (P1) — `syncGameStateToMcp` : un échec de `replace_game_state` ne doit JAMAIS retomber sur l'état initial

**Problème.** `app/api/dm/route.ts:191-208` : si `replace_game_state` échoue
(ex. état historique refusé par le schéma zod du moteur), la fonction logge
un warn puis se replie sur `get_game_state`… qui, sur un process fraîchement
spawné, renvoie **l'état initial du module**. Le tour continue là-dessus et
`saveSession` **écrase la sauvegarde** avec cet état vierge : reset silencieux
de la partie du joueur.

**Correctif.** Quand un `gameState` était fourni et que `replace_game_state`
échoue, retourner `undefined` au lieu de continuer :

```ts
async function syncGameStateToMcp(...): Promise<GameState | undefined> {
  if (gameState) {
    try {
      return await callMCPTool('replace_game_state', { gameState }, sessionId, adventureId) as GameState
    } catch (err) {
      logEvent('error', 'dm.state.replace_failed', { sessionId, err: ... })
      return undefined   // ← au lieu de retomber sur get_game_state
    }
  }
  // Nouvelle session (pas d'état) : l'état initial du moteur est le bon.
  try {
    return await callMCPTool('get_game_state', {}, sessionId, adventureId) as GameState
  } catch {
    return undefined
  }
}
```

La route gère déjà `!synced` correctement : `refundDebit` + 503
(route.ts:384-388) — le joueur ne paie pas et sa sauvegarde n'est pas touchée.
Passer le log de `warn` à `error` : c'est désormais un échec de requête.

**Piège.** Garder le second bloc (`get_game_state` sans état fourni) : c'est
le chemin normal de création d'une nouvelle partie. Noter aussi que le
`catch` final du `get_game_state` retournait `gameState` (undefined dans ce
chemin) — le `return undefined` explicite est équivalent mais plus clair.

**Validation.** typecheck + tests. Test ciblé : mocker/forcer un échec de
`replace_game_state` (ex. état corrompu injecté hors monétisation via
`body.gameState` avec un champ invalide) → la route doit répondre 503 et,
en monétisation simulée, rembourser (voir les tests existants de
remboursement dans `tests/dm-api.test.cjs` pour le motif).

---

## Fix 5 (P2) — Plafonner la longueur du message joueur

**Problème.** `app/api/dm/route.ts:226` ne vérifie que `message?.trim()`.
Un message de 1 Mo part tel quel chez le planner (Haiku) puis le DM (Sonnet)
et finit dans l'historique persisté : vecteur de coût direct pour 1 seul
token débité.

**Correctif.** Dans route.ts, à côté des autres validations 400 (AVANT
rate-limit et débit) :

```ts
const DM_MAX_MESSAGE_CHARS = parsePositiveInt(process.env.DM_MAX_MESSAGE_CHARS, 2000)
...
if (message.length > DM_MAX_MESSAGE_CHARS) {
  return NextResponse.json(
    { error: `Message trop long (${message.length} caractères, maximum ${DM_MAX_MESSAGE_CHARS}).` },
    { status: 400 }
  )
}
```

- `parsePositiveInt` est déjà importé depuis `lib/dm/llm`.
- Ajouter `DM_MAX_MESSAGE_CHARS` à la liste `NUMERIC_ENV_VARS` de
  `lib/config-check.ts` et une ligne dans `.env.example`.
- Optionnel (UX) : `maxLength` sur le champ de saisie dans
  `app/game/page.tsx` pour éviter le 400 côté client.

**Piège.** 2000 caractères est large pour un message de joueur (les
placeholders du jeu suggèrent des phrases courtes). Ne pas descendre sous
~500 sans en parler : certains joueurs collent des descriptions d'action
longues.

**Validation.** typecheck + tests + un test dans `tests/dm-api.test.cjs` :
message de `DM_MAX_MESSAGE_CHARS + 1` caractères → 400, aucun débit.

---

## Fix 6 (P2) — Rate-limit IP : prendre la DERNIÈRE entrée de `x-forwarded-for`

**Problème.** `lib/rate-limit.ts:40-47` prend la **première** entrée du
header. Or les proxys **ajoutent en fin de liste** : un client qui envoie
lui-même `X-Forwarded-For: <valeur aléatoire>` obtient
`"<fake>, <ip réelle>"` — première entrée contrôlée par l'attaquant → un
bucket de rate-limit neuf par requête. Le disjoncteur global journalier borne
les dégâts, mais la limite par IP est contournable.

**Correctif.** Prendre la **dernière** entrée (celle ajoutée par le proxy de
l'hébergeur, seul hop de confiance devant l'app sur Railway) :

```ts
export function clientIpFromHeaders(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for')
  if (forwarded) {
    const parts = forwarded.split(',').map(part => part.trim()).filter(Boolean)
    const last = parts.at(-1)
    if (last) return last
  }
  return headers.get('x-real-ip')?.trim() || 'unknown'
}
```

Mettre à jour le commentaire du fichier (expliquer le choix « dernier hop =
posé par le proxy de confiance ; les entrées précédentes sont déclarées par
le client »).

**Impact tests.** `tests/abuse-guards.test.cjs:54-56` vérifie explicitement
l'ancien comportement (« prefers x-forwarded-for first entry ») : inverser
l'assertion (avec `'203.0.113.7, 10.0.0.1'`, attendre `'10.0.0.1'`) et
renommer le test. Vérifier aussi `tests/dm-adventure-selection.test.cjs:27`
(header à une seule entrée — comportement inchangé).

**Piège.** Si un jour un CDN s'ajoute devant Railway (2 hops de confiance),
la dernière entrée deviendrait l'IP du CDN. Laisser un commentaire le
signalant ; ne pas sur-ingénierer avec une liste de proxys de confiance
aujourd'hui.

---

## Fix 7 (P2) — Bornes de carte du moteur : les dériver du module actif

**Problème.** La grille est définie par module
(`adventures/<id>/definition.ts` : `grid: { cols: 17, rows: 15 }`) mais le
moteur la duplique en dur à deux endroits :

- `mcp-server/rules.ts:7-12` : `MAP_BOUNDS` (maxX: 16, maxY: 14),
- `mcp-server/tools/player-tools.ts:23-26` : `PositionSchema`
  (`x.max(16)`, `y.max(14)`).

Les deux modules actuels font 17×15 donc rien ne casse aujourd'hui, mais le
premier module avec une autre grille validerait les déplacements contre les
mauvaises bornes.

**Correctif.** Le moteur ne peut pas importer `definition.ts` (frontière
moteur/app). Donc :

1. Ajouter `grid: { cols: number; rows: number }` à `AdventureMapData`
   (lib/adventure-map.ts) et le renseigner dans chaque
   `adventures/<id>/map.ts` (`grid: { cols: 17, rows: 15 }` pour les deux).
2. Dans `adventures/<id>/definition.ts`, importer la grille depuis le
   `map.ts` du même module au lieu de la dupliquer
   (`grid: GRAMMYS_MAP.grid` / `grid: TIDE_CRYPT_MAP.grid`) — une seule
   source de vérité. `definition.ts` importe déjà des types côté app ;
   importer son propre `map.ts` est sans danger (données pures).
3. `mcp-server/rules.ts` : calculer les bornes au chargement du module actif :

   ```ts
   import { getAdventureMap } from '../lib/adventure-map'
   import { ACTIVE_ADVENTURE_ID } from './adventure'

   const GRID = getAdventureMap(ACTIVE_ADVENTURE_ID).grid
   const MAP_BOUNDS = { minX: 0, maxX: GRID.cols - 1, minY: 0, maxY: GRID.rows - 1 } as const
   ```

   (`ACTIVE_ADVENTURE_ID` est figé au spawn — un calcul au chargement du
   module est correct.)
4. `mcp-server/tools/player-tools.ts` : construire `PositionSchema` avec les
   mêmes bornes dynamiques (`z.number().int().min(0).max(GRID.cols - 1)`,
   idem rows). Le plus propre : exporter `MAP_BOUNDS` (ou la grille) depuis
   `rules.ts` et l'importer ici pour ne pas recalculer.

**Pièges.**
- `tests/adventure-modules.test.cjs` lit `adventure.grid` depuis la
  DÉFINITION (via `lib/adventures.ts`) : en important la grille du map.ts
  dans definition.ts, le test continue de marcher sans modification.
- Ajouter une assertion dans `tests/adventure-modules.test.cjs` : pour chaque
  module, `definition.grid` === `map.grid` (verrouille la cohérence), et
  toutes les `rooms[].zone` / `entryCells` / `encounters[].cell` tiennent
  dans la grille du module (certaines assertions de bornes existent déjà —
  les paramétrer sur `map.grid` au lieu de constantes si besoin).
- **`npm run build:mcp` obligatoire** après ces changements (fichiers
  partagés compilés dans le dist du moteur).

---

## Fix 8 (P2/P3) — Généraliser `SceneMemory` (vocabulaire Grammy hors de adventures/)

**Problème.** `SceneMemory` porte des clés propres au module Grammy's
(`insultedMac`, `foundRecipeHalfCount`, `sparedGoblin`, `macDisposition`,
`goblinMorale`) dans du code partagé :

- `lib/types.ts:83-94` (l'interface),
- `mcp-server/tools/player-tools.ts:105-118` (`SceneMemorySchema` zod),
- `app/game/page.tsx:217-223` (résumé debug client) et `:717` (`alertLevel`),
- `scripts/playtest.cjs:1104` (lecture `alertLevel`).

Ça passe sous le radar de `tests/no-module-leaks.test.cjs` car sa liste ne
contient que `\bmac le\b` (pas `insultedMac`/`macDisposition`). Par ailleurs
**rien n'écrit `sceneMemory`** dans le code actuel (héritage du pipeline
director supprimé) : ce ne sont que des lectures défensives et le round-trip
de vieux états persistés.

**Correctif recommandé (généralisation, pas de suppression).**

1. `lib/types.ts` : remplacer l'interface par un type ouvert :

   ```ts
   // Mémoire de scène libre, propre au module (clés non typées : le contenu
   // appartient à adventures/<id>/, le code partagé ne fait que la transporter).
   export type SceneMemory = Record<string, unknown>
   ```

2. `mcp-server/tools/player-tools.ts` : remplacer `SceneMemorySchema` par
   `z.record(z.string(), z.unknown())` (round-trip des états legacy garanti,
   aucune clé de module dans le moteur).
3. `app/game/page.tsx` : le résumé debug (:217-223) ne peut plus accéder aux
   champs typés — remplacer par un passthrough
   (`sceneMemory: state.sceneMemory` dans le résumé, ou
   `Object.keys(state.sceneMemory)` si on veut rester compact). Ligne ~717 :
   `const alertLevel = Number(gameState.sceneMemory?.alertLevel ?? 0)`.
4. `scripts/playtest.cjs` : déjà en JS non typé, l'accès
   `?.alertLevel ?? 0` continue de marcher.
5. Durcir le verrou : ajouter à `LEAK_TERMS`
   (tests/no-module-leaks.test.cjs) des motifs pour ces identifiants,
   par ex. `/insultedmac|macdisposition|goblinmorale|foundrecipehalf|sparedgoblin/i`
   — après le nettoyage, le test doit passer ; avant, il doit échouer
   (preuve que le verrou couvre désormais ce cas).

**Pièges.**
- `lib/dm/prompts.ts:164` (`Object.keys(gameState.sceneMemory)`) marche tel
  quel avec un Record.
- `npm run build:mcp` requis (types.ts est partagé avec le moteur).
- Ne pas supprimer le champ `sceneMemory` : des sauvegardes JSONB legacy en
  contiennent et le schéma zod du moteur strippe les clés inconnues — le
  champ doit rester déclaré pour survivre à `replace_game_state`.

---

## Fix 9 (P3) — Nettoyages mineurs

**9a. Code mort dans `spawn_monster`.**
`mcp-server/tools/phase-tools.ts:609-648` : tout ce qui suit le premier
`return` du handler est inaccessible (ancienne implémentation dupliquée).
Supprimer les ~40 lignes. Aucun changement de comportement.

**9b. `update_hp` : `hpBefore` faux quand les HP sont clampés.**
`mcp-server/tools/player-tools.ts:335` calcule
`hpBefore: entity.hp.current - delta` APRÈS mutation — faux si les HP ont été
écrêtés à 0 ou à max (ex. soin de 8 à 2 PV du max → hpBefore surestimé).
Capturer la valeur avant :

```ts
const before = gs.getEntity(entityId)?.hp.current ?? 0
// ... mutation ...
hpBefore: before,
```

**9c. Documenter l'hypothèse mono-instance.**
`lib/session-lock.ts` (verrou en mémoire) et `lib/mcp-client.ts` (cache de
process par instance) supposent UNE instance serveur. Deux instances = deux
moteurs divergents pour une même session. Ajouter une note dans
`lib/CLAUDE.md` (section session-lock/mcp-client) et dans le README section
déploiement : « scaling horizontal interdit sans refonte (verrou distribué +
routage sticky par session) ».

---

## Ordre d'implémentation et validation globale

| # | Fix | Fichiers principaux | Build MCP requis |
|---|-----|---------------------|:---:|
| 1 | Dockerfile adventures/ | Dockerfile | non |
| 2 | Cache tools par aventure | app/api/dm/route.ts | non |
| 3 | adventureId sur tous les appels MCP | route.ts, lib/dm/planner.ts | non |
| 4 | syncGameStateToMcp sans repli | route.ts | non |
| 5 | Plafond message | route.ts, lib/config-check.ts, .env.example | non |
| 6 | XFF dernière entrée | lib/rate-limit.ts, tests/abuse-guards.test.cjs | non |
| 7 | Bornes de carte par module | lib/adventure-map.ts, adventures/*/map.ts + definition.ts, mcp-server/rules.ts + player-tools.ts | **oui** |
| 8 | SceneMemory générique | lib/types.ts, mcp-server/tools/player-tools.ts, app/game/page.tsx, tests/no-module-leaks.test.cjs | **oui** |
| 9 | Nettoyages | mcp-server/tools/*.ts, CLAUDE.md/README | **oui** |

Après CHAQUE fix : `npm run typecheck` + `npm test`.
À la toute fin : `npm run playtest:mock` et comparer les **nombres** à la
référence (23 tours, ratio narrateur LLM ≈ 0,348, `move_token: 8`) — le
script sort en exit 1 même quand tout va bien (seuils aspirationnels), seul
un écart des nombres est une régression. Aucun de ces fixes ne doit les
changer.

### À ne pas faire (rappels du dépôt)

- Ne pas recréer d'eval d'intention ni le pipeline director/cassettes
  (supprimés — docs/intent-pipeline.md décrit une cible non implémentée).
- Ne pas reformuler le prompt statique (cache Anthropic + comparaisons
  playtest).
- Ne pas introduire de bascule d'aventure sur une session existante (le 409
  est voulu), ni rendre eager l'import de lib/entitlements.
- Ne pas affaiblir les tests-verrous : si `no-module-leaks` échoue après le
  Fix 8, c'est le CODE qu'on corrige, pas la liste du test.
