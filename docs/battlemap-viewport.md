# Battlemap : viewport scrollable et résolution par map

> **Statut : IMPLÉMENTÉ** (branche `feat/battlemap-scrollable-viewport`).
> Maintenir ce fichier dans le même commit que toute évolution ultérieure du
> viewport. Le composant est `components/Battlemap.tsx` ; le champ de données
> `AdventureMapSpec.cellSize` vit dans `lib/adventure-map.ts`.

## Objectif

Permettre des battlemaps **plus grandes que l'espace alloué** au composant :

- Chaque map configure sa grille (`cols × rows`, déjà le cas) **et** sa taille
  de case en pixels (`cellSize`, nouveau, optionnel).
- Si la map tient dans le conteneur → elle s'étend pour le remplir (comme
  aujourd'hui, mais en **cases carrées centrées**, sans déformer l'image).
- Si la map déborde → elle devient **scrollable par cliquer-glisser** (pan),
  avec recadrage automatique sur le pion joueur quand il sort du champ.

## Décisions actées (avec le mainteneur, 2026-07-05)

1. **`cellSize` par map dans `map.ts`** — champ optionnel sur
   `AdventureMapSpec`, à côté de `grid`. Cohérent avec « la grille de chaque
   map vient de map.ts, source de vérité unique ». Défaut : 48 px.
2. **Cases carrées + letterbox** — `cell = max(cellSize, min(w/cols, h/rows))`.
   L'image garde son ratio (les PNG sont déjà contraints par test à des cases
   carrées) ; la map est centrée sur l'axe qui ne remplit pas le conteneur.
   Un seul modèle de géométrie pour les deux modes (fit et scroll).
3. **Auto-follow « si hors champ »** — au chargement, au changement de map et
   après un déplacement, on recadre (en douceur) uniquement si le pion joueur
   sort du viewport ; un pan manuel n'est jamais écrasé tant que le pion reste
   visible. Jamais de recadrage pendant un drag en cours.
4. **Pan au drag souris uniquement** — Pointer Events avec seuil de ~5 px pour
   distinguer un clic (tooltip/fiche) d'un pan. Pas de zoom, pas de gestion
   molette. (Les Pointer Events couvrent le tactile par effet de bord avec
   `touch-action: none` — acceptable, mais hors périmètre testé.)

## Non-objectifs

- **Aucun impact moteur** : les bornes de déplacement dérivent toujours de
  `grid.cols/rows` seulement (`mcp-server/rules.ts`). `cellSize` est purement
  du rendu. (Le champ vit quand même dans `lib/adventure-map.ts` car c'est là
  que `AdventureMapSpec` est défini — champ optionnel, inoffensif pour le
  dist mcp-server.)
- Pas de zoom utilisateur, pas de minimap, pas de fog of war.
- Pas de régénération des images existantes : `backgroundSize: 100% 100%`
  reste correct quelle que soit la taille de case rendue. Pour une future
  grande map, générer le PNG à ≥ `cellSize` px par case pour éviter le flou.

---

## Étape 0 — Corriger le bug d'image codée en dur (commit séparé, préalable)

**Bug existant** : `components/Battlemap.tsx` déclare et reçoit la prop
`image` (passée par `app/game/page.tsx` depuis
`adventure.battlemapImages?.[mapId] ?? adventure.battlemapImage`) mais ne
l'utilise **jamais** : le style code en dur
`backgroundImage: 'url(/battlemaps/grammys_bakery.png)'`. Conséquences :
Tide Crypt et Fey Shadow Fair affichent la boulangerie de Grammy, et le
multi-map ne change jamais d'image. C'est aussi une fuite inter-modules que
`tests/no-module-leaks.test.cjs` ne voit pas (son motif `/\bgrammy'?s?\b/i`
ne matche pas `grammys_bakery` : pas de frontière de mot avant `_`).

1. Dans `Battlemap.tsx`, remplacer l'URL en dur par
   `backgroundImage: \`url(${image})\``.
2. Durcir le test anti-fuite : ajouter `/grammys_bakery/` (et par prudence
   `/battlemaps\/grammys/`) aux motifs interdits de
   `tests/no-module-leaks.test.cjs`.
3. Valider : `npm run typecheck && npm test`, puis vérifier en dev que
   Tide Crypt / la Foire affichent bien LEURS images et que la transition
   fair → wood change l'image.

## Étape 1 — `cellSize` dans les données de map

Fichier : `lib/adventure-map.ts`.

