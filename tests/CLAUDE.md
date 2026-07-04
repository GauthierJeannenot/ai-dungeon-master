# tests/ — harnais node:test (CJS)

`npm test` = `npm run build:mcp` puis `node --test tests/*.test.cjs`.
**114+ tests, zéro appel payant** : tout tourne en `LLM_MODE=mock` avec
`MONETIZATION_ENABLED=false`.

## Conventions du harnais

- Fichiers `*.test.cjs` (CommonJS). Le TypeScript de lib/ se charge via
  `tests/helpers/ts-require.cjs` (`installTsRequireWithAliases()` : transpile
  à la volée + résout l'alias `@/`).
- **Persistance = Postgres pg-mem, TOUJOURS.** Il n'y a plus de backend
  fichier. Tout test qui touche stores/auth/route/webhook/quota commence par
  `const pg = installPgMem()` (`tests/helpers/pg-mem.cjs`) AVANT tout require
  de lib/ ou app/ — ce helper installe ts-require, injecte le pool pg-mem
  (`__setDbPoolForTests`) et pose `DATABASE_URL`. `pg.restore()` dans
  `test.after()`. `node --test` isole chaque fichier dans son process → base
  pg-mem vierge par fichier. Ne jamais `delete process.env.DATABASE_URL` ni
  ressusciter un tmpdir de sessions/crédits.
- Les variables d'env de config lues À L'IMPORT (`GUEST_MESSAGE_LIMIT`,
  `SIGNUP_BONUS_TOKENS`, `LLM_MODE=mock`, `MONETIZATION_ENABLED=false`,
  `DM_*_LIMIT`…) se posent EN TÊTE, avant le require du module concerné.
- Dés déterministes : `AI_DM_TEST_DICE_SEQUENCE` (liste de valeurs) —
  sauvegarder/restaurer la valeur précédente autour du test.
- Le moteur MCP testé est le binaire COMPILÉ (`mcp-server/dist/`) : après une
  modif moteur, `npm run build:mcp` sinon on teste l'ancien code.

## Tests-verrous (ne pas affaiblir)

- `no-module-leaks.test.cjs` : grep anti-fuite — aucun vocabulaire Grammy
  (grammy, verger, dryad, grukk, tarte, mac le…) dans les sources de lib/,
  components/, app/. S'il échoue, le contenu doit déménager vers
  `adventures/<id>/definition.ts` (promptGuidance, placeholders, hints) —
  on n'ajoute PAS d'exception au test.
- `adventure-modules.test.cjs` : invariants génériques bouclés sur TOUT le
  registre (bornes des salles, entrées, encounters, PNJ, hooks, parsing du
  module .md, battlemap existante aux dimensions exactes). Un nouveau module
  y est couvert automatiquement ; un invariant qui casse = corriger la DONNÉE
  du module, pas le test.
- `dm-prompt-guidance.test.cjs` : le prompt d'un module ne contient pas le
  vocabulaire d'un autre.
- `dm-adventure-selection.test.cjs` / `sessions-api.test.cjs` : une session ne
  change jamais d'aventure (409), modules indisponibles refusés (403).

## Ajouter un test

Copier la préface d'un test existant du même domaine (dm-api pour la route,
mcp-engine pour le moteur, db-stores pour la persistance) : tous utilisent
`installPgMem()`. Les tests route appellent le handler `POST` importé
directement (pas de serveur HTTP).
