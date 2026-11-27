# Vol horizontal des créatures natives en vol stationnaire

Cette tranche de `MM-MOVEMENT` rend utilisables les vitesses natives des fantômes et feux follets actifs, dont la marche vaut zéro. Elle expose un choix de mode au modèle ; elle ne modélise pas une altitude.

`preview_navigation` et `move_token` acceptent `movementMode: "walk" | "fly"`. L'absence du champ conserve la marche. Pour voler, le modèle doit fournir explicitement `"fly"` à chaque nouvel appel avec la destination qu'il a choisie. Exemple :

```json
{"tokenId":"identifiant-de-la-creature","toCell":{"x":12,"y":8},"movementMode":"fly"}
```

Le moteur vérifie la fiche native immuable : vitesse de marche nulle, vitesse de vol positive et `hover: true`. La vitesse de vol est lue dans cette fiche, jamais accordée depuis des métadonnées modifiables de l'acteur. Les profils actuels concernés sont `ghost` (40 pieds) et `will_o_wisp` (50 pieds). Les résultats exposent `movementMode: "fly"` et `movementScope: "native_hover_horizontal_projection"` pour expliciter la portée de la résolution.

La position demeure une projection horizontale dans le plan de la carte courante. Les limites de tour, ralentissements, épuisement, Dash, conditions empêchant de bouger et budgets s'appliquent. Une case représente toujours 5 pieds ; l'alternance diagonale 5/10 pieds reste suivie pendant le tour. Les coûts de terrain difficile terrestre et de reptation ne sont pas appliqués au vol. Les murs, portes, cases bloquées, incertitudes géométriques et occupants restent contraignants. Aucun passage incorporel n'est déduit de l'identité de la créature.

Une fenêtre d'attaque d'opportunité conserve le mode explicite dans sa continuation persistable. La reprise revalide le même mode, la même destination et le budget disponible. La marche ne devient jamais automatiquement du vol, y compris après un vol réussi.

Les combinaisons vol préparé et transport d'une créature agrippée sont refusées avant dépense. Un ancien état `prone` est également refusé dans ce mode. Le vol du personnage, les profils volants sans stationnaire, les profils combinant marche et vol, l'altitude, les montées et descentes, les chutes, la nage, le creusement et le franchissement des parois restent hors périmètre. L'automatisation `run_monster_turns` garde sa navigation terrestre ; le modèle peut déplacer explicitement ces créatures avec les outils de navigation.

Les raccords sont dans `lib/navigation.ts`, `mcp-server/navigation.ts`, `mcp-server/tools/navigation-tools.ts`, `mcp-server/hero-movement.ts` et la continuation de `mcp-server/tools/hero-tools.ts`. Aucun nouvel état d'altitude, outil, stockage ou interpréteur de message joueur n'est ajouté. Cette implémentation exploite les profils de vitesse/vol/stationnaire déjà présents dans le registre des monstres issu des sources MM, sans nouvel audit.

`tests/hover-flight.test.cjs` prépare neuf tests : vitesses natives, refus d'octroi de capacités depuis l'état mutable, ralentissement et Dash, aperçu sans mutation, choix explicite et destination exacte, budget de combat des deux profils, terrain et obstacles, modes non pris en charge, reprise d'opportunité après restauration, refus des combinaisons préparée/transport sans dépense. La vérification TypeScript du moteur (`npx tsc -p mcp-server/tsconfig.json --noEmit`) et la syntaxe Node du fichier de tests passent. Leur exécution après compilation et la suite complète sont centralisées par l'agent parent.


Validation intermédiaire exécutée le 31 octobre : neuf cas de vol passent, avec 210/210 tests ciblés au total et TypeScript complet sortie 0 dans output/mcp-wave5-mid-20261031. Cette preuve précède les ajouts KO/surprise ; voir le suivi canonique pour la validation finale.
