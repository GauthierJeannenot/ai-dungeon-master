# lib/dm/ — pipeline du Dungeon Master

Orchestré par app/api/dm/route.ts : anti-abus → débit → session autoritaire →
sync MCP → compression historique (`history.ts`) → classifieur d'intention
(`planner.ts`, Haiku) → boucle agentique tool-use (Sonnet) → persistance.

## Prompt caching Anthropic — l'invariant n°1

`buildSystemBlocks` (prompts.ts) émet DEUX blocs système : le bloc **statique**
(règles + fiche + index du module, `cache_control: ephemeral`) et le bloc
**dynamique** (état, salle courante, directive). Le cache ne fonctionne que si
le préfixe statique est **byte-identique** d'un appel à l'autre :

- ne JAMAIS insérer de contenu variable (timestamp, sessionId, état) dans
  `buildStaticPrompt` — toute variation par requête casse le cache et
  multiplie le coût d'input Sonnet.
- une variante de cache par module d'aventure et par phase (tools filtrés
  exploration/combat) est voulue — ne pas « optimiser ».
- toute reformulation du prompt statique invalide le cache des sessions en
  cours ET fausse les comparaisons playtest : reformuler = commit séparé,
  mesuré par `npm run playtest:mock` avant/après.

## Carte de la scène (scene-map.ts)

`renderSceneMap` génère la carte de la map COURANTE depuis GameState + map.ts,
dans le bloc DYNAMIQUE (`## CARTE DE LA SCÈNE`). Deux niveaux : TOUJOURS les
zones de salles + adjacences précalculées (`zonesTouch`/`directionLabel`),
entrées et positions (joueur, PNJ révélés, monstres vivants) ; en COMBAT
seulement, la grille ASCII tactique en plus (géométrie fine — hors combat elle
coûterait des tokens par appel pour un signal déjà couvert). C'est LA carte de
référence du DM : les `adventure-module.md` n'ont plus de grille écrite à la
main (leur section « Carte des salles » renvoie au bloc dynamique). Ne jamais
déplacer cette carte dans le bloc statique (elle varie à chaque tour = cache
cassé), ni réintroduire une grille figée dans un module .md (elle divergerait
de l'état).

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
