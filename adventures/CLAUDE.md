# adventures/ — contenu des modules d'aventure

Tous les PNJ déclarés doivent avoir un `statBlock` du catalogue SRD 2014
(ou un `kind` déjà identique à un type du catalogue). `seedAdventureNpcs`
initialise leur fiche sourcée et leurs PV dans la partie, sans combat implicite.
Un pion collectif doit déclarer `group: { name, members: [{ id, name }] }` :
profil maison à PV cumulés, effectif décroissant et attaques proportionnelles,
sans soins ni PV temporaires. Ne pas transformer une perte d’effectif en mort
d’un personnage nommé choisi arbitrairement. `initialHp` permet une blessure
initiale explicitement sourcée, sans changer les PV maximaux du profil.
Catalogue courant : [fiches des PNJ](../docs/npc-stat-blocks.md).

Tout ce qui est PROPRE à un module vit ici. `lib/`, `components/`, `app/` et
`mcp-server/` restent génériques — verrouillé par tests/no-module-leaks.test.cjs
(grep anti-fuite sur le vocabulaire Grammy). Référence de conception :
docs/multi-adventure-architecture.md et docs/adventure-content-consolidation.md
(les deux refactors sont TERMINÉS).

## Anatomie d'un module `adventures/<id>/`

| Fichier | Rôle | Consommé par |
|---|---|---|
| `map.ts` | Données MOTEUR : rooms, entryCells, encounters, npcs, aliases, transitions, roomHooks, startCell, `partitions?` (cloisons), `initialPlayer` (= `{ level, extraInventory? }` : le kit/PV viennent du PERSONNAGE) | moteur MCP **et** app (seul fichier compilé par mcp-server) |
| `definition.ts` | Contenu APP : meta landing, welcomeMessage, chatPlaceholders, roomStatusHints, battlemapImage, grid, `promptGuidance`, `characterHooks` (accroche par personnage) | app/prompts uniquement — **jamais importé par mcp-server** |
| `token-images.ts` | FACULTATIF — correspondances visuelles explicites des IDs PNJ/identités de combat et types de créatures, exposées par `definition.tokenImages` ; crédits dans la galerie locale | app uniquement ; aucun effet mécanique ni import du dossier narratif privé |
| `adventure-module.md` | Module narratif complet (salles `## Salle N`, annexes) → prompt DM | context-loader |
| `player-rules.md` | FACULTATIF — spécificités joueur de la campagne, ajoutées après `adventures/_shared/player-rules.md` | context-loader |
| `bestiary.md` | REQUIS — bestiaire & notes de maîtrise du module : blocs de stats reskinnés (types moteur), calibrage au niveau, mise en scène | context-loader |
| `npc-lore.json` | FACULTATIF — dossiers narratifs sourcés, raccords explicites aux IDs PNJ/types de rencontres ; fichiers générés par l’import de contenu | context-loader côté serveur uniquement, après sélection des acteurs locaux ; jamais importé dans `map.ts`, `social.ts` ou le client |

- Les socles génériques MJ et joueur vivent dans `adventures/_shared/dm-rules.md`
  et `adventures/_shared/player-rules.md` ; les deux sont obligatoires et sans
  vocabulaire de campagne. Le chargement assemble le socle joueur puis le
  `player-rules.md` facultatif de la campagne ; sans complément, le socle suffit.
- `bestiary.md` et `adventure-module.md` restent obligatoires par module connu,
  sans repli silencieux. Un identifiant inconnu utilise le module par défaut,
  y compris pour son éventuel complément joueur.

- Le socle de règles suit D&D 5e 2014. Ne pas recopier les livres ni un profil
  fixe de guerrier dans les règles joueur : la fiche du personnage fait foi.
  Les livres fournis vivent dans `rules/books/`, consultés explicitement par
  l'IA via `consult_rules` (voir docs/rules-library.md). Leur lecture ne résout
  aucune mécanique et n'active aucune règle optionnelle.

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
statique du DM. `actionExamples` contient les exemples de choix d’outils du MJ ;
aucun classifieur séparé ne les consomme. Les modifier pour Grammy's change
le prompt byte-à-byte : cache Anthropic invalidé + playtest non comparable.
Ne les retoucher qu'avec `npm run playtest:mock` avant/après.

## Ajouter un module

