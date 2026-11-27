# Archive — guide de l’ancien planner

> **Obsolète depuis le 2 novembre 2026.** Le planner a été retiré à la demande
> de l’utilisateur. `dm.plan`, `decide_action`, `DM_PLANNER_MODEL` et
> `LLM_PLANNER_ENABLED` n’existent plus dans le pipeline. Ne pas produire de
> nouveau corpus à partir du contrat ci-dessous. Les traces historiques restent
> lisibles ; les corpus courants concernent [l’agent MCP](guide-jeux-donnees-llm.md)
> et [la narration](guide-jeux-donnees-narration.md).

Le texte ci-dessous décrit uniquement l’architecture antérieure au retrait.

---

# Guide agent — jeux de données du planner actuel

Ce guide concerne **uniquement le planner déjà présent dans le projet** :
le classifieur qui analyse un message joueur et renvoie un appel à `decide_action`.
Il n'entraîne ni les appels de jeu de l'agent MCP, ni la narration, ni les résumés.

Guides voisins : [agent MCP](guide-jeux-donnees-llm.md) et
[narration](guide-jeux-donnees-narration.md).

Le couple à apprendre est **requête réelle du planner → décision structurée**.
Le modèle ne doit pas raconter un résultat ni exécuter l'action qu'il propose.

## Sources à lire

- `AGENTS.md`, `scripts/CLAUDE.md` et `tests/CLAUDE.md`.
- `lib/dm/planner.ts` : système, contexte, schéma de `decide_action`, normalisation
  et transformation de la décision en directive.
- `app/api/dm/route.ts` : moment où le planner est appelé et utilisation de sa suggestion.
- `lib/dm/llm.ts` : `PLANNER_MODEL`, appel enregistré et configuration des modèles.
- `docs/training-traces.md`, `scripts/generate-training-dataset.cjs` et les fixtures.
- `tests/dm-agent-boundary.test.cjs` : absence d'exécution des suggestions seules.

Le code courant prime sur ce guide. Ne pas recréer le script supprimé
`evaluate-intent-interpreter.cjs` ni l'ancien pipeline d'intention décrit comme
une cible dans d'autres documents. Ce travail utilise les appels actuels `dm.plan`.

## Rôle exact dans le pipeline actuel

Le planner reçoit **un seul méta-outil**, `decide_action`. Il classe le message :
résolution mécanique nécessaire ou non, outil suggéré, indices connus, confiance
et éventuelles suggestions de scène. `decide_action` n'est pas un outil de jeu MCP.

Le planner **ne recherche pas les règles dans MCP**. Le nom `consult_rules` peut
apparaître dans la liste des outils décrits et dans l'enum du champ `tool`, mais
son système demande de planifier l'outil qui résout l'action, pas de substituer
une consultation documentaire à cette action. `buildDirective` exclut aussi
`consult_rules` des plans forcés. L'agent MCP décide de la consultation et la fait
exécuter avant son action si nécessaire.

Une question portant seulement sur une règle reçoit donc normalement
`requiresMechanic=false`. Cela n'interdit pas au MJ de consulter cette règle.
Pour une action incertaine, le planner suggère sa résolution mécanique ; il ne
prétend pas avoir lu un passage ou obtenu un résultat qui n'existe pas encore.

La route ne convertit pas `target` ou `sceneMarkers` en appels de jeu. Seul un
bloc `tool_use` émis par l'agent MCP peut provoquer ces appels. Une suggestion du
planner ne suffit jamais à révéler un PNJ, acquérir un objet ou résoudre un jet.

## Entrée exacte à conserver

Sélectionner les requêtes enregistrées avec `operation=dm.plan`. Leur `params`
contient notamment :

- le système produit par `buildPlannerSystem`, avec consignes, exemples du module
  et descriptions des outils réellement disponibles pour cette phase ;
