# Directives — Backend unique Postgres (suppression des stores fichiers)

> ✅ **REFACTOR TERMINÉ** (étapes 1→4 livrées). Postgres est désormais le SEUL
> backend de persistance (auth, sessions de jeu, crédits, disjoncteur
> journalier) ; le repli fichiers `.data/` et le mode auth JWT ont disparu. Les
> tests et le playtest tournent sur un pool pg-mem injecté (aucun Postgres
> réel), le dev local sur le `docker-compose.yml` fourni. Ce document reste
> comme référence de conception — le détail ci-dessous documente comment le
> câblage a été fait.

## Objectif

Un seul chemin de code de persistance : SQL Postgres, mutations atomiques,
multi-instance safe. Les tests, le playtest et les scripts tournent sans
Postgres réel grâce à **pg-mem injecté** (mécanique déjà éprouvée par
`tests/db-stores.test.cjs` via `__setDbPoolForTests`). Le dev local utilise un
Postgres Docker.

## Non-objectifs (ne PAS toucher)

- `MONETIZATION_ENABLED=false` : gate l'import paresseux de next-auth dans la
  route DM (harnais de test), PAS le backend — le conserver tel quel.
- Le rate-limit **par IP** (fenêtre mémoire par instance) : design assumé,
  seul le plafond **journalier global** a une branche mémoire à supprimer.
- `lib/session-lock.ts` (verrou in-process par session) : reste best-effort
  par instance ; les gardes atomiques SQL protègent déjà crédits/quota.
- La persistance fichier des **logs** (`server-logger.ts`, `.data/logs/`,
  `APP_LOG_PERSIST_*`) : opt-in de debug, pas un store de données.
- Le moteur MCP : il ne touche pas au disque, rien à faire.
- Pas d'ORM ni de framework de migrations : on garde `DB_SCHEMA_SQL`
  idempotent + `ADDITIVE_MIGRATIONS_SQL`.

## Inventaire EXACT du double backend (vérifié le 2026-07-03)