```ts
export interface AdventureMapSpec {
  id: string
  name: string
  grid: { cols: number; rows: number }
  // Taille de case MINIMALE en px (rendu uniquement, jamais lu par le moteur).
  // Si la map tient dans le conteneur, les cases s'agrandissent pour le
  // remplir ; sinon elles restent à cellSize et la map devient scrollable.
  // Absent = DEFAULT_CELL_SIZE (48).
  cellSize?: number
}
```

- Ne PAS toucher aux signatures existantes (`getMapSpec`, `gridForMap`…) : le
  composant lira `spec.cellSize` directement.
- Les trois modules existants (`grammys` 17×15, `tide-crypt` 17×15,
  `fey-shadow-fair` 17×15 + 15×13) **n'ajoutent pas** le champ : absent =
  défaut = aucun changement visuel pour l'existant.

## Étape 2 — Géométrie du composant (cases carrées, deux modes)

Fichier : `components/Battlemap.tsx`. Remplacer la géométrie actuelle
(`cellW = w/cols`, `cellH = h/rows`, cases rectangulaires) par :

```ts
// gridCols/gridRows : inchangés (max de la grille et des entités hors bornes +2).
const minCell = cellSize            // prop, défaut 48 — nouvelle sémantique : MINIMUM
const fitCell = dims ? Math.min(dims.w / gridCols, dims.h / gridRows) : minCell
const cell = Math.max(minCell, fitCell)   // carré, un seul nombre
const mapW = gridCols * cell
const mapH = gridRows * cell
```

Décalage de la surface par axe (`x` montré, `y` symétrique) :

```ts
// pan : état { x, y } (px, ≤ 0), pertinent seulement en débordement.
const offsetX = !dims ? 0
  : mapW <= dims.w ? (dims.w - mapW) / 2                       // letterbox centré
  : clamp(pan.x, dims.w - mapW, 0)                             // scroll clampé
```

Structure DOM :

- Le conteneur externe (`containerRef`) garde `overflow-hidden` et la mesure
  ResizeObserver (inchangée).
- La surface interne (image + grille SVG + tokens + tooltip) prend
  `width: mapW, height: mapH` et
  `style={{ transform: \`translate(${offsetX}px, ${offsetY}px)\` }}`
  (transform plutôt que left/top : pas de reflow pendant le drag).
- Grille SVG : le `pattern` passe à `width={cell} height={cell}` (un seul
  nombre). Tokens : passer `cellW={cell} cellH={cell}` — ne pas réécrire les
  sous-composants `Token*`, leur API à deux axes reste valable.
- **Clamper `pan` à l'usage** (comme ci-dessus), pas dans un effet : un
  redimensionnement du conteneur ou un changement de map re-clampe alors
  gratuitement, sans setState en cascade.

