# Contexte LLM et coûts d’inférence

Le transport live unique est vLLM ; le mode mock reste hors ligne.
Le système permanent contient le contrat commun, la fiche et l’index du module.
Les procédures détaillées sont versionnées dans `lib/dm/rule-guides.json` et
consultées explicitement via `get_rules_support({domain})`. `discover_tools`
charge les schémas spécialisés demandés par le MJ, sans exécuter de jeu.

Le contexte d’aventure reste local à la carte et aux salles pertinentes. Le
résumé conserve les faits établis, les secrets restent confidentiels et les
résultats mécaniques font autorité. `/tokenize` vérifie chaque requête live,
y compris après découverte d’outils, avant toute génération.

Les tarifs par million de tokens sont optionnels (`VLLM_INPUT_USD_PER_MTOK`,
`VLLM_OUTPUT_USD_PER_MTOK`), zéro par défaut. Ils ne représentent pas le coût
de location GPU/stockage. Le cache de préfixe éventuel est géré côté vLLM.

Configuration et limites : [guide vLLM](qwen-runpod-vllm.md).
Validation locale : `npm run typecheck`, `npm test`, `npm run playtest:mock`.
Le mock valide le pipeline ; aucune qualité du modèle réel n’est déduite de
ces contrôles. Aucune évaluation payante n’est requise par cette refonte.
