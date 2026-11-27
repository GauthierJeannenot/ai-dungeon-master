# Budget de rencontre — DMG 2014

`assess_encounter_budget` estime la difficulté d’une opposition explicitement choisie. Il ne crée aucune rencontre, ne choisit aucun monstre, ne lance aucun dé et n’attribue aucun XP. Le calcul ne change ni les PV, ni l’initiative, ni les ressources, ni l’état de campagne.

## Contrat

- `mode: "planned"` et `groups: [{monsterType, count, countsForMultiplier}]` : types exacts du catalogue moteur gelé, un groupe par type.
- `mode: "active"` et `monsters: [{monsterId, countsForMultiplier}]` : identifiants distincts de vrais monstres vivants et hostiles de la carte active. Un PNJ narratif, compagnon non hostile, cadavre ou acteur archivé n’est pas un personnage de groupe supplémentaire.
- Les deux modes sont exclusifs. `playerLevel`, `partySize`, valeurs d’XP et autres statistiques ne sont pas des arguments publics.
- L’unique personnage réel et son niveau stocké déterminent les seuils. Les niveaux 1–20 sont tabulés ; aucune extrapolation n’est faite hors de cette table.
- `countsForMultiplier` est une décision explicite du MJ sur la contribution réelle au nombre d’opposants, notamment pour les faibles créatures. Aucune comparaison automatique de texte/FP ne décide ce choix. Au moins une créature doit compter ; les XP source de toutes les créatures sélectionnées restent dans `rawXP`.

Le résultat distingue XP source, XP ajustés, multiplicateur standard et ajustement de petite équipe, quatre seuils, catégorie estimée et budget journalier de référence. `below_easy` signifie seulement « sous le seuil Easy » ; ce n’est pas une cinquième catégorie de difficulté publiée. `xpAward: null` rappelle que l’estimation n’accorde aucune expérience.

## Source

Source locale : `rules/books/dmg-2014.md`, **XP Thresholds by Character Level** (2971–2993), **Evaluating Encounter Difficulty** (3002–3043), **Party Size** (3045–3051) et **The Adventuring Day / Adventuring Day XP** (3073–3104). Les XP et FP des monstres viennent du snapshot commun `lib/srd/monsters.json`, avec URL et empreinte retournées.

Les multiplicateurs standard pour 1, 2, 3–6, 7–10, 11–14 et 15+ monstres sont ×1/1,5/2/2,5/3/4. Pour la campagne à un personnage, la règle des moins de trois aventuriers donne ×1,5/2/2,5/3/4/5. **Le cas ×5 pour quinze monstres ou plus est explicitement publié au paragraphe Party Size** ; il n’est pas extrapolé. Le helper pur expose aussi la formule publiée des groupes de six personnages ou plus, mais le MCP n’autorise pas d’inventer un groupe supplémentaire.

Le total ajusté n’est pas l’XP à attribuer. Le budget journalier n’est pas un crédit débité ni une instruction automatique de repos. Les vagues distinctes doivent être évaluées séparément : ce lot ne crée pas de registre d’XP journalier ou de repos entre vagues.

## Limites

Cette formule ne garantit pas une rencontre équilibrée ou survivable en solo. PV actuels, emplacements, terrain, tactiques, conditions, surprise, pièges et assistance de compagnons ne sont pas chiffrés. Les capacités encore `sourceReferenceOnly` et les limites mécaniques des types choisis sont retournées, afin qu’un FP publié ne fasse pas croire à une fiche entièrement exécutable.

Un `hpOverride` actif est signalé ; son FP/XP n’est pas recalculé. Une modification arbitraire de `monster.xpValue` ne diminue pas le prix source utilisé. L’outil n’implémente pas les ratios alternatifs Xanathar, la création d’un monstre, le calcul d’un FP personnalisé, la génération aléatoire, le peuplement d’un donjon ou une progression de personnage. Les extensions restent dans le [registre canonique](suivi-integration-mcp.md), entrée ENCOUNTER-BUDGET et dépendances.

## Raccord et validation

Le parent ajoute `../lib/encounter-budget.ts` au `include` MCP, enregistre `registerEncounterBudgetTools` et expose l’inspection comme documentaire à l’agent IA. Aucun nouveau schéma persistant n’est nécessaire. Une inspection ne doit pas satisfaire une action de jeu planifiée.

Dix tests sont préparés dans `tests/encounter-budget.test.cjs` : formules publiées, bornes, cas solo extrême, distinction XP, choix explicite des faibles participants, réel niveau joueur, catalogue/acteurs refusés, variantes de PV, invariance de l’état et consultation pendant une réaction tenue. TypeScript sans émission et syntaxe sont contrôlés sans reconstruire le `dist` partagé ; l’exécution MCP appartient à la validation centrale après raccord. Ce sous-lot ne termine pas toute l’entrée ENCOUNTER-BUDGET.


Validation intermédiaire exécutée le 31 octobre : dix cas de budget passent, avec 210/210 tests ciblés au total et TypeScript complet sortie 0 dans output/mcp-wave5-mid-20261031. Cette preuve précède les ajouts KO/surprise ; voir le suivi canonique pour la validation finale.
