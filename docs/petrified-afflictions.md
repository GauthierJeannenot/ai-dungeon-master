# Pétrification et afflictions structurées

Source : PHB 2014, état « Petrified », clause locale 13684 : les poisons et
maladies déjà présents sont suspendus, sans être neutralisés. Cette tranche
couvre les quinze modèles de `lib/srd/afflictions.ts`, leurs enregistrements
`dmTools.afflictions` et leurs effets liés dans `hero.effects`.

L'entrée effective dans l'état pétrifié mémorise `petrificationPause.pausedAt`
et une copie stricte des effets liés à chaque affliction. Ces effets quittent
les effets actifs : poison, paralysie, sommeil, cécité, incapacité et contrainte
de vérité provenant de ces sources cessent donc pendant la suspension. Les
dommages périodiques, sauvegardes, incubation, pénalités de vue et restrictions
de soins de ces sources sont également suspendus. Le poison ou la maladie
reste présent et peut être soigné explicitement par une véritable capacité de
neutralisation ; une source ainsi soignée ne revient pas au réveil.

À la fin effective de la pétrification, les dates absolues `nextAt`,
`expiresAt` et celles des effets sont décalées de la durée pétrifiée. Midnight
Tears conserve ainsi le temps qui restait avant son échéance ; aucun nouveau
minuit ni jet n'est choisi. Les identifiants d'effets et les témoins de tour
sont conservés. Une grande avance d'horloge utilise l'expiration réelle de la
pétrification, puis réconcilie l'affliction à l'heure courante : une durée déjà
écoulée à cet instant ne recrée aucun symptôme.

## Raccords intégrés

- `assertPetrifiedAfflictionsTransition(targetId, endedAt?)` précède toute
  mutation d'entrée ou sortie. Il refuse notamment un jet tenu, une histoire
  incohérente, un événement déjà dû et les conflits d'identifiants.
- `suspendPetrifiedAfflictions(targetId)` suit une entrée réellement effectuée.
- `resumePetrifiedAfflictions(targetId, endedAt?)` suit un retrait réel. Le
  `endedAt` interne est l'expiration effective du fournisseur lorsque celle-ci
  précède l'heure courante. Ce paramètre n'est pas exposé aux outils MCP.
- `assertPetrifiedAfflictionHistory()` précède les avances d'horloge via
  `time-preflight.ts` et `advanceHeroTime`. La réconciliation et les événements
  d'affliction l'utilisent également.
- `validatePetrifiedAfflictionHistory(state)` vérifie un état candidat sans le
  modifier, y compris les acteurs archivés des autres cartes. `errors` interdit
  les pauses incohérentes ; `unresolvedRecordIds` distingue les anciens états
  pétrifiés sans ancrage temporel connu.
- La restauration procède en deux passes : toutes les métadonnées et échéances,
  puis tous les effets et conditions. Les conditions restaurées utilisent
  l'option interne `applyCondition(..., { deferReconcile: true })` afin qu'une
  réconciliation ne voie jamais une restauration partielle. `removeCondition`
  reprend les afflictions après le retrait réel de l'état. `removeHeroEffect`
  et `monster-rules.endEffect` vérifient la fin du dernier fournisseur de
  pétrification et transmettent son échéance réelle. `advanceHeroTime` traite
  les expirations héroïques de pétrification par ordre chronologique, puis
  réconcilie de nouveau les afflictions après expiration des effets.

Une hydratation ne déduit jamais la date historique d'une pétrification depuis
le texte ou l'heure de chargement. Un ancien état pétrifié avec une affliction
sans `petrificationPause` reste signalé comme nécessitant son historique ; les
actions concernées refusent avant de modifier l'horloge. Une pause déjà ancrée
persiste telle quelle lors des sauvegardes et des archives entre cartes.

Une nouvelle exposition pendant la pétrification est immunisée. Elle conserve
son reçu d'exposition terminé et sa consommation de dose effective ; sa
répétition avec le même identifiant reste idempotente et ne lance aucun dé.

## Validation et limite précise

`tests/petrified-afflictions.test.cjs` contient onze tests moteur : conservation
des effets et délais, roundtrip de persistance, grande avance d'horloge,
Midnight Tears, incubation de Sight Rot, immunité des nouvelles expositions,
refus sans mutation d'un jet tenu, véritable guérison pendant la suspension,
schéma strict, archives et historique inconnu, sources simultanées et reprise
des sauvegardes répétées.

Preuve intermédiaire W5 du **31 octobre 2026** : les **11/11 cas de
pétrification** passent dans `output/mcp-wave5-mid-20261031`, avec **210/210
tests ciblés**, build MCP et TypeScript complet sortie 0. La suite complète de
ce même instantané passe ensuite à **1 153/1 153 tests**, sortie 0. Le
[résumé de validation MID](../output/mcp-wave5-mid-20261031/validation-summary.json)
décrit précisément le périmètre et les journaux. Ces résultats excluent les
ajouts ultérieurs KO, surprise et leurs interactions ; ils ne certifient pas
par extension les sources finales W5.

