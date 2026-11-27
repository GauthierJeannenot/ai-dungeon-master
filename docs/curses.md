# Malédictions suivies par le moteur

Le moteur connaît deux sorts supplémentaires du
[SRD 5.1 de 2014](https://media.wizards.com/2023/downloads/dnd/SRD_CC_v5.1.pdf) :
Malédiction (*Bestow Curse*, p. 121) et Délivrance des malédictions
(*Remove Curse*, p. 174). Les réponses API 2014 figées, empreintes et pages
primaires sont dans `lib/srd/curse-spell-sources.json`. Aucun personnage ne
reçoit automatiquement ces sorts dans sa préparation ou son grimoire.

`cast_curse` délègue au même moteur que `cast_spell`. Connaissance/préparation,
emplacement réel, portée de toucher, trajet physique libre, action, concentration
et restrictions des sorts par tour restent obligatoires. L'IA choisit le sort,
la créature et la variante ; aucun message joueur n'est interprété côté serveur.
Un jet générique ne remplace jamais ce lancement. `inspect_curses` est une
lecture confidentielle des seuls effets suivis, sans diagnostic ni dissipation.

Malédiction impose un jet de sauvegarde de Sagesse. En cas d'échec, deux variantes
sources sont prises en charge : désavantage aux tests et sauvegardes d'une
caractéristique explicitement choisie, ou désavantage aux jets d'attaque contre
le lanceur uniquement. Les attaques contre d'autres cibles restent normales.
Les attaques de sort qui font réellement un jet sont également concernées.
Une sauvegarde réussie ne restitue ni emplacement ni action.

Au niveau 3, le sort exige la concentration et dure au plus une minute ; au
niveau 4, dix minutes. La fin de concentration et l'expiration suppriment les
effets liés. Un jet pouvant bénéficier d'Inspiration bardique peut être suspendu,
sauvegardé, rechargé puis terminé avec le même d20 et sans second paiement.
Les effets sont conservés dans `hero.effects` avec cible, lanceur, choix,
caractéristique éventuelle, niveau et groupe de concentration.

Délivrance des malédictions termine toutes les Malédictions suivies sur la
créature choisie, par un vrai lancement au toucher. Il ne nécessite pas de
sélectionner arbitrairement un seul effet. Lancer ce sort sur une créature sans
effet suivi consomme néanmoins le lancement ; cela n'invente pas une malédiction.

Limites : niveaux 3 et 4 de Malédiction uniquement ; variantes perte d'action,
dégâts nécrotiques supplémentaires et malédiction créative non implémentées.
Pas de catalogue d'objets maudits : ni purification d'un objet, ni suppression
gratuite d'harmonisation, ni malédiction narrative sans état mécanique. Les PNJ
narratifs non combattants ne sont pas des cibles de ce lot. Les niveaux
supérieurs et leurs durées sans concentration restent explicitement refusés.
