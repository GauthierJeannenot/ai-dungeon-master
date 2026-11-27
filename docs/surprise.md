# Surprise au démarrage du combat

Source ciblée : `rules/books/phb-2014.md`, lignes 5603–5609 (« Surprise »),
et règle des actions bonus autour de 5630–5634. Le MJ détermine quels
participants n'ont pas remarqué la menace ; la surprise peut toucher certains
membres seulement d'un groupe.

`enter_combat` accepte désormais la décision explicite du MJ :

```json
{
  "combatants": ["player", "goblin_123"],
  "surprise": {
    "surprisedIds": ["goblin_123"],
    "reason": "Le garde n'a pas remarqué la menace établie avant le combat."
  }
}
```

Les identifiants doivent appartenir exactement au combat déclaré, sans doublon.
Le motif est obligatoire. Les éventuels jets de Discrétion et observations sont
établis avant cet appel avec les procédures existantes ; cet argument est la
décision du MJ, pas un nouveau jet, une détection depuis le texte du joueur, une
preuve de réussite inventée ni un avantage d'attaque automatique. L'absence
d'argument indique que personne n'est surpris. Les validations précèdent la
mutation de phase et les dés d'initiative.

Chaque participant sélectionné reste privé de déplacement volontaire,
d'actions, d'actions bonus et de réactions jusqu'à la fin exacte de son premier
tour. Il ne reçoit donc pas de réaction au début de ce tour. `next_turn` peut
terminer explicitement ce tour sans action préalable et sans `skipAction`.
Le batch `run_monster_turns`, lorsqu'il est explicitement demandé, tient cette
restriction et avance ensuite par sa procédure existante. Aucun appel MCP
supplémentaire n'est fabriqué. La restriction de réaction passe par
`reactionAvailable`, utilisée par les attaques d'opportunité, Bouclier,
Contresort, les réactions de dégâts et la libération des actions préparées.
Le planificateur de déplacement applique sa propre garde pour les chemins qui
ne passent pas directement par `validateMove`.

La fin de surprise suit les événements réels de fin de tour. Les sauvegardes
internes de `endHeroTurn` et des effets de monstre sont synchrones. Un événement
d'affliction de fin de tour doit être résolu explicitement avant `next_turn` ;
un résultat tenu refuse cette fin avec `REACTION_PENDING` et ne lève jamais la
surprise. Après résolution du résultat, le modèle demande encore explicitement
la fin du tour. La surprise ne soigne aucun véritable état d'incapacité et ne
renouvelle pas une réaction déjà dépensée.

Un monstre assommé vivant conserve sa position dans l'initiative. Quand une
véritable avance de tour traverse cette position et saute son tour vide, son
premier tour est compté comme terminé pour la seule surprise, sans lui créer
d'effets de début/fin de tour, de réaction ou de jet. Le passage inclut les
positions en bout de roster avant le round suivant. Un soin avant ce passage
conserve la surprise jusqu'à la fin de son premier tour réel ; un soin après
ne la réapplique pas et n'offre aucun tour rétroactif. Un aperçu, une
hydratation ou une avance refusée ne compte jamais comme ce passage. Plusieurs
positions KO successives sont traitées de la même façon, y compris lorsque le
joueur est le seul acteur actif et que l'ordre revient directement à lui.

Le préflight KO réserve conservativement six secondes avant chaque avance de
tour. À la première récupération naturelle possible non modélisée, il refuse
avec `KNOCKOUT_RECOVERY_PENDING` avant les événements de fin et avant
l'acquittement de surprise. Un ancien KO absent du roster du combat courant
ne peut pas être soigné pour lui inventer une position d'initiative : le soin
refuse avec `KNOCKOUT_INITIATIVE_NOT_REGISTERED` ; il peut être repris en
exploration après cette rencontre.

## État et raccords

`dmTools.surprise` contient la génération du combat, la carte, le motif et le
témoin `firstTurnEnded` de chaque participant choisi. Cet état strict survit au
roundtrip. La restauration refuse un combat, une carte ou un acteur incohérent,
y compris un acteur actif absent du roster. Les véritables morts ou le joueur
stabilisé peuvent garder leur témoin après leur retrait de l'initiative ; ils
ne sont jamais réactivés par ce registre. Un retrait réel de monstre retire son
témoin. Quitter le combat nettoie le registre ; une nouvelle génération ne
réapplique aucune décision passée.

- `validateCombatSurprise` : préflight avant les dés et la phase.
- `initializeCombatSurprise` : juste avant `setInitiativeOrder`, qui incrémente
  la génération avant les hooks de début de tour.
- `assertSurpriseCanAct` : garde commune des actions et du déplacement.
- `isSurprised` : lecture pure pour les réactions et les fins de tour.
- `completeSurpriseTurn` : après les événements effectifs de fin de tour,
  avant le changement de combattant ; garde conservée si un résultat est tenu.
- `completeSkippedKnockoutSurpriseTurn` : seulement au passage effectif d'une
  position de KO vivant, après les préflights et événements de fin réussis.
- `validateSurpriseState` : validation sans mutation avant restauration.
- `clearCombatSurprise` / `removeSurpriseActor` : sorties réelles du combat.

Le registre persistant reste `DmToolStateSchema.surprise`. Le fichier partagé
`lib/surprise-state.ts` est inclus dans la compilation MCP.

## Périmètre et validation

La surprise générale est disponible pour `enter_combat` avec des acteurs déjà
présents. `start_encounter`, ses nouveaux monstres et ses embuscades de porte
autorisées conservent la procédure W5 quand aucun argument de surprise n'est
fourni ; les presets acceptent désormais la sélection W6 décrite ci-dessous.
Les embuscades de porte restent distinctes. La surprise n'est pas un état ajouté à `conditions` et
n'impose aucun changement au choix produit de relancer l'initiative à chaque
round.

