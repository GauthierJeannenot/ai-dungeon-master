# Guide de génération des données reliant MCP et narration

Ce corpus apprend au même MJ à choisir entre parler, demander une précision et
agir, puis à raconter les effets réellement résolus par le moteur. Il complète
les corpus spécialisés [MCP](guide-jeux-donnees-llm.md) et
[narration](guide-jeux-donnees-narration.md). Son objectif est un MJ vivant qui
réagit au joueur tout en lui laissant ses décisions.

Réutiliser **`scripts/generate-training-dataset.cjs` avec `--role all`**, la vraie
route DM et le moteur MCP. Les cibles sont des démonstrations écrites dans les
fixtures ; le générateur les exécute et collecte leurs contextes. Il ne crée pas
spontanément des dialogues à partir des transcriptions et n'évalue pas un modèle.

## Sources et contrat courant

Lire `AGENTS.md`, `scripts/CLAUDE.md`, les deux guides spécialisés et
[training-traces.md](training-traces.md). Pour préparer un lot, consulter aussi
`scripts/training/pilot.json`, `scripts/generate-training-dataset.cjs` et
`tests/training-dataset.test.cjs`. Le code courant prime sur les anciennes docs.

| Fonction | Disponible dans le générateur |
| --- | --- |
| Un message joueur suivi de plusieurs appels outils puis d'un texte final | Oui |
| Une réponse textuelle sans appel de jeu | Oui |
| Historique et résumé initiaux cohérents avec l'état initial | Oui |
| Résultats MCP, schémas et contexte produits par le vrai pipeline | Oui |
| `--role all` pour conserver outils et textes | Oui, avec les autres opérations éventuellement capturées |
| `--role mcp` pour conserver seulement les appels outils | Oui, mais exclut les clarifications et narrations |
| Filtre `--role narration`, `bridge` ou `mixed` | Non |
| Plusieurs messages joueur successifs dans la même session de scénario | Non, extension nécessaire |
| Patch arbitraire de l'état ou scène de combat initiale préconfigurée | Non, extension nécessaire |
| Import automatique de transcriptions et sélection sémantique des textes | Non |

Le planner a été retiré : ne pas recréer `dm.plan`, `decide_action` ou un
classifieur séparé. Aucun détecteur de mots-clés ne doit sélectionner les actions
du pipeline live. Les opérations acceptées par le validateur ne suffisent pas à
prouver qu'un scénario est exécutable : notamment, une activation `dm.npc`
nécessite une préparation que le générateur courant n'expose pas.

## Comportements à relier

Une bonne démonstration rend visible le moment où le MJ doit s'arrêter ou agir.
L'humour peut tenir en une phrase ; il n'autorise ni action gratuite ni bonus RP
automatique. Une question n'est nécessaire que si une information utile manque.

| Famille | Enchaînement attendu | Erreur à éviter |
| --- | --- | --- |
| Blague seule | Réaction courte, espace laissé au joueur | Jet, passage de tour ou événement inventé pour meubler |
| Blague avec action claire | Appel MCP, résultat, narration avec une touche d'humour | Ignorer l'action ou annoncer sa réussite avant le résultat |
| Choix incomplet | Question ciblée, arrêt sans mutation de jeu | Deviner cible, arme, objet ou destination |
| Réponse à une clarification | Utiliser le choix désormais explicite, résoudre, raconter | Reposer la même question ou ajouter un choix absent |
| Refus moteur | Expliquer le blocage, laisser le choix de la suite | Répéter le refus ou choisir un contournement à la place du joueur |
| Résolution partielle | Raconter la partie confirmée et présenter la décision restante | Transformer un trajet interrompu en arrivée |
| Jet réussi ou raté | Lire le vrai résultat, ajuster le ton et conserver les conséquences | Récompenser une belle formule par une réussite inventée |
| Dialogue de PNJ | Réplique cohérente ; outil dédié si l'état doit changer | Confondre couleur narrative et gain mécanique de confiance |
| Réaction suspendue | Présenter le choix et attendre le joueur | Dépenser ou décliner sa réaction sans réponse |
| Négation ou citation | Répondre à la discussion sans exécuter l'action évoquée | Agir sur « je plaisantais » ou « si j'attaquais » |

Adapter chaque cas aux outils et données réellement présents. Le moteur reste
seul responsable des dés, coûts, positions, PV et états. Une improvisation ne
crée pas de secret découvert, d'objet utilisable ou de modification mécanique.

