# scripts/ — outillage CJS (playtest, battlemaps, DB)

## playtest.cjs

Partie Grammy scriptée de bout en bout contre la vraie route DM (handler
importé, moteur MCP réel, LLM mock par défaut). C'est LA non-régression des
prompts : le lancer avant/après tout changement de prompt ou de contenu Grammy
(`npm run playtest:mock`) et comparer les NOMBRES (tours/appels/ratio).

Persistance : le playtest injecte un pool pg-mem dans `run()` avant de requérir
la route (même rituel que `tests/helpers/pg-mem.cjs`, en CJS direct car il a son
propre hook ts-require). Aucun Postgres réel ni dossier de sessions requis.

⚠️ `playtest:mock` **sort en exit 1 même sur master propre** : il teste des
seuils aspirationnels (`PLAYTEST_MIN_LLM_NARRATOR_RATIO=0.75`) et des attentes
du pipeline CIBLE non implémenté (engine events, affordances, intent
interpreter → « turns returned errors »). Baseline mock Grammy connu :
23 tours, ratio narrateur ≈ 0,348. La non-régression = ces nombres inchangés,
PAS un exit 0. Pour un exit 0 exploitable en CI : `--no-fail`.

Pièges hérités d'une ancienne architecture (ne pas s'y fier) :

- `--mode replay` et `--mode record` sont CASSÉS : lib/dm/llm.ts ne connaît
  que mock/live — replay part en live et échoue sur `ALLOW_PAID_LLM=false`.
- `--narration-mode` / `NARRATION_MODE` est un no-op (lu par personne).
- Les métriques `directorLocalRatio` / `narratorCounts.director|local` valent
  toujours 0 (le narrateur est toujours 'llm') — seuls
  `PLAYTEST_MAX_COST_USD`, `PLAYTEST_MAX_AVERAGE_LLM_CALLS` et
  `minLlmNarratorRatio` sont significatifs.
- `--mode live` exige `--allow-paid` : coût réel Anthropic, jamais en CI.

## Battlemaps

- Convention : `generate-battlemap-<id>.cjs` → `public/battlemaps/<id>.png`
  (pixel art aligné : dimensions multiples exactes de la grille du module).
- ⚠️ Grammy's n'utilise PLUS la sortie de son générateur : `battlemapImage`
  pointe sur `grammys_bakery.png` (image fournie à la main, redimensionnée
  1360×1200). Relancer `generate-battlemap-grammys-country-apple-pie.cjs`
  produit un fichier orphelin — inoffensif mais inutile tant que la
  définition ne le référence pas.

## DB

- `db-migrate.cjs` : applique le schéma Postgres (idempotent, aussi fait au
  premier accès runtime). Postgres est le backend unique — il n'y a plus de
  script d'import fichier (`db:import` supprimé avec le backend `.data/`).

## eval:intent

`npm run eval:intent` référence `evaluate-intent-interpreter.cjs` qui
N'EXISTE PAS (vestige du pipeline intent supprimé). Ne pas l'utiliser.