La validation finale W5 du **31 octobre 2026** a ensuite réussi à
**1 201/1 201 tests**, build MCP et TypeScript sortie 0, avec playtest mock
**30/30 tours**, neuf scénarios et 0 $. Le
[résumé final W5](../output/mcp-wave5-final-20261031/validation-summary.json)
reste distinct de MID et des ajouts W6 ci-dessous.

Le poison et le sommeil du sprite étaient hors périmètre W5. Leur raccord W6
est décrit ci-dessous et n'est pas couvert par les preuves W5. Un historique
ancien sans date de pause connue n'est
pas réparé automatiquement : `PETRIFIED_AFFLICTION_HISTORY_REQUIRED` conserve
ce refus explicite avant toute progression mécanique concernée. Un jet tenu
doit être résolu avant une transition de pétrification ; il n'est ni relancé
ni effacé pour permettre cette transition.

## W6 — poison et sommeil du sprite

Source ciblée : attaque Shortbow du sprite, catalogue SRD 2014 local
`lib/srd/monsters.json`, et `rules/books/mm-2014.md` autour de 18053 ; la
pétrification utilise toujours PHB 2014, ligne 13691. Un échec du JS de
Constitution DD 10 empoisonne pendant une minute ; un résultat de 5 ou moins
endort également la cible, qui peut être réveillée par un dégât ou l'action
d'une autre créature. Une vraie immunité au poison empêche ces deux conséquences
sans nouveau JS, tout en conservant la résolution réelle du tir et de son dégât.

Les enregistrements `sprite-poison` et `sprite-sleep` restent dans
`monsterEffects` avec leurs identifiants, source, cible et échéance. Pendant la
pierre, `petrificationPause: { pausedAt, conditions }` conserve uniquement leurs
symptômes réels ; `conditions` actif devient vide. Les expirations, dégâts et
tentatives de secouer ne les neutralisent donc pas pendant la suspension.
Les symptômes encore soutenus par d'autres fournisseurs actifs sont conservés.
La reprise décale les échéances du temps réellement pétrifié, en deux passes,
sans effet doublonné, retour d'arme ni lever gratuit ; un grand saut utilise la
fin réelle du dernier fournisseur de pierre et ne restaure aucun effet déjà
expiré au moment observé.

`petrified-sprite-effects.ts` fournit les préflights de transition, pause,
reprise et validation d'historique, raccordés à côté des afflictions W5 dans
les transitions centrales et les préflights de temps. La validation pure lit
également les archives `floorMonsters` et `retiredMonsters`, sans activer leurs
acteurs. Les anciens états pétrifiés avec sources non ancrées restent signalés
par `PETRIFIED_SPRITE_HISTORY_REQUIRED`, sans inventer leur début historique.

**Périmètre historique W6** : cette validation et la conservation d'une
pause déjà ancrée ne résolvent pas la fin d'un fournisseur de pétrification
quand sa cible est déjà archivée. La reprise à cette échéance hors carte n'est
pas prise en charge dans W6 ; aucun acteur n'est réactivé pour la simuler. Le
test d'archive avance avant l'échéance du fournisseur et ne prouve pas son
expiration hors carte. W7 corrige précisément ce raccord ci-dessous ; les
preuves W6 gardent leur ancien périmètre.

Les nouvelles flèches enregistrent le lien réel `spritePoisonId` du sommeil
vers le poison du même tir. Lesser Restoration (`condition: poisoned`) et
Protection from Poison acceptent son ID exact dans `afflictionId`, y compris
pendant la pause. La neutralisation retire seulement le poison choisi et son
sommeil lié, sans retour à la dépétrification ni guérison des autres sources.
Pour un ancien sommeil sans lien, une unique paire de même source, cible et
échéance peut être reconnue ; une association ambiguë refuse avec
`SPRITE_POISON_LINK_AMBIGUOUS` avant coût ou emplacement. Aucun choix n'est déduit
du texte du joueur.

