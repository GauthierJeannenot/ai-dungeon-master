# PNJ à zéro PV — W7

Source ciblée : `rules/books/phb-2014.md`, « Dropping to 0 Hit Points », « Death Saving Throws », « Stabilizing a Creature », « Monsters and Death » et « Knocking a Creature Out » (PHB 2014). Le moteur applique ce cycle aux véritables `MonsterState`, avec leurs PV et statistiques existants.

## Choix du MJ et épisode réel

Par défaut, un monstre meurt toujours à 0 PV. Pour un PNJ important, l’agent peut déclarer avant la blessure `configure_npc_death_saves({entityId, eventId, reason})`. La cible doit être vivante, active et avoir des PV positifs ; une immunité de source à l’inconscience refuse ce cycle. En combat elle doit déjà appartenir au roster. La politique est persistante et immuable : les mêmes arguments rejouent le choix, un autre choix refuse. Aucun profil de PNJ ni rang d’initiative n’est inventé.

Une vraie attaque non létale crée directement un épisode stable, même sans cette politique. Ce KO ne donne pas au PNJ une politique permanente pour ses blessures futures. `npcLife.episode` conserve l’identité de l’épisode, son origine (`policy` ou `knockout`), son état (`dying`, `stable`, `dead`), les succès/échecs et ses témoins d’événements. L’ancien `knockout` conserve son témoin d’attaque et son dé de récupération ; une stabilisation ultérieure générique ne fabrique jamais ce témoin.

## Dégâts, sauvegardes et soins

Un PNJ suivi tombant à 0 PV devient inconscient et à terre. Les dégâts massifs le tuent si les dégâts restant après sa chute atteignent ses PV maximum. À 0 PV, tout dégât reçu positif après les défenses provoque un échec, ou deux pour un critique, même si des PV temporaires absorbent le dégât. Un montant ajusté à zéro ne change rien. Un dégât reçu atteignant les PV maximum tue immédiatement. Les dégâts déstabilisent un corps stable et annulent son ancienne récupération ; les succès déjà acquis d’un mourant restent conservés.

`roll_death_save({entityId, eventId})` exige le témoin exact fourni par le moteur, et non un identifiant arbitraire choisi pour une nouvelle tentative. Sans `entityId`, l’outil conserve son fonctionnement pour le joueur. Le d20 n’ajoute pas le modificateur de Constitution : 10 ou plus donne un succès, un 1 naturel deux échecs, un 20 naturel rend réellement 1 PV. Trois échecs établissent la mort et son instant ; trois succès stabilisent et remettent les compteurs à zéro. Les modificateurs de sauvegarde effectivement établis et la reprise du dé tenu d’Inspiration bardique restent applicables. Les reçus conservent le résultat original, y compris après soin, nouvel épisode ou mort ; un ancien reçu ne consomme pas le jet d’un événement ultérieur.

Un allié actif peut effectuer `combat_action({action:'stabilize', actorId, targetId})` : le vrai test de Médecine DD 10 consomme son action. Une réussite stabilise le PNJ, remet les compteurs à zéro et tire une seule fois `1d4` heures. Le timer générique est `npcLife.episode.recovery`, lié à la stabilisation réelle, sans faux `attackEventId`. À son échéance, le PNJ regagne 1 PV. Un soin réel ou le 20 naturel termine l’épisode et annule le timer, sans relever, rééquiper ni effacer une autre source d’inconscience. Les résultats d’horloge exposent `naturalRecoveries`, avec l’origine et, selon le cas, l’épisode ou l’attaque de source.

Les morts de source explicites (par exemple Consume Life ou une véritable destruction) restent des morts de source, sans faux dégât ni sauvegarde contre la mort supplémentaire. Les exceptions propres à leur source précèdent cette transition. Un vrai cadavre n’est jamais soigné implicitement.

## Tours, horloge et archives