**Piège tooltip** : `handleTokenClick` calcule les coordonnées relativement à
`containerRef.getBoundingClientRect()`, mais le tooltip est rendu DANS la
surface désormais translatée → décalage. Correction : ajouter un
`surfaceRef` sur la div interne et calculer
`x: e.clientX - surfaceRect.left, y: e.clientY - surfaceRect.top`. Le tooltip
reste dans la surface (il suit la map pendant un pan, c'est le comportement
voulu — il est ancré à l'entité cliquée).

## Étape 3 — Pan par cliquer-glisser (Pointer Events)

Toujours `Battlemap.tsx` :

- État/refs : `pan` (state `{x, y}`), `isDragging` (state, pour le curseur et
  la désactivation des transitions), `dragRef` (ref
  `{ startX, startY, panX, panY, moved } | null`), `suppressClickRef` (ref
  booléenne).
- Sur le conteneur externe :
  - `onPointerDown` (bouton 0 uniquement) : initialiser `dragRef`,
    `e.currentTarget.setPointerCapture(e.pointerId)`.
  - `onPointerMove` : si `dragRef` actif et distance depuis le départ > 5 px,
    marquer `moved = true`, passer `isDragging` à true et
    `setPan({ x: panX + dx, y: panY + dy })` (le clamp est fait au rendu).
  - `onPointerUp` / `onPointerCancel` : si `moved`, armer
    `suppressClickRef.current = true` ; réinitialiser `dragRef`, `isDragging`.
  - `style={{ touchAction: 'none' }}` (sinon pointermove tactile est mangé
    par le scroll natif) et curseur `grab`/`grabbing` **seulement si**
    `mapW > dims.w || mapH > dims.h` (sinon `cursor-default` actuel).
- **Suppression du clic post-drag** : au début de `handleTokenClick`, de
  `handleOpenSheet` et du `onClick` du conteneur (fermeture du tooltip) :
  `if (suppressClickRef.current) { suppressClickRef.current = false; return }`.
  Le clic natif est émis après pointerup même en cas de drag — sans cette
  garde, chaque pan ferme le tooltip ou ouvre une fiche. (Le pointerdown sur
  un token bulle jusqu'au conteneur : on peut donc démarrer un pan depuis un
  token, c'est voulu.)

## Étape 4 — Auto-follow du pion joueur

Toujours `Battlemap.tsx` :

```ts
useEffect(() => {
  if (!dims || dragRef.current) return          // jamais pendant un drag
  if (mapW <= dims.w && mapH <= dims.h) return  // mode fit : rien à suivre
  const px = (gameState.player.position.x + 0.5) * cell
  const py = (gameState.player.position.y + 0.5) * cell
  // Marge d'une case : on recadre dès que le pion APPROCHE du bord visible.
  const outX = px < -offsetX + cell || px > -offsetX + dims.w - cell
  const outY = py < -offsetY + cell || py > -offsetY + dims.h - cell
  if (outX || outY) {
    setPan({ x: dims.w / 2 - px, y: dims.h / 2 - py })  // centre (clamp au rendu)
  }
}, [gameState.player.position.x, gameState.player.position.y, cols, rows, image, dims])
```

- Les dépendances `cols, rows, image` couvrent le **changement de map**
  (multi-map) : nouvelle grille/image → l'effet recadre sur la cellule
  d'arrivée. Prévoir aussi une remise à zéro de `pan` quand `image` change
  (la valeur précédente n'a plus de sens sur une autre grille).
- Transition douce : sur la surface,
  `transition: isDragging ? undefined : 'transform 0.3s ease'`. Pendant un
  drag la transition est coupée (sinon le pan « flotte » derrière le curseur) ;
  le recadrage auto et le relâchement profitent de l'animation.
- Ne pas mettre `pan`/`offsetX` dans les dépendances (boucle) — lire les
  valeurs via une ref si le lint l'exige, ou étendre le disable-line existant
  du fichier (il y a un précédent ligne ~106).

## Étape 5 — Câblage page de jeu

Fichier : `app/game/page.tsx` (~ligne 799) :

```tsx
<Battlemap
  gameState={gameState}
  cellSize={currentMapSpec.cellSize}   // remplace le 52 en dur ; undefined = défaut 48
  image={currentBattlemapImage}
  cols={currentMapSpec.grid.cols}
  rows={currentMapSpec.grid.rows}
/>
```

La sémantique de la prop `cellSize` change (taille fixe pré-mesure → taille
**minimale**) : mettre à jour le commentaire d'interface dans `BattlemapProps`.

## Étape 6 — Tests, docs, validation

1. **tests/adventure-modules.test.cjs** : dans la boucle sur `map.maps`,
   ajouter : si `spec.cellSize` est présent, c'est un nombre fini > 0
   (raisonnablement : entier entre 16 et 256). Ne pas l'exiger — optionnel.
2. **Docs multi-map (même commit — exigé par AGENTS.md)** :
   `docs/multi-map-adventures.md` et `docs/creating-multi-map-modules.md`
   mentionnent le champ optionnel `cellSize` par map et sa sémantique
   (minimum de rendu, jamais lu par le moteur).
3. **Validation** :
   - `npm run typecheck && npm test` (le composant React n'a pas de test
     unitaire — l'infra `node --test` ne rend pas de composants).
   - Vérification manuelle en dev (`LLM_MODE=mock`) :
     a) les trois modules affichent leur propre image (étape 0) ;
     b) fenêtre large : map centrée, cases carrées, letterbox visible ;
     c) forcer temporairement `cellSize: 96` sur une map → débordement,
        curseur grab, pan clampé aux bords, clic sur token toujours
        fonctionnel après un pan, tooltip bien positionné ;
     d) déplacer le pion vers un bord → recadrage animé uniquement quand il
        approche du bord visible ;
     e) transition fair → wood (Foire) : image ET grille changent, vue
        recadrée sur la cellule d'arrivée.
   - `npm run playtest:mock` non requis : aucun prompt ni contenu d'aventure
     ne change (comparer les nombres, pas l'exit code, si lancé quand même).

## Ordre des commits suggéré

1. Étape 0 seule (fix bug image + durcissement no-module-leaks).
2. Étapes 1–5 + tests + docs (étape 6) en un commit cohérent.
