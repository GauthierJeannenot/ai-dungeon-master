# Récupération naturelle d’un KO stable — W6

Source ciblée : `rules/books/phb-2014.md`, « Stabilizing a Creature » : une créature stable non soignée regagne 1 PV après **1d4 heures**. Ce lot W6 complète le [choix KO](nonlethal-attacks.md). Le [cycle PNJ W7](npc-death-saves.md) étend ensuite la même récupération aux stabilisations génériques et traite les dégâts à 0 PV.

## Un dé à la véritable stabilisation

Le moteur tire une seule fois `1d4` lorsqu’une vraie attaque non létale fait effectivement passer une cible de PV positifs à zéro et la laisse stable. Défenses, PV temporaires, Undead Fortitude et protection laissant 1 PV précèdent ce choix. Un échec d’attaque, un coup non terminal et une sauvegarde qui laisse 1 PV ne consomment aucun dé de récupération.

L’état conserve `knockout.recovery = { hours, wakeAt }`, avec `hours` de 1 à 4 et `wakeAt = knockout.at + hours * 3600`. Ce n’est pas un argument d’outil choisi par le modèle. Les reçus des attaques à deux armes, les résultats tenus et la restauration réutilisent le même témoin. Un soin préalable termine le KO et annule sa récupération future ; l’ancienne échéance ne donne ensuite aucun PV supplémentaire.

## Horloge, conscience et archives

À `wakeAt`, la créature regagne exactement **1 PV**, son KO se termine et sa position, sa posture à terre et ses objets restent inchangés. Une autre source d’inconscience encore active n’est pas guérie. Les fournisseurs connus de `hero.effects` et `monsterEffects` sont évalués à l’heure de récupération ; leurs effets suspendus pendant la pétrification ne comptent pas comme actifs. Une inconscience indépendante déjà établie sans fournisseur ni échéance connus est conservée explicitement plutôt qu’effacée.

Les sauts de temps traitent les frontières de pétrification et de récupération dans l’ordre réel. Le moteur revient à l’heure finale du saut après ces événements. Un réveil stable à 3600 secondes peut ainsi rendre 1 PV tout en conservant un sommeil repris jusqu’à 3650, même si la requête avance directement à 4000 secondes. La fin du sommeil ne transforme pas rétroactivement l’événement de 3600 en réveil conscient.

`advance_time`, `advance_game_time`, les repos courts et longs exposent `naturalRecoveries`. Les événements KO conservent leur `attackEventId` réel ; une récupération générique PNJ conserve son `episodeId` et son origine sans fabriquer de témoin d’attaque. Les événements donnent `entityId`, `stabilizedAt`, `hours`, `wakeAt`, `hpBefore: 0`, `hpAfter: 1`, `unconsciousRetained` et les informations d’archive applicables (`archived`/`mapId`). Les ticks de round utilisent la même chronologie avant les événements du nouveau round ; ils conservent leur prévalidation propre de nutrition et de feu.

Les corps des cartes archivées et les acteurs retirés regagnent aussi ce PV à leur échéance, sans faire apparaître de token ni les inscrire dans l’initiative. Dans un combat actif, un corps déjà présent dans le roster retrouve seulement ses places futures ; aucune avance de `currentTurn` ni action gratuite n’est accordée. Si un ancien corps de la carte courante est absent du roster d’une autre rencontre, traverser son échéance refuse avant mutation avec `KNOCKOUT_INITIATIVE_NOT_REGISTERED`. Une archive distante n’est pas inscrite dans cette rencontre.

## Anciennes sauvegardes et bornes maintenues

Un KO W5 sans `recovery` ne reçoit aucun dé de migration au chargement. Il conserve la borne explicite précédant sa première heure possible : une traversée refuse avec `KNOCKOUT_RECOVERY_PENDING`, jusqu’à un vrai soin. Les réserves conservatrices de tours/batches restent explicites pour ces anciens états et pour la frontière d’un corps absent du roster actuel ; elles n’ajoutent réellement aucun temps.

Un timer incohérent, daté du futur ou déjà dépassé est refusé à la restauration. Le chargement ne soigne pas silencieusement et ne relance aucun dé ; tous les chemins d’horloge autorisés doivent avoir résolu les échéances avant leur sauvegarde.

Les dégâts ultérieurs sur un PNJ à 0 PV suivent désormais le cycle W7 et annulent le timer d’un corps déstabilisé. Les intentions KO sur certains dangers persistants incompatibles gardent leur refus préalable. La récupération naturelle ne neutralise aucun poison, ne ressuscite pas un mort et n’étend pas le choix KO aux sorts de mêlée, opportunités ou attaques préparées.

## Vérification

`tests/nonlethal-recovery.test.cjs` couvre les quatre délais, les non-déclenchements, soin et annulation, sauts/repos, fournisseurs d’inconscience, pétrification/sprite, archives, restauration, initiative et surprise. Les pools de `tests/nonlethal-attacks.test.cjs` et `tests/knockout-surprise.test.cjs` ajoutent le vrai d4 après chaque stabilisation ; leurs anciennes assertions de première heure ciblent explicitement un état W5 sans témoin de dé. Aucune assertion de posture, XP unique, coût, refus ou reprise n’est supprimée.

Vérification W6 : TypeScript moteur `--noEmit`, syntaxe Node et build dans la copie privée passent (exit 0). Le ciblé des trois fichiers KO passe **57/57** ; neuf fichiers de régressions horloge/repos/pouvoirs/afflictions/initiative passent séparément **115/115** sur le même moteur privé, sans recompilation intermédiaire. Aucun test runtime ni build n’est exécuté dans ROOT par cet agent. Le rapport borné et les empreintes sont dans [wave6-ko-validation.json](../output/wave6-ko-validation.json) ; la suite finale complète reste à la coordination.