En combat, un PNJ mourant explicitement inscrit conserve ses vrais tours de sauvegarde. L’événement n’est dû qu’au début réel de son tour : un PNJ tombé après ce début ne reçoit pas de sauvegarde rétroactive. `run_monster_turns` s’arrête devant l’événement dû et le renvoie au modèle, qui doit appeler explicitement l’outil. Un 20 naturel permet le reste du tour normal, sans ajouter d’action. Un corps stable ne reçoit pas d’action ; son slot reste conservé pour un éventuel soin futur. Les dégâts intrinsèques déjà établis, comme une brûlure, ne deviennent pas une action du corps.

En exploration et dans les archives, chaque épisode mourant expose `nextSaveAt` et `timeEventId` pour sa prochaine frontière de six secondes. L’horloge peut atteindre cette échéance, mais ne peut pas la dépasser tant que le MJ n’a pas résolu ce jet explicitement. Il n’existe aucun jet automatique. `roll_death_save` est une exception de comptabilité explicite pour le dossier archivé : il ne crée ni présence, token, tour, rôle, position ni initiative. Les autres attaques, soins et expositions gardent leur ciblage actif habituel. Un réveil stable archivé rend le PV à son heure réelle sans activer la carte.

Un nouveau combat doit inclure explicitement chaque PNJ mourant de la carte active, ou attendre sa résolution en exploration. `start_encounter` refuse avant création/placement si son nouveau roster ne peut pas le faire. Une action hostile susceptible de blesser un PNJ suivi omis du combat courant refuse avant dés et coûts ; aucune inscription implicite n’est faite. Les trajets des événements de round réellement écrits sont également prévalidés pour éviter un épisode sans place d’initiative. Le contrôle d’entrée est conservateur pour ces trajets encore en attente.

Les XP de défaite restent attribués une seule fois aux adversaires éligibles ; un PNJ explicitement allié (`hostile:false`) ne rapporte pas des XP parce qu’il tombe à 0 PV. Les archives et les sauvegardes ne réattribuent aucune récompense.

## Bornes et validation

Les anciens KO W5 sans dé de récupération restent sans dé de migration : chargement et refus ne créent aucun état ni jet. La borne de première heure décrite dans [la récupération stable](nonlethal-recovery.md) reste explicite. Les nouveaux choix KO sur une cible déjà exposée à certains dégâts récurrents restent bornés ; voir [les attaques non létales](nonlethal-attacks.md). Les choix KO d’Arme spirituelle sont prolongés par [la tranche W9](nonlethal-melee-spells.md) ; les autres sorts de mêlée absents du catalogue ne sont pas activés implicitement. Les opportunités et attaques physiques préparées sont prolongées par [la tranche W8](nonlethal-reactions.md), sans étendre le choix KO aux monstres. Les reçus de sauvegarde sont conservés sans éviction ; au plafond de 256, un nouvel événement refuse avant le dé.

Les états incohérents et les résultats tenus ne correspondant plus à l’épisode exact refusent à la restauration. Le chargement n’effectue ni soin ni jet. Les tests ciblés sont `tests/npc-death-saves.test.cjs` et les croisements archives, effets et routage W7. Le ciblé moteur des quatre fichiers PNJ/KO/récupération/surprise passe **81/81**, avec build privé et TypeScript moteur `--noEmit` à zéro. Les 26 fichiers source/test consignés sont identiques entre ROOT et ce privé. Le rapport [wave7-npc-life-validation.json](../output/wave7-npc-life-validation.json) donne le périmètre, les empreintes et les tentatives, sans additionner les suites rejouées. La validation globale reste à la coordination. Aucun build du runtime partagé n’est effectué par cet agent.

## Validation intégrée W7 finale

La copie finale figée r2 valide **83/83 ciblés**, puis **1 331/1 331 tests**,
compilation et TypeScript complets sortie 0, **30/30 tours mock**, neuf scénarios,
97 appels mock et **0 $**. Les **132 outils** sont vérifiés ; les sources,
configurations et tests restent identiques après exécution. Le moteur partagé
recompilé correspond aux **721 binaires** privés validés. Cette preuve
intègre les deux lots W7 et leurs raccords applicatifs ; les résultats privés
plus anciens ci-dessus restent des preuves bornées, sans addition de leurs comptes.
Voir le [rapport permanent W7](rules-audit/validation-wave7-2026-11-01.json).
