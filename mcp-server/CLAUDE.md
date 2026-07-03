# mcp-server/ — moteur de jeu déterministe (MCP stdio)

Process enfant Node spawné par lib/mcp-client.ts : **un process par sessionId,
une aventure par process**. Toute la mécanique D&D (jets, portée, occupation
des cases, économie d'action, initiative, fin de combat) est validée ICI —
jamais côté LLM ni côté route.

## Règles absolues

1. **stdout = protocole MCP.** Jamais de `console.log` ; diagnostics via
   `process.stderr.write` uniquement. Un log sur stdout casse la connexion.
2. **Compilation séparée** : `mcp-server/tsconfig.json` compile vers
   `mcp-server/dist/` (le client lance `dist/mcp-server/index.js`). Après tout
   changement ici ou dans un fichier partagé importé (`lib/types.ts`,
   `lib/adventure-map.ts`, `lib/player-template.ts`, `adventures/*/map.ts`) :
   `npm run build:mcp`, sinon les tests/le dev tournent sur l'ancien binaire.
   Un nouveau fichier partagé doit être ajouté au `include` de ce tsconfig.
3. **Frontière moteur/app** : ne JAMAIS importer `adventures/<id>/definition.ts`
   ni quoi que ce soit d'app-only (next, server-logger…). Le moteur ne voit que
   `map.ts` + `lib/adventure-map.ts` + `lib/types.ts` + `lib/player-template.ts`.
   Un champ nécessaire au moteur va dans `AdventureMapData`, pas dans la
   définition.
4. **Aventure figée au spawn** (`adventure.ts`) : `ACTIVE_ADVENTURE_ID` est lu
   UNE fois depuis `process.env.ADVENTURE_ID`. Ne jamais permettre d'en changer
   pendant la vie du process — changer d'aventure = nouvelle session.

## État (game-state.ts)

- `state` est un singleton de module (un process = une partie). L'état
  round-trip par `replace_game_state` : **tout nouveau champ de `GameState`
  doit survivre à `replaceState`** (l'y ajouter explicitement, comme
  `adventureId`, `npcs`, `encountersTriggered`) sinon il sera perdu au premier
  tour suivant.
- Les mutations passent par les fonctions exportées (updateMonsterHP,
  advanceTurn…) qui maintiennent les invariants (HP bornés, `isAlive`,
  conditions unconscious/death saves, salle courante déduite de la position).

## Tools (tools/*.ts)

- Chaque tool valide AVANT de muter : tour courant en combat, entité vivante,
  portée, budget de déplacement, action déjà consommée. Erreur = résultat
  `isError` JSON, jamais un throw non contrôlé.
- Le bestiaire `MONSTER_TEMPLATES` (phase-tools.ts) est COMMUN à tous les
  modules — un module reskinne par `name`/`hpOverride` dans ses encounters,
  on n'ajoute pas de template par module.
- Dés : `AI_DM_TEST_DICE_SEQUENCE` (env) rend les jets déterministes pour les
  tests — la respecter dans tout nouveau code de jet (passer par dice.ts).
