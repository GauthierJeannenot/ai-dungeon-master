# API OpenAI

Le fournisseur actif est OpenAI, via `POST /v1/responses`. Le MJ, ses reprises
de narration et la compression de l'historique passent tous par
`createLlmMessage` (`lib/dm/llm.ts`) puis `lib/dm/openai.ts`.

```dotenv
LLM_PROVIDER=openai
LLM_MODE=live
ALLOW_PAID_LLM=true
OPENAI_API_KEY=<cle-api-openai>
DM_MODEL=gpt-5.4-mini
```

`DM_COMPRESS_MODEL` utilise le même modèle par défaut. `OPENAI_BASE_URL`
vaut `https://api.openai.com/v1`, `OPENAI_TIMEOUT_MS` vaut 60000. Les clés sont
exclusivement côté serveur. Les erreurs publiques n'incluent jamais le corps
HTTP du fournisseur. Aucun retry ou fournisseur de secours implicite.

Le modèle par défaut a une fenêtre de 400000 tokens et un effort de raisonnement
par défaut `none`. Pour changer de modèle, renseigner sa fenêtre documentée
dans `OPENAI_CONTEXT_WINDOW_TOKENS`. Un compresseur différent peut avoir sa
propre valeur `OPENAI_COMPRESS_CONTEXT_WINDOW_TOKENS` ; sinon il utilise la
fenêtre configurée commune. La configuration de production est validée au boot.
`OPENAI_REASONING_EFFORT` est facultatif et doit être compatible avec le modèle.
Si le raisonnement est activé, augmenter `LLM_MAX_TOKENS` et
`LLM_COMPRESS_MAX_TOKENS` (300 par défaut) si nécessaire : les tokens de
raisonnement consomment aussi la sortie.

### Profil MJ GPT-6.2 Sol

Configuration locale sélectionnée le 23 novembre 2026 dans `.env.local` :

```dotenv
DM_MODEL=gpt-6.2-sol
DM_COMPRESS_MODEL=gpt-5.4-mini
OPENAI_CONTEXT_WINDOW_TOKENS=922000
OPENAI_COMPRESS_CONTEXT_WINDOW_TOKENS=400000
OPENAI_REASONING_EFFORT=low
LLM_MAX_TOKENS=8192
LLM_COMPRESS_MAX_TOKENS=2048
```

Le MJ et ses reprises de narration utilisent Sol ; les résumés restent sur mini.
Sol refuse l'effort `none`. Le réglage de raisonnement étant partagé, le budget
du compresseur est également augmenté. Ces budgets incluent le raisonnement et
ne sont pas une longueur cible pour la narration. La limite locale de 922000
tokens borne prudemment les requêtes au maximum d'entrée documenté de Sol,
avant déduction de la sortie réservée et de la marge ; sa fenêtre totale est
de 1050000 tokens. La limite distincte de mini reste de 400000 tokens.
Les valeurs de repli du code restent inchangées. Next recharge `.env.local` en
développement ; un serveur de production doit être redémarré avec ces variables.

Référence : [GPT-6.2 Sol](https://developers.openai.com/api/docs/models/gpt-6.2-sol).

Avant chaque génération, `/v1/responses/input_tokens` compte les instructions,
l'historique, les schémas réellement exposés et le transcript courant. Le budget
réserve la sortie et `LLM_CONTEXT_RESERVE_TOKENS` (4096 par défaut). Une panne du
comptage bloque le tour ; le serveur ne tronque pas silencieusement le contexte.
La compression continue à préserver les échanges complets et les checkpoints
mécaniques. `store:false` et `truncation:disabled` laissent l'historique sous le
contrôle de l'application ; les continuations de raisonnement chiffrées sont
réémises avec leurs appels outils dans le tour courant.

Les schémas MCP restent inchangés (`strict:false`). Les appels parallèles sont
désactivés et refusés à la réception. Les arguments JSON du modèle passent
intacts au moteur, qui reste la seule autorité mécanique. La prose accompagnant
un appel outil est toujours exclue du transcript et de la narration publiée.

`LLM_MODE=mock` et `ALLOW_PAID_LLM=false` empêchent le réseau, comptage compris.
Les contrôleurs Runpod et l'ancien adaptateur vLLM sont conservés comme outillage
historique, sans utilisation par le MJ. Une configuration OpenAI ne démarre
aucun GPU, même avec des variables `RUNPOD_*` héritées. Ne pas réutiliser
`LLM_PROVIDER=vllm` pour lancer l'application.

Les journaux et traces distinguent fournisseur, tokens non cachés, tokens cachés
et sortie. L'estimation de coût utilise exclusivement les tarifs configurés :
`OPENAI_INPUT_USD_PER_MTOK`, `OPENAI_CACHED_INPUT_USD_PER_MTOK`,
`OPENAI_OUTPUT_USD_PER_MTOK`. Sans tarifs, l'estimation vaut zéro ; consulter
OpenAI pour le montant réellement facturé.

Le générateur de jeux de données reste intégralement hors réseau et utilise
`--provider openai`. Son export `chat` garde le format Chat Completions pour les
outils d'entraînement existants ; il n'effectue aucune inférence vLLM.

Références : [Responses](https://developers.openai.com/api/reference/resources/responses/methods/create),
[comptage](https://developers.openai.com/api/docs/guides/token-counting),
[GPT-5.4 mini](https://developers.openai.com/api/docs/models/gpt-5.4-mini).