`tests/surprise.test.cjs` contient quinze cas : joueur et monstre surpris,
actions/bonus/déplacement/pouvoir réel, réaction avant et après le premier tour,
batch de monstres, choix invalides sans coût ni dé, sauvegardes/reprises et
états corrompus, fin individuelle et round suivant, incapacité véritable,
nouveau combat, attaques d'opportunité, noms de propriétés héritées, sauvegarde
de fin de tour tenue, mouvement préparé préexistant et jet tenu avant entrée.
La syntaxe est vérifiée.

`tests/knockout-surprise.test.cjs` ajoute six interactions ciblées : soin avant
position, soin après passage et roundtrip, KO en fin de roster sur plusieurs
rounds, plusieurs KO jusqu'au seul joueur actif, refus temporel KO avant effets
de fin et surprise, et refus d'un soin qui introduirait un ancien KO absent du
roster d'un nouveau combat. La borne de récupération naturelle KO reste
refusée honnêtement par `KNOCKOUT_RECOVERY_PENDING` avant toute mutation.

La validation finale W5 du **31 octobre 2026** couvre ces **15 + 6 cas** dans
une suite de **1 201/1 201 tests**, avec build MCP, typecheck complet et
playtest mock de **30/30 tours** verts. La publication ROOT a ensuite été
comparée aux 181 dépendances et 697 binaires de la copie validée sans écart.
Cette preuve W5 n'atteste pas l'extension W6 ci-dessous.

La validation intermédiaire antérieure `output/mcp-wave5-mid-20261031` avait
réussi les **11 cas de pétrification**, **210/210 tests ciblés**, puis
**1 153/1 153 tests** de sa suite complète, avec build MCP et TypeScript complet
sortie 0. Le
[résumé MID](../output/mcp-wave5-mid-20261031/validation-summary.json) exclut
explicitement KO, surprise et leurs interactions de cet instantané : cette
preuve datée ne valide donc pas les ajouts décrits dans le présent document.

## Rencontres autorées — extension W6

`inspect_encounter({encounterId})` est une lecture confidentielle pour le MJ.
Elle retourne le roster exact avec les `monsterIndex` à partir de zéro, les
types sourcés, cellules autorées ou positions d'alerte sauvegardées, carte,
salle et état d'embuscade. Elle accepte un preset de la carte active, y compris
un donjon installé dans cette partie. Elle ne découvre rien pour le joueur,
ne marque aucune visite, ne déclenche ni bruit, combat ou monstre et ne dépense
ni ressource ni dé. Elle reste disponible pendant un jet tenu. Ses annotations
SDK indiquent readOnly/idempotent et openWorld=false.

Après cette lecture, le modèle peut choisir explicitement :

```json
{
  "encounterId": "identifiant-du-preset-inspecte",
  "surprise": {
    "playerSurprised": false,
    "surprisedMonsterIndices": [0, 2],
    "reason": "Le MJ a établi que ces deux participants n'ont pas remarqué la menace."
  }
}
```

Ce nouvel argument de `start_encounter` est réservé au roster autoré choisi,
sans remplacement `monsters`. Le booléen du joueur est obligatoire ; les indices
doivent être exacts, uniques et dans la liste inspectée. La décision est
contrôlée avant visite, placement, création d'identité, apparition, phase ou dés
d'initiative. Après création seulement, les indices déjà validés sont reliés
aux vrais IDs dans l'ordre du roster, puis la procédure W5 commune installe les
témoins du premier tour. Aucune cible ou position absente n'est complétée.
Le résultat conserve le roster ordonné et le registre réel de surprise dans
`combat.surprise`. L'absence du champ conserve le trajet antérieur, notamment
le choix produit existant de placer le joueur en premier dans `start_encounter`.

La combinaison avec un argument `ambush` ou un état de rencontre déjà
`ambushing` est refusée avant mutation. Les Perception, sauvegarde de DEX,
frappe de réaction et reprises de l'embuscade de porte autorée restent leur
procédure propre. Une rencontre possédant simplement une capacité d'embuscade,
sans préparation active, peut encore être engagée normalement selon les choix
explicites du MJ.

Raccords : `registerEncounterInspectionTools` (appel séparé dans l'index),
`registerPhaseTools`, `EncounterSurpriseInputSchema`,
`validateEncounterSurprise` et `encounterCombatSurprise`. Aucun nouvel état
persistant n'est ajouté. Les rosters personnalisés fournis dans `monsters`
restent hors de cette extension ; leur surprise générale utilise la procédure
existante avec des acteurs présents et `enter_combat`.

`tests/encounter-surprise.test.cjs` vérifie l'extension par un vrai processus
MCP : inspection sans mutation, indices et IDs exacts, fin individuelle après
restauration, absence d'argument compatible, refus avant dés/coûts, carte
stricte, embuscade autorée inchangée, épuisement hérité et donjon installé
inspecté pendant un vrai jet tenu. La validation se fait dans une copie privée
basée sur W6 ; les résultats sont reportés au coordinateur.

Validation privée W6 de cette extension : **10/10** nouveaux cas et **50/50**
régressions passent, ainsi que la compilation MCP et le typecheck complet.
La copie `output/mcp-wave6-encounter-surprise-20261101` part de la baseline W6,
du lot de portées C figé et de ces seuls raccords de surprise/inspection ;
elle n'atteste pas les autres tranches W6 en cours. Journaux et empreintes :
`encounter-surprise-validation.json` et `encounter-surprise-inputs.json` dans
ce dossier. Aucun build racine ni appel payant n'est exécuté pour ce contrôle.
