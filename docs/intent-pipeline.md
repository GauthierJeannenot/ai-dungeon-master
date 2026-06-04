# Intent Pipeline

Objectif: garder le moteur comme source de verite sans forcer le jeu a vivre dans une liste finie de regex.

Le pipeline cible est:

1. Message joueur brut.
2. Intent Interpreter cheap LLM en JSON strict.
3. Validation serveur du JSON.
4. Plan d'action: action canonique, clarification, ou improvisation.
5. `resolve_player_action` applique les mutations autorisees.
6. Le moteur produit des `EngineEvent` et met a jour `GameState.world`.
7. Le narrateur final met en scene uniquement ces faits moteur.
8. `TurnTrace` persiste input, interpretation, plan, events, diff monde, contradictions et narration.

## Roles

`Intent Interpreter`

- Comprend le francais naturel, les typos, les anaphores simples et les actions absurdes.
- Retourne un JSON court et strict.
- Propose une action ou une improvisation.
- Ne mute jamais l'etat.
- Peut demander une clarification si la cible est vraiment ambigue.

`SceneSurface`

- Decrit la surface jouable actuelle: PNJ, objets, sorties, dangers, inventaire, affordances, fiction facts actifs.
- Sert de contexte principal a l'interpreteur.
- Reste consultative: le moteur valide toujours l'action finale.

`Game engine`

- Valide la legalite.
- Applique les mutations via action canonique.
- Produit les `EngineEvent`.
- Persiste les faits fictionnels dans `world.fictionFacts`.
- Transforme les faits fictionnels actifs en affordances souples quand c'est utile.
- Refuse proprement si une action n'est pas afforded.

`Narrateur final`

- Ne decide pas ce qui est vrai.
- Recoit le paquet moteur, les events, l'Intent Interpreter output et les affordances.
- Peut rendre la consequence vivante, mais pas inventer une porte ouverte, un objet trouve, un PNJ convaincu, un ennemi apparu ou une mort.

## Pourquoi pas seulement des regex

Les regex sont utiles pour les fast-paths tres surs:

- debug/state explicite;
- potion evidente;
- death save quand le joueur est a 0 PV;
- coordonnees simples;
- passer son tour evident.

Elles ne doivent pas router le langage naturel general. Une fois l'Intent Interpreter appele, sa sortie fait foi: action canonique, clarification, query/guidance, ou absence de plan. Le serveur ne doit pas retomber silencieusement sur `classifyPlayerAction` pour "sauver" une phrase naturelle.

Elles ne suffisent pas pour le coeur du jeu:

- les joueurs parlent mal, vite, avec des fautes;
- une meme phrase peut etre sociale, hostile, ironique ou meta;
- les actions absurdes sont centrales dans un JDR;
- le moteur ne peut pas prevoir toutes les combinaisons d'objets, sorts, liquides, meubles, insultes et plans idiots.

Le role du petit LLM est donc de comprendre l'intention. Le role du moteur reste de decider ce qui change vraiment.

## Sortie JSON

Schema logique:

- `intentKind`: famille d'intention, par exemple `ask`, `attack`, `improvise`, `guidance`;
- `confidence`: nombre de 0 a 1;
- `requiresClarification`: true si la cible ou l'effet manque;
- `clarificationQuestion`: question courte si necessaire;
- `canonicalAction`: action proposee pour `resolve_player_action`, ou null;
- `improvisation`: type d'improvisation propose;
- `targetHints`: cible, candidats ou type de cible;
- `reasoningSummary`: resume court, sans chaine de pensee.

L'interpreteur peut proposer. Le serveur valide le schema, puis le moteur valide l'action.

## Improvisation

`improvise` est la route centrale pour les actions plausibles que le moteur ne modelise pas en detail.

Types documentes:

- `create_fiction_fact`: creer un fait fictionnel persistant;
- `use_fiction_fact`: reutiliser un fait actif;
- `social_transgression`: insulte, humiliation, provocation corporelle;
- `environmental_change`: eau, feu, fumee, obstacle, surface glissante;
- `improvised_tool_object`: meuble, planche, tabouret, outil improvise;
- `distraction_noise`: diversion, bruit, leurre;
- `non_mechanical_flavor`: geste sans effet mecanique important.

Exemples:

- "je cree de l'eau sous la porte" -> `improvise` + `environmental_change`;
- "je prends un tabouret pour bloquer la porte" -> `improvise` + `improvised_tool_object`;
- "je pisse sur l'arbre" -> `improvise` + `social_transgression`, puis possible `npc.disposition_changed`;
- "je fais diversion" -> `improvise` + `distraction_noise`.

Une improvisation acceptee peut produire:

- `fiction.fact_created`;
- `fiction.fact_used`;
- `npc.disposition_changed`;
- `alarm.raised`;
- `state.changed`;
- `improvisation.resolved`.

Depuis la v2, un `fictionFact` peut aussi porter des `softAffordances`.
Ces affordances ne sont pas des boutons imposes au joueur: elles servent a la resolution naturelle future.
Exemple: une flaque creee par "creation d'eau" expose une action souple "exploiter la surface mouillee", qui route vers:

