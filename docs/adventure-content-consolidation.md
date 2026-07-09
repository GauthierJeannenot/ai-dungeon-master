# Directives — Consolidation du contenu des modules dans `adventures/`

> **Document d'exécution.** Le refactor multi-modules (docs/multi-adventure-architecture.md)
> a créé `adventures/<id>/` et le registre, mais du contenu Grammy's reste
> éparpillé dans `lib/`, `components/`, `scripts/` et `public/` — et certaines
> répliques Grammy **fuient dans les prompts et l'UI de TOUS les modules**.
> Objectif : tout ce qui est propre à un module vit dans `adventures/<id>/` ;
> tout ce qui est dans `lib/`/`components/` est générique ou paramétré.
> Suivre les étapes DANS L'ORDRE — chacune laisse les deux modules jouables et
> les tests verts (109 actuellement).

## Règle d'or

**Un grep `-i "grammy|verger|boulangerie|dryad|mac le|grukk|tarte"` sur `lib/`,
`components/`, `app/`, `mcp-server/` (hors commentaires de compat et hors
bestiaire assumé) doit finir VIDE.** C'est le critère d'acceptation final —
un test l'automatisera (étape 7).

## Inventaire EXACT (vérifié le 2026-07-02)

### A. Contenu de module hébergé hors de `adventures/<id>/`

| Où | Quoi | Devient |
|---|---|---|
| `lib/adventures.ts` | `GRAMMYS_WELCOME`, `TIDE_CRYPT_WELCOME`, `GRAMMYS_PLACEHOLDERS`, `TIDE_CRYPT_PLACEHOLDERS` + title/tagline/description inline des deux modules | `adventures/<id>/definition.ts` ; `lib/adventures.ts` = pur registre qui agrège |
| `public/battlemap.png` | Battlemap Grammy au chemin legacy (tide-crypt est déjà sous `public/battlemaps/`) | `public/battlemaps/grammys-country-apple-pie.png` |
| `scripts/generate-battlemap.cjs` | Générateur Grammy au nom générique | `scripts/generate-battlemap-grammys-country-apple-pie.cjs` (convention : un script `generate-battlemap-<id>.cjs` par module) |

### B. Fuites Grammy dans les prompts DM — REÇUES PAR TOUS LES MODULES ⚠️

| Où | Quoi |
|---|---|
| `lib/dm/prompts.ts` `buildStaticPrompt` règle 2 | « Les PNJ existent et ont un token même hors combat (**ex. Mac dès le départ**) » |
| `lib/dm/prompts.ts` règle 3 | « je vais **au verger** » + « lieu connu du module (**verger, tas de déchets, entrée/façade, bureau, quai de chargement, sol de la boulangerie, appartement**…) » |
| `lib/dm/prompts.ts` règle 5 | « créatures non hostiles (**Mac le Tréant, la dryade**…) » |
| `lib/dm/planner.ts` (system du classifieur) | Exemples : « je dépose une offrande **au pied des arbres** » → `sceneMarkers=["reveal_npc:dryad"]` ; description du champ `sceneMarkers` cite `"reveal_npc:dryad"` |

Conséquence concrète : dans la Crypte des Marées, le DM et le classifieur
reçoivent des instructions qui parlent de Mac, du verger et des dryades.
Ça pollue le contexte et peut induire des hallucinations inter-modules.

### C. Fuites Grammy dans le client — AFFICHÉES PAR TOUS LES MODULES ⚠️