Rendre la main signifie terminer au bon endroit. Cela peut être une question
précise, une réplique de PNJ ou une courte description qui appelle naturellement
une réponse. Ne pas ajouter systématiquement « Que fais-tu ? », un menu d'actions
ou une décision du personnage.

## Construire un lot avec le générateur existant

1. Choisir une difficulté et ses contrastes : plaisanterie seule ou avec action,
   destination explicite ou absente, résultat réussi ou refusé. Déclarer une
   famille `group` et son split avant la génération.
2. Partir d'une situation initiale réelle d'un module et d'un personnage existants.
   Pour une mécanique déjà couverte, reprendre la préparation d'une fixture
   validée. Ne pas inventer un historique de combat pour simuler son état.
3. Écrire chaque réponse attendue dans `steps`, avec soit `tool`, soit `text`.
   L'auteur choisit explicitement les arguments ; le moteur calcule les résultats.
4. Placer les contrôles du résultat avant le texte qui en dépend. Vérifier
   identité de l'outil, succès ou refus, état et ressources concernés.
5. Capturer avec `--role all`. Relire les textes, annoter les cibles utiles et
   exclure notamment les résumés et brouillons rejetés de la supervision commune.
6. Conserver les requêtes exactes, leurs schémas, résultats, identifiants et
   empreintes. Séparer validation mécanique et relecture conversationnelle.

Les étapes `steps` correspondent aux appels LLM successifs **dans un seul tour**.
Une étape `text` termine la réponse de l'agent ; on ne peut pas ajouter une
réponse du joueur et un nouvel appel de jeu en continuant simplement ce tableau.
La prose accompagnant un appel outil est écartée par la route : faire porter la
réaction publiée sur la réponse textuelle finale, après les résultats.

### Exemple de fixture à copier

Ce modèle utilise le format existant. Le déplacement reprend la situation
`movement-local-refresh` du pilote ; ses coordonnées sont propres à ce module.
Les deux premiers cas ne demandent aucun changement mécanique. Copier le JSON
dans `scripts/training/mcp-narration-v1.json`, puis exécuter le lot pour vérifier
sa compatibilité avec l'état courant du projet.

```json
{
  "schemaVersion": 1,
  "scenarios": [
    {
      "id": "bridge-joke-only",
      "group": "bridge-table-banter",
      "split": "train",
      "adventureId": "grammys-country-apple-pie",
      "characterId": "fighter",
      "message": "Hors personnage : mon vrai pouvoir, c'est de perdre mes dés ! Je plaisante et ne fais aucune action.",
      "unchanged": ["player.position", "player.hp", "player.inventory", "hero", "actionUsed", "movementUsed"],
      "checks": [{ "path": "body.toolsUsed", "equals": [] }],
      "steps": [
        {
          "operation": "dm.turn",
          "text": "Une technique redoutable pour éviter les mauvais jets. On reprend quand tu veux."
        }
      ]
    },
    {
      "id": "bridge-clarify-destination",
      "group": "bridge-unclear-destination",
      "split": "validation",
      "adventureId": "grammys-country-apple-pie",
      "characterId": "fighter",
      "message": "Je vais là-bas.",
      "unchanged": ["player.position", "player.hp", "player.inventory", "hero", "actionUsed", "movementUsed"],
      "checks": [{ "path": "body.toolsUsed", "equals": [] }],
      "steps": [
        {
          "operation": "dm.turn",
          "text": "Tu veux aller à quel endroit ?"
        }
      ]
    },
    {
      "id": "bridge-movement-with-joke",
      "group": "movement-local-refresh",
      "split": "train",
      "adventureId": "grammys-country-apple-pie",
      "characterId": "fighter",
      "message": "Je me déplace en (5,13). Une grande expédition : un pas !",
      "unchanged": ["player.hp", "player.inventory"],
      "checks": [
        { "path": "state.player.position", "equals": { "x": 5, "y": 13 } },
        { "path": "body.toolsUsed", "equals": ["move_token"] }
      ],
      "steps": [
        {
          "operation": "dm.turn",
          "tool": {
            "name": "move_token",
            "input": { "tokenId": "player", "toCell": { "x": 5, "y": 13 } }
          }
        },
        {
          "operation": "dm.turn",
          "checks": [
            { "path": "lastTool.name", "equals": "move_token" },
            { "path": "lastTool.isError", "equals": false },
            { "path": "lastToolResult.success", "equals": true },
            { "path": "lastToolResult.sceneContext", "exists": true },
            { "path": "gameState.player.position", "equals": { "x": 5, "y": 13 } }
          ],
          "text": "Tu avances d'un pas. L'expédition atteint son premier objectif ; tu peux presque réclamer une médaille."
        }
      ]
    }
  ]
}
```

