<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# AI Dungeon Master — guide agent

Jeu de rôle D&D 5e multi-modules : Next.js (app + API routes) + moteur MCP
TypeScript spawné en **processus enfant stdio — un process par sessionId, une
aventure par process** (fixée via `ADVENTURE_ID` au spawn). Le moteur MCP est
la seule source de vérité mécanique (jets, HP, déplacement, économie d'action) ;
le LLM ne fait que narrer ce que les tools ont résolu.

## Commandes

```bash
npm ci                 # OBLIGATOIRE dans un worktree frais (node_modules absent)
npm run typecheck      # tsc mcp-server + tsc Next — c'est aussi le "lint"
npm test               # build:mcp puis node --test tests/*.test.cjs (aucun appel payant)
npm run playtest:mock  # partie Grammy scriptée complète en mock, avec seuils
npm run build          # build:mcp + next build
```

- `npm run build:mcp` est un prérequis à tout ce qui spawne le moteur (tests,
  dev, playtest) : le client cherche `mcp-server/dist/mcp-server/index.js`.
- Validation minimale avant de conclure : `npm run typecheck` + `npm test`
  (114+ tests). Si les prompts ou le contenu d'aventure changent, ajouter
  `npm run playtest:mock` — ⚠️ il sort en exit 1 même sur master propre (seuils
  aspirationnels + attentes du pipeline cible non implémenté) : comparer les
  NOMBRES (23 tours, ratio ≈ 0,348), pas le code de sortie. Voir scripts/CLAUDE.md.
- Il n'y a PAS d'eval d'intention : le pipeline intent + son script
  `evaluate-intent-interpreter.cjs` ont été supprimés. docs/intent-pipeline.md
  décrit une cible non implémentée — ne pas recréer ce script sans décision
  explicite.

## ⚠️ Le README et docs/ décrivent des features SUPPRIMÉES

Une consolidation a retiré le pipeline « director/cassettes » mais la doc n'a
pas entièrement suivi. Vérifier dans le code avant d'utiliser une feature
décrite dans README.md, docs/intent-pipeline.md ou .env.example :

- `LLM_MODE` ne supporte que `mock` et `live` (lib/dm/llm.ts). `record`,
  `replay`, les cassettes et `LLM_REPLAY_FALLBACK_TO_MOCK` n'existent plus —
  `playtest --mode replay` échoue à chaque appel LLM.
- `NARRATION_MODE`, `LLM_MAX_CALLS_PER_SESSION`, `LLM_PROMPT_CACHE_TTL`,
  `LLM_*_NARRATION_MAX_TOKENS`, `LLM_MODULE_CONTEXT_MAX_CHARS` ne sont lus
  nulle part.
- `TurnTrace` (lib/types.ts) est typé et persisté par les session-stores, mais
  RIEN ne le produit : la route DM n'écrit jamais `turnTraces`.
  docs/intent-pipeline.md décrit un pipeline CIBLE (EngineEvent, fictionFacts,
  `resolve_player_action`) non implémenté.
- docs/multi-adventure-architecture.md,
  docs/adventure-content-consolidation.md et docs/postgres-only-migration.md
  sont TERMINÉS (référence de conception, pas du travail à faire).
- docs/multi-map-adventures.md est une CIBLE EN COURS (aventures à plusieurs
  maps) : sa section « État d'avancement » fait foi. Pour implémenter, suivre
  ce document et le mettre à jour dans le même commit que toute avancée.

## Invariants transverses (ne pas casser)

1. **État serveur autoritaire** : monétisation active ⇒ gameState/history/
   summaryContext viennent de la session stockée, JAMAIS du client (anti-triche
   + anti prompt-injection). Voir app/api/dm/route.ts.
2. **Débit avant LLM, remboursement sur erreur serveur** : tout `return` 5xx
   postérieur au débit doit passer par `refundDebit` (les `return` ne passent
   pas par le `catch`).
3. **Une session = une aventure, pour toujours** : l'aventure se choisit au
   spawn du process moteur ; un `adventureId` différent sur une session
   existante est un 409. Ne jamais introduire de bascule en cours de partie.
4. **Jamais de `console.log` dans mcp-server/** : stdout = protocole MCP.
   Diagnostics sur stderr uniquement.
5. **Zéro fuite inter-modules** : aucun vocabulaire d'un module (Grammy,
   verger, dryade…) en dur dans lib/, components/, app/ — verrouillé par
   tests/no-module-leaks.test.cjs. Le contenu propre à un module vit dans
   `adventures/<id>/` (voir adventures/CLAUDE.md).
6. **MONETIZATION_ENABLED=false** est le mode des tests/scripts hors runtime
   Next : il évite l'import de next-auth/next/headers (import paresseux de
   lib/entitlements). Ne pas rendre cet import eager. À ne pas confondre avec
   `DATABASE_URL`, qui est REQUISE : Postgres est le backend unique de
   persistance (tests/playtest via pool pg-mem injecté, pas de repli fichier).

## Guides par dossier

Des CLAUDE.md locaux détaillent les pièges : `lib/`, `lib/dm/`, `mcp-server/`,
`adventures/`, `tests/`, `scripts/`.
