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
  (600+ tests). Si les prompts, le mock ou le contenu d'aventure changent, ajouter
  `npm run playtest:mock` : il teste le pipeline ACTUEL et doit sortir en exit 0.
  Le harnais désactive ses limites de débit et vérifie outils MCP, état renvoyé,
  persistance et résolution complète des tours. Voir scripts/CLAUDE.md.
- Il n'y a PAS d'eval d'intention : le pipeline intent + son script
  `evaluate-intent-interpreter.cjs` ont été supprimés. docs/intent-pipeline.md
  décrit une cible non implémentée — ne pas recréer ce script sans décision
  explicite.

## Suivi MCP — référence canonique

`docs/suivi-integration-mcp.md` est la référence unique des travaux issus des
audits déjà réalisés. Lire ce registre pour choisir et poursuivre un lot,
puis le mettre à jour à chaque avancée : outils/fichiers réellement intégrés,
tests exécutés, limites restantes et prochain travail concret.

Instruction explicite de l'utilisateur : **ne pas refaire d'audit global et
faire confiance à ce document**. Ne pas relancer les scanners des livres ou
les scripts d'audit/consolidation pour reconstruire le backlog. Les matrices
et JSON de `docs/rules-audit/` sont des archives, pas l'état courant. Ne pas
régénérer le registre depuis ces archives. Consulter ponctuellement la règle
et le code nécessaires au lot choisi reste permis ; vérifier et tester son
implémentation reste obligatoire. Toute découverte nouvelle pendant un lot
doit être ajoutée au registre avec sa provenance.

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
- docs/multi-map-adventures.md est IMPLÉMENTÉ (référence de conception des
  aventures multi-maps ; premier module : adventures/fey-shadow-fair/). Le
  maintenir à jour dans le même commit que toute évolution du multi-map.
- docs/playable-characters.md est IMPLÉMENTÉ (personnages jouables : catalogue
  `characters/<id>/`, registres `lib/character-registry.ts` +
  `lib/srd/{weapons,spells,skills}.ts`, session = aventure + personnage). Le
  maintenir à jour dans le même commit que toute évolution des personnages.

## Invariants transverses (ne pas casser)

1. **État serveur autoritaire** : monétisation active ⇒ gameState/history/
   summaryContext viennent de la session stockée, JAMAIS du client (anti-triche
   + anti prompt-injection). Voir app/api/dm/route.ts.
2. **Débit avant LLM, remboursement sur erreur serveur** : tout `return` 5xx
   postérieur au débit doit passer par `refundDebit` (les `return` ne passent
   pas par le `catch`).
3. **Une session = une aventure + UN personnage, pour toujours** : l'aventure
   ET le personnage se choisissent au spawn du process moteur (`ADVENTURE_ID`
   et `CHARACTER_ID`) ; un `adventureId` OU un `characterId` différent sur une
   session existante est un 409. Ne jamais introduire de bascule en cours de
   partie. Le catalogue de personnages (prétirés SRD) vit dans
   `characters/<id>/` (registre `lib/character-registry.ts`) ; voir
   docs/playable-characters.md (IMPLÉMENTÉ).
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

7. **Interprétation du joueur réservée à l'IA** : seul le modèle interprète le
   message et choisit les outils MCP et leurs arguments. Aucun planner ni
   classifieur intermédiaire. Aucun parseur d'intention, regex ou mot-clé côté serveur ne doit
   choisir une action, une cible, des coordonnées ou réécrire les arguments du
   modèle. Flux : message joueur → agent IA → MCP → moteur → résultats MCP →
   agent IA → narration. Le serveur orchestre les appels structurés ; le moteur
   valide les règles depuis les arguments et l'état. Les heuristiques du faux
   LLM sont réservées au mode `mock`, jamais utilisées en `live`. Verrou de
   régression : `tests/dm-agent-boundary.test.cjs` (absence de déclenchement
   serveur sur citations/négations/hypothèses, transmission exacte des appels).
   Aucun appel de jeu MCP ne doit être fabriqué côté serveur, même pour finir
   un tour : retourner l'état incomplet à l'agent. Les événements de scène
   exigent un appel explicite du DM. Les choix de
   cible/arme/destination absents ou ambigus sont refusés, jamais complétés.
   Verrous supplémentaires : `tests/agent-mcp-call-sites.test.cjs` et
   `tests/mcp-agent-selection.test.cjs`. Les règles déterministes (dés, portée,
   coûts, effets et tours de monstres explicitement demandés) restent au moteur.

## Guides par dossier

Décision utilisateur du 1er novembre 2026 : appliquer les règles standard
D&D 2014 par défaut. L'initiative est déterminée à l'entrée du combat, puis
son ordre reste conservé pendant toute la rencontre. Cette décision remplace
l'ancienne convention de relance à chaque round. Les variantes demandent
un choix explicite ; ne pas les activer implicitement.

Des CLAUDE.md locaux détaillent les pièges : `lib/`, `lib/dm/`, `mcp-server/`,
`adventures/`, `tests/`, `scripts/`.
