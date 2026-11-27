# Guide agent — jeux de données pour piloter MCP

Ce guide concerne **uniquement l'apprentissage des décisions et appels MCP** :
choix d'outil, arguments, ordre, lecture des règles, refus, précisions et fin de
résolution. On entraîne le LLM qui pilote le moteur ; les règles restent du code.
La narration, le style et les résumés ne sont pas des cibles de ce corpus.

Pour les récits et les réponses finales au joueur, utiliser le guide distinct
[jeux de données de narration](guide-jeux-donnees-narration.md).
Pour apprendre les passages entre dialogue, clarification, outils et récit,
utiliser le [guide reliant MCP et narration](guide-jeux-donnees-mcp-narration.md).
Le MJ interprète directement les actions ; aucun corpus de classifieur séparé
n’est produit par le pipeline courant.
Le présent fichier conserve son nom pour préserver les liens existants.

Le couple à apprendre est **contexte réel disponible → décision de l'agent**.
Le contexte peut contenir des narrations antérieures : elles restent des entrées
masquées pour l'apprentissage et ne deviennent pas des cibles de prose.

## Sources à lire avant de modifier un lot

- `AGENTS.md`, `scripts/CLAUDE.md` et, pour les tests, `tests/CLAUDE.md`.
- `docs/training-traces.md` : collecte, exports, format et limites.
- `scripts/generate-training-dataset.cjs` : comportement réellement disponible.
- `scripts/training/pilot.json` : huit scénarios exécutables de référence.
- `tests/training-dataset.test.cjs` : fidélité des snapshots, chronologie des
  règles, validation des arguments, absence de réseau et refus des faux résultats.

Le code courant prime sur une description ancienne. Le vrai outil de consultation
s'appelle `consult_rules`, pas `lookup_rules`. Pour un nouveau domaine mécanique,
consulter ponctuellement son outil et ses tests. Si le travail touche un lot MCP,
lire `docs/suivi-integration-mcp.md` ; ne pas refaire d'audit global des livres ni
reconstruire son backlog à partir des archives.

## Invariants du processus

1. **Le moteur décide des résultats.** Ne pas écrire à la main un résultat MCP,
   un jet réussi, des dégâts, une dépense ou une position finale pour fabriquer
   une preuve. Choisir les appels, puis laisser le vrai moteur les résoudre.
2. **L'auteur interprète le scénario.** Les choix de tool et leurs arguments sont
   écrits explicitement dans la fixture. Aucun parseur du message joueur, regex
   ou détecteur de mot-clé ne doit piloter les actions dans le serveur live.
3. **Le contexte vient du pipeline.** Utiliser la vraie route DM, les constructeurs
   de contexte et les résultats d'outils enrichis par cette route. Ne pas recopier
   ou simplifier un prompt système « équivalent ».
4. **La chronologie reste intacte.** Une règle consultée, un jet et une mise à jour
   de salle ne peuvent apparaître dans le contexte qu'après leur obtention.
   Ne jamais enrichir rétroactivement un input avec la réponse attendue.
5. **Aventure et personnage sont fixes par session.** Un scénario possède les
   deux identifiants ; ne pas réutiliser sa session pour changer de module ou de
   personnage. Respecter les données et le vocabulaire de chaque aventure.
6. **Hors ligne signifie sans fournisseur.** Conserver les garde-fous du CLI :
   pg-mem, `LLM_MODE=mock`, `ALLOW_PAID_LLM=false`, Runpod désactivé, réseau bloqué.
   Les labels viennent des fixtures, pas des heuristiques du faux LLM habituel.

Le CLI substitue le fournisseur uniquement dans son processus. Ne pas déplacer
cette substitution dans la route de production, ne pas ajouter un nouveau mode
`LLM_MODE`, et ne pas réintroduire l'ancien pipeline d'eval d'intention supprimé.

## Choisir des cas utiles