1. Créer `adventures/<id>/` : `map.ts` (format des modules existants),
   `definition.ts`, `adventure-module.md` et `bestiary.md` (plus un `player-rules.md` seulement si nécessaire)
   (tous REQUIS — partir de ceux d'un module existant). (Pas de
   player-character.md : la fiche du personnage est globale,
   `characters/<id>/`. Pas de dm-rules.md : partagé dans `_shared/`.)
   Optionnel : `definition.characterHooks` pour lier un personnage à l'aventure.
2. Battlemap dans `public/battlemaps/` + entrée `battlemapImage`.
3. Enregistrer : import dans `lib/adventure-map.ts` (ADVENTURE_MAPS) et
   `lib/adventures.ts` (ADVENTURES + AVAILABILITY).
4. `npm run build:mcp` (les map.ts sont compilés par le moteur), puis
   `npm test` : tests/adventure-modules.test.cjs boucle automatiquement sur
   tout le registre (bornes, entrées, encounters, PNJ, hooks, parsing du .md,
   dimensions de la battlemap). Ne pas affaiblir un invariant pour faire
   passer un module — corriger la donnée.
5. Bestiaire : types partagés de `lib/srd/monsters.ts`, issus du snapshot
   `lib/srd/monsters.json` de l'API SRD 2014. Déclarer les rôles/notes dans
   `bestiary.json`, puis `node scripts/sync-srd-bestiaries.cjs --write` génère
   `bestiary.md` ; `--check` vérifie la dérive hors ligne. Ne pas modifier les
   blocs générés ni recréer un template par campagne. Pour ajouter une espèce,
   choisir l'action de base dans le script puis `--fetch --write` (maintenance
   réseau explicite, jamais en partie). Aucun `hpOverride` dans les rencontres
   autorées fidèles ; les reskins sont des apparences, pas des statistiques.
6. Module payant (optionnel) : deux entrées dans lib/adventures.ts
   (`REQUIRES_ENTITLEMENT` + `MODULE_PRICE_CENTS`) — guide complet :
   docs/monetizing-a-module.md.

## Cloisons de salles (`map.ts.partitions`)

La carte de la scène (lib/dm/scene-map.ts) affiche, pour chaque salle, ses
voisines en distinguant « communique avec » (accessible directement) et
« contiguë mais cloisonnée » (voisine sur la grille, séparée par un mur). Le
moteur déduit la salle courante de la POSITION du joueur (emprise exacte de la
salle via `roomContainsCell`). Pour une map sans géométrie importée, la
circulation repose sur les cloisons, les seuils et les pièces `enclosed` autorés ;
la contiguïté seule n'est donc pas une garantie de passage. Pour une map avec
géométrie approuvée, le JSON fait autorité, sans murs supplémentaires déduits
des boîtes de salles. Les anciennes tables regex de navigation ont été retirées.

Statut : **implémenté pour Grammy's uniquement** (`partitions` = `{3,8}`,
`{5,7}`, `{5,9}`). Les autres modules n'ont pas encore de `partitions` (champ
optionnel ⇒ toutes leurs contiguïtés sont présentées comme communicantes).
Pour cloisonner un module :