```json
{
  "kind": "improvise",
  "usesFactIds": ["fact-r4-water-under-door"],
  "tags": ["wet_surface", "use_fiction_fact"]
}
```

Le fait reste donc dans la source de verite, mais le moteur ne pretend pas modeliser toute la physique de l'eau.

## Clarifier ou refuser

Clarifier quand:

- plusieurs cibles plausibles existent;
- un pronom ne peut pas etre resolu;
- l'effet voulu est trop vague pour muter le monde.

Ne pas clarifier quand:

- une seule affordance correspond clairement;
- le dernier event moteur donne la cible, par exemple porte ouverte puis "tu ne m'as pas deplace";
- un portail explicite est utilise, par exemple escalier/etage, porte, seuil: cela doit produire un deplacement moteur si la transition est valide;
- une action rejetee peut etre resolue par le moteur en `action.blocked`.

Refuser quand:

- l'action contredit l'etat moteur;
- la cible n'existe pas dans la scene et ne peut pas etre creee par improvisation;
- le joueur est inconscient et tente une action active;
- une action est non afforded.

Improviser quand:

- l'action est creative ou absurde mais plausible en fiction;
- elle peut etre exprimee comme un fait persistant sans casser les regles;
- elle ne pretend pas ouvrir une porte, trouver un objet, tuer un PNJ ou gagner un combat sans event moteur.

## Anti default prompt

Les fallbacks generiques de salle sont interdits comme reponse normale.

Si le pipeline ne produit aucun event utile:

- il doit payer une narration finale LLM si possible;
- sinon il demande une clarification contextuelle;
- il ne doit pas ressortir une boucle d'ambiance comme "la piece gronde".

Les erreurs de regle doivent rester observables: si un tool canonique refuse sans event exploitable, la route reflete un `action.blocked` dans le TurnTrace/world log pour eviter un refus invisible.

Le budget LLM est donc soft par defaut. Un blocage dur n'est actif que si `LLM_HARD_BUDGET_ENABLED=true`.

Les vieux fallbacks visibles du type "Le Dungeon Master reflechit" ne sont pas une sortie valide de tour.
Si la narration finale est vide, le serveur doit produire une clarification contextuelle depuis l'intent, la `SceneSurface` et les affordances, puis logguer le remplacement.

## TurnPipeline

La politique de tour vit dans `lib/turn-pipeline.ts`:

- detection des actions canoniques monde;
- selection consultative des tools LLM;
- choix `short/rich/blocked` pour iteration et narration finale;
- fusion des routes LLM.

`app/api/dm/route.ts` reste l'enveloppe HTTP/session/MCP, mais la politique n'est plus enfermee dans la route.
La prochaine extraction doit sortir l'orchestration complete en stages:

1. `intentStage`;
2. `planningStage`;
3. `engineStage`;
4. `reactionStage`;
5. `narrationStage`;
6. `contractStage`;
7. `traceStage`.

## Evaluation d'intention

`npm run eval:intent` lance `scripts/evaluate-intent-interpreter.cjs` sur `tests/fixtures/intent-interpreter-eval.json`.

Le but n'est pas de prouver que le mock comprend tout.
Le but est de transformer les problemes de prod en cas scores:

- message joueur;
- etat initial approximatif;
- `intentKind` attendu;
- `canonicalAction.kind` attendu;
- type d'improvisation attendu;
- clarification attendue ou interdite.

Quand les logs prod contiennent un `TurnTrace`, on peut aussi scorer la sortie `intentInterpreterOutput` deja enregistree.
Cette boucle doit remplacer l'accumulation de regex au cas par cas.

## Ajouter une action canonique

1. Ajouter le kind dans `lib/types.ts` et `lib/game-actions.ts`.
2. Ajouter l'effet moteur ou la validation dans le serveur MCP.
3. Ajouter les affordances dans `SceneSurface` ou `world-engine`.
4. Ajouter le mapping dans l'Intent Interpreter.
5. Ajouter les tests: legal, refused, event produit, narration non contradictoire.

## Lire les logs TurnTrace

Champs utiles:

- `intent`: intention retenue par le serveur;
- `intentInterpreterInputSummary`: resume donne a l'interpreteur;
- `intentInterpreterOutput`: JSON strict retourne;
- `intentInterpreterModel`: modele ou mock utilise;
- `intentInterpreterFallbackReason`: fast-path, mock, ou erreur de fallback;
- `parsedAction`: action canonique retenue;
- `actionPlan`: plan execute ou refuse;
- `engineEvents`: verite moteur du tour;
- `worldDiff`: mutations explicites;
- `contradictions`: faits narres non supportes.

## Limites restantes

- Le mock local reste heuristique: il sert aux tests sans cle LLM, pas a remplacer le LLM cheap en prod.
- `classifyPlayerAction` existe encore comme legacy/fast-path mecanique, mais ne doit plus redevenir le cerveau general du tour.
- Les creations d'entites completes au runtime restent limitees; `fictionFacts` couvre les faits fictionnels, pas encore un systeme generique d'objets/PNJ complexes.
- Les clarifications peuvent encore etre trop sobres; elles doivent rester meilleures qu'un faux texte d'ambiance.
- Les garde-fous narratifs detectent les contradictions les plus dangereuses, pas toute la semantique possible du francais.