Décrire d'abord le comportement à apprendre et l'erreur précise à éviter. Une
variation de formulation n'est utile que si elle teste une difficulté réelle.
Privilégier de petits groupes contrastés, en ne changeant qu'une cause à la fois.

Le [catalogue détaillé de 80 cas](catalogue-cas-llm.md) fournit des situations
concrètes, leurs preuves attendues, les besoins d'extension du générateur et
l'ordre conseillé pour les prochains lots. Dans ce catalogue commun, retenir ici
les **décisions et arguments** ; ses vérifications de prose relèvent du guide de
narration. Un scénario peut fournir deux corpus, avec des cibles différentes.

| Famille | Contraste utile | Preuves attendues |
| --- | --- | --- |
| Consultation documentaire | Question de règle / action effectivement demandée | Appel de lecture, source exacte, aucun coût mécanique indu |
| Action possible | Réussite / échec du même test | Résultat réel du dé, une seule résolution, décision suivante conforme |
| Refus | Destination, cible, portée ou ressource invalide | Refus réel, ressources et état pertinents inchangés |
| Choix incomplet | Cible ou destination explicite / absente ou ambiguë | Clarification ; aucune cible ni coordonnée ajoutée implicitement |
| Langage du joueur | Action affirmative / négation, citation ou hypothèse | Seule l'action réellement choisie produit un bloc tool_use |
| Contexte spatial | Avant / après mouvement ou porte | État actualisé dans le résultat d'outil, message initial gelé |
| Mémoire | Historique brut / résumé ; intention / fait accompli | Résumé fidèle, état autoritaire, aucun secret acquis par erreur |
| Action dédiée | Outil atomique / tentative de jet générique redondant | Aucun double jet, coût ou contournement de refus |
| Variation de personnage | Même situation avec ressources ou capacités différentes | Schémas et choix cohérents avec la vraie fiche |
| Variation d'aventure | Même compétence dans deux contextes distincts | Contexte local correct, aucune fuite d'un autre module |

Pour les futurs lots combat, sorts, objets et interactions PNJ, partir des
contrats déjà implémentés. Un résultat théorique du livre ne suffit pas à prouver
que le moteur l'exécute. Ne pas multiplier les cas au détriment de leur exactitude.

## Format de scénario actuellement supporté

Le fichier racine contient `schemaVersion: 1` et un tableau `scenarios`.

| Champ | Usage |
| --- | --- |
| `id` | Identifiant unique composé de minuscules, chiffres, `_` et `-` |
| `split` | `train` ou `validation` ; fixer le groupe avant l'export |
| `group` | Famille de variantes ; le générateur refuse sa dispersion entre deux splits |
| `ruleLookupInitiative` | `agent`, `player` ou `none` ; origine déclarée de la consultation |
| `adventureId`, `characterId` | Identifiants existants du registre |
| `message` | Message joueur complet, sans interprétation automatique |
| `diceSequence` | Dés explicites pour un scénario déterministe, si nécessaire |
| `history` | Historique cohérent avec l'état initial, au format des sessions |
| `historyTemplate` | Génération déclarée d'un historique répétitif pour la compression ; voir le pilote |
| `summaryContext` | Résumé initial facultatif, cohérent avec l'état et les connaissances établies |
| `steps` | Réponses attendues successives, dans l'ordre réel des appels LLM |
| `unchanged` | Chemins d'état dont la valeur doit rester identique |
| `checks` | Conditions sur `state` final ou `body` de réponse |

Chaque étape a une `operation` et **soit** `tool: { name, input }`, **soit** `text`.
Les opérations admises sont `dm.turn`, `dm.npc`, `history.compress`,
`dm.final_narration` et `dm.repair_narration`. Une étape peut avoir des `checks`
portant sur `params`, `gameState`, `lastTool` et `lastToolResult`.

Ces étapes décrivent l'exécution complète nécessaire pour capturer une situation.
Les étapes de narration finale ou de compression servent d'échafaudage et de
contexte : **les exclure des cibles MCP**. Une étape textuelle demandant une
précision est une décision d'agent, pas une narration. Sa sélection doit être
explicite ; l'opération `dm.turn` seule ne distingue pas ces rôles.