1. Lister ses **contiguïtés candidates** : deux zones qui se touchent (bord
   commun, pas un simple coin) à vérifier dans le contenu du module. Le repérage se fait
   à la main depuis les `zone` de `map.ts`, ou par un script ad hoc calquant
   `zonesTouch` (cf. l'historique de la branche `feat/scene-map-passage-graph`).
2. Pour CHAQUE candidate, trancher via la table « Points d'entrée et de
   déplacement » du `adventure-module.md` + la prose des salles : y a-t-il un
   passage direct, oui ou non ? En cas de doute, **demander** — ne pas deviner.
   (Extérieur vs intérieur, deux pièces rejointes séparément = souvent une
   cloison.)
3. Déclarer les paires NON communicantes dans `partitions: [['a','b'], …]`
   (ordre indifférent, relation symétrique), avec un commentaire justifiant
   chaque cloison.
4. `npm run build:mcp` + `npm test` : `adventure-modules.test.cjs` vérifie que
   chaque paire vise des salles réelles, de la même map, réellement contiguës
   (une cloison entre salles non contiguës = donnée morte, échec du test).
   Verrou de rendu : `dm-scene-map.test.cjs`.

## Modules multi-maps (docs/multi-map-adventures.md)

Les portes physiques optionnelles (`map.ts.doors`) portent un seuil par côté,
dans la salle correspondante, sur une même map. Elles distinguent approche,
interaction à portée et franchissement explicite ; voir la section « Seuils de
portes » de docs/multi-map-adventures.md. Les anciennes tables
regex de navigation ont été retirées ; l'IA lit la carte dynamique. Tout nouveau
seuil doit passer les invariants de `tests/adventure-modules.test.cjs`.

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

## Illustration d’exploration

Grammy’s déclare `definition.ts.scenes.bakery` avec la vue aérienne sans toit
`public/adventures/grammys-country-apple-pie/bakery-aerial.png`. Ses repères et
leur légende sont filtrés par `roomIds` sur la salle courante : objets locaux
et accès proches uniquement, sans révéler les cachettes ni les PNJ cachés.
Les clics envoient une intention au MJ ; les portes et déplacements restent
validés par le moteur. La map est mixte : `explorationRoomIds: ['1','2','3']`
pour les extérieurs ; les salles 4, 5, 7, 8 et 9, quai compris, sont tactiques.
La scène porte `navigationMode: 'exploration'` : elle laisse place à la
battlemap tactique dès l’entrée dans le bâtiment, même hors combat. Ressortir
rétablit l’illustration. En combat, la battlemap tactique et sa géométrie
approuvée restent utilisées, dehors comme dedans. Les ancrages de l’illustration sont des
pourcentages visuels, indépendants des coordonnées mécaniques de la grille.

Le brouillard de Grammy’s cible les intérieurs (`fogHiddenRoomIds`,
`fogReveal: 'open-door'`) : approche d’une porte ouverte ou ouverture à portée
révèle l’autre pièce, sans la visiter ni révéler ses PNJ. Les vues restent
mémorisées dans `sceneMemory.discoveredRoomIds`. La scène extérieure porte
des `fogRegions` dessinées sur l’illustration, pour cacher ces mêmes pièces.
Les repères de navigation déclarent `destinationRoomId` et passent par le
filtre commun `explorationDestinationRooms` (comme les boutons de battlemap).

## Geometrie et PNJ reactifs

Voir docs/navigation-and-battlemaps.md. Les JSON de geometrie sont prepares par
l'assistant depuis l'image fournie dans la conversation, sans integration vision.
`geometry.json` indexe les versions approuvees par mapId ; un brouillon avec
incertitudes/contradictions reste hors du registre actif. Le script local
battlemap-geometry.cjs permet import, superposition editable, correction,
approbation et ASCII derive du meme JSON. Les empreintes image/metadonnees
detectent l'obsolescence. Une image modifiee exige une nouvelle revue.

`partitions`, `doors` et `rooms[].enclosed` sont le repli auteur explicite pour
les maps sans geometrie approuvee, affiche `legacy_unverified`. Les cloisons sont
maintenant mecaniques, pas seulement du texte dans le prompt. Une salle peut
porter `navigationEvent` pour imposer une decision avant son entree.

Une salle non rectangulaire declare `areas`, union de rectangles dans sa boite
`zone`. Utiliser `roomContainsCell` pour tester son emprise exacte ; ne pas
reintroduire un test de boite englobante qui avalerait une salle voisine.
La boulangerie utilise la reference utilisateur `bakery.geometry.source.json`,
reconciliee et activee dans `geometry.json` (61 frontieres). Le quai est ferme
cote exterieur dans cette reference : ne pas inventer de porte laterale.

Les objectifs de réaction et capacites PNJ vivent dans `npcs[].reactive` :
objectives, capabilities, speed (pieds), triggers, combatTemplate optionnel.
N'ajouter aucun objectif propre au module dans les couches generiques.

Une rencontre peut déclarer `noiseAmbush: { perceptionDc, dexterityDc }` pour
rester dans sa salle au lieu d'enquêter sur le bruit. Le MJ choisit explicitement
`react_to_noise(response="ambush")`, la porte côté source et les déplacements
intérieurs en laissant le seuil libre. Au franchissement effectif, le moteur
s'arrête au seuil ; le MJ appelle `start_encounter` avec les arguments `ambush`
(porte, attaquant, arme, méfiance). Perception puis sauvegarde DEX permettent
d'éviter une seule frappe ; aucune frappe à l'ouverture ou par l'autre porte.
Grammy's l'utilise pour Grukk et ses gardes, DD 13 pour les deux jets. Voir
docs/navigation-and-battlemaps.md et tests/grammy-ambush.test.cjs.

## Profils sociaux

Chaque module référence `social.ts` depuis `map.ts.social` : buts, sujets
appréciés, sujets sensibles et verrou `influenceable`. Les profils restent
confidentiels et locaux ; ils décrivent le personnage sans score relationnel.
Les buts sociaux complètent les objectifs de réaction sans ajouter de capacité.
Le modèle choisit explicitement la cible et son attitude friendly/indifferent/
hostile via `begin_social_interaction`, consigne les contributions avec
`record_social_conversation`, puis résout la demande et son risque réel via
`resolve_social_request` selon la table DMG 2014. Aucun gain automatique,
bonus de qualité littéraire, quête ou changement de disposition n'en découle.
Voir `docs/social-interactions.md` pour la procédure et la persistance.

`personality` fixe idéaux/attaches/traits. `randomize` référence, champ par champ,
les tables maison `social.tables` pour idéaux, attaches, traits, goûts et tabous.
Les buts sont ordonnés par priorité et ne sont jamais tirés. Le moteur crée une
graine par nouvelle partie et conserve les profils dans `socialPersonalities` ;
ne jamais relancer une personnalité au chargement ou à l’entrée en combat.

Un `encounters[].socialProfile` peut surcharger le profil d’espèce pour un rôle
propre à une scène. Il suit l’identité canonique avant et pendant le combat.
`randomizeMode: 'append'` ajoute des détails secondaires aux traits/idéaux/
attaches/goûts/tabous fixes ; ne pas effacer les contraintes scénarisées en
tirant une personnalité. Exemple : les six rencontres du Bois-Ricanant.


### Grammy : deux vues et passage aller-retour

Grammy conserve une carte mécanique `bakery` et deux visuels :
`public/adventures/grammys-country-apple-pie/bakery-exterior.png` pour
l’exploration des salles 1–3 et `public/battlemaps/grammys-interior-topdown.png`
pour la tactique intérieure (également utilisée en combat extérieur).
La porte `front` commande le franchissement ; revenir dehors rétablit
l’illustration. Aucun `travel_to_map` ni abandon de carte n’est nécessaire.
Le toit de la vue extérieure masque les pièces : pas de polygones de
brouillard hérités de l’ancienne illustration sans toit. Les repères restent
des intentions envoyées au MJ. Les coordonnées et la géométrie du plan
précédent sont conservées ; le nouveau plan tactique a été généré depuis
cette référence et revu pour conserver les seuils et les emprises.

Le cadrage `tacticalViews` de Grammy zoome sur x3–13, y4–12, hors combat
comme en combat intérieur. Les coordonnées restent globales ; une poursuite
avec un combattant hors cadre rétablit la carte complète.

La vue intérieure utilise `grammys-interior-rooms-hd.png`, image locale de
1386×1134 correspondant exactement au viewport de 11×9 cases. Le fond de
Battlemap remplit ce viewport ; il ne faut pas lui passer l’image complète
de 17×15 cases pour cette vue.

Le fond extérieur de la vue intérieure est illustré et flouté ; les pièces
restent nettes. La résolution du PNG est indépendante des coordonnées
mécaniques : 126 pixels par case pour le viewport 11×9.


## Objectifs proposés par les PNJ

Le journal de quêtes est générique et réutilisable : voir
`docs/objective-journal.md`. Pour exposer un objectif autoré uniquement après
une conversation, ajouter `dialogue: { npcIds: [...], label: 'libellé public' }`
à l’objectif de `mapQuests` dans ce module. Conserver ses conditions internes
et sa qualification `required`. Les sources doivent être des PNJ existants.
Les quêtes inventées optionnelles sont disponibles dans tous les modules,
sans métadonnées supplémentaires, avec les seules conditions moteur prises
en charge. Ne pas coder de logique ou de noms de module dans le moteur partagé.
Les textes du module doivent respecter le mutisme et les secrets de chaque
PNJ ; une proposition ne vaut ni acceptation du joueur ni récompense.
