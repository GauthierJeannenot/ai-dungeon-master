# Qwen sur Runpod avec vLLM

L'app accepte `LLM_PROVIDER=anthropic` (défaut) ou `LLM_PROVIDER=vllm`.
Le fournisseur choisi sert les trois opérations : MJ, classification d'action et
compression d'historique. Le mode `mock` reste déterministe et sans réseau pour
les deux fournisseurs. Aucun repli automatique vers Anthropic n'est effectué.

Le moteur MCP reste un processus enfant du serveur Next.js, un par session.
Le Pod GPU héberge seulement le LLM. Cette séparation ne change pas l'hypothèse
mono-instance de l'app et ne rend pas ses moteurs MCP horizontalement scalables.

## 1. Démarrer vLLM dans un Pod Runpod

Exemple pour `Qwen/Qwen3.6-27B`, avec un GPU de 80 Go comme point de départ en
BF16. La mémoire disponible, le contexte et la concurrence doivent être mesurés
sur le GPU choisi. Une quantification ou un modèle MoE demande une validation
distincte. Commandes pour le terminal Linux du Pod :

```bash
pip install 'vllm>=0.20.2'
export VLLM_API_KEY='remplacer-par-un-secret-long-et-aleatoire'
vllm serve Qwen/Qwen3.6-27B \
  --host 0.0.0.0 --port 8000 \
  --api-key "$VLLM_API_KEY" \
  --max-model-len 32768 \
  --enable-prefix-caching \
  --reasoning-parser qwen3 \
  --enable-auto-tool-choice \
  --tool-call-parser qwen3_coder
```

Cette recette n'est pas un benchmark matériel effectué dans ce dépôt. Après
validation, figer la version vLLM et la révision des poids. Si le prompt réel
dépasse 32K tokens, augmenter la fenêtre et provisionner la mémoire associée.
Le contexte annoncé par le modèle n'est pas une promesse de capacité sur un GPU.

Dans Runpod, exposer le port **HTTP 8000** du Pod. L'URL attendue par l'app est :
`https://<pod-id>-8000.proxy.runpod.net/v1`. Ce n'est pas l'API de gestion Runpod,
ni l'endpoint Serverless `/run` ou `/runsync`. Un déploiement Serverless doit
offrir le même contrat HTTP Chat Completions pour utiliser cet adaptateur.

La clé `--api-key` protège l'inférence ; ce n'est pas une clé du compte Runpod.
Vérifier que le modèle est chargé avant de connecter l'app :

```bash
curl 'https://<pod-id>-8000.proxy.runpod.net/v1/models' \
  -H "Authorization: Bearer $VLLM_API_KEY"
```

## 2. Configuration de l'app

Dans `.env.local` ou les variables serveur de l'hébergeur :

```dotenv
LLM_PROVIDER=vllm
LLM_MODE=live
ALLOW_PAID_LLM=true
VLLM_BASE_URL=https://<pod-id>-8000.proxy.runpod.net/v1
VLLM_API_KEY=le-meme-secret-que-sur-le-pod
VLLM_TIMEOUT_MS=45000
DM_MODEL=Qwen/Qwen3.6-27B
DM_PLANNER_MODEL=Qwen/Qwen3.6-27B
DM_COMPRESS_MODEL=Qwen/Qwen3.6-27B
```

Redémarrer l'app après modification. Les trois variables de modèle sont
optionnelles : en vLLM, le MJ utilise Qwen3.6-27B par défaut ; le planner reprend
le modèle MJ et le résumé reprend le planner. Effacer les anciennes surcharges
`DM_*_MODEL=claude-...` lors du passage à Qwen. Avec `--served-model-name`,
utiliser cet alias exact côté app. Des modèles distincts nécessitent que le
même endpoint les serve effectivement.

