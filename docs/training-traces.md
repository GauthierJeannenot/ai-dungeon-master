# Enregistrement et annotation des parties

Les nouveaux tours autorisés sont enregistrés automatiquement dans Postgres :
`training_turns` et `training_events`. Le schéma est créé au démarrage du premier
accès à la base, y compris sur les installations existantes.

Dans la partie, ouvrir « Évaluer les tours », choisir Bon/Mauvais/Non évalué,
ajouter une correction et cliquer « Enregistrer ce tour ». Les annotations sont
indépendantes du moteur et ne modifient ni les prompts ni les actions de jeu.
Le téléchargement JSON contient toutes les traces de cette partie et les annotations.

Chaque tour possède un identifiant indépendant, le message joueur et les identifiants
requête/module/personnage. Les événements ordonnés conservent les paramètres complets
au niveau applicatif des appels LLM (système, messages, outils, options), les réponses,
les requêtes/réponses MCP brutes et leurs erreurs. Compression, réparation
et narration sont inclus lorsqu'ils sont appelés dans le tour. Les opérations MCP
internes sont aussi présentes et ne doivent pas devenir des exemples d'actions IA.
Le fournisseur, le mode mock/live et l'opération sont enregistrés avec chaque appel LLM.
Les événements `llm.http.request` / `llm.http.response` conservent aussi le corps HTTP
exact sérialisé et la réponse brute, avant validation ou normalisation. Cela inclut
la conversion Chat Completions de vLLM, les réponses HTTP en erreur/non JSON et
chaque tentative HTTP vLLM. L'identifiant HTTP relie chaque
paire requête/réponse ; `llm.http.error` conserve les erreurs de transport. Les
mesures vLLM `/tokenize` sont identifiées par `operation: tokenize`. Les seuls
en-têtes conservés sont le type de contenu et les
identifiants de réponse. Authentification, cookies et paramètres de requête de
l'URL ne sont jamais collectés. Le chat template interne au serveur vLLM et les
tokens cachés du fournisseur ne sont pas accessibles via ces échanges.
La réponse HTTP finale est conservée ; une issue absente signale un tour interrompu.
Les requêtes sont persistées avant exécution, les réponses immédiatement après.
Une erreur de stockage pendant les échanges interrompt le tour via la gestion d'erreur
existante, plutôt que de continuer une collecte silencieusement incomplète.

L'export est une archive de travail, pas un fichier prêt à entraîner : contrôler les
bons exemples, vérifier les corrections et séparer les parties d'évaluation. Les anciens
tours ne sont pas reconstruits. Les traces contiennent le contexte confidentiel du MJ.
L'accès utilise le propriétaire de la session ; hors monétisation, seules les sessions
sans propriétaire sont accessibles. Aucune transmission à un service d'entraînement.
Les traces restent en base après suppression d'une partie ; sans session elles ne sont
plus accessibles par l'API de session, mais restent exportables par l'API administrative.

## Fichiers locaux : `llm_training/`

Hors production, chaque nouveau tour crée automatiquement
`llm_training/<turnId>.jsonl`, indépendamment des limites et du filtrage des logs
de diagnostic. Aucune troncature de texte, tableau ou profondeur n'est appliquée.
Les écritures d'un même tour sont sérialisées ; les sessions concurrentes ont
des fichiers distincts. Chaque ligne est un objet JSON UTF-8 avec `schemaVersion`,
`turnId`, `sessionId`, `type` et, lors de l'enregistrement, `createdAt` :

- `turn.start` : message joueur, identifiants de requête/aventure/personnage,
  version Node, environnement et révision du code lorsqu'elle est fournie ;
- `event` : `sequence`, `kind`, `payload` complets (LLM, HTTP et MCP) ;
- `turn.outcome` : statut et réponse finale de l'API, y compris l'état moteur ;
- `turn.annotation` : évaluation et correction enregistrées depuis l'interface.

La dernière annotation fait autorité. Une issue absente indique un tour interrompu.
`LLM_TRAINING_DIR` change le dossier ; `LLM_TRAINING_FILE_ENABLED=false` coupe les
fichiers sans couper la collecte Postgres. En production, les fichiers nécessitent
`LLM_TRAINING_FILE_ENABLED=true` et un disque persistant. Les tests utilisent des
dossiers temporaires et désactivent les fichiers par défaut. Le dossier par défaut
est ignoré par Git. Aucune rotation/suppression automatique n'est effectuée :
archiver ces données et prévoir leur conservation selon l'usage.

