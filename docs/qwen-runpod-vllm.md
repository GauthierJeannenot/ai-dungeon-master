# Archive : ancien transport Qwen / Runpod / vLLM

Le runtime utilise maintenant [OpenAI Responses](openai.md). Ce guide conserve
la configuration historique des contrôleurs ; il ne décrit plus les appels du MJ.

# Qwen sur Runpod avec vLLM

L’app utilise exclusivement vLLM pour les appels live, avec Qwen par défaut.
`LLM_PROVIDER=vllm` est optionnel ; toute autre valeur est refusée.
`LLM_MODE=mock` reste disponible hors ligne. Le moteur MCP reste dans le processus
serveur de l’app et chaque appel de jeu provient explicitement du MJ.

Les procédures spécialisées sont versionnées dans `lib/dm/rule-guides.json`,
consultables par `get_rules_support({domain})`. `discover_tools` charge les schémas
nécessaires depuis le catalogue public courant ; il ne déclenche aucun outil de jeu.

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
  --max-num-seqs 32 \
  --enable-prefix-caching \
  --reasoning-parser qwen3 \
  --enable-auto-tool-choice \
  --tool-call-parser qwen3_coder
```

Cette recette n'est pas un benchmark matériel effectué dans ce dépôt. Après
validation, figer la version vLLM et la révision des poids. Si le prompt réel
dépasse 32K tokens, augmenter la fenêtre et provisionner la mémoire associée.
Le contexte annoncé par le modèle n'est pas une promesse de capacité sur un GPU.
Fixer explicitement la concurrence : avec vLLM 0.32 et ce modèle hybride,
le défaut de 1024 séquences peut dépasser le nombre de blocs du cache Mamba
disponibles et empêcher tout démarrage, même après chargement des poids.

### Variante FP8 pour réduire les données à charger

La variante officielle `Qwen/Qwen3.6-27B-FP8` contient environ 30,9 Go
d'assets, contre environ 55 Go de poids BF16. La quantification peut changer
les réponses ; la validation de quelques requêtes ne constitue pas une
évaluation complète de qualité de partie.

`scripts/runpod-prepare-fp8.py` prépare la révision figée
`e89b16ebf1988b3d6befa7de50abc2d76f26eb09` comme fichiers ordinaires dans
`/workspace/models/qwen3.6-27b-fp8/<revision>`. Les téléchargements passent
par des caches locaux temporaires, avec deux fichiers simultanés au maximum.
Un marqueur de complétion n'est écrit qu'après validation de tous les fichiers.
Les démarrages suivants réutilisent ces assets sans téléchargement. Le cache
BF16 est conservé pour un retour arrière.

Lancer ensuite vLLM sur ce chemin local au volume, avec
`--served-model-name Qwen/Qwen3.6-27B` pour conserver l'identifiant API déjà
configuré dans l'app. Cela change les poids servis, sans renommer le modèle
attendu par les trois opérations LLM et le contrôle de disponibilité.
Conserver les limites de contexte et de concurrence de la recette ci-dessus.
`--language-model-only` désactive les entrées image/vidéo inutilisées par le
transport actuel de l'application. Le mode de chargement stable reste
`--safetensors-load-strategy lazy` ; le préchargement parallèle BF16 a produit
des erreurs mémoire sur le Global Volume FUSE pendant les essais.

Essai réel du 21 octobre 2026 : redémarrage FP8 avec assets déjà présents en
303 142 ms (5 min 03 s), contre 418 638 ms (6 min 59 s) pour le précédent
essai BF16, soit environ 28 % de moins. Le matériel diffère : A100 PCIe
80 Go à 1,79 $/h pour FP8, H100 à 2,89 $/h pour BF16 ; cette comparaison ne
mesure donc pas l'effet isolé de la quantification. Le téléchargement initial
et la première compilation sont exclus du temps de redémarrage.
Les requêtes françaises, un appel de fonction forcé et un contexte de
1 619 tokens ont répondu correctement. Le préchargement FP8 à deux threads
n'a pas amélioré le temps mesuré ; le template retient le chargement `lazy`.

Référence des poids : [modèle FP8 officiel Qwen](https://huggingface.co/Qwen/Qwen3.6-27B-FP8).

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
DM_COMPRESS_MODEL=Qwen/Qwen3.6-27B
```

