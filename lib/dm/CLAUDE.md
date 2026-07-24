# lib/dm/ — pipeline du Dungeon Master

Orchestré par app/api/dm/route.ts : anti-abus → débit → session autoritaire →
sync MCP → compression historique (`history.ts`) → classifieur d'intention
(`planner.ts`, Haiku) → boucle agentique tool-use (Sonnet) → persistance.

## Prompt caching Anthropic — l'invariant n°1

Structure retravaillée le 2026-07-12 pour maximiser le hit cache (voir
docs/opus-brief-reduction-cout-llm.md, docs/cost-optimization.md). Trois règles :

1. **Le SYSTÈME ne contient QUE le bloc statique.**
   `buildStaticSystemBlocks` (prompts.ts) émet un seul bloc système (règles +
   fiche + index du module, `cache_control: ephemeral`). Il ne dépend que de
   l'aventure et du personnage → **byte-identique sur toute la session ET sur
   toute la boucle tool-use**. Ne JAMAIS y réinjecter de contenu variable
   (timestamp, sessionId, état, directive) : toute variation par requête casse
   le cache et multiplie le coût d'input Sonnet.
2. **Le contexte volatil part dans le message user du tour courant.**
   `buildTurnUserMessage` (état, salle, directive du classifieur via
   `buildDynamicPrompt`) est **gelé à l'ouverture du tour** : en cours de
   boucle on NE re-sérialise PAS l'état — l'état frais vient des `tool_result`.
   Re-sérialiser à chaque itération (comme l'ancien bloc système dynamique)
   invaliderait le suffixe caché. Si un jour la narration « oublie » un
   changement d'état en boucle, réinjecter un delta COMPACT en fin de
   `tool_result`, jamais dans le système.
3. **Breakpoints de cache (≤ 4)** : statique · fin d'historique
   (`withCachedHistoryPrefix`) · fin du message de tour · **glissant** sur le
   dernier `tool_result` (route.ts déplace le `cache_control` à chaque round).
   `promptCacheControl()` est la source unique du descripteur (respecte
   `LLM_PROMPT_CACHE_ENABLED`/`_TTL`).

- une variante de cache par module d'aventure et par phase (tools filtrés
  exploration/combat) est voulue — ne pas « optimiser ».
- toute reformulation du prompt statique invalide le cache des sessions en
  cours ET fausse les comparaisons playtest : reformuler = commit séparé,
  mesuré par `npm run playtest:mock` avant/après.
- l'enforcement de la directive du classifieur passe par `tool_choice` (pas par
  le texte, qui est gelé dans le message de tour) : tant que le tool planifié
  n'a pas réussi, on force un tool ; satisfait → `auto`.

## Carte de la scène (scene-map.ts)

`renderSceneMap` génère la carte de la map COURANTE depuis GameState + map.ts,
dans le bloc DYNAMIQUE (`## CARTE DE LA SCÈNE`). Deux niveaux : TOUJOURS les
zones de salles + contiguïtés précalculées (`zonesTouch`/`directionLabel`),
entrées et positions (joueur, PNJ révélés, monstres vivants) ; en COMBAT
seulement, la grille ASCII tactique en plus (géométrie fine — hors combat elle
coûterait des tokens par appel pour un signal déjà couvert). C'est LA carte de
référence du DM : les `adventure-module.md` n'ont plus de grille écrite à la
main (leur section « Carte des salles » renvoie au bloc dynamique). Ne jamais
déplacer cette carte dans le bloc statique (elle varie à chaque tour = cache
cassé), ni réintroduire une grille figée dans un module .md (elle divergerait
de l'état).

Chaque contiguïté est scindée en « communique avec » (franchissable) et
« contiguë mais cloisonnée » (mur). Le moteur déduit la salle courante de la
POSITION (`inferRoomIdOnMap`, containment de zone), pas d'un graphe de portes —
donc toute contiguïté est franchissable PAR DÉFAUT et l'absence de
`doorTransition` n'est PAS un mur (celles-ci ne servent qu'à
`relativeAdventureRoomIdForText`, la nav langage naturel). Les vraies cloisons
sont donc des données AUTORÉES : `AdventureMapData.partitions` (map.ts) liste
les paires de salles contiguës qui NE communiquent pas. Le champ est optionnel
(absent ⇒ aucune cloison). Verrous : `tests/dm-scene-map.test.cjs` (rendu +
cloisons Grammy's) et `tests/adventure-modules.test.cjs` (paires valides,
même map, réellement contiguës). Marche à suivre pour cloisonner un module dans
`adventures/CLAUDE.md`.

## Vocabulaire par module — jamais en dur

Les prompts ne contiennent AUCUN nom propre de module : lieux, PNJ et exemples
viennent de `promptGuidance` (adventures/<id>/definition.ts) via
`getAdventureDefinition(gameState.adventureId)`. Le verrou
tests/no-module-leaks.test.cjs échoue si « Grammy/verger/dryade/… » réapparaît
dans lib/. Tout nouvel exemple dans un prompt passe par un champ de
`AdventurePromptGuidance`, pas par une chaîne littérale.

## Classifieur d'intention (planner.ts)

- Pré-passe Haiku « soft » : un méta-tool forcé `decide_action` décide si le
  message exige une mécanique. Fail-open : toute erreur → le DM continue seul.
- Le champ `tool` est contraint par enum aux tools réellement exposés cette
  phase (pas d'hallucination de nom).
- HYBRIDE : les marqueurs de scène sûrs (`reveal_npc`, `trigger_room_event`)
  sont exécutés PAR LE SERVEUR (`executeSceneMarkers`) si confiance ≥ medium ;
  les jets/combat restent une directive injectée que le DM exécute lui-même.
- confidence=high → `tool_choice` force EXACTEMENT le tool planifié ;
  medium → force « au moins un tool » ; low → aucune directive.
- La directive tombe dès qu'UN tool a réussi (`plannedToolSatisfied`) — sinon
  la boucle reforcerait un tool à chaque itération.

## Modèles et coûts (llm.ts)

- `MODEL` (Sonnet, narration), `PLANNER_MODEL` (Haiku), `COMPRESS_MODEL`
  (Haiku) — surchargeables par env. `effortFor()` n'envoie `output_config`
  qu'aux modèles qui le supportent (sinon 400 API) : mettre à jour son regex
  si un nouveau modèle arrive.
- `LLM_MODE` : `mock` ou `live` UNIQUEMENT. Le mock (`createMockLlmMessage`)
  est déterministe et pilote les tools par regex sur le message joueur — les
  tests et le playtest en dépendent ; si on ajoute un tool critique, étendre
  le mock en conséquence.
- L'estimation de coût (lib/anthropic-usage.ts) tarife CHAQUE appel au prix de
  SON modèle. Ne pas réintroduire un tarif unique.

## Garde-fous de la boucle (route.ts)

- `MAX_TOOL_ITERATIONS` borne la boucle ; `HIDDEN_FROM_LLM` cache les tools de
  synchro interne ; `selectToolsForPhase` filtre combat/exploration (calculé
  une fois par requête pour ne pas invalider le cache en cours de boucle).
- « Une action de jeu majeure par message » (`PRIMARY_ACTION_TOOLS`) ne
  s'applique qu'en EXPLORATION — en combat c'est le moteur qui borne tout.