| Fichier | Couplage actuel | Devient |
|---|---|---|
| `lib/db.ts` | `isDatabaseEnabled()` = l'aiguillage global ; `getPool()` lève si pas de `DATABASE_URL` ; hook `__setDbPoolForTests` (pg-mem) | `isDatabaseEnabled()` supprimé (ou réduit à un garde-fou interne) ; le hook pg-mem RESTE — c'est la clef du harnais de test |
| `lib/session-store.ts` | Dispatch `isDatabaseEnabled()` → `session-store-db.ts` ou fichiers `.data/sessions/*.json` (`GAME_SESSION_STORE_DIR`) ; `listFileSessions()` pour l'import | Contient DIRECTEMENT l'implémentation SQL (fusion de `session-store-db.ts`) ; même API publique (`loadSession`, `saveSession`, `deleteSession`, `listSessionsByOwner`) — zéro changement de call-site |
| `lib/session-store-db.ts` | Implémentation Postgres | Fusionné dans `session-store.ts` puis SUPPRIMÉ |
| `lib/credits-store.ts` | Dispatch + backend fichiers `.data/credits/` (`CREDITS_STORE_DIR`) ; champ `processedEventIds` (idempotence fichier uniquement) | Implémentation SQL fusionnée (de `credits-store-db.ts`) ; `processedEventIds` retiré de `UserCredits` (l'idempotence Stripe vit dans la table `stripe_events`) |
| `lib/credits-store-db.ts` | Implémentation Postgres | Fusionné puis SUPPRIMÉ |
| `lib/rate-limit.ts` | `consumeDailyGlobalBudget` : compteur SQL si DB, sinon `memoryDailyCount` | Branche mémoire supprimée ; `__resetRateLimitForTests` ne reset plus que les buckets IP |
| `lib/auth.ts` | Deux modes : pg-adapter + stratégie `database` si DB, sinon JWT (`provider:accountId`) — **évalué À L'IMPORT** | PostgresAdapter + `database` TOUJOURS ; callbacks JWT supprimés ; `session.userId` = `users.id` toujours |
| `lib/config-check.ts` | `DATABASE_URL` absente en prod = simple warning | **FATAL** en production (monétisation active ou non) ; en dev, message clair pointant vers docker compose |
| `lib/entitlements.ts` | Indifférent au backend (via credits-store) | Inchangé (vérifier que rien ne casse) |
| `scripts/db-import-file-stores.cjs` + `npm run db:import` | Import ponctuel `.data/` → Postgres | SUPPRIMÉS (après l'import final de l'étape 0) |
| `scripts/playtest.cjs` | `GAME_SESSION_STORE_DIR` vers un tmpdir (backend fichier) | Bootstrap pg-mem in-process (le playtest importe la route dans SON process : `__setDbPoolForTests` fonctionne) |
| `scripts/dev-mock.cjs` / `npm run dev` | Fonctionnent sans DB (fichiers + JWT) | Exigent `DATABASE_URL` (Postgres Docker local) |
| `Dockerfile` | `GAME_SESSION_STORE_DIR=/data/sessions`, `mkdir /data/sessions`, ENTRYPOINT gosu/chown de `/data` | Tout le câblage `/data` supprimé ; ENTRYPOINT simplifié (garder l'utilisateur non-root) |
| Tests fichiers : `session-store.test.cjs`, `credits-store.test.cjs`, `stripe-webhook.test.cjs`, `abuse-guards.test.cjs` (branche mémoire), `dm-api.test.cjs`, `dm-adventure-selection.test.cjs`, `sessions-api.test.cjs` | `delete process.env.DATABASE_URL` + tmpdirs `GAME_SESSION_STORE_DIR`/`CREDITS_STORE_DIR` | Tous sur pg-mem via un helper partagé (étape 1) |
| `tests/db-stores.test.cjs` | Déjà pg-mem — LE modèle à généraliser | Absorbe (ou côtoie) les tests de stores migrés |
| README, `.env.example`, `AGENTS.md`, `lib/CLAUDE.md`, `tests/CLAUDE.md`, `scripts/CLAUDE.md` | Documentent le tableau « Sans/Avec DATABASE_URL » et le mode JWT | Réécrits : Postgres unique, pg-mem pour les tests, Docker pour le dev |

## Décisions d'architecture (tranchées — ne pas rouvrir sans raison)

1. **Tests/playtest sans Postgres réel = pg-mem injecté**, jamais un backend
   fichier ressuscité. Un helper unique `tests/helpers/pg-mem.cjs` encapsule
   le rituel : poser `DATABASE_URL=postgres://pg-mem/in-memory` **avant tout
   require de lib/**, installer ts-require, créer `newDb()`, injecter via
   `__setDbPoolForTests`. `node --test` lance chaque fichier dans son propre
   process → une base pg-mem vierge par fichier, aucune fuite inter-tests.
2. **Dev local = vrai Postgres via Docker** (`docker-compose.yml` fourni).
   PAS de pg-mem embarqué dans le runtime Next : dépendance prod inutile et
   comportements non strictement Postgres. pg-mem reste en devDependency.
3. **Fusion des `*-db.ts` dans les façades** (`session-store.ts`,
   `credits-store.ts`) plutôt que l'inverse : les chemins d'import existants
   (`@/lib/session-store`, `@/lib/credits-store`) ne bougent pas — zéro
   call-site modifié dans app/ et lib/dm/.
4. **`users.id` devient LA clé unique des soldes.** Les soldes historiques du
   mode JWT (`provider:accountId`) ne sont réattribuables qu'à la main —
   c'était déjà le cas (voir l'en-tête de `db-import-file-stores.cjs`).

## Plan d'exécution (ordre impératif)

### Étape 0 — Constat et sauvegarde (aucun code)
1. Vérifier que la prod (Railway) a bien `DATABASE_URL` — si oui, la prod est
   DÉJÀ en Postgres et rien ne change pour elle.
2. S'il existe des `.data/sessions` ou `.data/credits` locaux à conserver :
   dernier `npm run db:import` maintenant (le script disparaît à l'étape 3).
3. ✅ Critère : décision explicite consignée (prod OK, données locales
   importées ou sacrifiées).

### Étape 1 — Harnais pg-mem partagé, AVANT de toucher lib/
Le double backend existe encore ; on ne change QUE le mode des tests.
1. Créer `tests/helpers/pg-mem.cjs` : `installPgMem()` qui pose l'env, appelle
   `installTsRequireWithAliases()`, construit le pool pg-mem et l'injecte via
   `lib/db.ts#__setDbPoolForTests`. Retourne `{ restore }`.
   ⚠️ ORDRE CRITIQUE : `process.env.DATABASE_URL` doit être posé AVANT le
   premier `require` d'un module lib — `lib/auth.ts` évalue
   `isDatabaseEnabled()` à l'IMPORT (config NextAuth), pas à l'appel.
2. Basculer un par un : `dm-api.test.cjs`, `dm-adventure-selection.test.cjs`,
   `sessions-api.test.cjs`, `stripe-webhook.test.cjs` — remplacer
   `delete process.env.DATABASE_URL` + tmpdirs par `installPgMem()`.
   Supprimer les nettoyages de tmpdir devenus inutiles.
3. `session-store.test.cjs` et `credits-store.test.cjs` : convertir en tests
   pg-mem des MÊMES invariants (normalisation, round-trip, refus solde nul,
   remboursement, idempotence par eventId via `stripe_events`). Ce qui ne
   teste QUE la mécanique fichier (fichiers corrompus, ENOENT) disparaît.
4. `abuse-guards.test.cjs` : la partie plafond journalier passe sur pg-mem
   (le rate-limit IP reste tel quel, il est mémoire par design).
5. `scripts/playtest.cjs` : bootstrap pg-mem (même rituel que le helper, en
   CJS direct) à la place de `GAME_SESSION_STORE_DIR`.
6. ✅ Critères : `npm test` vert avec **plus aucun** `delete
   process.env.DATABASE_URL` ni `GAME_SESSION_STORE_DIR`/`CREDITS_STORE_DIR`
   dans tests/ ; `npm run playtest:mock` — mêmes nombres qu'avant
   (23 tours, ratio ≈ 0,348, voir scripts/CLAUDE.md).

### Étape 2 — Dev local sur Postgres réel
1. Ajouter `docker-compose.yml` (service `postgres:16-alpine`, volume nommé,
   port 5432, POSTGRES_PASSWORD simple) + `DATABASE_URL` d'exemple dans
   `.env.example` (section dev).
2. `lib/config-check.ts` : `DATABASE_URL` absente passe de warning à **FATAL
   en production** ; en dev, warning explicite « docker compose up -d puis
   DATABASE_URL=postgres://... dans .env.local ».
3. README : section « Lancement » documente le prérequis Postgres
   (docker compose) ; `npm run db:migrate` reste le chemin explicite.
4. ✅ Critère : `npm run dev` avec le compose → partie jouable en mock ;
   sans `DATABASE_URL` → erreur claire au premier accès store (pas un 500
   cryptique).

### Étape 3 — Suppression du backend fichier (le gros morceau)
Faire les sous-étapes dans cet ordre, typecheck entre chaque :
1. `lib/session-store.ts` : fusionner l'implémentation de
   `session-store-db.ts` dans la façade (mêmes signatures exportées),
   supprimer le dispatch, le backend fichier, `listFileSessions`,
   `GAME_SESSION_STORE_DIR`. Supprimer `session-store-db.ts`.
2. `lib/credits-store.ts` : idem avec `credits-store-db.ts`. Retirer
   `processedEventIds` de `UserCredits` (vérifier ses lecteurs : tests
   webhook + normalisation — l'idempotence est portée par `stripe_events`).
   Conserver les fonctions `import*` UNIQUEMENT si l'étape 0 a montré un
   besoin résiduel, sinon les supprimer avec le script.
3. `lib/rate-limit.ts` : supprimer la branche `memoryDailyCount` de
   `consumeDailyGlobalBudget`.
4. `lib/auth.ts` : supprimer la branche JWT (adapter + `database` toujours) ;
   simplifier le callback `session` (plus de `token.userId`) ; mettre à jour
   le commentaire d'en-tête.
5. Supprimer `scripts/db-import-file-stores.cjs` + l'entrée `db:import` de
   package.json.
6. `Dockerfile` : retirer `GAME_SESSION_STORE_DIR`, `/data`, le chown/gosu de
   `/data` (garder l'exécution non-root et `.data` seulement si la
   persistance de logs opt-in doit rester possible).
7. `lib/db.ts` : `isDatabaseEnabled()` n'a plus de consommateur légitime —
   le supprimer et laisser `getPool()` porter l'erreur « DATABASE_URL
   manquante ». ⚠️ Garder `__setDbPoolForTests` et `getAuthDbClient`.
8. ✅ Critères : `grep -rn "isDatabaseEnabled\|GAME_SESSION_STORE_DIR\|CREDITS_STORE_DIR\|\.data/sessions\|\.data/credits" lib app scripts tests` → VIDE
   (hors commentaires historiques éventuels) ; typecheck + 114+ tests verts ;
   `npm run build` OK.

### Étape 4 — Documentation et guides agents
1. README : supprimer le tableau « Sans/Avec DATABASE_URL » (Postgres
   partout), réécrire la note sur la persistance d'état et la section
   déploiement (DATABASE_URL obligatoire).
2. `.env.example` : `DATABASE_URL` passe en variable REQUISE documentée,
   suppression de `GAME_SESSION_STORE_DIR`.
3. `AGENTS.md` : l'invariant « MONETIZATION_ENABLED=false » reste ; ajouter
   que la persistance est Postgres-only et que les tests passent par le
   helper pg-mem. `lib/CLAUDE.md` : remplacer la section « Stores à double
   backend » (l'évolution de schéma se fait désormais : SQL dans
   `DB_SCHEMA_SQL` + migration additive + test pg-mem). `tests/CLAUDE.md` :
   documenter `installPgMem()` comme préface standard. `scripts/CLAUDE.md` :
   retirer la mention `GAME_SESSION_STORE_DIR` du playtest.
4. Marquer CE document comme ✅ TERMINÉ (même bandeau que
   multi-adventure-architecture.md).
5. ✅ Critère : plus aucune doc ne décrit le backend fichier comme existant.

## Critères d'acceptation globaux

- `npm run typecheck` + `npm test` (114+) + `npm run build` verts, sans
  Postgres réel installé (pg-mem porte toute la suite).
- `npm run playtest:mock` : nombres inchangés (23 tours, ratio ≈ 0,348).
- Une partie complète jouable en navigateur via `npm run dev` + docker
  compose (les deux modules, sessions listées dans « Mes parties »,
  reprise après refresh).
- Aucune écriture dans `.data/sessions` ni `.data/credits` où que ce soit.
- La CI GitHub Actions reste verte SANS service Postgres (elle ne lance que
  typecheck + build ; si on y ajoute `npm test` un jour, pg-mem suffit).
- Comportement prod Railway inchangé (elle tournait déjà en Postgres).

## Pièges connus

- **`lib/auth.ts` s'évalue à l'import** : dans tout test/script, poser
  `DATABASE_URL` avant le moindre require transitif de `lib/auth.ts` (la
  route DM importe entitlements → auth PAR IMPORT PARESSEUX, mais
  sessions-api/stripe-webhook peuvent l'atteindre plus tôt). Le helper
  `installPgMem()` doit être la PREMIÈRE ligne utile du fichier de test.
- **pg-mem n'est pas Postgres** : le schéma actuel et tous les motifs SQL du
  code (ON CONFLICT, UPDATE gardé, JSONB) passent — c'est prouvé par
  db-stores.test.cjs. Si un nouveau SQL échoue sous pg-mem mais est légitime,
  préférer réécrire la requête en SQL plus standard ; n'introduire un
  contournement spécifique pg-mem qu'en dernier recours, commenté.
- **Ne pas confondre les deux interrupteurs** : `MONETIZATION_ENABLED=false`
  (tests, évite next-auth) survit à la migration ; c'est `DATABASE_URL`
  optionnelle qui meurt.
- **`processedEventIds`** : des sessions JSON/fixtures peuvent encore porter
  ce champ — la normalisation doit l'ignorer silencieusement, pas planter.
- **Dockerfile** : l'ENTRYPOINT actuel (mkdir/chown/gosu) existe parce qu'un
  volume Railway montait `/data` en root. En supprimant `/data`, vérifier
  qu'aucun volume n'est encore attaché au service Railway (sinon il masquera
  un chemin devenu inutile — inoffensif mais trompeur).
- **Ordre des étapes 1 → 3** : basculer les tests sur pg-mem PENDANT que le
  backend fichier existe encore permet de bisecter un échec (test cassé vs
  suppression cassée). Ne pas fusionner les deux étapes « pour aller plus
  vite ».
- Les tests migrés doivent garder leurs assertions MÉTIER (solde, quota,
  idempotence, ownership 403/409) — la migration change le support de
  stockage, pas ce qui est garanti.