Le split de cet exemple sert à montrer le format. Avant mélange avec les autres
corpus, appliquer une partition commune à toutes les familles apparentées ; une
paraphrase du déplacement du pilote doit rester dans son groupe d'entraînement.

Depuis la racine du dépôt, dans un dossier de sortie nouveau ou vide :

```bash
npm run training:generate -- --fixture scripts/training/mcp-narration-v1.json --role all --out llm_training/synthetic/mcp-narration-v1
```

La commande compile le moteur, utilise pg-mem et interdit le réseau. Ne pas la
lancer pendant une suite utilisant le même `mcp-server/dist/`. Les réponses
attendues restent écrites par l'auteur ; aucun fournisseur LLM ni pod n'est appelé.

## Sélectionner les cibles communes

Le corpus commun conserve les appels **et** les textes utiles de l'agent. C'est
ce qui le distingue des deux corpus spécialisés. Une clarification textuelle,
exclue de `--role mcp`, est ici une cible essentielle.

Attribuer dans un fichier de sélection séparé une catégorie relue à chaque
identifiant d'exemple. Les catégories ci-dessous constituent une convention
d'annotation pour ce corpus, pas de nouveaux champs reconnus par le CLI.

| Catégorie proposée | Cible à conserver |
| --- | --- |
| `tool_call` | Appel explicite de l'agent, arguments validés et ordre justifié |
| `clarification` | Question nécessaire sans exécution prématurée |
| `banter` | Réaction conversationnelle sans modification mécanique |
| `grounded_narration` | Texte final fidèle aux résultats reçus |
| `refusal_handoff` | Refus expliqué et choix suivant laissé au joueur |
| `pending_choice` | Décision suspendue présentée au joueur sans choix implicite |

Tracer aussi les exclusions avec leur raison. Exclure `history.compress`, les
anciennes opérations du planner, les erreurs HTTP et les textes rejetés ou
remplacés. Un exemple `dm.turn` textuel ne permet pas, à lui seul, de distinguer
clarification, narration et brouillon : vérifier l'issue publiée dans la trace.

`--role all` fournit `examples.jsonl`, `scenarios.json`, `fixture.json`, les traces
et le manifeste. Il ne crée pas les fichiers `train.jsonl` et `validation.jsonl`
que produit l'option `mcp`. Après sélection, les constituer selon `split` dans un
export dérivé distinct, avec liste des identifiants inclus/exclus et empreintes.
Conserver l'archive brute et son manifeste intacts. Cette sélection éditoriale
et cet export dérivé restent à réaliser ; aucune option dédiée n'est livrée ici.

Pour chaque couple, conserver `request` comme contexte et `target` comme seule
réponse supervisée. Avec la conversion `chat`, superviser seulement le message
désigné par `targetMessageIndex`. Masquer système, messages joueur, résultats
d'outils et anciens messages assistant. Un simple masque de tous les messages
assistant entraînerait aussi d'anciennes réponses, potentiellement rejetées.

## Préparer les chaînes sur plusieurs tours

La chaîne complète à viser est :

1. Le joueur donne un choix incomplet ; le MJ pose une question ciblée.
2. Le joueur précise son choix ; l'agent choisit les appels MCP nécessaires.
3. Le moteur résout l'action ; le MJ raconte les conséquences et rend la main.
4. Le prochain message peut être une plaisanterie, une question ou une action ;
   l'agent répond selon cette nouvelle demande.

Deux sources permettent de la constituer : des traces réelles de plusieurs tours
de la même session, ou une extension testée du générateur. Les traces doivent
contenir les bons comportements ; une correction qui change un ancien appel
impose de rejouer la suite, car ses résultats et son contexte peuvent changer.

Pour étendre le générateur, conserver son fonctionnement actuel comme référence
et prévoir les exigences suivantes avant de produire les nouveaux lots :

- Initialiser la session une seule fois et garder aventure et personnage fixes.
- Envoyer successivement les messages via la vraie route, avec les identifiants
  de session. Reprendre l'état, l'historique et le résumé effectivement persistés,
  sans les reconstruire ni les remplacer par une sortie attendue.
- Conserver un identifiant de trajectoire et l'ordre de ses tours, puis relier
  chaque exemple à son tour et à sa trace. Ces métadonnées sont une extension
  proposée ; ne pas supposer qu'elles existent dans le format actuel.