Une condition sélectionne un `path` puis utilise `equals`, `includes` ou `exists`.
`includes` normalise seulement les espaces pour vérifier un passage source ; ce
n'est pas une interprétation de message joueur. Pour une preuve mécanique,
préférer l'égalité d'un champ structuré à un simple mot trouvé dans une narration.

Les arguments sont validés contre les schémas des tools réellement exposés.
Le CLI ne charge pas automatiquement `.env.local` : transmettre explicitement
les surcharges de modèles, cache et historique si un lot doit reproduire une
configuration particulière. Vérifier les modèles/seuils dans le manifeste et
les paramètres exacts dans les champs `request` exportés.
Pour lire un identifiant obtenu juste avant, utiliser une référence explicite :

```json
{
  "operation": "dm.turn",
  "tool": {
    "name": "consult_rules",
    "input": {
      "sectionId": { "$ref": "lastToolResult.results.0.sectionId" },
      "limit": 5000
    }
  }
}
```

Une référence absente doit échouer. Ne pas ajouter un fallback qui choisit une
autre section, cible ou destination. Vérifier la présence et le sens du résultat
dans les `checks` de l'étape avant de produire sa réponse attendue.

### Exemple complet : citation sans lancement de sort

Ce cas utilise le format existant et n'ajoute aucune action MCP de jeu :

```json
{
  "schemaVersion": 1,
  "scenarios": [
    {
      "id": "quoted-spell-no-cast",
      "split": "validation",
      "adventureId": "fey-shadow-fair",
      "characterId": "wizard",
      "message": "Je cite « je lance un sort » pour en discuter, mais je ne lance rien.",
      "unchanged": ["player.position", "player.hp", "hero", "actionUsed"],
      "checks": [{ "path": "body.toolsUsed", "equals": [] }],
      "steps": [
        {
          "operation": "dm.turn",
          "text": "Tu n'as lancé aucun sort. Lequel veux-tu examiner pour en discuter ?"
        }
      ]
    }
  ]
}
```

### Limites à respecter avant d'étendre le format

Le générateur actuel traite **un message joueur par scénario**, depuis l'état
initial réel du module, avec historique ou résumé facultatif. Il n'expose pas de
patch arbitraire d'état, de séquence de tours ni d'étape `dm.npc`.
Un scénario de combat déjà engagé, une transition multi-tours ou une décision PNJ
demande donc d'abord une extension explicite et testée du générateur. Ne pas
documenter des champs qui sont ignorés ni inventer un historique prétendant que
des actions ont modifié un état qui ne les contient pas.

## Vérifier les réponses attendues

- Après un outil, contrôler son identité, son statut et les champs qui justifient
  la décision suivante. Un refus n'autorise ni confirmation de réussite ni mutation
  qui en dépendrait.
- Pour un coût ou un refus, comparer les ressources concernées avant/après :
  PV, emplacements, inventaire, action, mouvement, concentration, selon le cas.
- Pour un jet autonome, vérifier le succès ou l'échec réel et l'absence de second
  jet. Ne pas déduire un secret ou une conséquence absente du résultat moteur.
- Après mouvement, vérifier la position autoritaire et le contexte local ajouté
  au résultat. Le système statique et le message initial du tour restent gelés.
- Pour une règle, rechercher puis lire le passage utile ; respecter la pagination.
  Conserver la source et son attribution. Une consultation ne réalise pas l'action
  décrite et n'active pas une règle optionnelle.
- Lorsque l'entrée est déjà compressée, vérifier que l'agent conserve la différence
  entre intentions, faits, objets déposés et connaissances acquises. Cela contrôle
  sa décision depuis ce contexte ; le résumé lui-même n'est pas une cible MCP.
- Vérifier la décision suivante : aucun outil superflu, aucun argument deviné,
  aucune nouvelle tentative ou action autorisée seulement par une réussite inventée.