- un message utilisateur assemblé par `planPlayerAction` : phase, salle, carte,
  accroches, notes des salles voisines, bestiaire local et contexte de quête ;
- le résumé disponible et le contexte récent sélectionné par le code, actuellement
  les quatre derniers messages transmis, puis le message joueur ;
- le schéma réel de `decide_action`, dont l'enum des noms d'outils disponibles ;
- le modèle, le budget de sortie actuellement fixé à 400 et le choix forcé
  `{ "type": "tool", "name": "decide_action" }`.

Conserver la requête entière. **Ne pas utiliser le prompt du MJ comme entrée du
planner**, même pour le même message joueur : les consignes, outils et contextes
sont différents. Ne pas rajouter le résultat de la future action ou le passage
que l'agent consultera après la décision du planner.

Le résumé et l'historique restent des entrées, pas des cibles de ce corpus. Leur
présence ne prouve pas qu'une intention a été accomplie ou qu'un secret a été acquis.

## Cible : un appel valide à `decide_action`

La cible est une réponse assistant comportant un seul bloc `tool_use` nommé
`decide_action`. Ses arguments doivent suivre **le schéma de la requête retenue**.
Ne pas les valider contre le schéma de l'outil de jeu suggéré : ce ne sont pas les
mêmes paramètres.

| Champ | Schéma actuel | Sens et contrôle |
| --- | --- | --- |
| `requiresMechanic` | Booléen, obligatoire | Résolution mécanique ou changement d'état nécessaire, même certain et sans jet |
| `confidence` | `low`, `medium` ou `high`, obligatoire | Confiance dans la classification depuis le contexte disponible |
| `reason` | Chaîne, obligatoire | Justification courte, une phrase liée aux informations réellement présentes |
| `tool` | Chaîne, facultative ; enum si des outils sont exposés | Nom exact d'un outil disponible ; omettre pour une simple question sans mécanique |
| `ability` | `str`, `dex`, `con`, `int`, `wis`, `cha`, facultatif | Indice pertinent pour un test ou une sauvegarde ; pas un argument à ajouter à toute action |
| `dc` | Nombre, facultatif | DD connu et justifié par l'entrée ; ne pas inventer un DD de salle |
| `target` | Chaîne, facultative | Cible ou repère réellement établi ; pour un lieu nommé, roomId identifiable dans la carte |
| `sceneMarkers` | Tableau de chaînes, facultatif | Suggestions supplémentaires ; utiliser `[]` lorsqu'aucune n'est justifiée |

Le schéma n'exige que `requiresMechanic`, `confidence` et `reason`. Ne pas
présenter les autres champs comme obligatoires. La normalisation du serveur peut
remplacer une valeur absente ou invalide par un défaut ; cela ne rend pas une
mauvaise cible acceptable pour l'entraînement.

### Exemple : déplacement explicitement demandé

Pour un contexte réel où `move_token` est disponible et le joueur dit
« Je vais en (5,13) », une cible possible est :

```json
{
  "role": "assistant",
  "content": [
    {
      "type": "tool_use",
      "id": "planner-example-move",
      "name": "decide_action",
      "input": {
        "requiresMechanic": true,
        "tool": "move_token",
        "sceneMarkers": [],
        "confidence": "high",
        "reason": "Le joueur demande un déplacement vers une destination explicite."
      }
    }
  ]
}
```

Cette cible ne déplace personne. L'agent MCP choisira ensuite les arguments de
`move_token`, et le moteur vérifiera le trajet, les coûts et les éventuels refus.

### Exemple : question de règle sans action

Pour « Que permet Foncer ? Je ne me déplace pas encore », une cible possible est :

```json
{
  "role": "assistant",
  "content": [
    {
      "type": "tool_use",
      "id": "planner-example-rule-question",
      "name": "decide_action",
      "input": {
        "requiresMechanic": false,
        "sceneMarkers": [],
        "confidence": "high",
        "reason": "Question documentaire explicite, sans action de jeu demandée."
      }
    }
  ]
}
```

