# Respiration et suffocation — règles 2014

`inspect_breathing` expose le contexte d’un véritable acteur, ses échéances
initiales et le verrou de récupération. Une lecture peut retrouver un corps
archivé sans le réactiver. `set_breathing_context` enregistre un fait physique
explicitement choisi par le MJ : `hold_breath`, `choking` ou `air`, avec un
identifiant d’événement et une raison. Aucun texte du joueur n’est analysé pour
déduire une immersion, un besoin d’air ou une sortie de l’eau.

La Constitution de la véritable fiche fixe la réserve : `max(30, 60 × (1 +
modificateur CON))` secondes, puis `max(1, modificateur CON)` rounds sans air.
Un nouvel identifiant d’événement ne renouvelle aucune durée. Un retour réel à
l’air termine l’épisode ; il ne rend aucun PV par lui-même. Un PNJ doit avoir sa véritable
fiche et sa politique de sauvegardes déclarée avant la blessure. Seul un corps
déjà dans un véritable épisode à 0 PV peut commencer directement à suffoquer
sans déclarer une nouvelle politique. Il ne peut pas obtenir ainsi une réserve
de respiration qui survivrait à la guérison d’une exception de KO.

En combat, l’horloge existante avance de six secondes par round. L’effondrement
survient au véritable début du tour de la victime une fois sa grâce écoulée ;
le tour d’une autre créature ne compte pas comme un round supplémentaire. Hors
du roster actif, y compris pour un acteur archivé, les frontières de six
secondes donnent les événements temporels explicites. Un saut de temps refuse
de dépasser la première sauvegarde nouvellement créée par l’effondrement.
Les contextes expirés et l’effondrement sont traités chronologiquement avec les
autres effets ; aucune sauvegarde n’est lancée par ces transitions.

Le joueur qui s’effondre réellement hors combat reçoit aussi ses véritables
événements de sauvegarde à six secondes. `inspect_breathing` expose leur
identifiant exact, à transmettre à `roll_death_save` avec `entityId: "player"`.
Le retour à l’air conserve ce cycle tant que le joueur reste mourant ; il ne
reconstruit pas un épisode ancien pour un état sauvegardé sans source.

L’effondrement met les PV ordinaires à zéro sans dégât : les PV temporaires et
la Protection contre la mort restent intacts. Il ouvre ou reprend le véritable
épisode mourant sans fabriquer un échec de sauvegarde. En absence d’air, la
récupération de PV et la stabilisation sont interdites avant les dés et les
coûts de la tentative.

Si une récupération stable d’un PNJ arrive pendant sa grâce sans air, son
échéance et son premier résultat de d4 sont conservés. Le PV déjà dû peut être
appliqué au retour effectif à l’air, à cet instant réel, sans nouveau d4 ni soin
daté dans le passé. Un effondrement préalable annule ce réveil stable.

`air` peut aussi établir qu’un véritable cadavre actif a été sorti de son
contexte sans air ; cela ne change ni ses PV ni sa mort. Une Revivification
séparée conserve ses propres conditions, son diamant et son emplacement, et
refuse avant ces coûts tant que le contexte sans air reste établi. Cette
intersection applique la même lecture spécifique de l’interdiction de regain
de PV ; elle n’est pas présentée comme une clarification officielle publiée.

## Rencontre de la suffocation et des sauvegardes contre la mort

Le PHB interdit la récupération et la stabilisation jusqu’au retour de l’air.
Sa règle générale des sauvegardes prévoit aussi 1 PV sur un 20 naturel et la
stabilisation au troisième succès. Le texte ne publie pas de résolution
détaillée de leur rencontre. L’implémentation adopte explicitement la lecture
« règle spécifique avant règle générale » suivante :

- Un 20 naturel satisfait le seuil de réussite : il ajoute un succès, sans PV
  immédiat ni PV mis de côté pour plus tard.
- Les succès sont plafonnés à trois. Le troisième succès est conservé avec le
  témoin exact de l’acteur, de l’épisode et du véritable événement résolu ; le
  corps reste mourant. Les échecs continuent et trois échecs entraînent la mort.
- Le retour réel à l’air peut résoudre les trois succès observés en une
  stabilité à 0 PV, sans nouveau jet de sauvegarde ni soin. Pour un PNJ, son
  véritable délai de récupération stable est lancé à cet instant.

Cette articulation est une interprétation mécanique documentée, pas une
clarification officielle présentée comme publiée. Sources ponctuellement
consultées : `rules/books/phb-2014.md`, chapitres 8 (« Suffocating ») et 9
(« Death Saving Throws »), et [Basic Rules 2014 de Wizards of the Coast](https://media.wizards.com/downloads/dnd/DnDBasicRules.pdf).

## Raccord moteur

Les données et les reçus persistants vivent dans `dmTools.breathing`.
`registerBreathingTools` installe les deux callbacks autoritaires
`collapse(event)` et `stabilizeAfterAir(marker)`. Les nouveaux modules ne
réimplémentent pas les dégâts ou le cycle de vie partagé.

La boucle de temps doit réinterroger `breathingClockExpirations(finalTime)`
après chaque événement, en positionnant temporairement l’horloge à son `at`.
`startBreathingTurn` précède la préparation de l’éventuelle sauvegarde du PNJ,
et `breathingTurnEventDue` conserve le créneau nécessaire d’un corps stable à
0 PV. `assertBreathingTimeAdvance` protège les sauts temporels ; les chemins de
soin et de stabilisation appellent `assertBreathingRecoveryAllowed` avant tout
coût ou dé. Les sauvegardes bloquées appellent
`noteBlockedBreathingStabilization`, et les véritables fins d’épisode nettoient
ce témoin via `clearBlockedBreathingStabilization`.

`validateBreathingState` complète les schémas partagés à l’hydratation : acteur
réel, reçu d’origine, horodatages et identité exacte du témoin. Les états
anciens sans contexte respiratoire ne reçoivent aucune immersion, histoire de
sauvegardes ou physiologie reconstituée.

## Vérifications ciblées

`tests/breathing-state.test.cjs` vérifie les témoins de source et l’état sans
activer de créature. `tests/breathing.test.cjs` exerce les outils publics sur
les véritables processus MCP : PV temporaires/Protection contre la mort,
sauvegardes et dégâts à 0 PV, soins refusés avant coûts, réveil stable retardé,
corps archivé, créneau réel d’un corps stable et roster explicite. Les cas
joueur temporels sont dans `tests/suffocation-player-death-saves.test.cjs`.

Les besoins raciaux ou physiologies non standard, les réserves d’air partagées
et la détection automatique d’une immersion restent hors de cette tranche.
