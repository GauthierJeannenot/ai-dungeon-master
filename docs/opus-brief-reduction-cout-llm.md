# Brief Opus — réduire le coût LLM par message (~0,094 $ → cible ≤ 0,06 $)

> **Public** : agent (Opus) chargé d'implémenter l'optimisation du prompt
> caching dans la boucle DM. Instructions autonomes : tout le contexte
> nécessaire est ici + dans lib/dm/CLAUDE.md (à lire AVANT de coder).
> **Statut** : ✅ IMPLÉMENTÉ le 2026-07-12 (Opus). Voir « Résultat » en fin de
> document. Reste à confirmer les cibles chiffrées sur mesure LIVE (le compte
> API Anthropic était à court de crédits au moment de l'implémentation).

## Baseline mesurée (production Railway, 2026-07-12, 18 messages joueur)

Source : événements `anthropic.usage` (lib/anthropic-usage.ts) via
`GET /api/debug/logs?event=anthropic.usage` (Bearer `APP_DEBUG_LOG_TOKEN`).

| Métrique | Valeur |
|---|---|
| Coût moyen / message joueur | **0,094 $** (médiane 0,089, p90 0,183) |
| Appels LLM / message | 3,8 (dont ~2,6 appels Sonnet `dm.turn`) |
| Part de Sonnet dans le coût | 93 % |
| Part de l'**input non caché** dans le coût total | **63 %** |
| Input non caché / appel Sonnet | **médiane 6 538 tokens** (p90 7 110) plein tarif |
| Hit cache (read / input total) | 62,8 % (3 appels Sonnet / 46 sans aucun hit) |
| Itérations boucle tool-use / message | médiane 3, max observé 5 |

Le préfixe statique (tools + bloc système `cache_control`) cache très bien.
Le problème est **tout ce qui vient après**.

## Cause racine (diagnostic déjà fait — ne pas re-enquêter)

`buildSystemBlocks` (lib/dm/prompts.ts:289) émet `[statique(cache_control),
dynamique]`. Le bloc **dynamique** (résumé + contexte carte + salle + état JSON
+ directive) est le 2ᵉ bloc *système* : il est donc situé **entre** le préfixe
caché et les `messages`. Conséquences :

1. **Entre messages joueur** : l'historique (12–18 tours, ~4–5k tokens) est
   re-payé plein tarif à chaque requête — aucun breakpoint ne le couvre, et
   même s'il y en avait un, le bloc dynamique placé avant l'invaliderait.
2. **Pendant la boucle** : app/api/dm/route.ts:608 reconstruit
   `buildSystemBlocks(currentGameState, …)` à CHAQUE itération (l'état mute
   après un tool call). Chaque itération invalide donc tout le suffixe :
   historique + transcript tool_use/tool_result accumulé sont re-payés
   plein tarif 3 à 5 fois par message.

C'est ça, les ~6,5k tokens non cachés par appel = 63 % du coût.

## Mission (option retenue : restructurer, pas rogner le contenu)

Déplacer le contenu volatil APRÈS le préfixe cacheable, selon le pattern
Anthropic standard (jusqu'à 4 breakpoints autorisés) :

1. **Sortir le bloc dynamique du `system`** : le système ne contient plus que
   le bloc statique (inchangé, byte-identique, `cache_control` conservé —
   invariant n°1 de lib/dm/CLAUDE.md). Le contenu de `buildDynamicPrompt`
   devient un bloc dans le **dernier message user** (celui du tour courant),
   après l'historique.
2. **Breakpoint sur l'historique** : `cache_control` sur le dernier bloc du
   dernier tour d'historique *stable* (avant le message du tour courant).
   Ainsi `tools + system statique + historique` est un préfixe caché
   partagé entre les requêtes successives d'une même session (l'historique
   ne fait que croître par la fin ; la compression Haiku qui réécrit le début
   invalide légitimement — c'est rare et amorti).
3. **Breakpoint glissant dans la boucle** : à chaque itération, poser
   `cache_control` sur le dernier `tool_result` poussé (et le retirer du
   précédent — max 4 breakpoints au total). L'itération n+1 relit alors tout
   le transcript de l'itération n à 0,1×. Condition sine qua non : le
   `system` doit rester **byte-identique pendant toute la boucle** — c'est
   le point 1 qui le permet.
4. **État frais en cours de boucle** : aujourd'hui la mise à jour d'état
   passe par la reconstruction du bloc système dynamique. Après le point 1,
   NE PAS re-sérialiser tout l'état à chaque itération : les `tool_result`
   portent déjà l'issue mécanique. Si un delta d'état synthétique est
   vraiment nécessaire (à évaluer sur playtest), l'ajouter en fin de
   `tool_result` (donc après le préfixe caché), jamais dans le système.
5. **Bonus faible risque** : abaisser `LLM_MAX_CALLS_PER_REQUEST` (défaut 10,
   route.ts:97) à 6 — max observé en prod : 5. Simple borne de sécurité coût.

Ne PAS toucher : le split Haiku/Sonnet, le planner (pas de `cache_control`
sur son prompt : minimum cacheable Haiku = 4096 tokens, il en fait ~1-2k),
le TTL (défaut déjà `1h`, prompts.ts:26), `DM_EFFORT` (déjà `medium`),
le contenu/formulation du prompt statique (toute reformulation = commit
séparé mesuré, cf. lib/dm/CLAUDE.md).

## Garde-fous (échec = revert, pas de contournement)

- **Lire lib/dm/CLAUDE.md et docs/cost-optimization.md avant de coder.**
- Prompt statique byte-identique d'un appel à l'autre : rien de variable
  (état, timestamp, sessionId) ne doit y entrer.
- Zéro vocabulaire de module dans lib/ (verrou tests/no-module-leaks.test.cjs).
- Le mock (`createMockLlmMessage`, lib/dm/llm.ts) ignore le caching mais lit
  `params.messages` : si la position du message joueur change, vérifier que
  `lastUserText`/`context.playerMessage` pilotent toujours les tools mock —
  les 114+ tests et `npm run playtest:mock` en dépendent.
- La narration finale de secours (route.ts:709, système sans bloc dynamique)
  doit rester cohérente avec la nouvelle structure.

## Critères d'acceptation

1. `npm run typecheck` + `npm test` verts ; `npm run playtest:mock` : comparer
   les NOMBRES à master (23 tours, ratio ≈ 0,348) — l'exit code 1 est attendu.
2. Sur un playtest live court (ou 10 messages prod), via `anthropic.usage` :
   - input non caché / appel Sonnet : **médiane < 2 000 tokens** (vs 6 538) ;
   - hit cache (read / input total) : **> 85 %** (vs 62,8 %) ;
   - coût / message : **≤ 0,06 $** en moyenne (vs 0,094 $).
3. Qualité narrative inchangée à l'œil sur le playtest (pas de narration qui
   « oublie » un changement d'état en cours de boucle — c'est LE risque du
   point 4 ; si ça se produit, réinjecter un delta d'état compact dans les
   tool_results plutôt que de revenir au système dynamique).
4. Mettre à jour docs/cost-optimization.md (section « Pistes ») et ce brief
   (statut → FAIT + chiffres constatés) dans le même commit.

## Résultat (2026-07-12)

Implémenté conformément au plan (options 1-3 + point 5 ; point 4 laissé au
fallback « delta dans tool_result » non nécessaire pour l'instant) :

- `lib/dm/prompts.ts` : `buildSystemBlocks` (2 blocs système) remplacé par
  `buildStaticSystemBlocks` (statique seul, cacheable) + `buildTurnUserMessage`
  (contexte volatil gelé dans le message user du tour) + `withCachedHistoryPrefix`
  (breakpoint fin d'historique) + `promptCacheControl` (descripteur unique).
- `app/api/dm/route.ts` : système statique construit une fois hors boucle ;
  directive du classifieur gelée dans le message de tour, enforcement via
  `tool_choice` seul ; breakpoint glissant sur le dernier `tool_result` (retiré
  du précédent, ≤ 4 breakpoints) ; `LLM_MAX_CALLS_PER_REQUEST` 10→6 ; fallback
  narration restructuré (système statique seul).
- `lib/dm/CLAUDE.md`, `docs/cost-optimization.md` mis à jour.

**Validation** : `npm run typecheck` ✓ ; `npm test` 173/173 ✓ ;
`npm run playtest:mock` : 23 tours, ratio 0,3478 (= master), 15 errors / 15
empty **identiques à master** (aucune régression), et
`averageLlmCallsPerTurn` **4,17 → 2,78** (effet du cap 10→6, visible même en
mock qui ignore le cache). Exit 1 attendu (seuils aspirationnels).

**Critères LIVE non vérifiés** (compte Anthropic à sec depuis le 12-07 06:43) :
input non caché < 2 000 tokens/appel Sonnet, hit cache > 85 %, ≤ 0,06 $/message.
Dès les crédits rechargés, relire `anthropic.usage` sur ~10 messages prod et
consigner les chiffres ici (+ criterion 3 qualité narrative).