Ne pas remplacer cette cible par `tool=consult_rules` pour forcer la lecture.
La consultation reste un choix du MJ, conformément au système actuel.

## Critères de qualité des décisions

### Mécanique nécessaire ou non

Une action incertaine demandée requiert son mécanisme. Un changement certain
d'inventaire, de disposition ou de progression peut aussi exiger un outil, même
sans dé. À l'inverse, contemplation, citation, négation, hypothèse et question
documentaire ne doivent pas devenir une exécution simplement parce qu'elles
mentionnent un verbe d'action.

Interpréter la phrase entière avec la scène et l'historique. Ne pas transformer
ces exemples en regex ou liste de mots-clés côté serveur.

### Outil dédié et préalables

Suivre les descriptions présentes dans la requête et les consignes actuelles :
porte forcée par son outil dédié, déplacement furtif par `move_token`, etc.
Ne pas proposer un jet générique lorsque l'outil résout déjà le même jet et son
effet. Ne pas utiliser une lecture, un octroi d'action ou une préparation de
ressource à la place de la résolution réellement demandée.

Lorsqu'une approche est nécessaire, tenir compte de la position et des règles
de priorité données au planner. Ne pas inventer l'ouverture d'une porte distante,
le ramassage d'un objet ou une attaque préalable que le joueur n'a pas demandés.
Le plan contient une suggestion ; l'agent garde le choix des étapes autorisées.

### Confiance et indices

- `high` : intention et outil identifiables sans ambiguïté pertinente.
- `medium` : classification probable, mais une ambiguïté demeure ; la justification
  doit dire ce qui la rend probable sans remplir des choix absents.
- `low` : contexte insuffisant ou doute sur la classification. Ne pas ajouter
  une cible, un sort ou une destination pour rendre artificiellement le plan précis.

La confiance ne représente **pas la probabilité de réussir un jet**. Une attaque
claire contre une CA élevée peut avoir une classification très certaine. Un jet
qui échouera sur le dé ne justifie pas, à lui seul, `confidence=low`.

La réussite ultérieure d'une trajectoire ne valide pas sa décision de planner :
un DD inventé ou une mauvaise confiance peuvent laisser le moteur résoudre une
action sans rendre le label initial correct. Relire les champs depuis l'entrée.

### Suggestions et directive réellement produite

Vérifier aussi `buildDirective` et `buildSceneNote`. Une confiance faible, un outil
absent ou une suggestion documentaire/auxiliaire exclue peuvent ne produire aucune
directive forcée. Les exclusions évoluent avec les outils : lire la fonction,
ne pas maintenir une liste parallèle prétendument exhaustive dans les données.

Une consultation préalable reste permise au MJ lorsque la directive existe.
Elle ne satisfait pas l'action mécanique prévue. Un refus n'est pas une réussite.
Les marqueurs de scène restent des suggestions non exécutées.

## Catalogue de 32 cas propres au planner

Ces cas sont des propositions à écrire et relire, pas des fixtures annoncées
comme livrées. Vérifier outils exposés, données du module et préconditions.

