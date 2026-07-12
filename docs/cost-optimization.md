# Optimisation des coûts LLM

État des lieux du pipeline, corrections appliquées, et réponse à la question
« peut-on faire mieux que Haiku (planner) + Sonnet (narration) ? » ainsi qu'à
l'évaluation de la bibliothèque `headroom-ai`.

## Pipeline actuel (par message joueur)

| Étape | Modèle | Rôle | Coût typique |
|---|---|---|---|
| `dm.plan` | Haiku 4.5 (`$1/$5` par MTok) | Classifieur d'intention : décide quel tool MCP est requis, exécute les marqueurs de scène | ~1-2k tokens in, ~100 out → ≈ $0.002 |
| `dm.turn` (boucle) | Sonnet 4.6 (`$3/$15` par MTok) | Narration + tool-use agentique (1-3 appels) | dominant : ≈ $0.01-0.05/tour selon cache |
| `history.compress` | Haiku 4.5 | Résumé de l'historique ancien (déclenché rarement) | ≈ $0.001, amorti |

Le poste dominant est **l'input Sonnet répété à chaque itération** de la boucle
tool-use (prompt statique + état + historique). Le prompt caching le ramène à
0,1× sur les tours suivants dans la fenêtre de 5 min.

### Restructuration du caching (2026-07-12) — IMPLÉMENTÉ

Mesure production (18 messages, session fey-shadow-fair) : **0,094 $/message**,
dont **63 % en input non caché** (~6 500 tokens plein tarif par appel Sonnet
malgré 62,8 % de hit cache). Cause : l'ancien `buildSystemBlocks` émettait un
2ᵉ bloc système *dynamique* reconstruit à chaque itération (état muté), placé
ENTRE le préfixe caché et les messages → il n'invalidait pas le statique mais
laissait historique + transcript tool-use hors cache, re-payés 3-5×/message.

Correctif (lib/dm/prompts.ts + app/api/dm/route.ts) : système = bloc statique
SEUL ; contexte volatil déplacé dans le message user du tour courant, gelé à
l'ouverture du tour (état frais via `tool_result`, pas de re-sérialisation) ;
breakpoints de cache sur fin d'historique + message de tour + glissant sur le
dernier `tool_result`. `LLM_MAX_CALLS_PER_REQUEST` défaut 10→6 (max observé 5).
Cibles (à confirmer sur mesure live, cf. brief) : input non caché < 2 000
tokens/appel Sonnet, hit cache > 85 %, ≤ 0,06 $/message. Détail et critères
d'acceptation : docs/opus-brief-reduction-cout-llm.md.

## Corrections appliquées

1. **Tarification par modèle** ([lib/anthropic-usage.ts](../lib/anthropic-usage.ts)) —
   l'estimateur facturait *tous* les appels au tarif Haiku, y compris la
   narration Sonnet (3× plus chère en input, 3× en output). Le budget affiché
   en jeu et les seuils de playtest (`PLAYTEST_MAX_COST_USD`) sous-estimaient
   donc le coût réel d'un facteur ~3-5. Table de prix par modèle ajoutée
   (Haiku 1/5, Sonnet 3/15, Opus 5/25 ; cache write 5m = 1,25× input,
   1h = 2× input, read = 0,1× input). **Recalibrer `PLAYTEST_MAX_COST_USD`**
   après cette correction (les mêmes parties « coûtent » désormais leur vrai prix).

2. **Monétisation** — le débit de tokens se fait AVANT les appels LLM et se
   rembourse en cas d'erreur serveur : aucune requête Anthropic n'est émise
   pour un utilisateur sans quota (`402` immédiat, coût nul).

## Ce qui est déjà bien (à conserver)

- **Split Haiku/Sonnet** : le classifieur ne narre pas, tool forcé
  (`tool_choice: decide_action`), 400 tokens max — c'est le bon modèle au bon
  endroit. Descendre la narration sur Haiku dégraderait sensiblement la
  qualité d'écriture pour ~×3 d'économie ; à ne tester que via
  `DM_MODEL=claude-haiku-4-5` en A/B si le besoin devient critique.
