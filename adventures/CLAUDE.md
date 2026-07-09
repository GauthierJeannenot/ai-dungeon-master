# adventures/ — contenu des modules d'aventure

Tout ce qui est PROPRE à un module vit ici. `lib/`, `components/`, `app/` et
`mcp-server/` restent génériques — verrouillé par tests/no-module-leaks.test.cjs
(grep anti-fuite sur le vocabulaire Grammy). Référence de conception :
docs/multi-adventure-architecture.md et docs/adventure-content-consolidation.md
(les deux refactors sont TERMINÉS).

## Anatomie d'un module `adventures/<id>/`

| Fichier | Rôle | Consommé par |
|---|---|---|
| `map.ts` | Données MOTEUR : rooms, entryCells, encounters, npcs, aliases, transitions, roomHooks, startCell, `initialPlayer` (= `{ level, extraInventory? }` : le kit/PV viennent du PERSONNAGE) | moteur MCP **et** app (seul fichier compilé par mcp-server) |
| `definition.ts` | Contenu APP : meta landing, welcomeMessage, chatPlaceholders, roomStatusHints, battlemapImage, grid, `promptGuidance`, `characterHooks` (accroche par personnage) | app/prompts uniquement — **jamais importé par mcp-server** |
| `adventure-module.md` | Module narratif complet (salles `## Salle N`, annexes) → prompt DM | context-loader |
| `player-rules.md` / `dm-rules.md` | Optionnels — repli sur `adventures/_shared/` (règles D&D génériques, repli VOULU) | context-loader |

- `adventures/_shared/` n'est PAS un module : ce sont les règles D&D de repli
  (player-rules.md, dm-rules.md générique avec bestiaire des types moteur)
  servies à tout module qui ne redéfinit pas les siennes. AUCUN vocabulaire de
  module là-dedans (verrouillé par no-module-leaks) — les reskins et notes de
  mise en scène vont dans le `dm-rules.md` du module (modèle : tide-crypt).

- La fiche du héros N'EST PLUS par module : elle vit dans
  `characters/<id>/character-sheet.md` (catalogue GLOBAL, orthogonal aux
  aventures — voir docs/playable-characters.md). L'accroche narrative propre au
  couple aventure×personnage vit dans `definition.ts` (`characterHooks`).
- `adventure-module.md` est PAR MODULE : un module connu sans son propre fichier
  = erreur, jamais de repli silencieux sur le contenu d'une autre aventure.
- Le parsing du module exige les en-têtes `## Salle N` (context-loader) : la
  table « Points d'entrée et de déplacement » et les annexes vivent dans
  l'index statique, le détail de la salle courante est injecté dynamiquement.
- `definition.ts` est importé par des composants client : n'y importer ni
  `fs`, ni server-logger, ni quoi que ce soit de serveur.

## promptGuidance — la partie sensible

Les chaînes de `promptGuidance` sont injectées TELLES QUELLES dans le prompt
statique du DM et le system du classifieur. Les modifier pour Grammy's change
le prompt byte-à-byte : cache Anthropic invalidé + playtest non comparable.
Ne les retoucher qu'avec `npm run playtest:mock` avant/après.

## Ajouter un module

1. Créer `adventures/<id>/` : `map.ts` (format des modules existants),
   `definition.ts`, `adventure-module.md`. (Pas de player-character.md : la
   fiche du personnage est globale, `characters/<id>/`.) Optionnel :
   `definition.characterHooks` pour lier un personnage à l'aventure.
2. Battlemap dans `public/battlemaps/` + entrée `battlemapImage`.
3. Enregistrer : import dans `lib/adventure-map.ts` (ADVENTURE_MAPS) et
   `lib/adventures.ts` (ADVENTURES + AVAILABILITY).
4. `npm run build:mcp` (les map.ts sont compilés par le moteur), puis
   `npm test` : tests/adventure-modules.test.cjs boucle automatiquement sur
   tout le registre (bornes, entrées, encounters, PNJ, hooks, parsing du .md,
   dimensions de la battlemap). Ne pas affaiblir un invariant pour faire
   passer un module — corriger la donnée.
5. Bestiaire : uniquement des types existants de `MONSTER_TEMPLATES`
   (reskin par `name`/`hpOverride`), pas de nouveau template par module.
6. Module payant (optionnel) : deux entrées dans lib/adventures.ts
   (`REQUIRES_ENTITLEMENT` + `MODULE_PRICE_CENTS`) — guide complet :
   docs/monetizing-a-module.md.

## Modules multi-maps (docs/multi-map-adventures.md)

Guide pas-à-pas pour en créer un : docs/creating-multi-map-modules.md.

- `map.ts` déclare `maps` (grille PAR map), `mapQuests` (objectifs vérifiables
  par le moteur : requis = sortie possible, tous = complétion totale) et
  `mapTransitions` (SENS UNIQUE, cellule/salle d'arrivée, `companions`).
- roomId en numérotation GLOBALE continue (map 2 commence après la dernière
  salle de la map 1) ; chaque salle porte son `mapId` (absent = première map).
- `adventure-module.md` : sections `# Carte <mapId> — Titre` ; le préambule
  avant la première `# Carte` reste dans le prompt statique, l'intro de chaque
  carte est injectée dynamiquement quand elle devient courante.
- `definition.ts` : `battlemapImages` (une image PAR mapId,
  `public/battlemaps/<id>-<mapId>.png`), `battlemapImage` = map de départ.
- Référence : `adventures/fey-shadow-fair/` + tests/mcp-multimap.test.cjs.

## Battlemaps

- Convention : `public/battlemaps/<id>.png` (modules 1-map) ou
  `<id>-<mapId>.png` (multi-maps), PNG réel, dimensions multiples
  exactes de la grille de SA map (cases carrées) — vérifié par test.
- Exception actuelle : Grammy's utilise `grammys_bakery.png`, une image
  fournie à la main (redimensionnée 1360×1200 pour la grille 17×15). Le
  générateur `scripts/generate-battlemap-grammys-country-apple-pie.cjs`
  produit encore l'ancien fichier pixel-art `grammys-country-apple-pie.png`
  que PLUS RIEN ne référence — ne pas « corriger » une image en le relançant
  sans mettre à jour `battlemapImage`.