| ID | Contraste ou situation | Preuve attendue dans la décision |
| --- | --- | --- |
| PLN-01 | Conversation anodine / objectif incertain | Absence ou présence de mécanique justifiée par l'objectif, pas par un mot isolé. |
| PLN-02 | Question de règle / action demandée | Question seule sans mécanique ; action planifiée par son outil de résolution. |
| PLN-03 | Déplacement certain sans jet | `requiresMechanic=true` malgré l'absence d'incertitude. |
| PLN-04 | Changement d'état certain | Outil nécessaire pour l'inventaire ou la progression, sans jet artificiel. |
| PLN-05 | Action niée / action affirmative | La négation ne déclenche pas un plan d'exécution. |
| PLN-06 | Citation ou hypothèse / intention actuelle | Mention d'une action distincte de sa demande effective. |
| PLN-07 | Faute, accent absent ou paraphrase | Décision cohérente avec le sens complet, sans règle serveur de mots-clés. |
| PLN-08 | Pronom avec référent / sans référent | Contexte récent utilisé lorsqu'il suffit ; ambiguïté non comblée sinon. |
| PLN-09 | Porte forcée avec outil dédié | Pas de test générique ajouté comme substitut au résolveur atomique. |
| PLN-10 | Trajet furtif | Proposition du déplacement dédié, pas d'un jet isolé suivi d'un effet supposé. |
| PLN-11 | Attaque ou sort | Outil de résolution disponible, sans calculer ni annoncer son résultat. |
| PLN-12 | Influence sociale / simple parole | Objectif et interlocuteur établis, sans influencer une cible inventée. |
| PLN-13 | Porte proche / approche préalable | Position prise en compte selon les consignes, sans interaction distante. |
| PLN-14 | Objet proche / hors de portée | Préalable cohérent, aucune acquisition supposée. |
| PLN-15 | Dépôt puis départ | Ordre de la demande respecté, pas d'objet laissé à une destination déjà supposée atteinte. |
| PLN-16 | Action bonus avec ou sans déclencheur | Aucun préalable ou attaque inventés pour satisfaire la demande. |
| PLN-17 | Secret encore inconnu nécessitant un jet | Présence dans les notes MJ non confondue avec connaissance acquise. |
| PLN-18 | Information publique déjà accessible | Pas de jet ajouté sans enjeu ou règle qui le justifie. |
| PLN-19 | Accepter une quête / prendre son objet | Changements distincts ; aucun transfert implicite d'inventaire. |
| PLN-20 | Mémoriser une conséquence / tenter une action | `record_scene_fact` ne remplace pas la résolution encore nécessaire. |
| PLN-21 | Intention et outil clairement établis | Confiance élevée justifiée par l'entrée. |
| PLN-22 | Intention probable mais contexte partiel | Confiance intermédiaire et indices limités à ce qui est connu. |
| PLN-23 | Classification réellement douteuse | Confiance faible, pas de cible ou de DD fabriqués. |
| PLN-24 | Jet difficile mais intention claire | Difficulté de réussite non confondue avec confiance de classification. |
| PLN-25 | Outil absent de l'exposition courante | Aucun nom halluciné ou choisi depuis un ancien schéma. |
| PLN-26 | Même message dans deux phases | Choix compatible avec la vraie liste d'outils et la scène. |
| PLN-27 | Jet tenu dans `hero.pending` | Pas d'exemple de planner fictif : le code actuel n'appelle pas cette pré-passe. |
| PLN-28 | Combat pendant le tour d'un autre acteur | Même contrôle d'absence d'appel ; ne pas créer une cible de classification inexistante. |
| PLN-29 | Marqueurs de scène suggérés | Identifiants du module et absence d'effet acquis avant l'appel explicite du MJ. |
| PLN-30 | Action nécessitant une lecture préparatoire | Action de résolution suggérée ; consultation laissée à l'agent MCP. |
| PLN-31 | Préparation ou octroi auxiliaire | Véritable action demandée planifiée, pas une ressource ou exception accordée gratuitement. |
| PLN-32 | Erreur de la pré-passe | Comportement fail-open vérifié dans le pipeline ; l'erreur n'est pas un bon label d'entraînement. |

PLN-27, PLN-28 et PLN-32 sont surtout des contrôles d'orchestration. Ils ne
produisent pas automatiquement des exemples supervisés du planner, puisque
l'appel peut être absent ou échouer.

## Constituer le corpus depuis les traces existantes

Le CLI actuel connaît `--role all` et `--role mcp`, **pas `--role planner`**.
Pour ce travail, conserver les archives complètes puis sélectionner les paires
de `operation=dm.plan`, avec une cible `decide_action` unique et valide.