Ajouter des assertions qui pourraient détecter un vrai mauvais exemple. Éviter
les contrôles qui se contentent de répéter le texte de la cible ou de compter
des lignes sans vérifier les mécanismes et la disponibilité des informations.

## Splits et provenance

Garder une famille et ses variantes proches dans le même split : par exemple
réussite/échec d'une situation, paraphrases, changements de dé. Un nouvel identifiant
ne rend pas un doublon indépendant. Pour agrandir le corpus, contrôler les scénarios
déjà présents avant d'ajouter des variantes. Une petite séparation dans le pilote
n'est pas une mesure de généralisation du modèle.

Conserver les métadonnées `synthetic-authored`, les identifiants de scénario et de
trace, les empreintes et les références documentaires. Ne pas présenter les cibles
comme des sorties de Qwen ou les mélanger sans distinction aux parties réelles.
`validation.status=passed` atteste les contrôles déclarés ; `reviewStatus=needs-review`
reste honnête tant qu'une relecture éditoriale n'est pas documentée. Livrer le lot
et ses limites sans créer une demande d'autorisation superflue.

## Exécution et validation

```bash
npm run training:generate
npm run training:generate -- --fixture scripts/training/mon-lot.json --out llm_training/synthetic/mon-lot-v1
npm run training:generate -- --fixture scripts/training/mcp-rule-research-v1.json --role mcp --out llm_training/synthetic/mon-lot-mcp
```

Le dossier de sortie doit être vide ; choisir un nouveau nom pour chaque version.
Le CLI ne doit pas écraser un lot existant. Un échec conserve ses traces et un
manifeste `failed`, sans exporter `examples.jsonl` comme si le lot était valide.

Pour développer et vérifier une évolution :

```bash
npm run build:mcp
node --test tests/training-dataset.test.cjs
npm run typecheck
npm test
npm run playtest:mock
```

Respecter les instructions de validation du projet. Exécuter la suite complète
et le playtest successivement : tous deux recompilent `mcp-server/dist/`, qui ne
doit pas changer pendant l'exécution d'un moteur. Ajouter un test ciblé lorsqu'un
nouveau contrat est introduit, puis vérifier le lot généré et son manifeste.

Livrer le chemin du corpus, le nombre de scénarios/exemples, les contrôles exécutés,
les limites et le prochain enrichissement concret. Ne pas prétendre qu'un entraînement
ou une évaluation du modèle a eu lieu lorsque seul le dataset a été généré.

## Préparation ultérieure à l'entraînement

Par défaut (`--role all`), la commande produit une **archive multi-rôles**.
Le pilote contient huit cibles d'appels d'outils du MJ, une clarification, sept autres réponses finales textuelles et un résumé.

Pour constituer ce corpus :

1. Retenir les `tool_use` de l'agent principal (`dm.turn`), notamment `consult_rules`.
2. Retenir explicitement les précisions et décisions de fin utiles. Ne pas supprimer
   ces comportements sous prétexte que leur représentation actuelle est textuelle.
3. Exclure les récits, réponses finales explicatives et `history.compress` des
   cibles de ce corpus. Conserver les résultats réels comme contexte lorsque requis.

L'option **`--role mcp`** retient uniquement les cibles assistant composées de
`tool_use`, sur les opérations de l'agent principal (`dm.turn`, et `dm.npc` pour
les sources qui en produiraient). Elle exclut les résumés et tous les
textes. Les inputs et cibles retenus restent identiques aux snapshots capturés ;
aucun prompt ou résultat MCP n'est reconstruit par ce filtre.

`examples.jsonl`, `train.jsonl` et `validation.jsonl` ne contiennent alors que ces
cibles d'outils. `selection.json` liste les identifiants exclus et leurs raisons,
sans y copier les textes cibles. Le manifeste compte les sources et exclusions.
Les traces et scénarios restent complets pour la vérification ; ne pas les donner
directement au trainer comme s'ils étaient les fichiers de supervision filtrés.