Redémarrer l'app après modification. Les deux variables de modèle sont
optionnelles : en vLLM, le MJ utilise Qwen3.6-27B par défaut ; le résumé reprend
le modèle MJ. Effacer les anciennes surcharges
les anciennes surcharges `DM_*_MODEL` incompatibles avec le serveur. Avec `--served-model-name`,
utiliser cet alias exact côté app. Des modèles distincts nécessitent que le
même endpoint les serve effectivement.

Seul `VLLM_API_KEY` authentifie les appels d’inférence.
`ALLOW_PAID_LLM=false` bloque aussi vLLM : la location du GPU reste payante.


Le timeout est **par appel**. Un tour comprend les appels de l’agent MJ et, si nécessaire, une compression
d’historique ; le budget total du déploiement Next.js doit les couvrir. La route déclare
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
des Pods v2, du catalogue GPU v2 et des devis GraphQL. Le volume n'est jamais supprimé.
L'état utilise une clé Postgres `global:<volume-id>`.

Le tarif d'un Pod arrêté peut être zéro ou conserver un ancien montant : il
ne garantit pas le prix de reprise. Un devis est donc consulté avant la
reprise, puis le prix réel est vérifié une fois alloué. Les états
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
RUNPOD_GPU_TYPES=NVIDIA A100 80GB PCIe
RUNPOD_POD_PORT=8000
VLLM_API_KEY=<secret-inference-identique-sur-le-template>
```

Supprimer `VLLM_BASE_URL` dans ce mode : l'adresse du Pod actif est calculée
depuis son identifiant conservé en Postgres, y compris après remplacement et
redémarrage de l'app. Le secret d'inférence est distinct de la clé de gestion.
Les trois variables `DM_*_MODEL` suivent les règles de la section 2.

La sélection par défaut est limitée aux A100 80 Go PCIe. Sans capacité A100
disponible, le contrôleur attend une nouvelle tentative ; il ne bascule pas
sur un H100 ou un autre modèle de GPU.

La première présence démarre le Pod. Toutes les parties le partagent et
attendent la disponibilité des modèles avant de pouvoir envoyer un message.
La fenêtre de préparation affiche une barre estimée par étapes : démarrage du
Pod, initialisation, chargement des poids, compilation et optimisation. Les
étapes proviennent des journaux conteneur vLLM via
[`GET /v2/pods/{id}/logs`](https://api.runpod.io/v2/openapi.json), lus côté
serveur en SSE avec une limite de 1,5 seconde et reprise au dernier événement.
Seuls des libellés prédéfinis et un pourcentage sont transmis au navigateur.
Le pourcentage des shards affine l'étape de chargement ; la barre globale
n'est pas une estimation du temps restant. Seul `/v1/models`, avec les modèles
attendus, valide les 100 %. Sans journaux accessibles, le dernier jalon connu
reste affiché ; sans jalon (notamment en Serverless), la barre est indéterminée.
Les vérifications périodiques ne comptent pas comme messages et ne prolongent
pas l'activité, même avec un onglet ouvert. Après la fin du dernier tour et des
générations distantes, le contrôleur attend **30 minutes sans nouveau message**,
puis arrête le Pod. Le contrôle toutes les 15 secondes ajoute un léger délai.
Des métriques absentes ou illisibles reportent l'arrêt. Un nouveau message
réveille le Pod et attend le modèle avant son traitement. Le volume est conservé.

Si le GPU initial n'est plus disponible, le contrôleur cherche un GPU autorisé
dans les datacenters disponibles, pour un seul GPU en Secure Cloud,
sans interruption. Il consulte un devis puis vérifie le tarif réel du Pod.
`availableGpuCounts: null` signifie que le stock n'est pas renseigné : le
contrôleur laisse alors l'API d'allocation confirmer la disponibilité. Une
liste explicite sans `1` exclut en revanche une nouvelle allocation. Pour
reprendre un Pod existant, seul le prix du devis est utilisé ; un refus de
capacité HTTP 400 déclenche la recherche d'un remplacement. Un devis de
reprise absent ou hors budget déclenche aussi cette recherche sur les GPU
autorisés, sans tenter de démarrer le Pod initial. Une panne du service de
devis ou une réponse ambiguë de création reste bloquante.
Si GraphQL ne fournit aucun prix (`lowestPrice` ou `uninterruptablePrice`
à `null`), le contrôleur consulte le tarif Secure unitaire du catalogue v2.
Ce tarif catalogue ne réserve pas de capacité et ne remplace jamais un devis
GraphQL connu qui dépasse le plafond. L'API confirme la disponibilité, puis
le contrôleur vérifie le coût réel du Pod et refuse tout dépassement.
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

Après une migration manuelle dans la console, vérifier le nouvel ID, le GPU,
le tarif et le montage du même Global Volume sur `/workspace`, puis mettre à
jour cette ligne et `RUNPOD_POD_ID`. Le contrôleur ne déduit pas une filiation
entre deux Pods du seul fait qu'ils partagent un volume.

Si vLLM signale un `config.json` invalide dans le cache, le script
`scripts/runpod-repair-config.py` peut être exécuté dans le conteneur, avant
vLLM : `python3 runpod-repair-config.py Qwen/Qwen3.6-27B`. Il valide les fichiers
JSON présents dans le snapshot et conserve une copie de chaque fichier
invalide. Il télécharge les remplacements à la même révision dans un cache
temporaire local, les valide, puis les recopie sur le volume. Cela évite de
dépendre du remplacement des liens du cache Hugging Face ; `config.json`
doit aussi contenir `model_type`. Les poids du modèle et le volume ne
sont pas supprimés. `HF_HOME` doit désigner le cache persistant utilisé par
vLLM. Le démarrage de vLLM doit rester conditionné au succès de ce contrôle.

Si les shards de poids du snapshot sont eux aussi vides, exécuter ensuite
`python3 runpod-repair-weights.py Qwen/Qwen3.6-27B`, sans autre processus qui
écrit dans ce cache. Le script vérifie la taille distante et l'en-tête
safetensors des snapshots et des blobs persistants. Il crée les métadonnées
et liens dans `/tmp/ai-dm-hf-hub`, sur le disque local POSIX, en réutilisant
les poids valides du volume sans les recopier ni les retélécharger. Un shard
sans données persistantes valides est refusé pour inspection. Ce contrôle
doit réussir avant de lancer vLLM avec
`HF_HUB_CACHE=/tmp/ai-dm-hf-hub`. Conserver `HF_HOME=/workspace/huggingface`
pendant les deux contrôles ; exporter `HF_HUB_CACHE` seulement pour vLLM.

Les Global Volumes ne supportent pas toutes les opérations POSIX (verrous,
renommages atomiques, permissions). Un cache Hugging Face déclaré complet
peut donc nécessiter une vérification de ses fichiers après transfert ou
écriture interrompue. Voir les [limitations Runpod](https://docs.runpod.io/storage/globalvolume/overview#limitations).

Ce contrôleur exige une seule instance Node persistante. Pendant une panne de
l'app, il ne peut pas arrêter le GPU ; la facturation continue. Au redémarrage,
il recharge le Pod et accorde une nouvelle grâce de 30 minutes. Les tests
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
   **30 minutes sans nouveau message**. Le contrôle s'exécute toutes les
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
le contrôleur accorde une nouvelle grâce de 30 minutes, accepte les heartbeats
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
- Les anciens marqueurs de cache fournisseur et réglages d’effort
  ne sont pas envoyés à vLLM. Le cache de préfixe relève du serveur vLLM.
- Le mode instruct est demandé via `chat_template_kwargs.enable_thinking=false`
  sur les appels MJ et résumé pour respecter leurs budgets courts. Le raisonnement
  séparé n'est pas présenté au joueur. Un contenu comportant des balises `think`
  est refusé plutôt que publié.
- Une réponse tronquée, des arguments JSON invalides, un outil non exposé ou
  un choix forcé ignoré sont refusés avant tout appel moteur. La validité
  mécanique des arguments reste contrôlée par le moteur MCP.
- Aucun retry HTTP ni basculement de fournisseur implicite ; une erreur serveur
  remonte dans le traitement habituel avec remboursement du débit utilisateur.

Dans la boucle MJ, un refus métier `{ error, code }` ou un `isError` MCP
(y compris une erreur de schéma textuelle) n'est jamais compté comme réussite.
L'action primaire reste disponible et le modèle choisit librement une correction autorisée. La prose accompagnant des appels outils n'est ni publiée ni
réinjectée comme fait acquis. Seule une réponse finale complète est publiée.
Si les tentatives s'épuisent avec une mécanique obligatoire non résolue, le
serveur renvoie un message factuel d'échec. Le dernier appel de narration après
résolution conserve le transcript des résultats et des refus.

## 6. Usage et validation

Le prompt permanent ne recopie pas les blocs SRD complets de tout le bestiaire :
`loadBestiaryPrompt` conserve le casting, les rôles et toutes les notes narratives
de `bestiary.json`. L'agent lit les statistiques et la couverture moteur avec
`get_monster_stat_block` quand il en a besoin ; `bestiary.md` reste intégral.
Cela laisse de la place aux résultats MCP et à la narration dans la fenêtre 32K.
Un dépassement de contexte reconnu dans une réponse vLLM 400 est signalé comme
tel, sans exposer le corps de l'erreur.

En vLLM live, l'historique est automatiquement compressé selon la fenêtre réelle
du serveur. Avant le tour et avant chaque appel du MJ, `/tokenize` compte la
requête complète (système, outils, historique, état et résultats MCP). Le champ
`max_model_len` fournit la limite ; le budget de réponse et 4096 tokens de marge
(`LLM_CONTEXT_RESERVE_TOKENS`) sont réservés. Le endpoint `/tokenize`, à côté de
`/v1`, doit être accessible avec la même clé vLLM ; aucun token n'y est généré
([contrat vLLM](https://github.com/vllm-project/vllm/blob/v0.20.2/vllm/entrypoints/serve/tokenize/protocol.py)).

Si nécessaire, les échanges les plus anciens sont résumés progressivement avec
`DM_COMPRESS_MODEL`, même s'il reste moins de dix messages récents. Un gros
historique est résumé par fragments chronologiques si l'appel de résumé ne
rentre pas lui-même. Le résumé complet et le suffixe conservé sont sauvegardés
immédiatement et réutilisés au tour suivant. Une réponse vide ou tronquée ne
permet jamais de supprimer les anciens échanges. Le résumé du modèle peut
perdre des nuances ; les faits persistés du moteur restent prioritaires.

La compression ne modifie ni le système, ni le message courant, ni les appels et
résultats MCP du tour actif. Quand il ne reste aucun historique compressible, la
marge peut être consommée, mais le budget de réponse reste réservé. Si le tour
actif seul dépasse encore la capacité, la requête s'arrête avec une erreur claire
avant génération ; une fenêtre plus grande ou des résultats outils plus compacts
restent alors nécessaires. Le tokenizer indisponible provoque aussi une erreur
remboursée, sans envoyer aveuglément la génération ni basculer de fournisseur.
En mock, aucun réseau de comptage ; la compression historique conserve son seuil en caractères.

Les tokens vLLM sont intégrés au compteur existant, avec `provider=vllm` dans les
logs. Les tokens de préfixe cachés ne sont pas comptés deux fois. La télémétrie utilise `llm.usage` et `summarizeLlmUsage`, exclusivement pour vLLM.

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
un autre fournisseur.

Références : [Qwen3.6-27B](https://huggingface.co/Qwen/Qwen3.6-27B),
[tool calling vLLM](https://docs.vllm.ai/en/stable/features/tool_calling/),
[ports HTTP Runpod](https://docs.runpod.io/pods/configuration/expose-ports).