## Endpoint administratif de production : `/api/llm_training`

La collecte se fait automatiquement dans `/api/dm`, sans appel supplémentaire du
client. Le nouvel endpoint est une lecture de Postgres, indépendante du buffer
et de la rotation de `/api/debug/logs`. Son accès nécessite toujours un Bearer
`LLM_TRAINING_TOKEN` d'au moins 16 caractères ; à défaut, il utilise
`APP_DEBUG_LOG_TOKEN`. Sans token configuré il renvoie 404 ; un token incorrect
renvoie 401. Ce token donne accès à toutes les parties, y compris supprimées :
le réserver à l'administration. Il n'est accepté ni en query string ni en cookie.

```http
GET /api/llm_training?limit=20
Authorization: Bearer <LLM_TRAINING_TOKEN>
```

La réponse JSON contient `schemaVersion`, `turns` (métadonnées, événements complets,
issue, évaluation et correction) et `nextCursor`. `sessionId` permet de filtrer une
partie. `limit` vaut 20 par défaut, entre 1 et 100. Réutiliser `nextCursor` dans
`cursor` jusqu'à obtenir `null`, sans changer les filtres.

```http
GET /api/llm_training?download=1&limit=20&sessionId=<sessionId>
Authorization: Bearer <LLM_TRAINING_TOKEN>
```

`download=1` produit un fichier JSONL avec les mêmes types de lignes que les fichiers
locaux. L'en-tête `X-Next-Cursor`, lorsqu'il est présent, permet de télécharger la
page suivante. Chaque page inclut l'intégralité des tours sélectionnés, sans
troncature. Les réponses portent `Cache-Control: no-store`. Un tour en cours peut
être incomplet ; exporter après sa fin. Les corrections peuvent évoluer : une
pagination n'est pas un suivi incrémental des modifications des anciens tours.

Ces exports constituent des données brutes à trier, pas un dataset automatiquement
validé. Séparer mock/live, opérations résumé/MJ et appels MCP internes.
Les anciens logs tronqués ne sont pas reconstruits. La révision du code vient de
`RAILWAY_GIT_COMMIT_SHA`, `VERCEL_GIT_COMMIT_SHA` ou `APP_REVISION` si disponible.

## Corpus synthétique sans pod

Pour les futurs agents : [guide des corpus MCP](guide-jeux-donnees-llm.md) et
[guide des corpus de narration](guide-jeux-donnees-narration.md).
Le [guide reliant MCP et narration](guide-jeux-donnees-mcp-narration.md) décrit
les exemples communs de dialogue, clarification, résolution et retour au joueur.

```bash
npm run training:generate
npm run training:generate -- --out llm_training/synthetic/mon-lot --provider openai
npm run training:generate -- --fixture scripts/training/pilot.json
npm run training:generate -- --fixture scripts/training/mcp-rule-research-v1.json --role mcp --out llm_training/synthetic/mon-lot-mcp
```

Le générateur est un processus CLI séparé. Il impose `LLM_MODE=mock`, bloque
les appels réseau, utilise SQL pg-mem et le vrai moteur MCP stdio compilé.
Il remplace uniquement les réponses du fournisseur dans ce processus par des
démonstrations écrites dans les fixtures. Le faux LLM habituel et ses heuristiques
ne produisent aucun label ; le pipeline live n'est pas modifié. `--provider`
choisit le contrat/modèle cible (`openai` exclusivement), sans l'appeler.