Ce filtre est destiné aux lots spécialisés d'appels MCP. Il **ne contient pas
de cibles de clarification ou de fin** et ne constitue donc pas, seul, un corpus
complet de tous les comportements de l'agent. Le format n'a toujours pas d'étiquette
sémantique dédiée à ces textes de contrôle. Les sélectionner explicitement si un
lot ultérieur doit les apprendre ; ne pas les confondre avec des récits.

Le lot `mcp-rule-research-v1.json` montre des consultations choisies par l'agent
avant une action que le joueur demande sans solliciter de lecture documentaire.
Avec `ruleLookupInitiative=agent`, le générateur vérifie que le premier appel du
MJ est `consult_rules`, que d'autres outils étaient disponibles et qu'aucun outil
nommé ne lui imposait ce choix. Les décisions restent des démonstrations écrites,
pas des générations spontanées de Qwen. Les résultats de recherche sont réels.

`request` reste l'entrée exacte ; `target` est la décision sélectionnée à apprendre.
`chat` fournit la conversion Chat Completions actuelle. Superviser uniquement cette
cible et masquer les réponses assistant antérieures et les résultats des outils.

Le même modèle peut continuer à narrer dans le pipeline courant sans supervision
de prose dans ce lot. Des poids ajustés peuvent néanmoins changer ses autres
comportements : les vérifier séparément. Un acteur autonome distinct d'un narrateur
nécessiterait un contrat de fin et de clarification explicite, absent à ce jour ;
le filtrage d'un dataset ne crée pas cette architecture.

Le générateur n'exécute pas le tokenizer live et indique
`tokenBudgetValidation=not-run-offline`. Vérifier plus tard les longueurs avec le
tokenizer et le chat template du modèle cible ; ce calcul peut se faire localement.
Ne pas tronquer silencieusement le système, le message joueur ou un résultat MCP
pour faire entrer un exemple dans une limite. Cette étape est distincte de la
fidélité des chaînes de contexte capturées et de la relecture des cibles.

## Lot livré : recherche de règles par l'agent

Fixture : `scripts/training/mcp-rule-research-v1.json`.
Sortie : `llm_training/synthetic/mcp-rule-research-v1/`.

Le lot contient **16 scénarios / 45 cibles d'appels MCP** : 31 exemples
d'entraînement et 14 de validation. Treize scénarios commencent par une lecture
choisie par l'agent, sans demande documentaire du joueur ; trois résolvent
directement l'action ou son refus, sans consultation. Les variantes de dé et
les connaissances d'Intelligence restent groupées dans leur split.

Les 29 appels `consult_rules` couvrent recherche, sélection de section, lecture
paginée et reformulation d'une requête française sans résultat. Ils précèdent
11 tests de compétence et cinq demandes de déplacement, dont des trajets furtifs
et un refus hors carte. Les règles consultées sont celles du SRD local 2014,
avec source, empreinte et attribution CC BY 4.0 conservées.

Les 61 réponses de l'exécution complète ont été comparées aux traces. Les
16 textes finaux sont exclus des fichiers de supervision ; les anciennes décisions
de classifieur ont été retirées des fixtures.
Seuls les couples retenus sont présents dans `examples.jsonl`, `train.jsonl` et
`validation.jsonl`. Les trois personnages sont dans une scène initiale calme,
niveau 1 : ce lot ne certifie pas les classes SRD avancées, le combat ou les PNJ
réactifs. Une première tentative de scène avec réaction PNJ a été archivée comme
incomplète, sans dataset exporté ; ses traces ne sont pas des exemples à entraîner.

Reproduction dans un nouveau dossier vide :

```bash
npm run training:generate -- --fixture scripts/training/mcp-rule-research-v1.json --role mcp --out llm_training/synthetic/mcp-rule-research-v2
```

Il s'agit de démonstrations écrites et vérifiées mécaniquement, pas d'une preuve
que Qwen choisit déjà spontanément ces consultations. La relecture des cibles et
la validation des longueurs avec le tokenizer cible restent nécessaires.