| Où | Quoi |
|---|---|
| `components/Chat.tsx` `PLACEHOLDERS.bakeryEntrance` / `.bakeryFloor` | **Code mort** depuis le refactor de `selectPlaceholder` (contenu déjà copié dans `GRAMMYS_PLACEHOLDERS`) — à supprimer |
| `components/Chat.tsx` `PLACEHOLDERS.dialogue` / `.exploration` | Saveur Grammy dans les génériques : « **négocier la recette** », « suivre l'odeur de **cannelle** », « accuser une odeur suspecte » — à neutraliser |
| `components/Chat.tsx` `describePlayerTurn` | Indices par roomId Grammy en dur ('8' fours, '9' « **Grammy n'est plus tres loin** », '4' traces) — affichés aussi dans la crypte (ligne de statut vocal) |
| `app/page.tsx` section Tokens | « les visiteurs anonymes disposent de 5 messages d'essai **sur Grammy's Country Apple Pie** » — faux depuis le multi-modules : le quota invité est global |

### D. Duplication et code mort

| Où | Quoi |
|---|---|
| `mcp-server/game-state.ts` `BASE_PLAYER` **ET** `lib/initial-game-state.ts` `BASE_PLAYER` | Gabarit héros dupliqué à l'identique (nom, classe, stats, CA…) — risque de drift silencieux entre le moteur et le seed client |
| `lib/context-loader.ts` `DEFAULT_PLAYER_CHARACTER/_RULES/_DM_RULES/_ADVENTURE_MODULE` (~150 lignes) | Constantes de repli quasi mortes (la chaîne de repli atteint toujours les fichiers du module par défaut), dont un **module fantôme « La Crypte des Ombres Oubliées »** qui n'existe nulle part ailleurs |

### E. Assumé partagé — à documenter, PAS à déplacer

| Où | Quoi | Pourquoi ça reste |
|---|---|---|
| `mcp-server/tools/phase-tools.ts` `MONSTER_TEMPLATES` (incl. `dryad`, `awakened_tree`) + `combat-tools.ts` `MONSTER_NATURAL_WEAPON` | Bestiaire commun du moteur | Les modules reskinnent par `name`/`hpOverride` (décision d'architecture, cf. multi-adventure doc). Mais : la description du tool `spawn_monster` (phase-tools ~l.591) énumère les types **en dur** → la générer depuis les clés du record |
| `scripts/playtest.cjs` | Scénario 100 % Grammy (grukk, recette, Mac) | C'est LE playtest de non-régression Grammy — le garder tel quel. Optionnel (étape 7) : le renommer `playtest-grammys.cjs` et prévoir un scénario tide-crypt plus tard |
| Commentaires de compat (`session-store.ts`, `Battlemap.tsx` « défauts = Grammy's ») | Références textuelles au module par défaut | Inoffensif ; reformuler « module par défaut » si on y touche |

## Cible

```
adventures/<id>/
  map.ts                  # données MOTEUR (déjà) — seule chose compilée par mcp-server
  definition.ts           # NOUVEAU — contenu APP : meta landing (title, tagline,
                          #   description, level, duration, accent), welcomeMessage,
                          #   chatPlaceholders, roomStatusHints, promptGuidance,
                          #   battlemapImage, grid
  adventure-module.md     # (déjà)
  player-character.md     # (déjà)
  player-rules.md         # (depuis le refactor « règles par module » : REQUIS par
  bestiary.md             #   module, avec bestiary.md ; dm-rules.md est devenu
                          #   l'unique fichier partagé, adventures/_shared/dm-rules.md)

public/battlemaps/<id>.png              # TOUTES les battlemaps (Grammy incluse)
scripts/generate-battlemap-<id>.cjs     # un générateur par module

lib/adventures.ts         # pur registre : importe les definition.ts, expose
                          #   ADVENTURES/getAdventure/requireAvailableAdventure
lib/adventure-map.ts      # inchangé (types + registre data moteur)
lib/player-template.ts    # NOUVEAU — BASE_PLAYER partagé app + moteur
```

⚠️ **Frontière moteur/app** : `definition.ts` ne doit JAMAIS être importé par
`mcp-server/**` (le moteur ne compile que `map.ts` via son tsconfig). Si un
champ doit être vu par le moteur, il va dans `AdventureMapData`, pas dans la
définition.

## Plan d'exécution (ordre impératif)

### Étape 1 — `definition.ts` par module, registre pur
1. Créer `adventures/grammys-country-apple-pie/definition.ts` et
   `adventures/tide-crypt/definition.ts` exportant un objet typé
   `AdventureContent` (nouveau type dans `lib/adventures.ts`) : les champs
   actuellement inline dans `lib/adventures.ts` (title…accent, welcomeMessage,
   chatPlaceholders, battlemapImage, grid) + deux champs nouveaux **encore
   inutilisés** à cette étape : `roomStatusHints?: Record<string, string>` et
   `promptGuidance` (voir étape 3 pour sa forme).
2. `lib/adventures.ts` : supprimer les constantes inline ; construire
   `ADVENTURES` en fusionnant `definition.ts` + `getAdventureMap(id)` +
   `available`/`playPath` (ces deux-là peuvent rester dans le registre : c'est
   de l'exploitation, pas du contenu).
3. ✅ Critère : typecheck, 109/109, `npm run playtest:mock` identique
   (23 tours / 96 appels / 34,8 %), landing inchangée en navigateur.

### Étape 2 — Battlemaps normalisées
1. `git mv scripts/generate-battlemap.cjs scripts/generate-battlemap-grammys-country-apple-pie.cjs`,
   changer sa sortie vers `public/battlemaps/grammys-country-apple-pie.png`,
   le régénérer, `git rm public/battlemap.png`.
2. `definition.ts` Grammy : `battlemapImage: '/battlemaps/grammys-country-apple-pie.png'`.
3. `components/Battlemap.tsx` : le défaut de la prop `image = '/battlemap.png'`
   pointe vers un fichier supprimé → rendre la prop **obligatoire** (la page de
   jeu la passe toujours) et supprimer le défaut ; idem envisageable pour
   cols/rows (garder les défauts 17×15 est acceptable).
4. README : sections « Battlemap » et « ### 3. Battlemap (générée) » — chemins
   et commandes à jour.
5. ✅ Critère : `tests/adventure-modules.test.cjs` (qui lit `battlemapImage`)
   vert sans modification ; les deux cartes s'affichent en navigateur.

### Étape 3 — Dé-Grammy-fier les prompts DM (l'étape sensible)
1. Forme de `promptGuidance` dans `definition.ts` :
   ```ts
   interface AdventurePromptGuidance {
     movementExample: string        // ex. Grammy : « je vais au verger » ; crypte : « je vais au phare »
     namedPlaces: string            // liste des lieux nommés, ex. « verger, tas de déchets, … »
     visibleNpcExample: string      // ex. « Mac dès le départ » / « Maël dès le départ »
     nonHostileNpcs: string         // ex. « Mac le Tréant, la dryade… » / « Maël, l'Écho de la Gardienne… »
     plannerExamples: string[]      // 4-6 exemples « message → décision » du classifieur, dont un reveal_npc du module
     revealNpcKindExample: string   // ex. « reveal_npc:dryad » / « reveal_npc:ghost »
   }
   ```
2. `lib/dm/prompts.ts` : `buildStaticPrompt(adventureId)` récupère la
   définition (`getAdventureDefinition(adventureId)`) et injecte ces champs aux
   endroits listés dans l'inventaire B, à la place des valeurs en dur.
   ⚠️ **Pour Grammy, les chaînes injectées doivent reproduire EXACTEMENT le
   texte actuel** — le prompt Grammy résultant doit être byte-identique
   (c'est vérifiable : concaténer l'ancien et le nouveau `buildStaticPrompt('grammys…')`
   dans un test temporaire ou un script de diff avant de supprimer l'ancien).
3. `lib/dm/planner.ts` : les exemples et la description de `sceneMarkers`
   viennent de `plannerExamples`/`revealNpcKindExample`. Même exigence :
   Grammy byte-identique.
4. Remplir les champs tide-crypt avec le vocabulaire de la crypte (phare,
   chaussée, Maël, `reveal_npc:ghost`, cloches).
5. ✅ Critères : prompt Grammy **byte-identique** (donc playtest ET
   `npm run eval:intent` strictement inchangés) ; un test vérifie que
   `buildStaticPrompt('tide-crypt')` ne contient ni « Mac » ni « verger » ni
   « dryade », et contient « Maël » ; cache Anthropic inchangé côté Grammy
   (même préfixe → mêmes hits).

### Étape 4 — Dé-Grammy-fier le client
1. `components/Chat.tsx` : supprimer `PLACEHOLDERS.bakeryEntrance` et
   `.bakeryFloor` (morts) ; réécrire `dialogue`/`exploration` en neutre
   (« négocier la recette » → « négocier ce qu'on est venu chercher », etc.).
2. `describePlayerTurn` : accepter `roomStatusHints` en paramètre (fourni par
   GameView depuis la définition) ; les indices Grammy actuels ('4', '8', '9')
   déménagent dans `definition.ts` Grammy ; écrire 2-3 indices pour la crypte
   (grève, antichambre, chapelle) ; fallback générique conservé.
3. `app/page.tsx` : « … messages d'essai sur Grammy's Country Apple Pie » →
   « … messages d'essai, quel que soit le module ».
4. ✅ Critère : en navigateur, la ligne de statut de la crypte ne mentionne
   plus les fours/Grammy ; Grammy garde ses indices.

### Étape 5 — `BASE_PLAYER` partagé
1. Créer `lib/player-template.ts` exportant `BASE_PLAYER` (la version actuelle,
   identique dans les deux copies) ; l'importer depuis
   `mcp-server/game-state.ts` ET `lib/initial-game-state.ts`.
2. ⚠️ Ajouter `"../lib/player-template.ts"` au `include` de
   `mcp-server/tsconfig.json` (même mécanique que `adventure-map.ts`), puis
   `npm run build:mcp` et vérifier que le binaire démarre.
3. ✅ Critère : tests moteur + `mcp-adventure` verts (positions/PV inchangés).

### Étape 6 — Nettoyage `context-loader`
1. Supprimer les quatre constantes `DEFAULT_*` (~150 lignes, module fantôme
   « La Crypte des Ombres Oubliées » inclus).
2. `readWithFallback` : si même le fichier du module par défaut est absent →
   pour `player-rules.md`/`dm-rules.md` lever une erreur claire (« fichier de
   règles manquant : adventures/<défaut>/… ») ; pour `adventure-module.md`/
   `player-character.md` l'erreur est déjà la bonne réponse (un module sans
   son propre module.md ne doit pas démarrer en silence sur celui d'un autre —
   SAUF le repli volontaire des règles génériques, qui lui reste).
   ⚠️ Attention : aujourd'hui `adventure-module.md` et `player-character.md`
   retombent AUSSI sur le module par défaut (fallback total). Resserrer : ces
   deux-là ne doivent retomber QUE si le module demandé est inconnu du registre
   (cas déjà géré en amont par la route/`getAdventureMap`) — sinon erreur.
3. Test : les 4 fichiers du module par défaut existent (garde-fou du repli) ;
   `tests/context-loader.test.cjs` : adapter le test « unknown module defaults
   to Grammy content » si le comportement choisi change (le documenter).
4. ✅ Critère : 109+/109+ verts, les deux modules jouables en mock.

### Étape 7 — Verrou anti-régression + finitions
1. **Test « zéro fuite »** (nouveau, ex. `tests/no-module-leaks.test.cjs`) :
   scanne les SOURCES de `lib/`, `components/`, `app/` (pas `mcp-server`, pas
   les tests, pas les commentaires si trop bruyant — au minimum les chaînes de
   `lib/dm/prompts.ts`, `lib/dm/planner.ts`, `components/Chat.tsx`) et échoue
   sur `/grammy|verger|boulangerie|dryad|grukk|tarte|mac le/i`. C'est le verrou
   qui empêche le prochain module de re-fuiter.
2. `phase-tools.ts` : description de `spawn_monster` générée depuis
   `Object.keys(MONSTER_TEMPLATES).join(', ')`.
3. Optionnel : `git mv scripts/playtest.cjs scripts/playtest-grammys.cjs` +
   alias npm `playtest` conservé ; noter dans le README qu'un playtest
   tide-crypt est un chantier ouvert.
4. README : mettre à jour la checklist « Ajouter un module d'aventure » —
   ajouter `definition.ts` (welcome, placeholders, roomStatusHints,
   promptGuidance) à la liste, et le test anti-fuite comme garde-fou.
5. ✅ Critère final : grep de la règle d'or vide ; typecheck ; tous tests verts ;
   build ; playtest Grammy identique ; parcours navigateur des deux modules
   (landing → partie → statut vocal → battlemap).

## Critères d'acceptation globaux

- `npm run typecheck` + `npm test` (≥ 109 + les nouveaux) + `npm run build` verts.
- `npm run playtest:mock` : sortie STRICTEMENT identique (23 tours, 96 appels,
  34,8 %) — le prompt Grammy est byte-identique, donc rien ne bouge.
- `npm run eval:intent` inchangé.
- Le prompt statique et le planner de tide-crypt ne contiennent plus aucun
  terme Grammy (test dédié).
- Grep de la règle d'or vide sur `lib/`, `components/`, `app/`.
- Les deux modules jouables en navigateur, battlemaps correctes, indices de
  statut propres à chaque module.
- `MONETIZATION_ENABLED=false` (harnais de test) continue de fonctionner.

## Pièges connus

- **Byte-identique d'abord, améliorer ensuite.** À l'étape 3, résister à
  l'envie de reformuler le prompt Grammy « au passage » : toute variation
  casse la comparaison, invalide le cache Anthropic des sessions en cours et
  rend le playtest non probant. Reformuler = un commit séparé, après.
- `definition.ts` importé par le moteur = erreur de frontière (le tsconfig
  moteur n'inclut que `map.ts` ; un import transitif casserait `build:mcp` ou,
  pire, passerait et embarquerait du contenu app dans le moteur).
- `components/Battlemap.tsx` : ne pas laisser le défaut `/battlemap.png`
  pointer dans le vide après l'étape 2.
- `lib/adventures.ts` est importé par des composants client (`app/game/page.tsx`
  est `'use client'`) : `definition.ts` ne doit rien importer de serveur
  (pas de `fs`, pas de `server-logger`).
- Les caches de `lib/context-loader.ts` sont par module (Map) — les conserver
  tels quels à l'étape 6.
- Le hook de test `ts-require` transpile module par module : les nouveaux
  fichiers partagés (`player-template.ts`, `definition.ts`) fonctionneront
  d'office, rien à faire côté harnais.