`tests/petrified-sprite-effects.test.cjs` ajoute **15 cas** : durée restante et
identifiants, roundtrip, expirations héroïque et de monstre après grand saut,
dégâts et action de réveil, immunités nouvelles et natives, autre fournisseur
d'inconscience, deux vraies cures sous pierre, refus des paires anciennes
ambiguës, conservation d'une affliction structurée distincte, schéma/liens
corrompus, refus de l'historique ancien inconnu et archives sans activation.
Au **1er novembre 2026**, la copie privée
`output/mcp-wave6-sprite-current-20261101` valide **15/15 cas sprite**, puis
**56/56 régressions** (pétrification structurée, afflictions persistantes et
pouvoirs de monstres), avec build MCP et TypeScript complet sortie 0.
Les corrections après premier ciblé portent uniquement sur les fixtures :
profil capable d'obtenir un JS de CON de 5 ou moins, main du clerc réellement
tenue et deux dés d'avantage du tir contre une cible pétrifiée. Les assertions
et la mécanique restent inchangées. Le
[résumé ciblé W6](../output/mcp-wave6-sprite-current-20261101/validation-summary.json)
ne constitue pas une exécution complète W6 ; aucun résultat W5 n'est présenté
comme preuve de ces ajouts et aucun binaire partagé n'a été reconstruit.

## W7 — échéances et conditions des acteurs archivés

`persisted-conditions.ts` réserve un accès interne à la référence mécanique
active, retirée ou sauvegardée sur un autre étage. Un cache de la carte
courante est ignoré lorsqu'il n'est qu'un ancien instantané. Ce résolveur ne
rend aucun acteur visible, ne le déplace pas, ne l'inscrit pas dans l'initiative
et ne change ni PV, vie, KO ou compteurs de sauvegardes.

La fin du dernier fournisseur de pétrification, héroïque ou de monstre,
prévalide l'historique avant toute suppression. Elle retire ensuite la condition
sur la référence archivée et reprend les afflictions structurées et les effets
du sprite avec les mêmes IDs et le temps réellement restant. Les fournisseurs
concurrents maintiennent leur condition jusqu'à leur propre fin. Les autres
fournisseurs de symptômes sont retirés de la même façon à expiration ; une
inconscience à 0 PV reste conservée indépendamment de leur retrait. Un vrai
retour à unconscious peut rendre prone, sans inventaire PNJ ni rééquipement.

L'horloge relit ses frontières après chaque événement : une sortie de pierre
peut restaurer un effet expirant encore avant la fin du même saut. Tous les
effets chronométrés déjà gérés, notamment Aid, conservent leur vraie fin. Les
fournisseurs à une échéance commune précèdent l'évaluation de récupération.
Un lanceur archivé vivant reste une source de concentration ; son absence de
la carte active ne suffit pas à terminer le sort. Les contrôles spatiaux restent
bornés à leurs acteurs et cartes réels.

Les actions publiques de cure, exposition, attaque ou déplacement n'utilisent
pas ce résolveur : une archive ne devient pas une cible à portée. Les événements
de poison qui demandent une sauvegarde restent des événements explicites,
résolus par leur procédure existante quand leur acteur est éligible ; aucun jet
de poison hors carte n'est fabriqué. Les événements de cycle de vie des PNJ
archivés ont leur contrat séparé. Un historique de pause inconnu conserve son
refus et ne reçoit aucune date rétroactive.

Ce raccord W7 remplace la limite d'expiration hors carte indiquée dans le
périmètre historique W6 ci-dessus ; cette ancienne limite n'est pas le contrat
actuel. Les résultats W6 restent des preuves de leur seul état de code.

`tests/archived-petrification.test.cjs` couvre les vrais passages entre étages,
le retour et la persistance, les fournisseurs héroïques/de monstres concurrents,
les grands sauts, le sommeil indépendant, les cures réelles avant départ et les
refus de ciblage distant, les horloges Midnight Tears/Sight Rot, la concentration
d'un mage réellement archivé, la retraite mécanique et les caches courants
périmés. La copie privée
`output/mcp-wave7-archived-stone-current-20261101` valide **12/12 cas dédiés**
et **96/96 régressions**, build MCP et TypeScript complet sortie 0. Elle part
de la base W7 avec les seuls fichiers de ce lot et les hooks héroïques testés
privément ; elle n'atteste pas encore l'intégration du nouveau cycle PNJ à
0 PV développé en parallèle. Les corrections après le premier passage sont
deux fixtures (voie réelle de Sight Rot et vrai ancrage de concentration),
sans modification mécanique. Voir le
[résumé borné W7](../output/mcp-wave7-archived-stone-current-20261101/validation-summary.json).

## Validation intégrée W7 finale

La copie finale figée r2 valide **83/83 ciblés**, puis **1 331/1 331 tests**,
compilation et TypeScript complets sortie 0, **30/30 tours mock**, neuf scénarios,
97 appels mock et **0 $**. Les **132 outils** sont vérifiés ; les sources,
configurations et tests restent identiques après exécution. Le moteur partagé
recompilé correspond aux **721 binaires** privés validés. Cette preuve
intègre les deux lots W7 et leurs raccords applicatifs ; les résultats privés
plus anciens ci-dessus restent des preuves bornées, sans addition de leurs comptes.
Voir le [rapport permanent W7](rules-audit/validation-wave7-2026-11-01.json).