- Vérifier après la clarification l'absence de mutation de jeu ; après la réponse
  du joueur, vérifier les arguments exacts puis les résultats et coûts réels.
- Arrêter devant une décision suspendue. Un tour de réaction attend sa vraie
  réponse ; aucune continuation ni fin de tour de jeu n'est fabriquée côté serveur.
- Refuser les champs inconnus du nouveau contrat et tester sa rétrocompatibilité.
  Une étape attendue non consommée doit échouer, jamais être ignorée.

Un historique initial peut contenir une ancienne question sans action, si tout
reste cohérent avec l'état initial. Il permet de montrer un fragment de réponse,
mais ne prouve pas une trajectoire persistée. Ne pas faire passer plusieurs
scénarios indépendants pour une partie continue ou prétendre que le format actuel
prend déjà en charge un champ `turns`.

## Utiliser les transcriptions pour écrire les échanges

Retenir les interventions qui montrent le comportement recherché avec le contexte
qui le justifie : reprise d'une blague, demande de précision, hésitation du joueur,
réplique de PNJ ou fin de description laissant un choix ouvert. Identifier les
locuteurs et séparer conversation de table et parole du personnage.

Adapter ces situations en français au jeu solo et aux modules disponibles.
Écrire des échanges originaux ancrés dans leurs faits. Conserver la référence
du passage source dans la provenance éditoriale ; ne pas introduire son univers
ou ses secrets dans les prompts partagés du projet. Réserver les séquences
apparentées d'une même scène au même split dans tous les corpus.

Les transcriptions inspirent l'interaction. Elles ne fournissent pas des preuves
MCP : recréer la situation compatible, choisir les appels et obtenir les vrais
résultats du moteur. Les interventions des joueurs restent du contexte ; elles
ne deviennent pas les réponses cibles du MJ. Ne pas importer implicitement des
variantes de règles de table dans le moteur D&D 2014.

## Relecture et équilibre du mélange

Pour chaque exemple, vérifier séparément trois dimensions :

- **MCP** : choix et arguments autorisés, résultat réel, coûts uniques, état
  persisté, absence d'action devinée ou d'information future dans la requête.
- **Interaction** : réponse au propos du joueur, clarification utile, humour
  proportionné, distinction des locuteurs et arrêt avant la prochaine décision.
- **Narration** : faits respectés, aucun secret divulgué sans justification,
  aucune réussite transformée ou décision inventée au nom du joueur.

`validation.status=passed` prouve les contrôles déclarés, pas la qualité du
dialogue. Garder `reviewStatus=needs-review` jusqu'à une relecture documentée.
Vérifier ensuite les longueurs et le masque de supervision avec le tokenizer
et le chat template cibles ; le générateur ne les vérifie pas hors ligne.

Lors du mélange MCP, narration et corpus commun, dédupliquer les mêmes couples
et garder une partition partagée par trajectoire, famille et scène source. Le
contrôle `group` du CLI ne compare que les scénarios d'un même fichier : contrôler
aussi les rapprochements entre lots. Éviter qu'une narration longue domine les
cibles courtes de clarification ; compter les exemples et les tokens supervisés
par catégorie plutôt que fixer d'emblée un ratio universel.

Réserver des situations inédites pour comparer le modèle de départ et le modèle
entraîné : blague sans action, blague avec action, ambiguïté, refus, réussite,
échec et choix suspendu. Mesurer la fiabilité des outils et relire le dialogue
sur ces mêmes situations. Un corpus validé n'atteste pas un gain du modèle.

## Validation et livraison

Pour une évolution du générateur ou de ses fixtures, exécuter successivement les
contrôles concernés, sans recompiler un moteur utilisé par une autre suite :

```bash
npm run build:mcp
node --test tests/training-dataset.test.cjs
npm run typecheck
npm test
```

Ajouter `npm run playtest:mock` si prompts, mock ou contenu d'aventure changent.
Toute extension sur plusieurs tours doit vérifier au moins la clarification sans
mutation, la reprise depuis l'état sauvegardé, les références manquantes, les
refus réels et l'absence d'export validé quand une étape échoue.

Livrer le chemin du lot, sa fixture, la sélection des cibles, les nombres par
catégorie et split, les traces et empreintes, les contrôles exécutés et les limites
restantes. La première étape réalisable est un lot à un message avec le générateur
existant ; la chaîne complète de clarification demande ensuite des traces réelles
ou l'extension décrite ci-dessus.