`ANTHROPIC_API_KEY` n'est pas requise en mode vLLM, même en production.
`ALLOW_PAID_LLM=false` bloque aussi vLLM : la location du GPU reste payante.
Pour revenir à Claude, définir `LLM_PROVIDER=anthropic`, renseigner
`ANTHROPIC_API_KEY` et effacer les surcharges Qwen des trois `DM_*_MODEL` (ou les
remplacer par les modèles Claude voulus).

Le timeout est **par appel**. Un tour comprend un planner et plusieurs appels
MJ ; le budget total du déploiement Next.js doit les couvrir. La route déclare
`maxDuration=60` ; sur un hébergeur qui l'applique, adapter le budget et la taille
du modèle à la latence mesurée. Garder le worker GPU chaud pendant les parties
évite d'ajouter le chargement des poids au premier tour.

## 3. Démarrage et arrêt automatiques des Pods

Le contrôleur des Pods utilise exclusivement un **Global Volume**. Définir
`RUNPOD_GLOBAL_VOLUME_ID=<id-du-global-volume>`. Le volume doit
être monté sur `/workspace` sur le Pod initial et les remplaçants ; conserver
`HF_HOME=/workspace/huggingface` et le même secret d'inférence.

Le contrôleur utilise l'API v2 `https://api.runpod.io/v2`, vérifie l'ID et le
chemin du montage avant toute mutation et recrée le même montage global sur
un remplaçant. Les GPU peuvent être cherchés dans plusieurs datacenters.
La clé de gestion doit autoriser la lecture des Global Volumes et la gestion
des Pods v2, ainsi que les devis GraphQL. Le volume n'est jamais supprimé.
L'état utilise une clé Postgres `global:<volume-id>`.

Le tarif v2 vaut zéro pour un Pod arrêté : un devis est donc consulté avant
la reprise, puis le prix réel est vérifié une fois alloué. Les états
de disponibilité inconnue (`availableGpuCounts=null` dans les devis) ne sont
pas assimilés à une rupture de stock : un devis valide sous plafond autorise
une tentative, dont Runpod confirme la capacité. Les états
`PROVISIONING` et `STARTING` sont attendus sans créer de doublon. Un modèle
n'est déclaré prêt qu'une fois le Pod `RUNNING` avec un prix accepté.
Le plafond de 3 $/h exclut toujours le stockage et les taxes, et la limite
de variation entre devis et allocation expliquée plus bas reste applicable.

