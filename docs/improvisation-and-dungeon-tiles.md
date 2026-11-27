# Improvisation du MJ et tuiles au crayon

Le [premier lot d'outils MJ](mcp-toolkit.md) expose maintenant tirage de tables,
PNJ persistants et génération/validation des plans via MCP. Les tables maison
de noms et babioles ajoutées à la demande de l'utilisateur sont marquées par
`source.origin: homebrew` ; leurs usages n'activent aucune mécanique implicite.

## Tables du Guide du maître

Le MJ choisit lui-même de consulter les tables originales du livre local 2014,
via le même outil documentaire `consult_rules` et le même chemin `tool_use`.
Aucun mot-clé du message joueur ne déclenche un tirage ou une consultation.

```json
{ "topic": "npc" }
```

Les thèmes disponibles sont `npc` (chapitre Creating Nonplayer Characters,
antagonistes compris), `adventure` (Creating Adventures) et `dungeon`
(Appendix A: Random Dungeons), soit respectivement 17, 18 et 40 tables dans
la transcription actuelle. Les catalogues listent cinq tables par page ;
continuer avec `resultOffset` égal au `nextResultOffset` retourné. Chaque résultat
donne le titre, les colonnes, `tableId`, le contexte `sectionId` et la provenance
exacte : fichier, SHA-256 et lignes. Les identifiants sont liés à la transcription
du livre ; refaire une recherche après remplacement de la source.

```json
{ "tableId": "<tableId renvoyé par le catalogue>" }
```

La lecture restitue seulement la table Markdown originale, sans réécriture.
Elle reste bornée à 5 000 caractères ; `nextOffset` permet de continuer une table
longue avec `offset`. Pour lire les explications autour d'une table, utiliser
son `sectionId`. Pour trouver directement un titre, la recherche existante
reste disponible, par exemple :

```json
{ "book": "dmg-2014", "query": "NPC Mannerisms" }
```

L'IA peut choisir une entrée ou appeler explicitement `roll_dice` avec la notation
de la table, puis interpréter le résultat. La consultation seule ne consomme aucun
dé, temps ou ressource, ne satisfait pas une mécanique planifiée et ne modifie
aucun état de jeu. Les tables ne remplacent ni les faits établis du module, ni
ses secrets, ni les outils de résolution. Les consignes MJ partagées expliquent
ce flux. Aucun nouveau contenu intégral de livre n'est injecté dans le prompt.

## Jeu de tuiles ImageGen

Les fichiers sont dans `public/dungeon-tiles/`. `graphite-atlas.png` est le résultat
ImageGen intégré, conservé sans modification : une planche 1536×1024 en trois
colonnes et deux lignes. Le prompt exact figure dans `generation-prompt.txt`.
La génération a utilisé l'outil ImageGen intégré, sans appel d'API depuis le jeu.

Six PNG 512×512 sont extraits avec `scripts/prepare-dungeon-tiles.cjs` :

| Identifiant | Dessin | Ouvertures avant rotation |
|---|---|---|
| `dead-end` | Cul-de-sac | Nord |
| `straight` | Couloir droit | Nord, sud |
| `corner` | Angle | Nord, est |
| `tee` | Jonction en T | Nord, est, ouest |
| `cross` | Croisement | Nord, est, sud, ouest |
| `room` | Salle centrale | Nord, est, sud, ouest |

Le manifeste fournit chemins relatifs, dimensions et masques d'ouvertures
(nord=1, est=2, sud=4, ouest=8). Les rotations sont des degrés horaires parmi
0/90/180/270. Le découpage retire la marge blanche générée de 16 pixels sur
chaque bord et remet chaque pièce à 512×512. Le trait au crayon conserve de
légères irrégularités de raccord ; les masques garantissent la topologie, pas
une géométrie de collision déduite de l'image.

```bash
node scripts/prepare-dungeon-tiles.cjs
```

Cette commande locale ne régénère aucune illustration et n'appelle aucun modèle.
Elle reconstruit les six PNG, le manifeste, `example-layout.json` et
`example-dungeon.png` depuis la planche sauvegardée. `sharp` est déjà présent
dans les dépendances de Next, comme pour les autres générateurs de battlemaps.

## Aperçu et assemblage reproductible

Ouvrir `/dungeon-tiles/preview.html` sur le serveur Next. L'atelier autonome
permet de modifier la graine et le nombre de tuiles, de générer un autre plan,
puis d'exporter un PNG ou un JSON. Les six dessins sont aussi affichés séparément.

`public/dungeon-tiles/layout.js` fonctionne dans le navigateur et en CommonJS.
Il génère un graphe connexe, ferme toutes les sorties extérieures et assure des
ouvertures réciproques entre voisins, puis sélectionne les tuiles et rotations
compatibles. La même graine et les mêmes paramètres reproduisent le même plan.
La grille est bornée à 3..12 tuiles par axe, avec au moins cinq tuiles placées.
Deux repères suggèrent entrée et objectif. Ce générateur d'assemblage est une
convention du projet ; il ne prétend pas exécuter l'algorithme de l'annexe A.

L'atelier et ses exports servent à la préparation. `install_dungeon` permet
ensuite d'ajouter une carte jouable à la même partie, avec collision moteur,
rencontres légères et lien obligatoire à la quête principale. La carte d'origine,
l'aventure et le personnage sont conservés ; entrée et retour passent par
`travel_to_map`. Voir [le guide des donjons jouables](playable-random-dungeons.md).

## Vérification

`tests/improvisation-tables.test.cjs` vérifie les trois catalogues, la restitution
exacte de chaque table par pagination, les sélecteurs invalides et l'accès MCP
réel sans mutation ni consommation de dés, en exploration et combat.
`tests/dungeon-tiles.test.cjs` vérifie les six PNG, les rotations, la reproductibilité
et la connectivité sur 80 plans de dimensions variées, y compris une grille pleine.