```bash
npm run training:generate -- --fixture scripts/training/pilot.json --role all --out llm_training/synthetic/planner-source-v1
```

Cette commande crée une **archive source multi-rôles**, pas un export planner
déjà filtré. Exclure les `dm.turn`, `dm.npc`, narrations finales, corrections,
résumés et résultats MCP de la supervision du planner.

Le pilote possède huit décisions de planner. Le lot de recherche MCP conserve
aussi ses décisions de pré-passe dans les traces complètes, mais les exclut de
ses fichiers `train.jsonl` / `validation.jsonl`. Ne pas confondre ces fichiers
MCP avec des sources déjà prêtes pour le planner.

Les décisions écrites pour faire fonctionner un scénario MCP sont de
l'échafaudage. Elles doivent être relues pour devenir des labels du planner,
notamment sur le DD, l'outil, la cible, les marqueurs et la confiance. Ne pas
promouvoir automatiquement un corpus d'actions réussies en vérité d'interprétation.

## Contrôles avant livraison

1. Comparer chaque `request` à la trace exacte `dm.plan`, sans reconstruction.
2. Vérifier un seul `decide_action`, son schéma et son enum de cette requête.
3. Relire `requiresMechanic`, outil, confiance et indices depuis l'entrée seule.
4. Vérifier l'absence de résultat futur, source non lue, cible inventée ou vocabulaire
   provenant d'un autre module.
5. Contrôler l'effet réel de la décision sur la directive, sans jamais exécuter la
   mécanique depuis le planner pour « confirmer » un label.
6. Comparer les variantes proches : question/action, négation/affirmation,
   référent présent/absent, outil dédié/générique, état certain/incertain.
7. Garder la famille dans un seul split, y compris si la même trajectoire fournit
   aussi un corpus MCP ou narration.
8. Conserver provenance, empreintes, statut de relecture et champs sélectionnés.

Éviter un corpus composé seulement de `requiresMechanic=true` et `confidence=high`.
Prévoir aussi de vraies questions sans mécanique et des ambiguïtés motivées.
Les classes doivent refléter des cas utiles, pas des variations artificielles
obtenues en changeant un champ sans changer les faits qui le justifient.

La validation de schéma ou la réussite du moteur ne certifient pas la qualité
sémantique de la classification. Garder `reviewStatus=needs-review` tant que la
relecture des décisions n'est pas documentée. Une justification courte ancrée
dans l'entrée suffit ; ne pas fabriquer de résultat ou de long raisonnement caché.

Respecter les contrôles requis par `AGENTS.md`. Les changements de fixtures ou
du générateur doivent conserver les tests de fidélité et de frontière agent/MCP.
Ne pas modifier les prompts de production pour rendre artificiellement une
mauvaise cible conforme, et ne pas recompiler le moteur pendant une suite active.

## Préparation à l'entraînement du seul planner

Superviser uniquement la cible `decide_action`. Masquer le système, le contexte,
les messages antérieurs et toute autre réponse. Conserver les schémas et formats
réels pour que le modèle apprenne le contrat de sortie qu'il reçoit effectivement.

Vérifier ensuite longueurs et format avec le tokenizer et le chat template du
modèle choisi. Le générateur hors ligne ne réalise pas ce contrôle de budget.
Ne pas tronquer silencieusement les indices nécessaires à la décision.

`DM_PLANNER_MODEL` configure déjà le modèle du planner dans `lib/dm/llm.ts`.
`DM_MODEL` et `DM_COMPRESS_MODEL` sont des réglages distincts ; le modèle de
compression reprend le planner par défaut si aucune surcharge n'est fournie.
Vérifier les valeurs réellement utilisées pour ne pas attribuer au mauvais rôle
une variation de comportement. L'entraînement ne doit modifier ni l'autorité du
moteur ni la frontière entre suggestion du planner et action choisie par le MJ.