Pour chaque scénario, le code crée personnage et aventure via
`buildInitialGameState`, sauvegarde l'état et l'historique, puis appelle la vraie
route `/api/dm`. Cette route prépare l'état moteur, le système statique, le contexte
local et les résumés, et exécute les blocs `tool_use` explicitement
écrits dans le scénario. Il n'y a aucune interprétation du message par un parseur.
Les références `$ref` désignent uniquement des champs explicites des résultats
déjà reçus (par exemple l'identifiant de section renvoyé par `consult_rules`).
Une référence manquante ou un contrôle faux fait échouer le lot.
Les arguments choisis sont aussi validés contre le schéma JSON de l'outil
réellement exposé.

Le pilote contient **8 scénarios / 17 exemples** : Foncer et concentration avec
recherche puis lecture SRD, mise à jour locale après déplacement, refus hors carte,
Perception réussie/échouée, clarification de cible et compression d'historique.
Les deux résultats de Perception restent dans le même split pour éviter leur
dispersion entre entraînement et validation. Ce petit split vérifie le format,
pas les performances d'un modèle ni la couverture du jeu.

Chaque exécution crée un nouveau dossier sous `llm_training/synthetic/` :

- `examples.jsonl` : un couple `request` / `target` par appel retenu, son opération
  (MJ, résumé), scénario, split et identifiant de trace. `request`
  conserve les paramètres complets réellement construits par l'application.
  `target` contient uniquement la réponse assistant à apprendre. `chat` fournit
  le même échange converti par l'adaptateur Chat Completions actuel, avec
  `targetMessageIndex` pour identifier le dernier message à superviser ;
- `traces/` : journaux JSONL exacts du collecteur, incluant les vrais échanges MCP,
  marqués `source: synthetic-authored`. Aucune fausse réponse HTTP fournisseur
  n'est fabriquée ;
- `scenarios.json` et `fixture.json` : états, historiques, réponses finales et
  scénarios permettant de relire chaque démonstration ;
- `manifest.json` : contrôles, nombre d'appels réseau, splits, configuration,
  empreintes des sources sélectionnées et des exports, références et attribution
  des passages documentaires consultés.

Le répertoire de sortie doit être vide : aucun ancien lot n'est remplacé.
Un lot en échec garde son manifeste et ses traces, mais n'exporte pas
`examples.jsonl`. Le collecteur et les exemples sont comparés champ par champ.
L'état final est également comparé à la session sauvegardée. Les règles restent
dans les résultats d'outils ; elles ne sont jamais ajoutées rétroactivement au
système ni au contexte précédant leur consultation.

`--role all` (défaut) conserve les cibles de tous les rôles. `--role mcp` conserve
seulement les cibles d'appels d'outils de l'agent, excluant les résumés et tous les
textes. Ce dernier export fournit aussi `train.jsonl`, `validation.jsonl` et
`selection.json` (identifiants exclus et raisons), avec empreintes au manifeste.
Les scénarios et traces gardent l'exécution complète pour la provenance. Le filtre
ne reconstruit pas les entrées. Il n'apprend pas les précisions/fins textuelles et
ne remplace pas un corpus complet de comportements de contrôle.

`group` empêche de séparer une famille proche entre entraînement et validation.
`ruleLookupInitiative=agent` vérifie une première consultation non imposée par un
outil nommé, parmi plusieurs outils disponibles. Le scénario fournit la décision
attendue ; le moteur fournit les vrais résultats documentaires et mécaniques.

`validation.status=passed` signifie que les conditions mécaniques et de contexte
déclarées ont réussi. `reviewStatus=needs-review` reste présent : les cibles sont
des propositions écrites par l'auteur du scénario, pas des sorties mesurées de
Qwen ni une certification générale de leur qualité. Les séparer des parties
réelles et les relire avant de constituer un dataset final.

Le tokenizer du serveur et sa gestion de pression ne sont pas simulés :
`tokenBudgetValidation=not-run-offline`. Le résumé par seuil de caractères reste
testé par la vraie route ; les fixtures doivent correspondre aux seuils configurés.
Avant entraînement, adapter l'export au modèle et au framework choisis, utiliser
leur chat template et vérifier la longueur des contextes. Pour des exemples par
appel, superviser uniquement `target` / `targetMessageIndex` et masquer les
messages assistant antérieurs ; ne pas apprendre les réponses du moteur comme
des paroles de l'assistant.

Les cibles spécialisées synthétiques demandent explicitement leur schéma avec
`discover_tools({names:[…]})` avant leur utilisation. Cette étape provient du nom
d’outil choisi dans la fixture, jamais du message joueur, et reste limitée au
générateur hors ligne. La trace et les exemples conservent la demande et les
schémas réellement exposés ; aucune cible avec schéma invisible n’est exportée.