Références : [Global Volumes pour Pods](https://docs.runpod.io/storage/globalvolume/globalvolume-pods),
[création via API v2](https://docs.runpod.io/api-reference-v2/pods/create-a-pod).

Créer un Global Volume et un template qui lance vLLM au
démarrage, avec les arguments de la section 1. Les poids doivent être mis en
cache dans `/workspace/huggingface` (`HF_HOME`) sur ce volume. Le template doit
exposer le port HTTP 8000, `/v1/models` et les métriques vLLM `/metrics`.
Le Pod initial, s'il existe, doit utiliser ce même volume et un GPU autorisé.

```dotenv
LLM_PROVIDER=vllm
LLM_MODE=live
ALLOW_PAID_LLM=true
RUNPOD_AUTO_MANAGE=true
RUNPOD_MODE=pod
RUNPOD_API_KEY=<cle-de-gestion-runpod>
RUNPOD_POD_ID=<pod-existant-optionnel>
RUNPOD_GLOBAL_VOLUME_ID=<global-volume-id>
RUNPOD_TEMPLATE_ID=<template-vllm>
RUNPOD_MAX_HOURLY_USD=3
RUNPOD_GPU_TYPES=NVIDIA H100 PCIe,NVIDIA A100 80GB PCIe
RUNPOD_POD_PORT=8000
VLLM_API_KEY=<secret-inference-identique-sur-le-template>
```

Supprimer `VLLM_BASE_URL` dans ce mode : l'adresse du Pod actif est calculée
depuis son identifiant conservé en Postgres, y compris après remplacement et
redémarrage de l'app. Le secret d'inférence est distinct de la clé de gestion.
Les trois variables `DM_*_MODEL` suivent les règles de la section 2.

La première présence démarre le Pod. Toutes les parties le partagent et
attendent la disponibilité des modèles avant de pouvoir envoyer un message.
Les vérifications périodiques ne comptent pas comme messages et ne prolongent
pas l'activité, même avec un onglet ouvert. Après la fin du dernier tour et des
générations distantes, le contrôleur attend **10 minutes sans nouveau message**,
puis arrête le Pod. Le contrôle toutes les 15 secondes ajoute un léger délai.
Des métriques absentes ou illisibles reportent l'arrêt. Un nouveau message
réveille le Pod et attend le modèle avant son traitement. Le volume est conservé.

Si le GPU initial n'est plus disponible, le contrôleur cherche un GPU autorisé
dans les datacenters disponibles, pour un seul GPU en Secure Cloud,
sans interruption. Il consulte un devis puis vérifie le tarif réel du Pod.
Sans offre à 3 $/h maximum, le joueur attend et le contrôleur réessaie.
Le stockage et les taxes sont exclus de ce plafond. Un volume conservé reste
facturé même lorsque le GPU est arrêté ; vérifier son tarif dans Runpod.

L'API ne fournit pas de réservation avec plafond tarifaire atomique : si le
tarif change entre le devis et la création, une courte allocation facturable
reste possible. Un nouveau Pod retourné au-dessus du plafond est supprimé
immédiatement, sans supprimer le volume, puis les nouvelles allocations sont
bloquées pour éviter une boucle payante. Un Pod initial non conforme est
refusé. Le tarif est aussi revérifié après un redémarrage.

Une création dont la réponse est perdue est recherchée par son nom unique ;
aucune seconde création n'est lancée tant que le résultat reste incertain.
L'état est stocké dans `runpod_pod_state`, indexé par l'identifiant du volume.
Pour débloquer une allocation rejetée ou incertaine, contrôler d'abord les Pods
et leurs tarifs dans Runpod, puis corriger explicitement cette ligne vers
`{"podId":"<pod-verifie>"}`. Modifier seulement `RUNPOD_POD_ID` ne remplace pas
l'état déjà persisté. Ne jamais effacer cet état pour contourner une création
incertaine sans avoir recherché le Pod correspondant.

Ce contrôleur exige une seule instance Node persistante. Pendant une panne de
l'app, il ne peut pas arrêter le GPU ; la facturation continue. Au redémarrage,
il recharge le Pod et accorde une nouvelle grâce de 10 minutes. Les tests
utilisent des API simulées : aucun Pod réel n'a été provisionné ou validé.

Références : [API REST Runpod](https://rest.runpod.io/v1/openapi.json),
[schéma GraphQL Runpod](https://graphql-spec.runpod.io/).

## 4. Alternative : démarrage et arrêt automatiques sur Serverless

La gestion automatique utilise un endpoint **queue-based vLLM dédié à cette
app**, avec la passerelle OpenAI officielle Runpod. Le contrôle `/health` de cet
endpoint permet de vérifier les générations distantes, même si une requête HTTP
de l'app a expiré. Cette variante ne pilote pas les endpoints load balancing.

Configurer les mêmes parsers Qwen et le même modèle dans le worker vLLM
Serverless, puis définir côté serveur :

```dotenv
LLM_PROVIDER=vllm
LLM_MODE=live
ALLOW_PAID_LLM=true
RUNPOD_AUTO_MANAGE=true
RUNPOD_MODE=serverless
RUNPOD_ENDPOINT_ID=<endpoint-id>
RUNPOD_API_KEY=<cle-runpod-autorisant-la-gestion-de-cet-endpoint>
VLLM_BASE_URL=https://api.runpod.ai/v2/<endpoint-id>/openai/v1
VLLM_API_KEY=<cle-runpod-autorisant-l-inference>
```

La clé d'inférence est ici une clé Runpod, contrairement au secret `--api-key`
d'un Pod autonome. Les clés restent exclusivement côté serveur. L'URL et l'ID
doivent désigner le même endpoint ; la validation de démarrage refuse une
configuration incohérente. Ne pas partager cet endpoint avec une autre app :
ce contrôleur en gère les limites de capacité.

Fonctionnement :

1. À l'ouverture d'une partie, après hydratation de la session, le navigateur
   envoie sa présence. L'API vérifie propriétaire, aventure, personnage, accès
   au module et quota, sans débiter de message ni créer un état de jeu.
2. La première présence demande `workersMin=1`, `workersMax=1` et
   `idleTimeout=600` par PATCH REST. Toutes les parties partagent ce worker.
   Les heartbeats suivants ne relancent pas de PATCH lorsque la capacité est
   déjà confirmée. Un bandeau « Préparation du MJ… » empêche l'envoi tant que
   l'API des modèles requis n'est pas disponible.
3. Les vérifications périodiques des onglets ne prolongent pas l'activité.
   Un onglet ouvert n'empêche pas l'arrêt. Le prochain message réveille le
   worker et attend sa disponibilité avant son traitement.
4. Après la fin des générations locales et distantes, le contrôleur attend
   **10 minutes sans nouveau message**. Le contrôle s'exécute toutes les
   15 secondes, sans dépendre d'une nouvelle requête du navigateur.
5. Le tour DM complet retient une réservation, y compris la classification,
   le résumé et les intervalles entre appels d'outils. Sa libération passe par
   `finally`, sur réussite comme sur erreur. Le délai ne commence qu'une fois
   `jobs.inProgress=0` **et** `jobs.inQueue=0` dans le health Runpod.
   Le contrôleur demande alors `workersMin=0`, `workersMax=0`, sans annuler de
   tâche. Une arrivée pendant l'arrêt est sérialisée avec le redémarrage avant
   d'autoriser une nouvelle génération.

Un échec de l'API Runpod reporte l'arrêt : le compteur local seul ne prouve pas
que le GPU a fini. Le contrôleur réessaie et journalise l'erreur sans secret.
La facturation du worker continue jusqu'à son extinction effective chez Runpod.
`/models` vérifie les modèles publiés par la passerelle ; le temps de traitement
réel et l'initialisation du worker doivent encore être validés sur le déploiement.

**Hébergement requis : une instance Node persistante**, comme l'app et ses
moteurs MCP actuels. Le minuteur démarre avec `instrumentation.ts` et est partagé
entre les routes. Un hébergeur qui suspend/gèle le processus sans trafic ne
garantit pas l'arrêt à l'heure prévue. Si le serveur s'arrête brutalement, aucun
code de ce serveur ne peut arrêter Runpod pendant la panne. Au redémarrage,
le contrôleur accorde une nouvelle grâce de 10 minutes, accepte les heartbeats
des joueurs encore là et réconcilie la capacité après drainage. Les présences
sont volatiles ; les parties restent persistées en Postgres.

Ce mode est désactivé par défaut, ainsi qu'en mock ou lorsque
`ALLOW_PAID_LLM=false`. Un changement vers une configuration désactivée ne
commande pas l'arrêt d'un worker déjà allumé : arrêter celui-ci explicitement
avant de désactiver le contrôleur. Aucun test ni cette implémentation ne crée
un endpoint ou ne provisionne spontanément un GPU sans configuration explicite.

Références du contrôle : [API REST Runpod](https://rest.runpod.io/v1/openapi.json),
[health et statut des tâches](https://docs.runpod.io/serverless/endpoints/operation-reference),
[worker vLLM et URL OpenAI](https://github.com/runpod-workers/worker-vllm).

## 5. Contrat et garde-fous

L'adaptateur traduit le contrat interne Messages en `/v1/chat/completions` :

- `tool_use` et `tool_result` conservent leurs identifiants ; les erreurs sont
  explicitement signalées dans le contenu du message `tool`.
- Un outil forcé devient une fonction nommée ; `any` devient `required`,
  `auto` et `none` gardent leur sens. Les appels parallèles sont désactivés et
  refusés si le serveur les renvoie malgré tout.
- Les marqueurs `cache_control` et `output_config.effort`, propres à Anthropic,
  ne sont pas envoyés à vLLM. Le cache de préfixe relève du serveur vLLM.
- Le mode instruct est demandé via `chat_template_kwargs.enable_thinking=false`
  sur les trois opérations pour respecter leurs budgets courts. Le raisonnement
  séparé n'est pas présenté au joueur. Un contenu comportant des balises `think`
  est refusé plutôt que publié.
- Une réponse tronquée, des arguments JSON invalides, un outil non exposé ou
  un choix forcé ignoré sont refusés avant tout appel moteur. La validité
  mécanique des arguments reste contrôlée par le moteur MCP.
- Aucun retry HTTP ni basculement de fournisseur implicite ; une erreur serveur
  remonte dans le traitement habituel avec remboursement du débit utilisateur.

Dans la boucle MJ, un refus métier `{ error, code }` ou un `isError` MCP
(y compris une erreur de schéma textuelle) n'est jamais compté comme réussite.
L'action primaire reste disponible et la directive reste forcée pour permettre
une correction. La prose accompagnant des appels outils n'est ni publiée ni
réinjectée comme fait acquis. Seule une réponse finale complète est publiée.
Si les tentatives s'épuisent avec une mécanique obligatoire non résolue, le
serveur renvoie un message factuel d'échec. Le dernier appel de narration après
résolution conserve le transcript des résultats et des refus.

## 6. Usage et validation

Les tokens vLLM sont intégrés au compteur existant, avec `provider=vllm` dans les
logs. Les tokens de préfixe cachés ne sont pas comptés deux fois. Les noms
historiques `anthropic.usage` et `summarizeAnthropicUsage` sont conservés pour
compatibilité ; ils peuvent maintenant contenir les deux fournisseurs.

L'estimation vLLM vaut **0 par défaut et exclut la location GPU et le stockage** :
elle ne représente pas une gratuité du service. Pour une estimation par tokens,
définir `VLLM_INPUT_USD_PER_MTOK` et `VLLM_OUTPUT_USD_PER_MTOK`. Les entrées
cachées sont incluses au même taux d'entrée. Aucun tarif Sonnet n'est appliqué
à un modèle auto-hébergé.

Validation sans coût :

```bash
npm run typecheck
npm test
npm run playtest:mock
```

Exécuter ces commandes successivement : `npm test` et `playtest:mock`
recompilent tous deux le moteur. Une recompilation pendant qu'un test charge
les fichiers compilés peut provoquer une erreur de chargement transitoire.

Les tests vérifient les deux fournisseurs avec des réponses HTTP simulées,
les conversions, les erreurs/timeout, les refus du vrai moteur MCP et la
persistance d'une narration après résolution. Ils n'attestent ni les performances
du GPU ni la qualité de Qwen en jeu. Le playtest mock a des seuils aspirationnels
connus : comparer les nombres, voir `scripts/CLAUDE.md`.

La validation réelle demande un Pod disponible et l'app en `live` : contrôler
déplacement, action invalide puis corrigée, combat, sort/capacité et plusieurs
tours. Cela consomme du GPU ; aucun test ne contacte spontanément le Pod ou
Anthropic.

Références : [Qwen3.6-27B](https://huggingface.co/Qwen/Qwen3.6-27B),
[tool calling vLLM](https://docs.vllm.ai/en/stable/features/tool_calling/),
[ports HTTP Runpod](https://docs.runpod.io/pods/configuration/expose-ports).
