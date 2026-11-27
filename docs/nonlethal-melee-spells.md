# Attaques de sorts de mêlée non létales — W9

Sources ciblées : PHB 2014, « Knocking a Creature Out » et « Spiritual Weapon », et fiche SRD épinglée `records['spells/spiritual-weapon']` dans `lib/srd/subclass-sources.json`. La distinction dépend du type réel d'attaque, pas du type de dégâts ni de la proximité du lanceur.

## Périmètre du catalogue actuel

**Arme spirituelle** est le seul sort actuellement implémenté qui effectue une attaque de sort de mêlée. Rayon de givre et Éclair traçant restent des attaques de sort à distance, même au contact. Les dégâts automatiques, zones, sauvegardes, soins et effets utilitaires ne deviennent pas des attaques de mêlée.

Ce lot ne crée aucun sort, aucun profil de créature, aucun parchemin ni accès de classe. Les sorts connus/préparés, équipements et composantes effectifs restent exigés ; un vrai parchemin suit son propre accès de classe et son cycle physique existant.

## Choix explicite pour chaque frappe

- **Frappe initiale** : `cast_spell` avec `spellId: "spiritual-weapon"`, la case de création `toCell`, l'unique `targetId` réel et `nonlethal: true`.
- **Parchemin possédé** : `use_spell_scroll` avec l'`itemId` exact, `toCell`, `targetId` et `nonlethal: true`. Le champ est au premier niveau, sans objet `spellArguments`. Le parchemin doit être réellement acquis, lisible et admissible ; aucun emplacement ou apprentissage permanent n'est accordé.
- **Frappe répétée** : `use_subclass_feature` avec `featureId: "spiritual_weapon"`, l'`effectId` réel, `targetId`, éventuellement `toCell` pour son déplacement autorisé, et `nonlethal: true`.

Le booléen ne devient jamais une préférence permanente de l'arme. Une autre frappe exige son propre choix. Sur une frappe admissible, l'absence du champ ou `false` conserve la résolution létale existante.

La présence du champ, même `false`, refuse sur un autre sort ou une autre capacité, une création sans attaque ou un déplacement seul. Le moteur valide le vrai lanceur joueur, la cible active, la source et la portée avant dés, coûts, création d'effet ou déplacement de l'arme. Pour `nonlethal: true`, il vérifie également l'immunité à l'inconscience et les dangers incompatibles avec un KO initial. Pour un choix KO, la cible doit être vivante et avoir des PV positifs. Une archive ne devient pas une cible à portée.

## Conséquences et coûts

La vraie attaque utilise ses dégâts de force et défenses habituels. Si elle réduit effectivement la cible à 0 PV avec le choix non létal, le même mécanisme de KO stable que les attaques physiques s'applique : identité réelle de la frappe, inconscience et prone, unique dé de récupération, cycle PNJ et XP sans doublon. Ni dégâts insuffisants, ni raté, ni chargement ne créent ce KO.

Le lancement ordinaire paie son emplacement et son action bonus. Le lancement par parchemin consomme le vrai parchemin et l'action bonus du sort, sans dépenser d'emplacement. Une frappe répétée utilise l'action bonus existante, sans nouvel emplacement ni action Attaquer. L'état sauvegardé conserve l'effet, les budgets et les témoins du KO ; il ne relance pas le dé de récupération. Voir [les attaques non létales](nonlethal-attacks.md), [le cycle PNJ](npc-death-saves.md) et [la récupération](nonlethal-recovery.md).

Le bonus d’attaque d’une Arme spirituelle créée depuis un vrai parchemin reste celui de sa source : **+5 pour le parchemin de niveau 2**, y compris lors des frappes répétées après sauvegarde. L’effet conserve le bonus et l’identifiant du parchemin consommé ; il ne réutilise pas le bonus d’attaque du personnage. Le modificateur de dégâts reste celui de l’aptitude du lecteur. Les incantations ordinaires gardent leur calcul existant.

## Limites conservées

Arme spirituelle se lance en une action bonus : elle ne peut pas être préparée avec Ready, qui exige ici une incantation d'une action. Le champ ne s'applique pas aux réponses à une réaction ni aux sorts préparés de W8.

Sa frappe directe existante ne propose pas de fenêtre Bardic/jet tenu ; W9 n'en crée pas une. Les continuations déjà présentes ailleurs restent inchangées. Ce constat provient de la lecture ciblée de `spiritualStrike` pendant le lot, sans nouvel audit.

Les anciens effets sans provenance de parchemin ne reçoivent aucun bonus reconstruit après coup. Les autres sorts de mêlée nécessitent leur véritable fiche et un résolveur activé au catalogue ; aucun pouvoir absent n'est ajouté implicitement. Les attaques non létales des monstres, les gardes de KO initial devant certains dégâts récurrents, les anciens KO sans dé de récupération et les limites de roster restent bornés comme auparavant.

## Validation

L’instantané r2 figé valide **97/97 ciblés**, **1 408/1 408 tests complets**, compilation MCP et TypeScript, puis **30/30 tours mock**, neuf scénarios et 97 appels pour **0 $**. Les **132 outils** et leurs trois nouveaux booléens optionnels sont vérifiés. Les **187 sources moteur, quatre configurations et 721 binaires actuels** correspondent à cette version en lecture seule, sans nouveau build ROOT.

Des changements concurrents d’application/export training/tests restent hors de cette attestation complète : la comparaison globale ROOT est explicitement fausse. Un contrôle séparé de compatibilité applicative passe **15/15 tests**, avec compilation privée et TypeScript ; il ne certifie pas toute l’application courante. Les anciennes preuves et le diagnostic +7 au lieu de +5 restent distincts, sans addition des comptes. Voir le [rapport permanent W9](rules-audit/validation-wave9-2026-11-01.json) et [le suivi MCP](suivi-integration-mcp.md). Aucun nouvel audit global.