- **Prompt caching** sur le bloc système statique (règles + module). Le
  breakpoint couvre aussi les tools envoyés avant le système — deux variantes
  de cache (exploration/combat), c'est voulu.
- **État sérialisé compact** par phase, tools filtrés par phase, room detail
  injecté seulement pour la salle courante, compression d'historique Haiku.
- **Garde-fous** : `LLM_MAX_CALLS_PER_REQUEST`, plafonds de sortie, mode mock
  pour les tests.

## Pistes supplémentaires (par ROI décroissant)

0. **Une variante de cache par module d'aventure** (multi-modules) : le bloc
   système statique inclut le contexte du module (`buildStaticPrompt(adventureId)`),
   donc chaque aventure a sa propre entrée de cache Anthropic — c'est attendu et
   sain (les préfixes diffèrent légitimement). Ne pas chercher à « fusionner »
   les caches entre modules.
1. **Ne pas invalider le cache pendant la boucle** — RÉSOLU le 2026-07-12
   (voir « Restructuration du caching » ci-dessus). Le contexte volatil ne
   vit plus dans un bloc système reconstruit à chaque itération : il est gelé
   dans le message user du tour, et un breakpoint glissant cache le transcript
   tool-use. Toute future insertion de contenu dynamique DANS le bloc statique
   (`buildStaticPrompt`) casserait tout : à surveiller en revue.
2. **Cache TTL 1h pour les sessions longues** (`LLM_PROMPT_CACHE_TTL=1h`) :
   write 2× au lieu de 1,25×, rentable dès que le joueur laisse passer >5 min
   entre deux messages (fréquent en jeu de rôle). Bon candidat par défaut en
   prod.
3. **Court-circuit du planner sur les évidences** : un message qui matche déjà
   les regex déterministes (coordonnées explicites, « je passe mon tour »)
   n'a pas besoin de l'appel Haiku (~$0.002 + ~500 ms de latence). Gain
   modeste, risque faible ; à implémenter derrière un flag
   (`LLM_PLANNER_SKIP_OBVIOUS`) et à valider avec `npm run eval:intent`.
4. **Ne PAS mettre de cache_control sur le prompt du planner** : le minimum
   cacheable de Haiku 4.5 est de **4096 tokens** ; le prompt du classifieur
   (~1-2k tokens) resterait silencieusement non caché (`cache_creation: 0`).
5. **`disable_parallel_tool_use` déjà appliqué sous forçage** ; en `auto`, les
   tool calls parallèles restent utiles (move + trigger_room_event).

## headroom-ai : avis — déconseillé ici

`headroom-ai` (0.22.4) compresse le contexte conversationnel via un **proxy
Headroom auto-hébergé ou leur API cloud** placé entre l'app et Anthropic.
Constat pour ce projet :

- **Dépendance d'infrastructure dans le chemin critique** : chaque tour de jeu
  passerait par un proxy supplémentaire (à héberger, monitorer) ou par un
  service tiers payant — à l'opposé de l'objectif prod-ready mono-service.
- **Casse le prompt caching Anthropic** : la compression réécrit les messages,
  donc le préfixe change d'une requête à l'autre → invalidation du cache qui
  fournit aujourd'hui l'essentiel des économies (lecture à 0,1×). Le gain de
  compression serait largement mangé par la perte de cache.
- **Risque fonctionnel élevé** : le DM dépend d'un couplage strict entre
  l'état moteur JSON, les tool schemas et l'historique. Une compression
  lossy générique peut supprimer un fait mécanique (HP, position, DD) et
  provoquer des narrations contradictoires — exactement ce que le moteur MCP
  et les TurnTraces cherchent à empêcher.
- **Maturité faible** : 2 versions publiées, première release il y a ~1 mois,
  pas de recul communautaire.
- **Redondant** : le projet fait déjà de la compression *ciblée métier*
  (résumé Haiku de l'historique, état compact par phase, module indexé) —
  plus sûre qu'une compression générique car elle sait ce qui est mécanique
  et ce qui est de la couleur.

**Conclusion** : garder la stratégie actuelle (caching + compression métier +
split Haiku/Sonnet). Réévaluer headroom-ai seulement si un jour l'historique
non compressible devient le poste de coût dominant, ce qui n'est pas le cas.
