# Opportunités et attaques préparées non létales — W8

Source ciblée : PHB 2014, « Knocking a Creature Out », « Opportunity Attacks » et « Ready », dans `rules/books/phb-2014.md`. Ce lot complète [les attaques non létales](nonlethal-attacks.md) ; il ne crée aucun nouvel outil, déclencheur ou profil de créature.

## Opportunité réelle

Le moteur propose un `pendingReaction` lorsque le déplacement réel d'un adversaire quitte la portée. Le modèle choisit explicitement `resolve_reaction` avec son `pendingId`, `choice: "opportunity_attack"`, l'arme exacte dans `weaponOrSpell` et, pour assommer, `nonlethal: true`.

Le champ est réservé à cette opportunité du joueur : attaque physique de mêlée, arme réellement tenue ou attaque à mains nues, cible active vivante avec des PV positifs. Les immunités et dangers incompatibles avec un KO initial restent prévalidés. Un refus ne supprime pas la réaction suspendue et ne consomme ni dé ni coût. Sans champ, ou avec `false` dans cet appel valide, les règles létales habituelles restent appliquées.

Si l'impact produit un vrai KO, le corps reste sur la case qu'il occupait avant le pas interrompu. La continuation du déplacement constate son incapacité ; elle ne déplace pas le corps. Un raté ou des dégâts insuffisants laissent la même demande de déplacement reprendre selon ses règles.

## Attaque préparée

`combat_action` prépare normalement l'attaque, son arme tenue et son déclencheur perceptible. Le choix non létal se fait à la libération, dans `resolve_readied_action` avec `readyId`, `choice: "execute"`, `triggerObserved`, `targetId` exact et `nonlethal: true`. Il n'existe aucun champ `readied.nonlethal` dans la préparation.

Le moteur utilise l'instance d'arme enregistrée, qui doit toujours être tenue. Il résout une seule attaque avec une réaction ; la préparation a déjà consommé son action. Ce choix n'accorde aucune Attaque supplémentaire, action Attaquer ou éligibilité à une attaque bonus à deux armes.

Le champ `nonlethal` est refusé sur `ignore`, sur un déplacement ou sur un sort préparé, même s'il vaut `false`. Les tirs, lancers et sorts de mêlée ne deviennent pas admissibles au KO. La présence d'une cible dans une autre carte ne lui donne aucune portée.

## Dés tenus, persistance et conséquences

Si la vraie attaque ouvre une fenêtre d'Inspiration ou une autre résolution suspendue, sa commande conserve le choix non létal, l'arme, la cible et le témoin de l'attaque. Une réponse ultérieure à ce dé tenu choisit seulement la réaction offerte ; fournir à nouveau `nonlethal`, même `false`, refuse au lieu de changer l'attaque après son jet. La reprise réutilise les dés tenus.

Le vrai passage à 0 PV produit le même KO stable et son unique dé de récupération que les attaques ordinaires. Les défenses, effets qui laissent réellement 1 PV, coûts, soins, dégâts ultérieurs, décès et XP restent ceux des mécanismes existants. Voir [le cycle des PNJ](npc-death-saves.md) et [la récupération stable](nonlethal-recovery.md).

Les attaques en réaction conservent leur borne préexistante : leur cible doit avoir des PV positifs, même sans choix KO ou avec `false`. Le traitement W7 des dégâts ordinaires vers une cible suivie à 0 PV ne leur est pas étendu. La tranche [W9](nonlethal-melee-spells.md) prolonge Arme spirituelle en attaque de sort de mêlée ; son lancement bonus ne devient pas une préparation admissible. Les attaques non létales des monstres restent hors périmètre. Aucun texte du joueur n'est interprété par un déclencheur serveur : le modèle sélectionne les outils et leurs arguments.

## Validation

La copie finale figée passe **72/72 ciblés combinés**, puis **1 365/1 365 tests**, compilation et TypeScript complets sortie 0. Le playtest valide **30/30 tours**, neuf scénarios et 97 appels mock pour **0 $**. Les **132 outils** et les deux booléens optionnels sont vérifiés ; le moteur partagé correspond aux **721 binaires** privés validés. Les preuves isolées A/B/C et leurs corrections de fixtures restent distinctes, sans addition. Voir le [rapport permanent W8](rules-audit/validation-wave8-2026-11-01.json) et [le suivi MCP](suivi-integration-mcp.md). Aucun nouvel audit global.
